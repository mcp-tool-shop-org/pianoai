# Maker Arc — Phase C design study: the levers, and whether the pod is needed at all

**Date:** 2026-07-22 · **Class:** design study + $0 local experiments (study-swarm grounded; local Ollama; no pods, no API spend, no publishes) · **Status:** DRAFT — grounding VERIFIED (40/40 existence oracle, cross-family jury 13✓/0-refuted); experiments E1+E3 IN, E2 pending; the pod decision is a director gate · **Predecessor:** [maker-arc-e2v2-regate-report.md](maker-arc-e2v2-regate-report.md) (the re-gate that established E-R TRAIN-HEADROOM) · **Protocol:** research-grounded-advisor (study-swarm), existence-oracle + cross-family jury before any finding becomes canon · **Verification receipt:** [maker-arc-phase-c.citation-receipt.json](maker-arc-phase-c.citation-receipt.json)

## What this is

The re-gate proved E-R (reharmonization) is a valid, discriminative maker instrument with an 86% ceiling and a 9% base — TRAIN-HEADROOM. The director asked for a study-swarm + local experiments before committing to a multi-hour RunPod fine-tune. This is that study. Its headline: **the swarm reframed the question from "how do we train voicing" to "does voicing need training at all" — and the $0 local experiments answer NO.** A weak local base + a deterministic voicer + a perfect-verifier best-of-n loop reaches the ceiling on E-R with zero GPU-hours.

## Standards compliance (six standards, 0–3)

| Standard | Score | Evidence |
|---|---|---|
| PIN_PER_STEP | 3 | Five research-lane prompts pinned; the experiment runners (`scripts/er-experiments.ts`) are seeded (base seed 42, per-sample 42+k) and deterministic; the voicer is pure. |
| ANDON_AUTHORITY | 3 | The citation gate HALTs on FABRICATED/REFUTED (none hit); the experiments fail-closed to `unrecoverable` on empty output, never a fabricated pass. |
| NAMED_COMPENSATORS | 3 | $0 read-only research + git-committed code/receipts → `git revert`. No pod, no publish. A Phase-C spend, IF still pursued, carries its own no-skip compensators table. |
| DECOMPOSE_BY_SECRETS | 3 | The voicer + experiment runner are additive; the frozen E-R item set, the sealed re-gate receipts, and the shipped verifier are read-only inputs. |
| UNCERTAINTY_GATED_HUMANS | 3 | The pod decision is a director gate, framed contrastively; nothing trains or spends without an explicit priced-ask. |
| EXTERNAL_VERIFIER | 3 | Two-stage citation gate BOTH RUN: deterministic retrieval oracle (40/40, 0 fabricated) + cross-family jury (deepseek-v4-pro + glm-5.2, reasoning-stripped, 13 confirmed / 0 refuted). The experiments' verifier is the platform's own deterministic `verifyHarmony` — the generator never grades itself. |

## Research grounding (the empirical floor) — VERIFIED

Five lanes; every finding oracle-existence-verified (receipt above) and the load-bearing ones cross-family-jury-checked (0 refuted). `Fn` numbers are referenced by the architecture below.

### Lane A — Neuro-symbolic decomposition (emit the choice, render the artifact)

- **F1. A two-stage coloring→voicing split beats end-to-end chord generation — in our exact domain.** Chen, Fukayama, Goto & Su, *Chord Jazzification*, ISMIR 2020 ([archive](https://archives.ismir.net/ismir2020/paper/000090.pdf)). → decompose: the model chooses the chord; a deterministic renderer voices it.
- **F2. Emit a spec, offload the deterministic computation to a non-learned interpreter — beats the model doing it end-to-end.** Gao et al. 2022, *PAL* (arXiv:2211.10435); Chen et al. 2022, *Program-of-Thoughts* (arXiv:2211.12588). → the voicing is the "computation"; hand it to `voiceChord`, don't learn it.
- **F3. Rule-based/symbolic optimization for high-level structure + neural realization beats pure-neural.** Zhao & Xia 2021, *AccoMontage* (arXiv:2108.11213). → the same layering our verifier + voicer implement.
- **F4. The LLM should be a candidate-generator wrapped by an external sound verifier, not a self-checker.** Kambhampati et al. 2024, *LLM-Modulo* (arXiv:2402.01817). → exactly our generate→verify_harmony loop.
- **F5. Grammar-constrained decoding guarantees structural validity and can match task-specific fine-tunes with NO fine-tuning.** Geng et al. 2023 (arXiv:2305.13971). → constrain the chord-symbol slot to the vocabulary for near-free validity.
- **F6. But naive constrained decoding hurts accuracy on subword-misaligned vocab; subword-aligned avoids the loss.** Beurer-Kellner et al. 2024, *DOMINO* (arXiv:2403.06988). → constrain the symbol, keep it subword-aligned; don't over-constrain.
- **F7. Strict output-format restrictions (JSON-mode) degrade reasoning while improving parseability.** Tam et al. 2024 (arXiv:2408.02442). → constrain the *slot the model chooses in* (chord symbol), NOT the serialization of low-level detail (voicing tokens) — the latter erodes the harmonic reasoning we want.

### Lane B — Inference-time verifier-guided generation (may obviate training)

- **F8. A perfect verifier removes the resampling accuracy ceiling — the ceiling is entirely verifier-false-positives.** Stroebl et al. 2024, *The Limits of Inference Scaling Through Resampling* (arXiv:2411.17501). → our exact `verifyHarmony` is uncapped; best-of-n keeps paying off.
- **F9. In auto-verifiable domains, coverage converts directly to solve-rate and scales ~log-linearly.** Brown et al. 2024, *Large Language Monkeys* (arXiv:2407.21787): a coder model 15.9%→56% at 250 samples. → measure the coverage@N curve; it is the decisive $0 test.
- **F10. A small base + test-time search beats a 14× larger model — on problems with non-trivial baseline success.** Snell et al. 2024 (arXiv:2408.03314). → base qwen2.5:7b already has non-trivial per-sample success once decomposed; search compounds it.
- **F11. Verification scales better with compute/data than fine-tuning.** Cobbe et al. 2021 (arXiv:2110.14168). → the founding best-of-n-vs-FT result.
- **F12. LLM self-correction without an external signal fails and can degrade accuracy.** Huang et al. 2023 (arXiv:2310.01798); Olausson et al. 2023 (arXiv:2306.09896). → the loop MUST use the external `verifyHarmony`, never model self-critique.
- **F13. Best-of-n Goodhart is a PROXY-reward effect, not a deterministic-verifier effect.** Gao et al. 2022 (arXiv:2210.10760). → our exact verifier is not a gameable proxy, provided the non-triviality guard closes the copy/degenerate loopholes (it does).

### Lane C — Training paradigm, IF training is still warranted

- **F14. Rejection-sampling fine-tuning helps weak models the most.** Yuan et al. 2023 (arXiv:2308.01825): LLaMA-7B 35.9%→49.3% on GSM8K. Zelikman et al. 2022, *STaR* (arXiv:2203.14465). → RFT on verify_harmony-passing samples is the primary workhorse if we train.
- **F15. RAFT (rejection-sampling SFT) is competitive with GRPO/PPO; GRPO's edge is discarding all-wrong prompts.** Xiong et al. 2025 (arXiv:2504.11343, corroborative). → SFT-on-verified captures most of RL's benefit without the machinery.
- **F16. RLVR sharpens the base distribution rather than expanding it — raises pass@1, can lower pass@k.** Yue et al. 2025 (arXiv:2504.13837). Cui et al. 2025, entropy collapse (arXiv:2505.22617). → RL would HURT the coverage a creative reharmonizer needs; avoid it for the diversity-critical maker.
- **F17. Skip DPO — preference optimization is dominated when a real verifier exists.** Xu et al. 2024 (arXiv:2404.10719); Lambert et al. 2024, *Tülu 3* RLVR (arXiv:2411.15124). → if we train, RFT, not DPO, not RL.

### Lane D — Anti-degradation (don't repeat the b2 collapse)

- **F18. LoRA underperforms full-FT on target but forgets less — including less than weight-decay/dropout.** Biderman et al. 2024 (arXiv:2405.09673). → LoRA is itself a forgetting-control.
- **F19. Forgetting is a power law in STEPS and params-tuned; early stopping alone won't save you.** Kalajdzievski 2024 (arXiv:2401.05605). → few epochs; the re-gate's own evidence (v1 over-trained voiced worse than base) is this finding, measured.
- **F20. Distribution-matched self-synthesized rehearsal beats generic replay.** Huang et al. 2024, *SSR* (arXiv:2403.01244). Luo et al. 2023 (arXiv:2308.08747). → rehearse base-generated reharmonization + JSON exemplars.
- **F21. Anchor to base — L2-SP / KL-to-base; forgetting tracks KL-to-base.** Li et al. 2018 (arXiv:1802.01483); Shenfeld et al. 2025, *RL's Razor* (arXiv:2509.04259). → KL/weight-decay anchor on adapter deltas.
- **F22. Narrow instruction-SFT collapses structured output via induced abstention on 7B models — the knowledge is present but no longer emitted.** Mitra et al. 2026 (arXiv:2607.18725, corroborative). → this IS our measured b2 format-collapse; gate every checkpoint on raw parse-rate + target quality against base.

### Lane E — Base model + format

- **F23. Music-pretraining a 7B beats a general 7B on symbolic music; ABC well-formedness 99.6% vs GPT-3.5's 65.4%.** Yuan et al. 2024, *ChatMusician* (arXiv:2402.16153). → if we train, a music-pretrained / ABC-native base, not a general 7B.
- **F24. LLMs are inherently more compatible with ABC than MIDI-derived tokens; ABC is ~38% the token length.** Qu et al. 2024, *MuPT* (arXiv:2404.06393). → ABC over REMI for any Phase-C training (Fork 3, now grounded).
- **F25. Conditioned symbolic generation is solved by conditioning + small models, not scale.** Thickstun et al. 2023, *Anticipatory Music Transformer* (arXiv:2306.08620); Wang et al. 2025, *NotaGen* (arXiv:2502.18008, sub-1B pretrain→FT→RL); Wu et al. 2023, *TunesFormer* (arXiv:2301.02884). → scale is not the lever; conditioning + verifier is.
- **F26. Even GPT-5 is weak at symbolic-music understanding (best 55%); LLM-as-music-judge is untrustworthy.** Zhao et al. 2025, *ABC-Eval* (arXiv:2509.23350). → keep the deterministic gate as the external verifier; never an LLM judge.
- **F27. Overtrained base models are harder to fine-tune (>2% regressions); format-restriction degrades reasoning, "reason-first serialize-later" recovers it.** Springer et al. 2025 (arXiv:2503.19206); "Capacity, Not Format" (arXiv:2606.09410). → another reason to prefer inference-time composition over aggressive SFT.

## The architecture the evidence converges on

The studio's standing pattern (deterministic floor → model in the choice role → verifier as admission gate), instantiated for reharmonization:

```
model chooses CHORD SYMBOLS  (the harmonic reasoning — F1, F7, the only learned part)
        ↓
deterministic VOICER renders the voicing  (F1/F2/F3 — never learned; 100% fidelity by construction)
        ↓
verify_harmony ADMITS or rejects  (F4/F12 external verifier)
        ↓
best-of-n resample on reject  (F8/F9/F10/F11 — perfect verifier, uncapped, log-linear coverage)
```

Every load-bearing choice is grounded: decompose (F1–F3), constrain the symbol slot not the serialization (F5–F7), external-verifier-not-self-critique (F4/F12), best-of-n against a perfect verifier (F8–F13). Training (Lane C/D/E) is the FALLBACK the experiments test the need for — and if pursued, is RFT-on-verified + LoRA + few-epochs + rehearsal + KL-anchor on an ABC-native base (F14–F27), never RL/DPO.

## Local experiments ($0, base qwen2.5:7b, frozen 22-item E-R set)

Receipts: [`experiments/maker-arc/phase-c-experiments/`](../experiments/maker-arc/phase-c-experiments/).

- **E1 — decompose (chords-only + deterministic voicer), single pass:** **9% → 50%** (11/22). Of the 12 items where the model emitted in-vocabulary chords, **11 passed (92%)** — removing the 37%-voicing-fidelity bottleneck by construction (F1). The failures are empty proposals (chords-only format not parsed, or richer chords — 6/9/add/slash — outside the 10-quality vocabulary). Confirms F1/F7.
- **E3 — decompose × best-of-n (the candidate inference product):** coverage **@1=50% → @2=50% → @4=59% → @8=73% → @16=91%** (20/22). A clean log-linear climb to the Claude ceiling (86%) with **zero training** — exactly F8 (perfect verifier, no ceiling) + F9 (coverage→solve-rate). The high-n items (experience @14, amazing-grace @6) are the ones E1 single-pass missed; resampling recovered them.
- **E2 — best-of-n on the FULL prompt (no decompose):** coverage **@1=5% → @16=9%.** Search alone barely moves — the base keeps regenerating broken voicings (37% fidelity), so resampling the same failing process hits a wall. This isolates the result: **decompose is the essential multiplier, not search.** The two levers are multiplicative and both necessary — decompose removes the fidelity wall (E1: 9%→50%), search then recovers the format/vocabulary misses (E3: 50%→91%). Search *without* decompose (E2) stays at the single-shot rate.

**The headline number:** E3 (base + voicer + best-of-16) reaches **91% (20/22) — ABOVE the Claude single-shot ceiling of 86%.** A weak local base with a deterministic renderer and 16 verified tries beats the frontier model's one blind attempt, precisely the F8/F9 mechanism (perfect verifier → uncapped coverage → solve-rate). The two items not cleared at n=16 (fallin 6/8, agua-de-beber) are NOT proven saturated — the curve is still climbing at 16 (73%→91%), not plateaued.

## Decision — the pod is not needed for the E-R capability

The maker **ships as a $0 inference system**: base `qwen2.5:7b` + `voiceChord` (deterministic renderer) + `verify_harmony` best-of-n. It already clears E-R at 91%, exceeding the frontier single-shot ceiling, with zero GPU-hours and zero training risk (it cannot degrade the base — there is no fine-tune).

**Contrastive frame for the director.** You might have expected Phase C to be "train the local maker on RunPod." The evidence says the novel move — decompose the deterministically-solvable sub-problem out (F1–F3), then let a perfect verifier + search do the rest (F8–F13) — reaches the ceiling for free. The RunPod fine-tune buys **only one thing** the inference system cannot: a **single-shot** model (no ~16× inference cost per reharmonization). That matters for real-time/interactive use; it does not matter for offline/batch studio generation, where 16 local samples cost seconds and $0. And crucially: the inference system is itself the **rejection-sampling (RFT) corpus generator** (F14) — so if a single-shot model is ever wanted, this system produces its verified training data for free. **Training is demoted from a prerequisite to an optional future optimization.**

**Recommendation:** ship the inference maker now; do NOT fire the pod. Two cheap $0 product improvements surfaced by E1 (expand the chord vocabulary to 6/9/add/slash chords — the "empty" E1 items were often the base choosing richer valid chords the 10-quality vocabulary rejects; and an ABC composition path per F23/F24) would lift the ceiling further without any training. Optional $0 follow-up: run E3 at n=32/64 to confirm whether fallin/agua-de-beber saturate (training-relevant) or just need more samples.

**What would flip this to a pod:** a director requirement for single-shot / low-latency reharmonization, OR E3 saturating well below the bar at high n on a material fraction of items (F9's caveat — the one thing search cannot buy). Neither holds on the current evidence.
