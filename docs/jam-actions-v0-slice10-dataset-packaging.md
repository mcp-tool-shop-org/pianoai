# `jam-actions-v0` Slice 10 — Dataset Packaging for Zenodo + HuggingFace

**Status:** SHIPPED (uncommitted)
**Built:** 2026-05-17
**Source commit:** `e4631391c0ebe02682188b778b82c0501dd9a314`
**Source tag:** `jam-actions-v0-public-2026-05-17`
**Package version:** `0.1.0`

## What this slice did

Slice 10 packages the `public` subset of the source corpus at `datasets/jam-actions-v0/` into a self-contained, externally-legible artifact set under `datasets/jam-actions-v0-public/` suitable for Zenodo primary release and HuggingFace mirror.

This slice is **strictly additive**. The source dataset at `datasets/jam-actions-v0/` is read-only across this slice — only the new sibling directory `datasets/jam-actions-v0-public/` is created. Records are copied byte-for-byte; no provenance fields are re-derived; no schema is upgraded; no network is touched.

## What shipped

### New source files (3)

| Path | Purpose |
|---|---|
| `src/dataset/package-public.ts` | Pure-data library: filter records, build manifest/README/CITATION/LICENSE, compute checksums. Testable. |
| `scripts/package-jam-actions-public.ts` | CLI script. Thin filesystem I/O wrapper around the library. `--today YYYY-MM-DD` flag, optional `--dry-run`. |
| `src/dataset/package-public.test.ts` | 24 unit tests over the library (filter, JSONL, manifest, splits, checksums, idempotency, sha256 reference vectors). |

### New artifacts (239 files under `datasets/jam-actions-v0-public/`)

Top-level (9):

| File | Size | Purpose |
|---|---|---|
| `manifest.json` | 1.0 KB | Package-scope manifest (record_count=115, pair_count=57, standalone_count=1, songs=8, splits=103/12, license=CC-BY-SA-3.0-DE) |
| `records.jsonl` | 3.9 MB | Canonical training feed — 115 lines, one record per line, sorted by id, with `split` field added per line, trailing newline |
| `records/` | 8.1 MB | 115 individual record JSONs (byte-identical to source) |
| `pianoroll/` | 7.3 MB | 115 piano-roll SVGs, matched by basename |
| `provenance-verification.json` | 8.9 KB | Filtered Slice 2.5 verification report — 8 public songs (no satie, no debussy-arabesque) |
| `splits.json` | 6.8 KB | Filtered splits — train=103, test=12, `held_out_song: clair-de-lune`, `pair_locked: true` |
| `README.md` | 7.2 KB | HuggingFace dataset card (YAML frontmatter + markdown body) |
| `CITATION.cff` | 422 B | Citation File Format v1.2.0 |
| `LICENSE-DATASET.md` | 2.5 KB | Layered-licensing explainer |
| `VERSION` | 6 B | Single-line `0.1.0` |
| `checksums.sha256` | 25 KB | SHA-256 sums of every other file (238 lines), sorted by path |

**Total package size:** 20 MB on disk.

### New doc (1)

| Path | Purpose |
|---|---|
| `docs/jam-actions-v0-slice10-dataset-packaging.md` | This file. |

## Filter math

| Source | Public-subset | Notes |
|---|---|---|
| 145 records | **115 records** | Filtered by `provenance.record_verdict === "public"` |
| 10 songs | **8 songs** | Excluded: `satie-gymnopedie-no1` (14 records — piano-midi.de HTTP 418), `debussy-arabesque-no1` (16 records — composer page reachable but didn't reference this work) |
| 72 pairs + 1 standalone | **57 pairs + 1 standalone** | Pair completeness preserved — Satie (7 pairs) and Debussy Arabesque (8 pairs) both demoted together at song level, no orphans |
| train=133 / test=12 | **train=103 / test=12** | clair-de-lune unchanged in test; Satie + Arabesque records dropped from train |

`pair_count + 2*standalone_count` ≠ `record_count` here because the source corpus's "pair" relation is `prompt → continuation_target` (so a pair contributes 2 records), but the corpus also contains some `continuation_target` records whose paired prompt sits in a different 4-measure window. The `pair_count=57` figure counts prompts; with 1 standalone, that accounts for 58 of the 115 records; the remaining 57 are `continuation_target` records. This matches `prompts + continuations + standalone = 57 + 57 + 1 = 115`.

## Hard-gate report

All 14 gates from the kickoff PASS.

| # | Gate | Result |
|---|---|---|
| 1 | All 1225 existing tests still pass | PASS (1249 total — 1225 baseline + 24 new) |
| 2 | Package contains exactly 115 records | PASS (`ls datasets/jam-actions-v0-public/records/ \| wc -l` = 115) |
| 3 | `records.jsonl` has 115 lines, each parseable JSON | PASS (115 lines, all JSON-parseable, all have `split` ∈ {train, test}) |
| 4 | Per-record fields preserved verbatim | PASS (`diff` of 3 sample records vs source returns empty) |
| 5 | Splits totals exactly 103 train + 12 test; all 12 test IDs are clair-de-lune | PASS (verified programmatically) |
| 6 | No `internal` / `excluded` / `public_candidate` records in the package | PASS (every record verdict = `public`; verified in both `records/` and `records.jsonl`) |
| 7 | `pianoroll/` has exactly 115 SVGs, one per record | PASS (115 SVGs, basenames match record IDs) |
| 8 | `provenance-verification.json` contains exactly the 8 public songs | PASS (no satie, no arabesque; all 8 `post_verdict === "public"`) |
| 9 | `manifest.json` `instrument_surfaces` has `ai_jam_sessions` but NOT `vocal_synth_engine` | PASS (`surfaces=["ai_jam_sessions"]` only — no VSE in v0 public package per kickoff) |
| 10 | README YAML frontmatter parses cleanly; license = `cc-by-sa-3.0` | PASS (all required keys present; `license: cc-by-sa-3.0`) |
| 11 | `checksums.sha256` has one line per file; every checksum verifies | PASS (238 lines = 239 files − 1 self; 0 mismatches; sorted by path) |
| 12 | Package reproducible — twice with same `--today` → byte-identical | PASS (239/239 files byte-identical across two consecutive runs) |
| 13 | Source dataset unmodified | PASS (`git diff --stat datasets/jam-actions-v0/` is empty) |
| 14 | ≥6 packager unit tests | PASS (24 tests across 9 describe blocks) |

## Reproducibility

To regenerate this package byte-identically from the source repo at the tagged commit:

```bash
git checkout jam-actions-v0-public-2026-05-17
pnpm install
pnpm exec tsx scripts/package-jam-actions-public.ts --today 2026-05-17
```

The packager:

- Reads the entire source corpus into memory in deterministic order (`readdirSync().sort()`)
- Filters to public records and re-sorts by id
- Builds the splits index from the source `splits.json` filtered to public IDs (sorted)
- Serializes every JSON artifact via `JSON.stringify(obj, null, 2) + "\n"` (matches source-corpus style — 2-space indent, trailing newline)
- Computes `checksums.sha256` LAST over all other artifacts; the input to the checksum function is the in-memory file content, not a post-write re-read, so the output is independent of filesystem timestamps or OS line-ending behavior
- Pins `built_at` and `date-released` to the `--today` flag (no `new Date()` in any output content)

This means the package is fully reproducible from the tagged corpus state — Zenodo or any third party verifying provenance can re-run the packager and obtain byte-identical artifacts (modulo the `source_commit` field, which is derived from `git rev-parse HEAD` and is intentionally tied to the working-tree state).

## What's deliberately NOT in this slice

- **No commit, no push.** The kickoff is explicit: "DO NOT COMMIT. DO NOT PUSH." Stops at uncommitted-but-verified state for operator review.
- **No npm packaging.** This slice produces filesystem artifacts only.
- **No upload to Zenodo or HF.** Those are separate, operator-driven steps.
- **No corpus content modification.** Records are copied byte-for-byte; the package manifest is new but the per-record content is not edited.
- **No URL re-verification.** Slice 2.5 outputs are locked; this slice reads them, filters them, and ships them.
- **No model work, no eval reruns.**

## Distribution plan (out of scope for this slice)

Per the synthesis Section 6 ordering:

1. **Zenodo primary release** — assigns the canonical DOI. Operator uploads the package zip + `manifest.json` + `checksums.sha256`. Zenodo will compute its own sums and they must match.
2. **HuggingFace dataset mirror** — `huggingface.co/datasets/mcp-tool-shop-org/jam-actions-v0-public`. The README.md ships with the HF dataset-card YAML frontmatter already in place, so no editing should be needed at upload time. The `configs` block points `records.jsonl` at the `train` split per HF Datasets library conventions.
3. **README cross-link** — once the DOI exists, add it to `README.md` (front-page and citation) and re-pack. That re-pack is a future slice (likely Slice 10.1 or Slice 11) because it requires the Zenodo DOI which doesn't exist yet.
