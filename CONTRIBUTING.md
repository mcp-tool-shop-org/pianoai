# Contributing to AI Jam Sessions

This doc covers the local-vs-CI divergences you're most likely to hit, plus
the commands that keep a push from surprising you in GitHub Actions. It's
short on purpose — see `README.md` for what the project does, `SHIP_GATE.md`
and `SCORECARD.md` for product-standards tracking, and `SECURITY.md` for the
data-handling posture.

## Setup

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions
pnpm install
```

Requires Node >=20 (`package.json`'s `engines` field; CI's matrix covers 20
and 22; the Docker image ships on `node:22-slim`).

## Three things that differ between your machine and CI

**1. Audio hardware.** The engine layer (`audio-engine.ts`, `guitar-engine.ts`,
`sample-engine.ts`, `vocal-engine.ts`, `vocal-tract-engine.ts`) constructs a
real `node-web-audio-api` `AudioContext` — there's no mock audio backend in
this codebase. `src/mcp-server.test.ts` deliberately exercises this: it spawns
the real MCP server and drives `play_song` over stdio. Input validation (e.g.
the measure-range bounds check) runs *before* the audio `.connect()` on
purpose, so it stays reachable even where no audio device exists — that
ordering is load-bearing, not incidental (CI once went red because the check
sat behind the connect). You'll still see ALSA "cannot find card 0" warnings
in the test output on a headless runner; that's expected — the tests assert on
validation outcomes, not on sound actually coming out. If you're adding a test
that touches one of the engine files, don't assume you need a physical audio
device to reach the logic you're testing — put the logic ahead of the connect
and you won't. What you genuinely can't verify headlessly is actual sound output.

**2. pnpm version.** CI hard-pins **pnpm 9** in every workflow
(`pnpm/action-setup@... version: 9`). Your local pnpm is probably newer — this
matters because pnpm's build-script-approval and override mechanisms changed
across major versions. `pnpm-workspace.yaml` carries both the old
(`onlyBuiltDependencies`) and new (`allowBuilds`) approval keys, and its own
`overrides` block duplicates `package.json`'s `pnpm.overrides` — pnpm 9 reads
the `package.json` field, pnpm 10/11 don't (confirmed directly: pnpm 11
prints `[WARN] The "pnpm" field in package.json is no longer read by pnpm`
and reads the workspace file instead). Both are kept in sync deliberately; if
you touch one, update the other. `ci.yml`'s `pnpm10-install` job exists
specifically to catch a pnpm-10 regression before it becomes a pnpm-9 problem
nobody noticed. If `pnpm install` behaves differently locally than in a CI
log, check `pnpm --version` first.

**3. Coverage floor.** `pnpm test:coverage` enforces a local coverage floor
(`vitest.config.ts`, `coverage.thresholds`) independent of the Codecov upload
in `ci.yml` (which is currently non-blocking — see the comment on that step).
`pnpm test` does not run coverage and won't catch a threshold miss; only
`pnpm test:coverage` will, and only the Node 22 leg of CI runs it. If you're
adding a large new module, run `pnpm test:coverage` locally before pushing so
a coverage regression doesn't surprise you in CI. The current floor is
intentionally conservative (see the comment block at the top of
`vitest.config.ts` for the reasoning and how to raise it later).

## `scripts/` typecheck is opt-in, not yet enforced

`scripts/tsconfig.json` + `pnpm typecheck:scripts` give the `scripts/`
directory (dataset-building and release-gate tooling) the same `tsc --noEmit`
safety net `src/` has via `pnpm typecheck`. It is **not** currently chained
into `pnpm typecheck` or CI — running it today surfaces pre-existing type
errors in a handful of dataset scripts that predate this config. Run it
directly if you're touching anything under `scripts/`:

```bash
pnpm typecheck:scripts
```

## Reproducibility / release-gate scripts

The `jam-actions-v0` public dataset ships its own verification tooling,
independent of the npm package's tests:

```bash
pnpm exec tsx scripts/verify-public-package-checksums.ts        # recomputes SHA-256 for every packaged file
pnpm exec tsx scripts/check-release-gate.ts \
  datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json  # 7-axis release gate; exit 0 = PASS
```

Both are pre-flight gates in `publish-jam-actions-v0.yml` — they run before
anything is built or published. If you touch `datasets/jam-actions-v0-public/`
or the release-gate axes in `src/dataset/release/`, run these before opening a
PR. `.gitattributes` pins LF line endings for `*.sha256` and the
dataset-package tree specifically so the checksum verifier agrees with itself
on a Windows clone — see the comment block at the top of `.gitattributes`
before touching those rules.

## Before you push

- [ ] `pnpm verify` is green (`typecheck` → `test` → `build` → `smoke`, the
      same steps CI runs; CI additionally runs `test:coverage`, but only on
      its Node 22 leg)
- [ ] If you touched `datasets/jam-actions-v0-public/` or release-gate logic,
      ran the two reproducibility commands above
- [ ] After pushing: `gh run watch` (or check the Actions tab) — don't assume
      green because it was green locally; see the three divergences above
