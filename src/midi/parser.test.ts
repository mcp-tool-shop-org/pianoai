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

// ─── Edge Case Tests ───────────────────────────────────────────────────────

/** Build a raw MIDI buffer from track event arrays (multi-track support). */
function buildRawMidi(
  tracks: Array<Array<{ deltaTime: number; type: string; [key: string]: any }>>,
  opts: { format?: 0 | 1; ticksPerBeat?: number } = {}
): Uint8Array {
  const format = opts.format ?? 0;
  const ticksPerBeat = opts.ticksPerBeat ?? 480;
  return new Uint8Array(writeMidi({
    header: { format: format as any, numTracks: tracks.length, ticksPerBeat },
    tracks,
  } as any));
}

describe("parseMidiBuffer edge cases", () => {

  // ── Malformed MIDI data ───────────────────────────────────────────────

  describe("malformed MIDI data", () => {
    it("throws on completely invalid (non-MIDI) bytes", () => {
      const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]);
      expect(() => parseMidiBuffer(garbage)).toThrow();
    });

    it("throws on empty buffer", () => {
      const empty = new Uint8Array(0);
      expect(() => parseMidiBuffer(empty)).toThrow();
    });

    it("throws on excessive track count (>100)", () => {
      type MidiEvent = { deltaTime: number; type: string; [key: string]: any };
      const tracks: MidiEvent[][] = [];
      for (let i = 0; i < 101; i++) {
        tracks.push([{ deltaTime: 0, type: "endOfTrack", meta: true }]);
      }
      const buf = buildRawMidi(tracks, { format: 1 });
      expect(() => parseMidiBuffer(buf)).toThrow(/too many.*tracks/i);
    });

    it("handles noteOn with velocity 0 as noteOff", () => {
      const events = [
        { deltaTime: 0, type: "setTempo", meta: true, microsecondsPerBeat: 500000 },
        { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 60, velocity: 100 },
        { deltaTime: 480, type: "noteOn", channel: 0, noteNumber: 60, velocity: 0 },
        { deltaTime: 0, type: "endOfTrack", meta: true },
      ];
      const buf = buildRawMidi([events]);
      const parsed = parseMidiBuffer(buf);

      expect(parsed.events).toHaveLength(1);
      expect(parsed.events[0].note).toBe(60);
      expect(parsed.events[0].duration).toBeGreaterThan(0);
    });

    it("handles orphaned noteOn (no matching noteOff) with 1s fallback duration", () => {
      const events = [
        { deltaTime: 0, type: "setTempo", meta: true, microsecondsPerBeat: 500000 },
        { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 72, velocity: 80 },
        { deltaTime: 0, type: "endOfTrack", meta: true },
      ];
      const buf = buildRawMidi([events]);
      const parsed = parseMidiBuffer(buf);

      expect(parsed.events).toHaveLength(1);
      expect(parsed.events[0].note).toBe(72);
      expect(parsed.events[0].duration).toBeCloseTo(1.0);
    });
  });

  // ── Empty tracks ──────────────────────────────────────────────────────

  describe("empty tracks", () => {
    it("parses MIDI with no note events (only meta events)", () => {
      const events = [
        { deltaTime: 0, type: "setTempo", meta: true, microsecondsPerBeat: 500000 },
        { deltaTime: 0, type: "endOfTrack", meta: true },
      ];
      const buf = buildRawMidi([events]);
      const parsed = parseMidiBuffer(buf);

      expect(parsed.events).toHaveLength(0);
      expect(parsed.noteCount).toBe(0);
      expect(parsed.durationSeconds).toBe(0);
    });

    it("parses format 1 MIDI where some tracks are empty", () => {
      const tempoTrack = [
        { deltaTime: 0, type: "setTempo", meta: true, microsecondsPerBeat: 500000 },
        { deltaTime: 0, type: "endOfTrack", meta: true },
      ];
      const emptyTrack = [
        { deltaTime: 0, type: "endOfTrack", meta: true },
      ];
      const noteTrack = [
        { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 60, velocity: 100 },
        { deltaTime: 480, type: "noteOff", channel: 0, noteNumber: 60, velocity: 0 },
        { deltaTime: 0, type: "endOfTrack", meta: true },
      ];

      const buf = buildRawMidi([tempoTrack, emptyTrack, noteTrack], { format: 1 });
      const parsed = parseMidiBuffer(buf);

      expect(parsed.events).toHaveLength(1);
      expect(parsed.events[0].note).toBe(60);
      expect(parsed.trackCount).toBe(3);
    });

    it("handles MIDI with only endOfTrack events", () => {
      const track = [{ deltaTime: 0, type: "endOfTrack", meta: true }];
      const buf = buildRawMidi([track]);
      const parsed = parseMidiBuffer(buf);

      expect(parsed.events).toHaveLength(0);
      expect(parsed.durationSeconds).toBe(0);
    });
  });

  // ── Unusual time signatures ───────────────────────────────────────────

  describe("unusual time signatures", () => {
    it("parses 3/4 time correctly", () => {
      const buf = buildMidiBuffer({
        bpm: 120,
        ticksPerBeat: 480,
        notes: [
          { note: 60, velocity: 100, startTick: 0, endTick: 480 },
          { note: 64, velocity: 100, startTick: 480, endTick: 960 },
          { note: 67, velocity: 100, startTick: 960, endTick: 1440 },
        ],
      });
      const parsed = parseMidiBuffer(buf);

      expect(parsed.events).toHaveLength(3);
      expect(parsed.events[0].time).toBeCloseTo(0);
      expect(parsed.events[1].time).toBeCloseTo(0.5);
      expect(parsed.events[2].time).toBeCloseTo(1.0);
    });

    it("parses 5/4 time (5 quarter notes per measure)", () => {
      const notes = [];
      for (let i = 0; i < 5; i++) {
        notes.push({ note: 60 + i, velocity: 100, startTick: i * 480, endTick: (i + 1) * 480 });
      }
      const buf = buildMidiBuffer({ bpm: 120, ticksPerBeat: 480, notes });
      const parsed = parseMidiBuffer(buf);

      expect(parsed.events).toHaveLength(5);
      // Last note starts at 2.0s with 0.5s duration = 2.5s total
      expect(parsed.durationSeconds).toBeCloseTo(2.5);
    });

    it("parses 7/8 time (7 eighth notes per measure)", () => {
      const notes = [];
      for (let i = 0; i < 7; i++) {
        notes.push({ note: 60 + (i % 7), velocity: 80, startTick: i * 240, endTick: (i + 1) * 240 });
      }
      const buf = buildMidiBuffer({ bpm: 120, ticksPerBeat: 480, notes });
      const parsed = parseMidiBuffer(buf);

      expect(parsed.events).toHaveLength(7);
      // Each eighth = 0.25s at 120 BPM (480 ticks/beat, 240 ticks = half beat)
      expect(parsed.events[1].time).toBeCloseTo(0.25);
    });

    it("parses 6/8 compound time", () => {
      // Two groups of 3 eighth notes
      const notes = [];
      for (let i = 0; i < 6; i++) {
        notes.push({ note: 60 + (i % 3), velocity: 90, startTick: i * 240, endTick: (i + 1) * 240 });
      }
      const buf = buildMidiBuffer({ bpm: 120, ticksPerBeat: 480, notes });
      const parsed = parseMidiBuffer(buf);

      expect(parsed.events).toHaveLength(6);
      expect(parsed.events[0].duration).toBeCloseTo(0.25);
    });
  });

  // ── Tempo changes mid-file ────────────────────────────────────────────

  describe("tempo changes mid-file", () => {
    it("handles accelerando (tempo increase mid-file)", () => {
      const events = [
        { deltaTime: 0, type: "setTempo", meta: true, microsecondsPerBeat: 500000 }, // 120 BPM
        { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 60, velocity: 100 },
        { deltaTime: 480, type: "noteOff", channel: 0, noteNumber: 60, velocity: 0 },
        { deltaTime: 0, type: "setTempo", meta: true, microsecondsPerBeat: 250000 }, // 240 BPM
        { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 64, velocity: 100 },
        { deltaTime: 480, type: "noteOff", channel: 0, noteNumber: 64, velocity: 0 },
        { deltaTime: 0, type: "endOfTrack", meta: true },
      ];
      const buf = buildRawMidi([events]);
      const parsed = parseMidiBuffer(buf);

      expect(parsed.events).toHaveLength(2);
      expect(parsed.events[0].duration).toBeCloseTo(0.5);
      expect(parsed.events[1].duration).toBeCloseTo(0.25);
      expect(parsed.tempoChanges).toHaveLength(2);
    });

    it("uses default 120 BPM when no setTempo event is present", () => {
      const events = [
        { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 60, velocity: 100 },
        { deltaTime: 480, type: "noteOff", channel: 0, noteNumber: 60, velocity: 0 },
        { deltaTime: 0, type: "endOfTrack", meta: true },
      ];
      const buf = buildRawMidi([events]);
      const parsed = parseMidiBuffer(buf);

      expect(parsed.bpm).toBeCloseTo(120);
      expect(parsed.events[0].duration).toBeCloseTo(0.5);
    });
  });

  // ── Multi-track (format 1) ────────────────────────────────────────────

  describe("multi-track format 1", () => {
    it("merges notes from multiple tracks sorted by time then note", () => {
      const tempoTrack = [
        { deltaTime: 0, type: "setTempo", meta: true, microsecondsPerBeat: 500000 },
        { deltaTime: 0, type: "trackName", meta: true, text: "Tempo" },
        { deltaTime: 0, type: "endOfTrack", meta: true },
      ];
      const track1 = [
        { deltaTime: 0, type: "trackName", meta: true, text: "Right Hand" },
        { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 72, velocity: 100 },
        { deltaTime: 480, type: "noteOff", channel: 0, noteNumber: 72, velocity: 0 },
        { deltaTime: 0, type: "endOfTrack", meta: true },
      ];
      const track2 = [
        { deltaTime: 0, type: "trackName", meta: true, text: "Left Hand" },
        { deltaTime: 0, type: "noteOn", channel: 1, noteNumber: 48, velocity: 80 },
        { deltaTime: 480, type: "noteOff", channel: 1, noteNumber: 48, velocity: 0 },
        { deltaTime: 0, type: "endOfTrack", meta: true },
      ];

      const buf = buildRawMidi([tempoTrack, track1, track2], { format: 1 });
      const parsed = parseMidiBuffer(buf);

      expect(parsed.events).toHaveLength(2);
      expect(parsed.trackNames).toContain("Right Hand");
      expect(parsed.trackNames).toContain("Left Hand");
      expect(parsed.format).toBe(1);
      // Both at time 0, sorted by note number (48 < 72)
      expect(parsed.events[0].note).toBe(48);
      expect(parsed.events[1].note).toBe(72);
    });

    it("deduplicates track names", () => {
      const track = [
        { deltaTime: 0, type: "trackName", meta: true, text: "Lead" },
        { deltaTime: 0, type: "trackName", meta: true, text: "Lead" },
        { deltaTime: 0, type: "endOfTrack", meta: true },
      ];
      const buf = buildRawMidi([track]);
      const parsed = parseMidiBuffer(buf);

      expect(parsed.trackNames).toEqual(["Lead"]);
    });
  });

  // ── Minimum duration guard ────────────────────────────────────────────

  describe("minimum duration guard", () => {
    it("enforces minimum 1ms duration for zero-length notes", () => {
      const events = [
        { deltaTime: 0, type: "setTempo", meta: true, microsecondsPerBeat: 500000 },
        { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: 60, velocity: 100 },
        { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: 60, velocity: 0 },
        { deltaTime: 0, type: "endOfTrack", meta: true },
      ];
      const buf = buildRawMidi([events]);
      const parsed = parseMidiBuffer(buf);

      expect(parsed.events).toHaveLength(1);
      expect(parsed.events[0].duration).toBeCloseTo(0.001);
    });
  });
});
