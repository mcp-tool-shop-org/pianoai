# Slice 8 — E3 Annotation Grounding Hardening

**Date:** 2026-05-16
**Commit basis:** Slice 7.5 first-run baseline (`abd429a`) — all three thresholds failed
**Scope:** Harden `annotation_grounding` MCQ generator so random-MIDI and text-only baselines
score at chance (≤0.30). No LLM calls, no corpus changes, no changes to other question types.

---

## Root Cause Analysis

### What Slice 7.5 showed

The first live LLM eval (hermes3:8b) failed all three E3 thresholds. The most actionable
signal was `annotation_grounding`:

```
Random-MIDI margin = 0.000
Full-context score = 0.375
Random-MIDI score  = 0.375
```

Full-context and random-MIDI scored **identically**. This means the model answered these
questions without using the MIDI at all.

### The Slice 7 generator (text-leakable)

The Slice 7 `annotation_grounding` generator produced questions of the form:

> "Which of the following statements about this phrase is supported by the MIDI data?"

With options like:
- `"The right hand plays more notes than the left hand (RH: 44, LH: 12)"` ← correct
- `"The left hand plays more notes than the right hand"` ← vague, no numbers
- `"The highest pitch in this phrase is A2"` ← structurally different
- `"This phrase contains 9 distinct pitch classes"` ← structurally different

**Three leakage vectors identified:**

1. **Fixed question text across all records.** The `text_only` LCG seed is
   `hash(questionText + questionType + "text_only")`. Since the question text was always
   identical, the seed was constant across all 45 records. The LCG always selected option
   index 0. The correct option happened to land at index 0 for 17/45 records (37.7%),
   well above 25% chance.

2. **Structural asymmetry in options.** The correct statement included specific RH/LH
   counts in parentheses (`RH: 44, LH: 12`), making it visually distinct from the vague
   distractors. A language model pattern-matching on "specific counts = plausible answer"
   could answer correctly without inspecting MIDI data.

3. **Musical prior for hand dominance.** In classical piano, the right hand typically
   plays the melody and often has more notes. A model with musical prior knowledge could
   guess "right hand plays more notes" above chance.

### Why the harness's rule-based answerers masked the issue

In the Slice 7 harness simulation:
- `text_only` scored 37.8% on `annotation_grounding` (above chance, documented as a
  finding but not a hard gate violation since 37.8% < 40% ceiling)
- `random_midi` scored 0.0% (correctly wrong — random MIDI produced wrong RH/LH counts)

The harness showed the right-hand-count claim was somewhat text-leakable but the
`random_midi` baseline was clean. In the live LLM eval, however, the model didn't use
MIDI for either context — it guessed based on musical priors and structural cues.

---

## What Changed

### New question shape (MIDI-event claim)

The hardened generator replaces the hand-count prose comparison with a **specific pitch
claim at a specific (hand, measure, beat) position**:

**Before:**
```
Question: "Which of the following statements about this phrase is supported by the MIDI data?"
Options:
  A. "The right hand plays more notes than the left hand (RH: 44, LH: 12)"  ← correct
  B. "The left hand plays more notes than the right hand"
  C. "The highest pitch in this phrase is A2"
  D. "This phrase contains 9 distinct pitch classes"
```

**After:**
```
Question: "In measure 2, which pitch does the right hand play on beat 2?"
Options:
  A. "D#5"
  B. "E5"   ← correct
  C. "D5"
  D. "F5"
```

### Why this is model-independent

The four options are structurally identical note name strings. No option "looks more
musical" than another without MIDI access. Distractors are ±1/±2/±3 semitones from the
correct pitch — all plausible in any musical context. A language model cannot distinguish
the correct answer from the distractors without inspecting `timed_events`.

The fix is not tuned to hermes3:8b's weaknesses. It removes a design flaw that makes any
LLM capable of above-chance performance without MIDI evidence.

### Anchor selection

For each record, the generator finds a `(hand, measure, beat)` position where exactly
one note sounds:

- **Priority 1:** Right-hand single-note positions (44/45 records)
- **Priority 2:** Left-hand single-note positions (1/45 records: `clair-de-lune-m019-022`,
  which is a heavily chord-based passage)
- Anchor selected deterministically via LCG seeded with `hash(record.id + "annotation_grounding_q")`

### Distractor generation

Three distinct wrong pitches at ±1, ±2, ±3 semitones from the correct note (piano range
21–108 enforced). All options have the same string structure (`"E5"`, `"D#5"`, etc.).

### Evidence metadata

New fields on `MCQuestion`:
- `evidence_required: "midi_sidecar"` — signals to eval consumers that MIDI access is
  required to answer
- `midiClaim: { hand, measure, beat, note }` — structured anchor for precise event lookup
  in gold and random-MIDI answerers

### Updated `randomMidiAnswer` for `annotation_grounding`

The random-MIDI answerer now uses `midiClaim` to look up the note at the exact
`(hand, measure, beat)` position in the partner record's `timed_events`. If found, it
selects the option matching that note (likely wrong). If not found (different phrase
structure), falls through to LCG random (also likely wrong).

---

## Before/After Examples

### Example 1 — Für Elise m001-008

**Before (Slice 7):**
- Question: "Which of the following statements about this phrase is supported by the MIDI data?"
- Correct: "The right hand plays more notes than the left hand (RH: 62, LH: 40)"
- Distractors: "The left hand plays more notes than the right hand" / "The highest pitch in this phrase is A2" / "This phrase contains 9 distinct pitch classes"

**After (Slice 8):**
- Question: "In measure 1, which pitch does the right hand play on beat 2?"
- Correct: "E5"
- Distractors: "F5" / "D#5" / "F#5"

### Example 2 — Bach Prelude m001-004

**Before (Slice 7):**
- Question: "Which of the following statements about this phrase is supported by the MIDI data?"
- Correct: "The right hand plays more notes than the left hand (RH: 16, LH: 16)"
- Distractors: "The right hand plays more notes than the left hand" / "The highest pitch in this phrase is C2" / ...

**After (Slice 8):**
- Question: "In measure 1, which pitch does the right hand play on beat 1.0021?"
- Correct: "C4"
- Distractors: "C#4" / "B3" / "D4"

### Example 3 — Clair de Lune m019-022 (chord-heavy, LH fallback)

**Before (Slice 7):**
- Question: "Which of the following statements about this phrase is supported by the MIDI data?"
- Correct: "The left hand plays more notes than the right hand (LH: 34, RH: 100)"
- Distractors: (structurally different)

**After (Slice 8):**
- Question: "In measure 20, which pitch does the left hand play on beat 3.5?"
- Correct: "G#3"
- Distractors: "A3" / "G3" / "A#3"
- Note: Uses LH fallback because all RH positions in this record are chords.

### Example 4 — Chopin Nocturne m001-004

**Before (Slice 7):**
- Question: "Which of the following statements about this phrase is supported by the MIDI data?"
- Correct: "The right hand plays more notes than the left hand (RH: 28, LH: 17)"

**After (Slice 8):**
- Question: "In measure 1, which pitch does the right hand play on beat 2?"
- Correct: "B4"
- Distractors: "C5" / "A#4" / "C#5"

---

## Aggregate Scores — Before/After

### annotation_grounding per-type

| Answerer | Slice 7 (Before) | Slice 8 (After) | Gate (≤0.30) |
|----------|-----------------|-----------------|--------------|
| Gold | 100.0% | 100.0% | — |
| Text-only | 37.8% | 28.9% | PASS ✓ |
| Random-MIDI | 0.0% | 0.0% | PASS ✓ |

Text-only: 37.8% → 28.9% (−8.9pp, now within the ≤0.30 hard gate for Slice 8).
Random-MIDI: already at 0.0%, remains 0.0%.

### Load-bearing aggregate (types 3, 4, 5, 7 combined)

| Answerer | Slice 7 (Before) | Slice 8 (After) |
|----------|-----------------|-----------------|
| Gold | 100.0% | 100.0% |
| Text-only | 28.3% | 26.1% |
| Random-MIDI | 4.4% | 4.4% |
| Gold − text_only | +71.7pp | +73.9pp |
| Gold − rand_midi | +95.6pp | +95.6pp |

### Per-type breakdown (Slice 8)

| Type | Gold | Text-only | Random-MIDI |
|------|------|-----------|-------------|
| pitch_class_count (LB) | 100.0% | 24.4% | 6.7% |
| hand_register (LB) | 100.0% | 22.2% | 0.0% |
| rhythm_onset (LB) | 100.0% | 28.9% | 11.1% |
| **annotation_grounding (LB)** | **100.0%** | **28.9%** | **0.0%** |
| key_time_sig | 100.0% | 55.6% | 100.0% |
| measure_range | 100.0% | 26.7% | 100.0% |
| provenance | 100.0% | 26.7% | 100.0% |

All bookkeeping types unchanged. Load-bearing types unchanged except annotation_grounding
which is now at the same level as the other load-bearing types.

---

## Regression Check

- Gold rule-based answerer: **1.0 on annotation_grounding** (no regression — gold still
  follows MIDI deterministically via `midiClaim` event lookup)
- All 45 records produce computable `annotation_grounding` questions (no `not_computable`
  regression)
- All 6 other question types unchanged
- All 1137 tests pass (1114 pre-Slice 8 + 23 new Slice 8 tests)
- Hard gates: 6/6 PASS

---

## Implementation Files Changed

1. `src/dataset/eval/annotation-grounding.ts`:
   - `MCQuestion` interface: added `evidence_required?` and `midiClaim?` fields
   - `generateAnnotationGroundingQuestion`: replaced hand-count prose with pitch-at-position
     claim; added priority-1/priority-2 anchor selection; structural comment explains
     model-independence rationale
   - `randomMidiAnswer` (`ANNOTATION_GROUNDING` case): uses `midiClaim` for precise event
     lookup instead of regenerating hand-count comparison

2. `src/dataset/eval/annotation-grounding.test.ts`:
   - Updated `generateAnnotationGroundingQuestion` describe block: replaced old
     `/right hand/` assertion with new note-name assertions; added 13 new tests
     covering the hardened generator's behavior
   - Added `Slice 8 hard gates — annotation_grounding per-type` describe block: 9 new
     corpus-regression tests enforcing ≤0.30 text-only/random-MIDI gates

3. `datasets/jam-actions-v0/evals/e3-annotation-grounding-results.json`:
   - Re-run output with Slice 8 hardened generator

4. `docs/jam-actions-v0-slice8-e3-hardening.md` (this file)

---

## Other Findings (Not Modified)

During investigation, the following was confirmed about the other question types — no
changes made, all within ±2pp of Slice 7 baseline:

- **`pitch_class_count`**: text_only 24.4% (was 24.4%). Not leakable from prose.
- **`hand_register`**: text_only 22.2% (was 22.2%). Not leakable from prose.
- **`rhythm_onset`**: text_only 28.9% (was 28.9%). Not leakable from prose.
- **`key_time_sig`**: text_only 55.6% (was 55.6%). Key names appear in annotation
  prose — known bookkeeping leakage, not load-bearing.
- **`provenance`**: text_only 26.7% (was 26.7%). Bernd Krueger concentration (all 45
  records share one arranger) documented in Slice 7 report. Not actionable in this slice.

No corpus records required modification. All 45 records already provided sufficient MIDI
events to generate single-note anchor positions for the hardened claim type.

---

## What Slice 8.5 Tests

With the hardened generator, the next LLM eval (Slice 8.5) should show:
- Full-context LLM substantially beats random-MIDI on `annotation_grounding`
  (it must read MIDI to identify the specific pitch at a specific position)
- Random-MIDI baseline near 0% on `annotation_grounding` (wrong MIDI → wrong note)
- The "E3 random-MIDI margin = 0.000" failure from Slice 7.5 should not recur
