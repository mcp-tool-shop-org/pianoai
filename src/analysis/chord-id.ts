// ─── Conservative-real chord identification ───────────────────────────────────
//
// Given a root and a salience-weighted profile, names the chord — defaulting to
// the simplest triad and escalating to a seventh / sixth / ninth ONLY when the
// extension tone is itself salient relative to the chord tones. This is the
// conservatism the ACE study-swarm proved wins (finding 6: weighted chord recall
// drops monotonically as the vocabulary deepens, triads 0.721 → tetrads 0.588;
// finding 7: the best large-vocabulary model won by ABSTAINING from a seventh
// when it looked unlikely). Aggression toward extensions lowers accuracy; the
// gate here is deliberately reticent.
//
// The vocabulary is EXACTLY inferChord()'s / verifyHarmony()'s closed set, so an
// analysis label is always a symbol the rest of the platform can read and voice.
// A quality outside that set (e.g. a minor-major-7) degrades to its triad rather
// than emitting an out-of-vocabulary label.
// ─────────────────────────────────────────────────────────────────────────────

/** Pitch-class → name. Matches inferChord()/verifyHarmony() exactly (mixed sharps/flats). */
const PC_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/** Interval sets for each quality — the inferChord/verifyHarmony vocabulary. */
export const QUALITY_INTERVALS: Record<string, number[]> = {
  maj: [0, 4, 7],
  m: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  add9: [0, 4, 7, 2],
  madd9: [0, 3, 7, 2],
  "9": [0, 4, 7, 10, 2],
  maj9: [0, 4, 7, 11, 2],
  m9: [0, 3, 7, 10, 2],
};

/**
 * Thresholds governing escalation. All are fractions of the segment's TOTAL
 * salience (so they're register/tempo-independent). `*_ABS` is an absolute floor
 * on the extension tone's weight; `*_REL` is its required strength relative to
 * the mean triad-tone weight. Both must hold to escalate — the AND is what keeps
 * a passing/ornamental extension from being named. Defaults are conservative and
 * are what the validation harness tunes.
 */
export interface ChordIdOptions {
  thirdFloor?: number;
  fifthFloor?: number;
  seventhAbs?: number;
  seventhRel?: number;
  sixthAbs?: number;
  sixthRel?: number;
  ninthAbs?: number;
  ninthRel?: number;
}

const DEFAULTS: Required<ChordIdOptions> = {
  thirdFloor: 0.06,
  fifthFloor: 0.04,
  seventhAbs: 0.09,
  seventhRel: 0.5,
  sixthAbs: 0.1,
  sixthRel: 0.6,
  ninthAbs: 0.08,
  ninthRel: 0.55,
};

export interface ChordId {
  /** Quality suffix from the vocabulary ("maj","m","7","maj7",…). */
  quality: string;
  /** Full symbol, e.g. "Cmaj7" / "Am" (root name + suffix, "maj" ⇒ bare root). */
  symbol: string;
  /** Fraction of the profile weight explained by the chosen chord's tones. */
  coverage: number;
  /** Confidence in [0,1] = coverage × (0.5 + 0.5·rootMargin). */
  confidence: number;
  /** Pitch classes of the identified chord. */
  chordPcs: number[];
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * Identify the chord quality rooted at `root` over `profile`, and score its
 * confidence. `rootMargin` (from findRoot) folds root clarity into confidence.
 */
export function identifyChord(
  profile: number[],
  root: number,
  rootMargin: number,
  options: ChordIdOptions = {},
): ChordId {
  const opts = { ...DEFAULTS, ...options };
  const total = profile.reduce((a, b) => a + b, 0);
  if (total <= 0 || root < 0) {
    return { quality: "N/C", symbol: "N/C", coverage: 0, confidence: 0, chordPcs: [] };
  }

  const s = (iv: number): number => profile[(root + iv) % 12] / total;
  const s3M = s(4), s3m = s(3);
  const s5P = s(7), s5dim = s(6), s5aug = s(8);
  const s4th = s(5), s2nd = s(2);

  // ── Triad ──
  let quality: string;
  const hasThird = Math.max(s3M, s3m) >= opts.thirdFloor;
  if (hasThird) {
    const major = s3M >= s3m;
    if (!major && s5dim > s5P && s5dim >= opts.fifthFloor) quality = "dim";
    else if (major && s5aug > s5P && s5aug >= opts.fifthFloor) quality = "aug";
    else quality = major ? "maj" : "m";
  } else if (s4th >= opts.thirdFloor && s4th >= s2nd) {
    quality = "sus4";
  } else if (s2nd >= opts.thirdFloor) {
    quality = "sus2";
  } else {
    // Root + fifth (or a bare root) with no third — ambiguous; name it neutral
    // major. Coverage will be low (the third's weight is missing), so confidence
    // reflects the uncertainty rather than the label overstating it.
    quality = "maj";
  }

  // ── Conservative extension escalation (triads only; sus/aug stay triads) ──
  const meanTriad = mean(QUALITY_INTERVALS[quality].map(s));
  const s7m = s(10), s7M = s(11), s6 = s(9), s9 = s(2);
  const strong = (val: number, abs: number, rel: number): boolean => val >= abs && val >= rel * meanTriad;

  if (quality === "dim") {
    // Fully-diminished 7th (iv9) vs half-diminished (iv10).
    if (strong(s6, opts.sixthAbs, opts.sixthRel) && s6 >= s7m) quality = "dim7";
    else if (strong(s7m, opts.seventhAbs, opts.seventhRel)) quality = "m7b5";
  } else if (quality === "maj" || quality === "m") {
    const seventhScore = Math.max(s7m, s7M);
    if (strong(seventhScore, opts.seventhAbs, opts.seventhRel)) {
      if (quality === "maj") quality = s7M >= s7m ? "maj7" : "7";
      // minor + maj7 (mMaj7) is out of vocabulary → keep m7 only when the minor
      // 7th is the stronger candidate, else fall back to the plain minor triad.
      else quality = s7m >= s7M ? "m7" : "m";
      // Ninth stacks only on a realized seventh.
      if (strong(s9, opts.ninthAbs, opts.ninthRel)) {
        if (quality === "7") quality = "9";
        else if (quality === "maj7") quality = "maj9";
        else if (quality === "m7") quality = "m9";
      }
    } else if (strong(s6, opts.sixthAbs, opts.sixthRel)) {
      quality = quality === "maj" ? "6" : "m6";
    } else if (strong(s9, opts.ninthAbs, opts.ninthRel)) {
      quality = quality === "maj" ? "add9" : "madd9";
    }
  }

  // ── Symbol + confidence ──
  const chordPcs = QUALITY_INTERVALS[quality].map((iv) => (root + iv) % 12);
  const covered = chordPcs.reduce((acc, pc) => acc + profile[pc], 0);
  const coverage = clamp01(covered / total);
  const confidence = clamp01(coverage * (0.5 + 0.5 * clamp01(rootMargin)));
  const symbol = PC_NAMES[root] + (quality === "maj" ? "" : quality);

  return { quality, symbol, coverage, confidence, chordPcs };
}
