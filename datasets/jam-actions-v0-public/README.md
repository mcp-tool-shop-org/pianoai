---
license: cc-by-sa-3.0
language:
  - en
language_creators:
  - expert-generated
  - machine-generated
annotations_creators:
  - expert-generated
  - machine-generated
multilinguality:
  - monolingual
source_datasets:
  - original
pretty_name: "AI Jam Sessions — Tool-Use Traces v0 (Public Subset)"
pretty_description: "Public subset of jam-actions-v0: 115 records across 8 classical-piano arrangements, pairing 4-measure phrase windows with annotated teaching targets and multi-turn MCP tool-use traces. Designed for grounded tool-use evaluation over symbolic music; released under CC-BY-SA-3.0-DE."
size_categories:
  - n<1K
task_categories:
  - text-generation
  - other
tags:
  - music
  - midi
  - mcp
  - tool-use
  - symbolic-music
  - piano
  - classical
configs:
  - config_name: default
    data_files:
      - split: train
        path: records.jsonl
---
# Dataset Card for jam-actions-v0 (public subset)

**Version:** 0.5.0   **Built:** 2026-07-11   **Source tag:** `jam-actions-v0-0.5.0-cut-2026-07-11` (record-content correction release — Bach BWV 846 errata 001 + 002; see `RELEASE_NOTES.md` for the full entry and `evals/v0.5.0-release-gate-assessment.json` + `evals/v0.5.0-execution-verification.json` for the gate verdicts at this state)

**DOI:** [`10.5281/zenodo.20279918`](https://doi.org/10.5281/zenodo.20279918) — the **concept DOI**, which always resolves to the latest published version on Zenodo. This is the canonical citation handle. The prior release, v0.4.3, has version DOI [`10.5281/zenodo.20279919`](https://doi.org/10.5281/zenodo.20279919) (published 2026-05-19); v0.5.0's version DOI is minted at its Zenodo publication and backfilled here afterward.

## Dataset Summary

`jam-actions-v0` is a corpus of multi-turn MCP (Model Context Protocol) tool-use traces grounded in real classical-piano MIDI. Each record pairs a short phrase window (typically 4 measures) with an annotated teaching target and a target trace — a turn-by-turn session in which an assistant uses the `ai-jam-sessions` MCP tools to read, analyze, and discuss the phrase. The dataset teaches LLMs to do **grounded tool-use over symbolic music**, not just text generation.

This is the **public subset**: 115 records across 8 compositions, all under CC-BY-SA-3.0 (DE jurisdiction). Two songs from the full source corpus (Satie Gymnopédie No. 1; Debussy Arabesque No. 1) are NOT included here — their provenance against piano-midi.de could not be verified during Slice 2.5 URL verification.

## Dataset Structure

Top-level files:

- `records.jsonl` — one JSON object per line; the canonical training feed. Each line is a complete record with an additional `split` field (`"train"` or `"test"`) so consumers can use the file without consulting `splits.json`.
- `records/` — the same records as individual JSON files (sorted by id), useful for spot-inspection or downstream tools that prefer one-record-per-file.
- `pianoroll/` — one SVG per record, matched by basename (`<id>.svg` corresponds to `records/<id>.json`).
- `evals/` — eval artifacts produced by the source-repo eval harnesses and gates. The two canonical entry-point artifacts for **this version** are `v0.5.0-release-gate-assessment.json` (the RC-gate PASS verdict at the v0.5.0 cut) and `v0.5.0-execution-verification.json` (the standing execution gate: every unique frozen tool call replayed against the live MCP server, 0 failures). The slice-tagged artifacts (slice16–slice22) are the dataset's documented evolutionary history, all measured on pre-v0.5.0 record states — see `KNOWN_LIMITATIONS.md` §9 for the layered story. The Slice 21 fair-E3 baseline was measured on v0.4.3 records and ships in the v0.4.3 deposit (DOI [10.5281/zenodo.20279919](https://doi.org/10.5281/zenodo.20279919)), not here; the successor baseline measured on v0.5.0 records ships with a future version.
- `splits.json` — train/test split with `held_out_song` pinned. Locked: `clair-de-lune` is the canonical held-out test set; it is NEVER used for training.
- `provenance-verification.json` — per-song URL verification report from Slice 2.5 (filtered to the public songs).
- `manifest.json` — package-scope manifest with `record_count`, `pair_count`, `songs_included`, `splits`, etc.
- `CITATION.cff` — Citation File Format metadata.
- `LICENSE-DATASET.md` — layered-licensing explainer (public-domain compositions + CC-BY-SA-3.0-DE arrangements).
- `VERSION` — single-line package version.
- `checksums.sha256` — SHA-256 sums of every other file in the package, sorted by path.
- `package-inputs.json` — packager-internal contract declaring which files are curated (preserved byte-for-byte) vs generated (rebuilt by `scripts/package-jam-actions-public.ts` on every run). Not consumed by downstream users; included for packager reproducibility.

Each record has these top-level fields: `id`, `schema_version`, `provenance`, `scope`, `observation`, `annotation_target`, `target_trace`, `eval_metadata`. See the source repo's `src/dataset/schema.ts` for the full Zod schema.

## Reproducibility

Earned by Slice 23.5 (audit-driven cleanup): a fresh contributor cloning this repo on any platform (Windows native, macOS, Linux, WSL) should be able to verify the package's integrity and reproduce the canonical Slice 22 RC-gate PASS verdict without operator handholding.

**Package version pinned by this reproducibility section:** `0.5.0` (built 2026-07-11; Bach BWV 846 correction release, errata 001 + 002).

**Canonical tags:**

- `jam-actions-v0-0.5.0-cut-2026-07-11` — this version's cut (record-content corrections + the standing execution gate).
- `jam-actions-v0-rc-gate-revised-2026-05-19` — Slice 22 RC-gate revised state (axes 2 + 6 revised).
- `jam-actions-v0-feature-marketed-2026-05-19` — the v0.4.3 published state (Zenodo DOI 10.5281/zenodo.20279919).

**Verification steps:**

```bash
# 1. Clone and check out this version's tag.
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions
git checkout jam-actions-v0-0.5.0-cut-2026-07-11

# 2. Install deps (pnpm 10+ recommended; npm/yarn also work via the lockfile).
pnpm install

# 3a. Verify package checksums (274 files, ~2 seconds).
#     Exit 0 on success; exit 1 with `[bad line] / [hash mismatch] / [missing on disk]`
#     lines on failure. Windows-safe since Slice 23.5: `.gitattributes` pins LF
#     for *.sha256 files, and the verifier is CRLF-tolerant as defense in depth.
pnpm exec tsx scripts/verify-public-package-checksums.ts

# 3b. Re-run the standing execution gate: every unique frozen tool call in the
#     package replays against the live MCP server (0 failures required).
#     Requires a machine with an audio device — play_song connects the real
#     audio engine, so headless CI boxes report devicenotavailable instead.
pnpm build
pnpm exec tsx scripts/verify-public-package-execution.ts

# 3c. Reproduce the v0.5.0 RC-gate PASS verdict. The gate's input is the sealed
#     16-record E3 baseline, which was measured on v0.4.3 records and ships in
#     the v0.4.3 deposit rather than in this package (see RELEASE_NOTES.md).
#     Restore its sealed bytes from git history, then run the pure validator:
git show jam-actions-v0-feature-marketed-2026-05-19:datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json > /tmp/slice21-baseline.json
pnpm exec tsx scripts/check-release-gate.ts /tmp/slice21-baseline.json
```

**Expected outputs:**

The checksum verifier ends with `[ok] All checksums verify, every file accounted for.` and exits 0.

The execution gate prints `VERDICT: PASS` (230 unique calls, 0 failures) and exits 0 — matching `evals/v0.5.0-execution-verification.json`.

The release-gate CLI prints a per-axis summary with all 6 blocking axes PASS and aggregate `RC gate PASS`, exit code 0 — the structural verdict recorded in `evals/v0.5.0-release-gate-assessment.json`. (Honest scope: that baseline predates this version's prose corrections; the successor baseline measured on v0.5.0 records ships with a future version.)

**Regression-check (the Slice 19 baseline should still FAIL under the revised gate):**

```bash
pnpm exec tsx scripts/check-release-gate.ts \
  datasets/jam-actions-v0-public/evals/slice19-fair-e3-baseline-results.json
```

Exit code 1, with axes 1/2/6 reported as FAIL (the Schumann m045-048 record's pre-Slice-21 annotation was the catastrophic-stratum failure that Slice 21 repaired). This artifact is referenced as `evals/slice22-release-gate-slice19-regression-check.json` for the canonical regression-check verdict.

**No model runs are required for reproducibility.** The release-gate is a pure validator over sealed eval artifacts, and the execution gate replays deterministic tool calls. To re-run the model itself, see the source repo's `scripts/eval-jam-actions-annotation-grounding.ts` (requires Ollama + the `qwen2.5:7b` model locally).

## Source Data

MIDI arrangements are by **Bernd Krueger**, published at **piano-midi.de** under CC-BY-SA 3.0 (DE jurisdiction). The underlying compositions are all in the public domain in both the US and EU (composer death + 70 years elapsed; latest of the 8 composers, Debussy, d. 1918).

Songs included (alphabetical):

- `bach-prelude-c-major-bwv846`
- `chopin-nocturne-op9-no2`
- `chopin-prelude-e-minor`
- `clair-de-lune`
- `fur-elise`
- `mozart-k545-mvt1`
- `pathetique-mvt2`
- `schumann-traumerei`

## Licensing

This dataset is layered:

1. **Compositions** — public domain (US: pre-1929 publication; EU: composer death + 70 years elapsed).
2. **Arrangements (MIDI sequences)** — Bernd Krueger, piano-midi.de, **CC-BY-SA 3.0 (DE)** — https://creativecommons.org/licenses/by-sa/3.0/de/
3. **Derivative records (this dataset)** — **CC-BY-SA-3.0-DE** — share-alike inherited from the upstream arrangements.

HuggingFace's enumerated license slugs do not include the `-de` jurisdiction; the dataset card YAML uses `cc-by-sa-3.0` and the DE jurisdiction is documented here in the body and in `LICENSE-DATASET.md`.

Attribution requirements when using this dataset:

- Cite **Bernd Krueger** and **piano-midi.de** when using the MIDI bytes or sequences.
- Cite this dataset (see `CITATION.cff`) when using the records, traces, or derived tokenizations.

## Held-out Test Set

**`clair-de-lune`** (12 records) is the canonical held-out test set. It is **never** to be used for training. The remaining 103 records form the train split. The held-out choice is stratified by composer + style era: Debussy's Impressionist (1905) voicing is distinct from every training-set composer's idiom, so leakage from train to test is structurally low.

Split discipline is preserved across the packaging: every pair (`prompt` + `continuation_target`) is in the same split, and `clair-de-lune` was held out from the start of v0.

## Provenance

Slice 2.5 of the source repo verified the provenance URL for each song against piano-midi.de's per-composer page. Of the 10 candidate songs, 8 passed verification and were promoted to `public`; the other 2 were demoted to `internal` (excluded from this public subset). The per-song report — including verification timestamps, attempted URLs, response sizes, and failure reasons (for the demoted songs) — is shipped alongside this dataset as `provenance-verification.json` (filtered to the 8 public songs).

Each record's `provenance` block carries its own `verdict_reason`, `verifier`, `verified_at`, and `arrangement_evidence_url` byte-for-byte from the source corpus. None of these fields are re-derived during packaging.

## Citation

See `CITATION.cff` for machine-readable metadata. BibTeX equivalent:

```bibtex
@dataset{jam_actions_v0_public_2026,
  author       = {mcp-tool-shop-org},
  title        = {jam-actions-v0 — AI Jam Sessions tool-use traces (public subset)},
  version      = {0.5.0},
  year         = {2026},
  license      = {CC-BY-SA-3.0-DE},
  url          = {https://github.com/mcp-tool-shop-org/ai-jam-sessions}
}
```

## Limitations

- **Satie Gymnopédie No. 1** and **Debussy Arabesque No. 1** are **NOT** in this public subset. Slice 2.5 could not confirm their provenance against piano-midi.de — the Satie composer page returned HTTP 418 (the upstream does not currently carry Satie), and the Debussy composer page was reachable but did not reference Arabesque No. 1. Both songs remain in the source repo with `record_verdict: "internal"` and are excluded from this distribution.
- **No vocal records.** The source repo's `manifest.json` declares `vocal_synth_engine` as a `declared_dependency_surface` for future record types (vocal_phrase, sing_along_trace, phoneme_alignment, vocal_render_score), but v0 ships **only** instrument records. The public-subset `manifest.json` reflects this by listing only `ai_jam_sessions` under `instrument_surfaces`.
- **Piano only.** All 8 songs are solo-piano arrangements. Other instruments are out of scope for v0.
- **English-only annotations.** Teaching-note text is English-only.

## Maintainer

[`mcp-tool-shop-org`](https://github.com/mcp-tool-shop-org) — please open an issue at https://github.com/mcp-tool-shop-org/ai-jam-sessions for questions, corrections, or contributions.
