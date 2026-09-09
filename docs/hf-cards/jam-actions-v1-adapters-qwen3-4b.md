---
base_model:
  - Qwen/Qwen3-4B-Instruct-2507
library_name: peft
license: cc-by-sa-3.0
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

# jam-actions-v1 adapters, Qwen3-4B — the small path

Two LoRA adapters, one recipe at two seeds, on **Qwen3-4B-Instruct-2507 (Apache-2.0)**, trained on
jam-actions-v1 **1.1.0** (the four-draw corpus of the eleven verified songs: 154 train / 59 test
records, 96 acoustic training takes). This is the recommended small adapter: the same numbers as
the 3B that found the result, on a base whose licence permits commercial use.

Every number below is on a held-out split by song or on the never-trained near-gate probe; the base
model is reported on the same split; every seed that was run is reported. The 7B adapters (also
Apache-2.0, trained on 1.0.0) are at
[mcp-tool-shop/jam-actions-v1-qwen25-7b](https://huggingface.co/mcp-tool-shop/jam-actions-v1-qwen25-7b);
the tiny 1.5B option at
[mcp-tool-shop/jam-actions-v1-qwen25-1.5b](https://huggingface.co/mcp-tool-shop/jam-actions-v1-qwen25-1.5b).

## Why this base

On 1.1.0 the recipe first locked the gate comparison at ~4B scale on Qwen2.5-3B-Instruct, whose
base licence (Qwen Research) forbids commercial use. That result is published for the record at
[mcp-tool-shop/jam-actions-v1-qwen25-3b](https://huggingface.co/mcp-tool-shop/jam-actions-v1-qwen25-3b)
and is not the path to build on. Qwen3-4B-Instruct-2507 is Apache-2.0 on its own card, renders the
corpus with the same span assertions on its own tokenizer, and reaches the same numbers. Source
repo `experiments/coverage-v1-sft/RESULTS-r52.md`.

## Recipe

bf16 LoRA, r = 16, α = 32, dropout 0.1, on q/k/v/o/gate/up/down; lr 1.5e-4 cosine, 10 warmup
steps; effective batch 8 (1 × 8 accumulation); three epochs; max_seq_len 16,384 (each example
carries the full 54-tool catalogue, ~13.0–13.3k tokens); prompt-loss weight 0.1; chunked
cross-entropy. Predictions greedy, `max_new_tokens 128`. Receipts beside each adapter carry the
seed, data SHA-256, hyperparameters, package versions and the loss curve.

## Adapters

| directory | seed | 1.1.0 held-out acoustic (36) | 1.0.0 held-out acoustic (17) | 1.0.0 overall (40) | near-gate probe (24) |
|---|---|---|---|---|---|
| `qwen3-4b-s13/` | 13 | **36/36** | **17/17** | **38/40** | **24/24** |
| `qwen3-4b-s42/` | 42 | **36/36** | **17/17** | **38/40** | 23/24 |

Base on the same splits: 12/36, 6/24. Seed 42 is exact on 36/36 of its own held-out lines and
22/24 on the probe; its one probe miss is a subtraction slip that crossed the gate. Lines, seed 13: 36/36 of its own held-out takes parse, copy
both numbers and subtract exactly; on the probe 24/24 parse, 22/24 exact (two slips on the cents
term that touch no label), and the word follows the model's own subtraction and the true
predicates on every line of every set.

## What the adapters do and do not do

They write the comparison and then the label:

> `cents 66.9: |66.9| − 50 = 16.9, against the gate; onset −9.8: |9.8| − 40 = −30.2, inside: pitch_fail`

They were trained to compare against **these** gates (50 cents, 40 ms, chromatic ratio 0.2) in
**this** tool vocabulary, on eleven songs. They are not general graders.

## Licence

The adapters are released under CC-BY-SA-3.0-DE, matching the dataset they were trained on. Use of
a merged or adapted model is additionally governed by the base model's licence, and here that is
**Apache-2.0**: this is the commercial-safe small directory. Every adapter line we publish carries
at least one such base; a non-commercial base is reported as an option, never as the only path.

## Reproduce

Source repo `experiments/coverage-v1-sft/`: `scripts/train_v1_sft.py`, `scripts/predict_v1.py`,
`scripts/score_v1.mjs`, `lora-config-q3-4b.json`, `RESULTS-r52.md`; the corpus is
`datasets/jam-actions-v1` at 1.1.0 (Zenodo 10.5281/zenodo.22679457).
