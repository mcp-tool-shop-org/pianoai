#!/usr/bin/env node
// ─── ai-jam-sessions: MCP Server ─────────────────────────────────────────────
//
// Exposes the ai-music-sheets registry and session engine as MCP tools.
// An LLM can browse songs, get teaching info, suggest practice setups,
// and push teaching interjections — all through the standard MCP protocol.
//
// Usage:
//   node dist/mcp-server.js          # stdio transport
//
// Tools: see the registerTool(...) calls below for the authoritative,
// always-current list — this header used to hand-enumerate tool names and
// silently drifted out of sync with the real registrations (stale count +
// renamed/missing entries). The live count is now tracked automatically
// (registeredToolCount) and reported by the server_info tool, so it can't
// drift again. Grep `registerTool(` in this file to enumerate every tool.
// ─────────────────────────────────────────────────────────────────────────────

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { VERSION } from "./version.js";
import { shouldSuperviseStdio, runStdioSupervisor, openRpcOutputStream } from "./stdio-supervisor.js";
import { z } from "zod";
import {
  getAllSongs,
  getSong,
  getSongsByGenre,
  getSongsByDifficulty,
  searchSongs,
  getStats,
  registerSong,
  validateSong,
  saveSong,
  initializeFromLibrary,
  getLibraryProgress,
  scanLibrary,
  ingestSong,
  midiToSongEntry,
  generateJamBrief,
  formatJamBrief,
  transposeSong,
  GENRES,
  DIFFICULTIES,
} from "./songs/index.js";
import type { SongEntry, Difficulty, Genre } from "./songs/types.js";
import { safeParseMeasure, measureToSingableText, type SingAlongMode } from "./note-parser.js";
import { renderPianoRoll, renderScoredPianoRoll } from "./piano-roll.js";
import { renderGuitarTab } from "./guitar-tab-roll.js";
import {
  ENGINE_IDS, ENGINE_LABELS,
  type EngineId, type ParseWarning, type PlaybackMode, type SyncMode, type VmpkConnector, type Recording,
} from "./types.js";
import { createAudioEngine } from "./audio-engine.js";
import { createVocalEngine } from "./vocal-engine.js";
import { createTractEngine, TRACT_VOICE_IDS, type TractVoiceId } from "./vocal-tract-engine.js";
import { createGuitarEngine } from "./guitar-engine.js";
import {
  GUITAR_VOICE_IDS, GUITAR_TUNING_PARAMS, GUITAR_TUNINGS, GUITAR_TUNING_IDS,
  listGuitarVoices, getGuitarVoice, getMergedGuitarVoice,
  loadGuitarUserTuning, saveGuitarUserTuning, resetGuitarUserTuning,
  type GuitarVoiceId, type GuitarUserTuning,
} from "./guitar-voices.js";
import { createVmpkConnector } from "./vmpk.js";
import {
  listVoices, suggestVoice, getVoice, getMergedVoice,
  VOICE_IDS, TUNING_PARAMS,
  loadUserTuning, saveUserTuning, resetUserTuning,
  type PianoVoiceId, type UserTuning,
} from "./piano-voices.js";
import { detectChord, midiNotesToNames } from "./chord-detect.js";
import type { PianoRollColorMode } from "./piano-roll.js";
import { createSession, SessionController } from "./session.js";
import { createStderrTeachingHook, composeTeachingHooks } from "./teaching.js";
import { parseMidiFile, parseMidiBuffer } from "./midi/parser.js";
import { MidiPlaybackEngine } from "./playback/midi-engine.js";
import { PlaybackController } from "./playback/controls.js";
import { createSingOnMidiHook } from "./teaching/sing-on-midi.js";
import { createMidiFeedbackHook } from "./teaching/midi-feedback.js";
import { createLiveMidiFeedbackHook } from "./teaching/live-midi-feedback.js";
import { scorePerformance, type PerformanceResult } from "./score-performance.js";
import { scoreAnnotation, formatAnnotationScore } from "./annotation-scorer.js";
import { compareSongs, formatComparison } from "./song-compare.js";
import type { VoiceDirective, AsideDirective } from "./types.js";
import {
  PracticeLoop,
  resolvePracticeLoopConfig,
  windowSong,
  measureDiagnostics,
  formatMeasureDiagnosticLines,
  formatPassSummary,
  rankWorstMeasures,
} from "./practice-loop.js";
import { JamError } from "./errors.js";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync, realpathSync, mkdirSync } from "node:fs";
import {
  join as pathJoin,
  resolve as pathResolve,
  basename as pathBasename,
  relative as pathRelative,
  isAbsolute as pathIsAbsolute,
} from "node:path";
import {
  type SessionSnapshot,
  buildJournalEntry,
  appendJournalEntry,
  readJournal,
  journalStats,
} from "./journal.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Suggest practice speed based on song difficulty. */
function suggestSpeed(difficulty: Difficulty): { speed: number; label: string } {
  switch (difficulty) {
    case "beginner":       return { speed: 0.5, label: "0.5× (half speed)" };
    case "intermediate":   return { speed: 0.75, label: "0.75× (three-quarter speed)" };
    case "advanced":       return { speed: 0.7, label: "0.7× (recommended for first pass)" };
    default:               return { speed: 1.0, label: "1.0× (full speed)" };
  }
}

/** Suggest playback mode based on difficulty. */
function suggestMode(difficulty: Difficulty): { mode: string; reason: string } {
  switch (difficulty) {
    case "beginner":
      return { mode: "measure", reason: "Step through one measure at a time for careful learning" };
    case "intermediate":
      return { mode: "hands", reason: "Practice hands separately before combining" };
    case "advanced":
      return { mode: "hands", reason: "Master each hand individually for complex passages" };
    default:
      return { mode: "full", reason: "Play straight through at tempo" };
  }
}


/** Resolve the user's home directory to a canonical path, if available. */
function getCanonicalHomeDir(): string | null {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "";
  if (!home) return null;

  try {
    return realpathSync(home);
  } catch {
    const resolved = pathResolve(home);
    return existsSync(resolved) ? resolved : null;
  }
}

const SAFE_SONG_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function isSafeSongId(id: string): boolean {
  return SAFE_SONG_ID_PATTERN.test(id) && !id.includes("..") && !id.includes("/") && !id.includes("\\");
}

/**
 * Resolve an existing path and ensure it stays within the allowed root after
 * following symlinks. Returns the canonical path on success, or null on failure.
 */
function resolveContainedExistingPath(inputPath: string, allowedRoot: string): string | null {
  const resolvedInput = pathResolve(inputPath);
  if (!existsSync(resolvedInput)) {
    return null;
  }

  let canonicalRoot: string;
  let canonicalInput: string;

  try {
    canonicalRoot = realpathSync(allowedRoot);
    canonicalInput = realpathSync(resolvedInput);
  } catch {
    return null;
  }

  const relative = pathRelative(canonicalRoot, canonicalInput);
  if (relative === "" || (!relative.startsWith("..") && !pathIsAbsolute(relative))) {
    return canonicalInput;
  }

  return null;
}

/**
 * Turn a caught filesystem error into a structured, actionable tool result
 * instead of leaking a raw OS error string (e.g. "EACCES: permission
 * denied") straight to the caller (B-B1-003). Reused by the fs-touching
 * tuning tools (tune_keyboard, reset_keyboard, tune_guitar, reset_guitar).
 */
function fsErrorResult(err: unknown, action: string): { content: [{ type: "text"; text: string }]; isError: true } {
  const jamErr = err instanceof JamError
    ? err
    : new JamError({
        code: "IO_FILE_WRITE",
        message: `Failed to ${action}: ${err instanceof Error ? err.message : String(err)}`,
        hint: "Check that ~/.ai-jam-sessions is writable and there's free disk space.",
        cause: err instanceof Error ? err : undefined,
      });
  return {
    content: [{ type: "text", text: jamErr.toUserString() }],
    isError: true,
  };
}

// ─── Server ─────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "ai-jam-sessions",
  version: VERSION,
});

// Thin wrapper around server.tool() that keeps an authoritative count of
// registered tools, so server_info's reported count (and the header comment
// above) can never silently drift from reality the way the old hardcoded
// "36"/"Tools (34)" literals did (B-A1-005/006).
let registeredToolCount = 0;
const registerTool: typeof server.tool = (...args: any[]) => {
  registeredToolCount++;
  return (server.tool as any)(...args);
};

// ─── Prompts ────────────────────────────────────────────────────────────────

server.prompt(
  "annotate_song",
  "Walk through annotating a raw song with musical language — description, structure, key moments, teaching goals, and style tips. Use this prompt to guide the annotation process for unannotated songs.",
  { song_id: z.string().describe("Song ID to annotate") },
  ({ song_id }) => {
    const song = getSong(song_id);
    const songInfo = song
      ? `Song: "${song.title}" by ${song.composer ?? "Unknown"}\nGenre: ${song.genre} | Key: ${song.key} | Tempo: ${song.tempo} BPM | Time: ${song.timeSignature}\nDifficulty: ${song.difficulty} | Measures: ${song.measures.length}`
      : `Song "${song_id}" not found — check the ID with list_songs first.`;

    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: [
            `I want to annotate a song in ai-jam-sessions with rich musical language so it can be taught effectively.`,
            ``,
            songInfo,
            ``,
            `Please help me write the musical language annotation with these fields:`,
            `1. **description** — 1-3 sentences: mood, era, why this piece matters`,
            `2. **structure** — Musical form: "ABA", "Verse-Chorus-Verse", "Sonata-Allegro", etc.`,
            `3. **key_moments** — 3-5 notable moments worth highlighting to a student`,
            `4. **teaching_goals** — 2-4 skills the student will practice`,
            `5. **style_tips** — 2-4 performance tips: "legato", "swing eighths", "rubato in the coda"`,
            ``,
            `After we agree on the annotation, use the \`annotate_song\` tool to save it.`,
          ].join("\n"),
        },
      }],
    };
  }
);

server.prompt(
  "practice_plan",
  "Create a practice plan for a song — warm-up, section-by-section work, speed progression, and goals. Great for structuring a focused practice session.",
  { song_id: z.string().describe("Song ID to plan practice for") },
  ({ song_id }) => {
    const song = getSong(song_id);
    const songInfo = song
      ? [
          `Song: "${song.title}" by ${song.composer ?? "Unknown"}`,
          `Genre: ${song.genre} | Key: ${song.key} | Tempo: ${song.tempo} BPM`,
          `Difficulty: ${song.difficulty} | Measures: ${song.measures.length}`,
          song.sections?.length
            ? `Sections: ${song.sections.map(s => `${s.name} (m${s.startMeasure}–${s.endMeasure})`).join(", ")}`
            : `No section markers yet — consider adding them with add_section.`,
          song.musicalLanguage?.teachingGoals?.length
            ? `Teaching goals: ${song.musicalLanguage.teachingGoals.join("; ")}`
            : "",
        ].filter(Boolean).join("\n")
      : `Song "${song_id}" not found — check the ID with list_songs first.`;

    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: [
            `I want to create a structured practice plan for a piano piece.`,
            ``,
            songInfo,
            ``,
            `Please create a practice plan covering:`,
            `1. **Warm-up** — 5 min: scales/arpeggios in the song's key`,
            `2. **Hands separate** — which sections to practice each hand alone`,
            `3. **Trouble spots** — measures that need extra attention (use teaching_note to check)`,
            `4. **Speed ladder** — suggested tempo progression (start at 50%, build to full)`,
            `5. **Run-through** — when to try the whole piece, how to handle mistakes`,
            `6. **Cool-down** — review goals, note what improved`,
            ``,
            `Use play_song with different speeds and measure ranges to practice each section.`,
          ].join("\n"),
        },
      }],
    };
  }
);

server.prompt(
  "performance_review",
  "Reflect on a practice session — what went well, what needs work, and what to focus on next time. Use after playing through a song.",
  {},
  () => {
    return {
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: [
            `I just finished a practice session and want to reflect on it.`,
            ``,
            `Please help me with a performance review:`,
            `1. Check \`playback_status\` for what was just played`,
            `2. Ask me: What went well? What felt difficult?`,
            `3. Help me identify specific measures or passages to revisit`,
            `4. Suggest what to focus on in the next practice session`,
            `5. Use \`save_practice_note\` to record my reflections`,
            ``,
            `Keep the review encouraging but honest — I want to improve!`,
          ].join("\n"),
        },
      }],
    };
  }
);

// ─── Practice Journal State ─────────────────────────────────────────────────

let lastCompletedSession: SessionSnapshot | null = null;
let lastPlaybackError: {
  message: string;
  songOrFile: string;
  timestamp: string;
  /** 1-based measure in flight when a library-song session failed (B-B1-006). */
  measure?: number;
  /** Playback position in flight when a MIDI file session failed (B-B1-006). */
  positionSeconds?: number;
} | null = null;

// ─── Tool: list_songs ───────────────────────────────────────────────────────

registerTool(
  "list_songs",
  "Browse and search the piano song library. Filter by genre, difficulty, composer, or search query.",
  {
    genre: z.enum(GENRES as unknown as [string, ...string[]]).optional().describe("Filter by genre"),
    difficulty: z.enum(DIFFICULTIES as unknown as [string, ...string[]]).optional().describe("Filter by difficulty"),
    query: z.string().optional().describe("Search query (matches title, composer, tags, description)"),
    composer: z.string().optional().describe("Filter by composer (case-insensitive substring match)"),
  },
  async (params) => {
    const results = searchSongs({
      genre: params.genre as Genre | undefined,
      difficulty: params.difficulty as Difficulty | undefined,
      query: params.query,
      composer: params.composer,
    });

    const text = results.length === 0
      ? "No songs found matching your criteria."
      : results
          .map((s) => `${s.id} — ${s.title} (${s.genre}, ${s.difficulty}, ${s.measures.length} measures)`)
          .join("\n");

    return {
      content: [{ type: "text", text: `Found ${results.length} song(s):\n\n${text}` }],
    };
  }
);

// ─── Tool: song_info ────────────────────────────────────────────────────────

registerTool(
  "song_info",
  "Get detailed information about a specific song — musical language, teaching goals, key moments, structure.",
  {
    id: z.string().describe("Song ID (kebab-case, e.g. 'moonlight-sonata-mvt1')"),
  },
  async ({ id }) => {
    const song = getSong(id);
    if (!song) {
      return {
        content: [{ type: "text", text: `No song called "${id}" in the library. Try list_songs to see what's available.` }],
        isError: true,
      };
    }

    const ml = song.musicalLanguage;
    const { speed, label: speedLabel } = suggestSpeed(song.difficulty as Difficulty);
    const { mode, reason: modeReason } = suggestMode(song.difficulty as Difficulty);

    const text = [
      `# ${song.title}`,
      `**Composer:** ${song.composer ?? "Traditional"}`,
      `**Genre:** ${song.genre} | **Difficulty:** ${song.difficulty}`,
      `**Key:** ${song.key} | **Tempo:** ${song.tempo} BPM | **Time:** ${song.timeSignature}`,
      `**Duration:** ~${song.durationSeconds}s | **Measures:** ${song.measures.length}`,
      ``,
      `## Description`,
      ml.description,
      ``,
      `## Structure`,
      ml.structure,
      ``,
      `## Key Moments`,
      ...ml.keyMoments.map((km) => `- ${km}`),
      ``,
      `## Teaching Goals`,
      ...ml.teachingGoals.map((tg) => `- ${tg}`),
      ``,
      `## Style Tips`,
      ...ml.styleTips.map((st) => `- ${st}`),
      ``,
      `## Practice Suggestions`,
      `- **Suggested speed:** ${speedLabel} → effective tempo: ${Math.round(song.tempo * speed)} BPM`,
      `- **Suggested mode:** ${mode} — ${modeReason}`,
      `- **Voice coaching:** Enable voice feedback for teaching notes at measure boundaries`,
      `- Use \`practice_setup "${song.id}"\` for a full practice configuration`,
      ``,
      `**Tags:** ${song.tags.join(", ")}`,
    ].join("\n");

    return { content: [{ type: "text", text }] };
  }
);

// ─── Tool: registry_stats ───────────────────────────────────────────────────

registerTool(
  "registry_stats",
  "Get statistics about the song registry: total songs, genres, difficulties, measures.",
  {},
  async () => {
    const stats = getStats();
    const genreLines = Object.entries(stats.byGenre)
      .filter(([, count]) => count > 0)
      .map(([genre, count]) => `  ${genre}: ${count}`)
      .join("\n");
    const diffLines = Object.entries(stats.byDifficulty)
      .filter(([, count]) => count > 0)
      .map(([diff, count]) => `  ${diff}: ${count}`)
      .join("\n");

    const text = [
      `# Registry Stats`,
      `Total songs: ${stats.totalSongs}`,
      `Total measures: ${stats.totalMeasures}`,
      ``,
      `## By Genre`,
      genreLines,
      ``,
      `## By Difficulty`,
      diffLines,
    ].join("\n");

    return { content: [{ type: "text", text }] };
  }
);

// ─── Tool: teaching_note ────────────────────────────────────────────────────

registerTool(
  "teaching_note",
  "Get the teaching note, fingering, and dynamics for a specific measure in a song.",
  {
    id: z.string().describe("Song ID"),
    measure: z.number().int().min(1).describe("Measure number (1-based)"),
  },
  async ({ id, measure }) => {
    const song = getSong(id);
    if (!song) {
      return {
        content: [{ type: "text", text: `No song called "${id}" in the library.` }],
        isError: true,
      };
    }

    const m = song.measures[measure - 1];
    if (!m) {
      return {
        content: [{ type: "text", text: `Measure ${measure} doesn't exist — this song only has ${song.measures.length} measures.` }],
        isError: true,
      };
    }

    const lines = [
      `# ${song.title} — Measure ${measure}`,
      ``,
      `**Right Hand:** ${m.rightHand}`,
      `**Left Hand:** ${m.leftHand}`,
    ];
    if (m.fingering) lines.push(`**Fingering:** ${m.fingering}`);
    if (m.dynamics) lines.push(`**Dynamics:** ${m.dynamics}`);
    if (m.teachingNote) {
      lines.push(``, `## Teaching Note`, m.teachingNote);
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: suggest_song ─────────────────────────────────────────────────────

registerTool(
  "suggest_song",
  "Get a song recommendation based on genre preference and/or difficulty level.",
  {
    genre: z.enum(GENRES as unknown as [string, ...string[]]).optional().describe("Preferred genre"),
    difficulty: z.enum(DIFFICULTIES as unknown as [string, ...string[]]).optional().describe("Desired difficulty"),
    maxDuration: z.number().optional().describe("Maximum duration in seconds"),
  },
  async (params) => {
    const results = searchSongs({
      genre: params.genre as Genre | undefined,
      difficulty: params.difficulty as Difficulty | undefined,
      maxDuration: params.maxDuration,
    });

    if (results.length === 0) {
      return {
        content: [{ type: "text", text: "No songs match your criteria. Try broadening your search." }],
      };
    }

    // Pick a random suggestion from matches
    const song = results[Math.floor(Math.random() * results.length)];
    const ml = song.musicalLanguage;

    const text = [
      `I'd suggest: **${song.title}** by ${song.composer ?? "Traditional"}`,
      ``,
      `${ml.description}`,
      ``,
      `**Why this song?**`,
      ...ml.teachingGoals.map((tg) => `- ${tg}`),
      ``,
      `Use \`song_info\` with id "${song.id}" for full details.`,
    ].join("\n");

    return { content: [{ type: "text", text }] };
  }
);

// ─── Tool: list_measures ────────────────────────────────────────────────────

registerTool(
  "list_measures",
  "Get an overview of all measures in a song, showing right hand, left hand, and any teaching notes.",
  {
    id: z.string().describe("Song ID"),
    startMeasure: z.number().int().min(1).optional().describe("Start measure (1-based, default: 1)"),
    endMeasure: z.number().int().min(1).optional().describe("End measure (1-based, default: last)"),
  },
  async ({ id, startMeasure, endMeasure }) => {
    const song = getSong(id);
    if (!song) {
      return {
        content: [{ type: "text", text: `No song called "${id}" in the library.` }],
        isError: true,
      };
    }

    const start = Math.max(0, (startMeasure ?? 1) - 1);
    const end = Math.min((endMeasure ?? song.measures.length) - 1, song.measures.length - 1);
    if (start > end) {
      return {
        content: [{ type: "text", text: `That measure range doesn't fit — this song has ${song.measures.length} measures (1–${song.measures.length}).` }],
        isError: true,
      };
    }
    const measures = song.measures.slice(start, end + 1);

    // Check for parse warnings
    const warnings: ParseWarning[] = [];
    for (const m of measures) {
      safeParseMeasure(m, song.tempo, warnings);
    }

    const lines = [`# ${song.title} — Measures ${start + 1} to ${end + 1}`, ``];
    for (const m of measures) {
      lines.push(`## Measure ${m.number}`);
      lines.push(`RH: ${m.rightHand}`);
      lines.push(`LH: ${m.leftHand}`);
      if (m.fingering) lines.push(`Fingering: ${m.fingering}`);
      if (m.dynamics) lines.push(`Dynamics: ${m.dynamics}`);
      if (m.teachingNote) lines.push(`Note: ${m.teachingNote}`);
      lines.push(``);
    }

    if (warnings.length > 0) {
      lines.push(`## ⚠ Parse Warnings`);
      lines.push(`${warnings.length} note(s) could not be parsed and will be skipped during playback:`);
      for (const w of warnings.slice(0, 10)) {
        lines.push(`- ${w.location}: "${w.token}" — ${w.message}`);
      }
      if (warnings.length > 10) {
        lines.push(`- … and ${warnings.length - 10} more`);
      }
      lines.push(``);
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: preview_teaching_cues ─────────────────────────────────────────

registerTool(
  "preview_teaching_cues",
  "Preview all teaching cues for a song — teaching notes, dynamics markings, and fingering suggestions per measure. Use this to see what guidance is available before playing.",
  {
    id: z.string().describe("Song ID"),
    types: z.array(z.enum(["teaching", "dynamics", "fingering"])).optional()
      .describe("Filter by cue type (default: all). Options: teaching, dynamics, fingering"),
  },
  async ({ id, types }) => {
    const song = getSong(id);
    if (!song) {
      return {
        content: [{ type: "text", text: `No song called "${id}" in the library. Try list_songs to browse.` }],
        isError: true,
      };
    }

    const showAll = !types || types.length === 0;
    const showTeaching = showAll || types!.includes("teaching");
    const showDynamics = showAll || types!.includes("dynamics");
    const showFingering = showAll || types!.includes("fingering");

    interface Cue { measure: number; type: string; text: string }
    const cues: Cue[] = [];

    for (const m of song.measures) {
      if (showTeaching && m.teachingNote) {
        cues.push({ measure: m.number, type: "teaching", text: m.teachingNote });
      }
      if (showDynamics && m.dynamics) {
        cues.push({ measure: m.number, type: "dynamics", text: m.dynamics });
      }
      if (showFingering && m.fingering) {
        cues.push({ measure: m.number, type: "fingering", text: m.fingering });
      }
    }

    if (cues.length === 0) {
      return {
        content: [{
          type: "text",
          text: `**${song.title}** has no teaching cues yet. Use \`annotate_song\` to add musical language, or \`teaching_note\` to check individual measures.`,
        }],
      };
    }

    const lines = [
      `# ${song.title} — Teaching Cues`,
      ``,
      `| Measure | Type | Cue |`,
      `|---------|------|-----|`,
    ];

    for (const c of cues) {
      lines.push(`| ${c.measure} | ${c.type} | ${c.text} |`);
    }

    const typeCount = {
      teaching: cues.filter(c => c.type === "teaching").length,
      dynamics: cues.filter(c => c.type === "dynamics").length,
      fingering: cues.filter(c => c.type === "fingering").length,
    };
    const summary = Object.entries(typeCount)
      .filter(([, n]) => n > 0)
      .map(([t, n]) => `${n} ${t}`)
      .join(", ");

    lines.push(``, `**${cues.length} cues** across ${song.measures.length} measures (${summary}).`);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: practice_setup ──────────────────────────────────────────────────

registerTool(
  "practice_setup",
  "Get a recommended practice configuration for a song — speed, mode, voice settings, and CLI command. Tailored to the song's difficulty and teaching goals.",
  {
    id: z.string().describe("Song ID"),
    playerLevel: z.enum(["beginner", "intermediate", "advanced"]).optional()
      .describe("Player's skill level (overrides song-based suggestion)"),
  },
  async ({ id, playerLevel }) => {
    const song = getSong(id);
    if (!song) {
      return {
        content: [{ type: "text", text: `No song called "${id}" in the library. Try list_songs to browse.` }],
        isError: true,
      };
    }

    // Determine practice parameters
    const effectiveDifficulty = (playerLevel ?? song.difficulty) as Difficulty;
    const { speed, label: speedLabel } = suggestSpeed(effectiveDifficulty);
    const { mode, reason: modeReason } = suggestMode(effectiveDifficulty);
    const effectiveTempo = Math.round(song.tempo * speed);

    // Check for parse warnings
    const warnings: ParseWarning[] = [];
    for (const m of song.measures) {
      safeParseMeasure(m, effectiveTempo, warnings);
    }

    const ml = song.musicalLanguage;
    const lines = [
      `# Practice Setup: ${song.title}`,
      ``,
      `## Song Profile`,
      `- **Difficulty:** ${song.difficulty}`,
      `- **Base tempo:** ${song.tempo} BPM`,
      `- **Measures:** ${song.measures.length}`,
      `- **Key:** ${song.key} | **Time:** ${song.timeSignature}`,
      ``,
      `## Recommended Settings`,
      `- **Speed:** ${speedLabel}`,
      `- **Effective tempo:** ${effectiveTempo} BPM`,
      `- **Mode:** ${mode} — ${modeReason}`,
      `- **Voice coaching:** Enabled — speak teaching notes + key moments`,
      ``,
      `## CLI Command`,
      `\`\`\``,
      `ai-jam-sessions play ${song.id} --speed ${speed} --mode ${mode}`,
      `\`\`\``,
      ``,
      `## Practice Progression`,
      `1. Start at ${speedLabel} in **${mode}** mode`,
      `2. Focus on key moments:`,
      ...ml.keyMoments.slice(0, 3).map((km) => `   - ${km}`),
      `3. Gradually increase speed: ${speed} → ${Math.min(speed + 0.25, 1.0)} → 1.0`,
      `4. Switch to **full** mode once comfortable at speed`,
    ];

    if (song.difficulty === "advanced") {
      lines.push(
        `5. Try **loop** mode on difficult passages`,
        `   Example: \`ai-jam-sessions play ${song.id} --mode loop\``
      );
    }

    if (warnings.length > 0) {
      lines.push(
        ``,
        `## ⚠ Note`,
        `${warnings.length} note(s) have parse warnings and will be skipped during playback.`,
        `Use \`list_measures "${song.id}"\` to see details.`
      );
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: sing_along ─────────────────────────────────────────────────────

registerTool(
  "sing_along",
  "Get singable text (note names, solfege, contour, or syllables) for a range of measures. Optionally enable piano accompaniment for synchronized singing + playback.",
  {
    id: z.string().describe("Song ID"),
    startMeasure: z.number().int().min(1).optional().describe("Start measure (1-based, default: 1)"),
    endMeasure: z.number().int().min(1).optional().describe("End measure (1-based, default: last)"),
    mode: z.enum(["note-names", "solfege", "contour", "syllables"]).optional()
      .describe("Sing-along mode (default: 'note-names')"),
    hand: z.enum(["right", "left", "both"]).optional()
      .describe("Which hand to narrate (default: 'right')"),
    withPiano: z.boolean().optional()
      .describe("Include piano accompaniment info and CLI command for live playback (default: false)"),
    syncMode: z.enum(["concurrent", "before"]).optional()
      .describe("Voice+piano sync mode: 'concurrent' = duet feel, 'before' = voice first (default: 'concurrent')"),
  },
  async ({ id, startMeasure, endMeasure, mode, hand, withPiano, syncMode }) => {
    const song = getSong(id);
    if (!song) {
      return {
        content: [{ type: "text", text: `No song called "${id}" in the library. Try list_songs to browse.` }],
        isError: true,
      };
    }

    const effectiveMode: SingAlongMode = (mode as SingAlongMode) ?? "note-names";
    const effectiveHand = hand ?? "right";
    const effectiveSyncMode = syncMode ?? "concurrent";
    const start = Math.max(0, (startMeasure ?? 1) - 1);
    const end = Math.min((endMeasure ?? song.measures.length) - 1, song.measures.length - 1);
    if (start > end) {
      return {
        content: [{ type: "text", text: `That measure range doesn't fit — this song has ${song.measures.length} measures (1–${song.measures.length}).` }],
        isError: true,
      };
    }
    const measures = song.measures.slice(start, end + 1);

    const lines = [
      `# Sing Along: ${song.title}`,
      `**Mode:** ${effectiveMode} | **Hand:** ${effectiveHand}`,
      `**Measures:** ${start + 1} to ${end + 1}`,
    ];

    if (withPiano) {
      lines.push(`**Piano accompaniment:** enabled (${effectiveSyncMode} sync)`);
    }
    lines.push(``);

    for (const m of measures) {
      const singable = measureToSingableText(
        { rightHand: m.rightHand, leftHand: m.leftHand },
        { mode: effectiveMode, hand: effectiveHand }
      );
      lines.push(`**Measure ${m.number}:** ${singable}`);
    }

    if (withPiano) {
      const { speed, label: speedLabel } = suggestSpeed(song.difficulty as Difficulty);
      const effectiveTempo = Math.round(song.tempo * speed);

      lines.push(
        ``,
        `---`,
        `## Piano Accompaniment`,
        `Voice and piano play **${effectiveSyncMode === "concurrent" ? "simultaneously (duet feel)" : "sequentially (voice first, then piano)"}**.`,
        ``,
        `**Suggested speed:** ${speedLabel} → ${effectiveTempo} BPM`,
        `**Live feedback:** encouragement every 4 measures + dynamics tips`,
        ``,
        `### CLI Command`,
        `\`\`\``,
        `ai-jam-sessions sing ${song.id} --with-piano --mode ${effectiveMode} --hand ${effectiveHand} --sync ${effectiveSyncMode}`,
        `\`\`\``,
      );
    } else {
      lines.push(
        ``,
        `---`,
        `*Tip: Add \`withPiano: true\` for synchronized singing + piano playback, or run:*`,
        `*\`ai-jam-sessions sing ${song.id} --with-piano\`*`,
      );
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Active Playback State ────────────────────────────────────────────────

let activeSession: SessionController | null = null;
let activeMidiEngine: MidiPlaybackEngine | null = null;
let activeController: PlaybackController | null = null;
let activeConnector: VmpkConnector | null = null;
let activeVoiceId: string = "grand";
let activeNotes: Set<number> = new Set();
let activePracticeLoop: PracticeLoop | null = null;

/**
 * Most recently recorded take (session-source only — see
 * `SessionOptions.record` and the `Recording` type's session-source
 * contract, types.ts). Captured whenever a recorded play_song session
 * (library-song path) is superseded/stopped, or whenever a practice_loop
 * pass finishes (via its onPassComplete hook — see the practice_loop tool
 * below).
 *
 * `mode` is the PlaybackMode the take was recorded under — score_last_take
 * refuses to score a "loop"-mode take outright (loop mode repeats its range
 * indefinitely, concatenating every iteration onto ONE continuous
 * timeline — there's no single-pass span to score it against).
 *
 * `range` windows the song to just that measure range before scoring
 * (practice-loop.ts's windowSong), matching how a practice pass itself was
 * scored — scoring a range-relative recording against the WHOLE song would
 * misalign it. Set for a practice-loop pass, and (via captureLastRecording)
 * for any play_song take whose session carried a loopRange.
 */
let lastRecording: { recording: Recording; songId: string; mode?: PlaybackMode; range?: [number, number] } | null = null;

/**
 * Most recently SCORED take — the song actually scored against (which may
 * be a windowed sub-song for a practice-loop pass, see windowSong) plus its
 * PerformanceResult. Populated by score_last_take and by every completed
 * practice_loop pass. Feeds view_scored_piano_roll.
 */
let lastScoredTake: { song: SongEntry; result: PerformanceResult } | null = null;

/**
 * Capture `session`'s recording (if `record` was enabled for it) into
 * `lastRecording`. Called wherever a recorded library-song session might
 * become "the most recent take": play_song (before superseding it),
 * stop_playback, and pause_playback's pause branch. A no-op when recording
 * wasn't enabled — `getRecording()` is cheap and always safe to call
 * either way, so this doesn't need its own extra state-tracking.
 *
 * `mode`/`range` default to the session's OWN `mode`/`loopRange` (both
 * already on `session.session` — see types.ts's `Session`), which is
 * correct for every play_song-originated session. `override` exists only
 * for a caller whose range isn't visible on the session itself — e.g.
 * pause_playback pausing a running practice_loop's current pass, where the
 * drilled range lives on the PracticeLoop's own config, not on the
 * per-pass SessionController (which is created without a loopRange —
 * practice-loop.ts drives it measure-by-measure via goTo() instead).
 */
function captureLastRecording(
  session: SessionController,
  override?: { mode?: PlaybackMode; range?: [number, number] }
): void {
  if (!session.session.recordingEnabled) return;
  lastRecording = {
    recording: session.getRecording(),
    songId: session.session.song.id,
    mode: override?.mode ?? session.session.mode,
    range: override?.range ?? (session.session.loopRange ?? undefined),
  };
}

/**
 * Serializes any operation that replaces or clears the shared "active
 * playback" pointers above (play_song, stop_playback). Without this, two
 * concurrent play_song calls — or a play_song racing a stop_playback — can
 * interleave their stopActive() + assignment steps: call B's stopActive()
 * can run in between call A's stopActive() and A's later assignment of
 * activeConnector/activeMidiEngine/etc, leaving one engine connected and
 * playing with no reachable pointer any tool can use to stop it
 * (F-0f05e39d). Each queued operation runs only after the previous one has
 * fully settled, so the stop+connect+assign sequence is atomic with respect
 * to other state-touching tool calls.
 */
let stateLock: Promise<unknown> = Promise.resolve();
function withStateLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = stateLock.then(fn, fn);
  stateLock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Stop whatever is currently playing or paused. */
async function stopActive(): Promise<void> {
  if (activeSession) {
    captureLastRecording(activeSession);
    if (activeSession.state === "playing" || activeSession.state === "paused") {
      activeSession.stop();
    }
  }
  activeSession = null;

  if (activePracticeLoop) {
    // The loop's own onPassComplete hook (see the practice_loop tool) keeps
    // lastRecording/lastScoredTake current after every COMPLETED pass — an
    // interrupted in-flight pass is never scored/pushed (see
    // practice-loop.ts's PracticeLoop.runLoop), so there's nothing extra to
    // capture here beyond stopping it.
    const loop = activePracticeLoop;
    loop.stop();
    // stop() only SIGNALS the loop to stop — it doesn't wait for runLoop()'s
    // promise to actually settle (the in-flight pass's session.play() abort
    // still has to unwind). Without waiting here, activeConnector.disconnect()
    // below could run WHILE the loop is still mid-teardown on that SAME
    // connector (practice_loop's own tool handler assigns its connector to
    // activeConnector) — a real race, not just a cleanup nicety. Bounded
    // (not an unconditional await) so a loop that somehow never settles
    // can't hang stop_playback/a superseding play_song/practice_loop call
    // forever; PracticeLoop.stop() (practice-loop.ts) already flushes any
    // pending pause() wait for exactly this reason, so the race is normally
    // won well under this bound.
    await Promise.race([
      loop.done(),
      new Promise<void>((resolve) => setTimeout(resolve, 2000)),
    ]);
  }
  activePracticeLoop = null;

  if (activeMidiEngine && (activeMidiEngine.state === "playing" || activeMidiEngine.state === "paused")) {
    activeMidiEngine.stop();
  }
  activeMidiEngine = null;

  if (activeController && (activeController.state === "playing" || activeController.state === "paused")) {
    activeController.stop();
  }
  activeController = null;

  if (activeConnector) {
    try {
      await activeConnector.disconnect();
    } catch (err) {
      console.error(`Disconnect error: ${err instanceof Error ? err.message : String(err)}`);
    }
    activeConnector = null;
  }
  activeNotes.clear();
}

// ─── Tool: play_song ──────────────────────────────────────────────────────

registerTool(
  "play_song",
  "Play a song through the built-in audio engine. Supports piano (default) and vocal engines. Accepts a library song ID or a path to a .mid file. Returns immediately with session info while playback runs in the background.",
  {
    id: z.string().describe("Song ID (e.g. 'autumn-leaves', 'let-it-be') OR path to a .mid file"),
    speed: z.number().min(0.1).max(4).optional().describe("Speed multiplier (0.5 = half speed, 1.0 = normal, 2.0 = double)"),
    tempo: z.number().int().min(10).max(400).optional().describe("Override tempo in BPM (10-400). Omit to use the song's original tempo"),
    mode: z.enum(["full", "measure", "hands", "loop"]).optional().describe("Playback mode: 'full' (default), 'measure' (one at a time), 'hands' (separate then together), 'loop'"),
    startMeasure: z.number().int().min(1).optional().describe("Start measure for loop mode (1-based)"),
    endMeasure: z.number().int().min(1).optional().describe("End measure for loop mode (1-based)"),
    withSinging: z.boolean().optional().describe("Enable sing-along narration during playback (note-names by default). Default: false"),
    withTeaching: z.boolean().optional().describe("Enable live teaching feedback (encouragement, dynamics tips, difficulty warnings). Default: false"),
    singMode: z.enum(["note-names", "solfege", "contour", "syllables"]).optional().describe("Sing-along mode when withSinging is true. Default: note-names"),
    keyboard: z.enum(VOICE_IDS as unknown as [string, ...string[]]).optional().describe("Piano voice/keyboard: grand (default), upright, electric, honkytonk, musicbox, bright. Each has a different character suited to different genres."),
    engine: z.enum(ENGINE_IDS as unknown as [string, ...string[]]).optional().describe("Sound engine: 'piano' (default) plays piano, 'vocal' plays sustained vowel tones, 'tract' uses Pink Trombone vocal tract synthesis, 'guitar' plays physically-modeled guitar."),
    tractVoice: z.enum(TRACT_VOICE_IDS as unknown as [string, ...string[]]).optional().describe("Voice preset for tract engine: soprano (default), alto, tenor, bass. Only used when engine='tract'."),
    guitarVoice: z.enum(GUITAR_VOICE_IDS as unknown as [string, ...string[]]).optional().describe("Guitar voice preset: classical-nylon, steel-dreadnought (default), electric-clean, electric-jazz. Only used when engine='guitar'."),
    syncMode: z.enum(["before", "concurrent"]).optional().describe("Voice sync timing when singing: 'before' (hear voice first, then play together) or 'concurrent' (simultaneous). Default: 'before' when singing only, 'concurrent' with teaching."),
    metronome: z.boolean().optional().describe("Enable the metronome click track (library songs only). Default: false."),
    countIn: z.number().int().min(0).max(8).optional().describe("Count-in length in bars before playback starts (library songs only). Only takes effect when metronome is true. Default: 1 bar when metronome is true and this is omitted, 0 otherwise."),
    record: z.boolean().optional().describe("Record played notes for later scoring (library songs only) — retrieve with score_last_take. Default: false."),
  },
  async ({ id, speed, tempo, mode, startMeasure, endMeasure, withSinging, withTeaching, singMode, keyboard, engine, tractVoice, guitarVoice, syncMode: syncModeParam, metronome, countIn, record }) => withStateLock(async () => {
    // Stop whatever is currently playing
    await stopActive();

    // Determine if this is a .mid file path or a library song ID — require explicit extension
    const isMidiFile = id.endsWith(".mid") || id.endsWith(".midi");
    const homeDir = getCanonicalHomeDir();
    const safeMidiPath = isMidiFile && homeDir
      ? resolveContainedExistingPath(id, homeDir)
      : null;

    // Path containment check for file paths
    if (isMidiFile && !safeMidiPath) {
      return {
        content: [{ type: "text", text: `Can't access "${id}" — for safety, MIDI files must be inside your home directory.` }],
        isError: true,
      };
    }

    const librarySong = isMidiFile ? null : getSong(id);

    if (!isMidiFile && !librarySong) {
      return {
        content: [{ type: "text", text: `No song called "${id}" in the library. Try list_songs to browse, or provide a path to a .mid file.` }],
        isError: true,
      };
    }

    // Validate any requested measure range against the library song BEFORE
    // starting the audio hardware. This fails fast on bad input, and — because
    // it no longer sits behind the audio engine's connect() — the range check
    // stays reachable even where no audio device is present (e.g. a headless
    // CI runner). Without this ordering, an out-of-range loop request returned
    // "Now playing" and then crashed the background playback promise once the
    // loop indexed past the last real measure (F-c969321e).
    if (librarySong) {
      if (startMeasure !== undefined && startMeasure > librarySong.measures.length) {
        return {
          content: [{ type: "text", text: `startMeasure (${startMeasure}) exceeds "${librarySong.title}"'s length. Valid range: 1-${librarySong.measures.length}.` }],
          isError: true,
        };
      }
      if (endMeasure !== undefined && endMeasure > librarySong.measures.length) {
        return {
          content: [{ type: "text", text: `endMeasure (${endMeasure}) exceeds "${librarySong.title}"'s length. Valid range: 1-${librarySong.measures.length}.` }],
          isError: true,
        };
      }
    }

    // Connect sound engine
    const voiceId = (keyboard ?? "grand") as PianoVoiceId;
    activeVoiceId = voiceId;
    activeNotes.clear();
    const connector = engine === "tract"
      ? createTractEngine({ voice: (tractVoice ?? "soprano") as TractVoiceId })
      : engine === "vocal"
        ? createVocalEngine()
        : engine === "guitar"
          ? createGuitarEngine({ voice: (guitarVoice ?? "steel-dreadnought") as GuitarVoiceId })
          : createAudioEngine(voiceId);
    // Native stdout hardening: on a host without a running JACK server /
    // libjack.so.0, node-web-audio-api's cpal layer prints a backend-probe
    // failure ("Failed to open client because of error:
    // LibraryError(\"libjack.so.0: ...\")") directly to fd-1 (stdout) during
    // connect(), bypassing our console (which we route to stderr everywhere
    // else). On an MCP stdio host that non-JSON line would corrupt the
    // JSON-RPC frame. A native fd-1 write can't be intercepted from JS (no
    // dup2 in pure Node; /proc/self/fd reopen is ENXIO for a pipe fd; worker
    // threads share the fd table), so it is handled one layer up: on POSIX the
    // process runs under the stdio-purity supervisor, which puts JSON-RPC on
    // fd 3 and routes any fd-1 writes here to stderr. See src/stdio-supervisor.ts.
    try {
      await connector.connect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Couldn't start the ${ENGINE_LABELS[(engine ?? "piano") as EngineId]} engine: ${msg}` }],
        isError: true,
      };
    }
    activeConnector = connector;

    // ── MIDI file playback ──
    if (isMidiFile) {
      let parsed;
      try {
        parsed = await parseMidiFile(safeMidiPath!);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        connector.disconnect().catch((e) => console.error(`Disconnect error: ${e instanceof Error ? e.message : String(e)}`));
        activeConnector = null;
        return {
          content: [{ type: "text", text: `Couldn't read that MIDI file — it may be corrupted or in an unsupported format. (${msg})` }],
          isError: true,
        };
      }

      // Build teaching hooks if requested
      const hooks: import("./types.js").TeachingHook[] = [];
      const singingLog: string[] = [];
      const feedbackLog: string[] = [];

      if (withSinging) {
        const voiceSink = async (d: VoiceDirective) => {
          singingLog.push(d.text);
          console.error(`♪ ${d.text}`);
        };
        hooks.push(createSingOnMidiHook(voiceSink, parsed, {
          mode: (singMode ?? "note-names") as import("./note-parser.js").SingAlongMode,
        }));
      }

      if (withTeaching) {
        const voiceSink = async (d: VoiceDirective) => {
          feedbackLog.push(d.text);
          console.error(`🎓 ${d.text}`);
        };
        const asideSink = async (d: AsideDirective) => {
          feedbackLog.push(d.text);
          console.error(`💡 ${d.text}`);
        };
        // Use position-aware feedback (measure-level context) over basic per-note
        hooks.push(createLiveMidiFeedbackHook(voiceSink, asideSink, parsed));
      }

      // stderr, not stdout — this server speaks JSON-RPC over stdout
      // (StdioServerTransport); a stdout teaching hook here corrupts the
      // protocol stream (B-B1-001).
      hooks.push(createStderrTeachingHook());
      const teachingHook = composeTeachingHooks(...hooks);

      // Use PlaybackController when hooks are active, raw engine otherwise
      if (withSinging || withTeaching) {
        const controller = new PlaybackController(connector, parsed);
        activeController = controller;

        const midiPlayStart = Date.now();
        const playPromise = controller.play({ speed: speed ?? 1.0, teachingHook });
        playPromise
          .then(() => {
            const elapsed = Math.round((Date.now() - midiPlayStart) / 1000);
            lastCompletedSession = {
              songId: id,
              title: id,
              composer: undefined,
              genre: "classical",
              difficulty: "intermediate",
              key: "unknown",
              tempo: parsed.bpm,
              speed: speed ?? 1.0,
              mode: "full",
              measuresPlayed: 0,
              totalMeasures: 0,
              durationSeconds: elapsed,
              timestamp: new Date().toISOString(),
            };
            persistSessionState();
            console.error(`Finished playing MIDI file: ${id} (${parsed.noteCount} notes, ${parsed.durationSeconds.toFixed(1)}s)`);
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`Playback error [${id}]: ${msg}`);
            lastPlaybackError = {
              message: msg,
              songOrFile: id,
              timestamp: new Date().toISOString(),
              positionSeconds: controller.positionSeconds,
            };
          })
          .finally(() => {
            connector.disconnect().catch((e) => console.error(`Disconnect error: ${e instanceof Error ? e.message : String(e)}`));
            if (activeController === controller) activeController = null;
            if (activeConnector === connector) activeConnector = null;
          });
      } else {
        const engine = new MidiPlaybackEngine(connector, parsed);
        activeMidiEngine = engine;

        const rawMidiPlayStart = Date.now();
        const playPromise = engine.play({ speed: speed ?? 1.0 });
        playPromise
          .then(() => {
            const elapsed = Math.round((Date.now() - rawMidiPlayStart) / 1000);
            lastCompletedSession = {
              songId: id,
              title: id,
              composer: undefined,
              genre: "classical",
              difficulty: "intermediate",
              key: "unknown",
              tempo: parsed.bpm,
              speed: speed ?? 1.0,
              mode: "full",
              measuresPlayed: 0,
              totalMeasures: 0,
              durationSeconds: elapsed,
              timestamp: new Date().toISOString(),
            };
            persistSessionState();
            console.error(`Finished playing MIDI file: ${id} (${parsed.noteCount} notes, ${parsed.durationSeconds.toFixed(1)}s)`);
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`Playback error [${id}]: ${msg}`);
            lastPlaybackError = {
              message: msg,
              songOrFile: id,
              timestamp: new Date().toISOString(),
              positionSeconds: engine.positionSeconds,
            };
          })
          .finally(() => {
            connector.disconnect().catch((e) => console.error(`Disconnect error: ${e instanceof Error ? e.message : String(e)}`));
            if (activeMidiEngine === engine) activeMidiEngine = null;
            if (activeConnector === connector) activeConnector = null;
          });
      }

      const effectiveSpeed = speed ?? 1.0;
      const durationAtSpeed = parsed.durationSeconds / effectiveSpeed;
      const speedLabel = effectiveSpeed !== 1.0 ? ` × ${effectiveSpeed}x` : "";
      const trackInfo = parsed.trackNames.length > 0 ? parsed.trackNames.join(", ") : "Unknown";
      const features: string[] = [];
      if (withSinging) features.push(`singing (${singMode ?? "note-names"})`);
      if (withTeaching) features.push("teaching feedback");

      const lines = [
        `Now playing: **${id}** (MIDI file)`,
        ``,
        `- **Tracks:** ${trackInfo} (${parsed.trackCount} track${parsed.trackCount !== 1 ? "s" : ""})`,
        `- **Notes:** ${parsed.noteCount}`,
        `- **Tempo:** ${parsed.bpm} BPM${speedLabel}`,
        `- **Duration:** ~${Math.round(durationAtSpeed)}s`,
        `- **Format:** MIDI type ${parsed.format}`,
      ];
      if (features.length > 0) {
        lines.push(`- **Features:** ${features.join(", ")}`);
      }
      lines.push(``, `Use \`playback_status\` to check progress, \`stop_playback\` to stop. Playback runs in the background.`);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    // ── Library song playback ──
    if ((startMeasure !== undefined) !== (endMeasure !== undefined)) {
      return {
        content: [{ type: "text", text: `To loop a section, provide both startMeasure and endMeasure.` }],
        isError: true,
      };
    }
    if (startMeasure !== undefined && endMeasure !== undefined && endMeasure < startMeasure) {
      return {
        content: [{ type: "text", text: `The end measure (${endMeasure}) needs to be at or after the start measure (${startMeasure}).` }],
        isError: true,
      };
    }

    const song = librarySong!;

    // Measure-range bounds are validated up-front, before the audio engine
    // connect (see the pre-connect block above, F-c969321e).

    const loopRange: [number, number] | undefined =
      startMeasure !== undefined && endMeasure !== undefined ? [startMeasure, endMeasure] : undefined;

    const playbackMode = (mode ?? "full") as PlaybackMode;

    // Build teaching hooks
    const libHooks: import("./types.js").TeachingHook[] = [];

    if (withSinging) {
      const { createSingAlongHook } = await import("./teaching.js");
      const voiceSink = async (d: VoiceDirective) => {
        console.error(`♪ ${d.text}`);
      };
      libHooks.push(createSingAlongHook(voiceSink, song, {
        mode: (singMode ?? "note-names") as import("./note-parser.js").SingAlongMode,
      }));
    }

    if (withTeaching) {
      const { createLiveFeedbackHook } = await import("./teaching.js");
      const voiceSink = async (d: VoiceDirective) => {
        console.error(`🎓 ${d.text}`);
      };
      const asideSink = async (d: AsideDirective) => {
        console.error(`💡 ${d.text}`);
      };
      libHooks.push(createLiveFeedbackHook(voiceSink, asideSink, song));
    }

    // stderr, not stdout — this server speaks JSON-RPC over stdout
    // (StdioServerTransport); a stdout teaching hook here corrupts the
    // protocol stream (B-B1-001).
    libHooks.push(createStderrTeachingHook());
    const teachingHook = composeTeachingHooks(...libHooks);

    const syncMode: SyncMode = syncModeParam ?? ((withSinging && !withTeaching) ? "before" : "concurrent");
    const session = createSession(song, connector, {
      mode: playbackMode,
      syncMode,
      speed,
      tempo,
      loopRange,
      teachingHook,
      metronome,
      countIn,
      record,
    });
    activeSession = session;

    // Play in background
    lastPlaybackError = null;
    const playStartTime = Date.now();
    const playPromise = session.play();
    playPromise
      .then(() => {
        const elapsed = Math.round((Date.now() - playStartTime) / 1000);
        lastCompletedSession = {
          songId: song.id,
          title: song.title,
          composer: song.composer,
          genre: song.genre,
          difficulty: song.difficulty,
          key: song.key,
          tempo: session.effectiveTempo(),
          speed: session.session.speed,
          mode: session.session.mode,
          measuresPlayed: session.session.measuresPlayed,
          totalMeasures: song.measures.length,
          durationSeconds: elapsed,
          timestamp: new Date().toISOString(),
        };
        persistSessionState();
        console.error(`Finished playing: ${song.title} (${session.session.measuresPlayed} measures)`);
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Playback error [${song.id}]: ${msg}`);
        lastPlaybackError = {
          message: msg,
          songOrFile: song.id,
          timestamp: new Date().toISOString(),
          measure: session.currentMeasureDisplay,
        };
      })
      .finally(() => {
        // Capture whatever was recorded regardless of how playback ended
        // (finished, errored, or stopped/superseded elsewhere) — a no-op
        // when `record` wasn't enabled (see captureLastRecording()).
        captureLastRecording(session);
        connector.disconnect().catch((e) => console.error(`Disconnect error: ${e instanceof Error ? e.message : String(e)}`));
        if (activeSession === session) activeSession = null;
        if (activeConnector === connector) activeConnector = null;
      });

    const effectiveSpeed = speed ?? 1.0;
    const baseTempo = tempo ?? song.tempo;
    const effectiveTempo = Math.round(baseTempo * effectiveSpeed);
    const speedLabel = effectiveSpeed !== 1.0 ? ` × ${effectiveSpeed}x` : "";

    const warnings = session.parseWarnings;
    const lines = [
      `Now playing: **${song.title}** by ${song.composer ?? "Traditional"}`,
      ``,
      `- **Keyboard:** ${voiceId}`,
      `- **Mode:** ${playbackMode}`,
      `- **Tempo:** ${baseTempo} BPM${speedLabel} → ${effectiveTempo} BPM effective`,
      `- **Key:** ${song.key} | **Time:** ${song.timeSignature}`,
      `- **Measures:** ${song.measures.length}`,
    ];

    if (loopRange) {
      const loopMeasureCount = loopRange[1] - loopRange[0] + 1;
      lines.push(`- **Loop range:** measures ${loopRange[0]}–${loopRange[1]} (${loopMeasureCount} measures)`);
    }
    if (metronome) {
      lines.push(`- **Metronome:** on${session.session.countInBars ? ` (${session.session.countInBars}-bar count-in)` : ""}`);
    }
    if (record) {
      lines.push(`- **Recording:** on — use \`score_last_take\` after playback to see how it went.`);
    }
    if (warnings.length > 0) {
      lines.push(``, `⚠ ${warnings.length} note(s) had parse warnings and will be skipped.`);
    }
    lines.push(``, `Use \`playback_status\` to check progress, \`stop_playback\` to stop. Playback runs in the background.`);
    lines.push(``, `Tip: After listening, use \`save_practice_note\` to record what you learned.`);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  })
);

// ─── Tool: stop_playback ──────────────────────────────────────────────────

registerTool(
  "stop_playback",
  "Stop the currently playing song and disconnect MIDI.",
  {},
  async () => withStateLock(async () => {
    // A FINISHED practice loop deliberately stays in activePracticeLoop
    // (see the practice_loop tool below) so practice_status can still
    // report its final state — only a still-RUNNING loop counts as "was
    // playing" here, so calling stop_playback with nothing actually active
    // doesn't silently clear that memory.
    const practiceLoopRunning = activePracticeLoop?.getState().status === "running";
    const wasPlaying = activeSession || activeMidiEngine || activeController || practiceLoopRunning;
    if (!wasPlaying) {
      return {
        content: [{ type: "text", text: "No song is currently playing." }],
      };
    }

    const info = activeSession
      ? `${activeSession.session.song.title} (${activeSession.session.measuresPlayed} measures played)`
      : practiceLoopRunning
        ? `Practice loop on "${activePracticeLoop!.song.title}" (pass ${activePracticeLoop!.getState().currentPassNumber})`
        : activeMidiEngine
          ? `MIDI file (${activeMidiEngine.eventsPlayed}/${activeMidiEngine.totalEvents} events played)`
          : activeController
            ? `MIDI file (${activeController.eventsPlayed}/${activeController.totalEvents} events played)`
            : "Unknown";

    await stopActive();

    return {
      content: [{ type: "text", text: `Stopped: ${info}` }],
    };
  })
);

// ─── Tool: practice_loop ────────────────────────────────────────────────────

registerTool(
  "practice_loop",
  "Start a practice loop: drills a measure range at reduced tempo, ramping toward full speed one step at a time — but only after a CLEAN pass (accurate + complete), never on a fixed schedule. Metronome + a count-in are on by default, every pass is recorded and scored. Returns immediately with the first pass's micro-goal while it runs in the background — poll with practice_status, stop with stop_playback.",
  {
    id: z.string().describe("Song ID from the library (e.g. 'fur-elise')"),
    startMeasure: z.number().int().min(1).describe("First measure of the drilled range (1-based)"),
    endMeasure: z.number().int().min(1).describe("Last measure of the drilled range (1-based, inclusive)"),
    speedStartPct: z.number().min(1).max(400).optional().describe("Starting speed, percent of the song's tempo. Default: 70"),
    speedTargetPct: z.number().min(1).max(400).optional().describe("Target speed, percent of the song's tempo. Default: 100"),
    rampStepPct: z.number().min(0.1).max(100).optional().describe("Speed increase applied after each CLEAN pass. Default: 5"),
    maxPasses: z.number().int().min(1).optional().describe("Optional cap on total passes. Default: no cap — runs until a clean pass at speedTargetPct, or stop_playback."),
  },
  async ({ id, startMeasure, endMeasure, speedStartPct, speedTargetPct, rampStepPct, maxPasses }) => withStateLock(async () => {
    await stopActive();

    const song = getSong(id);
    if (!song) {
      return {
        content: [{ type: "text", text: `No song called "${id}" in the library. Try list_songs to browse.` }],
        isError: true,
      };
    }

    let config;
    try {
      config = resolvePracticeLoopConfig(song, { startMeasure, endMeasure, speedStartPct, speedTargetPct, rampStepPct, maxPasses });
    } catch (err) {
      return {
        content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
        isError: true,
      };
    }

    const connector = createAudioEngine("grand");
    activeVoiceId = "grand";
    try {
      await connector.connect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Couldn't start the piano engine: ${msg}` }],
        isError: true,
      };
    }
    activeConnector = connector;

    const loop = new PracticeLoop(song, connector, config, {
      // Feedback timing (finding 29): only AFTER a pass finishes — never mid-take.
      onPassComplete: (pass, recording) => {
        lastRecording = { recording, songId: song.id, range: [config.startMeasure, config.endMeasure] };
        lastScoredTake = { song: windowSong(song, config.startMeasure, config.endMeasure), result: pass.result };
      },
    });
    activePracticeLoop = loop;

    loop.start();
    loop
      .done()
      .then(() => {
        console.error(`Practice loop finished: ${song.title} mm.${config.startMeasure}-${config.endMeasure} (${loop.getState().status})`);
      })
      .catch((err) => {
        console.error(`Practice loop error [${song.id}]: ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => {
        connector.disconnect().catch((e) => console.error(`Disconnect error: ${e instanceof Error ? e.message : String(e)}`));
        // Deliberately NOT nulling activePracticeLoop here (unlike
        // activeSession/activeController for play_song) — practice_status
        // needs to report the just-finished loop's final state, not
        // "nothing is running." A new play_song/practice_loop call (via
        // stopActive()) is what actually supersedes/clears it.
        if (activeConnector === connector) activeConnector = null;
      });

    const lines = [
      `Practice loop started: **${song.title}**`,
      ``,
      loop.getState().microGoal,
      ``,
      `- **Range:** measures ${config.startMeasure}–${config.endMeasure}`,
      `- **Speed:** ${config.speedStartPct}% → ${config.speedTargetPct}% (ramp +${config.rampStepPct}% per clean pass)`,
      `- **Metronome:** on (count-in each pass)`,
    ];
    if (config.maxPasses !== undefined) {
      lines.push(`- **Max passes:** ${config.maxPasses}`);
    }
    lines.push(``, `Use \`practice_status\` to check progress, \`stop_playback\` to stop. Runs in the background.`);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  })
);

// ─── Tool: practice_status ──────────────────────────────────────────────────

registerTool(
  "practice_status",
  "Check progress on the current (or most recently run) practice loop: pass number, speed, and the last pass's diagnostic. Task-focused wording only — notes/timing/measures, no grades, no praise, no points/streaks. Returns a message if no practice loop has run yet.",
  {},
  async () => {
    if (!activePracticeLoop) {
      return { content: [{ type: "text", text: "No practice loop has run yet. Use `practice_loop` to start one." }] };
    }

    const state = activePracticeLoop.getState();
    const lines = [
      `# Practice Status`,
      ``,
      `- **Song:** ${activePracticeLoop.song.title}`,
      `- **Range:** measures ${state.config.startMeasure}–${state.config.endMeasure}`,
      `- **Status:** ${state.status}`,
      `- **Pass:** ${state.currentPassNumber} (speed ${state.currentSpeedPct}%)`,
      `- **Goal:** ${state.microGoal}`,
    ];

    if (state.error) {
      lines.push(``, `⚠ ${state.error}`);
    }

    const lastPass = state.passes[state.passes.length - 1];
    if (lastPass) {
      lines.push(
        ``,
        `### Last pass (pass ${lastPass.passNumber}, ${lastPass.speedPct}%)`,
        `${lastPass.clean ? "Clean" : "Not clean"} — ${formatPassSummary(lastPass.result)}`,
      );
      const diagLines = formatMeasureDiagnosticLines(measureDiagnostics(lastPass.result));
      if (diagLines.length > 0) {
        lines.push(`Per-measure:`, ...diagLines.map((l) => `  ${l}`));
      }
    }

    lines.push(``, `Use \`stop_playback\` to stop, \`score_last_take\` for the full assessment, \`view_scored_piano_roll\` to see it.`);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: pause_playback ─────────────────────────────────────────────────

registerTool(
  "pause_playback",
  "Pause or resume the currently playing song.",
  {
    resume: z.boolean().optional().describe("If true, resume playback. If false or omitted, pause."),
  },
  async ({ resume }) => {
    if (resume) {
      // Resume
      if (activeController && activeController.state === "paused") {
        try {
          await activeController.resume();
          return { content: [{ type: "text", text: "Resumed playback." }] };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return {
            content: [{ type: "text", text: `Failed to resume playback: ${msg}` }],
            isError: true,
          };
        }
      }
      if (activeMidiEngine && activeMidiEngine.state === "paused") {
        try {
          await activeMidiEngine.resume();
          return { content: [{ type: "text", text: "Resumed playback." }] };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return {
            content: [{ type: "text", text: `Failed to resume playback: ${msg}` }],
            isError: true,
          };
        }
      }
      if (activeSession && activeSession.state === "paused") {
        try {
          await activeSession.play();
          return { content: [{ type: "text", text: "Resumed playback." }] };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return {
            content: [{ type: "text", text: `Failed to resume playback: ${msg}` }],
            isError: true,
          };
        }
      }
      // A running practice loop plays through its OWN per-pass session, not
      // activeSession (see the practice_loop tool) — without this,
      // pause_playback couldn't see it at all and always fell through to
      // "Nothing is paused." even while a loop pass sat paused mid-measure.
      if (activePracticeLoop?.getState().paused) {
        activePracticeLoop.resume();
        return { content: [{ type: "text", text: `Resumed practice loop (pass ${activePracticeLoop.getState().currentPassNumber}).` }] };
      }
      return { content: [{ type: "text", text: "Nothing is paused." }] };
    }

    // Pause
    if (activeController && activeController.state === "playing") {
      activeController.pause();
      const pos = activeController.positionSeconds;
      return {
        content: [{
          type: "text",
          text: `Paused at ${pos.toFixed(1)}s (${activeController.eventsPlayed}/${activeController.totalEvents} events).`,
        }],
      };
    }
    if (activeMidiEngine && activeMidiEngine.state === "playing") {
      activeMidiEngine.pause();
      return {
        content: [{
          type: "text",
          text: `Paused at ${activeMidiEngine.positionSeconds.toFixed(1)}s.`,
        }],
      };
    }
    if (activeSession && activeSession.state === "playing") {
      captureLastRecording(activeSession);
      activeSession.pause();
      return {
        content: [{
          type: "text",
          text: `Paused (${activeSession.session.measuresPlayed} measures played).`,
        }],
      };
    }
    // Same "route to the practice loop's current session" fix as the resume
    // branch above — a running loop's audio lives on
    // activePracticeLoop.getCurrentSession(), not activeSession.
    if (activePracticeLoop?.getState().status === "running") {
      const loop = activePracticeLoop;
      const currentSession = loop.getCurrentSession();
      if (currentSession && currentSession.state === "playing") {
        // The per-pass session carries no loopRange of its own (practice-loop.ts
        // drives it measure-by-measure via goTo()) — pass the loop's drilled
        // range explicitly so a score_last_take called while paused windows
        // correctly, same as a normal completed pass (practice_loop's own
        // onPassComplete hook).
        captureLastRecording(currentSession, { range: [loop.config.startMeasure, loop.config.endMeasure] });
        loop.pause();
        return {
          content: [{
            type: "text",
            text: `Paused practice loop (pass ${loop.getState().currentPassNumber}).`,
          }],
        };
      }
    }

    return { content: [{ type: "text", text: "No song is currently playing." }] };
  }
);

// ─── Tool: set_speed ──────────────────────────────────────────────────────

registerTool(
  "set_speed",
  "Change the playback speed of the currently playing song. Takes effect on the next note.",
  {
    speed: z.number().min(0.1).max(4).describe("New speed multiplier (0.1–4.0)"),
  },
  async ({ speed }) => {
    // A running practice loop owns its own tempo ramp (speedStartPct ->
    // speedTargetPct, +rampStepPct per clean pass — see practice_loop) —
    // letting set_speed override it mid-loop would fight that ramp on the
    // very next pass (a fresh SessionController per pass re-reads
    // config.speedStartPct/currentSpeedPct, not whatever set_speed last
    // poked into the now-superseded session). Refuse instead of silently
    // losing the change.
    if (activePracticeLoop?.getState().status === "running") {
      const jamErr = new JamError({
        code: "INPUT_INVALID_ARGS",
        message: "A practice loop is running.",
        hint: "the practice loop controls its own tempo ramp — stop_playback to take manual control",
      });
      return { content: [{ type: "text", text: jamErr.toUserString() }], isError: true };
    }
    if (activeController) {
      const prev = activeController.speed;
      activeController.setSpeed(speed);
      return {
        content: [{
          type: "text",
          text: `Speed changed: ${prev}x → ${speed}x. Takes effect on next note.`,
        }],
      };
    }
    if (activeMidiEngine) {
      const prev = activeMidiEngine.speed;
      activeMidiEngine.setSpeed(speed);
      return {
        content: [{
          type: "text",
          text: `Speed changed: ${prev}x → ${speed}x.`,
        }],
      };
    }
    if (activeSession) {
      activeSession.setSpeed(speed);
      return {
        content: [{
          type: "text",
          text: `Speed changed to ${speed}x.`,
        }],
      };
    }

    return { content: [{ type: "text", text: "No song is currently playing." }] };
  }
);

// ─── Tool: mute_hand ─────────────────────────────────────────────────────

registerTool(
  "mute_hand",
  "Mute or unmute a hand during playback. Muting the left hand lets you focus on the right hand (and vice versa). Great for hands-separate practice.",
  {
    hand: z.enum(["left", "right"]).describe("Which hand to mute/unmute"),
    muted: z.boolean().describe("true = mute (silence), false = unmute (play)"),
  },
  async ({ hand, muted }) => {
    if (!activeSession) {
      return {
        content: [{ type: "text", text: "No song is currently playing. Start one with play_song first." }],
        isError: true,
      };
    }

    if (muted) {
      activeSession.muteHand(hand);
    } else {
      activeSession.unmuteHand(hand);
    }

    const leftStatus = activeSession.isHandMuted("left") ? "muted" : "playing";
    const rightStatus = activeSession.isHandMuted("right") ? "muted" : "playing";

    return {
      content: [{
        type: "text",
        text: `${hand === "left" ? "Left" : "Right"} hand ${muted ? "muted" : "unmuted"}. Status: RH ${rightStatus}, LH ${leftStatus}.`,
      }],
    };
  }
);

// ─── Tool: ai_jam_sessions ──────────────────────────────────────────────

registerTool(
  "ai_jam_sessions",
  "Start a jam session — get a 'jam brief' with chord progression, melody outline, structure, and style hints. Provide a songId for a specific song, or just a genre to jam on a random pick. Use the brief to create your own interpretation, then save with add_song and play with play_song.",
  {
    songId: z.string().optional()
      .describe("Source song ID to jam on (e.g. 'autumn-leaves'). Optional if genre is provided."),
    genre: z.enum(GENRES as unknown as [string, ...string[]]).optional()
      .describe("Pick a random song from this genre to jam on (e.g., 'jazz', 'blues'). Used when no songId is provided."),
    style: z.enum(GENRES as unknown as [string, ...string[]]).optional()
      .describe("Target genre for reinterpretation (e.g., turn a classical piece into jazz)"),
    mood: z.string().optional()
      .describe("Target mood (e.g., 'upbeat', 'melancholic', 'dreamy', 'energetic', 'gentle', 'playful')"),
    difficulty: z.enum(DIFFICULTIES as unknown as [string, ...string[]]).optional()
      .describe("Target difficulty level"),
    measures: z.string().optional()
      .describe("Measure range to focus on (e.g., '1-8' for just the opening)"),
  },
  async ({ songId, genre, style, mood, difficulty, measures }) => {
    if (!songId && !genre) {
      return {
        content: [{ type: "text", text: "I need either a song ID or a genre to jam. Try list_songs to browse, or just pass a genre like \"jazz\" for a random pick." }],
        isError: true,
      };
    }

    let song: SongEntry | undefined;
    if (songId) {
      song = getSong(songId);
      if (!song) {
        return {
          content: [{ type: "text", text: `No song called "${songId}" in the library. Try list_songs to browse.` }],
          isError: true,
        };
      }
    } else {
      const candidates = getSongsByGenre(genre as Genre);
      if (candidates.length === 0) {
        return {
          content: [{ type: "text", text: `No songs in the "${genre}" genre yet. Try registry_stats to see what genres are available.` }],
          isError: true,
        };
      }
      song = candidates[Math.floor(Math.random() * candidates.length)];
    }

    const options = {
      style: style as Genre | undefined,
      mood,
      difficulty: difficulty as Difficulty | undefined,
      measures,
    };
    const brief = generateJamBrief(song, options);
    const text = formatJamBrief(brief, options);
    return { content: [{ type: "text", text }] };
  }
);

// ─── Tool: add_song ──────────────────────────────────────────────────────

registerTool(
  "add_song",
  "Add a new song to the library. Provide a complete SongEntry as JSON. The song is validated, registered, and saved to the user songs directory.",
  {
    song: z.string().describe("Complete SongEntry as a JSON string"),
  },
  async ({ song: songJson }) => {
    try {
      const parsed = JSON.parse(songJson, (key, value) => {
        if (key === "__proto__" || key === "constructor" || key === "prototype") return undefined;
        return value;
      }) as SongEntry;

      // Song ID sanitization
      if (!isSafeSongId(parsed.id)) {
        return {
          content: [{
            type: "text",
            text: `"${parsed.id}" isn't a valid song ID — use lowercase letters, numbers, and hyphens (e.g. "amazing-grace").`,
          }],
          isError: true,
        };
      }

      const errors = validateSong(parsed);
      if (errors.length > 0) {
        return {
          content: [{
            type: "text",
            text: `This song didn't pass validation:\n  - ${errors.join("\n  - ")}`,
          }],
          isError: true,
        };
      }

      // Check for duplicates
      if (getSong(parsed.id)) {
        return {
          content: [{
            type: "text",
            text: `A song with ID "${parsed.id}" already exists in the library.`,
          }],
          isError: true,
        };
      }

      registerSong(parsed);

      // Save to user songs directory
      let filePath: string;
      try {
        const userDir = getUserSongsDir();
        filePath = saveSong(parsed, userDir);
      } catch (saveErr) {
        const msg = saveErr instanceof Error ? saveErr.message : String(saveErr);
        return {
          content: [{
            type: "text",
            text: `Song "${parsed.title}" (${parsed.id}) was registered in memory but failed to save to disk: ${msg}\n` +
              `The song is available for this session but will be lost on restart.`,
          }],
          isError: true,
        };
      }

      return {
        content: [{
          type: "text",
          text: `Song "${parsed.title}" (${parsed.id}) added to the library.\n` +
            `Genre: ${parsed.genre} | Difficulty: ${parsed.difficulty} | ` +
            `${parsed.measures.length} measures | ${parsed.durationSeconds}s\n` +
            `Saved to: ${filePath}`,
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `Failed to add song: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  }
);

// ─── Tool: import_midi ──────────────────────────────────────────────────

registerTool(
  "import_midi",
  "Import a MIDI file as a song. Provide the file path and metadata. The MIDI is parsed into measures with right/left hand separation, converted to a SongEntry JSON, and saved to ~/.ai-jam-sessions/songs/. User songs persist across server restarts and package updates.",
  {
    midi_path: z.string().describe("Path to .mid file"),
    id: z.string().describe("Song ID (kebab-case, e.g. 'fur-elise')"),
    title: z.string().describe("Song title"),
    genre: z.enum(GENRES as unknown as [string, ...string[]]).describe("Genre"),
    difficulty: z.enum(DIFFICULTIES as unknown as [string, ...string[]]).describe("Difficulty"),
    key: z.string().describe("Key signature (e.g. 'C major', 'A minor')"),
    composer: z.string().optional().describe("Composer or artist"),
    description: z.string().optional().describe("1-3 sentence description of the piece"),
    tags: z.array(z.string()).optional().describe("Tags for search (default: genre + difficulty)"),
  },
  async ({ midi_path, id, title, genre, difficulty, key, composer, description, tags }) => {
    try {
      // Path traversal protection + directory containment
      const resolvedMidiPath = pathResolve(midi_path);
      if (!resolvedMidiPath.endsWith(".mid") && !resolvedMidiPath.endsWith(".midi")) {
        return {
          content: [{ type: "text", text: `Invalid MIDI path: must be a .mid or .midi file.` }],
          isError: true,
        };
      }
      const midiHome = getCanonicalHomeDir();
      const safeMidiPath = midiHome
        ? resolveContainedExistingPath(resolvedMidiPath, midiHome)
        : null;
      if (!safeMidiPath) {
        return {
          content: [{ type: "text", text: `Invalid MIDI path: file must be within your home directory.` }],
          isError: true,
        };
      }

      // Song ID sanitization
      if (!isSafeSongId(id)) {
        return {
          content: [{ type: "text", text: `Invalid song ID: "${id}". Must be kebab-case (a-z, 0-9, hyphens), no path separators.` }],
          isError: true,
        };
      }

      const midiBuffer = new Uint8Array(readFileSync(safeMidiPath));

      const config = {
        id,
        title,
        genre: genre as Genre,
        difficulty: difficulty as Difficulty,
        key,
        composer,
        tags: tags ?? [genre, difficulty],
        status: "ready" as const,
        musicalLanguage: {
          description: description ?? `${title} — a ${difficulty} ${genre} piece in ${key}.`,
          structure: "To be determined",
          keyMoments: [`Bar 1: ${title} begins`],
          teachingGoals: [`Learn ${title} at ${difficulty} level`],
          styleTips: [`Play in ${genre} style`],
        },
      };

      const song = midiToSongEntry(midiBuffer, config);

      // Check for duplicates
      if (getSong(song.id)) {
        return {
          content: [{
            type: "text",
            text: `A song with ID "${song.id}" already exists in the library.`,
          }],
          isError: true,
        };
      }

      registerSong(song);

      const userDir = getUserSongsDir();
      const filePath = saveSong(song, userDir);

      return {
        content: [{
          type: "text",
          text: `MIDI imported as "${song.title}" (${song.id}).\n` +
            `Genre: ${song.genre} | Difficulty: ${song.difficulty} | Key: ${song.key}\n` +
            `Tempo: ${song.tempo} BPM | Time: ${song.timeSignature} | ` +
            `${song.measures.length} measures | ${song.durationSeconds}s\n` +
            `Saved to: ${filePath}`,
        }],
      };
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `Failed to import MIDI: ${err instanceof Error ? err.message : String(err)}`,
        }],
      };
    }
  }
);

// ─── Tool: detect_chord ─────────────────────────────────────────────────

// Documented in this file's header and imported since the module's
// inception, but never actually registered as a tool (F-a886453e) — an LLM
// or developer calling it per the docs got the SDK's generic "not found"
// error. This wires the existing, already-tested chord-detect.ts module in.
registerTool(
  "detect_chord",
  "Detect the chord name from a set of currently-sounding MIDI note numbers (0-127). Useful for identifying what chord is being held during live playback. Returns the chord name (e.g. 'C', 'Gm7', 'F#/A#') and the note names involved.",
  {
    notes: z.array(z.number().int().min(0).max(127)).min(1).max(64).describe("MIDI note numbers currently sounding, e.g. [60, 64, 67] for a C major triad"),
  },
  async ({ notes }) => {
    const names = midiNotesToNames(notes);
    const chord = detectChord(notes);

    if (chord) {
      return { content: [{ type: "text", text: `**Chord:** ${chord}\n**Notes:** ${names}` }] };
    }
    if (notes.length < 2) {
      return { content: [{ type: "text", text: `**Notes:** ${names}\nNeed at least 2 distinct notes to detect a chord.` }] };
    }
    return { content: [{ type: "text", text: `**Notes:** ${names}\nNo known chord pattern matched.` }] };
  }
);

// ─── Tool: view_piano_roll ─────────────────────────────────────────────────

registerTool(
  "view_piano_roll",
  "Render a piano roll visualization of a song as SVG. Returns an image showing note positions over time. Color modes: 'hand' (blue RH / coral LH, default) or 'pitch-class' (chromatic rainbow — each pitch class gets its own color, making harmonic patterns visible).",
  {
    songId: z.string().describe("Song ID from the library (e.g. 'fur-elise')"),
    startMeasure: z.number().int().min(1).optional().describe("First measure to render (1-based). Default: 1"),
    endMeasure: z.number().int().min(1).optional().describe("Last measure to render (1-based). Default: last measure"),
    color_mode: z.enum(["hand", "pitch-class"]).optional().describe("Note coloring: 'hand' (RH/LH, default) or 'pitch-class' (chromatic rainbow)"),
  },
  async ({ songId, startMeasure, endMeasure, color_mode }) => {
    const song = getSong(songId);
    if (!song) {
      return {
        content: [{ type: "text" as const, text: `No song called "${songId}" in the library. Try list_songs to browse.` }],
        isError: true,
      };
    }

    const svg = renderPianoRoll(song, {
      startMeasure,
      endMeasure,
      colorMode: (color_mode ?? "hand") as PianoRollColorMode,
    });

    return {
      content: [{
        type: "image" as const,
        data: Buffer.from(svg).toString("base64"),
        mimeType: "image/svg+xml",
      }],
    };
  }
);

// ─── Tool: view_scored_piano_roll ──────────────────────────────────────────

registerTool(
  "view_scored_piano_roll",
  "Render the scored piano-roll overlay (per-note verdicts: correct/timing/missed, plus extra-note ghosts) for the most recently scored take. Run score_last_take (or a practice_loop pass) first. Writes the SVG to a temp file (for viewing outside the chat) and also returns it inline.",
  {},
  async () => {
    if (!lastScoredTake) {
      return {
        content: [{ type: "text" as const, text: "No scored take yet. Run `score_last_take` first (after a recorded play_song session or a practice_loop pass)." }],
        isError: true,
      };
    }

    const { song, result } = lastScoredTake;
    const svg = renderScoredPianoRoll(song, result);

    const { tmpdir } = await import("node:os");
    const { writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const tempPath = join(tmpdir(), `scored-piano-roll-${song.id}.svg`);
    try {
      writeFileSync(tempPath, svg, "utf8");
    } catch (err) {
      return fsErrorResult(err, `write scored piano roll for "${song.id}"`);
    }

    const worst = rankWorstMeasures(result, 3);
    const focusLine = worst.length > 0
      ? `Focus: ${worst.length === 1 ? `m. ${worst[0]}` : `mm. ${worst.join(", ")}`}`
      : "Clean take — no measures flagged.";

    return {
      content: [
        { type: "text" as const, text: `Scored piano roll written to: ${tempPath}\n${focusLine}` },
        { type: "image" as const, data: Buffer.from(svg).toString("base64"), mimeType: "image/svg+xml" },
      ],
    };
  }
);

// ─── Tool: view_guitar_tab ─────────────────────────────────────────────────

registerTool(
  "view_guitar_tab",
  "Render an interactive guitar tablature editor for a song as a self-contained HTML page. Open the output file in a browser for real-time playback cursor, click-to-add notes, drag editing, string/fret reassignment, and JSON export. Supports configurable guitar tunings.",
  {
    songId: z.string().describe("Song ID from the library (e.g. 'autumn-leaves')"),
    startMeasure: z.number().int().min(1).optional().describe("First measure to render (1-based). Default: 1"),
    endMeasure: z.number().int().min(1).optional().describe("Last measure to render (1-based). Default: last measure"),
    tuning: z.string().optional().describe("Guitar tuning: standard (default), drop-d, open-g, open-d, dadgad, open-e, half-step-down, full-step-down"),
    tempo: z.number().int().min(10).max(400).optional().describe("Override tempo in BPM. Default: song's tempo"),
  },
  async ({ songId, startMeasure, endMeasure, tuning, tempo }) => {
    const song = getSong(songId);
    if (!song) {
      return {
        content: [{ type: "text" as const, text: `No song called "${songId}" in the library. Try list_songs to browse.` }],
        isError: true,
      };
    }

    const html = renderGuitarTab(song, { startMeasure, endMeasure, tuning, tempo });

    // Write to temp file for browser viewing
    const { tmpdir } = await import("node:os");
    const { writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const tempPath = join(tmpdir(), `guitar-tab-${songId}.html`);
    try {
      writeFileSync(tempPath, html, "utf8");
    } catch (err) {
      return fsErrorResult(err, `write guitar tab file for "${songId}"`);
    }

    // Also return a text summary of the tab content so the LLM can "see" the arrangement
    const measures = song.measures.slice(
      (startMeasure ?? 1) - 1,
      endMeasure ?? song.measures.length
    );
    const tabSummary = measures.map((m, i) => {
      const num = (startMeasure ?? 1) + i;
      const rh = m.rightHand ?? "—";
      const lh = m.leftHand ?? "—";
      return `M${num}: RH[${rh}] LH[${lh}]`;
    }).join("\n");

    return {
      content: [
        { type: "text" as const, text: `Guitar tab editor written to: ${tempPath}\n\nTuning: ${tuning ?? "standard"}\nMeasures: ${(startMeasure ?? 1)}–${endMeasure ?? song.measures.length}\n\n## Tab Overview\n${tabSummary}\n\n## Interactive Editor\nOpen the HTML file in a browser for:\n- Playback cursor (Space to play/pause, Escape to stop)\n- Click on strings to add notes\n- Select notes and use ↑↓ to change string, +/- for fret, [ ] for duration\n- Delete key to remove notes\n- Export button (Ctrl+E) to save edited tab as JSON` },
      ],
    };
  }
);

// ─── Tool: list_keyboards ──────────────────────────────────────────────────

registerTool(
  "list_keyboards",
  "List available piano keyboard voices. Each voice has a different timbre suited to different genres. Use the keyboard parameter in play_song to choose one.",
  {},
  async () => {
    const voices = listVoices();
    const lines = [
      `# Piano Keyboards`,
      ``,
      `${voices.length} voices available. Pass the ID to \`play_song\` with the \`keyboard\` parameter.`,
      ``,
    ];

    for (const v of voices) {
      const isDefault = v.id === "grand" ? " **(default)**" : "";
      lines.push(`## ${v.name}${isDefault}`);
      lines.push(`**ID:** \`${v.id}\``);
      lines.push(`${v.description}`);
      lines.push(`**Best for:** ${v.suggestedFor.join(", ")}`);
      lines.push(``);
    }

    lines.push(`---`);
    lines.push(`*Tip: Use \`suggestVoice\` logic — the play_song tool will use the genre-suggested keyboard if none is specified.*`);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: tune_keyboard ──────────────────────────────────────────────────

registerTool(
  "tune_keyboard",
  "Tune a piano keyboard voice by adjusting synthesis parameters. Changes are saved and persist across sessions. Use get_keyboard_config to see current settings, reset_keyboard to restore factory defaults.",
  {
    id: z.enum(VOICE_IDS as readonly [string, ...string[]]).describe("Voice ID to tune"),
    brightness: z.number().min(0.05).max(0.5).optional().describe("Brightness at moderate velocity (0.05=very bright, 0.5=very dark)"),
    "brightness-slope": z.number().min(0.03).max(0.2).optional().describe("Velocity sensitivity for upper partials"),
    decay: z.number().min(1).max(10).optional().describe("Sustain length in seconds (treble end)"),
    "bass-decay": z.number().min(4).max(25).optional().describe("Additional sustain for bass in seconds"),
    hammer: z.number().min(0).max(0.5).optional().describe("Hammer attack intensity (0=none)"),
    detune: z.number().min(0).max(20).optional().describe("Random detuning in cents (chorus effect)"),
    stereo: z.number().min(0).max(1).optional().describe("Stereo spread (0=mono, 1=full)"),
    volume: z.number().min(0.1).max(0.5).optional().describe("Per-voice volume"),
    release: z.number().min(0.03).max(0.3).optional().describe("Damper speed in seconds"),
    rolloff: z.number().min(0.3).max(1.5).optional().describe("Harmonic darkness (higher=darker)"),
    "attack-fast": z.number().min(0.001).max(0.01).optional().describe("Fastest attack time (ff) in seconds"),
    "attack-slow": z.number().min(0.003).max(0.02).optional().describe("Slowest attack time (pp) in seconds"),
  },
  async (params) => {
    const { id, ...tuningParams } = params;

    // Collect non-undefined tuning params
    const overrides: UserTuning = {};
    for (const [key, val] of Object.entries(tuningParams)) {
      if (val !== undefined) overrides[key] = val as number;
    }

    if (Object.keys(overrides).length === 0) {
      return {
        content: [{ type: "text", text: `No tuning parameters provided. You can adjust: ${TUNING_PARAMS.map(p => p.key).join(", ")}` }],
        isError: true,
      };
    }

    try {
      saveUserTuning(id, overrides);
    } catch (err) {
      return fsErrorResult(err, `save tuning for "${id}"`);
    }
    const merged = getMergedVoice(id)!;
    const userTuning = loadUserTuning(id);

    const lines = [
      `Tuned **${merged.name}** (\`${id}\`):`,
      ``,
    ];
    for (const [key, val] of Object.entries(overrides)) {
      const param = TUNING_PARAMS.find(p => p.key === key);
      lines.push(`- **${key}**: ${val}${param ? ` — ${param.description}` : ""}`);
    }
    lines.push(``, `${Object.keys(userTuning).length} total override(s) saved. Use \`reset_keyboard\` to restore factory defaults.`);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: get_keyboard_config ────────────────────────────────────────────

registerTool(
  "get_keyboard_config",
  "Show the full configuration of a keyboard voice, including any user tuning overrides. Shows both the factory preset values and any custom adjustments.",
  {
    id: z.enum(VOICE_IDS as readonly [string, ...string[]]).describe("Voice ID to inspect"),
  },
  async ({ id }) => {
    const base = getVoice(id)!;
    const userTuning = loadUserTuning(id);
    const merged = getMergedVoice(id)!;
    const hasOverrides = Object.keys(userTuning).length > 0;

    const lines = [
      `# ${merged.name} (\`${id}\`)`,
      `${merged.description}`,
      `**Best for:** ${merged.suggestedFor.join(", ")}`,
      ``,
      `## Tunable Parameters`,
      ``,
      `| Parameter | Factory | Current | Range |`,
      `|-----------|---------|---------|-------|`,
    ];

    for (const param of TUNING_PARAMS) {
      let factoryVal: number;
      let currentVal: number;
      const baseRec = base as unknown as Record<string, unknown>;
      const mergedRec = merged as unknown as Record<string, unknown>;
      if (param.isArrayIndex !== undefined) {
        factoryVal = (baseRec[param.configKey] as number[])[param.isArrayIndex];
        currentVal = (mergedRec[param.configKey] as number[])[param.isArrayIndex];
      } else {
        factoryVal = baseRec[param.configKey] as number;
        currentVal = mergedRec[param.configKey] as number;
      }
      const isOverridden = param.key in userTuning;
      const marker = isOverridden ? " *" : "";
      lines.push(`| ${param.key} | ${factoryVal} | ${currentVal}${marker} | ${param.min}–${param.max} |`);
    }

    if (hasOverrides) {
      lines.push(``, `*\\* = user override*`);
      lines.push(``, `Use \`reset_keyboard\` to clear all overrides.`);
    } else {
      lines.push(``, `*No user overrides. Using factory preset.*`);
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: reset_keyboard ─────────────────────────────────────────────────

registerTool(
  "reset_keyboard",
  "Reset a keyboard voice to factory default settings, clearing all user tuning overrides.",
  {
    id: z.enum(VOICE_IDS as readonly [string, ...string[]]).describe("Voice ID to reset"),
  },
  async ({ id }) => {
    const hadOverrides = Object.keys(loadUserTuning(id)).length > 0;
    try {
      resetUserTuning(id);
    } catch (err) {
      return fsErrorResult(err, `reset tuning for "${id}"`);
    }
    const voice = getVoice(id)!;

    if (hadOverrides) {
      return { content: [{ type: "text", text: `Reset **${voice.name}** (\`${id}\`) to factory defaults. All user tuning overrides cleared.` }] };
    }
    return { content: [{ type: "text", text: `**${voice.name}** (\`${id}\`) was already at factory defaults.` }] };
  }
);

// ─── Tool: list_guitar_voices ─────────────────────────────────────────────

registerTool(
  "list_guitar_voices",
  "List available guitar voice presets. Each voice models a different guitar type with physically accurate synthesis parameters. Use the guitarVoice parameter in play_song (with engine='guitar') to choose one.",
  {},
  async () => {
    const voices = listGuitarVoices();
    const lines = [
      `# Guitar Voices`,
      ``,
      `${voices.length} voices available. Use \`play_song\` with \`engine: "guitar"\` and \`guitarVoice\` parameter.`,
      ``,
    ];

    for (const v of voices) {
      const isDefault = v.id === "steel-dreadnought" ? " **(default)**" : "";
      lines.push(`## ${v.name}${isDefault}`);
      lines.push(`**ID:** \`${v.id}\``);
      lines.push(`${v.description}`);
      lines.push(`**Best for:** ${v.suggestedFor.join(", ")}`);
      lines.push(`**Pluck position:** ${v.pluckPosition} | **Body resonance:** ${v.bodyResonanceFreq} Hz | **Partials:** up to ${v.maxPartials}`);
      lines.push(``);
    }

    lines.push(`---`);
    lines.push(`*Available tunings: ${GUITAR_TUNING_IDS.join(", ")}*`);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: list_guitar_tunings ────────────────────────────────────────────

registerTool(
  "list_guitar_tunings",
  "List available guitar tuning systems (standard, drop-D, open G, DADGAD, etc.). Shows open string MIDI note numbers for each tuning.",
  {},
  async () => {
    const lines = [
      `# Guitar Tunings`,
      ``,
      `${GUITAR_TUNING_IDS.length} tunings available.`,
      ``,
    ];

    for (const id of GUITAR_TUNING_IDS) {
      const t = GUITAR_TUNINGS[id];
      const noteNames = t.openStrings.map(n => {
        const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
        return names[n % 12] + Math.floor(n / 12 - 1);
      });
      const isDefault = id === "standard" ? " **(default)**" : "";
      lines.push(`## ${t.name}${isDefault}`);
      lines.push(`**ID:** \`${id}\``);
      lines.push(`${t.description}`);
      lines.push(`**Open strings:** ${noteNames.join(" ")} (MIDI: ${t.openStrings.join(", ")})`);
      lines.push(``);
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: tune_guitar ────────────────────────────────────────────────────

registerTool(
  "tune_guitar",
  "Tune a guitar voice by adjusting synthesis parameters. Changes are saved and persist across sessions. Use get_guitar_config to see current settings, reset_guitar to restore factory defaults.",
  {
    id: z.enum(GUITAR_VOICE_IDS as readonly [string, ...string[]]).describe("Guitar voice ID to tune"),
    "pluck-position": z.number().min(0.05).max(0.50).optional().describe("Pluck position along string (0=bridge, 0.5=middle). Defines harmonic content."),
    "pluck-noise": z.number().min(0).max(0.5).optional().describe("Pluck attack noise intensity (0=none)"),
    brightness: z.number().min(0.05).max(0.5).optional().describe("Brightness at moderate velocity (lower=brighter)"),
    "brightness-slope": z.number().min(0.03).max(0.2).optional().describe("Velocity sensitivity for upper partials"),
    decay: z.number().min(0.5).max(10).optional().describe("Sustain length in seconds (treble end)"),
    "bass-decay": z.number().min(1).max(15).optional().describe("Additional sustain for bass strings in seconds"),
    "body-freq": z.number().min(60).max(8000).optional().describe("Body resonance frequency (Hz)"),
    "body-q": z.number().min(0.5).max(12).optional().describe("Body resonance Q factor"),
    "body-gain": z.number().min(0).max(15).optional().describe("Body resonance boost (dB)"),
    "odd-boost": z.number().min(1.0).max(2.0).optional().describe("Odd harmonic emphasis (1.0=neutral)"),
    detune: z.number().min(0).max(15).optional().describe("Intonation spread in cents"),
    stereo: z.number().min(0).max(1).optional().describe("Stereo width (0=mono, 1=full)"),
    volume: z.number().min(0.05).max(0.5).optional().describe("Per-voice volume"),
    release: z.number().min(0.01).max(0.3).optional().describe("Mute speed in seconds"),
    rolloff: z.number().min(0.3).max(1.5).optional().describe("Harmonic darkness (higher=darker)"),
    "attack-fast": z.number().min(0.0002).max(0.005).optional().describe("Fastest attack (ff) in seconds"),
    "attack-slow": z.number().min(0.001).max(0.01).optional().describe("Slowest attack (pp) in seconds"),
  },
  async (params) => {
    const { id, ...tuningParams } = params;

    const overrides: GuitarUserTuning = {};
    for (const [key, val] of Object.entries(tuningParams)) {
      if (val !== undefined) overrides[key] = val as number;
    }

    if (Object.keys(overrides).length === 0) {
      return {
        content: [{ type: "text", text: `No tuning parameters provided. Available: ${GUITAR_TUNING_PARAMS.map(p => p.key).join(", ")}` }],
        isError: true,
      };
    }

    try {
      saveGuitarUserTuning(id, overrides);
    } catch (err) {
      return fsErrorResult(err, `save tuning for "${id}"`);
    }
    const merged = getMergedGuitarVoice(id)!;
    const userTuning = loadGuitarUserTuning(id);

    const lines = [
      `Tuned **${merged.name}** (\`${id}\`):`,
      ``,
    ];
    for (const [key, val] of Object.entries(overrides)) {
      const param = GUITAR_TUNING_PARAMS.find(p => p.key === key);
      lines.push(`- **${key}**: ${val}${param ? ` — ${param.description}` : ""}`);
    }
    lines.push(``, `${Object.keys(userTuning).length} total override(s) saved. Use \`reset_guitar\` to restore factory defaults.`);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: get_guitar_config ──────────────────────────────────────────────

registerTool(
  "get_guitar_config",
  "Show the full configuration of a guitar voice, including any user tuning overrides. Shows factory preset values and custom adjustments.",
  {
    id: z.enum(GUITAR_VOICE_IDS as readonly [string, ...string[]]).describe("Guitar voice ID to inspect"),
  },
  async ({ id }) => {
    const base = getGuitarVoice(id)!;
    const userTuning = loadGuitarUserTuning(id);
    const merged = getMergedGuitarVoice(id)!;
    const hasOverrides = Object.keys(userTuning).length > 0;

    const lines = [
      `# ${merged.name} (\`${id}\`)`,
      `${merged.description}`,
      `**Best for:** ${merged.suggestedFor.join(", ")}`,
      ``,
      `## Tunable Parameters`,
      ``,
      `| Parameter | Factory | Current | Range |`,
      `|-----------|---------|---------|-------|`,
    ];

    for (const param of GUITAR_TUNING_PARAMS) {
      let factoryVal: number;
      let currentVal: number;
      const baseRec = base as unknown as Record<string, unknown>;
      const mergedRec = merged as unknown as Record<string, unknown>;
      if (param.isArrayIndex !== undefined) {
        factoryVal = (baseRec[param.configKey] as number[])[param.isArrayIndex];
        currentVal = (mergedRec[param.configKey] as number[])[param.isArrayIndex];
      } else {
        factoryVal = baseRec[param.configKey] as number;
        currentVal = mergedRec[param.configKey] as number;
      }
      const isOverridden = param.key in userTuning;
      const marker = isOverridden ? " *" : "";
      lines.push(`| ${param.key} | ${factoryVal} | ${currentVal}${marker} | ${param.min}–${param.max} |`);
    }

    if (hasOverrides) {
      lines.push(``, `*\\* = user override*`);
      lines.push(``, `Use \`reset_guitar\` to clear all overrides.`);
    } else {
      lines.push(``, `*No user overrides. Using factory preset.*`);
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: reset_guitar ──────────────────────────────────────────────────

registerTool(
  "reset_guitar",
  "Reset a guitar voice to factory default settings, clearing all user tuning overrides.",
  {
    id: z.enum(GUITAR_VOICE_IDS as readonly [string, ...string[]]).describe("Guitar voice ID to reset"),
  },
  async ({ id }) => {
    const hadOverrides = Object.keys(loadGuitarUserTuning(id)).length > 0;
    try {
      resetGuitarUserTuning(id);
    } catch (err) {
      return fsErrorResult(err, `reset tuning for "${id}"`);
    }
    const voice = getGuitarVoice(id)!;

    if (hadOverrides) {
      return { content: [{ type: "text", text: `Reset **${voice.name}** (\`${id}\`) to factory defaults. All guitar tuning overrides cleared.` }] };
    }
    return { content: [{ type: "text", text: `**${voice.name}** (\`${id}\`) was already at factory defaults.` }] };
  }
);

// ─── Tool: playback_status ────────────────────────────────────────────────

registerTool(
  "playback_status",
  "Get a real-time snapshot of the current playback state: measure, tempo, speed, keyboard voice, and more. Returns nothing if no song is playing.",
  {},
  async () => {
    // A running practice loop has its own dedicated status tool (richer:
    // pass number, ramp progress, per-measure diagnostic) — point there
    // instead of reporting "no active playback" while one is actually running.
    if (activePracticeLoop?.getState().status === "running") {
      return { content: [{ type: "text", text: "A practice loop is running. Use `practice_status` for its progress." }] };
    }

    // Library song session
    if (activeSession) {
      const s = activeSession.session;
      const state = activeSession.state;
      const song = s.song;
      const measure = activeSession.currentMeasureDisplay;
      const total = activeSession.totalMeasures;
      const effectiveTempo = activeSession.effectiveTempo();
      const baseTempo = activeSession.baseTempo();
      const speed = s.speed;

      const measurePercent = total > 0 ? Math.round((measure / total) * 100) : 0;

      const lines = [
        `# Playback Status`,
        ``,
        `- **Song:** ${song.title}${song.composer ? ` — ${song.composer}` : ""}`,
        `- **State:** ${state}`,
        `- **Keyboard:** ${activeVoiceId}`,
        `- **Measure:** ${measure} / ${total} (${measurePercent}%)`,
        `- **Tempo:** ${baseTempo} BPM × ${speed}x = ${effectiveTempo} BPM`,
        `- **Key:** ${song.key} | **Time:** ${song.timeSignature}`,
        `- **Mode:** ${s.mode}`,
        `- **Measures played:** ${s.measuresPlayed}`,
      ];

      // Current measure info
      if (measure > 0 && measure <= song.measures.length) {
        const m = song.measures[measure - 1];
        if (m.dynamics) lines.push(`- **Dynamics:** ${m.dynamics}`);
        if (m.teachingNote) lines.push(`- **Teaching:** ${m.teachingNote}`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    // MIDI file playback
    if (activeController) {
      const state = activeController.state;
      const pos = activeController.positionSeconds;
      const events = activeController.eventsPlayed;
      const total = activeController.totalEvents;
      const speed = activeController.speed;

      const eventPercent = total > 0 ? Math.round((events / total) * 100) : 0;

      const lines = [
        `# Playback Status (MIDI)`,
        ``,
        `- **State:** ${state}`,
        `- **Keyboard:** ${activeVoiceId}`,
        `- **Position:** ${pos.toFixed(1)}s`,
        `- **Events:** ${events} / ${total} (${eventPercent}%)`,
        `- **Speed:** ${speed}x`,
      ];

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }

    if (activeMidiEngine) {
      return { content: [{ type: "text", text: `Playback active (MIDI engine, no detailed status available).` }] };
    }

    if (lastPlaybackError) {
      const e = lastPlaybackError;
      const whereLine = e.measure !== undefined
        ? `\n**Failed at:** measure ${e.measure}`
        : e.positionSeconds !== undefined
          ? `\n**Failed at:** ${e.positionSeconds.toFixed(1)}s`
          : "";
      return { content: [{ type: "text", text: `No active playback.\n\n**Last error:** ${e.message}\n**Source:** ${e.songOrFile}${whereLine}\n**When:** ${e.timestamp}\n\nUse \`play_song\` to try again.` }] };
    }

    return { content: [{ type: "text", text: `No active playback. Use \`play_song\` to start playing.` }] };
  }
);

// ─── Tool: save_practice_note ──────────────────────────────────────────────

registerTool(
  "save_practice_note",
  "Save a practice journal entry. Combines your reflections with auto-captured session data (what you just played, speed, measures, duration). The journal persists across sessions — next time, use read_practice_journal to pick up where you left off.",
  {
    note: z.string().describe("Your reflection — what you learned, what you noticed, what to try next. Write naturally, like a musician's notebook."),
    song_id: z.string().optional().describe("Override which song this entry is about (defaults to the last song you played)"),
  },
  async ({ note, song_id }) => {
    // Resolve session: use override song_id or fall back to last played
    let session = lastCompletedSession;

    if (song_id) {
      const song = getSong(song_id);
      if (song) {
        session = {
          songId: song.id,
          title: song.title,
          composer: song.composer,
          genre: song.genre,
          difficulty: song.difficulty,
          key: song.key,
          tempo: song.tempo,
          speed: 1.0,
          mode: "note",
          measuresPlayed: 0,
          totalMeasures: song.measures.length,
          durationSeconds: 0,
          timestamp: new Date().toISOString(),
        };
      }
    }

    const entry = buildJournalEntry(session, note);
    let filepath: string;
    try {
      filepath = appendJournalEntry(entry);
    } catch (err) {
      return fsErrorResult(err, "save practice journal entry");
    }
    const stats = journalStats();

    return {
      content: [{
        type: "text",
        text: `Journal entry saved to ${filepath}\n` +
          `Total: ${stats.totalEntries} entries across ${stats.totalDays} day(s).\n\n` +
          `---\n${entry}`,
      }],
    };
  }
);

// ─── Tool: read_practice_journal ────────────────────────────────────────────

registerTool(
  "read_practice_journal",
  "Read your practice journal — reflections, observations, and session history from previous sessions. Use this at the start of a session to remember what you learned before, or to review notes on a specific song.",
  {
    days: z.number().int().min(1).max(90).optional().describe("How many days back to read (default: 7)"),
    song_id: z.string().optional().describe("Filter entries to a specific song"),
  },
  async ({ days, song_id }) => {
    const journal = readJournal(days ?? 7, song_id);
    const stats = journalStats();

    if (stats.totalEntries === 0) {
      return {
        content: [{
          type: "text",
          text: "No practice journal entries yet. Play a song and use `save_practice_note` to start your journal.",
        }],
      };
    }

    return {
      content: [{
        type: "text",
        text: `Practice journal (${stats.totalEntries} entries across ${stats.totalDays} days):\n\n${journal}`,
      }],
    };
  }
);

// ─── Tool: annotate_song ──────────────────────────────────────────────────

registerTool(
  "annotate_song",
  "Annotate a raw song with musical language and promote it to 'ready' status. This is how you do your homework — study the exemplar in the genre, then write your own annotation for a raw song. Once annotated, the song becomes playable immediately.",
  {
    song_id: z.string().describe("The song ID to annotate (must be a raw or annotated song in the library)"),
    description: z.string().describe("1-3 sentence musical description of the piece"),
    structure: z.string().describe("Form/structure description (e.g. 'AABA 32-bar form', '12-bar blues')"),
    key_moments: z.array(z.string()).min(1).max(5).describe("Notable musical moments (1-5 items)"),
    teaching_goals: z.array(z.string()).min(1).max(5).describe("What this song teaches (1-5 items)"),
    style_tips: z.array(z.string()).min(1).max(5).describe("How to play it authentically (1-5 items)"),
  },
  async ({ song_id, description, structure, key_moments, teaching_goals, style_tips }) => {
    // Find the config file in the library
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const libraryDir = join(__dirname, "..", "songs", "library");

    // Scan library for this song
    const entries = scanLibrary(libraryDir);
    const entry = entries.find(e => e.config.id === song_id);

    if (!entry) {
      return {
        content: [{ type: "text", text: `Song "${song_id}" not found in the library.` }],
        isError: true,
      };
    }

    // Update the config JSON
    const config = entry.config;
    config.status = "ready";
    config.musicalLanguage = {
      description,
      structure,
      keyMoments: key_moments,
      teachingGoals: teaching_goals,
      styleTips: style_tips,
    };

    // Write back to disk. Best-effort: entry.configPath lives inside the
    // installed package's own songs/library/ directory, which can be
    // read-only (root-owned global installs, read-only container
    // filesystems). A failure here must not block the durable save to the
    // user's own directory below (F-a53c900d).
    try {
      writeFileSync(entry.configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
    } catch (err) {
      console.error(`WARNING: could not update library config at ${entry.configPath} (likely a read-only package install): ${err instanceof Error ? err.message : String(err)}`);
    }

    // Re-ingest so the song is immediately playable
    try {
      const song = ingestSong(entry);
      registerSong(song);

      // Persist to user directory so annotations survive package updates
      const userDir = getUserSongsDir();
      const userPath = saveSong(song, userDir);

      return {
        content: [{
          type: "text",
          text: `Song "${config.title}" annotated and promoted to ready!\n` +
            `Genre: ${config.genre} | Key: ${config.key} | ${song.measures.length} measures\n` +
            `Persisted to: ${userPath}\n` +
            `The song is now playable — try \`play_song { id: "${song_id}" }\``,
        }],
      };
    } catch (err) {
      const result = fsErrorResult(err, `finish annotating "${song_id}" (ingest/persist)`);
      result.content[0].text += `\n\nThe config was updated at ${entry.configPath}. Check the MIDI file.`;
      return result;
    }
  }
);

// ─── Tool: score_performance ──────────────────────────────────────────────

registerTool(
  "score_performance",
  "Score a MIDI performance against a song from the library. Compares note-by-note: pitch accuracy, timing, missed notes, and extra notes. Returns a structured assessment with metrics and practice suggestions. Use this after recording yourself playing a song to see how you did.",
  {
    song_id: z.string().describe("Song ID to compare against (e.g. 'fur-elise')"),
    midi_path: z.string().describe("Path to the recorded performance .mid file"),
    tolerance_ms: z.number().min(10).max(500).optional()
      .describe("Timing tolerance in ms (default 150). Lower = stricter grading."),
    bpm: z.number().min(10).max(400).optional()
      .describe("Override BPM for scoring (default: song's tempo). Use if you played at a different speed."),
  },
  async ({ song_id, midi_path, tolerance_ms, bpm }) => {
    const song = getSong(song_id);
    if (!song) {
      return {
        content: [{ type: "text", text: `No song called "${song_id}" in the library. Try list_songs to browse.` }],
        isError: true,
      };
    }

    // Path traversal protection — same containment as play_song/import_midi
    const resolvedPath = pathResolve(midi_path);
    if (!resolvedPath.endsWith(".mid") && !resolvedPath.endsWith(".midi")) {
      return {
        content: [{ type: "text", text: "That doesn't look like a MIDI file — the path should end with .mid or .midi." }],
        isError: true,
      };
    }

    const scoreHomeDir = getCanonicalHomeDir();
    const safePath = scoreHomeDir ? resolveContainedExistingPath(resolvedPath, scoreHomeDir) : null;
    if (!safePath) {
      return {
        content: [{ type: "text", text: `Can't access that file — for safety, MIDI files must be inside your home directory.` }],
        isError: true,
      };
    }

    try {
      const parsed = await parseMidiFile(safePath);

      const result = scorePerformance(song, parsed.events, {
        toleranceMs: tolerance_ms,
        bpm,
      });
      // Feeds view_scored_piano_roll — "the last scored take" isn't only
      // score_last_take's; an ad-hoc score_performance call counts too.
      lastScoredTake = { song, result };

      const summary = [
        `# Performance Assessment: ${result.songTitle}`,
        "",
        `**Overall Score: ${result.metrics.overallScore}/100**`,
        `- Pitch accuracy: ${result.metrics.pitchAccuracy}%`,
        `- Timing accuracy: ±${result.metrics.timingAccuracyMs}ms`,
        `- Completeness: ${result.metrics.completeness}%`,
        `- Notes played: ${result.details.totalPlayed} (expected: ${result.details.totalExpected})`,
        `- Matched: ${result.details.matched} | Missed: ${result.details.missed.length} | Extra: ${result.metrics.extraNoteCount}`,
        "",
        result.feedback,
      ].join("\n");

      return { content: [{ type: "text", text: summary }] };
    } catch (err) {
      return {
        content: [{
          type: "text",
          text: `Failed to score performance: ${err instanceof Error ? err.message : String(err)}`,
        }],
        isError: true,
      };
    }
  }
);

// ─── Tool: score_last_take ──────────────────────────────────────────────────

registerTool(
  "score_last_take",
  "Score the most recently recorded take — from play_song with record:true, or the latest practice_loop pass — against the song (or drilled measure range, for a practice pass). Returns metrics, a per-measure diagnostic, and the full feedback assessment. No MIDI file needed.",
  {},
  async () => {
    if (!lastRecording) {
      return {
        content: [{ type: "text", text: "No recorded take yet. Use `play_song` with record:true, or `practice_loop`, then try again." }],
        isError: true,
      };
    }

    // "loop" mode repeats its measure range indefinitely until stopped,
    // concatenating every iteration onto ONE continuous recording timeline
    // (session.ts's play() — the recording clock resets only on a fresh
    // start, never between loop iterations). There's no single-pass span to
    // score that against: windowing to the loop's range would only line up
    // with the FIRST iteration, and every later iteration's notes would
    // misread as extra/duplicate. Refuse outright rather than mis-scoring.
    if (lastRecording.mode === "loop") {
      const jamErr = new JamError({
        code: "INPUT_INVALID_ARGS",
        message: "The last recording was a loop-mode take — loop mode repeats its range on one continuous timeline, so there's no single pass to score.",
        hint: "loop-mode takes accumulate multiple passes — use practice_loop for scored looping, or record with mode:'full'",
      });
      return { content: [{ type: "text", text: jamErr.toUserString() }], isError: true };
    }

    const song = getSong(lastRecording.songId);
    if (!song) {
      return {
        content: [{ type: "text", text: `The song for the last recording ("${lastRecording.songId}") is no longer in the library.` }],
        isError: true,
      };
    }

    // A practice-loop pass's recording is relative to the drilled range, not
    // the whole song (see practice-loop.ts's windowSong doc) — score it
    // against the SAME windowed sub-song the pass itself was scored
    // against, or the misalignment would flood the result with false
    // "missed" notes for measures that were never meant to be played.
    const scoringSong = lastRecording.range
      ? windowSong(song, lastRecording.range[0], lastRecording.range[1])
      : song;
    const result = scorePerformance(scoringSong, lastRecording.recording.events, {
      bpm: lastRecording.recording.nominalBpm,
    });
    lastScoredTake = { song: scoringSong, result };

    const diagnostics = measureDiagnostics(result);
    const lines = [`# Scored Take: ${result.songTitle}`];
    if (lastRecording.range) {
      lines.push(`Range: measures ${lastRecording.range[0]}–${lastRecording.range[1]}`);
    }
    lines.push(
      ``,
      `**Overall Score:** ${result.metrics.overallScore}/100`,
      `- Pitch accuracy: ${result.metrics.pitchAccuracy}%`,
      `- Timing accuracy: ±${result.metrics.timingAccuracyMs}ms`,
      `- Completeness: ${result.metrics.completeness}%`,
      `- Notes: ${result.details.matched}/${result.details.totalExpected} matched, ${result.metrics.extraNoteCount} extra`,
    );
    if (diagnostics.length > 0) {
      lines.push(``, `### Per-measure diagnostic`, ...formatMeasureDiagnosticLines(diagnostics));
    }
    lines.push(``, result.feedback);
    lines.push(``, `Use \`view_scored_piano_roll\` to see it on the piano roll.`);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: score_annotation ──────────────────────────────────────────────

registerTool(
  "score_annotation",
  "Score the quality of a song's annotation (musicalLanguage) against exemplar standards. Evaluates completeness, depth, specificity, teaching value, and musical vocabulary. Use this after annotating a raw song to check your work before moving on.",
  {
    song_id: z.string().describe("Song ID to evaluate (must have musicalLanguage)"),
  },
  async ({ song_id }) => {
    const song = getSong(song_id);
    if (!song) {
      return {
        content: [{ type: "text", text: `No song called "${song_id}" in the library. Try list_songs to browse.` }],
        isError: true,
      };
    }

    if (!song.musicalLanguage) {
      return {
        content: [{
          type: "text",
          text: `Song "${song.title}" has no annotation (musicalLanguage). Use annotate_song to annotate it first.`,
        }],
        isError: true,
      };
    }

    const result = scoreAnnotation(song.musicalLanguage);
    const text = formatAnnotationScore(result, song.title);

    return { content: [{ type: "text", text }] };
  }
);

// ─── Tool: annotation_progress ──────────────────────────────────────────────

registerTool(
  "annotation_progress",
  "Show annotation progress for the song library — how many songs are raw (unannotated), annotated, or ready, broken down by genre. Use this to see which genres still need work and pick your next annotation target.",
  {},
  async () => {
    const { dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const libraryDir = pathJoin(__dirname, "..", "songs", "library");

    const progress = getLibraryProgress(libraryDir);

    const lines: string[] = [];
    lines.push(`# Library Annotation Progress`);
    lines.push("");
    lines.push(`**Total: ${progress.total} songs** — ${progress.ready} ready, ${progress.annotated} annotated, ${progress.raw} raw`);
    lines.push(`**Completion: ${Math.round((progress.ready / Math.max(1, progress.total)) * 100)}%**`);
    lines.push("");
    lines.push("| Genre | Ready | Annotated | Raw | Total |");
    lines.push("|-------|-------|-----------|-----|-------|");

    for (const [genre, gp] of Object.entries(progress.byGenre)) {
      lines.push(`| ${genre} | ${gp.ready} | ${gp.annotated} | ${gp.raw} | ${gp.total} |`);
    }

    lines.push("");

    // List raw songs as targets
    const rawSongs: string[] = [];
    for (const [genre, gp] of Object.entries(progress.byGenre)) {
      for (const s of gp.songs) {
        if (s.status === "raw") rawSongs.push(`${s.id} (${genre})`);
      }
    }

    if (rawSongs.length > 0) {
      lines.push(`### Next annotation targets (${rawSongs.length} raw songs)`);
      for (const s of rawSongs.slice(0, 20)) {
        lines.push(`- ${s}`);
      }
      if (rawSongs.length > 20) {
        lines.push(`- ...and ${rawSongs.length - 20} more`);
      }
    }

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: compare_songs ──────────────────────────────────────────────────

registerTool(
  "compare_songs",
  "Compare two songs to find shared harmonic, structural, and rhythmic patterns. Surfaces cross-genre connections and teaching opportunities. Use this to understand how different pieces relate musically.",
  {
    song_a: z.string().describe("First song ID (e.g. 'fur-elise')"),
    song_b: z.string().describe("Second song ID (e.g. 'autumn-leaves')"),
  },
  async ({ song_a, song_b }) => {
    const a = getSong(song_a);
    if (!a) {
      return {
        content: [{ type: "text", text: `No song called "${song_a}" in the library. Try list_songs to browse.` }],
        isError: true,
      };
    }
    const b = getSong(song_b);
    if (!b) {
      return {
        content: [{ type: "text", text: `No song called "${song_b}" in the library. Try list_songs to browse.` }],
        isError: true,
      };
    }

    const result = compareSongs(a, b);
    const text = formatComparison(result);

    return { content: [{ type: "text", text }] };
  }
);

// ─── Tool: list_sections ─────────────────────────────────────────────────

registerTool(
  "list_sections",
  "List the structural sections of a song (Intro, Verse, Chorus, etc.). Sections help with navigation, practice planning, and understanding song form.",
  {
    id: z.string().describe("Song ID"),
  },
  async ({ id }) => {
    const song = getSong(id);
    if (!song) {
      return {
        content: [{ type: "text", text: `No song called "${id}" in the library. Try list_songs to browse.` }],
        isError: true,
      };
    }

    if (!song.sections || song.sections.length === 0) {
      return {
        content: [{
          type: "text",
          text: [
            `**${song.title}** has no section markers yet.`,
            ``,
            `Use \`add_section\` to label parts of the song (e.g., Intro, Verse, Chorus).`,
            `The song has ${song.measures.length} measures total.`,
          ].join("\n"),
        }],
      };
    }

    const lines = [
      `# ${song.title} — Sections`,
      ``,
      `| Section | Measures | Description |`,
      `|---------|----------|-------------|`,
    ];

    for (const s of song.sections) {
      const desc = s.description ?? "";
      lines.push(`| ${s.name} | ${s.startMeasure}–${s.endMeasure} | ${desc} |`);
    }

    lines.push(``, `Total: ${song.measures.length} measures, ${song.sections.length} sections.`);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: add_section ──────────────────────────────────────────────────

registerTool(
  "add_section",
  "Add a structural section marker to a song. Sections label parts like Intro, Verse, Chorus, Bridge, Coda — useful for teaching, navigation, and practice planning.",
  {
    id: z.string().describe("Song ID"),
    name: z.string().min(1).max(50).describe("Section label (e.g., 'Intro', 'Verse 1', 'Chorus', 'Bridge')"),
    startMeasure: z.number().int().min(1).describe("First measure of this section (1-based)"),
    endMeasure: z.number().int().min(1).describe("Last measure of this section (1-based)"),
    description: z.string().max(200).optional().describe("Optional description for teaching context"),
  },
  async ({ id, name: sectionName, startMeasure, endMeasure, description }) => {
    const song = getSong(id);
    if (!song) {
      return {
        content: [{ type: "text", text: `No song called "${id}" in the library. Try list_songs to browse.` }],
        isError: true,
      };
    }

    if (endMeasure < startMeasure) {
      return {
        content: [{ type: "text", text: `The end measure (${endMeasure}) needs to be at or after the start measure (${startMeasure}).` }],
        isError: true,
      };
    }

    if (startMeasure > song.measures.length || endMeasure > song.measures.length) {
      return {
        content: [{ type: "text", text: `This song only has ${song.measures.length} measures. Adjust the range to fit.` }],
        isError: true,
      };
    }

    if (!song.sections) song.sections = [];

    song.sections.push({
      name: sectionName,
      startMeasure,
      endMeasure,
      description,
    });

    // Sort sections by start measure
    song.sections.sort((a, b) => a.startMeasure - b.startMeasure);

    // Persist so the section survives a server restart — matches
    // add_song/import_midi/annotate_song, which all call saveSong after
    // mutating registry state (F-5aec2e16).
    let filePath: string;
    try {
      filePath = saveSong(song, getUserSongsDir());
    } catch (saveErr) {
      const msg = saveErr instanceof Error ? saveErr.message : String(saveErr);
      return {
        content: [{
          type: "text",
          text: `Added section **${sectionName}** to **${song.title}** in memory, but failed to save to disk: ${msg}\n` +
            `The section is available for this session but will be lost on restart.`,
        }],
        isError: true,
      };
    }

    return {
      content: [{
        type: "text",
        text: [
          `Added section **${sectionName}** to **${song.title}** (measures ${startMeasure}–${endMeasure}).`,
          ``,
          `The song now has ${song.sections.length} section(s). Use \`list_sections\` to see them all.`,
          `Saved to: ${filePath}`,
        ].join("\n"),
      }],
    };
  }
);

// ─── Tool: transpose_song ────────────────────────────────────────────────

registerTool(
  "transpose_song",
  "Transpose a song to a different key. Shifts all notes by the specified number of semitones and registers the transposed version as a new song. Useful for matching student range or practicing in different keys.",
  {
    id: z.string().describe("Song ID to transpose"),
    semitones: z.number().int().min(-12).max(12).describe("Semitones to shift: positive = up, negative = down (e.g., 2 = up a whole step, -3 = down a minor third)"),
  },
  async ({ id, semitones }) => {
    const song = getSong(id);
    if (!song) {
      return {
        content: [{ type: "text", text: `No song called "${id}" in the library. Try list_songs to browse.` }],
        isError: true,
      };
    }

    if (semitones === 0) {
      return {
        content: [{ type: "text", text: `No transposition needed — the song is already in ${song.key}.` }],
      };
    }

    try {
      const transposed = transposeSong(song, semitones);

      // Check if already registered
      if (getSong(transposed.id)) {
        return {
          content: [{
            type: "text",
            text: `This transposition already exists as "${transposed.id}" in ${transposed.key}.`,
          }],
        };
      }

      registerSong(transposed);

      // Persist so the transposed song survives a server restart — matches
      // add_song/import_midi/annotate_song. Without this, "The transposed
      // version is now playable" was false the moment the process
      // restarted (F-a4c5e9b7).
      let filePath: string;
      try {
        filePath = saveSong(transposed, getUserSongsDir());
      } catch (saveErr) {
        const msg = saveErr instanceof Error ? saveErr.message : String(saveErr);
        return {
          content: [{
            type: "text",
            text: `Transposed **${song.title}** and registered "${transposed.id}" in memory, but failed to save to disk: ${msg}\n` +
              `The transposed version is available for this session but will be lost on restart.`,
          }],
          isError: true,
        };
      }

      const direction = semitones > 0 ? "up" : "down";
      return {
        content: [{
          type: "text",
          text: [
            `Transposed **${song.title}** ${direction} ${Math.abs(semitones)} semitone(s):`,
            ``,
            `- **Original key:** ${song.key}`,
            `- **New key:** ${transposed.key}`,
            `- **New ID:** ${transposed.id}`,
            `- **Measures:** ${transposed.measures.length}`,
            ``,
            `Saved to: ${filePath}`,
            `The transposed version is now playable — try \`play_song { id: "${transposed.id}" }\``,
          ].join("\n"),
        }],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Transposition failed: ${msg}` }],
        isError: true,
      };
    }
  }
);

// ─── Tool: server_info ───────────────────────────────────────────────────

registerTool(
  "server_info",
  "Get server capabilities, version, and available options at a glance — genres, difficulties, engines, voice presets, and tool count.",
  {},
  async () => {
    const stats = getStats();
    const lines = [
      `# ai-jam-sessions v${VERSION}`,
      ``,
      `**Songs loaded:** ${stats.totalSongs}`,
      `**Tools:** ${registeredToolCount}`,
      ``,
      `**Genres:** ${GENRES.join(", ")}`,
      `**Difficulties:** ${DIFFICULTIES.join(", ")}`,
      `**Sound engines:** ${ENGINE_IDS.join(", ")}`,
      `**Piano voices:** ${VOICE_IDS.join(", ")}`,
      `**Guitar voices:** ${GUITAR_VOICE_IDS.join(", ")}`,
      `**Tract voices:** ${TRACT_VOICE_IDS.join(", ")}`,
      ``,
      `**Playback modes:** full, measure, hands, loop`,
      `**Sing-along modes:** note-names, solfege, contour, syllables`,
      ``,
      `Get started: \`list_songs\` to browse, \`song_info\` for details, \`play_song\` to listen.`,
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: validate_song_entry ──────────────────────────────────────────

registerTool(
  "validate_song_entry",
  "Validate a SongEntry JSON without adding it to the registry. Use this to check if your song data is correct before calling add_song.",
  {
    song: z.string().describe("Full SongEntry JSON string to validate"),
  },
  async ({ song: songJson }) => {
    let parsed: SongEntry;
    try {
      parsed = JSON.parse(songJson, (key, value) => {
        if (key === "__proto__" || key === "constructor" || key === "prototype") return undefined;
        return value;
      }) as SongEntry;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Invalid JSON: ${msg}` }],
        isError: true,
      };
    }

    const errors = validateSong(parsed);
    if (errors.length > 0) {
      return {
        content: [{
          type: "text",
          text: `Validation found ${errors.length} issue(s):\n  - ${errors.join("\n  - ")}`,
        }],
        isError: true,
      };
    }

    return {
      content: [{
        type: "text",
        text: [
          `Song "${parsed.id}" is valid!`,
          ``,
          `- **Title:** ${parsed.title}`,
          `- **Genre:** ${parsed.genre} | **Difficulty:** ${parsed.difficulty}`,
          `- **Measures:** ${parsed.measures?.length ?? 0}`,
          `- **Key:** ${parsed.key} | **Tempo:** ${parsed.tempo} BPM`,
          ``,
          `Ready to add with \`add_song\`.`,
        ].join("\n"),
      }],
    };
  }
);

// ─── Helpers ─────────────────────────────────────────────────────────────

function getUserSongsDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return pathJoin(home, ".ai-jam-sessions", "songs");
}

const STATE_FILE = pathJoin(
  process.env.HOME ?? process.env.USERPROFILE ?? ".",
  ".ai-jam-sessions",
  "server-state.json"
);

// Bump this if SessionSnapshot's shape changes in a way that would make an
// older persisted server-state.json misleading (not just missing fields).
// loadSessionState() discards anything that doesn't match (B-B1-002).
const SERVER_STATE_SCHEMA_VERSION = 1;

/** Shape-check a persisted lastCompletedSession before trusting it (mirrors the song loader's validate-then-skip pattern in songs/loader.ts). */
function isValidSessionSnapshot(x: unknown): x is SessionSnapshot {
  if (typeof x !== "object" || x === null) return false;
  const s = x as Record<string, unknown>;
  return (
    typeof s.songId === "string" &&
    typeof s.title === "string" &&
    (s.composer === undefined || typeof s.composer === "string") &&
    typeof s.genre === "string" &&
    typeof s.difficulty === "string" &&
    typeof s.key === "string" &&
    typeof s.tempo === "number" &&
    typeof s.speed === "number" &&
    typeof s.mode === "string" &&
    typeof s.measuresPlayed === "number" &&
    typeof s.totalMeasures === "number" &&
    typeof s.durationSeconds === "number" &&
    typeof s.timestamp === "string"
  );
}

function persistSessionState(): void {
  if (!lastCompletedSession) return;
  try {
    mkdirSync(pathJoin(process.env.HOME ?? process.env.USERPROFILE ?? ".", ".ai-jam-sessions"), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify({ schemaVersion: SERVER_STATE_SCHEMA_VERSION, lastCompletedSession }, null, 2));
  } catch (err) {
    // This used to be a bare require("node:fs") in an ESM module — silently
    // threw ReferenceError on every call and was swallowed here, so session
    // state never actually persisted (F-43b426ba). Log so a regression like
    // that is visible instead of silent.
    console.error(`WARNING: failed to persist session state to ${STATE_FILE}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function loadSessionState(): void {
  try {
    if (!existsSync(STATE_FILE)) return;
    const data = JSON.parse(readFileSync(STATE_FILE, "utf8"));

    if (typeof data !== "object" || data === null) {
      console.error(`WARNING: ignoring ${STATE_FILE} — not a JSON object.`);
      return;
    }
    if (data.schemaVersion !== SERVER_STATE_SCHEMA_VERSION) {
      console.error(`WARNING: ignoring ${STATE_FILE} — schema version ${JSON.stringify(data.schemaVersion)} != ${SERVER_STATE_SCHEMA_VERSION} (old or corrupt file).`);
      return;
    }
    if (data.lastCompletedSession !== undefined) {
      if (isValidSessionSnapshot(data.lastCompletedSession)) {
        lastCompletedSession = data.lastCompletedSession;
      } else {
        console.error(`WARNING: ignoring lastCompletedSession in ${STATE_FILE} — doesn't match the expected shape.`);
      }
    }
  } catch (err) {
    console.error(`WARNING: failed to load session state from ${STATE_FILE}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ─── Start ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // On POSIX, re-exec into the stdio-purity supervisor before doing any real
  // work: it runs this server as an inner child with the native audio layer's
  // stray stdout writes quarantined to stderr and JSON-RPC split onto fd 3, so
  // the host's stdout can never be corrupted regardless of JACK state. See
  // src/stdio-supervisor.ts for the full rationale (dup2 is unavailable in
  // pure Node, so separation requires this one thin external process).
  if (shouldSuperviseStdio()) {
    runStdioSupervisor();
    return;
  }

  // Load songs from library + user directories
  const { dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const libraryDir = pathJoin(__dirname, "..", "songs", "library");
  const userDir = getUserSongsDir();
  initializeFromLibrary(libraryDir, userDir);
  loadSessionState();

  // Warn operator if the library dir is missing — common after a bad install
  if (!existsSync(libraryDir)) {
    console.error(
      "WARNING: Song library directory not found. The server will start but " +
      "no built-in songs will be available. Reinstall with: npm install -g @mcptoolshop/ai-jam-sessions"
    );
  }

  // JSON-RPC output target: fd 3 when running as the supervised inner server
  // (the supervisor wired fd 3 to the host's stdout), otherwise stdout. This
  // is what keeps fd 1 free for the native audio layer's stray prints.
  const transport = new StdioServerTransport(process.stdin, openRpcOutputStream());
  await server.connect(transport);
  console.error("ai-jam-sessions MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
