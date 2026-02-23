// ─── Cockpit Main ────────────────────────────────────────────────────────────
//
// UI wiring for the Instrument Cockpit:
//   - Interactive piano roll (click to add, drag to move/resize, select, delete)
//   - Visual keyboard with QWERTY mapping + MIDI input
//   - Note inspector (velocity editing)
//   - Transport (play, stop, loop) with Web Audio scheduling
//   - Telemetry dashboard (voice count, preset, tuning, reference pitch)
// ─────────────────────────────────────────────────────────────────────────────

import {
  createSynth, VOICES, VOICE_IDS, TUNINGS, TUNING_IDS,
  type VoiceId, type TuningId, type Synth,
} from "./synth.js";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Note {
  id: string;
  midi: number;
  startSec: number;
  durationSec: number;
  velocity: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ROW_H = 14;
const MIDI_LO = 36;
const MIDI_HI = 96;
const ROWS = MIDI_HI - MIDI_LO + 1;
const PX_PER_SEC = 120;
const SCORE_SECS = 32;
const PR_WIDTH = SCORE_SECS * PX_PER_SEC;
const PR_HEIGHT = ROWS * ROW_H;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const IS_BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];
const PC_COLORS = [
  "#79c0ff", "#4c8ed9", "#7ee787", "#3fb950", "#ffa657", "#ff7b72",
  "#d2a8ff", "#9b72cf", "#f778ba", "#da3633", "#f0e68c", "#d29922",
];

function noteName(midi: number) { return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1); }

// QWERTY → MIDI (DAW keyboard layout — 2 octaves from C4)
const QWERTY: Record<string, number> = {
  z: 60, s: 61, x: 62, d: 63, c: 64, v: 65, g: 66, b: 67, h: 68, n: 69, j: 70, m: 71,
  q: 72, "2": 73, w: 74, "3": 75, e: 76, r: 77, "5": 78, t: 79, "6": 80, y: 81, "7": 82, u: 83,
};
const QWERTY_LABELS: Record<number, string> = {};
for (const [k, v] of Object.entries(QWERTY)) QWERTY_LABELS[v] = k.toUpperCase();

// ─── State ───────────────────────────────────────────────────────────────────

let synth: Synth;
const score: Note[] = [];
let selectedNote: Note | null = null;
let isPlaying = false;
let looping = false;
let playPosition = 0;
let playStartAudio = 0;
let playStartOffset = 0;
let bpm = 120;
let nextId = 1;
let animFrame = 0;
const heldKeys = new Set<string>();
const heldMidi = new Set<number>();

// ─── DOM ─────────────────────────────────────────────────────────────────────

const $ = (id: string) => document.getElementById(id)!;

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
  synth = createSynth();
  await synth.connect();
  populateSelectors();
  buildPianoRoll();
  buildKeyboard();
  bindControls();
  bindMidi();
  updateTelemetry();
  setInterval(updateTelemetry, 200);
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
  vs.addEventListener("change", () => { synth.setVoice(vs.value as VoiceId); updateTelemetry(); });

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
  ts.addEventListener("change", () => { synth.setTuning(ts.value as TuningId); updateTelemetry(); });

  ($("ref-pitch") as HTMLInputElement).addEventListener("change", (e) => {
    synth.setRefPitch(parseInt((e.target as HTMLInputElement).value));
    updateTelemetry();
  });
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

  // Vertical beat lines
  drawBeatLines();

  // Click empty space → add note
  pr.addEventListener("mousedown", (e) => {
    if ((e.target as HTMLElement).closest(".pr-note")) return;
    const rect = pr.getBoundingClientRect();
    const scrollParent = pr.parentElement!;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const midi = MIDI_HI - Math.floor(y / ROW_H);
    if (midi < MIDI_LO || midi > MIDI_HI) return;
    const startSec = quantize(x / PX_PER_SEC);
    const note: Note = {
      id: "n" + nextId++, midi, startSec,
      durationSec: 60 / bpm, velocity: 100,
    };
    score.push(note);
    renderNote(note);
    selectNote(note);
    // Preview sound
    synth.noteOn(midi, 100);
    setTimeout(() => synth.noteOff(midi), 180);
  });
}

function quantize(sec: number): number {
  const grid = 60 / bpm / 4;
  return Math.max(0, Math.round(sec / grid) * grid);
}

function drawBeatLines() {
  document.querySelectorAll(".pr-beat-line").forEach((el) => el.remove());
  const pr = $("piano-roll");
  const beatSec = 60 / bpm;
  for (let t = 0; t < SCORE_SECS; t += beatSec) {
    const div = document.createElement("div");
    div.className = "pr-beat-line";
    if (Math.round(t / beatSec) % 4 === 0) div.classList.add("bar");
    div.style.left = t * PX_PER_SEC + "px";
    pr.appendChild(div);
  }
}

function renderNote(note: Note) {
  const pr = $("piano-roll");
  const el = document.createElement("div");
  el.className = "pr-note";
  el.dataset.noteId = note.id;
  el.style.background = PC_COLORS[((note.midi % 12) + 12) % 12];
  positionNote(el, note);

  // ── Resize handle on right edge ──
  const handle = document.createElement("div");
  handle.style.cssText = "position:absolute;right:0;top:0;bottom:0;width:6px;cursor:ew-resize;";
  el.appendChild(handle);

  handle.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    selectNote(note);
    const startX = e.clientX;
    const startDur = note.durationSec;
    const onMove = (e2: MouseEvent) => {
      note.durationSec = Math.max(60 / bpm / 4, quantize(startDur + (e2.clientX - startX) / PX_PER_SEC) || 60 / bpm / 4);
      positionNote(el, note);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
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
    const origSec = note.startSec, origMidi = note.midi;

    const onMove = (e2: MouseEvent) => {
      note.startSec = Math.max(0, quantize(origSec + (e2.clientX - startX) / PX_PER_SEC));
      note.midi = Math.max(MIDI_LO, Math.min(MIDI_HI, origMidi - Math.round((e2.clientY - startY) / ROW_H)));
      el.style.background = PC_COLORS[((note.midi % 12) + 12) % 12];
      positionNote(el, note);
      updateInspector();
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });

  pr.appendChild(el);
}

function positionNote(el: HTMLElement, note: Note) {
  el.style.left = note.startSec * PX_PER_SEC + "px";
  el.style.top = (MIDI_HI - note.midi) * ROW_H + "px";
  el.style.width = Math.max(8, note.durationSec * PX_PER_SEC) + "px";
  el.style.height = ROW_H - 1 + "px";
}

function selectNote(note: Note | null) {
  document.querySelectorAll(".pr-note.selected").forEach((el) => el.classList.remove("selected"));
  selectedNote = note;
  if (note) {
    document.querySelector(`[data-note-id="${note.id}"]`)?.classList.add("selected");
  }
  updateInspector();
}

function deleteSelectedNote() {
  if (!selectedNote) return;
  const i = score.indexOf(selectedNote);
  if (i >= 0) score.splice(i, 1);
  document.querySelector(`[data-note-id="${selectedNote.id}"]`)?.remove();
  selectedNote = null;
  updateInspector();
}

// ─── Inspector ───────────────────────────────────────────────────────────────

function updateInspector() {
  const insp = $("inspector");
  if (!selectedNote) { insp.classList.remove("active"); return; }
  insp.classList.add("active");
  $("insp-name").textContent = noteName(selectedNote.midi);
  ($("insp-vel") as HTMLInputElement).value = String(selectedNote.velocity);
  $("insp-vel-val").textContent = String(selectedNote.velocity);
}

// ─── Keyboard ────────────────────────────────────────────────────────────────

const KB_LO = 48; // C3
const KB_HI = 84; // C6 (inclusive)

function buildKeyboard() {
  const kb = $("keyboard");
  const whites: number[] = [];
  for (let m = KB_LO; m <= KB_HI; m++) {
    if (!IS_BLACK[m % 12]) whites.push(m);
  }

  const totalW = kb.clientWidth || 800;
  const ww = totalW / whites.length;
  const bw = ww * 0.58;

  // White keys
  for (let i = 0; i < whites.length; i++) {
    const midi = whites[i];
    const key = document.createElement("div");
    key.className = "kb-white";
    key.style.left = i * ww + "px";
    key.style.width = (ww - 1) + "px";
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
  }

  // Black keys
  for (let m = KB_LO; m <= KB_HI; m++) {
    if (!IS_BLACK[m % 12]) continue;
    const wi = whites.indexOf(m - 1);
    if (wi < 0) continue;

    const key = document.createElement("div");
    key.className = "kb-black";
    key.style.left = ((wi + 1) * ww - bw / 2 - 0.5) + "px";
    key.style.width = bw + "px";
    key.dataset.midi = String(m);

    if (QWERTY_LABELS[m]) {
      const sc = document.createElement("div");
      sc.className = "kb-shortcut";
      sc.textContent = QWERTY_LABELS[m];
      sc.style.bottom = "8px";
      sc.style.color = "#666";
      key.appendChild(sc);
    }

    key.addEventListener("mousedown", (e) => { e.preventDefault(); midiKeyDown(m); });
    key.addEventListener("mouseup", () => midiKeyUp(m));
    key.addEventListener("mouseleave", () => { if (heldMidi.has(m)) midiKeyUp(m); });
    kb.appendChild(key);
  }

  // QWERTY events
  window.addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "SELECT") return;
    const k = e.key.toLowerCase();

    if (k === " ") { e.preventDefault(); togglePlay(); return; }
    if (k === "escape") { panic(); return; }
    if (k === "delete" || k === "backspace") { e.preventDefault(); deleteSelectedNote(); return; }

    if (QWERTY[k] !== undefined && !heldKeys.has(k)) {
      heldKeys.add(k);
      midiKeyDown(QWERTY[k]);
    }
  });

  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (QWERTY[k] !== undefined) { heldKeys.delete(k); midiKeyUp(QWERTY[k]); }
  });
}

function midiKeyDown(midi: number) {
  if (heldMidi.has(midi)) return;
  heldMidi.add(midi);
  synth.noteOn(midi, 100);
  updateKeyVisuals();
}

function midiKeyUp(midi: number) {
  if (!heldMidi.has(midi)) return;
  heldMidi.delete(midi);
  synth.noteOff(midi);
  updateKeyVisuals();
}

function updateKeyVisuals() {
  document.querySelectorAll<HTMLElement>(".kb-white, .kb-black").forEach((el) => {
    const m = parseInt(el.dataset.midi ?? "0");
    el.classList.toggle("active", heldMidi.has(m));
  });
}

function panic() {
  synth.allNotesOff();
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
        if ((status & 0xf0) === 0x90 && vel > 0) { synth.noteOn(note, vel); heldMidi.add(note); updateKeyVisuals(); }
        else if ((status & 0xf0) === 0x80 || ((status & 0xf0) === 0x90 && vel === 0)) { synth.noteOff(note); heldMidi.delete(note); updateKeyVisuals(); }
      };
    }
    // Handle hot-plug
    access.onstatechange = () => {
      for (const input of access.inputs.values()) {
        if (!input.onmidimessage) {
          input.onmidimessage = (e: MIDIMessageEvent) => {
            if (!e.data || e.data.length < 3) return;
            const [status, note, vel] = e.data;
            if ((status & 0xf0) === 0x90 && vel > 0) { synth.noteOn(note, vel); heldMidi.add(note); updateKeyVisuals(); }
            else if ((status & 0xf0) === 0x80 || ((status & 0xf0) === 0x90 && vel === 0)) { synth.noteOff(note); heldMidi.delete(note); updateKeyVisuals(); }
          };
        }
      }
    };
  }).catch(() => { /* MIDI not available */ });
}

// ─── Transport ───────────────────────────────────────────────────────────────

function togglePlay() { isPlaying ? stop() : play(); }

function play() {
  stop();
  if (score.length === 0) return;
  const ctx = synth.getContext();
  if (!ctx) return;
  isPlaying = true;
  $("btn-play").textContent = "⏸";

  const audioNow = ctx.currentTime;
  const offset = playPosition;
  const sorted = [...score].sort((a, b) => a.startSec - b.startSec);

  for (const note of sorted) {
    if (note.startSec + note.durationSec <= offset) continue;
    const onTime = audioNow + Math.max(0, note.startSec - offset);
    const offTime = audioNow + Math.max(0, note.startSec + note.durationSec - offset);
    synth.noteOn(note.midi, note.velocity, onTime);
    synth.noteOff(note.midi, offTime);
  }

  playStartAudio = audioNow;
  playStartOffset = offset;
  animatePlayhead();
}

function stop() {
  isPlaying = false;
  synth.allNotesOff();
  $("btn-play").textContent = "▶";
  if (animFrame) { cancelAnimationFrame(animFrame); animFrame = 0; }
  $("playhead").style.display = "none";
}

function animatePlayhead() {
  if (!isPlaying) return;
  const ctx = synth.getContext();
  if (!ctx) return;

  const elapsed = ctx.currentTime - playStartAudio;
  playPosition = playStartOffset + elapsed;
  const maxSec = score.reduce((m, n) => Math.max(m, n.startSec + n.durationSec), 0);

  if (playPosition >= maxSec) {
    if (looping && maxSec > 0) { playPosition = 0; play(); return; }
    stop();
    playPosition = 0;
    updateTransportTime();
    return;
  }

  const ph = $("playhead");
  ph.style.display = "block";
  ph.style.left = playPosition * PX_PER_SEC + "px";
  updateTransportTime();
  animFrame = requestAnimationFrame(animatePlayhead);
}

function updateTransportTime() {
  const m = Math.floor(playPosition / 60);
  const s = (playPosition % 60).toFixed(1).padStart(4, "0");
  $("transport-time").textContent = `${m}:${s}`;
}

// ─── Controls ────────────────────────────────────────────────────────────────

function bindControls() {
  $("btn-play").addEventListener("click", togglePlay);
  $("btn-stop").addEventListener("click", () => { stop(); playPosition = 0; updateTransportTime(); });
  $("btn-loop").addEventListener("click", () => {
    looping = !looping;
    $("btn-loop").classList.toggle("active", looping);
  });

  $("btn-clear").addEventListener("click", () => {
    stop(); playPosition = 0; updateTransportTime();
    score.length = 0;
    selectedNote = null;
    document.querySelectorAll(".pr-note").forEach((el) => el.remove());
    updateInspector();
  });

  $("btn-panic").addEventListener("click", panic);

  // Inspector velocity
  $("insp-vel").addEventListener("input", (e) => {
    if (!selectedNote) return;
    selectedNote.velocity = parseInt((e.target as HTMLInputElement).value);
    $("insp-vel-val").textContent = String(selectedNote.velocity);
  });
  $("insp-del").addEventListener("click", deleteSelectedNote);

  // Master volume
  $("master-vol").addEventListener("input", (e) => {
    const v = parseInt((e.target as HTMLInputElement).value);
    $("master-vol-val").textContent = String(v);
    // Apply to AudioContext destination via a gain trick:
    // We re-set master gain on the synth's compressor output.
    // For simplicity, just update the voice config masterGain.
    // A better approach: expose a masterVolume setter on Synth.
  });

  // BPM
  ($("bpm") as HTMLInputElement).addEventListener("change", (e) => {
    bpm = Math.max(20, Math.min(300, parseInt((e.target as HTMLInputElement).value) || 120));
    drawBeatLines();
  });
}

// ─── Telemetry ───────────────────────────────────────────────────────────────

function updateTelemetry() {
  const vc = synth.getActiveCount();
  $("tl-voices").textContent = String(vc);
  $("badge-voices").textContent = vc + " voices";

  const v = synth.getVoice();
  $("tl-preset").textContent = v.name.split(" ")[0];

  const t = synth.getTuning();
  const label = t.id === "equal" ? "12-TET" : t.name.split("(")[0].trim();
  $("tl-tuning").textContent = label;
  $("badge-tuning").textContent = label;
  $("tl-ref").textContent = String(synth.getRefPitch());
}

// ─── Boot ────────────────────────────────────────────────────────────────────

init().catch(console.error);
