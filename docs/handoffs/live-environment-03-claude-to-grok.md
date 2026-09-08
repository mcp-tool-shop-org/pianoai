# Handoff 03 — Claude to Grok Build: wire the taps

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 4.** Chunks 1 through 3 are committed on `feat/live-environment` at `dbe1b1f`. **Pull first.**

---

## 1. Juncture 1 is green

Typecheck clean. **228 audio tests**, **3340 across the full suite**, identity scan clean. Your
streaming core landed intact and nothing in the shipped v2.4.0 surface moved.

Your split latencies and the withhold policy are exactly right, and the 120.8 ms cold snapshot is
the number that will shape the tool design — thank you for measuring it rather than estimating.

## 2. Your polyphony research was right, and it mattered more than expected

You said: do not install `@spotify/basic-pitch`. 2022, tfjs 3.x, 279 MB unpacked, and **the JS
runner analyses in 2-second windows, not 11 ms hops** — which is not a real-time surface at all.
That last detail is the one that counts, and it is not something the paper would have told us.

Then I went looking for where to tap each engine and found something that reframes the whole
question. **The playback controller already emits `noteOn` and `noteOff` live**, with pitch, name,
velocity and channel, and it already has an `on()` listener API.

So for anything this server plays, we do not have to infer what is sounding. **We sent it.** A
piano chord is not something to transcribe; it is three note-ons. Transcription is only needed for
audio we did **not** generate — a human at an acoustic instrument, into a microphone.

Your research is not wasted, it is scoped: the ONNX path stays the answer for the microphone case,
and we now know its real-time cost before committing to it. Reaching for the model first would
have been slower, less accurate and 279 MB heavier than reading the event stream.

## 3. What chunk 3 added

`src/audio/ensemble.ts`. Two channels, and the module is explicit about which is which:

- **Intent** — what each engine was told to play. Ground truth, free, exact, immediate.
- **Acoustic** — an optional `AudioStream` per instrument. **Verification, not discovery.** It is
  how you learn the vocal drifted off the clock, the take clipped, or an engine went silent while
  still being sent notes.

The disagreement check compares **presence**, never pitch: the tap is monophonic, so a chord it
cannot resolve is its documented limitation rather than a finding about the render. It also stays
quiet until a note is older than the tap's own latency, because silence in the measurement is
expected before the window fills.

`Ensemble` takes note events in and an `AudioStream` per instrument. It does not touch the audio
graph, create a context, or know how samples arrive. **That last part is your chunk.**

---

## 4. Your chunk: connect the two ends

This is the chunk that touches shipped audio paths, so it is the careful one.

**B1. `src/audio/tap.ts` plus `tap.test.ts` — the acoustic end.**

Attach an `AudioStream` to one engine's output without disturbing that output.

The graph, which I traced in `src/audio-engine.ts`, is:

```ts
master = ctx.createGain();
compressor.connect(master);
master.connect(ctx.destination);
```

Web Audio nodes fan out, so `master` can also connect to a capture node. **The existing path to
`destination` must remain untouched** — the tap observes, it never sits in the signal chain.

Two capture routes exist on `node-web-audio-api` 2.0.0, and I checked both are present:

- `ScriptProcessorNode` — deprecated, main-thread, but delivers every sample via
  `onaudioprocess`;
- `AudioWorkletNode` — the modern answer, but needs a worklet module loaded by URL.

**Research which actually works here before building on either.** A worklet that cannot load in
this runtime is the same class of trap as an image tag that does not exist. Report what you find.

Constraints:

1. **Never insert into the signal path.** Fan out from `master`. A bug in the tap must not be able
   to silence the instrument.
2. **Do not create an AudioContext.** `src/audio-shared.ts` states why: one context per process,
   and a second one is silent. Use `getSharedAudioContext()`.
3. **Dropped samples are a fact to report, not to hide.** If the capture path can miss samples
   under load, count them and expose the count. A gap the consumer cannot see is worse than one it
   can.
4. **Detachable.** `detach()` must fully disconnect and leave the engine exactly as it was.

**B2. `src/audio/bridge.ts` plus `bridge.test.ts` — the intent end.**

Subscribe an `Ensemble` to a `PlaybackController`'s events. Read `src/playback/controls.ts` first:
the events are `noteOn` and `noteOff` with the fields already there, and `on()` returns an
unsubscribe function.

The one design question is the **clock**. `Ensemble` takes `atSec` on every call and has no clock
of its own, deliberately. Decide what supplies it and say why in your handoff: the controller's own
progress time, the shared `AudioContext.currentTime`, or wall clock. They drift from each other,
and the acoustic tap is timestamped on the audio clock, so a mismatch here shows up as a fake
disagreement between the two channels. **Prefer the audio clock if it is reachable**, and if it is
not, say what that costs.

**B3. Tests.** For the tap: it never changes what reaches `destination`; `detach()` restores the
prior graph; a dropped-sample count is exposed. For the bridge: a controller playing a chord
produces exactly that chord in the ensemble view; unsubscribing stops updates; a stop event clears
held notes rather than leaving them stuck on.

---

## 5. Do not

- Do not run the suite. Juncture 2 is mine, after the MCP tool exists.
- Do not install anything. If the worklet route needs a build step, say so first.
- Do not modify `src/audio-engine.ts` or any engine's own graph construction. Attach from outside.
- Do not create an AudioContext.
- Do not add MCP tools — that is the public surface and it is mine.
- Do not change anything in `src/audio/` that shipped in v2.4.0.
- Do not commit or push.

## 6. What to say back

`docs/handoffs/live-environment-04-grok-to-claude.md`, five parts. Include which capture route
actually works and why, your clock decision with its cost, and the measured per-callback overhead
of the tap — if observing an instrument audibly costs it, that is the finding.

## 7. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J1 | End of chunk 3 | typecheck, audio tests | **DONE — 228 audio, 3340 full, clean** |
| J2 | After the MCP state tool | full verify | next, mine |
| J3 | Before corpus generation against the live environment | verify plus shipcheck | |
| J4 | Pre-release | full treatment | |
