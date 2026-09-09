# Handoff 14 — Grok Build to Claude: F1, F5, F6

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 14.** Branch `main` @ `c3a65ea`. Work uncommitted. I did **not** run the suite.
I regenerated `datasets/jam-actions-v1/`, ran v1 tests, the v0 reproduction gate, and
`toolless-baseline.mjs` (mistral-small:24b, 100 held-out).

---

## 1. Tool-less baseline (standing gate)

Same script, 100 held-out records, just the user turn:

| family | tool-less |
|---|---|
| acoustic (F5) | **0/27** |
| harmony (F1) | **0/14** |
| ensemble (F6) | **0/3** |
| chord | 2/7 |
| compare | 0/4 |
| measures | 0/9 |
| sections | 0/9 |
| teaching_cues | 1/9 |
| teaching_note | 0/9 |
| transpose | 0/9 |
| **total** | **3/100 = 3.0%** |

The three new families are all zeros. The corpus still needs the tools. v0 was 97.2%.

---

## 2. F5 drops — the honest size of v0's defect

**Attempted 81** (27 songs × 3 kinds: clean, sharp_fail, late_fail).
**Dropped untrackable: 0. Dropped clearance: 0. Dropped short phrase: 0.**
**Kept 81.**

That is not a quiet dodge of v0's 13/36. v0 failed on a 4-note Bach mm.1 arpeggio with every target index; F5 uses **8-note phrases at 0.6 s spacing, first-note target**, and **refuses to emit a record whose YIN/SuperFlux status is `untrackable`**. Every kept F5 take was re-measured at test time.

The published defect remains **13 of 36 v0 pitch records**. F5's drop count on this construction is **0** because the takes were built so the tracker locks, not because failures were labelled from the recipe.

Guard bands (stated on every F5 record):

| | measured | clearance | multiple |
|---|---|---|---|
| pitch | locked YIN p95 **0.179 c** | **5 c** | **27.9×** |
| onset | abs p95 **28.0 ms** | **38 ms** | **1.36×** (also ≥ observed max 37.2 ms) |

---

## 3. What landed

**F1** — `verify_harmony`. One verified voicing and one rejected voicing per song that has an agreeing chord (43 records; both classes non-trivial). Gold re-derived from the gate.

**F5** — acoustic across the 27-song shelf, whole phrases, raw Hz/cents/onset in the tool result, thresholds record-only.

**F6** — who stopped first, wrong chord tone, drifted. `Ensemble` in memory, `ensemble_now` in the trace, no `AudioContext`, no `createTapOutput` in any serialised record.

**F4** still dropped.

Coverage after the expansion (`coverage.json`):

| | |
|---|---|
| n | **305** (train 205 / test 100) |
| tools | **15** |
| songs | **27** |
| shapes | **12** (largest `transcribe_audio>score_audio_take` at **26.6%**) |

Floors raised with the corpus: **tools > 13, songs > 24, shapes > 10**.

v0 reproduction gate: **still passes**.

---

## 4. Tests / did not

v1 tests (13) including F1 both classes, F5 re-measure every acoustic record, F6 no live-graph types, provenance exclusions, prompt gates, split. v0 reproduce (4). Tool-less baseline.

**Did not:** train, full suite, install, v0 edits, copyrighted works, commits.

---

## 5. Working tree

```
 M src/dataset/acoustic-v1/builder.ts
 M src/dataset/acoustic-v1/schema.ts
 M src/dataset/acoustic-v1/task.ts
 M src/dataset/acoustic-v1/v1.test.ts
 M src/dataset/acoustic-v1/generate-corpus.ts
?? src/dataset/acoustic-v1/f5-acoustic.ts
 M datasets/jam-actions-v1/
?? docs/handoffs/live-environment-14-grok-to-claude.md
```

**Yours:** J8 full verify + baseline across all families; public README; then J7-style prompt baseline before any v1 training on the new families.
