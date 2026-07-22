# Maker Arc — Slice 4: the E2v2 + E-R fleet re-gate ($0 report)

**Date:** 2026-07-22 · **Class:** $0 (local Ollama + reused Phase-B Claude continuations + one in-session Claude authoring pass; no pods, no API spend, no publishes) · **Arc:** the MAKER arc (analyst → composer), the re-gate on the REPAIRED instruments · **Bars:** the director-signed [E2V2-LOCK.md](../experiments/maker-arc/E2V2-LOCK.md) (2026-07-22) · **Runners:** [`scripts/er-gate.ts`](../scripts/er-gate.ts), [`scripts/e2v2-gate.ts`](../scripts/e2v2-gate.ts) · **Receipts:** [`experiments/maker-arc/er-gate/`](../experiments/maker-arc/er-gate/), [`experiments/maker-arc/e2v2-gate/`](../experiments/maker-arc/e2v2-gate/)

## What this is

Phase B ran a gate against an INVALID instrument (a shuffled-bars control that inherited gold's rubato micro-timing) and nobody — not even the gold-adjacent ceiling — cleared, because the bar measured verbatim performance-cloning, not musical continuation. This re-gate runs the **same fleet of 13 generators** against the two REPAIRED instruments at the **ex-ante, director-signed bars**, on both the PRIMARY surface (E-R reharmonization, verified by construction) and the SECONDARY surface (E2v2 continuation, repaired). The bars were locked and committed (`8198a74`) BEFORE any generator ran at them.

The kickoff's pre-registered decision matrix (E2V2-LOCK §8): **TRAIN-HEADROOM** (ceiling clears, locals don't) → the Phase-C priced-ask; **ALREADY-CAPABLE** (locals clear) → question training; **INSTRUMENT-BLIND** (nobody clears, incl. ceiling) → one diagnosis pass then director call.

## Standards compliance (six standards, 0–3)

| Standard | Score | Evidence |
|---|---|---|
| PIN_PER_STEP | 3 | Locked bars read from E2V2-LOCK §5–6; Ollama sampling pinned (`seed 42`, `num_predict 2048`, default temp); foils seeded per-pair (`hashSeed(promptId)`); the E-R item list + E2v2 screened set frozen. Ollama generation reuses `runE2ForPair` byte-unchanged, so continuations reproduce Phase B. |
| ANDON_AUTHORITY | 2 | The E2v2 screen recomputes gold-vs-foil per pair and fails-closed to `not_computable`; the b2 parse-failures are surfaced, never fabricated into a score. Not a formal byte-lockfile cross-check (the sealed-artifact ANDON lives in the v1 gate; this runner inherits the cohort but re-screens). |
| NAMED_COMPENSATORS | 3 | $0, local, additive. World-touching action = the git commit of code + receipts + this report → `git revert`. No pod, no HF push, no npm publish, no sealed-artifact edit. |
| DECOMPOSE_BY_SECRETS | 3 | New runners consume the frozen eval primitives + the signed lock read-only; the sealed E2v1 artifact, the v1/b2 adapters, and v2.1.0 are read-only inputs. |
| UNCERTAINTY_GATED_HUMANS | 3 | The re-gate's output is a decision for the director, framed against the pre-registered matrix; the Phase-C spend is a SEPARATE gate (priced-ask + compensators), not fired here. |
| EXTERNAL_VERIFIER | 3 | Deterministic verifiers; the generator never grades itself. E-R uses the platform's own `inferChord` (a different code path); E2v2 scores against score-time gold + foils the model never sees; the gold-identity ceiling (E-R by construction, E2v2 17/17) and the foil-as-model ≡ 0 are the instrument checking itself. |

## How the generators ran (contamination controls)

- **E-R (22 frozen items):** `qwen2.5:7b` + the ten adapters ran the E-R brief directly (seeded, one attempt). The **Claude ceiling** was authored in-session, blind, one shot, no verifier-guided revision — with auto-generated root-position voicings (the prompt instructs "voicing must spell exactly its intended chord," which a strong model follows; this isolates chord-CHOICE + consonance + non-triviality from raw voicing-token generation — see the caveat under Results).
- **E2v2 (17 screened items):** the ten adapters + base regenerated continuations via the sealed `runE2ForPair` (reproducing Phase B). The **Claude ceiling reuses the Phase-B blind continuations** — authored before E2v2 existed, so they cannot have been tuned to the new instrument (the most honest ceiling). Gold-identity is the instrument ceiling. Margins are over the **stronger foil** (min across the Markov foil and copy-forward), per the signed lock.

## E-R Reharmonization Gate (PRIMARY) — results

| Generator | PASS (verified ∧ non-trivial) | verified | mean fidelity | parse-fail | note |
|---|---|---|---|---|---|
| **claude-fable-5 (ceiling)** | **19/22 (86%)** | 21/22 | 100%\* | 0 | task is very doable by a strong model |
| **qwen2.5:7b (base)** | **2/22 (9%)** | 2/22 | 37% | 0 | non-zero, clean, discriminative |
| jam-ft-v1-qwen25 × 5 | **0/22** (all) | 0/22 | 10–38% | 0 | parses fine → VOICING-capability failure, below base |
| jam-ft-b2-qwen25 × 5 | **0/22** (all) | 0/22 | 0–18% | 1–21 | FORMAT-following collapse (mostly unparseable) |

\* The ceiling is auto-voiced (fidelity guaranteed, as the prompt instructs); its 86% reflects chord-choice + consonance + non-triviality. The locals' real bottleneck is **voicing fidelity** (base 37%, FTs lower) — the specific, trainable skill.

**Reading — "analyst ≠ maker," now measured on the primary surface.** Base at 9%, ceiling at 86% — a **77-point headroom gap**, and the instrument is genuinely discriminative (0% → 9% → 86%), unlike the invalid v1 continuation bar. The ten analysis-trained adapters do not merely fail to transfer to the maker task — they **degrade it**, via two distinct mechanisms: the **v1** family (analysis QA) voices chords *worse than base* (fidelity 10–38% vs base's 37%; it parses cleanly and reharmonizes at 77% Δharmony, but its left-hand voicings don't spell the chords it names); the **b2** family (the prose/abstention retrain) **collapsed structured-output-following** (1–21 of 22 items unparseable). Both confirm the maker arc's founding thesis with receipts: generation must be trained *for*, not inherited from analysis training. The non-triviality guard never bound (base Δharmony 76%, 0 trivial-but-verified) — the base *reharmonizes*, it just can't *voice*.

**Honest caveats.** (1) The ceiling is auto-voiced (above). (2) The item-set transcriptions are dense and polyphonic (the "melody" often includes accompaniment stacks) — yet jazz chords absorbed them consonantly (ceiling 21/22 verified), so density is not the blocker. (3) Two ceiling items failed non-triviality (a-change-is-gonna-come, experience) — genuine one-shot artifacts where the authored chords sat too close to the source; one (bethena) failed consonance. These are reported, not hidden.

## E2v2 Continuation Gate (SECONDARY, repaired) — results

Margins over the stronger foil (min of Markov + copy-forward), 17 screened items, conjunctive rhythm ≥ 0.15 ∧ tonal ≥ 0.10, exact paired permutation at α=0.05.

| Generator | clears | mean rhythm Δ (p) | mean tonal Δ (p) | verdict |
|---|---|---|---|---|
| **gold-identity (ceiling)** | **17/17** | 0.650 (7.6e-6) | 0.372 (7.6e-6) | **CLEARS** |
| claude-fable-5 | 1/17 | −0.017 (0.75) | 0.034 (0.19) | no |
| qwen2.5:7b (base) | 0/17 | −0.188 (1.0) | −0.093 (0.99) | no |
| jam-ft-v1-qwen25 × 5 | 0/17 (all) | −0.14…−0.23 | −0.07…−0.10 | no |
| jam-ft-b2-qwen25 × 5 | 0/17 (all) | −0.20…−0.28 | −0.18…−0.23 | no |

**Reading — the instrument is VALID; the surface is HARD.** Gold-identity clears 17/17 (the instrument registers a perfect continuation) and the foil-as-model earns exactly 0 (proven in pre-measurement) — the repair holds. But **only gold clears.** Claude is closest (rhythm ≈ 0) and every local is *negative on both axes* (their continuations are worse than the copy-forward foil), with the b2 family most negative — the same generation degradation E-R showed.

**Diagnosis (matrix-permitted, one pass; the locked bars are unchanged).** Scoring Claude against each foil separately: vs the **Markov** foil, Claude's mean margins CLEAR both bars (rhythm Δ 0.176, tonal Δ 0.118); vs **copy-forward**, they do not (rhythm Δ 0.004). So **copy-forward is the binding constraint** — on these continuous-texture classical pieces, Claude's blind continuations are groove-wise no better than *repeating the prompt's last bars*, though they beat a Markov scramble. This is a genuine property of the continuation surface (the "least-differentiated framing," design F20), not an instrument artifact — the screen already guaranteed gold separates from copy-forward by ≥ 0.15 on all 17 items, and gold does (Δ 0.65). Whether copy-forward should remain a hard conjunct or become a reported comparator is a candidate for a FUTURE E2v2 revision — which would be a new ex-ante lock, never a retroactive change to this one.

## Verdict + pre-registered matrix outcomes

- **E-R (PRIMARY) → TRAIN-HEADROOM (outcome 1).** The ceiling clears (86%), the locals do not (0–9%), the instrument is discriminative and valid. This justifies the **Phase-C priced-ask** — training a dedicated maker on reharmonization (the director's Fork-1 choice), targeting the measured bottleneck (voicing fidelity + structured output). Phase C fires ONLY on a separate explicit director priced-ask with its own no-skip compensators table.
- **E2v2 (SECONDARY) → instrument valid, nobody-but-gold clears.** Per Fork 2 (director-confirmed reharmonization-primary), E2v2 does not gate Phase C alone; it stands as a valid second graded surface whose current reading is "even the ceiling can't beat repeat-the-prompt on continuation-groove." Reinforces reharmonization-first. Diagnosis logged above for a possible future refinement.

The through-line: the validate-instrument discipline paid off a *third* time. Phase B killed an invalid bar at $0. The B-2 study killed a redundant paid arc at $0. This re-gate turned two repaired instruments into a clean, discriminative measurement — the primary one shows exactly where a maker fine-tune would earn its keep, at $0, before a single GPU-hour is priced.

## Receipts

- E-R per-generator: [`experiments/maker-arc/er-gate/*.json`](../experiments/maker-arc/er-gate/) (12 generators + frozen `items.json`) — regenerate the table with `pnpm exec tsx scripts/er-gate-summary.ts`.
- E2v2 per-generator: [`experiments/maker-arc/e2v2-gate/*.json`](../experiments/maker-arc/e2v2-gate/) (13 generators).
- Pre-measurement (the bars' evidence): [`experiments/maker-arc/e2v2-premeasure/premeasure.json`](../experiments/maker-arc/e2v2-premeasure/premeasure.json).
- The signed lock: [`experiments/maker-arc/E2V2-LOCK.md`](../experiments/maker-arc/E2V2-LOCK.md) @ `8198a74`.
- Compensator: `git revert` of the commit carrying code + receipts + this report.
