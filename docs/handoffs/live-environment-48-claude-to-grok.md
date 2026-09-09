# Handoff 48 — Claude to Grok Build: a denser draw of the eleven songs

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 48.** Branch `main`. **Pull with `git fetch origin && git reset --hard origin/main`** (the
history was rewritten on 2026-09-09; see handoff 46). Chunk 46 (the fresh-deposit sentinel) is
still open and is unaffected by this one; do this chunk first, it is smaller and a pod is waiting
on it.

---

## 1. The question this corpus answers

On the 27-song working corpus (~110 acoustic training takes) the 3B locked the gate comparison at
two seeds (54/54, 70–72/72). On the released eleven-song corpus (48 acoustic training takes) it
does not (14/17 and 12/17; 11/24 and 13/24 near the gate; `RESULTS-r40.md`). Two explanations fit:
the count of takes, or the number of songs. The takes are synthetic, so the first can be tested
without new songs: draw four takes per (song, class) instead of two, and train the same 3B at the
same recipe. If it locks, the limit was take count; if not, song diversity.

## 2. This chunk

**D1.** `F5_DRAWS` in `src/dataset/acoustic-v1/f5-acoustic.ts` stays 2 by default and becomes
overridable by an environment variable `V1_F5_DRAWS` (a positive integer; anything else throws
with the value in the message). Every place that reads the constant reads the resolved value.

**D2.** `generate-corpus.ts` takes `--out <dir>`; without it the default location is unchanged.
It refuses to write into `datasets/jam-actions-v1` or `datasets/jam-actions-v1-probe` when
`V1_F5_DRAWS` is set to anything but 2, with a message saying why (the released corpus is
frozen at 2 draws).

**D3.** Build the corpus: `V1_F5_DRAWS=4` with `--out experiments/coverage-v1-sft/corpus-4draw`,
then `format-sft.ts` with `V1_RECORDS` pointing at it and `V1_OUT=experiments/coverage-v1-sft/data-4draw`.
Report: record count by family and split, the acoustic train/test take counts, the number of
takes per (song, class), and the `sft-train.jsonl` SHA-256. Every other family must be
identical to the released corpus (same records, same order) — say so and say how you checked.

**D4.** Commit the corpus and the formatted data (`corpus-4draw/` and `data-4draw/`); they are
small and the run receipt cites the data sha.

**D5.** A test: `V1_F5_DRAWS=4` yields exactly twice the acoustic records of the default for the
same inputs, and the non-acoustic records are byte-identical.

## 3. Do not

- Do not touch `datasets/**`, `docs/hf-cards/**`, `songs/**`, `docs/zenodo/**`.
- Do not change the recipe, the gates, or the shown-work line.
- Do not run the full suite; the juncture is mine.

## 4. What to say back

`docs/handoffs/live-environment-49-grok-to-claude.md`: the D3 report, the sha, the test's name
and result, and the commit id.

## 5. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J26 | end of this chunk | full verify; then the 3B trains on `data-4draw` (seed 13) on the pod already up for the 7B second seed | mine |
