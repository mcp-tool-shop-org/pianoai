# Maker Arc — E2v2: redesigning the generative continuation instrument

**Date:** 2026-07-22 · **Class:** design study, $0 · **Status:** DESIGN COMPLETE + VERIFIED — 39 findings through the existence oracle (40/40) + cross-family jury (0 refuted); §6 spec is evidence-connected; the `[LOCK]` numbers await the $0 base-model pre-measurement + director sign-off (Fork 5) before anything trains · **Predecessor:** [maker-arc-e2-gate-report.md](maker-arc-e2-gate-report.md) (the $0 gate that invalidated E2v1's locked bar) · **Protocol:** research-grounded-advisor (study-swarm), existence-oracle + cross-family jury before any finding becomes canon

## Standards compliance (six standards, 0–3)

| Standard | Score | Evidence |
|---|---|---|
| PIN_PER_STEP | 2 | Five research-lane prompts pinned in this doc's provenance; gate re-runs inherit the seeded/pinned runner. Not a byte-lockfile. |
| ANDON_AUTHORITY | 2 | Citation verification HALT rules (fabricated → drop; oracle down → halt-and-escalate, never "citations fine"); the design locks only after verification. Remediation: the re-gate itself carries the runner's existing ANDON cross-checks. |
| NAMED_COMPENSATORS | 3 | $0 read-only research + a git-committed design doc → `git revert`. No pod, no publish. The eventual Phase-C spend has its own no-skip compensators table (in the Phase-C ask, not here). |
| DECOMPOSE_BY_SECRETS | 3 | E2v1 artifacts, the sealed cohort, and the v1 bar constant are read-only inputs; E2v2 is additive (new module/spec); nothing sealed is edited. |
| UNCERTAINTY_GATED_HUMANS | 3 | The director's fork points are explicit (§Forks) and framed contrastively; the new bar locks only ex ante with director sign-off. |
| EXTERNAL_VERIFIER | 3 | Two-stage, BOTH RUN with receipts beside this doc: deterministic retrieval oracle (40/40 existence, 0 fabricated) + cross-family cloud jury (deepseek-v4-pro / glm-5.2 / minimax-m3, reasoning-stripped, verbatim-source judging; 26 confirmed / 8 narrowed / 0 refuted across 15 runs). The jury demonstrably discriminated — it rejected inadequate evidence twice and corrected two attribution nuances. Honest ceiling: CONFIRMED on frontier-authored claims is corroboration, not proof. |

## 1. Autopsy: why E2v1's locked bar failed (receipted facts)

From the executed gate ([report](maker-arc-e2-gate-report.md), receipts `experiments/maker-arc/e2-gate/`):

1. **The control inherits the answer's performance.** Margin = grooveOA(model, gold) − grooveOA(shuffled-bars(gold), gold). The shuffle keeps every within-bar onset — including rubato micro-timing — so it out-scores any honest re-composition on performance-timed pieces. Nobody cleared: gold identity +0.353 (13/22), Claude −0.136, base −0.412, ten FT adapters −0.36…−0.46.
2. **9/22 pairs are unclearable by construction** (headroom < 0.15; three exactly 0.000 — onset-identical bars make bar-shuffling a no-op).
3. **Single-axis metric.** Groove OA is onset-only; pitch is unscored in the gate (a right-rhythm/wrong-notes continuation can match gold's groove perfectly — observed: Claude's Bach OA = 1.000 with freely chosen harmonies).
4. **Single-reference scoring of a one-to-many task.** The gold continuation is one valid continuation among many; similarity-to-it punishes legitimate alternatives.

## 2. Local corpus facts (measured 2026-07-22, this repo)

**Timebase per song (deviation of gold onsets from the sixteenth grid, sealed-cohort targets):**

| song | n onsets | mean \|dev\| (beats) | p90 | % within 0.02 |
|---|---|---|---|---|
| bach-prelude-bwv846 | 128 | 0.0021 | 0.0021 | 100% |
| clair-de-lune | 181 | 0.0000 | 0.0000 | 100% |
| fur-elise | 27 | 0.0000 | 0.0000 | 100% |
| mozart-k545-mvt1 | 160 | 0.0016 | 0.0000 | 99% |
| satie-gymnopedie-no1 | 70 | 0.0000 | 0.0000 | 100% |
| debussy-arabesque-no1 | 114 | 0.0205 | **0.0833** | 75% |
| chopin-nocturne-op9-no2 | 132 | 0.0611 | 0.1125 | 18% |
| chopin-prelude-e-minor | 90 | 0.0660 | 0.1146 | 11% |
| pathetique-mvt2 | 57 | 0.0642 | 0.1146 | 12% |
| schumann-traumerei | 121 | 0.0647 | 0.1146 | 9% |

- **Six of ten songs are already effectively score-time** (mechanical/quantized MIDI). The reference-representation problem is concentrated in the four rubato songs (both Chopins, Pathétique, Träumerei).
- **Debussy's p90 = 0.0833 is not rubato — it is the triplet offset.** The eval grid (`GRID_SLOTS_PER_BEAT = 4`, fixed) cannot represent triplet subdivision; the repo's own REMI adapter already uses meter-aware subdivisions (96/bar in 4/4, 72 in 3/4, …). The eval grid must become meter-aware too.
- **Nearest-sixteenth snapping does not recover the score on rubato songs** — a note intended on the beat but played 0.13 late snaps to the *next* sixteenth, not to its notated position. Recovering score time there needs coarser snapping, alignment, or a different gold source.
- **All ten songs have their `.mid` sources in `songs/library/`**, and the platform's own MIDI ingest (`midiToSongEntry`) produces a quantized, notation-level representation (duration-token measures) — a candidate score-time gold path that keeps the platform's own tools as the instrument.
- The supporting per-pair metrics (pitch-class OA, note overlap, rhythm cosine) are **already computed and receipted** by the v1 gate — a composite gate has its inputs waiting.

## 3. Design space under study (NOT locked — awaiting verified findings)

The five lanes and the choices they inform:

| Lane | Question | Design choice it informs |
|---|---|---|
| L1 | Reference representation & timing normalization practice | performance vs score-time gold; per-song timebase handling; meter-aware grid |
| L2 | Controls that represent "wrong music" without inheriting the reference's surface | replacement for shuffled-bars; discriminative-control criteria |
| L3 | Metrics that survive one-to-many continuation & track human judgment | similarity vs distributional vs model-based; what the margin is computed OVER |
| L4 | Composite pass/fail gates + item screening at n≈22 | conjunctive vs scalar composite; preregistered headroom screen; multiplicity guards |
| L5 | Task selection: continuation vs infilling vs reharmonization vs variation | what Phase C actually trains; whether `verify_harmony` (valid by construction) becomes the primary graded surface |

## 4. Fork points for the director (resolve these to lock §6)

Contrastive framing per fork: what you might default to, vs what the verified evidence says.

**FORK 1 — What does Phase C train first: continuation or reharmonization?**
You might default to continuation (it's what E2v1 measured, and "continue the phrase" feels like the canonical maker task). The evidence ranks **reharmonization first**: it is the only candidate with field-standard deterministic per-item metrics validated against a large listening study (F16), it is trainable at small scale (F17), rule-based checks are accepted as automatic preference/reward signals (F12), 7B text-LLMs demonstrably succeed at conditioned harmonization (F23) — and we already own the verifier (`verify_harmony`, shipped in v2.1.0, mirroring accepted practice). Continuation is the *least* differentiated framing (F20: infilling-capable models get continuation for free) and the hardest to score validly (F32). **Recommendation: reharmonization primary; continuation secondary.**

**FORK 2 — Repair the continuation instrument (E2v2) or retire the continuation surface?**
You might think the gate's failure retires continuation. The repair is cheap and evidence-guided (score-time gold F1/F2/F3/F6, Markov foil F24, conjunctive gate F10, item screen F14/F30): the corpus exists, the runner exists, and a repaired E2v2 gives the maker arc a second graded surface. **Recommendation: repair as secondary instrument ($0), but do not let it gate Phase C alone.**

**FORK 3 — Token format for Phase C training: REMI-like or ABC?**
You might keep REMI (the FM catalog and parser exist). The evidence says text-LLMs are "inherently more compatible" with ABC-style notation than MIDI-derived tokens (F23, MuPT; ChatMusician's wins are on ABC) — and our dataset records already carry `tokens_abc` beside `tokens_remi`. **Recommendation: pilot both in the Phase-C recipe study; expect ABC to win; the instruments in §6 are format-agnostic (they score note events, not tokens).**

**FORK 4 — Human anchor: run a primed pairwise listening session in the cockpit?**
Automatic metrics should eventually be anchored to human pairwise judgment (F37, F39) — and this platform *plays music*; the cockpit makes a primed pairwise session (real vs generated continuation/reharmonization, "which is more musical?") literally runnable in-studio with the director as listener. **Recommendation: yes, once a candidate generator exists — it is the exact validation the field expects, and it is the fun part.**

**FORK 5 — The numeric bars.** The §6 bars marked `[LOCK]` are proposed shapes; per preregistration discipline (F31, memo-verified), the exact numbers are computed from the $0 base-model pre-measurement and then locked ex ante — before any training run. The director signs the lock.

## 5. Research grounding (the empirical floor) — VERIFIED

**Verification receipts:** [citation receipt](maker-arc-e2v2.citation-receipt.json) — existence oracle **40/40 resolved, 0 fabricated** (batched arXiv API + Crossref + DataCite + page fetches, deterministic retrieval only). [Jury receipt](maker-arc-e2v2.jury-receipt.json) — cross-family cloud PoLL (deepseek-v4-pro / glm-5.2 / minimax-m3, family-disjoint, reasoning-stripped, judged vs verbatim abstracts/primary excerpts): **26 findings CONFIRMED, 8 narrowed to their jury-confirmed cores, 2 demoted to corroborative, 1 escalated-manual (F28 Theiler — existence confirmed, abstract unretrievable this session), 2 reused from the 2026-07-13 memo jury (F30, F31), 0 REFUTED.** The jury discriminated: it rejected under-specified evidence twice (forcing full-README and paper-body excerpts), corrected an attribution emphasis (F15: Dror 2017's contribution is partial-conjunction *as superior to* Bonferroni), and flagged metric provenance (F2's groove_consistency ships in MusPy but internally cites Wu & Yang 2020).

**Status legend applied below:** findings 4, 5, 28 are CORROBORATIVE (context, no architecture connection); findings 13, 14, 15, 16, 17, 21, 22, 26 are load-bearing **in their narrowed forms only** (see jury receipt for the exact narrowed scope); all others are CONFIRMED as written.

### Lane 1 — Reference representation & timing (8 findings) ⏳

1. **Yang & Lerch's standard objective-eval framework assumes score-quantized symbolic input** (note-length features quantize at bar/96; rubato misclassifies rhythm features). Yang & Lerch 2020, *On the evaluation of generative models in music*, Neural Computing & Applications 32:4773–4784, DOI 10.1007/s00521-018-3849-7. → Use OA/KLD comparisons only after reference and generation share one quantized timebase.
2. **MusPy's groove_consistency is defined on binary onset vectors at a fixed measure resolution** — ill-defined on off-grid performance onsets. Dong et al. 2020, *MusPy*, ISMIR 2020, arXiv:2008.01951. → Groove metrics presuppose symbolic time steps, not performance seconds.
3. **The REMI pipeline itself grid-aligns performances before tokenization** — downbeats estimated, each bar quantized to Q=16 positions, onsets snapped, expressive timing factored into Tempo tokens. Huang & Yang 2020, *Pop Music Transformer*, arXiv:2002.00212. → Our gold should be beat-quantized identically; micro-timing never lives in onsets.
4. **MAESTRO is performance MIDI with no beat/score annotations** — grid onset metrics are undefined on it without alignment. Hawthorne et al. 2019, *MAESTRO*, ICLR 2019, arXiv:1810.12247. → Performance-timebase gold must be beat-aligned or replaced by quantized sources.
5. **Field practice splits by timebase: Music Transformer scores JSB on a sixteenth grid but evaluates performance corpora by NLL + listening, never grid metrics.** Huang et al. 2019, *Music Transformer*, ICLR 2019, arXiv:1809.04281. → Pick one timebase regime and hold it for both reference and generation.
6. **Canonical factorization: performance = quantized score + per-note microtiming offsets (+ velocity), as an explicit invertible transformation.** Gillick et al. 2019, *Learning to Groove*, ICML 2019, arXiv:1905.06118. → Store references as (score, timing residual); composition metrics read only the score channel.
7. **Recovering score rhythm from performance MIDI is a research problem; learned beat tracking beats commercial quantizers — uniform grid-snapping of rubato is known-inadequate.** Liu et al. 2022, *Performance MIDI-to-Score Conversion by Neural Beat Tracking*, ISMIR 2022, DOI 10.5281/zenodo.7316682. → Convert rubato gold with care (beat-relative quantization), never naive global nearest-sixteenth snapping.
8. **ASAP aligns 222 scores with 1068 performances precisely to bridge the two timebases** (beat/downbeat annotations map rubato onsets to metrical positions). Foscarin et al. 2020, *ASAP*, ISMIR 2020; TISMIR DOI 10.5334/tismir.149. → If performance gold is kept, groove must be computed on beat-relative positions from annotations; simpler is score-quantized references.

### Lane 4 — Composite gates + item screening at small n (7 findings) ⏳

9. **Single-axis gates fail in four predictable Goodhart modes** (regressional, extremal, causal, adversarial) — the v1 gate is exposed to the extremal/adversarial modes exactly as observed. Manheim & Garrabrant 2018, *Categorizing Variants of Goodhart's Law*, arXiv:1803.04585. → Retire the single-axis gate; a second (pitch/harmony) axis names and closes the observed failure mode.
10. **Conjunctive ("all axes pass") gates carry NO multiplicity penalty** — the Intersection–Union Test: if each of k component tests is level-α, requiring ALL to pass is itself level-α. Berger & Hsu 1996, *Bioequivalence Trials, Intersection–Union Tests…*, Statistical Science 11(4):283–319, DOI 10.1214/ss/1032280304. → Build the gate conjunctively (rhythm AND pitch axes); gaming-resistance with no Bonferroni cost, unlike scalar or disjunctive composites.
11. **The MIR-standard objective eval is already multi-axis per-feature** (tonal + rhythmic features scored separately via OA/KLD vs a reference). Yang & Lerch 2020 (as finding 1). → Adopt an established tonal axis (OA over pitch-class/interval features) as the second conjunct.
12. **Rule-based musical constraints work as a deterministic multi-criteria verifier** (codified rhythm + range constraints as automatic reward/preference signal). Meng et al. 2026, *Aligning Language Models for Lyric-to-Melody Generation with Rule-Based Musical Constraints*, arXiv:2604.18489. → A hard rule-based harmony/pitch check is defensible as a gate conjunct, not just a soft metric.
13. **At n≈20 paired items use exact/resampling paired tests** (Pitman permutation, sign, paired bootstrap), not t-tests. Dror et al. 2018, *The Hitchhiker's Guide to Testing Statistical Significance in NLP*, ACL 2018, aclanthology.org/P18-1128. → Paired permutation or exact sign test on item-level margins; report the MDE.
14. **Screening non-discriminative items by a preregistered, model-agnostic rule is accepted practice** (drop items with discrimination < 0.1 / ceiling items; preregister the screen). Li et al. 2025, *Adaptive Testing for LLM Evaluation*, arXiv:2511.04689. → Preregister a control-headroom threshold to qualify out the 9/22 dead pairs — screening on the CONTROL, never on the candidate model, avoids bias toward the model under test.
15. **If multiple axes/margins are tested disjunctively, replicability analysis (Bonferroni / partial-conjunction) is mandatory.** Dror et al. 2017, *Replicability Analysis for NLP*, TACL 5:471–486, DOI 10.1162/tacl_a_00074. → The conjunctive design (finding 10) sidesteps multiplicity entirely — a second reason to prefer it.

### Lane 5 — Task selection: what Phase C should train (8 findings) ⏳

16. **Melody (re)harmonization has field-standard deterministic metrics** — six objective measures (chord-progression + chord/melody harmonicity, e.g. Chord Histogram Entropy, Pitch Consonance Score) validated against a 202-listener study on 9,226 melody/chord pairs. Yeh et al. 2021, *Automatic Melody Harmonization with Triad Chords: A Comparative Study*, arXiv:2001.02360. → Our `verify_harmony` (chord identity / consonance / voice-leading) mirrors accepted evaluation practice — reharmonization is the most instrument-ready task.
17. **Chorale-style harmonization is learnable by small models under hard constraints** (DeepBach's pinned-voice pseudo-Gibbs) — but its gold eval was a human discrimination test. Hadjeres et al. 2017, *DeepBach*, arXiv:1612.01010. → Harmonization is trainable at tiny scale; our deterministic verifier replaces the listening test DeepBach needed.
18. **Iterative rewriting/infilling beats left-to-right generation in sample quality** (orderless NADE, blocked-Gibbs). Huang et al. 2017, *Counterpoint by Convolution* (Coconet), arXiv:1903.07227. → Tasks with bilateral context (infilling, harmonization) are structurally more forgiving than open-ended continuation.
19. **Infilling is benchmarkable but reference-sensitive** — MUSIB standardizes inpainting eval with note metrics vs the ground-truth segment + distribution metrics; winners flip with corpus size. Araneda-Hernandez et al. 2023, *MUSIB*, DOI 10.1186/s13636-023-00279-6; task definition: Chang et al. 2021, *Variable-Length Infilling* (VLI), arXiv:2108.05064. → Infilling scoring is valid (context constrains the answer) but noisier than rule checks; small-corpus regimes change rankings — caution for our LoRA corpus.
20. **Infilling-capable training costs nothing on continuation** — anticipatory models reach parity with autoregressive baselines on prompted continuation while adding infill control. Thickstun et al. 2023, *Anticipatory Music Transformer*, arXiv:2306.08620. → Plain continuation is the least differentiated framing; it adds no measurability or capability an infilling-style setup lacks.
21. **Theory-rule verifiers work as training signal** — music-theory rules as RL reward significantly reduced failure modes. Jaques et al. 2016, *RL Tuner*, arXiv:1611.02796. → `verify_harmony` can double as a training-data filter (rejection sampling / best-of-n), not just an eval.
22. **Rule-based rejection sampling is current practice** — ProGress discards phrases with improper harmonic intervals/contrapuntal motion inside the generator. Ni-Hahn et al. 2025, *ProGress*, arXiv:2510.10249. → Generate→verify→keep loops are literature-aligned; ours already exists (Phase A).
23. **7B-class text LLMs succeed at conditioned symbolic tasks** — LLaMA2-7B on ABC (ChatMusician, arXiv:2402.16153) handles chord-conditioned generation + melody harmonization; MuPT (arXiv:2404.06393) finds LLMs "inherently more compatible" with ABC-style text than MIDI-derived tokens. → 7B LoRA on conditioned harmonization is squarely feasible; **our REMI-like token choice is a bigger risk than model scale.**

*Lane-5 gap note (honest):* no established benchmark or objective metric surfaced for theme-and-variation — least measurable framing. **Net ranking for measurability × trainability: reharmonization > infilling > continuation > variation.**

### Lane 2 — Controls that represent "wrong music" (8 findings) ⏳

24. **The field-standard "wrong continuation" foil is a GENERATIVE null, not a permutation** — MIREX Patterns for Prediction builds foils with an order-1 Markov model over the texture and runs true-vs-foil discrimination; copy-forward is the other standard comparator. Janssen et al. 2019, *MIREX 2019: Patterns for Prediction*, music-ir.org/mirex/wiki/2019:Patterns_for_Prediction. → Replace bar-shuffle with a sampled Markov re-composition: a generated foil cannot inherit gold's micro-timing and stays discriminative on repetitive textures.
25. **Surface-statistic similarity is non-diagnostic of "right music"** — generated jazz matches real music's local statistics (pitch-class, grooving) while failing on structureness. Wu & Yang 2020, *The Jazz Transformer on the Front Line*, arXiv:2008.01307. → Score on axes where control and gold provably differ, or force the control to differ on the measured axis.
26. **Instrument validity is demonstrated by separating known-different sets first** (ground-truth subsets as ceiling) before trusting the metric. Yang & Lerch 2020 (as finding 1). → Precedent for a per-item validity gate: an item may gate only if gold-vs-control separation is demonstrated on it.
27. **MIR systems routinely pass benchmarks via confounds ("horses"); the diagnostic is controlled interventions altering task-irrelevant factors only.** Sturm 2016, *The "Horse" Inside*, arXiv:1606.03044, DOI 10.1145/2967507. → A valid control must differ from gold ONLY on the claimed construct (musical coherence); the v1 shuffle's inherited micro-timing is exactly this literature's confound.
28. **Surrogate-data theory: the statistics a control PRESERVES define the null actually tested; anything preserved is untestable.** Theiler et al. 1992, *Testing for nonlinearity in time series: the method of surrogate data*, Physica D 58:77–94, DOI 10.1016/0167-2789(92)90102-S. → Bar-shuffle preserves bar content + within-bar timing, so it tests ONLY bar order — degenerate by construction on repetitive textures (the null equals the data).
29. **Shuffle-test granularity is load-bearing** — detectability drops sharply as shuffled block size grows; internally-identical blocks yield zero signal. Laban et al. 2021, *Re-Thinking the Shuffle Test*, ACL 2021, arXiv:2107.03448. → If any permutation control is kept, vary its level per item (beat/phrase/cross-piece), never fixed bar-level.
30. **IRT leaderboard analysis identifies uninformative items degrading ranking reliability, guiding removal.** Rodriguez et al. 2021, *Evaluation Examples are not Equally Informative*, ACL 2021 (2021.acl-long.346). → Gold-minus-control headroom is an item discrimination index; screening the 9/22 dead items is standard psychometrics — if preregistered. *(Already oracle-verified in the 2026-07-13 memo pass.)*
31. **Margins must be powered at the effective n, and the screen + margin preregistered together.** Card et al. 2020, *With Little Power Comes Great Responsibility*, arXiv:2010.06595; van Miltenburg et al. 2021, *Preregistering NLP Research*, arXiv:2103.06944. → Preregister margin + item-screen jointly; compute the MDE at n = 22 − screened. *(Both already oracle-verified in the memo pass.)*

### Lane 3 — Metrics that survive one-to-many continuation (8 findings) ⏳

32. **Single-reference comparison is valid "only under the limiting assumption that there is exactly one correct output"** — explicitly unsuited to generative scenarios. Lerch et al. 2025, *Survey on the Evaluation of Generative Models in Music*, arXiv:2506.05104, DOI 10.1145/3769106. → Similarity-to-the-single-gold (v1's whole frame) is a diagnostic, never a headline score.
33. **The standard symbolic framework compares generated-set vs reference-set feature DISTRIBUTIONS** (OA/KLD with cross-validation) — it requires a set, not one excerpt. Yang & Lerch 2020 (as finding 1; toolbox mgeval). → Aggregate over many generations and score against a corpus of real in-style continuations.
34. **Fréchet Music Distance ports FID/FAD to symbolic music and separates model quality** — but needs sizable generated + reference sets. Retkowski et al. 2024, *Fréchet Music Distance*, arXiv:2412.07948. → A corpus-level model-ranking metric, not a per-item gate.
35. **Fréchet-style scores are unreliable under sample-size bias / unvalidated embeddings; per-song FAD variants predict perceptual quality.** Gui et al. 2024, *Adapting Fréchet Audio Distance…*, ICASSP 2024, arXiv:2311.01616. → Any distributional metric's embedding + reference set must be validated first.
36. **Low training loss ≠ quality** — the Jazz Transformer's likelihood missed a clear human-audible gap. Wu & Yang 2020 (as finding 25). → NLL/perplexity is a necessary-condition signal only.
37. **Human-correlation validation of music metrics at scale is feasible and expected** (15k pairwise comparisons ranking common metrics; expert-anchored MusicEval). Grötschla et al. 2025, arXiv:2506.19085; MusicEval, arXiv:2501.10811. → A small pairwise listening anchor should eventually validate whatever automatic metric gates.
38. **LLMs (incl. GPT-4) show poor multi-step music reasoning** on symbolic tasks. Zhou et al. 2024, *Can LLMs "Reason" in Music?*, arXiv:2407.21531. → LLM-as-judge is untrustworthy as a sole music verifier; cross-family + human-audited only.
39. **Established continuation practice never scores against the single true continuation** — Music Transformer: teacher-forced NLL + primed pairwise listening; Anticipatory Music Transformer: crowd pairwise "more conventionally musical." Huang et al. 2019 (finding 5); Thickstun et al. 2023 (finding 20). → The valid continuation question is "indistinguishable from a true continuation under pairwise judgment," not "similar to the true continuation."

## 6. The E2v2 specification (evidence-connected; bars lock ex ante on director sign-off)

Every load-bearing choice cites its findings by number. `[LOCK]` marks numbers finalized by the $0 pre-measurement + director sign-off (Fork 5), never after a training run.

### 6.1 PRIMARY instrument — the Reharmonization Gate ("E-R")

*The task the platform can verify by construction, now made the graded surface.*

- **Task:** given a library song section (melody kept, `ai_jam_sessions` brief as scaffold), the model proposes per-measure `{intendedChord, voicing}` — exactly the Phase-A maker loop.
- **Per-item score (deterministic, per Yeh-class practice F16-narrowed, rule-checks-as-signal F12):** `verify_harmony` hard gates — chord fidelity (every voicing confirmed by the chord engine) AND consonance (chromatic ratio ≤ 0.2) — plus a non-triviality guard: the proposal must differ from the source harmony on ≥ `[LOCK ~1/3]` of measures (blocks copy-the-original gaming; Goodhart F9).
- **Item set:** `[LOCK ~24]` sections drawn across the 12-genre library, disjoint from all training data, frozen by ID before training.
- **The bar `[LOCK]`:** trained model's verified-pass rate minus base qwen2.5:7b's ≥ `[LOCK ~0.25]` absolute, exact paired sign test at α=0.05 (small-n exact-test practice F13-narrowed; power at n checked per memo-verified F31). Base measured at $0 first; numbers locked; then training.
- **Dual use (F12; F21/F22 corroborative):** `verify_harmony` doubles as the training-data filter — rejection-sample the SFT corpus so only verified reharmonizations are trained on. The generate→verify→keep loop is literature-aligned practice (ProGress-class, F22-narrowed).

### 6.2 SECONDARY instrument — Continuation, repaired ("E2v2")

Four repairs, each closing a receipted v1 failure:

1. **Score-time reference channel (fixes the rubato confound).** Metrics presuppose a quantized symbolic timebase (F1, F2, F3); performance = score + timing residual, and composition metrics read only the score channel (F6). Per the local timebase audit (§2): the six grid-clean songs' gold stands as-is; the four rubato songs (both Chopins, Pathétique, Träumerei) get beat-relative re-quantization — NOT naive nearest-sixteenth snapping (F7) — and any item whose re-quantization fails validation is excluded by the screen (below). The eval grid becomes **meter-aware** (the REMI adapter's own subdivision map; fixes the Debussy triplet mis-binning found in §2).
2. **Generative foil control (fixes the control-inherits-the-answer confound).** Replace shuffled-bars with the field-standard **order-1 Markov foil** trained on the prompt's own texture (MIREX practice, F24): it cannot inherit gold's micro-timing, it stays discriminative on repetitive textures, and it differs from gold on exactly the claimed construct — musical coherence — not on task-irrelevant surface (Sturm's confound rule, F27; shuffle-granularity pathology, F29). Copy-forward joins as the standard second comparator (F24): a generator must also beat "just repeat the prompt's last bars."
3. **Preregistered item screen (fixes the 9/22 dead pairs).** An item qualifies only if gold-vs-foil separation ≥ `[LOCK ~0.15]` on BOTH axes — the instrument must demonstrably separate known-different content on that item before the item may gate anything (set-separation validation F26-narrowed; discriminative-utility selection F14-narrowed; IRT item screening F30 memo-verified). The screen is computed from gold + foil only — never from any candidate model — and frozen with the item list.
4. **Conjunctive two-axis gate (fixes single-axis gaming).** Margin over the foil on the RHYTHM axis (meter-aware groove OA vs gold) AND the TONAL axis (pitch-class OA vs gold), both ≥ `[LOCK]` margins (per-axis, set from gold/foil pre-measurement). Conjunctive composition is level-α with NO multiplicity penalty (Berger–Hsu IUT, F10) and closes the Goodhart modes the v1 gate exposed (F9); the per-feature axes are the MIR-standard ones (F11). Aggregate verdict by exact paired permutation/sign test at effective n (F13-narrowed; F31 memo-verified).

**Demotions (honesty rails):** similarity-to-the-single-gold is a diagnostic, never a headline (F32 — "exactly one correct output" is false here); NLL is a necessary-condition signal only (F36); LLM-as-judge is not a valid sole music verifier (F38) — the deterministic tools stay the judges. Corpus-level distributional readouts (Yang-Lerch OA/KLD over feature sets, F33; optionally Fréchet Music Distance, F34, embedding-validated per F35) report alongside but do not gate at n=this-corpus.

### 6.3 The eventual human anchor (Fork 4)

A primed pairwise listening protocol in the cockpit (real vs generated, randomized, "which continues/harmonizes more musically?") — the field's validation practice for exactly this situation (F37, F39, F20's 20-second-clip protocol). Runs when a candidate generator exists; anchors the automatic axes.

### 6.4 What Phase C looks like if the gates clear

Train reharmonization (Fork 1) with verify_harmony-filtered data (6.1), pilot ABC vs REMI output formats (Fork 3, F23), grade on E-R primary + E2v2 secondary, priced-ask + compensators table before any pod — unchanged studio discipline. Infilling (F18/F19/F20) is the natural third surface later; theme-and-variation stays unmeasurable (Lane-5 gap note) and out.

## 7. Receipts

- [Citation existence receipt](maker-arc-e2v2.citation-receipt.json) — 40/40 resolved, 0 fabricated; abstracts harvested for jury evidence.
- [Cross-family jury receipt](maker-arc-e2v2.jury-receipt.json) — 15 runs, verdicts per finding, juror exclusions flagged, attribution notes, honest ceiling.
- Research lanes: 5 parallel retrieval-bound agents (prompts summarized in §3); lane outputs synthesized into §5 verbatim-attributed findings.
- Local measurements (§2): timebase audit + headroom analysis scripts ran read-only against the sealed cohort; numbers reproduced in the [Phase-B gate report](maker-arc-e2-gate-report.md).
- Compensator: `git revert` of the commit carrying this doc + receipts. $0 session; no pods, no publishes.
