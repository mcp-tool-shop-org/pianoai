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
//   node runpod.mjs down [podId]           # the pod in the state file, or an explicit id. Nothing else.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://rest.runpod.io/v1";
const KEY = process.env.RUNPOD_API_KEY;

// Verified on Docker Hub 2026-09-08: real, 16.16 GB, CUDA 12.9 + torch 2.8,
// which is what Blackwell (sm_120) needs. Do not change without re-verifying.
const IMAGE = "runpod/pytorch:1.1.0-cu1290-torch280-ubuntu2404";

// A fallback chain, because there is no catalog to check stock against and
// capacity moves. Exact strings, all present in the live OpenAPI enum at
// GET /v1/openapi.json (45 ids) — that spec is the only way left to confirm a
// name, since the gputypes endpoint is retired and answers 400.
//
// This used to be three entries that were all RTX PRO 6000 Blackwell. That is
// one card spelled three ways, not a fallback chain: on 2026-09-08 every entry
// was out of stock at once and the deploy returned
// "There are no instances currently available" — which is exactly the case a
// chain is supposed to survive.
//
// So it now widens by generation. The Blackwell 96 GB cards stay first because
// they are what was asked for; everything after is a real alternative.
//
// The job does not need 96 GB. A 3B model in bf16 with LoRA, gradient
// checkpointing and chunked cross-entropy is roughly 15-25 GB at 16k context,
// so a 48 GB card is comfortable. The image is CUDA 12.9, which Blackwell
// (sm_120) requires and every older card here accepts.
// RUNPOD_GPU pins a single type, to move pools when a host is broken. On
// 2026-09-08 three consecutive L40S deploys landed on the same host
// (60.249.37.148), each handing the container a non-zero device node
// (/dev/nvidia4, /dev/nvidia1) with torch.cuda.is_available() false while
// nvidia-smi worked. The image and config were the same ones that had trained
// cleanly hours earlier, so that implicates the host, and the only lever the
// API gives you is which GPU type to ask for.
const PINNED = process.env.RUNPOD_GPU;

const GPU_CHAIN = PINNED ? [PINNED] : [
  // What was asked for: RTX PRO 6000 Blackwell, 96 GB.
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
  // Still an RTX 6000, previous generation, 48 GB.
  "NVIDIA RTX 6000 Ada Generation",
  // 48 GB alternatives.
  "NVIDIA L40S",
  "NVIDIA RTX A6000",
  "NVIDIA L40",
  // Data-centre parts, dearer but usually in stock.
  "NVIDIA A100 80GB PCIe",
  "NVIDIA H100 PCIe",
];

// COMMUNITY is the cheap tier and the default here. Set RUNPOD_CLOUD_TYPE=SECURE
// to try the other pool when community is out of stock everywhere.
const CLOUD_TYPE = process.env.RUNPOD_CLOUD_TYPE === "SECURE" ? "SECURE" : "COMMUNITY";

const PUBKEY_PATH = join(homedir(), ".ssh", "runpod_rustline.pub");
const STATE_PATH = join(homedir(), ".ssh", "runpod_acoustic_pod.json");

/** Directory name is the experiment; override with RUNPOD_EXPERIMENT. */
export function experimentName() {
  return process.env.RUNPOD_EXPERIMENT
    ?? dirname(fileURLToPath(import.meta.url)).split(/[/\\]/).filter(Boolean).at(-1)
    ?? "acoustic-sft";
}

/** ${experiment}-${YYYYMMDD-HHMM} — five pods named acoustic-sft is how listings stop meaning anything. */
export function podSessionName(now = new Date(), experiment = experimentName()) {
  const p = (n) => String(n).padStart(2, "0");
  const tag = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
  return `${experiment}-${tag}`;
}

/**
 * One pod. `--all` is not a mode. No arg means the state file. Explicit id
 * is accepted. Missing state file with no id is a refusal, not a listing.
 */
export function resolveDownTarget(arg, state) {
  if (arg === "--all") {
    throw new Error(
      "--all is not a recognised argument. down terminates one pod: the id in the state file, or an explicit id.",
    );
  }
  if (arg) return arg;
  if (!state?.id) {
    throw new Error(
      "no pod state file (or it has no id). down refuses to guess. Pass an explicit id, or run up first.",
    );
  }
  return state.id;
}

/** Pods this tool did not create: not our session-named pods and not the state-file id. */
export function foreignPods(pods, { experiment, oursId }) {
  const prefix = `${experiment}-`;
  return (Array.isArray(pods) ? pods : []).filter((p) => {
    if (oursId && p.id === oursId) return false;
    const n = String(p.name || "");
    if (n.startsWith(prefix)) return false;
    return true;
  });
}

export function receipt(id, at = new Date()) {
  return { terminated_id: id, terminated_at: at.toISOString() };
}

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

  console.log(`  gpu fallback chain ${GPU_CHAIN.length} types, ${GPU_CHAIN[0]} first`);
  console.log(`  cloud tier         ${CLOUD_TYPE} (explicit — the API default is SECURE and dearer)`);
  console.log(`  volume             pod-local, dies with the pod (never a network volume)`);

  const experiment = experimentName();
  const oursId = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")).id : undefined;
  const foreign = foreignPods(running, { experiment, oursId });
  if (foreign.length && process.env.RUNPOD_ALLOW_OTHERS !== "1") {
    console.error(`\nERROR: ${foreign.length} pod(s) not created by this tool are running:`);
    for (const p of foreign) console.error(`      ${p.id}  ${p.name}`);
    console.error("Refusing to deploy. Set RUNPOD_ALLOW_OTHERS=1 to override.");
    process.exit(1);
  }
  if (foreign.length) {
    console.log(`  foreign pods       ${foreign.length} (RUNPOD_ALLOW_OTHERS=1, deploy allowed)`);
  }

  console.log("\nPreflight OK. `node runpod.mjs up` will spend money.");
}

/**
 * Create threw (often 500 "no instances available") but RunPod may still have
 * created the pod. List; if a session-named pod is present, adopt it into the
 * state file and continue, or tear it down by id — never leave it billing.
 */
export async function handleCreateError(err, {
  experiment,
  sessionName,
  api,
  adopt = false,
  writeState,
  log = (s) => { console.error(s); },
  now = () => new Date(),
}) {
  log(`Deploy failed: ${err.message}`);
  let listed;
  try {
    listed = await api("/pods");
  } catch (listErr) {
    log(`list after create error also failed: ${listErr.message}`);
    if (/no instances currently available/i.test(err.message)) {
      log("That is the availability signal — every GPU in the chain is out of stock.");
      log("Retry later, or widen GPU_CHAIN.");
    }
    return null;
  }
  const arr = Array.isArray(listed) ? listed : [];
  const prefix = `${experiment}-`;
  const orphan = arr.find((p) => p.name === sessionName)
    ?? arr.find((p) => String(p.name || "").startsWith(prefix));
  if (!orphan) {
    if (/no instances currently available/i.test(err.message)) {
      log("That is the availability signal — every GPU in the chain is out of stock.");
      log("Retry later, or widen GPU_CHAIN.");
    }
    return null;
  }
  log(`create threw but pod ${orphan.id} (${orphan.name}) is listed`);
  if (adopt) {
    writeState({ id: orphan.id, created: now().toISOString(), adopted: true, name: orphan.name });
    log(`adopted ${orphan.id} into the state file — continuing`);
    return orphan;
  }
  await api(`/pods/${orphan.id}`, { method: "DELETE" });
  log(`tore down orphan ${orphan.id} (${orphan.name}) after create error — never left billing`);
  return null;
}

async function cmdUp() {
  need(KEY, "RUNPOD_API_KEY is not set.");
  const img = await verifyImageTag();
  need(img.ok, `image tag ${IMAGE} does not exist on Docker Hub. Refusing to deploy.`);
  need(existsSync(PUBKEY_PATH), `no public key at ${PUBKEY_PATH}`);
  const publicKey = readFileSync(PUBKEY_PATH, "utf8").trim();

  const running = await api("/pods");
  const experiment = experimentName();
  const oursId = existsSync(STATE_PATH) ? JSON.parse(readFileSync(STATE_PATH, "utf8")).id : undefined;
  const foreign = foreignPods(Array.isArray(running) ? running : [], { experiment, oursId });
  if (foreign.length && process.env.RUNPOD_ALLOW_OTHERS !== "1") {
    console.error(`ERROR: ${foreign.length} pod(s) not created by this tool are running. Refusing to deploy.`);
    for (const p of foreign) console.error(`      ${p.id}  ${p.name}`);
    process.exit(1);
  }

  const name = podSessionName();
  console.log(`Deploying: ${IMAGE}`);
  console.log(`name:      ${name}`);
  console.log(`GPU chain: ${GPU_CHAIN.join(" | ")}`);

  let pod;
  try {
    pod = await api("/pods", {
      method: "POST",
      body: JSON.stringify({
        name,
        imageName: IMAGE,
        gpuTypeIds: GPU_CHAIN,     // array = native fallback chain
        gpuCount: 1,
        cloudType: CLOUD_TYPE,     // explicit: the API default is SECURE
        containerDiskInGb: 60,     // 16 GB image + a 3B model + room
        volumeInGb: 40,            // pod-local; NOT a network volume
        volumeMountPath: "/workspace",
        ports: ["22/tcp"],
        supportPublicIp: true,
        env: { PUBLIC_KEY: publicKey },
      }),
    });
  } catch (err) {
    const recovered = await handleCreateError(err, {
      experiment,
      sessionName: name,
      api,
      adopt: process.env.RUNPOD_ADOPT_ORPHAN === "1",
      writeState: (s) => writeFileSync(STATE_PATH, JSON.stringify(s, null, 2)),
    });
    if (!recovered) process.exit(1);
    pod = recovered;
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

export async function terminateOne(id, apiFn, io = {
  log: (s) => { console.log(s); console.error(s); },
  now: () => new Date(),
  statePath: STATE_PATH,
  existsSync,
  readFileSync,
  writeFileSync,
}) {
  await apiFn(`/pods/${id}`, { method: "DELETE" });
  const line = `terminated ${id}`;
  io.log(line);
  let prev = {};
  if (io.existsSync(io.statePath)) {
    try { prev = JSON.parse(io.readFileSync(io.statePath, "utf8")); } catch { prev = {}; }
  }
  const rec = receipt(id, io.now());
  io.writeFileSync(io.statePath, JSON.stringify({ ...prev, ...rec }, null, 2));
  return rec;
}

async function cmdDown(arg) {
  let id;
  try {
    const state = existsSync(STATE_PATH)
      ? JSON.parse(readFileSync(STATE_PATH, "utf8"))
      : null;
    id = resolveDownTarget(arg, state);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(1);
  }
  await terminateOne(id, api);
  const left = await api("/pods");
  const n = Array.isArray(left) ? left.length : 0;
  const leftover = n ? `\nWARNING: ${n} pod(s) STILL BILLING.` : "\nNothing is billing.";
  console.log(leftover);
  console.error(leftover.trim());
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
    [join(exp, "scripts", "predict_acoustic.py"), "scripts/predict_acoustic.py"],
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
  console.log(`  node runpod.mjs down`);
}

const invokedAsCli = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (invokedAsCli) {
  const [cmd, arg] = process.argv.slice(2);
  const table = { verify: cmdVerify, up: cmdUp, sync: cmdSync, fetch: cmdFetch, list: cmdList, down: () => cmdDown(arg) };
  if (!table[cmd]) {
    console.log("usage: node runpod.mjs <verify|up|sync|fetch|list|down [podId]>");
    process.exit(1);
  }
  table[cmd]().catch((err) => {
    console.error(`\n${err.message}`);
    console.error("If a pod was created before this failed, it is BILLING. Run: node runpod.mjs list");
    process.exit(1);
  });
}
