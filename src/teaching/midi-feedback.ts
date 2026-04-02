// ─── Live Feedback for MIDI Files ───────────────────────────────────────────
//
// Teaching hook that provides real-time encouragement and context-aware
// asides during MIDI file playback. Unlike the library feedback hook (which
// reads SongEntry teaching notes and dynamics), this analyses the raw MIDI
// event stream: velocity shifts, wide leaps, chord density, tempo changes.
//
// Designed to work with PlaybackController's event system.
// ─────────────────────────────────────────────────────────────────────────────

import type { ParsedMidi, MidiNoteEvent } from "../midi/types.js";
import type {
  TeachingHook,
  VoiceDirective,
  VoiceSink,
  AsideDirective,
  AsideSink,
  LiveFeedbackHookOptions,
} from "../types.js";
import { midiToNoteName } from "../note-parser.js";

// ─── Analysis Helpers ───────────────────────────────────────────────────────

/** Detect velocity zone: pp, p, mp, mf, f, ff based on MIDI velocity. */
function velocityToDynamic(velocity: number): string {
  if (velocity < 20) return "pp";
  if (velocity < 45) return "p";
  if (velocity < 65) return "mp";
  if (velocity < 85) return "mf";
  if (velocity < 105) return "f";
  return "ff";
}

/** Dynamics-aware tips (same as library hook). */
const DYNAMICS_TIPS: Record<string, string> = {
  pp: "Very soft passage — light touch, barely pressing the keys.",
  p: "Soft passage — gentle, controlled touch.",
  mp: "Moderately soft — warm, balanced tone.",
  mf: "Moderately loud — confident, full sound.",
  f: "Loud passage — strong, powerful playing.",
  ff: "Very loud — give it full energy!",
};

/** Encouragement phrases. */
const ENCOURAGEMENTS = [
  "Keep it up!",
  "Sounding great!",
  "Nice rhythm!",
  "Beautiful phrasing!",
  "You've got this!",
  "Smooth playing!",
  "Lovely tone!",
  "Great hands!",
];

// ─── MIDI Feedback Options ──────────────────────────────────────────────────

export interface MidiFeedbackOptions extends LiveFeedbackHookOptions {
  /**
   * Warn about large leaps (interval > this many semitones).
   * Default: 12 (one octave).
   */
  leapWarnSemitones?: number;

  /**
   * Warn about dense chords (more notes than this at once).
   * Default: 4.
   */
  denseChordThreshold?: number;
}

// ─── MIDI Feedback Hook ─────────────────────────────────────────────────────

/**
 * Create a live feedback hook for MIDI file playback.
 *
 * Analyses the raw MIDI events to provide:
 * - Voice encouragement every N notes
 * - Aside tips on dynamics changes (velocity zones)
 * - Aside warnings for wide leaps and dense chords
 *
 * @param voiceSink - Voice output callback.
 * @param asideSink - Aside output callback.
 * @param midi - Parsed MIDI file data.
 * @param options - Configuration.
 * @returns Teaching hook with recorded directives for inspection.
 */
export function createMidiFeedbackHook(
  voiceSink: VoiceSink,
  asideSink: AsideSink,
  midi: ParsedMidi,
  options: MidiFeedbackOptions = {}
): TeachingHook & { voiceDirectives: VoiceDirective[]; asideDirectives: AsideDirective[] } {
  const {
    voiceInterval = 16,
    encourageOnDynamics = true,
    warnOnDifficult = true,
    voice,
    speechSpeed = 1.0,
    leapWarnSemitones = 12,
    denseChordThreshold = 4,
  } = options;

  const voiceDirectives: VoiceDirective[] = [];
  const asideDirectives: AsideDirective[] = [];
  let noteCount = 0;
  let lastDynamic = "";
  let lastNote = -1;

  // Pre-compute chord density map (count notes at each time cluster)
  const chordDensityMap = new Map<number, number>();
  const events = midi.events;
  if (events.length > 0) {
    let clusterStart = events[0].time;
    let clusterCount = 1;
    for (let i = 1; i < events.length; i++) {
      if (events[i].time - clusterStart < 0.01) { // 10ms threshold
        clusterCount++;
      } else {
        if (clusterCount >= denseChordThreshold) {
          // Mark all events in this cluster
          for (let j = i - clusterCount; j < i; j++) {
            chordDensityMap.set(j, clusterCount);
          }
        }
        clusterStart = events[i].time;
        clusterCount = 1;
      }
    }
    // Handle last cluster
    if (clusterCount >= denseChordThreshold) {
      for (let j = events.length - clusterCount; j < events.length; j++) {
        chordDensityMap.set(j, clusterCount);
      }
    }
  }

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

    async onMeasureStart(eventIndex: number, _teachingNote, _dynamics) {
      // NOTE: Despite the TeachingHook interface naming this "measureNumber",
      // PlaybackController passes the 1-based event index for MIDI files.

      // Bounds guard: eventIndex is 1-based, so valid range is [1, events.length]
      if (eventIndex < 1 || eventIndex > events.length) return;

      noteCount++;
      const midiEvent = events[eventIndex - 1]; // 1-based to 0-based
      if (!midiEvent) return;

      // ── Dynamics change detection (velocity zones) ──
      if (encourageOnDynamics) {
        const dynamic = velocityToDynamic(midiEvent.velocity);
        if (dynamic !== lastDynamic && lastDynamic !== "") {
          const tip = DYNAMICS_TIPS[dynamic];
          if (tip) {
            await emitAside({
              text: `${tip}`,
              priority: "low",
              reason: "dynamics-change",
              source: `note-${eventIndex}`,
              tags: ["piano-teacher", "midi-feedback", "dynamics"],
            });
          }
        }
        lastDynamic = dynamic;
      }

      // ── Wide leap warning ──
      if (warnOnDifficult && lastNote >= 0) {
        const interval = Math.abs(midiEvent.note - lastNote);
        if (interval >= leapWarnSemitones) {
          const fromName = midiToNoteName(lastNote);
          const toName = midiToNoteName(midiEvent.note);
          await emitAside({
            text: `Big leap: ${fromName} → ${toName} (${interval} semitones). Prepare your hand position.`,
            priority: "med",
            reason: "difficulty-warning",
            source: `note-${eventIndex}`,
            tags: ["piano-teacher", "midi-feedback", "leap"],
          });
        }
      }
      lastNote = midiEvent.note;

      // ── Dense chord warning (first note of a dense cluster only) ──
      if (warnOnDifficult && chordDensityMap.has(eventIndex - 1)) {
        const density = chordDensityMap.get(eventIndex - 1)!;
        // Only warn on the first note of each dense cluster
        const prevInSameCluster = eventIndex >= 2 &&
          events[eventIndex - 2] &&
          Math.abs(events[eventIndex - 2].time - midiEvent.time) < 0.01;
        if (!prevInSameCluster) {
          await emitAside({
            text: `Dense chord ahead: ${density} notes at once. Spread your fingers.`,
            priority: "med",
            reason: "difficulty-warning",
            source: `note-${eventIndex}`,
            tags: ["piano-teacher", "midi-feedback", "chord"],
          });
        }
      }

      // ── Periodic voice encouragement ──
      if (voiceInterval > 0 && noteCount % voiceInterval === 0) {
        const phrase = ENCOURAGEMENTS[noteCount % ENCOURAGEMENTS.length];
        await emitVoice({
          text: phrase,
          voice,
          speed: speechSpeed,
          blocking: false,
        });
      }
    },

    async onKeyMoment(moment) {
      // MIDI files don't have key moments, but support the interface
      await emitVoice({
        text: moment,
        voice,
        speed: speechSpeed,
        blocking: false,
      });
    },

    async onSongComplete(eventsPlayed, songTitle) {
      const durationMin = Math.round(midi.durationSeconds / 60);
      await emitVoice({
        text: `Great work on ${songTitle}! ${eventsPlayed} notes over ${durationMin > 0 ? `${durationMin} minute${durationMin !== 1 ? "s" : ""}` : "less than a minute"}.`,
        voice,
        speed: speechSpeed,
        blocking: false,
      });
      await emitAside({
        text: `Session complete: ${songTitle} — ${eventsPlayed} notes played at ${midi.bpm} BPM.`,
        priority: "low",
        reason: "session-complete",
        tags: ["piano-teacher", "midi-feedback", "completion"],
      });
    },

    async push(interjection) {
      await emitAside({
        text: interjection.text,
        priority: interjection.priority,
        reason: interjection.reason,
        source: interjection.source,
        tags: ["piano-teacher", "midi-feedback", interjection.reason],
      });
    },
  };
}
