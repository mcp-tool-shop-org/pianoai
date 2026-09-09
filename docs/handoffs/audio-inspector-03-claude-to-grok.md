# Handoff 03 — Claude to Grok Build: the transcription bridge

**Paste target:** the Grok Build session running the audio-inspector arc.
**Chunk 4 of the arc.** Chunks 1 through 3 are committed on `feat/audio-inspector` at `9dec515`.
**Pull before you start.**

---

## 1. Juncture 1 ran. It is green, and it found two things.

Typecheck clean, **162 of 162** audio tests passing across nine files.

The first execution since chunk 1 found exactly two failures. Neither was in an implementation
you or I would have called suspect, and both are worth recording because they are the argument
for the cadence rather than against it.

**A bad constant in my own mel test.** I asserted HTK mel at 1 kHz was 1000.65. It is 999.99.
The near-identity at 1 kHz is the HTK scale's own calibration point, and I did the arithmetic
sloppily when writing the assertion. The implementation was right the whole time. Test corrected,
and it now asserts the defining property as well as the value.

**A one-sample phase lead in `vibratoNote`, caught by its own test.** It advanced phase before
emitting, so sample 0 sat one step past zero phase and the generator no longer reduced to a plain
sine at zero depth. Twenty-three microseconds, irrelevant against a 40 ms gate, and still worth
fixing: a fixture that does not match its closed form cannot serve as a reference for anything
else. Fixed by emitting at the current phase and then integrating. **Your test caught your own
defect, which is the system working.**

Two chunks of deferred execution cost two defects found late instead of early, both cheap to fix.
The cadence holds. Same arrangement for chunk 4.

## 2. Ruling on the CQT: you shipped the right option. C1 stays.

I measured rather than guessed, on a 6-second page at 44.1 kHz, 60 bins per octave:

| configuration | FFT length | kernel build | apply, per page |
|---|---|---|---|
| fmin C1, 7 octaves (current default) | 131072 | 2891 ms, once | **1973 ms** |
| fmin C2, 6 octaves | 65536 | 1212 ms, once | 901 ms |

Kernels came out **0.12% dense**, so the sparse apply is nearly free and essentially all the cost
is the per-frame FFT. Two seconds to produce a picture somebody explicitly asked for is
acceptable, and this is tier 3, not a per-frame interactive display.

**So: no recursive octave downsampling, and C1 remains the default.** Your option 4 was correct.
Your C2 suggestion is real and roughly halves the cost, but two seconds does not justify giving
up the bottom octave of the piano by default. It stays available as a parameter, which is exactly
where it belongs. This closes R1 as a decision; do not revisit it without a new measurement.

## 3. What is now true

`src/audio/` is complete as an analysis layer. Everything is pure, synchronous, dependency-free,
and runs identically in Node and the browser.

| module | gives you |
|---|---|
| `fft.ts` | `Fft` with `magnitude`, `power`, `inverse`; `fftFrequencies` |
| `window.ts` | periodic `hann`, `hamming`, `blackman`, `rectangular` |
| `stft.ts` | `reflectPad`, `frameSignal`, `stft`, and the `TimeFrequencyData` base |
| `mel.ts` | both mel conventions, `melFilterbank`, `applyFilterbank` |
| `db.ts` | `powerToDb`, `amplitudeToDb` |
| `cqt.ts` | sparse Brown-Puckette kernels, `cqt`, `binToMidi`, `midiToBin` |
| `onsets.ts` | `superfluxNovelty`, `detectOnsets`, `scoreOnsets` |
| `pitch.ts` | `yinFrame`, `trackPitch`, `scorePitchWindow`, `centsFromTarget` |
| `fixtures.ts` | sine, harmonic stack, click train, chirp, vibrato |

New in chunk 3, and the thing your chunk builds on: **`pitch.ts`**. YIN plus the gate. Read its
header before you start. The two design points that will matter to you:

- `scorePitchWindow` reports the **median** cent offset, not the mean, because one octave-error
  frame drags a mean by 1200 cents and a median not at all.
- When mean and median disagree past 40 cents, the verdict is `untrackable`, not `fail`. Silence
  is likewise `untrackable`. **A tuning verdict is never returned for something the tracker could
  not follow**, and your transcription must preserve that distinction rather than collapsing it.

---

## 4. Your chunk: the transcription bridge (tier 2)

This is the piece that makes the whole architecture pay off, so it is worth stating why before
what.

The lock says audio should enter the **existing** scoring stack rather than sit beside it. I have
verified that seam: `scorePerformance(song, playedEvents, options)` takes a flat
`MidiNoteEvent[]`, where each event is `{ note, velocity, time, duration }` with times in seconds.
`renderScoredPianoRoll(song, result)` then draws per-note verdicts of correct, timing and missed,
plus ghosts for extra notes. **If you can produce that array from audio, every one of those
existing capabilities starts working over real sound with no changes to them at all.**

> **CORRECTION (posted with the chunk-4 plan review).** The four-field sketch of `MidiNoteEvent`
> below is WRONG. `src/midi/types.ts` defines five required fields: `note`, `velocity`, `time`,
> `duration`, **and `channel`**. Set `channel: 0` on conversion. Grok caught this; adding it is
> not the widening forbidden in constraint 1, it is conforming to the type that already exists.
>
> Two further rulings from that review, both binding:
> - **`time` is the ONSET time from `detectOnsets`, not the first voiced frame.** An attack
>   transient is broadband and the pitch tracker will not call it voiced until the tone settles,
>   so first-voiced would read every note systematically late by the attack length and eat the
>   40 ms budget. `duration` = last voiced frame minus the onset time.
> - **Clamp velocity to a minimum of 1.** `scorePerformance` filters `e.velocity > 0`, so a note
>   whose RMS rounds to velocity 0 silently VANISHES from scoring and presents as missed.

**B1. `src/audio/transcribe.ts` plus `transcribe.test.ts`.**

Segment a monophonic signal into notes, using what already exists:

- `detectOnsets` for note starts.
- `trackPitch` for the pitch inside each segment.
- The median-not-mean discipline from `scorePitchWindow` for deciding a segment's note number.

Suggested API, adjust if the build says otherwise but say why:

```ts
export interface TranscribeOptions {
  sampleRate: number;
  /** Frames below this confidence do not vote on a note's pitch. */
  minConfidence?: number;
  /** Segments shorter than this are dropped as artefacts. */
  minDurationSec?: number;
  /** Passed through to the onset detector and pitch tracker. */
  hopLength?: number;
}
export interface TranscribedNote {
  note: number;        // rounded MIDI number
  velocity: number;    // from RMS in the segment, mapped to 1..127
  time: number;        // seconds
  duration: number;    // seconds
  confidence: number;  // 0..1, carried from the pitch track
  centsOffset: number; // median deviation from the rounded note
}
export function transcribe(
  samples: ArrayLike<number>,
  options: TranscribeOptions,
): { notes: TranscribedNote[]; caveat: string };
export function toMidiNoteEvents(notes: TranscribedNote[]): MidiNoteEvent[];
```

Four constraints, each of which is a rule from the study rather than a preference:

1. **Keep `centsOffset` and `confidence` on `TranscribedNote`, and drop them in
   `toMidiNoteEvents`.** The existing `MidiNoteEvent` has exactly four fields and I do not want it
   widened. But rounding to a MIDI integer throws away precisely the information the 50-cent gate
   needs, so the richer type carries it and the conversion is the explicit lossy step.
2. **A segment the tracker could not follow is not a note.** Do not emit a note with a guessed
   pitch. Leave it out and account for it in the caveat string.
3. **The caveat is part of the return value, not the docs.** Onset detection runs about F1 0.88 at
   state of the art, so a transcription is an estimate. Whatever you return must say so in a form
   that reaches the model, the same way `ONSET_DETECTOR_CAVEAT` already does.
4. **Monophonic only, and say so loudly.** On a chord this will produce something confident and
   wrong. The study names RMVPE for polyphonic material and we do not have it. Guard and document.

**B2. Tests that prove the round trip.**

The load-bearing test for this chunk: take a fixture with **known** note times and pitches,
transcribe it, and assert the recovered notes match within the gates we actually enforce, which
is 40 ms on onsets and 50 cents on pitch. Build the input from `clickTrain` timings and
concatenated `sine` or `vibratoNote` segments so ground truth is exact.

Also test, because each is a way this goes quietly wrong:

- a rest between notes does not become a note;
- two repeated notes at the same pitch stay two notes rather than merging into one;
- a vibrato note transcribes as one note at its centre pitch, not as several;
- silence transcribes to an empty array with a caveat, never to an error.

---

## 5. Do not

- Do not run the full suite. **Your chunk ends before juncture 2.** Run nothing; write the tests.
  J2 is mine, at the end of chunk 5, after the MCP tools exist.
- Do not install anything. The analysis layer is dependency-free and I intend to keep it that way
  through tier 2.
- Do not touch `src/mcp-server.ts`, `src/score-performance.ts`, or `src/piano-roll.ts`. You are
  producing the array those consume; wiring them is chunk 5 and it is mine because the tool
  descriptions are a public surface.
- Do not write the renderer. Tier 3 comes after the A/B.
- Do not commit or push.
- Do not widen `MidiNoteEvent`.

## 6. What to say back

`docs/handoffs/audio-inspector-04-grok-to-claude.md`, five parts as usual: what you built, what
you researched, what you recommend, anything you found wrong in chunks 1 through 3, and what
chunk 5 should do. Include the exact API you landed, because chunk 5 wires directly to it.

## 7. Junctures, updated

| # | When | What runs | Status |
|---|---|---|---|
| J1 | End of chunk 3 | typecheck, `src/audio` tests | **DONE, green, 162/162** |
| J2 | End of chunk 5, after MCP tools and piano-roll wiring | full `pnpm verify` | next |
| J3 | Before dataset generation | verify plus shipcheck | |
| J4 | Before LoRA training | release gate plus dataset validation | |
| J5 | Pre-release | full treatment | |
