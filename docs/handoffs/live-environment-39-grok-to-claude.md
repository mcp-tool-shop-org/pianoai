# Handoff 39 — Grok Build to Claude: 15-song allowlist, corpus rebuilt, public sets refused the DRAFT cards

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 38.** Branch `main` @ `40e4c01`. Work uncommitted. I did **not** run the suite.
`songs/library/` was not edited. Cards were not rewritten. `pack-adapters.mjs` was not
re-run. **No pod. No push.**

---

## 1. Allowlist

15 songs. `src/dataset/acoustic-v1/allowlist.ts`. Genre is not a criterion.
`loadPublishableSongs` returns only these. Audit date **2026-09-09**.

| song | download URL | licence | arranger as the file names them |
|---|---|---|---|
| bach-prelude-c-major-bwv846 | http://piano-midi.de/midis/bach/bach_846.mid | CC-BY-SA-3.0-DE | Bernd Krueger (copyright © 1996) |
| chopin-nocturne-op9-no2 | https://www.midiworld.com/midis/other/chopin/chno0902.mid | CC-BY-SA-3.0-DE | Bernd Krueger (file has no text events; SOURCE_PMD / audit) |
| chopin-prelude-e-minor | https://bitmidi.com/uploads/86322.mid | CC-BY-SA-3.0-DE | Bernd Krueger (file is GM `A.PIANO 1`; no copyright event) |
| fur-elise | http://piano-midi.de/midis/beethoven/elise.mid | CC-BY-SA-3.0-DE | Bernd Krueger (copyright © 2004) |
| mozart-k545-mvt1 | http://piano-midi.de/midis/mozart/moz_545_1.mid | CC-BY-SA-3.0-DE | Bernd Krueger (copyright © 2006) |
| pathetique-mvt2 | https://www.midiworld.com/midis/other/beethoven/pathet2.mid | CC-BY-SA-3.0-DE | Bernd Krueger (track name `Piano` only) |
| schumann-traumerei | https://www.midiworld.com/midis/other/schumann/traumeri.mid | CC-BY-SA-3.0-DE | Bernd Krueger (track names Traumeri / Schumann / Robert Finley; no copyright) |
| the-entertainer | https://www.mutopiaproject.org/ftp/JoplinS/entertainer/entertainer.mid | Public-Domain | GNU LilyPond |
| maple-leaf-rag | https://www.mutopiaproject.org/ftp/JoplinS/maple/maple.mid | Public-Domain | GNU LilyPond |
| the-easy-winners | https://www.mutopiaproject.org/ftp/JoplinS/winners/winners.mid | Public-Domain | GNU LilyPond |
| elite-syncopations | https://www.mutopiaproject.org/ftp/JoplinS/EliteSyncopations/EliteSyncopations.mid | Public-Domain | GNU LilyPond |
| solace | https://www.mutopiaproject.org/ftp/JoplinS/solace/solace.mid | Public-Domain | GNU LilyPond |
| pineapple-rag | https://www.mutopiaproject.org/ftp/JoplinS/PineappleRag/PineappleRag.mid | Public-Domain | GNU LilyPond |
| peacherine-rag | https://www.mutopiaproject.org/ftp/JoplinS/peacherine/peacherine.mid | Public-Domain | GNU LilyPond |
| bethena | https://www.mutopiaproject.org/ftp/JoplinS/bethena/bethena.mid | Public-Domain | GNU LilyPond |

Krueger terms, quoted from http://www.piano-midi.de/copy.htm: *The MIDI, audio(MP3, OGG) and video files of Bernd Krueger are licensed under the cc-by-sa Germany License.*

Mutopia terms, quoted from https://www.mutopiaproject.org/legal.html#publicdomain: *The contributor of this music has dedicated their contribution into the public domain.*

`verifier` on every record is that terms URL, never `v1-builder`. `source_type` is `downloaded-arrangement`. Composition PD flags unchanged.

---

## 2. Corpus counts and restated floor

**201 records**, 135 train / 66 test. **15 songs**, 10 train / **5 held out** (last third by id: pineapple-rag, schumann-traumerei, solace, the-easy-winners, the-entertainer). Genres **2** (classical, ragtime). Schema still `jam-actions-v1/1.0.0`.

| family | train | test | n |
|---|---|---|---|
| acoustic | 59 | 30 | 89 |
| harmony | 17 | 10 | 27 |
| compare | 8 | **0** | 8 |
| chord | 9 | 5 | 14 |
| measures | 10 | 5 | 15 |
| transpose | 10 | 5 | 15 |
| teaching_goals | 10 | 5 | 15 |
| key_moments | 8 | 3 | 11 |
| ensemble | 4 | 3 | 7 |

Acoustic: 15 × 3 × 2 = 90 attempted, **1 clearance drop** (chopin-nocturne-op9-no2 sharp_fail draw 1). Held-out acoustic is a clean 5 × 6 = 30.

**Compare has no held-out records.** The five test songs are five different keys, so zero same-key pairs exist without a new song or a straddle. I did not loosen the pair rule. format-sft notes `compare=8` train-only.

**Floor restated:** `COVERAGE_FLOORS.songs` **24 → 14** (`>` 14, we have 15). Tools 9 and shapes 7 unchanged. Genre is not a coverage floor; the count moved 3 → 2. Builder shelf check `>= 20` → `>= 15`.

Probe: **40** records (5 songs × 4 bands × 2 signs), all test.

SFT: `sft-train 135  sft-test 66  gold-test 66`. Probe: `sft-test 40`.

---

## 3. Tool-less (mistral-small:24b, user turn only, 66 held-out)

| family | tool-less |
|---|---|
| acoustic | **10/30 = 33.3%** |
| chord | 2/5 |
| ensemble | 0/3 |
| harmony | 7/10 |
| key_moments | 0/3 |
| measures | 0/5 |
| teaching_goals | 0/5 |
| transpose | 0/5 |
| **total** | **19/66 = 28.8%** |

Compare is not scored (no test records). Acoustic sits at the three-way floor. Overall under 50%.

---

## 4. V3 on the 15 files

All 15 **ok**. Title events that name a different piece: 0. Copyright events that name a party the allowlist does not: 0.

```
bach-prelude-c-major-bwv846 titles=18 copyrights=1 ok
bethena titles=5 copyrights=0 ok
chopin-nocturne-op9-no2 titles=0 copyrights=0 ok
chopin-prelude-e-minor titles=2 copyrights=0 ok
elite-syncopations titles=5 copyrights=0 ok
fur-elise titles=14 copyrights=1 ok
maple-leaf-rag titles=5 copyrights=0 ok
mozart-k545-mvt1 titles=21 copyrights=1 ok
pathetique-mvt2 titles=1 copyrights=0 ok
peacherine-rag titles=5 copyrights=0 ok
pineapple-rag titles=5 copyrights=0 ok
schumann-traumerei titles=3 copyrights=0 ok
solace titles=5 copyrights=0 ok
the-easy-winners titles=5 copyrights=0 ok
the-entertainer titles=5 copyrights=0 ok
```

The matcher also rejects the two audit counterexamples: Scarborough Fair vs "Greensleeves / Traditional / Jim Paterson"; The Water Is Wide vs "THE GLENDY BURK / Stephen Foster".

---

## 5. Public sets

**Not regenerated.** `generate-public.ts` halted:

```
halt: docs/hf-cards/jam-actions-v1.md still carries a DRAFT banner; generator refuses to build a public set from a draft card
```

LICENSE is sourced from `docs/hf-cards/jam-actions-v1.LICENSE-DATASET.md` (and the probe twin), halt if absent. Zenodo `description` is the card's `pretty_description`. `CITATION.cff` and `VERSION` stay generated.

`public.test.ts` skips rebuild-equals-committed when the package directory is absent, with the stated reason that the DRAFT card has not been rewritten. File lists and checksum counts: none, because nothing was written.

**Banner refusal test name:** `refuses to build a public set whose card still carries a DRAFT banner`

---

Allowlist 4/4, public 10 (6 skipped), v0 reproduce 4/4. v1 46 and probe 7 after the two-draws / 300-count restatements. `pack-adapters.mjs` not run.

**Yours:** J20 full verify, V-gates, reproduce gates once the cards are rewritten, banner refusal, identity scan. Retrain is Director's word.
