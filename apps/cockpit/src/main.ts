// ─── Cockpit Main ────────────────────────────────────────────────────────────
//
// UI wiring for the Cockpit (Instrument + Vocal modes). This file is DOM
// wiring only — the score model lives in state.ts, beat/tempo math in
// time.ts, playback scheduling in transport.ts, and autosave shape in
// persistence.ts. Every note mutation here calls into state.ts's mutation
// API rather than touching a note object's fields directly (that API is
// the seam a future undo/redo wave hooks); every play/pause/stop/scheduling
// concern calls into transport.ts.
//
//   - Dual-mode piano roll — pitch-class colors (instrument) or vowel colors
//     (vocal) with per-note vowel/breathiness metadata
//   - Visual keyboard with QWERTY mapping + MIDI input
//   - Note inspector (velocity + vocal params when in vocal mode)
//   - Transport (play/pause, stop, loop) with per-note vowel switching
//   - LLM-facing score API: exportScore() / importScore() / window.__cockpit
//   - Telemetry dashboard (voice count, preset, tuning, reference pitch)
//
// boot() still runs unconditionally at this module's top level (below), so
// main.ts remains the one module in this app that's NOT safe to import from
// a Node/vitest test — same constraint as before the module split. Nothing
// else may import main.ts.
// ─────────────────────────────────────────────────────────────────────────────

import {
  createSynth, VOICES, VOICE_IDS, TUNINGS, TUNING_IDS,
  INTERVAL_TESTS,
  type VoiceId, type TuningId, type Synth,
  type IntervalAnalysis, type TuningExport,
} from "./synth.js";
import {
  createVocalSynth, VOCAL_VOICES, VOCAL_VOICE_IDS, VOWEL_IDS,
  type VocalVoiceId, type VowelId, type VocalSynth,
} from "./vocal-synth.js";
import {
  serializeCockpitState, deserializeCockpitState, STORAGE_KEY,
  type CockpitPersistedState,
} from "./persistence.js";
import * as state from "./state.js";
import { MIDI_LO, MIDI_HI, type Note, type NoteInit } from "./state.js";
import {
  DEFAULT_BPM, PX_PER_BEAT, SCORE_BEATS,
  QUANTIZE_GRID_BEATS, DEFAULT_NOTE_DURATION_BEATS,
  clampBpm, beatsToSeconds, secondsToBeats, quantizeBeats,
} from "./time.js";
import { createTransport, computeScoreEndBeat, type Transport } from "./transport.js";
import * as undo from "./undo.js";
import {
  pxToBeat, computeRulerTicks, normalizeRegion, computeFollowScroll,
  RULER_HEIGHT_PX, MIN_REGION_BEATS, type LoopRegion,
} from "./ruler.js";
import {
  resolveDragBeats, commitDragBeats, moveModeTarget, resizeStepTarget,
  findNearbyNoteForDragInit,
} from "./gesture.js";
import {
  createCaptureEngine, capturedNoteToInit, computeCountInClicks,
  sampleClockOffset, createHeldPitchTracker, hasPendingCountIn,
  shouldRefuseUndoWhileRecording,
  type CaptureEngine, type CaptureSource, type RecordMode, type RecordPhase,
  type CarryOverNote, type HeldPitchTracker,
} from "./capture.js";

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Serialisable score snapshot for LLM import/export (window.__cockpit,
 * the #score-json textarea).
 *
 * version 2 = current, BEATS-based notes (startBeat/durationBeats — see
 * time.ts's file header for why the app stores beats now). exportScore()
 * below only ever produces version 2.
 *
 * version 1 = legacy, SECONDS-based notes (startSec/durationSec) from
 * before the beat-based time model. importScore() still ACCEPTS version-1
 * snapshots (and individual legacy-shaped notes even under a version-2
 * envelope) for backward compatibility with anything previously exported —
 * see validateImportedNote()'s doc comment for exactly how the conversion
 * works and which bpm it uses.
 */
interface ScoreSnapshot {
  version: 1 | 2;
  mode: "instrument" | "vocal";
  bpm: number;
  voice: string;
  vocalVoice?: string;
  tuning: string;
  refPitch: number;
  notes: NoteInit[];
}

/** The non-notes half of ScoreSnapshot — bpm/mode/voice/tuning/refPitch
 *  only. Wave C1 finding 5: importScoreCommand's settings delta uses this
 *  shape so undoing/redoing a score import also restores/reapplies the
 *  settings that rode along with it, not just the notes — see
 *  captureSettings()/applySettings() below. */
type ImportSettings = Omit<ScoreSnapshot, "version" | "notes">;

// ─── Constants ───────────────────────────────────────────────────────────────

const ROW_H = 14;
const ROWS = MIDI_HI - MIDI_LO + 1;
const PR_WIDTH = SCORE_BEATS * PX_PER_BEAT;
const PR_HEIGHT = ROWS * ROW_H;
/** Movement threshold (px) below which a ruler pointerdown is treated as a
 *  click (seek) rather than a drag (define a loop region) — Wave C2a. */
const DRAG_THRESHOLD_PX = 4;
/** Hard cap on notes accepted by a single score import — an unbounded count
 *  renders one absolutely-positioned DOM element per note synchronously and
 *  can lock the tab (F-A1: score-size bomb). */
const MAX_IMPORT_NOTES = 5000;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];
const PC_COLORS = [
  "#79c0ff", "#4c8ed9", "#7ee787", "#3fb950", "#ffa657", "#ff7b72",
  "#d2a8ff", "#9b72cf", "#f778ba", "#da3633", "#f0e68c", "#d29922",
];

function noteName(midi: number) { return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1); }

// Vowel → color mapping (vocal mode notes)
const VOWEL_COLORS: Record<VowelId, string> = {
  a: "#ff7b72", // open-red
  e: "#7ee787", // front-green
  i: "#79c0ff", // close-blue
  o: "#ffa657", // back-orange
  u: "#d2a8ff", // round-purple
};
const VOWEL_LABELS: Record<VowelId, string> = { a: "/a/", e: "/e/", i: "/i/", o: "/o/", u: "/u/" };

// QWERTY → MIDI (DAW keyboard layout — 2 octaves from C4).
// Keyed by KeyboardEvent.code (physical key position), not .key (the
// character the layout produces) — .key is layout-dependent, so on AZERTY
// the physical bottom-row "Z" key produces "w" and scrambles this whole
// mapping, and Dvorak is unplayable. .code always names the physical key
// regardless of the active layout, matching how DAW keyboards conventionally
// work. (F-A1: physical-layout QWERTY mapping)
const QWERTY: Record<string, number> = {
  KeyZ: 60, KeyS: 61, KeyX: 62, KeyD: 63, KeyC: 64, KeyV: 65, KeyG: 66, KeyB: 67, KeyH: 68, KeyN: 69, KeyJ: 70, KeyM: 71,
  KeyQ: 72, Digit2: 73, KeyW: 74, Digit3: 75, KeyE: 76, KeyR: 77, Digit5: 78, KeyT: 79, Digit6: 80, KeyY: 81, Digit7: 82, KeyU: 83,
};
const QWERTY_LABELS: Record<number, string> = {};
for (const [code, v] of Object.entries(QWERTY)) QWERTY_LABELS[v] = code.replace(/^Key|^Digit/, "");

const PLAY_ICON_SVG = '<svg class="icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M5 3 L12 8 L5 13 Z"/></svg>';
const PAUSE_ICON_SVG = '<svg class="icon" width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><rect x="4" y="3" width="2.6" height="10" rx="0.5"/><rect x="9.4" y="3" width="2.6" height="10" rx="0.5"/></svg>';

// ─── State ───────────────────────────────────────────────────────────────────
//
// The score itself (notes + selection) lives in state.ts; playback position/
// scheduling lives in transport.ts. What's left here is UI-only state: which
// engine is active, live-performance held-key tracking, and the tuning-audit
// panel's working copy of custom cents.

let synth: Synth;
let vocalSynth: VocalSynth;
let transport: Transport;
let mode: "instrument" | "vocal" = "instrument";
let looping = false;
let bpm = DEFAULT_BPM;
const heldKeys = new Set<string>();
/** Which live source (qwerty/onscreen/midi) currently holds each pitch —
 *  Lens-I finding 2. Was a plain `Set<number>` (pitch-only) before this
 *  fix; a cross-source release (e.g. a MIDI note-off arriving while the
 *  SAME pitch is still physically held on QWERTY) used to close heldMidi
 *  under the wrong key entirely, stranding the actual opener's open
 *  capture note forever — see createHeldPitchTracker's doc comment in
 *  capture.ts for the full mechanism. */
const heldMidi: HeldPitchTracker = createHeldPitchTracker();
let intervalRoot = 60; // C4
/** True for the duration of a resize-handle or move-drag gesture
 *  (pointerdown → pointerup/pointercancel — Wave C2b migrated this off
 *  mousedown/mouseup, see startNoteMoveDrag/startNoteResizeDrag) on a
 *  piano-roll note — Wave C1 finding 6: guards
 *  the Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y carve-out in the keydown handler below so
 *  an undo/redo mid-drag can't rerenderAllNotes() the piano roll out from
 *  under the drag's onMove/onUp closures, which still hold a direct
 *  reference to the (now possibly-replaced) dragged DOM element. */
let dragActive = false;
/** Set by whichever note-drag gesture (resize handle or move) is currently
 *  active, to its own rollback closure — Wave C2b findings 38/39.
 *  pointercancel/lostpointercapture on the captured element call this
 *  directly; the Escape keydown handler also calls it (taking precedence
 *  over panic) when `dragActive` is true, so Escape can abort a drag
 *  cleanly (restore pre-drag geometry, no command pushed) instead of only
 *  silencing audio. Cleared back to null the moment a gesture ends
 *  (commit OR rollback) — never left pointing at a finished gesture's
 *  closure. Deliberately NOT set by the ruler's own drag (see buildRuler):
 *  that gesture doesn't touch `dragActive` either, preserving this flag's
 *  original scope (guarding the Ctrl+Z-mid-note-drag hazard — see
 *  dragActive's own doc comment above) exactly as Wave C1 left it. */
let cancelActiveDrag: (() => void) | null = null;
/** True while "Move mode" (Wave C2b finding 40 — WCAG 2.5.7 non-drag
 *  single-pointer alternative) is armed: the NEXT tap/click anywhere on
 *  the roll relocates the selected note to the tapped beat/pitch instead
 *  of its usual meaning (add a note / start a note drag) — see
 *  bindGestureAltControls()'s capture-phase listener. Auto-clears after
 *  one use, on Escape, or if the selection is lost while armed (see
 *  updateGestureAltButtons). */
let moveModeActive = false;
/** Current loop region (Wave C2a) — ruler drag-to-define UI state, read by
 *  the transport's getLoopRegion callback (see init()). Deliberately NOT
 *  persisted (persistence.ts's schema has no field for it) and NOT routed
 *  through undo.ts — transport state, not score state, same category as
 *  `looping` above. */
let loopRegion: LoopRegion | null = null;
/** Playhead auto-scroll-follow (finding 43) — defaults ON so a score wider
 *  than the viewport keeps the playhead visible without an extra click. */
let followEnabled = true;
// ─── Record-arm capture state (Wave C3 — see capture.ts's file header) ──────
/** The capture engine instance — constructed in init() right after the
 *  transport (it needs transport.beatAtAudioTime injected). */
let captureEngine: CaptureEngine;
/** OVERDUB (default — findings 71/72: both major DAWs' loop-record default
 *  is merge/accumulate) vs REPLACE (finding 73). Toggled by the mode badge
 *  button; read at each pass boundary, so switching mid-recording takes
 *  effect from the NEXT cycle. */
let recordMode: RecordMode = "overdub";
/** True from arm until the take/punch-out ends — drives the arm button's
 *  aria-pressed + .armed styling. Distinct from recordPhase: armed is the
 *  user-facing toggle, phase is where the machine actually is. */
let recordArmed = false;
/** idle → counting-in → recording (capture.ts's RecordPhase; canCapture()
 *  gates event capture on it — findings 24/25: nothing played during the
 *  count-in is ever captured). */
let recordPhase: RecordPhase = "idle";
/** Pending count-in completion timer — cleared by cancelCountIn(). */
let countInTimer: ReturnType<typeof setTimeout> | undefined;
/** REPLACE mode's live-cleared notes for the CURRENT pass (snapshotted with
 *  ids at pass start, consumed into the pass's ONE captureCommand at
 *  commit) — see undo.ts's captureCommand doc comment for the two-instant
 *  mutation this bridges. Always empty in overdub mode. */
let replaceClearedThisPass: Note[] = [];
/** Beat the current pass started at — the linear-take REPLACE span's left
 *  edge ("a linear re-record clears only the time span it covers") and
 *  endPass's floor. */
let recordPassStartBeat = 0;
/** The loop-cycle span of the CURRENT pass, or null for a linear take —
 *  set by beginCapturePass; finishCaptureTake uses null to know a REPLACE
 *  take should clear its own covered span at commit rather than a region
 *  span at start. */
let passLoopSpan: { start: number; end: number } | null = null;
/** Last position onTick reported — read by the capture-stop path instead of
 *  transport.getPositionBeats() because stop() resets position to 0 BEFORE
 *  onPlayStateChange(false) fires (pause() doesn't; this covers both). */
let lastTickPositionBeats = 0;
/** One coarse-timestamp warning per session (finding 19) — the engine
 *  reports newlyDegraded exactly once per source; this collapses that to
 *  one visible toast total so a 3-source session can't triple-toast. */
let coarseWarned = false;
/** Live ghost-note DOM elements, keyed by capture.ts's stable ghostId —
 *  diffed (not rebuilt) every tick while recording. */
const ghostEls = new Map<string, HTMLElement>();
/** Wall-clock deadline (performance.now()-based) until which the next
 *  #piano-roll-container "scroll" event should be treated as OUR OWN
 *  programmatic scroll (see programmaticScroll() below), not a
 *  user-initiated one — see bindFollowToggle()'s scroll listener. A grace
 *  window rather than "the next scroll event" because a smooth scrollTo()
 *  fires several scroll events over its animation, not just one. Set by
 *  programmaticScroll(), never assigned directly (Wave C2b finding 3). */
let programmaticScrollUntil = 0;
/** Grace window length (ms) — Wave C2b finding 3 bumped this from 500 to
 *  800 to comfortably cover a long smooth scrollTo() animation (e.g. a
 *  follow-jump spanning most of a wide score) without its tail-end scroll
 *  events slipping past the deadline and being misread as the user taking
 *  over. */
const PROGRAMMATIC_SCROLL_GRACE_MS = 800;

/**
 * Run `fn`, a synchronous action that scrolls #piano-roll-container (a
 * scrollTop/scrollLeft assignment, scrollIntoView, or scrollTo), with the
 * grace window open FIRST (Wave C2b finding 3) — so every "scroll" event
 * the action produces, including ones dispatched asynchronously after this
 * call returns, is recognized as OUR OWN and never disables follow. Every
 * programmatic scroll site in this file (centering on boot, scrollIntoView
 * on keyboard nav, applyFollowScroll's own jump) goes through this single
 * helper rather than each setting `programmaticScrollUntil` itself, so
 * bindFollowToggle()'s listener has exactly one thing to trust.
 */
function programmaticScroll(fn: () => void): void {
  programmaticScrollUntil = performance.now() + PROGRAMMATIC_SCROLL_GRACE_MS;
  fn();
}

// ─── DOM ─────────────────────────────────────────────────────────────────────

const $ = (id: string) => document.getElementById(id)!;

/**
 * Parse a numeric <input>'s current value; if it's empty/NaN/non-finite,
 * restore the field to `prevValue` and return `prevValue` instead of
 * propagating NaN into app state. Used by every numeric input handler in
 * this file (ref pitch, BPM, velocity/breathiness sliders, custom-tuning
 * cents, vibrato controls) — a bare parseInt/parseFloat on an emptied number
 * input silently produces NaN, which then poisons every downstream
 * calculation (midiToFreq, quantize, AudioParam automation) with no visible
 * error (F-A1: numeric input NaN guards).
 */
function safeNumber(input: HTMLInputElement, prevValue: number, asFloat = false): number {
  const n = asFloat ? parseFloat(input.value) : parseInt(input.value, 10);
  if (!Number.isFinite(n)) {
    input.value = String(prevValue);
    return prevValue;
  }
  return n;
}

/** CSS.escape()-safe [data-note-id="..."] selector. Note ids are normally our
 *  own "n123" strings, but hand-crafted/LLM-generated import JSON can carry
 *  arbitrary id values (see the id-override guard in state.ts's addNote/
 *  replaceScore) — an unescaped id containing a quote or bracket would throw
 *  a SyntaxError here instead of just failing to match (F-A1: unsafe
 *  note-id selectors). */
const noteSelector = (id: string) => `[data-note-id="${CSS.escape(id)}"]`;

// ─── Persistence ─────────────────────────────────────────────────────────────
//
// Autosave/restore cockpit state to localStorage (F-B1-001). All access is
// wrapped in try/catch — private-mode Safari and quota-exceeded both throw
// synchronously on getItem/setItem, and this app previously had ZERO
// persistence: every reload silently discarded the whole score with no
// warning. A failed save/restore must never crash boot — it just means the
// session isn't remembered.

function safeLoadRaw(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}
function safeSaveRaw(json: string): void {
  try { localStorage.setItem(STORAGE_KEY, json); } catch { /* private mode / quota — no-op */ }
}
function safeClearStorage(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* no-op */ }
}

let autosaveTimer: ReturnType<typeof setTimeout> | undefined;

/** Set by Reset (btn-reset) — suppresses exactly one upcoming involuntary
 *  flush (visibilitychange/pagehide calling saveStateNow directly, bypassing
 *  the debounce) so a stray autosave can't silently resurrect the session
 *  Reset just cleared. onStateChanged() clears it again on the next real
 *  edit, so a genuine post-reset autosave is never skipped (F-A1-011). */
let suppressNextAutosave = false;

/** Debounced (~500ms) save — call after any score/settings mutation rather
 *  than saving synchronously, since drag/resize/nudge fire many times a
 *  second and every save is a full JSON.stringify + localStorage write. */
function scheduleAutosave() {
  if (autosaveTimer !== undefined) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(saveStateNow, 500);
}

/** Immediate (non-debounced) save — used for visibilitychange/pagehide,
 *  where the tab may be gone before a pending debounce timer would fire. */
function saveStateNow() {
  if (autosaveTimer !== undefined) { clearTimeout(autosaveTimer); autosaveTimer = undefined; }
  // Reset (btn-reset) sets this to skip exactly one flush so an involuntary
  // visibilitychange/pagehide save can't resurrect the session it just
  // cleared (F-A1-011).
  if (suppressNextAutosave) { suppressNextAutosave = false; return; }
  const tuning = synth.getTuning();
  const json = serializeCockpitState({
    score: state.getScore().map(({ id: _id, ...rest }) => rest),
    bpm,
    engine: ($("sel-voice") as HTMLSelectElement).value,
    voice: ($("sel-vocal-voice") as HTMLSelectElement).value,
    tuning: ($("sel-tuning") as HTMLSelectElement).value,
    refPitch: synth.getRefPitch(),
    mode,
    // Persist the actual cent offsets, not just the "custom" label — a
    // reload otherwise re-labels the badge "Custom" but plays 12-TET
    // (F-A1-004).
    ...(tuning.id === "custom" ? { customCents: [...tuning.cents] } : {}),
  });
  safeSaveRaw(json);
}

/** Call after any score/settings mutation: updates the first-run hint
 *  visibility immediately (autosave is debounced, but a hint that lingers
 *  for 500ms after the first note lands would just look broken) and
 *  schedules a debounced autosave. */
function onStateChanged() {
  suppressNextAutosave = false;
  updateFirstRunHint();
  scheduleAutosave();
}

/** Reflects the undo/redo command stack's current depth onto the toolbar
 *  buttons' disabled state (Wave C1) — called once at boot for the initial
 *  (both-disabled) state, and after that entirely via undo.setOnChange
 *  below, never called directly from an edit handler. */
function updateUndoRedoButtons() {
  ($("btn-undo") as HTMLButtonElement).disabled = !undo.canUndo();
  ($("btn-redo") as HTMLButtonElement).disabled = !undo.canRedo();
}

/** The undo module's single onChange hook (Wave C1, finding 8: "every
 *  execute/undo/redo triggers onStateChanged"): fires after every
 *  execute()/commit()/undo()/redo() call that actually changed something.
 *  undo.ts itself knows neither DOM buttons nor autosave exist — this is
 *  where those two concerns meet. Note-mutation call sites that go through
 *  the command stack rely on THIS firing onStateChanged() instead of
 *  calling it themselves (see e.g. the piano-roll click-to-add handler);
 *  call sites for settings unrelated to the score (bpm, master volume,
 *  mode, tuning) keep calling onStateChanged() directly, same as before
 *  this wave. */
function afterUndoStackChange() {
  updateUndoRedoButtons();
  onStateChanged();
}

/**
 * Restore a previously-autosaved session on boot, if one exists and is
 * valid. Reuses importScore() for the bulk of the restore (notes, bpm,
 * tuning, refPitch, mode, and the active engine's voice) — the same
 * validated path the score-JSON textarea and window.__cockpit.importScore
 * already go through, so restore gets the same NaN/range/count guards for
 * free instead of a second hand-rolled copy of them. importScore only
 * restores the engine matching the currently-active mode (a pre-existing
 * limitation of ScoreSnapshot shared with manual Export/Import); since this
 * persisted schema tracks both engines' voices explicitly, the other
 * engine's pick is restored separately right after.
 *
 * persistence.ts's deserializeCockpitState already migrates v1/v2 (seconds)
 * blobs to v3 (beats) internally, so `persisted.score` here is always
 * beats-shaped — no conversion needed at this layer.
 */
function restoreFromStorage(): boolean {
  const raw = safeLoadRaw();
  if (!raw) return false;
  const persisted: CockpitPersistedState | null = deserializeCockpitState(raw);
  if (!persisted) return false;

  // recordUndo=false — see importScore()'s doc comment: a fresh session's
  // boot-time restore has no meaningful "before" state to offer undo back
  // to, and recording one would make the very first Ctrl+Z surprising.
  importScore({
    version: 2,
    mode: persisted.mode,
    bpm: persisted.bpm,
    voice: persisted.mode === "vocal" ? persisted.voice : persisted.engine,
    vocalVoice: persisted.voice,
    tuning: persisted.tuning,
    refPitch: persisted.refPitch,
    notes: persisted.score,
  }, false);

  if (persisted.mode === "vocal") {
    ($("sel-voice") as HTMLSelectElement).value = persisted.engine;
    synth.setVoice(persisted.engine as VoiceId);
  } else {
    ($("sel-vocal-voice") as HTMLSelectElement).value = persisted.voice;
    vocalSynth.setVoice(persisted.voice as VocalVoiceId);
  }

  // Restore the actual custom cent offsets when the persisted tuning is
  // "custom" — importScore() above only restores the tuning *id*, which
  // resolves to the synth's built-in placeholder custom cents, not whatever
  // the user actually dialed in (F-A1-004). Order matters: setCustomTuning()
  // must run before vocalSynth.setTuning() so the vocal engine picks up the
  // freshly-applied cents — same order "Apply Custom" already uses.
  if (persisted.tuning === "custom" && persisted.customCents) {
    synth.setCustomTuning(persisted.customCents);
    vocalSynth.setTuning("custom");
    for (let pc = 0; pc < 12; pc++) {
      CUSTOM_CENTS[pc] = persisted.customCents[pc];
      const slider = document.querySelector<HTMLInputElement>(`input[data-pc="${pc}"]`);
      if (slider) slider.value = String(persisted.customCents[pc]);
      const val = document.getElementById("cv-" + pc);
      if (val) val.textContent = persisted.customCents[pc] + "¢";
    }
    updateTuningTable();
    updateTelemetry();
  }
  return true;
}

// ─── Audio Error Reporting ───────────────────────────────────────────────────

/** Surface a Web Audio init/resume failure to the user instead of the
 *  silent `.catch(() => {})` this used to be — a suspended/failed
 *  AudioContext otherwise looks identical to a working one (keys light up,
 *  telemetry updates, piano roll works) but produces total silence with no
 *  on-page explanation (F-B1-010). Reuses the existing #score-status area
 *  rather than adding a second status surface. */
function reportAudioError(context: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  setScoreStatus(`Audio ${context} failed: ${msg}`, "error");
}

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
  synth = createSynth();
  vocalSynth = createVocalSynth();
  transport = createTransport({
    getContext: () => (mode === "vocal" ? vocalSynth.getContext() : synth.getContext()),
    resumeContexts: () => {
      const c1 = synth.getContext();
      const c2 = vocalSynth.getContext();
      if (c1 && c1.state === "suspended") c1.resume().catch((err) => reportAudioError("resume", err));
      if (c2 && c2.state === "suspended") c2.resume().catch((err) => reportAudioError("resume", err));
    },
    noteOn: (midi, velocity, time) => activeNoteOn(midi, velocity, time),
    noteOff: (midi, time) => activeNoteOff(midi, time),
    allNotesOff: () => silenceEngines(),
    isVocalMode: () => mode === "vocal",
    setVowel: (v) => vocalSynth.setVowel(v),
    setBreathiness: (b) => vocalSynth.setBreathiness(b),
    getScore: () => state.getScore(),
    getBpm: () => bpm,
    isLooping: () => looping,
    getLoopRegion: () => loopRegion,
    onTick: (positionBeats) => {
      lastTickPositionBeats = positionBeats; // Wave C3 — see its declaration
      const ph = $("playhead") as HTMLElement;
      // Visible whenever playing OR paused mid-score (position > 0) — hidden
      // only once stop() has driven position all the way back to 0.
      ph.style.display = (transport.isPlaying() || positionBeats > 0) ? "block" : "none";
      ph.style.left = positionBeats * PX_PER_BEAT + "px";
      updateTransportTime(positionBeats);
      applyFollowScroll(positionBeats);
      // Wave C3 — live ghost-note preview while capturing (input
      // monitoring's visual half; the synth already sounds the notes).
      if (recordPhase === "recording") renderGhostNotes(positionBeats);
      // Wave C2b finding 6 — keep the ruler's role="slider" ARIA state in
      // sync with every position change (playback tick, pause/stop, or any
      // seek — onTick is the one chokepoint all of those already share).
      const ruler = document.getElementById("pr-ruler");
      if (ruler) {
        ruler.setAttribute("aria-valuemax", String(computeScoreEndBeat(state.getScore())));
        ruler.setAttribute("aria-valuenow", String(Math.round(positionBeats * 100) / 100));
      }
    },
    onPlayStateChange: (isPlayingNow) => {
      $("btn-play").innerHTML = isPlayingNow ? PAUSE_ICON_SVG : PLAY_ICON_SVG;
      // Lens-I finding 6 — refresh the record button's title on EVERY
      // play/pause/stop transition, not just recording-related ones:
      // whether pressing Record right now would count-in or punch-in
      // depends on transport.isPlaying() (see updateRecordUI). Harmless to
      // call again a second time below when finishCaptureTake() also
      // calls it at the end of ending a take.
      updateRecordUI();
      // Wave C3 — ANY transition to not-playing while capturing (pause
      // button, stop button, Esc/panic, blur, end-of-canvas auto-stop)
      // finishes the take: commit whatever the current pass captured as
      // its one command and disarm. Uses lastTickPositionBeats, not
      // getPositionBeats() — stop() resets the latter to 0 before this
      // callback runs (see the variable's doc comment).
      if (!isPlayingNow && recordPhase === "recording") {
        finishCaptureTake(lastTickPositionBeats);
      }
    },
    onLoopWrap: (cycleStartBeat, cycleEndBeat) => {
      // Wave C3 — one undoable command per completed loop cycle (finding
      // 78), committed at the wrap without stopping anything (finding 76:
      // no mid-loop interruptions). OVERDUB accumulates (findings 71/72);
      // REPLACE clears the region's notes at the NEW cycle's start
      // (finding 73) — beginCapturePass handles that live-clear. A note
      // still physically held across the wrap carries over into the new
      // pass (endPass force-closed it at the boundary; startPass re-opens
      // it at the new cycle's start — see capture.ts).
      if (recordPhase !== "recording") return;
      const carry = commitCapturePass(cycleEndBeat, null);
      beginCapturePass(cycleStartBeat, { start: cycleStartBeat, end: cycleEndBeat }, carry, true);
    },
    isCapturing: () => recordPhase === "recording",
  });
  captureEngine = createCaptureEngine((audioTime) => transport.beatAtAudioTime(audioTime));
  // A construction/connect failure (rare, but possible if the browser
  // refuses to hand out an AudioContext at all) used to reject init()
  // silently — boot()'s top-level .catch(console.error) only logs to the
  // devtools console, so the page would look like it loaded fine (keys,
  // telemetry, piano roll all render) while being completely mute with zero
  // on-page explanation (F-B1-010). Surface it instead.
  try {
    await synth.connect();
    await vocalSynth.connect();
  } catch (err) {
    reportAudioError("init", err);
  }
  bindAutoplayUnlock();
  populateSelectors();
  buildPianoRoll();
  buildRuler();
  // Wave C2b finding 3 — bindFollowToggle's scroll listener must exist
  // BEFORE the very first programmatic scroll (centerRollOnMiddleC, next)
  // so its grace-window check has something to run against from the start.
  bindFollowToggle();
  centerRollOnMiddleC();
  buildKeyboard();
  bindControls();
  bindMidi();
  bindUndoRedo();
  bindGestureAltControls();
  bindRecordControls();
  buildTuningAudit();
  updateTuningTable();
  updateTelemetry();
  setInterval(updateTelemetry, 200);
  restoreFromStorage();
  updateFirstRunHint();

  // A held key or a scheduled score playing when the tab loses focus should
  // not drone on until the user finds Panic — release everything on blur or
  // when the tab is hidden, matching standard on-screen-instrument behavior
  // (F-A1: stuck notes on focus loss), AND pause score playback (position
  // preserved, not discarded) rather than leaving the lookahead scheduler
  // running silently in the background — see panic()'s doc comment for why
  // that pause is now required (Wave C0 fix). Also autosave on the same
  // hidden transition, plus pagehide, since a debounced autosave timer may
  // not have fired yet if the tab is closed/backgrounded right after an
  // edit (F-B1-001).
  window.addEventListener("blur", panic);
  document.addEventListener("visibilitychange", () => { if (document.hidden) { panic(); saveStateNow(); } });
  window.addEventListener("pagehide", saveStateNow);
}

/**
 * Chrome/Safari create AudioContexts in the "suspended" state until a user
 * gesture unlocks audio. Nothing previously called ctx.resume() anywhere, so
 * the cockpit was silent on first visit — keys lit up, telemetry updated,
 * but no sound played, with no visible error (F-A1-003). Resume on the very
 * first pointerdown/keydown anywhere on the page.
 */
function bindAutoplayUnlock() {
  const unlock = () => {
    const c1 = synth.getContext();
    const c2 = vocalSynth.getContext();
    if (c1 && c1.state === "suspended") c1.resume().catch((err) => reportAudioError("resume", err));
    if (c2 && c2.state === "suspended") c2.resume().catch((err) => reportAudioError("resume", err));
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

/** Scroll the piano roll so MIDI 60 (C4) is vertically centered — called
 *  once at boot. Previously nothing ever set scrollTop, so the roll opened
 *  scrolled to its top (near C7) while the QWERTY keyboard's home row maps
 *  to C4 (KeyZ=60) — the visible default view and the default playable
 *  range didn't match (F-A1: initial scroll position doesn't match default
 *  playable range). Assigning scrollTop beyond the scrollable max is
 *  clamped by the browser itself, so there's no need to clamp against
 *  scrollHeight here. */
function centerRollOnMiddleC() {
  const container = $("piano-roll-container");
  if (!container.clientHeight) return; // not laid out yet — nothing sane to center against
  // #pr-ruler (Wave C2a) is a preceding sibling of #piano-roll inside the
  // same scrollable content, so every row now sits RULER_HEIGHT_PX further
  // down the container's own scrollTop axis than it does within #piano-roll
  // itself — without this offset the roll would center ~44px too high.
  const rowTop = RULER_HEIGHT_PX + (MIDI_HI - 60) * ROW_H;
  // Wave C2b finding 3 — routed through programmaticScroll() so the async
  // "scroll" event this assignment produces can't be misread as the user
  // taking over follow (it used to set scrollTop directly, bypassing the
  // grace window entirely).
  programmaticScroll(() => {
    container.scrollTop = Math.max(0, rowTop - container.clientHeight / 2 + ROW_H / 2);
  });
}

// ─── Selectors ───────────────────────────────────────────────────────────────

function populateSelectors() {
  const vs = $("sel-voice") as HTMLSelectElement;
  for (const id of VOICE_IDS) {
    const v = VOICES[id];
    const o = document.createElement("option");
    o.value = id;
    o.textContent = v.name;
    o.title = v.description;
    vs.appendChild(o);
  }
  vs.value = "grand";
  vs.addEventListener("change", () => { synth.setVoice(vs.value as VoiceId); updateTelemetry(); onStateChanged(); });

  // ── Vocal voice selector ──
  const vvs = $("sel-vocal-voice") as HTMLSelectElement;
  for (const id of VOCAL_VOICE_IDS) {
    const vc = VOCAL_VOICES[id];
    const o = document.createElement("option");
    o.value = id;
    o.textContent = `${vc.name} (${vc.category})`;
    o.title = vc.description;
    vvs.appendChild(o);
  }
  vvs.value = "kokoro-af-heart";
  vvs.addEventListener("change", () => {
    vocalSynth.setVoice(vvs.value as VocalVoiceId);
    // Update breathiness/vibrato sliders to match voice defaults
    const vc = VOCAL_VOICES[vvs.value as VocalVoiceId];
    ($("vox-breathiness") as HTMLInputElement).value = String(Math.round(vc.breathiness * 100));
    $("vox-breathiness-val").textContent = String(Math.round(vc.breathiness * 100));
    ($("vox-vib-depth") as HTMLInputElement).value = String(Math.round(vc.vibratoDepth));
    $("vox-vib-depth-val").textContent = String(Math.round(vc.vibratoDepth));
    ($("vox-vib-rate") as HTMLInputElement).value = String(Math.round(vc.vibratoRate * 10));
    $("vox-vib-rate-val").textContent = vc.vibratoRate.toFixed(1);
    // Set default vowel for this voice
    vocalSynth.setVowel(vc.defaultVowel);
    document.querySelectorAll(".vowel-btn").forEach(b => b.classList.toggle("active", b.getAttribute("data-vowel") === vc.defaultVowel));
    updateTelemetry();
    onStateChanged();
  });

  // ── Vowel buttons ──
  document.querySelectorAll<HTMLButtonElement>(".vowel-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const vid = btn.dataset.vowel as VowelId;
      vocalSynth.setVowel(vid);
      document.querySelectorAll(".vowel-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  // ── Mode toggle ──
  $("mode-instrument").addEventListener("click", () => setMode("instrument"));
  $("mode-vocal").addEventListener("click", () => setMode("vocal"));

  const ts = $("sel-tuning") as HTMLSelectElement;
  for (const id of TUNING_IDS) {
    const t = TUNINGS[id];
    const o = document.createElement("option");
    o.value = id;
    o.textContent = t.name;
    o.title = t.description;
    ts.appendChild(o);
  }
  ts.value = "equal";
  ts.addEventListener("change", () => {
    synth.setTuning(ts.value as TuningId);
    vocalSynth.setTuning(ts.value as TuningId);
    updateTuningTable(); updateTelemetry();
    onStateChanged();
  });

  ($('ref-pitch') as HTMLInputElement).addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    // Clearing this field used to yield parseInt("") === NaN, which bricked
    // every subsequent noteOn (NaN refPitch -> NaN frequency -> non-finite
    // AudioParam throw) until a valid value was re-entered. Fall back to the
    // last valid ref pitch instead (F-A1-006).
    const hz = safeNumber(input, synth.getRefPitch(), false);
    synth.setRefPitch(hz);
    vocalSynth.setRefPitch(hz);
    updateTuningTable();
    updateTelemetry();
    onStateChanged();
  });
}

// ─── Mode Switching ──────────────────────────────────────────────────────────

function setMode(m: "instrument" | "vocal") {
  if (m === mode) return;
  panic();
  mode = m;
  document.body.classList.toggle("vocal-mode", m === "vocal");
  $("mode-instrument").classList.toggle("active", m === "instrument");
  $("mode-vocal").classList.toggle("active", m === "vocal");
  rerenderAllNotes();
  updateInspector();
  updateTelemetry();
  onStateChanged();
}

/** Read current breathiness slider value 0–1 */
function getCurrentBreathiness(): number {
  return parseInt(($('vox-breathiness') as HTMLInputElement).value) / 100;
}

/** Route noteOn to active engine */
function activeNoteOn(midi: number, velocity: number, time?: number) {
  if (mode === "vocal") vocalSynth.noteOn(midi, velocity, time);
  else synth.noteOn(midi, velocity, time);
}

/** Route noteOff to active engine */
function activeNoteOff(midi: number, time?: number) {
  if (mode === "vocal") vocalSynth.noteOff(midi, time);
  else synth.noteOff(midi, time);
}

/** Silence both engines immediately — the shared body behind both panic()
 *  (which additionally clears live-performance held-key UI state) and
 *  transport's pause()/stop() (which must NOT touch held-key state, since
 *  those are live-play concerns independent of score playback). */
function silenceEngines() {
  synth.allNotesOff();
  vocalSynth.allNotesOff();
}

// ─── Piano Roll ──────────────────────────────────────────────────────────────

function buildPianoRoll() {
  const pr = $("piano-roll");
  pr.style.width = PR_WIDTH + "px";
  pr.style.height = PR_HEIGHT + "px";

  // Move playhead inside piano-roll so it scrolls with content
  pr.appendChild($("playhead"));

  // Horizontal grid lines + note labels
  for (let i = 0; i <= ROWS; i++) {
    const midi = MIDI_HI - i;
    const line = document.createElement("div");
    line.className = "pr-grid-line";
    line.style.top = i * ROW_H + "px";
    if (midi >= MIDI_LO && midi % 12 === 0) line.style.opacity = "0.7";
    pr.appendChild(line);

    if (midi >= MIDI_LO && midi <= MIDI_HI && midi % 12 === 0) {
      const lbl = document.createElement("div");
      lbl.className = "pr-key-label";
      lbl.textContent = noteName(midi);
      lbl.style.top = (MIDI_HI - midi) * ROW_H + 2 + "px";
      pr.appendChild(lbl);
    }
  }

  // Vertical beat lines — bpm-independent (PX_PER_BEAT is a fixed
  // pixels-per-BEAT scale), so unlike the old seconds-based grid this is
  // drawn exactly once and never needs to be redrawn on a bpm change.
  drawBeatLines();

  // Click empty space → add note (Wave C2b: pointer events, so a touch tap
  // reaches this same path unchanged — touch-action:none on the container
  // keeps it from ever being interpreted as a scroll). Move mode's own
  // capture-phase listener (bindGestureAltControls) intercepts and stops
  // propagation before this ever runs while armed.
  pr.addEventListener("pointerdown", (e) => {
    // Wave C2b finding 8 — single-gesture policy: a second touch point
    // while a note drag is already active (from a first finger) must not
    // start ANOTHER gesture (add-note or the nearby-note drag fallback),
    // which would overwrite the shared dragActive/cancelActiveDrag state
    // the first gesture's Escape-cancel/Ctrl+Z-guard still depend on.
    if (dragActive) return;
    if ((e.target as HTMLElement).closest(".pr-note")) return;
    const rect = pr.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const midi = MIDI_HI - Math.floor(y / ROW_H);
    if (midi < MIDI_LO || midi > MIDI_HI) return;

    // Finding 41 (touch target size) fallback: the exact-pixel DOM hit-test
    // above already came up empty (we're past the `.closest` bail) — before
    // treating this as "empty space, add a note," give a thin (ROW_H=14px)
    // neighboring-row note one more chance to claim a near-miss tap. See
    // gesture.ts's findNearbyNoteForDragInit for why running this ONLY
    // after a real hit-test miss is what keeps it from ever shadowing a
    // note the user precisely, visibly clicked.
    const rowFraction = (y - Math.floor(y / ROW_H) * ROW_H) / ROW_H;
    const nearbyId = findNearbyNoteForDragInit(state.getScore(), x / PX_PER_BEAT, midi, rowFraction, e.pointerType);
    if (nearbyId) {
      const nearbyNote = state.getNoteById(nearbyId);
      const nearbyEl = nearbyNote && document.querySelector<HTMLElement>(noteSelector(nearbyId));
      if (nearbyNote && nearbyEl) { startNoteMoveDrag(nearbyNote, nearbyEl, e); return; }
    }

    const startBeat = quantizeBeats(x / PX_PER_BEAT);
    const init: NoteInit = {
      midi, startBeat,
      durationBeats: DEFAULT_NOTE_DURATION_BEATS, velocity: 100,
      ...(mode === "vocal" ? { vowel: vocalSynth.getVowel(), breathiness: getCurrentBreathiness() } : {}),
    };
    undo.execute(undo.addNoteCommand(init));
    const note = state.getSelectedNote()!; // addNoteCommand.redo() selects the new note
    renderNote(note);
    selectNote(note); // DOM `.selected` class + inspector sync
    // Preview sound
    activeNoteOn(midi, 100);
    setTimeout(() => activeNoteOff(midi), 180);
  });
}

function drawBeatLines() {
  document.querySelectorAll(".pr-beat-line").forEach((el) => el.remove());
  const pr = $("piano-roll");
  for (let b = 0; b <= SCORE_BEATS; b++) {
    const div = document.createElement("div");
    div.className = "pr-beat-line";
    if (b % 4 === 0) div.classList.add("bar");
    div.style.left = b * PX_PER_BEAT + "px";
    pr.appendChild(div);
  }
}

function renderNote(note: Note) {
  const pr = $("piano-roll");
  const el = document.createElement("div");
  el.className = "pr-note";
  el.dataset.noteId = note.id;
  applyNoteStyle(el, note);
  positionNote(el, note);

  // ── Vowel label (visible in vocal mode) ──
  const vlbl = document.createElement("span");
  vlbl.className = "pr-vowel-label";
  vlbl.textContent = note.vowel ? VOWEL_LABELS[note.vowel] : "";
  el.appendChild(vlbl);

  // ── Resize handle on right edge ── (finding 41: .pr-resize-handle's CSS
  // gives it a >=24px invisible hit zone — see index.html)
  const handle = document.createElement("div");
  handle.className = "pr-resize-handle";
  el.appendChild(handle);

  handle.addEventListener("pointerdown", (e) => startNoteResizeDrag(note, el, handle, e));

  // ── Drag to move ──
  el.addEventListener("pointerdown", (e) => startNoteMoveDrag(note, el, e));

  pr.appendChild(el);
}

/**
 * Start a resize-drag gesture on `note`/`el`'s resize `handle`, from the
 * pointerdown event `e` that triggered it (Wave C2b, findings 38/39/45).
 * Pointer events with setPointerCapture (finding 38) — capture replaces
 * the old window-level mousemove/mouseup pair, so every subsequent event
 * for this pointerId targets `handle` directly regardless of where the
 * pointer physically wanders. pointercancel/lostpointercapture roll the
 * gesture back to its pre-drag duration with no command pushed (finding
 * 39); Escape does the same via cancelActiveDrag (see the keydown
 * handler). A touch-driven drag defers grid-snapping to release (finding
 * 45 — gesture.resolveDragBeats/commitDragBeats); mouse/pen keep the
 * pre-existing live-snap feel — see startNoteMoveDrag below for the same
 * shape applied to the move gesture.
 */
function startNoteResizeDrag(note: Note, el: HTMLElement, handle: HTMLElement, e: PointerEvent) {
  e.stopPropagation();
  // Wave C2b finding 8 — single-gesture policy: see the matching guard in
  // buildPianoRoll's empty-space pointerdown listener.
  if (dragActive) return;
  selectNote(note);
  dragActive = true; // Wave C1 finding 6 — see this flag's declaration
  const startX = e.clientX;
  const startDur = note.durationBeats;
  const pointerId = e.pointerId;
  try { handle.setPointerCapture(pointerId); } catch { /* pointer already gone — best-effort */ }

  const cleanup = () => {
    handle.removeEventListener("pointermove", onMove);
    handle.removeEventListener("pointerup", onUp);
    handle.removeEventListener("pointercancel", onCancel);
    handle.removeEventListener("lostpointercapture", onCancel);
    try { handle.releasePointerCapture(pointerId); } catch { /* already released — pointerup/pointercancel auto-release */ }
    dragActive = false;
    cancelActiveDrag = null;
  };
  const onMove = (e2: PointerEvent) => {
    const rawDur = startDur + (e2.clientX - startX) / PX_PER_BEAT;
    state.resizeNote(note, resolveDragBeats(rawDur, e2.pointerType));
    positionNote(el, note);
  };
  const onUp = () => {
    // Final commit (finding 45): re-quantizes whatever the last onMove
    // tick left in place — a no-op for mouse/pen (already quantized every
    // tick), the one-time snap-to-grid for a touch drag's fluid, unsnapped
    // duration.
    state.resizeNote(note, commitDragBeats(note.durationBeats));
    positionNote(el, note);
    cleanup();
    // Coalesced gesture (Wave C1, finding 2): only the FINAL before/after
    // delta is committed, and only if the resize actually changed
    // anything (a pointerdown with no movement must not pollute the undo
    // stack).
    if (note.durationBeats !== startDur) {
      undo.commit(undo.resizeCommand(note.id, startDur, note.durationBeats));
    }
  };
  const onCancel = () => {
    cleanup();
    state.resizeNote(note, startDur);
    positionNote(el, note);
    // No command pushed — the gesture never happened, as far as undo is
    // concerned (finding 39).
  };
  handle.addEventListener("pointermove", onMove);
  handle.addEventListener("pointerup", onUp);
  handle.addEventListener("pointercancel", onCancel);
  handle.addEventListener("lostpointercapture", onCancel);
  cancelActiveDrag = onCancel;
}

/**
 * Start a move-drag gesture on `note`/`el`, from the pointerdown event `e`
 * that triggered it — called both from the note's own pointerdown listener
 * (renderNote above) and from the roll's empty-space handler's near-miss
 * fallback (buildPianoRoll's findNearbyNoteForDragInit path, finding 41).
 * Same pointer-capture / pointercancel-rollback / deferred-snap shape as
 * startNoteResizeDrag above — see its doc comment for the shared
 * rationale (Wave C2b, findings 38/39/45).
 */
function startNoteMoveDrag(note: Note, el: HTMLElement, e: PointerEvent) {
  // Defensive only — the handle's own pointerdown already stopPropagation()s
  // before this could ever fire for a handle target (see startNoteResizeDrag);
  // kept in case a future call site doesn't go through that guard.
  if ((e.target as HTMLElement).closest(".pr-resize-handle")) return;
  e.stopPropagation();
  // Wave C2b finding 8 — single-gesture policy: see the matching guard in
  // buildPianoRoll's empty-space pointerdown listener. Needed here too
  // (not just there) since renderNote's own per-note pointerdown listener
  // calls this function directly, bypassing that one.
  if (dragActive) return;
  selectNote(note);
  dragActive = true; // Wave C1 finding 6 — see this flag's declaration
  const startX = e.clientX, startY = e.clientY;
  const origBeat = note.startBeat, origMidi = note.midi;
  const pointerId = e.pointerId;
  try { el.setPointerCapture(pointerId); } catch { /* pointer already gone — best-effort */ }

  const cleanup = () => {
    el.removeEventListener("pointermove", onMove);
    el.removeEventListener("pointerup", onUp);
    el.removeEventListener("pointercancel", onCancel);
    el.removeEventListener("lostpointercapture", onCancel);
    try { el.releasePointerCapture(pointerId); } catch { /* already released — pointerup/pointercancel auto-release */ }
    dragActive = false;
    cancelActiveDrag = null;
  };
  const onMove = (e2: PointerEvent) => {
    const rawBeat = origBeat + (e2.clientX - startX) / PX_PER_BEAT;
    const newBeat = resolveDragBeats(rawBeat, e2.pointerType);
    // Deferred-snap (finding 45) is deliberately time-axis only: a MIDI
    // pitch has no fractional/continuous representation anywhere in this
    // app's model (Note.midi is always a whole semitone — state.ts's own
    // clampMidi and every command factory assume that), so there is no
    // "unsnapped" pitch value to defer TO — ROW_H is the note's actual
    // representational granularity, not a cosmetic grid layered on top of
    // a continuous value the way QUANTIZE_GRID_BEATS is. Row-rounding
    // therefore stays unconditional for both mouse and touch.
    const newMidi = origMidi - Math.round((e2.clientY - startY) / ROW_H);
    state.moveNote(note, newBeat, newMidi);
    applyNoteStyle(el, note);
    positionNote(el, note);
    updateInspector();
  };
  const onUp = () => {
    // Final commit (finding 45) — see startNoteResizeDrag's onUp above for
    // the same rationale.
    state.moveNote(note, commitDragBeats(note.startBeat), note.midi);
    applyNoteStyle(el, note);
    positionNote(el, note);
    updateInspector();
    cleanup();
    // Coalesced gesture — see startNoteResizeDrag's onUp above (finding 2).
    if (note.startBeat !== origBeat || note.midi !== origMidi) {
      undo.commit(undo.moveCommand(note.id, { startBeat: origBeat, midi: origMidi }, { startBeat: note.startBeat, midi: note.midi }));
    }
  };
  const onCancel = () => {
    cleanup();
    state.moveNote(note, origBeat, origMidi);
    applyNoteStyle(el, note);
    positionNote(el, note);
    updateInspector();
    // No command pushed — the gesture never happened, as far as undo is
    // concerned (finding 39).
  };
  el.addEventListener("pointermove", onMove);
  el.addEventListener("pointerup", onUp);
  el.addEventListener("pointercancel", onCancel);
  el.addEventListener("lostpointercapture", onCancel);
  cancelActiveDrag = onCancel;
}

function positionNote(el: HTMLElement, note: Note) {
  el.style.left = note.startBeat * PX_PER_BEAT + "px";
  el.style.top = (MIDI_HI - note.midi) * ROW_H + "px";
  el.style.width = Math.max(8, note.durationBeats * PX_PER_BEAT) + "px";
  el.style.height = ROW_H - 1 + "px";
}

/** Set background + vowel label based on current mode */
function applyNoteStyle(el: HTMLElement, note: Note) {
  if (mode === "vocal" && note.vowel) {
    el.style.background = VOWEL_COLORS[note.vowel];
    el.classList.add("pr-note-vocal");
    const lbl = el.querySelector<HTMLElement>(".pr-vowel-label");
    if (lbl) lbl.textContent = VOWEL_LABELS[note.vowel];
  } else {
    el.style.background = PC_COLORS[((note.midi % 12) + 12) % 12];
    el.classList.remove("pr-note-vocal");
    const lbl = el.querySelector<HTMLElement>(".pr-vowel-label");
    if (lbl) lbl.textContent = "";
  }
}

/** Remove + re-render every note (called on mode switch) */
function rerenderAllNotes() {
  document.querySelectorAll(".pr-note").forEach(el => el.remove());
  for (const n of state.getScore()) renderNote(n);
  const selected = state.getSelectedNote();
  if (selected) {
    document.querySelector(noteSelector(selected.id))?.classList.add("selected");
  }
}

function selectNote(note: Note | null) {
  document.querySelectorAll(".pr-note.selected").forEach((el) => el.classList.remove("selected"));
  state.selectNote(note);
  if (note) {
    document.querySelector(noteSelector(note.id))?.classList.add("selected");
  }
  updateInspector();
}

function deleteSelectedNote() {
  const note = state.getSelectedNote();
  if (!note) return;
  undo.execute(undo.deleteNoteCommand(note));
  document.querySelector(noteSelector(note.id))?.remove();
  updateInspector();
}

/** Show/hide the "click to add a note" hint (F-B1-009) — visible while the
 *  score is empty, hidden as soon as the first note exists. */
function updateFirstRunHint() {
  const hint = document.getElementById("pr-hint");
  if (hint) hint.style.display = state.getScore().length === 0 ? "" : "none";
}

// ─── Ruler / Loop Region / Auto-scroll (Wave C2a) ───────────────────────────
//
// Time-ruler surface docked above the piano roll, INSIDE the same
// horizontal scroll context (index.html's #pr-ruler is position:sticky, so
// it stays pinned to the top of the viewport on vertical scroll while its
// horizontal position scrolls with the roll's content like every other
// piano-roll element). Owns three related surfaces: beat/bar ticks (static,
// built once), click-to-seek + drag-to-define-a-loop-region (one pointerdown
// handler, disambiguated by movement distance), and the playhead
// auto-scroll-follow feature (finding 43). The actual math for all of this
// lives in ruler.ts (pure, DOM-free, unit-tested); this section is DOM glue
// only. #pr-ruler is a separate DOM element positioned entirely above
// #piano-roll, so it never intercepts the roll's own click-to-add-note
// handler — no interaction-conflict guard needed on either side.

function buildRuler() {
  const ruler = $("pr-ruler");
  ruler.style.width = PR_WIDTH + "px";
  ruler.style.height = RULER_HEIGHT_PX + "px";

  // Wave C2b finding 6 (WCAG 2.1.1 — keyboard access): the ruler was
  // pointer-only. Focusable + role="slider" with a keyboard seek handler
  // below. Region-SETTING (drag-to-define-a-loop-region) stays pointer-
  // only this wave — see the keydown handler's own comment — the
  // shortcuts overlay calls that out explicitly too.
  ruler.tabIndex = 0;
  ruler.setAttribute("role", "slider");
  ruler.setAttribute("aria-label", "Playback position");
  ruler.setAttribute("aria-valuemin", "0");
  ruler.setAttribute("aria-valuemax", String(computeScoreEndBeat(state.getScore())));
  ruler.setAttribute("aria-valuenow", "0");

  for (const tick of computeRulerTicks(SCORE_BEATS, 4)) {
    const el = document.createElement("div");
    el.className = "pr-ruler-tick" + (tick.isBar ? " bar" : "");
    el.style.left = tick.px + "px";
    ruler.appendChild(el);
    if (tick.isBar && tick.barNumber !== null) {
      const lbl = document.createElement("div");
      lbl.className = "pr-ruler-bar-label";
      lbl.style.left = tick.px + 3 + "px";
      lbl.textContent = String(tick.barNumber);
      ruler.appendChild(lbl);
    }
  }

  // Loop-region band (ruler strip) + its clear affordance (>=24px hit zone).
  const band = document.createElement("div");
  band.className = "pr-region-band";
  band.id = "pr-region-band";
  band.style.display = "none";
  const clearBtn = document.createElement("button");
  clearBtn.className = "pr-region-clear";
  clearBtn.id = "pr-region-clear";
  clearBtn.setAttribute("aria-label", "Clear loop region");
  clearBtn.title = "Clear loop region";
  clearBtn.textContent = "×";
  clearBtn.addEventListener("pointerdown", (e) => e.stopPropagation()); // don't ALSO start a ruler drag
  clearBtn.addEventListener("click", (e) => { e.stopPropagation(); setLoopRegion(null); });
  band.appendChild(clearBtn);
  ruler.appendChild(band);

  // Optional subtler echo of the region over the roll itself (design note:
  // "and optionally a subtle band over the roll").
  const rollBand = document.createElement("div");
  rollBand.className = "pr-roll-region-band";
  rollBand.id = "pr-roll-region-band";
  rollBand.style.display = "none";
  $("piano-roll").appendChild(rollBand);

  // Click (no movement) -> seek; drag (movement past DRAG_THRESHOLD_PX) ->
  // define a loop region. Both share one pointerdown/pointermove/pointerup
  // gesture (Wave C2b: setPointerCapture(e.pointerId) on `ruler` replaces
  // the old window-level mousemove/mouseup pair — same migration shape as
  // renderNote's move/resize handles). pointercancel/lostpointercapture
  // roll back to whatever loopRegion was set BEFORE this gesture started
  // (finding 39) — this gesture doesn't touch `dragActive`/undo (loopRegion
  // is transport UI state, never on the undo stack — see its own doc
  // comment), so "rollback" here just means "don't keep a half-defined
  // region from an interrupted drag."
  ruler.addEventListener("pointerdown", (e) => {
    // Wave C2b finding 8 — single-gesture policy: a second touch point
    // while a note drag is already active must not ALSO start a ruler
    // seek/region-drag gesture (this gesture doesn't set dragActive itself
    // — see the doc comment above — but it must still defer to one).
    if (dragActive) return;
    if ((e.target as HTMLElement).closest(".pr-region-clear")) return;
    // Re-measured on every move (not cached once) so a mid-drag horizontal
    // scroll of the container can't leave this reading a stale left edge.
    const rulerPxOf = (ev: PointerEvent) => ev.clientX - ruler.getBoundingClientRect().left;
    const anchorPx = rulerPxOf(e);
    const anchorBeat = pxToBeat(anchorPx);
    const regionBeforeDrag = loopRegion;
    const pointerId = e.pointerId;
    let moved = false;
    try { ruler.setPointerCapture(pointerId); } catch { /* pointer already gone — best-effort */ }

    const cleanup = () => {
      ruler.removeEventListener("pointermove", onMove);
      ruler.removeEventListener("pointerup", onUp);
      ruler.removeEventListener("pointercancel", onCancel);
      ruler.removeEventListener("lostpointercapture", onCancel);
      try { ruler.releasePointerCapture(pointerId); } catch { /* already released */ }
    };
    const onMove = (e2: PointerEvent) => {
      const px = rulerPxOf(e2);
      if (!moved && Math.abs(px - anchorPx) > DRAG_THRESHOLD_PX) moved = true;
      if (moved) setLoopRegion(normalizeRegion(anchorBeat, pxToBeat(px), MIN_REGION_BEATS, SCORE_BEATS));
    };
    const onUp = () => {
      cleanup();
      // transportSeek (not transport.seekTo — Wave C3): while recording,
      // a seek commits the in-flight pass first so capture never spans
      // the discontinuity.
      if (!moved) transportSeek(quantizeBeats(anchorBeat));
    };
    const onCancel = () => {
      cleanup();
      setLoopRegion(regionBeforeDrag);
    };
    ruler.addEventListener("pointermove", onMove);
    ruler.addEventListener("pointerup", onUp);
    ruler.addEventListener("pointercancel", onCancel);
    ruler.addEventListener("lostpointercapture", onCancel);
  });

  // Keyboard seek (Wave C2b finding 6): ArrowLeft/Right = +-1 beat,
  // Shift+Arrow = +-1 bar (4 beats), Home/End = start/score-end. Defining
  // a loop region from the keyboard is explicitly OUT of scope this wave
  // — region-set stays pointer-only (drag on the ruler); only seeking is
  // covered here. stopPropagation() on every key this handler recognizes
  // keeps the global keydown handler's ArrowLeft/Right note-nudge shortcut
  // (isRollEditContext() is also true here, since #pr-ruler sits inside
  // #piano-roll-container) from ALSO firing for the same keypress.
  ruler.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    const pos = transport.getPositionBeats();
    let target: number | null = null;
    if (k === "arrowleft") target = pos - (e.shiftKey ? 4 : 1);
    else if (k === "arrowright") target = pos + (e.shiftKey ? 4 : 1);
    else if (k === "home") target = 0;
    else if (k === "end") target = computeScoreEndBeat(state.getScore());
    if (target === null) return;
    e.preventDefault();
    e.stopPropagation();
    transportSeek(target); // Wave C3 — see the pointer-seek comment above
  });
}

function setLoopRegion(region: LoopRegion | null): void {
  loopRegion = region;
  renderLoopRegionBand();
}

function renderLoopRegionBand(): void {
  const band = document.getElementById("pr-region-band") as HTMLElement | null;
  const rollBand = document.getElementById("pr-roll-region-band") as HTMLElement | null;
  if (!band) return;
  if (!loopRegion) {
    band.style.display = "none";
    if (rollBand) rollBand.style.display = "none";
    return;
  }
  const left = loopRegion.startBeat * PX_PER_BEAT;
  const width = (loopRegion.endBeat - loopRegion.startBeat) * PX_PER_BEAT;
  band.style.display = "block";
  band.style.left = left + "px";
  band.style.width = width + "px";
  if (rollBand) {
    rollBand.style.display = "block";
    rollBand.style.left = left + "px";
    rollBand.style.width = width + "px";
  }
}

/** Called from the transport's onTick while playing (see init()). Keeps
 *  the playhead in view by jump-scrolling the container once it crosses
 *  ~70% of the visible width — see ruler.ts's computeFollowScroll for the
 *  threshold/target math; this only supplies live DOM measurements and
 *  applies the result. */
function applyFollowScroll(positionBeats: number): void {
  // Wave C2b finding 8 — a drag in progress must not have the roll's
  // content jump horizontally underneath it: the drag's own onMove math
  // reads clientX against the element's CURRENT position, and a follow
  // jump mid-drag would corrupt that reading (the note would appear to
  // leap when the container scrolled, not the pointer).
  if (!followEnabled || !transport.isPlaying() || dragActive) return;
  const container = $("piano-roll-container");
  const playheadPx = positionBeats * PX_PER_BEAT;
  const maxScrollLeft = container.scrollWidth - container.clientWidth;
  const target = computeFollowScroll(playheadPx, container.scrollLeft, container.clientWidth, maxScrollLeft);
  if (target === null) return;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  programmaticScroll(() => {
    container.scrollTo({ left: target, behavior: reducedMotion ? "auto" : "smooth" });
  });
}

function bindFollowToggle(): void {
  const btn = $("btn-follow") as HTMLButtonElement;
  const applyButtonState = () => {
    btn.classList.toggle("active", followEnabled);
    btn.setAttribute("aria-pressed", String(followEnabled));
  };
  applyButtonState();
  btn.addEventListener("click", () => {
    followEnabled = !followEnabled;
    applyButtonState();
  });

  // Manual scrolling (wheel/touch/scrollbar) while playing disables follow
  // until re-toggled — distinguished from our own programmatic scroll()
  // calls via the grace-window flag (see programmaticScroll() above).
  const container = $("piano-roll-container");
  // Wave C2b finding 3 — only a HORIZONTAL move can mean "the user took
  // over," since follow only ever scrolls horizontally itself; a vertical
  // (row-browsing) scroll must never disable it. Tracked directly rather
  // than inspecting the event (a native "scroll" event carries no delta),
  // so this listener stays the single source of truth for "did scrollLeft
  // actually change" across every scroll on this container, ours or not.
  let lastScrollLeft = container.scrollLeft;
  container.addEventListener("scroll", () => {
    const left = container.scrollLeft;
    const movedHorizontally = left !== lastScrollLeft;
    lastScrollLeft = left;
    if (!movedHorizontally) return;
    if (performance.now() < programmaticScrollUntil) return; // our own scroll — ignore
    if (followEnabled) { followEnabled = false; applyButtonState(); }
  });
}

// ─── Keyboard Note Editing (F-B1-002) ────────────────────────────────────────
//
// Piano-roll editing without a mouse: reuses the existing selectNote/state.
// getSelectedNote() concept (mouse-click selection already applies the
// `.selected` CSS class — accent border + box-shadow — as the visible focus
// outline, so nothing new is needed there). Bound from the same keydown
// listener as the existing Space/Escape/Delete shortcuts in buildKeyboard(),
// so it inherits the same isTypingTarget()/ctrl-meta-alt guards for free.

/** Tab / Shift-Tab — move selection to the next/previous note, ordered by
 *  start time then pitch (a stable, predictable traversal order — the
 *  score array itself is insertion-ordered, which would jump around). */
function cycleNoteSelection(dir: 1 | -1) {
  const notes = state.getScore();
  if (notes.length === 0) return;
  const ordered = [...notes].sort((a, b) => a.startBeat - b.startBeat || a.midi - b.midi);
  const selected = state.getSelectedNote();
  const curIdx = selected ? ordered.indexOf(selected) : -1;
  const nextIdx = curIdx < 0 ? (dir > 0 ? 0 : ordered.length - 1) : (curIdx + dir + ordered.length) % ordered.length;
  selectNote(ordered[nextIdx]);
  programmaticScroll(() => {
    document.querySelector(noteSelector(ordered[nextIdx].id))?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
}

/** ArrowUp/Down (±1 semitone) and ArrowLeft/Right (±1 grid step) on the
 *  selected note — same clamp/quantize rules as mouse drag (positionNote /
 *  state.moveNote) so keyboard and mouse edits stay consistent. */
function nudgeSelectedNote(semitones: number, steps: number) {
  const note = state.getSelectedNote();
  if (!note) return;
  const before: undo.Point = { startBeat: note.startBeat, midi: note.midi };
  const rawBeat = steps !== 0 ? quantizeBeats(note.startBeat + QUANTIZE_GRID_BEATS * steps) : note.startBeat;
  const after = state.clampedMoveTarget(note, rawBeat, note.midi + semitones);
  // Wave C1 finding 2: null means the clamped target is identical to where
  // the note already is (e.g. ArrowUp at MIDI_HI, ArrowLeft at beat 0) —
  // skip entirely rather than pushing a no-op command. undo.execute()
  // unconditionally wipes the redo stack, so a vacuous command here would
  // silently destroy the user's redo history for zero visible effect.
  if (!after) return;
  // Each keypress is its own command (no coalescing) — a nudge is already
  // a single discrete gesture, unlike a mouse drag's continuous stream.
  undo.execute(undo.moveCommand(note.id, before, after));
  const el = document.querySelector<HTMLElement>(noteSelector(note.id));
  if (el) { applyNoteStyle(el, note); positionNote(el, note); }
  updateInspector();
}

/** Resize the selected note by one grid step (Wave C2b findings 40/44) —
 *  Shift+ArrowLeft/Right AND the toolbar's Resize+/- buttons (bindGesture
 *  AltControls below) both call this, so keyboard and button paths commit
 *  through the exact same resizeCommand shape a mouse/touch resize-drag
 *  does. One command per call (no coalescing — same "each keypress/click
 *  is its own discrete gesture" reasoning as nudgeSelectedNote above).
 *  gesture.ts's resizeStepTarget supplies the floor-at-one-grid-step math;
 *  a call that would be a no-op (already at the floor) is skipped for the
 *  same redo-stack-preservation reason nudgeSelectedNote skips its own
 *  no-op case. */
function resizeSelectedNoteByStep(steps: number) {
  const note = state.getSelectedNote();
  if (!note) return;
  const before = note.durationBeats;
  const after = resizeStepTarget(before, steps);
  if (after === before) return;
  undo.execute(undo.resizeCommand(note.id, before, after));
  const el = document.querySelector<HTMLElement>(noteSelector(note.id));
  if (el) positionNote(el, note);
}

/** Enter / Insert — add a new note at the current playhead position. Reuses
 *  the selected note's pitch/vowel as a starting point when one exists, so
 *  rapid keyboard entry (nudge, insert, nudge, insert...) stays musically
 *  useful instead of always dropping back to middle C. */
function insertNoteAtPlayhead() {
  const selected = state.getSelectedNote();
  const midi = selected ? selected.midi : 60;
  const startBeat = quantizeBeats(transport.getPositionBeats());
  const init: NoteInit = {
    midi, startBeat,
    durationBeats: DEFAULT_NOTE_DURATION_BEATS, velocity: 100,
    ...(mode === "vocal" ? { vowel: selected?.vowel ?? vocalSynth.getVowel(), breathiness: selected?.breathiness ?? getCurrentBreathiness() } : {}),
  };
  undo.execute(undo.addNoteCommand(init));
  const note = state.getSelectedNote()!; // addNoteCommand.redo() selects the new note
  renderNote(note);
  selectNote(note); // DOM `.selected` class + inspector sync (state.selectNote() re-run inside is a harmless no-op)
  programmaticScroll(() => {
    document.querySelector(noteSelector(note.id))?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
}

// ─── Move Mode + Resize+/- (Wave C2b finding 40 — WCAG 2.5.7 non-drag
// single-pointer alternative to a note move/resize drag) ────────────────────

/** Toggle Move mode (toolbar btn-move-mode) on/off. While armed, the NEXT
 *  pointerdown anywhere on the roll relocates the selected note to the
 *  tapped beat/pitch (see bindGestureAltControls's capture-phase
 *  listener) and auto-exits. Requires a selection to arm — the button is
 *  disabled with none (see updateGestureAltButtons). */
function toggleMoveMode() {
  if (!state.getSelectedNote()) return;
  moveModeActive = !moveModeActive;
  applyMoveModeButtonState();
}

function exitMoveMode() {
  if (!moveModeActive) return;
  moveModeActive = false;
  applyMoveModeButtonState();
}

function applyMoveModeButtonState() {
  const btn = $("btn-move-mode") as HTMLButtonElement;
  btn.classList.toggle("active", moveModeActive);
  btn.setAttribute("aria-pressed", String(moveModeActive));
}

/** Relocate the currently-selected note to a tapped/clicked pixel position
 *  within the roll (finding 40) — one undoable command via the SAME
 *  moveCommand path a mouse/touch move-drag commits through. Quantizes
 *  the same way click-to-add-note does (gesture.ts's moveModeTarget) and
 *  clamps via state.ts's clampedMoveTarget, so tapping the note's own
 *  current cell is a safe no-op (no command, no redo-stack wipe — same
 *  reasoning as nudgeSelectedNote/resizeSelectedNoteByStep above). */
function relocateSelectedNoteTo(xPx: number, yPx: number) {
  const note = state.getSelectedNote();
  if (!note) return;
  const target = moveModeTarget(xPx, yPx, ROW_H, MIDI_HI, PX_PER_BEAT);
  const before: undo.Point = { startBeat: note.startBeat, midi: note.midi };
  const after = state.clampedMoveTarget(note, target.startBeat, target.midi);
  if (!after) return;
  undo.execute(undo.moveCommand(note.id, before, after));
  const el = document.querySelector<HTMLElement>(noteSelector(note.id));
  if (el) { applyNoteStyle(el, note); positionNote(el, note); }
  updateInspector();
}

/** Enable/disable the Move + Resize+/- toolbar buttons to match whether a
 *  note is currently selected (all three are no-ops with nothing
 *  selected). Called from updateInspector() — the existing single
 *  "selection changed" chokepoint (selectNote, performUndo/performRedo,
 *  setMode, importScore all already call it) — so this never drifts out
 *  of sync. Auto-exits Move mode if the selection it was armed for
 *  disappears (e.g. Del while armed) instead of leaving it stuck active
 *  with nothing to relocate. */
function updateGestureAltButtons() {
  const hasSelection = state.getSelectedNote() !== null;
  if (!hasSelection) exitMoveMode();
  ($("btn-move-mode") as HTMLButtonElement).disabled = !hasSelection;
  ($("btn-resize-dec") as HTMLButtonElement).disabled = !hasSelection;
  ($("btn-resize-inc") as HTMLButtonElement).disabled = !hasSelection;
}

/** Wire the Move/Resize+/- toolbar buttons (called once from init()) and
 *  the capture-phase pointerdown listener that lets Move mode commandeer
 *  the next tap on the roll ahead of both the roll's own empty-space
 *  handler AND any note's own move-drag-start handler (both are bubble-
 *  phase listeners on the roll/its note children — a capture-phase
 *  listener here runs first and, when armed, stopPropagation()s so
 *  neither of those ever sees this pointerdown). */
function bindGestureAltControls() {
  ($("btn-move-mode") as HTMLButtonElement).addEventListener("click", toggleMoveMode);
  ($("btn-resize-dec") as HTMLButtonElement).addEventListener("click", () => resizeSelectedNoteByStep(-1));
  ($("btn-resize-inc") as HTMLButtonElement).addEventListener("click", () => resizeSelectedNoteByStep(1));
  updateGestureAltButtons(); // initial (all-disabled, nothing selected yet) state

  const pr = $("piano-roll");
  pr.addEventListener("pointerdown", (e) => {
    if (!moveModeActive) return;
    // Wave C2b finding 8 — single-gesture policy: a second touch point
    // while a note drag is already active must not ALSO relocate the
    // selected note via Move mode.
    if (dragActive) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = pr.getBoundingClientRect();
    relocateSelectedNoteTo(e.clientX - rect.left, e.clientY - rect.top);
    exitMoveMode();
  }, { capture: true });
}

/** Ctrl+Z / toolbar Undo button. Undo/redo traversal doesn't know which
 *  note(s) a popped command touched (could be a single-note delta or a
 *  whole-score Clear/Import snapshot), so — unlike the surgical single-
 *  element DOM updates execute()/commit() call sites do — this always
 *  does a full rerenderAllNotes() to resync the DOM with state.ts, same
 *  as a mode switch already does. undo.setOnChange (afterUndoStackChange)
 *  handles the button-disabled-state refresh and onStateChanged(); this
 *  only needs to handle the DOM-note-sync afterUndoStackChange can't. */
function performUndo() {
  // Lens-I finding 1 — REPLACE mode's live cycle-boundary sweep can delete
  // notes an OLDER, already-committed pass's captureCommand still expects
  // to find (see shouldRefuseUndoWhileRecording's doc comment in
  // capture.ts for the full corruption mechanism); refusing every undo
  // attempt while actively recording kills that corruption class without
  // needing to prove which particular older command would still be safe.
  // Full depth returns the instant recording stops — Ableton's own
  // "remove the last take" convention then falls straight out of the
  // existing linear stack with no special-casing.
  if (shouldRefuseUndoWhileRecording(recordPhase)) {
    showToast("Stop recording to undo earlier edits");
    return;
  }
  if (!undo.undo()) return;
  rerenderAllNotes();
  updateInspector();
  updateFirstRunHint();
}

/** Ctrl+Shift+Z / Ctrl+Y / toolbar Redo button — see performUndo above. */
function performRedo() {
  if (!undo.redo()) return;
  rerenderAllNotes();
  updateInspector();
  updateFirstRunHint();
}

// ─── Inspector ───────────────────────────────────────────────────────────────

function updateInspector() {
  // Wave C2b: the Move/Resize+/- toolbar buttons (finding 40) enable only
  // with a selection — updateInspector() is the existing single "selection
  // changed" chokepoint every relevant call site already goes through, so
  // folding this in here keeps it in sync for free rather than needing a
  // second call added at every one of those sites.
  updateGestureAltButtons();
  const insp = $("inspector");
  const note = state.getSelectedNote();
  if (!note) { insp.classList.remove("active"); return; }
  insp.classList.add("active");
  $("insp-name").textContent = noteName(note.midi);
  ($("insp-vel") as HTMLInputElement).value = String(note.velocity);
  $("insp-vel-val").textContent = String(note.velocity);
  // Vocal-specific inspector fields
  const vSection = $("insp-vocal");
  if (mode === "vocal" && note.vowel) {
    vSection.style.display = "flex";
    // Highlight active vowel
    vSection.querySelectorAll<HTMLButtonElement>(".insp-vowel-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.vowel === note.vowel);
    });
    ($('insp-breath') as HTMLInputElement).value = String(Math.round((note.breathiness ?? 0.15) * 100));
    $("insp-breath-val").textContent = String(Math.round((note.breathiness ?? 0.15) * 100));
  } else {
    vSection.style.display = "none";
  }
}

// ─── Keyboard ────────────────────────────────────────────────────────────────

const KB_LO = 48; // C3
const KB_HI = 84; // C6 (inclusive)
const KB_WHITES: number[] = [];
for (let m = KB_LO; m <= KB_HI; m++) if (!IS_BLACK[m % 12]) KB_WHITES.push(m);

interface KeyboardKeyRef { el: HTMLElement; midi: number; isBlack: boolean }
const keyboardKeys: KeyboardKeyRef[] = [];

/**
 * Wire one on-screen keyboard key's press/release gesture (Wave C2b,
 * finding 38: pointer events, shared by both the white- and black-key
 * build loops below — previously two near-identical mousedown/mouseup/
 * mouseleave triples). setPointerCapture on pointerdown so pointerup
 * reliably targets THIS key even if released elsewhere; pointerleave is
 * unaffected by capture per the Pointer Events spec (boundary events keep
 * reflecting the real hit-test even while another event type is
 * captured), so it still fires exactly when the old mouseleave did — "a
 * finger sliding off a key releases the note" (finding 39) — with
 * pointercancel/lostpointercapture as safety nets for a gesture the OS/
 * browser interrupts outright.
 */
function bindOnScreenKeyPointer(key: HTMLElement, midi: number): void {
  // Wave C3 — every handler forwards its own event's timeStamp so a
  // captured on-screen press is stamped at the event's system-receipt
  // time, not handler-run time (finding 18; source "onscreen" for
  // per-source calibration, finding 20).
  const live = (e: Event): { source: CaptureSource; timeStampMs: number } =>
    ({ source: "onscreen", timeStampMs: e.timeStamp });
  key.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    try { key.setPointerCapture(e.pointerId); } catch { /* best-effort */ }
    midiKeyDown(midi, 100, live(e));
  });
  key.addEventListener("pointerup", (e) => midiKeyUp(midi, live(e)));
  key.addEventListener("pointerleave", (e) => { if (heldMidi.has(midi)) midiKeyUp(midi, live(e)); });
  key.addEventListener("pointercancel", (e) => { if (heldMidi.has(midi)) midiKeyUp(midi, live(e)); });
  key.addEventListener("lostpointercapture", (e) => { if (heldMidi.has(midi)) midiKeyUp(midi, live(e)); });
}

function buildKeyboard() {
  const kb = $("keyboard");

  // White keys
  for (let i = 0; i < KB_WHITES.length; i++) {
    const midi = KB_WHITES[i];
    const key = document.createElement("div");
    key.className = "kb-white";
    key.dataset.midi = String(midi);

    if (midi % 12 === 0) {
      const lbl = document.createElement("div");
      lbl.className = "kb-label";
      lbl.textContent = noteName(midi);
      key.appendChild(lbl);
    }
    if (QWERTY_LABELS[midi]) {
      const sc = document.createElement("div");
      sc.className = "kb-shortcut";
      sc.textContent = QWERTY_LABELS[midi];
      sc.style.bottom = "36px";
      key.appendChild(sc);
    }

    bindOnScreenKeyPointer(key, midi);
    kb.appendChild(key);
    keyboardKeys.push({ el: key, midi, isBlack: false });
  }

  // Black keys
  for (let m = KB_LO; m <= KB_HI; m++) {
    if (!IS_BLACK[m % 12]) continue;
    if (KB_WHITES.indexOf(m - 1) < 0) continue;

    const key = document.createElement("div");
    key.className = "kb-black";
    key.dataset.midi = String(m);

    if (QWERTY_LABELS[m]) {
      const sc = document.createElement("div");
      sc.className = "kb-shortcut";
      sc.textContent = QWERTY_LABELS[m];
      sc.style.bottom = "8px";
      // #666 (~2.1:1 on key-black incl. the shared .kb-shortcut opacity) failed
      // WCAG AA; #8c8c8c is solid (no opacity) at ~5.1:1 (F-B1-007).
      sc.style.color = "#8c8c8c";
      key.appendChild(sc);
    }

    bindOnScreenKeyPointer(key, m);
    kb.appendChild(key);
    keyboardKeys.push({ el: key, midi: m, isBlack: true });
  }

  layoutKeyboard();

  // Key geometry was previously computed once from kb.clientWidth at init
  // (falling back to 800 if the element had no width yet) and never
  // recomputed — resizing the window left the keyboard clipped or short,
  // and wrong from the start if the initial layout pass hadn't finished
  // (F-A1: keyboard not responsive to resize). Recompute on resize, coalesced
  // to one layout pass per frame.
  let resizeRaf = 0;
  new ResizeObserver(() => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(layoutKeyboard);
  }).observe(kb);

  // QWERTY events
  window.addEventListener("keydown", (e) => {
    // Typing in an input/select/textarea (or any contenteditable) must never
    // trigger notes/transport/deletion — this used to exempt only INPUT and
    // SELECT, so the score/tuning JSON textareas were unusable for hand
    // editing (every mapped letter played a note, Space/Backspace were
    // preventDefault'd instead of typing) (F-A1-007). Checked before the
    // repeat bail below (unlike the old ordering) since it must apply
    // identically to both a first keydown and a held-key repeat.
    if (isTypingTarget(e)) return;

    // Undo/redo (Wave C1) — carved out of the Ctrl/Cmd-bail below so
    // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y (+ Cmd on mac, via metaKey) reach the
    // command stack instead of being swallowed by the "don't hijack Ctrl
    // combos" guard just below. Still respects isTypingTarget() above
    // (ignored while typing) and excludes Alt so a Ctrl+Alt+Z-style combo
    // falls through to that guard untouched. Also excludes a mid-drag
    // gesture (Wave C1 finding 6 — dragActive) since an undo/redo mid-drag
    // would rerenderAllNotes() out from under the drag's own closures.
    // Deliberately checked BEFORE the e.repeat bail below (Wave C1 finding
    // 7): a held-down Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y should keep repeating
    // undo/redo, same as every mainstream editor's hold-to-undo — every
    // OTHER shortcut below still ignores key-repeat.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !dragActive) {
      const uk = e.key.toLowerCase();
      if (uk === "z" && e.shiftKey) { e.preventDefault(); performRedo(); return; }
      if (uk === "z") { e.preventDefault(); performUndo(); return; }
      if (uk === "y") { e.preventDefault(); performRedo(); return; }
    }

    if (e.repeat) return;

    // Don't hijack any other Ctrl/Cmd/Alt combos (Ctrl+C, Ctrl+V, Cmd+A, ...).
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const k = e.key.toLowerCase();
    // Shortcuts overlay (F-A1-009) — the first-run hint has promised
    // "press ? for shortcuts" since it was written; this makes it true.
    if (k === "?") { e.preventDefault(); toggleShortcutsOverlay(); return; }
    if (k === " ") {
      // A focused button/link/[role=button] owns Space natively — only
      // hijack it for play/pause when focus isn't on one of those
      // (F-A1: keyboard-editing scope regression).
      if (isActivatableControl(document.activeElement)) return;
      e.preventDefault();
      // Wave C3 — during a count-in, Space means "abort the pending
      // record start," not "also start playback under the count-in."
      if (recordPhase === "counting-in") { cancelCountIn(); return; }
      transport.togglePlayPause(); return;
    }
    if (k === "escape") {
      // Wave C2b finding 39 — Esc-cancel takes precedence over panic while
      // a note drag is active: rolls the gesture back cleanly (same path
      // as pointercancel — restore pre-drag geometry, release capture, no
      // command) instead of only silencing audio. Gated on `dragActive`
      // (not just cancelActiveDrag != null) to keep this scoped to exactly
      // the same gestures that flag already guards elsewhere (see its own
      // doc comment) — the ruler's own drag deliberately never sets it
      // (see buildRuler), so Esc there still means panic, unchanged.
      if (dragActive && cancelActiveDrag) { e.preventDefault(); cancelActiveDrag(); return; }
      // Move mode (finding 40) is likewise a pending gesture worth
      // escaping out of cleanly rather than leaving armed with no visible
      // way to cancel it (a touch-only user has no "click elsewhere" this
      // toolbar's aria-pressed toggle already covers) — this is additive
      // beyond what any pinned finding requires, called out here in case
      // it should be reverted.
      if (moveModeActive) { e.preventDefault(); exitMoveMode(); return; }
      panic();
      return;
    }
    if (k === "delete" || k === "backspace") {
      // Only intercept when there's actually a note to delete — otherwise
      // this stole Backspace/Delete from every other context on the page
      // for nothing (F-A1: keyboard-editing scope regression).
      if (state.getSelectedNote()) { e.preventDefault(); deleteSelectedNote(); }
      return;
    }
    // Keyboard editing of the piano roll (F-B1-002) — selection, pitch/time
    // nudge, and insert, so the roll is usable without a mouse. Scoped to
    // when the roll is actually the active editing surface (isRollEditContext)
    // so it never hijacks Tab focus-nav or Enter/arrow-key behavior on the
    // ARIA-labeled controls elsewhere on the page (F-A1: keyboard-editing
    // scope regression).
    if (k === "tab") {
      if (isRollEditContext()) { e.preventDefault(); cycleNoteSelection(e.shiftKey ? -1 : 1); }
      return;
    }
    if (k === "arrowup") { if (isRollEditContext()) { e.preventDefault(); nudgeSelectedNote(1, 0); } return; }
    if (k === "arrowdown") { if (isRollEditContext()) { e.preventDefault(); nudgeSelectedNote(-1, 0); } return; }
    // Shift+Left/Right resizes by one grid step (finding 44) instead of
    // moving — reuses resizeCommand via the same resizeSelectedNoteByStep
    // path the toolbar's Resize+/- buttons call (finding 40).
    if (k === "arrowleft") {
      if (isRollEditContext()) { e.preventDefault(); e.shiftKey ? resizeSelectedNoteByStep(-1) : nudgeSelectedNote(0, -1); }
      return;
    }
    if (k === "arrowright") {
      if (isRollEditContext()) { e.preventDefault(); e.shiftKey ? resizeSelectedNoteByStep(1) : nudgeSelectedNote(0, 1); }
      return;
    }
    if (k === "enter" || k === "insert") {
      if (isRollEditContext()) { e.preventDefault(); insertNoteAtPlayhead(); }
      return;
    }

    const code = e.code;
    if (QWERTY[code] !== undefined && !heldKeys.has(code)) {
      heldKeys.add(code);
      // Wave C3 — e.timeStamp (system-receipt time, finding 18) +
      // e.repeat (finding 21; belt-and-suspenders — the heldKeys guard
      // above already stops repeats reaching here, and the handler's own
      // `if (e.repeat) return` bail sits further up still).
      midiKeyDown(QWERTY[code], 100, { source: "qwerty", timeStampMs: e.timeStamp, repeat: e.repeat });
    }
  });

  window.addEventListener("keyup", (e) => {
    if (isTypingTarget(e)) return;
    const code = e.code;
    if (QWERTY[code] !== undefined) { heldKeys.delete(code); midiKeyUp(QWERTY[code], { source: "qwerty", timeStampMs: e.timeStamp }); }
  });
}

/** Reposition every existing key element from current keyboard-container
 *  width — called on initial build and on every ResizeObserver frame. */
function layoutKeyboard() {
  const kb = $("keyboard");
  const totalW = kb.clientWidth || 800;
  const ww = totalW / KB_WHITES.length;
  const bw = ww * 0.58;

  for (const { el, midi, isBlack } of keyboardKeys) {
    if (!isBlack) {
      const i = KB_WHITES.indexOf(midi);
      el.style.left = i * ww + "px";
      el.style.width = (ww - 1) + "px";
    } else {
      const wi = KB_WHITES.indexOf(midi - 1);
      if (wi < 0) continue;
      el.style.left = ((wi + 1) * ww - bw / 2 - 0.5) + "px";
      el.style.width = bw + "px";
    }
  }
}

/** INPUT types that never accept text entry — Ctrl+Z with one of these
 *  focused (e.g. a velocity/breathiness/ref-pitch <input type=range>
 *  slider, still focused after a drag) must reach the undo/redo
 *  carve-out instead of being swallowed by the typing-target bail (Wave
 *  C1 finding 3: Ctrl+Z was dead while ANY <input> held focus). Every
 *  OTHER input type (text, number, search, ... — anything not listed
 *  here) keeps the bail: those DO accept typed text, and native
 *  browser undo inside them must not be hijacked. */
const NON_TEXT_INPUT_TYPES = new Set([
  "range", "checkbox", "radio", "button", "submit", "reset", "color", "file", "image",
]);

/** True when the event's target (or the currently focused element) is a
 *  text-entry control — used to keep global keyboard shortcuts (note
 *  triggering, Space/Delete/Escape) from hijacking typing in the score/tuning
 *  JSON textareas or any other form field (F-A1-007). */
function isTypingTarget(e: KeyboardEvent): boolean {
  const el = (e.target as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT") return !NON_TEXT_INPUT_TYPES.has((el as HTMLInputElement).type);
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!el.isContentEditable;
}

/** True for elements where native Space/Enter already means "activate" —
 *  buttons, links, and ARIA role=button — so the global Space=play/pause
 *  shortcut must never steal the keystroke from them. Inputs/selects/
 *  textareas never reach this check; they already exit earlier via
 *  isTypingTarget (F-A1: keyboard-editing scope regression). */
function isActivatableControl(el: Element | null): boolean {
  if (!el) return false;
  if (el.tagName === "BUTTON" || el.tagName === "A") return true;
  return el.getAttribute("role") === "button";
}

/** True when the piano roll is the active keyboard-editing surface: DOM
 *  focus is on the roll container (or inside it), or a note is currently
 *  selected via an earlier mouse click. Gates Tab/Enter/Insert/arrow note-
 *  editing so those keys never hijack native Tab focus-nav or button/link
 *  activation elsewhere on the page — once focus has moved to a specific
 *  control outside the roll, that control owns those keys, even if a note
 *  is still selected (F-A1: keyboard-editing scope regression). */
function isRollEditContext(): boolean {
  const active = document.activeElement;
  if (active && active !== document.body) {
    const roll = document.getElementById("piano-roll-container");
    if (roll && (active === roll || roll.contains(active))) return true;
    return false;
  }
  return state.getSelectedNote() != null;
}

/** Toggle the "?" keyboard-shortcuts overlay (F-A1-009) — the first-run
 *  hint has promised "press ? for shortcuts" since it was written, but no
 *  handler ever backed it up. */
function toggleShortcutsOverlay() {
  const el = document.getElementById("shortcuts-overlay");
  if (!el) return;
  const open = !el.classList.contains("open");
  el.classList.toggle("open", open);
  el.setAttribute("aria-hidden", String(!open));
}

/** What a live-input call site knows about the ORIGINATING DOM/MIDI event
 *  (Wave C3) — the capture engine needs the event's own high-resolution
 *  timeStamp (finding 18: system-receipt time, not handler-run time), which
 *  source produced it (per-source calibration/degradation, findings 19/20),
 *  and keydown's `repeat` flag (finding 21). Optional end to end: a caller
 *  with no event in hand (none exist today) simply captures nothing. */
interface LiveEventInfo {
  source: CaptureSource;
  timeStampMs: number;
  repeat?: boolean;
}

/** The one live-input seam (QWERTY keydown, on-screen keys, Web MIDI all
 *  converge here — same as before Wave C3, which is exactly why capture
 *  taps THIS function rather than three call sites). Monitoring first:
 *  activeNoteOn sounds the note on the existing path regardless of
 *  recording state, so capture adds zero latency to what the player hears
 *  (finding 17). Capture is gated on recordPhase === "recording" —
 *  count-in notes are deliberately never captured (findings 24/25 via
 *  capture.ts's canCapture contract). */
function midiKeyDown(midi: number, velocity = 100, live?: LiveEventInfo) {
  if (heldMidi.has(midi)) return;
  heldMidi.open(midi, live?.source);
  activeNoteOn(midi, velocity);
  if (live && recordPhase === "recording") {
    const res = captureEngine.noteOn(live.source, midi, velocity, live.timeStampMs, live.repeat ?? false);
    // Firefox resistFingerprinting coarsens timestamps to 100ms buckets
    // (finding 19) — one visible warning, then capture continues with
    // fully-quantized (degraded) timing instead of writing garbage onsets.
    if (res.newlyDegraded && !coarseWarned) {
      coarseWarned = true;
      showToast("Input timestamps are coarse (privacy setting?) — captured notes will snap fully to the grid");
    }
  }
  updateKeyVisuals();
}

function midiKeyUp(midi: number, live?: LiveEventInfo) {
  if (!heldMidi.has(midi)) return;
  // Lens-I finding 2 — close() resolves the OPENER's source, which may
  // differ from `live.source` (this event's own source) when a different
  // input triggered the release than the one that pressed it. Routing the
  // capture engine's noteOff through the opener's key is what keeps
  // capture.ts's "source:midi"-keyed open-note map in sync with heldMidi;
  // routing it through the releasing event's own source instead (the old
  // behavior) silently no-ops against a note that was never opened under
  // that key, stranding the real one open forever.
  const openerSource = heldMidi.close(midi);
  activeNoteOff(midi);
  if (live && recordPhase === "recording") {
    captureEngine.noteOff(openerSource ?? live.source, midi, live.timeStampMs);
  }
  updateKeyVisuals();
}

function updateKeyVisuals() {
  document.querySelectorAll<HTMLElement>(".kb-white, .kb-black").forEach((el) => {
    const m = parseInt(el.dataset.midi ?? "0");
    el.classList.toggle("active", heldMidi.has(m));
  });
}

/** Live-performance panic (Escape / btn-panic / blur): silences both
 *  engines, releases every held QWERTY/on-screen/MIDI key, AND pauses score
 *  playback (position preserved, playhead stays visible) — the same "stop
 *  the clock, keep the place" semantics as the play/pause button, not a
 *  hard stop.
 *
 *  Wave C0 fix — this used to (deliberately) NOT touch transport playback
 *  state, on the claim that "score playback keeps running its own
 *  schedule" was fine, same scope as before the module split. That claim
 *  was true before the module split but stopped being true once
 *  transport.ts's lookahead scheduler landed: pre-split, the whole score
 *  was committed to the audio clock up front, so silencing engines here
 *  really did permanently silence the rest of that playback. The lookahead
 *  scheduler instead re-commits only a rolling ~100ms window on every
 *  ~25ms tick, so silencing engines alone left the transport's setInterval
 *  running — the very next tick just scheduled more notes and sound
 *  resumed within ~25ms, i.e. panic no longer actually silenced the rest
 *  of the score (it only glitched it for one tick). Explicitly pausing the
 *  transport here restores the "panic actually stops the music" guarantee
 *  under the new scheduler. transport.pause() is a no-op when nothing is
 *  playing (see transport.ts), so this is safe to call unconditionally —
 *  including from setMode()'s panic() call on every mode switch, and from
 *  blur/visibilitychange when nothing was playing to begin with. */
function panic() {
  // Wave C3 — a pending count-in dies with everything else (no capture has
  // started yet, so there's nothing to commit); an ACTIVE recording is
  // ended by the transport.pause() below via onPlayStateChange(false) →
  // finishCaptureTake, which commits the partial take as one undoable
  // command — "stop capture cleanly and silence," with Ctrl+Z as the
  // recovery path if the take wasn't wanted (finding 6: recovery beats
  // prevention).
  if (recordPhase === "counting-in") cancelCountIn();
  transport.pause();
  silenceEngines();
  heldMidi.clear();
  heldKeys.clear();
  updateKeyVisuals();
}

// ─── MIDI Input ──────────────────────────────────────────────────────────────

/** Shared Web MIDI message handler (Wave C3 refactor: the initial-bind and
 *  hot-plug paths carried two byte-identical inline copies of this; they
 *  now share one, routed through midiKeyDown/midiKeyUp — the same seam
 *  QWERTY and the on-screen keys already used — so MIDI input reaches the
 *  capture engine with the event's own `timeStamp`, which the Web MIDI
 *  spec defines as system-receipt time on the performance.now() timebase
 *  (finding 18: trust it; never re-stamp at handler-run time). Routing
 *  through midiKeyDown also gives MIDI the same heldMidi retrigger guard
 *  the other two sources always had. */
function handleMidiMessage(e: MIDIMessageEvent) {
  if (!e.data || e.data.length < 3) return;
  const [status, note, vel] = e.data;
  if ((status & 0xf0) === 0x90 && vel > 0) {
    midiKeyDown(note, vel, { source: "midi", timeStampMs: e.timeStamp });
  } else if ((status & 0xf0) === 0x80 || ((status & 0xf0) === 0x90 && vel === 0)) {
    midiKeyUp(note, { source: "midi", timeStampMs: e.timeStamp });
  }
}

function bindMidi() {
  if (!navigator.requestMIDIAccess) return;
  navigator.requestMIDIAccess().then((access) => {
    for (const input of access.inputs.values()) {
      input.onmidimessage = handleMidiMessage;
    }
    // Handle hot-plug
    access.onstatechange = () => {
      for (const input of access.inputs.values()) {
        if (!input.onmidimessage) {
          input.onmidimessage = handleMidiMessage;
        }
      }
    };
  }).catch(() => { /* MIDI not available */ });
}

// ─── Record-arm capture (Wave C3) ────────────────────────────────────────────
//
// The DOM/transport half of the capture feature — capture.ts owns all the
// pure math (timestamps, quantize-view, pass bookkeeping); this section owns
// the arm/mode buttons, the count-in click, the pass lifecycle against the
// transport (start / loop-wrap / stop / seek), ghost-note DOM, and the ONE
// undo.commit(captureCommand(...)) per completed pass (finding 78).

const COUNT_IN_BARS = 1;            // finding 25 — 1 bar is the DAW default
const COUNT_IN_BEATS_PER_BAR = 4;   // 4/4, same hardcoded meter as the ruler
const COUNT_IN_ACCENT_MIDI = 88;    // E6 — accented beat 1 (finding 25)
const COUNT_IN_TICK_MIDI = 76;      // E5 — plain beats
const COUNT_IN_CLICK_SEC = 0.06;

/** Mode frozen at pass start — a badge toggle mid-pass takes effect from
 *  the NEXT pass boundary instead of retroactively changing what the
 *  in-flight pass will do at commit (least-surprise; DAWs likewise apply
 *  record mode at record start). */
let passRecordMode: RecordMode = "overdub";

/** The AudioContext the transport is CURRENTLY anchoring against (mode-
 *  dependent, mirroring init()'s getContext callback) — the clock-offset
 *  sample MUST come from this same context or every captured timestamp
 *  would carry the constant skew between the two engines' clocks. */
function captureClockContext(): AudioContext | null {
  return mode === "vocal" ? vocalSynth.getContext() : synth.getContext();
}

function bindRecordControls(): void {
  $("btn-record").addEventListener("click", toggleRecordArm);
  $("btn-record-mode").addEventListener("click", toggleRecordMode);
  updateRecordUI(); // initial badge/label state
}

/** The arm button (finding 71: toggles live against a running transport).
 *  Stopped: arm + count-in + record as ONE action ("arm+play as one
 *  action" per the wave brief — there is no separate armed-idle limbo to
 *  discover). Playing: punch capture in/out without touching playback.
 *  Counting-in: a second press cancels the pending record start. */
function toggleRecordArm(): void {
  if (recordPhase === "counting-in") { cancelCountIn(); return; }
  if (recordPhase === "recording") {
    // Punch OUT — commit the in-flight pass, keep the transport rolling.
    finishCaptureTake(transport.isPlaying() ? transport.getPositionBeats() : lastTickPositionBeats);
    return;
  }
  recordArmed = true;
  if (transport.isPlaying()) {
    // Punch IN against the running transport (finding 71) — no count-in:
    // the already-sounding playback IS the reference interval a count-in
    // exists to provide (finding 24).
    beginRecording();
  } else {
    startCountInThenRecord();
  }
}

/** The mode badge (findings 73/74): OVERDUB <-> REPLACE, always visible,
 *  usable at any time — mid-recording it applies from the next pass. */
function toggleRecordMode(): void {
  recordMode = recordMode === "overdub" ? "replace" : "overdub";
  updateRecordUI();
}

/** 1-bar count-in click from the cockpit's own instrument synth (findings
 *  24/25 — the count-in is functional: a performer needs reference
 *  intervals before the first captured beat; nothing played during it is
 *  captured, see midiKeyDown's recordPhase gate). Clicks are scheduled on
 *  the audio clock up front; the phase flip to actual recording rides a
 *  wall-clock timer of the same duration. */
function startCountInThenRecord(): void {
  // Same belt-and-suspenders resume as transport.play()'s resumeContexts.
  const c1 = synth.getContext();
  const c2 = vocalSynth.getContext();
  if (c1 && c1.state === "suspended") c1.resume().catch((err) => reportAudioError("resume", err));
  if (c2 && c2.state === "suspended") c2.resume().catch((err) => reportAudioError("resume", err));

  recordPhase = "counting-in";
  updateRecordUI();

  const totalSec = beatsToSeconds(COUNT_IN_BARS * COUNT_IN_BEATS_PER_BAR, bpm);
  const PAD_SEC = 0.08; // small offset so the first click never lands in the past
  if (c1) {
    const startAt = c1.currentTime + PAD_SEC;
    for (const click of computeCountInClicks(COUNT_IN_BARS, COUNT_IN_BEATS_PER_BAR)) {
      const t = startAt + beatsToSeconds(click.beat, bpm);
      const midi = click.accented ? COUNT_IN_ACCENT_MIDI : COUNT_IN_TICK_MIDI;
      synth.noteOn(midi, click.accented ? 120 : 90, t);
      synth.noteOff(midi, t + COUNT_IN_CLICK_SEC);
    }
  }
  countInTimer = setTimeout(() => {
    countInTimer = undefined;
    beginRecording();
  }, (totalSec + PAD_SEC) * 1000);
}

/** Abort a pending count-in (second arm press, Space/play, Esc/panic) —
 *  no capture happened yet, so there is nothing to commit. allNotesOff
 *  also cancels the scheduled-but-not-yet-audible clicks (same mechanism
 *  transport.seekTo relies on — see synth.ts's killVoice). */
function cancelCountIn(): void {
  if (countInTimer !== undefined) { clearTimeout(countInTimer); countInTimer = undefined; }
  synth.allNotesOff();
  recordPhase = "idle";
  recordArmed = false;
  updateRecordUI();
}

/** transport.stop() wrapper for every call site that represents a HARD
 *  RESET of playback/score state — Clear, Reset, importScore, and
 *  window.__cockpit.stop (Lens-I finding 3). Plain transport.stop() alone
 *  only resets playback position/scheduling; it has no way to know a
 *  count-in timer is ticking toward its own beginRecording() call seconds
 *  later, because the transport isn't "playing" yet during a count-in
 *  (startCountInThenRecord doesn't call transport.play() until that timer
 *  fires) — so transport.stop()'s onPlayStateChange(false) callback, which
 *  DOES already end an ACTIVE recording via finishCaptureTake, never runs
 *  for a merely-PENDING one. Every caller that needs a hard stop should
 *  route through this instead of calling transport.stop() directly, so it
 *  automatically inherits the same count-in safety net. btn-stop's own
 *  click handler is deliberately NOT migrated to this — it already refuses
 *  to call transport.stop() at all during a count-in (there's nothing to
 *  stop yet), a narrower behavior this wrapper doesn't need to replicate. */
function stopTransportForReset(): void {
  if (hasPendingCountIn(recordPhase)) cancelCountIn();
  transport.stop();
}

/** Flip into actual capture — from count-in completion (transport stopped,
 *  we start it) or a live punch-in (already rolling). Samples the
 *  performance.now()<->AudioContext.currentTime correspondence ONCE per
 *  recording session (findings 16/18 — a stable mapping beats a fresh,
 *  jittery one per event), from the same context the transport anchors on. */
function beginRecording(): void {
  recordPhase = "recording"; // before play() — isCapturing() must already be true
  if (!transport.isPlaying()) transport.play();
  if (!transport.isPlaying()) {
    // play() refused (no AudioContext at all) — abort cleanly instead of
    // "recording" into a stopped transport.
    recordPhase = "idle";
    recordArmed = false;
    updateRecordUI();
    return;
  }
  const ctx = captureClockContext();
  if (ctx) captureEngine.setClockOffset(sampleClockOffset(performance.now(), ctx.currentTime));
  const startBeat = transport.getPositionBeats();
  const loopSpan = looping && loopRegion
    ? { start: loopRegion.startBeat, end: loopRegion.endBeat }
    : null;
  beginCapturePass(startBeat, loopSpan, [], true);
  updateRecordUI();
}

/** Snapshot + live-remove every note overlapping [startBeat, endBeat) —
 *  REPLACE mode's clear (finding 73), used at a loop-cycle start and for a
 *  linear take's covered span at commit. Returns id-carrying snapshots for
 *  captureCommand's `removed` side. */
function removeNotesInSpan(startBeat: number, endBeat: number): Note[] {
  if (!(endBeat > startBeat)) return [];
  const overlapping = state.getScore().filter(
    (n) => n.startBeat < endBeat && n.startBeat + n.durationBeats > startBeat,
  );
  const snapshots = overlapping.map((n) => ({ ...n }));
  for (const n of overlapping) {
    document.querySelector(noteSelector(n.id))?.remove();
    state.deleteNote(n);
  }
  if (snapshots.length > 0) updateInspector(); // deleting can clear selection
  return snapshots;
}

/** Start a capture pass at `startBeat`. `loopSpan` non-null marks a
 *  loop-cycle pass (its span drives REPLACE's cycle-start clear when
 *  `doReplaceClear` — false only after a mid-record seek, where the
 *  region was already cleared for this logical cycle and clearing again
 *  would eat the PREVIOUS pass's committed notes). `carryOver` re-opens
 *  notes still held across the previous pass boundary. */
function beginCapturePass(
  startBeat: number,
  loopSpan: { start: number; end: number } | null,
  carryOver: readonly CarryOverNote[],
  doReplaceClear: boolean,
): void {
  recordPassStartBeat = startBeat;
  passLoopSpan = loopSpan;
  passRecordMode = recordMode;
  replaceClearedThisPass =
    passRecordMode === "replace" && loopSpan && doReplaceClear
      ? removeNotesInSpan(loopSpan.start, loopSpan.end)
      : [];
  captureEngine.startPass(startBeat, carryOver);
}

/** Finish the CURRENT pass: pull its captured notes out of the engine,
 *  apply them to the score live (this is where ghosts solidify into
 *  ordinary notes), and commit everything — REPLACE's cleared notes
 *  included — as ONE captureCommand (finding 78). Skips the commit
 *  entirely for a pass where nothing happened (no dialog, no toast, no
 *  empty undo entry — finding 76). Returns the still-held notes for the
 *  next pass's carryOver. */
function commitCapturePass(
  endBeat: number,
  linearReplaceSpan: { start: number; end: number } | null,
): CarryOverNote[] {
  const result = captureEngine.endPass(endBeat);
  const removed = [...replaceClearedThisPass];
  replaceClearedThisPass = [];
  // Linear REPLACE clears at COMMIT time (the span isn't known until the
  // take ends) — and must run BEFORE the new notes land so it can never
  // sweep up the very notes this pass just recorded.
  if (linearReplaceSpan) removed.push(...removeNotesInSpan(linearReplaceSpan.start, linearReplaceSpan.end));
  const strength = captureEngine.getQuantizeStrength();
  // Vocal-mode parity with the click-to-add path: a note recorded while in
  // vocal mode carries the currently-selected vowel + breathiness, so it
  // plays back through the vocal engine exactly like a hand-placed note
  // (capture.ts knows nothing about vocal metadata — it's stamped here, at
  // the same layer click-to-add stamps it).
  const vocalMeta = mode === "vocal"
    ? { vowel: vocalSynth.getVowel(), breathiness: getCurrentBreathiness() }
    : {};
  const added: Note[] = [];
  for (const captured of result.notes) {
    const note = state.addNote({ ...capturedNoteToInit(captured, strength), ...vocalMeta });
    renderNote(note);
    added.push(note);
  }
  clearGhostNotes();
  if (added.length > 0 || removed.length > 0) {
    undo.commit(undo.captureCommand(added, removed));
  }
  // Lens-I finding 2 — defensive floor: only carry a stillHeld entry into
  // the NEXT pass if heldMidi (this file's own ground truth for which
  // pitches are physically held right now) agrees the pitch is still
  // down. These normally agree by construction (every noteOn/noteOff
  // routes through midiKeyDown/midiKeyUp, which keep both in lockstep —
  // see heldMidi's own doc comment above), but a stale/duplicate
  // stillHeld entry must never be allowed to seed a phantom full-cycle
  // note into the next pass. The PRIMARY fix is routing noteOff through
  // the opener's source key (see midiKeyUp) — this is a backstop, not a
  // substitute for it.
  return result.stillHeld.filter((n) => heldMidi.has(n.midi));
}

/** End the take entirely (stop/pause/Esc/panic/punch-out/auto-stop):
 *  commit the in-flight pass and return to idle. For a linear REPLACE
 *  take, this is where "a linear re-record clears only the time span it
 *  covers" (finding 77's re-record-over-punch model) happens. */
function finishCaptureTake(endBeat: number): void {
  const end = Math.max(endBeat, recordPassStartBeat);
  const linearSpan =
    passRecordMode === "replace" && passLoopSpan === null
      ? { start: recordPassStartBeat, end }
      : null;
  commitCapturePass(end, linearSpan);
  recordPhase = "idle";
  recordArmed = false;
  passLoopSpan = null;
  updateRecordUI();
}

/** Seek wrapper for while-recording (ruler click / keyboard seek): a seek
 *  is a discontinuity a pass must never span — commit what's captured so
 *  far as its own pass, jump, then start a fresh pass at the target (no
 *  repeat replace-clear — see beginCapturePass). Plain transport.seekTo
 *  when not recording. */
function transportSeek(targetBeat: number): void {
  if (recordPhase !== "recording") { transport.seekTo(targetBeat); return; }
  const from = transport.getPositionBeats();
  const linearSpan =
    passRecordMode === "replace" && passLoopSpan === null
      ? { start: recordPassStartBeat, end: Math.max(from, recordPassStartBeat) }
      : null;
  const carry = commitCapturePass(Math.max(from, recordPassStartBeat), linearSpan);
  transport.seekTo(targetBeat);
  const loopSpan = looping && loopRegion
    ? { start: loopRegion.startBeat, end: loopRegion.endBeat }
    : null;
  beginCapturePass(transport.getPositionBeats(), loopSpan, carry, false);
}

// ─── Ghost notes (live capture preview) ─────────────────────────────────────

/** Render/refresh the current pass's ghost notes (outlined, pulsing while
 *  held — see index.html's .pr-note-ghost). Diffed against capture.ts's
 *  stable ghostIds rather than rebuilt, so a long pass doesn't churn DOM
 *  on every ~25ms tick. Ghosts are pointer-events:none and never part of
 *  the score — they solidify via commitCapturePass's renderNote calls. */
function renderGhostNotes(nowBeat: number): void {
  const pr = $("piano-roll");
  const seen = new Set<string>();
  for (const g of captureEngine.getGhostNotes(nowBeat)) {
    seen.add(g.ghostId);
    let el = ghostEls.get(g.ghostId);
    if (!el) {
      el = document.createElement("div");
      el.className = "pr-note-ghost";
      ghostEls.set(g.ghostId, el);
      pr.appendChild(el);
    }
    el.classList.toggle("open", g.open);
    el.style.left = g.startBeat * PX_PER_BEAT + "px";
    el.style.top = (MIDI_HI - g.midi) * ROW_H + "px";
    el.style.width = Math.max(4, g.durationBeats * PX_PER_BEAT) + "px";
    el.style.height = ROW_H - 1 + "px";
  }
  for (const [id, el] of ghostEls) {
    if (!seen.has(id)) { el.remove(); ghostEls.delete(id); }
  }
}

function clearGhostNotes(): void {
  for (const el of ghostEls.values()) el.remove();
  ghostEls.clear();
}

/** Reflect arm/phase/mode onto the two buttons + the ruler's REC wash
 *  (finding 74: the ACTIVE mode must be visible at the point of
 *  recording; aria-labels restate everything the color/badge conveys). */
function updateRecordUI(): void {
  const btn = $("btn-record") as HTMLButtonElement;
  const modeBtn = $("btn-record-mode") as HTMLButtonElement;
  const armed = recordArmed || recordPhase !== "idle";
  btn.classList.toggle("armed", armed);
  btn.classList.toggle("recording", recordPhase === "recording");
  btn.classList.toggle("counting", recordPhase === "counting-in");
  btn.setAttribute("aria-pressed", String(armed));
  btn.setAttribute(
    "aria-label",
    recordPhase === "recording"
      ? `Stop recording (mode: ${recordMode}) — playback continues`
      : recordPhase === "counting-in"
        ? "Cancel count-in"
        : `Record arm — mode: ${recordMode}`,
  );
  // Lens-I finding 6 (nit) — the title used to be a static HTML string
  // ("Record — 1-bar count-in, then capture") that overclaimed a count-in
  // even while the transport is already playing: toggleRecordArm() punches
  // straight in with NO count-in whenever transport.isPlaying() is already
  // true (finding 71 — "the already-sounding playback IS the reference
  // interval a count-in exists to provide"). Kept accurate here instead.
  btn.title =
    recordPhase === "recording"
      ? `Stop recording (mode: ${recordMode}) — playback continues`
      : recordPhase === "counting-in"
        ? "Cancel count-in"
        : transport.isPlaying()
          ? "Record — punch in now (no count-in; playback already rolling)"
          : "Record — 1-bar count-in, then capture";
  modeBtn.textContent = recordMode === "overdub" ? "OVERDUB" : "REPLACE";
  modeBtn.classList.toggle("replace", recordMode === "replace");
  modeBtn.setAttribute(
    "aria-label",
    recordMode === "overdub"
      ? "Recording mode: overdub (accumulates per loop cycle) — click to switch to replace"
      : "Recording mode: replace (clears the region each cycle) — click to switch to overdub",
  );
  document.getElementById("pr-ruler")?.classList.toggle("recording", recordPhase === "recording");
}

// ─── Undo/Redo ───────────────────────────────────────────────────────────────
//
// Wave C1: the command stack itself lives in undo.ts (pure, DOM-free); this
// wires it to the DOM — the toolbar buttons, and the onChange hook that
// keeps them (and autosave) in sync with every execute/commit/undo/redo.
// Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y are handled separately, inside
// buildKeyboard()'s existing keydown listener (see its Ctrl-bail carve-out).

function bindUndoRedo() {
  undo.setOnChange(afterUndoStackChange);
  updateUndoRedoButtons(); // initial (both-disabled) state
  $("btn-undo").addEventListener("click", performUndo);
  $("btn-redo").addEventListener("click", performRedo);
}

// ─── Transport ───────────────────────────────────────────────────────────────
//
// Play/pause/stop/scheduling itself lives in transport.ts (a lookahead
// scheduler — see that file's header for why). What's left here is purely
// DOM glue: the transport instance is constructed in init() with callbacks
// that read/write this file's UI state (mode, bpm, looping, the playhead
// element, the play/pause button icon).

function updateTransportTime(positionBeats: number) {
  const totalSec = beatsToSeconds(positionBeats, bpm);
  const m = Math.floor(totalSec / 60);
  const s = (totalSec % 60).toFixed(1).padStart(4, "0");
  $("transport-time").textContent = `${m}:${s}`;
}

// ─── Controls ────────────────────────────────────────────────────────────────

function bindControls() {
  // Gesture-coalescing state for the velocity/breathiness sliders (Wave C1,
  // finding 2): captured on the FIRST "input" tick of a gesture (mouse drag
  // OR a keyboard arrow-key nudge on the focused slider — both fire "input"
  // first, so this covers both uniformly), reset to null once the gesture's
  // single coalesced command is committed on "change".
  let velGestureBefore: number | null = null;
  let breathGestureBefore: number | null = null;

  $("btn-play").addEventListener("click", () => {
    // Wave C3 — same count-in-abort rule as the Space shortcut.
    if (recordPhase === "counting-in") { cancelCountIn(); return; }
    transport.togglePlayPause();
  });
  $("btn-stop").addEventListener("click", () => {
    // Wave C3 — Stop during a count-in just aborts it (nothing to stop).
    if (recordPhase === "counting-in") { cancelCountIn(); return; }
    transport.stop();
  });
  $("btn-loop").addEventListener("click", () => {
    looping = !looping;
    $("btn-loop").classList.toggle("active", looping);
    $("btn-loop").setAttribute("aria-pressed", String(looping)); // F-B1-005
  });

  $("btn-clear").addEventListener("click", () => {
    // Wave C1 (findings 5/6): Clear is no longer destructive-with-confirm()
    // — it's an undoable command with a non-blocking toast instead. Still
    // skipped when already empty so clearing a blank score is a true no-op
    // (and doesn't push a pointless undo entry).
    if (state.getScore().length === 0) return;
    stopTransportForReset(); // Lens-I finding 3 — also cancels a pending count-in
    undo.execute(undo.clearScoreCommand());
    document.querySelectorAll(".pr-note").forEach((el) => el.remove());
    updateInspector();
    showToast("Score cleared — Ctrl+Z to undo");
  });

  $("btn-reset").addEventListener("click", () => {
    const hasSaved = !!safeLoadRaw();
    if ((state.getScore().length > 0 || hasSaved) && !confirm("Reset the cockpit and clear the saved session? This cannot be undone.")) return;
    stopTransportForReset(); // Lens-I finding 3 — also cancels a pending count-in
    state.clearScore();
    document.querySelectorAll(".pr-note").forEach((el) => el.remove());
    updateInspector();
    // Reset KEEPS its confirm() (unlike Clear/Import) and, once confirmed,
    // clears the undo stack too — a fresh session shouldn't offer to undo
    // back into the session it just abandoned.
    undo.resetStack();
    updateUndoRedoButtons();
    // A lingering debounced timer (or an involuntary visibilitychange/
    // pagehide flush firing right after this click) would otherwise
    // silently re-write the session we're about to clear — cancel the
    // timer and skip the next flush so Reset actually sticks (F-A1-011).
    if (autosaveTimer !== undefined) { clearTimeout(autosaveTimer); autosaveTimer = undefined; }
    suppressNextAutosave = true;
    safeClearStorage();
    updateFirstRunHint();
    setScoreStatus("Reset — starting a new session", "ok");
  });

  $("btn-panic").addEventListener("click", panic);

  // Inspector velocity — live-applies on every "input" tick (unchanged, for
  // instant visual/audio feedback + autosave scheduling), but only commits
  // ONE coalesced undo command on "change" (fires once, on mouse-release or
  // after a keyboard-driven change) — see the gesture-coalescing comment
  // above bindControls().
  $("insp-vel").addEventListener("input", (e) => {
    const note = state.getSelectedNote();
    if (!note) return;
    if (velGestureBefore === null) velGestureBefore = note.velocity;
    const v = safeNumber(e.target as HTMLInputElement, note.velocity);
    state.setVelocity(note, v);
    $("insp-vel-val").textContent = String(note.velocity);
    onStateChanged();
  });
  $("insp-vel").addEventListener("change", () => {
    const note = state.getSelectedNote();
    if (note && velGestureBefore !== null && velGestureBefore !== note.velocity) {
      undo.commit(undo.velocityCommand(note.id, velGestureBefore, note.velocity));
    }
    velGestureBefore = null;
  });
  $("insp-del").addEventListener("click", deleteSelectedNote);

  // Inspector vocal: per-note vowel (discrete — one command per click) +
  // breathiness (coalesced, same shape as velocity above).
  document.querySelectorAll<HTMLButtonElement>(".insp-vowel-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const note = state.getSelectedNote();
      if (!note || !note.vowel) return;
      const v = btn.dataset.vowel as VowelId;
      if (note.vowel === v) return; // already this vowel — no-op click
      undo.execute(undo.vowelCommand(note.id, note.vowel, v));
      // Update the note's visual
      const el = document.querySelector<HTMLElement>(noteSelector(note.id));
      if (el) applyNoteStyle(el, note);
      updateInspector();
    });
  });
  $("insp-breath").addEventListener("input", (e) => {
    const note = state.getSelectedNote();
    if (!note) return;
    const prev = Math.round((note.breathiness ?? 0.15) * 100);
    if (breathGestureBefore === null) breathGestureBefore = note.breathiness ?? 0.15;
    const v = safeNumber(e.target as HTMLInputElement, prev);
    state.setBreathiness(note, v / 100);
    $("insp-breath-val").textContent = String(v);
    onStateChanged();
  });
  $("insp-breath").addEventListener("change", () => {
    const note = state.getSelectedNote();
    if (note && breathGestureBefore !== null && note.breathiness !== undefined && breathGestureBefore !== note.breathiness) {
      undo.commit(undo.breathinessCommand(note.id, breathGestureBefore, note.breathiness));
    }
    breathGestureBefore = null;
  });

  // Master volume
  $("master-vol").addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement;
    const prev = parseInt($("master-vol-val").textContent || "80", 10) || 80;
    const v = safeNumber(input, prev);
    $("master-vol-val").textContent = String(v);
    synth.setMasterVolume(v / 100);
    vocalSynth.setMasterVolume(v / 100);
  });

  // ── Vocal controls ──
  $("vox-breathiness").addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement;
    const prev = parseInt($("vox-breathiness-val").textContent || "15", 10) || 15;
    const v = safeNumber(input, prev);
    $("vox-breathiness-val").textContent = String(v);
    vocalSynth.setBreathiness(v / 100);
  });
  $("vox-vib-depth").addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement;
    const prev = parseInt($("vox-vib-depth-val").textContent || "25", 10) || 25;
    const v = safeNumber(input, prev);
    $("vox-vib-depth-val").textContent = String(v);
    vocalSynth.setVibratoDepth(v);
  });
  $("vox-vib-rate").addEventListener("input", (e) => {
    const input = e.target as HTMLInputElement;
    const prevHz = parseFloat($("vox-vib-rate-val").textContent || "5.5") || 5.5;
    const v = safeNumber(input, Math.round(prevHz * 10));
    const hz = v / 10;
    $("vox-vib-rate-val").textContent = hz.toFixed(1);
    vocalSynth.setVibratoRate(hz);
  });

  // BPM — clamped to [BPM_MIN, BPM_MAX] and guarded against NaN (an emptied
  // field falls back to the last valid bpm, never stored as NaN) (F-A1-002,
  // F-A1-006). No grid redraw needed here — the piano-roll beat grid is
  // bpm-independent now (PX_PER_BEAT is a fixed pixels-per-BEAT scale);
  // only actual playback speed and the transport-time mm:ss readout change
  // with bpm, and both read `bpm` live already.
  ($("bpm") as HTMLInputElement).addEventListener("change", (e) => {
    const input = e.target as HTMLInputElement;
    const parsed = safeNumber(input, bpm);
    bpm = clampBpm(parsed, bpm);
    input.value = String(bpm);
    onStateChanged();
  });
}

// ─── Telemetry ───────────────────────────────────────────────────────────────

function updateTelemetry() {
  const vc = mode === "vocal" ? vocalSynth.getActiveCount() : synth.getActiveCount();
  $("tl-voices").textContent = String(vc);
  $("badge-voices").textContent = vc + " voices";

  if (mode === "vocal") {
    const vv = vocalSynth.getVoice();
    $("tl-preset").textContent = vv.name;
  } else {
    const v = synth.getVoice();
    $("tl-preset").textContent = v.name.split(" ")[0];
  }

  const t = synth.getTuning();
  const label = t.id === "equal" ? "12-TET" : t.id === "custom" ? "Custom" : t.name.split("(")[0].trim();
  $("tl-tuning").textContent = label;
  $("badge-tuning").textContent = label;
  $("tl-ref").textContent = String(synth.getRefPitch());
}

// ─── Tuning Audit Panel ────────────────────────────────────────────────────────────

const CUSTOM_CENTS = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100];

function buildTuningAudit() {
  buildIntervalRoots();
  buildIntervalButtons();
  buildCustomEditor();
  bindAuditControls();
}

function updateTuningTable() {
  const table = synth.getTuningTable();
  const tbody = $("tt-body");
  tbody.innerHTML = "";
  for (const entry of table) {
    const tr = document.createElement("tr");
    const centsClass = entry.centsFromET > 0.05 ? "tt-cents-pos"
      : entry.centsFromET < -0.05 ? "tt-cents-neg" : "tt-cents-zero";
    const centsStr = entry.centsFromET > 0 ? "+" + entry.centsFromET.toFixed(2)
      : entry.centsFromET.toFixed(2);

    tr.innerHTML = `
      <td class="note-col">${entry.name}</td>
      <td class="hz">${entry.hz.toFixed(3)}</td>
      <td class="cents ${centsClass}">${centsStr}¢</td>
      <td>${entry.ratioFromC.toFixed(5)}</td>
      <td><button class="tt-ref-btn" data-midi="${60 + entry.pc}" title="Play reference tone" aria-label="Play reference tone for ${entry.name}"><svg class="icon" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M1.6 6.2h2.3l3.8-3.3v10.2l-3.8-3.3H1.6z" fill="currentColor" stroke="none"/><path d="M10.3 5.7a3 3 0 0 1 0 4.6"/><path d="M12.1 4a5.6 5.6 0 0 1 0 8"/></svg></button></td>
    `;
    tbody.appendChild(tr);
  }
  // Bind reference tone buttons
  tbody.querySelectorAll<HTMLButtonElement>(".tt-ref-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      synth.playReferenceTone(parseInt(btn.dataset.midi!), 2);
    });
  });
}

function buildIntervalRoots() {
  const container = $("interval-roots");
  for (let pc = 0; pc < 12; pc++) {
    const btn = document.createElement("button");
    btn.className = "root-btn" + (60 + pc === intervalRoot ? " active" : "");
    btn.textContent = NOTE_NAMES[pc];
    btn.dataset.midi = String(60 + pc);
    btn.addEventListener("click", () => {
      intervalRoot = 60 + pc;
      container.querySelectorAll(".root-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    });
    container.appendChild(btn);
  }
}

function buildIntervalButtons() {
  const container = $("interval-btns");
  for (const test of INTERVAL_TESTS) {
    const btn = document.createElement("button");
    btn.className = "interval-btn";
    btn.innerHTML = `<span class="ilabel">${test.label}</span><span class="isub">${test.description}</span>`;
    btn.addEventListener("click", () => {
      const midi2 = intervalRoot + test.semitones;
      synth.playInterval(intervalRoot, midi2, 3);
      showIntervalResult(synth.getIntervalAnalysis(intervalRoot, midi2));
    });
    container.appendChild(btn);
  }
}

function showIntervalResult(a: IntervalAnalysis) {
  const el = $("interval-result");
  el.classList.add("active");
  const absDev = Math.abs(a.deviationCents);
  const purityClass = absDev < 0.1 ? "ir-pure" : absDev < 5 ? "ir-impure" : "ir-wolf";
  const purityLabel = absDev < 0.1 ? "PURE" : absDev < 2 ? "Near-pure" : absDev < 5 ? "Tempered" : absDev < 15 ? "Impure" : "WOLF";

  el.innerHTML = `
    <div class="ir-row"><span class="ir-label">Interval</span><span class="ir-value">${a.intervalName}</span></div>
    <div class="ir-row"><span class="ir-label">Notes</span><span class="ir-value">${a.name1} → ${a.name2}</span></div>
    <div class="ir-row"><span class="ir-label">Frequencies</span><span class="ir-value">${a.freq1} → ${a.freq2} Hz</span></div>
    <div class="ir-row"><span class="ir-label">Actual Ratio</span><span class="ir-value">${a.actualRatio}</span></div>
    <div class="ir-row"><span class="ir-label">Pure Ratio</span><span class="ir-value">${fracStr(a.pureRatio)} (${a.pureRatio.toFixed(5)})</span></div>
    <div class="ir-row"><span class="ir-label">Size</span><span class="ir-value">${a.intervalCents}¢</span></div>
    <div class="ir-row"><span class="ir-label">Deviation</span><span class="ir-value ${purityClass}">${a.deviationCents > 0 ? "+" : ""}${a.deviationCents}¢</span></div>
    <div class="ir-row"><span class="ir-label">Beat Freq</span><span class="ir-value">${a.beatFrequency} Hz</span></div>
    <div class="ir-row"><span class="ir-label">Purity</span><span class="ir-value ${purityClass}">${purityLabel}</span></div>
  `;
}

function fracStr(ratio: number): string {
  const fracs: [number, number, string][] = [
    [1, 1, "1:1"], [16, 15, "16:15"], [9, 8, "9:8"], [6, 5, "6:5"],
    [5, 4, "5:4"], [4, 3, "4:3"], [45, 32, "45:32"], [3, 2, "3:2"],
    [8, 5, "8:5"], [5, 3, "5:3"], [9, 5, "9:5"], [15, 8, "15:8"], [2, 1, "2:1"],
  ];
  for (const [n, d, s] of fracs) {
    if (Math.abs(ratio - n / d) < 0.0001) return s;
  }
  return ratio.toFixed(5);
}

function buildCustomEditor() {
  const container = $("custom-editor");
  for (let pc = 0; pc < 12; pc++) {
    const label = document.createElement("label");
    label.textContent = NOTE_NAMES[pc];
    label.htmlFor = "cc-" + pc; // F-B1-004: label was a sibling, not associated

    const slider = document.createElement("input");
    slider.type = "range";
    slider.id = "cc-" + pc;
    slider.min = pc === 0 ? "0" : "0";
    slider.max = pc === 0 ? "0" : "1200";
    slider.step = "0.5";
    slider.value = String(CUSTOM_CENTS[pc]);
    slider.disabled = pc === 0;
    slider.dataset.pc = String(pc);

    const val = document.createElement("span");
    val.className = "cv";
    val.id = "cv-" + pc;
    val.textContent = CUSTOM_CENTS[pc] + "¢";

    slider.addEventListener("input", () => {
      CUSTOM_CENTS[pc] = safeNumber(slider, CUSTOM_CENTS[pc], true);
      val.textContent = CUSTOM_CENTS[pc] + "¢";
    });

    container.appendChild(label);
    container.appendChild(slider);
    container.appendChild(val);
  }
}

function bindAuditControls() {
  $("btn-apply-custom").addEventListener("click", () => {
    synth.setCustomTuning([...CUSTOM_CENTS]);
    // Keep the vocal engine's tuning in sync — it previously kept playing in
    // whatever tuning was active before "Apply Custom", while the audit
    // table/badges/telemetry (which only read the instrument synth) showed
    // the new custom tuning as if both engines had it (F-A1: tuning divergence
    // between engines).
    vocalSynth.setTuning("custom");
    ($("sel-tuning") as HTMLSelectElement).value = "custom";
    updateTuningTable();
    updateTelemetry();
    // Was missing entirely — a custom tuning applied here never reached
    // autosave, so reloading after "Apply Custom" (with no other edit)
    // silently reverted to whatever tuning was last persisted (F-A1-004).
    onStateChanged();
  });

  $("btn-reset-custom").addEventListener("click", () => {
    const et = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100];
    for (let pc = 0; pc < 12; pc++) {
      CUSTOM_CENTS[pc] = et[pc];
      const slider = document.querySelector<HTMLInputElement>(`input[data-pc="${pc}"]`);
      if (slider) slider.value = String(et[pc]);
      const val = $("cv-" + pc);
      if (val) val.textContent = et[pc] + "¢";
    }
  });

  $("btn-export").addEventListener("click", () => {
    const data = synth.exportTuning();
    ($("tuning-json") as HTMLTextAreaElement).value = JSON.stringify(data, null, 2);
    clearTuningStatus();
  });

  $("btn-import").addEventListener("click", () => {
    try {
      const data = JSON.parse(($("tuning-json") as HTMLTextAreaElement).value) as TuningExport;
      synth.importTuning(data); // throws with a descriptive message on invalid cents/refPitch
      // Mirror the import onto the vocal engine too (same divergence class as
      // "Apply Custom" above — see F-A1 tuning-divergence note).
      vocalSynth.setTuning("custom");
      if (Number.isFinite(data.refPitch)) vocalSynth.setRefPitch(data.refPitch);
      // Update custom editor sliders
      const t = synth.getTuning();
      for (let pc = 0; pc < 12; pc++) {
        CUSTOM_CENTS[pc] = t.cents[pc];
        const slider = document.querySelector<HTMLInputElement>(`input[data-pc="${pc}"]`);
        if (slider) slider.value = String(t.cents[pc]);
        const val = $("cv-" + pc);
        if (val) val.textContent = t.cents[pc] + "¢";
      }
      ($("sel-tuning") as HTMLSelectElement).value = t.id;
      ($("ref-pitch") as HTMLInputElement).value = String(synth.getRefPitch());
      updateTuningTable();
      updateTelemetry();
      setTuningStatus("Tuning imported", "ok");
      // Same gap as "Apply Custom" above — an imported tuning never reached
      // autosave (F-A1-004).
      onStateChanged();
    } catch (err) {
      // F-B1-008: alert() blocks the main thread — that also freezes the
      // Panic (Escape) path until dismissed. Inline status instead, same
      // pattern as setScoreStatus/#score-status below.
      setTuningStatus(err instanceof Error ? err.message : "Invalid tuning JSON", "error");
    }
  });
}

function setTuningStatus(message: string, kind: "error" | "ok") {
  const el = $("tuning-status");
  el.textContent = message;
  el.className = "score-status " + kind;
}

function clearTuningStatus() {
  const el = $("tuning-status");
  el.textContent = "";
  el.className = "score-status";
}

// ─── Score Export / Import (LLM API) ─────────────────────────────────────────

/** Read the CURRENT bpm/mode/voice/tuning/refPitch as a complete settings
 *  snapshot — the non-notes half of exportScore() below, factored out
 *  (Wave C1 finding 5) so importScore()'s undo/redo path can capture a
 *  "before" and "after" snapshot of exactly the same shape and hand both
 *  to applySettings() below. */
function captureSettings(): ImportSettings {
  return {
    mode,
    bpm,
    voice: ($(mode === "vocal" ? "sel-vocal-voice" : "sel-voice") as HTMLSelectElement).value,
    ...(mode === "vocal" ? { vocalVoice: ($("sel-vocal-voice") as HTMLSelectElement).value } : {}),
    tuning: ($("sel-tuning") as HTMLSelectElement).value,
    refPitch: parseInt(($("ref-pitch") as HTMLInputElement).value),
  };
}

/** Unconditionally apply a COMPLETE settings snapshot from
 *  captureSettings() — never a partial/untrusted one like a raw import's
 *  ScoreSnapshot can be (Wave C1 finding 5). Used by importScoreCommand's
 *  undo()/redo() to restore/reapply the bpm/mode/voice/tuning/refPitch
 *  that rode along with a score import — see importScore() below.
 *  Deliberately simpler than importScore()'s own settings-application
 *  block: THAT one is conditional (a partial/untrusted snapshot leaves an
 *  unset field unchanged); this one always has every field, so it just
 *  sets all of them. */
function applySettings(s: ImportSettings): void {
  bpm = s.bpm;
  ($("bpm") as HTMLInputElement).value = String(bpm);
  setMode(s.mode);
  if (s.mode === "vocal" && s.vocalVoice) {
    ($("sel-vocal-voice") as HTMLSelectElement).value = s.vocalVoice;
    vocalSynth.setVoice(s.vocalVoice as VocalVoiceId);
  } else {
    ($("sel-voice") as HTMLSelectElement).value = s.voice;
    synth.setVoice(s.voice as VoiceId);
  }
  ($("sel-tuning") as HTMLSelectElement).value = s.tuning;
  synth.setTuning(s.tuning as TuningId);
  vocalSynth.setTuning(s.tuning as TuningId);
  synth.setRefPitch(s.refPitch);
  vocalSynth.setRefPitch(s.refPitch);
  ($("ref-pitch") as HTMLInputElement).value = String(synth.getRefPitch());
  updateTuningTable();
  updateTelemetry();
}

function exportScore(): ScoreSnapshot {
  return {
    version: 2,
    ...captureSettings(),
    notes: state.getScore().map(({ id: _id, ...rest }) => rest),
  };
}

type NoteValidation = { ok: true; note: NoteInit } | { ok: false; message: string };

/**
 * Validate one note from untrusted JSON (score import or window.__cockpit.
 * addNote) before it reaches Web Audio params or the score model.
 *
 * Accepts EITHER the current beats shape (startBeat/durationBeats) or the
 * legacy seconds shape (startSec/durationSec, from before the beat-based
 * time model) — a note is treated as legacy when it has neither
 * `startBeat` nor `durationBeats` as a number. Legacy notes are converted
 * with `secondsToBeats(_, snapshotBpm)`, where `snapshotBpm` is the bpm the
 * CALLER passes in — importScore() below passes the snapshot's OWN bpm
 * (the tempo in effect when those seconds were originally recorded);
 * window.__cockpit.addNote passes the cockpit's current live bpm, since a
 * lone addNote call has no snapshot bpm of its own.
 *
 * A non-finite midi/velocity propagating to osc.frequency.value or gain
 * automation throws a TypeError mid-noteOn — aborting playback partway
 * through and leaking partially-built node graphs — and out-of-range midi
 * renders notes outside the piano-roll grid (F-A1-005).
 */
function validateImportedNote(n: unknown, index: number, snapshotBpm: number): NoteValidation {
  if (typeof n !== "object" || n === null) {
    return { ok: false, message: `note[${index}] is not an object` };
  }
  const r = n as Record<string, unknown>;

  const midi = r.midi as number;
  if (!Number.isFinite(midi) || midi < 0 || midi > 127) {
    return { ok: false, message: `note[${index}].midi must be a finite number 0-127 (got ${JSON.stringify(r.midi)})` };
  }
  const velocity = r.velocity as number;
  if (!Number.isFinite(velocity) || velocity < 0 || velocity > 127) {
    return { ok: false, message: `note[${index}].velocity must be a finite number 0-127 (got ${JSON.stringify(r.velocity)})` };
  }

  let startBeat: number;
  let durationBeats: number;
  const hasBeatsShape = typeof r.startBeat === "number" || typeof r.durationBeats === "number";
  if (hasBeatsShape) {
    const sb = r.startBeat as number;
    const db = r.durationBeats as number;
    if (!Number.isFinite(sb) || sb < 0) {
      return { ok: false, message: `note[${index}].startBeat must be a finite number >= 0 (got ${JSON.stringify(r.startBeat)})` };
    }
    if (!Number.isFinite(db) || db < 0) {
      return { ok: false, message: `note[${index}].durationBeats must be a finite number >= 0 (got ${JSON.stringify(r.durationBeats)})` };
    }
    startBeat = sb;
    durationBeats = db;
  } else {
    const startSec = r.startSec as number;
    const durationSec = r.durationSec as number;
    if (!Number.isFinite(startSec) || startSec < 0) {
      return { ok: false, message: `note[${index}].startSec must be a finite number >= 0 (got ${JSON.stringify(r.startSec)})` };
    }
    if (!Number.isFinite(durationSec) || durationSec < 0) {
      return { ok: false, message: `note[${index}].durationSec must be a finite number >= 0 (got ${JSON.stringify(r.durationSec)})` };
    }
    startBeat = secondsToBeats(startSec, snapshotBpm);
    durationBeats = secondsToBeats(durationSec, snapshotBpm);
  }

  if (r.vowel !== undefined && !(VOWEL_IDS as readonly unknown[]).includes(r.vowel)) {
    return { ok: false, message: `note[${index}].vowel must be one of ${VOWEL_IDS.join(", ")} (got ${JSON.stringify(r.vowel)})` };
  }
  if (r.breathiness !== undefined) {
    const b = r.breathiness as number;
    if (!Number.isFinite(b) || b < 0 || b > 1) {
      return { ok: false, message: `note[${index}].breathiness must be a finite number 0-1 (got ${JSON.stringify(r.breathiness)})` };
    }
  }

  const note: NoteInit = {
    midi, velocity, durationBeats,
    // Clamp (rather than reject) notes starting beyond the score window —
    // the piano roll is a fixed SCORE_BEATS-wide canvas (F-A1: score-size bomb).
    startBeat: Math.min(startBeat, SCORE_BEATS),
  };
  if (r.vowel !== undefined) note.vowel = r.vowel as VowelId;
  if (r.breathiness !== undefined) note.breathiness = r.breathiness as number;
  if (typeof r.lyric === "string") note.lyric = r.lyric;
  // Wave C3 — raw capture timing round-trips through export/import JSON
  // (exportScore already includes it via its rest-spread over Note). Same
  // accept-as-a-valid-pair-or-drop-the-pair policy as persistence.ts's
  // sanitizeNoteBeats: never reject the NOTE over bad raw fields — the
  // quantized view is self-sufficient.
  const rawStartBeat = r.rawStartBeat, rawDurationBeats = r.rawDurationBeats;
  if (
    typeof rawStartBeat === "number" && Number.isFinite(rawStartBeat) && rawStartBeat >= 0 &&
    typeof rawDurationBeats === "number" && Number.isFinite(rawDurationBeats) && rawDurationBeats >= 0
  ) {
    note.rawStartBeat = rawStartBeat;
    note.rawDurationBeats = rawDurationBeats;
  }
  return { ok: true, note };
}

function setScoreStatus(message: string, kind: "error" | "ok") {
  const el = $("score-status");
  el.textContent = message;
  el.className = "score-status " + kind;
}

function clearScoreStatus() {
  const el = $("score-status");
  el.textContent = "";
  el.className = "score-status";
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Small non-blocking toast (Wave C1, findings 5/6) — replaces the
 *  confirm() dialogs Clear/Import used to show, now that both are
 *  undoable instead of destructive. Single instance: a new call while one
 *  is showing replaces the message and restarts the ~5s auto-dismiss timer
 *  rather than stacking a second toast. aria-live="polite" (set once in
 *  index.html) announces the text change to screen readers without
 *  stealing focus, matching the existing #score-status pattern. */
function showToast(message: string): void {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("show");
    // Wave C1 finding 4: #toast now hides via opacity, not display:none,
    // so it stays in the accessibility tree at all times (that's the
    // whole fix — a display:none element is invisible to a11y APIs
    // regardless of aria-live). Clearing the text on hide keeps a stale
    // message from lingering in that tree indefinitely.
    el.textContent = "";
    toastTimer = undefined;
  }, 5000);
}

/**
 * `recordUndo` (Wave C1, findings 5/6) — default true for every caller
 * except restoreFromStorage()'s boot-time session restore, which passes
 * false: there's no meaningful prior state to offer undo back to at boot,
 * and recording one would make a fresh session's very first Ctrl+Z
 * surprising (see restoreFromStorage's call site for the full rationale).
 */
function importScore(snap: ScoreSnapshot, recordUndo = true) {
  if (!snap || !Array.isArray(snap.notes)) {
    setScoreStatus("Import rejected: snapshot.notes must be an array", "error");
    return;
  }
  if (snap.version !== undefined && snap.version !== 1 && snap.version !== 2) {
    setScoreStatus(`Import rejected: unsupported snapshot version ${JSON.stringify(snap.version)} (expected 1 or 2)`, "error");
    return;
  }
  // Unbounded note counts render one absolutely-positioned DOM element per
  // note synchronously and can lock the tab (F-A1: score-size bomb).
  if (snap.notes.length > MAX_IMPORT_NOTES) {
    setScoreStatus(`Import rejected: ${snap.notes.length} notes exceeds the ${MAX_IMPORT_NOTES}-note import cap`, "error");
    return;
  }

  // bpm is clamped + finite-checked here regardless of the UI-side guard —
  // importScore is also reachable directly via window.__cockpit.importScore
  // and the #score-json textarea, bypassing the <input> entirely — AND is
  // needed up front (before per-note validation) since a legacy
  // seconds-shaped note is converted using exactly this value, the
  // snapshot's OWN bpm (F-A1-002; see validateImportedNote's doc comment).
  const importBpm = clampBpm(+snap.bpm, DEFAULT_BPM);

  // Validate every note BEFORE mutating any state — the whole import is
  // rejected on the first bad field naming it, instead of silently importing
  // partial garbage (F-A1-005).
  const cleaned: NoteInit[] = [];
  for (let i = 0; i < snap.notes.length; i++) {
    const result = validateImportedNote(snap.notes[i], i, importBpm);
    if (!result.ok) {
      setScoreStatus(`Import rejected: ${result.message}`, "error");
      return;
    }
    cleaned.push(result.note);
  }

  // Lens-I findings 3/4 — stop the transport (cancelling any pending
  // count-in) BEFORE snapshotting "before" state below, not after.
  // transport.stop() can itself finish an in-flight capture pass (via
  // onPlayStateChange -> finishCaptureTake, when recordPhase ===
  // "recording"), which commits that pass's notes into the score AND
  // pushes its own captureCommand. The old order snapshotted beforeNotes
  // FIRST, so it missed those just-committed notes — undoing THIS import
  // later then restored a score that predated the pass commit too, and a
  // later undo of that same pass's captureCommand couldn't resolve ids
  // the import's own undo had already erased, producing console.warn
  // spam on the interleaving. Stopping first means beforeNotes already
  // reflects the fully-committed score, same as every other
  // snapshot-then-mutate call site in this file (Clear, e.g., already
  // stops the transport before building its command for the identical
  // reason).
  stopTransportForReset();

  // Capture the "before" NOTES (with their real ids) and the "before"
  // SETTINGS now, prior to any mutation below (Wave C1 findings 1/5). The
  // Command itself is built further down, AFTER the settings/notes
  // mutations run — its "after" halves need to read back what actually
  // got applied, since the settings block below is conditional (only
  // fields present in `snap` change anything), so the true "after" state
  // is only knowable once that block has run. See this function's doc
  // comment for recordUndo.
  const beforeNotes = recordUndo ? state.getScore().map((n) => ({ ...n })) : null;
  const beforeSettings = recordUndo ? captureSettings() : null;

  // Clear existing
  state.clearScore();
  document.querySelectorAll(".pr-note").forEach(el => el.remove());

  // Apply settings.
  bpm = importBpm;
  ($("bpm") as HTMLInputElement).value = String(bpm);

  // Mode
  if (snap.mode === "vocal" || snap.mode === "instrument") setMode(snap.mode);

  // Voice
  if (snap.mode === "vocal" && snap.vocalVoice) {
    ($("sel-vocal-voice") as HTMLSelectElement).value = snap.vocalVoice;
    vocalSynth.setVoice(snap.vocalVoice as VocalVoiceId);
  } else if (snap.voice) {
    ($("sel-voice") as HTMLSelectElement).value = snap.voice;
    synth.setVoice(snap.voice as VoiceId);
  }

  // Tuning
  if (snap.tuning) {
    ($("sel-tuning") as HTMLSelectElement).value = snap.tuning;
    synth.setTuning(snap.tuning as TuningId);
    vocalSynth.setTuning(snap.tuning as TuningId);
  }
  if (Number.isFinite(snap.refPitch)) {
    synth.setRefPitch(snap.refPitch);
    vocalSynth.setRefPitch(snap.refPitch);
    ($("ref-pitch") as HTMLInputElement).value = String(synth.getRefPitch());
  }

  // Notes (already validated + cleaned above). state.replaceScore assigns
  // every note a freshly generated id — a caller-supplied `id` in the
  // source JSON can never override it (same guard as before the module
  // split, now enforced in state.ts rather than here).
  const added = state.replaceScore(cleaned);
  for (const note of added) renderNote(note);

  updateTuningTable();
  updateTelemetry();
  updateInspector();
  setScoreStatus(`Imported ${cleaned.length} note${cleaned.length === 1 ? "" : "s"}`, "ok");

  if (beforeNotes && beforeSettings) {
    // Built AFTER the mutations above so `added` (real ids) and a fresh
    // captureSettings() read (Wave C1 finding 5) reflect EXACTLY what got
    // applied — see importScoreCommand's doc comment in undo.ts for why
    // this factory takes both ends of the notes delta explicitly rather
    // than reading state.getScore() internally. commit()-not-execute() is
    // the same shape gesture-coalescing uses elsewhere in this file: the
    // mutations above already produced this "after" state, so redo() must
    // never re-run them, only replay the snapshot.
    const cmd = undo.importScoreCommand(beforeNotes, added, {
      before: beforeSettings, after: captureSettings(), apply: applySettings,
    });
    undo.commit(cmd);
    showToast("Score imported — Ctrl+Z to undo");
  } else {
    onStateChanged();
  }
}

function bindScoreControls() {
  $("btn-export-score").addEventListener("click", () => {
    const json = JSON.stringify(exportScore(), null, 2);
    ($("score-json") as HTMLTextAreaElement).value = json;
    clearScoreStatus();
  });

  $("btn-import-score").addEventListener("click", () => {
    // Wave C1 (findings 5/6): Import is no longer destructive-with-confirm()
    // — importScore() below records an undoable command and shows a
    // non-blocking toast instead.
    let data: ScoreSnapshot;
    try {
      data = JSON.parse(($("score-json") as HTMLTextAreaElement).value) as ScoreSnapshot;
    } catch (err) {
      setScoreStatus(`Import rejected: invalid JSON (${err instanceof Error ? err.message : "parse error"})`, "error");
      return;
    }
    importScore(data);
  });
}

// Expose API on window so LLMs / automation can control the cockpit
declare global {
  interface Window {
    __cockpit: {
      exportScore: () => ScoreSnapshot;
      importScore: (snap: ScoreSnapshot) => void;
      play: () => void;
      stop: () => void;
      panic: () => void;
      setMode: (m: "instrument" | "vocal") => void;
      getScore: () => Note[];
      addNote: (n: NoteInit) => void;
      undo: () => void;
      redo: () => void;
    };
  }
}

// ─── Boot ────────────────────────────────────────────────────────────────────

async function boot() {
  await init();
  bindScoreControls();

  // Expose LLM-facing API
  window.__cockpit = {
    exportScore,
    importScore,
    play: () => transport.play(),
    stop: () => stopTransportForReset(), // Lens-I finding 3 — also cancels a pending count-in
    panic,
    setMode,
    getScore: () => [...state.getScore()],
    addNote: (n) => {
      // Same untrusted-input validation as importScore — addNote is an
      // equally-reachable LLM-facing path that used to copy midi/velocity/
      // startSec/durationSec verbatim into Web Audio params (F-A1-005).
      const result = validateImportedNote(n, 0, bpm);
      if (!result.ok) {
        setScoreStatus(`addNote rejected: ${result.message}`, "error");
        return;
      }
      undo.execute(undo.addNoteCommand(result.note));
      const note = state.getSelectedNote()!; // addNoteCommand.redo() selects the new note
      renderNote(note);
      setScoreStatus(`Added note ${noteName(note.midi)}`, "ok");
    },
    undo: () => performUndo(),
    redo: () => performRedo(),
  };
}

boot().catch(console.error);
