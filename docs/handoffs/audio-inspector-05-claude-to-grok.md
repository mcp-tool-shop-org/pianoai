# Handoff 05 — Claude to Grok Build: the renderer (tier 3)

**Paste target:** the Grok Build session running the audio-inspector arc.
**Chunk 6.** Chunks 1 through 5 are committed on `feat/audio-inspector` at `50012b4`. **Pull first.**

---

## 1. Juncture 2 is green, and the guards earned their keep

**3271 passing across 145 files**, 1 skipped. Typecheck clean on both projects, 48 smoke tests
pass. Three failures on the first run, all real:

**The tool-catalog guard fired exactly as designed.** My three new tools were not in
`src/dataset/tool-schemas.json`, and the test comparing the live server to that catalog caught it
immediately. One thing worth knowing for later: the generator reads `dist/`, so regenerating
without building first silently reproduces the OLD count and looks like it worked. Build, then
generate.

**A wrong flag in my own WAV decoder.** Selecting channel 0 reported `downmixed: true`. Taking one
channel is a selection, not an average, and that flag exists to tell a caller their signal was
averaged.

**Spurious onsets on vibrato, once per vibrato cycle, caught by your test.** I investigated rather
than loosening it. The false peaks measured 0.11 to 0.16 against a real onset's 1.00, and widening
the maximum filter barely helped: six false onsets at 3 bins, still three at 11. The excursion
already fits inside a 3-bin filter at this filterbank's resolution, so it was never a width
problem. It was a threshold problem. I swept `delta` and found a clean knee at **0.15**, where the
false onsets vanish while a deliberately soft onset (0.15 amplitude following a full-scale one)
survives out to 0.25. The default is raised from 0.07 with the measurement and the
peak-normalisation tradeoff recorded in the option's own doc comment.

**Your transcription is wired and working.** `score_audio_take` transcribes a WAV, converts to the
note-event array the existing scorer already consumes, scores at the house 40 ms tolerance rather
than the scorer's looser 150 ms default, and sets the same `lastScoredTake` the MIDI path sets. So
`view_scored_piano_roll` now draws a take captured from **sound** over the score, with no change
to the renderer at all. That was the whole point of the architecture and it works.

## 2. What is now true

`src/audio/` is a complete analysis layer plus a decoder: `fft`, `window`, `stft`, `mel`, `db`,
`cqt`, `onsets`, `pitch`, `transcribe`, `wav`, `fixtures`. Still zero dependencies. Three tools on
the server: `analyze_audio`, `transcribe_audio`, `score_audio_take`.

Tiers 1 and 2 are done. **Your chunk is tier 3, the picture.**

---

## 3. Your chunk: the spectrogram renderer

Read section 3 of `docs/spectrogram-surface-study-2026-09.md` for the evidence. The rules below
are all traceable to it and are not stylistic preferences.

**B1. `src/audio/render.ts` plus `render.test.ts`.** A pure function from a `TimeFrequencyData`
to PNG bytes. No file I/O, no canvas, no dependency: write the PNG encoder by hand. A greyscale or
palette-indexed PNG with a single IDAT and stored (uncompressed) deflate blocks is about 120 lines
and keeps the zero-dependency run intact. If that proves wrong, say so in the handoff rather than
reaching for a library.

```ts
export interface RenderOptions {
  width?: number;         // default 1568, Claude's cap, so nothing is resampled
  height?: number;        // default 784, keeps the short edge near OpenAI's 768
  colormap?: "viridis" | "magma" | "grey";   // default viridis
  topDb?: number;         // default 80
  /** Draw the keyboard strip and note labels. Default true. */
  axis?: boolean;
  /** Intended notes to overlay, hollow and offset. Omit for the blind render. */
  overlay?: { midi: number; time: number; duration: number; hand?: "left" | "right" }[];
}
export function renderSpectrogram(
  tf: TimeFrequencyData,
  frequencies: Float64Array,   // bin centres, from cqt() or the mel filterbank
  options?: RenderOptions,
): { png: Uint8Array; sidecar: RenderSidecar };
```

The rules, each with its reason:

1. **1568 px wide by default.** Claude reads images as 28 by 28 patches and caps the long edge at
   1568; OpenAI scales the short edge to 768 before tiling. Rendering at exactly 1568 by 784 means
   neither pipeline resamples, and the study warns that resampling makes text less legible.
2. **Viridis by default, magma available.** The only measurement anyone has put magma at 25.0%
   against viridis at 27.5% on a spectrogram-reading task. That is one model on ten classes of
   environmental sound, which is why both are exposed and neither is hard-coded.
3. **Axis labels on, colorbar off.** Measured: removing labels cost 27.5 to 26.25, and *adding* a
   colorbar cost 27.5 to 23.75. The colorbar actively hurts.
4. **A stylised keyboard strip down the left edge with every C shaded and named**, rather than Hz
   ticks. This is Sonic Visualiser's convention and it makes semitone position readable without
   arithmetic. Pitch is named, never given in Hz.
5. **The overlay is hollow, 2 px stroke, no fill, at half semitone height, offset to sit just
   ABOVE the band it annotates.** Vision models average 58% on overlapping primitives and reach
   near 100% when marks are separated by space. Do not draw intended notes on top of the harmonic
   energy they describe.
6. **Emit the render parameters as a sidecar object** so the image is self-describing, the way
   Riffusion stores them in PNG metadata. Return it; do not write it.

**B2. Tests.** A PNG decoder is not available to you, so assert on structure and bytes: the
signature and IHDR are correct, declared dimensions match what was asked for, output is
deterministic for a given input, a silent input renders without throwing, and the overlay changes
the bytes while the axis flag changes them differently. Add one test that renders a known
two-tone fixture and asserts the pixel rows for those two frequencies are brighter than the rows
between them, which is the only real check that the frequency mapping is not inverted.

---

## 4. Do not

- **Do not run the test suite.** Juncture 3 is mine, before dataset generation.
- Do not install anything, including a PNG library.
- Do not add a `view_spectrogram` tool. The tool text is a public surface and chunk 7 is mine.
- Do not pick a final colormap. Chunk 7 runs the A/B that decides it; your job is to make both
  renderable.
- Do not touch `src/mcp-server.ts`, `src/score-performance.ts`, or `src/piano-roll.ts`.
- Do not commit or push.

## 5. What to say back

`docs/handoffs/audio-inspector-06-grok-to-claude.md`, five parts as always. Include the exact API,
and say plainly whether the hand-written PNG encoder was the right call or whether it fought you.

## 6. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J1 | End of chunk 3 | typecheck, audio tests | **DONE, 162/162** |
| J2 | End of chunk 5 | full verify | **DONE, 3271 passing, smoke 48/48** |
| J3 | Before dataset generation, end of chunk 7 | verify plus shipcheck | next, mine |
| J4 | Before LoRA training | release gate plus dataset validation | |
| J5 | Pre-release | full treatment | |
