// ─── ai-jam-sessions: Teaching Engine ────────────────────────────────────────
//
// Provides TeachingHook implementations that deliver teaching interjections
// during playback. The session engine calls these hooks at key moments.
//
// Implementations:
//   - ConsoleTeachingHook: logs to console (development/CLI)
//   - SilentTeachingHook: no-op (testing/benchmarks)
//   - CallbackTeachingHook: routes to custom callbacks (MCP/voice/aside)
//   - SingAlongHook: narrates note names/solfege/contour during playback
// ─────────────────────────────────────────────────────────────────────────────

import type {
  TeachingHook,
  TeachingInterjection,
  TeachingPriority,
  VoiceDirective,
  VoiceSink,
  AsideDirective,
  AsideSink,
  LiveFeedbackHookOptions,
} from "./types.js";
import type { SongEntry } from "./songs/types.js";

// ─── Console Hook (CLI / development) ───────────────────────────────────────

/**
 * Logs teaching interjections to the console.
 * Good for CLI mode and development.
 */
export function createConsoleTeachingHook(): TeachingHook {
  return {
    async onMeasureStart(measureNumber, teachingNote, dynamics) {
      const parts: string[] = [`  [Measure ${measureNumber}]`];
      if (dynamics) parts.push(`(${dynamics})`);
      if (teachingNote) parts.push(`— ${teachingNote}`);
      console.log(parts.join(" "));
    },

    async onKeyMoment(moment) {
      console.log(`  ★ ${moment}`);
    },

    async onSongComplete(measuresPlayed, songTitle) {
      console.log(`\n  ✓ Finished "${songTitle}" — ${measuresPlayed} measures played.`);
    },

    async push(interjection) {
      const prefix =
        interjection.priority === "high" ? "❗" :
        interjection.priority === "med" ? "💡" : "ℹ️";
      console.log(`  ${prefix} ${interjection.text}`);
    },
  };
}

// ─── Silent Hook (testing) ──────────────────────────────────────────────────

/**
 * No-op hook — swallows all interjections.
 * Use in tests where you don't want console noise.
 */
export function createSilentTeachingHook(): TeachingHook {
  return {
    async onMeasureStart() {},
    async onKeyMoment() {},
    async onSongComplete() {},
    async push() {},
  };
}

// ─── Recording Hook (testing) ───────────────────────────────────────────────

/** A recorded teaching event for assertions. */
export interface TeachingEvent {
  type: "measure-start" | "key-moment" | "song-complete" | "push";
  measureNumber?: number;
  teachingNote?: string;
  dynamics?: string;
  moment?: string;
  measuresPlayed?: number;
  songTitle?: string;
  interjection?: TeachingInterjection;
}

/**
 * Records all teaching events for test assertions.
 * Use: `const hook = createRecordingTeachingHook(); ... hook.events`
 */
export function createRecordingTeachingHook(): TeachingHook & { events: TeachingEvent[] } {
  const events: TeachingEvent[] = [];

  return {
    events,

    async onMeasureStart(measureNumber, teachingNote, dynamics) {
      events.push({ type: "measure-start", measureNumber, teachingNote, dynamics });
    },

    async onKeyMoment(moment) {
      events.push({ type: "key-moment", moment });
    },

    async onSongComplete(measuresPlayed, songTitle) {
      events.push({ type: "song-complete", measuresPlayed, songTitle });
    },

    async push(interjection) {
      events.push({ type: "push", interjection });
    },
  };
}

// ─── Callback Hook (flexible routing) ───────────────────────────────────────

/** Callbacks for a custom teaching hook. All optional — unset = no-op. */
export interface TeachingCallbacks {
  onMeasureStart?: (measureNumber: number, teachingNote?: string, dynamics?: string) => Promise<void>;
  onKeyMoment?: (moment: string) => Promise<void>;
  onSongComplete?: (measuresPlayed: number, songTitle: string) => Promise<void>;
  onPush?: (interjection: TeachingInterjection) => Promise<void>;
}

/**
 * Routes teaching events to custom callbacks.
 * Use this to wire to mcp-voice-soundboard, mcp-aside, or any other sink.
 */
export function createCallbackTeachingHook(callbacks: TeachingCallbacks): TeachingHook {
  return {
    async onMeasureStart(measureNumber, teachingNote, dynamics) {
      await callbacks.onMeasureStart?.(measureNumber, teachingNote, dynamics);
    },
    async onKeyMoment(moment) {
      await callbacks.onKeyMoment?.(moment);
    },
    async onSongComplete(measuresPlayed, songTitle) {
      await callbacks.onSongComplete?.(measuresPlayed, songTitle);
    },
    async push(interjection) {
      await callbacks.onPush?.(interjection);
    },
  };
}

// ─── Voice Hook (mcp-voice-soundboard) ──────────────────────────────────────

/** Options for the voice teaching hook. */
export interface VoiceHookOptions {
  /** Voice preset name for teaching (default: undefined = server default). */
  voice?: string;

  /** Speech speed (default: 1.0). */
  speechSpeed?: number;

  /** Speak teaching notes at measure start (default: true). */
  speakTeachingNotes?: boolean;

  /** Speak key moments (default: true). */
  speakKeyMoments?: boolean;

  /** Speak completion message (default: true). */
  speakCompletion?: boolean;

  /** Block playback while speaking (default: false for notes, true for key moments). */
  blockOnKeyMoments?: boolean;
}

/**
 * Voice teaching hook — produces VoiceDirective objects routed to a VoiceSink.
 *
 * The sink can be:
 * - A real mcp-voice-soundboard call (via LLM tool routing)
 * - A console.log wrapper (for CLI testing)
 * - A recording array (for unit tests)
 *
 * Also records all directives for inspection.
 */
export function createVoiceTeachingHook(
  sink: VoiceSink,
  options: VoiceHookOptions = {}
): TeachingHook & { directives: VoiceDirective[] } {
  const {
    voice,
    speechSpeed = 1.0,
    speakTeachingNotes = true,
    speakKeyMoments = true,
    speakCompletion = true,
    blockOnKeyMoments = true,
  } = options;

  const directives: VoiceDirective[] = [];

  async function emit(directive: VoiceDirective): Promise<void> {
    directives.push(directive);
    await sink(directive);
  }

  return {
    directives,

    async onMeasureStart(measureNumber, teachingNote, dynamics) {
      if (!speakTeachingNotes || !teachingNote) return;

      const dynamicsPart = dynamics ? ` Play ${dynamics}.` : "";
      await emit({
        text: `Measure ${measureNumber}.${dynamicsPart} ${teachingNote}`,
        voice,
        speed: speechSpeed,
        blocking: false, // don't block on routine notes
      });
    },

    async onKeyMoment(moment) {
      if (!speakKeyMoments) return;

      await emit({
        text: moment,
        voice,
        speed: speechSpeed,
        blocking: blockOnKeyMoments,
      });
    },

    async onSongComplete(measuresPlayed, songTitle) {
      if (!speakCompletion) return;

      await emit({
        text: `Great work! You finished ${songTitle}. ${measuresPlayed} measures played.`,
        voice,
        speed: speechSpeed,
        blocking: false,
      });
    },

    async push(interjection) {
      const urgency = interjection.priority === "high" ? "Important: " : "";
      await emit({
        text: `${urgency}${interjection.text}`,
        voice,
        speed: speechSpeed,
        blocking: interjection.priority === "high",
      });
    },
  };
}

// ─── Aside Hook (mcp-aside interjections) ───────────────────────────────────

/** Options for the aside teaching hook. */
export interface AsideHookOptions {
  /** Push teaching notes to aside (default: true). */
  pushTeachingNotes?: boolean;

  /** Push key moments to aside (default: true). */
  pushKeyMoments?: boolean;

  /** Push completion to aside (default: true). */
  pushCompletion?: boolean;

  /** Base tags added to all directives. */
  baseTags?: string[];
}

/**
 * Aside teaching hook — produces AsideDirective objects routed to an AsideSink.
 *
 * The sink can be:
 * - A real mcp-aside push (via aside_push tool)
 * - A recording array (for tests)
 *
 * Records all directives for inspection.
 */
export function createAsideTeachingHook(
  sink: AsideSink,
  options: AsideHookOptions = {}
): TeachingHook & { directives: AsideDirective[] } {
  const {
    pushTeachingNotes = true,
    pushKeyMoments = true,
    pushCompletion = true,
    baseTags = ["piano-teacher"],
  } = options;

  const directives: AsideDirective[] = [];

  async function emit(directive: AsideDirective): Promise<void> {
    directives.push(directive);
    await sink(directive);
  }

  return {
    directives,

    async onMeasureStart(measureNumber, teachingNote, dynamics) {
      if (!pushTeachingNotes || !teachingNote) return;

      const dynamicsPart = dynamics ? ` (${dynamics})` : "";
      await emit({
        text: `Measure ${measureNumber}${dynamicsPart}: ${teachingNote}`,
        priority: "low",
        reason: "measure-start",
        source: `measure-${measureNumber}`,
        tags: [...baseTags, "teaching-note"],
      });
    },

    async onKeyMoment(moment) {
      if (!pushKeyMoments) return;

      await emit({
        text: moment,
        priority: "med",
        reason: "key-moment",
        tags: [...baseTags, "key-moment"],
      });
    },

    async onSongComplete(measuresPlayed, songTitle) {
      if (!pushCompletion) return;

      await emit({
        text: `Finished "${songTitle}" — ${measuresPlayed} measures played.`,
        priority: "low",
        reason: "song-complete",
        tags: [...baseTags, "completion"],
      });
    },

    async push(interjection) {
      await emit({
        text: interjection.text,
        priority: interjection.priority,
        reason: interjection.reason,
        source: interjection.source,
        tags: [...baseTags, interjection.reason],
      });
    },
  };
}

// ─── Sing-Along Hook (note narration) ────────────────────────────────────────

import {
  measureToSingableText,
  type SingAlongMode,
} from "./note-parser.js";

/** Options for the sing-along teaching hook. */
export interface SingAlongHookOptions {
  /** Sing-along mode (default: "note-names"). */
  mode?: SingAlongMode;

  /** Which hand(s) to narrate (default: "right"). */
  hand?: "right" | "left" | "both";

  /** Voice preset (default: undefined = server default). */
  voice?: string;

  /** Speech speed (default: 1.0). */
  speechSpeed?: number;

  /** Announce the measure number before notes (default: true). */
  announceMeasureNumber?: boolean;

  /** Speak completion message (default: true). */
  speakCompletion?: boolean;
}

/**
 * Sing-along teaching hook — narrates note names/solfege/contour/syllables
 * from the actual measure data, synchronized with playback.
 *
 * Requires the full SongEntry to look up measure note data by measure number.
 * Emits blocking VoiceDirectives on onMeasureStart so the voice speaks BEFORE
 * the piano plays each measure.
 *
 * Composable with other hooks via composeTeachingHooks.
 */
export function createSingAlongHook(
  sink: VoiceSink,
  song: SongEntry,
  options: SingAlongHookOptions = {}
): TeachingHook & { directives: VoiceDirective[] } {
  const {
    mode = "note-names",
    hand = "right",
    voice,
    speechSpeed = 1.0,
    announceMeasureNumber = true,
    speakCompletion = true,
  } = options;

  const directives: VoiceDirective[] = [];

  // Pre-index measures by number for O(1) lookup
  const measureMap = new Map<number, { rightHand: string; leftHand: string }>();
  for (const m of song.measures) {
    measureMap.set(m.number, { rightHand: m.rightHand, leftHand: m.leftHand });
  }

  async function emit(directive: VoiceDirective): Promise<void> {
    directives.push(directive);
    await sink(directive);
  }

  return {
    directives,

    async onMeasureStart(measureNumber, _teachingNote, _dynamics) {
      const measure = measureMap.get(measureNumber);
      if (!measure) return;

      const singableText = measureToSingableText(measure, { mode, hand });
      if (!singableText) return;

      const prefix = announceMeasureNumber ? `Measure ${measureNumber}: ` : "";
      await emit({
        text: `${prefix}${singableText}`,
        voice,
        speed: speechSpeed,
        blocking: true, // speak BEFORE piano plays
      });
    },

    async onKeyMoment(_moment) {
      // Sing-along hook does not speak key moments
      // (compose with a voice hook if you want both)
    },

    async onSongComplete(measuresPlayed, songTitle) {
      if (!speakCompletion) return;
      await emit({
        text: `Finished singing along to ${songTitle}! ${measuresPlayed} measures.`,
        voice,
        speed: speechSpeed,
        blocking: false,
      });
    },

    async push(_interjection) {
      // Sing-along hook does not speak push interjections
    },
  };
}

// ─── Live Feedback Hook (voice + aside during singing) ───────────────────────

/** Encouragement phrases keyed by context. */
const ENCOURAGEMENTS = [
  "Keep it up!",
  "Sounding great!",
  "Nice rhythm!",
  "Beautiful phrasing!",
  "You've got this!",
  "Smooth playing!",
];

/** Dynamics-aware aside tips. */
const DYNAMICS_TIPS: Record<string, string> = {
  pp: "Pianissimo — very soft, barely touching the keys.",
  p: "Piano — play gently, light touch.",
  mp: "Mezzo-piano — moderately soft, warm tone.",
  mf: "Mezzo-forte — moderately loud, confident touch.",
  f: "Forte — play strong, full sound.",
  ff: "Fortissimo — very loud, powerful!",
  crescendo: "Building intensity — lean into the crescendo.",
  decrescendo: "Pulling back — ease off gradually.",
  dim: "Diminuendo — getting softer, let the sound fade.",
};

/**
 * Live feedback teaching hook — pushes context-aware encouragement and tips
 * during singing/playback sessions via both voice and aside sinks.
 *
 * - Voice: periodic encouragement every N measures + key moment reactions
 * - Aside: dynamics tips, fingering warnings, deeper contextual notes
 *
 * Composable with other hooks via composeTeachingHooks.
 */
export function createLiveFeedbackHook(
  voiceSink: VoiceSink,
  asideSink: AsideSink,
  song: SongEntry,
  options: LiveFeedbackHookOptions = {}
): TeachingHook & { voiceDirectives: VoiceDirective[]; asideDirectives: AsideDirective[] } {
  const {
    voiceInterval = 4,
    encourageOnDynamics = true,
    warnOnDifficult = true,
    voice,
    speechSpeed = 1.0,
  } = options;

  const voiceDirectives: VoiceDirective[] = [];
  const asideDirectives: AsideDirective[] = [];
  let measureCount = 0;
  let lastDynamics: string | undefined;

  async function emitVoice(directive: VoiceDirective): Promise<void> {
    voiceDirectives.push(directive);
    await voiceSink(directive);
  }

  async function emitAside(directive: AsideDirective): Promise<void> {
    asideDirectives.push(directive);
    await asideSink(directive);
  }

  return {
    voiceDirectives,
    asideDirectives,

    async onMeasureStart(measureNumber, teachingNote, dynamics) {
      measureCount++;

      // ── Dynamics change → aside tip ──
      if (encourageOnDynamics && dynamics && dynamics !== lastDynamics) {
        const tip = DYNAMICS_TIPS[dynamics.toLowerCase()] ??
          `${dynamics} — adjust your touch accordingly.`;
        await emitAside({
          text: `Measure ${measureNumber}: ${tip}`,
          priority: "low",
          reason: "dynamics-change",
          source: `measure-${measureNumber}`,
          tags: ["piano-teacher", "live-feedback", "dynamics"],
        });
      }
      lastDynamics = dynamics;

      // ── Difficult passage warning → aside ──
      if (warnOnDifficult && teachingNote) {
        const lower = teachingNote.toLowerCase();
        if (lower.includes("watch") || lower.includes("tricky") ||
            lower.includes("careful") || lower.includes("difficult") ||
            lower.includes("finger")) {
          await emitAside({
            text: `Heads up at measure ${measureNumber}: ${teachingNote}`,
            priority: "med",
            reason: "difficulty-warning",
            source: `measure-${measureNumber}`,
            tags: ["piano-teacher", "live-feedback", "warning"],
          });
        }
      }

      // ── Periodic voice encouragement ──
      if (voiceInterval > 0 && measureCount % voiceInterval === 0) {
        const phrase = ENCOURAGEMENTS[measureCount % ENCOURAGEMENTS.length];
        await emitVoice({
          text: phrase,
          voice,
          speed: speechSpeed,
          blocking: false,
        });
      }
    },

    async onKeyMoment(moment) {
      await emitVoice({
        text: `Watch for this: ${moment}`,
        voice,
        speed: speechSpeed,
        blocking: false,
      });
    },

    async onSongComplete(measuresPlayed, songTitle) {
      await emitVoice({
        text: `Fantastic work on ${songTitle}! You played through all ${measuresPlayed} measures.`,
        voice,
        speed: speechSpeed,
        blocking: false,
      });
      await emitAside({
        text: `Session complete: ${songTitle} — ${measuresPlayed} measures played. Great practice session!`,
        priority: "low",
        reason: "session-complete",
        tags: ["piano-teacher", "live-feedback", "completion"],
      });
    },

    async push(interjection) {
      // Route pushes to aside
      await emitAside({
        text: interjection.text,
        priority: interjection.priority,
        reason: interjection.reason,
        source: interjection.source,
        tags: ["piano-teacher", "live-feedback", interjection.reason],
      });
    },
  };
}

/**
 * Compose multiple teaching hooks into one.
 * Events are dispatched to all hooks in order (serially, not parallel).
 *
 * Example: combine a voice hook + aside hook + recording hook for full coverage.
 */
export function composeTeachingHooks(...hooks: TeachingHook[]): TeachingHook {
  return {
    async onMeasureStart(measureNumber, teachingNote, dynamics) {
      for (const h of hooks) await h.onMeasureStart(measureNumber, teachingNote, dynamics);
    },
    async onKeyMoment(moment) {
      for (const h of hooks) await h.onKeyMoment(moment);
    },
    async onSongComplete(measuresPlayed, songTitle) {
      for (const h of hooks) await h.onSongComplete(measuresPlayed, songTitle);
    },
    async push(interjection) {
      for (const h of hooks) await h.push(interjection);
    },
  };
}

// ─── Key Moment Detector ────────────────────────────────────────────────────

/**
 * Check if the current measure matches any key moments in the song.
 * Key moments in ai-music-sheets reference bars like "Bar 1:", "Bars 3-4:", etc.
 */
export function detectKeyMoments(
  song: SongEntry,
  measureNumber: number
): string[] {
  const matches: string[] = [];
  for (const km of song.musicalLanguage.keyMoments) {
    // Match patterns like "Bar 1:", "Bars 1-2:", "Bar 9:"
    const singleMatch = km.match(/^Bars?\s+(\d+)\s*:/i);
    const rangeMatch = km.match(/^Bars?\s+(\d+)\s*-\s*(\d+)\s*:/i);

    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      if (measureNumber >= start && measureNumber <= end) {
        matches.push(km);
      }
    } else if (singleMatch) {
      const bar = parseInt(singleMatch[1], 10);
      if (bar === measureNumber) {
        matches.push(km);
      }
    }
  }
  return matches;
}
