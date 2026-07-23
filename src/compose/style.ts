// ─── Compose: named style profiles (the thin control surface over the gate) ───
//
// Phase 2, Session 2, Thread A (the study-swarm grounding is in the S2 kickoff
// memory; cite by finding number where a choice is load-bearing). Session 1
// measured that the strict common-practice gate applies a CHORALE rulebook to
// lead-sheet genres: the near-zero admit-rate is dominated by `parallels` (7/10)
// and `tendencySeventh` (5/10) — both IDIOMATIC, not errors, in jazz/pop/blues/
// rock — and demoting exactly those two takes the deterministic leader 1/10→9/10.
//
// The evidence is unanimous that style is NEITHER hard toggles alone NOR more
// hard rules — it is a small HARD FLOOR + a soft preference layer, with named
// presets as a thin control surface (Anders & Miranda 2011, finding 7; Diatony /
// Sprockeels & Van Roy IJCAI 2024, finding 8 — the SOTA CP-for-harmony system is
// exactly hard-floor + tunable preferences + user control; Ebcioğlu 1990,
// finding 10 — do NOT encode style as more hard rules). So this module defines
// the PARTITION and the presets; the soft style-cost lives in the scorer (A2), a
// ranking signal never a gate (finding 9).
//
// The partition (finding 4, Tymoczko 2011 — conjunct voice leading is the cross-
// style INVARIANT; the parallel-perfect prohibition is common-practice-SPECIFIC):
//   • HARD FLOOR (style-invariant, NEVER relaxed by any preset): structure,
//     chordMembership, spacing, overlap, crossing, leap (the no-wild-leap
//     smoothness bound). These hold in every style — a voicing that violates one
//     is malformed, not "in another idiom."
//   • STYLE-GATED (a preset MAY demote to a warning): parallels, hidden,
//     tendencySeventh, tendencyLeadingTone — the common-practice-specific devices.
//
// The DEFAULT is `common-practice` (relax nothing) — never relax by default, the
// anti-Goodhart discipline: a style is an OPT-IN yardstick, chosen deliberately.
// ─────────────────────────────────────────────────────────────────────────────

import type { VLRule } from "./voice-leading.js";

/**
 * The style-INVARIANT hard floor — rules that hold in every style and can never
 * be relaxed by a preset (finding 4). A malformed voicing (a non-chord tone, a
 * >octave gap, an overlap, a wild leap) is wrong in ANY idiom, not merely
 * un-idiomatic. Enforced by validateProfile: a preset that names one of these in
 * its relaxRules is a construction error.
 */
export const HARD_FLOOR_RULES: readonly VLRule[] = [
  "structure",
  "chordMembership",
  "spacing",
  "overlap",
  "crossing",
  "leap",
] as const;

/**
 * The style-GATED rules — the common-practice-specific prohibitions a named style
 * may demote to a warning. `parallels`/`hidden` are the parallel/direct-perfect
 * bans (findings 1, 4); the tendency rules are the obligatory-resolution devices
 * (findings 2, 3, 5). Everything relaxable lives here; the presets choose subsets.
 */
export const STYLE_GATED_RULES: readonly VLRule[] = [
  "parallels",
  "hidden",
  "tendencySeventh",
  "tendencyLeadingTone",
] as const;

/** The built-in preset names. A profile object with any name is still accepted. */
export type StyleName = "common-practice" | "lead-sheet" | "film-ambient";

/**
 * A named yardstick for the admission gate: which style-gated rules it demotes to
 * warnings. It is deliberately thin — the taste of a style (its typical voicings,
 * spacing, motion) lives in the soft scorer cost (A2), not here (findings 7–9).
 */
export interface StyleProfile {
  /** The style's name (surfaced in reports/receipts). */
  name: StyleName | string;
  /** One-line rationale (what idiom, why these rules). */
  note: string;
  /** Style-gated rules demoted from hard gates to warnings. MUST be a subset of
   *  STYLE_GATED_RULES (validated) — a preset can never relax the hard floor. */
  relaxRules: VLRule[];
}

/**
 * The built-in presets. DEFAULT is common-practice (relax nothing).
 *   • common-practice — the chorale rulebook; the strict yardstick, relax nothing.
 *   • lead-sheet — jazz/pop/blues/rock: relax {parallels, tendencySeventh}. This is
 *     EXACTLY the Session-1 measured counterfactual (parallel voicings + non-
 *     resolving 7ths are the idiom; findings 1–3), reproducing the 1/10→9/10 lift.
 *   • film-ambient — planing / parallel 7th-chord glides: relax ALL four style-
 *     gated rules (planing moves complete chords in parallel with no obligatory
 *     resolution; finding 1 corroborators). The loosest voice-leading yardstick,
 *     still floored by membership/spacing/overlap/leap.
 */
export const STYLE_PROFILES: Record<StyleName, StyleProfile> = {
  "common-practice": {
    name: "common-practice",
    note: "the chorale rulebook — relax nothing (the strict default; anti-Goodhart)",
    relaxRules: [],
  },
  "lead-sheet": {
    name: "lead-sheet",
    note: "jazz/pop/blues/rock — parallel voicings + non-resolving 7ths are idiomatic (findings 1–3)",
    relaxRules: ["parallels", "tendencySeventh"],
  },
  "film-ambient": {
    name: "film-ambient",
    note: "planing / parallel 7th-chord glides — no obligatory resolution (finding 1 corroborators)",
    relaxRules: ["parallels", "hidden", "tendencySeventh", "tendencyLeadingTone"],
  },
};

/** The default yardstick — common-practice (never relax by default). */
export const DEFAULT_STYLE: StyleName = "common-practice";

/**
 * Assert a profile only relaxes style-gated rules — never the hard floor. A
 * preset that tries to relax `chordMembership`/`overlap`/`leap`/… is a
 * construction error (the whole point of the partition; ANDON discipline). Throws
 * a structured Error naming the offending rules.
 */
export function validateProfile(profile: StyleProfile): void {
  const gated = new Set<VLRule>(STYLE_GATED_RULES);
  const illegal = profile.relaxRules.filter((r) => !gated.has(r));
  if (illegal.length > 0) {
    throw new Error(
      `style "${profile.name}" cannot relax hard-floor rule(s) [${illegal.join(", ")}] — ` +
        `only style-gated rules [${STYLE_GATED_RULES.join(", ")}] may be relaxed`,
    );
  }
}

/**
 * Resolve a style argument to a validated StyleProfile.
 *   • undefined            → the default common-practice profile (relax nothing).
 *   • a StyleName string   → the matching built-in preset (throws on an unknown name).
 *   • a StyleProfile object → itself, after the hard-floor validation.
 */
export function resolveStyle(style?: StyleName | StyleProfile): StyleProfile {
  if (style == null) return STYLE_PROFILES[DEFAULT_STYLE];
  if (typeof style === "string") {
    const preset = STYLE_PROFILES[style as StyleName];
    if (!preset) {
      throw new Error(
        `unknown style "${style}" — known presets: ${Object.keys(STYLE_PROFILES).join(", ")} ` +
          `(or pass a StyleProfile object)`,
      );
    }
    return preset;
  }
  validateProfile(style);
  return style;
}
