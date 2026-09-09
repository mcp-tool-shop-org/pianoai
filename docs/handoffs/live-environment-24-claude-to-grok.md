# Handoff 24 — Claude to Grok Build: the rule in the target works; the onset never moved

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 24.** Branch `main`. **Pull first.** Chunk 22 is verified and committed; CI green at
`e6b1c62`; the side-by-side has been run and the result is in
`experiments/coverage-v1-sft/RESULTS-ab.md`.

---

## 1. The result

Same seed, same pod, same split, one difference: what the acoustic assistant turn says.

| condition | acoustic | overall |
|---|---|---|
| three-way floor | 9/27 | — |
| base, shared prompt | 10/27 | 44/90 |
| B: bare label in target | 12/27 | 63/90 |
| **A: comparison line in target** | **20/27** | **70/90** |

A against the base: base-only 3, A-only 13, p = 0.021. A against the v20 adapter (bare label,
last pod): 4 vs 14, p = 0.031. B against A on acoustic: 1 vs 9, p = 0.021; B against the base: 8 vs 10, p = 0.8 — the bare label is the floor again, and it says `timing_fail` on 22 of 27 takes, the same pathology as the v20 adapter with the other word. **The rule in the target is the first thing on this
arc that beat the floor on numbers the model had never seen.** Your chunk 22 is why.

## 2. What the comparison line shows, which a bare label never could

Every one of A's 27 lines parses as `cents N <word> …, onset M ms <word>: <label>`, and on all 27
the numbers are the tool result to the digit. So the misses are legible:

| gold | correct | what A wrote on the misses |
|---|---|---|
| match | 9/9 | — |
| timing_fail | 9/9 | — |
| pitch_fail | **2/9** | `cents 84.7 inside a 50-cent gate … : match` |

It gets 72.5 and 76.6 right and 82.0 and 84.7 wrong. That is not a boundary effect. On the pitch
axis it copies the number and then writes `inside` seven times in nine; it has learned the shape of
the rule, not the comparison.

And the timing 9/9 is worth less than it looks. **Onset is exactly −9.8 ms on every non-timing take
in the corpus** — 36 of 36 in training, 18 of 18 held out — while timing-fail onsets sit at 59.9 to
385 ms. Nothing in the data ever asks the model to read an onset that is *inside* the gate and
varies. "Onset is not −9.8" scores 9/9. Chunk 20 varied the cents magnitudes within class; the
onset on match and pitch_fail takes was left at whatever the clean render's tracker bias is.

Third thing, smaller: every pitch_fail in the corpus is sharp. `cents_from_target` is positive on
all 36. A model that learned "large positive cents → pitch_fail" has never met a flat take.

## 3. This chunk: three corpus changes, all in the acoustic family

**C1. Onset varies inside the gate on match and pitch_fail takes.** Shift the note onset by a drawn
amount so `onset_ms` on non-timing takes spans the gate on both sides, and draw timing-fail onsets
down toward the gate instead of leaving them 3× past it — with both ranges keeping the clearance
`tracker-error.ts` locks against the measured onset error. Gold stays re-derived from the render.
Test: distinct onsets within each class ≥ the class count minus one; no class with a single onset
value.

**C2. Flat takes.** pitch_fail draws its sign. Test: both signs present in pitch_fail, train and
test.

**C3. More takes per song, not more songs.** The family is 81 records because each song gets one
clean, one sharp, one late. Two draws per class per song doubles the acoustic count without a new
song, keeps the split by song intact, and puts more examples near the pitch boundary on both sides.
The floors in `schema.ts` and the spread gates should tighten to the new counts.

Nothing changes in any prompt-visible field except the numbers themselves. The comparison line
stays; it is now the record's assistant turn, not an experiment.

## 4. One thing to report, not change

With the eval-time terse line gone, the base names the right chord on 7 of 7 chord records and
scores 0 of 7, because it writes *"The left hand is playing a Dm chord in measure 1 of …"* against
gold `Dm`. Same on key_moments. The in-record "Answer with the chord symbol alone" is not enough for
the base to comply. That is a fair-baseline compliance gap, not a knowledge gap, and the adapter
closes it trivially (7/7). Leave the prompt as it is; say in the reply whether you see a
prompt-visible phrasing that would get the base to comply without naming the answer.

## 5. Tests

- Onset distinct-within-class gate; no single-onset class.
- pitch_fail sign gate.
- Floors and spread gates at the new acoustic count.
- Everything existing: gold re-derived from a fresh render; comparison line parses and its numbers
  equal the rounded tool result; no kind token; no null-by-class; degenerate-gold on `[]`; v0 untouched.

## 6. Do not

- Do not put a threshold in any prompt-visible field.
- Do not hand-write a label. Do not touch `datasets/jam-actions-acoustic-v0/`.
- Do not deploy. No pod. Director's word only.
- Do not run the full suite; the juncture is mine.

## 7. What to say back

`docs/handoffs/live-environment-25-grok-to-claude.md`, five parts. State plainly:

1. Tool-less baseline per family after C1–C3 — acoustic should stay at the floor.
2. The onset and cents ranges per class, train and test, as measured from the committed corpus.
3. The acoustic count and how the split by song came out.

## 8. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J12 | chunk 22 | full verify, three new gates, baseline | **DONE — CI green at `e6b1c62`** |
| J13 | end of this chunk | full verify, the new gates, baseline | mine |
| — | retrain A on the widened corpus | Director's word. Same recipe; the question is whether pitch_fail moves off 2/9 when the onset varies and the band is denser | — |
