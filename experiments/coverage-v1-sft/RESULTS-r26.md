# Coverage v1 — the comparison-line recipe on the 349-record corpus

Trained 2026-09-08 on a RunPod L40S (the Blackwell was out of stock), seed 13, the variant-A recipe
from `RESULTS-ab.md` unchanged: Qwen2.5-3B-Instruct, bf16 LoRA r16/α32, 1×8, cosine 1.5e-4, three
epochs, comparison line in the acoustic target. What changed is the corpus, chunks 24 and 26:
162 acoustic records (two draws per class per song), onsets on both sides of zero inside a
two-sided 40 ms gate, signed `pitch_fail`, timing-fail onsets drawn down toward the gate.
232 train / 117 test, split by song. The base is predicted once on the same prompts.

## The question and the answer

Does `pitch_fail` move off 2/9 when the onset varies, the band has both signs and the boundary is
twice as dense?

| condition | acoustic | overall |
|---|---|---|
| three-way floor | 18/54 | — |
| base, shared prompt | 20/54 | 54/117 |
| A epoch 2 | 44/54 | 96/117 |
| **A epoch 3** | **47/54** | **99/117** |

Base vs epoch 3 on acoustic: base-only 0, A-only 27, p ≈ 1.5e-8. Overall 0 vs 45. Epoch 3 over
epoch 2: 3 takes gained, none lost. All 54 comparison lines parse and all 54 copy both tool numbers
to the digit.

| gold | `match` | `pitch_fail` | `timing_fail` |
|---|---|---|---|
| match | **18** | 0 | 0 |
| pitch_fail | 7 | **11** | 0 |
| timing_fail | 0 | 0 | **18** |

`pitch_fail` went from 2/9 to 11/18. Every miss is `pitch_fail → match`.

## What the misses say

The seven misses are all **sharp**. Sorted by |cents|, with the word the model wrote for the
50-cent gate:

| cents | word | answer |
|---|---|---|
| 56.4 | inside | match |
| −57.6 | against | pitch_fail |
| 61.6 | inside | match |
| 64.9 | inside | match |
| 67.6 | against | pitch_fail |
| −70.8 | against | pitch_fail |
| −72.1 | against | pitch_fail |
| 74.8 | inside | match |
| −75.4 | against | pitch_fail |
| 77.5 | against | pitch_fail |
| −78.7 … −89.3 (5 takes) | against | pitch_fail |
| 86.7, 88.8, 90.0 | inside | match |

Flat: 9 of 9. Sharp: 2 of 9, and the two it gets are not the largest. **It writes `against` when it
sees a minus sign and `inside` otherwise, up to 90 cents.** That is a token it can read without
comparing anything, and it is a perfect rule in this corpus: negative cents occur in `pitch_fail`
(27 of 27 flat takes) and in no other class — `match` and `timing_fail` are positive on all 108.
Chunk 26 gave `pitch_fail` a sign and, in doing so, gave the model a shortcut for half the class.

So the honest reading of 47/54 is: timing 18/18 (onsets now vary, but non-timing magnitudes stop
at 21.4 and timing ones start at 59.9, so "big or small" still works), match 18/18, flat pitch_fail
9/9 by sign, sharp pitch_fail 2/9 — **the sharp side is the only place the model has to compare a
number to 50, and there it is where it was.**

## The rest

| family | base | epoch 3 |
|---|---|---|
| acoustic | 20/54 | **47/54** |
| chord | 0/7 | 7/7 |
| compare | 3/6 | 3/6 |
| ensemble | 0/3 | 3/3 |
| harmony | 7/14 | 7/14 |
| key_moments | 0/6 | 5/6 |
| measures | 9/9 | 9/9 |
| teaching_goals | 6/9 | 9/9 |
| transpose | 9/9 | 9/9 |
| **overall** | **54/117** | **99/117** |

Harmony is the majority class in both columns. Chord 0 → 7 is the base's prose compliance gap
closing, as in `RESULTS-ab.md`.

## Loss

10.2 → 2.10 (epoch 1) → 0.172 (epoch 2) → 0.110 (epoch 3). Higher than any earlier run's ~0.03:
twice the acoustic examples with a longer, more varied target are not memorised by epoch 2.

## Run facts

| | |
|---|---|
| GPU | NVIDIA L40S 46 GB; 87 steps at ~47 s, 68 min training |
| examples | 232 / 117; tokens min 13,035 / median 13,158 / max 13,382 of 16,384 |
| seed | 13 |
| receipts | `runs/r26/run-config-A.json`, `runs/r26/r26.log`; predictions for base, epoch 2, epoch 3 |
| cost | ~1.4 h at $0.79/hr ≈ $1.15; pod torn down by state-file id |

Adapter `runs/r26/A/epoch3` (126 MB) is on disk, not in git.

## Next

Make the sign uninformative: `match` and `timing_fail` takes draw a signed cents shift too, so
negative cents appear in every class. Then the only way to `against` on the pitch axis is |cents|
against 50. That is chunk 28. The onset gap (nothing measured between 21.4 and 59.9) is reported
in the same handoff as an open question about what "timing 18/18" is evidence of.
