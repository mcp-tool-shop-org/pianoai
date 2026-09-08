# Study-swarm: the spectrogram surface — how the model can see what it hears (2026-09-07)

**Why this exists.** The Director asked for a study-swarm into mel spectrograms and how they can
help an AI visualize sound, with a view to adding it to AI Jam Sessions. Today the model *sees*
music only as the SVG piano roll rendered from MIDI, and *hears* it only through the humans in
the room; the six engines render real audio offline and the vocal route already gates
SoulX-Singer takes on timing (40 ms) and pitch (50 cents). Five Opus lanes ran in parallel
(2026-09-07), each held to the study-swarm citation standard; zero cloud credits were spent. The
full 49-finding dispatch, the raw findings, and the family-different verification receipt live in
the readouts knowledge base at `vocology-knowledge/waves/wave-07-spectrogram-surface/`. This
file is the grounding the executor builds from; the architectural lock is at the end and the
Director gates it.

**Headline.** The lanes converge from five directions. A spectrogram image is a real but
*coarse* channel for a vision model: orientation, localisation, gross defects. Mel is the
representation audio models are trained on and is fine for onsets, but it is arithmetically
blind to a 50-cent error below 1 kHz. Every number must come from a DSP tracker. The only
batteries-included JS library is AGPL.

**What that adds up to** (see the revised lock at the end). The surface is an **audio inspector**,
not a picture: deterministic numbers first, transcription second, the image last and optional.
That mirrors what this repo already proved with its MIDI inspector tools, it runs on any attached
model rather than needing a frontier vision model, and it lets transcribed audio flow into the
EXISTING scoring and scored-piano-roll stack instead of sitting beside it.

## Research grounding (finding → design implication)

Numbers match the readouts dispatch so a finding can be traced to its receipt.

**What a vision model can read off a spectrogram**

**1–2.** GPT-4o given a *labelled* spectrogram image scored 59% on 10-class sound ID, beating
Gemini-1.5 native audio (49.6%) and matching human spectrogram readers. In the same paper's
ablation (default render = viridis, log frequency, log amplitude, axis labels on, colorbar off
→ 27.5% zero-shot), a linear frequency axis scored best (35.0%) and linear amplitude 30.0%, while
**magma (25.0%), mel (25.0%)**, showing a colorbar (23.75%), removing the labels (26.25%), low
resolution (20.0%) and MFCCs (13.75%) all scored below the default; few-shot exemplars lifted
GPT-4o to 70–76%. Dixit, Heller & Donahue 2024, arXiv:2411.12058. → The image is a real channel
at coarse resolution; keep axis labels, no colorbar, expose frequency scale and colormap as
parameters, ship labelled exemplar plates, and do not assume the MIR default render or magma is
what a VLM reads best.

**3–5.** On fine-grained content the picture fails: open VLMs read speech spectrograms at chance
(Loakman, James & Lin 2025, arXiv:2511.13225); GPT-4o on clinical mel spectrograms 32–36% vs 25%
chance (Dietrich et al. 2026, DOI:10.1371/journal.pdig.0001179); best of nine current models
51.2% on mel-spectrogram QA (CaReCoS, Rajgarhia et al. 2026, arXiv:2607.03356). → The 50-cent and
40-ms gates never route through the image; pair the image with extracted features.

**6, 10.** Audio-native models are no escape hatch: pitch 8–48%, chords under 20%, and answers
shift with notation — scientific pitch notation good, Hz bad (PitchBench, Liessens Dujardin et
al. 2026, arXiv:2605.26176); a "physical perception bottleneck" on pitch, timing, loudness,
duration (SonicBench, Sun et al. 2026, arXiv:2601.11039). → Pitch belongs to DSP; the model gets
note names with cents, never Hz; the picture localises, it never measures.

**7.** Rendering a numeric series as a picture instead of dumping the numbers improved LLM
reasoning ~140% and cut tokens ~99% (Liu, Liu & Prakash 2025, arXiv:2411.06018). → Return image
+ compact numbers, never the raw frame matrix.

**8.** Audio multimodal models follow their text input even when the acoustics contradict it
(DEAF, Xiong et al. 2026, arXiv:2603.18048). → Blind the critic: the model describes the render
before it sees the intended notes.

**Which transform**

**11–12.** The two most successful pitched-music systems use a constant-Q transform: the HCQT
at 60 bins/octave (20 cents), 11 ms hop, fmin C1 (Bittner et al. 2017, ISMIR) and Basic Pitch at
3 bins/semitone (Bittner et al. 2022, arXiv:2203.09893). → At 20 cents/bin a 50-cent error spans
2.5 bins and is visible without overlay.

**13–16.** Log-mel is what audio models are trained on — Whisper 80 bins (arXiv:2212.04356),
AST 128 bins (arXiv:2104.01778), both 25 ms / 10 ms — and with enough bins it is sufficient for
onsets and note identity: Onsets and Frames on 229 mel bins, note F1 82.3 at 50 ms
(arXiv:1710.11153); stacked short-window mels reach F 89.9% at a 25 ms onset tolerance (Schlüter
& Böck 2014, ICASSP). → Mel is the legibility panel and the onset surface; a 10 ms hop clears the
40 ms gate with 4× margin.

**17.** Slaney mel (librosa default) is linear below 1 kHz at 66.7 Hz per step, so a 50-cent
error at C4 (7.7 Hz) is one-ninth of a filter spacing (librosa 0.11 `mel_frequencies`). → **Mel
alone cannot show the 50-cent gate in the vocal and guitar fundamental range.** This is the
decisive argument for a CQT primary.

**18–19.** Sub-bin precision comes from a tracker, not the transform — CREPE 0.967 RPA at 50
cents, 0.909 at 10 cents (arXiv:1802.06182) — and even MERT bolts a CQT "musical teacher" onto
its codec model for pitch (arXiv:2306.00107). → Overlay the tracker's f0 in cents-vs-target on
the CQT; two surfaces, not one.

**How to draw it**

**20–23.** librosa's dB default is `magma`, `top_db=80` below peak; Sonic Visualiser replaces
the Hz axis with a stylised keyboard (every C shaded) and stacks notes and onsets as layers over
the spectrogram (librosa 0.11 docs; Sonic Visualiser reference 4.5). → Keyboard strip, per-image
peak normalisation, overlay is the established idiom; magma is the MIR convention but the one
VLM measurement (2) scored it below viridis, so viridis is the default and magma the alternate.

**24.** A 2026 systematic review finds spectrogram displays for vocal learning thinly evidenced
next to simple pitch-trajectory displays (Zhang 2026, DOI:10.3389/fpsyg.2026.1920074). → Always
pair the spectrogram with a pitch-contour-vs-target line.

**25–26.** Claude reads 28×28-px patches and caps at 1568 px long edge; OpenAI scales the short
edge to 768 px before tiling (Anthropic and OpenAI vision docs, 2026). → Render at exactly
1568 px wide, wide-and-short, so nothing is resampled.

**27.** VLMs average 58% on overlapping primitives but reach near-100% when marks are separated
(Rahmanzadehgervi et al. 2024, arXiv:2407.06581). → The score overlay is hollow and offset, never
superimposed on the harmonic band.

**28.** Riffusion stores its render parameters in the PNG so the image is self-describing
(`spectrogram_params.py`). → Emit render parameters as a sidecar beside the image.

**What it can honestly measure**

**29–31.** Raw spectrogram distances are near-useless perceptual proxies (magnitude L2 −0.01,
cosine −0.15 with human ratings; Kilgour et al. 2018, arXiv:1812.08466); FAD's agreement is
embedding-dependent, 0.5 to below 0.1 (Tailleur et al. 2024, arXiv:2403.17508); FAD is
distributional and CLAP measures relevance, not quality (Kader & Karmaker 2025, arXiv:2509.00051).
→ Log-mel L1 is labelled "timbre deviation, not quality"; no FAD, no CLAP on a single take.

**32–34.** mir_eval's convention is 50 ms / 50 cents (Raffel et al. 2014); SuperFlux cuts onset
false positives up to 60% on vibrato material (Böck & Widmer 2013, DAFx); SOTA onset F1 ≈ 0.88
(Joysingh et al. 2024, arXiv:2408.13734). → SuperFlux on the singing route, report 40 ms and
50 ms, ship a detector-confidence caveat, never override the MIDI-truth gate.

**35–36.** SwiftF0 reads the magnitude spectrogram with a trained model, 91.8% at 10 dB SNR at
~42× CREPE's CPU speed (Nieradzik 2025, arXiv:2508.18440); RMVPE tracks vocal pitch inside a mix
without separation (Wang et al. 2023, arXiv:2306.15412). → A spectrogram-derived pitch is
legitimate when a trained model reads it; peak-picking a mel plot is not a substitute; RMVPE when
the reference is a produced recording.

**37–38.** Objective metrics capture only limited perceptual aspects of singing (SingMOS-Pro,
Tang et al. 2025, arXiv:2510.01812); the best per-clip singing-quality predictor reaches SRCC 0.64
(Shi et al. 2024, arXiv:2411.11123). → The caveat string is part of the tool output; aggregate
across takes before comparing.

**Building it, license-safe**

**39–41.** essentia.js is AGPL-3.0 and last published 2021; Meyda is MIT but has MFCC, not mel
bands; tfjs has `stft` but no mel filterbank; `fft.js` is a MIT radix-4 FFT (npm registry and
docs). → No batteries-included library; ~200 lines of our own DSP. **Amended in build: we
wrote our own radix-2 FFT rather than taking `fft.js`, since every n_fft here is a power of
two, a zero-dependency MIT tree is easier to audit, and pure float64 is deterministic across
platforms where a WASM build is not. The finding stands; only the dependency choice changed.**

**42.** The Web Audio spec mandates a Blackman window and 0.8 smoothing on `AnalyserNode`,
reading only the most recent frames (W3C Web Audio 1.1 §1.8.5–1.8.6). → Excluded from the
analysis path; compute the STFT over the rendered AudioBuffer.

**43–46.** librosa is `htk=False, norm='slaney'`; torchaudio is `htk, None`; the mismatch is a
filed bug (pytorch/audio #1058); Whisper's log-mel is peak-relative; `power_to_db` defaults
`ref=1.0, top_db=80` (docs). → `melScale` and `norm` pinned in the zod schema; goldens from pinned
librosa 0.11 at relative tolerance ~1e-4 with `ref=1.0, top_db=null`.

**47–49.** MIT building blocks exist (`meljs`, `cqt-web`, `wavedraw`); an audio-analysis MCP
server returns paths; `OffscreenCanvas.convertToBlob()` and `pngjs` cover raster output; a 30 s
clip at 10 ms hop is 384,000 cells, so rect-per-cell SVG is out. → Raster PNG, SVG for axes and
overlay only, return shape matching `view_scored_piano_roll`.

## Architectural lock (revised 2026-09-07, Director-approved framing)

**The revision.** The first draft of this lock treated the spectrogram as a
picture the model looks at, with numbers alongside. That inverted the priority.
The evidence above says the picture is weak for a vision model and the numbers
carry the work, and this repo has already proved the better pattern: the nine
MIDI inspector tools exist because a model cannot reliably eyeball a piano roll
either, so it queries the score instead. Sound gets the same treatment. The
surface is an **audio inspector**, and the picture is tier 3.

The second change follows from the first. Rather than rendering a spectrogram
*beside* the piano roll, transcription puts audio *into* it. `scorePerformance`
takes a song and a flat `MidiNoteEvent[]` of `{ note, velocity, time, duration }`,
and `renderScoredPianoRoll` already draws per-note verdicts of correct, timing
and missed, plus ghosts for extra notes. Transcribed audio in that shape flows
through the whole existing scoring and rendering stack unchanged, over real
sound instead of captured MIDI.

```
rendered take (AudioBuffer, 44.1/48 kHz)     from the engines / a SoulX-Singer take
   |
   +-- TIER 1  deterministic numbers                        (29-38)
   |      SuperFlux onsets vs 40 ms, plus the 50 ms mir_eval figure
   |      f0 in cents vs target . RMS envelope . note names, never Hz
   |      the gates live here, no model involved
   |
   +-- TIER 2  transcription                                (12, 18)
   |      audio -> MidiNoteEvent[] -> scorePerformance -> renderScoredPianoRoll
   |      reuses the proven diff and the existing scored roll
   |
   +-- TIER 3  the picture, optional                        (1-10, 20-28)
          CQT 60 bins/oct primary . log-mel 229 secondary
          PNG 1568x784, viridis, keyboard strip, hollow offset overlay
          orientation and localisation only
```

Each tier is independently useful and ships in that order. Tier 1 runs with any
attached model including local ones, which is what makes the surface cheap.

1. **Two surfaces, not one.** The picture orients and localises ("measure 3, the D is
   smeared"); the numbers gate. No gate ever routes through the image (1–10). Mel is the
   *secondary* panel: what audio models are trained on (13, 14), fine for onsets (15, 16), blind
   to 50 cents below 1 kHz (17).
2. **Primary transform = true constant-Q**, fmin C1 32.7 Hz, 60 bins/octave, 6–7 octaves, hop
   512 @ 44.1 kHz / 480 @ 48 kHz (11, 12), dB with `top_db` 80 and per-image peak normalisation
   (21). True per-bin kernels, not a pseudo-CQT over a long STFT: at C3 a 20-cent bin is 1.5 Hz,
   which no practical FFT bin resolves. Secondary = log-mel, n_fft 2048, hop 512, n_mels 229,
   fmin 30 Hz, fmax 11,025 Hz, power → dB, Slaney (15, 43). No chromagram.
3. **Render spec.** PNG 1568 × 784 (25, 26); paged by measure range like `view_piano_roll`,
   about 6 s of audio per image (≈260 px/s, ≈4 px per 40-ms event); log-frequency y-axis over
   the notes in view (default C2–C7, ≈11–12 px per semitone); keyboard strip with every C shaded
   and named (22); beat rules at low alpha, measure rules full-height with numbers (23); `viridis`
   default with `magma` as the alternate, both exposed via `colormap`, plus `frequencyScale`
   (2, 20); colorbar off, axis labels on (2);
   score overlay as hollow 2-px outlined rectangles at half semitone height, offset just above the
   fundamental band, blue right hand / coral left hand (27); render parameters as sidecar JSON
   (28).
4. **Blind-then-overlay.** The default call renders without the overlay and the tool text asks
   the model to describe what it sees before comparing; `overlay: true` adds the intended notes
   (8, 27). Pitch in the summary block is scientific pitch notation with cents, never Hz (6).
5. **`compare_audio` numbers.** SuperFlux onsets (33) against the 40 ms gate with the 50 ms
   mir_eval figure alongside (32) and a detector-confidence caveat (34); pitch through the
   existing SwiftF0 / pYIN gate (35, 18) in cents vs target, RMVPE when the reference is a
   produced mix (36); log-mel L1 as "timbre deviation" only (29); no FAD, no CLAP (30, 31); the
   SingMOS-Pro caveat string is part of the output (37, 38).
6. **Stack.** `audio-decode` (MIT) → own STFT on our own radix-2 FFT → own mel matrix with
   `melScale: 'slaney'|'htk'` and `norm` pinned in the zod schema (43, 44) → own CQT kernels with
   `cqt-web` as the browser reference (47) → a hand-written PNG encoder (49). **Amended in build: `pngjs` was the
   recommendation, but the analysis layer reached tier 3 with zero dependencies and a
   palette PNG with stored deflate blocks is ~120 lines. Same class of amendment as the
   FFT. The finding stands; the dependency choice changed.** Goldens from pinned librosa 0.11, relative tolerance ~1e-4, `ref=1.0,
   top_db=null` (45, 46). `AnalyserNode` excluded (42); essentia.js excluded (39); tfjs and sharp
   not adopted (41, 49). Tests ship with the code, per hard-rules.
7. **Return shape** matches `view_scored_piano_roll`: temp file path, inline image block, short
   text summary of the DSP numbers — never the raw matrix (7, 48).
8. **Uncertainty gate — a P0 measurement before 2 and 3 are frozen.** No study measures a VLM
   reading a spectrogram on a *music* task, and finding 2 shows render choice swings accuracy by
   7.5 points with the MIR default not the winner. The executor runs an in-repo A/B on a
   jam-sessions task ("which measure has the wrong note / the late onset?") across three axes —
   transform {CQT-log, linear-STFT/linear-amplitude, mel}, colormap {viridis, magma}, and
   {blind, overlay} — scored against MIDI truth, before the render default is frozen. Dixit's
   ablation was ten classes of environmental sound on one model; nothing says its winner
   transfers to reading a piano take. Contrastive frame for the Director: *you
   asked for a mel spectrogram; this lock makes mel the secondary panel and CQT the primary,
   because mel cannot show the 50-cent gate below 1 kHz (17). Override if the surface is meant
   for orientation only, in which case mel-only at 229 bins is sufficient (15).*

## The render A/B, run 2026-09-07 (closes lock item 8)

**Protocol.** Four-note phrases (C4 E4 G4 C5) with one note raised three semitones at an index
chosen by a seed and written to a file the reader did not open. Rendered in four configurations,
read by Claude — the actual consumer of this MCP server, which is the seat that matters — and
scored against the hidden truth afterwards.

**Result: 2 of 2 correct**, on both the constant-Q and the mel render, reading pitch against the
keyboard strip. Trial 1 was note 2, trial 2 was note 4; both were called before the ground truth
file was opened.

**What that settles.** The render is fit for its stated purpose: a reader can locate a defect in it
and say which note is wrong. The keyboard strip is doing the work — pitches were read by measuring
against the C4 and C5 labels, and without them there would have been nothing to measure against.
Lock item 8's blocker on shipping the surface is cleared.

**What it explicitly does not settle, and this is the honest part.** It cannot decide viridis
versus magma. n=2 against a reported effect of 2.5 points is not a measurement, it is a formality,
and treating it as a decision would be the same over-claiming this arc has already committed twice.
So **the colormap does not get frozen.** Viridis stays the default on Dixit's evidence rather than
on this run's, and magma stays exposed. It also does not test 50-cent acuity: three semitones was
chosen deliberately to test legibility rather than resolution, because a reader who cannot see
three semitones cannot see anything, and the 50-cent question belongs to the pitch tracker anyway.

**One qualitative finding worth recording.** Mel rendered note SEPARATION visibly better: four
clean blocks with unambiguous gaps, against the constant-Q's ringing tails and broadband transient
streaks, which are the 2.63-second C1 kernel's time smearing made visible. That is consistent with
finding 13: mel is the legibility surface. The constant-Q's advantage is pitch precision, which
this task did not exercise. Neither displaces the other, and the tier-3 design already carries
both.

Evidence: [`assets/spectrogram-ab-cqt-viridis.png`](assets/spectrogram-ab-cqt-viridis.png) and
[`assets/spectrogram-ab-mel-viridis.png`](assets/spectrogram-ab-mel-viridis.png), both trial 2.

## What this study does not claim

- **One raster, not a raster plus an SVG overlay.** Findings 47-49 suggested keeping the axes
  and overlay as SVG over a raster spectrogram. The lock's fixed 1568x784 render makes that a
  two-file answer to a one-file problem, and the vision-pipeline constraint that motivated the
  fixed size applies to the composite image, not its layers. So the keyboard strip, gridlines
  and note overlay are burned into the same PNG, which stays self-describing through its
  sidecar. Departure recorded rather than silently taken.


- That the model can *hear* through the picture. Findings 3–6 and 10 bound what the image gives.
- A locked colormap. The canonical human colormap-accuracy study (Liu & Heer 2018) could not be
  retrieved; the only number in hand is one VLM measurement (viridis 27.5 vs magma 25.0, finding
  2), so viridis is the evidence-backed default and `colormap` stays a parameter under item 8.
- The CQT kernel papers. Schörkhuber & Klapuri 2010 and Brown & Puckette 1992 were not
  retrieved; the "true CQT" rule stands on arithmetic and on findings 11–12.

## Standards compliance (this study)

| standard | score | evidence |
|---|---|---|
| PIN_PER_STEP | 2 | Five lane prompts recorded in the session; every finding carries authors / year / title / identifier / URL; lanes on Opus, coordinator on Fable; dated 2026-09-07. Remediation: `dispatch.lock.json` next wave. |
| ANDON_AUTHORITY | 3 | Lane A halted the "gate through the image" reading before any design; lane B demoted the named mel from primary to secondary on arithmetic (17); lane E rejected the only batteries-included library on license. |
| NAMED_COMPENSATORS | 2 | No irreversible action taken (no credits, no installs, no commits by lanes). Rollback of the lock = delete this file; the readouts wave folder is removed and `load_db.py` re-run. |
| DECOMPOSE_BY_SECRETS | 3 | One question per lane, no overlap; CREPE and Dixit were the only cross-lane hits and are merged. |
| UNCERTAINTY_GATED_HUMANS | 3 | Item 8 is an explicit uncertainty gate with a contrastive frame; the not-retrieved list is surfaced rather than silently kept. |
| EXTERNAL_VERIFIER | see receipt | The dispatch ran through `roleos verify-citations` → `prism verify --type citations` on a non-Claude Ollama seat with the arXiv/DOI retrieval oracle; verdict and receipt id are recorded in the readouts wave's `verification.md`. |
