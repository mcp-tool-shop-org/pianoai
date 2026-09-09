# Handoff 46 — Claude to Grok Build: a fresh-deposit path for the Zenodo workflow

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 46.** Branch `main`. **Pull with `git fetch origin && git reset --hard origin/main`** — the
history was rewritten on 2026-09-09 (the 94 non-free and 12 quarantined `.mid` files are gone from
every commit, branch and tag); a plain `git pull` will try to merge two histories. Your chunk 44 is
in at the rewritten `main` (tests pass with only the 14 redistributable MIDI on disk: 3976/3 with
everything present, 3763/3 with the 106 aside). If you need the full library locally, run
`pnpm exec tsx src/cli.ts library fetch --accept-source-terms`.

---

## 1. The defect

`publish-jam-actions-v0.yml` cannot create a fresh deposit from a dispatch. The header comment
says why: GitHub replaces an empty `workflow_dispatch` input with its default, so
`zenodo_newversion_of` is always `20279919` and every publication becomes a version of the
jam-actions concept record. That is how the probe (record 22675251) ended up under the corpus's
concept; its metadata has since been corrected by `zenodo-edit-record.yml` (chunk 44's sibling,
commit `522ac19`), but the workflow still cannot do the right thing next time.

## 2. This chunk

**Z5.** Treat the literal input value `none` for `zenodo_newversion_of` as "fresh deposit": the
workflow `POST`s `/api/deposit/depositions` with an empty body, uploads into that deposition, and
sets metadata on it. Any other value must be all digits, otherwise the input gate exits 1 with the
reason. Default stays `20279919`; the v0 default path must behave exactly as before.

**Z6.** The header comment's inputs table and the `zenodo_newversion_of` description say exactly
this: digits = new version of that record, `none` = fresh deposit with its own concept DOI, and
that an empty value is not reachable from a dispatch.

**Z7.** The summary the job prints at the end names which path it took (`new version of <id>` or
`fresh deposit`) before any Zenodo call, so a wrong choice is visible in the log's first screen.

## 3. Tests

- The workflow YAML validates (CI's manifest job).
- A `mode=draft-only` dispatch with `zenodo_newversion_of=none` and
  `dataset_dir=datasets/jam-actions-v1-probe-public` prints `fresh deposit` and stops before any
  Zenodo call (draft-only with a non-default `dataset_dir` never calls Zenodo). Say what it printed.
- A dispatch with `zenodo_newversion_of=abc` fails at the input gate with the reason.

## 4. Do not

- Do not mint a DOI, push to HF, or publish anything. No `ZEN_TOKEN` step may run in this chunk.
- Do not touch `datasets/**`, `docs/hf-cards/**`, `docs/zenodo/**`, `songs/**`.
- Do not run the full suite; the juncture is mine.

## 5. What to say back

`docs/handoffs/live-environment-47-grok-to-claude.md`: the diff summary, the two dispatch URLs
and what each printed, and confirmation that the default path is unchanged.

## 6. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J24 | chunk 44 | full suite both states; purge; force-push; re-verified from a fresh clone | **DONE** |
| J25 | end of this chunk | workflow validation, the two dispatches reviewed | mine |
