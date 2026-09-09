import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { initializeFromLibrary, getSong } from "../songs/index.js";
import type { SongEntry } from "../songs/types.js";
import {
  parseMidiTracks,
  sessionSchedule,
  syllabify,
  deriveScoreClock,
  roundToSample,
  SCORE_CLOCK_SCHEMA,
} from "./score-clock.js";

const MIDI = join(process.cwd(), "songs", "library", "classical", "satie-gymnopedie-no1.mid");
const LYRICS = "Gym-no-pe-die";

let song: SongEntry;
beforeAll(() => {
  initializeFromLibrary(join(process.cwd(), "songs", "library"), join(process.cwd(), "tmp", "no-user-songs"));
  song = getSong("satie-gymnopedie-no1")!;
});

describe("parseMidiTracks", () => {
  it("reads the tick map of the arrangement (3/4 at 60 BPM, 384 ppq)", () => {
    const { info, tracks } = parseMidiTracks(readFileSync(MIDI));
    expect(info.ppq).toBe(384);
    expect(info.numerator).toBe(3);
    expect(info.denominator).toBe(4);
    expect(info.bpm).toBeCloseTo(60, 6);
    expect(info.ticksPerMeasure).toBe(1152);
    expect(info.trackNames).toContain("treble:");
    const treble = tracks.find((t) => t.name === "treble:")!;
    // Gymnopédie opening: B D F# / A C# F# (two voicings of the vamp)
    expect(treble.notes.slice(0, 14).map((n) => n.midi)).toEqual([59, 62, 66, 57, 61, 66, 59, 62, 66, 57, 61, 66, 59, 62]);
    expect(treble.notes[0].tick).toBe(384);
    expect(treble.notes[13].tick).toBe(4992);
    expect(treble.notes[0].durationTicks).toBe(768);
  });
});

describe("sessionSchedule", () => {
  it("follows the player: measures start when the longer hand finishes", () => {
    const s = sessionSchedule(song, 1, 10);
    const starts = s.measureStarts.map((m) => +m.start.toFixed(4));
    expect(starts).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45]);
    expect(s.endSec).toBeCloseTo(50, 6);
    const m4 = s.notes.filter((n) => n.measure === 4 && n.hand === "right");
    expect(Math.min(...m4.map((n) => n.t))).toBeCloseTo(15, 6);
  });

  it("omits rests but still advances the cursor", () => {
    const s = sessionSchedule(song, 1, 2);
    expect(s.notes.every((n) => n.midi >= 0)).toBe(true);
    const m2 = s.notes.filter((n) => n.measure === 2 && n.midi === 61).map((n) => +n.t.toFixed(4));
    expect(m2).toEqual([5]);
  });
});

describe("syllabify", () => {
  it("keeps the whole word a transcriber will report", () => {
    const s = syllabify("A-ma-zing grace");
    expect(s).toEqual([
      { lyric: "A", word: "Amazing", syllable: 0, syllables: 3 },
      { lyric: "ma", word: "Amazing", syllable: 1, syllables: 3 },
      { lyric: "zing", word: "Amazing", syllable: 2, syllables: 3 },
      { lyric: "grace", word: "grace", syllable: 0, syllables: 1 },
    ]);
  });
});

describe("deriveScoreClock", () => {
  it("puts every syllable on a piano onset of the same pitch, on the session clock", () => {
    const clock = deriveScoreClock(song, {
      midiFile: "songs/library/classical/satie-gymnopedie-no1.mid",
      midiBytes: readFileSync(MIDI),
      melodyTrack: "bass:",
      lyrics: LYRICS,
      startMeasure: 1,
      endMeasure: 8,
    });
    expect(clock.schema).toBe(SCORE_CLOCK_SCHEMA);
    expect(clock.events).toHaveLength(4);
    expect(clock.events.map((e) => e.lyric).join(" ")).toBe("Gym no pe die");
    const t = clock.events.map((e) => +e.t_sec.toFixed(4));
    expect(t).toEqual([0, 5, 10, 15]);
    for (const e of clock.events) {
      expect(e.anchor.startsWith("piano-onset:")).toBe(true);
      expect(e.engine_note?.t_sec).toBe(e.t_sec);
    }
    expect(clock.events[3].dur_sec).toBeCloseTo(5, 4);
    expect(clock.last_event_end_sec).toBeCloseTo(20, 4);
    expect(clock.total_samples).toBe(40 * 48000);
    expect(clock.total_seconds).toBe(40);
    for (const e of clock.events) {
      expect(e.t_samples).toBe(Math.round(e.t_sec * 48000));
      expect(roundToSample(e.t_sec)).toBe(e.t_sec);
    }
    expect(clock.events[1].midi_tick).toBe(1152);
    expect(clock.events[1].t_midi_sec).toBeCloseTo(3, 6);
    expect(clock.midi.ticks_per_measure).toBe(1152);
  });

  it("fails closed on a melody track that is not there", () => {
    expect(() => deriveScoreClock(song, {
      midiFile: "x.mid", midiBytes: readFileSync(MIDI), melodyTrack: "NOPE", lyrics: LYRICS, startMeasure: 1, endMeasure: 8,
    })).toThrow(/melody track 'NOPE'/);
  });
});
