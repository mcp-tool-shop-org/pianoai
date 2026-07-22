// ─── Tests: the auto-reharmonize inference loop ──────────────────────────────
//
// The shipped product core (Phase C: ship inference, skip the pod). A stub
// proposer stands in for the LLM so the loop is tested deterministically:
//   - decompose guarantees chord fidelity (the voicer renders), so pass turns on
//     consonance ∧ non-triviality of the proposed CHORDS;
//   - best-of-n returns the first verified sample and stops early;
//   - a proposer that only ever proposes trivial/empty chords does not verify,
//     and the loop returns its best fallback attempt (never a fabricated pass).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { autoReharmonize, type ChordProposer, type ChordChoice } from "./reharmonize.js";
import type { ERItem } from "./er-gate.js";

function mkItem(source: string[]): ERItem {
  return {
    itemId: "t:m1-3", songId: "t", genre: "jazz", title: "t", key: "A minor", timeSignature: "4/4",
    measureRange: [1, source.length],
    melody: source.map((_, i) => ({ number: i + 1, rightHand: "A4:q C5:q E5:q" })),
    sourceChords: source.map((c, i) => ({ measure: i + 1, impliedChord: c })),
  };
}

const GOOD: ChordChoice[] = [
  { measure: 1, intendedChord: "Fmaj7" },
  { measure: 2, intendedChord: "Dm7" },
  { measure: 3, intendedChord: "E7" },
];
const TRIVIAL: ChordChoice[] = [
  { measure: 1, intendedChord: "Am" },
  { measure: 2, intendedChord: "Am" },
  { measure: 3, intendedChord: "Am" },
];

/** Returns `bad` until sampleIndex reaches `k`, then `good`. */
function passOnSample(k: number, good: ChordChoice[], bad: ChordChoice[]): ChordProposer {
  return { proposeChords: async (_item, i) => (i >= k ? good : bad) };
}

describe("autoReharmonize", () => {
  const item = mkItem(["Am", "Am", "Am"]);

  it("returns a verified reharmonization when the proposer offers good chords", async () => {
    const r = await autoReharmonize(item, passOnSample(0, GOOD, TRIVIAL), { maxSamples: 4 });
    expect(r.verified).toBe(true);
    expect(r.passedAtSample).toBe(1);
    expect(r.samplesUsed).toBe(1); // stops early on first pass
    // The returned voicings spell the intended chords (fidelity by construction).
    expect(r.score.chordFidelity.pass).toBe(true);
    expect(r.reharmonization.map((m) => m.intendedChord)).toEqual(["Fmaj7", "Dm7", "E7"]);
  });

  it("keeps resampling until a verified sample appears (best-of-n)", async () => {
    const r = await autoReharmonize(item, passOnSample(3, GOOD, TRIVIAL), { maxSamples: 8 });
    expect(r.verified).toBe(true);
    expect(r.passedAtSample).toBe(4); // 0-indexed k=3 → sample 4
    expect(r.samplesUsed).toBe(4);
  });

  it("does not verify a copy-the-original proposer, and returns a fallback (never a fake pass)", async () => {
    const r = await autoReharmonize(item, { proposeChords: async () => TRIVIAL }, { maxSamples: 4 });
    expect(r.verified).toBe(false);
    expect(r.passedAtSample).toBeNull();
    expect(r.samplesUsed).toBe(4);
    // Fallback is a real (if trivial) attempt — verifies chords but fails non-triviality.
    expect(r.score.nonTriviality.passes).toBe(false);
  });

  it("handles an empty proposer without throwing", async () => {
    const r = await autoReharmonize(item, { proposeChords: async () => [] }, { maxSamples: 3 });
    expect(r.verified).toBe(false);
    expect(r.reharmonization).toEqual([]);
    expect(r.samplesUsed).toBe(3);
  });

  it("respects maxSamples", async () => {
    let calls = 0;
    const counting: ChordProposer = { proposeChords: async () => { calls++; return TRIVIAL; } };
    await autoReharmonize(item, counting, { maxSamples: 5 });
    expect(calls).toBe(5);
  });

  it("drops out-of-vocabulary chords via the voicer rather than emitting an unconfirmable voicing", async () => {
    const withBadChord: ChordChoice[] = [
      { measure: 1, intendedChord: "Fmaj7" },
      { measure: 2, intendedChord: "C6" }, // out of vocab (6 excluded) → dropped by the voicer
      { measure: 3, intendedChord: "E7" },
    ];
    const r = await autoReharmonize(item, { proposeChords: async () => withBadChord }, { maxSamples: 1 });
    // Only the 2 voiceable measures survive; still a valid (verifiable) proposal.
    expect(r.reharmonization.map((m) => m.measure)).toEqual([1, 3]);
  });
});
