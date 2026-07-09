import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { clearRegistry } from "./registry.js";
import type { SongEntry } from "./types.js";

// ─── node:fs mock (write/rename-interception scaffold for the saveSong ─────
//    atomicity tests below) ───────────────────────────────────────────────
//
// Mirrors src/piano-voices.test.ts's D-B1-005 pattern (vi.mock's factory-
// replacement approach — vi.spyOn does not work in this repo's vitest/ESM
// setup; verified there directly before that file was written). Extended
// here to intercept BOTH writeFileSync AND renameSync (one-shot each) so the
// "write fails" and "rename fails" legs of saveSong's write-temp-then-rename
// contract (./loader.ts) can each be exercised independently. Inert for
// every test that never arms a flag — every other test in this file (and
// every fs call that isn't the one armed call) passes straight through to
// the real implementation.
const mockState = { failWriteOnce: false, failRenameOnce: false };

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      if (mockState.failWriteOnce) {
        mockState.failWriteOnce = false;
        const [path, data, options] = args as [string, string, unknown];
        // Real but truncated write, then throw — simulates a crash partway
        // through the write (same technique as piano-voices.test.ts).
        actual.writeFileSync(path, String(data).slice(0, 8), options as Parameters<typeof actual.writeFileSync>[2]);
        throw new Error("simulated write failure");
      }
      return actual.writeFileSync(...args);
    },
    renameSync: (...args: Parameters<typeof actual.renameSync>) => {
      if (mockState.failRenameOnce) {
        mockState.failRenameOnce = false;
        throw new Error("simulated rename failure");
      }
      return actual.renameSync(...args);
    },
  };
});

// Imported after vi.mock (vi.mock calls are hoisted by vitest regardless of
// import order — written this way for readability, per piano-voices.test.ts).
import { loadSongsFromDir, loadSongFile, saveSong } from "./loader.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeSong(overrides: Partial<SongEntry> = {}): SongEntry {
  return {
    id: "test-song",
    title: "Test Song",
    genre: "classical",
    difficulty: "beginner",
    key: "C major",
    tempo: 120,
    timeSignature: "4/4",
    durationSeconds: 60,
    musicalLanguage: {
      description: "A test song.",
      structure: "ABA",
      keyMoments: ["Opening theme"],
      teachingGoals: ["Basic rhythm"],
      styleTips: ["Legato"],
    },
    measures: [
      { number: 1, rightHand: "C4:q D4:q E4:q F4:q", leftHand: "C3:h E3:h" },
    ],
    tags: ["test"],
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

let tmp: string;

beforeEach(() => {
  clearRegistry();
  tmp = mkdtempSync(join(tmpdir(), "loader-test-"));
});

afterEach(() => {
  mockState.failWriteOnce = false;
  mockState.failRenameOnce = false;
  rmSync(tmp, { recursive: true, force: true });
});

// ── sanitizeSongId (tested indirectly through saveSong) ─────────────────────

describe("sanitizeSongId (via saveSong)", () => {
  it("accepts valid kebab-case IDs", () => {
    const song = makeSong({ id: "my-song-1" });
    const path = saveSong(song, tmp);
    expect(existsSync(path)).toBe(true);
  });

  it("accepts single character IDs", () => {
    const song = makeSong({ id: "a" });
    const path = saveSong(song, tmp);
    expect(path.endsWith("a.json")).toBe(true);
  });

  it("rejects path traversal attempts", () => {
    const song = makeSong({ id: "../evil" });
    expect(() => saveSong(song, tmp)).toThrow("Invalid song ID");
  });

  it("rejects empty string", () => {
    const song = makeSong({ id: "" });
    expect(() => saveSong(song, tmp)).toThrow("Invalid song ID");
  });

  it("rejects IDs with dots", () => {
    const song = makeSong({ id: "song.bad" });
    expect(() => saveSong(song, tmp)).toThrow("Invalid song ID");
  });

  it("rejects IDs with slashes", () => {
    const song = makeSong({ id: "song/bad" });
    expect(() => saveSong(song, tmp)).toThrow("Invalid song ID");
  });

  it("rejects IDs with backslashes", () => {
    const song = makeSong({ id: "song\\bad" });
    expect(() => saveSong(song, tmp)).toThrow("Invalid song ID");
  });

  it("rejects IDs starting with a hyphen", () => {
    const song = makeSong({ id: "-bad" });
    expect(() => saveSong(song, tmp)).toThrow("Invalid song ID");
  });

  it("rejects IDs ending with a hyphen", () => {
    const song = makeSong({ id: "bad-" });
    expect(() => saveSong(song, tmp)).toThrow("Invalid song ID");
  });

  it("rejects uppercase IDs", () => {
    const song = makeSong({ id: "Bad" });
    expect(() => saveSong(song, tmp)).toThrow("Invalid song ID");
  });
});

// ── loadSongsFromDir ────────────────────────────────────────────────────────

describe("loadSongsFromDir", () => {
  it("returns empty array for non-existent directory", () => {
    const result = loadSongsFromDir(join(tmp, "nope"));
    expect(result).toEqual([]);
  });

  it("loads valid JSON song files", () => {
    const song = makeSong();
    writeFileSync(join(tmp, "test-song.json"), JSON.stringify(song));
    const result = loadSongsFromDir(tmp);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("test-song");
  });

  it("skips invalid JSON files without throwing", () => {
    writeFileSync(join(tmp, "bad.json"), "not json at all{{{");
    const result = loadSongsFromDir(tmp);
    expect(result).toEqual([]);
  });

  it("skips JSON that fails validation", () => {
    writeFileSync(join(tmp, "bad.json"), JSON.stringify({ id: "x" }));
    const result = loadSongsFromDir(tmp);
    expect(result).toEqual([]);
  });

  it("ignores non-JSON files", () => {
    writeFileSync(join(tmp, "readme.txt"), "hello");
    const song = makeSong();
    writeFileSync(join(tmp, "test-song.json"), JSON.stringify(song));
    const result = loadSongsFromDir(tmp);
    expect(result).toHaveLength(1);
  });

  it("loads multiple valid songs", () => {
    const s1 = makeSong({ id: "song-a", title: "Song A" });
    const s2 = makeSong({ id: "song-b", title: "Song B" });
    writeFileSync(join(tmp, "song-a.json"), JSON.stringify(s1));
    writeFileSync(join(tmp, "song-b.json"), JSON.stringify(s2));
    const result = loadSongsFromDir(tmp);
    expect(result).toHaveLength(2);
  });
});

// ── loadSongFile ────────────────────────────────────────────────────────────

describe("loadSongFile", () => {
  it("loads a valid song file", () => {
    const song = makeSong();
    const filePath = join(tmp, "test-song.json");
    writeFileSync(filePath, JSON.stringify(song));
    const loaded = loadSongFile(filePath);
    expect(loaded.id).toBe("test-song");
    expect(loaded.title).toBe("Test Song");
  });

  it("throws on invalid JSON", () => {
    const filePath = join(tmp, "bad.json");
    writeFileSync(filePath, "{broken");
    expect(() => loadSongFile(filePath)).toThrow();
  });

  it("throws on missing file", () => {
    expect(() => loadSongFile(join(tmp, "nope.json"))).toThrow();
  });

  it("throws on valid JSON that fails song validation", () => {
    const filePath = join(tmp, "invalid-song.json");
    writeFileSync(filePath, JSON.stringify({ id: "x", title: 123 }));
    expect(() => loadSongFile(filePath)).toThrow("Invalid song");
  });
});

// ── saveSong ────────────────────────────────────────────────────────────────

describe("saveSong", () => {
  it("saves a song as formatted JSON", () => {
    const song = makeSong();
    const filePath = saveSong(song, tmp);
    expect(existsSync(filePath)).toBe(true);
    const content = JSON.parse(readFileSync(filePath, "utf8"));
    expect(content.id).toBe("test-song");
  });

  it("creates intermediate directories", () => {
    const nested = join(tmp, "a", "b", "c");
    const song = makeSong();
    const filePath = saveSong(song, nested);
    expect(existsSync(filePath)).toBe(true);
  });

  it("writes file with trailing newline", () => {
    const song = makeSong();
    const filePath = saveSong(song, tmp);
    const raw = readFileSync(filePath, "utf8");
    expect(raw.endsWith("\n")).toBe(true);
  });

  it("returns the full file path", () => {
    const song = makeSong({ id: "my-tune" });
    const filePath = saveSong(song, tmp);
    expect(filePath).toBe(join(tmp, "my-tune.json"));
  });
});

// ── saveSong — atomic write (write-temp-then-rename, mirrors ───────────────
//    piano-voices.test.ts's D-B1-005 pattern) ───────────────────────────────

describe("saveSong — atomic write (write-temp-then-rename)", () => {
  it("CORE (write failure leg): an interrupted write does not corrupt the previously-saved live file, and leaves no .tmp orphan", () => {
    const original = makeSong({ id: "atomic-song", title: "Original Title" });
    const path = saveSong(original, tmp);
    const before = readFileSync(path, "utf8");
    expect(JSON.parse(before).title).toBe("Original Title");

    mockState.failWriteOnce = true;
    const mutated = makeSong({ id: "atomic-song", title: "MUTATED — should never land" });
    expect(() => saveSong(mutated, tmp)).toThrow("simulated write failure");
    expect(mockState.failWriteOnce).toBe(false); // one-shot consumed

    // Live file is byte-identical to before the crashed save.
    const after = readFileSync(path, "utf8");
    expect(after).toBe(before);
    expect(JSON.parse(after).title).toBe("Original Title");

    // No .tmp (or any other stray file) left behind in the directory.
    expect(readdirSync(tmp)).toEqual(["atomic-song.json"]);
  });

  it("CORE (rename failure leg): a failed rename does not corrupt the previously-saved live file, and leaves no .tmp orphan", () => {
    const original = makeSong({ id: "atomic-song-2", title: "Original Title" });
    const path = saveSong(original, tmp);
    const before = readFileSync(path, "utf8");

    mockState.failRenameOnce = true;
    const mutated = makeSong({ id: "atomic-song-2", title: "MUTATED — should never land" });
    expect(() => saveSong(mutated, tmp)).toThrow("simulated rename failure");
    expect(mockState.failRenameOnce).toBe(false); // one-shot consumed

    const after = readFileSync(path, "utf8");
    expect(after).toBe(before);
    expect(JSON.parse(after).title).toBe("Original Title");

    expect(readdirSync(tmp)).toEqual(["atomic-song-2.json"]);
  });

  it("a subsequent (non-intercepted) save after a simulated write failure succeeds normally", () => {
    saveSong(makeSong({ id: "atomic-song-3", title: "First" }), tmp);
    mockState.failWriteOnce = true;
    expect(() => saveSong(makeSong({ id: "atomic-song-3", title: "Crashed" }), tmp)).toThrow();

    saveSong(makeSong({ id: "atomic-song-3", title: "Recovered" }), tmp);
    const content = JSON.parse(readFileSync(join(tmp, "atomic-song-3.json"), "utf8"));
    expect(content.title).toBe("Recovered");
    expect(readdirSync(tmp)).toEqual(["atomic-song-3.json"]);
  });

  it("a subsequent (non-intercepted) save after a simulated rename failure succeeds normally", () => {
    saveSong(makeSong({ id: "atomic-song-4", title: "First" }), tmp);
    mockState.failRenameOnce = true;
    expect(() => saveSong(makeSong({ id: "atomic-song-4", title: "Crashed" }), tmp)).toThrow();

    saveSong(makeSong({ id: "atomic-song-4", title: "Recovered" }), tmp);
    const content = JSON.parse(readFileSync(join(tmp, "atomic-song-4.json"), "utf8"));
    expect(content.title).toBe("Recovered");
    expect(readdirSync(tmp)).toEqual(["atomic-song-4.json"]);
  });
});
