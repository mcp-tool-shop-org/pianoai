#!/usr/bin/env node
// ─── Score v1 predictions against gold ───────────────────────────────────────
//
// Runs on the studio rig, not the pod. Takes prediction files and prints a
// per-family table plus the overall.
//
// One normaliser, byte-identical to the predictor's, applied to gold and
// prediction alike. Kept in sync by being this short: case, whitespace,
// wrapping quotes, a trailing full stop. Nothing else.
//
//   node score_v1.mjs gold-test.jsonl base=preds-base.jsonl lora=preds-lora.jsonl

import { readFileSync } from "node:fs";

const norm = (s) =>
  String(s ?? "").trim().replace(/^["']|["']$/g, "").trim()
    .replace(/\s+/g, " ").replace(/\.$/, "").toLowerCase();

const read = (p) => readFileSync(p, "utf8").trim().split("\n").map((l) => JSON.parse(l));

const [goldPath, ...conds] = process.argv.slice(2);
const gold = new Map(read(goldPath).map((g) => [g.id, g]));
const families = [...new Set([...gold.values()].map((g) => g.family))].sort();

const table = {};
for (const spec of conds) {
  const [name, path] = spec.includes("=") ? spec.split(/=(.+)/) : ["preds", spec];
  const per = Object.fromEntries(families.map((f) => [f, { correct: 0, n: 0 }]));
  let correct = 0, n = 0, blank = 0;
  for (const p of read(path)) {
    const g = gold.get(p.id);
    if (!g) continue;
    const hit = norm(p.answer) === norm(g.gold);
    if (!String(p.answer ?? "").trim()) blank++;
    per[g.family].n++; n++;
    if (hit) { per[g.family].correct++; correct++; }
  }
  table[name] = { per, correct, n, blank, accuracy: n ? correct / n : 0 };
}

const names = Object.keys(table);
const w = Math.max(14, ...families.map((f) => f.length + 2));
process.stdout.write("family".padEnd(w) + names.map((x) => x.padStart(14)).join("") + "\n");
for (const f of families) {
  const row = names.map((x) => {
    const c = table[x].per[f];
    return (c.n ? `${c.correct}/${c.n}` : "-").padStart(14);
  }).join("");
  process.stdout.write(f.padEnd(w) + row + "\n");
}
process.stdout.write("-".repeat(w + 14 * names.length) + "\n");
process.stdout.write("OVERALL".padEnd(w) +
  names.map((x) => `${table[x].correct}/${table[x].n}`.padStart(14)).join("") + "\n");
process.stdout.write("accuracy".padEnd(w) +
  names.map((x) => `${(100 * table[x].accuracy).toFixed(1)}%`.padStart(14)).join("") + "\n");
process.stdout.write("blank".padEnd(w) +
  names.map((x) => String(table[x].blank).padStart(14)).join("") + "\n");

// catalog and server are train-only, so they cannot appear above. Said here so
// a reader does not have to notice the absence.
process.stdout.write(
  "\nNote: catalog (3) and server (1) are train-only -- no song_id, split is by " +
  "song -- so they are trained on and never scored.\n" +
  "Note: sections and compare have CONSTANT gold (\"0:none\", \"different_key\") " +
  "in every record, so 100% is the majority-class baseline and they measure " +
  "nothing. 13 of the 100 held-out records; the effective set is 87.\n",
);
