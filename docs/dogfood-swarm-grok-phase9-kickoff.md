# Executor Kickoff (Grok Build): Phase 9 — the final test

> **PASTE TARGET: the Grok Build executor session.** Authored 2026-08-20 by the Advisor.
> The health pass (Stages A–D) and the feature pass (sound + the Composition Panel) are
> closed and merged — PRs #26–#34, juries #73–#85 all corroborate, main at `c23f53d`.
> Phase 9 asks one question before Phase 10 ships this thing: **does the product work,
> end to end, the way a stranger would actually use it — from the artifacts we ship, not
> from the dev tree's test suite.**
>
> **This wave is TEST-AND-REPORT ONLY.** You run journeys and file a PASS/FAIL matrix
> with evidence. No product changes, no branch, no PR. If the matrix has fails, the fix
> wave gets its own kickoff against your ledger — a final test that fixes as it goes
> masks what the state actually was.
>
> **Division of labor:** you own everything a Node process can prove — the packed
> tarball, the stdio MCP surface, the CLI, the frozen-baseline proofs, file-level
> integrity. The Advisor owns the browser (the DEPLOYED GitHub Pages cockpit end to
> end) and every public-surface truth check (README counts, translations, handbook) —
> file drift you notice there as `advisor_surface` leads, not work items.
>
> **The one destructive-looking step, fenced:** journey E regenerates the Gate-2
> snapshot via the official script to PROVE nothing musical drifted. Regenerate, diff
> (expect byte-identical), then `git checkout --` the file so the tree ends pristine.
> `git status` clean at the end is itself a matrix row.
>
> **Standards compliance (0–3):** PIN_PER_STEP **3** (every matrix row = journey/step/
> expect/got/evidence; the pack is hashed; the snapshot proof is a byte diff) ·
> ANDON_AUTHORITY **2** (a journey this brief doesn't cover → flag, don't improvise;
> anything that would mutate state beyond journey E → stop) · NAMED_COMPENSATORS **3**
> (report-only; journey E's compensator is the named git-restore, verified by the
> clean-tree row) · DECOMPOSE_BY_SECRETS **2** (journeys grouped by surface: pack /
> docs / MCP / CLI / baselines / integrity) · UNCERTAINTY_GATED_HUMANS **3** (browser
> and public surfaces routed to the Advisor; PASS/FAIL is evidence, the ship decision
> is the Director's at Phase 10) · EXTERNAL_VERIFIER **3** (advisor re-runs sampled
> journeys + the deployed-cockpit E2E; non-Claude jury; the deterministic floor is law).

*Everything below the line is the paste block.*

---

# Phase 9: prove the shipped artifacts work — a stranger's journeys, a PASS/FAIL matrix, evidence per row.

## Who you are

**Grok Build, the Executor** — test seat. Work from `main` at `c23f53d` or later. Run
journeys, record evidence, change nothing (journey E restores what it touches). Your
report is the gate Phase 10 stands on.

## The journeys (group the matrix by these)

**A. Cold start from the tarball (the artifact a stranger gets).**
`npm pack` → sha256 the tarball → install it into a fresh temp dir (no workspace
links) → start the server on stdio with a minimal MCP client handshake (initialize →
tools/list → prompts/list). Rows: pack succeeds; tarball contains NO `samples/**`, no
swarm/docs junk (list what it DOES contain against package.json `files`); install
succeeds on this Node; the server boots; the ACTUAL tool and prompt counts (report the
numbers — the Advisor checks them against the README's claims); one representative
tool call round-trips. Clean up the temp dir.

**B. The documented quickstarts, literally.**
Execute the README quickstart and the beginners doc's first session AS WRITTEN — every
command verbatim, from the temp install where the doc implies an installed package.
A step that needs any knowledge the doc doesn't give = a FAIL row quoting the gap.

**C. The MCP tool surface over real stdio (not the vitest suite).**
A representative matrix through JSON-RPC: `list_songs` → `get_song` on a returned id →
a teaching flow call → `analyze_harmony` on a library song → `verify_harmony` →
`auto_reharmonize` (confirm the ABC default yields non-empty output) → `voice_chord` →
one `compose_panel` run scoped small (one song, the default judges — record runtime).
Per family, one MALFORMED-input probe: the error must come back structured
(code/message/hint per the shipcheck error gate), never a raw stack. Rows: each call's
expect/got, error-shape verdicts, and any tool whose description promises something
the call doesn't deliver.

**D. The CLI.**
`--help` accuracy (every documented flag exists; no undocumented load-bearing flag),
plus the documented play/practice journey in whatever non-interactive form it supports.
Exit codes: success 0, a provoked failure non-zero with a structured message.

**E. Frozen-baseline proof (the compensated step).**
Run the official Gate-2 snapshot regeneration script; diff against the committed
snapshot — expect **120/120 lines byte-identical** (nothing musical has changed since
the Mutopia swap's 118/120). Then restore the file (`git checkout --`) and record
`git status` clean as its own row. Also: the E-R gate's `TRAINING_SONG_IDS` exclusion
list untouched since `c23f53d` (a git log check, not a rerun).

**F. Integrity + provenance.**
The Salamander manifest's per-file map vs the files on disk (count + spot sha256);
the license line present in the manifest; `pnpm verify` one final time on clean main
(record the exact counts); the repo's `git status` clean before AND after your whole
session (the report and temp dirs live outside the repo).

## Not yours (the Advisor's lane, already in motion)

The deployed GitHub Pages cockpit end to end in a real browser (boot, roll, sampler
over Pages, both Panel sub-modes, persistence); README/translation/handbook truth
against your measured counts; landing/handbook art. File anything you notice there
under `advisor_surface`.

## Fences (hard)

No commits, no branch, no PR, no version bump, **no publish — `npm pack` only, never
`npm publish`**. No file changes outside temp dirs except journey E's regenerate-and-
restore. No network beyond localhost Ollama (the tarball and everything you test is
local). Frozen musical baselines are proven, not edited. If a journey needs something
this brief doesn't grant → andon, don't improvise.

## Output

`E:\AI\testing-os\swarms\swarm-1787126957-4c3c\phase-9\report.json`:

```json
{
  "domain": "final-test",
  "summary": "...",
  "matrix": [
    { "journey": "A", "step": "tarball contents", "expect": "...", "got": "...", "pass": true, "evidence": "..." }
  ],
  "fails": [ { "id": "P9-001", "severity": "HIGH|MED|LOW", "journey": "B", "description": "...", "evidence": "..." } ],
  "measured": { "tools": 0, "prompts": 0, "tarball_sha256": "...", "tarball_kb": 0, "verify": "...", "compose_panel_runtime_s": 0 },
  "advisor_surface": [],
  "skipped": ["..."]
}
```

Honest `skipped[]` beats padded rows. A PASS matrix with real evidence is a
legitimate, expected outcome — do not manufacture fails to look thorough. Close with
what surprised you. Andon anything ambiguous rather than improvising a journey.
