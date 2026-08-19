# Dogfood Swarm — Wave 1 Executor Kickoff (Grok Build): Health Stage-A Audit

> **PASTE TARGET: the Grok Build executor session.** Authored 2026-08-19 by the Advisor
> (Claude, advisor seat in `E:\AI\ai-jam-sessions`). Director is **Mike** — his live word
> overrides everything here. Control-plane run: `swarm-1787126957-4c3c` · save point
> `swarm-save-1787126957` @ `bdad5ac` on `main`.
>
> **Standards compliance (six workflow standards, 0–3):** PIN_PER_STEP **2** (executor seat
> named; per-domain briefs pinned on disk with a frozen domain-snapshot id; output schema
> pinned by the collect gate) · ANDON_AUTHORITY **2** (executor stop-and-flag rule below;
> collect-time schema gate fail-closed; a defective output blocks as `invalid_output`, never
> silently retried) · NAMED_COMPENSATORS **2** (this wave performs **no irreversible action** —
> audit-only, zero edits, zero publishes; the run-level compensator is
> `git reset --hard swarm-save-1787126957`, owner: Advisor) · DECOMPOSE_BY_SECRETS **2**
> (domains split by change-reason: engine core / browser app / tests / CI / data / docs /
> experiment receipts) · UNCERTAINTY_GATED_HUMANS **2** (findings are proposals; the Director
> disposes after cross-family severity verification; contrastive framing required at review) ·
> EXTERNAL_VERIFIER **3** (family-diverse at every seam: xAI generates → Claude advisor
> severity-rates → non-Claude local jury adjudicates the wave → the deterministic floor
> `pnpm verify` is the only law).

*Everything below the line is the paste block.*

---

# Wave 1: audit `ai-jam-sessions` for bugs and security. Audit ONLY — you change nothing.

## Who you are

**Grok Build, the Executor** for the ai-jam-sessions dogfood swarm — the same seat you hold
for Motif. The **Director is Mike** (live word overrides everything). The **Advisor** is the
Claude line working in `E:\AI\ai-jam-sessions` — it owns the run's control plane, receipts,
and review; it does not write findings for you and will independently re-rate every severity
you assign (different model family, by design). You audit. When a fact you need is missing,
you **stop and flag it** — you never invent platform facts, version numbers, or spec claims.

**This wave is read-only.** You edit NO files, create NO branches, make NO commits, and run
NO publishes. Your entire output is seven JSON findings files (contract below). A fix
proposal belongs in a finding's `recommendation` field — never in the tree. (Amend waves
come later, gated on the Director's review of this audit.)

## What ai-jam-sessions is

`E:\AI\ai-jam-sessions` (repo `mcp-tool-shop-org/ai-jam-sessions`, public, CI-green on
`main`). An MCP server that teaches AI to play piano and guitar — and sing. TypeScript, Node
≥22, pnpm, vitest. Local **2.1.0**; npm has **2.0.0** (everything since is unpublished —
publishing is a Director decision, not yours). The map:

- `src/` — the product: MCP server (`mcp-server.ts`, ~50 tools), CLI, six audio engines
  (oscillator + sampled piano, guitar, three vocal paths), piano roll (SVG), practice
  journal, teaching hooks, `midi/`, `playback/`, `songs/` (120-song annotated library),
  `analysis/` (deterministic per-song analysis), `maker/` (verified reharmonize loop),
  `compose/` (voice-leading gate + voicing-spec + refiner + style presets + the
  `compose_panel` BWS/Bradley-Terry panel core), `dataset/` (jam-actions), `teaching/`, `vendor/`.
- `apps/cockpit/` — Vite browser app (piano-roll editor, transport, capture, undo, vocal
  synth) — deployed live via GitHub Pages.
- `songs/`, `samples/vocal/`, `dataset/` — data. `site/` — Astro landing page.
- `experiments/` — historical finetune-arc receipts. **Read-only history; hygiene-skim only.**
- `docs/` — receipts + kickoffs (ships in the npm tarball, so accuracy matters).

Baseline, measured 2026-08-19 by the Advisor (Class A): `pnpm verify` green end-to-end —
typecheck, **2912 passed / 1 skipped (109 files)**, build, smoke 48/48. Anything you find is
therefore *not* caught by the current gates — that is the point of the audit.

## Read first (in order)

1. The seven domain briefs: `E:\AI\testing-os\swarms\swarm-1787126957-4c3c\wave-1\*.md`
   (backend, frontend, tests, ci-tooling, dataset, docs, experiments). Each carries your
   canonical read-scope globs and the output schema. **The globs in those briefs win** over
   anything here.
2. `docs/dogfood-swarm-study-grounding.md` — the research-grounded audit lens (MCP currency +
   security classes, Web Audio engineering, accessibility, listening-test methodology). Note
   its Class A / Class B verification header — Class B claims are leads, not gospel.
3. `.swarm/prior-run-2026-07-09-findings.json` — 160 findings from the July swarm
   (10 CRIT / 39 HIGH / 73 MED / 38 LOW), filed against a tree **six weeks and several
   shipped arcs old**. Treat as stale leads: re-verify against today's code; anything still
   real gets filed fresh with today's evidence (add `"prior_id"` so the Advisor can trace
   lineage); anything fixed or obsolete just isn't filed.
4. `docs/music-wing-phase2-s2-style-membership-refine.md` + `docs/cockpit-composition-panel-kickoff.md`
   — what the compose engine is and what the Panel feature will be (context for what is
   deliberate design vs a defect).

## Output contract (enforced at collect time — malformed output blocks the wave)

Write **one JSON file per domain** (seven total) to:

```
E:\AI\testing-os\swarms\swarm-1787126957-4c3c\wave-1\<domain>.json
```

`<domain>` ∈ backend · frontend · tests · ci-tooling · dataset · docs · experiments.
Raw JSON only (no markdown fences). Envelope per file:

```json
{
  "domain": "backend",
  "stage": "A",
  "summary": "One-line health assessment of this domain",
  "findings": [
    {
      "id": "F-W1-BACK-001",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "category": "bug|security|quality|types|tests|docs|defensive|observability|degradation|future-proofing|ux|accessibility|hygiene|error_message_quality|cli_help_quality|silent_failure|tests_coverage",
      "file": "src/path/file.ts",
      "line": 42,
      "symbol": "functionName",
      "description": "What is wrong — with the concrete evidence (input → wrong behavior)",
      "recommendation": "How to fix it",
      "prior_id": "optional — the 2026-07-09 finding id this re-confirms"
    }
  ],
  "skipped": [ { "finding_id": "F-W1-BACK-000", "reason": "why this area was not covered" } ]
}
```

- `severity` and `category` are **closed enums** — exactly the strings above.
- Every finding needs `file` + concrete evidence in `description` and a real `recommendation`.
- **Severity calibration (this repo has measured 16→6 HIGH inflation before):** before
  assigning severity, name the worst *realistic* consequence. Silent data loss, wrong audio
  output, security exposure, unrecoverable state → CRITICAL/HIGH. "Could be more defensive /
  observability could be better / docs drifted" → MEDIUM or LOW. The Advisor re-rates every
  severity cross-family; inflated ratings cost a round-trip.
- **One finding per root cause.** After finding an issue at one site, probe the
  family-of-call-sites for the same shape (every other MCP tool arm with the same pattern,
  every engine with the same lifecycle) and file ONE finding listing the sibling sites —
  not N clones.
- Partial coverage is honest coverage: if you run out of depth, say exactly what you did not
  look at in `skipped[]` / `summary`. An unexamined area reported as unexamined is a good
  outcome; an unexamined area implied as clean is the failure mode.

## The audit lens (research-grounded — details + citations in the grounding doc)

**Priority order: backend → frontend → tests → ci-tooling → dataset → docs → experiments.**
Depth beats breadth: a real CRITICAL in `mcp-server.ts` outranks ten style notes.

- **backend:** logic/correctness bugs; input validation at every MCP tool boundary (zod v4);
  error paths that swallow or mangle (`errors.ts` conventions); async/race issues in
  playback/transport; resource lifecycle (audio handles, MIDI ports, file handles); path
  handling on Windows; the MCP-currency checks — installed SDK 1.29.0 vs 1.30.0 (a known
  security-fix gap, pre-verified Class A), tool `outputSchema`/annotations
  (`readOnlyHint`/`idempotentHint`) coverage as a 2025-06-18 baseline, tool-description text
  reviewed as attack surface (OWASP MCP tool-poisoning class), token/secret handling by name
  against the official security-best-practices list. Do NOT redesign anything to the
  2026-07-28 stateless spec — that is a Director-level migration decision; just report the
  gap factually.
- **frontend (cockpit):** AudioContext created/resumed only inside a user gesture; lookahead
  scheduling (never notes fired straight off a bare timer); scheduler window vs the 2ms
  `currentTime` quantization; sample-rate match between the sampled voices and the context
  (linear-interpolation artifact risk); keyboard navigability of the roll (ARIA grid/slider
  semantics); WCAG 2.2 target sizes (≥24×24), focus-not-obscured under the sticky transport,
  audio-control (a reachable stop for any >3s auto-play); non-visual equivalents for
  visual-only state.
- **tests:** vacuous gates (a test that cannot fail — this repo's lineage includes gates
  that "passed N/N" while sealing nothing; where you suspect one, the check is whether
  mutating the protected thing makes it fire — report, don't mutate); coverage gaps on the
  newest surfaces (`src/compose/`, `src/analysis/`, cockpit capture/undo); flake-prone
  timing tests.
- **ci-tooling:** workflow correctness + drift across the six workflows (ci, pages, release,
  publish-jam-actions-v0, push-adapters-hf, push-jam-actions-v0-hf); paths-gating; secrets
  hygiene; concurrency groups; scripts/ correctness.
- **dataset:** songs/library integrity (schema conformance, the zz-test-fixture ignore
  actually holding); jam-actions packaging claims vs reality; LF/CRLF discipline (a measured
  past bug class here).
- **docs:** accuracy drift ONLY — claims vs measured reality (tool counts, test counts,
  version claims, npm badge vs 2.0.0-published/2.1.0-local, dead links, stale "waiting for"
  language). You report; the Advisor rewrites — docs are lead-authored, never executor-edited.
- **experiments:** hygiene skim only (untracked leaks, receipts that contradict tracked
  claims). History is frozen; do not propose rewriting it.

## Fences (hard)

- **Zero edits anywhere** this wave — audit only.
- **Frozen musical baselines** — you may file findings ABOUT them but any change is
  Director-gated and out of scope for any wave without his word: `src/songs/jam.ts`
  (`inferChord` — frozen by the E-R gate + Gate-2), `src/songs/implied-chord-snapshot.ts`
  (the Gate-2 snapshot), `src/maker/er-gate.ts` + its baseline data.
- **Public surfaces are lead-authored** (README* + seven translations, CHANGELOG, docs/,
  site/, logos, GitHub metadata, package descriptions): audit their accuracy, never draft
  replacements.
- No `npm publish`, no version bumps, no tags, no pushes, no GitHub writes of any kind.
- The suite is yours to RUN (`pnpm typecheck`, `pnpm test`), not to modify.

## Verification & andon

- Run `pnpm typecheck && pnpm test` once at the start to confirm you see the same green
  baseline (2912/1 skipped). If your environment can't reproduce it, **stop and flag** —
  do not debug the environment into a different state.
- Any platform/tooling fact you need that this brief doesn't cover → stop and flag it in the
  domain's `summary`/`skipped[]`. The Advisor can measure it and answer with a receipt.
- **Measurement discipline:** the words *verified, proven, works, shipped, validated* do not
  belong in your findings. Produce evidence (file:line, input → observed behavior, counts);
  the Director judges. A domain with zero real findings is a full success — say so plainly
  rather than manufacturing findings to look thorough.

## How this wave closes (so you know what happens to your work)

The Advisor runs `swarm collect` (schema gate + dedup + ownership check), independently
re-rates every severity (cross-family), assembles a neutral case-file, and puts the wave to
a non-Claude local jury (`swarm adjudicate`). The deterministic floor (`pnpm verify`) stays
the only law. The Director disposes the findings; only then does an amend wave get written.
Close your session with a short summary to Director + Advisor: what you audited, what you
skipped, what surprised you.
