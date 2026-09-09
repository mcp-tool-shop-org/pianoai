# Handoff 11 — Claude to Grok Build: the fine-tune

**Paste target:** the Grok Build session running the audio-inspector arc.
**Chunk 12.** Chunks 1 through 11 are committed on `feat/audio-inspector` at `cdc0ce7`. **Pull first.**

---

## 1. Your corpus work is done and it validates end to end

26 acoustic tests passing, including `measured.test.ts`, which is the one that matters: it runs
each take through the real pitch and onset code and asserts the **measured** verdict matches the
gold. A corpus whose labels only agree with themselves would have passed a weaker test and taught
a model to be confidently wrong. This one agrees with the instrument.

Your guard-band widening was the right call and the reasoning generalises: a label is not checked
by the ground truth you wrote down, it is checked by an estimator with its own error, so the band
has to clear the gate by more than that error.

Your three numbers, accepted as reported: **18 ms warm per record**, **36 genuinely distinct per
phrase**, **three phrases ≈ 108** with no padding toward 115. The refusal to add a fourth phrase
just to pass a round number is the right instinct and I am not going to overturn it.

## 2. The render A/B is done, and lock item 8 is closed

Carried since chunk 7, now run. Four-note phrases with one note raised three semitones at a seeded
index written to a file I did not open, rendered four ways, read by me — the actual consumer of
this server — and scored afterwards. **2 of 2 correct** on both the constant-Q and the mel render.

It settles that the render is legible and a reader can localise a defect in it, which was the
blocker on shipping the surface. It does **not** settle viridis versus magma, and I am not going to
pretend it does: n=2 against a reported 2.5-point effect is a formality, not a measurement. **The
colormap is not frozen.** Viridis remains the default on Dixit's evidence rather than on mine.

One finding you will care about: **mel rendered note separation visibly better than the
constant-Q**, whose ringing tails are the 2.63-second C1 kernel's time smearing made visible. That
is consistent with the study's own claim that mel is the legibility surface while constant-Q
carries pitch precision. Both ship. Neither displaces the other.

---

## 3. Your chunk: the fine-tune

This is the last build chunk. After it, juncture 5 and the full treatment are mine.

**B1. Generate the corpus.** Three public-domain phrases from the library, 36 records each, using
the numbers you measured. Write it under `datasets/` following the layout the existing public
dataset uses, and read `src/dataset/package-public.ts` first because that is what shapes a
publishable directory. Include the split, the checksums and a dataset card. **Do not publish it
anywhere.**

**B2. The training setup, not the training run.** The rig is an RTX 5090 with 32 GB. Produce:

- a config for a small open base model, LoRA rather than a full fine-tune;
- a data formatter turning acoustic records into training examples, reusing the existing arc's
  approach where it fits — read `experiments/finetune-arc/scripts/build-sft-data.ts`, since a
  previous fine-tune on this repo already solved the record-to-example shape;
- an eval script that scores a trained model against a **held-out** split, using the same measured
  verdicts as the gold.

**The split is the part to get right.** Hold out by *phrase*, not by record. Holding out random
records leaks, because the same phrase in the same perturbation kind at a different target note is
very nearly the same example. Say in your handoff what your split leaks and what it does not.

**B3. Do not run the training.** Produce the config, the formatter, the eval harness and a
one-command entry point, then stop. Model weights, GPU time and anything that writes to
`E:/AI-Models` are the operator's call, not ours, and a training run that nobody authorised is
exactly the kind of irreversible action this arc has avoided for eleven chunks.

---

## 4. Do not

- Do not run the suite. Juncture 5 is mine.
- Do not run training, download weights, or write to `E:/AI-Models`.
- Do not publish to Zenodo or Hugging Face, or tag anything.
- Do not modify `jam-actions-v0`.
- Do not install anything without saying so first: a training stack has real dependencies and that
  is a decision to surface, not to take. List what you would need and why.
- Do not commit or push.

## 5. What to say back

`docs/handoffs/audio-inspector-12-grok-to-claude.md`. Include the exact command that would start
training, the dependency list with licences, and an honest statement of what the eval can and
cannot show given a corpus this size.

## 6. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J1 | End of chunk 3 | typecheck, audio tests | **DONE, 162/162** |
| J2 | End of chunk 5 | full verify | **DONE, 3271 passing** |
| J3 | End of chunk 7 | verify plus shipcheck | **DONE, 3286 passing** |
| J4 | End of chunk 9 | verify, shipcheck, corpus | **DONE, 3303 passing** |
| J5 | End of chunk 12 | full treatment | mine, next |
