/**
 * Real-time-ish voice changer: pitch-shift a locked take onto a MIDI F0
 * without rebuilding the speaker.
 *
 * Playbook is fx-dub (`E:/AI/fx-dub`, `vo_graphs.py`):
 *   CAST once → LOCK the approved audio → PERFORM from it.
 * ByteDance `pitch_rate` is the measured cloud analog (node-global, ±12 st).
 * Cross-engine cloning does not preserve identity (fx-dub session 4).
 * That is why we do not run Kokoro through additive formant tables or
 * Pink Trombone — those are a different person.
 *
 * This module is the PERFORM step: overlap-add grains at a new period
 * (TD-PSOLA-shaped). Formants stay with the grain; F0 follows the score.
 */

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function semitoneRatio(semitones: number): number {
  return 2 ** (semitones / 12);
}

/** Autocorrelation F0. Returns 0 if unvoiced. */
export function estimateF0(pcm: Float32Array, sr: number, start = 0, len?: number): number {
  const n = len ?? Math.min(pcm.length - start, Math.floor(sr * 0.04));
  if (n < 64) return 0;
  const minP = Math.max(2, Math.floor(sr / 500));
  const maxP = Math.min(n - 2, Math.floor(sr / 70));
  let best = 0;
  let bestP = 0;
  for (let p = minP; p < maxP; p++) {
    let c = 0;
    const lim = n - p;
    for (let i = 0; i < lim; i++) c += pcm[start + i] * pcm[start + i + p];
    if (c > best) {
      best = c;
      bestP = p;
    }
  }
  return bestP > 0 ? sr / bestP : 0;
}

function hann(i: number, n: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, n - 1));
}

/**
 * Pitch-shift `pcm` by `ratio` (targetF0 / sourceF0). Duration is preserved.
 * Resample to move F0 (fx-dub ByteDance pitch_rate analog), then WSOLA-stretch
 * back so the syllable still fills the MIDI note.
 */
export function pitchShiftPreserveDuration(
  pcm: Float32Array,
  sr: number,
  ratio: number,
): Float32Array {
  if (!Number.isFinite(ratio) || ratio <= 0) return pcm.slice();
  if (Math.abs(ratio - 1) < 0.01) return pcm.slice();
  const raisedLen = Math.max(32, Math.round(pcm.length / ratio));
  const raised = timeScale(pcm, raisedLen);
  return wsolaStretch(raised, pcm.length);
}

function wsolaStretch(pcm: Float32Array, targetLen: number): Float32Array {
  if (pcm.length === targetLen) return pcm.slice();
  const grain = Math.min(1024, Math.max(128, Math.floor(pcm.length / 4)));
  const synHop = Math.max(32, Math.floor(grain / 4));
  const anaHop = Math.max(8, Math.round(synHop * (pcm.length / targetLen)));
  const out = new Float32Array(targetLen);
  const norm = new Float32Array(targetLen);
  let read = 0;
  let write = 0;
  while (write < targetLen) {
    for (let i = 0; i < grain; i++) {
      const src = read + i;
      const dst = write + i;
      if (dst >= targetLen) break;
      const s = src < pcm.length ? pcm[src] : 0;
      const w = hann(i, grain);
      out[dst] += s * w;
      norm[dst] += w;
    }
    read += anaHop;
    write += synHop;
    if (read >= pcm.length) read = Math.max(0, pcm.length - grain);
    if (write > 0 && read === 0 && pcm.length < grain) break;
  }
  for (let i = 0; i < out.length; i++) {
    if (norm[i] > 1e-6) out[i] /= norm[i];
  }
  return out;
}

/** Stretch or shrink to `targetSamples` by dropping/repeating grains. */
export function timeScale(pcm: Float32Array, targetSamples: number): Float32Array {
  if (targetSamples <= 0) return new Float32Array(0);
  if (pcm.length === targetSamples) return pcm.slice();
  const out = new Float32Array(targetSamples);
  if (pcm.length === 0) return out;
  for (let i = 0; i < targetSamples; i++) {
    const src = (i * (pcm.length - 1)) / Math.max(1, targetSamples - 1);
    const i0 = Math.floor(src);
    const i1 = Math.min(pcm.length - 1, i0 + 1);
    const t = src - i0;
    out[i] = pcm[i0] * (1 - t) + pcm[i1] * t;
  }
  return out;
}

/**
 * PERFORM: take a locked clip (CAST audio) and retune it to `targetMidi`
 * for `durationSec`. Source F0 is measured; missing F0 assumes 180 Hz.
 */
export function retuneLockedTake(
  pcm: Float32Array,
  sr: number,
  targetMidi: number,
  durationSec: number,
): Float32Array {
  const srcF0 = estimateF0(pcm, sr) || 180;
  const dstF0 = midiToHz(targetMidi);
  const shifted = pitchShiftPreserveDuration(pcm, sr, dstF0 / srcF0);
  return timeScale(shifted, Math.max(1, Math.round(durationSec * sr)));
}
