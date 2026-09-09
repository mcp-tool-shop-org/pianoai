# Handoff 26 — Claude to Grok Build: the timing rule has a sign, and the product's is not ours

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 26 — a repair.** Branch `main`. HEAD is `2bf196d`, not `e6b1c62`; the side-by-side commit
landed while you built. Chunk 24 is **on disk, uncommitted, and stays that way** until this chunk
lands on top of it. No pod.

---

## 1. What chunk 24 got right

Everything it claimed, re-measured from the committed records: 349 records, 162 acoustic, 232/117
by song with no straddle (the `compare` pairs included); every one of the 162 comparison lines
parses, copies both tool numbers to the digit, uses the right word for each gate and carries the
label the rule gives; cents and onset ranges per class and split match your table exactly; both
signs on pitch_fail in both splits; no threshold or class word in any user or tool turn. Identity
scan clean. Typecheck clean. Full suite with engine verification: 3,431 passed, 1 skipped, 235 s — the
gates you wrote hold; what follows is a contract failure the tests were not asked to see.

## 2. What it exposed

`goldFromKind` (`src/dataset/acoustic-v1/f5-acoustic.ts:314`) is **late-only**: a take is
`timing_fail` when `onset_ms > 40`, and an early note is never a timing fail. Until chunk 24 that
was invisible — every non-timing onset was −9.8. Now the inside band is applied −25 … 35 ms, the
tracker sits about 20 ms early at the low end, and **six takes measure −44.6 ms** and carry
`match` or `pitch_fail` with a line that reads *onset -44.6 ms inside 40*:

| split | record | tool result | label |
|---|---|---|---|
| train | acoustic:amazing-grace:clean:1 | cents 10.8, onset −44.6 | match |
| train | acoustic:bach-prelude-c-major-bwv846:sharp_fail:0 | cents 83.4, onset −44.6 | pitch_fail |
| train | acoustic:bethena:sharp_fail:1 | cents −76.6, onset −44.6 | pitch_fail |
| train | acoustic:chopin-nocturne-op9-no2:sharp_fail:1 | cents −56.9, onset −44.6 | pitch_fail |
| train | acoustic:sakura-sakura:clean:1 | cents 39.3, onset −44.6 | match |
| test | acoustic:weeping-willow:clean:0 | cents 40.9, onset −44.6 | match |

The product does not grade that way. `scorePerformance` (`src/score-performance.ts:492`) sets a
note's status by `Math.abs(offsetMs) <= greenMs` — two-sided. Six records teach a rule the engine
contradicts, and "inside 40" is false on its face for a magnitude of 44.6. Contract rule 2, labels
verified against engines, is what this chunk repairs.

There is a second thing in the same function, older than chunk 24 and not yours to fix, but you
need to know it: `greenMs = max(50, 0.025 × beat)` (`score-performance.ts:320`). The product's
correct-window floor is **50 ms, two-sided**; `HOUSE_TOLERANCE_MS = 40` only feeds the informational
orange band. The corpus's 40 ms gate is the repo's stated house number, not the product's verdict.
That is a product inconsistency and goes to the Director as a finding, not into this chunk. **Keep
40.** Fix the sign.

## 3. This chunk

**R1. Two-sided rule.** `goldFromKind` and the comparison line use `Math.abs(onset_ms) > 40`. The
line already says `against a 40-ms gate` for a late note; an early one reads the same way with its
sign: `onset -44.6 ms against a 40-ms gate: timing_fail`.

**R2. The inside band keeps the measured magnitude under the gate with room.** Raise
`F5_INSIDE_MS_MIN` so that, after the tracker's early bias and hop quantisation, no match or
pitch_fail take measures at or beyond ±40 minus a stated margin. Say what margin you chose and why
in the reply; the clearance constant that governs the late side cannot fit inside a ±40 window and
you should not pretend it does. Rebuild; the six takes above get new onsets by construction. Keep
162 — if a take is dropped, say which and why.

**R3. The rule is one place.** If the label rule and the comparison-line words are computed
separately today, make them read one predicate so they cannot disagree again.

## 4. Tests

- A gate that fails on any non-timing take whose measured |onset_ms| ≥ 40 − margin, and on any
  timing take whose measured |onset_ms| ≤ 40 + the late clearance.
- The comparison line's word for the onset equals the two-sided predicate on the printed number,
  all 162; label equals `goldFromKind`; gold re-derived from a fresh render.
- Everything from chunk 24: two draws per class per song; distinct onsets within class; both
  pitch_fail signs in both splits; no kind token; no null-by-class; degenerate-gold on `[]`; v0
  untouched.

## 5. Do not

- Do not change the gate magnitude. 40 stays; the 50 is the Director's call.
- Do not put a threshold in any prompt-visible field. Do not hand-write a label.
- Do not touch `datasets/jam-actions-acoustic-v0/`.
- Do not deploy. No pod. Director's word only.
- Do not run the full suite; the juncture is mine.

## 6. What to say back

`docs/handoffs/live-environment-27-grok-to-claude.md`, four parts. State plainly:

1. The margin in R2 and the resulting measured onset range per class and split.
2. Tool-less baseline per family — acoustic should stay at the floor.
3. Any take that changed class or was dropped, by id.

## 7. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J13 | chunk 24 | full verify, new gates, identity scan, baseline | suite green 3,431; identity clean; **RED on contract rule 2 — §2; chunk 24 held uncommitted** |
| J14 | end of this chunk | full verify, the R-gates, identity scan, baseline | mine |
| — | retrain A on the widened corpus | Director's word. Same recipe; pitch_fail off 2/9 is the number | — |
