// ─── STFT Tests ──────────────────────────────────────────────────────────────
//
// The padding and frame-count tests are the ones that protect the timing gate.
// With centring, frame t is centred on sample t·hop; without it, frame t STARTS
// there. At n_fft 2048 and 44.1 kHz that is a 23 ms difference, over half of
// this repo's 40 ms onset tolerance, arriving silently from a boolean.

import { describe, it, expect } from "vitest";
import { reflectPad, frameCountFor, frameSignal, stft } from "./stft.js";

describe("reflectPad", () => {
  it("mirrors without repeating the edge sample", () => {
    // numpy's reflect mode: [a,b,c,d,e] by 2 → [c,b,a,b,c,d,e,d,c].
    const out = reflectPad([1, 2, 3, 4, 5], 2);
    expect(Array.from(out)).toEqual([3, 2, 1, 2, 3, 4, 5, 4, 3]);
  });

  it("copies unchanged when the pad is zero", () => {
    expect(Array.from(reflectPad([1, 2, 3], 0))).toEqual([1, 2, 3]);
  });

  it("grows the signal by twice the pad", () => {
    expect(reflectPad(new Float64Array(100), 32).length).toBe(164);
  });

  it("rejects a pad the signal is too short to mirror", () => {
    expect(() => reflectPad([1, 2, 3], 3)).toThrow(/only 3 long/i);
    expect(() => reflectPad([1, 2, 3], 5)).toThrow(/smaller n_fft/i);
  });

  it("rejects a negative pad", () => {
    expect(() => reflectPad([1, 2, 3], -1)).toThrow(/non-negative/i);
  });

  it("rejects a signal too short to reflect at all", () => {
    expect(() => reflectPad([1], 1)).toThrow(/at least 2/i);
  });
});

describe("frameCountFor", () => {
  it("is 1 + floor(samples / hop) when centred", () => {
    expect(frameCountFor(44100, 512, 2048, true)).toBe(1 + Math.floor(44100 / 512));
    expect(frameCountFor(1024, 256, 512, true)).toBe(5);
  });

  it("drops the partial trailing window when not centred", () => {
    expect(frameCountFor(1024, 256, 512, false)).toBe(3);
  });

  it("is zero for an uncentred signal shorter than one window", () => {
    expect(frameCountFor(100, 256, 512, false)).toBe(0);
  });
});

describe("frameSignal", () => {
  const opts = { sampleRate: 44100, nFft: 64, hopLength: 16 };

  it("produces frameCount rows of winLength samples", () => {
    const samples = new Float64Array(1024).fill(1);
    const { frames, frameCount, frameLength } = frameSignal(samples, opts);
    expect(frameLength).toBe(64);
    expect(frameCount).toBe(1 + Math.floor(1024 / 16));
    expect(frames.length).toBe(frameCount * 64);
  });

  it("applies the window, so a constant signal is not constant per frame", () => {
    const samples = new Float64Array(1024).fill(1);
    const { frames } = frameSignal(samples, opts);
    // Inside a mid-file frame the Hann window shapes the DC signal: the first
    // sample is at the window's zero, the middle at its peak.
    const mid = 10 * 64;
    expect(frames[mid]).toBeCloseTo(0, 10);
    expect(frames[mid + 32]).toBeCloseTo(1, 10);
  });

  it("centres a short window inside the transform", () => {
    const samples = new Float64Array(512).fill(1);
    const { frameLength } = frameSignal(samples, { ...opts, winLength: 32 });
    expect(frameLength).toBe(32);
  });

  it("rejects a window longer than the transform", () => {
    expect(() => frameSignal(new Float64Array(512), { ...opts, winLength: 128 }))
      .toThrow(/cannot exceed/i);
  });

  it("rejects a non-positive hop", () => {
    expect(() => frameSignal(new Float64Array(512), { ...opts, hopLength: 0 }))
      .toThrow(/positive integer/i);
  });
});

describe("stft", () => {
  const sampleRate = 44100;

  function sine(freq: number, seconds: number, sr = sampleRate): Float64Array {
    const n = Math.round(seconds * sr);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = Math.sin((2 * Math.PI * freq * i) / sr);
    }
    return out;
  }

  it("reports binCount as nFft / 2 + 1", () => {
    const spec = stft(sine(440, 0.2), { sampleRate, nFft: 1024, hopLength: 256 });
    expect(spec.binCount).toBe(513);
    expect(spec.data.length).toBe(spec.frameCount * 513);
  });

  it("times frame t at t·hop / sampleRate", () => {
    const spec = stft(sine(440, 0.5), { sampleRate, nFft: 2048, hopLength: 512 });
    expect(spec.frameTimes[0]).toBeCloseTo(0, 12);
    expect(spec.frameTimes[1]).toBeCloseTo(512 / 44100, 12);
    expect(spec.frameTimes[10]).toBeCloseTo((10 * 512) / 44100, 12);
  });

  it("puts a 440 Hz tone in the bin nearest 440 Hz", () => {
    const nFft = 4096;
    const spec = stft(sine(440, 1.0), { sampleRate, nFft, hopLength: 1024 });

    // Read a frame well inside the signal, away from the padded edges.
    const t = 10;
    let peakBin = 0;
    let peak = -Infinity;
    for (let k = 0; k < spec.binCount; k++) {
      const v = spec.data[t * spec.binCount + k]!;
      if (v > peak) { peak = v; peakBin = k; }
    }

    const peakHz = (peakBin * sampleRate) / nFft;
    // Bin spacing here is ~10.8 Hz, so landing within 15 Hz is exact to a bin.
    expect(Math.abs(peakHz - 440)).toBeLessThan(15);
  });

  it("puts a DC signal in bin 0", () => {
    const samples = new Float64Array(4096).fill(1);
    const spec = stft(samples, { sampleRate, nFft: 512, hopLength: 128 });

    const t = 10;
    const row = t * spec.binCount;
    const dc = spec.data[row]!;
    for (let k = 2; k < spec.binCount; k++) {
      expect(spec.data[row + k]).toBeLessThan(dc);
    }
  });

  it("defaults to a power spectrogram", () => {
    const samples = sine(440, 0.3);
    const asPower = stft(samples, { sampleRate, nFft: 1024, hopLength: 256 });
    const asMagnitude = stft(samples, { sampleRate, nFft: 1024, hopLength: 256, power: 1 });

    const t = 5;
    for (let k = 0; k < asPower.binCount; k += 37) {
      const m = asMagnitude.data[t * asMagnitude.binCount + k]!;
      expect(asPower.data[t * asPower.binCount + k]).toBeCloseTo(m * m, 6);
    }
  });

  it("defaults the hop to nFft / 4, matching librosa", () => {
    const spec = stft(sine(440, 0.5), { sampleRate, nFft: 2048 });
    expect(spec.params.hopLength).toBe(512);
  });

  it("records its resolved parameters for the render sidecar", () => {
    const spec = stft(sine(440, 0.2), {
      sampleRate, nFft: 1024, hopLength: 256, windowName: "hamming",
    });
    expect(spec.params.nFft).toBe(1024);
    expect(spec.params.hopLength).toBe(256);
    expect(spec.params.windowName).toBe("hamming");
    expect(spec.params.center).toBe(true);
  });

  it("produces more frames centred than uncentred, from the padding", () => {
    const samples = sine(440, 0.5);
    const centred = stft(samples, { sampleRate, nFft: 2048, hopLength: 512 });
    const raw = stft(samples, { sampleRate, nFft: 2048, hopLength: 512, center: false });
    expect(centred.frameCount).toBeGreaterThan(raw.frameCount);
  });
});
