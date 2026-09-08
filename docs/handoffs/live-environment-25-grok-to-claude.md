# Handoff 25 — Grok Build to Claude: onset moves; pitch_fail has a sign; two draws

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 24.** Branch `main` @ `e6b1c62`. Work uncommitted. I did **not** run the suite.
I regenerated `datasets/jam-actions-v1/` and the v1 SFT files, ran v1 tests, the v0
reproduction gate, and `toolless-baseline.mjs`. **No pod.**

Attempted 162 F5 takes. Dropped untrackable 0, clearance 0, short phrase 0.

---

## 1. Tool-less baseline after C1–C3

Same script, user turn only, mistral-small:24b, **117** held-out (54 acoustic):

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

Acoustic stays at the three-way floor. The varied onsets and signed cents are not
leaking the class without the tools.

---

## 2. Onset and cents ranges per class, train and test

Measured from the committed tool results (0.1 resolution).

| class | split | n | cents | onset_ms | onset distinct |
|---|---|---|---|---|---|
| match | train | 36 | 2.6 … 45.0 | **−44.6 … 13.5** | 6 |
| match | test | 18 | 1.8 … 44.2 | **−44.6 … 13.5** | 5 |
| pitch_fail | train | 36 | **−88.0 … 87.4** (18 sharp / 18 flat) | **−44.6 … 13.5** | 6 |
| pitch_fail | test | 18 | **−89.3 … 90.0** (9 / 9) | **−33.0 … 13.5** | 5 |
| timing_fail | train | 36 | 1.8 … 45.1 | **59.9 … 141.2** | 8 |
| timing_fail | test | 18 | 3.5 … 43.4 | **59.9 … 141.2** | 8 |

Non-timing onset is no longer a single −9.8 ms. It spans both sides of zero and
stays under the 40 ms gate. Timing-fail was 59.9–385 ms; it is now 59.9–141.2,
drawn down toward the gate. Applied late range is 78–160 ms (gate + 38 ms
clearance through 160). Inside-gate applied delay is −25 … 35 ms so SuperFlux
occupies more than one hop; measured stays `< 40`. Clearance constants in
`tracker-error.ts` are unchanged.

pitch_fail signs: both present in train and in test.

---

## 3. Acoustic count and the song split

**162** acoustic records (was 81). 27 songs × 3 classes × **2 draws**. Corpus n
**349** (train 232 / test 117).

Split is still by song, last 9 of 27 alphabetically held out:

- train: 18 songs × 6 takes = **108** acoustic
- test: 9 songs × 6 takes = **54** acoustic

No new songs. Majority shape `transcribe_audio>score_audio_take` is 46.4% (still
≤ 50%). Coverage floors in `schema.ts` (tools > 9, songs > 24, shapes > 7) are
unchanged because C3 does not add tools, songs, or shapes. Spread gates: cents
still > 10× YIN p95; late onset > 2× onset p95 because the 10× bar (280 ms) does
not fit a band pulled toward the 40 ms gate.

---

## 4. Chord base compliance (report only, no change)

The base names the right chord and writes a sentence, so exact-match scores 0/7.
The format instruction is a trailing clause on a long question. A prompt-visible
phrasing that often helps instruction-following, without naming any chord: put
the constraint **first** and as its own line — `Answer with the chord symbol
alone.` then the question — so the model is not already in "the left hand is
playing…" before it sees the constraint. I left the prompt as it is.

---

## 5. Tests / did not / working tree

v1 tests **34/34** including: two draws per class per song (162 / 54 held-out);
distinct onsets within each class, no single-onset class; both pitch_fail signs
in train and test; comparison line still parses; no kind token; degenerate `[]`;
gold re-derived from a fresh render. v0 reproduce **4/4**.

**Did not:** train, full suite, install, v0 edits, thresholds in user/tool turns,
commits, any pod.

```
 M src/dataset/acoustic-v1/f5-acoustic.ts
 M src/dataset/acoustic-v1/builder.ts
 M src/dataset/acoustic-v1/v1.test.ts
 M datasets/jam-actions-v1/
 M experiments/coverage-v1-sft/data/
?? docs/handoffs/live-environment-25-grok-to-claude.md
```

**Yours:** J13 full verify. The Director has not said pod.
