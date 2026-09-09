# Handoff 29 — Grok Build to Claude: the minus sign is in every class

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 28.** Branch `main` @ `027f018`. Work uncommitted. I did **not** run the suite.
Regenerated `datasets/jam-actions-v1/` and the v1 SFT files; v1 tests, v0 reproduce,
`toolless-baseline.mjs`. **No pod.** 162/162 kept. Sign by draw, same as pitch_fail:
draw 0 +, draw 1 −; magnitude still in the inside band (1.79–45 ¢) for match and
timing_fail.

---

## 1. Cents signs per class and split

From the committed tool results:

| class | split | n | + | − |
|---|---|---|---|---|
| match | train | 36 | **18** | **18** |
| match | test | 18 | **9** | **9** |
| timing_fail | train | 36 | **18** | **18** |
| timing_fail | test | 18 | **9** | **9** |
| pitch_fail | train | 36 | **18** | **18** |
| pitch_fail | test | 18 | **9** | **9** |

`against` on the pitch axis is now reachable only through |cents| ≥ 50. A minus
sign occurs in every class.

---

## 2. Tool-less baseline

Same script, user turn only, mistral-small:24b, 117 held-out:

| family | tool-less |
|---|---|
| acoustic | **18/54 = 33.3%** |
| chord | 1/7 |
| compare | 1/6 |
| ensemble | 0/3 |
| harmony | 9/14 |
| key_moments | 1/6 |
| measures | 0/9 |
| teaching_goals | 1/9 |
| transpose | 0/9 |
| **total** | **31/117 = 26.5%** |

Acoustic stays at the three-way floor.

---

## 3. S2 — the onset gap (report only)

Nothing measures within 18 ms of 40 on either side: non-timing |onset| tops out at
**21.4** (18.6 ms inside), timing starts at **59.9** (19.9 ms past). Empty band
21.4–59.9 = **38.5 ms**.

`MEASURED_ONSET_ABS_P95_MS` = **28.0 ms**. SuperFlux hop = 512/44100 ≈ **11.6 ms**.
Observed max |error| = **37.2 ms**.

**Late side** (keep measured > 40 if the tracker is early): smallest defensible
applied clearance is the p95, **28 ms** (applied min 68). The current 38 ms is
the observed max (37.2), which is honest against a walk-across and is already
close to smallest-plus-max. Adding a hop on top of p95 would be 28+12 = 40 ms
applied (min 80) — that is the next larger defensible number, not a smaller one.

**Inside side** (keep |measured| < 40): the error that walks a non-timing take
*over* +40 is a *late* detection. This tracker is systematically early, so that
error is not the p95. The error that walks it past −40 is more-early, in hops.
Smallest defensible inside margin is the hop, **12 ms** (|measured| < 28). That
is `F5_INSIDE_ONSET_MARGIN_MS`. Using the p95 two-sided would demand |measured|
< 12 and collapse the inside band; I would not.

**Takes at 30 and 50.** A 30 ms measured take is non-timing, 10 ms inside the
gate. A 50 ms take is timing_fail, 10 ms past. Held-out is 9 songs × 2 draws × 3
classes = 54. Putting a handful of match/pitch_fail at ~30 and timing_fail at
~50, in both splits, is the probe that distinguishes "40" from "21 versus 60".
It requires shrinking the late applied floor and raising inside delays so
measured lands there. Not this chunk.

---

## 4. Tests / did not / working tree

v1 tests **35/35** including both cents signs in every class, both splits; two
draws; two-sided onset margin; comparison-line predicates; degenerate `[]`.
v0 reproduce **4/4**.

**Did not:** change the onset construction, train, full suite, v0 edits,
thresholds in user/tool turns, commits, any pod.

```
 M src/dataset/acoustic-v1/f5-acoustic.ts
 M src/dataset/acoustic-v1/v1.test.ts
 M datasets/jam-actions-v1/
 M experiments/coverage-v1-sft/data/
?? docs/handoffs/live-environment-29-grok-to-claude.md
```

**Yours:** J15 full verify. The Director has not said pod.
