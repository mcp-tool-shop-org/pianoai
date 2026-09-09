// ─── Salamander prune plan (pure, no ffmpeg, no I/O) ────────────────────────
//
// Pinned parameters for the cockpit Concert Grand pack. Holm's Salamander
// Grand Piano V3 is already sampled in minor thirds from A0 — we keep that
// root grid and pick 3 of the 16 velocity layers.

export const MIDI_LO = 21; // A0
export const MIDI_HI = 108; // C8
export const ROOT_STEP_SEMITONES = 3;

/** Holm v-index (1-based) used for layers 0, 1, 2. */
export const SOURCE_VELOCITY_LAYERS = [4, 10, 16] as const;

/** Inclusive velocity ranges per cockpit layer. */
export const VELOCITY_RANGES: ReadonlyArray<{ lo: number; hi: number }> = [
  { lo: 1, hi: 42 },
  { lo: 43, hi: 85 },
  { lo: 86, hi: 127 },
];

export const ENCODER = {
  codec: "libopus",
  bitrate: "96k",
  sampleRate: 48000,
  channels: 2,
  container: "ogg",
  maxDurationSec: 8,
  fadeOutSec: 0.35,
} as const;

export const PACK_BUDGET_BYTES = 10 * 1024 * 1024;

const HOLM_PC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** Holm stem for a MIDI note, e.g. 21 → "A0", 27 → "Ds1". */
export function holmNoteName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const oct = Math.floor(midi / 12) - 1;
  return `${HOLM_PC[pc]}${oct}`;
}

/** Source filename inside the Holm pack (WAV or FLAC). */
export function holmSourceStem(midi: number, sourceVel: number): string {
  return `${holmNoteName(midi)}v${sourceVel}`;
}

export function cockpitFileName(midi: number, layer: number): string {
  return `${midi}-v${layer}.ogg`;
}

export function pianoRoots(lo = MIDI_LO, hi = MIDI_HI, step = ROOT_STEP_SEMITONES): number[] {
  const roots: number[] = [];
  for (let m = lo; m <= hi; m += step) roots.push(m);
  return roots;
}

/** Nearest sampled root; ties break toward the lower root. */
export function nearestRoot(midi: number, roots: readonly number[]): number {
  if (roots.length === 0) throw new Error("nearestRoot: empty roots");
  let best = roots[0];
  let bestDist = Math.abs(midi - best);
  for (const r of roots) {
    const d = Math.abs(midi - r);
    if (d < bestDist || (d === bestDist && r < best)) {
      best = r;
      bestDist = d;
    }
  }
  return best;
}

/** playbackRate so a buffer recorded at rootMidi sounds as midi. */
export function playbackRateFor(midi: number, rootMidi: number): number {
  return Math.pow(2, (midi - rootMidi) / 12);
}

/** Pick cockpit layer 0..n-1 for a MIDI velocity 1-127. */
export function velocityLayer(velocity: number, ranges = VELOCITY_RANGES): number {
  const v = Math.max(1, Math.min(127, Math.round(velocity)));
  for (let i = 0; i < ranges.length; i++) {
    if (v >= ranges[i].lo && v <= ranges[i].hi) return i;
  }
  return ranges.length - 1;
}

export function maxRootGapSemitones(roots: readonly number[], lo = MIDI_LO, hi = MIDI_HI): number {
  if (roots.length === 0) return Infinity;
  const sorted = [...roots].sort((a, b) => a - b);
  let max = Math.max(sorted[0] - lo, hi - sorted[sorted.length - 1]);
  for (let i = 1; i < sorted.length; i++) {
    max = Math.max(max, (sorted[i] - sorted[i - 1]) / 2);
  }
  return max;
}
