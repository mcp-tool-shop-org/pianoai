# Maker Arc — Phase C, the ABC reharmonization pilot (the empty-output fix, measured)

**Date:** 2026-07-22 · **Class:** $0 format pilot + local A/B measurement (base qwen2.5:7b, frozen 22-item E-R set; no pods, no API, no publish) · **Status:** SHIPPED — ABC decisively fixes the dominant E-R failure and is now the default `auto_reharmonize` format · **Predecessor:** [maker-arc-phase-c-vocab-expansion.md](maker-arc-phase-c-vocab-expansion.md) (which localized the failure to *empty output*, not chord rejection)

## What this is

The vocab-expansion measurement found the dominant E-R miss is **empty / unparseable output** (12/22 items produced no parseable JSON), and flagged the ABC path as the best-motivated lever (Yuan et al. 2024 *ChatMusician* arXiv:2402.16153: ABC well-formedness 99.6% vs GPT-3.5's 65.4%; Qu et al. 2024 *MuPT* arXiv:2404.06393: ABC ~38% the tokens). This pilot builds that path — an `AbcChordProposer` that asks the model to reharmonize as an **ABC lead sheet** (the melody with one `"chord"` annotation per bar) instead of a JSON chord array — and A/B-measures it against the JSON path. Everything downstream is identical: the quoted chord symbols feed the same `voiceChord → verify_harmony → best-of-n` loop, so the ONLY variable is the output format.

## Standards compliance (six standards, 0–3)

| Standard | Score | Evidence |
|---|---|---|
| PIN_PER_STEP | 3 | Both arms run through the same seeded `scripts/er-experiments.ts` (`--mode decompose` vs `--mode abc-decompose`, base seed 42, per-sample 42+k), `--tag abc-pilot` to distinct receipt files. |
| ANDON_AUTHORITY | 3 | A skeptical verification pass on the 3 hardest items (raw ABC + full verdict margins) gated the "100%" claim before it was written — surfacing the honest caveats below. |
| NAMED_COMPENSATORS | 3 | $0, git-committed code + receipts → `git revert`. No pod, no publish. |
| DECOMPOSE_BY_SECRETS | 3 | The ABC prompt/parse/proposer live in one new module; the JSON path, the voicer, and the verifier are untouched — the format is the only thing that changed. |
| UNCERTAINTY_GATED_HUMANS | 3 | The A/B ran both arms in ONE session to control for GPU generation drift (the confound identified in the vocab-expansion report); the surprising positive was verified, not trusted. |
| EXTERNAL_VERIFIER | 3 | The judge is the platform's deterministic `verify_harmony` (fidelity ∧ consonance ∧ non-triviality) against the GIVEN melody — the model's ABC melody notes are discarded, only its chord CHOICES are scored. |

## The measurement (both arms, one session, drift-controlled)

Receipts: `experiments/maker-arc/phase-c-experiments/*_abc-pilot.json`.

| metric | JSON chord-array | ABC lead sheet |
|---|---|---|
| E1 single-pass **empty-rate** | **50.0%** (11/22) | **0.0%** (0/22) |
| E1 single-pass pass@1 | 45.5% (10/22) | **100%** (22/22) |
| E3 best-of-n coverage@1 | 41% | **86%** |
| E3 coverage@2 | 45% | **100%** |
| E3 coverage@16 | 95% | **100%** |

**The decisive, robust result: ABC eliminates the empty-output failure — 50% → 0%.** Every one of the 22 items — including all 11 the JSON path left empty, and `fallin`, which the JSON path never cleared even at best-of-16 — produced a well-formed ABC lead sheet with extractable chords, and passed the gate. Best-of-**2** ABC already reaches 100% coverage, vs JSON needing 16 samples to reach 95%. This is exactly the F23/F24 mechanism: the model handles a format it has seen millions of (ABC lead sheets) far more reliably than a bespoke JSON chord array.

## Verification (the "100%" is real — with honest caveats)

Ran the ABC path on the 3 hardest items and inspected the raw ABC + full verdict:

- **fallin** (JSON never cleared it): well-formed ABC → `Fmaj7 D7sus4 Bm7b5 A7 G7 F7 Am7` (7 distinct) — a genuine jazz reharmonization. PASS, but the margin is **borderline** (chromatic ratio exactly 0.200, the threshold).
- **amazing-grace** (JSON empty): `Abmaj7 Dm7 Cmaj7 Eaug7 Bbmaj7 Fmaj7 Gb7 Ab9` (8 distinct) — real and varied. PASS (chromatic 0.167).
- **agua-de-beber**: mostly clean ABC but the model put note tokens in one bar's quotes; the tolerant parser dropped that blob. PASS (chromatic 0.029, comfortable).

The passes are genuine (varied chords, consonant with the actual melody, non-trivial), NOT degenerate. The honest caveats, so the number isn't oversold:

1. **Proposals are often partial.** Out-of-vocabulary chords the model emits in ABC (`D7sus4`, `Cmin7`, `Eaug7`, `Ab9` — the SAME boundary the vocab-expansion report hit) get dropped by the voicer, so a "pass" may cover 6 of 8 measures. The gate scores the proposed measures — identical leniency to the JSON path, so the A/B is fair; ABC simply produces valid non-empty output where JSON produced nothing.
2. **Some items have sparse/`N/A` source harmony** (fallin, amazing-grace left hands are rest-heavy), making non-triviality trivially satisfied. This is a property of those items and applies to BOTH arms.
3. **fallin's margin is borderline** (chromatic 0.200). Not every "pass" is comfortable.

So "100%" honestly means: *ABC reliably produces valid, consonant, non-trivial chords where JSON produced empty output half the time* — not "ABC writes flawless 8-bar reharmonizations."

## Action taken + the follow-up it motivates

- **`auto_reharmonize` now defaults to `format: "abc"`** (the JSON path is opt-in via `format: "chords"`). Both are drop-in `ChordProposer`s feeding the identical verifier loop; the tool went from failing on ~half of sections to producing a verified reharmonization on all 22 E-R items. `AbcChordProposer` + `parseAbcChords` live in `src/maker/abc-chord-proposer.ts`; a seeded, non-JSON `OllamaBackend.generateText()` was added (additive; respects genOptions so best-of-n stays replayable).
- **The remaining headroom is the vocab boundary, not the format.** ABC's dropped chords (`D7sus4`, `min7`, `aug7`, the 9ths-with-7th) are exactly what the vocab-expansion report identified as needing a **bass-aware `inferChord`** (to round-trip 9/maj9/m9/dim7) plus cheap aliases (`min7`=m7, `7sus4`=sus4-ish). Completing that vocabulary would make ABC's already-non-empty proposals more *complete* (fewer dropped measures) — the natural next session.

**Net:** the vocab-expansion null pointed at the real lever (output robustness), and this pilot confirmed it decisively at $0 — a format change the model was already good at fixed the failure that no amount of vocabulary or search could. The instrument discipline earned its keep both ways: it stopped an overclaim on vocabulary, then verified a surprising win before shipping it.
