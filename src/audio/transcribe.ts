// ─── ai-jam-sessions: Monophonic Transcription ───────────────────────────────
//
// Segment a rendered take into notes so audio can enter the EXISTING scoring
// stack. scorePerformance(song, playedEvents) already takes a flat
// MidiNoteEvent[] of { note, velocity, time, duration, channel }; this module
// is the producer of that array. Wiring the tools is chunk 5.
//
// WHAT THIS IS NOT. It is monophonic. On a chord or a mix it will report
// something confident and wrong. The study names RMVPE for polyphonic
// reference audio (finding 36) and we do not have it. The guard is the
// caveat string on the return value — it has to reach the model, the same
// way ONSET_DETECTOR_CAVEAT does.
//
// HOW A NOTE IS CUT.
//   time     = SuperFlux onset (detectOnsets), NOT the first voiced frame.
//              An attack is broadband; YIN will not call it voiced until the
//              tone settles, and first-voiced would eat the 40 ms gate.
//   duration = last voiced frame in the segment minus that onset time.
//   pitch    = median of voiced-frame fractional MIDI, rounded. centsOffset
//              is the median deviation from that integer. Mean-vs-median
//              disagreement past OCTAVE_TRIPWIRE_CENTS, or zero voiced
//              frames, is untrackable: the segment is dropped, never guessed.
//   velocity = RMS of the note span, scaled so a unit-amplitude sine is 127,
//              then clamped to [1, 127]. scorePerformance filters
//              velocity > 0; a 0 would vanish and present as missed.
//
// Exception: a leading run of voiced frames with no preceding onset. There
// first-voiced is the only start we have; those notes are flagged
// `onsetInferred` and counted in the caveat.
//
// Usage:
//   const { notes, caveat } = transcribe(samples, { sampleRate: 44100 });
//   const events = toMidiNoteEvents(notes);   // lossy: drops cents + confidence
// ─────────────────────────────────────────────────────────────────────────────

import type { MidiNoteEvent } from "../midi/types.js";
import {
  detectOnsets,
  ONSET_DETECTOR_CAVEAT,
} from "./onsets.js";
import {
  trackPitch,
  centsFromTarget,
  OCTAVE_TRIPWIRE_CENTS,
  type PitchFrame,
} from "./pitch.js";

/**
 * Default minimum note duration. Below the 50 ms mir_eval onset convention a
 * "note" is not separable from a detection artefact anyway.
 */
export const MIN_DURATION_SEC = 0.05;

/** Frames below this periodicity do not vote on a note's pitch. Matches scorePitchWindow. */
export const MIN_CONFIDENCE = 0.5;

/** RMS of a unit-amplitude sine: 1/√2. Velocity 127 is this value. */
const UNIT_SINE_RMS = Math.SQRT1_2;

/** Options for {@link transcribe}. */
export interface TranscribeOptions {
  sampleRate: number;
  /** Frames below this confidence do not vote on a note's pitch. Defaults to {@link MIN_CONFIDENCE}. */
  minConfidence?: number;
  /**
   * Segments shorter than this are dropped as artefacts. Defaults to
   * {@link MIN_DURATION_SEC} (50 ms).
   */
  minDurationSec?: number;
  /** Passed through to the onset detector and the pitch tracker. Defaults to 512. */
  hopLength?: number;
}

/**
 * One transcribed note, still carrying the cents and confidence the 50-cent
 * gate needs. {@link toMidiNoteEvents} is the explicit lossy step that drops
 * them to fit `MidiNoteEvent`.
 */
export interface TranscribedNote {
  /** Rounded MIDI number. */
  note: number;
  /** RMS-mapped, clamped to [1, 127]. */
  velocity: number;
  /** Start time in seconds: SuperFlux onset, or first-voiced if inferred. */
  time: number;
  /** Last voiced frame minus `time`, in seconds. */
  duration: number;
  /** Median YIN confidence of the voiced frames that voted. */
  confidence: number;
  /** Median cent deviation from `note`. Positive is sharp. */
  centsOffset: number;
  /**
   * True when this note had no SuperFlux onset and started at the first
   * voiced frame. Attack-late by construction; counted in the caveat.
   */
  onsetInferred: boolean;
}

export interface TranscribeResult {
  notes: TranscribedNote[];
  /** Always populated. Must reach the model. */
  caveat: string;
}

interface SegmentStart {
  time: number;
  inferred: boolean;
}

function resolveOptions(options: TranscribeOptions): Required<TranscribeOptions> {
  const {
    sampleRate,
    minConfidence = MIN_CONFIDENCE,
    minDurationSec = MIN_DURATION_SEC,
    hopLength = 512,
  } = options;

  if (!(sampleRate > 0)) {
    throw new Error(`sampleRate must be positive, got ${sampleRate}.`);
  }
  if (!(minConfidence >= 0) || minConfidence > 1) {
    throw new Error(`minConfidence must be in [0, 1], got ${minConfidence}.`);
  }
  if (!(minDurationSec >= 0)) {
    throw new Error(`minDurationSec must be non-negative, got ${minDurationSec}.`);
  }
  if (!Number.isInteger(hopLength) || hopLength < 1) {
    throw new Error(`hopLength must be a positive integer, got ${hopLength}.`);
  }
  return { sampleRate, minConfidence, minDurationSec, hopLength };
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function isVoiced(frame: PitchFrame, minConfidence: number): boolean {
  return frame.f0Hz !== null && frame.confidence >= minConfidence;
}

function rmsOf(samples: ArrayLike<number>, start: number, end: number): number {
  const lo = Math.max(0, start);
  const hi = Math.min(samples.length, end);
  if (hi <= lo) return 0;
  let sum = 0;
  for (let i = lo; i < hi; i++) {
    const v = samples[i]!;
    sum += v * v;
  }
  return Math.sqrt(sum / (hi - lo));
}

/**
 * Map RMS to MIDI velocity. A unit-amplitude sine (RMS = 1/√2) lands at 127.
 * Absolute, not peak-relative: trimming the clip must not change a note's
 * velocity. Both ends clamped to [1, 127] so a quiet note cannot vanish
 * inside scorePerformance's `velocity > 0` filter.
 */
export function velocityFromRms(rms: number): number {
  if (!(rms > 0)) return 1;
  const raw = Math.round((rms / UNIT_SINE_RMS) * 127);
  return Math.max(1, Math.min(127, raw));
}

function votePitch(
  voiced: PitchFrame[],
): { note: number; centsOffset: number; confidence: number } | null {
  const midis = voiced.map((f) => f.midi!).sort((a, b) => a - b);
  const medianMidi = median(midis);
  const note = Math.max(0, Math.min(127, Math.round(medianMidi)));

  const cents = voiced
    .map((f) => centsFromTarget(f.f0Hz!, note))
    .sort((a, b) => a - b);
  const centsMedian = median(cents);
  const centsMean = cents.reduce((a, b) => a + b, 0) / cents.length;

  if (Math.abs(centsMean - centsMedian) > OCTAVE_TRIPWIRE_CENTS) {
    return null;
  }

  const confidences = voiced.map((f) => f.confidence).sort((a, b) => a - b);
  return { note, centsOffset: centsMedian, confidence: median(confidences) };
}

function buildCaveat(args: {
  droppedUntrackable: number;
  droppedShort: number;
  inferred: number;
}): string {
  const parts = [
    "This transcription is monophonic and an estimate.",
    ONSET_DETECTOR_CAVEAT,
    "A chord or mix will produce something confident and wrong; polyphonic " +
      "audio needs a different estimator (the study names RMVPE).",
    "A legato repeated note with no amplitude or phase transient may merge " +
      "into one note — SuperFlux has nothing to fire on.",
  ];
  if (args.droppedUntrackable > 0) {
    parts.push(
      `Dropped ${args.droppedUntrackable} segment(s) the tracker could not follow.`,
    );
  }
  if (args.droppedShort > 0) {
    parts.push(
      `Dropped ${args.droppedShort} segment(s) shorter than ${MIN_DURATION_SEC * 1000} ms as artefacts.`,
    );
  }
  if (args.inferred > 0) {
    parts.push(
      `${args.inferred} leading onset(s) were inferred from voicing, not SuperFlux; ` +
        `those times are not attack transients.`,
    );
  }
  return parts.join(" ");
}

/**
 * Segment monophonic audio into notes.
 *
 * Does not guess a pitch. Untrackable and too-short segments are omitted
 * and counted in `caveat`.
 */
export function transcribe(
  samples: ArrayLike<number>,
  options: TranscribeOptions,
): TranscribeResult {
  const opts = resolveOptions(options);
  const { sampleRate, minConfidence, minDurationSec, hopLength } = opts;

  const onsetResult = detectOnsets(samples, { sampleRate, hopLength });
  const track = trackPitch(samples, { sampleRate, hopLength });

  const onsetTimes = onsetResult.onsets.map((o) => o.time);
  const hopSec = hopLength / sampleRate;
  const signalEnd = samples.length / sampleRate;

  const starts: SegmentStart[] = [];
  const voicedAnywhere = track.frames.filter((f) => isVoiced(f, minConfidence));
  if (voicedAnywhere.length > 0) {
    const firstVoiced = voicedAnywhere[0]!.timeSec;
    const firstOnset = onsetTimes.length > 0 ? onsetTimes[0]! : Infinity;
    if (firstVoiced < firstOnset - hopSec) {
      starts.push({ time: firstVoiced, inferred: true });
    }
  }
  for (const time of onsetTimes) starts.push({ time, inferred: false });
  starts.sort((a, b) => a.time - b.time);

  const notes: TranscribedNote[] = [];
  let droppedUntrackable = 0;
  let droppedShort = 0;
  let inferred = 0;

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]!;
    const end = i + 1 < starts.length ? starts[i + 1]!.time : signalEnd;
    const voiced = track.frames.filter(
      (f) => f.timeSec >= start.time && f.timeSec < end && isVoiced(f, minConfidence),
    );

    if (voiced.length === 0) {
      droppedUntrackable++;
      continue;
    }

    const lastVoiced = voiced[voiced.length - 1]!.timeSec;
    const time = start.time;
    const duration = lastVoiced - time;
    if (!(duration >= minDurationSec)) {
      droppedShort++;
      continue;
    }

    const voted = votePitch(voiced);
    if (voted === null) {
      droppedUntrackable++;
      continue;
    }

    const startSample = Math.round(time * sampleRate);
    const endSample = Math.round((time + duration) * sampleRate);
    const velocity = velocityFromRms(rmsOf(samples, startSample, endSample));

    if (start.inferred) inferred++;
    notes.push({
      note: voted.note,
      velocity,
      time,
      duration,
      confidence: voted.confidence,
      centsOffset: voted.centsOffset,
      onsetInferred: start.inferred,
    });
  }

  return {
    notes,
    caveat: buildCaveat({ droppedUntrackable, droppedShort, inferred }),
  };
}

/**
 * Lossy conversion to the existing scoring input. Drops `centsOffset`,
 * `confidence`, and `onsetInferred`. Sets `channel` to 0. Does not widen
 * `MidiNoteEvent`.
 */
export function toMidiNoteEvents(notes: TranscribedNote[]): MidiNoteEvent[] {
  return notes.map((n) => ({
    note: n.note,
    velocity: n.velocity,
    time: n.time,
    duration: n.duration,
    channel: 0,
  }));
}
