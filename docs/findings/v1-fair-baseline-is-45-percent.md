# v1's fair base baseline is 45%, and one instruction line is worth all of it

Run before training, on the held-out 100. Same prompt construction, same 54-tool
catalog, same normaliser in both columns. The only difference is a single system
line appended before generation: *reply with the answer value alone.*

| family | base, no format instruction | base, fair |
|---|---|---|
| chord | 0/7 | **7/7** |
| measures | 0/9 | **9/9** |
| teaching_cues | 0/9 | **9/9** |
| teaching_note | 0/9 | **9/9** |
| transpose | 0/9 | **9/9** |
| ensemble | 0/3 | 2/3 |
| acoustic | 0/27 | 0/27 |
| harmony | 0/14 | 0/14 |
| sections | 0/9 | 0/9 |
| compare | 0/4 | 0/4 |
| **overall** | **0/100** | **45/100** |

**0% to 45% from one sentence.** The naive column is not a knowledge score. Asked
for a chord it answers *"The left hand is playing a **Dm** (D minor) chord in
measure 1"* — gold is `Dm`. Asked for a measure count it answers *"The song
contains 23 measures"* — gold is `23`. It knows; it will not say it plainly.

**A fine-tune scored against the naive column would claim the entire formatting
difference as capability.** That is exactly the error jam-actions-acoustic-v0
made, and it is why the fair column is the one in the headline. 45/100 is the
number to beat.

## The four zero families are one thing, and it should be named

They are not harder music. They use **answer vocabularies the base model cannot
infer**, because nothing in the prompt teaches them:

| family | gold | base said |
|---|---|---|
| harmony | `rejected` / `verified` | `✅` for both |
| sections | `0:none` | `0` — right count, wrong encoding |
| compare | `different_key` | `C_major` — answered a different question |
| acoustic | `match` / `timing_fail` | a JSON metrics blob |

The five families the base aces ask for natural values: a chord name, a count, a
key, a teaching note. The five it fails ask for a convention.

So the fine-tune's headroom here is concentrated in **learning this corpus's
answer conventions**, not in learning music. For a tool-using agent that is a
real and useful capability — an agent that cannot emit the expected shape is
useless downstream — but it is not the same claim as "the model got better at
music", and the write-up must not blur them.

## Method note

`--terse` is a flag on the predictor, not a default, so both conditions stay
runnable and the difference stays visible. Raw completions are saved for every
prediction in both columns; without them the naive 0/100 reads as ignorance
rather than formatting, and those support opposite conclusions.
