// ─── analysis-patterns.test.ts ────────────────────────────────────────────────
//
// Tests for scripts/analysis-patterns.ts: transposition-aware repeated-cell
// discovery over melodic interval sequences, subsumption dedup, maximal-match
// extension, non-overlapping occurrence resolution (finding 5), diversity-
// aware cap+ranking (finding 6).
//
// Fixtures below were verified empirically against the actual implementation
// while building it (see the module's own comments on extendMatch and the
// cap-scenario design note below) — this is not hand-derived arithmetic that
// might be wrong, it's the module's real, reproducible output for these
// inputs.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import type { Measure } from "../src/songs/types.js";
import { analyzePatterns, selectDiverseTopN, type PatternGroup } from "./analysis-patterns.js";
import { PITCH_CLASS_NAMES } from "./analysis-chords.js";

function m(number: number, rightHand: string, leftHand: string): Measure {
  return { number, rightHand, leftHand };
}

function midiToName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  const pc = ((midi % 12) + 12) % 12;
  return `${PITCH_CLASS_NAMES[pc]}${octave}`;
}

/** Build a note string from explicit MIDI pitches, one quarter note each. */
function notes(pitches: number[]): string {
  return pitches.map((p) => `${midiToName(p)}:q`).join(" ");
}

// ─── Transposition-aware detection [57] ────────────────────────────────────

describe("analyzePatterns — transposition-aware detection", () => {
  it("finds a repeat via intervals that an exact pitch-string match would miss", () => {
    // Measure 1: C4 E4 G4 C5 (intervals +4,+3,+5). Measure 2: rest (filler).
    // Measure 3: D4 F#4 A4 D5 — the SAME shape, transposed up 2 semitones.
    // Byte-identical/pitch-class-multiset matching (findRepeatedSections)
    // would never group these; the interval sequence is identical.
    const measures = [
      m(1, "C4:q E4:q G4:q C5:q", "R:w"),
      m(2, "R:w", "R:w"),
      m(3, "D4:q F#4:q A4:q D5:q", "R:w"),
    ];
    const result = analyzePatterns(measures);

    expect(result.label).toBe("repetition candidates (evidence-graded)");
    expect(result.groups).toHaveLength(1);
    const [group] = result.groups;
    expect(group.hand).toBe("rightHand");
    expect(group.transposed).toBe(true);
    expect(group.occurrences).toHaveLength(2);
    expect(group.occurrences[0]).toMatchObject({ startMeasure: 1, endMeasure: 1, transposition: 0 });
    expect(group.occurrences[1]).toMatchObject({ startMeasure: 3, endMeasure: 3, transposition: 2 });
  });

  it("marks a group transposed:false when every occurrence is pitch-identical", () => {
    const phrase = "C4:q D4:q E4:q F4:q";
    const measures = [m(1, phrase, "R:w"), m(2, "R:w", "R:w"), m(3, phrase, "R:w")];
    const result = analyzePatterns(measures);
    expect(result.groups[0].transposed).toBe(false);
    expect(result.groups.every((g) => g.occurrences.every((o) => o.transposition === 0))).toBe(true);
  });

  it("finds nothing when a hand never repeats any interval substring", () => {
    // Strictly increasing, ever-larger intervals — no substring recurs.
    const measures = [m(1, notes([48, 50, 53, 57, 62, 68, 75]), "R:w")];
    const result = analyzePatterns(measures);
    expect(result.groups).toEqual([]);
  });

  it("returns no groups for a song with no notes at all", () => {
    const measures = [m(1, "R:w", "R:w"), m(2, "R:w", "R:w")];
    expect(analyzePatterns(measures).groups).toEqual([]);
  });
});

// ─── Subsumption dedup + maximal extension [58] ────────────────────────────

describe("analyzePatterns — subsumption dedup", () => {
  it("reports one maximal group, not also the shorter sub-patterns it wholly contains", () => {
    // A 6-note (5-interval) phrase repeated exactly. Every shorter interval
    // substring within it (length 3, 4) ALSO trivially repeats at the same
    // relative offset — without subsumption dedup this would report several
    // redundant, wholly-overlapping entries instead of one.
    const phrase = "C4:q D4:q E4:q F4:q G4:q A4:q";
    const measures = [m(1, phrase, "R:w"), m(2, "R:w", "R:w"), m(3, phrase, "R:w")];
    const result = analyzePatterns(measures);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].length).toBe(5); // the FULL shared interval run, not a truncated sub-window
    expect(result.groups[0].occurrences.map((o) => o.startMeasure)).toEqual([1, 3]);
  });

  it("extends a discovered match past the internal scan-seed bound to its true maximal length", () => {
    // An oscillating 30-note phrase (29 intervals) repeated exactly. The
    // module's internal n-gram scan seeds at a much shorter bound (24
    // intervals) purely for scan cost — extendMatch is what grows a seed
    // match out to its real shared length, however long that turns out to
    // be. If extension were missing/broken, this would report length <= 24
    // (or several overlapping shorter entries) instead of the true 29.
    const cycle = [1, 1, 1, -1, -1, -1];
    const pitches = [60];
    for (let i = 1; i < 30; i++) pitches.push(pitches[i - 1] + cycle[(i - 1) % cycle.length]);
    const phrase = notes(pitches);

    const measures = [m(1, phrase, "R:w"), m(2, "R:w", "R:w"), m(3, phrase, "R:w")];
    const result = analyzePatterns(measures);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].length).toBe(29);
  });
});

// ─── Occurrence self-overlap resolution [finding 5] ────────────────────────

describe("analyzePatterns — non-overlapping occurrence resolution", () => {
  it("resolves a densely-repeating ostinato to ONE group with non-overlapping occurrences and a sane compressionRatio", () => {
    // A C-E-G-E cell repeated 12 times back-to-back. Before this fix, every
    // scan length that happened to (re)discover the same underlying
    // periodicity contributed its own raw, heavily-overlapping "starts"
    // array straight into the reported occurrences — this exact fixture
    // produced 12 occurrences (6 measure ranges, each duplicated) and a
    // compressionRatio of 8.211 (occurrence COUNT feeds the ratio directly,
    // so double-counted occurrences double-count the "compression").
    const measures: Measure[] = [];
    for (let i = 1; i <= 12; i++) measures.push(m(i, "C4:q E4:q G4:q E4:q", "R:w"));

    const result = analyzePatterns(measures);
    expect(result.groups).toHaveLength(1);
    const [group] = result.groups;

    // Non-overlapping: sorted occurrences' [startMeasure, endMeasure] spans
    // never start before the previous one's own start+length claim ends —
    // concretely, no two occurrences are byte-identical (the literal
    // "duplicate identical entries" bug) and each successive occurrence
    // starts at or after the previous one's endMeasure.
    const sorted = [...group.occurrences].sort((a, b) => a.startMeasure - b.startMeasure);
    const seen = new Set<string>();
    for (const occ of sorted) {
      const key = `${occ.startMeasure}-${occ.endMeasure}`;
      expect(seen.has(key)).toBe(false); // no duplicate identical entries
      seen.add(key);
    }
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].startMeasure).toBeGreaterThanOrEqual(sorted[i - 1].endMeasure);
    }

    // Real, reproducible output for this fixture (not the old 12-occurrence/8.211 numbers).
    expect(group.occurrences).toHaveLength(6);
    expect(group.compressionRatio).toBeCloseTo(2.727, 3);
    expect(group.compressionRatio).toBeLessThan(8.211); // sane, not the old overlap-inflated ratio
  });

  it("drops a pattern entirely once overlap-resolution leaves fewer than 2 non-overlapping occurrences (below MIN_PATTERN_LENGTH's own floor)", () => {
    // A pure 2-note back-and-forth (period 2) is SHORTER than this module's
    // own MIN_PATTERN_LENGTH (3 intervals) once resolved to a genuinely
    // non-overlapping unit — correctly dropped, not rescued into a
    // misleadingly long "pattern" that never repeats without overlapping
    // itself.
    const measures: Measure[] = [];
    for (let i = 1; i <= 12; i++) measures.push(m(i, "C4:q E4:q C4:q E4:q", "R:w"));
    const result = analyzePatterns(measures);
    expect(result.groups).toEqual([]);
  });
});

// ─── Ranking + cap [55, 59] ─────────────────────────────────────────────────

describe("analyzePatterns — ranking and cap", () => {
  /**
   * Deterministic, pairwise-distinct 3-interval "shapes" per motif index —
   * genuinely different interval CONTENT, not just the same shape at
   * different starting pitches (an earlier fixture attempt using transposed
   * copies of one shape collapsed into a single giant match, since
   * transposition-invariance correctly treated them as "the same pattern").
   * Verified pairwise-distinct by construction (see the modulus spread).
   */
  function tripleFor(k: number): [number, number, number] {
    const a = ((k * 5) % 7) - 3 || 1;
    const b = ((k * 3 + 2) % 9) - 4 || 1;
    const c = ((k * 7 + 1) % 5) - 2 || 1;
    return [a, b, c];
  }
  function motifHand(k: number): string {
    const [a, b, c] = tripleFor(k);
    const pitches = [60];
    pitches.push(pitches[0] + a, pitches[0] + a + b, pitches[0] + a + b + c);
    return notes(pitches);
  }
  function buildMotifSong(motifCount: number): Measure[] {
    const measures: Measure[] = [];
    let num = 1;
    for (let k = 0; k < motifCount; k++) {
      measures.push(m(num++, motifHand(k), "R:w"));
      measures.push(m(num++, "R:w", "R:w"));
    }
    // Second pass in REVERSED order: keeps each motif's own shape repeating
    // while every "which motif follows which" seam interval differs from
    // pass 1, so no macro-pattern can span more than one motif (also
    // verified empirically — same-order second pass collapsed all motifs
    // into one giant match).
    for (let k = motifCount - 1; k >= 0; k--) {
      measures.push(m(num++, motifHand(k), "R:w"));
      measures.push(m(num++, "R:w", "R:w"));
    }
    return measures;
  }

  it("caps output at 8 groups even when more distinct repeats exist", () => {
    const result = analyzePatterns(buildMotifSong(10));
    expect(result.groups.length).toBe(8);
  });

  it("returns every group uncapped when fewer than 8 distinct repeats exist", () => {
    const result = analyzePatterns(buildMotifSong(3));
    // 2, not 3: two of the three motifs' discovered patterns turn out to
    // share a measure of footprint (a seam interval spanning the boundary
    // between two adjacent motifs coincidentally repeats elsewhere in this
    // shared fixture — extractMelodicEvents concatenates notes across rest
    // measures, so cross-motif seams are real, matchable intervals; see
    // this describe block's own comment on the second-pass reversal fixing
    // a SIMILAR, more severe coincidence). The diversity filter [59,
    // finding 6] correctly treats that as redundant footprint and keeps
    // only one of the two — well below the cap (8), so this still tests
    // the thing this test is named for: the cap doesn't force a smaller
    // count UP, it isn't why this result has fewer than 8 groups.
    expect(result.groups.length).toBe(2);
    expect(result.groups.length).toBeLessThan(8); // TOP_N_PATTERNS — the cap is not why this is under 8
  });

  it("sorts groups by descending rank score (compressionRatio * compactness * coverage)", () => {
    const result = analyzePatterns(buildMotifSong(10));
    const ranks = result.groups.map((g) => g.compressionRatio * g.compactness * g.coverage);
    for (let i = 1; i < ranks.length; i++) expect(ranks[i]).toBeLessThanOrEqual(ranks[i - 1] + 1e-9);
  });

  it("assigns evidenceGrade from occurrence count and length, never leaving it undefined", () => {
    const result = analyzePatterns(buildMotifSong(3));
    for (const g of result.groups) expect(["strong", "moderate", "weak"]).toContain(g.evidenceGrade);
  });

  it("keeps compressionRatio/compactness/coverage within sane bounds", () => {
    const result = analyzePatterns(buildMotifSong(5));
    for (const g of result.groups) {
      expect(g.compressionRatio).toBeGreaterThan(0);
      expect(g.compactness).toBeGreaterThanOrEqual(0);
      expect(g.compactness).toBeLessThanOrEqual(1);
      expect(g.coverage).toBeGreaterThan(0);
      expect(g.coverage).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Occurrence-span diversity [59, finding 6] ─────────────────────────────
//
// Constructing a note-string fixture where two DIFFERENT (non-subsumed)
// pattern families genuinely overlap in measure footprint is possible but
// fragile — monophonic melodic content makes "two distinct families with
// overlapping timing" an unusual shape to reliably coax out of the n-gram
// discovery pipeline (every attempt either collapsed into one larger
// periodic match via the existing subsumption logic, or landed under the
// 50% floor). selectDiverseTopN is exported specifically so this — finding
// 6's actual fix — can be tested directly against hand-built PatternGroup
// fixtures, which is more reliable and just as faithful to what's being
// verified.

function fakeGroup(hand: "rightHand" | "leftHand", spans: [number, number][], rank: number): PatternGroup {
  return {
    hand,
    length: 4,
    occurrences: spans.map(([startMeasure, endMeasure]) => ({ startMeasure, endMeasure, transposition: 0 })),
    transposed: false,
    evidenceGrade: "moderate",
    // rankScore = compressionRatio * compactness * coverage; compactness
    // fixed at 1 so `rank` alone controls ordering via compressionRatio.
    compressionRatio: rank,
    compactness: 1,
    coverage: 1,
  };
}

describe("selectDiverseTopN", () => {
  it("keeps one representative of a phase-shifted family plus a genuinely distinct pattern (the stormy-monday shape)", () => {
    const family1 = fakeGroup("leftHand", [[1, 10]], 3); // footprint {1..10}, highest rank
    const family2 = fakeGroup("leftHand", [[4, 13]], 2.5); // footprint {4..13} — 7/10 = 70% overlap with family1
    const distinct = fakeGroup("leftHand", [[50, 55]], 2); // footprint {50..55} — no overlap with either

    const kept = selectDiverseTopN([family1, family2, distinct], 8);

    expect(kept).toHaveLength(2);
    expect(kept).toContain(family1); // the higher-ranked family rep survives
    expect(kept).not.toContain(family2); // the redundant phase-shifted variant is dropped
    expect(kept).toContain(distinct); // the distinct pattern is NOT crowded out
  });

  it("does not drop a candidate for overlapping a DIFFERENT hand's footprint — voices aren't redundant with each other", () => {
    const leftHandFigure = fakeGroup("leftHand", [[1, 10]], 3);
    const rightHandMelody = fakeGroup("rightHand", [[1, 10]], 2); // same measures, different voice

    const kept = selectDiverseTopN([leftHandFigure, rightHandMelody], 8);
    expect(kept).toHaveLength(2);
  });

  it("keeps a candidate whose overlap with a kept group falls below the diversity floor", () => {
    const kept1 = fakeGroup("leftHand", [[1, 10]], 3); // footprint {1..10}, 10 measures
    const belowFloor = fakeGroup("leftHand", [[9, 18]], 2); // footprint {9..18} — 2/10 = 20% overlap

    const kept = selectDiverseTopN([kept1, belowFloor], 8);
    expect(kept).toHaveLength(2);
  });

  it("still respects the N cap when every candidate is mutually diverse", () => {
    const groups = Array.from({ length: 10 }, (_, i) => fakeGroup("leftHand", [[i * 10 + 1, i * 10 + 5]], 10 - i));
    const kept = selectDiverseTopN(groups, 8);
    expect(kept).toHaveLength(8);
    expect(kept[0]).toBe(groups[0]); // still rank-ordered, highest first
  });
});

// ─── Determinism ────────────────────────────────────────────────────────────

describe("analyzePatterns — determinism", () => {
  it("is byte-identical across repeated calls on the same input", () => {
    const phrase = "C4:q E4:q G4:q C5:q";
    const measures = [m(1, phrase, "G3:q B3:q D4:q G4:q"), m(2, "R:w", "R:w"), m(3, phrase, "A3:q C#4:q E4:q A4:q")];
    const first = analyzePatterns(measures);
    const second = analyzePatterns(measures);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
