# Release Notes — `jam-actions-v0` (public subset)

This file is the human-readable history of the package's version arc. Each entry names the version, the date, the slice that produced it, and a one-paragraph summary of what changed. For machine-readable metadata, see `manifest.json` (current state) and `CITATION.cff` (citation entry).

## Current version: 0.4.3 (2026-05-19)

### Slice 25 — Publication Execution (PUBLISHED 2026-05-19)

**`jam-actions-v0` v0.4.3 is now publicly published on Zenodo with DOI [`10.5281/zenodo.20279919`](https://doi.org/10.5281/zenodo.20279919).** This is the canonical citation handle going forward.

| | |
|---|---|
| **DOI** | `10.5281/zenodo.20279919` |
| **DOI URL** | https://doi.org/10.5281/zenodo.20279919 |
| **Zenodo record** | https://zenodo.org/records/20279919 |
| **Published at** | 2026-05-19 |
| **Files attached** | `jam-actions-v0-public-0.4.3.tar.gz`, `jam-actions-v0-public-0.4.3.zip` |
| **Tar.gz sha256** | `8148083bf51ed27285025f1461e6554151a0aae5e5a88a946f3955508a47814a` |
| **Zip sha256** | `6219de596b2c1b9e51f276e3718ffb0b752ef7336a6d435cdccd2f250c3c60a9` |
| **License (Zenodo slug)** | `cc-by-sa-3.0` (substantively CC-BY-SA-3.0-DE; jurisdiction documented in `ATTRIBUTION.md`) |

**HuggingFace mirror:** **deferred.** The HF push step in `.github/workflows/publish-jam-actions-v0.yml` was blocked by a token-scope issue — the `HF_TOKEN` granted write access to the personal namespace but not to `mcp-tool-shop-org` org. Recovery is scoped as a follow-up patch: re-scope the fine-grained token at https://huggingface.co/settings/tokens to include `mcp-tool-shop-org` org write, update the `HF_TOKEN` GitHub Actions secret, and re-trigger `.github/workflows/push-jam-actions-v0-hf.yml`. See `publication-receipt.json` for the machine-readable status.

**Publication doctrine compliance:** the publication was operator-mediated. The Phase B gate format from the Slice 25 kickoff was presented explicitly before the irreversible action (DOI mint). No tokens entered Claude's context, no tokens appeared in any log, file, or chat message — tokens lived only in GitHub Secrets and were injected into workflow runners as env vars. The Slice 22 RC-gate PASS verdict at `evals/slice22-release-gate-revised-assessment.json` was re-verified by the publish workflow's pre-flight step before any irreversible API call.

The `0.4.3` version number is unchanged — this is a publication event of the existing 0.4.3 package, not a new version. The new files in this commit (`publication-receipt.json`, DOI-added `CITATION.cff`, this annotation) RECORD the publication; they don't change what was published.

### Slice 24.5 — HuggingFace Dataset-Card Polish

Addresses the 5 optional WARN-level gaps surfaced by Slice 24's `hf-dataset-card-check.md` validation. The README YAML frontmatter now declares `source_datasets`, `multilinguality`, `annotations_creators`, `language_creators`, and `pretty_description` with defensible honest values. `ATTRIBUTION.md` gains a new "Annotation provenance — who wrote what (human-in-the-loop)" section that surfaces the dual-population (operator + AI-agent under operator review) story behind the `annotations_creators` slug list. `task_ids` is intentionally absent because HF's enum is NLP-specific and doesn't fit MCP tool-use over symbolic music; the decision is documented. `configs` keeps the single-data-files + per-record `split` column declaration to honor the operator-locked "no record-content changes" rule. NO record content changes. NO eval reruns. The Slice 22 RC-gate PASS verdict at `evals/slice22-release-gate-revised-assessment.json` remains the canonical gate-cleared state.

Patch bump from 0.4.2 is consistent with the Slice 10.5 / Slice 23.5 / Slice 24 precedent (docs-only / metadata-only patch with no record-content change). The 5 polished YAML fields are material metadata changes — the package now self-describes more accurately to HF consumers — which justifies the bump per the operator's locked rule "0.4.2 unless content metadata materially changes; if metadata files change, 0.4.3 is acceptable."

## Previous version: 0.4.2 (2026-05-19)

**Slice 24 — Publication Dry-Run.** Adds three new curated files to the package — `RELEASE_NOTES.md` (this file), `zenodo-metadata.json` (a schema-valid Zenodo deposition metadata payload), and `hf-dataset-card-check.md` (a field-by-field validation report against the HuggingFace dataset-card schema). These three files prepare the package for an eventual Slice 25 actual publish (Zenodo + HuggingFace) without executing any upload or DOI mint. NO record content changes. NO eval reruns. The Slice 22 RC-gate PASS verdict at `evals/slice22-release-gate-revised-assessment.json` remains the canonical gate-cleared state.

Patch bump from 0.4.1 is consistent with the Slice 10.5 / Slice 23.5 precedent (docs-only patch with no record-content change).

## What this release IS

- A complete dry-run dossier for actual publication: archive build verified, Zenodo metadata schema-valid, HF dataset card validated.
- Reproducible from a cold-clone state: a fresh Windows / macOS / Linux contributor can clone, install, and verify 270/270 checksums in ~2 seconds and reproduce the canonical PASS verdict end-to-end (Slice 23.5 earned this; Slice 24 confirmed it via network-clone verification).
- A candidate release. Per the source-repo doctrine, **gate clearance is NOT release approval.** The PASS verdict means the dataset's data-quality axes clear the locked thresholds; the publication decision is downstream and operator-locked.

## What this release IS NOT

- A live Zenodo deposit. No DOI has been minted. Slice 24's `zenodo-metadata.json` is the metadata that WOULD attach to an actual deposit, not a record of one that occurred.
- A live HuggingFace dataset upload. No HF API call has been made. The README's YAML frontmatter is validated as upload-ready; the upload itself is downstream.
- A scope-expanded dataset. The 115 records, 8 songs, single-arranger, piano-only, English-only-annotations scope is unchanged. See `KNOWN_LIMITATIONS.md` for the honest scope statement.

## Cross-references

- **Canonical PASS verdict** for the current state: `evals/slice22-release-gate-revised-assessment.json` (release-gate-assessment/2.0.0 schema; all 6 blocking axes PASS at the Slice 22 revised state)
- **Reproducibility evidence** (the most recent quality improvement): see the source repo's Slice 23.5 doc — `docs/jam-actions-v0-slice23-5-reproducibility-cleanup.md` — for the operator-aloneness audit closeout
- **Source corpus state** at packaging time: source commit `4b0f181`, source tag `jam-actions-v0-rc-gate-revised-2026-05-19` (Slice 22 baseline), with Slice 23.5 reproducibility-cleanup and Slice 24 publication-dry-run patches layered on top
- **Slice 24 publication-dry-run doc** (source repo): `docs/jam-actions-v0-slice24-publication-dry-run.md`

## Version arc — full history

| Version | Date | Slice | Summary |
|---|---|---|---|
| 0.1.0 | 2026-05-17 | Slice 10 | Initial public package — 115 records across 8 compositions verified to piano-midi.de via Slice 2.5 URL verification. License declared as CC-BY-SA-3.0-DE (layered: public-domain compositions + Bernd Krueger arrangements + share-alike-inherited derivatives). HuggingFace YAML frontmatter added to the README to make it a valid HF dataset card. Initial `manifest.json`, `splits.json`, `provenance-verification.json`, `checksums.sha256`. |
| 0.1.1 | 2026-05-17 | Slice 10.5 | Documentation hardening — added `DATASET_SCHEMA.md` (record schema doc), `KNOWN_LIMITATIONS.md` (honest scope statement), `ATTRIBUTION.md` (layered-license obligations + BibTeX + per-song evidence URLs). No record-content changes. |
| 0.2.0 | 2026-05-17 | Slice 11 | 6 records enriched via durable overlay mechanism — annotation-grounding signal made more anchorable. Minor-version bump (records changed). |
| 0.3.0 | 2026-05-18 | Slice 16 | Rubric-guided 3-record cohort enriched — second wave of annotation-target tightening on records that had been borderline-passing the rubric. |
| 0.4.0 | 2026-05-19 | Slice 21 | Schumann m045-048 R6-aware rewrite — the catastrophic-stratum failure from the Slice 19 baseline was repaired via a rubric-6-aware annotation rewrite. This was a single-record content change but it's the most operationally important change in the v0 arc: it took the corpus from a FAIL-on-axis-1 state to a PASS-on-all-blocking-axes state. The Slice 21 fair-E3 baseline (`evals/slice21-fair-e3-baseline-results.json`) is the canonical post-repair eval artifact. |
| 0.4.1 | 2026-05-19 | Slice 23.5 | Reproducibility hardening — cold-Windows-contributor audit (Slice 23) surfaced 3 blockers and 8 moderate gaps; Slice 23.5 closed them. Concrete changes: CRLF normalization for `*.sha256` via `.gitattributes` (Windows clones now verify cleanly), CRLF-tolerant verifier as defense in depth, CLI strict mode (release-gate validator now hard-fails on unknown axes / schema drift), Reproducibility section in README, and the Slice 23 audit doc shipped to the repo. No record-content changes. |
| 0.4.2 | 2026-05-19 | Slice 24 | Publication dry-run — three new curated files: `RELEASE_NOTES.md` (this file), `zenodo-metadata.json` (Zenodo deposition payload, schema-valid, no DOI/auth), `hf-dataset-card-check.md` (HF dataset-card field-by-field validation, PASS with 5 optional WARN-level polish items). Patch bump per the Slice 10.5 / 23.5 docs-only precedent. No record-content changes. No eval reruns. |
| 0.4.3 | 2026-05-19 | Slice 24.5 | HF dataset-card polish — closes the 5 WARN-level gaps from Slice 24 by adding `source_datasets: [original]`, `multilinguality: [monolingual]`, `annotations_creators: [expert-generated, machine-generated]`, `language_creators: [expert-generated, machine-generated]`, and a 1-sentence `pretty_description` to the README YAML frontmatter. `ATTRIBUTION.md` gains a "human-in-the-loop" provenance section that surfaces the operator + AI-agent dual-population story behind the slug-list choice. `task_ids` intentionally absent (HF's enum is NLP-specific; documented). `configs` unchanged (single records.jsonl + per-record `split` column honors the no-record-changes lock). `hf-dataset-card-check.md` re-validated: 0 FAIL, 0 unresolved WARN. Patch bump per the operator-locked threshold rule for metadata-content changes. No record-content changes. No eval reruns. |

## Decision history — version-bump precedent

The version-bump pattern across the arc:

| Bump type | When applied | Examples |
|---|---|---|
| Minor (`0.x.0 → 0.(x+1).0`) | Record content changes (records enriched, rewritten, or added) | 0.1.1 → 0.2.0 (Slice 11), 0.2.0 → 0.3.0 (Slice 16), 0.3.0 → 0.4.0 (Slice 21) |
| Patch (`0.x.y → 0.x.(y+1)`) | Docs-only / tooling-only / metadata-only changes; no record-content changes | 0.1.0 → 0.1.1 (Slice 10.5), 0.4.0 → 0.4.1 (Slice 23.5), 0.4.1 → 0.4.2 (Slice 24), 0.4.2 → 0.4.3 (Slice 24.5) |
| Major (`0.x → 1.0`) | Reserved for the actual public release; **not yet earned** per the operator-locked "gate clearance is not release approval" doctrine | (future) |

## What v1.0 would require (forward-looking, not promised)

- An operator decision that the candidate RC gate-PASS state is sufficient for first public release
- Successful execution of Slice 25's actual publish (Zenodo deposit + DOI mint + HuggingFace dataset upload)
- The 5 WARN-level HF metadata polish items addressed (DONE — Slice 24.5 closed all 5; see `hf-dataset-card-check.md` for the re-validated 0-unresolved-WARN state)
- Possibly: a v0.5.0 records-changed bump if any pre-release record polish is warranted

v1.0 is **not** a decision this slice makes. This slice is dry-run only.

## Operator hard rules honored in this release

Per the locked doctrine since Slice 15:

- No autonomous commit at slice end — the operator authorizes commits
- No upload / push / DOI mint in dry-run slices (Slice 24's gate)
- No record content changes in dry-run slices
- No eval harness or release-gate validator logic changes
- Translations rule (global) — N/A here (no README translation step; the package's README is the dataset card, single-language by design)

## Maintainer

`mcp-tool-shop-org` — issues and corrections at https://github.com/mcp-tool-shop-org/ai-jam-sessions.
