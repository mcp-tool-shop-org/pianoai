// Route B — offline singing-voice render.
//
// The DSP path is the same score-locked singer as live play (MIDI + lyrics
// are a hard constraint). The DiffSinger path is score-conditioned neural
// SVS; it is not wired until a commercial-safe checkpoint is pinned locally.
// ACE-Step / DiffRhythm / YuE do not belong here — they cannot honor MIDI
// (see vocology-knowledge wave 1, C1).

import { writeFileSync } from "node:fs";
import { renderScoreLockedPcm } from "./score-singer.js";
import type { BuiltVocalScore } from "./score-locked.js";

export type SvsBackend = "dsp" | "diffsinger";

export interface OfflineSvsOptions {
  backend?: SvsBackend;
  outPath: string;
  preset?: string;
}

function floatTo16BitPcm(pcm: Float32Array): Buffer {
  const buf = Buffer.alloc(pcm.length * 2);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    buf.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, i * 2);
  }
  return buf;
}

function writeMonoWav(path: string, pcm: Float32Array, sampleRate: number): void {
  const data = floatTo16BitPcm(pcm);
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2;
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([header, data]));
}

/**
 * Render a score-locked vocal to WAV.
 *
 * `dsp` — additive vocal-synth-engine (always available if presets are installed).
 * `diffsinger` — refuses until DIFFSINGER_ROOT points at a licensed checkpoint.
 */
export async function renderOfflineSvs(
  score: BuiltVocalScore,
  options: OfflineSvsOptions,
): Promise<{ backend: SvsBackend; outPath: string; sampleRate: number; durationSec: number }> {
  const backend = options.backend ?? "dsp";
  if (backend === "diffsinger") {
    const root = process.env.DIFFSINGER_ROOT;
    if (!root) {
      throw new Error(
        "DiffSinger backend is not installed. Set DIFFSINGER_ROOT to a local OpenVPI/DiffSinger checkout with commercial-safe weights (MIT/Apache), or use --svs-backend dsp.",
      );
    }
    throw new Error(
      `DiffSinger checkout found at DIFFSINGER_ROOT but the jam-sessions pin is not wired yet. Use --svs-backend dsp, or see vocology-knowledge wave 1 finding 24.`,
    );
  }

  const { pcm, sampleRate } = await renderScoreLockedPcm(score, { preset: options.preset });
  writeMonoWav(options.outPath, pcm, sampleRate);
  return {
    backend: "dsp",
    outPath: options.outPath,
    sampleRate,
    durationSec: pcm.length / sampleRate,
  };
}
