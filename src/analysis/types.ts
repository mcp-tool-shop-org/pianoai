// ─── Harmonic Analysis — shared types ────────────────────────────────────────
//
// The typed output of the real harmonic analyzer (src/analysis), Phase 1 of the
// studio Music Wing professional arc (docs/music-wing-professional-arc.md). This
// module is DECOUPLED from the crude pooled-bag `inferChord` in src/songs/jam.ts:
// that engine stays exactly as it is (it round-trips the deterministic voicer,
// which the maker depends on — voicer.test.ts + the Gate-2 snapshot). This is a
// separate, richer analysis of *source* material — real onset/beat segmentation,
// salience weighting, and root-finding — producing a per-segment chord
// progression instead of one pooled label per measure.
//
// The grounding is the prior ACE study-swarm (docs/maker-arc-phase-c-bass-aware-
// study-swarm.md): sub-bar segmentation (Cho & Bello 2014), root from
// pitch-class content not the lowest note (Temperley 1997, Parncutt 1988),
// conservative escalation to extensions (Humphrey & Bello 2015, McFee & Bello
// 2017), and harmonic rhythm that beats the barline (Masada & Bunescu 2018).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single sounding pitch with reconstructed timing. Onsets are recovered from
 * the hand-string token durations (the platform's own note-value model —
 * src/note-parser.ts / src/types.ts DURATION_MAP), accumulated left-to-right
 * within each hand, so `onsetBeat` is the platform-consistent nominal position
 * (what playback plays). Beats are quarter-note beats from the start of the song.
 */
export interface TimedEvent {
  /** MIDI note number 0-127. */
  pitch: number;
  /** Pitch class 0-11 (pitch % 12). */
  pc: number;
  /** Absolute onset in quarter-note beats from the start of the song. */
  onsetBeat: number;
  /** Duration in quarter-note beats. */
  durBeats: number;
  /** Which hand the token came from. */
  hand: "left" | "right";
  /** 1-based measure this onset falls in. */
  measure: number;
}

/**
 * One beat-synchronous (tactus-level) analysis window with its salience-weighted
 * pitch-class profile. `profile[pc]` is the summed (overlap-duration × metric
 * strength) weight of every event sounding in the window — so a held downbeat
 * chord tone dominates a passing off-beat sixteenth by construction.
 */
export interface Segment {
  /** Absolute start beat (quarter-note beats from song start). */
  startBeat: number;
  /** Absolute end beat. */
  endBeat: number;
  /** 1-based measure the segment's start falls in. */
  measure: number;
  /** Position of the segment start within its measure (quarter-note beats). */
  beatInMeasure: number;
  /** 12-dim salience-weighted pitch-class weight vector. */
  profile: number[];
  /** Pitch class of the lowest sounding note in the window, or -1 if silent. */
  bassPc: number;
  /** MIDI number of the lowest sounding note, or -1 if silent. */
  bassPitch: number;
  /** Sum of `profile` — the segment's total salience (0 when silent). */
  totalWeight: number;
}

/**
 * A contiguous span of the song carrying one chord label — the merge of one or
 * more adjacent tactus segments that resolved to the same symbol (this is how
 * harmonic rhythm emerges: 2–4 chords per bar where the harmony actually moves,
 * one chord across several bars where it doesn't).
 */
export interface ChordSpan {
  /** Absolute start beat. */
  startBeat: number;
  /** Absolute end beat. */
  endBeat: number;
  /** 1-based measure the span starts in. */
  startMeasure: number;
  /** Root pitch class 0-11, or -1 for no-chord (silence / no analyzable root). */
  root: number;
  /** Chord quality suffix ("maj","m","7","maj7",…) or "N/C" for no-chord. */
  quality: string;
  /** Full symbol, e.g. "Cmaj7", "Am", or "N/C". */
  symbol: string;
  /** Pitch class of the sounding bass at the span start, or -1. */
  bassPc: number;
  /** Confidence in [0,1] — root clarity × chord-tone coverage (see chord-id.ts). */
  confidence: number;
  /** How many tactus segments merged into this span. */
  segments: number;
}

/**
 * The complete harmonic analysis of a song (or measure range): the real chord
 * progression as spans, plus a per-measure convenience view (the single
 * dominant chord per measure) that is directly comparable to the crude
 * per-measure `impliedChord` for A/B measurement.
 */
export interface HarmonicAnalysis {
  /** Source song id. */
  songId: string;
  /** Declared key, e.g. "A minor" (passed through from the song; not inferred). */
  key: string;
  /** Time signature, e.g. "4/4". */
  timeSignature: string;
  /** Quarter-note beats per measure derived from the time signature. */
  beatsPerMeasure: number;
  /** The chord progression as merged spans, in time order. */
  spans: ChordSpan[];
  /**
   * The single most-salient chord per measure (the span/segment carrying the
   * most weight in that measure) — a drop-in comparator to `inferChord` per
   * measure. `confidence` is the confidence of that dominant label.
   */
  perMeasure: PerMeasureChord[];
}

/** One row of the per-measure convenience view. */
export interface PerMeasureChord {
  /** 1-based measure number. */
  measure: number;
  /** Dominant chord symbol for the measure ("N/C" if the measure is silent). */
  symbol: string;
  /** Confidence in [0,1] of that label. */
  confidence: number;
}
