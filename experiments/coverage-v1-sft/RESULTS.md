# Coverage v1 — first run, seed 13

Trained 2026-09-08 on a RunPod RTX 6000 Ada. One seed. Everything below is on the held-out
split, none of whose songs appear in training.

**Read the second section before the first.** The headline table is over 100 records; 31 of them
cannot be got wrong.

## The result, as first scored

| condition | accuracy over 100 |
|---|---|
| base model, no format instruction | 0/100 |
| base model, fair prompt | 45/100 |
| LoRA epoch 3 | 52/100 |

## Five families have constant gold, and the run is what found it

| family | records | every gold is | held-out |
|---|---|---|---|
| sections | 27 | `0:none` | 9 |
| teaching_cues | 27 | `0` | 9 |
| teaching_note | 27 | `(none)` | 9 |
| compare | 13 | `different_key` | 4 |
| server | 1 | `54` | 0 |

**95 of 305 records, 31 of the held-out 100, measure nothing.** A model that emits the constant
scores 100%; the majority-class baseline *is* the ceiling.

Two of those I first reported as "the base model at ceiling" — teaching_cues and teaching_note at
9/9 each. That was wrong in the way that matters most: the base was not demonstrating knowledge, it
was emitting `0` and `(none)` because those are the only answers. The cause is exact. Those
families read *measure-level* `teachingNote`, `fingering` and `dynamics`, and across all **2,969
measures** on the publishable shelf, **zero** are populated. The song-level `musicalLanguage`
block — the 120 hand-written ones with `teachingGoals`, `keyMoments`, `styleTips` — is populated on
every shelf song, and the corpus never reads it. **The teaching content was never in play.** The
repair is to draw those families from the field that has content.

Sections: no song on the shelf has sections. Compare: every pair happens to differ in key. Server:
one record, train-only.

None of it was caught by the contract's tests. They check floors, leaks, prompt gates and gold
re-derivation; none checked that gold *varies*. That gate now exists in `v1.test.ts`, names the
five, and is **red until the corpus is repaired** — not widened to go green.

## The result over the 69 records that can be got wrong

| condition | accuracy over 69 |
|---|---|
| base model, fair prompt | **27/69 (39.1%)** |
| LoRA epoch 3 | **33/69 (47.8%)** |

Paired: base-only 1, LoRA-only 7. Exact sign test on the 8 discordant pairs: **p = 0.070**. Not
significant at 0.05. Six records, one seed.

## What the six records are

| family | fair base | LoRA | what happened |
|---|---|---|---|
| harmony | 0/14 | **6/14** | learned the word `rejected`, then scored **below** the 7/14 majority baseline |
| acoustic | 0/27 | **0/27** | 54 training examples, train loss 0.02, held-out zero |
| chord, measures, transpose | 25/25 | 25/25 | base already at ceiling; these three are real |
| ensemble | 2/3 | 2/3 | unchanged, n=3 |

**Harmony is vocabulary, not judgement.** Test gold is balanced 7/7; the adapter says `rejected`
nine times of fourteen. It picked up the label and none of the gate, and did worse than always
guessing.

**Acoustic is the finding.** Largest family, 54 training examples, and it went nowhere. The loss
curve says why: 9.9 → 2.02 at the end of epoch 1 → **0.028** at the end of epoch 2 → 0.02. The
model memorised the training songs. On held-out songs it paraphrases: under a *generous* semantic
map — diagnostic only, never the score — 17 of 27 are near-misses like `Timing failure` for
`timing_fail`, and 10 are plainly wrong (`0.3` four times, JSON blobs). The exact-match score is 0
and stays 0. Loosening the scorer to credit paraphrases would be the scorer flattering the model.

## One instruction line was worth the whole baseline

The two base rows differ by one system line appended before generation: *reply with the answer
value alone.* Without it the base answers *"The left hand is playing a **Dm** (D minor) chord in
measure 1"* — gold `Dm` — and scores zero on knowledge it has. I built that control into the
acoustic-sft predictor a day earlier and did not carry it into this one; the first base run came
back 0/100 and I nearly reported it. Reading raw completions caught it, for the second time on this
arc.

## Run facts

| | |
|---|---|
| base model | Qwen/Qwen2.5-3B-Instruct |
| GPU | RTX 6000 Ada, **48.2 GB peak of 49.1** — a 2% margin with per-device batch already 1 |
| training | 3,747 s (62.4 min), 78 steps at ~48.9 s, 3 epochs |
| examples | 205 train / 100 test |
| tokens per epoch | 2,690,972, of which 16,412 assistant (0.6%) |
| max example | 13,375 tokens against max_seq_len 16,384 |
| loss | 9.905 → 2.02 → 0.028 → 0.02 |
| seed | 13 |
| cost | ~$1.90 — $1.60 on this pod, ~$0.30 on a host with no working CUDA |

Three consecutive deploys landed on a host whose `nvidia-smi` worked and whose CUDA context did
not; the good host handed out `/dev/nvidia3` and trained fine, so the device index was a red
herring. `runpod.mjs` gained a GPU-type pin to move pools.

**The pod teardown after this run terminated another session's pod.** `down --all` was
account-wide, I ran it without listing, and I cut the output line that would have said so. That
command no longer exists; the incident and the fix are in handoff 15. It is recorded here because
this run is where it happened.

Adapter weights are not in git — 376 MB across three epochs. The receipt beside the predictions
carries the seed, the data SHA-256, every hyperparameter, package versions and the loss curve.

## What this run does not show

One seed. A third of the corpus measuring nothing. A largest family that memorised rather than
generalised. A gain that is not significant once the constant-gold records are removed. No adapter
is published.

The next step is not another seed. It is the repair: teaching families drawn from the
`musicalLanguage` block that actually has content, compare pairs that share a key, sections from
songs that have them or the family cut, server cut. Then the gate goes green on its own, and a
second seed means something.
