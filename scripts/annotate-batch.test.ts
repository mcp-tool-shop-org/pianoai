// ─── annotate-batch.test.ts ───────────────────────────────────────────────────
//
// Tests for scripts/annotate-batch.ts's three pure-function modes (analyze,
// apply, report) plus CLI arg parsing. Every test builds its own temp library
// directory via mkdtempSync/afterEach-rmSync — NONE of these tests ever touch
// the real songs/library directory, and none import LIBRARY_DIR (it isn't
// exported). If you add a test here, keep that invariant: pass your own tmp
// dir to analyzeGenre/applyAnnotations/reportGenre, never the real library.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeMidi } from "midi-file";
import type { MidiData, MidiEvent } from "midi-file";

import {
  analyzeGenre,
  applyAnnotations,
  reportGenre,
  parseArgs,
  CliArgsError,
  DEFAULT_MIN_SCORE,
  type AnnotationCandidate,
  type AnalysisBrief,
} from "./annotate-batch.js";
import type { MusicalLanguage } from "../src/songs/types.js";

// ─── Fixture helpers ────────────────────────────────────────────────────────

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "annotate-batch-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** Minimal raw SongConfig JSON, written with the SAME key order the real library uses (id, title, genre, difficulty, key, tags, composer, status). */
function writeRawConfig(
  genreDir: string,
  id: string,
  overrides: { title?: string; genre?: string; key?: string; status?: string } = {},
): void {
  mkdirSync(genreDir, { recursive: true });
  const config = {
    id,
    title: overrides.title ?? "Test Song",
    genre: overrides.genre ?? "blues",
    difficulty: "beginner",
    key: overrides.key ?? "C major",
    tags: ["test"],
    composer: "Traditional",
    status: overrides.status ?? "raw",
  };
  writeFileSync(join(genreDir, `${id}.json`), JSON.stringify(config, null, 2) + "\n", "utf8");
}

/** Build a valid MIDI binary from an explicit note list (format 0, 1 track). Mirrors src/songs/midi/ingest.test.ts's buildMidiBuffer. */
function buildMidiBuffer(opts: {
  ticksPerBeat?: number;
  tempoBpm?: number;
  timeSig?: { numerator: number; denominator: number };
  notes: Array<{ noteNumber: number; startTick: number; durationTicks: number }>;
}): Uint8Array {
  const tpb = opts.ticksPerBeat ?? 480;
  const microsecondsPerBeat = Math.round(60_000_000 / (opts.tempoBpm ?? 120));
  const events: MidiEvent[] = [
    { deltaTime: 0, type: "setTempo", microsecondsPerBeat, meta: true } as MidiEvent,
    {
      deltaTime: 0,
      type: "timeSignature",
      numerator: opts.timeSig?.numerator ?? 4,
      denominator: opts.timeSig?.denominator ?? 4,
      metronome: 24,
      thirtyseconds: 8,
      meta: true,
    } as MidiEvent,
  ];

  const absEvents: Array<{ tick: number; event: MidiEvent }> = [];
  for (const n of opts.notes) {
    absEvents.push({ tick: n.startTick, event: { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: n.noteNumber, velocity: 80 } as MidiEvent });
    absEvents.push({ tick: n.startTick + n.durationTicks, event: { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: n.noteNumber, velocity: 0 } as MidiEvent });
  }
  absEvents.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    if (a.event.type === "noteOff" && b.event.type === "noteOn") return -1;
    if (a.event.type === "noteOn" && b.event.type === "noteOff") return 1;
    return 0;
  });

  let lastTick = 0;
  for (const ae of absEvents) {
    ae.event.deltaTime = ae.tick - lastTick;
    lastTick = ae.tick;
    events.push(ae.event);
  }
  events.push({ deltaTime: 0, type: "endOfTrack", meta: true } as MidiEvent);

  const midiData: MidiData = { header: { format: 0, numTracks: 1, ticksPerBeat: tpb }, tracks: [events] };
  return new Uint8Array(writeMidi(midiData));
}

/**
 * A 4-measure, 4/4 @ 120bpm fixture with known, hand-computed properties:
 *   M1: RH C4-E4-G4 (3 onsets) quarters; LH C3 whole note (1 onset)
 *   M2: RH silent ("R:w"); LH G2 whole note (1 onset)
 *   M3: byte-identical to M1 (exact repeat)
 *   M4: RH C5-E5-G5 (same pitch classes as M1's RH, different octave); LH C3 (same as M1)
 * Expected: measureCount=4, noteCount=13, busiest=[m1,m3,m4 tied@4, then m2@1],
 * one exact-repeat group [1,3], one near-identical group [1,3,4] (pitch-class
 * multiset {0,0,4,7} shared by all three), one rightHand rest gap at m2.
 */
function writeKnownFixture(genreDir: string, id: string): void {
  writeRawConfig(genreDir, id, { key: "C major" });
  const notes = [
    // M1 [0, 1920)
    { noteNumber: 60, startTick: 0, durationTicks: 480 }, // C4
    { noteNumber: 64, startTick: 480, durationTicks: 480 }, // E4
    { noteNumber: 67, startTick: 960, durationTicks: 480 }, // G4
    { noteNumber: 48, startTick: 0, durationTicks: 1920 }, // C3 (LH, whole measure)
    // M2 [1920, 3840): RH silent
    { noteNumber: 43, startTick: 1920, durationTicks: 1920 }, // G2 (LH)
    // M3 [3840, 5760): identical to M1
    { noteNumber: 60, startTick: 3840, durationTicks: 480 },
    { noteNumber: 64, startTick: 4320, durationTicks: 480 },
    { noteNumber: 67, startTick: 4800, durationTicks: 480 },
    { noteNumber: 48, startTick: 3840, durationTicks: 1920 },
    // M4 [5760, 7680): same pitch classes as M1's RH, one octave up; LH same as M1
    { noteNumber: 72, startTick: 5760, durationTicks: 480 }, // C5
    { noteNumber: 76, startTick: 6240, durationTicks: 480 }, // E5
    { noteNumber: 79, startTick: 6720, durationTicks: 480 }, // G5
    { noteNumber: 48, startTick: 5760, durationTicks: 1920 },
  ];
  const midi = buildMidiBuffer({ notes });
  writeFileSync(join(genreDir, `${id}.mid`), midi);
}

function goodMusicalLanguage(): MusicalLanguage {
  return {
    description:
      "A 12-bar blues standard built on the classic I-IV-V progression in C major, first popularized in the 1930s and still a foundational teaching piece for blues piano. The melody leans on the blues scale (C-Eb-F-F#-G-Bb) over changes that move from the C7 tonic through F7 and back, with a G7 turnaround driving each chorus home. Bars 9-10 carry the signature ii-V motion (Dm7-G7) that separates a jazz-inflected blues from a straight I-IV-V reading.",
    structure:
      "12-bar blues form, three 4-bar phrases: bars 1-4 sit on the C7 tonic, bars 5-6 move to F7 before returning to C7 in bars 7-8, and bars 9-12 carry the turnaround (G7 to C7) that resets the form for the next chorus.",
    keyMoments: [
      "Bars 1-4, the C7 tonic vamp: the right hand outlines the blues scale over a static left-hand root-fifth pattern, teaching that blues harmony can sit still while the melody does the moving.",
      "Bars 5-6, the move to F7: the IV chord arrives on beat 1 of bar 5 and the left hand shifts up a fourth, a motion every blues pianist needs under the fingers before anything else.",
      "Bars 9-10, the ii-V turnaround (Dm7-G7): this is the moment a straight blues starts to sound like jazz — recognizing Dm7 resolving to G7 resolving to C7 is a skill that transfers to every standard afterward.",
    ],
    teachingGoals: [
      "Learn the C blues scale (C-Eb-F-F#-G-Bb) and practice it hands-separately before applying it over the changes.",
      "Practice the I-IV-V blues progression in root position first, then with left-hand rootless voicings once the changes are secure.",
      "Recognize the ii-V-I cadence inside a blues turnaround — listen for Dm7 resolving to G7 resolving to C7.",
    ],
    styleTips: [
      "Swing the eighth notes — blues time leans back, not forward; if you feel rushed, you are.",
      "Keep the left hand light on the root-fifth pattern so the right hand's blue notes have room to breathe.",
      "Don't fill every bar — leave space after each phrase the way a singer would leave space to breathe.",
    ],
  };
}

function poorMusicalLanguage(): MusicalLanguage {
  return {
    description: "A nice blues song.",
    structure: "Simple blues.",
    keyMoments: ["It starts", "Then it goes"],
    teachingGoals: ["Play it", "Practice"],
    styleTips: ["Play nicely"],
  };
}

// ─── analyzeGenre ───────────────────────────────────────────────────────────

describe("analyzeGenre", () => {
  it("is deterministic across repeated calls on the same fixture", () => {
    const genreDir = join(tmp, "blues");
    writeKnownFixture(genreDir, "known-song");

    const first = analyzeGenre("blues", tmp);
    const second = analyzeGenre("blues", tmp);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("throws a structured error for a genre directory that does not exist", () => {
    expect(() => analyzeGenre("blues", tmp)).toThrow(/No such genre directory/);
  });

  it("throws a structured error when a config has no matching .mid file", () => {
    const genreDir = join(tmp, "blues");
    writeRawConfig(genreDir, "no-midi");
    expect(() => analyzeGenre("blues", tmp)).toThrow(/MIDI file not found/);
  });

  it("computes measure count, tempo, time signature, and key from the .mid + config", () => {
    const genreDir = join(tmp, "blues");
    writeKnownFixture(genreDir, "known-song");
    const [brief] = analyzeGenre("blues", tmp);

    expect(brief.slug).toBe("known-song");
    expect(brief.key).toBe("C major"); // from config, not derived
    expect(brief.tempo).toBe(120);
    expect(brief.timeSignature).toBe("4/4");
    expect(brief.measureCount).toBe(4);
    expect(brief.noteCount).toBe(13); // 3+1 + 0+1 + 3+1 + 3+1
  });

  it("computes per-hand pitch range with the correct extreme + measure", () => {
    const genreDir = join(tmp, "blues");
    writeKnownFixture(genreDir, "known-song");
    const [brief] = analyzeGenre("blues", tmp);

    expect(brief.pitchRange.rightHand.lowest).toMatchObject({ midi: 60, name: "C4", measure: 1 });
    expect(brief.pitchRange.rightHand.highest).toMatchObject({ midi: 79, name: "G5", measure: 4 });
    expect(brief.pitchRange.leftHand.lowest).toMatchObject({ midi: 43, name: "G2", measure: 2 });
    expect(brief.pitchRange.leftHand.highest).toMatchObject({ midi: 48, name: "C3", measure: 1 });
  });

  it("ranks busiest and sparsest measures with deterministic tie-breaking by measure number", () => {
    const genreDir = join(tmp, "blues");
    writeKnownFixture(genreDir, "known-song");
    const [brief] = analyzeGenre("blues", tmp, 5);

    // m1, m3, m4 all have totalOnsets=4 (tie -> ascending measure order), m2 has 1
    expect(brief.busiestMeasures.map((m) => m.measure)).toEqual([1, 3, 4, 2]);
    expect(brief.busiestMeasures[0].totalOnsets).toBe(4);
    expect(brief.sparsestMeasures.map((m) => m.measure)).toEqual([2, 1, 3, 4]);
    expect(brief.sparsestMeasures[0].totalOnsets).toBe(1);
  });

  it("finds the longest rest gap per hand", () => {
    const genreDir = join(tmp, "blues");
    writeKnownFixture(genreDir, "known-song");
    const [brief] = analyzeGenre("blues", tmp);

    // Only the right hand ever rests a whole measure (m2); left hand never does.
    expect(brief.longestRestGaps).toHaveLength(1);
    expect(brief.longestRestGaps[0]).toMatchObject({ hand: "rightHand", startMeasure: 2, endMeasure: 2, lengthMeasures: 1 });
  });

  it("finds exact-repeat and near-identical repeat groups", () => {
    const genreDir = join(tmp, "blues");
    writeKnownFixture(genreDir, "known-song");
    const [brief] = analyzeGenre("blues", tmp);

    const identical = brief.repeatedSections.filter((r) => r.kind === "identical");
    const near = brief.repeatedSections.filter((r) => r.kind === "near-identical");

    expect(identical).toHaveLength(1);
    expect(identical[0].measures).toEqual([1, 3]);

    expect(near).toHaveLength(1);
    expect(near[0].measures).toEqual([1, 3, 4]);
  });

  it("respects a custom --top-n for busiest/sparsest", () => {
    const genreDir = join(tmp, "blues");
    writeKnownFixture(genreDir, "known-song");
    const [brief] = analyzeGenre("blues", tmp, 2);

    expect(brief.busiestMeasures).toHaveLength(2);
    expect(brief.sparsestMeasures).toHaveLength(2);
  });

  it("analyzes multiple songs in a genre, sorted by slug", () => {
    const genreDir = join(tmp, "blues");
    writeKnownFixture(genreDir, "zzz-song");
    writeKnownFixture(genreDir, "aaa-song");
    const briefs = analyzeGenre("blues", tmp);

    expect(briefs.map((b) => b.slug)).toEqual(["aaa-song", "zzz-song"]);
  });
});

// ─── applyAnnotations ───────────────────────────────────────────────────────

describe("applyAnnotations", () => {
  it("writes a candidate scoring at or above the threshold, promoting it to ready", () => {
    const genreDir = join(tmp, "blues");
    writeRawConfig(genreDir, "good-song");

    const candidates: AnnotationCandidate[] = [{ slug: "good-song", musicalLanguage: goodMusicalLanguage() }];
    const result = applyAnnotations("blues", tmp, candidates, DEFAULT_MIN_SCORE);

    expect(result.applied.map((a) => a.slug)).toEqual(["good-song"]);
    expect(result.applied[0].score.overall).toBeGreaterThanOrEqual(DEFAULT_MIN_SCORE);
    expect(result.belowThreshold).toHaveLength(0);
    expect(result.schemaErrors).toHaveLength(0);

    const written = JSON.parse(readFileSync(join(genreDir, "good-song.json"), "utf8"));
    expect(written.status).toBe("ready");
    expect(written.musicalLanguage).toEqual(goodMusicalLanguage());
  });

  it("preserves every other field and appends musicalLanguage after status (key-order convention)", () => {
    const genreDir = join(tmp, "blues");
    writeRawConfig(genreDir, "good-song", { title: "Original Title", key: "G major" });

    applyAnnotations("blues", tmp, [{ slug: "good-song", musicalLanguage: goodMusicalLanguage() }], DEFAULT_MIN_SCORE);

    const raw = readFileSync(join(genreDir, "good-song.json"), "utf8");
    const written = JSON.parse(raw);

    // Every pre-existing field survives untouched.
    expect(written.title).toBe("Original Title");
    expect(written.genre).toBe("blues");
    expect(written.difficulty).toBe("beginner");
    expect(written.key).toBe("G major");
    expect(written.tags).toEqual(["test"]);
    expect(written.composer).toBe("Traditional");

    // Key order matches the existing-ready-config convention: id..status first
    // (unchanged position), musicalLanguage appended last (it's a new key).
    expect(Object.keys(written)).toEqual(["id", "title", "genre", "difficulty", "key", "tags", "composer", "status", "musicalLanguage"]);
  });

  it("does NOT write a candidate scoring below the threshold", () => {
    const genreDir = join(tmp, "blues");
    writeRawConfig(genreDir, "poor-song");
    const beforeText = readFileSync(join(genreDir, "poor-song.json"), "utf8");

    const result = applyAnnotations("blues", tmp, [{ slug: "poor-song", musicalLanguage: poorMusicalLanguage() }], DEFAULT_MIN_SCORE);

    expect(result.applied).toHaveLength(0);
    expect(result.belowThreshold.map((r) => r.slug)).toEqual(["poor-song"]);
    expect(result.belowThreshold[0].score.overall).toBeLessThan(DEFAULT_MIN_SCORE);

    const afterText = readFileSync(join(genreDir, "poor-song.json"), "utf8");
    expect(afterText).toBe(beforeText); // byte-for-byte untouched
    expect(JSON.parse(afterText).status).toBe("raw");
    expect(JSON.parse(afterText).musicalLanguage).toBeUndefined();
  });

  it("respects a custom --min-score threshold", () => {
    const genreDir = join(tmp, "blues");
    writeRawConfig(genreDir, "good-song");
    // The good fixture scores ~91; a threshold of 95 should reject it.
    const result = applyAnnotations("blues", tmp, [{ slug: "good-song", musicalLanguage: goodMusicalLanguage() }], 95);

    expect(result.applied).toHaveLength(0);
    expect(result.belowThreshold).toHaveLength(1);
  });

  it("rejects a schema-invalid candidate without writing, and reports the issues", () => {
    const genreDir = join(tmp, "blues");
    writeRawConfig(genreDir, "bad-shape-song");
    const beforeText = readFileSync(join(genreDir, "bad-shape-song.json"), "utf8");

    const malformed = { description: "ok", structure: "ok", keyMoments: "not an array", teachingGoals: [], styleTips: [] };
    const result = applyAnnotations("blues", tmp, [{ slug: "bad-shape-song", musicalLanguage: malformed }], DEFAULT_MIN_SCORE);

    expect(result.schemaErrors).toHaveLength(1);
    expect(result.schemaErrors[0].slug).toBe("bad-shape-song");
    expect(result.schemaErrors[0].issues.some((i) => i.includes("keyMoments"))).toBe(true);
    expect(result.applied).toHaveLength(0);
    expect(result.belowThreshold).toHaveLength(0);

    const afterText = readFileSync(join(genreDir, "bad-shape-song.json"), "utf8");
    expect(afterText).toBe(beforeText);
  });

  it("rejects a candidate missing a required field without writing", () => {
    const genreDir = join(tmp, "blues");
    writeRawConfig(genreDir, "missing-field-song");

    const malformed = { description: "ok", keyMoments: [], teachingGoals: [], styleTips: [] }; // no `structure`
    const result = applyAnnotations("blues", tmp, [{ slug: "missing-field-song", musicalLanguage: malformed }], DEFAULT_MIN_SCORE);

    expect(result.schemaErrors).toHaveLength(1);
    expect(result.schemaErrors[0].issues.some((i) => i.includes("structure"))).toBe(true);
  });

  it("reports an unknown slug without crashing or writing anything", () => {
    const genreDir = join(tmp, "blues");
    mkdirSync(genreDir, { recursive: true });

    const result = applyAnnotations("blues", tmp, [{ slug: "does-not-exist", musicalLanguage: goodMusicalLanguage() }], DEFAULT_MIN_SCORE);

    expect(result.unknownSlugs).toEqual(["does-not-exist"]);
    expect(result.applied).toHaveLength(0);
    expect(existsSync(join(genreDir, "does-not-exist.json"))).toBe(false);
  });

  it("rejects a slug containing path-traversal characters as unknown rather than resolving it", () => {
    const genreDir = join(tmp, "blues");
    mkdirSync(genreDir, { recursive: true });

    const result = applyAnnotations("blues", tmp, [{ slug: "../evil", musicalLanguage: goodMusicalLanguage() }], DEFAULT_MIN_SCORE);

    expect(result.unknownSlugs).toEqual(["../evil"]);
    expect(result.applied).toHaveLength(0);
  });

  it("processes a mixed batch and buckets each candidate independently", () => {
    const genreDir = join(tmp, "blues");
    writeRawConfig(genreDir, "song-good");
    writeRawConfig(genreDir, "song-poor");

    const result = applyAnnotations(
      "blues",
      tmp,
      [
        { slug: "song-good", musicalLanguage: goodMusicalLanguage() },
        { slug: "song-poor", musicalLanguage: poorMusicalLanguage() },
        { slug: "song-missing", musicalLanguage: goodMusicalLanguage() },
      ],
      DEFAULT_MIN_SCORE,
    );

    expect(result.applied.map((a) => a.slug)).toEqual(["song-good"]);
    expect(result.belowThreshold.map((r) => r.slug)).toEqual(["song-poor"]);
    expect(result.unknownSlugs).toEqual(["song-missing"]);
  });
});

// ─── reportGenre ────────────────────────────────────────────────────────────

describe("reportGenre", () => {
  it("reports null score/grade for raw songs and a real score for ready songs", () => {
    const genreDir = join(tmp, "blues");
    writeRawConfig(genreDir, "raw-song");
    writeRawConfig(genreDir, "ready-song", { status: "ready" });
    // Promote ready-song's config to carry a real musicalLanguage block via applyAnnotations
    // (writeRawConfig alone doesn't add one) so it round-trips through the real scorer.
    writeFileSync(
      join(genreDir, "ready-song.json"),
      JSON.stringify(
        {
          id: "ready-song",
          title: "Test Song",
          genre: "blues",
          difficulty: "beginner",
          key: "C major",
          tags: ["test"],
          composer: "Traditional",
          status: "ready",
          musicalLanguage: goodMusicalLanguage(),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );

    const rows = reportGenre("blues", tmp);
    const raw = rows.find((r) => r.slug === "raw-song")!;
    const ready = rows.find((r) => r.slug === "ready-song")!;

    expect(raw.status).toBe("raw");
    expect(raw.score).toBeNull();
    expect(raw.grade).toBeNull();

    expect(ready.status).toBe("ready");
    expect(ready.score).toBeGreaterThanOrEqual(DEFAULT_MIN_SCORE);
    expect(ready.grade).toMatch(/^[AB]$/);
  });

  it("returns one row per song, sorted by slug", () => {
    const genreDir = join(tmp, "blues");
    writeRawConfig(genreDir, "zzz");
    writeRawConfig(genreDir, "aaa");
    writeRawConfig(genreDir, "mmm");

    const rows = reportGenre("blues", tmp);
    expect(rows.map((r) => r.slug)).toEqual(["aaa", "mmm", "zzz"]);
  });

  it("throws a structured error for a missing genre directory", () => {
    expect(() => reportGenre("blues", tmp)).toThrow(/No such genre directory/);
  });
});

// ─── parseArgs (CLI) ────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("parses --analyze <genre> with defaults", () => {
    const args = parseArgs(["--analyze", "blues"]);
    expect(args).toEqual({ mode: "analyze", genre: "blues", out: null, topN: 5 });
  });

  it("parses --analyze with --out and --top-n", () => {
    const args = parseArgs(["--analyze", "folk", "--out", "/tmp/briefs", "--top-n", "3"]);
    expect(args).toMatchObject({ mode: "analyze", genre: "folk", out: "/tmp/briefs", topN: 3 });
  });

  it("parses --apply with --annotations and default min-score", () => {
    const args = parseArgs(["--apply", "blues", "--annotations", "candidates.json"]);
    expect(args).toEqual({ mode: "apply", genre: "blues", annotations: "candidates.json", minScore: DEFAULT_MIN_SCORE });
  });

  it("parses --apply with a custom --min-score", () => {
    const args = parseArgs(["--apply", "blues", "--annotations", "c.json", "--min-score", "75"]);
    expect(args).toMatchObject({ minScore: 75 });
  });

  it("parses --report <genre>", () => {
    const args = parseArgs(["--report", "jazz"]);
    expect(args).toEqual({ mode: "report", genre: "jazz" });
  });

  it("parses --help", () => {
    expect(parseArgs(["--help"])).toEqual({ mode: "help" });
    expect(parseArgs(["-h"])).toEqual({ mode: "help" });
  });

  it("rejects an invalid genre", () => {
    expect(() => parseArgs(["--analyze", "not-a-genre"])).toThrow(CliArgsError);
    expect(() => parseArgs(["--analyze", "not-a-genre"])).toThrow(/invalid or missing genre/);
  });

  it("rejects --apply without --annotations", () => {
    expect(() => parseArgs(["--apply", "blues"])).toThrow(/--apply requires --annotations/);
  });

  it("rejects combining two modes", () => {
    expect(() => parseArgs(["--analyze", "blues", "--report", "folk"])).toThrow(CliArgsError);
  });

  it("rejects an out-of-range --min-score", () => {
    expect(() => parseArgs(["--apply", "blues", "--annotations", "c.json", "--min-score", "150"])).toThrow(/--min-score must be a number 0-100/);
  });

  it("rejects a non-integer --top-n", () => {
    expect(() => parseArgs(["--analyze", "blues", "--top-n", "abc"])).toThrow(/--top-n must be a positive integer/);
  });

  it("rejects an unknown flag", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/unknown flag/);
  });

  it("rejects no mode at all", () => {
    expect(() => parseArgs([])).toThrow(/must specify one of/);
  });
});
