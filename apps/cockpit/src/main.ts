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
import { createTransport, type Transport } from "./transport.js";

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

// ─── Constants ───────────────────────────────────────────────────────────────

const ROW_H = 14;
const ROWS = MIDI_HI - MIDI_LO + 1;
const PR_WIDTH = SCORE_BEATS * PX_PER_BEAT;
const PR_HEIGHT = ROWS * ROW_H;
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
const heldMidi = new Set<number>();
let intervalRoot = 60; // C4

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

  importScore({
    version: 2,
    mode: persisted.mode,
    bpm: persisted.bpm,
    voice: persisted.mode === "vocal" ? persisted.voice : persisted.engine,
    vocalVoice: persisted.voice,
    tuning: persisted.tuning,
    refPitch: persisted.refPitch,
    notes: persisted.score,
  });

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
    onTick: (positionBeats) => {
      const ph = $("playhead") as HTMLElement;
      // Visible whenever playing OR paused mid-score (position > 0) — hidden
      // only once stop() has driven position all the way back to 0.
      ph.style.display = (transport.isPlaying() || positionBeats > 0) ? "block" : "none";
      ph.style.left = positionBeats * PX_PER_BEAT + "px";
      updateTransportTime(positionBeats);
    },
    onPlayStateChange: (isPlayingNow) => {
      $("btn-play").innerHTML = isPlayingNow ? PAUSE_ICON_SVG : PLAY_ICON_SVG;
    },
  });
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
  centerRollOnMiddleC();
  buildKeyboard();
  bindControls();
  bindMidi();
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
  const rowTop = (MIDI_HI - 60) * ROW_H;
  container.scrollTop = Math.max(0, rowTop - container.clientHeight / 2 + ROW_H / 2);
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

  // Click empty space → add note
  pr.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement).closest(".pr-note")) return;
    const rect = pr.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const midi = MIDI_HI - Math.floor(y / ROW_H);
    if (midi < MIDI_LO || midi > MIDI_HI) return;
    const startBeat = quantizeBeats(x / PX_PER_BEAT);
    const note = state.addNote({
      midi, startBeat,
      durationBeats: DEFAULT_NOTE_DURATION_BEATS, velocity: 100,
      ...(mode === "vocal" ? { vowel: vocalSynth.getVowel(), breathiness: getCurrentBreathiness() } : {}),
    });
    renderNote(note);
    selectNote(note);
    onStateChanged();
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

  // ── Resize handle on right edge ──
  const handle = document.createElement("div");
  handle.style.cssText = "position:absolute;right:0;top:0;bottom:0;width:6px;cursor:ew-resize;";
  el.appendChild(handle);

  handle.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    selectNote(note);
    const startX = e.clientX;
    const startDur = note.durationBeats;
    const onMove = (e2: MouseEvent) => {
      state.resizeNote(note, quantizeBeats(startDur + (e2.clientX - startX) / PX_PER_BEAT));
      positionNote(el, note);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      onStateChanged();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });

  // ── Drag to move ──
  el.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement) === handle) return;
    e.stopPropagation();
    selectNote(note);
    const startX = e.clientX, startY = e.clientY;
    const origBeat = note.startBeat, origMidi = note.midi;

    const onMove = (e2: MouseEvent) => {
      const newBeat = quantizeBeats(origBeat + (e2.clientX - startX) / PX_PER_BEAT);
      const newMidi = origMidi - Math.round((e2.clientY - startY) / ROW_H);
      state.moveNote(note, newBeat, newMidi);
      applyNoteStyle(el, note);
      positionNote(el, note);
      updateInspector();
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      onStateChanged();
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });

  pr.appendChild(el);
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
  const removed = state.deleteSelectedNote();
  if (!removed) return;
  document.querySelector(noteSelector(removed.id))?.remove();
  updateInspector();
  onStateChanged();
}

/** Show/hide the "click to add a note" hint (F-B1-009) — visible while the
 *  score is empty, hidden as soon as the first note exists. */
function updateFirstRunHint() {
  const hint = document.getElementById("pr-hint");
  if (hint) hint.style.display = state.getScore().length === 0 ? "" : "none";
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
  document.querySelector(noteSelector(ordered[nextIdx].id))?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

/** ArrowUp/Down (±1 semitone) and ArrowLeft/Right (±1 grid step) on the
 *  selected note — same clamp/quantize rules as mouse drag (positionNote /
 *  state.moveNote) so keyboard and mouse edits stay consistent. */
function nudgeSelectedNote(semitones: number, steps: number) {
  const note = state.getSelectedNote();
  if (!note) return;
  const newMidi = note.midi + semitones;
  const newBeat = steps !== 0 ? quantizeBeats(note.startBeat + QUANTIZE_GRID_BEATS * steps) : note.startBeat;
  state.moveNote(note, newBeat, newMidi);
  const el = document.querySelector<HTMLElement>(noteSelector(note.id));
  if (el) { applyNoteStyle(el, note); positionNote(el, note); }
  updateInspector();
  onStateChanged();
}

/** Enter / Insert — add a new note at the current playhead position. Reuses
 *  the selected note's pitch/vowel as a starting point when one exists, so
 *  rapid keyboard entry (nudge, insert, nudge, insert...) stays musically
 *  useful instead of always dropping back to middle C. */
function insertNoteAtPlayhead() {
  const selected = state.getSelectedNote();
  const midi = selected ? selected.midi : 60;
  const startBeat = quantizeBeats(transport.getPositionBeats());
  const note = state.addNote({
    midi, startBeat,
    durationBeats: DEFAULT_NOTE_DURATION_BEATS, velocity: 100,
    ...(mode === "vocal" ? { vowel: selected?.vowel ?? vocalSynth.getVowel(), breathiness: selected?.breathiness ?? getCurrentBreathiness() } : {}),
  });
  renderNote(note);
  selectNote(note);
  document.querySelector(noteSelector(note.id))?.scrollIntoView({ block: "nearest", inline: "nearest" });
  onStateChanged();
}

// ─── Inspector ───────────────────────────────────────────────────────────────

function updateInspector() {
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

    key.addEventListener("mousedown", (e) => { e.preventDefault(); midiKeyDown(midi); });
    key.addEventListener("mouseup", () => midiKeyUp(midi));
    key.addEventListener("mouseleave", () => { if (heldMidi.has(midi)) midiKeyUp(midi); });
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

    key.addEventListener("mousedown", (e) => { e.preventDefault(); midiKeyDown(m); });
    key.addEventListener("mouseup", () => midiKeyUp(m));
    key.addEventListener("mouseleave", () => { if (heldMidi.has(m)) midiKeyUp(m); });
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
    if (e.repeat) return;
    // Typing in an input/select/textarea (or any contenteditable) must never
    // trigger notes/transport/deletion — this used to exempt only INPUT and
    // SELECT, so the score/tuning JSON textareas were unusable for hand
    // editing (every mapped letter played a note, Space/Backspace were
    // preventDefault'd instead of typing) (F-A1-007).
    if (isTypingTarget(e)) return;
    // Don't hijack Ctrl/Cmd/Alt combos (Ctrl+C, Ctrl+V, Cmd+A, ...).
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
      e.preventDefault(); transport.togglePlayPause(); return;
    }
    if (k === "escape") { panic(); return; }
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
    if (k === "arrowleft") { if (isRollEditContext()) { e.preventDefault(); nudgeSelectedNote(0, -1); } return; }
    if (k === "arrowright") { if (isRollEditContext()) { e.preventDefault(); nudgeSelectedNote(0, 1); } return; }
    if (k === "enter" || k === "insert") {
      if (isRollEditContext()) { e.preventDefault(); insertNoteAtPlayhead(); }
      return;
    }

    const code = e.code;
    if (QWERTY[code] !== undefined && !heldKeys.has(code)) {
      heldKeys.add(code);
      midiKeyDown(QWERTY[code]);
    }
  });

  window.addEventListener("keyup", (e) => {
    if (isTypingTarget(e)) return;
    const code = e.code;
    if (QWERTY[code] !== undefined) { heldKeys.delete(code); midiKeyUp(QWERTY[code]); }
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

/** True when the event's target (or the currently focused element) is a
 *  text-entry control — used to keep global keyboard shortcuts (note
 *  triggering, Space/Delete/Escape) from hijacking typing in the score/tuning
 *  JSON textareas or any other form field (F-A1-007). */
function isTypingTarget(e: KeyboardEvent): boolean {
  const el = (e.target as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
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

function midiKeyDown(midi: number) {
  if (heldMidi.has(midi)) return;
  heldMidi.add(midi);
  activeNoteOn(midi, 100);
  updateKeyVisuals();
}

function midiKeyUp(midi: number) {
  if (!heldMidi.has(midi)) return;
  heldMidi.delete(midi);
  activeNoteOff(midi);
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
  transport.pause();
  silenceEngines();
  heldMidi.clear();
  heldKeys.clear();
  updateKeyVisuals();
}

// ─── MIDI Input ──────────────────────────────────────────────────────────────

function bindMidi() {
  if (!navigator.requestMIDIAccess) return;
  navigator.requestMIDIAccess().then((access) => {
    for (const input of access.inputs.values()) {
      input.onmidimessage = (e: MIDIMessageEvent) => {
        if (!e.data || e.data.length < 3) return;
        const [status, note, vel] = e.data;
        if ((status & 0xf0) === 0x90 && vel > 0) { activeNoteOn(note, vel); heldMidi.add(note); updateKeyVisuals(); }
        else if ((status & 0xf0) === 0x80 || ((status & 0xf0) === 0x90 && vel === 0)) { activeNoteOff(note); heldMidi.delete(note); updateKeyVisuals(); }
      };
    }
    // Handle hot-plug
    access.onstatechange = () => {
      for (const input of access.inputs.values()) {
        if (!input.onmidimessage) {
          input.onmidimessage = (e: MIDIMessageEvent) => {
            if (!e.data || e.data.length < 3) return;
            const [status, note, vel] = e.data;
            if ((status & 0xf0) === 0x90 && vel > 0) { activeNoteOn(note, vel); heldMidi.add(note); updateKeyVisuals(); }
            else if ((status & 0xf0) === 0x80 || ((status & 0xf0) === 0x90 && vel === 0)) { activeNoteOff(note); heldMidi.delete(note); updateKeyVisuals(); }
          };
        }
      }
    };
  }).catch(() => { /* MIDI not available */ });
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
  $("btn-play").addEventListener("click", () => transport.togglePlayPause());
  $("btn-stop").addEventListener("click", () => transport.stop());
  $("btn-loop").addEventListener("click", () => {
    looping = !looping;
    $("btn-loop").classList.toggle("active", looping);
    $("btn-loop").setAttribute("aria-pressed", String(looping)); // F-B1-005
  });

  $("btn-clear").addEventListener("click", () => {
    // Persistence makes note loss permanent (autosave would immediately
    // overwrite the last-saved copy with an empty score) — confirm first,
    // same as Import below (G-1). Skipped when already empty so clearing a
    // blank score never nags.
    if (state.getScore().length > 0 && !confirm("Clear all notes? This cannot be undone.")) return;
    transport.stop();
    state.clearScore();
    document.querySelectorAll(".pr-note").forEach((el) => el.remove());
    updateInspector();
    onStateChanged();
  });

  $("btn-reset").addEventListener("click", () => {
    const hasSaved = !!safeLoadRaw();
    if ((state.getScore().length > 0 || hasSaved) && !confirm("Reset the cockpit and clear the saved session? This cannot be undone.")) return;
    transport.stop();
    state.clearScore();
    document.querySelectorAll(".pr-note").forEach((el) => el.remove());
    updateInspector();
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

  // Inspector velocity
  $("insp-vel").addEventListener("input", (e) => {
    const note = state.getSelectedNote();
    if (!note) return;
    const v = safeNumber(e.target as HTMLInputElement, note.velocity);
    state.setVelocity(note, v);
    $("insp-vel-val").textContent = String(note.velocity);
    onStateChanged();
  });
  $("insp-del").addEventListener("click", deleteSelectedNote);

  // Inspector vocal: per-note vowel + breathiness
  document.querySelectorAll<HTMLButtonElement>(".insp-vowel-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const note = state.getSelectedNote();
      if (!note || !note.vowel) return;
      const v = btn.dataset.vowel as VowelId;
      state.setVowel(note, v);
      // Update the note's visual
      const el = document.querySelector<HTMLElement>(noteSelector(note.id));
      if (el) applyNoteStyle(el, note);
      updateInspector();
      onStateChanged();
    });
  });
  $("insp-breath").addEventListener("input", (e) => {
    const note = state.getSelectedNote();
    if (!note) return;
    const prev = Math.round((note.breathiness ?? 0.15) * 100);
    const v = safeNumber(e.target as HTMLInputElement, prev);
    state.setBreathiness(note, v / 100);
    $("insp-breath-val").textContent = String(v);
    onStateChanged();
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

function exportScore(): ScoreSnapshot {
  return {
    version: 2,
    mode,
    bpm,
    voice: ($(mode === "vocal" ? "sel-vocal-voice" : "sel-voice") as HTMLSelectElement).value,
    ...(mode === "vocal" ? { vocalVoice: ($("sel-vocal-voice") as HTMLSelectElement).value } : {}),
    tuning: ($("sel-tuning") as HTMLSelectElement).value,
    refPitch: parseInt(($("ref-pitch") as HTMLInputElement).value),
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

function importScore(snap: ScoreSnapshot) {
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

  transport.stop();

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
  onStateChanged();
}

function bindScoreControls() {
  $("btn-export-score").addEventListener("click", () => {
    const json = JSON.stringify(exportScore(), null, 2);
    ($("score-json") as HTMLTextAreaElement).value = json;
    clearScoreStatus();
  });

  $("btn-import-score").addEventListener("click", () => {
    // Persistence makes overwrite permanent (autosave fires right after) —
    // confirm before replacing a non-empty score, same as Clear above (G-1).
    if (state.getScore().length > 0 && !confirm("Import will replace the current score. Continue?")) return;
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
    stop: () => transport.stop(),
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
      const note = state.addNote(result.note);
      renderNote(note);
      setScoreStatus(`Added note ${noteName(note.midi)}`, "ok");
      onStateChanged();
    },
  };
}

boot().catch(console.error);
