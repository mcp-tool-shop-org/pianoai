# Handoff 27 — Grok Build to Claude: timing is two-sided, 40 stays

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 26 — repair.** Branch `main` @ `2bf196d`. Chunk 24 stays uncommitted; this sits on
top of it. Work uncommitted. I did **not** run the suite. Regenerated
`datasets/jam-actions-v1/` and the v1 SFT files; v1 tests, v0 reproduce,
`toolless-baseline.mjs`. **No pod.**

`onsetFailsGate` is `Math.abs(onset_ms) > 40`. Gold and the comparison line call it.
40 is unchanged.

---

## 1. Margin and measured onset ranges

**Margin = 12 ms** — one SuperFlux hop (~11.6 ms) inside ±40. The 38 ms late
clearance cannot fit in a ±40 window; I did not pretend it does. Applied
inside-band floor `F5_INSIDE_MS_MIN` raised from **−25 ms to 0**. After the
tracker's ~20 ms early bias, measured |onset| on match and pitch_fail is at most
**21.4 ms**, which is < 40 − 12.

| class | split | n | onset_ms | \|onset\| max |
|---|---|---|---|---|
| match | train | 36 | **−21.4 … 13.5** | 21.4 |
| match | test | 18 | **−21.4 … 13.5** | 21.4 |
| pitch_fail | train | 36 | **−21.4 … 13.5** | 21.4 |
| pitch_fail | test | 18 | **−9.8 … 13.5** | 13.5 |
| timing_fail | train | 36 | 59.9 … 141.2 | 141.2 |
| timing_fail | test | 18 | 59.9 … 141.2 | 141.2 |

Non-timing still spans both sides of zero. Timing applied floor is still
40 + 38 = 78 ms; measured min 59.9 is the tracker sitting ~18 ms early on that
recipe, not a one-sided rule.

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

## 3. Class changes and drops

**None dropped. None changed class.** 162/162 kept.

The six takes that measured −44.6 and said "inside 40" kept their labels and
got new onsets:

| id | gold (unchanged) | onset now | line now |
|---|---|---|---|
| acoustic:amazing-grace:clean:1 | match | −21.4 | `… onset -21.4 ms inside 40: match` |
| acoustic:bach-prelude-c-major-bwv846:sharp_fail:0 | pitch_fail | −9.8 | `… onset -9.8 ms inside 40: pitch_fail` |
| acoustic:bethena:sharp_fail:1 | pitch_fail | −21.4 | `… onset -21.4 ms inside 40: pitch_fail` |
| acoustic:chopin-nocturne-op9-no2:sharp_fail:1 | pitch_fail | −21.4 | `… onset -21.4 ms inside 40: pitch_fail` |
| acoustic:sakura-sakura:clean:1 | match | −9.8 | `… onset -9.8 ms inside 40: match` |
| acoustic:weeping-willow:clean:0 | match | −21.4 | `… onset -21.4 ms inside 40: match` |

Had the rule gone two-sided without raising `F5_INSIDE_MS_MIN`, those six would
have been dropped (kind is clean/sharp_fail; `goldFromKind` would return null),
not relabelled `timing_fail`. R2 is why they stayed.

---

## 4. Tests / did not / working tree

v1 tests **35/35** including: two-sided |onset| < 40 − 12 on every non-timing
take; |onset| > 40 on every timing take; comparison-line word equals
`onsetFailsGate` on the printed number; two draws; both pitch_fail signs;
degenerate `[]`. v0 reproduce **4/4**.

**Did not:** change 40, train, full suite, v0 edits, thresholds in user/tool
turns, commits, any pod.

```
 M src/dataset/acoustic-v1/f5-acoustic.ts
 M src/dataset/acoustic-v1/v1.test.ts
 M datasets/jam-actions-v1/          (on top of chunk 24)
 M experiments/coverage-v1-sft/data/
?? docs/handoffs/live-environment-27-grok-to-claude.md
```

Chunk 24's builder/f5/tests changes remain in the same uncommitted tree.

**Yours:** J14 full verify. The Director has not said pod.
