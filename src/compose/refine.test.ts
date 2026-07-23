// ─── Tests: the part-at-a-time refinement loop ───────────────────────────────
//
// The refiner must (1) FIX a repairable voice-leading fault by re-voicing one
// voice at a time, (2) NEVER break the membership floor (a re-voicing only ever
// picks chord tones), (3) never DE-admit an already-clean seed, and (4) be
// bounded + deterministic. All seeds are membership-correct (the B1a guarantee);
// the refiner polishes the inter-frame voice-leading the gate judges.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { refineRealization, RefiningProposer, gatingViolationCount } from "./refine.js";
import { verifyVoiceLeading } from "./voice-leading.js";
import { scoreRealization } from "./scorer.js";
import { frameFromVoicing, type Realization } from "./types.js";
import { parseChordSymbol } from "../maker/verify-harmony.js";
import type { ChordProgression, RealizationProposer } from "./realize.js";

function realize(key: string, frames: Array<[number, string, string]>): Realization {
  return { key, frames: frames.map(([m, c, v]) => frameFromVoicing(m, c, v)) };
}

/** Every sounding voice is a chord tone. */
function membershipClean(real: Realization): boolean {
  return real.frames.every((f) => {
    if (f.voices.length === 0) return true;
    const p = parseChordSymbol(f.chordSymbol);
    if (!p) return true;
    const pcs = new Set(p.pcs);
    return f.voices.every((v) => pcs.has(v % 12));
  });
}

describe("refineRealization — fixes a repairable fault, preserves membership", () => {
  it("re-voices a wild-leap/spacing fault into an admitted realization", () => {
    // C(C3 E3 G3 C4) → C(C3 E3 G3 E5): the soprano leaps C4(60)→E5(76)=16 (leap)
    // and E5 is 21 semitones above G3 (spacing). Both are fixed by re-voicing the
    // soprano down to a near chord tone — membership stays intact throughout.
    const seed = realize("C major", [
      [1, "C", "C3 E3 G3 C4"],
      [2, "C", "C3 E3 G3 E5"],
    ]);
    const before = verifyVoiceLeading(seed, { requireVoiceCount: 4 });
    expect(before.admitted).toBe(false);

    const res = refineRealization(seed, { style: "common-practice" });
    expect(res.seedAdmitted).toBe(false);
    expect(res.admitted, res.verdict.summary).toBe(true);
    expect(res.accepted).toBeGreaterThan(0);
    expect(membershipClean(res.realization)).toBe(true);
  });

  it("only ever produces chord tones (membership can't break during refinement)", () => {
    // A messy but membership-correct seed; whatever the refiner does, it stays on
    // chord tones (candidates are chord-tone pitches only).
    const seed = realize("C major", [
      [1, "C", "C3 E3 G3 C4"],
      [2, "G7", "G2 B3 D4 F4"],
      [3, "C", "C3 E3 G3 C5"],
    ]);
    const res = refineRealization(seed, { style: "common-practice" });
    expect(membershipClean(res.realization)).toBe(true);
    // structure holds too — still exactly 4 voices per sounding frame
    expect(res.realization.frames.every((f) => f.voices.length === 0 || f.voices.length === 4)).toBe(true);
  });
});

describe("refineRealization — never harms an already-clean seed", () => {
  it("keeps a correct I–V–I admitted and does not lower its score", () => {
    const seed = realize("C major", [
      [1, "C", "C3 E3 G3 C4"],
      [2, "G", "G2 D3 G3 B3"],
      [3, "C", "C3 E3 G3 C4"],
    ]);
    const seedScore = scoreRealization(seed).score;
    const res = refineRealization(seed, { style: "common-practice" });
    expect(res.seedAdmitted).toBe(true);
    expect(res.admitted).toBe(true);
    expect(res.score.score).toBeGreaterThanOrEqual(seedScore - 1e-9);
  });
});

describe("refineRealization — style-aware, bounded, deterministic", () => {
  const parallelBlock = realize("C major", [
    [1, "C", "C3 E3 G3 C4"],
    [2, "Dm", "D3 F3 A3 D4"],
  ]);

  it("under lead-sheet a parallel seed already admits — refinement leaves it admitted", () => {
    const res = refineRealization(parallelBlock, { style: "lead-sheet" });
    expect(res.seedAdmitted).toBe(true); // parallels demoted → already clean
    expect(res.admitted).toBe(true);
  });

  it("respects maxPasses (a 0-pass refine is a no-op verify of the seed)", () => {
    const res = refineRealization(parallelBlock, { style: "common-practice", maxPasses: 0 });
    expect(res.passes).toBe(0);
    expect(res.accepted).toBe(0);
    expect(res.realization.frames.map((f) => f.voices)).toEqual(
      parallelBlock.frames.map((f) => [...f.voices].sort((a, b) => a - b)),
    );
  });

  it("is deterministic — same seed + options → identical refinement", () => {
    const a = refineRealization(parallelBlock, { style: "common-practice" });
    const b = refineRealization(parallelBlock, { style: "common-practice" });
    expect(a.realization).toEqual(b.realization);
    expect(a.accepted).toBe(b.accepted);
  });
});

describe("gatingViolationCount — matches admission", () => {
  it("is 0 exactly when the verdict admits", () => {
    const clean = verifyVoiceLeading(realize("C major", [[1, "C", "C3 E3 G3 C4"]]), { requireVoiceCount: 4 });
    expect(gatingViolationCount(clean)).toBe(0);
    expect(clean.admitted).toBe(true);

    const bad = verifyVoiceLeading(realize("C major", [[1, "C", "C3 E3 G3 Bb3"]]), { requireVoiceCount: 4 });
    expect(gatingViolationCount(bad)).toBeGreaterThan(0);
    expect(bad.admitted).toBe(false);
  });
});

describe("RefiningProposer — wraps a base proposer", () => {
  it("refines the base proposal before it reaches best-of-n", async () => {
    const PROG: ChordProgression = {
      key: "C major",
      chords: [
        { measure: 1, chordSymbol: "C" },
        { measure: 2, chordSymbol: "C" },
      ],
    };
    // a base proposer that returns the leap/spacing-faulted seed
    const base: RealizationProposer = {
      async proposeRealization() {
        return realize("C major", [
          [1, "C", "C3 E3 G3 C4"],
          [2, "C", "C3 E3 G3 E5"],
        ]);
      },
    };
    const refining = new RefiningProposer(base, { style: "common-practice" });
    const out = await refining.proposeRealization(PROG, 0);
    expect(out).not.toBeNull();
    expect(verifyVoiceLeading(out!, { requireVoiceCount: 4 }).admitted).toBe(true);
  });

  it("passes through a null base proposal", async () => {
    const base: RealizationProposer = { async proposeRealization() { return null; } };
    const refining = new RefiningProposer(base);
    expect(await refining.proposeRealization({ key: "C major", chords: [] }, 0)).toBeNull();
  });
});
