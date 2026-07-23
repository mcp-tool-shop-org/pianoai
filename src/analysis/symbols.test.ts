import { describe, it, expect } from "vitest";
import { parseChordLabel, majMinClass, keyScalePcs } from "./symbols.js";

describe("parseChordLabel", () => {
  it("parses roots and qualities", () => {
    expect(parseChordLabel("C")).toEqual({ rootPc: 0, quality: "maj" });
    expect(parseChordLabel("Am7")).toEqual({ rootPc: 9, quality: "m7" });
    expect(parseChordLabel("Ebmaj7")).toEqual({ rootPc: 3, quality: "maj7" });
    expect(parseChordLabel("F#m7b5")).toEqual({ rootPc: 6, quality: "m7b5" });
  });
  it("drops a slash bass (inversion)", () => {
    expect(parseChordLabel("G7/B")).toEqual({ rootPc: 7, quality: "7" });
  });
  it("normalizes aliases", () => {
    expect(parseChordLabel("Cmin")).toEqual({ rootPc: 0, quality: "m" });
    expect(parseChordLabel("CM7")).toEqual({ rootPc: 0, quality: "maj7" });
    expect(parseChordLabel("C°7")).toEqual({ rootPc: 0, quality: "dim7" });
  });
  it("returns null for no-chord / unparseable", () => {
    expect(parseChordLabel("N/C")).toBeNull();
    expect(parseChordLabel("N/A")).toBeNull();
    expect(parseChordLabel("")).toBeNull();
    expect(parseChordLabel("xyz")).toBeNull();
  });
});

describe("majMinClass", () => {
  it("maps by the third", () => {
    expect(majMinClass("maj")).toBe("maj");
    expect(majMinClass("7")).toBe("maj");
    expect(majMinClass("m")).toBe("min");
    expect(majMinClass("dim")).toBe("min");
    expect(majMinClass("m7b5")).toBe("min");
    expect(majMinClass("sus4")).toBe("other");
  });
});

describe("keyScalePcs", () => {
  it("major and natural-minor scales", () => {
    expect([...(keyScalePcs("C major") ?? [])].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect([...(keyScalePcs("A minor") ?? [])].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11]);
    expect([...(keyScalePcs("Bb major") ?? [])].sort((a, b) => a - b)).toEqual([0, 2, 3, 5, 7, 9, 10]);
  });
  it("returns null for an unparseable key", () => {
    expect(keyScalePcs("H dorian")).toBeNull();
    expect(keyScalePcs("")).toBeNull();
  });
});
