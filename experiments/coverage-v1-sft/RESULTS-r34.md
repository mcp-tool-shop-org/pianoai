# Coverage v1 — the 371-record corpus: every family shows its work

Trained 2026-09-09 (UTC) on a RunPod RTX PRO 6000 Blackwell, seed 13, the standing recipe (bf16
LoRA r16/α32, cosine 1.5e-4, 1×8, three epochs, max_seq_len 16384), on the chunk-34 corpus:
371 records, 254 train / 117 test by song. Beyond `RESULTS-r32.md` the acoustic target is unchanged;
harmony and compare now show their work too, and — the part that matters — their tool results now
carry the quantities that decide the verdict:

> `verify_harmony` → `{ intended: "Bsus2", detected: "Csus2", chromatic: 0, scored: 17 }`
> assistant: `intended Bsus2, detected Csus2: different; chromatic 0/17 = 0.000 − 0.2 = −0.200, inside: rejected`
>
> `compare_songs` → `{ key_a: "Eb major", key_b: "F major" }`
> assistant: `Eb major, F major: different: different_key`

Compare carries every same-key pair the split allows, matched with equal different-key: 14 → 36
records (30 train, 6 test). The base is predicted once on the new prompts (`--max-new-tokens 128`
throughout). The test split's 117 ids are the same as before; only their tool turns changed.

## Result

| family | 3B base | **3B adapter** | 3B adapter on the 349 corpus (`RESULTS-r32.md`) |
|---|---|---|---|
| acoustic | 23/54 | **54/54** | 54/54 |
| chord | 0/7 | 7/7 | 7/7 |
| compare | 6/6 | **6/6** | 2/6 |
| ensemble | 1/3 | 3/3 | 1/3 |
| harmony | 13/14 | **14/14** | 7/14 |
| key_moments | 0/6 | 5/6 | 5/6 |
| measures | 8/9 | 9/9 | 9/9 |
| teaching_goals | 6/9 | 9/9 | 9/9 |
| transpose | 9/9 | 9/9 | 9/9 |
| **overall** | **66/117** | **116/117** | 103/117 |

The one miss is a key_moments record. Base vs adapter on acoustic: 0 vs 31, p ≈ 10⁻⁹.

Near-gate probe (72 takes, never trained on): **72/72** — 18/18 in every band; all 72 lines parse,
all 72 copy the numbers, 68 subtractions exact (the four slips are the `|20.1| − 50` carrier as in
every run), words follow the model's own arithmetic 72/72.

Acoustic lines on the main split: 54/54 parse, 53 subtractions exact, words follow the arithmetic
54/54 and the true predicate 54/54.

## The thing to say plainly about harmony and compare

With the deciding quantities in the tool result, the **base** scores harmony 13/14 and compare 6/6
with no adapter at all. Before chunk 34, `verify_harmony` echoed the proposal back and no tool
returned a key, so the only way to the verdict was through the engine the model could not see; the
adapter sat at the majority class for five runs and compare never left chance. The repair was not a
training change and it did not need one. It was a tool that returned what it measured. The adapter's
contribution on those two families is the format and the last record.

That is the same lesson as the acoustic arc from the other side: the model can compare two things it
is shown; it cannot compare a thing it is not shown, and no adapter makes it.

## Loss

9.85 → 0.89 → 0.068 → 0.045. Lower than the 349 runs (0.11): more shown-work targets, fewer bare
labels to memorise.

## Run facts

| | |
|---|---|
| GPU | RTX PRO 6000 Blackwell Server Edition, 96 GB — shared with the seed-42 run of `RESULTS-r32.md` |
| training | 96 steps at ~20.4 s, 35 min |
| examples | 254 / 117; tokens min 13,035 / median 13,182 / max 13,382 |
| receipts | `runs/r34/run-config-A3.json`, `runs/r34/r34.log`; predictions for base, epoch 3 main, epoch 3 probe |
| adapter | `runs/r34/A3/epoch3` (126 MB), on disk, not in git |
| cost | seed 42 + this run ≈ 1.45 h at $1.69/hr ≈ $2.45; torn down by state-file id, `list` empty |

## Standing of the corpus

`datasets/jam-actions-v1/` at 371 records is the corpus this result was trained on and the one to
publish. Its history on this arc, each step a repair the previous run exposed: 268 (five
constant-gold families) → 268 repaired → acoustic prompt de-leaked → magnitudes varied → comparison
line → onset varied, signed pitch_fail, two draws, two-sided gate → sign uninformative → arithmetic
target → harmony and compare show their work. Tool-less on the user turn alone: 31/117, at or below
the three-way floor in every family.
