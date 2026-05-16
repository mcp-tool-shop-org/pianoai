# jam-actions-v0 Slice 6 — E2 Phrase Continuation Eval

**Eval date:** 2026-05-16
**Schema version:** `e2-phrase-continuation/1.0.0`
**Harness:** `src/dataset/eval/phrase-continuation.ts`
**Corpus:** 22 prompt/continuation_target pairs, 1 standalone (Für Elise mm. 1-8)

---

## Hard gates

| Gate | Value | Result |
|------|-------|--------|
| Paired integrity (22 pairs, 0 orphans) | 22 pairs, 0 orphans | **PASS** |
| Rhythm diverges from shuffled on ≥3 pairs | 16/22 pairs diverge (cos < 0.95) | **PASS** |
| Groove diverges from shuffled on ≥3 pairs | 17/22 pairs diverge (OA < 0.95) | **PASS** |

**Locked future-model target (deferred — for documentation only):**
Groove OA (model output vs gold) must beat the shuffled-baseline groove OA by ≥0.15.
The shuffled-baseline mean groove OA = **0.647**, so
the model's groove OA must exceed **0.797**.
Equivalently, the groove distance from gold is **0.353**; a model's output groove must land within **(1.0 − 0.353 − 0.15 = 0.497)** of gold.

---

## Aggregate metrics

| Metric | Aggregate | Notes |
|--------|-----------|-------|
| note_overlap_gold_vs_gold | mean=1.000 min=1.000 max=1.000 (22/22 pairs) | sanity — should be 1.0 |
| note_overlap_gold_vs_shuffled | mean=0.180 min=0.000 max=0.574 (22/22 pairs) | note set (weakly order-sensitive) |
| pitch_class_oa_gold_vs_shuffled | mean=1.000 min=1.000 max=1.000 (22/22 pairs) | sanity — should be ≈ 1.0 (same notes) |
| rhythm_gold_vs_shuffled | mean=0.684 min=0.056 max=1.000 (22/22 pairs) | onset grid cosine — should diverge |
| groove_gold_vs_shuffled | mean=0.647 min=0.037 max=1.000 (22/22 pairs) | phrase-level OA — canonical metric |

**Interpretation:**
- `note_overlap_gold_vs_gold` = 1.0 on all pairs (sanity check — comparing gold to itself).
- `pitch_class_oa_gold_vs_shuffled` ≈ 1.0 (shuffling bars preserves note content, confirming the shuffler is correct).
- `rhythm_similarity_gold_vs_shuffled` diverges on **16** pairs — onset grid ordering is destroyed by shuffling.
- `groove_similarity_gold_vs_shuffled` diverges on **17** pairs — phrase-level groove is disrupted when bar order changes.

---

## Per-pair results

| Song | Time sig | Target window | Events | Bars | Shuffle | note_GvG | note_GvS | pitch_OA | rhythm_GvS | groove_GvS |
|------|----------|--------------|--------|------|---------|----------|----------|----------|------------|------------|
| `bach‑prelude‑c‑major‑bwv846` | 4/4 | measures 5-8 | 64 | 4 | ok | 1.000 | 0.333 | 1.000 | 1.000 | 1.000 |
| `bach‑prelude‑c‑major‑bwv846` | 4/4 | measures 13-16 | 64 | 4 | ok | 1.000 | 0.333 | 1.000 | 1.000 | 1.000 |
| `chopin‑nocturne‑op9‑no2` | 4/4 | measures 5-8 | 42 | 4 | ok | 1.000 | 0.217 | 1.000 | 0.553 | 0.453 |
| `chopin‑nocturne‑op9‑no2` | 4/4 | measures 13-16 | 40 | 4 | ok | 1.000 | 0.356 | 1.000 | 0.842 | 0.775 |
| `chopin‑nocturne‑op9‑no2` | 4/4 | measures 21-24 | 50 | 4 | ok | 1.000 | 0.000 | 1.000 | 0.370 | 0.360 |
| `chopin‑prelude‑e‑minor` | 4/4 | measures 5-8 | 45 | 4 | ok | 1.000 | 0.034 | 1.000 | 0.343 | 0.206 |
| `chopin‑prelude‑e‑minor` | 4/4 | measures 13-16 | 45 | 4 | ok | 1.000 | 0.071 | 1.000 | 0.278 | 0.244 |
| `clair‑de‑lune` | 9/8 | measures 5-8 | 47 | 4 | ok | 1.000 | 0.133 | 1.000 | 0.828 | 0.851 |
| `clair‑de‑lune` | 9/8 | measures 19-22 | 134 | 4 | ok | 1.000 | 0.282 | 1.000 | 0.731 | 0.664 |
| `debussy‑arabesque‑no1` | 4/4 | measures 5-8 | 63 | 4 | ok | 1.000 | 0.178 | 1.000 | 0.760 | 0.730 |
| `debussy‑arabesque‑no1` | 4/4 | measures 13-16 | 51 | 4 | ok | 1.000 | 0.146 | 1.000 | 0.944 | 0.843 |
| `fur‑elise` | 3/8 | measures 13-16 | 27 | 4 | ok | 1.000 | 0.080 | 1.000 | 1.000 | 0.963 |
| `mozart‑k545‑mvt1` | 4/4 | measures 5-8 | 75 | 4 | ok | 1.000 | 0.020 | 1.000 | 1.000 | 0.987 |
| `mozart‑k545‑mvt1` | 4/4 | measures 13-16 | 85 | 4 | ok | 1.000 | 0.574 | 1.000 | 1.000 | 0.918 |
| `pathetique‑mvt2` | 4/4 | measures 5-8 | 30 | 4 | ok | 1.000 | 0.000 | 1.000 | 0.609 | 0.467 |
| `pathetique‑mvt2` | 4/4 | measures 13-16 | 27 | 4 | ok | 1.000 | 0.000 | 1.000 | 0.056 | 0.037 |
| `satie‑gymnopedie‑no1` | 3/4 | measures 7-10 | 21 | 4 | ok | 1.000 | 0.105 | 1.000 | 0.889 | 0.857 |
| `satie‑gymnopedie‑no1` | 3/4 | measures 15-18 | 22 | 4 | ok | 1.000 | 0.375 | 1.000 | 1.000 | 1.000 |
| `satie‑gymnopedie‑no1` | 3/4 | measures 23-26 | 27 | 4 | ok | 1.000 | 0.256 | 1.000 | 0.909 | 0.889 |
| `schumann‑traumerei` | 4/4 | measures 5-8 | 42 | 4 | ok | 1.000 | 0.135 | 1.000 | 0.263 | 0.333 |
| `schumann‑traumerei` | 4/4 | measures 13-16 | 39 | 4 | ok | 1.000 | 0.000 | 1.000 | 0.182 | 0.103 |
| `schumann‑traumerei` | 4/4 | measures 21-24 | 40 | 4 | ok | 1.000 | 0.333 | 1.000 | 0.500 | 0.550 |

**Column key:**
- `note_GvG`: Note overlap (Jaccard), gold vs gold — sanity (always 1.0)
- `note_GvS`: Note overlap (Jaccard), gold vs shuffled — weak (shuffling bars usually preserves note-grid tuples)
- `pitch_OA`: Pitch-class histogram OA, gold vs shuffled — sanity baseline (≈ 1.0 expected)
- `rhythm_GvS`: Onset-grid cosine similarity, gold vs shuffled — diverges where bars have different beat patterns
- `groove_GvS`: Phrase-level groove OA, gold vs shuffled — canonical metric (lower = more different from gold)
- `N/C`: not_computable

---

## not_computable audit

_None — all pairs computable on all metrics._

---

## Methodology

### Shuffled-bars negative control

For each continuation_target record C, the shuffled-bars control is generated by:
1. Grouping C's MIDI events by measure number.
2. Shuffling the group order using a deterministic LCG seeded on (numBars × 1000 + numEvents).
3. Reassigning events from shuffled groups to the original measure slots (preserving beat positions within each bar).

This preserves note CONTENT (same pitches, same within-bar positions) but destroys note ORDER (which bar comes first changes the phrase-level timing structure).

### Metric 1 — Note overlap (Jaccard)

Converts events to (pitch, barIndex, beatGridSlot) tuples. Computes Jaccard similarity between gold and reference sets. **Weakly order-sensitive** because bar shuffling can change barIndex values.

Note: for many pairs the note_GvS metric is close to 1.0 even after shuffling, because pitches that repeat across bars hash to the same set. This is expected — the metric is designed for model-output comparison (future slices), not for the shuffled-control distinction test. Rhythm and groove carry the ordering signal.

### Metric 2 — Pitch-class histogram OA

12-bin histogram over MIDI pitch classes (C=0 through B=11), normalized to sum 1. OA = sum of min(p_i, q_i) over all bins. Designed as a **sanity baseline** — gold vs shuffled should both score ≈ 1.0 since shuffling preserves note content. Confirms the shuffler didn't alter pitches.

### Metric 3 — Rhythm / onset-grid cosine similarity

Builds a binary onset-presence vector over the sixteenth-note grid for the full phrase. Each bar's events are placed at absolute phrase positions (barIndex × slotsPerBar + beatSlot). Cosine similarity between gold and shuffled vectors. **Diverges when bars have different rhythmic patterns** (shuffling changes which absolute phrase slots are occupied).

### Metric 4 — Groove similarity (canonical metric)

Builds a phrase-level groove histogram: onset count at each absolute phrase-grid position, normalized to sum 1. OA between gold and shuffled histograms. **Lower OA = more different** (shuffling changes which phrase positions are dense vs sparse). This is the metric the future-model target is locked to.

**Locked future-model target (synthesis Section 4 E2):**
When a model generates a continuation, its groove OA vs the gold must beat the shuffled-baseline groove OA by ≥0.15. The shuffled baseline represents the lower bound a random bar-ordering achieves.

---

## Open questions

1. **Bach prelude pairs show grooveOA = 1.0 vs shuffled.** This is because Bach Prelude in C Major uses an identical arpeggiated pattern (C–E–G–C–G–C–E–C–E–G–C) across every bar. Shuffling identical bars is a no-op on the groove histogram. This is a valid corpus finding: the Bach prelude lacks bar-to-bar groove variation. Not a harness bug.

2. **Note overlap (Jaccard) gold-vs-shuffled is close to 1.0 for most pairs.** By design — the metric is intended for model-output comparison where the model may predict different pitches. For shuffled-bars control (same notes), it only diverges when bar-index changes the key. This metric is weak for the control; rhythm/groove carry the ordering signal.

3. **Future model gate verification.** This slice validates the harness; the ≥0.15 groove OA margin gate will be applied when a model's continuation outputs are evaluated in a subsequent slice.

4. **Held-out test set (clair-de-lune).** The two clair-de-lune pairs are included in this eval (they are included in splits.json:test). Their pair structure is valid and integrity checks pass. A future model evaluation should separate train/test results.

---

## Harness readiness

Slice 6 establishes that the E2 eval harness is grounded and has teeth:
- Paired integrity: **22 pairs, 0 orphans** (**PASS**)
- Rhythm signal: **16/22** pairs where shuffling changes the onset grid (**PASS**)
- Groove signal: **17/22** pairs where shuffling changes the phrase-level groove (**PASS**)
- not_computable results: **0** total (all with explicit reasons)

Slice 7 (E3 Annotation Grounding Eval) can proceed.
