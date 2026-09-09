# Coverage v1 — digits in the target: 3B and 7B, main split and near-gate probe

Trained 2026-09-09 (UTC) on one RunPod RTX PRO 6000 Blackwell (96 GB), seed 13 both, the standing
recipe (bf16 LoRA r16/α32, cosine 1.5e-4, 1×8, three epochs, max_seq_len 16384) on the chunk-32
corpus: 349 records, 232/117 by song, where the acoustic assistant turn shows the subtraction before
the word —

> cents 66.9: |66.9| − 50 = 16.9, against the gate; onset −9.8: |9.8| − 40 = −30.2, inside: pitch_fail

Two adapters: Qwen2.5-3B-Instruct, and Qwen2.5-7B-Instruct with only the base model changed
(`lora-config-7b.json`). Each base is predicted once on the same prompts. Every prediction pass in
this run uses `--max-new-tokens 128`: the arithmetic line is 51–56 tokens and the predictor's 48
default cut every completion before the label (the first 3B pass scored 0/54 that way and was
discarded; nothing else changed).

`RESULTS-probe.md` is the previous state of the arc: the same recipe with a worded comparison line
learned no threshold and read signs instead.

## Main split — 54 held-out acoustic takes

| condition | acoustic | overall |
|---|---|---|
| three-way floor | 18/54 | — |
| 3B base | 20/54 | 55/117 |
| 7B base | 18/54 | 68/117 |
| r28 adapter — 3B, worded comparison, sign uninformative | 38/54 | 92/117 |
| **3B, arithmetic target** | **54/54** | **103/117** |
| **7B, arithmetic target** | **54/54** | **107/117** |

3B base vs 3B adapter: 0 vs 34, p ≈ 10⁻¹⁰. 7B base vs 7B adapter: 0 vs 36, p ≈ 10⁻¹¹. Confusion
matrices are diagonal for both — 18/18 in each class.

## Near-gate probe — 72 takes within 10 ms or 5 cents of a gate, never trained on

| condition | onset_in (±30) | onset_out (±50) | cents_in (±45) | cents_out (±55) | total |
|---|---|---|---|---|---|
| 3B base | 6/18 | 1/18 | 8/18 | 5/18 | 20/72 |
| 7B base | 18/18 | 0/18 | 18/18 | 0/18 | 36/72 (says `match` to everything) |
| r26 / r28 adapters (worded comparison) | 10–11/18 | 9/18 | 9–18/18 | 0–9/18 | 37–38/72 |
| **3B, arithmetic target** | **18/18** | **18/18** | 16/18 | **18/18** | **70/72** |
| **7B, arithmetic target** | **18/18** | **18/18** | **18/18** | **18/18** | **72/72** |

3B base vs 3B adapter on the probe: 0 vs 50, p ≈ 10⁻¹⁵. 7B: 0 vs 36.

## What the lines say

Every adapter completion is legible, and this time the arithmetic is the thing being read:

| | 3B main | 3B probe | 7B main | 7B probe |
|---|---|---|---|---|
| lines that parse | 52/54 (2 format variants, both correct) | 64/72 (8 variants, all correct) | 54/54 | 72/72 |
| both numbers copied | all parsed | all parsed | 54/54 | 72/72 |
| subtraction exact | 51/52 | 60/64 | 53/54 | 68/72 |
| word follows the model's own arithmetic | 52/52 | 64/64 | 54/54 | 72/72 |
| word follows the true predicate | 52/52 | 64/64 | 54/54 | 72/72 |

The subtraction slips are all on the *carrier* value of a probe take — `|20.1| − 50` written as
−30.1 (3B) or −30.9 (7B) instead of −29.9 — where the sign, and so the word, is not in doubt. On the
value that decides the class the arithmetic is right in every case but two: the 3B's two misses are
both `−48.0 → |48.0| − 50 = −2.0` followed by `against` — the subtraction correct, the word wrong,
two cents from the gate. The 7B has no such case.

On the onset bands, the takes that broke every earlier adapter — −56.2 written as "inside", 25.1 as
"against" — now read `|56.2| − 40 = 16.2, against` and `|25.1| − 40 = −14.9, inside`, 18 of 18 in
each band, for both sizes.

## The rest of the table

| family | 3B base | 3B adapter | 7B base | 7B adapter |
|---|---|---|---|---|
| acoustic | 20/54 | 54/54 | 18/54 | 54/54 |
| chord | 1/7 | 7/7 | 7/7 | 7/7 |
| compare | 3/6 | 2/6 | 3/6 | 3/6 |
| ensemble | 0/3 | 1/3 | 3/3 | 3/3 |
| harmony | 7/14 | 7/14 | 7/14 | 9/14 |
| key_moments | 0/6 | 5/6 | 3/6 | 4/6 |
| measures | 9/9 | 9/9 | 9/9 | 9/9 |
| teaching_goals | 6/9 | 9/9 | 9/9 | 9/9 |
| transpose | 9/9 | 9/9 | 9/9 | 9/9 |
| **overall** | **55/117** | **103/117** | **68/117** | **107/117** |

Harmony sits at the majority class for every 3B condition and moves to 9/14 only for the 7B adapter;
compare stays at 2–3 of 6 everywhere. Those two families' targets are still a bare label — the same
shape that failed on acoustic for five runs.

## Loss

3B: 10.24 → 2.16 → 0.178 → 0.112 — indistinguishable from r26 and r28. 7B: 9.69 → 0.61 → 0.151 →
0.097. The 3B's curve did not change between "reads the sign" and "computes the comparison"; the
loss never said which it was doing. The probe did.

## Run facts

| | |
|---|---|
| GPU | RTX PRO 6000 Blackwell Server Edition, 96 GB |
| 3B | 87 steps at ~22 s, 32 min |
| 7B | 87 steps at ~34 s, 50 min |
| examples | 232 / 117, plus the 72-take probe; tokens min 13,035 / median 13,179 / max 13,382 |
| predictions | `--max-new-tokens 128` throughout |
| receipts | `runs/r32/run-config-A3.json`, `run-config-A7.json`, `r32-stage1.log`, `r32-stage2.log` |
| adapters | `runs/r32/A3/epoch3` (126 MB), `runs/r32/A7/epoch3` (165 MB) — on disk, not in git |
| cost | ~1.9 h at $1.69/hr ≈ $3.25; torn down by state-file id, `list` empty |

## What this settles

Seven training runs on this arc, one recipe. With a bare label the adapter learned a class prior.
With a worded comparison it learned the format, copied the numbers, and filled the word from
whichever single-token cue the corpus correlated with a class — and the near-gate probe showed both
gates unlearned. With the digits of the comparison in the target, the same 3B model at the same rank,
learning rate and epoch count compares both measurements against both gates on takes it has never
seen, including takes ten milliseconds and five cents from the gate, and the 7B does it without a
miss.

The corpus never changed what the model was shown. It changed what the model was asked to write.
