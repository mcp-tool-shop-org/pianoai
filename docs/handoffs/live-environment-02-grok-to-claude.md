# Handoff 02 — Grok Build to Claude: streaming analyser + polyphony recommendation

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Arc:** live multi-instrument environment.
**Chunk 2.** Branch `feat/live-environment` @ `9646341`. Work uncommitted. Tests written, unrun. I did **not** run the suite. I did execute `snapshot()` once in isolation to measure cost.

---

## 1. What I built

`src/audio/stream.ts` + `stream.test.ts`. Barrel export only. No engine files, no AudioContext, no change to shipped `src/audio` analysers.

```ts
export class AudioStream {
  push(samples: Float32Array | Float64Array): void; // copy only
  get latestOnsets(): OnsetEvent[];                 // confirmed
  get latestPitch(): PitchFrame | null;             // newest frame; null if unvoiced
  snapshot(): StreamSnapshot;
  reset(): void;
  readonly capacity: number;
  readonly bufferBytes: number;
  readonly pitchLatencySec: number;
  readonly onsetLatencySec: number;
}
```

`StreamSnapshot` (changed from the brief, as ruled):

| field | meaning |
|---|---|
| `tEndSec` | monotonic stream time of the newest sample (`totalPushed / sampleRate`) |
| `filledSec` | how much of the ring is valid |
| `pitchLatencySec` | `nFft/2 / sr` (~23.2 ms at 2048 / 44.1 kHz) |
| `onsetLatencySec` | `max(pitchLatency, postAvg)` = **70 ms** at defaults |
| `edgePolicy` | `"withhold"` |
| `latestOnsets` | SuperFlux onsets with `time <= tEnd - onsetLatencySec` |
| `latestPitch` | last YIN frame in the window, or `null` if that frame is unvoiced |

Ring: fixed `ceil(windowSec * sampleRate)` Float64Array + a preallocated scratch. `push` writes in a loop. Analysis on `snapshot()` via **the same** `detectOnsets` + `trackPitch`. Onset times are shifted by window-start so they stay in stream seconds across wrap.

**Edge policy:** withhold. Confirmed onsets are never retracted. The load-bearing test compares stream onsets to offline onsets filtered by the same cutoff.

**Seam:** `lastAnalysedSampleIndex` (private). After snapshot it equals `totalPushed`. Incremental caching can consume `(lastAnalysed, totalPushed]` later without an API break. `yinFrame` is already per-frame; onsets would still need a stateful novelty wrapper.

### snapshot() cost (measured, this machine, not the suite)

2 s sine @ 44.1 kHz, `windowSec: 2`, hop 512 (~173 YIN frames):

| | |
|---|---|
| **First `snapshot()`** | **120.8 ms** |
| Cached (no push) | ~0.001 ms |

That is the price of reuse-don't-fork. Fine at ~8 Hz polling. **Not** fine inside an audio callback. Chunk 3 should snapshot off the audio thread, or later fill the hop-cache seam. I did not pre-optimise.

### Tests written, unrun

1. Load-bearing: click+sine, 1.2 s < 2 s window, 137-sample chunks vs offline, confirmed onsets and latest f0 agree; `onsetLatencySec > pitchLatencySec`.
2. Chunk size 512 vs 1: same tEnd, same onset count, same f0.
3. 400 × 2048 pushes: `bufferBytes` constant.
4. Tone then 0.6 s zeros: `latestPitch === null`.
5. `reset()` zeros time and onsets; a following sine does not resurrect the click.

---

## 2. R1 — polyphony (recommend, not installed)

Tapping an engine does not yield notes: one piano engine is a chord.

| option | licence | last release I opened | size | Node / browser | per-frame / window latency |
|---|---|---|---|---|---|
| **`@spotify/basic-pitch` 1.0.1** | Apache-2.0 | **npm 2022-08-05** (Python package still moving; v0.4.0 Aug 2024 is training code) | install ~1.8 MB, unpacked listed **279 MB** because of tfjs | pulls `@tensorflow/tfjs ^3.2.0` (current tfjs is 4.22; issue #20 asking for an update is open since 2024-10, unanswered). `tfjs-node` 3.x is archived. | JS runner is **2 s windows** (`AUDIO_WINDOW_LENGTH_SECONDS = 2`, 30 overlapping frames, hop 256 @ 22.05 kHz). Not a 11 ms streaming API. |
| **Same model, ONNX** | Apache-2.0 weights; **onnxruntime-web MIT 1.29.0** (2026-08-24, from the inspector R2) | Python ships ONNX as of basic-pitch v0.3.0 | **~230 KB** ONNX (HF mirror AEmotionStudio/basic-pitch-onnx-models) | Node + browser wasm; Node wasm is single-thread | Paper: faster than real time **offline**. No official JS streaming wrapper. A 2 s window is 2 s of algorithmic delay if you copy the TS runner. |
| **Hu, Peter, Schlüter, Widmer, ISMIR 2025** *Exploring System Adaptations for Minimum Latency Real-Time Piano Transcription* | paper | 2025 | — | research, not npm | Existing “online” piano models sit at **128–320 ms**; they strip non-causal parts aiming at **<30 ms** (10 ms goal). Piano-specific. |
| **PitchPlease** (`@markusstrasser/pitchplease`) | check at install | live demo claims ~16 ms / 60 fps | FFT 16384 | **AnalyserNode in the browser** | Peak-picking, not note tracking. We are not creating an AudioContext in this layer; AnalyserNode was already excluded from the inspector stack. |
| **fnaught 0.1.3** | (ONNX via onnxruntime-web) | 2026-06 | 428 KB | Node + browser | **Monophonic.** ~70 ms / 2 s (~30× RT). Does not solve piano chords. |

**Recommend for chunk 3:**

1. **Do not install `@spotify/basic-pitch`.** Stale tfjs 3.x, huge install, 2 s JS windows, archived Node backend.
2. **Do not treat YIN on the piano tap as notes.** `AudioStream.latestPitch` is the inspector's monophonic answer and will be confidently wrong on a chord. Use it for voice/bass/lead; for piano, either withhold f0 or label it untrusted until polyphony exists.
3. **If you take a model, take the official Basic Pitch ONNX (~230 KB, Apache-2.0) on `onnxruntime-web`, and write a causal / hop-sized wrapper.** Copying the 2 s TS runner would blow the live budget we just measured (121 ms already, before a CNN).
4. **If the budget is “musical interaction <30 ms”, Basic Pitch as published is the wrong shape.** Point at Hu et al. 2025, not at a 2022 offline AMT. That is a new model, not a package we have.

I did not install anything. I did not measure Basic Pitch inference (not installed). The 121 ms figure is **our** YIN+SuperFlux snapshot, which is already the live budget's first occupant.

---

## 3. Anything wrong in the shipped layer

Nothing that this chunk should change. `postAvg` looking forward is correct SuperFlux; it is a streaming *policy* problem, not an offline bug. I did not edit `onsets.ts`.

---

## 4. What chunk 3 should do

1. Hang an analysis tap off each engine `master` **in addition to** `destination`, **on the one shared AudioContext**. Do not create a second context.
2. Pull samples (ScriptProcessor or AudioWorklet — you have both; no MediaStreamAudioDestinationNode) into `AudioStream.push`. **Do not call `snapshot()` on the audio thread** (121 ms).
3. Rule on piano polyphony using the R1 table. If you install, it is ONNX Basic Pitch + a streaming wrapper, not tfjs.
4. **J1:** typecheck + `src/audio` tests, including this file.
5. MCP tools stay yours.

---

## 5. Working tree

Uncommitted on `feat/live-environment` (HEAD `9646341`):

```
M  src/audio/index.ts
?? src/audio/stream.ts
?? src/audio/stream.test.ts
?? docs/handoffs/live-environment-02-grok-to-claude.md
```
