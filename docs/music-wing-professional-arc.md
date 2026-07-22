# The Studio Music Wing — Professional Pipeline (the arc)

**Date:** 2026-07-22 · **Class:** grounded design arc (research-grounded-advisor protocol, blueprint mode) — 5 parallel retrieval-bound lanes → synthesis → family-different verification gate → architecture · **Status:** DESIGN CANON, director-directed ("level the whole music wing"), engine-first · **Scope:** spans `ai-jam-sessions` (analysis + composition atelier) + `Motif` (adaptive delivery)

## Why this exists

The music wing is a pile of good utilities sitting where a professional pipeline should be. The maker reharmonizes; `inferChord` labels a chord; Motif scores a scene — but they are separate tools, and the analysis is a crude pooled-pitch-bag guess. The director's directive: make this a **professional music production wing** — real analysis → real composition → adaptive scoring, one pipeline. This doc is the grounded arc to get there. It uses the study-swarm the way it is meant to be used: a **blueprint to build big**, not a fence to shrink behind.

## The result the grounding delivers (bottom line up front)

The professional symbolic-music literature independently prescribes the studio's **two existing signature patterns**, in a new modality:

1. **The verifier-protected envelope** (local generation admitted by a deterministic verifier + best-of-n) — already proven on the reharmonization surface (91% E-R @16, above the frontier ceiling, $0). The composition literature converges on the same shape.
2. **Canon-first** (a dense, source-attested style corpus → a trainable style, gated by a style verifier) — already the studio's visual doctrine (style-dataset-lab). The music-style literature describes the identical pattern for audio, and it is affordable locally.

This is not a stretch onto the doctrine. It *is* the doctrine, applied to music. That is what makes a professional music wing credible for a 1-human + LLM-crew studio.

## Research grounding (5 lanes; load-bearing claims family-different verified — receipt below)

**Lane 1 — composition SOTA + the decompose→verify envelope.**
- No unconstrained transformer is shown to produce professional *full* compositions unaided; long-term structure, voice-leading, and motivic coherence are the reported failure axes. Huang et al. 2018 *Music Transformer* (arXiv:1809.04281); Yu et al. 2022 *Museformer* (arXiv:2210.10349). *(Corrected after the verification gate flagged an overstatement — end-to-end generation IS also SOTA; the defensible point is the unaided-failure axes, which the envelope targets.)*
- A generate→verify→**resample** loop beats single-pass and shipped in production: **Coconet / Counterpoint by Convolution**, blocked-Gibbs erase-and-rewrite (Huang, Cooijmans, Roberts, Courville, Eck 2019, arXiv:1903.07227), deployed in the Bach Doodle (Huang et al. 2019, arXiv:1907.06637). The deterministic verifier can be a *real music-theory engine*: **FuxCP** encodes Fux species counterpoint as a Gecode constraint solver (Sprockeels et al. 2023). → **Phase 2 is the reharmonization envelope scaled: propose musical material → deterministic music-theory verify → best-of-n / resample.**
- First-class typed tokens (chords/tracks/positions) and conditioning on already-fixed material are the enabling representation: REMI (Huang & Yang 2020, arXiv:2002.00212), Compound Word (Hsiao et al. 2021, AAAI, doi:10.1609/aaai.v35i1.16091), MMM per-track infilling (Ens & Pasquier 2020, arXiv:2008.06048), Anticipatory Music Transformer control events (Thickstun et al. 2023, arXiv:2306.08620). → **Hold verified voices fixed, regenerate one part — the multi-voice analogue of the current single-part loop.**

**Lane 2 — the deterministic composition verifier (the admission gate).** The field draws a clean line: **well-formedness / prohibition rules are deterministic gates; preference / reduction rules are heuristic** and go *behind* the gate as a scorer. Cleanly gate-able (Huron 2001 *Tone and Voice*, doi:10.1525/mp.2001.19.1.1; Tymoczko 2006 *Science* 313:72; Rohrmeier 2011 *J. Math & Music* 5(1):35; Anders & Miranda 2011 *ACM Comp. Surveys* survey): parallel/direct fifths & octaves, spacing/range, voice crossing & overlap, dissonance preparation-resolution, tendency-tone resolution (given chord labels), harmonic **grammaticality**, and voice-leading **distance** bounds. Irreducibly heuristic (Hamanaka et al. 2006 GTTM; Kirlin & Jensen 2011 Schenkerian): preference weighting, reductive depth, disambiguating valid parses, global form. → **The Phase-2 gate is the deterministic set; taste (form, preference) becomes a scorer/optimizer behind it — exactly the shape that made verify_harmony work.**

**Lane 3 — the adaptive-scoring bridge (Motif).** Every professional system splits **offline** (compose tempo-locked, cue-tagged **stems/segments** with entry/exit metadata — horizontal re-sequencing units + vertical layers; Sweet 2014; Collins 2008 doi:10.7551/mitpress/7909.001.0001) from **runtime** (a small named game-state→music mapping selects & re-sequences via *musically-quantized, rule-based transitions*, stingers as overlays — Wwise Switch Containers; FMOD parameter/timeline). Shipping games use **pre-composed adaptive**; runtime generation is research-stage, bottlenecked by real-time control + evaluation (Plut & Pasquier 2020, *Entertainment Computing* 33:100337). The reference architecture for the loop: a Transformer produces a **verified layer bank**, a low-dimensional **arousal-valence** signal from game state drives *selection* at runtime (Santos et al. 2022, arXiv:2207.01698). → **The composition wing exports a tagged segment/stem bank; Motif's `score-map` + macro-mappings ARE the runtime layer. Ship the transformational path first (adaptive playback of verified material); runtime generation is a later gated add-on.**

**Lane 4 — evaluating quality without ground truth.** There is **no objective metric of absolute musical quality** — objective metrics measure distance-to-corpus and do not track human judgment (Yang & Lerch 2020, doi:10.1007/s00521-018-3849-7; survey arXiv:2308.13736). So separate two claims: *in-distribution / theory-valid / not-broken* (cheap, deterministic, defensible) from *professionally good* (a small panel, narrowly claimable). Deterministic floor as a **rejection filter inside the envelope**: mgeval / MusPy distributional band (Dong et al. 2020, arXiv:2008.01951) + Midi Miner tonal-tension, which is validated against human tension ratings (Guo et al. 2019, arXiv:1910.02049) + voice-leading & repetition violation counts. Quality claim: a small **best-worst-scaling** panel vs human-composed anchors (Kiritchenko & Mohammad 2017, arXiv:1712.01765). → **Report a vector against a corpus band, never maximize one number (anti-Goodhart). "In-distribution, theory-valid, preferred over baseline in blind BWS" is the defensible claim — never "professional-quality" from a metric.**

**Lane 5 — the trainable musical-style canon (canon-first, audio edition).** A recognizable style is learnable from a **modest** corpus: either ~10⁴ homogeneous same-style examples from scratch (Sturm et al. 2016 ~23K ABC Celtic tunes, arXiv:1604.08723), or a broad pre-train + a small human-verified in-style set with a **lightweight adapter** (Yao & Chen 2025, arXiv:2506.17497; few-shot via LoRA/state-tuning, MIDI-RWKV, arXiv:2506.13001). Representation: quantize to a metric grid; typed/compound tokens (REMI/Compound Word — full songs train "within a day on a single GPU") or interleaved **ABC** (NotaGen, Wang et al. 2025, arXiv:2502.18008: 1.6M-piece ABC pre-train + ~9K period-composer-instrument-labeled fine-tune, **won human A/B tests**). Annotation = training signal AND inference dials (MuseMorphose attribute embeddings, Wu & Yang 2021, arXiv:2105.04090). Gate: distributional similarity + a **style classifier** (Yang & Lerch 2020; Zhang et al. 2023 arXiv:2310.14044). → **The music-style canon is the style-dataset-lab pattern in audio: dense source-attested canon → a house-style adapter, gated by a two-part style verifier. Affordable per-game locally.**

## Current state (mapped 2026-07-22)

| Layer | Where | State |
|---|---|---|
| **Analysis** | `ai-jam-sessions/src/songs/jam.ts` | Crude — pooled-per-measure pitch-class bag + template match (now bass-aware for the voicer round-trip). No onset/beat segmentation, salience weighting, real root-finding, or motif/form analysis. |
| **Composition** | `ai-jam-sessions/src/maker/*` | Thin — only chord-SYMBOL reharmonization works (the decompose→verify envelope). `phrase-continuation.ts` (melody) exists but was never validated. The v1.5.0 browser cockpit is a composition front-end. No melody+harmony+voice-leading+arrangement. |
| **Adaptive scoring** | `Motif` (16 packages, incl. `music-theory`, `scene-mapper`, `score-map`, `clip-engine`, `runtime-pack`) | Mature — Grounded prologue score complete (530 tests). This is the delivery layer; it needs a real segment bank to consume, not more plumbing. |

**The gap is precise:** real analysis + real composition in the atelier, then a clean contract into Motif's cue/score system.

## The architecture (the through-line, validated)

```
     CANON (dense, source-attested musical style)  ──trains──▶  house-style adapter
                                                                      │
  source scores ──▶  ANALYSIS  ──▶  COMPOSITION (LLM proposes) ──▶ VERIFY (deterministic
  (real harmonic/       │            style-conditioned            music-theory gate: parallels,
   melodic/form         │            decompose→verify→best-of-n)  resolution, grammar, VL-distance)
   understanding)       │                                          │  + corpus-band + tension floor
                        │                                          ▼
                        └──────────────────────────────▶  TAGGED SEGMENT/STEM BANK
                                                          (tempo-locked, cue-family + entry/exit meta)
                                                                      │
                                                                      ▼
                                            MOTIF runtime: game-state → affect/param → SELECT +
                                            re-sequence via quantized transitions; stingers as overlays
```

Two studio patterns carry the whole thing: the **verifier-protected envelope** (generation admitted by a deterministic gate) and **canon-first** (trainable style + style verifier). Both are already proven in the studio; both are what the literature prescribes.

## The phased arc (engine first, per director)

- **Phase 1 — the real ANALYSIS engine** *(step one).* Replace the pooled-bag `inferChord` for *source* analysis (keep the exact-bass round-trip for the voicer). Onset/beat **segmentation** (the repo carries durations + MIDI onsets), duration × metric-strength **salience weighting**, Parncutt/Temperley **root-finding**, conservative-real extended detection, + motif/form/cadence structure. Output: a real chord **progression** + structure per song. Grounded by the prior ACE study-swarm (`maker-arc-phase-c-bass-aware-study-swarm.md`). Deterministic, $0. Makes the jam briefs a genuine harmonic analysis and gives Phase 2/3 real material.
- **Phase 2 — the COMPOSITION engine.** The reharmonization envelope scaled: the local model proposes musical material (melody + harmony + voice-leading + arrangement) in a typed representation; a **deterministic music-theory verifier** (Lane 2's gate set) admits; best-of-n / resample (Coconet pattern); the eval floor (Lane 4) is the rejection filter. Style-conditioned by the Phase-5 house-style adapter. The cockpit is the front-end.
- **Phase 3 — the ADAPTIVE-SCORING bridge (Motif).** Export the verified material as a **tagged segment/stem bank** (Lane 3's offline contract) that Motif's `score-map` consumes; drive selection at runtime with a low-dimensional affect/tension signal from game state. Transformational first; generation later.
- **Phase 5 (parallel spine) — the CANON + house-style.** Build a dense, source-attested musical-style canon (the audio style-dataset-lab); train a house-style adapter (Lane 5); gate it on distributional similarity + a style classifier. Feeds Phase 2's style conditioning.

## Honest frame

- **This is a multi-arc build, not a session.** Professional means ambitious AND honest about the work. Phase 1 is a real subsystem deliverable; Phases 2/3/5 are larger. Deliver phased, each verifier-gated and measured; do not swing to "compose everything at once."
- **The claimable quality bar is bounded by Lane 4.** We can defensibly claim "in-distribution, theory-valid, preferred over baseline in blind BWS," not "professional-quality" from any metric. The human panel is where the real quality judgment lives — that is a fact about music, not a shortcut.
- **The verification gate corrected this doc.** It flagged an overstatement (that SOTA rejects end-to-end generation); the corrected, defensible claim is carried above. The protocol took its own medicine.
- **Two repos, one pipeline.** A shared music-theory representation is the integration seam (Motif already has a `music-theory` package). Deciding where shared primitives live is an early Phase-1 architecture task.

## Step-4 verification receipt

- **Groundedness — 7 load-bearing claims, cross-family panel** (`ollama_verify_claims`, DeepSeek-v4-pro + GLM-5.2, reasoning-stripped; Claude-free, disjoint families): **6 CONFIRMED / 0 REFUTED / 1 NEEDS_REVIEW.** The NEEDS_REVIEW (decompose-vs-end-to-end) was a real catch — reframed to the defensible claim above rather than carried as-is. kimi excluded (no valid verdicts) → 2/3 served, ensemble requirement met, `weak:false`. Run `run_2026-07-22T23-20-39_fb6cb0`.
- **Existence — retrieval oracle** (WebFetch): Coconet/Counterpoint by Convolution (Huang et al. 2019, arXiv:1903.07227 — Bach-Doodle deployment in the companion arXiv:1907.06637), Santos et al. 2022 (arXiv:2207.01698), NotaGen (Wang et al. 2025, arXiv:2502.18008) confirmed with correct attribution + finding. The prior ACE swarm's anchors (Humphrey & Bello, McFee & Bello, Harte, Temperley/Parncutt) were verified in `maker-arc-phase-c-bass-aware-study-swarm.md`.
- **HALT conditions:** none (0 fabricated, 0 unanimous-refuted, ≥2 families served). The gate discriminated rather than rubber-stamped — it improved the doc.

## Standards compliance (six standards, 0–3)

- PIN_PER_STEP 3 — each phase is a verifier-gated, seeded, receipted unit; the design is grounded by named retrieval-verified sources.
- ANDON_AUTHORITY 3 — the deterministic verifier gate (harmony/voice-leading/eval floor) halts any non-conforming generation; the analysis regression snapshot guards Phase 1.
- NAMED_COMPENSATORS 3 — $0/local phases, git-reversible; no publish/pod without a director priced-ask.
- DECOMPOSE_BY_SECRETS 3 — analysis / composition / scoring / canon are separable subsystems with explicit contracts (the tagged segment bank is the Phase-2→3 seam; the style adapter is the Phase-5→2 seam).
- UNCERTAINTY_GATED_HUMANS 3 — the quality claim gates on a human BWS panel (Lane 4); the director gates each phase; the verification gate's one flag was surfaced + corrected, not buried.
- EXTERNAL_VERIFIER 3 — deterministic music-theory verifiers + corpus-band eval are the judges (no model self-grades); the design's citations passed a family-different, reasoning-stripped panel.

## Next

Design + build **Phase 1 — the real analysis engine** as the first grounded slice ($0, deterministic, gated by the existing library snapshot). It is the smallest professional deliverable and the input every later phase needs.
