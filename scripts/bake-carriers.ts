#!/usr/bin/env tsx
// ─── Bake Vocal Carrier Bank ────────────────────────────────────────────────
//
// Takes the raw Kokoro TTS carriers and builds a complete bank covering
// MIDI 36–96 (C2–C7) with anchors every 8 semitones.
//
// Strategy:
//   - Use real TTS carriers where they fall within ±4 semitones of an anchor
//   - For uncovered anchors, offline pitch-shift the closest clean seed
//   - RMS normalize everything to a consistent level
//
// Usage:
//   npx tsx scripts/bake-carriers.ts
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, readdirSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Config ─────────────────────────────────────────────────────────────────

const RAW_DIR = "F:/AI/avatar-face-mvp/.tts-output/vocal-carriers";
const OUTPUT_DIR = join(__dirname, "..", "samples", "vocal");
const TARGET_RMS_DB = -18; // target RMS in dBFS

// Anchor points every 8 semitones from C2 to C7
const ANCHORS = [36, 44, 52, 60, 68, 76, 84, 92];

// Note names for filenames
const NOTE_NAMES: Record<number, string> = {
  36: "c2", 44: "gs2", 52: "e3", 60: "c4",
  68: "gs4", 76: "e5", 84: "c6", 92: "gs6",
};

// ─── Raw carrier inventory (from pitch analysis) ───────────────────────────

interface RawCarrier {
  file: string;
  voice: string;
  midi: number; // measured fundamental
  quality: "clean" | "good" | "ok"; // subjective seed quality
}

const RAW_CARRIERS: RawCarrier[] = [
  { file: "am_onyx_ab6a895d.wav",     voice: "onyx",     midi: 39, quality: "good" },
  { file: "am_michael_ab6a895d.wav",   voice: "michael",  midi: 45, quality: "good" },
  { file: "am_fenrir_ab6a895d.wav",    voice: "fenrir",   midi: 49, quality: "good" },
  { file: "af_sky_ab6a895d.wav",       voice: "sky",      midi: 51, quality: "good" },
  { file: "af_aoede_ab6a895d.wav",     voice: "aoede",    midi: 51, quality: "clean" },
  { file: "bf_emma_ab6a895d.wav",      voice: "emma",     midi: 52, quality: "clean" },
  { file: "af_aoede_1f419d25.wav",     voice: "aoede-la", midi: 52, quality: "good" },
  { file: "af_aoede_194056a6.wav",     voice: "aoede-oo", midi: 54, quality: "good" },
  { file: "bf_isabella_ab6a895d.wav",  voice: "isabella",  midi: 55, quality: "clean" },
];

// ─── WAV I/O ────────────────────────────────────────────────────────────────

function readWav(filePath: string): { samples: Float32Array; sampleRate: number } {
  const buf = readFileSync(filePath);
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  let offset = 12;
  let fmtOffset = -1, dataOffset = -1, dataSize = 0;

  while (offset < view.byteLength - 8) {
    const id = String.fromCharCode(
      view.getUint8(offset), view.getUint8(offset + 1),
      view.getUint8(offset + 2), view.getUint8(offset + 3),
    );
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") fmtOffset = offset + 8;
    else if (id === "data") { dataOffset = offset + 8; dataSize = size; }
    if (fmtOffset >= 0 && dataOffset >= 0) break;
    offset += 8 + size + (size % 2);
  }

  const sampleRate = view.getUint32(fmtOffset + 4, true);
  const bitsPerSample = view.getUint16(fmtOffset + 14, true);
  const numChannels = view.getUint16(fmtOffset + 2, true);
  const bytesPerSample = bitsPerSample / 8;
  const numFrames = Math.floor(dataSize / (numChannels * bytesPerSample));

  const samples = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) {
    const sampleOffset = dataOffset + i * numChannels * bytesPerSample;
    if (bitsPerSample === 16) {
      samples[i] = view.getInt16(sampleOffset, true) / 32768;
    } else if (bitsPerSample === 24) {
      const b0 = view.getUint8(sampleOffset);
      const b1 = view.getUint8(sampleOffset + 1);
      const b2 = view.getUint8(sampleOffset + 2);
      const raw = b0 | (b1 << 8) | (b2 << 16);
      samples[i] = (raw > 0x7FFFFF ? raw - 0x1000000 : raw) / 8388608;
    }
  }

  return { samples, sampleRate };
}

function writeWav(filePath: string, samples: Float32Array, sampleRate: number): void {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), offset);
    offset += 2;
  }

  writeFileSync(filePath, buffer);
}

// ─── Pitch Shifting (high-quality resampling with sinc interpolation) ───────

/**
 * Pitch-shift by resampling with windowed-sinc interpolation.
 * ratio > 1 = pitch up, ratio < 1 = pitch down.
 * Output length stays the same (we just resample the input).
 *
 * This is NOT formant-preserving (formants shift with pitch),
 * but for ±8 semitones the artifacts are acceptable,
 * and this is baked offline so runtime stays clean.
 */
function pitchShift(samples: Float32Array, ratio: number): Float32Array {
  const outLen = samples.length;
  const output = new Float32Array(outLen);

  // Windowed sinc interpolation (Lanczos kernel, a=4)
  const a = 4;

  for (let i = 0; i < outLen; i++) {
    // Map output position back to input position
    const srcPos = i * ratio;
    const srcInt = Math.floor(srcPos);
    const srcFrac = srcPos - srcInt;

    let sample = 0;
    let weightSum = 0;

    for (let j = -a + 1; j <= a; j++) {
      const srcIdx = srcInt + j;
      if (srcIdx < 0 || srcIdx >= samples.length) continue;

      const x = srcFrac - j;
      // Lanczos kernel
      let weight: number;
      if (Math.abs(x) < 1e-6) {
        weight = 1;
      } else if (Math.abs(x) < a) {
        const piX = Math.PI * x;
        const piXa = piX / a;
        weight = (Math.sin(piX) / piX) * (Math.sin(piXa) / piXa);
      } else {
        weight = 0;
      }

      sample += samples[srcIdx] * weight;
      weightSum += weight;
    }

    output[i] = weightSum > 0 ? sample / weightSum : 0;
  }

  return output;
}

// ─── RMS Normalization ──────────────────────────────────────────────────────

function rmsLevel(samples: Float32Array): number {
  let sumSq = 0;
  for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i];
  return Math.sqrt(sumSq / samples.length);
}

function normalizeRms(samples: Float32Array, targetDb: number): Float32Array {
  const currentRms = rmsLevel(samples);
  if (currentRms < 1e-10) return samples;

  const targetRms = Math.pow(10, targetDb / 20);
  const gain = targetRms / currentRms;

  const output = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    output[i] = Math.max(-0.99, Math.min(0.99, samples[i] * gain));
  }
  return output;
}

// ─── Audio Helpers ───────────────────────────────────────────────────────────

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function segRms(arr: Float32Array, s: number, e: number): number {
  let acc = 0;
  for (let i = s; i < e; i++) acc += arr[i] * arr[i];
  return Math.sqrt(acc / Math.max(1, e - s));
}

function segZcr(arr: Float32Array, s: number, e: number): number {
  let c = 0;
  let prev = arr[s] >= 0;
  for (let i = s + 1; i < e; i++) {
    const cur = arr[i] >= 0;
    if (cur !== prev) c++;
    prev = cur;
  }
  return c / Math.max(1, e - s);
}

function autocorrPeriod(arr: Float32Array, s: number, e: number, sr: number, fmin: number, fmax: number): number | null {
  const n = e - s;
  if (n < 2048) return null;
  const lagMin = clamp(Math.floor(sr / fmax), 1, n - 2);
  const lagMax = clamp(Math.floor(sr / fmin), lagMin + 1, n - 1);
  let energy = 0;
  for (let i = 0; i < n; i++) energy += arr[s + i] * arr[s + i];
  if (energy < 1e-6) return null;
  let bestLag = -1, best = -1e9;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += arr[s + i] * arr[s + i + lag];
    if (sum > best) { best = sum; bestLag = lag; }
  }
  return bestLag > 0 ? bestLag : null;
}

function findRisingZeroCrossings(arr: Float32Array, s: number, e: number): number[] {
  const out: number[] = [];
  for (let i = s + 1; i < e; i++) {
    if (arr[i - 1] <= 0 && arr[i] > 0) out.push(i);
  }
  return out;
}

// ─── Step 1: Extract Stable Voiced Region ───────────────────────────────────
//
// Finds the most stable voiced window (high RMS / low ZCR) in a TTS carrier.
// Returns a generous region (~900ms) WITHOUT loop point selection or crossfade.
// This is the raw material that gets pitch-shifted before loop extraction.

function extractStableRegion(
  x: Float32Array,
  sampleRate: number,
  attackSkipRatio = 0.30,
  scanWinMs = 900,
  hopMs = 20,
): Float32Array {
  const N = x.length;
  const scanWin = Math.floor(sampleRate * (scanWinMs / 1000));
  const hop = Math.max(1, Math.floor(sampleRate * (hopMs / 1000)));

  const searchStart = Math.floor(N * attackSkipRatio);
  const searchEnd = Math.floor(N * 0.95);

  let bestS = searchStart;
  let bestScore = -1e9;

  for (let s = searchStart; s + scanWin < searchEnd; s += hop) {
    const e = s + scanWin;
    const r = segRms(x, s, e);
    const z = segZcr(x, s, e);
    const clipPenalty = r > 0.7 ? (r - 0.7) * 3 : 0;
    const score = (r / (z + 1e-6)) - clipPenalty;
    if (score > bestScore) { bestScore = score; bestS = s; }
  }

  const winE = Math.min(N, bestS + scanWin);
  return x.slice(bestS, winE);
}

// ─── Step 2: Find Loop Points in a Signal ───────────────────────────────────
//
// Given a signal (possibly already pitch-shifted), finds optimal loop points
// at phase-aligned zero crossings that minimize value+slope discontinuity,
// extracts the segment, and applies crossfade + soft limiter.
//
// This runs AFTER pitch shifting so the loop alignment accounts for the
// actual shifted signal characteristics.

interface LoopOpts {
  minLoopSec?: number;    // default 0.35
  maxLoopSec?: number;    // default 0.80
  f0MinHz?: number;       // default 70
  f0MaxHz?: number;       // default 600 (high to handle pitch-shifted signals)
}

function extractLoopFromStable(
  x: Float32Array,
  sampleRate: number,
  label: string,
  opts?: LoopOpts,
): Float32Array {
  const o = {
    minLoopSec: 0.30,   // longer loop = more STFT frames = better spectral freeze
    maxLoopSec: 0.60,   // spectral freeze handles stationarity, so length is safe
    f0MinHz: 70,
    f0MaxHz: 600,
    ...opts,
  };

  const N = x.length;
  const minLen = Math.floor(sampleRate * o.minLoopSec);
  const maxLen = Math.min(N - 1, Math.floor(sampleRate * o.maxLoopSec));

  // Estimate fundamental period of this signal
  const P = autocorrPeriod(x, 0, N, sampleRate, o.f0MinHz, o.f0MaxHz) ?? undefined;

  if (P) {
    const estF0 = sampleRate / P;
    console.log(`${label}F0 estimate: ${estF0.toFixed(1)}Hz (period ${P} samples)`);
  }

  // Find rising zero crossings
  const zc = findRisingZeroCrossings(x, 0, N);

  if (zc.length < 4) {
    // Fallback: take middle with crossfade
    const mid = Math.floor(N / 2);
    const len = Math.min(minLen, N - 2);
    const start = clamp(mid - Math.floor(len / 2), 0, N - len - 1);
    const seg = x.slice(start, start + len);
    applyMicroTaper(seg);
    applySoftLimit(seg);
    console.log(`${label}fallback loop (few zero crossings): ${(len / sampleRate * 1000).toFixed(0)}ms`);
    return seg;
  }

  // Find best loop point pair
  // Score = dv + 6*ds  (heavy slope weighting for voice — slope mismatches
  // produce more audible artifacts than value mismatches at zero crossings)
  let bestPair: { start: number; end: number; score: number } | null = null;

  for (let i = 0; i < zc.length; i++) {
    const start = zc[i];
    const targetLens: number[] = [];

    if (P) {
      // Enforce k*P: loop length must be an exact integer multiple of
      // the fundamental period. This phase-locks the loop and prevents
      // the "murmur" drift from partial-period misalignment.
      const kMin = Math.ceil(minLen / P);
      const kMax = Math.floor(maxLen / P);
      for (let k = kMin; k <= kMax; k++) targetLens.push(Math.round(k * P));
    } else {
      targetLens.push(minLen, Math.floor((minLen + maxLen) / 2), maxLen);
    }

    for (const L of targetLens) {
      const approxEnd = start + L;
      if (approxEnd >= N) continue;

      // Tight search: ±2 samples around exact k*P boundary.
      // The loop length IS the period constraint; searching wider
      // would defeat the purpose of k*P enforcement.
      const searchRadius = P ? 2 : Math.floor(sampleRate * 0.03);
      const eMin = clamp(approxEnd - searchRadius, 1, N - 2);
      const eMax = clamp(approxEnd + searchRadius, 2, N - 1);

      for (let j = 0; j < zc.length; j++) {
        const end = zc[j];
        if (end < eMin || end > eMax) continue;
        if (end - start < minLen || end - start > maxLen) continue;

        const vJump = Math.abs(x[end] - x[start]);
        const sJump = Math.abs((x[end] - x[end - 1]) - (x[start + 1] - x[start]));
        const score = vJump + 6.0 * sJump;

        if (!bestPair || score < bestPair.score) {
          bestPair = { start, end, score };
        }
      }
    }
  }

  if (!bestPair) {
    const start = zc[Math.floor(zc.length / 3)];
    const end = clamp(start + minLen, start + 16, N - 1);
    const seg = x.slice(start, end);
    applyMicroTaper(seg);
    applySoftLimit(seg);
    console.log(`${label}fallback loop: ${((end - start) / sampleRate * 1000).toFixed(0)}ms`);
    return seg;
  }

  const loopLen = bestPair.end - bestPair.start;
  console.log(`${label}loop: ${(loopLen / sampleRate * 1000).toFixed(0)}ms, boundary score: ${bestPair.score.toFixed(6)}`);

  const segment = x.slice(bestPair.start, bestPair.end);
  applyMicroTaper(segment);
  applySoftLimit(segment);
  return segment;
}

/**
 * Micro-taper: fade the first and last T samples toward zero.
 *
 * Since the loop extraction already selects endpoints at matching rising
 * zero crossings (boundary score < 0.001), a big crossfade would DESTROY
 * this alignment by blending in samples from arbitrary phase positions.
 *
 * Instead, we apply a tiny 4-sample taper (~0.17ms at 24kHz) that ensures
 * both ends converge to exactly zero, preventing quantization clicks at
 * the loop boundary without disrupting the phase-aligned loop points.
 */
function applyMicroTaper(seg: Float32Array): void {
  const T = 4;
  const N = seg.length;
  if (N < 2 * T) return;
  for (let i = 0; i < T; i++) {
    const alpha = (i + 0.5) / T;
    seg[i] *= alpha;
    seg[N - 1 - i] *= alpha;
  }
}

// ─── Amplitude Leveling ──────────────────────────────────────────────────────
//
// Speech vowels have slow loudness motion. Looping that creates "wah…wah…wah…"
// This function computes an RMS envelope, smooths it, and divides it out,
// turning speech-like amplitude wobble into a flat, sustained tone.

interface LevelOpts {
  winMs?: number;       // RMS window size in ms (default: adaptive to f0)
  smoothMs?: number;    // smoothing time constant in ms (default 40)
  maxCorrection?: number; // max gain correction factor (default 3)
  f0Hz?: number;        // expected fundamental Hz (for adaptive window sizing)
  label?: string;       // log label
}

function levelAmplitude(seg: Float32Array, sampleRate: number, opts?: LevelOpts): Float32Array {
  const {
    smoothMs = 40,
    maxCorrection = 3.0,
    f0Hz,
    label = "         → ",
  } = opts ?? {};

  // Adaptive window: at least 4 complete fundamental periods, minimum 10ms
  // This ensures the RMS captures envelope, not per-cycle wobble.
  let winMs = opts?.winMs;
  if (!winMs) {
    if (f0Hz && f0Hz > 20) {
      const periodMs = 1000 / f0Hz;
      winMs = Math.max(10, Math.ceil(periodMs * 4));
    } else {
      winMs = 15;
    }
  }

  const out = new Float32Array(seg.length);

  // Step 1: Compute RMS envelope
  const winSamples = Math.max(1, Math.floor(sampleRate * (winMs / 1000)));
  const env = new Float32Array(seg.length);

  for (let i = 0; i < seg.length; i++) {
    const s = Math.max(0, i - Math.floor(winSamples / 2));
    const e = Math.min(seg.length, s + winSamples);
    let sum = 0;
    for (let j = s; j < e; j++) sum += seg[j] * seg[j];
    env[i] = Math.sqrt(sum / (e - s));
  }

  // Step 2: One-pole lowpass smoothing
  const smoothCoeff = 1 - Math.exp(-1 / (sampleRate * (smoothMs / 1000)));
  const smoothed = new Float32Array(seg.length);
  smoothed[0] = env[0];
  for (let i = 1; i < seg.length; i++) {
    smoothed[i] = smoothed[i - 1] + smoothCoeff * (env[i] - smoothed[i - 1]);
  }

  // Step 3: Compute target level (median envelope)
  const sorted = Float32Array.from(smoothed).sort();
  const medianEnv = sorted[Math.floor(sorted.length / 2)];

  // Step 4: Divide out envelope
  const MIN_ENV = medianEnv * 0.05; // don't try to correct near-silence

  for (let i = 0; i < seg.length; i++) {
    if (smoothed[i] < MIN_ENV) {
      out[i] = seg[i]; // leave near-silence alone
    } else {
      const correction = Math.min(maxCorrection, medianEnv / smoothed[i]);
      out[i] = seg[i] * correction;
    }
  }

  // Report
  const validEnv = Array.from(smoothed).filter(v => v > MIN_ENV);
  const envMin = Math.min(...validEnv);
  const envMax = Math.max(...validEnv);
  const envRange = envMax > 0 && envMin > 0 ? (envMax / envMin) : 1;
  console.log(`${label}amplitude leveled (${winMs}ms win): range ${envRange.toFixed(2)}× → flat`);

  return out;
}

/** Soft limiter (tanh) to tame peaks after normalization. */
function applySoftLimit(seg: Float32Array): void {
  const k = 1.2;
  const invTanhK = 1 / Math.tanh(k);
  for (let i = 0; i < seg.length; i++) {
    seg[i] = Math.tanh(seg[i] * k) * invTanhK;
  }
}

// ─── Spectral Freeze (STFT Median-Magnitude) ────────────────────────────────
//
// The nuclear option for formant motion.
//
// Speech vowels have time-varying spectral envelopes (formants move) — even
// after amplitude leveling, the ear hears this as "multiple voices talking."
// No amount of time-domain envelope correction can fix it because the problem
// is in the SPECTRAL domain.
//
// Algorithm:
//   1. STFT the loop segment (windowed, overlapping frames)
//   2. For each frequency bin, compute the MEDIAN magnitude across all frames
//   3. Replace every frame's magnitude with that median (freeze)
//   4. ISTFT with original phases (preserves pitch, timing, identity)
//
// Result: the spectral envelope is frozen in time. The ear hears one
// sustained timbre, not a murmuring choir.

/**
 * Radix-2 Cooley-Tukey FFT (in-place).
 * Operates on interleaved real/imaginary arrays of length N (must be power of 2).
 */
function fft(re: Float32Array, im: Float32Array, inverse: boolean): void {
  const n = re.length;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  // Butterfly passes
  for (let len = 2; len <= n; len *= 2) {
    const halfLen = len / 2;
    const angle = (inverse ? 2 : -2) * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);

    for (let i = 0; i < n; i += len) {
      let uRe = 1, uIm = 0;
      for (let j = 0; j < halfLen; j++) {
        const tRe = uRe * re[i + j + halfLen] - uIm * im[i + j + halfLen];
        const tIm = uRe * im[i + j + halfLen] + uIm * re[i + j + halfLen];
        re[i + j + halfLen] = re[i + j] - tRe;
        im[i + j + halfLen] = im[i + j] - tIm;
        re[i + j] += tRe;
        im[i + j] += tIm;
        const newURe = uRe * wRe - uIm * wIm;
        uIm = uRe * wIm + uIm * wRe;
        uRe = newURe;
      }
    }
  }

  // Normalize for inverse
  if (inverse) {
    for (let i = 0; i < n; i++) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

/**
 * STFT median-magnitude spectral freeze.
 *
 * Freezes the spectral envelope by replacing every frame's magnitude
 * spectrum with the per-bin median across all frames. Original phase
 * is preserved — pitch, timing, and waveform identity remain intact.
 *
 * @param samples  Input signal (mono)
 * @param sampleRate  Sample rate
 * @param opts.fftSize  FFT size (default 2048 — good frequency resolution)
 * @param opts.hopSize  Hop between frames (default fftSize/4 — 75% overlap)
 * @param opts.label    Log prefix
 */
function spectralFreeze(samples: Float32Array, sampleRate: number, opts?: {
  fftSize?: number;
  hopSize?: number;
  f0Hz?: number;
  label?: string;
}): Float32Array {
  const {
    fftSize = 2048,
    f0Hz,
    label = "         → ",
  } = opts ?? {};
  const hopSize = opts?.hopSize ?? Math.floor(fftSize / 4);

  const N = samples.length;
  const halfFFT = fftSize / 2 + 1;

  // Analysis window (Hann)
  const win = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / fftSize));
  }

  const numFrames = Math.max(1, Math.floor((N - fftSize) / hopSize) + 1);
  if (numFrames < 2) {
    console.log(`${label}spectral freeze: skipped (too short for ${fftSize}-pt FFT)`);
    return samples;
  }

  // ── Step 1: STFT analysis ──
  // For each frame, get the FULL complex spectrum (re + im).
  // We'll also extract the log-magnitude spectral envelope via cepstral liftering.

  const frameRe: Float32Array[] = [];
  const frameIm: Float32Array[] = [];
  const logMags: Float32Array[] = [];  // log-magnitude spectra

  for (let f = 0; f < numFrames; f++) {
    const offset = f * hopSize;
    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);

    for (let i = 0; i < fftSize; i++) {
      re[i] = (offset + i < N) ? samples[offset + i] * win[i] : 0;
    }

    fft(re, im, false);
    frameRe.push(Float32Array.from(re));
    frameIm.push(Float32Array.from(im));

    // Log-magnitude for cepstral analysis
    const logMag = new Float32Array(halfFFT);
    for (let k = 0; k < halfFFT; k++) {
      const mag = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      logMag[k] = Math.log(Math.max(mag, 1e-10));
    }
    logMags.push(logMag);
  }

  // ── Step 2: Cepstral liftering — extract spectral envelopes ──
  //
  // The cepstrum separates "slow" spectral features (formants = spectral
  // envelope, varying across frames) from "fast" features (harmonics =
  // fine structure, stable when pitch is stable).
  //
  // Process:
  //   1. Take IFFT of log-magnitude spectrum → cepstrum
  //   2. Zero out high-quefrency bins (keep only first L coefficients)
  //   3. FFT back → smoothed log-magnitude envelope
  //
  // The lifter order L controls the envelope smoothness:
  //   L small = very smooth envelope (just gross formant shape)
  //   L large = detailed envelope (captures individual harmonics)
  //   We want L ≈ sampleRate / (2 * F0_min) to separate envelope from harmonics.

  // Lifter order: MUST be BELOW the fundamental period in samples.
  // Cepstrum quefrency bin q represents a "period" of q samples.
  // To separate spectral envelope (formants) from harmonic fine structure,
  // we keep only quefrency bins [0..L] where L < period.
  //
  // At higher pitches, L must shrink proportionally:
  //   c2 (65Hz):   period=369 → L=80 (captures broad formant shape)
  //   c4 (262Hz):  period=92  → L=40 (smooth envelope)
  //   e5 (659Hz):  period=36  → L=15 (very smooth)
  //   gs6 (1661Hz): period=14 → L=6  (gross shape only)
  //
  // Using L = floor(period * 0.4) — stays well below the first harmonic
  // cepstral peak while capturing enough envelope detail.
  const periodSamples = f0Hz && f0Hz > 20 ? sampleRate / f0Hz : 369;
  const lifterOrder = Math.max(4, Math.min(80, Math.floor(periodSamples * 0.4)));

  // For cepstral analysis, we need a full-length symmetric log spectrum.
  // Build it from halfFFT and lifter in place.

  const envelopes: Float32Array[] = [];

  for (let f = 0; f < numFrames; f++) {
    // Build full symmetric log-magnitude spectrum for real cepstrum
    const fullLogMag = new Float32Array(fftSize);
    for (let k = 0; k < halfFFT; k++) fullLogMag[k] = logMags[f][k];
    for (let k = 1; k < fftSize / 2; k++) fullLogMag[fftSize - k] = fullLogMag[k];

    // Cepstrum: IFFT of log-magnitude
    const cepRe = Float32Array.from(fullLogMag);
    const cepIm = new Float32Array(fftSize);
    fft(cepRe, cepIm, true);  // → cepstrum in cepRe

    // Lifter: zero high-quefrency (keep only [0..L] and [N-L..N-1])
    // This isolates the spectral ENVELOPE (formant positions + amplitudes).
    for (let q = lifterOrder + 1; q < fftSize - lifterOrder; q++) {
      cepRe[q] = 0;
      cepIm[q] = 0;
    }

    // Back to spectral domain: FFT of liftered cepstrum → smoothed log envelope
    fft(cepRe, cepIm, false);
    // cepRe now contains the smoothed log-magnitude envelope

    const env = new Float32Array(halfFFT);
    for (let k = 0; k < halfFFT; k++) env[k] = cepRe[k];
    envelopes.push(env);
  }

  // ── Step 3: Compute FROZEN envelope (median across frames) ──
  const frozenEnv = new Float32Array(halfFFT);
  const tempBin = new Float32Array(numFrames);

  for (let k = 0; k < halfFFT; k++) {
    for (let f = 0; f < numFrames; f++) tempBin[f] = envelopes[f][k];
    tempBin.sort();
    frozenEnv[k] = numFrames % 2 === 1
      ? tempBin[Math.floor(numFrames / 2)]
      : (tempBin[numFrames / 2 - 1] + tempBin[numFrames / 2]) / 2;
  }

  // Measure how much the envelopes vary (pre-freeze diagnostic)
  let envVariance = 0;
  for (let k = 0; k < halfFFT; k++) {
    for (let f = 0; f < numFrames; f++) {
      envVariance += (envelopes[f][k] - frozenEnv[k]) ** 2;
    }
  }
  const envStd = Math.sqrt(envVariance / (halfFFT * numFrames));

  // ── Step 4: Apply frozen envelope to each frame ──
  //
  // For each frame:
  //   original_magnitude = exp(envelope + fine_structure)
  //   fine_structure = log_magnitude - envelope
  //   frozen_magnitude = exp(frozen_envelope + fine_structure)
  //                    = original_magnitude * exp(frozen_envelope - original_envelope)
  //
  // This preserves each frame's harmonic structure (which harmonics are
  // strong/weak) while forcing the formant envelope to be constant.
  // Result: pitch and identity preserved, formant motion eliminated.

  const output = new Float32Array(N);
  const winSum = new Float32Array(N);

  for (let f = 0; f < numFrames; f++) {
    const offset = f * hopSize;
    const re = Float32Array.from(frameRe[f]);
    const im = Float32Array.from(frameIm[f]);

    // Apply envelope correction: multiply by exp(frozen - original) per bin
    for (let k = 0; k < halfFFT; k++) {
      const correction = Math.exp(frozenEnv[k] - envelopes[f][k]);
      // Clamp correction to avoid extreme amplification of noise
      const clampedCorr = Math.min(8.0, Math.max(0.125, correction));
      re[k] *= clampedCorr;
      im[k] *= clampedCorr;
    }

    // Mirror conjugate for negative frequencies
    for (let k = 1; k < fftSize / 2; k++) {
      re[fftSize - k] = re[k];
      im[fftSize - k] = -im[k];
    }

    // Inverse FFT
    fft(re, im, true);

    // Overlap-add with synthesis window
    for (let i = 0; i < fftSize; i++) {
      if (offset + i < N) {
        output[offset + i] += re[i] * win[i];
        winSum[offset + i] += win[i] * win[i];
      }
    }
  }

  // Normalize by window overlap sum (COLA condition)
  for (let i = 0; i < N; i++) {
    if (winSum[i] > 1e-6) output[i] /= winSum[i];
  }

  // Report
  let diffEnergy = 0, origEnergy = 0;
  for (let i = 0; i < N; i++) {
    const d = output[i] - samples[i];
    diffEnergy += d * d;
    origEnergy += samples[i] * samples[i];
  }
  const changePct = origEnergy > 0 ? (100 * Math.sqrt(diffEnergy / origEnergy)).toFixed(1) : "?";
  console.log(`${label}cepstral freeze: ${numFrames} frames, L=${lifterOrder}, env σ=${envStd.toFixed(2)}, Δ=${changePct}%`);

  return output;
}

// ─── Main ───────────────────────────────────────────────────────────────────

mkdirSync(OUTPUT_DIR, { recursive: true });

console.log("Baking vocal carrier bank...");
console.log(`Anchors: ${ANCHORS.map(m => NOTE_NAMES[m] + "(" + m + ")").join(", ")}`);
console.log(`Raw carriers: ${RAW_CARRIERS.length} from Kokoro TTS`);
console.log(`Target RMS: ${TARGET_RMS_DB} dBFS`);
console.log();

// Clear existing carriers
for (const f of readdirSync(OUTPUT_DIR)) {
  if (f.startsWith("carrier-") && f.endsWith(".wav")) {
    const fullPath = join(OUTPUT_DIR, f);
    writeFileSync(fullPath, Buffer.alloc(0)); // truncate
    // Actually just overwrite — we'll write new ones
  }
}

// ─── Cascading bake ─────────────────────────────────────────────────────────
//
// Two-phase pipeline:
//   Phase A: Extract stable voiced region from each raw TTS carrier (no loop yet)
//   Phase B: For each anchor, pick nearest seed → pitch shift → THEN find loop
//            points in the shifted signal → crossfade → normalize → write
//
// This ensures loop point selection accounts for the actual shifted waveform,
// not pre-shift characteristics that get disrupted by resampling.

interface StableRegion {
  midi: number;
  samples: Float32Array;
  sampleRate: number;
  voice: string;
  ampSigmaDb: number;  // amplitude stationarity: lower = more stable
}

/**
 * Measure amplitude stationarity of a signal (σ of RMS envelope in dB).
 * Uses a window of ≥4 fundamental periods for accuracy.
 */
function measureAmpSigma(samples: Float32Array, sampleRate: number, f0Hz?: number): number {
  const periodMs = (f0Hz && f0Hz > 20) ? (1000 / f0Hz) : 10;
  const winMs = Math.max(10, Math.ceil(periodMs * 4));
  const winSamples = Math.max(1, Math.floor(sampleRate * (winMs / 1000)));
  const hopSamples = Math.floor(sampleRate * 0.010); // 10ms hop

  const dbValues: number[] = [];
  for (let i = 0; i + winSamples <= samples.length; i += hopSamples) {
    let sum = 0;
    for (let j = 0; j < winSamples; j++) sum += samples[i + j] * samples[i + j];
    const rms = Math.sqrt(sum / winSamples);
    if (rms > 1e-8) dbValues.push(20 * Math.log10(rms));
  }

  if (dbValues.length < 2) return 99;
  const mean = dbValues.reduce((a, b) => a + b, 0) / dbValues.length;
  const variance = dbValues.reduce((a, v) => a + (v - mean) ** 2, 0) / dbValues.length;
  return Math.sqrt(variance);
}

const stablePool: StableRegion[] = [];

// Phase A: Extract stable regions + measure stationarity
console.log("Phase A: Extracting stable voiced regions + measuring stationarity...");
for (const raw of RAW_CARRIERS) {
  const { samples, sampleRate } = readWav(join(RAW_DIR, raw.file));
  const stable = extractStableRegion(samples, sampleRate);

  // Estimate F0 for this voice
  const rawF0Hz = 440 * Math.pow(2, (raw.midi - 69) / 12);
  const sigma = measureAmpSigma(stable, sampleRate, rawF0Hz);
  const verdict = sigma < 2 ? "✓" : sigma < 4 ? "~" : "✗";

  console.log(`  ${raw.voice.padEnd(12)} (MIDI ${raw.midi}): ${(stable.length / sampleRate * 1000).toFixed(0)}ms, σ=${sigma.toFixed(1)}dB ${verdict}`);
  stablePool.push({ midi: raw.midi, samples: stable, sampleRate, voice: raw.voice, ampSigmaDb: sigma });
}
console.log();

// Phase B: Cascading bake with loop extraction AFTER pitch shift
console.log("Phase B: Cascading bake (pitch shift → loop extract)...");

// Also keep baked results as potential seeds for cascading
const bakedRegions: StableRegion[] = [];

const sortedAnchors = [...ANCHORS].sort((a, b) => a - b);

for (const anchor of sortedAnchors) {
  const noteName = NOTE_NAMES[anchor];
  const outFile = join(OUTPUT_DIR, `carrier-${noteName}.wav`);

  // ── Stationarity-aware seed selection ──
  // Cost = ampSigma * W_SIGMA + abs(semitoneShift) * W_SHIFT
  // Prefers stationary seeds even if they need more shifting.
  // A talky-but-close seed is worse than a stable-but-far seed.
  const W_SIGMA = 3.0;  // penalty per dB of envelope wobble
  const W_SHIFT = 1.0;  // penalty per semitone of shift distance
  const MAX_SHIFT = 12; // never shift more than 12 semitones

  const allSeeds = [...stablePool, ...bakedRegions];
  let bestSeed = allSeeds[0];
  let bestCost = Infinity;

  for (const seed of allSeeds) {
    const shift = Math.abs(anchor - seed.midi);
    if (shift > MAX_SHIFT) continue;
    const cost = seed.ampSigmaDb * W_SIGMA + shift * W_SHIFT;
    if (cost < bestCost) {
      bestCost = cost;
      bestSeed = seed;
    }
  }

  const semitoneDiff = anchor - bestSeed.midi;
  const ratio = Math.pow(2, -semitoneDiff / 12);

  console.log(`  ${noteName.padEnd(4)} (MIDI ${anchor}): seed=${bestSeed.voice}(${bestSeed.midi}), shift=${semitoneDiff > 0 ? "+" : ""}${semitoneDiff} st, σ=${bestSeed.ampSigmaDb.toFixed(1)}dB, cost=${bestCost.toFixed(1)}`);

  // Start from the stable region
  let material = bestSeed.samples;

  // Pitch shift if needed (on the raw stable region, BEFORE loop extraction)
  if (Math.abs(semitoneDiff) > 0.5) {
    material = pitchShift(material, ratio);
    console.log(`         → pitch-shifted by ${semitoneDiff} semitones (ratio ${ratio.toFixed(4)})`);
  }

  const expectedF0 = 440 * Math.pow(2, (anchor - 69) / 12);

  // Pass 1: Coarse amplitude leveling on the full stable region.
  // Flattens the macro speech envelope before loop extraction.
  // Adaptive window: ≥4 periods of the fundamental.
  material = levelAmplitude(material, bestSeed.sampleRate, {
    smoothMs: 50, maxCorrection: 3.0, f0Hz: expectedF0,
    label: "         → pass1: ",
  });

  // Find loop points in the leveled, shifted signal
  const f0Min = Math.max(30, expectedF0 * 0.6);
  const f0Max = Math.min(5000, expectedF0 * 1.5);
  let processed = extractLoopFromStable(material, bestSeed.sampleRate, "         → ", {
    f0MinHz: f0Min,
    f0MaxHz: f0Max,
  });

  // ── SPECTRAL FREEZE ──
  // The heavy DSP that kills formant motion.
  // STFT → median magnitude per bin → ISTFT.
  // After this, every frame has the same spectral envelope.
  // The ear hears one sustained tone, not murmuring voices.
  //
  // FFT size: 2048 at 24kHz = 85ms frames, ~11.7 Hz resolution.
  // Good enough to resolve the fundamental for all carriers (≥65Hz).
  // Hop = 512 (75% overlap) for smooth reconstruction.
  processed = spectralFreeze(processed, bestSeed.sampleRate, {
    fftSize: 2048,
    hopSize: 512,
    f0Hz: expectedF0,
    label: "         → ",
  });

  // Aggressive amplitude leveling after freeze.
  // Spectral freeze kills formant motion (the perceptual problem)
  // but creates amplitude beating from phase reconstruction.
  // High maxCorrection is safe here — the spectral content is frozen,
  // so aggressive leveling won't reintroduce speech gestures.
  processed = levelAmplitude(processed, bestSeed.sampleRate, {
    smoothMs: 40, maxCorrection: 10.0, f0Hz: expectedF0,
    label: "         → post-freeze level: ",
  });

  // Re-apply micro-taper (freeze + leveling can disturb endpoints)
  applyMicroTaper(processed);

  // RMS normalize
  const beforeRms = 20 * Math.log10(rmsLevel(processed));
  processed = normalizeRms(processed, TARGET_RMS_DB);
  const afterRms = 20 * Math.log10(rmsLevel(processed));
  console.log(`         → RMS: ${beforeRms.toFixed(1)} → ${afterRms.toFixed(1)} dBFS`);

  // Write
  writeWav(outFile, processed, bestSeed.sampleRate);

  const sizeKB = (processed.length * 2 / 1024).toFixed(0);
  const durS = (processed.length / bestSeed.sampleRate).toFixed(1);
  console.log(`         → ${noteName}.wav: ${durS}s, ${sizeKB}KB`);

  // Add the leveled material to seed pool for cascading.
  // Measure its stationarity so the cost function can evaluate it.
  const bakedSigma = measureAmpSigma(processed, bestSeed.sampleRate, expectedF0);
  console.log(`         → baked σ=${bakedSigma.toFixed(1)}dB`);
  bakedRegions.push({ midi: anchor, samples: material, sampleRate: bestSeed.sampleRate, voice: `baked(${anchor})`, ampSigmaDb: bakedSigma });
}

console.log(`\nDone! Baked ${ANCHORS.length} carriers in ${OUTPUT_DIR}`);
