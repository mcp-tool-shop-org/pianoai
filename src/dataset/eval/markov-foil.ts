// ─── E2v2 Slice 1.2 — Generative foil control ────────────────────────────────
//
// The E2v1 control was shuffled-bars of the GOLD continuation, which kept every
// within-bar onset — so it inherited gold's exact performance micro-timing and
// out-scored honest re-compositions on rubato pieces (docs/maker-arc-e2-gate-
// report.md §finding-2). This module is the control repair.
//
// The field-standard "wrong continuation" foil is a GENERATIVE null, not a
// permutation of the answer (design §6.2.2):
//
//   F24 Janssen et al. 2019 (MIREX Patterns for Prediction) — foils are built
//       with an order-1 Markov model over the texture; copy-forward is the other
//       standard comparator.
//   F27 Sturm 2016 — a valid control differs from gold ONLY on the claimed
//       construct (musical coherence), never on task-irrelevant surface. A foil
//       sampled from the PROMPT's texture cannot inherit GOLD's micro-timing.
//   F28 Theiler et al. 1992 — the statistics a control PRESERVES define the null
//       actually tested; the Markov foil preserves the prompt's local texture,
//       so it tests "did the model continue coherently," not "did it clone this
//       performance."
//   F29 Laban et al. 2021 — shuffle detectability collapses on internally-
//       identical blocks; a sampled foil stays discriminative on repetitive
//       textures where bar-shuffle went to zero.
//
// The Markov foil is built from the PROMPT phrase (blind to gold), seeded per
// pair, fully deterministic. Copy-forward joins as the second standard
// comparator: a generator must also beat "just repeat the prompt's last bars."
//
// Deterministic; no LLM calls; no HTTP.
// ─────────────────────────────────────────────────────────────────────────────

import type { TimedEvent } from "../schema.js";
import { notComputable, type NotComputable } from "./phrase-continuation.js";
import { meterAwareGrid, DEFAULT_SCORE_SUBDIVISIONS } from "./score-time-gold.js";

// ─── Deterministic RNG (seeded LCG — no external RNG, replayable) ─────────────

/**
 * FNV-1a 32-bit hash of a string → an unsigned seed. Used to derive a
 * per-pair seed from the pair id, so the foil is replayable and pair-specific
 * without any RNG state crossing pairs.
 */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A seeded LCG (Numerical Recipes constants) yielding uint32s. */
class Lcg {
  private s: number;
  constructor(seed: number) {
    this.s = (seed >>> 0) || 1;
  }
  next(): number {
    // (a·s + c) mod 2^32
    this.s = (Math.imul(1664525, this.s) + 1013904223) >>> 0;
    return this.s;
  }
  pick<T>(arr: T[]): T {
    return arr[this.next() % arr.length];
  }
}

// ─── State extraction ─────────────────────────────────────────────────────────

interface FoilState {
  pitch: number;
  /** IOI (gap BEFORE this note) as an integer count of score-grid slots. */
  ioiClass: number;
}

const stateKey = (st: FoilState) => `${st.pitch}:${st.ioiClass}`;

export interface FoilOptions {
  /** Score-grid resolution for IOI quantization (slots per beat). Default 12. */
  scoreSubdivisionsPerBeat?: number;
  /** Cap on emitted onsets, as a multiple of the prompt onset count. Default 4. */
  densityCapMultiple?: number;
}

/**
 * Extract the ordered state sequence (pitch, quantized-IOI class) from a phrase.
 * Simultaneous notes (chords) have IOI 0. Time is measured in beats across the
 * phrase (measure-relative beats folded to a global beat axis).
 */
function extractStates(
  events: TimedEvent[],
  beatsPerMeasure: number,
  scoreSubdivisionsPerBeat: number,
): FoilState[] {
  if (events.length === 0) return [];
  const startMeasure = Math.min(...events.map((e) => e.measure));
  const withGlobal = events
    .map((e) => ({ globalBeat: (e.measure - startMeasure) * beatsPerMeasure + e.beat, pitch: e.note }))
    .sort((a, b) => a.globalBeat - b.globalBeat || a.pitch - b.pitch);

  const states: FoilState[] = [];
  let prevBeat = withGlobal[0].globalBeat;
  for (let i = 0; i < withGlobal.length; i++) {
    const ioiBeats = i === 0 ? 0 : withGlobal[i].globalBeat - prevBeat;
    const ioiClass = Math.max(0, Math.round(ioiBeats * scoreSubdivisionsPerBeat));
    states.push({ pitch: withGlobal[i].pitch, ioiClass });
    prevBeat = withGlobal[i].globalBeat;
  }
  return states;
}

// ─── The order-1 Markov foil ──────────────────────────────────────────────────

function mkFoilEvent(measure: number, beat: number, note: number): TimedEvent {
  return {
    t_seconds: 0,
    t_ticks: 0,
    dur_seconds: 0.25,
    dur_ticks: 120,
    note,
    name: `MIDI${note}`,
    velocity: 64,
    channel: 0,
    hand: "right",
    measure,
    beat,
  };
}

export interface MarkovFoilInput {
  promptEvents: TimedEvent[];
  targetStartMeasure: number;
  numTargetBars: number;
  timeSignature: string;
  /** Per-pair seed (derive via hashSeed(pairId) at the call site). */
  seed: number;
}

/**
 * Build an order-1 Markov foil over the prompt's (pitch, IOI-class) texture,
 * emitting TimedEvents across the target window at prompt-matched note density.
 *
 * Fully deterministic given the seed. Returns not_computable when the prompt is
 * too thin to train a chain (fewer than 2 states) or has no positive IOI (a
 * single simultaneous cluster — no texture to sample).
 */
export function buildMarkovFoil(input: MarkovFoilInput, opts: FoilOptions = {}): TimedEvent[] | NotComputable {
  const grid = meterAwareGrid(input.timeSignature);
  if ("not_computable" in grid) return grid;
  const beatsPerMeasure = grid.beatsPerMeasure;
  const scoreSub = opts.scoreSubdivisionsPerBeat ?? DEFAULT_SCORE_SUBDIVISIONS;
  const densityCapMultiple = opts.densityCapMultiple ?? 4;

  const states = extractStates(input.promptEvents, beatsPerMeasure, scoreSub);
  if (states.length < 2) {
    return notComputable(`prompt too thin for a Markov foil (${states.length} state(s), need ≥2)`);
  }
  if (states.every((s) => s.ioiClass === 0)) {
    return notComputable("prompt has no positive inter-onset interval — no texture to sample");
  }

  // Order-1 transition table + start distribution.
  const transitions = new Map<string, FoilState[]>();
  for (let i = 0; i < states.length - 1; i++) {
    const k = stateKey(states[i]);
    const arr = transitions.get(k) ?? [];
    arr.push(states[i + 1]);
    transitions.set(k, arr);
  }
  const starts = states.slice(); // any observed state is a valid restart point

  const rng = new Lcg(input.seed);
  const windowBeats = input.numTargetBars * beatsPerMeasure;
  const promptOnsets = input.promptEvents.length;
  const hardCap = Math.max(4, Math.ceil(promptOnsets * densityCapMultiple));

  const out: TimedEvent[] = [];
  let current = rng.pick(starts);
  let globalBeat = 0; // 0-indexed from the target window start

  // First note anchors the window start (IOI of the start state is ignored).
  pushIfInWindow(out, globalBeat, current.pitch, input.targetStartMeasure, beatsPerMeasure, windowBeats);

  let guard = 0;
  while (out.length < hardCap) {
    guard++;
    if (guard > hardCap * 8) break; // absolute backstop against zero-IOI stalls
    const succ = transitions.get(stateKey(current));
    const next = succ && succ.length > 0 ? rng.pick(succ) : rng.pick(starts);
    const gap = next.ioiClass / scoreSub;
    globalBeat += gap;
    if (globalBeat >= windowBeats) break;
    // A run of zero-IOI states could stall; nudge by one slot so the foil
    // advances (keeps density finite, stays deterministic).
    if (gap === 0) globalBeat += 1 / scoreSub;
    pushIfInWindow(out, globalBeat, next.pitch, input.targetStartMeasure, beatsPerMeasure, windowBeats);
    current = next;
  }

  if (out.length === 0) return notComputable("Markov foil produced no in-window onsets");
  return out;
}

function pushIfInWindow(
  out: TimedEvent[],
  globalBeat: number,
  pitch: number,
  targetStartMeasure: number,
  beatsPerMeasure: number,
  windowBeats: number,
): void {
  if (globalBeat < 0 || globalBeat >= windowBeats) return;
  const barOffset = Math.floor(globalBeat / beatsPerMeasure);
  const beat = globalBeat - barOffset * beatsPerMeasure;
  out.push(mkFoilEvent(targetStartMeasure + barOffset, beat, pitch));
}

// ─── The copy-forward comparator ──────────────────────────────────────────────

export interface CopyForwardInput {
  promptEvents: TimedEvent[];
  targetStartMeasure: number;
  numTargetBars: number;
  timeSignature: string;
}

/**
 * Copy-forward foil: take the prompt's final `numTargetBars` bars and re-emit
 * them into the target window (F24's second standard comparator — "just repeat
 * the last bars"). If the prompt has fewer than numTargetBars, its bars are
 * tiled to fill the window. Beats within each bar are preserved.
 */
export function buildCopyForwardFoil(input: CopyForwardInput): TimedEvent[] | NotComputable {
  const grid = meterAwareGrid(input.timeSignature);
  if ("not_computable" in grid) return grid;
  if (input.promptEvents.length === 0) return notComputable("empty prompt — nothing to copy forward");

  const promptMeasures = [...new Set(input.promptEvents.map((e) => e.measure))].sort((a, b) => a - b);
  const nPrompt = promptMeasures.length;
  // The source bars: the LAST numTargetBars of the prompt, END-ALIGNED (the last
  // target bar = the last prompt bar), tiling backwards if the prompt is shorter.
  const sourceBars: number[] = [];
  for (let i = 0; i < input.numTargetBars; i++) {
    const fromEnd = input.numTargetBars - 1 - i; // 0 = last target bar
    const srcIdx = (((nPrompt - 1 - fromEnd) % nPrompt) + nPrompt) % nPrompt;
    sourceBars[i] = promptMeasures[srcIdx];
  }

  const byMeasure = new Map<number, TimedEvent[]>();
  for (const e of input.promptEvents) {
    const arr = byMeasure.get(e.measure) ?? [];
    arr.push(e);
    byMeasure.set(e.measure, arr);
  }

  const out: TimedEvent[] = [];
  for (let i = 0; i < input.numTargetBars; i++) {
    const srcMeasure = sourceBars[i];
    const targetMeasure = input.targetStartMeasure + i;
    for (const e of byMeasure.get(srcMeasure) ?? []) {
      out.push(mkFoilEvent(targetMeasure, e.beat, e.note));
    }
  }

  if (out.length === 0) return notComputable("copy-forward produced no onsets");
  return out;
}
