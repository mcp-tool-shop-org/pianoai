# Maker Arc — Phase C: a bass-aware `inferChord` (the completeness lever, measured)

**Date:** 2026-07-22 · **Class:** $0 local engine change + drift-controlled A/B (base qwen2.5:7b, frozen 22-item E-R set; no pods, no API, no publish) · **Status:** SHIPPED — the ABC maker's dropped-measure rate falls 17.1% → 2.3%; `auto_reharmonize` now writes the whole chart · **Predecessor:** [maker-arc-phase-c-abc-pilot.md](maker-arc-phase-c-abc-pilot.md) (which made the tool reliable but flagged proposals as PARTIAL — out-of-vocab chords dropped) · **Grounding:** [maker-arc-phase-c-bass-aware-study-swarm.md](maker-arc-phase-c-bass-aware-study-swarm.md)

## What this is

The ABC pilot made `auto_reharmonize` reliable (empty output 50% → 0%) but its proposals were often PARTIAL: the base emits rich, valid chords ABC-native (`D7sus4`, `Cmin7`, `Ab9`, the 9ths-with-7th) that the rootless pitch-class `inferChord` could not round-trip, so `voiceChord` DROPPED them and a passing reharmonization covered only ~6 of 8 measures. This change makes `inferChord` **bass-aware** so those chords round-trip and stop being dropped — the ABC proposals get more COMPLETE.

## Standards compliance (six standards, 0–3)

| Standard | Score | Evidence |
|---|---|---|
| PIN_PER_STEP | 3 | Seeded `scripts/er-experiments.ts` + `scripts/bass-aware-completeness.ts` (base seed 42, `--tag bass-aware` to distinct receipts); the drift-free A/B pins the generation once and varies ONLY the engine. |
| ANDON_AUTHORITY | 3 | Gate 1 (`voicer.test.ts` round-trip enumeration) HALTS on any voicing that doesn't round-trip — it caught `G9→Bm7b5` on the first vocab attempt; Gate 2 (`jam.regression.test.ts`) HALTS on any unadjudicated library label shift. Both are green in CI. |
| NAMED_COMPENSATORS | 3 | $0, git-committed → `git revert`. No pod, no publish, no HF push. |
| DECOMPOSE_BY_SECRETS | 3 | The engine change is library-wide; the two-tier design (exact-bass Tier 1 / legacy Tier 2) confines all behavior change to measures that spell exactly one chord, and the committed snapshot test proves the boundary holds (only 153 measures move, 0 in the E-R baseline). |
| UNCERTAINTY_GATED_HUMANS | 3 | The 45.9%-vs-1.18% scope choice was gated to the director, framed contrastively; the director asked for a study-swarm, which was run + verified before the scope was locked. The library regression was adjudicated, not silently accepted. |
| EXTERNAL_VERIFIER | 3 | The judges are the platform's deterministic `verify_harmony` + the `inferChord` round-trip + the library snapshot — no LLM self-grades. The study-swarm's citations were verified by a family-different, reasoning-stripped panel (8✓/0-refuted). |

## The design — two-tier, exact-bass-first (CONTAINED)

`inferChord` gains a bass-aware first tier, but ONLY for the unambiguous case:

- **Tier 1 (bass-exact):** if the note set spells EXACTLY one chord template rooted on the bass (lowest) note, name it that. This is all the deterministic voicer's clean root-position output ever is, and it resolves the pitch-class collisions that used to block the vocabulary — `C6 ≡ Am7` (same four notes), the rotationally-symmetric `dim7`, and `G9 ⊃ Bm7b5` — to the intended spelling, so they round-trip.
- **Tier 2 (legacy):** an inexact set (a dense texture, a partial voicing) falls back to the pre-bass-aware best-effort over the BASE vocabulary, byte-identical to before.

Added to the vocabulary (`CHORD_TEMPLATES` in `songs/jam.ts` + `SUFFIX_INTERVALS` in `maker/verify-harmony.ts`, in lockstep): `6, m6, dim7, 9, maj9, m9`. Plus cheap parse aliases the base actually emits: `min7`→m7, `Δ`/`Δ7`→maj7, `+`→aug, `°`→dim, `°7`→dim7, `7sus4`→sus4 (the b7 is dropped as a colour, like a slash bass).

**Why contained, not "fuller":** the naive "prefer the longest chord rooted on the bass, on every measure" reharmonized 45.9% of the library's labels. A study-swarm (5 retrieval-bound research lanes + a family-different verification panel, 8✓/0-refuted) found that move is the Automatic Chord Estimation over-labeling + under-segmentation + wrong-root failure pattern, applied to exactly the dense measures where a single chord label is ill-defined — with zero measured key-consistency gain. The director chose contained. Full grounding: the study-swarm report.

## Gate 1 — the round-trip (ANDON)

`src/maker/voicer.test.ts` enumerates the full vocabulary × all 12 roots: `inferChord(voiceChord(sym))` must be canonically equivalent to `sym` for every one, plus explicit bass-disambiguation assertions (`C6` vs `Am7`, `dim7` on all four enharmonic roots, `G9`/`maj9`/`m9` winning by length over the subset chord they contain). Green.

## Gate 2 — the library regression (adjudicated)

`src/maker/jam.regression.test.ts` pins `inferChord` over **all 13,014 measures of the 120-song library** to a committed snapshot. The bass-aware change shifted **153 measures (1.18%)** — every one a bass-exact correction (receipt: `experiments/maker-arc/implied-chord-bass-aware-shifts.json`):

- `Abdim → Abdim7` (names the 4th note the triad label dropped), `dim → dim7` ×16
- `Gadd9 → G9` (acknowledges the b7 that makes it a dominant 9th), `add9/madd9/m7/maj7 → 9/maj9/m9`
- `Am7 → C6` where the bass is C (the measure spells C-E-G-A with C in the bass), `m7 → 6`, `m7b5 → m6/9`
- `sus2 ↔ sus4` renamed by the bass (an inherently ambiguous suspended chord read by its lowest note)

**The frozen E-R eval's source-harmony baseline (22 items, m1–8): 0 shifts** — no E-R pass can change from this. No dense-texture label churned (Tier 2 is byte-identical).

## The completeness measurement (drift-free A/B, $0, one session)

Seeded Ollama is not bit-reproducible on GPU, so comparing two live runs confounds the engine change with ±1–2 items of drift. `scripts/bass-aware-completeness.ts` sidesteps that: it generates each E-R item's ABC reharmonization ONCE (seed 42), then applies the OLD vs NEW voicer vocabulary to the **identical emitted chord symbols** — same symbols, two engines, zero drift. The metric is COMPLETENESS (measures kept per proposal), not pass-rate (ABC already clears the set).

| metric (mean per proposal, 22 items) | OLD vocab | NEW (bass-aware) |
|---|---|---|
| chords emitted | 7.955 | 7.955 |
| **chords kept (measures covered)** | **6.591** | **7.773** |
| **dropped-measure rate** | **17.1%** | **2.3%** |

**+26 measures unlocked across the set**, by quality: `9`×10, `dim7`×5, `min7`×5, `m9`×3, `maj9`×2, `7sus4`×1. The items that gained most are the ones the JSON path struggled with: **`fallin` 3 → 8** (+`G9, B7sus4, C9, F9, D9` — it never cleared under JSON even at best-of-16), **`bethena` 4 → 8**, **`experience` 4 → 8**, **`autumn-leaves` 5 → 8**. Receipt: `experiments/maker-arc/phase-c-experiments/qwen2.5_7b_bass-aware-completeness.json`.

**Standard-format confirmation (both arms, `--tag bass-aware`, one session):** `abc-decompose` single-pass **22/22 pass (100%), 0 empty, mean 7.73 chords/proposal** (vs the abc-pilot's 7.05); `abc-decompose-bon` **coverage@1 = 100%, mean 7.77**. Pass-rate holds; the proposals are fuller. Receipts `qwen2.5_7b_abc-decompose_bass-aware.json`, `qwen2.5_7b_abc-decompose-bon-n16_bass-aware.json`.

## Honest caveats

1. **The residual 2.3% is not bass-addressable.** ≈4 measures across the set stay dropped — chords still outside the deterministic vocabulary entirely (13ths, altered dominants, 6/9) or ABC note-blobs the tolerant parser kept. Bass-awareness unlocks the collisions; it does not add new qualities beyond the six. The honest ceiling of the deterministic instrument is unchanged.
2. **The A/B holds the prompt constant.** The ABC prompt still lists only the old vocabulary; the base emits the richer chords anyway (measured), so this isolates the ENGINE effect. Inviting the new qualities in the prompt is a possible further lift, not measured here.
3. **Completeness ≠ musical quality.** "Measures kept" counts round-tripped chords; whether each is the *best* reharmonization is `verify_harmony`'s consonance gate (which all passing proposals clear) plus taste — not this metric.

## Bottom line

The bass-aware `inferChord` cuts the ABC maker's dropped-measure rate **17.1% → 2.3%** and lifts a passing reharmonization from covering ~83% of its measures to ~98% — the local maker now writes the whole chart, still judged only by tools that cannot flatter it. It is the sixth live receipt for the validate-instrument-before-paid-runs discipline: the naive change looked right, the library snapshot + a grounded study-swarm caught that it was a 46% over-labeling churn, and the contained design delivered the completeness win at 1.18% blast radius with the frozen eval untouched.
