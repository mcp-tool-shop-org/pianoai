# jam-actions-v0 Slice 5 — Pilot Corpus Expansion

**Date:** 2026-05-16
**Slice:** 5
**Status:** COMPLETE — all 7 deliverables shipped, all hard gates PASS

---

## Summary

Slice 5 expanded the jam-actions-v0 dataset from 3 pilot records to 45 phrase records across all 10 `public_candidate` classical songs. The corpus is structured for E2 continuation eval with 22 prompt/continuation_target pairs plus 1 standalone. All records pass strict schema, E1 trace validation, provenance, pair completeness, and pair-locked splits.

---

## Deliverables

### 1. Schema extensions (`src/dataset/schema.ts`)

Added 5 optional fields to `ScopeSchema` for E2 pair metadata:

```ts
window_role?: 'prompt' | 'continuation_target' | 'standalone'
continuation_target_window?: [number, number]   // required when window_role === 'prompt'
musical_phrase_label?: string                   // e.g., "opening antecedent"
natural_phrase_boundary?: boolean
paired_prompt_record_id?: string               // required when window_role === 'continuation_target'
```

Validation rules enforced via `z.superRefine`:
- `window_role: 'prompt'` → `continuation_target_window` required
- `window_role: 'continuation_target'` → `paired_prompt_record_id` required
- Other values rejected by enum
- Backward compat: all fields optional, Slice 1–4 records pass unchanged

New test file: `src/dataset/schema-window-role.test.ts` (24 tests).

### 2. `scripts/build-jam-actions-corpus.ts`

New bulk builder superseding `build-pilot-records.ts` for corpus-scale builds. Reasons:
- Handles `window_role` pair metadata
- Updates existing records in-place (Option B repurposing)
- Builds across all 10 songs in one pass
- Hard-gates on provenance, schema, trace validator for every record

Design choice: supersede, not extend — the pair logic requires song-level pair specs that the old per-record spec structure can't express cleanly. `build-pilot-records.ts` preserved as Slice 3 provenance anchor.

### 3. Records (`datasets/jam-actions-v0/records/`)

45 records total (within 45–55 target range):
- 22 prompt records
- 22 continuation_target records
- 1 standalone (Für Elise mm. 1–8, existing Slice 1 anchor)

All records:
- Pass strict schema (`allow_placeholders: false`)
- Pass E1 trace validator
- Have real REMI token arrays (non-empty string arrays)
- Have real ABC notation strings (non-empty)
- Have provenance verdict `public_candidate`

### 4. `datasets/jam-actions-v0/manifest.json`

Records current corpus state:
- `record_count: 45`
- `pair_count: 22`
- `standalone_count: 1`
- `pair_completeness: true`
- `songs_count: 10`
- `verdict_summary: { public_candidate: 45 }`
- `e1_gold_pass_rate: 1.0`

### 5. `datasets/jam-actions-v0/splits.json`

Stratified by composer/composition, pair-locked:
- **Test split (held out):** `clair-de-lune` (4 records: 2 pairs)
- **Train split:** all 9 remaining songs (41 records)
- Test pct: ~9% at record level, 10% at song level
- Pair-lock verified: 0 violations

### 6. `scripts/validate-jam-actions-corpus.ts`

Whole-corpus validator with 10 hard gates:
1. Strict schema — all 45 records pass
2. E1 trace validation — all 45 pass; gold pass rate = 1.0, dummy baseline = 0
3. Provenance — all 45 are `public_candidate`; 0 excluded
4. Token completeness — all 45 have real REMI + ABC
5. Pair completeness — 22 prompts each have a paired continuation on disk
6. Orphan check — 0 orphan continuation_target records
7. Manifest count — manifest matches disk (45 = 45)
8. Splits reference — 0 dangling IDs in splits.json
9. Pair-lock — 0 violations
10. Count range — 45 within [45, 55]

Exit 0 on PASS. All gates pass.

### 7. Report

This document.

---

## Record counts by song

| Song | Composer | Pairs | Records | Standalone | Notes |
|------|----------|-------|---------|------------|-------|
| bach-prelude-c-major-bwv846 | Bach | 2 | 4 | — | mm.1–4 repurposed prompt |
| chopin-nocturne-op9-no2 | Chopin | 3 | 6 | — | 3 phrase groups |
| chopin-prelude-e-minor | Chopin | 2 | 4 | — | Chromatic bass pairs |
| clair-de-lune | Debussy | 2 | 4 | — | TEST SPLIT (held out) |
| debussy-arabesque-no1 | Debussy | 2 | 4 | — | Triplet arabesque pairs |
| fur-elise | Beethoven | 1 | 2+1 | 1 | mm.1–8 standalone; mm.9–16 pair |
| mozart-k545-mvt1 | Mozart | 2 | 4 | — | mm.1–4 repurposed prompt |
| pathetique-mvt2 | Beethoven | 2 | 4 | — | Adagio cantabile pairs |
| satie-gymnopedie-no1 | Satie | 3 | 6 | — | 3 phrase groups from m.3 |
| schumann-traumerei | Schumann | 3 | 6 | — | 3 periods (ABA structure) |
| **TOTAL** | | **22** | **45** | **1** | |

---

## Phrase selection rationale

### Window strategy: E2-compatible pairs with natural phrase metadata

Every pair is selected on musical grounds, not mechanical 4-bar chunking:
- **Antecedent/consequent pairs** (Bach, Mozart, Chopin Nocturne, Pathetique, Schumann, Für Elise B-section): classic 4+4 period structure where the prompt ends on a half cadence (dominant) and the continuation resolves to tonic. The E2 eval task — predict continuation given prompt — has a musically motivated answer.
- **Phrase group pairs** (Satie): Gymnopedie starts melody at m.3 (2-bar LH intro), so pairs begin at m.3. 4-bar phrase groups with clear open/closed phrase boundary.
- **Section-contrast pairs** (Clair de Lune mm. 15–18 → 19–22): the famous cantabile theme is the musical center; the continuation reaches the emotional peak. Chosen for expressive arc rather than mechanical periodicity.
- **Development pairs** (Chopin Nocturne mm. 17–20 → 21–24; Chopin Prelude mm. 9–12 → 13–16): developmental phrases that create and release tension. The E2 model must predict harmonic resolution.

### Für Elise: Option B (as recommended)

- Existing mm. 1–8 record: updated to `window_role: 'standalone'`. No MIDI/ABC/REMI rebuild — metadata-only update preserves Slice 1 anchor.
- Bach mm. 1–4, Mozart mm. 1–4: repurposed to `window_role: 'prompt'` with `continuation_target_window: [5, 8]`. No content rebuild.
- New mm. 5–8 continuation records added for Bach and Mozart.
- New mm. 9–16 pair added for Für Elise (B section, relative major — natural contrast section boundary).

Option B rationale: mm. 5–8 of both Bach and Mozart are musically coherent consequents of mm. 1–4. Bach mm. 5–8 extends the harmonic template into the subdominant area (C7→F→Fdim). Mozart mm. 5–8 completes the opening 8-bar period with a full authentic cadence on C. The pairing is musically valid. No structural issues were found that would require Option A or C.

### Satie phrase selection: starts at m.3

The Gymnopedie has a 2-measure LH-only intro (mm. 1–2). Pairing starts at m.3 where the melody enters. This is the musically correct choice — the intro is not a phrase, it's a pickup. All Satie pairs use 4-measure windows starting from m.3.

### Clair de Lune: non-contiguous pairs

Pair 2 uses mm. 15–18 → 19–22 (skipping the intro section mm. 9–14). Rationale: mm. 9–14 are a transitional passage; mm. 15 is where the famous cantabile theme begins. Picking these measures ensures the E2 eval is grounded in musically significant phrases, not transitional material.

### Test split: Clair de Lune (Debussy, 1905)

Chosen for maximum style/era diversity from training songs:
- Training includes: Baroque (Bach, 1722), Classical (Mozart, 1788; Satie, 1888), Romantic (Beethoven, 1799/1810; Chopin, 1832/1839; Schumann, 1838)
- Test: Impressionist/late-Romantic (Debussy, 1905) — distinct harmonic language (unresolved 9ths, parallel motion, whole-tone coloring) that none of the training composers use
- The 9/8 time signature is also distinct (all training songs are 4/4, 3/4, or 3/8)

---

## E1 full-corpus pass rate

- **Gold pass rate: 1.0** (45/45 records, all tool traces valid)
- **Dummy baseline: 0** (kill switch confirmed)
- **Control failure rate: 1.0** (all 8 negative controls correctly rejected)

---

## All existing tests pass

876/876 vitest tests pass (852 pre-Slice-5 + 24 new schema-window-role tests). The one test updated was `tool-use.test.ts` line 628: changed `toBe(3)` to `toBeGreaterThanOrEqual(3)` to accommodate corpus growth from 3 → 45 records. Description also updated to be corpus-size-agnostic. This is the correct update — the original test was written for the 3-record pilot; the intent (records evaluated ≥ N) is preserved.

---

## Hard gates summary

| Gate | Status |
|------|--------|
| Every record validates strict schema | PASS (45/45) |
| Every target trace passes E1 validator | PASS (45/45, gold=1.0) |
| Every record has real REMI + ABC | PASS (45/45) |
| Every record has provenance verdict | PASS (all `public_candidate`) |
| Every prompt has continuation_target on disk | PASS (22/22) |
| No orphan continuation_target records | PASS (0 orphans) |
| Splits are pair-locked | PASS (0 violations) |
| Splits reference real records | PASS (0 dangling IDs) |
| Manifest counts match disk | PASS (45 = 45) |
| No public release; `public_candidate` stays | PASS (never assigned `public`) |

---

## Open questions

1. **E2 eval harness** (Slice 6+): the pairs are now structured and the split is defined. E2 implementation — PPL_note, pitch-class histogram OA, groove-similarity OA, shuffled-bars baseline — is the next eval slice.

2. **Chopin Nocturne phrase structure**: the Nocturne's actual time signature is 12/8 (compound), though the MIDI header reports 4/4. The phrase pairs use 4-bar windows which capture full melodic phrases in either interpretation. No structural issue found, but an E2 researcher should be aware the notated 12/8 creates a different "measure" concept than the MIDI track's 4/4 header.

3. **Clair de Lune 9/8 REMI**: the REMI adapter uses `ticksPerBeat` and `timeSignature` for Bar and Duration tokens. In 9/8 with `tpb=480`, a 9/8 bar = 9 × (480/8) = 540 ticks. The REMI tokens correctly reflect this via the `ticksPerMeasure` calculation. The Duration tokens (in sixteenth-note units) are denominator-aware. No issue, but worth documenting for E2 implementors.

4. **Schumann Traumerei measure count**: the piece has ~65 measures; pair 3 (mm. 17–24) fits within the piece. Verified via MIDI tick analysis.

5. **Satie measure numbering**: Gymnopedie No. 1 in 3/4 at 89 BPM, ~79 measures. Pairs through mm. 23–26 are well within the piece. The 2-measure intro (mm. 1–2) is excluded from all pairs, consistent with the musical structure.

---

## What Slice 6 unlocks

E2 phrase continuation eval implementation. The corpus now has:
- 22 pairs with musically grounded prompt/continuation relationships
- 1 held-out test song (Clair de Lune, 4 records) for E2 evaluation
- `continuation_target_window` metadata on every prompt record for E2 window specification
- All pair-lock and split guarantees in place

The E2 task is: given prompt mm. [start, mid], predict continuation mm. [mid+1, end]. The gold continuation_target records provide the ground truth.

---

## Instrument-surface dependencies (added post-build, 2026-05-16)

The manifest now declares the instrument backends `jam-actions-v0` is grounded against. Two surfaces are recorded:

| Surface | Status | v0 usage |
|---|---|---|
| `ai-jam-sessions` (this repo) | active | primary — drives all 45 v0 records |
| `vocal-synth-engine` (`github:mcp-tool-shop-org/vocal-synth-engine#7269cd5`) | declared dependency surface | sidecar/deferred — no records yet |

VSE is in `package.json` as a GitHub-pinned dependency and ships its own `VocalScore` schema (bpm, timed notes, lyrics, phonemes, dynamics, breathiness, timbre morphing, vibrato, portamento, velocity, pan) plus its own MCP tools (`render_score`, `phonemize_text`, `list_presets`, `validate_score`, `inspect_preset`). The dataset's "instrument-actions" thesis applies to vocal performance as much as piano performance.

**Why declare it now (Slice 5) without using it:** so the dataset spine doesn't bake in piano-only assumptions. The record schema already uses `instrument: z.string().min(1)` (Slice 3 design), which accepts `"vocal"` without modification. The manifest's `instrument_surfaces` block makes the backend dependency explicit and discoverable; future record types (`vocal_phrase`, `sing_along_trace`, `phoneme_alignment`, `vocal_render_score`) are namespaced so when they land, they slot in.

**What's NOT in v0:** vocal record generation, VSE MCP-trace recording, phoneme alignment. These are post-E1/E2-stable work, likely Slice 8+.

**Doctrine note:** when VSE-driven traces enter the corpus, they validate against VSE's own tool schemas via the same harness pattern as Slice 4 (E1) — no special-casing. The eval harness's `tool-schemas.json` authority generalizes to any MCP backend.
