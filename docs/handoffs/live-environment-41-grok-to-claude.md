# Handoff 41 — Grok Build to Claude: eleven songs, derived from the library blocks

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 40.** Branch `main` @ `40e4c01`. Chunk 38 superseded in the tree. I did **not** run
the suite. Did not edit `songs/**`, `src/songs/**`, `scripts/provenance-audit.ts`,
`scripts/download-library.ts`, `src/songs/config/schema.ts`, or
`docs/findings/library-provenance-audit.md`. **No pod. No push.**

A1 needed no field the other session did not write.

---

## 1. Derived allowlist

Filter: `arrangement_license` ∈ {CC-BY-SA-3.0-DE, Public-Domain}, `title_verdict` ≠
`contradicts`, id ∉ `FORBIDDEN_IDS` (clair-de-lune, satie-gymnopedie-no1,
debussy-arabesque-no1). Locked by test to these eleven ids.

| id | licence | verifier |
|---|---|---|
| bach-prelude-c-major-bwv846 | CC-BY-SA-3.0-DE | http://piano-midi.de/copy.htm |
| fur-elise | CC-BY-SA-3.0-DE | http://piano-midi.de/copy.htm |
| mozart-k545-mvt1 | CC-BY-SA-3.0-DE | http://piano-midi.de/copy.htm |
| bethena | Public-Domain | https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=463 |
| elite-syncopations | Public-Domain | https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1540 |
| maple-leaf-rag | Public-Domain | https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=23 |
| peacherine-rag | Public-Domain | https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=335 |
| pineapple-rag | Public-Domain | https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=1899 |
| solace | Public-Domain | https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=482 |
| the-easy-winners | Public-Domain | https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=352 |
| the-entertainer | Public-Domain | https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=263 |

Record provenance is copied from that block (`source_url`, `arrangement_creator`,
`arrangement_license`, `arrangement_evidence_url` = `terms_url`, `verifier`,
`verified_at`). `source_type` remains `downloaded-arrangement`. `verifier` is the
library evidence string, never `v1-builder`.

---

## 2. Corpus counts

**146 records**, 106 train / 40 test. **11 songs**, 8 train / **3 held out**
(solace, the-easy-winners, the-entertainer). Genres 2. Schema `jam-actions-v1/1.0.0`.

| family | train | test | n |
|---|---|---|---|
| acoustic | 48 | 17 | 65 |
| harmony | 13 | 6 | 19 |
| compare | 4 | **0** | 4 |
| chord | 7 | 3 | 10 |
| measures | 8 | 3 | 11 |
| transpose | 8 | 3 | 11 |
| teaching_goals | 8 | 3 | 11 |
| key_moments | 6 | 2 | 8 |
| ensemble | 4 | 3 | 7 |

Acoustic: 11 × 3 × 2 = 66 attempted, **1 clearance drop**. Held-out acoustic 17 (one
drop on the test side). **Compare is train-only** (4 records): the three held-out
songs are three keys, so zero same-key pairs without a new song or a straddle. I
did not loosen the pair rule.

**Floors restated:** `COVERAGE_FLOORS.songs` **14 → 10** (`>` 10, we have 11).
Tools 9, shapes 7 unchanged. Builder shelf check `>= 11`. Genre is not a coverage
floor; count stays 2.

Probe: **24** records (3 songs × 4 bands × 2 signs), all test.

SFT: `sft-train 106  sft-test 40`. Probe: `sft-test 24`. format-sft notes
`compare=4` train-only.

---

## 3. Tool-less (mistral-small:24b, user turn only, 40 held-out)

| family | tool-less |
|---|---|
| acoustic | **5/17 = 29.4%** |
| chord | 1/3 |
| ensemble | 0/3 |
| harmony | 4/6 |
| key_moments | 0/2 |
| measures | 0/3 |
| teaching_goals | 0/3 |
| transpose | 0/3 |
| **total** | **10/40 = 25.0%** |

Compare is not scored. Acoustic is at/under the three-way floor. Overall under 50%.

---

## 4. V3 on the eleven files

All 11 **ok**.

```
bach-prelude-c-major-bwv846 titles=18 copyrights=1 ok
bethena titles=5 copyrights=0 ok
elite-syncopations titles=5 copyrights=0 ok
fur-elise titles=14 copyrights=1 ok
maple-leaf-rag titles=5 copyrights=0 ok
mozart-k545-mvt1 titles=21 copyrights=1 ok
peacherine-rag titles=5 copyrights=0 ok
pineapple-rag titles=5 copyrights=0 ok
solace titles=5 copyrights=0 ok
the-easy-winners titles=5 copyrights=0 ok
the-entertainer titles=5 copyrights=0 ok
```

---

## 5. Banner guard

```
halt: docs/hf-cards/jam-actions-v1.md still carries a DRAFT banner; generator refuses to build a public set from a draft card
```

Public directories were not written. Test name:
`refuses to build a public set whose card still carries a DRAFT banner`.

---

Allowlist 4/4, public 10 (6 skipped), probe 7/7, v1 46/46, v0 reproduce 4/4.

**Yours:** J21 full verify on the combined tree, identity scan, then two commits:
the library audit, then the dataset. Retrain is Director's word.
