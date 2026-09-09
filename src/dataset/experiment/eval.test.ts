import { describe, it, expect } from "vitest";
import { scorePredictions, trivialBaselines } from "./eval.js";

const DECLARED = ["match", "pitch_fail", "absent"] as const;

describe("trivialBaselines over the declared set", () => {
  it("uniform is 1/|declared| even when a class does not appear", () => {
    const labels = ["match", "match", "pitch_fail"];
    const b = trivialBaselines(labels, DECLARED);
    expect(b.uniform).toBeCloseTo(1 / 3, 10);
    expect(b.majority).toBeCloseTo(2 / 3, 10);
    expect(b.majority_class).toBe("match");
  });

  it("majority_class is a declared verdict, not an undeclared bucket", () => {
    const b = trivialBaselines(["match", "pitch_fail", "match"], DECLARED);
    expect(DECLARED).toContain(b.majority_class);
  });

  it("rejects a gold label outside the declared set", () => {
    expect(() => trivialBaselines(["clean"], DECLARED)).toThrow(/declared class set/);
  });
});

describe("scorePredictions", () => {
  it("includes a declared class with n=0 rather than dropping it", () => {
    const report = scorePredictions(
      [
        { id: "a", gold: "match" },
        { id: "b", gold: "pitch_fail" },
      ],
      [
        { id: "a", verdict: "match" },
        { id: "b", verdict: "match" },
      ],
      DECLARED,
    );
    expect(report.per_class.map((c) => c.kind)).toEqual([...DECLARED]);
    expect(report.per_class.find((c) => c.kind === "absent")).toEqual({
      kind: "absent",
      n: 0,
      correct: 0,
      accuracy: 0,
    });
    expect(report.overall).toBeCloseTo(0.5, 10);
  });
});
