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
<!-- DRAFT against the 27-song corpus. Superseded by docs/findings/v1-provenance-audit.md (2026-09-09): the publishable set is 15 songs. Rewritten before any publish; do not upload this text. -->

# jam-actions-v1 adapters

Four LoRA adapters, one recipe, trained during the jam-actions-v1 arc. Every number below is on a
held-out split by song or on the never-trained near-gate probe; the base model is reported on the
same split; every seed that was run is reported.

## Recipe

bf16 LoRA, r = 16, α = 32, dropout 0.1, on q/k/v/o/gate/up/down; lr 1.5e-4 cosine, 10 warmup
steps; effective batch 8 (1 × 8 accumulation); three epochs; max_seq_len 16,384 (each example
carries the full 54-tool catalogue, ~13.1–13.4k tokens); prompt-loss weight 0.1; chunked
cross-entropy. Predictions greedy, `max_new_tokens 128` (the shown-work line is 51–56 tokens).
Receipts beside each adapter carry the seed, data SHA-256, hyperparameters, package versions and
the loss curve.

## Adapters

| directory | base | corpus | seed | held-out acoustic | overall | near-gate probe |
|---|---|---|---|---|---|---|
| `3b-s13-349/` | Qwen2.5-3B-Instruct | 349 (acoustic shown-work) | 13 | 54/54 | 103/117 | 70/72 |
| `3b-s42-349/` | Qwen2.5-3B-Instruct | 349 | 42 | 54/54 | 105/117 | 72/72 |
| `7b-s13-349/` | Qwen2.5-7B-Instruct | 349 | 13 | 54/54 | 107/117 | 72/72 |
| `3b-s13-371/` | Qwen2.5-3B-Instruct | **371 (release)** | 13 | **54/54** | **116/117** | **72/72** |

Bases on the same splits: 3B 20/54 acoustic, 55/117 overall on the 349 split; 23/54 and 66/117 on
the 371 split; 20/72 on the probe. 7B 18/54, 68/117, 36/72.

The claim, stated the way the source repo states it: **on the 349 corpus the 3B result is the mean
of two seeds — 54/54 held out, 71/72 on the probe — not the better seed; the 7B and the 371-corpus
adapter are single seeds and are reported as such.**

## What the adapters do and do not do

They write the comparison and then the label:

> `cents 66.9: |66.9| − 50 = 16.9, against the gate; onset −9.8: |9.8| − 40 = −30.2, inside: pitch_fail`

Across every run the line parses, the two numbers are copied from the tool result exactly, and the
word follows the model's own subtraction — 100 % of the time. The subtraction itself is exact on the
value that decides the class in every case but two (a 3B seed-13 miss at −48.0 cents, written
`−2.0` and then called `against`); the slips that remain are on carrier values where the sign is not
in doubt.

They were trained to compare against **these** gates (50 cents, 40 ms, chromatic ratio 0.2) in
**this** tool vocabulary. They are not general graders, and the 116/117 is on 117 records from
nine songs. What the arc established is narrower and, we think, more useful: the same 3B model at
the same recipe learned nothing but a class prior from a bare label, learned to read a sign from a
worded comparison, and learned the comparison from the digits — with identical loss curves in all
three cases. If you fine-tune a small model to apply a rule, put the rule's arithmetic in the target
and test near the boundary.

## Licence

The adapters are released under CC-BY-SA-3.0-DE, matching the dataset they were trained on. Use of
the merged or adapted model is additionally governed by the base model's licence — see the Qwen2.5
model pages for the 3B and 7B terms, which differ.

## Reproduce

Source repo `experiments/coverage-v1-sft/`: `scripts/train_v1_sft.py`, `scripts/predict_v1.py`,
`scripts/score_v1.mjs`, the run configs, and `RESULTS-r32.md` / `RESULTS-r34.md`.
