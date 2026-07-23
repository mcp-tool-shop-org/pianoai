import { describe, it, expect } from "vitest";
import { measureEvents, songEvents } from "./events.js";
import type { Measure } from "../songs/types.js";

const M = (o: Partial<Measure> & { number: number }): Measure => ({
  number: o.number,
  rightHand: o.rightHand ?? "",
  leftHand: o.leftHand ?? "",
});

describe("measureEvents", () => {
  it("recovers sequential onsets from token durations", () => {
    const evs = measureEvents(M({ number: 1, leftHand: "C3:q E3:q G3:q" }), 0).filter((e) => e.hand === "left");
    expect(evs.map((e) => e.onsetBeat)).toEqual([0, 1, 2]);
    expect(evs.map((e) => e.pitch)).toEqual([48, 52, 55]);
    expect(evs.every((e) => e.durBeats === 1)).toBe(true);
  });

  it("a chord token yields simultaneous events at one onset", () => {
    const evs = measureEvents(M({ number: 1, leftHand: "C3+E3+G3:q" }), 0);
    expect(evs).toHaveLength(3);
    expect(evs.every((e) => e.onsetBeat === 0)).toBe(true);
    expect(new Set(evs.map((e) => e.pc))).toEqual(new Set([0, 4, 7]));
  });

  it("a rest advances the cursor but sounds nothing", () => {
    const evs = measureEvents(M({ number: 1, leftHand: "R:h C3:h" }), 0);
    expect(evs).toHaveLength(1);
    expect(evs[0].onsetBeat).toBe(2);
    expect(evs[0].pc).toBe(0);
  });

  it("both hands start at the measure downbeat and share the beat grid", () => {
    const evs = measureEvents(M({ number: 1, leftHand: "C2:w", rightHand: "E4:q F4:q G4:q A4:q" }), 8);
    const left = evs.filter((e) => e.hand === "left");
    const right = evs.filter((e) => e.hand === "right");
    expect(left[0].onsetBeat).toBe(8);
    expect(right.map((e) => e.onsetBeat)).toEqual([8, 9, 10, 11]);
  });

  it("dotted and triplet durations map to the platform's beat values", () => {
    const evs = measureEvents(M({ number: 1, leftHand: "C4:q. D4:e E4:qt" }), 0);
    expect(evs.map((e) => e.durBeats)).toEqual([1.5, 0.5, 2 / 3]);
    expect(evs.map((e) => e.onsetBeat)).toEqual([0, 1.5, 2.0]);
  });

  it("skips an unparseable tone without faulting, cursor still advances", () => {
    const evs = measureEvents(M({ number: 1, leftHand: "C3:q ZZ:q E3:q" }), 0);
    expect(evs.map((e) => e.pc)).toEqual([0, 4]);
    expect(evs.map((e) => e.onsetBeat)).toEqual([0, 2]);
  });
});

describe("songEvents", () => {
  it("lays measures on a contiguous beat timeline by array index", () => {
    const measures = [M({ number: 1, leftHand: "C3:w" }), M({ number: 2, leftHand: "G2:w" })];
    const evs = songEvents(measures, 4);
    expect(evs.map((e) => e.onsetBeat)).toEqual([0, 4]);
    expect(evs.map((e) => e.measure)).toEqual([1, 2]);
  });
});
