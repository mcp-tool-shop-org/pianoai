# Handoff 43 — Grok Build to Claude: Zenodo workflow takes dataset_dir; v1 draft-only stopped before Zenodo

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 42.** Branch `live-environment-42-zenodo-dir` @ `5ce0767` (main is still `2df54fd`).
Workflow-only commit, not merged. I did **not** run the suite. Did not touch `datasets/**` or
`docs/hf-cards/**`. **No DOI. No HF push. No Zenodo call.** Draft-only was the ceiling.

---

## 1. Workflow diff summary

Same file: `.github/workflows/publish-jam-actions-v0.yml`. No new workflow. Concurrency group
still `publish-jam-actions-v0`. `actionlint` 1.7.12 clean; GitHub accepted the file (the run
below started from it). Header Inputs table matches the five `workflow_dispatch` inputs.

**Z1.** New input `dataset_dir`, default `datasets/jam-actions-v0-public`. Validated to
`^datasets/[A-Za-z0-9._-]+$` and to exist with `VERSION`, `checksums.sha256`, and
`zenodo-metadata.json`. Derived from it:

| derived | from |
|---|---|
| `VER` | `$DIR/VERSION` |
| `PKG` | `basename $DIR` |
| archives | `artifacts/${PKG}-${VER}.tar.gz` and `.zip` |
| artifact | `${PKG}-${VER}-archives` |
| metadata | `$DIR/zenodo-metadata.json` |

**Z2.** The two v0-only receipt steps run only when their files apply; when they do not, the
job prints the skip by name:

- Slice-21: v0 still restores `evals/slice21-fair-e3-baseline-results.json` from
  `jam-actions-v0-feature-marketed-2026-05-19` and runs `check-release-gate.ts`. Any other
  `dataset_dir` runs that validator only if the file is in the package; otherwise
  `Skipping Verify release gate (sealed Slice-21 baseline from git history): …`.
- Execution-verification: runs if `$DIR/evals/v${VER}-execution-verification.json` exists.
  v0 still errors if that file is missing (the 0.5.1 / `v0.5.0-…` mismatch is unchanged).
  Any other dir prints
  `Skipping Verify execution-verification receipt (cut-time standing gate): …`.

Checksums: v0 still `pnpm exec tsx scripts/verify-public-package-checksums.ts`. Other dirs
`sha256sum -c checksums.sha256`.

**Z3.** v0 default dispatch is the same path: same defaults (`mode=draft-only`,
`confirm_irreversible=no`, `zenodo_newversion_of=20279919`, `ref=main`,
`dataset_dir=datasets/jam-actions-v0-public`), same TS verifier, same git-history Slice-21,
same fail-if-missing execution-verification, same archive and artifact names
(`jam-actions-v0-public-${VER}.tar.gz` / `.zip` /
`jam-actions-v0-public-${VER}-archives`), same Zenodo DRAFT on draft-only, same DOI gate
(`yes-mint-doi`). Inline HF remains the v0 repo and folder; the `if` now also requires
`dataset_dir` to be the v0 package so a later v1 `mode=publish` cannot push v0 by accident.
v1 HF stays on `push-jam-actions-v0-hf.yml`.

Additive on v0, not a behaviour change of the Zenodo/DOI path: the stripped metadata payload
is also uploaded as a workflow artifact, and the receipt prints `Dataset dir`.

**Z4.** `mode=draft-only` + non-v0 `dataset_dir` sets `skip_zenodo=true`. Create-deposit,
bucket upload, metadata PUT, and publish are all `if:`-skipped. No `ZEN_TOKEN` is read.

---

## 2. v1 draft-only run

Dispatched from `live-environment-42-zenodo-dir` (the new YAML) against that ref's tree.

- **URL:** https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/runs/34349856053
- **conclusion:** success (23 s)
- **inputs:** `mode=draft-only`, `dataset_dir=datasets/jam-actions-v1-public`,
  `confirm_irreversible=no`, `ref=live-environment-42-zenodo-dir`

Resolve printed `Version: 1.0.0` and `No Zenodo call. No token used.` Checksums verified
via `sha256sum -c`. The two v0 receipts skipped by name:

```
Skipping Verify release gate (sealed Slice-21 baseline from git history): evals/slice21-fair-e3-baseline-results.json is not present under datasets/jam-actions-v1-public
Skipping Verify execution-verification receipt (cut-time standing gate): datasets/jam-actions-v1-public/evals/v1.0.0-execution-verification.json is not present under datasets/jam-actions-v1-public
```

Zenodo steps (create deposit, upload to bucket, set metadata, publish / mint DOI) and the
HF steps: **skipped**. Receipt line: `Zenodo: skipped (draft-only, no Zenodo call)`.

### Artifacts

| name | size | id | contains |
|---|---|---|---|
| `jam-actions-v1-public-1.0.0-archives` | 872,137 B | 10103222183 | `jam-actions-v1-public-1.0.0.tar.gz` (315,047 B, sha256 `d88f71d93166671a4333e11042eb59bd3cade4cfe085d85723a19670a2ab60a0`) and `jam-actions-v1-public-1.0.0.zip` (595,847 B, sha256 `678fbf7b5f365831779c57f9e8aec2f13757ec47d998a370ab6ef47018f15425`) |
| `jam-actions-v1-public-1.0.0-zenodo-metadata-payload` | 1,127 B | 10103223106 | `zenodo-metadata-payload.json` (`$schema_note` stripped; `{metadata:…}` envelope kept) |

Archive artifact: https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/runs/34349856053/artifacts/10103222183
Metadata artifact: https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/runs/34349856053/artifacts/10103223106

---

## 3. v0 default path unchanged

Defaults still name `datasets/jam-actions-v0-public`. A default dispatch still creates a
Zenodo DRAFT of that package. I did not dispatch v0. I did not merge the branch.

---

**Yours:** J23 workflow validation and the draft-only run reviewed. Merge is yours.
Zenodo publish of jam-actions-v1 1.0.0 stays Director's `yes-mint-doi`.
