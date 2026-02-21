#!/usr/bin/env tsx
// ─── SMS-lite Additive Synthesizer ──────────────────────────────────────────
//
// Generates perfectly stationary vocal carrier WAVs from harmonic parameters.
//
// For each anchor MIDI note:
//   1. Pick the best voice parameters (by stationarity + proximity)
//   2. Compute target F0 from anchor MIDI
//   3. For each harmonic k of target F0:
//      - frequency = k × targetF0
//      - amplitude = spectralEnvelope[freq] × spectralTilt
//      (Source/filter model: formants stay at same frequencies regardless of pitch)
//   4. Sum sinusoids with coherent phases
//   5. Add shaped noise (frequency-domain synthesis)
//   6. Buffer length = exact integer periods for seamless looping
//   7. Normalize and save as WAV
//
// The output is a set of carrier WAVs that can be used by the vocal engine.
// These carriers are inherently stationary by construction — no speech
// gestures, no formant motion, no loop artifacts. Just one harmonic series
// + one noise bed per carrier.
//
// Usage:
//   npx tsx scripts/synth-carriers.ts
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Config ─────────────────────────────────────────────────────────────────

const PARAMS_DIR = join(__dirname, "..", "samples", "vocal-params");
const OUTPUT_DIR = join(__dirname, "..", "samples", "vocal");
const TARGET_RMS_DB = -18;
const SAMPLE_RATE = 24000;
const TARGET_DURATION_SEC = 1.0;   // enough for a good loop
const NOISE_LEVEL_DB = -20;        // breath level — audible texture, not ghostly
const SPECTRAL_TILT_ALPHA = 1.0;   // 1/k^α rolloff (1.0 = natural vocal slope)
const NYQUIST_MARGIN = 0.96;

// Anchor points every 8 semitones from C2 to C7
const ANCHORS = [36, 44, 52, 60, 68, 76, 84, 92];
const NOTE_NAMES: Record<number, string> = {
  36: "c2", 44: "gs2", 52: "e3", 60: "c4",
  68: "gs4", 76: "e5", 84: "c6", 92: "gs6",
};

// ─── Voice parameter set (from analyze-carriers.ts) ─────────────────────────

interface VoiceParams {
  name: string;
  sampleRate: number;
  rootMidi: number;
  f0Hz: number;
  H: number;
  harmonics: number[];
  fftSize: number;
  noiseBins: number[];
  envelopeBins: number[];
  ampSigmaDb: number;
}

// ─── WAV writer ─────────────────────────────────────────────────────────────

function writeWav(filePath: string, samples: Float32Array, sampleRate: number): void {
  const numSamples = samples.length;
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const fileSize = 44 + dataSize;

  const buf = Buffer.alloc(fileSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(fileSize - 8, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);          // fmt chunk size
  buf.writeUInt16LE(1, 20);           // PCM
  buf.writeUInt16LE(1, 22);           // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * bytesPerSample, 28);
  buf.writeUInt16LE(bytesPerSample, 32);
  buf.writeUInt16LE(16, 34);          // 16-bit
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }

  writeFileSync(filePath, buf);
}

// ─── Load all voice parameters ──────────────────────────────────────────────

function loadAllParams(): VoiceParams[] {
  const params: VoiceParams[] = [];
  for (const f of readdirSync(PARAMS_DIR)) {
    if (!f.endsWith(".json")) continue;
    const data = JSON.parse(readFileSync(join(PARAMS_DIR, f), "utf8"));
    params.push(data);
  }
  return params;
}

// ─── Pick best voice for a target MIDI note ─────────────────────────────────
// Same stationarity-aware cost function as bake-carriers.ts

function pickBestVoice(params: VoiceParams[], targetMidi: number): VoiceParams {
  const W_SIGMA = 3.0;
  const W_SHIFT = 1.0;
  const MAX_SHIFT = 15;  // semitones

  let best = params[0];
  let bestCost = Infinity;

  for (const p of params) {
    const shift = Math.abs(targetMidi - p.rootMidi);
    if (shift > MAX_SHIFT) continue;
    const cost = p.ampSigmaDb * W_SIGMA + shift * W_SHIFT;
    if (cost < bestCost) {
      bestCost = cost;
      best = p;
    }
  }

  return best;
}

// ─── Additive synthesis ─────────────────────────────────────────────────────

function synthesizeCarrier(
  voice: VoiceParams,
  targetMidi: number,
): Float32Array {
  const targetF0 = 440 * Math.pow(2, (targetMidi - 69) / 12);
  const nyquist = SAMPLE_RATE / 2;
  const maxFreq = nyquist * NYQUIST_MARGIN;
  const maxHarmonic = Math.floor(maxFreq / targetF0);

  // Buffer length: exact integer periods for seamless looping
  const periodSamples = SAMPLE_RATE / targetF0;
  const numPeriods = Math.max(4, Math.round(TARGET_DURATION_SEC * targetF0));
  const bufferLength = Math.round(numPeriods * periodSamples);

  console.log(`    target F0=${targetF0.toFixed(1)}Hz, ${maxHarmonic} harmonics, ${numPeriods} periods, ${bufferLength} samples`);

  // ── Build harmonic amplitudes: source/filter model ──
  //
  // The key to sounding VOCAL (not piano):
  //   Source = harmonic series at k × targetF0 with spectral tilt
  //   Filter = spectral envelope from the analyzed voice (formant peaks)
  //
  // Formant peaks stay at the SAME frequencies regardless of F0.
  // This is what makes an "aah" sound like "aah" at any pitch.
  //
  // Without the formant filter, additive synthesis with zero-phase harmonics
  // produces a periodic impulse train — which sounds like an organ/piano.

  const binHz = voice.sampleRate / voice.fftSize;
  const halfFFT = voice.fftSize / 2 + 1;

  const harmonicAmps: number[] = [];
  for (let k = 1; k <= maxHarmonic; k++) {
    const freq = k * targetF0;
    const bin = freq / binHz;

    // ── Formant filter: spectral envelope at this frequency ──
    // This creates the vowel resonances (formant peaks).
    // The envelope was extracted via cepstral liftering from the original voice.
    let envGain: number;
    if (bin >= halfFFT - 1) {
      envGain = voice.envelopeBins[halfFFT - 1];
    } else {
      const lo = Math.floor(bin);
      const hi = Math.ceil(bin);
      const frac = bin - lo;
      envGain = voice.envelopeBins[lo] * (1 - frac) + voice.envelopeBins[Math.min(hi, halfFFT - 1)] * frac;
    }

    // ── Spectral tilt: natural vocal rolloff ──
    // Human voicing has a ~-12 dB/oct slope from glottal pulse shape.
    const tilt = 1 / Math.pow(k, SPECTRAL_TILT_ALPHA);

    // ── Combined amplitude: tilt × envelope ──
    // This is the classic source/filter vocal model:
    //   glottal source (tilt) × vocal tract (envelope) = voice
    const amp = tilt * envGain;
    harmonicAmps.push(amp);
  }

  // Normalize so peak amplitude = 1
  const maxAmp = Math.max(...harmonicAmps);
  if (maxAmp > 0) {
    for (let k = 0; k < harmonicAmps.length; k++) {
      harmonicAmps[k] /= maxAmp;
    }
  }

  // ── Sum sinusoids with RANDOM initial phases ──
  //
  // CRITICAL: zero-phase harmonics produce a periodic impulse train
  // (sharp peak once per period) — this sounds like a plucked string / piano.
  // Random phases spread energy across the period → smooth, continuous,
  // vocal-like waveform.
  //
  // The phases are random but FIXED for the duration of the buffer.
  // This is fine because we're looping a pre-rendered buffer, not doing
  // real-time synthesis. The randomness just prevents the impulse peak.

  const voiced = new Float32Array(bufferLength);
  const twoPi = 2 * Math.PI;

  // Generate deterministic random phases (seeded by anchor MIDI for reproducibility)
  const phases: number[] = [];
  let rngState = targetMidi * 12345 + 67890;
  for (let k = 0; k < harmonicAmps.length; k++) {
    rngState = (rngState * 1103515245 + 12345) & 0x7fffffff;
    phases.push((rngState / 0x7fffffff) * twoPi);
  }

  for (let k = 0; k < harmonicAmps.length; k++) {
    const amp = harmonicAmps[k];
    if (amp < 1e-6) continue;

    const freq = (k + 1) * targetF0;
    const phaseInc = twoPi * freq / SAMPLE_RATE;
    const phase0 = phases[k];

    for (let i = 0; i < bufferLength; i++) {
      voiced[i] += amp * Math.sin(phase0 + phaseInc * i);
    }
  }

  // ── Shaped noise (frequency-domain synthesis) ──
  //
  // Generate random-phase noise shaped by the analyzed noise spectrum.
  // This adds "breath" texture — the non-periodic component of voice.

  const noiseLevel = Math.pow(10, NOISE_LEVEL_DB / 20);
  const noise = synthesizeNoise(voice, bufferLength, noiseLevel);

  // ── Mix voiced + noise ──
  const output = new Float32Array(bufferLength);
  for (let i = 0; i < bufferLength; i++) {
    output[i] = voiced[i] + noise[i];
  }

  // RMS normalize
  let rms = 0;
  for (let i = 0; i < bufferLength; i++) rms += output[i] * output[i];
  rms = Math.sqrt(rms / bufferLength);
  const targetRms = Math.pow(10, TARGET_RMS_DB / 20);
  if (rms > 1e-10) {
    const scale = targetRms / rms;
    for (let i = 0; i < bufferLength; i++) output[i] *= scale;
  }

  // Soft limit
  const k = 1.2;
  const invTanhK = 1 / Math.tanh(k);
  for (let i = 0; i < bufferLength; i++) {
    output[i] = Math.tanh(output[i] * k) * invTanhK;
  }

  return output;
}

// ─── Noise synthesis (frequency-domain) ─────────────────────────────────────

function synthesizeNoise(voice: VoiceParams, length: number, level: number): Float32Array {
  // Use overlapping blocks for smooth noise
  const fftSize = voice.fftSize;
  const halfFFT = fftSize / 2 + 1;
  const hopSize = fftSize / 4;
  const output = new Float32Array(length);
  const winSum = new Float32Array(length);

  // Hann window
  const win = new Float32Array(fftSize);
  for (let i = 0; i < fftSize; i++) {
    win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / fftSize));
  }

  const numBlocks = Math.ceil(length / hopSize) + 3;

  for (let b = 0; b < numBlocks; b++) {
    const offset = b * hopSize;

    // Random complex spectrum shaped by noise spectrum
    const re = new Float32Array(fftSize);
    const im = new Float32Array(fftSize);

    for (let k = 0; k < halfFFT; k++) {
      const mag = (k < voice.noiseBins.length ? voice.noiseBins[k] : 0) * level;
      const phase = Math.random() * 2 * Math.PI;
      re[k] = mag * Math.cos(phase);
      im[k] = mag * Math.sin(phase);
    }
    // Mirror conjugate
    for (let k = 1; k < fftSize / 2; k++) {
      re[fftSize - k] = re[k];
      im[fftSize - k] = -im[k];
    }

    // IFFT
    fft(re, im, true);

    // Overlap-add with window
    for (let i = 0; i < fftSize; i++) {
      if (offset + i < length) {
        output[offset + i] += re[i] * win[i];
        winSum[offset + i] += win[i] * win[i];
      }
    }
  }

  // Normalize
  for (let i = 0; i < length; i++) {
    if (winSum[i] > 1e-6) output[i] /= winSum[i];
  }

  return output;
}

// ─── FFT (same as analyze-carriers) ─────────────────────────────────────────

function fft(re: Float32Array, im: Float32Array, inverse: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
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

// ─── Main ───────────────────────────────────────────────────────────────────

mkdirSync(OUTPUT_DIR, { recursive: true });

const allParams = loadAllParams();
console.log("SMS-lite Additive Synthesizer");
console.log(`Voices: ${allParams.map(p => p.name).join(", ")}`);
console.log(`Anchors: ${ANCHORS.map(m => NOTE_NAMES[m]).join(", ")}`);
console.log(`Sample rate: ${SAMPLE_RATE}Hz, duration: ${TARGET_DURATION_SEC}s`);
console.log(`Noise: ${NOISE_LEVEL_DB}dB, tilt: 1/k^${SPECTRAL_TILT_ALPHA}`);
console.log();

for (const anchor of ANCHORS) {
  const noteName = NOTE_NAMES[anchor];
  const voice = pickBestVoice(allParams, anchor);
  const shift = anchor - voice.rootMidi;

  console.log(`${noteName.padEnd(4)} (MIDI ${anchor}): voice=${voice.name}(${voice.rootMidi}), shift=${shift > 0 ? "+" : ""}${shift}st, σ=${voice.ampSigmaDb.toFixed(1)}dB`);

  const buffer = synthesizeCarrier(voice, anchor);
  const outFile = join(OUTPUT_DIR, `carrier-${noteName}.wav`);
  writeWav(outFile, buffer, SAMPLE_RATE);

  const durMs = (buffer.length / SAMPLE_RATE * 1000).toFixed(0);
  const sizeKB = (buffer.length * 2 / 1024).toFixed(0);
  console.log(`    → ${noteName}.wav: ${durMs}ms, ${sizeKB}KB`);
  console.log();
}

console.log("Done! Synthesized carriers in", OUTPUT_DIR);
