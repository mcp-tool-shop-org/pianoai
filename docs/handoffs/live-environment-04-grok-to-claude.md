# Handoff 04 — Grok Build to Claude: acoustic tap + intent bridge

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Arc:** live multi-instrument environment.
**Chunk 4.** Branch `feat/live-environment` @ `0db82fc`. Work uncommitted. Tests written, unrun. I did **not** run the suite. I did run one OfflineAudioContext probe (not a live `AudioContext`, not WASAPI) to prove the capture route and to time `onaudioprocess`.

---

## 1. What I built

**Capture route: `ScriptProcessorNode`, buffer 2048.** Proven on this runtime twice: the live vocal path already drives it (`vocal-synth-adapter.ts:229`, `vocal-tract-engine.ts:340` with `BUFFER_SIZE = 2048`), and the probe below fired 23 callbacks in a 1 s `OfflineAudioContext` render. `AudioWorklet` is the measured upgrade, not this chunk. `addModule` can take a filesystem path here, but a processor module loaded by path is exactly the "tag that does not exist" trap once packaging moves the file. **Say so before adding any build step.** Do not add one now.

**The authorised engine change** (the only one to `src/audio-engine.ts`): `createTapOutput(): AudioNode` — implemented as `unknown` on `VmpkConnector` because this file has no DOM `AudioNode` type. Lazily `tapBus = ctx.createGain(); master.connect(tapBus)`. Observers connect to `tapBus`, never to `master`. Fan-out does not attenuate `master → destination`. `tapBus` is nulled wherever `master` is nulled (connect-fail and disconnect) so a reconnect does not keep a stale node. Existing `compressor → master → destination` wiring is untouched — the diff is the `let`, two nulls, and the method. It costs nothing until someone asks.

`createTapOutput` is optional on `VmpkConnector` (`src/types.ts`) because a real VMPK MIDI port has no graph. Piano is the only engine that implements it. Guitar, sample, vocal, and tract still end in a closed-over `master` the same way piano did yesterday.

```ts
// B1 — src/audio/tap.ts
attachTap({ source, stream, context, bufferSize? }): TapHandle
// source is the tapBus, not master
// TAP_BUFFER_SIZE = 2048
// handle.droppedSampleCount  // getter, never hidden
// handle.detach()            // only edges this function added
```

```ts
// B2 — src/audio/bridge.ts
subscribeEnsemble(ensemble, controller, { instrumentId, clock? }): () => void
audioClockSeconds(event): number
```

Barrel exports only. `src/audio/index.ts` header no longer claims the whole folder is Web-Audio-free: inspector stack through ensemble stays pure; tap and bridge are the live-graph layer and still never create a context.

---

## 2. Route, buffer, overhead (measured)

`OfflineAudioContext(1, 48000, 48000)`, buffer **2048**. Did not deviate. Tract picked 2048 deliberately (~42 ms, underrun safety). The synth adapter's default 256 is a generator quantum, not an observer one.

| | |
|---|---|
| block | **42.67 ms** at 48 kHz |
| `createScriptProcessor` | function; **23** callbacks / 1 s (full blocks only: 23 × 2048 = 0.981 s; the 896-sample tail is not a drop) |
| attachTap + `AudioStream.push` in the real callback | **9 µs** mean / callback, `droppedSampleCount = 0`, `filledSec = 0.981` |
| callback body alone (drop-count + `push` + `fill(0)`, 4000 rounds) | **2 µs** |
| cheap copy loop (route proof) | **36 µs** |

9 µs is ~0.02% of the 42.67 ms quantum. Observing did not audibly cost the instrument on this measurement. The lazy bus still means unused costs nothing, so I would not ship the tap forced-on — opt-in is the structural default, not a performance workaround.

**Do not call `snapshot()` inside `onaudioprocess`.** That is still the 121 ms class of work. The probe's 84 ms "render" figure included a post-render `snapshot()` and is not a callback cost.

Dropped samples: counted from `playbackTime` (else `currentTime`) vs the previous block's end sample. Exposed on the handle. A gap the consumer cannot see is worse than one it can. The 896-sample OfflineAC tail did **not** increment the counter, which is correct — ScriptProcessor never delivered a partial block.

Fan-out: `source.connect(processor); processor.connect(mute); mute.connect(destination)` with `mute.gain = 0`. The mute edge exists so the processor stays in the graph (callbacks do not fire otherwise). It adds silence, not signal. `detach()` disconnects those three edges and clears `onaudioprocess`. It does not touch `master → destination`.

---

## 3. Clock, and the cost of the fallback

`atSec` is `getSharedAudioContext().currentTime` when the shared context exists. The acoustic tap is on that clock (samples through ScriptProcessor). Tests inject a clock function so they need no live context.

**Fallback: `event.positionSeconds` (score time at speed 1).** That cost is in the `bridge.ts` module header, not only here: pause, seek, and speed make intent and acoustics **look** like they disagree when nothing is wrong. A fake disagreement is worse than no disagreement check, because it trains the reader to ignore the real ones. Production must not sit on the fallback while a context exists.

`stateChange` to `stopped` | `paused` | `finished` → `ensemble.allNotesOff`. Stuck notes are the classic failure of every note-tracking system. `playing` does not clear.

---

## 4. Tests written, unrun — and what I did not do

**`tap.test.ts`** (mock graph, no live context):

1. Original `source → destination` survives attach and is the only remaining source edge after detach; mute gain is 0.
2. Default buffer is 2048; a non-ScriptProcessor size throws.
3. A fired `onaudioprocess` pushes the block and writes silence to the output.
4. Contiguous `playbackTime` → `droppedSampleCount === 0`; a 100-sample gap → 100.
5. Detach stops capture; a second detach is a no-op.

**`bridge.test.ts`** (fake controller, injected clock):

1. Three note-ons → exact C4 E4 G4 in the view.
2. `noteOff` releases.
3. Injected clock supplies `atSec` (9.5, not `positionSeconds`).
4. Unsubscribe stops updates.
5. `stopped` / `paused` / `finished` clear held notes; `playing` does not.
6. `audioClockSeconds` uses a fake `{ currentTime }` when set, else `positionSeconds`. Restores the shared context to null.

**Did not:** run the suite (J2 is yours, after the MCP tool). Install anything. Create a live `AudioContext`. Add MCP tools. Change shipped v2.4.0 analyser behaviour. Touch guitar/sample/vocal/tract graph construction. Commit or push. Add a worklet build step.

---

## 5. Working tree, and what you pick up

Uncommitted on `feat/live-environment` (HEAD `0db82fc`):

```
 M src/audio-engine.ts
 M src/types.ts
 M src/audio/index.ts
?? src/audio/tap.ts
?? src/audio/tap.test.ts
?? src/audio/bridge.ts
?? src/audio/bridge.test.ts
?? docs/handoffs/live-environment-04-grok-to-claude.md
```

The probe file is deleted. Nothing in shipped `src/audio` analysers moved.

**Your chunk:**

1. Wire it. Piano: `createTapOutput()` → `attachTap({ source: tapBus, stream, context: getSharedAudioContext() })`. `subscribeEnsemble` on the playback controller. Snapshot off the audio thread, still.
2. The other engines need the same `createTapOutput` seam before they can be observed in isolation. Same shape: lazy bus off their own `master`, null on disconnect, do not sit between master and destination. I did not add it.
3. MCP state tool is yours. J2 is typecheck + `src/audio` tests including these two files, then full verify, after that tool exists.
4. Worklet remains a measured upgrade. If you take it, measure load-by-path in the packaged artifact before adding a build step — the class existing is not the trap we were avoiding.
