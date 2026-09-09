# Coverage v1, rebuilt corpus — seed 13

Trained 2026-09-08 on a RunPod RTX PRO 6000 Blackwell. One seed. Held-out split: 90 records
across nine families, none of whose songs appear in training. This is the run on the corpus
*after* chunks 16, 18 and 20 — every family's gold varies, the acoustic prompt lies nowhere, and
the acoustic magnitudes vary within class so that the gates are the only rule that generalises.

`RESULTS.md` beside this file is the run on the pre-repair corpus and stays as that record.

## The question, and the answer

The corpus was rebuilt to ask one thing: **does an adapter beat one in three on acoustic takes
whose numbers it has never seen?**

| condition | acoustic |
|---|---|
| three-way floor | 9/27 |
| base model, fair prompt | 9/27 |
| LoRA epoch 3 | **10/27** |

**No.** Paired over the 27: base-only 3, LoRA-only 4, p = 1.0. One record above the floor is the
floor.

The confusion matrix says it more plainly than the score. Rows are gold, columns are what the
adapter said:

| gold | `match` | `pitch_fail` | `timing_fail` |
|---|---|---|---|
| match | **0** | 5 | 4 |
| pitch_fail | **0** | 5 | 4 |
| timing_fail | **0** | 4 | 5 |

It never says `match`, in 27 takes, with 18 `match` examples in training. And its split between the
two fail classes is 5/4 whatever the gold is. That is not a model reading `cents_from_target`
against a 50-cent gate and `onset_ms` against a 40-millisecond one. It is a model that learned
"answer one of the two fail words" and flips between them on something other than the numbers.

The base is no better in a different way: it says `timing_fail` on 25 of 27.

## The rest of the table

| family | fair base | LoRA | what happened |
|---|---|---|---|
| acoustic | 9/27 | 10/27 | above |
| harmony | 0/14 | **7/14** | says `verified` on all 14; gold is 7/7; that is the majority baseline exactly |
| compare | 0/6 | 2/6 | learned the two-token vocabulary, then guessed |
| chord, measures, transpose, teaching_goals | 34/34 | 34/34 | base at ceiling, unchanged |
| key_moments | 3/6 | 3/6 | unchanged |
| ensemble | 2/3 | 2/3 | unchanged |
| **overall** | **48/90** | **58/90** | paired 4 vs 14, p = 0.031 |

The +10 is nominally significant and it decomposes completely: harmony +7 (all of it the majority
class), compare +2, acoustic +1. **Every point is vocabulary or a class prior. Not one requires
reading a measurement.** Harmony is the same story as the first run with the other word: last time
it said `rejected` for everything, this time `verified`.

## What the loss curve says

9.7 → 1.13 at the end of epoch 1 → **0.041** at the end of epoch 2 → 0.032. Same shape as every run
on this arc: the training set is memorised by epoch 2. With 54 acoustic examples whose defining
numbers are continuous and unique per take, the model fit the pairs and learned no threshold.

## What this run establishes that the earlier ones could not

The first v1 run could be explained away: the corpus put the answer in the filename, the
measurements were constants per class, and the base was never given the vocabulary. All three are
gone. The tool-less baseline sits at the floor, the fair base sits at the floor, the numbers vary
within class, and the adapter still sits at the floor.

**So this is a result about the training recipe, not about the corpus.** A 3B model with a rank-16
LoRA, 54 examples, three epochs and a learning rate that reaches zero loss does not learn two
numeric thresholds from in-context measurements. That is a clean negative and it is the first one
on this arc that cannot be blamed on the data.

## Run facts

| | |
|---|---|
| base model | Qwen/Qwen2.5-3B-Instruct |
| GPU | RTX PRO 6000 Blackwell Server Edition, 96 GB, driver 580 |
| training | 1,472 s (24.5 min), 69 steps at ~22 s, 3 epochs |
| examples | 178 train / 90 test |
| tokens per epoch | 2,340,922, of which 14,800 assistant |
| loss | 9.7 → 1.13 → 0.041 → 0.032 |
| seed | 13 |
| protocol | `--terse` on both conditions; acoustic user turns also name the format in-corpus |
| cost | ~$1.55 on this pod at $1.69/hr; teardown by state-file id |

Adapter weights are not in git. The receipt beside the predictions carries the seed, data SHA-256,
every hyperparameter, package versions and the loss curve.

## Two things surfaced for the corpus, neither of which explains the result

- **Only the 81 acoustic user turns name their answer format.** Without the eval-time terse line the
  other families answer in prose and score 3/90. Every family's user turn should name its answer
  shape the way acoustic now does, so the eval-only instruction can go.
- **The measurements are 15-digit floats** — `55.03331486408949`. No real tool reports that, and it
  tokenises badly. Rounding to what the instrument resolves (0.1 cent, 0.1 ms) is a realistic tool
  output and a cheaper thing to read. It is not why the adapter failed — the difference between
  `55.0` and `0.03` is not a tokenisation problem — but it should be fixed before the next run so
  it cannot be blamed.

## What comes next is a training question

Another seed will not change this. The levers are on the model side: more acoustic examples, a
higher rank, fewer epochs with a lower ceiling on the loss, or an explicit intermediate step in the
assistant turn — "cents 55.0 against a 50-cent gate: pitch_fail" — that makes the rule visible in
the target rather than asking the model to infer it from the label alone. That last one changes the
corpus's assistant turns, not its prompt-visible content, and it is the one I would try first.
