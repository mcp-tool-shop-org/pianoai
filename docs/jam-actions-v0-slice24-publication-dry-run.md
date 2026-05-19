# Slice 24 — `jam-actions-v0` Publication Dry-Run

**Date:** 2026-05-19
**Status:** Complete (dry-run). Awaiting operator authorization to commit + (optionally) execute Slice 25 actual publish.
**Bumps:** `0.4.1 → 0.4.2` (patch bump; docs-only precedent per Slice 10.5 + Slice 23.5)
**Source tag at HEAD before this slice:** `jam-actions-v0-reproducibility-cleared-2026-05-19`

---

## 1. The question

Slice 23.5 cleared the operator-aloneness reproducibility audit; a cold Windows contributor can now clone, install, verify 270/270 checksums, and reproduce the canonical Slice 22 RC-gate PASS verdict without operator handholding. With reproducibility cleared, the next question is whether the package is publication-ready.

The operator's locked direction:

> "Publication mechanics are now unblocked, but I would still make Slice 24 a dry-run publication package, not the real upload yet. After Slice 24 dry-run passes, then decide whether to publish."

So Slice 24's question is **not** "should we publish?" but **"if we were to publish tomorrow, would the mechanics actually work and the metadata actually validate, without surprises?"** This slice runs the entire publish pipeline up to but not including the live upload, and reports any gaps that an actual publish would surface.

Acceptance bar: a future operator can read this doc + the 3 new curated artifacts in the package and execute the actual publish steps with confidence — no improvisation, no surprises, no schema rejections.

## 2. Phase 1 — Network-clone verification

Slice 23.5's Phase 7 used a `git worktree` for cleanliness; Slice 24's Phase 1 used a **true network clone** to test the path a real outside contributor would walk.

**Commands:**

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git E:/AI/ai-jam-sessions-slice24-dry-run
cd E:/AI/ai-jam-sessions-slice24-dry-run
git checkout jam-actions-v0-reproducibility-cleared-2026-05-19
pnpm install
pnpm exec tsx scripts/verify-public-package-checksums.ts
pnpm exec tsx scripts/check-release-gate.ts \
  datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json
```

**Results:**

| Step | Outcome | Wall time |
|---|---|---|
| Clone from GitHub HTTPS | PASS (88 MB total, 11 MB `.git`) | 12 s |
| Checkout tag `jam-actions-v0-reproducibility-cleared-2026-05-19` | PASS (HEAD at `ea68906`) | <1 s |
| `pnpm install` | PASS (deps resolved + lockfile satisfied) | 126 s |
| `verify-public-package-checksums.ts` | PASS (270/270 lines verify, 0 bad lines, 0 hash mismatches, 0 missing) | 1 s |
| `check-release-gate.ts` on Slice 21 fair-E3 baseline | PASS (all 6 blocking axes PASS; aggregate PASS) | 1 s |
| **Total wall time** | | **~141 s (2 min 21 s)** |

No Windows-specific surprises. No CRLF drift (Slice 23.5's `.gitattributes` LF-pin for `*.sha256` files held). No checksum drift. No release-gate drift. The gold-standard pre-publication check is clean.

This validates the Slice 23.5 audit's worktree-based verification as truthful: the worktree path and the true-network-clone path produced identical outcomes.

## 3. Phase 2 — Archive build

Built upload-ready archives (Zenodo accepts `.tar.gz`, `.zip`, etc.) of the entire `datasets/jam-actions-v0-public/` directory in the dry-run clone, at the 0.4.1 state (before Phase 6's version bump). Output written to `.slice24-artifacts/` in the main repo (gitignored — these are audit artifacts, not package content).

```bash
cd datasets/jam-actions-v0-public
tar -czf .slice24-artifacts/jam-actions-v0-public-0.4.1.tar.gz .
# (zip equivalent via PowerShell Compress-Archive — `zip` binary not present on this Windows box)
```

**Results:**

| Archive | Size | Entries | Files (non-dir) | `.git/` leakage | PASS-verdict artifact present |
|---|---|---|---|---|---|
| `.tar.gz` | 1.3 MB | 275 | 271 | NONE | YES (`evals/slice22-release-gate-revised-assessment.json`) |
| `.zip` | 1.5 MB | 271 | 271 | NONE | YES |

**File inventory** (top-level + categories in the tar.gz):

- 13 top-level files: `README.md`, `ATTRIBUTION.md`, `CITATION.cff`, `DATASET_SCHEMA.md`, `KNOWN_LIMITATIONS.md`, `LICENSE-DATASET.md`, `VERSION`, `checksums.sha256`, `manifest.json`, `package-inputs.json`, `provenance-verification.json`, `records.jsonl`, `splits.json`
- 116 record files under `records/` (115 records + 1 dir entry; `find` counts only files = 115)
- 116 piano-roll SVGs under `pianoroll/`
- 29 eval artifacts under `evals/`

Total: 271 files = 270 checksummed files + `checksums.sha256` itself. Math reconciles to the verifier's "270 files on disk" line.

For an actual Slice 25 publish: rebuild the archive at the final version (0.4.2 if bumped; or directly off the 0.4.2-tagged commit). The version-named archive is the convention Zenodo and GitHub-releases both follow.

## 4. Phase 3 — Zenodo deposition metadata

Wrote `datasets/jam-actions-v0-public/zenodo-metadata.json` — a schema-valid Zenodo legacy-REST deposition payload that would attach to an actual deposit. The file is **dry-run only**; no `zenodo.org/api/deposit/depositions` API call was made.

**Top-level structure:** `$schema_note` (human-readable comment that the JSON is dry-run, not a deposit record) + `metadata` (the actual Zenodo payload).

**`metadata` fields populated (13 total):**

| Field | Value | Rationale |
|---|---|---|
| `title` | `"jam-actions-v0 (public subset) — AI Jam Sessions tool-use traces"` | Mirrors README's H1; disambiguated with "(public subset)" since the source repo also has an internal subset. |
| `upload_type` | `"dataset"` | Per Zenodo enum; appropriate for a research dataset. |
| `description` | 2224-character HTML block | Synthesized from README's Dataset Summary + Reproducibility + Licensing sections. HTML wrapping per Zenodo spec (paragraph tags, inline code). Well over the recommended 200-char minimum. |
| `creators` | 2 entries: `mcp-tool-shop-org` + `Krueger, Bernd` | Project + upstream MIDI arranger (cited per Slice 2.5 verified provenance). Affiliations populated. |
| `keywords` | 13 entries: `music`, `midi`, `dataset`, `mcp`, `model-context-protocol`, `llm`, `training-data`, `tool-use`, `classical-music`, `piano`, `symbolic-music`, `annotation`, `instruction-tuning` | Covers domain, modality, intended use, and methodology. |
| `license` | `"CC-BY-SA-3.0"` | Zenodo's enumerated slug for the international form. The DE jurisdiction is the substantive governing law for the upstream Krueger arrangements; obligations are identical. The DE nuance is documented in the description, `ATTRIBUTION.md`, and `LICENSE-DATASET.md`. |
| `access_right` | `"open"` | Public dataset; no access restrictions. |
| `language` | `"eng"` | ISO 639-3 code per Zenodo spec (note: distinct from HF's ISO 639-1 `"en"` — Zenodo uses 3-letter codes). |
| `version` | `"0.4.2"` | Matches the package's `VERSION` file after Phase 6 bump. |
| `related_identifiers` | 3 entries | GitHub repo (`isSupplementTo`, type `software`), repo tag at the publish commit (`isDerivedFrom`, type `software`), upstream piano-midi.de site (`isDerivedFrom`, type `dataset`). All URLs; all relations from Zenodo's enum. |
| `subjects` | 3 entries | Free-form subject vocab with optional URL identifiers: "Symbolic music", "Model Context Protocol", "Instruction tuning". |
| `references` | 3 entries | Bernd Krueger / piano-midi.de upstream citation, the canonical Slice 22 RC-gate PASS artifact reference, MCP spec reference. |
| `notes` | Free-text | The "candidate release" caveat, the gate-clearance-is-not-release-approval doctrine, and pointers to KNOWN_LIMITATIONS and RELEASE_NOTES. |

**Fields explicitly NOT populated:**

- `doi` — Zenodo mints DOIs on actual deposit. Including a `doi` in a dry-run payload would be fabrication.
- Auth tokens, account IDs, API keys — out of scope per operator hard rule.
- `embargo_date`, `subjects.identifier` for some subjects — optional fields; not needed for a clean publish.

**Validation:** `JSON.parse()` on the file succeeds; all kickoff-required fields present; description length > 200 chars; creators array has both required entries; related_identifiers all use valid Zenodo relations (`isSupplementTo`, `isDerivedFrom`).

## 5. Phase 4 — HuggingFace dataset card validation

Wrote `datasets/jam-actions-v0-public/hf-dataset-card-check.md` — a manual field-by-field validation report of the README's YAML frontmatter against the current HF dataset-card spec.

**Overall verdict:** **PASS** for actual HF upload. No FAIL items.

**Field-level results (13 fields checked):**

- **4 PASS** (no notes): `license`, `language`, `pretty_name`, `size_categories`, `tags`
- **2 PASS-WARN** (technically valid; cosmetic polish candidates): `task_categories`, `task_ids`, `configs` — the last because the test split is not declared as a separate HF split (it's read from `splits.json` as a sidecar; this is a deliberate choice for v0)
- **5 WARN** (optional fields not declared; populating them would improve discoverability): `source_datasets`, `multilinguality`, `annotations_creators`, `language_creators`, `pretty_description`

**Walkthrough of what an actual HF upload would do** is included in the check.md as a 6-step recipe: create HF dataset repo → `huggingface-cli upload` → HF reads README as dataset card → HF reads `records.jsonl` per `configs` → sidecar files become repo attachments accessible via `hf_hub_download` → eval artifacts (incl. canonical PASS verdict) discoverable.

**Gaps that would block actual publication:** **None at the schema level.** The gating items are operator decisions (HF org choice, auth tokens, provenance link disclosure) and a Slice 24.5 / 25 optional polish list for the 5 WARN-level fields.

## 6. Phase 5 — RELEASE_NOTES content

Wrote `datasets/jam-actions-v0-public/RELEASE_NOTES.md` covering:

- **Current version 0.4.2 entry** — Slice 24 summary, the "what this release IS / IS NOT" honesty section, cross-link to the canonical Slice 22 PASS artifact and Slice 23.5 reproducibility doc.
- **Full version arc table** — 8 entries from 0.1.0 (Slice 10, 2026-05-17) through 0.4.2 (Slice 24, 2026-05-19), with date + slice + summary per row.
- **Decision history** — version-bump precedent table (minor = records changed, patch = docs / tooling only, major = first public release, **not yet earned**).
- **Forward-looking section** — what v1.0 would require (operator decision + Slice 25 actual publish + the 5 WARN-level HF polish items + possibly a v0.5.0 records polish first). Explicitly does not promise v1.0 in this slice.
- **Operator hard rules** honored in this release (no autonomous commit, no upload, no record changes, no harness changes, translations rule N/A).

The version-arc table is the gold-standard artifact for cross-slice continuity: a future reader can read this single file and reconstruct the entire v0 evolution.

## 7. Phase 6 — Version-bump decision

**Decision: `0.4.1 → 0.4.2` (patch bump).**

**Rationale:** Slice 24 adds 3 new curated files (`RELEASE_NOTES.md`, `zenodo-metadata.json`, `hf-dataset-card-check.md`). None of these change record content, eval artifacts, splits, manifests, or any data-bearing field. They are pure metadata / documentation files. This is precisely the situation the Slice 10.5 (`0.1.0 → 0.1.1`) and Slice 23.5 (`0.4.0 → 0.4.1`) precedent covers — docs-only patch bump.

**Mechanics:**

1. Edited `datasets/jam-actions-v0-public/VERSION` from `0.4.1` to `0.4.2` (the single source of truth per Slice 11.5).
2. Edited `datasets/jam-actions-v0-public/CITATION.cff` `version: "0.4.2"` (consistency-checked by the packager).
3. Added the 3 new files to `datasets/jam-actions-v0-public/package-inputs.json`'s `curated_files` array (so the packager preserves them rather than treating them as stale).
4. Ran `pnpm exec tsx scripts/package-jam-actions-public.ts --today 2026-05-19`:
   - Loaded 37 curated, 5 generated, 2 generated_dirs (was 34/5/2; +3 new curated files)
   - VERSION + CITATION consistency check: PASS
   - Source commit: `ea68906` (the current HEAD)
   - 115 public records selected; 57 pairs + 1 standalone; pair completeness PASS
   - Wrote 234 generated file(s) + regenerated `checksums.sha256` (273 entries; was 270; +3 new files)
5. Re-ran `pnpm exec tsx scripts/verify-public-package-checksums.ts`: 273/273 PASS.
6. Re-ran `pnpm exec tsx scripts/check-release-gate.ts` on Slice 21 baseline: all 6 blocking axes PASS; aggregate PASS.
7. Ran `pnpm test`: 1513/1513 tests still pass.

**Diff confirmation (`git diff --stat datasets/jam-actions-v0-public/`):** only `VERSION`, `CITATION.cff`, `checksums.sha256`, `manifest.json`, `package-inputs.json` were modified. **No record file** modified. **No eval artifact** modified. **No splits / manifest data-bearing fields** modified beyond version strings.

**Alternative considered:** keep at 0.4.1 (treat the 3 new files as pure dry-run scaffolding, not a release). Rejected because the 3 files become curated artifacts of the package (they're inside `datasets/jam-actions-v0-public/`, not in a scratch dir), so the package's identity has changed. A version bump is the honest record-keeping choice.

## 8. Acceptance-bar verification — operator hard rules

Per the kickoff's hard rules:

| Rule | Evidence of compliance |
|---|---|
| NO actual Zenodo upload | No `zenodo.org/api/...` calls. The `zenodo-metadata.json` is a dry-run payload with no DOI and no auth. Verifiable by inspection of network logs (none) and the file contents (no `doi` field, no `access_token`, no `account_id`). |
| NO actual HF push | No `huggingface-cli` or `huggingface_hub` API calls. The `hf-dataset-card-check.md` is a manual schema validation report; no upload was executed. |
| NO auth tokens | No tokens read, written, or referenced in any artifact. |
| NO record content changes | `git diff --stat` shows no record files modified (only VERSION, CITATION, checksums, manifest, package-inputs). The 115 records + 57 pairs + 1 standalone are byte-identical to the Slice 23.5 baseline. |
| NO eval harness or release-gate logic changes | `src/dataset/eval/*.ts` + `src/dataset/release-gate.ts` + `scripts/check-release-gate.ts` + `scripts/verify-public-package-checksums.ts` — none of these were modified. The 1513-test suite still passes. |
| NO publication claim in slice doc | This doc declares the dataset a "candidate release" with PASS verdict; explicitly does NOT claim it has been published. Section 1 names dry-run as the purpose. |
| NO autonomous commit | This slice is reporting back without committing or pushing. The operator authorizes commits. |
| NO push | Same. |
| NO commit of `.tar.gz` / `.zip` archives | Archives written to `.slice24-artifacts/` (NOT inside `datasets/jam-actions-v0-public/`). They are not staged. |

All 9 hard rules cleared.

## 9. Open questions for actual publication (Slice 25)

These are the questions a future operator needs to answer before executing the actual publish. They are deliberately enumerated here so Slice 25 starts pre-armed.

1. **Zenodo account.** Does the operator have a Zenodo account (or a Zenodo Sandbox account for a trial deposit first)? The actual upload uses Zenodo's REST API with a `ZENODO_TOKEN` env var. Sandbox is `https://sandbox.zenodo.org/` for trial; production is `https://zenodo.org/`. A test deposit on sandbox first is the safe path.
2. **DOI minting workflow.** When the deposition is published on Zenodo, the platform mints a DOI in the form `10.5281/zenodo.<id>`. The DOI should then be backfilled into:
   - `CITATION.cff` (add a `doi:` field)
   - `README.md` (add a citation badge)
   - `ATTRIBUTION.md` (replace "URL: github" with "DOI: 10.5281/zenodo.X / URL: github" in the citation strings)
   - This would be a `0.4.3` patch bump after the deposit.
3. **HuggingFace organization.** `mcp-tool-shop-org` does not yet have an HF presence. Three paths: (a) create the HF org under the same name; (b) publish under a personal HF namespace and transfer later; (c) skip HF for v0 and publish only to Zenodo.
4. **HF auth token.** A `HF_TOKEN` write token is needed for `huggingface-cli upload`. Out of scope for Slice 24; first item Slice 25 must surface.
5. **GitHub release artifacts.** Should the `.tar.gz` / `.zip` archives be attached to a GitHub release tag (e.g., `jam-actions-v0-0.4.2`)? GitHub-release attachments are the conventional "second mirror" for Zenodo deposits. Slice 25 should decide.
6. **The 5 WARN-level HF metadata fields.** `source_datasets`, `multilinguality`, `annotations_creators`, `language_creators`, `pretty_description`. Optional but recommended. Could be a `0.4.3` docs-only patch before Slice 25 actual publish, or layered into Slice 25 directly.
7. **The held-out test split.** Should `records.jsonl` be split into `train.jsonl` + `test.jsonl` for clean HF `load_dataset` semantics? Slice 24's `configs` declares only `train`; consumers wanting the canonical test must read `splits.json`. This is a deliberate v0 choice but could be revisited.

## 10. Implications for Slice 25+

The path forward branches on operator decision:

**Path A — Slice 25 actual publish (if operator approves).**

1. Operator provisions `ZENODO_TOKEN` + optionally creates HF org + provisions `HF_TOKEN`.
2. Slice 25 executes the publish: actual Zenodo deposit (sandbox dry-run first; then production) → DOI mint → HF dataset repo create + upload → README dataset card auto-renders.
3. Post-publish backfill: DOI into CITATION.cff + README + ATTRIBUTION; patch bump to `0.4.3`.
4. GitHub release with tag `jam-actions-v0-0.4.3` and the `.tar.gz` + `.zip` archive attachments.

**Path B — Slice 24.5 metadata polish first.**

1. Add the 5 WARN-level HF fields to the README YAML frontmatter.
2. Patch bump to `0.4.3`.
3. Then Slice 25 publishes from the polished `0.4.3` state.

**Path C — Pre-release records polish (v0.5.0).**

1. Operator decides to do one more record-quality pass before first public release.
2. New enrichment slice → records changed → `0.5.0` minor bump.
3. Eval re-run → re-confirm RC-gate PASS.
4. Slice 25 publishes from `0.5.0`.

**Path D — Hold the dry-run dossier; defer publish indefinitely.**

1. The dry-run artifacts persist in the repo as evidence of publication-readiness.
2. No further work on this arc; operator focus shifts elsewhere.
3. The dossier is ready when the operator chooses to revisit publishing.

**Path E — Cross-model dogfood instead.**

1. Slice 25 runs the same eval against a second model (e.g., GPT-4 / Claude / DeepSeek / Llama) for cross-model validation of the corpus generality.
2. This expands the canonical RC-gate evidence base without changing records.
3. A successful cross-model PASS would strengthen the case for v1.0 promotion.

This slice does not pick a path. It leaves all 5 paths viable.

---

## Cross-references

- Source commit at slice start: `ea68906`
- Source tag at HEAD: `jam-actions-v0-reproducibility-cleared-2026-05-19`
- Canonical Slice 22 PASS verdict: `datasets/jam-actions-v0-public/evals/slice22-release-gate-revised-assessment.json`
- Slice 23 audit doc: `docs/jam-actions-v0-slice23-operator-aloneness-audit.md`
- Slice 23.5 reproducibility-cleanup doc: `docs/jam-actions-v0-slice23-5-reproducibility-cleanup.md`
- Three new curated files: `RELEASE_NOTES.md`, `zenodo-metadata.json`, `hf-dataset-card-check.md`
- Archive build outputs: `.slice24-artifacts/jam-actions-v0-public-0.4.1.tar.gz`, `.slice24-artifacts/jam-actions-v0-public-0.4.1.zip` (NOT committed — audit artifacts only)
- Test count: 1513 (unchanged)
- Suggested commit tag at slice close: `jam-actions-v0-publication-dry-run-2026-05-19`

## Hard-gate checklist (kickoff §"Hard gates")

| # | Gate | Status |
|---|---|---|
| 1 | All 1513 existing tests still pass | PASS |
| 2 | Network-clone PASS + checkout PASS + install PASS + checksum verify 270/270 + release-gate PASS | PASS |
| 3 | Archive contents include all 270+ files; exclude `.git/`; exclude content outside package dir | PASS (271 files in tar; no leakage) |
| 4 | `zenodo-metadata.json` schema-valid against Zenodo deposition API spec | PASS (JSON valid; all required fields present; no doi/auth) |
| 5 | `zenodo-metadata.json` contains all required fields + NO `doi` + NO auth tokens | PASS |
| 6 | `hf-dataset-card-check.md` provides field-by-field schema check + explicit gap list | PASS (13 fields checked; 5 WARN-level gaps explicitly named) |
| 7 | `RELEASE_NOTES.md` covers full 0.1.0 → current arc with date + slice + summary | PASS (8 rows) |
| 8 | `RELEASE_NOTES.md` cross-references canonical Slice 22 gate-PASS artifact | PASS |
| 9 | Source corpus, records, records.jsonl, splits, eval artifacts byte-identical | PASS (`git diff` shows none of these modified) |
| 10 | Eval harnesses + release-gate validator core byte-identical | PASS (`git status` shows no changes outside the public-package dir; tests pass) |
| 11 | If bumped to 0.4.2: VERSION + manifest + CITATION consistent; checksums verify | PASS (273/273) |
| 12 | Phase 1 network-clone end-to-end successful | PASS (~141s wall time; all sub-steps green) |
| 13 | NO actual Zenodo or HF upload commands executed | PASS (verifiable by inspection) |
| 14 | NO autonomous commit; stop and report | PASS (no commit issued; this report is the stop) |

All 14 hard gates clear. The slice's value is preparing Slice 25 with the complete dossier so the actual publish can execute without surprises.
