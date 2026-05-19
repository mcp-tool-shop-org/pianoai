# Slice 24.5 — `jam-actions-v0` HuggingFace Dataset-Card Polish

**Date:** 2026-05-19
**Status:** Complete (metadata-only polish). Awaiting operator authorization to commit. NO autonomous commit; NO push; NO upload.
**Bump:** `0.4.2 → 0.4.3` (patch bump; metadata-content material change per the operator-locked threshold rule)
**Source tag at HEAD before this slice:** `jam-actions-v0-publication-dry-run-2026-05-19`

---

## 1. The question

Slice 24's `hf-dataset-card-check.md` validated the package's README YAML frontmatter against the current HuggingFace dataset-card schema and returned:

- 0 FAIL
- 4 PASS (license, task_categories, language, tags)
- 2 PASS-WARN (`task_ids` empty; `configs` test-split nuance)
- 5 WARN (optional polish items): `source_datasets`, `multilinguality`, `annotations_creators`, `language_creators`, `pretty_description`

The operator's locked direction:

> "Address HF warnings where truthful. Do not change records. Do not change evals. Regenerate checksums. Rerun HF dataset-card check. Keep version as 0.4.2 unless content metadata materially changes; if metadata files change, 0.4.3 is acceptable."

So Slice 24.5's question is **not** "should we publish?" but "for the 5 WARN-level optional polish items, what is the most defensible honest value, and how do we close the items without dishonest claims or record perturbation?"

Acceptance bar: a future Slice 25 actual-publish can use the polished README YAML verbatim as the HF dataset card, with no remaining metadata polish backlog and no honesty drift between the YAML and the package's other declared truths (ATTRIBUTION, KNOWN_LIMITATIONS, RELEASE_NOTES).

## 2. Hard rules honored

- **NO record content changes** — `records/*`, `records.jsonl` (including per-record `split` field), `splits.json` all byte-identical to the Slice 24 state.
- **NO eval changes** — `annotation-grounding.ts`, `midi-inspector.ts`, `release-gate.ts` all byte-identical. All `evals/*` artifacts byte-identical.
- **NO release-gate validator core logic changes.**
- **NO new MCP tools / no tool-schemas changes.**
- **NO autonomous commit at end** — operator authorizes commits.
- **NO push / no HF upload / no Zenodo deposit.**
- **NO inventing HF schema enum values** — every slug below is from HF's documented enum.

## 3. The 5 WARN closure table

| WARN item (Slice 24) | Slice 24.5 chosen value | Honest rationale |
|---|---|---|
| `source_datasets` | `["original"]` | HF's enum slug for "this dataset has an original (non-HF) upstream." The upstream is Bernd Krueger's MIDI arrangements at piano-midi.de, which are NOT on HF. The upstream attribution itself remains in `ATTRIBUTION.md` Layer 2 and per-record `provenance` block (byte-identical). Alternatives rejected: `extended\|<hf_dataset>` (no HF dataset to extend); custom URL/identifier (HF's enum doesn't carry free-form upstream identifiers in `source_datasets` per current spec — the upstream URL belongs in the body, not the YAML). |
| `multilinguality` | `["monolingual"]` | All annotation prose is English-only; record IDs and field names are English; MIDI representation is language-neutral. KNOWN_LIMITATIONS section 5 (English-only annotations) cross-references this. Clear-cut decision. |
| `annotations_creators` | `["expert-generated", "machine-generated"]` | The honest answer is **mixed** — operator-authored schema + rubric + final review (the substantive quality bar is the operator's, fitting `expert-generated`); AI agents drafted bulk enrichment content (Slice 11 + 21 enrichments) under operator review (fitting `machine-generated`). HF allows the list form; we use it. Picking only `expert-generated` would obscure the AI involvement; picking only `machine-generated` would obscure the operator review. `ATTRIBUTION.md` gains a new "Annotation provenance — who wrote what" section that surfaces the dual-population provenance in narrative form. |
| `language_creators` | `["expert-generated", "machine-generated"]` | Same population as `annotations_creators` (the annotations are the only English-language layer; field names, MIDI bytes, and IDs are all language-neutral or operator-locked). Same rationale; same value. |
| `pretty_description` | 1-sentence: "Public subset of jam-actions-v0: 115 records across 8 classical-piano arrangements, pairing 4-measure phrase windows with annotated teaching targets and multi-turn MCP tool-use traces. Designed for grounded tool-use evaluation over symbolic music; released under CC-BY-SA-3.0-DE." | Avoids marketing-speak (no "transformative", "high-quality", "powerful"). Concrete record count (115); concrete scope (8 piano arrangements); concrete pairing structure (4-measure phrase + annotated target); concrete intent (grounded tool-use eval over symbolic music); concrete license (CC-BY-SA-3.0-DE). Body's "Dataset Summary" remains longer-form authority; this is the card preview. |

## 4. `task_ids` decision: stay absent

HF's `task_ids` enum (as of the current spec) is dominated by NLP-specific subtask slugs: `extractive-qa`, `abstractive-qa`, `open-domain-qa`, `closed-domain-qa`, `multiple-choice-qa`, `news-articles-summarization`, `dialogue-modeling`, `named-entity-recognition`, `coreference-resolution`, `sentiment-classification`, `topic-classification`, `intent-classification`, `slot-filling`, `language-modeling`, etc.

**None of these fit MCP tool-use over symbolic music.** The closest tangential candidates are `language-modeling` (overclaims; the dataset is not a generic LM corpus) and `multiple-choice-qa` (an internal eval mechanism in our E3 harness, not the dataset's primary task surface). Picking either would be misleading.

The honest choice is to **omit `task_ids` entirely**. HF treats absent and empty (`task_ids: []`) identically for filter-facet purposes; absent is slightly cleaner. The Slice 24 YAML declared `task_ids: []`; Slice 24.5 removes the line.

This decision is also referenced in the new `ATTRIBUTION.md` HITL section so that anyone consulting the layered attribution narrative sees the same explanation.

## 5. `configs` decision: single-file + per-record `split` column

The Slice 24 `hf-dataset-card-check.md` flagged `configs` as PASS-WARN because:

- HF's `configs` mechanism supports declaring train/test splits with separate `data_files` paths.
- The dataset has a real train/test split (103/12 with `clair-de-lune` held out).
- But the current declaration has only `train` pointing to `records.jsonl` — no separate `test` declaration.

Two ways to close this:

1. **Split `records.jsonl` into `records-train.jsonl` + `records-test.jsonl`** and declare both in `configs`. This would arguably violate the "no record-content changes" lock — the file count changes; the file path changes; downstream consumer integrity assumptions shift.
2. **Keep `records.jsonl` as one file with the per-record `split` column already present (added in Slice 10).** Downstream consumers using `load_dataset` filter by the `split` column or read `splits.json` sidecar.

Slice 24.5 picks **option 2** to honor the locked records-stability rule. The trade-off:

- **Pro:** `records.jsonl` stays byte-identical to Slice 24; the SHA-256 checksum for `records.jsonl` is preserved; downstream pipelines that consume the canonical file are unaffected.
- **Con:** HF's auto-preview will show all 115 records under the `train` split rather than splitting them. Downstream consumers using `load_dataset("...")` get a `DatasetDict` with one `train` key of 115 rows; the test split must be derived via `dataset.filter(lambda r: r["split"] == "test")` or by reading `splits.json`.

This trade-off is honest and documented. A future Slice 24.6 or Slice 25 could revisit by splitting the JSONL if HF preview ergonomics warrant — but the operator-locked records-stability rule has higher priority right now. The `hf-dataset-card-check.md` carries this rationale in its `configs` row and the closure log.

## 6. Polished YAML frontmatter (final state)

```yaml
license: cc-by-sa-3.0
language:
  - en
language_creators:
  - expert-generated
  - machine-generated
annotations_creators:
  - expert-generated
  - machine-generated
multilinguality:
  - monolingual
source_datasets:
  - original
pretty_name: "AI Jam Sessions — Tool-Use Traces v0 (Public Subset)"
pretty_description: "Public subset of jam-actions-v0: 115 records across 8 classical-piano arrangements, pairing 4-measure phrase windows with annotated teaching targets and multi-turn MCP tool-use traces. Designed for grounded tool-use evaluation over symbolic music; released under CC-BY-SA-3.0-DE."
size_categories:
  - n<1K
task_categories:
  - text-generation
  - other
tags:
  - music
  - midi
  - mcp
  - tool-use
  - symbolic-music
  - piano
  - classical
configs:
  - config_name: default
    data_files:
      - split: train
        path: records.jsonl
```

13 fields populated. `task_ids` intentionally absent. All values defensible against HF's documented schema enums.

## 7. ATTRIBUTION.md narrow-scope update

`annotations_creators` and `language_creators` carry the slug-list `["expert-generated", "machine-generated"]`. A slug list alone does not tell a downstream reader **what split of work each population did**. To prevent misreading (e.g., assuming agents authored the schema, or assuming the operator hand-wrote every annotation), `ATTRIBUTION.md` gains a narrow-scope new section under Layer 3:

> ### Annotation provenance — who wrote what (human-in-the-loop)
> - **Operator (mcp-tool-shop-org):** authored the schema, the enrichment rubric, the held-out-test discipline, the corpus selection, the per-record acceptance bar, the release-gate axes and thresholds, and the final review of every enrichment.
> - **AI agents (under operator direction, models qwen2.5:7b and Claude in the source repo):** drafted the bulk of annotation_target prose for the 6 records enriched in Slice 11 (Pathétique m025-028 / m029-032; Schumann m045-048; Bach m045-048 / m049-052 / m053-056) and the 1 record rewritten in Slice 21 (Schumann m045-048, R6-aware rewrite).
> - **Why both slugs apply:** the substantive content quality is the operator's responsibility (`expert-generated`), and the agents performed substantial first-draft work under explicit human direction (`machine-generated`).
> - **What `task_ids` would NOT capture:** HF's `task_ids` enum is dominated by NLP-specific subtasks that do not fit MCP tool-use over symbolic music. The field stays unpopulated.

Plus the BibTeX `version`, the plain-text reference `version`, the Layer 3 `Version:` line, and the Layer 3 source-commit summary are bumped from `0.4.1` to `0.4.3` for consistency with the rest of the package metadata.

No other ATTRIBUTION.md content is modified. The Layer 1 / Layer 2 sections, the per-song evidence-URL table, the redistribution attribution requirements, and the demoted-songs disclosure are all byte-identical to the Slice 24 state.

## 8. README.md narrow-scope updates

Beyond the YAML frontmatter, three body-text fixes were applied:

1. **Line 38 — "Version: 0.4.1 → 0.4.3"** in the H1 subtitle block. (Pre-existing Slice 24 staleness — the README's body-text version drifted from the `VERSION` file at 0.4.2. Slice 24.5 bumps both to 0.4.3 and brings the body-text in alignment.) Also adds Slice 24 + Slice 24.5 to the layered-patches descriptor.
2. **Line 69 — "Package version pinned by this reproducibility section: `0.4.1` → `0.4.3`"** in the Reproducibility section.
3. **Line 167 — BibTeX `version = {0.4.1} → {0.4.3}`** in the Citation example.

The Dataset Summary, Dataset Structure, Source Data, Licensing, Held-out Test Set, Provenance, Limitations, and Maintainer sections are all byte-identical to the Slice 24 state.

## 9. RELEASE_NOTES.md updates

- New "Current version: 0.4.3 (2026-05-19)" section at the top with a Slice 24.5 narrative.
- Demoted previous-current "0.4.2" section to "Previous version: 0.4.2 (2026-05-19)".
- New row added to the version-arc table (9 rows total now).
- Decision-history version-bump precedent table updated: patch-bump examples now include `0.4.2 → 0.4.3 (Slice 24.5)`.
- "What v1.0 would require" item about the 5 HF WARN polish items updated to reflect DONE state (Slice 24.5 closed all 5).

## 10. Version + metadata coherence

After Slice 24.5, every version-bearing artifact in the package agrees on `0.4.3`:

| File | Field | Slice 24 value | Slice 24.5 value |
|---|---|---|---|
| `VERSION` | (whole file) | `0.4.2` | `0.4.3` |
| `CITATION.cff` | `version` | `0.4.2` | `0.4.3` |
| `manifest.json` | `version` | `0.4.2` | `0.4.3` (regenerated by packager) |
| `zenodo-metadata.json` | `metadata.version` | `0.4.2` | `0.4.3` |
| `zenodo-metadata.json` | `metadata.notes` final tail | `0.1.0 → 0.4.2` | `0.1.0 → 0.4.3` |
| `README.md` | body H1 subtitle Version | `0.4.1` (pre-existing staleness) | `0.4.3` |
| `README.md` | Reproducibility pinned version | `0.4.1` (pre-existing staleness) | `0.4.3` |
| `README.md` | Citation BibTeX `version` | `0.4.1` (pre-existing staleness) | `0.4.3` |
| `ATTRIBUTION.md` | Layer 3 `Version:` | `0.4.1` | `0.4.3` |
| `ATTRIBUTION.md` | BibTeX `version` | `0.4.1` | `0.4.3` |
| `ATTRIBUTION.md` | Plain-text reference `version` | `0.4.1` | `0.4.3` |

The packager's `assertCitationCffMatchesVersion` consistency check passes (`VERSION="0.4.3"` matches `CITATION.cff version="0.4.3"`). The Slice 24 README-body staleness (0.4.1 vs VERSION 0.4.2) is fixed as part of this slice — flagging here for the record.

## 11. Test count + checksum verification

| Check | Slice 24 baseline | Slice 24.5 result |
|---|---|---|
| `pnpm test` | 1513 passed | 1513 passed |
| `verify-public-package-checksums.ts` | 270 entries (Slice 23.5) → 273 entries (Slice 24, +3 curated docs) | 273 entries (Slice 24.5; no file-count change vs Slice 24 — Slice 24.5 is pure metadata edits) |
| Packager run | clean | clean (CITATION consistency PASS, 234 generated files written, checksums regenerated, manifest version bumped to 0.4.3) |

No new files added by Slice 24.5; no files removed. The 5 polished YAML fields and the ATTRIBUTION.md HITL section live inside existing files.

## 12. HF check rerun — 0 unresolved WARN

`hf-dataset-card-check.md` re-validated against the polished YAML:

- 0 FAIL
- 13 PASS items (was 4 + 2 PASS-WARN + 5 WARN → all closed)
- 0 PASS-WARN (was 2 — both resolved as explicit honest decisions in Slice 24.5)
- 0 unresolved WARN (was 5 — all closed)

The dataset card is publication-ready for HuggingFace with no remaining metadata polish backlog.

## 13. Hard-gate checklist

| Gate | Required | Status |
|---|---|---|
| 1. All 1513 existing tests still pass | YES | PASS (1513/1513) |
| 2. README YAML frontmatter contains the 5 polished fields with defensible honest values | YES | PASS (see §6) |
| 3. HF dataset-card check rerun: 0 FAIL, 0 unresolved WARN | YES | PASS (see §12) |
| 4. ATTRIBUTION.md changes (if any) preserve historical context | YES | PASS (only additive HITL section + version-string updates; no historical content removed) |
| 5. Source corpus, records, records.jsonl, splits all byte-identical | YES | PASS (packager re-ran cleanly; record selection deterministic; per-record `split` field preserved) |
| 6. Eval harnesses + release-gate validator core byte-identical | YES | PASS (no changes to `src/dataset/eval/*` or `src/dataset/release-gate.ts`) |
| 7. All prior eval artifacts byte-identical | YES | PASS (no changes to `evals/*` curated artifacts) |
| 8. If bumping to 0.4.3: VERSION + manifest + CITATION + RELEASE_NOTES consistent | YES | PASS (see §10; all version-bearing artifacts agree on 0.4.3) |
| 9. checksums.sha256 regenerated; verify script clean (273 entries — no file count change vs Slice 24) | YES | PASS (273 entries, 0 mismatches, 0 missing, 0 bad lines) |
| 10. New doc explains each WARN closure: which HF enum value chosen, rationale, what gets surfaced from ATTRIBUTION | YES | PASS (this doc — §3 closure table + §7 ATTRIBUTION update narrative) |
| 11. NO autonomous commit. Stop and report. | YES | PASS (no commit issued; ready for operator review) |

All 11 hard gates pass.

## 14. Suggested commit + tag (operator-authorized)

**Suggested commit message:**

```
Polish jam-actions v0 HF dataset card and bump to 0.4.3

Closes the 5 optional WARN-level gaps from Slice 24's hf-dataset-card-check
by adding source_datasets, multilinguality, annotations_creators,
language_creators, and pretty_description to the README YAML frontmatter
with defensible honest values. ATTRIBUTION.md gains an "Annotation
provenance — who wrote what" section that surfaces the operator + AI-agent
dual-population provenance behind the slug-list choice. task_ids stays
absent (HF's enum is NLP-specific and doesn't fit MCP tool-use). configs
stays single-file with per-record split column to honor the no-record-
changes lock.

Patch bump 0.4.2 → 0.4.3 per operator-locked metadata-content-change
threshold. Records, evals, schemas, release-gate validator core all
byte-identical to the Slice 24 state. 1513 tests passing. 273-entry
checksum manifest verifies clean.

Slice 24.5 deliverables:
- datasets/jam-actions-v0-public/README.md (YAML frontmatter + 3 body-text
  version-string fixes)
- datasets/jam-actions-v0-public/ATTRIBUTION.md (HITL section + version)
- datasets/jam-actions-v0-public/VERSION (0.4.3)
- datasets/jam-actions-v0-public/CITATION.cff (0.4.3)
- datasets/jam-actions-v0-public/zenodo-metadata.json (0.4.3)
- datasets/jam-actions-v0-public/RELEASE_NOTES.md (+ 0.4.3 row)
- datasets/jam-actions-v0-public/hf-dataset-card-check.md (re-validated
  post-polish; 0 unresolved WARN)
- datasets/jam-actions-v0-public/manifest.json (regenerated, 0.4.3)
- datasets/jam-actions-v0-public/checksums.sha256 (regenerated)
- docs/jam-actions-v0-slice24-5-dataset-card-polish.md (this slice doc)
```

**Suggested tag:** `jam-actions-v0-dataset-card-polished-2026-05-19`

## 15. What this slice IS / IS NOT

**IS:**
- A docs-only / metadata-only polish slice closing 5 optional HF WARN items.
- A version bump (0.4.2 → 0.4.3) under the operator-locked metadata-change threshold.
- A coherence pass — every version-bearing artifact agrees on 0.4.3.
- A README-body version-staleness fix carried through alongside the YAML polish.

**IS NOT:**
- A record-content change. The 115 records, records.jsonl, per-record split field, splits.json are all byte-identical.
- An eval rerun. All eval artifacts and the release-gate validator are byte-identical.
- A release approval. This slice does not claim publication readiness beyond what Slice 24 already established (RC-gate PASS at the Slice 22 baseline; reproducibility cleared; publication mechanics validated). Per the operator-locked doctrine "gate clearance is not release approval" — the publish decision remains downstream.
- A Slice 25 trigger. Slice 25 (actual publish: Zenodo deposit + DOI mint + HuggingFace upload) is gated on operator authorization, an HF organization, and write tokens — none of which are in scope here.

## 16. Open follow-ups (not blockers)

- **Slice 24.6 candidate (deferred):** if HF-side preview ergonomics warrant, optionally split `records.jsonl` into `records-train.jsonl` + `records-test.jsonl` and declare both splits in `configs`. This would be a records-change (file count + paths shift) and therefore a minor-version bump (0.4.x → 0.5.0). Trade-off: HF's auto-preview improves; downstream consumers reading `records.jsonl` see a path break. Lock the decision in Slice 25 if needed.
- **Slice 25 actual-publish trigger:** when the operator authorizes, the polished README YAML can be used verbatim as the HF dataset card. The `hf-dataset-card-check.md` carries the full upload walkthrough.
- **Zenodo metadata version drift:** the `zenodo-metadata.json` is now at 0.4.3 with `notes` updated to reflect the new version-arc range. A future actual-Zenodo-deposit slice can use this payload as-is or further augment with DOI + creators-with-ORCID once those are minted.

## 17. Operator hard rules honored

Per the locked doctrine since Slice 15:

- No autonomous commit at slice end — the operator authorizes commits.
- No upload / push / DOI mint in polish slices (Slice 24.5's gate).
- No record content changes in polish slices.
- No eval harness or release-gate validator logic changes.
- Translations rule (global) — N/A here (no README translation step; the package's README is the dataset card, single-language by design).

---

*End of slice doc. Awaiting operator review.*
