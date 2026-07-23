// ─── src/compose — the composition engine (public API) ────────────────────────
//
// Phase 2 of the studio Music Wing professional arc. The reharmonization envelope
// scaled to PART-WRITING: realize a FIXED chord progression (from the Phase-1
// analyzer, a maker reharmonization, or anywhere) as N voices, admitted by a
// deterministic voice-leading gate, ranked by a preference scorer, chosen by a
// best-of-n loop. Decoupled + additive — never touches inferChord, the frozen
// E-R sourceChords, or the Gate-2 snapshot.
// ─────────────────────────────────────────────────────────────────────────────

import type { HarmonicAnalysis } from "../analysis/index.js";
import type { ChordProgression } from "./realize.js";

export { parseVoicing, frameFromVoicing, type Realization, type RealizedFrame } from "./types.js";
export {
  verifyVoiceLeading,
  parseKey,
  type VoiceLeadingVerdict,
  type VLRule,
  type VLRuleResult,
  type VLViolation,
  type VerifyVoiceLeadingOptions,
  type ParsedKey,
} from "./voice-leading.js";
export {
  scoreRealization,
  DEFAULT_SCORE_WEIGHTS,
  type RealizationScore,
  type ScoreWeights,
} from "./scorer.js";
export {
  realizeProgression,
  rootPositionRealization,
  nearestToneRealization,
  DeterministicProposer,
  type ChordProgression,
  type RealizationProposer,
  type RealizeOptions,
  type RealizeResult,
} from "./realize.js";
export {
  OllamaRealizer,
  realizeSystem,
  buildRealizeUser,
  parseRealizationResponse,
  REALIZE_OUTPUT_SCHEMA,
  type OllamaRealizerOptions,
} from "./ollama-realizer.js";

// ─── Analysis → progression (the Phase-1 → Phase-2 seam) ──────────────────────

export interface ProgressionFromAnalysisOptions {
  /**
   * Which analyzer view to realize. "perMeasure" (default) = one chord per
   * measure — the clean block-realization target. "spans" = the sub-measure
   * harmonic-rhythm progression (each span a frame, labeled by a running index
   * since a measure can carry several spans).
   */
  source?: "perMeasure" | "spans";
  /** Drop N/C (no-chord) entries instead of keeping them as rest frames. Default false. */
  dropNoChord?: boolean;
}

/**
 * Convert a Phase-1 HarmonicAnalysis into a ChordProgression the composer
 * realizes. This is the analysis→composition through-line: real harmonic
 * understanding becomes voiced musical material. Pure; imports only the analysis
 * TYPE, so it adds no runtime coupling.
 */
export function progressionFromAnalysis(
  analysis: HarmonicAnalysis,
  opts: ProgressionFromAnalysisOptions = {},
): ChordProgression {
  const source = opts.source ?? "perMeasure";
  let chords: Array<{ measure: number; chordSymbol: string }>;
  if (source === "spans") {
    chords = analysis.spans.map((s, i) => ({ measure: i + 1, chordSymbol: s.symbol }));
  } else {
    chords = analysis.perMeasure.map((m) => ({ measure: m.measure, chordSymbol: m.symbol }));
  }
  if (opts.dropNoChord) chords = chords.filter((c) => c.chordSymbol && c.chordSymbol !== "N/C");
  return { key: analysis.key, chords };
}
