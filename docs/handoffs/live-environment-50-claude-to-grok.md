# Handoff 50 — Claude to Grok Build: jam-actions-v1 1.1.0 is the four-draw corpus

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 50.** Branch `main`. Pull first (`git fetch origin && git reset --hard origin/main`). This
chunk comes before chunk 46, which stays open.

---

## 1. Why

`RESULTS-r48.md`: on the four-draw corpus you built in chunk 48 the 3B locks the gate comparison at
two seeds (36/36 and 36/36 on its own held-out takes, 17/17 and 17/17 on the 1.0.0 takes, 23/24 and
24/24 near the gate). The Director has authorised publishing that corpus as **jam-actions-v1 1.1.0**
(same eleven songs, same provenance, four draws) and then the two 3B adapters. The cards are already
written (`docs/hf-cards/jam-actions-v1.md` says 1.1.0 / 213 records; `jam-actions-v1-adapters-3b.md`
is new). Your chunk makes the repository say the same thing and regenerates the sets.

## 2. This chunk

**V1. Four draws is the default.** `F5_DRAWS` becomes 4, with the comment that 1.0.0 was built at
2. `V1_F5_DRAWS` still overrides. The released-directory guard in `generate-corpus.ts` now refuses
any draw count other than the default into `datasets/jam-actions-v1` (message says "frozen at 4
draws since 1.1.0"); the probe directory guard is unchanged in intent. The coverage-floor assertion
runs only when the shape-share floor can hold; at the default it is **reported, not asserted**:
`coverage.json` carries `floors_met: false` with the majority share, and the generator prints one
line saying so. Do not change any floor value.

**V2. Version 1.1.0.** `V1_PUBLIC_VERSION` = `1.1.0`; `manifest.json` `version` = `1.1.0`;
`schema_version` stays `jam-actions-v1/1.0.0` (the record shape did not change). The Zenodo
metadata payload says version 1.1.0 and keeps `isNewVersionOf` the concept DOI; its description
and the `$schema_note` name 1.1.0. The `CITATION.cff` abstract must describe **this** dataset —
derive the record count and song count from the manifest; the 1.0.0 file said "371 … 27 pieces",
which was wrong. The probe's citation text is unchanged.

**V3. Regenerate.** `datasets/jam-actions-v1` at the default (four draws): `records.jsonl` must be
byte-identical to `experiments/coverage-v1-sft/corpus-4draw/records.jsonl` (say how you checked),
manifest and coverage regenerated, checksums regenerated. Then `datasets/jam-actions-v1-public`
via `generate-public.ts` (it copies the cards from `docs/hf-cards`; the v1 card has no DRAFT
banner). Then `datasets/jam-actions-v1-probe` and `-probe-public`: regenerate and show they are
**unchanged** (`git status` clean for both) — the probe does not use `F5_DRAWS`.

**V4. Tests.** The chunk-48 test that compared `V1_F5_DRAWS=4` to the default now compares
`V1_F5_DRAWS=2` to the default (half the acoustic records, non-acoustic byte-identical). The
frozen-directory tests use the new message. Any test that regenerates the released corpus and
compares to the committed one passes at the new default. Do not skip anything.

**V5. Pack script.** `experiments/coverage-v1-sft/scripts/pack-adapters.mjs` takes `--set 7b`
(default, the current behaviour: `7b-s13`, `7b-s42`, card `jam-actions-v1-adapters.md`, output
`jam-actions-v1-adapters.tar.gz`) or `--set 3b` (`3b-4d-s13` from `runs/r48/A3b4d/epoch3` with
`run-config-A3b4d.json`, `3b-4d-s42` from `runs/r48/A3b4ds42/epoch3` with
`run-config-A3b4ds42.json`, card `jam-actions-v1-adapters-3b.md`, output
`jam-actions-v1-adapters-3b.tar.gz`). Anything else exits 1. Do not run it against the 3B — the
adapters are on my disk, not yours; run it with `--set 7b` and show the archive lists both 7B
directories as before.

## 3. Do not

- Do not touch `docs/hf-cards/**` (mine, already written), `songs/**`, `docs/zenodo/**`.
- Do not touch `experiments/coverage-v1-sft/data/` or `data-4draw/` (the receipts cite them).
- Do not publish anything. No workflow dispatch.
- Do not run the full suite; the juncture is mine.

## 4. What to say back

`docs/handoffs/live-environment-51-grok-to-claude.md`: the V3 byte-identity check and its result,
the probe's clean status, the manifest/coverage/citation values, the tests changed and their
results, the pack script's `--set 7b` listing, the commit id.

## 5. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J26 | chunk 48 | verify; 3B four-draw at two seeds; 7B seed 42 | **DONE** (`RESULTS-r48.md`) |
| J27 | end of this chunk | full verify; identity scan of both public sets; HF push of 1.1.0; Zenodo new version under the concept (Director's authority, given); DOI into the cards; the 3B adapters to HF | mine |
