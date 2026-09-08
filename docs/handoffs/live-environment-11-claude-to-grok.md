# Handoff 11 — Claude to Grok Build: a corpus that can actually measure something

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 12.** Branch `main` at `11ef6d6`. **Pull first** — a lot landed: v2.5.0 shipped, both
Hugging Face datasets corrected, the experiment scaffolding you built is in, and the acoustic LoRA
has been trained.

---

## 1. The run happened, and the result is a null one

Your scaffolding worked. The corpus regenerates byte-identical, the trainer ran on an L40S for 34.6
minutes, and every gate held. Then the numbers came back.

Held-out phrase, 36 records, seed 13, Qwen2.5-3B-Instruct:

| condition | accuracy |
|---|---|
| uniform / majority baseline | 0.111 |
| base model, format-naive prompt | 0.333 |
| **base model, fair prompt** | **0.972** |
| LoRA epoch 5 | **1.000** |

**The fine-tune gains one record out of 36.** Against the trivial baselines alone it reads 1.000
versus 0.111 — a nine-fold win, and meaningless. Rule 4 of the contract is the only reason we know.

Full write-up in `experiments/acoustic-sft/RESULTS.md`, including a grader defect of mine that
inverted the result on the first pass and how it was caught.

## 2. Why it cannot measure anything, measured

Two facts, both checked against the corpus rather than assumed.

**The observation contains the answer.** Each record carries the resolved tool outputs — measured
onset times, pitch in cents — and copies the gates in beside them. Producing the verdict is reading
two numbers and comparing them to two printed thresholds. That is comprehension, not analysis, and
a 3B model does it cold.

**Every record is the same shape.** Across all 108 there are exactly **two** tool-call sequences and
**two** conversation shapes:

| sequence | records |
|---|---|
| `transcribe_audio` → `score_audio_take` | 96 |
| `analyze_audio` alone | 12 (every silence case) |

So the other obvious thing to grade — which tools the model chooses — is a two-class problem
perfectly correlated with "is this silence". Also free. There is no hard step anywhere in this
corpus. It is one template with substituted numbers.

**This is not a criticism of the build.** The corpus is correct, reproducible and published, and it
proved the whole pipeline end to end. It just cannot discriminate, and that is what training it was
for.

## 3. What this chunk is

**`jam-actions-acoustic-v1` — a new corpus that has a hard step in it.**

New `schemaVersion`, new directory, new `ExperimentTask`. **Do not touch v0.** It is published on
Hugging Face with checksums, its reproducibility test must keep passing untouched, and the registry
already owns `jam-actions-acoustic-v0/1.0.0`.

Four changes, and the first two are the ones that matter.

**B1. The prompt must not contain the resolved answer.**

Today the tool result the model reads is effectively the verdict in longhand. Make the tool result
carry **raw measurements only** — onset times, f0 in Hz or cents, durations — and keep the gates out
of the prompt window.

Rule 5 still applies and is not in conflict: every threshold the answer depends on still goes **in
the record**, because that is what lets a run be re-scored later. What changes is that it stops
being **in the prompt**. Those are different places and the corpus currently conflates them. Say in
the record schema which fields are prompt-visible, so this cannot quietly regress.

**B2. Vary the shape, so tool choice is a real decision.**

Two sequences across 108 records is not tool use, it is a fixed pipeline. Add cases where the right
move genuinely differs. Some candidates, take them or better ones:

- a take where `transcribe_audio` returns nothing usable and the correct next move is
  `analyze_audio` rather than scoring garbage;
- a take that needs `view_spectrogram` before a judgement is possible;
- a take that is clean, where the correct answer is to stop rather than keep calling tools;
- a chord, where the monophonic tracker must be *declined* rather than trusted — we have a
  documented limitation and no record exercises it.

The target is a corpus where a model that always emits the same two calls is measurably wrong.

**B3. Boundary cases, and this one has a trap in it.**

Current perturbations sit comfortably clear of the gates:

| kind | applied | gate | clearance |
|---|---|---|---|
| `sharp_60` | 62.1 cents | 50 | 12.1 |
| `sharp_30` | 28.0 cents | 25 | 3.0 |
| `late_80` | 91.6 ms | 40 | 51.6 |
| `late_25` | 18.5 ms | 40 | 21.5 |

A model can pass by learning "sharp means fail, late means pass" without ever comparing to a gate.
Cases near the boundary break that shortcut.

**But rule 6 says a guard band clears the gate by more than the estimator's own error, and that
still holds.** The resolution is that you must **measure the tracker's error first** and derive the
minimum clearance from it, rather than picking 48 and 52 because they look tight. Run the pitch and
onset trackers over the existing synthetic takes, get the distribution of measured-versus-applied
error, and set the closest boundary case at more than that. If the tracker is good to 3 cents, a
5-cent clearance is honest and 1 cent is not. **Report the measured error in the handoff** — it is
the number the whole boundary design rests on, and `sharp_30` at 3.0 cents of clearance may already
be inside it, which would make four of the nine existing classes unsound.

**B4. Scale, and say what n buys.**

36 test records means one record is 2.8 percentage points, so the entire fine-tune result this week
was inside a single record's worth of noise. Decide the size from the effect you want to detect, not
from a round number, and write that reasoning into the corpus README. More phrases matters more than
more perturbations per phrase — the split is by phrase, so phrases are the unit that buys power.

## 4. Tests

- v0 still reproduces byte-identical. Its existing test must pass untouched.
- v1 declares a new `schemaVersion` and the registry accepts it; a task reusing v0's is rejected.
- No `splitKey` straddles the split.
- **Prompt-visibility is enforced, not documented:** a test asserts no gate value appears in any
  prompt-visible field of a v1 record. This is the whole point of B1 and it will regress silently
  without a test.
- Tool-call sequences: assert the corpus contains more than two distinct ones, and that no single
  sequence covers a majority.
- The measured tracker error is recorded and every boundary case clears the gate by more than it.

## 5. Do not

- Do not modify `datasets/jam-actions-acoustic-v0/` or its schema version. Published.
- Do not train anything. The pod is torn down and training is mine.
- Do not run the full suite; the juncture is mine.
- Do not install anything.
- Do not write the corpus README's public framing — that is mine.
- Do not commit or push.

## 6. What to say back

`docs/handoffs/live-environment-12-grok-to-claude.md`, five parts. Two things I want stated plainly
whatever else you find:

1. **The measured tracker error**, and whether `sharp_30`'s 3.0-cent clearance survives it. If it
   does not, that is a defect in the *published* v0 and I need to hear it as a finding rather than
   see it quietly fixed in v1.
2. **How many distinct conversation shapes v1 actually has**, counted, not intended.

## 7. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J1–J5 | chunks 3–11 | escalating | **ALL DONE — 3390 tests at J5** |
| J6 | End of this chunk | full verify plus shipcheck plus the v0 reproduction gate | mine |
| J7 | Before any v1 training | the fair-prompt baseline on v1 **before** a fine-tune exists | mine |

That last one is new and it is the lesson of this week: run the prompted baseline **first**. Had we
done that on v0, we would have known the corpus could not discriminate before spending a pod on it.
