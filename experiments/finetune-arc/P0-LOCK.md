# Finetune Arc — P0 Preregistration Lock

**Frozen:** 2026-07-10, before any training run. **Dispatch:** [docs/finetune-arc-dispatch.md](../../docs/finetune-arc-dispatch.md) (citation-gated, director-approved 2026-07-10). This file records every execution-level decision the dispatch left to the executing session, BEFORE P2 training starts. Per L9, nothing below changes after the first gradient step; deviations discovered mid-arc are reported in the P6 report, not silently patched.

## Standards compliance (six standards, 0–3)

| Standard | Score | Evidence |
|---|---|---|
| PIN_PER_STEP | 3 | This lock + per-run `run-config.json` receipts (exact pip freeze, seeds, hyperparams, file shas) emitted by the train script — the upgrade path named in the dispatch's own table. |
| ANDON_AUTHORITY | 2 | Gate reruns before P5 (check-release-gate PASS confirmed 2026-07-10 on the slice21 baseline); P1 builder exits 1 on any gate failure and writes only the failing report. |
| NAMED_COMPENSATORS | 3 | Inherited from the dispatch's no-skip table; this session adds: RunPod pod (compensator: terminate pod — owner: advisor; billed time is the bounded L11 spend), local ollama tags (compensator: `ollama rm <tag>`). |
| DECOMPOSE_BY_SECRETS | 2 | All arc outputs live under `experiments/finetune-arc/`; the published dataset tree + sealed baseline are read-only in every script (P5 eval writes via absolute `--output` outside the public tree). |
| UNCERTAINTY_GATED_HUMANS | 2 | Director gates P0 (done) and P7 (deferred); honesty rule binds P6 wording. |
| EXTERNAL_VERIFIER | 3 | Dispatch citations prism-gated (receipt committed); P5 scoring is the deterministic TS harness, never the generating model; P3 selection scoring is deterministic (greedy decode + AJV-hardened schema check + exact match). |

## 1. Pinned inputs (sha256)

| Artifact | sha256 |
|---|---|
| `datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json` (SEALED baseline) | `5bb5b2244b0bb03dc38a9235804ac71468084e3881ead6c823a79197d25b8e23` (matches `checksums.sha256`) |
| `datasets/jam-actions-v0-public/records.jsonl` | `72ce6e69d29e198dc94d66d5eeb55d5e0456b859282c872caf86b7b161c8120f` |
| `datasets/jam-actions-v0-public/splits.json` | `d20aeda46d28fa1416d3aa5d892684895980cc34ec7785c0ef31d76fbaf9508a` |
| `src/dataset/tool-schemas.json` | `f026a6ebae07ba208607d54e99facb2d06c5eff25b69d9c8d3105c20cdc35f0f` |
| `scripts/run-jam-actions-corpus-eval.ts` (P5 harness entry) | `95057bb0c6da75d2501b998ffbbd2df4014c2119064715af3a83ea1adc07107d` |
| `scripts/check-release-gate.ts` | `87b2963c0c56cfe4dcdeeb3f7a9a9c4e8b41640a2ffdf2b5919ce094bf33d677` |
| `src/dataset/eval/llm-runner.ts` | `af926b78b5ee0089d95673415fa7070169818607087aae9683c266fdb978fa90` |
| `src/dataset/eval/annotation-grounding.ts` | `00f8357dc3aba7a0ae82a899be761023a49d6472fc7daa95a89d67317a22cf12` |
| `src/dataset/eval/annotation-grounding-tool.ts` | `34aaabba31f6e476eedfb4e1737615fbd284411c5fb83a0767a73899c6ed86f1` |
| `src/dataset/eval/llm-backends/ollama.ts` | `90b957f939db9da98a71a6f0f7dcf7a199b7a3d236c9d10efef2453e05eefe41` |

P1 output shas live in [data/P1-gate-report.json](data/P1-gate-report.json).

**Release-gate ANDON:** `pnpm exec tsx scripts/check-release-gate.ts datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json` → **PASS** confirmed 2026-07-10 in this session. Re-run immediately before P5; any FAIL halts the arc.

## 2. Corrections to dispatch wording (recorded, not silently fixed)

- The dispatch says "105 human records" / "train 105". The actual public train split is **103 records** (115 total − 12 clair-de-lune test; `DATASET_SCHEMA.md` concurs). All claims bind to the actual counts: **78 SFT-train + 25 inner-validation + 12 test untouched.**
- The dispatch's L11 budget ("on the 5090") is amended by director instruction (2026-07-10, this session): **P2 training runs on RunPod** (RTX 6000 Ada 48 GB class or better) so the local 5090 stays free. The ≈2–4 GPU-hour ceiling and every other lock are unchanged — only the location of the spend moved. Serving parity (L6) is unaffected: P4/P5 run through local ollama exactly as the baseline did.

## 3. Inner-validation split (L4)

Held-out-of-gradient songs (selection ONLY, never trained on, never clair-de-lune):

- `chopin-prelude-e-minor` — 12 records
- `fur-elise` — 13 records

**Rationale (preregistered):** these are the two smallest songs NOT present in the sealed slice21 16-record cohort (cohort songs: bach-prelude, pathetique, schumann-traumerei, chopin-nocturne, clair-de-lune). Holding them out (a) maximizes SFT-train size at 78, (b) keeps every cohort train-song record inside the gradient set so the sealed eval's seen-song strata mean "trained-on" uniformly, and (c) gives the selection signal two styles (early-Romantic, Classical) disjoint from the selection-forbidden test song.

## 4. SFT example format (L1/L5)

- One example per record: the full `target_trace.session` as chat messages, system prompt first.
- System prompt (pinned): `You are operating AI Jam Sessions, a music education platform.` — the first sentence of the harness's `E1_SYSTEM_TEXT`, without E1's no-prose constraint (traces interleave prose and calls by design).
- Tools declared: the **full 41-tool catalog** (`data/tools.json`, verbatim from `src/dataset/tool-schemas.json`) — the same catalog the E1 harness passes at eval time; makes tool selection a real 2-of-41 discrimination task.
- Render: HF `tokenizer.apply_chat_template(messages, tools=…)` with **Qwen2.5-7B-Instruct's native template** (L1). Assistant `tool_calls` map `{tool, arguments}` → `{name, arguments}`; tool-turn results serialized with compact `JSON.stringify` parity.
- Known bounded deviation: the HF jinja template and ollama's Go template for qwen2.5 are equivalent-but-not-byte-identical renderers of the same format. Decoding regimes stay identical across compared systems (both arms serve through the SAME ollama template at P5), which is what L5 requires; train-time render is the model's native template, which is what L1 requires.

## 5. Training recipe (L3/L4)

| Knob | Value | Source |
|---|---|---|
| Base | `Qwen/Qwen2.5-7B-Instruct` | L1, director lock |
| Method | bf16 LoRA (no quant) | L3 |
| Target modules | q_proj k_proj v_proj o_proj gate_proj up_proj down_proj (all linear incl. MLP) | L3, finding 10 |
| r / α / dropout | 16 / 32 / 0.1 | L3 |
| LR / schedule / warmup | **1.5e-4** (midpoint of L3's 1e-4–2e-4 band) / cosine / 10 steps | L3 |
| Effective batch | 8 (per-device 2 × grad-accum 4) | L3 (4–8) |
| Weight decay / max_grad_norm | 0.0 / 1.0 | TML LoRA guidance (finding 10) |
| Max seq len | ~~8192~~ **12288** (amendment A1) | — |
| Epochs / checkpoints | 32 total; adapters saved at epoch {2, 4, 8, 16, 32} | L4, findings 13 vs 29 |
| Prompt-loss weight | **0.1** on non-assistant tokens, 1.0 on assistant spans (incl. `<tool_call>` blocks + end token) | finding 13 |
| Seeds | **{13, 42, 271}** (A2 extension to 5 seeds CANCELLED by amendment A3 — never trained) | L8 |
| Precision/misc | bf16, gradient_checkpointing on, adamw_torch, packing OFF | — |
| Saturation log | per-epoch cumulative trained tokens + loss curve in `run-config.json` receipt (P2 gate) | finding 29 |

**Amendment A1 (2026-07-10, pre-training — no gradient step had run):** max_seq_len 8192 → 12288. The fail-fast render assertion on the first pod launch caught that the 41-tool system block renders to ~8.6k tokens and the longest record to 9,282 — my 8192 estimate was wrong. Capacity constant only; no recipe knob (r/α/lr/batch/epochs/weighting) changed. If the pinned per-device 2 × accum 4 shape OOMs at 12.3k context, the fallback is per-device 1 × accum 8 — the LOCKED quantity is effective batch 8.

**Amendment A2 (2026-07-10, mid-P2, before ANY P3 selection or P5 eval result existed):** seeds extended from the 3-seed L8 minimum to the dispatch's stated preference — **5 seeds {13, 42, 271, 512, 1024}**. Trigger: director expanded the compute budget in-session ("I don't mind the 4-5 hour run, or whatever it takes") after the L11 GPU-hour estimate proved undersized for the rendered example length. The extension is outcome-blind (no selection/eval signal existed at decision time), adds independent runs only, and touches no recipe knob, no data, no eval design. Qwen3-8B secondary (L2) remains deferred — it needs its own prompted baseline to be a fair comparison and stays a post-headline decision.

**Amendment A3 (2026-07-10, supersedes A2 before its seeds ever trained):** the 5-seed extension is CANCELLED — director budget constraint after ~$14 of pod idle-burn (a monitoring failure during the stage-3 recovery, owned by the advisor and documented in the P6 report). Seeds 512/1024 never started; the matrix is the original L8-minimum **{13, 42, 271}**, which the lock always defined as valid. No trained artifact, selection, or eval is affected — A2→A3 is a pure scope revert, still outcome-blind (no P5 signal existed).

**Amendment A4 (2026-07-10, supersedes the compute-location line of A2/A3):** the H100 pod was terminated on director instruction before any artifact download; the cloud-trained weights are gone. **The local 5090 rerun is the run of record** — same pinned script, same recipe knobs, same seeds {13,42,271}, same data shas; environment = backpropagate's proven Blackwell venv (torch 2.10.0+cu128, transformers 5.5.0, peft 0.19.1 — captured per-run in `run-config.json`, differing from the pod's 4.57.1/0.17.0; the script's only 5.x adaptation is the `dtype` kwarg rename). The cloud attempt produced no evaluated artifact, so nothing is replaced; its P3 numbers (exact 0.50/0.52, validity 1.000, selections {e2,e4,e4}) are recorded in the session transcript as corroborating context only. Remaining cloud spend: $0 — P4→P6 are fully local.

**Amendment A5 (2026-07-10, supersedes A4's compute location on director instruction — "Bring it back to the runpod"):** the local 5090 run was killed after the smoke test's load made the machine unusable mid-day. **Run of record = RunPod A100 SXM 80GB pod `yhx9188ldilyyp` ($1.49/hr, secure), pod_run_v2.sh.** v2 hard-codes the anti-loss design the v1 failure taught: (1) all environment risk (cmake, quantizer build, gguf import, CUDA assert) retired in stage0 BEFORE any training; (2) llama.cpp convert deps installed `--no-deps` so torch cannot be clobbered; (3) **per-seed artifact streaming** — adapters + receipt land on local disk minutes after each seed completes, so termination at any time forfeits at most the in-flight seed; (4) a local **dead-man switch** force-terminates the pod at 9 h (~$13.40 absolute cap) independent of session state; (5) the fetcher auto-terminates the pod once `artifacts.sha256` verifies locally. Estimated pod cost ≈ $10–11; recipe, seeds {13,42,271}, data, and eval design unchanged from the lock.

**Runner deviation (documented per PIN_PER_STEP):** the dispatch names backpropagate v1.7.0 as runner. Its public API cannot express three locked requirements — (a) native chat-template render **with tools** (its converter renders generic ChatML without a tools block), (b) fractional prompt-loss weight (TRL full-sequence loss only), (c) checkpoint capture at the epoch set {2,4,8,16,32}. P2 therefore uses the pinned in-repo script [scripts/train_finetune_arc.py](scripts/train_finetune_arc.py) (vanilla transformers+peft, exact versions frozen into each run receipt). The recipe itself is unchanged from L3; backpropagate remains the envelope source that sized it.

**Secondary model (L2):** Qwen3-8B adapter is OPTIONAL and deferred; this pass executes the headline substrate only. If run later it reports separately, never as the headline.

## 6. P3 checkpoint selection (L4)

- Per seed, for each checkpoint in {2,4,8,16,32}: **teacher-forced per-assistant-turn generation** on the 25 inner-validation records — context = gold turns before each assistant turn, generate with **greedy decoding** (deterministic), max_new_tokens 512, stop at `<|im_end|>`.
- Parse `<tool_call>` blocks; two deterministic metrics:
  - **per-call exact-match rate** = matched ÷ max(gold_calls_total, predicted_calls_total), where a match is position-wise name + deep-equal arguments within each turn (misses and spurious calls both penalize);
  - **schema-validity rate** = valid predicted calls ÷ predicted calls (AJV-hardened: `additionalProperties:false` on every object node, mirroring `trace-validator.ts`); 1.0 when no calls predicted.
- **Selection rule:** highest per-call exact-match; tie → higher schema-validity; tie → fewer epochs (forgetting risk, findings 6/9). One checkpoint per seed advances to P4.
- clair-de-lune: untouched by anything in P2/P3 (gate).

## 7. P4 export parity (L6)

- Merge selected adapter → bf16 → GGUF f16 → quantize **Q4_K_M** (verified: local `ollama show qwen2.5:7b` reports Q4_K_M, the sealed baseline's serving quant).
- Ollama model per seed: `jam-ft-qwen25:seed13|seed42|seed271` — Modelfile = `FROM <gguf>` + **TEMPLATE and SYSTEM copied byte-identical from the local `qwen2.5:7b` tag** + no PARAMETER lines (the baseline tag sets none; harness requests carry no sampling options, so both arms serve on identical ollama defaults).
- Record in the P4 receipt: gguf sha256 per seed, quant type, `ollama show` digest of both baseline tag and finetuned tags.

## 8. P5 sealed eval (L5/L7/L9)

- Immediately before: re-run the release gate on the sealed baseline (ANDON on FAIL).
- Command per seed (harness byte-identical, model tag swapped, outputs OUTSIDE the published tree):

```
pnpm exec tsx scripts/run-jam-actions-corpus-eval.ts \
  --model jam-ft-qwen25:seed<k> --backend ollama \
  --evals e3,e3-tool --sample-filter slice19-cohort --n 3 \
  --output <abs>/experiments/finetune-arc/evals/ft-seed<k>-results.json \
  --sample-output <abs>/experiments/finetune-arc/evals/ft-seed<k>-sample.json
```

- Same 16-record cohort, same 4 conditions (full / text_only / random_midi / tool_inspected), n=3 per condition, default sampler seed `slice12-2026-05-17`, ollama backend on this rig — the sealed baseline's exact regime. One eval per seed; no reruns, no cherry-picks.

## 9. P6 statistics + honesty rule (L8)

- Primary comparison: **tool_inspected** per-record means, finetuned vs sealed baseline, paired by recordId (this is the capability axis the RC gate's absolute floor measures). Secondary: **full** condition. text_only / random_midi reported as controls.
- Aggregation: all-seeds mean ± bootstrap 95% CI (10 000 resamples over records); per-record paired wins; paired permutation test (sign-flip, 10 000 permutations) clustered by record, with the song-cluster caveat stated (5 songs; clair-de-lune n=1 stratum reported separately, never pooled silently).
- **Honesty rule (verbatim binding):** no victory claim unless paired wins reach the ~9/10-equivalent sign-test bar AND the margin survives the paraphrase-robustness check; otherwise the report ships as "directionally better, underpowered." No best-of-seeds anywhere — all three seeds report.
- Seen-vs-held-out framing: the cohort's 15 train-song records measure trained-on material; the 1 clair-de-lune record is the only unseen item. The report MUST break these out.

## 10. Compute + spend (L11, amended)

- RunPod, one pod, RTX 6000 Ada 48 GB class or better; ceiling ≈2–4 GPU-hours for the full matrix (3 seeds × 32 epochs ≈ minutes each at 7B bf16 LoRA; P3 selection sweep on-pod; P4 conversion on-pod).
- Compensator: terminate pod on completion or on any halt (owner: advisor). Artifacts (adapters, receipts, selected GGUFs) download to `experiments/finetune-arc/artifacts/` before termination.
