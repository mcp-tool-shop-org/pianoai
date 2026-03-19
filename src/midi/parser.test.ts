// ─── MIDI Parser + Schema Tests ─────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { writeMidi } from "midi-file";
import { parseMidiBuffer } from "./parser.js";
import {
  PlaySourceSchema,
  LibraryPlaySchema,
  FilePlaySchema,
  UrlPlaySchema,
} from "../schemas.js";

// ─── Helper: build a minimal MIDI file buffer ──────────────────────────────

function buildMidiBuffer(opts: {
  ticksPerBeat?: number;
  bpm?: number;
  notes?: Array<{
    note: number;
    velocity: number;
    startTick: number;
    endTick: number;
    channel?: number;
  }>;
  trackName?: string;
}): Uint8Array {
  const ticksPerBeat = opts.ticksPerBeat ?? 480;
  const bpm = opts.bpm ?? 120;
  const usPerBeat = Math.round(60_000_000 / bpm);
  const notes = opts.notes ?? [];

  // Build a single-track MIDI with tempo + notes
  type MidiEvent = {
    deltaTime: number;
    type: string;
    meta?: boolean;
    [key: string]: any;
  };

  const events: MidiEvent[] = [];

  // Tempo event at tick 0
  events.push({
    deltaTime: 0,
    type: "setTempo",
    meta: true,
    microsecondsPerBeat: usPerBeat,
  });

  // Track name if provided
  if (opts.trackName) {
    events.push({
      deltaTime: 0,
      type: "trackName",
      meta: true,
      text: opts.trackName,
    });
  }

  // Collect all note-on and note-off events
  const raw: Array<{ tick: number; event: MidiEvent }> = [];
  for (const n of notes) {
    raw.push({
      tick: n.startTick,
      event: {
        deltaTime: 0, // filled below
        type: "noteOn",
        channel: n.channel ?? 0,
        noteNumber: n.note,
        velocity: n.velocity,
      },
    });
    raw.push({
      tick: n.endTick,
      event: {
        deltaTime: 0,
        type: "noteOff",
        channel: n.channel ?? 0,
        noteNumber: n.note,
        velocity: 0,
      },
    });
  }

  // Sort by tick
  raw.sort((a, b) => a.tick - b.tick);

  // Convert to delta times
  let prevTick = 0;
  for (const r of raw) {
    r.event.deltaTime = r.tick - prevTick;
    prevTick = r.tick;
    events.push(r.event);
  }

  // End of track
  events.push({ deltaTime: 0, type: "endOfTrack", meta: true });

  const midiData = {
    header: {
      format: 0 as const,
      numTracks: 1,
      ticksPerBeat,
    },
    tracks: [events],
  };

  return new Uint8Array(writeMidi(midiData as any));
}

// ─── Parser Tests ───────────────────────────────────────────────────────────

describe("parseMidiBuffer", () => {
  it("parses a single note at 120 BPM", () => {
    // One quarter note at middle C, starting at beat 0
    const buf = buildMidiBuffer({
      bpm: 120,
      ticksPerBeat: 480,
      notes: [{ note: 60, velocity: 100, startTick: 0, endTick: 480 }],
    });

    const parsed = parseMidiBuffer(buf);

    expect(parsed.noteCount).toBe(1);
    expect(parsed.bpm).toBe(120);
    expect(parsed.ticksPerBeat).toBe(480);
    expect(parsed.format).toBe(0);

    const event = parsed.events[0];
    expect(event.note).toBe(60);
    expect(event.velocity).toBe(100);
    expect(event.time).toBeCloseTo(0, 3);
    // At 120 BPM, one quarter note = 0.5 seconds
    expect(event.duration).toBeCloseTo(0.5, 3);
  });

  it("handles multiple notes with correct timing", () => {
    const buf = buildMidiBuffer({
      bpm: 120,
      ticksPerBeat: 480,
      notes: [
        { note: 60, velocity: 80, startTick: 0, endTick: 480 },
        { note: 64, velocity: 90, startTick: 480, endTick: 960 },
        { note: 67, velocity: 100, startTick: 960, endTick: 1440 },
      ],
    });

    const parsed = parseMidiBuffer(buf);

    expect(parsed.noteCount).toBe(3);

    // C4 at 0s, E4 at 0.5s, G4 at 1.0s (each 0.5s long at 120 BPM)
    expect(parsed.events[0].note).toBe(60);
    expect(parsed.events[0].time).toBeCloseTo(0, 3);

    expect(parsed.events[1].note).toBe(64);
    expect(parsed.events[1].time).toBeCloseTo(0.5, 3);

    expect(parsed.events[2].note).toBe(67);
    expect(parsed.events[2].time).toBeCloseTo(1.0, 3);

    // Total duration: 3 quarter notes at 0.5s each = 1.5s
    expect(parsed.durationSeconds).toBeCloseTo(1.5, 3);
  });

  it("extracts track names", () => {
    const buf = buildMidiBuffer({
      trackName: "Grand Piano",
      notes: [{ note: 60, velocity: 100, startTick: 0, endTick: 480 }],
    });

    const parsed = parseMidiBuffer(buf);
    expect(parsed.trackNames).toContain("Grand Piano");
  });

  it("handles simultaneous notes (chords)", () => {
    const buf = buildMidiBuffer({
      bpm: 120,
      ticksPerBeat: 480,
      notes: [
        // C major chord at time 0
        { note: 60, velocity: 100, startTick: 0, endTick: 960 },
        { note: 64, velocity: 100, startTick: 0, endTick: 960 },
        { note: 67, velocity: 100, startTick: 0, endTick: 960 },
      ],
    });

    const parsed = parseMidiBuffer(buf);

    expect(parsed.noteCount).toBe(3);
    // All start at time 0
    expect(parsed.events[0].time).toBeCloseTo(0, 3);
    expect(parsed.events[1].time).toBeCloseTo(0, 3);
    expect(parsed.events[2].time).toBeCloseTo(0, 3);
    // All 1 second long (2 quarter notes at 120 BPM)
    for (const e of parsed.events) {
      expect(e.duration).toBeCloseTo(1.0, 3);
    }
  });

  it("returns defaults for empty MIDI (no notes)", () => {
    const buf = buildMidiBuffer({ notes: [] });
    const parsed = parseMidiBuffer(buf);

    expect(parsed.noteCount).toBe(0);
    expect(parsed.events).toEqual([]);
    expect(parsed.durationSeconds).toBe(0);
    expect(parsed.bpm).toBe(120);
  });

  it("rejects oversized MIDI buffers (>10 MB)", () => {
    const huge = new Uint8Array(11 * 1024 * 1024);
    expect(() => parseMidiBuffer(huge)).toThrow("too large");
  });
});

// ─── Schema Tests ───────────────────────────────────────────────────────────

describe("PlaySourceSchema", () => {
  it("accepts songId", () => {
    const result = PlaySourceSchema.safeParse({ songId: "let-it-be" });
    expect(result.success).toBe(true);
  });

  it("accepts midiPath", () => {
    const result = PlaySourceSchema.safeParse({ midiPath: "/home/user/song.mid" });
    expect(result.success).toBe(true);
  });

  it("accepts midiUrl", () => {
    const result = PlaySourceSchema.safeParse({ midiUrl: "https://example.com/song.mid" });
    expect(result.success).toBe(true);
  });

  it("rejects empty object", () => {
    const result = PlaySourceSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects invalid URL", () => {
    const result = UrlPlaySchema.safeParse({ midiUrl: "not-a-url" });
    expect(result.success).toBe(false);
  });
});
