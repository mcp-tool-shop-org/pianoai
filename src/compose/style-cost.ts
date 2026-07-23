// ─── Compose: the soft style-typicality cost (a SCORER axis, never a gate) ────
//
// Phase 2, Session 2, Slice A2. The evidence says taste — "sounds like jazz" —
// belongs in a SOFT, corpus-derived preference layer UNDER the hard floor, never
// as more hard rules (finding 9, Pachet/Roy/Barbieri 2011; finding 7, Anders &
// Miranda 2011). This module computes a per-realization STYLE-TYPICALITY signal:
// how well a voicing's computable texture (parallel-motion fraction, mean motion,
// upper-voice spacing, outer contrary-motion) fits a per-style REFERENCE BAND.
//
// It is a RANKING signal ONLY. Finding 19 (Yang & Lerch 2020) is explicit: a
// distribution-distance metric diagnoses distribution-fit, NOT per-item quality —
// so this NEVER gates, and it is NOT a quality claim (that is the blind BWS panel,
// a director priced-ask). It ships DEFAULT-OFF (weight 0 in the scorer) so it
// changes no existing ranking; a caller opts in with a reference band + a weight.
//
// The reference band is corpus-derived at $0 from the existing library
// (buildStyleReference over deterministically-realized library progressions) —
// honestly a BASELINE-derived distributional band, a tripwire, NOT a human-voiced
// gold corpus. A learned style model + the BWS quality panel are later slices.
//
// No cycle: this imports only verifyVoiceLeading (voice-leading.ts imports neither
// this nor the scorer); the scorer imports this.
// ─────────────────────────────────────────────────────────────────────────────

import { verifyVoiceLeading } from "./voice-leading.js";
import type { Realization } from "./types.js";

/** The computable voicing-texture features the style band is built over. */
export type StyleFeatureName = "parallelFraction" | "meanMotion" | "meanUpperSpacing" | "contraryFraction";

const FEATURE_NAMES: StyleFeatureName[] = ["parallelFraction", "meanMotion", "meanUpperSpacing", "contraryFraction"];

const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Compute the voicing-texture feature vector of a realization:
 *   • parallelFraction  — fraction of transitions containing a parallel perfect
 *     (high in rock/jazz planing, ~0 in a chorale) — the defining style texture,
 *   • meanMotion        — mean per-voice semitone motion (conjunct ↔ leapy),
 *   • meanUpperSpacing  — mean adjacent-upper-voice interval (close ↔ open),
 *   • contraryFraction  — fraction of transitions with contrary/oblique outer motion.
 * Pure; reuses the verifier's already-computed parallels + motion.
 */
export function styleFeatures(realization: Realization): Record<StyleFeatureName, number> {
  const frames = realization.frames
    .map((f) => ({ ...f, voices: [...f.voices].sort((a, b) => a - b) }))
    .filter((f) => f.voices.length > 0);
  const verdict = verifyVoiceLeading(realization); // default common-practice: parallels + motion always computed
  const transitions = Math.max(0, frames.length - 1);

  // distinct transitions carrying ≥1 parallel perfect (violations are keyed by atMeasure)
  const parTransitions = new Set(verdict.hardGates.parallels.violations.map((v) => v.atMeasure)).size;
  const parallelFraction = transitions > 0 ? parTransitions / transitions : 0;

  const meanMotion = verdict.meanMotionPerVoice ?? 0;

  let gapSum = 0;
  let gapCount = 0;
  for (const f of frames) {
    for (let v = 1; v + 1 < f.voices.length; v++) {
      gapSum += f.voices[v + 1] - f.voices[v];
      gapCount++;
    }
  }
  const meanUpperSpacing = gapCount > 0 ? gapSum / gapCount : 0;

  let contrary = 0;
  for (let i = 0; i + 1 < frames.length; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    const bassMove = sign(b.voices[0] - a.voices[0]);
    const sopMove = sign(b.voices[b.voices.length - 1] - a.voices[a.voices.length - 1]);
    if (bassMove === 0 || sopMove === 0 || bassMove !== sopMove) contrary++;
  }
  const contraryFraction = transitions > 0 ? contrary / transitions : 1;

  return { parallelFraction, meanMotion, meanUpperSpacing, contraryFraction };
}

export interface StyleFeatureStats {
  mean: number;
  std: number;
}

/** A per-style distributional reference band over the voicing-texture features. */
export interface StyleReference {
  style: string;
  /** Corpus size the band was built from. */
  n: number;
  features: Record<StyleFeatureName, StyleFeatureStats>;
}

/**
 * Build a reference band from a corpus of realizations (per-feature mean + std).
 * The corpus is any set of "in-style" realizations — e.g. the deterministic
 * realizers' admitted output over the library under a style ($0, reproducible).
 * A BASELINE-derived distributional band (a tripwire), NOT a human-voiced corpus.
 */
export function buildStyleReference(style: string, corpus: Realization[]): StyleReference {
  const rows = corpus.map(styleFeatures);
  const features = {} as Record<StyleFeatureName, StyleFeatureStats>;
  for (const name of FEATURE_NAMES) {
    const xs = rows.map((r) => r[name]);
    const m = mean(xs);
    const std = Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
    features[name] = { mean: m, std };
  }
  return { style, n: corpus.length, features };
}

/**
 * Style-typicality of a realization vs a reference band ∈ (0,1]: the mean over
 * features of a Gaussian fit exp(−½ z²), z = (value − mean)/std. 1 = exactly
 * typical, → 0 = many std devs off the style's band. A RANKING signal only
 * (finding 19) — never a gate, never a quality verdict. The std is floored so a
 * degenerate (zero-variance) feature cannot make any deviation score 0.
 */
export function styleTypicality(realization: Realization, reference: StyleReference): number {
  const f = styleFeatures(realization);
  let sum = 0;
  for (const name of FEATURE_NAMES) {
    const { mean: m, std } = reference.features[name];
    const s = Math.max(std, 1e-3 + Math.abs(m) * 0.05); // floor: ~5% of the mean, never 0
    const z = (f[name] - m) / s;
    sum += Math.exp(-0.5 * z * z);
  }
  return sum / FEATURE_NAMES.length;
}
