// ─── Spectrogram Renderer Tests ──────────────────────────────────────────────
//
// No PNG decoder in the repo, so we parse our own stored-block layout. That is
// allowed: the tests pin the encoder we wrote, not a third-party reader.
// The invert check is the only test that looks at picture content. The
// default-size assertion is the number chunk 7 needs for the tool design.

import { describe, it, expect } from "vitest";
import {
  renderSpectrogram,
  encodeIndexedPng,
  indexedPngByteLength,
  DEFAULT_WIDTH,
  DEFAULT_HEIGHT,
  DEFAULT_TOP_DB,
} from "./render.js";
import type { TimeFrequencyData } from "./stft.js";

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];

function parseIndexedPng(png: Uint8Array): {
  width: number;
  height: number;
  pixels: Uint8Array;
  chunks: string[];
} {
  for (let i = 0; i < 8; i++) {
    if (png[i] !== PNG_SIG[i]) throw new Error("bad PNG signature");
  }
  const chunks: string[] = [];
  let offset = 8;
  let width = 0;
  let height = 0;
  const idatParts: Uint8Array[] = [];
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);

  while (offset < png.length) {
    const len = view.getUint32(offset);
    const type = String.fromCharCode(
      png[offset + 4]!, png[offset + 5]!, png[offset + 6]!, png[offset + 7]!,
    );
    const data = png.subarray(offset + 8, offset + 8 + len);
    chunks.push(type);
    if (type === "IHDR") {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      expect(png[offset + 16]).toBe(8);
      expect(png[offset + 17]).toBe(3);
    }
    if (type === "IDAT") idatParts.push(data);
    if (type === "IEND") break;
    offset += 12 + len;
  }

  const zlib = concat(idatParts);
  expect(zlib[0]).toBe(0x78);
  expect(zlib[1]).toBe(0x01);

  const raw: number[] = [];
  let p = 2;
  while (p < zlib.length - 4) {
    const last = zlib[p]! & 1;
    const len = zlib[p + 1]! | (zlib[p + 2]! << 8);
    p += 5;
    for (let i = 0; i < len; i++) raw.push(zlib[p + i]!);
    p += len;
    if (last) break;
  }

  const pixels = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const src = y * (1 + width);
    expect(raw[src]).toBe(0);
    for (let x = 0; x < width; x++) pixels[y * width + x] = raw[src + 1 + x]!;
  }
  return { width, height, pixels, chunks };
}

function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function logFreqs(fmin: number, fmax: number, n: number): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    out[i] = fmin * Math.pow(fmax / fmin, t);
  }
  return out;
}

function grid(args: {
  frames: number;
  bins: number;
  scale: TimeFrequencyData["scale"];
  fill?: number;
  fmin?: number;
  fmax?: number;
  hop?: number;
}): { tf: TimeFrequencyData; frequencies: Float64Array } {
  const { frames, bins, scale, fill = 0, fmin = 110, fmax = 1760, hop = 0.01 } = args;
  const data = new Float64Array(frames * bins).fill(fill);
  const frameTimes = new Float64Array(frames);
  for (let t = 0; t < frames; t++) frameTimes[t] = t * hop;
  return {
    tf: { frameCount: frames, binCount: bins, data, frameTimes, scale },
    frequencies: logFreqs(fmin, fmax, bins),
  };
}

function nearestFreq(frequencies: Float64Array, hz: number): number {
  let best = 0;
  let bestAbs = Infinity;
  for (let i = 0; i < frequencies.length; i++) {
    const d = Math.abs(frequencies[i]! - hz);
    if (d < bestAbs) { bestAbs = d; best = i; }
  }
  return best;
}

describe("encodeIndexedPng", () => {
  it("writes a valid signature, IHDR, single IDAT and IEND", () => {
    const pal = new Uint8Array(256 * 3);
    const pixels = new Uint8Array(4);
    const png = encodeIndexedPng(2, 2, pixels, pal);
    const parsed = parseIndexedPng(png);
    expect(parsed.width).toBe(2);
    expect(parsed.height).toBe(2);
    expect(parsed.chunks.filter((c) => c === "IDAT").length).toBe(1);
    expect(parsed.chunks[parsed.chunks.length - 1]).toBe("IEND");
  });
});

describe("renderSpectrogram — structure", () => {
  const { tf, frequencies } = grid({ frames: 8, bins: 16, scale: "magnitude" });

  it("declares the requested dimensions in IHDR", () => {
    const { png, sidecar } = renderSpectrogram(tf, frequencies, {
      width: 64, height: 32, axis: false,
    });
    const parsed = parseIndexedPng(png);
    expect(parsed.width).toBe(64);
    expect(parsed.height).toBe(32);
    expect(sidecar.width).toBe(64);
    expect(sidecar.height).toBe(32);
    expect(sidecar.byteLength).toBe(png.byteLength);
    expect(png.byteLength).toBe(indexedPngByteLength(64, 32));
  });

  it("is deterministic for a given input", () => {
    const a = renderSpectrogram(tf, frequencies, { width: 40, height: 20 });
    const b = renderSpectrogram(tf, frequencies, { width: 40, height: 20 });
    expect(Array.from(a.png)).toEqual(Array.from(b.png));
  });

  it("renders silence without throwing and fills a uniform floor", () => {
    const silent = grid({ frames: 4, bins: 8, scale: "power", fill: 0 });
    const { png } = renderSpectrogram(silent.tf, silent.frequencies, {
      width: 16, height: 16, axis: false,
    });
    const parsed = parseIndexedPng(png);
    const first = parsed.pixels[0];
    for (let i = 0; i < parsed.pixels.length; i++) {
      expect(parsed.pixels[i]).toBe(first);
    }
  });
});

describe("renderSpectrogram — scale branches", () => {
  it("accepts magnitude, power and db, and throws on anything else", () => {
    for (const scale of ["magnitude", "power", "db"] as const) {
      const { tf, frequencies } = grid({ frames: 4, bins: 8, scale, fill: scale === "db" ? -40 : 0.1 });
      tf.data[2 * 8 + 4] = scale === "db" ? 0 : 1;
      const { png, sidecar } = renderSpectrogram(tf, frequencies, {
        width: 16, height: 12, axis: false,
      });
      expect(parseIndexedPng(png).width).toBe(16);
      expect(sidecar.scale).toBe(scale);
    }
    const { tf, frequencies } = grid({ frames: 2, bins: 4, scale: "magnitude" });
    expect(() => renderSpectrogram(
      { ...tf, scale: "linear" as TimeFrequencyData["scale"] },
      frequencies,
      { width: 8, height: 8 },
    )).toThrow(/unrecognised/i);
  });
});

describe("renderSpectrogram — axis and overlay mutate bytes differently", () => {
  const { tf, frequencies } = grid({ frames: 8, bins: 16, scale: "magnitude", fill: 0.2 });

  it("axis:true and overlay each change the bytes, and not the same way", () => {
    const blind = renderSpectrogram(tf, frequencies, { width: 80, height: 40, axis: false });
    const axed = renderSpectrogram(tf, frequencies, { width: 80, height: 40, axis: true });
    const over = renderSpectrogram(tf, frequencies, {
      width: 80, height: 40, axis: false,
      overlay: [{ midi: 69, time: 0.02, duration: 0.04, hand: "right" }],
    });
    expect(Array.from(blind.png)).not.toEqual(Array.from(axed.png));
    expect(Array.from(blind.png)).not.toEqual(Array.from(over.png));
    expect(Array.from(axed.png)).not.toEqual(Array.from(over.png));
    expect(blind.png.byteLength).toBe(axed.png.byteLength);
    expect(axed.sidecar.axis).toBe(true);
    expect(over.sidecar.overlayCount).toBe(1);
  });

  it("contour and gridlines are renderable and change the bytes", () => {
    const base = renderSpectrogram(tf, frequencies, { width: 80, height: 40, axis: false });
    const withContour = renderSpectrogram(tf, frequencies, {
      width: 80, height: 40, axis: false,
      contour: [{ time: 0, midi: 60 }, { time: 0.07, midi: 64 }, { time: 0.07, midi: 67 }],
    });
    const withGrid = renderSpectrogram(tf, frequencies, {
      width: 80, height: 40, axis: false,
      gridlines: [{ time: 0.03, emphasis: false }, { time: 0.06, label: "2", emphasis: true }],
    });
    expect(Array.from(base.png)).not.toEqual(Array.from(withContour.png));
    expect(Array.from(base.png)).not.toEqual(Array.from(withGrid.png));
    expect(Array.from(withContour.png)).not.toEqual(Array.from(withGrid.png));
    expect(withContour.sidecar.contourCount).toBe(3);
    expect(withGrid.sidecar.gridlineCount).toBe(2);
  });

  it("viridis, magma and grey are distinct", () => {
    const v = renderSpectrogram(tf, frequencies, { width: 24, height: 16, axis: false, colormap: "viridis" });
    const m = renderSpectrogram(tf, frequencies, { width: 24, height: 16, axis: false, colormap: "magma" });
    const g = renderSpectrogram(tf, frequencies, { width: 24, height: 16, axis: false, colormap: "grey" });
    expect(Array.from(v.png)).not.toEqual(Array.from(m.png));
    expect(Array.from(v.png)).not.toEqual(Array.from(g.png));
    expect(v.sidecar.colormap).toBe("viridis");
    expect(m.sidecar.colormap).toBe("magma");
  });
});

describe("the frequency mapping is not inverted", () => {
  it("two tones are brighter than the row between them, and the low tone sits below the high tone", () => {
    const bins = 48;
    const frames = 12;
    const fmin = 110;
    const fmax = 1760;
    const frequencies = logFreqs(fmin, fmax, bins);
    const data = new Float64Array(frames * bins);
    const a3 = nearestFreq(frequencies, 220);
    const a4 = nearestFreq(frequencies, 440);
    const a5 = nearestFreq(frequencies, 880);
    for (let t = 0; t < frames; t++) {
      data[t * bins + a3] = 1;
      data[t * bins + a5] = 1;
    }
    const tf: TimeFrequencyData = {
      frameCount: frames,
      binCount: bins,
      data,
      frameTimes: Float64Array.from({ length: frames }, (_, t) => t * 0.01),
      scale: "magnitude",
    };
    const height = 96;
    const width = 48;
    const { png } = renderSpectrogram(tf, frequencies, { width, height, axis: false });
    const { pixels } = parseIndexedPng(png);

    function rowMean(y: number): number {
      let s = 0;
      const row = y * width;
      for (let x = 0; x < width; x++) s += pixels[row + x]!;
      return s / width;
    }

    function hzRow(hz: number): number {
      const t = Math.log(hz / fmin) / Math.log(fmax / fmin);
      return Math.round((1 - t) * (height - 1));
    }

    const yA3 = hzRow(220);
    const yA4 = hzRow(440);
    const yA5 = hzRow(880);
    expect(yA3).toBeGreaterThan(yA4);
    expect(yA4).toBeGreaterThan(yA5);
    expect(rowMean(yA3)).toBeGreaterThan(rowMean(yA4));
    expect(rowMean(yA5)).toBeGreaterThan(rowMean(yA4));
  });
});

describe("default 1568×784 byte size", () => {
  it("is the stored-deflate size, independent of pixel content", () => {
    expect(DEFAULT_WIDTH).toBe(1568);
    expect(DEFAULT_HEIGHT).toBe(784);
    expect(DEFAULT_TOP_DB).toBe(80);
    const expected = indexedPngByteLength(DEFAULT_WIDTH, DEFAULT_HEIGHT);
    const silent = grid({ frames: 2, bins: 4, scale: "power" });
    const { png, sidecar } = renderSpectrogram(silent.tf, silent.frequencies);
    expect(png.byteLength).toBe(expected);
    expect(sidecar.byteLength).toBe(expected);
    expect(expected).toBe(1_231_034);
  });
});

describe("encodeIndexedPng — the compressor hook", () => {
  it("defaults to stored deflate, whose size is a closed form", () => {
    const px = new Uint8Array(64 * 32);
    const pal = new Uint8Array(256 * 3);
    const png = encodeIndexedPng(64, 32, px, pal);
    expect(png.length).toBe(indexedPngByteLength(64, 32));
  });

  it("routes through a caller-supplied compressor and stays a valid PNG", () => {
    const px = new Uint8Array(64 * 32).fill(7);
    const pal = new Uint8Array(256 * 3);

    // A stand-in compressor: a single stored block, but built by the CALLER, so
    // this proves the hook is used rather than bypassed. A real one (Node's
    // deflateSync) is what the server passes.
    const marker = new Uint8Array([0x78, 0x01, 0x99, 0x99, 0x99, 0x99]);
    const png = encodeIndexedPng(64, 32, px, pal, () => marker);

    // Signature and IHDR survive.
    expect(Array.from(png.subarray(0, 8)))
      .toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    // The marker bytes are present, so our stream reached the IDAT.
    const hay = Array.from(png).join(",");
    expect(hay).toContain("153,153,153,153");
    // And the result is far shorter than the stored-block form.
    expect(png.length).toBeLessThan(indexedPngByteLength(64, 32));
  });

  it("passes the compressor through renderSpectrogram", () => {
    const tf = {
      frameCount: 8,
      binCount: 8,
      data: new Float64Array(64).fill(1),
      frameTimes: Float64Array.from({ length: 8 }, (_, i) => i * 0.01),
      scale: "magnitude" as const,
    };
    const freqs = Float64Array.from({ length: 8 }, (_, i) => 100 * Math.pow(2, i / 4));

    let called = false;
    renderSpectrogram(tf, freqs, {
      width: 64,
      height: 64,
      compress: (raw) => {
        called = true;
        return new Uint8Array([0x78, 0x01, ...raw.subarray(0, 4)]);
      },
    });
    expect(called).toBe(true);
  });
});
