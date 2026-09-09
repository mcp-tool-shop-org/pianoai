# Handoff 04 — Grok Build to Claude: the transcription bridge

**Paste target:** a fresh Claude session with `E:/AI/ai-jam-sessions` open.
**Arc:** the audio inspector surface.
**This is chunk 4 of that arc.** Chunks 1–3 plus the corrected brief sit at `5152b07`. This chunk adds monophonic transcription. Work is in the working tree, uncommitted. Tests are written and unrun.

---

## The arrangement (unchanged)

Alternating chunks. Tests ship with the code; they run at junctures. Chunk 4 is not a juncture. I did not run `pnpm test`, `pnpm verify`, or `pnpm typecheck`. No installs. No commits. J2 is yours, at the end of chunk 5.

---

## 1. What I built

Started from `feat/audio-inspector` @ `5152b07` (handoff 03 corrected: `channel`, onset-time, velocity clamp). Working tree was already there; nothing to merge.

### `src/audio/transcribe.ts` + `transcribe.test.ts`

Landed API:

```ts
export const MIN_DURATION_SEC = 0.05;   // 50 ms mir_eval; below that is an artefact
export const MIN_CONFIDENCE = 0.5;      // same floor as scorePitchWindow

export interface TranscribeOptions {
  sampleRate: number;
  minConfidence?: number;   // default MIN_CONFIDENCE
  minDurationSec?: number;  // default MIN_DURATION_SEC
  hopLength?: number;       // default 512, passed to onsets and YIN
}
export interface TranscribedNote {
  note: number;
  velocity: number;         // RMS-mapped, clamped [1, 127]
  time: number;             // SuperFlux onset, seconds
  duration: number;         // last voiced frame − time
  confidence: number;       // median YIN confidence of voting frames
  centsOffset: number;      // median cents from `note`; positive = sharp
  onsetInferred: boolean;   // no SuperFlux onset; start = first voiced
}
export interface TranscribeResult {
  notes: TranscribedNote[];
  caveat: string;           // always populated, for the model
}
export function transcribe(samples, options): TranscribeResult;
export function toMidiNoteEvents(notes: TranscribedNote[]): MidiNoteEvent[];
export function velocityFromRms(rms: number): number;
```

**API additions vs the brief, and why**

- `onsetInferred: boolean` on `TranscribedNote`. The ruling was “note inferred onsets in the caveat,” which I did. The field is so chunk 5 does not have to parse the caveat to know which times are SuperFlux and which are first-voiced. `toMidiNoteEvents` drops it with `centsOffset` and `confidence`.
- `velocityFromRms` exported so the unit-sine = 127 mapping is testable without going through SuperFlux.
- `TranscribeResult` named, rather than an inline `{ notes, caveat }`.

**Segmentation, as ruled**

- `time` = SuperFlux onset from `detectOnsets`.
- `duration` = last voiced frame in `[onset, next onset)` minus that onset.
- Leading voiced frames with no preceding onset (more than one hop before the first SuperFlux time) open a segment at first-voiced, `onsetInferred: true`, counted in the caveat.
- Unvoiced gaps are not notes. Zero voiced frames, or mean-vs-median cents past `OCTAVE_TRIPWIRE_CENTS`, drop the segment as untrackable — no guessed pitch.
- Shorter than `minDurationSec` (default 50 ms) drop as artefacts.

**Pitch.** Not `scorePitchWindow` (it needs a target). Median of voiced fractional MIDI, round to `note`, `centsOffset` = median `centsFromTarget` from that integer. Same tripwire.

**Velocity.** RMS of the note span `[time, time+duration]`, scaled so a unit-amplitude sine (RMS = 1/√2) is 127, absolute not peak-relative, clamped to `[1, 127]`. `scorePerformance` filters `velocity > 0`; a 0 would vanish and present as missed.

**`toMidiNoteEvents`.** `{ note, velocity, time, duration, channel: 0 }`. Drops `centsOffset`, `confidence`, `onsetInferred`. Does not widen `MidiNoteEvent`.

**Caveat** always includes: monophonic-only, the SuperFlux F1 ≈ 0.88 text (`ONSET_DETECTOR_CAVEAT`), RMVPE named for polyphony, and the legato-repeat limitation (a repeated note with no amplitude or phase transient may merge). Dropped-untrackable, dropped-short, and inferred counts are appended when non-zero.

### Tests written, unrun

| case | what it pins |
|---|---|
| load-bearing C4 / E4 / G4 with clicks | recovery within **40 ms** and **50 cents**, asserted directly, not via `scorePerformance` |
| rest between those notes | no note whose time sits inside the rest, a full gate away from both onsets |
| two A4s separated by a rest | two notes |
| two A4s re-attacked with no rest (phase-0 join + click) | two notes |
| 5 Hz / 50-cent vibrato on A4 | one note, MIDI 69, \|cents\| ≤ 50 |
| silence | `notes = []`, caveat present, no throw |
| leading sine from t=0 | at least one A4 near 0; if inferred, caveat says so |
| `toMidiNoteEvents` | channel 0, no extra fields, velocity in [1, 127] |
| `velocityFromRms` | unit-sine RMS → 127; 0 → 1 |
| caveat | names legato and monophonic even when nothing was dropped |

I wanted to run three before handing off: the 40 ms / 50 cent round trip, the no-rest re-attack split, and silence-does-not-throw. Those are the ones where SuperFlux `delta` or a one-hop duration off-by-one would only show up in numbers. I did not run them.

### `src/audio/index.ts`

Barrel exports the new module. LAYERS comment now names `pitch` (it was already exported, the comment had not caught up) and `transcribe`.

---

## 2. What I researched

Nothing new this chunk. The brief and the two rulings were sufficient. I opened, to confirm rather than to discover:

- `src/midi/types.ts` — `MidiNoteEvent` is five required fields, `channel` included.
- `src/score-performance.ts` around the `velocity > 0` filter (the reason for the clamp).
- `scorePitchWindow` in `src/audio/pitch.ts` — median / tripwire / `minConfidence = 0.5`, reused as discipline not as a call.
- `ONSET_DETECTOR_CAVEAT` and `HOUSE_TOLERANCE_MS` from `onsets.ts`.

CQT default stays C1. R1 is closed. I did not revisit it.

---

## 3. What I recommend (for chunk 5 to act on)

1. **Gate on `TranscribedNote`, score on `MidiNoteEvent`.** `centsOffset` and `confidence` die at `toMidiNoteEvents`. The 50-cent pitch gate and the inferred-onset warning have to run *before* that call. `scorePerformance` only sees integers, times, and velocity-as-presence.
2. **Surface the caveat in the tool text**, the same way the onset caveat is meant to reach the model. Do not leave it in a comment.
3. **Monophonic in the tool description.** A chord will look confident and wrong. Name RMVPE as out of scope, not as a hidden fallback.
4. **Do not default `scorePerformance`’s 150 ms onto audio-derived events** when you report the 40 ms house figure. That default is the MIDI-capture tolerance. Mixing the two was the trap the load-bearing test was written to avoid.

No install. No SwiftF0. No recursive CQT.

---

## 4. Anything wrong in chunks 1–3

Nothing new. The pad-centre defect is fixed. The HTK-mel constant and the `vibratoNote` phase lead were caught at J1. `MidiNoteEvent.channel` was a hole in the brief, not in the type; you corrected it at `5152b07` before I started.

I did not find a second analysis-layer defect while calling `detectOnsets` and `trackPitch` from the transcriber. That is not the same as “there isn’t one” — this chunk has not executed.

---

## 5. What chunk 5 should do

### Research

None required to wire. If a tool description needs a one-line citation for F1 ≈ 0.88, it is already on `ONSET_DETECTOR_CAVEAT` (Joysingh et al. 2024 in the study).

### Build

1. MCP tools that call `transcribe` / `toMidiNoteEvents` / `scorePerformance` / `renderScoredPianoRoll`. Tool descriptions are a public surface — yours.
2. Run the 50-cent gate against `TranscribedNote.centsOffset` *before* the conversion. Pass `toMidiNoteEvents` into `scorePerformance` with an explicit `toleranceMs: 40` if the house gate is what you are reporting; do not inherit 150.
3. Put `result.caveat` in the tool text. Honour `onsetInferred` (warn that those times are first-voiced, not attacks).
4. **J2.** Full `pnpm verify`. This is the first chunk that touches the existing server and the existing scoring path. The 1513 existing tests are the regression net.

### Do not

- Do not write the renderer. Tier 3, after the A/B.
- Do not install anything. The analysis layer stays dependency-free.
- Do not widen `MidiNoteEvent`.
- Do not change CQT `fmin` without a new measurement.
- Do not commit or push unless the operator says so. This chunk is uncommitted on purpose.

---

## Working tree

Uncommitted on `feat/audio-inspector` (HEAD `5152b07`):

```
M  src/audio/index.ts
?? src/audio/transcribe.ts
?? src/audio/transcribe.test.ts
?? docs/handoffs/audio-inspector-04-grok-to-claude.md
```
