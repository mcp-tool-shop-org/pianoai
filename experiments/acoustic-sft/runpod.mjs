#!/usr/bin/env node
// ─── RunPod deploy / poll / teardown for the acoustic LoRA ───────────────────
//
// Every rule encoded here was paid for. The studio memory behind it
// (runpod-training-operations) records ten pods terminated over a client-side
// field-name error, four more over an image tag that did not exist, and a pod
// left billing after a poller was interrupted. So:
//
//   1. BASE IS rest.runpod.io/v1. The v2 surface is retired. There is no GPU
//      catalog endpoint any more, so price and availability CANNOT be checked
//      before deploying — hence the fallback chain and the cost read-back.
//   2. SSH LIVES ON `portMappings` + `publicIp`, on the pod object itself.
//      `runtime.ports[]` is the retired v2 shape: it reads null forever on a
//      perfectly healthy pod, which is what cost the ten pods.
//   3. VERIFY THE IMAGE TAG FIRST. A nonexistent tag reports RUNNING with no
//      ports — byte-for-byte identical to a dead host. This script checks
//      Docker Hub before it spends anything.
//   4. cloudType DEFAULTS TO SECURE. Community is the cheap tier and must be
//      passed explicitly.
//   5. NEVER a network volume. `volumeInGb` is pod-local and dies with the pod;
//      the console's "automatically create" network volume keeps billing after
//      the pod is gone.
//   6. TEARDOWN ON EVERY EXIT PATH, and say what is still billing.
//
// Detection order, each populating strictly after the previous:
//   publicIp -> portMappings -> ssh answers.   Give it 15 minutes.
//
// Usage:
//   node runpod.mjs verify                 # read-only preflight, spends nothing
//   node runpod.mjs up                     # deploy + poll to SSH-ready
//   node runpod.mjs sync                   # push data + scripts to the pod
//   node runpod.mjs fetch                  # pull the trained adapters back
//   node runpod.mjs list                   # what is running (and billing)
//   node runpod.mjs down <podId|--all>     # the compensator
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://rest.runpod.io/v1";
const KEY = process.env.RUNPOD_API_KEY;

// Verified on Docker Hub 2026-09-08: real, 16.16 GB, CUDA 12.9 + torch 2.8,
// which is what Blackwell (sm_120) needs. Do not change without re-verifying.
const IMAGE = "runpod/pytorch:1.1.0-cu1290-torch280-ubuntu2404";

// A fallback chain, because there is no catalog to check stock against and
// capacity moves. All three are RTX PRO 6000 Blackwell, 96 GB. Exact strings,
// confirmed against the live OpenAPI enum.
const GPU_CHAIN = [
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
];

const PUBKEY_PATH = join(homedir(), ".ssh", "runpod_rustline.pub");
const STATE_PATH = join(homedir(), ".ssh", "runpod_acoustic_pod.json");

const POLL_TIMEOUT_MS = 15 * 60_000; // memory: give a pod 10-15 min, do not judge early
const POLL_INTERVAL_MS = 15_000;

function need(cond, msg) {
  if (!cond) {
    console.error(`ERROR: ${msg}`);
    process.exit(1);
  }
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    // A create against an exhausted tier returns 500 "no instances currently
    // available" — that is the availability signal now that the catalog is gone.
    const detail = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`${options.method || "GET"} ${path} -> ${res.status} ${detail}`);
  }
  return body;
}

async function verifyImageTag() {
  const [repo, tag] = IMAGE.split(":");
  const url = `https://hub.docker.com/v2/repositories/${repo}/tags/${tag}`;
  const res = await fetch(url);
  if (!res.ok) return { ok: false, detail: `HTTP ${res.status}` };
  const d = await res.json();
  return { ok: true, size: (d.full_size / 1e9).toFixed(2), updated: (d.last_updated || "").slice(0, 10) };
}

async function cmdVerify() {
  console.log("RunPod preflight — read-only, spends nothing\n");

  need(KEY, "RUNPOD_API_KEY is not set in this shell.");
  console.log(`  api key            present (${KEY.length} chars, never printed)`);

  const pods = await api("/pods");
  const running = Array.isArray(pods) ? pods : [];
  console.log(`  api reachable      yes, ${BASE}`);
  console.log(`  pods running now   ${running.length}${running.length ? "  <-- THESE ARE BILLING" : ""}`);
  for (const p of running) {
    console.log(`      ${p.id}  ${p.name}  $${p.costPerHr}/hr  ${p.desiredStatus}`);
  }

  const img = await verifyImageTag();
  console.log(`  image tag          ${img.ok ? `EXISTS (${img.size} GB, updated ${img.updated})` : `MISSING — ${img.detail}`}`);
  need(img.ok, "the image tag does not exist. A bad tag looks exactly like a dead host; fix before deploying.");

  const hasKey = existsSync(PUBKEY_PATH);
  console.log(`  ssh public key     ${hasKey ? `found at ${PUBKEY_PATH}` : `MISSING at ${PUBKEY_PATH}`}`);
  need(hasKey, "no public key to inject; the pod would boot with no way in.");

  console.log(`  gpu fallback chain ${GPU_CHAIN.length} RTX PRO 6000 Blackwell variants`);
  console.log(`  cloud tier         COMMUNITY (explicit — the API default is SECURE and dearer)`);
  console.log(`  volume             pod-local, dies with the pod (never a network volume)`);
  console.log("\nPreflight OK. `node runpod.mjs up` will spend money.");
}

async function cmdUp() {
  need(KEY, "RUNPOD_API_KEY is not set.");
  const img = await verifyImageTag();
  need(img.ok, `image tag ${IMAGE} does not exist on Docker Hub. Refusing to deploy.`);
  need(existsSync(PUBKEY_PATH), `no public key at ${PUBKEY_PATH}`);
  const publicKey = readFileSync(PUBKEY_PATH, "utf8").trim();

  console.log(`Deploying: ${IMAGE}`);
  console.log(`GPU chain: ${GPU_CHAIN.join(" | ")}`);

  let pod;
  try {
    pod = await api("/pods", {
      method: "POST",
      body: JSON.stringify({
        name: "acoustic-sft",
        imageName: IMAGE,
        gpuTypeIds: GPU_CHAIN,     // array = native fallback chain
        gpuCount: 1,
        cloudType: "COMMUNITY",    // explicit: the default is SECURE
        containerDiskInGb: 60,     // 16 GB image + a 3B model + room
        volumeInGb: 40,            // pod-local; NOT a network volume
        volumeMountPath: "/workspace",
        ports: ["22/tcp"],
        supportPublicIp: true,
        env: { PUBLIC_KEY: publicKey },
      }),
    });
  } catch (err) {
    console.error(`\nDeploy failed: ${err.message}`);
    if (/no instances currently available/i.test(err.message)) {
      console.error("That is the availability signal — every GPU in the chain is out of stock.");
      console.error("Retry later, or widen GPU_CHAIN.");
    }
    process.exit(1);
  }

  const id = pod.id;
  writeFileSync(STATE_PATH, JSON.stringify({ id, created: new Date().toISOString() }, null, 2));
  console.log(`\nPod ${id} created at $${pod.costPerHr}/hr. State written to ${STATE_PATH}`);
  console.log(`TEARDOWN IF ANYTHING GOES WRONG:  node runpod.mjs down ${id}\n`);

  const started = Date.now();
  let sawIp = false;
  try {
    while (Date.now() - started < POLL_TIMEOUT_MS) {
      const p = await api(`/pods/${id}`);
      const mins = ((Date.now() - started) / 60000).toFixed(1);

      // Detection order: publicIp populates FIRST, then portMappings. There is
      // no uptime field to wait on — polling for one returns null forever.
      if (p.publicIp && !sawIp) {
        sawIp = true;
        console.log(`[${mins}m] publicIp ${p.publicIp}`);
      }
      const sshPort = p.portMappings?.["22"];
      if (p.publicIp && sshPort) {
        console.log(`[${mins}m] SSH READY\n`);
        console.log(`   ssh root@${p.publicIp} -p ${sshPort} -i ${PUBKEY_PATH.replace(/\.pub$/, "")}`);
        console.log(`\n   still billing at $${p.costPerHr}/hr — tear down with: node runpod.mjs down ${id}`);
        writeFileSync(STATE_PATH, JSON.stringify(
          { id, publicIp: p.publicIp, sshPort, costPerHr: p.costPerHr }, null, 2));
        return;
      }
      if (!sawIp) console.log(`[${mins}m] waiting for publicIp...`);
      else console.log(`[${mins}m] have IP, waiting for portMappings...`);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    console.error(`\nNo SSH after ${POLL_TIMEOUT_MS / 60000} min.`);
    console.error(`The image tag is verified, so this implicates the host. Confirm against the`);
    console.error(`web console before terminating — the poller has been wrong before.`);
    console.error(`Pod ${id} IS STILL BILLING.  node runpod.mjs down ${id}`);
    process.exit(1);
  } catch (err) {
    console.error(`\nPolling failed: ${err.message}`);
    console.error(`Pod ${id} MAY STILL BE BILLING.  node runpod.mjs down ${id}`);
    process.exit(1);
  }
}

async function cmdList() {
  const pods = await api("/pods");
  const arr = Array.isArray(pods) ? pods : [];
  if (!arr.length) {
    console.log("No pods. Nothing is billing.");
    return;
  }
  console.log(`${arr.length} pod(s) — ALL BILLING:`);
  let total = 0;
  for (const p of arr) {
    total += p.costPerHr || 0;
    const ssh = p.publicIp && p.portMappings?.["22"]
      ? `ssh root@${p.publicIp} -p ${p.portMappings["22"]}`
      : "(no ssh yet)";
    console.log(`  ${p.id}  ${p.name}  $${p.costPerHr}/hr  ${p.desiredStatus}  ${ssh}`);
  }
  console.log(`\n  total $${total.toFixed(3)}/hr`);
}

async function cmdDown(arg) {
  need(arg, "which pod? Pass an id, or --all.");
  let ids = [arg];
  if (arg === "--all") {
    const pods = await api("/pods");
    ids = (Array.isArray(pods) ? pods : []).map((p) => p.id);
    if (!ids.length) { console.log("No pods to tear down."); return; }
  }
  for (const id of ids) {
    await api(`/pods/${id}`, { method: "DELETE" });
    console.log(`terminated ${id}`);
  }
  const left = await api("/pods");
  const n = Array.isArray(left) ? left.length : 0;
  console.log(n ? `\nWARNING: ${n} pod(s) STILL BILLING.` : "\nNothing is billing.");
}

// ─── sync / fetch ────────────────────────────────────────────────────────────
//
// The pod is billing while you assemble the run by hand, so assembling it by
// hand is the wrong shape. These two read the endpoint the deploy already wrote
// and move exactly the files the bootstrap expects, nothing else.
//
// Deliberately NOT the whole repo: the pod needs 72 training examples, a tool
// catalog, a config and two scripts. Rsyncing a repo with node_modules and a
// 115-file dataset onto a billing host is minutes of transfer for nothing.

const WORK = "/workspace/acoustic-sft";

function endpoint() {
  need(existsSync(STATE_PATH), `no pod state at ${STATE_PATH}. Run \`up\` first.`);
  const s = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  need(s.publicIp && s.sshPort, "pod state has no SSH endpoint yet — the deploy did not reach SSH-ready.");
  return s;
}

function sh(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit" });
  if (r.error) throw new Error(`${cmd} failed to start: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} exited ${r.status}`);
}

/** The files the pod actually needs, as [localPath, remoteRelativePath]. */
function payload() {
  const exp = dirname(fileURLToPath(import.meta.url));
  const repo = join(exp, "..", "..");
  return [
    [join(exp, "data", "sft-train.jsonl"), "data/sft-train.jsonl"],
    [join(exp, "data", "sft-test.jsonl"), "data/sft-test.jsonl"],
    [join(exp, "lora-config.json"), "lora-config.json"],
    [join(exp, "scripts", "train_acoustic_sft.py"), "scripts/train_acoustic_sft.py"],
    [join(exp, "scripts", "pod-bootstrap.sh"), "scripts/pod-bootstrap.sh"],
    [join(repo, "src", "dataset", "tool-schemas.json"), "tool-schemas.json"],
  ];
}

async function cmdSync() {
  const { publicIp, sshPort } = endpoint();
  const key = PUBKEY_PATH.replace(/\.pub$/, "");
  const files = payload();

  for (const [local] of files) {
    need(existsSync(local), `missing locally: ${local}`);
  }

  const sshArgs = ["-p", String(sshPort), "-i", key, "-o", "StrictHostKeyChecking=accept-new"];
  console.log(`Syncing ${files.length} files to ${publicIp}:${WORK}`);
  sh("ssh", [...sshArgs, `root@${publicIp}`, `mkdir -p ${WORK}/data ${WORK}/scripts ${WORK}/runs`]);

  for (const [local, remote] of files) {
    sh("scp", ["-P", String(sshPort), "-i", key, "-o", "StrictHostKeyChecking=accept-new",
      local, `root@${publicIp}:${WORK}/${remote}`]);
    console.log(`  ${remote}`);
  }

  console.log(`\nOn the pod, cheapest check first:`);
  console.log(`  ssh root@${publicIp} -p ${sshPort} -i ${key}`);
  console.log(`  bash ${WORK}/scripts/pod-bootstrap.sh dry`);
}

async function cmdFetch() {
  const { publicIp, sshPort } = endpoint();
  const key = PUBKEY_PATH.replace(/\.pub$/, "");
  const exp = dirname(fileURLToPath(import.meta.url));
  const dest = join(exp, "runs");
  mkdirSync(dest, { recursive: true });

  console.log(`Pulling ${WORK}/runs -> ${dest}`);
  sh("scp", ["-r", "-P", String(sshPort), "-i", key, "-o", "StrictHostKeyChecking=accept-new",
    `root@${publicIp}:${WORK}/runs/.`, dest]);
  console.log(`\nAdapters are local. The pod is STILL BILLING — tear it down now:`);
  console.log(`  node runpod.mjs down --all`);
}

const [cmd, arg] = process.argv.slice(2);
const table = { verify: cmdVerify, up: cmdUp, sync: cmdSync, fetch: cmdFetch, list: cmdList, down: () => cmdDown(arg) };
if (!table[cmd]) {
  console.log("usage: node runpod.mjs <verify|up|sync|fetch|list|down <podId|--all>>");
  process.exit(1);
}
table[cmd]().catch((err) => {
  console.error(`\n${err.message}`);
  console.error("If a pod was created before this failed, it is BILLING. Run: node runpod.mjs list");
  process.exit(1);
});
