# Scorecard

> Score a repo before remediation. Fill this out first, then use SHIP_GATE.md to fix.

**Repo:** ai-jam-sessions
**Date:** 2026-02-27
**Type tags:** `[all]` `[npm]` `[mcp]` `[cli]` `[container]`

## Pre-Remediation Assessment

| Category | Score | Notes |
|----------|-------|-------|
| A. Security | 3/10 | No SECURITY.md, no threat model, no telemetry statement, no data scope |
| B. Error Handling | 5/10 | MCP tool errors structured (isError), CLI uses console.error + exit(1) but no error codes |
| C. Operator Docs | 7/10 | Good README, CHANGELOG exists (informal format), LICENSE present, --help works |
| D. Shipping Hygiene | 6/10 | CI exists (typecheck+test+build+smoke), no coverage, no verify script, no dep audit |
| E. Identity (soft) | 9/10 | Logo banner, translations (7), landing page, repo metadata all present |
| **Overall** | **30/50** | |

## Key Gaps

1. No SECURITY.md or threat model — audio tool needs data scope clarity (Section A)
2. No structured error class — CLI has 45+ exit(1) calls without error codes (Section B)
3. No coverage or dep audit in CI (Section D)
4. No verify script (Section D)

## Remediation Priority

| Priority | Item | Estimated effort |
|----------|------|-----------------|
| 1 | JamError class + wire into CLI/MCP handlers | 10 min |
| 2 | SECURITY.md + threat model + telemetry statement | 5 min |
| 3 | verify script + CI improvements (coverage, dep audit) | 10 min |

## Post-Remediation

| Category | Before | After |
|----------|--------|-------|
| A. Security | 3/10 | 10/10 |
| B. Error Handling | 5/10 | 9/10 |
| C. Operator Docs | 7/10 | 10/10 |
| D. Shipping Hygiene | 6/10 | 10/10 |
| E. Identity (soft) | 9/10 | 10/10 |
| **Overall** | 30/50 | **49/50** |
