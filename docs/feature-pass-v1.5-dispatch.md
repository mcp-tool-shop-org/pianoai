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

---

## Iteration-1 receipt (executed 2026-07-09)

**Execution:** 4 parallel Sonnet waves (exclusive ownership held — zero cross-wave file touches, verified by Lens C's tree-hygiene audit). Base `ae5f959`, save-point `pre-feature-pass-v1.5`.

| Wave | Scope shipped | Tests |
|---|---|---|
| C0 | main.ts monolith → state/time/transport modules; **beat time model** (BPM now retimes playback; grid fixed); lookahead scheduler (killed the latent never-worked vowel-timer bug); persistence v3 + saved-bpm migration; real pause; C4 centering; ci.yml apps/**+scripts/** paths + cockpit job | cockpit 19 → 112 |
| S1 | MetronomeEngine (accent, count-in, injectable audio); Recording taps on session + midi paths; SessionOptions{metronome,countIn,clickOnlyDuringCountIn,record} | +43 → +64 after fixes |
| S2 | `details.noteVerdicts` (%-of-beat windows, 50 ms floor); `renderScoredPianoRoll` (CUD triad + shape redundancy + focus strip); demo SVG coordinator-reviewed at full res — PASS | 26 → 57 → 70 after fixes |
| X1 | Checksum completeness ×2 units fix (+ real-shape tests); pnpm-overrides groundwork (found the pnpm-9 frozen-install break; partial-reverted, landed atomically below) | +2 |

**Adversarial verify (3 Fable lenses):** 1 CRITICAL — the new cockpit CI job resolved installs to the ROOT workspace (cockpit deps never installed; fixed structurally: apps/cockpit is its own single-package workspace + committed pnpm-lock.yaml + frozen install, proven from clean room). 3 HIGH — count-in ignored song tempo/time-sig/speed; Recording couldn't reconstruct nominal time (query-time speed + uncaptured tempoOverride); session pause/resume duplicated+shifted recorded measures (also existed unreported in hands mode — fixed both). 6 MEDIUM (migration-bpm clamp; panic-no-longer-silences regression; startedAtMs epoch; missing package exports + Session required-field break; scoredAtBpm pairing + INPUT_LIMIT blank render; tag-object SHA pin) + LOWs (loop-wrap hiccup — fixed exact-rebase; extras axis-widening — fixed). **All CONFIRMED findings fixed with tests by 2 Sonnet fix agents + coordinator; deferred: metronome accent-phase on resume (LOW), silent metronomeFactory rejection (LOW), title-clip + focus-strip prominence (C5 polish).**

**Coordinator infra commit:** pnpm 10 across all 5 CI pins (ci ×3, release, publish — release.yml was the lens catch that saved the next release), action pins → peeled v6.0.9 commit `0ebf4713…`, package.json legacy `pnpm` field removed (overrides live in pnpm-workspace.yaml only).

**Chips spawned (open):** `renderPianoRoll` missing from index.ts exports; loop-mode resume restarts whole range (S3-adjacent).

---

## Iteration-2 receipt (executed 2026-07-09)

**Execution:** Waves C1 (undo/redo — first attempt died on the 64k per-response output cap composing a mega-write; tree untouched, retried clean under chunked-write discipline) + S3 (practice loop + scoring wire-up), parallel Sonnet, exclusive ownership held. Mid-wave: the director ran both open chips as operator sessions — `renderPianoRoll` export landed, the loop-resume fix landed, **and the chip session found + fixed a third bug** (playRange's recording cursor skipped `toNominalSec` at speed≠1 — proven red-then-green). S3 was briefed mid-flight and built on all three.

**Shipped:** linear command stack (per-note deltas + Clear/Import full snapshots, gesture coalescing, depth 100) [findings 1–8]; Clear/Import confirm() → undoable + toast, Reset keeps confirm [5, 6]; Ctrl+Z/Shift+Z/Y + toolbar buttons. PracticeLoop (clean-pass-gated ramp 70→100% +5, windowed per-pass scoring, worst-measure targeting, micro-goal lines) [26, 29–31]; `play_song{metronome, countIn, record}`; new tools `practice_loop` / `practice_status` / `score_last_take` / `view_scored_piano_roll` (**42 → 46**); CLI `practice` + the first `cli.test.ts` (Tier-1 gap chipped).

**Adversarial verify (lenses D + E):** 3 HIGH confirmed + fixed — cross-command id invalidation in undo (fixed via id-preserving `restoreNote`/`replaceScoreWithIds` primitives; the whole delta-staleness class dies); CLI entry guard no-op through Unix symlinked bins (realpath fix + symlink-exec test + first dist-binary smoke); windowed songs rendered as empty SVG (renderer defaults now derive from actual measure numbers). Mediums fixed: loop-blind transport tools (pause/resume route into the loop, set_speed refuses against the ramp), score_last_take range capture + loop-take refusal, import-undo restores settings, toast a11y (opacity not display:none), slider-focus Ctrl+Z, boundary-nudge redo-wipe. LOWs fixed: practice CLI exit code, max-passes-reached honest status, stopActive teardown race, mid-drag undo guard, undo key-repeat. **Zero unfixed CONFIRMED findings.**

**Gate:** 62 files, **2051 passed + 1 expected skip** (win32 symlink), smoke 48/48, `node dist/cli.js --version` executes, cockpit typecheck/build green. Session arc: 1701 → 2051 tests.

---

# Study-swarm 2 — bulk harvest + iteration 4 (director-ordered, 2026-07-09)

Five load-bearing questions, five parallel research agents, retrieval-backed only. Findings continue the numbering (46–86). Director granted standing authority to proceed into execution after the citation gate.

## Research grounding — Q6: symbolic chord recognition (the harness's harmony gap)

46. **Segment-and-template chordal analysis reaches ~75.8% event accuracy on classical symbolic corpora.** Pardo & Birmingham 2002, Computer Music Journal 26(2) (https://doi.org/10.1162/014892602760137167). Implication: the simplest windowed template pass — buildable in TS, zero heavy deps — is proven; gate its confidence.
47. **Root-level accuracy is the reliable tier (~86–89%); full-chord labels drop 13–18 points, worst on pop/rock.** Masada & Bunescu 2018/2019 (arXiv:1810.10002). Implication: scope deterministic claims to root + triad quality.
48. **Failure mode: figuration/arpeggiation and root-absent segments are the documented error drivers.** Masada & Bunescu (same source, reported limitations). Implication: confidence-gate arpeggiated/melody-heavy textures DOWN, block-chord textures UP.
49. **Naive verticality (chordify-style slicing) turns passing tones into "chords."** Cuthbert & Ariza 2010, ISMIR (music21; https://www.semanticscholar.org/paper/d1bacc1a26df8a3f78c78ba39193eac398c590de). Implication: beat/measure windowing + template scoring on top of vertical slices, never raw slices.
50. **Key-profile correlation (Krumhansl-Schmuckler, Temperley-refined) is the established key/root backbone.** Temperley 1999, Music Perception 17(1) (https://online.ucpress.edu/mp/article-abstract/17/1/65/62051). Implication: bias ambiguous windows toward the song's stated-key diatonic chords — a cheap accuracy lever.
51. **Rootless voicings, fast harmonic rhythm, and non-chord tones keep symbolic recognition hard even for SOTA.** Yao et al. 2025, BACHI (arXiv:2510.06528). Implication: jazz/R&B rootless textures are a hard-failure class — suppress or hedge labels there.
52. **Fine-grained labels (extensions, inversions) are substantially harder than coarse root/triad.** McLeod et al. 2022 (arXiv:2201.05244). Implication: never emit deterministic 9/11/13 or inversion claims.
53. **Triad + seventh is the standard teaching vocabulary; extensions are jazz-specific add-ons.** Open Music Theory, "Seventh Chords" (https://viva.pressbooks.pub/openmusictheory/chapter/seventh-chords/). Implication: the achievable tier and the pedagogical tier coincide — build to exactly triad±seventh.

## Research grounding — Q7: transposition/variation-aware pattern discovery

54. **Geometric point-set discovery (SIA/SIATEC) finds transposed repetition in polyphony by construction.** Meredith, Lemström & Wiggins 2002, JNMR 31(4) (https://www.researchgate.net/publication/2525888). Implication: the principled ceiling — heavier than the harness needs.
55. **COSIATEC filters over-generation by compression ratio + compactness + coverage.** Meredith 2013 (https://vbn.aau.dk/en/publications/cosiatec-and-siateccompress-pattern-discovery-by-geometric-compre/). Implication: adopt those three ranking scores whatever representation we use.
56. **SOTA misses ~40%+ of annotated structure (best symbolic three-layer F1 ≈ 0.53–0.61).** MIREX 2014 Discovery of Repeated Themes & Sections results (https://music-ir.org/mirex/wiki/2014:Discovery_of_Repeated_Themes_%26_Sections_Results). Implication: discovered repeats are evidence-graded candidates in annotations, never authoritative structure.
57. **Interval-based representations are transposition-invariant by construction.** Lattner, Grachten & Widmer 2018 (arXiv:1806.08236). Implication: per-measure interval sequences/multisets buy invariance for free, deterministically.
58. **Suffix-tree/substring detection of NON-TRIVIAL repeats (drop patterns subsumed by longer ones) is established prior art.** Lo, Lee & Chang 2008, MTAP (https://link.springer.com/article/10.1007/s11042-007-0138-3). Implication: n-gram/suffix hashing over interval strings + subsumption dedup is the citable cheap path.
59. **Failure mode: string/n-gram frequency over-reports unmemorable patterns; precision/recall trade-off is intrinsic.** Sears & Widmer 2018 (arXiv:1807.06700); Meredith 2019 RecurSIA-RRT (arXiv:1906.12286). Implication: cap and rank output; never list everything.
60. **Checkerboard-kernel novelty over a self-similarity matrix locates section boundaries.** Foote 2000, IEEE ICME (https://www.semanticscholar.org/paper/042ad65e1af6b7c23c275e337edf1ebd65f1a3f3); FMP reference implementation (https://www.audiolabs-erlangen.de/resources/MIR/FMP/C4/C4S4_NoveltySegmentation.html). Implication: a per-measure-feature SSM novelty lens finds sections even when repeat matching fails — the fix for "0 repeats ≠ through-composed."
61. **Expert practice segments start/stop at formal-structure boundaries; structure is the memory retrieval scheme.** Chaffin & Imreh 2002, Psychological Science 13(4) (https://journals.sagepub.com/doi/10.1111/j.0956-7976.2002.00462.x). Implication: section detection is directly pedagogically load-bearing — sections become suggested practice segments.

## Research grounding — Q8: per-genre performance-practice pedagogy

62. **Swing ratios are tempo-dependent (~3.5:1 slow → ~1:1 fast; the short note ~100 ms) and vary expressively within phrases.** Friberg & Sundström 2002, Music Perception 19(3) (https://online.ucpress.edu/mp/article-abstract/19/3/333/61900/); Benadon 2006, Ethnomusicology 50(1) (https://www.jstor.org/stable/20174424). Implication: jazz tips never say "swing = triplets"; state tempo-scaled swing.
63. **The canonical jazz-piano voicing curriculum: shells (3rd+7th), rootless LH voicings, block chords.** Levine 1989, The Jazz Piano Book, Sher Music (https://shermusic.com/0961470151.php). Implication: name concrete voicing devices, not "jazzy extensions."
64. **Chord-scale pedagogy detached from aural/vocabulary practice is the documented failure of institutional jazz education.** Prouty 2008, Critical Studies in Improvisation 4(1) (https://www.criticalimprov.com/index.php/csieci/article/view/346). Implication: scale advice only with a listening anchor.
65. **Joplin's primary-source instruction: "play slowly until you catch the swing, and never play ragtime fast at any time."** Joplin 1908, School of Ragtime (https://imslp.org/wiki/School_of_Ragtime_(Joplin,_Scott)); Berlin 1980, Ragtime, UC Press (https://www.jstor.org/stable/942427). Implication: ragtime tips quote the composer — steady moderate tempo, metronomic left hand.
66. **Clave is the organizing principle; montuno/tumbao must align to clave direction (2-3 vs 3-2).** Mauleón 1993, Salsa Guidebook, Sher Music (https://www.shermusic.com/0961470194.php). Implication: latin tips state clave direction and the lock, not "syncopated feel."
67. **Groove/pocket is systematic microtiming: ~20–30 ms asynchronies, backbeats slightly behind the pulse.** Danielsen 2006, Presence and Pleasure, Wesleyan UP (https://www.weslpress.org/9780819568236/presence-and-pleasure/). Implication: R&B/soul tips give the concrete timing move ("lay the backbeat slightly behind").
68. **Gospel piano transmits aurally (recordings, church, mentorship), largely outside notation.** Vester 2020, PhD diss., U. Mississippi (https://egrove.olemiss.edu/etd/1848/). Implication: soul/gospel annotations direct ear-imitation of reference recordings.
69. **Pedaling is style-specific technique (per-composer/texture treatment), not on/off.** Banowetz 1985, The Pianist's Guide to Pedaling, Indiana UP (https://iupress.org/9780253207326/the-pianists-guide-to-pedaling/). Implication: film/new-age tips give concrete pedal instructions (change with harmony, half-pedal, deliberate blur).
70. **Aural modeling beats verbal-only instruction; verbal works only when translated to concrete sound properties.** Rosenthal 1984, JRME 32(4) (https://journals.sagepub.com/doi/10.2307/3344877); Dickey 1992 review (https://eric.ed.gov/?id=EJ458352); Woody 2006, JRME 54(1) (https://journals.sagepub.com/doi/10.1177/002242940605400103). Implication: EVERY styleTip carries a listen-for anchor tied to a concrete sound property.

## Research grounding — Q9: loop-record capture UX

71. **Ableton's MIDI loop-record default is overdub-accumulate ("build your pattern layer by layer"), with record toggling live against a running transport.** Ableton Live 12 Manual, Recording New Clips (https://www.ableton.com/en/manual/recording-new-clips/). Implication: loop-record accumulates per cycle; record-arm toggles without stopping.
72. **Logic's MIDI cycle default is Merge; takes folders are the audio/pro paradigm.** Apple, Logic Pro recording settings + merge docs (https://support.apple.com/guide/logicpro/recording-preferences-lgcp411dd5c8/mac; https://support.apple.com/guide/logicpro-ipad/merge-software-instrument-recordings-lpipa5caa7e6/ipados). Implication: the two majors agree — merge/overdub default; takes deferred.
73. **Reaper exposes overdub/replace as modes on the record-arm control.** Community documentation of Reaper record modes (KVR: https://www.kvraudio.com/forum/viewtopic.php?t=355524; VI-Control: https://vi-control.net/community/threads/record-with-midi-overdub-reaper.91023/ — community-tier source, corroborates the vendor docs above). Implication: replace-mode = a small toggle on the arm button.
74. **Failure mode (community-tier, both directions): users don't discover buried record modes, or don't realize overdub is on.** Same community threads as 73. Implication: the ACTIVE mode must be visible at the point of recording (badge on the arm button/ruler).
75. **GarageBand splits the novice default by material: merge ON for drums/patterns, OFF for melodic lines.** Apple, GarageBand iPad (https://support.apple.com/guide/garageband-ipad/record-touch-instruments-chs392846e9/ipados). Implication: per-context defaults are legitimate for a learning tool.
76. **Playfulness — immediate, low-stakes, layer-by-layer looping — is the documented engagement mechanism for non-experts across 101 surveyed looping tools.** Barbosa, Wanderley & Huot 2017, NIME (https://hal.science/hal-01528923). Implication: no modal dialogs mid-loop; cycle boundaries stay frictionless.
77. **Autopunch (predefined punch region) exists so players "concentrate on playing, rather than on controlling the software."** Apple, Logic Pro punch docs (https://support.apple.com/guide/logicpro/punch-in-and-out-of-audio-recordings-lgcpb19bfd0d/10.7/mac/11.0). Implication: for novices, re-record-the-loop beats surgical punch; our loop region IS the punch region.
78. **Undo granularity during loop recording = one recorded pass, removable mid-record.** Ableton Live 12 Manual (same as 71). Implication: each cycle's captured notes commit as ONE undo unit; Ctrl+Z peels the last pass without stopping.

## Research grounding — Q10: multi-select + clipboard

79. **Lasso/circling selection is slower and less accurate than tapping except for cohesive close groups.** Mizobuchi & Yasumura 2004, CHI (https://dl.acm.org/doi/10.1145/985692.985769). Implication: marquee complements click/modifier-click; never replaces them.
80. **Rectangle/lasso selection degrades in dense configurations.** Dehmeshki & Stuerzlinger 2008–2010 (https://ceur-ws.org/Vol-588/123.pdf). Implication: additive marquee (Shift+drag union) + select-all-in-timespan commands rather than demanding one perfect rectangle.
81. **The platform canon: plain click replaces; Shift+click extends a contiguous range from the anchor; Ctrl/Cmd+click toggles.** Apple HIG Selection and input (https://developer.apple.com/design/human-interface-guidelines/selection-and-input); Microsoft list-view guidelines (https://learn.microsoft.com/en-us/windows/win32/uxguide/ctrl-list-views). Implication: adopt exactly this; invent nothing.
82. **Ableton resolves marquee-vs-draw with an explicit Draw Mode toggle (B, holdable as momentary latch); paste at insert marker; Ctrl+D duplicates forward by selection length.** Ableton Live 12 Manual, Editing MIDI (https://www.ableton.com/en/live-manual/12/editing-midi/). Implication: a one-key Select/Draw toggle with momentary hold; duplicate = shift by selection length.
83. **Logic splits by tool (Pointer marquee vs Pencil create); Cmd-V pastes at playhead with a separate "Paste at Original Position."** Apple, Logic Pro Piano Roll docs (https://support.apple.com/guide/logicpro/copy-notes-lgcpa917aaef/mac; https://support.apple.com/guide/logicpro/add-notes-lgcpa904cb3a/mac). Implication: default paste-at-playhead + an original-position variant.
84. **Reaper's right-drag marquee conflicts with browser context menus.** Reaper community selection docs (https://reaper.blog/2012/02/reaper-101-making-selections/ — community-tier). Implication: prefer the mode/tool solution in a browser.
85. **ARIA APG grid multi-select keys: Shift+Arrow extends, Ctrl+A selects all, aria-selected on cells.** W3C APG Grid (https://www.w3.org/WAI/ARIA/apg/patterns/grid/). Implication: keyboard multi-select per APG on the roving-focus roll.
86. **Failure mode: mode errors — same action, different result on invisible state (Draw Mode click DELETES a note in Ableton); unmodified marquee wipes selection; paste-at-playhead lands off-screen.** Raskin 2000, The Humane Interface (https://en.wikipedia.org/wiki/The_Humane_Interface) + the vendor docs above. Implication: persistent visible mode indicator + distinct cursors; selection state in undo; auto-scroll to the paste target.

## The design (every choice traces to findings)

**Wave W-H — harness upgrade** (`scripts/annotate-batch.ts` + new pure analysis modules + tests):
1. **Chord pass**: per-measure/half-measure windowed pitch-class-profile template matching, triads + sevenths ONLY [46, 47, 52, 53], key-profile bias toward the stated key's diatonic set [50], windowing over raw verticality [49]. Per-window confidence; **per-genre gating** [48, 51]: block-chord textures report labels; arpeggiated/rootless genres (jazz, latin, soul, rnb) report only high-confidence windows, framed as "implied harmony." Analysis briefs gain a chords section with per-label confidence.
2. **Pattern pass**: per-measure interval representation [57] + n-gram/suffix repeated-substring detection with subsumption dedup [58], ranked by compression ratio/compactness/coverage, output capped [55, 59]; briefs label them "repetition candidates (evidence-graded)" [56].
3. **Section lens**: per-measure feature vectors (density, pitch centroid, interval profile) → self-similarity matrix → checkerboard novelty → section-boundary candidates [60]; briefs suggest practice segments at those boundaries [61].

**Wave D2 — bulk harvest** (78 songs, 3 staged sub-waves of 3 genres; QA gate ≥80 + truthfulness lens sample per sub-wave; superlative ban enforced): per-genre checklists baked into annotation instructions — jazz: tempo-scaled swing [62] + named voicing devices [63] + scale-advice-with-aural-anchor [64]; ragtime: Joplin's steady-tempo primary source [65]; latin: clave direction + montuno lock [66]; rnb/soul: behind-the-beat pocket with the ms-scale move [67] + ear-imitation anchors [68]; film/new-age: concrete pedaling [69]; ALL: every styleTip has a listen-for anchor tied to a concrete sound property [70]; harmony claims come from the harness's confidence-gated chord pass or stay generic-with-honesty [48, 51].

**Wave C3 — record-arm capture (cockpit)**: record-arm button with VISIBLE mode badge [74]; default = merge/overdub-accumulate per loop cycle [71, 72], replace-mode toggle on the arm control [73]; recording toggles live against the running transport [71]; each cycle commits as ONE undo unit, Ctrl+Z peels the last pass without stopping [78]; re-record-the-loop as the fix-a-mistake path (the loop region is the punch region) [77]; no mid-loop dialogs [76]; live ghost notes while capturing (input monitoring); plus the swarm-1 capture spine: raw + quantize-as-view, event.timeStamp→audio-clock mapping, 1-bar count-in, per-source calibration, Firefox coarse-timestamp degradation [16–25]; capture works without a loop region too (linear record from the playhead).

**Wave C4 — multi-select + clipboard (cockpit)**: a Select/Draw tool toggle (one key, momentary latch, persistent visible indicator + distinct cursors [82, 86]); Draw remains the default (click-to-add preserved); in Select: empty-space drag = marquee, Shift+drag = additive [80]; platform modifier canon exactly [81]; Shift+Arrow keyboard range extension + Ctrl+A per APG [85]; copy/cut/paste-at-playhead + Duplicate shifts by selection length [82, 83]; auto-scroll to paste target + selection state in undo [86]; group drag/transpose = one command per gesture (existing finding 2); marquee complements, never replaces, click selection [79].

**Sequencing**: W-H ∥ C3 (disjoint trees) → C4 (cockpit serial) ∥ D2-A → D2-B → D2-C (each sub-wave gated on the prior's QA + lens sample). Fable lenses after each cluster; per-wave commits; CI gates; the approved cockpit→Pages deploy follows C4.

---

## Iterations 4–5 + Phase 9 receipt (executed 2026-07-09/10)

**Shipped (all CI-green on main):** W-H harness analysis (chords/patterns/sections/key detection; lens H forced 3 HIGH fixes incl. content-based key detection after ~half the pilot corpus's key fields proved wrong) · C3 record-arm capture (lens I: 2 MEDIUMs fixed; looper model per findings 71–78) · C4 multi-select/clipboard (lens J: raw\*-stripping drag + AZERTY key-steal fixed) · **cockpit LIVE on Pages** (/ai-jam-sessions/cockpit/, HTTP 200) · D2-A/B/C bulk harvest (27+27+24 songs; first-draft failures 7.4% → 3.7% → **0%**; lenses K/L/M caught 2 invented facts + false superlatives + precision slips — all fixed) · legacy uplift (12 April F-scorers → 86–100) · **library data audit (operator sessions): 6 fragment sources replaced — 3 were UNRELATED songs at origin** · girl-from-ipanema trivia sweep (87→100) · C5 polish (velocity visuals, audible edit preview, title ellipsis, focus pill, reduced-motion; demo render coordinator-reviewed) · **the library: 24 → 120/120 ready, every annotation ≥80 on the exemplar rubric**.

**Phase 9 (final comprehensive test, 2026-07-10):** `pnpm verify` ×3 consecutive — identical results, zero flakes (72 files, 2506 passed + 1 expected win32 skip, smoke 48/48 each run); cockpit clean-room (rm node_modules → frozen install → typecheck → build → base-path build) all green; `node dist/cli.js` serves the 120-song library; dataset gates: checksums 274/274 + 0 completeness problems, release gate slice21 **Aggregate: PASS**. Session arc: **1701 → 2506 tests; 42 → 46 MCP tools; jam-actions-v0 live on HuggingFace (mcp-tool-shop/jam-actions-v0)**.

**Phase 10 is next**: full treatment per [[full-treatment]] — v1.4.3 → v1.5.0 (+ plugin manifests), coordinator-authored README/CHANGELOG, translations BEFORE tag, shipcheck, landing/handbook verify, repo-knowledge scan, release via the #12 OIDC decision. The NO-skip compensators table for the irreversible publish actions ships in the Phase-10 plan.
