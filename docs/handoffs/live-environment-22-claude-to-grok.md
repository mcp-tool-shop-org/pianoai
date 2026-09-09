# Handoff 22 — Claude to Grok Build: the corpus is clean; the recipe is not

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 22.** Branch `main`. **Pull first.** Chunk 20 is verified and committed; CI green at
`652429a`; the rebuilt corpus has been trained on and the result is in
`experiments/coverage-v1-sft/RESULTS-v20.md`.

---

## 1. The result, and why it is the first honest one on this arc

The corpus was rebuilt to ask whether an adapter beats one in three on acoustic takes whose numbers
it has never seen.

| condition | acoustic |
|---|---|
| three-way floor | 9/27 |
| base, fair prompt | 9/27 |
| LoRA epoch 3 | **10/27** |

No. Paired p = 1.0. The confusion matrix: the adapter **never says `match`** in 27 takes — 18
`match` examples in training — and splits the two fail classes 5/4 whatever the gold is. It is not
reading `cents_from_target` against 50 or `onset_ms` against 40. Harmony went 0 → 7/14 by saying
`verified` on all 14, the majority class exactly; last run it said `rejected` on all. Loss 9.7 →
1.13 → 0.041 → 0.032: memorised by epoch 2, as every run.

Your chunks are why this is worth anything. Tool-less at the floor, fair base at the floor, numbers
unique per take, and the adapter still at the floor. **There is nothing left in the data to blame.
A 3B, rank-16, 54-example, three-epoch, loss-to-zero recipe does not learn two numeric thresholds
from in-context measurements.** That is a clean negative and a result.

## 2. This chunk: two corpus hygiene items and one experiment that changes the assistant turn

**B1. Every family's user turn names its answer shape**, the way acoustic now does. Without the
eval-time terse line the other families answer in prose — chord says *"The left hand is playing a
**Dm** (D minor) chord"* against gold `Dm` — and the base scores 3/90. The terse line then goes
away entirely from `predict_v1.py`; the record is the only place the format lives, and training,
the fair base and the adapter share one prompt by construction. Test: every user turn matches a
per-family format pattern.

**B2. Measurements at instrument resolution.** `55.03331486408949` is not what a tool reports and
it tokenises badly. Round `cents_from_target` to 0.1 c and `onset_ms` to 0.1 ms in the tool result
— the observation keeps full precision for re-derivation. This did not cause the result and must
not be claimed to; it is fixed so it cannot be blamed next time. Test: no prompt-visible float has
more than one decimal.

**B3. The experiment — a visible rule in the target.** Change the acoustic *assistant* turn from the
bare label to one line that states the comparison and then the label:

> cents 55.0 against a 50-cent gate, onset 2.1 ms inside 40: pitch_fail

Everything prompt-visible stays as it is — the gates are still absent from the prompt. What changes
is what the model is trained to *emit*: the rule, then the answer. The scorer takes the last
token-word after the final colon, and the base is scored the same way. If the model can learn to
write the comparison it has learned the gates; if it writes the comparison with the wrong numbers,
that is visible and diagnosable, which a bare label never is.

Gold for the intermediate line is constructible — the measurement and the gate are both known — and
re-derived at test time. Keep the bare-label variant buildable behind a flag so the two can be
trained side by side on the next pod.

## 3. Tests

- Every user turn names its answer shape (per-family pattern).
- No prompt-visible measurement has more than one decimal; observation precision unchanged.
- Acoustic assistant turn parses as `<comparison>: <label>` and the label equals gold; the
  comparison's numbers equal the rounded tool result.
- Everything existing: gold re-derived from a fresh render; no kind token; no null-by-class;
  spread gates; degenerate-gold on `[]`; v0 untouched.

## 4. Do not

- Do not put the thresholds in any prompt-visible field. The comparison line is an assistant turn.
- Do not hand-write a label. Do not touch `datasets/jam-actions-acoustic-v0/`.
- Do not deploy. No pod. Director's word only.
- Do not run the full suite; the juncture is mine.

## 5. What to say back

`docs/handoffs/live-environment-23-grok-to-claude.md`, five parts. State plainly:

1. Tool-less baseline per family after B1 and B2 — acoustic should stay at the floor.
2. A rendered acoustic record, verbatim, both variants.
3. Anything in the comparison line that a model could copy from the prompt rather than compute.

## 6. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J11 | chunk 20 | full verify, spread gates, baseline | **DONE — 3,425 tests, CI green** |
| J12 | end of this chunk | full verify, the three new gates, baseline | mine |
| — | the side-by-side training | Director's word. Same seed, same pod, both variants, one question: does the rule-in-target variant beat the floor where the bare-label one did not? | — |
