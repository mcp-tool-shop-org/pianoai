# Advisor Handoff — ai-jam-sessions dogfood swarm (Grok Executor / Claude Advisor)

> **PASTE TARGET: a fresh Claude session in `E:\AI\ai-jam-sessions` — the ADVISOR seat.**
> Do NOT paste into Grok Build. Written 2026-08-19 at the close of the founding advisor
> session (waves 1–4 + provenance + sound slices 1–2, all closed same-day). Project memory
> auto-loads (`MEMORY.md` → the ⭐ swarm entry carries the detailed ledger); this file is the
> session-to-session baton on top of it.

## Who you are

The **Advisor** for run `swarm-1787126957-4c3c` (control plane: testing-os at
`E:/AI/testing-os`, CLI `node E:/AI/testing-os/packages/dogfood-swarm/cli.js`). Director is
**Mike** — live word overrides everything; he pastes kickoffs into **Grok Build, the
Executor**, which writes product code on branches and opens PRs. You own: kickoffs,
contracts, source-level verification of every executor return, user-facing STRING review
(personal, you may rewrite), the case-file + non-Claude jury, receipts, memory, and all
public surfaces (README + 7 translations, CHANGELOG, docs/**, site/**, ROADMAP, metadata —
never delegated, a law with scars). Merge handling follows the Director's per-PR word — the
established pattern is his "merge is yours"-style delegation with full receipts. NO Fable
subagents (Director 2026-08-16): Sonnet/Opus only, always explicit `model=`.

## State at handoff (all measured 2026-08-19)

- **Health pass Stage A + Stage B: CLOSED AND MERGED.** Waves 1–4 (audit/amend × 2), PRs
  #26, #28 (the Director-ruled Satie/Debussy Mutopia swap), #29. Ledger: **45 fixed /
  2 deferred / 0 open** of 47 filed. Deferred: `F-8dfd1d79` (v2-SDK / 2026-07-28-spec
  migration — Director-tracked) and the closed provenance ruling's history.
- **The feature pass is LIVE and aimed at SOUND** (Director's live verdict "harsh, not
  melodic" re-aimed it). Slice 1 MERGED (PR #30: velocity lowpass 1.4–7.2 kHz + compressor
  2.5/−24 on both oscillator doors via `piano-timbre.ts` held by a RED-proven lockstep pin;
  `sample` = first-class server engine, default when a pack is installed). **Slice 2 =
  PR #31** (`feat/sound-sampled-cockpit`): the pruned CC-BY Salamander pack (90 OGGs,
  8.24 MB, full provenance manifest, regenerable via `scripts/prune-salamander.ts`), the
  cockpit sampler (gesture load → `__cockpit.samplerState()`, synth fallback through the
  W4 status seam), the advisor voice-routing fix (`samplerHandlesVoice` — only `grand`
  samples; the 10-voice rack stays 10), and the attribution surfaces. **Both Director
  ear-gates PASSED live** ("Very good!!!", "Sounds good! Different voices now"). At writing,
  the sound-2 jury + merge were the in-flight tail — confirm `gh pr view 31` merged and the
  adjudication receipt exists under `swarms/swarm-1787126957-4c3c/adjudications/`; if not,
  that close-out is your first action (the case-file builder pattern is in
  `case-file-sound2.json` beside its siblings).
- main was pushed through every close; suite at slice-2 head: **2966 passed / 1 skipped**;
  npm has **2.0.0**, local is 2.1.0+ (publish = Director priced-ask,
  translations-before-release ordering binds).

## The proven close-out loop (run it verbatim on every executor return)

1. Fetch/checkout the branch; **fence grep** the changed-file list (README/CHANGELOG/docs/
   site/ROADMAP/datasets/jam.ts/implied-chord-snapshot/er-gate/satie/debussy + package.json
   when the contract says so).
2. **Verify at source, never from the report** — every HIGH, every load-bearing claim,
   receipts re-fetched live (license pages, hashes, counts). The executor's record across
   this whole run: 26/26 advisor spot-checks accurate, zero fabrication, zero severity
   inflation — trust built, verification unchanged.
3. **String review** (the law): every user-facing string answers *what happened* and *what
   to do*; you rewrite in place and update literal test pins with it.
4. Your own `pnpm verify` on the branch + the PR's checks.
5. **Live browser pass when the change is audible/visible**: `.claude/launch.json` has the
   `cockpit` dev server; real clicks (synthetic events are untrusted — no gesture, no
   audio); `read_network_requests` proves fetches; NEVER mutate the Director's persisted
   score (export first; ids regenerate on import, compare content not strings) — and his
   persisted voice/preset can mask your change (the Bright-Grand episode).
6. Case-file (copy a sibling `case-file-*.json` shape) → `swarm adjudicate <run>
   --case-file <path> --jury=local`. The Director's ear-verdicts are legitimate
   `from-ticket` evidence.
7. Merge per his word (merge commits, never squash — revert-per-finding is the
   compensator), pull main, receipt, memory + `loadout-os refresh`.

## Mechanics traps (each cost real time once — do not re-earn them)

- **hermes3:8b stale 4096-ctx pin recurs** (suspect: ollama-intern reconnects). The
  brief-size guard refuses the whole panel. Fix: `ollama stop hermes3:8b`, one fresh
  default-load probe (comes up 32768), re-adjudicate. Never `--allow-oversize`.
- **Neutrality lint vocabulary**: "resolves the / fixes the / (is|was) fixed" are pinned
  verdict patterns — a path-resolution sentence trips it. Reword; don't argue.
- **Contested verdicts**: if the dissent traces to YOUR briefing (stale ref, ambiguous
  criterion) → fix the brief once, re-run (W2/W3 precedent). If the dissent is
  deterministically refuted (test counts the floor itself proves; your own disclosed
  stale caveat) → `swarm advance --override --reason` with receipts (W4/#79, sound-1/#80).
  Never a third jury run.
- **collect** needs explicit `--domain=name:path` (auto-discovery wants `<domain>/output.json`
  subdirs). Failed-wave recovery: `swarm revalidate --domain=name:corrected.json --apply`
  (repairs blocked states but SKIPS already-complete agents without re-ingesting their
  fixes) + `swarm redrive <waveId> --apply`, then full re-collect.
- **Single-executor waves always flag cross-glob "violations"** — attribution bookkeeping,
  not misconduct. Prevention: the kickoff states the filing rule — fixes land under the
  FROZEN GLOB-OWNER (`src/**`→backend incl. src tests and src/dataset; `apps/**`→frontend;
  `scripts/** + .github/** + .gitattributes`→ci-tooling). Your whole-diff review is the
  compensating control; the degraded-probe banner is expected without `--isolate`.
- **Domain map edits only between waves** (mid-wave unfreeze is refused; that gate is
  correct). `scripts/**` already belongs to ci-tooling.
- **Prove every new gate RED** (mutate the protected thing, watch it fire) — the
  piano-timbre lockstep pin is the template.
- Jury runs load GPU models — check the **VRAM watchdog** is alive first
  (`pwsh -NoProfile -File "E:/AI/training/_watchdog_start.ps1"` — forward slashes, bash
  eats backslashes into pwsh help-text).
- The readme-gate hook blocks the first README edit per session until the whole file is
  read — expected, not an error.

## Standing fences

Frozen musical baselines (`src/songs/jam.ts` inferChord, `src/songs/implied-chord-snapshot.ts`,
`src/maker/er-gate.ts` — its TRAINING_SONG_IDS is an EXCLUSION list; the Gate-2 data lives
at `experiments/maker-arc/implied-chord-snapshot.json` and regenerates only via the official
script with a 118/120-unchanged proof). The Mutopia entries + receipts. The npm tarball
stays sample-free (pre-flagged Director default). Translations run locally
(`node E:/AI/polyglot-mcp/scripts/translate-all.mjs README.md`, advisor-invocable; check
CJK survived). Comfy Cloud is settled: waveform-only, no symbolic lane (calibrated
2026-08-19) — symbolic work stays in this repo.

## What comes next (Director picks; likely order)

1. **Panel build** — the cockpit Composition Panel (`docs/cockpit-composition-panel-kickoff.md`)
   on the now-real sampled engine; amend its contract with the study-grounding lane B:
   **loudness-match A/B clips**, declarative randomized trial lists, ≥15–25 votes/pair,
   bootstrap CIs (`docs/dogfood-swarm-study-grounding.md`).
2. **Stage-D visual polish** (the Comfy-Agent VISUAL brief trigger lives here) +
   **Stage-C top-up** if the D audit surfaces behavioral gaps.
3. **Phase 9** final test, then **Phase 10 full treatment** — shipcheck, README/translations
   finalize, landing + handbook, repo-knowledge, and the publish priced-ask.
4. Sound-lane escalation lever if his ear ever asks: the prune spec (more layers/roots),
   never another synth tweak.

Open the memory's ⭐ swarm entry, run `swarm status swarm-1787126957-4c3c`, confirm the
slice-2 tail closed, and pick up wherever the Director points.
