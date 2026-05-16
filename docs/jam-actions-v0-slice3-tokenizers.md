# Slice 3 Report — Real Tokenizers + Phrase Slicer

**Date:** 2026-05-16
**Slice:** 3 of the `jam-actions-v0` dataset build
**Status:** COMPLETE — all 9 deliverables shipped, 813/813 tests passing

---

## Summary

Slice 3 removed all placeholder token fields and replaced them with real REMI and ABC notation output for all three pilot songs. The schema now rejects placeholder token shapes by default. Three valid pilot records pass strict validation without `allow_placeholders`.

---

## Deliverable Status

| # | Deliverable | Status |
|---|-------------|--------|
| 1 | `src/dataset/phrase-slicer.ts` | DONE |
| 2 | `src/dataset/abc-adapter.ts` | DONE |
| 3 | `src/dataset/remi-adapter.ts` | DONE — hand-rolled REMI (option 3) |
| 4 | Schema placeholder rejection | DONE — `makeRecordSchema()` + `makeRemiSchema()` + `makeAbcSchema()` |
| 5 | Rebuild `fur-elise-m001-008.json` | DONE — 199 REMI tokens, real ABC string |
| 6 | Bach prelude record (`m001-004`) | DONE — 260 REMI tokens, 4 measures |
| 7 | Mozart K545 record (`m001-004`) | DONE — 187 REMI tokens, 4 measures |
| 8 | Tests | DONE — 72 new tests (813 total, up from 741) |
| 9 | This report | DONE |

---

## REMI Integration — Path Chosen

**Option 3: Hand-rolled minimal REMI** following Huang & Yang 2020 (arXiv:2002.00212).

**Evaluated paths in order:**

1. **JS-native REMI library (npm search: `miditok`, `remi`, `music-tokenizer`)** — No match found. `miditok` is Python-only; no JS port exists on npm.
2. **MidiTok via Python subprocess** — Python 3.13 is installed but `miditok` is not (`ModuleNotFoundError`). Installing it would add a heavyweight dependency for a single function.
3. **Hand-rolled minimal REMI** — Chosen. The sidecar `timed_events` already contains all required fields (MIDI note number, velocity, start tick, duration ticks, measure). Five token classes can be computed directly with no external deps.

**Why option 3 is the right call here:** The sidecar truth (tick-accurate MIDI events) is already parsed and structured in the exact format REMI needs. The tokenizer is a pure function over `TimedEvent[]` — no I/O, no subprocess overhead, no new dependencies.

### Token vocabulary implemented (Huang & Yang 2020 spec):

| Token | Format | Notes |
|-------|--------|-------|
| `Bar_<N>` | 1-indexed measure | Emitted at start of each measure |
| `Position_<0-N>` | Subdivisions within bar | 96 for 4/4, 36 for 3/8, etc. |
| `Pitch_<0-127>` | MIDI note number | All notes, both hands |
| `Velocity_<bin>` | Quantized to bins of 4 | 0–124, 32 bins matching paper |
| `Duration_<N>` | Sixteenth-note units | clamped [1, 64] |

### Deviations from paper:

1. **Bar numbering:** 1-indexed (paper uses 0-indexed) — matches sidecar `measure` field.
2. **Chord voicing:** ALL notes in both hands are tokenized (melody + bass). Position is shared per tick cluster; individual notes each get their own Pitch/Velocity/Duration quartet, sorted lowest-to-highest.
3. **No Beat_ tokens:** Using Bar + Position as full temporal context, which covers the phrase-level granularity needed for v0.

---

## Phrase Selection Rationale

### Für Elise — measures 1–8

Unchanged from Slice 1. The synthesis anchor record. Eight measures capture the full A-theme statement (mm. 1–4) plus its restatement (mm. 5–8). This is the canonical phrase that defines the dataset's regression anchor.

### Bach C Major Prelude, BWV 846 — measures 1–4

**Choice: mm. 1–4.** These four measures establish the complete arpeggiated pattern template that defines the entire piece: C major (m.1) → A minor (m.2) → D minor7 (m.3) → G major (m.4). This four-measure unit is pedagogically complete — it contains the full harmonic template that the piece repeats with variation. The pattern uses 16th-note arpeggios throughout, giving 64 timed events across 4 measures (ideal density for REMI coverage).

**Why not mm. 1–8:** eight measures would double the phrase but the harmonic template is already complete at m.4. The synthesis specifies "one canonical phrase per pilot song" — mm. 1–4 is the minimal unit that makes the piece's texture fully legible.

### Mozart K545 Mvt. 1 — measures 1–4

**Choice: mm. 1–4.** The first four measures contain the complete opening theme: the iconic ascending C major scale (m.1) followed by melodic development (mm. 2–4) over Alberti bass, closing with a half cadence on G at m.4. This is the standard "first phrase" of the Classical sonata exposition. The phrase closes at m.4 before the second theme group begins.

**Why not mm. 1–8:** mm. 5–8 are a transitional development passage, not part of the opening theme proper. The first closed phrase ends at m.4.

---

## Test Counts

| Scope | Before | After | Delta |
|-------|--------|-------|-------|
| Total tests | 741 | 813 | +72 |
| Test files | 25 | 29 | +4 |
| New: `phrase-slicer.test.ts` | — | 13 | +13 |
| New: `abc-adapter.test.ts` | — | 22 | +22 |
| New: `remi-adapter.test.ts` | — | 27 | +27 |
| New: `schema-placeholder.test.ts` | — | 10 | +10 |

All 741 pre-Slice-3 tests continue to pass.

---

## Placeholder Rejection

**Confirmed working.** The `makeRecordSchema({ allow_placeholders: false })` factory:

- **REJECTS** records where `tokens_remi` is `{ todo: "..." }` → Zod error at path `observation.tokens_remi`
- **REJECTS** records where `tokens_abc` is `{ todo: "..." }` → Zod error at path `observation.tokens_abc`
- **ACCEPTS** the same records when `allow_placeholders: true`
- **ACCEPTS** all 3 pilot records with real tokens (no flag needed)

The default `RecordSchema` export still includes the placeholder union branch for backward compatibility with Slice 1 code paths that predate this gate.

---

## Record Details

### fur-elise-m001-008.json

- **REMI:** 199 tokens (covers mm. 1–8, 49 notes × ~4 tokens each + 8 Bar tokens + Position tokens)
- **ABC:** 146 characters, key Amin, 3/8 time
- **SVG:** 18,809 bytes (same SVG renderer as Slice 1)
- **Provenance:** `public_candidate` (Bernd Krueger / piano-midi.de / CC-BY-SA — unchanged from Slice 1)
- **Change from Slice 1:** `tokens_remi` and `tokens_abc` fields replaced; all other fields identical

### bach-prelude-c-major-bwv846-m001-004.json

- **ID:** `bach-prelude-c-major-bwv846:m001-004:piano:mcp-session:v1`
- **REMI:** 260 tokens (64 events in 4 measures — arpeggiated texture has high note density)
- **ABC:** 178 characters, key C, 4/4 time
- **SVG:** 16,804 bytes
- **Provenance:** `public_candidate` (Bach d. 1750, deep EU PD margin; Bernd Krueger / piano-midi.de / CC-BY-SA)
- **Tempo:** 74 BPM (from MIDI initial tempo)

### mozart-k545-mvt1-m001-004.json

- **ID:** `mozart-k545-mvt1:m001-004:piano:mcp-session:v1`
- **REMI:** 187 tokens (49 events in 4 measures — melody + Alberti bass)
- **ABC:** 172 characters, key C, 4/4 time
- **SVG:** 11,357 bytes
- **Provenance:** `public_candidate` (Mozart d. 1791; Bernd Krueger / piano-midi.de / CC-BY-SA)
- **Tempo:** ~137 BPM (from MIDI initial tempo — fast Allegro)

---

## Architecture Decisions

### phrase-slicer.ts

- Slice boundary: a note is included if its START measure falls within `[start, end]`. Notes that sustain past the end are included (truth first — per synthesis Slice 1 resolution #2 on MIDI tick truth).
- Output is sorted by `t_ticks` ascending, then note number (deterministic ordering for downstream REMI).
- Metadata includes `start_tick`, `end_tick`, `start_seconds`, `end_seconds` for the phrase — computed from sidecar events, not from measure arithmetic.

### abc-adapter.ts

- Monophonic melody from the highest RH note per tick cluster. LH bass not included in the melody line (keeps ABC string LLM-readable).
- Unit note length `L:1/16` gives clean fractions for common rhythmic values.
- ABC accidentals: `^` for sharps (default), `_` for flats in flat-key contexts.
- Octave encoding: ABC C4 = uppercase C, C5 = lowercase c, C3 = C, (one comma), etc.

### scripts/build-pilot-records.ts

Generalized builder that replaces `scripts/build-record-fur-elise-m001-008.ts` as the canonical build script for all three pilot records. The original Für Elise script is preserved untouched (per kickoff: "no refactor ... beyond what's strictly necessary").

The generalized builder uses `classifyProvenance()` from `src/dataset/provenance.ts` (rule engine from Slice 2) instead of the inline hardcoded gate in the Für Elise script.

---

## No Blocked Items

All three REMI paths were evaluated in order per the kickoff:

1. JS-native npm library: not found
2. Python subprocess (MidiTok): not installed
3. Hand-rolled: implemented, shipped, tests passing

REMI is not blocked. No deferred items.

---

## Open Questions for User

1. **ABC monophonic vs. two-voice:** the current ABC output shows only the RH melody (highest note per tick cluster). Would you like a two-voice ABC output (bass clef line for LH)? This adds `V:1` / `V:2` ABC voice headers and doubles the string length but gives full harmonic content in the ABC representation.

2. **REMI Position quantization for 3/8:** Für Elise uses 36 subdivisions per measure in 3/8. The paper uses 96 for 4/4. The 36-subdivision choice preserves the original paper's philosophy (triplet resolution within each beat) adapted for the 3/8 signature. If benchmarking against POP909/MAESTRO (which use 4/4 primarily), normalizing all time signatures to a 96-subdivision encoding may simplify cross-dataset comparison.

3. **The Entertainer metadata:** still missing `source` field in song JSON — would remain `internal`. This is the Slice 2 deferred item; worth a 5-minute fix before the Slice 5 pilot build.
