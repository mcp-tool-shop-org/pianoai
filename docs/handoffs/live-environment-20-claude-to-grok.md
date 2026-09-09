# Handoff 20 — Claude to Grok Build: make the gate the only rule that generalises

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 20.** Branch `main` @ `cd75316`. **Pull first.** Chunk 18 is verified, committed, CI
running.

---

## 1. Chunk 18 did what was asked, and your leak hunt found the next thing

All three lies are closed and I recounted every number: zero kind tokens in any prompt-visible
field, 81 opaque `take-<hex>` paths, `f0_hz` at 42 distinct values, every measurement field
populated, 81 of 81 user turns naming the verdict set. Tool-less acoustic is 9/27 — exactly the
three-way floor a fair base should sit at now. 3,422 tests, CI running on it.

What you reported, and what I confirmed:

| field | clean | sharp_fail | late_fail |
|---|---|---|---|
| `cents_from_target` | 0.01–0.48 | **55.0–55.4** | 0.01–0.47 |
| `onset_ms` | **−21.36** | **−21.36** | **59.91** |

Within each class the perturbation is one constant — 55 cents sharp, 78 ms late — so the
measurements are constants up to tracker noise. A model can learn `59.909297 → timing_fail` and
`55.0 → pitch_fail` as two magic numbers and score 100% without ever learning that the gates are 40
ms and 50 cents. **This corpus cannot distinguish a model that learned the house gates from one
that memorised two values.** That was the whole experiment, so it is the whole chunk.

## 2. The chunk

**B1. Vary the magnitude within every class.** Draw each take's perturbation from a range, per
class, so that the only rule consistent with all of them is the threshold:

| class | gate | draw from | why those bounds |
|---|---|---|---|
| sharp_fail | 50 c | 50 + clearance … ~90 c | clear the gate by more than the tracker's error; stay under the octave-jump region you measured |
| late_fail | 40 ms | 40 + clearance … ~150 ms | same; stay inside the phrase clock so onsets do not collide |
| match | both | 0 … (gate − clearance) on **both** axes | a clean take is not "zero", it is "inside the gate" |

Clearance stays derived from `tracker-error.ts` — locked YIN p95 0.179 c, onset bias/spread as you
measured on chunk 14 — and the multiple stays stated. Rule 6 is unchanged; what changes is that the
band now sits between a *range* and the gate, not between a *point* and the gate.

**B2. Deterministic draws.** Seeded from the take's opaque id or the phrase, never `Math.random`.
The reproduction gate must still rebuild the committed corpus.

**B3. The untrackable refusal stays**, and now it will bite: wider cents on some phrases may push
YIN into the octave-jump region. Report the drop count. If it is large, narrow the upper bound and
say what you chose.

**B4. Both axes measured on every take** — already true after chunk 18. A `match` take now carries a
small non-zero cents *and* a small non-zero onset, and a `sharp_fail` carries a real onset near
zero. The model has to read both numbers against two gates it cannot see.

**B5. Re-run the tool-less baseline.** Acoustic should stay at the three-way floor. If it moves,
something in the varied values is leaking the class by shape — hunt it mechanically, as before.

## 3. Tests

- **No measurement value is shared across more than a handful of records.** Assert the distinct
  count of `cents_from_target` and of `onset_ms` across acoustic records is at least, say, half the
  record count. This is the gate that would have caught the two-value `onset_ms`.
- **Every take clears its gate by more than the stated multiple of the measured error**, on the
  axis that defines its class — and on the *other* axis sits inside the gate by the same margin.
- **Within-class spread is real:** for each class, max − min of the defining measurement exceeds
  ten times the tracker's p95 error.
- Existing: gold re-derived from a fresh render and track; reproduction; degenerate-gold on `[]`;
  no kind token in any prompt-visible field; v0 untouched.

## 4. Do not

- Do not put the thresholds in the prompt.
- Do not add boundary cases inside the clearance band. That is a different experiment.
- Do not hand-write a label. Do not touch `datasets/jam-actions-acoustic-v0/`.
- Do not deploy anything. No pod. Director's word only.
- Do not run the full suite; the juncture is mine.

## 5. What to say back

`docs/handoffs/live-environment-21-grok-to-claude.md`, five parts. State plainly:

1. Per class: the drawn range, the measured range, the clearance multiple, and the drop count.
2. Distinct-value counts for `cents_from_target` and `onset_ms` across the 81.
3. Tool-less acoustic on the rebuilt held-out 27.

## 6. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J10 | chunk 18 | full verify, three new gates, baseline | **DONE — 3,422 tests** |
| J11 | end of this chunk | full verify, the spread gates, baseline | mine |
| — | training | Director's word only. When it comes, the question is one sentence: does the adapter beat one-in-three on takes whose numbers it has never seen? | — |
