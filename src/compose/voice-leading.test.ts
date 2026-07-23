// ─── Tests: the deterministic voice-leading verifier ─────────────────────────
//
// Two kinds of test, both load-bearing for an HONEST instrument:
//   1. INSTRUMENT VALIDATION — a correct textbook realization passes ALL hard
//      gates (no false rejects), and targeted faults fail their SPECIFIC rule.
//      A gate that rejects valid music is a broken instrument
//      (validate-instrument-before-paid-runs).
//   2. RULE UNIT TESTS — each rule fires on a minimal crafted violation.
//
// All voicings are real scientific-pitch strings parsed by the platform note
// parser, so the fixtures are auditable by ear.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { verifyVoiceLeading, parseKey } from "./voice-leading.js";
import { frameFromVoicing, parseVoicing, type Realization } from "./types.js";

/** Build a realization from [measure, chord, voicing] tuples. */
function realize(key: string, frames: Array<[number, string, string]>): Realization {
  return { key, frames: frames.map(([m, c, v]) => frameFromVoicing(m, c, v)) };
}

// ─── Instrument validation: clean part-writing is ADMITTED ───────────────────

describe("verifyVoiceLeading — clean part-writing is admitted (no false rejects)", () => {
  it("admits a correct I–V–I in C major with the leading tone resolving up", () => {
    // C: C3 E3 G3 C4  →  V(G): G2 D3 G3 B3  →  I(C): C3 E3 G3 C4
    // Soprano B3(leading tone) → C4 (up a semitone). Bass leaps, no parallels.
    const r = realize("C major", [
      [1, "C", "C3 E3 G3 C4"],
      [2, "G", "G2 D3 G3 B3"],
      [3, "C", "C3 E3 G3 C4"],
    ]);
    const v = verifyVoiceLeading(r);
    expect(v.admitted, v.summary).toBe(true);
    expect(v.voiceCount).toBe(4);
    // every hard gate individually passes
    for (const [rule, res] of Object.entries(v.hardGates)) {
      expect(res.pass, `${rule}: ${res.violations.map((x) => x.detail).join("; ")}`).toBe(true);
    }
    // informational motion is reported
    expect(v.totalMotion).toBeGreaterThan(0);
    expect(v.meanMotionPerVoice).not.toBeNull();
  });

  it("admits a correct G7→C where the 7th (F) resolves down to E", () => {
    // G7: G2 F3 B3 D4  →  C: C3 E3 C4 E4  (F→E down, B→C up)
    const r = realize("C major", [
      [1, "G7", "G2 F3 B3 D4"],
      [2, "C", "C3 E3 C4 E4"],
    ]);
    const v = verifyVoiceLeading(r);
    expect(v.admitted, v.summary).toBe(true);
    expect(v.hardGates.tendencySeventh.pass).toBe(true);
    expect(v.hardGates.parallels.pass).toBe(true);
  });
});

// ─── Rule unit tests: each violation fires its own rule ──────────────────────

describe("verifyVoiceLeading — parallels", () => {
  it("flags parallel fifths and octaves when a block moves in parallel", () => {
    // C(C3 E3 G3 C4) → Dm(D3 F3 A3 D4): every voice +2, so the P5 and P8 pairs
    // move in parallel.
    const r = realize("C major", [
      [1, "C", "C3 E3 G3 C4"],
      [2, "Dm", "D3 F3 A3 D4"],
    ]);
    const v = verifyVoiceLeading(r);
    expect(v.admitted).toBe(false);
    expect(v.hardGates.parallels.violations.length).toBeGreaterThan(0);
  });

  it("does NOT flag parallels when common tones make the motion oblique", () => {
    // C(C3 E3 G3) → Am/C(C3 E3 A3): bass C3 and E3 are held (oblique), only the
    // top voice moves G3→A3, so there are no parallel perfects.
    const r = realize("C major", [
      [1, "C", "C3 E3 G3"],
      [2, "Am", "C3 E3 A3"],
    ]);
    const v = verifyVoiceLeading(r);
    expect(v.hardGates.parallels.pass).toBe(true);
  });
});

describe("verifyVoiceLeading — spacing", () => {
  it("flags adjacent upper voices more than an octave apart", () => {
    // C3 E3 G3 E5 — the top two voices (G3, E5) span 21 semitones.
    const r = realize("C major", [[1, "C", "C3 E3 G3 E5"]]);
    const v = verifyVoiceLeading(r);
    expect(v.admitted).toBe(false);
    expect(v.hardGates.spacing.violations.length).toBeGreaterThan(0);
    // the bass–tenor pair is exempt: a wide bass gap alone is fine.
    const wideBass = realize("C major", [[1, "C", "C2 E3 G3 C4"]]);
    expect(verifyVoiceLeading(wideBass).hardGates.spacing.pass).toBe(true);
  });
});

describe("verifyVoiceLeading — chord membership", () => {
  it("flags a voiced pitch that does not spell the chord", () => {
    // C3 E3 G3 Bb3 over "C" — Bb is not a chord tone of C major.
    const r = realize("C major", [[1, "C", "C3 E3 G3 Bb3"]]);
    const v = verifyVoiceLeading(r);
    expect(v.admitted).toBe(false);
    expect(v.hardGates.chordMembership.violations.length).toBeGreaterThan(0);
  });

  it("warns (does not fail) on an out-of-vocabulary chord symbol", () => {
    const r = realize("C major", [[1, "C13", "C3 E3 G3 Bb3 D4"]]);
    const v = verifyVoiceLeading(r);
    expect(v.hardGates.chordMembership.pass).toBe(true); // not checked → not failed
    expect(v.warnings.some((w) => w.includes("outside the vocabulary"))).toBe(true);
  });
});

describe("verifyVoiceLeading — overlap", () => {
  it("flags a voice moving above an adjacent voice's prior pitch", () => {
    // 2-voice C(C3 C4) → C(E4 G4): the lower voice jumps to E4, above C4's prior spot.
    const r = realize("C major", [
      [1, "C", "C3 C4"],
      [2, "C", "E4 G4"],
    ]);
    const v = verifyVoiceLeading(r);
    expect(v.hardGates.overlap.violations.length).toBeGreaterThan(0);
  });
});

describe("verifyVoiceLeading — crossing (ordered-identity mode only)", () => {
  it("flags a crossing when the emitted order is the voice identity", () => {
    // voices emitted E3, C3, … — voice 0 (E3) sounds above voice 1 (C3).
    const r: Realization = {
      key: "C major",
      frames: [{ measure: 1, chordSymbol: "C", voices: [52, 48, 55, 60] }],
    };
    const ordered = verifyVoiceLeading(r, { assignVoicesByPitch: false });
    expect(ordered.hardGates.crossing.violations.length).toBeGreaterThan(0);
    expect(ordered.admitted).toBe(false);
    // Under the default (rank-assignment) the same pitches are just a clean chord.
    const ranked = verifyVoiceLeading(r);
    expect(ranked.hardGates.crossing.pass).toBe(true);
    expect(ranked.admitted).toBe(true);
  });
});

describe("verifyVoiceLeading — tendency tones", () => {
  it("flags an unresolved chordal 7th (leaps up, no stepwise-down landing)", () => {
    // G7(G2 B2 D3 F3) → C(C3 G3 C4 E4): the 7th F3 has no E below it in the next
    // chord and is not held — it did not resolve.
    const r = realize("C major", [
      [1, "G7", "G2 B2 D3 F3"],
      [2, "C", "C3 G3 C4 E4"],
    ]);
    const v = verifyVoiceLeading(r);
    expect(v.hardGates.tendencySeventh.violations.length).toBeGreaterThan(0);
    expect(v.admitted).toBe(false);
  });

  it("flags a soprano leading tone that fails to resolve up on V→I", () => {
    // G(G2 D3 G3 B3) → C(C3 E3 G3 A3): soprano B3(LT) drops instead of rising to C.
    const r = realize("C major", [
      [1, "G", "G2 D3 G3 B3"],
      [2, "C", "C3 E3 G3 A3"], // A is not in C major → also a membership fail, but LT fires
    ]);
    const v = verifyVoiceLeading(r);
    expect(v.hardGates.tendencyLeadingTone.violations.length).toBeGreaterThan(0);
  });

  it("accepts a held 7th retained as a common tone", () => {
    // Dm7(D3 F3 A3 C4) → G7(G2 F3 B3 D4): the C… actually keep it simple —
    // Am7(A2 G3 C4 E4) → Dm7(D3 F3 A3 C4): the 7th of Am7 is G(pitch 55); D m7
    // contains no G, but G3(55) steps down to F3(53) — resolves.
    const r = realize("C major", [
      [1, "Am7", "A2 G3 C4 E4"],
      [2, "Dm7", "D3 F3 A3 C4"],
    ]);
    const v = verifyVoiceLeading(r);
    expect(v.hardGates.tendencySeventh.pass, v.hardGates.tendencySeventh.violations.map((x) => x.detail).join("; ")).toBe(true);
  });
});

describe("verifyVoiceLeading — relaxRules (the Session-2 style lever)", () => {
  it("demotes a named rule from hard gate to warning without hiding it", () => {
    // C→Dm block motion trips parallels (only). Strict rejects; relaxed admits.
    const r = realize("C major", [
      [1, "C", "C3 E3 G3 C4"],
      [2, "Dm", "D3 F3 A3 D4"],
    ]);
    const strict = verifyVoiceLeading(r);
    expect(strict.admitted).toBe(false);
    expect(strict.hardGates.parallels.violations.length).toBeGreaterThan(0);

    const relaxed = verifyVoiceLeading(r, { relaxRules: ["parallels"] });
    expect(relaxed.admitted).toBe(true); // parallels no longer gates
    // still computed + reported, just as warnings
    expect(relaxed.hardGates.parallels.violations.length).toBeGreaterThan(0);
    expect(relaxed.warnings.some((w) => w.startsWith("[relaxed:parallels]"))).toBe(true);
  });

  it("still rejects when a NON-relaxed rule fails", () => {
    // Bad chord membership is not relaxed → still rejected.
    const r = realize("C major", [[1, "C", "C3 E3 G3 Bb3"]]);
    const relaxed = verifyVoiceLeading(r, { relaxRules: ["parallels", "tendencySeventh"] });
    expect(relaxed.admitted).toBe(false);
    expect(relaxed.hardGates.chordMembership.violations.length).toBeGreaterThan(0);
  });
});

describe("verifyVoiceLeading — range (warn by default, gate on request)", () => {
  it("reports out-of-range voices but does not reject by default", () => {
    // A clean C major but voiced very low (below SATB bass tessitura).
    const r = realize("C major", [[1, "C", "C1 E1 G1 C2"]]);
    const warn = verifyVoiceLeading(r); // rangeMode defaults to "warn"
    expect(warn.rangeExceedances.length).toBeGreaterThan(0);
    expect(warn.admitted).toBe(true); // range is informational by default
    const gated = verifyVoiceLeading(r, { rangeMode: "gate" });
    expect(gated.admitted).toBe(false);
  });
});

// ─── The leap floor (style-invariant no-wild-leap bound; finding 4) ──────────

describe("verifyVoiceLeading — leap (the smoothness floor)", () => {
  it("flags a wild (>octave) leap in an upper voice, in isolation", () => {
    // C(C3 C4) → C(C3 E5): the upper voice leaps C4(60)→E5(76) = 16 semitones.
    // 2 voices → no adjacent-upper spacing check, same chord → no tendency, no
    // parallels/overlap — so ONLY leap fires. Proves it is a real, isolable gate.
    const r = realize("C major", [
      [1, "C", "C3 C4"],
      [2, "C", "C3 E5"],
    ]);
    const v = verifyVoiceLeading(r);
    expect(v.hardGates.leap.violations.length).toBeGreaterThan(0);
    expect(v.admitted).toBe(false);
    // and nothing else fired
    for (const [rule, res] of Object.entries(v.hardGates)) {
      if (rule === "leap") continue;
      expect(res.pass, `${rule} unexpectedly fired`).toBe(true);
    }
  });

  it("EXEMPTS the bass — a big bass leap with clean upper voices is admitted", () => {
    // C(C4 E4 G4) → C(C2 E4 G4): the bass leaps C4(60)→C2(36) = 24 semitones, but
    // the bass is exempt (root motion + register resets); the upper voices hold.
    const r = realize("C major", [
      [1, "C", "C4 E4 G4"],
      [2, "C", "C2 E4 G4"],
    ]);
    const v = verifyVoiceLeading(r);
    expect(v.hardGates.leap.pass, v.hardGates.leap.violations.map((x) => x.detail).join("; ")).toBe(true);
    expect(v.admitted).toBe(true);
  });

  it("honors a custom maxLeap threshold", () => {
    // C(C3 E3 G3) → C(C3 G3 C4): upper voices move 3 and 5 semitones. Clean under
    // the default (12); with maxLeap:2 those moves become wild leaps.
    const r = realize("C major", [
      [1, "C", "C3 E3 G3"],
      [2, "C", "C3 G3 C4"],
    ]);
    expect(verifyVoiceLeading(r).admitted).toBe(true);
    const tight = verifyVoiceLeading(r, { maxLeap: 2 });
    expect(tight.hardGates.leap.violations.length).toBeGreaterThan(0);
    expect(tight.admitted).toBe(false);
  });
});

// ─── Leading-tone MOOT-per-scale (finding 5) ─────────────────────────────────

describe("verifyVoiceLeading — tendencyLeadingTone is MOOT when the scale has no LT", () => {
  it("marks the LT rule n/a (not relaxed, not failed) when no scale-degree 7 sounds", () => {
    // C major key, but a C→Am passage where B (the leading tone, pc 11) never
    // sounds and is in no chord — a modal/pentatonic-flavored fragment. The LT
    // rule does not APPLY; it is reported moot, and it never gates.
    const r = realize("C major", [
      [1, "C", "C3 E3 G3"],
      [2, "Am", "C3 E3 A3"],
    ]);
    const v = verifyVoiceLeading(r);
    expect(v.hardGates.tendencyLeadingTone.applicable).toBe(false);
    expect(v.mootRules).toContain("tendencyLeadingTone");
    expect(v.warnings.some((w) => w.includes("moot"))).toBe(true);
    expect(v.admitted).toBe(true); // moot ≠ relaxed; the rule simply doesn't apply
  });

  it("keeps the LT rule APPLICABLE when the leading tone actually functions", () => {
    // A real I–V–I: B sounds (in G and the soprano) → the LT rule applies + passes.
    const r = realize("C major", [
      [1, "C", "C3 E3 G3 C4"],
      [2, "G", "G2 D3 G3 B3"],
      [3, "C", "C3 E3 G3 C4"],
    ]);
    const v = verifyVoiceLeading(r);
    expect(v.hardGates.tendencyLeadingTone.applicable).toBe(true);
    expect(v.mootRules).not.toContain("tendencyLeadingTone");
  });
});

// ─── Named styles wired into the gate (Thread A) ─────────────────────────────

describe("verifyVoiceLeading — named style presets", () => {
  // A C→Dm block trips parallels (P5+P8) — a common-practice fault that is
  // idiomatic in a lead-sheet idiom (parallel voicings).
  const parallelBlock = realize("C major", [
    [1, "C", "C3 E3 G3 C4"],
    [2, "Dm", "D3 F3 A3 D4"],
  ]);

  it("common-practice (the default) rejects parallel voicings", () => {
    const v = verifyVoiceLeading(parallelBlock, { style: "common-practice" });
    expect(v.admitted).toBe(false);
    expect(v.style).toBe("common-practice");
    const def = verifyVoiceLeading(parallelBlock);
    expect(def.style).toBe("common-practice"); // default = common-practice
    expect(def.admitted).toBe(false);
  });

  it("lead-sheet admits the same parallel voicing (parallels + 7ths demoted, reported)", () => {
    const v = verifyVoiceLeading(parallelBlock, { style: "lead-sheet" });
    expect(v.admitted).toBe(true);
    expect(v.style).toBe("lead-sheet");
    expect(v.relaxedRules).toEqual(expect.arrayContaining(["parallels", "tendencySeventh"]));
    // the violation is still computed + surfaced as a warning, never hidden
    expect(v.hardGates.parallels.violations.length).toBeGreaterThan(0);
    expect(v.warnings.some((w) => w.startsWith("[relaxed:parallels]"))).toBe(true);
  });

  it("no style preset can wave through a HARD-FLOOR fault (membership)", () => {
    // C3 E3 G3 Bb3 over C — Bb is a non-chord tone (membership, a floor rule).
    // Even the loosest preset (film-ambient) must still reject it.
    const bad = realize("C major", [[1, "C", "C3 E3 G3 Bb3"]]);
    for (const style of ["common-practice", "lead-sheet", "film-ambient"] as const) {
      const v = verifyVoiceLeading(bad, { style });
      expect(v.admitted, `${style} wrongly admitted a non-chord tone`).toBe(false);
      expect(v.hardGates.chordMembership.violations.length).toBeGreaterThan(0);
    }
  });

  it("unions a style's relaxRules with an explicit relaxRules list", () => {
    const v = verifyVoiceLeading(parallelBlock, { style: "common-practice", relaxRules: ["parallels"] });
    expect(v.relaxedRules).toContain("parallels");
    expect(v.admitted).toBe(true); // parallels demoted via the explicit list
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

describe("parseKey", () => {
  it("parses major and minor keys to tonic + mode", () => {
    expect(parseKey("C major")).toEqual({ tonicPc: 0, mode: "major" });
    expect(parseKey("A minor")).toEqual({ tonicPc: 9, mode: "minor" });
    expect(parseKey("Bb major")).toEqual({ tonicPc: 10, mode: "major" });
    expect(parseKey("F# minor")).toEqual({ tonicPc: 6, mode: "minor" });
    expect(parseKey("nonsense")).toBeNull();
  });
});

describe("parseVoicing", () => {
  it("parses whitespace/plus-separated notes to ascending MIDI, dropping rests + durations", () => {
    expect(parseVoicing("C4 E4 G4")).toEqual([60, 64, 67]);
    expect(parseVoicing("G4+E4+C4")).toEqual([60, 64, 67]); // sorted ascending
    expect(parseVoicing("A2 C3:h E3:q")).toEqual([45, 48, 52]);
    expect(parseVoicing("C4 R E4")).toEqual([60, 64]); // rest dropped
    expect(parseVoicing("")).toEqual([]);
  });
});
