# jam-actions-v0 Slice 22 — RC Gate Revision for Ceiling Effects

**Status:** post-Slice 21 (schumann-attempted-2026-05-19). Pure code +
analysis slice: no model runs, no eval reruns, no new MIDI data, no record
content changes, no version bump. The 7-axis Release Candidate (RC) gate
defined in Slice 20 is amended in two places (axes 2 and 6) to distinguish
three regimes that the original logic conflated.

**Evaluator state (LOCKED):** byte-identical to Slice 21. No changes to
`src/dataset/eval/annotation-grounding.ts`,
`src/dataset/eval/annotation-grounding-tool.ts`, or
`src/dataset/eval/midi-inspector.ts`. Source corpus, records, records.jsonl,
splits all byte-identical. Slice 20's
`evals/slice20-release-gate-assessment.json` and Slice 21's
`evals/slice21-release-gate-assessment.json` byte-identical (historical
record of the pre-revision gate's verdicts).

**Source change:** axes 2 and 6 logic in
`src/dataset/release/release-gate.ts`. Other axes (1, 3, 4, 5, 7) UNCHANGED.
Test count: 1463 → 1491 (+28 tests). Two new assessment artifacts emitted:
`slice22-release-gate-revised-assessment.json` (Slice 21 baseline under
revised gate) and `slice22-release-gate-slice19-regression-check.json`
(Slice 19 baseline under revised gate — must STILL FAIL to preserve
diagnostic power).

---

## 1. The structural problem (Slice 21 recap)

Slice 21 applied an R6-aware annotation rewrite to
`schumann-traumerei:m045-048`. The record's per-record metrics shifted from:

| Metric | Slice 19 (pre-rewrite) | Slice 21 (post-rewrite) |
|---|---|---|
| `tool_inspected_mean` | 0.111 | 1.000 |
| `text_only_mean` | 0.667 | 1.000 |
| `random_midi_mean` | 0.667 | 1.000 |
| `margin_tool − text` | −0.556 | 0.000 |
| Per-record misinterp count | 0 | 0 |

The R6 fix worked at the record level: every condition now answers
correctly, every time. But the Slice 20 release gate's verdict only
partially shifted:

| Axis | Slice 19 verdict | Slice 21 verdict (old gate) |
|---|---|---|
| 1 (corpus tool floor 0.65) | FAIL (0.606) | PASS (0.661) |
| 2 (margin clearance ≥60%) | FAIL (9/16 = 56.25%) | FAIL (9/16 = 56.25%) |
| 6 (no catastrophic stratum) | FAIL (Schumann mean −0.278) | FAIL (Schumann mean 0.000, 0 clearing) |

The structural finding: **records at `text_only_mean = 1.000` cannot
produce a margin ≥ +0.10 by definition.** Any record whose prose is
genuinely answer-bearing saturates text_only at the ceiling, leaving no
arithmetic headroom for tool_inspected to exceed it by +0.10. Schumann
m045's R6-aware rewrite made its prose so clean that all four conditions
saturated at 1.000 — and the original axis 2/6 clauses penalized that
outcome as if it were a grounding failure.

The operator's locked direction: **revise the gate**. More R6 prose
remediation would push text_only upward at every record it touched,
exacerbating the same arithmetic dead zone. The clean fix lives in the
gate definition, not in more record content.

---

## 2. The revised axes 2 and 6 (operator-locked spec)

### Axis 2 (revised)

A record passes axis 2 if EITHER:

- **Bucket A — `margin_pass`** (existing): `margin_vs_text_only ≥ +0.10`
- **Bucket B — `ceiling_saturated_pass`** (new):
  `tool_inspected_mean ≥ 0.90 AND text_only_mean ≥ 0.90 AND
  random_midi_mean ≥ 0.90 AND misinterp_count == 0`

The corpus-level axis-2 threshold (≥60% of records passing) is unchanged
in shape; the meaning of "passing" is now the union of bucket A and
bucket B. The corpus-margin clause (mean ≥ +0.10) is also unchanged.

### Axis 6 (revised)

A stratum passes axis 6 if EITHER:

- **Bucket A** (existing): ≥1 record with `margin_pass`
- **Bucket B** (new): ≥1 record with `ceiling_saturated_pass` AND stratum
  mean margin ≥ −0.10

The "stratum mean margin ≥ 0" floor from the pre-revision axis 6 is
relaxed to ≥ −0.10 **only** when bucket B is the qualifying path. Bucket
A (a `margin_pass` record exists) does not impose a stratum-mean
constraint beyond what's already in pre-revision axis-6 logic.

### Threshold constants added

```
ceiling_saturated_floor:                    0.90
axis6_stratum_min_mean_margin_when_ceiling: -0.10
```

All other thresholds (axes 1 / 3 / 4 / 5 / 7 plus corpus-level axis-2
floors and per-record +0.10 margin) UNCHANGED.

### Schema bump

Slice 20's gate assessment uses schema `release-gate-assessment/1.0.0`.
Slice 22's revised gate emits `release-gate-assessment/2.0.0`. The version
derives from whether `per_record` was supplied to the validator: when
present, revised logic ran (2.0.0); when absent, legacy logic ran (1.0.0).
Old 1.0.0 assessments stay valid as historical records.

---

## 3. `ceiling_saturated_pass` definition

A record qualifies as `ceiling_saturated_pass` if and only if ALL four
conditions hold:

| Clause | Threshold | Rationale |
|---|---|---|
| `tool_inspected_mean ≥ 0.90` | 0.90 (locked default) | Establishes "tool condition is operating at or near ceiling" — the model with tools is correctly answering the record's MCQs at a high rate. |
| `text_only_mean ≥ 0.90` | 0.90 | Establishes "prose is genuinely answer-bearing" — the model can extract the gold answer from the annotation alone, not from MIDI data. |
| `random_midi_mean ≥ 0.90` | 0.90 | Establishes "the answer is robust to MIDI noise" — even when the model sees a random MIDI partner, it still answers correctly. This guards against accidental ceiling matches driven by data leakage of correct MIDI features into the prompt. |
| `misinterp_count == 0` | strict 0 | Excludes the failure mode where the model ignores tools entirely (gets answers right from prose) BUT misuses tool data when it does call them. Operationalized as: count of `(question × run)` pairs where (tool called) AND (tool data correct) AND (final answer wrong) equals 0 across all the record's tool_inspected runs. |

**The interpretation of "no misinterpretation regression"** was chosen at
the cleanest operationalization: per-record `misinterp_count == 0`. The
alternatives — "≤0.20 per-record misinterp rate" or "no misinterp
regression vs Slice 19" — were rejected. The first weakens the constraint;
the second introduces baseline-comparison coupling that is harder to test
and harder to extend to non-Slice-19-shaped baselines.

---

## 4. Per-record classification on Slice 21 baseline (16 records)

Each record is classified into bucket A (margin_pass), bucket B
(ceiling_saturated_pass), both, or neither, using the revised thresholds.
The Slice 21 baseline data feeds straight from the unified
`slice21-fair-e3-baseline-results.json` records; misinterp_count is
derived from per-record tool_inspected traces in
`slice18-5-e3-post-repair-results.json`,
`slice19-e3-tool-fresh-results.json`, and
`slice21-schumann-m045-rerun-results.json` (source priority: slice21 >
slice19-tool-fresh > slice18-5).

| Record | Stratum | tool | text | rmid | margin | misinterp | Bucket |
|---|---|---|---|---|---|---|---|
| bach m009-012 | bach | 0.500 | 0.500 | 0.583 | 0.000 | 1 | neither |
| bach m029-032 | bach | 0.417 | 0.000 | 0.000 | 0.417 | 3 | A |
| bach m037-040 | bach | 0.667 | 0.250 | 0.083 | 0.417 | 0 | A |
| bach m045-048 | bach | 0.750 | 0.500 | 0.500 | 0.250 | 1 | A |
| bach m049-052 | bach | 0.667 | 0.167 | 0.167 | 0.500 | 0 | A |
| bach m053-056 | bach | 0.500 | 0.333 | 0.417 | 0.167 | 1 | A |
| pathetique m001-004 | pathetique | 0.917 | 0.750 | 0.667 | 0.167 | 0 | A |
| pathetique m009-012 | pathetique | 0.333 | 0.333 | 0.083 | 0.000 | 1 | neither |
| pathetique m017-020 | pathetique | 0.667 | 0.583 | 0.500 | 0.083 | 2 | neither |
| pathetique m025-028 | pathetique | 0.583 | 0.667 | 0.333 | −0.083 | 0 | neither |
| pathetique m029-032 | pathetique | 0.333 | 0.333 | 0.333 | 0.000 | 0 | neither |
| schumann m001-004 | schumann | 1.000 | 1.000 | 0.750 | 0.000 | 0 | **neither** (rmid 0.75 < 0.90) |
| **schumann m045-048** | schumann | 1.000 | 1.000 | 1.000 | 0.000 | 0 | **B** (the load-bearing case) |
| chopin m001-004 | chopin | 0.750 | 0.500 | 0.500 | 0.250 | 0 | A |
| chopin m009-012 | chopin | 1.000 | 0.750 | 0.583 | 0.250 | 0 | A |
| clair-de-lune m031-034 | clair-de-lune | 0.500 | 0.333 | 0.167 | 0.167 | 2 | A |

**Bucket totals (Slice 21 baseline):**

| Bucket | Count |
|---|---|
| A only (margin_pass) | 9 |
| B only (ceiling_saturated_pass) | 1 |
| Both A and B | 0 |
| Neither | 6 |
| **Total passing axis 2** | **10/16 = 62.5%** |

`schumann-traumerei:m001-004` is the most instructive "neither" record:
its tool/text means are at the 1.0 ceiling, but `random_midi_mean = 0.75`
is below the 0.90 floor, so it does NOT qualify for bucket B. This is the
robustness clause doing its job — the model only gets credit for
ceiling-saturated when the answer is robust to MIDI noise too.

---

## 5. Slice 21 verdict shift under the revised gate

Slice 21 baseline (n=16, post-R6-rewrite of schumann m045-048):

| Axis | Slice 20 verdict | Slice 22 verdict | Δ |
|---|---|---|---|
| 1 (absolute floor 0.65) | PASS (0.661) | PASS (0.661) | unchanged |
| 2 (compound margin + clearance) | **FAIL** (9/16 = 56.25%) | **PASS** (10/16 = 62.5% via union) | **lifted** |
| 3 (tool-call rate 0.25) | PASS (0.328) | PASS (0.328) | unchanged |
| 4 (correct-after-tool 0.75) | PASS (0.820) | PASS (0.820) | unchanged |
| 5 (misinterp 0.20) | PASS (0.180) | PASS (0.180) | unchanged |
| 6 (no catastrophic stratum) | **FAIL** (Schumann mean 0.000, 0/2 clearing) | **PASS** (Schumann via bucket B) | **lifted** |
| 7 (enriched-vs-non reporting) | PASS (declared) | PASS (declared) | unchanged |
| **Aggregate** | **FAIL** (blocking 2, 6) | **PASS** | **lifted** |

Stratum qualification breakdown under revised axis 6:

| Stratum | n | margin_pass | ceiling_sat | stratum mean | qualified_via |
|---|---|---|---|---|---|
| bach | 6 | 5 | 0 | 0.292 | bucket_a |
| pathetique | 5 | 1 | 0 | 0.033 | bucket_a |
| **schumann** | **2** | **0** | **1** | **0.000** | **bucket_b** |
| chopin | 2 | 2 | 0 | 0.250 | bucket_a |
| clair-de-lune | 1 | 1 | 0 | 0.167 | bucket_a |

Schumann is the only stratum that depends on bucket B. The rest qualify
via the original bucket A path.

---

## 6. Regression check — Slice 19 baseline must still FAIL

The revised gate's diagnostic power is preserved only if it still catches
the Schumann m045-048 problem in Slice 19 (margin −0.556, conditions
0.111 / 0.667 / 0.667). The artifact
`slice22-release-gate-slice19-regression-check.json` confirms:

| Axis | Slice 19 verdict (revised gate) | Why |
|---|---|---|
| 1 | **FAIL** | 0.606 < 0.65 (unchanged) |
| 2 | **FAIL** | 9/16 = 56.25% < 60% (no record qualifies for bucket B; bucket counts: 9 A-only, 0 B-only, 0 both, 7 neither) |
| 3 | PASS | 0.328 ≥ 0.25 |
| 4 | PASS | 0.820 ≥ 0.75 |
| 5 | PASS | 0.180 ≤ 0.20 |
| 6 | **FAIL** | Schumann: 0 margin_pass, 0 ceiling_saturated_pass → `qualified_via = none` |
| 7 | PASS | declared |
| **Aggregate** | **FAIL** | blocking [1, 2, 6] |

Slice 19's `schumann-traumerei:m001-004` does NOT qualify for bucket B
(random_midi 0.75 < 0.90 — same record as Slice 21, byte-identical
condition means). And Slice 19's `schumann-traumerei:m045-048` is the
pre-rewrite version with tool_inspected 0.111 and margin −0.556 — neither
margin_pass nor ceiling_saturated_pass. The Schumann stratum has no
qualifying record under either bucket → axis 6 FAILS.

**The revision is operator-defensible.** Slice 19 stays FAIL; Slice 21
becomes PASS. The gate distinguishes the regime that should pass (Slice
21's prose-saturated Schumann) from the regime that should fail (Slice
19's catastrophic Schumann).

---

## 7. Aggregate verdict — does the revised gate clear on Slice 21?

**Yes.** All 6 blocking axes pass; axis 7 reporting is declared. The
`schema_version` of the assessment is `release-gate-assessment/2.0.0`.
The aggregate verdict is **PASS**, with `blocking_failures = []`.

The summary line emitted by the validator:

> "RC gate PASS (all 6 blocking axes cleared; reporting declared)"

The artifact is at
`datasets/jam-actions-v0-public/evals/slice22-release-gate-revised-assessment.json`
and carries the full per-axis breakdown, per-record bucket
classifications, and per-stratum qualification table.

---

## 8. What clearance means (and does not mean)

**Gate clearance is necessary but not sufficient for release approval.**
The Slice 22 revised gate is the CANDIDATE RC gate definition; a PASS
verdict from this validator means the corpus has cleared the 6 blocking
axes, not that the dataset is approved for v1.0 release.

Specifically, this slice does NOT claim:

- The dataset is release-ready
- A v1.0 / v0.5 version bump is authorized
- The single-model (qwen2.5:7b) evaluation evidence is sufficient on its
  own to certify the dataset
- Cross-model robustness has been demonstrated
- Operator-aloneness gate is cleared
- The 6-record "neither" cohort (no bucket A, no bucket B) is acceptable
  as the long-term state

What it DOES claim:

- The Slice 22 revised gate definition is implementable as a pure
  function (no I/O, no global state)
- The revised gate distinguishes three regimes that the Slice 20 gate
  conflated (bad zero-margin / good zero-margin / true grounding lift)
- Slice 21 baseline now passes; Slice 19 baseline still fails; the
  diagnostic power against catastrophic strata is preserved
- The revision is small and surgical — axes 1, 3, 4, 5, 7 unchanged;
  threshold constants for axes 1, 3, 4, 5 + axis-2 corpus mean +
  axis-6 legacy floor unchanged
- The revision is documented and version-tagged (schema 2.0.0) so future
  consumers can identify which gate semantics produced any given verdict

---

## 9. Implications for Slice 23+

Several follow-on questions are now in scope but explicitly out of
Slice 22:

1. **Release decision.** The Slice 22 gate clears on Slice 21 baseline.
   The operator may choose to authorize a v1.0 release on the strength
   of this clearance, or may require additional evidence (cross-model
   sweep, larger corpus, operator-aloneness gate) before approving.

2. **Cross-model evaluation.** Slice 21 evaluated only qwen2.5:7b. A
   cross-model sweep (e.g. against a second small open-weight model)
   would test whether the revised gate generalizes or is over-fit to
   one model's behavior.

3. **Operator-aloneness gate.** The v0.5 operator-aloneness gate is
   defined separately from the RC gate. It fires when the operator can
   reproduce the dataset's claims without Claude in the loop. Slice 22
   does not address this gate.

4. **The 6 "neither" records.** Six records fail axis 2 under both
   buckets (5 of them with `misinterp_count > 0`). The dataset is not
   broken — those records just don't show grounding lift OR
   ceiling-saturation. The operator may choose to invest in R6-aware
   remediation of those records (in which case Slice 23 mirrors Slice
   21 for a different stratum), invest in tool-use-rate fixes (some of
   the misinterp counts suggest the model is calling tools but
   misreading their output), or accept the corpus shape as-is given
   that 10/16 records do clear axis 2 under the revised gate.

5. **`ceiling_saturated_floor` calibration.** The 0.90 floor is the
   operator-locked Slice-22 default. If a future baseline lands with a
   record at all-conditions 0.85 + misinterp 0, the operator may choose
   to lower the floor to 0.85 — or to hold the line and require the
   record to reach 0.90. The threshold is exported and overridable via
   CLI flag (`--ceiling-saturated-floor 0.85`).

6. **Bucket-B sufficiency.** Schumann m045 is the only bucket-B
   qualifier in Slice 21. If a future Slice has multiple bucket-B
   records but no bucket-A records in a stratum, axis 6 still passes
   via bucket B alone (with the −0.10 mean margin gate). This is by
   design — the revised rule treats bucket B as a co-equal qualification
   path. If the operator decides bucket A should remain the primary path
   and bucket B is "exception-only," a future revision could add a
   minimum bucket-A clearance per stratum. This is an open design point
   for Slice 23+.

---

## Files

**Modified source (2):**

- `src/dataset/release/release-gate.ts` — added `isMarginPass`,
  `isCeilingSaturatedPass`, `recordPassesAxis2`, `classifyRecord` helpers;
  revised axis 2 and axis 6 logic with `per_record`-conditional dispatch
  to the new compound rules; added `ceiling_saturated_floor` and
  `axis6_stratum_min_mean_margin_when_ceiling` to thresholds; bumped
  schema version on GateResult.
- `src/dataset/release/release-gate.test.ts` — preserved 19 existing
  tests as pre-revision-fallback assertions; added 28 new tests covering
  the helpers, the union logic, the compound stratum rule, the Slice 19
  regression case, and the Slice 21 forward case (47 tests total).

**Modified CLI:**

- `scripts/check-release-gate.ts` — added per-record source-priority
  resolution and per-record misinterp tally; builds `per_record` array
  and feeds it to `evaluateReleaseGate`; schema version on the
  assessment output now derives from gate_result.

**Modified metadata:**

- `datasets/jam-actions-v0-public/package-inputs.json` — added 2 new
  assessment artifact entries.
- `datasets/jam-actions-v0-public/checksums.sha256` — regenerated
  (268 → 270 lines).

**New artifacts:**

- `datasets/jam-actions-v0-public/evals/slice22-release-gate-revised-assessment.json`
  — Slice 21 baseline under revised gate (PASS).
- `datasets/jam-actions-v0-public/evals/slice22-release-gate-slice19-regression-check.json`
  — Slice 19 baseline under revised gate (FAIL preserved).

**New doc:**

- `docs/jam-actions-v0-slice22-rc-gate-revision.md` (this file).

**Byte-identical (no overwrite):**

- `datasets/jam-actions-v0-public/evals/slice20-release-gate-assessment.json`
  (historical record under Slice-20 gate definition).
- `datasets/jam-actions-v0-public/evals/slice21-release-gate-assessment.json`
  (historical record under Slice-20 gate definition applied to Slice 21
  baseline — captures the bug the Slice 22 revision fixes).
- All other prior eval artifacts (Slice 7 through 21 source data).
- Source corpus, records, records.jsonl, splits.
- `src/dataset/eval/annotation-grounding.ts`,
  `src/dataset/eval/annotation-grounding-tool.ts`,
  `src/dataset/eval/midi-inspector.ts`.

**Test count:** 1463 → 1491 (+28 net new).
