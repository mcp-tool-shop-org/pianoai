import { describe, it, expect } from "vitest";
import { renderScoredPianoRoll } from "./piano-roll.js";
import { scorePerformance } from "./score-performance.js";
import { windowSong } from "./practice-loop.js";
import type { SongEntry } from "./songs/types.js";
import type { MidiNoteEvent } from "./midi/types.js";

// Minimal song factory, mirroring score-performance.test.ts's makeSong.
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

/** All `<rect .../>`-or-`<rect ...>` opening tags whose class matches `cls`. */
function rectLinesWithClass(svg: string, cls: string): string[] {
  return svg.split("\n").filter(line => line.includes(`class="${cls}"`) && line.trimStart().startsWith("<rect"));
}

describe("renderScoredPianoRoll — verdict encoding", () => {
  it("renders a correct note as a solid bluish-green rect with no dash/hollow cue", () => {
    const song = makeSong({ measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }], tempo: 120 });
    const result = scorePerformance(song, [makeEvent(60, 0)]); // dead on time
    const svg = renderScoredPianoRoll(song, result);

    const rects = rectLinesWithClass(svg, "verdict-correct");
    expect(rects).toHaveLength(1);
    expect(rects[0]).toContain('fill="#009E73"');
    expect(rects[0]).not.toContain("stroke-dasharray"); // shape redundancy: solid, no dash
    expect(svg).toContain("Correct: C4 (m.1)");
  });

  it("renders a late-but-matched note as a dashed, hollow orange rect", () => {
    const song = makeSong({ measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }], tempo: 120 });
    // 90ms late at 120bpm: greenMs floors at 50ms, so this reads "timing"
    const result = scorePerformance(song, [makeEvent(60, 0.09)]);
    const svg = renderScoredPianoRoll(song, result);

    const rects = rectLinesWithClass(svg, "verdict-timing");
    expect(rects).toHaveLength(1);
    expect(rects[0]).toContain('fill="#E69F00"');
    expect(rects[0]).toContain('fill-opacity="0.35"');
    expect(rects[0]).toContain('stroke-dasharray="4,2"');
    expect(svg).toContain("Timing: C4 (m.1)");
    expect(svg).toMatch(/90ms late/);
  });

  it("renders a missed note as a hollow vermilion rect with an X glyph (two crossing lines)", () => {
    const song = makeSong({ measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }], tempo: 120 });
    const result = scorePerformance(song, []); // nothing played
    const svg = renderScoredPianoRoll(song, result);

    const rects = rectLinesWithClass(svg, "verdict-missed");
    expect(rects).toHaveLength(1);
    expect(rects[0]).toContain('fill="none"');
    expect(rects[0]).toContain('stroke="#D55E00"');
    expect(rects[0]).toContain('stroke-width="2"');

    const xLines = svg.split("\n").filter(l => l.includes('class="verdict-missed-x"'));
    expect(xLines).toHaveLength(2); // two diagonals form the X
    expect(svg).toContain("Missed: C4 (m.1)");
  });

  it("renders an extra (unscored) played note as a dotted gray ghost with a + marker, at its own time/pitch", () => {
    const song = makeSong({ measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }], tempo: 120 });
    const result = scorePerformance(song, [makeEvent(60, 0), makeEvent(67, 0.3)]); // C4 correct, extra G4
    const svg = renderScoredPianoRoll(song, result);

    const rects = rectLinesWithClass(svg, "verdict-extra");
    expect(rects).toHaveLength(1);
    expect(rects[0]).toContain('fill="none"');
    expect(rects[0]).toContain('stroke="#999999"');
    expect(rects[0]).toContain('stroke-dasharray="1,2"');

    expect(svg).toContain('class="verdict-extra-plus"');
    expect(svg).toMatch(/class="verdict-extra-plus"[^>]*>\+</);
    expect(svg).toContain("Extra: G4 at 0.30s (not in score)");
  });

  it("renders all four states together without collision when a take has a mix", () => {
    const song = makeSong({
      measures: [{ number: 1, rightHand: "C4:q E4:q G4:q", leftHand: "" }],
      tempo: 120,
    });
    const played: MidiNoteEvent[] = [
      makeEvent(60, 0),      // C4 on time -> correct
      makeEvent(64, 0.6),    // E4 100ms late -> timing
      // G4 missing -> missed
      makeEvent(69, 1.4),    // extra A4
    ];
    const result = scorePerformance(song, played);
    const svg = renderScoredPianoRoll(song, result);

    expect(rectLinesWithClass(svg, "verdict-correct")).toHaveLength(1);
    expect(rectLinesWithClass(svg, "verdict-timing")).toHaveLength(1);
    expect(rectLinesWithClass(svg, "verdict-missed")).toHaveLength(1);
    expect(rectLinesWithClass(svg, "verdict-extra")).toHaveLength(1);
  });
});

describe("renderScoredPianoRoll — legend", () => {
  it("includes a legend with all four verdict states and their shape cues", () => {
    const song = makeSong({ measures: [{ number: 1, rightHand: "C4:q E4:q", leftHand: "" }], tempo: 120 });
    const result = scorePerformance(song, [makeEvent(60, 0)]); // one correct, one missed
    const svg = renderScoredPianoRoll(song, result);

    expect(svg).toContain(">Correct<");
    expect(svg).toContain(">Timing<");
    expect(svg).toContain(">Missed<");
    expect(svg).toContain(">Extra<");

    // Shape cues present in the legend swatches themselves (not just note rects)
    expect(svg).toContain("stroke-dasharray=\"3,1.5\""); // timing swatch dash
    expect(svg).toContain("stroke-dasharray=\"1,1.5\""); // extra swatch dots
  });

  it("still shows a Downbeat pill when showMetronome is on (default)", () => {
    const song = makeSong();
    const result = scorePerformance(song, [makeEvent(60, 0)]);
    const svg = renderScoredPianoRoll(song, result);
    expect(svg).toContain(">Downbeat<");
  });

  it("omits the Downbeat pill when showMetronome is off", () => {
    const song = makeSong();
    const result = scorePerformance(song, [makeEvent(60, 0)]);
    const svg = renderScoredPianoRoll(song, result, { showMetronome: false });
    expect(svg).not.toContain(">Downbeat<");
  });
});

describe("renderScoredPianoRoll — focus strip", () => {
  it("ranks the focus strip by missed count then timing count, worst first", () => {
    const song = makeSong({
      measures: [
        { number: 1, rightHand: "C4:q", leftHand: "" }, // missed
        { number: 2, rightHand: "E4:q", leftHand: "" }, // correct
        { number: 3, rightHand: "G4:q", leftHand: "" }, // missed
      ],
      tempo: 120, // 4/4 @ 120bpm -> 2s per measure
    });
    const played: MidiNoteEvent[] = [makeEvent(64, 2)]; // only play measure 2's E4
    const result = scorePerformance(song, played);
    const svg = renderScoredPianoRoll(song, result);

    expect(svg).toContain("Focus: mm. 1, 3");
  });

  it("uses singular phrasing for exactly one worst measure", () => {
    const song = makeSong({ measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }], tempo: 120 });
    const result = scorePerformance(song, []); // one missed note, one bad measure
    const svg = renderScoredPianoRoll(song, result);
    expect(svg).toContain("Focus: m. 1");
  });

  it("omits the focus strip entirely on a clean take", () => {
    const song = makeSong({ measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }], tempo: 120 });
    const result = scorePerformance(song, [makeEvent(60, 0)]);
    const svg = renderScoredPianoRoll(song, result);
    expect(svg).not.toContain("Focus:");
  });
});

describe("renderScoredPianoRoll — focus strip prominence (pill)", () => {
  // Visual review judged the bare-text focus strip too subtle — it now
  // renders inside a filled, bordered pill (Wave C5).
  it("renders the focus label inside a filled, bordered pill rather than bare text", () => {
    const song = makeSong({ measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }], tempo: 120 });
    const result = scorePerformance(song, []); // one missed note -> a focus strip
    const svg = renderScoredPianoRoll(song, result);

    expect(svg).toContain('class="verdict-focus-pill"');
    // Panel color + border (the neutral pill treatment shared by every
    // other legend/metadata pill in this renderer), not a status color.
    expect(svg).toContain('fill="#242440"');
    expect(svg).toContain('stroke="#3a3a5e"');
    // Still task-focused wording — only the visual weight changed.
    expect(svg).toContain("Focus: m. 1");
    expect(svg).not.toMatch(/Grade|Excellent|Great job|Well done|Poor|Bad/);
  });

  it("uses a larger font-size than the pre-pill 10px baseline", () => {
    const song = makeSong({ measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }], tempo: 120 });
    const result = scorePerformance(song, []);
    const svg = renderScoredPianoRoll(song, result);
    const m = svg.match(/class="verdict-focus" x="[\d.]+" y="[\d.]+" fill="[^"]+" font-size="(\d+)"/);
    expect(m).toBeTruthy();
    expect(parseInt(m![1], 10)).toBeGreaterThan(10);
  });

  it("truncates (never wraps or breaks layout) a focus label at a narrow measure window", () => {
    // Many worst-measures + a narrow single-measure render window forces
    // the pill's available width down near its floor.
    const song = makeSong({
      measures: Array.from({ length: 12 }, (_, i) => ({ number: i + 1, rightHand: "C4:q", leftHand: "" })),
      tempo: 120,
    });
    const result = scorePerformance(song, []); // every measure missed
    const svg = renderScoredPianoRoll(song, result, { startMeasure: 1, endMeasure: 1 });

    expect(svg).toContain('class="verdict-focus-pill"');
    // The pill's own width never exceeds the SVG's declared width.
    const svgWidth = parseFloat(svg.match(/<svg[^>]*width="([\d.]+)"/)![1]);
    const pillWidth = parseFloat(svg.match(/class="verdict-focus-pill"[^>]*width="([\d.]+)"/)![1]);
    expect(pillWidth).toBeLessThanOrEqual(svgWidth);
  });
});

describe("renderScoredPianoRoll — task-focused language", () => {
  it("never uses grade letters, praise, or ability language anywhere in the SVG", () => {
    const song = makeSong({ measures: [{ number: 1, rightHand: "C4:q E4:q", leftHand: "" }], tempo: 120 });
    const result = scorePerformance(song, [makeEvent(60, 0)]);
    const svg = renderScoredPianoRoll(song, result);

    for (const banned of ["Grade", "Excellent", "Great job", "Well done", "Poor", "Bad"]) {
      expect(svg).not.toContain(banned);
    }
  });
});

describe("renderScoredPianoRoll — scoreBpm alignment", () => {
  it("aligns verdict positions to the grid using options.scoreBpm when scorePerformance used a bpm override", () => {
    const song = makeSong({ measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }], tempo: 120 });
    const result = scorePerformance(song, [makeEvent(60, 0)], { bpm: 60 }); // scored at half tempo
    const svg = renderScoredPianoRoll(song, result, { scoreBpm: 60 });

    const m = svg.match(/class="verdict-correct" x="([\d.]+)"/);
    expect(m).toBeTruthy();
    // gridX = labelWidth(50) + padding(10) = 60; the note sits at beat 0 of measure 1.
    expect(parseFloat(m![1])).toBeCloseTo(60, 5);
  });
});

describe("renderScoredPianoRoll — no measures/no notes edge cases", () => {
  it("falls back to the small error SVG when the measure range is empty", () => {
    const song = makeSong();
    const result = scorePerformance(song, []);
    const svg = renderScoredPianoRoll(song, result, { startMeasure: 5, endMeasure: 10 });
    expect(svg).toContain("No measures in range");
  });
});

describe("renderScoredPianoRoll — scoredAtBpm default pairing (mispairing-proof)", () => {
  it("uses result.details.scoredAtBpm by default (no options.scoreBpm needed) so a bpm-override take still aligns correctly", () => {
    const song = makeSong({ measures: [{ number: 1, rightHand: "C4:q E4:q", leftHand: "" }], tempo: 120 });
    // Scored at half tempo — E4 lands nominally at t=1.0s (a full quarter
    // note at 60bpm), not 0.5s (what it would be at the song's own 120bpm).
    const result = scorePerformance(song, [makeEvent(60, 0), makeEvent(64, 1.0)], { bpm: 60 });
    expect(result.details.scoredAtBpm).toBe(60);

    const svg = renderScoredPianoRoll(song, result); // deliberately omit options.scoreBpm

    const xs = [...svg.matchAll(/class="verdict-correct" x="([\d.]+)"/g)].map((m) => parseFloat(m[1]));
    expect(xs).toHaveLength(2);
    // gridX = labelWidth(50) + padding(10) = 60. C4 at beat 0 -> x=60. E4 at
    // beat 1 (1.0s at the ACTUAL scoring bpm=60 = exactly 1 quarter-beat)
    // -> x=60+60=120. Before the fix, this defaulted to song.tempo
    // (120bpm), misreading E4's beatOffset as 2 beats instead of 1 ->
    // x=60+120=180 (wrong grid column).
    expect(xs[0]).toBeCloseTo(60, 5);
    expect(xs[1]).toBeCloseTo(120, 5);
  });

  it("an explicit options.scoreBpm still wins over result.details.scoredAtBpm", () => {
    const song = makeSong({ measures: [{ number: 1, rightHand: "C4:q E4:q", leftHand: "" }], tempo: 120 });
    const result = scorePerformance(song, [makeEvent(60, 0), makeEvent(64, 1.0)], { bpm: 60 });
    expect(result.details.scoredAtBpm).toBe(60);

    const svgDefault = renderScoredPianoRoll(song, result); // uses scoredAtBpm=60 by default
    // Deliberately mismatched override — proves options.scoreBpm takes
    // priority over the paired scoredAtBpm when both are present.
    const svgOverride = renderScoredPianoRoll(song, result, { scoreBpm: 120 });

    const xsOf = (svg: string) => [...svg.matchAll(/class="verdict-correct" x="([\d.]+)"/g)].map((m) => parseFloat(m[1]));
    const defaultXs = xsOf(svgDefault);
    const overrideXs = xsOf(svgOverride);
    expect(defaultXs).toHaveLength(2);
    expect(overrideXs).toHaveLength(2);
    // E4 (startSec=1.0) at beat 1 under scoredAtBpm=60 -> x=60+60=120; at
    // beat 2 under the explicit override scoreBpm=120 -> x=60+120=180.
    expect(defaultXs[1]).toBeCloseTo(120, 5);
    expect(overrideXs[1]).toBeCloseTo(180, 5);
  });
});

describe("renderScoredPianoRoll — degraded fallback (INPUT_LIMIT guard)", () => {
  it("renders the base (not verdict-colored) notes plus a notice, instead of an empty grid, when noteVerdicts is [] but real notes exist", () => {
    const song = makeSong({ measures: [{ number: 1, rightHand: "C4:q E4:q G4:q C5:q", leftHand: "" }], tempo: 120 });
    const hugePlayed: MidiNoteEvent[] = Array.from({ length: 10_001 }, (_, i) => makeEvent(60, i));
    const result = scorePerformance(song, hugePlayed);
    expect(result.details.noteVerdicts).toEqual([]);
    expect(result.details.totalExpected).toBeGreaterThan(0);

    const svg = renderScoredPianoRoll(song, result);

    // No verdict-colored rects at all (nothing was scored note-by-note)
    expect(rectLinesWithClass(svg, "verdict-correct")).toHaveLength(0);
    expect(rectLinesWithClass(svg, "verdict-timing")).toHaveLength(0);
    expect(rectLinesWithClass(svg, "verdict-missed")).toHaveLength(0);

    // The base (hand-colored) notes render instead of an empty grid
    expect(svg).toContain("RH: C4 (m.1)");
    expect(svg).toContain("RH: E4 (m.1)");
    expect(svg).toContain("RH: G4 (m.1)");
    expect(svg).toContain("RH: C5 (m.1)");
    expect(svg).toContain('fill="#4a9eff"'); // base RH color, not a verdict color

    // A task-focused notice explains why, instead of a silently empty focus strip
    expect(svg).toContain("Take too large to score note-by-note");
    expect(svg).toContain(`(${result.details.totalExpected} expected / ${result.details.totalPlayed} played events)`);
  });

  it("shows the base-mode (Right Hand) legend, not the verdict legend, in the degraded fallback", () => {
    const song = makeSong({ measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }], tempo: 120 });
    const hugePlayed: MidiNoteEvent[] = Array.from({ length: 10_001 }, (_, i) => makeEvent(60, i));
    const result = scorePerformance(song, hugePlayed);
    const svg = renderScoredPianoRoll(song, result);

    expect(svg).toContain(">Right Hand<");
    expect(svg).not.toContain(">Correct<");
    expect(svg).not.toContain(">Missed<");
  });

  it("a normal (non-degraded) take still renders verdict colors and the focus strip as before (regression guard)", () => {
    const song = makeSong({ measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }], tempo: 120 });
    const result = scorePerformance(song, []); // small, normal take — one missed note
    const svg = renderScoredPianoRoll(song, result);
    expect(svg).not.toContain("Take too large to score note-by-note");
    expect(rectLinesWithClass(svg, "verdict-missed")).toHaveLength(1);
  });
});

describe("renderScoredPianoRoll — windowed sub-song (non-1-based measure numbers)", () => {
  it("renders a windowSong(song, 5, 8) product's 4 measures + verdicts using the DEFAULT window (no explicit startMeasure/endMeasure)", () => {
    const song = makeSong({
      measures: [
        { number: 1, rightHand: "C4:q", leftHand: "" },
        { number: 2, rightHand: "C4:q", leftHand: "" },
        { number: 3, rightHand: "C4:q", leftHand: "" },
        { number: 4, rightHand: "C4:q", leftHand: "" },
        { number: 5, rightHand: "C4:q", leftHand: "" },
        { number: 6, rightHand: "D4:q", leftHand: "" },
        { number: 7, rightHand: "E4:q", leftHand: "" },
        { number: 8, rightHand: "F4:q", leftHand: "" },
      ],
      tempo: 120, // 4/4 @ 120bpm -> 2s per measure
    });
    // windowSong(song, 5, 8): 4 measure objects numbered 5-8 — its OWN
    // .measures.length (4) is unrelated to those numbers (practice-loop.ts's
    // windowSong doc). Before the fix, renderScoredPianoRoll's default
    // window (no explicit startMeasure/endMeasure) filtered for numbers
    // 1..4, matching nothing in this song and falling back to the
    // "No measures in range" placeholder.
    const windowed = windowSong(song, 5, 8);
    expect(windowed.measures).toHaveLength(4);

    // windowSong's own contract: its first included measure starts at
    // nominal time 0 — so measures 5/6/7/8 land at t=0/2/4/6s.
    const result = scorePerformance(windowed, [
      makeEvent(60, 0), // m.5 C4 — dead on time
      makeEvent(62, 2), // m.6 D4
      makeEvent(64, 4), // m.7 E4
      makeEvent(65, 6), // m.8 F4
    ]);

    const svg = renderScoredPianoRoll(windowed, result);

    expect(svg).not.toContain("No measures in range");
    expect(rectLinesWithClass(svg, "verdict-correct")).toHaveLength(4);
    expect(svg).toContain("Correct: C4 (m.5)");
    expect(svg).toContain("Correct: D4 (m.6)");
    expect(svg).toContain("Correct: E4 (m.7)");
    expect(svg).toContain("Correct: F4 (m.8)");
  });

  it("an explicit startMeasure/endMeasure still wins over the derived default on a windowed song", () => {
    const song = makeSong({
      measures: [
        { number: 5, rightHand: "C4:q", leftHand: "" },
        { number: 6, rightHand: "D4:q", leftHand: "" },
        { number: 7, rightHand: "E4:q", leftHand: "" },
        { number: 8, rightHand: "F4:q", leftHand: "" },
      ],
      tempo: 120,
    });
    const result = scorePerformance(song, [makeEvent(60, 0), makeEvent(62, 2), makeEvent(64, 4), makeEvent(65, 6)]);
    const svg = renderScoredPianoRoll(song, result, { startMeasure: 6, endMeasure: 7 });

    expect(svg).not.toContain("No measures in range");
    expect(svg).toContain("Correct: D4 (m.6)");
    expect(svg).toContain("Correct: E4 (m.7)");
    expect(svg).not.toContain("Correct: C4 (m.5)");
    expect(svg).not.toContain("Correct: F4 (m.8)");
  });
});

describe("renderScoredPianoRoll — extras outside the render window don't widen the pitch axis", () => {
  it("an extra note whose time falls outside the rendered measure window does not stretch the pitch axis", () => {
    const song = makeSong({
      measures: [
        { number: 1, rightHand: "C4:q", leftHand: "" },
        { number: 2, rightHand: "C4:q", leftHand: "" },
      ],
      tempo: 120, // 4/4 @ 120bpm -> measure 1 = [0,2), measure 2 = [2,4)
    });
    // Extra played in measure 2, at a very high pitch, but we only render measure 1.
    const farOutExtra = makeEvent(108, 2.5); // C8 — way above the song's own note range
    const result = scorePerformance(song, [makeEvent(60, 0), farOutExtra]);
    expect(result.metrics.extraNoteCount).toBe(1); // confirm it really is unmatched/extra, not scored

    const svgWindowed = renderScoredPianoRoll(song, result, { startMeasure: 1, endMeasure: 1 });
    const svgFull = renderScoredPianoRoll(song, result, { startMeasure: 1, endMeasure: 2 });

    // The out-of-window extra is not drawn in the windowed render...
    expect(svgWindowed).not.toContain("Extra: C8");

    // ...and (the fix) it doesn't stretch the windowed render's pitch axis
    // either: the windowed SVG's declared height should be noticeably
    // shorter than the full render, which legitimately includes the high
    // extra note in its own window.
    const heightOf = (svg: string) => parseFloat(svg.match(/<svg[^>]*height="([\d.]+)"/)![1]);
    expect(heightOf(svgWindowed)).toBeLessThan(heightOf(svgFull));
  });

  it("an extra note inside the rendered window still widens the pitch axis as before (regression guard)", () => {
    const song = makeSong({ measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }], tempo: 120 });
    const highExtraInWindow = makeEvent(108, 0.5); // same measure, high C
    const result = scorePerformance(song, [makeEvent(60, 0), highExtraInWindow]);

    const svg = renderScoredPianoRoll(song, result);
    expect(svg).toContain("Extra: C8"); // drawn
    // Pitch label for C8 should appear given the widened axis
    expect(svg).toMatch(/>C8</);
  });
});

describe("renderScoredPianoRoll — long title clipping (shares the base renderer's fix)", () => {
  const LONG_TITLE = "Piano Sonata No. 14 in C-sharp minor, Quasi una fantasia (Moonlight)";

  it("ellipsizes an overflowing title, keeping the full title in a <title> hover element", () => {
    const song = makeSong({ title: LONG_TITLE, measures: [{ number: 1, rightHand: "C4:q", leftHand: "" }], tempo: 120 });
    const result = scorePerformance(song, [makeEvent(60, 0)]);
    const svg = renderScoredPianoRoll(song, result);

    expect(svg).toContain(`<title>${LONG_TITLE}</title>`);
    const m = svg.match(/<text x="[\d.]+" y="[\d.]+" fill="#ddddee"[^>]*>([^<]*)<title>/);
    expect(m).toBeTruthy();
    expect(m![1].length).toBeLessThan(LONG_TITLE.length);
    expect(m![1].endsWith("…")).toBe(true);
  });
});
