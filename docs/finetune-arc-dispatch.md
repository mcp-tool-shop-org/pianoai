# Finetune Arc — jam-actions-v0 → a model that jams (design dispatch)

**Date:** 2026-07-10 · **Author:** advisor (Fable 5), study-swarm-grounded · **Status:** citation-gated design, awaiting director gates (base-model lock · GPU-hours ack · publish gate)

**Mission.** Prove jam-actions-v0 trains a model that actually jams — respond to musical context with schema-valid, musically appropriate MCP actions — scored by the dataset's own eval harness against the sealed prompted baseline (`datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json`, PASS-gated by `scripts/check-release-gate.ts`). The claim we are allowed to make is bounded by the statistics below; anything the numbers don't support gets reported as "directionally better, underpowered," not victory.

---

## Research grounding (the dispatch's empirical floor)

Five parallel research lanes (base model · recipe · constrained decoding · eval design · dataset size), retrieval-mandatory. Findings numbered for reference from the architectural lock.

### Base model (Q1)

1. **The Qwen family currently tops live function-calling leaderboards (BFCL V4, mid-2026).** UC Berkeley Gorilla team, BFCL V4 (https://gorilla.cs.berkeley.edu/leaderboard.html). Implication: Qwen lineage is the strongest open substrate for tool-call SFT.
2. **SFT on tool-call traces at 8B scale beats frontier prompted models.** Prabhakar et al. 2025, APIGen-MT (arXiv:2504.03601): xLAM-2-8b-fc-r 72.83% vs GPT-4o 72.08% on BFCL v3. Implication: our dataset shape (traces → JSON actions) is the proven recipe, not a novelty bet.
3. **Qwen3-8B is Apache-2.0 with explicit agentic/MCP tool-calling support.** Yang et al. 2025, Qwen3 Technical Report (arXiv:2505.09388). Implication: viable secondary model; no licensing strings on adapters.
4. **Under ~300 rows, fine-tune the instruct checkpoint, not base.** Unsloth guidance (https://unsloth.ai/docs/get-started/fine-tuning-llms-guide/what-model-should-i-use). Implication: at 105 records, alignment must be inherited, not re-taught.
5. **Aligning a base model needs ~1k curated examples (LIMA floor).** Zhou et al. 2023 (arXiv:2305.11206). Implication: 105 records is below the base-model threshold — instruct start is forced.
6. **Fine-tuning forgetting scales predictably and hits instruction-following first.** Kalajdzievski 2024 (arXiv:2401.05605); corroborated by Huang et al. 2025 (arXiv:2509.03934). Implication: low rank, few effective updates, keep the native chat template.
7. **Licensing: Qwen2.5-7B-Instruct and Qwen3-8B are Apache-2.0; Llama-3.1 carries naming/attribution obligations.** Meta license (https://www.llama.com/llama3_1/license/), Qwen HF license files. Implication: Qwen adapters publish to HF with zero obligations.
8. **Fine-tuned-vs-prompted on the SAME substrate is the valid controlled design.** Marquez Ayala et al. 2025 (arXiv:2505.24189): fine-tuned SLM beat prompted LLM ~10% on structured JSON workflows; same-base comparison attributes the delta to training. Implication: the headline run must match the sealed baseline's family.

### Recipe (Q2)

9. **LoRA learns less but forgets less; at tiny data the preservation side dominates.** Biderman et al. 2024 (arXiv:2405.09673).
10. **Properly configured LoRA matches full FT on small/medium SFT: all linear layers incl. MLP, lr ≈ 10× full-FT, rank-independent in the small-data regime, small batches.** Schulman et al. (Thinking Machines Lab) 2025, "LoRA Without Regret" (https://thinkingmachines.ai/blog/lora/).
11. **QLoRA NF4 matches 16-bit LoRA and full FT.** Dettmers et al. 2023 (arXiv:2305.14314). Implication: quantized training is a fidelity-free memory fallback; on 32 GB a 7B bf16 LoRA fits anyway.
12. **Gains typically appear at 50–100 well-crafted examples in supervised fine-tuning.** OpenAI SFT guide (https://developers.openai.com/api/docs/guides/supervised-fine-tuning); consistent with LIMA's quality-over-quantity result (finding 5).
13. **Loss over instruction tokens (not strict completion-only) helps exactly in the low-resource, long-prompt/short-output regime** — jam-actions' shape. Shi et al. 2024 (arXiv:2405.14394); corroborated by Huerta-Enochian & Ko 2024 (arXiv:2401.13586). Implication: use a small prompt-loss weight (~0.1); get template/EOS handling byte-exact.

### Constrained decoding × fine-tuning (Q3)

14. **Grammar/schema-constrained decoding guarantees validity at near-zero runtime cost.** Willard & Louf 2023, Outlines (arXiv:2307.09702); Dong et al. 2024, XGrammar (arXiv:2411.15100).
15. **Tam et al. observed a significant decline in LLM reasoning under format restrictions** — Tam et al. 2024 (arXiv:2408.02442). **The dottxt re-analysis attributes that decline to methodology: with prompts and parsers matched across regimes, structured generation met or beat unstructured** — Kurt (.txt team) 2024, "Say What You Mean" (https://blog.dottxt.ai/say-what-you-mean.html). Implication (from the pair): never compare systems across decoding regimes; hold prompts and parsers constant.
16. **Greedy token masking distorts the LM's grammar-conditioned distribution.** Park et al. 2024, Grammar-Aligned Decoding (arXiv:2405.21047).
17. **Serialization conventions (whitespace, key order) shift accuracy 5–10%, most for small models.** Hamilton & Mimno 2025 (arXiv:2502.14969); Koo et al. 2024 (arXiv:2407.08103). Implication: train and decode in the dataset's exact target serialization.
18. **Constraints AMPLIFY fine-tuning gains in ≤500-example regimes; constraints alone are also a no-FT route to structure.** Schmidt & Cimiano 2025 (DOI 10.3389/frai.2024.1406857); Geng et al. 2023 (arXiv:2305.13971). Implication: a constrained-vs-constrained arm isolates semantic gains from format gains.
19. **Constrained-decoding engines differ materially; pin one.** Geng et al. 2025, JSONSchemaBench (arXiv:2501.10868).
20. **BFCL's AST-based layered scoring separates "can't emit the call" from "wrong call."** Patil et al., ICML 2025 (https://proceedings.mlr.press/v267/patil25a.html). Implication: our metric reports format validity and semantic correctness as distinct layers.

### Eval design at n≈10 (Q4)

21. **Per-item paired differences + clustered standard errors are the standard for small evals** — and our test records are segments of ONE song (one cluster; effective n < 10). Miller 2024 (arXiv:2411.00640).
22. **Tiny test sets are underpowered by construction; only huge effects are detectable at n≈10.** Card et al. 2020 (arXiv:2010.06595).
23. **Paired bootstrap/permutation tests are the distribution-free default.** Dror et al. 2018 (https://aclanthology.org/P18-1128/); small-set protocol in Du 2025 (arXiv:2511.19794).
24. **Seed variance alone can exceed method deltas on small data — single-run wins can be seed luck.** Dodge et al. 2020 (arXiv:2002.06305); Bui, Savova & Wang 2025 (arXiv:2503.07329). Implication: ≥3 seeds, report mean ± CI, never best-of-seeds.
25. **Prompt-format-bound gains are spurious (up to 76-point swings from equivalent formats).** Sclar et al. 2023 (arXiv:2310.11324). Implication: a paraphrased-template robustness check gates the claim.
26. **Preregistration — freezing split/metric/analysis before training — is what makes a sealed baseline credible; the same data must not both generate and test the hypothesis.** Hofman et al. 2023 (arXiv:2311.18807); Albanie et al. 2021 (PMLR v148, https://proceedings.mlr.press/v148/). Implication: checkpoint/epoch selection must never touch clair-de-lune.

### Dataset-size adequacy (Q5)

27. **At matched example counts, fine-tuning ≥ in-context learning — parity, not automatic dominance.** Mosbach et al. 2023 (arXiv:2305.16938). Implication: the honest risk is parity-not-victory.
28. **Break-even vs prompting sits in the low hundreds for narrow, format-consistent tasks.** Pecher, Srba & Bielikova 2024 (arXiv:2402.12819).
29. **Many epochs on a tiny set beats one epoch on a big set at equal compute (12–26 pt gains at 128 epochs × 400 samples), with training-token saturation as the stop signal.** Kopiczko, Vaze, Blankevoort & Asano 2026 (arXiv:2602.11149); complements data-constrained scaling (Muennighoff et al. 2023, arXiv:2305.16264). Implication: epoch count is THE swept hyperparameter, and the sweep must go far higher than the reflexive 1–3.
30. **A 7B LoRA on a FIXED toolset beat GPT-4-Turbo (TinyAgent: 41→83% success).** Erdogan, Lee et al. 2024 (arXiv:2409.00608). Implication: fixed-schema, narrow-domain is the regime where small models win — but note their synthetic scale (~40k traces).
31. **Execution-verified synthesis (format check → real execution → semantic verification) is the proven data lever for tool-calls; targeted augmentation beats raw volume.** Liu et al. 2024, APIGen (arXiv:2406.18518); Lin et al. 2024, Hammer (arXiv:2410.04587).
32. **Unfiltered synthetic data causes collapse; keeping the human data in the mix prevents it.** Shumailov et al. 2024 (Nature, DOI 10.1038/s41586-024-07566-y); Gerstgrasser et al. 2024 (arXiv:2404.01413).
33. **Small-corpus symbolic-music adaptation is precedented (~99-song corpora).** Zhou-Zheng & Pasquier 2025, MIDI-RWKV (arXiv:2506.13001).

### Local measured grounding (not web — this rig's own receipts)

- **Sealed baseline metadata:** `model: "qwen2.5:7b"`, `backend: "ollama"` (slice21-fair-e3-baseline-results.json) — the parity constraint for serving the finetuned model.
- **Envelope:** training-knowledge KB (E:/AI/readouts/training-knowledge) carries a **verified, measured-on-this-rig** row for QLoRA-NF4 SFT with chat template at 8–34B on one RTX 5090, plus a verified catastrophic-forgetting row naming LoRA-as-regularizer and the rank/effective-LR/replay levers. backpropagate v1.7.0's shipped presets encode the same envelope. 7B-class LoRA is comfortably inside it.

---

## Architectural lock (each choice traces to findings)

- **L1 — Headline model: Qwen2.5-7B-Instruct**, fine-tuned from the instruct checkpoint with its native chat template. Same substrate as the sealed baseline, so the clair-de-lune delta is attributable to the 105 records, not a model upgrade (findings 8, 4, 5, 6). Apache-2.0 (7).
- **L2 — Secondary model (optional): Qwen3-8B** adapter, reported separately, never as the headline comparison (1, 3, 8).
- **L3 — Method: bf16 LoRA, all linear layers incl. MLP, r=16, α=32, dropout 0.1, lr 1e-4–2e-4 cosine with short warmup, effective batch 4–8.** QLoRA only as memory fallback — fidelity-equivalent (9, 10, 11; KB envelope). Runner: backpropagate v1.7.0.
- **L4 — Epochs are the swept hyperparameter: checkpoint at {2, 4, 8, 16, 32} epochs within each run** (the finding-13 few-epochs prior vs finding-29 many-epochs evidence is resolved empirically). **Selection uses an inner validation split carved from the TRAIN records (2 songs held in), never clair-de-lune** (26). Stop/selection signal: inner-split schema-validity + per-call exact-match, not loss alone (13, 29).
- **L5 — Decoding regimes identical across compared systems.** Headline arm: UNconstrained vs unconstrained (the sealed baseline ran unconstrained) with prompts, parser, and sampling pinned identical (15). Serialization byte-exact to the dataset target format (17). Optional secondary arm: constrained-vs-constrained with ONE pinned engine/version (19, 18, 14, 16) — isolates semantic gains; run only if the headline is close.
- **L6 — Serving parity: merge adapter → GGUF → the SAME ollama quantization as `qwen2.5:7b` → same harness backend.** The baseline's serving stack is part of the sealed condition; the finetuned model walks the identical path.
- **L7 — Scoring: the dataset harness's per-tool-call layered metrics (BFCL-style AST agreement)** — format validity first, tool-selection + argument correctness second, musical appropriateness on schema-valid actions only (20). Per-call scoring multiplies scored events beyond the 10 records (21).
- **L8 — Statistics: ≥3 seeds (5 preferred), all-seeds mean ± bootstrap CI, per-item paired wins, paired permutation test clustered by record (and honestly: one song = one cluster).** At n≈10 records a p<0.05 sign-test needs ~9/10 paired wins; anything less ships as **"directionally better, underpowered"** (21, 22, 23, 24). A paraphrased-template robustness check gates any victory claim (25).
- **L9 — Preregistration: this dispatch freezes split, cohort, metrics, prompt template, decoding params, and the baseline JSON (sha256 in `checksums.sha256`; `check-release-gate.ts` must PASS immediately before eval)** (26). Sealed-prediction discipline per the dataset's own tradition.
- **L10 — Data: v0 trains on the 105 human records only — no synthesis.** If the result is parity-not-victory (27), a director-gated v1 data pass applies APIGen-style execution-verified augmentation — paraphrase the musical context, freeze the schema-validated action targets, verify by execution against the real MCP server, keep every human record in the mix (31, 32, 30).
- **L11 — GPU budget: bounded and small.** 105 records × ≤32 epochs × 7B LoRA ≈ minutes per run on the 5090; the full matrix (1–2 models × 3–5 seeds, epoch checkpoints within-run) ≈ **2–4 GPU-hours total**.

## Execution phases

| Phase | What | Gate |
|---|---|---|
| P0 | Preregistration freeze: this dispatch + baseline JSON sha256 + harness/script versions pinned | Director base-model lock + budget ack |
| P1 | Data prep: records.jsonl → chat-template SFT JSONL (train 105 minus 2 inner-validation songs), loss weighting per L3/L4; serialization byte-exact (L5) | Schema round-trip check |
| P2 | Train: backpropagate, seeds × model(s), checkpoints at {2,4,8,16,32} epochs | Training-token saturation logged |
| P3 | Checkpoint selection on inner split only | clair-de-lune untouched |
| P4 | Export: merge → GGUF → baseline-identical quant → ollama | Byte/tag parity vs baseline recorded |
| P5 | Sealed eval: once per seed, same harness, same cohort; `check-release-gate.ts` PASS re-confirmed first | ANDON: any harness drift halts |
| P6 | Stats + receipted eval report (all-seeds mean±CI, paired wins, honesty rule) | — |
| P7 | IF it beats baseline: HF publish (adapter beside the dataset) + README/handbook results section (coordinator-authored) | Director publish gate |

## Compensators (NAMED_COMPENSATORS — no skip)

| Action | Irreversible? | Compensator | Owner |
|---|---|---|---|
| HF adapter publish (P7) | Public artifact; deletion leaves caches | `hf repo delete` / flip private + README retraction note; publish only behind the director gate | director + advisor |
| GPU-hours spend (P2) | Yes — spent compute | none; bounded by L11 (≈2–4 h) and the P0 budget ack | advisor |
| Git commits (dispatch, configs, report) | No | `git revert` | advisor |
| This dispatch becoming canon | Design-propagation | `study-swarm withdraw <id>` / `requalify` (canon-rollback compensator, study-swarm v1.3.0) | advisor |
| Sealed baseline / dataset files | Not touched | read-only by construction; `check-release-gate.ts` PASS is the tripwire | — |

## Standards compliance (six standards, 0–3)

| Standard | Score | Evidence |
|---|---|---|
| PIN_PER_STEP | 2 | P0 pins baseline sha256, harness versions, prompts, decoding params in this doc; → 3 when the execution session emits a `study-swarm lock` / run-config lock file per training run. |
| ANDON_AUTHORITY | 2 | `check-release-gate.ts` PASS is a hard pre-eval gate; citation-verifier HALT rules applied to this dispatch; harness drift halts P5. |
| NAMED_COMPENSATORS | 3 | Table above; no-skip honored; publish is director-gated with a named undo; the canon-rollback compensator covers the dispatch itself. |
| DECOMPOSE_BY_SECRETS | 2 | Volatile (adapters, eval outputs, this dispatch) strictly separated from stable (dataset, sealed baseline, harness) — stable layer is read-only in every phase. |
| UNCERTAINTY_GATED_HUMANS | 2 | Director gates at P0 (model/budget) and P7 (publish); the L8 honesty rule forces contrastive reporting when underpowered instead of a silent victory claim. |
| EXTERNAL_VERIFIER | 3 | This dispatch's citations gated through `roleos verify-citations` → prism v1.6.0 (different family, reasoning-stripped, deterministic retrieval oracle) — receipt below: 0 fabricated, 0 blocking, one misattribution-class defect caught and corrected on the first pass. The eval itself is scored by the deterministic harness, never by the generating model. |

Scores below 3 carry their upgrade path inline (lock emission at execution; verifier receipt appended post-gate).

## Director gates

1. **Base-model lock: ✅ APPROVED 2026-07-10** — Qwen2.5-7B-Instruct headline + Qwen3-8B secondary (reported separately, per L2).
2. **GPU-hours ack: ✅ APPROVED 2026-07-10** (≈2–4 h on the 5090); execution starts in the next session with this dispatch as the kickoff (P1 data prep onward).
3. **Publish gate (deferred to P7):** HF adapter + README/handbook section only on a baseline-beating, honesty-rule-passing result. Package release also deferred: main carries the Node-22 engines bump + key corrections unreleased by director decision — Track B's outcome decides the v1.6.0 contents.

## Verification receipt (2026-07-10)

`roleos verify-citations docs/finetune-arc-dispatch.md --provider ollama` → `prism verify --type citations` (prism v1.6.0; deterministic arXiv/Crossref existence oracle + different-family groundedness lens, reasoning-stripped). Two passes:

- **Pass 1 caught one real defect** — finding 15 attributed the "constraints-hurt-was-an-artifact" conclusion to Tam et al. (arXiv:2408.02442), whose abstract asserts the decline itself (`FIX TO MATCH SOURCE: retrieved source contradicts the claim`). Corrected per the correct-once rule: the finding now states each source's own claim separately, with the implication drawn from the pair.
- **Pass 2 (post-fix): verdict `escalate`, advisory, `blocking: false`, 0 fabricated.** prism receipt `prism-01kx5kn11mm6hr0nc37jeh8wyv` · `chain_sha256 d0de92d7cffbfa40940e4938f569448bfb3cd479611e86f2dc171aa494f23bf0` · `citations_sha256 c697eef37976888c12d4ef0eb08416be373f577af0423bbba392915b6b7c44f0` · full receipt: `docs/finetune-arc-dispatch.citation-receipt.json`.

Advisory disposition (standard oracle-behavior classes, per the protocol's own receipts):
- **RETRIEVE FULL TEXT** (claim lives in the paper body, not title+abstract — e.g. Miller 2411.00640, Card 2010.06595, Dodge 2002.06305): the Step-2 research agents retrieved these pages live; retained as advisory-supported.
- **RETRIEVE MANUALLY ×3** (arXiv HTTP 429 transients: APIGen 2406.18518, Gerstgrasser 2404.01413, MIDI-RWKV 2506.13001): rate-limit, never read as fabrication per the halt rule; all three were retrieval-confirmed during the Step-2 research pass.
- **Unparsed ×12** (URL-only citations — BFCL leaderboard, dottxt/Unsloth/OpenAI/TML pages, PMLR/ACL anthology links, and multi-source items where the oracle gates only the first id): outside the arXiv/Crossref oracle by design; retrieval-verified out-of-band by the research lanes.
