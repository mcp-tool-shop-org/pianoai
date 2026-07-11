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
| Version | 0.5.0 (2026-07-11) — Bach BWV 846 correction release, errata 001 + 002 |
| Schema | `release-gate-assessment/2.0.0` |
| Repo test suite | 2506 passing (includes the dataset packagers, eval harnesses, and release-gate validator) |

## Does it actually train anything? — the fine-tuning receipts

The dataset's claims were tested the hard way: preregistered fine-tunes of Qwen2.5-7B-Instruct, scored against sealed baselines, with the statistics and the honesty rules frozen **before** any training run. Three arcs, all fully receipted in the repo:

| Arc | What ran | Primary result (tool-grounded QA) | Verdict (preregistered wording) |
|---|---|---|---|
| **v0** | 5 seeds trained on the 78 jam traces alone; sealed 16-record cohort | 0.661 → 0.601 (Δ −0.061, 0/5 seeds above baseline) | **Honest negative** — not better than the prompted baseline |
| **v1** | 5 seeds trained on 494 examples: the human traces + user-turn paraphrases (tool calls frozen), 310 execution-verified grounding-QA items over the 9-tool inspector surface, and a small self-rehearsal slice; same sealed cohort | 0.661 → **0.863** (Δ +0.202, permutation p = 0.0043, **all 5 seeds above baseline**, the one unseen song +0.433) | **Directionally better, underpowered** — 12/16 paired wins missed the frozen ≥13/16 victory bar by one; no adapter published |
| **B-1** | No training — the **frozen** v1 seeds (sha-pinned before the cohort existed), one sealed eval each against a fresh baseline on the v0.5.0 records, over a preregistered 36-record cohort (all 12 never-trained clair-de-lune records + the 15 sealed-history records + 9 seeded-blind new ones) | 0.678 → **0.890** (Δ +0.212, **29/36 paired wins vs the ex-ante 24/34 bar**, sign p = 0.000039, song-cluster CI excludes zero, never-trained stratum **10/12** on its own) | **Powered win** — v1's miss was a power artifact, not a ceiling |

Four things worth noticing:

- **The negative is a feature.** v0 proved the sealed-baseline discipline has teeth: five seeds, no cherry-picking, and a result reported exactly as it landed. The v1 design came directly out of v0's diagnosis (one narrow trace family taught itself and taxed its neighbors).
- **The near-miss stayed a near-miss until the power existed.** v1's +0.202 with p ≈ 0.004 would read as a win almost anywhere — but the bar was 13/16 wins and the run produced 12 plus a tie, so nothing shipped. B-1 answered the open question the honest way: freeze the artifacts, preregister a bigger cohort and a new bar, evaluate once. The win that ships is the powered one.
- **The pipeline audits the dataset back.** v1's execution-verification gate (every frozen tool call replayed against the live MCP server) caught a real defect in the published Bach records — the final window overshot BWV 846's actual 62 measures — fixed as revisions r001/r002 with public errata and shipped in v0.5.0, where execution verification is now a standing packaging gate.
- **What did not improve is reported with equal weight.** Across all three arcs the prose-only surfaces stay below baseline (B-1: text_only −0.074, full −0.083) — the fine-tunes get better by *inspecting*, not by *recalling*. The published claim stops at the tool-grounded surface.

**The five seed adapters are published** at [`mcp-tool-shop/jam-ft-v1-qwen25`](https://huggingface.co/mcp-tool-shop/jam-ft-v1-qwen25) with the claim tied to the all-seeds mean (per-seed numbers disclosed on the card; no best-of-seeds).

Full reports: [`finetune-arc-eval-report.md`](https://github.com/mcp-tool-shop-org/ai-jam-sessions/blob/main/docs/finetune-arc-eval-report.md) (v0), [`finetune-arc-v1-eval-report.md`](https://github.com/mcp-tool-shop-org/ai-jam-sessions/blob/main/docs/finetune-arc-v1-eval-report.md) (v1), and [`finetune-arc-v2-b1-eval-report.md`](https://github.com/mcp-tool-shop-org/ai-jam-sessions/blob/main/docs/finetune-arc-v2-b1-eval-report.md) (B-1), with preregistration locks, amendments, per-seed receipts, and replayable statistics under [`experiments/`](https://github.com/mcp-tool-shop-org/ai-jam-sessions/tree/main/experiments).

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
git checkout jam-actions-v0-0.5.0-cut-2026-07-11   # the v0.5.0 cut state (or stay on main)

pnpm install

# Step 1: verify the package (274 entries, ~2 seconds).
pnpm exec tsx scripts/verify-public-package-checksums.ts

# Step 2: re-run the standing execution gate — every unique frozen tool call
# in the package replays against the live MCP server (needs an audio device).
pnpm build
pnpm exec tsx scripts/verify-public-package-execution.ts

# Step 3: reproduce the v0.5.0 RC-gate PASS verdict. The sealed E3 baseline it
# reads was measured on v0.4.3 records and ships in the v0.4.3 deposit, not in
# the v0.5.0 package — restore its sealed bytes from git history first:
git show jam-actions-v0-feature-marketed-2026-05-19:datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json > /tmp/slice21-baseline.json
pnpm exec tsx scripts/check-release-gate.ts /tmp/slice21-baseline.json
```

Expected: every command exits 0; the execution gate prints `VERDICT: PASS` (230 unique calls, 0 failures), and the release-gate CLI prints `Aggregate: PASS` with `RC gate PASS (all 6 blocking axes cleared; reporting declared)`.

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

> mcp-tool-shop-org & Krueger, B. (2026). *AI Jam Sessions — Tool-Use Traces v0 (Public Subset)*, Version 0.5.0. Zenodo. CC-BY-SA-3.0-DE. https://doi.org/10.5281/zenodo.20279918

The concept DOI [`10.5281/zenodo.20279918`](https://doi.org/10.5281/zenodo.20279918) always resolves to the latest published version and is the canonical citation handle recorded in `CITATION.cff`. v0.5.0 is published with version DOI [`10.5281/zenodo.21313954`](https://doi.org/10.5281/zenodo.21313954) (2026-07-11); the prior release v0.4.3 has version DOI [`10.5281/zenodo.20279919`](https://doi.org/10.5281/zenodo.20279919) (2026-05-19).

## Where everything lives

| Artifact | Path |
|----------|------|
| HF-format dataset card | `datasets/jam-actions-v0-public/README.md` |
| Zenodo deposition metadata | `datasets/jam-actions-v0-public/zenodo-metadata.json` |
| Citation File Format | `datasets/jam-actions-v0-public/CITATION.cff` |
| Release notes (per version) | `datasets/jam-actions-v0-public/RELEASE_NOTES.md` |
| Attribution detail | `datasets/jam-actions-v0-public/ATTRIBUTION.md` |
| Canonical PASS verdict (v0.5.0) | `datasets/jam-actions-v0-public/evals/v0.5.0-release-gate-assessment.json` |
| Execution-verification receipt (v0.5.0) | `datasets/jam-actions-v0-public/evals/v0.5.0-execution-verification.json` |
| Sealed E3 baseline (measured on v0.4.3 records) | v0.4.3 deposit + git history (`git show jam-actions-v0-feature-marketed-2026-05-19:datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json`) |
| Records (JSONL) | `datasets/jam-actions-v0-public/records.jsonl` |
| Records (per-file JSON) | `datasets/jam-actions-v0-public/records/` |
| Piano-roll SVGs | `datasets/jam-actions-v0-public/pianoroll/` |
| 24-slice build arc docs | `docs/jam-actions-v0-slice*.md` |

The dataset card is also the published HuggingFace card — the YAML frontmatter at the top (license, language, task_categories, tags, configs) is what HF reads to register the dataset on its platform.
