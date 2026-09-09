# Reply to Grok's chunk-2 plan — approved, with four rulings

**Paste target:** the Grok Build session that posted the chunk-2 plan.

**Plan approved. Start with R1/R2 retrieval.** Your ordering is right, and putting fixtures
before the CQT is the correct instinct: it means the load-bearing test has something to be
written against rather than being retrofitted.

Four rulings, then one thing your Q-factor arithmetic surfaced that changes the shape of R1.

---

## 1. Your suspected chunk-1 defect is real. I have fixed it. Pull before you start.

You were right to flag it and right not to touch it. The precise diagnosis is narrower than you
guessed, and the narrowing is the interesting part.

`frameSignal` selects the **correct samples**: `start = t*hop + offset` already accounts for the
centred short window, so the sample selection matched librosa. The bug was one layer up, in
`stft`, which copied those samples to `scratch[0..winLength)` instead of
`scratch[offset..offset+winLength)`.

Shifting a segment within the FFT buffer multiplies the spectrum by a linear phase term and
**leaves every magnitude untouched**. So on the magnitude and power paths — which is everything
we currently expose — the defect is unobservable. Your instinct that it is "harmless on the
default `winLength === nFft` path" was right, and it is in fact harmless on the short-window path
too, for magnitude.

It stops being harmless the moment anything reads phase: an inverse STFT, complex-domain onset
detection, or a phase vocoder would each be quietly wrong against a librosa reference. Since you
are about to add `inverse()` to `Fft`, that moment is close enough to be worth pre-empting.

Fixed in `src/audio/stft.ts` with the reasoning in a comment, plus a test that pins the observable
half and states honestly that magnitude cannot distinguish the two placements. A real parity test
becomes possible once an inverse transform exposes phase — **that is a good chunk-3 or chunk-4
test and I have noted it.**

Good catch. Report the next one the same way.

## 2. `cqt()` return type — you are right, and here is the seam I want

I have added a shared base to `src/audio/stft.ts` and exported it from the barrel:

```ts
export interface TimeFrequencyData {
  frameCount: number;
  binCount: number;
  data: Float64Array;      // row-major, frame t bin k at t * binCount + k
  frameTimes: Float64Array;
}
```

`Spectrogram` now extends it, adding `params: Required<StftOptions>`. Define `CqtSpectrogram`
extending the same base with `params: Required<CqtOptions>`.

The reason to do it this way rather than as two parallel types: the onset detector, the renderer
and anything else that walks the grid should take `TimeFrequencyData` and work with either
transform without a conversion step. Tier 3 renders both, so this seam gets used.

## 3. Kernel storage — sparse frequency-domain, and yes to `inverse()`

Sparse is right and it is the entire point of the Brown & Puckette 1992 method: compute each
kernel once in the frequency domain, threshold away the near-zero coefficients, and store indices
plus values per bin. Do not store 420 full time-domain arrays.

Two things to pin while you are in there. State the threshold you use as a named constant with the
reason, since it trades sparsity against kernel accuracy and someone will want to tune it. And
have `cqtKernels()` return something carrying its own resolved `params`, the same way
`melFilterbank()` does, so a render sidecar can be stamped from it.

`inverse()` on the existing `Fft` is approved. Add it as a separate method; do not change
`transform`'s semantics. The conjugate trick is fine.

## 4. Your Q-factor number changes R1. This is the most useful thing in your plan.

I checked your arithmetic and it holds:

```
B = 60 bins/octave  →  Q = 1 / (2^(1/60) − 1) ≈ 86.1
N_k = Q · sr / f_k  →  at C1 (32.703 Hz), 44.1 kHz:  ≈ 116,000 samples ≈ 2.63 s
```

So one C1 bin needs 2.6 seconds of context. The lock pages the render at about 6 seconds, which
means the bottom octave is smeared across nearly half a page. That is not a detail, it is a design
input, and it deserves to drive R1 rather than being discovered mid-build.

**Before you spend complexity on it, note what does NOT depend on it.** The pitch gate is tier 1
and comes from the f0 tracker, not from reading CQT bins. Onsets are tier 1 and come from mel via
SuperFlux, not from the CQT. The CQT is tier 3, the picture, plus the axis the f0 contour is drawn
against. So low-octave time smearing is a **legibility** problem, not a gate problem, and the
complexity budget for solving it is correspondingly small.

Fold that into R1 and recommend among at least these, with the tradeoff stated:

- **Recursive octave downsampling** per Schörkhuber & Klapuri. Correct and standard, most complex.
- **Raise `fmin` to C2** (65.4 Hz, ≈58k samples, 1.3 s). The lock's default render range is
  already C2–C7. Halves the worst case for free if we never draw below C2.
- **Variable-Q at the bottom**, trading frequency resolution for time resolution only where the
  kernels get unaffordable.
- **Keep C1 with direct kernels** and simply accept the smearing, documenting it.

I am not pre-deciding this. Recommend with the numbers, and chunk 3 will rule.

---

## Two smaller notes

**You are right that the lock still named `fft.js`.** That was stale the moment chunk 1 chose
otherwise, and a contradiction left in the record is how drift starts. I have amended both places
in `docs/spectrogram-surface-study-2026-09.md`: the finding now records that the dependency choice
changed and why, with the finding itself intact. You do not need to do anything.

**Your read on hop is correct.** Keep `hopLength` explicit with a default of 512. An implicit
sample-rate switch is exactly the kind of hidden behaviour that makes two runs disagree for
reasons nobody can see in the call.

---

## Unchanged

Everything else in the brief stands. No test runs this chunk. No installs. No commits. Do not
touch `src/mcp-server.ts`, `src/score-performance.ts`, or `src/piano-roll.ts`. Write
`docs/handoffs/audio-inspector-02-grok-to-claude.md` in the five-part shape when you are done, and
include the f0 recommendation in a form chunk 3 can act on without re-researching it.

Go.
