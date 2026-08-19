# Dogfood Swarm — Wave 3 Executor Kickoff (Grok Build): Health Stage-B Audit (Proactive)

> **PASTE TARGET: the Grok Build executor session.** Authored 2026-08-19 by the Advisor.
> Run `swarm-1787126957-4c3c`, wave 3 (health-audit-b) dispatched. Stage-A is fully closed
> and merged (PR #26 + PR #28); `main` @ `ae6969e`, suite **2930 passed / 1 skipped**, CI green.
>
> **Standards compliance (0–3):** PIN_PER_STEP **2** (per-domain briefs pinned on disk with
> the wave-3 snapshot; output schema collect-gated) · ANDON_AUTHORITY **2** (stop-and-flag;
> fail-closed collect) · NAMED_COMPENSATORS **2** (audit-only — zero irreversible actions;
> run-level compensator unchanged) · DECOMPOSE_BY_SECRETS **2** (same domain split; one
> documented read-grant below) · UNCERTAINTY_GATED_HUMANS **3** (findings are proposals;
> cross-family re-rate; Director disposes before any amend) · EXTERNAL_VERIFIER **3**
> (xAI audits → Claude advisor verifies at source → non-Claude jury → `pnpm verify` is law).

*Everything below the line is the paste block.*

---

# Wave 3: audit `ai-jam-sessions` with the PROACTIVE lens. Audit ONLY — you change nothing.

## Who you are

**Grok Build, the Executor** — same seat, same rules as Waves 1–2. Director is **Mike**
(live word overrides everything). The Advisor collects, re-reads findings at source
(your Wave-1 record: 16/16 accurate — keep that standard), and runs the jury + floor.
**Read-only wave: no edits, no branches, no commits, no publishes.** Fixes belong in
`recommendation` fields; the amend wave comes after the Director's review.

## What changed since your Wave-1 audit (so you don't re-derive)

All 31 approved Stage-A findings are fixed and merged (`754a943`), and the Director-ruled
provenance swap landed (`bfc31ac`): Satie/Debussy now carry receipted Mutopia Public Domain
bytes with fresh analysis/annotations — **that question is closed; do not re-open it.**
The SDK pin is 1.30.0, tools carry read-only/idempotent annotations via
`READONLY_IDEMPOTENT_TOOLS`, workflow inputs go through `env:`, ci.yml has
`permissions: contents: read` + the `datasets/**` path gate, and the docs surfaces were
synced (49 tools / 4 prompts / 2930 tests).

## Read first

1. The seven wave-3 briefs: `E:\AI\testing-os\swarms\swarm-1787126957-4c3c\wave-3\*.md` —
   your read-scope globs, the PROACTIVE lens, the closed-findings shield (do not re-report),
   the **confirmation queue** (below), and the output schema.
2. `docs/dogfood-swarm-study-grounding.md` — still binding. Stage-B-relevant lanes: A5
   (the official MCP security classes — token/state handling by name), A6 (tool-description
   text as attack surface), C3 (scheduler lookahead vs the 2ms `currentTime` quantization —
   a degradation-margin question), C7 (non-visual equivalents for visual-only state).
3. `docs/music-wing-phase2-s2-style-membership-refine.md` — what is deliberate design in
   `src/compose/` (fail-soft panel, first-class uninterpretable outcomes) vs a gap.

## The confirmation queue (this closes ledger entries — do it first)

- **`F-90786bb1`** (.gitattributes eol pins, LOW): the fix merged in Wave 2
  (`6e96089`). Verify it stands — pins present in `.gitattributes`
  (`songs/library/**/*.json text eol=lf`, `*.mid binary`, `samples/**/*.wav binary`) and
  `git ls-files --eol -- songs/library` shows index LF. If verified, declare the id in your
  ci-tooling report's `confirmed[]`. This is the one open ledger entry from Stage A.
- **`F-acd97421`** (Satie/Debussy attribution): RESOLVED on main via PR #28. If your brief's
  queue lists it, verify the two songs' `source` fields carry the Mutopia receipts and
  declare it; do not re-file anything about it.
- **`F-8dfd1d79`** (v2-SDK / 2026-07-28-spec migration): stays a tracked Director decision.
  Do not re-file it; adjacent *new* facts (e.g., a v1-line deprecation notice appearing) are
  legitimate fresh findings.

## The Stage-B lens, sharpened per domain

Generic lens (in your briefs): defensive coding, observability, graceful degradation,
future-proofing. What that means HERE, with the named leads:

- **backend:** what happens on hostile or broken *state* rather than hostile input —
  malformed/truncated library JSON at registry load, a missing or permission-denied
  `~/.ai-jam-sessions` tree (journal writes, user songs), corrupt persisted tuning configs,
  audio-engine construct/teardown on error paths (does a failed engine leave a session
  wedged?), Ollama-down behavior on every path that reaches it (`auto_reharmonize`,
  `compose_panel` — some fail-soft exists and is tested; find the arms that are not),
  structured-error coverage (`errors.ts` conventions — which throws still reach the user as
  raw stacks?), and the A5 checklist by name (token passthrough, state handling) even though
  this server is stdio-only — say "not applicable, verified why" where that is the honest
  answer.
- **frontend (cockpit):** degradation when the platform says no — Web MIDI absent or
  permission-denied, `localStorage` full/denied (persistence currently assumes it works?),
  a suspended AudioContext that never resumes (is there user-visible feedback, or silent
  muteness — the Stage-A fix gated construction, this is the *feedback* question), corrupt
  persisted score on load (import has a validator; does the storage-load path use it?),
  and C3's margin: is the lookahead window comfortably above the 2ms clock quantization on
  all three engines' paths.
- **tests:** are the degradation paths TESTED — the fail-soft arms, the persistence-failure
  behaviors, the error-code surfaces. Where Stage A added gates (redo-gate, clamp, skipIf),
  check siblings that still lack the same discipline. Flake margins on remaining
  wall-clock-adjacent tests.
- **ci-tooling (+ the read-grant):** resilience of the six workflows — retry/timeout
  posture, cache correctness, artifact retention, and whether `dependabot.yml` matches the
  org rule (monthly interval, grouped updates, open-PR limit 3 — grouped npm bumps were
  observed live, verify the config). **Advisor read-grant, this wave only:** the frozen
  wave-3 globs omit `scripts/**`; you are granted READ access to exactly
  `scripts/download-library.ts` and `scripts/import-classical.ts` for the lead below — file
  those findings under ci-tooling. (The domain map gains `scripts/**` at the next freeze
  boundary; the grant is recorded here and in the wave receipt.)
  **Lead:** both scripts still name piano-midi.de / bitmidi URLs. Classify: dead history
  that should say so, or a live tool that would recreate the provenance problem if run
  today? What happens if someone runs them now — do they overwrite receipted library
  entries?
- **dataset:** registry resilience to a malformed song file (one bad JSON among 120 —
  does `initializeFromLibrary` fail the whole library or degrade per-song?);
  **lead:** `src/dataset/provenance-url-verifier.ts` still maps the two re-sourced ids to
  piano-midi.de — frozen slice history or live behavior? Does anything call it against the
  NEW library entries, and would it now report a mismatch that confuses a future packaging
  run? Classify current-claim vs history; recommend, don't rewrite.
- **docs (audit-only, advisor executes):** operational-readiness gaps — does any doc tell a
  user what to do when audio is silent / Ollama is down / MIDI import fails (the
  troubleshooting surface)? SECURITY.md currency after the Stage-A changes.
- **experiments:** skip unless something contradicts a tracked claim (zero-finding Wave-1
  precedent stands).

## Severity calibration — Stage B inflates; hold the line

The measured precedent on this play: a Stage-B audit rated 10 HIGHs and exactly **1**
survived cross-family re-rate. The rule: **a missing hardening is MEDIUM or below unless a
concrete, realistic trigger TODAY produces data loss, corrupted state, security exposure, or
a user actively misled.** "Could be more defensive," "observability could be better," "a
future version might break this" — MEDIUM at most. Name the worst realistic consequence in
the description before you choose the severity; the Advisor re-rates every one.

## Output contract

One JSON per domain to `E:\AI\testing-os\swarms\swarm-1787126957-4c3c\wave-3\<domain>.json`
(same envelope as Wave 1: `domain`, `stage: "B"`, `summary`, `findings[]` with the closed
enums, `confirmed[]`, `skipped[]`). Categories will lean `defensive | observability |
degradation | future-proofing`; `bug`/`security` stay available for anything Stage-A-shaped
you trip over. One finding per root cause with the family-of-call-sites listed; honest
`skipped[]` for what you didn't reach. Run `pnpm typecheck && pnpm test` once at the start
to confirm the 2930/1 baseline; stop and flag if your environment disagrees.

## Fences (hard)

Zero edits anywhere. Frozen musical baselines (`src/songs/jam.ts`,
`src/songs/implied-chord-snapshot.ts`, `src/maker/er-gate.ts`) — findings about, changes
never. The two Mutopia songs are receipted — no re-sourcing proposals. Public surfaces
(README*, translations, CHANGELOG, docs/**, site/**, ROADMAP) — audit accuracy, never draft.
No publish, no version bump, no tags, no pushes.

## How this wave closes

Advisor collects (explicit `--domain=name:path`), re-reads findings at source, assembles the
case-file, puts the wave to the non-Claude jury, and the Director disposes before any amend.
Close your session with the usual summary: what you audited, what you skipped, what
surprised you.
