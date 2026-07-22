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

const SUFFIXES = ["", "m", "7", "maj7", "m7", "dim", "m7b5", "aug", "sus4", "sus2"];
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
    expect(voiceChord("Cadd9")).toBeNull();
    expect(voiceChord("H7")).toBeNull();
    expect(voiceChord("")).toBeNull();
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
      { measure: 2, intendedChord: "Cadd9" }, // out of vocab → dropped
    ]);
    expect(rendered.map((r) => r.measure)).toEqual([1]);
  });
});
