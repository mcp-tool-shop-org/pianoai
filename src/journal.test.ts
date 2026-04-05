// ─── Practice Journal Tests ─────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildJournalEntry,
  appendJournalEntry,
  readJournal,
  journalStats,
  getJournalDir,
  type SessionSnapshot,
} from "./journal.js";
import type { PerformanceResult } from "./score-performance.js";
import * as fs from "node:fs";

// ─── Mock filesystem ───────────────────────────────────────────────────────

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof fs>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(),
    appendFileSync: vi.fn(),
    readdirSync: vi.fn(),
  };
});

const mockExistsSync = vi.mocked(fs.existsSync);
const mockMkdirSync = vi.mocked(fs.mkdirSync);
const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockAppendFileSync = vi.mocked(fs.appendFileSync);
const mockReaddirSync = vi.mocked(fs.readdirSync);

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── buildJournalEntry ─────────────────────────────────────────────────────

describe("buildJournalEntry", () => {
  const fixedDate = new Date(2026, 3, 1, 14, 30); // 2026-04-01 14:30

  const sampleSession: SessionSnapshot = {
    songId: "fallin",
    title: "Fallin'",
    composer: "Alicia Keys",
    genre: "r-and-b",
    difficulty: "intermediate",
    key: "Em",
    tempo: 68,
    speed: 1.0,
    mode: "full",
    measuresPlayed: 25,
    totalMeasures: 25,
    durationSeconds: 120,
    timestamp: "2026-04-01T14:30:00Z",
  };

  it("builds entry with session data", () => {
    const entry = buildJournalEntry(sampleSession, "Good practice today.", fixedDate);
    expect(entry).toContain("### 14:30 — Fallin' (Alicia Keys)");
    expect(entry).toContain("r-and-b");
    expect(entry).toContain("intermediate");
    expect(entry).toContain("68 BPM");
    expect(entry).toContain("25/25 measures");
    expect(entry).toContain("Good practice today.");
    expect(entry).toContain("---");
  });

  it("builds entry without session (general notes)", () => {
    const entry = buildJournalEntry(null, "Just some thoughts.", fixedDate);
    expect(entry).toContain("### 14:30 — General notes");
    expect(entry).toContain("Just some thoughts.");
  });

  it("shows speed when not 1.0", () => {
    const session = { ...sampleSession, speed: 0.75 };
    const entry = buildJournalEntry(session, "Slow practice.", fixedDate);
    expect(entry).toContain("0.75x");
  });

  it("does not show speed when 1.0", () => {
    const entry = buildJournalEntry(sampleSession, "Normal speed.", fixedDate);
    expect(entry).not.toContain("1.0x");
  });

  it("shows percentage when not 100%", () => {
    const session = { ...sampleSession, measuresPlayed: 10 };
    const entry = buildJournalEntry(session, "Partial.", fixedDate);
    expect(entry).toContain("10/25 measures (40%)");
  });

  it("omits composer when not provided", () => {
    const session = { ...sampleSession, composer: undefined };
    const entry = buildJournalEntry(session, "No composer.", fixedDate);
    expect(entry).toContain("### 14:30 — Fallin'");
    expect(entry).not.toContain("(undefined)");
  });

  it("trims whitespace from note", () => {
    const entry = buildJournalEntry(null, "  trimmed  \n\n", fixedDate);
    expect(entry).toContain("trimmed");
    // The note itself should be trimmed (no leading/trailing whitespace)
    const lines = entry.split("\n");
    const trimmedLine = lines.find(l => l.includes("trimmed"));
    expect(trimmedLine).toBe("trimmed");
  });

  // ─── Score integration (FT-BE-002) ─────────────────────────────────────

  const sampleScore: PerformanceResult = {
    songId: "fallin",
    songTitle: "Fallin'",
    metrics: {
      overallScore: 82,
      pitchAccuracy: 90,
      timingAccuracyMs: 45,
      completeness: 78,
      extraNoteCount: 2,
    },
    details: {
      totalExpected: 50,
      totalPlayed: 48,
      matched: 39,
      missed: [],
      extras: [],
      timingIssues: [],
    },
    feedback: "## Performance: B (82/100)",
  };

  it("includes score line when PerformanceResult is provided", () => {
    const entry = buildJournalEntry(sampleSession, "Good session.", fixedDate, sampleScore);
    expect(entry).toContain("Score: B (82/100) | Pitch 90% | Timing ±45ms | Complete 78%");
  });

  it("places score line after metadata and before note text", () => {
    const entry = buildJournalEntry(sampleSession, "Good session.", fixedDate, sampleScore);
    const lines = entry.split("\n");
    const metadataIdx = lines.findIndex(l => l.startsWith("**"));
    const scoreIdx = lines.findIndex(l => l.startsWith("Score:"));
    const noteIdx = lines.findIndex(l => l === "Good session.");
    expect(scoreIdx).toBeGreaterThan(metadataIdx);
    expect(scoreIdx).toBeLessThan(noteIdx);
  });

  it("omits score line when no PerformanceResult", () => {
    const entry = buildJournalEntry(sampleSession, "No score.", fixedDate);
    expect(entry).not.toContain("Score:");
  });

  it("renders correct grade letters for different scores", () => {
    const makeScore = (overall: number): PerformanceResult => ({
      ...sampleScore,
      metrics: { ...sampleScore.metrics, overallScore: overall },
    });

    const entryA = buildJournalEntry(null, "n", fixedDate, makeScore(95));
    expect(entryA).toContain("Score: A");

    const entryC = buildJournalEntry(null, "n", fixedDate, makeScore(72));
    expect(entryC).toContain("Score: C");

    const entryD = buildJournalEntry(null, "n", fixedDate, makeScore(65));
    expect(entryD).toContain("Score: D");

    const entryF = buildJournalEntry(null, "n", fixedDate, makeScore(40));
    expect(entryF).toContain("Score: F");
  });

  it("includes score line even for general notes (no session)", () => {
    const entry = buildJournalEntry(null, "Review notes.", fixedDate, sampleScore);
    expect(entry).toContain("Score: B (82/100)");
    expect(entry).toContain("### 14:30 — General notes");
  });
});

// ─── appendJournalEntry ────────────────────────────────────────────────────

describe("appendJournalEntry", () => {
  const fixedDate = new Date(2026, 3, 1);

  it("creates journal directory if missing", () => {
    mockExistsSync.mockReturnValueOnce(false); // dir doesn't exist
    mockExistsSync.mockReturnValueOnce(false); // file doesn't exist

    appendJournalEntry("test entry\n", fixedDate);

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringContaining("journal"),
      { recursive: true },
    );
  });

  it("adds day header for new file", () => {
    mockExistsSync.mockReturnValueOnce(true); // dir exists
    mockExistsSync.mockReturnValueOnce(false); // file doesn't exist

    appendJournalEntry("test entry\n", fixedDate);

    // First call is the header, second is the entry
    expect(mockAppendFileSync).toHaveBeenCalledTimes(2);
    const headerCall = mockAppendFileSync.mock.calls[0];
    expect(headerCall[1]).toContain("# Practice Journal — 2026-04-01");
  });

  it("skips header for existing file", () => {
    mockExistsSync.mockReturnValueOnce(true); // dir exists
    mockExistsSync.mockReturnValueOnce(true); // file exists

    appendJournalEntry("test entry\n", fixedDate);

    // Only one call — the entry itself
    expect(mockAppendFileSync).toHaveBeenCalledTimes(1);
  });

  it("returns the filepath", () => {
    mockExistsSync.mockReturnValue(true);

    const result = appendJournalEntry("entry\n", fixedDate);
    expect(result).toContain("2026-04-01.md");
  });
});

// ─── readJournal ───────────────────────────────────────────────────────────

describe("readJournal", () => {
  it("returns empty string when journal dir does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    const result = readJournal(7);
    expect(result).toBe("");
  });

  it("reads and concatenates recent journal files", () => {
    // existsSync: first for dir, then for each day file
    mockExistsSync.mockImplementation((path: any) => {
      if (typeof path === "string" && path.endsWith(".md")) return true;
      return true; // dir exists
    });
    mockReadFileSync.mockReturnValue("# Practice Journal\n\nSome content\n");

    const result = readJournal(1);
    expect(result).toContain("Some content");
  });

  it("filters entries by song when songFilter provided", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      "### 14:00 — Fallin'\nSome note\n---\n### 15:00 — Imagine\nAnother note\n---\n"
    );

    const result = readJournal(1, "Fallin");
    expect(result).toContain("Fallin");
    expect(result).not.toContain("Imagine");
  });

  it("returns 'not found' message when song filter has no matches", () => {
    mockExistsSync.mockImplementation((path: any) => {
      if (typeof path === "string" && path.endsWith(".md")) return false;
      return true; // dir exists
    });

    const result = readJournal(1, "NonexistentSong");
    expect(result).toContain("No journal entries found");
    expect(result).toContain("NonexistentSong");
  });
});

// ─── journalStats ──────────────────────────────────────────────────────────

describe("journalStats", () => {
  it("returns zeros when journal dir does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    const stats = journalStats();
    expect(stats).toEqual({ totalEntries: 0, totalDays: 0, recentDays: [] });
  });

  it("counts days and entries from md files", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["2026-03-30.md", "2026-03-31.md", "2026-04-01.md"] as any);
    mockReadFileSync.mockReturnValue("### 14:30 — Fallin'\nsome note\n---\n### 15:00 — Imagine\nanother note\n---\n");

    const stats = journalStats();
    expect(stats.totalDays).toBe(3);
    expect(stats.recentDays).toEqual(["2026-03-30", "2026-03-31", "2026-04-01"]);
    // Each file has 2 entry headers (### HH:MM) = 2 entries per file × 3 files
    expect(stats.totalEntries).toBe(6);
  });

  it("counts entries by ### HH:MM headers, not --- delimiters", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(["2026-04-01.md"] as any);
    // 3 entries, each with one --- separator
    mockReadFileSync.mockReturnValue(
      "# Practice Journal — 2026-04-01\n\n" +
      "### 10:00 — Song A\nNote\n---\n" +
      "### 11:00 — Song B\nNote\n---\n" +
      "### 12:00 — Song C\nNote\n---\n"
    );

    const stats = journalStats();
    expect(stats.totalEntries).toBe(3);
  });

  it("limits recentDays to last 5", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([
      "2026-03-26.md", "2026-03-27.md", "2026-03-28.md",
      "2026-03-29.md", "2026-03-30.md", "2026-03-31.md", "2026-04-01.md",
    ] as any);
    mockReadFileSync.mockReturnValue("");

    const stats = journalStats();
    expect(stats.totalDays).toBe(7);
    expect(stats.recentDays.length).toBe(5);
  });
});

// ─── getJournalDir ─────────────────────────────────────────────────────────

describe("getJournalDir", () => {
  it("returns a path containing .ai-jam-sessions/journal", () => {
    const dir = getJournalDir();
    expect(dir).toContain(".ai-jam-sessions");
    expect(dir).toContain("journal");
  });
});
