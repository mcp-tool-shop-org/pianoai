#!/usr/bin/env node
// Pack the four jam-actions-v1 adapters + receipts into one tar.gz in the
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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REPO = resolve(ROOT, "..", "..");

const ADAPTERS = [
  { dir: "3b-s13-349", epoch: join(ROOT, "runs", "r32", "A3", "epoch3"), receipt: join(ROOT, "runs", "r32", "run-config-A3.json") },
  { dir: "3b-s42-349", epoch: join(ROOT, "runs", "r32", "A3s42", "epoch3"), receipt: join(ROOT, "runs", "r32", "run-config-A3s42.json") },
  { dir: "7b-s13-349", epoch: join(ROOT, "runs", "r32", "A7", "epoch3"), receipt: join(ROOT, "runs", "r32", "run-config-A7.json") },
  { dir: "3b-s13-371", epoch: join(ROOT, "runs", "r34", "A3", "epoch3"), receipt: join(ROOT, "runs", "r34", "run-config-A3.json") },
];

const CARD = join(REPO, "docs", "hf-cards", "jam-actions-v1-adapters.md");
const STAGING = join(ROOT, "dist", "adapters-staging");
const OUT = join(ROOT, "dist", "jam-actions-v1-adapters.tar.gz");

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
execFileSync("tar", ["-czf", OUT, "-C", STAGING, "."], { stdio: "inherit" });

const buf = readFileSync(OUT);
const hash = createHash("sha256").update(buf).digest("hex");
const size = statSync(OUT).size;
process.stdout.write(`${OUT}  ${size}  ${hash}\n`);
