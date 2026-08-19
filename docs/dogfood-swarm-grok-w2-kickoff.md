# Dogfood Swarm — Wave 2 Executor Kickoff (Grok Build): Health Stage-A Amend

> **PASTE TARGET: the Grok Build executor session.** Authored 2026-08-19 by the Advisor after
> the Wave-1 close-out: collect 7/7 accepted · advisor re-read 16/33 findings at source with
> zero discrepancies · deterministic floor PASS (verify receipt 102: lint, typecheck, 2912
> tests, build) · non-Claude jury adjudication recorded on the wave (see the run's
> `adjudications/` receipt) · 31 findings approved, 2 deferred to Director. Run
> `swarm-1787126957-4c3c` · save point `swarm-save-1787126957`.
>
> **Standards compliance (0–3):** PIN_PER_STEP **2** (amend contract pinned per finding id;
> wave-2 domain snapshot frozen at dispatch; output schema collect-gated) · ANDON_AUTHORITY
> **2** (stop-and-flag rule; collect blocks malformed/out-of-bounds output; the suite gates
> every commit) · NAMED_COMPENSATORS **2** (all work lands on branch `swarm/w2-health-amend-a`
> — compensators: `git revert <sha>` per commit, close the PR, delete the branch; nothing
> irreversible is delegated: no publish, no tag, no merge — merge is the Director's action) ·
> DECOMPOSE_BY_SECRETS **2** (fixes grouped by domain change-reason; public surfaces carved
> out to the advisor) · UNCERTAINTY_GATED_HUMANS **3** (two findings explicitly deferred to
> Director ruling rather than fixed; merge gated on advisor diff-review + Director word) ·
> EXTERNAL_VERIFIER **3** (xAI amends → Claude advisor reviews the diff cross-family → the
> deterministic floor `pnpm verify` is law; jury re-adjudicates the amend wave).

*Everything below the line is the paste block.*

---

# Wave 2: fix the 25 approved findings in your five domains. Branch + PR. No public surfaces.

## Who you are

**Grok Build, the Executor** — same seat as Wave 1. Director is **Mike** (live word overrides
everything). The Advisor collected your Wave-1 audit, re-read sixteen findings at their cited
locations without finding a discrepancy, and ran the panel + floor gates. 31 findings are
approved for amend; **25 are yours** (backend, frontend, tests, ci-tooling, one dataset item).
The six docs-domain findings are the Advisor's to execute (public surfaces are lead-authored —
standing law), and two findings are deferred to the Director:

- `F-acd97421` (Satie/Debussy attribution) — **do not touch those two songs or their stamps.**
- `F-8dfd1d79` (2026-07-28 MCP spec / v2 SDK migration) — tracked; not amendable this pass.

## The contract

- Work in `E:\AI\ai-jam-sessions` on a new branch **`swarm/w2-health-amend-a`** cut from
  current `main`. Commit per finding (or per tight cluster), message carrying the finding
  id(s). Open a PR to `main` when green; the Advisor reviews the diff against this contract;
  **merge is the Director's action.**
- **Test-first** for every code fix: write the failing test (name the invariant, both halves
  where applicable), watch it fail, fix, watch it pass, record the test id in your output.
  Workflow-file fixes have no test harness — validate YAML by careful diff (and `actionlint`
  only if it's already available; do not install tooling), and say in the fix note what was
  checked. The cockpit has no browser harness in CI — for DOM/audio fixes, unit-test the
  logic seams you can reach and record what you verified manually in the dev server.
- **Family-of-call-sites is part of each fix** — the named siblings below are in scope for
  their finding; if you find MORE siblings, fix them under the same finding id and say so.
- `pnpm verify` green (typecheck + 2912-baseline tests + build + smoke) before the PR.
  New tests raise the count; nothing may lower it.
- **Fences (hard):** no README*/translations, CHANGELOG, docs/**, site/**, ROADMAP.md, or any
  *.md public surface; no `src/songs/jam.ts` `inferChord`, `src/songs/implied-chord-snapshot.ts`,
  or `src/maker/er-gate.ts` behavior changes; no new workflow FILES (fold into existing six);
  no publish, no version bump, no tags, no pushes to `main`; no touching
  `songs/library/classical/{satie-gymnopedie-no1,debussy-arabesque-no1}.*`.
- **Output contract:** one JSON per domain you amended, to
  `E:\AI\testing-os\swarms\swarm-1787126957-4c3c\wave-2\<domain>.json`
  (backend, frontend, tests, ci-tooling, dataset), envelope
  `{ "domain", "summary", "fixes": [{ "finding_id", "file", "description" }], "files_changed": [], "skipped": [{ "finding_id", "reason" }] }`.
  `finding_id` = the control-plane id given below (F-xxxxxxxx). `files_changed` must stay
  inside your domain's frozen globs (the wave-2 briefs beside that path carry them; note
  `.gitattributes` now belongs to ci-tooling). A fix you decide not to make is a `skipped[]`
  entry with the reason — never a silent omission.

## The 25 findings (control-plane id · file · the fix)

### backend — 7

1. **F-e31943f5** `package.json` — bump `@modelcontextprotocol/sdk` pin so the lockfile takes
   **1.30.0** (currently installed 1.29.0; 1.30.0 carries the @hono/node-server advisory fix).
   `pnpm install`, commit the lockfile. No v2-family migration.
2. **F-5d549299** `src/mcp-server.ts` registerTool wrapper — migrate off deprecated
   `server.tool()` to `registerTool(name, { description, inputSchema, annotations }, cb)` and
   add `readOnlyHint`/`idempotentHint` per tool. **Keep every tool description byte-identical**
   (descriptions are attack surface under review; churn breaks that review). This is ~49
   mechanical call-site edits + a judgment call per tool on annotations: annotate the clearly
   read-only tools confidently (list/info/view/status class); where mutation is ambiguous,
   omit the annotation rather than guess, and list the omitted tools in the fix note. If this
   threatens session depth, do the wrapper migration + confident annotations and `skipped[]`
   the ambiguous remainder honestly.
3. **F-95f55587** `src/mcp-server.ts:2408` — add `isError: true` to import_midi's outer catch;
   **audit every other catch arm that returns content-only** (family probe) and fix those under
   this id. Test: force a parse throw, assert isError.
4. **F-e2e9baac** `src/mcp-server.ts:1101,2335,3224` — case-insensitive `.mid`/`.midi` suffix
   at **all three sites** (`/\.midi?$/i`). Test with a `.MID` path.
5. **F-9a7bbbd8** `src/mcp-server.ts:2162` — replace the `as StyleName` cast: validate at the
   boundary (z.enum of the three presets, or `resolveStyle()` before the Ollama probe returning
   the existing `structuredError("bad_style", …)`). Test: `style:"jazz"` yields the structured
   error, not `panel_failed`.
6. **F-fbc1028a** `src/guitar-tab-roll.ts:224,440` — stop interpolating raw JSON into the
   `<script>` context: escape `<` as `\u003c` on the serialized payload (or move it to a
   `type="application/json"` script read via textContent). Test with a title containing
   `</script>`.
7. **F-801fdbeb** `src/dataset/tool-schemas.json` — regenerate from a live `tools/list` against
   the current server (**after** fix 2 so schemas match the migrated registration), pin
   `tool_count` to the registered count, and add a test asserting catalog names === the
   server's registered names (so it can never drift silently again).

### frontend — 7

8. **F-1e191f0a** `apps/cockpit/src/main.ts:2246` — gate `performRedo` with
   `shouldRefuseUndoWhileRecording` exactly as `performUndo` (toast: "Stop recording to redo"),
   and disable `#btn-redo` while recording. Test beside the undo-gate test.
9. **F-b81b796a** `apps/cockpit/src/main.ts:3764` + `state.ts` addNote seam — clamp or reject
   out-of-roll MIDI (36–96) at `validateImportedNote` AND at the capture→`addNote` seam
   (`midiKeyDown`, `commitCapturePass`). Live preview may stay unclamped; nothing persists
   off-canvas. Tests for import + capture paths.
10. **F-2bff4066** `apps/cockpit/src/main.ts:568` — on play-state change set `aria-label`/
    `title` to Pause/Play (mirror `updateRecordUI`).
11. **F-0127119a** `apps/cockpit/src/main.ts:610` — defer `new AudioContext` until the first
    user gesture: construct+resume inside the existing `bindAutoplayUnlock` handler (keep the
    Play/Record resume paths). Record the manual first-sound check you performed in the dev
    server (Chrome at minimum) in the fix note.
12. **F-5ca9d054** `apps/cockpit/index.html:323` — the desktop transport overlay: either the
    in-flow placement (as the 1000px breakpoint already does) or `pointer-events:none` chrome
    with `pointer-events:auto` controls, plus scroll-padding so focused notes are never hidden
    under it.
13. **F-2283d074** `apps/cockpit/index.html:837` — shortcuts dialog: `aria-modal="true"`, move
    focus in on open, Escape dismisses (before panic handling) and restores focus, add a Close
    control.
14. **F-3fe65811** (LOW) `apps/cockpit/src/main.ts:791` — `aria-pressed` (or `aria-current`)
    on the Instr/Vocal mode buttons, updated in `setMode`.

### tests — 5

15. **F-20e0b65a** `src/cli.test.ts` — add pre-audio spawn smokes for `sing` (no id / unknown
    song / bad `--mode`) and `play` (unknown engine / unknown song), mirroring the existing
    practice smokes.
16. **F-3257290f** `src/cli.test.ts:254` — replace the silent `return` with
    `it.skipIf(!existsSync(distCliPath))` so an unbuilt tree reports SKIP, never PASS.
17. **F-3f054882** `src/mcp-server.test.ts` — assert `compose_panel` is registered
    (`expect(names).toContain`), plus glue-layer cases: bad measure range, unknown songs,
    unreachable Ollama (mirror the `auto_reharmonize` ollama_unreachable pattern).
18. **F-0f01cb08** `src/compose/panel-run.test.ts` — a single-system case asserting
    `code === 'too_few_systems'`; a stubbed null-judge case asserting
    `votesCollected < votesPossible`.
19. **F-bce4d2c6** `src/playback/engine.test.ts:146` + `controls.test.ts` +
    `integration.test.ts` — convert the remaining wall-clock mid-flight stop/pause tests to
    `vi.useFakeTimers()` + `advanceTimersByTimeAsync`, matching the pause tests already in the
    file.

### ci-tooling — 5

20. **F-112534cc** `.github/workflows/ci.yml` — add `datasets/**`, `vitest.config.ts`, and
    `samples/**` to **both** push and pull_request path lists (keep the existing comment style:
    note the 2026-07-10 songs/** precedent).
21. **F-5d420409** `.github/workflows/publish-jam-actions-v0.yml:73-74` — pass every
    `workflow_dispatch` input into `run:` via `env:` (never `${{ }}` inside the script body),
    **and the named siblings**: the later-step interpolations in `push-jam-actions-v0-hf.yml`
    (~lines 138-140) and `push-adapters-hf.yml`. Tighten repo-id inputs to an
    `^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$` allowlist where they exist.
22. **F-9c0a63bc** `.github/workflows/release.yml:116-118` — push `:latest` only when this
    version is actually newest: on `release: published` events only, or gated on
    `version == highest v* tag` (keep `:${version}` on retry dispatches).
23. **F-2588bec0** `.github/workflows/release.yml:10` — `cancel-in-progress: false` (a publish
    must never be SIGTERMed by a second dispatch); group by tag if you adjust the group key.
24. **F-0997d48f** `.github/workflows/ci.yml` — workflow-level `permissions: { contents: read }`
    and `persist-credentials: false` on the checkout steps.

### dataset — 1

25. **F-90786bb1** (LOW) `.gitattributes` — pin `songs/library/**/*.json text eol=lf`,
    `*.mid binary`, `samples/**/*.wav binary`; then `git add --renormalize` the 23 CRLF library
    files in a **dedicated commit** (line-ending-only churn, isolated for review); receipt
    `git ls-files --eol -- songs/library` in the fix note. (`.gitattributes` is in YOUR
    ci-tooling globs for this wave; file the fix under dataset with the file listed there —
    if collect flags the cross-domain touch, the Advisor holds the override; do not
    self-reassign domains.)

## Verification & andon

- Confirm the green baseline before your first edit (`pnpm typecheck && pnpm test`); stop and
  flag if your environment disagrees.
- Any platform fact this contract doesn't cover → stop and flag in `skipped[]`/summary; the
  Advisor answers with a receipt. Never invent versions, spec claims, or API shapes.
- **Measurement discipline:** report what each fix changed and what its test demonstrates —
  no *verified/proven/works* language; the Director judges. A fix you couldn't complete,
  reported honestly in `skipped[]`, is a good outcome.
- Close with a short summary to Director + Advisor: fixes landed, tests added (count before →
  after), anything that surprised you, the PR link.

## What happens next

Advisor: `swarm collect` on your five JSONs → cross-family diff review against this contract →
case-file → non-Claude jury on the amend wave → `swarm verify` floor → Director merges the PR.
After merge, the Advisor personally executes the six docs findings (README counts 49/4,
2912-test claim, version story, beginners Node 22+, CONTRIBUTING rewrite, ROADMAP/site-config
sync) and regenerates the seven translations locally — those are lead-authored surfaces and
not in your scope.
