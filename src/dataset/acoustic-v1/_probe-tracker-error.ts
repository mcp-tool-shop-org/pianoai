import { trackPitch, scorePitchWindow } from "../../audio/pitch.js";
import { detectOnsets } from "../../audio/onsets.js";
import { buildAllRecords } from "../acoustic/generate-corpus.js";
import { renderTake } from "../acoustic/builder.js";
import type { AcousticRecord } from "../acoustic/schema.js";

function targetWindow(rec: AcousticRecord): { midi: number; start: number; end: number } {
  const recipe = rec.observation.render.recipe;
  const note = recipe.notes[recipe.target_index]!;
  const delay = recipe.delay_sec ?? 0;
  const start = recipe.pre_roll_sec + note.time + delay;
  return { midi: note.midi, start, end: start + note.duration };
}

function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return s[lo]!;
  return s[lo]! + (s[hi]! - s[lo]!) * (i - lo);
}

function stats(xs: number[]) {
  if (xs.length === 0) return { n: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const max = Math.max(...xs);
  return {
    n: xs.length,
    mean: +mean.toFixed(3),
    p50: +percentile(xs, 0.5).toFixed(3),
    p90: +percentile(xs, 0.9).toFixed(3),
    p95: +percentile(xs, 0.95).toFixed(3),
    max: +max.toFixed(3),
  };
}

const records = buildAllRecords();
const pitchAbsErr: number[] = [];
const pitchLockedAbsErr: number[] = [];
const onsetAbsErrMs: number[] = [];
const sharp30: Array<{
  id: string;
  applied: number;
  measured: number | null;
  status: string;
  err: number | null;
  clearance: number;
}> = [];
let octaveJumps = 0;

for (const rec of records) {
  const kind = rec.observation.perturbation.kind;
  const recipe = rec.observation.render.recipe;
  const samples = renderTake(recipe);
  const sr = recipe.sample_rate;

  if (kind === "sharp_30" || kind === "sharp_60" || kind === "clean") {
    const { midi, start, end } = targetWindow(rec);
    const track = trackPitch(samples, { sampleRate: sr });
    const v = scorePitchWindow(track, midi, Math.max(0, start - 0.05), end + 0.05);
    const applied = recipe.cents_shift ?? 0;
    const measured = v.centsMedian;
    const err = measured == null ? null : measured - applied;
    if (err != null) pitchAbsErr.push(Math.abs(err));
    const locked = err != null && Math.abs(err) < 100 && v.status !== "untrackable";
    if (locked) pitchLockedAbsErr.push(Math.abs(err));
    else if (kind !== "clean" || (err != null && Math.abs(err) >= 100)) octaveJumps++;
    if (kind === "sharp_30") {
      sharp30.push({
        id: rec.id,
        applied: +applied.toFixed(3),
        measured: measured == null ? null : +measured.toFixed(3),
        status: v.status,
        err: err == null ? null : +err.toFixed(3),
        clearance: +(applied - 25).toFixed(3),
      });
    }
  }

  if (kind === "late_25" || kind === "late_80" || kind === "clean") {
    const note = recipe.notes[recipe.target_index]!;
    const expected = recipe.pre_roll_sec + note.time;
    const sounded = expected + (recipe.delay_sec ?? 0);
    const result = detectOnsets(samples, { sampleRate: sr });
    if (result.onsets.length > 0) {
      let nearest = result.onsets[0]!;
      for (const o of result.onsets) {
        if (Math.abs(o.time - sounded) < Math.abs(nearest.time - sounded)) nearest = o;
      }
      onsetAbsErrMs.push(Math.abs((nearest.time - sounded) * 1000));
    }
  }
}

const locked30 = sharp30.filter((s) => s.err != null && Math.abs(s.err) < 100);
process.stdout.write(JSON.stringify({
  pitch_abs_err_cents_all: stats(pitchAbsErr),
  pitch_abs_err_cents_locked: stats(pitchLockedAbsErr),
  octave_jumps_in_pitch_kinds: octaveJumps,
  onset_abs_err_ms: stats(onsetAbsErrMs),
  sharp_30_gate: 25,
  sharp_30_n: sharp30.length,
  sharp_30_locked_n: locked30.length,
  sharp_30_min_applied_clearance: Math.min(...sharp30.map((s) => s.clearance)),
  sharp_30_locked: locked30,
  sharp_30_unlocked: sharp30.filter((s) => s.err == null || Math.abs(s.err) >= 100),
}, null, 2) + "\n");
