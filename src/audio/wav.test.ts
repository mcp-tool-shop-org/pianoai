// ─── WAV Decoding Tests ──────────────────────────────────────────────────────
//
// Every fixture here is built byte by byte rather than read from disk, so the
// tests state the format they expect instead of trusting an opaque file. The
// chunk-walking test is the one that matters most: a reader that assumes a
// 44-byte header passes every other test here and silently reads metadata as
// audio on a real-world file.

import { describe, it, expect } from "vitest";
import { decodeWav } from "./wav.js";

/** Build a WAV file in memory. `extraChunks` go between `fmt ` and `data`. */
function buildWav(opts: {
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
  float?: boolean;
  frames: number[][]; // [frame][channel], in -1..1
  extraChunks?: { id: string; body: Uint8Array }[];
}): Uint8Array {
  const sampleRate = opts.sampleRate ?? 44100;
  const channels = opts.channels ?? 1;
  const bitDepth = opts.bitDepth ?? 16;
  const float = opts.float ?? false;
  const bytesPerSample = bitDepth / 8;
  const dataBytes = opts.frames.length * channels * bytesPerSample;

  const extras = opts.extraChunks ?? [];
  const extraBytes = extras.reduce(
    (n, c) => n + 8 + c.body.length + (c.body.length % 2),
    0,
  );

  const total = 12 + 8 + 16 + extraBytes + 8 + dataBytes;
  const buf = new Uint8Array(total);
  const view = new DataView(buf.buffer);
  const tag = (off: number, s: string) => {
    for (let i = 0; i < 4; i++) view.setUint8(off + i, s.charCodeAt(i));
  };

  tag(0, "RIFF");
  view.setUint32(4, total - 8, true);
  tag(8, "WAVE");

  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, float ? 3 : 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bitDepth, true);

  let cursor = 36;
  for (const chunk of extras) {
    tag(cursor, chunk.id);
    view.setUint32(cursor + 4, chunk.body.length, true);
    buf.set(chunk.body, cursor + 8);
    cursor += 8 + chunk.body.length + (chunk.body.length % 2);
  }

  tag(cursor, "data");
  view.setUint32(cursor + 4, dataBytes, true);
  let o = cursor + 8;
  for (const frame of opts.frames) {
    for (let c = 0; c < channels; c++) {
      const v = frame[c]!;
      if (float) {
        view.setFloat32(o, v, true);
      } else if (bitDepth === 8) {
        view.setUint8(o, Math.round(v * 128) + 128);
      } else if (bitDepth === 16) {
        view.setInt16(o, Math.round(v * 32767), true);
      } else if (bitDepth === 24) {
        const i = Math.round(v * 8388607);
        view.setUint8(o, i & 0xff);
        view.setUint8(o + 1, (i >> 8) & 0xff);
        view.setUint8(o + 2, (i >> 16) & 0xff);
      } else if (bitDepth === 32) {
        view.setInt32(o, Math.round(v * 2147483647), true);
      }
      o += bytesPerSample;
    }
  }
  return buf;
}

describe("decodeWav — basics", () => {
  it("reads a mono 16-bit file", () => {
    const wav = buildWav({ frames: [[0], [0.5], [-0.5], [1]] });
    const audio = decodeWav(wav);

    expect(audio.sampleRate).toBe(44100);
    expect(audio.sourceChannels).toBe(1);
    expect(audio.bitDepth).toBe(16);
    expect(audio.downmixed).toBe(false);
    expect(audio.samples.length).toBe(4);
    expect(audio.samples[0]).toBeCloseTo(0, 4);
    expect(audio.samples[1]).toBeCloseTo(0.5, 4);
    expect(audio.samples[2]).toBeCloseTo(-0.5, 4);
  });

  it("reports duration from frame count and sample rate", () => {
    const frames = Array.from({ length: 22050 }, () => [0]);
    const audio = decodeWav(buildWav({ frames, sampleRate: 44100 }));
    expect(audio.durationSec).toBeCloseTo(0.5, 6);
  });
});

describe("decodeWav — bit depths", () => {
  const cases: { depth: number; float?: boolean; tol: number }[] = [
    { depth: 8, tol: 0.01 },
    { depth: 16, tol: 1e-4 },
    { depth: 24, tol: 1e-6 },
    { depth: 32, tol: 1e-8 },
    { depth: 32, float: true, tol: 1e-7 },
  ];

  for (const { depth, float, tol } of cases) {
    it(`round-trips ${depth}-bit ${float ? "float" : "integer"}`, () => {
      const wav = buildWav({
        bitDepth: depth,
        float,
        frames: [[0], [0.25], [-0.25], [0.75]],
      });
      const audio = decodeWav(wav);
      expect(audio.bitDepth).toBe(depth);
      expect(audio.samples[1]).toBeCloseTo(0.25, -Math.log10(tol) | 0);
      expect(audio.samples[2]).toBeCloseTo(-0.25, -Math.log10(tol) | 0);
    });
  }

  it("centres 8-bit audio correctly, since it is unsigned", () => {
    // The trap: 8-bit WAV is unsigned around 128, every other depth is signed.
    // Reading it as signed puts silence at -1.0.
    const audio = decodeWav(buildWav({ bitDepth: 8, frames: [[0], [0], [0]] }));
    for (let i = 0; i < audio.samples.length; i++) {
      expect(Math.abs(audio.samples[i]!)).toBeLessThan(0.02);
    }
  });
});

describe("decodeWav — channels", () => {
  it("averages stereo to mono by default", () => {
    const audio = decodeWav(buildWav({ channels: 2, frames: [[1, 0], [0.5, 0.5]] }));
    expect(audio.sourceChannels).toBe(2);
    expect(audio.downmixed).toBe(true);
    expect(audio.samples.length).toBe(2);
    expect(audio.samples[0]).toBeCloseTo(0.5, 3);
    expect(audio.samples[1]).toBeCloseTo(0.5, 3);
  });

  it("keeps a hard-panned take audible, which taking channel 0 would not", () => {
    // Everything on the right channel. Averaging halves it; channel 0 loses it.
    const audio = decodeWav(buildWav({ channels: 2, frames: [[0, 0.8], [0, 0.8]] }));
    expect(audio.samples[0]).toBeCloseTo(0.4, 3);
  });

  it("takes the first channel when asked", () => {
    const audio = decodeWav(
      buildWav({ channels: 2, frames: [[1, 0], [1, 0]] }),
      { firstChannelOnly: true },
    );
    expect(audio.samples[0]).toBeCloseTo(1, 3);
    expect(audio.downmixed).toBe(false);
  });
});

describe("decodeWav — chunk walking", () => {
  it("skips a LIST chunk between fmt and data", () => {
    // The defect this guards: a reader that assumes a 44-byte header reads the
    // LIST metadata as audio and returns noise, with no error.
    const list = new Uint8Array(20).fill(0x41);
    const wav = buildWav({
      frames: [[0.5], [0.5], [0.5], [0.5]],
      extraChunks: [{ id: "LIST", body: list }],
    });
    const audio = decodeWav(wav);
    expect(audio.samples.length).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(audio.samples[i]).toBeCloseTo(0.5, 3);
    }
  });

  it("handles an odd-sized chunk's pad byte", () => {
    const odd = new Uint8Array(5).fill(0x42);
    const wav = buildWav({
      frames: [[0.25], [0.25]],
      extraChunks: [{ id: "fact", body: odd }],
    });
    const audio = decodeWav(wav);
    expect(audio.samples.length).toBe(2);
    expect(audio.samples[0]).toBeCloseTo(0.25, 3);
  });
});

describe("decodeWav — rejections", () => {
  it("rejects a file that is not RIFF/WAVE", () => {
    const notWav = new Uint8Array(64);
    notWav.set([0x49, 0x44, 0x33], 0); // "ID3"
    expect(() => decodeWav(notWav)).toThrow(/Not a WAV file/i);
    expect(() => decodeWav(notWav)).toThrow(/MP3, FLAC or OGG/i);
  });

  it("rejects a file too short to hold a header", () => {
    expect(() => decodeWav(new Uint8Array(4))).toThrow(/too short/i);
  });

  it("names the encoding it cannot read", () => {
    const wav = buildWav({ frames: [[0]] });
    // Rewrite the format code to mu-law.
    new DataView(wav.buffer).setUint16(20, 7, true);
    expect(() => decodeWav(wav)).toThrow(/mu-law/i);
    expect(() => decodeWav(wav)).toThrow(/Re-export/i);
  });
});
