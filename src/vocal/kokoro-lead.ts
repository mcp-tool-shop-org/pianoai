/**
 * Kokoro lead = fx-dub CAST → LOCK → PERFORM, local and Apache.
 *
 * fx-dub (`vo_graphs.py`, knowledge-base Stage 3):
 *   - CAST a voice once. Never re-roll identity.
 *   - LOCK the approved audio. The take *is* the character.
 *   - PERFORM later lines from that take (same-engine reference or splice).
 *   - ByteDance `pitch_rate` (±12 st, node-global) is the measured "voice
 *     changer" on cloud. We do the same job locally: retune a locked Kokoro
 *     take onto each MIDI note (see voice-changer.ts).
 *   - Kokoro-82M is the consent-free local VO (Apache-2.0, no cloning).
 *     It is NOT on Comfy Cloud — local only.
 *   - Cross-engine cloning (Kokoro → additive tables, Kokoro → Pink Trombone)
 *     is the failure we already heard. Do not do that.
 *
 * This module splices a locked take onto the score clock (fx-dub `splice` +
 * `place`). Mix with the piano is `mix_dialogue_anchored`.
 */

import { existsSync, readFileSync } from "node:fs";
import { retuneLockedTake } from "./voice-changer.js";
import type { BuiltVocalScore } from "./score-locked.js";
import { scoreDurationSec } from "./score-locked.js";

export const KOKORO_LOCK_ENV = "JAM_KOKORO_LOCK_WAV";

export function resolveKokoroLockWav(): string | null {
  const p = process.env[KOKORO_LOCK_ENV];
  if (p && existsSync(p)) return p;
  return null;
}

/** Minimal PCM from a 16-bit mono WAV. */
export function readMonoWav(path: string): { pcm: Float32Array; sampleRate: number } {
  const buf = readFileSync(path);
  const sr = buf.readUInt32LE(24);
  const ch = buf.readUInt16LE(22);
  const bps = buf.readUInt16LE(34);
  if (bps !== 16) {
    throw new Error(`Kokoro lock WAV must be 16-bit PCM (got ${bps})`);
  }
  const dataOff = 44;
  const frames = Math.floor((buf.length - dataOff) / 2 / ch);
  const pcm = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let s = 0;
    for (let c = 0; c < ch; c++) s += buf.readInt16LE(dataOff + (i * ch + c) * 2);
    pcm[i] = s / ch / 32768;
  }
  return { pcm, sampleRate: sr };
}

/**
 * PERFORM the locked Kokoro take onto the score: one retuned grain per note,
 * placed on the MIDI clock. Rests stay silent (fx-dub `place`).
 */
export function renderKokoroLead(
  score: BuiltVocalScore,
  lockPcm: Float32Array,
  lockRate: number,
): { pcm: Float32Array; sampleRate: number } {
  const sr = lockRate;
  const duration = scoreDurationSec(score) + 0.2;
  const total = Math.ceil(duration * sr);
  const pcm = new Float32Array(total);
  for (const note of score.notes) {
    const start = Math.max(0, Math.floor(note.startSec * sr));
    const grain = retuneLockedTake(lockPcm, sr, note.midi, note.durationSec);
    const n = Math.min(grain.length, total - start);
    for (let i = 0; i < n; i++) pcm[start + i] += grain[i];
  }
  return { pcm, sampleRate: sr };
}

export function kokoroLeadHint(): string {
  return (
    `No locked Kokoro take. fx-dub rule: CAST once, LOCK the wav, PERFORM from it. ` +
    `Set ${KOKORO_LOCK_ENV} to a 16-bit WAV of the Kokoro voice (local Apache-2.0 TTS — not Comfy Cloud). ` +
    `Do not fall back to tract/additive: those are a different person.`
  );
}
