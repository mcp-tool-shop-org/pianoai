# Finetune Arc B-2 — P0 Preregistration Lock (the prose-surface retain-and-calibrate retrain)

**Status: BUILD COMPLETE — corpus generated, all gates (G1–G8 + render) PASS, remaining numbers FROZEN into [data/b2-cohort.json](data/b2-cohort.json) (2026-07-13). Committed as the P0-b2 artifact. NO model has run, no pod exists.** The design was director-approved 2026-07-13 (kickoff); the remaining gate is the **DIRECTOR'S PRICED-ASK (~$14–18, ceiling $24)** before any pod (P2). The lock is frozen the moment this commit lands, before the first model call (the pre-run gate asserts the commit). Build receipts: [P1b2-gate-report.json](data/P1b2-gate-report.json) (verdict PASS), [P1b2-render-receipt.json](data/P1b2-render-receipt.json) (G7 PASS, grand max 9334 ≤ 12288). One eval-surface refinement surfaced during build — see amendment **A1-b2**.

**Mandate:** director-directed 2026-07-13 ("prepare for B-2 … green to proceed"), executing the prose-surface arc the B-1 report named as future work. **Process shape inherited wholesale from** [experiments/finetune-arc-v1/P0-LOCK.md](../finetune-arc-v1/P0-LOCK.md) (the training-arc lock) **and** [experiments/finetune-arc-v2/P0-LOCK.md](../finetune-arc-v2/P0-LOCK.md) (the confirmatory-eval discipline). Everything not stated as a delta below follows those locks verbatim: pre-training deviations are amendments (A1-b2…) in this file; post-training deviations are reported in the B-2 report, never silently patched; no best-of-seeds; all five seeds report; one eval per model.

**The question this arc answers:** across v0/v1/B-1 the fine-tune wins on tool-grounded QA (B-1: `tool_inspected` 0.678→0.890) but sits **below** the prompted baseline on prose-only surfaces (`full` −0.083, `text_only` −0.074). **B-2 does not try to "beat baseline on prose."** The study-swarm (§1) reframed the goal into three honest targets: (1) **HOLD** the tool win; (2) **CLOSE** the `full` gap (a proven residual ceiling — 7B transformers cannot match a counting tool at exact aggregation, so parity-with-baseline is the ceiling, not beating the tool); (3) on `text_only`, teach **calibrated abstention** — the eval's scored questions are all MIDI-only, genuinely unanswerable from teaching-prose, so the correct action is to *decline*, not guess.

## Standards compliance (six standards, 0–3)

| Standard | Score | Evidence |
|---|---|---|
| PIN_PER_STEP | 3 | Inherits v1's per-run `run-config.json` + deterministic synthesis (LCG-seeded, double-build byte-identity). New components (§4) generate under new disjoint stream tags; the abstention/full-surface builders and the new eval-surface code are pinned by sha in the P1-b2 gate report and each run receipt. The frozen bars (§10) are ex-ante number tables in `data/b2-cohort.json`. |
| ANDON_AUTHORITY | 3 | P1-b2 builder exits 1 on any gate G1–G8 (§5); render fail-fast asserts ≤max_seq before any gradient step; the primary bar (§10) is frozen ex-ante as a number, no post-hoc threshold arithmetic; **>20% spend-projection drift mid-run = STOP-and-ask** ([[feedback-budget-topup-is-not-scope-approval]] — hard rule, the ~$28 top-up funds THIS scope only). |
| NAMED_COMPENSATORS | 3 | §13 table, no skip; the irreversible action is the RunPod spend + any HF publish, both with named undo + owner. Inherits v1's anti-loss pod pattern (per-seed streaming, checksum-verified auto-terminate, dead-man timers). |
| DECOMPOSE_BY_SECRETS | 3 | All B-2 outputs under `experiments/finetune-arc-b2/`; the v0.5.0 package, the frozen v1/B-1 artifacts, and the existing eval-logic files are read-only inputs (shas pinned). The eval-surface change (§6) is additive (an abstain option string + a 3-way outcome field + prose-answerable question types), diff-scoped, and every model in this arc runs the same harness sha so the comparison is internally consistent by construction. |
| UNCERTAINTY_GATED_HUMANS | 3 | Director gates: the design (§16 named decisions, esp. the `text_only`→abstention reframe surfaced 2026-07-13); the priced-ask BEFORE any pod; the P7-class publish gate on a PASS. Honesty rule (§11) binds the report wording verbatim; the null and Pareto outcomes are pre-written as shippable. |
| EXTERNAL_VERIFIER | 3 | §1 citations gated by an existence oracle (arXiv API, receipt `P0-LOCK.citation-receipt.json`, 32/32 resolved 0 fabricated, 2026-07-13) + a `prism verify --type citations` groundedness pass at finalization (inherits v1's gate). Corpus verified by EXECUTION (inspector re-run for full-surface facts; abstention-calibration gate) never by the generating process; the trained model never scores itself — selection + P5 + stats are deterministic TS/Python. |

## 1. Research grounding (study-swarm 2026-07-13; ~32 sources, existence-oracle-verified)

Four parallel research lanes; full findings + design implications in memory [[ai-jam-sessions-b2-prose-retrain-prep]]. Load-bearing results, each connected to a design lever below:

- **Forgetting scales with training STEPS** (Kalajdzievski 2024, arXiv:2401.05605; LoRA-learns-less-forgets-less, Biderman et al. 2024, arXiv:2405.09673). → **Recipe delta: epochs 8→4** (§7); keep rank 16, add data not rank.
- **Rehearsal must be distribution-MATCHED** (Scialom 2022, arXiv:2205.12393; SelfAug, Huang 2025, arXiv:2509.03934; SSR, Huang 2024, arXiv:2403.01244; Ding & Wang 2025, arXiv:2506.09428). v1's generic 12% rehearsal failed. → **Self-synthesize rehearsal from base Qwen2.5 mirroring the eval question shape** (§4-C5). Cheap anchor: LoRA weight decay / L2-SP toward base (Li 2018, arXiv:1802.01483; Tian 2024, arXiv:2411.01713; RL's-Razor KL-to-base, Springer 2025, arXiv:2509.04259). → **Recipe delta: weight-decay anchor** (§7).
- **`text_only` unanswerability is CONTEXT-grounded, not parametric** — deterministic from the surface, so abstain labels are clean (SQuAD-2.0, Rajpurkar 2018, arXiv:1806.03822; R-Tuning, Zhang 2023, arXiv:2311.09677; Two-Axes, arXiv:2607.08456). Guard over-refusal (Alignment-for-Honesty, Yang 2023, arXiv:2312.07000; GRAIT arXiv:2502.05911; CRaFT arXiv:2410.06913). Score as selective prediction (Kamath 2020, arXiv:2006.09462; Geifman & El-Yaniv 2017/2019, arXiv:1705.08500 / arXiv:1805.08206 "Bias-Reduced Uncertainty Estimation…"; Traub 2024, arXiv:2407.01032). **Credit the base model's own non-confabulation** (AbstentionBench, arXiv:2506.09038). Don't lean on CoT (it *hurts* abstention). → **Eval-surface reframe** (§6), **abstention corpus** (§4-C4).
- **Exact counting is a residual 7B ceiling** (PAL, arXiv:2211.10435; Faith-and-Fate, arXiv:2305.18654; counting is TC⁰, arXiv:2410.19730; Chain-of-Table, arXiv:2401.04398; Table-GPT, arXiv:2310.09263). Co-train reasoning+tool ToRA-style (arXiv:2309.17452); the seesaw is real+bidirectional (Reasoning-Trap, arXiv:2510.22977). → **`full` target = close the gap, not beat the tool** (§10); **full-surface corpus formatted enumerate→group-by→count** (§4-C3), minority ratio, with a tool-hallucination guard (the NFR ceiling, §10).
- **Preregistered no-regression eval** (Preregistering-NLP, arXiv:2103.06944; Replicability, arXiv:1709.09500; Regression-Bugs/NFR, arXiv:2105.03048; CONSORT non-inferiority, JAMA 2012 doi:10.1001/jama.2012.87802; Show-Your-Work, arXiv:1909.03004; DMT composition, arXiv:2310.05492; catastrophic-forgetting empirics, arXiv:2308.08747). → **Bars in §10**: primary tool-hold *non-inferiority* + NFR floor; secondary prose *selective-accuracy*; null + Pareto pre-written.

## 1b. Pedagogy grounding (2nd study-swarm 2026-07-13; director idea "set the model up for success, Suzuki-style")

Three lanes — music pedagogy, process-supervision/worked-examples, curriculum/spacing — with a hard honesty line between transferable technique and metaphor. Full findings in [[ai-jam-sessions-b2-prose-retrain-prep]]. What SURVIVED and folded into §4/§6:

- **Process supervision helps 7B counting, but keep steps MINIMAL** (Nye 2021 arXiv:2112.00114; Sweller CLT; Hsieh 2023 arXiv:2305.02301) — small models learn *worse* from long chains (Li 2025 arXiv:2502.12143), so C3 uses terse atomic enumerate→group-by→count, mixed terse/fuller. **Template memorization is the real risk** (Dziri arXiv:2305.18654 "subgraph matching") → vary length/density/phrasing + a held-out longer-list transfer slice (§6). Process>outcome (Lightman 2023 arXiv:2305.20050) is a MATH/reward-model result — validated on B-2's own held-out set, magnitude not assumed.
- **Music pedagogy → real ordering/procedural kernels** (transferable), ruthlessly separated from auditory-embodied metaphors (which do NOT transfer — the model has no ears/body/improvisation goal): Kodály "sound-before-sight" → **evidence-before-conclusion**; melodic-dictation "one job per pass" → **fixed procedural scaffold**; Gordon MLT → **chunk by measure/hand**; Roman-numeral procedure → **re-derive from source, no memory answers**; Sweller/Cooper 1985 → **backward-faded** worked examples; and — the standout — dictation "notate only what you're sure of" + error-detection "no-error" → the **three C4 abstention flavors** (prose-lacks-fact / data-lacks-field / false-premise).
- **Curriculum ordering does NOT cleanly help — REJECTED** (Wu et al. ICLR 2021 arXiv:2012.03107: random ≥ curriculum on clean data; 7B medical-QA negative arXiv:2408.07888; difficulty-only unreliable, AAAI 2025). The one 7B win (Phased-IFT, Pang 2024 arXiv:2406.04371) needs multi-stage training, not sort-then-shuffle. What DOES hold is the **spacing/replay** half of the Suzuki instinct (Cepeda 2006; interleaving Rohrer&Taylor 2007; SFT replay Ding&Wang 2025 arXiv:2506.09428) → §4 interleave-don't-block + keep-replay-proportioned. Difficulty-ordering is a future 2-phase ablation, not this corpus (§12).

## 2. Design summary (what runs, what never runs)

- **Runs:** synthesis (local, $0); P1-b2 corpus gate; **training of 5 seeds** {13,42,271,512,1024} × 4 epochs (checkpoints {1,2,4}) on RunPod A100-80GB (same hardware/torch-2.8+cu128 stack as v1 — deliberate, to keep the tool-vs-prose comparison unconfounded by hardware); P3-b2 checkpoint selection on inner-val ONLY; P4 GGUF export; **one sealed eval per model** — a fresh baseline + the 5 B-2 fine-tunes — over the B-2 eval surface (§6).
- **Never runs:** any modification to the frozen v1/B-1 artifacts (they are read-only comparison inputs); any retraining or reselection after a first completion; any second eval of any model; any tuning of the corpus to the eval (the corpus is built to the frozen §4 spec BEFORE the lock is committed's eval surface is used).
- **Spend:** synthesis/gates/render local $0; training ~**$14–18** projected (§14), ceiling **$24**, inside the director's ~$28. **Local fallback** (32 GB 5090 via `backpropagate`) is documented in [[ai-jam-sessions-b2-prose-retrain-prep]] but NOT chosen (hardware-confound avoidance).

## 3. Pinned inputs (sha256, recorded at freeze)

Inherits v1 §2 pins (records, splits, tool schemas, harness eval-logic, gate, sampler) verbatim, re-verified against `checksums.sha256` at freeze. Working set = the v0.5.0 corrected records (`datasets/jam-actions-v0/`, r001+r002), the same set v1-FT trained on and B-1 evaluated. Additional B-2 pins (shas recorded in the P1-b2 gate report at build): the new builder scripts (`experiments/finetune-arc-b2/scripts/*.ts,*.py`); the eval-surface diff (§6) as a pinned harness sha; the frozen v1/B-1 result artifacts (`experiments/finetune-arc-v1/artifacts/p4-receipt.json`, `experiments/finetune-arc-v2/evals/b1-*-results.json`) as read-only comparison inputs; base `qwen2.5:7b` digest (rehearsal generator + baseline) recorded by the gate; stats RNG mulberry32 **seed 20260714** (B-2's own); sampler seeds under new disjoint stream tags.

## 4. B-2 corpus design (the substantive change; built to this frozen spec BEFORE any eval)

Extends v1's 494 (`SftLine {id,song_id,component,tools_key,record_ref?,messages,verify?}`, `component` enum gains two members). Tool traces stay the MAJORITY (holds the win — findings). Determinism, blacklist gate (G5), and double-build inherited verbatim; new components generate under new LCG stream tags. Target total **~650–750** (final counts frozen in the P1-b2 gate G4). Composition:

- **C1 jam (human 78 + paraphrase 156)** — unchanged from v1, `tools_key: mcp41`.
- **C2 grounding (200 sessions)** — unchanged from v1, `tools_key: inspector9`. C1+C2 are the tool-surface majority that holds the win.
- **C3 full-surface QA (NEW, ~90–120, ~15%)** `tools_key: inspector9` — teach answering from raw MIDI text *in-context* (the `full` surface), pedagogy-shaped (§1b):
  - **Worked steps, minimal & atomic** — an explicit enumerate→group-by→count (Chain-of-Table schema), but TERSE not narrated (small-model learnability gap, Li 2025); one enumerate line, one group-by-count line. Mix terse with slightly-fuller variants; never a bare integer (scratchpad effect, Nye 2021).
  - **Evidence before conclusion** (Kodály's transferable kernel) — the note-list / tool result is quoted BEFORE the answer sentence, never after; **re-derive from the source** (cite exact events / call the inspector, no from-memory answers — Roman-numeral procedure).
  - **Fixed procedural scaffold** ("one job per pass," melodic-dictation) — read key/header → enumerate onsets → attribute to hand → count → state; note-list **chunked/delimited by measure and hand** (Gordon MLT), not a flat stream.
  - **Faded tail (minority)** — a slice omits the final worked step so the model emits it (backward fading, Sweller/Cooper 1985; Atkinson/Renkl) — near-transfer aid, budgeted small.
  - **Anti-memorization variation** — vary list length, note density, and question phrasing (Dziri "subgraph matching" risk); a held-out **longer-list + novel-phrasing** transfer slice (§6) detects template memorization. Diverse templates + one-event-per-line serialization (Table-GPT). Every tool-grounded fact re-executed by the gate (G6b-analog). Drawn from the 78 gradient records only.
- **C4 calibrated-abstention (NEW, ~120–160)** `tools_key: none` — three pedagogy-derived flavors of genuine unanswerability (aural-skills "notate only what you're sure of" + error-detection "no-error"), each with a paired ANSWERABLE twin (the over-refusal guard):
  - **(a) prose-lacks-the-fact** — MIDI-only question on prose-only context → abstain ("cannot be determined from the annotation alone").
  - **(b) data-lacks-the-field** — a note list genuinely missing the asked-for field (single-track → no hand attribution; no velocity provided) → gold NAMES the missing field and declines.
  - **(c) false-premise rejection** — question asserts an event not present ("the F#4 in m.2 — which hand?" when no F#4 exists) → gold REJECTS the premise (serves EXTERNAL_VERIFIER).
  - **Answerable twins** (key/time-sig, measure-range, provenance) → answer-target; balanced so the model learns *when* to decline, not blanket refusal (GRAIT/CRaFT static-conflict guard: no near-identical context with opposite labels). New `GoldSpec.kind:"abstain"` + `answerContains` branch; G8 asserts answerable-twins answer and each unanswerable flavor abstains.
- **C5 distribution-matched self-rehearsal (~60)** `tools_key: none` — REPLACES v1's generic rehearsal. Prompt bank mirrors the eval-time question *shape* (music-analysis prose Q&A, structure/key/meter), completed by base `qwen2.5:7b` (digest-pinned, temp 0, seed 20260714, one shot, no retry). Attacks the exact competence that regressed (SelfAug/SSR).

**Mixing & ordering (curriculum evidence, §1b):** the components are **interleaved, not blocked** — the builder shuffles so tool-use / C3 / C4 / C5 are intermixed (verify no accidental blocking by source file), and the replay material (C5 + the simple answerable twins) stays proportioned in at ~15–30% and is never dropped ("spiral review" = replay, the well-supported half of the Suzuki instinct). The corpus is **NOT difficulty-ordered** — easy→hard sorting washes out under 4 shuffled epochs on clean small data and can hurt (Wu 2021; 7B medical-QA negative) — see §12; a genuine curriculum, if ever tested, is a separate 2-phase Phased-IFT A/B, not baked into this corpus.

**Leakage rule inherited verbatim** (v1 §4, G5): the MCQ blacklist (>700 strings), `HARNESS_MARKERS`, `OPTION_BLOCK_RE`, the `clair` zero-reference, and annotation-prose exclusion run over ALL new components. **C3/C4 caveat:** they deliberately carry MIDI facts / prose questions, so the gate additionally asserts they paste no MCQ *option block* and no harness scaffold text — skill overlap is the point; string/format overlap is forbidden (the v1 threat model).

## 5. Corpus gates (P1-b2, mechanical; builder exits 1 on any)

G1–G7 inherited from v1 (split integrity, schema validity, byte round-trip, exact counts, contamination blacklist, inspector re-execution + containment matcher, MCP execution, render ≤12288, double-build byte-identity). **New G8 — abstention calibration:** every C4 answerable item's gold is a real prose-derivable fact (re-checked against `scope`/`provenance`); every C4 unanswerable item's question `type ∈ {pitch_class_count, hand_register, rhythm_onset, annotation_grounding}` (mechanically MIDI-only per the generator's `midiGrounded` flag) and its gold is `kind:"abstain"`; the answerable:unanswerable ratio is within the frozen band. G6b extended to re-execute C3 full-surface tool-grounded facts.

## 6. Eval-surface additions (the only eval diff vs the B-1 regime; additive, pinned)

The B-1 harness scored 4 MIDI-only question types with a bare A/B/C/D parse. B-2 adds, as a pinned harness sha:

1. **Abstention option** — append `E) cannot be determined from what is given` to the `text_only` (and `full`, `tool_inspected`) prompt option block and grant permission to decline in the system text. The `MCQuestion.options` 4-tuple and `correctOptionIndex` (0–3) are **unchanged**; abstain is an out-of-band letter.
2. **3-way scoring** — `parseE3Response` extended to return an abstain sentinel (distinct from a 0–3 answer and from `null` parse-fail); each run outcome ∈ {correct, wrong, **abstain**}. New per-condition aggregates `coverage = answered/(answered+abstain)` and `selective_accuracy = correct/answered`, carried **additively** in the artifact (the existing `metric_mean`/`majorityScore` keys stay byte-shaped — stats arms re-point cleanly).
3. **Prose-answerable question types added to `text_only`** — `key_time_sig`, `measure_range`, `provenance` (currently generated but unscored) are added to the `text_only` scored set ONLY, so the over-refusal guard is measurable (does the model still ANSWER the answerable ones?). MIDI-only types on `text_only` remain, now with abstain as the calibrated-correct action.
4. `tool_inspected` and `full` keep their existing scored set; the abstain option is available on all three so a model that (correctly) cannot ground a `full` question can decline rather than guess.
5. **Memorization transfer slice (diagnostic, §1b):** a small held-out set of `full`-surface questions over **longer note-lists and novel phrasings** than C3 trained on — reported descriptively (not a bar), it detects whether a C3 gain is real generalization or template subgraph-matching (Dziri). Drawn only from held-out material; never pooled into the primary.

Because every model in this arc (fresh baseline + 5 B-2 seeds) runs the identical harness sha, the comparison is internally consistent. The frozen v1/B-1 artifacts were scored on the OLD surface (no abstain) — so B-2's tool-hold primary compares B-2-FT to v1-FT's sealed 0.890 on the *unchanged* `tool_inspected` scoring (abstain available but the tool surface is answerable, so abstention there is itself a signal, reported).

## 7. Training recipe (v1 §7 inherited; deltas argued)

All v1 knobs inherited byte-identically (bf16 LoRA, all-linear incl. MLP, r=16 α=32 dropout 0.1, lr 1.5e-4 cosine, effective batch 8, max_seq 12288, prompt-loss weight 0.1, base Qwen2.5-7B-Instruct, seeds {13,42,271,512,1024}). Deltas:

- **Delta 1 — epochs 8→4; checkpoints {1,2,4}.** Forgetting scales with steps (§1); v1's own P3 selected e2/e4/e8, and the neighbor tax tracks the long tail. 4 keeps the sweep's headroom while cutting the dominant forgetting driver — and it makes B-2 *cheaper* than v1.
- **Delta 2 — weight-decay anchor.** LoRA weight decay raised from 0.0 to a small value (frozen number, §16) — an L2-toward-zero pull on the adapter deltas = staying near base (§1 anchoring). One knob, in-recipe; a KL-to-base term was considered and rejected (§16: needs a custom loss, out of scope for a first B-2).
- **Delta 3 — per-line tool catalogs** carry the two new components (`inspector9` for C3, `none` for C4/C5) exactly as v1's `tools_key` mechanism.

## 8. Inner-val + P3-b2 selection (v1 §8 inherited; extended)

Songs unchanged (chopin-prelude-e-minor, fur-elise held out; clair-de-lune the locked test song, untouched by P1–P4). Selection score extends v1's `(jam_exact + grounding_score)/2` with a **prose term**: `(jam_exact + grounding_score + prose_cal)/3`, where `prose_cal` on grounding-val + a new abstention-val slice = the selective-accuracy proxy (answers answerable, abstains unanswerable). Deterministic, inner-val only, never touches the cohort or clair-de-lune.

## 9. Sealed baseline (fresh, on the B-2 surface)

A B-2 baseline MUST be measured on the B-2 eval surface (§6 — abstain option, 3-way scoring, prose-answerable types on `text_only`); the B-1 baseline was scored on the old surface and cannot supply selective-accuracy or the baseline abstention rate. One run of `qwen2.5:7b`, before the FT evals, byte-pinned flags; its artifact becomes this arc's sealed baseline the moment it completes; no rerun. The frozen v1-FT `tool_inspected` = 0.890 (B-1 sealed) is the reference for the tool-hold primary — read from the pinned B-1 artifact, not re-run.

## 10. Frozen bars (ex-ante NUMBER tables in `data/b2-cohort.json`, committed before any model call)

- **PRIMARY (the only gate that vetoes) — tool-hold non-inferiority + NFR floor.** On `tool_inspected`, B-2-FT all-seeds mean ≥ **0.890 − δ_tool** AND > baseline, where **δ_tool = 0.050, frozen BEFORE any B-2 model call** from already-sealed prior data = the **5-seed spread SD of the frozen v1-FT reference** on `tool_inspected` (computed 2026-07-13 from the sealed B-1 seed artifacts: seed means {0.818, 0.883, 0.887, 0.908, 0.955}, SD 0.0496). Justification (CONSORT-style, ex-ante): δ is the seed-to-seed variation of the exact quantity B-2 is compared against — a B-2-FT all-seeds mean within one seed-SD of v1-FT's 0.890 is "held up to the noise the fine-tune itself exhibits." **Floor = 0.890 − 0.050 = 0.840**, comfortably above baseline 0.678 so the win still survives. v1-FT is the sealed B-1 reference, NOT the B-2 arm under test → no circularity. **Rejected alternatives:** the baseline per-record run-to-run SD (0.110 — item noise, wrong scale, too lax); the B-2 fresh baseline's SD (post-hoc). **Stricter alternative recorded:** baseline mean-SEM 0.035 (floor 0.855). The frozen number is mirrored in `b2-cohort.json` (§16.2). PLUS **NFR ≤ nfr_max** (frozen number): of the paired items v1-FT got right, the fraction B-2-FT gets wrong ≤ nfr_max — "held" means no new failures, not equal mean (Regression-Bugs). Non-inferiority tested as `bootstrapCI(B2−v1 deltas)[lower] > −δ_tool`.
- **SECONDARY (reported, non-veto) — prose calibration.** On `text_only`: (a) abstention rate on MIDI-only questions ≥ baseline's + a frozen margin (the model declines the unanswerable), AND (b) selective-accuracy on prose-answerable questions ≥ a frozen floor (no over-refusal). On `full`: non-inferiority to baseline (B-2-FT `full` ≥ baseline − δ_full) — "closed the gap," NOT beating the tool. All frozen as numbers.
- **Machinery:** p6-stats-b2 = v1/B-1 machinery (mulberry32 20260714, 10k bootstrap/permutation, paired-by-recordId, record + song-cluster CI, exact sign test) + `nonInferiority()`, `NFR()`, `selectiveStats()` (per the code map). All 5 seeds report, no best-of-seeds; strata (CL/LG/NW) reported unpooled.

## 11. Claim classes (frozen verbatim — the only permitted wordings)

1. **PASS** (primary non-inferiority held AND NFR ≤ max AND ≥1 secondary target met): *"the B-2 recipe holds the tool-grounded win while teaching the model to decline the genuinely-unanswerable prose questions instead of guessing"* (+ whichever secondary met, stated exactly). Consequence: **P7-class DIRECTOR gate** (publish a B-2 adapter set + docs) — nothing publishes without the director's explicit yes.
2. **PARETO** (primary held; no secondary target met): *"the tool win is retained but the prose surface did not move at n=… — the tradeoff frontier stands."* Shippable as-is.
3. **REGRESSION** (primary NOT held — non-inferiority fails or NFR > max): *"B-2 traded away part of the tool win; the seesaw is real on this recipe."* Shippable as-is; no retry of these artifacts on this cohort.
4. **NULL** (primary held, all secondaries null, no movement anywhere): *"no change — the recipe neither helped nor hurt the prose surface at n=…"*

All four are pre-committed, publishable outcomes; none is a retry trigger (Show-Your-Work; Preregistering-NLP).

## 12. Outcome-dependence + designs considered and rejected

This arc was designed after seeing B-1's bounded win; mitigations (all mechanical): the tool-hold reference (v1-FT 0.890) is frozen/sealed from B-1; the bars are ex-ante number tables at α=0.05; one eval per model, all seeds report; every outcome pre-worded. **Rejected** (recorded so the report can't be accused of narrowing): boosting `text_only` *accuracy* (= training confabulation on unanswerable questions — the whole reframe); KL-to-base anchor (custom loss, deferred); a full risk-coverage *curve* (the maxTokens-16 A/B/C/D/E output emits no confidence score — B-2 reports the single operating point at the model's own coverage and says so); training v1's recipe locally as a same-stack control (hardware-confound removal chosen via same-RunPod instead); **difficulty-curriculum ordering of the corpus** (§1b — washes out under 4 shuffled epochs on clean small data and can hurt, Wu 2021 / 7B medical-QA negative; the director's Suzuki instinct is honored via its well-supported *spiral-review/replay* half instead, §4; a Phased-IFT 2-phase curriculum is a candidate future ablation, not this arc). **Honest ablation caveat:** B-2 moves several levers at once (corpus + epochs + anchor + abstention) — a PASS won't attribute *which* lever did it; that ablation is a later arc, stated here not hidden.

## 13. Compensators (NO skip — irreversible actions exist)

| Action | Irreversible? | Compensator | Owner |
|---|---|---|---|
| RunPod pods (P2–P4 spend) | Spent compute | Per-seed streaming bounds loss to the in-flight seed; fetcher auto-terminates on checksum verify; dead-man force-terminate at cap; >20% drift = stop-and-ask | advisor |
| Corpus / rehearsal generation (local GPU) | No | Delete `data/*.jsonl`, rebuild (one command) | advisor |
| ollama b2 tags | No | `ollama rm jam-ft-b2-qwen25:seed<k>` ×5 | advisor |
| Eval-surface harness diff | No (additive; pinned) | `git revert` restores the pre-B2 harness byte-exactly | advisor |
| Git commits (lock, scripts, data, receipts) | No | `git revert` | advisor |
| HF adapter publish (P7-b2 only, on PASS) | Public artifact; caches persist | Director-gated; `hf repo delete` / flip-private + README retraction note | director + advisor |
| Frozen v1/B-1 artifacts, v0.5.0 package | Not touched | Read-only by construction; pre-run gate is the tripwire | — |

## 14. Compute + spend

Synthesis/verification/gates/render: local, $0. Training on RunPod A100-80GB (v1 pod pattern verbatim: stage0 env retire, per-seed streaming, checksum auto-terminate, dead-man timers). **Estimate ~$14–18** (5 seeds × 4 epochs; ~half v1's per-seed epochs offsets a ~40% larger corpus → below v1's $20.45). **Ceiling $24** (inside the ~$28 top-up). Dead-man caps sized so worst-case < ceiling; **>20% projection drift mid-run = STOP and ask** (hard rule).

## 15. Execution phases + gates

| Phase | What | Gate |
|---|---|---|
| P0-b2 | This lock + `b2-cohort.json` (frozen bars + δ numbers) + builder + eval-surface diff + runner, committed | **Director sign-off**; lock committed before any model call (pre-run gate asserts) |
| P1-b2 | Build C1–C5 + val; gates G1–G8; double-build byte-identity; render ≤12288 | Builder exits 1 on any failure; report committed |
| — | **DIRECTOR priced-ask (~$14–18, ceiling $24) + §16 named decisions** | **Explicit yes before any pod** |
| P2-b2 | Train 5 seeds × 4 epochs {1,2,4}, RunPod v2 pattern | Stage0 env + render fail-fast before any gradient step |
| P3-b2 | Selection on inner-val (§8) | clair-de-lune untouched; deterministic |
| P4-b2 | Merge → GGUF Q4_K_M → ollama tags | Byte/tag parity receipt |
| P5-b2 | Fresh baseline + 5 seeds, one eval each, B-2 surface (§6) | Release gate PASS re-confirmed immediately before; ANDON on drift |
| P6-b2 | p6-stats-b2 + receipted report | Frozen bars (§10) govern; claim classes (§11) bind wording |
| P7-b2 | IF PASS: director publish gate | Explicit director yes |

## 16. Named decisions surfaced to the director (UNCERTAINTY_GATED_HUMANS)

1. **`text_only` → abstention-calibration reframe (§6)** — the eval scores only MIDI-only questions, so the honest target is *decline*, not accuracy; this expands the eval surface (abstain option + 3-way scoring + adding prose-answerable question types for the over-refusal guard). **Surfaced + recommended 2026-07-13; director confirmed EXPLICITLY 2026-07-13** ("the way to go, if text_only is proving inadequate"). Reversible: strike the prose-answerable expansion → the secondary becomes abstention-rate-only.
2. **The frozen numbers** (all in [data/b2-cohort.json](data/b2-cohort.json); the director sees them before the priced-ask). **Veto numbers, both sealed-data-derived:** **δ_tool = 0.050** (v1-FT 5-seed spread SD on `tool_inspected` = 0.0496; verified 2026-07-13 from the sealed B-1 seed artifacts — seed means {0.818, 0.883, 0.887, 0.908, 0.955}, all-seeds 0.8903, floor **0.840** > baseline 0.678); **nfr_max = 0.18** (v1-FT's own max intrinsic seed-to-seed item-flip rate over 20 ordered seed pairs = 0.1818; mean 0.083 — "no more new failures than v1-FT exhibits among its own seeds"). **Secondary (non-veto):** δ_full = 0.055 (v1-FT full-surface 5-seed SD 0.0546); text_only MIDI-only abstention margin +0.10 (design-chosen); prose over-refusal guard coverage-floor 0.60 + selective-accuracy-floor 0.50 (design-chosen). **Recipe:** weight_decay = 0.01 (design-chosen L2 anchor). **Final corpus counts:** 748 train (78 jam-human + 156 jam-para + 200 grounding + 110 full_surface_qa + 144 abstention [72 answerable / 72 unanswerable] + 60 rehearsal), replay 17.6%; val 25 jam + 50 grounding + 24 abstention; transfer-slice diagnostic 24.
3. **Recipe deltas** (epochs 8→4, weight-decay anchor) are lock-argued from §1; recorded so the report attributes any comparability caveat to a preregistered decision.
4. **The ablation caveat** (§12) — multi-lever change; a PASS is "the recipe works," not "lever X did it."

## 17. Verification receipt

- **Citation existence oracle (2026-07-13):** arXiv API `id_list` over all §1 references → **32/32 resolved, 0 fabricated**. Receipt: [P0-LOCK.citation-receipt.json](P0-LOCK.citation-receipt.json). Note: cite arXiv:1805.08206 by its real title ("Bias-Reduced Uncertainty Estimation for Deep Neural Classifiers", Geifman & El-Yaniv 2019), not "SelectiveNet".
- **Groundedness lens:** `prism verify --type citations` (prism v1.6.0, provider ollama, caller-family anthropic excluded) **run at finalization 2026-07-13** over the load-bearing §1/§1b claims → advisory verdict `escalate` (the RETRIEVE-FULL-TEXT class), disposition **identical to the v0/v1 locks**: advisory-supported, never read as fabrication. The BLOCKING check is the existence oracle above (**43/43 resolved, 0 fabricated**) — that is the load-bearing citation gate and it PASSED; the groundedness lens adds no fabrication, contradiction, or block. Consistent with the v1 lock's 7-accept/7-escalate result where every escalate was retrieve-full-text and 0 blocking.

## Amendments (pre-training only)

**A1-b2 (2026-07-13, during P1-b2 BUILD — no model has run, no pod exists):** implementing §6.3 surfaced a required eval-surface refinement, recorded here as a director-visible named decision (UNCERTAINTY_GATED_HUMANS).

- **Finding:** the prose-answerable question types (`key_time_sig`, `measure_range`, `provenance`) are `midiGrounded:false` — answerable from **scope/provenance metadata**, not the annotation prose. But the pre-B2 `text_only` prompt (`buildE3UserPrompt`) shows **annotation prose ONLY** (`extractAnnotationProse` emits "NO scope fields, NO provenance, NO MIDI"). So scoring those types on `text_only` without the metadata would make correct abstention look like over-refusal — the guard would measure the wrong thing.
- **Decision (implemented):** in the B-2 abstain surface ONLY, the `text_only` prompt gains a compact **non-MIDI metadata header** (key, time signature, phrase window, composer, piece title). This makes the prose-answerable types genuinely answerable (a valid over-refusal guard) while the 4 MIDI-only types stay unanswerable (metadata carries no note events → declining them remains calibrated-correct). C4 flavor (a) mirrors this exact context shape. Without `--abstain-surface` the prompt is **byte-identical** to the pre-B2 surface (existing tests green: 491/491 in `src/dataset/eval/`).
- **Reversibility (§16.1):** strike the prose-answerable expansion → the secondary becomes abstention-rate-only; the metadata header comes out with it. The whole eval diff reverts byte-exactly via `git revert` (§13 compensator).
- **Additive contract held:** the primary/secondary re-point to the UNCHANGED `aggregate.*.metric_mean` / `tool_inspected_mean` keys (abstain scores 0, prose types are not load-bearing so they don't enter the aggregate); the 3-way `outcome` + the prose questions ride alongside for the selective-prediction stats.

**Build receipts (P1-b2, this session):**
1. **Corpus PASS** — [P1b2-gate-report.json](data/P1b2-gate-report.json): 748 train lines, C4 72/72 answerable/unanswerable, replay 17.6%, C3 five families × 22 + 17 faded, G6a 206/206 unique MCP calls execute, G1–G8 + in-process double-build all PASS; **cross-process byte-identity** re-confirmed (`sft-train-b2.jsonl` sha stable across two runs).
2. **Render PASS** — [P1b2-render-receipt.json](data/P1b2-render-receipt.json): grand max 9334 ≤ 12288 (a v1 jam trace, unchanged); C3 full-surface max 5281.
3. **Frozen bars** — [data/b2-cohort.json](data/b2-cohort.json), δ_tool/nfr_max/δ_full verified against the sealed B-1 seed artifacts (§16.2).
4. **Eval-surface diff** — pinned, opt-in via `--abstain-surface` (default off); `p6-stats-b2.ts` (nonInferiority/NFR/selectiveStats) smoke-validated end-to-end on the B-1 artifacts as stand-ins (primary-held logic + graceful degradation on pre-abstain data confirmed).
5. **Transfer slice** — [data/transfer-slice-b2.jsonl](data/transfer-slice-b2.jsonl): 24 held-out inner-val items, note-list lengths 26–60 (longer than C3), novel phrasing (§6.5 diagnostic).

Nothing above touches the frozen v1/B-1 artifacts, the v0.5.0 package, or clair-de-lune (read-only by construction; gate-asserted). No amendment changes a bar or a δ.
