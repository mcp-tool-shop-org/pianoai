// ─── ai-jam-sessions: Spectrogram Renderer ───────────────────────────────────
//
// Tier 3: a picture for orientation and localisation, never a gate. Pure
// function from TimeFrequencyData to PNG bytes. No file I/O, no canvas, no
// dependency — the encoder is in this file.
//
// WHY A HAND-WRITTEN PNG. Lock item 6 used to name pngjs; that is the same
// class of stale lock as fft.js. A palette-indexed PNG with stored (un-
// compressed) deflate blocks is deterministic, zero-dependency, and about
// 1.2 MB at the default 1568×784. Chunk 7 designs the tool around that
// number; this chunk does not compress it.
//
// SCALE IS NOT A GUESS. stft returns power, cqt returns magnitude, the onset
// path returns dB. tf.scale says which; an unrecognised value throws.
//
// Usage:
//   const { png, sidecar } = renderSpectrogram(spec, spec.frequencies);
// ─────────────────────────────────────────────────────────────────────────────

import type { TimeFrequencyData, TimeFrequencyScale } from "./stft.js";
import { amplitudeToDb, powerToDb } from "./db.js";
import { midiToHz } from "./pitch.js";

export const DEFAULT_WIDTH = 1568;
export const DEFAULT_HEIGHT = 784;
export const DEFAULT_TOP_DB = 80;

/** Claude's long-edge cap × a short edge near OpenAI's 768. */
const COLORMAP_SIZE = 240;
const STRIP_WIDTH = 56;

const PAL = {
  floor: 0,
  whiteKey: 240,
  blackKey: 241,
  cKey: 242,
  text: 243,
  beat: 244,
  measure: 245,
  right: 246,
  left: 247,
  unmarked: 248,
  contour: 249,
  stripBg: 250,
} as const;

export type ColormapName = "viridis" | "magma" | "grey";

export interface OverlayNote {
  midi: number;
  time: number;
  duration: number;
  hand?: "left" | "right";
}

export interface ContourPoint {
  time: number;
  midi: number;
}

export interface Gridline {
  time: number;
  label?: string;
  /** Full-height bright (measure). Otherwise thin and dim (beat). */
  emphasis?: boolean;
}

export interface RenderOptions {
  /** Default {@link DEFAULT_WIDTH} (1568). */
  width?: number;
  /** Default {@link DEFAULT_HEIGHT} (784). */
  height?: number;
  /** Default viridis. Magma is the MIR convention; neither is frozen. */
  colormap?: ColormapName;
  /** Display dynamic range in dB. Default 80. */
  topDb?: number;
  /** Keyboard strip and C labels. Default true. */
  axis?: boolean;
  /** Intended notes: hollow, offset above the band. Omit for the blind render. */
  overlay?: OverlayNote[];
  /** Pitch trajectory. Thin line, distinct from overlay boxes. */
  contour?: ContourPoint[];
  /** Vertical rules. Caller supplies times; no BPM is invented here. */
  gridlines?: Gridline[];
  /**
   * Optional zlib compressor. Omit for the portable stored-deflate default;
   * pass Node's `deflateSync` to cut a full-size render from 1.23 MB to about
   * 67 KB, measured. See {@link ZlibCompressor}.
   */
  compress?: ZlibCompressor;
}

export interface RenderSidecar {
  width: number;
  height: number;
  colormap: ColormapName;
  topDb: number;
  axis: boolean;
  scale: TimeFrequencyScale;
  fmin: number;
  fmax: number;
  tMin: number;
  tMax: number;
  overlayCount: number;
  contourCount: number;
  gridlineCount: number;
  byteLength: number;
}

const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = ((): Uint32Array => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]!) & 0xFF]! ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  const n = data.length;
  let i = 0;
  while (i < n) {
    const end = Math.min(i + 5552, n);
    for (; i < end; i++) {
      a += data[i]!;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function u32be(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF]);
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
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

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const header = new Uint8Array(8);
  const view = new DataView(header.buffer);
  view.setUint32(0, data.length);
  header[4] = type.charCodeAt(0);
  header[5] = type.charCodeAt(1);
  header[6] = type.charCodeAt(2);
  header[7] = type.charCodeAt(3);
  const crcInput = concatBytes(header.subarray(4, 8), data);
  return concatBytes(header, data, u32be(crc32(crcInput)));
}

/** Wrap a finished zlib stream as a colour-type-3 PNG. */
function buildPng(
  width: number,
  height: number,
  palette: Uint8Array,
  zlib: Uint8Array,
): Uint8Array {
  const ihdr = new Uint8Array(13);
  const ih = new DataView(ihdr.buffer);
  ih.setUint32(0, width);
  ih.setUint32(4, height);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 3;   // colour type: indexed
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  return concatBytes(
    PNG_SIG,
    pngChunk("IHDR", ihdr),
    pngChunk("PLTE", palette),
    pngChunk("IDAT", zlib),
    pngChunk("IEND", new Uint8Array(0)),
  );
}

/**
 * A zlib compressor: raw bytes in, a complete zlib stream out.
 *
 * The default is stored (uncompressed) deflate, which is sync, portable and
 * needs nothing — but it means the file size is a closed form of width × height
 * and a 1568 × 784 render is 1.23 MB, or 1.57 MiB once base64-encoded for
 * transport. Measured, the same image through a real deflate is **67 KB, an
 * 18.2x reduction**, because a spectrogram is mostly large areas of similar
 * colour.
 *
 * That gap is worth closing where it can be, but not at the cost of the
 * layer's portability: `node:zlib` is Node-only and the browser's
 * `CompressionStream` is async, so neither can be the default in a pure,
 * synchronous, runs-everywhere module. So the default stays portable and a
 * Node caller passes `deflateSync` in. The MCP server does exactly that.
 */
export type ZlibCompressor = (raw: Uint8Array) => Uint8Array;

/**
 * Palette-indexed PNG, colour type 3, 8-bit, filter-None, one IDAT.
 *
 * With the default compressor the IDAT is zlib stored blocks, so size depends
 * only on width × height and not on pixel content. Pass a real `compress` to
 * trade that predictability for roughly an 18x smaller file.
 */
export function encodeIndexedPng(
  width: number,
  height: number,
  pixels: Uint8Array,
  palette: Uint8Array,
  compress?: ZlibCompressor,
): Uint8Array {
  if (pixels.length !== width * height) {
    throw new Error(
      `Pixel buffer is ${pixels.length} long, expected ${width * height}.`,
    );
  }
  if (palette.length !== 256 * 3) {
    throw new Error(`Palette must be 256 RGB triples, got ${palette.length} bytes.`);
  }

  const raw = new Uint8Array(height * (1 + width));
  for (let y = 0; y < height; y++) {
    const dst = y * (1 + width);
    raw[dst] = 0;
    raw.set(pixels.subarray(y * width, (y + 1) * width), dst + 1);
  }

  if (compress) {
    // A caller-supplied compressor returns a COMPLETE zlib stream, header and
    // checksum included, so it drops straight into the IDAT.
    return buildPng(width, height, palette, compress(raw));
  }

  const MAX = 65535;
  const nBlocks = Math.max(1, Math.ceil(raw.length / MAX));
  const zlib = new Uint8Array(2 + nBlocks * 5 + raw.length + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  let o = 2;
  let remaining = raw.length;
  let src = 0;
  for (let b = 0; b < nBlocks; b++) {
    const len = Math.min(MAX, remaining);
    const last = b === nBlocks - 1;
    zlib[o] = last ? 0x01 : 0x00;
    zlib[o + 1] = len & 0xFF;
    zlib[o + 2] = (len >>> 8) & 0xFF;
    const nlen = (~len) & 0xFFFF;
    zlib[o + 3] = nlen & 0xFF;
    zlib[o + 4] = (nlen >>> 8) & 0xFF;
    o += 5;
    zlib.set(raw.subarray(src, src + len), o);
    o += len;
    src += len;
    remaining -= len;
  }
  const adler = adler32(raw);
  zlib[o] = (adler >>> 24) & 0xFF;
  zlib[o + 1] = (adler >>> 16) & 0xFF;
  zlib[o + 2] = (adler >>> 8) & 0xFF;
  zlib[o + 3] = adler & 0xFF;

  return buildPng(width, height, palette, zlib);
}

/** Byte length of an indexed PNG from this encoder at `width` × `height`. */
export function indexedPngByteLength(width: number, height: number): number {
  const raw = height * (1 + width);
  const MAX = 65535;
  const nBlocks = Math.max(1, Math.ceil(raw / MAX));
  const zlib = 2 + nBlocks * 5 + raw + 4;
  const sig = 8;
  const ihdr = 25;
  const plte = 8 + 256 * 3 + 4;
  const idat = 8 + zlib + 4;
  const iend = 12;
  return sig + ihdr + plte + idat + iend;
}

const VIRIDIS_STOPS: number[][] = [
  [0.267004, 0.004874, 0.329415],
  [0.282327, 0.140926, 0.457517],
  [0.253935, 0.265254, 0.529983],
  [0.206756, 0.371758, 0.553117],
  [0.163625, 0.471133, 0.558148],
  [0.127568, 0.566949, 0.550556],
  [0.134692, 0.658636, 0.517649],
  [0.266941, 0.748751, 0.440573],
  [0.477504, 0.821444, 0.318195],
  [0.741388, 0.873449, 0.149561],
  [0.993248, 0.906157, 0.143936],
];

const MAGMA_STOPS: number[][] = [
  [0.001462, 0.000466, 0.013866],
  [0.078368, 0.045579, 0.207160],
  [0.232077, 0.059889, 0.437695],
  [0.406965, 0.101597, 0.533103],
  [0.550287, 0.161158, 0.505719],
  [0.716387, 0.214982, 0.475290],
  [0.863742, 0.294118, 0.382677],
  [0.954833, 0.438078, 0.298759],
  [0.987622, 0.645318, 0.379683],
  [0.996341, 0.862557, 0.629019],
  [0.987053, 0.991438, 0.749504],
];

function lerpStops(stops: number[][], n: number): Uint8Array {
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    const x = t * (stops.length - 1);
    const j = Math.min(stops.length - 2, Math.floor(x));
    const f = x - j;
    const a = stops[j]!;
    const b = stops[j + 1]!;
    out[i * 3] = Math.round(255 * ((1 - f) * a[0]! + f * b[0]!));
    out[i * 3 + 1] = Math.round(255 * ((1 - f) * a[1]! + f * b[1]!));
    out[i * 3 + 2] = Math.round(255 * ((1 - f) * a[2]! + f * b[2]!));
  }
  return out;
}

function buildPalette(colormap: ColormapName): Uint8Array {
  const pal = new Uint8Array(256 * 3);
  if (colormap === "grey") {
    for (let i = 0; i < COLORMAP_SIZE; i++) {
      const g = Math.round((i / (COLORMAP_SIZE - 1)) * 255);
      pal[i * 3] = g;
      pal[i * 3 + 1] = g;
      pal[i * 3 + 2] = g;
    }
  } else {
    const lut = lerpStops(colormap === "magma" ? MAGMA_STOPS : VIRIDIS_STOPS, COLORMAP_SIZE);
    pal.set(lut, 0);
  }
  const ui: [number, number, number, number][] = [
    [PAL.whiteKey, 0xF2, 0xEE, 0xE6],
    [PAL.blackKey, 0x2A, 0x2A, 0x32],
    [PAL.cKey, 0xD8, 0xC4, 0x6A],
    [PAL.text, 0xFF, 0xFF, 0xFF],
    [PAL.beat, 0x5A, 0x5A, 0x66],
    [PAL.measure, 0xCC, 0xCC, 0xD8],
    [PAL.right, 0x1F, 0x77, 0xB4],
    [PAL.left, 0xFF, 0x7F, 0x50],
    [PAL.unmarked, 0xFF, 0xFF, 0xFF],
    [PAL.contour, 0x00, 0xDC, 0xDC],
    [PAL.stripBg, 0x18, 0x18, 0x20],
  ];
  for (const [idx, r, g, b] of ui) {
    pal[idx * 3] = r;
    pal[idx * 3 + 1] = g;
    pal[idx * 3 + 2] = b;
  }
  return pal;
}

function toDisplayDb(tf: TimeFrequencyData, topDb: number): Float64Array {
  const { scale, data } = tf;
  if (scale === "magnitude") {
    return amplitudeToDb(data, { ref: "max", topDb });
  }
  if (scale === "power") {
    return powerToDb(data, { ref: "max", topDb });
  }
  if (scale === "db") {
    let peak = -Infinity;
    for (let i = 0; i < data.length; i++) {
      const v = data[i]!;
      if (v > peak) peak = v;
    }
    const out = new Float64Array(data.length);
    if (!Number.isFinite(peak)) {
      out.fill(-topDb);
      return out;
    }
    const floor = peak - topDb;
    for (let i = 0; i < data.length; i++) {
      const v = data[i]!;
      out[i] = v < floor ? floor : v;
    }
    return out;
  }
  const exhaustive: never = scale;
  throw new Error(
    `Unrecognised TimeFrequencyData.scale "${String(exhaustive)}". ` +
    `Expected "magnitude", "power", or "db".`,
  );
}

function isSilentLinear(data: ArrayLike<number>): boolean {
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i]!);
    if (a > peak) peak = a;
  }
  return peak < 1e-12;
}

function isSilentDb(data: ArrayLike<number>): boolean {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i]!;
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(max)) return true;
  return max - min < 1e-6;
}

function dbToIndex(db: Float64Array, topDb: number, silent: boolean): Uint8Array {
  const out = new Uint8Array(db.length);
  if (silent) return out;
  let peak = -Infinity;
  for (let i = 0; i < db.length; i++) {
    if (db[i]! > peak) peak = db[i]!;
  }
  if (!Number.isFinite(peak)) return out;
  const floor = peak - topDb;
  const span = topDb > 0 ? topDb : 1;
  for (let i = 0; i < db.length; i++) {
    const t = (db[i]! - floor) / span;
    const idx = Math.round(Math.max(0, Math.min(1, t)) * (COLORMAP_SIZE - 1));
    out[i] = idx;
  }
  return out;
}

function nearestIndex(sorted: ArrayLike<number>, value: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (value <= sorted[0]!) return 0;
  if (value >= sorted[n - 1]!) return n - 1;
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! <= value) lo = mid;
    else hi = mid;
  }
  return (value - sorted[lo]!) <= (sorted[hi]! - value) ? lo : hi;
}

function hzToY(hz: number, fmin: number, fmax: number, yTop: number, yBot: number): number {
  const span = Math.log(fmax / fmin);
  if (!(span > 0) || yBot === yTop) return (yTop + yBot) / 2;
  const t = Math.log(hz / fmin) / span;
  return yBot - t * (yBot - yTop);
}

function yToHz(y: number, fmin: number, fmax: number, yTop: number, yBot: number): number {
  const span = yBot - yTop;
  const t = span === 0 ? 0.5 : (yBot - y) / span;
  return fmin * Math.pow(fmax / fmin, Math.max(0, Math.min(1, t)));
}

function timeToX(t: number, tMin: number, tMax: number, x0: number, x1: number): number {
  if (tMax <= tMin) return x0;
  const u = (t - tMin) / (tMax - tMin);
  return x0 + u * (x1 - x0);
}

function xToTime(x: number, tMin: number, tMax: number, x0: number, x1: number): number {
  if (x1 <= x0) return tMin;
  const u = (x - x0) / (x1 - x0);
  return tMin + u * (tMax - tMin);
}

function isBlackKey(midi: number): boolean {
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
}

function cName(midiC: number): string {
  const oct = Math.floor(midiC / 12) - 1;
  return `C${oct}`;
}

const GLYPHS: Record<string, number[]> = {
  C: [0b01110, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b01110],
  "-": [0b00000, 0b00000, 0b00000, 0b01110, 0b00000, 0b00000, 0b00000],
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  "3": [0b01110, 0b10001, 0b00001, 0b00110, 0b00001, 0b10001, 0b01110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
};

function drawGlyph(
  pixels: Uint8Array, width: number, height: number,
  x: number, y: number, ch: string, color: number, scale: number,
): void {
  const g = GLYPHS[ch];
  if (!g) return;
  for (let row = 0; row < 7; row++) {
    const bits = g[row]!;
    for (let col = 0; col < 5; col++) {
      if (((bits >> (4 - col)) & 1) === 0) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = x + col * scale + dx;
          const py = y + row * scale + dy;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            pixels[py * width + px] = color;
          }
        }
      }
    }
  }
}

function drawText(
  pixels: Uint8Array, width: number, height: number,
  x: number, y: number, text: string, color: number, scale: number,
): void {
  let cx = x;
  for (const ch of text) {
    drawGlyph(pixels, width, height, cx, y, ch, color, scale);
    cx += 6 * scale;
  }
}

function fillRect(
  pixels: Uint8Array, width: number, height: number,
  x0: number, y0: number, x1: number, y1: number, color: number,
): void {
  const xa = Math.max(0, Math.min(width, Math.round(Math.min(x0, x1))));
  const xb = Math.max(0, Math.min(width, Math.round(Math.max(x0, x1))));
  const ya = Math.max(0, Math.min(height, Math.round(Math.min(y0, y1))));
  const yb = Math.max(0, Math.min(height, Math.round(Math.max(y0, y1))));
  for (let y = ya; y < yb; y++) {
    const row = y * width;
    for (let x = xa; x < xb; x++) pixels[row + x] = color;
  }
}

function strokeRect(
  pixels: Uint8Array, width: number, height: number,
  x0: number, y0: number, x1: number, y1: number, color: number, stroke: number,
): void {
  const xa = Math.round(Math.min(x0, x1));
  const xb = Math.round(Math.max(x0, x1));
  const ya = Math.round(Math.min(y0, y1));
  const yb = Math.round(Math.max(y0, y1));
  fillRect(pixels, width, height, xa, ya, xb, ya + stroke, color);
  fillRect(pixels, width, height, xa, yb - stroke, xb, yb, color);
  fillRect(pixels, width, height, xa, ya, xa + stroke, yb, color);
  fillRect(pixels, width, height, xb - stroke, ya, xb, yb, color);
}

function drawLine(
  pixels: Uint8Array, width: number, height: number,
  x0: number, y0: number, x1: number, y1: number, color: number,
): void {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const xEnd = Math.round(x1);
  const yEnd = Math.round(y1);
  const dx = Math.abs(xEnd - x);
  const dy = Math.abs(yEnd - y);
  const sx = x < xEnd ? 1 : -1;
  const sy = y < yEnd ? 1 : -1;
  let err = dx - dy;
  while (true) {
    if (x >= 0 && x < width && y >= 0 && y < height) {
      pixels[y * width + x] = color;
    }
    if (x === xEnd && y === yEnd) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

function assertPositiveInt(name: string, n: number): void {
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`${name} must be a positive integer, got ${n}.`);
  }
}

/**
 * Render a time-frequency grid as a palette-indexed PNG plus a sidecar of
 * the parameters that produced it.
 */
export function renderSpectrogram(
  tf: TimeFrequencyData,
  frequencies: ArrayLike<number>,
  options: RenderOptions = {},
): { png: Uint8Array; sidecar: RenderSidecar } {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const colormap = options.colormap ?? "viridis";
  const topDb = options.topDb ?? DEFAULT_TOP_DB;
  const axis = options.axis ?? true;
  const overlay = options.overlay ?? [];
  const contour = options.contour ?? [];
  const gridlines = options.gridlines ?? [];

  assertPositiveInt("width", width);
  assertPositiveInt("height", height);
  if (colormap !== "viridis" && colormap !== "magma" && colormap !== "grey") {
    throw new Error(`Unknown colormap "${String(colormap)}". Expected viridis, magma, or grey.`);
  }
  if (!(topDb > 0)) {
    throw new Error(`topDb must be positive, got ${topDb}.`);
  }
  if (frequencies.length !== tf.binCount) {
    throw new Error(
      `frequencies has ${frequencies.length} entries but the grid has ${tf.binCount} bins.`,
    );
  }
  if (tf.scale !== "magnitude" && tf.scale !== "power" && tf.scale !== "db") {
    throw new Error(
      `Unrecognised TimeFrequencyData.scale "${String(tf.scale)}". ` +
      `Expected "magnitude", "power", or "db".`,
    );
  }

  const fmin = frequencies[0]!;
  const fmax = frequencies[tf.binCount - 1]!;
  if (!(fmin > 0) || !(fmax > fmin)) {
    throw new Error(
      `Frequency axis must be strictly increasing and positive, got ${fmin}..${fmax}.`,
    );
  }

  const tMin = tf.frameCount > 0 ? tf.frameTimes[0]! : 0;
  const tMax = tf.frameCount > 0 ? tf.frameTimes[tf.frameCount - 1]! : 0;

  const silent = tf.scale === "db" ? isSilentDb(tf.data) : isSilentLinear(tf.data);
  const db = silent
    ? new Float64Array(tf.data.length)
    : toDisplayDb(tf, topDb);
  const lut = dbToIndex(db, topDb, silent);

  const x0 = axis ? STRIP_WIDTH : 0;
  const x1 = width;
  const yTop = 0;
  const yBot = height;
  const plotW = Math.max(1, x1 - x0);
  const plotH = height;

  const pixels = new Uint8Array(width * height);

  if (axis) {
    fillRect(pixels, width, height, 0, 0, x0, height, PAL.stripBg);
  }

  if (tf.frameCount > 0 && tf.binCount > 0) {
    for (let py = 0; py < plotH; py++) {
      const hz = yToHz(py + 0.5, fmin, fmax, yTop, yBot);
      const bin = nearestIndex(frequencies, hz);
      const row = py * width;
      for (let px = 0; px < plotW; px++) {
        const t = xToTime(x0 + px + 0.5, tMin, tMax, x0, x1);
        const frame = nearestIndex(tf.frameTimes, t);
        pixels[row + x0 + px] = lut[frame * tf.binCount + bin]!;
      }
    }
  }

  for (const g of gridlines) {
    const x = Math.round(timeToX(g.time, tMin, tMax, x0, x1));
    const color = g.emphasis ? PAL.measure : PAL.beat;
    const thick = g.emphasis ? 2 : 1;
    fillRect(pixels, width, height, x, yTop, x + thick, yBot, color);
    if (g.label && axis) {
      drawText(pixels, width, height, x + 3, 4, g.label, PAL.text, 1);
    }
  }

  if (axis) {
    const keyLeft = 28;
    for (let midi = 0; midi <= 127; midi++) {
      const hz = midiToHz(midi);
      if (hz < fmin || hz > fmax) continue;
      const yCentre = hzToY(hz, fmin, fmax, yTop, yBot);
      const yLo = hzToY(midiToHz(midi - 0.5), fmin, fmax, yTop, yBot);
      const yHi = hzToY(midiToHz(midi + 0.5), fmin, fmax, yTop, yBot);
      const isC = midi % 12 === 0;
      const color = isC ? PAL.cKey : isBlackKey(midi) ? PAL.blackKey : PAL.whiteKey;
      fillRect(pixels, width, height, keyLeft, yHi, x0, yLo, color);
      if (isC) {
        const label = cName(midi);
        const textH = 14;
        drawText(
          pixels, width, height,
          2, Math.round(yCentre) - Math.floor(textH / 2),
          label, PAL.text, 2,
        );
      }
    }
  }

  const semitonePx = Math.abs(
    hzToY(fmin * Math.pow(2, 1 / 12), fmin, fmax, yTop, yBot) -
    hzToY(fmin, fmin, fmax, yTop, yBot),
  );
  const boxH = Math.max(4, 0.5 * semitonePx);

  for (const note of overlay) {
    const xa = Math.max(x0, timeToX(note.time, tMin, tMax, x0, x1));
    const xb = Math.min(x1, timeToX(note.time + note.duration, tMin, tMax, x0, x1));
    // Sit the box in the half-semitone just above the fundamental band so it
    // does not cover the energy it annotates (finding 27).
    const aboveY = hzToY(midiToHz(note.midi + 0.75), fmin, fmax, yTop, yBot);
    const y0 = aboveY - boxH / 2;
    const y1 = aboveY + boxH / 2;
    const color = note.hand === "left" ? PAL.left : note.hand === "right" ? PAL.right : PAL.unmarked;
    strokeRect(pixels, width, height, xa, y0, xb, y1, color, 2);
  }

  for (let i = 1; i < contour.length; i++) {
    const a = contour[i - 1]!;
    const b = contour[i]!;
    drawLine(
      pixels, width, height,
      timeToX(a.time, tMin, tMax, x0, x1),
      hzToY(midiToHz(a.midi), fmin, fmax, yTop, yBot),
      timeToX(b.time, tMin, tMax, x0, x1),
      hzToY(midiToHz(b.midi), fmin, fmax, yTop, yBot),
      PAL.contour,
    );
  }

  const palette = buildPalette(colormap);
  const png = encodeIndexedPng(width, height, pixels, palette, options.compress);
  const sidecar: RenderSidecar = {
    width,
    height,
    colormap,
    topDb,
    axis,
    scale: tf.scale,
    fmin,
    fmax,
    tMin,
    tMax,
    overlayCount: overlay.length,
    contourCount: contour.length,
    gridlineCount: gridlines.length,
    byteLength: png.byteLength,
  };
  return { png, sidecar };
}
