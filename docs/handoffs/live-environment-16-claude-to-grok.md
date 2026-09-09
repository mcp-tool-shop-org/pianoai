# Handoff 16 — Claude to Grok Build: five constant-gold families, and the field we never read

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 16.** Branch `main`. **Pull first** — the teardown fix and incident report are committed;
the red gate and the corrected RESULTS.md are in the working tree, uncommitted, on purpose.

---

## 1. Your gate found more than I named, and I verified every one

| family | records | every gold is |
|---|---|---|
| sections | 27 | `0:none` |
| teaching_cues | 27 | `0` |
| teaching_note | 27 | `(none)` |
| compare | 13 | `different_key` |
| server | 1 | `54` |

95 of 305 records, 31 of the held-out 100. Recounted from `records.jsonl`. The gate expects
`["compare", "sections"]` and receives all five; it stays red and the list stays at two until the
corpus changes. You were right to leave it.

## 2. The cause of the two that hurt most

`teaching_cues` and `teaching_note` read **measure-level** `teachingNote`, `fingering` and
`dynamics`. Across all **2,969 measures** on the publishable shelf, **zero** are populated. The
**song-level** `musicalLanguage` block — `description`, `structure`, `keyMoments`, `teachingGoals`,
`styleTips`, hand-written for all 120 songs, populated on every one of the 30 shelf songs — is never
read by the corpus.

That is the thing the Director was angry about two chunks ago, and it turns out we had touched it
in name only. I reported those families as "base at ceiling, 9/9". The base was emitting `0` and
`(none)` because nothing else exists. My error, corrected in RESULTS.md.

## 3. What it does to the result

Over the 69 held-out records that can be got wrong: fair base 27 (39.1%), LoRA 33 (47.8%),
discordant 1 vs 7, **p = 0.070**. Not significant. The +7 I reported over 100 included a compare
record that could not be wrong.

## 4. The chunk: repair, not widen

**B1. Teaching families drawn from `musicalLanguage`.** Gold must vary and must be constructible:

- `teachingGoals` is a list per song. A task like "how many teaching goals does this song
  declare?" has exact gold and varies across songs. "Which is the first?" likewise — but gold is a
  hand-written string, so exact-match scoring of a *generated* answer is brittle. Prefer counts,
  positions and membership questions over free-text reproduction.
- `keyMoments` are measure-anchored prose ("Measures 1-3, the spare opening…"). "Which measure
  range does the first key moment name?" is exact and varies.
- `styleTips` similarly.
- If a family's only honest gold is reproduction of hand-written prose, say so and do not ship it;
  rule 1 forbids hand-written labels and this would be them by the back door.

**B2. Compare gets same-key pairs**, constructed so both classes are populated by design, not by
luck. If the shelf cannot supply enough same-key pairs to populate the class, say how many it can.

**B3. Sections.** No shelf song has sections. Either derive them from something real
(`musicalLanguage.structure` is prose; `list_sections` returns nothing) or **cut the family**. Do
not synthesise section markers to make the family exist.

**B4. Server: cut.** One record, train-only, constant.

**B5. The gate goes green by the corpus changing.** `KNOWN_DEGENERATE` shrinks to `[]` when every
family varies. If any family is legitimately constant after repair, argue it in the handoff; the
default is that it does not ship.

**B6. Coverage floors re-derived** after cuts, and the tool-less baseline re-run on the repaired
held-out set with per-family numbers.

**B7. Acoustic is not this chunk**, but name what you see: 54 training examples, train loss 0.02,
held-out 0/27 with 17 paraphrases. Whether that is a capacity problem, an epoch problem, or the
measurement needing to be explicit in the prompt the way the working families are — I would
rather have your read than mine.

## 5. Tests

- The existing gate, unchanged, green.
- Every scored family has ≥ 2 distinct gold values in **train and in test separately**, not only
  across the corpus. A family whose test gold is constant is degenerate for evaluation even if
  train varies.
- Gold re-derived from `musicalLanguage` for every teaching record.
- v0 reproduction gate untouched and passing.

## 6. Do not

- Do not widen `KNOWN_DEGENERATE`.
- Do not hand-write a label, including via prose reproduction.
- Do not deploy anything. **No pod.** The Director has not said so.
- Do not modify `datasets/jam-actions-acoustic-v0/`.
- Do not run the full suite; the juncture is mine.

## 7. What to say back

`docs/handoffs/live-environment-17-grok-to-claude.md`, five parts. State plainly:

1. Which families were cut and which repaired, with the distinct-gold count per family in train
   and test.
2. The tool-less baseline per family on the repaired held-out set.
3. How many same-key compare pairs the shelf could supply.

## 8. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J8 | chunk 14 | full verify, v0 gate, tool-less baseline | **DONE**, then found wanting |
| J9 | end of this chunk | full verify, gate green on its own, baseline across repaired families | mine |
| — | any pod | Director's word only | — |
