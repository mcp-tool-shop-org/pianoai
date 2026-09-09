# Coverage v1 — the eleven-song release corpus: what the recipe does with 146 records

Trained 2026-09-09 (UTC) on a RunPod RTX 6000 Ada (48 GB; both Blackwell pools were out of stock),
the standing recipe (bf16 LoRA r16/α32, cosine 1.5e-4, 1×8, three epochs, max_seq_len 16384,
shown-work targets, `--max-new-tokens 128`) on the corpus this dataset ships as: 146 records over
the eleven songs whose arrangements carry a verified licence, 106 train / 40 test by song (three
songs held out), with a 24-take near-gate probe on those three. The 27-song working corpus behind
`RESULTS-r32.md` and `RESULTS-r34.md` — 54/54, 116/117, 72/72 — was found unpublishable by the
provenance audit; those numbers stand as measurements and this document is what the *published*
corpus supports.

## 3B — two seeds

| condition | acoustic (17) | overall (40) | probe (24) |
|---|---|---|---|
| three-way floor | 5.7/17 | — | 8/24 |
| 3B base | 5/17 | 20/40 | 6/24 |
| **3B, seed 13** | **14/17** | 32/40 | 11/24 |
| **3B, seed 42** | **12/17** | 32/40 | 13/24 |

Held out: seed 13 vs base 0 vs 9, p = 0.004; seed 42 vs base 2 vs 9, p = 0.065. Probe: seed 13 vs
base 3 vs 8, p = 0.23; seed 42 similar. Per band on the probe, both seeds: `onset_out` 0/6,
`cents_out` 1–4/6.

What the lines say, seed 13 on the 17 held-out takes: 17/17 parse, 17/17 copy both numbers, the
word follows the model's own subtraction 17/17 — and the subtraction is right on 13/17. The four
slips are sign errors, three of which flip the label: `|8.0| − 50 = 42.0, against`,
`|20.3| − 50 = 29.7, against`, and one take where the cents value was written into the onset slot.
On the probe, seed 13's subtraction is right on 7/24.

Seed 42 fails differently: it invents gate words the corpus never used — `within 40`, `beyond`,
`outside`, `66.3 > 40`, `behind` — on 7 of 17 lines, and twice writes `inside` after a positive
subtraction (`= 33.3, inside`, `= 40.1, inside`).

**Reading.** On the 27-song corpus (~110 acoustic training takes) the same recipe locked the format,
the copy, the arithmetic and the vocabulary, twice, and compared correctly at the gate 70–72 times
in 72. On the eleven-song corpus (~45 acoustic training takes) it locks the format and the copy and
does not lock the arithmetic or the vocabulary; near the gate it is not significantly better than
the base. The recipe is not the difference; the data size is. This is the number the dataset card
carries, because it is the dataset the card is for.

## 7B — one seed

| condition | acoustic (17) | overall (40) | probe (24) |
|---|---|---|---|
| 7B base | 7/17 | 29/40 | 12/24 (says `match` to everything) |
| **7B, seed 13** | **16/17** | **37/40** | **24/24** |

Held out: base vs adapter 0 vs 9, p = 0.004. Probe: 0 vs 12, p = 0.0005; every band 6/6.

Lines: 16/17 held-out lines parse and copy both numbers with the subtraction exact on 15 (the one
slip, `|10.0| − 50 = −39.9`, does not touch the label); on the probe 24/24 parse and copy, 22/24
exact, and the word follows the model's own subtraction 24/24. The one held-out miss is a
pitch_fail read as match. Loss 9.51 → 1.65 → 0.41 → 0.080.

**Reading.** The 7B learns the comparison from the same 45 acoustic training takes the 3B could
not lock: 24/24 near the gate on songs it never saw, with the arithmetic and the vocabulary stable.
Trained on an H100 NVL (96 GB): the 7B at this sequence length does not fit a 48 GB card — the
Ada attempt OOMed at step 0 and again at step 5 with expandable segments.

## The rest of the table

| family | 3B base | 3B s13 | 3B s42 | 7B base | 7B s13 |
|---|---|---|---|---|---|
| acoustic | 5/17 | 14/17 | 12/17 | 7/17 | **16/17** |
| chord | 1/3 | 2/3 | 3/3 | 3/3 | 3/3 |
| ensemble | 0/3 | 3/3 | 3/3 | 3/3 | 3/3 |
| harmony | 5/6 | 3/6 | 3/6 | 6/6 | 5/6 |
| key_moments | 0/2 | 1/2 | 2/2 | 1/2 | 1/2 |
| measures, teaching_goals, transpose | 9/9 | 9/9 | 9/9 | 9/9 | 9/9 |
| **overall** | **20/40** | **32/40** | **32/40** | **29/40** | **37/40** |

Harmony: the 3B base gets 5/6 from the shown quantities alone and both 3B adapters fall to 3/6 —
with 6 held-out harmony records, one flip is a sixth. Compare is train-only on this split (the
three held-out songs have three different keys).

## Run facts

| | |
|---|---|
| GPU | NVIDIA RTX 6000 Ada 48 GB |
| 3B | 42 steps at ~38 s, 32 min per seed |
| 7B | first attempt OOM at step 0 (31.4 GiB allocated + 8.75 reserved of 47.5); retried with `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True` — OOM again at step 5 (39.6 GiB + 7.6 GiB step). Trained on an H100 NVL 96 GB: 42 steps at ~23 s, 20 min. |
| examples | 106 / 40, probe 24; tokens min 13,035 / median ~13,180 / max 13,382 |
| receipts | `runs/r40/run-config-A3b.json`, `run-config-A3bs42.json`, `run-config-A7b.json`; predictions for both bases and every adapter, main and probe |
| cost | Ada ~1.75 h at $0.74 ≈ $1.30 (both 3B seeds, both bases, the failed 7B attempts); H100 NVL ~0.4 h at $2.59 ≈ $1.05; one orphan from the pool walk torn down within minutes. ≈ $2.45. Every pod torn down; `list` empty. |

## What follows from this

- The dataset ships. Its value is the corpus, the contract, the probe and the record of how the
  target was found — not an adapter trained on it.
- **The 7B adapter ships; the 3B does not.** Two 3B seeds at 14/17 and 12/17 held out and 11/24 and 13/24 near the gate are a limit to report, not an artefact to publish. The 7B at 16/17 and 24/24 is one seed and is published as one seed, with its base licence (Apache-2.0) stated.
- The lever that would restore the 27-song result inside the licence is more verified songs: every
  Mutopia piece is public domain and every Krueger piece is CC-BY-SA, and the library's provenance
  blocks now make adding one a matter of evidence rather than trust.
