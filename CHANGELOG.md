# Changelog

All notable changes to AI Jam Sessions will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.5.0] - 2026-09-08

### Added — the live ensemble: watching the band while the music plays

v2.4.0 gave the model ears for finished recordings. This release lets it watch a performance while
it is still going, and adds one more tool to do it.

- `ensemble_now` — every instrument's held notes, how long each has been held, and the combined
  chord across the ensemble. In a duet the voices are reported separately, so a piano holding a
  triad and a synth carrying a line above it are two entries rather than one blur.

**Two channels, and the cheap one is the accurate one.** When this server performs, it knows
exactly what it sent to each engine, because it sent it. A chord is not a transcription problem;
it is three note-ons. That channel has no model in it, no inference, no confidence score, and no
latency worth naming. The obvious design would have pointed a polyphonic transcriber at the audio
to answer a question we already had the answer to — slower, less accurate, and several hundred
megabytes heavier.

Beside it runs an acoustic channel for **verification, not discovery**: each engine fans its output
into a private analysis bus, so every instrument is measured at the source with no source
separation and no ambiguity about which sound belongs to which. It is how you learn that a take
clipped, a sung line drifted off the clock, or an engine went silent while still being sent notes.
When the two channels disagree, that is a fact about the render and never a correction to the note
list.

Measured cost is about **9 microseconds per audio callback** against a 42.67 ms block, with zero
dropped samples. An instrument with no observer costs nothing, and an observer cannot break a
performance: the tap fans out of the engine's output and never sits between it and your speakers.

Latency is stated rather than implied — roughly 23 ms for pitch, 70 ms for a confirmed onset.
Onsets closer to the present than that are withheld rather than reported and later retracted.

Limits, documented because they are actionable: the acoustic tracker follows one line at a time and
will not name the notes of a chord; a layered engine's children are tapped individually and never
as a mix; and an instrument with no tap is not a silent instrument.

### Added — build your own datasets

The machinery behind this repo's datasets is now a declarable contract rather than one hand-built
experiment. Declare a task — a closed verdict set, the thresholds the answer depends on, the cases,
and the unit you hold out by — and you get SFT formatting, per-class scoring, trivial baselines over
your declared set, and a check that no holdout unit straddles the split.

`experiments/_template/` is a worked example that runs, and its README carries the contract each
rule cost something to learn: ground truth is constructed rather than written down, labels are
verified against what the tools measure, you split by the unit that leaks, and any result is
reported beside its baselines and the base model.

### Known limitation — the waveform hash is not portable across JS engines

Each acoustic record carries `wav_sha256`, the hash of the audio its recipe produces, and the
dataset card says re-rendering from the recipe reproduces the same bytes. On a different JavaScript
engine, for two of the 108 records, it does not.

The renderer calls `Math.pow` and `Math.sin` once per sample. Neither is required by ECMA-262 to be
correctly rounded, and V8's results changed between the versions in Node 22 and Node 24: of the
27,869 distinct `Math.pow(2, x)` arguments this corpus evaluates, **253 (0.91%) return a different
double**. Almost all of that disappears under 16-bit quantisation, but the `extra` perturbation of
Für Elise lands on MIDI 63, where the semitone ratio itself differs by one unit in the last place,
and its two records hash differently.

Found by running the new reproducibility gate on the full CI matrix, which is the first time it had
executed anywhere but Node 22. Every other field of every record reproduces on any engine, and the
tests now assert those two claims separately rather than one claim that is only sometimes true.

Making the waveform bit-portable means replacing the transcendentals with a fixed implementation.
That changes every waveform hash and therefore every record, so it needs a new schema version and a
republish. Not done here; the corpus is unchanged and the limitation is documented instead.

### Fixed

- **The acoustic corpus is now reproducible end to end.** Its reproducibility gate covered 109 of
  115 published paths, and three of the six it missed were never emitted by the generator at all —
  regenerating the corpus deleted `VERSION`, `CITATION.cff` and `LICENSE-DATASET.md` and produced a
  112-entry manifest where 115 are published. A full regeneration now reproduces every file and the
  checksum manifest byte for byte.
- The checksum manifest is written in the published breadth-first path order. A flat sort put
  `splits.json` after all 108 record files and silently produced a different manifest for identical
  content.
- The acoustic evaluation counted perturbation kinds while grading against gold verdicts, and
  reported a majority-class baseline naming a label no model could emit. The numbers were correct;
  the label was not. Baselines now compute over the declared class set.
- The published-schema registry knew 2 of the 12 schema versions published under `datasets/`, so it
  reported having checked collisions it had never heard of. All twelve are registered and a test
  derives the set from disk.
- A false disagreement fired on every chord, because the monophonic pitch tracker correctly refuses
  to name a period in a triad. Narrowed to a single held note.
- `play_song` reported the wrong instrument in the roster when driving a non-piano engine.

## [2.4.0] - 2026-09-07

### Added — the audio inspector: the model can measure sound, not just make it

Until now this server could render audio but never examine it. The model played, a human listened,
and the model took their word for it. Four new tools close that gap, and they are built on the
principle the repo already proved with its MIDI inspector: a model cannot reliably eyeball a
picture, so give it deterministic queries instead.

- `analyze_audio` — onsets, pitch contour and level from a WAV. Pitch in note names with cents,
  never raw frequencies.
- `transcribe_audio` — a monophonic recording as notes, with each note's deviation from concert
  pitch.
- `score_audio_take` — grade a performance against a library song **by ear**, then hand the result
  to the existing `view_scored_piano_roll` unchanged. Audio enters the scoring stack rather than
  sitting beside it.
- `view_spectrogram` — a constant-Q spectrogram with a piano-keyboard axis, optionally overlaid
  with the song's intended notes. Blind by default: it shows the sound alone and asks what you see
  before the overlay is available.

New `src/audio/` layer, dependency-free and identical in Node and the browser: FFT, windows, STFT,
mel filterbank, decibel scaling, constant-Q with sparse Brown-Puckette kernels, SuperFlux onset
detection, YIN pitch tracking with the cents gate, monophonic transcription, WAV decoding, PNG
rendering, and synthetic fixtures.

Also adds `jam-actions-acoustic-v0`, a 108-record corpus of grounded tool use over audio analysis,
whose labels are verified against what the tools actually measure rather than only against
themselves. Held out by phrase rather than by record. Not published.

Grounded in `docs/spectrogram-surface-study-2026-09.md`. The load-bearing finding: mel cannot
show a 50-cent error below 1 kHz, because Slaney mel is linear there at about 67 Hz per step while
50 cents at middle C is 7.7 Hz. So the constant-Q transform carries pitch and mel carries
legibility, and no gate ever routes through a picture.


## [2.3.0] - 2026-09-05

### Added — the score-clock vocal route (SoulX-Singer, local) — the vocal route

The Director-ratified way to put a sung line on a library song (2026-09-05). Route A below remains the live-play lead; this is how a mixed vocal is produced and proven.

- **One clock.** `scripts/build-score-clock.mjs` derives `scores/<song>.score-clock.v1.json` from the song's MIDI melody track (`--track`, `--list-tracks`) and lyrics (`--lyrics`, one token per note, syllables joined by `-`), on the **session's own timeline** — measures start when the longer hand finishes, so the bars the player actually plays (3.2–4.0 s here) rather than the MIDI's 2.4 s or `bar.dur/3`. Sample-rounded at 48 kHz; `--check` is a drift guard. `src/vocal/score-clock.ts` (+ tests).
- **A deterministic bed.** `scripts/render-piano-bed.mjs` bounces the piano offline through an injected `OfflineAudioContext` (both engines accept `audioContext`) to exactly the clock's length; live playback sleeps beat by beat and is not on the clock.
- **The singer.** [SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer) (Apache-2.0, score-conditioned, zero-shot timbre), run locally: `scripts/export_soulx_target.py` (clock → SoulX metadata; `--syllable-words` makes every syllable its own re-articulated word) and `scripts/soulx_take.py` (one take ≈ 5 s of GPU). Local patch for Windows in `scripts/patches/`.
- **The instrument.** `scripts/vocal_clock.py`: `verify` dates every vowel onset on the artifact (400–3000 Hz band, −6 dB rise) and gates |onset − t_sec| ≤ 40 ms, word order, one voice, timeline fit, sample-exact length; `pitch` gates score MIDI vs pYIN F0 at the vowel nucleus (fail > 50 c, warn > 25 c, global offset > 20 c; SwiftF0 cross-check); `repin --candidate` picks, per word, the take whose syllables are internally on the clock and cuts only between words; `place --local` splices with 50 ms crossfades (cloud `place_exact` path kept); `mix --local` gain-stages from a meter with a headroom rule; `transcribe` (ElevenLabs scribe on Comfy Cloud) for order and one-voice. **Any FAIL and it is not a mix.** Receipts under `scores/receipts/`.
- **Grounding.** `docs/vocal-singing-study-2026-09.md` — five Opus lanes: music models still cannot take MIDI (June ruling holds); ElevenLabs STS has no pitch contract (route withdrawn); SoulX-Singer refutes "only DiffSinger honors MIDI"; the pitch-gate thresholds carry their citations. Handbook: *Vocals — sing a song on the clock*.
- **Measured on the way (see `docs/vocal-clock.md`):** the kickoff's piano table was 0.8 s early from m4 (an RH-only walk); Scribe word starts are ±100–700 ms on sung audio; SwiftF0 reads a ±40 c vibrato +20 c sharp; a voiced consonant is already at the next pitch 150 ms before its vowel; a sung word is legato inside ("A"→"ma" glides Bb3→Eb4 over 180 ms), so cuts happen only between words; feeding timing errors back into the next target does not converge (stochastic, not a bias); Seed Audio cannot sing a melody or hold a note, whatever the prompt.

### Added — score-locked sung lead (Route A)

- **`--lyrics` / `--lyrics-file` on `play`** (and `play_song.lyrics`) align English lyrics to the right-hand melody: vowel nucleus on the MIDI beat, onset consonants in the preceding gap, leftover duration on the nucleus, diphthong split on long notes, leftover notes as melisma. The additive vocal-synth engine renders that score; `synth`/`vocal`/`tract` engines are not used as the lead when lyrics are set (they become piano accompaniment).
- First slice: `ai-jam-sessions play amazing-grace --lyrics "Amazing grace how sweet the sound" --measures 1-8`.
- Sung melody is octave-placed into G3–E4 so F0 stays under front-vowel F1. Default voice is `kokoro-af-heart`; extra phrase vibrato is off. `--measures` with lyrics plays the range **once**, not a loop.
- Live lead is mixed on the **same AudioContext as the piano**. The renderer is **Pink Trombone** (LF glottis + waveguide), not vocal-synth-engine's additive Kokoro tables — those are a vowel instrument and were the metallic shriek.
- **Breath is context:** a tank that fills only after a brief pause (~0.45 s catch-breath, professional ~14 s phrase) and thins the tone as it empties (Klatt aspiration, Prame vibrato-rate rise, small F0 residual). Opening rests are inhales.
- **Amazing Grace sings New Britain** (Eb: Bb–Eb–G…), not the piano arrangement's chord tops. `play amazing-grace` uses the first-verse lyric line without `--lyrics`.
- **Lead path is fx-dub CAST/LOCK/PERFORM:** a locked Kokoro take is pitch-shifted onto the MIDI (`src/vocal/voice-changer.ts`). Set `JAM_KOKORO_LOCK_WAV`. Tract/additive are not the singer. Kokoro is local Apache TTS (not Comfy Cloud).
- **`--out file.wav`** (with `--lyrics`) writes the score-locked lead offline (`--svs-backend dsp`, default). `--svs-backend diffsinger` refuses until `DIFFSINGER_ROOT` is a commercial-safe OpenVPI pin (Route B).
- **`generate-song`** is the ACE-Step / DiffRhythm / YuE side door — it **refuses to run as a play engine** because those models cannot honor library MIDI (Route C).
- Route D (DSP dry + SVC timbre) is a handoff only — not in this package (AGPL / F0-from-audio; see the vocology-knowledge Route D note in the private readouts repo).

## [2.2.0] - 2026-08-20

**The release where the instrument got real ears and a listening room.** Every prior release played through synthesized approximations; this one ships a sampled Concert Grand as the default piano and a blind listening room — the Composition Panel — where the composition engine's output is ranked by ear under real listening-test discipline. Around them: a full health pass, receipted public-domain re-sourcing of two library works, and a stranger-test hardening pass over the packed artifact.

### Added — the sampled Concert Grand

- **`sample` is a first-class server engine and the default when a pack is installed** (`samples/AccurateSalamander` or `AI_JAM_SAMPLES_DIR`); the npm tarball stays sample-free by design. The oscillator piano remains the zero-dependency fallback, now with velocity-shaped brightness (a 1.4–7.2 kHz velocity lowpass) and a gentler master compressor on both synthesis doors.
- **The cockpit ships its own pruned pack** — 90 OGGs (30 roots at minor-third spacing × 3 velocity layers, ~8 MB) regenerable via a deterministic pruner script with a full provenance manifest (source archive sha256, encoder settings, per-file map). Loads on the first user gesture, plays through the synth's own output chain, falls back seamlessly, and reports its state via `window.__cockpit.samplerState()`. Only the Concert Grand preset routes to samples — the other nine voices keep their synth characters. Samples: Salamander Grand Piano by Alexander Holm, CC-BY 3.0, credited in-app and here.

### Added — the Composition Panel (cockpit)

- **By ear** — blind pairwise A/B auditions of the composition engine's voicings over real library melodies: reference/A/B clips offline-rendered through the *real* voice path and loudness-matched (attenuate-only, ≤0.5 dB RMS, offsets recorded per trial); seeded, shuffled trial lists with hidden floor catch-trials; Bradley-Terry rankings with bootstrap CIs; a MUSHRA-style >15% post-screen; PROVISIONAL until every pair meets its vote budget and UNINTERPRETABLE when the floor gate fails — first-class outcomes, not errors. Matched-playhead A/B switching with keyboard control; runs persist beside (never inside) the score and export as JSON.
- **Local models** — the same ranking run by locally installed cross-family LLM judges (one seat per model family; the generator's whole lineage, embedding models, and cloud-routed tags never judge), with per-seat failure marked honestly and never substituted. **History** lists both run kinds; **Compare** reports Kendall τ-b and engine-rank match between a human run and an LLM run, naming a PROVISIONAL or UNINTERPRETABLE human side for what it is.
- The panel's engine system honors the maker contract: the local model's voicing spec is repaired by the part-at-a-time refiner before it competes.

### Added — the composition engine (`src/compose/`)

- A deterministic voice-leading gate with a style-invariant hard floor plus named style presets (`common-practice`, `lead-sheet`, `film-ambient`), membership-by-construction voicing specs, a part-at-a-time refiner, best-of-n scoring, and the **`compose_panel`** MCP tool — a blind cross-family ranking panel with the discrimination-floor gate (directional signal only, never a quality score).

### Changed

- **Long tool calls stream progress**: `compose_panel` emits MCP progress notifications from the first second (realization and per-judgment start events plus completions), so default 60-second clients survive multi-minute runs instead of timing out.
- **Errors teach**: invalid tool inputs return the protocol's `-32602` with messages that name the field, the expected shape, and an example (`notes must be an array of MIDI numbers, e.g. [60, 64, 67]`); `verify_harmony`'s failure paths join the structured `{code, message, hint}` envelope its siblings use; provoked CLI failures print `Error [CODE]` + `Hint:` with non-zero exits.
- **The tarball ships user docs, not the project's process history** — packed size 6.8 → 4.9 MB, held by a pack regression test.
- **Satie Gymnopédie No. 1 and Debussy Arabesque No. 1 re-sourced from Mutopia public-domain bytes** with receipts (license page, archive sha256, typesetter credit) after the original arrangement provenance could not be verified; the frozen musical baselines were proven unchanged (120/120 songs, 12,982/12,982 implied-chord labels identical).
- A full health pass closed 45 findings across four audit stages — dependency/security currency, proactive hardening, humanized user-facing strings, and a look-preserving visual amend of the cockpit (design tokens, 24 px hit targets, focus-ring clearance, truncation, a Panel responsive breakpoint, and the CC-BY credit made visible on desktop).

### Tests

- 2,506 → **3,033 passing (1 skipped)** across the server, cockpit, compose engine, panel machinery, pack integrity, and eval harnesses.

## [2.1.0] - 2026-07-22

**The release where the analyst became a maker.** The finetune line proved the model can *analyze* music through grounded tools; this release ships the loop that lets it *make* music under the same discipline. A model proposes a reharmonization; the platform's own deterministic tools gate it — the chord engine must confirm every intended voicing, every melody note is labeled against the new harmony — and only a verified interpretation goes on to be saved, played, and seen. Generation verified by construction: no rubric, no self-grading, no forced-choice proxy.

### Added — the maker loop (generate → verify → play → see)

- **`verifyHarmony`** (`src/maker/verify-harmony.ts`, exported from the package root) — deterministic verification of a proposed reharmonization against a melody, productionized from `scripts/maker-loop-demo.ts`. Four checks, one structured verdict: **chord fidelity** through the same `inferChord` that powers jam briefs (canonical pitch-class comparison, so `D#7` ≡ `Eb7`; hard gate), **melody consonance** (chord-tone / named-tension / chromatic labels with a configurable chromatic ceiling, default 0.2; hard gate), **bass voice-leading** (semitone moves, max leap, stepwise ratio; informational), and **key membership** (raised-7th-aware in minor keys; informational — borrowed tones are flagged, never failed). The verifier vocabulary is exactly what the chord engine can detect — the deterministic instrument's vocabulary is the measurement boundary, by design.
- **`verify_harmony` MCP tool** — the maker loop's verification gate. Verify against a library song's melody (`songId` + `measures` range; the song's key auto-applies) or an inline melody. ✅ routes to `add_song` → `play_song` → `view_piano_roll`; ❌ routes back to revision. MCP tool count 46 → **47**.
- **`maker_loop` prompt template** — the whole loop as a guided prompt: jam brief → propose → verify → save → play → see. Prompt templates 3 → **4**.
- **Jam briefs now route through the gate** — `ai_jam_sessions` brief instructions direct every reinterpretation through `verify_harmony` before `add_song`, and end at `view_piano_roll` so the maker sees what it made.
- `parseMeasureRange` exported from the songs module (shared by the jam brief and the new tool).

### Added — the E2 continuation gate (eval harness + receipts, not in the npm package)

- **`src/dataset/eval/model-continuation.ts`** — wires the locked, preregistered, never-used future-model slot of the E2 phrase-continuation eval (`FUTURE_MODEL_GROOVE_MARGIN = 0.15`): grooveOA(model, gold) minus grooveOA(shuffled, gold), with bar-number anchoring (Bar_1-relative and absolute-numbered continuations score identically), not_computable as a first-class result, and an aggregate that separates the all-pairs clear rate from computable-subset means. 12 unit tests pin the anchor identities (model ≡ gold → margin = headroom; model ≡ shuffled(gold) → margin = 0 exactly).
- **`scripts/e2-continuation-gate.ts`** — the maker arc's $0 pre-training gate: pins the sealed 22-pair cohort by ID, ANDON-halts unless the shuffled control reproduces the sealed artifact (observed max |Δ| = 0), reports per-pair *headroom* (max attainable margin), and runs generators through the unchanged sealed E2 machinery (system prompt, tolerant parser, FM-4 retry, seeded sampling). Plus `scripts/e2-gate-summary.ts` for the receipted results table.
- **Gate outcome (the $0 catch):** *nobody* clears the locked bar — not base qwen2.5:7b, not the ten frozen jam-ft adapters, not a Claude ceiling run composed from prompt-only briefs. Cause: 9/22 pairs have headroom < 0.15 (three at exactly 0), and the shuffled-bars control inherits the gold performance's rubato micro-timing, so the bar rewards verbatim performance cloning over musical continuation. Verdict per the preregistered decision matrix: **fix the task/bar before spending** — no training arc fires on this instrument. Full report: `docs/maker-arc-e2-gate-report.md`.
- `OllamaBackend` accepts opt-in generation options (seed / temperature / num_predict) forwarded as the `/api/chat` `options` field; prior callers are byte-identical. `synthTimedEventsFromRemi` + `E2_SYSTEM_TEXT` exported for the gate.

### Fixed

- **`inferChord` now understands "+"-joined simultaneous notes** ("C3+E3+G3:q" — the chord notation MIDI ingest emits). It previously tokenized on whitespace only, so the whole voicing arrived as one unparseable token and jam briefs for MIDI-ingested songs showed `N/A` in the implied-chord column. `verifyHarmony` had pre-expanded "+" to spaces as a workaround; that adapter is gone — the engine takes the notation natively.
- **`computeContour` now follows the top tone of "+"-joined chords.** Chord tokens previously failed the single-note parse and were silently dropped, so a chord-heavy MIDI-ingested right hand always read `static` in the jam brief's melody outline. Each chord now contributes its highest note — the melody voice, the same rule the sing-along contour mode already uses — so those songs get real contours. (Deliberately not a naive token split: that would have read one chord's simultaneous notes as a melodic run.)

## [2.0.0] - 2026-07-11

**The release where the dataset proved its discipline — twice.** The headline is a breaking engines bump (Node 22), but the story is the fine-tuning arc the dataset was built to enable: a preregistered v0 run that returned an honest negative, a v1 data pass with execution-verified grounding traces that moved the primary metric +0.20 — and a frozen honesty rule that still withheld the victory claim at 12/16 paired wins against a ≥13/16 bar. Both receipted reports ship in `docs/`. Along the way, the v1 pipeline's execution gate caught a real defect in the published dataset's Bach records, now fixed in the working set with full errata.

### BREAKING

- **Node.js floor rises 20 → 22** (`node-web-audio-api` 2.0). `engines.node >=22.0.0`; Node 20 installs will refuse. No API changes — the MCP tool surface, CLI, and cockpit are unchanged.

### Fixed

- **Library: 12 song `key` fields corrected to content-detected keys** (PR #21), and `songs/**` edits now trigger CI (they previously drew no CI at all).
- **Dataset working set — revision r001:** `bach-prelude-c-major-bwv846:m061-064` retargeted to `m061-062`; the record's window, tool-call args, and annotation anchors overshot the 62-measure reality of BWV 846 (prelude mm. 1–35 + fugue mm. 36–62). Found by the v1 fine-tune pipeline's new live-server execution gate; the sealed published package (v0.4.3) is untouched and its checksums + release gate keep passing. [Erratum 001](docs/jam-actions-v0-erratum-001-bach-m061-064.md).
- **Dataset working set — revision r002:** all 16 Bach records' prose corrected to MIDI-derived ground truth (the old text narrated an imagined 64-measure prelude — wrong pedal spans, wrong chord letters, fugue miscast); every corrected claim is re-derived from the MIDI at revision time and red-tested. The corpus builder now carries an ANDON guard: any phrase window past a song's ingested length fails the build. [Erratum 002](docs/jam-actions-v0-erratum-002-bach-annotation-prose.md). Both revisions land in the next public dataset cut (v0.5.0).

### Changed

- Dependency wave: `@modelcontextprotocol/sdk` 0.109, `ajv` 8.20, `zod` 4.4.3, `tsx` 4.23; dev-infra majors TypeScript 6.0.3, Vitest 4.1.10, `@types/node` 26.
- Release workflow: pnpm 10 in both Docker stages; publish job is rerun-safe.
- `play_song` end-measure overshoot on library songs remains a hard error by design (review upheld the read-lenient/act-strict split vs `view_piano_roll`) — the defective dataset call that surfaced this is fixed at the source instead (r001).

### Added — the fine-tuning story (docs + receipts, not in the npm package)

- **v0 arc** (`docs/finetune-arc-eval-report.md`): 5-seed Qwen2.5-7B LoRA on the 78 jam traces — *honest negative*, tool-grounded QA 0.661 → 0.601. Preregistered, sealed-baseline-scored, fully receipted.
- **v1 arc** (`docs/finetune-arc-v1-eval-report.md`): 494-example data pass (user-turn paraphrases with frozen calls, 9-family execution-verified grounding traces, base-distribution self-rehearsal) — *directionally better, underpowered*: 0.661 → 0.863 (+0.202, perm p = 0.0043, all 5 seeds above baseline, unseen song +0.433), withheld from a victory claim by the preregistered 13/16 paired-wins bar (observed 12/16 + 1 tie). No adapter publishes; the discipline is the product. Preregistration + amendments: `experiments/finetune-arc-v1/P0-LOCK.md`.

## [1.5.0] - 2026-07-10

**The release where it learned to teach.** The library is fully annotated (120/120 songs, was 24), the teaching loop is closed end-to-end (metronome → recording → scoring → marked-up score → practice loops), and the browser cockpit became a real composition tool — live on the web. Tests 1513 → 2506. Every feature decision below traces to a research-grounded, externally-verified design dispatch (`docs/feature-pass-v1.5-dispatch.md`, 86 citation-gated findings); every wave passed an adversarial verification lens before merging.

### Added — the teaching loop
- **MetronomeEngine** — accented beat 1, synced to the session's effective tempo and time signature, with a configurable count-in (default 1 bar) and click-only-during-count-in mode.
- **Live recording on both playback paths** — `play_song` gains `metronome`, `countIn`, and `record`; recordings carry a scoring-grade time contract (nominal song-time on the session path, so mid-take speed changes stay exact).
- **`practice_loop` / `practice_status`** — the drill a real teacher assigns: loop a measure range slower, score every pass, ramp tempo (+5%) only after a *clean* pass, with task-focused per-measure diagnostics and micro-goals.
- **`score_last_take`** — score the most recent recorded take with per-note verdicts (`noteVerdicts` on `PerformanceResult`, timing windows scaled as percent-of-beat with a 50 ms floor).
- **`view_scored_piano_roll` / `renderScoredPianoRoll`** — the marked-up score: per-note verdicts in a colorblind-safe Okabe-Ito palette with shape redundancy (solid = correct, dashed = timing, ✕ = missed), plus a "Focus: mm. X, Y, Z" practice hint ranking the worst measures.
- **CLI**: `play --metronome/--count-in/--record` and the new `practice` command; the first `cli.test.ts` (the CLI had zero direct tests).
- MCP tool count: 42 → **46**.

### Added — the cockpit became a composition tool (live at `/ai-jam-sessions/cockpit/`)
- **Beat-based time model** — notes store musical time (beats), so the BPM control genuinely retimes playback (previously it changed nothing but the gridlines); lookahead scheduling on the audio clock; localStorage schema v3 with automatic migration of saved scores at their own saved tempo.
- **Transport surface** — click-to-seek time-ruler (keyboard-accessible slider), drag-to-set **loop regions** with sample-exact wrapping, real pause (position + playhead preserved), auto-scroll following the playhead (reduced-motion aware).
- **Record-arm capture** — QWERTY / on-screen keys / Web MIDI land in the score: 1-bar count-in, looper-model overdub across loop cycles (REPLACE as a visible toggle on the arm button), raw performance timing preserved beneath the quantized view, every pass one undoable unit peelable mid-record.
- **Undo/redo** — a linear command stack over every edit including Clear and Import (their confirm() dialogs retired in favor of undo + toast), gesture-coalesced drags, id-preserving restore.
- **Multi-select + clipboard** — Select/Draw tool toggle (momentary hold, layout-independent physical key), marquee + platform-standard modifier clicks, copy/cut/paste-at-playhead, Duplicate, group operations as single undoable commands.
- **Touch + accessibility** — Pointer Events with capture and cancel-rollback on every gesture surface, Esc-cancels-drag, ≥24 px hit targets, tap-to-relocate Move mode (the WCAG 2.5.7 non-drag alternative), Shift+Arrow resize, velocity bars on notes, audible pitch preview on edits.
- **Deployed to GitHub Pages** — the cockpit ships live from the Pages workflow with its own frozen-lockfile workspace.

### Added — the library and its analysis harness
- **120/120 songs annotated** (was 24/120) — four staged harvest waves + a legacy uplift, each annotation grounded in deterministic per-song analysis and gated ≥80 on the repo's own exemplar rubric, then adversarially fact-checked (measure numbers, chord windows, structural counts verified against the actual MIDI). First-draft failure rate fell 55.6% → 7.4% → 3.7% → 0% across the waves as the discipline compounded.
- **Analysis harness** (`scripts/annotate-batch.ts` + three new lenses): windowed pitch-class chord detection (triads + sevenths, confidence-gated per texture/genre, rootless shells hedged as implied), transposition-aware repetition candidates (interval n-grams, evidence-graded), section detection (self-similarity novelty → suggested practice segments), and **content-based key detection** — which exposed unreliable `key` metadata across the library and now grounds every harmony claim in what the notes actually say.
- **Library data audit** — six fragment source files replaced with identity-verified full transcriptions (three were loops of *unrelated* songs at origin, including a literal `mario2.mid`); provenance recorded per song; a corrupt 512-BPM source tempo that silently dropped a song from the registry fixed.

### Added
- `pnpm-workspace.yaml` with esbuild build-script approval — fresh clones on pnpm 10/11 can now run `pnpm verify` without interactive `approve-builds`.
- `datasets/jam-actions-v0/PROVENANCE-NOTE.md` — documents the working-corpus/published-subset boundary, the two excluded unverified-provenance works (Satie Gymnopédie No. 1, Debussy Arabesque No. 1), and the MIT-code / CC-BY-SA-3.0-DE-dataset license boundary.
- **Hugging Face mirror published** — the jam-actions-v0 dataset is live at [`mcp-tool-shop/jam-actions-v0`](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0) (the long-deferred token-scope issue resolved).
- Health pass (dogfood swarm stages A–D): bug/security fixes, proactive hardening, humanization (responsive layouts, structured errors, reconnect feedback), and the Claude Design brand identity (real logo, banner, og-card, learning-loop diagram).
- `src/stdio-supervisor.ts` — quarantines native-audio fd-1 writes so MCP stdio framing survives headless environments.

### Changed
- **CI runs pnpm 10 across all workflows** (main matrix, dep-audit, cockpit, release, dataset publish); `pnpm/action-setup` pinned to the peeled v6.0.9 commit; the legacy `package.json` `pnpm.overrides` field removed (overrides live in `pnpm-workspace.yaml`, their single home).
- `engines.node` raised to `>=20` (health pass).
- The dataset checksum verifier's manifest-completeness check counts a prompt/continuation pair as two records (the shipped data was always correct; the checker's sum was wrong and blocked publish pre-flights).
- `hoochie-coochie-man` difficulty `beginner` → `intermediate` (its replacement source is a full 51-measure 12/8 band transcription).

### Fixed
- Public-surface accuracy pass (dogfood swarm Stage A): dead unscoped `ai-jam-sessions` install commands replaced with `@mcptoolshop/ai-jam-sessions` on the handbook (getting-started, beginners) and the landing-page config card + npm link; dataset composer list corrected to the actual 6 composers on README/CHANGELOG/landing/handbook; the handbook's provenance table rebuilt from the shipped records (it listed three works that have never been in the subset); README Status un-stuck from v1.4.1; cockpit access story and Sample Piano availability made honest; SECURITY.md network/credential claims scoped to distinguish the default MCP/CLI paths from the opt-in dataset/eval tooling; codecov badge removed (no coverage data has ever been uploaded behind it).
- `version.test.ts` NAME assertion updated for the scoped package name (post-v1.4.3-tag repair, recorded here for the audit trail).

## [1.4.3] - 2026-05-19

**npm-recovery release.** Restores the package to npm under the `@mcptoolshop/ai-jam-sessions` scope after the v1.4.0 unscoped publish was unpublished a month ago. The v1.4.2 publish attempt under the unscoped name hit npm's E409 packument-save race (the known "first-publish-of-recently-unpublished-name" failure mode); rather than wait out the cooldown, this release migrates to the scoped name that previously hosted v1.3.0 (per the v1.3.1 changelog entry). The scope is now fresh territory on npm (404 at lookup time), so this publish completes cleanly.

### Changed
- **Package renamed** from `ai-jam-sessions` (unscoped) back to `@mcptoolshop/ai-jam-sessions` (scoped). The bin entries (`ai-jam-sessions`, `ai-jam-sessions-mcp`) are unchanged — users install with `npm install -g @mcptoolshop/ai-jam-sessions` and run `ai-jam-sessions <command>`.

### Notes
- No functional changes vs v1.4.2. Same MCP server, same 41 tools, same dataset publication state (Zenodo DOI `10.5281/zenodo.20279919` published in v1.4.2).
- v1.4.2 GH Release remains valid as the canonical record of the Zenodo publication event; its npm publish attempt is permanently failed and won't be retried. v1.4.3 is the canonical npm artifact.
- HuggingFace mirror still deferred (token scope, see v1.4.2 entry).

## [1.4.2] - 2026-05-19

**Publication event.** `jam-actions-v0` v0.4.3 is now publicly published on Zenodo with DOI [`10.5281/zenodo.20279919`](https://doi.org/10.5281/zenodo.20279919). This is the canonical citation handle going forward. The dataset content is unchanged from v1.4.1; this release captures the publication state.

### Added
- **Zenodo DOI minted** — `10.5281/zenodo.20279919`. Record at https://zenodo.org/records/20279919. Two archive files attached (`.tar.gz` + `.zip`, both with SHA-256 sums recorded in `publication-receipt.json`).
- **`.github/workflows/publish-jam-actions-v0.yml`** — operator-mediated publication workflow. Manual trigger only (`workflow_dispatch`). Three modes: `draft-only` (safe), `publish-zenodo-only`, `publish`. Irreversible actions gated by `confirm_irreversible=yes-mint-doi` input. Tokens (`ZEN_TOKEN`, `HF_TOKEN`) come from GitHub Secrets — never echoed, never written to files.
- **`.github/workflows/push-jam-actions-v0-hf.yml`** — HF-only recovery workflow for partial publish runs. Used when Zenodo half succeeded but HF push needs re-trying.
- **`datasets/jam-actions-v0-public/publication-receipt.json`** — machine-readable record of the publication state: Zenodo DOI, archive SHA-256s, HF status (deferred), provenance, doctrine compliance. NO tokens, NO secrets.
- **DOI added to `CITATION.cff`** with Bernd Krueger as second author (matching the share-alike chain). Also adds `identifiers` and `url` fields per CFF 1.2.0 spec.
- **DOI badge in main README hero** (Zenodo's standard SVG badge).
- **Citation line in main README's Training Dataset section** plus DOI row in the dataset stats table.
- **`RELEASE_NOTES.md` annotation** under v0.4.3 documenting the Slice 25 publication event.

### Deferred
- **HuggingFace push** to `mcp-tool-shop-org/jam-actions-v0` is deferred to a v1.4.x patch. The `HF_TOKEN` fine-grained token granted write access to the personal namespace only, not to the `mcp-tool-shop-org` org namespace on HuggingFace. Recovery is a 5-minute token re-scope + workflow re-trigger. See `publication-receipt.json` for the next-steps block.

### Doctrine compliance
- Publication was operator-mediated end-to-end. The Phase B 7-line gate format from the Slice 25 kickoff was presented before any irreversible action.
- No tokens entered Claude's context, no tokens appeared in any log, file, or chat message — tokens lived in GitHub Secrets only.
- Pre-flight verifiers (checksums + release-gate CLI) ran inside the workflow before any irreversible API call.

## [1.4.1] - 2026-05-19

This is a publication-readiness release — no new MCP server functionality. It integrates the **jam-actions-v0** training dataset (built across 24 named slices) into the repo's marketed surface, ahead of public Zenodo + HuggingFace publication.

### Added
- **`jam-actions-v0` dataset (public subset)** — 115 records across 8 classical piano works by 6 composers (Bach, Beethoven, Chopin, Debussy, Mozart, Schumann; an earlier version of this entry misattributed the works to a list including Schubert, Mendelssohn, and Tchaikovsky — corrected 2026-07-09), pairing 4-measure phrase windows with annotated teaching targets and multi-turn MCP tool-use traces. CC-BY-SA-3.0-DE. Version `0.4.3`. Lives at `datasets/jam-actions-v0-public/`.
- **7-axis release gate** for the dataset (axes 1–6 blocking, axis 7 reporting). Axes 2 and 6 admit a `ceiling_saturated_pass` bucket so trivial-ceiling records do not dilute harder strata. Slice 22 baseline PASSES; Slice 19 baseline still FAILS (kept as a regression diagnostic).
- **9-tool MIDI inspector surface** for grounded tool-use over symbolic music: `get_events_in_measure`, `get_events_in_hand`, `count_distinct_pitch_classes`, `count_notes_with_pitch_class`, `count_beat_1_onsets`, `get_pitch_at`, `get_hand_balance`, `find_highest_pitch`, `find_lowest_pitch`.
- **Cold-start reproducibility** — `.gitattributes` pins LF for `*.sha256` and `datasets/jam-actions-v0-public/**` so Windows / macOS / Linux / WSL contributors get reproducible checksums. `parseChecksumsManifest` strips trailing `\r` as defense in depth. `scripts/check-release-gate.ts` rejects unknown / multiple positional args.
- **Publication metadata** — `zenodo-metadata.json` (13 fields, ISO 639-3 language code), `CITATION.cff`, `RELEASE_NOTES.md`, `ATTRIBUTION.md` with HITL annotation provenance, `hf-dataset-card-check.md` (post-polish: 0 unresolved WARN), polished HF dataset card YAML frontmatter (`license`, `language`, `task_categories`, `tags`, `configs`, `pretty_name`, `pretty_description`, `multilinguality`, `source_datasets`, `annotations_creators`, `language_creators`).
- **Archives** — `.tar.gz` and `.zip` publication archives (built by Slice 24).
- **README marketing surface** — new `## Training Dataset` section, hero badge, "What is this?" teaser, Status section update.
- **Landing-page integration** — new `training-dataset` features section + `dataset-quick-start` code-cards section on the public landing page; 7th feature card on the "What makes it tick" panel; meta-description and hero-description acknowledging the dataset.
- **Handbook page** — `site/src/content/docs/handbook/training-dataset.md` (sidebar order 6) covering the 24-slice build arc, 7-axis release gate, 9-tool inspector surface, provenance audit, and cold-start reproducibility.
- **GitHub topics** — `dataset`, `tool-use`, `huggingface-dataset`, `symbolic-music` (12 → 16 topics).
- 1513 vitest tests covering the MCP server + dataset packagers + eval harnesses + release-gate validator (all passing).

### Changed
- **Repo description** updated to surface the dataset alongside the MCP server.
- **`pretty_name`** in the HF dataset card now reads `"AI Jam Sessions — Tool-Use Traces v0 (Public Subset)"`.

### Provenance and exclusions
- Two compositions present in the full source corpus — Satie Gymnopédie No. 1 and Debussy Arabesque No. 1 — are NOT in the public subset because their piano-midi.de URL provenance could not be verified during Slice 2.5 audit. The honest call was to ship what could be defended.
- The MIDI arrangements are by Bernd Krueger (piano-midi.de), licensed CC-BY-SA-3.0-DE. The annotations, traces, and eval artifacts are by the AI Jam Sessions team, released under the same license to preserve the share-alike chain end-to-end.

## [1.4.0] - 2026-04-05

### Added
- **7 new MCP tools**: `server_info`, `validate_song_entry`, `transpose_song`, `list_sections`, `add_section`, `preview_teaching_cues`, `mute_hand` (34 → 41 tools)
- **3 MCP prompt templates**: `annotate_song`, `practice_plan`, `performance_review`
- Song transposition — shift any song up or down by semitones with key signature update
- Section markers — structural navigation (Intro, Verse, Chorus, Bridge) on songs
- Per-hand mute/solo — isolate left or right hand during practice sessions
- Teaching cue preview — see all teaching notes and key moments before playing
- Session state persistence — last completed session survives server restarts
- `import_midi` now documents output format in tool description
- `play_song` supports `syncMode` parameter (concurrent vs before) for voice timing
- `initializeFromLibrary` returns structured `InitReport` with error details
- 76 new MIDI ingest tests, 14 transposition tests, 3 mute tests, 5 library edge case tests

### Changed
- Humanized all MCP error messages — conversational tone replaces robotic responses
- Defensive coding improvements across all sound engines (graceful degradation, operator warnings)

## [1.3.1] - 2026-04-05

### Changed
- **Package renamed** from `@mcptoolshop/ai-jam-sessions` to `ai-jam-sessions` (unscoped on npm)

### Added
- 190 new tests (392 → 582): songs loader, jam brief, library, playback controls, registry filters, MIDI parser edge cases, vmpk mock, vocal carriers
- Measure range validation in `list_measures` and `sing_along` MCP tools (now returns error instead of empty results)
- Handbook updated with all 34 MCP tools including Score category (`score_performance`, `score_annotation`, `compare_songs`, `annotation_progress`)

### Fixed
- Handbook tool count (31 → 34) and missing v1.1.0/v1.2.0 tool documentation
- Landing page feature list updated to reflect 34 tools

## [1.2.0] - 2026-04-02

### Security
- Fix ineffective path traversal guard in MCP `play_song` and `import_midi` tools (directory containment check)
- Fix XSS vulnerability in guitar tab HTML output (`</script>` breakout)
- Fix command injection risk in CLI `openInBrowser` on Windows
- Fix prototype pollution via `JSON.parse` in `add_song` MCP tool
- Docker container now runs as non-root user

### Added
- Per-hand scoring breakdown (`breakdownByHand()`) — identifies weaker hand with actionable feedback
- Journal now captures performance scores (grade, pitch accuracy, timing, completeness)
- Composer filter on `list_songs` MCP tool
- Key signature and composer search filters on song registry
- `play_song` response now references `playback_status` for progress monitoring
- `version` CLI subcommand
- Consistent "song not found" errors across all CLI commands with `list` suggestion
- New test coverage: errors (19), chord-detect (24), journal (19), per-hand scoring (14), registry filters (13)
- Long-term roadmap Tier 1: metronome, recording pipeline, practice loops, scored piano roll overlay

### Fixed
- PlaybackController engine reuse on resume (was recreating engine every play)
- Untracked noteOff timeouts leaking after stop/pause
- Voice re-trigger leaking old voices in vocal-synth-adapter
- Time signature denominator ignored in performance scoring (6/8, 3/8 now correct)
- Journal entry counting (was undercounting due to delimiter mismatch)
- `stopActive()` race condition (now properly async with await)
- Vocal synth preset resolution from wrong working directory
- Math.max/min spread stack overflow on large MIDI files
- Duplicate npm publish workflow (removed publish.yml, release.yml handles both)
- Stale tool counts across 6 doc files (31/35 → 34)
- Docker image missing vocal carrier samples

### Changed
- Engine connection errors now use structured JamError with actionable hints
- Layered engine has fault isolation (one engine failure doesn't kill others)
- Teaching hook composition has error isolation (one hook failure doesn't skip others)
- PlaybackController listener errors are now logged (were silently swallowed)
- Dep audit in CI now fails on high/critical vulnerabilities (was no-op)

## [1.1.0] - 2026-03-19

### Added
- `score_performance` MCP tool — MIDI play-along assessment with pitch accuracy, timing, and completeness scoring
- `score_annotation` MCP tool — annotation quality scoring across 5 dimensions (completeness, depth, specificity, teaching value, musical vocabulary)
- `compare_songs` MCP tool — cross-genre pattern recognition via cosine similarity of pitch class distributions, interval profiles, key relationships, and structural forms
- `annotation_progress` MCP tool — track annotation quality and progress across the entire song library
- Vocal carrier WAV files (11 formant-synthesized tones, C2–C7) now ship with npm package
- Annotation persistence — `annotate_song` now saves to user directory (`~/.ai-jam-sessions/songs/`) so annotations survive package updates

### Fixed
- Vocal engine NOTE_OFFSETS bug — removed bogus `es: 3` and `bs: 11` duplicates that mapped to wrong MIDI pitches
- Vocal sample engine and vocal synth engine now load correctly at runtime
- Annotation scorer bar-reference pattern now matches plural forms ("Bars 1–8")
- Annotation scorer chord/note patterns now match prose references ("C major", "E-D#-E")

## [1.0.0] - 2026-02-27

### Added
- Structured error class (`JamError`) with code, message, hint, cause, retryable
- SECURITY.md with vulnerability reporting policy and data scope
- Threat model section in README (data touched, data NOT touched, permissions)
- `verify` script in package.json (typecheck + test + build + smoke)
- Coverage reporting with `@vitest/coverage-v8` and Codecov badge
- Dependency audit job in CI
- SHIP_GATE.md and SCORECARD.md for product standards tracking

### Changed
- Top-level CLI error handler now uses structured error output
- MCP server fatal error handler no longer exposes raw stack traces
- Promoted to v1.0.0 — all Shipcheck hard gates pass

## [0.3.1] - 2026-02-27

### Added
- Guitar engine, tab editor, physically-modeled guitar voice
- Practice journal and session persistence
- Browser cockpit improvements

## [0.2.1]

- Dark-themed landing page (static HTML, GitHub Pages)
- New logo banner across all READMEs
- Rewrite all 7 translated READMEs (ja/zh/es/fr/hi/it/pt-BR) for v0.2.0 feature parity
- Add .nojekyll for reliable Pages deployment

## 0.2.0

- Rewrite all 12 genre exemplar annotations with deep musicalLanguage — historical context, bar-by-bar structural analysis, 5 key moments, 5 teaching goals, 5 style tips (including vocal guidance) per song
- Browser cockpit: dual-mode piano roll (instrument/vocal), 20 voice presets (15 Kokoro + 4 tract + choir/synth-vox), 10 instrument voices, note inspector with per-note vowel/breathiness editing
- 7 tuning systems (equal, just major/minor, Pythagorean, meantone, Werckmeister III, custom) with adjustable A4 reference and interval tester
- LLM-facing score API (`window.__cockpit`) — exportScore, importScore, addNote, play, stop, panic, setMode, getScore
- Formant vocal synthesis engine with 20 browser-side presets and 5 vowel shapes per voice
- Score import/export panel for full JSON round-tripping
- Rewrite README and docs landing page to reflect all features
- 24 MCP tools (up from ~15), 5 sound engines, layered engine combinator

## 0.1.4

- Add vocal-synth-engine integration (additive synthesis with 15 Kokoro voice presets)
- New `createVocalSynthEngine()` — drop-in VmpkConnector alongside sample-based and Pink Trombone engines
- New `listVocalSynthPresets()` — discover available voice presets
- New `createLayeredEngine()` — fan-out connector that plays multiple engines simultaneously
- CLI: `--engine synth`, `--engine piano+synth`, `--engine vocal+synth` modes
- `cmdSing` now supports `--engine` flag (piano, synth, piano+synth)

## 0.1.3

- Bump to v0.1.3
- Add CI badge to README

## 0.1.2

- Harden CI, add docs landing page
- Replace song library with MIDI-first architecture (120 songs across 12 genres)
- Fix tests and smoke test for MIDI-ingested song library
