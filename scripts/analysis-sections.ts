// ─── analysis-sections.ts — Self-Similarity Novelty Section Lens ─────────────
//
// Wave W-H (harness upgrade). Finds structural section boundaries even when
// the pattern/repeat passes find nothing — the pilot report's own warning:
// "'0 repeat groups' means 'no literal repeats found,' not 'through-
// composed,' and shouldn't be over-read." A checkerboard-kernel novelty
// curve over a per-measure self-similarity matrix answers a different
// question (where does the music's CHARACTER change) than repeat detection
// (where does material recur), and doesn't depend on anything repeating at
// all.
//
// Design grounding (docs/feature-pass-v1.5-dispatch.md, "Study-swarm 2",
// findings 60-61, "The design -> Wave W-H"):
//   - Per-measure feature vectors (onset density, mean pitch per hand,
//     pitch-class profile) -> cosine self-similarity matrix -> checkerboard
//     novelty -> peak-picked boundaries, kernel ~4 measures [60].
//   - Section detection is pedagogically load-bearing, not just descriptive:
//     expert practice segments start/stop at formal-structure boundaries
//     [61] — so every detected section is surfaced as a suggested practice
//     segment, not just a structural label.
// ─────────────────────────────────────────────────────────────────────────────

import type { Measure } from "../src/songs/index.js";
import { parseHandEvents, pitchClassProfile, measureBeatsFromTimeSignature, round3, type HandOnset } from "./analysis-chords.js";

// ─── Per-measure feature vectors ────────────────────────────────────────────

interface MeasureFeatures {
  measure: number;
  /** Total onsets, both hands. */
  density: number;
  meanPitchRight: number | null;
  meanPitchLeft: number | null;
  /** Duration-weighted, NOT yet normalized (raw beat-mass per pitch class). */
  pcProfile: number[];
}

function meanPitch(onsets: HandOnset[]): number | null {
  let sum = 0;
  let count = 0;
  for (const onset of onsets) {
    for (const p of onset.pitches) {
      sum += p;
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

function computeMeasureFeatures(measures: Measure[], measureBeats: number): MeasureFeatures[] {
  return measures.map((m) => {
    const rh = parseHandEvents(m.rightHand);
    const lh = parseHandEvents(m.leftHand);
    return {
      measure: m.number,
      density: rh.length + lh.length,
      meanPitchRight: meanPitch(rh),
      meanPitchLeft: meanPitch(lh),
      pcProfile: pitchClassProfile(rh, lh, 0, measureBeats),
    };
  });
}

/**
 * Turn each measure's raw features into a comparable vector: density and
 * both hands' mean pitch are min-max normalized across the WHOLE song
 * first (density against its own max; both hands' pitch against one
 * SHARED min/max so relative hand-height — e.g. "left hand jumps out of
 * the bass register" — survives normalization instead of being erased by
 * per-hand scaling); the pitch-class profile is normalized to sum 1 (a
 * proportion, already scale-free). Concatenating scale-matched features
 * before cosine similarity is standard practice — without it, whichever
 * raw feature happens to have the largest numeric range would dominate the
 * similarity score regardless of musical relevance.
 */
function buildFeatureVectors(features: MeasureFeatures[]): number[][] {
  const maxDensity = features.reduce((m, f) => Math.max(m, f.density), 0);
  const pitches: number[] = [];
  for (const f of features) {
    if (f.meanPitchRight !== null) pitches.push(f.meanPitchRight);
    if (f.meanPitchLeft !== null) pitches.push(f.meanPitchLeft);
  }
  const minPitch = pitches.reduce((m, p) => Math.min(m, p), Infinity);
  const maxPitch = pitches.reduce((m, p) => Math.max(m, p), -Infinity);

  const normPitch = (p: number | null): number => {
    if (p === null) return 0;
    if (maxPitch <= minPitch) return 0.5;
    return (p - minPitch) / (maxPitch - minPitch);
  };

  return features.map((f) => {
    const normDensity = maxDensity > 0 ? f.density / maxDensity : 0;
    const pcSum = f.pcProfile.reduce((a, b) => a + b, 0);
    const pcNorm = pcSum > 0 ? f.pcProfile.map((v) => v / pcSum) : f.pcProfile.map(() => 0);
    return [normDensity, normPitch(f.meanPitchRight), normPitch(f.meanPitchLeft), ...pcNorm];
  });
}

// ─── Self-similarity matrix + checkerboard novelty [60] ────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function buildSelfSimilarityMatrix(vectors: number[][]): number[][] {
  const n = vectors.length;
  const ssm: number[][] = Array.from({ length: n }, () => new Array(n).fill(0) as number[]);
  for (let i = 0; i < n; i++) {
    ssm[i][i] = 1;
    for (let j = i + 1; j < n; j++) {
      const sim = cosineSimilarity(vectors[i], vectors[j]);
      ssm[i][j] = sim;
      ssm[j][i] = sim;
    }
  }
  return ssm;
}

/** Foote's original unweighted checkerboard: +1 in the two "within-hypothesized-segment" quadrants (both indices before the center, or both after), -1 in the two "across-the-boundary" quadrants. High novelty = the two sides are each internally similar AND dissimilar from each other — exactly a segment transition. */
function checkerboardKernel(radius: number): number[][] {
  const size = radius * 2;
  const kernel: number[][] = [];
  for (let ui = 0; ui < size; ui++) {
    const u = ui - radius;
    const row: number[] = [];
    for (let vi = 0; vi < size; vi++) {
      const v = vi - radius;
      row.push((u < 0) === (v < 0) ? 1 : -1);
    }
    kernel.push(row);
  }
  return kernel;
}

function computeNovelty(ssm: number[][], radius: number): number[] {
  const n = ssm.length;
  const kernel = checkerboardKernel(radius);
  const novelty = new Array(n).fill(0) as number[];
  for (let i = radius; i < n - radius; i++) {
    let sum = 0;
    for (let ui = 0; ui < kernel.length; ui++) {
      for (let vi = 0; vi < kernel.length; vi++) {
        sum += kernel[ui][vi] * ssm[i + ui - radius][i + vi - radius];
      }
    }
    novelty[i] = sum;
  }
  return novelty;
}

/** "kernel ~4 measures" [60], shrunk adaptively for short songs/fixtures — a kernel needs `radius` real measures on both sides to evaluate at all. Returns 0 when the song is too short (< 3 measures) for any interior novelty index to exist. */
function effectiveRadius(measureCount: number, desired: number): number {
  if (measureCount < 3) return 0;
  return Math.max(1, Math.min(desired, Math.floor((measureCount - 1) / 2)));
}

const NOVELTY_KERNEL_RADIUS = 4;

/** A "section" shorter than this isn't a meaningfully separate practice unit — the min-section-length guard. */
const MIN_SECTION_LENGTH = 4;

// ─── Peak picking with a min-section-length guard ──────────────────────────

interface Peak {
  /**
   * 0-based index into the measures array. The checkerboard kernel's u,v
   * offsets both range [-radius, radius-1] (see checkerboardKernel), so
   * novelty[i] compares the radius measures BEFORE i against the radius
   * measures FROM i onward, INCLUSIVE of i itself — meaning index i is the
   * first measure of the section that starts the transition, not the last
   * measure of the section before it. buildSections relies on this exact
   * convention (confirmed empirically while calibrating: a deliberate
   * texture swap at the array-index-8 seam peaked at novelty[8], and index
   * 8 is measure 9 — the correct first measure of the new block).
   */
  index: number;
  score: number;
}

/**
 * Cosine similarity of two IDENTICAL feature vectors should be exactly 1,
 * but sqrt/division floating-point rounding can land it at
 * 0.9999999999999998 or similar — in a genuinely homogeneous stretch (every
 * measure's feature vector equal), that noise is consistent enough across
 * the checkerboard sum to leave a tiny but nonzero "novelty" value that a
 * strict `> 0` filter would treat as a real peak (confirmed empirically: a
 * 16-measure fully-uniform fixture produced 3 spurious sections, all
 * displaying noveltyScore 0 after round3's 3-decimal rounding — the
 * decision was being made on the unrounded value). This floor is far above
 * FP noise (~1e-15) and far below any musically real novelty value observed
 * in this repo's own library while calibrating (roughly 0.5-8.6).
 */
const NOVELTY_NOISE_FLOOR = 1e-6;

function pickLocalMaxima(novelty: number[], radius: number): Peak[] {
  const n = novelty.length;
  const candidates: Peak[] = [];
  for (let i = radius; i < n - radius; i++) {
    if (novelty[i] <= NOVELTY_NOISE_FLOOR) continue;
    let isLocalMax = true;
    for (let j = Math.max(radius, i - radius); j <= Math.min(n - radius - 1, i + radius); j++) {
      if (j !== i && novelty[j] > novelty[i]) {
        isLocalMax = false;
        break;
      }
    }
    if (isLocalMax) candidates.push({ index: i, score: novelty[i] });
  }
  return candidates;
}

/** Greedily accept peaks in descending novelty order, skipping any candidate closer than minGap measures to an already-accepted peak — the guard against adjacent, near-duplicate boundaries carving out a sliver section. */
function acceptPeaksWithMinGap(candidates: Peak[], minGap: number): Peak[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score || a.index - b.index);
  const accepted: Peak[] = [];
  for (const c of sorted) {
    if (accepted.every((a) => Math.abs(a.index - c.index) >= minGap)) accepted.push(c);
  }
  accepted.sort((a, b) => a.index - b.index);
  return accepted;
}

/**
 * The inter-peak gap check above guards every INTERNAL section; this
 * separately guards the two EDGE sections, which can be short even when
 * every internal gap is fine. Given the Peak.index convention above (index
 * i is the FIRST measure of the section it opens): the first section spans
 * array indices [0, peak.index - 1] (length = peak.index), and the last
 * section spans [lastPeak.index, measureCount - 1] (length = measureCount -
 * lastPeak.index).
 */
function enforceEdgeMinLength(peaks: Peak[], measureCount: number, minLength: number): Peak[] {
  const result = [...peaks];
  while (result.length > 0 && result[0].index < minLength) result.shift();
  while (result.length > 0 && measureCount - result[result.length - 1].index < minLength) result.pop();
  return result;
}

function pickSectionPeaks(novelty: number[], radius: number, minSectionLength: number): Peak[] {
  const candidates = pickLocalMaxima(novelty, radius);
  const accepted = acceptPeaksWithMinGap(candidates, minSectionLength);
  return enforceEdgeMinLength(accepted, novelty.length, minSectionLength);
}

// ─── Output shapes ──────────────────────────────────────────────────────────

export interface SectionBoundary {
  startMeasure: number;
  endMeasure: number;
  /** Novelty score of the peak that opens this section (the transition INTO it). 0 for the first section, which has no preceding detected boundary. */
  noveltyScore: number;
}

export interface PracticeSegment {
  startMeasure: number;
  endMeasure: number;
  lengthMeasures: number;
  note: string;
}

export interface SectionAnalysis {
  sections: SectionBoundary[];
  practiceSegments: PracticeSegment[];
}

/** peak.index is the FIRST measure of the section it opens (see the Peak interface comment), so the section being closed ends at peak.index - 1 and the next one starts at peak.index — not the other way around. */
function buildSections(measures: Measure[], peaks: Peak[]): SectionBoundary[] {
  const sections: SectionBoundary[] = [];
  let startIdx = 0;
  let precedingScore = 0;
  for (const peak of peaks) {
    sections.push({
      startMeasure: measures[startIdx].number,
      endMeasure: measures[peak.index - 1].number,
      noveltyScore: round3(precedingScore),
    });
    startIdx = peak.index;
    precedingScore = peak.score;
  }
  sections.push({
    startMeasure: measures[startIdx].number,
    endMeasure: measures[measures.length - 1].number,
    noveltyScore: round3(precedingScore),
  });
  return sections;
}

/**
 * Practice-segment framing per finding 61: every detected section becomes a
 * suggested practice unit, phrased honestly when no internal boundary was
 * found at all (absence of a boundary is not itself evidence of anything —
 * see the pilot report's "0 repeat groups" caution, which applies here
 * too). Exported for direct testing of the singular/plural "measure(s)"
 * wording specifically: MIN_SECTION_LENGTH (4) guarantees every section
 * analyzeSections can ever actually produce is >= 4 measures long, so the
 * length===1 singularization branch is UNREACHABLE through the public
 * analyzeSections entry point — the only way to exercise it honestly is a
 * direct call with a hand-built SectionBoundary.
 */
export function toPracticeSegment(s: SectionBoundary, isOnlySection: boolean): PracticeSegment {
  const length = s.endMeasure - s.startMeasure + 1;
  const note = isOnlySection
    ? `No internal section boundary detected — treat measures ${s.startMeasure}-${s.endMeasure} (the whole piece) as one practice unit, or subdivide by ear.`
    : `Practice measures ${s.startMeasure}-${s.endMeasure} (${length} measure${length === 1 ? "" : "s"}) as one unit — a detected structural boundary marks its edge.`;
  return { startMeasure: s.startMeasure, endMeasure: s.endMeasure, lengthMeasures: length, note };
}

/**
 * Per-measure feature vectors -> cosine self-similarity matrix ->
 * checkerboard novelty -> peak-picked section boundaries, for a whole song.
 * `timeSignature` should be the ingested/resolved value
 * (SongEntry.timeSignature), matching analyzeChords and the rest of the
 * brief. Always returns at least one section for a non-empty song (the
 * whole piece, honestly labeled, when no internal boundary clears the
 * guard) — never an empty sections array for real content.
 */
export function analyzeSections(measures: Measure[], timeSignature: string): SectionAnalysis {
  if (measures.length === 0) return { sections: [], practiceSegments: [] };

  const measureBeats = measureBeatsFromTimeSignature(timeSignature);
  const features = computeMeasureFeatures(measures, measureBeats);
  const vectors = buildFeatureVectors(features);
  const ssm = buildSelfSimilarityMatrix(vectors);
  const radius = effectiveRadius(measures.length, NOVELTY_KERNEL_RADIUS);

  const peaks = radius > 0 ? pickSectionPeaks(computeNovelty(ssm, radius), radius, MIN_SECTION_LENGTH) : [];

  const sections = buildSections(measures, peaks);
  const practiceSegments = sections.map((s) => toPracticeSegment(s, sections.length === 1));
  return { sections, practiceSegments };
}
