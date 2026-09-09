---
base_model:
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

# jam-actions-v1 adapters

Two LoRA adapters, one recipe at two seeds, trained on the released eleven-song jam-actions-v1 corpus. Every number below is
on a held-out split by song or on the never-trained near-gate probe; the base model is reported on
the same split; every seed that was run is reported — including the two 3B seeds that are **not**
published, because on this corpus the 3B does not learn the comparison. Adapters trained during the
arc on earlier, unpublishable versions of the corpus are not published either; their numbers are in
the source repo's `experiments/coverage-v1-sft/RESULTS*.md` as the record of how this recipe was
found.

## Recipe

bf16 LoRA, r = 16, α = 32, dropout 0.1, on q/k/v/o/gate/up/down; lr 1.5e-4 cosine, 10 warmup
steps; effective batch 8 (1 × 8 accumulation); three epochs; max_seq_len 16,384 (each example
carries the full 54-tool catalogue, ~13.0–13.4k tokens); prompt-loss weight 0.1; chunked
cross-entropy. Predictions greedy, `max_new_tokens 128` (the shown-work line is 51–56 tokens).
Receipts beside each adapter carry the seed, data SHA-256, hyperparameters, package versions and
the loss curve.

## Adapters

| directory | base | seed | held-out acoustic | overall (40) | near-gate probe (24) | published |
|---|---|---|---|---|---|---|
| `7b-s13/` | Qwen2.5-7B-Instruct | 13 | **16/17** | **37/40** | **24/24** | **yes** |
| `7b-s42/` | Qwen2.5-7B-Instruct | 42 | **17/17** | **38/40** | **24/24** | **yes** |
| — | Qwen2.5-3B-Instruct | 13 | 14/17 | 32/40 | 11/24 | no |
| — | Qwen2.5-3B-Instruct | 42 | 12/17 | 32/40 | 13/24 | no |
| — | Qwen2.5-3B-Instruct, four-draw corpus, seed 13 | 13 | 17/17 | 38/40 | 23/24 | not yet |
| — | Qwen2.5-3B-Instruct, four-draw corpus, seed 42 | 42 | 17/17 | 37/40 | 24/24 | not yet |

Bases on the same splits: 7B 7/17, 29/40, 12/24 (it says `match` to every probe take); 3B 5/17,
20/40, 6/24. The three-way floor is 5.7/17 and 8/24.

The two 7B seeds agree on every probe take (both 24/24, both exact on 21–22 of 24 subtractions, sharing the same rounding slip on one take) and differ by one held-out take; the shipped result replicates. The 3B rows are the reason the 3B trained on this corpus is not published:
with ~45 acoustic training takes the 3B copies the numbers and keeps the format but does not lock
the subtraction (seed 13: exact on 7 of 24 probe takes) or the gate vocabulary (seed 42 invents
"within", "beyond", "behind"). On the earlier 349-record working corpus the same 3B recipe was run
at two seeds (54/54 and 54/54 held out; 70/72 and 72/72 on the 72-take probe), which is the
evidence that the recipe, not the seed, was doing the work there — and that the difference here is
the size of the verified corpus. The last two rows say which size: a four-draw corpus of the **same
eleven songs** (96 acoustic training takes instead of 48, every other record identical) brings the
3B to 17/17 held out and 23/24 and 24/24 near the gate at two seeds, with no invented gate word.
The limit was the number of takes per song, not the number of songs. Those adapters are not
published yet because the corpus they were trained on is not: it will be jam-actions-v1 1.1.0 when
it is, and they follow it. Source repo `experiments/coverage-v1-sft/RESULTS-r48.md`.

## What the adapters do and do not do

They write the comparison and then the label:

> `cents 66.9: |66.9| − 50 = 16.9, against the gate; onset −9.8: |9.8| − 40 = −30.2, inside: pitch_fail`

Across every run of this recipe the line parses, the two numbers are copied from the tool result
exactly, and the word follows the model's own subtraction. What the arc established is narrow and,
we think, useful: the same 3B model at the same recipe learned nothing but a class prior from a bare
label, learned to read a sign from a worded comparison, and learned the comparison from the digits —
with identical loss curves in all three cases. If you fine-tune a small model to apply a rule, put
the rule's arithmetic in the target and test near the boundary.

It was trained to compare against **these** gates (50 cents, 40 ms, chromatic ratio 0.2) in
**this** tool vocabulary, on eleven songs. It is not a general grader.

## Licence

The adapters are released under CC-BY-SA-3.0-DE, matching the dataset they were trained on. Use of
a merged or adapted model is additionally governed by the base model's licence, and the two bases
differ: **Qwen2.5-7B-Instruct is Apache-2.0; Qwen2.5-3B-Instruct is under Alibaba's Qwen Research
licence, which restricts commercial use.** If commercial use matters, use this 7B, or the small path on
Qwen3-4B-Instruct-2507 (Apache-2.0) at
[mcp-tool-shop/jam-actions-v1-qwen3-4b](https://huggingface.co/mcp-tool-shop/jam-actions-v1-qwen3-4b).
Every adapter line we publish carries at least one permissively licensed base.

## Reproduce

Source repo `experiments/coverage-v1-sft/`: `scripts/train_v1_sft.py`, `scripts/predict_v1.py`,
`scripts/score_v1.mjs`, the run configs, and `RESULTS-r40.md`.
