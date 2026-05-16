# E3 Annotation Grounding Eval — jam-actions-v0 Slice 7

**Eval date:** 2026-05-16T20:54:35.283Z
**Schema version:** `e3-annotation-grounding/1.0.0`
**Total records:** 45
**Status:** ALL HARD GATES PASS

---

## Overview

E3 validates that records teach **MIDI-grounded musical observation** — not generic prose claims that a text-only LLM could answer without seeing the music. This implements the MuChoMusic 2024 finding (Weck et al., arXiv:2408.01337): text-only LLMs hit >50% on music QA benchmarks when questions are answerable from annotation prose alone.

Harness: 7 MCQ types per record (N=4 options, chance = 25%), 3 rule-based answerers (gold / text_only / random_midi). No LLM calls.

**Load-bearing types** (require MIDI to answer): pitch_class_count (type 3), hand_register (type 4), rhythm_onset (type 5), annotation_grounding (type 7).

**Bookkeeping types** (prose-answerable): key_time_sig (type 1), measure_range (type 2), provenance (type 6). Tracked but do not carry hard gates.

---

## Answerer Design

| Answerer | Context | Expected score |
|---|---|---|
| **gold** | Full record: provenance, scope, annotation, MIDI sidecar | ~1.0 (deterministic extraction) |
| **text_only** | annotation_target prose only (structure, key_moments, teaching_notes, style_tips). No MIDI, no scope | ~0.25 (chance on load-bearing) |
| **random_midi** | Correct annotation + MIDI from a different record | ~0.25 (wrong MIDI → wrong extracted values) |

**Random-MIDI partner selection strategy:** deterministic shift by floor(N/2) = 22 positions in sorted record list. Same-song partners avoided by +1 shift when detected. Deterministic given corpus — no external RNG.

---

## Hard Gates

| Gate | Value | Threshold | Status |
|---|---|---|---|
| Gold > text_only by ≥10pp (load-bearing) | 0.717 | 10pp | PASS |
| Gold > random_midi by ≥10pp (load-bearing) | 0.956 | 10pp | PASS |
| Text_only ≤ 40% (at chance) | 0.283 | ≤40% | PASS |
| Random_midi ≤ 40% (at chance) | 0.044 | ≤40% | PASS |
| All records have LB questions (types 3,4,5) | yes | yes | PASS |
| All not_computable have reason strings | yes | yes | PASS |

---

## Aggregate Scores

### Overall (all 7 types)

| Answerer | Score | Notes |
|---|---|---|
| Gold | 100.0% | Perfect — rule-based extraction always finds correct answer |
| Text-only | 31.7% | Boosted by non-load-bearing types (types 1, 2, 6) where prose leaks answers |
| Random-MIDI | 45.4% | Non-load-bearing types still answered correctly (annotation is correct) |

### Load-bearing types only (types 3, 4, 5, 7)

| Answerer | Score | Notes |
|---|---|---|
| Gold | 100.0% | Full MIDI access → perfect extraction |
| Text-only | 28.3% | Cannot count MIDI events → random choice |
| Random-MIDI | 4.4% | Wrong MIDI → wrong counts → wrong answers |
| **Gold margin over text_only** | **+71.7pp** | Gate ≥10pp |
| **Gold margin over random_midi** | **+95.6pp** | Gate ≥10pp |

---

## Per-Question-Type Breakdown

| Type | Category | Gold | Text-only | Random-MIDI | vs Text | vs Rand | Computed | NC |
|---|---|---|---|---|---|---|---|---|
| `key_time_sig` | bookkeeping | 100.0% | 55.6% | 100.0% | +44.4pp vs text | +0.0pp vs rand | 45 | 0 |
| `measure_range` | bookkeeping | 100.0% | 26.7% | 100.0% | +73.3pp vs text | +0.0pp vs rand | 45 | 0 |
| `pitch_class_count` | **LB** | 100.0% | 24.4% | 6.7% | +75.6pp vs text | +93.3pp vs rand | 45 | 0 |
| `hand_register` | **LB** | 100.0% | 22.2% | 0.0% | +77.8pp vs text | +100.0pp vs rand | 45 | 0 |
| `rhythm_onset` | **LB** | 100.0% | 28.9% | 11.1% | +71.1pp vs text | +88.9pp vs rand | 45 | 0 |
| `provenance` | bookkeeping | 100.0% | 26.7% | 100.0% | +73.3pp vs text | +0.0pp vs rand | 45 | 0 |
| `annotation_grounding` | **LB** | 100.0% | 37.8% | 0.0% | +62.2pp vs text | +100.0pp vs rand | 45 | 0 |

**Key:**
- **LB** = load-bearing (requires MIDI extraction, carries hard gates)
- bookkeeping = prose-answerable (type 1/2/6), expected text_only leakage
- NC = not_computable count

---

## Example MCQs (load-bearing types)

**Type: `pitch_class_count`** (record: `bach-prelude-c-major-bwv846:m001-004:piano:mcp-ses`)
> How many notes with pitch class C appear in this phrase?

- **[CORRECT]** `A`) 14
- `B`) 11
- `C`) 12
- `D`) 16

---

**Type: `hand_register`** (record: `bach-prelude-c-major-bwv846:m001-004:piano:mcp-ses`)
> Which hand plays more notes in this phrase?

- `A`) Left hand (65 notes)
- `B`) Equal (32 notes each)
- **[CORRECT]** `C`) Right hand (62 notes)
- `D`) Right hand (59 notes)

---

**Type: `rhythm_onset`** (record: `bach-prelude-c-major-bwv846:m001-004:piano:mcp-ses`)
> How many notes start on beat 1 (downbeat) across all bars in this phrase?

- `A`) 6
- `B`) 7
- `C`) 10
- **[CORRECT]** `D`) 8

---

**Type: `annotation_grounding`** (record: `bach-prelude-c-major-bwv846:m001-004:piano:mcp-ses`)
> Which of the following statements about this phrase is supported by the MIDI data?

- `A`) The left hand plays more notes than the right hand
- `B`) The highest pitch in this phrase is B3
- `C`) This phrase contains 9 distinct pitch classes
- **[CORRECT]** `D`) The right hand plays more notes than the left hand (RH: 62, LH: 2)

---

## Question Design Notes

### Type 1 (key_time_sig) — Design path B
Text_only does not see scope.key. However, the key name often appears verbatim in annotation_target.structure (e.g., "Opening arpeggiated pattern establishing the prelude's texture"). This leakage is **expected and documented** — type 1 is bookkeeping, not load-bearing. Gold beats text_only primarily through the 4 MIDI-grounded types.

### Type 3 (pitch_class_count) — Load-bearing, MIDI-grounded
Gold extracts the count of the most-frequent pitch class from MIDI sidecar (deterministic, exact). Text_only receives no MIDI — must guess one of 4 integer options. Random-MIDI extracts the same pitch class from a different record's MIDI, producing a wrong count. Expected behavior: gold=1.0, text=chance, rand=chance.

### Type 4 (hand_register) — Load-bearing, MIDI-grounded
Gold counts right/left hand events from MIDI and identifies the dominant hand with exact count. Options include fake count variants as distractors. Text_only sees annotation prose mentioning hand roles but without exact counts — cannot reliably select the correct option with count embedded.

### Type 5 (rhythm_onset) — Load-bearing, MIDI-grounded
Gold counts events on beat 1 (downbeat) across all bars. The beat convention (0-indexed vs 1-indexed) is handled by inspecting the actual data. Random-MIDI counts beat-1 events from a different piece — the count will differ for most pairs.

### Type 6 (provenance) — Bookkeeping corner case
All 10 classical songs in this corpus use Bernd Krueger (piano-midi.de) as arranger. This means text_only may guess Bernd Krueger with prior knowledge. This is a **corpus-level fact** (single arranger, 10 compositions), not a question design flaw. Documented as an open finding.

### Type 7 (annotation_grounding) — Load-bearing, MIDI-grounded
The true statement describes RH vs LH note count with exact numbers embedded (e.g., "The right hand plays more notes than the left hand (RH: 34, LH: 15)"). Distractors invert the hand relationship or cite wrong pitch statistics. Text_only sees generic hand-role descriptions in the annotation prose but not the exact counts — must guess.

---

## not_computable Audit

Total not_computable entries: 0

All questions computable on all records.

---

## Random-MIDI Partner Assignments (sample, first 5)

| Record | Partner |
|---|---|
| `bach-prelude-c-major-bwv846:m001-004:piano:mc` | `fur-elise:m001-008:piano:mcp-session:v1` |
| `bach-prelude-c-major-bwv846:m005-008:piano:mc` | `fur-elise:m009-012:piano:mcp-session:v1` |
| `bach-prelude-c-major-bwv846:m009-012:piano:mc` | `fur-elise:m013-016:piano:mcp-session:v1` |
| `bach-prelude-c-major-bwv846:m013-016:piano:mc` | `mozart-k545-mvt1:m001-004:piano:mcp-session:v` |
| `chopin-nocturne-op9-no2:m001-004:piano:mcp-se` | `mozart-k545-mvt1:m005-008:piano:mcp-session:v` |

*(Full partner assignment table in JSON output under `partnerAssignments`.)*

---

## Open Findings

1. **Provenance type 6 Bernd Krueger concentration:** All 45 records in the corpus share the same arranger (Bernd Krueger, piano-midi.de). Text_only answering with musical prior knowledge could correctly name Bernd Krueger at above-chance rates. This does not affect the hard gates (which rest on load-bearing types 3-5), but is worth monitoring when the corpus expands to include other arrangement sources.

2. **Key leakage into prose (type 1):** Key signatures appear in annotation structure text for most records. This is expected (type 1 is bookkeeping) and confirmed by the text_only score on type 1.

3. **Bach Prelude pitch-class uniformity:** Bach Prelude records have highly uniform pitch-class distributions (all records in C major with identical arpeggio patterns across 4-bar windows). Pitch-class count question picks the most-frequent PC — the gap between correct and distractor counts is smaller than for records with more harmonic variety. Gold still scores 1.0; no correctness issue, but the "signal" is somewhat lower variance than Chopin/Schumann.

---

*Generated by `scripts/eval-jam-actions-annotation-grounding.ts`*
