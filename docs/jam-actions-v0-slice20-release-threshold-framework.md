# jam-actions-v0 Slice 20 — Release Threshold Framework (Candidate RC Gate)

**Date:** 2026-05-18
**Status:** COMPLETE — AWAITING OPERATOR REVIEW (NO COMMIT)
**Type:** Framework / spec slice — defines a 7-axis Release Candidate gate; pure analytical work plus small validator infrastructure. Zero corpus/record/schema/evaluator changes. No new eval runs.
**Inputs:** Slice 19's canonical post-repair E3 baseline (`evals/slice19-fair-e3-baseline-results.json` + the two source artifacts it references for tool-call traces).
**Outputs:** This spec doc + a pure validator library (`src/dataset/release/release-gate.ts`) + 19-test unit suite + a CLI (`scripts/check-release-gate.ts`) + a generated assessment artifact (`evals/slice20-release-gate-assessment.json`).

---

## 0. What this slice is — and is NOT

**IS:** the operator-locked candidate definition of a multi-axis Release Candidate gate for `jam-actions-v0`. The gate is **operationally checkable** — any future Slice-19-shaped baseline artifact can be evaluated against the same thresholds without re-reading this doc, by running `scripts/check-release-gate.ts`.

**IS NOT:** a release approval claim. Operator framing is explicit: "candidate RC gate, not apply for release yet." A PASS verdict from the validator means the baseline clears the framework's thresholds, not that the dataset is approved for shipment.

The gate is multi-axis because operator doctrine from Slice 19 is locked:

> "A single release threshold is not enough. We need a multi-axis threshold that separates absolute capability, tool margin, tool-use rate, and misinterpretation."

This slice picks numeric values for each axis, defends them, and applies them. **Slice 19 fails three blocking axes (1, 2, 6).** That outcome is intended: the framework's diagnostic value lies in making those failures visible and naming the operational work that would clear each.

---

## 1. Threshold philosophy — mixed Stance A / Stance B

The kickoff offered two stances:

- **Stance A (conservative):** anchor thresholds at or near Slice 19's current values; the gate tests "is the current dataset releasable?"
- **Stance B (ambitious):** anchor thresholds above Slice 19's current values; the gate tests "what's the bar we're aiming for?"

This slice picks a **mixed Stance A / B**:

- **Stance B for axes where the convention is established or the current state has clear headroom.** Axis 1 (absolute floor 0.65, above Slice 19's 0.606), Axis 2 (compound: corpus mean +0.10 AND ≥60% of records clearing, where Slice 19 sits at 9/16 = 56.25%), Axis 6 (compound stratum floor — Slice 19's Schumann fails by design).
- **Stance A for axes where Slice 19 already passes with a defensible margin AND a higher bar would be arbitrarily strict.** Axis 3 (tool-call rate floor 0.25, Slice 19 at 0.328), Axis 4 (correct-after-tool floor 0.75, Slice 19 at 0.820), Axis 5 (misinterp ceiling 0.20, Slice 19 at 0.180).

The reasoning is that **Stance A on axes 3/4/5 protects against forcing structural change to the corpus where the model behavior is already adequate** (forcing tool-call rate higher would push toward de-enriching records, which is design-counterproductive given enrichment is the dataset's stated value); **Stance B on axes 1/2/6 names real headroom** (absolute capability, broad-base margin, no-catastrophic-subgroup) that current measurements do not yet clear.

The gate is **not** anchored at Slice 19's current values uniformly. That would be uninformative — a gate where the baseline passes everything by zero margin tells the project nothing about what to push next.

---

## 2. The 7-axis spec

### Axis 1 — Absolute tool_inspected floor

| Field | Value |
|---|---|
| **What it measures** | Corpus-mean accuracy in the `tool_inspected` condition (the strongest condition for grounded answers). |
| **Threshold** | `tool_inspected_mean ≥ 0.65` |
| **Rationale** | Slice 19 corpus is at 0.606; 0.65 sets the bar about a third of the way between text_only mean (0.479) and perfect (1.0). The MCQ chance baseline is 0.25 (4 options); 0.65 represents "substantially above chance, and meaningfully above the text-only ceiling." Stance B — names headroom. |
| **Slice 19 measured** | **0.606** |
| **Verdict** | **FAIL** (by 0.044 absolute) |
| **What FAIL means operationally** | One or more of: (a) targeted records where `text_only` ceiling is already high but `tool_inspected` lags (e.g., Schumann m045-048 at 0.111 — see Axis 6); (b) stronger base model (hermes3:8b vs qwen2.5:7b — the Slice 21 candidate direction); (c) prompt-engineering for under-utilized tools (e.g., `hand_register` at 25% correct-after-tool). |

### Axis 2 — tool_inspected − text_only margin (compound)

| Field | Value |
|---|---|
| **What it measures** | Does using the tools meaningfully outperform retrieval from prose alone, **across the corpus** AND **across enough individual records**? |
| **Threshold** | `margin_tool_minus_text_mean ≥ +0.10` AND `records_clearing(+0.10) / n_records ≥ 0.60` |
| **Rationale** | The +0.10 margin convention is locked from Slice 17 doctrine ("non-trivial real-world differentiation"). A compound clause guards against a single-stratum-driven corpus mean (e.g., Bach alone could carry the corpus past +0.10 while leaving Pathétique flat). 60% is the lowest defensible fraction that says "more records help than don't." |
| **Slice 19 measured** | corpus margin **+0.127** (passes mean clause); records clearing **9/16 = 56.25%** (fails clearance clause) |
| **Verdict** | **FAIL** (compound — corpus mean clears but records-clearing falls 3.75 pp below threshold) |
| **What FAIL means operationally** | Push 1-2 more records past +0.10 to lift records-clearing to 10/16 = 62.5%. Best candidates: the 5 records currently at flat margin (Bach m009-012, Pathétique m009-012/m017-020/m029-032, Schumann m001-004). Either prompt tuning for these specific records, or stronger base model. Note: this axis is structurally coupled to Axis 6 — clearing Schumann would also lift records-clearing fraction. |

### Axis 3 — Tool-call rate (corpus)

| Field | Value |
|---|---|
| **What it measures** | Is the model actually using the inspector tools, or ignoring them? Corpus aggregate (per-subset splits are reported in axis 7 but not separately gated). |
| **Threshold** | `tool_call_rate ≥ 0.25` |
| **Rationale** | A single-threshold floor; Slice 19's 4.5× enriched/non-enriched asymmetry (12.7% vs 57.1%) means a high single-axis floor would force de-enrichment — design-counterproductive. 0.25 says "the inspector surface is not ignored on aggregate" without forcing structural change. Stance A — conservative, names a floor not an aspiration. |
| **Slice 19 measured** | **32.8%** (61/186 question-runs) |
| **Verdict** | **PASS** |
| **What FAIL means operationally** | (Not Slice 19's situation.) Would indicate prompt engineering needed to direct the model toward the inspector, possibly a stronger model, or revisiting the inspector tool descriptions. |

### Axis 4 — Correct-after-tool-call rate

| Field | Value |
|---|---|
| **What it measures** | When the model does call a tool, how often is the final answer correct? Directly measures whether the inspector data → option-pick translation is working. |
| **Threshold** | `correct_after_tool_rate ≥ 0.75` |
| **Rationale** | Slice 19 sits at 0.820 (50/61). 0.75 allows headroom for harder MCQ types (hand_register at 25% drags the average); below 0.75 would suggest a structural bug. Stance A — passes by comfortable margin without inviting arbitrary strictness. |
| **Slice 19 measured** | **82.0%** (50/61) |
| **Verdict** | **PASS** |
| **What FAIL means operationally** | (Not Slice 19's situation.) The Slice 22 candidate direction would investigate the 11 misinterp cases per question-type; biggest current weakness is `hand_register`. |

### Axis 5 — Misinterpretation rate

| Field | Value |
|---|---|
| **What it measures** | When the model calls a tool and the tool returns correct data, how often does the model still pick the wrong option? Complement of Axis 4 strictly on the tool-called question-runs. |
| **Threshold** | `misinterp_rate ≤ 0.20` |
| **Rationale** | Slice 19 sits at 0.180 (11/61). 0.20 matches the residual-decomposition framing from Slice 18.5 (18.9% on the 13-record cohort), so the threshold ratifies the locked Slice 18.5 result. Stance A — names the residual without forcing it lower. |
| **Slice 19 measured** | **18.0%** (11/61) |
| **Verdict** | **PASS** |
| **What FAIL means operationally** | (Not Slice 19's situation.) Per-question-type investigation of which MCQ types the model misreads despite correct tool data. |

### Axis 6 — Stratum floor / no catastrophic subgroup (compound)

| Field | Value |
|---|---|
| **What it measures** | The dataset releases as "music dataset," not "Bach-only dataset." Every music-texture stratum must clear a minimal floor under tool_inspected. |
| **Threshold** | For every stratum: `stratum.margin_tool_minus_text_mean ≥ 0.0` AND `stratum.records_clearing_margin ≥ 1` |
| **Rationale** | The compound captures "no negative-margin stratum AND every stratum has at least one record where tools help." This is the load-bearing diagnostic axis — Schumann at mean margin −0.278 with 0/2 records clearing MUST fail it (per kickoff). A single-clause threshold like "every stratum margin ≥ 0" would also flag Schumann, but the compound additionally catches a stratum that's near-zero with no records clearing (would indicate the stratum is genuinely "tools never help" rather than "tools help on average but inconsistently"). |
| **Slice 19 measured** | Bach: +0.292, 5/6 clearing → PASS. Pathétique: +0.033, 1/5 clearing → PASS. **Schumann: −0.278, 0/2 clearing → FAIL (both clauses).** Chopin: +0.250, 2/2 clearing → PASS. Clair-de-lune: +0.167, 1/1 clearing → PASS. |
| **Verdict** | **FAIL** (Schumann fails both clauses) |
| **What FAIL means operationally** | Three paths: (a) **rewrite Schumann m045-048** — the model's get_pitch_at misinterpretation against the option strings on this record drives the stratum's collapse; targeted MCQ engineering may close it; (b) **add additional Schumann records** to dilute the m045-048 outlier (Schumann m041-044 was dropped from Slice 19; including it plus 1-2 more would broaden the stratum's base); (c) **exclude Schumann from the public package** — frames the dataset as a 4-stratum corpus instead of 5; the public scope still includes Bach/Pathétique/Chopin/Clair plus the holdout. Operator decision; the gate names the choice rather than mandates it. |

### Axis 7 — Enriched-vs-non-enriched reporting (declared)

| Field | Value |
|---|---|
| **What it measures** | Every release artifact must include both subsets' numbers across all 4 conditions so consumers can audit the prose-leakage asymmetry. Per kickoff: "the asymmetry IS the dataset's signal under fair gold." |
| **Threshold** | The assessment input must declare `reports_enriched_vs_non_enriched = true`. No numeric gap bound — Slice 19's enriched/non-enriched absolute-score gap of +0.217 on text_only IS the signal. |
| **Rationale** | Stance A on Axis 7 — reporting transparency is the cost of admitting the prose-leakage finding. A numeric gap bound would either accept the current asymmetry (uninformative) or force enrichment removal (design-counterproductive). |
| **Slice 19 measured** | Slice 19 doc §2 reports the enriched-vs-non-enriched split with all 4 conditions + tool-call rate. The Slice 20 assessment artifact's `gate_input.enriched` and `gate_input.non_enriched` carry the subset numbers explicitly. Declared. |
| **Verdict** | **PASS** |
| **What FAIL means operationally** | (Not Slice 19's situation.) A release artifact that aggregates only at corpus level — operator should require the subset breakdown before the release artifact is accepted. |

---

## 3. Composition rule — blocking vs reporting

**The rule:** axes 1–6 are **BLOCKING** (all must pass for the gate to PASS); axis 7 is **REPORTING** (the assessment artifact must declare the split is reported, otherwise the gate fails on the reporting check).

The aggregate verdict is:

> `gate.passed = (no_blocking_axis_failed) AND (axis_7_reporting_declared)`

This is the simplest defensible composition. Two alternatives were considered and rejected:

- **Strict AND (axes 1–7 all blocking):** rejected because axis 7 is structurally different (reporting requirement, not numeric measurement); collapsing it into the same flat rule conflates "model fails to clear capability bar" (axes 1–6) with "the doc didn't include the table" (axis 7).
- **Tolerance ("at most 1 axis may fail"):** rejected because the axes are not weighted equally. Axis 6 catches catastrophic subgroups; tolerance would let a Schumann-style failure slide if all others passed — directly contradicting the diagnostic's purpose.
- **Tiered "advisory-vs-blocking" with 4-6 advisory:** rejected for the same reason — axes 4-6 each catch distinct failure modes; downgrading any of them weakens the framework's coverage.

The rule is implemented in `src/dataset/release/release-gate.ts:evaluateReleaseGate`. The validator returns:

- `passed: boolean` — aggregate verdict
- `failing_axes: number[]` — all failing axes (blocking + reporting)
- `blocking_failures: number[]` — only the blocking failures (subset of `failing_axes` minus 7)
- `axes: AxisVerdict[]` — per-axis verdicts in axis-number order

---

## 4. Slice 19 aggregate verdict

| Axis | Threshold | Slice 19 measured | Verdict |
|---|---|---|---|
| **1: Absolute floor** | tool_inspected_mean ≥ 0.65 | 0.606 | **FAIL** |
| **2: Margin (compound)** | corpus margin ≥ +0.10 AND ≥60% clearing | +0.127; 9/16 = 56.25% | **FAIL** |
| **3: Tool-use rate** | corpus ≥ 0.25 | 0.328 | **PASS** |
| **4: Correct-after-tool** | ≥ 0.75 | 0.820 (50/61) | **PASS** |
| **5: Misinterp** | ≤ 0.20 | 0.180 (11/61) | **PASS** |
| **6: Stratum floor (compound)** | all strata: mean ≥ 0 AND ≥1 clearing | Schumann: −0.278, 0/2 → both clauses fail | **FAIL** |
| **7: Enriched split reporting** | declared | declared in Slice 19 §2 + assessment artifact | **PASS** |

**Aggregate:** **FAIL** — blocking axes 1, 2, 6 fail. Validator output (run on Slice 19 baseline):

```
Axis 1 [blocking] (absolute_floor): FAIL — Corpus tool_inspected mean 0.606 < 0.650
Axis 2 [blocking] (margin): FAIL — Compound FAIL: corpus margin 0.127 ≥ 0.100; 9/16 (56.3%) clearing +0.10 < 60.0%
Axis 3 [blocking] (tool_use_rate): PASS — 32.8% ≥ 25.0% (enriched 12.7% / non-enriched 57.1%)
Axis 4 [blocking] (correct_after_tool): PASS — 82.0% ≥ 75.0%
Axis 5 [blocking] (misinterp): PASS — 18.0% ≤ 20.0%
Axis 6 [blocking] (stratum_floor): FAIL — 1 stratum/strata fail: schumann(mean -0.278, 0/2 clearing)
Axis 7 [reporting] (enriched_split_reporting): PASS — declared (enriched n=9 / non-enriched n=7)
Aggregate: FAIL — blocking failures: [1, 2, 6]
```

This is the **expected and intended** outcome. The framework's diagnostic value lies in making axes 1, 2, 6 fail visibly so the project has a clear operational picture of "what does RC ready look like, and what work would get there."

---

## 5. Operational paths — clearing the failing axes

| Failing axis | Cleanest path to clear |
|---|---|
| **Axis 1** (absolute floor 0.606 < 0.65) | Coupled to Axis 6: clearing Schumann's collapse (m045-048 at 0.111) would lift corpus tool_inspected mean by ~0.04, bringing the corpus to ≈0.65. Or a stronger base model (Slice 21 cross-model rerun with hermes3:8b is the natural follow-up). |
| **Axis 2** (records-clearing 9/16 = 56.25% < 60%) | Coupled to Axis 6: a Schumann m045-048 fix that lifts the record from −0.556 margin to +0.10 margin moves 1 record across the bar, raising records-clearing to 10/16 = 62.5%. Or prompt tuning for hand_register / pitch_class_count on the 5 currently-flat records (Bach m009-012, Pathétique m009/m017/m029, Schumann m001). |
| **Axis 6** (Schumann fails) | Three options: **(a) rewrite Schumann m045-048 MCQs** (the get_pitch_at misinterpretation is a model-vs-prompt issue, not a corpus content issue); **(b) broaden the Schumann stratum** by including m041-044 and 1-2 additional Schumann excerpts to dilute the m045-048 outlier; **(c) exclude Schumann from the public package** (reframes the corpus as 4-stratum). Operator decision. |

Note that axes 1 and 2 are largely DOWNSTREAM of axis 6. Fixing the Schumann stratum mechanically lifts both the corpus mean and the records-clearing fraction. This is not coincidental — axis 6 catches the kind of catastrophic-subgroup failure that ALSO drags down the aggregate metrics.

The framework's reading is: **the practical path to RC-clearing is Schumann remediation first.** Whether that's MCQ rewrite, stratum broadening, or stratum exclusion is operator discretion.

---

## 6. Validator infrastructure

**Shipped this slice:**

- **`src/dataset/release/release-gate.ts`** — pure function `evaluateReleaseGate(input, thresholds)`. No I/O, no global state. Exports `DEFAULT_THRESHOLDS` (Slice 20 default RC gate values) and full TypeScript types for `ReleaseGateInput`, `ReleaseGateThresholds`, `AxisVerdict`, `GateResult`.

- **`src/dataset/release/release-gate.test.ts`** — **19 unit tests** covering: passing baseline, Slice 19 baseline fixture (canonical), per-axis fail boundaries (one test per axis at the boundary), composition rule (aggregate passes only when all blocking pass + axis 7 declared), custom-threshold overrides, default-threshold sanity. All 19 pass.

- **`scripts/check-release-gate.ts`** — CLI wrapper. Reads `slice19-fair-e3-baseline-results.json`, resolves correct-after-tool / misinterp from the source per-question traces referenced in the baseline's `source_artifacts` block (Slice 18.5 reuse + Slice 19 fresh tool artifact), builds the `ReleaseGateInput`, feeds it to `evaluateReleaseGate`, and prints a human summary. `--out <path>` writes the structured assessment artifact. Per-axis threshold-override flags for what-if analysis. Exit code 0 on PASS, 1 on FAIL.

- **`datasets/jam-actions-v0-public/evals/slice20-release-gate-assessment.json`** — the canonical assessment of Slice 19 against the default thresholds. Schema `release-gate-assessment/1.0.0`. Self-describing — embeds the gate_input, gate_result, threshold snapshot, source-artifact provenance for the 61/50 tool-called tally, and a `doctrine_note` reasserting "this is a candidate RC gate, not a release approval."

**CLI usage example:**

```bash
# default thresholds, default Slice 19 baseline — prints summary, exit 1
npx tsx scripts/check-release-gate.ts

# write assessment artifact
npx tsx scripts/check-release-gate.ts \
  --out datasets/jam-actions-v0-public/evals/slice20-release-gate-assessment.json

# what-if: relax axis 1 to current Slice 19 state (still fails on 2, 6)
npx tsx scripts/check-release-gate.ts --axis1-floor 0.60

# what-if: tighten axis 5 to 0.10 (Slice 19 then also fails axis 5)
npx tsx scripts/check-release-gate.ts --axis5-misinterp-ceiling 0.10
```

The validator's output on Slice 19 matches this slice doc's per-axis verdicts exactly: axes 1, 2, 6 fail; axes 3, 4, 5, 7 pass. (See `gate_result.failing_axes = [1, 2, 6]` in the generated assessment.)

---

## 7. Test count delta

Pre-Slice-20 baseline: **1444 tests** passing.
Post-Slice-20: **1463 tests** passing (+19 from `release-gate.test.ts`).

---

## 8. Anti-patterns avoided this slice

- **NOT modified records, schema, corpus, splits, version, or version_file.** Zero changes under `datasets/jam-actions-v0/records/` or `datasets/jam-actions-v0-public/records/`. No version bump.
- **NOT modified any prior eval result artifact.** Slice 19's baseline + intermediates byte-identical; all prior slices' artifacts byte-identical.
- **NOT modified `annotation-grounding.ts`, `annotation-grounding-tool.ts`, or `midi-inspector.ts`.** Slice 18.5's eval-infrastructure state preserved byte-identical.
- **NOT registered new MCP tools / not modified `tool-schemas.json`.**
- **NOT made a release approval claim.** Doc framing explicitly says "candidate RC gate, not apply for release yet."
- **NOT set thresholds at exactly Slice 19's values.** Uninformative; the framework's value lies in naming headroom (axes 1, 2, 6 fail by design).
- **NOT added axes beyond the 7 operator-specified.** No new axes, no unilateral expansion.
- **NOT smoothed the Schumann fail.** Axis 6 is built to make Schumann's collapse explicitly visible; this IS the diagnostic value.
- **NOT auto-committed at end.** Operator's locked doctrine since Slice 15.
- **NOT over-engineered.** Validator is ~340 lines (release-gate.ts), CLI ~280 lines. A reader can apply the gate manually with the per-axis table in §2 if the validator is unavailable.

---

## 9. Package metadata changes

`datasets/jam-actions-v0-public/package-inputs.json` — added 1 curated entry:
- `evals/slice20-release-gate-assessment.json`

`datasets/jam-actions-v0-public/checksums.sha256` — regenerated; 262 → 263 lines (1 new artifact).

`src/dataset/release/` — new directory containing the validator library + tests.

`scripts/check-release-gate.ts` — new CLI.

---

## 10. Hard-gate checklist (14 items)

| # | Gate | Status |
|---|---|---|
| 1 | All 1444 existing tests still pass | **PASS** — confirmed pre-slice; the validator's 19 new tests are additive (1463 total post-slice). |
| 2 | Validator: ≥6 unit tests, all pass, pure (no I/O, no global state) | **PASS** — 19 tests pass; `release-gate.ts` is pure (verified — no `readFileSync`, no `process.*`, no module-level state); CLI does the I/O. |
| 3 | Source corpus, records, records.jsonl, splits, eval harnesses byte-identical | **PASS** — `git diff datasets/jam-actions-v0/` empty; `git diff src/dataset/eval/annotation-grounding.ts src/dataset/eval/annotation-grounding-tool.ts src/dataset/eval/midi-inspector.ts` empty; `git diff src/dataset/tool-schemas.json` empty. |
| 4 | All prior eval artifacts byte-identical (Slice 7 through 19) | **PASS** — only ADDITION under `datasets/jam-actions-v0-public/evals/` is `slice20-release-gate-assessment.json`. Verified via `git diff --stat` showing only new file. Slice 19's baseline + intermediates unchanged. |
| 5 | Slice doc has per-axis spec: threshold + rationale + Slice 19 verdict + what FAIL means | **PASS** — §2 covers all 7 axes with the four required fields each. |
| 6 | Aggregate assessment: which axes pass, which fail, what failing axes mean operationally | **PASS** — §4 (aggregate verdict) + §5 (operational paths). |
| 7 | NO release claim — doc explicitly states "candidate RC gate, not release approval" | **PASS** — §0 opening + §2's per-axis framing + doctrine_note in the assessment artifact + the inline NOTE in the CLI's human output all reassert this framing. |
| 8 | Per-axis numeric thresholds (no "high enough" hand-waving) | **PASS** — every threshold in §2 is a concrete numeric value; the validator's `DEFAULT_THRESHOLDS` encodes them as exported constants. |
| 9 | Per-axis rationale grounded in Slice 19 data, established convention, or stated theoretical floor | **PASS** — Axis 1 / 6 use Slice 19 distribution; Axis 2 uses Slice 17 convention (+0.10); Axis 4 / 5 use Slice 19 measured values + headroom; Axis 3 uses Slice 19 asymmetry constraint; Axis 7 follows operator framing. |
| 10 | Framework is operationally checkable — a downstream contributor can apply each axis to a results artifact | **PASS** — §6 documents the CLI; `npx tsx scripts/check-release-gate.ts` works end-to-end against the Slice 19 baseline. |
| 11 | Validator's output on Slice 19 matches the slice doc's verdicts | **PASS** — assessment artifact's `gate_result.failing_axes = [1, 2, 6]` exactly matches §4's verdict table. |
| 12 | `checksums.sha256` regenerated if any new artifact ships | **PASS** — regenerated from 262 → 263 lines; `verify-public-package-checksums.ts` reports clean. |
| 13 | `package-inputs.json` declares new curated artifact | **PASS** — `slice20-release-gate-assessment.json` added to `curated_files`. |
| 14 | **NO autonomous commit; stop and report** | **PASS** — no commit; no push; report follows. |

---

## 11. Suggested commit + tag

If gates 1–14 pass and operator authorizes:

```bash
git add scripts/check-release-gate.ts \
        src/dataset/release/release-gate.ts \
        src/dataset/release/release-gate.test.ts \
        datasets/jam-actions-v0-public/evals/slice20-release-gate-assessment.json \
        datasets/jam-actions-v0-public/package-inputs.json \
        datasets/jam-actions-v0-public/checksums.sha256 \
        docs/jam-actions-v0-slice20-release-threshold-framework.md

git commit -m "Slice 20: define candidate 7-axis RC release gate framework"
git tag jam-actions-v0-rc-gate-defined-2026-05-18
```

Tag rationale: `-rc-gate-defined-` signals what was added (the candidate gate definition) without implying RC-ready (operator framing: not yet).

---

## 12. The doctrine line

**Slice 20 defines a candidate Release Candidate gate for `jam-actions-v0` as 7 independent reading lenses: corpus absolute floor (0.65), tool−text margin compound (corpus +0.10 AND ≥60% records clearing), tool-call rate (≥0.25), correct-after-tool (≥0.75), misinterp ceiling (≤0.20), stratum floor compound (every stratum mean ≥0 AND ≥1 record clearing), and enriched-vs-non-enriched reporting (declared). Axes 1-6 are BLOCKING; axis 7 is REPORTING. The validator is a pure function in `src/dataset/release/release-gate.ts` (19 unit tests, all pass) wrapped by a CLI in `scripts/check-release-gate.ts` that auto-derives correct-after-tool / misinterp from the source per-question traces. Applied to Slice 19's baseline, the gate fails axes 1 (0.606 < 0.65), 2 (compound: corpus margin clears but only 9/16 = 56.25% of records clear < 60% floor), and 6 (Schumann mean −0.278 with 0/2 records clearing). Axes 3, 4, 5, 7 pass. The Schumann m045-048 collapse is the load-bearing failure — clearing it would also lift axes 1 and 2 mechanically. Operational paths to clear are documented per axis; the framework explicitly does NOT claim Slice 19 is RC ready, and a PASS verdict from the validator would NOT constitute release approval (operator framing: candidate gate definition, not release decision).**
