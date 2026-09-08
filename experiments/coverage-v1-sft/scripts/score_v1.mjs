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

// A family whose held-out gold never varies cannot be got wrong, so its score is
// the majority-class ceiling and means nothing. Computed from the gold file on
// every run rather than written here, because the hand-written version of this
// note was stale within a day: it named two such families when there were five.
const NL = String.fromCharCode(10);
const constant = families.filter((f) => new Set([...gold.values()].filter((g) => g.family === f).map((g) => g.gold)).size < 2);
if (constant.length) {
  process.stdout.write(NL + "WARN: constant held-out gold in " + constant.join(", ") + " -- those rows measure nothing." + NL);
} else {
  process.stdout.write(NL + "Every scored family has >= 2 distinct held-out gold values." + NL);
}
