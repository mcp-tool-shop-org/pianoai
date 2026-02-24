// ─── ai-jam-sessions: Vocal Carrier Sample Management ───────────────────────
//
// Loads and indexes the pre-rendered vocal carrier WAVs.
// Each carrier is a sustained vowel tone at a known pitch.
// The vocal engine picks the nearest carrier and playbackRate-shifts it.
//
// Carrier layout:
//   samples/vocal/carrier-c2.wav   (MIDI 36)
//   samples/vocal/carrier-fs2.wav  (MIDI 42)
//   samples/vocal/carrier-c3.wav   (MIDI 48)
//   ...every 6 semitones up to C7 (MIDI 96)
//
// Usage:
//   const bank = loadCarrierBank(ctx, "samples/vocal");
//   const { carrier, rate } = pickCarrier(bank, 64);  // target E4
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VocalCarrier {
  /** MIDI note this carrier was recorded at. */
  referenceMidi: number;
  /** Loaded AudioBuffer (24kHz mono — Web Audio auto-resamples to context rate). */
  buffer: any; // AudioBuffer from node-web-audio-api
  /** Filename for debugging. */
  filename: string;
}

export interface CarrierBank {
  /** Sorted array of carriers (ascending by MIDI note). */
  carriers: VocalCarrier[];
}

// ─── Carrier Filename → MIDI Note Mapping ───────────────────────────────────

// Note name offsets from C within an octave
const NOTE_OFFSETS: Record<string, number> = {
  c: 0, cs: 1, ds: 3, d: 2, es: 3, e: 4, f: 5,
  fs: 6, gs: 8, g: 7, as: 10, a: 9, bs: 11, b: 11,
};

/**
 * Extract MIDI note from a carrier filename like "carrier-c4.wav" → 60
 * or "carrier-ds3.wav" → 51. Supports naturals and sharps (s = sharp).
 */
function filenameToMidi(filename: string): number | null {
  const match = filename.match(/^carrier-([a-g]s?)(\d)\.wav$/i);
  if (!match) return null;
  const noteName = match[1].toLowerCase();
  const octave = parseInt(match[2], 10);
  const offset = NOTE_OFFSETS[noteName];
  if (offset === undefined) return null;
  return (octave + 1) * 12 + offset;
}

// ─── WAV Parsing (matches sample-engine.ts parseWavToAudioBuffer) ───────────

/**
 * Parse a WAV file into an AudioBuffer.
 * Handles 16-bit and 24-bit PCM, mono or stereo.
 */
function parseWavToAudioBuffer(ctx: any, filePath: string): any {
  const fileData = readFileSync(filePath);
  const view = new DataView(fileData.buffer, fileData.byteOffset, fileData.byteLength);

  // Find fmt and data chunks
  let offset = 12;
  let fmtOffset = -1;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset < view.byteLength - 8) {
    const chunkId =
      String.fromCharCode(view.getUint8(offset)) +
      String.fromCharCode(view.getUint8(offset + 1)) +
      String.fromCharCode(view.getUint8(offset + 2)) +
      String.fromCharCode(view.getUint8(offset + 3));
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === "fmt ") fmtOffset = offset + 8;
    else if (chunkId === "data") {
      dataOffset = offset + 8;
      dataSize = chunkSize;
    }

    if (fmtOffset >= 0 && dataOffset >= 0) break;
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (fmtOffset < 0) throw new Error(`No 'fmt ' chunk in ${filePath}`);
  if (dataOffset < 0) throw new Error(`No 'data' chunk in ${filePath}`);

  let audioFormat = view.getUint16(fmtOffset, true);
  const numChannels = view.getUint16(fmtOffset + 2, true);
  const sampleRate = view.getUint32(fmtOffset + 4, true);
  let bitsPerSample = view.getUint16(fmtOffset + 14, true);

  // Handle WAVE_FORMAT_EXTENSIBLE
  if (audioFormat === 0xFFFE) {
    const validBits = view.getUint16(fmtOffset + 18, true);
    if (validBits > 0) bitsPerSample = validBits;
    audioFormat = view.getUint16(fmtOffset + 24, true);
  }

  if (audioFormat !== 1 && audioFormat !== 3) {
    throw new Error(`Unsupported WAV format ${audioFormat} in ${filePath}`);
  }
  const isFloat = audioFormat === 3;

  const bytesPerSample = bitsPerSample / 8;
  const numFrames = Math.floor(dataSize / (numChannels * bytesPerSample));

  const audioBuffer = ctx.createBuffer(numChannels, numFrames, sampleRate);

  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = new Float32Array(numFrames);
    for (let i = 0; i < numFrames; i++) {
      const sampleOffset = dataOffset + (i * numChannels + ch) * bytesPerSample;
      let sample: number;

      if (isFloat && bitsPerSample === 32) {
        sample = view.getFloat32(sampleOffset, true);
      } else if (bitsPerSample === 24) {
        const b0 = view.getUint8(sampleOffset);
        const b1 = view.getUint8(sampleOffset + 1);
        const b2 = view.getUint8(sampleOffset + 2);
        const raw = b0 | (b1 << 8) | (b2 << 16);
        sample = (raw > 0x7FFFFF ? raw - 0x1000000 : raw) / 8388608;
      } else if (bitsPerSample === 16) {
        sample = view.getInt16(sampleOffset, true) / 32768;
      } else {
        throw new Error(`Unsupported bit depth ${bitsPerSample} in ${filePath}`);
      }

      channelData[i] = sample;
    }
    audioBuffer.copyToChannel(channelData, ch);
  }

  return audioBuffer;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Load all carrier WAV files from a directory into a CarrierBank.
 * Files must be named "carrier-{note}.wav" (e.g., carrier-c4.wav).
 */
export function loadCarrierBank(ctx: any, carrierDir: string): CarrierBank {
  const files = readdirSync(carrierDir).filter((f) => f.startsWith("carrier-") && f.endsWith(".wav"));

  if (files.length === 0) {
    throw new Error(`No carrier WAV files found in ${carrierDir}`);
  }

  const carriers: VocalCarrier[] = [];

  for (const filename of files) {
    const midi = filenameToMidi(filename);
    if (midi === null) {
      console.error(`  SKIP ${filename}: can't determine MIDI note`);
      continue;
    }

    const filePath = join(carrierDir, filename);
    const buffer = parseWavToAudioBuffer(ctx, filePath);

    carriers.push({ referenceMidi: midi, buffer, filename });
  }

  // Sort ascending by MIDI note
  carriers.sort((a, b) => a.referenceMidi - b.referenceMidi);

  console.error(`Loaded ${carriers.length} vocal carriers (${carriers[0]?.filename} – ${carriers[carriers.length - 1]?.filename})`);

  return { carriers };
}

/**
 * Find the nearest carrier for a target MIDI note and compute the playback rate.
 * Returns null if bank is empty.
 */
export function pickCarrier(
  bank: CarrierBank,
  targetMidi: number,
): { carrier: VocalCarrier; rate: number } | null {
  const { carriers } = bank;
  if (carriers.length === 0) return null;

  // Binary search for nearest
  let lo = 0;
  let hi = carriers.length - 1;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (carriers[mid].referenceMidi < targetMidi) lo = mid + 1;
    else hi = mid;
  }

  // lo is the first carrier >= targetMidi. Check lo and lo-1 for nearest.
  let best = lo;
  if (lo > 0) {
    const distLo = Math.abs(carriers[lo].referenceMidi - targetMidi);
    const distPrev = Math.abs(carriers[lo - 1].referenceMidi - targetMidi);
    if (distPrev < distLo) best = lo - 1;
  }

  const carrier = carriers[best];
  const semitoneDiff = targetMidi - carrier.referenceMidi;
  const rate = Math.pow(2, semitoneDiff / 12);

  return { carrier, rate };
}

/**
 * Get the default carrier directory path (relative to this module's package).
 */
export function defaultCarrierDir(): string {
  // From dist/vocal-carriers.js → ../samples/vocal/
  const thisDir = dirname(fileURLToPath(import.meta.url));
  return join(thisDir, "..", "samples", "vocal");
}
