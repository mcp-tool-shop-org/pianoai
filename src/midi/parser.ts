// ─── MIDI File Parser ───────────────────────────────────────────────────────
//
// Parses standard MIDI files (.mid) into a flat list of timed note events.
// Handles format 0 (single track) and format 1 (multi-track) files.
// Resolves tempo changes to produce absolute timestamps in seconds.
//
// Usage:
//   import { parseMidiFile, parseMidiBuffer } from "./midi/parser.js";
//   const parsed = await parseMidiFile("/path/to/song.mid");
//   // or
//   const parsed = parseMidiBuffer(fs.readFileSync("song.mid"));
// ─────────────────────────────────────────────────────────────────────────────

import { readFile } from "node:fs/promises";
import { parseMidi } from "midi-file";
import type { MidiNoteEvent, TempoEvent, ParsedMidi } from "./types.js";

/** Default MIDI tempo: 120 BPM = 500,000 microseconds per beat. */
const DEFAULT_USPB = 500_000;

// ─── Internal Types ─────────────────────────────────────────────────────────

/** A pending note-on waiting for its matching note-off. */
interface PendingNote {
  note: number;
  velocity: number;
  channel: number;
  tickTime: number;
}

/** Raw tempo change in tick-space (before conversion to seconds). */
interface RawTempo {
  tick: number;
  microsecondsPerBeat: number;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Parse a MIDI file from disk.
 *
 * @param filePath Absolute or relative path to a .mid file.
 * @returns Parsed MIDI data with absolute-timed note events.
 */
export async function parseMidiFile(filePath: string): Promise<ParsedMidi> {
  const buffer = await readFile(filePath);
  return parseMidiBuffer(buffer);
}

/**
 * Parse a MIDI file from a Buffer.
 *
 * @param buffer Raw MIDI file bytes.
 * @returns Parsed MIDI data with absolute-timed note events.
 */
export function parseMidiBuffer(buffer: Buffer | Uint8Array): ParsedMidi {
  // Guard against oversized MIDI files (10 MB max)
  if (buffer.length > 10 * 1024 * 1024) {
    throw new Error(`MIDI file too large: ${(buffer.length / 1024 / 1024).toFixed(1)} MB (max 10 MB)`);
  }

  const midi = parseMidi(buffer as any);
  const header = midi.header;

  // Guard against excessive track count
  if (header.numTracks > 100) {
    throw new Error(`Too many MIDI tracks: ${header.numTracks} (max 100)`);
  }

  const ticksPerBeat = header.ticksPerBeat;
  if (!ticksPerBeat) {
    throw new Error(
      "SMPTE timing not supported. Only ticksPerBeat MIDI files are handled."
    );
  }

  // ── Pass 1: Extract tempo changes and track names from all tracks ──

  const rawTempos: RawTempo[] = [];
  const trackNames: string[] = [];

  for (const track of midi.tracks) {
    let tickCursor = 0;
    for (const event of track) {
      tickCursor += event.deltaTime;

      if (event.type === "setTempo") {
        rawTempos.push({
          tick: tickCursor,
          microsecondsPerBeat: (event as any).microsecondsPerBeat,
        });
      }
      if (event.type === "trackName") {
        const name = (event as any).text;
        if (name && !trackNames.includes(name)) {
          trackNames.push(name);
        }
      }
    }
  }

  // Sort tempos by tick (should already be, but be safe)
  rawTempos.sort((a, b) => a.tick - b.tick);

  // Ensure there's at least one tempo entry
  if (rawTempos.length === 0) {
    rawTempos.push({ tick: 0, microsecondsPerBeat: DEFAULT_USPB });
  }

  // Build tempo map: tick → seconds converter
  const tempoMap = buildTempoMap(rawTempos, ticksPerBeat);

  // ── Pass 2: Extract note events from all tracks ──

  const events: MidiNoteEvent[] = [];

  for (const track of midi.tracks) {
    let tickCursor = 0;
    const pending = new Map<string, PendingNote[]>(); // "channel-note" → stack

    for (const event of track) {
      tickCursor += event.deltaTime;

      const isNoteOn =
        event.type === "noteOn" && (event as any).velocity > 0;
      const isNoteOff =
        event.type === "noteOff" ||
        (event.type === "noteOn" && (event as any).velocity === 0);

      if (isNoteOn) {
        const key = `${(event as any).channel}-${(event as any).noteNumber}`;
        if (!pending.has(key)) pending.set(key, []);
        pending.get(key)!.push({
          note: (event as any).noteNumber,
          velocity: (event as any).velocity,
          channel: (event as any).channel,
          tickTime: tickCursor,
        });
      } else if (isNoteOff) {
        const key = `${(event as any).channel}-${(event as any).noteNumber}`;
        const stack = pending.get(key);
        if (stack && stack.length > 0) {
          const on = stack.shift()!;
          const startSec = tickToSeconds(on.tickTime, tempoMap);
          const endSec = tickToSeconds(tickCursor, tempoMap);

          events.push({
            note: on.note,
            velocity: on.velocity,
            time: startSec,
            duration: Math.max(0.001, endSec - startSec), // minimum 1ms
            channel: on.channel,
          });
        }
      }
    }

    // Flush any pending notes (note-on without note-off) with 1s duration
    for (const stack of pending.values()) {
      for (const on of stack) {
        const startSec = tickToSeconds(on.tickTime, tempoMap);
        events.push({
          note: on.note,
          velocity: on.velocity,
          time: startSec,
          duration: 1.0,
          channel: on.channel,
        });
      }
    }
  }

  // Sort by time, then by note (for stable ordering)
  events.sort((a, b) => a.time - b.time || a.note - b.note);

  // Calculate total duration.
  // A plain loop, not Math.max(...spread) — V8 throws RangeError: Maximum
  // call stack size exceeded once a spread argument list crosses roughly
  // 65,000-125,000 elements, which a dense but entirely legitimate
  // orchestral/game-soundtrack MIDI import can exceed while staying under
  // this file's own 10MB/100-track guards (B-A1-001).
  let durationSeconds = 0;
  for (const e of events) {
    const end = e.time + e.duration;
    if (end > durationSeconds) durationSeconds = end;
  }

  // Build tempo events list
  const tempoChanges: TempoEvent[] = rawTempos.map((rt) => ({
    time: tickToSeconds(rt.tick, tempoMap),
    bpm: Math.round((60_000_000 / rt.microsecondsPerBeat) * 100) / 100,
    microsecondsPerBeat: rt.microsecondsPerBeat,
  }));

  const initialBpm =
    Math.round((60_000_000 / rawTempos[0].microsecondsPerBeat) * 100) / 100;

  return {
    durationSeconds,
    events,
    tempoChanges,
    bpm: initialBpm,
    trackNames,
    format: header.format,
    ticksPerBeat,
    trackCount: header.numTracks,
    noteCount: events.length,
  };
}

// ─── Tempo Map ──────────────────────────────────────────────────────────────

/**
 * A tempo map entry: from this tick onward, each tick = this many seconds.
 */
interface TempoMapEntry {
  tick: number;
  secondsAtTick: number;
  secondsPerTick: number;
}

/**
 * Build a tempo map that converts tick positions to absolute seconds.
 *
 * Each entry records: "starting at tick N, we're at T seconds,
 * and each tick = S seconds."
 */
function buildTempoMap(
  rawTempos: RawTempo[],
  ticksPerBeat: number
): TempoMapEntry[] {
  const map: TempoMapEntry[] = [];
  let prevTick = 0;
  let prevSeconds = 0;
  let prevSecondsPerTick = DEFAULT_USPB / 1_000_000 / ticksPerBeat;

  for (const rt of rawTempos) {
    // Accumulate time from previous entry to this tempo change
    const elapsedTicks = rt.tick - prevTick;
    const elapsedSeconds = elapsedTicks * prevSecondsPerTick;
    const secondsAtTick = prevSeconds + elapsedSeconds;

    const secondsPerTick = rt.microsecondsPerBeat / 1_000_000 / ticksPerBeat;

    map.push({
      tick: rt.tick,
      secondsAtTick,
      secondsPerTick,
    });

    prevTick = rt.tick;
    prevSeconds = secondsAtTick;
    prevSecondsPerTick = secondsPerTick;
  }

  return map;
}

/**
 * Convert an absolute tick position to seconds using the tempo map.
 */
function tickToSeconds(tick: number, map: TempoMapEntry[]): number {
  // Find the last tempo entry at or before this tick
  let entry = map[0];
  for (let i = 1; i < map.length; i++) {
    if (map[i].tick <= tick) {
      entry = map[i];
    } else {
      break;
    }
  }

  const elapsedTicks = tick - entry.tick;
  return entry.secondsAtTick + elapsedTicks * entry.secondsPerTick;
}
