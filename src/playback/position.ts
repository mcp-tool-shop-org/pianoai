// ─── Playback Position Tracker ──────────────────────────────────────────────
//
// Tracks position within a MIDI file during playback: current time, beat,
// estimated measure number, tempo, and provides seek-to-time support.
//
// MIDI files don't inherently have "measures" — we estimate them from the
// time signature (assumed 4/4) and tempo. This gives a good-enough bar
// number for display and teaching hook triggers.
// ─────────────────────────────────────────────────────────────────────────────

import type { ParsedMidi, MidiNoteEvent, TempoEvent } from "../midi/types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

/** Snapshot of playback position at a given moment. */
export interface PositionSnapshot {
  /** Absolute time in seconds (at speed 1.0). */
  timeSec: number;
  /** Current beat number (0-based, fractional). */
  beat: number;
  /** Estimated measure/bar number (1-based). */
  measure: number;
  /** Beat within the current measure (1-based, fractional). */
  beatInMeasure: number;
  /** Current tempo in BPM. */
  bpm: number;
  /** Event index of the nearest event at or before this position. */
  nearestEventIndex: number;
  /** Ratio through the total duration (0–1). */
  ratio: number;
}

/** Position change callback. */
export type PositionCallback = (snapshot: PositionSnapshot) => void;

// ─── Position Tracker ───────────────────────────────────────────────────────

/**
 * Playback position tracker for MIDI files.
 *
 * Given a ParsedMidi, provides:
 * - `snapshotAt(timeSec)` — position info at any time
 * - `eventIndexForTime(timeSec)` — find the event index at a given time
 * - `timeForMeasure(measure)` — seek target for a given measure
 * - `seekEventIndex(timeSec)` — find the event index to resume from
 * - `measures` — estimated total measure count
 *
 * Assumes 4/4 time signature (most MIDI files). Tempo changes are respected.
 */
export class PositionTracker {
  /** Beats per measure (default 4 for 4/4). */
  readonly beatsPerMeasure: number;

  /** Pre-computed beat positions for each tempo segment. */
  private tempoSegments: Array<{
    startTimeSec: number;
    startBeat: number;
    bpm: number;
    secondsPerBeat: number;
  }>;

  /** Total duration in beats. */
  readonly totalBeats: number;

  /** Estimated total measure count. */
  readonly totalMeasures: number;

  constructor(
    public readonly midi: ParsedMidi,
    beatsPerMeasure: number = 4
  ) {
    this.beatsPerMeasure = beatsPerMeasure;
    this.tempoSegments = this.buildTempoSegments();
    this.totalBeats = this.timeToBeat(midi.durationSeconds);
    this.totalMeasures = Math.ceil(this.totalBeats / beatsPerMeasure);
  }

  /**
   * Get a position snapshot at a given time (seconds, at speed 1.0).
   */
  snapshotAt(timeSec: number): PositionSnapshot {
    const clampedTime = Math.max(0, Math.min(timeSec, this.midi.durationSeconds));
    const beat = this.timeToBeat(clampedTime);
    const measure = Math.floor(beat / this.beatsPerMeasure) + 1;
    const beatInMeasure = (beat % this.beatsPerMeasure) + 1;
    const bpm = this.bpmAt(clampedTime);
    const nearestEventIndex = this.eventIndexForTime(clampedTime);
    const ratio = this.midi.durationSeconds > 0
      ? clampedTime / this.midi.durationSeconds
      : 0;

    return {
      timeSec: clampedTime,
      beat,
      measure,
      beatInMeasure,
      bpm,
      nearestEventIndex,
      ratio,
    };
  }

  /**
   * Find the event index of the first event at or after the given time.
   * Returns events.length if past the end.
   */
  eventIndexForTime(timeSec: number): number {
    const events = this.midi.events;
    // Binary search for efficiency
    let lo = 0;
    let hi = events.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (events[mid].time < timeSec) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  /**
   * Get the time (seconds) at the start of a given measure (1-based).
   * Useful for seek operations.
   */
  timeForMeasure(measure: number): number {
    const targetBeat = (measure - 1) * this.beatsPerMeasure;
    return this.beatToTime(targetBeat);
  }

  /**
   * Get the event index to resume playback from after seeking to a time.
   * Same as eventIndexForTime but named clearly for seek use.
   */
  seekEventIndex(timeSec: number): number {
    return this.eventIndexForTime(timeSec);
  }

  /**
   * Get the BPM at a given time.
   */
  bpmAt(timeSec: number): number {
    let bpm = this.midi.bpm;
    for (const seg of this.tempoSegments) {
      if (seg.startTimeSec <= timeSec) {
        bpm = seg.bpm;
      } else {
        break;
      }
    }
    return bpm;
  }

  /**
   * Get all events within a measure (1-based).
   */
  eventsInMeasure(measure: number): MidiNoteEvent[] {
    const startTime = this.timeForMeasure(measure);
    const endTime = this.timeForMeasure(measure + 1);
    return this.midi.events.filter((e) => e.time >= startTime && e.time < endTime);
  }

  /**
   * Get a summary of what's happening at a given measure for teaching purposes.
   */
  measureSummary(measure: number): {
    measure: number;
    events: MidiNoteEvent[];
    noteCount: number;
    avgVelocity: number;
    minNote: number;
    maxNote: number;
    hasChord: boolean;
    bpm: number;
  } {
    const events = this.eventsInMeasure(measure);
    if (events.length === 0) {
      return {
        measure,
        events,
        noteCount: 0,
        avgVelocity: 0,
        minNote: 0,
        maxNote: 0,
        hasChord: false,
        bpm: this.bpmAt(this.timeForMeasure(measure)),
      };
    }

    const velocities = events.map((e) => e.velocity);
    const notes = events.map((e) => e.note);

    // Detect chords: multiple notes within 10ms of each other
    let hasChord = false;
    for (let i = 1; i < events.length; i++) {
      if (events[i].time - events[i - 1].time < 0.01) {
        hasChord = true;
        break;
      }
    }

    // Reduce, not Math.min/max(...spread) — avoids the call-stack limit a
    // large event array could hit (same class of bug as B-A1-001).
    let minNote = notes[0];
    let maxNote = notes[0];
    for (const n of notes) {
      if (n < minNote) minNote = n;
      if (n > maxNote) maxNote = n;
    }

    return {
      measure,
      events,
      noteCount: events.length,
      avgVelocity: Math.round(velocities.reduce((a, b) => a + b, 0) / velocities.length),
      minNote,
      maxNote,
      hasChord,
      bpm: this.bpmAt(events[0].time),
    };
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  /** Build tempo segments from the MIDI's tempo changes. */
  private buildTempoSegments(): Array<{
    startTimeSec: number;
    startBeat: number;
    bpm: number;
    secondsPerBeat: number;
  }> {
    const changes = this.midi.tempoChanges;
    if (changes.length === 0) {
      const spb = 60 / this.midi.bpm;
      return [{ startTimeSec: 0, startBeat: 0, bpm: this.midi.bpm, secondsPerBeat: spb }];
    }

    const segments: Array<{
      startTimeSec: number;
      startBeat: number;
      bpm: number;
      secondsPerBeat: number;
    }> = [];

    let accumulatedBeats = 0;

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      const spb = 60 / change.bpm;

      if (i > 0) {
        const prevSeg = segments[i - 1];
        const timeDelta = change.time - prevSeg.startTimeSec;
        accumulatedBeats = prevSeg.startBeat + timeDelta / prevSeg.secondsPerBeat;
      }

      segments.push({
        startTimeSec: change.time,
        startBeat: accumulatedBeats,
        bpm: change.bpm,
        secondsPerBeat: spb,
      });
    }

    return segments;
  }

  /** Convert absolute time (seconds) to beat number. */
  private timeToBeat(timeSec: number): number {
    // Find the active tempo segment
    let seg = this.tempoSegments[0];
    for (const s of this.tempoSegments) {
      if (s.startTimeSec <= timeSec) {
        seg = s;
      } else {
        break;
      }
    }

    const timeSinceSegStart = timeSec - seg.startTimeSec;
    return seg.startBeat + timeSinceSegStart / seg.secondsPerBeat;
  }

  /** Convert beat number to absolute time (seconds). */
  private beatToTime(beat: number): number {
    // Find the active tempo segment for this beat
    let seg = this.tempoSegments[0];
    for (const s of this.tempoSegments) {
      if (s.startBeat <= beat) {
        seg = s;
      } else {
        break;
      }
    }

    const beatsSinceSegStart = beat - seg.startBeat;
    return seg.startTimeSec + beatsSinceSegStart * seg.secondsPerBeat;
  }
}

/**
 * Create a PositionTracker for a parsed MIDI file.
 */
export function createPositionTracker(
  midi: ParsedMidi,
  beatsPerMeasure: number = 4
): PositionTracker {
  return new PositionTracker(midi, beatsPerMeasure);
}
