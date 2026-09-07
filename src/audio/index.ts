// ─── ai-jam-sessions: Audio Analysis ─────────────────────────────────────────
//
// The audio counterpart to the MIDI inspector surface.
//
// THE ARCHITECTURE IN ONE PARAGRAPH. The model already queries the SCORE
// through deterministic tools rather than eyeballing a piano roll, because
// eyeballing is unreliable. Sound gets the same treatment. This layer turns
// rendered audio into numbers the model can reason about, and those numbers,
// not a picture, are what the timing and pitch gates run on. A spectrogram
// image is an optional orientation aid layered on top, never the measurement.
// The evidence for that split is in docs/spectrogram-surface-study-2026-09.md.
//
// LAYERS, bottom to top:
//   fft / window        numerical primitives, zero dependencies
//   stft                framing, padding, the transform itself
//   mel                 the mel scale and filterbank, both conventions pinned
//   db                  decibel scaling, absolute for analysis, peak for display
//
// Everything here is pure and synchronous. Nothing reads a file, touches the
// network, or depends on Web Audio, so the same code runs in Node and in the
// cockpit and produces identical numbers in both.
// ─────────────────────────────────────────────────────────────────────────────

export { Fft, isPowerOfTwo, fftFrequencies } from "./fft.js";

export {
  hann,
  hamming,
  blackman,
  rectangular,
  window,
  type WindowName,
} from "./window.js";

export {
  reflectPad,
  frameCountFor,
  frameSignal,
  stft,
  type StftOptions,
  type Spectrogram,
  type TimeFrequencyData,
} from "./stft.js";

export {
  hzToMel,
  melToHz,
  melFrequencies,
  melFilterbank,
  applyFilterbank,
  type MelScale,
  type MelNorm,
  type MelFilterbankOptions,
  type MelFilterbank,
} from "./mel.js";

export {
  powerToDb,
  amplitudeToDb,
  type DbOptions,
} from "./db.js";
