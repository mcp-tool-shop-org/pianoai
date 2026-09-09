# Handoff 01 — Claude to Grok Build: the live multi-instrument environment

**Paste target:** a Grok Build session with `E:/AI/ai-jam-sessions` open.
**New arc.** The audio-inspector arc shipped as v2.4.0. This builds on top of it.
**Branch off `main` at `858fc19`.** Pull first.

---

## 1. What this arc is, and why the last one was not it

The audio inspector we shipped reads **one line at a time from a finished file**. The Director
wanted something else: an environment where the model can see **all the live instruments at once,
in real time**. That is a genuinely different build, not a bigger version of the last one, and it
is worth being blunt that we built the narrower thing first. The tools we shipped even say so in
their own output: on a chord or a mix they produce confident nonsense.

So the goal here: **while the model is playing, it can ask what every instrument is doing right
now** — which notes are sounding on the piano, what the guitar is doing, whether the vocal line is
on pitch — instead of grading a WAV file after the fact.

## 2. The architecture, which is better than it first looks

The expensive part of "hear every instrument" is normally **source separation**, a Demucs-class
model that is heavy, lossy and ambiguous. **We do not need it, and this is the key insight of the
whole arc.**

I traced the audio graph. Each engine builds its own node chain and ends with its own master gain:

```ts
master = ctx.createGain();
master.gain.value = voice.masterGain;
compressor.connect(master);
master.connect(ctx.destination);        // src/audio-engine.ts
```

**Every instrument already has its own gain node before anything mixes.** Web Audio nodes fan out,
so an analysis branch can hang off each engine's `master` *in addition to* `destination`. Each
instrument is captured at the source, perfectly isolated, with exact ground truth. No separation,
no ambiguity, no model.

**One hard constraint you must respect.** `src/audio-shared.ts` says it plainly: one AudioContext
per process, because node-web-audio-api and WASAPI will not mix two contexts to the same device and
a second context is silent. Every tap lives in that one shared graph. Do not create a context.

I checked what the backend gives you — `node-web-audio-api` 2.0.0 has `AudioWorkletNode`,
`ScriptProcessorNode`, `AnalyserNode` and `OfflineAudioContext`. It does **not** have
`MediaStreamAudioDestinationNode`, so that route is closed.

## 3. What already exists that you build on

`src/audio/` from the last arc, all pure, synchronous and dependency-free: `fft`, `window`, `stft`,
`mel`, `db`, `cqt`, `onsets`, `pitch`, `transcribe`, `wav`, `render`, `fixtures`. Everything is
already **frame-based on a hop grid**, which is why the streaming change below is a windowing
change rather than a rewrite.

`TimeFrequencyData` carries a `scale` field of `magnitude | power | db`. Keep honouring it.

**The whole existing suite is your regression net: 3318 tests, 152 files.** The offline tools are
shipped and public now. Nothing in this arc may change their behaviour.

---

## 4. Your chunk: research the polyphony gap, build the streaming core

### R1 — polyphonic pitch. This is the one genuinely new component.

Tapping each engine separately does **not** solve polyphony, and it is worth being clear why:
one engine is not one note. The piano plays chords through a single engine and a single master
gain. So even perfectly isolated, we need to know *which notes* are sounding, and `pitch.ts` is
monophonic YIN by construction.

Chunk 2 of the last arc already researched the answer: **Basic Pitch** (Bittner et al. 2022,
arXiv:2203.09893), constant-Q at 3 bins per semitone, ~11 ms hop, polyphonic note transcription,
and `@spotify/basic-pitch` is **Apache-2.0** on npm. Two problems with taking it as-is: its last
publish was 2022-08-05, and it pulls `@tensorflow/tfjs`, which this layer has deliberately avoided
for five chunks.

Report on, with licences and last-release dates:

- `@spotify/basic-pitch` as-is: does it still install and run on current Node, and how big is the
  model file;
- the same model via `onnxruntime-web` (MIT, current) instead of tfjs;
- whether anything has superseded it since 2022 for *real-time* polyphonic transcription
  specifically — latency matters here in a way it did not for the offline arc;
- what latency each option actually costs per frame, because a real-time surface has a budget and
  an offline one does not.

**Recommend; do not install.** Chunk 3 decides.

### B1 — `src/audio/stream.ts` plus `stream.test.ts`

An incremental analyser: feed it samples as they arrive, ask it what is happening now.

```ts
export interface StreamOptions {
  sampleRate: number;
  hopLength?: number;      // default 512, matching the offline grid
  windowSec?: number;      // rolling history retained, default 2
  label?: string;          // which instrument this stream belongs to
}
export class AudioStream {
  push(samples: Float32Array | Float64Array): void;   // called from the audio thread
  get latestOnsets(): OnsetEvent[];                   // within the window
  get latestPitch(): PitchFrame | null;
  snapshot(): StreamSnapshot;                         // cheap, allocation-light
  reset(): void;
}
```

Four constraints, each with a reason:

1. **A ring buffer, not a growing array.** This runs for the length of a jam session. Anything that
   grows without bound is a leak with a nice name.
2. **`push` must be cheap and must not allocate per call.** It is called from the audio path. Do
   the analysis lazily on `snapshot()`, or on a hop boundary, not on every push.
3. **Reuse the offline code, do not fork it.** The hop grid, the mel filterbank and the YIN
   implementation must be the *same* ones, so a streaming reading and an offline reading of the
   same audio agree. **Write the test that asserts exactly that**: feed a fixture through
   `AudioStream` in chunks and through the offline path whole, and assert the onsets and pitch
   match. If they diverge we have two truths, which is worse than having one slow one.
4. **Report latency honestly in the snapshot.** A rolling window means the answer is always about
   the recent past. The snapshot should say how old its newest data is, rather than implying "now".

### B2 — tests

Beyond the streaming-vs-offline agreement test above: pushing in irregular chunk sizes gives the
same answer as pushing in regular ones; the ring buffer holds memory flat over a long run; a stream
fed silence reports no pitch rather than a stale one; `reset()` actually clears.

---

## 5. Do not

- Do not run the test suite. Junctures are mine and the first one is at the end of chunk 3.
- Do not install anything, including a polyphony model. Recommend first.
- Do not touch `src/audio-engine.ts`, `src/audio-shared.ts`, or any engine file. Per-engine capture
  is chunk 3 and it touches shipped audio paths, so it gets its own juncture.
- Do not add MCP tools. Tool text is a public surface and it is mine.
- Do not change any existing behaviour in `src/audio/`. It is published in v2.4.0.
- Do not create an AudioContext.
- Do not commit or push.

## 6. What to say back

`docs/handoffs/live-environment-02-grok-to-claude.md`, five parts as always: what you built with
the API you actually landed, what you researched with licences and latencies, your polyphony
recommendation in a form chunk 3 can act on, anything wrong you found in the shipped layer, and
what chunk 3 should do.

## 7. Junctures for this arc

| # | When | What runs |
|---|---|---|
| J1 | End of chunk 3, after per-engine capture is wired | typecheck plus the `src/audio` tests |
| J2 | After the MCP state tool exists | full verify — this is where the 3318 existing tests defend the shipped surface |
| J3 | Before any corpus generation against the live environment | verify plus shipcheck |
| J4 | Pre-release | full treatment |

The last arc's cadence holds: tests are **written** every chunk and **run** only at junctures. It
cost us a file that did not parse for three chunks, and it caught it in seconds when the gate came.
