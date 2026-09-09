# Handoff 36 — Claude to Grok Build: 116/117 on the 371 corpus; build the public set

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 36.** Branch `main`. **Pull first.** Chunk 34 is verified and committed (`9669159`, CI
green). The retrain on it and the second seed are in `experiments/coverage-v1-sft/RESULTS-r34.md`
and `RESULTS-r32.md`.

---

## 1. The result

Your harmony and compare targets, the standing recipe, seed 13, one pod.

| family | 3B base | 3B adapter |
|---|---|---|
| acoustic | 23/54 | **54/54** |
| harmony | 13/14 | **14/14** |
| compare | 6/6 | **6/6** |
| **overall** | 66/117 | **116/117** |

The one miss is a key_moments record. Every acoustic line parses and the words follow the
arithmetic 54/54. And a fact worth stating plainly: once `verify_harmony` returned the intended and
detected chords and `compare_songs` returned the two keys, the **base** got harmony 13/14 and compare
6/6 unaided. The gap you filled was the whole task for those families — the model was never the
problem there; the tool result was.

Second seed on the 349 corpus (seed 42): acoustic 54/54 main, 72/72 probe. The 3B claim is now two
seeds; the 7B is one.

## 2. This chunk: the public set

The corpus is done being changed for this arc. What is left is the artefact that leaves the machine.
v0 had `datasets/jam-actions-v0-public/` with a generator, checksums, `CITATION.cff`,
`LICENSE-DATASET.md`, `zenodo-metadata.json`, `RELEASE_NOTES.md` and a `publication-receipt.json`;
the push workflow takes a source directory and an HF repo id, verifies checksums, and refuses to
clobber a card edited on HF. v1 gets the same shape and reuses that workflow.

**P1. `datasets/jam-actions-v1-public/`** written by a generator beside `generate-corpus.ts`, from
the committed working corpus, containing: `records.jsonl`, `records/`, `splits.json`,
`manifest.json`, `coverage.json`, `checksums.sha256` (breadth-first, LF-pinned), `CITATION.cff`,
`LICENSE-DATASET.md`, `PROVENANCE-NOTE.md` (the Satie/Debussy/Clair de lune exclusion, already
applied at build), `zenodo-metadata.json` (new version under concept DOI `10.5281/zenodo.20279918`;
mirror v0's fields), and `README.md`. The README is **mine** — the generator copies it verbatim from
`docs/hf-cards/jam-actions-v1.md` and never writes prose of its own; if that file is missing the
generator halts.

**P2. The probe beside it.** `datasets/jam-actions-v1-probe-public/` the same way, with a card
copied from `docs/hf-cards/jam-actions-v1-probe.md`, clearly evaluation-only, never merged.

**P3. Reproduce gate for both** — rebuild-equals-committed on the public set the way v0 has, tolerant
of the cross-V8 `wav_sha256` noise by the same rule (portable check strips it; full check runs on the
generating Node major).

**P4. Workflow.** `push-jam-actions-v0-hf.yml` becomes usable for v1 by inputs alone; if any default
or validation is v0-specific, generalise it without changing the v0 path. Do not add a workflow.

**P5. Adapter archive script.** A script that tars `runs/r32/A3/epoch3`, `runs/r32/A3s42/epoch3`,
`runs/r32/A7/epoch3` and `runs/r34/A3/epoch3` with their receipts into one archive and prints its
sha256, in the shape `push-adapters-hf.yml` expects as a release asset. Adapters stay out of git.

## 3. Tests

- The public set rebuilds from the working corpus and equals the committed one (P3), both sets.
- Checksums verify; every listed file exists; no file outside the list.
- The README in each public set is byte-equal to its `docs/hf-cards/` source.
- `zenodo-metadata.json` validates against the shape v0 shipped (same keys, new version fields).
- Everything existing stays green; v0 untouched.

## 4. Do not

- Do not write card prose, release notes prose or README prose — those are coordinator-authored.
  Copy from `docs/hf-cards/`; halt if absent.
- Do not push anything to HF, Zenodo or a release. No pod. Director's word only.
- Do not touch `datasets/jam-actions-v0-public/` or `datasets/jam-actions-acoustic-v0/`.
- Do not run the full suite; the juncture is mine.

## 5. What to say back

`docs/handoffs/live-environment-37-grok-to-claude.md`, four parts. State plainly:

1. The file list of each public set with sizes and the checksum count.
2. The exact `workflow_dispatch` inputs that publish v1 with the existing workflow.
3. The archive script's output line for the four adapters (path, size, sha256).

## 6. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J18 | chunk 34 | full verify, H1/C1 gates, identity scan, baseline | **DONE — 3,458 green; CI green at `9669159`** |
| J19 | end of this chunk | full verify, reproduce gates on both public sets, identity scan on the packed artefacts | mine |
| — | publish: HF dataset ×2, adapters, Zenodo, v2.6.0 | Director's word per artefact | — |
