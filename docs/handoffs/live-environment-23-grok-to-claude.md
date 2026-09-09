# Handoff 23 — Grok Build to Claude: format in the record, rule in the target

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 22.** Branch `main` @ `0540ef1`. Work uncommitted. I did **not** run the suite.
I regenerated `datasets/jam-actions-v1/` (comparison variant) and the v1 SFT files, ran v1
tests, the v0 reproduction gate, and `toolless-baseline.mjs`. **No pod.**

`--terse` is gone from `predict_v1.py`. The scorer takes the word after the final colon.
`--bare-label` on `generate-corpus.ts` still builds the old assistant turn so both variants
can train side by side next pod. Default is the comparison line.

---

## 1. Tool-less baseline after B1/B2

Same script, user turn only, mistral-small:24b, 90 held-out:

| family | tool-less |
|---|---|
| acoustic | **9/27 = 33.3%** |
| chord | 1/7 |
| compare | 1/6 |
| ensemble | 0/3 |
| harmony | 9/14 |
| key_moments | 1/6 |
| measures | 0/9 |
| teaching_goals | 1/9 |
| transpose | 0/9 |
| **total** | **22/90 = 24.4%** |

Acoustic stays at the three-way floor. Harmony 9/14 is the closed set now sitting in the
user turn (`verified, rejected`) plus this script's `includes` match — echo the
instruction and whichever gold is present scores a hit. That is the standing scorer,
not a tool-less leak of the gate. The other closed-set families did not collapse the
same way.

---

## 2. One acoustic record, both variants

`acoustic:amazing-grace:sharp_fail`. Prompt (user + tool result) is the same in both:

```
user:  Grade this take of "Amazing Grace". Answer with exactly one of: match, pitch_fail, timing_fail.
tool:  {"f0_hz": 322.9, "cents_from_target": 64.4, "onset_ms": -9.8}
```

**Comparison (default, this corpus):**

```
cents 64.4 against a 50-cent gate, onset -9.8 ms inside 40: pitch_fail
```

**Bare-label (`--bare-label`):**

```
pitch_fail
```

Gold on the record is still `pitch_fail`. Observation keeps `measured_cents` at full
precision (64.438…); the tool result is 64.4.

---

## 3. What a model could copy from the prompt

Walked the user turn and the tool result of that record against the comparison line.

| in the comparison line | in the prompt? |
|---|---|
| `64.4` and `-9.8` | **yes** — the rounded tool result. Copying them is reading the measurement. |
| `pitch_fail` | **yes** — listed in the user turn's closed set, with `match` and `timing_fail`. Copying a vocab token does not require the numbers. |
| `50-cent` / `50` / `40` | **no** |
| `against` / `inside` | **no** |

The gates and the against/inside relation cannot be copied. The measurements can, and
should be: they are what the tool reported. The label word can be copied from the
format instruction, which is why a bare-label run still has to *choose* among three
listed tokens. The comparison line's load-bearing content is the relation to 50 and 40.

---

## 4. What landed

**B1.** Every user turn ends with a per-family format instruction. Closed-set families
name the set (acoustic, compare, harmony, ensemble). The rest name the shape
("chord symbol alone", "single integer", "measure number or range", "key name",
"instrument id"). `--terse` deleted from `predict_v1.py`.

**B2.** Tool-result `cents_from_target`, `onset_ms`, `f0_hz` rounded to 0.1. Ensemble
tool floats too. Observation stores full-precision `measured_*` for re-derivation.

**B3.** Default assistant turn is the comparison line, constructible from the
measurement and `V1_PITCH_FAIL_CENTS` / `V1_TIMING_MS`. Scorer and predictor take the
token after the last colon. `npx tsx src/dataset/acoustic-v1/generate-corpus.ts --bare-label`
rebuilds the other variant.

---

## 5. Tests / did not / working tree

v1 tests **32/32** including: per-family user-turn format; no prompt-visible float with
more than one decimal; observation precision kept; assistant turn parses as
`<comparison>: <label>`, label == gold, numbers == rounded tool result; existing
gates (kind token, spread, degenerate `[]`, f0 re-derive). v0 reproduce **4/4**.

**Did not:** train, full suite, install, v0 edits, thresholds in user/tool turns,
commits, any pod.

```
 M src/dataset/acoustic-v1/builder.ts
 M src/dataset/acoustic-v1/f5-acoustic.ts
 M src/dataset/acoustic-v1/generate-corpus.ts
 M src/dataset/acoustic-v1/v1.test.ts
 M datasets/jam-actions-v1/
 M experiments/coverage-v1-sft/data/
 M experiments/coverage-v1-sft/scripts/predict_v1.py
 M experiments/coverage-v1-sft/scripts/score_v1.mjs
?? docs/handoffs/live-environment-23-grok-to-claude.md
```

**Yours:** J12 full verify. The Director has not said pod.
