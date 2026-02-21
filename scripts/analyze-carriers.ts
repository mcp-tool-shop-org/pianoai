#!/usr/bin/env tsx
// ─── SMS-lite Harmonic Analyzer ─────────────────────────────────────────────
//
// Extracts frozen harmonic + noise parameters from raw TTS carriers.
//
// For each carrier:
//   1. Read stable voiced region
//   2. STFT analysis (2048-pt FFT, 512-hop, Hann window)
//   3. Track harmonic magnitudes A[k] for k=1..H per frame
//   4. Median across frames → frozen harmonic table
//   5. Residual = total - harmonics → noise spectrum N[bin]
//   6. Median + smooth → frozen noise spectrum
//   7. Cepstral spectral envelope E[bin] (frozen vowel color)
//   8. Save as JSON
//
// The output is a parameter set that an additive synthesizer can use to
// produce a perfectly stationary "voice" — no speech gestures, no formant
// motion, no loop artifacts. Just one oscillator bank + one noise bed.
//
// Usage:
//   npx tsx scripts/analyze-carriers.ts
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Config ─────────────────────────────────────────────────────────────────

const RAW_DIR = "F:/AI/avatar-face-mvp/.tts-output/vocal-carriers";
const OUTPUT_DIR = join(__dirname, "..", "samples", "vocal-params");
const FFT_SIZE = 2048;
const HOP_SIZE = 512;
const NYQUIST_MARGIN = 0.96;  // don't track harmonics above 96% of Nyquist

// ─── Raw carrier inventory (same as bake-carriers.ts) ───────────────────────

interface RawCarrier {
  file: string;
  voice: string;
  midi: number;
}

const RAW_CARRIERS: RawCarrier[] = [
  { file: "am_onyx_ab6a895d.wav",     voice: "onyx",      midi: 39 },
  { file: "am_michael_ab6a895d.wav",   voice: "michael",   midi: 45 },
  { file: "am_fenrir_ab6a895d.wav",    voice: "fenrir",    midi: 49 },
  { file: "af_sky_ab6a895d.wav",       voice: "sky",       midi: 51 },
  { file: "af_aoede_ab6a895d.wav",     voice: "aoede",     midi: 51 },
  { file: "bf_emma_ab6a895d.wav",      voice: "emma",      midi: 52 },
  { file: "af_aoede_1f419d25.wav",     voice: "aoede-la",  midi: 52 },
  { file: "af_aoede_194056a6.wav",     voice: "aoede-oo",  midi: 54 },
  { file: "bf_isabella_ab6a895d.wav",  voice: "isabella",  midi: 55 },
];

// ─── Output parameter set ───────────────────────────────────────────────────

interface VoiceParams {
  name: string;
  sampleRate: number;
  rootMidi: number;
  f0Hz: number;
  H: number;               // number of harmonics
  harmonics: number[];      // A[k] for k=1..H (linear magnitude)
  fftSize: number;
  noiseBins: number[];      // N[bin] for bin=0..fftSize/2 (linear magnitude)
  envelopeBins: number[];   // E[bin] for bin=0..fftSize/2 (linear gain, normalized to avg=1)
  ampSigmaDb: number;       // stationarity of raw carrier
}

// ─── WAV I/O (shared with bake-carriers) ────────────────────────────────────

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

  if (fmtOffset < 0 || dataOffset < 0) throw new Error(`Bad WAV: ${filePath}`);

  const sampleRate = view.getUint32(fmtOffset + 4, true);
  const bitsPerSample = view.getUint16(fmtOffset + 14, true);
  const numChannels = view.getUint16(fmtOffset + 2, true);

  const bytesPerSample = bitsPerSample / 8;
  const numSamples = Math.floor(dataSize / (bytesPerSample * numChannels));
  const samples = new Float32Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const byteOff = dataOffset + i * bytesPerSample * numChannels;
    if (bitsPerSample === 16) {
      samples[i] = view.getInt16(byteOff, true) / 32768;
    } else if (bitsPerSample === 32) {
      samples[i] = view.getFloat32(byteOff, true);
    }
  }

  return { samples, sampleRate };
}

// ─── Extract stable voiced region (reuse logic from bake-carriers) ──────────

function extractStableRegion(samples: Float32Array, sampleRate: number): Float32Array {
  const durSamples = Math.floor(sampleRate * 0.9);
  const startOffset = Math.floor(sampleRate * 0.15);

  if (startOffset + durSamples > samples.length) {
    const available = samples.length - startOffset;
    return samples.slice(startOffset, startOffset + Math.max(available, 1));
  }
  return samples.slice(startOffset, startOffset + durSamples);
}

// ─── Measure amplitude stationarity ─────────────────────────────────────────

function measureAmpSigma(samples: Float32Array, sampleRate: number, f0Hz: number): number {
  const periodMs = f0Hz > 20 ? (1000 / f0Hz) : 10;
  const winMs = Math.max(10, Math.ceil(periodMs * 4));
  const winSamples = Math.max(1, Math.floor(sampleRate * (winMs / 1000)));
  const hopSamples = Math.floor(sampleRate * 0.010);

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

// ─── FFT (radix-2 Cooley-Tukey, in-place) ──────────────────────────────────

function fft(re: Float32Array, im: Float32Array, inverse: boolean): void {
  const n = re.length;

  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
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

  if (inverse) {
    for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
}

// ─── Harmonic Analysis ──────────────────────────────────────────────────────

function analyzeCarrier(
  samples: Float32Array,
  sampleRate: number,
  f0Hz: number,
): { harmonics: number[]; noiseBins: number[]; envelopeBins: number[]; H: number } {

  const halfFFT = FFT_SIZE / 2 + 1;
  const nyquist = sampleRate / 2;
  const maxFreq = nyquist * NYQUIST_MARGIN;
  const H = Math.floor(maxFreq / f0Hz);  // max harmonic index
  const binHz = sampleRate / FFT_SIZE;    // Hz per FFT bin

  // Hann window
  const win = new Float32Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i++) {
    win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / FFT_SIZE));
  }

  // Number of analysis frames
  const numFrames = Math.max(1, Math.floor((samples.length - FFT_SIZE) / HOP_SIZE) + 1);

  // Per-frame storage
  const harmonicMags: number[][] = [];  // [frame][k] for k=0..H-1
  const frameMags: Float32Array[] = [];  // full magnitude spectra per frame

  for (let f = 0; f < numFrames; f++) {
    const offset = f * HOP_SIZE;
    const re = new Float32Array(FFT_SIZE);
    const im = new Float32Array(FFT_SIZE);

    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = (offset + i < samples.length) ? samples[offset + i] * win[i] : 0;
    }
    fft(re, im, false);

    // Full magnitude spectrum (for noise estimation later)
    const mag = new Float32Array(halfFFT);
    for (let k = 0; k < halfFFT; k++) {
      mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    }
    frameMags.push(mag);

    // Track harmonic magnitudes
    // For each harmonic k, find peak magnitude within ±2 bins of expected frequency
    const frameH: number[] = [];
    for (let k = 1; k <= H; k++) {
      const expectedBin = (k * f0Hz) / binHz;
      const searchLo = Math.max(0, Math.floor(expectedBin) - 2);
      const searchHi = Math.min(halfFFT - 1, Math.ceil(expectedBin) + 2);

      let peakMag = 0;
      for (let b = searchLo; b <= searchHi; b++) {
        if (mag[b] > peakMag) peakMag = mag[b];
      }
      frameH.push(peakMag);
    }
    harmonicMags.push(frameH);
  }

  // ── Frozen harmonic table: median across frames ──
  const harmonics: number[] = [];
  for (let k = 0; k < H; k++) {
    const vals = harmonicMags.map(h => h[k]).sort((a, b) => a - b);
    const med = vals.length % 2 === 1
      ? vals[Math.floor(vals.length / 2)]
      : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
    harmonics.push(med);
  }

  // ── Noise spectrum: residual after removing harmonics ──
  // For each frame, mark harmonic bins and collect non-harmonic magnitudes
  const harmonicBandwidth = Math.max(2, Math.ceil(f0Hz / binHz * 0.4));  // ±40% of F0 spacing

  const noiseMags: Float32Array[] = [];
  for (let f = 0; f < numFrames; f++) {
    const noise = new Float32Array(halfFFT);
    const isHarmonic = new Uint8Array(halfFFT);

    // Mark harmonic bins
    for (let k = 1; k <= H; k++) {
      const centerBin = Math.round((k * f0Hz) / binHz);
      for (let b = centerBin - harmonicBandwidth; b <= centerBin + harmonicBandwidth; b++) {
        if (b >= 0 && b < halfFFT) isHarmonic[b] = 1;
      }
    }

    // Non-harmonic bins → noise
    for (let b = 0; b < halfFFT; b++) {
      noise[b] = isHarmonic[b] ? 0 : frameMags[f][b];
    }
    noiseMags.push(noise);
  }

  // Median noise per bin across frames
  const noiseRaw = new Float32Array(halfFFT);
  for (let b = 0; b < halfFFT; b++) {
    const vals = noiseMags.map(n => n[b]).filter(v => v > 0).sort((a, b2) => a - b2);
    if (vals.length > 0) {
      noiseRaw[b] = vals.length % 2 === 1
        ? vals[Math.floor(vals.length / 2)]
        : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
    }
  }

  // Smooth noise spectrum (moving average, 15 bins)
  const smoothRadius = 7;
  const noiseBins: number[] = [];
  for (let b = 0; b < halfFFT; b++) {
    let sum = 0, count = 0;
    for (let j = b - smoothRadius; j <= b + smoothRadius; j++) {
      if (j >= 0 && j < halfFFT) { sum += noiseRaw[j]; count++; }
    }
    noiseBins.push(sum / count);
  }

  // ── Spectral envelope: cepstral liftering ──
  const periodSamples = sampleRate / f0Hz;
  const lifterOrder = Math.max(4, Math.min(80, Math.floor(periodSamples * 0.4)));

  const envFrames: Float32Array[] = [];
  for (let f = 0; f < numFrames; f++) {
    const fullLogMag = new Float32Array(FFT_SIZE);
    for (let k = 0; k < halfFFT; k++) {
      fullLogMag[k] = Math.log(Math.max(frameMags[f][k], 1e-10));
    }
    for (let k = 1; k < FFT_SIZE / 2; k++) {
      fullLogMag[FFT_SIZE - k] = fullLogMag[k];
    }

    const cepRe = Float32Array.from(fullLogMag);
    const cepIm = new Float32Array(FFT_SIZE);
    fft(cepRe, cepIm, true);  // → cepstrum

    // Lifter: keep low quefrency only
    for (let q = lifterOrder + 1; q < FFT_SIZE - lifterOrder; q++) {
      cepRe[q] = 0; cepIm[q] = 0;
    }

    fft(cepRe, cepIm, false);  // → smoothed log envelope

    const env = new Float32Array(halfFFT);
    for (let k = 0; k < halfFFT; k++) env[k] = cepRe[k];
    envFrames.push(env);
  }

  // Median envelope across frames
  const medEnv = new Float32Array(halfFFT);
  for (let k = 0; k < halfFFT; k++) {
    const vals = envFrames.map(e => e[k]).sort((a, b) => a - b);
    medEnv[k] = vals.length % 2 === 1
      ? vals[Math.floor(vals.length / 2)]
      : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
  }

  // Convert from log to linear gain, normalize to avg=1
  const envLinear = new Float32Array(halfFFT);
  let envSum = 0;
  for (let k = 0; k < halfFFT; k++) {
    envLinear[k] = Math.exp(medEnv[k]);
    envSum += envLinear[k];
  }
  const envAvg = envSum / halfFFT;
  const envelopeBins: number[] = [];
  for (let k = 0; k < halfFFT; k++) {
    envelopeBins.push(envAvg > 0 ? envLinear[k] / envAvg : 1);
  }

  return { harmonics, noiseBins, envelopeBins, H };
}

// ─── Main ───────────────────────────────────────────────────────────────────

mkdirSync(OUTPUT_DIR, { recursive: true });

console.log("SMS-lite Harmonic Analyzer");
console.log(`FFT: ${FFT_SIZE}-pt, hop: ${HOP_SIZE}, Nyquist margin: ${NYQUIST_MARGIN}`);
console.log(`Raw carriers: ${RAW_CARRIERS.length}`);
console.log();

for (const raw of RAW_CARRIERS) {
  const { samples, sampleRate } = readWav(join(RAW_DIR, raw.file));
  const stable = extractStableRegion(samples, sampleRate);
  const f0Hz = 440 * Math.pow(2, (raw.midi - 69) / 12);
  const sigma = measureAmpSigma(stable, sampleRate, f0Hz);

  console.log(`Analyzing ${raw.voice.padEnd(12)} (MIDI ${raw.midi}, F0=${f0Hz.toFixed(1)}Hz, σ=${sigma.toFixed(1)}dB):`);

  const { harmonics, noiseBins, envelopeBins, H } = analyzeCarrier(stable, sampleRate, f0Hz);

  // Spectral tilt: measure dB/oct slope of harmonics
  const h1dB = 20 * Math.log10(Math.max(harmonics[0], 1e-10));
  const hLastdB = 20 * Math.log10(Math.max(harmonics[H - 1], 1e-10));
  const octaves = Math.log2(H);
  const tiltDbPerOct = octaves > 0 ? (hLastdB - h1dB) / octaves : 0;

  // Noise floor level relative to harmonic peak
  const peakH = Math.max(...harmonics);
  const avgNoise = noiseBins.reduce((a, b) => a + b, 0) / noiseBins.length;
  const snrDb = 20 * Math.log10(peakH / Math.max(avgNoise, 1e-10));

  console.log(`  ${H} harmonics, tilt=${tiltDbPerOct.toFixed(1)} dB/oct, SNR=${snrDb.toFixed(1)}dB`);

  const params: VoiceParams = {
    name: raw.voice,
    sampleRate,
    rootMidi: raw.midi,
    f0Hz,
    H,
    harmonics,
    fftSize: FFT_SIZE,
    noiseBins,
    envelopeBins,
    ampSigmaDb: sigma,
  };

  const outFile = join(OUTPUT_DIR, `${raw.voice}.json`);
  writeFileSync(outFile, JSON.stringify(params, null, 2));
  console.log(`  → ${outFile}`);
  console.log();
}

console.log("Done! Harmonic parameters saved.");
