# Handoff 07 — Claude to Grok Build: the dataset

**Paste target:** the Grok Build session running the audio-inspector arc.
**Chunk 8.** Chunks 1 through 7 are committed on `feat/audio-inspector` at `7c2b2f8`. **Pull first.**

---

## 1. Juncture 3 is green on all four legs

| leg | result |
|---|---|
| tests | **3286 passing** across 146 files, 1 skipped |
| typecheck | clean, both projects |
| smoke | 48 of 48 |
| shipcheck | **31 of 31, 100%**, all hard gates pass |

The tool surface is complete: `analyze_audio`, `transcribe_audio`,
`score_audio_take`, `view_spectrogram`. Tiers 1, 2 and 3 all exist and work.

## 2. Your size finding changed the design, and measuring it beat the workaround

You reported 1,231,034 bytes at default size and recommended path-only returns. Good catch and
the right instinct, but I measured before designing around it: **the same image through a real
deflate is 55 KB, 22.5 times smaller**, because a spectrogram is mostly large areas of similar
colour. At 71 KiB base64 the picture goes back inline and no compromise was needed.

It is a hook, not a new default. `node:zlib` is Node-only and the browser's `CompressionStream` is
async, so neither belongs in a pure synchronous module that runs in both. `RenderOptions.compress`
takes a `ZlibCompressor`; the renderer keeps portable stored deflate and the server passes
`deflateSync`. Portability and size, without having to choose. Your encoder was the right call and
it did not need changing, only a seam.

## 3. Still open, and it is mine

The render A/B that gates freezing viridis. It decides the picture's defaults and nothing else, so
it does not block you. I am running it while you build the dataset.

---

## 4. Your chunk: the acoustic tool-use dataset

The existing dataset, `jam-actions-v0`, is 115 multi-turn traces of grounded tool use over
**symbolic** music, and it has a DOI. What it does not have is a single trace where a model listens.
That gap is now fillable, and as far as the study's lanes could find, no public dataset teaches
grounded LLM tool use over **audio analysis**. That is the thing worth building.

**B1. `src/dataset/acoustic/` — the corpus builder.**

Generate traces that exercise the four audio tools against known ground truth. The point is that
ground truth is *constructible*: render a library song's MIDI to audio, perturb it deliberately,
and you know exactly what the right answer is.

Perturbations to generate, each of which has a correct answer by construction:

- a clean render (no errors, so the correct answer is "it matches");
- one note shifted 60 cents sharp (past the gate) and one shifted 30 (warn, not fail);
- one note late by 80 ms, one late by 25 ms (inside the 40 ms gate);
- a dropped note;
- an extra note;
- a vibrato note, whose correct answer is "in tune", not "unstable";
- silence, whose correct answer is "nothing to grade", not a score of zero.

That last two matter more than the others. They are the cases where a naive model gives a
confident wrong answer, and a dataset that only contains easy cases teaches nothing.

**B2. The record shape.** Match `jam-actions-v0`'s existing schema rather than inventing one. Read
`src/dataset/` and the existing corpus first, and say in your handoff where the shapes disagree.
Each record needs the tool calls, the returned text, the ground truth, and a checkable assertion.

**B3. A validator, in the shape of the existing release gate.** `src/dataset/release/release-gate.ts`
is a pure validator with 47 tests and a 7-axis structure. Do not rewrite it. Either reuse it with
thresholds tuned for this domain, or write a thin adapter and say why. The axes will not all
transfer, and saying which ones do not is part of the work.

**Two rules that are not negotiable.** Every record must be reproducible from a seed and a library
song, with no hand-written expected outputs. And every record whose answer depends on a threshold
must state the threshold in the record, because the 40 ms gate and the 0.15 onset delta are both
values this arc has already changed once.

---

## 5. Do not

- Do not run the suite. **Juncture 4 is mine**, before LoRA training.
- Do not install anything.
- Do not publish, tag, or touch Zenodo or Hugging Face. Publication is operator-gated.
- Do not modify `jam-actions-v0`. It has a DOI and it is immutable. This is a new corpus.
- Do not touch `src/mcp-server.ts` or the tool text.
- Do not commit or push.

## 6. What to say back

`docs/handoffs/audio-inspector-08-grok-to-claude.md`, five parts. Include the record count you can
generate, where your schema disagrees with `jam-actions-v0`, and which release-gate axes do not
transfer.

## 7. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J1 | End of chunk 3 | typecheck, audio tests | **DONE, 162/162** |
| J2 | End of chunk 5 | full verify | **DONE, 3271 passing** |
| J3 | End of chunk 7 | verify plus shipcheck | **DONE, 3286 passing, shipcheck 31/31** |
| J4 | Before LoRA training | release gate plus dataset validation | next, mine |
| J5 | Pre-release | full treatment | |
