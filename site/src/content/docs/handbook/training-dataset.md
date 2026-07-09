---
title: Training dataset
description: jam-actions-v0 — a public 115-record dataset of multi-turn MCP tool-use traces over classical piano, with a 7-axis release gate and cold-start reproducibility.
sidebar:
  order: 6
---

AI Jam Sessions ships an MCP server. It also ships **jam-actions-v0** — a public training dataset built from the same library, with the same tools, that teaches an LLM to do *grounded tool-use over symbolic music* rather than text generation alone.

## What it is

Each record in `jam-actions-v0` pairs:

- **A phrase window.** Typically 4 measures of real classical piano MIDI from one of 8 source compositions.
- **An annotated teaching target.** A specific musical claim about that phrase — a melodic contour, an interval relationship, a hand-balance observation, a pitch-class count — that an LLM should be able to verify by reading the MIDI.
- **A target trace.** A turn-by-turn record of an assistant using the MCP inspector tools (`get_events_in_measure`, `get_events_in_hand`, `count_distinct_pitch_classes`, `count_notes_with_pitch_class`, `count_beat_1_onsets`, `get_pitch_at`, `get_hand_balance`, `find_highest_pitch`, `find_lowest_pitch`) to read the phrase, gather evidence, and either confirm or correct the claim.

The training signal is not "generate text about music." It is "call the right tool, read the right cell of the MIDI, and let the evidence decide."

## The numbers

| | |
|---|---|
| Records (public subset) | 115 |
| Canonical baseline | 16 records (post-repair E3) |
| Compositions | 8 classical piano works |
| Composers | Bach, Beethoven, Chopin, Debussy, Mozart, Schumann |
| Source MIDI | piano-midi.de — Bernd Krueger arrangements |
| License | CC-BY-SA-3.0-DE |
| Version | 0.4.3 (2026-05-19) |
| Schema | `release-gate-assessment/2.0.0` |
| Repo test suite | 1513 passing (includes the dataset packagers, eval harnesses, and release-gate validator) |

## How it was built — the 25-slice arc

The dataset is the product of 25 iteratively named slices (numbered with a `.5` for in-arc corrections):

| Slice | Theme |
|-------|-------|
| 7–10 | Initial corpus draft + pilot run |
| 10.5–11 | Public packager + first packaging pass |
| 12–14 | Eval harness + multi-run aggregation |
| 15 | Cohort review + autonomous-commit doctrine correction |
| 16–18 | MIDI inspector surface + tool-use harness |
| 18.5 | Off-by-one repair (annotation_grounding beat alignment) |
| 19 | Fair E3 baseline (post-repair) |
| 20 | Release-gate validator (7 axes) |
| 21 | Schumann remediation (R6-aware rewrite) |
| 22 | RC-gate revision (axes 2 + 6 ceiling-saturated) |
| 23 | Operator-aloneness audit |
| 23.5 | Reproducibility cleanup (Windows-safe checksums) |
| 24 | Publication dry-run dossier |
| 24.5 | HuggingFace dataset card polish |
| 25 | Publication execution — Zenodo DOI minted (`10.5281/zenodo.20279919`) |

Every slice has a semantic git tag (`jam-actions-v0-<theme>-<date>`), and every claim in the release-gate assessment is reproducible from a tagged commit.

## The 7-axis release gate

The gate exists to answer a specific question: *is this dataset PASSING because the evidence is real, or because the task is trivial?*

| Axis | What it measures | Blocking? |
|------|------------------|-----------|
| 1 | Absolute floor — minimum acceptable score across all conditions | Yes |
| 2 | Margin compound — the tool-inspected condition must beat the text-only condition by a margin (with a ceiling-saturated bucket for trivial wins) | Yes |
| 3 | Tool-use rate — the assistant must actually call the inspector tools | Yes |
| 4 | Correct-after-tool — once tools are called, the answer must be right | Yes |
| 5 | Misinterpretation rate — wrong-tool calls must stay at or below the threshold (20% by default) | Yes |
| 6 | Stratum floor — every stratum (easy / medium / hard) must clear its floor (with the same ceiling-saturated relief) | Yes |
| 7 | Enriched-vs-non reporting — comparison of enriched vs non-enriched records | Informational only |

Axes 2 and 6 admit a `ceiling_saturated_pass` bucket — a record where text-only ≥ 0.90 AND tool-inspected ≥ 0.90 AND random-MIDI ≥ 0.90 AND misinterpretation_count == 0 passes even with no margin, because there is nowhere to improve. This was Slice 22's contribution: without it, ceiling-effect records pulled the gate FAIL for the wrong reason.

**Current canonical verdict:** the Slice 22 baseline **PASSES**. The Slice 19 baseline still **FAILS** — kept on purpose as a regression diagnostic so the gate has demonstrable teeth.

## The 9-tool MIDI inspector surface

Every trace in the dataset is grounded by these tools. They are deterministic, side-effect-free, and operate on the same MIDI the server plays:

| Tool | Returns |
|------|---------|
| `get_events_in_measure(song, measure)` | Note-on events in that measure, both hands |
| `get_events_in_hand(song, measure, hand)` | Notes for one hand only (`right` or `left`) |
| `count_distinct_pitch_classes(song, measure)` | Cardinality of the pitch-class set in the measure |
| `count_notes_with_pitch_class(song, measure, pc)` | Count of notes with a specific pitch class (added Slice 18 to close a wrong-tool gap) |
| `count_beat_1_onsets(song, measure)` | Notes that start on beat 1 |
| `get_pitch_at(song, measure, beat, hand)` | Pitch at a specific measure/beat in a specific hand |
| `get_hand_balance(song, measure)` | Right-hand note count vs left-hand note count |
| `find_highest_pitch(song, measure, hand?)` | Highest MIDI pitch in scope |
| `find_lowest_pitch(song, measure, hand?)` | Lowest MIDI pitch in scope |

Beats are 0-indexed throughout. Slice 18.5 removed a `+1` shift in `annotation-grounding.ts:756` that had been corrupting every annotation-grounding question on every prior record — a single-character bug that affected the entire prior arc.

## Reproducibility — under a minute on any platform

A fresh contributor cloning the repo on Windows native, macOS, Linux, or WSL can verify the package and reproduce the canonical PASS verdict without operator handholding:

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions
git checkout jam-actions-v0-zenodo-published-2026-05-19   # the v0.4.3 publication state (or stay on main)

pnpm install

# Step 1: verify the package (274 entries, ~2 seconds).
pnpm exec tsx scripts/verify-public-package-checksums.ts

# Step 2: reproduce the canonical Slice 22 RC-gate PASS verdict.
pnpm exec tsx scripts/check-release-gate.ts \
  datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json
```

Expected: both commands exit 0, and the release-gate CLI prints `Aggregate: PASS` with `RC gate PASS (all 6 blocking axes cleared; reporting declared)`.

**What makes this reliable on Windows.** Slice 23.5 added `.gitattributes` pinning LF line endings for `*.sha256` and the entire `datasets/jam-actions-v0-public/**` tree, so Git on Windows doesn't silently CRLF-convert your checkout. The verifier itself is also CRLF-tolerant (`parseChecksumsManifest` strips trailing `\r`) as defense in depth, in case someone forks without the gitattributes.

**What makes the gate CLI strict.** `scripts/check-release-gate.ts` rejects unknown positional arguments and multiple positionals — a fresh contributor cannot silently mis-invoke it and get a misleading PASS.

## Provenance — what is and is not in the public subset

| Composition | Composer | Source | In public subset? |
|-------------|----------|--------|-------------------|
| Prelude in C major, BWV 846 (WTC I) | Bach | piano-midi.de (Krueger) | Yes — 16 records |
| Für Elise | Beethoven | piano-midi.de (Krueger) | Yes — 13 records |
| Pathétique mvt. 2 | Beethoven | piano-midi.de (Krueger) | Yes — 16 records |
| Nocturne Op. 9 No. 2 | Chopin | piano-midi.de (Krueger) | Yes — 18 records |
| Prelude in E minor, Op. 28 No. 4 | Chopin | piano-midi.de (Krueger) | Yes — 12 records |
| Clair de lune | Debussy | piano-midi.de (Krueger) | Yes — 12 records (held-out test split) |
| Sonata K545 mvt. 1 | Mozart | piano-midi.de (Krueger) | Yes — 16 records |
| Kinderszenen No. 7 (Träumerei) | Schumann | piano-midi.de (Krueger) | Yes — 12 records |
| Gymnopédie No. 1 | Satie | piano-midi.de | **No — Slice 2.5 URL verification failed** |
| Arabesque No. 1 | Debussy | piano-midi.de | **No — Slice 2.5 URL verification failed** |

The two excluded songs were *almost* included. The honest call was to leave them out: provenance against piano-midi.de could not be verified during URL audit, and rather than ship the dataset on faith we shipped what could be defended.

## License — share-alike, end to end

The compositions are public domain. The MIDI arrangements are by Bernd Krueger (piano-midi.de), licensed **CC-BY-SA-3.0-DE**. The annotations, traces, eval artifacts, and tooling are by the AI Jam Sessions team, released under the **same** license to preserve the share-alike chain.

If you build on this dataset and redistribute your work, your downstream artifact inherits the share-alike obligation.

## Citation — how to credit it

Use the Citation File Format file shipped with the dataset:

```bash
cat datasets/jam-actions-v0-public/CITATION.cff
```

Or a plain-text form:

> mcp-tool-shop-org & Krueger, B. (2026). *AI Jam Sessions — Tool-Use Traces v0 (Public Subset)*, Version 0.4.3. Zenodo. CC-BY-SA-3.0-DE. https://doi.org/10.5281/zenodo.20279919

The DOI [`10.5281/zenodo.20279919`](https://doi.org/10.5281/zenodo.20279919) was minted on Zenodo on 2026-05-19 and is recorded in `CITATION.cff`. It is the canonical citation handle; the record lives at [zenodo.org/records/20279919](https://zenodo.org/records/20279919).

## Where everything lives

| Artifact | Path |
|----------|------|
| HF-format dataset card | `datasets/jam-actions-v0-public/README.md` |
| Zenodo deposition metadata | `datasets/jam-actions-v0-public/zenodo-metadata.json` |
| Citation File Format | `datasets/jam-actions-v0-public/CITATION.cff` |
| Release notes (per version) | `datasets/jam-actions-v0-public/RELEASE_NOTES.md` |
| Attribution detail | `datasets/jam-actions-v0-public/ATTRIBUTION.md` |
| Canonical PASS verdict | `datasets/jam-actions-v0-public/evals/slice22-release-gate-revised-assessment.json` |
| Canonical baseline | `datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json` |
| Records (JSONL) | `datasets/jam-actions-v0-public/records.jsonl` |
| Records (per-file JSON) | `datasets/jam-actions-v0-public/records/` |
| Piano-roll SVGs | `datasets/jam-actions-v0-public/pianoroll/` |
| 24-slice build arc docs | `docs/jam-actions-v0-slice*.md` |

The dataset card is also the published HuggingFace card — the YAML frontmatter at the top (license, language, task_categories, tags, configs) is what HF reads to register the dataset on its platform.
