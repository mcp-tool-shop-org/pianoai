# Music Wing — Phase 1: the real harmonic analysis engine (receipt)

**Date:** 2026-07-22 · **Class:** engine deliverable + honest measurement · **Scope:** Session 1 = the analyzer CORE (structure/form/cadence, HCDF segmentation, and consumer-wiring are Session 2+) · **Cost:** $0, deterministic, local (no pods, no publish) · **Repo:** `mcp-tool-shop-org/ai-jam-sessions`

Step one of the studio Music Wing professional arc (`docs/music-wing-professional-arc.md`). Replaces the crude pooled-per-measure pitch-class-bag `inferChord` — **for SOURCE analysis only** — with a real harmonic analyzer, built to the recipe the prior ACE study-swarm handed over (`docs/maker-arc-phase-c-bass-aware-study-swarm.md`). It is the input every later phase (composition, adaptive scoring, canon) needs.

## What was built

A new, **decoupled** `src/analysis/` module. It reads a `SongEntry` and produces a real per-segment chord progression. It imports nothing from `src/maker` or the jam-brief path and writes nothing back — so the bass-aware `inferChord` in `src/songs/jam.ts`, the voicer round-trip (`voicer.test.ts`), and the Gate-2 library snapshot (`jam.regression.test.ts`) are all **untouched**. Wiring it into anything is a later, gated director decision.

The pipeline, and its ACE-recipe grounding:

| Step | File | Grounding (study-swarm) |
|---|---|---|
| Timed event stream `{pitch, onsetBeat, durBeats}` from token durations | `events.ts` | reuses the platform's own note parsers; onsets are the platform-consistent nominal position |
| Beat-synchronous (tactus) segmentation — NOT whole measures | `profile.ts` | Cho & Bello 2014 (sub-bar segments carry ACE accuracy) |
| Salience-weighted PC profile = Σ(overlap × metric-strength) | `profile.ts` + `meter.ts` | duration + metric accent (Lerdahl & Jackendoff 1983; Parncutt 1994); the NCT defense of Ju et al. 2017 / Lee 2006 |
| Root-finding from PC content, bass = weak tiebreak only | `root.ts` | Parncutt 1988 root-salience; Temperley 1997 — root from content, not the lowest note (findings 3–4) |
| Conservative-real chord ID (escalate to 7th/9th only on salient evidence) | `chord-id.ts` | Humphrey & Bello 2015 / McFee & Bello 2017 — abstain-on-weak-evidence wins (findings 6–7) |
| Merge → spans (harmonic rhythm) + pooled per-measure view | `analyze.ts` | Masada & Bunescu 2018 — harmonic rhythm beats the barline |

Vocabulary is exactly `inferChord`/`verifyHarmony`'s closed set, so every analysis label is a symbol the rest of the platform can read and voice. **81 tests** ship with the code (all of `src/analysis`).

## The honest measurement

Validated with `scripts/analysis-validate.ts` against a 6-section hand-annotated reference (`experiments/analysis-arc/reference-changes.json`; every change derived from the section's **actual MIDI pitch content**, not a copyrighted lead sheet) using duration-weighted MIREX accuracy (Raffel et al. 2014), plus library-wide ground-truth-free proxies. Full output: `experiments/analysis-arc/validation-results.json`.

**Reference set — root accuracy by estimator and section:**

| section (beats) | analyzer spans | analyzer per-measure | baseline **left-hand** (incumbent) | baseline pooled-both (control) |
|---|---|---|---|---|
| bach mm.1-7 (28) — arpeggio + pedal | 29% | 29% | 0% | **100%** |
| el-condor mm.3-6 (16) — tremolo, empty LH | 0%* | 0%* | 0% | 50% |
| mozart mm.1-2 (8) — Alberti | 63% | 100% | 0% | 50% |
| scarborough mm.1-2 (6) — bass arpeggio | 100% | 100% | 100% | 100% |
| simple-gifts mm.5-6 (8) — hymn | 100% | 100% | 100% | 50% |
| **let-it-be mm.2-5 (16) — block-chord, 2 chords/bar** | **88%** | 50% | 38% | 13% |
| **aggregate (82)** | **50.0%** | 46.3% | **24.4%** | 63.4% |

*\*el-condor "0%" = the analyzer labels `G6` (the tremolo ostinato's lowest note is G) where the reference reads `Em`; the notes {E,G,B(,D)} genuinely spell both (finding 10, no single correct label). Not a total failure — a defensible alternate label.*

**Library-wide proxies (120 songs):**

| | analyzer | baseline (left-hand) |
|---|---|---|
| key-consistency (roots diatonic to declared key) | **82.2%** | 76.0% |
| labeled-measure rate | **98.9%** | 92.7% |
| harmonic rhythm (mean chords/measure) | **2.52** | ≤1 by construction |

## Honest verdict

**Against the actual incumbent** — the left-hand-only pooled `inferChord` the jam brief uses today (the "pooled-bag baseline" the kickoff and study-swarm name) — **the analyzer wins clearly**: ~2× on the reference (root 50.0% vs 24.4%), +6.2 pts key-consistency library-wide, and +6.2 pts labeled-measure rate (the left-hand baseline goes **blind** whenever the left hand is empty — e.g. el-condor's right-hand tremolo, which it scores N/A on every measure). It also produces real harmonic rhythm (2.52 chords/measure) the single-label-per-measure baseline cannot express. **The kickoff's success criterion — beat the pooled-bag baseline — is met.**

**But the measurement surfaced a real, diagnosed weakness, reported not papered over:** against a *stronger* both-hands-pooled control (which is NOT what the platform does today), the analyzer's aggregate is lower on this reference (50.0% vs 63.4% root). The per-section breakdown shows exactly why, and it is diagnostic:

- **The analyzer's beat-resolution DECISIVELY wins the block-chord case** (let-it-be 88% vs the pooled control's 13%): whole-measure pooling blends two-chords-per-bar into a garbage label; only sub-measure segmentation separates them. **This is the studio's target texture** — games/pop are block-chord, not Bach arpeggios.
- **The analyzer LOSES on arpeggio/pedal textures** (Bach 29% vs 100%): salience weighting (duration × metric) over-weights a sustained pedal/ostinato tone, so root-finding roots on it — Bach m2 {C,D,F,A} labels `Csus2` (rooting on the long pedal C) where the answer is `Dm7`; el-condor roots on the tremolo G. Equal-weight whole-measure pooling avoids this trap. **This is precisely the Session-2 target** (HCDF change-detection + pedal/inversion-aware root-finding), which the kickoff scoped out of Session 1.

**Advisory cross-family jury** (hermes3:8b, Llama-based — disjoint family from the studio's qwen; advisory only, the deterministic MIREX is the evidence): on 4 blind label contrasts it sided with the baseline on the pedal case (Dm7 over Csus2) and the ostinato case (Em over G6), and with the analyzer on harmonic rhythm (two chords, not one) — **corroborating both the analyzer's strength and its diagnosed weakness**. On a fourth item (an inverted G7) the judge itself erred (called {B,D,F,G} "Bm"), a live reminder that even an LLM judge disagrees on complex/inverted labels (finding 10) — hence advisory, never a gate.

## Recommendation (gated director decision — do NOT auto-apply)

1. **Wiring the analyzer into jam briefs is a Phase-2/consumer decision, gated, with a frozen-baseline caveat.** The frozen E-R `sourceChords` baseline and the Gate-2 snapshot must not be auto-rewired — a swap changes measured surfaces. This session deliberately did not touch them.
2. **Cheapest immediate win, if a source-analysis upgrade is wanted now:** the both-hands-pooled control (pool both hands into the existing bass-aware `inferChord`) already lifts reference root accuracy 24% → 63% over the left-hand-only jam brief, and fixes the empty-left-hand blindness — at near-zero code. The analyzer's beat-resolution spans add value *specifically* for block-chord harmonic rhythm on top of that.
3. **Session 2** (the real analyzer maturation): HCDF change-detection so spans stop fragmenting on arpeggios; pedal/inversion-aware root-finding so salience stops rooting on ostinati; then structure/form/cadence. The measurement harness built here (fixture + MIREX + proxies) is what will validate those — on an EXPANDED reference (6 sections is too small to tune a parameter on without overfitting to Bach).

## Session 2 update (2026-07-23) — the pedal fix is a CONTEXT problem, not a magnitude problem

On the director's "green to proceed," Session 2 began the maturation and rigorously ruled out the cheap version of the fix — a valuable de-risking, established by measurement.

- **Reference expanded to 9 sections** (added imagine's block-chord Cmaj7/F vamp, chopin-prelude-e-minor's held Em-over-G-bass, clocks' inverted Eb/Bbm). Bach's weight dropped 34%→25%. **The finding held and is NOT a Bach artifact:** analyzer spans root **53.4%** still beat the incumbent left-hand baseline (**33.9%**) but still lose to the both-hands-pooled control (**71.2%**) — the new inversion cases (bass ≠ root) systematically trip the salience-roots-on-the-pedal failure. (`eb2562e`)
- **A root-compression sweep (α, `ANALYSIS_ROOT_ALPHA`) proved a single-parameter magnitude fix is a Goodhart trap.** Compressing the profile toward chord-tone presence for root candidacy:

  | α | ref root | el-condor (ostinato) | let-it-be (block-chord target) | simple-gifts |
  |---|---|---|---|---|
  | 1.0 (shipped) | 53% | 0% | **88%** | **100%** |
  | 0.3 | 56% | 0% | 88% | 88% |
  | 0.0 (pure presence) | **59%** | **88%** | 69% | 75% |

  α=0 fixes the ostinati **and raises the aggregate** — but the over-weighted tone IS a chord tone, so flattening it necessarily amplifies passing-tone noise and **robs the studio's target block-chord texture** (let-it-be 88%→69%). No α is a strict improvement; the aggregate "win" is a redistribution away from the actual use case (anti-Goodhart: do not maximize a number that over-weights the arpeggio stress cases). The α lever ships defaulted OFF (1.0), tested, and reproducible, as the Session-2+ hook. (`32f5f52`)

- **The NCT/HCDF subsystem was then built and measured — a THIRD cheap fix ruled out.** Tonal-centroid (Harte et al. 2006) + a smoothed harmonic-change function segment beats into harmonically-stable regions (`c2d9515`); wired as an opt-in `segmentation:"hcdf"` mode (`6b3d16e`, default stays "beat"). The change function is demonstrably valid for block chords (let-it-be's chords are cleanly separated) and the mechanism groups an arpeggio that beat-mode fragments — **but HCDF-mode is measured STRICTLY WORSE on the reference (best 47% vs beat 53% root):** the smoothing needed to group arpeggios blurs the block-chord harmonic-rhythm boundaries (let-it-be 88%→38–69%, imagine 80%→55–60%). Same fundamental tension, now for segmentation. **Conclusion, established by three independent measured negatives (global α, HCDF smoothing, HCDF+presence): the block-chord ↔ arpeggio tension is NOT resolvable by any global segmentation/weighting scheme. The real fix is functional/key-aware harmonic analysis (Roman-numeral / cadence / key context) — the declared key can disambiguate el-condor's Em-vs-G and bach's ii-vs-IV where a magnitude and a centroid cannot. That is Session 3.** The HCDF primitives ship tested + reusable (they're the segmentation layer a functional analyzer will still want), defaulted off.

## What's genuinely next (Session 3): functional, key-aware harmonic analysis

The three ruled-out fixes converge on one answer. The analyzer currently reasons only about pitch-class *content* (Parncutt/Temperley) — it never uses the **declared key**, which every song carries. Functional analysis (root-in-key preference, Roman-numeral function, cadence detection) is the lever that distinguishes a pedal-bass chord tone from a root and a passing chord from a structural one — the exact ambiguities the three sweeps could not resolve. This is a real subsystem (Krumhansl-Schmuckler key-finding is already partially implicit in the key-consistency proxy; Temperley's harmonic + key models compose here), gated + measured on the same harness. It, not another weighting knob, is the path to closing the gap with the both-hands-pooled control.

## Standards compliance (six standards, 0–3)

- **PIN_PER_STEP 3** — deterministic + seedless by construction (no model in the analyzer); every result is a byte-reproducible function of committed inputs; `analysis-validate.ts` regenerates `validation-results.json` exactly.
- **ANDON_AUTHORITY 3** — the Gate-2 library snapshot + voicer round-trip + the new fixture-integrity guard halt CI on any regression; each of the 5 commits gated on green CI before the next.
- **NAMED_COMPENSATORS 3** — $0/local, no irreversible calls (no publish/pod/tag); `git revert <sha>` is the named undo for each additive commit; nothing existing was mutated.
- **DECOMPOSE_BY_SECRETS 3** — `src/analysis` is a self-contained subsystem (events / meter / profile / root / chord-id / analyze / measurement), decoupled from `src/maker` and the jam-brief path; its seam to the rest of the platform is the shared chord vocabulary only.
- **UNCERTAINTY_GATED_HUMANS 3** — the quality claim is bounded honestly (no absolute grade; the no-ground-truth ceiling is stated); the negative finding (loses to the pooled control on arpeggios) is surfaced TO the director as a gated decision, framed contrastively ("you might expect salience to always help; it backfires on pedals because…").
- **EXTERNAL_VERIFIER 3** — the judge is a deterministic MIREX scorer (a different mechanism than the generator), shipped with discrimination tests proving it tells right from wrong; the advisory jury is a different model FAMILY (Hermes/Llama vs qwen) with the analyzer's reasoning hidden; the design's citations were family-different verified in the two grounding docs.

## Artifacts

- Code: `src/analysis/**` (12 engine/measurement files + 11 test files, 81 tests)
- Harness: `scripts/analysis-validate.ts`
- Fixture: `experiments/analysis-arc/reference-changes.json`
- Results: `experiments/analysis-arc/validation-results.json`
- Commits: `f1805fe` (front-end) · `4f9f8a2` (analyzer) · `9606ba5` (measurement lib) · `40d8cb8` (validation) · this doc (receipt). All CI-green on `main`.
