# Handoff 42 — Claude to Grok Build: the Zenodo workflow is still v0-only

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 42.** Branch `main`. **Pull first.** The eleven-song corpus, both public sets, the cards and
the eleven-song results are committed; v2.6.0 is released and on npm; the HF pushes of the two
datasets and the 7B adapter go through the workflows you generalised in chunk 36, by inputs.

---

## 1. Where the arc stands

On the released corpus the 7B adapter scores 16/17 held out and **24/24** on the near-gate probe;
the 3B, at two seeds, 14/17 and 12/17 held out and 11/24 and 13/24 near the gate — it does not lock
the comparison from ~45 acoustic training takes and is reported, not published. Full numbers in
`experiments/coverage-v1-sft/RESULTS-r40.md`. The 7B needed a 96 GB card; it OOMs on a 48 GB Ada
at this sequence length, twice.

## 2. This chunk: `publish-jam-actions-v0.yml` for v1

Your chunk-36 generalisation covered `push-jam-actions-v0-hf.yml` and `push-adapters-hf.yml`. The
Zenodo path — `publish-jam-actions-v0.yml` — is still hard-wired to `datasets/jam-actions-v0-public`
and to v0-only receipts:

- line ~131: `VER=$(cat datasets/jam-actions-v0-public/VERSION)`
- lines ~148 and ~164: v0's `evals/slice21-fair-e3-baseline-results.json` and
  `evals/v${VER}-execution-verification.json` — files v1 does not have
- lines ~182–200: archive names and artifact name built from `jam-actions-v0-public`
- line ~310: `datasets/jam-actions-v0-public/zenodo-metadata.json`

**Z1.** Add a `dataset_dir` input (default `datasets/jam-actions-v0-public`, validated to start with
`datasets/` and to exist) and derive `VER`, the archive base name, the artifact name and the
metadata path from it. **Z2.** The two v0-only receipt steps run only when their files exist under
`dataset_dir`; when absent, the job prints that it skipped them by name — never silently. **Z3.**
The v0 dispatch with defaults must behave exactly as before; do not add a workflow. **Z4.** A dry
run that exercises the v1 path without a token: `mode=draft-only` against
`datasets/jam-actions-v1-public` must produce the archives and the metadata payload as artifacts and
stop before any Zenodo call. Say what it produced.

## 3. Tests

- Workflow YAML validates (the existing manifest job); the inputs table in the file's header
  comment matches the inputs.
- The v1 `draft-only` run's artifacts list, from the run.

## 4. Do not

- Do not mint a DOI, push to HF, or publish anything. Draft-only is the ceiling for this chunk.
- Do not touch `datasets/**` or `docs/hf-cards/**`.
- Do not run the full suite; the juncture is mine.

## 5. What to say back

`docs/handoffs/live-environment-43-grok-to-claude.md`: the diff summary of the workflow, the v1
draft-only run's URL and artifact list, and confirmation that the v0 default path is unchanged.

## 6. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J22 | the publication tree | full verify, identity scans of both public sets and the adapter archive | mine, in progress |
| J23 | end of this chunk | workflow validation, the draft-only run reviewed | mine |
| — | Zenodo publish of jam-actions-v1 1.0.0 and the probe | Director's word, `confirm_irreversible=yes-mint-doi` typed by him | — |
