---
base_model:
  - Qwen/Qwen2.5-3B-Instruct
  - Qwen/Qwen2.5-7B-Instruct
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
<!-- DRAFT until the r40 results block below is filled from experiments/coverage-v1-sft/RESULTS-r40.md. -->

# jam-actions-v1 adapters

Two LoRA adapters, one recipe, trained on the released eleven-song jam-actions-v1 corpus. Every
number below is on a held-out split by song or on the never-trained near-gate probe; the base model
is reported on the same split; every seed that was run is reported. Adapters trained during the
arc on earlier, unpublishable versions of the corpus are not published; their numbers are in the
source repo's `experiments/coverage-v1-sft/RESULTS*.md` as the record of how this recipe was found.

## Recipe

bf16 LoRA, r = 16, α = 32, dropout 0.1, on q/k/v/o/gate/up/down; lr 1.5e-4 cosine, 10 warmup
steps; effective batch 8 (1 × 8 accumulation); three epochs; max_seq_len 16,384 (each example
carries the full 54-tool catalogue, ~13.0–13.4k tokens); prompt-loss weight 0.1; chunked
cross-entropy. Predictions greedy, `max_new_tokens 128` (the shown-work line is 51–56 tokens).
Receipts beside each adapter carry the seed, data SHA-256, hyperparameters, package versions and
the loss curve.

## Adapters

| directory | base | seed | held-out acoustic | overall (40) | near-gate probe (24) |
|---|---|---|---|---|---|
| `3b-s13/` | Qwen2.5-3B-Instruct | 13 | __R40_3B_AC__ | __R40_3B_ALL__ | __R40_3B_PROBE__ |
| `7b-s13/` | Qwen2.5-7B-Instruct | 13 | __R40_7B_AC__ | __R40_7B_ALL__ | __R40_7B_PROBE__ |

Bases on the same splits: __R40_BASES__

Each is a single seed and is reported as one. On the earlier 349-record working corpus the same 3B
recipe was run at two seeds (54/54 and 54/54 held out; 70/72 and 72/72 on the 72-take probe), which
is the evidence that the recipe, not the seed, is doing the work.

## What the adapters do and do not do

They write the comparison and then the label:

> `cents 66.9: |66.9| − 50 = 16.9, against the gate; onset −9.8: |9.8| − 40 = −30.2, inside: pitch_fail`

Across every run of this recipe the line parses, the two numbers are copied from the tool result
exactly, and the word follows the model's own subtraction. What the arc established is narrow and,
we think, useful: the same 3B model at the same recipe learned nothing but a class prior from a bare
label, learned to read a sign from a worded comparison, and learned the comparison from the digits —
with identical loss curves in all three cases. If you fine-tune a small model to apply a rule, put
the rule's arithmetic in the target and test near the boundary.

They were trained to compare against **these** gates (50 cents, 40 ms, chromatic ratio 0.2) in
**this** tool vocabulary, on eleven songs. They are not general graders.

## Licence

The adapters are released under CC-BY-SA-3.0-DE, matching the dataset they were trained on. Use of
a merged or adapted model is additionally governed by the base model's licence, and the two bases
differ: **Qwen2.5-7B-Instruct is Apache-2.0; Qwen2.5-3B-Instruct is under Alibaba's Qwen Research
licence, which restricts commercial use.** If commercial use matters, use the 7B adapter.

## Reproduce

Source repo `experiments/coverage-v1-sft/`: `scripts/train_v1_sft.py`, `scripts/predict_v1.py`,
`scripts/score_v1.mjs`, the run configs, and `RESULTS-r40.md`.
