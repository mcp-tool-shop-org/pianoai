#!/usr/bin/env tsx
// One-command entry that does NOT train unless the operator has already
// placed weights in the studio HF cache. It never downloads.
//
//   pnpm exec tsx experiments/acoustic-sft/train.ts
//
// Required (NOT installed by this chunk — licences in the handoff):
//   torch, transformers, peft, trl, accelerate
//
// HF_HOME defaults to E:/AI-Models/hf-cache (studio convention).
// TRANSFORMERS_OFFLINE / HF_HUB_OFFLINE / local_files_only stay on.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(here, "lora-config.json"), "utf8")) as {
  base_model: string;
  hf_home: string;
  local_files_only: boolean;
  refuse_download: boolean;
};

const hfHome = process.env.HF_HOME ?? config.hf_home;
process.env.HF_HOME = hfHome;
process.env.TRANSFORMERS_OFFLINE = "1";
process.env.HF_HUB_OFFLINE = "1";
process.env.HF_HUB_DISABLE_TELEMETRY = "1";

function refuse(msg: string): never {
  process.stderr.write(`REFUSING: ${msg}\n`);
  process.exit(1);
}

if (!config.local_files_only || !config.refuse_download) {
  refuse("lora-config.json must keep local_files_only and refuse_download true.");
}

const snapshotHint = join(hfHome, "hub");
if (!existsSync(hfHome)) {
  refuse(
    `HF_HOME ${hfHome} does not exist. Create the studio cache and place ${config.base_model} there. This script will not download.`,
  );
}

const invoked = process.argv[1]?.includes("train.ts") || process.argv[1]?.includes("train.js");
if (invoked) {
  process.stdout.write(
    [
      "acoustic-sft train entry",
      `base_model=${config.base_model}`,
      `HF_HOME=${hfHome}`,
      `hub_present=${existsSync(snapshotHint)}`,
      "offline=1  refuse_download=1",
      "No training step will run from this chunk.",
      "When the operator has installed torch/transformers/peft/trl/accelerate",
      "AND the base weights are already in HF_HOME, replace this stub with the",
      "actual Trainer loop. Until then this process exits 0 after the gate.",
    ].join("\n") + "\n",
  );
}
