# Finetune Arc v1 — P6 Eval Report (receipted)

**Date:** 2026-07-11 · **Author:** advisor (Fable 5) · **Preregistration:** [experiments/finetune-arc-v1/P0-LOCK.md](../experiments/finetune-arc-v1/P0-LOCK.md) (amendments A1-v1/A2-v1 inside; citation receipt beside it) · **Prior arc:** [finetune-arc-eval-report.md](finetune-arc-eval-report.md) (v0, honest negative) · **Stats artifact:** `experiments/finetune-arc-v1/evals/p6-stats-v1.json` (mulberry32 seed 20260711, 10k bootstrap, 10k permutations, replayable via `p6-stats-v1.ts`)

## Verdict (honesty rule applied, verbatim wording class)

**The jam-actions v1 fine-tune is *directionally better, underpowered* on the primary condition.** Across all five seeds, `tool_inspected` rose from the sealed baseline's 0.661 to **0.863** (Δ **+0.202**; per-record bootstrap CI95 [0.092, 0.308]; paired permutation p = 0.0043) — but paired wins came in at **12/16 with 1 tie, one short of the preregistered ≥13/16 victory bar**, and the song-cluster bootstrap CI95 [−0.015, 0.300] grazes zero at 5 clusters. Per the rule frozen before any training, no victory claim ships, the paraphrase-robustness check (reserved for victory candidates) was not invoked, and **the P7 publish gate does not fire.** The preregistered bar exists precisely so a near-miss is not relitigated after seeing the data.

What the same runs establish without any claim-wording: **every one of the five seeds scored above baseline on the primary** (0.771 / 0.866 / 0.875 / 0.892 / 0.911 — v0 was 0 of 5 below at 0.564–0.641), and the one **unseen-song** cohort record (clair-de-lune) improved most of all (0.500 → 0.933, n=1, reported unpooled). The grounding-shaped data taught the model to actually use the inspector tools on the surface the sealed eval measures, and the skill transferred across the free-form→MCQ format boundary the lock had flagged as this design's stated risk.

## Headline numbers (16-record sealed cohort, n=3/condition, all-seeds means)

| Condition | Baseline | v0-FT | **v1-FT** | Δ v1−baseline | Wins | Record-CI95 | Cluster-CI95 |
|---|---|---|---|---|---|---|---|
| **tool_inspected** (primary) | 0.661 | 0.601 | **0.863** | **+0.202** | 12/16 (1t) | [0.092, 0.308] | [−0.015, 0.300] |
| full (secondary) | 0.432 | 0.385 | 0.367 | −0.065 | 6/16 (1t) | [−0.123, −0.004] | [−0.119, −0.005] |
| text_only (control) | 0.500 | 0.381 | 0.363 | −0.137 | 2/16 | [−0.208, −0.071] | [−0.205, −0.077] |
| random_midi (control) | 0.417 | 0.380 | 0.380 | −0.037 | 8/16 | [−0.115, 0.036] | [−0.075, 0.019] |

Sign test on the primary: 12W/3L/1T, p = 0.0352; permutation p = 0.0043. Non-wins, named: `pathetique-mvt2:m001-004` (−0.117), `schumann-traumerei:m001-004` (−0.067), `schumann-traumerei:m045-048` (−0.267), `chopin-nocturne-op9-no2:m009-012` (tie). Seen-songs stratum (15 records): Δ +0.186, wins 11/15 (1t). No best-of-seeds anywhere; all five report.

## The three-way comparison (the preregistered diagnostic)

**v1 vs v0 on the primary: Δ +0.262, paired wins 14/16, permutation p = 0.0003** (record-CI [0.166, 0.360]; cluster-CI [0.090, 0.352] excluding zero). The data pass — grounding-shaped traces + user-turn paraphrase + self-rehearsal on the corrected working set — decisively outperformed v0's jam-only design on the axis both were sealed-scored against. On `text_only` and `full`, v1 ≈ v0 (Δ −0.018 / −0.017, both ns): the prose-only erosion is a shared property of both fine-tunes, not something v1 introduced.

**Interpretation.** v0's lesson ("105 narrow traces taught that family and taxed the neighbors") is refined by v1: distribution coverage of the eval surface was the missing ingredient, exactly as the dispatch's L10 branch and the v0 report's design amendment predicted. The model now calls the inspector tools and reads their outputs into correct MCQ answers at 0.86–0.91 — including on a song absent from every training example. What v1 did **not** fix: answering from prose alone (`text_only` −0.137 vs baseline; CI excludes zero). The 60-example self-rehearsal slice targeted generic instruction-following, not prose-MCQ answering, and at 12% of the mix it did not rescue that surface. The `full` condition (raw MIDI text in context, no tools) also sits below baseline — the model's competence has concentrated where its tools are.

## What the training surface showed (P3, inner splits, never in the gradient set)

- Composite selection chose **{seed13: e8, seed42: e4, seed271: e8, seed512: e2, seed1024: e4}** — the corpus growth (78→494 examples) shifted some seeds' optimum to epoch 8, using exactly the headroom the lock kept in the sweep (v0's evidence had capped it at {2,4}).
- Grounding on held-out songs: schema-valid inspector calls 0.976–1.000; correct grounded answers 0.883–0.948. Jam per-call exact-match held at v0's 0.48–0.52 ceiling (the unseen-song canonical-id cap, unchanged) with schema validity 1.000 everywhere — the original family was retained, not traded away.

## Deviations & incidents ledger (full detail in P0-LOCK-v1 amendments)

- **A1-v1 → r001/r002:** the new execution-verification gate caught a published-dataset defect (bach m061-064 window vs the 62-measure reality); on the director's instruction the launch was blocked until the spun-off chip sessions root-caused it (the record was wrong, not the server), fixed the working set (r001 window retarget + r002 ground-truth prose for all 16 bach records, erratum-001/-002), and **A2-v1** rebuilt the entire v1 corpus from the corrected source before any pod existed. The sealed public package was never touched (274/274 checksums; release gate PASS re-confirmed before P5).
- **Ops:** pod B's first launch lost its env/cwd over a hung ssh channel — caught in stage0, relaunched via an scp'd launcher (no training loss). The watchdog false-stalled once during pod A's P3 (Python stdout block-buffering under nohup); liveness now counts a busy GPU. Dead-man caps were re-armed mid-run (A 9h→10h, B 7h→6¼h) to protect the export window while keeping the worst-conceivable-case sum under the approved ceiling.
- **Cloud spend, whole arc: $20.45** (podA 3 seeds $12.87 + podB 2 seeds $7.23, incl. storage) vs the ~$20 estimate and $25 ceiling — both pods streamed per-seed and self-terminated on checksum verify; zero idle waste. Initial projection errors (storage omitted; per-seed time underestimated from an assumed throughput) were caught against the live meter and corrected mid-run; the lesson — price from measured receipts, not assumptions — is recorded.

## Receipts

- Sealed baseline: `slice21-fair-e3-baseline-results.json` (`5bb5b224…`); `check-release-gate.ts` **PASS** re-confirmed immediately before each P5 batch (`evals/p5-run-podA.log`, `p5-run-podB.log`); package checksums 274/274 OK.
- Per-seed sealed evals (harness `run-jam-actions-corpus-eval.ts` `95057bb0…`, byte-identical flags per P0-LOCK-v1 §10): `experiments/finetune-arc-v1/evals/ft-v1-seed{13,42,271,512,1024}-results.json` — one eval per seed, no reruns.
- Training receipts: per-seed `run-config.json` (pins, shas, loss curves, saturation logs), `selection-report.json` per pod, `p4-receipt.json` (Q4_K_M parity + byte-copied baseline template), `artifacts.sha256` both pods — under `experiments/finetune-arc-v1/artifacts/`.
- Corpus receipts: `P1v1-gate-report.json` (G1–G7 incl. the 1,604-string contamination blacklist and 206/206 MCP execution verification, zero findings post-r001); dataset revision receipts `r001`/`r002` with errata.
- Stats: `p6-stats-v1.json` — seeded RNG, both comparisons, per-record three-way table.

## Status of the claim the dataset may make

Per the mission statement's bound: **jam-actions traces, augmented with execution-verified grounding-shaped examples (the v1 recipe), train a model that is directionally better — +0.20 mean, 12/16 paired wins, p≈0.004, every seed above baseline, strongest on the unseen song — at tool-grounded musical QA than the prompted baseline, while remaining below baseline when answering from prose alone.** The preregistered victory bar (≥13/16) was missed by one win, so that sentence — not a victory claim — is the deliverable, and no adapter publishes. Both arcs (v0's honest negative, v1's underpowered positive) are now the dataset's documented finetuning story: the sealed-baseline discipline the dataset sells, demonstrated twice.
