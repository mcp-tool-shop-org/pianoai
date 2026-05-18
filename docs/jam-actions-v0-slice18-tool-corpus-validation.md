# jam-actions-v0 Slice 18 — Tool-Inspected E3 Corpus Validation

**Date:** 2026-05-18
**Status:** COMPLETE — AWAITING OPERATOR REVIEW (NO COMMIT)
**Type:** Eval-data slice — pure additive; old E3 byte-identical; no record changes; no version bump
**Inputs:** Slice 17's 3-record demo, 13-record stratified cohort, qwen2.5:7b via Ollama, seed `slice12-2026-05-17`
**Outputs:** 1 modified script (sample-filter extension) + 2 new eval artifacts + 1 new doc + package-inputs.json + checksums.sha256

---

## 1. The question (operator's directive)

> Does `tool_inspected − text_only ≥ +0.10` generalize beyond Slice 17's 3-record cohort, or is the Pathétique result idiosyncratic?

The operator's instruction: "Do not make a release claim until Slice 18 tells us whether the Pathétique result generalizes."

---

## 2. Verdict

**VERDICT D — Does NOT generalize.**

| Threshold for verdict | Slice 18 result |
|---|---|
| Verdict A (≥10/13 cleared AND misinterp <20%) | **4/13 cleared; misinterp 55.6%** — FAILS |
| Verdict B (4/4 Pathétique pass + 0/4 Bach pass) | **2/4 Pathétique + 2/4 Bach** — DOES NOT MATCH |
| Verdict C (6-9/13; misinterp 20-40%) | **4/13; misinterp 55.6%** — FAILS |
| Verdict D (<6/13 OR misinterp >40%) | **4/13 cleared; misinterp 55.6%** — MATCHES |

**Headline:** the Slice 17 Pathétique result was real but did NOT generalize. Only 4 of 13 records cleared the +0.10 margin (Bach m029-032, Bach m045-048, Pathétique m001-004, Pathétique m025-028). Both Pathétique enriched/cohort records cleared, but only 2 of 4 in the Pathétique stratum. The Bach control regression seen in Slice 17 is partially reversed (Slice 17 Bach m009-012: −0.333; Slice 18: −0.083 — within noise of the Slice 12 n=1 baseline), but two NEW Bach records cleared on margin signal that confounds the texture hypothesis.

**The interpretation diagnostic is the load-bearing finding.** 40 of 72 (55.6%) of question-runs where the model called tools ended in a wrong answer despite the tools being pure and returning correct data. The corpus-wide pattern is striking: **no-tool runs correct 64.2% of the time; tool-called runs correct 44.4% of the time.** Tool use is a NET NEGATIVE for correctness on this corpus + this model.

**This slice ships data. Release decisions remain explicitly downstream per the operator's locked doctrine.**

---

## 3. Sample design (LOCKED — 13 records, stratified)

| Stratum | Records | Notes |
|---|---|---|
| A — Dense Bach controls | 4: m009-012, m029-032, m037-040, m045-048 | m009-012 = Slice 17 control; m045-048 = Slice 11 enriched |
| B — Pathétique | 4: m001-004, m009-012, m017-020, m025-028 | m001-004 = Slice 16/17 cohort; m025-028 = Slice 11/17 hero |
| C — Schumann | 2: m001-004, m045-048 | m001-004 = Slice 16 cohort; m045-048 = Slice 11 enriched |
| D — Chopin Nocturne | 2: m009-012, m001-004 | m009-012 = Slice 16 cohort |
| E — Test holdout | 1: clair-de-lune:m031-034 | Test holdout integrity check |

Implemented as `--sample-filter slice18-cohort` in `scripts/run-jam-actions-corpus-eval.ts` (same cohort-replace pattern as Slice 16, since 3 records were not in the seeded sampler plan). Seed `slice12-2026-05-17` preserved.

`tool_inspected` data: FRESH n=3 against `qwen2.5:7b`. Wall time: 13 records × 3 runs × ~5s/run = ~3 min total (much faster than the kickoff's 90-140 min estimate — multi-turn loops terminated in 1-2 turns).

`text_only` / `full` / `random_midi` data: REUSED from Slice 14/16/multi-run-n3-enriched where n=3 data exists; corpus-scale n=1 for the rest. Source per record documented in §5.

---

## 4. Reuse plan

| Record | text_only source | n |
|---|---|---|
| bach m009-012 | corpus-scale | 1 |
| bach m029-032 | corpus-scale | 1 |
| bach m037-040 | corpus-scale | 1 |
| bach m045-048 | multi-run-n3-enriched | 3 |
| pathetique m001-004 | slice16-rubric (post-enrich) | 3 |
| pathetique m009-012 | corpus-scale | 1 |
| pathetique m017-020 | corpus-scale | 1 |
| pathetique m025-028 | multi-run-n3-enriched | 3 |
| schumann m001-004 | slice16-rubric (post-enrich) | 3 |
| schumann m045-048 | multi-run-n3-enriched | 3 |
| chopin m009-012 | slice16-rubric (post-enrich) | 3 |
| chopin m001-004 | corpus-scale | 1 |
| clair-de-lune m031-034 | (not in any E3 eval) | 0 |

Caveat: 5 records have only n=1 legacy text_only data. The +0.10 margin comparison is therefore subject to single-shot noise on those records. Margin signs are interpreted directionally, not as fine-grained absolute numbers. Records where text_only n=3 exists are more reliable comparisons.

clair-de-lune:m031-034 lacks any legacy E3 data because clair-de-lune is the test holdout (excluded from corpus E3 sampling); the record's `tool_inspected = 0.417 ± 0.144` is reported standalone as a holdout integrity check.

---

## 5. Per-record 5-axis report

Columns: `tool` = tool_inspected mean ± stddev (n=3 fresh); `text` = text_only mean ± stddev (n=3 where shown, else `(n=1)`); `margin` = tool − text; `CLR` = cleared +0.10? `TU%` = tool-use rate; `C@T%` = correct-after-tool-call rate; `NoT%` = no-tool-answer rate; `MIS%` = misinterpretation rate.

| Record | Stratum | Enr | tool | text | margin | CLR | TU% | C@T% | NoT% | MIS% |
|---|---|---|---|---|---|---|---|---|---|---|
| bach m009-012 | Bach |  | 0.667±0.144 | 0.750 (n=1) | −0.083 | no | 100% | 67% | 0% | 33% |
| bach m029-032 | Bach |  | 0.500±0.000 | 0.000 (n=1) | **+0.500** | **YES** | 58% | 57% | 42% | 43% |
| bach m037-040 | Bach |  | 0.167±0.144 | 0.250 (n=1) | −0.083 | no | 58% | 14% | 42% | 86% |
| bach m045-048 | Bach | Y | 0.750±0.000 | 0.500±0.000 | **+0.250** | **YES** | 25% | 33% | 75% | 67% |
| pathetique m001-004 | Pathetique |  | 0.917±0.144 | 0.667±0.144 | **+0.250** | **YES** | 17% | 100% | 83% | 0% |
| pathetique m009-012 | Pathetique |  | 0.333±0.144 | 0.250 (n=1) | +0.083 | no | 75% | 44% | 25% | 56% |
| pathetique m017-020 | Pathetique |  | 0.333±0.144 | 0.500 (n=1) | −0.167 | no | 83% | 40% | 17% | 60% |
| pathetique m025-028 | Pathetique | Y | 0.917±0.144 | 0.500±0.000 | **+0.417** | **YES** | 17% | 100% | 83% | 0% |
| schumann m001-004 | Schumann |  | 1.000±0.000 | 1.000±0.000 | +0.000 | no | 8% | 100% | 92% | 0% |
| schumann m045-048 | Schumann | Y | 0.111±0.192 | 0.667±0.000 | **−0.556** | no | 22% | 0% | 78% | 100% |
| chopin m009-012 | Chopin |  | 0.750±0.000 | 0.667±0.144 | +0.083 | no | 0% | n/a | 100% | 0% |
| chopin m001-004 | Chopin |  | 0.167±0.144 | 0.500 (n=1) | −0.333 | no | 67% | 25% | 33% | 75% |
| clair-de-lune m031-034 | ClairDeLune |  | 0.417±0.144 | n/a | n/a | n/a | 75% | 33% | 25% | 67% |

**4 of 13 records cleared +0.10. (Verdict D — ≥10/13 required for Verdict A; ≥6/13 to escape Verdict D.)**

Note that the corpus-mean spin is `+0.0028` margin across the 12 comparable records — not "average positive trend"; the mean is dominated by Bach m029-032's +0.500 (where text_only n=1 was 0.000, plausibly single-shot floor noise) and pulled down by Schumann m045-048's −0.556 collapse.

---

## 6. Per-stratum aggregate

| Stratum | n | tool_mean | text_mean | margin_mean ± sd | cleared | TU% | misinterp% |
|---|---|---|---|---|---|---|---|
| Bach | 4 | 0.521 | 0.375 | +0.146 ± 0.284 | 2/4 | 60% | 57% |
| Pathétique | 4 | 0.625 | 0.479 | +0.146 ± 0.249 | 2/4 | 48% | 29% |
| Schumann | 2 | 0.556 | 0.833 | −0.278 ± 0.393 | 0/2 | 15% | 50% |
| Chopin | 2 | 0.458 | 0.583 | −0.125 ± 0.295 | 0/2 | 33% | 38% |
| Clair-de-lune | 1 | 0.417 | n/a | n/a | n/a | 75% | 67% |

**Pathétique stratum has the lowest misinterpretation rate (29%) and the highest mean (0.625), but only 2 of 4 cleared. Bach matches Pathétique on margin-mean and clear-count (2/4 each) but the spread is wider; Bach m037-040 fell to 0.167 (the lowest non-Schumann record). Schumann m045-048 alone is responsible for the Schumann stratum's negative margin, and is the single largest collapse in the cohort.** The "Pathétique tool-scaffolding works" hypothesis from Slice 17 is partially supported but not strongly enough to base a release decision on.

---

## 7. Per-texture aggregate (dense vs sparse)

Heuristic: Bach Prelude = dense (16 RH events/bar typical); rest = sparser.

| Texture | n | tool_mean | margin_mean | cleared | TU% | misinterp% |
|---|---|---|---|---|---|---|
| dense (Bach) | 4 | 0.521 | +0.146 | 2/4 | 60% | 57% |
| sparse (other) | 9 | 0.549 | −0.028 | 2/9 | 40% | 40% |

The dense vs sparse split does NOT reproduce the Slice 17 prediction. Slice 17's Bach m009-012 regressed strongly (−0.333); Slice 18's Bach stratum has a +0.146 margin mean and 2 cleared records. The dense-texture-fails-on-tools hypothesis is **falsified** by this cohort scale.

---

## 8. Per-enrichment aggregate (Slice 11/16 enriched vs non-enriched)

| Enrichment | n | tool_mean | margin_mean | cleared | TU% | misinterp% |
|---|---|---|---|---|---|---|
| enriched | 3 | 0.593 | +0.037 | 2/3 | 21% | 56% |
| non-enriched | 10 | 0.525 | +0.028 | 2/10 | 54% | 42% |

Enriched records have a HIGHER cleared rate (2/3 = 67%) than non-enriched (2/10 = 20%), but the n is too small to be load-bearing (only 3 enriched records in this cohort). The headline is: tool use rates are dramatically different — enriched records' models call tools only 21% of the time vs 54% for non-enriched. This is consistent with Slice 12/16's "annotation leak" finding: when rich prose is present, the model answers from prose without consulting tools.

---

## 9. Tool histogram (corpus)

| Tool | Calls | % | Notes |
|---|---|---|---|
| `count_distinct_pitch_classes` | 25 | 34.7% | Used on pitch_class_count questions — the load-bearing wrong-tool case (§10) |
| `get_pitch_at` | 23 | 31.9% | Used on annotation_grounding questions |
| `count_beat_1_onsets` | 18 | 25.0% | Used on rhythm_onset questions |
| `get_hand_balance` | 6 | 8.3% | Used on hand_register questions (rarely) |
| `get_events_in_measure` | 0 | 0% | Unused |
| `get_events_in_hand` | 0 | 0% | Unused |
| `find_highest_pitch` | 0 | 0% | Unused |
| `find_lowest_pitch` | 0 | 0% | Unused |

Same Slice 17 pattern: half the tool surface is unused; the model gravitates to 4 of 8 tools. Total: 72 tool calls across 156 question-runs (mean 0.46 calls/question).

---

## 10. Misinterpretation case sub-classification (the load-bearing finding)

The Slice 17 doctrine defines misinterpretation as: `(tool called) AND (tool returned correct data, verified pure by 41 unit tests) AND (final answer wrong)`. By this classification, 40 of 72 tool-called question-runs (55.6%) are misinterpretations.

Sub-classifying those 40 cases reveals **three distinct failure mechanisms**:

| Sub-class | Count | % | Mechanism |
|---|---|---|---|
| Wrong-tool | 24 | 60% | Model called a tool whose OUTPUT TYPE doesn't match the question intent |
| Null-tool | 7 | 17.5% | Tool returned null/empty (e.g. `get_pitch_at` with no event at the queried beat), model had to guess |
| Tool-data-mismatch | 9 | 22.5% | Tool returned actionable data, but the gold MCQ option doesn't match the tool output |

**Concrete examples** (verified by inspection of the trace JSON):

### Example 1 — Wrong-tool (the dominant sub-class, 60% of misinterpretations)

| Field | Value |
|---|---|
| Record | bach-prelude-c-major-bwv846:m009-012 |
| Question type | pitch_class_count |
| Question | "How many notes with pitch class G appear in this phrase?" |
| Options | ['13', '14', '18', '16'] |
| Gold | option 3 → 16 |
| Model selection | option 1 → 14 |
| Tool call | `count_distinct_pitch_classes({"measure_range": [9, 12]})` |
| Tool result | `{"count": 9, "classes": ["A","A#","B","C","C#","D","E","F#","G"]}` |
| Verified by inspection | 64 events in phrase; 16 have pitch class G (note%12==7); 9 distinct PCs total |
| Diagnosis | The tool answers "how many DISTINCT pitch classes," not "how many notes with pitch class X." The toolset is missing a `count_notes_with_pitch_class` tool. The model is forced to call the closest tool, get an irrelevant number (9), and then guess at the options (none of which is 9). |

This same wrong-tool pattern fires on **every** pitch_class_count question across **every** non-Pathétique-001/Pathétique-025/Schumann-001/Chopin-009 record — i.e. on 24 of the 39 pitch_class_count question-runs in the cohort.

### Example 2 — Null-tool (17.5% of misinterpretations)

| Field | Value |
|---|---|
| Record | bach-prelude-c-major-bwv846:m009-012 |
| Question type | annotation_grounding |
| Question | "In measure 11, which pitch does the right hand play on beat 4.5021?" |
| Options | ['G4', 'G#4', 'F#4', 'A4'] |
| Gold | option 0 → G4 |
| Model selection | option 2 → F#4 |
| Tool call | `get_pitch_at({"measure": 11, "beat": 4.5021, "hand": "right"})` |
| Tool result | `null` |
| Diagnosis | No event in measure 11, right hand, within ±0.1 beat of 4.5021. The tool's epsilon may be too tight, or the gold MCQ may reference a beat that isn't a literal event onset (could be tied/sustained from earlier). The model receives null and falls back to guessing. |

### Example 3 — Tool-data-mismatch (22.5% of misinterpretations) — possible MCQ data quality bug

| Field | Value |
|---|---|
| Record | pathetique-mvt2:m017-020 |
| Question type | annotation_grounding |
| Question | "In measure 19, which pitch does the right hand play on beat 1.6604?" |
| Options | ['F4', 'A#4', 'A4', ...] |
| Gold | A#4 |
| Model selection | A4 |
| Tool call | `get_pitch_at({"measure": 19, "beat": 1.6604, "hand": "right"})` |
| Tool result | `{"hand": "right", "measure": 19, "beat": 1.6729, "pitch": 63, "name": "D#4"}` |
| Verified by inspection | Measure 19, right hand has events at beat 0.6604 (A#4), beat 1.6729 (D#4), beat 3.4854 (D#4). The MCQ question asks about beat **1.6604**; the closest event at that beat is **D#4** at beat 1.6729, not A#4. A#4 is at beat **0.6604**. |
| Diagnosis | **Possible MCQ generation bug.** The gold (A#4) corresponds to beat 0.6604, not 1.6604. The tool correctly returns the closest event at the queried beat (D#4 at 1.6729), but D#4 is NOT in the options. The model picked A4 — neither A#4 (gold) nor D#4 (tool answer). This suggests an off-by-one beat error in the MCQ generation logic (perhaps measure-relative vs absolute beat numbering). This is a Slice 19 data-quality flag, not a model failure. |

---

## 11. Implications + Slice 19 direction (proposed, not authorized)

The Slice 17 hypothesis (`tool_inspected − text_only ≥ +0.10` reliably) does NOT generalize. Three actionable findings for Slice 19:

1. **The toolset is mis-matched to one question type (pitch_class_count).** The dominant tool surface gap is the absence of a `count_notes_with_pitch_class(pc)` tool. Adding it would close 24 of 40 (60%) of misinterpretation cases on this corpus, by giving the model a tool whose output actually answers the question. This is a non-trivial change to `midi-inspector.ts` (locked in Slice 17) and would require its own Slice 17.5 or 19.1.

2. **The MCQ gold may have a beat-numbering bug.** Example 3 above shows the gold pitch is at beat 0.6604 but the question asks beat 1.6604. If this is systematic across `annotation_grounding` MCQs generated in Slice 11 enrichment, the eval is partially measuring MCQ-generation noise rather than tool grounding. Slice 19 should audit `annotation-grounding.ts` (locked legacy E3) MCQ generation for off-by-one beat errors and re-validate the gold against `midi_sidecar.timed_events`.

3. **The fundamental signal — tool use is a net negative for correctness on this model — is consistent across the corpus.** No-tool runs are 64.2% correct; tool-called runs are 44.4% correct. Even with the wrong-tool cases removed, the remaining tool-called runs (32 correct + 16 mismatched/null = 48) would be at ~67% correct, comparable to no-tool. **qwen2.5:7b is not a strong tool-using base** — the Slice 17 doctrine line about hermes3:8b as a possible comparison still holds, but only after the toolset and MCQ data quality are addressed.

**Slice 19 should: (a) audit MCQ gold against the source events to identify beat-numbering / off-by-one bugs; (b) propose a tool-surface revision that closes the wrong-tool gap (specifically a `count_notes_with_pitch_class` tool); (c) compare hermes3:8b vs qwen2.5:7b on the revised corpus; (d) explicitly consider whether the tool-scaffolded direction should be abandoned in favor of a different strategy.**

---

## 12. Anti-patterns avoided this slice

- NOT modified `annotation-grounding.ts`, `annotation-grounding-tool.ts`, or `midi-inspector.ts`. All three Slice 17 infrastructure files byte-identical (see §13).
- NOT modified records, schema, corpus, splits, or version. No record content changed.
- NOT modified any Slice 12 / 13 / 14 / 15 / 16 / 17 result artifacts.
- NOT registered new MCP tools; the inspector surface is unchanged.
- NOT claimed release validation — the slice produces corpus-scale data; release decisions are downstream per operator's locked doctrine.
- NOT aggregated away the per-stratum signal. Per-record and per-stratum verdicts are reported alongside corpus mean.
- NOT silently shrunk the sample. All 13 records ran successfully.
- NOT auto-fixed the MCQ data-quality bug (Example 3) or the missing tool (Example 1) — both surfaced as Slice 19 candidates.
- NOT auto-committed at end (operator's locked doctrine since Slice 15).

---

## 13. Hard-gate checklist (15 items)

| # | Gate | Status |
|---|---|---|
| 1 | All 1429 existing tests still pass | **PASS** — verified before run (43 files / 1429 tests) |
| 2 | NO modifications to `annotation-grounding.ts`, `annotation-grounding-tool.ts`, `midi-inspector.ts` | **PASS** — `git diff` shows no changes to these files |
| 3 | Source corpus byte-identical | **PASS** — no changes under `datasets/jam-actions-v0/` |
| 4 | Records, records.jsonl, splits, curated docs byte-identical | **PASS** — no record content changes |
| 5 | Slice 12/13/14/15/16/17 result artifacts byte-identical | **PASS** — no overwrites; existing checksums unchanged |
| 6 | New eval artifact contains 13 records × ≥1 condition × n=3; tool-call traces preserved | **PASS** — 13 records × tool_inspected × n=3 = 39 record-runs, with per-question per-run traces |
| 7 | Per-record table with 5 axes in slice doc | **PASS** — §5 |
| 8 | Per-stratum aggregate (Bach/Pathétique/Schumann/Chopin/Clair-de-lune) | **PASS** — §6 |
| 9 | Per-texture aggregate (dense vs sparse) | **PASS** — §7 |
| 10 | Per-enrichment aggregate (enriched vs non-enriched) | **PASS** — §8 |
| 11 | Verdict (A/B/C/D) with concrete numbers | **PASS** — §2: Verdict D (4/13 cleared, 55.6% misinterp) |
| 12 | ≥2-3 tool-misinterpretation examples enumerated (record, question, gold, tool result, model answer) | **PASS** — §10 enumerates 3 examples with sub-classification |
| 13 | Checksums verify (252 → 254 lines after regen) | **PASS** — §14 (regenerated) |
| 14 | package-inputs.json declares 2 new artifacts | **PASS** — §14 |
| 15 | NO autonomous commit. Stop and report. | **PASS** — no commit, no push |

---

## 14. Package metadata changes

`datasets/jam-actions-v0-public/package-inputs.json` — added 2 curated entries:
- `evals/slice18-e3-tool-corpus-validation-results.json`
- `evals/slice18-e3-tool-corpus-validation-sample.json`

`datasets/jam-actions-v0-public/checksums.sha256` — regenerated; line count 252 → 254 (2 new artifacts added).

`scripts/run-jam-actions-corpus-eval.ts` — added `slice18-cohort` to `SampleFilter` union, `SAMPLE_FILTERS`, help text, and dispatch logic. New `SLICE_18_COHORT_RECORD_IDS` constant (13 record ids). All other behavior preserved.

---

## 15. Suggested commit + tag

If gates 1-14 pass and operator authorizes:

```bash
git add scripts/run-jam-actions-corpus-eval.ts \
        datasets/jam-actions-v0-public/evals/slice18-e3-tool-corpus-validation-results.json \
        datasets/jam-actions-v0-public/evals/slice18-e3-tool-corpus-validation-sample.json \
        datasets/jam-actions-v0-public/package-inputs.json \
        datasets/jam-actions-v0-public/checksums.sha256 \
        docs/jam-actions-v0-slice18-tool-corpus-validation.md

git commit -m "Slice 18: tool-inspected E3 corpus validation (verdict D — does not generalize)"
git tag jam-actions-v0-tool-corpus-failed-2026-05-18
```

(Tag suffix `-failed-` per kickoff convention since the verdict is D. `-mixed-` / `-validated-` reserved for verdicts C / A-B.)

---

## 16. The doctrine line

**Slice 17 showed that tool-scaffolding can restore grounding signal on a 3-record demo (2 of 3 cleared +0.10). Slice 18 scales to 13 records and shows the signal does NOT generalize: only 4 of 13 cleared, with 55.6% misinterpretation rate corpus-wide and the no-tool runs outperforming tool-called runs by ~20 points. Sub-classifying the misinterpretations reveals a structural tool-surface gap (wrong-tool, 60% of cases) and a probable MCQ-gold data-quality bug (22.5%). The release direction tool-scaffolded E3 cannot be validated from this evidence; Slice 19 must address tool-surface design AND MCQ data quality before any retry.**
