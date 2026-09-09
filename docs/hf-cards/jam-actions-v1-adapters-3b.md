---
base_model:
  - Qwen/Qwen2.5-3B-Instruct
library_name: peft
tags:
  - lora
  - music
  - mcp
  - tool-use
  - chain-of-thought
datasets:
  - mcp-tool-shop/jam-actions-v1
  - mcp-tool-shop/jam-actions-v1-probe
---

# jam-actions-v1 adapters, 3B

Two LoRA adapters, one recipe at two seeds, on Qwen2.5-3B-Instruct, trained on jam-actions-v1
**1.1.0** — the four-draw corpus of the eleven verified songs (154 train / 59 test records, 96
acoustic training takes). Every number below is on a held-out split by song or on the never-trained
near-gate probe; the base model is reported on the same split; every seed that was run is reported.
**This is the record of the finding, not the path to build on:** the same recipe on
**Qwen3-4B-Instruct-2507 (Apache-2.0)** reaches the same numbers and is the recommended small adapter,
at [mcp-tool-shop/jam-actions-v1-qwen3-4b](https://huggingface.co/mcp-tool-shop/jam-actions-v1-qwen3-4b);
the tiny 1.5B option is at
[mcp-tool-shop/jam-actions-v1-qwen25-1.5b](https://huggingface.co/mcp-tool-shop/jam-actions-v1-qwen25-1.5b).
The 7B adapters trained on 1.0.0 are at
[mcp-tool-shop/jam-actions-v1-qwen25-7b](https://huggingface.co/mcp-tool-shop/jam-actions-v1-qwen25-7b).

## Why a 3B, and why only on 1.1.0

On jam-actions-v1 1.0.0 (48 acoustic training takes) the same recipe at the same two seeds reached
14/17 and 12/17 held out and 11/24 and 13/24 near the gate: it copied the numbers and kept the
format but did not lock the subtraction or the gate vocabulary. On the earlier 27-song working
corpus (~110 takes) it had locked both. Two explanations fit — take count or song count — and the
takes are synthetic, so 1.1.0 tests the first: four takes per (song, class) instead of two, every
other record identical. The 3B locks it. The limit was takes per song, not the number of songs.
Full account in the source repo's `experiments/coverage-v1-sft/RESULTS-r48.md`.

## Recipe

bf16 LoRA, r = 16, α = 32, dropout 0.1, on q/k/v/o/gate/up/down; lr 1.5e-4 cosine, 10 warmup
steps; effective batch 8 (1 × 8 accumulation); three epochs; max_seq_len 16,384 (each example
carries the full 54-tool catalogue, ~13.0–13.4k tokens); prompt-loss weight 0.1; chunked
cross-entropy. Predictions greedy, `max_new_tokens 128` (the shown-work line is 51–56 tokens).
Receipts beside each adapter carry the seed, data SHA-256, hyperparameters, package versions and
the loss curve.

## Adapters

| directory | base | seed | 1.1.0 held-out acoustic (36) | 1.0.0 held-out acoustic (17) | 1.0.0 overall (40) | near-gate probe (24) |
|---|---|---|---|---|---|---|
| `3b-4d-s13/` | Qwen2.5-3B-Instruct | 13 | **36/36** | **17/17** | **38/40** | **23/24** |
| `3b-4d-s42/` | Qwen2.5-3B-Instruct | 42 | **36/36** | **17/17** | 37/40 | **24/24** |

Base on the same splits: 13/36, 5/17, 20/40, 6/24. The 1.0.0 held-out takes are novel to these
adapters (same songs held out, different drawn values), so that column is the direct comparison
with the 1.0.0 adapters: 14/17 and 12/17 became 17/17 and 17/17.

Lines: on its own held-out takes seed 42 parses, copies both numbers and subtracts exactly on
36/36, and 17/17 on the 1.0.0 takes; seed 13 on 35/36 and 16/17. On the probe the subtraction is
exact on 22/24 and 19/24 (slips of 0.2–1.0 on the cents term), and the word follows the model's own
subtraction on every line of every set. No line on any set uses a gate word the corpus never used;
the 1.0.0 seed-42 adapter had invented five.

## What the adapters do and do not do

They write the comparison and then the label:

> `cents 66.9: |66.9| − 50 = 16.9, against the gate; onset −9.8: |9.8| − 40 = −30.2, inside: pitch_fail`

They were trained to compare against **these** gates (50 cents, 40 ms, chromatic ratio 0.2) in
**this** tool vocabulary, on eleven songs. They are not general graders.

## Licence

The adapters are released under CC-BY-SA-3.0-DE, matching the dataset they were trained on. Use of
a merged or adapted model is additionally governed by the base model's licence: **Qwen2.5-3B-Instruct
is under Alibaba's Qwen Research licence, which restricts commercial use.** If commercial use
matters, use the Qwen3-4B or 7B adapters, whose bases are Apache-2.0. Every adapter line we publish
carries at least one such base; a non-commercial base is reported as an option, never as the only path.

## Reproduce

Source repo `experiments/coverage-v1-sft/`: `scripts/train_v1_sft.py`, `scripts/predict_v1.py`,
`scripts/score_v1.mjs`, the run configs, `RESULTS-r48.md`; the corpus is `datasets/jam-actions-v1`
at 1.1.0 and formats to `data-4draw/`.
