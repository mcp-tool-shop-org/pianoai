# Maker Arc — E2v2 + E-R Instrument Preregistration Lock

**Status: BUILD COMPLETE — both instruments implemented + CI-green on main (Slices 1–2), pre-measured model-blind at $0 (Slice 3), remaining `[LOCK]` numbers proposed below and AWAITING DIRECTOR SIGN-OFF (Fork 5). NO training model has run at these bars; no pod exists.** The design was verified and committed 2026-07-22 ([docs/maker-arc-e2v2-instrument-design.md](../../docs/maker-arc-e2v2-instrument-design.md) @ `567703a`; study-swarm → oracle 40/40 → cross-family jury 26✓/8-narrowed/0-refuted). This lock freezes the BARS the eventual Phase-C training arc will be judged by. The lock is frozen the moment this commit lands + the director signs; **no bar moves after any generator runs at it in anger** (the Phase-B lesson: the v1 bar was mis-set against an invalid control, and re-deriving it post-hoc would have been unfalsifiable).

**Mandate:** the E2v2+E-R implementation kickoff (2026-07-22), executing the redesign the Phase-B gate report ([maker-arc-e2-gate-report.md](../../docs/maker-arc-e2-gate-report.md)) prescribed after nobody — including the gold-adjacent ceiling — cleared the invalid v1 bar. Process shape inherited from [experiments/finetune-arc-b2/P0-LOCK.md](../finetune-arc-b2/P0-LOCK.md): pre-run deviations are amendments in this file; post-run deviations are reported in the re-gate report, never silently patched; all generators run once per item; no best-of-seeds.

**The question this lock protects:** Phase B proved the discipline pays *before* the spend — a bar locked against an invalid control (shuffled-bars that inherited gold's rubato micro-timing) measured verbatim performance-cloning, not musical continuation, and no generator could clear it. E2v2+E-R rebuild the instruments so that a wrong continuation scores ~0 **by construction** and the base model's skill is **visible and trainable**. This lock writes down the numbers, measures them against the untrained base, and asks for a signature — before a single GPU-hour is priced.

## Standards compliance (six standards, 0–3)

| Standard | Score | Evidence |
|---|---|---|
| PIN_PER_STEP | 3 | The instruments are deterministic code; the score grid, foil seeds (per-pair `hashSeed(promptId)`), Ollama sampling (`seed 42`, `num_predict 2048`, default temp — the sealed Slice-9 condition), and the two frozen item lists (§7) are pinned. The pre-measurement (`e2v2-premeasure.ts`) and the base E-R run (`er-gate.ts --models qwen2.5:7b`) are replayable byte-for-byte. |
| ANDON_AUTHORITY | 3 | The Slice-4 fleet runner inherits the sealed-cohort ANDON cross-check (recompute the control per pair, halt on drift); the foils/screen fail-closed to `not_computable` (never a fabricated number); the bars are frozen ex-ante NUMBER tables here, no post-hoc threshold arithmetic. |
| NAMED_COMPENSATORS | 3 | This session is $0, additive, local: the only world-touching action is `git`, undone by `git revert`. No pod, no publish, no HF push, no sealed-artifact edit. The eventual Phase-C spend carries its OWN no-skip compensators table in the Phase-C priced-ask, not here. |
| DECOMPOSE_BY_SECRETS | 3 | The sealed E2v1 constants (`FUTURE_MODEL_GROOVE_MARGIN`, `shuffleBars`, `GRID_SLOTS_PER_BEAT`), the sealed 22-pair artifact, and the published B-1 adapters are read-only inputs; every E2v2/E-R module is additive (new files); nothing sealed is edited (Slice-1/2 diffs touch only new files + append to `model-continuation.ts`). |
| UNCERTAINTY_GATED_HUMANS | 3 | This IS the human gate. Every `[LOCK]` is a director decision (§5–§6), framed contrastively (§9 forks); the bars lock only ex ante with sign-off; the pre-registered outcomes (§8) are pre-written so the re-gate can't be narrated after the fact. |
| EXTERNAL_VERIFIER | 3 | The verifiers are DETERMINISTIC and the generator never grades itself: E-R uses the platform's own `inferChord` (a different code path from any model), E2v2 uses histogram OA against score-time gold + a foil the model never sees. The foil-as-model sanity (margin ≡ 0.000, §5) is the instrument checking itself. The design behind these bars passed a cross-family cloud jury (0 refuted). |

## 1. What ran ($0, model-blind + one local base model)

- **E2v2 pre-measurement** ([e2v2-premeasure/premeasure.json](e2v2-premeasure/premeasure.json)) — over the sealed 22-pair cohort, MODEL-BLIND: built the Markov foil + copy-forward foil per pair, ran the item screen and gold-identity scoring across a score-grid sweep {6, 12, 24}/beat. No generator ran.
- **Base E-R measurement** ([er-gate/qwen2.5_7b.json](er-gate/qwen2.5_7b.json)) — the untrained base `qwen2.5:7b` on the 22 frozen E-R items, local Ollama, seeded, one attempt per item. This is the baseline the E-R bar is a delta over.
- **Frozen item lists** — E-R: [er-gate/items.json](er-gate/items.json) (22 sections). E2v2 screened set: §7 of this doc + the receipt's `perPairAtDefaultGrid`.

## 2. The two instruments (recap; full spec in the design doc §6)

- **PRIMARY — E-R (Reharmonization Gate):** verified BY CONSTRUCTION. A generator proposes per-measure `{intendedChord, voicing}` for a library section; `verifyHarmony` (chord fidelity AND melody consonance, shipped v2.1.0) plus the non-triviality guard decide pass/fail. No hidden gold — the deterministic verifier is the judge. This is the maker task the arc will actually train.
- **SECONDARY — E2v2 (Continuation, repaired):** score-time gold (meter-aware, triplets exact) + a generative foil that cannot inherit gold's micro-timing + a conjunctive two-axis gate (rhythm AND tonal, over the foil) + a model-blind item screen. Repairs every receipted v1 failure; gives the arc a second graded surface but does NOT gate Phase C alone (Fork 2).

## 3. Pinned inputs (recorded at freeze)

- Sealed E2 cohort: `datasets/jam-actions-v0/evals/e2-phrase-continuation-results.json` (evalDate 2026-05-16), resolved in SOURCE scope (`datasets/jam-actions-v0/records`) — read-only.
- E2v2 modules (Slice 1, commit `707c52b`): `src/dataset/eval/score-time-gold.ts`, `markov-foil.ts`, `paired-tests.ts`, and the E2v2 additions to `model-continuation.ts`.
- E-R modules (Slice 2, commit `b04f104`): `src/maker/er-gate.ts` + `scripts/er-gate.ts` + `scripts/er-gate-summary.ts`. Verifier: `src/maker/verify-harmony.ts` (v2.1.0, read-only).
- Base model: `qwen2.5:7b` (Ollama), sampling `seed 42`, `num_predict 2048`, default temperature.
- Foil determinism: per-pair seed `hashSeed(promptRecord.id)` (FNV-1a).

## 4. E2v2 pre-measurement result (the evidence under the bars)

Sealed 22 pairs. Sweep of the score grid; separation = gold-vs-foil, model-blind. Full table in the receipt.

| score grid | items qualifying (strict: both foils, both axes ≥ 0.15) | gold-id rhythm margin over stronger foil (min / median) | gold-id tonal margin (min / median) | foil-as-model margin (SANITY, want ≈0) |
|---|---|---|---|---|
| 6/beat | 21 (but mis-bins sixteenths — 6∤4) | — | — | 0.000 |
| **12/beat (LOCK)** | **17** | **0.187 / 0.814** | **0.229 / 0.328** | **0.000 exactly** |
| 24/beat | 17 | 0.187 / 0.814 | 0.229 / 0.352 | 0.000 |

**Reading:** (1) the foil-as-model margin is **0.000 at every grid** — a wrong continuation earns exactly zero, the core repair the v1 shuffle failed. (2) 12/beat is the LOCK: it represents sixteenths (12/4=3), eighth-triplets (12/3=4) and sixteenth-triplets (12/6=2) while collapsing sub-1/12 rubato jitter; 6/beat cannot place a sixteenth (12/4 vs 6/4=1.5); 24/beat is near-identical to 12 but preserves more micro-timing. (3) **17/22 items qualify** under the strict both-foils screen — vs v1's 13 clearable / 9 dead — and gold clears the stronger foil on all 17 (rhythm ≥ 0.187, tonal ≥ 0.229). The 5 screened-out are interpretable (§7). **All four rubato songs (chopin×2, pathétique, schumann) survive as strong-separating items** — the v1 instrument could not measure them at all.

## 5. FROZEN BARS — E2v2 continuation (secondary instrument)

Every number below locks ex ante on sign-off.

- **`[LOCK]` score grid = 12 subdivisions per denominator-beat.** Meter-aware (§4). Applied identically to gold, model, and foil.
- **`[LOCK]` item screen = gold-vs-foil separation ≥ 0.15 on BOTH axes over BOTH foils** (Markov AND copy-forward) → the **17 frozen items** in §7. Model-blind, computed from gold + foils only. Copy-forward is the stronger foil on 14/22 items, so the screen and the margin both use it as the harder control (F24's "must also beat repeat-the-last-bars").
- **`[LOCK]` rhythm-axis margin bar = 0.15** (meter-aware groove OA vs score-time gold, minus the stronger foil's same-axis OA). Gold clears all 17 (min 0.187); the foil scores 0.000. Set below the gold-identity floor so a perfect continuation clears every screened item, above the foil so a wrong one cannot.
- **`[LOCK]` tonal-axis margin bar = 0.10** (pitch-class OA vs gold, minus the stronger foil's). Gold clears all 17 (min 0.229); foil 0.000. Lower than the rhythm bar because the tonal axis is the weaker separator (a same-key foil shares pitch classes) — its job is to close the "right rhythm, wrong notes" Goodhart hole (F9), not to be the hard gate.
- **`[LOCK]` per-item verdict = CONJUNCTIVE:** an item clears ⇔ rhythm margin ≥ 0.15 AND tonal margin ≥ 0.10. Level-α with no multiplicity penalty (Berger–Hsu IUT, F10).
- **`[LOCK]` aggregate verdict = exact paired sign-flip permutation test at α = 0.05, one-sided, on BOTH axes' item margins > 0, AND both mean margins ≥ their bars.** Exact enumeration at n=17 (2¹⁷). If a generator clears all 17 on an axis, that axis' p = 2⁻¹⁷ ≈ 7.6e-6 — the test is well-powered at this n; partial clears are handled exactly.

## 6. FROZEN BARS — E-R reharmonization (PRIMARY instrument)

- **`[LOCK]` item set = 22 sections**, 2 per non-classical genre, sections m1–8, frozen by id in [er-gate/items.json](er-gate/items.json) (§7). Disjoint from all training data BY CONSTRUCTION (the classical genre IS the jam-actions source pieces, excluded).
- **`[LOCK]` non-triviality fraction = 1/3** — a proposal must differ (canonical chord equivalence, so D#7≡Eb7) from the source harmony on ≥ 1/3 of measures. Base measured **Δharmony 76%** with **0 trivial-but-verified** items — the base does not game by copying, so 1/3 is a loose, honest floor, not the bottleneck.
- **BASE PASS-RATE (sealed) = 2/22 = 9.1%.** Base `qwen2.5:7b`: 2 items pass the full gate, mean chord-voicing **fidelity 37%**, Δharmony 76%, 0 parse failures, 0 trivial-but-verified. **The failure mode is voicing fidelity** (the base proposes real reharmonizations but its left-hand voicings only spell the intended chord 37% of the time) — a clear, trainable target, and the exact opposite of the B-2 abstention instrument that read a degenerate 0.000.
- **`[LOCK]` E-R bar = trained all-seeds-mean pass-rate − base pass-rate ≥ 0.25 absolute**, i.e. trained ≥ **34.1%** (≈ 8/22), exact paired sign test at α = 0.05 on the per-item (trained-pass ∧ base-fail) vs (base-pass ∧ trained-fail) contrast. Two base items already hit fidelity 8/8, so the ceiling is reachable.

## 7. Frozen item lists

**E2v2 — 17 screened items** (strict both-foils screen @ 12/beat, sep ≥ 0.15 both axes):
chopin-nocturne m005-008 / m013-016 / m021-024 · chopin-prelude-e-minor m005-008 / m013-016 · clair-de-lune m005-008 / m019-022 · debussy-arabesque m005-008 / m013-016 · mozart-k545 m005-008 / m013-016 · pathetique-mvt2 m005-008 / m013-016 · satie-gymnopedie m023-026 · schumann-traumerei m005-008 / m013-016 / m021-024.

**5 screened OUT** (honest, interpretable — never silently kept): bach-prelude m005-008 & m013-016 (rhythm separation 0.000 — mechanically-repetitive bars, the foil reproduces the groove; same finding as v1); fur-elise m013-016 (a tiny 3/8 phrase, rhythm 0.037 + tonal 0.095); satie-gymnopedie m007-010 & m015-018 (tonal separation 0.095 / 0.126 — the foils sampled from satie's sparse pitch set are tonally indistinguishable from gold).

**E-R — 22 items** ([er-gate/items.json](er-gate/items.json)): all-the-things-you-are, autumn-leaves (jazz) · a-thousand-years, all-of-me (pop) · blues-in-the-night, born-under-a-bad-sign (blues) · baba-oriley, bennie-and-the-jets (rock) · fallin, halo (rnb) · a-change-is-gonna-come, aint-no-sunshine (soul) · agua-de-beber, besame-mucho (latin) · cinema-paradiso, comptine-dun-autre-ete (film) · bethena, elite-syncopations (ragtime) · divenire, experience (new-age) · amazing-grace, auld-lang-syne (folk), all m1–8.

## 8. Pre-registered decision matrix — the Slice-4 re-gate (all outcomes pre-written)

The re-gate runs all 13 generators (gold-identity, Claude prompt-only ceiling, base `qwen2.5:7b`, five `jam-ft-v1-qwen25:seed*`, five `jam-ft-b2-qwen25:seed*`) at these locked bars, on BOTH instruments. Pre-committed reads:

1. **TRAIN-HEADROOM (→ Phase-C priced-ask):** the Claude ceiling clears a bar (E-R and/or E2v2) that the local models do NOT. *"The maker task is measurable and the local models have room to grow into it."* → proceed to the Phase-C priced-ask (with its own no-skip compensators table). This is the expected shape given base E-R = 9.1%.
2. **ALREADY-CAPABLE (→ question the training):** the local models already clear E-R. *"The base/adapters already reharmonize to spec — training may be unnecessary; re-scope."* Shippable finding.
3. **INSTRUMENT-STILL-BLIND (→ one diagnosis pass, then director call):** nobody clears, including the ceiling. *"Even the repaired instrument cannot register the construct on this corpus."* → ONE diagnosis pass on the instruments, then the director decides retire-vs-redesign. No silent re-tuning of a locked bar.
4. **TONAL-AXIS-UNCLEARABLE (E2v2-specific, pre-registered risk):** a real generator clears rhythm but no generator clears the tonal axis (the same-key foil is tonally too strong). *"The conjunctive tonal conjunct is un-clearable at this bar; the rhythm axis stands, the tonal axis is diagnosed."* → reported honestly; the E2v2 verdict stands on what cleared, the tonal bar is a named diagnosis item, NOT retro-lowered.

All four are publishable; none is a retry trigger. Phase C (RunPod) fires ONLY on outcome 1 + the locks + an explicit director priced-ask.

## 9. The five forks (design §4 — director decisions, contrastive)

1. **What does Phase C train first — continuation or reharmonization?** You might default to continuation (E2v1 measured it). The evidence + this pre-measurement rank **reharmonization first**: it is verified by construction, has field-standard metrics (F16), is trainable at small scale (F17), and the base's failure mode is a *clean, trainable* 37% voicing-fidelity — a visible gradient. Continuation is the least-differentiated framing (F20). **Recommendation: reharmonization PRIMARY, continuation SECONDARY.**
2. **Repair E2v2 or retire continuation?** The repair is DONE and it works: foil-as-model ≡ 0, 17/22 items measurable, the four rubato songs recovered. **Recommendation: keep it as the secondary graded surface; do not let it gate Phase C alone.**
3. **Token format for Phase C — REMI or ABC?** Text-LLMs are "inherently more compatible" with ABC (F23); our records already carry `tokens_abc`. **Recommendation: pilot both in the Phase-C recipe study; expect ABC to win. The instruments here score note events, not tokens — format-agnostic.**
4. **Human anchor — a primed pairwise listening session in the cockpit?** The platform plays music; a real-vs-generated "which is more musical?" session is the field's validation (F37/F39) and the fun part. **Recommendation: yes, once a candidate generator exists.**
5. **The numeric bars (this lock).** Sign §5 + §6, or adjust before Slice 4 runs a single generator at them.

## 10. Compensators (this session — $0)

| Action | Irreversible? | Compensator | Owner |
|---|---|---|---|
| Git commits (instruments, scripts, receipts, this lock) | No | `git revert` | advisor |
| Pre-measurement + base E-R receipts (local) | No | delete + re-run (deterministic) | advisor |
| Ollama base run | No | none needed (read-only inference) | — |
| Sealed E2v1 artifacts, published B-1 adapters, v2.1.0 package | Not touched | read-only by construction | — |

The eventual Phase-C training spend carries its own no-skip compensators table in the Phase-C priced-ask — NOT here.

## 11. Verification receipts

- E2v2 instrument: 52 unit tests pin the anchor identities (foil-as-model → 0; gold-identity → separation; conjunctive gate closes the wrong-notes hole; exact-test identities p=1/2ⁿ). CI-green on `707c52b`.
- E-R instrument: 17 unit tests pin the guard (copy fails, wrong voicing fails fidelity, real reharmonization passes). CI-green on `b04f104`.
- Pre-measurement: [e2v2-premeasure/premeasure.json](e2v2-premeasure/premeasure.json) (grid sweep, per-pair screen, foil-as-model sanity ≡ 0).
- Base E-R: [er-gate/qwen2.5_7b.json](er-gate/qwen2.5_7b.json) (2/22, fidelity 37%, 0 parse-fail, 0 trivial).
- The design behind these bars: [docs/maker-arc-e2v2-instrument-design.md](../../docs/maker-arc-e2v2-instrument-design.md) + its citation-oracle (40/40) and cross-family jury (0 refuted) receipts.
