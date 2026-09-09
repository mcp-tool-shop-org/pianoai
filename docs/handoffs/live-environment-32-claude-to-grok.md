# Handoff 32 — Claude to Grok Build: the probe read the adapters; now put digits in the target

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 32.** Branch `main`. **Pull first.** Chunk 30 is verified and committed with two fixes of mine
on top (below); CI green. The probe predictions are in `experiments/coverage-v1-sft/RESULTS-probe.md`.

---

## 1. The probe result

Your 72 takes, predicted locally with the r26 and r28 adapters and the base. Every adapter line
parses and copies both numbers, 72/72.

| condition | onset_in | onset_out | cents_in | cents_out | total |
|---|---|---|---|---|---|
| base | 6/18 | 1/18 | 8/18 | 5/18 | 20/72 |
| r26 | 10/18 | 9/18 | 9/18 | 9/18 | 37/72 |
| r28 | 11/18 | 9/18 | 18/18 | 0/18 | 38/72 |

On the onset bands both adapters write **`inside` for every negative onset (−56.2 included) and
`against` for nearly every positive one (25.1 included)**. Timing 18/18 in the main test was the sign
of the onset, never a comparison with 40. On cents, r26 reads the sign as before; r28 writes `inside`
for all 36 values from −58 to +58. The recipe learns the shape of the rule and fills it with the
cheapest cue the corpus offers; with no cue, it has no rule.

Your probe is what made that readable. It stays as the test for whatever comes next.

## 2. Two fixes of mine at the juncture, so you know the tree

- `src/dataset/experiment/registry.ts` — `jam-actions-v1-probe/1.0.0` is registered to
  `coverage-v1`. The disk-derived registry test failed without it; that test exists for exactly this.
- `src/dataset/acoustic-v1/builder.ts` — `buildAcousticTake` emitted `draw: undefined` and
  `band: undefined`, which changed the rebuilt main-corpus records' key set and failed
  rebuild-equals-committed. The two keys are now spread only when defined. Full suite 3,446 green.

## 3. This chunk: arithmetic in the assistant turn

The comparison line says the rule in words. A 3B model may do better when the target makes it
*produce the digits* of the comparison before the word. Change the acoustic assistant turn to:

> cents 56.4: |56.4| − 50 = 6.4, against the gate; onset 13.5: |13.5| − 40 = −26.5, inside: pitch_fail

Rules for it:

- The subtraction is on the absolute value against the gate, one decimal, sign shown on the result;
  the word follows the sign of the result (≥ 0 is `against` for cents, > 0 for onset — the predicates
  are unchanged, `centsFailsGate` and `onsetFailsGate` decide the word; the arithmetic is shown, not
  trusted).
- Nothing prompt-visible changes. The gates appear only in the assistant turn, as they do now.
- Keep the plain comparison line buildable behind a flag beside `acousticBareLabel`, so the three
  targets can be trained side by side.
- The probe corpus gets the same assistant turn (its lines are never trained on, but its scorer reads
  the label after the final colon, so the format must match).

## 4. Tests

- Every acoustic assistant turn parses as `cents X: |X| − 50 = D, <word>; onset Y: |Y| − 40 = E, <word>: <label>`;
  `X`, `Y` equal the rounded tool result; `D`, `E` equal the arithmetic to one decimal; each word
  equals its predicate on the printed number; the label equals gold.
- Rebuild-equals-committed for both corpora; the flag variants differ from the committed corpus only
  in the acoustic last assistant turn (leaf diff), 162 and 72 leaves respectively.
- Everything existing: both cents signs in every class; two draws; distinct onsets; two-sided margin;
  no kind token; no prompt-visible threshold; degenerate-gold on `[]`; v0 untouched.

## 5. Do not

- Do not put a threshold, an arithmetic result, or a class word in any prompt-visible field.
- Do not hand-write a label. Do not touch `datasets/jam-actions-acoustic-v0/`.
- Do not train, deploy, or run predictions. No pod. Director's word only.
- Do not run the full suite; the juncture is mine.

## 6. What to say back

`docs/handoffs/live-environment-33-grok-to-claude.md`, four parts. State plainly:

1. A rendered acoustic record, verbatim, all three target variants.
2. Tool-less baseline per family — unchanged by construction, say so with the number.
3. The leaf-diff counts between the committed corpus and each flag variant.

## 7. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J16 | chunk 30 | probe gates, full verify, identity scan, baseline, local predictions | **DONE — 3,446 green after two fixes; probe predicted** |
| J17 | end of this chunk | full verify, the arithmetic gates, identity scan, baseline | mine |
| — | the next pod: 3B with the arithmetic target, and/or 7B at the same recipe | Director's word, priced in `RESULTS-probe.md` | — |
