# Coverage v1, r52 — the small adapter on Apache-2.0 bases

Trained 2026-09-09 (UTC), the standing recipe (bf16 LoRA r16/α32, cosine 1.5e-4, 1×8, three epochs,
max_seq_len 16384, shown-work targets, `--max-new-tokens 128`), on jam-actions-v1 **1.1.0** (the
four-draw corpus, sft-train 154 / sft-test 59, sha `a558e79c…`). One question:

`RESULTS-r48.md` showed the 3B locks the gate comparison on 1.1.0 at two seeds. Its base,
Qwen2.5-3B-Instruct, is under the Qwen Research licence, which forbids commercial use, so that
adapter cannot be the small path anyone ships. Which permissively licensed base of similar size
does the same? Two candidates, both Apache-2.0 on their own cards (read from the Hub on
2026-09-09): **Qwen3-4B-Instruct-2507** and **Qwen2.5-1.5B-Instruct**. Both rendered every one of
the 154 examples with the span assertions intact on their own tokenizers (13.0–13.3k tokens, ~3,000
of headroom) before a weight was downloaded.

## Results, seed 13

| condition | base licence | four-draw test, acoustic (36) | 1.0.0 test, acoustic (17) | 1.0.0 overall (40) | probe (24) |
|---|---|---|---|---|---|
| Qwen2.5-1.5B base | Apache-2.0 | 12/36 | — | — | 6/24 |
| **Qwen2.5-1.5B, seed 13** | Apache-2.0 | 34/36 | 15/17 | 33/40 | **24/24** |
| Qwen3-4B base | Apache-2.0 | 12/36 | — | — | 6/24 |
| **Qwen3-4B-Instruct-2507, seed 13** | **Apache-2.0** | **36/36** | **17/17** | **38/40** | **24/24** |
| Qwen2.5-3B, seed 13 (`RESULTS-r48.md`) | Qwen Research | 36/36 | 17/17 | 38/40 | 23/24 |
| Qwen2.5-7B, seed 42, on 1.0.0 (`RESULTS-r48.md`) | Apache-2.0 | — | 17/17 | 38/40 | 24/24 |

Lines. Qwen3-4B: 36/36 of its own held-out takes parse, copy both numbers and subtract exactly;
on the probe 24/24 parse, 22/24 exact (two slips on the cents term of 0.1 and 2.2, neither touching
the label), and the word follows the model's own subtraction and the true predicates on every
line. Final loss 3.499, 60 steps at ~29 s. Qwen2.5-1.5B: 22/24 probe lines parse to the analyser
(the scorer's label-after-the-last-colon reads all 24 and all 24 are right), 19/24 exact; on its own
held-out takes 34/36 with the two misses in the non-acoustic families' neighbours — its held-out
overall is 33/40 because harmony (3/6) and key_moments (1/2) do not reach the 4B's 6/6 and 1/2.
Final loss 3.851, 60 steps at ~13 s.

## Results, seed 42

| condition | four-draw test, acoustic (36) | 1.0.0 test, acoustic (17) | 1.0.0 overall (40) | probe (24) |
|---|---|---|---|---|
| **Qwen3-4B-Instruct-2507, seed 42** | **36/36** | **17/17** | **38/40** | 23/24 |
| Qwen2.5-1.5B-Instruct, seed 42 | 36/36 | 17/17 | 36/40 | **24/24** |

Qwen3-4B seed 42: 36/36 parse, copy and subtract exactly on its own held-out takes; on the probe
24/24 parse and copy, 22/24 exact, and the one miss is a subtraction slip that crossed the gate
(the word followed the model's own arithmetic, as always). Held-out overall 38/40 with harmony 6/6
at both seeds. Same numbers as the 3B at two seeds, on an Apache-2.0 base: the small path is
replicated.

Qwen2.5-1.5B seed 42 beats seed 13 on labels (36/36 own held-out, 17/17, harmony 4/6, 36/40
overall, 24/24 near the gate) but its shown work is the weakest of any adapter in the arc: the
subtraction is exact on 10/24 probe lines and 31/36 held-out lines, off by tenths, with the word
still following the model's own (wrong) digits and landing on the right label. Final loss 3.854.
The 1.5B learned the decision better than the digits; it is published as the tiny option with that
sentence on its card, not as a grader whose shown work can be read.

## Reading

- **Qwen3-4B-Instruct-2507 is the small path.** Same recipe, same corpus, an Apache-2.0 base,
  and numbers equal to the 3B's on every set. It replaces the 3B as the recommended small adapter;
  the 3B stays published and reported as the finding that led here, with its licence stated.
- **Qwen2.5-1.5B-Instruct is a real tiny option** for the acoustic comparison alone: 24/24 near
  the gate from 1.5B parameters. It is not the grader for the other families.
- The rule that produced this run: the base licence is read first ([[always-a-publish-friendly-path]]
  in the advisor's memory; the same sentence is on every card). A non-commercial base is an
  option in the results, never the only path.

## Run facts

| | |
|---|---|
| pod, seed 13 | RunPod RTX PRO 6000 Blackwell Workstation Edition 96 GB, `7mmbi893f2hiw0`, $1.69/h, up 12:43–13:50 local; torn down by id, `list` empty |
| pod, seed 42 | RTX PRO 6000 Blackwell Server Edition, `xl4rk10qpe0qxy`, $1.69/h, up 14:00–15:02 local; torn down by id. Two pods before it were torn down within minutes: `72o1z2u2fcx342` on host 80.15.7.37 was power-capped (SM 615 of 3090 MHz, 132 s/step against 30), and the redeploy landed on the same host |
| first attempt | `vfjsc86gj9ybx3` on host 60.249.37.148 (L40S) handed a device with `torch.cuda.is_available()` false — the host `runpod.mjs` already names; torn down within minutes |
| data | four-draw `data-4draw/` sha `a558e79c…` (jam-actions-v1 1.1.0, Zenodo 10.5281/zenodo.22679457) |
| receipts | `runs/r52/run-config-A1.5b.json`, `run-config-A1.5bs42.json`, `run-config-Aq3-4b.json`, `run-config-Aq3-4bs42.json`; predictions for both bases and all four adapters on every set above |
| configs | `lora-config-1.5b.json`, `lora-config-q3-4b.json` — only `base_model` differs from `lora-config.json` |
| cost | seed 13 ~1.1 h ≈ $1.90; seed 42 ~1.0 h ≈ $1.70; three bad-host pods ≈ $0.40. ≈ $4.00 |
