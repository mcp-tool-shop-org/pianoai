// Build divergence.json for the live demo's "Surprise me" picker.
// Reads the sealed B-1 per-question eval scores (e3-tool / tool_inspected condition) for the
// baseline + all five seed fine-tunes, restricted to the 8 demo phrases, and emits:
//   - by_phrase: per (phrase, question) baseline vs seed271 vs all-seeds mean + a category
//   - cycle:     a curated, HONEST surprise order (mostly fine-tune rescues, but deliberately
//                keeps a split and a both-models-miss so it never reads as cherry-picked wins)
// Seeds are GGUF Q4_K_M runs; the live demo runs bf16 LoRA, so live may differ — this only
// seeds a "likely divergent" picker, captioned as such. Run after extract-demo-data.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const REPO = 'E:/AI/ai-jam-sessions';
const EV = `${REPO}/experiments/finetune-arc-v2/evals`;
const SEEDS = ['13', '42', '271', '512', '1024'];

const load = (f) => JSON.parse(readFileSync(`${EV}/${f}`, 'utf8'));
const demo = JSON.parse(readFileSync(join(__dir, 'demo_data.json'), 'utf8'));

const avg = (a) => { a = a.filter((x) => x != null && !isNaN(x)); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; };
const mode = (a) => { a = a.filter((x) => x != null); const c = {}; a.forEach((x) => (c[x] = (c[x] || 0) + 1)); let b = null, bc = -1; for (const k in c) if (c[k] > bc) { bc = c[k]; b = +k; } return b; };
const round = (x, p = 2) => (x == null || isNaN(x) ? null : Number(x.toFixed(p)));

// recordId -> per-question { score (mean majorityScore over runs), sel (majority selected option) }
function qstats(doc) {
  const m = {};
  for (const rec of doc.results['e3-tool'].records) {
    const nq = rec.per_run_results[0].questions.length;
    const acc = Array.from({ length: nq }, () => ({ scores: [], sels: [] }));
    for (const run of rec.per_run_results) {
      run.questions.forEach((q, qi) => {
        acc[qi].scores.push(q.majorityScore);
        const counts = {};
        (q.runs || []).forEach((r) => { if (r.selectedOptionIndex != null) counts[r.selectedOptionIndex] = (counts[r.selectedOptionIndex] || 0) + 1; });
        let best = null, bc = -1; for (const k in counts) if (counts[k] > bc) { bc = counts[k]; best = +k; }
        acc[qi].sels.push(best);
      });
    }
    m[rec.recordId] = acc.map((a) => ({ score: avg(a.scores), sel: mode(a.sels) }));
  }
  return m;
}

const B = qstats(load('b1-baseline-results.json'));
const F = {}; for (const s of SEEDS) F[s] = qstats(load(`b1-seed${s}-results.json`));

const byPhrase = {};
for (const p of demo.phrases) {
  byPhrase[p.id] = p.questions.map((q, qi) => {
    const base = B[p.id][qi];
    const ft271 = F['271'][p.id][qi];
    const ftAll = avg(SEEDS.map((s) => F[s][p.id][qi].score));
    let category;
    if (base.score < 0.5 && ft271.score >= 0.99) category = 'ft_rescue';
    else if (base.score < 0.5 && ft271.score >= 0.5) category = 'ft_better';
    else if (base.score >= 0.99 && ft271.score < 0.5) category = 'ft_regress';
    else if (base.score < 0.5 && ft271.score < 0.5) category = 'both_miss';
    else if (Math.abs(base.score - ft271.score) >= 0.34) category = ft271.score > base.score ? 'ft_better' : 'ft_worse';
    else category = 'agree';
    return {
      q_idx: qi, type: q.type, correct: q.correct,
      base_score: round(base.score), base_sel: base.sel,
      ft271_score: round(ft271.score), ft271_sel: ft271.sel,
      ftAll_score: round(ftAll), category,
    };
  });
}

// Curated honest surprise cycle (seed271). Mostly rescues, but keeps a split (chopin-nocturne q1)
// and a both-miss (fur-elise q3) so it never reads as cherry-picked fine-tune wins.
const CYCLE = [
  ['clair-de-lune:m001-004:piano:mcp-session:v1', 1],           // hand_register, held-out TEST, rescue
  ['clair-de-lune:m001-004:piano:mcp-session:v1', 2],           // rhythm_onset, held-out TEST, rescue
  ['mozart-k545-mvt1:m009-012:piano:mcp-session:v1', 3],        // annotation_grounding, rescue
  ['fur-elise:m013-016:piano:mcp-session:v1', 0],              // pitch_class_count, rescue
  ['chopin-prelude-e-minor:m021-024:piano:mcp-session:v1', 2], // rhythm_onset, rescue
  ['bach-prelude-c-major-bwv846:m009-012:piano:mcp-session:v1', 0], // pitch_class_count, rescue
  ['chopin-nocturne-op9-no2:m001-004:piano:mcp-session:v1', 1], // hand_register, ft_better (honest split)
  ['fur-elise:m013-016:piano:mcp-session:v1', 3],             // annotation_grounding, both_miss (honest)
  ['mozart-k545-mvt1:m009-012:piano:mcp-session:v1', 1],       // hand_register, rescue
  ['chopin-prelude-e-minor:m021-024:piano:mcp-session:v1', 3], // annotation_grounding, rescue
];
const cycle = CYCLE.map(([phrase_id, q_idx]) => {
  const rec = byPhrase[phrase_id][q_idx];
  return { phrase_id, q_idx, category: rec.category, base_score: rec.base_score, ft271_score: rec.ft271_score };
});

const out = {
  note: 'Per-question B-1 eval scores (e3-tool / tool_inspected), baseline vs frozen v1 fine-tunes. Seeds are GGUF Q4_K_M runs; the live demo runs bf16 LoRA so live results may differ — this seeds an honest "likely divergent" picker, not a guarantee.',
  default_seed: 'seed271',
  by_phrase: byPhrase,
  cycle,
};
writeFileSync(join(__dir, 'divergence.json'), JSON.stringify(out, null, 1));
console.log(`wrote divergence.json — ${Object.keys(byPhrase).length} phrases, ${cycle.length} in surprise cycle`);
const cc = {}; for (const pid in byPhrase) byPhrase[pid].forEach((r) => (cc[r.category] = (cc[r.category] || 0) + 1));
console.log('categories across all 32 pairs:', JSON.stringify(cc));
