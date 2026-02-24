// ─── Practice Journal ────────────────────────────────────────────────────────
//
// Persistent learning across sessions. One markdown file per day, appended
// after each play session. The LLM writes reflections, the server captures
// session facts. Next session, the journal loads and the LLM picks up where
// it left off.
//
// Directory: ~/.ai-jam-sessions/journal/
// Format:    YYYY-MM-DD.md (one file per day, append-only)
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, appendFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SessionSnapshot {
  songId: string;
  title: string;
  composer?: string;
  genre: string;
  difficulty: string;
  key: string;
  tempo: number;
  speed: number;
  mode: string;
  measuresPlayed: number;
  totalMeasures: number;
  durationSeconds: number;
  timestamp: string;
}

// ─── Paths ──────────────────────────────────────────────────────────────────

export function getJournalDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return join(home, ".ai-jam-sessions", "journal");
}

function ensureJournalDir(): string {
  const dir = getJournalDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function dateToFilename(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}.md`;
}

function timeString(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

// ─── Build Entry ────────────────────────────────────────────────────────────

/**
 * Build a markdown journal entry from session data + LLM reflection.
 */
export function buildJournalEntry(
  session: SessionSnapshot | null,
  note: string,
  now: Date = new Date(),
): string {
  const time = timeString(now);
  const lines: string[] = [];

  lines.push("---");

  if (session) {
    const speedStr = session.speed !== 1.0 ? ` × ${session.speed}x` : "";
    const composerStr = session.composer ? ` (${session.composer})` : "";
    const pct = session.totalMeasures > 0
      ? Math.round((session.measuresPlayed / session.totalMeasures) * 100)
      : 0;
    const completion = pct === 100
      ? `${session.measuresPlayed}/${session.totalMeasures} measures`
      : `${session.measuresPlayed}/${session.totalMeasures} measures (${pct}%)`;

    lines.push(`### ${time} — ${session.title}${composerStr}`);
    lines.push(`**${session.genre}** | ${session.difficulty} | ${session.key} | ${session.tempo} BPM${speedStr} | ${completion} | ${session.durationSeconds}s`);
  } else {
    lines.push(`### ${time} — General notes`);
  }

  lines.push("");
  lines.push(note.trim());
  lines.push("");
  lines.push("---");
  lines.push("");

  return lines.join("\n");
}

// ─── Write ──────────────────────────────────────────────────────────────────

/**
 * Append a journal entry to today's file.
 */
export function appendJournalEntry(entry: string, date: Date = new Date()): string {
  const dir = ensureJournalDir();
  const filename = dateToFilename(date);
  const filepath = join(dir, filename);

  // Add day header if this is a new file
  if (!existsSync(filepath)) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    appendFileSync(filepath, `# Practice Journal — ${y}-${m}-${d}\n\n`, "utf8");
  }

  appendFileSync(filepath, entry, "utf8");
  return filepath;
}

// ─── Read ───────────────────────────────────────────────────────────────────

/**
 * Read recent journal entries.
 *
 * @param days  How many days back to read (default: 7)
 * @param songFilter  Optional song ID or title to filter entries
 * @returns Concatenated journal text (most recent last)
 */
export function readJournal(days: number = 7, songFilter?: string): string {
  const dir = getJournalDir();
  if (!existsSync(dir)) return "";

  const now = new Date();
  const entries: string[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const filename = dateToFilename(date);
    const filepath = join(dir, filename);

    if (existsSync(filepath)) {
      const content = readFileSync(filepath, "utf8");

      if (songFilter) {
        // Extract matching entries (between --- markers)
        const blocks = content.split(/^---$/m).filter(Boolean);
        const matching = blocks.filter(
          (b) => b.toLowerCase().includes(songFilter.toLowerCase())
        );
        if (matching.length > 0) {
          entries.push(`---${matching.join("---")}---`);
        }
      } else {
        entries.push(content);
      }
    }
  }

  if (entries.length === 0) {
    return songFilter
      ? `No journal entries found for "${songFilter}" in the last ${days} days.`
      : `No journal entries in the last ${days} days.`;
  }

  return entries.join("\n");
}

/**
 * Get a summary of journal activity.
 */
export function journalStats(): { totalEntries: number; totalDays: number; recentDays: string[] } {
  const dir = getJournalDir();
  if (!existsSync(dir)) return { totalEntries: 0, totalDays: 0, recentDays: [] };

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();

  let totalEntries = 0;
  for (const file of files) {
    const content = readFileSync(join(dir, file), "utf8");
    // Count --- delimiters (each entry starts with one)
    const matches = content.match(/^---$/gm);
    if (matches) totalEntries += Math.floor(matches.length / 2); // pairs of ---
  }

  return {
    totalEntries,
    totalDays: files.length,
    recentDays: files.slice(-5).map((f) => f.replace(".md", "")),
  };
}
