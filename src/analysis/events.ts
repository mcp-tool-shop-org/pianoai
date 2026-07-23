// ─── Timed event stream ───────────────────────────────────────────────────────
//
// Reconstructs a stream of sounding pitches with onsets + durations from the
// hand-string notation the whole platform uses. Within a hand, tokens play
// sequentially (exactly as parseHandString drives playback), so an onset is the
// running sum of preceding token durations. Rests advance the cursor but sound
// nothing. Both hands start at the measure's downbeat, so the two streams share
// one beat grid.
//
// Reuses the platform's OWN parsers (splitChordToken / parseNoteToMidi /
// parseDuration) rather than re-implementing note parsing — so the analyzer
// interprets a token exactly the way playback does, and can't silently drift
// from the rendered music.
//
// KNOWN MODELING BOUND (documented, not hidden): the MIDI ingest's formatHand
// (src/songs/midi/hands.ts) does NOT emit mid-measure rest tokens for gaps, and
// note durations may overlap under pedal. So `onsetBeat` is the platform's
// NOMINAL sequential position — the same one playback uses — which can drift
// from a source MIDI's absolute onset ticks when the source had gaps/overlaps.
// This is the right frame for Session 1 (analyze what the platform plays, from
// the representation the platform reasons about); re-deriving absolute onsets
// from the raw .mid is a documented future refinement, not a correctness bug.
// ─────────────────────────────────────────────────────────────────────────────

import { splitChordToken, parseNoteToMidi, parseDuration } from "../note-parser.js";
import type { Measure } from "../songs/types.js";
import type { TimedEvent } from "./types.js";

/** Quarter-note-beat duration of a whole token (all chord tones share it). */
function tokenDurationBeats(durSuffix: string): number {
  try {
    return parseDuration(durSuffix);
  } catch {
    // ticksToDuration only ever emits known suffixes, but a hand-authored /
    // user song might carry an odd one — default to a quarter rather than throw.
    return 1.0;
  }
}

/** Emit the events of one hand string, cursor-accumulated from `startBeat`. */
function handEvents(
  handStr: string,
  hand: "left" | "right",
  startBeat: number,
  measureNumber: number,
): TimedEvent[] {
  const out: TimedEvent[] = [];
  if (!handStr || handStr.trim() === "") return out;

  let cursor = 0;
  for (const token of handStr.trim().split(/\s+/)) {
    const parts = splitChordToken(token); // [{ noteStr, durSuffix }], shared duration
    const dur = tokenDurationBeats(parts[0]?.durSuffix ?? "q");
    for (const { noteStr } of parts) {
      let midi = -1;
      try {
        midi = parseNoteToMidi(noteStr);
      } catch {
        midi = -1; // unparseable tone — skip it, don't fault the whole song
      }
      if (midi >= 0) {
        out.push({
          pitch: midi,
          pc: midi % 12,
          onsetBeat: startBeat + cursor,
          durBeats: dur,
          hand,
          measure: measureNumber,
        });
      }
    }
    cursor += dur;
  }
  return out;
}

/** All sounding events of one measure (both hands), onsets relative to `startBeat`. */
export function measureEvents(measure: Measure, startBeat: number): TimedEvent[] {
  return [
    ...handEvents(measure.leftHand, "left", startBeat, measure.number),
    ...handEvents(measure.rightHand, "right", startBeat, measure.number),
  ];
}

/**
 * All sounding events of a song, in measure order. Measure i starts at
 * `i × beatsPerMeasure` — the array index, NOT `measure.number`, so a song with
 * an odd numbering scheme still lays out on a contiguous beat timeline.
 */
export function songEvents(measures: Measure[], beatsPerMeasure: number): TimedEvent[] {
  const out: TimedEvent[] = [];
  measures.forEach((m, i) => {
    out.push(...measureEvents(m, i * beatsPerMeasure));
  });
  return out;
}
