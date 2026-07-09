// ─── Piano Roll Renderer ─────────────────────────────────────────────────────
//
// Pure SVG string generator — zero dependencies beyond note-parser.
// Renders a SongEntry as a piano roll visualization that Claude can read
// as an image to verify pitch accuracy, rhythm, and hand balance.
//
// Visual spec:
//   X-axis = time (beats within measures, left → right)
//   Y-axis = pitch (MIDI note number, low at bottom, high at top)
//   Blue rectangles = right hand, coral = left hand
//   Vertical grid lines = beat boundaries (thin) + measure boundaries (thick)
//   Pitch labels on left axis, measure numbers below
// ─────────────────────────────────────────────────────────────────────────────

import { parseNoteToMidi, parseDuration, midiToNoteName, splitChordToken } from "./note-parser.js";
import type { SongEntry, Measure } from "./songs/types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export type PianoRollColorMode = "hand" | "pitch-class";

export interface PianoRollOptions {
  /** First measure to render (1-based). Default: 1 */
  startMeasure?: number;
  /** Last measure to render (1-based). Default: last measure */
  endMeasure?: number;
  /** Horizontal pixels per beat. Default: 60 */
  pixelsPerBeat?: number;
  /** Vertical pixels per semitone row. Default: 10 */
  pitchRowHeight?: number;
  /** Show metronome dots on downbeats. Default: true */
  showMetronome?: boolean;
  /** Show dynamics markings. Default: true */
  showDynamics?: boolean;
  /** Show measure teaching notes as tooltip titles. Default: false */
  showTeachingNotes?: boolean;
  /** Note coloring mode. Default: "hand" (blue RH / coral LH). */
  colorMode?: PianoRollColorMode;
}

/** A resolved note ready for rendering. */
interface PlottedNote {
  midi: number;
  startBeat: number;      // beat offset from start of its measure
  durationBeats: number;
  measureIndex: number;   // 0-based index into the rendered measures
  hand: "right" | "left";
}

// ─── Theme Colors ───────────────────────────────────────────────────────────

const COLORS = {
  bg: "#1a1a2e",
  gridLine: "#2a2a3e",
  gridMeasure: "#3a3a5e",
  gridOctave: "#3a3a5e",
  rhNote: "#4a9eff",
  lhNote: "#ff6b8a",
  rhNoteStroke: "#3580cc",
  lhNoteStroke: "#cc5570",
  text: "#8888aa",
  textBright: "#ccccdd",
  headerText: "#ddddee",
  metronome: "#ffaa33",
  dynamics: "#77cc77",
  pitchLabelC: "#aaaacc",
  pitchLabel: "#666688",
  blackKeyBg: "#151526",
};

// ─── Pitch-Class Colors ─────────────────────────────────────────────────────

/** 12 chromatic colors, warm-to-cool rainbow. Index = pitch class (C=0). */
const PITCH_CLASS_COLORS: { fill: string; stroke: string; name: string }[] = [
  { fill: "#ff4444", stroke: "#cc2222", name: "C" },
  { fill: "#ff8844", stroke: "#cc6622", name: "C#" },
  { fill: "#ffcc44", stroke: "#ccaa22", name: "D" },
  { fill: "#88dd44", stroke: "#66bb22", name: "D#" },
  { fill: "#44dd44", stroke: "#22bb22", name: "E" },
  { fill: "#44ddaa", stroke: "#22bb88", name: "F" },
  { fill: "#44ccdd", stroke: "#22aabb", name: "F#" },
  { fill: "#4488ff", stroke: "#2266cc", name: "G" },
  { fill: "#6644ff", stroke: "#4422cc", name: "G#" },
  { fill: "#aa44ff", stroke: "#8822cc", name: "A" },
  { fill: "#dd44cc", stroke: "#bb22aa", name: "A#" },
  { fill: "#ff4488", stroke: "#cc2266", name: "B" },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Check if a MIDI note is a black key. */
function isBlackKey(midi: number): boolean {
  const pc = midi % 12;
  return [1, 3, 6, 8, 10].includes(pc); // C#, D#, F#, G#, A#
}

/** Parse time signature string "3/8" → { num, den }. */
function parseTimeSig(ts: string): { num: number; den: number } {
  const parts = ts.split("/");
  return {
    num: parseInt(parts[0], 10) || 4,
    den: parseInt(parts[1], 10) || 4,
  };
}

/** Beats per measure from time signature. */
function beatsPerMeasure(num: number, den: number): number {
  // Normalize to quarter-note beats
  // 3/8 → 1.5 quarter-note beats, 4/4 → 4, 6/8 → 3
  return num * (4 / den);
}

/** Parse a hand string into PlottedNotes. */
function parseHand(
  handStr: string,
  hand: "right" | "left",
  measureIndex: number,
): PlottedNote[] {
  if (!handStr || handStr.trim() === "") return [];

  const tokens = handStr.trim().split(/\s+/);
  const notes: PlottedNote[] = [];
  let currentBeat = 0;

  for (const token of tokens) {
    // Chord tokens join simultaneous tones with "+" (e.g. "C4+E4+G4:q",
    // the MIDI-ingest format); a single note is a one-part chord. Every
    // tone plots at the same startBeat; the beat cursor advances by the
    // chord's longest tone (the ingest stamps the shared duration from
    // its longest note).
    let advanceBeats = 0;

    for (const { noteStr, durSuffix } of splitChordToken(token)) {
      let durationBeats: number;
      try {
        durationBeats = parseDuration(durSuffix);
      } catch {
        durationBeats = 1;
      }
      advanceBeats = Math.max(advanceBeats, durationBeats);

      let midi: number;
      try {
        midi = parseNoteToMidi(noteStr);
      } catch {
        // Skip unparseable tones, keep the rest of the chord
        continue;
      }

      if (midi >= 0) {
        // Not a rest
        notes.push({
          midi,
          startBeat: currentBeat,
          durationBeats,
          measureIndex,
          hand,
        });
      }
    }

    currentBeat += advanceBeats;
  }

  return notes;
}

/** XML-escape a string for SVG text content. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Render a SongEntry as an SVG piano roll string.
 *
 * Returns a complete SVG document as a string — no file I/O,
 * no DOM, no external dependencies.
 */
export function renderPianoRoll(
  song: SongEntry,
  options?: PianoRollOptions,
): string {
  const opts = {
    startMeasure: options?.startMeasure ?? 1,
    endMeasure: options?.endMeasure ?? song.measures.length,
    pixelsPerBeat: options?.pixelsPerBeat ?? 60,
    pitchRowHeight: options?.pitchRowHeight ?? 10,
    showMetronome: options?.showMetronome ?? true,
    showDynamics: options?.showDynamics ?? true,
    showTeachingNotes: options?.showTeachingNotes ?? false,
    colorMode: options?.colorMode ?? "hand",
  };

  // Clamp measure range
  const start = Math.max(1, opts.startMeasure);
  const end = Math.min(song.measures.length, opts.endMeasure);
  const measures = song.measures.filter(m => m.number >= start && m.number <= end);

  if (measures.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100">
      <rect width="400" height="100" fill="${COLORS.bg}"/>
      <text x="200" y="55" text-anchor="middle" fill="${COLORS.text}" font-family="monospace" font-size="14">No measures in range ${start}-${end}</text>
    </svg>`;
  }

  // ── Parse time signature ──
  const ts = parseTimeSig(song.timeSignature);
  const bpm = beatsPerMeasure(ts.num, ts.den);

  // ── Collect all plotted notes ──
  const allNotes: PlottedNote[] = [];
  for (let i = 0; i < measures.length; i++) {
    const m = measures[i];
    allNotes.push(...parseHand(m.rightHand, "right", i));
    allNotes.push(...parseHand(m.leftHand, "left", i));
  }

  // ── Find pitch range ──
  const pitched = allNotes.filter(n => n.midi >= 0);
  if (pitched.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100">
      <rect width="400" height="100" fill="${COLORS.bg}"/>
      <text x="200" y="55" text-anchor="middle" fill="${COLORS.text}" font-family="monospace" font-size="14">No pitched notes in range ${start}-${end}</text>
    </svg>`;
  }

  const minMidi = Math.max(0, pitched.reduce((m, n) => Math.min(m, n.midi), Infinity) - 3);
  const maxMidi = Math.min(127, pitched.reduce((m, n) => Math.max(m, n.midi), -Infinity) + 3);
  const pitchRange = maxMidi - minMidi + 1;

  // ── Layout dimensions ──
  const labelWidth = 50;     // left axis pitch labels
  const headerHeight = 50;   // top: title + metadata
  const footerHeight = 40;   // bottom: measure numbers + metronome
  const padding = 10;

  const gridWidth = measures.length * bpm * opts.pixelsPerBeat;
  const gridHeight = pitchRange * opts.pitchRowHeight;

  const totalWidth = labelWidth + gridWidth + padding * 2;
  const totalHeight = headerHeight + gridHeight + footerHeight + padding;

  const gridX = labelWidth + padding;
  const gridY = headerHeight;

  // ── Begin SVG ──
  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">`);

  // Styles
  lines.push(`<style>`);
  lines.push(`  text { font-family: 'Consolas', 'SF Mono', 'Fira Code', monospace; }`);
  lines.push(`  .note-rh { fill: ${COLORS.rhNote}; stroke: ${COLORS.rhNoteStroke}; stroke-width: 0.5; rx: 2; ry: 2; }`);
  lines.push(`  .note-lh { fill: ${COLORS.lhNote}; stroke: ${COLORS.lhNoteStroke}; stroke-width: 0.5; rx: 2; ry: 2; }`);
  lines.push(`  .note-rh:hover { opacity: 0.85; }`);
  lines.push(`  .note-lh:hover { opacity: 0.85; }`);
  lines.push(`</style>`);

  // Background
  lines.push(`<rect width="${totalWidth}" height="${totalHeight}" fill="${COLORS.bg}"/>`);

  // ── Header ──
  const composerLabel = song.composer ? ` — ${song.composer}` : "";
  const headerText = `${song.title}${composerLabel}`;
  const subHeader = `${song.key} | ${song.tempo} BPM | ${song.timeSignature} | m.${start}–${end}`;

  lines.push(`<text x="${gridX}" y="${headerHeight - 24}" fill="${COLORS.headerText}" font-size="16" font-weight="bold">${esc(headerText)}</text>`);
  lines.push(`<text x="${gridX}" y="${headerHeight - 8}" fill="${COLORS.text}" font-size="11">${esc(subHeader)}</text>`);

  // ── Grid background: highlight black key rows ──
  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const y = gridY + (maxMidi - midi) * opts.pitchRowHeight;
    if (isBlackKey(midi)) {
      lines.push(`<rect x="${gridX}" y="${y}" width="${gridWidth}" height="${opts.pitchRowHeight}" fill="${COLORS.blackKeyBg}" opacity="0.5"/>`);
    }
  }

  // ── Grid lines: horizontal (pitch rows) ──
  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const y = gridY + (maxMidi - midi) * opts.pitchRowHeight;
    const isC = midi % 12 === 0; // C notes get brighter lines
    const color = isC ? COLORS.gridOctave : COLORS.gridLine;
    const width = isC ? 1 : 0.3;
    lines.push(`<line x1="${gridX}" y1="${y}" x2="${gridX + gridWidth}" y2="${y}" stroke="${color}" stroke-width="${width}"/>`);
  }

  // ── Grid lines: vertical (beats + measures) ──
  const measureWidth = bpm * opts.pixelsPerBeat;
  for (let i = 0; i <= measures.length; i++) {
    const x = gridX + i * measureWidth;
    // Measure boundary (thick)
    lines.push(`<line x1="${x}" y1="${gridY}" x2="${x}" y2="${gridY + gridHeight}" stroke="${COLORS.gridMeasure}" stroke-width="1.5"/>`);

    // Beat lines within each measure (thin)
    if (i < measures.length) {
      // Number of beat lines depends on time signature
      // For 3/8: we want lines at each eighth note = each beat in our system
      // For 4/4: we want lines at each quarter note
      const subdivisionsPerMeasure = ts.num;
      for (let b = 1; b < subdivisionsPerMeasure; b++) {
        const beatX = x + (b / subdivisionsPerMeasure) * measureWidth;
        lines.push(`<line x1="${beatX}" y1="${gridY}" x2="${beatX}" y2="${gridY + gridHeight}" stroke="${COLORS.gridLine}" stroke-width="0.3" stroke-dasharray="2,3"/>`);
      }
    }
  }

  // ── Pitch labels (left axis) ──
  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const y = gridY + (maxMidi - midi) * opts.pitchRowHeight + opts.pitchRowHeight * 0.7;
    const name = midiToNoteName(midi);
    const isC = midi % 12 === 0;
    const color = isC ? COLORS.pitchLabelC : COLORS.pitchLabel;
    const size = isC ? 10 : 8;
    const weight = isC ? "bold" : "normal";
    // Only label natural notes + C notes to avoid clutter
    if (!isBlackKey(midi) || isC) {
      lines.push(`<text x="${gridX - 4}" y="${y}" text-anchor="end" fill="${color}" font-size="${size}" font-weight="${weight}">${name}</text>`);
    }
  }

  // ── Note rectangles ──
  for (const note of allNotes) {
    const x = gridX + note.measureIndex * measureWidth + (note.startBeat / bpm) * measureWidth;
    const y = gridY + (maxMidi - note.midi) * opts.pitchRowHeight + 1;
    const w = Math.max(2, (note.durationBeats / bpm) * measureWidth - 1);
    const h = opts.pitchRowHeight - 2;
    const noteName = midiToNoteName(note.midi);
    const handLabel = note.hand === "right" ? "RH" : "LH";

    let fill: string;
    let stroke: string;
    if (opts.colorMode === "pitch-class") {
      const pc = note.midi % 12;
      fill = PITCH_CLASS_COLORS[pc].fill;
      stroke = PITCH_CLASS_COLORS[pc].stroke;
    } else {
      fill = note.hand === "right" ? COLORS.rhNote : COLORS.lhNote;
      stroke = note.hand === "right" ? COLORS.rhNoteStroke : COLORS.lhNoteStroke;
    }

    lines.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="0.5" rx="2" ry="2">`);
    lines.push(`  <title>${handLabel}: ${noteName} (m.${measures[note.measureIndex].number})</title>`);
    lines.push(`</rect>`);
  }

  // ── Measure numbers (footer) ──
  const footerY = gridY + gridHeight;
  for (let i = 0; i < measures.length; i++) {
    const x = gridX + i * measureWidth + measureWidth / 2;
    lines.push(`<text x="${x}" y="${footerY + 16}" text-anchor="middle" fill="${COLORS.text}" font-size="10">${measures[i].number}</text>`);
  }

  // ── Metronome dots ──
  if (opts.showMetronome) {
    for (let i = 0; i < measures.length; i++) {
      const x = gridX + i * measureWidth + 4;
      lines.push(`<circle cx="${x}" cy="${footerY + 28}" r="3" fill="${COLORS.metronome}"/>`);
    }
  }

  // ── Dynamics markings ──
  if (opts.showDynamics) {
    for (let i = 0; i < measures.length; i++) {
      const m = measures[i];
      if (m.dynamics) {
        const x = gridX + i * measureWidth + measureWidth / 2;
        lines.push(`<text x="${x}" y="${footerY + 38}" text-anchor="middle" fill="${COLORS.dynamics}" font-size="11" font-style="italic">${esc(m.dynamics)}</text>`);
      }
    }
  }

  // ── Legend ──
  if (opts.colorMode === "pitch-class") {
    // Chromatic pitch-class legend: show only the pitch classes present in the song
    const presentPcs = [...new Set(allNotes.map(n => n.midi % 12))].sort((a, b) => a - b);
    const legendY = footerY + 16;
    let lx = gridX + gridWidth - presentPcs.length * 28;
    for (const pc of presentPcs) {
      const c = PITCH_CLASS_COLORS[pc];
      lines.push(`<rect x="${lx}" y="${legendY - 8}" width="8" height="8" fill="${c.fill}" rx="1"/>`);
      lines.push(`<text x="${lx + 11}" y="${legendY}" fill="${COLORS.text}" font-size="8">${c.name}</text>`);
      lx += 28;
    }
  } else {
    // Hand-based legend (default)
    const legendY = footerY + 16;
    const legendX = gridX + gridWidth - 120;
    lines.push(`<rect x="${legendX}" y="${legendY - 8}" width="8" height="8" fill="${COLORS.rhNote}" rx="1"/>`);
    lines.push(`<text x="${legendX + 12}" y="${legendY}" fill="${COLORS.text}" font-size="9">Right Hand</text>`);
    lines.push(`<rect x="${legendX + 70}" y="${legendY - 8}" width="8" height="8" fill="${COLORS.lhNote}" rx="1"/>`);
    lines.push(`<text x="${legendX + 82}" y="${legendY}" fill="${COLORS.text}" font-size="9">Left Hand</text>`);
  }

  // ── Close SVG ──
  lines.push(`</svg>`);

  return lines.join("\n");
}
