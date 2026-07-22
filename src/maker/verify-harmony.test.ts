// ─── Tests: Maker Harmony Verifier ───────────────────────────────────────────
//
// The flagship case is the maker-loop demo itself: the Für Elise m1-8 jazz
// reharmonization (Am7 / Fmaj7 bVI substitution / E7) that scripts/
// maker-loop-demo.ts verified 8/8 with 25 chord tones, 9 tensions, 0 chromatic.
// The productionized verifier must reproduce that verdict exactly.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  verifyHarmony,
  formatHarmonyVerdict,
  parseChordSymbol,
  chordSymbolsEquivalent,
  keyToPitchClasses,
  DEFAULT_MAX_CHROMATIC_RATIO,
  type MelodyMeasureInput,
  type ReharmonizedMeasure,
} from "./verify-harmony.js";

// ─── The maker-loop demo fixture: Für Elise m1-8 → jazz ─────────────────────

const FUR_ELISE_MELODY: MelodyMeasureInput[] = [
  { number: 1, rightHand: "E5:e D#5:e" },
  { number: 2, rightHand: "E5:e D#5:e E5:e B4:e D5:e C5:e" },
  { number: 3, rightHand: "A4:e C4:e E4:e A4:e" },
  { number: 4, rightHand: "B4:e E4:e G#4:e B4:e" },
  { number: 5, rightHand: "C5:e E4:e E5:e D#5:e" },
  { number: 6, rightHand: "E5:e D#5:e E5:e B4:e D5:e C5:e" },
  { number: 7, rightHand: "A4:e C4:e E4:e A4:e" },
  { number: 8, rightHand: "B4:e E4:e C5:e B4:e" },
];

const JAZZ_REHARM: ReharmonizedMeasure[] = [
  { measure: 1, intendedChord: "Am7", voicing: "A2 C3 E3 G3" },
  { measure: 2, intendedChord: "Am7", voicing: "A2 C3 E3 G3" },
  { measure: 3, intendedChord: "Fmaj7", voicing: "F2 A2 C3 E3" },
  { measure: 4, intendedChord: "E7", voicing: "E2 G#2 B2 D3" },
  { measure: 5, intendedChord: "Am7", voicing: "A2 C3 E3 G3" },
  { measure: 6, intendedChord: "Am7", voicing: "A2 C3 E3 G3" },
  { measure: 7, intendedChord: "Fmaj7", voicing: "F2 A2 C3 E3" },
  { measure: 8, intendedChord: "E7", voicing: "E2 G#2 B2 D3" },
];

describe("verifyHarmony — the maker-loop demo case", () => {
  const verdict = verifyHarmony(FUR_ELISE_MELODY, JAZZ_REHARM, { key: "A minor" });

  it("verifies the demo reharmonization", () => {
    expect(verdict.verified).toBe(true);
  });

  it("confirms all 8 voicings through the chord engine", () => {
    expect(verdict.chordFidelity.pass).toBe(true);
    expect(verdict.chordFidelity.matched).toBe(8);
    expect(verdict.chordFidelity.total).toBe(8);
    for (const f of verdict.chordFidelity.perMeasure) {
      expect(f.match).toBe(true);
    }
  });

  it("reproduces the demo's consonance counts: 25 tones, 9 tensions, 0 chromatic", () => {
    expect(verdict.consonance.chordTones).toBe(25);
    expect(verdict.consonance.tensions).toBe(9);
    expect(verdict.consonance.chromatic).toBe(0);
    expect(verdict.consonance.chromaticRatio).toBe(0);
    expect(verdict.consonance.pass).toBe(true);
  });

  it("labels D# over Am7 as the #11 tension (the demo's signature label)", () => {
    const m1 = verdict.consonance.perMeasure.find((c) => c.measure === 1)!;
    const dSharp = m1.labels.find((l) => l.note === "Eb"); // pc 3 renders as Eb
    expect(dSharp).toBeDefined();
    expect(dSharp!.kind).toBe("tension");
    expect(dSharp!.tension).toBe("#11");
  });

  it("labels C over E7 as b13", () => {
    const m8 = verdict.consonance.perMeasure.find((c) => c.measure === 8)!;
    const c = m8.labels.find((l) => l.note === "C");
    expect(c).toBeDefined();
    expect(c!.tension).toBe("b13");
  });

  it("reports bass voice-leading moves (7 moves, max leap 5 semitones)", () => {
    expect(verdict.voiceLeading.moves).toHaveLength(7);
    expect(verdict.voiceLeading.maxLeapSemitones).toBe(5);
    // A→A(0) A→F(4) F→E(1) E→A(5) A→A(0) A→F(4) F→E(1): 4 of 7 are stepwise (≤2)
    expect(verdict.voiceLeading.stepwiseRatio).toBeCloseTo(4 / 7);
  });

  it("finds the harmony fully diatonic in A minor (raised 7th allowed)", () => {
    expect(verdict.keyMembership.computable).toBe(true);
    expect(verdict.keyMembership.allDiatonic).toBe(true);
    expect(verdict.keyMembership.outsideKey).toEqual([]);
  });

  it("produces no warnings on clean input", () => {
    expect(verdict.warnings).toEqual([]);
  });
});

// ─── Chord fidelity failures ─────────────────────────────────────────────────

describe("verifyHarmony — chord fidelity gate", () => {
  it("rejects when the voicing does not produce the intended chord", () => {
    const verdict = verifyHarmony(
      [{ number: 1, rightHand: "E5:q" }],
      [{ measure: 1, intendedChord: "Am7", voicing: "C3 E3 G3" }], // C major, not Am7
    );
    expect(verdict.verified).toBe(false);
    expect(verdict.chordFidelity.pass).toBe(false);
    expect(verdict.chordFidelity.perMeasure[0].detected).toBe("C");
    expect(verdict.chordFidelity.perMeasure[0].match).toBe(false);
    expect(verdict.summary).toContain("REJECTED");
  });

  it("accepts enharmonic spellings (D#7 voicing detected as Eb7)", () => {
    const verdict = verifyHarmony(
      [{ number: 1, rightHand: "" }],
      [{ measure: 1, intendedChord: "D#7", voicing: "Eb2 G2 Bb2 Db3" }],
    );
    expect(verdict.chordFidelity.perMeasure[0].match).toBe(true);
  });

  it("fails an empty reharmonization with a warning", () => {
    const verdict = verifyHarmony(FUR_ELISE_MELODY, []);
    expect(verdict.verified).toBe(false);
    expect(verdict.warnings.some((w) => w.includes("empty"))).toBe(true);
  });

  it("flags intended chords outside the verifier vocabulary", () => {
    const verdict = verifyHarmony(
      [{ number: 1, rightHand: "C5:q" }],
      [{ measure: 1, intendedChord: "C13#11", voicing: "C3 E3 G3" }],
    );
    expect(verdict.verified).toBe(false);
    expect(verdict.warnings.some((w) => w.includes("outside the verifier vocabulary"))).toBe(true);
    const m1 = verdict.consonance.perMeasure.find((c) => c.measure === 1)!;
    expect(m1.notEvaluated).toContain("C13#11");
  });
});

// ─── Consonance gate ─────────────────────────────────────────────────────────

describe("verifyHarmony — consonance gate", () => {
  it("rejects a melody that clashes chromatically with the harmony", () => {
    // F# and Bb over C major: F#=iv 6 → #11 tension; Bb=iv 10 → chromatic.
    // C# = iv 1 → b9 tension. Use notes at iv 4±? Pick truly chromatic ones:
    // over C (C E G), iv 10 (Bb) and iv 11 (B) are neither tones nor tensions.
    const verdict = verifyHarmony(
      [{ number: 1, rightHand: "Bb4:q B4:q Bb4:q B4:q" }],
      [{ measure: 1, intendedChord: "C", voicing: "C3 E3 G3" }],
    );
    expect(verdict.consonance.chromatic).toBe(4);
    expect(verdict.consonance.chromaticRatio).toBe(1);
    expect(verdict.consonance.pass).toBe(false);
    expect(verdict.verified).toBe(false);
  });

  it("allows chromatic passing notes up to the default ratio", () => {
    // 1 chromatic of 5 notes = 0.2 — exactly at the default ceiling, passes.
    const verdict = verifyHarmony(
      [{ number: 1, rightHand: "C5:q E5:q G5:q C5:q B4:q" }],
      [{ measure: 1, intendedChord: "C", voicing: "C3 E3 G3" }],
    );
    expect(verdict.consonance.chromatic).toBe(1);
    expect(verdict.consonance.chromaticRatio).toBeCloseTo(0.2);
    expect(verdict.consonance.pass).toBe(true);
    expect(verdict.verified).toBe(true);
  });

  it("respects a custom maxChromaticRatio", () => {
    const verdict = verifyHarmony(
      [{ number: 1, rightHand: "C5:q E5:q G5:q C5:q B4:q" }],
      [{ measure: 1, intendedChord: "C", voicing: "C3 E3 G3" }],
      { maxChromaticRatio: 0.1 },
    );
    expect(verdict.consonance.pass).toBe(false);
    expect(verdict.verified).toBe(false);
  });

  it("labels the classic tensions (9th, 11th, b9)", () => {
    const verdict = verifyHarmony(
      [{ number: 1, rightHand: "B4:q D5:q F4:q" }], // over Am7: B=9th D=11th; F over E7 below
      [{ measure: 1, intendedChord: "Am7", voicing: "A2 C3 E3 G3" }],
    );
    const labels = verdict.consonance.perMeasure[0].labels;
    expect(labels[0].tension).toBe("9th");
    expect(labels[1].tension).toBe("11th");
    // F over Am7: iv = (5-9+12)%12 = 8 → b13
    expect(labels[2].tension).toBe("b13");
  });

  it("skips rests and handles duration suffixes and chord tokens", () => {
    const verdict = verifyHarmony(
      [{ number: 1, rightHand: "R:q C5:h R E5+G5:q" }],
      [{ measure: 1, intendedChord: "C", voicing: "C3+E3+G3:w" }],
    );
    // 3 sounding melody notes (C5, E5, G5), all chord tones
    expect(verdict.consonance.chordTones).toBe(3);
    expect(verdict.consonance.chromatic).toBe(0);
    expect(verdict.chordFidelity.perMeasure[0].detected).toBe("C");
    expect(verdict.verified).toBe(true);
  });

  it("warns when melody measures are missing for a reharm measure", () => {
    const verdict = verifyHarmony(
      [{ number: 1, rightHand: "C5:q" }],
      [
        { measure: 1, intendedChord: "C", voicing: "C3 E3 G3" },
        { measure: 2, intendedChord: "G7", voicing: "G2 B2 D3 F3" },
      ],
    );
    expect(verdict.warnings.some((w) => w.includes("m2") && w.includes("no melody"))).toBe(true);
  });

  it("warns about uncovered melody measures", () => {
    const verdict = verifyHarmony(
      [
        { number: 1, rightHand: "C5:q" },
        { number: 2, rightHand: "D5:q" },
      ],
      [{ measure: 1, intendedChord: "C", voicing: "C3 E3 G3" }],
    );
    expect(verdict.warnings.some((w) => w.includes("without a reharmonization"))).toBe(true);
  });

  it("collects parse warnings for bad tokens without crashing", () => {
    const verdict = verifyHarmony(
      [{ number: 1, rightHand: "C5:q NOT_A_NOTE" }],
      [{ measure: 1, intendedChord: "C", voicing: "C3 E3 G3" }],
    );
    expect(verdict.warnings.some((w) => w.includes("NOT_A_NOTE"))).toBe(true);
    expect(verdict.consonance.chordTones).toBe(1); // the good token still scored
  });
});

// ─── Key membership ──────────────────────────────────────────────────────────

describe("verifyHarmony — key membership", () => {
  it("flags borrowed tones outside a major key", () => {
    const verdict = verifyHarmony(
      [{ number: 1, rightHand: "D5:q" }],
      [{ measure: 1, intendedChord: "D", voicing: "D3 F#3 A3" }],
      { key: "C major" },
    );
    expect(verdict.keyMembership.computable).toBe(true);
    expect(verdict.keyMembership.outsideKey).toEqual(["F#"]);
    expect(verdict.keyMembership.allDiatonic).toBe(false);
    // Informational only — no effect on the hard gates
    expect(verdict.verified).toBe(true);
  });

  it("treats the raised 7th as diatonic in minor (G# in A minor)", () => {
    const verdict = verifyHarmony(
      [{ number: 1, rightHand: "" }],
      [{ measure: 1, intendedChord: "E7", voicing: "E2 G#2 B2 D3" }],
      { key: "A minor" },
    );
    expect(verdict.keyMembership.allDiatonic).toBe(true);
  });

  it("reports an unparseable key without failing", () => {
    const verdict = verifyHarmony(
      [{ number: 1, rightHand: "C5:q" }],
      [{ measure: 1, intendedChord: "C", voicing: "C3 E3 G3" }],
      { key: "H mixolydian" },
    );
    expect(verdict.keyMembership.computable).toBe(false);
    expect(verdict.keyMembership.reason).toContain("cannot parse");
    expect(verdict.verified).toBe(true);
  });

  it("marks key as not computable when no key is provided", () => {
    const verdict = verifyHarmony(
      [{ number: 1, rightHand: "C5:q" }],
      [{ measure: 1, intendedChord: "C", voicing: "C3 E3 G3" }],
    );
    expect(verdict.keyMembership.computable).toBe(false);
  });
});

// ─── Helper units ────────────────────────────────────────────────────────────

describe("parseChordSymbol", () => {
  it("parses roots with accidentals and all vocabulary suffixes", () => {
    expect(parseChordSymbol("C")!.pcs).toEqual([0, 4, 7]);
    expect(parseChordSymbol("Am7")!.pcs).toEqual([9, 0, 4, 7]);
    expect(parseChordSymbol("Ebmaj7")!.rootPc).toBe(3);
    expect(parseChordSymbol("F#m7b5")!.intervals).toEqual([0, 3, 6, 10]);
    expect(parseChordSymbol("Gsus4")!.intervals).toEqual([0, 5, 7]);
    expect(parseChordSymbol("Baug")!.intervals).toEqual([0, 4, 8]);
  });

  it("returns null outside the vocabulary", () => {
    expect(parseChordSymbol("C13")).toBeNull();
    expect(parseChordSymbol("Am9")).toBeNull();
    expect(parseChordSymbol("garbage")).toBeNull();
    expect(parseChordSymbol("")).toBeNull();
  });
});

describe("chordSymbolsEquivalent", () => {
  it("matches enharmonic roots", () => {
    expect(chordSymbolsEquivalent("D#7", "Eb7")).toBe(true);
    expect(chordSymbolsEquivalent("C#m7", "Dbm7")).toBe(true);
  });
  it("distinguishes quality", () => {
    expect(chordSymbolsEquivalent("C", "Cm")).toBe(false);
    expect(chordSymbolsEquivalent("C7", "Cmaj7")).toBe(false);
  });
  it("never matches unparseable symbols", () => {
    expect(chordSymbolsEquivalent("C13", "C13")).toBe(false);
  });
});

describe("keyToPitchClasses", () => {
  it("builds major scales", () => {
    expect([...keyToPitchClasses("C major")!].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11]);
  });
  it("builds minor scales with the raised 7th included", () => {
    const am = keyToPitchClasses("A minor")!;
    expect(am.has(7)).toBe(true); // G (natural minor 7th)
    expect(am.has(8)).toBe(true); // G# (raised leading tone)
    expect(am.has(6)).toBe(false); // F# not in A minor
  });
  it("handles accidentals and case", () => {
    const bbMajor = keyToPitchClasses("Bb major")!;
    expect(bbMajor.has(10)).toBe(true);
    expect(keyToPitchClasses("f# MINOR")).not.toBeNull();
  });
  it("returns null for unparseable keys", () => {
    expect(keyToPitchClasses("H mixolydian")).toBeNull();
  });
});

describe("formatHarmonyVerdict", () => {
  it("renders the demo verdict with all four verify sections", () => {
    const verdict = verifyHarmony(FUR_ELISE_MELODY, JAZZ_REHARM, { key: "A minor" });
    const text = formatHarmonyVerdict(verdict);
    expect(text).toContain("VERIFY ① chord fidelity");
    expect(text).toContain("VERIFY ② melody consonance");
    expect(text).toContain("VERIFY ③ bass voice-leading");
    expect(text).toContain("VERIFY ④ key (A minor): all diatonic");
    expect(text).toContain("VERDICT: ✅");
    expect(text).toContain("8/8 voicings confirmed");
  });

  it("renders mismatches and warnings on rejection", () => {
    const verdict = verifyHarmony(
      [{ number: 1, rightHand: "Bb4:q B4:q" }],
      [{ measure: 1, intendedChord: "Am7", voicing: "C3 E3 G3" }],
    );
    const text = formatHarmonyVerdict(verdict);
    expect(text).toContain("✗ MISMATCH");
    expect(text).toContain("VERDICT: ❌");
  });
});

describe("default export surface", () => {
  it("exposes the default chromatic ceiling", () => {
    expect(DEFAULT_MAX_CHROMATIC_RATIO).toBe(0.2);
  });
});
