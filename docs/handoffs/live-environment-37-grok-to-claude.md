# Handoff 37 — Grok Build to Claude: both public sets, the existing workflow, the adapter archive

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 36.** Branch `main` @ `36f4f91`. Work uncommitted. I did **not** run the suite.
Wrote `datasets/jam-actions-v1-public/` and `datasets/jam-actions-v1-probe-public/` from the
committed working corpora; public tests; v0 reproduce (untouched). Packed the four adapters
locally. **No push. No pod.** Cards copied from `docs/hf-cards/`; generator halts if they
are absent.

---

## 1. Public sets

Checksums are breadth-first, LF-pinned, and do not include `checksums.sha256` itself.

### `datasets/jam-actions-v1-public/`

**381 checksums**, 382 files on disk, 5,125,769 bytes.

| file | bytes |
|---|---|
| `CITATION.cff` | 882 |
| `LICENSE-DATASET.md` | 1,502 |
| `PROVENANCE-NOTE.md` | 1,152 |
| `README.md` (byte-equal to `docs/hf-cards/jam-actions-v1.md`) | 9,365 |
| `VERSION` | 6 (`1.0.0\n`) |
| `checksums.sha256` | 42,288 |
| `coverage.json` | 2,081 |
| `manifest.json` | 216 |
| `records.jsonl` | 2,269,620 |
| `splits.json` | 14,845 |
| `zenodo-metadata.json` | 2,853 |
| `records/*.json` | 371 files, 2,780,959 |

`zenodo-metadata.json` has the same keys as v0's (`$schema_note` + `metadata` with
title, upload_type, description, creators, keywords, license, access_right, language,
version, related_identifiers, subjects, references, notes). Version field is `1.0.0`.
Concept DOI `10.5281/zenodo.20279918`; no version DOI (Zenodo mints it).

### `datasets/jam-actions-v1-probe-public/`

**82 checksums**, 83 files on disk, 1,103,769 bytes.

| file | bytes |
|---|---|
| `CITATION.cff` | 887 |
| `LICENSE-DATASET.md` | 1,502 |
| `PROVENANCE-NOTE.md` | 101 |
| `README.md` (byte-equal to `docs/hf-cards/jam-actions-v1-probe.md`) | 3,382 |
| `VERSION` | 6 |
| `applied.json` | 19,272 |
| `checksums.sha256` | 9,463 |
| `manifest.json` | 261 |
| `records.jsonl` | 469,588 |
| `splits.json` | 3,576 |
| `zenodo-metadata.json` | 2,703 |
| `records/*.json` | 72 files, 593,028 |

Eval-only; `applied.json` is the search recipe. Never merged.

---

## 2. `workflow_dispatch` inputs (existing workflow, v0 path unchanged)

Workflow: `.github/workflows/push-jam-actions-v0-hf.yml`. Defaults still point at
`mcp-tool-shop/jam-actions-v0` / `datasets/jam-actions-v0-public`.

**jam-actions-v1:**

| input | value |
|---|---|
| `hf_repo_id` | `mcp-tool-shop/jam-actions-v1` |
| `dataset_dir` | `datasets/jam-actions-v1-public` |
| `commit_message` | `Publish jam-actions-v1 1.0.0` |
| `ref` | `main` |
| `allow_card_overwrite` | `false` |

**probe, same workflow:**

| input | value |
|---|---|
| `hf_repo_id` | `mcp-tool-shop/jam-actions-v1-probe` |
| `dataset_dir` | `datasets/jam-actions-v1-probe-public` |
| `commit_message` | `Publish jam-actions-v1-probe 1.0.0` |
| `ref` | `main` |
| `allow_card_overwrite` | `false` |

I did not dispatch either.

---

## 3. Adapter archive

`node experiments/coverage-v1-sft/scripts/pack-adapters.mjs` printed:

```
experiments/coverage-v1-sft/dist/jam-actions-v1-adapters.tar.gz  490056897  189b35528bb42e358c0c7bdf461ad3ec7522b693547aa30b70395bf5f4d5c713
```

490,056,897 bytes. Layout the updated `push-adapters-hf.yml` extracts: `README.md` (the
adapter card) plus `3b-s13-349/`, `3b-s42-349/`, `7b-s13-349/`, `3b-s13-371/`, each with
`adapter_model.safetensors`, `adapter_config.json`, and `receipt.json`. Dist is gitignored;
adapters stay out of git.

Dispatch that workflow (not run): `release_tag=jam-actions-v1-adapters`,
`asset_name=jam-actions-v1-adapters.tar.gz`,
`asset_sha256=189b35528bb42e358c0c7bdf461ad3ec7522b693547aa30b70395bf5f4d5c713`,
`hf_repo_id=mcp-tool-shop/jam-actions-v1-adapters`.

---

## 4. Tests and the tree

Public tests **7/7**. v0 reproduce **4/4** (v0 trees not written). Rebuild-equals-committed
for both public sets; README byte-equal to the cards; zenodo keys match v0; missing-card
path throws. wav_sha256 stripped on the portable record check, full byte check on Node 22.

```
 M .gitattributes
 M .github/workflows/push-jam-actions-v0-hf.yml
 M .github/workflows/push-adapters-hf.yml
?? src/dataset/acoustic-v1/generate-public.ts
?? src/dataset/acoustic-v1/public.test.ts
?? experiments/coverage-v1-sft/scripts/pack-adapters.mjs
?? datasets/jam-actions-v1-public/
?? datasets/jam-actions-v1-probe-public/
?? docs/handoffs/live-environment-37-grok-to-claude.md
```

**Yours:** J19 full verify, reproduce gates on both public sets, identity scan on the packed
artefacts. Publish is Director's word per artefact.
