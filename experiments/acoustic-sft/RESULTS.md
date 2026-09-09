# Acoustic SFT — first run, seed 13

Trained 2026-09-08 on a RunPod L40S. One seed. Everything below is on the
held-out phrase (Für Elise, 36 records), which no training example touches.

## The result

| condition | accuracy | unparseable |
|---|---|---|
| uniform / majority baseline | 0.111 | — |
| base model, format-naive prompt | 0.333 (12/36) | 21 |
| **base model, fair prompt** | **0.972 (35/36)** | 0 |
| LoRA epoch 5 | **1.000 (36/36)** | 0 |

**The fine-tune gains one record over a well-prompted base model.** At n=36 that
is not a margin anybody should act on. Report it as a ceiling both models reach,
not as a win.

That sentence is the entire reason rule 4 of the [experiment
contract](../_template/README.md) exists. Against the trivial baselines alone,
this run reads as 1.000 versus 0.111 — a nine-fold improvement, a spectacular
result, and a meaningless one. The base model already does the task.

## Why the base model does so well

The verdict is close to deterministic given what is already in the record. Each
conversation carries the tool outputs — measured onset times, pitch in cents —
and the thresholds are copied into the record. Mapping those numbers to one of
nine labels is reading comprehension, not audio analysis. A capable 3B model
does it cold.

**That is a finding about the corpus, not the adapter.** A dataset whose
observation contains the answer in near-explicit form cannot discriminate
between a model that learned something and one that can read. If this corpus is
to measure anything in future, the observation has to stop carrying the
thresholds and the resolved measurements in the same window as the question.

## The format effect, which is not skill

The two base rows differ only in the prompt. Format-naive, the base model writes
fluent prose about the take and never names a label:

> "The transcription and scoring of the recording of Für Elise have been
> completed. The transcription matched the expected notes within the specified
> tolerances…"

Scored strictly, that is 0.333 with 21 of 36 unparseable. Add one system line
listing the nine allowed verdicts and it becomes 0.972 with none unparseable.

So a base-versus-adapter comparison run without that line would have credited
the adapter with **0.639 of gain that is entirely output formatting**. The fair
prompt is the honest control, and it is the one in the headline table.

## The per-epoch curve

| epoch | accuracy | unparseable |
|---|---|---|
| 1 | 0.556 (20/36) | 12 |
| 2 | 0.889 (32/36) | 4 |
| 3 | 1.000 (36/36) | 0 |
| 4 | 1.000 (36/36) | 0 |
| 5 | 1.000 (36/36) | 0 |

Diagnostic only. **Epoch 5 is the reported result** because it is the endpoint
the config declared before the run; the curve is not a menu to select from.
Choosing the best epoch by test-set score, on 36 records with no validation
split, is selecting on the thing being measured.

What the curve does say: the task saturates by epoch 3, and epochs 4 and 5 buy
nothing. A shorter run would reach the same place.

## A grader defect that inverted this result

The first scoring pass reported LoRA 0.889 against base 0.972 — the fine-tune
making the model *worse*, failing 0 of 4 on exactly the trap case the corpus was
built around.

That was wrong, and it was my grader. The adapter's answer on the silence
records was:

> "Nothing to grade. The file is silence, not a failed take. A score of zero
> would be the wrong answer."

Which is correct. The verdict is `nothing_to_grade`. My parser matched only the
literal underscore form, so it scored the right answer as unparseable four times
and inverted the conclusion.

The fix accepts a label however it is spelled — underscore, space or hyphen —
while still refusing to match `pitch_fail` inside `pitch_fail_cents`, which the
adapter emits in every completion because it echoes the gates. Guards are
`(?<!\w)` / `(?!\w)` rather than `\b`, since `_` is a word character.

Two things made this recoverable, and both are worth keeping:

- **The raw completions are saved beside every verdict.** Without them there was
  no way to tell "the model got it wrong" from "the grader could not read it",
  and those support opposite conclusions.
- **Re-scoring needed no GPU.** Every number above was recomputed offline from
  saved text after the pod was gone.

A first scoring pass that produces a dramatic result deserves to be read
adversarially before it is believed. This one said the fine-tune broke the
model, which was interesting enough to be suspicious.

## Run facts

| | |
|---|---|
| base model | Qwen/Qwen2.5-3B-Instruct |
| GPU | NVIDIA L40S, 41.1 GB peak of 46.1 |
| training time | 2,077 s (34.6 min), 45.9 s/step, 45 steps |
| trainable params | 29,933,568 (0.96%) |
| tool catalog | full, 54 tools |
| tokens/epoch | 953,106 (11,654 assistant) |
| max example | 13,276 tokens against max_seq_len 16,384 |
| loss | 9.637 → 1.082 |
| seed | 13 |
| cost | ~$0.88, 67 minutes at $0.79/hr |

Adapter weights are not in git — 626 MB for the five checkpoints. The receipt
(`runs/seed13/run-config.json`) carries the seed, the data SHA-256, every
hyperparameter, package versions and the loss curve, which is what a re-run
needs.

## What this run does not show

One seed. One held-out phrase. Synthetic audio throughout, monophonic, one
instrument. No real recordings, no polyphony, no genre transfer. The adapter is
not published, because a one-record margin over a prompted baseline is not a
result worth publishing weights for.

The honest next step is not another seed. It is a harder corpus — one where
reading the observation does not hand you the answer.
