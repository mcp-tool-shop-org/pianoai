# Handoff 51 — Grok Build to Claude: jam-actions-v1 1.1.0 is the four-draw corpus

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 50.** Branch `main` @ `602f0c4` (ahead of `origin/main` by 1). I did **not**
run the full suite. Did not touch `docs/hf-cards/**`, `songs/**`, `docs/zenodo/**`,
`experiments/coverage-v1-sft/data/` or `data-4draw/`. **No publish. No workflow
dispatch.** Chunk 46 stays open.

Commit: **`602f0c41a291f747f54689489ad02321a470c4b3`**
(`dataset: jam-actions-v1 1.1.0 is the four-draw corpus`).

---

## V3 — byte identity and the probe

`datasets/jam-actions-v1/records.jsonl` vs
`experiments/coverage-v1-sft/corpus-4draw/records.jsonl`: both **1,375,317**
bytes. Compared with `Path.read_bytes()` equality. **Byte-identical.**

Generator printed:
`coverage floors reported, not asserted: majority shape transcribe_audio>score_audio_take at 62.0% (floors_met: false)`
then `wrote 213 records`.

`generate-public.ts` wrote 213 records, 223 checksummed files to
`datasets/jam-actions-v1-public`.

Probe: ran `generate-probe.ts` (24 records) and `generate-public.ts --probe`
(24 records, 34 checksums). **`git status` clean** for
`datasets/jam-actions-v1-probe` and `datasets/jam-actions-v1-probe-public`.
The probe does not use `F5_DRAWS`; its public `VERSION` is still `1.0.0`.

---

## Values

Working `manifest.json`: `dataset_name` jam-actions-v1, `schema_version`
`jam-actions-v1/1.0.0`, **`version` 1.1.0**, `record_count` **213**, coverage
tools 10 / songs **11** / genres 2 / shapes 8.

`coverage.json`: n 213, majority `transcribe_audio>score_audio_take` at
0.6197, **`floors_met`: false**. Floors unchanged (`tools` 9, `songs` 10,
`shapes` 7). Families: acoustic 132, chord 10, compare 4, ensemble 7,
harmony 19, key_moments 8, measures 11, teaching_goals 11, transpose 11.

Public `VERSION` **1.1.0**. `CITATION.cff` abstract derived from the manifest:

> 213 multi-turn MCP tool-use traces over 11 public-domain piano pieces whose arrangements carry a verified licence, nine task families, split by song. Every assistant turn shows the comparison that decides its answer. Schema jam-actions-v1/1.0.0.

Zenodo payload: `$schema_note` names **1.1.0**; `metadata.version` **1.1.0**;
`isNewVersionOf` still `10.5281/zenodo.20279918`.

---

## V4 — tests

| test | result |
|---|---|
| `defaults to 4 and accepts a positive integer` | pass |
| `throws with the value in the message when V1_F5_DRAWS is not a positive integer` | pass |
| `refuses to write a non-default-draw corpus into the released v1 directories` (`frozen at 4 draws since 1.1.0`) | pass |
| `V1_F5_DRAWS=2 yields half the acoustic records of the default … non-acoustic … byte-identical` | pass |
| `rebuilds the committed corpus, exactly except for last-place float noise` | pass |

Public-set rebuild-equals-committed passed for both packages. The DRAFT-banner
injection test failed on this checkout because the card is CRLF and the
injector looks for LF frontmatter; I did not change `public.test.ts`.

---

## V5 — `pack-adapters.mjs --set 7b`

`--set` is `7b` (default) or `3b`; anything else exits 1 (`--set nope` did).
`--set 7b` wrote
`experiments/coverage-v1-sft/dist/jam-actions-v1-adapters.tar.gz`
(302,717,452 bytes, sha256 `5e925fb317f57bb51dcba58cca003f7590f6041d256d924ce75b6b309b59e7db`).
Archive lists both 7B directories (`7b-s13/`, `7b-s42/`) plus `README.md`. Dist
is gitignored. Did not run `--set 3b`.

Relative tar paths: Windows `tar.exe` rejects `--force-local`; packing from
`ROOT` with `relative()` keeps `E:` out of the argv.

---

**Yours:** J27 full verify, identity scan of both public sets, HF push of 1.1.0,
Zenodo new version under the concept (Director's authority, given).
