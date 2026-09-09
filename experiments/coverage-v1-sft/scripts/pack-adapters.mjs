#!/usr/bin/env node
// Pack the published jam-actions-v1 adapter + receipt into one tar.gz in the
// layout push-adapters-hf.yml extracts: README.md at the root, one directory
// per adapter named as the card. Adapters stay out of git.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REPO = resolve(ROOT, "..", "..");

function parseSet(argv) {
  const i = argv.indexOf("--set");
  if (i < 0) return "7b";
  const v = argv[i + 1];
  if (v !== "7b" && v !== "3b") {
    process.stderr.write(`--set must be 7b or 3b (got ${JSON.stringify(v ?? "")})\n`);
    process.exit(1);
  }
  return v;
}

const SET = parseSet(process.argv.slice(2));
const SETS = {
  "7b": {
    card: join(REPO, "docs", "hf-cards", "jam-actions-v1-adapters.md"),
    out: join(ROOT, "dist", "jam-actions-v1-adapters.tar.gz"),
    adapters: [
      { dir: "7b-s13", epoch: join(ROOT, "runs", "r40", "A7b", "epoch3"), receipt: join(ROOT, "runs", "r40", "run-config-A7b.json") },
      { dir: "7b-s42", epoch: join(ROOT, "runs", "r48", "A7bs42", "epoch3"), receipt: join(ROOT, "runs", "r48", "run-config-A7bs42.json") },
    ],
  },
  "3b": {
    card: join(REPO, "docs", "hf-cards", "jam-actions-v1-adapters-3b.md"),
    out: join(ROOT, "dist", "jam-actions-v1-adapters-3b.tar.gz"),
    adapters: [
      { dir: "3b-4d-s13", epoch: join(ROOT, "runs", "r48", "A3b4d", "epoch3"), receipt: join(ROOT, "runs", "r48", "run-config-A3b4d.json") },
      { dir: "3b-4d-s42", epoch: join(ROOT, "runs", "r48", "A3b4ds42", "epoch3"), receipt: join(ROOT, "runs", "r48", "run-config-A3b4ds42.json") },
    ],
  },
};

const { card: CARD, out: OUT, adapters: ADAPTERS } = SETS[SET];
const STAGING = join(ROOT, "dist", "adapters-staging");

if (!existsSync(CARD)) {
  throw new Error(`halt: adapter card missing at ${CARD}; packer does not write README prose`);
}

rmSync(STAGING, { recursive: true, force: true });
mkdirSync(STAGING, { recursive: true });
writeFileSync(join(STAGING, "README.md"), readFileSync(CARD));

for (const a of ADAPTERS) {
  if (!existsSync(a.epoch)) throw new Error(`missing adapter dir ${a.epoch}`);
  if (!existsSync(join(a.epoch, "adapter_model.safetensors"))) {
    throw new Error(`missing weights in ${a.epoch}`);
  }
  if (!existsSync(a.receipt)) throw new Error(`missing receipt ${a.receipt}`);
  const dest = join(STAGING, a.dir);
  cpSync(a.epoch, dest, { recursive: true });
  writeFileSync(join(dest, "receipt.json"), readFileSync(a.receipt));
}

mkdirSync(dirname(OUT), { recursive: true });
if (existsSync(OUT)) rmSync(OUT);
// Drive-letter absolute paths make GNU tar treat "E:" as a remote host and
// Windows tar reject --force-local. Pack from ROOT with relative paths.
execFileSync("tar", ["-czf", relative(ROOT, OUT), "-C", relative(ROOT, STAGING), "."], {
  cwd: ROOT,
  stdio: "inherit",
});

const buf = readFileSync(OUT);
const hash = createHash("sha256").update(buf).digest("hex");
const size = statSync(OUT).size;
process.stdout.write(`${OUT}  ${size}  ${hash}\n`);
