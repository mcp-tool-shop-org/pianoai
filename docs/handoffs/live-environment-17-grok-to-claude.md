# Handoff 17 — Grok Build to Claude: chunk 16 repair

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 16.** Branch `main` @ `6700809`. Work uncommitted. I did **not** run the suite.
I regenerated `datasets/jam-actions-v1/`, ran v1 tests, the v0 reproduction gate, and
`toolless-baseline.mjs` (mistral-small:24b, 90 held-out). **No pod.**

The gate stays the same predicate (`size < 2`, exact equality). `KNOWN_DEGENERATE` is `[]`
because the corpus changed, not because the list grew.

---

## 1. Cut vs repaired, distinct gold per family per split

n **268** (train 178 / test 90). Floors re-derived after the cuts: **tools > 9** (have 10),
**songs > 24** (have 27), **shapes > 7** (have 8). Majority shape
`transcribe_audio>score_audio_take` at 30.2%.

### Cut

| family | why |
|---|---|
| `sections` | no shelf song has section markers. `musicalLanguage.structure` is prose. Did not synthesise markers. |
| `server` | one train-only record, gold `"54"`. |
| `catalog` | not named in the brief. Three train-only records (one per genre). Split is by `song_id`; catalog is not song-scoped, so it cannot appear in test without a split-rule exception. Default: it does not ship. |
| `teaching_note` | measure-level `teachingNote` — 0 of 2,969 measures populated. Replaced, not kept as a constant. |
| `teaching_cues` | same empty measure-level fields. Replaced. |

`styleTips` was considered and **not shipped**. The only honest gold is reproduction of
hand-written prose.

### Repaired

| family | gold | train n / distinct | test n / distinct |
|---|---|---|---|
| `teaching_goals` | `musicalLanguage.teachingGoals.length` (`"4"` or `"5"`) | 18 / **2** (4×16, 5×2) | 9 / **2** (4×8, 5×1) |
| `key_moments` | first numbered measure or range in `keyMoments[0]` | 14 / **11** | 6 / **5** |
| `compare` | `same_key` / `different_key`, both classes by design | 8 / **2** (4+4) | 6 / **2** (3+3) |

`teaching_goals` is thin — 24 songs declare 4 goals, 3 declare 5 (`fur-elise` and
`greensleeves` train, `the-entertainer` test) — but both values exist in both splits and
the gold is a count, not a hand-written string.

`key_moments` omits **7 songs** whose first `keyMoment` names no measure or bar number
(prose only: `chopin-prelude-e-minor`, `gladiolus-rag`, `peacherine-rag`, `pineapple-rag`,
`simple-gifts`, `the-entertainer`, `weeping-willow`). Those records are not labelled from
the prose.

### Unchanged families (still ≥2 golds in each split)

| family | train n / distinct | test n / distinct |
|---|---|---|
| acoustic | 54 / 3 | 27 / 3 |
| chord | 15 / 13 | 7 / 6 |
| ensemble | 4 / 4 | 3 / 3 |
| harmony | 29 / 2 | 14 / 2 |
| measures | 18 / 17 | 9 / 7 |
| transpose | 18 / 8 | 9 / 6 |

No scored family is constant in train or in test. Gate expected `[]`, received `[]`.

---

## 2. Tool-less baseline (repaired held-out)

Same script, user turn only, mistral-small:24b, 90 held-out:

| family | tool-less |
|---|---|
| acoustic | **0/27** |
| chord | 2/7 |
| compare | **0/6** |
| ensemble | **0/3** |
| harmony | **0/14** |
| key_moments | **0/6** |
| measures | **0/9** |
| teaching_goals | **0/9** |
| transpose | **0/9** |
| **total** | **2/90 = 2.2%** |

The repaired teaching families and same-key compare all score zero without tools. The
corpus still needs the tools. v0 was 97.2%. Chord 2/7 is the same leak as before.

---

## 3. Same-key pairs the shelf can supply

**30** unordered same-key pairs on the 27-song publishable shelf.

By key: Eb major 5 (C(5,2)=10), C major 4 (6), F / Bb / A minor / Ab major 3 each (3×4=12),
E minor / G major 2 each (1+1). D major and D minor are singletons.

The song-level split leaves **15** same-key pairs inside the train group of 18 and **3**
inside the test group of 9. The builder takes 4 same + 4 different in train, and all 3
same + 3 different in test, so both classes are populated by design and no composite id
straddles. The shelf can supply the test `same_key` class; it cannot supply more than 3
held-out same-key pairs without crossing the leak unit.

---

## 4. Acoustic 0/27 — my read (not this chunk)

54 training examples, train loss 0.02, held-out **0/27** with 17 paraphrases under a
generous map (`Timing failure` for `timing_fail`). Gold is `match` / `pitch_fail` /
`timing_fail`. The user turn is `Grade this take of "…"`.

Capacity is enough: loss 0.02 by the end of epoch 2 is a fit, not an underfit. More
epochs would deepen memorisation of the 18 training songs (54 = 18 × 3 kinds; held-out
is 9 unseen songs × 3). The 17 near-miss paraphrases are the tell: the model often
saw the defect class and did not know the house token.

The working families name the question (`How many measures`, `What chord`) so the gold
token is the obvious answer. Acoustic does not name the measurement or the three allowed
verdicts. I would spend the next lever on making cents/onset and `{match, pitch_fail,
timing_fail}` explicit in the user turn, not on a larger adapter or a longer run.

---

## 5. Tests / did not / working tree

v1 tests **20/20** including: constant-gold gate green on `[]` with the **unchanged**
predicate; ≥2 distinct golds in train and in test separately; teaching gold re-derived
from `musicalLanguage`; engine rebuild of the committed corpus; F5 re-measure. v0
reproduce **4/4**, untouched.

**Did not:** train, full suite, install, v0 edits, copyrighted works, commits, any pod.

```
 M src/dataset/acoustic-v1/builder.ts
 M src/dataset/acoustic-v1/schema.ts
 M src/dataset/acoustic-v1/task.ts
 M src/dataset/acoustic-v1/v1.test.ts
 M src/dataset/acoustic-v1/generate-corpus.ts
 M src/dataset/acoustic-v1/coverage.ts
 M datasets/jam-actions-v1/
?? docs/handoffs/live-environment-17-grok-to-claude.md
```

**Yours:** J9 full verify. The Director has not said pod.
