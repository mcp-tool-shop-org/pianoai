# Handoff 49 — Grok Build to Claude: four-draw corpus of the eleven songs

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 48.** Branch `main` @ `9c3ad44`. I did **not** run the full suite. Did not
touch `datasets/**`, `docs/hf-cards/**`, `songs/**`, or `docs/zenodo/**`. Chunk 46
is still open.

Commit: **`9c3ad4436c6d288365c8a999b76d48fa75b05bb6`**
(`dataset: four-draw corpus of the eleven songs`).

---

## D3 — the four-draw corpus

`V1_F5_DRAWS=4` `--out experiments/coverage-v1-sft/corpus-4draw`, then
`V1_RECORDS=…/records.jsonl` `V1_OUT=experiments/coverage-v1-sft/data-4draw`.

**213 records** (released 146). Split by song, same three held out.

| family | train | test | n | vs released |
|---|---|---|---|---|
| acoustic | 96 | 36 | **132** | 48 / 17 / 65 |
| chord | 7 | 3 | 10 | same |
| compare | 4 | 0 | 4 | same |
| ensemble | 4 | 3 | 7 | same |
| harmony | 13 | 6 | 19 | same |
| key_moments | 6 | 2 | 8 | same |
| measures | 8 | 3 | 11 | same |
| teaching_goals | 8 | 3 | 11 | same |
| transpose | 8 | 3 | 11 | same |
| **total** | **154** | **59** | **213** | 106 / 40 / 146 |

Acoustic takes per (song, class): **4** on all 33 pairs (11 songs × 3 kinds).
Attempted 132, clearance drops 0. The released 2-draw corpus attempted 66 and
dropped 1, so kept acoustic is 132 vs 65, not 130. rank01's domain grows with
the draw count, so that drop need not recur. Slots are exactly 2× (66 → 132).

SFT: `sft-train 154` `sft-test 59` `gold-test 59`. format-sft notes `compare=4`
train-only, as on the released set.

**sft-train.jsonl sha256**
`a558e79c63093eaa9c3620b56afaae2f2735229d771c594a4b076eba4658b890`

**Other families identical to the released corpus.** Filtered
`family !== "acoustic"` from `datasets/jam-actions-v1/records.jsonl` and from
`corpus-4draw/records.jsonl` (81 records). `JSON.stringify` of each record
matches in the same order. Checked with a one-off script over the two jsonl
files; not committed.

`coverage.json` `floors_met` is false: majority shape share 62% (the denser
acoustic family). `writeV1Corpus` still asserts the 50% shape-share floor when
draws is 2; it does not throw for a non-2-draw scratch dest. The released
directories stay frozen.

---

## D1 / D2 / D5

- `F5_DRAWS` stays **2**. `resolveF5Draws()` reads `V1_F5_DRAWS` (positive
  integer; anything else throws with the value in the message). `drawKeys` and
  `buildAcousticRecord` use the resolved value.
- `--out <dir>` on `generate-corpus.ts`; default dest unchanged. Writing into
  `datasets/jam-actions-v1` or `datasets/jam-actions-v1-probe` when draws ≠ 2
  throws: `the released corpus is frozen at 2 draws`.
- Test name:
  `V1_F5_DRAWS=4 yields exactly twice the acoustic records of the default for the same inputs, and the non-acoustic records are byte-identical`
  in `src/dataset/acoustic-v1/v1.test.ts` (engine block, skipped under
  `SKIP_DSP_VERIFICATION=1`). **Passed.** Asserts attempted 2×, kept+dropped 2×,
  non-acoustic `JSON.stringify` equal. Three fast tests beside it: default 2,
  reject `nope`/`0`/`-1`/`2.5`, refuse the frozen dirs at draws=4.

---

**Yours:** J26 full verify, then the 3B on `data-4draw` seed 13 on the pod.
