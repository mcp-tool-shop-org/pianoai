// ─── ai-jam-sessions: Incremental Audio Stream ───────────────────────────────
//
// Feed samples as they arrive; ask what is happening in the recent past.
// Pure DSP: no AudioContext, no engine files, no change to the shipped
// offline analysers. Those stay the single source of truth (v2.4.0).
//
// RING BUFFER, not a growing array. A jam session is long; an unbounded
// history is a leak with a nice name.
//
// push() is on the audio path: copy into the ring, no analysis, no
// allocation. Analysis is lazy on snapshot(). That is the honest cost of
// reusing detectOnsets + trackPitch instead of forking them.
//
// ONSET EDGE POLICY. SuperFlux's peak picker looks FORWARD (postAvg 70 ms
// by default). Near the newest sample a frame is judged against a truncated
// window, so an onset can appear and then re-evaluate. We WITHHOLD onsets
// within onsetLatencySec of tEnd. A consumer that sees a confirmed onset
// should never see it retracted.
//
// LATENCY is per-signal. Pitch is half a centred frame (~23 ms at nFft
// 2048). Onsets are max(that, postAvg) (~70 ms). Conflating them hides the
// 3× gap.
//
// SEAM for later: lastAnalysedSampleIndex. Today snapshot re-runs the
// whole window. Incremental caching can start from that index without an
// API break. yinFrame is already per-frame; onsets would need a small
// stateful novelty wrapper.
// ─────────────────────────────────────────────────────────────────────────────

import {
  detectOnsets,
  type OnsetEvent,
  type OnsetOptions,
} from "./onsets.js";
import {
  trackPitch,
  type PitchFrame,
  type PitchOptions,
} from "./pitch.js";

export const DEFAULT_HOP_LENGTH = 512;
export const DEFAULT_WINDOW_SEC = 2;
export const DEFAULT_N_FFT = 2048;
export const DEFAULT_POST_AVG_SEC = 0.07;
export const EDGE_POLICY_WITHHOLD = "withhold" as const;
export type EdgePolicy = typeof EDGE_POLICY_WITHHOLD;

export interface StreamOptions {
  sampleRate: number;
  /** Default 512 — the offline grid. */
  hopLength?: number;
  /** Rolling history retained, in seconds. Default 2. */
  windowSec?: number;
  /** Which instrument this stream belongs to. */
  label?: string;
  nFft?: number;
  /** Forward window of the onset peak picker, seconds. Default 0.07. */
  postAvgSec?: number;
}

export interface StreamSnapshot {
  label: string | null;
  sampleRate: number;
  /** Stream time of the newest sample, seconds from the first push (or last reset). */
  tEndSec: number;
  /** How many seconds of the ring are filled. */
  filledSec: number;
  /** Half a centred analysis frame. */
  pitchLatencySec: number;
  /** max(pitchLatency, postAvg). An onset at t is not confirmed until this later. */
  onsetLatencySec: number;
  /** Onsets inside onsetLatencySec of tEnd are withheld, never retracted later. */
  edgePolicy: EdgePolicy;
  latestOnsets: OnsetEvent[];
  latestPitch: PitchFrame | null;
}

export class AudioStream {
  readonly sampleRate: number;
  readonly hopLength: number;
  readonly windowSec: number;
  readonly nFft: number;
  readonly postAvgSec: number;
  readonly label: string | null;
  readonly capacity: number;
  readonly pitchLatencySec: number;
  readonly onsetLatencySec: number;

  private readonly buffer: Float64Array;
  private readonly scratch: Float64Array;
  private write = 0;
  private filled = 0;
  private totalPushed = 0;
  /**
   * Seam for per-hop caching. After a snapshot this equals totalPushed.
   * Incremental analysis would consume (lastAnalysedSampleIndex, totalPushed].
   * Today we still re-run the whole window.
   */
  private lastAnalysedSampleIndex = 0;
  private dirty = true;
  private cached: StreamSnapshot | null = null;

  constructor(options: StreamOptions) {
    const {
      sampleRate,
      hopLength = DEFAULT_HOP_LENGTH,
      windowSec = DEFAULT_WINDOW_SEC,
      nFft = DEFAULT_N_FFT,
      postAvgSec = DEFAULT_POST_AVG_SEC,
      label = null,
    } = options;
    if (!(sampleRate > 0)) {
      throw new Error(`sampleRate must be positive, got ${sampleRate}.`);
    }
    if (!Number.isInteger(hopLength) || hopLength < 1) {
      throw new Error(`hopLength must be a positive integer, got ${hopLength}.`);
    }
    if (!(windowSec > 0)) {
      throw new Error(`windowSec must be positive, got ${windowSec}.`);
    }
    if (!Number.isInteger(nFft) || nFft < 2) {
      throw new Error(`nFft must be an integer ≥ 2, got ${nFft}.`);
    }
    if (!(postAvgSec >= 0)) {
      throw new Error(`postAvgSec must be non-negative, got ${postAvgSec}.`);
    }

    this.sampleRate = sampleRate;
    this.hopLength = hopLength;
    this.windowSec = windowSec;
    this.nFft = nFft;
    this.postAvgSec = postAvgSec;
    this.label = label;
    this.capacity = Math.ceil(windowSec * sampleRate);
    this.buffer = new Float64Array(this.capacity);
    this.scratch = new Float64Array(this.capacity);
    this.pitchLatencySec = (nFft / 2) / sampleRate;
    this.onsetLatencySec = Math.max(this.pitchLatencySec, postAvgSec);
  }

  /** Bytes of the ring (fixed). For the long-run memory test. */
  get bufferBytes(): number {
    return this.buffer.byteLength;
  }

  /**
   * Copy into the ring. No analysis, no allocation.
   * Float32 is converted in this loop, not via a temporary array.
   */
  push(samples: Float32Array | Float64Array): void {
    const n = samples.length;
    const cap = this.capacity;
    const buf = this.buffer;
    let write = this.write;
    let filled = this.filled;
    let total = this.totalPushed;
    for (let i = 0; i < n; i++) {
      buf[write] = samples[i]!;
      write++;
      if (write === cap) write = 0;
      if (filled < cap) filled++;
      total++;
    }
    this.write = write;
    this.filled = filled;
    this.totalPushed = total;
    this.dirty = true;
  }

  get latestOnsets(): OnsetEvent[] {
    return this.snapshot().latestOnsets;
  }

  get latestPitch(): PitchFrame | null {
    return this.snapshot().latestPitch;
  }

  snapshot(): StreamSnapshot {
    if (!this.dirty && this.cached) return this.cached;
    const snap = this.analyse();
    this.lastAnalysedSampleIndex = this.totalPushed;
    this.cached = snap;
    this.dirty = false;
    return snap;
  }

  reset(): void {
    this.buffer.fill(0);
    this.write = 0;
    this.filled = 0;
    this.totalPushed = 0;
    this.lastAnalysedSampleIndex = 0;
    this.dirty = true;
    this.cached = null;
  }

  private copyChronological(): number {
    const n = this.filled;
    if (n === 0) return 0;
    const cap = this.capacity;
    const dest = this.scratch;
    const src = this.buffer;
    if (n < cap) {
      dest.set(src.subarray(0, n));
      return n;
    }
    const write = this.write;
    const tail = cap - write;
    dest.set(src.subarray(write, cap), 0);
    dest.set(src.subarray(0, write), tail);
    return n;
  }

  private analyse(): StreamSnapshot {
    const tEndSec = this.totalPushed / this.sampleRate;
    const filledSec = this.filled / this.sampleRate;
    const empty: StreamSnapshot = {
      label: this.label,
      sampleRate: this.sampleRate,
      tEndSec,
      filledSec,
      pitchLatencySec: this.pitchLatencySec,
      onsetLatencySec: this.onsetLatencySec,
      edgePolicy: EDGE_POLICY_WITHHOLD,
      latestOnsets: [],
      latestPitch: null,
    };
    const n = this.copyChronological();
    if (n === 0) return empty;

    const windowStartSec = (this.totalPushed - this.filled) / this.sampleRate;
    const view = this.scratch.subarray(0, n);

    const onsetOpts: OnsetOptions = {
      sampleRate: this.sampleRate,
      hopLength: this.hopLength,
      nFft: this.nFft,
      postAvg: this.postAvgSec,
    };
    const onsetResult = detectOnsets(view, onsetOpts);
    const cutoff = tEndSec - this.onsetLatencySec;
    const latestOnsets: OnsetEvent[] = [];
    for (const o of onsetResult.onsets) {
      const t = o.time + windowStartSec;
      if (t <= cutoff) latestOnsets.push({ time: t, strength: o.strength });
    }

    const pitchOpts: PitchOptions = {
      sampleRate: this.sampleRate,
      hopLength: this.hopLength,
      frameLength: this.nFft,
    };
    const track = trackPitch(view, pitchOpts);
    let latestPitch: PitchFrame | null = null;
    if (track.frames.length > 0) {
      const last = track.frames[track.frames.length - 1]!;
      if (last.f0Hz !== null) {
        latestPitch = {
          timeSec: last.timeSec + windowStartSec,
          f0Hz: last.f0Hz,
          confidence: last.confidence,
          midi: last.midi,
        };
      }
    }

    return {
      label: this.label,
      sampleRate: this.sampleRate,
      tEndSec,
      filledSec,
      pitchLatencySec: this.pitchLatencySec,
      onsetLatencySec: this.onsetLatencySec,
      edgePolicy: EDGE_POLICY_WITHHOLD,
      latestOnsets,
      latestPitch,
    };
  }
}
