#!/usr/bin/env node
// ─── run-b1-evals.mjs — Finetune Arc v2 (B-1) sequential sealed-eval runner ──
//
// P0-LOCK.md §5. Runs the pre-run gate, then exactly six sealed evaluations
// (baseline first, then the five frozen v1 seeds ascending), one at a time,
// abort-on-first-failure. One eval per model: a completed results file is
// never regenerated (crash-resume within a run rides the harness's own
// checkpoint file). All flags byte-pinned per the lock.
//
// Usage:  node experiments/finetune-arc-v2/scripts/run-b1-evals.mjs
// Exit 0 when all six artifacts exist and are complete; 1 on any gate or
// run failure (ANDON — fix or amend the lock, never patch silently).
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import {
  appendFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const V2_DIR = join(REPO_ROOT, "experiments", "finetune-arc-v2");
const EVALS_DIR = join(V2_DIR, "evals");
const LOG_PATH = join(EVALS_DIR, "b1-run.log");
const GATE_RECEIPT = join(EVALS_DIR, "b1-prerun-gate.json");
const P4_RECEIPT = join(REPO_ROOT, "experiments", "finetune-arc-v1", "artifacts", "p4-receipt.json");
const ARTIFACT_ROOT = join(REPO_ROOT, "experiments", "finetune-arc-v1", "artifacts");

const MODELS = [
  { label: "baseline", tag: "qwen2.5:7b" },
  { label: "seed13", tag: "jam-ft-v1-qwen25:seed13" },
  { label: "seed42", tag: "jam-ft-v1-qwen25:seed42" },
  { label: "seed271", tag: "jam-ft-v1-qwen25:seed271" },
  { label: "seed512", tag: "jam-ft-v1-qwen25:seed512" },
  { label: "seed1024", tag: "jam-ft-v1-qwen25:seed1024" },
];

mkdirSync(EVALS_DIR, { recursive: true });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG_PATH, line + "\n", "utf8");
}

function fail(msg) {
  log(`ANDON: ${msg}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: REPO_ROOT, shell: true, encoding: "utf8", ...opts });
}

// Streaming — the GGUF artifacts are ~4.7 GB and readFileSync caps at 2 GiB.
async function sha256File(path) {
  const h = createHash("sha256");
  await new Promise((resolve, reject) => {
    const s = createReadStream(path);
    s.on("data", (chunk) => h.update(chunk));
    s.on("end", resolve);
    s.on("error", reject);
  });
  return h.digest("hex");
}

function findArtifact(name) {
  const hits = [];
  for (const sub of readdirSync(ARTIFACT_ROOT)) {
    const dir = join(ARTIFACT_ROOT, sub);
    if (!statSync(dir).isDirectory()) continue;
    const cand = join(dir, name);
    if (existsSync(cand)) hits.push(cand);
  }
  if (existsSync(join(ARTIFACT_ROOT, name))) hits.push(join(ARTIFACT_ROOT, name));
  return hits;
}

// ─── Pre-run gate (P0-LOCK §5) ────────────────────────────────────────────────

log("=== B-1 pre-run gate ===");

// (v) Lock committed and unmodified BEFORE any model call.
const lockLog = run("git", ["log", "--oneline", "-1", "--", "experiments/finetune-arc-v2/P0-LOCK.md"]);
if (!lockLog.stdout.trim()) fail("P0-LOCK.md is not committed — commit the lock before any model call");
const lockDirty = run("git", ["status", "--porcelain", "--", "experiments/finetune-arc-v2/P0-LOCK.md"]);
if (lockDirty.stdout.trim()) fail("P0-LOCK.md has uncommitted modifications");
log(`lock committed at: ${lockLog.stdout.trim()}`);

// (i) Package checksums.
const ck = run("pnpm", ["exec", "tsx", "scripts/verify-public-package-checksums.ts"]);
if (ck.status !== 0) fail("package checksum verification failed");
log("package checksums: PASS");

// (ii) Cohort derivation ↔ harness const equality.
const cv = run("pnpm", [
  "exec", "tsx", "experiments/finetune-arc-v2/scripts/derive-b1-cohort.ts", "--verify",
]);
if (cv.status !== 0) fail(`cohort verify failed:\n${cv.stdout}\n${cv.stderr}`);
log("cohort derivation ↔ harness const: PASS");

// (iii) Frozen GGUF artifacts match p4-receipt shas.
const p4 = JSON.parse(readFileSync(P4_RECEIPT, "utf8"));
const artifactEvidence = [];
for (const m of p4.models) {
  const hits = findArtifact(m.gguf);
  if (hits.length !== 1) fail(`expected exactly 1 on-disk artifact for ${m.gguf}, found ${hits.length}`);
  const sha = await sha256File(hits[0]);
  if (sha !== m.gguf_sha256) fail(`sha mismatch for ${m.gguf}: disk ${sha} != receipt ${m.gguf_sha256}`);
  artifactEvidence.push({ tag: m.name, gguf: m.gguf, path: hits[0].replace(REPO_ROOT, "."), sha256: sha });
  log(`frozen artifact OK: ${m.name} (${m.gguf.slice(0, 40)}…) sha matches p4-receipt`);
}

// (iv) All six ollama tags resolvable; capture modelfile evidence.
const tagEvidence = [];
for (const m of MODELS) {
  const show = run("ollama", ["show", m.tag, "--modelfile"]);
  if (show.status !== 0) fail(`ollama tag not resolvable: ${m.tag}\n${show.stderr}`);
  tagEvidence.push({ tag: m.tag, modelfile_head: show.stdout.split("\n").slice(0, 6).join("\n") });
  log(`ollama tag OK: ${m.tag}`);
}

writeFileSync(
  GATE_RECEIPT,
  JSON.stringify(
    {
      schema: "finetune-arc-v2-b1-prerun-gate/1.0.0",
      generated_at: new Date().toISOString(),
      lock_commit: lockLog.stdout.trim(),
      package_checksums: "PASS",
      cohort_verify: "PASS",
      frozen_artifacts: artifactEvidence,
      ollama_tags: tagEvidence,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);
log(`pre-run gate receipt -> ${GATE_RECEIPT}`);

// ─── Sequential sealed runs ───────────────────────────────────────────────────

function isComplete(resultsPath) {
  if (!existsSync(resultsPath)) return false;
  try {
    const j = JSON.parse(readFileSync(resultsPath, "utf8"));
    return Boolean(j.results && (j.results["e3-tool"] || j.results.e3));
  } catch {
    return false;
  }
}

for (const m of MODELS) {
  const out = join(EVALS_DIR, `b1-${m.label}-results.json`);
  const sample = join(EVALS_DIR, `b1-${m.label}-sample.json`);
  if (isComplete(out)) {
    log(`SKIP ${m.label} (${m.tag}) — completed results artifact already exists (one eval per model)`);
    continue;
  }
  log(`=== sealed eval: ${m.tag} -> b1-${m.label}-results.json ===`);
  const t0 = Date.now();
  const r = spawnSync(
    "pnpm",
    [
      "exec", "tsx", "scripts/run-jam-actions-corpus-eval.ts",
      "--model", m.tag,
      "--backend", "ollama",
      "--evals", "e3,e3-tool",
      "--sample-filter", "b1-confirm-cohort",
      "--n", "3",
      "--output", out,
      "--sample-output", sample,
    ],
    { cwd: REPO_ROOT, shell: true, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" },
  );
  appendFileSync(LOG_PATH, r.stdout ?? "", "utf8");
  appendFileSync(LOG_PATH, r.stderr ?? "", "utf8");
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  if (r.status !== 0) fail(`eval for ${m.tag} exited ${r.status} after ${mins} min — checkpoint retained; fix, then re-invoke this runner (it resumes)`);
  if (!isComplete(out)) fail(`eval for ${m.tag} exited 0 but ${out} is not a complete artifact`);
  log(`DONE ${m.label} in ${mins} min`);
}

log("=== all six sealed artifacts complete ===");
process.exit(0);
