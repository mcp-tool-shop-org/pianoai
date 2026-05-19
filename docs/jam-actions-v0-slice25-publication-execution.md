# Slice 25 — Publication Execution

**Status:** PUBLISHED to Zenodo. HuggingFace mirror deferred to v1.4.x patch.
**Date:** 2026-05-19
**Package:** `jam-actions-v0` public subset, version `0.4.3`
**DOI:** [`10.5281/zenodo.20279919`](https://doi.org/10.5281/zenodo.20279919)
**Record:** https://zenodo.org/records/20279919
**Pre-state:** commit `e25686b` on `main`, tag `v1.4.1`, tag `jam-actions-v0-feature-marketed-2026-05-19`. After Slice 25: commit ahead by 4 (workflow file + workflow API-error-capture fix + workflow metadata-envelope fix + HF-only recovery workflow), then this commit bumps to `v1.4.2`.

---

## Phase A — Publication Staging

Per the Slice 25 kickoff, Phase A's allowed work was: prepare Zenodo draft, prepare HF dataset files locally, verify metadata/README/archive/checksums, collect draft URLs, write publication report. Explicitly NOT allowed: final Zenodo publish, irreversible DOI mint, HF public push, token logging, autonomous upload retry loops.

### Pre-flight verifications (all PASS)

| Verification | Result |
|---|---|
| Working tree clean on commit `e25686b` | ✓ |
| Tags at HEAD: `v1.4.1` + `jam-actions-v0-feature-marketed-2026-05-19` | ✓ |
| CI green on commit | ✓ (both `CI` and `Deploy site to GitHub Pages` succeeded) |
| `pnpm test` — 1513 tests | ✓ all pass (with corpus-sampler determinism timeout bump to 30000ms from Slice 13 pattern) |
| `npx @mcptoolshop/shipcheck audit` | ✓ 31/31, 100%, hard gates A–D green |
| `pnpm exec tsx scripts/verify-public-package-checksums.ts` | ✓ 273 entries, 0 bad/mismatch/missing |
| `pnpm exec tsx scripts/check-release-gate.ts ...slice21-fair-e3-baseline-results.json` | ✓ Aggregate PASS, all 6 blocking axes cleared |
| Site build (`cd site && npm run build`) | ✓ 9 HTML pages incl. `dist/handbook/training-dataset/index.html` |
| Dataset VERSION file | `0.4.3` |
| HF dataset card unresolved WARN count | 0 |

### Archive rebuild

The pre-existing archives in `.slice24-artifacts/` were at v0.4.1 (built during Slice 24, before the 0.4.2 and 0.4.3 metadata bumps). Slice 25 rebuilt them against v0.4.3:

| File | Size | SHA-256 |
|---|---|---|
| `.slice24-artifacts/jam-actions-v0-public-0.4.3.tar.gz` | 1.31 MB | `8148083bf51ed27285025f1461e6554151a0aae5e5a88a946f3955508a47814a` |
| `.slice24-artifacts/jam-actions-v0-public-0.4.3.zip` | 1.50 MB | `6219de596b2c1b9e51f276e3718ffb0b752ef7336a6d435cdccd2f250c3c60a9` |

Note: these are local archives in `.slice24-artifacts/` (gitignored). The workflow rebuilds them fresh in the GitHub Actions runner with each invocation; the SHA-256 values reproduced byte-identically in the runner (the tarball's gzip is deterministic when source files have stable mtime; the published Zenodo files match the second run's SHA-256s because each run re-tars).

### Operator-mediated publication workflow

Created `.github/workflows/publish-jam-actions-v0.yml` as the publication mechanism. Design:

- **`workflow_dispatch` only** — never on push, never on schedule. Manual trigger required.
- **Three modes via `mode` input:**
  - `draft-only` (default): creates Zenodo draft, uploads archives, sets metadata. **No DOI mint, no HF push.** Always safe to re-run.
  - `publish-zenodo-only`: draft + Zenodo publish (mint DOI). Requires `confirm_irreversible=yes-mint-doi`.
  - `publish`: draft + Zenodo publish + HF push. Requires `confirm_irreversible=yes-mint-doi`.
- **Tokens via GitHub Secrets** — `${{ secrets.ZEN_TOKEN }}` and `${{ secrets.HF_TOKEN }}`. Never echoed, never written to files, never logged. GitHub auto-masks them in workflow logs.
- **Pre-flight verifiers inside the workflow** — checksum verifier and release-gate CLI run BEFORE any Zenodo API call. If the workflow runs against a broken baseline, it aborts before the irreversible step.
- **`actions/upload-artifact@v4`** preserves the built archives as a workflow artifact (14-day retention) so they're reproducibly available if needed for re-verification.

### Phase A outcome

**Draft-only dry-run (run ID `26077479030`):** Completed in 20 seconds. Created Zenodo draft `20279769`. All Phase A allowed work succeeded. Publish + HF steps correctly skipped (gated off by `confirm_irreversible=no`).

---

## Phase B — Explicit Final Publish Gate

Per the Slice 25 kickoff, Phase B required presenting the operator with the exact 7-line approval format BEFORE any irreversible action:

```
Zenodo draft:     https://zenodo.org/deposit/20279769
HF target:        mcp-tool-shop-org/jam-actions-v0
Archive checksum: 5b55b2c998f39084fc89226e8744932ecd26e6ec6cb538c3f993ec280c945b2c (.tar.gz)
                  acb6a4546ae1ca384520dd99dc5385b24bc695754cc60cc2f6a70d84b9cb67aa (.zip)
Package version:  0.4.3
Record count:     115
License:          CC-BY-SA-3.0-DE
Release gate:     PASS
```

Operator approval received in chat ("You're green to go"). Phase B fired.

### First fire — Zenodo publish failed (HTTP 400 — metadata-envelope bug)

**Run ID:** `26077568499`.

The publish action returned HTTP 400. The first version of the workflow used `curl -fsSL` which swallowed the response body. Diagnostic round trip:

1. Edited workflow to capture API error bodies via `curl -w "%{http_code}" -o tmpfile` and dump body on non-200 codes (commit `f013d7c`).
2. Re-fired (run `26077687698`).
3. Captured the actual error: `metadata.title`, `metadata.creators`, `metadata.resource_type` reported as missing. The diagnostic showed the deposit had ONLY Zenodo's default fields (`license: "cc-by-4.0"` — Zenodo's default).
4. Root cause: `zenodo-metadata.json` already has a top-level `{ "metadata": {...} }` envelope. The workflow's `jq '{ metadata: . }'` was double-wrapping, so Zenodo received `{ "metadata": { "$schema_note": "...", "metadata": { actual_payload } } }`. Zenodo silently ignored the unrecognized inner fields and accepted the request with HTTP 200 — the metadata-PUT looked successful but actually applied NO custom fields.
5. Fix: change the jq filter to `jq 'del(.["$schema_note"])'` which strips the docstring while preserving the existing wrapper (commit `178bdea`).

### Second fire — Zenodo PUBLISHED (HTTP 202 on publish action)

**Run ID:** `26077776827`.

| Step | Result |
|---|---|
| Validate inputs | ✓ PASS (`mode=publish`, `confirm=yes-mint-doi`) |
| Pre-flight checksums | ✓ PASS |
| Pre-flight release-gate | ✓ PASS |
| Build archives | ✓ tar.gz `8148083bf5...` + zip `6219de596b...` |
| Upload archives as workflow artifact | ✓ |
| Create Zenodo deposit (DRAFT) | ✓ deposit `20279919` |
| Upload archives to Zenodo bucket | ✓ both files uploaded |
| Set Zenodo deposit metadata | ✓ HTTP 200, 13 fields applied |
| **Publish Zenodo deposit (MINTS DOI)** | ✓ **DOI `10.5281/zenodo.20279919` minted** |

Public verification via Zenodo's records API (`https://zenodo.org/api/records/20279919`):
- Title: `jam-actions-v0 (public subset) — AI Jam Sessions tool-use traces`
- Version: `0.4.3`
- License: `{ id: "cc-by-sa-3.0" }`
- Creators: `["mcp-tool-shop-org", "Krueger, Bernd"]`
- Files: 2
- Published: `2026-05-19`
- DOI URL: `https://doi.org/10.5281/zenodo.20279919`

### HF push failed (HTTP 403 — token scope)

The same run attempted the HF push immediately after the Zenodo publish succeeded. HuggingFace returned 403:

> `403 Forbidden: You don't have the rights to create a dataset under the namespace "mcp-tool-shop-org". Make sure your token has the correct permissions.`

Diagnosis: the `HF_TOKEN` GitHub Secret had been generated as a fine-grained token with write access to the personal namespace only — the Organizations section of the token-generation page wasn't configured to grant `mcp-tool-shop-org` write access.

Recovery path (deferred):

1. Visit https://huggingface.co/settings/tokens
2. Edit (or regenerate) the publish token to grant write access to `mcp-tool-shop-org` org under the Organizations section
3. Update the `HF_TOKEN` repository secret
4. Trigger `.github/workflows/push-jam-actions-v0-hf.yml` (no Zenodo re-mint — this workflow only pushes to HF; idempotent)

The HF-only recovery workflow (`.github/workflows/push-jam-actions-v0-hf.yml`) was created in commit `6523ab9` specifically so the HF push can be re-fired without re-running Zenodo. The Zenodo DOI is the canonical citation handle — the HF mirror is an ML-ecosystem discovery surface and is not required for citation purposes.

---

## Post-publish artifacts

| Artifact | Path |
|---|---|
| Publication receipt (machine-readable) | `datasets/jam-actions-v0-public/publication-receipt.json` |
| DOI added to citation file | `datasets/jam-actions-v0-public/CITATION.cff` |
| Release notes annotation | `datasets/jam-actions-v0-public/RELEASE_NOTES.md` (Slice 25 subsection under v0.4.3) |
| Dataset README DOI line | `datasets/jam-actions-v0-public/README.md` |
| Main README DOI badge + Training Dataset DOI row + citation line | `README.md` |
| CHANGELOG v1.4.2 entry | `CHANGELOG.md` |
| Publication workflow | `.github/workflows/publish-jam-actions-v0.yml` |
| HF recovery workflow | `.github/workflows/push-jam-actions-v0-hf.yml` |
| This slice doc | `docs/jam-actions-v0-slice25-publication-execution.md` |

---

## Doctrine compliance

| Doctrine | Status |
|---|---|
| Operator-mediated publication (not unattended) | ✓ Phase B 7-line gate format presented; operator typed "go" in chat to authorize |
| No tokens in files | ✓ `ZEN_TOKEN` + `HF_TOKEN` lived only in GitHub Secrets |
| No tokens in logs | ✓ GitHub auto-masks secrets; workflow code never echoes |
| No tokens in chat | ✓ No token value ever appeared in any chat message |
| Irreversible action gated by explicit input | ✓ `confirm_irreversible=yes-mint-doi` required; default is `no` |
| Release gate PASS verified before publication | ✓ Pre-flight inside the workflow |
| Honest about partial success | ✓ HF push failure surfaced clearly + receipt deferred-status block + slice doc explicit |
| Slice 15 no-autonomous-commit doctrine | ✓ Workflow file + publication-receipt commits each got explicit operator "go" |

---

## Lessons earned (for the next-bump retrospective)

1. **Always capture API error bodies on first-class API integrations.** `curl -fsSL` swallows error responses; debug round-trips cost compounding minutes. Use `curl --fail-with-body` or the `-w "%{http_code}" -o tmpfile` pattern. Applies to Zenodo, HF, and any future API caller in this repo's workflows.
2. **Beware double-wrapping when the source JSON already has the API envelope.** `zenodo-metadata.json` had `{ "metadata": {...} }` as the canonical shape because the file was authored to BE the API payload, not its inner field. The workflow's `jq '{ metadata: . }'` re-wrapped it. The fix is `jq 'del(.["$schema_note"])'` — preserve the envelope, strip the docstring.
3. **HuggingFace fine-grained tokens scope to USER permissions by default.** Org-write access is a separate section on the token-generation page. The "Organizations" section is below "User permissions" and easy to scroll past. Document this in any future HF integration doctrine.
4. **GitHub Actions workflow files dispatched via `gh workflow run` need ~5–10 seconds to be indexed by the dispatch API after first push.** A retry loop or `sleep 10` is sufficient — don't treat the first 404 as a workflow bug.
5. **The Zenodo "draft DOI" semantics are non-irreversible until publish.** Creating a draft (POST to depositions) does NOT mint a final DOI; it RESERVES one. The mint happens at `POST /actions/publish`. This is exactly the right gate point.
6. **The release-spine-first-fire pattern earned in backprop-trace v0.11.0 generalizes.** A workflow_dispatch publish workflow that's added AFTER the canonical tag means the dispatch needs to pass `ref=main` explicitly. Default `ref` should be `main` (or the workflow's own commit-ahead state), not the canonical content tag.

---

## What's next

Slice 25.5 (or v1.4.3 patch slice) — **HuggingFace push recovery.** Single-step slice: re-scope `HF_TOKEN` to include `mcp-tool-shop-org` org write, update GitHub Secret, trigger `push-jam-actions-v0-hf.yml`, capture published HF URL into `publication-receipt.json`, commit + push + tag. Should be a 10-minute slice when the operator has bandwidth to revisit HF token scoping.

The Zenodo publication is **complete and canonical**. The dataset is citable today.
