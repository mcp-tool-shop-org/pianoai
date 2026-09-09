# Handoff 01 — Claude to Grok Build: constant-Q transform and onset detection

**Paste target:** a fresh Grok Build session with `E:/AI/ai-jam-sessions` open.
**Arc:** the audio inspector surface, from study to shipped tools to dataset to trained LoRA.
**This is chunk 2 of that arc.** Chunk 1 (the numerical floor) is done and described below.

---

## The arrangement

The Director has us alternating. One of us takes a chunk, then hands off with a brief in this
shape: what is already true, what to research, what to build, what to leave alone, and what to
say back. You finish your chunk and write handoff 02 back to Claude in this same shape.

**Testing cadence.** To keep momentum we are NOT running the test suite every chunk. Tests are
still written with the code, in the same commit, per the repo's hard rule. They simply do not
execute until a juncture. Writing tests is not optional and never was; only running them is
deferred. The junctures are listed at the end of this document. **Chunk 2 is not a juncture, so
do not run `pnpm test`.** Write the tests, leave them unrun, say so in your handoff.

**Commits.** This repo is under the operator-locked no-autonomous-commit doctrine. Stage nothing
and push nothing without the Director's explicit go. Leave your work in the working tree.

---

## What is already true (chunk 1, done)

The study behind all of this is `docs/spectrogram-surface-study-2026-09.md`. Read its revised
architectural lock before you start. The one-paragraph version:

> The surface is an **audio inspector**, not a picture. This repo already proved the pattern with
> its MIDI inspector tools: a model cannot reliably eyeball a piano roll, so it queries the score
> instead. Sound gets the same treatment. Tier 1 is deterministic numbers and is where the gates
> live. Tier 2 is transcription, which lets audio enter the EXISTING scoring and scored-roll
> stack. Tier 3 is an optional image for orientation only. No gate ever routes through a picture.

I built the numerical floor at `src/audio/`. All of it is pure, synchronous, dependency-free, and
runs identically in Node and the browser:

| file | what it gives you |
|---|---|
| `fft.ts` | `Fft` class, radix-2, with `magnitude()` and `power()` per frame; `fftFrequencies()` |
| `window.ts` | `hann`, `hamming`, `blackman`, `rectangular`, all PERIODIC; `window(name, n)` |
| `stft.ts` | `reflectPad`, `frameCountFor`, `frameSignal`, `stft` returning a `Spectrogram` |
| `mel.ts` | `hzToMel`/`melToHz` in both conventions, `melFilterbank`, `applyFilterbank` |
| `db.ts` | `powerToDb`, `amplitudeToDb`, absolute by default, peak-relative opt-in |
| `index.ts` | the barrel; import from `./audio/index.js` |

Each has a `.test.ts` beside it, written and unrun.

**Four decisions you inherit and should not relitigate:**

1. **We write our own FFT rather than take `fft.js`.** Every n_fft here is a power of two, an
   MIT package with zero runtime deps is easier to audit, and pure JS float64 is deterministic
   across platforms in a way a WASM build is not. The study recommended the dependency; I chose
   against it for those three reasons. Reuse `Fft`, do not add another.
2. **Windows are periodic, not symmetric.** This matches librosa and scipy's `fftbins=True`.
3. **`center: true` with reflect padding is the default**, so frame `t` is centred on sample
   `t·hop`. Without it every onset time is early by half a window, which at n_fft 2048 and
   44.1 kHz is 23 ms, more than half our 40 ms gate.
4. **dB is absolute (`ref: 1.0`) for analysis and peak-relative only for display.** A
   peak-relative reference makes every value change when a clip is trimmed, which is fine for
   rendering and fatal for a stored gate result or a golden fixture.

---

## Your chunk: research

Two questions, both of which change what you build. Cite what you find, with URLs you actually
opened, in your handoff back.

**R1. Constant-Q kernels in pure TypeScript.** The lock wants a true CQT at 60 bins per octave
from C1, 6 to 7 octaves, at a hop of 512 at 44.1 kHz. A pseudo-CQT built by binning a single
long STFT will NOT do: at C3 a 20-cent bin is about 1.5 Hz, which no practical FFT bin resolves.
Find the standard efficient construction and decide which to implement. Brown & Puckette 1992 is
the original kernel method; Schörkhuber & Klapuri 2010 is the toolbox that most implementations
follow, and it is worth checking whether their recursive downsampling approach is worth the
complexity here or whether direct per-bin kernels are enough at our sizes. The npm package
`cqt-web` claims librosa-compatible CQT and is MIT, so read it as a reference implementation
even though we are not taking the dependency. **Neither of those two papers was retrievable
during the study**, so the CQT rule currently stands on arithmetic alone. If you retrieve them,
say so, because that closes a real gap in the record.

**R2. Monophonic f0 tracking in JS or ONNX.** Tier 1 needs cents against a target note. The study
found SwiftF0 reads the magnitude spectrogram with a small trained model, 95,842 parameters,
about 42 times CREPE's CPU speed (arXiv:2508.18440), and that pYIN and CREPE are the classical
and neural baselines. Question: what actually runs in this repo? Options are a pure-JS YIN or
pYIN implementation, or `onnxruntime-web` (MIT, current) with a SwiftF0 export. Report license,
last release, model-file size, and whether it runs in both Node and the browser. **Do not install
anything yet.** Recommend, with the tradeoff stated, and let Claude's chunk 3 make the call.

---

## Your chunk: build

**B1. `src/audio/cqt.ts` plus `cqt.test.ts`.**

Build on `Fft` and the framing in `stft.ts`. Do not rewrite either. Shape it to match the module
style you will see in `mel.ts`: an options interface with explicit defaults, a returned object
carrying its own resolved `params` so a render sidecar can be stamped from it, and errors that
tell the caller what to change rather than just what failed.

Target API, adjust if your research says otherwise but say why:

```ts
export interface CqtOptions {
  sampleRate: number;
  fmin?: number;          // default 32.703195 (C1)
  binsPerOctave?: number; // default 60, i.e. 20 cents
  octaves?: number;       // default 7
  hopLength?: number;     // default 512
}
export function cqtKernels(options: CqtOptions): CqtKernels;
export function cqt(samples: ArrayLike<number>, options: CqtOptions): Spectrogram;
export function binToMidi(bin: number, options: CqtOptions): number;
export function midiToBin(midi: number, options: CqtOptions): number;
```

The `binToMidi` and `midiToBin` pair matters more than it looks. It is what makes the picture
line up with the piano roll later, and it is the thing that lets a test assert "a 50-cent sharp
A4 lands 2.5 bins above the A4 bin," which is the property the whole CQT-primary decision rests
on. **Write that test.**

**B2. `src/audio/onsets.ts` plus `onsets.test.ts`.**

SuperFlux, per Böck & Widmer 2013. Plain spectral flux over-fires on vibrato, and vibrato is
exactly our failure mode on the vocal route; the maximum-filter trick cuts false positives by up
to 60% on that material. Build:

- a spectral flux novelty curve from a log-mel spectrogram, using `melFilterbank` from chunk 1;
- the maximum filter over frequency that makes it SuperFlux rather than plain flux;
- peak picking with the usual pre/post-max and pre/post-mean windows and a delta threshold;
- output as onset times in **seconds**, derived from `Spectrogram.frameTimes`, never from a frame
  index the caller has to convert.

Two constraints from the study that must survive into the code, not just the docs:

- Report against **both** tolerances. Ours is 40 ms; the mir_eval convention is 50 ms. Publishing
  both is what makes our numbers comparable to published work.
- State-of-the-art onset F1 is about 0.88, so roughly one in eight detected onsets is wrong
  before any timing arithmetic. Whatever you return must carry a confidence or caveat field. The
  audio-derived onset must never silently override the MIDI-truth gate.

**B3. Synthetic fixtures, `src/audio/fixtures.ts`.**

We cannot run tests this chunk, and we have no golden data from librosa yet, so give the later
chunks something to assert against: generators for a sine at a given frequency and duration, a
sum of harmonics, a click train at known times, a linear chirp, and a note with vibrato at a
given rate and depth in cents. Deterministic, seeded where randomness is involved, no file I/O.
The click train is what makes an onset test meaningful, and the vibrato generator is what proves
the SuperFlux maximum filter is actually doing its job.

---

## Do not

- Do not run `pnpm test`, `pnpm verify`, or `pnpm typecheck` this chunk. Chunk 3 does that.
- Do not install any dependency. Recommend in your handoff; Claude's chunk 3 decides.
- Do not touch `src/mcp-server.ts`, `src/score-performance.ts`, or `src/piano-roll.ts`. Wiring the
  tools and the transcription bridge is chunk 3, and I want the seam clean.
- Do not write the renderer. That is tier 3 and it comes after the A/B in chunk 5.
- Do not commit or push.
- Do not edit `docs/spectrogram-surface-study-2026-09.md`. It is the research record. If your
  research contradicts it, say so in your handoff and Claude will amend it with a receipt.

---

## What to say back

Write `docs/handoffs/audio-inspector-02-grok-to-claude.md` in this same shape:

1. **What you built**, file by file, with the API you actually landed if it differs from B1.
2. **What you researched**, with URLs you opened, and specifically whether Brown & Puckette 1992
   or Schörkhuber & Klapuri 2010 were retrievable.
3. **Your f0 recommendation** with the tradeoff, so chunk 3 can just decide.
4. **Anything you found wrong** in chunk 1. I wrote five modules and their tests without running
   any of them; assume there is at least one defect and say so plainly if you spot it.
5. **What chunk 3 should do**, in the same what-to-research / what-to-build / do-not shape.

---

## The junctures

We do not run tests until one of these. I own the list and will revise it if the arc changes.

| # | When | What runs | Why here |
|---|---|---|---|
| **J1** | End of chunk 3, after the analysis layer is complete and wired but before MCP tools | `pnpm typecheck`, then `pnpm vitest run src/audio` | Everything downstream inherits these numbers. A defect in the filterbank or the padding silently corrupts every gate result after it, so the floor gets proved before anything stands on it. |
| **J2** | After the MCP tools and the piano-roll integration | Full `pnpm verify` | This is the first chunk that touches the existing server and the existing scoring path. The 1513 existing tests are the regression net for that. |
| **J3** | Before any dataset generation | `pnpm verify` plus `npx @mcptoolshop/shipcheck audit` | The dataset bakes in tool behaviour permanently. Generating traces against a broken tool produces a corpus that has to be thrown away. |
| **J4** | Before LoRA training | Release gate plus dataset validation | Same logic one level up: training against an unvalidated corpus wastes the run. |
| **J5** | Pre-release | Full treatment | The repo is not done until it is whole. |

If you hit something that makes you want to run tests early, that is a signal worth reporting.
Say it in your handoff rather than running them.
