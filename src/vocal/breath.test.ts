import { describe, it, expect } from "vitest";
import {
  BREATH,
  BreathContext,
  gainFromBreath,
  residualCents,
  tensenessFromBreath,
  vibratoFromBreath,
} from "./breath.js";

describe("BreathContext", () => {
  it("empties over about a professional phrase, not a spoken breath group", () => {
    const b = new BreathContext(1);
    const dt = 0.01;
    for (let t = 0; t < 7; t += dt) b.step(dt, true, 0.7);
    expect(b.level).toBeGreaterThan(0.4);
    expect(b.level).toBeLessThan(0.7);
    for (let t = 0; t < 16; t += dt) b.step(dt, true, 0.7);
    expect(b.level).toBeCloseTo(BREATH.FLOOR, 1);
  });

  it("does not refill during a legato gap shorter than the catch pause", () => {
    const b = new BreathContext(0.5);
    b.step(BREATH.CATCH_PAUSE_SEC * 0.5, false, 0.7);
    expect(b.level).toBeCloseTo(0.5, 5);
  });

  it("needs a brief pause, then fills on a catch-breath", () => {
    const b = new BreathContext(0.2);
    const dt = 0.01;
    let sawInhale = false;
    for (let t = 0; t < 0.5; t += dt) {
      const s = b.step(dt, false, 0.7);
      if (s.inhaling) sawInhale = true;
    }
    expect(sawInhale).toBe(true);
    expect(b.level).toBeGreaterThan(0.85);
  });

  it("starts near empty so an opening rest is an inhale", () => {
    expect(BREATH.START).toBeLessThan(0.2);
  });
});

describe("prosody maps", () => {
  it("lowers tenseness and raises vibrato rate as air runs out (Klatt / Prame)", () => {
    expect(tensenessFromBreath(0.6, 1)).toBeGreaterThan(tensenessFromBreath(0.6, 0.2));
    expect(vibratoFromBreath(0.2).rateHz).toBeGreaterThan(vibratoFromBreath(1).rateHz);
    expect(gainFromBreath(0.2)).toBeGreaterThan(0.4);
    expect(gainFromBreath(0.2)).toBeLessThan(gainFromBreath(1));
  });

  it("keeps F0 residual small around the note", () => {
    const c = residualCents(1.3, 0.8);
    expect(Math.abs(c)).toBeLessThan(20);
  });
});
