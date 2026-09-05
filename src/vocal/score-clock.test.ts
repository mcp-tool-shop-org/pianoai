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

const MIDI = join(process.cwd(), "songs", "library", "folk", "amazing-grace.mid");
const LYRICS = "A-ma-zing grace how sweet the sound that saved a wretch like me";

let song: SongEntry;
beforeAll(() => {
  initializeFromLibrary(join(process.cwd(), "songs", "library"), join(process.cwd(), "tmp", "no-user-songs"));
  song = getSong("amazing-grace")!;
});

describe("parseMidiTracks", () => {
  it("reads the tick map of the arrangement (3/4 at 75 BPM, 384 ppq)", () => {
    const { info, tracks } = parseMidiTracks(readFileSync(MIDI));
    expect(info.ppq).toBe(384);
    expect(info.numerator).toBe(3);
    expect(info.denominator).toBe(4);
    expect(info.bpm).toBeCloseTo(75, 6);
    expect(info.ticksPerMeasure).toBe(1152);
    expect(info.trackNames).toContain("TUBULARBEL");
    const bell = tracks.find((t) => t.name === "TUBULARBEL")!;
    // New Britain: Bb Eb G G F Eb C Bb | Bb Eb G G F Bb
    expect(bell.notes.slice(0, 14).map((n) => n.midi)).toEqual([58, 63, 67, 67, 65, 63, 60, 58, 58, 63, 67, 67, 65, 70]);
    expect(bell.notes[0].tick).toBe(768);
    expect(bell.notes[13].tick).toBe(8064);
    expect(bell.notes[0].durationTicks).toBe(370);
  });
});

describe("sessionSchedule", () => {
  it("follows the player: measures start when the longer hand finishes", () => {
    const s = sessionSchedule(song, 1, 10);
    const starts = s.measureStarts.map((m) => +m.start.toFixed(4));
    expect(starts).toEqual([0, 3.2, 7.0, 10.2, 14.2, 18.2, 21.4, 24.6, 27.8, 31.0]);
    expect(s.endSec).toBeCloseTo(35.0, 6);
    // the right hand alone would drift 0.8 s early from m4 on; the player does not
    const m4 = s.notes.filter((n) => n.measure === 4 && n.hand === "right");
    expect(Math.min(...m4.map((n) => n.t))).toBeCloseTo(10.2, 6);
  });

  it("omits rests but still advances the cursor", () => {
    const s = sessionSchedule(song, 1, 2);
    expect(s.notes.every((n) => n.midi >= 0)).toBe(true);
    const m2 = s.notes.filter((n) => n.measure === 2 && n.midi === 67).map((n) => +n.t.toFixed(4));
    expect(m2).toEqual([3.2, 6.4]);
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
      midiFile: "songs/library/folk/amazing-grace.mid",
      midiBytes: readFileSync(MIDI),
      melodyTrack: "TUBULARBEL",
      lyrics: LYRICS,
      startMeasure: 1,
      endMeasure: 10,
    });
    expect(clock.schema).toBe(SCORE_CLOCK_SCHEMA);
    expect(clock.events).toHaveLength(14);
    expect(clock.events.map((e) => e.lyric).join(" ")).toBe("A ma zing grace how sweet the sound that saved a wretch like me");
    const t = clock.events.map((e) => +e.t_sec.toFixed(4));
    expect(t).toEqual([2.1333, 3.2, 6.4, 7.0, 8.6, 10.2, 13.4, 14.2, 17.4, 18.2, 19.8, 21.4, 23.0, 24.6]);
    // every non-pickup event names the piano note it sits on, same pitch
    for (const e of clock.events.slice(1)) {
      expect(e.anchor.startsWith("piano-onset:")).toBe(true);
      expect(e.engine_note?.t_sec).toBe(e.t_sec);
    }
    expect(clock.events[0].anchor).toBe("hymn-pickup-during-piano-rest");
    expect(clock.events[0].engine_note).toBeNull();
    // "me" holds until the next melody pickup ("I", m9 beat 3)
    expect(clock.events[13].dur_sec).toBeCloseTo(5.6, 4);
    expect(clock.last_event_end_sec).toBeCloseTo(30.2, 4);
    // one length for bed and vocal timeline, sample-exact
    expect(clock.total_samples).toBe(35 * 48000);
    expect(clock.total_seconds).toBe(35);
    for (const e of clock.events) {
      expect(e.t_samples).toBe(Math.round(e.t_sec * 48000));
      expect(roundToSample(e.t_sec)).toBe(e.t_sec);
    }
    // MIDI provenance: the tick map is recorded, not used as the clock
    expect(clock.events[1].midi_tick).toBe(1152);
    expect(clock.events[1].t_midi_sec).toBeCloseTo(2.4, 6);
    expect(clock.midi.ticks_per_measure).toBe(1152);
  });

  it("fails closed on a melody track that is not there", () => {
    expect(() => deriveScoreClock(song, {
      midiFile: "x.mid", midiBytes: readFileSync(MIDI), melodyTrack: "NOPE", lyrics: LYRICS, startMeasure: 1, endMeasure: 10,
    })).toThrow(/melody track 'NOPE'/);
  });
});
