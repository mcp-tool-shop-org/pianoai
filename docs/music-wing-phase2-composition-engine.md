# Music Wing — Phase 2, Session 1: the composition engine (voice-leading gate + realization loop)

**Date:** 2026-07-23 · **Class:** engine build (Music Wing professional arc, Phase 2, Session 1) · **Status:** SHIPPED, $0/local, CI-green on `main` · **Scope:** a new decoupled `src/compose/` module + a measurement script + this receipt

## What shipped

Phase 2 turns the Phase-1 analyzer's UNDERSTANDING (a real per-segment chord progression, `docs/music-wing-phase1-analysis-engine.md`) into MAKING: voiced musical material admitted by a deterministic music-theory verifier. Session 1 is the load-bearing first slice — the **deterministic voice-leading admission gate + the propose→verify→best-of-n realization loop** — the reharmonization envelope SCALED, the pattern the design swarm and maker arc already proved (Coconet generate→verify→resample; Huang et al. 2019, arXiv:1903.07227).

Seven commits, all CI-green on `main`:

| Slice | What | Commit |
|---|---|---|
| 1 | The deterministic voice-leading verifier (`voice-leading.ts`) + types | `00fdc46` |
| 2 | The preference scorer (`scorer.ts`) — taste behind the gate | `270e84d` |
| 3 | The realization loop + deterministic baselines (`realize.ts`) | `3dca237` |
| 4 | The Ollama realizer proposer + public API (`ollama-realizer.ts`, `index.ts`) | `ba7b088` |
| 5 | The honest measurement script (`scripts/compose-realize-demo.ts`) | `3b73e75` |
| 6 | The `relaxRules` style lever + reproducible style-mismatch finding | `acad688` |
| 7 | This receipt + memory | — |

**39 compose tests**; the full repo suite stays green (**2837 passed**, 1 skipped).

## The architecture (Lane 2, as built)

The field draws a clean line: **well-formedness / prohibition rules are deterministic gates; preference / reduction rules are heuristic and go behind the gate as a scorer** (Huron 2001; Tymoczko 2006 *Science* 313:72; Anders & Miranda 2011). Session 1 builds exactly that split.

**The gate (`verifyVoiceLeading`)** — hard, deterministic, over an N-voice realization: chord-membership fidelity, parallel/similar perfect 5ths & 8ves, direct/hidden 5th/8ve into the outer pair by leap, voice overlap, upper-voice spacing (bass free), voice crossing (ordered-identity mode), and tendency-tone resolution (chordal 7th steps down or is held; soprano leading tone rises on V→I). Structured verdict mirroring `HarmonyVerdict` — `admitted` boolean + per-rule detail + warnings + informational voice-leading distance.

**The scorer (`scoreRealization`)** — heuristic, behind the gate, RANKING only: smoothness, completeness (3rd weighted most), doubling quality (never the leading tone), outer-voice contrary motion. It never gates; a low score is still admissible. A ranking signal, NOT a quality metric (Yang & Lerch 2020).

**The loop (`realizeProgression`)** — external-verifier best-of-n: propose an N-voice realization of a FIXED progression → the deterministic gate admits → keep the highest-scoring admitted candidate, resampling up to N. Generic over a `RealizationProposer` (deterministic baselines + the seeded Ollama proposer).

**The seam:** `progressionFromAnalysis` maps a Phase-1 `HarmonicAnalysis` into the `ChordProgression` the composer realizes — the analysis→composition through-line.

## Honest-instrument decisions (validate-instrument-before-paid-runs)

A hard gate that rejects valid music is a broken instrument. Proven by the instrument-validation tests (a correct textbook I–V–I and G7→C pass ALL hard gates; each fault fails only its specific rule):
1. **Tendency tones tracked by PITCH, not rank** — a resolution that reorders voices under rank-assignment cannot false-fire; the checks err toward acceptance (the safe direction).
2. **Range defaults to "warn", not "gate"** — SATB vocal tessitura is a choral constraint, not a piano-atelier one; available as a hard gate for choral work.
3. **The deterministic nearest-tone leader clears the gate**, proving it is satisfiable by real smooth voice-leading — not impossibly strict.

## The measured finding (honest, $0, reproducible)

10 genre-diverse library songs (classical/jazz/pop/blues/rock/rnb/soul/latin/ragtime/folk), measures 1–8, `analyzeHarmony` → `progressionFromAnalysis` → realize 4 voices → best-of-16. **Admission is theory-VALIDITY + smoothness — NOT quality.**

| Gate configuration | root-position floor | nearest-tone leader | model (qwen2.5:7b, best-of-16) |
|---|---|---|---|
| **Strict** (common-practice; shipped default) | 0/10 | 1/10 | 0/10 |
| **Relaxed** (`--relax parallels,tendencySeventh`) | 1/10 | **9/10** | 0/10 |

Failing-rule tally, nearest-tone leader, strict: **parallels 7/10, tendencySeventh 5/10**, hidden 1, tendencyLeadingTone 1.
Model per-sample (let-it-be diagnostic): chordMembership 8/8, parallels 8/8, overlap 8/8, hidden 6/8, tendencySeventh 3/8 — **correct voice count (4) every sample** (not a format failure).

### Two binding constraints, cleanly separated

1. **The deterministic leaders are STYLE-bound.** The near-zero strict admit-rate is caused by two COMMON-PRACTICE rules — parallels (7/10) and forced 7th-resolution (5/10) — that are **stylistically idiomatic, not violations,** in jazz/pop/blues/rock (parallel voicings and non-resolving 7ths are defining features of the idiom). Demoting exactly those two rules takes the nearest-tone leader **1/10 → 9/10**. The strict gate was applying a *chorale rulebook to lead-sheet genres.*
2. **The model is MEMBERSHIP-bound.** Base qwen2.5:7b emits the correct voice count every sample but drifts off the fixed harmony — it voices C major as C–E–G–B (adds a color 7th), *changing* the chord instead of voicing it. Membership is not a style rule, so the model stays **0/10 under BOTH** the strict and relaxed gates. Its constraint is orthogonal to style.

### The conclusion (a validate-instrument finding, not a model verdict)

Before any "the local model can/can't compose" conclusion, the measurement checked whether the gate can SEE the target — and found that the strict common-practice configuration **mis-scores most of the cross-genre target material** (a style mismatch confirmed by the 1/10 → 9/10 counterfactual), while the model's *own* failure is harmony-drift (membership), independent of the gate's style. So the model-vs-baseline number on this material is dominated by two separable, precise, actionable issues — neither of which is "the model is bad at part-writing." This is the anti-Goodhart / validate-instrument discipline paying off exactly as intended; the finding is surfaced, not papered over.

The gate is **NOT relaxed by default.** Session 1 ships the well-grounded strict common-practice set *plus* the neutral `relaxRules` lever — the mechanism for Session-2 style-parameterization. Which rules a named style relaxes is a Session-2 design decision, not baked in.

## Deferred (honest scoping — NOT shrinking)

- **The Lane-4 corpus-band distributional rejection filter** — deferred; it needs a wired corpus, and Session 1's claim is bounded to admission + smoothness (which needs none). Membership fidelity IS folded into the gate as the by-construction floor.
- **The blind BWS human panel** vs human-composed anchors — a director priced-ask, not a $0 step. The quality claim lives there, per Lane 4.
- **Arrangement (multi-track, rhythm, texture), melody generation, and the Phase-5 style adapter** — later slices, per the kickoff. Session 1 is the gate + the loop.

## What was NOT touched (frozen boundaries respected)

- `inferChord` (`src/songs/jam.ts`) — untouched.
- The E-R `sourceChords` baseline + the Gate-2 snapshot — untouched. `src/compose/` imports only the pure chord-symbol parser + the note parser; it never runs `inferChord`, so the maker-arc eval stays byte-comparable.
- The frozen prose-training targets / the shelved pod — not reopened.

## Standards compliance (six standards, 0–3)

- **PIN_PER_STEP 3** — the verifier + scorer + loop are pure and deterministic; the Ollama proposer is seeded (seed = baseSeed + sampleIndex), so a best-of-n run is byte-for-byte replayable. Each slice is a committed, tested unit; the measurement is one reproducible command.
- **ANDON_AUTHORITY 3** — the deterministic voice-leading gate halts any non-conforming realization; a bad sample never propagates (best-of-n resamples). The measurement surfaced the instrument's style-mismatch rather than hiding it behind a number.
- **NAMED_COMPENSATORS 3** — $0/local/deterministic, git-reversible per slice (`git revert <sha>`). No publish, no pod, no version bump, no irreversible tool call.
- **DECOMPOSE_BY_SECRETS 3** — the pure loop (`realize.ts`) is LLM-free; every Ollama-touching detail lives in `ollama-realizer.ts`. Gate, scorer, loop, proposer are separable; `compose/` is decoupled from `analysis/` and `maker/` (imports only pure parsers + the analysis type).
- **UNCERTAINTY_GATED_HUMANS 3** — the quality claim gates on a human BWS panel (a director priced-ask); the measurement is framed contrastively (model vs floor vs leader; strict vs relaxed) and the honest null is reported, not buried.
- **EXTERNAL_VERIFIER 3** — the deterministic gate is the only judge; no model grades its own output. Generator (seeded local model) and verifier (deterministic gate) are structurally separate.

## Next (Session 2 candidates, director-gated)

1. **Style-parameterize the gate** — define named styles (a chorale style relaxes nothing; a jazz/pop lead-sheet style relaxes `{parallels, tendencySeventh}`), grounded, so the model-vs-baseline comparison uses a style-appropriate yardstick. The lever exists; the policy is the design work.
2. **Fix the model's membership drift** — the decompose lever: constrain the model to the fixed chord tones (voice one part at a time holding verified voices fixed — the MMM/Anticipatory-Music-Transformer pattern), or a stronger prompt/model, so it voices the harmony instead of changing it.
3. **The Lane-4 corpus-band rejection filter** once a corpus is wired; **arrangement/rhythm**; the **blind BWS panel** (priced-ask) for the quality claim.
