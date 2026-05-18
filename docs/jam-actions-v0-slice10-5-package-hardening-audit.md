# `jam-actions-v0` Slice 10.5 — Public Package Hardening Audit

**Date:** 2026-05-17
**Status:** SHIPPED (uncommitted)
**Package version:** 0.1.0 → **0.1.1** (docs-hardening, no record content changes)
**Source commit (records):** `e4631391c0ebe02682188b778b82c0501dd9a314` (Slice 10 tag, preserved)
**Source commit at HEAD:** `f0560e9` pre-slice; new docs land on top of this.

---

## What Slice 10.5 did

The Slice 10 packager produced a valid public artifact set (238 files, all checksums verified, all 14 packager hard gates green). The operator's posture on accepting it: *"treat the package/tag as a checkpoint, not a release candidate."* Slice 10.5's job is to make the package publication-grade — understandable, honest, defensible — before any Zenodo/HF upload (Slice 13).

This slice audited the package along six dimensions, wrote three new hardening docs into the package, hardened the existing README, and regenerated the checksum manifest. **No record content was modified.** **No source dataset under `datasets/jam-actions-v0/` was touched.** **No tests were changed.** **1249 → 1249 (no test count change — this is a docs slice).**

---

## Per-dimension audit findings (1–6)

### Dimension 1 — Dataset card quality

**Finding:** The Slice 10 README was structurally complete (HF YAML frontmatter, source data section, licensing, limitations) but had three soft spots:

- The headline framing **described the dataset as a music tool-use corpus** (true) but did not explicitly **position it as "instrument-action traces for an MCP-driven music instrument"** (the operator-locked thesis). A casual reader could mistake it for a generic MIDI dataset.
- **No explicit "What This Dataset Is Not" section** — negative-space framing was scattered through "Limitations" rather than highlighted up front.
- **VSE was mentioned** ("No vocal records.") but **not as a declared dependency surface**. The operator's doctrine ratchet #4 (manifest guard) flagged that the source manifest carries `vocal_synth_engine` as a `declared_dependency_surface`; the public manifest does NOT, but the README did not explain the distinction.

**Fix:** README rewritten with: (a) explicit "instrument-action traces" thesis in the first sentence; (b) a dedicated "What This Dataset Is NOT" section with the five negative-space items the operator locked (not music-generation, not audio-conditioned, not multi-instrument, not vocal/VSE-included, not release-candidate); (c) clear VSE-source-vs-public-package distinction (the source manifest carries VSE as declared dependency for future v0.x record types; the public-subset manifest intentionally omits VSE because no vocal records ship in v0).

### Dimension 2 — Per-record usefulness

**Sampled records (≥6 spanning songs + window_role values):**

| Record | Song | window_role | Verdict |
|---|---|---|---|
| `fur-elise-m001-008` | Beethoven | standalone | **Rich.** Real `pp`-range velocities (33-45), full E-D♯ neighbor analysis, half-cadence to E, restatement at m.5, 1 teaching_note with technique. Synthesis anchor — best-of-corpus reference shape. |
| `bach-prelude-c-major-bwv846-m001-004` | Bach | prompt | **Rich.** 4 key_moments naming specific harmonies (C / Am / Dm7 / G), 2 teaching_notes including m.3 D-minor7 chromatic shift (F♯→F natural). E2-paired with m005-008. |
| `bach-prelude-c-major-bwv846-m005-008` | Bach | continuation_target | **Rich.** Names C / C7 / F / Fdim subdominant area; teaching_note about Bb being the first flat pitch in the piece. Paired prompt linked correctly. |
| `mozart-k545-mvt1-m001-004` | Mozart | prompt | **Rich.** Identifies sonata-form first theme, Alberti bass C-G-E-G-C-G-E-G pattern, half-cadence to G; 3 teaching_goals connect to Classical-era performance practice. |
| `chopin-nocturne-op9-no2-m001-004` | Chopin | prompt | **Rich.** "Cantabile RH touch", "LH-RH independence", "imagine the melody as a human voice"; concrete `m1` cantabile note + `m4` half cadence on Bb. |
| `clair-de-lune-m001-004` | Debussy | prompt (TEST) | **Rich.** "9/8 triplet pulse must feel like three big beats, not nine", "ppp — barely touching the keys", half-pedal technique callout. |
| `pathetique-mvt2-m029-032` | Beethoven | continuation_target | **Sparser.** Generic key_moments ("episode continues", "return is imminent"); 1 teaching_note. Anacrusis record — `rhythm_onset` E3 question correctly returns `not_computable` for these. |
| `schumann-traumerei-m045-048` | Schumann | continuation_target | **Sparser.** 3 short key_moments ("final descent", "almost there", "warmth and stillness"); 2 short style_tips; 1 teaching_note. Closing material is genuinely "fade-and-resolve" so sparseness is partly faithful, but still thinner than opening records. |
| `bach-prelude-c-major-bwv846-m045-048` | Bach | continuation_target | **Sparser.** Single teaching_note ("Back to the familiar texture — play it with fresh ears, not like a routine"). Late-prelude records suffer from Bach's deliberate identical-arpeggiation pattern (it's what makes Bach E2 score 1.0 on rhythm/groove vs shuffled — a real corpus property), but the annotation could still describe long-form architecture. |

**Finding:** Annotation density is **bimodal**: opening / cadential / texturally-special phrases get rich annotations (Bach mm. 1-4, Mozart K545 mm. 1-4, Chopin opening, Clair-de-lune opening); middle-of-piece / episode / texture-repetition phrases get sparser annotations (Pathétique mm. 29-32, Schumann mm. 45-48, late-Bach mm. 45-48 / 53-56 etc.). Tool-use target traces themselves are uniformly well-formed across all records (consistent 5-6 turn shape: view_piano_roll → tool result → analytical assistant turn → play_song with mode:"loop" → tool result → phrase summary assistant turn). The trace shape passes E1 at 100% on the full corpus. The variance is in `annotation_target` content, not in `target_trace` structure.

**Fix:** Documented the specific record IDs in [`KNOWN_LIMITATIONS.md`](../datasets/jam-actions-v0-public/KNOWN_LIMITATIONS.md) §5 and listed them as Slice 11 enrichment targets. Per-record content stays locked across this slice (10.5 is docs-only).

### Dimension 3 — Annotation depth

**Finding:** Annotation depth is the single biggest content gap for a future fine-tuning experiment to land cleanly. Specific records identified for Slice 11 enrichment:

- **Pathétique mvt 2 anacrusis records:** `pathetique-mvt2:m029-032` and `pathetique-mvt2:m057-060` — could name the specific harmonic-progression material that distinguishes "episode continues" from a generic transition.
- **Schumann Träumerei closing run:** `schumann-traumerei:m045-048` — the final F-major resolution could be analyzed as a deliberate plagal-style cadence rather than "warmth and stillness".
- **Late-Bach Prelude records (mm. 33-36 onwards):** Bach's deliberate identical-arpeggiation pattern means rhythm/groove annotations are correctly thin, but harmonic-architecture annotations (dominant pedal at m.33, return to tonic figuration at m.45) could be more specific.

**Fix:** Documented in `KNOWN_LIMITATIONS.md` §5 (Annotation depth varies across records — with concrete record IDs). Slice 11 (annotation enrichment) is the right slice to address this; Slice 10.5 captures the gap honestly rather than backfilling. The dataset card now explicitly warns consumers that annotation density varies.

### Dimension 4 — License / attribution polish

**Finding:** The Slice 10 LICENSE-DATASET.md correctly identified the layered license but had three soft spots:

- **DE jurisdiction nuance was mentioned** but not fully explained (governing law vs international 3.0).
- **Krueger attribution** was visible at the package level (LICENSE-DATASET.md), at the per-record level (each `provenance.arrangement_creator` field), and via `provenance-verification.json`, but there was **no single doc** consolidating the three-layer attribution into copy-pasteable strings.
- **Downstream redistribution obligations** were listed but not actionable as a checklist.

**Fix:** New [`ATTRIBUTION.md`](../datasets/jam-actions-v0-public/ATTRIBUTION.md) consolidates: the three layers with per-composer + per-song facts; per-song evidence URL table (matches `provenance-verification.json`); explicit DE jurisdiction discussion (substantive obligations equivalent to international 3.0, governing law is German); copy-pasteable BibTeX + plain-text + in-figure-caption + one-liner credit. The redistribution obligations are restated as a 5-step actionable list (attribute dataset, attribute arrangements, share-alike compatible license, indicate changes, no endorsement implication). LICENSE-DATASET.md itself is unchanged byte-for-byte (the file was already correct; the missing piece was a consolidated attribution doc).

### Dimension 5 — Schema / docs

**Finding:** The Slice 10 README pointed at `src/dataset/schema.ts` for the full schema but did not document the schema in-package. A cold reader could not understand `target_trace`, `tokens_remi`, `tokens_abc`, `midi_sidecar`, or `eval_metadata` without going back to the source repo.

**Fix:** New [`DATASET_SCHEMA.md`](../datasets/jam-actions-v0-public/DATASET_SCHEMA.md) walks every field in the record schema, in the order they appear in JSON, with type + meaning + real-record example value for each. Specifically:

- `provenance` block: all 16 fields documented with types + example values; verdict enum semantics explained; verifier string format explained.
- `scope` block: all 11 fields including the Slice 5 window-role machinery (`window_role`, `continuation_target_window`, `paired_prompt_record_id`); E2 pairing rules stated.
- `observation.midi_sidecar`: per-`TimedEvent` field table; `hand` heuristic explained; velocity-as-real-expressive-intent example (Für Elise's 33-45 RH velocities).
- `observation.tokens_remi`: REMI tokenization referenced (Huang & Yang 2020); concrete token example shown.
- `observation.tokens_abc`: ABC notation context (Yuan / Qu lineage); RH-monophonic-only caveat stated.
- `annotation_target`: all 6 fields with real example from Bach mm. 1-4; explicit density-varies note.
- `target_trace`: turn-shape semantics, MCP-surface-validation rule, real-surface argument names locked from Slice 1, Option-A discipline.
- `eval_metadata`: split + eligibility semantics; the three E2 eligibility cases (prompt / continuation_target / standalone).

### Dimension 6 — Eval disclosure

**Finding:** The Slice 10 README mentioned no eval baselines at all. Combined with the manifest's `record_verdict: "public"` framing, a casual reader could reasonably infer "this is a ready-to-train dataset." That overstates the v0 status.

**Fix:** README now has a dedicated **"Eval Baselines"** section that:

- Shows the **qwen2.5:7b** numbers verbatim from `evals/llm-in-the-loop-qwen2.5-7b-hardened.json`:
  - E1 tool-use: **75% (3/4 records) — PASS** (≥70% threshold).
  - E2 phrase continuation: **0/2 pairs majority-pass — FAIL**. Pair 1 grooveOA mean 0.81 (2/3 runs pass); pair 2 parses only 1/3 runs but at grooveOA 0.98. FM-5 (music-quality consistency on harder material) is the surfaced gap.
  - E3 annotation grounding: **margin vs text-only = −0.125 — FAIL** (negative margin on the hardened questions). E3 hardening removed structural / prior-leak vectors that inflated earlier scores; the remaining gap is a real fine-tuning target.
- States the local-first eval doctrine explicitly (paid APIs are optional; not part of this release).
- States the fine-tuning deferral honestly: Slice 9c Phase 1 shipped 20 SFT examples + LoRA scaffold; Phase 2 hit memory pressure on the 5080-laptop substrate and aborted before any adapter was produced. The dataset is fine-tune-able (paired records, clean tokenizations, held-out test discipline); it is not fine-tuned.

`KNOWN_LIMITATIONS.md` §9 expands the discussion with the read-this-carefully framing: "qwen2.5:7b is the BEST local 7-13B baseline. The E3 margin going negative does not mean the dataset is broken; it means that for a model at this capability level, the text-only signal in `annotation_target` prose carries more answer than the MIDI evidence does."

---

## File inventory

### Modified files (5)

| Path | Change |
|---|---|
| `datasets/jam-actions-v0-public/README.md` | Hardened with explicit thesis framing, "What This Dataset Is NOT" section, doc cross-references, full eval baselines disclosure. YAML frontmatter unchanged. |
| `datasets/jam-actions-v0-public/manifest.json` | Version `0.1.0` → `0.1.1`; added `slice_hardening_audit` reference; added `hardening_note` explaining what 0.1.1 changes. `source_commit` preserved as the Slice 10 commit (the records came from that commit). `instrument_surfaces.ai_jam_sessions` preserved; `vocal_synth_engine` absent (as designed). |
| `datasets/jam-actions-v0-public/CITATION.cff` | Version field bumped to `0.1.1`. |
| `datasets/jam-actions-v0-public/VERSION` | `0.1.0` → `0.1.1`. |
| `datasets/jam-actions-v0-public/checksums.sha256` | Regenerated. 238 lines (Slice 10) + 3 new docs = **241 lines**. Every hash verified against on-disk content. |

### New files (3 docs in package + 1 slice report + 2 helper scripts)

| Path | Purpose |
|---|---|
| `datasets/jam-actions-v0-public/DATASET_SCHEMA.md` | Full per-field documentation (Dimension 5 fix). |
| `datasets/jam-actions-v0-public/KNOWN_LIMITATIONS.md` | Candid structured-honesty doc (Dimensions 1, 2, 3, 6 fix). |
| `datasets/jam-actions-v0-public/ATTRIBUTION.md` | Three-layer attribution + copy-pasteable cites (Dimension 4 fix). |
| `docs/jam-actions-v0-slice10-5-package-hardening-audit.md` | This report. |
| `scripts/regenerate-public-package-checksums.ts` | Reuses `buildChecksumsManifest()` from `src/dataset/package-public.ts`; walks the package dir, hashes every non-checksum file, sorted by path, forward slashes, trailing newline. |
| `scripts/verify-public-package-checksums.ts` | Walks the package, recomputes every SHA-256, asserts every line in checksums.sha256 matches and every on-disk file appears exactly once. |

### Unchanged (deliberately — Lock D)

- All 115 record JSONs under `records/` — byte-identical
- `records.jsonl` — byte-identical
- All 115 SVGs under `pianoroll/` — byte-identical
- `splits.json` — byte-identical
- `provenance-verification.json` — byte-identical
- `LICENSE-DATASET.md` — byte-identical (already correct; needed an attribution sibling, not edits)
- All files under `datasets/jam-actions-v0/` (source corpus) — byte-identical
- `src/dataset/schema.ts` and all `src/dataset/*.ts` — byte-identical
- All 1249 tests — byte-identical (test count unchanged)

---

## Cold-reader acceptance checklist

A reader who has never seen this dataset, given only the package and its docs, can answer each of the seven acceptance questions from a single doc + at most one cross-reference:

| Question | Where they look | Cross-ref needed? |
|---|---|---|
| 1. What is this dataset for? | README "Dataset Summary" | None |
| 2. What model behavior does it train? | README "Dataset Summary" + DATASET_SCHEMA.md `target_trace` block | DATASET_SCHEMA.md |
| 3. What is the source material? | ATTRIBUTION.md (three layers + per-song evidence URLs) | provenance-verification.json (optional) |
| 4. What can be publicly redistributed? | LICENSE-DATASET.md (layered explainer) | ATTRIBUTION.md (concrete attribution strings) |
| 5. What are the current eval results? | README "Eval Baselines" | KNOWN_LIMITATIONS.md §9 (full disclosure) |
| 6. What are the known limitations? | KNOWN_LIMITATIONS.md (numbered, candid) | None |
| 7. What should not be claimed? | README "What This Dataset Is NOT" | KNOWN_LIMITATIONS.md §13 |

All seven questions answerable from a single doc + at most one cross-reference. Acceptance test PASSES.

---

## Hard-gate report (11 of 11 PASS)

| # | Gate | Status |
|---|---|---|
| 1 | All 1249 existing tests still pass | **PASS** (1249/1249 green in 7.10s) |
| 2 | The 4 hardening docs exist with the right content shape | **PASS** (DATASET_SCHEMA.md, KNOWN_LIMITATIONS.md, ATTRIBUTION.md created; README.md hardened) |
| 3 | (If examples/ shipped) 3 example files exist with valid record JSON | **N/A — examples/ deliberately not shipped this slice** (the README's `## Quickstart` plus DATASET_SCHEMA.md's real-record example fragments cover the cold-reader pedagogy without duplicating 3 record JSONs into the package, which would have added ~3 × 1000-line files to the checksum manifest. If a future slice decides the duplication is worthwhile, the optional path is reserved.) |
| 4 | `checksums.sha256` regenerated; every listed file verifies; total line count = 238 + new docs | **PASS** (241 = 238 + 3; verification script confirms every hash matches on-disk content + no missing/extra entries) |
| 5 | Source dataset `datasets/jam-actions-v0/` byte-identical before/after | **PASS** (`git diff --stat datasets/jam-actions-v0/` returns empty) |
| 6 | `manifest.json.instrument_surfaces.ai_jam_sessions` still present; `vocal_synth_engine` still absent | **PASS** (verified programmatically — keys = `['ai_jam_sessions']`) |
| 7 | `splits.json` byte-identical (no record movement) | **PASS** (`git diff splits.json` returns empty) |
| 8 | `records.jsonl` byte-identical (no record content changes) | **PASS** (`git diff records.jsonl` returns empty) |
| 9 | 115 record JSONs under `records/` byte-identical (no provenance changes) | **PASS** (`git diff records/` returns empty) |
| 10 | 115 SVGs under `pianoroll/` byte-identical | **PASS** (`git diff pianoroll/` returns empty) |
| 11 | Cold-reader acceptance test | **PASS** (table above) |

---

## Before / after summary (per package doc)

| Doc | Before | After |
|---|---|---|
| README.md | 1 file, 120 lines. Adequate but: no explicit "instrument-action traces" framing, no "What This Dataset Is NOT" section, no Eval Baselines section, VSE mentioned without source-vs-public-manifest distinction. Cross-references to siblings absent. | Same file, structurally re-flowed. New Quickstart (Python streaming snippet). New "What This Dataset Is NOT" with 5 negative-space items. New "Eval Baselines" with full qwen2.5:7b PASS/FAIL table. New doc-map table at the bottom for navigation. YAML frontmatter byte-identical. Version bumped 0.1.0 → 0.1.1 in the body. |
| DATASET_SCHEMA.md | Did not exist. | New file. Walks every field in the record schema: id, schema_version, provenance (16 fields), scope (11 fields), observation.midi_sidecar (15 fields per TimedEvent), tokens_remi, tokens_abc, piano_roll_svg, annotation_target (6 fields), target_trace (turn shapes for user/assistant/tool, MCP-surface rule), eval_metadata (6 fields). Real-record example values throughout. Points at the canonical Zod schema in source. |
| KNOWN_LIMITATIONS.md | Did not exist. Limitations were scattered through README. | New file. 13 numbered sections covering: single-source provenance, small corpus, no genre diversity, no vocal records, annotation depth varies (with specific record IDs), 3 `rhythm_onset: not_computable` records (named), local-only eval baselines, no fine-tuned model ships, **E2/E3 fail thresholds (full disclosure)**, DE jurisdiction caveat, checkpoint-not-release-candidate, dataset card YAML splits caveat, what-this-is-not summary. Section-numbered for cross-reference from README + ATTRIBUTION.md. |
| ATTRIBUTION.md | Did not exist. Attribution was at the per-record level (each record's `provenance.arrangement_creator`) and the per-package level (LICENSE-DATASET.md), but no doc consolidated them. | New file. Three layers (compositions PD; arrangements CC-BY-SA-3.0-DE; records CC-BY-SA-3.0-DE share-alike). Per-composer death-year table. Per-song evidence URL table (matches provenance-verification.json). DE jurisdiction discussion. 5-step redistribution checklist. Copy-pasteable BibTeX + plain-text + in-figure-caption + one-liner credit. Honest note on the two demoted songs. |
| LICENSE-DATASET.md | 41 lines. Layered explainer, DE jurisdiction noted, demoted songs noted. | **Byte-identical.** The file was already correct; what was missing was a consolidated attribution sibling, not edits here. |
| CITATION.cff | Version 0.1.0. | Version 0.1.1. |
| manifest.json | Version 0.1.0. | Version 0.1.1; added `slice_hardening_audit` field referencing this report; added `hardening_note` explaining what 0.1.1 changes; `source_commit` preserved as `e4631391...` (records' origin); `instrument_surfaces.ai_jam_sessions` preserved (single key); `verdict_summary.public = 115` preserved; `splits.train = 103`, `splits.test = 12` preserved. |
| VERSION | `0.1.0` | `0.1.1` |
| checksums.sha256 | 238 lines. | 241 lines (= 238 + 3 new docs). Every hash regenerated; every file verified. |

---

## On the optional `examples/` directory

The kickoff allowed an optional `examples/` directory with 3 representative records. Decision: **not shipped this slice**. Rationale:

- The README "Quickstart" section already shows how to consume `records.jsonl` with a 4-line Python snippet.
- DATASET_SCHEMA.md embeds real-record example values for every field (Bach mm. 1-4 for `annotation_target`; Für Elise for `target_trace`; etc.).
- Shipping `examples/` would duplicate 3 × ~1000-line records into the package, adding 3 entries to `checksums.sha256` for zero new pedagogical value (a cold reader already has the 115 records under `records/`).
- If a future slice decides three "starter" records would help, the optional path is reserved (the kickoff said "if useful for cold-reader pedagogy"). The cold-reader acceptance test passes without them.

---

## Suggested commit message + tag

Commit message:

```
Slice 10.5: harden public package — docs + checksum regen, no record changes

Slice 10 packaged the public subset at version 0.1.0 (238 verified files,
115 records, 8 songs). The operator's posture: "treat the tag as a
checkpoint, not a release candidate." This slice elevates the package
from valid to publication-grade.

Six-dimension audit applied. Three new hardening docs land in the
package; the existing README is rewritten with explicit thesis framing,
negative-space "What This Dataset Is NOT" section, and honest E1/E2/E3
baselines for qwen2.5:7b (the realistic local capability target).

No record content changes (all 115 record JSONs byte-identical). No
splits changes (clair-de-lune still the locked test holdout). No source
dataset changes. No test count change (1249/1249 green). Source commit
preserved as the Slice 10 commit (the records came from there; only
docs change in 0.1.1).

Changes:
  - README.md hardened (thesis framing, "What This Dataset Is NOT",
    Eval Baselines table with honest PASS/FAIL, doc-map table)
  - DATASET_SCHEMA.md added (per-field walkthrough with real example
    values from records)
  - KNOWN_LIMITATIONS.md added (13 numbered candid sections; specific
    record IDs called out for annotation depth + anacrusis records)
  - ATTRIBUTION.md added (three-layer cites; per-song evidence URLs;
    DE jurisdiction discussion; copy-pasteable BibTeX/plain/in-figure)
  - manifest.json: version 0.1.0 → 0.1.1; slice_hardening_audit field;
    hardening_note field; source_commit preserved; instrument_surfaces
    unchanged
  - CITATION.cff: version 0.1.0 → 0.1.1
  - VERSION: 0.1.0 → 0.1.1
  - checksums.sha256: regenerated. 238 lines → 241 lines (3 new docs).
    Every hash verified.
  - scripts/regenerate-public-package-checksums.ts: reuses
    buildChecksumsManifest from src/dataset/package-public.ts.
  - scripts/verify-public-package-checksums.ts: walks the package +
    asserts every file appears exactly once + every hash matches.
  - docs/jam-actions-v0-slice10-5-package-hardening-audit.md (this
    report).

Verification: 11 of 11 hard gates pass. Cold-reader acceptance test
passes — each of the 7 acceptance questions answerable from one doc +
at most one cross-reference.
```

Tag: **`jam-actions-v0-hardened-2026-05-17`**

(The Slice 10 tag `jam-actions-v0-public-2026-05-17` is preserved as historical state — the records' origin. The new tag marks the hardened-docs state. Both tags point at different commits but the same record content.)
