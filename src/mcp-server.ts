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
// Tools:
//   list_songs      — browse/search the song library
//   song_info       — get detailed info for a specific song (+ practice tips)
//   registry_stats  — get registry statistics
//   teaching_note   — get the teaching note for a specific measure
//   suggest_song    — get a song recommendation based on criteria
//   list_measures   — overview of measures with teaching notes
//   practice_setup  — suggest speed, mode, and voice settings for a song
//   sing_along      — get singable text (note names/solfege/contour/syllables) for measures
//   play_song       — play a song through VMPK via MIDI
//   stop_playback   — stop the currently playing song
// ─────────────────────────────────────────────────────────────────────────────

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { VERSION } from "./version.js";
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
  GENRES,
  DIFFICULTIES,
} from "./songs/index.js";
import type { SongEntry, Difficulty, Genre } from "./songs/types.js";
import { safeParseMeasure, measureToSingableText, type SingAlongMode } from "./note-parser.js";
import { renderPianoRoll } from "./piano-roll.js";
import { renderGuitarTab } from "./guitar-tab-roll.js";
import type { ParseWarning, PlaybackMode, SyncMode, VmpkConnector } from "./types.js";
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
import { createConsoleTeachingHook, composeTeachingHooks } from "./teaching.js";
import { parseMidiFile, parseMidiBuffer } from "./midi/parser.js";
import { MidiPlaybackEngine } from "./playback/midi-engine.js";
import { PlaybackController } from "./playback/controls.js";
import { createSingOnMidiHook } from "./teaching/sing-on-midi.js";
import { createMidiFeedbackHook } from "./teaching/midi-feedback.js";
import { createLiveMidiFeedbackHook } from "./teaching/live-midi-feedback.js";
import { scorePerformance } from "./score-performance.js";
import { scoreAnnotation, formatAnnotationScore } from "./annotation-scorer.js";
import { compareSongs, formatComparison } from "./song-compare.js";
import type { VoiceDirective, AsideDirective } from "./types.js";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync, realpathSync } from "node:fs";
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

// ─── Server ─────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "ai-jam-sessions",
  version: VERSION,
});

// ─── Practice Journal State ─────────────────────────────────────────────────

let lastCompletedSession: SessionSnapshot | null = null;

// ─── Tool: list_songs ───────────────────────────────────────────────────────

server.tool(
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

server.tool(
  "song_info",
  "Get detailed information about a specific song — musical language, teaching goals, key moments, structure.",
  {
    id: z.string().describe("Song ID (kebab-case, e.g. 'moonlight-sonata-mvt1')"),
  },
  async ({ id }) => {
    const song = getSong(id);
    if (!song) {
      return {
        content: [{ type: "text", text: `Song not found: "${id}". Use list_songs to see available songs.` }],
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

server.tool(
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

server.tool(
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
        content: [{ type: "text", text: `Song not found: "${id}"` }],
        isError: true,
      };
    }

    const m = song.measures[measure - 1];
    if (!m) {
      return {
        content: [{ type: "text", text: `Measure ${measure} not found (song has ${song.measures.length} measures)` }],
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

server.tool(
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

server.tool(
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
        content: [{ type: "text", text: `Song not found: "${id}"` }],
        isError: true,
      };
    }

    const start = Math.max(0, (startMeasure ?? 1) - 1);
    const end = Math.min((endMeasure ?? song.measures.length) - 1, song.measures.length - 1);
    if (start > end) {
      return {
        content: [{ type: "text", text: `Invalid measure range: ${startMeasure}–${endMeasure}. Song has ${song.measures.length} measures.` }],
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

// ─── Tool: practice_setup ──────────────────────────────────────────────────

server.tool(
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
        content: [{ type: "text", text: `Song not found: "${id}". Use list_songs to see available songs.` }],
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

server.tool(
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
        content: [{ type: "text", text: `Song not found: "${id}". Use list_songs to see available songs.` }],
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
        content: [{ type: "text", text: `Invalid measure range: ${startMeasure}–${endMeasure}. Song has ${song.measures.length} measures.` }],
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

/** Stop whatever is currently playing. */
async function stopActive(): Promise<void> {
  if (activeSession && activeSession.state === "playing") {
    activeSession.stop();
  }
  activeSession = null;

  if (activeMidiEngine && activeMidiEngine.state === "playing") {
    activeMidiEngine.stop();
  }
  activeMidiEngine = null;

  if (activeController && activeController.state === "playing") {
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

server.tool(
  "play_song",
  "Play a song through the built-in audio engine. Supports piano (default) and vocal engines. Accepts a library song ID or a path to a .mid file. Returns immediately with session info while playback runs in the background.",
  {
    id: z.string().describe("Song ID (e.g. 'autumn-leaves', 'let-it-be') OR path to a .mid file"),
    speed: z.number().min(0.1).max(4).optional().describe("Speed multiplier (0.5 = half speed, 1.0 = normal, 2.0 = double). Default: 1.0"),
    tempo: z.number().int().min(10).max(400).optional().describe("Override tempo in BPM (10-400). Default: song's tempo"),
    mode: z.enum(["full", "measure", "hands", "loop"]).optional().describe("Playback mode: full (default), measure (one at a time), hands (separate then together), loop"),
    startMeasure: z.number().int().min(1).optional().describe("Start measure for loop mode (1-based)"),
    endMeasure: z.number().int().min(1).optional().describe("End measure for loop mode (1-based)"),
    withSinging: z.boolean().optional().describe("Enable sing-along narration during playback (note-names by default). Default: false"),
    withTeaching: z.boolean().optional().describe("Enable live teaching feedback (encouragement, dynamics tips, difficulty warnings). Default: false"),
    singMode: z.enum(["note-names", "solfege", "contour", "syllables"]).optional().describe("Sing-along mode when withSinging is true. Default: note-names"),
    keyboard: z.enum(VOICE_IDS as unknown as [string, ...string[]]).optional().describe("Piano voice/keyboard: grand (default), upright, electric, honkytonk, musicbox, bright. Each has a different character suited to different genres."),
    engine: z.enum(["piano", "vocal", "tract", "guitar"]).optional().describe("Sound engine: 'piano' (default) plays piano, 'vocal' plays sustained vowel tones, 'tract' uses Pink Trombone vocal tract synthesis, 'guitar' plays physically-modeled guitar."),
    tractVoice: z.enum(TRACT_VOICE_IDS as unknown as [string, ...string[]]).optional().describe("Voice preset for tract engine: soprano (default), alto, tenor, bass. Only used when engine='tract'."),
    guitarVoice: z.enum(GUITAR_VOICE_IDS as unknown as [string, ...string[]]).optional().describe("Guitar voice preset: classical-nylon, steel-dreadnought (default), electric-clean, electric-jazz. Only used when engine='guitar'."),
  },
  async ({ id, speed, tempo, mode, startMeasure, endMeasure, withSinging, withTeaching, singMode, keyboard, engine, tractVoice, guitarVoice }) => {
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
        content: [{ type: "text", text: `Invalid MIDI file path: "${id}". Path must be within your home directory.` }],
        isError: true,
      };
    }

    const librarySong = isMidiFile ? null : getSong(id);

    if (!isMidiFile && !librarySong) {
      return {
        content: [{ type: "text", text: `Song not found: "${id}". Use list_songs to see available songs, or provide a path to a .mid file.` }],
        isError: true,
      };
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
    try {
      await connector.connect();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `${engine === "tract" ? "Tract" : engine === "vocal" ? "Vocal" : engine === "guitar" ? "Guitar" : "Piano"} engine failed to start: ${msg}` }],
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
          content: [{ type: "text", text: `Failed to parse MIDI file: ${msg}` }],
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

      hooks.push(createConsoleTeachingHook());
      const teachingHook = composeTeachingHooks(...hooks);

      // Use PlaybackController when hooks are active, raw engine otherwise
      if (withSinging || withTeaching) {
        const controller = new PlaybackController(connector, parsed);
        activeController = controller;

        const playPromise = controller.play({ speed: speed ?? 1.0, teachingHook });
        playPromise
          .then(() => {
            console.error(`Finished playing MIDI file: ${id} (${parsed.noteCount} notes, ${parsed.durationSeconds.toFixed(1)}s)`);
          })
          .catch((err) => {
            console.error(`Playback error: ${err instanceof Error ? err.message : String(err)}`);
          })
          .finally(() => {
            connector.disconnect().catch((e) => console.error(`Disconnect error: ${e instanceof Error ? e.message : String(e)}`));
            if (activeController === controller) activeController = null;
            if (activeConnector === connector) activeConnector = null;
          });
      } else {
        const engine = new MidiPlaybackEngine(connector, parsed);
        activeMidiEngine = engine;

        const playPromise = engine.play({ speed: speed ?? 1.0 });
        playPromise
          .then(() => {
            console.error(`Finished playing MIDI file: ${id} (${parsed.noteCount} notes, ${parsed.durationSeconds.toFixed(1)}s)`);
          })
          .catch((err) => {
            console.error(`Playback error: ${err instanceof Error ? err.message : String(err)}`);
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
        content: [{ type: "text", text: `Loop playback requires both startMeasure and endMeasure.` }],
        isError: true,
      };
    }
    if (startMeasure !== undefined && endMeasure !== undefined && endMeasure < startMeasure) {
      return {
        content: [{ type: "text", text: `Invalid loop range: endMeasure (${endMeasure}) must be >= startMeasure (${startMeasure}).` }],
        isError: true,
      };
    }

    const song = librarySong!;
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

    libHooks.push(createConsoleTeachingHook());
    const teachingHook = composeTeachingHooks(...libHooks);

    const syncMode = (withSinging && !withTeaching) ? "before" as SyncMode : "concurrent" as SyncMode;
    const session = createSession(song, connector, {
      mode: playbackMode,
      syncMode,
      speed,
      tempo,
      loopRange,
      teachingHook,
    });
    activeSession = session;

    // Play in background
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
        console.error(`Finished playing: ${song.title} (${session.session.measuresPlayed} measures)`);
      })
      .catch((err) => {
        console.error(`Playback error: ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => {
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
      lines.push(`- **Loop range:** measures ${loopRange[0]}–${loopRange[1]}`);
    }
    if (warnings.length > 0) {
      lines.push(``, `⚠ ${warnings.length} note(s) had parse warnings and will be skipped.`);
    }
    lines.push(``, `Use \`playback_status\` to check progress, \`stop_playback\` to stop. Playback runs in the background.`);
    lines.push(``, `Tip: After listening, use \`save_practice_note\` to record what you learned.`);

    return { content: [{ type: "text", text: lines.join("\n") }] };
  }
);

// ─── Tool: stop_playback ──────────────────────────────────────────────────

server.tool(
  "stop_playback",
  "Stop the currently playing song and disconnect MIDI.",
  {},
  async () => {
    const wasPlaying = activeSession || activeMidiEngine || activeController;
    if (!wasPlaying) {
      return {
        content: [{ type: "text", text: "No song is currently playing." }],
      };
    }

    const info = activeSession
      ? `${activeSession.session.song.title} (${activeSession.session.measuresPlayed} measures played)`
      : activeMidiEngine
        ? `MIDI file (${activeMidiEngine.eventsPlayed}/${activeMidiEngine.totalEvents} events played)`
        : activeController
          ? `MIDI file (${activeController.eventsPlayed}/${activeController.totalEvents} events played)`
          : "Unknown";

    await stopActive();

    return {
      content: [{ type: "text", text: `Stopped: ${info}` }],
    };
  }
);

// ─── Tool: pause_playback ─────────────────────────────────────────────────

server.tool(
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
      activeSession.pause();
      return {
        content: [{
          type: "text",
          text: `Paused (${activeSession.session.measuresPlayed} measures played).`,
        }],
      };
    }

    return { content: [{ type: "text", text: "No song is currently playing." }] };
  }
);

// ─── Tool: set_speed ──────────────────────────────────────────────────────

server.tool(
  "set_speed",
  "Change the playback speed of the currently playing song. Takes effect on the next note.",
  {
    speed: z.number().min(0.1).max(4).describe("New speed multiplier (0.1–4.0)"),
  },
  async ({ speed }) => {
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

// ─── Tool: ai_jam_sessions ──────────────────────────────────────────────

server.tool(
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
        content: [{ type: "text", text: "Provide either a songId or a genre. Use list_songs to browse, or pass a genre like \"jazz\" to jam on a random pick." }],
        isError: true,
      };
    }

    let song: SongEntry | undefined;
    if (songId) {
      song = getSong(songId);
      if (!song) {
        return {
          content: [{ type: "text", text: `Song not found: "${songId}". Use list_songs to see available songs.` }],
          isError: true,
        };
      }
    } else {
      const candidates = getSongsByGenre(genre as Genre);
      if (candidates.length === 0) {
        return {
          content: [{ type: "text", text: `No songs found in genre "${genre}". Use registry_stats to see available genres.` }],
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

server.tool(
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
            text: `Invalid song ID: "${parsed.id}". Must be kebab-case (a-z, 0-9, hyphens), no path separators.`,
          }],
          isError: true,
        };
      }

      const errors = validateSong(parsed);
      if (errors.length > 0) {
        return {
          content: [{
            type: "text",
            text: `Song validation failed:\n  - ${errors.join("\n  - ")}`,
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
      const userDir = getUserSongsDir();
      const filePath = saveSong(parsed, userDir);

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
      };
    }
  }
);

// ─── Tool: import_midi ──────────────────────────────────────────────────

server.tool(
  "import_midi",
  "Import a MIDI file as a song. Provide the file path and metadata. The MIDI is parsed, converted to a SongEntry, and saved to the user songs directory.",
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

// ─── Tool: view_piano_roll ─────────────────────────────────────────────────

server.tool(
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
        content: [{ type: "text" as const, text: `Song not found: "${songId}". Use list_songs to see available songs.` }],
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

// ─── Tool: view_guitar_tab ─────────────────────────────────────────────────

server.tool(
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
        content: [{ type: "text" as const, text: `Song not found: "${songId}". Use list_songs to see available songs.` }],
        isError: true,
      };
    }

    const html = renderGuitarTab(song, { startMeasure, endMeasure, tuning, tempo });

    // Write to temp file for browser viewing
    const { tmpdir } = await import("node:os");
    const { writeFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const tempPath = join(tmpdir(), `guitar-tab-${songId}.html`);
    writeFileSync(tempPath, html, "utf8");

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

server.tool(
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

server.tool(
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
        content: [{ type: "text", text: `No tuning parameters provided. Available: ${TUNING_PARAMS.map(p => p.key).join(", ")}` }],
        isError: true,
      };
    }

    saveUserTuning(id, overrides);
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

server.tool(
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

server.tool(
  "reset_keyboard",
  "Reset a keyboard voice to factory default settings, clearing all user tuning overrides.",
  {
    id: z.enum(VOICE_IDS as readonly [string, ...string[]]).describe("Voice ID to reset"),
  },
  async ({ id }) => {
    const hadOverrides = Object.keys(loadUserTuning(id)).length > 0;
    resetUserTuning(id);
    const voice = getVoice(id)!;

    if (hadOverrides) {
      return { content: [{ type: "text", text: `Reset **${voice.name}** (\`${id}\`) to factory defaults. All user tuning overrides cleared.` }] };
    }
    return { content: [{ type: "text", text: `**${voice.name}** (\`${id}\`) was already at factory defaults.` }] };
  }
);

// ─── Tool: list_guitar_voices ─────────────────────────────────────────────

server.tool(
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

server.tool(
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

server.tool(
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

    saveGuitarUserTuning(id, overrides);
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

server.tool(
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

server.tool(
  "reset_guitar",
  "Reset a guitar voice to factory default settings, clearing all user tuning overrides.",
  {
    id: z.enum(GUITAR_VOICE_IDS as readonly [string, ...string[]]).describe("Guitar voice ID to reset"),
  },
  async ({ id }) => {
    const hadOverrides = Object.keys(loadGuitarUserTuning(id)).length > 0;
    resetGuitarUserTuning(id);
    const voice = getGuitarVoice(id)!;

    if (hadOverrides) {
      return { content: [{ type: "text", text: `Reset **${voice.name}** (\`${id}\`) to factory defaults. All guitar tuning overrides cleared.` }] };
    }
    return { content: [{ type: "text", text: `**${voice.name}** (\`${id}\`) was already at factory defaults.` }] };
  }
);

// ─── Tool: playback_status ────────────────────────────────────────────────

server.tool(
  "playback_status",
  "Get a real-time snapshot of the current playback state: measure, tempo, speed, keyboard voice, and more. Returns nothing if no song is playing.",
  {},
  async () => {
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

    return { content: [{ type: "text", text: `No active playback. Use \`play_song\` to start playing.` }] };
  }
);

// ─── Tool: save_practice_note ──────────────────────────────────────────────

server.tool(
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
    const filepath = appendJournalEntry(entry);
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

server.tool(
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

server.tool(
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

    // Write back to disk
    writeFileSync(entry.configPath, JSON.stringify(config, null, 2) + "\n", "utf8");

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
      return {
        content: [{
          type: "text",
          text: `Annotation saved but ingestion failed: ${err instanceof Error ? err.message : String(err)}\n` +
            `The config was updated at ${entry.configPath}. Check the MIDI file.`,
        }],
        isError: true,
      };
    }
  }
);

// ─── Tool: score_performance ──────────────────────────────────────────────

server.tool(
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
        content: [{ type: "text", text: `Song not found: "${song_id}". Use list_songs to see available songs.` }],
        isError: true,
      };
    }

    // Path traversal protection — same containment as play_song/import_midi
    const resolvedPath = pathResolve(midi_path);
    if (!resolvedPath.endsWith(".mid") && !resolvedPath.endsWith(".midi")) {
      return {
        content: [{ type: "text", text: "Invalid path: must be a .mid or .midi file." }],
        isError: true,
      };
    }

    const scoreHomeDir = getCanonicalHomeDir();
    const safePath = scoreHomeDir ? resolveContainedExistingPath(resolvedPath, scoreHomeDir) : null;
    if (!safePath) {
      return {
        content: [{ type: "text", text: `Path not allowed: MIDI file must be inside your home directory.` }],
        isError: true,
      };
    }

    try {
      const parsed = await parseMidiFile(safePath);

      const result = scorePerformance(song, parsed.events, {
        toleranceMs: tolerance_ms,
        bpm,
      });

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

// ─── Tool: score_annotation ──────────────────────────────────────────────

server.tool(
  "score_annotation",
  "Score the quality of a song's annotation (musicalLanguage) against exemplar standards. Evaluates completeness, depth, specificity, teaching value, and musical vocabulary. Use this after annotating a raw song to check your work before moving on.",
  {
    song_id: z.string().describe("Song ID to evaluate (must have musicalLanguage)"),
  },
  async ({ song_id }) => {
    const song = getSong(song_id);
    if (!song) {
      return {
        content: [{ type: "text", text: `Song not found: "${song_id}". Use list_songs to see available songs.` }],
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

server.tool(
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

server.tool(
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
        content: [{ type: "text", text: `Song not found: "${song_a}". Use list_songs to see available songs.` }],
        isError: true,
      };
    }
    const b = getSong(song_b);
    if (!b) {
      return {
        content: [{ type: "text", text: `Song not found: "${song_b}". Use list_songs to see available songs.` }],
        isError: true,
      };
    }

    const result = compareSongs(a, b);
    const text = formatComparison(result);

    return { content: [{ type: "text", text }] };
  }
);

// ─── Helpers ─────────────────────────────────────────────────────────────

function getUserSongsDir(): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ".";
  return pathJoin(home, ".ai-jam-sessions", "songs");
}

// ─── Start ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Load songs from library + user directories
  const { dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const libraryDir = pathJoin(__dirname, "..", "songs", "library");
  const userDir = getUserSongsDir();
  initializeFromLibrary(libraryDir, userDir);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("ai-jam-sessions MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
