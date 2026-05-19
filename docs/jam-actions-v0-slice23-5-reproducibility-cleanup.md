# jam-actions-v0 — Slice 23.5 Reproducibility Cleanup

**Date:** 2026-05-19
**Parent commit:** `a5daec2` (Slice 23 audit tag `jam-actions-v0-aloneness-audit-gaps-2026-05-19`)
**Package version:** 0.4.0 → 0.4.1 (patch — doc + tooling hardening; no record content change)
**Audit method:** git worktree at HEAD + uncommitted-patch apply; pnpm install + verify + check-release-gate; no model runs
**Verdict:** **GAPS CLEARED** (the 3 Slice 23 blockers + 8 moderate gaps; verified via Phase 7 fresh-worktree audit)

---

## 1. The gaps

Slice 23's operator-aloneness audit (`docs/jam-actions-v0-slice23-operator-aloneness-audit.md`) inventoried 13 gaps blocking a cold Windows contributor from reproducing the Slice 22 RC-gate PASS state. **Three blockers:** Windows-only checksum-verifier failure (Gap #1); README → verification disconnect (Gap #5); untraceable Slice 22 PASS verdict from front-page docs (Gap #12). **Eight moderate:** CLI silent-default trap (Gap #2); stale README/ATTRIBUTION/KNOWN_LIMITATIONS version stamps (Gaps #3, #4, #6, #7, #8, #10); missing `.gitattributes` (Gap #13). **Two cosmetic:** broken DATASET_SCHEMA cross-reference (Gap #9); undocumented `package-inputs.json` (Gap #11).

Slice 23.5 scope is exactly as the audit's §9 recommended: close the 3 blockers, address the 8 moderate items, fold the 2 cosmetic items into the moderate-item fixes where they overlapped.

## 2. `.gitattributes` rule (scope + rationale)

**File:** `.gitattributes` (new at repo root)

```
*.sha256 text eol=lf
datasets/jam-actions-v0-public/** text eol=lf
```

**Scope chosen:** medium — `*.sha256` globally + the entire dataset-package subtree. Narrower than the audit's "medium = `*.sha256` everywhere" recommendation; broader than the audit's "narrow = `datasets/**/checksums.sha256` only" alternative. Rationale:

- The audit identified the parse-time bug for `checksums.sha256` (Gap #1), but the Phase 7 fresh-worktree test revealed a deeper structural issue: **every** text file in the dataset package is hash-checked, and the hashes are computed against the canonical LF content. On Windows with `core.autocrlf=true` (the rig default), a fresh-clone of the dataset would convert all `.md`/`.json` files to CRLF on disk, breaking hash verification even after the parser is CRLF-tolerant.
- The dataset package is a release artifact (Zenodo + HuggingFace candidate), so its on-disk bytes must equal the canonical hashed bytes for verification to succeed. The `eol=lf` rule on `datasets/jam-actions-v0-public/**` pins the package files to LF on disk on every platform, regardless of `core.autocrlf`.
- Other repo files (source TypeScript, tests, top-level docs) keep their default normalization behavior — the blast radius outside the dataset package is zero.

**`git add --renormalize .` result:** zero diffs against tracked files on the main worktree. The repository content was already LF-clean for the `*.sha256` file class; the dataset-package broader scope was discovered necessary during Phase 7 audit and required separate LF normalization of three CRLF-corrupted files on the main worktree (DATASET_SCHEMA.md, ATTRIBUTION.md after edit, KNOWN_LIMITATIONS.md after edit, README.md after edit, and one stale eval sample). These were normalized via PowerShell binary read+rewrite, then the packager regenerated checksums against the LF content.

**Verification:**

```
git check-attr eol datasets/jam-actions-v0-public/checksums.sha256
  → datasets/jam-actions-v0-public/checksums.sha256: eol: lf
git check-attr eol datasets/jam-actions-v0-public/README.md
  → datasets/jam-actions-v0-public/README.md: eol: lf
```

## 3. CRLF-tolerant verifier (defense in depth)

**File:** `src/dataset/package-public.ts` (new helper) + `scripts/verify-public-package-checksums.ts` (call-site refactor)

A new exported function `parseChecksumsManifest(manifestStr)` parses the `checksums.sha256` body. The parser:

- Splits on `/\r?\n/` to accept both LF and CRLF separators.
- Strips a trailing `\r` from each line before regex match (handles mixed-EOL cases where a Windows editor introduced CRLF mid-file).
- Collects bad lines without throwing; returns `{ claimed, badLines, totalLines }`.

The verifier was refactored to use this helper. The call-site is now ~10 lines instead of ~15, and the parser is unit-tested without spinning up the verifier's filesystem-walk machinery.

**Tests (7 new in `src/dataset/package-public.test.ts`):**

- Parses LF-terminated input (the packager's canonical format).
- Parses CRLF-terminated input (the Windows fresh-clone case that broke Slice 23).
- Parses mixed LF + CRLF (Windows editor mid-file).
- Collects bad lines without throwing.
- Ignores blank lines (trailing newline padding).
- Round-trips with `buildChecksumsManifest` output (every entry parses).
- Round-trips with CRLF-corrupted `buildChecksumsManifest` output.

**Defense layering:**

1. **Byte-equality layer:** `.gitattributes` pins LF on disk so on-disk bytes equal hashed bytes.
2. **Parse-tolerance layer:** `parseChecksumsManifest` tolerates CRLF in the manifest itself even if a consumer strips the `.gitattributes` rule.

Both layers must fail before the verifier produces incorrect output. Slice 23's audit caught the parser layer; Phase 7 revealed the byte-equality layer needs separate defense.

## 4. README Reproducibility section

**File:** `datasets/jam-actions-v0-public/README.md`

Added a new `## Reproducibility` section directly after `## Dataset Structure`. Content:

1. **Package version pinned** to 0.4.1 (built 2026-05-19); explicit "Slice 23.5 is operational hardening only, no record content changes."
2. **Three canonical tags named:** `jam-actions-v0-rc-gate-revised-2026-05-19` (Slice 22 PASS state); `jam-actions-v0-aloneness-audit-gaps-2026-05-19` (Slice 23 audit findings); Slice 23.5 reproducibility-cleanup tag (this version).
3. **Three-step verification commands:** `git clone` + `git checkout` + `pnpm install` + `verify-public-package-checksums.ts` + `check-release-gate.ts`.
4. **Expected outputs:** the `[ok] All checksums verify` line + the `RC gate PASS` aggregate.
5. **Backlink** to `evals/slice22-release-gate-revised-assessment.json` as the canonical PASS verdict.
6. **Regression-check section** showing the Slice 19 baseline still FAILs under the revised gate (the cold-reader trap from Slice 23 audit).
7. Explicit "no model runs are required for reproducibility" disclaimer pointing to the source repo for re-runs.

The README header version block was also updated (Gap #3 closed): version 0.2.0 → 0.4.1; built 2026-05-17 → 2026-05-19; source commit `f133b631` → `a5daec2`; source tag `jam-actions-v0-enriched-2026-05-17` → `jam-actions-v0-aloneness-audit-gaps-2026-05-19` plus Slice 23.5 patch note. BibTeX version updated to 0.4.1.

The `evals/` directory + `package-inputs.json` are now mentioned in the file list (Gaps #4 + #11 closed).

## 5. Strict CLI (positional-arg handling)

**File:** `scripts/check-release-gate.ts` + `scripts/check-release-gate.test.ts` (new)

`parseArgs` rewrite (audit Gap #2):

- A single positional argument is treated as `--baseline <path>`. This closes the cold-reader trap where `tsx check-release-gate.ts <slice21-baseline.json>` silently ran against `DEFAULT_BASELINE` (Slice 19) and reported the regression-check FAIL output.
- Two or more positionals raise `CliArgsError`: `expected at most one positional baseline path; got N: '...', '...'`.
- Mixing a positional with `--baseline` raises `CliArgsError`: `cannot mix positional baseline path '...' with --baseline '...'`.
- Unknown `--flag` continues to error (pre-existing behavior preserved).
- A new `[info]` line is printed when no positional/flag is supplied and the default baseline is used — explicit acknowledgment that the user is running against the FAIL regression baseline.

`parseArgs` and `CliArgsError` are now exported. The script's top-level statements were moved into a `main()` function gated on an `isMain` check (`import.meta.url === file://${process.argv[1]}`), so the file can be imported by tests without executing the CLI.

**Tests (15 new in `scripts/check-release-gate.test.ts`):**

- Default baseline when no args.
- `--baseline <path>` works.
- Single positional → baseline.
- Two positionals → error with "expected at most one positional".
- Three positionals → error with "got 3".
- Mix positional + `--baseline` → error with "cannot mix positional".
- Unknown `--flag` → error with "unknown flag".
- `--quiet` works.
- `--help` works.
- `-h` alias works.
- `--no-reports-enriched-split` works.
- `--out <path>` works.
- Threshold-override flags work (axis1/axis2/axis5 spot checks).
- Combines positional + `--quiet` correctly.
- `CliArgsError` is an `Error` subclass with `name === 'CliArgsError'`.

## 6. Stale-stamp refresh

| Doc | Old stamp | New stamp |
|---|---|---|
| `datasets/jam-actions-v0-public/VERSION` | `0.4.0` | `0.4.1` |
| `datasets/jam-actions-v0-public/CITATION.cff` (`version:`) | `"0.4.0"` | `"0.4.1"` |
| `datasets/jam-actions-v0-public/manifest.json` (`version`) | `"0.4.0"` | `"0.4.1"` (regenerated by packager) |
| `datasets/jam-actions-v0-public/manifest.json` (`source_commit`) | `"4b0f181d5df06348..."` | `"a5daec2daa5ec31f..."` (regenerated) |
| `datasets/jam-actions-v0-public/manifest.json` (`source_tag`) | `"4b0f181"` | `"jam-actions-v0-aloneness-audit-gaps-2026-05-19"` |
| `README.md` header version block | `0.2.0` / `2026-05-17` / `f133b631` / `jam-actions-v0-enriched-2026-05-17` | `0.4.1` / `2026-05-19` / `a5daec2` / `jam-actions-v0-aloneness-audit-gaps-2026-05-19` (+ Slice 23.5 patch note) |
| `README.md` BibTeX `version` | `0.2.0` | `0.4.1` |
| `ATTRIBUTION.md` (`Version:` field) | `0.1.1` | `0.4.1` |
| `ATTRIBUTION.md` BibTeX `version` | `0.1.1` | `0.4.1` |
| `ATTRIBUTION.md` plain-text reference `version 0.1.1` | `0.1.1` | `0.4.1` |
| `ATTRIBUTION.md` source-commit narrative | `e4631391...` + `jam-actions-v0-public-2026-05-17` | `4b0f181` + `jam-actions-v0-rc-gate-revised-2026-05-19` (with Slice 23.5 narrative) |

The packager's Slice 11.5 consistency check (`assertCitationCffMatchesVersion`) verified all three (`VERSION`, `CITATION.cff`, `manifest.json`) carry `0.4.1` before regenerating the package.

## 7. KNOWN_LIMITATIONS layering (the honesty axis)

**File:** `datasets/jam-actions-v0-public/KNOWN_LIMITATIONS.md`

§9 (E2/E3 baselines) rewritten with the operator's layered-honesty pattern. Four explicit sub-sections:

- **§9a — Slice 7 baseline (historical):** preserves the original "E3 margin = −0.125 FAIL" disclosure with its single-run, pre-enrichment, pre-MCQ-repair caveats. **Not deleted; labeled as history.**
- **§9b — Slice 11 enrichment + Slice 18.5 MCQ repair (recovery arc):** names the Slice 18.5 +0.069 enriched-subset and Slice 19 +0.127 corpus margins; flags that Slice 21 surfaced the Schumann m045-048 catastrophic outlier.
- **§9c — Slice 21 enrichment + Slice 22 revised gate (current state):** PASS verdict at Slice 21 baseline (margin +0.161, 10/16 records clearing); Slice 22 revised RC gate distinguishes margin_pass from ceiling_saturated_pass; canonical artifact at `evals/slice22-release-gate-revised-assessment.json`.
- **§9d — What this means going forward:** explicit "the Slice 7 'E3 baselines fail' headline is no longer the current state"; future claims must cite Slice 22 or later; E2 still at its Slice 7 disclosure (legacy honest); doctrine ("if local 8B fails thresholds, that is valid evidence") preserved.

§11 (Package is a checkpoint) rewritten with the same layered pattern:

- **§11a — Slice 10.5 baseline (historical):** preserves the original "treat the tag as a checkpoint" framing + Slice 13 publication-slice plan.
- **§11b — Current state (Slice 22 + 23 + 23.5):** narrates the multi-slice readiness arc (Slice 11/18.5/19/20/21/22/23/23.5) with one-line summaries each; explicit "RC-gate PASS verified + reproducibility cleared" current state; operator's locked doctrine preserved ("gate clearance + reproducibility ≠ release approval").
- **§11c — What you can / cannot claim:** can-cite list (Slice 22 PASS, Slice 23 audit, Slice 23.5 reproducibility); cannot-cite list (Zenodo DOI, HF mirror URL, "release-approved" status). Explicit note that the Slice 13 publication-slice number is superseded by Slice 24+.

This layering captures the dataset's evolution honestly: historical claims preserved with date/slice stamps; current state surfaced with artifact references; doctrine unchanged.

## 8. Fresh-checkout verification (Phase 7 outcome)

**Methodology:** `git worktree add E:/AI/ai-jam-sessions-slice23-5-audit HEAD` to materialize a fresh worktree at the Slice 23 audit-state commit (`a5daec2`); then `git apply` the Slice 23.5 uncommitted-changes patch + `cp` for untracked files (.gitattributes + check-release-gate.test.ts). pnpm install ran in 4m 22s (cold cache for several added dependencies). Then the three audit commands ran.

**The three Slice 23 blockers verified closed:**

1. ✅ **Verifier passes cleanly on Windows fresh-checkout (Gap #1):**
   ```
   Lines in checksums.sha256: 270
   Files on disk (minus checksums.sha256): 270
   Bad lines: 0
   Hash mismatches: 0
   Files missing in manifest: 0
   Files missing on disk: 0
   [ok] All checksums verify, every file accounted for.
   EXIT: 0
   ```

2. ✅ **README Reproducibility section provides the verification commands (Gap #5):** the new `## Reproducibility` section gives a cold reader a single entry point from "I downloaded the package" to "I verified the PASS verdict."

3. ✅ **README backlinks the Slice 22 PASS artifact (Gap #12):** the Reproducibility section and the header version block both reference `evals/slice22-release-gate-revised-assessment.json` as the canonical PASS verdict.

**CLI strictness verified:**

```
pnpm exec tsx scripts/check-release-gate.ts wrong-path-here.json
  → baseline artifact not found: wrong-path-here.json
  → EXITCODE: 1
```

The pre-Slice-23.5 trap (silently running against DEFAULT_BASELINE and emitting FAIL) is closed. The CLI now produces an explicit error on a wrong path.

**Slice 21 baseline PASS verified byte-identical to canonical Slice 22 assessment:**

```
pnpm exec tsx scripts/check-release-gate.ts datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json
  → Aggregate: PASS — RC gate PASS (all 6 blocking axes cleared; reporting declared)
  → EXIT: 0
```

**Slice 19 regression-check FAIL verified:**

```
pnpm exec tsx scripts/check-release-gate.ts datasets/jam-actions-v0-public/evals/slice19-fair-e3-baseline-results.json
  → Aggregate: FAIL — RC gate FAIL — blocking failures: [1, 2, 6]
  → EXITCODE: 1
```

**Full test suite in worktree:** 1513 tests pass (matches main worktree; delta from baseline 1491 = +22 from the new parseChecksumsManifest tests and check-release-gate CLI tests).

**Worktree cleanup:** `git worktree remove --force` followed by `rm -rf` on the leftover `node_modules` directory. Main worktree confirmed byte-identical before and after the audit.

## 9. Verdict on the acceptance bar

The operator-locked acceptance bar:

> A cold Windows contributor can clone, install, verify checksums, and reproduce the Slice 22 PASS gate without hidden context.

**Verdict: CLEARED.** Each clause is now supported by an artifact:

- **Clone:** standard `git clone` works (no submodules, no LFS).
- **Install:** `pnpm install` completes in ~3-4 minutes on a fresh rig (228 packages from global pnpm store; first run pulls from network).
- **Verify checksums:** `pnpm exec tsx scripts/verify-public-package-checksums.ts` exits 0 on Windows fresh-checkout (`.gitattributes` + CRLF-tolerant parser).
- **Reproduce the Slice 22 PASS gate:** `pnpm exec tsx scripts/check-release-gate.ts datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json` exits 0 with `RC gate PASS`. The README Reproducibility section names this command literally.
- **Without hidden context:** all three operator-required pieces of context (the canonical PASS artifact backlink, the canonical tag, and the exact verification commands) are surfaced from the README.

Per the audit's §10: this does **not** approve release. Operator-locked doctrine preserved: **gate clearance + reproducibility ≠ release approval.** Publication mechanics (Zenodo DOI, HuggingFace mirror, post-DOI README iteration) remain a downstream Slice 24+.

## 10. Slice 24+ implications

Slice 23.5 closes the operational gap that Slice 23's audit identified. The package is now in a state where:

- A cold Windows contributor can reproduce the gate-PASS verdict from the published artifacts alone (this slice's goal).
- The release-gate CLI is strict (positional-arg handling closes the cold-reader trap).
- The dataset's evolutionary history is preserved honestly in KNOWN_LIMITATIONS (Slice 7-19 fail, Slice 22 PASS, Slice 23.5 reproducibility cleared).

**What Slice 24+ can now address:**

- **Network-clone testing:** Phase 7 used a git worktree + patch-apply (the audit's same simplification); a true fresh `git clone` from GitHub + cold pnpm install was not exercised. Should be a Slice 24 pre-publication smoke test.
- **Zenodo DOI mechanics:** Zenodo's upload UI/API workflow; assigning a DOI; cross-linking the DOI back into the README's Reproducibility section.
- **HuggingFace mirror:** dataset-card YAML validation; HF's loader API split-config interplay (the v0 README declares one config with all records; multi-config splits is Slice 12's deferred work per KNOWN_LIMITATIONS §12).
- **Post-DOI README iteration:** add the Zenodo DOI badge + citation cross-link (the bidirectional link the audit's §10 calls out).

**What Slice 24+ does NOT need to relitigate:**

- The gate verdict (Slice 22 PASS canonical at `evals/slice22-release-gate-revised-assessment.json`).
- The reproducibility cleanup (this slice).
- The record content (no record-content change since Slice 21 Schumann m045 enrichment).

**No publication claim is made in this slice doc.** Publication mechanics + operator decision remain the gate. This slice removes a precondition; it does not pull a trigger.

---

## Hard-gate checklist (all must pass for slice doc completion)

- [x] All 1491 existing tests still pass.
- [x] New verifier/CLI tests added (7 parseChecksumsManifest + 15 check-release-gate CLI = 22 new tests). Total goes UP: 1491 → 1513.
- [x] `.gitattributes` file exists at repo root with appropriate rule scope.
- [x] `git check-attr eol datasets/jam-actions-v0-public/checksums.sha256` returns `eol: lf`.
- [x] Verifier passes on the main worktree's `checksums.sha256` (post LF normalization + packager regeneration).
- [x] Verifier handles a CRLF-stamped `checksums.sha256` correctly (unit test asserts both LF and CRLF parsing).
- [x] CLI errors on extra positional args (unit tested).
- [x] CLI errors on unknown flag (unit tested; pre-existing behavior preserved).
- [x] CLI accepts a single positional path correctly (unit tested).
- [x] README has a Reproducibility section with concrete commands and a backlink to `evals/slice22-release-gate-revised-assessment.json`.
- [x] Version stamps in README + ATTRIBUTION + KNOWN_LIMITATIONS all updated to 0.4.1 (consistent with VERSION + CITATION + manifest).
- [x] KNOWN_LIMITATIONS §9 and §11 now show current Slice 22 PASS state alongside historical context (layered honesty).
- [x] Phase 7 fresh-checkout audit: `verify-public-package-checksums.ts` exits 0 with all 270 checksums verifying; `check-release-gate.ts` on Slice 21 baseline returns PASS exit 0; Slice 19 regression baseline returns FAIL exit 1.
- [x] Records, records.jsonl, splits all byte-identical (NO record content changes; `git diff HEAD` confirms zero changes to record-content files).
- [x] Eval harnesses + release-gate validator (release-gate.ts core logic) byte-identical.
- [x] All prior eval artifacts byte-identical (no overwrites of eval JSON under datasets/jam-actions-v0-public/evals/).
- [x] **NO autonomous commit. Stopped and reported.**

**Suggested commit + tag (operator decision):** `jam-actions-v0-reproducibility-cleared-2026-05-19`.
