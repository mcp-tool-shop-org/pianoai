# Coverage v1, r48 — a second 7B seed, and the 3B on a denser draw of the same eleven songs

Trained 2026-09-09 (UTC), the standing recipe (bf16 LoRA r16/α32, cosine 1.5e-4, 1×8, three epochs,
max_seq_len 16384, shown-work targets, `--max-new-tokens 128`), two questions left open by
`RESULTS-r40.md`:

1. The 7B that ships was one seed. Is it one seed's luck?
2. The 3B locked the gate comparison on the 27-song corpus (~110 acoustic training takes) and did
   not on the eleven-song corpus (48 takes). Was the limit the number of takes, or the number of
   songs? The takes are synthetic, so the first can be tested without new songs: four draws per
   (song, class) instead of two (chunk 48, `corpus-4draw/`, 213 records, acoustic 96 train / 36
   test; every non-acoustic record byte-identical to the released corpus).

## 7B — second seed on the released corpus

| condition | acoustic (17) | overall (40) | probe (24) |
|---|---|---|---|
| 7B base | 7/17 | 29/40 | 12/24 |
| 7B, seed 13 (`RESULTS-r40.md`) | 16/17 | 37/40 | 24/24 |
| **7B, seed 42** | **17/17** | **38/40** | **24/24** |

Same data (sha `1cc28b84…`), same recipe, different seed. Final loss 4.148 vs 4.139. On the probe
both seeds parse 24/24, copy both numbers 24/24, the word follows the model's own subtraction
(23/24 and 24/24), and the label follows the true predicates 24/24. Seed 42's subtraction is exact
on 21/24 to seed 13's 22/24; the two slips they share are the same take, `|42.0| − 50` written as
−7.9, which does not touch the label. The one 7B miss of r40 (a pitch_fail read as match) is not
repeated; the two misses on the 40 are harmony 5/6 and key_moments 1/2, as at seed 13.

**Reading.** The shipped result replicates. Both seeds are published.

## 3B — four draws of the same eleven songs

The four-draw corpus keeps the split by song (the same three held out) and changes only the
acoustic family: 132 takes, four per (song, class) on all 33 pairs, no clearance drops. The 65
released acoustic ids reappear with the same class and gold but different drawn values, so the
four-draw test (36 takes) is a different held-out set from the released one (17); the adapter is
scored on both, and on the probe.

| condition | four-draw test, acoustic (36) | released test, acoustic (17) | released overall (40) | probe (24) |
|---|---|---|---|---|
| 3B base | 13/36 | 5/17 | 20/40 | 6/24 |
| 3B, seed 13, two draws (`RESULTS-r40.md`) | — | 14/17 | 32/40 | 11/24 |
| 3B, seed 42, two draws (`RESULTS-r40.md`) | — | 12/17 | 32/40 | 13/24 |
| **3B, seed 13, four draws** | **36/36** | **17/17** | **38/40** | **23/24** |
| **3B, seed 42, four draws** | **36/36** | **17/17** | 37/40 | **24/24** |

Four-draw test: base vs adapter 0 vs 23, p = 2.4e-7. Probe: 1 vs 18, p = 7.6e-5; per band
`onset_in` 6/6, `onset_out` 6/6, `cents_in` 5/6, `cents_out` 6/6.

Seed 42, on the Ada 48 GB: final loss 3.579 to seed 13's 3.577. Its lines are exact on 36/36 of its own held-out takes and 17/17 of the released ones, 22/24 on the probe (two 0.2–1.0 slips on the cents term, no label touched); the word follows its own subtraction and the true predicates on every line of all three sets. Held-out overall 37/40: harmony 4/6 where seed 13 had 6/6.

Lines, seed 13 on four draws: 36/36 parse and copy both numbers on its own held-out takes, 35/36
exact; 17/17 and 16/17 on the released takes; 24/24 and 19/24 on the probe. The word follows the
model's own subtraction on every line of all three sets. The five probe slips are of 0.2 magnitude
on the cents term (`|20.1| − 50` written as −30.1) and touch no label except one: `|−47.9| − 50`
written as +2.1, read as `against`, the single probe miss. No invented gate word on any line;
seed 42 on two draws had invented five.

**Reading.** With 96 acoustic training takes drawn from the same eleven songs the 3B locks the
arithmetic and the vocabulary and compares at the gate 23 and 24 times in 24, at two seeds — the
27-song result, inside the licence. The limit in r40 was the number of takes, not the number of songs. Held-out overall
goes from 32/40 to 38/40 on the released test; the harmony family, which both two-draw seeds had
dropped to 3/6, is 6/6, so the denser acoustic family did not crowd the others out.

## Run facts

| | |
|---|---|
| pod | RunPod RTX PRO 6000 Blackwell Workstation Edition 96 GB, `5hjrb1ib71pi28`, $1.69/h, up 09:28–10:35 local; torn down by id, `list` empty |
| 7B s42 | 42 steps at ~36 s, 24 min train, 26 min wall |
| 3B four-draw s13 | 60 steps at ~22 s, 22 min train |
| 3B four-draw s42 | RunPod RTX 6000 Ada 48 GB, `u6xj150ellaz4g`, $0.74/h, up 10:36–11:40 local; 60 steps at ~46 s, 46 min train; torn down by id, `list` empty |
| receipts | `runs/r48/run-config-A7bs42.json`, `run-config-A3b4d.json`, `run-config-A3b4ds42.json`; predictions for every adapter on every set named above; the 3B base on the four-draw test |
| data | released `data/` sha `1cc28b84…`; four-draw `data-4draw/` sha `a558e79c…` (chunk 48, commit `9c3ad44`) |
| cost | Blackwell 1.1 h ≈ $1.90; Ada 1.1 h ≈ $0.80; ≈ $2.70 for the three runs |

## What follows from this

- The 7B adapter that ships is now two seeds, both published (`7b-s13/`, `7b-s42/`).
- The 3B on four draws, two seeds, is reported here and on the card. Publishing it needs the corpus it was
  trained on to be published first, as jam-actions-v1 1.1.0 (same eleven songs, same provenance,
  four draws); that is a new dataset version with a new version DOI and is the Director's call.
  Its base licence (Qwen Research, non-commercial) stands as before.
- A song count of eleven is enough for this recipe once each song contributes about nine acoustic
  training takes. More songs remain the lever for generality; more draws is the lever for the
  comparison.
