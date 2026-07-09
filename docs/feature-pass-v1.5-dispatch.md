# AI Jam Sessions — Feature-Pass Dispatch (v1.4.3 → v1.5.0 arc)

**Date:** 2026-07-09 · **Coordinator:** Fable 5 advisor session · **Repo:** `mcp-tool-shop-org/ai-jam-sessions` @ `637150d` (main, clean)
**Status:** **APPROVED by the director 2026-07-09** (Law-8 gate passed): build list + wave order approved; CUD triad approved for the scored overlay; cockpit→Pages approved (iteration 5); harvest STAGED (pilot → review → bulk); housekeeping delegated (executed: #9/#11/#6 closed, #17 merged → main `2a5c7bb`). Save-point tag: `pre-feature-pass-v1.5`.
**Scope:** dogfood-swarm Feature Pass (Phases 5–8), two tracks: (1) cockpit → real composition tool; (2) April Tier-1 teaching loop. Study-swarm grounded (5 questions, 5 parallel research agents, 44 retrieval-backed findings + 1 gap note).

---

## Standards compliance (six workflow standards, scored 0–3)

| Standard | Score | Evidence / remediation |
|---|---|---|
| PIN_PER_STEP | 2 | Research-agent prompts + models recorded in the session transcript; execution waves will pin model (Sonnet) + byte-exact wave prompts in per-wave dispatch blocks appended to this file. Remediation to 3 (optional): `study-swarm lock` once waves complete — owner: coordinator, Phase 9. |
| ANDON_AUTHORITY | 2 | Halts enforced: citation gate HALTs per-finding on FABRICATED/MISATTRIBUTED/CANNOT_CONFIRM (protocol Step 4); build gate (`pnpm verify` + cockpit typecheck/build) after every wave — a red build halts the next wave; Fable adversarial lenses can block a wave's merge. |
| NAMED_COMPENSATORS | 2 | Compensators table below covers every world-touching action in THIS dispatch's scope (feature waves). Phase-10 irreversibles (npm publish, gh release, HF push, Zenodo) get their own NO-skip compensators table in the Phase-10 dispatch before any of them run. |
| DECOMPOSE_BY_SECRETS | 3 | Wave boundaries derived from the audited collision map (below): volatile cockpit monolith isolated behind a module-split wave; server transport cluster (metronome/recording/practice-loop) grouped under one owner because they change together; isolated surfaces (piano-roll.ts renderer, scripts/dataset) parallelized. |
| UNCERTAINTY_GATED_HUMANS | 3 | Law-8 gate: this entire dispatch stops for the director BEFORE any code. Checkpoints after iterations 2 and 4. Decision list surfaced contrastively (e.g. "ROADMAP says red/green; evidence says CUD-safe palette — approve deviation?"). |
| EXTERNAL_VERIFIER | 3 | Citations gated through the live `roleos verify-citations` → prism v1.6.0 runner (Crossref/arXiv retrieval oracle + `mistral-small:24b` groundedness, family-different from the Anthropic synthesizer, reasoning-stripped). Verdict `escalate` advisory, **0 fabricated / 0 refused**; prism receipt `prism-01kx3gd20ztptqjbqbw9tq8gtn`, Ed25519 **public-key-verified** (`signature_valid: true`, kid ed25519-82b62c2eae235b96). The gate discriminated: first run REFUSEd on 2 malformed Frontiers DOI forms (URL-suffix extraction artifacts) → corrected once → both resolve. Code waves: Sonnet executes, Fable verifies (studio convention; same-vendor, different model — honest ceiling noted). |

---

## Research grounding (the dispatch's empirical floor)

Five load-bearing design questions, one research agent each, parallel dispatch, retrieval-backed only (agents were forbidden parametric-memory citations). Findings are numbered; the build list cites them by number.

### Q1 — Undo/redo architecture

1. **Command-object undo is the canonical architecture for graphical editors; anything beyond linear undo requires semantic dependency resolution.** Berlage 1994 (https://dl.acm.org/doi/10.1145/196699.196721). Implication: per-operation do/undo command stack; linear-only.
2. **Low-level input events aggregate under one hierarchical top-level command that is the unit of undo.** Myers & Kosbie 1996 (http://www.cs.cmu.edu/~amulet/papers/commandsCHI.html). Implication: a drag/resize commits ONE command (original + final geometry) on pointer-up; multi-note operations are one command per gesture.
3. **Undo semantics (backtrack vs toggle) must be explicitly designed to match users' mental models — undo is not "just another command."** Abowd & Dix 1992 (https://academic.oup.com/iwc/article-abstract/4/3/317/730147). Implication: Ctrl+Z backtracks; redo stack cleared on any new edit; no branching.
4. **Shipped-editor convention: bounded history (Photoshop default 50, configurable to 1000, documented memory cost) or delta-based unlimited (Ableton).** Adobe (https://helpx.adobe.com/photoshop/using/performance-preferences.html); Ableton (https://help.ableton.com/hc/en-us/articles/209769125). Implication: ~100-entry stack of per-command deltas; full-score snapshots only for Clear/Import commands.
5. **Confirmation dialogs habituate within a few exposures and stop protecting.** Bravo-Lillo et al. 2013, SOUPS (https://cups.cs.cmu.edu/soups/2013/proceedings/a6_Bravo-Lillo.pdf). Implication: the Stage-C `confirm()` on Clear is a known-failing pattern once undo exists.
6. **Recovery (undo) beats prevention (warnings) for destructive actions.** Raskin 2007, A List Apart (https://alistapart.com/article/neveruseawarning/). Implication: Clear/Import become undoable commands with an undo affordance; retire their confirm()s (Reset keeps confirm — it wipes saved storage, outside undo's reach).
7. **Selective undo defies simple user models even in research systems.** Cass, Fernandes & Polidore 2006, NordiCHI (https://dl.acm.org/doi/10.1145/1182475.1182478); corroborating: Myers et al. 2015, CHI (https://dl.acm.org/doi/10.1145/2702123.2702543). Implication: v1 ships strictly linear undo.
8. **Proven autosave+undo coupling: persistence keys off the undo manager's change count; saving never truncates history.** Apple Document-Based App Programming Guide (https://developer.apple.com/library/archive/documentation/DataManagement/Conceptual/DocumentBasedAppPGiOS/ChangeTrackingUndo/ChangeTrackingUndo.html). Implication: persist to localStorage after every command execute/undo/redo; never clear the stack on save.

### Q2 — Musical time representation (the BPM bug)

9. **MIDI stores note times as tempo-independent ticks (PPQ); tempo is a separate meta event — "time per beat … allows absolutely exact long-term synchronisation."** Standard MIDI Files 1.1 (https://midimusic.github.io/tech/midispec.html). Implication: store musical time; a BPM change touches zero note records.
10. **MusicXML likewise separates integer `divisions` durations from `sound tempo`.** W3C MusicXML 4.0, 2021 (https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/divisions/). Implication: both interchange standards agree; seconds-in-document has no precedent.
11. **DAWs default content to a musical (beats) timebase; absolute-time is an explicit opt-in ("Warp off" / "time" timebase).** Ableton Live 12 manual (https://www.ableton.com/en/manual/audio-clips-tempo-and-warping/); REAPER timebase guide (https://music.tutsplus.com/how-to-use-reaper-tempo-grid-and-snap-settings--cms-107661t). Implication (failure mode): our bug is "time timebase" involuntarily applied to musical content.
12. **JS timers skew by tens of ms; the correct pattern is a ~25 ms tick scheduling ~100 ms ahead against `AudioContext.currentTime`.** Wilson 2013, web.dev (https://web.dev/articles/audio-scheduling). Implication: transport converts beats→seconds only inside a lookahead window; a live BPM change takes effect within ~one lookahead, no stored-data rewrite.
13. **Peer-reviewed confirmation: setTimeout/setInterval jitter is unsuitable for musical timing; schedule on the Web Audio clock.** Wyse & Subramanian 2013, Computer Music Journal 37(4) (https://lonce.org/Publications/publications/comj_a_00213.pdf). Implication: replaces the cockpit's fire-and-forget whole-score scheduling and its wall-clock `setTimeout` vowel switches.
14. **Ticks↔seconds conversion requires a tempo-map utility (piecewise over tempo changes).** Melanchall DryWetMIDI docs (https://melanchall.github.io/drywetmidi/articles/high-level-managing/Tempo-map.html). Implication: one `beatsToSeconds()/secondsToBeats()` utility now; rescale-on-BPM-change is only correct for a single global tempo and breaks permanently once mid-score tempo changes exist.
15. **Persisted-document schema changes are handled by an integer version + conditional upgrade on load.** MDN, Using IndexedDB (https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB). Implication: cockpit persistence already has this pattern (v1→v2 funnel) — bump to v3 with a one-time idempotent seconds→beats migration using the saved BPM.

### Q3 — Live capture + quantization

16. **10 ms constant latency is acceptable to performers; 20 ms, or 10±3 ms of jitter, significantly degrades rated quality — jitter ≈ doubled latency.** Jack, Stockman & McPherson 2016, Audio Mostly (http://eecs.qmul.ac.uk/~andrewm/jack_am2016.pdf). Implication: prioritize a stable timestamp path over shaving mean latency; never timestamp at handler execution time.
17. **Latency JND ≈ 20–30 ms, strongly style-dependent.** Mäki-Patola & Hämäläinen 2004, DAFx (https://www.dafx.de/paper-archive/2004/P_011.PDF). Implication: ≤20 ms action-to-sound budget for live preview; slow lesson content buys headroom.
18. **Web MIDI `timeStamp` is normatively the system-receipt time on the `performance.now()` timebase, not handler-run time.** W3C Web MIDI API WD 2025 (https://www.w3.org/TR/webmidi/). Implication: trust `event.timeStamp`; convert to transport time via a sampled performance→AudioContext clock offset.
19. **Failure mode: Firefox coarsens `Event.timeStamp` to 2 ms buckets (100 ms under resistFingerprinting).** MDN (https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp). Implication: detect 100 ms-bucketed timestamps and warn/degrade rather than write garbage onsets.
20. **QWERTY keypress→USB latency measures 15–60 ms (median ~30 ms).** Luu 2017 (https://danluu.com/keyboard-latency/). Implication: per-source recording offset calibration; expect QWERTY noise ≫ MIDI.
21. **Matrix keyboards silently drop certain ≥3-key combinations (ghosting).** Microsoft Applied Sciences anti-ghosting demo (https://www.microsoft.com/applied-sciences/projects/anti-ghosting-demo). Implication: filter `event.repeat`; don't design QWERTY chord capture beyond 2–3 simultaneous notes.
22. **Expressive timing defeats naive grid rounding; quantization is inference toward small-integer ratios, not snapping.** Desain & Honing 1989, Computer Music Journal (https://www.researchgate.net/publication/254892868_The_Quantization_of_Musical_Time_A_Connectionist_Approach). Implication: record raw; the quantized score is a derived view.
23. **Industry standard: quantize is non-destructive with original timing recallable, plus a strength % that moves notes partially toward the grid.** Apple Logic Pro (https://support.apple.com/en-ca/guide/logicpro/lgcp47452db8/mac); Ableton Live 12 (https://www.ableton.com/en/live-manual/12/midi-tools/). Implication: store raw + reversible quantize attribute; default 100% strength for teaching legibility, adjustable.
24. **Sensorimotor synchronization requires prior reference intervals (automatic phase correction + cognitive period correction).** Repp 2005, Psychonomic Bulletin & Review (https://link.springer.com/article/10.3758/BF03206433). Implication: count-in is functional, not cosmetic — minimum one full audible bar before recording starts.
25. **DAW convention: configurable count-in (1 bar typical) + a "click only during count-in" metronome mode.** Apple Logic Pro recording/metronome settings (https://support.apple.com/guide/logicpro/recording-project-settings-lgcpbc10f1ea/mac and https://support.apple.com/guide/logicpro/metronome-project-settings-lgcpe1d6118e/mac). Implication: default 1-bar count-in; expose bars + click-only-during-count-in.

### Q4 — Practice pedagogy + scored feedback

26. **Piano Tutor's design: "intelligent feedback and help rather than just listing all errors."** Dannenberg et al. 1990 (https://www.cs.cmu.edu/~rbd/bib-ptutor.html). Implication: the scored overlay ranks/limits surfaced errors (worst measures first), not paint-every-deviation.
27. **CAMIT's highest-value target is unsupervised daily practice: motivation + objective analysis when no teacher is present.** Percival, Wang & Tzanetakis 2007 (https://dl.acm.org/doi/pdf/10.1145/1290144.1290156). Implication: PracticeLoop + scoring is the evidence-aligned core, not a nice-to-have.
28. **Feedback meta-analysis (607 effect sizes): average d = 0.41, but over one-third of interventions DECREASED performance; task-focused feedback helps, self-focused harms.** Kluger & DeNisi 1996 (https://cris.huji.ac.il/en/publications/the-effects-of-feedback-interventions-on-performance-a-historical/). Implication: overlay marks and copy reference notes/timing only — no grades, no ability language.
29. **Guidance effect: feedback after every trial aids acquisition but breeds dependency and worse retention; reduced-frequency feedback learns better.** Winstein et al. 1994 (https://pubmed.ncbi.nlm.nih.gov/7886280/); Anderson et al. (https://pmc.ncbi.nlm.nih.gov/articles/PMC1780106/). Implication: show the scored overlay AFTER the take, never during; fade feedback frequency as accuracy rises.
30. **Expert practice = precisely locate errors, loop target segments until corrected, vary tempo systematically.** Duke, Simmons & Cash 2009 (https://journals.sagepub.com/doi/10.1177/0022429408328851). Implication: one-click "loop worst measures, slower" is exactly the evidenced strategy; ramp tempo only after clean passes.
31. **Deliberate practice requires designed tasks with informative feedback (effect real, smaller than 1993 estimate).** Macnamara & Maitra 2019 (https://pmc.ncbi.nlm.nih.gov/articles/PMC6731745/). Implication: every practice-loop pass carries an explicit micro-goal (measures + tempo).
32. **Timing JND ≈ 6 ms absolute for IOIs < 240 ms, ≈ 2.5% of IOI for 240–1000 ms.** Friberg & Sundberg 1995, reported in Frontiers in Psychology 2017 (https://doi.org/10.3389/fpsyg.2017.01709). Implication: score timing windows as percent-of-beat with a floor clamp; never demand sub-JND precision.
33. **MIR standard onset-correctness window: 50 ms (100 ms under noisy alignment).** Snapping Matters (https://arxiv.org/pdf/2606.11903); transformer transcription tolerance (https://arxiv.org/pdf/2204.03898). Implication: defensible defaults — green ≤50 ms, orange 50–150 ms, red = miss/wrong pitch; loosen for beginners.
34. **Audible click improves accuracy, but players drift off tempo when the click is removed.** Bock & Duke 2026, ISME (https://ojs.library.queensu.ca/index.php/ISME/article/view/20690). Implication: metronome + count-in for recording now; a click-dropout mode later to train internal tempo (counters guidance dependency, finding 29).
35. **Gamified points/badges shift attention to rewards and undermine learning.** Jose et al. 2024, Frontiers in Education (https://doi.org/10.3389/feduc.2024.1474733). Implication: scores present as per-measure diagnostic maps + a next step; NO points/streaks/leaderboards.
36. **Falling-note guidance teaches the piece, not the skill (survey of augmented-piano prototypes).** Deja et al. 2022 (https://arxiv.org/abs/2208.09929). Implication: the piano-roll overlay is a post-take diagnostic, not real-time note guidance.
37. *Gap note (honest ceiling):* no peer-reviewed controlled efficacy study of Yousician/Simply Piano was retrievable; commercial-app efficacy claims stay out of this dispatch.

### Q5 — Touch/pointer + accessibility

38. **Pointer Events L3: `setPointerCapture()` routes the pointer stream to the capturing element until release — one model for mouse/pen/touch.** W3C Recommendation, 2026 (https://www.w3.org/TR/pointerevents3/). Implication: `pointerdown` + capture replaces the window-level mouse listeners in all 5 handler sites.
39. **Failure mode: pan/zoom are NOT preventable pointer-event defaults; without `touch-action`, the browser claims the gesture and kills the drag via `pointercancel`.** Pointer Events L3 (same spec, direct-manipulation + §4.1.3). Implication: `touch-action: none` on the roll; handle `pointercancel` with state rollback.
40. **WCAG 2.2 SC 2.5.7 Dragging Movements (AA): every drag function needs a single-pointer NON-dragging alternative — keyboard alone does not satisfy it.** W3C Understanding (https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html). Implication: ship tap-select → tap-destination move and nudge buttons alongside drag.
41. **WCAG 2.2 SC 2.5.8 Target Size (AA): pointer targets ≥24×24 CSS px; empirical thumb studies recommend ~9.2 mm (≈35 px).** W3C (https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html); Parhi, Karlson & Bederson 2006, MobileHCI (https://dl.acm.org/doi/10.1145/1152215.1152260). Implication: padded ≥24 px hit zones on notes/resize handles (~35 px comfortable at default zoom); ~44 px transport/ruler controls.
42. **WCAG 1.4.1 + Color Universal Design: ~8% of males are red-green colorblind; color may not be the only channel.** W3C (https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html); Okabe & Ito 2008 (https://jfly.uni-koeln.de/color/). Implication: the scored overlay uses a CUD-safe triad (vermilion / orange / bluish-green) PLUS a per-state shape/pattern cue — deviating from ROADMAP's literal "red/green."
43. **Interaction-triggered large-surface panning must respect `prefers-reduced-motion` (WCAG 2.3.3).** MDN (https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion); W3C Understanding (https://www.w3.org/WAI/WCAG21/Understanding/animation-from-interactions.html). Implication: auto-scroll follows the playhead with smooth scroll normally, instant page-jump under reduced-motion, plus a follow toggle.
44. **ARIA APG grid pattern: composite widget = one tab stop, roving focus, arrow-key operation; WCAG 2.1.1's path exception does not cover endpoint-based move/resize.** W3C APG (https://www.w3.org/WAI/ARIA/apg/patterns/grid/); WCAG 2.1.1 (https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html). Implication: the roll is one tab stop; arrows nudge pitch/time, Shift+Arrow resizes (already partially present — extend, don't replace).
45. **Composers find rigid structure-enforcing input impedes composing; fluid input with structure reinstated later is preferred on interactive surfaces.** Cavez et al. 2024, CHI (https://dl.acm.org/doi/10.1145/3613904.3642079). Implication: on touch, favor fluid drag with deferred quantize/snap over modal precision entry.

---

## Current state (audited 2026-07-09, three parallel read-only audits; file:line refs)

**Cockpit (`apps/cockpit/`):** `main.ts` is a 1740-line monolith (globals: `score`, `selectedNote`, `bpm`, `playPosition`, …); only `synth.ts` (851), `vocal-synth.ts` (519), `persistence.ts` (155, DOM-free, schema v2 with v1→v2 migration funnel) are separate. Notes store **absolute seconds** (`startSec/durationSec`, main.ts:30-40); `PX_PER_SEC=120` constant. **BPM bug confirmed and worse than reported: the BPM control changes gridlines/quantize/nudge/default-duration only — it affects NEITHER note geometry NOR playback tempo** (handler main.ts:1249-1256; playback uses raw seconds at main.ts:1069-1086). 4/4 hardcoded (main.ts:552). Transport: play/stop only (no real pause), whole-score fire-and-forget scheduling on `AudioContext.currentTime` (good clock, wrong pattern), vowel switches on wall-clock `setTimeout` (drift), loop = recursive `play()` 0→end, playhead hidden on stop (main.ts:1102), **no seek, no auto-scroll**. Input: mouse-only across 5 handler sites, window-level drag listeners, **no Esc-cancel**. Selection: single note; no copy/paste. Velocity: inspector slider only; `.vel-bar` CSS confirmed dead (index.html:93-96, zero TS refs). Live input (QWERTY/on-screen/Web-MIDI) converges on `midiKeyDown`→`activeNoteOn/Off` and **never touches the score** — capture is greenfield with one clean interception point. Initial view: roll top = C7 while QWERTY maps C4 (nothing sets scrollTop). `?` shortcuts overlay EXISTS (Stage C; main.ts:972-978) — kickoff's "add cheat-sheet" item is already done. Three confirm() dialogs: Clear, Reset, Import. Cockpit is **not in the npm tarball, not deployed to Pages** — run-from-clone only. No DOM test rig; `main.ts` untestable as-is (top-level `boot()`).

**Server (Track 2, `src/`):** Two playback engines share the `VmpkConnector` seam (types.ts:213): `SessionController` (session.ts, library songs) and `PlaybackController`/`MidiPlaybackEngine` (playback/, .mid files — wall-clock setTimeout scheduler). **Metronome: does not exist** (all grep hits are visual dots / feedback text). **RecordingConnector/getRecording: do not exist; no live-performance data path** — but `createWrappedConnector` (controls.ts:342) already intercepts noteOn/noteOff to emit events: the natural recording buffer point. The library path emits nothing (needs its own adapter synthesizing timestamps at session.ts:441). **`scorePerformance` is production-ready but orphaned** (score-performance.ts:182; greedy match, `toleranceMs` default 150, per-note verdicts + feedback; only caller = `score_performance` MCP tool reading a user-supplied .mid at mcp-server.ts:2528, + 15 tests). **renderScoredPianoRoll: does not exist**; `renderPianoRoll` (piano-roll.ts:261) is pure SVG with a `colorMode: "hand"|"pitch-class"` axis — a verdict color mode extends the note loop (:438-468). **PracticeLoop: does not exist**; hooks have `onMeasureStart` but no repeat directive; measures + named `Section{startMeasure,endMeasure}` exist; `play_song` already takes `speed/tempo/mode/startMeasure/endMeasure`; **no tempo-ramp anywhere**. Annotations: exactly **24/120 ready** (classical 10, rnb 4, ten genres 1 each — ROADMAP confirmed verbatim); `annotate_song`/`score_annotation`/`annotation_progress` tools exist (single-song, human-in-the-loop; annotate persists to the user dir); **no batch harvester**. Tests post-health-pass: mcp-server.test.ts has 15 tests (thin for 42 tools), **cli.test.ts does not exist**; session/teaching/playback/scoring well covered elsewhere.

**Collision map (drives the wave shape):** cockpit features all mutate `main.ts` → **cockpit waves are single-writer until a module split lands**. Server: metronome/recording/practice-loop collide across `session.ts` + `playback/controls.ts` + `mcp-server.ts` (`play_song` handler) + `types.ts` → one owner per wave for that cluster; `piano-roll.ts` (overlay) and `scripts/`+`songs/` (harvest) are isolated and parallel-safe.

**CI gap:** `ci.yml` paths do NOT include `apps/**` or `scripts/**` — cockpit-only changes run zero CI, and cockpit typecheck/build is never verified. Fix rides the first cockpit wave.

**Dataset gates:** checksums 274/274 hashes OK but `checkManifestCompleteness` (package-public.ts:1372) asserts `pair_count + standalone_count === record_count` while `countPairs` counts prompts (57 pairs ×2 + 1 = 115) — **checker units bug, data is fine**; gates the dataset publish + HF workflows. Release gate: Aggregate PASS on the canonical slice21 baseline (bare CLI defaults to the slice19 regression baseline, which is documented to FAIL).

---

## The build list (waves; every item cites its findings)

Model policy: Sonnet executes every wave; Fable runs 3 adversarial verifier lenses + judge after each; coordinator authors all public surfaces. Build gate after every wave: `pnpm verify` + cockpit `tsc --noEmit` + `vite build` (once CI'd). Save-point tag before iteration 1.

### Iteration 1 (4 parallel lanes)

**Wave C0 — Cockpit foundations (SOLO cockpit agent; the unlock).**
- Module split of `main.ts` → `state.ts` (score model + mutation API — the undo seam), `transport.ts`, `editor.ts` (input), `roll.ts` (render), `main.ts` as thin wiring. No behavior change; `pure-logic.test.ts` grows against the new seams.
- **Beat-based time model** [9, 10, 11, 14]: `Note{startBeat, durationBeats}`; `beatsToSeconds()/secondsToBeats()` tempo utility (single global BPM now, tempo-map-shaped); BPM change retimes grid AND playback correctly.
- Lookahead scheduler [12, 13]: replaces whole-score fire-and-forget + wall-clock vowel timers; enables seek/loop-region later.
- Persistence **schema v3** + one-time idempotent v2 seconds→beats migration using saved BPM [15]; keep reading v2 forever, never write v2.
- Initial scroll centers C4 (audit Q10); real pause (playhead stays visible, position retained).
- **CI fix:** add `apps/**` + `scripts/**` to ci.yml paths + a cockpit typecheck/build/test job.

**Wave S1 — Metronome + recording spine (one server agent).**
- `MetronomeEngine` (accented beat 1, synced to `effectiveTempo()`), count-in (default 1 bar, click-only-during-count-in option) [24, 25, 34].
- `RecordingConnector` buffering `MidiNoteEvent[]` in `createWrappedConnector` + `getRecording()` on `PlaybackController`; library-path adapter on `SessionController` (synthesized timestamps).
- Owns `session.ts`, `playback/controls.ts`, `types.ts` this wave (collision cluster).

**Wave S2 — Scored piano-roll renderer (one agent, isolated).**
- `renderScoredPianoRoll(song, performanceResult, options)` extending the note loop with a verdict color mode: **CUD-safe triad (vermilion/orange/bluish-green) + per-state glyph/pattern** (X = missed, hollow outline = timing, solid = correct) [26, 28, 33, 42]; worst-measures-first summary ranking [26]; timing windows as %-of-beat, clamped, defaults green ≤50 ms / orange 50–150 ms [32, 33]. Renderer + tests only — NO mcp-server.ts edits this wave.

**Wave X1 — Quick fixes (one agent, tiny).**
- Checksum completeness formula fix (`pair_count*2 + standalone_count`) + a real-shape test.
- Move `pnpm.overrides` to pnpm-workspace.yaml (pnpm 11 ignores the package.json field; CI's pnpm 9 still reads it — forward-compat fix).

### Iteration 2

**Wave C1 — Undo/redo (SOLO cockpit agent).**
- Command stack on the state.ts mutation API: do/undo for add/delete/move/resize/velocity/vowel/breathiness/clear/import [1]; gesture-coalesced (one command per drag, committed on pointer-up) [2]; linear backtrack, redo cleared on edit [3, 7]; ~100 delta entries, snapshots only for Clear/Import [4]; persist on every execute/undo/redo, never truncate on save [8].
- Retire Clear/Import confirm()s → undoable commands + undo toast [5, 6]; Reset keeps its confirm.
- Ctrl+Z / Ctrl+Shift+Z (+ Ctrl+Y); keydown handler currently bails on Ctrl — carve the exception.

**Wave S3 — Practice loop + the scoring wire-up (one server agent; owns mcp-server.ts/cli.ts this wave).**
- PracticeLoop: `(startMeasure, endMeasure, suggestedTempo)` honored in loop mode; **tempo ramp** (start slow, +5%/clean pass toward target) [30, 31]; worst-measures → drill recommendation from `PerformanceResult` [26, 30].
- Recording→scoring path: after `play_song` with `record:true`, `getRecording()` → `scorePerformance()` → response includes per-measure diagnostic + optional scored-roll SVG [27, 29 — post-take only, task-focused copy per 28, no gamification per 35, overlay is diagnostic not guidance per 36].
- New/extended MCP tools + CLI flags registered HERE (single owner): `play_song{metronome, countIn, record, ramp}`, `practice_loop`, `view_scored_piano_roll`; CLI equivalents. Micro-goal line in loop output [31].
- `cli.test.ts` started: arg parsing + dispatch for the new flags (chips at the Tier-1 test-coverage gap).

→ **Fable adversarial pass over iterations 1–2, then CHECKPOINT with Mike.**

### Iteration 3

**Wave C2a — Transport surface (cockpit).** Time-ruler (click-to-seek, drag = loop region, ~44 px controls [41]); loop-region playback (replaces 0→end recursion); auto-scroll follow with reduced-motion + toggle [43]; playhead visible while paused.
**Wave C2b — Pointer + touch + a11y (cockpit; runs after/with C2a under explicit file-region ownership — persistence.ts single-owner, index.html regions split).** Pointer Events + `setPointerCapture` at all 5 sites [38]; `touch-action:none` + `pointercancel` rollback [39]; Esc-cancel drag; ≥24 px padded hit zones (~35 px at default zoom) [41]; non-drag alternatives: tap-tap move + nudge buttons [40]; roving-focus arrow editing extended (Shift+Arrow resize) [44]; deferred-snap fluid drag on touch [45].
**Wave D1 — Harvest harness + pilot (isolated).** `scripts/annotate-batch.ts`: MIDI analysis + LLM musicalLanguage draft → `score_annotation` QA gate → only ≥threshold annotations land; writes repo `songs/library/*.json`. Pilot on 2 one-song genres (~20 songs), quality report to Mike before bulk.

### Iteration 4

**Wave C3 — Record-arm capture (cockpit).** Record-arm toggle + count-in click (cockpit-side, from its own synth); capture QWERTY/on-screen/MIDI via the `midiKeyDown` seam; timestamps from `event.timeStamp` mapped by sampled performance→AudioContext offset [16, 18]; raw stored + quantize-as-view with strength % (default 100%) [22, 23]; per-source offset calibration [20]; `event.repeat` filtered, chord cap noted [21]; Firefox coarse-timestamp detection [19]; recorded take commits as ONE undoable command [2].
**Wave C4 — Multi-select + clipboard (cockpit).** Marquee/Shift-click multi-select, copy/paste/duplicate, group drag as one command [2] — kills the ~100-clicks-per-8-bars pain.
**Wave D2 — Bulk harvest** (staged by genre, same QA gate, if pilot quality approved).

### Iteration 5 (polish + close-out)

**Wave C5 — Cockpit polish.** `.vel-bar` velocity visual (dead CSS wired); audible preview on pitch-drag/velocity edit (blind-edit fix); `prefers-reduced-motion` sweep.
**Optional (decision D3): cockpit deployed to Pages** under /cockpit/ (Vite static build into the pages workflow) — makes the composition tool publicly usable.
Then **Phase 9** (full verify ×3 on flake-prone surfaces, CI green) → **Phase 10** (full treatment: shipcheck → 1.4.3→**1.5.0** + plugin manifests → README/CHANGELOG → **translations BEFORE tag** → landing/handbook → repo-knowledge scan → release via #12-OIDC-or-NPM_TOKEN decision).

---

## Compensators (this dispatch's scope — feature waves)

| Action | Compensator | Post-rollback state | Owner |
|---|---|---|---|
| Wave commits to main | `git revert <sha>` (waves land as discrete commits; save-point tag `pre-feature-pass-v1.5` before iteration 1) | Tree at pre-wave state; CI re-verifies | coordinator |
| Persistence schema v3 migration (user localStorage, one-way once written) | Reader keeps v2+v3 support forever; migration is idempotent + logged; export-JSON path unchanged (users can export before upgrading) | Old builds can't read v3 (accepted; documented in CHANGELOG) | C0 wave owner |
| CI paths change | `git revert` | Previous gating restored | coordinator |
| Song JSON annotation writes (D1/D2) | Per-genre commits; `git revert` per genre; QA-gate receipts kept in the wave log | Library at prior annotation state | D-wave owner |
| Agent token spend | none — bounded, owner-accepted (≤5 agents/wave, wave scope caps) | tokens spent | coordinator |
| Phase-10 irreversibles (npm publish, gh release, HF push, Zenodo, Docker) | **NOT in this dispatch's scope — separate NO-skip compensators table required in the Phase-10 dispatch before any of them run** | — | coordinator + Mike |

## Verification receipt (Step 4 — COMPLETE, 2026-07-09)

**Runner:** `roleos verify-citations <dispatch> --provider ollama` (role-os local clone `E:/AI/role-os`) → `prism verify --type citations` (prism v1.6.0 on PATH) → deterministic Crossref/arXiv retrieval oracle + RAG groundedness on `mistral-small:24b` (ModelFamily local, reasoning-stripped, family-different from the Anthropic synthesizer).

**Run 1 (REFUSE, blocking — the gate discriminating):** 2 findings flagged "no Crossref record" — both were *malformed-DOI extraction artifacts* (Frontiers URL suffix `/full` glued onto the DOI); 2 groundedness calls timed out (14 GB model cold-loading — correctly escalated, never read as fabrication). Correct-once path: both DOIs rewritten to `https://doi.org/...` form, independently confirmed against `api.crossref.org` first.

**Run 2 (final): verdict `escalate` — advisory, non-blocking. 0 fabricated, 0 refused; every parseable citation's existence RESOLVED.** Residual, surfaced per the CANNOT_CONFIRM contrastive rule:
- **11 × RETRIEVE FULL TEXT** (claim lives in the paper body / no abstract indexed): findings 1 (Berlage), 7 (NordiCHI), 24 (Repp), 27 (Percival), 30 (Duke), 32 (Friberg via Frontiers), 33 (both arXiv), 35 (Jose), 41 (Parhi), 45 (Cavez). **Out-of-band grounding: the Step-2 research agents retrieved these full sources this session** (publisher pages/PDFs) and extracted the claims from full text — the exact remediation the flag requests. Director may spot-check any of them; none is silently accepted.
- **21 × unparsed** (W3C/MDN/Apple/Ableton/vendor URLs — no arXiv/DOI): the documented arXiv/Crossref-tuned-oracle behavior; each URL was fetched by a research agent this session (retrieval-verified out-of-band).
- Multi-source items: only the first source per finding is runner-verified (documented limitation); second sources are corroborative.

**Receipts:** roleos `roleos-citation-receipt/v1` at `feature-pass-dispatch.citation-receipt.json` (citations_sha256 `202997a3…`, per-citation `retrieval_pins` with `source_sha256`); prism receipt **`prism-01kx3gd20ztptqjbqbw9tq8gtn`** → `prism replay` canonical export → `prism verify-receipt --public-key` → **`signature_valid: true`, exit 0** (Ed25519, kid `ed25519-82b62c2eae235b96`; keypair session-ephemeral in scratchpad — third-party verifiability, not anti-forgery, per prism's disclosed limit).
