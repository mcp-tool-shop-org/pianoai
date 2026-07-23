import { describe, it, expect } from "vitest";
import { parseMeter, metricStrength, METRIC_WEIGHTS } from "./meter.js";

describe("parseMeter", () => {
  it("4/4 — simple quadruple, quarter tactus", () => {
    expect(parseMeter("4/4")).toMatchObject({
      numerator: 4, denominator: 4, beatsPerMeasure: 4, tactus: 1, compound: false,
    });
  });
  it("3/4 — simple triple", () => {
    expect(parseMeter("3/4")).toMatchObject({ beatsPerMeasure: 3, tactus: 1, compound: false });
  });
  it("6/8 — compound, dotted-quarter tactus, 3 quarter-beats/bar", () => {
    expect(parseMeter("6/8")).toMatchObject({ beatsPerMeasure: 3, tactus: 1.5, compound: true });
  });
  it("12/8 — compound", () => {
    expect(parseMeter("12/8")).toMatchObject({ beatsPerMeasure: 6, tactus: 1.5, compound: true });
  });
  it("3/8 is simple triple, NOT compound", () => {
    expect(parseMeter("3/8")).toMatchObject({ compound: false, tactus: 0.5 });
  });
  it("2/4 — simple duple", () => {
    expect(parseMeter("2/4")).toMatchObject({ beatsPerMeasure: 2, tactus: 1, compound: false });
  });
  it("unparseable → 4/4 fallback", () => {
    expect(parseMeter("garbage")).toMatchObject({ numerator: 4, denominator: 4 });
    expect(parseMeter("")).toMatchObject({ numerator: 4, denominator: 4 });
  });
  it("out-of-bounds parts → 4/4 fallback", () => {
    expect(parseMeter("0/0")).toMatchObject({ numerator: 4, denominator: 4 });
    expect(parseMeter("99/4")).toMatchObject({ numerator: 4, denominator: 4 });
  });
});

describe("metricStrength — the hierarchy", () => {
  it("weights are strictly ordered downbeat > primary > beat > offbeat > weak", () => {
    expect(METRIC_WEIGHTS.downbeat).toBeGreaterThan(METRIC_WEIGHTS.primary);
    expect(METRIC_WEIGHTS.primary).toBeGreaterThan(METRIC_WEIGHTS.beat);
    expect(METRIC_WEIGHTS.beat).toBeGreaterThan(METRIC_WEIGHTS.offbeat);
    expect(METRIC_WEIGHTS.offbeat).toBeGreaterThan(METRIC_WEIGHTS.weak);
  });

  describe("4/4", () => {
    const m = parseMeter("4/4");
    it("downbeat (pos 0) is strongest", () => expect(metricStrength(0, m)).toBe(METRIC_WEIGHTS.downbeat));
    it("mid-bar (pos 2) gets the primary accent", () => expect(metricStrength(2, m)).toBe(METRIC_WEIGHTS.primary));
    it("beats 2 & 4 (pos 1, 3) are beat-level", () => {
      expect(metricStrength(1, m)).toBe(METRIC_WEIGHTS.beat);
      expect(metricStrength(3, m)).toBe(METRIC_WEIGHTS.beat);
    });
    it("eighth off-beats (pos 0.5, 1.5) are off-beat level", () => {
      expect(metricStrength(0.5, m)).toBe(METRIC_WEIGHTS.offbeat);
      expect(metricStrength(1.5, m)).toBe(METRIC_WEIGHTS.offbeat);
    });
    it("sixteenths (pos 0.25, 0.75) are weak", () => {
      expect(metricStrength(0.25, m)).toBe(METRIC_WEIGHTS.weak);
      expect(metricStrength(0.75, m)).toBe(METRIC_WEIGHTS.weak);
    });
  });

  describe("3/4 — triple meter has NO mid-bar accent", () => {
    const m = parseMeter("3/4");
    it("downbeat strongest", () => expect(metricStrength(0, m)).toBe(METRIC_WEIGHTS.downbeat));
    it("beats 2 & 3 (pos 1, 2) are beat-level, not primary", () => {
      expect(metricStrength(1, m)).toBe(METRIC_WEIGHTS.beat);
      expect(metricStrength(2, m)).toBe(METRIC_WEIGHTS.beat);
    });
    it("the mid-bar position (pos 1.5) is only an off-beat, never primary", () => {
      expect(metricStrength(1.5, m)).toBe(METRIC_WEIGHTS.offbeat);
    });
  });

  describe("6/8 — compound", () => {
    const m = parseMeter("6/8");
    it("downbeat strongest", () => expect(metricStrength(0, m)).toBe(METRIC_WEIGHTS.downbeat));
    it("the second dotted-quarter beat (pos 1.5) is beat-level", () =>
      expect(metricStrength(1.5, m)).toBe(METRIC_WEIGHTS.beat));
    it("the written eighths (pos 0.5, 1, 2, 2.5) are off-beat level", () => {
      expect(metricStrength(0.5, m)).toBe(METRIC_WEIGHTS.offbeat);
      expect(metricStrength(1, m)).toBe(METRIC_WEIGHTS.offbeat);
      expect(metricStrength(2, m)).toBe(METRIC_WEIGHTS.offbeat);
    });
  });
});
