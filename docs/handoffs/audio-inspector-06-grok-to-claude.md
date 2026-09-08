# Handoff 06 — Grok Build to Claude: the spectrogram renderer

**Paste target:** a fresh Claude session with `E:/AI/ai-jam-sessions` open.
**Arc:** the audio inspector surface.
**This is chunk 6 of that arc.** Chunks 1–5 plus `TimeFrequencyData.scale` sit at `5940ea0`. This chunk adds the PNG renderer. Work is in the working tree, uncommitted. Tests are written and unrun.

---

## The arrangement (unchanged)

Tests ship with the code; they run at junctures. Chunk 6 is not a juncture. I did not run `pnpm test`, `pnpm verify`, or `pnpm typecheck`. No installs. No commits. J3 is yours, before dataset generation.

---

## 1. What I built

Started from `feat/audio-inspector` @ `5940ea0`. Working tree was already there.

### `src/audio/render.ts` + `render.test.ts`

Landed API:

```ts
export const DEFAULT_WIDTH = 1568;
export const DEFAULT_HEIGHT = 784;
export const DEFAULT_TOP_DB = 80;

export type ColormapName = "viridis" | "magma" | "grey";

export interface OverlayNote {
  midi: number; time: number; duration: number;
  hand?: "left" | "right";
}
export interface ContourPoint { time: number; midi: number; }
export interface Gridline { time: number; label?: string; emphasis?: boolean; }

export interface RenderOptions {
  width?: number;          // default 1568
  height?: number;         // default 784
  colormap?: ColormapName; // default viridis
  topDb?: number;          // default 80
  axis?: boolean;          // default true
  overlay?: OverlayNote[];
  contour?: ContourPoint[];
  gridlines?: Gridline[];
}

export interface RenderSidecar {
  width; height; colormap; topDb; axis;
  scale: TimeFrequencyScale;
  fmin; fmax; tMin; tMax;
  overlayCount; contourCount; gridlineCount;
  byteLength;
}

export function renderSpectrogram(
  tf: TimeFrequencyData,
  frequencies: ArrayLike<number>,
  options?: RenderOptions,
): { png: Uint8Array; sidecar: RenderSidecar };

export function encodeIndexedPng(width, height, pixels, palette): Uint8Array;
export function indexedPngByteLength(width, height): number;
```

**Encoder.** Palette PNG, colour type 3, 8-bit, filter-None, zlib `0x78 0x01`, stored deflate blocks, **one IDAT**. 256-entry PLTE: 0–239 are the colormap, 240–250 are drawing colours (keyboard, text, grid, overlay, contour). No tRNS — beat “low alpha” is a dim grey, because an indexed tRNS would have to prefix-cover every spectrogram index. Grey is the same path with a grey ramp.

**Was the hand-written encoder the right call?** Yes. It did not fight me. Size is a closed form of width × height (content-independent, because stored). Deterministic. Zero dependencies. The cost is the byte size below, which is a tool-design input, not an encoder defect.

**Scale.** Branches on `tf.scale`, throws on anything else:
- `magnitude` → `amplitudeToDb({ ref: "max", topDb })`
- `power` → `powerToDb({ ref: "max", topDb })`
- `db` → already decibels; peak-relative clamp to `topDb`, no second conversion

Silent input (linear peak ~0, or dB with no range) fills palette index 0 (floor) and does not throw. Peak-relative of a flat image would otherwise paint the whole frame as the colormap peak.

**Geometry.** Log-frequency y between `frequencies[0]` and `frequencies[n-1]`, **low at the bottom**. No silent C2–C7 crop. Time from `frameTimes[0]…[n-1]`. Axis on: 56 px left strip, C keys shaded and named (`C4`, not Hz), no colorbar. Overlay: hollow 2 px, no fill, half-semitone tall, sitting at midi+0.75 so it does not cover the fundamental. Blue right, coral left, white if `hand` omitted. Contour: 1 px cyan polyline. Gridlines: caller times only; `emphasis` is 2 px bright (measure), else 1 px dim (beat).

**Sidecar** is returned, never written.

### Default PNG size (the number chunk 7 asked for)

A default **1568 × 784** render is **1,231,034 bytes**.

Derived, then asserted:

```
raw scanlines     = 784 × (1 + 1568) = 1,230,096
zlib stored       = 2 + 19×5 + 1,230,096 + 4 = 1,230,197   (19 blocks of ≤65535)
PNG               = 8 + 25 + 780 + (12 + 1,230,197) + 12 = 1,231,034
```

Base64 over the wire is `ceil(1231034 / 3) * 4 = 1,641,380` bytes, about **1.56 MiB**. Stored deflate does not care about the picture, so overlay, axis, silence, and two-tone fixtures are all the same length at this size. I did not compress it.

### Tests written, unrun

| case | pins |
|---|---|
| signature, colour type 3, one IDAT, IEND | encoder shape |
| IHDR matches requested width/height | dimensions |
| two calls, identical bytes | determinism |
| silence, no throw, uniform floor | silent path |
| magnitude / power / db each render; `"linear"` throws | the scale field |
| axis vs overlay vs blind, three different byte strings, same length | flags |
| contour and gridlines each change bytes | chunk-7 data paths |
| viridis ≠ magma ≠ grey | both maps renderable |
| A3 and A5 rows brighter than A4 between; A3 row below A5 | invert |
| default 1568×784 `byteLength === 1_231_034` | tool-design number |

I wanted to run the invert check, the unknown-scale throw, and the 1,231,034 assertion. I did not.

### `src/audio/index.ts`

Barrel exports the renderer. LAYERS comment names it.

---

## 2. What I researched

Nothing new beyond the brief and the `tf.scale` amend. Viridis / magma stops are the published matplotlib listed-colormap samples, linearly interpolated to 240 entries. Not a third-party file.

---

## 3. What I recommend (for chunk 7)

1. **Do not inline a full-size PNG in the tool payload.** 1.23 MB binary / 1.56 MiB base64 is a lot to put next to the caveat text. Return a temp-file path the way `view_scored_piano_roll` already does, and optionally a smaller preview (`width`/`height` are already parameters — 392×196 is 77,722 bytes by the same formula). Measure in the A/B; I did not pick one.
2. **Feed `contour` from `trackPitch`** (voiced frames → `{ time, midi }`). Finding 24 is now renderable; the tool should actually pair them.
3. **Feed `gridlines` from the song's beat/measure times.** The renderer will not invent meter.
4. **Blind default, overlay opt-in**, as the lock says. The tool text asks the model to describe before comparing.
5. **Run the A/B before freezing viridis.** Both maps render. Do not hard-code the winner in the tool schema.
6. **Build before regenerating `tool-schemas.json`.** You already learned that the generator reads `dist/`.

No install. No `pngjs`. No recursive CQT. C1 stays the CQT default.

---

## 4. Anything wrong in chunks 1–5

Nothing new in the analysis layer. `tf.scale` was the defect this chunk would have hit; it is on the type now and the renderer throws if it is missing or junk.

I did not find a second renderer-side bug while reading `amplitudeToDb` / `powerToDb` (`ref: "max"` already falls back to 1.0 on all-silent, which is why the renderer special-cases silence to the floor colour instead of trusting peak-relative on a flat frame). That special case is new, in this chunk, and unrun.

---

## 5. What chunk 7 should do

### Research

None required to wire. The A/B is the research: transform × colormap × blind/overlay, scored against MIDI truth, on a jam-sessions task, as lock item 8.

### Build

1. `view_spectrogram` (and whatever compare-audio picture the A/B needs). Tool text is a public surface — yours.
2. Pass `tf.scale` through. Do not re-guess.
3. Pass `contour` from `trackPitch` and `gridlines` from the score clock.
4. Decide path-only vs inline using **1,231,034 bytes** as the full-size number.
5. **J3.** `pnpm verify` plus `npx @mcptoolshop/shipcheck audit`. Dataset generation bakes tool behaviour; do not generate against an unrun renderer.

### Do not

- Do not freeze the colormap before the A/B.
- Do not install a PNG library. The encoder is in-tree.
- Do not put gates through the image.
- Do not touch the analysis defaults (CQT fmin, YIN, SuperFlux `delta` 0.15) without a new measurement.
- Do not commit this chunk unless the operator says so. It is uncommitted on purpose.

---

## Working tree

Uncommitted on `feat/audio-inspector` (HEAD `5940ea0`):

```
M  src/audio/index.ts
?? src/audio/render.ts
?? src/audio/render.test.ts
?? docs/handoffs/audio-inspector-06-grok-to-claude.md
```
