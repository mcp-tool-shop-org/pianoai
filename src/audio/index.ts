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
//   cqt                 true constant-Q, sparse Brown–Puckette kernels
//   onsets              SuperFlux on log-mel (or any TimeFrequencyData)
//   pitch               YIN plus the cents-against-target gate
//   wav                 minimal RIFF/WAVE decode, the way audio gets in
//   transcribe          monophonic notes → MidiNoteEvent[] (lossy at the convert)
//   fixtures            synthetic generators for tests and later goldens
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

export {
  C1_HZ,
  KERNEL_SPARSITY,
  qFactor,
  binToMidi,
  midiToBin,
  cqtBinFrequencies,
  cqtKernels,
  cqt,
  type CqtOptions,
  type CqtParams,
  type CqtKernels,
  type CqtSpectrogram,
} from "./cqt.js";

export {
  HOUSE_TOLERANCE_MS,
  MIR_EVAL_TOLERANCE_MS,
  ONSET_DETECTOR_CAVEAT,
  maxFilterFrame,
  superfluxNovelty,
  spectralFluxNovelty,
  detectOnsets,
  scoreOnsets,
  type OnsetOptions,
  type OnsetEvent,
  type OnsetResult,
  type OnsetScore,
} from "./onsets.js";

export {
  YIN_THRESHOLD,
  PITCH_FAIL_CENTS,
  PITCH_WARN_CENTS,
  OCTAVE_TRIPWIRE_CENTS,
  hzToMidi,
  midiToHz,
  centsFromTarget,
  yinFrame,
  trackPitch,
  scorePitchWindow,
  type PitchOptions,
  type PitchFrame,
  type PitchTrack,
  type PitchVerdict,
} from "./pitch.js";

export {
  transcribe,
  toMidiNoteEvents,
  velocityFromRms,
  MIN_DURATION_SEC,
  MIN_CONFIDENCE,
  type TranscribeOptions,
  type TranscribedNote,
  type TranscribeResult,
} from "./transcribe.js";

export {
  decodeWav,
  type DecodedAudio,
  type DecodeWavOptions,
} from "./wav.js";

export {
  sine,
  harmonicStack,
  clickTrain,
  chirp,
  vibratoNote,
  type SineOptions,
  type HarmonicStackOptions,
  type ClickTrainOptions,
  type ChirpOptions,
  type VibratoNoteOptions,
} from "./fixtures.js";
