import { describe, it, expect } from "vitest";
import {
  flattenSongToExpected, scorePerformance,
  computeVerdictWindows, computeMeasureStartTimes, secondsToMeasureBeat,
} from "./score-performance.js";
import type { SongEntry } from "./songs/types.js";
import type { MidiNoteEvent } from "./midi/types.js";

// Minimal song factory for testing
function makeSong(overrides: Partial<SongEntry> = {}): SongEntry {
  return {
    id: "test-song",
    title: "Test Song",
    genre: "classical" as any,
    difficulty: "beginner" as any,
    key: "C major",
    tempo: 120,
    timeSignature: "4/4",
    durationSeconds: 10,
    status: "ready" as any,
    measures: [
      { number: 1, rightHand: "C4:q E4:q G4:q C5:q", leftHand: "" },
    ],
    musicalLanguage: {
      description: "test", structure: "test",
      keyMoments: [], teachingGoals: [], styleTips: [],
    },
    tags: [],
    ...overrides,
  };
}

function makeEvent(note: number, time: number, velocity = 80): MidiNoteEvent {
  return { note, time, duration: 0.5, velocity, channel: 0 };
}

describe("flattenSongToExpected", () => {
  it("flattens single-measure song into expected notes", () => {
    const song = makeSong();
    const expected = flattenSongToExpected(song);

    expect(expected).toHaveLength(4);
    expect(expected[0].note).toBe(60);  // C4
    expect(expected[1].note).toBe(64);  // E4
    expect(expected[2].note).toBe(67);  // G4
    expect(expected[3].note).toBe(72);  // C5
    expect(expected[0].hand).toBe("right");
    expect(expected[0].measure).toBe(1);
  });

  it("assigns sequential timing based on tempo", () => {
    const song = makeSong({ tempo: 120 }); // quarter = 500ms = 0.5s
    const expected = flattenSongToExpected(song);

    expect(expected[0].time).toBeCloseTo(0, 2);
    expect(expected[1].time).toBeCloseTo(0.5, 2);
    expect(expected[2].time).toBeCloseTo(1.0, 2);
    expect(expected[3].time).toBeCloseTo(1.5, 2);
  });

  it("handles both hands", () => {
    const song = makeSong({
      measures: [
        { number: 1, rightHand: "E4:q", leftHand: "C3:q" },
      ],
    });
    const expected = flattenSongToExpected(song);

    expect(expected).toHaveLength(2);
    const rh = expected.find(n => n.hand === "right");
    const lh = expected.find(n => n.hand === "left");
    expect(rh?.note).toBe(64);  // E4
    expect(lh?.note).toBe(48);  // C3
  });

  it("skips rests", () => {
    const song = makeSong({
      measures: [
        { number: 1, rightHand: "C4:q R:q E4:q", leftHand: "" },
      ],
    });
    const expected = flattenSongToExpected(song);
    expect(expected).toHaveLength(2);
    expect(expected[0].note).toBe(60);
    expect(expected[1].note).toBe(64);
  });

  it("handles chords", () => {
    const song = makeSong({
      measures: [
        { number: 1, rightHand: "C4+E4+G4:q", leftHand: "" },
      ],
    });
    const expected = flattenSongToExpected(song);
    expect(expected).toHaveLength(3);
    // All at same time
    expect(expected[0].time).toBeCloseTo(expected[1].time, 4);
    expect(expected[1].time).toBeCloseTo(expected[2].time, 4);
  });

  it("respects multi-measure timing", () => {
    const song = makeSong({
      tempo: 120,
      timeSignature: "4/4",
      measures: [
        { number: 1, rightHand: "C4:w", leftHand: "" },
        { number: 2, rightHand: "E4:w", leftHand: "" },
      ],
    });
    const expected = flattenSongToExpected(song);
    expect(expected).toHaveLength(2);
    expect(expected[0].time).toBeCloseTo(0, 2);
    // At 120 BPM, 4/4 time, measure = 2 seconds
    expect(expected[1].time).toBeCloseTo(2.0, 2);
  });
});

describe("scorePerformance", () => {
  it("scores a perfect performance", () => {
    const song = makeSong({ tempo: 120 });
    const played: MidiNoteEvent[] = [
      makeEvent(60, 0),     // C4 at time 0
      makeEvent(64, 0.5),   // E4 at time 0.5
      makeEvent(67, 1.0),   // G4 at time 1.0
      makeEvent(72, 1.5),   // C5 at time 1.5
    ];

    const result = scorePerformance(song, played);

    expect(result.metrics.pitchAccuracy).toBe(100);
    expect(result.metrics.completeness).toBe(100);
    expect(result.metrics.extraNoteCount).toBe(0);
    expect(result.details.missed).toHaveLength(0);
    expect(result.metrics.overallScore).toBeGreaterThanOrEqual(80);
  });

  it("detects missed notes", () => {
    const song = makeSong({ tempo: 120 });
    // Only play first two notes
    const played: MidiNoteEvent[] = [
      makeEvent(60, 0),
      makeEvent(64, 0.5),
    ];

    const result = scorePerformance(song, played);

    expect(result.metrics.completeness).toBe(50);
    expect(result.details.missed).toHaveLength(2);
    expect(result.details.missed[0].notation).toBe("G4:q");
  });

  it("detects extra notes", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }],
    });
    const played: MidiNoteEvent[] = [
      makeEvent(60, 0),     // expected
      makeEvent(62, 0.5),   // extra D4
      makeEvent(64, 1.0),   // extra E4
    ];

    const result = scorePerformance(song, played);

    expect(result.metrics.completeness).toBe(100);
    expect(result.metrics.extraNoteCount).toBe(2);
  });

  it("detects wrong pitch", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }],
    });
    const played: MidiNoteEvent[] = [
      makeEvent(61, 0), // C#4 instead of C4
    ];

    const result = scorePerformance(song, played);

    // The wrong-pitch note may match with penalty or not match at all
    expect(result.metrics.pitchAccuracy).toBeLessThan(100);
  });

  it("measures timing accuracy", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4:q E4:q", leftHand: "" }],
      tempo: 120,
    });
    // Play 100ms late on each note
    const played: MidiNoteEvent[] = [
      makeEvent(60, 0.1),   // 100ms late
      makeEvent(64, 0.6),   // 100ms late
    ];

    const result = scorePerformance(song, played);

    expect(result.metrics.timingAccuracyMs).toBeGreaterThan(50);
    expect(result.metrics.timingAccuracyMs).toBeLessThan(150);
    expect(result.metrics.pitchAccuracy).toBe(100);
  });

  it("handles empty performance", () => {
    const song = makeSong();
    const result = scorePerformance(song, []);

    expect(result.metrics.completeness).toBe(0);
    expect(result.details.missed).toHaveLength(4);
    expect(result.metrics.overallScore).toBeLessThanOrEqual(20);
  });

  it("handles empty song", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "", leftHand: "" }],
    });
    const result = scorePerformance(song, []);

    expect(result.metrics.completeness).toBe(100);
    expect(result.metrics.overallScore).toBeGreaterThanOrEqual(0);
  });

  it("generates feedback text", () => {
    const song = makeSong();
    const played: MidiNoteEvent[] = [makeEvent(60, 0)];

    const result = scorePerformance(song, played);

    expect(result.feedback).toContain("Performance:");
    expect(result.feedback).toContain("Pitch accuracy:");
    expect(result.feedback).toContain("Practice Suggestions");
  });

  it("respects tolerance parameter", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }],
      tempo: 120,
    });

    // Note played 200ms late — outside tight tolerance, inside loose tolerance
    const played: MidiNoteEvent[] = [makeEvent(60, 0.2)];

    const tight = scorePerformance(song, played, { toleranceMs: 100 });
    const loose = scorePerformance(song, played, { toleranceMs: 300 });

    expect(tight.metrics.completeness).toBe(0);  // too late for 100ms window
    expect(loose.metrics.completeness).toBe(100); // within 300ms window
  });
});

// ─── Wave S2: verdict windows + noteVerdicts ────────────────────────────────

describe("computeVerdictWindows", () => {
  it("floors the green window at 50ms for typical/fast tempos", () => {
    // beatDurationMs=500 at 120bpm -> 0.025*500=12.5, floored to 50
    expect(computeVerdictWindows(120, 150).greenMs).toBe(50);
    // beatDurationMs=200 at 300bpm -> 0.025*200=5, floor still wins
    expect(computeVerdictWindows(300, 150).greenMs).toBe(50);
  });

  it("scales the green window as 2.5% of beat duration once it exceeds the floor (slow tempo)", () => {
    // beatDurationMs=3000 at 20bpm -> 0.025*3000=75 (> the 50ms floor)
    expect(computeVerdictWindows(20, 150).greenMs).toBeCloseTo(75, 5);
    // beatDurationMs=2500 at 24bpm -> 0.025*2500=62.5
    expect(computeVerdictWindows(24, 150).greenMs).toBeCloseTo(62.5, 5);
  });

  it("caps the orange window at 150ms even when toleranceMs is looser", () => {
    expect(computeVerdictWindows(120, 300).orangeMs).toBe(150);
  });

  it("uses toleranceMs directly for the orange window when it's tighter than 150ms", () => {
    expect(computeVerdictWindows(120, 80).orangeMs).toBe(80);
  });
});

describe("computeMeasureStartTimes", () => {
  it("returns cumulative absolute start times per measure", () => {
    const song = makeSong({
      tempo: 120,
      timeSignature: "4/4",
      measures: [
        { number: 1, rightHand: "C4:w", leftHand: "" },
        { number: 2, rightHand: "E4:w", leftHand: "" },
        { number: 3, rightHand: "G4:w", leftHand: "" },
      ],
    });
    const starts = computeMeasureStartTimes(song);
    expect(starts.get(1)).toBeCloseTo(0, 5);
    expect(starts.get(2)).toBeCloseTo(2, 5); // 4/4 @ 120bpm = 2s/measure
    expect(starts.get(3)).toBeCloseTo(4, 5);
  });
});

describe("secondsToMeasureBeat", () => {
  it("converts an absolute time into (measure, beatOffset)", () => {
    const song = makeSong({
      tempo: 120,
      timeSignature: "4/4",
      measures: [
        { number: 1, rightHand: "C4:w", leftHand: "" },
        { number: 2, rightHand: "E4:w", leftHand: "" },
      ],
    });
    const starts = computeMeasureStartTimes(song);
    const { measure, beatOffset } = secondsToMeasureBeat(starts, 2.5, 120); // 0.5s into measure 2
    expect(measure).toBe(2);
    expect(beatOffset).toBeCloseTo(1, 5); // 0.5s * (120/60) = 1 beat
  });

  it("clamps times before the first measure to the first measure", () => {
    const song = makeSong({ tempo: 120, timeSignature: "4/4" });
    const starts = computeMeasureStartTimes(song);
    const { measure, beatOffset } = secondsToMeasureBeat(starts, -0.5, 120);
    expect(measure).toBe(1);
    expect(beatOffset).toBeCloseTo(-1, 5);
  });
});

describe("scorePerformance — noteVerdicts", () => {
  it("produces exactly one verdict per expected note", () => {
    const song = makeSong({ tempo: 120 }); // 4 expected notes
    const played: MidiNoteEvent[] = [makeEvent(60, 0), makeEvent(64, 0.5)]; // only first two played
    const result = scorePerformance(song, played);
    expect(result.details.noteVerdicts).toHaveLength(4);
  });

  it("produces one verdict per tone in a chord", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4+E4+G4:q", leftHand: "" }],
    });
    const result = scorePerformance(song, []);
    expect(result.details.noteVerdicts).toHaveLength(3);
    expect(result.details.noteVerdicts!.every(v => v.status === "missed")).toBe(true);
  });

  it("marks an on-time note as correct (at the green-window boundary, inclusive)", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }],
      tempo: 120, // greenMs = 50 (floor)
    });
    const played: MidiNoteEvent[] = [makeEvent(60, 0.05)]; // exactly 50ms late
    const result = scorePerformance(song, played);
    const v = result.details.noteVerdicts![0];
    expect(v.status).toBe("correct");
    expect(v.offsetMs).toBeCloseTo(50, 5);
  });

  it("marks a note just past the green window as timing, not missed", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }],
      tempo: 120, // greenMs = 50 (floor)
    });
    const played: MidiNoteEvent[] = [makeEvent(60, 0.051)]; // 51ms late
    const result = scorePerformance(song, played);
    const v = result.details.noteVerdicts![0];
    expect(v.status).toBe("timing");
    expect(v.offsetMs).toBeCloseTo(51, 5);
  });

  it("keeps a matched note past the orange window as timing (matched is matched, never demoted to missed)", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }],
      tempo: 120,
    });
    // 200ms late: matched under a loose 300ms tolerance, but past orangeMs (capped at 150)
    const played: MidiNoteEvent[] = [makeEvent(60, 0.2)];
    const result = scorePerformance(song, played, { toleranceMs: 300 });
    const v = result.details.noteVerdicts![0];
    expect(v.status).toBe("timing");
  });

  it("marks an unplayed expected note as missed, with no offsetMs", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }],
    });
    const result = scorePerformance(song, []);
    const v = result.details.noteVerdicts![0];
    expect(v.status).toBe("missed");
    expect(v.offsetMs).toBeUndefined();
  });

  it("marks a wrong-pitch near-match as missed (finding 33: red = miss/wrong pitch)", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }],
    });
    const played: MidiNoteEvent[] = [makeEvent(61, 0)]; // C#4 instead of C4
    const result = scorePerformance(song, played);
    const v = result.details.noteVerdicts![0];
    expect(v.status).toBe("missed");
    // The underlying matcher still counts this as `matched` with a pitch
    // penalty for pitchAccuracy/completeness — verify that's untouched.
    expect(result.details.matched).toBe(1);
    expect(result.metrics.pitchAccuracy).toBe(0);
  });

  it("the same absolute offset reads correct at a slow tempo but timing at a fast tempo (percent-of-beat scaling)", () => {
    const songSlow = makeSong({ measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }], tempo: 20 });
    const songFast = makeSong({ measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }], tempo: 120 });
    const played: MidiNoteEvent[] = [makeEvent(60, 0.07)]; // 70ms late

    expect(scorePerformance(songSlow, played).details.noteVerdicts![0].status).toBe("correct");
    expect(scorePerformance(songFast, played).details.noteVerdicts![0].status).toBe("timing");
  });

  it("uses options.bpm (not song.tempo) to scale the green window when both are given", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }],
      tempo: 120, // would floor green at 50ms if used
    });
    const played: MidiNoteEvent[] = [makeEvent(60, 0.07)]; // 70ms late
    const result = scorePerformance(song, played, { bpm: 20 }); // green widens to 75ms
    expect(result.details.noteVerdicts![0].status).toBe("correct");
  });

  it("still reports [] noteVerdicts on the INPUT_LIMIT guard branch", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }],
    });
    const hugePlayed: MidiNoteEvent[] = Array.from({ length: 10_001 }, (_, i) => makeEvent(60, i));
    const result = scorePerformance(song, hugePlayed);
    expect(result.details.noteVerdicts).toEqual([]);
  });
});

describe("scorePerformance — details.scoredAtBpm", () => {
  it("defaults to song.tempo when no bpm override is given", () => {
    const song = makeSong({ tempo: 120 });
    const result = scorePerformance(song, [makeEvent(60, 0)]);
    expect(result.details.scoredAtBpm).toBe(120);
  });

  it("reflects options.bpm when a scoring bpm override is given, not song.tempo", () => {
    const song = makeSong({ tempo: 120 });
    const result = scorePerformance(song, [makeEvent(60, 0)], { bpm: 60 });
    expect(result.details.scoredAtBpm).toBe(60);
  });

  it("matches the same effective bpm flattenSongToExpected used for this call (same source of truth as ExpectedNote.time/NoteVerdict.startSec)", () => {
    const song = makeSong({ tempo: 120 });
    const result = scorePerformance(song, [], { bpm: 90 });
    const expected = flattenSongToExpected(song, 90);
    expect(result.details.scoredAtBpm).toBe(90);
    expect(result.details.missed[0]?.timeSeconds).toBeCloseTo(expected[0].time, 5);
  });

  it("is still populated on the INPUT_LIMIT guard branch, using the same bpm resolution", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }],
    });
    const hugePlayed: MidiNoteEvent[] = Array.from({ length: 10_001 }, (_, i) => makeEvent(60, i));
    const result = scorePerformance(song, hugePlayed, { bpm: 90 });
    expect(result.details.scoredAtBpm).toBe(90);
  });
});
