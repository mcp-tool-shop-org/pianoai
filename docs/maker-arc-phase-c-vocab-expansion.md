# Maker Arc — Phase C, chord-vocabulary expansion (a $0 measured ceiling-lift attempt)

**Date:** 2026-07-22 · **Class:** $0 vocabulary extension + local re-measurement (base qwen2.5:7b, frozen 22-item E-R set; no pods, no API, no publish) · **Status:** SHIPPED — the extension is correct + round-trip-proven; the hypothesized pass-rate lift did NOT materialize (measured), and the measurement redirected the effort to the evidenced targets · **Predecessor:** [maker-arc-phase-c-design.md](maker-arc-phase-c-design.md) (Recommendation §, "expand the chord vocabulary")

## What this is

The Phase-C design recommended, as a $0 ceiling lift, expanding the chord vocabulary beyond the 10 qualities "to 6/9/add9/slash chords — the 'empty' E1 items were often the base choosing richer valid chords the vocabulary rejects." This slice implements what the deterministic engine can safely support, then **measures whether the base actually emits those chords** — the instrument-discipline check before claiming a lift. It doesn't claim one it can't show.

## Standards compliance (six standards, 0–3)

| Standard | Score | Evidence |
|---|---|---|
| PIN_PER_STEP | 3 | The re-run is seeded (base 42, per-sample 42+k) via the same `scripts/er-experiments.ts`; a new `--tag` writes to distinct receipt files so the frozen baselines are never clobbered. |
| ANDON_AUTHORITY | 3 | The voicer fidelity test (whole vocab × 12 roots) is the halt: it CAUGHT that 9/maj9/m9 don't round-trip (a real defect in the first attempt), forcing the narrower, correct vocabulary before anything shipped. |
| NAMED_COMPENSATORS | 3 | $0, git-committed code + receipts → `git revert`. No pod, no publish. |
| DECOMPOSE_BY_SECRETS | 3 | The vocabulary lives in three lock-stepped places (CHORD_TEMPLATES, SUFFIX_INTERVALS, the generic voiceChord); the frozen E-R set + baseline receipts are read-only. |
| UNCERTAINTY_GATED_HUMANS | 3 | The honest null is reported, not papered over; the follow-up (bass-aware inference for 9ths/dim7) is flagged as a separate director decision, not silently taken. |
| EXTERNAL_VERIFIER | 3 | The judge is the platform's own deterministic `inferChord`/`verifyHarmony` (the round-trip test) — never the generator. |

## What changed (three lock-stepped places + parse aliases)

The vocabulary lives in three places kept in sync: `CHORD_TEMPLATES` (`src/songs/jam.ts`, so `inferChord` DETECTS a chord), `SUFFIX_INTERVALS` (`src/maker/verify-harmony.ts`, so `parseChordSymbol` PARSES it — which `voiceChord` and the consonance/tension map consume), and the generic `voiceChord` (`src/maker/voicer.ts`, which renders whatever intervals `parseChordSymbol` returns, so it needed no code change).

**Added — round-trip proven (`voicer.test.ts`, whole vocabulary × 12 roots):**
- `add9`, `madd9` — an added 9th over a triad (no 7th). Their 4-note sets contain no other full chord at a different root, so they round-trip.
- Slash chords (`C/E`, `Am7/G`) — normalized in `parseChordSymbol` by dropping the bass (an inversion the pitch-class engine cannot confirm), so `C/E ≡ C`. The model's slash output is accepted as its base quality instead of rejected.
- Notation aliases `M7` → `maj7` and `ø7`/`ø` → `m7b5` — pure parse aliases onto EXISTING intervals (zero round-trip risk); added because the base actually emits them (see the diagnostic below).

**NOT added — these break the round-trip under a pitch-class engine (documented in `jam.ts`):**
- `6` / `m6`: pitch-class-identical to the relative minor 7th (`C6 = A-C-E-G = Am7`; `Cm6 = Am7b5`).
- `9` / `maj9` / `m9` (a 9th WITH the 7th): the rootless upper structure IS another 7th chord on the 3rd (`G9 ⊃ Bm7b5`; `Cmaj9 ⊃ Em7`; `Cm9 ⊃ Ebmaj7`). The engine detects the subset. **This was caught empirically** — the first attempt added them and the fidelity test failed on `G9 → Bm7b5`.
- `dim7`: rotationally symmetric (`Cdim7 = Ebdim7 = Gbdim7 = Adim7`, pitch-class-identically) — no unique root to recover.
- `13`, `m11`: same upper-structure / cardinality problems.

Supporting the excluded families would require a **bass-aware `inferChord`** (prefer the root that is the lowest note) — a broader change to an engine used across the whole library, out of scope here.

## The measurement — and why there is no clean lift to report

Re-ran E1 (decompose single-pass) and E3 (decompose × best-of-16) on base qwen2.5:7b, identical seeds and prompt, only the vocabulary changed. Receipts: `experiments/maker-arc/phase-c-experiments/*_vocab-expanded.json`.

| | baseline (frozen) | expanded-vocab re-run |
|---|---|---|
| E1 decompose (pass@1) | 50.0% (11/22) | 45.5% (10/22) |
| E3 decompose×bon (@16) | 90.9% (20/22) | 95.5% (21/22) |

At face value E3 @16 gained one item (agua-de-beber cleared at sample 5; only fallin remains). **But that gain is not attributable to the vocabulary**, for a decisive reason:

**The chord-emission diagnostic** (`qwen2.5_7b_chord-emission-diagnostic.json`) ran the chords-only prompt once per item and classified every symbol the base proposed:

> **base-vocab = 68, newly-added (add9/madd9/slash) = 0, still-unsupported = 12, empty items = 12/22.**

The base emitted **zero** add9/madd9/slash chords across all 22 items. The lever this slice built for those chords **never fires on this data** — so it cannot have caused the E3 +1. That +1, and the E1 −1, are **run-to-run generation drift**: seeded Ollama is not bit-reproducible on GPU, and two same-seed runs disagree at the ±1–2 item level (confirmed directly — `comptine` produced 8 chords in the E1 re-run but 0 in the diagnostic, same seed 42).

What the base DID emit but the engine still rejects (the 12 "unsupported"): `M7` (maj7 notation), `ø7`/`Aø7` (m7b5 notation), `dim7` (Adim7/Ddim7/F#dim7/Gdim7), and 9ths-with-7th (`Bm9`, `Abm9`, `F#m11`), plus `13`s. Of these, **only the notation aliases M7 and ø7 are safely fixable** — which is exactly what this slice added on top of add9/madd9/slash. The rest need the bass-aware engine.

The dominant failure mode is not chord rejection at all: **12 of 22 items produced empty / unparseable output** on the diagnostic run. No vocabulary change addresses that — it is a generation/format-robustness problem.

## Honest conclusion

- The vocabulary extension is **correct and safe** (round-trip proven, full suite green, no existing-song inference regressed) and it improves what the maker will ACCEPT — add9/madd9/slash a model can legitimately emit, plus the M7/ø7 aliases this base measurably does emit.
- It produces **no measurable pass-rate lift** on qwen2.5:7b for the E-R set, and the design-doc hypothesis ("the empty E1 misses were the base choosing add9/6/slash the vocabulary rejects") is **not supported** by the emission profile: the base emits M7/ø7/dim7/9ths, not add9/6/slash, and the empty misses are genuinely empty output.
- The instrument discipline held: measuring before claiming turned a hoped-for benchmark bump into a documented null + a redirected, evidence-backed fix (the aliases) + a precise scope note for the real remaining lever (a bass-aware `inferChord`, which would unlock dim7 / 9th-with-7th / 13th — a separate priced-ask, not taken here).

**Follow-up (not taken):** a bass-aware `inferChord` tie-break (prefer the root equal to the lowest note) would let dim7 / 9 / maj9 / m9 / 13 round-trip and is the only vocabulary lever with headroom left — but it changes an engine used across the whole song library and needs its own regression pass. The generation-drift and empty-output findings suggest the larger E-R ceiling lever is output robustness / a stronger base, not vocabulary.
