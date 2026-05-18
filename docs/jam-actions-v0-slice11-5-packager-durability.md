# jam-actions-v0 Slice 11.5 — Packager Durability Fix

**Status:** SHIPPED (pending review)
**Date:** 2026-05-17
**Base commit:** `057a26b` (Slice 11 enrichment)
**Saved-point tag (prior):** `jam-actions-v0-enriched-2026-05-17`
**Suggested release tag:** `jam-actions-v0-packager-durable-2026-05-17`

## What changed in one paragraph

The Slice 10/11 packager had two fragility issues: it carried a hardcoded `PACKAGE_VERSION` constant (4-place version drift risk), and it silently wiped any curated docs in the package directory because it only knew about the files it explicitly wrote. Slice 11.5 removes the hardcoded version (VERSION file is now the single source of truth), introduces `datasets/jam-actions-v0-public/package-inputs.json` to declare curated vs generated files, and rewires the packager + helper scripts to preserve curated docs by default. Zero record content changes; zero source-corpus mutation; zero version bump (stays at 0.2.0). Package now ships 13 top-level files + 230 records/SVGs = 243 files total (242 checksum entries).

## Architecture decisions

### Decision 1 — CITATION.cff sync mode: consistency check (option b)

**Choice:** consistency check. The packager reads VERSION + CITATION.cff at startup; if `CITATION.cff.version` ≠ VERSION value, packager FAILS with an actionable error message that instructs the operator to manually edit CITATION.cff. The packager never writes to CITATION.cff.

**Why over surgical YAML editing:** treats CITATION.cff as truly curated content. No coupling to a YAML library. No risk of mangling multi-line YAML, comments, or formatting. The error message is the manual bump procedure:

```
1. Edit datasets/jam-actions-v0-public/VERSION
2. Edit datasets/jam-actions-v0-public/CITATION.cff version field to match
3. Re-run packager
```

Three steps for a version bump, vs the previous four-place edit. The reduction in implicit knowledge (no hardcoded constant to remember to update) is the real win.

The consistency-check parser (`extractCitationCffVersion`) handles quoted, single-quoted, and bare version values; ignores commented-out lines; tolerates CRLF and LF line endings. 6 dedicated tests cover the matrix.

### Decision 2 — `--regenerate-docs` flag: reserved no-op

The flag is accepted by the CLI; running with it emits an informational line ("reserved syntax; no-op in this slice"). The DEFAULT behavior (without the flag) is what matters: curated docs are preserved per `package-inputs.json`.

When a future slice has a legitimate reason to regenerate a curated doc (e.g., template-based README.md regen, auto-bump CITATION.cff from VERSION), it will implement the flag's behavior. For Slice 11.5, the lock is preserve-by-default; the flag is a reserved escape hatch.

### Decision 3 — `package-inputs.json` shape

```json
{
  "version_file": "VERSION",
  "curated_files": [6 entries],
  "generated_files": [5 entries including checksums.sha256],
  "generated_dirs": ["records", "pianoroll"]
}
```

`package-inputs.json` itself is implicit (always-present, always-checksummed; not listed in any array). `checksums.sha256` IS listed in `generated_files` per the kickoff design (so operators see at a glance what the packager regenerates); the packager has a special skip when collecting checksum inputs (can't checksum itself).

`assertPackageInputsValid()` rejects:
- missing version_file field
- non-array curated_files / generated_files / generated_dirs
- the same path appearing in more than one of the three arrays (conflicting input declaration)
- `package-inputs.json` listed explicitly in any array

7 tests cover the validator.

### Decision 4 — Source tag from git, not a constant

The CLI now resolves `source_tag` via `git describe --tags --exact-match HEAD` if HEAD is tagged, falling back to `git rev-parse --short HEAD`. Operators can override with `--source-tag <string>` for a dry-run before the tag exists. No more hardcoded `SOURCE_TAG` constant.

## Library API additions

In `src/dataset/package-public.ts`, 8 new exports (additive; no breaking changes to existing exports used by Slice 10/11):

| Function | Purpose |
|---|---|
| `readPackageInputs(packageDir)` | Parse + validate `package-inputs.json` |
| `assertPackageInputsValid(parsed)` | Validate the shape (throws on conflict) |
| `readVersion(packageDir, name?)` | Read + trim VERSION file (throws if missing/empty) |
| `extractCitationCffVersion(text)` | Find the `version:` field in CFF text |
| `assertCitationCffMatchesVersion(packageDir, v)` | Consistency check (throws on mismatch) |
| `assertCuratedFilesPresent(packageDir, inputs)` | Verify curated files exist; collect empty-file warnings |
| `removeStaleGeneratedFiles(packageDir, inputs, shouldBe)` | Stale-removal for generated_dirs |
| `walkChecksumFiles(packageDir, inputs)` | Walk for checksum inputs; flag undeclared files |

Plus type export: `interface PackageInputs`.

## Test counts

| Suite | Before | After | Delta |
|---|---|---|---|
| Full repo test suite | 1281 | 1320 | +39 |
| package-public.test.ts only | 24 | 63 | +39 |

Above the operator's ≥40 packager-test target by 23 tests. New tests cover:
- 7 — `assertPackageInputsValid` / `readPackageInputs` shape + conflicts
- 3 — `readVersion` (read, missing, empty)
- 9 — CITATION.cff parsing + consistency
- 3 — `assertCuratedFilesPresent`
- 3 — `removeStaleGeneratedFiles`
- 3 — `walkChecksumFiles`
- 9 — full-package integration smoke (the 9-test contract from the kickoff)
- 1 — no-hardcoded-PACKAGE_VERSION exported from library
- 1 — accepts checksums.sha256 in generated_files (kickoff design)

All tests use `mkdtempSync(join(tmpdir(), ...))`; none write outside `os.tmpdir()`.

## Idempotency confirmation

Two consecutive `pnpm exec tsx scripts/package-jam-actions-public.ts --today 2026-05-17` runs against the current state produce **0 file diffs** across all 243 files in the package directory. Verified via SHA-256 of the directory tree compared between runs.

## Hard-gate report (12 items)

| # | Gate | Result |
|---|---|---|
| 1 | All 1281 existing tests still pass | PASS — 1320/1320 (1281 + 39 new) |
| 2 | ≥40 packager tests total | PASS — 63 packager tests (24 baseline + 39 new) |
| 3 | Idempotency: 0 file diffs between two consecutive packager runs | PASS — 243/243 files byte-identical (SHA-256 verified) |
| 4 | `verify-public-package-checksums.ts` passes with 242 entries | PASS — "All checksums verify, every file accounted for" |
| 5 | 4 Slice 10.5 curated docs byte-identical before/after | PASS — ATTRIBUTION.md, DATASET_SCHEMA.md, KNOWN_LIMITATIONS.md, LICENSE-DATASET.md all byte-identical (plus README.md + CITATION.cff for 6 total) |
| 6 | All 6 enriched records byte-identical (records/*.json + records.jsonl) | PASS — records dir byte-identical via `diff -r`; records.jsonl byte-identical |
| 7 | Source corpus `datasets/jam-actions-v0/` byte-identical | PASS — 304 files byte-identical (SHA-256 manifest diff = empty) |
| 8 | `manifest.json.instrument_surfaces.ai_jam_sessions` present; vocal_synth_engine absent | PASS — verified in regenerated manifest.json |
| 9 | No hardcoded `PACKAGE_VERSION` constant in script or library | PASS — removed from CLI; library never exported it; explicit test guards against re-introduction |
| 10 | CITATION.cff version === VERSION value | PASS — CITATION.cff says "0.2.0"; VERSION says 0.2.0; consistency check logs "PASS" |
| 11 | `package-inputs.json` exists with correct shape | PASS — exactly the kickoff-locked file set (6 curated, 5 generated, 2 generated_dirs) |
| 12 | `records.jsonl=115, splits 103/12, pianoroll/=115, version="0.2.0"` | PASS — all preserved (verified in regenerated manifest + checksums) |

## What is now different at the operator surface

Bumping the package version, post-Slice-11.5:

```bash
# Before (Slice 10/11): 4 edits
#   1. datasets/jam-actions-v0-public/VERSION
#   2. datasets/jam-actions-v0-public/CITATION.cff version field
#   3. scripts/package-jam-actions-public.ts PACKAGE_VERSION constant
#   4. scripts/package-jam-actions-public.ts SOURCE_TAG constant (if relevant)
#   Then: pnpm exec tsx scripts/package-jam-actions-public.ts --today YYYY-MM-DD

# After (Slice 11.5): 2 edits + repackage
#   1. datasets/jam-actions-v0-public/VERSION
#   2. datasets/jam-actions-v0-public/CITATION.cff version field (consistency check enforces match)
#   Then: pnpm exec tsx scripts/package-jam-actions-public.ts --today YYYY-MM-DD
```

If the operator forgets to update CITATION.cff after editing VERSION, the packager refuses to run with:

```
FATAL: Version mismatch: VERSION says "0.3.0" but CITATION.cff says "0.2.0".
Update CITATION.cff manually to match VERSION before packaging.
The packager treats CITATION.cff as curated content and never auto-edits it.
```

If the operator (or some other slice) accidentally deletes a curated doc before running the packager, it refuses to run with:

```
FATAL: Curated file missing on disk: 'ATTRIBUTION.md' (declared in package-inputs.json.curated_files).
The packager will not silently regenerate hand-curated content.
Restore 'ATTRIBUTION.md' from git, or remove it from package-inputs.json if it is no longer curated.
```

The Slice 10.5 doctrine ratchet "packager is destructive on curated docs" is now **retired**. Its replacement: "packager preserves curated docs declared in package-inputs.json; missing-curated fails the run; undeclared files are warn-and-included for data preservation."

## Suggested commit message

```
Harden jam-actions v0 packager for durable curated-doc preservation

Slice 11.5 — VERSION is now the single source of truth, package-inputs.json
declares curated vs generated files, and the packager preserves curated docs
by default. Zero record content changes; zero source-corpus mutation; zero
version bump (stays at 0.2.0).

Refactor scope:
- src/dataset/package-public.ts: 8 new library helpers (readPackageInputs,
  readVersion, extractCitationCffVersion, assertCitationCffMatchesVersion,
  assertCuratedFilesPresent, removeStaleGeneratedFiles, walkChecksumFiles,
  assertPackageInputsValid) + PackageInputs type. No breaking changes to
  existing exports used by Slice 10/11.
- scripts/package-jam-actions-public.ts: PACKAGE_VERSION + SOURCE_TAG
  constants removed; CLI reads VERSION + package-inputs.json; runs CITATION
  consistency check at startup; stale-removal for generated_dirs;
  --regenerate-docs reserved as no-op for future slices; source tag derived
  via `git describe --tags --exact-match HEAD` with fallback to short SHA.
- scripts/regenerate-public-package-checksums.ts +
  scripts/verify-public-package-checksums.ts: rewired through
  walkChecksumFiles + package-inputs.json (no more hardcoded walks).
- datasets/jam-actions-v0-public/package-inputs.json: NEW, declares 6
  curated_files + 5 generated_files + 2 generated_dirs.
- datasets/jam-actions-v0-public/checksums.sha256: regenerated, 241 → 242
  entries (the new package-inputs.json line).
- datasets/jam-actions-v0-public/manifest.json: regenerated, source_commit
  reflects current HEAD (057a26b vs prior f133b63); all other fields
  byte-identical including version="0.2.0".

Tests: 1281 → 1320 (+39); packager-only 24 → 63 (+39, well above the
≥40 target). All new tests use os.tmpdir(); no fs writes outside tmp.

Idempotency confirmed: two consecutive packager runs produce 0 file diffs
across all 243 package files (SHA-256 verified).

12/12 hard gates pass. The Slice 10.5 doctrine ratchet "packager is
destructive on curated docs" is retired; replaced by "packager preserves
curated docs declared in package-inputs.json."
```

## Suggested release tag (after commit + push)

```
jam-actions-v0-packager-durable-2026-05-17
```

## Doctrine ratchets earned

1. **package-inputs.json contract is the operator-facing source of truth** for which files in a packaged directory are curated vs generated. Any slice that adds a new file to the package must update package-inputs.json in the same commit; the packager's warn-and-include behavior on undeclared files is the safety net, not the contract.

2. **Consistency check beats surgical edit** for version-bearing curated files. Treat curated content as truly curated; require the operator to manually keep version-bearing fields in sync; let the packager enforce the invariant on every run. This is simpler than auto-edit + less prone to subtle bugs in YAML/Markdown processing.

3. **VERSION trim discipline** — always trim whitespace + newlines before parsing/comparing version strings. Single-test guard against the edge case (Slice 11.5's `readVersion` does this; the test scenario covers it).

4. **Stale-removal precedes write** in generated_dirs. If you only overwrite, you accumulate orphans. The Lock 5 test scenario (plant a `stale-record.json`; run packager; assert deletion) is the canonical regression test for this class of bug.

5. **Reserved CLI syntax is a valid first step** for future-capability flags. `--regenerate-docs` accepted-but-no-op in Slice 11.5 prevents the flag from becoming a foot-gun before its semantics are designed; the next slice that needs it can implement without breaking any existing operator workflow.
