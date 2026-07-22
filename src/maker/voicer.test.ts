// ─── Tests: deterministic chord voicer ───────────────────────────────────────
//
// The load-bearing guarantee of the neuro-symbolic decomposition: a voicing this
// renderer produces ALWAYS passes verifyHarmony's chord-fidelity gate, because
// the platform's own inferChord confirms it spells the intended chord. Proven
// here against the REAL chord engine across the full vocabulary × all 12 roots.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { voiceChord, renderReharmonization } from "./voicer.js";
import { inferChord } from "../songs/jam.js";
import { chordSymbolsEquivalent, verifyHarmony } from "./verify-harmony.js";

const SUFFIXES = [
  "", "m", "7", "maj7", "m7", "dim", "m7b5", "aug", "sus4", "sus2",
  "add9", "madd9",
  // Bass-aware additions (2026-07-22) — each collides with another chord's
  // pitch-class set under a rootless engine; the round-trip proves the bass
  // tie-break + longest-match settle them for voiceChord's root-position output.
  "6", "m6", "dim7", "9", "maj9", "m9",
];
const ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

describe("voiceChord — the fidelity guarantee", () => {
  it("inferChord(voiceChord(sym)) is canonically equivalent to sym for the whole vocabulary × 12 roots", () => {
    const failures: string[] = [];
    for (const root of ROOTS) {
      for (const suffix of SUFFIXES) {
        const sym = root + suffix;
        const voicing = voiceChord(sym);
        expect(voicing, `voiceChord returned null for ${sym}`).not.toBeNull();
        const detected = inferChord(voicing as string);
        if (!chordSymbolsEquivalent(sym, detected)) {
          failures.push(`${sym} → voicing "${voicing}" → detected ${detected}`);
        }
      }
    }
    expect(failures, `fidelity failures:\n${failures.join("\n")}`).toEqual([]);
  });

  it("produces a strictly ascending voicing in the bass register", () => {
    const v = voiceChord("Am7"); // A C E G
    expect(v).toBe("A2 C3 E3 G3");
  });

  it("respects rootOctave", () => {
    expect(voiceChord("C", { rootOctave: 3 })).toBe("C3 E3 G3");
  });

  it("returns null for a symbol outside the verifier vocabulary", () => {
    expect(voiceChord("C13")).toBeNull(); // no 13th template
    expect(voiceChord("C11")).toBeNull(); // no 11th template
    expect(voiceChord("C7b9")).toBeNull(); // altered dominants unsupported
    expect(voiceChord("H7")).toBeNull(); // H is not a note name
    expect(voiceChord("")).toBeNull();
  });

  it("voices the added-9th chords and slash chords", () => {
    // add9 / madd9 round-trip like the base vocabulary (no rootless-subset clash).
    for (const sym of ["Cadd9", "Dmadd9", "Gadd9", "Emadd9", "Bbadd9"]) {
      const v = voiceChord(sym);
      expect(v, `voiceChord null for ${sym}`).not.toBeNull();
      expect(chordSymbolsEquivalent(sym, inferChord(v as string)), `${sym} → ${v}`).toBe(true);
    }
    // Slash chords voice as their base chord (the bass is dropped), so they
    // round-trip as that base rather than being rejected.
    const cOverE = voiceChord("C/E");
    expect(cOverE).toBe(voiceChord("C"));
    expect(chordSymbolsEquivalent("C/E", inferChord(cOverE as string))).toBe(true);
  });

  it("voices notation-alias chords the base model emits (M7/ø/min7/Δ/+/°/7sus4)", () => {
    for (const [alias, canonical] of [
      ["CM7", "Cmaj7"], ["Cø7", "Cm7b5"], ["Dø", "Dm7b5"],
      ["Cmin7", "Cm7"], ["CΔ7", "Cmaj7"], ["CΔ", "Cmaj7"],
      ["C+", "Caug"], ["C°", "Cdim"], ["C°7", "Cdim7"], ["G7sus4", "Gsus4"],
    ] as const) {
      expect(voiceChord(alias), `voiceChord null for ${alias}`).toBe(voiceChord(canonical));
      expect(chordSymbolsEquivalent(alias, inferChord(voiceChord(alias) as string)), alias).toBe(true);
    }
  });

  it("bass-disambiguates the extended chords that share a pitch-class set", () => {
    // C6 ≡ Am7 and Cm6 ≡ Am7b5 as pitch-class sets — the bass (root position) decides.
    expect(inferChord(voiceChord("C6") as string)).toBe("C6");
    expect(inferChord(voiceChord("Am7") as string)).toBe("Am7");
    expect(inferChord(voiceChord("Cm6") as string)).toBe("Cm6");
    expect(inferChord(voiceChord("Am7b5") as string)).toBe("Am7b5");
    // dim7 is rotationally symmetric — every enharmonic root round-trips to itself.
    for (const root of ["C", "Eb", "F#", "A"]) {
      expect(inferChord(voiceChord(`${root}dim7`) as string), `${root}dim7`).toBe(`${root}dim7`);
    }
    // The 9-with-7th wins by LENGTH over the 7th-on-the-3rd it contains (G9 ⊃ Bm7b5).
    expect(inferChord(voiceChord("G9") as string)).toBe("G9");
    expect(inferChord(voiceChord("Cmaj9") as string)).toBe("Cmaj9");
    expect(inferChord(voiceChord("Cm9") as string)).toBe("Cm9");
  });
});

describe("renderReharmonization", () => {
  it("voices a chord-only proposal so every measure passes fidelity", () => {
    const rendered = renderReharmonization([
      { measure: 1, intendedChord: "Am7" },
      { measure: 2, intendedChord: "Fmaj7" },
      { measure: 3, intendedChord: "E7" },
    ]);
    expect(rendered).toHaveLength(3);
    // Feed through the real verifier with a trivially-consonant melody.
    const melody = rendered.map((r) => ({ number: r.measure, rightHand: "R:w" }));
    const verdict = verifyHarmony(melody, rendered);
    expect(verdict.chordFidelity.pass).toBe(true);
    expect(verdict.chordFidelity.matched).toBe(3);
  });

  it("drops out-of-vocabulary chords rather than emitting an unconfirmable voicing", () => {
    const rendered = renderReharmonization([
      { measure: 1, intendedChord: "Am7" },
      { measure: 2, intendedChord: "C13" }, // out of vocab (no 13th template) → dropped
    ]);
    expect(rendered.map((r) => r.measure)).toEqual([1]);
  });
});
