// ─── Live MIDI Teaching Feedback (Position-Aware) ───────────────────────────
//
// Position-aware teaching hook that uses the PositionTracker to provide
// measure-level feedback during MIDI playback. Unlike the basic
// createMidiFeedbackHook (which reacts to individual note events), this
// hook operates at the measure level — detecting patterns, phrasing,
// section transitions, and difficulty ahead of time.
//
// This is what makes the teacher feel like they're sitting next to you:
// they see what's coming and comment on it before you get there.
// ─────────────────────────────────────────────────────────────────────────────

import type { ParsedMidi } from "../midi/types.js";
import type {
  TeachingHook,
  VoiceDirective,
  VoiceSink,
  AsideDirective,
  AsideSink,
} from "../types.js";
import { PositionTracker } from "../playback/position.js";
import { midiToNoteName } from "../note-parser.js";

// ─── Pattern Detection ──────────────────────────────────────────────────────

/** Detect if a measure has a large range (hands spread wide). */
function detectWideRange(minNote: number, maxNote: number): string | null {
  const range = maxNote - minNote;
  if (range >= 24) return `Wide range — ${midiToNoteName(minNote)} to ${midiToNoteName(maxNote)} (${range} semitones). Stretch those hands.`;
  if (range >= 18) return `Spread out: ${midiToNoteName(minNote)} to ${midiToNoteName(maxNote)}. Keep your wrists relaxed.`;
  return null;
}

/** Detect sudden velocity shift compared to previous measure. */
function detectVelocityShift(prevAvg: number, currAvg: number): string | null {
  const diff = currAvg - prevAvg;
  if (diff > 30) return "Sudden jump in volume — lean into it with confidence.";
  if (diff < -30) return "Dropping to a whisper — lighten your touch gradually.";
  return null;
}

/** Detect dense measure (lots of notes). */
function detectDensity(noteCount: number): string | null {
  if (noteCount >= 12) return `Busy passage ahead — ${noteCount} notes in this measure. Stay steady.`;
  if (noteCount >= 8) return `Active measure — ${noteCount} notes. Keep the tempo even.`;
  return null;
}

/** Detect sparse measure (breathing room). */
function detectSparse(noteCount: number, prevCount: number): string | null {
  if (noteCount <= 2 && prevCount >= 6) return "Space to breathe — let the notes ring.";
  return null;
}

/** Detect if we're approaching a section boundary (long gap between measures). */
function detectSectionBoundary(
  tracker: PositionTracker,
  measure: number
): string | null {
  if (measure >= tracker.totalMeasures) return null;
  const currEvents = tracker.eventsInMeasure(measure);
  const nextEvents = tracker.eventsInMeasure(measure + 1);
  if (currEvents.length === 0 || nextEvents.length === 0) return null;

  // Reduce, not Math.max/min(...spread) — avoids the call-stack limit a
  // large event array could hit (same class of bug as B-A1-001).
  const lastNoteEnd = currEvents.reduce((m, e) => Math.max(m, e.time + e.duration), -Infinity);
  const nextNoteStart = nextEvents.reduce((m, e) => Math.min(m, e.time), Infinity);
  const gap = nextNoteStart - lastNoteEnd;

  // A full measure's rest or more suggests a section boundary
  if (gap > 2.0) return "Natural break coming up — good place to breathe.";
  return null;
}

// ─── Encouragement Phrases ──────────────────────────────────────────────────

const MEASURE_ENCOURAGEMENTS = [
  "Great flow!",
  "Keep that steady pulse!",
  "Nice touch!",
  "Solid rhythm!",
  "Beautiful!",
  "You're in the groove!",
  "Smooth!",
  "That's the way!",
];

const MILESTONE_MESSAGES: Record<number, string> = {
  25: "Quarter of the way through — you're doing great!",
  50: "Halfway there — keep the energy up!",
  75: "Three quarters done — bring it home!",
};

// ─── Options ────────────────────────────────────────────────────────────────

export interface LiveMidiFeedbackOptions {
  /** Emit voice encouragement every N measures (default: 8). */
  voiceInterval?: number;
  /** Warn about wide range passages (default: true). */
  warnOnWideRange?: boolean;
  /** Warn about velocity shifts (default: true). */
  warnOnVelocityShift?: boolean;
  /** Warn about dense passages (default: true). */
  warnOnDensity?: boolean;
  /** Detect section boundaries (default: true). */
  detectSections?: boolean;
  /** Announce milestone percentages (default: true). */
  announceMilestones?: boolean;
  /** Voice preset. */
  voice?: string;
  /** Speech speed. Default: 1.0. */
  speechSpeed?: number;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Create a position-aware live feedback hook for MIDI playback.
 *
 * Uses PositionTracker to analyse measure context before each measure plays.
 * Provides: range warnings, velocity shift detection, density alerts,
 * section boundary markers, milestone announcements, periodic encouragement.
 *
 * Designed to be composed with createSingOnMidiHook for the full experience.
 */
export function createLiveMidiFeedbackHook(
  voiceSink: VoiceSink,
  asideSink: AsideSink,
  midi: ParsedMidi,
  options: LiveMidiFeedbackOptions = {}
): TeachingHook & {
  voiceDirectives: VoiceDirective[];
  asideDirectives: AsideDirective[];
  tracker: PositionTracker;
} {
  const {
    voiceInterval = 8,
    warnOnWideRange = true,
    warnOnVelocityShift = true,
    warnOnDensity = true,
    detectSections = true,
    announceMilestones = true,
    voice,
    speechSpeed = 1.0,
  } = options;

  const tracker = new PositionTracker(midi);
  const voiceDirectives: VoiceDirective[] = [];
  const asideDirectives: AsideDirective[] = [];

  // Pre-compute measure summaries for lookahead
  const measureSummaries = new Map<number, ReturnType<PositionTracker["measureSummary"]>>();
  for (let m = 1; m <= tracker.totalMeasures; m++) {
    measureSummaries.set(m, tracker.measureSummary(m));
  }

  let lastMeasureAnnounced = 0;
  let measureCounter = 0;
  let lastAnnouncedMilestone = 0;
  let prevMeasureSummary: ReturnType<PositionTracker["measureSummary"]> | null = null;

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
    tracker,

    async onMeasureStart(eventIndex, _teachingNote, _dynamics) {
      // Map event index to measure number via position tracker
      const event = midi.events[eventIndex - 1];
      if (!event) return;

      const snapshot = tracker.snapshotAt(event.time);
      const currentMeasure = snapshot.measure;

      // Only process each measure once
      if (currentMeasure === lastMeasureAnnounced) return;
      lastMeasureAnnounced = currentMeasure;
      measureCounter++;

      const summary = measureSummaries.get(currentMeasure);
      if (!summary || summary.noteCount === 0) return;

      // ── Wide range warning ──
      if (warnOnWideRange) {
        const rangeWarning = detectWideRange(summary.minNote, summary.maxNote);
        if (rangeWarning) {
          await emitAside({
            text: `Measure ${currentMeasure}: ${rangeWarning}`,
            priority: "med",
            reason: "difficulty-warning",
            source: `measure-${currentMeasure}`,
            tags: ["piano-teacher", "live-feedback", "range"],
          });
        }
      }

      // ── Velocity shift ──
      if (warnOnVelocityShift && prevMeasureSummary && prevMeasureSummary.noteCount > 0) {
        const shift = detectVelocityShift(prevMeasureSummary.avgVelocity, summary.avgVelocity);
        if (shift) {
          await emitAside({
            text: `Measure ${currentMeasure}: ${shift}`,
            priority: "low",
            reason: "dynamics-change",
            source: `measure-${currentMeasure}`,
            tags: ["piano-teacher", "live-feedback", "dynamics"],
          });
        }
      }

      // ── Density warning ──
      if (warnOnDensity) {
        const densityWarning = detectDensity(summary.noteCount);
        if (densityWarning) {
          await emitAside({
            text: `Measure ${currentMeasure}: ${densityWarning}`,
            priority: "low",
            reason: "difficulty-warning",
            source: `measure-${currentMeasure}`,
            tags: ["piano-teacher", "live-feedback", "density"],
          });
        }

        if (prevMeasureSummary) {
          const sparseMsg = detectSparse(summary.noteCount, prevMeasureSummary.noteCount);
          if (sparseMsg) {
            await emitAside({
              text: `Measure ${currentMeasure}: ${sparseMsg}`,
              priority: "low",
              reason: "style-tip",
              source: `measure-${currentMeasure}`,
              tags: ["piano-teacher", "live-feedback", "phrasing"],
            });
          }
        }
      }

      // ── Section boundary ──
      if (detectSections) {
        const boundary = detectSectionBoundary(tracker, currentMeasure);
        if (boundary) {
          await emitAside({
            text: `Measure ${currentMeasure}: ${boundary}`,
            priority: "low",
            reason: "style-tip",
            source: `measure-${currentMeasure}`,
            tags: ["piano-teacher", "live-feedback", "section"],
          });
        }
      }

      // ── Milestone announcements ──
      if (announceMilestones && tracker.totalMeasures > 0) {
        const percent = Math.round((currentMeasure / tracker.totalMeasures) * 100);
        for (const [milestone, msg] of Object.entries(MILESTONE_MESSAGES)) {
          const ms = Number(milestone);
          if (percent >= ms && lastAnnouncedMilestone < ms) {
            lastAnnouncedMilestone = ms;
            await emitVoice({
              text: msg,
              voice,
              speed: speechSpeed,
              blocking: false,
            });
          }
        }
      }

      // ── Periodic encouragement ──
      if (voiceInterval > 0 && measureCounter % voiceInterval === 0) {
        const phrase = MEASURE_ENCOURAGEMENTS[measureCounter % MEASURE_ENCOURAGEMENTS.length];
        await emitVoice({
          text: phrase,
          voice,
          speed: speechSpeed,
          blocking: false,
        });
      }

      prevMeasureSummary = summary;
    },

    async onKeyMoment(moment) {
      await emitVoice({
        text: moment,
        voice,
        speed: speechSpeed,
        blocking: false,
      });
    },

    async onSongComplete(eventsPlayed, songTitle) {
      const durationMin = Math.round(midi.durationSeconds / 60);
      const timeStr = durationMin > 0
        ? `${durationMin} minute${durationMin !== 1 ? "s" : ""}`
        : "less than a minute";
      await emitVoice({
        text: `Excellent work on ${songTitle}! ${eventsPlayed} notes across ${tracker.totalMeasures} measures in ${timeStr}.`,
        voice,
        speed: speechSpeed,
        blocking: false,
      });
      await emitAside({
        text: `Session complete: ${songTitle} — ${tracker.totalMeasures} measures, ${eventsPlayed} notes at ${midi.bpm} BPM.`,
        priority: "low",
        reason: "session-complete",
        tags: ["piano-teacher", "live-feedback", "completion"],
      });
    },

    async push(interjection) {
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
