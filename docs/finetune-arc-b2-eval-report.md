# Finetune Arc B-2 — Confirmatory Eval Report (receipted)

**Date:** 2026-07-13 · **Author:** advisor (Opus 4.8) · **Preregistration:** [experiments/finetune-arc-b2/P0-LOCK.md](../experiments/finetune-arc-b2/P0-LOCK.md) (frozen at commit `592604c` before any model call) · **Prior arcs:** [finetune-arc-eval-report.md](finetune-arc-eval-report.md) (v0, honest negative) → [finetune-arc-v1-eval-report.md](finetune-arc-v1-eval-report.md) (v1, underpowered positive) → [finetune-arc-v2-b1-eval-report.md](finetune-arc-v2-b1-eval-report.md) (B-1, powered confirmation of the tool win) · **Stats artifact:** `experiments/finetune-arc-b2/evals/b2-stats.json` (mulberry32 seed 20260714, 10k bootstrap, 10k permutations, replayable via `p6-stats-b2.ts`)

## Verdict (claim class PASS — but read the honesty note; the frozen sentence overstates it)

**Claim class: PASS** by the preregistered rule (primary non-inferiority held **AND** NFR ≤ max **AND** ≥1 secondary target met). **Substantively it is a thin PASS: the tool-grounded win is retained through the B-2 retrain, but the prose-surface calibration the arc set out to teach did not materialize on the sealed eval.**

The retain-and-calibrate recipe — a 748-line corpus adding full-surface worked examples (C3), calibrated-abstention examples (C4), and distribution-matched rehearsal (C5), trained at **epochs 8→4** with a **weight-decay anchor** — **held the tool-grounded win**: five B-2 fine-tunes (frozen, one eval each, selected on inner-val before the cohort was scored) sit at **tool_inspected 0.877 all-seeds mean vs the frozen v1-FT reference 0.890** (Δ −0.013; non-inferiority CI95 [−0.031, +0.005], lower bound above the −0.050 floor; still far above the fresh baseline 0.735; **NFR 0.050 ≤ 0.18**, 7 new failures over 139 v1-FT-correct items). The primary — *does the prose-surface retrain cost us the tool win?* — is answered: **no, the win is retained within one seed-SD.**

**But the two prose levers the corpus was built to move did not move.** On the abstain surface, **no model — baseline or fine-tune — ever selected the "E) cannot be determined" option** (abstention rate 0.000 vs 0.000), so the calibrated-abstention target failed. And **`full` regressed** rather than closing: B-2-FT 0.119 vs a fresh baseline of 0.330. The one secondary that cleared — the over-refusal guard (coverage 1.000, selective-accuracy 0.661) — is what mechanically triggers PASS, and it clears **trivially**: coverage is 1.000 *because* the model never abstains at all, so "does not over-refuse" is satisfied by answering everything.

**Honesty note (binds this report over the frozen sentence):** the frozen §11.1 PASS wording asserts the recipe teaches the model "to decline the genuinely-unanswerable prose questions instead of guessing." **The data does not support that clause** — abstention is 0.000. The secondary that actually cleared, stated exactly, is the **prose over-refusal guard** (the model still answers the answerable prose-metadata questions, at 66%). The honest one-line claim is therefore narrower than the frozen sentence: *the B-2 recipe holds the tool-grounded win through a prose-surface retrain and fewer epochs, while the sealed prose surface did not improve — no abstention uptake, and `full` regressed.*

## Headline numbers (36-record cohort, abstain surface, n=3/condition, all-seeds means)

### Primary veto — tool_inspected non-inferiority + NFR (HELD)

| Quantity | Value | Bar | Verdict |
|---|---|---|---|
| B-2-FT tool_inspected (all-seeds) | **0.877** | — | — |
| Frozen v1-FT reference (B-1 sealed) | 0.890 | — | — |
| Mean Δ (B-2 − v1-FT), paired | **−0.013** | — | — |
| Non-inferiority CI95 (record bootstrap) | [−0.031, +0.005] | lower > −δ_tool (−0.050) | **HELD** |
| Non-inferiority CI95 (song-cluster) | [−0.024, +0.005] | lower > −0.050 | HELD |
| Above fresh baseline (0.735) | yes | > baseline | **HELD** |
| Negative-flip rate | **0.050** (7/139) | ≤ nfr_max 0.18 | **HELD** |
| Paired sign test | 11 W / 21 L / 4 T, p = 0.110 | (descriptive; NI is the test) | — |

The sign test leans toward v1-FT (11–21) but does **not** reach significance, and the effect (−0.013) sits comfortably inside the preregistered non-inferiority band frozen ex-ante from v1-FT's own 5-seed spread (SD 0.0496 → δ_tool 0.050). "Held" here means *no worse than the noise the fine-tune itself exhibits across seeds* — not "equal or better."

**Strata, unpooled (primary condition):** the tool-hold is robust across all three strata; none shows a regression beyond noise.

| Stratum | n | Mean Δ (B-2 − v1-FT) | Paired | Exact p |
|---|---|---|---|---|
| CL (clair-de-lune, never trained, any arc) | 12 | −0.021 | 2 W / 7 L / 3 T | 0.180 |
| LG (sealed-history train-song cohort) | 15 | −0.024 | 4 W / 10 L / 1 T | 0.180 |
| NW (seeded-blind new train records) | 9 | **+0.017** | 5 W / 4 L | 1.000 |

### Secondary — prose calibration (reported with equal weight; did NOT land)

| Secondary target | Result | Bar | Met? |
|---|---|---|---|
| `full` non-inferiority to fresh baseline | B-2-FT **0.119** vs baseline **0.330** (Δ −0.211, CI95 lo −0.273) | ≥ baseline − δ_full (−0.055) | **NO — regressed** |
| `text_only` abstention rate (MIDI-only Qs) | B-2-FT **0.000** vs baseline **0.000** | ≥ baseline + 0.10 | **NO** |
| `text_only` prose over-refusal guard | coverage **1.000**, selective-accuracy **0.661** | cov ≥ 0.60, sel-acc ≥ 0.50 | **yes (trivially — never abstains)** |

## What this means (honest interpretation)

- **The retain half worked; the calibrate half did not.** B-2 proves you can rebuild the corpus (+50% larger, three new component families), cut epochs in half, and add an L2 anchor **without losing the tool-grounded win**. That is a real, useful confirmation for the recipe's stability.
- **The MCQ "E) cannot be determined" surface does not elicit abstention** from *any* model here, baseline included. The C4 free-form abstention training looked healthy on inner-val (prose_cal 0.75–0.88, free-form decline phrases) but **did not transfer to selecting E** on a max-16-token A–E MCQ. This is a surface/format mismatch finding as much as a training finding: the instrument the eval offered (pick letter E) is one these models simply do not use.
- **C3 full-surface training made `full` worse, not better.** The fine-tune concentrates even harder on the tool surface (0.877) at the expense of raw-MIDI-in-context reasoning (0.119, below the 0.330 baseline). The seesaw the study-swarm flagged (Reasoning-Trap, arXiv:2510.22977) is real and bidirectional here — the prose levers pulled the wrong way.
- **Checkpoint selection favored fewer steps**, consistent with the forgetting-reduction hypothesis: selected epochs were {seed13: e2, seed42: e2, seed271: e4, seed512: e2, seed1024: e1} — three of five peaked at epoch 2. Fewer steps did protect the composite; it just did not buy a prose gain.
- **Ablation caveat (preregistered, §12):** B-2 moved four levers at once (corpus + epochs + weight-decay + abstention labels). This PASS attributes nothing to a single lever; that is a later arc.

## Deviations & incidents ledger

- **No amendments to the lock after freeze.** No model was called before the lock commit `592604c`; no eval was re-run; no artifact was regenerated after first completion. One pre-training amendment (A1-b2, the `text_only` metadata header) was recorded in the lock during the BUILD, before any model existed.
- **Two launch-script bugs caught and fixed BEFORE the priced run** (commit `d038ba2`): `deadman.ps1` wrote its cancel file to the v1 artifacts dir (copy-paste) — repointed to `-b2/` so the dead-man disarms cleanly; `pod_run_b2.sh` defaulted to 3 seeds (old 2-pod split) — corrected to all 5 on one pod, matching the approved compute.
- **Stage0 fail-fast earned its keep (commit `e5c8407`):** the Ubuntu 24.04 base image marks its Python externally-managed (PEP 668) and stage0's `pip install` halted **before any gradient step** — fixed with `PIP_BREAK_SYSTEM_PACKAGES=1` at $0 training cost. This is the runner that produced the priced artifacts.
- **RunPod `/workspace` is a network filesystem** (MooseFS): cold base-model loads took ~8 min per seed after the OS page cache turned over (vs ~2 s hot). This slowed P3/P4 but never stalled — the shard-loader's stderr progress kept the babysitter's liveness signal alive. Volume-disk (deleted-on-terminate) was chosen over a network volume, so teardown left no lingering storage cost.
- **Verification mis-step, self-corrected (this session):** during P6 review I initially mis-read the abstain surface as *inactive* — because `question.options` stays a 4-tuple (the E option is out-of-band in the prompt text, by design) and the prompt is not stored in results. I disproved my own alarm before reporting: b2 results carry the prose-answerable question types (added only under `abstain=true`) and b2 parse errors read "no A/B/C/D/**E** found" while B-1's read "no A/B/C/D found". The surface **was** active; the eval and stats are valid; no re-run was performed.
- **Timing / spend:** RunPod A100-SXM4-80GB, one pod, 5 seeds sequential + P3 + P4, ~9 h 24 m wall, **~$14.2** (low end of the $14–18 projection, under the $24 ceiling). Pod terminated by the babysitter on checksum-verified completion; dead-man disarmed cleanly. Local P4b/P5/P6: ~50 min, **$0**.

## Receipts

- Preregistration: `experiments/finetune-arc-b2/P0-LOCK.md` at `592604c`; frozen bars (δ_tool 0.050, nfr_max 0.18, δ_full 0.055, all sealed-data-derived) + corpus counts in `data/b2-cohort.json`; corpus gate `data/P1b2-gate-report.json` (G1–G8 PASS), render `data/P1b2-render-receipt.json` (grand max 9334 ≤ 12288).
- On-pod artifacts (checksum-verified, `artifacts/artifacts.sha256`): five Q4_K_M GGUFs `jam-ft-b2-qwen25-seed{13,42,271,512,1024}-epoch{2,2,4,2,1}.q4_k_m.gguf`, five `run-config-seed*.json`, `selection-report.json` (P3 inner-val, clair-de-lune untouched), five `adapters-seed*.tar.gz`.
- Local P4b: `artifacts/p4-receipt.json` (5 ollama tags, Q4_K_M parity to baseline).
- Pre-run gate: `evals/b2-prerun-gate.json` — lock-commit assertion, package checksums, cohort↔harness equality, all five GGUF sha256 == `p4-receipt.json`, all six ollama tags resolvable.
- Sealed artifacts (one per model, never regenerated): `evals/b2-baseline-results.json` + `evals/b2-seed{13,42,271,512,1024}-results.json` (+ `-sample.json` each); run log `evals/b2-run.log`.
- Statistics: `evals/b2-stats.json` — seeded RNG 20260714, non-inferiority + NFR + selective-prediction, per-stratum + per-record tables, honesty block.
- Dataset under eval: `datasets/jam-actions-v0-public/` v0.5.0 (DOI [10.5281/zenodo.21313954](https://doi.org/10.5281/zenodo.21313954)); frozen v1-FT reference read from `experiments/finetune-arc-v2/evals/b1-seed*-results.json` (not re-run).

## The gate (HELD — not fired)

Per the frozen claim class, a PASS opens a **P7-class DIRECTOR gate** to publish a B-2 adapter set + docs — **nothing publishes without the director's explicit yes.** Given the honest reading above, this is **not a clean "we taught calibrated abstention" story**; it is "the tool win survives a prose-surface retrain, and the prose levers did not move (no abstention uptake, `full` regressed)." The four-arc narrative is now: v0 honest negative → v1 underpowered positive → B-1 powered tool-win confirmation → **B-2, tool win retained through retrain, prose-calibration thesis did not land.**

**Recommendation to the director:** treat B-2 as a confirmatory *null on the prose levers with the tool win intact*, and decide publish-vs-shelve on that basis. If published, the claim must be the honest narrow one (retain, not calibrate), with abstention-0.000 and the `full` regression disclosed on the card. As of this writing the gate is **HELD**; no adapter has been published.

**Compensators (if the gate later fires):** HF repo delete / flip-private + a retraction note in this report and the card (owner: director + advisor); all docs sections revert with `git`. No adapter, tag, or public artifact has been pushed by this session.
