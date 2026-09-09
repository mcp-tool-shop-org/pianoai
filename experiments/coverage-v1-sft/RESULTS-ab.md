# Coverage v1, side by side — comparison line vs bare label in the acoustic target

Trained 2026-09-08 on one RunPod RTX PRO 6000 Blackwell, back to back, seed 13 both. Same 178/90
split, same base, same recipe, same prompts. The two corpora differ in exactly one place: the last
assistant turn of the 81 acoustic records (diff over every leaf of every record: 81 differing
leaves, all at `target_trace.session[4].content`).

- **A** — the committed corpus: `cents 56.4 against a 50-cent gate, onset -9.8 ms inside 40: pitch_fail`
- **B** — `writeV1Corpus(dir, { acousticBareLabel: true })`: `pitch_fail`

The base is predicted once; its prompt is identical under both variants. Scoring is exact match on
the label after the final colon, base and adapters alike. Raw completions are saved beside the
predictions.

`RESULTS.md` is the pre-repair run; `RESULTS-v20.md` is the rebuilt corpus with a bare label.

## The question and the answer

Does the rule-in-target variant beat the floor where the bare-label one did not?

| condition | acoustic | overall |
|---|---|---|
| three-way floor | 9/27 | — |
| base, shared prompt | 10/27 | 44/90 |
| B: bare label | 12/27 | 63/90 |
| **A: comparison line** | **20/27** | **70/90** |

**Yes.** A against the base on acoustic: base-only 3, A-only 13, p = 0.021. A against B: B-only 1,
A-only 9, p = 0.021. B against the base: 8 vs 10, p = 0.8 — B is the floor again. A against the v20
adapter (bare label, previous pod, same split): 4 vs 14, p = 0.031.

B does what the v20 adapter did with a different word: `timing_fail` on 22 of 27 takes, `match`
once. A bare label trained to zero loss on 54 examples gives a class prior, not a rule.

## What the comparison line lets us see

All 27 of A's lines parse as `cents N <word> …, onset M ms <word>: <label>`, and on all 27 the two
numbers are the tool result to the digit. So the misses can be read:

| gold | correct | the miss |
|---|---|---|
| match | 9/9 | — |
| timing_fail | 9/9 | — |
| pitch_fail | **2/9** | `cents 84.7 inside a 50-cent gate, onset -9.8 ms inside 40: match` |

Per take, pitch_fail cents against what A wrote: 56.4 inside, 59.1 inside, 65.8 inside, 68.5 inside,
70.0 inside, **72.5 against**, **76.6 against**, 82.0 inside, 84.7 inside. Not a boundary effect.
On the pitch axis the model copies the number and then writes `inside` seven times in nine. It has
learned the shape of the rule and the copy; it has not learned the comparison against 50.

The timing 9/9 is worth less than it looks, and this is the corpus item for the next chunk. **Onset
is exactly −9.8 ms on every non-timing take** — 36 of 36 in training, 18 of 18 held out. Timing-fail
onsets are 59.9–385 ms in training and 118–350 ms held out, against a 40 ms gate. Nothing in the data
asks the model to read an onset that is inside the gate and varies; "onset is not −9.8" scores 9/9.
Chunk 20 varied the cents within class and left the onset at the clean render's tracker bias.

Also: every pitch_fail is sharp. `cents_from_target` is positive on all 36. No flat take exists.

## Ranges the model saw

| class | n train | cents train | onset train | n test | cents test | onset test |
|---|---|---|---|---|---|---|
| match | 18 | 2.1–43.4 | −9.8 (1 value) | 9 | 3.5–45.0 | −9.8 (1 value) |
| pitch_fail | 18 | 55.0–90.1 | −9.8 (1 value) | 9 | 56.4–84.7 | −9.8 (1 value) |
| timing_fail | 18 | 1.9–45.5 | 59.9–385 (18 values) | 9 | 3.5–43.4 | 118–350 (9 values) |

## The rest of the table

| family | base | B | A |
|---|---|---|---|
| acoustic | 10/27 | 12/27 | **20/27** |
| chord | 0/7 | 7/7 | 7/7 |
| compare | 3/6 | 3/6 | 2/6 |
| ensemble | 1/3 | 3/3 | 3/3 |
| harmony | 7/14 | 7/14 | 6/14 |
| key_moments | 0/6 | 4/6 | 5/6 |
| measures | 8/9 | 9/9 | 9/9 |
| teaching_goals | 6/9 | 9/9 | 9/9 |
| transpose | 9/9 | 9/9 | 9/9 |
| **overall** | **44/90** | **63/90** | **70/90** |

A against B overall: 4 vs 11, p = 0.12 — the overall gap is the acoustic gap. Harmony is the
majority class in every column (7/14 = all `verified`; A's 6 is one flip).

**The base's chord 0/7 is a compliance gap, not a knowledge gap.** With the eval-time terse line
gone (chunk 22), the base names the correct chord on all 7 records and writes it in a sentence —
*"The left hand is playing a Dm chord in measure 1 of …"* — against gold `Dm`. Same on key_moments.
The in-record "Answer with the chord symbol alone" does not get a 3B base to comply. Both adapters
close it (7/7). It lowers the fair base from 48/90 (v20, terse line) to 44/90 and does not touch the
acoustic comparison, whose prompts are byte-identical to v20's.

## Loss curves

Both variants: ~9.7 → ~1.1 at the end of epoch 1 → ~0.034 at epoch 2 → ~0.024 at epoch 3. Memorised
by epoch 2, as every run on this arc. The difference between 12/27 and 20/27 is not the fit; it is
what was fitted.

## Run facts

| | |
|---|---|
| base model | Qwen/Qwen2.5-3B-Instruct |
| GPU | RTX PRO 6000 Blackwell Server Edition, 96 GB, driver 580 |
| training | 24.5 min each, 69 steps at ~17 s, 3 epochs |
| examples | 178 train / 90 test, both variants |
| max_seq_len | 16384; tokens min 13,035 / median 13,157 / max 13,382 |
| seed | 13, both |
| order | base predictions → train A → predict A → train B → predict B |
| pod | `coverage-v1-ab-…`, up 18:06, down after fetch; ~1.3 h at $1.69/hr ≈ $2.20 |
| receipts | `runs/ab/run-config-A.json`, `run-config-B.json`, `ab.log` |

Adapter weights are not in git (`runs/ab/A/epoch3`, `runs/ab/B/epoch3`, 126 MB each, on disk).
`data-bare/` is the formatted SFT set for B, produced from the bare-label corpus by
`V1_RECORDS=<bare>/records.jsonl V1_OUT=experiments/coverage-v1-sft/data-bare pnpm exec tsx
experiments/coverage-v1-sft/format-sft.ts`.

## What comes next is a corpus question again — but a narrow one

The recipe is unchanged and it now beats the floor, so the negative in `RESULTS-v20.md` was about
the target, not the model. What the model still cannot do — compare cents to 50 — sits next to two
things the corpus never made it do: read a varying onset inside the gate, and meet a flat take. Vary
the onset on non-timing takes, bring timing-fail onsets down toward the gate, draw the sign on
pitch_fail, and put two draws per class per song so the band near 50 is denser on both sides. Then
retrain A. The number to watch is pitch_fail off 2/9.
