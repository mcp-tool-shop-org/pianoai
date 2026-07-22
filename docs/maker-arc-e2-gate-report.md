# Maker Arc — Phase B: the E2 continuation gate ($0 report)

**Date:** 2026-07-22 · **Class:** $0 (local Ollama + one in-session Claude authoring pass; no pods, no API spend, no publishes) · **Arc:** the MAKER arc (analyst → composer), Phase B of A/B/C · **Runner:** [`scripts/e2-continuation-gate.ts`](../scripts/e2-continuation-gate.ts) · **Receipts:** [`experiments/maker-arc/e2-gate/`](../experiments/maker-arc/e2-gate/) (per-generator JSONs + `gate-summary.json`)

## What this is

`src/dataset/eval/phrase-continuation.ts` has carried a **locked, preregistered, never-used** future-model bar since Slice 6 (2026-05-16):

> `FUTURE_MODEL_GROOVE_MARGIN = 0.15` — *"groove OA of model output vs gold must exceed grooveOA(shuffled, gold) by ≥0.15."*

Phase B wires that slot (`src/dataset/eval/model-continuation.ts`) and runs real generators at it, as the maker arc's **$0 pre-training measurability gate**: before any RunPod spend on a generative fine-tune, prove the instrument can see the thing we would train. The kickoff pre-registered the decision matrix:

- Claude clears but locals don't → training headroom (justifies Phase C)
- locals already clear → maybe no training needed
- **nobody clears → fix the task/bar before spending** ← *this is what happened*

## Standards compliance (six standards, 0–3)

| Standard | Score | Evidence |
|---|---|---|
| PIN_PER_STEP | 2 | Generation reuses the sealed E2 machinery byte-unchanged (`runE2ForPair`: system prompt, tolerant parser, FM-4 retry); sampling pinned (`seed 42`, `num_predict 2048`, Ollama default temperature — the sealed Slice 8.5/9 condition); cohort pinned by sealed-artifact pair IDs. Not a formal byte-lockfile. |
| ANDON_AUTHORITY | 3 | The runner recomputes the shuffled-control metric per pair **before any model call** and hard-halts on divergence from the sealed artifact (observed max \|Δ\| = 0.00e+0); computability divergence also halts. A temp-0 sampling pathology (undici 300 s header timeout) was caught in smoke and fixed before the fleet ran. |
| NAMED_COMPENSATORS | 3 | $0, local, additive. World-touching action = the git commit of code + receipts + this report → `git revert <sha>`. No pod, no HF push, no npm publish, no sealed artifact modified (sealed E2 artifact is read-only input). |
| DECOMPOSE_BY_SECRETS | 3 | The margin scorer is a new module consuming the frozen eval primitives; `runE2ForPair`'s pre-existing self-coherence metric is untouched; the sealed artifacts and the locked bar constant are consumed read-only. |
| UNCERTAINTY_GATED_HUMANS | 3 | The gate's output is a **decision for the director**, framed contrastively (below): "you may have expected a training-headroom verdict; the evidence says the instrument, not the models, is what needs work." Phase C explicitly does NOT fire. |
| EXTERNAL_VERIFIER | 2 | The verifier is deterministic code (groove OA vs a deterministic shuffle control) — no model grades its own output, and the generator (Claude) never sees gold. Score 2 not 3: the deterministic-code path needs no cross-family jury, but no independent re-derivation of the numbers by a second implementation was run. |

## The cohort and the instrument (checked before any generator ran)

**Cohort:** the sealed 22-pair E2 cohort, pinned by pair IDs from the sealed gold artifact ([`datasets/jam-actions-v0/evals/e2-phrase-continuation-results.json`](../datasets/jam-actions-v0/evals/e2-phrase-continuation-results.json), evalDate 2026-05-16), resolved against **source-scope** records (the public v0.5.0 cut excludes debussy + satie — 5 of the 22 pairs). Integrity: all 22 resolve; recomputed shuffled-control groove OA reproduces the sealed values at **max |Δ| = 0.00e+0**.

**Instrument finding 1 — 9 of 22 pairs are unclearable by construction.** Per-pair *headroom* = 1 − grooveOA(shuffled, gold) is the maximum attainable margin (a perfect, gold-identical continuation scores exactly this). Nine pairs sit under the 0.15 bar — three at exactly **0.000** (both Bach pairs and satie m15-18: every bar has the same onset pattern, so bar-shuffling changes nothing):

| unclearable pair | headroom |
|---|---|
| bach-prelude m5-8 | 0.000 |
| bach-prelude m13-16 | 0.000 |
| satie-gymnopedie m15-18 | 0.000 |
| mozart-k545 m5-8 | 0.013 |
| fur-elise m13-16 | 0.037 |
| mozart-k545 m13-16 | 0.082 |
| satie-gymnopedie m23-26 | 0.111 |
| satie-gymnopedie m7-10 | 0.143 |
| clair-de-lune m5-8 | 0.149 |

Mean headroom across the cohort: **0.353**. Per-pair clear ceiling: **13/22**. The aggregate bar (mean margin ≥ 0.15) remains satisfiable — gold itself sits at 0.353.

**Instrument finding 2 — the control inherits the performance's micro-timing.** The gold `timed_events` are *performance MIDI* (rubato: onsets at beats like 0.71, 1.13, 2.21…, which quantize onto off-grid sixteenth slots). The shuffled-bars control keeps every within-bar onset untouched — it carries gold's exact micro-timing vocabulary. A generator that composes a musically idiomatic, grid-aligned continuation therefore loses slot-overlap to the control on every rubato-heavy pair, *regardless of musical quality*. The bar as locked measures **"reproduce this specific performance's phrase-level onset placement"** much more than **"continue the phrase musically."**

**Instrument sanity (identity ceiling):** scoring the gold continuation *as if a model produced it* gives margin ≡ headroom per pair: **13/22 pairs clear, mean margin 0.353, aggregate CLEARS**. The instrument is internally consistent; it is the construct validity that is narrow.

## Generators run

All generation went through the **same harness** the sealed Slice 8.5/9 runs used — `runE2ForPair`'s system prompt, `format:"json"`, the tolerant REMI parser (FM-1…FM-7 recovery), and the single FM-4 note-empty retry — then the parsed output was scored at the **locked margin** (model-vs-gold groove OA minus shuffled-vs-gold), with bar-numbering anchored to the target window (both `Bar_1`-relative and absolute-numbered continuations score identically; without anchoring, absolute numbering scores 0.000 for labeling, not music — found and fixed in smoke).

- **Claude Fable 5 (ceiling, $0 in-session):** 22 continuations authored in-session from **prompt-only briefs** (`--emit-briefs` writes the prompt record's REMI + metadata; the gold continuation was never opened). One blind attempt; no revision against scores. Honest caveats: Claude knows these famous public-domain pieces parametrically (so, in principle, do the qwen-family models); and this dataset's arrangements/measure numbering sometimes diverge from standard editions, so "knowing the piece" guarantees neither the arrangement's content nor its bar alignment.
- **base qwen2.5:7b** and the frozen adapters **jam-ft-v1-qwen25 (5 seeds)** + **jam-ft-b2-qwen25 (5 seeds)**, local Ollama, one seeded run per pair.

## Results (from the receipts — regenerate with `pnpm exec tsx scripts/e2-gate-summary.ts`)

| Generator | clears bar (pairs) | mean margin | mean OA model·gold | mean OA shuffled·gold | aggregate ≥ 0.15 | parse c/r/u |
|---|---|---|---|---|---|---|
| gold-identity (instrument ceiling) | 13/22 | 0.353 | 1.000 | 0.647 | **YES** | 22/0/0 |
| claude-fable-5 | 0/22 | -0.136 | 0.511 | 0.647 | no | 22/0/0 |
| qwen2.5:7b | 0/22 | -0.412 | 0.234 | 0.647 | no | 22/0/0 |
| jam-ft-v1-qwen25:seed1024 | 0/22 | -0.375 | 0.272 | 0.647 | no | 22/0/0 |
| jam-ft-v1-qwen25:seed13 | 1/22 | -0.374 | 0.259 | 0.633 | no | 19/0/3 |
| jam-ft-v1-qwen25:seed271 | 0/22 | -0.362 | 0.285 | 0.647 | no | 22/0/0 |
| jam-ft-v1-qwen25:seed42 | 0/22 | -0.361 | 0.263 | 0.625 | no | 20/0/2 |
| jam-ft-v1-qwen25:seed512 | 0/22 | -0.426 | 0.221 | 0.647 | no | 22/0/0 |
| jam-ft-b2-qwen25:seed1024 | 0/22 | -0.410 | 0.227 | 0.637 | no | 21/0/1 |
| jam-ft-b2-qwen25:seed13 | 0/22 | -0.380 | 0.250 | 0.630 | no | 21/0/1 |
| jam-ft-b2-qwen25:seed271 | 1/22 | -0.459 | 0.186 | 0.645 | no | 20/0/2 |
| jam-ft-b2-qwen25:seed42 | 0/22 | -0.447 | 0.199 | 0.646 | no | 21/0/1 |
| jam-ft-b2-qwen25:seed512 | 0/22 | -0.437 | 0.215 | 0.651 | no | 18/0/4 |

*(Rows where mean OA shuffled·gold ≠ 0.647: on pairs whose model output was unparseable, the margin is not computable, so that pair drops from the computable-subset means — the control column then averages over a slightly different subset. The two isolated per-pair clears — v1:seed13 and b2:seed271, both on pathetique m13-16, margins 0.174/0.199 — are single-seeded-run events on one pair, not a pattern.)*

**Secondary observations (real signal, wrong bar):**

- **The capability ordering is genuine.** Claude's continuations fit gold's groove at OA 0.511 — roughly **2×** every local model (0.186–0.285) — despite the bar showing all of them as "no clear." The instrument's *relative* readings are informative even though its *absolute* bar is mis-set.
- **Analyst ≠ maker, measured.** The v1/B-2 adapters — trained on analysis tool-use, holding the published tool-grounded QA win — show **no generation gain over base qwen2.5:7b** (means 0.186–0.285 vs base 0.234, seeds straddling it). The maker arc's premise (generation must be trained/built for, not inherited from analysis training) now has receipts.
- **Format is not the bottleneck here.** 22/22 clean parses for base and the ceiling; the FT seeds drop at most 4/22 pairs to unrecoverable output — the FM catalog's recovery machinery held. The gate measured music, not JSON.

## Verdict

**Nobody clears the locked bar — including the ceiling.** Per the kickoff's pre-registered decision matrix, this is the third branch: **fix the task/bar before spending. Phase C (RunPod training) does not fire on this instrument.**

The contrastive read (what one might have expected vs what the evidence says):

- *Expected:* "Claude clears, locals don't → train the local maker." The margins do show a real capability ordering — Claude's continuations match gold's groove far better than any local model's — but **no generator beats the shuffled control by +0.15**, because the control inherits gold's own performance micro-timing and half the cohort has sub-bar headroom.
- *Evidence:* the gate failed **the instrument**, not the arc. This is the same class of result as the B-2 prose measurement study — a metric that cannot register the construct — caught this time **before** any training spend, at $0, by running the gate the kickoff prescribed. The validate-instrument discipline paid for itself again.

**What a valid E2 generative instrument needs (Phase C's prerequisite, still $0):**

1. **Score-time gold, or timing-normalized groove.** Quantize gold events to the notated grid (or histogram-smooth adjacent slots) so the metric stops rewarding verbatim rubato cloning.
2. **A control that does not inherit micro-timing.** e.g. shuffle at score-time, or use a genre-matched random-walk baseline — the control should represent "wrong music," not "the same performance reordered."
3. **Restrict to clearable pairs, or preregister a per-pair headroom floor.** Nine of 22 pairs cannot register any generator's success; repetitive-texture phrases need a different control than bar-shuffling.
4. **Complement groove with the pitch axis.** Groove OA is onset-only; the supporting metrics already computed per pair (pitch-class OA, note overlap, rhythm cosine) should join a composite bar so "right rhythm, wrong notes" cannot clear alone.

Redesigning that instrument (and re-locking a new bar ex ante) is itself a $0 exercise — and the natural next step of this arc, alongside the shipped Phase-A maker loop, whose verifier (`verify_harmony`) is valid by construction precisely because it checks structure (chord identity, consonance), not performance micro-timing.

## Receipts

- Per-generator results: `experiments/maker-arc/e2-gate/*.json` (per-pair margins, parse telemetry, cohort cross-check, backend params) + `gate-summary.json`.
- Claude ceiling inputs (in-repo): [`experiments/maker-arc/e2-gate/inputs/`](../experiments/maker-arc/e2-gate/inputs/) — `claude-ceiling-briefs.json` (the prompt-only briefs; no gold content), `claude-ceiling-responses.json` (the exact generator output scored — the `raw` strings), and `build-claude-ceiling-responses.mjs` (the authored `[bar, beat, midi]` note lists in readable form, with per-piece composition notes). Generation condition: prompt-only, single attempt, no score-guided revision.
- The sealed E2 artifact (read-only input): `datasets/jam-actions-v0/evals/e2-phrase-continuation-results.json` — reproduced exactly (max |Δ| = 0.00e+0).
- Scoring path: `src/dataset/eval/model-continuation.ts` (+ 12 unit tests, incl. the anchor identities: model≡gold → margin = headroom; model≡shuffled(gold) → margin = 0 exactly).
- Compensator: `git revert` of the single commit carrying code + receipts + this report.
