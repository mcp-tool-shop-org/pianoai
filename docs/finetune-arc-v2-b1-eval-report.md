# Finetune Arc v2 (B-1) — Confirmatory Eval Report (receipted)

**Date:** 2026-07-11 · **Author:** advisor (Fable 5) · **Preregistration:** [experiments/finetune-arc-v2/P0-LOCK.md](../experiments/finetune-arc-v2/P0-LOCK.md) (frozen at commit `c9dcd17` before any model call) · **Prior arcs:** [finetune-arc-eval-report.md](finetune-arc-eval-report.md) (v0, honest negative) + [finetune-arc-v1-eval-report.md](finetune-arc-v1-eval-report.md) (v1, "directionally better, underpowered") · **Stats artifact:** `experiments/finetune-arc-v2/evals/b1-stats.json` (mulberry32 seed 20260713, 10k bootstrap, 10k permutations, replayable via `p6-stats-v2.ts`)

## Verdict (frozen wording class, bar met)

**Powered win — the jam-actions v1 recipe trains a model that beats the prompted baseline at tool-grounded musical QA on a preregistered 36-record cohort dominated by held-out material.** The five FROZEN v1 fine-tunes (no retraining, no reselection, artifacts pinned by sha before this cohort existed), scored once each against a fresh sealed `qwen2.5:7b` baseline on the published v0.5.0 records, moved the primary condition from **0.678 to 0.890** (Δ **+0.212**; per-record bootstrap CI95 [0.148, 0.275]; **song-cluster CI95 [0.128, 0.305] — excludes zero**, the interval that grazed zero at n=16; permutation p ≈ 0.0001). Paired wins: **29/36 with 2 ties → n_eff = 34, against the ex-ante bar of 24/34** (exact two-sided sign test p = 0.000039). The bar was frozen as a number table in `data/b1-cohort.json` before any model call; it is cleared by five wins, not relitigated by one.

The question this arc existed to answer — *was v1's 12/16 miss a power artifact or a real ceiling?* — is answered: **power artifact.** Same frozen artifacts, wider preregistered cohort, the effect holds at proper power.

## Headline numbers (36-record cohort, 4 conditions, n=3/condition, all-seeds means)

| Condition | New baseline | Frozen v1-FT | Δ | Wins | Record-CI95 | Sign p |
|---|---|---|---|---|---|---|
| **tool_inspected** (primary) | 0.678 | **0.890** | **+0.212** | **29/36 (2t)** | [+0.148, +0.275] | 0.000039 |
| full (secondary) | 0.396 | 0.313 | −0.083 | 9/36 (3t) | [−0.136, −0.033] | 0.0135 |
| text_only (control) | 0.381 | 0.307 | −0.074 | 13/36 (1t) | [−0.123, −0.026] | 0.175 |
| random_midi (control) | 0.397 | 0.304 | −0.093 | 9/36 | [−0.150, −0.034] | 0.0039 |

**The strata, unpooled (primary condition):**

| Stratum | n | What it is | Baseline → FT | Δ | Wins | Exact p |
|---|---|---|---|---|---|---|
| **CL** | 12 | Every clair-de-lune test record — **never in any training corpus, any arc, any form** | 0.729 → 0.906 | **+0.176** | **10/12** | **0.039** |
| LG | 15 | The sealed-history train-song cohort records | 0.711 → 0.887 | +0.176 | 11/15 (1t) | 0.057 |
| NW | 9 | Seeded-blind new train records (drawn before any B-1 output existed) | 0.556 → 0.876 | +0.320 | 8/9 (1t) | 0.0078 |

The CL stratum is the confirmatory headline: on twelve records the models never saw in training — eleven of which had never been evaluated by anything — the frozen fine-tunes win 10/12 and the stratum clears significance on its own. The skill transfers to genuinely unseen music; v1's single-record +0.433 clair-de-lune observation was not a fluke.

**Continuity diagnostic (descriptive, preregistered):** the LG stratum reproduces v1's seen-song outcome **exactly** — 11/15 with 1 tie there, 11/15 with 1 tie here, under a different baseline run on corrected records. The measurement is stable; the added power came from widening the cohort, exactly as the power diagnosis predicted.

## What did NOT improve (reported with equal weight)

The prose-only and no-tools surfaces remain **below** baseline, consistent with both prior arcs: `full` −0.083, `text_only` −0.074, `random_midi` −0.093 (all record-CIs exclude zero; text_only's sign test does not reach significance). The v1 fine-tunes' competence is concentrated where their tools are — they answer better by *inspecting* and worse by *recalling prose*. This is the surface a future B-2 (prose-surface retrain) would target; nothing in this arc changes that finding, and the claim below does not extend to it.

Absolute numbers are not comparable across arcs: this baseline was measured on v0.5.0 records (erratum-002 corrected all 16 Bach records' prose, which E3 prompts embed) over a different, wider cohort. Both arms here saw identical prompts; the sealed v0.4.3-measured artifacts remain what they always were.

## Deviations & incidents ledger

- **No amendments to the lock.** No model was called before the lock commit; no eval was re-run; no artifact was regenerated after first completion (`b1-run.log` + per-run receipts).
- **Runner infrastructure failed three times BEFORE any model call, all fixed and committed** (`774cedc`, `eb28c79`; third incident required no code change): (i) `readFileSync` cannot hash a 4.7 GB GGUF (>2 GiB cap) — hashing now streams; (ii) a Windows pipe-inheritance hang — when the ollama CLI auto-starts the daemon, the daemon inherits the runner's stdio pipes and `spawnSync` waits for EOF forever; the tag check now validates on captured output under a timeout; (iii) one ANDON was the pre-run gate **working as designed** — it refused to run while the package checksums were mid-edit during the v0.5.0 publication backfill, and passed once the backfill commit landed.
- **Timing:** six sealed runs, 36.2 minutes wall-clock total (5.3–7.1 min per model), $0.

## Receipts

- Preregistration: `experiments/finetune-arc-v2/P0-LOCK.md` at `c9dcd17`; cohort + frozen bar table: `data/b1-cohort.json` (sha `7ea74fc9…`, sampler seed 20260712); harness pin `8bef493d…` with eval-logic files byte-identical to the v0/v1 sealed pins (`00f8357d…`, `34aaabba…`).
- Pre-run gate: `evals/b1-prerun-gate.json` — lock-commit assertion, package checksums 274/274, cohort↔harness equality, all five GGUF sha256 == `p4-receipt.json`, all six ollama tags with modelfile evidence.
- Sealed artifacts (one per model, never regenerated): `evals/b1-baseline-results.json` + `evals/b1-seed{13,42,271,512,1024}-results.json` (+ `-sample.json` each); run log `evals/b1-run.log`.
- Statistics: `evals/b1-stats.json` — seeded RNG, pooled + per-stratum + per-record three-way table, the honesty-rule block with the bar lookup.
- Dataset under eval: `datasets/jam-actions-v0-public/` v0.5.0 (tag `jam-actions-v0-0.5.0-cut-2026-07-11`, published DOI [10.5281/zenodo.21313954](https://doi.org/10.5281/zenodo.21313954)).

## The claim the dataset may now make (and the gate that opens)

Per the frozen claim class: **jam-actions traces, augmented with execution-verified grounding-shaped examples (the v1 recipe), train a model that beats the prompted baseline at tool-grounded musical QA — +0.21 mean, 29/36 paired wins against a preregistered 24/34 bar, p < 0.0001, strongest on never-trained music — while remaining below baseline when answering from prose alone.** The three-arc story (v0 honest negative → v1 underpowered positive → B-1 powered confirmation on frozen artifacts) is now the dataset's documented fine-tuning narrative.

**The P7-class director gate FIRED 2026-07-11** — the director's explicit decision, taken with this result in view: *"publish all five seed adapters with the claim tied to the all-seeds mean."* Published artifact: [`mcp-tool-shop/jam-ft-v1-qwen25`](https://huggingface.co/mcp-tool-shop/jam-ft-v1-qwen25) — the five selected-epoch PEFT adapters (byte-identical to the frozen artifacts B-1 evaluated; `adapter_model.safetensors` sha256s on the card and in `experiments/finetune-arc-v2/evals/p7-adapter-publish-receipt.json`), per-seed numbers disclosed, no best-of-seeds. Compensators: HF repo delete / flip-private + a retraction note in this report and the card (owner: director + advisor); the docs sections revert with git. The results sections on the landing page, handbook, and README shipped in the same commit as this annotation.
