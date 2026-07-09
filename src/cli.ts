#!/usr/bin/env node
// ─── ai-jam-sessions: CLI Entry Point ──────────────────────────────────────
//
// Usage:
//   ai-jam-sessions                     # Show help
//   ai-jam-sessions list                # List all songs
//   ai-jam-sessions list --genre jazz   # List songs by genre
//   ai-jam-sessions play <song-id>      # Play a song (built-in piano engine)
//   ai-jam-sessions play <song-id> --midi  # Play via MIDI output
//   ai-jam-sessions sing <song-id>      # Sing along — narrate notes during playback
//   ai-jam-sessions info <song-id>      # Show song details
//   ai-jam-sessions stats               # Registry stats
//   ai-jam-sessions ports               # List available MIDI ports
// ─────────────────────────────────────────────────────────────────────────────

import {
  getAllSongs,
  getSong,
  getSongsByGenre,
  getSongsByDifficulty,
  getStats,
  GENRES,
  DIFFICULTIES,
  initializeFromLibrary,
  getLibraryProgress,
} from "./songs/index.js";
import type { SongEntry, Genre, Difficulty } from "./songs/types.js";
import type { PlaybackProgress, PlaybackMode, SyncMode, VoiceDirective, AsideDirective, VmpkConnector } from "./types.js";
import type { SingAlongMode } from "./note-parser.js";
import type { SingVoiceFilter } from "./teaching/sing-on-midi.js";
import { createAudioEngine } from "./audio-engine.js";
import { createVocalEngine } from "./vocal-engine.js";
import { createTractEngine, TRACT_VOICE_IDS, type TractVoiceId } from "./vocal-tract-engine.js";
import { createGuitarEngine } from "./guitar-engine.js";
import {
  GUITAR_VOICE_IDS, GUITAR_TUNING_PARAMS,
  listGuitarVoices, getGuitarVoice, getMergedGuitarVoice,
  loadGuitarUserTuning, saveGuitarUserTuning, resetGuitarUserTuning,
  type GuitarVoiceId, type GuitarUserTuning,
} from "./guitar-voices.js";
import { createVocalSynthEngine } from "./vocal-synth-adapter.js";
import { createLayeredEngine } from "./layered-engine.js";
import { createVmpkConnector } from "./vmpk.js";
import {
  listVoices, getVoice, getMergedVoice, VOICE_IDS,
  TUNING_PARAMS, loadUserTuning, saveUserTuning, resetUserTuning,
  type PianoVoiceId, type UserTuning,
} from "./piano-voices.js";
import type { PianoRollColorMode } from "./piano-roll.js";
import { renderGuitarTab } from "./guitar-tab-roll.js";
import { GUITAR_TUNING_IDS } from "./guitar-voices.js";
import { pathToFileURL } from "node:url";
import { resolve as resolvePathArg } from "node:path";
import { createSession } from "./session.js";
import { parseMidiFile } from "./midi/parser.js";
import { MidiPlaybackEngine } from "./playback/midi-engine.js";
import { PlaybackController } from "./playback/controls.js";
import { existsSync, realpathSync } from "node:fs";
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
import { buildJournalEntry, appendJournalEntry } from "./journal.js";
import type { SessionSnapshot } from "./journal.js";
import { VERSION } from "./version.js";
import {
  PracticeLoop,
  resolvePracticeLoopConfig,
  formatPassSummary,
  type ResolvedPracticeLoopConfig,
  type PracticePassResult,
} from "./practice-loop.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Open a file in the system default browser / application. */
async function openInBrowser(filePath: string): Promise<void> {
  const { platform } = await import("node:os");
  const { execFile } = await import("node:child_process");
  const os = platform();
  const onError = (err: Error | null) => {
    if (err) {
      console.warn(`Could not open browser automatically: ${err.message}`);
      console.warn(`File saved at: ${filePath}`);
    }
  };
  if (os === "win32") {
    if (/["&|`<>^()!%]/.test(filePath)) {
      throw new Error(`Refusing to open path with shell-special characters: "${filePath}"`);
    }
    execFile("cmd", ["/c", "start", "", `"${filePath}"`], onError);
  } else if (os === "darwin") {
    execFile("open", [filePath], onError);
  } else {
    execFile("xdg-open", [filePath], onError);
  }
}

/** Standard "song not found" error message with a hint to run `list`. */
function songNotFoundError(songId: string, extra?: string): string {
  const base = `Song not found: "${songId}". Run \`ai-jam-sessions list\` to see available songs.`;
  return extra ? `${base} ${extra}` : base;
}

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
  // MIDI file playback: show time position instead of note index
  const posInfo = progress.durationSeconds != null
    ? `${Math.round(progress.positionSeconds!)}s / ${Math.round(progress.durationSeconds)}s`
    : `measure ${progress.currentMeasure}/${progress.totalMeasures}`;
  process.stdout.write(
    `\r  [${bar}] ${progress.percent} — ${posInfo} (${elapsed}s)`
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
const VALID_VOICE_FILTERS: SingVoiceFilter[] = ["all", "melody-only", "harmony"];
const VALID_HANDS = ["right", "left", "both"] as const;
const VALID_SYNC_MODES: SyncMode[] = ["concurrent", "before"];

/** Check for boolean flag (no value). */
function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

/** `play`'s session-recording flags: --metronome, --count-in <bars>, --record. */
export interface PlaySessionFlags {
  metronome: boolean;
  countIn: number | undefined;
  record: boolean;
}

/**
 * Parse `play`'s --metronome/--count-in/--record flags. Pure — no I/O, no
 * process.exit — so it's directly importable/testable (see cli.test.ts)
 * without pulling in cmdPlay's audio-engine/session machinery. Throws a
 * plain Error with a user-facing message on an invalid --count-in; cmdPlay
 * converts that into this file's usual "print + exit(1)" pattern (see the
 * header comment on the pre-flight-validation convention, above cmdList).
 */
export function parsePlaySessionFlags(args: string[]): PlaySessionFlags {
  const metronome = hasFlag(args, "--metronome");
  const record = hasFlag(args, "--record");

  const countInStr = getFlag(args, "--count-in");
  let countIn: number | undefined;
  if (countInStr !== null) {
    countIn = parseInt(countInStr, 10);
    if (isNaN(countIn) || countIn < 0) {
      throw new Error(`Invalid --count-in: "${countInStr}". Must be a non-negative integer (bars).`);
    }
  }

  return { metronome, countIn, record };
}

// ─── Commands ───────────────────────────────────────────────────────────────
//
// Error-handling split (F-1a562e8f): the ~25 early-validation sites below
// (`console.error(...); process.exit(1);`) are pre-flight argument checks —
// bad flag values, missing required args, unknown song IDs. These are
// EXIT_USER by construction: a conscious decision, not an oversight. They
// intentionally stay as direct process.exit(1) calls (which already equals
// errors.ts's EXIT_USER) rather than `throw new JamError(...)`, because
// they run before any engine/file-I/O/transport work has started, so the
// failure category is never ambiguous. JamError + main().catch()'s
// handleError() is reserved for errors whose category ISN'T known until
// runtime — see cmdPlay/cmdSing's own catch blocks below, which route
// through handleError() precisely because a failure during playback really
// could be either an EXIT_USER (bad song data) or EXIT_RUNTIME (audio
// engine crash, MIDI port dropped) condition.
function cmdList(args: string[]): void {
  const genreArg = getFlag(args, "--genre");
  const diffArg = getFlag(args, "--difficulty");

  let songs: SongEntry[];

  if (genreArg) {
    if (!GENRES.includes(genreArg as Genre)) {
      console.error(`Unknown genre: "${genreArg}". Available: ${GENRES.join(", ")}`);
      process.exit(1);
    }
    songs = getSongsByGenre(genreArg as Genre);
  } else {
    songs = getAllSongs();
  }

  if (diffArg) {
    if (!DIFFICULTIES.includes(diffArg as Difficulty)) {
      console.error(`Unknown difficulty: "${diffArg}". Available: ${DIFFICULTIES.join(", ")}`);
      process.exit(1);
    }
    songs = songs.filter(s => s.difficulty === diffArg);
  }

  printSongTable(songs);
}

function cmdInfo(args: string[]): void {
  const songId = args[0];
  if (!songId) {
    console.error("Usage: ai-jam-sessions info <song-id>");
    process.exit(1);
  }
  const song = getSong(songId);
  if (!song) {
    console.error(songNotFoundError(songId));
    process.exit(1);
  }
  printSongInfo(song);
}

async function cmdPlay(args: string[]): Promise<void> {
  const target = args[0];
  if (!target) {
    console.error("Usage: ai-jam-sessions play <song-id | file.mid> [--speed N] [--tempo N] [--mode MODE] [--midi] [--with-singing] [--with-teaching] [--sing-mode MODE] [--seek N] [--metronome] [--count-in N] [--record]");
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
  const engineStr = getFlag(args, "--engine") ?? "piano";
  const tractVoiceStr = getFlag(args, "--tract-voice") ?? "soprano";
  const guitarVoiceStr = getFlag(args, "--guitar-voice") ?? "steel-dreadnought";

  // Session-recording flags (library songs only — see parsePlaySessionFlags).
  let sessionFlags: PlaySessionFlags;
  try {
    sessionFlags = parsePlaySessionFlags(args);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Validate engine
  const VALID_ENGINES = ["piano", "vocal", "tract", "synth", "piano+synth", "vocal+synth", "guitar", "guitar+synth"];
  if (!VALID_ENGINES.includes(engineStr)) {
    console.error(`Unknown engine: "${engineStr}". Available: ${VALID_ENGINES.join(", ")}`);
    process.exit(1);
  }

  // Validate tract voice
  if (!TRACT_VOICE_IDS.includes(tractVoiceStr as TractVoiceId)) {
    console.error(`Unknown tract voice: "${tractVoiceStr}". Available: ${TRACT_VOICE_IDS.join(", ")}`);
    process.exit(1);
  }

  // Validate guitar voice
  if (!GUITAR_VOICE_IDS.includes(guitarVoiceStr as GuitarVoiceId)) {
    console.error(`Unknown guitar voice: "${guitarVoiceStr}". Available: ${GUITAR_VOICE_IDS.join(", ")}`);
    process.exit(1);
  }

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
  if (!VALID_SING_MODES.includes(singModeStr as SingAlongMode)) {
    console.error(`Invalid --sing-mode: "${singModeStr}". Available: ${VALID_SING_MODES.join(", ")}`);
    process.exit(1);
  }
  const singMode = singModeStr as SingAlongMode;

  if (!VALID_VOICE_FILTERS.includes(voiceFilterStr as SingVoiceFilter)) {
    console.error(`Invalid --voice-filter: "${voiceFilterStr}". Available: ${VALID_VOICE_FILTERS.join(", ")}`);
    process.exit(1);
  }
  const voiceFilter = voiceFilterStr as SingVoiceFilter;

  // Determine source: .mid file or library song
  // Only treat as MIDI file if it has a MIDI extension, or looks like a file path (has separator/extension) and exists
  const hasMidiExtension = target.endsWith(".mid") || target.endsWith(".midi");
  const looksLikeFilePath = target.includes("/") || target.includes("\\") || target.includes(".");
  const isMidiFile = hasMidiExtension || (looksLikeFilePath && existsSync(target));

  // Validate song ID early (before connecting engine) for library songs
  if (!isMidiFile) {
    const song = getSong(target);
    if (!song) {
      console.error(songNotFoundError(target, "Or provide a .mid file path."));
      process.exit(1);
    }
  }

  // Create connector
  function buildEngine(engine: string): VmpkConnector {
    switch (engine) {
      case "tract":  return createTractEngine({ voice: tractVoiceStr as TractVoiceId });
      case "vocal":  return createVocalEngine();
      case "synth":  return createVocalSynthEngine();
      case "guitar": return createGuitarEngine({ voice: guitarVoiceStr as GuitarVoiceId });
      case "piano+synth":
        return createLayeredEngine([createAudioEngine(keyboardId), createVocalSynthEngine()]);
      case "vocal+synth":
        return createLayeredEngine([createVocalEngine(), createVocalSynthEngine()]);
      case "guitar+synth":
        return createLayeredEngine([createGuitarEngine({ voice: guitarVoiceStr as GuitarVoiceId }), createVocalSynthEngine()]);
      default:       return createAudioEngine(keyboardId);
    }
  }

  const connector: VmpkConnector = useMidi
    ? createVmpkConnector(portName ? { portName } : undefined)
    : buildEngine(engineStr);

  const ENGINE_LABELS: Record<string, string> = {
    tract: `tract engine (${tractVoiceStr})`,
    vocal: "vocal engine",
    synth: "vocal-synth engine",
    guitar: `guitar engine (${guitarVoiceStr})`,
    "piano+synth": `${keyboardStr} piano + vocal-synth`,
    "vocal+synth": "vocal + vocal-synth",
    "guitar+synth": `${guitarVoiceStr} guitar + vocal-synth`,
  };
  const engineLabel = useMidi ? "MIDI" : ENGINE_LABELS[engineStr] ?? `${keyboardStr} piano`;
  console.log(`\nStarting ${engineLabel}...`);

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
      if (seekSec !== undefined) {
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
          voiceFilter,
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
          startAtSeconds: seekSec,
        });
        console.log(`\nFinished! ${controller.eventsPlayed} notes played.`);
      } else {
        // Raw engine for plain playback
        const engine = new MidiPlaybackEngine(connector, parsed);
        await engine.play({
          speed: speed ?? 1.0,
          onProgress: printProgress,
          startAtSeconds: seekSec,
        });
        console.log(`\nFinished! ${engine.eventsPlayed} notes played.`);
      }
    } else {
      // ── Library song playback ──
      const song = getSong(target);
      if (!song) {
        console.error(songNotFoundError(target, "Or provide a .mid file path."));
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
        metronome: sessionFlags.metronome,
        countIn: sessionFlags.countIn,
        record: sessionFlags.record,
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

      // Duration estimate
      const effectiveTempo = tempo ?? song.tempo;
      const effectiveSpeed = speed ?? 1.0;
      const beatsPerMeasure = song.timeSignature === "3/4" ? 3 : song.timeSignature === "6/8" ? 6 : 4;
      const estSeconds = Math.round((song.measures.length * beatsPerMeasure * 60) / (effectiveTempo * effectiveSpeed));
      const estMin = Math.floor(estSeconds / 60);
      const estSec = estSeconds % 60;
      const estStr = estMin > 0 ? `~${estMin}m ${estSec}s` : `~${estSec}s`;

      console.log(`Playing: ${song.title}${tempoLabel} [${mode} mode] (${estStr})\n`);

      // SIGINT handler for graceful stop
      const sigintHandler = () => {
        console.log("\n\nStopping playback...");
        session.stop();
      };
      process.on("SIGINT", sigintHandler);

      const playStart = Date.now();
      await session.play();
      process.removeListener("SIGINT", sigintHandler);

      const durationSec = Math.round((Date.now() - playStart) / 1000);
      console.log(`\nFinished! ${session.session.measuresPlayed} measures played.`);
      console.log(session.summary());
      if (sessionFlags.record) {
        console.log(`Recorded: ${session.getRecording().events.length} note event(s).`);
      }

      // Auto-save journal entry
      try {
        const snapshot: SessionSnapshot = {
          songId: song.id,
          title: song.title,
          composer: song.composer,
          genre: song.genre,
          difficulty: song.difficulty,
          key: song.key,
          tempo: effectiveTempo,
          speed: effectiveSpeed,
          mode,
          measuresPlayed: session.session.measuresPlayed,
          totalMeasures: song.measures.length,
          durationSeconds: durationSec,
          timestamp: new Date().toISOString(),
        };
        const entry = buildJournalEntry(snapshot, "CLI practice session.");
        appendJournalEntry(entry);
        console.log("  📝 Session logged to practice journal.");
      } catch (journalErr) {
        const msg = journalErr instanceof Error ? (journalErr as Error).message : String(journalErr);
        console.warn(`  ⚠ Could not save journal entry: ${msg}`);
      }
    }
  } catch (err) {
    // Route through handleError() instead of a bare process.exit(1) — a
    // failure during playback could be EXIT_USER (bad song data) or
    // EXIT_RUNTIME (audio engine crash, MIDI port dropped), and the two
    // categories weren't distinguished here (F-1a562e8f). The engine
    // modules already construct JamError with the right code; this is
    // what lets that classification actually reach the exit code.
    const { handleError } = await import("./errors.js");
    const debug = process.argv.includes("--debug") || process.argv.includes("-D");
    process.exit(handleError(err, debug));
  } finally {
    await connector.disconnect();
  }
}

async function cmdSing(args: string[]): Promise<void> {
  const songId = args[0];
  if (!songId) {
    console.error("Usage: ai-jam-sessions sing <song-id> [--mode note-names|solfege|contour|syllables] [--hand right|left|both] [--speed N] [--tempo N] [--with-piano] [--sync concurrent|before] [--midi]");
    process.exit(1);
  }
  const song = getSong(songId);
  if (!song) {
    console.error(songNotFoundError(songId));
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
  const singEngineStr = getFlag(args, "--engine") ?? "piano";
  const SING_ENGINES = ["piano", "synth", "piano+synth"];
  if (!SING_ENGINES.includes(singEngineStr)) {
    console.error(`Unknown engine for sing: "${singEngineStr}". Available: ${SING_ENGINES.join(", ")}`);
    process.exit(1);
  }

  function buildSingEngine(engine: string): VmpkConnector {
    switch (engine) {
      case "synth":      return createVocalSynthEngine();
      case "piano+synth": return createLayeredEngine([createAudioEngine(singKeyboardId), createVocalSynthEngine()]);
      default:            return createAudioEngine(singKeyboardId);
    }
  }

  const connector: VmpkConnector = useMidi
    ? createVmpkConnector(portName ? { portName } : undefined)
    : buildSingEngine(singEngineStr);

  const singEngineLabel = useMidi ? "MIDI" : singEngineStr === "synth" ? "vocal-synth engine" : singEngineStr === "piano+synth" ? `${singKeyboardStr} piano + vocal-synth` : `${singKeyboardStr} piano`;
  console.log(`\nStarting ${singEngineLabel}...`);

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
    // Route through handleError() instead of a bare process.exit(1) — a
    // failure during playback could be EXIT_USER (bad song data) or
    // EXIT_RUNTIME (audio engine crash, MIDI port dropped), and the two
    // categories weren't distinguished here (F-1a562e8f). The engine
    // modules already construct JamError with the right code; this is
    // what lets that classification actually reach the exit code.
    const { handleError } = await import("./errors.js");
    const debug = process.argv.includes("--debug") || process.argv.includes("-D");
    process.exit(handleError(err, debug));
  } finally {
    await connector.disconnect();
  }
}

// ─── Practice command ───────────────────────────────────────────────────────

/** Parsed, still-raw arguments for the `practice` command (before song lookup / config resolution). */
export interface PracticeCliArgs {
  songId: string;
  startMeasure: number;
  endMeasure: number;
  speedStartPct: number | undefined;
  speedTargetPct: number | undefined;
  rampStepPct: number | undefined;
  maxPasses: number | undefined;
}

/**
 * Parse `practice <song-id> --measures <start-end> [--start-speed N] [--target N] [--step N] [--max-passes N]`.
 * Pure — no song lookup, no I/O, no process.exit — so it's directly
 * importable/testable (see cli.test.ts) without pulling in cmdPractice's
 * audio-engine/PracticeLoop machinery. Throws a plain Error with a
 * user-facing message on bad input; cmdPractice converts that into this
 * file's usual "print + exit(1)" pattern (see the header comment on the
 * pre-flight-validation convention, above cmdList).
 */
export function parsePracticeArgs(args: string[]): PracticeCliArgs {
  const songId = args[0];
  if (!songId) {
    throw new Error(
      "Usage: ai-jam-sessions practice <song-id> --measures <start-end> [--start-speed N] [--target N] [--step N] [--max-passes N]"
    );
  }

  const measuresStr = getFlag(args, "--measures");
  if (!measuresStr) {
    throw new Error("Missing required --measures <start-end> (e.g. --measures 5-8).");
  }
  const parts = measuresStr.split("-");
  const startMeasure = parseInt(parts[0], 10);
  const endMeasure = parts[1] !== undefined ? parseInt(parts[1], 10) : startMeasure;
  if (isNaN(startMeasure) || isNaN(endMeasure)) {
    throw new Error(`Invalid --measures range: "${measuresStr}". Use format like "5-8".`);
  }

  const parseOptNum = (flag: string): number | undefined => {
    const v = getFlag(args, flag);
    if (v === null) return undefined;
    const n = parseFloat(v);
    if (isNaN(n)) throw new Error(`Invalid ${flag}: "${v}" (expected a number).`);
    return n;
  };
  const speedStartPct = parseOptNum("--start-speed");
  const speedTargetPct = parseOptNum("--target");
  const rampStepPct = parseOptNum("--step");

  const maxPassesStr = getFlag(args, "--max-passes");
  let maxPasses: number | undefined;
  if (maxPassesStr !== null) {
    maxPasses = parseInt(maxPassesStr, 10);
    if (isNaN(maxPasses)) {
      throw new Error(`Invalid --max-passes: "${maxPassesStr}" (expected an integer).`);
    }
  }

  return { songId, startMeasure, endMeasure, speedStartPct, speedTargetPct, rampStepPct, maxPasses };
}

async function cmdPractice(args: string[]): Promise<void> {
  let parsed: PracticeCliArgs;
  try {
    parsed = parsePracticeArgs(args);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const song = getSong(parsed.songId);
  if (!song) {
    console.error(songNotFoundError(parsed.songId));
    process.exit(1);
  }

  // Pre-flight validation (before touching audio) — mirrors cmdPlay's own
  // early speed/tempo checks, even though PracticeLoop re-validates too.
  let config: ResolvedPracticeLoopConfig;
  try {
    config = resolvePracticeLoopConfig(song, {
      startMeasure: parsed.startMeasure,
      endMeasure: parsed.endMeasure,
      speedStartPct: parsed.speedStartPct,
      speedTargetPct: parsed.speedTargetPct,
      rampStepPct: parsed.rampStepPct,
      maxPasses: parsed.maxPasses,
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const connector = createAudioEngine("grand");
  console.log(`\nStarting piano engine...`);

  try {
    await connector.connect();
    console.log(`Connected!`);

    const loop = new PracticeLoop(song, connector, config, {
      teachingHook: createConsoleTeachingHook(),
      // Task-focused per-pass console summaries (finding 28/35) — notes/
      // timing/measures only, no grades/praise/points.
      onPassComplete: (pass: PracticePassResult) => {
        const cleanLabel = pass.clean ? "clean" : "not clean";
        const nextSpeed = Math.min(config.speedTargetPct, pass.speedPct + config.rampStepPct);
        const advanceNote = pass.advanced ? ` → advancing to ${nextSpeed}%` : "";
        console.log(`  Pass ${pass.passNumber} @ ${pass.speedPct}%: ${cleanLabel} — ${formatPassSummary(pass.result)}${advanceNote}`);
      },
    });

    console.log(`\nPracticing: ${song.title} — measures ${config.startMeasure}–${config.endMeasure}`);
    console.log(`${loop.getState().microGoal}\n`);

    // SIGINT handler for graceful stop — mirrors cmdPlay's own handler.
    const sigintHandler = () => {
      console.log("\n\nStopping practice loop...");
      loop.stop();
    };
    process.on("SIGINT", sigintHandler);

    loop.start();
    await loop.done();
    process.removeListener("SIGINT", sigintHandler);

    const finalState = loop.getState();
    console.log(`\nFinished (${finalState.status}). ${finalState.passes.length} pass(es) played, reached ${finalState.currentSpeedPct}%.`);
    if (finalState.error) {
      console.error(`Practice loop error: ${finalState.error}`);
    }

    // Auto-save journal entry — mirrors cmdPlay's own auto-save, with the
    // last pass's score embedded (buildJournalEntry's optional 4th arg).
    try {
      const lastPass = finalState.passes[finalState.passes.length - 1];
      const snapshot: SessionSnapshot = {
        songId: song.id,
        title: song.title,
        composer: song.composer,
        genre: song.genre,
        difficulty: song.difficulty,
        key: song.key,
        tempo: song.tempo,
        speed: finalState.currentSpeedPct / 100,
        mode: "practice",
        measuresPlayed: finalState.passes.length * (config.endMeasure - config.startMeasure + 1),
        totalMeasures: song.measures.length,
        durationSeconds: 0,
        timestamp: new Date().toISOString(),
      };
      const note = lastPass
        ? `CLI practice loop: measures ${config.startMeasure}-${config.endMeasure}, ${finalState.passes.length} pass(es), ${lastPass.clean ? "clean" : "not clean"} at ${lastPass.speedPct}%.`
        : `CLI practice loop: measures ${config.startMeasure}-${config.endMeasure}, no passes completed.`;
      const entry = buildJournalEntry(snapshot, note, new Date(), lastPass?.result);
      appendJournalEntry(entry);
      console.log("  📝 Session logged to practice journal.");
    } catch (journalErr) {
      const msg = journalErr instanceof Error ? journalErr.message : String(journalErr);
      console.warn(`  ⚠ Could not save journal entry: ${msg}`);
    }

    // A loop that ended in "error" status must exit non-zero — without this,
    // runLoop()'s caught error (see practice-loop.ts's start()) only ever
    // surfaced as a console.error line above, main() still resolved
    // normally, and the process exited 0 even though the loop actually
    // failed mid-run. Thrown AFTER the journal save (still worth recording
    // whatever passes did complete) so it's caught by this function's own
    // catch block below — same EXIT_RUNTIME routing cmdPlay/cmdSing use for
    // a runtime failure.
    if (finalState.status === "error") {
      throw new Error(finalState.error ?? `Practice loop for "${song.title}" ended in an error state.`);
    }
  } catch (err) {
    // Same EXIT_USER/EXIT_RUNTIME routing as cmdPlay/cmdSing — see their
    // own comments on why this goes through handleError() instead of a
    // bare process.exit(1).
    const { handleError } = await import("./errors.js");
    const debug = process.argv.includes("--debug") || process.argv.includes("-D");
    process.exit(handleError(err, debug));
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
  const ports = connector.listPorts();
  if (ports.length > 0) {
    console.log(`\n  Available ports:`);
    for (const p of ports) {
      console.log(`    • ${p}`);
    }
  } else {
    console.log("  No MIDI output ports detected.");
    console.log("\n  Tip: Install loopMIDI (Windows) or use IAC Driver (macOS) to create a virtual MIDI port.");
  }
  console.log();
}

async function cmdView(args: string[]): Promise<void> {
  const songId = args[0];
  if (!songId) {
    console.error("Usage: ai-jam-sessions view <song-id> [--measures 1-8] [--out file.svg]");
    process.exit(1);
  }
  const song = getSong(songId);
  if (!song) {
    console.error(songNotFoundError(songId));
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
    if (startMeasure < 1) {
      console.error(`Invalid --measures range: start must be >= 1 (got ${startMeasure}).`);
      process.exit(1);
    }
    if (startMeasure > song.measures.length) {
      console.error(`Invalid --measures range: start ${startMeasure} exceeds song length (${song.measures.length} measures).`);
      process.exit(1);
    }
    if (endMeasure < startMeasure) {
      console.error(`Invalid --measures range: end ${endMeasure} must be >= start ${startMeasure}.`);
      process.exit(1);
    }
    if (endMeasure > song.measures.length) {
      console.error(`Warning: end measure ${endMeasure} exceeds song length (${song.measures.length}), clamping.`);
      endMeasure = song.measures.length;
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
    // Write to temp file and auto-open
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { writeFileSync } = await import("node:fs");
    const tempPath = join(tmpdir(), `piano-roll-${song.id}.svg`);
    writeFileSync(tempPath, svg, "utf8");
    console.log(`Piano roll written to: ${tempPath}`);
    await openInBrowser(tempPath);
  }
}

async function cmdViewGuitar(args: string[]): Promise<void> {
  const songId = args[0];
  if (!songId) {
    console.error("Usage: ai-jam-sessions view-guitar <song-id> [--measures 1-8] [--tuning standard] [--out file.html]");
    process.exit(1);
  }
  const song = getSong(songId);
  if (!song) {
    console.error(songNotFoundError(songId));
    process.exit(1);
  }

  // Parse --measures flag
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
    if (startMeasure < 1) {
      console.error(`Invalid --measures range: start must be >= 1 (got ${startMeasure}).`);
      process.exit(1);
    }
    if (startMeasure > song.measures.length) {
      console.error(`Invalid --measures range: start ${startMeasure} exceeds song length (${song.measures.length} measures).`);
      process.exit(1);
    }
    if (endMeasure < startMeasure) {
      console.error(`Invalid --measures range: end ${endMeasure} must be >= start ${startMeasure}.`);
      process.exit(1);
    }
    if (endMeasure > song.measures.length) {
      console.error(`Warning: end measure ${endMeasure} exceeds song length (${song.measures.length}), clamping.`);
      endMeasure = song.measures.length;
    }
  }

  // Parse --tuning flag
  const tuning = getFlag(args, "--tuning");
  if (tuning && !GUITAR_TUNING_IDS.includes(tuning as any)) {
    console.error(`Invalid --tuning: "${tuning}". Options: ${GUITAR_TUNING_IDS.join(", ")}`);
    process.exit(1);
  }

  // Parse --tempo flag
  const tempoStr = getFlag(args, "--tempo");
  const tempo = tempoStr ? parseInt(tempoStr, 10) : undefined;

  const outPath = getFlag(args, "--out");

  const html = renderGuitarTab(song, { startMeasure, endMeasure, tuning: tuning ?? undefined, tempo });

  let finalPath: string;
  if (outPath) {
    finalPath = outPath;
  } else {
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    finalPath = join(tmpdir(), `guitar-tab-${song.id}.html`);
  }

  const { writeFileSync } = await import("node:fs");
  writeFileSync(finalPath, html, "utf8");
  console.log(`Guitar tab editor written to: ${finalPath}`);
  if (!outPath) {
    await openInBrowser(finalPath);
  }
  console.log(`  Keyboard shortcuts: Space=play/pause, ↑↓=change string, +/-=fret, Del=delete`);
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
  console.log(`Example: ai-jam-sessions play amazing-grace --keyboard upright\n`);
}

function cmdGuitars(): void {
  const voices = listGuitarVoices();
  console.log(`\nAvailable Guitar Voices:`);
  console.log(`${"─".repeat(80)}`);
  for (const v of voices) {
    const isDefault = v.id === "steel-dreadnought" ? " (default)" : "";
    console.log(`  ${padRight(v.id, 20)} ${v.name}${isDefault}`);
    console.log(`  ${padRight("", 20)} ${v.description}`);
    console.log(`  ${padRight("", 20)} Best for: ${v.suggestedFor.join(", ")}`);
    console.log(`  ${padRight("", 20)} Pluck: ${v.pluckPosition} | Body: ${v.bodyResonanceFreq} Hz | Partials: ${v.maxPartials}`);
    console.log();
  }
  console.log(`Use --engine guitar --guitar-voice <id> with play commands.`);
  console.log(`Example: ai-jam-sessions play autumn-leaves --engine guitar --guitar-voice electric-jazz\n`);
}

function cmdTuneGuitar(args: string[]): void {
  const voiceId = args[0];
  if (!voiceId) {
    console.log(`\nUsage: ai-jam-sessions tune-guitar <voice-id> [--param value ...] [--reset] [--show]`);
    console.log(`\nVoice IDs: ${GUITAR_VOICE_IDS.join(", ")}`);
    console.log(`\nTunable parameters:`);
    for (const p of GUITAR_TUNING_PARAMS) {
      console.log(`  --${padRight(p.key, 18)} ${p.description} (${p.min}–${p.max})`);
    }
    console.log(`\nSpecial flags:`);
    console.log(`  --reset              Reset to factory defaults`);
    console.log(`  --show               Show current config\n`);
    return;
  }

  if (!GUITAR_VOICE_IDS.includes(voiceId as any)) {
    console.error(`Unknown guitar voice: "${voiceId}". Valid: ${GUITAR_VOICE_IDS.join(", ")}`);
    process.exit(1);
  }

  // --reset flag
  if (args.includes("--reset")) {
    const hadOverrides = Object.keys(loadGuitarUserTuning(voiceId)).length > 0;
    resetGuitarUserTuning(voiceId);
    const voice = getGuitarVoice(voiceId)!;
    if (hadOverrides) {
      console.log(`Reset ${voice.name} (${voiceId}) to factory defaults.`);
    } else {
      console.log(`${voice.name} (${voiceId}) was already at factory defaults.`);
    }
    return;
  }

  // --show flag
  if (args.includes("--show")) {
    const base = getGuitarVoice(voiceId)!;
    const merged = getMergedGuitarVoice(voiceId)!;
    const tuning = loadGuitarUserTuning(voiceId);
    console.log(`\n${merged.name} (${voiceId})`);
    console.log(`${"─".repeat(60)}`);
    for (const p of GUITAR_TUNING_PARAMS) {
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
  const overrides: GuitarUserTuning = {};
  for (const p of GUITAR_TUNING_PARAMS) {
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
    console.error(`No tuning parameters specified. Run 'ai-jam-sessions tune-guitar' to see available parameters.`);
    process.exit(1);
  }

  saveGuitarUserTuning(voiceId, overrides);
  const merged = getMergedGuitarVoice(voiceId)!;
  const totalOverrides = Object.keys(loadGuitarUserTuning(voiceId)).length;

  console.log(`\nTuned ${merged.name} (${voiceId}):`);
  for (const [key, val] of Object.entries(overrides)) {
    console.log(`  ${padRight(key, 18)} → ${val}`);
  }
  console.log(`\n${totalOverrides} total override(s) saved. Use --reset to restore factory.\n`);
}

function cmdTune(args: string[]): void {
  const voiceId = args[0];
  if (!voiceId) {
    console.log(`\nUsage: ai-jam-sessions tune <keyboard-id> [--param value ...] [--reset] [--show]`);
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
    console.error(`No tuning parameters specified. Run 'ai-jam-sessions tune' to see available parameters.`);
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
ai-jam-sessions — Play music through your speakers

Commands:
  play <song | file.mid>     Play a song or MIDI file
  practice <song-id> --measures <start-end> [options]  Drill a measure range, ramping speed on clean passes
  view <song-id> [options]   Render a piano roll SVG visualization
  view-guitar <song-id>      Interactive guitar tab editor (opens in browser)
  tune <keyboard> [options]  Tune a keyboard voice (persists across sessions)
  list [--genre <genre>] [--difficulty <level>]  List built-in songs
  info <song-id>             Show song details
  sing <song-id> [options]   Sing along — narrate notes during playback
  keyboards                  List available piano keyboard voices
  guitars                    List available guitar voice presets
  tune-guitar <voice> [opts] Tune a guitar voice (persists across sessions)
  stats                      Registry statistics
  ports                      List MIDI output ports
  version                    Show version
  help                       Show this help

Play options:
  --speed <mult>             Speed multiplier (0.5 = half, 1.0 = normal, 2.0 = double)
  --tempo <bpm>              Override tempo (10-400 BPM, library songs only)
  --mode <mode>              Playback mode: full, measure, hands, loop (library songs only)
  --keyboard <voice>         Piano voice: grand, upright, electric, honkytonk, musicbox, bright
  --engine <engine>          Sound engine: piano, vocal, tract, guitar, synth, piano+synth, guitar+synth
  --guitar-voice <voice>     Guitar voice: classical-nylon, steel-dreadnought, electric-clean, electric-jazz
  --midi                     Output via MIDI instead of built-in engine
  --port <name>              MIDI port name (with --midi)
  --metronome                Enable the metronome click track (library songs only)
  --count-in <bars>          Count-in bars before playback starts (with --metronome). Default: 1
  --record                   Record played notes — printed as a note count when playback finishes

Practice options (see 'practice' command):
  --measures <start-end>     Measure range to drill (e.g. 5-8). Required
  --start-speed <pct>        Starting speed, percent of the song's tempo. Default: 70
  --target <pct>             Target speed, percent of the song's tempo. Default: 100
  --step <pct>               Speed increase per CLEAN pass. Default: 5
  --max-passes <n>           Optional cap on total passes. Default: no cap

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
  ... (run 'ai-jam-sessions tune' for all parameters)

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
  ai-jam-sessions play song.mid                          # play a MIDI file
  ai-jam-sessions play amazing-grace --keyboard upright   # folk on an upright
  ai-jam-sessions play the-entertainer --keyboard honkytonk # ragtime on honky-tonk
  ai-jam-sessions play autumn-leaves --keyboard electric  # jazz on electric piano
  ai-jam-sessions tune grand --brightness 0.3 --decay 5   # tune the grand piano
  ai-jam-sessions tune grand --show                       # see current grand config
  ai-jam-sessions tune grand --reset                      # reset grand to factory
  ai-jam-sessions view autumn-leaves --color pitch-class   # chromatic color view
  ai-jam-sessions keyboards                               # list all piano voices
  ai-jam-sessions guitars                                 # list all guitar voices
  ai-jam-sessions play autumn-leaves --engine guitar       # play on steel dreadnought
  ai-jam-sessions play autumn-leaves --engine guitar --guitar-voice electric-jazz  # jazz guitar
  ai-jam-sessions tune-guitar electric-jazz --pluck-position 0.3 # move pluck toward neck
  ai-jam-sessions list --genre jazz                       # browse jazz songs
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

  console.log(`\n  AI Jam Sessions Song Library — Progress`);
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
  const userDir = join(process.env.HOME ?? process.env.USERPROFILE ?? ".", ".ai-jam-sessions", "songs");
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
      // Force exit: the audio engines (node-web-audio-api) don't release
      // all handles/timers on disconnect(), so the event loop can stay
      // alive indefinitely otherwise. This is a known workaround for that
      // resource-cleanup gap (F-68e883cf), not a general-purpose pattern —
      // fix the underlying engine leak before layering more logic after
      // this exit; a forced exit can truncate buffered stdout/stderr and
      // skips any future 'beforeExit'/'exit' listeners.
      process.exit(0);
      break;
    case "sing":
      await cmdSing(args.slice(1));
      // See the "play" case above — same audio-engine cleanup workaround.
      process.exit(0);
      break;
    case "practice":
      await cmdPractice(args.slice(1));
      // See the "play" case above — same audio-engine cleanup workaround.
      process.exit(0);
      break;
    case "view":
      await cmdView(args.slice(1));
      break;
    case "view-guitar":
    case "tab":
      await cmdViewGuitar(args.slice(1));
      break;
    case "tune":
      cmdTune(args.slice(1));
      break;
    case "keyboards":
      cmdKeyboards();
      break;
    case "guitars":
      cmdGuitars();
      break;
    case "tune-guitar":
      cmdTuneGuitar(args.slice(1));
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
    case "version":
    case "--version":
    case "-V":
      console.log(`ai-jam-sessions v${VERSION}`);
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
        console.error(`Unknown command: "${command}". Run 'ai-jam-sessions help' for usage.`);
        process.exit(1);
      }
  }
}

// ─── Entry guard ────────────────────────────────────────────────────────────
//
// Only run main() when this file is the actual process entry point — NOT
// when it's imported (e.g. by cli.test.ts, which imports parsePlaySessionFlags/
// parsePracticeArgs directly for unit testing). Without this guard, importing
// this module for its pure parser exports would ALSO kick off main() against
// whatever process.argv the IMPORTING process happens to have (the test
// runner's own argv) — the same unsafe-to-import hazard mcp-server.test.ts's
// header comment documents for mcp-server.ts, which has no such guard. Uses
// pathToFileURL() (not a naive `file://${process.argv[1]}` string) so the
// comparison is correct on Windows too (backslashes, drive-letter casing).
//
// realpath argv[1] before comparing (es-main pattern): Node resolves
// import.meta.url to the module's REAL (symlink-resolved) path, but
// process.argv[1] is whatever path the process was actually invoked with —
// on Unix, an npm/pnpm-installed bin is a symlink (e.g.
// node_modules/.bin/ai-jam-sessions -> ../ai-jam-sessions/dist/cli.js), so
// the two strings never matched textually even though they name the same
// file. That made the guard false for every installed-CLI invocation: main()
// never ran, and the process exited 0 having printed nothing. realpathSync
// can throw (e.g. a path that doesn't exist on disk, or an unusual/virtual
// fs) — fall back to path.resolve() (never throws for a string input) so a
// realpath failure degrades to the OLD (pre-fix) comparison rather than
// crashing the entry guard itself.
function resolveArgvMainPath(argvPath: string): string {
  try {
    return realpathSync(argvPath);
  } catch {
    return resolvePathArg(argvPath);
  }
}

const isMainModule = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(resolveArgvMainPath(process.argv[1])).href;

if (isMainModule) {
  main().catch(async (err) => {
    const { handleError } = await import("./errors.js");
    const debug = process.argv.includes("--debug") || process.argv.includes("-D");
    const code = handleError(err, debug);
    process.exit(code);
  });
}
