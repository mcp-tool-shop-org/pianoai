// ─── Maker: Harmony Verifier ─────────────────────────────────────────────────
//
// Deterministic verification of a proposed reharmonization against a melody —
// the productionized core of scripts/maker-loop-demo.ts (the maker loop:
// generate → VERIFY with the repo's own tools → render).
//
// The platform's existing tools are the verifier:
//   - chord fidelity goes through the same inferChord() that powers jam briefs
//   - note parsing goes through the note-parser used by playback
//
// Four checks, one structured verdict:
//   ① chord fidelity    — inferChord(voicing) must agree with the intended
//                          symbol (canonical pitch-class comparison, so "D#7"
//                          and "Eb7" match). HARD GATE.
//   ② melody consonance — every melody note over its measure's intended chord
//                          is labeled chord-tone / named tension / chromatic.
//                          Chromatic notes are allowed (passing tones are
//                          musical) up to maxChromaticRatio. HARD GATE.
//   ③ voice leading     — bass motion between consecutive voicings, reported
//                          as semitone moves + stepwise ratio. Informational.
//   ④ key membership    — harmony pitch classes vs the declared key.
//                          The raised 7th in minor keys is treated as diatonic
//                          (the leading tone is idiomatic, e.g. G# in A minor).
//                          Informational — borrowed tones are honestly flagged,
//                          never failed.
//
// The chord vocabulary is exactly what inferChord() can emit (maj, m, 7, maj7,
// m7, dim, m7b5, aug, sus4, sus2, plus the added-9ths add9, madd9 — over any
// root; the aliases M7/ø7/ø and slash chords like C/E are read as their base
// chord). A symbol outside that vocabulary cannot be confirmed by the repo's
// chord engine and honestly fails fidelity — the deterministic instrument's
// vocabulary IS the measurement boundary, by design.
// ─────────────────────────────────────────────────────────────────────────────

import { inferChord } from "../songs/jam.js";
import { safeParseHandString } from "../note-parser.js";
import type { ParseWarning } from "../types.js";

// ─── Input types ─────────────────────────────────────────────────────────────

/**
 * One measure of melody. Structurally compatible with the library's Measure
 * shape (`number` + `rightHand`), so `song.measures` can be passed directly.
 */
export interface MelodyMeasureInput {
  /** 1-based measure number. */
  number: number;
  /** Right-hand note tokens, e.g. "E5:e D#5:e" (rests "R" allowed). */
  rightHand: string;
}

/** One measure of the proposed reharmonization. */
export interface ReharmonizedMeasure {
  /** 1-based measure number this chord covers (joined on MelodyMeasureInput.number). */
  measure: number;
  /** The chord the maker intends, e.g. "Am7", "Fmaj7", "E7". */
  intendedChord: string;
  /** Left-hand voicing as note tokens, e.g. "A2 C3 E3 G3" or "A2+C3+E3:h". */
  voicing: string;
}

export interface VerifyHarmonyOptions {
  /** Key for the membership check, e.g. "A minor", "Bb major". Optional. */
  key?: string;
  /**
   * Maximum fraction of melody notes allowed to be chromatic (neither chord
   * tone nor named tension) before consonance fails. Default 0.2.
   */
  maxChromaticRatio?: number;
}

// ─── Verdict types ───────────────────────────────────────────────────────────

export interface ChordFidelityMeasure {
  measure: number;
  intended: string;
  detected: string;
  match: boolean;
}

export type ConsonanceKind = "chord-tone" | "tension" | "chromatic";

export interface ConsonanceLabel {
  /** Pitch-class name of the melody note, e.g. "D#". */
  note: string;
  midi: number;
  kind: ConsonanceKind;
  /** Tension name when kind === "tension", e.g. "9th", "#11". */
  tension?: string;
}

export interface ConsonanceMeasure {
  measure: number;
  chord: string;
  labels: ConsonanceLabel[];
  /** Present when the intended chord is outside the verifier vocabulary. */
  notEvaluated?: string;
}

export interface VoiceLeadingMove {
  fromMeasure: number;
  toMeasure: number;
  fromBass: string;
  toBass: string;
  /** Shortest chromatic distance between the bass pitch classes (0-6). */
  semitones: number;
}

export interface HarmonyVerdict {
  /** True iff chord fidelity AND consonance hard gates both pass. */
  verified: boolean;
  chordFidelity: {
    pass: boolean;
    matched: number;
    total: number;
    perMeasure: ChordFidelityMeasure[];
  };
  consonance: {
    pass: boolean;
    chordTones: number;
    tensions: number;
    chromatic: number;
    /** chromatic / (chordTones + tensions + chromatic); 0 when no notes scored. */
    chromaticRatio: number;
    maxChromaticRatio: number;
    perMeasure: ConsonanceMeasure[];
  };
  voiceLeading: {
    moves: VoiceLeadingMove[];
    maxLeapSemitones: number | null;
    /** Fraction of bass moves ≤ 2 semitones (null when fewer than 2 voicings). */
    stepwiseRatio: number | null;
  };
  keyMembership: {
    computable: boolean;
    key?: string;
    /** Harmony pitch classes outside the key (raised 7th in minor excluded). */
    outsideKey: string[];
    allDiatonic?: boolean;
    reason?: string;
  };
  warnings: string[];
  summary: string;
}

// ─── Pitch / chord-symbol helpers ────────────────────────────────────────────

const PC_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

const LETTER_PC: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/**
 * Chord suffix → intervals from root. Mirrors the template vocabulary of
 * inferChord() in songs/jam.ts — this is the closed set the repo's chord
 * engine can detect, and therefore the set this verifier can confirm.
 */
const SUFFIX_INTERVALS: Record<string, number[]> = {
  "": [0, 4, 7],
  m: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dim: [0, 3, 6],
  m7b5: [0, 3, 6, 10],
  aug: [0, 4, 8],
  sus4: [0, 5, 7],
  sus2: [0, 2, 7],
  // Extended chords (added 2026-07-22) — kept in lockstep with CHORD_TEMPLATES in
  // songs/jam.ts so the voicer renders exactly what inferChord can confirm. Only
  // the added-9ths (no 7th) are here: 6/m6 and the 9/maj9/m9 (9th WITH a 7th)
  // collide with another chord's pitch-class set under a rootless engine, so they
  // cannot round-trip (see the note in jam.ts). Slash chords → parseChordSymbol.
  add9: [0, 4, 7, 2],
  madd9: [0, 3, 7, 2],
  // Notation aliases for chords the base model actually emits (measured — see
  // the chord-emission diagnostic): "M7" for maj7 and "ø7"/"ø" for m7b5
  // (half-diminished). These map onto EXISTING intervals, so they round-trip with
  // zero risk — inferChord still emits the canonical "maj7"/"m7b5", and
  // chordSymbolsEquivalent bridges the two. (dim7 and the 9th-with-7th chords the
  // base also emits stay unsupported: dim7 is rotationally symmetric, the 9ths
  // hit the rootless-upper-structure wall — both need a bass-aware engine.)
  M7: [0, 4, 7, 11],
  "ø7": [0, 3, 6, 10],
  "ø": [0, 3, 6, 10],
};

/**
 * Standard jazz tensions by interval-from-root, matching the maker-loop demo.
 * Intervals already in the chord are labeled chord-tone before this applies.
 */
const TENSION_NAME: Record<number, string> = {
  1: "b9", 2: "9th", 3: "#9", 5: "11th", 6: "#11", 8: "b13", 9: "13th",
};

export interface ParsedChordSymbol {
  rootPc: number;
  suffix: string;
  intervals: number[];
  /** Pitch classes of the chord tones. */
  pcs: number[];
}

/**
 * Parse a chord symbol ("Am7", "Ebmaj7", "F#m7b5") into root + intervals.
 * Returns null for symbols outside the verifier vocabulary.
 */
export function parseChordSymbol(symbol: string): ParsedChordSymbol | null {
  const trimmed = symbol.trim();
  // Slash chord "Chord/Bass" (e.g. "C/E", "Am7/G"): the bass note is a voicing /
  // inversion detail the pitch-class chord engine cannot confirm, so parse the
  // base chord and drop the bass. "C/E" ≡ "C" — same harmony, different
  // inversion — so the model's slash output is accepted (as its base quality)
  // rather than rejected as out-of-vocabulary.
  const base = trimmed.includes("/") ? trimmed.slice(0, trimmed.indexOf("/")).trim() : trimmed;
  const match = /^([A-G])(#|b)?(.*)$/.exec(base);
  if (!match) return null;
  const [, letter, accidental, suffix] = match;
  let rootPc = LETTER_PC[letter];
  if (accidental === "#") rootPc = (rootPc + 1) % 12;
  if (accidental === "b") rootPc = (rootPc + 11) % 12;
  const intervals = SUFFIX_INTERVALS[suffix];
  if (!intervals) return null;
  return {
    rootPc,
    suffix,
    intervals,
    pcs: intervals.map((iv) => (rootPc + iv) % 12),
  };
}

/**
 * Canonical chord-symbol equivalence: same root pitch class + same intervals.
 * "D#7" ≡ "Eb7"; "C" ≢ "Cm". Unparseable symbols are never equivalent.
 */
export function chordSymbolsEquivalent(a: string, b: string): boolean {
  const pa = parseChordSymbol(a);
  const pb = parseChordSymbol(b);
  if (!pa || !pb) return false;
  return (
    pa.rootPc === pb.rootPc &&
    pa.intervals.length === pb.intervals.length &&
    pa.intervals.every((iv, i) => iv === pb.intervals[i])
  );
}

/** Nominal BPM for note parsing — durations are irrelevant to pitch analysis. */
const NOMINAL_BPM = 120;

/** Extract sounding MIDI numbers from a hand string via the platform parser. */
function handStringToMidis(
  handStr: string,
  measureNumber: number,
  hand: "right" | "left",
  warnings: ParseWarning[],
): number[] {
  const beats = safeParseHandString(handStr, hand, NOMINAL_BPM, measureNumber, warnings);
  const midis: number[] = [];
  for (const beat of beats) {
    for (const note of beat.notes) {
      if (note.note >= 0) midis.push(note.note); // skip rests (-1)
    }
  }
  return midis;
}

// ─── Key parsing ─────────────────────────────────────────────────────────────

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

/**
 * Parse "A minor" / "Bb major" into the set of diatonic pitch classes.
 * Minor keys include the raised 7th (leading tone) as idiomatic.
 */
export function keyToPitchClasses(key: string): Set<number> | null {
  const match = /^([A-G])(#|b)?\s+(major|minor)$/i.exec(key.trim());
  if (!match) return null;
  const [, letter, accidental, mode] = match;
  let tonic = LETTER_PC[letter.toUpperCase()];
  if (accidental === "#") tonic = (tonic + 1) % 12;
  if (accidental === "b") tonic = (tonic + 11) % 12;
  const scale = mode.toLowerCase() === "major" ? MAJOR_SCALE : NATURAL_MINOR_SCALE;
  const pcs = new Set(scale.map((iv) => (tonic + iv) % 12));
  if (mode.toLowerCase() === "minor") pcs.add((tonic + 11) % 12); // raised 7th
  return pcs;
}

// ─── The verifier ────────────────────────────────────────────────────────────

/** Default ceiling on the chromatic fraction of melody notes. */
export const DEFAULT_MAX_CHROMATIC_RATIO = 0.2;

/**
 * Verify a proposed reharmonization against a melody.
 *
 * Deterministic: same inputs always produce the same verdict. No LLM calls.
 */
export function verifyHarmony(
  melody: MelodyMeasureInput[],
  reharmonization: ReharmonizedMeasure[],
  options: VerifyHarmonyOptions = {},
): HarmonyVerdict {
  const warnings: string[] = [];
  const parseWarnings: ParseWarning[] = [];
  const maxChromaticRatio = options.maxChromaticRatio ?? DEFAULT_MAX_CHROMATIC_RATIO;

  const melodyByMeasure = new Map<number, MelodyMeasureInput>();
  for (const m of melody) melodyByMeasure.set(m.number, m);

  if (reharmonization.length === 0) {
    warnings.push("reharmonization is empty — nothing to verify");
  }

  // ── ① chord fidelity ──
  const fidelityPerMeasure: ChordFidelityMeasure[] = [];
  for (const r of reharmonization) {
    const detected = inferChord(r.voicing);
    const match = chordSymbolsEquivalent(r.intendedChord, detected);
    if (!parseChordSymbol(r.intendedChord)) {
      warnings.push(
        `m${r.measure}: intended chord "${r.intendedChord}" is outside the verifier vocabulary ` +
          `(supported suffixes: maj, m, 7, maj7, m7, dim, m7b5, aug, sus4, sus2, add9, madd9; ` +
          `aliases M7=maj7, ø7/ø=m7b5; slash chords like C/E are read as their base chord) — cannot be confirmed`,
      );
    }
    fidelityPerMeasure.push({
      measure: r.measure,
      intended: r.intendedChord,
      detected,
      match,
    });
  }
  const matched = fidelityPerMeasure.filter((f) => f.match).length;
  const fidelityPass = reharmonization.length > 0 && matched === fidelityPerMeasure.length;

  // ── ② melody consonance ──
  const consonancePerMeasure: ConsonanceMeasure[] = [];
  let chordTones = 0;
  let tensions = 0;
  let chromatic = 0;
  for (const r of reharmonization) {
    const mel = melodyByMeasure.get(r.measure);
    if (!mel) {
      warnings.push(`m${r.measure}: no melody measure provided — consonance not evaluated`);
      continue;
    }
    const chord = parseChordSymbol(r.intendedChord);
    if (!chord) {
      consonancePerMeasure.push({
        measure: r.measure,
        chord: r.intendedChord,
        labels: [],
        notEvaluated: `unknown chord symbol "${r.intendedChord}"`,
      });
      continue;
    }
    const midis = handStringToMidis(mel.rightHand, mel.number, "right", parseWarnings);
    const labels: ConsonanceLabel[] = midis.map((midi) => {
      const pc = midi % 12;
      if (chord.pcs.includes(pc)) {
        chordTones++;
        return { note: PC_NAMES[pc], midi, kind: "chord-tone" as const };
      }
      const iv = (pc - chord.rootPc + 12) % 12;
      const tension = TENSION_NAME[iv];
      if (tension) {
        tensions++;
        return { note: PC_NAMES[pc], midi, kind: "tension" as const, tension };
      }
      chromatic++;
      return { note: PC_NAMES[pc], midi, kind: "chromatic" as const };
    });
    consonancePerMeasure.push({ measure: r.measure, chord: r.intendedChord, labels });
  }
  const scoredNotes = chordTones + tensions + chromatic;
  const chromaticRatio = scoredNotes > 0 ? chromatic / scoredNotes : 0;
  const consonancePass = chromaticRatio <= maxChromaticRatio;

  const uncovered = melody.filter((m) => !reharmonization.some((r) => r.measure === m.number));
  if (uncovered.length > 0) {
    warnings.push(
      `melody measures without a reharmonization chord (not scored): ` +
        uncovered.map((m) => m.number).join(", "),
    );
  }

  // ── ③ voice leading (informational) ──
  const moves: VoiceLeadingMove[] = [];
  const sorted = [...reharmonization].sort((a, b) => a.measure - b.measure);
  for (let i = 1; i < sorted.length; i++) {
    const prevMidis = handStringToMidis(sorted[i - 1].voicing, sorted[i - 1].measure, "left", parseWarnings);
    const currMidis = handStringToMidis(sorted[i].voicing, sorted[i].measure, "left", parseWarnings);
    if (prevMidis.length === 0 || currMidis.length === 0) continue;
    const fromPc = Math.min(...prevMidis) % 12;
    const toPc = Math.min(...currMidis) % 12;
    const up = (toPc - fromPc + 12) % 12;
    const down = (fromPc - toPc + 12) % 12;
    moves.push({
      fromMeasure: sorted[i - 1].measure,
      toMeasure: sorted[i].measure,
      fromBass: PC_NAMES[fromPc],
      toBass: PC_NAMES[toPc],
      semitones: Math.min(up, down),
    });
  }
  const maxLeapSemitones = moves.length > 0 ? Math.max(...moves.map((m) => m.semitones)) : null;
  const stepwiseRatio =
    moves.length > 0 ? moves.filter((m) => m.semitones <= 2).length / moves.length : null;

  // ── ④ key membership (informational) ──
  let keyMembership: HarmonyVerdict["keyMembership"];
  if (options.key) {
    const keyPcs = keyToPitchClasses(options.key);
    if (!keyPcs) {
      keyMembership = {
        computable: false,
        key: options.key,
        outsideKey: [],
        reason: `cannot parse key "${options.key}" — expected e.g. "A minor" or "Bb major"`,
      };
    } else {
      const harmonyPcs = new Set<number>();
      for (const r of reharmonization) {
        for (const midi of handStringToMidis(r.voicing, r.measure, "left", parseWarnings)) {
          harmonyPcs.add(midi % 12);
        }
      }
      const outside = [...harmonyPcs].filter((pc) => !keyPcs.has(pc)).map((pc) => PC_NAMES[pc]);
      keyMembership = {
        computable: true,
        key: options.key,
        outsideKey: outside,
        allDiatonic: outside.length === 0,
      };
    }
  } else {
    keyMembership = { computable: false, outsideKey: [], reason: "no key provided" };
  }

  for (const w of parseWarnings) {
    warnings.push(`${w.location}: bad token "${w.token}" — ${w.message}`);
  }

  const verified = fidelityPass && consonancePass;
  const failureParts: string[] = [];
  if (!fidelityPass) {
    failureParts.push(
      `chord fidelity ${matched}/${fidelityPerMeasure.length}` +
        (reharmonization.length === 0 ? " (empty reharmonization)" : ""),
    );
  }
  if (!consonancePass) {
    failureParts.push(`chromatic ratio ${chromaticRatio.toFixed(3)} > ${maxChromaticRatio}`);
  }
  const summary = verified
    ? `VERIFIED — ${matched}/${fidelityPerMeasure.length} chords confirmed by the chord engine; ` +
      `${chordTones} chord tones, ${tensions} tensions, ${chromatic} chromatic ` +
      `(ratio ${chromaticRatio.toFixed(3)} ≤ ${maxChromaticRatio})`
    : `REJECTED — ${failureParts.join("; ")}`;

  return {
    verified,
    chordFidelity: {
      pass: fidelityPass,
      matched,
      total: fidelityPerMeasure.length,
      perMeasure: fidelityPerMeasure,
    },
    consonance: {
      pass: consonancePass,
      chordTones,
      tensions,
      chromatic,
      chromaticRatio,
      maxChromaticRatio,
      perMeasure: consonancePerMeasure,
    },
    voiceLeading: { moves, maxLeapSemitones, stepwiseRatio },
    keyMembership,
    warnings,
    summary,
  };
}

// ─── Human-readable rendering (for the MCP tool response) ────────────────────

/** Format a verdict as the readable report the maker-loop demo printed. */
export function formatHarmonyVerdict(verdict: HarmonyVerdict): string {
  const lines: string[] = [];

  lines.push("VERIFY ① chord fidelity — chord engine vs the maker's intent:");
  for (const f of verdict.chordFidelity.perMeasure) {
    lines.push(
      `  m${f.measure}: intended ${f.intended} → detected ${f.detected} ${f.match ? "✓" : "✗ MISMATCH"}`,
    );
  }
  lines.push(
    `  → ${verdict.chordFidelity.matched}/${verdict.chordFidelity.total} voicings confirmed`,
    "",
  );

  lines.push("VERIFY ② melody consonance (chord tone / tension / chromatic):");
  for (const c of verdict.consonance.perMeasure) {
    if (c.notEvaluated) {
      lines.push(`  m${c.measure} over ${c.chord}: not evaluated — ${c.notEvaluated}`);
      continue;
    }
    const labelText = c.labels
      .map((l) =>
        `${l.note}=${l.kind === "tension" ? l.tension : l.kind === "chord-tone" ? "tone" : "chromatic"}`,
      )
      .join(", ");
    lines.push(`  m${c.measure} over ${c.chord}: ${labelText || "(no melody notes)"}`);
  }
  lines.push(
    `  → ${verdict.consonance.chordTones} chord tones, ${verdict.consonance.tensions} tensions, ` +
      `${verdict.consonance.chromatic} chromatic (ratio ${verdict.consonance.chromaticRatio.toFixed(3)})`,
    "",
  );

  if (verdict.voiceLeading.moves.length > 0) {
    lines.push("VERIFY ③ bass voice-leading:");
    lines.push(
      "  " +
        verdict.voiceLeading.moves
          .map((m) => `${m.fromBass}→${m.toBass} (${m.semitones}st)`)
          .join("  ·  "),
    );
    lines.push("");
  }

  if (verdict.keyMembership.computable) {
    lines.push(
      `VERIFY ④ key (${verdict.keyMembership.key}): ` +
        (verdict.keyMembership.allDiatonic
          ? "all diatonic"
          : `borrowed: ${verdict.keyMembership.outsideKey.join(", ")}`),
      "",
    );
  }

  if (verdict.warnings.length > 0) {
    lines.push("Warnings:");
    for (const w of verdict.warnings) lines.push(`  - ${w}`);
    lines.push("");
  }

  lines.push(`VERDICT: ${verdict.verified ? "✅" : "❌"} ${verdict.summary}`);
  return lines.join("\n");
}
