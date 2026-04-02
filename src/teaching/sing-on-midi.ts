// ─── Sing-Along for MIDI Files ──────────────────────────────────────────────
//
// Teaching hook that generates singable text from raw MIDI note events.
// Unlike the library sing-along hook (which reads measure data from SongEntry),
// this hook reads the actual MidiNoteEvent stream and converts MIDI note numbers
// to singable syllables (note-names, solfege, contour, or syllables).
//
// Supports voice filters:
// - "all" — sing every note/chord (default)
// - "melody-only" — pick the highest note per cluster (typical melody line)
// - "harmony" — pick the lowest note per cluster (bass/harmony line)
//
// Designed to work with PlaybackController — listens to note events in real time.
// ─────────────────────────────────────────────────────────────────────────────

import type { ParsedMidi, MidiNoteEvent } from "../midi/types.js";
import type { TeachingHook, VoiceDirective, VoiceSink } from "../types.js";
import { midiToNoteName } from "../note-parser.js";
import type { SingAlongMode } from "../note-parser.js";
import { clusterEvents } from "../playback/timing.js";

// ─── MIDI Note → Singable Conversion ────────────────────────────────────────

/** Solfege mapping from pitch class (0–11) to syllable. */
const SOLFEGE_BY_PITCH_CLASS: string[] = [
  "Do", "Di", "Re", "Me", "Mi", "Fa",
  "Fi", "Sol", "Le", "La", "Te", "Ti",
];

/**
 * Convert a MIDI note number to a singable syllable.
 *
 * - "note-names": "C4", "F#5", "Bb3"
 * - "solfege": "Do", "Re", "Mi" (based on pitch class, not key)
 * - "syllables": always "da"
 * - "contour": not applicable for individual notes (returns note name)
 */
export function midiNoteToSingable(note: number, mode: SingAlongMode): string {
  switch (mode) {
    case "note-names":
      return midiToNoteName(note);
    case "solfege":
      return SOLFEGE_BY_PITCH_CLASS[note % 12];
    case "syllables":
      return "da";
    case "contour":
      return midiToNoteName(note);
  }
}

/**
 * Convert a cluster (chord or single note) to singable text.
 *
 * - Single note: just the syllable
 * - Chord: syllables joined with " and " (e.g. "Do and Mi and Sol")
 * - Contour mode between clusters: "up", "down", "same"
 */
export function clusterToSingable(
  events: readonly MidiNoteEvent[],
  mode: SingAlongMode
): string {
  if (events.length === 0) return "";

  if (mode === "syllables") {
    return events.length === 1 ? "da" : "da".repeat(1); // single syllable per cluster
  }

  const syllables = events.map((e) => midiNoteToSingable(e.note, mode));

  // Remove duplicates (same note in a chord)
  const unique = [...new Set(syllables)];
  return unique.join(" and ");
}

/**
 * Generate contour direction between two clusters.
 * Compares the highest note of each cluster.
 */
export function contourDirection(
  prev: readonly MidiNoteEvent[],
  curr: readonly MidiNoteEvent[]
): string {
  if (prev.length === 0 || curr.length === 0) return "";
  const prevMax = Math.max(...prev.map((e) => e.note));
  const currMax = Math.max(...curr.map((e) => e.note));
  if (currMax > prevMax) return "up";
  if (currMax < prevMax) return "down";
  return "same";
}

// ─── Voice Filter ───────────────────────────────────────────────────────────

/**
 * Which notes to sing from each cluster:
 * - "all" — sing every note (chords become "C and E and G")
 * - "melody-only" — highest note per cluster (typical RH melody)
 * - "harmony" — lowest note per cluster (bass line / LH)
 */
export type SingVoiceFilter = "all" | "melody-only" | "harmony";

/**
 * Filter a cluster of events based on the voice filter.
 * Returns a subset of events to sing.
 */
export function filterClusterForVoice(
  events: readonly MidiNoteEvent[],
  filter: SingVoiceFilter
): MidiNoteEvent[] {
  if (events.length === 0) return [];
  if (filter === "all") return [...events];

  if (filter === "melody-only") {
    // Pick the highest note (typical melody line is on top)
    let highest = events[0];
    for (const e of events) {
      if (e.note > highest.note) highest = e;
    }
    return [highest];
  }

  // "harmony" — pick the lowest note
  let lowest = events[0];
  for (const e of events) {
    if (e.note < lowest.note) lowest = e;
  }
  return [lowest];
}

// ─── Sing-On-MIDI Options ───────────────────────────────────────────────────

export interface SingOnMidiOptions {
  /** Singable mode. Default: "note-names". */
  mode?: SingAlongMode;

  /** Voice filter: which notes to sing per cluster. Default: "all". */
  voiceFilter?: SingVoiceFilter;

  /** Voice preset for speech synthesis. */
  voice?: string;

  /** Speech speed multiplier. Default: 1.0. */
  speechSpeed?: number;

  /** Whether to announce cluster/beat numbers. Default: false. */
  announcePosition?: boolean;

  /** Max clusters to announce per batch (to avoid overwhelming). Default: 8. */
  batchSize?: number;

  /**
   * Threshold in ms for grouping simultaneous notes into a chord.
   * Default: 10ms.
   */
  chordThresholdMs?: number;

  /** Whether the voice should block before piano plays. Default: true. */
  blocking?: boolean;
}

// ─── Sing-On-MIDI Hook ──────────────────────────────────────────────────────

/**
 * Create a teaching hook that sings along with MIDI file playback.
 *
 * Pre-processes the ParsedMidi events into time clusters (chords/single notes),
 * then emits singable text as each cluster is reached during playback.
 *
 * The hook implements TeachingHook so it can be composed with other hooks
 * via composeTeachingHooks.
 *
 * @param sink - Voice sink to emit speech directives.
 * @param midi - Parsed MIDI file data.
 * @param options - Configuration.
 * @returns Teaching hook with `.directives` for inspection.
 */
export function createSingOnMidiHook(
  sink: VoiceSink,
  midi: ParsedMidi,
  options: SingOnMidiOptions = {}
): TeachingHook & { directives: VoiceDirective[]; clusters: MidiNoteEvent[][] } {
  const {
    mode = "note-names",
    voiceFilter = "all",
    voice,
    speechSpeed = 1.0,
    announcePosition = false,
    batchSize = 8,
    chordThresholdMs = 10,
    blocking = true,
  } = options;

  const directives: VoiceDirective[] = [];

  // Pre-cluster all events by time proximity
  const clusters = clusterEvents(midi.events, chordThresholdMs);

  // Track which cluster we've announced (for onMeasureStart which fires per-note)
  let lastAnnouncedCluster = -1;
  let prevCluster: MidiNoteEvent[] = [];

  // Build a lookup: event index → cluster index
  const eventToCluster = new Map<number, number>();
  let eventOffset = 0;
  for (let ci = 0; ci < clusters.length; ci++) {
    for (let ei = 0; ei < clusters[ci].length; ei++) {
      eventToCluster.set(eventOffset + ei, ci);
    }
    eventOffset += clusters[ci].length;
  }

  async function emit(directive: VoiceDirective): Promise<void> {
    directives.push(directive);
    await sink(directive);
  }

  return {
    directives,
    clusters,

    async onMeasureStart(eventIndex: number, _teachingNote, _dynamics) {
      // eventIndex from PlaybackController is the note index (1-based)
      const clusterIndex = eventToCluster.get(eventIndex - 1);
      if (clusterIndex === undefined || clusterIndex === lastAnnouncedCluster) return;

      lastAnnouncedCluster = clusterIndex;
      const rawCluster = clusters[clusterIndex];

      // Apply voice filter (melody-only picks highest, harmony picks lowest)
      const cluster = filterClusterForVoice(rawCluster, voiceFilter);

      // Build singable text
      let text: string;
      if (mode === "contour" && prevCluster.length > 0) {
        text = contourDirection(prevCluster, cluster);
      } else {
        text = clusterToSingable(cluster, mode);
      }

      if (!text) return;

      // Optional position prefix
      const prefix = announcePosition ? `${clusterIndex + 1}: ` : "";

      await emit({
        text: `${prefix}${text}`,
        voice,
        speed: speechSpeed,
        blocking,
      });

      prevCluster = cluster;
    },

    async onKeyMoment(_moment) {
      // Sing-on-MIDI does not speak key moments (MIDI files don't have them)
    },

    async onSongComplete(eventsPlayed, songTitle) {
      await emit({
        text: `Finished: ${songTitle}. ${eventsPlayed} notes.`,
        voice,
        speed: speechSpeed,
        blocking: false,
      });
    },

    async push(_interjection) {
      // Sing-on-MIDI does not handle push interjections
    },
  };
}
