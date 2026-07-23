// ─── Tests: the BWS + Bradley-Terry panel core + the discrimination-floor gate ─
//
// The core must (1) recover a known ranking from consistent best-worst votes,
// (2) FAIL the discrimination-floor gate when the panel can't separate the valid
// anchor from the invalid floor (the prism ceiling-effect lesson — an
// uninterpretable panel must say so), (3) be deterministic (seeded rng/bootstrap),
// and (4) parse judge output tolerantly.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  renderVoicingText,
  makeRng,
  shuffledOrder,
  aggregatePanel,
  interpretPanel,
  type PanelSystem,
  type BwsVote,
} from "./bws.js";
import { parseJudgeResponse, buildJudgePrompt } from "./ollama-bws-judge.js";
import { frameFromVoicing, type Realization } from "./types.js";

const SYSTEMS: PanelSystem[] = [
  { id: "A", note: "" },
  { id: "B", note: "" },
  { id: "C", note: "" },
  { id: "D", note: "" },
];
const ORDER = ["A", "B", "C", "D"];

/** T votes across 3 families, all picking best=`best`, worst=`worst` (identity option order). */
function votes(t: number, best: number, worst: number): { votes: BwsVote[]; tupleSystems: string[][] } {
  const fam = ["f1", "f2", "f3"];
  const v: BwsVote[] = [];
  const ts: string[][] = [];
  for (let i = 0; i < t; i++) {
    v.push({ options: [0, 1, 2, 3], best, worst, family: fam[i % 3] });
    ts.push([...ORDER]);
  }
  return { votes: v, tupleSystems: ts };
}

describe("bws — Bradley-Terry recovers a known ranking", () => {
  it("ranks the consistently-best system top and the consistently-worst bottom", () => {
    const { votes: v, tupleSystems } = votes(12, 0, 3); // A best, D worst, every vote
    const agg = aggregatePanel(SYSTEMS, v, tupleSystems, { bootstrap: 200, seed: 1 });
    expect(agg.ranking[0]).toBe("A");
    expect(agg.ranking[agg.ranking.length - 1]).toBe("D");
    const a = agg.scores.find((s) => s.id === "A")!;
    const d = agg.scores.find((s) => s.id === "D")!;
    expect(a.bwsScore).toBeCloseTo(1, 6);
    expect(d.bwsScore).toBeCloseTo(-1, 6);
    expect(a.btStrength).toBeGreaterThan(d.btStrength);
    expect(agg.familyAgreement).toBe(1);
  });
});

describe("bws — the discrimination-floor gate", () => {
  it("PASSES + reports DIRECTIONAL when valid clearly beats floor and the engine tops", () => {
    const { votes: v, tupleSystems } = votes(12, 0, 3); // A(=valid=engine) best, D(=floor) worst
    const agg = aggregatePanel(SYSTEMS, v, tupleSystems, { bootstrap: 200, seed: 1 });
    const res = interpretPanel(agg, { floor: "D", valid: "A", engine: "A" });
    expect(res.interpretable).toBe(true);
    expect(res.verdict).toMatch(/DIRECTIONAL POSITIVE/);
  });

  it("FAILS (uninterpretable) when the panel can't separate valid from floor", () => {
    // rotate best/worst so every system nets bwsScore ~0 → no separation
    const v: BwsVote[] = [];
    const ts: string[][] = [];
    for (let i = 0; i < 4; i++) {
      v.push({ options: [0, 1, 2, 3], best: i, worst: (i + 2) % 4, family: `f${i}` });
      ts.push([...ORDER]);
    }
    const agg = aggregatePanel(SYSTEMS, v, ts, { bootstrap: 100, seed: 1 });
    const res = interpretPanel(agg, { floor: "D", valid: "A", engine: "A" });
    expect(res.interpretable).toBe(false);
    expect(res.verdict).toMatch(/UNINTERPRETABLE/);
    expect(res.verdict).toMatch(/discrimination floor/);
  });

  it("reports INCONCLUSIVE when judges discriminate but the engine is not on top", () => {
    // A (valid) best, D (floor) worst → floor gate passes; but engine = C (mid) → not top
    const { votes: v, tupleSystems } = votes(12, 0, 3);
    const agg = aggregatePanel(SYSTEMS, v, tupleSystems, { bootstrap: 200, seed: 1 });
    const res = interpretPanel(agg, { floor: "D", valid: "A", engine: "C" });
    expect(res.interpretable).toBe(true);
    expect(res.verdict).toMatch(/INCONCLUSIVE/);
  });
});

describe("bws — determinism + helpers", () => {
  it("makeRng + shuffledOrder are deterministic and permutations", () => {
    const a = shuffledOrder(4, makeRng(99));
    const b = shuffledOrder(4, makeRng(99));
    expect(a).toEqual(b);
    expect([...a].sort()).toEqual([0, 1, 2, 3]);
  });

  it("renderVoicingText shows chord + ascending note names, and rests", () => {
    const real: Realization = {
      key: "C major",
      frames: [frameFromVoicing(1, "C", "C3 E3 G3 C4"), { measure: 2, chordSymbol: "N/C", voices: [] }],
    };
    const text = renderVoicingText(real);
    expect(text).toContain("m1 C: C3 E3 G3 C4");
    expect(text).toContain("m2 N/C: (rest)");
  });
});

describe("ollama-bws-judge — prompt + tolerant parse", () => {
  it("builds a blind prompt with anonymized options", () => {
    const { system, user } = buildJudgePrompt("C major", ["m1 C: C3 E3 G3", "m1 C: C4 E4 G4"]);
    expect(system).toMatch(/best/i);
    expect(user).toContain("Option 1:");
    expect(user).toContain("Option 2:");
    expect(user).not.toMatch(/engine|floor|refined/); // systems never named to the judge
  });

  it("parses best/worst to 0-based, rejecting out-of-range / equal / garbage", () => {
    expect(parseJudgeResponse('{"best": 1, "worst": 4}', 4)).toEqual({ best: 0, worst: 3 });
    expect(parseJudgeResponse('the answer is {"best": 2, "worst": 1}', 4)).toEqual({ best: 1, worst: 0 });
    expect(parseJudgeResponse('{"best": 2, "worst": 2}', 4)).toBeNull(); // equal
    expect(parseJudgeResponse('{"best": 9, "worst": 1}', 4)).toBeNull(); // out of range
    expect(parseJudgeResponse("no json here", 4)).toBeNull();
  });
});
