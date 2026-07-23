# Music Wing — Phase 2, Session 2: style-parameterize the gate + earn it

**Date:** 2026-07-23 · **Class:** engine build (Music Wing professional arc, Phase 2, Session 2) · **Status:** SHIPPED, $0/local, CI-green on `main` · **Scope:** four additive slices in `src/compose/` + four measurement scripts + this receipt

## What this session answered (the Session-1 finding, measured — not re-derived)

Session 1 (`docs/music-wing-phase2-composition-engine.md`) measured that under the strict common-practice gate the deterministic leaders and the model all scored ~0/10 on 10 genre-diverse songs — and split that into **two separable constraints**:

1. **The gate is a chorale rulebook on lead-sheet genres.** The near-zero rate is dominated by `parallels` (7/10) + `tendencySeventh` (5/10), both idiomatic in jazz/pop/blues/rock; demoting exactly those two takes the deterministic leader **1/10 → 9/10**.
2. **The model drifts off chord membership.** qwen2.5:7b voices C major as C–E–G–B (adds a colour 7th), so it stays **0/10 under BOTH** gates — orthogonal to style.

Session 2 fixed BOTH, grounded by the S2 study-swarm (findings cited by number below; grounding in `ai-jam-sessions-music-wing-phase2-s2-kickoff`), shipped in four verifier-gated, measured, $0/local slices.

| Slice | What | Commit | Compose tests |
|---|---|---|---|
| A1 | hard floor + named style presets (`style.ts`) + the `leap` floor + leading-tone MOOT-per-scale | `c123c39` | 59 |
| B1a | membership by construction — the voicing-spec decompose (`voicing-spec.ts`, `ollama-spec-realizer.ts`) | `404b9d9` | 83 |
| B2 | part-at-a-time refinement loop (`refine.ts`) | `4319e42` | 92 |
| A2 | the soft style-typicality cost (`style-cost.ts`) — a scorer axis, default-off | `99c5117` | 101 |

**+62 compose tests this session (39 → 101);** full repo suite **2899 passed / 1 skipped**; typecheck clean; each slice CI-green before the next.

---

## Thread A — style = a HYBRID (hard floor + named presets + soft cost)

The evidence is unanimous (findings 7–10): style is NEITHER hard toggles alone NOR more hard rules — it is a small **hard floor** + a **soft preference layer**, with named presets as a thin control surface (the exact shape of Diatony, the SOTA CP-for-harmony system, finding 8).

### A1 — the partition + the presets + the leap floor + MOOT-per-scale

- **The partition** (finding 4, Tymoczko — conjunct voice leading is the cross-style INVARIANT; the parallel ban is common-practice-SPECIFIC):
  - **HARD FLOOR** (style-invariant, never relaxed by any preset): `structure`, `chordMembership`, `spacing`, `overlap`, `crossing`, **`leap`** (a NEW no-wild-leap smoothness bound, maxLeap = an octave, bass-exempt).
  - **STYLE-GATED** (a preset may demote): `parallels`, `hidden`, `tendencySeventh`, `tendencyLeadingTone`.
  - `validateProfile` makes it a construction error for a preset to relax a hard-floor rule — a "style" can never wave through a malformed voicing.
- **Named presets** on the `relaxRules` lever: `common-practice` (relax nothing — the DEFAULT, anti-Goodhart), `lead-sheet` (`{parallels, tendencySeventh}` — the exact Session-1 counterfactual, findings 1–3), `film-ambient` (all four style-gated — planing).
- **Leading-tone MOOT-per-scale** (finding 5): the LT tendency rule does not APPLY when the operative scale has no scale-degree 7 (a modal/pentatonic passage) — reported `applicable: false` / in `mootRules`, distinct from relaxed. Detected from the material (the leading-tone pitch class sounds nowhere).

**Measured — the per-style admit-rate matrix (`compose-style-matrix.ts`, 10 songs, m1–8, deterministic, $0):**

| baseline | common-practice | lead-sheet | film-ambient |
|---|---|---|---|
| root-position floor | 0/10 | 1/10 | 2/10 |
| nearest-tone leader | **1/10** | **9/10** | **10/10** |

Strict (common-practice) failing-rule tally for the nearest-tone leader: `parallels` 7/10, `tendencySeventh` 5/10, `tendencyLeadingTone` 1/10, `hidden` 1/10 — **matches Session 1 exactly.** The hard floor (`chordMembership`/`overlap`/`spacing`/**`leap`**) fires **0/10** — the new `leap` rule does NOT false-reject valid part-writing (validate-instrument-before-paid-runs: the instrument stays honest). `lead-sheet` reproduces the Session-1 `1/10 → 9/10` lift as a named preset; `film-ambient` clears the last CP-material song by also relaxing `hidden`/LT.

### A2 — the soft style-typicality cost (a scorer axis, never a gate)

Taste — "sounds like jazz" — belongs in a soft, corpus-derived preference layer under the hard floor (findings 7, 9), never as more hard rules. A2 adds a `styleTypicality` axis to `scoreRealization` measuring a voicing's texture fit (parallel-motion fraction, mean motion, upper spacing, outer contrary-motion) to a per-style **reference band** built from the library ($0). It is **RANKING-ONLY, never a gate** (finding 19: distribution distance diagnoses distribution-fit, NOT quality), and **DEFAULT-OFF** (weight 0 → the default score is byte-identical; a caller opts in with a band + a weight).

**Measured bands (`compose-style-reference.ts`, 40 songs)** distinguish styles on the defining feature — `parallelFraction`: common-practice **0.000**, lead-sheet **0.061**, film-ambient **0.054**. **Honest bound:** these are BASELINE-derived bands (from the refiner's output), so `contraryFraction` saturates at 1.000 and inter-style spread is modest — a distributional tripwire, **NOT** a human-voiced gold corpus and **NOT** a quality claim. A learned style model + the BWS panel are later slices / priced-asks.

---

## Thread B — earn the gate: membership by construction + part-at-a-time

### B1a — kill the membership drift by construction (findings 11–13)

A stronger prompt only reduces drift; the fix is by construction. The model emits a **voicing spec** — `degrees` = chord-tone indices low→high (first = bass = the inversion; repeats = doublings) + a bass octave — and a deterministic renderer (`renderVoicingSpec`) maps it onto the FIXED chord's exact pitch classes. Every index is taken modulo the chord's tone count, so **it always names a real chord tone**; the list is repaired to exactly n voices; voices stack strictly ascending. The worst a confused model can do is poor voice-leading (the gate's job) — never a non-chord tone, never a wrong voice count. (This is the Session-1 `voiceChord` decompose generalized to inversions + doublings.)

**Measured (`compose-spec-membership.ts`, live qwen2.5:7b, best-of-8, 10 songs):**

| proposer | membership-violation rate | admit best-of-8 CP | admit best-of-8 LS |
|---|---|---|---|
| raw-note (Session-1) | **547/640 = 85.5%** | 0/10 | 0/10 |
| voicing-spec (B1a) | **0/600 = 0.0%** | 0/10 | **4/10** |

The by-construction fix holds **end-to-end on real model output** (0 violations across 600 sounding frames). Downstream, fixing membership + gating under the style-appropriate preset lifts the model **0 → 4/10** under lead-sheet; under strict common-practice it stays **0/10** — the model's single-pass voice-leading still trips `parallels`/7ths (the honest null that B2 targets). *(A second run drew 2/10 LS — base-model run-to-run sampling variance; the membership rate is deterministic-by-construction and does not vary.)*

### B2 — the part-at-a-time refinement loop (findings 14–17)

Iterative, hold-fixed-and-regenerate beats single-pass on the same model (Coconet blocked-Gibbs, DeepBach pseudo-Gibbs; Bach Doodle = real-time-cheap). `refineRealization` ships that as a **deterministic coordinate-ascent**: hold every other voice fixed and, for one voice at one frame, adopt the chord-tone option that most improves a lexicographic objective **(−gatingViolations, then score)**. Below admission it drives gating violations → 0 (fixing the parallels/overlap/leaps a single re-voicing reaches); at admission it maximizes the preference score — exactly the kickoff's "admit AND scorer improves" once admitted. Because a candidate is always a chord tone, **the B1a membership floor is preserved through every step** (the refiner re-voices, never re-harmonizes). Bounded + deterministic; `RefiningProposer` slots it into best-of-n.

**Measured (`compose-refine-lift.ts`, best-of-8, ≤8 passes, 10 songs) — single-pass → refined admit-rate:**

| seed | common-practice | lead-sheet |
|---|---|---|
| nearest-tone (deterministic, $0) | 1/10 → **10/10** | 9/10 → **10/10** |
| model-spec (B1a → B2) | 0/10 → **10/10** | 2/10 → **10/10** |

**This is the decisive lever.** The refinement clears the strict gate's inter-frame faults that the style lever alone could not, on both the deterministic seed and the membership-correct model seed.

**The honest reading (Goodhart-aware).** The refiner is a deterministic optimizer of the gate's own violation count, so a 10/10 **admit-rate is a reachability result, not a quality result**: given a membership-correct, full-voice seed, a theory-VALID part-writing exists nearby and the refiner reliably finds it. The value therefore lives in the **deterministic verifier-envelope**, not the 7B's raw output — which is exactly the arc's thesis (the study-swarm findings are a blueprint to build the professional version, not a risk-surface to hide behind). What "good music" is remains the **blind BWS panel's** call (a director priced-ask), never any admit-rate.

---

## Thread C — measure honestly (findings 18–20)

Reported a **VECTOR of computable tripwires, never one aggregate, never called "quality":** per-style admit-rate (A1 matrix), the strict failing-rule tally, the membership-violation rate (B1a), the single-pass→refined admit delta (B2), and the per-style corpus bands (A2). No absolute metric was invented; no aggregate was maximized as a proxy for quality. The one honest null (model single-pass 0/10 CP; LS 2–4/10 run-to-run) is reported, not buried. The only "quality" claim reserved for this arc is the **blind BWS + Bradley-Terry panel vs human-voiced anchors** — a director priced-ask, not shipped here.

---

## What was NOT touched (frozen boundaries respected)

- `inferChord` (`src/songs/jam.ts`) — untouched.
- The E-R `sourceChords` baseline + the Gate-2 snapshot — untouched. `src/compose/` still imports only the pure chord-symbol parser + note parser; it never runs `inferChord`, so the maker-arc eval stays byte-comparable.
- The frozen prose-training targets / the shelved pod — not reopened. No pod, no human panel, no publish, no version bump — none self-authorized (all director priced-asks).

## Deferred (honest scoping — NOT shrinking)

- **The blind BWS quality panel** vs human-voiced anchors — the only "quality" claim, a director priced-ask.
- **A learned style model + a human-voiced corpus** for A2 — the current bands are baseline-derived tripwires; a real corpus would give richer inter-style separation.
- **B1b (GBNF/Outlines grammar-constrained decoding)** — the generation-time membership guarantee; B1a (decompose) already delivers 0% by construction, so B1b is only needed if raw-note generation is later wanted.
- **A batch corpus-band overlap tripwire** (finding 19) against a frozen reference — the band mechanism (A2) exists; wiring it as a batch regression gate is a follow-up.
- **Arrangement (multi-track, rhythm, texture), melody generation, the Phase-5 style adapter** — later slices per the arc.

## Standards compliance (the six standards, 0–3)

- **PIN_PER_STEP 3** — the gate, presets, spec renderer, refiner, and scorer are pure + deterministic; the Ollama proposers are seeded (seed = baseSeed + sampleIndex), so a best-of-n run is replayable. Each slice is a committed, tested unit; each measurement is one reproducible command.
- **ANDON_AUTHORITY 3** — the hard floor halts any malformed voicing (a preset can never relax it; `validateProfile` enforces this). The measurement surfaced the honest CP null (model 0/10 single-pass) rather than hiding it; the leap floor was validated to fire 0/10 on valid material before being trusted.
- **NAMED_COMPENSATORS 3** — $0/local/deterministic; every step is git-reversible per slice (`git revert <sha>` — the named compensator for `c123c39`/`404b9d9`/`4319e42`/`99c5117`). No irreversible tool call: no publish, no pod, no release, no version bump.
- **DECOMPOSE_BY_SECRETS 3** — the pure modules (`style.ts`, `voicing-spec.ts`, `refine.ts`, `style-cost.ts`) are LLM-free; every Ollama detail lives in `ollama-spec-realizer.ts` (mirroring `ollama-realizer.ts`). `compose/` stays decoupled from `analysis/`/`maker/` (imports only pure parsers + the analysis type). No import cycle (scorer → style-cost → voice-leading → style).
- **UNCERTAINTY_GATED_HUMANS 3** — the quality claim gates on a human BWS panel (a director priced-ask, not self-authorized); every measurement is framed contrastively (per-style, single-pass vs refined, raw-note vs spec) and the honest nulls (CP 0/10, model run-to-run variance, baseline-derived bands) are reported, not buried.
- **EXTERNAL_VERIFIER 3** — the deterministic gate is the only admission judge; no model grades its own output. Generator (seeded local model) and verifier (deterministic gate) are structurally separate; the refiner optimizes the verifier's objective, and the receipt explicitly flags that its admit-rate is reachability, not quality (the quality verifier is the disjoint human panel).

## Next (Session 3 candidates, director-gated)

1. The **blind BWS + Bradley-Terry panel** (priced-ask) — the first real quality claim for the composition engine.
2. **B1b grammar-constrained decoding** + a **learned/human-voiced A2 corpus**, if/when raw-note generation or richer style bands are wanted.
3. **Wiring** the composition engine additively into the jam/cockpit surface (a separate gated decision) + **arrangement/rhythm** as the next making layer.
