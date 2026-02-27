# Ship Gate

> No repo is "done" until every applicable line is checked.
> Copy this into your repo root. Check items off per-release.

**Tags:** `[all]` every repo · `[npm]` `[pypi]` `[vsix]` `[desktop]` `[container]` published artifacts · `[mcp]` MCP servers · `[cli]` CLI tools

---

## A. Security Baseline

- [x] `[all]` SECURITY.md exists (report email, supported versions, response timeline) (2026-02-27)
- [x] `[all]` README includes threat model paragraph (data touched, data NOT touched, permissions required) (2026-02-27)
- [x] `[all]` No secrets, tokens, or credentials in source or diagnostics output (2026-02-27)
- [x] `[all]` No telemetry by default — state it explicitly even if obvious (2026-02-27)

### Default safety posture

- [x] `[cli|mcp|desktop]` Dangerous actions (kill, delete, restart) require explicit `--allow-*` flag (2026-02-27) — no destructive actions; writes only to ~/.ai-jam-sessions/
- [x] `[cli|mcp|desktop]` File operations constrained to known directories (2026-02-27) — user songs dir + library dir only
- [x] `[mcp]` Network egress off by default (2026-02-27) — stdio transport only, no HTTP listener
- [x] `[mcp]` Stack traces never exposed — structured error results only (2026-02-27)

## B. Error Handling

- [x] `[all]` Errors follow the Structured Error Shape: `code`, `message`, `hint`, `cause?`, `retryable?` (2026-02-27)
- [x] `[cli]` Exit codes: 0 ok · 1 user error · 2 runtime error · 3 partial success (2026-02-27)
- [x] `[cli]` No raw stack traces without `--debug` (2026-02-27)
- [x] `[mcp]` Tool errors return structured results — server never crashes on bad input (2026-02-27) — 22 isError returns
- [x] `[mcp]` State/config corruption degrades gracefully (stale data over crash) (2026-02-27) — fallback defaults for missing configs
- [ ] `[desktop]` SKIP: not a desktop app
- [ ] `[vscode]` SKIP: not a VS Code extension

## C. Operator Docs

- [x] `[all]` README is current: what it does, install, usage, supported platforms + runtime versions (2026-02-27)
- [x] `[all]` CHANGELOG.md (Keep a Changelog format) (2026-02-27)
- [x] `[all]` LICENSE file present and repo states support status (2026-02-27)
- [x] `[cli]` `--help` output accurate for all commands and flags (2026-02-27)
- [x] `[cli|mcp|desktop]` Logging levels defined: silent / normal / verbose / debug — secrets redacted at all levels (2026-02-27)
- [x] `[mcp]` All tools documented with description + parameters (2026-02-27) — 31 MCP tools with descriptions
- [ ] `[complex]` SKIP: not complex enough for ops handbook

## D. Shipping Hygiene

- [x] `[all]` `verify` script exists (test + build + smoke in one command) (2026-02-27)
- [x] `[all]` Version in manifest matches git tag (2026-02-27) — package.json version = "1.0.0"
- [x] `[all]` Dependency scanning runs in CI (ecosystem-appropriate) (2026-02-27) — pnpm audit in CI
- [x] `[all]` Automated dependency update mechanism exists (2026-02-27) — GitHub Dependabot
- [x] `[npm]` `npm pack --dry-run` includes: dist/, README.md, CHANGELOG.md, LICENSE (2026-02-27)
- [x] `[npm]` `engines.node` set (2026-02-27) — ">=18.0.0"
- [x] `[npm]` Lockfile committed (2026-02-27) — pnpm-lock.yaml
- [ ] `[vsix]` SKIP: not a VS Code extension
- [ ] `[desktop]` SKIP: not a desktop app

## E. Identity (soft gate — does not block ship)

- [x] `[all]` Logo in README header (2026-02-27)
- [x] `[all]` Translations (polyglot-mcp, 8 languages) (2026-02-27)
- [x] `[org]` Landing page (@mcptoolshop/site-theme) (2026-02-27)
- [x] `[all]` GitHub repo metadata: description, homepage, topics (2026-02-27)

---

## Gate Rules

**Hard gate (A–D):** Must pass before any version is tagged or published.
If a section doesn't apply, mark `SKIP:` with justification — don't leave it unchecked.

**Soft gate (E):** Should be done. Product ships without it, but isn't "whole."

**Checking off:**
```
- [x] `[all]` SECURITY.md exists (2026-02-27)
```

**Skipping:**
```
- [ ] `[pypi]` SKIP: not a Python project
```
