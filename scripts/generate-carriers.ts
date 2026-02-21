#!/usr/bin/env tsx
// ─── Generate Vocal Carrier Samples ─────────────────────────────────────────
//
// Synthesizes sustained "aah" vowel tones at reference pitches using formant
// synthesis. Produces 24kHz mono WAV files for use by the vocal engine.
//
// Each carrier is a 4-second loopable vowel sound at a specific pitch.
// The vocal engine pitch-shifts these to reach any target MIDI note.
//
// Usage:
//   npx tsx scripts/generate-carriers.ts
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Config ─────────────────────────────────────────────────────────────────

const SAMPLE_RATE = 24000;
const DURATION_SECONDS = 4;
const NUM_SAMPLES = SAMPLE_RATE * DURATION_SECONDS;
const OUTPUT_DIR = join(__dirname, "..", "samples", "vocal");

// Reference pitches: every 6 semitones from C2 to C7
// This gives us 11 carriers, so the max playbackRate shift is ~1.41x (half octave)
const CARRIERS: Array<{ name: string; midi: number }> = [
  { name: "c2",  midi: 36 },
  { name: "fs2", midi: 42 },
  { name: "c3",  midi: 48 },
  { name: "fs3", midi: 54 },
  { name: "c4",  midi: 60 },
  { name: "fs4", midi: 66 },
  { name: "c5",  midi: 72 },
  { name: "fs5", midi: 78 },
  { name: "c6",  midi: 84 },
  { name: "fs6", midi: 90 },
  { name: "c7",  midi: 96 },
];

// ─── Formant Synthesis ──────────────────────────────────────────────────────

// "Aah" vowel formants (Hz, bandwidth, amplitude dB) — based on vocal acoustics
// F1-F5 for an open "aah" vowel
const AAH_FORMANTS = [
  { freq: 800,  bw: 80,  amp: 0 },     // F1 — low formant
  { freq: 1200, bw: 90,  amp: -4 },    // F2
  { freq: 2500, bw: 120, amp: -20 },   // F3
  { freq: 3500, bw: 140, amp: -36 },   // F4
  { freq: 4500, bw: 180, amp: -48 },   // F5
];

/** Convert MIDI note to frequency in Hz. */
function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Convert dB to linear amplitude. */
function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

/**
 * Synthesize a single vocal carrier using additive synthesis with formant shaping.
 *
 * Approach:
 * 1. Generate a glottal pulse train (sawtooth-ish) at the fundamental frequency
 * 2. Apply formant resonances to shape it into a vowel
 *
 * We use a simpler approach: additive harmonics weighted by the formant envelope.
 * Each harmonic's amplitude is determined by how close it falls to a formant peak.
 */
function synthesizeCarrier(midi: number): Float32Array {
  const f0 = midiToFreq(midi);
  const samples = new Float32Array(NUM_SAMPLES);

  // Calculate how many harmonics fit below Nyquist
  const maxHarmonic = Math.floor((SAMPLE_RATE / 2) / f0);
  const numHarmonics = Math.min(maxHarmonic, 64);

  // For each harmonic, calculate its amplitude from the formant envelope
  const harmonicAmps: number[] = [];
  for (let h = 1; h <= numHarmonics; h++) {
    const hFreq = f0 * h;
    let totalAmp = 0;

    for (const formant of AAH_FORMANTS) {
      // Resonance: Gaussian-ish peak centered on formant frequency
      const dist = (hFreq - formant.freq) / formant.bw;
      const resonance = Math.exp(-0.5 * dist * dist);
      totalAmp += resonance * dbToLinear(formant.amp);
    }

    // Natural spectral rolloff for voice (glottal source ~= -12dB/octave)
    const rolloff = 1 / (h * h);
    harmonicAmps.push(totalAmp * rolloff);
  }

  // Normalize amplitudes
  const maxAmp = Math.max(...harmonicAmps);
  if (maxAmp > 0) {
    for (let i = 0; i < harmonicAmps.length; i++) {
      harmonicAmps[i] /= maxAmp;
    }
  }

  // Synthesize: sum of sine waves at harmonic frequencies
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;
    let sample = 0;

    for (let h = 0; h < numHarmonics; h++) {
      const freq = f0 * (h + 1);
      // Small random phase offset per harmonic for natural quality
      sample += harmonicAmps[h] * Math.sin(2 * Math.PI * freq * t);
    }

    samples[i] = sample;
  }

  // Normalize to [-0.9, 0.9]
  let peak = 0;
  for (let i = 0; i < NUM_SAMPLES; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  if (peak > 0) {
    const scale = 0.9 / peak;
    for (let i = 0; i < NUM_SAMPLES; i++) {
      samples[i] *= scale;
    }
  }

  // Apply fade-in (20ms) and fade-out (20ms) to avoid clicks
  const fadeLen = Math.floor(SAMPLE_RATE * 0.02);
  for (let i = 0; i < fadeLen; i++) {
    const env = i / fadeLen;
    samples[i] *= env;
    samples[NUM_SAMPLES - 1 - i] *= env;
  }

  // Add gentle vibrato (5Hz, +-3 cents) for natural quality
  // We do this by modulating the time variable slightly
  // Actually, for a carrier that will be pitch-shifted, steady pitch is better.
  // Skip vibrato — the playback engine can add it later.

  return samples;
}

// ─── WAV Writer ─────────────────────────────────────────────────────────────

/** Write a mono Float32 buffer as a 16-bit PCM WAV file. */
function writeWav(filePath: string, samples: Float32Array, sampleRate: number): void {
  const numSamples = samples.length;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataSize = numSamples * bytesPerSample;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);        // chunk size
  buffer.writeUInt16LE(1, 20);         // PCM format
  buffer.writeUInt16LE(1, 22);         // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // byte rate
  buffer.writeUInt16LE(bytesPerSample, 32); // block align
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write samples as 16-bit signed integers
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = Math.round(clamped * 32767);
    buffer.writeInt16LE(int16, offset);
    offset += 2;
  }

  writeFileSync(filePath, buffer);
}

// ─── Main ───────────────────────────────────────────────────────────────────

mkdirSync(OUTPUT_DIR, { recursive: true });

console.log(`Generating ${CARRIERS.length} vocal carriers at ${SAMPLE_RATE}Hz...`);
console.log(`Output: ${OUTPUT_DIR}\n`);

for (const carrier of CARRIERS) {
  const freq = midiToFreq(carrier.midi).toFixed(1);
  const filename = `carrier-${carrier.name}.wav`;
  const filepath = join(OUTPUT_DIR, filename);

  process.stdout.write(`  ${filename} (MIDI ${carrier.midi}, ${freq}Hz)... `);

  const samples = synthesizeCarrier(carrier.midi);
  writeWav(filepath, samples, SAMPLE_RATE);

  const sizeKB = (samples.length * 2 / 1024).toFixed(0);
  console.log(`${sizeKB}KB`);
}

console.log(`\nDone! Generated ${CARRIERS.length} carriers.`);
