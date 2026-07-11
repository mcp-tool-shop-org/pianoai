# Finetune Arc — P6 Eval Report (receipted)

**Date:** 2026-07-11 · **Author:** advisor (Fable 5) · **Preregistration:** [docs/finetune-arc-dispatch.md](finetune-arc-dispatch.md) + [experiments/finetune-arc/P0-LOCK.md](../experiments/finetune-arc/P0-LOCK.md) (amendments A1–A6 inside) · **Stats artifact:** `experiments/finetune-arc/evals/p6-stats.json` (`db7a0b48…`, seeded RNG, replayable)

## Verdict (honesty rule applied, verbatim wording class)

**The jam-actions-v0 fine-tune is *not better than the prompted baseline* on the primary condition.** Across all five seeds, `tool_inspected` came in below the sealed slice21 baseline (mean Δ **−0.061**; per-seed Δ range −0.021 to −0.097; **0 of 5 seeds** above baseline; paired wins **4/16** with 2 ties; song-cluster bootstrap CI95 **[−0.115, −0.010]**, excluding zero). No victory claim is available, and none is made. Per the preregistered branch (L10), the pre-designed, director-gated **v1 data pass** is the next decision point; the **P7 publish gate does not fire**.

What the same runs *did* show: the fine-tune dramatically improved the **trained surface** (trace generation — schema validity 1.000 on all 25 checkpoint evals; exact `play_song` call matching; correct per-tool argument conventions from epoch 2), while eroding the **adjacent surface** the sealed baseline measures (tool-grounded MCQ answering). The cleanest evidence of the trade is the `text_only` control — no MIDI, no tools, pure instruction-following — which dropped **−0.119**, the classic catastrophic-forgetting signature the dispatch's own finding 6 predicted would appear first.

## Headline numbers (16-record sealed cohort, n=3/condition, all-seeds means)

| Condition | Baseline | Finetune (5-seed mean) | Δ | Paired wins | Record-CI95 | Cluster-CI95 |
|---|---|---|---|---|---|---|
| **tool_inspected** (primary) | 0.661 | 0.601 | **−0.061** | 4/16 (2 ties) | [−0.126, 0.002] | [−0.115, −0.010] |
| full (secondary) | 0.432 | 0.385 | −0.048 | 5/16 | — | — |
| text_only (control) | 0.500 | 0.381 | −0.119 | — | — | — |
| random_midi (control) | 0.417 | 0.380 | −0.037 | — | — | — |

Paired permutation (sign-flip, 10k, seeded): p = 0.101 (primary). Exact sign test: 4W/10L/2T, p = 0.180. The preregistered victory bar was ≥13/16 paired wins; observed 4/16. The effect is **consistently directional (worse)**: every seed, both aggregate conditions, and 10 of 16 records.

Per-seed `tool_inspected`: seed13 0.564 (−0.097) · seed42 0.641 (−0.021) · seed271 0.578 (−0.083) · seed512 0.613 (−0.049) · seed1024 0.608 (−0.054). No best-of-seeds anywhere; all five report.

**Held-out wrinkle (n=1, reported, never pooled silently):** the single clair-de-lune cohort record — the only *unseen* song — was the one place `tool_inspected` **improved** (+0.100), while the 15 trained-on-song records averaged −0.071 (3/15 wins). One record proves nothing, but the direction is consistent with the degradation concentrating on material the model over-fit trace-style onto, rather than a uniform capability loss.

## What the dataset *did* train (P3, inner split, 25 records never in the gradient set)

- **Schema validity 1.000** on every checkpoint of every seed (25 sweeps × ~63 turn-generations): the model emits well-formed `<tool_call>` JSON with the right per-tool argument names (`songId` for `view_piano_roll`, `id` for `play_song`) from epoch 2 onward.
- **Per-call exact-match plateaued at 0.50–0.52** with a legible cause: on unseen songs the first call requires the dataset's canonical `songId`, which is not derivable — the model guesses *musically informed* ids (`chopin-prelude-op28-no4` — the correct catalog number for the E-minor prelude) or leaks a trained id; the second call (context now contains the id) matches near-perfectly.
- **Epoch selection: {2, 4, 4, 4, 4}** across seeds — the few-epochs prior (finding 13) beat the many-epochs hypothesis (finding 29) on the inner split decisively and reproducibly (selections replicated exactly across two different GPUs).

## Interpretation

The dispatch's honest-risk register anticipated this outcome class: finding 27 (parity-not-victory is the honest risk), finding 6 (forgetting hits instruction-following first), finding 9 (LoRA forgets less — but not zero, and prompt-loss weighting at this extreme prompt/output ratio concentrated learning on a narrow behavior). The result refines the risk: **105 narrow traces of one task family taught that family and taxed the neighbors.** The sealed baseline measures the neighbor.

Design implication for the director-gated v1 pass (L10): augmentation should not just paraphrase more `analyze-and-play-phrase` traces — it should add **grounding-shaped examples** (inspector-tool QA traces of the kind the e3-tool condition exercises), execution-verified per APIGen (finding 31), with the human records kept in the mix (finding 32). That is a new dispatch decision, not part of this one.

The optional constrained-vs-constrained arm (L5) was not run: it was preregistered as "only if the headline is close," and the headline is a clear directional non-win.

## Deviations & incidents ledger (full detail in P0-LOCK.md A1–A6)

- A1 max_seq 8192→12288 (capacity constant; fail-fast caught pre-training). A2/A3/A6: 5-seed extension proposed → cancelled under budget pressure → restored ex-ante by explicit director approval before any sealed-eval signal. A4/A5: compute moved local → back to RunPod on director instruction.
- **Ops incidents, owned by the advisor:** (1) ~5h idle pod burn (~$14) from a crashed export stage plus a monitor whose liveness check counted an idle waiter as progress; (2) loss of the first (H100) run's weights when that pod was terminated before download — the pipeline had treated the pod as durable storage. Both closed structurally in v2: environment validated before training, per-seed artifact streaming to local disk, checksum-verified auto-termination, independent dead-man timers. The v2 pods completed with zero further waste; P3 selections from the lost run were replicated exactly by the run of record.
- **Cloud spend, whole arc:** ≈ $50 total (≈ $28 first attempt incl. the waste; ≈ $22 for the v2 run of record, inside its stated caps).

## Receipts

- Sealed baseline: `datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json` (`5bb5b224…`, matches `checksums.sha256`); `check-release-gate.ts` **PASS** re-confirmed immediately before P5 (see `evals/p5-run.log`).
- Per-seed sealed evals (harness: `scripts/run-jam-actions-corpus-eval.ts` `95057bb0…`, flags per P0-LOCK §8): `ft-seed13` `c713d948…` · `ft-seed42` `37ff417f…` · `ft-seed271` `175e820c…` · `ft-seed512` `4b6a97f9…` · `ft-seed1024` `1061def6…` (under `experiments/finetune-arc/evals/`).
- Training receipts (per-seed `run-config.json`: pins, shas, loss curves, saturation log), selection reports, P4 receipt (Q4_K_M parity + baseline-template copy), and adapter archives: `experiments/finetune-arc/artifacts/`.
- Stats: `experiments/finetune-arc/evals/p6-stats.json` (`db7a0b48…`) — mulberry32 seed 20260710, 10k bootstrap, 10k permutations; rerunnable via `scripts/p6-stats.ts`.

## Status of the claim the dataset may make

Per the mission statement's bound ("anything the numbers don't support gets reported as it is"): **jam-actions-v0's traces train reliable, schema-perfect MCP tool-calling on the trained task family at 78 examples; they do not, in this v0 form, improve — and mildly degrade — the model's tool-grounded annotation QA relative to the prompted baseline.** That sentence, with its receipts, is the deliverable.
