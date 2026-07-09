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
  gridOctave: "#7a6a52", // warm landmark tone for C-rows, distinct from the cool grid
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
  pillBg: "#242440",
  pillBorder: "#3a3a5e",
};

// ─── Pitch-Class Colors ─────────────────────────────────────────────────────

/**
 * 12 chromatic colors on an OKLCH-even hue wheel (fill L 0.75 C 0.12;
 * stroke L 0.55 C 0.09 — same 12 hues, a darker/quieter companion).
 * Every pitch class sits at the same perceptual lightness and chroma, so
 * no hue "screams louder" than its neighbors. Index = pitch class (C=0).
 */
const PITCH_CLASS_COLORS: { fill: string; stroke: string; name: string }[] = [
  { fill: "#f08e8e", stroke: "#9f5b5c", name: "C" },
  { fill: "#eb9666", stroke: "#9c613f", name: "C#" },
  { fill: "#d6a54d", stroke: "#8d6b2d", name: "D" },
  { fill: "#b3b454", stroke: "#757633", name: "D#" },
  { fill: "#84c177", stroke: "#547e4b", name: "E" },
  { fill: "#4fc6a2", stroke: "#2e8269", name: "F" },
  { fill: "#2ac4cc", stroke: "#118186", name: "F#" },
  { fill: "#4ebceb", stroke: "#2e7b9c", name: "G" },
  { fill: "#81aefa", stroke: "#5272a6", name: "G#" },
  { fill: "#ada0f5", stroke: "#7168a3", name: "A" },
  { fill: "#d094dd", stroke: "#896092", name: "A#" },
  { fill: "#e78db9", stroke: "#995b79", name: "B" },
];

// ─── Dynamics → Note Opacity ────────────────────────────────────────────────

/**
 * Dynamics markings ramped to note fill-opacity (pp quietest → ff loudest),
 * evenly spaced across ~0.55-1.0 so soft passages visibly read soft. A
 * marking carries forward until the next one (crescendo/decrescendo and
 * unrecognized text don't reset the level — they ride the current one).
 * Measures with no marking in effect render at DEFAULT_NOTE_OPACITY.
 */
const DYNAMICS_OPACITY: Record<string, number> = {
  pp: 0.55,
  p: 0.64,
  mp: 0.73,
  mf: 0.82,
  f: 0.91,
  ff: 1.0,
};
const DEFAULT_NOTE_OPACITY = 1.0;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Check if a MIDI note is a black key. */
function isBlackKey(midi: number): boolean {
  const pc = midi % 12;
  return [1, 3, 6, 8, 10].includes(pc); // C#, D#, F#, G#, A#
}

/**
 * Lighten a "#rrggbb" hex color toward white by `amount` (0-1). Used for
 * the note "onset cap" — a brighter sliver on the note's left edge that
 * reads as its attack transient.
 */
function lighten(hex: string, amount: number): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const toHex = (c: number) => c.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
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

/**
 * Estimated text width (px) for `label` at `fontSize`, assuming a ~0.62em
 * monospace advance width. Generous on purpose — safe for the generic
 * `monospace` fallback font, which tends to run wider than curated faces
 * like Consolas/SF Mono on other people's machines.
 */
function monoTextWidth(label: string, fontSize: number): number {
  return label.length * fontSize * 0.62;
}

/** Width (px) of a `legendPill` for `label` — call before laying out a row. */
function legendPillWidth(label: string): number {
  const fontSize = 9;
  const dotR = 3;
  const padLeft = 8;
  const padRight = 8;
  const gapDotText = 5;
  return padLeft + dotR * 2 + gapDotText + monoTextWidth(label, fontSize) + padRight;
}

/** Render a legend chip: a rounded pill with a color dot + label. */
function legendPill(x: number, y: number, color: string, label: string): string {
  const fontSize = 9;
  const dotR = 3;
  const padLeft = 8;
  const gapDotText = 5;
  const height = 16;
  const width = legendPillWidth(label);
  return [
    `<rect x="${x.toFixed(1)}" y="${y}" width="${width.toFixed(1)}" height="${height}" rx="8" ry="8" fill="${COLORS.pillBg}" stroke="${COLORS.pillBorder}" stroke-width="0.5"/>`,
    `<circle cx="${(x + padLeft + dotR).toFixed(1)}" cy="${y + height / 2}" r="${dotR}" fill="${color}"/>`,
    `<text x="${(x + padLeft + dotR * 2 + gapDotText).toFixed(1)}" y="${y + height / 2 + 3}" fill="${COLORS.text}" font-size="${fontSize}">${esc(label)}</text>`,
  ].join("\n");
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
  const headerHeight = 50;   // top: title + metadata pills
  const footerHeight = 70;   // bottom: measure numbers + metronome + legend pills
  const padding = 10;

  const gridWidth = measures.length * bpm * opts.pixelsPerBeat;
  const gridHeight = pitchRange * opts.pitchRowHeight;
  const measureWidth = bpm * opts.pixelsPerBeat;

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
  lines.push(`  .note-rh { fill: ${COLORS.rhNote}; stroke: ${COLORS.rhNoteStroke}; stroke-width: 0.5; rx: 3; ry: 3; }`);
  lines.push(`  .note-lh { fill: ${COLORS.lhNote}; stroke: ${COLORS.lhNoteStroke}; stroke-width: 0.5; rx: 3; ry: 3; }`);
  lines.push(`  .note-rh:hover { opacity: 0.85; }`);
  lines.push(`  .note-lh:hover { opacity: 0.85; }`);
  lines.push(`</style>`);

  // Background
  lines.push(`<rect width="${totalWidth}" height="${totalHeight}" fill="${COLORS.bg}"/>`);

  // ── Header ──
  const composerLabel = song.composer ? ` — ${song.composer}` : "";
  const headerText = `${song.title}${composerLabel}`;
  lines.push(`<text x="${gridX}" y="${headerHeight - 26}" fill="${COLORS.headerText}" font-size="16" font-weight="600" letter-spacing="0.2">${esc(headerText)}</text>`);

  // Metadata as small dim chip-like pills instead of one "|"-joined string
  const metaSegments = [song.key, `${song.tempo} BPM`, song.timeSignature, `m.${start}–${end}`];
  const metaFontSize = 10;
  const metaPadX = 7;
  const metaGap = 6;
  const metaHeight = 15;
  const metaY = headerHeight - 19;
  let metaX = gridX;
  for (const segment of metaSegments) {
    const pillWidth = monoTextWidth(segment, metaFontSize) + metaPadX * 2;
    lines.push(`<rect x="${metaX.toFixed(1)}" y="${metaY}" width="${pillWidth.toFixed(1)}" height="${metaHeight}" rx="7" ry="7" fill="${COLORS.pillBg}" stroke="${COLORS.pillBorder}" stroke-width="0.5"/>`);
    lines.push(`<text x="${(metaX + pillWidth / 2).toFixed(1)}" y="${metaY + metaHeight - 4}" text-anchor="middle" fill="${COLORS.text}" font-size="${metaFontSize}" letter-spacing="0.2">${esc(segment)}</text>`);
    metaX += pillWidth + metaGap;
  }

  // ── Alternate-measure shading: even measures get a faint white wash so
  //    musical form (phrase/measure grouping) reads at a glance ──
  for (let i = 0; i < measures.length; i++) {
    if (measures[i].number % 2 === 0) {
      const x = gridX + i * measureWidth;
      lines.push(`<rect x="${x}" y="${gridY}" width="${measureWidth}" height="${gridHeight}" fill="#ffffff" opacity="0.02"/>`);
    }
  }

  // ── Grid background: highlight black key rows ──
  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const y = gridY + (maxMidi - midi) * opts.pitchRowHeight;
    if (isBlackKey(midi)) {
      lines.push(`<rect x="${gridX}" y="${y}" width="${gridWidth}" height="${opts.pitchRowHeight}" fill="${COLORS.blackKeyBg}" opacity="0.5"/>`);
    }
  }

  // ── Grid lines: horizontal (pitch rows) — semitones fade to a whisper,
  //    C-rows get a warm 0.8px landmark line so octaves read at a glance ──
  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const y = gridY + (maxMidi - midi) * opts.pitchRowHeight;
    const isC = midi % 12 === 0; // C notes get the warm landmark line
    const color = isC ? COLORS.gridOctave : COLORS.gridLine;
    const width = isC ? 0.8 : 0.3;
    const lineOpacity = isC ? 0.7 : 0.15;
    lines.push(`<line x1="${gridX}" y1="${y}" x2="${gridX + gridWidth}" y2="${y}" stroke="${color}" stroke-width="${width}" opacity="${lineOpacity}"/>`);
  }

  // ── Grid lines: vertical (beats + measures) ──
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
    const size = isC ? 10 : 9;
    const weight = isC ? "bold" : "normal";
    // Only label natural notes + C notes to avoid clutter
    if (!isBlackKey(midi) || isC) {
      lines.push(`<text x="${gridX - 4}" y="${y}" text-anchor="end" fill="${color}" font-size="${size}" font-weight="${weight}">${name}</text>`);
    }
  }

  // ── Dynamics (pp→ff) carry forward across measures until re-marked ──
  // Maps each rendered measure to a note fill-opacity level. A song with
  // no dynamics markings at all renders every note at full presence.
  let currentDynamicOpacity = DEFAULT_NOTE_OPACITY;
  const measureOpacity: number[] = measures.map((m) => {
    if (m.dynamics) {
      const level = DYNAMICS_OPACITY[m.dynamics.trim().toLowerCase()];
      if (level !== undefined) currentDynamicOpacity = level;
    }
    return currentDynamicOpacity;
  });

  // ── Note rectangles ──
  for (const note of allNotes) {
    const x = gridX + note.measureIndex * measureWidth + (note.startBeat / bpm) * measureWidth;
    const y = gridY + (maxMidi - note.midi) * opts.pitchRowHeight + 1;
    const w = Math.max(3, (note.durationBeats / bpm) * measureWidth - 1);
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

    const noteOpacity = measureOpacity[note.measureIndex];

    lines.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" fill-opacity="${noteOpacity}" stroke="${stroke}" stroke-width="0.5" rx="3" ry="3">`);
    lines.push(`  <title>${handLabel}: ${noteName} (m.${measures[note.measureIndex].number})</title>`);
    lines.push(`</rect>`);

    // Onset cap — a brighter sliver on the note's left edge, reads as attack
    const capWidth = Math.min(2, w);
    const capHeight = Math.max(1, h - 2);
    lines.push(`<rect x="${x}" y="${y + 1}" width="${capWidth}" height="${capHeight}" rx="1" ry="1" fill="${lighten(fill, 0.55)}"/>`);
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

  // ── Legend: rounded pill chips (color dot + label) instead of bare
  //    swatches, in their own row so they never collide with measure
  //    numbers. The downbeat dots get a labeled pill too. ──
  {
    const legendItems: { color: string; label: string }[] =
      opts.colorMode === "pitch-class"
        // Chromatic pitch-class legend: only the pitch classes present in the song
        ? [...new Set(allNotes.map(n => n.midi % 12))]
            .sort((a, b) => a - b)
            .map(pc => ({ color: PITCH_CLASS_COLORS[pc].fill, label: PITCH_CLASS_COLORS[pc].name }))
        : [
            { color: COLORS.rhNote, label: "Right Hand" },
            { color: COLORS.lhNote, label: "Left Hand" },
          ];
    if (opts.showMetronome) {
      legendItems.push({ color: COLORS.metronome, label: "Downbeat" });
    }

    const legendY = footerY + 46;
    const legendGap = 6;
    const pillWidths = legendItems.map(item => legendPillWidth(item.label));
    const legendTotalWidth = pillWidths.reduce((a, b) => a + b, 0) + legendGap * Math.max(0, legendItems.length - 1);
    let lx = Math.max(gridX, gridX + gridWidth - legendTotalWidth);
    for (let i = 0; i < legendItems.length; i++) {
      lines.push(legendPill(lx, legendY, legendItems[i].color, legendItems[i].label));
      lx += pillWidths[i] + legendGap;
    }
  }

  // ── Close SVG ──
  lines.push(`</svg>`);

  return lines.join("\n");
}
