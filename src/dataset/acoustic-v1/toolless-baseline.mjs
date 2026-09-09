#!/usr/bin/env node
// ─── The tool-less baseline: does this corpus need the tools at all? ─────────
//
// Ask a local model each held-out question with NO tools, NO record, NO
// context — just the user turn. Whatever it gets right, it got from
// pretraining, and those records measure recall rather than tool use.
//
// This is J7, and it costs nothing. Run it BEFORE renting a GPU.
//
// The reason it exists: jam-actions-acoustic-v0 shipped, was published, and was
// fine-tuned on before anyone discovered a fairly-prompted base model already
// scored 0.972 on it. One pod and 35 minutes to learn what this script answers
// in two minutes for free.
//
//   node src/dataset/acoustic-v1/toolless-baseline.mjs [model]
//
// Measured 2026-09-08, mistral-small:24b, 56 held-out records: 5.4% overall.
// For contrast, v0's fairly-prompted base model scored 97.2%.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODEL = process.argv[2] ?? "mistral-small:24b";
const CORPUS = process.env.V1_RECORDS
  ? resolve(process.env.V1_RECORDS)
  : join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..",
    "datasets", "jam-actions-v1", "records.jsonl");

async function ask(prompt) {
  const res = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // keep_alive 0: do not leave a 24B model resident on the rig's VRAM.
    body: JSON.stringify({
      model: MODEL, prompt, stream: false, keep_alive: 0,
      options: { temperature: 0, num_predict: 40 },
    }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status} — is it running?`);
  return (await res.json()).response.trim();
}

const rows = readFileSync(CORPUS, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const test = rows.filter((r) => r.split === "test");
const byFamily = new Map();

for (const r of test) {
  const user = r.target_trace.session.find((t) => t.role === "user");
  const gold = String(r.observation.gold.answer);
  const out = await ask(`${user.content}\n\nAnswer with just the value, nothing else.`);
  const hit = out.toLowerCase().includes(gold.toLowerCase());
  const slot = byFamily.get(r.family) ?? { correct: 0, n: 0 };
  slot.n++;
  if (hit) slot.correct++;
  byFamily.set(r.family, slot);
}

let correct = 0, n = 0;
const per = {};
for (const [fam, s] of [...byFamily].sort()) {
  per[fam] = { ...s, accuracy: +(s.correct / s.n).toFixed(4) };
  correct += s.correct; n += s.n;
}
const report = { model: MODEL, held_out: n, correct, accuracy: +(correct / n).toFixed(4), per_family: per };
process.stdout.write(JSON.stringify(report, null, 2) + "\n");

// A family a tool-less model can already answer is measuring recall. The floor
// is deliberately loose: this is a smell test, not a gate on a single number.
if (report.accuracy > 0.5) {
  process.stderr.write("\nWARN: over half answerable without tools. This corpus measures recall.\n");
}
