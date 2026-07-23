// ─── Tests: the voicing-spec renderer (membership by construction) ───────────
//
// The load-bearing claim of Slice B1a: a rendered voicing spells its chord NO
// MATTER WHAT the model emits. So the tests hammer the renderer with garbage
// specs (out-of-range, negative, non-integer, wrong-length) and assert the output
// is always chord-tones-only, exactly n voices, strictly ascending — the drift
// (C major → C-E-G-B) that scored the raw-note model 0/10 is impossible here.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  renderVoicingSpec,
  renderSpecRealization,
  repairDegrees,
  DEFAULT_BASS_OCTAVE,
  type VoicingSpec,
} from "./voicing-spec.js";
import { verifyVoiceLeading } from "./voice-leading.js";
import { parseChordSymbol } from "../maker/verify-harmony.js";
import type { ChordProgression } from "./realize.js";

/** Assert every MIDI voice is a pitch class of the chord (membership). */
function allChordTones(chordSymbol: string, voices: number[]): boolean {
  const pcs = new Set(parseChordSymbol(chordSymbol)!.pcs);
  return voices.every((v) => pcs.has(v % 12));
}

describe("renderVoicingSpec — renders exact chord tones", () => {
  it("renders a close root-position C major triad (bass C3)", () => {
    // degrees [0,1,2,0] = root, third, fifth, root — over C = C E G.
    const v = renderVoicingSpec("C", { degrees: [0, 1, 2, 0], bassOctave: 3 }, 4);
    expect(v).toEqual([48, 52, 55, 60]); // C3 E3 G3 C4
  });

  it("puts the inversion in the bass (first entry = bass tone)", () => {
    // degrees [1,2,0,1] = first inversion (third in the bass): E3 G3 C4 E4.
    const v = renderVoicingSpec("C", { degrees: [1, 2, 0, 1], bassOctave: 3 }, 4);
    expect(v).toEqual([52, 55, 60, 64]);
    expect(v[0] % 12).toBe(4); // bass = E (the third)
  });

  it("voices a seventh chord using degree 3 (the 7th)", () => {
    // G7 = G B D F. degrees [0,1,2,3] = G3 B3 D4 F4.
    const v = renderVoicingSpec("G7", { degrees: [0, 1, 2, 3], bassOctave: 3 }, 4);
    expect(allChordTones("G7", v)).toBe(true);
    expect(v.every((x, i) => i === 0 || x > v[i - 1])).toBe(true); // strictly ascending
  });
});

describe("renderVoicingSpec — robust to a confused model (membership can't break)", () => {
  it("wraps out-of-range / negative / non-integer indices into chord tones", () => {
    const v = renderVoicingSpec("C", { degrees: [99, -5, 7, 2.7], bassOctave: 3 }, 4);
    expect(allChordTones("C", v)).toBe(true);
    expect(v).toHaveLength(4);
    expect(v.every((x, i) => i === 0 || x > v[i - 1])).toBe(true);
  });

  it("pads a too-short degree list to exactly n voices", () => {
    const v = renderVoicingSpec("C", { degrees: [0] }, 4);
    expect(v).toHaveLength(4);
    expect(allChordTones("C", v)).toBe(true);
  });

  it("truncates a too-long degree list to exactly n voices", () => {
    const v = renderVoicingSpec("C", { degrees: [0, 1, 2, 0, 1, 2, 0] }, 4);
    expect(v).toHaveLength(4);
  });

  it("keeps voices strictly ascending (spacing ≤ octave, no crossing) by construction", () => {
    const v = renderVoicingSpec("Am7", { degrees: [3, 3, 0, 1], bassOctave: 2 }, 4);
    for (let i = 1; i < v.length; i++) {
      expect(v[i]).toBeGreaterThan(v[i - 1]); // strictly ascending
      expect(v[i] - v[i - 1]).toBeLessThanOrEqual(12); // ≤ an octave
    }
  });

  it("returns a rest (empty) for an out-of-vocabulary chord — never invents pitches", () => {
    expect(renderVoicingSpec("C13#11", { degrees: [0, 1, 2, 3] }, 4)).toEqual([]);
  });

  it("defaults the bass octave when omitted", () => {
    const v = renderVoicingSpec("C", { degrees: [0, 1, 2, 0] }, 4);
    expect(v[0]).toBe((DEFAULT_BASS_OCTAVE + 1) * 12); // C3 = 48
  });
});

describe("repairDegrees", () => {
  it("fills an empty list with a default close voicing (root, 3rd, 5th, root)", () => {
    expect(repairDegrees([], 3, 4)).toEqual([0, 1, 2, 0]);
  });
  it("normalizes then pads / truncates to exactly n", () => {
    expect(repairDegrees([5], 3, 3)).toEqual([2, 1, 2]); // 5→2 (in range), then pad positionally (1,2)
    expect(repairDegrees([0, 1, 2, 0, 1], 3, 3)).toEqual([0, 1, 2]);
  });
});

describe("renderSpecRealization — progression-aligned, membership guaranteed", () => {
  const PROG: ChordProgression = {
    key: "C major",
    chords: [
      { measure: 1, chordSymbol: "C" },
      { measure: 2, chordSymbol: "G7" },
      { measure: 3, chordSymbol: "Am" },
    ],
  };

  it("aligns specs to measures and leaves omitted measures as rests", () => {
    const specs: VoicingSpec[] = [
      { measure: 1, degrees: [0, 1, 2, 0] },
      { measure: 3, degrees: [0, 1, 2, 0] },
    ];
    const real = renderSpecRealization(PROG, specs, 4);
    expect(real.frames[0].voices).toHaveLength(4);
    expect(real.frames[1].voices).toHaveLength(0); // measure 2 omitted → rest
    expect(real.frames[2].voices).toHaveLength(4);
  });

  it("GUARANTEES chord membership even for a fully garbage spec set (the B1a claim)", () => {
    const garbage: VoicingSpec[] = PROG.chords.map((c) => ({
      measure: c.measure,
      degrees: [999, -12, 3.9, -1], // nonsense on purpose
      bassOctave: 3,
    }));
    const real = renderSpecRealization(PROG, garbage, 4);
    const verdict = verifyVoiceLeading(real, { requireVoiceCount: 4 });
    // membership + structure never fail, no matter what the model emitted
    expect(verdict.hardGates.chordMembership.pass).toBe(true);
    expect(verdict.hardGates.structure.pass).toBe(true);
    // and every sounding frame really is chord-tones-only
    for (const f of real.frames) {
      if (f.voices.length) expect(allChordTones(f.chordSymbol, f.voices)).toBe(true);
    }
  });

  it("is deterministic — same specs render byte-for-byte identically", () => {
    const specs: VoicingSpec[] = [{ measure: 1, degrees: [0, 1, 2, 0] }];
    const a = renderSpecRealization(PROG, specs, 4);
    const b = renderSpecRealization(PROG, specs, 4);
    expect(a).toEqual(b);
  });
});
