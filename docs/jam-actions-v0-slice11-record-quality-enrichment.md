# Slice 11 — Record Quality Enrichment (`jam-actions-v0` v0.2.0)

**Status:** SHIPPED 2026-05-17
**Public package version:** 0.1.1 → 0.2.0
**Records changed:** 6 (source + public copies, byte-identical)
**Hard gates:** 14/14 PASS
**E1 gold pass rate:** 1.0 (preserved corpus-wide)

## What changed

Slice 10.5 hardened the public package's docs (DATASET_SCHEMA / KNOWN_LIMITATIONS / ATTRIBUTION) without touching records. The audit explicitly named records whose `annotation_target` was thin / boilerplate / generic. Slice 11 enriches those records so the annotations become musically grounded — referencing specific pitches, beats, and harmonic events rather than generic music-appreciation prose.

The architectural rule is load-bearing: **no hand-edits to generated record JSONs as source of truth.** All record-content changes flow through a durable overlay file → enrichment library → CLI runner. Re-running the runner with the same overlay produces byte-identical record JSONs (idempotent).

## Architecture (locked, shipped as written)

```
                       ┌──────────────────────────────────────┐
                       │ datasets/jam-actions-v0/             │
                       │   enrichment-overrides.json          │ ← THE source of truth
                       │   (overlay; durable audit trail)     │   for what was changed
                       └────────────────┬─────────────────────┘
                                        │ read
                                        ▼
                       ┌──────────────────────────────────────┐
                       │ scripts/apply-jam-actions-enrichment │ ← CLI runner
                       │   --dry-run / --check supported      │
                       └────────────────┬─────────────────────┘
                                        │ calls
                                        ▼
                       ┌──────────────────────────────────────┐
                       │ src/dataset/enrichment.ts            │ ← pure library
                       │   applyEnrichment(record, overlay)   │
                       │   - whitelist enforcement            │
                       │   - schema-validates result          │
                       │   - returns audit-trail              │
                       └────────────────┬─────────────────────┘
                                        │ writes
                                        ▼
                       ┌──────────────────────────────────────┐
                       │ datasets/jam-actions-v0/records/     │ ← enriched records
                       │   <id>.json (key order preserved)    │   land here
                       └──────────────────────────────────────┘
```

### Whitelist (LOCKED)

The library REJECTS overlays containing any field outside this whitelist:

**Allowed to override:**
- `annotation_target` (entire field replaced atomically — not deep-merged)
- `target_trace` (entire field replaced atomically — not deep-merged)
- `scope.musical_phrase_label` (the only enrichable key inside scope)

**Never allowed (overlay containing any of these is REJECTED):**
- `id`, `schema_version`
- Any `provenance.*` field (Slice 2.5's verdicts are immutable here)
- Any `observation.*` field (MIDI sidecar / tokens / piano-roll path are source data, not "enrichable" prose)
- `scope.song_id`, `scope.phrase_window`, `scope.window_role`, `scope.continuation_target_window`, `scope.paired_prompt_record_id`, `scope.instrument`, `scope.key`, `scope.tempo_bpm`, `scope.time_signature`, `scope.natural_phrase_boundary` (split + pair-lock + dataset-build fields are locked)
- Any `eval_metadata.*` field

One of the 32 enrichment-library tests demonstrates each rejection class (`forbidden_top_level_field` and `forbidden_scope_key`).

### Idempotency

After enrichment, `pnpm exec tsx scripts/apply-jam-actions-enrichment.ts --check` returns `CHECK PASS: 6 overlay entries; 0 records would change.` Re-running the runner with the same overlay produces byte-identical record JSONs. The library deliberately returns the cloned source record (preserving its on-disk key insertion order) rather than zod's parsed output (which would re-order keys to match the schema declaration); this is a load-bearing implementation detail that the slice's iteration uncovered.

## Per-record enrichment summary

Six records enriched (annotation_target + scope.musical_phrase_label on each). target_trace was left at its existing content for all six — the existing traces already validate against `tool-schemas.json` (E1 gold pass rate = 1.0) and the annotation_target enrichment is where the dataset's training signal lives. Touching target_trace risked dropping E1 below 1.0 without a corresponding training-signal gain.

| Record id | musical_phrase_label changed to | One-sentence rationale |
|---|---|---|
| `pathetique-mvt2:m025-028:piano:mcp-session:v1` (prompt) | "Ab-minor middle episode antecedent — contrasting agitato over wandering bass" | Names the parallel-minor contrasting episode, the chromatic bass descent G3→D♭→B♭2, and the F5 climax at m. 25 b2.6. |
| `pathetique-mvt2:m029-032:piano:mcp-session:v1` (continuation) | "Ab-minor middle episode consequent — dominant pedal preparing the cantabile return" | Names the G#2/A♭2 dominant pedal at m. 31 b2.7 (≈3.27s) and the resolution to m. 33's cantabile main-theme return. |
| `schumann-traumerei:m045-048:piano:mcp-session:v1` | "closing plagal resolution — F major arpeggio rising over tonic pedal" | Names the F2 tonic pedal at m. 46 b3.4 (≈3.32s) and the closing F-major arpeggio F4→A4→C5→F5 across m. 48; preserves the §6 "rhythm_onset not_computable" honest-absence note. |
| `bach-prelude-c-major-bwv846:m045-048:piano:mcp-session:v1` | "coda transition — chromatic dominant prep with G2/A2 pedal bass" | Names the F#5 chromatic pitch at m. 45 b1.0, the G2 bass attack at b2.0, and contrasts the 82 RH / 43 LH note density vs. the opening's 62 / 2. |
| `bach-prelude-c-major-bwv846:m049-052:piano:mcp-session:v1` | "coda extension antecedent — chromatic upper-voice density continues" | Names the chromatic pitches (F#3/4, A#2, G#4) and the dense LH bass with 10+ attacks per bar in m. 50 — explicit contrast with the opening's one-note-per-measure pedal. |
| `bach-prelude-c-major-bwv846:m053-056:piano:mcp-session:v1` | "coda extension consequent — chromatic dominant prep continues toward cadence" | Names this as cadential-preparation (NOT tonic-cycling) and points to the m. 57-60 / m. 61-64 pair as where the cadence completes. |

**Scope expansion documented in KNOWN_LIMITATIONS §5b:** the original §5 explicitly named `pathetique-mvt2:m029-032`, `schumann-traumerei:m045-048`, and `bach-prelude-c-major-bwv846:m045-048 (and similar late-Bach records)`. Slice 11 extended scope to also enrich:
- The Pathétique pair's PROMPT half (`m025-028`) so the antecedent–consequent pair is enriched as a unit
- Two sibling late-Bach coda-texture records (`m049-052`, `m053-056`) since the same enrichment template applied and leaving them sparse would have produced a one-off enrichment surrounded by structurally identical thinner records

The final two late-Bach records (`m057-060` and `m061-064`) were NOT enriched — they describe the final-cadence and tonic-arrival areas, which already had more architectural framing than the coda-extension records did. "Don't enrich already-rich records" was respected.

## Before / After diff sample

### `schumann-traumerei:m045-048` `annotation_target.key_moments`

**Before:**
```json
[
  "m45 final descent",
  "m47 almost there",
  "m48 warmth and stillness"
]
```

**After:**
```json
[
  "m. 45 b0.5 — A4 right-hand entrance (the piece's signature soft offbeat attack) over an A3 left-hand support; this whole window is anacrustic and has no downbeat onsets (corpus property: rhythm_onset is not_computable for this record)",
  "m. 45 b2.7 — A#3 (B♭3) long-hold in the left hand (~1.6 seconds) — the subdominant color before the tonic pedal arrives",
  "m. 46 b3.4 — F2 left-hand pedal enters and sustains ≈3.32 seconds, the longest bass note of the closing; from here on, every right-hand event is heard over the F-major tonic floor",
  "m. 48 b0.85 → b3.7 — the closing F-major arpeggio F4 → A4 → C5 → F5 rises through two octaves; each note enters offbeat, so the line floats above the pedal rather than landing on it",
  "m. 48 b3.7 — F5 final pitch, velocity 73 (the loudest right-hand event in the closing) — the dream's quiet apex"
]
```

Every key moment now names a specific beat, a specific pitch (with octave), and a musical reason. The connection to §6's `rhythm_onset: not_computable` finding is now explicit in the annotation rather than absent.

### `bach-prelude-c-major-bwv846:m045-048` `annotation_target.structure`

**Before:**
> "Post-resolution consequent — calm tonic cycling returns"

**After:**
> "Continuation of the prelude's post-pedal coda area (Krueger's arrangement extends the WTC original past m. 35 with a chromatic-cadential coda). The texture is no longer the simple opening arpeggio (RH-only over LH whole-note pedal); the Krueger arrangement layers three right-hand voices on top of a structural left-hand bass that descends through G2 → A2 → G2 across m. 45–48. Chromatic pitches outside C major appear (F#5 at m. 45, F#3/F#4/G#4 in adjacent measures), marking this as pre-cadential dominant preparation rather than tonic statement."

The "before" framing ("calm tonic cycling returns") was musically wrong — the late prelude in Krueger's arrangement is NOT a tonic-cycling reprise of the opening texture; it's a denser coda extension with multiple chromatic pitches. The "after" version names the actual texture and the bass motion that disambiguates it from the opening.

## Files changed

**New source files (3):**
- `src/dataset/enrichment.ts` (~470 lines — pure library with whitelist enforcement + audit trail)
- `src/dataset/enrichment.test.ts` (32 tests covering whitelist enforcement, replacement semantics, idempotency, audit trail, schema validation, E1 trace validity, input-shape guards, overlay-file validation)
- `scripts/apply-jam-actions-enrichment.ts` (CLI runner with `--dry-run` and `--check` flags)

**New data file (1):**
- `datasets/jam-actions-v0/enrichment-overrides.json` (the durable audit-trail overlay with 6 override entries)

**Modified source records (6):**
- `datasets/jam-actions-v0/records/bach-prelude-c-major-bwv846-m045-048.json`
- `datasets/jam-actions-v0/records/bach-prelude-c-major-bwv846-m049-052.json`
- `datasets/jam-actions-v0/records/bach-prelude-c-major-bwv846-m053-056.json`
- `datasets/jam-actions-v0/records/pathetique-mvt2-m025-028.json`
- `datasets/jam-actions-v0/records/pathetique-mvt2-m029-032.json`
- `datasets/jam-actions-v0/records/schumann-traumerei-m045-048.json`

All 6 source records have ZERO diff lines on forbidden fields (id, schema_version, provenance.\*, observation.\*, eval_metadata.\*, locked scope fields). Only `annotation_target` and `scope.musical_phrase_label` changed.

**Modified packager (1):**
- `scripts/package-jam-actions-public.ts` — `PACKAGE_VERSION: "0.1.0" → "0.2.0"`; `SOURCE_TAG: "jam-actions-v0-public-2026-05-17" → "jam-actions-v0-enriched-2026-05-17"`

**Regenerated public-package files:**
- `datasets/jam-actions-v0-public/VERSION` (0.1.1 → 0.2.0)
- `datasets/jam-actions-v0-public/manifest.json` (version 0.2.0, all other fields regenerated by packager)
- `datasets/jam-actions-v0-public/CITATION.cff` (version 0.2.0)
- `datasets/jam-actions-v0-public/README.md` (version 0.2.0, BibTeX 0.2.0, source-tag updated)
- `datasets/jam-actions-v0-public/records/<6 enriched ids>.json` (copies from source)
- `datasets/jam-actions-v0-public/records.jsonl` (regenerated; 115 lines preserved)
- `datasets/jam-actions-v0-public/checksums.sha256` (regenerated; 241 lines, all verify)
- `datasets/jam-actions-v0-public/KNOWN_LIMITATIONS.md` (§5 marked as addressed, §5b added documenting scope expansion)

**Preserved across regeneration:**
- `datasets/jam-actions-v0-public/ATTRIBUTION.md` (restored from git after packager wiped it; Slice 10.5 content unchanged)
- `datasets/jam-actions-v0-public/DATASET_SCHEMA.md` (restored from git after packager wiped it; Slice 10.5 content unchanged)
- `datasets/jam-actions-v0-public/LICENSE-DATASET.md` (regenerated by packager — content identical)

**Preserved untouched:**
- `datasets/jam-actions-v0/manifest.json` (source manifest — version stays 0.1.0; the kickoff explicitly forbids bumping it)
- `datasets/jam-actions-v0/splits.json` (byte-identical; 0 diff lines)
- All `datasets/jam-actions-v0/evals/*.json` (untouched)
- `src/dataset/tool-schemas.json` (no new MCP tools added)
- `src/dataset/schema.ts` (no schema widening)
- `datasets/jam-actions-v0/manifest.json.instrument_surfaces.{ai_jam_sessions, vocal_synth_engine}` (both still present per doctrine ratchet #4)

## Hard-gate report (14/14 PASS)

| # | Gate | Status | Evidence |
|---|---|---|---|
| 1 | All 1249 existing tests still pass | PASS | `pnpm test` → 1281 / 1281 (1249 pre-existing + 32 new) |
| 2 | ≥10 new enrichment library tests pass | PASS | `pnpm exec vitest run src/dataset/enrichment.test.ts` → 32 / 32 |
| 3 | Library respects whitelist | PASS | 12 of the 32 tests explicitly assert rejection on `id` / `provenance` / `observation` / `eval_metadata` / `schema_version` / locked-scope-keys |
| 4 | Runner is idempotent | PASS | After apply, `apply-jam-actions-enrichment.ts --check` → `CHECK PASS: 6 overlay entries; 0 records would change.` |
| 5 | Whole-corpus validator green on all 10 gates | PASS | `scripts/validate-jam-actions-corpus.ts` → "CORPUS VALIDATION COMPLETE — ALL GATES PASSED" |
| 6 | E1 gold pass rate remains 1.0 | PASS | Corpus validator output: `E1 gold pass rate : 1.0` |
| 7 | Splits are byte-identical | PASS | `git diff datasets/jam-actions-v0/splits.json` → 0 lines |
| 8 | Provenance + locked-scope + observation + eval_metadata untouched | PASS | Per-record diff scan: 0 forbidden-field diff lines on all 6 records |
| 9 | Source manifest `instrument_surfaces.{ai_jam_sessions, vocal_synth_engine}` BOTH present | PASS | Source manifest untouched — both keys still present (verified) |
| 10 | Package regenerated; 241+ checksums verify | PASS | `verify-public-package-checksums.ts` → "All checksums verify, every file accounted for." (241 / 241) |
| 11 | VERSION + manifest + CITATION.cff = 0.2.0 (three places consistent) | PASS | `VERSION` = `0.2.0`, `manifest.json.version` = `"0.2.0"`, `CITATION.cff` `version: "0.2.0"` |
| 12 | records.jsonl line count = 115; splits totals = 103/12; pianoroll/ = 115 | PASS | `wc -l records.jsonl` = 115; splits.json train=103 + test=12; pianoroll/ = 115 files |
| 13 | KNOWN_LIMITATIONS.md honestly reflects addressed vs open | PASS | §5 bullets annotated `(Addressed in Slice 11; see enrichment-overrides.json)`; §5b documents scope expansion; §6 honest-absence preserved |
| 14 | Cold-reader can tell which records were enriched | PASS | (a) `enrichment-overrides.json` is the audit trail; (b) `KNOWN_LIMITATIONS.md §5b` enumerates the 6 records; (c) `git diff datasets/jam-actions-v0/records/` shows the 6 records and their content changes |

## Reproducibility

```bash
# From a clean checkout of the v0.1.1-hardened state (tag jam-actions-v0-hardened-2026-05-17):

# 1. Apply the enrichment overlay (writes to source records under datasets/jam-actions-v0/records/)
pnpm exec tsx scripts/apply-jam-actions-enrichment.ts

# 2. Confirm idempotency
pnpm exec tsx scripts/apply-jam-actions-enrichment.ts --check

# 3. Regenerate public package
pnpm exec tsx scripts/package-jam-actions-public.ts --today 2026-05-17

# 4. Restore Slice 10.5 hardening docs (packager wiped them)
git checkout HEAD -- \
  datasets/jam-actions-v0-public/ATTRIBUTION.md \
  datasets/jam-actions-v0-public/DATASET_SCHEMA.md
# (Slice 11 updates KNOWN_LIMITATIONS.md in place — don't restore that one)

# 5. Regenerate checksums to cover the restored docs + updated KNOWN_LIMITATIONS.md
pnpm exec tsx scripts/regenerate-public-package-checksums.ts

# 6. Verify
pnpm exec tsx scripts/verify-public-package-checksums.ts
```

The regeneration sequence is the same as Slice 10.5 with the enrichment step inserted up front.

## Doctrine ratchets earned

1. **Enrichment lives in an overlay, never in hand-edits.** The overlay file IS the audit trail; runs become diffable; revisions become editable. Future enrichment slices should follow the same pattern.

2. **Key insertion order is part of the record's identity.** zod's parse re-orders keys to its schema declaration order, which silently breaks "only the enriched fields should diff." The library returns the cloned source object (with merge applied in place), not zod's parseResult.data. This is a load-bearing implementation detail uncovered mid-slice.

3. **The packager is destructive.** `package-jam-actions-public.ts` wipes `datasets/jam-actions-v0-public/` and rebuilds only the files it knows about. Hand-curated docs (ATTRIBUTION / DATASET_SCHEMA / KNOWN_LIMITATIONS) must be restored from git after every regenerate, and checksums regenerated afterward. A future packaging slice could fix this; for now the runner-then-restore-then-regenerate pattern is the doctrine.

4. **Scope expansion is OK if it's documented.** §5 named three records by id but obviously implied the late-Bach class. The slice expanded to enrich the Pathétique prompt + 2 adjacent late-Bach records, documenting the expansion in §5b. Honest scope expansion > pretending the original list was exhaustive.

5. **Honest absence stays honest.** The Schumann m. 45-48 enrichment names its lack of downbeat onsets (corpus property §6) instead of papering over it. The Bach late-record enrichment names what the texture IS (chromatic coda extension) instead of fabricating opening-texture descriptions. If the MIDI doesn't carry the hook, the annotation says so.

## Suggested commit message + tag

```
Slice 11: musically-ground 6 record annotations via durable overlay

- New src/dataset/enrichment.ts (whitelist library, audit trail, 32 unit
  tests including 12 explicit rejection cases for forbidden fields).
- New scripts/apply-jam-actions-enrichment.ts (CLI runner with --dry-run
  and --check; idempotent).
- New datasets/jam-actions-v0/enrichment-overrides.json (durable overlay,
  6 override entries — the audit trail).
- 6 records enriched (Pathétique m25–28 prompt + m29–32 continuation pair,
  Schumann Träumerei m45–48 closing, Bach BWV 846 coda extension
  m45–48 / m49–52 / m53–56 trio).
- Public package v0.1.1 → v0.2.0; KNOWN_LIMITATIONS.md §5 marked as
  addressed; §5b documents scope expansion.
- All 14 hard gates pass; E1 gold pass rate stays at 1.0; splits and
  provenance byte-identical.

Tag: jam-actions-v0-enriched-2026-05-17
```

Suggested tag: `jam-actions-v0-enriched-2026-05-17`
