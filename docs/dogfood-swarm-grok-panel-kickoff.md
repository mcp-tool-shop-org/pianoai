# Executor Kickoff (Grok Build): Panel Slice A — the human-audio Composition Panel

> **PASTE TARGET: the Grok Build executor session.** Authored 2026-08-19 by the Advisor.
> Director-picked feature-pass centerpiece. The mission north star is
> `docs/cockpit-composition-panel-kickoff.md`; this paste is **slice A of two** — the Panel
> mode shell + the human-audio blind A/B audition on the real sampled engine. Slice B (the
> LLM panel mode + the Compare/concordance surfaces) gets its own kickoff after slice A
> passes the Director's ear-gate. The sound lane resolved the mission doc's open fork: the
> cockpit now HAS a sampled Concert Grand (PR #30/#31) — this kickoff names the real modules.
>
> **Study grounding binds this slice** (`docs/dogfood-swarm-study-grounding.md`, lane B +
> C8): loudness-matched A/B is MANDATORY (B4/EBU — the louder clip wins for the wrong
> reason), trial lists are declarative data with per-listener randomization (B7), vote
> budgets ≥15–25 per pair-per-song before a win rate is trusted and ~66/pair for a stable
> k=4 ranking (B5/B6), bootstrap CIs never bare point estimates (B6), the floor gate is a
> MUSHRA-style >15% post-screen (B1), and A/B switches at a matched playhead with keyboard
> shortcuts (C8).
>
> **Director decisions pre-flagged:** (1) the two-slice split above — slice A carries no
> LLM-judge UI at all; (2) the engine system (`RefiningProposer(OllamaSpecRealizer)`) is
> included live-when-reachable — the deployed Pages cockpit shows it honestly absent (no
> server proxy in slice A; slice B owns the bridge question); (3) recruiting a paid
> multi-listener panel stays a priced-ask — slice A's listeners are whoever sits at the
> cockpit, with the honest-N framing.
>
> **Standards compliance (0–3):** PIN_PER_STEP **3** (seeded trials via the shipped
> `makeRng`; every run record carries seed + trial list + loudness offsets + engine tag; a
> replay test proves same-seed-same-votes → identical scoring) · ANDON_AUTHORITY **2**
> (loudness-match-infeasible halt; audio-parity halt; standing brief-gap halt) ·
> NAMED_COMPENSATORS **2** (branch `feat/cockpit-panel-human-audio`; merge-commit +
> revert-per-finding; nothing irreversible — no publish/tags/main-push) ·
> DECOMPOSE_BY_SECRETS **2** (panel modules are new files; commit per slice; the sound
> stack is untouched except additive exports) · UNCERTAINTY_GATED_HUMANS **3** (the feature
> IS the uncertainty instrument: floor post-screen, provisional-below-budget labels,
> UNINTERPRETABLE first-class; the Director's blind session is acceptance) ·
> EXTERNAL_VERIFIER **3** (advisor cross-family whole-diff + live browser pass + non-Claude
> jury; `pnpm verify` is law).

*Everything below the line is the paste block.*

---

# Panel slice A: build the Panel mode into the cockpit and ship the human-audio blind A/B audition — every note through the real engine.

## Who you are

**Grok Build, the Executor** — same contract as PR #30/#31: branch
**`feat/cockpit-panel-human-audio`** from current `main`, commit per slice, PR,
`pnpm verify` green. The Advisor reviews the whole diff (including every user-facing
string, which they may rewrite), runs a live browser pass, and juries the wave; the
Director's ear is the acceptance test.

## The mission (north star: `docs/cockpit-composition-panel-kickoff.md`)

A third header mode — **Panel** — beside the cockpit's existing two, carrying the
**human-audio audition**: a blind pairwise A/B where a listener hears the same real melody
over two different voicings and picks which backing fits. Reference clip = the song's REAL
library melody. The systems being ranked are the shipped `src/compose` realizers. The
output is an honest Bradley-Terry ranking with bootstrap CIs, a discrimination-floor gate,
and vote-budget labels. **No LLM-judge UI in this slice.**

**The one non-negotiable:** every note the panel plays — reference, A, B — goes through
the **same voice path the piano roll and keyboard already use** (the sampled Concert Grand
via `salamander-sampler.ts` when ready, the `piano-timbre.ts`-shaped synth doors
otherwise, all through the shared output chain). Quality parity with the roll is the
acceptance test. **No new oscillator, no parallel audio path** — that mistake is why the
first prototype died.

## First move (audit before building — read in order)

1. `docs/cockpit-composition-panel-kickoff.md` + `docs/compose-panel-app-design-prompt.md`
   — the mission and the interaction/visual spec (its A/B + reference layout transfers;
   its beep synth and "$0 proxy" language are dead).
2. `apps/cockpit/src/`: `main.ts`, `state.ts`, `transport.ts`, `persistence.ts`,
   `gesture.ts`, `platform-status.ts` — how modes, state, persistence, gestures, and the
   status seam work. Then the sound stack: `synth.ts`, `salamander-sampler.ts`,
   `salamander-logic.ts` (`samplerHandlesVoice`), `piano-timbre.ts` — how the cockpit
   makes sound today and what `__cockpit.samplerState()` reports.
3. `src/compose/`: `realize.ts` (`rootPositionRealization` = the theory-naive floor,
   `nearestToneRealization`), `refine.ts` (`refineRealization`), `ollama-spec-realizer.ts`
   + `refine.ts`'s proposer wiring (the engine system), `bws.ts` (`makeRng`,
   `shuffledOrder`, `aggregatePanel`, `interpretPanel` — seeded RNG and bootstrap already
   exist; REUSE them), `panel-run.ts` (how songs → progressions → realizations flow).
4. `src/songs/` — the library (melody = `rightHand`). Import read-only; the frozen fences
   below apply.

## The work (commit per slice)

1. **Panel mode shell** — the third header mode, reusing the cockpit's existing
   mode/state/persistence mechanics and brand tokens. Additive: do not rewrite the app.
   An empty Panel view + run-config rail (song set, systems detected, seed display).
2. **Shared clip primitive** — ONE function that renders "this melody + this voicing" as
   a schedulable clip through the cockpit's real voice path, reused by reference/A/B and
   (slice B later) drill-down. If the synth/sampler needs a new capability (e.g. an
   offline render of the same graph), add it as an **additive export** — zero behavior
   change to existing paths, every existing literal test pin and the piano-timbre lockstep
   pin stays green. **Verify sound parity with the roll by construction (same modules,
   same parameters) before building further.**
3. **Loudness match (mandatory, B4)** — before a trial is presented, render A and B
   offline through the SAME modules/parameters (sampler buffers, timbre curves, output
   chain), measure RMS over each rendered clip, and set per-clip compensation gains so A
   and B match within **0.5 dB**. Store the measured offsets in the run record. A
   divergent measurement synth is the beep-synth mistake in a new coat — the offline
   graph must be the real graph. If the audit finds offline render of the cockpit voice
   path architecturally unreasonable, **stop and flag with the blocker** — do not ship
   unmatched A/B.
4. **Trial machinery (B7 + C8)** — the trial list (song × system-pair, floor trials
   injected) is **declarative data**, built per run with `makeRng(seed)`: randomized trial
   order, blind randomized A/B side assignment, seed recorded in the run record. Floor
   trials = valid-system vs `rootPositionRealization` pairs, blind among real trials,
   ≥10% of the list (min 3). Playback: **preload/decode both clips fully before the trial
   starts; one shared playhead; switching A↔B continues from the matched position** (never
   restart-from-zero except explicit restart). Keyboard: number keys select A/B, spacebar
   play/pause, and an always-reachable stop (WCAG 1.4.2). Reference clip on its own
   button. Nothing auto-plays without a gesture.
5. **Votes → scoring** — votes as `BwsVote` records; aggregate with the shipped
   `aggregatePanel`/`interpretPanel` (bootstrap CIs stay — never a bare point estimate).
   Labels are load-bearing: a pair below **15 votes** shows "collecting — N/15"; the
   ranking is **PROVISIONAL** until every included pair has ≥15, with the stable-ranking
   bar (~66/pair for k=4) stated; a listener who mis-picks the floor side on **>15%** of
   floor trials is screened out (their votes excluded from the published ranking, said
   plainly); if screened listeners still can't separate valid from floor, the run is
   **UNINTERPRETABLE** — displayed as a first-class outcome, not an error.
6. **Systems detection** — the three deterministic systems (floor / nearest / refined)
   are always present. The engine system is included only when the local model is
   actually reachable from the browser (probe once per run config); when absent, say so
   honestly ("engine system unavailable — local model not reachable") and run k=3. Never
   fake it, never silently substitute stale clips. If dev-origin CORS blocks the probe
   entirely, flag it in the report — slice B owns the bridge.
7. **Persistence + export** — panel runs persist beside (never inside) the score data via
   the cockpit's existing persistence mechanics; a run (seed, trial list, votes, offsets,
   outcome) exports as JSON. The listener count comes from run records (1 listener = "your
   blind preference"; ≥3 independent = "the robust claim" — those words, not "quality
   N/100").
8. **Tests** — pure-logic coverage without audio: trial-list construction (coverage,
   floor-injection rate, side blinding), seed replay (same seed + same votes → identical
   scoring output), gain math from measured RMS pairs, budget/screen/gate label logic,
   systems detection. `pnpm verify` green — cockpit typecheck/build included.

## Honesty framing (keep it, clean it)

UNINTERPRETABLE and INCONCLUSIVE are first-class outcomes. Human-audio is the quality
claim, honest about N. No "$0", no "quality: N/100", no proxy language anywhere in this
mode. Every user-facing string answers *what happened* and *what to do next* — the
Advisor reviews and may rewrite each one, updating literal pins with it.

## Fences (hard)

- Frozen musical baselines untouched: `src/songs/jam.ts` (`inferChord`),
  `src/songs/implied-chord-snapshot.ts`, `src/maker/er-gate.ts`, the Gate-2 experiment
  JSON. Importing library data read-only is fine; editing it is not. Mutopia entries +
  receipts untouched.
- The sound stack (`synth.ts`, `salamander-sampler.ts`, `salamander-logic.ts`,
  `piano-timbre.ts`) changes only by **additive export** — no behavior change, all
  existing pins green.
- No README*/CHANGELOG/docs/site/ROADMAP edits (the Advisor writes public surfaces on the
  branch). No npm `files`/version change, no publish, no tags, no pushes to `main`, no
  new workflow files.
- `Composition Panel.dc.html` is a layout reference ONLY — never import its code.
- Filing rule: fixes land under the frozen glob owner (`apps/**`→frontend, `src/**`→
  backend, `scripts/**`→ci-tooling).

## Acceptance (in order)

1. `pnpm verify` green; PR checks green.
2. Advisor live pass (real clicks): gesture-gated audio; sampled notes in the clips once
   `__cockpit.samplerState()` is ready; matched-playhead A/B switching; recorded loudness
   offsets within tolerance; floor trials indistinguishable in the UI; keyboard operation;
   provisional/screened/uninterpretable labels rendering; the Director's persisted score
   untouched.
3. **The Director sits down and runs a blind session by ear.** The panel must feel
   professional and the clips must sound like the roll. His ear + the honest readout are
   the gate.

## Output

`E:\AI\testing-os\swarms\swarm-1787126957-4c3c\panel-a\report.json` —
`{domain, summary, fixes:[{finding_id:"PANEL-A", file, description}], files_changed, skipped}` —
plus the usual close: receipts (loudness method + measured offsets per trial, seed-replay
proof, parity statement naming the shared modules, a sample trial list, engine-probe
result), what surprised you, the PR link. Andon: any audio/platform/methodology fact this
brief doesn't cover → stop and flag rather than improvise.
