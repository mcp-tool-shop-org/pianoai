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

**Version:** 0.1.1   **Built:** 2026-05-17   **Source commit:** `e4631391c0ebe02682188b778b82c0501dd9a314`   **Source tag:** `jam-actions-v0-public-2026-05-17`

This is a **checkpoint**, not a release candidate. See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) § 11.

## Dataset Summary

`jam-actions-v0` is a corpus of **instrument-action traces** — multi-turn MCP (Model Context Protocol) tool-use sessions grounded in real classical-piano MIDI. Each record pairs a short phrase window (typically 4 measures) with three things:

1. The MIDI evidence (timed events, REMI tokens, ABC notation, piano-roll SVG).
2. A teaching-grade annotation (structure, key_moments, teaching_goals, style_tips, per-measure technique notes).
3. A turn-by-turn target trace in which an assistant uses the `ai-jam-sessions` MCP tools (`view_piano_roll`, `play_song`, etc.) to read, analyze, loop, and discuss the phrase.

The dataset teaches LLMs to do **grounded MCP tool-use over symbolic music**. It is not a music-generation corpus, not an audio-captioning dataset, and not a generic symbolic-music collection. It is the narrowest faithful subset of the broader thesis: train models to use a *specific* MCP instrument well, on *real* tool schemas, with *real* musical evidence.

This is the **public subset**: 115 records across 8 compositions, all under CC-BY-SA-3.0 (DE jurisdiction). Two songs from the source corpus (Satie Gymnopédie No. 1; Debussy Arabesque No. 1) are NOT included here — their provenance against piano-midi.de could not be verified during Slice 2.5 URL verification.

## Quickstart

The simplest way to consume this dataset:

```python
import json

# Streaming consumer — one record per line, includes a 'split' field
with open("records.jsonl") as f:
    for line in f:
        record = json.loads(line)
        # record has: id, schema_version, provenance, scope, observation,
        # annotation_target, target_trace, eval_metadata, split
        ...
```

For full per-field semantics, see [DATASET_SCHEMA.md](DATASET_SCHEMA.md).

## What This Dataset Is NOT

A candid negative-space framing (full version in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) §13):

- **Not a music-generation dataset.** The target traces train tool use, not standalone composition. Use ChatMusician / MuPT for generation.
- **Not audio-conditioned.** Symbolic only — no `.wav`, no spectrograms.
- **Not multi-instrument.** All 8 songs are solo piano. The schema is instrument-agnostic, but v0 ships piano only.
- **Not a vocal dataset.** The source repo declares `vocal_synth_engine` as a future-record-types dependency surface, but no vocal records ship in v0. The public-subset `manifest.json` accordingly lists *only* `ai_jam_sessions` under `instrument_surfaces`.
- **Not ready-to-fine-tune without compute consideration.** E2 and E3 baselines fail thresholds on the realistic capability target (qwen2.5:7b). See "Eval Baselines" below.
- **Not a release candidate.** This package is a reproducible checkpoint. Zenodo/HF publication is a separate slice (Slice 13, operator-driven).

## Dataset Structure

### Top-level files

| File | Purpose |
|---|---|
| `records.jsonl` | Canonical training feed — 115 lines, one record per line, sorted by id, with `split` field added per line. |
| `records/` | The same records as 115 individual JSON files (sorted by id). |
| `pianoroll/` | 115 piano-roll SVGs, matched by basename (`<id>.svg` ↔ `records/<id>.json`). |
| `splits.json` | Train/test split with `held_out_song: "clair-de-lune"`. Pair-locked. |
| `provenance-verification.json` | Filtered Slice 2.5 URL verification report (the 8 public songs). |
| `manifest.json` | Package-scope manifest: counts, songs, splits, license, instrument_surfaces. |
| `README.md` | This file. |
| `DATASET_SCHEMA.md` | Per-field documentation walkthrough. |
| `ATTRIBUTION.md` | Three-layer attribution: compositions / arrangements / records. |
| `LICENSE-DATASET.md` | License explainer (layered licensing). |
| `KNOWN_LIMITATIONS.md` | Candid honesty document. |
| `CITATION.cff` | Citation File Format v1.2.0 metadata. |
| `VERSION` | Single-line package version (`0.1.1`). |
| `checksums.sha256` | SHA-256 sums of every other file, sorted by path. |

### Per-record shape

Each record has these top-level fields:

```
id, schema_version, provenance, scope, observation,
annotation_target, target_trace, eval_metadata
```

Full per-field documentation lives in [DATASET_SCHEMA.md](DATASET_SCHEMA.md). The canonical Zod schema is `src/dataset/schema.ts` in the source repo.

### Window roles (E2 pairing)

Records carry one of three `scope.window_role` values:

| Role | Count in this subset | Meaning |
|---|---|---|
| `prompt` | 57 | First half of an E2 phrase-continuation pair; references its continuation_target via `continuation_target_window`. |
| `continuation_target` | 57 | Gold continuation for a `prompt`; references its mate via `paired_prompt_record_id`. |
| `standalone` | 1 | Not part of an E2 pair. (`fur-elise:m001-008:...` — the legacy Slice 1 synthesis anchor.) |

The packager verified pair completeness on filter: no `continuation_target` record exists without its `prompt` mate in the same split. The 57 + 57 + 1 = 115 sum checks out.

## Splits

| Split | Records | Stratification |
|---|---|---|
| train | 103 | 7 songs (Bach, Chopin x2, Beethoven x2 [Für Elise + Pathétique], Mozart, Schumann), composer-stratified |
| test | 12 | All of `clair-de-lune` |

**`clair-de-lune` is the canonical held-out test set.** It is NEVER used for training. The held-out choice is stratified by composer + style era: Debussy's Impressionist (1905) idiom is distinct from every training-set composer's idiom (Bach Baroque, Mozart Classical, Beethoven Classical/early Romantic, Chopin/Schumann Romantic), giving structurally low leakage from train to test.

Split discipline is preserved across the packaging: every pair (`prompt` + `continuation_target`) is in the same split, and `clair-de-lune` was held out from the start of v0.

## Source Data and Provenance

MIDI arrangements are by **Bernd Krueger**, published at **piano-midi.de** under CC-BY-SA-3.0 (DE jurisdiction). The underlying compositions are all in the public domain in both the US and EU (composer death + 70 years elapsed; latest, Debussy, d. 1918).

Songs included (alphabetical):

- `bach-prelude-c-major-bwv846` — Bach, Prelude in C Major, BWV 846 (16 records)
- `chopin-nocturne-op9-no2` — Chopin, Nocturne in E♭ Major, Op. 9 No. 2 (18 records)
- `chopin-prelude-e-minor` — Chopin, Prelude in E Minor, Op. 28 No. 4 (12 records)
- `clair-de-lune` — Debussy, "Clair de Lune" from Suite bergamasque (12 records — **TEST**)
- `fur-elise` — Beethoven, Bagatelle No. 25 in A minor (13 records)
- `mozart-k545-mvt1` — Mozart, Piano Sonata No. 16, K. 545 mvt I (16 records)
- `pathetique-mvt2` — Beethoven, Sonata Op. 13 "Pathétique", II Adagio cantabile (16 records)
- `schumann-traumerei` — Schumann, "Träumerei" from Kinderszenen (12 records)

Slice 2.5 of the source repo verified the provenance URL for each song against piano-midi.de's per-composer page via live HTTP fetch. Of the 10 candidate songs, 8 passed verification and were promoted to `public`; the other 2 were demoted to `internal` (excluded from this public subset). The per-song report — including verification timestamps, attempted URLs, response sizes, and failure reasons (for the demoted songs) — is shipped as [`provenance-verification.json`](provenance-verification.json).

Each record's `provenance` block carries its own `verdict_reason`, `verifier`, `verified_at`, and `arrangement_evidence_url` byte-for-byte from the source corpus. None of these fields are re-derived during packaging or hardening.

For the full three-layer attribution (compositions / arrangements / records) and copy-pasteable citation strings, see [ATTRIBUTION.md](ATTRIBUTION.md).

## Licensing

Layered (full version in [LICENSE-DATASET.md](LICENSE-DATASET.md) + [ATTRIBUTION.md](ATTRIBUTION.md)):

1. **Compositions** — public domain (US: pre-1929 publication; EU: composer death + 70 years).
2. **Arrangements (MIDI sequences)** — Bernd Krueger / piano-midi.de, **CC-BY-SA-3.0-DE**.
3. **Derivative records (this dataset)** — **CC-BY-SA-3.0-DE** (share-alike inherited).

HuggingFace's enumerated license slugs do not include `-de` jurisdiction; the dataset card YAML uses `cc-by-sa-3.0` and the precise DE jurisdiction is documented in [LICENSE-DATASET.md](LICENSE-DATASET.md), [ATTRIBUTION.md](ATTRIBUTION.md), and below.

If you redistribute records from this dataset, you must:

1. Attribute the dataset (CC-BY-SA-3.0-DE): *"jam-actions-v0 (public subset) by mcp-tool-shop-org, CC-BY-SA-3.0-DE."*
2. Attribute the underlying arrangements (CC-BY-SA-3.0-DE): *"Bernd Krueger / piano-midi.de, CC-BY-SA-3.0-DE."*
3. Compositions are public domain in US + EU; no per-composition attribution required.
4. Share-alike applies: derivative works must be licensed under CC-BY-SA-3.0-DE or a compatible share-alike license (CC-BY-SA-3.0 international, CC-BY-SA-4.0 via the one-way 4.0→3.0 compatibility annex).
5. Indicate any changes you made.

## Eval Baselines

This package ships **no fine-tuned model**. The numbers below are the latest local-model baselines as of 2026-05-17. They are honest results: E2 and E3 fail the locked thresholds on the realistic capability target (qwen2.5:7b). See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) §9 for the full disclosure.

### qwen2.5:7b on test set (`clair-de-lune` × 4 records, n=3 runs/record, $0 local cost)

| Eval | Result | Threshold | Status |
|---|---|---|---|
| **E1 tool-use** | 75% pass rate (3/4 records majority-pass) | ≥ 70% | **PASS** |
| **E2 phrase continuation** | 0/2 pairs majority-pass on aggregate. Pair 1 (mm. 1-4 → 5-8) passes 2/3 runs, mean grooveOA 0.81. Pair 2 (mm. 15-18 → 19-22) parses only 1 of 3 runs; the parseable run hits grooveOA 0.98 but consistency fails. | ≥ 0.797 grooveOA AND 2/2 pairs | **FAIL** (FM-5, music-quality consistency) |
| **E3 annotation grounding** | full 0.188, text-only 0.313, random-MIDI 0.250. Margin vs text-only = **−0.125**; margin vs random-MIDI = **−0.0625**. | margins ≥ +0.10 over both controls | **FAIL** |

**Reading the results:**

- **E1 is the only PASS.** Local 7B can reliably emit valid MCP tool calls in the right order with right args.
- **E2 failure mode is consistency, not music quality.** On parseable runs, mean grooveOA is well above the 0.797 gate. The model can produce great continuations *sometimes*; structural consistency is the gap (FM-5).
- **E3 failure mode is grounding.** The model sometimes does better with annotation-prose-only than with MIDI evidence. After Slice 8 hardening (LCG seed fix + 4-option structural symmetry + prior-leak removal), this number went *down* across all baselines — confirming the previous higher scores were structural leakage, not grounding. The 0.188 / 0.313 / 0.250 split means the rule-based gold answerer can hit 1.0 on these exact questions (MIDI evidence is sufficient), but a 7B that hasn't learned to use MIDI doesn't beat the prose.

### Why no Sonnet/GPT-4-class baselines?

Doctrine: the product signal is whether a *local* 7-13B model can use this dataset well enough to improve under fine-tuning. A local model failing thresholds is more useful evidence than a Sonnet/GPT-4-class baseline cleanly clearing them. Paid-API runs are optional comparison points, not pass gates — they are not part of this release. See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) §7.

### Fine-tuning status

Deferred on compute-substrate grounds (Slice 9c). Phase 1 (training data export + LoRA scaffold) shipped: 20 SFT examples + QLoRA scaffold at `experiments/jam-actions-v0-lora/` in the source repo. Phase 2 (training execution) hit system memory pressure on the available 5080-laptop substrate and was aborted before any adapter was produced. The dataset and harness are ready; the compute substrate is the constraint. See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) §8.

## Limitations

The full candid disclosure is in [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md). Briefly:

1. **Single-source provenance** — all MIDI from one arranger (Krueger / piano-midi.de).
2. **Small corpus** — 8 songs, 115 records, 57 pairs + 1 standalone.
3. **Classical only** — no jazz, no pop, no contemporary.
4. **Piano only** — no vocal records despite VSE being a declared dependency surface.
5. **Annotation depth varies** — some records (Bach mm. 1-4, Mozart K545 mm. 1-4) are richly detailed; others (Pathétique mm. 29-32, Schumann mm. 45-48) are sparser. Slice 11 (future) will enrich.
6. **Three records have `rhythm_onset: not_computable`** due to anacrusis (`pathetique-mvt2:m029-032`, `pathetique-mvt2:m057-060`, `schumann-traumerei:m045-048`). Honest absence, not defect.
7. **Local-only eval baselines** (no paid-API).
8. **No fine-tuned model ships** — dataset + harness only.
9. **E2 and E3 baselines fail the locked thresholds** — see "Eval Baselines" above.
10. **CC-BY-SA-3.0-DE jurisdiction matters** — German governing law; downstream users in other jurisdictions should declare CC-BY-SA-3.0-DE or apply their local CC port.
11. **Checkpoint, not release candidate.** Zenodo/HF publication is Slice 13.

## Citation

See [CITATION.cff](CITATION.cff) for machine-readable metadata. BibTeX equivalent:

```bibtex
@dataset{jam_actions_v0_public_2026,
  author       = {mcp-tool-shop-org},
  title        = {jam-actions-v0 — AI Jam Sessions tool-use traces (public subset)},
  version      = {0.1.1},
  year         = {2026},
  license      = {CC-BY-SA-3.0-DE},
  url          = {https://github.com/mcp-tool-shop-org/ai-jam-sessions},
  note         = {MIDI arrangements by Bernd Krueger, piano-midi.de, CC-BY-SA-3.0-DE.}
}
```

Plain-text reference and additional formats: [ATTRIBUTION.md](ATTRIBUTION.md) § "Copy-pasteable attribution strings".

## Maintainer

[`mcp-tool-shop-org`](https://github.com/mcp-tool-shop-org) — please open an issue at https://github.com/mcp-tool-shop-org/ai-jam-sessions for questions, corrections, or contributions.

## Doc map

| Read this if you want to know... | Document |
|---|---|
| What this dataset is for, headline | this README, "Dataset Summary" |
| What every field in a record means | [DATASET_SCHEMA.md](DATASET_SCHEMA.md) |
| Who owns what, how to attribute, copy-pasteable cites | [ATTRIBUTION.md](ATTRIBUTION.md) |
| Layered licensing obligations | [LICENSE-DATASET.md](LICENSE-DATASET.md) |
| What this dataset is NOT, what's deferred, what should not be claimed | [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) |
| Per-song verification evidence (URLs, HTTP status, license markers) | [provenance-verification.json](provenance-verification.json) |
| Train/test split membership | [splits.json](splits.json) |
| Package counts and metadata | [manifest.json](manifest.json) |
| Citation metadata (machine-readable) | [CITATION.cff](CITATION.cff) |
| File integrity | [checksums.sha256](checksums.sha256) |
