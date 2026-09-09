---
license: cc-by-sa-3.0
language:
  - en
pretty_name: "AI Jam Sessions — v1 near-gate probe (evaluation only)"
pretty_description: "72 acoustic takes on jam-actions-v1's nine held-out songs, each measured within 10 ms or 5 cents of a grading gate, both signs of both quantities. Never split, never trained on. Distinguishes a model that compares a measurement to a gate from one that reads a sign."
size_categories:
  - n<1K
task_categories:
  - other
tags:
  - music
  - audio
  - mcp
  - tool-use
  - evaluation
configs:
  - config_name: default
    data_files:
      - split: test
        path: records.jsonl
---
<!-- DRAFT against the 27-song corpus. Superseded by docs/findings/v1-provenance-audit.md (2026-09-09): the publishable set is 15 songs. Rewritten before any publish; do not upload this text. -->

# jam-actions-v1-probe

**Schema:** `jam-actions-v1-probe/1.0.0` · **Records:** 72, all `split: test` · **Evaluation only** ·
**Companion to:** [jam-actions-v1](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v1)

## Why it exists

An adapter trained on jam-actions-v1's predecessor scored 47/54 on held-out acoustic takes. Its
completions, which state the comparison before the label, showed that it wrote `against a 50-cent
gate` whenever it saw a minus sign — and negative cents occurred in exactly one class of that corpus.
The main split could not separate "compares |cents| to 50" from "reads the sign", because nothing in
it measured near a gate. This set does.

## What it contains

Nine held-out songs × four bands × both signs:

| band | measured | gold |
|---|---|---|
| `onset_in` | \|onset\| 25.1–33.0 ms, cents ≈ 20 | `match` |
| `onset_out` | \|onset\| 48.3–56.2 ms, cents ≈ 20 | `timing_fail` |
| `cents_in` | \|cents\| 42.0–48.0, onset 1.9 ms | `match` |
| `cents_out` | \|cents\| 52.0–58.0, onset 1.9 ms | `pitch_fail` |

Tolerance ±8 ms / ±3 cents around targets of 30, 50, 45 and 55. Gold is derived from the two-sided
predicates (`|onset| > 40`, `|cents| ≥ 50`) on the measured values, never from the intended band.
Same record shape, same tools, same opaque take paths, same shown-work assistant turn as the main
corpus. The takes were found by searching explicit applied delays and cents shifts; `applied.json`
records what was applied and what it measured.

## What it measured

| adapter (Qwen2.5, rank-16 LoRA, same recipe) | onset_in | onset_out | cents_in | cents_out | total |
|---|---|---|---|---|---|
| 3B base, no adapter | 6/18 | 1/18 | 8/18 | 5/18 | 20/72 |
| 3B, worded-comparison target | 10/18 | 9/18 | 18/18 | 0/18 | 38/72 |
| 3B, arithmetic target (seed 13 / 42) | 18/18 | 18/18 | 16–18/18 | 18/18 | 70–72/72 |
| 3B, arithmetic target, on the 371-record release | 18/18 | 18/18 | 18/18 | 18/18 | **72/72** |
| 7B, arithmetic target | 18/18 | 18/18 | 18/18 | 18/18 | **72/72** |

The worded-comparison adapter wrote `inside` for every negative onset (−56.2 ms included) and
`against` for nearly every positive one (25.1 ms included). The arithmetic adapters write
`|56.2| − 40 = 16.2, against` and `|25.1| − 40 = −14.9, inside`.

Tool-less baseline (user turn only, mistral-small:24b): 18/72, below the three-way floor.

## Rules

Never merge these records into a training set. Never split them. If you train on the companion
corpus and report on this set, say which seed and report every seed.

## Licence and citation

As jam-actions-v1: CC-BY-SA-3.0-DE for the records; the compositions are public domain. Cite the
concept DOI `10.5281/zenodo.20279918` and name the version.
