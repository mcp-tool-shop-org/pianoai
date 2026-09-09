# Handoff 28 — Claude to Grok Build: 47/54, and the minus sign is doing the work

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 28.** Branch `main`. **Pull first.** Chunks 24 and 26 are verified and committed at
`c1bfbd3`; the product's timing window was fixed in `2366bf6`; CI green. The retrain on the
349-record corpus is done and written up in `experiments/coverage-v1-sft/RESULTS-r26.md`.

---

## 1. The result

Same recipe as variant A, your corpus.

| condition | acoustic | overall |
|---|---|---|
| floor | 18/54 | — |
| base, shared prompt | 20/54 | 54/117 |
| A epoch 3 | **47/54** | **99/117** |

Base vs A on acoustic: 0 vs 27, p ≈ 1e-8. match 18/18, timing_fail 18/18, pitch_fail 11/18 — up
from 2/9. All 54 lines parse and copy both numbers exactly. Your two chunks did that.

## 2. What the seven misses say

All seven are `pitch_fail → match`, and all seven are **sharp**. Flat pitch_fail: 9/9. Sharp: 2/9,
with misses at 56.4, 61.6, 64.9, 74.8, 86.7, 88.8 and 90.0 cents — the two hits are 67.6 and 77.5,
so not a boundary effect. The model writes `against a 50-cent gate` when it sees a minus sign and
`inside` otherwise.

That is a perfect rule in this corpus. Negative cents occur in exactly one class:

| class | positive | negative |
|---|---|---|
| match | 54 | 0 |
| timing_fail | 54 | 0 |
| pitch_fail | 27 | 27 |

Chunk 26 gave pitch_fail a sign so the model would meet a flat take. It also handed it a token it
can read without comparing anything, and on the sharp side — the only place it must compare a
number to 50 — it is where it was.

## 3. This chunk

**S1. The sign is uninformative.** `match` and `timing_fail` takes draw a signed cents shift as
well — flat-but-inside, magnitude in the same inside band, sign by draw the way pitch_fail does it.
After this, `against` on the pitch axis is reachable only through |cents| ≥ 50. Test: both signs
present in every class, train and test; the split-by-song and both-signs-in-pitch_fail gates stay.

**S2. Report, do not change: the onset gap.** Measured non-timing |onset| tops out at 21.4 and
timing onsets start at 59.9. Nothing in the corpus sits within 18 ms of the gate on either side,
so "timing 18/18" is consistent with a model reading big-versus-small rather than 40. The 38 ms
late clearance and the 12 ms inside margin are why. Say what the smallest defensible clearance is
on each side given `MEASURED_ONSET_ABS_P95_MS` and the hop, and what the test set would look like
with takes at 30 and 50. No change this chunk.

## 4. Tests

- Both cents signs in every class, both splits.
- Everything from chunks 24 and 26: two draws per class per song; distinct onsets within class;
  two-sided margin on every take; the comparison line's words equal the predicates on the printed
  numbers; gold re-derived from a fresh render; no kind token; degenerate-gold on `[]`; v0
  untouched.

## 5. Do not

- Do not put a threshold or a class word in any prompt-visible field. Do not hand-write a label.
- Do not touch `datasets/jam-actions-acoustic-v0/`.
- Do not deploy. No pod. Director's word only.
- Do not run the full suite; the juncture is mine.

## 6. What to say back

`docs/handoffs/live-environment-29-grok-to-claude.md`, four parts. State plainly:

1. Cents sign counts per class and split after S1, measured from the committed corpus.
2. Tool-less baseline per family — acoustic should stay at the floor.
3. The S2 answer with numbers.

## 7. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J14 | chunks 24+26 | full verify, gates, identity scan, baseline | **DONE — 3,439 green, CI green at `2366bf6`** |
| J15 | end of this chunk | full verify, the sign gate, identity scan, baseline | mine |
| — | retrain after S1 | Director's word. Same recipe; sharp pitch_fail off 2/9 is the number | — |
