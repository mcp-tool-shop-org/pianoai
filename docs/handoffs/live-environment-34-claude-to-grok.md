# Handoff 34 — Claude to Grok Build: digits in the target, 54/54 and 72/72; now the other two families

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 34.** Branch `main`. **Pull first.** Chunk 32 is verified and committed (`0ff1281`, plus a
CI timeout allowance at `26d8073`); CI green. Both runs are written up in
`experiments/coverage-v1-sft/RESULTS-r32.md`.

---

## 1. The result

Your arithmetic target, the standing recipe, seed 13, one Blackwell pod.

| condition | main acoustic | near-gate probe |
|---|---|---|
| 3B base | 20/54 | 20/72 |
| 7B base | 18/54 | 36/72 |
| r28 adapter (worded comparison) | 38/54 | 38/72 |
| **3B, arithmetic target** | **54/54** | **70/72** |
| **7B, arithmetic target** | **54/54** | **72/72** |

Every line parses, every number is copied, the word follows the model's own subtraction in every
case, and the subtraction is right on the value that decides the class in every case but two: the 3B
writes `|48.0| − 50 = −2.0` correctly and then says `against`, twice, two cents from the gate. The
takes that broke every earlier adapter — −56.2 ms "inside", 25.1 ms "against" — read
`|56.2| − 40 = 16.2, against` and `|25.1| − 40 = −14.9, inside`, 18 of 18 per band, both sizes.

One protocol note for the record: the arithmetic line is 51–56 tokens and `predict_v1.py` defaults to
48 new tokens, so the first 3B pass was cut before the label and scored 0/54. Every pass in this run
uses `--max-new-tokens 128`. The trainer was never touched.

## 2. What it means for the rest of the corpus

Seven runs, one recipe, three targets. The corpus never changed what the model saw; it changed what
the model was asked to write, and the digits were the difference. Two families are still a bare
label and sit where acoustic sat for five runs:

| family | 3B base | 3B adapter | 7B base | 7B adapter | gold |
|---|---|---|---|---|---|
| harmony | 7/14 | 7/14 | 7/14 | 9/14 | `verified` / `rejected`, 7/7 |
| compare | 3/6 | 2/6 | 3/6 | 3/6 | two songs, one wins |

Harmony is the majority class in three of four columns. Compare never leaves chance.

## 3. This chunk: harmony and compare show their work

**H1. Harmony.** The assistant turn states the check that decides the verdict — the measured
quantity, the rule it is held against, the arithmetic if there is any, then the label — the way
acoustic does. Look at what `harmony:<song>:m<N>:<pass|fail>` actually computes in the builder and
put that computation in the turn. If the verdict rests on a quantity the tool result already
carries, the model copies it and compares; if it rests on something only the engine sees, that is a
prompt-visible gap and you say so rather than papering it.

**C1. Compare.** Same: the two measured quantities, the comparison, the winner. Six held-out records
is thin; if the family can carry more pairs from the same 27 songs without a new song or a
straddle, do it and tighten the floors.

**Both:** nothing prompt-visible changes except where you find a gap and report it; the bare-label
variant stays buildable behind the existing flag; the arithmetic in the turn is shown, not trusted —
the predicates decide the label. Tool-less must stay at the floor; say the number.

## 4. Tests

- Every harmony and compare assistant turn parses as `<quantities>: <comparison>: <label>` and the
  printed quantities equal the tool result; the label equals gold and equals the predicate on the
  printed numbers.
- Rebuild-equals-committed; flag variants differ only in the last assistant leaf, counts stated.
- Everything existing: acoustic arithmetic gates; both cents signs; two draws; two-sided margin; no
  kind token; no prompt-visible threshold; degenerate-gold on `[]`; v0 untouched.

## 5. Do not

- Do not put a threshold, a comparison result, or a class word in any prompt-visible field.
- Do not hand-write a label. Do not touch `datasets/jam-actions-acoustic-v0/`.
- Do not train, deploy, or predict. No pod. Director's word only.
- Do not run the full suite; the juncture is mine.

## 6. What to say back

`docs/handoffs/live-environment-35-grok-to-claude.md`, four parts. State plainly:

1. One rendered harmony record and one compare record, verbatim, before and after.
2. Tool-less per family with the number.
3. Any prompt-visible gap you found in either family, and what you did about it.

## 7. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J17 | chunk 32 | full verify, arithmetic gates, identity scan, baseline | **DONE — 3,450 green; CI green at `26d8073`** |
| J18 | end of this chunk | full verify, the H1/C1 gates, identity scan, baseline | mine |
| — | the next pod: retrain 3B on the widened corpus; a second seed on the acoustic result | Director's word | — |
