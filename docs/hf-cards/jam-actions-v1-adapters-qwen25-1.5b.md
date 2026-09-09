---
base_model:
  - Qwen/Qwen2.5-1.5B-Instruct
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

# jam-actions-v1 adapters, Qwen2.5-1.5B — the tiny option

Two LoRA adapters, one recipe at two seeds, on **Qwen2.5-1.5B-Instruct (Apache-2.0)**, trained on
jam-actions-v1 **1.1.0** (the four-draw corpus of the eleven verified songs). This is the smallest
model that learned the acoustic gate comparison from this corpus. It is an option for hardware
where 4B is too much; the recommended small path is
[mcp-tool-shop/jam-actions-v1-qwen3-4b](https://huggingface.co/mcp-tool-shop/jam-actions-v1-qwen3-4b),
and the 7B is at
[mcp-tool-shop/jam-actions-v1-qwen25-7b](https://huggingface.co/mcp-tool-shop/jam-actions-v1-qwen25-7b).

Every number below is on a held-out split by song or on the never-trained near-gate probe; the base
model is reported on the same split; every seed that was run is reported.

## Recipe

bf16 LoRA, r = 16, α = 32, dropout 0.1, on q/k/v/o/gate/up/down; lr 1.5e-4 cosine, 10 warmup
steps; effective batch 8 (1 × 8 accumulation); three epochs; max_seq_len 16,384; prompt-loss
weight 0.1; chunked cross-entropy. Predictions greedy, `max_new_tokens 128`. Receipts beside each
adapter carry the seed, data SHA-256, hyperparameters, package versions and the loss curve.

## Adapters

| directory | seed | 1.1.0 held-out acoustic (36) | 1.0.0 held-out acoustic (17) | 1.0.0 overall (40) | near-gate probe (24) |
|---|---|---|---|---|---|
| `qwen25-1.5b-s13/` | 13 | 34/36 | 15/17 | 33/40 | **24/24** |
| `qwen25-1.5b-s42/` | 42 | **36/36** | **17/17** | 36/40 | **24/24** |

Base on the same splits: 12/36, 6/24. **Read the shown work with care.** Both seeds get the label
right near the gate 24/24, but the subtraction they write is exact on only 19/24 (seed 13) and
10/24 (seed 42) of those lines: the word follows the model's own arithmetic, and that arithmetic
is often off by tenths. On its own held-out takes seed 42 is exact on 31/36. This is a model that
learned the decision better than the digits; the 4B and 7B write both correctly.
What the 1.5B does and does not reach, seed 13: near the
gate it is exact on 19 of 24 subtractions and right on all 24 labels; on its own held-out takes
34/36. Its held-out overall of 33/40 is the non-acoustic families — harmony 3/6 and key_moments
1/2 where the 4B has 6/6 and 1/2 — so it is a grader for the acoustic comparison, not for the rest
of the tool surface.

## What the adapters do and do not do

They write the comparison and then the label:

> `cents 66.9: |66.9| − 50 = 16.9, against the gate; onset −9.8: |9.8| − 40 = −30.2, inside: pitch_fail`

They were trained to compare against **these** gates (50 cents, 40 ms, chromatic ratio 0.2) in
**this** tool vocabulary, on eleven songs. They are not general graders.

## Licence

The adapters are released under CC-BY-SA-3.0-DE, matching the dataset they were trained on. Use of
a merged or adapted model is additionally governed by the base model's licence, and here that is
**Apache-2.0**.

## Reproduce

Source repo `experiments/coverage-v1-sft/`: `scripts/train_v1_sft.py`, `scripts/predict_v1.py`,
`scripts/score_v1.mjs`, `lora-config-1.5b.json`, `RESULTS-r52.md`; the corpus is
`datasets/jam-actions-v1` at 1.1.0 (Zenodo 10.5281/zenodo.22679457).
