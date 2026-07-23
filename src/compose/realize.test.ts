// ─── Tests: the realization loop + deterministic realizers ───────────────────
//
// The loop is the external-verifier best-of-n: propose → the deterministic gate
// admits → keep the highest-scoring admitted. These tests pin the deterministic
// realizers' properties (they spell every chord; the floor trips parallels; the
// nearest-tone leader is smoother) and the loop mechanics (best-of-n selection,
// fail-soft on null, early-stop) with stub proposers — no live LLM.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  realizeProgression,
  rootPositionRealization,
  nearestToneRealization,
  DeterministicProposer,
  type ChordProgression,
  type RealizationProposer,
} from "./realize.js";
import { verifyVoiceLeading } from "./voice-leading.js";
import { frameFromVoicing, type Realization } from "./types.js";

const STEPWISE: ChordProgression = {
  key: "C major",
  chords: [
    { measure: 1, chordSymbol: "C" },
    { measure: 2, chordSymbol: "Dm" },
    { measure: 3, chordSymbol: "Em" },
    { measure: 4, chordSymbol: "F" },
  ],
};

const CADENCE: ChordProgression = {
  key: "C major",
  chords: [
    { measure: 1, chordSymbol: "C" },
    { measure: 2, chordSymbol: "G" },
    { measure: 3, chordSymbol: "C" },
  ],
};

function iVi(): Realization {
  return {
    key: "C major",
    frames: [
      frameFromVoicing(1, "C", "C3 E3 G3 C4"),
      frameFromVoicing(2, "G", "G2 D3 G3 B3"),
      frameFromVoicing(3, "C", "C3 E3 G3 C4"),
    ],
  };
}

function sustainedC(): Realization {
  return {
    key: "C major",
    frames: [
      frameFromVoicing(1, "C", "C3 E3 G3 C4"),
      frameFromVoicing(2, "C", "C3 E3 G3 C4"),
      frameFromVoicing(3, "C", "C3 E3 G3 C4"),
    ],
  };
}

/** A proposer that returns a chosen realization per sample index. */
class StubProposer implements RealizationProposer {
  constructor(private readonly bySample: (k: number) => Realization | null) {}
  async proposeRealization(_p: ChordProgression, k: number): Promise<Realization | null> {
    return this.bySample(k);
  }
}

describe("deterministic realizers", () => {
  it("root-position realization spells every chord (fidelity floor)", () => {
    const real = rootPositionRealization(STEPWISE, 4);
    // Every frame carries exactly 4 voices, all spelling their chord.
    for (const f of real.frames) expect(f.voices).toHaveLength(4);
    const v = verifyVoiceLeading(real, { requireVoiceCount: 4 });
    expect(v.hardGates.chordMembership.pass).toBe(true);
    expect(v.hardGates.structure.pass).toBe(true);
  });

  it("root-position block chords trip parallels on a stepwise progression (floor fails VL)", () => {
    const real = rootPositionRealization(STEPWISE, 4);
    const v = verifyVoiceLeading(real, { requireVoiceCount: 4 });
    expect(v.admitted).toBe(false);
    expect(v.hardGates.parallels.violations.length).toBeGreaterThan(0);
  });

  it("nearest-tone leading is smoother than the root-position floor", () => {
    const floor = verifyVoiceLeading(rootPositionRealization(CADENCE, 4));
    const led = verifyVoiceLeading(nearestToneRealization(CADENCE, 4));
    expect(led.totalMotion).toBeLessThan(floor.totalMotion);
    // both still spell the chords
    expect(led.hardGates.chordMembership.pass).toBe(true);
  });
});

describe("realizeProgression — loop mechanics", () => {
  it("runs a deterministic proposer over all samples and returns a realization", async () => {
    const proposer = new DeterministicProposer(nearestToneRealization, 4);
    const res = await realizeProgression(CADENCE, proposer, { maxSamples: 4 });
    expect(res.samplesUsed).toBe(4); // deterministic → no early stop
    expect(res.realization.frames.length).toBe(3);
  });

  it("admits a clean sample and reports where it was admitted (best-of-n)", async () => {
    // null until sample index 2, then the clean I–V–I (admitted).
    const clean = iVi();
    const proposer = new StubProposer((k) => (k === 2 ? clean : null));
    const res = await realizeProgression(CADENCE, proposer, { maxSamples: 5 });
    expect(res.admitted).toBe(true);
    expect(res.admittedAtSamples).toEqual([3]); // 1-based
    expect(res.samplesUsed).toBe(5); // drew all (no early stop)
    expect(res.realization).toBe(clean);
  });

  it("keeps the HIGHEST-scoring admitted candidate", async () => {
    const lo = iVi(); // admitted but has outer similar motion (lower score)
    const hi = sustainedC(); // admitted, no motion (higher score)
    const proposer = new StubProposer((k) => (k === 0 ? lo : k === 1 ? hi : null));
    const res = await realizeProgression(CADENCE, proposer, { maxSamples: 3 });
    expect(res.admittedCount).toBe(2);
    expect(res.realization).toBe(hi); // higher score wins over draw order
  });

  it("stops at the first admit when asked", async () => {
    const clean = iVi();
    const proposer = new StubProposer((k) => (k === 1 ? clean : null));
    const res = await realizeProgression(CADENCE, proposer, { maxSamples: 8, stopOnFirstAdmit: true });
    expect(res.samplesUsed).toBe(2);
    expect(res.admitted).toBe(true);
  });

  it("is fail-soft: a proposer that always returns null yields a non-admitted result", async () => {
    const proposer = new StubProposer(() => null);
    const res = await realizeProgression(CADENCE, proposer, { maxSamples: 3 });
    expect(res.admitted).toBe(false);
    expect(res.realization.frames).toHaveLength(0);
    expect(res.samplesUsed).toBe(3);
    expect(res.admittedCount).toBe(0);
  });
});
