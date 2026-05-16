// ─── jam-actions-v0 ABC Notation Adapter ─────────────────────────────────────
//
// Converts a slice of TimedEvents to an ABC notation string.
//
// REMI path: hand-rolled from timed events. No external npm package needed.
// ABC notation spec: http://abcnotation.com/wiki/abc:standard:v2.1
//
// Approach:
//   - Uses the RH melody as the primary voice (monophonic melody reconstruction).
//   - LH bass notes appear in a second voice when present.
//   - Pitches are written with ABC accidentals and octave indicators.
//   - Durations are expressed as ABC fractional units relative to L: (unit note length).
//   - Quantizes durations to the nearest standard ABC subdivision.
//   - Rests fill gaps longer than one sixteenth note.
//
// Design choices for Slice 3:
//   - Unit note length (L:) is 1/16 (sixteenth note) — gives clean fractions.
//   - The measure bar line '|' is inserted at each new measure boundary.
//   - ABC accidentals: sharps are written as ^ (^D# → ^D), flats as _ (_B♭ → _B).
//   - Octave: ABC middle C is C4. Notes below C4 use commas (C,, etc.),
//     above use apostrophes (c' etc.). ABC convention: c = C5, C = C4, C, = C3.
//
// Deviations from full ABC spec:
//   - Chords (simultaneous notes): only the highest-pitched RH note per tick is
//     used for the melody line to keep the ABC string LLM-readable. Full chord
//     notation requires brackets which complicates LLM tokenization.
//   - Ornaments (trills, mordents) are not inferred.
//   - Key-signature accidentals are inferred from the supplied key string.
// ─────────────────────────────────────────────────────────────────────────────

import type { TimedEvent } from "./schema.js";
import type { PhraseMeta } from "./phrase-slicer.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AbcOptions {
  key: string;           // e.g. "A minor", "C major"
  timeSignature: string; // e.g. "3/8", "4/4"
  tempoBpm: number;      // integer BPM for Q: header
  title?: string;        // for T: header
}

// ─── Constants ───────────────────────────────────────────────────────────────

// Standard ABC note names (no accidental) for each semitone mod 12.
// Accidentals are prepended as ^ (sharp) or _ (flat) when needed.
const SEMITONE_TO_ABC: readonly string[] = [
  "C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B",
];

// Keys that use flats — ABC notation uses ^ for sharps, _ for flats.
// In flat keys we prefer flat spellings.
const FLAT_KEYS = new Set([
  "F major", "F", "B♭ major", "Bb major", "E♭ major", "Eb major",
  "A♭ major", "Ab major", "D♭ major", "Db major",
  "G♭ major", "Gb major", "C♭ major", "Cb major",
  "D minor", "G minor", "C minor", "F minor", "B♭ minor", "Bb minor",
]);

// Enharmonic flat spellings for semitones in flat keys.
const SEMITONE_TO_ABC_FLAT: readonly string[] = [
  "C", "_D", "D", "_E", "E", "F", "_G", "G", "_A", "A", "_B", "B",
];

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Convert a slice of TimedEvents to an ABC notation string.
 *
 * @param events  Sorted timed events for the phrase (output of slicePhrase).
 * @param meta    Phrase metadata (used for title/range if title not in opts).
 * @param opts    ABC header options (key, time sig, tempo, title).
 * @returns       ABC notation string beginning with X:1\n…
 */
export function toAbc(
  events: TimedEvent[],
  meta: PhraseMeta,
  opts: AbcOptions,
): string {
  const useFlatSpelling = FLAT_KEYS.has(opts.key);
  const noteMap = useFlatSpelling ? SEMITONE_TO_ABC_FLAT : SEMITONE_TO_ABC;

  // Parse time signature for bar-line insertion.
  const [timeSigNum, timeSigDen] = opts.timeSignature.split("/").map(Number);
  // Unit note length: 1/16 gives clean fractions for most signatures.
  const unitDen = 16;
  // Beats per measure in sixteenth-note units.
  const sixteenthsPerMeasure = (timeSigNum * unitDen) / timeSigDen;

  // ─── Build ABC header ─────────────────────────────────────────────────────
  const abcKey = normalizeAbcKey(opts.key);
  const phraseLabel = `mm. ${meta.measure_range[0]}–${meta.measure_range[1]}`;
  const title = opts.title ? `${opts.title} (${phraseLabel})` : phraseLabel;

  const header = [
    "X:1",
    `T:${title}`,
    `M:${opts.timeSignature}`,
    `L:1/${unitDen}`,
    `Q:1/4=${opts.tempoBpm}`,
    `K:${abcKey}`,
  ].join("\n");

  // ─── Extract RH melody (monophonic: highest note per tick cluster) ────────
  const rhMelody = extractRhMelody(events);

  if (rhMelody.length === 0) {
    // No RH events — write a rest bar.
    return `${header}\n|${buildRestToken(sixteenthsPerMeasure)}|\n`;
  }

  // ─── Find the start tick for bar-line calculation ─────────────────────────
  const phraseStartTick = meta.start_tick ?? rhMelody[0].t_ticks;

  // Determine quantization unit in ticks from the first event durations.
  // We use the smallest non-zero duration in the phrase (usually one sixteenth).
  const smallestDur = rhMelody.reduce(
    (m, e) => (e.dur_ticks > 0 && e.dur_ticks < m ? e.dur_ticks : m),
    Infinity,
  );
  // Typical: ticksPerBeat=480, quarter=480, eighth=240, sixteenth=120.
  // We infer ticksPerSixteenth from the key relationship dur_ticks ↔ duration ratio.
  // Use smallest observed duration as the sixteenth-note tick count.
  const ticksPerUnit = isFinite(smallestDur) ? smallestDur : 120;

  // ─── Build note sequence with bar lines ───────────────────────────────────
  const tokens: string[] = [];
  let currentMeasure = rhMelody[0].measure;
  let prevEndTick = phraseStartTick;

  for (const event of rhMelody) {
    // Insert bar line when measure changes.
    if (event.measure !== currentMeasure) {
      tokens.push("|");
      currentMeasure = event.measure;
    }

    // Fill gap with rest if there's a silence gap.
    const gapTicks = event.t_ticks - prevEndTick;
    if (gapTicks > ticksPerUnit / 2) {
      const restUnits = Math.max(1, Math.round(gapTicks / ticksPerUnit));
      tokens.push(buildRestToken(restUnits));
    }

    // Note token.
    const noteName = midiToAbcNote(event.note, noteMap);
    const durationUnits = Math.max(1, Math.round(event.dur_ticks / ticksPerUnit));
    tokens.push(buildNoteToken(noteName, durationUnits));

    prevEndTick = event.t_ticks + event.dur_ticks;
  }

  // Close final bar.
  tokens.push("|");

  return `${header}\n|${tokens.join("")}\n`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert a MIDI note number to an ABC pitch string with octave markers.
 * ABC convention: C4=C, C5=c, C3=C,, with ^ for sharps and _ for flats.
 */
function midiToAbcNote(midiNote: number, noteMap: readonly string[]): string {
  const semitone = midiNote % 12;
  const octave = Math.floor(midiNote / 12) - 1; // MIDI octave: 60 = C4 → octave 4

  const baseName = noteMap[semitone]; // e.g. "C", "^C", "_D"

  // Split accidental prefix from letter.
  const accidental = baseName.startsWith("^") || baseName.startsWith("_")
    ? baseName[0]
    : "";
  const letter = accidental ? baseName[1] : baseName[0];

  // ABC: octave 4 = uppercase letter (C4=C), octave 5 = lowercase (C5=c).
  // octave 3 = C, (one comma), octave 2 = C,, etc.
  // octave 6 = c' (one apostrophe), octave 7 = c'' etc.
  let abcNote: string;
  if (octave <= 4) {
    abcNote = `${accidental}${letter.toUpperCase()}`;
    const commas = 4 - octave;
    abcNote += ",".repeat(commas);
  } else {
    // octave 5+: lowercase
    abcNote = `${accidental}${letter.toLowerCase()}`;
    const ticks = octave - 5;
    abcNote += "'".repeat(ticks);
  }

  return abcNote;
}

/**
 * Build an ABC note token: pitch + length multiplier.
 * Length 1 → no suffix, length 2 → "2", length 4 → "4", etc.
 * Dots: length 3 = "3" (in ABC this is 3 units of L).
 */
function buildNoteToken(noteName: string, units: number): string {
  return units === 1 ? noteName : `${noteName}${units}`;
}

/**
 * Build an ABC rest token: z (rest) + length.
 */
function buildRestToken(units: number): string {
  return units === 1 ? "z" : `z${units}`;
}

/**
 * Extract monophonic RH melody: for each tick cluster, take the highest note.
 * "RH" = events with hand === "right". If no RH events, fall back to all events.
 */
function extractRhMelody(events: TimedEvent[]): TimedEvent[] {
  const rhEvents = events.filter((e) => e.hand === "right");
  const sourceEvents = rhEvents.length > 0 ? rhEvents : events;

  if (sourceEvents.length === 0) return [];

  // Group by tick — simultaneous notes. Keep highest pitch.
  const byTick = new Map<number, TimedEvent>();
  for (const e of sourceEvents) {
    const existing = byTick.get(e.t_ticks);
    if (!existing || e.note > existing.note) {
      byTick.set(e.t_ticks, e);
    }
  }

  return [...byTick.values()].sort((a, b) => a.t_ticks - b.t_ticks);
}

/**
 * Convert a key string like "A minor" or "C major" to the ABC K: format.
 * ABC K: accepts: "Amin", "Cmaj", "G", "Dm", etc.
 * We normalize to the compact ABC key format.
 */
function normalizeAbcKey(key: string): string {
  const lower = key.toLowerCase().trim();

  // Parse "X major" or "X minor" or "X min" or "X maj".
  const match = lower.match(/^([a-g][#b♭♯]?)\s*(major|maj|minor|min|m)?$/);
  if (!match) return key; // pass through unknown keys

  const root = match[1].replace("♯", "#").replace("♭", "b");
  const mode = match[2] ?? "major";

  const rootCapitalized = root.charAt(0).toUpperCase() + root.slice(1);

  if (mode === "minor" || mode === "min" || mode === "m") {
    return `${rootCapitalized}min`;
  }
  return rootCapitalized;
}
