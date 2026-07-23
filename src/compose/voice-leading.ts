// ─── Compose: the deterministic voice-leading verifier (the admission gate) ───
//
// Lane 2 of the Music Wing arc (docs/music-wing-professional-arc.md): the field
// draws a clean line — WELL-FORMEDNESS / PROHIBITION rules are deterministic
// gates; PREFERENCE / reduction rules are heuristic and go BEHIND the gate as a
// scorer (Huron 2001 Tone and Voice; Tymoczko 2006 Science 313:72; Anders &
// Miranda 2011). This module is the gate: the deterministic prohibition set over
// an N-voice realization. The scorer (smoothness, doubling, form) is a SEPARATE
// module (scorer.ts) — taste never gates.
//
// It mirrors verify-harmony.ts: a structured verdict (admitted boolean + per-rule
// detail + warnings), pure and deterministic (no LLM, no HTTP). It extends the
// maker's single-chord fidelity verifier to PART-WRITING BETWEEN chords.
//
// Design decisions, made to keep the instrument HONEST (a hard gate that rejects
// valid music is a broken instrument — validate-instrument-before-paid-runs):
//   • Voices are RANK-ASSIGNED by pitch per frame by default (bass = lowest), so
//     within-frame crossing cannot occur by construction; inter-frame overlap,
//     parallels, spacing, and tendency-resolution are all well-defined on the
//     rank identity. Set assignVoicesByPitch:false to treat the emitted order as
//     persistent voice identity — then crossing IS a hard gate.
//   • RANGE defaults to "warn", not "gate": SATB vocal tessitura is a choral
//     constraint that does not apply to a piano atelier, so it must not
//     false-reject instrumental realizations. It is available as a hard gate
//     (rangeMode:"gate") for choral work.
//   • Tendency-tone gates are TIGHTLY conditioned (7th resolves down OR is held
//     as a common tone; the leading tone is hard-gated only in the SOPRANO on a
//     dominant→tonic move — inner-voice frustrated resolution is a warning, not a
//     fail) so they fire on real violations, not on valid part-writing. The
//     instrument-validation tests prove a correct textbook cadence passes ALL
//     hard gates and inserted faults fail the specific rule.
// ─────────────────────────────────────────────────────────────────────────────

import { parseChordSymbol } from "../maker/verify-harmony.js";
import type { Realization, RealizedFrame } from "./types.js";

// ─── Verdict types ────────────────────────────────────────────────────────────

/** The hard-gate rules (each contributes to `admitted`). */
export type VLRule =
  | "structure" // consistent voice count (only when requireVoiceCount is set)
  | "chordMembership" // every voiced pitch spells its chord
  | "parallels" // no parallel/similar perfect 5ths or 8ves
  | "hidden" // no direct/hidden 5th/8ve into the outer pair by leap
  | "overlap" // no voice overlap between consecutive frames
  | "spacing" // adjacent upper voices ≤ an octave
  | "crossing" // no voice crossing (ordered mode only)
  | "tendencySeventh" // chordal 7th resolves down by step (or is held)
  | "tendencyLeadingTone"; // soprano leading tone resolves up on V→I

export interface VLViolation {
  rule: VLRule;
  /** Frame (1-based measure) the violation is anchored to. */
  atMeasure: number;
  /** The following frame for a between-frame rule (parallels, overlap, tendency). */
  toMeasure?: number;
  /** Human-readable detail. */
  detail: string;
}

export interface VLRuleResult {
  pass: boolean;
  violations: VLViolation[];
}

export interface VoiceLeadingVerdict {
  /** True iff every HARD gate passes. */
  admitted: boolean;
  /** The consistent voice count across sounding frames, or null if inconsistent. */
  voiceCount: number | null;
  /** Per-rule pass/fail + violations, keyed by rule. */
  hardGates: Record<VLRule, VLRuleResult>;
  /** INFORMATIONAL: total absolute semitone motion across all voices & transitions. */
  totalMotion: number;
  /** INFORMATIONAL: mean motion per voice per transition (null when no transition). */
  meanMotionPerVoice: number | null;
  /** INFORMATIONAL: range-band exceedances (a gate only when rangeMode==="gate"). */
  rangeExceedances: VLViolation[];
  warnings: string[];
  summary: string;
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface VerifyVoiceLeadingOptions {
  /**
   * Assign voice identity by pitch rank per frame (default true → bass = lowest).
   * When false, the emitted order IS the voice identity and crossing is a gate.
   */
  assignVoicesByPitch?: boolean;
  /** "off" | "warn" (default) | "gate" — see the range note in the header. */
  rangeMode?: "off" | "warn" | "gate";
  /** Per-voice [minMidi, maxMidi] (low→high). Defaults to widened SATB for N=4. */
  ranges?: Array<[number, number]>;
  /** Max spacing (semitones) between adjacent UPPER voices. Default 12 (an octave). */
  maxUpperSpacing?: number;
  /** When set, every sounding frame must have exactly this many voices (structure gate). */
  requireVoiceCount?: number;
  /**
   * Rules to DEMOTE from hard gates to warnings for this call (still computed +
   * reported, just excluded from `admitted`). The DEFAULT is empty — the strict
   * common-practice set. This is the neutral mechanism for Session-2 style-
   * parameterization: a jazz/pop "lead-sheet" style relaxes {parallels,
   * tendencySeventh} (parallel voicings and non-resolving 7ths are idiomatic
   * there), a chorale style relaxes nothing. WHICH rules a named style relaxes is
   * a Session-2 design decision, not baked in here.
   */
  relaxRules?: VLRule[];
}

/** Widened SATB tessitura (MIDI), generous to avoid false rejects. */
const SATB_RANGES: Array<[number, number]> = [
  [40, 60], // Bass  E2–C4
  [48, 69], // Tenor C3–A4
  [55, 74], // Alto  G3–D5
  [60, 84], // Soprano C4–C6
];

// ─── Key parsing (for the leading-tone check) ─────────────────────────────────

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export interface ParsedKey {
  tonicPc: number;
  mode: "major" | "minor";
}

/** Parse "A minor" / "Bb major" into tonic pitch class + mode. */
export function parseKey(key: string): ParsedKey | null {
  const m = /^([A-G])(#|b)?\s+(major|minor)$/i.exec(key.trim());
  if (!m) return null;
  const [, letter, accidental, mode] = m;
  let tonicPc = LETTER_PC[letter.toUpperCase()];
  if (accidental === "#") tonicPc = (tonicPc + 1) % 12;
  if (accidental === "b") tonicPc = (tonicPc + 11) % 12;
  return { tonicPc, mode: mode.toLowerCase() as "major" | "minor" };
}

// ─── Small helpers ────────────────────────────────────────────────────────────

/** Interval class 0–11 between two MIDI pitches (0 = unison/octave, 7 = P5). */
function ic(a: number, b: number): number {
  return Math.abs(a - b) % 12;
}

const sign = (x: number): number => (x > 0 ? 1 : x < 0 ? -1 : 0);

/** The chordal 7th interval (9, 10, or 11) present in a chord, or null. */
function seventhInterval(intervals: number[]): number | null {
  for (const iv of [9, 10, 11]) if (intervals.includes(iv)) return iv;
  return null;
}

/** A "sounding" frame carries at least one voice. */
function isSounding(f: RealizedFrame): boolean {
  return f.voices.length > 0;
}

// ─── The verifier ─────────────────────────────────────────────────────────────

/**
 * Verify an N-voice realization against the deterministic voice-leading gate.
 * Same inputs → same verdict. No LLM, no HTTP. See the header for the rule set.
 */
export function verifyVoiceLeading(
  realization: Realization,
  options: VerifyVoiceLeadingOptions = {},
): VoiceLeadingVerdict {
  const assignByPitch = options.assignVoicesByPitch ?? true;
  const rangeMode = options.rangeMode ?? "warn";
  const maxUpperSpacing = options.maxUpperSpacing ?? 12;
  const warnings: string[] = [];

  // Normalize voice identity: sort ascending per frame (rank identity) or keep order.
  const frames: RealizedFrame[] = realization.frames.map((f) => ({
    ...f,
    voices: assignByPitch ? [...f.voices].sort((a, b) => a - b) : [...f.voices],
  }));

  const sounding = frames.filter(isSounding);
  const key = parseKey(realization.key);
  if (realization.key && !key) {
    warnings.push(`cannot parse key "${realization.key}" — leading-tone gate skipped`);
  }

  // Voice-count consistency across sounding frames.
  const counts = new Set(sounding.map((f) => f.voices.length));
  const voiceCount = counts.size === 1 ? [...counts][0] : null;

  const violations: Record<VLRule, VLViolation[]> = {
    structure: [],
    chordMembership: [],
    parallels: [],
    hidden: [],
    overlap: [],
    spacing: [],
    crossing: [],
    tendencySeventh: [],
    tendencyLeadingTone: [],
  };
  const rangeExceedances: VLViolation[] = [];

  // ── structure (only active when requireVoiceCount is set) ──
  if (options.requireVoiceCount != null) {
    for (const f of sounding) {
      if (f.voices.length !== options.requireVoiceCount) {
        violations.structure.push({
          rule: "structure",
          atMeasure: f.measure,
          detail: `m${f.measure}: ${f.voices.length} voices, expected ${options.requireVoiceCount}`,
        });
      }
    }
  }

  // ── per-frame gates: chord membership, spacing, crossing, range ──
  for (const f of frames) {
    if (!isSounding(f)) continue;
    const parsed = parseChordSymbol(f.chordSymbol);
    if (!parsed) {
      if (f.chordSymbol && f.chordSymbol !== "N/C") {
        warnings.push(`m${f.measure}: chord "${f.chordSymbol}" is outside the vocabulary — membership not checked`);
      }
    } else {
      const chordPcs = new Set(parsed.pcs);
      const offenders = f.voices.filter((v) => !chordPcs.has(v % 12));
      if (offenders.length > 0) {
        violations.chordMembership.push({
          rule: "chordMembership",
          atMeasure: f.measure,
          detail: `m${f.measure} (${f.chordSymbol}): non-chord pitch(es) ${offenders.join(", ")}`,
        });
      }
    }

    // spacing — adjacent UPPER voices ≤ maxUpperSpacing (bass pair exempt).
    for (let v = 1; v + 1 < f.voices.length; v++) {
      const gap = f.voices[v + 1] - f.voices[v];
      if (gap > maxUpperSpacing) {
        violations.spacing.push({
          rule: "spacing",
          atMeasure: f.measure,
          detail: `m${f.measure}: voices ${v}-${v + 1} span ${gap} semitones (> ${maxUpperSpacing})`,
        });
      }
    }

    // crossing — only meaningful when NOT rank-assigned (emitted order = identity).
    if (!assignByPitch) {
      for (let v = 0; v + 1 < f.voices.length; v++) {
        if (f.voices[v] > f.voices[v + 1]) {
          violations.crossing.push({
            rule: "crossing",
            atMeasure: f.measure,
            detail: `m${f.measure}: voice ${v} (${f.voices[v]}) is above voice ${v + 1} (${f.voices[v + 1]})`,
          });
        }
      }
    }

    // range — informational unless rangeMode === "gate".
    if (rangeMode !== "off") {
      const ranges = options.ranges ?? (f.voices.length === 4 ? SATB_RANGES : null);
      if (ranges) {
        for (let v = 0; v < f.voices.length && v < ranges.length; v++) {
          const [lo, hi] = ranges[v];
          if (f.voices[v] < lo || f.voices[v] > hi) {
            rangeExceedances.push({
              rule: "structure",
              atMeasure: f.measure,
              detail: `m${f.measure}: voice ${v} = ${f.voices[v]} outside [${lo}, ${hi}]`,
            });
          }
        }
      }
    }
  }

  // ── between-frame gates over consecutive SOUNDING pairs ──
  let totalMotion = 0;
  let motionTransitions = 0;
  for (let i = 0; i + 1 < sounding.length; i++) {
    const a = sounding[i];
    const b = sounding[i + 1];
    const n = Math.min(a.voices.length, b.voices.length);
    const equalN = a.voices.length === b.voices.length;

    // total motion (rank-paired up to the min count)
    if (equalN) {
      for (let v = 0; v < n; v++) totalMotion += Math.abs(b.voices[v] - a.voices[v]);
      motionTransitions += n;
    }

    // parallels + hidden + overlap need rank-paired identity → require equal N.
    if (equalN && n >= 2) {
      // parallels: every voice pair moving similarly into the same perfect interval class.
      for (let x = 0; x < n; x++) {
        for (let y = x + 1; y < n; y++) {
          const icA = ic(a.voices[x], a.voices[y]);
          const icB = ic(b.voices[x], b.voices[y]);
          if (icA !== icB) continue;
          if (icB !== 0 && icB !== 7) continue; // only P8/unison and P5
          const dx = b.voices[x] - a.voices[x];
          const dy = b.voices[y] - a.voices[y];
          if (dx === 0 || dy === 0) continue; // a common tone → oblique, not parallel
          if (sign(dx) !== sign(dy)) continue; // require similar/parallel motion
          violations.parallels.push({
            rule: "parallels",
            atMeasure: a.measure,
            toMeasure: b.measure,
            detail: `m${a.measure}→${b.measure}: parallel ${icB === 0 ? "octaves/unisons" : "fifths"} between voices ${x} and ${y}`,
          });
        }
      }

      // hidden/direct 5th or 8ve into the OUTER pair (0, n-1) by similar motion + soprano leap.
      const lo0 = a.voices[0];
      const hi0 = a.voices[n - 1];
      const lo1 = b.voices[0];
      const hi1 = b.voices[n - 1];
      const dLo = lo1 - lo0;
      const dHi = hi1 - hi0;
      const icOut = ic(lo1, hi1);
      if ((icOut === 0 || icOut === 7) && sign(dLo) === sign(dHi) && sign(dHi) !== 0 && Math.abs(dHi) > 2) {
        violations.hidden.push({
          rule: "hidden",
          atMeasure: a.measure,
          toMeasure: b.measure,
          detail: `m${a.measure}→${b.measure}: direct ${icOut === 0 ? "octave" : "fifth"} into the outer voices by similar motion with a leap in the top voice`,
        });
      }

      // overlap: a voice moves past an adjacent voice's PRIOR pitch.
      for (let v = 0; v + 1 < n; v++) {
        if (b.voices[v] > a.voices[v + 1]) {
          violations.overlap.push({
            rule: "overlap",
            atMeasure: a.measure,
            toMeasure: b.measure,
            detail: `m${a.measure}→${b.measure}: voice ${v} moves to ${b.voices[v]}, above voice ${v + 1}'s prior ${a.voices[v + 1]}`,
          });
        }
        if (b.voices[v + 1] < a.voices[v]) {
          violations.overlap.push({
            rule: "overlap",
            atMeasure: a.measure,
            toMeasure: b.measure,
            detail: `m${a.measure}→${b.measure}: voice ${v + 1} moves to ${b.voices[v + 1]}, below voice ${v}'s prior ${a.voices[v]}`,
          });
        }
      }
    } else if (!equalN) {
      warnings.push(
        `m${a.measure}→${b.measure}: voice counts differ (${a.voices.length} vs ${b.voices.length}) — ` +
          `parallels/overlap/tendency between them skipped`,
      );
    }

    // ── tendency-tone resolution — tracked by PITCH, not rank, so a resolution
    //    that reorders voices under rank-assignment cannot false-fire; the checks
    //    err toward ACCEPTANCE (the safe direction for an instrument). ──
    const pa = parseChordSymbol(a.chordSymbol);
    const pb = parseChordSymbol(b.chordSymbol);
    if (pa && pb && a.chordSymbol !== b.chordSymbol) {
      const nextPitches = new Set(b.voices);

      // chordal 7th resolves DOWN by step, or is held as a common tone.
      const sev = seventhInterval(pa.intervals);
      if (sev != null) {
        const seventhPc = (pa.rootPc + sev) % 12;
        const nextPcs = new Set(pb.pcs);
        for (const sPitch of a.voices.filter((p) => p % 12 === seventhPc)) {
          const steppedDown = nextPitches.has(sPitch - 1) || nextPitches.has(sPitch - 2);
          const held = nextPitches.has(sPitch) && nextPcs.has(sPitch % 12);
          if (!steppedDown && !held) {
            violations.tendencySeventh.push({
              rule: "tendencySeventh",
              atMeasure: a.measure,
              toMeasure: b.measure,
              detail: `m${a.measure}→${b.measure}: the 7th of ${a.chordSymbol} (pitch ${sPitch}) did not step down or hold`,
            });
          }
        }
      }

      // SOPRANO (top-sounding) leading tone resolves UP to the tonic on a
      // dominant→tonic move. Inner-voice frustrated resolution is a warning.
      if (key && a.voices.length > 0 && b.voices.length > 0) {
        const ltPc = (key.tonicPc + 11) % 12;
        const domPc = (key.tonicPc + 7) % 12;
        const chordIsDominant = (pa.rootPc === domPc || pa.rootPc === ltPc) && pa.pcs.includes(ltPc);
        const nextIsTonic = pb.rootPc === key.tonicPc;
        if (chordIsDominant && nextIsTonic) {
          const sopranoPitch = Math.max(...a.voices);
          if (sopranoPitch % 12 === ltPc) {
            const nextSoprano = Math.max(...b.voices);
            if (nextSoprano !== sopranoPitch + 1) {
              violations.tendencyLeadingTone.push({
                rule: "tendencyLeadingTone",
                atMeasure: a.measure,
                toMeasure: b.measure,
                detail: `m${a.measure}→${b.measure}: soprano leading tone (${sopranoPitch}) must resolve up a semitone to the tonic (${sopranoPitch + 1})`,
              });
            }
          }
          // inner-voice leading tone that does not rise → frustrated (allowed).
          for (const p of a.voices) {
            if (p !== sopranoPitch && p % 12 === ltPc && !nextPitches.has(p + 1)) {
              warnings.push(
                `m${a.measure}→${b.measure}: inner-voice leading tone (${p}) did not rise to the tonic (frustrated resolution — allowed)`,
              );
            }
          }
        }
      }
    }
  }

  // Range as a hard gate only when requested.
  if (rangeMode === "gate") {
    for (const r of rangeExceedances) violations.structure.push({ ...r });
  }

  // Assemble.
  const rules: VLRule[] = [
    "structure",
    "chordMembership",
    "parallels",
    "hidden",
    "overlap",
    "spacing",
    "crossing",
    "tendencySeventh",
    "tendencyLeadingTone",
  ];
  const relaxSet = new Set(options.relaxRules ?? []);
  const hardGates = {} as Record<VLRule, VLRuleResult>;
  for (const rule of rules) {
    hardGates[rule] = { pass: violations[rule].length === 0, violations: violations[rule] };
    // A relaxed rule is still computed + reported (its violations surface as
    // warnings), just excluded from `admitted`.
    if (relaxSet.has(rule)) {
      for (const v of violations[rule]) warnings.push(`[relaxed:${rule}] ${v.detail}`);
    }
  }
  // admitted ignores relaxed rules (default: no rules relaxed → strict).
  const admitted = rules.every((r) => relaxSet.has(r) || hardGates[r].pass);

  const failed = rules.filter((r) => !relaxSet.has(r) && !hardGates[r].pass);
  const summary = admitted
    ? `ADMITTED — clean part-writing across ${sounding.length} sounding frame(s)` +
      (voiceCount ? ` (${voiceCount} voices)` : "")
    : `REJECTED — ${failed.map((r) => `${r} (${hardGates[r].violations.length})`).join(", ")}`;

  return {
    admitted,
    voiceCount,
    hardGates,
    totalMotion,
    meanMotionPerVoice: motionTransitions > 0 ? totalMotion / motionTransitions : null,
    rangeExceedances,
    warnings,
    summary,
  };
}
