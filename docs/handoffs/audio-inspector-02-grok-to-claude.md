# Handoff 02 — Grok Build to Claude: CQT, SuperFlux, fixtures, f0 recommendation

**Paste target:** a fresh Claude session with `E:/AI/ai-jam-sessions` open.
**Arc:** the audio inspector surface.
**This is chunk 2 of that arc.** Chunk 1 is the numerical floor (`7a623d3`) plus the pad-centre fix (`65534c6`). This chunk adds the CQT, SuperFlux, and synthetic fixtures. Work is in the working tree, uncommitted. Tests are written and unrun.

---

## The arrangement (unchanged)

Alternating chunks. Tests ship with the code; they do not run until a juncture. No autonomous commits. No installs. Operator-locked.

Chunk 2 was not a juncture. I did not run `pnpm test`, `pnpm verify`, or `pnpm typecheck`.

---

## 1. What I built

Started from local `feat/audio-inspector` @ `65534c6` (the pad-centre fix you landed after the plan). Remote has no `origin/feat/audio-inspector`; there was nothing to pull. I did not branch, merge, or commit.

### `src/audio/fft.ts` — `Fft.inverse()`

Separate method. `transform` semantics unchanged (unnormalised forward DFT). Inverse is the conjugate trick, `IFFT(X) = conj(FFT(conj(X))) / N`, with the `1/N` living on `inverse`. CQT does not call it; it is there for the ISTFT / phase-parity test you flagged as chunk-3-or-4.

### `src/audio/fixtures.ts` + `fixtures.test.ts`

Deterministic, no I/O, bit-identical across calls:

| function | ground truth |
|---|---|
| `sine({ frequency, duration, sampleRate, amplitude?, phase? })` | closed-form sinusoid |
| `harmonicStack({ fundamental, duration, sampleRate, amplitudes? })` | sum of integer partials; default `[1, 0.5, 0.25, 0.125]` |
| `clickTrain({ times, duration, sampleRate, amplitude?, widthSamples? })` | unit impulses at named seconds (onset ground truth) |
| `chirp({ startFrequency, endFrequency, duration, sampleRate })` | linear chirp, continuous phase |
| `vibratoNote({ frequency, duration, sampleRate, rateHz, depthCents })` | FM by `2^((depthCents/1200)·sin(2π rate t))`, integrated |

### `src/audio/cqt.ts` + `cqt.test.ts`

Landed API, vs the brief:

```ts
export const C1_HZ: number;            // 440 * 2^((24-69)/12), not a magic 32.7
export const KERNEL_SPARSITY = 0.01;   // peak-relative; reason on the constant
export function qFactor(binsPerOctave: number): number;
export function binToMidi(bin: number, options: CqtOptions): number;
export function midiToBin(midi: number, options: CqtOptions): number;
export function cqtBinFrequencies(options: CqtOptions): Float64Array;
export function cqtKernels(options: CqtOptions): CqtKernels;
export function cqt(samples, options, kernels?: CqtKernels): CqtSpectrogram;
```

`CqtOptions` matches the brief (`sampleRate`, `fmin?` default `C1_HZ`, `binsPerOctave?` 60, `octaves?` 7, `hopLength?` 512). Hop stays explicit.

`CqtSpectrogram` extends `TimeFrequencyData` with `params: Required<CqtOptions>` and `frequencies`. That is the seam you asked for.

`CqtKernels` is CSR-sparse in the frequency domain: `offsets`, `fftBins`, `real`, `imag`, plus `lengths`, `q`, `fftLength`, and `params` (including `sparsity` and `q`) so a sidecar can be stamped from it. Not 420 time-domain arrays.

Construction is Brown & Puckette 1992 as reconstructed by Blankertz: windowed complex exponential of length `N_k = ceil(Q·sr/f_k)`, pad-centred in an FFT of `nextpow2(N_0)`, thresholded at `KERNEL_SPARSITY` of that kernel's peak, stored as `conj(S)/N`. Window is this repo's periodic Hann, not Brown's Hamming — documented in the module header. Frames are centred on `t·hop`; edges zero-pad (`librosa.cqt` `pad_mode='constant'`), because a C1 kernel is longer than `reflectPad`'s `pad < length` budget.

The load-bearing test is in `cqt.test.ts`: `midiToBin(69.5) - midiToBin(69) === 2.5` at 60 bins/octave, plus a 50-cent-sharp A4 sine whose CQT peak sits within one bin of 2.5 above A4. Transform tests use `fmin = 220` (A3) and 2 octaves so the kernel FFT is 32 k, not the default 131 k.

**Default `fmin` is still C1**, as specified. See the R1 recommendation below for why chunk 3 should rule on that.

### `src/audio/onsets.ts` + `onsets.test.ts`

SuperFlux on log-mel (chunk 1 `stft` + `melFilterbank` + `powerToDb`). The max-filter itself, `superfluxNovelty(tf, maxFilterBins=3)`, takes `TimeFrequencyData`, so a CQT works without a conversion step.

```ts
export const HOUSE_TOLERANCE_MS = 40;
export const MIR_EVAL_TOLERANCE_MS = 50;
export const ONSET_DETECTOR_CAVEAT; // F1 ≈ 0.88, must not override MIDI-truth
export function detectOnsets(samples, options): OnsetResult;
export function scoreOnsets(detected, reference, tolerancesMs?): OnsetScore[];
export function superfluxNovelty(tf, maxFilterBins?): Float64Array;
export function spectralFluxNovelty(tf): Float64Array; // SuperFlux with width 1
```

`OnsetResult.onsets[].time` is seconds from `frameTimes`. `scoreOnsets` defaults to both 40 and 50. The caveat string is on every `OnsetResult`.

Peak-picker defaults (seconds, converted to frames): `delta=0.07` on a peak-normalised novelty, `preMax=0.03`, `postMax=0.03`, `preAvg=0.10`, `postAvg=0.07`, `combine=0.03`. `maxFilterBins=3` (odd; 1 is plain flux).

The vibrato-suppression test runs SuperFlux vs plain flux **on a CQT**, not on 229 Slaney mels. A 50-cent wobble at A4 is 2.5 CQT bins and in-bin on Slaney mel below ~2 kHz (finding 17 again). If that test is going to prove the max-filter, it has to walk a log-frequency grid. `detectOnsets` still builds log-mel, per the brief.

### `src/audio/index.ts`

Barrel updated. `TimeFrequencyData` was already exported from chunk 1's amend.

### Tests written, unrun

| file | covers |
|---|---|
| `fft.test.ts` | inverse round-trip of a cosine; IFFT of all-ones is an impulse |
| `fixtures.test.ts` | lengths, bit-identity, harmonic sum, click placement, chirp start, zero-depth vibrato = sine |
| `cqt.test.ts` | Q-factor, C1_HZ, **2.5-bin mapping**, kernel sparsity, 440 Hz peak, 50-cent peak, hop vs kernels, Nyquist error |
| `onsets.test.ts` | max-filter neighbourhood, 40 vs 50 ms scoring, click-train recall, caveat, SuperFlux < plain flux on CQT vibrato, steady sine is not a stream of onsets |

I wanted to run three of those before handing off: the CQT 440-Hz peak, the 50-cent peak, and click-train recall. Those are the ones where an off-by-one in kernel placement or a too-strict `delta` would only show up in numbers. I did not run them. That is the signal, as requested.

---

## 2. What I researched

### R1 — constant-Q kernels

**Brown & Puckette 1992: algorithm retrieved; JASA PDF not.**

- Abstract and metadata: MIT Media Lab page, https://www.media.mit.edu/publications/an-efficient-algorithm-for-the-calculation-of-a-constant-q-transform/ (16 June 1992). DOI 10.1121/1.404385, JASA 92(5):2698–2701.
- Working reconstruction I actually implemented from: Benjamin Blankertz, *The Constant Q Transform*, https://doc.ml.tu-berlin.de/bbci/material/publications/Bla_constQ.pdf — cites Brown 1991 and Brown & Puckette 1992, writes equations (2)–(10), and ships the MATLAB `sparseKernel` / `constQ` that is the standard reading of the 1992 method. Threshold in that MATLAB is an absolute `0.0054` for Hamming; we use a named peak-relative `KERNEL_SPARSITY = 0.01` because we window with Hann.
- Original JASA full text is paywalled (AIP). I did not get the 1992 PDF itself. The algorithm in our `cqt.ts` is Blankertz's, which is the one every later implementation follows.

**Schörkhuber & Klapuri 2010: algorithm confirmed; SMC PDF not in hand.**

- Record exists: Zenodo https://zenodo.org/records/849741 (`smc_2010_020.pdf`, SMC 2010, Barcelona). Direct PDF fetch returned `application/octet-stream` and failed; QMUL and soundsoftware.ac.uk URLs also failed.
- Algorithm confirmed from three sources I did open:
  1. librosa `cqt` docs: "This implementation is based on the recursive sub-sampling method described by Schörkhuber & Klapuri 2010." Source: https://librosa.org/doc-playground/0.9.0/generated/librosa.cqt.html and current `librosa/core/constantq.py`.
  2. Schörkhuber, Klapuri & Sontacchi 2012, *Pitch shifting of audio signals using the constant-Q transform*, DAFx-12, https://dafx.de/paper-archive/2012/papers/dafx12_submission_81.pdf — same authors, describes the 2010 toolbox (≈55 dB invertible reconstruction, high-Q 12–96 bins/octave, one octave computed then downsample by 2).
  3. `cqt-web` 1.0.4 (MIT, timcsy), https://www.npmjs.com/package/cqt-web and https://github.com/timcsy/cqt-web — WASM, librosa-compatible. `StandardCQT` = no downsampling (what we built). `HybridCQT` = recursive / early downsampling (Schörkhuber). `VQT` = variable-Q with a `gamma`. Reference only; not installed.

**The C1 number, with a recommendation.** At B=60, Q≈86.1. At 44.1 kHz:

| fmin | N_k | duration | fftLen | fraction of a 6 s page |
|---|---|---|---|---|
| C1 32.70 Hz | ≈116,000 | 2.63 s | 131,072 | ~44% |
| C2 65.41 Hz | ≈58,000 | 1.31 s | 65,536 | ~22% |

This is a **legibility** problem. Pitch gates are the f0 tracker. Onsets are SuperFlux on mel. The CQT is the picture plus the axis the f0 contour is drawn against.

Four options, as requested:

1. **Recursive octave downsampling** (Schörkhuber / librosa / `cqt-web` HybridCQT). Correct, standard, most complex. Not this chunk. Worth it only if J1 profiling says a 131 k FFT × ~500 hops is too slow for a 6 s take.
2. **Raise default `fmin` to C2.** Lock's default render range is already C2–C7. Halves the worst case for free. Keep C1 as an explicit option.
3. **Variable-Q at the bottom** (`cqt-web` VQT / librosa `vqt`, a `gamma` that floors kernel length). Keeps the C1 range, spends frequency resolution where kernels get unaffordable. More API surface, another number to pin.
4. **Keep C1 with direct sparse kernels** and document the smearing. **This is what shipped.** Default matches the brief and the lock. Module header states the 2.63 s figure.

**Recommendation for you to rule:** change the *default* `fmin` to C2 in chunk 3. Leave C1 as a caller-set option for anyone who wants the bass octave and accepts the smear. Do not implement recursive downsampling unless J1 says the 131 k path is too slow on a 6 s clip. Do not do variable-Q; it is a third number on a surface that is not the gate.

### R2 — monophonic f0, recommend, do not install

| option | license | last release I opened | size | Node | browser |
|---|---|---|---|---|---|
| **Own YIN** (de Cheveigné & Kawahara 2002) | ours, MIT like the rest | n/a | ~80–120 lines | yes | yes |
| `@audio/pitch-yin` | MIT | 1.0.5, npm ~2026-08-28, https://www.npmjs.com/package/@audio/pitch-yin | tiny JS | yes | yes |
| `@audio/pitch-pyin` | MIT | 1.0.1 listed on npm.io, Mauch & Dixon 2014 | tiny JS | yes | yes |
| `pitchfinder` | not confirmed this pass (npm page was a JS challenge); historically GPL-3 — do not take it until the license is opened | 2.3.4 | JS | yes | yes |
| **SwiftF0 ONNX** | MIT, Copyright 2025 Lars Nieradzik, https://github.com/lars76/swift-f0/blob/main/LICENSE | paper 2025-08-25 arXiv:2508.18440; live demo https://swift-f0.github.io/ (client-side ONNX.js / WASM) | **~389 KB** `model.onnx` (pitch-core MODELS.md: https://github.com/gzivdo/pitch-core/blob/5403e4e44d34eae31a10b22250061c7f881df114/MODELS.md); 95,842 params | via ORT | yes, already demoed |
| `onnxruntime-web` | MIT | **1.29.0**, npm 2026-08-24, https://www.npmjs.com/package/onnxruntime-web | npm package listed ~135 MB (wasm artifacts) | yes, **single-thread wasm only** | Chrome/Edge/Firefox/Safari, wasm; WebGPU Chromium-only |

This repo's vocal clock (`scripts/vocal_clock.py`, CHANGELOG) already treats **pYIN as primary and SwiftF0 as cross-check**. That is Python. The inspector needs something that runs in Node and the cockpit on the same numbers.

SwiftF0's supported range is **46.875–2093.75 Hz (G1–C7)**. It cannot see C1. That matters if the CQT default stays at C1 and anyone expects the tracker to cover the same axis.

---

## 3. f0 recommendation (chunk 3 can just decide)

**Write our own YIN in `src/audio/yin.ts`, same dependency-free style as `Fft`. Do not install `onnxruntime-web` for the gate.**

Why:

1. The pitch gate is a stored number. Pure JS float64 is deterministic across Node and the cockpit, which is the reason chunk 1 rejected `fft.js`. A 135 MB WASM runtime plus a 389 KB model is the opposite of that.
2. The vocal route already uses a classical tracker as primary. Matching that in JS keeps the two gates comparable.
3. SwiftF0's floor is G1. Our CQT default is C1. A tracker that cannot see the bottom octave of the picture is a footgun.
4. YIN is small. pYIN (HMM Viterbi over multiple thresholds) is the robustness upgrade if YIN fails on vibrato; that can be a later module, not the first one.
5. SwiftF0 remains a legitimate *cross-check*, the same shape as Python. Install `onnxruntime-web` only when you are ready to accept WASM in the cockpit and a model file in the package. Not required to close tier 1.

If you would rather take a package than write YIN, take `@audio/pitch-yin` (MIT, current), not `pitchfinder`. Still no ONNX for the gate.

---

## 4. Anything wrong in chunk 1

The pad-centre defect you already fixed at `65534c6` is the one I flagged in the plan. Confirmed on the tree: `frameSignal` sample selection was correct; `stft` now writes at `scratch[offset..]`; the new test pins the observable (magnitude) half and states that phase is untestable until an inverse exists. I added `Fft.inverse()` so that test is now unblocked for you.

I did not find a second chunk-1 defect while building on `Fft`, `frameSignal`, `melFilterbank`, or `powerToDb`. That is not the same as "there isn't one" — none of this has executed.

One latent trap I did not change: `reflectPad` still throws when `pad >= length`. Harmless for STFT at n_fft 2048 on any clip longer than 23 ms. Fatal for a C1 CQT if anyone tried to reuse it for a 131 k kernel. CQT zero-pads instead; documented.

---

## 5. What chunk 3 should do

### Research

None required to start, if you take the YIN recommendation. If you take SwiftF0 instead, open the actual `model.onnx` byte size from the `swift-f0` PyPI wheel (I have 389 KB second-hand from pitch-core's MODELS.md) and confirm `onnxruntime-web`'s wasm files will load from Node without extra CDN config.

Optional, not blocking: retrieve the Schörkhuber 2010 PDF from Zenodo by another path and amend the study record. I closed the algorithm gap; the PDF itself is still a hole, same class as Brown & Puckette's JASA PDF.

### Build

1. **Rule the CQT default `fmin`.** My vote is C2. The API already takes `fmin`; this is one default and a comment.
2. **`src/audio/yin.ts` + test.** Frame with `frameSignal`. Return Hz, MIDI, and cents-from-target. Same `params`-on-the-result shape. Write the test that a 50-cent-sharp A4 sine reports ≈ +50 cents.
3. **ISTFT / phase-parity test** on the short-window path, now that `Fft.inverse()` exists. You noted this; it is the real lock on `65534c6`.
4. **J1.** `pnpm typecheck`, then `pnpm vitest run src/audio`. Everything downstream inherits these numbers. If the CQT 50-cent peak or the click-train recall fails, fix here, do not wire tools on top.
5. Only after J1 is green: start the analysis-layer wiring. MCP tools and `scorePerformance` / piano-roll stay after that, at J2.

### Do not

- Do not install anything unless you explicitly take SwiftF0, and then only `onnxruntime-web` plus a vendored MIT `model.onnx`.
- Do not implement Schörkhuber recursive CQT unless J1 profiling says the 131 k path is too slow.
- Do not write the renderer. Tier 3, after the A/B in chunk 5.
- Do not edit `docs/spectrogram-surface-study-2026-09.md` except to add a retrieval receipt for Brown / Schörkhuber if you land the PDFs. The `fft.js` stale lock is already amended.
- Do not touch `src/mcp-server.ts`, `src/score-performance.ts`, or `src/piano-roll.ts` until J1 is green.
- Do not commit or push unless the operator says so. This chunk is uncommitted on purpose.

---

## Working tree

Uncommitted on `feat/audio-inspector` (HEAD `65534c6`):

```
M  src/audio/fft.ts
M  src/audio/fft.test.ts
M  src/audio/index.ts
?? src/audio/cqt.ts
?? src/audio/cqt.test.ts
?? src/audio/onsets.ts
?? src/audio/onsets.test.ts
?? src/audio/fixtures.ts
?? src/audio/fixtures.test.ts
?? docs/handoffs/audio-inspector-02-grok-to-claude.md
```
