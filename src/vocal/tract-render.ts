// Score-locked singing renderer: Pink Trombone (LF glottis + 1D waveguide).
//
// vocal-synth-engine stays the score/G2P layer. It is not this renderer —
// its additive Kokoro tables are a vowel *instrument* and are what sounded
// like a metallic shriek. This module is the voice: source-filter, one
// tract, phoneme timeline drives tongue shape.

import { Synthesizer } from "../vendor/pink-trombone.js";
import type { ScoreNote, ScorePhoneme } from "./types.js";
import type { BuiltVocalScore } from "./score-locked.js";
import { scoreDurationSec } from "./score-locked.js";

export interface TractVowelShape {
  tongueIndex: number;
  tongueDiameter: number;
  tenseness: number;
}

/** ARPAbet → Pink Trombone tongue. Index 12 = back /ɑ/, 30 = front /i/. */
export const TRACT_VOWELS: Record<string, TractVowelShape> = {
  AA: { tongueIndex: 12, tongueDiameter: 3.0, tenseness: 0.6 },
  AE: { tongueIndex: 18, tongueDiameter: 2.8, tenseness: 0.55 },
  AH: { tongueIndex: 16, tongueDiameter: 2.6, tenseness: 0.55 },
  AO: { tongueIndex: 12, tongueDiameter: 2.7, tenseness: 0.6 },
  AW: { tongueIndex: 13, tongueDiameter: 2.8, tenseness: 0.55 },
  AX: { tongueIndex: 20, tongueDiameter: 2.5, tenseness: 0.45 },
  AY: { tongueIndex: 16, tongueDiameter: 2.7, tenseness: 0.55 },
  EH: { tongueIndex: 22, tongueDiameter: 2.4, tenseness: 0.55 },
  ER: { tongueIndex: 16, tongueDiameter: 2.2, tenseness: 0.5 },
  EY: { tongueIndex: 24, tongueDiameter: 2.2, tenseness: 0.5 },
  IH: { tongueIndex: 26, tongueDiameter: 2.0, tenseness: 0.5 },
  IY: { tongueIndex: 30, tongueDiameter: 1.7, tenseness: 0.5 },
  OW: { tongueIndex: 13, tongueDiameter: 2.2, tenseness: 0.55 },
  OY: { tongueIndex: 14, tongueDiameter: 2.3, tenseness: 0.55 },
  UH: { tongueIndex: 14, tongueDiameter: 2.0, tenseness: 0.55 },
  UW: { tongueIndex: 12, tongueDiameter: 1.8, tenseness: 0.55 },
};

const DEFAULT_VOWEL: TractVowelShape = TRACT_VOWELS.AH;

const NASALS = new Set(["M", "N", "NG"]);
const STOPS = new Set(["P", "T", "K", "B", "D", "G"]);

function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function phonemeAt(events: ScorePhoneme[], t: number): ScorePhoneme | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (t >= e.tSec && t < e.tSec + e.durSec) return e;
  }
  return null;
}

function noteAt(notes: ScoreNote[], t: number): ScoreNote | null {
  for (const n of notes) {
    if (t >= n.startSec && t < n.startSec + n.durationSec) return n;
  }
  return null;
}

export interface TractRenderOptions {
  sampleRate?: number;
  tractLength?: number;
}

/**
 * Pink Trombone only interpolates tract.diameter toward targetDiameter.
 * Setting tongueIndex/tongueDiameter does nothing until we copy
 * getRestDiameter into targetDiameter (shapeMainTract is private).
 */
function applyTongueTargets(synth: InstanceType<typeof Synthesizer>): void {
  const shaper = synth.tractShaper;
  const n = synth.tract.n;
  for (let i = 0; i < n; i++) {
    shaper.targetDiameter[i] = shaper.getRestDiameter(i);
  }
}

function constrictForConsonant(synth: InstanceType<typeof Synthesizer>, phoneme: string): void {
  const shaper = synth.tractShaper;
  const tract = synth.tract;
  applyTongueTargets(synth);
  // Narrow a short region: lips for P/B/F/V, blade for T/D/S, velar for K/G.
  let at = tract.lipStart - 1;
  if (STOPS.has(phoneme) && (phoneme === "K" || phoneme === "G")) at = tract.bladeStart;
  else if (phoneme === "T" || phoneme === "D" || phoneme === "S" || phoneme === "Z") at = tract.tipStart;
  const closed = STOPS.has(phoneme) ? 0.05 : 0.35;
  for (let i = Math.max(0, at - 1); i <= Math.min(tract.n - 1, at + 1); i++) {
    shaper.targetDiameter[i] = Math.min(shaper.targetDiameter[i], closed);
  }
}

/**
 * Render a score-locked lyric line through Pink Trombone.
 * Deterministic, no Web Audio — mix the PCM onto the piano graph later.
 */
export function renderTractScore(
  score: BuiltVocalScore,
  options: TractRenderOptions = {},
): { pcm: Float32Array; sampleRate: number } {
  const sampleRate = options.sampleRate ?? 48000;
  const duration = scoreDurationSec(score) + 0.2;
  const total = Math.ceil(duration * sampleRate);
  const pcm = new Float32Array(total);
  const synth = new Synthesizer(sampleRate, options.tractLength ?? 38);
  synth.glottis.alwaysVoice = true;
  synth.glottis.autoWobble = false;
  synth.glottis.vibratoAmount = 0.004;
  synth.glottis.vibratoFrequency = 5.6;
  synth.glottis.targetTenseness = 0.55;
  synth.glottis.isTouched = true;
  synth.tractShaper.velumTarget = 0.01;

  const block = 256;
  const tmp = new Float32Array(block);
  let gain = 0;
  let offset = 0;

  while (offset < total) {
    const n = Math.min(block, total - offset);
    const t = offset / sampleRate;
    const note = noteAt(score.notes, t);
    const ph = phonemeAt(score.phonemes, t);

    if (note) {
      synth.glottis.targetFrequency = midiToHz(note.midi);
    }

    let targetGain = 0;
    if (note && ph) {
      if (ph.kind === "vowel") {
        const shape = TRACT_VOWELS[ph.phoneme] ?? DEFAULT_VOWEL;
        let diameter = shape.tongueDiameter;
        const f0 = midiToHz(note.midi);
        // Covering: don't let a close front vowel sit under a high F0.
        // Cover only above A4 — G4 hymn /i/ must stay distinct from /ɑ/.
        if (f0 > 440 && diameter < 2.2) diameter = 2.2;
        synth.tractShaper.tongueIndex = shape.tongueIndex;
        synth.tractShaper.tongueDiameter = diameter;
        applyTongueTargets(synth);
        synth.glottis.targetTenseness = shape.tenseness;
        synth.tractShaper.velumTarget = 0.01;
        targetGain = 0.9 * (note.velocity ?? 0.7);
      } else {
        synth.tractShaper.velumTarget = NASALS.has(ph.phoneme) ? 0.4 : 0.01;
        synth.glottis.targetTenseness = STOPS.has(ph.phoneme) ? 0.35 : 0.45;
        constrictForConsonant(synth, ph.phoneme);
        targetGain = STOPS.has(ph.phoneme) ? 0.2 : 0.5;
      }
    }

    const slice = n === block ? tmp : tmp.subarray(0, n);
    synth.synthesize(slice);
    for (let i = 0; i < n; i++) {
      gain += (targetGain - gain) * 0.002;
      pcm[offset + i] = slice[i] * gain;
    }
    offset += n;
  }

  return { pcm, sampleRate };
}
