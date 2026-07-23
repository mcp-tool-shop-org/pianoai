// ─── src/analysis — the real harmonic analysis engine (public API) ────────────
//
// Phase 1 of the studio Music Wing professional arc. A decoupled subsystem:
// SongEntry → real per-segment chord progression via beat-synchronous
// segmentation, salience weighting, Parncutt root-finding, and conservative-real
// chord identification. Reads songs; writes nothing back.
// ─────────────────────────────────────────────────────────────────────────────

export type {
  TimedEvent,
  Segment,
  ChordSpan,
  HarmonicAnalysis,
  PerMeasureChord,
} from "./types.js";

export { parseMeter, metricStrength, METRIC_WEIGHTS, type Meter } from "./meter.js";
export { measureEvents, songEvents } from "./events.js";
export { segmentMeasure } from "./profile.js";
export { findRoot, rootSalience, ROOT_SUPPORT, type RootResult } from "./root.js";
export { identifyChord, QUALITY_INTERVALS, type ChordId, type ChordIdOptions } from "./chord-id.js";
export { analyzeHarmony, type AnalyzeOptions } from "./analyze.js";
