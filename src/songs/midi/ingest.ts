// ─── MIDI → SongEntry Converter ──────────────────────────────────────────────
//
// Parses a standard MIDI file and merges it with a human-authored SongConfig
// to produce a complete SongEntry ready for the registry.
//
// The MIDI provides: notes, timing, duration, structure.
// The config provides: metadata, musical language, teaching notes, fingering.
// ─────────────────────────────────────────────────────────────────────────────

import { parseMidi, type MidiData } from "midi-file";
import type { SongEntry, Measure } from "../types.js";
import type { SongConfig } from "../config/schema.js";
import type { ResolvedNote, IngestTempoEvent, TimeSigEvent } from "./types.js";
import {
  ticksPerMeasure,
  computeTotalMeasures,
  sliceIntoMeasures,
  resolveTimeSignature,
  type MeasureBucket,
} from "./measures.js";
import {
  separateHands,
  formatHand,
  DEFAULT_SPLIT_POINT,
} from "./hands.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_TEMPO = 120;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Convert a MIDI buffer + human-authored config into a complete SongEntry.
 */
export function midiToSongEntry(
  midiBuffer: Uint8Array,
  config: SongConfig,
): SongEntry {
  const midi = parseMidi(midiBuffer);
  const tpb = midi.header.ticksPerBeat ?? 480;
  const splitPoint = config.splitPoint ?? DEFAULT_SPLIT_POINT;

  // 1. Collect tempo + time signature events across all tracks
  const tempoEvents = extractTempoEvents(midi);
  const timeSigEvents = extractTimeSigEvents(midi);

  // 2. Resolve all notes to absolute ticks + durations
  const notes = resolveNotes(midi);

  // 3. Determine effective tempo and time signature
  const effectiveTempo = config.tempo ?? tempoFromEvents(tempoEvents);
  const effectiveTimeSig = resolveTimeSignature(timeSigEvents, config.timeSignature);

  // 4. Compute ticks per measure
  const tpm = ticksPerMeasure(tpb, effectiveTimeSig.numerator, effectiveTimeSig.denominator);

  // 5. Determine total measures
  const totalMeasures = computeTotalMeasures(notes, tpm);

  // 6. Slice notes into measure buckets
  const buckets = sliceIntoMeasures(notes, totalMeasures, tpm);

  // 7. Build measure objects with hand separation + formatting
  const measures = buildMeasures(buckets, tpb, splitPoint, config);

  // 8. Compute duration in seconds
  const lastNoteTick = notes.length > 0
    ? Math.max(...notes.map(n => n.startTick + n.durationTicks))
    : 0;
  const durationSeconds = ticksToSeconds(lastNoteTick, tempoEvents, tpb);

  return {
    id: config.id,
    title: config.title,
    genre: config.genre,
    composer: config.composer,
    arranger: config.arranger,
    difficulty: config.difficulty,
    key: config.key,
    tempo: effectiveTempo,
    timeSignature: `${effectiveTimeSig.numerator}/${effectiveTimeSig.denominator}`,
    durationSeconds: Math.round(durationSeconds),
    musicalLanguage: config.musicalLanguage ?? {
      description: "",
      structure: "",
      keyMoments: [],
      teachingGoals: [],
      styleTips: [],
    },
    measures,
    tags: config.tags,
    source: config.source,
  };
}

// Re-export for barrel convenience
export { midiNoteToScientific } from "./hands.js";

// ─── Internal: Extract Events ────────────────────────────────────────────────

function extractTempoEvents(midi: MidiData): IngestTempoEvent[] {
  const events: IngestTempoEvent[] = [];
  for (const track of midi.tracks) {
    let tick = 0;
    for (const event of track) {
      tick += event.deltaTime;
      if (event.type === "setTempo") {
        events.push({ tick, microsecondsPerBeat: event.microsecondsPerBeat });
      }
    }
  }
  events.sort((a, b) => a.tick - b.tick);
  return events;
}

function extractTimeSigEvents(midi: MidiData): TimeSigEvent[] {
  const events: TimeSigEvent[] = [];
  for (const track of midi.tracks) {
    let tick = 0;
    for (const event of track) {
      tick += event.deltaTime;
      if (event.type === "timeSignature") {
        events.push({
          tick,
          numerator: event.numerator,
          denominator: Math.pow(2, event.denominator),
        });
      }
    }
  }
  events.sort((a, b) => a.tick - b.tick);
  return events;
}

/** Get the initial tempo from MIDI events. */
function tempoFromEvents(events: IngestTempoEvent[]): number {
  if (events.length === 0) return DEFAULT_TEMPO;
  return Math.round(60_000_000 / events[0].microsecondsPerBeat);
}

// ─── Internal: Resolve Notes ─────────────────────────────────────────────────

/** Flatten all tracks into resolved notes with absolute tick positions. */
function resolveNotes(midi: MidiData): ResolvedNote[] {
  const notes: ResolvedNote[] = [];

  for (const track of midi.tracks) {
    let tick = 0;
    const pending = new Map<string, { startTick: number; velocity: number; channel: number; noteNumber: number }>();

    for (const event of track) {
      tick += event.deltaTime;

      if (event.type === "noteOn" && event.velocity > 0) {
        const key = `${event.channel}:${event.noteNumber}`;
        pending.set(key, {
          startTick: tick,
          velocity: event.velocity,
          channel: event.channel,
          noteNumber: event.noteNumber,
        });
      } else if (
        event.type === "noteOff" ||
        (event.type === "noteOn" && event.velocity === 0)
      ) {
        const key = `${event.channel}:${event.noteNumber}`;
        const start = pending.get(key);
        if (start) {
          notes.push({
            noteNumber: start.noteNumber,
            startTick: start.startTick,
            durationTicks: tick - start.startTick,
            velocity: start.velocity,
            channel: start.channel,
          });
          pending.delete(key);
        }
      }
    }
  }

  notes.sort((a, b) => a.startTick - b.startTick || a.noteNumber - b.noteNumber);
  return notes;
}

// ─── Internal: Build Measures ────────────────────────────────────────────────

/** Build Measure objects from measure buckets. */
function buildMeasures(
  buckets: MeasureBucket[],
  ticksPerBeat: number,
  splitPoint: number,
  config: SongConfig,
): Measure[] {
  const overrides = new Map<number, NonNullable<SongConfig["measureOverrides"]>[number]>();
  if (config.measureOverrides) {
    for (const ov of config.measureOverrides) {
      overrides.set(ov.measure, ov);
    }
  }

  return buckets.map(bucket => {
    const { rightHand, leftHand } = separateHands(bucket.notes, splitPoint);

    const measure: Measure = {
      number: bucket.number,
      rightHand: formatHand(rightHand, ticksPerBeat),
      leftHand: formatHand(leftHand, ticksPerBeat),
    };

    const ov = overrides.get(bucket.number);
    if (ov?.fingering) measure.fingering = ov.fingering;
    if (ov?.teachingNote) measure.teachingNote = ov.teachingNote;
    if (ov?.dynamics) measure.dynamics = ov.dynamics;
    if (ov?.tempoOverride) measure.tempoOverride = ov.tempoOverride;

    return measure;
  });
}

// ─── Internal: Tick-to-Time Conversion ───────────────────────────────────────

/** Convert a tick position to seconds, respecting tempo changes. */
function ticksToSeconds(
  targetTick: number,
  tempoEvents: IngestTempoEvent[],
  ticksPerBeat: number,
): number {
  let seconds = 0;
  let currentTick = 0;
  let microsecondsPerBeat = tempoEvents.length > 0
    ? tempoEvents[0].microsecondsPerBeat
    : 500_000; // 120 BPM default

  for (const event of tempoEvents) {
    if (event.tick >= targetTick) break;

    if (event.tick > currentTick) {
      const deltaTicks = event.tick - currentTick;
      seconds += (deltaTicks / ticksPerBeat) * (microsecondsPerBeat / 1_000_000);
      currentTick = event.tick;
    }
    microsecondsPerBeat = event.microsecondsPerBeat;
  }

  if (currentTick < targetTick) {
    const deltaTicks = targetTick - currentTick;
    seconds += (deltaTicks / ticksPerBeat) * (microsecondsPerBeat / 1_000_000);
  }

  return seconds;
}
