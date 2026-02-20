#!/usr/bin/env node
// ─── pianoai: CLI Entry Point ─────────────────────────────────────
//
// Usage:
//   pianoai                     # Show help
//   pianoai list                # List all songs
//   pianoai list --genre jazz   # List songs by genre
//   pianoai play <song-id>      # Play a song (built-in piano engine)
//   pianoai play <song-id> --midi  # Play via MIDI output
//   pianoai sing <song-id>      # Sing along — narrate notes during playback
//   pianoai info <song-id>      # Show song details
//   pianoai stats               # Registry stats
//   pianoai ports               # List available MIDI ports
// ─────────────────────────────────────────────────────────────────────────────

import {
  getAllSongs,
  getSong,
  getSongsByGenre,
  getStats,
  GENRES,
  initializeFromLibrary,
  getLibraryProgress,
} from "./songs/index.js";
import type { SongEntry, Genre } from "./songs/types.js";
import type { PlaybackProgress, PlaybackMode, SyncMode, VoiceDirective, AsideDirective, VmpkConnector } from "./types.js";
import type { SingAlongMode } from "./note-parser.js";
import { createAudioEngine } from "./audio-engine.js";
import { createVmpkConnector } from "./vmpk.js";
import {
  listVoices, getVoice, getMergedVoice, VOICE_IDS,
  TUNING_PARAMS, loadUserTuning, saveUserTuning, resetUserTuning,
  type PianoVoiceId, type UserTuning,
} from "./piano-voices.js";
import type { PianoRollColorMode } from "./piano-roll.js";
import { createSession } from "./session.js";
import { parseMidiFile } from "./midi/parser.js";
import { MidiPlaybackEngine } from "./playback/midi-engine.js";
import { PlaybackController } from "./playback/controls.js";
import { existsSync } from "node:fs";
import {
  createConsoleTeachingHook,
  createSingAlongHook,
  createLiveFeedbackHook,
  composeTeachingHooks,
} from "./teaching.js";
import { createSingOnMidiHook } from "./teaching/sing-on-midi.js";
import { createLiveMidiFeedbackHook } from "./teaching/live-midi-feedback.js";
import { PositionTracker } from "./playback/position.js";
import type { TeachingHook } from "./types.js";
import { renderPianoRoll } from "./piano-roll.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function printSongTable(songs: SongEntry[]): void {
  console.log(
    "\n" +
      padRight("ID", 28) +
      padRight("Title", 40) +
      padRight("Genre", 12) +
      padRight("Diff", 14) +
      "Measures"
  );
  console.log("─".repeat(100));
  for (const s of songs) {
    console.log(
      padRight(s.id, 28) +
        padRight(truncate(s.title, 38), 40) +
        padRight(s.genre, 12) +
        padRight(s.difficulty, 14) +
        String(s.measures.length)
    );
  }
  console.log(`\n${songs.length} song(s) found.\n`);
}

function printSongInfo(song: SongEntry): void {
  const ml = song.musicalLanguage;
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${song.title}`);
  console.log(`  ${song.composer ?? "Traditional"} | ${song.genre} | ${song.difficulty}`);
  console.log(`  Key: ${song.key} | Tempo: ${song.tempo} BPM | Time: ${song.timeSignature}`);
  console.log(`  Duration: ~${song.durationSeconds}s | Measures: ${song.measures.length}`);
  console.log(`${"═".repeat(60)}`);
  console.log(`\n${ml.description}\n`);
  console.log(`Structure: ${ml.structure}\n`);
  console.log("Key Moments:");
  for (const km of ml.keyMoments) {
    console.log(`  • ${km}`);
  }
  console.log("\nTeaching Goals:");
  for (const tg of ml.teachingGoals) {
    console.log(`  • ${tg}`);
  }
  console.log("\nStyle Tips:");
  for (const st of ml.styleTips) {
    console.log(`  • ${st}`);
  }
  console.log(`\nTags: ${song.tags.join(", ")}\n`);
}

/** Print a progress bar. */
function printProgress(progress: PlaybackProgress): void {
  const barWidth = 30;
  const filled = Math.round(progress.ratio * barWidth);
  const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
  const elapsed = (progress.elapsedMs / 1000).toFixed(1);
  process.stdout.write(
    `\r  [${bar}] ${progress.percent} — measure ${progress.currentMeasure}/${progress.totalMeasures} (${elapsed}s)`
  );
  if (progress.ratio >= 1) {
    process.stdout.write("\n");
  }
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s.substring(0, len) : s + " ".repeat(len - s.length);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.substring(0, max - 1) + "…";
}

const VALID_MODES: PlaybackMode[] = ["full", "measure", "hands", "loop"];
const VALID_SING_MODES: SingAlongMode[] = ["note-names", "solfege", "contour", "syllables"];
const VALID_HANDS = ["right", "left", "both"] as const;
const VALID_SYNC_MODES: SyncMode[] = ["concurrent", "before"];

/** Check for boolean flag (no value). */
function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

// ─── Commands ───────────────────────────────────────────────────────────────

function cmdList(args: string[]): void {
  const genreArg = getFlag(args, "--genre");

  if (genreArg) {
    if (!GENRES.includes(genreArg as Genre)) {
      console.error(`Unknown genre: "${genreArg}". Available: ${GENRES.join(", ")}`);
      process.exit(1);
    }
    printSongTable(getSongsByGenre(genreArg as Genre));
  } else {
    printSongTable(getAllSongs());
  }
}

function cmdInfo(args: string[]): void {
  const songId = args[0];
  if (!songId) {
    console.error("Usage: pianoai info <song-id>");
    process.exit(1);
  }
  const song = getSong(songId);
  if (!song) {
    console.error(`Song not found: "${songId}"`);
    process.exit(1);
  }
  printSongInfo(song);
}

async function cmdPlay(args: string[]): Promise<void> {
  const target = args[0];
  if (!target) {
    console.error("Usage: pianoai play <song-id | file.mid> [--speed N] [--tempo N] [--mode MODE] [--midi] [--with-singing] [--with-teaching] [--sing-mode MODE] [--seek N]");
    process.exit(1);
  }

  // Parse flags
  const useMidi = hasFlag(args, "--midi");
  const withSinging = hasFlag(args, "--with-singing");
  const withTeaching = hasFlag(args, "--with-teaching");
  const portName = getFlag(args, "--port") ?? undefined;
  const speedStr = getFlag(args, "--speed");
  const modeStr = getFlag(args, "--mode") ?? "full";
  const singModeStr = getFlag(args, "--sing-mode") ?? "note-names";
  const seekStr = getFlag(args, "--seek");
  const voiceFilterStr = getFlag(args, "--voice-filter") ?? "all";
  const keyboardStr = getFlag(args, "--keyboard") ?? "grand";

  // Validate keyboard
  if (!VOICE_IDS.includes(keyboardStr as PianoVoiceId)) {
    console.error(`Unknown keyboard: "${keyboardStr}". Available: ${VOICE_IDS.join(", ")}`);
    process.exit(1);
  }
  const keyboardId = keyboardStr as PianoVoiceId;

  // Validate speed
  const speed = speedStr ? parseFloat(speedStr) : undefined;
  if (speed !== undefined && (isNaN(speed) || speed <= 0 || speed > 4)) {
    console.error(`Invalid speed: "${speedStr}". Must be between 0 (exclusive) and 4.`);
    process.exit(1);
  }

  // Validate sing mode
  const singMode = singModeStr as SingAlongMode;

  // Determine source: .mid file or library song
  const isMidiFile = target.endsWith(".mid") || target.endsWith(".midi") || existsSync(target);

  // Create connector
  const connector: VmpkConnector = useMidi
    ? createVmpkConnector(portName ? { portName } : undefined)
    : createAudioEngine(keyboardId);

  console.log(useMidi ? `\nConnecting to MIDI...` : `\nStarting ${keyboardStr} piano...`);

  try {
    await connector.connect();
    console.log(`Connected!`);

    if (isMidiFile) {
      // ── MIDI file playback ──
      if (!existsSync(target)) {
        console.error(`File not found: "${target}"`);
        process.exit(1);
      }

      const parsed = await parseMidiFile(target);
      const tracker = new PositionTracker(parsed);
      const trackInfo = parsed.trackNames.length > 0 ? parsed.trackNames.join(", ") : "Unknown";
      const durationAtSpeed = parsed.durationSeconds / (speed ?? 1.0);
      const features: string[] = [];
      if (withSinging) features.push(`singing (${singMode}, ${voiceFilterStr})`);
      if (withTeaching) features.push("teaching");

      // Validate seek
      const seekSec = seekStr ? parseFloat(seekStr) : undefined;
      if (seekSec !== undefined && (isNaN(seekSec) || seekSec < 0)) {
        console.error(`Invalid seek: "${seekStr}". Must be a positive number (seconds).`);
        process.exit(1);
      }

      console.log(`\nPlaying: ${target}`);
      console.log(`  Tracks: ${trackInfo} (${parsed.trackCount})`);
      console.log(`  Notes: ${parsed.noteCount} | Tempo: ${parsed.bpm} BPM | Duration: ~${Math.round(durationAtSpeed)}s`);
      console.log(`  Measures: ~${tracker.totalMeasures} (estimated)`);
      if (seekSec) {
        const seekSnap = tracker.snapshotAt(seekSec);
        console.log(`  Seeking to: ${seekSec}s (measure ${seekSnap.measure}, beat ${seekSnap.beatInMeasure.toFixed(1)})`);
      }
      if (features.length > 0) console.log(`  Features: ${features.join(", ")}`);
      console.log();

      // Build teaching hooks
      const hooks: TeachingHook[] = [];

      if (withSinging) {
        const voiceSink = async (d: VoiceDirective) => {
          console.log(`  ♪ ${d.text}`);
        };
        hooks.push(createSingOnMidiHook(voiceSink, parsed, {
          mode: singMode,
          voiceFilter: voiceFilterStr as import("./teaching/sing-on-midi.js").SingVoiceFilter,
          speechSpeed: speed ?? 1.0,
        }));
      }

      if (withTeaching) {
        const voiceSink = async (d: VoiceDirective) => {
          console.log(`  🎓 ${d.text}`);
        };
        const asideSink = async (d: AsideDirective) => {
          const prefix = d.priority === "med" ? "💡" : d.priority === "high" ? "❗" : "ℹ️";
          console.log(`  ${prefix} ${d.text}`);
        };
        // Use position-aware feedback (measure-level context)
        hooks.push(createLiveMidiFeedbackHook(voiceSink, asideSink, parsed));
      }

      hooks.push(createConsoleTeachingHook());
      const teachingHook = composeTeachingHooks(...hooks);

      if (withSinging || withTeaching) {
        // Use PlaybackController for hook integration
        const controller = new PlaybackController(connector, parsed);
        await controller.play({
          speed: speed ?? 1.0,
          teachingHook,
          onProgress: printProgress,
        });
        console.log(`\nFinished! ${controller.eventsPlayed} notes played.`);
      } else {
        // Raw engine for plain playback
        const engine = new MidiPlaybackEngine(connector, parsed);
        await engine.play({
          speed: speed ?? 1.0,
          onProgress: printProgress,
        });
        console.log(`\nFinished! ${engine.eventsPlayed} notes played.`);
      }
    } else {
      // ── Library song playback ──
      const song = getSong(target);
      if (!song) {
        console.error(`Song not found: "${target}". Run 'pianoai list' to see available songs, or provide a .mid file path.`);
        process.exit(1);
      }

      const tempoStr = getFlag(args, "--tempo");
      const tempo = tempoStr ? parseInt(tempoStr, 10) : undefined;
      if (tempo !== undefined && (isNaN(tempo) || tempo < 10 || tempo > 400)) {
        console.error(`Invalid tempo: "${tempoStr}". Must be between 10 and 400 BPM.`);
        process.exit(1);
      }

      if (!VALID_MODES.includes(modeStr as PlaybackMode)) {
        console.error(`Invalid mode: "${modeStr}". Available: ${VALID_MODES.join(", ")}`);
        process.exit(1);
      }
      const mode = modeStr as PlaybackMode;

      // Build teaching hooks
      const libHooks: TeachingHook[] = [];

      if (withSinging) {
        const voiceSink = async (d: VoiceDirective) => {
          console.log(`  ♪ ${d.text}`);
        };
        libHooks.push(createSingAlongHook(voiceSink, song, {
          mode: singMode,
          speechSpeed: speed ?? 1.0,
        }));
      }

      if (withTeaching) {
        const voiceSink = async (d: VoiceDirective) => {
          console.log(`  🎓 ${d.text}`);
        };
        const asideSink = async (d: AsideDirective) => {
          const prefix = d.priority === "med" ? "💡" : d.priority === "high" ? "❗" : "ℹ️";
          console.log(`  ${prefix} ${d.text}`);
        };
        libHooks.push(createLiveFeedbackHook(voiceSink, asideSink, song));
      }

      libHooks.push(createConsoleTeachingHook());
      const teachingHook = composeTeachingHooks(...libHooks);

      const syncMode: SyncMode = (withSinging && !withTeaching) ? "before" : "concurrent";
      const session = createSession(song, connector, {
        mode,
        syncMode,
        tempo,
        speed,
        teachingHook,
        onProgress: printProgress,
        progressInterval: 0,
      });

      if (session.parseWarnings.length > 0) {
        console.log(`\n⚠ ${session.parseWarnings.length} note parsing warning(s):`);
        for (const w of session.parseWarnings.slice(0, 5)) {
          console.log(`  • ${w.location}: "${w.token}" — ${w.message}`);
        }
        if (session.parseWarnings.length > 5) {
          console.log(`  … and ${session.parseWarnings.length - 5} more`);
        }
      }

      printSongInfo(song);
      const speedLabel = speed && speed !== 1.0 ? ` × ${speed}x speed` : "";
      const tempoLabel = tempo ? ` (${tempo} BPM${speedLabel})` : speedLabel ? ` (${song.tempo} BPM${speedLabel})` : "";
      console.log(`Playing: ${song.title}${tempoLabel} [${mode} mode]\n`);

      await session.play();

      console.log(`\nFinished! ${session.session.measuresPlayed} measures played.`);
      console.log(session.summary());
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nError: ${msg}`);
    process.exit(1);
  } finally {
    await connector.disconnect();
  }
}

async function cmdSing(args: string[]): Promise<void> {
  const songId = args[0];
  if (!songId) {
    console.error("Usage: pianoai sing <song-id> [--mode note-names|solfege|contour|syllables] [--hand right|left|both] [--speed N] [--tempo N] [--with-piano] [--sync concurrent|before] [--midi]");
    process.exit(1);
  }
  const song = getSong(songId);
  if (!song) {
    console.error(`Song not found: "${songId}". Run 'pianoai list' to see available songs.`);
    process.exit(1);
  }

  // Parse flags
  const useMidi = hasFlag(args, "--midi");
  const portName = getFlag(args, "--port") ?? undefined;
  const tempoStr = getFlag(args, "--tempo");
  const speedStr = getFlag(args, "--speed");
  const modeStr = getFlag(args, "--mode") ?? "note-names";
  const handStr = getFlag(args, "--hand") ?? "right";
  const withPiano = hasFlag(args, "--with-piano");
  const syncStr = getFlag(args, "--sync") ?? "concurrent";
  const singKeyboardStr = getFlag(args, "--keyboard") ?? "grand";

  // Validate keyboard
  if (!VOICE_IDS.includes(singKeyboardStr as PianoVoiceId)) {
    console.error(`Unknown keyboard: "${singKeyboardStr}". Available: ${VOICE_IDS.join(", ")}`);
    process.exit(1);
  }
  const singKeyboardId = singKeyboardStr as PianoVoiceId;

  // Validate sing-along mode
  if (!VALID_SING_MODES.includes(modeStr as SingAlongMode)) {
    console.error(`Invalid mode: "${modeStr}". Available: ${VALID_SING_MODES.join(", ")}`);
    process.exit(1);
  }
  const singMode = modeStr as SingAlongMode;

  // Validate hand
  if (!VALID_HANDS.includes(handStr as typeof VALID_HANDS[number])) {
    console.error(`Invalid hand: "${handStr}". Available: ${VALID_HANDS.join(", ")}`);
    process.exit(1);
  }
  const hand = handStr as "right" | "left" | "both";

  // Validate sync mode
  if (!VALID_SYNC_MODES.includes(syncStr as SyncMode)) {
    console.error(`Invalid sync mode: "${syncStr}". Available: ${VALID_SYNC_MODES.join(", ")}`);
    process.exit(1);
  }
  const syncMode = syncStr as SyncMode;

  // Validate speed
  const speed = speedStr ? parseFloat(speedStr) : undefined;
  if (speed !== undefined && (isNaN(speed) || speed <= 0 || speed > 4)) {
    console.error(`Invalid speed: "${speedStr}". Must be between 0 (exclusive) and 4.`);
    process.exit(1);
  }

  // Validate tempo
  const tempo = tempoStr ? parseInt(tempoStr, 10) : undefined;
  if (tempo !== undefined && (isNaN(tempo) || tempo < 10 || tempo > 400)) {
    console.error(`Invalid tempo: "${tempoStr}". Must be between 10 and 400 BPM.`);
    process.exit(1);
  }

  // Create connector: built-in piano engine or MIDI output
  const connector: VmpkConnector = useMidi
    ? createVmpkConnector(portName ? { portName } : undefined)
    : createAudioEngine(singKeyboardId);

  console.log(useMidi ? `\nConnecting to MIDI...` : `\nStarting ${singKeyboardStr} piano...`);

  try {
    await connector.connect();
    console.log(`Connected!`);

    // Console voice sink — prints sing-along text
    const voiceSink = async (directive: VoiceDirective) => {
      console.log(`  ♪ ${directive.text}`);
    };

    // Console aside sink — prints feedback tips
    const asideSink = async (directive: AsideDirective) => {
      const prefix =
        directive.priority === "med" ? "💡" :
        directive.priority === "high" ? "❗" : "ℹ️";
      console.log(`  ${prefix} ${directive.text}`);
    };

    // Build hooks: sing-along + optional live feedback + console
    const hooks = [];
    const singHook = createSingAlongHook(voiceSink, song, {
      mode: singMode,
      hand,
      speechSpeed: speed ?? 1.0,
    });
    hooks.push(singHook);

    if (withPiano) {
      const feedbackHook = createLiveFeedbackHook(voiceSink, asideSink, song, {
        voiceInterval: 4,
      });
      hooks.push(feedbackHook);
    }

    hooks.push(createConsoleTeachingHook());
    const teachingHook = composeTeachingHooks(...hooks);

    const session = createSession(song, connector, {
      mode: "full",
      syncMode: withPiano ? syncMode : "before",
      tempo,
      speed,
      teachingHook,
      onProgress: printProgress,
      progressInterval: 0,
    });

    // Report parse warnings
    if (session.parseWarnings.length > 0) {
      console.log(`\n⚠ ${session.parseWarnings.length} note parsing warning(s):`);
      for (const w of session.parseWarnings.slice(0, 5)) {
        console.log(`  • ${w.location}: "${w.token}" — ${w.message}`);
      }
      if (session.parseWarnings.length > 5) {
        console.log(`  … and ${session.parseWarnings.length - 5} more`);
      }
    }

    // Display session info
    printSongInfo(song);
    const speedLabel = speed && speed !== 1.0 ? ` × ${speed}x speed` : "";
    const tempoLabel = tempo ? ` (${tempo} BPM${speedLabel})` : speedLabel ? ` (${song.tempo} BPM${speedLabel})` : "";
    const pianoLabel = withPiano ? ` + piano (${syncMode})` : "";
    console.log(`Singing along: ${song.title}${tempoLabel} [${singMode} / ${hand} hand${pianoLabel}]\n`);

    await session.play();

    console.log(`\nFinished! ${session.session.measuresPlayed} measures played.`);
    console.log(session.summary());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nError: ${msg}`);
    process.exit(1);
  } finally {
    await connector.disconnect();
  }
}

function cmdStats(): void {
  const stats = getStats();
  console.log("\nRegistry Stats:");
  console.log(`  Total songs: ${stats.totalSongs}`);
  console.log(`  Total measures: ${stats.totalMeasures}`);
  console.log("\n  By genre:");
  for (const [genre, count] of Object.entries(stats.byGenre)) {
    if (count > 0) console.log(`    ${padRight(genre, 12)} ${count}`);
  }
  console.log("\n  By difficulty:");
  for (const [diff, count] of Object.entries(stats.byDifficulty)) {
    if (count > 0) console.log(`    ${padRight(diff, 14)} ${count}`);
  }
  console.log();
}

function cmdPorts(): void {
  console.log("\nChecking available MIDI output ports...");
  const connector = createVmpkConnector();
  // JZZ needs an engine to list ports — try connecting briefly
  console.log("(Note: Full port listing requires JZZ engine initialization.)");
  console.log("Tip: Run loopMIDI and create a port, then set VMPK input to that port.\n");
}

async function cmdView(args: string[]): Promise<void> {
  const songId = args[0];
  if (!songId) {
    console.error("Usage: ai-jam-session view <song-id> [--measures 1-8] [--out file.svg]");
    process.exit(1);
  }
  const song = getSong(songId);
  if (!song) {
    console.error(`Song not found: "${songId}". Run 'ai-jam-session list' to see available songs.`);
    process.exit(1);
  }

  // Parse --measures flag (e.g. "1-8", "9-16")
  const measuresStr = getFlag(args, "--measures");
  let startMeasure: number | undefined;
  let endMeasure: number | undefined;
  if (measuresStr) {
    const parts = measuresStr.split("-");
    startMeasure = parseInt(parts[0], 10);
    endMeasure = parts[1] ? parseInt(parts[1], 10) : startMeasure;
    if (isNaN(startMeasure) || isNaN(endMeasure)) {
      console.error(`Invalid --measures range: "${measuresStr}". Use format like "1-8" or "5-12".`);
      process.exit(1);
    }
  }

  // Parse --color flag
  const colorStr = getFlag(args, "--color") ?? "hand";
  const validColors = ["hand", "pitch-class"];
  if (!validColors.includes(colorStr)) {
    console.error(`Invalid --color: "${colorStr}". Options: ${validColors.join(", ")}`);
    process.exit(1);
  }
  const colorMode = colorStr as PianoRollColorMode;

  // Parse --out flag for output path
  const outPath = getFlag(args, "--out");

  const svg = renderPianoRoll(song, { startMeasure, endMeasure, colorMode });

  if (outPath) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(outPath, svg, "utf8");
    console.log(`Piano roll written to: ${outPath}`);
  } else {
    // Write to temp file
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { writeFileSync } = await import("node:fs");
    const tempPath = join(tmpdir(), `piano-roll-${song.id}.svg`);
    writeFileSync(tempPath, svg, "utf8");
    console.log(`Piano roll written to: ${tempPath}`);
    console.log(`Open in browser to view.`);
  }
}

function cmdKeyboards(): void {
  const voices = listVoices();
  console.log(`\nAvailable Piano Keyboards:`);
  console.log(`${"─".repeat(80)}`);
  for (const v of voices) {
    const isDefault = v.id === "grand" ? " (default)" : "";
    console.log(`  ${padRight(v.id, 12)} ${v.name}${isDefault}`);
    console.log(`  ${padRight("", 12)} ${v.description}`);
    console.log(`  ${padRight("", 12)} Best for: ${v.suggestedFor.join(", ")}`);
    console.log();
  }
  console.log(`Use --keyboard <id> with play or sing commands.`);
  console.log(`Example: pianoai play amazing-grace --keyboard upright\n`);
}

function cmdTune(args: string[]): void {
  const voiceId = args[0];
  if (!voiceId) {
    console.log(`\nUsage: pianoai tune <keyboard-id> [--param value ...] [--reset] [--show]`);
    console.log(`\nKeyboard IDs: ${VOICE_IDS.join(", ")}`);
    console.log(`\nTunable parameters:`);
    for (const p of TUNING_PARAMS) {
      console.log(`  --${padRight(p.key, 18)} ${p.description} (${p.min}–${p.max})`);
    }
    console.log(`\nSpecial flags:`);
    console.log(`  --reset              Reset to factory defaults`);
    console.log(`  --show               Show current config\n`);
    return;
  }

  if (!VOICE_IDS.includes(voiceId as any)) {
    console.error(`Unknown keyboard: "${voiceId}". Valid: ${VOICE_IDS.join(", ")}`);
    process.exit(1);
  }

  // --reset flag
  if (args.includes("--reset")) {
    const hadOverrides = Object.keys(loadUserTuning(voiceId)).length > 0;
    resetUserTuning(voiceId);
    const voice = getVoice(voiceId)!;
    if (hadOverrides) {
      console.log(`Reset ${voice.name} (${voiceId}) to factory defaults.`);
    } else {
      console.log(`${voice.name} (${voiceId}) was already at factory defaults.`);
    }
    return;
  }

  // --show flag
  if (args.includes("--show")) {
    const base = getVoice(voiceId)!;
    const merged = getMergedVoice(voiceId)!;
    const tuning = loadUserTuning(voiceId);
    console.log(`\n${merged.name} (${voiceId})`);
    console.log(`${"─".repeat(60)}`);
    for (const p of TUNING_PARAMS) {
      let factoryVal: number;
      let currentVal: number;
      if (p.isArrayIndex !== undefined) {
        factoryVal = (base as any)[p.configKey][p.isArrayIndex];
        currentVal = (merged as any)[p.configKey][p.isArrayIndex];
      } else {
        factoryVal = (base as any)[p.configKey];
        currentVal = (merged as any)[p.configKey];
      }
      const marker = p.key in tuning ? " *" : "";
      console.log(`  ${padRight(p.key, 18)} ${currentVal}${marker}  (factory: ${factoryVal}, range: ${p.min}–${p.max})`);
    }
    const overrideCount = Object.keys(tuning).length;
    if (overrideCount > 0) {
      console.log(`\n  * = user override (${overrideCount} total)`);
    } else {
      console.log(`\n  Using factory preset.`);
    }
    console.log();
    return;
  }

  // Parse tuning params from args
  const overrides: UserTuning = {};
  for (const p of TUNING_PARAMS) {
    const val = getFlag(args, `--${p.key}`);
    if (val !== null) {
      const num = parseFloat(val);
      if (isNaN(num)) {
        console.error(`Invalid value for --${p.key}: "${val}" (expected a number)`);
        process.exit(1);
      }
      if (num < p.min || num > p.max) {
        console.error(`--${p.key} ${num} is out of range (${p.min}–${p.max})`);
        process.exit(1);
      }
      overrides[p.key] = num;
    }
  }

  if (Object.keys(overrides).length === 0) {
    console.error(`No tuning parameters specified. Run 'pianoai tune' to see available parameters.`);
    process.exit(1);
  }

  saveUserTuning(voiceId, overrides);
  const merged = getMergedVoice(voiceId)!;
  const totalOverrides = Object.keys(loadUserTuning(voiceId)).length;

  console.log(`\nTuned ${merged.name} (${voiceId}):`);
  for (const [key, val] of Object.entries(overrides)) {
    console.log(`  ${padRight(key, 18)} → ${val}`);
  }
  console.log(`\n${totalOverrides} total override(s) saved. Use --reset to restore factory.\n`);
}

function cmdHelp(): void {
  console.log(`
pianoai — Play piano through your speakers

Commands:
  play <song | file.mid>     Play a song or MIDI file
  view <song-id> [options]   Render a piano roll SVG visualization
  tune <keyboard> [options]  Tune a keyboard voice (persists across sessions)
  list [--genre <genre>]     List built-in songs
  info <song-id>             Show song details
  sing <song-id> [options]   Sing along — narrate notes during playback
  keyboards                  List available piano keyboard voices
  stats                      Registry statistics
  ports                      List MIDI output ports
  help                       Show this help

Play options:
  --speed <mult>             Speed multiplier (0.5 = half, 1.0 = normal, 2.0 = double)
  --tempo <bpm>              Override tempo (10-400 BPM, library songs only)
  --mode <mode>              Playback mode: full, measure, hands, loop (library songs only)
  --keyboard <voice>         Piano voice: grand, upright, electric, honkytonk, musicbox, bright
  --midi                     Output via MIDI instead of built-in piano
  --port <name>              MIDI port name (with --midi)

View options:
  --measures <start-end>     Measure range to render (e.g. 1-8, 9-16). Default: all
  --color <mode>             Note coloring: hand (default) or pitch-class (chromatic rainbow)
  --out <file.svg>           Output file path. Default: temp file

Tune options:
  --show                     Show current config for a keyboard
  --reset                    Reset keyboard to factory defaults
  --brightness <0.05-0.5>    Brightness at moderate velocity
  --decay <1-10>             Sustain length (treble, seconds)
  --hammer <0-0.5>           Hammer attack intensity
  --detune <0-20>            Random detuning (chorus effect, cents)
  ... (run 'pianoai tune' for all parameters)

Sing options:
  --tempo <bpm>              Override tempo (10-400 BPM)
  --speed <mult>             Speed multiplier
  --mode <mode>              Sing-along mode: note-names, solfege, contour, syllables
  --hand <hand>              Which hand: right, left, both
  --keyboard <voice>         Piano voice: grand, upright, electric, honkytonk, musicbox, bright
  --with-piano               Play piano accompaniment while singing
  --sync <mode>              Voice+piano sync: concurrent (default), before
  --midi                     Output via MIDI instead of built-in piano

Examples:
  pianoai play song.mid                                  # play a MIDI file
  pianoai play amazing-grace --keyboard upright           # folk on an upright
  pianoai play the-entertainer --keyboard honkytonk       # ragtime on honky-tonk
  pianoai play autumn-leaves --keyboard electric          # jazz on electric piano
  pianoai tune grand --brightness 0.3 --decay 5           # tune the grand piano
  pianoai tune grand --show                               # see current grand config
  pianoai tune grand --reset                              # reset grand to factory
  pianoai view autumn-leaves --color pitch-class           # chromatic color view
  pianoai keyboards                                       # list all piano voices
  pianoai list --genre jazz                               # browse jazz songs
`);
}

// ─── Library Command ─────────────────────────────────────────────────────────

function cmdLibrary(args: string[], libraryDir: string): void {
  const progress = getLibraryProgress(libraryDir);

  // Sub-command: status <genre>
  if (args[0] === "status" && args[1]) {
    const genre = args[1];
    const gp = progress.byGenre[genre as Genre];
    if (!gp) {
      console.error(`Unknown genre: ${genre}`);
      console.error(`Valid genres: ${GENRES.join(", ")}`);
      process.exit(1);
    }

    console.log(`\n  ${genre} — ${gp.total} songs`);
    console.log(`  ${"─".repeat(45)}`);
    for (const song of gp.songs) {
      const icon = song.status === "ready" ? "✓" : song.status === "annotated" ? "◐" : "○";
      console.log(`    ${icon} ${song.id.padEnd(35)} ${song.status}`);
    }
    console.log(`\n    Ready: ${gp.ready}  Annotated: ${gp.annotated}  Raw: ${gp.raw}\n`);
    return;
  }

  // Default: overview
  const pct = progress.total > 0 ? Math.round((progress.ready / progress.total) * 100) : 0;
  const barLen = 30;
  const filled = Math.round((progress.ready / Math.max(progress.total, 1)) * barLen);
  const bar = "█".repeat(filled) + "░".repeat(barLen - filled);

  console.log(`\n  Piano AI Song Library — Progress`);
  console.log(`  ${"═".repeat(50)}`);
  console.log(`  Total: ${progress.total} songs across ${Object.keys(progress.byGenre).length} genres`);
  console.log(`  Ready:     ${String(progress.ready).padStart(3)} ${bar} ${pct}%`);
  console.log(`  Annotated: ${String(progress.annotated).padStart(3)}`);
  console.log(`  Raw:       ${String(progress.raw).padStart(3)}`);
  console.log();

  // Per-genre breakdown
  for (const genre of GENRES) {
    const gp = progress.byGenre[genre as Genre];
    if (!gp) continue;
    const r = String(gp.ready).padStart(2);
    const a = String(gp.annotated).padStart(2);
    const w = String(gp.raw).padStart(2);
    console.log(`    ${genre.padEnd(12)} ${String(gp.total).padStart(2)} songs   ${r} ready  ${a} annotated  ${w} raw`);
  }
  console.log();
}

// ─── CLI Router ─────────────────────────────────────────────────────────────

function getFlag(args: string[], flag: string): string | null {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

async function main(): Promise<void> {
  // Load songs from library + user directories
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const libraryDir = join(__dirname, "..", "songs", "library");
  const userDir = join(process.env.HOME ?? process.env.USERPROFILE ?? ".", ".pianoai", "songs");
  initializeFromLibrary(libraryDir, userDir);

  const args = process.argv.slice(2);
  const command = args[0] ?? "help";

  switch (command) {
    case "list":
      cmdList(args.slice(1));
      break;
    case "info":
      cmdInfo(args.slice(1));
      break;
    case "play":
      await cmdPlay(args.slice(1));
      break;
    case "sing":
      await cmdSing(args.slice(1));
      break;
    case "view":
      await cmdView(args.slice(1));
      break;
    case "tune":
      cmdTune(args.slice(1));
      break;
    case "keyboards":
      cmdKeyboards();
      break;
    case "library":
    case "lib":
      cmdLibrary(args.slice(1), libraryDir);
      break;
    case "stats":
      cmdStats();
      break;
    case "ports":
      cmdPorts();
      break;
    case "help":
    case "--help":
    case "-h":
      cmdHelp();
      break;
    default:
      // Maybe it's a song ID — try info
      const song = getSong(command);
      if (song) {
        printSongInfo(song);
      } else {
        console.error(`Unknown command: "${command}". Run 'pianoai help' for usage.`);
        process.exit(1);
      }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
