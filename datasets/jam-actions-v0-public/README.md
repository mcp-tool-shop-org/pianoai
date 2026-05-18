---
license: cc-by-sa-3.0
language:
  - en
pretty_name: "AI Jam Sessions — Tool-Use Traces v0 (Public Subset)"
size_categories:
  - n<1K
task_categories:
  - text-generation
  - other
task_ids: []
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

**Version:** 0.1.0   **Built:** 2026-05-17   **Source commit:** `e4631391c0ebe02682188b778b82c0501dd9a314`   **Source tag:** `jam-actions-v0-public-2026-05-17`

## Dataset Summary

`jam-actions-v0` is a corpus of multi-turn MCP (Model Context Protocol) tool-use traces grounded in real classical-piano MIDI. Each record pairs a short phrase window (typically 4 measures) with an annotated teaching target and a target trace — a turn-by-turn session in which an assistant uses the `ai-jam-sessions` MCP tools to read, analyze, and discuss the phrase. The dataset teaches LLMs to do **grounded tool-use over symbolic music**, not just text generation.

This is the **public subset**: 115 records across 8 compositions, all under CC-BY-SA-3.0 (DE jurisdiction). Two songs from the full source corpus (Satie Gymnopédie No. 1; Debussy Arabesque No. 1) are NOT included here — their provenance against piano-midi.de could not be verified during Slice 2.5 URL verification.

## Dataset Structure

Top-level files:

- `records.jsonl` — one JSON object per line; the canonical training feed. Each line is a complete record with an additional `split` field (`"train"` or `"test"`) so consumers can use the file without consulting `splits.json`.
- `records/` — the same records as individual JSON files (sorted by id), useful for spot-inspection or downstream tools that prefer one-record-per-file.
- `pianoroll/` — one SVG per record, matched by basename (`<id>.svg` corresponds to `records/<id>.json`).
- `splits.json` — train/test split with `held_out_song` pinned. Locked: `clair-de-lune` is the canonical held-out test set; it is NEVER used for training.
- `provenance-verification.json` — per-song URL verification report from Slice 2.5 (filtered to the public songs).
- `manifest.json` — package-scope manifest with `record_count`, `pair_count`, `songs_included`, `splits`, etc.
- `CITATION.cff` — Citation File Format metadata.
- `LICENSE-DATASET.md` — layered-licensing explainer (public-domain compositions + CC-BY-SA-3.0-DE arrangements).
- `VERSION` — single-line package version.
- `checksums.sha256` — SHA-256 sums of every other file in the package, sorted by path.

Each record has these top-level fields: `id`, `schema_version`, `provenance`, `scope`, `observation`, `annotation_target`, `target_trace`, `eval_metadata`. See the source repo's `src/dataset/schema.ts` for the full Zod schema.

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
  version      = {0.1.0},
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
