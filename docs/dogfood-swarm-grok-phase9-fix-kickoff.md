# Executor Kickoff (Grok Build): Phase-9 Fix — close the final-test ledger before Phase 10

> **PASTE TARGET: the Grok Build executor session.** Authored 2026-08-20 by the Advisor.
> Phase 9's stranger-test PASSED on its spine (the packed 2.1.0 works end to end on
> Node 22; zero musical drift, 12982/12982 labels) and filed 7 non-musical fails. The
> Advisor source-confirmed the load-bearing ones and calibrated the ledger; the jury
> corroborated the wave. This wave executes the ledger so Phase 10's shipcheck meets
> gates B (errors) and D (packaging) already green.
>
> **Advisor calibrations that bind:** P9-001 is NOT protocol surgery — the SDK's -32602
> is JSON-RPC-correct for invalid params; the fix is descriptive validation messages
> riding inside it. P9-007 closes via .gitignore. One item joins from the report's own
> summary: package.json's description still says 47 tools against the measured 49.
>
> **A lesson against MY brief, recorded:** Phase 9's kickoff used example tool names I
> did not verify (get_song / analyze_harmony / voice_chord); the real surface differs
> and the executor filed the miss against the brief, correctly. Every example in THIS
> kickoff was checked against the live surface; the Advisor re-verifies examples in
> review from here on.
>
> **Standards compliance (0–3):** PIN_PER_STEP **2** (fixes keyed by P9-id; the tarball
> curation gets a regression test pinning the exclusion) · ANDON_AUTHORITY **2** (any
> fix that would change a tool's success-path contract → stop and flag) ·
> NAMED_COMPENSATORS **2** (branch `swarm/phase9-fix`; merge-commit revert-per-finding;
> nothing irreversible — no publish, no version bump) · DECOMPOSE_BY_SECRETS **2**
> (commits: errors / packaging / CLI / metadata) · UNCERTAINTY_GATED_HUMANS **2** (the
> public-docs whitelist and all string changes reviewed by the Advisor; the ship call
> stays the Director's) · EXTERNAL_VERIFIER **3** (advisor re-runs the failed journeys
> from a fresh pack + jury; `pnpm verify` is law).

*Everything below the line is the paste block.*

---

# Phase-9 fix: level the error shapes, curate the tarball, keep long tools alive, polish the CLI — nothing else moves.

## Who you are

**Grok Build, the Executor** — branch **`swarm/phase9-fix`** from `main` at `a7a5ddc`
or later, commit per group, PR, `pnpm verify` green. Fix ids from
`phase-9/report.json` as calibrated above.

## The work (commit per group)

**Errors (P9-001, P9-002).**
- P9-001: a pass over the MCP tool zod schemas adding descriptive messages where a
  bare type would yield an unhelpful -32602 — field names, expected shapes, one
  example value where it helps (`songId: z.string().describe("a library song id — try
  list_songs")` style). Do not loosen any schema; do not intercept the protocol layer.
- P9-002: verify_harmony's bad-JSON/parse failures return the same structured
  `{code, message, hint}` envelope compose_panel and auto_reharmonize already use.
  A test pins the envelope on a malformed input.

**Packaging (P9-003) — the tarball ships user docs, not the swarm's paper trail.**
- Add `.npmignore` entries (files[] keeps `docs`) excluding the internal set:
  `docs/dogfood-swarm-*.md`, `docs/*-kickoff.md`, `docs/*dispatch*.md`,
  `docs/dogfood-swarm-study-grounding.md`, `docs/compose-panel-app-design-prompt.md`,
  the `docs/assets/` Pages art, and `docs/.nojekyll`. Ship what a user reads:
  beginners/usage/troubleshooting/attribution/provenance-note and their kin — propose
  the final whitelist in the report; the Advisor reviews the resulting listing.
- A regression test (in `src/`, the tsconfig trap) runs `npm pack --dry-run --json`
  and asserts no `dogfood-swarm` path ships. Record the new tarball size.

**Long tool calls (P9-004).**
- compose_panel emits MCP progress notifications while it runs (per judge × song step,
  via the request's progress token when the client provides one) so a default client's
  timeout resets instead of firing -32001 at 60s. The tool description gains one
  honest sentence: it runs minutes and reports progress. Unit-test the progress
  callback wiring where it is pure; the Advisor live-verifies over real stdio.

**CLI (P9-005, P9-006).**
- `--help` lists `library` with the same one-liner the docs use.
- Provoked failures print `JamError [CODE]: message` + a `Hint:` line and keep their
  non-zero exits — the same error grammar the MCP envelope uses. Pin one case per
  failure family in the CLI tests.

**Metadata + hygiene (the description drift, P9-007).**
- package.json `description`: 47 → the measured 49 tools (wording otherwise
  unchanged; the Advisor reviews the string).
- `.gitignore` gains `.claude/` and `tmp/`.

## Fences (hard)

No behavior changes to any tool's SUCCESS path — this wave touches error shapes,
packaging, progress plumbing, CLI text, and metadata only. Frozen musical baselines
untouched. No README*/CHANGELOG/docs-content/site/ROADMAP edits (the .npmignore
exclusions are packaging, not content; Phase 10 owns public prose). No version bump,
no publish, no tags, no pushes to `main`, no new workflows. Node-dependent tests in
`src/`. Every changed user-facing string (CLI errors, the description, zod messages)
meets the what-happened + what-to-do bar — the Advisor reviews each.

## Acceptance (in order)

1. `pnpm verify` green; PR checks green.
2. Advisor re-runs the failed journeys from a FRESH pack: malformed inputs return
   descriptive -32602 / the envelope; the tarball listing is clean of swarm docs with
   the user whitelist intact; compose_panel streams progress over real stdio past 60s;
   `--help` shows library; a provoked CLI failure shows the JamError grammar; the
   description reads 49.
3. The Director's word on the merge.

## Output

`E:\AI\testing-os\swarms\swarm-1787126957-4c3c\phase-9-fix\report.json` —
`{domain, summary, fixes:[{finding_id:"P9-00N", file, description}], files_changed, skipped}` —
receipts: the proposed docs whitelist + the new tarball listing/size, one before/after
error-shape sample per fix, the progress-notification wiring note. Close with what
surprised you and the PR link. Andon anything that would touch a success-path
contract.
