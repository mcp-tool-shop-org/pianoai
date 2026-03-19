import { describe, it, expect } from "vitest";
import { flattenSongToExpected, scorePerformance } from "./score-performance.js";
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
