# Handoff 19 — Grok Build to Claude: acoustic records no longer name the class

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 18.** Branch `main` @ `58a971a`. Work uncommitted. I did **not** run the suite.
I regenerated `datasets/jam-actions-v1/` and the v1 SFT files, ran v1 tests, the v0
reproduction gate, and `toolless-baseline.mjs` (mistral-small:24b, 90 held-out). **No pod.**

The three defects are closed in `builder.ts` / `f5-acoustic.ts`, not in the gate.

---

## 1. Tool-less baseline (rebuilt held-out)

Same script, user turn only, mistral-small:24b, 90 held-out:

| family | tool-less |
|---|---|
| acoustic | **9/27 = 33.3%** |
| chord | 2/7 |
| compare | 0/6 |
| ensemble | 0/3 |
| harmony | 0/14 |
| key_moments | 0/6 |
| measures | 0/9 |
| teaching_goals | 0/9 |
| transpose | 0/9 |
| **total** | **11/90 = 12.2%** |

Acoustic was 0/27 when the user turn named no answer space. It is now **exactly one in
three** on a balanced 9/9/9 held-out — the named vocabulary without the measurements.
That is the floor B3 predicted, not a leftover path leak. Every other family is
unchanged from the chunk-16 baseline. v0 was 97.2%.

---

## 2. Range of `f0_hz` and `onset_ms`

81 acoustic records, every measurement field a finite number, none null.

| field | min | max | distinct |
|---|---|---|---|
| `f0_hz` | **261.63 Hz** (C4) | **1080.56 Hz** | **42** |
| `onset_ms` | **−21.360544 ms** | **59.909297 ms** | **2** |
| `cents_from_target` | 0.013 ¢ | 55.45 ¢ | 42 |

`f0_hz` is not a constant. It is the median voiced YIN frequency in the target window,
re-derived at test time within 1e-6. Sharp takes sit a semitone-fraction above their
clean twin; different songs start on different notes.

`onset_ms` is **not one value, but it is only two.** Every clean and every sharp take
is **−21.360544 ms** (the SuperFlux bias on this construction: first note at the same
pre-roll, same click overlay). Every late take is **59.909297 ms** (the fixed delay
plus that bias). Real numbers, no nulls, and a perfect separator of `timing_fail`
from the other two classes because the phrase clock is identical across the shelf.
That is the tracker on a uniform recipe, not a fabricated constant wearing a
measurement's name.

---

## 3. Prompt-visible fields vs gold (mechanical)

Walked every leaf of `target_trace` on the 81 acoustic records, excluding the final
assistant turn (that *is* the gold). Grouped values; asked which fields map each
value onto exactly one gold.

| field | what the walk found |
|---|---|
| `arguments.path` | 81 distinct `/acoustic-v1/take-<6 hex>.wav`. Unique per take, no `clean` / `sharp_fail` / `late_fail` token. A perfect predictor only because each hash is unique, not because the name encodes the class. |
| `cents_from_target` | two clusters: **0.01–0.48 ¢** (`match` and `timing_fail`) and **55.01–55.45 ¢** (`pitch_fail`). This is the pitch measurement the verdict is computed from. |
| `onset_ms` | the two values in §2. Separates `timing_fail` from the rest. This is the onset measurement the verdict is computed from. |
| `f0_hz` | follows the song's first note, plus the sharp shift. Same song's `match` and `timing_fail` are nearly the same Hz. Not a class name. |
| `note_count` | **8** on every take. Constant. Does not predict gold. |
| kind tokens `clean\|sharp_fail\|late_fail` | **zero** matches in any `target_trace`. |

Nothing else in a prompt-visible field names the class. The two fields that still
correlate with gold are the two measurements the house gates read. Thresholds
(50 ¢, 40 ms) are not in the prompt. That is the experiment.

---

## 4. What landed

**B1.** Path is `/acoustic-v1/take-3f9a2c.wav`-shaped. Hash of the recipe (song id
in the preimage only). Collision check at build time; 81 unique.

**B2.** `measureF5` runs YIN and SuperFlux on every take. `f0_hz` is the median
voiced frame; `onset_ms` is measured on clean and sharp too; `cents_from_target`
is measured on late too. Untrackable still drops (0 of 81).

**B3.** User turn:

> Grade this take of "Amazing Grace". Answer with exactly one of: match, pitch_fail, timing_fail.

**B4.** `predict_v1.py --terse` still exists, default off. Help text says it is now
redundant for this corpus because the instruction lives in the record.

**B5.** Corpus rebuilt (still n=268, 178/90). SFT regenerated: `sft-train` 178,
`sft-test` 90, `gold-test` 90.

---

## 5. Tests / did not / working tree

v1 tests **25/25** including: no kind token in any prompt-visible field; every
acoustic tool result has every measurement field a finite number; `f0_hz` varies
and matches a fresh track within 1e-6; every acoustic user turn names the verdict
set and the set equals the family's distinct gold; degenerate-gold gate still
`[]`; gold re-derived from a fresh render. v0 reproduce **4/4**, untouched.

The gold-in-user-turn substring check skips `acoustic` only, because B3 lists the
closed set. Predicate unchanged for every other family.

**Did not:** train, full suite, install, v0 edits, thresholds in the prompt,
commits, any pod.

```
 M src/dataset/acoustic-v1/builder.ts
 M src/dataset/acoustic-v1/f5-acoustic.ts
 M src/dataset/acoustic-v1/v1.test.ts
 M datasets/jam-actions-v1/          (acoustic records + checksums)
 M experiments/coverage-v1-sft/data/
 M experiments/coverage-v1-sft/format-sft.ts
 M experiments/coverage-v1-sft/scripts/predict_v1.py
?? docs/handoffs/live-environment-19-grok-to-claude.md
```

**Yours:** J10 full verify. The Director has not said pod.
