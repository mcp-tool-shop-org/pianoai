# Executor Kickoff (Grok Build): Panel Slice B — the LLM panel + Compare

> **PASTE TARGET: the Grok Build executor session.** Authored 2026-08-19 by the Advisor.
> Slice A is MERGED (`45d34f8`, PR #32): the Panel mode and the human-audio blind A/B are
> live on the real engine. Slice B completes the mission doc
> (`docs/cockpit-composition-panel-kickoff.md`, slices 4–6): the **LLM panel** sub-mode
> wired to the real compose backend, the **shared surfaces** (ranking chart, floor-gate
> pill, History, Compare), and the **honesty pass at the source** — the LLM-panel verdict
> prose gets professionalized where it lives.
>
> **Slice-A learnings this build stands on (all proven live 2026-08-19):**
> - **Direct browser→Ollama works in dev** on this rig: GET `/api/tags` 200, OPTIONS
>   preflight 204 + POST `/api/chat` 200 from the Vite origin. The "bridge" is the same
>   probe-then-fetch pattern slice A ships; on Pages or unreachable → honest absence.
> - **Ollama `format:"json"` NEVER emits a bare array.** Every model reply contract must
>   be ONE wrapper object (`{"specs": [...]}`-style); `parseEngineSpecArray` in
>   `src/compose/human-audio-panel.ts` is the shipped parsing precedent (array /
>   wrapper-key / measure-keyed all accepted).
> - A mid-run model failure marks the engine unusable so the NEXT run's detection is
>   honest — never a silent substitute. Extend the same stance to judges.
> - The cockpit tsconfig has NO Node types: Node-dependent tests live in `src/` and reach
>   cockpit files by relative path. Local green does not prove this class — CI does.
>
> **Director decisions pre-flagged:** (1) `interpretPanel`'s verdict strings in
> `src/compose/bws.ts` are REWRITTEN at the source — they render in the cockpit now, and
> the same words flow through the `compose_panel` MCP tool output; that is intended
> (product text, not a frozen baseline; every literal test pin updates with it). (2) Judge
> roster = locally installed models MINUS the qwen2.5 generator family (the panel-run
> contract; the generator never judges itself) — zero eligible judges is an honest empty
> state, not a fallback. (3) The human-audio audition flow from slice A is untouched; its
> ear-gate is deferred to real use by the Director's word.
>
> **Standards compliance (0–3):** PIN_PER_STEP **2** (LLM run records carry judge model
> tags + seed; scoring deterministic given votes; replay pinned) · ANDON_AUTHORITY **2**
> (no-eligible-judges halt; judge-failure marking; standing brief-gap halt) ·
> NAMED_COMPENSATORS **2** (branch `feat/cockpit-panel-llm`; merge-commit +
> revert-per-finding; nothing irreversible) · DECOMPOSE_BY_SECRETS **2** (browser caller /
> UI / shared surfaces / verdict-string rewrite are separate commits; scoring stays single-
> source in bws.ts) · UNCERTAINTY_GATED_HUMANS **3** (Compare exists to answer "does the
> cheap proxy track the human truth"; LLM = directional only, said plainly) ·
> EXTERNAL_VERIFIER **3** (advisor whole-diff + live pass + non-Claude jury; `pnpm verify`
> is law).

*Everything below the line is the paste block.*

---

# Panel slice B: wire the LLM panel to the real backend, add the shared surfaces, and make every verdict read professionally — the human-audio mode stays untouched.

## Who you are

**Grok Build, the Executor** — same contract as PR #30/#31/#32: branch
**`feat/cockpit-panel-llm`** from `main` at `45d34f8` or later, commit per slice, PR,
`pnpm verify` green. The Advisor reviews the whole diff (and every user-facing string,
which they may rewrite), runs a live pass against this rig's Ollama, and juries the wave.

## The mission (north star: `docs/cockpit-composition-panel-kickoff.md` slices 4–6)

The Panel mode gets its second sub-mode: the **LLM panel** — the local-LLM directional
smoke-screen over the same songs and systems, wired to the REAL `src/compose` backend
(`runVoiceLeadingPanel` / `runComposePanelTool` semantics — `bws.ts` scoring stays the
single source of truth). Plus the surfaces both sub-modes share: the diverging ranking
chart with CI whiskers, the floor-gate pill, History across both run kinds, and
**Compare** — does the cheap LLM proxy track the human-audio truth (Kendall τ over the
rankings + engine-rank match). LLM results are **directional only** and say so.

## First move (audit before building — read in order)

1. `docs/cockpit-composition-panel-kickoff.md` (slices 4–6) +
   `docs/compose-panel-app-design-prompt.md` — the interaction/visual spec.
2. `src/compose/`: `panel-run.ts`, `compose-panel-tool.ts`, `ollama-bws-judge.ts`,
   `bws.ts` (`aggregatePanel`, `interpretPanel` — the verdict strings you will rewrite),
   `human-audio-panel.ts` (`parseEngineSpecArray`, `probeLocalModel`, storage shapes).
3. `apps/cockpit/src/panel.ts` + `panel-clip.ts` — slice A's seams: the mode shell, the
   `realizeEngine` fetch pattern, the clip primitive, `PANEL_RUNS_STORAGE_KEY`.
4. Decide the judge path: audit whether the compose backend's judge modules
   (`OllamaBwsJudge` / its backend) bundle clean into the browser (pure `fetch`, no Node
   builtins). If yes, wire them directly with an injected base URL. If any Node
   dependency blocks, build a thin browser caller that mirrors `panel-run.ts`'s logic
   using slice A's fetch pattern — **never fork the scoring**; votes still flow through
   `aggregatePanel`/`interpretPanel`.

## The work (commit per slice)

1. **Judge roster + browser caller** — probe `/api/tags`; eligible judges = installed
   models minus the qwen2.5 generator family (pin the exclusion in a pure function with
   tests). Zero eligible → the LLM run config shows an honest empty state and Start is
   disabled with a sentence saying what to install. Judge reply contract = ONE wrapper
   object (the format:"json" law); parse with the same tolerance as
   `parseEngineSpecArray` (shared helper if natural). A judge that fails mid-run is
   marked unusable for the rest of the run and the run record says so — votes it already
   cast stay, honestly labeled; never re-ask a different model in its name.
2. **LLM panel UI** — run config (songs, judge roster shown by name, seed), run
   execution with per-trial progress, result view: ranking + per-system tiles +
   verdict. Per-song drill-down plays the REAL voicings through slice A's clip
   primitive (same voice path, gesture-gated, no A/B loudness needed for single-clip
   audition). Runs persist beside the score (`PANEL_RUNS_STORAGE_KEY` shapes extended
   with a `kind: "llm"` record — slice A's `human-audio` records must deserialize
   unchanged).
3. **Shared surfaces** — the diverging ranking chart (CI whiskers, negatives left of
   zero, brand tokens, no chart library), the floor-gate pill, History listing both run
   kinds with panelType chips (human-audio records read-only), and **Compare**: pick one
   LLM run + one human-audio run over the same songs/systems → Kendall τ between the
   rankings + whether the engine lands the same rank, phrased professionally, honest
   about N on both sides (a PROVISIONAL human ranking says so in the comparison).
4. **Honesty pass at the source** — rewrite `interpretPanel`'s verdict strings in
   `bws.ts`: keep the exact semantics (directional-positive / inconclusive /
   uninterpretable-floor), kill "$0", "smoke-screen", "priced-ask", "quality: N/100"
   everywhere they appear in product output. LLM = directional only, in plain words.
   Update every literal test pin that quotes the old strings. Extend the slice-A
   banned-vocabulary sweep to cover `interpretPanel` outputs.
5. **Tests** — judge-family exclusion (qwen2.5* pinned out), wrapper-object reply
   parsing, Kendall τ on known rankings (concordant/discordant/tied pins), Compare
   labeling against a PROVISIONAL human run, History round-trip with mixed record kinds,
   verdict-string sweep. Node-dependent tests live in `src/` (the tsconfig trap).

## Fences (hard)

- Frozen musical baselines untouched (`src/songs/jam.ts`, the implied-chord snapshot,
  `er-gate.ts`, the Gate-2 experiment JSON, Mutopia entries + receipts).
- **The human-audio audition flow is slice A's and stays as merged** — no behavior
  changes; its tests stay green unmodified except where a shared surface genuinely
  requires a shared type.
- The sound stack changes by additive export only; all pins green.
- No README*/CHANGELOG/docs/site/ROADMAP edits; no npm `files`/version change, no
  publish, no tags, no pushes to `main`, no new workflow files.
- The qwen2.5 family never judges — no flag, no override.
- Strings meet the humanization bar (what happened + what to do); the Advisor reviews
  every one.
- Filing rule: `apps/**`→frontend, `src/**`→backend, `scripts/**`→ci-tooling.

## Acceptance (in order)

1. `pnpm verify` green; PR checks green (including the isolated cockpit job).
2. Advisor live pass on this rig: a full LLM run end-to-end against local Ollama with a
   real judge roster; drill-down audible through the real voice path; Compare rendering
   an honest τ against a stored human-audio run; History showing both kinds; zero banned
   vocabulary anywhere on screen.
3. The Director's word.

## Output

`E:\AI\testing-os\swarms\swarm-1787126957-4c3c\panel-b\report.json` —
`{domain, summary, fixes:[{finding_id:"PANEL-B", file, description}], files_changed, skipped}` —
plus receipts (judge roster with exclusions shown, one complete LLM run record, a τ
worked example, the verdict-string before/after summary), what surprised you, the PR
link. Andon: any backend/bundling/judging fact this brief doesn't cover → stop and flag
rather than improvise.
