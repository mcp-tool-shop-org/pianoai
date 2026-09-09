# Coverage v1 — the comparison-line recipe when the sign says nothing

Trained 2026-09-09 (UTC) on a RunPod RTX 6000 Ada, seed 13, the variant-A recipe unchanged from
`RESULTS-ab.md` and `RESULTS-r26.md`. The corpus is chunk 28: the 349 records of `RESULTS-r26.md`
with `cents_from_target` carrying a sign in every acoustic class — 50/50 positive and negative in
`match`, `pitch_fail` and `timing_fail`, train and test, magnitudes unchanged, labels unchanged.
232 train / 117 test, split by song. The base is predicted once on the same prompts.

## The question and the answer

`RESULTS-r26.md` scored 47/54 and showed that the adapter wrote `against a 50-cent gate` whenever
it saw a minus sign — a token that occurred in exactly one class. Does `pitch_fail` hold when the
sign is uninformative?

| condition | acoustic | overall |
|---|---|---|
| three-way floor | 18/54 | — |
| base, shared prompt | 20/54 | 55/117 |
| r26 adapter, on the r26 corpus (sign informative) | 47/54 | 99/117 |
| **r28 adapter, on this corpus (sign uninformative)** | **38/54** | **92/117** |

Base vs r28 on acoustic: base-only 8, adapter-only 26, p = 0.003. Overall 13 vs 50. All 54
comparison lines parse and all 54 copy both tool numbers to the digit.

| gold | `match` | `pitch_fail` | `timing_fail` |
|---|---|---|---|
| match | **18** | 0 | 0 |
| pitch_fail | 16 | **2** | 0 |
| timing_fail | 0 | 0 | **18** |

**No.** `pitch_fail` is 2/18. The adapter writes `inside a 50-cent gate` for 56.4, for −86.0 and
for 90.0; the two it gets are −79.4 and −89.3. Every one of the 11/18 in the previous run was the
minus sign. With the sign spread across every class, the pitch axis is back to where it was on the
first side-by-side (2/9) and below the floor's one-in-three for that class.

## What is and is not learned

Three runs of the same recipe now agree, and the visible rule is what makes them legible:

- **Format and copy** — 54/54 lines parse, 54/54 numbers exact, in every run. Learned completely.
- **Timing** — 18/18 in every run since the onset began to vary. But no take in the corpus measures
  between 21.4 and 59.9 ms, so this is consistent with "small or large", not with a comparison
  against 40. Untested, not proven.
- **Pitch magnitude against 50** — 2/9 sharp before the sign was informative, 2/18 now. Not learned.
  The model has 108 training takes where the only way to write `against` is |cents| ≥ 50, and it
  writes `inside` for 90.0.

So the 38/54 is: 18 match + 18 timing + 2 pitch. The adapter beats the base because the base wanders
across the three words; the adapter has learned exactly which cue it may not use and has nothing to
replace it with.

## The rest

| family | base | r28 epoch 3 |
|---|---|---|
| acoustic | 20/54 | 38/54 |
| chord | 1/7 | 7/7 |
| compare | 3/6 | 4/6 |
| ensemble | 0/3 | 2/3 |
| harmony | 7/14 | 9/14 |
| key_moments | 0/6 | 5/6 |
| measures | 9/9 | 9/9 |
| teaching_goals | 6/9 | 9/9 |
| transpose | 9/9 | 9/9 |
| **overall** | **55/117** | **92/117** |

## Loss

10.2 → 2.14 → 0.173 → 0.114 — the same curve as r26 to two decimals. The fit did not change; what
it fit did.

## Run facts

| | |
|---|---|
| GPU | NVIDIA RTX 6000 Ada 48 GB; 87 steps at ~51 s, 73 min training |
| examples | 232 / 117; tokens min 13,035 / median 13,158 / max 13,382 of 16,384 |
| seed | 13 |
| receipts | `runs/r28/run-config-A.json`, `runs/r28/r28.log`; predictions for base and epoch 3 |
| epoch 2 | **not scored** — the pod was torn down while the epoch-2 pass was still writing (40/117); the adapter was fetched, the predictions were not. Advisor error in sequencing, not a run failure. |
| cost | first deploy landed on the known-broken host (CUDA dead) and was torn down unused; the Ada ran ~1.6 h at $0.74/hr ≈ $1.20 |

Adapter `runs/r28/A/epoch3` (126 MB) is on disk, not in git.

## Next

Two things, neither of which is another retrain of this recipe.

1. **Probe the timing claim before believing it.** An evaluation-only set of takes measured near the
   gate — about 30 and 50 ms, both signs — and near the pitch gate — about 45 and 55 cents, both
   signs — on the held-out songs, never trained on. Predicted with the r26 and r28 adapters as they
   are. If timing falls to the floor there, "18/18" was small-versus-large. That set is chunk 30
   and costs no GPU time worth naming.
2. **Then the recipe.** The lever that has not been pulled is the model, not the corpus: the corpus
   now gives the model nothing but the comparison, and a 3B rank-16 adapter on 108 takes does not
   make it. The candidates are a larger base at the same recipe, or several times the acoustic
   count, and both are the Director's call with a price on them.
