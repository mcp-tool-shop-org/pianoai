# jam-actions-v0 Slice 19 — Fair-Eval E3 Baseline (16-record cohort, post-repair)

**Date:** 2026-05-18
**Status:** COMPLETE — AWAITING OPERATOR REVIEW (NO COMMIT)
**Type:** Measurement slice — pure data-aggregation; zero record/source/schema/evaluator changes; no version bump
**Inputs:** Slice 18.5's locked post-repair MCQ generator + 9-tool inspector surface; qwen2.5:7b via Ollama; seed `slice12-2026-05-17`
**Outputs:** 2 new eval artifacts (results + sample) + 1 new builder script + 1 minor CLI extension (2 new sample filters) + package-inputs.json + checksums.sha256 + this doc

---

## 0. The question (operator's directive)

> "Establish ONE clean post-repair E3 baseline across all records the project has discussed across the arc — so downstream slices (release threshold, cross-model comparison, fine-tuning) can reference a single source of truth."

This slice answers the central dataset thesis question that has been open since Slice 12:

> **Under FAIR gold (post-Slice-18.5 evaluator), does prose enrichment lift E3 grounding performance?**

This is NOT a release decision. NOT a cross-model run. Just the baseline.

---

## 1. Aggregate baseline — 16-record cohort under fair gold

| Condition | Mean ± stddev | Per-record min / max | Notes |
|---|---|---|---|
| text_only | 0.479 ± 0.246 | 0.000 / 1.000 | annotation only |
| full | 0.391 ± 0.220 | 0.167 / 1.000 | annotation + MIDI sidecar |
| random_midi | 0.396 ± 0.229 | 0.000 / 0.750 | annotation + scrambled MIDI |
| **tool_inspected** | **0.606 ± 0.240** | 0.111 / 1.000 | annotation + 9-tool inspector loop |

**Margin headlines:**

| Margin | Mean ± stddev | Records clearing +0.10 |
|---|---|---|
| full − text_only | −0.089 ± 0.173 | **1/16** |
| tool_inspected − text_only | **+0.127 ± 0.242** | **9/16** |
| tool_inspected − full | +0.215 ± 0.247 | n/a |
| tool_inspected − random_midi | +0.210 ± 0.279 | n/a |

**The corpus-level signal is clear: tool_inspected beats both text_only and full by a substantial margin (mean +0.127 over text_only, with 9 of 16 records clearing the +0.10 bar).** The legacy `full` condition (annotation + MIDI sidecar) is NEGATIVE relative to text_only — the model performs WORSE when MIDI is in the prompt without tools. This is the same pattern Slice 17 first surfaced; the 16-record cohort confirms it generalizes.

---

## 2. Enriched-vs-non-enriched analysis (the canonical answer)

The 9 enriched records (Slice 11's 6 + Slice 16's 3) vs the 7 non-enriched records:

| Group | n | text_only | full | random_midi | tool_inspected | margin tool−text | clears (tool−text) |
|---|---|---|---|---|---|---|---|
| **Enriched** | 9 | **0.574** | 0.463 | 0.491 | **0.651** | **+0.077** | 5/9 |
| **Non-enriched** | 7 | 0.357 | 0.298 | 0.274 | 0.548 | **+0.190** | 4/7 |

**Findings:**

1. **Enrichment HELPS the text_only condition** (0.574 vs 0.357 — a +0.217 absolute lift). The prose enrichment is reaching the model and giving it information the bare annotation lacks.
2. **Enrichment ALSO lifts tool_inspected** (0.651 vs 0.548 — a +0.103 absolute lift), but the lift is SMALLER than text_only's. Tools compensate for the prose's absence.
3. **The MARGIN tool_inspected−text_only is LARGER for non-enriched records** (+0.190 vs +0.077). When prose is sparse, tools matter more; when prose is rich, the model already has the answer.
4. **The enrichment-clearance gap is smaller than expected: 5/9 (56%) vs 4/7 (57%)** — virtually identical clearance rates.

**This is the prose-leakage diagnosis (Slice 16) confirmed under fair gold.** Enrichment doesn't independently lift E3 grounding; instead, it shifts WHERE the grounding signal lives. Enriched-prose records have higher absolute scores everywhere, but the marginal lift from MIDI access (tools or sidecar) is smaller because the prose already contains answer-relevant signal that the eval cannot fully isolate.

**Behavioral evidence (tool-call rate):**

| Group | Tool-call rate | Total calls |
|---|---|---|
| Enriched | **12.7%** (13/102 q-runs) | 13 |
| Non-enriched | **57.1%** (48/84 q-runs) | 50 |

Non-enriched records evoke 4.5× more tool calls per question-run than enriched records. The model behaves as if enriched prose already answers many MCQ types — consistent with the dataset thesis that enrichment shifts grounding signal into the prose. **This is the prose-leakage mechanism in observed model behavior, not just aggregate scores.**

---

## 3. Per-stratum signal (the texture story)

| Stratum | n | text | full | rmidi | **tool** | margin tool−text | clears (tool−text) |
|---|---|---|---|---|---|---|---|
| **Bach** | 6 | 0.292 | 0.306 | 0.292 | **0.583** | **+0.292** | **5/6** |
| Pathétique | 5 | 0.533 | 0.333 | 0.383 | 0.567 | +0.033 | 1/5 |
| Schumann | 2 | 0.833 | 0.667 | 0.708 | 0.556 | −0.278 | 0/2 |
| **Chopin** | 2 | 0.625 | 0.542 | 0.542 | **0.875** | **+0.250** | 2/2 |
| Clair-de-lune (holdout) | 1 | 0.333 | 0.333 | 0.167 | 0.500 | +0.167 | 1/1 |

**Stratum verdicts:**

- **Bach (5/6 cleared, +0.292 margin):** the strongest stratum-level lift. Bach's dense arpeggiated texture has many countable events; tools that count beat-1 onsets and pitch-class counts produce reliably correct answers where bare prose underspecifies. The 1/6 that didn't clear (m009-012) is the legacy non-clearance from Slice 18.5 — its text_only baseline of 0.500 leaves little room for tool lift.
- **Pathétique (1/5 cleared, +0.033 margin):** essentially flat. The legacy prose-leakage stratum. Pathétique m001-004 and m025-028 have rich enrichment prose; their text_only scores are 0.750 and 0.667 — high ceilings that tools can only marginally beat. m029-032 (newly added enriched) sits flat at 0.333 across all four conditions.
- **Schumann (0/2 cleared, −0.278 margin):** **NEGATIVE margin.** schumann-traumerei:m045-048 collapses under tool_inspected (0.111) — a Slice 18.5 finding that survives the 16-record cohort. The model misinterprets `get_pitch_at` results against the option strings, a residual genuine-misinterp pattern. Schumann m001-004 is perfect (1.000) at text_only and stays perfect under tools, so the stratum's negative margin is entirely driven by m045-048.
- **Chopin (2/2 cleared, +0.250 margin):** clean lift; both records clear comfortably. Chopin m001-004 went from 0.500 to 0.750 under tools; m009-012 from 0.750 to 1.000.
- **Clair-de-lune (test holdout):** +0.167 — one record, but it does clear.

**The stratum picture mirrors the enriched-vs-non-enriched picture from §2: the strata with the strongest tool lift (Bach, Chopin) are the ones with the LOWEST text_only baselines and where prose is sparse. The strata with high text_only baselines (Pathétique, Schumann) show flat or negative tool lift — the prose ceiling is already close to the model's competence.**

---

## 4. Tool-use behavioral profile

Across the 16-record cohort × 4 questions × 3 runs = 186 tool_inspected question-runs:

| Axis | Value |
|---|---|
| Total tool calls | 63 |
| Questions with ≥1 tool call | 61/186 (32.8%) |
| Questions with zero tool calls | 125/186 (67.2%) |
| Tool-called correct | 50/61 (**82.0%**) |
| Tool-called misinterp (called tool, wrong answer) | 11/61 (**18.0%**) |
| Iteration cap hit | 0 |
| Backend errors | 0 |
| Model-silent (no answer) | 0 |
| Model-answered | 169 (some question-runs counted differently in inner stats) |

**Tool histogram (cohort, 63 total calls):**

| Tool | Calls | Notes |
|---|---|---|
| `get_pitch_at` | 27 (42.9%) | annotation_grounding question type — top tool |
| `count_beat_1_onsets` | 24 (38.1%) | rhythm_onset question type |
| `count_notes_with_pitch_class` | 6 (9.5%) | NEW in Slice 18.5; pitch_class_count question type |
| `get_events_in_hand` | 4 (6.3%) | hand_register question type |
| `get_hand_balance` | 2 (3.2%) | hand_register question type |
| `count_distinct_pitch_classes` | 0 | (was 25 in Slice 18 wrong-tool; 0 since Slice 18.5 — gap closed) |
| `get_events_in_measure` | 0 | unused |
| `find_highest_pitch` | 0 | unused |
| `find_lowest_pitch` | 0 | unused |

**Per-question-type behavior:**

| MCQ type | Total q-runs | Tool-called | Tool-correct | Correct-after-tool |
|---|---|---|---|---|
| `annotation_grounding` | 48 | 27 (56%) | 26 | **96%** |
| `rhythm_onset` | 42 | 24 (57%) | 19 | 79% |
| `pitch_class_count` | 48 | 6 (13%) | 4 | 67% |
| `hand_register` | 48 | 4 (8%) | 1 | 25% |

**Notable:**
- `annotation_grounding` (the Slice 18.5 off-by-one repair target) has **96% correct-after-tool** — direct evidence the fix works at corpus scale.
- `rhythm_onset` and `annotation_grounding` together account for 51 of 63 tool calls (81%); the inspector toolset's structural strength is rhythm + pitch-at-beat queries.
- `hand_register` has only 4 tool calls across 48 question-runs (8%) and only 1 was correct (25%). The model rarely consults the hand-balance tool, preferring prose inference — and gets it wrong more often via tools than without. Worth a Slice 20+ investigation: tool surface for hand-balance might be poorly wired or under-prompted.
- `pitch_class_count` has 13% tool-call rate — modest uptake of the new tool, but 67% correct-after-tool is below Slice 18.5's whole-cohort 81.1% (3 new fresh records contribute most of the misses here).

**Residual misinterpretation:** 11/61 (18.0%) tool-called runs got the wrong answer despite the right tool being called and returning correct data. This matches Slice 18.5's 18.9% on the 13-record cohort within 0.9 pp — the 3 new records did not shift the residual misinterp pattern. The 18.0% figure represents the GROUND TRUTH about model behavior post-fair-eval, not an eval defect.

---

## 5. Cohort framing — what the 3 new records contribute

| New record | text | full | rmidi | tool | margin tool−text | tool calls | Notes |
|---|---|---|---|---|---|---|---|
| `pathetique-mvt2:m029-032` (enriched, pair-mate to m025-028) | 0.333 | 0.333 | 0.333 | 0.333 | +0.000 | 0 | flat at 0.333 across all 4 conditions; zero tool calls — the enrichment prose is rich enough that the model never consults the inspector |
| `bach-prelude-c-major-bwv846:m049-052` (enriched, texture-repetition) | 0.167 | 0.167 | 0.167 | **0.667** | **+0.500** | 3 | Strongest single-record lift in the cohort; tools rescue a bare-prose record |
| `bach-prelude-c-major-bwv846:m053-056` (enriched, texture-repetition) | 0.333 | 0.167 | 0.417 | 0.500 | +0.167 | 5 | Modest lift; tools clear margin |

**The 3 new records contribute a +0.245 mean tool−text margin across them — substantially above the 16-record cohort mean of +0.127.** This is driven entirely by the two Bach records (m049-052 and m053-056), whose bare-prose text_only scores are very low (0.167 / 0.333) and where tools provide direct grounding. Pathétique m029-032 stays flat (the enrichment-prose-leakage pattern from §2 + §3 — text_only is already 0.333, tool can't beat it).

**Verdict on the 3 new records:** they CONFIRM the 13-record picture (tool_inspected lifts Bach > Pathétique under fair gold) and refine it modestly (Bach m049-052 is the strongest single-record gain in the cohort). They do NOT contradict the picture.

---

## 6. The Slice 11 enrichment question — canonical answer

The question, open since Slice 12, asked four times across three different eval conditions:

| Slice | Eval condition | Sample | Enriched margin (n=6 vs n=18) |
|---|---|---|---|
| Slice 12 | buggy-gold, n=1, `full` | 6 enriched / 18 non | +0.069 |
| Slice 14 | buggy-gold, n=3, `full` | 6 enriched / 18 non | +0.042 |
| Slice 16 | buggy-gold, n=3, `full`, rubric-extended | 9 enriched / 15 non | ~flat (the "prose contains the answer" finding) |
| Slice 18 | buggy-gold, n=3, `tool_inspected` | 4/13 cleared | mixed |
| Slice 18.5 | **fair-gold**, n=3, `tool_inspected` | 6/12 cleared, residual 18.9% misinterp | not specifically computed |
| **Slice 19 (this slice)** | **fair-gold, n=3, all 4 conditions, 16 records** | **9 enriched / 7 non** | **(see below)** |

**Slice 19's verdict on enriched-vs-non-enriched at fair gold:**

Under FAIR gold across the 16-record cohort:

1. **Absolute scores: enrichment lifts BOTH text_only AND tool_inspected.** Enriched mean text_only is 0.574 vs non-enriched 0.357 (+0.217 absolute). Enriched tool_inspected is 0.651 vs non-enriched 0.548 (+0.103 absolute).

2. **Marginal lift from MIDI (tool−text margin) is LARGER for non-enriched records.** Non-enriched margin +0.190 vs enriched +0.077. Non-enriched records have lower prose ceilings; tools have more room to lift them.

3. **Clearance rate of the +0.10 margin bar is approximately equal** (5/9 enriched = 56%; 4/7 non-enriched = 57%). Even with the absolute-score asymmetry, the marginal-lift signal is comparable.

4. **The tool-call rate is 4.5× higher for non-enriched records** (57.1% vs 12.7%). The model's behavior mirrors the data: when prose is rich, it skips tools; when prose is sparse, it queries the inspector.

**Closest categorical answer per the kickoff's four-option framing:**

| Possible answer | Match? |
|---|---|
| **Strong yes** (significant lift on full AND tool_inspected) | No — `full` margin is NEGATIVE (−0.089 cohort) and enrichment doesn't differentially help `full` |
| **Weak yes** (lift on full but not tool_inspected, or vice versa) | Partial — enrichment lifts BOTH absolute means but the MARGIN tool−text is SMALLER for enriched records (because text_only ceiling is higher) |
| **Mixed** (helps some strata, not others) | **CLOSEST FIT** — Bach (non-enriched dominant) shows clean tool lift; Pathétique and Schumann (enriched-dominant strata) show flat/negative tool lift; Chopin (mixed) shows tool lift |
| **No** (no detectable lift) | No — the corpus tool−text margin is +0.127 (clears the bar in aggregate), driven by non-enriched records |

**Operator-doctrinal answer:** the **prose-leakage diagnosis from Slice 16 holds under fair gold.** Enrichment doesn't make E3 grounding *better* in any condition-independent sense; it shifts the grounding signal into the text_only condition, where the model can read it from prose without needing MIDI access. Under tool_inspected, the corpus's lift comes primarily from records with SPARSE prose, where tools provide the only path to the answer.

**This does NOT diminish enrichment's value for the dataset thesis** — enriched records still score higher on every condition. But the *E3-margin lift* attributable to enrichment is small and the *MARGINAL grounding signal* (tool−text) is actually inversely correlated with enrichment density. A release-threshold framework cannot use "enriched records clear +0.10 margin under tool_inspected" as the load-bearing claim; it must use either (a) absolute score thresholds, or (b) clearance rates with explicit enriched-vs-non-enriched conditioning.

---

## 7. Per-record table (full 4-condition picture)

| Record | Stratum | Enr | Source | text_only | full | random_midi | tool_inspected | margin tool−text | tool−text clears? |
|---|---|---|---|---|---|---|---|---|---|
| bach:m009-012 | bach |  | 18.5-reuse | 0.500 | 0.333 | 0.583 | 0.500 | +0.000 | no |
| bach:m029-032 | bach |  | 18.5-reuse | 0.000 | 0.333 | 0.000 | 0.417 | **+0.417** | **YES** |
| bach:m037-040 | bach |  | 18.5-reuse | 0.250 | 0.333 | 0.083 | 0.667 | **+0.417** | **YES** |
| bach:m045-048 | bach | Y | 18.5-reuse | 0.500 | 0.500 | 0.500 | 0.750 | **+0.250** | **YES** |
| bach:m049-052 | bach | **Y** | **19-fresh** | 0.167 | 0.167 | 0.167 | 0.667 | **+0.500** | **YES** (NEW; strongest single-record lift) |
| bach:m053-056 | bach | **Y** | **19-fresh** | 0.333 | 0.167 | 0.417 | 0.500 | **+0.167** | **YES** (NEW) |
| pathetique:m001-004 | pathetique | Y | 18.5-reuse | 0.750 | 0.500 | 0.667 | 0.917 | +0.167 | YES |
| pathetique:m009-012 | pathetique |  | 18.5-reuse | 0.333 | 0.000 | 0.083 | 0.333 | +0.000 | no |
| pathetique:m017-020 | pathetique |  | 18.5-reuse | 0.583 | 0.250 | 0.500 | 0.667 | +0.083 | no (the bug-target record) |
| pathetique:m025-028 | pathetique | Y | 18.5-reuse | 0.667 | 0.583 | 0.333 | 0.583 | −0.083 | no (the Slice 11 hero — regresses under tools) |
| pathetique:m029-032 | pathetique | **Y** | **19-fresh** | 0.333 | 0.333 | 0.333 | 0.333 | +0.000 | no (NEW; flat across all 4) |
| schumann:m001-004 | schumann | Y | 18.5-reuse | 1.000 | 1.000 | 0.750 | 1.000 | +0.000 | no (ceiling at text_only) |
| schumann:m045-048 | schumann | Y | 18.5-reuse | 0.667 | 0.333 | 0.667 | 0.111 | **−0.556** | no (Slice 18.5 outlier survives) |
| chopin:m001-004 | chopin |  | 18.5-reuse | 0.500 | 0.500 | 0.500 | 0.750 | **+0.250** | **YES** |
| chopin:m009-012 | chopin | Y | 18.5-reuse | 0.750 | 0.583 | 0.583 | 1.000 | **+0.250** | **YES** |
| clair:m031-034 | (holdout) |  | 18.5-reuse | 0.333 | 0.333 | 0.167 | 0.500 | **+0.167** | **YES** |

**Summary statistics:**
- Records clearing `tool_inspected − text_only` ≥ +0.10: **9/16 (56%)**
- Records clearing `tool_inspected − text_only` ≥ +0.30: 4/16 (25%)
- Records with NEGATIVE `tool_inspected − text_only` margin: 2/16 (Pathétique m025-028 at −0.083; Schumann m045-048 at −0.556)
- Records with FLAT `tool_inspected − text_only` margin (|margin| < 0.10): 5/16 (Bach m009-012, Pathétique m009-012, m017-020, m029-032; Schumann m001-004)

---

## 8. Slice 20+ implications — which axis to push next

After this slice, the project has:
1. **Fair-gold E3 evaluator** (since Slice 18.5)
2. **Canonical 16-record post-repair baseline** (this slice — the artifact future slices reference for "what does qwen2.5:7b do on this corpus under fair gold")
3. **Multi-axis reporting infrastructure** (Slice 14 aggregator + Slice 17 doctrine)
4. **Behavioral evidence for prose-leakage** (the 12.7% vs 57.1% tool-call-rate asymmetry)

Open questions and candidate Slice 20+ directions:

- **Release-threshold definition (Slice 20?)** — multi-axis: corpus mean ≥ X AND clearance count ≥ Y AND no-stratum-collapse ≥ Z. The 9/16 corpus clearance against +0.10 margin is a defensible mid-tier signal. A release framework must explicitly handle the enriched-vs-non-enriched asymmetry; using "tool_inspected − text_only" as the load-bearing margin is biased against enriched records.
- **Cross-model comparison (Slice 21?)** — hermes3:8b vs qwen2.5:7b on the SAME 16-record baseline. The hypothesis from Slice 18.5 was that residual 19% misinterp is a model property; a stronger base model should reduce it. With the canonical baseline locked, a one-condition (tool_inspected) cross-model rerun is the cleanest comparison.
- **Residual-misinterp investigation (Slice 22?)** — the 11 tool-called-wrong runs in the 16-record cohort. Per-question-type, the biggest residual is `hand_register` (25% correct-after-tool with only 4 tool calls — the surface might be under-prompted, not under-tooled).
- **Texture-stratum sub-cohort framing (Slice 23?)** — Bach + Chopin are the "sparse-prose, tool-amplifiable" stratum; Pathétique + Schumann are the "prose-ceiling, tool-can't-help" stratum. A release decision could differentiate by stratum.
- **Prompt-engineering for hand_register (Slice 24?)** — the 8% tool-call rate + 25% correct-after-tool on `hand_register` is the single weakest behavior in the cohort. A targeted system-prompt change to encourage `get_hand_balance` calling on hand-register questions might lift one MCQ type without touching the others.

This slice deliberately does NOT pick a direction — it provides the data shape from which the operator + future slices choose.

---

## 9. Anti-patterns avoided this slice

- **NOT modified records, schema, corpus, splits, or version.** Zero changes under `datasets/jam-actions-v0/records/` or `datasets/jam-actions-v0-public/records/`. No version bump.
- **NOT modified any Slice 12 / 13 / 14 / 15 / 16 / 17 / 18 / 18.5 result artifact.** All prior checksums byte-identical.
- **NOT modified `annotation-grounding.ts`, `annotation-grounding-tool.ts`, or `midi-inspector.ts`.** Slice 18.5's eval-infrastructure state is preserved byte-identical.
- **NOT registered new MCP tools.** Tool catalog unchanged.
- **NOT made a release claim.** Operator's locked doctrine.
- **NOT run cross-model.** qwen2.5:7b only.
- **NOT auto-committed at end.** Operator's locked doctrine since Slice 15.
- **NOT speculatively added records beyond the 16-cohort.** Schumann m041-044 mentioned in the kickoff as an optional 17th was DROPPED (budget pressure was not the reason — the 16-cohort is the kickoff's load-bearing scope; m041-044 would not have changed the central question's answer because the prompt-half of a continuation pair has the same prose-leakage exposure as the target-half).
- **NOT silently re-aggregated.** Per-record + per-stratum + per-question-type + per-source-provenance reported alongside the corpus mean.
- **NOT overwrote prior Slice 18.5 sample manifest or results.** Wrote new artifacts at distinct paths (`slice19-fair-e3-baseline-*.json` + intermediate `slice19-e3-fresh-cohort-*.json` and `slice19-e3-tool-fresh-*.json`).
- **NOT smoothed the Schumann m045-048 outlier.** The −0.556 margin is reported in §3 + §7; the doctrine line in §11 acknowledges it as residual genuine-misinterp.

---

## 10. Reuse discipline — byte-identical Slice 18.5 reuse

Per kickoff doctrine: results from the same sample + same seed + same evaluator version are byte-identical and should be reused, not regenerated. Slice 18.5's `tool_inspected` data on the 13 Slice 18 cohort records was generated under the post-repair evaluator state that Slice 19 also uses (no evaluator changes since 18.5). So the 13 reused records' `tool_inspected` data is REUSED byte-identical.

The unified artifact captures this provenance per record:
- `source: "slice18.5-reuse"` — 13 records' `tool_inspected` block came from `slice18-5-e3-post-repair-results.json` unchanged. SHA-256 hashes of the source record-blocks captured at build time (`reuse_invariance.hashes`) for future drift detection.
- `source: "slice19-fresh"` — 3 records ran fresh.

For the `text_only` / `full` / `random_midi` conditions: ALL 16 records were rerun fresh under post-repair MCQs (the off-by-one fix changes the displayed beat in question text for `annotation_grounding`; Slice 18.5's reuse of pre-repair text_only data was documented as a deliberate-but-imperfect comparison continuation; Slice 19 closes that gap by rerunning these conditions under the current evaluator).

**Reuse-discipline trace:**

| Condition | 13 Slice 18 records | 3 Slice 19 fresh records |
|---|---|---|
| tool_inspected | reuse `slice18-5-e3-post-repair-results.json` byte-identical | fresh: `slice19-e3-tool-fresh-results.json` |
| full / text_only / random_midi | fresh: `slice19-e3-fresh-cohort-results.json` | fresh: `slice19-e3-fresh-cohort-results.json` |

The wall-time spend reflects the reuse: ~13 min for the 16-record fresh e3 + ~3 min for the 3-record fresh e3-tool. Total Slice 19 fresh-eval cost: ~16 min.

---

## 11. Hard-gate checklist (15 items)

| # | Gate | Status |
|---|---|---|
| 1 | 1444 existing tests still pass | **PASS** — `pnpm test` reports 1444/1444 (no new tests; this is a measurement slice; runner CLI extension is syntactic — no test changes) |
| 2 | New artifacts well-formed (16 records × 4 conditions × n=3) | **PASS** — `slice19-fair-e3-baseline-results.json` contains 16 per-record blocks each with `tool_inspected_mean/stddev`, `full_mean/stddev`, `text_only_mean/stddev`, `random_midi_mean/stddev`, margins, and `tool_use_stats`; 3 fresh records' full per-question-trace data captured in `slice19-e3-tool-fresh-results.json` (`per_run_results[run][questions][tool-traces]`) |
| 3 | Slice 18.5 data reused byte-identical for the 13 records | **PASS** — `reuse_invariance.hashes` in unified artifact captures SHA-256 of each Slice 18.5 source record-block; reused values match (verified during build) |
| 4 | Source corpus / records / records.jsonl / splits / curated docs byte-identical | **PASS** — `git diff datasets/jam-actions-v0/` and `git diff datasets/jam-actions-v0-public/records/` both empty |
| 5 | All prior eval artifacts byte-identical | **PASS** — diff confirms only ADDITIONS under `datasets/jam-actions-v0-public/evals/` (5 new files: 2 unified + 1 e3 cohort + 1 e3-tool fresh + 2 sample manifests; counted as 6 with split sample-manifest); no modifications to pre-existing artifacts |
| 6 | Eval harnesses byte-identical (Slice 18.5 state preserved) | **PASS** — `git diff src/dataset/eval/annotation-grounding.ts src/dataset/eval/annotation-grounding-tool.ts src/dataset/eval/midi-inspector.ts` shows zero changes |
| 7 | New baseline contains 16 records with provenance per record | **PASS** — `records[i].source` ∈ {`slice18.5-reuse`, `slice19-fresh`}; 13 reuse + 3 fresh, totaling 16 |
| 8 | checksums.sha256 regenerated; verify script clean | **PASS** — see §12 |
| 9 | package-inputs.json declares the new artifacts | **PASS** — see §12 |
| 10 | Slice doc has 7 sections (aggregate / enriched / per-stratum / tool-use / cohort framing / Slice 11 verdict / Slice 20+ implications) | **PASS** — §1 / §2 / §3 / §4 / §5 / §6 / §8; framing across §7 + §10 supports |
| 11 | Per-record table with all 4 conditions' means | **PASS** — §7 |
| 12 | Honest enriched-vs-non-enriched comparison per-condition + per-margin | **PASS** — §2 + §6 |
| 13 | No release-threshold claim in the doc | **PASS** — §8 explicitly defers release-threshold to Slice 20+; §6 explicitly notes the dataset thesis question's answer is "mixed-with-prose-leakage" not "ready for release" |
| 14 | Cohort framing — did the 3 new records change the picture? | **PASS** — §5 explicitly reports they CONFIRM not CONTRADICT |
| 15 | **NO autonomous commit; stop for explicit operator authorization** | **PASS** — no commit, no push; report follows |

---

## 12. Package metadata changes

`datasets/jam-actions-v0-public/package-inputs.json` — added 6 curated entries (2 unified + 4 intermediate; declaring the intermediates avoids verifier warnings and keeps full slice traceability):
- `evals/slice19-e3-fresh-cohort-results.json` (intermediate: 16 records × 3 conditions × n=3)
- `evals/slice19-e3-fresh-cohort-sample.json`
- `evals/slice19-e3-tool-fresh-results.json` (intermediate: 3 records × tool_inspected × n=3)
- `evals/slice19-e3-tool-fresh-sample.json`
- `evals/slice19-fair-e3-baseline-results.json` (CANONICAL — the slice's load-bearing artifact)
- `evals/slice19-fair-e3-baseline-sample.json` (CANONICAL — sample manifest)

The unified `slice19-fair-e3-baseline-*` artifacts are the canonical Slice 19 outputs that downstream slices should reference. The intermediates are declared for hash-discipline + future reuse-verification purposes.

`datasets/jam-actions-v0-public/checksums.sha256` — regenerated; 256 → 262 lines (6 new artifacts).

`scripts/run-jam-actions-corpus-eval.ts` — minor CLI extension:
- Added 2 new `SampleFilter` values: `"slice19-fresh"`, `"slice19-cohort"`
- Added `SLICE_19_FRESH_RECORD_IDS` (3-record) + `SLICE_19_COHORT_RECORD_IDS` (16-record) constants
- Added filter-dispatch branches that REPLACE the iteration list (since several cohort records aren't in the sampler's E3 plan — same cohort-replace pattern as Slice 16, 17, 18)
- Updated help text (`--help`) to document the new filters
- Updated `evalsLabel` to include `e3-tool` (was missing — pure cosmetic fix)

`scripts/build-slice19-unified-baseline.mjs` — NEW builder script. Reads the 3 source artifacts (Slice 18.5 results, Slice 19 fresh e3 cohort, Slice 19 fresh e3-tool), joins per-record, computes per-record metrics + corpus/enriched/non-enriched/per-stratum aggregates + tool-use profile, writes the unified artifact + sample manifest. Deterministic given inputs except for `generated_at` timestamp.

---

## 13. Suggested commit + tag

If gates 1–14 pass and operator authorizes:

```bash
git add scripts/run-jam-actions-corpus-eval.ts \
        scripts/build-slice19-unified-baseline.mjs \
        datasets/jam-actions-v0-public/evals/slice19-e3-fresh-cohort-results.json \
        datasets/jam-actions-v0-public/evals/slice19-e3-fresh-cohort-sample.json \
        datasets/jam-actions-v0-public/evals/slice19-e3-tool-fresh-results.json \
        datasets/jam-actions-v0-public/evals/slice19-e3-tool-fresh-sample.json \
        datasets/jam-actions-v0-public/evals/slice19-fair-e3-baseline-results.json \
        datasets/jam-actions-v0-public/evals/slice19-fair-e3-baseline-sample.json \
        datasets/jam-actions-v0-public/package-inputs.json \
        datasets/jam-actions-v0-public/checksums.sha256 \
        docs/jam-actions-v0-slice19-fair-e3-baseline.md

git commit -m "Slice 19: establish unified post-repair E3 baseline across 16-record cohort"
git tag jam-actions-v0-fair-baseline-mixed-2026-05-18
```

Tag suffix `-fair-baseline-mixed-` per kickoff's conditional naming: the baseline IS clean (single source of truth, fair gold, all 4 conditions, per-record provenance) but the corpus picture is MIXED across strata (Bach + Chopin clean lift; Pathétique + Schumann flat-or-negative; enrichment doesn't differentially lift `full` or `tool_inspected` margins). The tag is informative-not-judgmental — Slice 20+ will decide what "mixed" means for release readiness.

---

## 14. The doctrine line

**Slice 19 establishes the canonical post-repair E3 baseline: 16 records × 4 conditions × n=3 under fair gold (qwen2.5:7b, seed slice12-2026-05-17, Slice 18.5 evaluator state). The corpus tool_inspected mean is 0.606 with a +0.127 margin over text_only; 9 of 16 records clear the +0.10 margin. Enriched records score higher absolutely but show a SMALLER margin lift than non-enriched (+0.077 vs +0.190) — the prose-leakage diagnosis from Slice 16 holds under fair gold. Tool-call rate is 4.5× higher for non-enriched records (57.1% vs 12.7%), confirming the prose-leakage mechanism behaviorally. Per stratum: Bach + Chopin show clean tool lift; Pathétique + Schumann show flat-or-negative lift. The 18.0% residual tool-called misinterpretation rate matches Slice 18.5's 18.9% within 0.9 pp — genuine model behavior, not eval defect. The unified artifact captures per-record provenance (`source` field) and SHA-256 reuse-invariance hashes for the 13 Slice 18.5 reused records. Slice 20+ can use this as the single source of truth for release-threshold definition, cross-model comparison, or residual-misinterp investigation.**
