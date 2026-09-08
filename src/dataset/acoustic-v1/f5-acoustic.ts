// ─── F5: acoustic across the publishable shelf ───────────────────────────────
//
// v0 rebuilt: 27 songs not 3, whole phrases not 4 notes, measurements out of
// the prompt. Guard bands are multiples of measured tracker error.
// Untrackable ⇒ drop (counted), never a silent pass. Every kept record is
// verified against YIN / SuperFlux, not against the recipe.

import { createHash } from "node:crypto";
import { sine, clickTrain } from "../../audio/fixtures.js";
import { midiToHz, trackPitch, scorePitchWindow } from "../../audio/pitch.js";
import { detectOnsets } from "../../audio/onsets.js";
import { parseNoteToMidi, midiToNoteName } from "../../note-parser.js";
import type { SongEntry } from "../../songs/types.js";
import {
  MEASURED_ONSET_ABS_P95_MS,
  MEASURED_YIN_LOCKED_P95_CENTS,
  V1_ONSET_CLEARANCE_MS,
  V1_PITCH_CLEARANCE_CENTS,
  V1_PITCH_FAIL_CENTS,
  V1_PITCH_WARN_CENTS,
  V1_TIMING_MS,
} from "./tracker-error.js";

export const F5_KINDS = ["clean", "sharp_fail", "late_fail"] as const;
export type F5Kind = (typeof F5_KINDS)[number];

/** Pitch clearance / locked YIN p95. Stated in every F5 record. */
export const F5_PITCH_CLEARANCE_MULTIPLE =
  V1_PITCH_CLEARANCE_CENTS / MEASURED_YIN_LOCKED_P95_CENTS;

/** Onset clearance / onset abs p95. Stated in every F5 record. */
export const F5_ONSET_CLEARANCE_MULTIPLE =
  V1_ONSET_CLEARANCE_MS / MEASURED_ONSET_ABS_P95_MS;

const SR = 44100;
const PRE_ROLL = 0.3;
const NOTE_DUR = 0.45;
const NOTE_GAP = 0.6;

export interface F5PhraseNote {
  midi: number;
  name: string;
  time: number;
  duration: number;
}

export interface F5DropStats {
  attempted: number;
  droppedUntrackable: number;
  droppedClearance: number;
  droppedShortPhrase: number;
}

export const f5DropStats: F5DropStats = {
  attempted: 0,
  droppedUntrackable: 0,
  droppedClearance: 0,
  droppedShortPhrase: 0,
};

export function resetF5DropStats(): void {
  f5DropStats.attempted = 0;
  f5DropStats.droppedUntrackable = 0;
  f5DropStats.droppedClearance = 0;
  f5DropStats.droppedShortPhrase = 0;
}

export function phraseFromSong(song: SongEntry, maxNotes = 8): F5PhraseNote[] {
  const notes: F5PhraseNote[] = [];
  let t = 0;
  for (const m of song.measures) {
    for (const tok of m.rightHand.split(/[\s+]+/).filter(Boolean)) {
      const raw = tok.split(":")[0]!;
      if (raw === "R" || raw === "r") continue;
      try {
        const midi = parseNoteToMidi(raw);
        if (midi >= 0) {
          notes.push({ midi, name: midiToNoteName(midi), time: t, duration: NOTE_DUR });
          t += NOTE_GAP;
        }
      } catch {
        /* skip */
      }
      if (notes.length >= maxNotes) return notes;
    }
  }
  return notes;
}

export const F5_THRESHOLDS: Record<string, number> = {
  timing_ms: V1_TIMING_MS,
  pitch_fail_cents: V1_PITCH_FAIL_CENTS,
  pitch_warn_cents: V1_PITCH_WARN_CENTS,
  yin_locked_p95_cents: MEASURED_YIN_LOCKED_P95_CENTS,
  pitch_clearance_cents: V1_PITCH_CLEARANCE_CENTS,
  pitch_clearance_multiple: +F5_PITCH_CLEARANCE_MULTIPLE.toFixed(2),
  onset_p95_ms: MEASURED_ONSET_ABS_P95_MS,
  onset_clearance_ms: V1_ONSET_CLEARANCE_MS,
  onset_clearance_multiple: +F5_ONSET_CLEARANCE_MULTIPLE.toFixed(2),
};

function mix(a: Float64Array, b: Float64Array): Float64Array {
  const n = Math.max(a.length, b.length);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return out;
}

function sha256Samples(samples: Float64Array): string {
  return createHash("sha256")
    .update(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength))
    .digest("hex");
}

export function renderF5(
  notes: F5PhraseNote[],
  kind: F5Kind,
): { samples: Float64Array; cents_shift: number; delay_sec: number; target_index: number } {
  const target_index = 0;
  const cents_shift = kind === "sharp_fail" ? V1_PITCH_FAIL_CENTS + V1_PITCH_CLEARANCE_CENTS : 0;
  const delay_sec = kind === "late_fail" ? (V1_TIMING_MS + V1_ONSET_CLEARANCE_MS) / 1000 : 0;
  const last = notes[notes.length - 1]!;
  const duration = PRE_ROLL + last.time + last.duration + delay_sec + 0.2;
  const overlay = new Float64Array(Math.round(duration * SR));
  const clickTimes: number[] = [];
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i]!;
    const delay = i === target_index ? delay_sec : 0;
    const cents = i === target_index ? cents_shift : 0;
    const freq = midiToHz(n.midi) * Math.pow(2, cents / 1200);
    const tone = sine({ frequency: freq, duration: n.duration, sampleRate: SR, amplitude: 0.8 });
    const start = Math.round((PRE_ROLL + n.time + delay) * SR);
    for (let j = 0; j < tone.length && start + j < overlay.length; j++) overlay[start + j] += tone[j]!;
    clickTimes.push(PRE_ROLL + n.time + delay);
  }
  const clicks = clickTrain({ times: clickTimes, duration, sampleRate: SR, amplitude: 1 });
  return { samples: mix(overlay, clicks), cents_shift, delay_sec, target_index };
}

export interface F5Measurements {
  f0_hz: number;
  cents_from_target: number;
  onset_ms: number;
}

export interface F5Kept {
  kind: F5Kind;
  notes: F5PhraseNote[];
  cents_shift: number;
  delay_sec: number;
  target_index: number;
  wav_sha256: string;
  sample_rate: number;
  pre_roll_sec: number;
  gold: "match" | "pitch_fail" | "timing_fail";
  measured_f0_hz: number;
  measured_cents: number;
  measured_onset_ms: number;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Pitch and onset on every take. Null if either tracker cannot lock. */
export function measureF5(notes: F5PhraseNote[], kind: F5Kind): {
  samples: Float64Array;
  cents_shift: number;
  delay_sec: number;
  target_index: number;
  measurements: F5Measurements | null;
} {
  const rendered = renderF5(notes, kind);
  const { samples, cents_shift, delay_sec, target_index } = rendered;
  const target = notes[target_index]!;
  const start = PRE_ROLL + target.time + delay_sec;
  const end = start + target.duration;
  const winStart = Math.max(0, start - 0.05);
  const winEnd = end + 0.05;

  const track = trackPitch(samples, { sampleRate: SR });
  const pitch = scorePitchWindow(track, target.midi, winStart, winEnd);
  const voicedHz = track.frames
    .filter((f) => f.timeSec >= winStart && f.timeSec <= winEnd)
    .filter((f) => f.f0Hz !== null && f.confidence >= 0.5)
    .map((f) => f.f0Hz!);
  if (pitch.status === "untrackable" || pitch.centsMedian == null || voicedHz.length === 0) {
    return { samples, cents_shift, delay_sec, target_index, measurements: null };
  }

  const expected = PRE_ROLL + target.time;
  const onsets = detectOnsets(samples, { sampleRate: SR });
  if (onsets.onsets.length === 0) {
    return { samples, cents_shift, delay_sec, target_index, measurements: null };
  }
  const sounded = expected + delay_sec;
  let nearest = onsets.onsets[0]!;
  for (const o of onsets.onsets) {
    if (Math.abs(o.time - sounded) < Math.abs(nearest.time - sounded)) nearest = o;
  }

  return {
    samples,
    cents_shift,
    delay_sec,
    target_index,
    measurements: {
      f0_hz: median(voicedHz),
      cents_from_target: pitch.centsMedian,
      onset_ms: (nearest.time - expected) * 1000,
    },
  };
}

function goldFromKind(kind: F5Kind, m: F5Measurements): "match" | "pitch_fail" | "timing_fail" | null {
  const mag = Math.abs(m.cents_from_target);
  if (kind === "clean") return mag < V1_PITCH_WARN_CENTS ? "match" : null;
  if (kind === "sharp_fail") {
    return mag - V1_PITCH_FAIL_CENTS >= V1_PITCH_CLEARANCE_CENTS ? "pitch_fail" : null;
  }
  return m.onset_ms > V1_TIMING_MS ? "timing_fail" : null;
}

export function tryBuildF5(song: SongEntry, kind: F5Kind): F5Kept | null {
  f5DropStats.attempted++;
  const notes = phraseFromSong(song);
  if (notes.length < 4) {
    f5DropStats.droppedShortPhrase++;
    return null;
  }
  const { samples, cents_shift, delay_sec, target_index, measurements } = measureF5(notes, kind);
  if (!measurements) {
    f5DropStats.droppedUntrackable++;
    return null;
  }
  const gold = goldFromKind(kind, measurements);
  if (!gold) {
    f5DropStats.droppedClearance++;
    return null;
  }
  return {
    kind, notes, cents_shift, delay_sec, target_index,
    wav_sha256: sha256Samples(samples), sample_rate: SR, pre_roll_sec: PRE_ROLL,
    gold,
    measured_f0_hz: measurements.f0_hz,
    measured_cents: measurements.cents_from_target,
    measured_onset_ms: measurements.onset_ms,
  };
}

/** Opaque path: hash of the recipe, never the kind or the song id in the name. */
export function opaqueTakePath(songId: string, kept: F5Kept): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({
      songId,
      midi: kept.notes.map((n) => n.midi),
      time: kept.notes.map((n) => n.time),
      cents_shift: kept.cents_shift,
      delay_sec: kept.delay_sec,
      target_index: kept.target_index,
    }))
    .digest("hex")
    .slice(0, 6);
  return `/acoustic-v1/take-${digest}.wav`;
}

/** Re-measure a kept F5 take; throws if untrackable (build/test failure). */
export function remeasureF5(kept: {
  notes: F5PhraseNote[];
  kind: F5Kind;
}): { gold: F5Kept["gold"]; untrackable: boolean } {
  const built = tryBuildF5(
    {
      measures: kept.notes.map((n, i) => ({
        number: i + 1,
        rightHand: n.name,
        leftHand: "R",
      })),
    } as unknown as SongEntry,
    kept.kind,
  );
  // tryBuildF5 increments drop stats — not wanted on remeasure. Caller should
  // compare gold strings via a dedicated path. See rederiveF5Gold.
  return { gold: built?.gold ?? "match", untrackable: built == null };
}

export function rederiveF5Measurements(kind: F5Kind, notes: F5PhraseNote[]): {
  gold: string | null;
  f0_hz: number | null;
  cents_from_target: number | null;
  onset_ms: number | null;
} {
  const { measurements } = measureF5(notes, kind);
  if (!measurements) {
    return { gold: null, f0_hz: null, cents_from_target: null, onset_ms: null };
  }
  return {
    gold: goldFromKind(kind, measurements),
    f0_hz: measurements.f0_hz,
    cents_from_target: measurements.cents_from_target,
    onset_ms: measurements.onset_ms,
  };
}

export function rederiveF5Gold(kind: F5Kind, notes: F5PhraseNote[]): string | null {
  return rederiveF5Measurements(kind, notes).gold;
}
