import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  scanLibrary,
  getLibraryProgress,
  ingestSong,
  initializeFromLibrary,
  type LibraryEntry,
  type InitReport,
} from "./library.js";
import { clearRegistry, getAllSongs } from "./registry.js";
import type { SongConfig } from "./config/schema.js";
import type { SongEntry } from "./types.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

let tmp: string;

function makeConfig(overrides: Partial<SongConfig> = {}): SongConfig {
  return {
    id: "test-piece",
    title: "Test Piece",
    genre: "classical",
    difficulty: "beginner",
    key: "C major",
    tempo: 120,
    timeSignature: "4/4",
    tags: ["test"],
    status: "raw",
    musicalLanguage: {
      description: "A test piece for unit testing.",
      structure: "ABA",
      keyMoments: ["Opening theme"],
      teachingGoals: ["Basic rhythm"],
      styleTips: ["Legato"],
    },
    ...overrides,
  } as SongConfig;
}

function makeSong(overrides: Partial<SongEntry> = {}): SongEntry {
  return {
    id: "user-song",
    title: "User Song",
    genre: "jazz",
    difficulty: "intermediate",
    key: "Bb major",
    tempo: 100,
    timeSignature: "4/4",
    durationSeconds: 90,
    musicalLanguage: {
      description: "A user song.",
      structure: "AABA",
      keyMoments: ["Bridge"],
      teachingGoals: ["Swing feel"],
      styleTips: ["Swing eighths"],
    },
    measures: [
      { number: 1, rightHand: "Bb4:q C5:q D5:q Eb5:q", leftHand: "Bb2:h D3:h" },
    ],
    tags: ["user"],
    ...overrides,
  };
}

/** Write a config JSON into the appropriate genre subdir. */
function writeConfig(libraryDir: string, genre: string, config: SongConfig): void {
  const genreDir = join(libraryDir, genre);
  mkdirSync(genreDir, { recursive: true });
  writeFileSync(join(genreDir, `${config.id}.json`), JSON.stringify(config));
}

/** Write a MIDI file with one note so it produces a valid SongEntry. */
function writeMidi(libraryDir: string, genre: string, id: string): void {
  const genreDir = join(libraryDir, genre);
  mkdirSync(genreDir, { recursive: true });
  // Format 0, 1 track, 480 ticks/beat
  // Track: tempo 120 BPM, time sig 4/4, note on C4 vel 80, wait 480 ticks, note off, end of track
  const header = Buffer.from([
    0x4d, 0x54, 0x68, 0x64, // MThd
    0x00, 0x00, 0x00, 0x06, // chunk length = 6
    0x00, 0x00,             // format 0
    0x00, 0x01,             // 1 track
    0x01, 0xe0,             // 480 ticks per beat
  ]);
  const trackData = Buffer.from([
    // Tempo: 500000 microseconds/beat = 120 BPM
    0x00, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20,
    // Time signature: 4/4
    0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08,
    // Note on: channel 0, C4 (60), velocity 80
    0x00, 0x90, 0x3c, 0x50,
    // Wait 480 ticks (one beat = quarter note), then note off
    0x83, 0x60, 0x80, 0x3c, 0x00,
    // End of track
    0x00, 0xff, 0x2f, 0x00,
  ]);
  const trackChunkHeader = Buffer.from([
    0x4d, 0x54, 0x72, 0x6b, // MTrk
    0x00, 0x00, 0x00, 0x00, // placeholder length
  ]);
  trackChunkHeader.writeUInt32BE(trackData.length, 4);
  writeFileSync(
    join(genreDir, `${id}.mid`),
    Buffer.concat([header, trackChunkHeader, trackData]),
  );
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────

beforeEach(() => {
  clearRegistry();
  tmp = mkdtempSync(join(tmpdir(), "library-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

// ─── scanLibrary ────────────────────────────────────────────────────────────

describe("scanLibrary", () => {
  it("returns empty array for non-existent library", () => {
    const entries = scanLibrary(join(tmp, "nope"));
    expect(entries).toEqual([]);
  });

  it("scans configs from genre directories", () => {
    const config = makeConfig({ id: "test-piece", status: "raw" });
    writeConfig(tmp, "classical", config);
    const entries = scanLibrary(tmp);
    expect(entries).toHaveLength(1);
    expect(entries[0].genre).toBe("classical");
    expect(entries[0].config.id).toBe("test-piece");
  });

  it("skips invalid config JSON", () => {
    mkdirSync(join(tmp, "classical"), { recursive: true });
    writeFileSync(join(tmp, "classical", "bad.json"), "not json");
    const entries = scanLibrary(tmp);
    expect(entries).toEqual([]);
  });

  it("skips configs that fail schema validation", () => {
    mkdirSync(join(tmp, "classical"), { recursive: true });
    writeFileSync(
      join(tmp, "classical", "bad.json"),
      JSON.stringify({ id: "UPPERCASE", title: "" }),
    );
    const entries = scanLibrary(tmp);
    expect(entries).toEqual([]);
  });

  it("scans multiple genres", () => {
    writeConfig(tmp, "classical", makeConfig({ id: "piece-a" }));
    writeConfig(tmp, "jazz", makeConfig({ id: "piece-b", genre: "jazz" }));
    const entries = scanLibrary(tmp);
    expect(entries).toHaveLength(2);
    const genres = entries.map(e => e.genre);
    expect(genres).toContain("classical");
    expect(genres).toContain("jazz");
  });
});

// ─── getLibraryProgress ─────────────────────────────────────────────────────

describe("getLibraryProgress", () => {
  it("returns zeroes for empty library", () => {
    const progress = getLibraryProgress(join(tmp, "nope"));
    expect(progress.total).toBe(0);
    expect(progress.raw).toBe(0);
    expect(progress.annotated).toBe(0);
    expect(progress.ready).toBe(0);
  });

  it("counts status breakdown correctly", () => {
    writeConfig(tmp, "classical", makeConfig({ id: "raw-one", status: "raw" }));
    writeConfig(tmp, "classical", makeConfig({ id: "annotated-one", status: "annotated" }));
    writeConfig(tmp, "classical", makeConfig({ id: "ready-one", status: "ready" }));
    const progress = getLibraryProgress(tmp);
    expect(progress.total).toBe(3);
    expect(progress.raw).toBe(1);
    expect(progress.annotated).toBe(1);
    expect(progress.ready).toBe(1);
  });

  it("counts by genre", () => {
    writeConfig(tmp, "classical", makeConfig({ id: "classic-one" }));
    writeConfig(tmp, "jazz", makeConfig({ id: "jazz-one", genre: "jazz" }));
    writeConfig(tmp, "jazz", makeConfig({ id: "jazz-two", genre: "jazz" }));
    const progress = getLibraryProgress(tmp);
    expect(progress.byGenre.classical?.total).toBe(1);
    expect(progress.byGenre.jazz?.total).toBe(2);
  });

  it("sorts songs by status (ready first)", () => {
    writeConfig(tmp, "classical", makeConfig({ id: "raw-one", status: "raw" }));
    writeConfig(tmp, "classical", makeConfig({ id: "ready-one", status: "ready" }));
    writeConfig(tmp, "classical", makeConfig({ id: "annotated-one", status: "annotated" }));
    const progress = getLibraryProgress(tmp);
    const songs = progress.byGenre.classical?.songs ?? [];
    expect(songs[0].status).toBe("ready");
    expect(songs[1].status).toBe("annotated");
    expect(songs[2].status).toBe("raw");
  });
});

// ─── ingestSong ─────────────────────────────────────────────────────────────

describe("ingestSong", () => {
  it("throws when status is not ready", () => {
    const entry: LibraryEntry = {
      config: makeConfig({ id: "raw-song", status: "raw" }),
      genre: "classical",
      midiPath: join(tmp, "classical", "raw-song.mid"),
      configPath: join(tmp, "classical", "raw-song.json"),
    };
    expect(() => ingestSong(entry)).toThrow('not ready (status: raw)');
  });

  it("throws when status is annotated", () => {
    const entry: LibraryEntry = {
      config: makeConfig({ id: "ann-song", status: "annotated" }),
      genre: "classical",
      midiPath: join(tmp, "classical", "ann-song.mid"),
      configPath: join(tmp, "classical", "ann-song.json"),
    };
    expect(() => ingestSong(entry)).toThrow('not ready (status: annotated)');
  });

  it("throws when MIDI file is missing", () => {
    const entry: LibraryEntry = {
      config: makeConfig({ id: "no-midi", status: "ready" }),
      genre: "classical",
      midiPath: join(tmp, "classical", "no-midi.mid"),
      configPath: join(tmp, "classical", "no-midi.json"),
    };
    expect(() => ingestSong(entry)).toThrow("MIDI file not found");
  });

  it("ingests a valid ready entry with MIDI file", () => {
    const config = makeConfig({ id: "good-song", status: "ready" });
    writeConfig(tmp, "classical", config);
    writeMidi(tmp, "classical", "good-song");

    const entry: LibraryEntry = {
      config,
      genre: "classical",
      midiPath: join(tmp, "classical", "good-song.mid"),
      configPath: join(tmp, "classical", "good-song.json"),
    };

    // midiToSongEntry should parse the minimal MIDI and return a SongEntry
    const song = ingestSong(entry);
    expect(song.id).toBe("good-song");
    expect(song.title).toBe("Test Piece");
  });
});

// ─── initializeFromLibrary ──────────────────────────────────────────────────

describe("initializeFromLibrary", () => {
  it("handles non-existent library dir and returns empty report", () => {
    const report = initializeFromLibrary(join(tmp, "no-such-dir"));
    expect(getAllSongs()).toHaveLength(0);
    expect(report.loaded).toBe(0);
    expect(report.total).toBe(0);
    expect(report.errors).toHaveLength(0);
  });

  it("loads ready songs with MIDI into registry", () => {
    const config = makeConfig({ id: "ready-song", status: "ready" });
    writeConfig(tmp, "classical", config);
    writeMidi(tmp, "classical", "ready-song");

    const report = initializeFromLibrary(tmp);
    const songs = getAllSongs();
    expect(songs).toHaveLength(1);
    expect(songs[0].id).toBe("ready-song");
    expect(report.loaded).toBe(1);
    expect(report.skipped).toBe(0);
    expect(report.notReady).toBe(0);
  });

  it("skips non-ready songs and reports notReady count", () => {
    writeConfig(tmp, "classical", makeConfig({ id: "raw-only", status: "raw" }));
    writeMidi(tmp, "classical", "raw-only");
    const report = initializeFromLibrary(tmp);
    expect(getAllSongs()).toHaveLength(0);
    expect(report.notReady).toBe(1);
    expect(report.total).toBe(1);
  });

  it("skips ready songs without MIDI and reports notReady", () => {
    writeConfig(tmp, "classical", makeConfig({ id: "no-midi", status: "ready" }));
    // No .mid file written — counted as not-ready (no MIDI)
    const report = initializeFromLibrary(tmp);
    expect(getAllSongs()).toHaveLength(0);
    expect(report.notReady).toBe(1);
  });

  it("loads user songs from user directory", () => {
    const userDir = join(tmp, "user");
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, "user-song.json"), JSON.stringify(makeSong()));

    initializeFromLibrary(join(tmp, "empty-lib"), userDir);
    const songs = getAllSongs();
    expect(songs).toHaveLength(1);
    expect(songs[0].id).toBe("user-song");
  });

  it("loads both library and user songs", () => {
    // Library song
    const config = makeConfig({ id: "lib-song", status: "ready" });
    writeConfig(tmp, "classical", config);
    writeMidi(tmp, "classical", "lib-song");

    // User song
    const userDir = join(tmp, "user");
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, "user-song.json"), JSON.stringify(makeSong()));

    const report = initializeFromLibrary(tmp, userDir);
    const songs = getAllSongs();
    expect(songs).toHaveLength(2);
    expect(report.loaded).toBe(1);
    expect(report.userSongsLoaded).toBe(1);
  });

  it("reports user songs loaded count", () => {
    const userDir = join(tmp, "user");
    mkdirSync(userDir, { recursive: true });
    writeFileSync(join(userDir, "song-a.json"), JSON.stringify(makeSong({ id: "song-a" })));
    writeFileSync(join(userDir, "song-b.json"), JSON.stringify(makeSong({ id: "song-b" })));

    const report = initializeFromLibrary(join(tmp, "empty-lib"), userDir);
    expect(report.userSongsLoaded).toBe(2);
    expect(getAllSongs()).toHaveLength(2);
  });

  it("handles corrupted MIDI gracefully and reports errors", () => {
    const config = makeConfig({ id: "corrupt-midi", status: "ready" });
    writeConfig(tmp, "classical", config);
    // Write garbage bytes instead of valid MIDI
    const genreDir = join(tmp, "classical");
    writeFileSync(join(genreDir, "corrupt-midi.mid"), Buffer.from("not a midi file"));

    const report = initializeFromLibrary(tmp);
    expect(getAllSongs()).toHaveLength(0);
    expect(report.skipped).toBe(1);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0].id).toBe("corrupt-midi");
  });

  it("loads multiple genres correctly", () => {
    writeConfig(tmp, "classical", makeConfig({ id: "classical-song", status: "ready" }));
    writeMidi(tmp, "classical", "classical-song");
    writeConfig(tmp, "jazz", makeConfig({ id: "jazz-song", genre: "jazz", status: "ready" }));
    writeMidi(tmp, "jazz", "jazz-song");

    const report = initializeFromLibrary(tmp);
    expect(report.loaded).toBe(2);
    expect(getAllSongs()).toHaveLength(2);
  });

  it("handles mixed status songs in one genre", () => {
    writeConfig(tmp, "classical", makeConfig({ id: "ready-one", status: "ready" }));
    writeMidi(tmp, "classical", "ready-one");
    writeConfig(tmp, "classical", makeConfig({ id: "raw-one", status: "raw" }));
    writeMidi(tmp, "classical", "raw-one");
    writeConfig(tmp, "classical", makeConfig({ id: "annotated-one", status: "annotated" }));
    writeMidi(tmp, "classical", "annotated-one");

    const report = initializeFromLibrary(tmp);
    expect(report.loaded).toBe(1);
    expect(report.notReady).toBe(2);
    expect(report.total).toBe(3);
  });

  it("clears registry on re-initialization", () => {
    writeConfig(tmp, "classical", makeConfig({ id: "first-song", status: "ready" }));
    writeMidi(tmp, "classical", "first-song");
    initializeFromLibrary(tmp);
    expect(getAllSongs()).toHaveLength(1);

    // Re-initialize with different library
    const tmp2 = mkdtempSync(join(tmpdir(), "library-reinit-"));
    initializeFromLibrary(tmp2);
    expect(getAllSongs()).toHaveLength(0);
    rmSync(tmp2, { recursive: true, force: true });
  });
});
