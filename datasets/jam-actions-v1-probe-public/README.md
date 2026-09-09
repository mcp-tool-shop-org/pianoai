---
license: cc-by-sa-3.0
language:
  - en
pretty_name: "AI Jam Sessions — v1 near-gate probe (evaluation only)"
pretty_description: "24 acoustic takes on jam-actions-v1's three held-out songs, each measured within 10 ms or 5 cents of a grading gate, both signs of both quantities. Never split, never trained on. Distinguishes a model that compares a measurement to a gate from one that reads a sign."
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

# jam-actions-v1-probe

**Schema:** `jam-actions-v1-probe/1.0.0` · **Records:** 24, all `split: test` · **Evaluation only** ·
**Companion to:** [jam-actions-v1](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v1)

## Why it exists

An adapter trained on an earlier version of the corpus scored 47/54 on held-out acoustic takes.
Its completions, which state the comparison before the label, showed that it wrote `against a
50-cent gate` whenever it saw a minus sign — and negative cents occurred in exactly one class of that
corpus. The main split could not separate "compares |cents| to 50" from "reads the sign", because
nothing in it measured near a gate. This set does.

## What it contains

Three held-out songs (solace, the-easy-winners, the-entertainer) × four bands × both signs:

| band | measured | gold |
|---|---|---|
| `onset_in` | \|onset\| ≈ 30 ms (±8), cents ≈ 20 | `match` |
| `onset_out` | \|onset\| ≈ 50 ms (±8), cents ≈ 20 | `timing_fail` |
| `cents_in` | \|cents\| ≈ 45 (±3), onset ≈ 2 ms | `match` |
| `cents_out` | \|cents\| ≈ 55 (±3), onset ≈ 2 ms | `pitch_fail` |

Gold is derived from the two-sided predicates (`|onset| > 40`, `|cents| ≥ 50`) on the measured
values, never from the intended band. Same record shape, same tools, same opaque take paths, same
shown-work assistant turn as the main corpus. The takes were found by searching explicit applied
delays and cents shifts; `applied.json` records what was applied and what it measured.

## What it measured

On the 72-take version of this probe built over nine held-out songs of the earlier working corpus
(the same bands, the same tolerances):

| adapter (Qwen2.5, rank-16 LoRA, same recipe) | onset_in | onset_out | cents_in | cents_out | total |
|---|---|---|---|---|---|
| 3B base, no adapter | 6/18 | 1/18 | 8/18 | 5/18 | 20/72 |
| 3B, worded-comparison target | 10/18 | 9/18 | 18/18 | 0/18 | 38/72 |
| 3B, arithmetic target (seed 13 / 42) | 18/18 | 18/18 | 16–18/18 | 18/18 | 70–72/72 |
| 7B, arithmetic target | 18/18 | 18/18 | 18/18 | 18/18 | 72/72 |

The worded-comparison adapter wrote `inside` for every negative onset (−56.2 ms included) and
`against` for nearly every positive one (25.1 ms included). The arithmetic adapters write
`|56.2| − 40 = 16.2, against` and `|25.1| − 40 = −14.9, inside`.

On this 24-take release, with adapters trained on the eleven-song corpus (106 train records, ~45 acoustic takes):

| adapter | onset_in | onset_out | cents_in | cents_out | total |
|---|---|---|---|---|---|
| 3B base | 2/6 | 0/6 | 3/6 | 1/6 | 6/24 |
| 3B, arithmetic target, seed 13 | 4/6 | 0/6 | 3/6 | 4/6 | 11/24 |
| 3B, arithmetic target, seed 42 | 6/6 | 0/6 | 6/6 | 1/6 | 13/24 |
| 7B base | 6/6 | 0/6 | 6/6 | 0/6 | 12/24 (says `match` to everything) |
| **7B, arithmetic target** | **6/6** | **6/6** | **6/6** | **6/6** | **24/24** |

The 3B, which learned the comparison from ~110 takes on the earlier corpus, does not lock it from
~45: the subtraction is right on 7 of 24 (seed 13) and the gate vocabulary drifts (seed 42). The 7B
learns it from the same 45: 24/24 parse, 24/24 copy the numbers, 22/24 subtractions exact, and the
word follows the arithmetic every time.

Tool-less baseline (user turn only, mistral-small:24b) on the earlier 72: 18/72, below the
three-way floor.

## Rules

Never merge these records into a training set. Never split them. If you train on the companion
corpus and report on this set, say which seed and report every seed.

## Licence and citation

As jam-actions-v1: CC-BY-SA-3.0-DE for the records (see `LICENSE-DATASET.md`); the compositions are
public domain and the three arrangements are the Mutopia Project's public-domain typesettings. Cite
the concept DOI `10.5281/zenodo.20279918` and name the version.
