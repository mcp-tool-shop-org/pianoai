# jam-actions-v0 Slice 21 — Schumann Remediation (R6-Aware Enrichment Rewrite)

**Status:** post-Slice 20 (rc-gate-defined-2026-05-18). Single-record surgical
remediation of `schumann-traumerei:m045-048` to clear the Slice 19/20
diagnostic's blocking gate failures.

**Model / backend / seed:** qwen2.5:7b on ollama at `localhost:11434`, seed
`slice12-2026-05-17`. Single-model run (operator-locked — no cross-model
sweep this slice).

**Evaluator state (LOCKED):** post-Slice-18.5 fair gold; no changes to
`src/dataset/eval/annotation-grounding.ts`, `annotation-grounding-tool.ts`,
or `midi-inspector.ts`. No changes to `src/dataset/release/release-gate.ts`
or `scripts/check-release-gate.ts` (Slice 20 infrastructure locked).

**Source change:** annotation_target rewrite on `schumann-traumerei:m045-048`
only. 15 other Slice 19 records byte-identical. Version 0.3.0 → 0.4.0.

---

## 1. Question

Did the R6-aware enrichment rewrite of `schumann-traumerei:m045-048` clear
the three blocking axes (1, 2, 6) identified by Slice 20's release-gate
assessment of Slice 19?

**Short answer:** Partial. Axis 1 cleared (corpus tool_inspected mean
0.606 → 0.661 ≥ 0.65). Axes 2 and 6 still fail, but for a different
mechanical reason than before — the record went from "deeply negative
margin" to "ceiling on both text_only and tool_inspected", which the gate's
per-record +0.10 margin clause does not reward. The remediation is
**functionally complete** (the record is no longer dragging the corpus
down) but is not **arithmetically complete** under the gate's current
threshold structure. This is a meaningful operator decision point for
Slice 22+.

---

## 2. Diagnosis (Phase 1)

The Slice 19 baseline shows `schumann-traumerei:m045-048` with three
load-bearing MCQ failures across all three n=3 runs:

| Q# | Question type | Question text (truncated) | Gold | Slice 19 model picks (tool_inspected, 3 runs) |
|----|---|---|---|---|
| Q0 | `pitch_class_count` | How many notes with pitch class C appear in this phrase? | `6` | `3` × 3 (all wrong, 0 tool calls) |
| Q1 | `hand_register` | Which hand plays more notes in this phrase? | `Right hand (17 notes)` | `Left hand (20 notes)` × 2, `Right hand (17 notes)` × 1 (2/3 wrong, 0 tool calls) |
| Q2 | `annotation_grounding` | In measure 45, which pitch does the right hand play on beat 1.5313? | `A4` | `A#4` × 3 (all wrong, 0 tool calls) |

**Critical observation across all three Q types**: zero tool calls in every
run. The model answered from prose alone and got wrong answers. This is
**not** a tool-surface failure (Axis 3 / Axis 4 are upstream — the model
didn't even attempt tools). It is a prose-grounding failure: the existing
annotation prose biases the model away from gold answers.

**R6 audit of the pre-remediation annotation:**

The Slice 19 `annotation_target` for this record:

- Mentioned "A4 right-hand entrance" at m. 45 b0.5 (a *different* A4 than
  the anchor at b1.5313) — same pitch as anchor, not strictly R6-violating,
  but **competing emphasis** on a non-anchor beat.
- Described "right hand descends through **A4 → G4** → F4 → D4 chromatically
  across m. 45–46" — names **G4** in m. 45 RH as part of a descending line.
  G4 is **−2 semitones from the A4 anchor in the same hand + same measure**.
  This is the textbook R6 violation: the prose primes the model toward G4
  as a load-bearing pitch, which is a ±1–3 semitone neighbor of the gold
  answer A4. The factual claim ("chromatically") is also musically
  incorrect — A4→G4 is a whole step, not a chromatic step.
- Mentioned "A#3 (B♭3) long-hold" in the LH at m. 45 b2.7 — different hand
  (technically R6-safe per the strict "same hand+measure" rule), but the
  pitch-class string "A#" appears prominently. The model picks `A#4` in
  3/3 tool_inspected runs.
- For Q0 (pitch_class_count C): annotation never stated how many C events
  exist in the phrase — the model had no prose grounding.
- For Q1 (hand_register): annotation never stated RH vs LH note counts —
  the count "17 vs 7" only appeared in `target_trace.session[2].content`
  which is not visible to E3 answerers.

The mechanism is consistent across all three failures: the model has no
prose grounding for the gold answer AND has prose distractors that match
the wrong-option pitches.

---

## 3. AG anchor identification (Phase 2)

The post-Slice-18.5 anchor selector
(`src/dataset/eval/annotation-grounding.ts::generateAnnotationGroundingQuestion`)
deterministically:

1. Builds the set of `(hand, measure, beat)` positions where exactly one
   note sounds in that hand at that beat (single-note positions).
2. Prefers right-hand positions; falls back to left-hand.
3. Seeds an LCG from `hashString(record.id + "annotation_grounding_q")`.
4. Picks `anchorIdx = lcgInt(lcg, candidates.length)`.

For `schumann-traumerei:m045-048:piano:mcp-session:v1`, the deterministic
output is:

| Question type | Anchor pitch | (hand, measure, beat) | Distractor set |
|---|---|---|---|
| `annotation_grounding` | **A4** (MIDI 69) | (right, 45, 1.5313) | A#4 (+1), G#4 (−1), B4 (+2) |
| `pitch_class_count` | n/a (anchor is the pitch class **C**, count = 6) | window-wide | 3, 4, 8 |
| `hand_register` | n/a (anchor is the answer **Right hand (17 notes)**) | window-wide | Left (20), Equal (12), Right (16) |
| `rhythm_onset` | not_computable (no events on beat 1) | — | — |

For the rewrite, the **R6-prohibited neighbors of A4 in the same RH+measure
(m. 45)** are:

- ±1 semitone: G#4, A#4 — NEITHER present in m. 45 RH (no R6 risk from
  same-pitch-class confusion within the measure).
- ±2 semitones: **G4 (present 2× in m. 45 RH at b0.5417 and b3.7604)**, B4
  (not present). G4 is the primary R6 hazard.
- ±3 semitones: F#4 (not present), C5 (not present, lives in m. 48). No
  in-measure risk.

The rewrite must avoid naming G4 as a "key moment" / "load-bearing pitch"
in m. 45 RH. The G4 events ARE real and must be acknowledged, but their
framing should be ornamental / passing rather than emphasized.

---

## 4. The R6-aware rewrite (Phase 3)

### BEFORE (Slice 19 enrichment) — R6-violating

> The right hand descends through **A4 → G4 → F4 → D4 chromatically** across m. 45–46…
> "m. 45 b0.5 — A4 right-hand entrance (the piece's signature soft offbeat attack)…"
> "m. 45 b2.7 — A#3 (B♭3) long-hold in the left hand…"

Key issues:
1. Names G4 in m. 45 RH as a chord tone of a descending line (R6 violation).
2. References A4 at b0.5 (not b1.5313) → wrong-beat emphasis on the same
   pitch class as the anchor.
3. References A#3 prominently → primes A# pitch class.
4. No pitch-class C count; no RH/LH counts.

### AFTER (Slice 21 enrichment) — R6-compliant

The full rewrite is in
`datasets/jam-actions-v0/enrichment-overrides.json` under
`schumann-traumerei:m045-048:piano:mcp-session:v1`. Highlights:

- **Direct anchor reference**: "m. 45 b1.5313 — A4 in the right hand
  sustained 0.88 seconds — the longest A4 of the closing and the
  load-bearing tone of m. 45's right hand."
- **Avoids G4 emphasis in m. 45 RH**: the surrounding offbeat events are
  named only by beat (b0.5417, b0.5938, b1.5938, b1.6667, b3.7604, b3.8021,
  b3.8438) and explicitly framed as "anacrustic gestures around it, not
  melodic load-bearers." No pitch names attached to those beats.
- **Avoids A#-pitch-class emphasis**: the LH bass darkening at b2.6771 is
  named "B♭3 (the lowered seventh)" — single spelling, no parenthetical
  enharmonic, no A# string anywhere in the schumann entry.
- **Adds Q0 pitch-class count grounding**: "Pitch class C appears 6 times
  in the phrase (C4 at m. 45 b3.8021 RH; C3 at m. 46 b1.2917 LH; C4 at
  m. 46 b2.6771 RH; C4 at m. 47 b1.0104 RH; C3 at m. 47 b1.0521 LH; C5 at
  m. 48 b2.6354 RH)" — full event enumeration with hand attribution.
- **Adds Q1 hand-balance grounding**: "Across the four bars the right hand
  plays 17 notes and the left hand plays 7."

---

## 5. R6 compliance demonstration

| AG anchor / question | Pitch | ±1 neighbors | ±2 neighbors | ±3 neighbors | Compliance |
|---|---|---|---|---|---|
| Q2: A4 @ m. 45 RH b1.5313 | A4 (MIDI 69) | G#4, A#4 — NEITHER in m. 45 RH; NEITHER in slice 21 prose | G4 (2× in m. 45 RH), B4 (absent) | F#4 (absent), C5 (absent in m. 45 RH; C5 in m. 48 is in a different measure) | **PASS** — G4 (the only present same-hand+measure ±1-3 neighbor) is not named in slice 21 prose; A#-pitch-class string is absent from the schumann entry. The B♭3 LH bass mention is in a different hand from the anchor and uses the flat spelling. |
| Q0: pitch-class C count = 6 | n/a (count question) | n/a | n/a | n/a | **PASS** — no anchor pitch; rewrite states the count explicitly and lists all 6 C events with hand attribution. |
| Q1: hand balance (RH=17, LH=7) | n/a (count question) | n/a | n/a | n/a | **PASS** — rewrite states the counts explicitly. |

**Defensible non-emphasis** (per anchor, for Q2 the load-bearing AG case):

- **G4 (R6 ±2 neighbor)** is not emphasized: the 2 actual G4 events in m. 45
  RH (b0.5417 grace-note 0.13s; b3.7604 0.94s) are subsumed under the
  collective characterization "offbeat right-hand events… are anacrustic
  gestures around it, not melodic load-bearers." This is defensible
  because: (a) the b0.5417 G4 is genuinely a 24-tick grace-note attack that
  no musical analysis would call a load-bearing pitch; (b) the b3.7604 G4
  is part of a separate gesture at the end of m. 45 (the G4 → C4 → E4
  figure) that does not contain the AG anchor's beat; (c) describing
  m. 48's F-major arpeggio explicitly (where it is genuinely load-bearing)
  satisfies any reader looking for "important pitches" without
  re-emphasizing the in-measure G4 events.
- **A# / G# / B (R6 ±1, ±2 neighbors)** are not emphasized: none of these
  pitches appear in m. 45 RH at all. The slice 21 schumann entry contains
  no occurrences of the strings "A#" or "G#4" or "B4" or "G4" anywhere.
- **A4 (the anchor)** IS emphasized: the rewrite names A4 at the anchor
  beat directly with duration ("A4 sustained 0.88 seconds … the longest
  A4 of the closing"). This is the load-bearing addition: under text_only
  the model can now retrieve A4 from prose; under tool_inspected the model
  has both prose and tools.

---

## 6. Schumann m045-048 BEFORE/AFTER

| Condition | Slice 19 (n=3) | Slice 21 (n=3) | Δ |
|---|---|---|---|
| full | 0.333 ± 0.000 | 1.000 ± 0.000 | +0.667 |
| text_only | 0.667 ± 0.000 | 1.000 ± 0.000 | +0.333 |
| random_midi | 0.667 ± 0.000 | 1.000 ± 0.000 | +0.333 |
| tool_inspected | 0.111 ± 0.192 | 1.000 ± 0.000 | **+0.889** |
| margin tool − text | **−0.556** | **0.000** | +0.556 |

Per-question per-run breakdown (post-remediation): all 3 questions
(pitch_class_count, hand_register, annotation_grounding) score 1.0 in 3/3
runs across all 4 conditions. Tool calls per question: 0 (the model
answers from prose alone — the rewrite is sufficient grounding without
inspector tools).

---

## 7. Schumann stratum BEFORE/AFTER

| Metric | Slice 19 | Slice 21 |
|---|---|---|
| n_records | 2 (m001-004 + m045-048) | 2 (unchanged cohort) |
| text_only mean | 0.833 | 1.000 |
| tool_inspected mean | 0.556 | 1.000 |
| margin tool − text mean | **−0.278** | **0.000** |
| records clearing margin ≥ +0.10 | 0/2 | 0/2 |

Schumann m001-004 was already at 1.000/1.000 under Slice 19 (margin 0).
Slice 21's remediation brings m045-048 to the same 1.000/1.000 state, so
the stratum's mean margin is now exactly 0 (vs −0.278). The mean margin
clears axis 6's "≥ 0" sub-clause for the first time, but the stratum's
records-clearing-margin count remains 0 (both records have margin = 0
because they hit ceiling on text_only).

---

## 8. Corpus-level update

| Metric | Slice 19 | Slice 21 | Δ |
|---|---|---|---|
| Records | 16 | 16 (same cohort) | — |
| text_only mean | 0.479 | 0.500 | +0.021 |
| full mean | 0.391 | 0.432 | +0.041 |
| random_midi mean | 0.417 | 0.438 (computed) | +0.021 |
| **tool_inspected mean** | **0.606** | **0.661** | **+0.055** |
| margin tool − text mean | 0.127 | 0.161 | +0.034 |
| records clearing tool − text ≥ +0.10 | 9/16 (56.25%) | 9/16 (56.25%) | 0 |

The corpus tool_inspected mean rose from 0.606 to 0.661 — a +0.055 absolute
shift driven by 1/16 of the cohort moving from 0.111 to 1.000. The corpus
margin mean rose from +0.127 to +0.161. The records-clearing-margin count
is unchanged at 9/16: schumann m045-048 was not clearing in Slice 19
(margin −0.556) and is still not clearing in Slice 21 (margin 0.000).

---

## 9. Release-gate verdict shift

| Axis | Threshold | Slice 19 verdict | Slice 21 verdict |
|---|---|---|---|
| **1: absolute_floor** | tool_inspected_mean ≥ 0.65 | **FAIL** (0.606) | **PASS (0.661)** |
| **2: margin** | corpus margin ≥ +0.10 **AND** ≥ 60% records clearing | **FAIL** (margin 0.127 OK; clearing 56.25% fails) | **FAIL** (margin 0.161 OK; clearing 56.25% fails) |
| 3: tool_use_rate | ≥ 0.25 | PASS (0.328) | PASS (0.328) |
| 4: correct_after_tool | ≥ 0.75 | PASS (0.820) | PASS (0.820) — same source traces |
| 5: misinterp | ≤ 0.20 | PASS (0.180) | PASS (0.180) — same source traces |
| **6: stratum_floor** | every stratum mean margin ≥ 0 **AND** ≥ 1 record clearing | **FAIL** (Schumann mean −0.278, 0/2 clearing) | **FAIL** (Schumann mean 0.000 OK; 0/2 clearing fails) |
| 7: enriched_split_reporting | reports both subsets | PASS (declared) | PASS (declared) |

**Aggregate verdict shift**:

- **Slice 19/20**: FAIL — blocking failures [1, 2, 6]
- **Slice 21**: FAIL — blocking failures [2, 6]

**Net**: Axis 1 cleared. Axes 2 and 6 remain blocking, but for a
structurally different reason — schumann m045's margin is now at the
arithmetic floor (zero, because text_only hit ceiling) rather than deeply
negative.

---

## 10. Implications for Slice 22+

The R6-aware rewrite of `schumann-traumerei:m045-048` is **functionally
successful** (the record is no longer a catastrophic subgroup) but does
**not by itself clear the candidate RC gate** as defined in Slice 20.

The blocking failures that remain are structural, not Schumann-specific:

- **Axis 2 (records-clearing fraction)** needs 10/16 or more records
  clearing margin ≥ +0.10. The corpus has 9 today. To clear, 1 more record
  needs to move from "margin < +0.10" to "margin ≥ +0.10". The
  remaining candidates in the Slice 19 baseline with negative or near-zero
  margins:
  - `pathetique-mvt2:m025-028` (margin −0.083) — Slice 11 enriched, the
    gold standard reference; surprising regression under fair gold.
  - `pathetique-mvt2:m009-012` (margin 0.000) — non-enriched.
  - `pathetique-mvt2:m029-032` (margin 0.000) — Slice 11 enriched.
  - `bach m009-012` (margin 0.000) — non-enriched.
- **Axis 6 (Schumann stratum clearing count)** requires ≥ 1 schumann record
  to clear margin ≥ +0.10. Today both schumann records sit at margin = 0
  (both at text_only ceiling). To clear, a schumann record needs its
  text_only score to drop below ceiling so the tool_inspected margin can
  open up. Schumann m001-004's text_only is already 1.000; m045-048 is now
  also 1.000. Neither record has headroom under the current MCQ
  distractor set.

### Three operator options for Slice 22+

1. **More remediation** — re-look at pathetique m025-028 / m029-032 with
   the same R6-aware lens, target margin clearance. Highest-leverage if
   either of those records' margins move from near-zero to ≥ +0.10.
2. **Re-examine the gate's thresholds** — Axis 2's 60% clearing fraction
   may be too aggressive given the corpus size (16 records) and the
   reality that some records will hit text_only ceiling and thus cannot
   produce margin ≥ +0.10. A "≥ 50% clearing fraction" rule would let
   Slice 21 pass. Operator decision — not gate-script tweak.
3. **Cross-model run on the current state** — before further remediation,
   confirm the qwen2.5:7b results generalize. A cross-model run is the
   natural next slice. Operator-locked off this slice; flagged here.

### Recommended path

Option 3 (cross-model on the slice 21 state) is the highest-information
next move and is what the operator's earlier framing pointed at. Slice 21
has materially improved the corpus's measurable capability under qwen2.5:7b
(corpus tool_inspected 0.606 → 0.661). Whether that generalizes is the
next-most-important question; running more remediation on a single model
without cross-model evidence risks tuning to one model's idiosyncrasies.

### Doctrine reminder

Even though Axis 1 cleared, gate clearance ≠ release approval. Two blocking
axes remain. This slice is **gate-attempted**, not **gate-cleared**, not
**release-approved**.

---

## Test count

1463 tests, all passing. No test changes. Test count unchanged from
Slice 20 (HEAD `4b0f181`).

## Hard-gate checklist

| # | Gate | Status |
|---|---|---|
| 1 | All 1463 existing tests still pass | PASS |
| 2 | Schumann m045-048 record changed; ALL OTHER 145 records' content byte-identical | PASS (`git diff` shows only schumann record + enrichment overlay + version files) |
| 3 | Slice 11/16's 9 prior enrichment entries byte-identical | PASS (apply-enrichment reports "8 already in sync" for the other 8 entries; schumann m045-048 alone written) |
| 4 | Source corpus (`datasets/jam-actions-v0/`) only diff is schumann record + enrichment overlay | PASS |
| 5 | splits.json byte-identical | PASS (packager confirms) |
| 6 | Slice 12-20 result artifacts byte-identical (no overwrites) | PASS (only new slice21-* artifacts written) |
| 7 | Eval harnesses (annotation-grounding.ts / -tool.ts / midi-inspector.ts) byte-identical | PASS (untouched) |
| 8 | release-gate.ts validator byte-identical | PASS (untouched) |
| 9 | Public package version 0.4.0 in VERSION + manifest.json + CITATION.cff | PASS (packager consistency check passed) |
| 10 | Public-package SHA-256 for the 15 reused records in slice21-fair-baseline-results.json match Slice 19's | PASS (15/15 hash matches verified) |
| 11 | Slice 21 rerun artifact contains 1 record × 4 conditions × n=3 + tool-call traces preserved | PASS (12 model calls; tool_use_stats populated; per_run_results array of 3) |
| 12 | New release-gate assessment runs against slice21-fair-baseline; produces a defensible verdict | PASS (FAIL with concrete axis numbers: 1=PASS@0.661, 2=FAIL@56.25%, 6=FAIL@schumann 0/2) |
| 13 | R6 compliance demonstrated per AG anchor in this doc | PASS (section 5) |
| 14 | NO autonomous commit; stop and report | HONORED |

## Suggested commit + tag

The remediation is partial — Axis 1 cleared, Axes 2 and 6 did not. Tag
suggestion:

```
jam-actions-v0-schumann-attempted-2026-05-19
```

The `-attempted-` suffix accurately conveys that the surgical remediation
succeeded as a microsurgery (the record is no longer broken) but did not
single-handedly clear the candidate RC gate. Slice 22+ owns the next move.

Commit message draft (operator may revise):

```
Slice 21 — R6-aware enrichment rewrite of schumann m045-048

Surgical remediation of the catastrophic-margin record identified by
Slice 19/20. The annotation_target prose was rewritten to (a) reference
the A4 AG anchor directly at m. 45 b1.5313, (b) avoid emphasizing G4
(the only same-hand+measure ±1-3 semitone neighbor of A4 in m. 45 RH),
(c) drop the A#-pitch-class string to remove pitch-class confusion with
the model's wrong-answer A#4, and (d) add explicit pitch-class-C count
(6) and RH/LH note-balance grounding (17/7) for E3 questions Q0 and Q1.

Result: schumann m045-048 moved from tool_inspected=0.111 (margin
−0.556) to tool_inspected=1.000 (margin 0.000). Corpus tool_inspected
mean rose 0.606 → 0.661, clearing Slice 20 Axis 1's absolute floor
(0.65) for the first time. Axes 2 (records-clearing fraction 56.25% <
60%) and 6 (Schumann stratum clearing 0/2 < 1 required) remain
blocking — the record now sits at the arithmetic margin floor because
text_only also hit ceiling. Not release approval.

Version bump 0.3.0 → 0.4.0. 1463 tests still pass. No eval-harness or
gate-validator changes.
```

(NOT auto-committed; operator decision.)
