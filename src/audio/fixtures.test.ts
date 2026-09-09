// ─── Synthetic Fixture Tests ─────────────────────────────────────────────────
//
// Each generator's ground truth is a closed form, so these tests pin the
// properties later chunks will assert against: a named frequency, named click
// times, a linear sweep, and vibrato depth in cents.

import { describe, it, expect } from "vitest";
import { sine, harmonicStack, clickTrain, chirp, vibratoNote } from "./fixtures.js";

const SR = 44100;

describe("sine", () => {
  it("is exactly duration · sampleRate samples long", () => {
    expect(sine({ frequency: 440, duration: 0.5, sampleRate: SR }).length).toBe(22050);
  });

  it("is bit-identical across two calls with the same options", () => {
    const a = sine({ frequency: 440, duration: 0.1, sampleRate: SR });
    const b = sine({ frequency: 440, duration: 0.1, sampleRate: SR });
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("peaks near the requested amplitude", () => {
    const x = sine({ frequency: 440, duration: 1, sampleRate: SR, amplitude: 0.5 });
    let peak = 0;
    for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]!));
    expect(peak).toBeGreaterThan(0.49);
    expect(peak).toBeLessThanOrEqual(0.5);
  });

  it("rejects a non-positive duration", () => {
    expect(() => sine({ frequency: 440, duration: 0, sampleRate: SR }))
      .toThrow(/duration/i);
  });
});

describe("harmonicStack", () => {
  it("equals the sum of its partials as individual sines", () => {
    const amps = [1, 0.5, 0.25];
    const stack = harmonicStack({
      fundamental: 220, duration: 0.2, sampleRate: SR, amplitudes: amps,
    });
    const n = stack.length;
    const reconstructed = new Float64Array(n);
    for (let h = 0; h < amps.length; h++) {
      const partial = sine({
        frequency: 220 * (h + 1), duration: 0.2, sampleRate: SR, amplitude: amps[h],
      });
      for (let i = 0; i < n; i++) reconstructed[i] += partial[i]!;
    }
    for (let i = 0; i < n; i += 17) {
      expect(stack[i]).toBeCloseTo(reconstructed[i]!, 10);
    }
  });

  it("rejects an empty partial list", () => {
    expect(() => harmonicStack({
      fundamental: 220, duration: 0.1, sampleRate: SR, amplitudes: [],
    })).toThrow(/at least one/i);
  });
});

describe("clickTrain", () => {
  it("places a unit impulse at each named time", () => {
    const times = [0.25, 0.5, 0.75];
    const x = clickTrain({ times, duration: 1, sampleRate: SR });
    let nonzero = 0;
    for (const t of times) {
      const i = Math.round(t * SR);
      expect(x[i]).toBe(1);
      nonzero++;
    }
    let count = 0;
    for (let i = 0; i < x.length; i++) if (x[i] !== 0) count++;
    expect(count).toBe(nonzero);
  });

  it("rejects a click past the duration", () => {
    expect(() => clickTrain({ times: [1.5], duration: 1, sampleRate: SR }))
      .toThrow(/outside/i);
  });
});

describe("chirp", () => {
  it("starts at startFrequency: the first-cycle zero crossing matches a sine", () => {
    // A linear chirp's instantaneous frequency at t=0 is startFrequency, so
    // the first few samples match a sine of that frequency to first order.
    const start = 220;
    const x = chirp({
      startFrequency: start, endFrequency: 880, duration: 1, sampleRate: SR,
    });
    const ref = sine({ frequency: start, duration: 1, sampleRate: SR });
    expect(x[0]).toBeCloseTo(ref[0]!, 10);
    expect(x[1]).toBeCloseTo(ref[1]!, 4);
  });

  it("is bit-identical across two calls", () => {
    const opts = { startFrequency: 100, endFrequency: 800, duration: 0.3, sampleRate: SR };
    expect(Array.from(chirp(opts))).toEqual(Array.from(chirp(opts)));
  });
});

describe("vibratoNote", () => {
  it("reduces to a plain sine when depth is zero", () => {
    const v = vibratoNote({
      frequency: 440, duration: 0.2, sampleRate: SR, rateHz: 5, depthCents: 0,
    });
    const s = sine({ frequency: 440, duration: 0.2, sampleRate: SR });
    for (let i = 0; i < v.length; i += 23) {
      expect(v[i]).toBeCloseTo(s[i]!, 8);
    }
  });

  it("deviates from a plain sine when depth is 50 cents", () => {
    const v = vibratoNote({
      frequency: 440, duration: 0.5, sampleRate: SR, rateHz: 5, depthCents: 50,
    });
    const s = sine({ frequency: 440, duration: 0.5, sampleRate: SR });
    let maxDiff = 0;
    for (let i = 0; i < v.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(v[i]! - s[i]!));
    }
    expect(maxDiff).toBeGreaterThan(0.1);
  });

  it("is bit-identical across two calls", () => {
    const opts = {
      frequency: 440, duration: 0.2, sampleRate: SR, rateHz: 6, depthCents: 30,
    };
    expect(Array.from(vibratoNote(opts))).toEqual(Array.from(vibratoNote(opts)));
  });
});
