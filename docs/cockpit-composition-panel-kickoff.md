# Kickoff — Build the Composition Panel into the Cockpit (real engine, real audio)

**Repo:** `mcp-tool-shop-org/ai-jam-sessions`, local `E:/AI/ai-jam-sessions`. **App:** `apps/cockpit/` (Vite browser app). CI-green on `main`.

## Why this exists (read before touching anything)

The composition engine shipped this session and is solid: `src/compose/` — the deterministic voice-leading gate (`voice-leading.ts`), membership-by-construction voicing-spec (`voicing-spec.ts`), part-at-a-time refinement (`refine.ts`), the style presets (`style.ts`), and the real panel backend (`panel-run.ts` + `compose-panel-tool.ts` + the `compose_panel` MCP tool). Tested, CI-green on `main`. **That is the product.**

The UI was prototyped in a standalone Claude Design HTML mock (`Composition Panel.dc.html`). **The mistake:** a disconnected HTML file cannot reach the app's real audio engine, so it fell back to crude WebAudio oscillator beeps — embarrassing for a tool whose whole point is sound. The *interaction design* is good and transfers (pairwise A/B + a reference clip for the human panel; result/ranking/history/compare for the LLM panel). The beep synth and the cheap "$0 proxy" language get thrown away.

**Durable lessons (do not repeat):**
- **Audio quality is a first-class, user-facing requirement.** Build in the real app and play through the real engine — never a bespoke oscillator synth when the studio's sampled keyboard exists.
- Human-audio judging is **pairwise A/B**, not four-at-once (you can only hear one thing at a time). A **reference clip** (the tune) lets a non-expert judge "which backing fits."
- The **human-audio panel is its own quality tool** — do not clutter it with LLM-proxy framing.

## The mission

Build the Composition Panel into `apps/cockpit/` as a new **Panel** mode (third header mode beside Instr / Vocal), wired to (1) the cockpit's **real audio engine** and (2) the **real compose backend**. Two sub-modes:
- **LLM panel** — the local-LLM directional smoke-screen (the existing `compose_panel` backend).
- **Human-audio** — the real by-ear quality claim: a blind pairwise A/B audition judged against a reference tune.

**Non-negotiable:** every note the panel plays — the reference tune, A/B, per-song drill-down, ranking playback — goes through the **same high-quality engine the cockpit's piano roll and keyboard already use**. Quality parity with the roll is the acceptance test.

## First move (audit before building)

Read, in order:
1. `docs/compose-panel-app-design-prompt.md` — the interaction/visual spec (the honest framing, the data contract, the brand tokens).
2. `src/compose/`: `compose-panel-tool.ts`, `panel-run.ts`, `bws.ts`, `realize.ts`, `refine.ts`, `ollama-spec-realizer.ts` — the real backend + the four systems (floor / nearest / refined / engine).
3. `apps/cockpit/`: `src/main.ts`, `src/state.ts`, `src/transport.ts`, `src/synth.ts`, `src/vocal-synth.ts`, `index.html` — **how the app makes sound**, and how modes + state + persistence work.
4. `src/sample-engine.ts`, `src/piano-voices.ts`, `src/sfz-parser.ts`, `src/audio-engine.ts` — the sampled keyboard (Concert Grand / SFZ / voices / tuning).

**Then decide the highest-quality in-browser keyboard path the repo already has, and REUSE it.** If the sampled voices (Concert Grand / SFZ) are reachable in the browser, prefer them; otherwise reuse exactly what `synth.ts` / the piano roll use. The panel must sound identical to playing notes in the roll. **No new oscillator synth.**

## Slices (commit per slice, gate CI)

1. **Panel mode shell** — a third header mode (Instr / Vocal / **Panel**), reusing the cockpit's mode/state/persistence + brand tokens. An empty Panel view + the run-config rail. Additive; do not rewrite the app.
2. **Real audio primitive** — one shared "play these voicings / this melody through the cockpit engine" function, reused everywhere. **Verify sound parity with the roll before proceeding.**
3. **Human-audio audition (priority)** — pairwise **A/B** with a **reference clip = the song's REAL melody** (from the library right-hand), each side = melody + one real voicing, played on the real engine. Blind, shuffled A/B assignment, "which sounds better," aggregate to a Bradley-Terry ranking + the discrimination-floor gate + listeners-N. Voicings come from the `src/compose` realizers (`rootPositionRealization` / `nearestToneRealization` / `refineRealization`) and the engine = `RefiningProposer(OllamaSpecRealizer)`.
4. **LLM panel mode** — wire to the real `runComposePanelTool` (via local Ollama, the `compose_panel` path). Render the result / ranking / history / compare. Per-song drill-down plays real voicings on the real engine.
5. **Shared surfaces** — the diverging ranking chart (CI whiskers, negatives left of zero), per-system tiles, the floor-gate pill, History (panelType chips: human vs LLM), Compare (the proxy-vs-truth concordance: Kendall τ + engine-rank match), all phrased cleanly.
6. **De-clutter + honesty** — remove every "$0 proxy" / "quality: N/100"; keep the honest framing intact (floor gate; uninterpretable + inconclusive are first-class outcomes; human = the quality claim, honest about N; LLM = directional only).

## Audio requirements (the crux — this is what failed last time)

- Every play button uses the cockpit's real engine. **Acceptance test: it sounds as good as playing notes in the piano roll.**
- **Reference clip = the song's actual melody** (library `rightHand`), not a generated chord-tone line.
- **A vs B = the SAME melody + two different real voicings** — the only audible difference is the accompaniment voicing, so the judgment is clean and a non-expert can make it.

## Data (real, not mock)

- Songs: the real library (`src/songs`). Voicings: the `src/compose` realizers + the engine proposer. Melody: the library `rightHand`.
- LLM mode: the real `compose_panel` backend (local Ollama judges — none the qwen generator family). Human mode: real voicings, real audio, real by-ear votes aggregated live.

## Honesty framing (keep it, clean it)

- The discrimination-floor gate stays: if even a human can't rank the theory-valid voicing over the theory-invalid floor, the run is **UNINTERPRETABLE**. `INCONCLUSIVE` stays first-class.
- Human-audio = the quality claim, honest about N: **1 listener = your blind preference; ≥3 independent = the robust claim.** Never "quality: N/100".
- LLM = directional only. The Compare view answers "does the cheap proxy track the human truth?" (Kendall τ over the rankings + engine-rank match) — phrased professionally, no "$0" tags.

## Guardrails

- **Do NOT touch** frozen `inferChord` (`src/songs/jam.ts`), the E-R `sourceChords` baseline, or the Gate-2 snapshot. Keep `src/compose/` decoupled (it imports only pure parsers + the analysis type).
- Reuse the cockpit's existing modules (state, transport, persistence, synth, brand tokens) — additive, do not rewrite the app.
- Commit per slice; tests ship with code; gate CI (`gh run watch <id> --exit-status`, no `| tail`); `git revert` is the compensator. Include a **six-standards compliance** section in the receipt.
- $0 / local / deterministic first. Any pod / paid panel / publish / version bump is a director priced-ask.

## Deliverables

- The **Panel** mode live in `apps/cockpit/`, playing through the real audio engine, both sub-modes working, tested, CI-green on `main`.
- Receipt `docs/cockpit-composition-panel-receipt.md` + a memory update.

## Reference artifacts

- Interaction/visual: `docs/compose-panel-app-design-prompt.md` + the throwaway mock `Composition Panel.dc.html` (view it for the *layout only* — discard its beep synth and its "$0" language).
- Backend: `src/compose/` (`compose_panel` MCP tool, `runComposePanelTool`, `runVoiceLeadingPanel`).
- The measured findings the panel visualizes: `docs/music-wing-phase2-s2-style-membership-refine.md`.
