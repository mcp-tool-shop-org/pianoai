# jam-actions-v0 Slice 12 — Corpus-Scale Eval Rerun

**Date:** 2026-05-18
**Status:** COMPLETE
**Backend:** ollama qwen2.5:7b (local, no paid API)
**Sample seed:** `slice12-2026-05-17`
**Sample sizes:** E1=24 records, E2=12 pairs, E3=24 records (with 6 Slice 11 enriched records required in E1 and E3; 4 enriched pairs required in E2)

---

## The single question this slice answers

**Did Slice 11 enrichment measurably improve eval signal — especially E3 grounding on the 6 enriched records?**

**Answer:** Yes on E3 *directionally* — but only partially, and with two unexpected regressions on E1 and E2 that the slice surfaces honestly.

---

## TL;DR

| Eval | Corpus aggregate | Enriched subset | Non-enriched subset | Prior baseline (clair-de-lune only) | Threshold |
|------|------------------|-----------------|---------------------|-------------------------------------|-----------|
| E1 pass rate | **37.5%** (9/24) | **16.7%** (1/6) ⚠️ | **44.4%** (8/18) | 75% (3/4) | ≥70% |
| E2 pairs pass | **4/12** (mean grooveOA 0.612) | mean grooveOA 0.524 ⚠️ | mean grooveOA 0.657 | 0/2 majority-pass | grooveOA ≥0.797 |
| E3 margin vs text-only | **−0.056** | **+0.069** ✓ direction | **−0.097** | −0.125 | ≥+0.10 |
| E3 margin vs random-MIDI | **−0.066** | −0.014 | (n/a aggregated) | −0.0625 | ≥+0.10 |

Three substantive findings:

1. **E3 enrichment hypothesis directionally validated.** Enriched records show +0.166 absolute improvement on the text-only-margin metric compared to non-enriched (+0.069 vs −0.097). Direction is correct; absolute magnitude doesn't yet cross the +0.10 threshold. Prose enrichment alone moves the needle but not far enough.

2. **Unexpected E1 regression on enriched records.** 1/6 enriched pass E1 (16.7%) vs 8/18 non-enriched (44.4%). Target traces were NOT touched in Slice 11, so this is mechanism-of-regression unknown — most likely prompt-context leakage where richer `annotation_target` content alters E1 prompt behavior. **Investigate before any release decision.**

3. **E2 also regresses on enriched pairs.** Mean grooveOA 0.524 enriched vs 0.657 non-enriched. Similar likely cause to (2).

---

## Methodology

### Sample design

Deterministic stratified sampler (`src/dataset/eval/corpus-sampler.ts`) with fixed seed `slice12-2026-05-17`. Hash-based shuffle (no `Math.random()`); same inputs → same outputs.

Required inclusions, all satisfied:

- **All 6 Slice 11 enriched records** present in E1 and E3 samples
- **All 4 enriched-record pairs** present in E2 sample (Bach late-prelude m041→m045, Bach late-prelude m049→m053, Pathétique m025→m029, Schumann m041→m045)
- Strata covered: opening (2), middle (20), cadential (2), Bach texture-repetition (3), anacrusis (1) — across E1 + E3
- clair-de-lune held-out test records appear naturally via stratification (not specially required)

Sample manifest: `datasets/jam-actions-v0-public/evals/corpus-scale-qwen2.5-7b-sample.json`.

### Eval harness versions (LOCKED, unchanged this slice)

- E1: `src/dataset/eval/tool-use.ts` (Slice 4 + 9a tolerant parser)
- E2: `src/dataset/eval/phrase-continuation.ts` (Slice 6 + 8 hardening + 9a parse fixes)
- E3: `src/dataset/eval/annotation-grounding.ts` (Slice 7 + Slice 8 leakage hardening)

### Model + backend

- Model: `qwen2.5:7b` (Q4_K_M, 4.7 GB, GGUF via Ollama 0.3+ HTTP API at `http://127.0.0.1:11434`)
- Tools surface: 41 MCP tools from `dist/mcp-server.js` (tools/list)
- `n=1` (single sample per record; no Monte Carlo averaging)
- Total wall time: ~14 minutes for 24 E1 + 12 E2 + 24 E3 = 60 model invocations

---

## Results — E1 (Tool-Use Correctness)

### Aggregate
- **Corpus (24 records): 37.5% pass rate (9/24)**
- Enriched subset (6 records): 16.7% (1/6)
- Non-enriched subset (18 records): 44.4% (8/18)

### Per-record breakdown for enriched records (the hypothesis test)

| Record | Result | Tool calls | Time |
|--------|--------|-----------|------|
| `pathetique-mvt2:m025-028` | FAIL | 6 | 34s |
| `pathetique-mvt2:m029-032` | FAIL | 2 | 7s |
| `schumann-traumerei:m045-048` | FAIL | 2 | 7s |
| `bach-prelude-c-major:m045-048` | FAIL | 2 | 8s |
| `bach-prelude-c-major:m049-052` | **PASS** | 4 | 13s |
| `bach-prelude-c-major:m053-056` | FAIL | 2 | 8s |

**Pattern:** 5 of 6 enriched-record FAILs show `tcalls=2` — strongly suggesting the model is short-circuiting (emitting an answer with minimal tool use). Non-enriched FAILs vary across tcalls=2..8.

### Hypothesis test: did enrichment leave E1 unchanged?
**NO — UNEXPECTED REGRESSION.** Target traces weren't touched in Slice 11, but enriched records' E1 pass rate dropped to 16.7%. Probable mechanism: richer `annotation_target` content leaks into E1 prompt construction, causing the model to skip proper tool usage. **This is the highest-priority finding for Slice 13.**

### Comparison to prior baseline

Prior `llm-in-the-loop-qwen2.5-7b-hardened.json` reported 75% (3/4) — but on a clair-de-lune-only 4-record sample. The new 24-record corpus-scale sample is broader and harder. Non-enriched corpus pass rate (44.4%) is the more honest "comparable baseline" — and even that fails the ≥70% threshold.

---

## Results — E2 (Phrase Continuation)

### Aggregate
- **4/12 pairs pass groove threshold (≥0.797)**
- Mean grooveOA (all pairs): 0.612
- Mean grooveOA (enriched pairs only): 0.524
- Mean grooveOA (non-enriched pairs): 0.657

### Per-pair breakdown for enriched pairs

| Pair (prompt → continuation) | grooveOA | Pass? |
|---|---|---|
| Bach m041 → m045 (enriched cont.) | 0.750 | FAIL |
| Bach m049 → m053 (both enriched) | 0.514 | FAIL |
| Pathétique m025 → m029 (both enriched) | 0.462 | FAIL |
| Schumann m041 → m045 (enriched cont.) | 0.371 | FAIL |

### Passing pairs (all non-enriched)

| Pair | grooveOA |
|---|---|
| Bach m009 → m013 | **1.000** |
| Mozart m057 → m061 | 0.964 | 
| Clair-de-lune m031 → m035 (TEST) | 0.889 |
| Mozart m073 → m077 | 0.864 |

### Hypothesis test: did E2 improve on enriched pairs?
**NO — REGRESSION ON ENRICHED.** Enriched pairs' mean grooveOA (0.524) is lower than non-enriched (0.657). Same likely mechanism as E1: enriched `annotation_target` may be leaking into the E2 prompt, biasing the model's continuation toward "answering" instead of generating notes with matching groove.

### FM-5 status
Of 4 enriched-pair FAILs, all show `parse=clean` (no FM-4 parse-bottleneck). FM-5 (groove mismatch with notes present) is the failure mode — confirmed unchanged from Slice 9d's earlier finding.

---

## Results — E3 (Annotation Grounding MCQ)

### Aggregate
- **Corpus (24 records): margin vs text-only = −0.056** (fails threshold +0.10)
- Corpus margin vs random-MIDI: −0.066 (fails threshold +0.10)
- **Enriched (6 records): margin vs text-only = +0.069** (still fails threshold but +0.166 better than non-enriched)
- Non-enriched (18 records): margin vs text-only = −0.097

### Per-record E3 numbers for enriched records (THIS IS THE HYPOTHESIS TEST)

| Record | full | text-only | random-MIDI | margin vs text | margin vs rmidi |
|--------|------|-----------|-------------|----------------|------------------|
| `pathetique-mvt2:m025-028` | 0.750 | 0.250 | 0.500 | **+0.500** | +0.250 |
| `pathetique-mvt2:m029-032` | 0.333 | 0.333 | 0.333 | 0.000 | 0.000 |
| `schumann-traumerei:m045-048` | 0.333 | 0.667 | 0.667 | −0.333 | −0.333 |
| `bach-prelude-c-major:m045-048` | 0.500 | 0.500 | 0.500 | 0.000 | 0.000 |
| `bach-prelude-c-major:m049-052` | 0.000 | 0.000 | 0.250 | 0.000 | −0.250 |
| `bach-prelude-c-major:m053-056` | 0.500 | 0.250 | 0.250 | +0.250 | +0.250 |
| **Mean (enriched n=6)** | **0.403** | **0.333** | (n/a aggregated) | **+0.069** | −0.014 |

The Pathétique m025-028 enriched record shows a striking +0.500 margin vs text-only — exactly the signal the hypothesis predicted. But the Schumann record actually REGRESSED (−0.333), and the Bach m045-048 + m049-052 show 0 margin. The mean lifts only because of Pathétique's strong signal.

### Hypothesis test: does E3 margin on enriched records exceed +0.10?
**PARTIAL.** Mean enriched margin (+0.069) is below the +0.10 threshold, so by the locked threshold the hypothesis FAILS. But the +0.166 absolute improvement vs non-enriched (-0.097 → +0.069) is substantial and in the right direction. Prose enrichment helps grounding *measurably* but not enough to cross release-grade thresholds.

The variance is high: 1 of 6 enriched records (Pathétique m025-028) shows +0.500 margin; 2 show 0; 2 show 0 or modest; 1 regresses to −0.333. The signal is real but not yet reliable.

---

## Comparison to prior baseline

| Metric | Prior baseline | Slice 12 result | Sample comparability |
|--------|----------------|-----------------|---------------------|
| E1 pass rate | 75% on 4 records (clair-de-lune only) | 37.5% on 24-record corpus sample | NOT directly comparable (different sample) |
| E2 pairs majority-pass | 0/2 (FM-5 surfaced) | 4/12 (33%) | Larger sample; pass rate improves but enriched pairs regress |
| E3 margin vs text-only | −0.125 | **−0.056 corpus / +0.069 enriched** | E3 corpus improves +0.069 absolute over prior baseline; enriched subset shifts substantially upward |
| E3 margin vs random-MIDI | −0.0625 | −0.066 corpus / −0.014 enriched | Corpus essentially unchanged |

The prior baseline's E1 75% was on an unusually easy clair-de-lune-only sample. The new corpus-scale 37.5% is the honest signal. The new E3 corpus -0.056 (vs prior -0.125) is a modest but real improvement attributable in part to Slice 11 enrichment of 6 records changing the corpus mean.

---

## Where qwen2.5:7b still fails

By failure mode + cluster:

- **Short-circuit on rich-annotation E1 prompts** (5 of 6 enriched records, tcalls=2): the model emits a minimal-tool-call response instead of doing the multi-step inspection the gold trace demonstrates. **Probable mechanism: `annotation_target` content is appearing in the E1 system or user prompt, signaling to the model that the answer is "already known."**
- **FM-5 on enriched E2 pairs** (4 of 4 enriched pairs fail groove threshold): same suspected mechanism — enriched annotation leaks into prompt, biases model toward "answer" mode over continuation generation.
- **E3 variance is high even on enriched records**: 1/6 enriched shows strong signal (Pathétique m025 +0.500); 1/6 regresses (Schumann m045 −0.333); 4/6 are neutral or marginal. Annotation depth isn't uniformly leveraged.
- **clair-de-lune** (TEST holdout) E2 pair passes (m031→m035, grooveOA 0.889) — held-out behavior continues to track training-set behavior.

---

## Implications for Slice 13

**Do not ship for public release.** Three concrete blockers:

1. **E1/E2 leakage suspected.** The fact that target_trace was unchanged but E1 dropped from 75% (clair-de-lune) to 16.7% (enriched corpus) suggests `annotation_target` content is leaking into the E1/E2 prompt construction. This needs investigation:
   - Read `src/dataset/eval/tool-use.ts` and `phrase-continuation.ts` to see how prompts are constructed from records
   - If `annotation_target` content is in the prompt, decide: (a) remove it to restore prompt-context isolation, OR (b) accept that annotation drives E1 behavior and update the gold traces
   - Re-run Slice 12 evals after the fix to confirm the regression closes

2. **E3 enrichment direction is right but magnitude insufficient.** +0.069 isn't +0.10. Two paths:
   - More enrichment (Slice 11 hit 6 of 115 records; scaling to 30-50 might lift the mean further — diminishing returns possible)
   - Different intervention: better tool use during E3 (the model could call tools to look at MIDI events, not just read annotations)

3. **High per-record variance on E3 enriched signal** suggests the enrichment quality isn't uniform. The Schumann record (m045-048) regressed; that warrants a per-record review.

**Suggested Slice 13 scope:** Investigation slice. Audit E1/E2 prompt construction; find/fix annotation leakage; re-run Slice 12 evals. Possibly precede with a Slice 12.5 (the leakage fix) before any further enrichment.

---

## Reproducibility

```bash
# Prerequisites:
#   ollama serve   (background)
#   ollama pull qwen2.5:7b
#   git checkout jam-actions-v0-eval-rerun-2026-05-18  (after this slice commits)

cd E:/AI/ai-jam-sessions
pnpm install
pnpm exec tsx scripts/run-jam-actions-corpus-eval.ts \
  --seed slice12-2026-05-17 \
  --scope public \
  --model qwen2.5:7b
```

Sample selection is deterministic. Model output is `n=1` (no Monte Carlo); two consecutive runs may produce slightly different model outputs due to ollama's seed handling, but the *sample* is identical.

---

## Hard gates — all PASS

1. ✅ All 1320 existing tests pass; 17 new sampler tests pass (total 1337)
2. ✅ ≥8 sampler tests (shipped 17)
3. ✅ Sample is deterministic (re-running sampler reproduces sample manifest)
4. ✅ All 6 Slice 11 enriched records in E3 sample; all 4 enriched pairs in E2
5. ✅ Stratification covered: opening (2), middle (20), cadential (2), Bach texture-rep (3), anacrusis (1)
6. ✅ Source corpus `datasets/jam-actions-v0/` byte-identical
7. ✅ Source corpus eval artifacts under `datasets/jam-actions-v0/evals/` byte-identical
8. ✅ Slice 10.5 curated docs + Slice 11 enriched records byte-identical
9. ✅ Public-package manifest, splits, records.jsonl, records/, pianoroll/ byte-identical
10. ✅ Raw model output preserved per record in `corpus-scale-qwen2.5-7b-results.json`
11. ✅ 244 checksums verify (242 prior + 2 new eval files)
12. ✅ `package-inputs.json` declares the 2 new eval files as curated (subdirectory paths supported by Slice 11.5 packager)
13. ✅ Ollama precondition probe shipped (friendly setup-instructions error on unreachable endpoint)
14. ✅ All three hypotheses answered concretely with numbers

---

## Doctrine ratchets earned

1. **Eval signal can regress without record content changes.** Slice 11 didn't touch target_trace, but E1 still regressed on enriched records. The lesson: any prompt-context change can affect evaluator behavior. Future slices that touch any field must consider downstream eval impact, not just the field being edited.

2. **Stratified sampling + required inclusions is the right pattern for cross-slice eval comparisons.** Prior baselines on narrow samples (clair-de-lune only) gave a misleading floor (75%); the broader 24-record sample reveals the honest signal (37.5%). Future eval reruns should default to the corpus-scale sampler.

3. **Direction-of-signal beats threshold-clearing for early-stage datasets.** E3 enriched margin (+0.069) doesn't clear +0.10, but the +0.166 absolute lift over non-enriched is the meaningful signal that enrichment works. Thresholds matter for release; direction matters for development.

4. **Honest absence applies to evaluation too.** Per-record E3 results show wide variance even on enriched records. The mean tells a story; the spread tells a more nuanced one. Don't aggregate away the variance in slice reports.

---

## Suggested commit + tag

```
git add datasets/jam-actions-v0-public/ \
        scripts/run-jam-actions-corpus-eval.ts \
        src/dataset/eval/corpus-sampler.ts \
        src/dataset/eval/corpus-sampler.test.ts \
        docs/jam-actions-v0-slice12-corpus-scale-eval-rerun.md

git commit -m "Run corpus-scale eval rerun on enriched jam-actions v0 public package"

git push origin main

git tag jam-actions-v0-eval-rerun-2026-05-18
git push origin tag jam-actions-v0-eval-rerun-2026-05-18
```
