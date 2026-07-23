// ─── analyzeHarmony — the top-level engine ────────────────────────────────────
//
// Ties the pipeline together: a SongEntry → a real per-segment chord
// progression. Beat-synchronous segments are each labeled by Parncutt
// root-finding + conservative chord-ID, then adjacent same-symbol segments are
// merged into spans — which is where harmonic rhythm emerges (2–4 chords/bar
// where the harmony moves, one chord across several bars where it doesn't;
// Masada & Bunescu 2018). A per-measure convenience view (the single dominant
// chord per measure) is produced for a drop-in A/B against the crude pooled
// `inferChord`.
//
// DECOUPLED by construction: reads a SongEntry, imports nothing from src/maker
// or the jam-brief path, and writes nothing back — so wiring it into jam briefs
// (or anywhere) is a later, separate director decision, and this can never
// perturb the frozen E-R sourceChords baseline or the Gate-2 snapshot.
// ─────────────────────────────────────────────────────────────────────────────

import type { SongEntry } from "../songs/types.js";
import type { ChordSpan, HarmonicAnalysis, PerMeasureChord, Segment } from "./types.js";
import { parseMeter } from "./meter.js";
import { songEvents } from "./events.js";
import { segmentMeasure } from "./profile.js";
import { findRoot } from "./root.js";
import { identifyChord, type ChordIdOptions } from "./chord-id.js";

export interface AnalyzeOptions extends ChordIdOptions {
  /** Optional 1-based inclusive measure range [start, end] to analyze. */
  measureRange?: [number, number];
  /** Profile-compression exponent for root-finding (see DEFAULT_ROOT_ALPHA). */
  rootAlpha?: number;
}

/** A tactus segment with its resolved chord label (internal). */
interface LabeledSegment extends Segment {
  root: number;
  quality: string;
  symbol: string;
  confidence: number;
}

/** Label one segment: silent → N/C, else root-find then conservative chord-ID. */
function labelSegment(seg: Segment, opts: AnalyzeOptions): LabeledSegment {
  if (seg.totalWeight <= 0) {
    return { ...seg, root: -1, quality: "N/C", symbol: "N/C", confidence: 0 };
  }
  const { root, margin } = findRoot(seg.profile, seg.bassPc, opts.rootAlpha);
  const id = identifyChord(seg.profile, root, margin, opts);
  return { ...seg, root, quality: id.quality, symbol: id.symbol, confidence: id.confidence };
}

/** Merge adjacent, contiguous, same-symbol segments into spans. */
function mergeSpans(labeled: LabeledSegment[]): ChordSpan[] {
  const spans: ChordSpan[] = [];
  const weights: number[] = []; // parallel accumulator: total segment weight per span
  for (const seg of labeled) {
    const last = spans.length - 1;
    const prev = spans[last];
    const contiguous = prev && Math.abs(prev.endBeat - seg.startBeat) < 1e-6;
    if (prev && prev.symbol === seg.symbol && contiguous) {
      // Extend: grow the span and recompute the weight-weighted confidence.
      const newW = weights[last] + seg.totalWeight;
      prev.confidence =
        newW > 0 ? (prev.confidence * weights[last] + seg.confidence * seg.totalWeight) / newW : 0;
      prev.endBeat = seg.endBeat;
      prev.segments += 1;
      weights[last] = newW;
    } else {
      spans.push({
        startBeat: seg.startBeat,
        endBeat: seg.endBeat,
        startMeasure: seg.measure,
        root: seg.root,
        quality: seg.quality,
        symbol: seg.symbol,
        bassPc: seg.bassPc,
        confidence: seg.confidence,
        segments: 1,
      });
      weights.push(seg.totalWeight);
    }
  }
  return spans;
}

/**
 * The single dominant chord per measure — computed by POOLING the whole
 * measure's salience-weighted segment profiles into one measure-level profile
 * and labeling that. Pooling (still salience-weighted) makes this robust to
 * arpeggiated/broken-chord textures where per-beat segments fragment (a whole
 * arpeggiated C measure pools to a clear C, even though its beats individually
 * emphasize different chord tones). This is the honest measure-resolution
 * comparator to the crude pooled `inferChord`; the beat-resolution harmonic
 * rhythm lives in `spans`. A measure with real harmonic motion pools to one
 * lossy label — that motion is what `spans` is for.
 */
function perMeasureView(labeled: LabeledSegment[], opts: AnalyzeOptions): PerMeasureChord[] {
  const byMeasure = new Map<number, LabeledSegment[]>();
  for (const seg of labeled) {
    const list = byMeasure.get(seg.measure) ?? [];
    list.push(seg);
    byMeasure.set(seg.measure, list);
  }
  const rows: PerMeasureChord[] = [];
  for (const [measure, segs] of [...byMeasure.entries()].sort((a, b) => a[0] - b[0])) {
    const pooled = new Array<number>(12).fill(0);
    let bassPitch = Infinity;
    let bassPc = -1;
    for (const seg of segs) {
      for (let pc = 0; pc < 12; pc++) pooled[pc] += seg.profile[pc];
      if (seg.bassPitch >= 0 && seg.bassPitch < bassPitch) {
        bassPitch = seg.bassPitch;
        bassPc = seg.bassPc;
      }
    }
    if (pooled.reduce((a, b) => a + b, 0) <= 0) {
      rows.push({ measure, symbol: "N/C", confidence: 0 });
      continue;
    }
    const { root, margin } = findRoot(pooled, bassPc, opts.rootAlpha);
    const id = identifyChord(pooled, root, margin, opts);
    rows.push({ measure, symbol: id.symbol, confidence: id.confidence });
  }
  return rows;
}

/**
 * Analyze a song's harmony into a real per-segment progression + per-measure view.
 * Deterministic and $0 — same song always yields the same analysis.
 */
export function analyzeHarmony(song: SongEntry, options: AnalyzeOptions = {}): HarmonicAnalysis {
  const meter = parseMeter(song.timeSignature);
  const { beatsPerMeasure } = meter;

  // Filter to the requested measure range (by 1-based measure number) if given.
  let measures = song.measures;
  if (options.measureRange) {
    const [lo, hi] = options.measureRange;
    measures = measures.filter((m) => m.number >= lo && m.number <= hi);
  }

  // Events must be laid on the FULL-song timeline so absolute beats are stable
  // even when a range is requested; segment only the requested measures.
  const allEvents = songEvents(song.measures, beatsPerMeasure);
  const indexByNumber = new Map<number, number>();
  song.measures.forEach((m, i) => indexByNumber.set(m.number, i));

  const labeled: LabeledSegment[] = [];
  for (const measure of measures) {
    const idx = indexByNumber.get(measure.number) ?? 0;
    const segs = segmentMeasure(allEvents, meter, idx * beatsPerMeasure, measure.number);
    for (const seg of segs) labeled.push(labelSegment(seg, options));
  }

  return {
    songId: song.id,
    key: song.key,
    timeSignature: song.timeSignature,
    beatsPerMeasure,
    spans: mergeSpans(labeled),
    perMeasure: perMeasureView(labeled, options),
  };
}
