# Finetune Arc — Prose-Surface Measurement-Design Study (memo)

**Date:** 2026-07-13 · **Author:** advisor (Opus 4.8) · **Class:** research-only, **$0** (no training, no pods, no HF pushes — this memo *informs* a future director decision; it does not authorize spend) · **Prior arcs:** [finetune-arc-eval-report.md](finetune-arc-eval-report.md) (v0) → [finetune-arc-v1-eval-report.md](finetune-arc-v1-eval-report.md) (v1) → [finetune-arc-v2-b1-eval-report.md](finetune-arc-v2-b1-eval-report.md) (B-1) → [finetune-arc-b2-eval-report.md](finetune-arc-b2-eval-report.md) (B-2, thin PASS / prose-null) · **Citation receipt:** [finetune-arc-prose-measurement.citation-receipt.json](finetune-arc-prose-measurement.citation-receipt.json) (36/36 sources resolved, 0 fabricated)

## Why this memo exists

B-2 held the tool-grounded win but its two prose-surface secondaries did not move: on the sealed eval, **abstention scored 0.000 for the baseline and all five fine-tunes**, and **`full` regressed** (0.119 vs a 0.330 baseline). The abstention number is flat across *every* model, including the untrained baseline — the signature of a metric pinned by the instrument, not the weights. Before the line commits ~$14 + a night of GPU to another prose-surface arc, this study answers, at $0, the question the B-2 study-swarms skipped: **for each prose target, is it measurable and movable on a valid instrument for a ~7B instruct model — and if so, which instrument?** ([[validate-instrument-before-paid-runs]] is the earned lesson this operationalizes.)

An "abandon the prose surface" recommendation was a permitted outcome. The evidence supports a **split** verdict, below.

## Verdict (the decision-useful summary)

| Prose target | Measurable on the B-2 instrument? | Behavior movable on a 7B? | Verdict |
|---|---|---|---|
| **Calibrated abstention / refusal** | **NO.** Forced single-letter A–E MCQ + an "E) cannot be determined" option is a **known-degenerate** instrument for abstention on three independent grounds (below). Reproduced at $0: abstention = **0.000 in every cell of all 6 models** → zero discriminative power. | **Measurable, but NOT worth training for this base model.** On a free-form instrument the *base* model already abstains **0.917 vs 0.000** — and the 5 B-2 fine-tunes reproduce it exactly (§6.1 probe, executed). The behavior is present in the base; training only restyled the decline wording. | **RE-INSTRUMENT, do NOT retrain.** Score abstention free-form in the harness ($0). The $0 gate ran and proved a training arc redundant — don't fund it. |
| **`full` (in-context reasoning over a serialized note-list)** | **PARTIALLY, and confounded.** The baseline is non-degenerate (0.330, has headroom), but the FT-minus-baseline delta is **confounded** by the fine-tune's collapse in single-letter compliance (§4). The −0.211 "regression" overstates the reasoning loss. | **LARGELY NO.** Exact enumerate→group-by→count over a serialized list is a **residual architectural ceiling** for a 7B (TC⁰-class counting limits; SFT memorizes the grid, not the algorithm). The **tool already serves it** — that is the line's confirmed win. | **ABANDON as an SFT target.** Route to the tool. If ever revisited, the only evidence-backed lever is *short, length-matched, tokenization-aware* enumerate-count chains — low expected value; not worth a paid arc on its own. |

**One-line synthesis:** B-2 measured two prose targets with an instrument valid only for the *tool* surface. The abstention *behavior* is real and re-instrumentable; the `full` *ceiling* is real and tool-served. The correct next move is not "train prose harder" — it is "re-instrument abstention and prove it moves on the base model at $0, or drop it," and "stop targeting `full`."

## Standards compliance (six standards, 0–3)

| Standard | Score | Evidence |
|---|---|---|
| PIN_PER_STEP | 2 | The four lane prompts, the `oracle.mjs` existence-oracle, and the `inspect-abstain.mjs` sealed-artifact tabulator are pinned (scratchpad + receipt); not a formal byte-lockfile (this is an advisory memo, not a spend lock). |
| ANDON_AUTHORITY | 3 | The citation oracle HALTs on any non-resolution (0/36 missing); every recommendation gates on a $0 pass/fail check before spend; the memo refuses to convert "trained behavior" into "measurable behavior" without instrument evidence. |
| NAMED_COMPENSATORS | 3 | $0 read-only research. The only world-touching action is the git commit of this memo + receipt → `git revert`. No pod, no publish, no frozen artifact touched (read-only by construction). |
| DECOMPOSE_BY_SECRETS | 3 | Additive under `docs/`; consumes the frozen v0/v1/B-1/B-2 artifacts as read-only inputs; changes no bar, δ, or sealed result. |
| UNCERTAINTY_GATED_HUMANS | 3 | The memo hands the pursue/abandon decision to the director and specifies the $0 dry-defense gate as *a lever the director holds*; contrastive framing throughout ("you may expect X; the evidence says Y"). |
| EXTERNAL_VERIFIER | 3 | **Two-stage, both run.** Stage 1 existence oracle = deterministic arXiv API retrieval, mechanism-diverse from the four generating agents (which are *inputs*, not verifiers); 35/35 arXiv + 1 ACL resolved. Stage 2 groundedness = a **cross-family cloud PoLL jury** — deepseek-v4-pro (1.6T) · glm-5.2 (756B) · minimax-m3, all family-disjoint from the Anthropic synthesizer, reasoning-stripped, each judging a finding against the paper's verbatim abstract; lone-dissent-never-decides: **34/35 CONFIRMED, 1 NEEDS_REVIEW, 0 REFUTED** ([jury receipt](finetune-arc-prose-measurement.jury-receipt.json)). The jury earned its keep — it caught L1-05's P(IK) over-generalization (now corrected). **Honest ceiling:** a CONFIRMED on frontier-authored claims is corroboration, not proof. |

## 1. The instrument B-2 used (mechanically pinned)

From [src/dataset/eval/llm-runner.ts](../src/dataset/eval/llm-runner.ts) and [experiments/finetune-arc-b2/scripts/run-b2-evals.mjs](../experiments/finetune-arc-b2/scripts/run-b2-evals.mjs):

- **Options:** the 4-tuple `MCQuestion.options` (A–D) is unchanged; abstain is an out-of-band 5th letter — `buildE3UserPrompt` appends `E) cannot be determined from what is given` to the option block.
- **Permission granted:** `E3_SYSTEM_TEXT_ABSTAIN` explicitly instructs *"Choose E when — and only when — the information provided is insufficient to answer; do NOT guess."* So the instrument is not "missing the option" — it offers it and permits it.
- **Output channel:** `maxTokens: 16, // Single letter only`; the system prompt demands *"ONLY the single letter … No explanation, no punctuation."*
- **Detection:** `parseE3Response(text, true)` maps an "E" to `E3_ABSTAIN = −2` — a value distinct from a 0–3 answer and from a `null` parse-fail. So the harness *could* register an abstention if one were emitted.

The instrument therefore offered abstention, permitted it, and could detect it — and still read a flat **0.000**. That isolates the failure to the models' *propensity* to route "I can't tell" into selecting a capped single-letter meta-option, which is exactly the behavior the literature (§5, Lane 1) says this format suppresses.

## 2. What actually failed in B-2 (from the sealed report + stats)

| Quantity | Value | Note |
|---|---|---|
| Primary — `tool_inspected` non-inferiority | **HELD** (0.877 vs 0.890, CI95 lo −0.031 > −0.050; NFR 0.050 ≤ 0.18; > baseline 0.735) | The instrument is **valid here** — the FT complies (emits a letter) and wins on the tool surface. |
| Secondary — `text_only` abstention rate | **0.000 vs 0.000** | Degenerate: identical for baseline and every FT. |
| Secondary — `full` non-inferiority | **NO** — 0.119 vs 0.330 (Δ −0.211) | Regressed; but see §4 — the delta is confounded. |
| Secondary — over-refusal guard | cov 1.000 / sel-acc 0.661 → "met" | Trivially: coverage is 1.000 *because* the model never abstains. This is the secondary that mechanically triggered the PASS. |

## 3. $0 reproduction from the sealed artifacts (read-only; no model re-run)

I tabulated `selectedOptionIndex`, `completionTokens`, and `questionType` across all six sealed result files (`evals/b2-{baseline,seed*}-results.json`) — reading, not re-running (`inspect-abstain.mjs`). Per-condition, per model, ~1,600 runs each; ~9,600 total.

- **Abstention (selecting "E") = 0 in every cell of every model.** Not one run out of ~9,600 selected E — baseline included. This is the flat-zero degeneracy, independently reproduced.
- **The models are not silent.** On answerable surfaces the baseline *commits* to A–D letters at high rates (e.g. `full` MIDI-only: **311/426 answered**, spread A=19/B=86/C=83/D=123). The empty E-channel is a **propensity** fact, not a broken-output fact — the forced-choice prior overwhelms the decline channel.
- **The single-letter parser collapses distinct behaviors into one zero bucket.** The baseline emits *only* ~2-token outputs (`pf_len` 100% at ctoks=2 — it always tries a bare letter). Several fine-tunes instead emit **longer (3–16 token) outputs specifically on the unanswerable MIDI-only conditions** (e.g. seed42 `full`: 161 medium-length parse-fails; seed512 `random_midi`: 52 medium + 9 at the 16-token cap) — outputs a bare-letter parser can only score as `null`/0. This is **seed-variable** (seed271 emits only short tokens), so I do **not** claim "the FTs emit decline phrases." What is airtight: **the instrument cannot distinguish a deliberate free-form decline from a formatting miss — both are scored 0** — so even a model that *did* decline would be invisible.

## 4. The `full` regression is confounded with format compliance

On `full`, the baseline gets a parseable letter on **311/426** MIDI-only runs; the fine-tunes on only **72–137/426**. A parse-fail scores 0. So a large share of the FT's low `full` number is *not* "reasoned and chose wrong" — it is "did not emit a bare letter, and the maxTokens-16 single-letter parser scored it 0." Both arms use the same parser, so the *comparison* is not invalid — but the fine-tune's own trained verbosity/tool-reaching defeats the answer-extraction, and the instrument **cannot separate a reasoning loss from a format-compliance loss.** The measured −0.211 therefore **overstates** any true in-context-reasoning regression. (This is a measurement caveat on the `full` secondary that is independently visible in the sealed data — it does not touch the tool-hold primary, where the FT complies and wins.)

## 5. Research grounding (study-swarm 2026-07-13; 36 sources, existence-oracle-verified)

Four parallel lanes, study-swarm protocol (named papers, years, arXiv IDs, one-sentence findings; every citation retrieved, not recalled). Existence oracle: **35/35 arXiv + 1 ACL resolved, 0 fabricated**. Groundedness (cross-family cloud jury, §Standards → EXTERNAL_VERIFIER): **34/35 CONFIRMED, 1 NEEDS_REVIEW (L1-05, corrected in-place above), 0 REFUTED**. Both receipts beside this memo.

### Lane 1 — Instruments: what elicits/detects abstention on a ~7B, and is MCQ-"E" known-degenerate?

1. **Forced-choice MCQ with a "none/cannot-determine" meta-option is documented-degenerate — models systematically under-select the meta-option regardless of scale.** Tam et al. 2025 (arXiv:2503.01550). A ~0.000 selection rate for "E" is the format's *known pathology*, not evidence the model cannot abstain.
2. **The emitted MCQ letter is dominated by a content-independent token prior over option-IDs (A/B/C/D).** Zheng et al. 2023 (arXiv:2309.03882). A rarely-primed 5th token "E" sits at the low end of that prior — the format actively suppresses the exact response we tried to count.
3. **MCQ accuracy swings by tens of points purely from reordering options.** Pezeshkpour & Hruschka 2024 (arXiv:2308.11483). Even the non-abstention part of a single-letter readout is unstable — a poor instrument for a subtle trained behavior.
4. **Output/answer confidence tracks *correctness* but is near-blind to *answerability*, across five instruct models 2B–14B, and the gap does not shrink with scale.** Wagner et al. 2026 (arXiv:2607.08456). A single forced answer-letter structurally cannot express "cannot be determined" at 7B — you must read a different surface. *(Same "Two Axes" paper the B-2 lock cited.)*
5. **P(True) — a model scoring the probability its own answer is correct — is a continuous, reasonably-calibrated, thresholdable quantity that improves with scale; the related P(IK) ("do I know this?") is predictable but its calibration does not fully generalize to new tasks.** Kadavath et al. 2022 (arXiv:2207.05221). A P(True) logit-self-eval instrument yields a graded, non-degenerate baseline out of the box (the load-bearing use here); P(IK) is a weaker add-on. *(The cross-family jury flagged the original wording for over-generalizing P(IK) calibration — narrowed to this; the abstention verdict rests on P(True)/free-form, so nothing downstream changes.)*
6. **Verbalized confidence (asking "how sure, 0–100%?") is better-calibrated than token probabilities, ~50% ECE reduction.** Tian et al. 2023 (arXiv:2305.14975). An explicit confidence prompt gives a gradable abstention signal (check 7B calibration; shown on RLHF/API models).
7. **Verbalized-confidence elicitation gives a varying (if overconfident) distribution even on open ~7B chat models (LLaMA-2-Chat).** Xiong et al. 2023 (arXiv:2306.13063). Non-degenerate spread — the discriminative power the single letter lacks.
8. **Semantic entropy (sample several free-form answers, cluster by meaning, take entropy) predicts correctness unsupervised from one off-the-shelf model.** Kuhn et al. 2023 (arXiv:2302.09664). A free-form instrument yields a continuous uncertainty score with baseline discriminative power — no 5th option, no retraining.
9. **R-Tuning installs free-form "I don't know," improves calibration, and the refusal generalizes out-of-domain.** Zhang et al. 2023 (arXiv:2311.09677). Free-form generation + decline detection is the surface that *responds* to abstention training — measure it where you trained it.
10. **On a 20-dataset unanswerable benchmark, free-form abstention rates vary widely across models (and drop 24% under reasoning FT).** Kirichenko et al. 2025 (arXiv:2506.09038, AbstentionBench). Free-form abstention is a live, non-flat measurement that *separates* models — the opposite of the MCQ's flat 0.000.

**Lane-1 synthesis:** the forced single-letter A–E MCQ + "E" is degenerate for abstention on three independent grounds — meta-option under-selection (1), option-ID token bias (2), and an output channel near-blind to answerability at 2B–14B (4). Every instrument with a *non-degenerate* baseline reads a different surface: verbalized confidence (6,7), P(True)/P(IK) (5), semantic entropy (8), free-form decline (9,10).

### Lane 2 — Trainability + free-form↔MCQ transfer

11. **Refusal-aware SFT ("say I don't know") installs abstention on instruction-tuned LLMs and generalizes as a meta-skill — taught/scored as free-form generation.** Zhang et al. 2023 (arXiv:2311.09677). Abstention *is* SFT-trainable; the field measures it free-form, not by MCQ-letter.
12. **Fine-tuning for honesty makes models proactively refuse beyond-knowledge questions without hurting helpfulness.** Yang et al. 2023 (arXiv:2312.07000). The target is SFT-reachable — again via generated refusal.
13. **Gradient-driven refusal-aware tuning treats open-ended and multiple-choice as *separate* evaluation surfaces.** Zhu et al. 2025 (arXiv:2502.05911, GRAIT). The frontier does not assume the two formats are interchangeable.
14. **The dominant failure mode of refusal-aware tuning is *over*-refusal, which methods must actively suppress.** Zhu et al. 2024 (arXiv:2410.06913, CRaFT). The real risk is blanket declining — the *opposite* of B-2's 0.000, pointing at the instrument, not the training.
15. **Aligned/post-trained models default to selecting an invalid substantive option instead of abstaining, whereas base models refuse better.** Góral et al. 2024 (arXiv:2409.00113). Directly predicts abstention ≈ 0 on a forced MCQ for an instruction-tuned 7B.
16. **Even GPT-4-class models struggle to abstain on MCQ and guess rather than decline; only strict prompting recovers it.** Madhusudhan et al. 2024 (arXiv:2407.16221). An MCQ abstention null is *expected*, not proof the behavior is absent.
17. **First-token / option-letter probabilities diverge from the model's generated text — including refusals — >60% of the time.** Wang et al. 2024 (arXiv:2402.14499). The letter channel and the free-form channel are different instruments; a behavior visible in generation can be invisible in letter-selection.
18. **Generative "answer-matching" evaluation measures a materially different capability than multiple-choice; model rankings shift.** Chandak et al. 2025 (arXiv:2507.02856). The 0.75–0.88 free-form proxy and the 0.000 MCQ number can *both* be true of the same weights.
19. **Semantically-neutral prompt-format changes swing task accuracy by tens of points.** Sclar et al. 2023 (arXiv:2310.11324). A score tied to one output format is a property of the format — so is an abstention score.

**Lane-2 synthesis:** (a) abstention is demonstrably SFT-trainable on 7B-class instruct models (11–14), and the field teaches/measures it free-form, where the failure mode is over-refusal, never silent under-refusal; (b) free-form→MCQ transfer is a **known brittleness** (15–19). Measuring abstention as "select E" on a forced A–E MCQ is the **wrong instrument**; 0.000 there is the expected reading, and the free-form 0.75–0.88 is where the behavior lives.

### Lane 3 — Is `full` a movable SFT target or a residual ceiling?

20. **Exhaustive SFT on multi-digit multiplication gives near-perfect in-distribution and near-zero OOD accuracy; extra epochs never fix generalization.** Dziri et al. 2023 (arXiv:2305.18654, Faith and Fate). Worked-chain SFT on an exact-aggregation task memorizes the grid, not the algorithm.
21. **Small (≤~7B) models show a "learnability gap": long/complex CoT distillation actively *hurts*; only short simple chains help.** Li et al. 2025 (arXiv:2502.12143). Training a 7B on long enumerate→group→count chains can *regress* it — mechanistically explains the sub-baseline `full`.
22. **Transformers are TC⁰-confined with no unbounded counter: single-pass counting is perfect then collapses past a critical count, and BPE tokenization degrades it by obscuring item boundaries.** Zhang et al. 2024 (arXiv:2410.19730). A serialized MIDI note-list is exactly the boundary-obscuring, long-count regime where in-context aggregation breaks.
23. **Log-precision transformers are simulable by constant-depth uniform TC⁰ circuits — a hard architectural ceiling on single-forward-pass computation.** Merrill & Sabharwal 2023 (arXiv:2207.00729). Aggregation needing input-length-growing sequential depth is out of reach without externalized steps or a tool.
24. **Small transformers learn search/reachability on easy instances but fail as complexity grows, regardless of added data or parameters.** Saparov et al. 2024 (arXiv:2412.04703). More SFT data does not buy robust multi-step aggregation at small scale.
25. **A reliability↔capability seesaw on the reasoning↔tool axis: raising reasoning amplifies tool hallucination and vice-versa.** Yin et al. 2025 (arXiv:2510.22977, Reasoning Trap). Corroborates a genuine trade-off — concentrating on one surface costs the other.
26. **Offloading arithmetic to a Python interpreter (PAL) beats CoT by ~15% absolute, a 540B CoT model included.** Gao et al. 2022 (arXiv:2211.10435). Routing exact computation to a deterministic runtime is the highest-yield move — the tool surface.
27. **Program-of-Thoughts gains ~12% average over CoT across eight datasets by delegating computation.** Chen et al. 2022 (arXiv:2211.12588). "What to compute" vs "compute it exactly" is a repeatable win over in-context arithmetic.
28. **Tool-integrated ToRA-Code-7B reaches 72.6% GSM8K / 44.6% MATH — 13–19% absolute over prior open 7B–70B — by interleaving reasoning with tool calls.** Gou et al. 2023 (arXiv:2309.17452). At *exactly* 7B, the durable gains live on the tool-grounded surface — mirroring the line's tool-hold win.
29. **In-context structured-list reasoning is strongest when the model operates *on* the structure (Chain-of-Table) rather than aggregating in prose; table-tuning (Table-GPT) helps but generalization stays bounded.** Wang et al. 2024 (arXiv:2401.04398); Li et al. 2023 (arXiv:2310.09263). SFT raises structured reasoning modestly; the robust pattern is externalize, don't count-in-prose.

**Lane-3 synthesis:** `full` — exact enumerate→group-by→count over a serialized list — is a **residual architectural ceiling on a 7B, not a reliably movable SFT target.** Theory (22,23) plus empirics (20,21,24) predict the observed sub-baseline `full` and the seesaw (25). The durable, replicated win is routing exact computation to a deterministic tool (26,27,28) — which the line already has. If `full` must be nudged, the *only* evidence-backed lever is short, length-matched, tokenization-aware enumerate-count chains (21) — not longer chains, which hurt at this scale.

### Lane 4 — Pre-arc measurement-validity (feeds the checklist, §7)

30. **Construct validity must be established before a proxy metric is trusted — harm arises when the operationalization drifts from the construct.** Jacobs & Wallach 2021 (arXiv:1912.05511). → operationalization-audit gate.
31. **A benchmark measures its administered task, not the broad capability it is valorized as measuring.** Raji et al. 2021 (arXiv:2111.15366). → name the exact behavior the metric registers; confirm it equals the trait.
32. **Benchmarks break without headroom; a useful metric must discriminate between systems.** Bowman & Dahl 2021 (arXiv:2104.02145). → headroom gate (the mirror case is a *floor* with no room above 0.000).
33. **IRT/Bayesian item analysis: examples every system answers identically carry zero discriminative signal about ability.** Rodriguez et al. 2021 (ACL 2021, [aclanthology.org/2021.acl-long.346](https://aclanthology.org/2021.acl-long.346/)). → **the** gate: a metric the baseline scores 0.000 on is a zero-discrimination item that can register no change.
34. **Most NLP experiments are underpowered — a 2,000-sentence MT set has ~75% power for a 1-BLEU gap — so realistic effects vanish unless power is checked ex ante.** Card et al. 2020 (arXiv:2010.06595). → minimum-detectable-effect gate at the chosen n.
35. **Preregistration forces stating the exact confirming metric before the run, surfacing measurability gaps.** van Miltenburg et al. 2021 (arXiv:2103.06944). → write the confirming-measurement plan at $0; if you cannot state what result would register, stop.
36. **Trivial format/answer-extraction perturbations shift leaderboard rankings by up to 8 positions — a metric that flips under formatting is not a stable construct.** Alzahrani et al. 2024 (arXiv:2402.01781). → format/extraction-robustness gate.

## 6. Recommended instruments + the $0 confirmation plan per movable target

### 6.1 Abstention — RE-INSTRUMENT, then gate at $0

**Recommended instrument (primary):** **free-form generation + decline-phrase detection** — the surface where the behavior is trained (11) and measurably variable across models (10). Score as **selective prediction** (coverage / selective-accuracy / risk-coverage), the machinery the B-2 lock already grounded (Kamath 2020; Geifman & El-Yaniv 2017/2019; Traub 2024). **Optional graded add-ons** for a confidence axis: verbalized confidence (6,7), P(True)/P(IK) (5), or semantic entropy (8) — each non-degenerate on a base model.

**The $0 pre-arc gate (a lever the director holds — run BEFORE proposing an arc):**
1. Take the existing B-2 MIDI-only questions + their answerable twins (already built, [experiments/finetune-arc-b2/data/sft-val-abstention.jsonl](../experiments/finetune-arc-b2/data/sft-val-abstention.jsonl)).
2. Run the **base `qwen2.5:7b`** (local ollama, $0 — no pod, no training) with a **free-form** system prompt: *"Answer the question, or if it cannot be determined from what you are given, say so and state what is missing."* No 16-token cap.
3. Detect declines with a phrase/NLI matcher (R-Tuning-style) → per-condition abstention rate + selective-accuracy.
4. **Pass criterion (pre-register it):** the **base model's** abstention rate is **strictly between 0 and 1 AND higher on the unanswerable MIDI-only questions than on the answerable twins.** That is the non-degeneracy + directionality proof the MCQ never had (33, 32). Only if it passes does an abstention-training arc get proposed; then the *fine-tune's* movement is measured on the *same* free-form instrument.

Note: the B-2 sealed artifacts store only `selectedOptionIndex`/token counts, **not raw text**, so this gate cannot be re-derived from them — it needs a fresh *base-model* free-form pass (still $0, local).

**Probe EXECUTED 2026-07-13 ($0, local) — [probe receipt](finetune-arc-prose-measurement.probe-receipt.json).** Ran base `qwen2.5:7b` + all 5 frozen B-2 fine-tunes on the 24-item abstention val set, free-form, temp 0. Result:

| | unanswerable decline | answerable over-refusal | false-premise (c) | answerable correct |
|---|---|---|---|---|
| base qwen2.5:7b | **11/12 (0.917)** | 0/12 | 3/4 | 10/12 |
| all 5 B-2 fine-tunes | **11/12 (0.917)** | 0–1/12 | 3/4 | 7–9/12 |

- **Gate PASSES on measurability:** free-form abstention is **0.917 vs 0.000** (non-degenerate, directional) where the MCQ read a flat 0.000 — the B-2 "prose-null" was a **pure instrument artifact**, now proven.
- **But the abstention *training* target is dead:** the base model already abstains at 11/12 free-form with **zero training**, and the five B-2 fine-tunes reproduce *exactly* that — same 11/12, same single hard miss (`c::022`, a false premise every model hallucinates). C4 training taught the model the decline *phrasing* (the FTs emit the trained templates verbatim) but **no abstention capability the base lacked**; answerable-correctness is if anything slightly *lower* (the known prose tax). **No headroom, no training effect → do not fund an abstention arc.** The fix is the instrument (free-form scoring), which is $0.

### 6.2 `full` — ABANDON as an SFT target; route to the tool

No new instrument is recommended, because the target itself is not worth pursuing (§Lane 3). If the director nonetheless wants a $0 sanity check before dropping it:
- **De-confound the measurement:** re-score `full` with a **permissive answer-extraction** (accept a correct answer embedded in verbose output) instead of a bare single letter — this separates "reasoned wrong" from "format non-compliant" (§4). *Caveat:* not derivable from the sealed artifacts (no raw text stored); needs a fresh **base-model** `full` pass with generous `maxTokens` + extraction — $0, local.
- **MDE check (34):** given a non-degenerate 0.330 baseline and the TC⁰-class ceiling evidence, the plausible SFT effect is small and likely negative at 7B. The expected value of a `full`-targeting arc is low; the tool already dominates this surface (28).

## 7. Reusable pre-arc measurement-validity checklist (Lane 4 deliverable)

Run this **at $0, before approving any paid training run.** Each gate is a pass/fail question a director can ask; each is annotated with the finding(s) that justify it. A "no" is a **stop sign**, not a footnote — the B-2 lock *noted* the single-operating-point warning and shipped it as a caveat; that sentence meant the abstention secondary was dead on arrival.

- [ ] **Non-degeneracy on the untrained baseline (the gate that would have caught B-2).** Does the metric land **strictly between floor and ceiling — not 0.000 and not 1.000 — on the *untrained baseline***? A constant item has zero discriminative power and can register no training effect. *(33, 32, 34)*
- [ ] **Operationalization audit.** Can you write **one sentence** naming the exact behavior scored, and does it **equal** the construct you mean to move rather than a proxy that excludes it? *(30, 31)*
- [ ] **Channel existence.** Does the output **format physically allow** the target behavior to be emitted *and* scored? A forced single letter cannot carry abstention or verbose reasoning. *(4, 31, and §1/§4 here)*
- [ ] **Instrument–behavior match.** Are you **measuring the behavior on the surface where you train it** (free-form ↔ free-form), not across a known-brittle format gap (free-form → MCQ letter)? *(17, 18, 19)*
- [ ] **Minimum detectable effect at n.** At the planned eval size, is a **realistically-sized effect detectable** (power ≥ 0.8), computed *before* spend? *(34)*
- [ ] **Format/extraction robustness.** Is the metric **invariant within a reported spread** to trivial prompt-format and answer-extraction choices, so a measured delta is not an artifact? *(19, 36, 2, 3)*
- [ ] **Preregister the confirming measurement.** Before spend, is the **exact success result written down AND shown producible by the instrument on today's baseline**? If you cannot state what result would register, the $0 review is the stop sign. *(35)*

## 8. Recommendation to the director

1. **Abstention: fix the instrument, do NOT retrain — the $0 gate (§6.1) has now been run and it kills the arc.** The MCQ-"E" surface was degenerate (flat 0.000 across ~9,600 runs), reproduced at $0. The gate then showed free-form abstention is strongly measurable — but also that **base Qwen2.5-7B already abstains at 0.917 free-form with zero training, and the five B-2 fine-tunes reproduce exactly that (11/12, same single miss).** So abstention is *measurable* but not a *movable SFT target* for this base model — the behavior is already present; C4 training only restyled the decline wording. **Recommendation: score abstention free-form in the harness (a $0 change) and do not fund an abstention training arc.** The validate-instrument gate did its job — it converted "maybe train abstention" into "proven redundant" at $0.
2. **`full`: drop it as an SFT target.** It is a residual 7B ceiling (20–24), the measured regression is partly an instrument artifact (§4), and the tool already serves this surface at a large, replicated margin (26–28). Do not spend on it.
3. **The line's honest four-arc story is unchanged and correct:** v0 negative → v1 underpowered → B-1 powered tool-win → B-2 tool-win-retained / prose-null. This memo adds the *why* for the prose-null: **the prose targets were measured on an instrument valid only for the tool surface.** The tool-grounded win — the published claim ([mcp-tool-shop/jam-ft-v1-qwen25](https://huggingface.co/mcp-tool-shop/jam-ft-v1-qwen25)) — is untouched.

## 9. Receipts

- **Citation existence oracle (Stage 1):** [finetune-arc-prose-measurement.citation-receipt.json](finetune-arc-prose-measurement.citation-receipt.json) — arXiv API `id_list`, **35/35 arXiv resolved, 0 fabricated**, + Rodriguez et al. 2021 verified via ACL Anthology = **36/36 sources**.
- **Citation groundedness — cross-family cloud jury (Stage 2):** [finetune-arc-prose-measurement.jury-receipt.json](finetune-arc-prose-measurement.jury-receipt.json) — PoLL of deepseek-v4-pro (1.6T) · glm-5.2 (756B) · minimax-m3, family-disjoint from the synthesizer, reasoning-stripped, each finding judged against its paper's verbatim abstract; lone-dissent-never-decides. **34/35 CONFIRMED, 1 NEEDS_REVIEW (L1-05 → corrected), 0 REFUTED**; 3/3 cloud-served every batch. 13 `ollama_verify_claims` runs (ids in the receipt). Operational lesson: batch ≤3 claims/call for these thinking flagships (at 9, verbose juror output overflowed the parser and 2/3 were excluded).
- **$0 sealed-artifact inspection:** `inspect-abstain.mjs` (scratchpad) — read-only tabulation of `evals/b2-{baseline,seed*}-results.json`; abstention = 0.000 in all cells of all 6 models reproduced; the answer-letter / parse-fail / completion-token distributions in §3–§4.
- **Read-only inputs (untouched):** the frozen v0/v1/B-1/B-2 sealed artifacts, `b2-stats.json`, `b2-cohort.json`, the v0.5.0 package. No model was run; no pod; no HF push. Compensator for this memo: `git revert`.
