# Release Notes — `jam-actions-v0` (public subset)

This file is the human-readable history of the package's version arc. Each entry names the version, the date, the slice that produced it, and a one-paragraph summary of what changed. For machine-readable metadata, see `manifest.json` (current state) and `CITATION.cff` (citation entry).

## Current version: 0.5.0 (2026-07-11)

### Record-content correction release — errata 001 + 002 (Bach BWV 846)

**This is the first record-content change since publication.** The sealed, published v0.4.3 (Zenodo DOI [`10.5281/zenodo.20279919`](https://doi.org/10.5281/zenodo.20279919)) is unchanged and remains available; per Zenodo versioning doctrine, corrections ship as a **new version under the concept DOI** ([`10.5281/zenodo.20279918`](https://doi.org/10.5281/zenodo.20279918), which always resolves to the latest version). The v0.5.0 version DOI is minted at publication and backfilled into `CITATION.cff` afterward.

**What changed (both errata are documented in full in the source repo under `docs/`):**

1. **Erratum 001 — `bach-prelude-c-major-bwv846:m061-064` window exceeded the song** (`docs/jam-actions-v0-erratum-001-bach-m061-064.md`). The source MIDI is exactly 62 measures (prelude mm. 1–35 + fugue mm. 36–62); the record's labels and synthesized trace claimed a 4-measure window ending at m64 that does not exist, and its frozen `play_song(61, 64)` call is rejected by the live MCP server. The record was retargeted to the two measures it always contained: id renamed to **`…m061-062…`**, trace calls corrected to `startMeasure: 61, endMeasure: 62`, piano-roll re-rendered, annotation anchors re-anchored, paired prompt record's continuation target updated, `splits.json` id swapped in place. Timed events untouched; REMI byte-identical.
2. **Erratum 002 — Bach annotation prose described music that is not there** (`docs/jam-actions-v0-erratum-002-bach-annotation-prose.md`). The original song spec narrated an imagined ~64-measure prelude; the actual file is prelude + **fugue**. All 16 Bach records' prose slots (phrase labels, annotation targets, and the user/analysis/summary trace turns) were re-derived from executed MIDI ground truth — the fugue exposition, strettos, and pedal structure are now described as they sound, and the prelude windows' chord letters and pedal placement were corrected too (tier AB, director-approved). Tool calls, windows, ids, MIDI sidecars, REMI/ABC tokens, splits: untouched and asserted byte-identical.

**How the defect was found — and the new standing gate it earned.** The finetune-arc-v1 execution-verification gate (G6a) executed every frozen tool call in a training corpus derived from these records against the real MCP server and caught the one impossible call out of 206. That gate class is now a **standing packaging gate**: every unique frozen `tool_call` in this package replays against the live server (`scripts/verify-public-package-execution.ts`) and must return zero errors before any cut. The v0.5.0 receipt is at `evals/v0.5.0-execution-verification.json` (230 unique calls, 0 failures — the corrected `play_song(61, 62)` executes cleanly).

**RC release gate.** The 7-axis RC gate was re-run at cut time and **PASSES**; the regenerated canonical assessment is `evals/v0.5.0-release-gate-assessment.json`. Honest scope note: the gate's evidence base is the sealed 16-record E3 baseline measured on **v0.4.3 records** (the only LLM baseline in existence at cut time). Erratum 002 changed annotation prose, which the E3 `text_only` condition reads, so those numbers are not a re-measurement of v0.5.0's prose. A fresh sealed baseline measured on v0.5.0 records is the next planned eval artifact and will ship with a future version.

**Eval artifacts policy for this version.** The Slice 21 fair-E3 baseline (`slice21-fair-e3-baseline-results.json` + sample) is **not shipped in v0.5.0**: it was measured on v0.4.3 records, and shipping it beside records whose prose it does not describe invites misreading. It remains permanently available in the v0.4.3 deposit ([DOI 10.5281/zenodo.20279919](https://doi.org/10.5281/zenodo.20279919)) and in the source repo's git history, and it remains the pinned sealed baseline of the finetune-arc receipts. The other slice-tagged eval artifacts under `evals/` are retained as the dataset's documented evolutionary history (see `KNOWN_LIMITATIONS.md` §9 for the layered story); none of them describe v0.5.0's prose either — every eval artifact predating this version is historical by definition.

**Counts.** 115 records (unchanged), 57 pairs + 1 standalone, 8 songs, splits discipline preserved (`clair-de-lune` held out, never trained on). The only id change is the Bach `m061-064` → `m061-062` rename (other songs' `m061-064` windows are legitimate 4-measure windows within longer pieces and are untouched).

## Previous version: 0.4.3 (2026-05-19)

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

## Earlier version: 0.4.2 (2026-05-19)

**Slice 24 — Publication Dry-Run.** Adds three new curated files to the package — `RELEASE_NOTES.md` (this file), `zenodo-metadata.json` (a schema-valid Zenodo deposition metadata payload), and `hf-dataset-card-check.md` (a field-by-field validation report against the HuggingFace dataset-card schema). These three files prepare the package for an eventual Slice 25 actual publish (Zenodo + HuggingFace) without executing any upload or DOI mint. NO record content changes. NO eval reruns. The Slice 22 RC-gate PASS verdict at `evals/slice22-release-gate-revised-assessment.json` remains the canonical gate-cleared state.

Patch bump from 0.4.1 is consistent with the Slice 10.5 / Slice 23.5 precedent (docs-only patch with no record-content change).

## What this release IS

- A **record-content correction release**: the Bach BWV 846 records now match their source MIDI (window bounds per erratum 001, annotation prose per erratum 002). Every correction traces to an executed ground-truth derivation with a machine receipt in the source repo (`datasets/jam-actions-v0/revisions/r001-…` and `r002-…`).
- **Execution-verified**: every unique frozen tool call in the package replays against the live MCP server with zero errors (`evals/v0.5.0-execution-verification.json`) — the standing gate earned by the defect this release corrects.
- Reproducible from a cold-clone state: a fresh Windows / macOS / Linux contributor can clone, install, and verify all checksums in ~2 seconds (Slice 23.5 earned this). The RC-gate assessment for this version is at `evals/v0.5.0-release-gate-assessment.json`.
- A candidate release pending operator-gated publication. Per the source-repo doctrine, **gate clearance is NOT release approval.**

## What this release IS NOT

- **A re-measured eval release.** No LLM baseline in this package was measured on v0.5.0's corrected prose. The sealed E3 baseline (measured on v0.4.3 records) informs the RC gate and lives in the v0.4.3 deposit; the successor baseline measured on v0.5.0 records ships with a future version.
- A scope-expanded dataset. The 115 records, 8 songs, single-arranger, piano-only, English-only-annotations scope is unchanged. See `KNOWN_LIMITATIONS.md` for the honest scope statement.
- A mutation of anything published. The v0.4.3 Zenodo deposit is immutable and untouched; v0.5.0 is a new version under the same concept DOI.

## Cross-references

- **Canonical PASS verdict** for the current version: `evals/v0.5.0-release-gate-assessment.json` (release-gate-assessment/2.0.0 schema; all 6 blocking axes PASS; evidence base disclosed in the 0.5.0 entry above). The Slice 22 assessment (`evals/slice22-release-gate-revised-assessment.json`) is retained as the historical verdict at the v0.4.x state.
- **Execution-verification receipt** for the current version: `evals/v0.5.0-execution-verification.json` (standing gate; 0 failures required).
- **Errata** (source repo): `docs/jam-actions-v0-erratum-001-bach-m061-064.md` + `docs/jam-actions-v0-erratum-002-bach-annotation-prose.md`; revision receipts under `datasets/jam-actions-v0/revisions/`.
- **Reproducibility evidence**: see the source repo's Slice 23.5 doc — `docs/jam-actions-v0-slice23-5-reproducibility-cleanup.md` — for the operator-aloneness audit closeout
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
| 0.4.3 | 2026-05-19 | Slice 24.5 | HF dataset-card polish — closes the 5 WARN-level gaps from Slice 24 by adding `source_datasets: [original]`, `multilinguality: [monolingual]`, `annotations_creators: [expert-generated, machine-generated]`, `language_creators: [expert-generated, machine-generated]`, and a 1-sentence `pretty_description` to the README YAML frontmatter. `ATTRIBUTION.md` gains a "human-in-the-loop" provenance section that surfaces the operator + AI-agent dual-population story behind the slug-list choice. `task_ids` intentionally absent (HF's enum is NLP-specific; documented). `configs` unchanged (single records.jsonl + per-record `split` column honors the no-record-changes lock). `hf-dataset-card-check.md` re-validated: 0 FAIL, 0 unresolved WARN. Patch bump per the operator-locked threshold rule for metadata-content changes. No record-content changes. No eval reruns. **Published on Zenodo 2026-05-19 (DOI 10.5281/zenodo.20279919).** |
| 0.5.0 | 2026-07-11 | Errata 001+002 | Bach BWV 846 correction release — window retarget `m061-064` → `m061-062` (erratum 001; the frozen `play_song(61,64)` was impossible against the 62-measure song) + all 16 Bach records' annotation prose re-derived from executed MIDI ground truth (erratum 002, tier AB; the old prose narrated an imagined 64-measure prelude — the file is prelude mm. 1–35 + fugue mm. 36–62). Execution verification joins the standing packaging gates (`evals/v0.5.0-execution-verification.json`, 230 unique calls, 0 failures). RC gate re-run PASS (`evals/v0.5.0-release-gate-assessment.json`; evidence base = the sealed v0.4.3-measured baseline, disclosed). Slice 21 fair-E3 baseline artifacts not shipped (measured on v0.4.3 records; available in the v0.4.3 deposit + git history). Minor bump per the record-content precedent. |

## Decision history — version-bump precedent

The version-bump pattern across the arc:

| Bump type | When applied | Examples |
|---|---|---|
| Minor (`0.x.0 → 0.(x+1).0`) | Record content changes (records enriched, rewritten, or added) | 0.1.1 → 0.2.0 (Slice 11), 0.2.0 → 0.3.0 (Slice 16), 0.3.0 → 0.4.0 (Slice 21), 0.4.3 → 0.5.0 (errata 001+002) |
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
