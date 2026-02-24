// ─── Guitar Tab Roll — Interactive Tab Editor + Real-Time Viewer ─────────────
//
// Generates a self-contained HTML document with embedded JavaScript that
// provides an interactive guitar tablature editor and playback visualizer.
//
// Features:
//   - 6-string tablature display (standard notation — high E on top)
//   - Automatic MIDI→string/fret mapping with position-aware heuristic
//   - Playback cursor with auto-scroll (synced to tempo)
//   - Click-to-add notes, click-to-select, Delete to remove
//   - Drag notes to reposition in time
//   - String reassignment (up/down arrow keys)
//   - Export edited tab data as JSON
//   - Configurable tuning system support
//   - Dark theme matching the piano roll aesthetic
//
// Usage:
//   import { renderGuitarTab } from "./guitar-tab-roll.js";
//   const html = renderGuitarTab(song, { tuning: "standard" });
//   writeFileSync("tab.html", html);
//   // Open in browser for interactive editing
// ─────────────────────────────────────────────────────────────────────────────

import { parseNoteToMidi, parseDuration, midiToNoteName } from "./note-parser.js";
import type { SongEntry, Measure } from "./songs/types.js";
import { GUITAR_TUNINGS } from "./guitar-voices.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GuitarTabOptions {
  /** First measure to render (1-based). Default: 1 */
  startMeasure?: number;
  /** Last measure to render (1-based). Default: last measure */
  endMeasure?: number;
  /** Guitar tuning ID. Default: "standard" */
  tuning?: string;
  /** Tempo override (BPM). Default: song's tempo */
  tempo?: number;
}

/** A note mapped to a guitar string/fret for tab rendering. */
interface TabNote {
  midi: number;
  fret: number;
  string: number;       // 1–6 (1 = high E, 6 = low E)
  startBeat: number;    // beat offset within measure
  durationBeats: number;
  measureIndex: number; // 0-based
  hand: "right" | "left";
  noteName: string;
}

// ─── MIDI → String/Fret Mapping ─────────────────────────────────────────────

/**
 * Map a MIDI note to the best (string, fret) pair.
 *
 * Heuristic:
 *   1. Find all valid string/fret combos (fret 0–24)
 *   2. Prefer lower fret positions (easier to play, more common)
 *   3. Among equal frets, prefer middle strings (3, 4) over extremes
 *   4. If prevString is given, prefer staying on the same or adjacent string
 *
 * @returns {string: number, fret: number} or null if unplayable
 */
function midiToStringFret(
  midi: number,
  openStrings: number[],
  prevString?: number,
): { string: number; fret: number } | null {
  const candidates: { string: number; fret: number; score: number }[] = [];

  for (let s = 0; s < openStrings.length; s++) {
    const fret = midi - openStrings[s];
    if (fret < 0 || fret > 24) continue;

    // Score: lower is better
    let score = fret * 2;                           // prefer lower frets
    score += Math.abs(s - 2.5) * 0.5;              // prefer middle strings
    if (prevString !== undefined) {
      score += Math.abs(s - (prevString - 1)) * 0.3; // proximity to previous string
    }

    candidates.push({ string: 6 - s, fret, score }); // string 6=low E, 1=high E
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.score - b.score);
  return { string: candidates[0].string, fret: candidates[0].fret };
}

// ─── Parse Song to Tab Notes ────────────────────────────────────────────────

function parseHandToNotes(
  handStr: string,
  hand: "right" | "left",
  measureIndex: number,
): { midi: number; startBeat: number; durationBeats: number; hand: "right" | "left"; measureIndex: number }[] {
  if (!handStr || handStr.trim() === "") return [];
  const tokens = handStr.trim().split(/\s+/);
  const notes: { midi: number; startBeat: number; durationBeats: number; hand: "right" | "left"; measureIndex: number }[] = [];
  let currentBeat = 0;

  for (const token of tokens) {
    const parts = token.split(":");
    const noteStr = parts[0];
    const durSuffix = parts[1] ?? "q";

    let midi: number;
    try { midi = parseNoteToMidi(noteStr); } catch { try { currentBeat += parseDuration(durSuffix); } catch { currentBeat += 1; } continue; }
    let durationBeats: number;
    try { durationBeats = parseDuration(durSuffix); } catch { durationBeats = 1; }

    if (midi >= 0) {
      notes.push({ midi, startBeat: currentBeat, durationBeats, hand, measureIndex });
    }
    currentBeat += durationBeats;
  }
  return notes;
}

function songToTabNotes(
  measures: Measure[],
  openStrings: number[],
): TabNote[] {
  // Collect all raw notes
  const rawNotes: { midi: number; startBeat: number; durationBeats: number; hand: "right" | "left"; measureIndex: number }[] = [];
  for (let i = 0; i < measures.length; i++) {
    rawNotes.push(...parseHandToNotes(measures[i].rightHand, "right", i));
    rawNotes.push(...parseHandToNotes(measures[i].leftHand, "left", i));
  }

  // Sort by time for position-aware string assignment
  rawNotes.sort((a, b) => {
    const aTime = a.measureIndex * 1000 + a.startBeat;
    const bTime = b.measureIndex * 1000 + b.startBeat;
    return aTime - bTime;
  });

  // Map to string/fret with position awareness
  // openStrings is [low E, A, D, G, B, high E] = MIDI [40, 45, 50, 55, 59, 64]
  const tabNotes: TabNote[] = [];
  let prevString: number | undefined;

  for (const n of rawNotes) {
    const sf = midiToStringFret(n.midi, openStrings, prevString);
    if (!sf) continue;
    prevString = sf.string;
    tabNotes.push({
      midi: n.midi,
      fret: sf.fret,
      string: sf.string,
      startBeat: n.startBeat,
      durationBeats: n.durationBeats,
      measureIndex: n.measureIndex,
      hand: n.hand,
      noteName: midiToNoteName(n.midi),
    });
  }

  return tabNotes;
}

// ─── Parse Time Signature ───────────────────────────────────────────────────

function parseTimeSig(ts: string): { num: number; den: number } {
  const parts = ts.split("/");
  return { num: parseInt(parts[0], 10) || 4, den: parseInt(parts[1], 10) || 4 };
}

function beatsPerMeasure(num: number, den: number): number {
  return num * (4 / den);
}

// ─── XML escape ─────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Render a SongEntry as an interactive guitar tab HTML document.
 *
 * Returns a complete self-contained HTML page with embedded CSS and JS.
 * Open in a browser for interactive editing and playback visualization.
 */
export function renderGuitarTab(
  song: SongEntry,
  options?: GuitarTabOptions,
): string {
  const opts = {
    startMeasure: options?.startMeasure ?? 1,
    endMeasure: options?.endMeasure ?? song.measures.length,
    tuning: options?.tuning ?? "standard",
    tempo: options?.tempo ?? song.tempo,
  };

  const tuning = GUITAR_TUNINGS[opts.tuning] ?? GUITAR_TUNINGS.standard;
  const openStrings = [...tuning.openStrings]; // [lowE, A, D, G, B, highE]

  const start = Math.max(1, opts.startMeasure);
  const end = Math.min(song.measures.length, opts.endMeasure);
  const measures = song.measures.filter(m => m.number >= start && m.number <= end);

  const ts = parseTimeSig(song.timeSignature);
  const bpm = beatsPerMeasure(ts.num, ts.den);

  const tabNotes = songToTabNotes(measures, openStrings);

  // String labels (high to low, matching standard tab notation)
  const stringLabels = openStrings.slice().reverse().map(midi => {
    const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    return names[midi % 12];
  });

  // Serialise data for embedding in HTML
  const songData = JSON.stringify({
    title: song.title,
    composer: song.composer ?? "",
    key: song.key,
    timeSignature: song.timeSignature,
    tempo: opts.tempo,
    bpm,
    tuningId: opts.tuning,
    tuningName: tuning.name,
    openStrings,
    stringLabels,
    startMeasure: start,
    measureCount: measures.length,
    measures: measures.map(m => ({
      number: m.number,
      dynamics: m.dynamics ?? null,
      teachingNote: m.teachingNote ?? null,
    })),
    notes: tabNotes,
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guitar Tab — ${esc(song.title)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #0f0f1a;
    color: #ccd;
    font-family: 'Consolas', 'SF Mono', 'Fira Code', monospace;
    overflow: hidden;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* ── Header ── */
  .header {
    background: #16162a;
    border-bottom: 1px solid #2a2a4a;
    padding: 10px 20px;
    display: flex;
    align-items: center;
    gap: 20px;
    flex-shrink: 0;
  }
  .header h1 { font-size: 16px; color: #eef; font-weight: 600; }
  .header .meta { font-size: 12px; color: #889; }
  .header .tuning-badge {
    background: #2a3a5a;
    color: #8af;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
  }

  /* ── Transport Controls ── */
  .transport {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }
  .transport button {
    background: #2a2a4a;
    color: #aab;
    border: 1px solid #3a3a5a;
    border-radius: 4px;
    padding: 5px 12px;
    font-family: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .transport button:hover { background: #3a3a6a; color: #eef; }
  .transport button.active { background: #4a6a9a; color: #fff; border-color: #6a8acc; }
  .transport .speed-display {
    font-size: 12px;
    color: #8af;
    min-width: 50px;
    text-align: center;
  }
  .transport input[type=range] {
    width: 80px;
    accent-color: #6a8acc;
  }

  /* ── Tab Canvas Area ── */
  .tab-area {
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    position: relative;
    cursor: crosshair;
  }
  .tab-area canvas {
    display: block;
  }

  /* ── Toolbar ── */
  .toolbar {
    background: #16162a;
    border-top: 1px solid #2a2a4a;
    padding: 8px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
    font-size: 12px;
  }
  .toolbar .status { color: #889; flex: 1; }
  .toolbar .status .sel { color: #ffa; }
  .toolbar button {
    background: #2a2a4a;
    color: #aab;
    border: 1px solid #3a3a5a;
    border-radius: 4px;
    padding: 4px 10px;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .toolbar button:hover { background: #3a3a6a; color: #eef; }
  .toolbar button.danger { border-color: #8a3a3a; }
  .toolbar button.danger:hover { background: #6a2a2a; color: #fcc; }

  /* ── Help Overlay ── */
  .help-overlay {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    z-index: 100;
    justify-content: center;
    align-items: center;
  }
  .help-overlay.visible { display: flex; }
  .help-box {
    background: #1a1a30;
    border: 1px solid #3a3a6a;
    border-radius: 8px;
    padding: 24px 32px;
    max-width: 480px;
    color: #ccd;
    font-size: 13px;
    line-height: 1.8;
  }
  .help-box h2 { color: #eef; margin-bottom: 12px; font-size: 16px; }
  .help-box kbd {
    background: #2a2a4a;
    border: 1px solid #3a3a5a;
    border-radius: 3px;
    padding: 1px 5px;
    font-size: 11px;
    color: #8af;
  }
  .help-box .close-btn {
    margin-top: 16px;
    background: #3a3a6a;
    color: #eef;
    border: none;
    border-radius: 4px;
    padding: 6px 16px;
    cursor: pointer;
    font-family: inherit;
  }
</style>
</head>
<body>

<div class="header">
  <h1 id="songTitle"></h1>
  <span class="meta" id="songMeta"></span>
  <span class="tuning-badge" id="tuningBadge"></span>
  <div class="transport">
    <button id="btnPlay" title="Play/Pause (Space)">&#9654; Play</button>
    <button id="btnStop" title="Stop (Escape)">&#9632; Stop</button>
    <input type="range" id="speedSlider" min="0.25" max="2" step="0.05" value="1">
    <span class="speed-display" id="speedDisplay">1.0x</span>
  </div>
</div>

<div class="tab-area" id="tabArea">
  <canvas id="tabCanvas"></canvas>
</div>

<div class="toolbar">
  <span class="status" id="statusBar">Click on a string to add a note. Select and press <kbd>Delete</kbd> to remove.</span>
  <button id="btnHelp" title="Keyboard shortcuts (?)">? Help</button>
  <button id="btnExport" title="Export tab data as JSON">Export JSON</button>
  <button id="btnDelete" class="danger" title="Delete selected note (Delete)">Delete</button>
</div>

<div class="help-overlay" id="helpOverlay">
  <div class="help-box">
    <h2>Keyboard Shortcuts</h2>
    <p><kbd>Space</kbd> Play / Pause</p>
    <p><kbd>Escape</kbd> Stop playback</p>
    <p><kbd>Click</kbd> Select note / Add note on string</p>
    <p><kbd>Delete</kbd> or <kbd>Backspace</kbd> Remove selected note</p>
    <p><kbd>&#8593;</kbd> Move selected note up one string</p>
    <p><kbd>&#8595;</kbd> Move selected note down one string</p>
    <p><kbd>+</kbd> / <kbd>-</kbd> Raise/lower fret by 1</p>
    <p><kbd>[</kbd> / <kbd>]</kbd> Halve/double note duration</p>
    <p><kbd>Ctrl+E</kbd> Export tab as JSON</p>
    <p><kbd>?</kbd> Toggle this help</p>
    <button class="close-btn" onclick="document.getElementById('helpOverlay').classList.remove('visible')">Close</button>
  </div>
</div>

<script>
// ─── Embedded Song Data ─────────────────────────────────────────────────────
const SONG = ${songData};

// ─── Constants ──────────────────────────────────────────────────────────────
const STRING_COLORS = [
  "#4a9eff", // string 1 (high E) — blue
  "#44dd88", // string 2 (B) — green
  "#ffd644", // string 3 (G) — gold
  "#ff9944", // string 4 (D) — orange
  "#ff5566", // string 5 (A) — coral
  "#bb66ff", // string 6 (low E) — purple
];

const BG_COLOR = "#0f0f1a";
const GRID_COLOR = "#1e1e30";
const MEASURE_LINE_COLOR = "#3a3a5a";
const CURSOR_COLOR = "#ff4444";
const SELECT_COLOR = "#ffff44";
const STRING_LINE_COLOR = "#2a2a48";
const LABEL_COLOR = "#667";
const FRET_COLOR = "#eef";
const GHOST_COLOR = "rgba(255,255,255,0.15)";

const STRING_SPACING = 28;
const LABEL_WIDTH = 40;
const HEADER_PAD = 20;
const FOOTER_PAD = 40;
const PX_PER_BEAT = 80;

// ─── State ──────────────────────────────────────────────────────────────────
let notes = SONG.notes.map((n, i) => ({ ...n, id: i }));
let nextId = notes.length;
let selectedId = null;
let isPlaying = false;
let playStartTime = null;
let playBeatOffset = 0;
let speed = 1.0;
let animFrame = null;
let ghostNote = null; // {string, beat} while hovering

const canvas = document.getElementById("tabCanvas");
const ctx = canvas.getContext("2d");
const tabArea = document.getElementById("tabArea");

// Derived dimensions
const totalBeats = SONG.measureCount * SONG.bpm;
const canvasWidth = LABEL_WIDTH + totalBeats * PX_PER_BEAT + 60;
const canvasHeight = HEADER_PAD + 6 * STRING_SPACING + FOOTER_PAD;

canvas.width = canvasWidth;
canvas.height = canvasHeight;

// ─── UI Init ────────────────────────────────────────────────────────────────
document.getElementById("songTitle").textContent = SONG.title + (SONG.composer ? " — " + SONG.composer : "");
document.getElementById("songMeta").textContent = SONG.key + " | " + SONG.tempo + " BPM | " + SONG.timeSignature + " | m." + SONG.startMeasure + "–" + (SONG.startMeasure + SONG.measureCount - 1);
document.getElementById("tuningBadge").textContent = SONG.tuningName;

// ─── Coordinate Helpers ─────────────────────────────────────────────────────
function beatToX(measureIndex, startBeat) {
  return LABEL_WIDTH + (measureIndex * SONG.bpm + startBeat) * PX_PER_BEAT;
}

function globalBeatToX(globalBeat) {
  return LABEL_WIDTH + globalBeat * PX_PER_BEAT;
}

function xToGlobalBeat(x) {
  return (x - LABEL_WIDTH) / PX_PER_BEAT;
}

function stringToY(stringNum) {
  // string 1 (high E) at top, string 6 (low E) at bottom
  return HEADER_PAD + (stringNum - 1) * STRING_SPACING + STRING_SPACING / 2;
}

function yToString(y) {
  const s = Math.round((y - HEADER_PAD - STRING_SPACING / 2) / STRING_SPACING) + 1;
  return Math.max(1, Math.min(6, s));
}

// ─── Rendering ──────────────────────────────────────────────────────────────
function draw() {
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  drawGrid();
  drawNotes();
  drawGhost();
  drawCursor();
}

function drawGrid() {
  // ── String lines ──
  ctx.strokeStyle = STRING_LINE_COLOR;
  ctx.lineWidth = 1;
  for (let s = 1; s <= 6; s++) {
    const y = stringToY(s);
    ctx.beginPath();
    ctx.moveTo(LABEL_WIDTH, y);
    ctx.lineTo(canvasWidth - 20, y);
    ctx.stroke();
  }

  // ── String labels ──
  ctx.font = "bold 13px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let s = 1; s <= 6; s++) {
    const y = stringToY(s);
    ctx.fillStyle = STRING_COLORS[s - 1];
    ctx.fillText(SONG.stringLabels[s - 1], 18, y);
  }

  // ── Measure lines + beat grid ──
  for (let m = 0; m <= SONG.measureCount; m++) {
    const x = LABEL_WIDTH + m * SONG.bpm * PX_PER_BEAT;

    // Measure boundary
    ctx.strokeStyle = MEASURE_LINE_COLOR;
    ctx.lineWidth = m === 0 || m === SONG.measureCount ? 2 : 1.5;
    ctx.beginPath();
    ctx.moveTo(x, HEADER_PAD);
    ctx.lineTo(x, HEADER_PAD + 6 * STRING_SPACING);
    ctx.stroke();

    // Measure number
    if (m < SONG.measureCount) {
      ctx.fillStyle = LABEL_COLOR;
      ctx.font = "11px monospace";
      ctx.textAlign = "center";
      ctx.fillText(String(SONG.measures[m].number), x + SONG.bpm * PX_PER_BEAT / 2, HEADER_PAD + 6 * STRING_SPACING + 16);

      // Dynamics
      if (SONG.measures[m].dynamics) {
        ctx.fillStyle = "#6b8";
        ctx.font = "italic 11px monospace";
        ctx.fillText(SONG.measures[m].dynamics, x + SONG.bpm * PX_PER_BEAT / 2, HEADER_PAD + 6 * STRING_SPACING + 30);
      }

      // Beat subdivisions
      const subdivisions = Math.floor(SONG.bpm);
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 0.5;
      for (let b = 1; b < subdivisions; b++) {
        const bx = x + b * PX_PER_BEAT;
        ctx.beginPath();
        ctx.setLineDash([3, 4]);
        ctx.moveTo(bx, HEADER_PAD);
        ctx.lineTo(bx, HEADER_PAD + 6 * STRING_SPACING);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
}

function drawNotes() {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (const note of notes) {
    const x = beatToX(note.measureIndex, note.startBeat);
    const y = stringToY(note.string);
    const w = Math.max(20, note.durationBeats * PX_PER_BEAT - 4);
    const isSelected = note.id === selectedId;

    // Note duration bar
    const color = STRING_COLORS[note.string - 1];
    ctx.fillStyle = isSelected ? SELECT_COLOR : color;
    ctx.globalAlpha = isSelected ? 0.35 : 0.2;
    ctx.fillRect(x - 2, y - STRING_SPACING / 2 + 3, w, STRING_SPACING - 6);
    ctx.globalAlpha = 1.0;

    // Fret number background circle
    const radius = 12;
    ctx.beginPath();
    ctx.arc(x + 8, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? "#443300" : "#1a1a2e";
    ctx.fill();
    ctx.strokeStyle = isSelected ? SELECT_COLOR : color;
    ctx.lineWidth = isSelected ? 2 : 1.2;
    ctx.stroke();

    // Fret number text
    ctx.fillStyle = isSelected ? SELECT_COLOR : FRET_COLOR;
    ctx.font = "bold 13px monospace";
    ctx.fillText(String(note.fret), x + 8, y + 1);
  }
}

function drawGhost() {
  if (!ghostNote || isPlaying) return;
  const x = globalBeatToX(ghostNote.beat);
  const y = stringToY(ghostNote.string);

  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fillStyle = GHOST_COLOR;
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.font = "bold 13px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", x, y + 1);
}

function drawCursor() {
  if (!isPlaying && playBeatOffset === 0) return;

  let beat;
  if (isPlaying && playStartTime !== null) {
    const elapsed = (performance.now() - playStartTime) / 1000;
    const beatsPerSec = (SONG.tempo * speed) / 60;
    beat = playBeatOffset + elapsed * beatsPerSec;
    if (beat >= totalBeats) {
      stopPlayback();
      return;
    }
  } else {
    beat = playBeatOffset;
  }

  const x = globalBeatToX(beat);
  ctx.strokeStyle = CURSOR_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, HEADER_PAD - 5);
  ctx.lineTo(x, HEADER_PAD + 6 * STRING_SPACING + 5);
  ctx.stroke();

  // Cursor head triangle
  ctx.fillStyle = CURSOR_COLOR;
  ctx.beginPath();
  ctx.moveTo(x - 5, HEADER_PAD - 5);
  ctx.lineTo(x + 5, HEADER_PAD - 5);
  ctx.lineTo(x, HEADER_PAD + 2);
  ctx.closePath();
  ctx.fill();

  // Auto-scroll to keep cursor visible
  const visibleLeft = tabArea.scrollLeft;
  const visibleRight = visibleLeft + tabArea.clientWidth;
  if (x > visibleRight - 100) {
    tabArea.scrollLeft = x - tabArea.clientWidth / 3;
  } else if (x < visibleLeft + 100) {
    tabArea.scrollLeft = Math.max(0, x - 100);
  }
}

function renderLoop() {
  draw();
  if (isPlaying) {
    animFrame = requestAnimationFrame(renderLoop);
  }
}

// ─── Playback ───────────────────────────────────────────────────────────────
function startPlayback() {
  if (isPlaying) return;
  isPlaying = true;
  playStartTime = performance.now();
  document.getElementById("btnPlay").innerHTML = "&#10074;&#10074; Pause";
  document.getElementById("btnPlay").classList.add("active");
  renderLoop();
}

function pausePlayback() {
  if (!isPlaying) return;
  const elapsed = (performance.now() - playStartTime) / 1000;
  const beatsPerSec = (SONG.tempo * speed) / 60;
  playBeatOffset += elapsed * beatsPerSec;
  isPlaying = false;
  playStartTime = null;
  if (animFrame) cancelAnimationFrame(animFrame);
  document.getElementById("btnPlay").innerHTML = "&#9654; Play";
  document.getElementById("btnPlay").classList.remove("active");
  draw();
}

function stopPlayback() {
  isPlaying = false;
  playStartTime = null;
  playBeatOffset = 0;
  if (animFrame) cancelAnimationFrame(animFrame);
  document.getElementById("btnPlay").innerHTML = "&#9654; Play";
  document.getElementById("btnPlay").classList.remove("active");
  draw();
}

function togglePlayback() {
  if (isPlaying) pausePlayback();
  else startPlayback();
}

// ─── Note Editing ───────────────────────────────────────────────────────────
function findNoteAt(x, y) {
  const clickBeat = xToGlobalBeat(x);
  const clickString = yToString(y);

  // Find closest note on this string within tolerance
  let best = null;
  let bestDist = Infinity;
  for (const note of notes) {
    if (note.string !== clickString) continue;
    const noteBeat = note.measureIndex * SONG.bpm + note.startBeat;
    const noteEndBeat = noteBeat + note.durationBeats;
    if (clickBeat >= noteBeat - 0.2 && clickBeat <= noteEndBeat + 0.2) {
      const dist = Math.abs(clickBeat - noteBeat);
      if (dist < bestDist) {
        bestDist = dist;
        best = note;
      }
    }
  }
  return best;
}

function addNote(globalBeat, stringNum) {
  // Determine measure and beat within measure
  const measureIndex = Math.floor(globalBeat / SONG.bpm);
  if (measureIndex < 0 || measureIndex >= SONG.measureCount) return;
  const startBeat = globalBeat - measureIndex * SONG.bpm;

  // Snap to nearest eighth note
  const snapped = Math.round(startBeat * 2) / 2;

  // Calculate MIDI note from string and default fret (0 = open)
  const stringIndex = 6 - stringNum; // string 6 = index 0 (low E)
  const midi = SONG.openStrings[stringIndex]; // open string

  const note = {
    id: nextId++,
    midi: midi,
    fret: 0,
    string: stringNum,
    startBeat: snapped,
    durationBeats: 1,
    measureIndex: measureIndex,
    hand: "right",
    noteName: midiToName(midi),
  };
  notes.push(note);
  selectedId = note.id;
  updateStatus();
  draw();
}

function deleteSelected() {
  if (selectedId === null) return;
  notes = notes.filter(n => n.id !== selectedId);
  selectedId = null;
  updateStatus();
  draw();
}

function moveStringUp() {
  const note = notes.find(n => n.id === selectedId);
  if (!note || note.string <= 1) return;
  note.string -= 1;
  recalcFret(note);
  draw();
  updateStatus();
}

function moveStringDown() {
  const note = notes.find(n => n.id === selectedId);
  if (!note || note.string >= 6) return;
  note.string += 1;
  recalcFret(note);
  draw();
  updateStatus();
}

function adjustFret(delta) {
  const note = notes.find(n => n.id === selectedId);
  if (!note) return;
  const newFret = note.fret + delta;
  if (newFret < 0 || newFret > 24) return;
  note.fret = newFret;
  // Recalculate MIDI from string + fret
  const stringIndex = 6 - note.string;
  note.midi = SONG.openStrings[stringIndex] + note.fret;
  note.noteName = midiToName(note.midi);
  draw();
  updateStatus();
}

function adjustDuration(factor) {
  const note = notes.find(n => n.id === selectedId);
  if (!note) return;
  const newDur = note.durationBeats * factor;
  if (newDur < 0.25 || newDur > 8) return;
  note.durationBeats = newDur;
  draw();
}

function recalcFret(note) {
  const stringIndex = 6 - note.string;
  const openMidi = SONG.openStrings[stringIndex];
  const fret = note.midi - openMidi;
  if (fret >= 0 && fret <= 24) {
    note.fret = fret;
  } else {
    // Can't play this note on this string — find closest playable
    note.fret = Math.max(0, Math.min(24, fret));
    note.midi = openMidi + note.fret;
    note.noteName = midiToName(note.midi);
  }
}

function midiToName(midi) {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(midi / 12) - 1;
  return names[midi % 12] + octave;
}

function updateStatus() {
  const bar = document.getElementById("statusBar");
  if (selectedId !== null) {
    const note = notes.find(n => n.id === selectedId);
    if (note) {
      const durLabel = {0.25: "16th", 0.5: "8th", 1: "quarter", 2: "half", 4: "whole"}[note.durationBeats] || note.durationBeats + " beats";
      bar.innerHTML = '<span class="sel">Selected:</span> ' +
        note.noteName + " (fret " + note.fret + " on string " + note.string + ") | " +
        durLabel + " | m." + SONG.measures[note.measureIndex].number +
        " — <kbd>↑↓</kbd> string  <kbd>+−</kbd> fret  <kbd>[&nbsp;]</kbd> duration  <kbd>Del</kbd> delete";
      return;
    }
  }
  bar.innerHTML = "Click on a string to add a note. Click a note to select it. Press <kbd>?</kbd> for shortcuts.";
}

function exportJSON() {
  const data = {
    song: SONG.title,
    tuning: SONG.tuningId,
    notes: notes.map(n => ({
      midi: n.midi,
      fret: n.fret,
      string: n.string,
      measure: SONG.measures[n.measureIndex].number,
      beat: n.startBeat,
      duration: n.durationBeats,
      name: n.noteName,
    })),
  };
  const json = JSON.stringify(data, null, 2);

  // Copy to clipboard + download
  navigator.clipboard.writeText(json).then(() => {
    document.getElementById("statusBar").textContent = "Tab data copied to clipboard!";
    setTimeout(updateStatus, 2000);
  }).catch(() => {});

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = SONG.title.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase() + "-tab.json";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Event Handlers ─────────────────────────────────────────────────────────
canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);

  // Check if clicking an existing note
  const hit = findNoteAt(x, y);
  if (hit) {
    selectedId = hit.id;
    updateStatus();
    draw();
    return;
  }

  // Check if clicking on a valid string area
  const globalBeat = xToGlobalBeat(x);
  if (globalBeat >= 0 && globalBeat < totalBeats && y >= HEADER_PAD && y <= HEADER_PAD + 6 * STRING_SPACING) {
    const stringNum = yToString(y);
    addNote(globalBeat, stringNum);
  } else {
    selectedId = null;
    updateStatus();
    draw();
  }
});

canvas.addEventListener("mousemove", (e) => {
  if (isPlaying) return;
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  const globalBeat = xToGlobalBeat(x);

  if (globalBeat >= 0 && globalBeat < totalBeats && y >= HEADER_PAD && y <= HEADER_PAD + 6 * STRING_SPACING) {
    const snapped = Math.round(globalBeat * 2) / 2;
    ghostNote = { beat: snapped, string: yToString(y) };
  } else {
    ghostNote = null;
  }
  draw();
});

canvas.addEventListener("mouseleave", () => {
  ghostNote = null;
  draw();
});

document.addEventListener("keydown", (e) => {
  // Don't capture when typing in an input
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

  switch (e.key) {
    case " ":
      e.preventDefault();
      togglePlayback();
      break;
    case "Escape":
      stopPlayback();
      break;
    case "Delete":
    case "Backspace":
      e.preventDefault();
      deleteSelected();
      break;
    case "ArrowUp":
      e.preventDefault();
      moveStringUp();
      break;
    case "ArrowDown":
      e.preventDefault();
      moveStringDown();
      break;
    case "+":
    case "=":
      adjustFret(1);
      break;
    case "-":
    case "_":
      adjustFret(-1);
      break;
    case "[":
      adjustDuration(0.5);
      break;
    case "]":
      adjustDuration(2);
      break;
    case "?":
      document.getElementById("helpOverlay").classList.toggle("visible");
      break;
    case "e":
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        exportJSON();
      }
      break;
  }
});

// ── Button handlers ──
document.getElementById("btnPlay").addEventListener("click", togglePlayback);
document.getElementById("btnStop").addEventListener("click", stopPlayback);
document.getElementById("btnDelete").addEventListener("click", deleteSelected);
document.getElementById("btnExport").addEventListener("click", exportJSON);
document.getElementById("btnHelp").addEventListener("click", () => {
  document.getElementById("helpOverlay").classList.toggle("visible");
});

const speedSlider = document.getElementById("speedSlider");
speedSlider.addEventListener("input", () => {
  if (isPlaying) {
    // Preserve current position when changing speed
    const elapsed = (performance.now() - playStartTime) / 1000;
    const beatsPerSec = (SONG.tempo * speed) / 60;
    playBeatOffset += elapsed * beatsPerSec;
    playStartTime = performance.now();
  }
  speed = parseFloat(speedSlider.value);
  document.getElementById("speedDisplay").textContent = speed.toFixed(2) + "x";
});

// ─── Initial Render ─────────────────────────────────────────────────────────
draw();
</script>
</body>
</html>`;
}
