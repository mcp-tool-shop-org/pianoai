import { describe, it, expect } from "vitest";
import {
  velocityBarWidthPct,
  velocityAriaValueNow,
  velocityAriaValueText,
  applyVelocityAria,
  VELOCITY_MIN,
  VELOCITY_MAX,
} from "./velocity-visual.js";

describe("velocityBarWidthPct", () => {
  it("maps the minimum velocity (1) to 0%", () => {
    expect(velocityBarWidthPct(VELOCITY_MIN)).toBe(0);
  });

  it("maps the maximum velocity (127) to 100%", () => {
    expect(velocityBarWidthPct(VELOCITY_MAX)).toBe(100);
  });

  it("maps the midpoint proportionally", () => {
    // (64 - 1) / (127 - 1) * 100
    expect(velocityBarWidthPct(64)).toBeCloseTo(50, 0);
  });

  it("is monotonically increasing", () => {
    const widths = [1, 20, 40, 60, 80, 100, 127].map(velocityBarWidthPct);
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeGreaterThan(widths[i - 1]);
    }
  });

  it("clamps a velocity below the app's own floor (e.g. an imported 0 — MIDI note-off)", () => {
    expect(velocityBarWidthPct(0)).toBe(0);
    expect(velocityBarWidthPct(-50)).toBe(0);
  });

  it("clamps a velocity above 127 (defensive — malformed import)", () => {
    expect(velocityBarWidthPct(999)).toBe(100);
  });
});

describe("applyVelocityAria (F-4a4fb612)", () => {
  it("writes valuemin/max/now/text on the note box", () => {
    const attrs: Record<string, string> = {};
    applyVelocityAria({ setAttribute: (name, value) => { attrs[name] = value; } }, 100);
    expect(attrs["aria-valuemin"]).toBe("1");
    expect(attrs["aria-valuemax"]).toBe("127");
    expect(attrs["aria-valuenow"]).toBe("100");
    expect(attrs["aria-valuetext"]).toBe("velocity 100");
  });

  it("clamps out-of-range velocity into the aria now/text", () => {
    expect(velocityAriaValueNow(0)).toBe(VELOCITY_MIN);
    expect(velocityAriaValueText(999)).toBe("velocity 127");
  });
});
