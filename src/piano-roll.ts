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
//
// Also exports renderScoredPianoRoll (Wave S2), which reuses every shared
// layout/grid/label/footer helper below and swaps only the note-coloring +
// legend for a CUD-safe per-note verdict encoding driven by a
// PerformanceResult (see score-performance.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { parseNoteToMidi, parseDuration, midiToNoteName, splitChordToken } from "./note-parser.js";
import type { SongEntry, Measure } from "./songs/types.js";
import type { PerformanceResult, NoteVerdict } from "./score-performance.js";
import { computeMeasureStartTimes, secondsToMeasureBeat, resolveEffectiveBpm } from "./score-performance.js";

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
  /**
   * BPM the performance was scored at (i.e. the `bpm` you passed to
   * `scorePerformance`). Only consulted by `renderScoredPianoRoll`, to
   * convert `NoteVerdict.startSec` / extra-note timestamps back into beat
   * positions on the grid. Default: song.tempo — matches
   * `scorePerformance`'s own default when its `bpm` option is omitted.
   * Ignored by `renderPianoRoll`.
   */
  scoreBpm?: number;
}

/** A resolved note ready for rendering. */
interface PlottedNote {
  midi: number;
  startBeat: number;      // beat offset from start of its measure
  durationBeats: number;
  measureIndex: number;   // 0-based index into the rendered measures
  hand: "right" | "left";
}

/** Options after defaults have been applied. */
interface ResolvedPianoRollOptions {
  startMeasure: number;
  endMeasure: number;
  pixelsPerBeat: number;
  pitchRowHeight: number;
  showMetronome: boolean;
  showDynamics: boolean;
  showTeachingNotes: boolean;
  colorMode: PianoRollColorMode;
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

/**
 * CUD-safe (Okabe & Ito 2008) verdict triad for the scored overlay
 * (findings 26, 28, 33, 42): vermilion / orange / bluish-green, chosen so
 * the three states stay distinguishable for red-green colorblind viewers
 * (~8% of males, WCAG 1.4.1) — shape redundancy (solid / dashed-hollow /
 * X-hollow) carries the distinction even with color removed entirely.
 */
const VERDICT_COLORS = {
  correct: "#009E73",       // bluish-green — solid fill
  correctStroke: "#00614a",
  timing: "#E69F00",        // orange — dashed hollow
  missed: "#D55E00",        // vermilion — hollow + X glyph
  extra: "#999999",         // neutral gray — dotted ghost + "+" marker
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

/** Fixed right-margin (px) reserved past the last drawn glyph of a
 *  header-row text — mirrors buildRollLayout's own `padding` local (kept
 *  as a separate named constant rather than plumbing that one through,
 *  since only the header-row helpers below need it). */
const HEADER_TEXT_RIGHT_MARGIN = 10;

/**
 * Ellipsize `label` to fit within `maxWidthPx` at `fontSize`, estimating
 * glyph width via monoTextWidth — the same monospace-advance approximation
 * every other width calc in this renderer already uses (the whole SVG sets
 * `font-family: monospace`-family fonts on every `<text>`, see
 * svgOpenLines's `<style>` block, so one width estimator is valid
 * everywhere). Returns `label` unchanged when it already fits. Never
 * returns an empty string — even a `maxWidthPx` too small for a single
 * character plus the ellipsis glyph still returns the bare ellipsis, so a
 * pathologically narrow render degrades to "still shows something" rather
 * than a blank header.
 */
function ellipsizeToWidth(label: string, fontSize: number, maxWidthPx: number): string {
  if (monoTextWidth(label, fontSize) <= maxWidthPx) return label;
  const ellipsis = "…"; // "…"
  for (let len = label.length - 1; len > 0; len--) {
    const candidate = label.slice(0, len).trimEnd() + ellipsis;
    if (monoTextWidth(candidate, fontSize) <= maxWidthPx) return candidate;
  }
  return ellipsis;
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

// ─── Options + Layout (shared by renderPianoRoll and renderScoredPianoRoll) ─

/**
 * A song's own actual measure-number bounds — [min(m.number), max(m.number)].
 * For a normal song these equal [1, song.measures.length], but a WINDOWED
 * sub-song (see practice-loop.ts's `windowSong` / score_last_take's range
 * windowing) only contains a SLICE of measure objects (e.g. numbers 5-8)
 * whose `.length` (4) has nothing to do with those numbers. Defaulting/
 * clamping the render window against `song.measures.length` instead of the
 * song's real measure numbers made a windowed song's default render (no
 * explicit startMeasure/endMeasure) filter for numbers 1..length — which,
 * for a measures-5-to-8 window, matches nothing and silently falls back to
 * the "No measures in range" placeholder. Falls back to [1, 1] for an empty
 * song purely so this stays a total function — buildRollLayout's own
 * `measures.length === 0` check is what actually handles that case.
 */
function songMeasureNumberBounds(song: SongEntry): { min: number; max: number } {
  if (song.measures.length === 0) return { min: 1, max: 1 };
  let min = Infinity;
  let max = -Infinity;
  for (const m of song.measures) {
    if (m.number < min) min = m.number;
    if (m.number > max) max = m.number;
  }
  return { min, max };
}

/**
 * Apply PianoRollOptions defaults — identical for both rendering modes.
 * startMeasure/endMeasure default to the song's own actual measure-number
 * bounds (see songMeasureNumberBounds), not an assumed 1..length — an
 * explicit option always wins over either.
 */
function resolveOptions(song: SongEntry, options?: PianoRollOptions): ResolvedPianoRollOptions {
  const bounds = songMeasureNumberBounds(song);
  return {
    startMeasure: options?.startMeasure ?? bounds.min,
    endMeasure: options?.endMeasure ?? bounds.max,
    pixelsPerBeat: options?.pixelsPerBeat ?? 60,
    pitchRowHeight: options?.pitchRowHeight ?? 10,
    showMetronome: options?.showMetronome ?? true,
    showDynamics: options?.showDynamics ?? true,
    showTeachingNotes: options?.showTeachingNotes ?? false,
    colorMode: options?.colorMode ?? "hand",
  };
}

/** The small standalone SVG returned for "nothing to render" edge cases. */
function emptyRollSvg(message: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100">
      <rect width="400" height="100" fill="${COLORS.bg}"/>
      <text x="200" y="55" text-anchor="middle" fill="${COLORS.text}" font-family="monospace" font-size="14">${esc(message)}</text>
    </svg>`;
}

interface RollLayout {
  opts: ResolvedPianoRollOptions;
  measures: Measure[];
  start: number;
  end: number;
  allNotes: PlottedNote[];
  minMidi: number;
  maxMidi: number;
  ts: { num: number; den: number };
  beatsPerMeasureTS: number;
  headerHeight: number;
  gridWidth: number;
  gridHeight: number;
  measureWidth: number;
  totalWidth: number;
  totalHeight: number;
  gridX: number;
  gridY: number;
  measureOpacity: number[];
}

type RollLayoutResult = { ok: true; layout: RollLayout } | { ok: false; svg: string };

/**
 * Everything both renderers need before they start drawing mode-specific
 * note rectangles: resolved options, the filtered measure range, parsed
 * notes (for pitch range + base-mode plotting), pixel dimensions, and the
 * per-measure dynamics-opacity ramp.
 *
 * `extraPitches` lets a caller (renderScoredPianoRoll, for its "extra
 * note" ghosts) widen the pitch range beyond the song's own notes without
 * touching renderPianoRoll's behavior — it defaults to [] there, which is
 * a no-op identical to the pre-refactor inline computation.
 *
 * `headerHeight` lets renderScoredPianoRoll reserve room for the focus
 * strip above the title; renderPianoRoll always uses the original 50px.
 */
function buildRollLayout(
  song: SongEntry,
  options: PianoRollOptions | undefined,
  overrides: { extraPitches?: number[]; headerHeight?: number } = {},
): RollLayoutResult {
  const opts = resolveOptions(song, options);
  const extraPitches = overrides.extraPitches ?? [];

  // Clamp measure range to the song's own actual measure-number bounds —
  // NOT [1, song.measures.length], which undershoots for a windowed
  // sub-song (see songMeasureNumberBounds's doc).
  const bounds = songMeasureNumberBounds(song);
  const start = Math.max(bounds.min, opts.startMeasure);
  const end = Math.min(bounds.max, opts.endMeasure);
  const measures = song.measures.filter(m => m.number >= start && m.number <= end);

  if (measures.length === 0) {
    return { ok: false, svg: emptyRollSvg(`No measures in range ${start}-${end}`) };
  }

  // ── Parse time signature ──
  const ts = parseTimeSig(song.timeSignature);
  const beatsPerMeasureTS = beatsPerMeasure(ts.num, ts.den);

  // ── Collect all plotted notes ──
  const allNotes: PlottedNote[] = [];
  for (let i = 0; i < measures.length; i++) {
    const m = measures[i];
    allNotes.push(...parseHand(m.rightHand, "right", i));
    allNotes.push(...parseHand(m.leftHand, "left", i));
  }

  // ── Find pitch range ──
  const pitched = allNotes.filter(n => n.midi >= 0);
  if (pitched.length === 0 && extraPitches.length === 0) {
    return { ok: false, svg: emptyRollSvg(`No pitched notes in range ${start}-${end}`) };
  }

  const pitchSources = [...pitched.map(n => n.midi), ...extraPitches];
  const minMidi = Math.max(0, pitchSources.reduce((m, p) => Math.min(m, p), Infinity) - 3);
  const maxMidi = Math.min(127, pitchSources.reduce((m, p) => Math.max(m, p), -Infinity) + 3);
  const pitchRange = maxMidi - minMidi + 1;

  // ── Layout dimensions ──
  const labelWidth = 50;     // left axis pitch labels
  const headerHeight = overrides.headerHeight ?? 50;   // top: title + metadata pills
  const footerHeight = 70;   // bottom: measure numbers + metronome + legend pills
  const padding = 10;

  const gridWidth = measures.length * beatsPerMeasureTS * opts.pixelsPerBeat;
  const gridHeight = pitchRange * opts.pitchRowHeight;
  const measureWidth = beatsPerMeasureTS * opts.pixelsPerBeat;

  const totalWidth = labelWidth + gridWidth + padding * 2;
  const totalHeight = headerHeight + gridHeight + footerHeight + padding;

  const gridX = labelWidth + padding;
  const gridY = headerHeight;

  // ── Dynamics (pp→ff) carry forward across measures until re-marked ──
  let currentDynamicOpacity = DEFAULT_NOTE_OPACITY;
  const measureOpacity: number[] = measures.map((m) => {
    if (m.dynamics) {
      const level = DYNAMICS_OPACITY[m.dynamics.trim().toLowerCase()];
      if (level !== undefined) currentDynamicOpacity = level;
    }
    return currentDynamicOpacity;
  });

  return {
    ok: true,
    layout: {
      opts, measures, start, end, allNotes, minMidi, maxMidi, ts, beatsPerMeasureTS,
      headerHeight, gridWidth, gridHeight, measureWidth, totalWidth, totalHeight,
      gridX, gridY, measureOpacity,
    },
  };
}

// ─── Shared rendering pieces ────────────────────────────────────────────────

/** `<svg>` open tag + `<style>` block + background rect. */
function svgOpenLines(totalWidth: number, totalHeight: number, extraStyleLines: string[] = []): string[] {
  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">`);

  lines.push(`<style>`);
  lines.push(`  text { font-family: 'Consolas', 'SF Mono', 'Fira Code', monospace; }`);
  lines.push(`  .note-rh { fill: ${COLORS.rhNote}; stroke: ${COLORS.rhNoteStroke}; stroke-width: 0.5; rx: 3; ry: 3; }`);
  lines.push(`  .note-lh { fill: ${COLORS.lhNote}; stroke: ${COLORS.lhNoteStroke}; stroke-width: 0.5; rx: 3; ry: 3; }`);
  lines.push(`  .note-rh:hover { opacity: 0.85; }`);
  lines.push(`  .note-lh:hover { opacity: 0.85; }`);
  for (const extraLine of extraStyleLines) lines.push(extraLine);
  lines.push(`</style>`);

  lines.push(`<rect width="${totalWidth}" height="${totalHeight}" fill="${COLORS.bg}"/>`);
  return lines;
}

/** Title line + metadata pills (key / tempo / time sig / measure range). */
function renderHeaderLines(
  song: SongEntry,
  gridX: number,
  headerHeight: number,
  start: number,
  end: number,
  totalWidth: number,
): string[] {
  const lines: string[] = [];
  const composerLabel = song.composer ? ` — ${song.composer}` : "";
  const headerText = `${song.title}${composerLabel}`;
  const titleFontSize = 16;
  // Long titles overflowed the SVG's own width at narrow measure windows
  // (visual review: "…Ludwig van Beethove" running past the right edge) —
  // ellipsize to the available header width, same monospace glyph-width
  // estimate every other layout calc in this file already uses. The FULL
  // (untruncated) text always survives in a <title> child so hovering the
  // header still shows it — nothing is actually lost, only visually
  // shortened when it wouldn't fit.
  const titleMaxWidth = Math.max(0, totalWidth - gridX - HEADER_TEXT_RIGHT_MARGIN);
  const displayText = ellipsizeToWidth(headerText, titleFontSize, titleMaxWidth);
  lines.push(`<text x="${gridX}" y="${headerHeight - 26}" fill="${COLORS.headerText}" font-size="${titleFontSize}" font-weight="600" letter-spacing="0.2">${esc(displayText)}<title>${esc(headerText)}</title></text>`);

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
  return lines;
}

/** Faint white wash on even measures so phrase/measure grouping reads at a glance. */
function renderMeasureShadingLines(
  measures: Measure[], gridX: number, gridY: number, measureWidth: number, gridHeight: number,
): string[] {
  const lines: string[] = [];
  for (let i = 0; i < measures.length; i++) {
    if (measures[i].number % 2 === 0) {
      const x = gridX + i * measureWidth;
      lines.push(`<rect x="${x}" y="${gridY}" width="${measureWidth}" height="${gridHeight}" fill="#ffffff" opacity="0.02"/>`);
    }
  }
  return lines;
}

/** Black-key row shading behind the grid. */
function renderPitchGridBackgroundLines(
  minMidi: number, maxMidi: number, gridX: number, gridY: number, gridWidth: number, pitchRowHeight: number,
): string[] {
  const lines: string[] = [];
  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const y = gridY + (maxMidi - midi) * pitchRowHeight;
    if (isBlackKey(midi)) {
      lines.push(`<rect x="${gridX}" y="${y}" width="${gridWidth}" height="${pitchRowHeight}" fill="${COLORS.blackKeyBg}" opacity="0.5"/>`);
    }
  }
  return lines;
}

/** Horizontal pitch-row lines (C-rows get a warm landmark line) + vertical beat/measure lines. */
function renderGridLineLines(
  minMidi: number, maxMidi: number, measures: Measure[], ts: { num: number; den: number },
  gridX: number, gridY: number, gridWidth: number, gridHeight: number, measureWidth: number, pitchRowHeight: number,
): string[] {
  const lines: string[] = [];

  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const y = gridY + (maxMidi - midi) * pitchRowHeight;
    const isC = midi % 12 === 0; // C notes get the warm landmark line
    const color = isC ? COLORS.gridOctave : COLORS.gridLine;
    const width = isC ? 0.8 : 0.3;
    const lineOpacity = isC ? 0.7 : 0.15;
    lines.push(`<line x1="${gridX}" y1="${y}" x2="${gridX + gridWidth}" y2="${y}" stroke="${color}" stroke-width="${width}" opacity="${lineOpacity}"/>`);
  }

  for (let i = 0; i <= measures.length; i++) {
    const x = gridX + i * measureWidth;
    // Measure boundary (thick)
    lines.push(`<line x1="${x}" y1="${gridY}" x2="${x}" y2="${gridY + gridHeight}" stroke="${COLORS.gridMeasure}" stroke-width="1.5"/>`);

    // Beat lines within each measure (thin)
    if (i < measures.length) {
      const subdivisionsPerMeasure = ts.num;
      for (let b = 1; b < subdivisionsPerMeasure; b++) {
        const beatX = x + (b / subdivisionsPerMeasure) * measureWidth;
        lines.push(`<line x1="${beatX}" y1="${gridY}" x2="${beatX}" y2="${gridY + gridHeight}" stroke="${COLORS.gridLine}" stroke-width="0.3" stroke-dasharray="2,3"/>`);
      }
    }
  }

  return lines;
}

/** Left-axis pitch labels (naturals + C landmarks only, to avoid clutter). */
function renderPitchLabelLines(
  minMidi: number, maxMidi: number, gridX: number, gridY: number, pitchRowHeight: number,
): string[] {
  const lines: string[] = [];
  for (let midi = minMidi; midi <= maxMidi; midi++) {
    const y = gridY + (maxMidi - midi) * pitchRowHeight + pitchRowHeight * 0.7;
    const name = midiToNoteName(midi);
    const isC = midi % 12 === 0;
    const color = isC ? COLORS.pitchLabelC : COLORS.pitchLabel;
    const size = isC ? 10 : 9;
    const weight = isC ? "bold" : "normal";
    if (!isBlackKey(midi) || isC) {
      lines.push(`<text x="${gridX - 4}" y="${y}" text-anchor="end" fill="${color}" font-size="${size}" font-weight="${weight}">${name}</text>`);
    }
  }
  return lines;
}

/** Measure numbers + metronome downbeat dots + dynamics markings (footer band). */
function renderMeasureFooterLines(
  measures: Measure[], gridX: number, gridY: number, gridHeight: number, measureWidth: number,
  opts: { showMetronome: boolean; showDynamics: boolean },
): string[] {
  const lines: string[] = [];
  const footerY = gridY + gridHeight;

  for (let i = 0; i < measures.length; i++) {
    const x = gridX + i * measureWidth + measureWidth / 2;
    lines.push(`<text x="${x}" y="${footerY + 16}" text-anchor="middle" fill="${COLORS.text}" font-size="10">${measures[i].number}</text>`);
  }

  if (opts.showMetronome) {
    for (let i = 0; i < measures.length; i++) {
      const x = gridX + i * measureWidth + 4;
      lines.push(`<circle cx="${x}" cy="${footerY + 28}" r="3" fill="${COLORS.metronome}"/>`);
    }
  }

  if (opts.showDynamics) {
    for (let i = 0; i < measures.length; i++) {
      const m = measures[i];
      if (m.dynamics) {
        const x = gridX + i * measureWidth + measureWidth / 2;
        lines.push(`<text x="${x}" y="${footerY + 38}" text-anchor="middle" fill="${COLORS.dynamics}" font-size="11" font-style="italic">${esc(m.dynamics)}</text>`);
      }
    }
  }

  return lines;
}

// ─── Base ("hand" / "pitch-class") note rendering ──────────────────────────

/** The base-mode note rectangles (+ onset caps), colored by hand or pitch class. */
function renderBaseNoteRectLines(
  allNotes: PlottedNote[], measures: Measure[], measureOpacity: number[],
  gridX: number, gridY: number, measureWidth: number, beatsPerMeasureTS: number,
  maxMidi: number, opts: ResolvedPianoRollOptions,
): string[] {
  const lines: string[] = [];
  for (const note of allNotes) {
    const x = gridX + note.measureIndex * measureWidth + (note.startBeat / beatsPerMeasureTS) * measureWidth;
    const y = gridY + (maxMidi - note.midi) * opts.pitchRowHeight + 1;
    const w = Math.max(3, (note.durationBeats / beatsPerMeasureTS) * measureWidth - 1);
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
  return lines;
}

/** Base-mode legend: hand or pitch-class swatches + optional downbeat pill. */
function renderBaseLegendLines(
  allNotes: PlottedNote[], gridX: number, gridY: number, gridHeight: number, gridWidth: number,
  opts: ResolvedPianoRollOptions,
): string[] {
  const lines: string[] = [];
  const footerY = gridY + gridHeight;

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
  return lines;
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
  const layoutResult = buildRollLayout(song, options);
  if (!layoutResult.ok) return layoutResult.svg;
  const layout = layoutResult.layout;
  const {
    opts, measures, start, end, allNotes, minMidi, maxMidi, ts, beatsPerMeasureTS,
    headerHeight, gridWidth, gridHeight, measureWidth, totalWidth, totalHeight,
    gridX, gridY, measureOpacity,
  } = layout;

  const lines: string[] = [];
  lines.push(...svgOpenLines(totalWidth, totalHeight));
  lines.push(...renderHeaderLines(song, gridX, headerHeight, start, end, totalWidth));
  lines.push(...renderMeasureShadingLines(measures, gridX, gridY, measureWidth, gridHeight));
  lines.push(...renderPitchGridBackgroundLines(minMidi, maxMidi, gridX, gridY, gridWidth, opts.pitchRowHeight));
  lines.push(...renderGridLineLines(minMidi, maxMidi, measures, ts, gridX, gridY, gridWidth, gridHeight, measureWidth, opts.pitchRowHeight));
  lines.push(...renderPitchLabelLines(minMidi, maxMidi, gridX, gridY, opts.pitchRowHeight));
  lines.push(...renderBaseNoteRectLines(allNotes, measures, measureOpacity, gridX, gridY, measureWidth, beatsPerMeasureTS, maxMidi, opts));
  lines.push(...renderMeasureFooterLines(measures, gridX, gridY, gridHeight, measureWidth, opts));
  lines.push(...renderBaseLegendLines(allNotes, gridX, gridY, gridHeight, gridWidth, opts));

  // ── Close SVG ──
  lines.push(`</svg>`);

  return lines.join("\n");
}

// ─── Scored piano-roll (Wave S2) ────────────────────────────────────────────
//
// Renders a post-take diagnostic overlay: every expected note is drawn at
// its EXPECTED score position (not shifted to where it was actually played)
// with a CUD-safe verdict encoding; extra (unscored) played notes are drawn
// as ghosts at their own actual time/pitch. This matches finding 36
// ("the piano-roll overlay is a post-take diagnostic, not real-time note
// guidance") — the grid stays a clean score reference throughout.

const SCORED_HEADER_HEIGHT = 68; // 50 (base) + room for the focus strip

const VERDICT_STYLE_LINES = [
  `  .verdict-correct:hover { opacity: 0.85; }`,
  `  .verdict-timing:hover { fill-opacity: 0.55; }`,
  `  .verdict-missed:hover { stroke-width: 2.5; }`,
  `  .verdict-extra:hover { opacity: 0.7; }`,
];

/**
 * Duration (in quarter-note-beat units) for the tone matching `midi` inside
 * a (possibly chord) `notation` token, e.g. "C4:q" or "C4+E4:h". Falls back
 * to a quarter note (1 beat) if the tone or its suffix can't be resolved —
 * same fallback piano-roll.ts's own parseHand uses for unparseable tokens.
 */
function verdictDurationBeats(notation: string, midi: number): number {
  for (const { noteStr, durSuffix } of splitChordToken(notation)) {
    let toneMidi: number;
    try {
      toneMidi = parseNoteToMidi(noteStr);
    } catch {
      continue;
    }
    if (toneMidi === midi) {
      try {
        return parseDuration(durSuffix);
      } catch {
        return 1;
      }
    }
  }
  return 1;
}

/** "32ms late" / "18ms early" — offsetMs > 0 means played after the expected time. */
function formatOffsetLabel(offsetMs: number): string {
  const rounded = Math.round(Math.abs(offsetMs));
  const direction = offsetMs >= 0 ? "late" : "early";
  return `${rounded}ms ${direction}`;
}

/**
 * One verdict note rect, CUD-safe + shape-redundant (WCAG 1.4.1):
 *   - correct: SOLID bluish-green fill
 *   - timing:  DASHED orange outline, hollow (fill-opacity 0.35)
 *   - missed:  HOLLOW vermilion outline (2px) + an X glyph across the rect
 */
function renderVerdictRectLines(
  status: NoteVerdict["status"],
  x: number, y: number, w: number, h: number,
  opacity: number, noteName: string, measureNum: number, offsetMs: number | undefined,
): string[] {
  const xs = x.toFixed(2);
  const ys = y.toFixed(2);
  const ws = w.toFixed(2);
  const hs = h.toFixed(2);

  if (status === "correct") {
    const title = `Correct: ${noteName} (m.${measureNum})`;
    return [
      `<rect class="verdict-correct" x="${xs}" y="${ys}" width="${ws}" height="${hs}" fill="${VERDICT_COLORS.correct}" fill-opacity="${opacity}" stroke="${VERDICT_COLORS.correctStroke}" stroke-width="0.5" rx="3" ry="3">`,
      `  <title>${esc(title)}</title>`,
      `</rect>`,
    ];
  }

  if (status === "timing") {
    const offsetLabel = offsetMs !== undefined ? formatOffsetLabel(offsetMs) : "off tempo";
    const title = `Timing: ${noteName} (m.${measureNum}) — ${offsetLabel}`;
    return [
      `<rect class="verdict-timing" x="${xs}" y="${ys}" width="${ws}" height="${hs}" fill="${VERDICT_COLORS.timing}" fill-opacity="0.35" stroke="${VERDICT_COLORS.timing}" stroke-width="2" stroke-dasharray="4,2" rx="3" ry="3">`,
      `  <title>${esc(title)}</title>`,
      `</rect>`,
    ];
  }

  // missed
  const title = `Missed: ${noteName} (m.${measureNum})`;
  const x2 = (x + w).toFixed(2);
  const y2 = (y + h).toFixed(2);
  return [
    `<rect class="verdict-missed" x="${xs}" y="${ys}" width="${ws}" height="${hs}" fill="none" stroke="${VERDICT_COLORS.missed}" stroke-width="2" rx="2" ry="2">`,
    `  <title>${esc(title)}</title>`,
    `</rect>`,
    `<line class="verdict-missed-x" x1="${xs}" y1="${ys}" x2="${x2}" y2="${y2}" stroke="${VERDICT_COLORS.missed}" stroke-width="1.5"/>`,
    `<line class="verdict-missed-x" x1="${x2}" y1="${ys}" x2="${xs}" y2="${y2}" stroke="${VERDICT_COLORS.missed}" stroke-width="1.5"/>`,
  ];
}

/** A gray dotted ghost rect + "+" marker for a played note that wasn't in the score. */
function renderExtraGhostLines(x: number, y: number, w: number, h: number, noteName: string, timeSeconds: number): string[] {
  const xs = x.toFixed(2);
  const ys = y.toFixed(2);
  const ws = w.toFixed(2);
  const hs = h.toFixed(2);
  const cx = (x + w / 2).toFixed(1);
  const cy = (y + h / 2 + 2.5).toFixed(1);
  const title = `Extra: ${noteName} at ${timeSeconds.toFixed(2)}s (not in score)`;
  return [
    `<rect class="verdict-extra" x="${xs}" y="${ys}" width="${ws}" height="${hs}" fill="none" stroke="${VERDICT_COLORS.extra}" stroke-width="1" stroke-dasharray="1,2" rx="2" ry="2">`,
    `  <title>${esc(title)}</title>`,
    `</rect>`,
    `<text class="verdict-extra-plus" x="${cx}" y="${cy}" text-anchor="middle" fill="${VERDICT_COLORS.extra}" font-size="8">+</text>`,
  ];
}

/**
 * All verdict note rects (correct/timing/missed, positioned at their
 * EXPECTED score position) + extra ghost rects (positioned at their own
 * ACTUAL played time/pitch, per the task spec). Notes/extras whose measure
 * falls outside the rendered window are skipped, matching how the base
 * renderer only plots notes within `measures`.
 */
function renderVerdictNoteLines(
  song: SongEntry,
  result: PerformanceResult,
  effectiveScoreBpm: number,
  measures: Measure[],
  gridX: number, gridY: number, measureWidth: number, beatsPerMeasureTS: number,
  maxMidi: number, measureOpacity: number[], opts: ResolvedPianoRollOptions,
): string[] {
  const lines: string[] = [];

  const measureIndexByNumber = new Map<number, number>();
  measures.forEach((m, i) => measureIndexByNumber.set(m.number, i));

  const measureStartTimes = computeMeasureStartTimes(song, effectiveScoreBpm);
  const verdicts = result.details.noteVerdicts ?? [];

  for (const v of verdicts) {
    const mi = measureIndexByNumber.get(v.measure);
    if (mi === undefined) continue; // outside the rendered window

    const measureStart = measureStartTimes.get(v.measure) ?? 0;
    const beatOffset = (v.startSec - measureStart) * (effectiveScoreBpm / 60);
    const durationBeats = verdictDurationBeats(v.notation, v.midi);

    const x = gridX + mi * measureWidth + (beatOffset / beatsPerMeasureTS) * measureWidth;
    const y = gridY + (maxMidi - v.midi) * opts.pitchRowHeight + 1;
    const w = Math.max(3, (durationBeats / beatsPerMeasureTS) * measureWidth - 1);
    const h = opts.pitchRowHeight - 2;
    const noteOpacity = measureOpacity[mi] ?? DEFAULT_NOTE_OPACITY;
    const noteName = midiToNoteName(v.midi);

    lines.push(...renderVerdictRectLines(v.status, x, y, w, h, noteOpacity, noteName, v.measure, v.offsetMs));
  }

  // Extras: no expected duration exists for them, so use a small fixed
  // (eighth-note-ish) ghost width rather than inventing one.
  const extraWidth = Math.max(6, opts.pixelsPerBeat * 0.25);
  for (const extra of result.details.extras) {
    const { measure, beatOffset } = secondsToMeasureBeat(measureStartTimes, extra.timeSeconds, effectiveScoreBpm);
    const mi = measureIndexByNumber.get(measure);
    if (mi === undefined) continue;

    const x = gridX + mi * measureWidth + (beatOffset / beatsPerMeasureTS) * measureWidth;
    const y = gridY + (maxMidi - extra.note) * opts.pitchRowHeight + 1;
    const h = opts.pitchRowHeight - 2;
    const noteName = midiToNoteName(extra.note);

    lines.push(...renderExtraGhostLines(x, y, extraWidth, h, noteName, extra.timeSeconds));
  }

  return lines;
}

/**
 * Rank measures by (missed count desc, timing count desc, measure asc),
 * skipping "correct" verdicts entirely — a measure with zero missed/timing
 * verdicts never appears (finding 26: rank/limit surfaced errors, don't
 * paint every deviation).
 */
function rankWorstMeasures(verdicts: NoteVerdict[], limit: number): number[] {
  const counts = new Map<number, { missed: number; timing: number }>();
  for (const v of verdicts) {
    if (v.status === "correct") continue;
    const c = counts.get(v.measure) ?? { missed: 0, timing: 0 };
    if (v.status === "missed") c.missed++; else c.timing++;
    counts.set(v.measure, c);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].missed - a[1].missed || b[1].timing - a[1].timing || a[0] - b[0])
    .slice(0, limit)
    .map(([measure]) => measure);
}

/**
 * Compact "Focus: mm. X, Y, Z" summary strip, top of the SVG under the
 * header — the up-to-3 worst measures by (missed, then timing) count.
 * Renders nothing when there's nothing to focus on (a clean take), rather
 * than inventing praise copy (finding 28: task-focused language only).
 */
// Visual review judged the bare-text focus strip too subtle to register as
// "the one thing to work on next" — it now renders inside a filled,
// bordered pill (the same neutral panel color + border every other pill in
// this file already uses — CUD-safe, since it's a fixed background rather
// than a status color) at a slightly larger size than the pre-pill 10px.
// Wording stays exactly as task-focused as before (finding 28) — only the
// visual weight changed.
const FOCUS_STRIP_FONT_SIZE = 11;
const FOCUS_STRIP_PAD_X = 8;
const FOCUS_STRIP_PILL_HEIGHT = 18;
const FOCUS_STRIP_PILL_Y = 3;

function renderFocusStripLines(result: PerformanceResult, gridX: number, totalWidth: number): string[] {
  const verdicts = result.details.noteVerdicts ?? [];
  const worst = rankWorstMeasures(verdicts, 3);
  if (worst.length === 0) return [];

  const fullLabel = worst.length === 1 ? `Focus: m. ${worst[0]}` : `Focus: mm. ${worst.join(", ")}`;
  // Truncate (never wrap — SVG has no reflow) at narrow measure windows,
  // same ellipsis approach as the title fix above, so the pill can never
  // push past the SVG's own right edge.
  const availableTextWidth = Math.max(0, totalWidth - gridX - HEADER_TEXT_RIGHT_MARGIN - FOCUS_STRIP_PAD_X * 2);
  const label = ellipsizeToWidth(fullLabel, FOCUS_STRIP_FONT_SIZE, availableTextWidth);
  const pillWidth = FOCUS_STRIP_PAD_X * 2 + monoTextWidth(label, FOCUS_STRIP_FONT_SIZE);
  const textY = FOCUS_STRIP_PILL_Y + FOCUS_STRIP_PILL_HEIGHT / 2 + 3.5;

  return [
    `<rect class="verdict-focus-pill" x="${gridX}" y="${FOCUS_STRIP_PILL_Y}" width="${pillWidth.toFixed(1)}" height="${FOCUS_STRIP_PILL_HEIGHT}" rx="9" ry="9" fill="${COLORS.pillBg}" stroke="${COLORS.pillBorder}" stroke-width="0.75"/>`,
    `<text class="verdict-focus" x="${(gridX + FOCUS_STRIP_PAD_X).toFixed(1)}" y="${textY.toFixed(1)}" fill="${COLORS.textBright}" font-size="${FOCUS_STRIP_FONT_SIZE}" font-weight="600" letter-spacing="0.2">${esc(label)}<title>${esc(fullLabel)}</title></text>`,
  ];
}

/**
 * Notice line for the INPUT_LIMIT-guard degraded case: when
 * scorePerformance() bails out of note-by-note scoring (take too large),
 * `noteVerdicts` is `[]` even though real notes exist
 * (`details.totalExpected > 0`). Rendering nothing here would look like a
 * suspiciously perfect take — renderFocusStripLines() already renders
 * nothing when there's nothing to flag — so this notice replaces it,
 * occupying the same position/style, to explain why every note below is
 * plotted uncolored instead of verdict-colored.
 */
function renderDegradedNoticeLines(result: PerformanceResult, gridX: number): string[] {
  const { totalExpected, totalPlayed } = result.details;
  const label = `Take too large to score note-by-note (${totalExpected} expected / ${totalPlayed} played events) — showing the score unscored`;
  return [
    `<text class="verdict-degraded-notice" x="${gridX}" y="14" fill="${COLORS.text}" font-size="10" letter-spacing="0.2">${esc(label)}</text>`,
  ];
}

type ScoredLegendStatus = "correct" | "timing" | "missed" | "extra";

const SCORED_LEGEND_ITEMS: { status: ScoredLegendStatus; label: string }[] = [
  { status: "correct", label: "Correct" },
  { status: "timing", label: "Timing" },
  { status: "missed", label: "Missed" },
  { status: "extra", label: "Extra" },
];

/** Width (px) of a `verdictLegendSwatch` for `label` — mirrors legendPillWidth. */
function verdictSwatchWidth(label: string): number {
  const fontSize = 9;
  const swatchW = 16;
  const padLeft = 8;
  const padRight = 8;
  const gapSwatchText = 5;
  return padLeft + swatchW + gapSwatchText + monoTextWidth(label, fontSize) + padRight;
}

/**
 * A legend chip whose swatch reproduces the actual per-state shape cue
 * (solid / dashed-hollow / X-hollow / dotted-ghost) rather than a plain
 * color dot, so the shape redundancy required by WCAG 1.4.1 is visible in
 * the legend itself, not just in the note rects.
 */
function verdictLegendSwatch(x: number, y: number, status: ScoredLegendStatus, label: string): string {
  const fontSize = 9;
  const swatchW = 16;
  const swatchH = 10;
  const padLeft = 8;
  const gapSwatchText = 5;
  const pillHeight = 16;
  const width = verdictSwatchWidth(label);

  const swatchX = x + padLeft;
  const swatchY = y + (pillHeight - swatchH) / 2;
  const sx = swatchX.toFixed(1);
  const sy = swatchY.toFixed(1);

  const parts: string[] = [];
  parts.push(`<rect x="${x.toFixed(1)}" y="${y}" width="${width.toFixed(1)}" height="${pillHeight}" rx="8" ry="8" fill="${COLORS.pillBg}" stroke="${COLORS.pillBorder}" stroke-width="0.5"/>`);

  if (status === "correct") {
    parts.push(`<rect x="${sx}" y="${sy}" width="${swatchW}" height="${swatchH}" rx="2" ry="2" fill="${VERDICT_COLORS.correct}"/>`);
  } else if (status === "timing") {
    parts.push(`<rect x="${sx}" y="${sy}" width="${swatchW}" height="${swatchH}" rx="2" ry="2" fill="${VERDICT_COLORS.timing}" fill-opacity="0.35" stroke="${VERDICT_COLORS.timing}" stroke-width="1.2" stroke-dasharray="3,1.5"/>`);
  } else if (status === "missed") {
    const x2 = (swatchX + swatchW).toFixed(1);
    const y2 = (swatchY + swatchH).toFixed(1);
    parts.push(`<rect x="${sx}" y="${sy}" width="${swatchW}" height="${swatchH}" rx="1" ry="1" fill="none" stroke="${VERDICT_COLORS.missed}" stroke-width="1.2"/>`);
    parts.push(`<line x1="${sx}" y1="${sy}" x2="${x2}" y2="${y2}" stroke="${VERDICT_COLORS.missed}" stroke-width="1"/>`);
    parts.push(`<line x1="${x2}" y1="${sy}" x2="${sx}" y2="${y2}" stroke="${VERDICT_COLORS.missed}" stroke-width="1"/>`);
  } else {
    // extra
    parts.push(`<rect x="${sx}" y="${sy}" width="${swatchW}" height="${swatchH}" rx="1" ry="1" fill="none" stroke="${VERDICT_COLORS.extra}" stroke-width="1" stroke-dasharray="1,1.5"/>`);
    parts.push(`<text x="${(swatchX + swatchW / 2).toFixed(1)}" y="${(swatchY + swatchH / 2 + 2.5).toFixed(1)}" text-anchor="middle" fill="${VERDICT_COLORS.extra}" font-size="7">+</text>`);
  }

  parts.push(`<text x="${(swatchX + swatchW + gapSwatchText).toFixed(1)}" y="${y + pillHeight / 2 + 3}" fill="${COLORS.text}" font-size="${fontSize}">${esc(label)}</text>`);

  return parts.join("\n");
}

/** Scored-mode legend: all four verdict states (shape cue visible) + optional downbeat pill. */
function renderScoredLegendLines(
  gridX: number, gridY: number, gridHeight: number, gridWidth: number, opts: ResolvedPianoRollOptions,
): string[] {
  const lines: string[] = [];
  const footerY = gridY + gridHeight;

  type Item =
    | { kind: "swatch"; status: ScoredLegendStatus; label: string }
    | { kind: "pill"; color: string; label: string };

  const items: Item[] = SCORED_LEGEND_ITEMS.map(i => ({ kind: "swatch" as const, status: i.status, label: i.label }));
  if (opts.showMetronome) {
    items.push({ kind: "pill", color: COLORS.metronome, label: "Downbeat" });
  }

  const legendY = footerY + 46;
  const legendGap = 6;
  const widths = items.map(item => item.kind === "swatch" ? verdictSwatchWidth(item.label) : legendPillWidth(item.label));
  const totalWidth = widths.reduce((a, b) => a + b, 0) + legendGap * Math.max(0, items.length - 1);
  let lx = Math.max(gridX, gridX + gridWidth - totalWidth);
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    lines.push(item.kind === "swatch"
      ? verdictLegendSwatch(lx, legendY, item.status, item.label)
      : legendPill(lx, legendY, item.color, item.label));
    lx += widths[i] + legendGap;
  }

  return lines;
}

/**
 * Render a scored piano roll: the same grid/header/footer as
 * `renderPianoRoll`, with note coloring replaced by a per-note verdict
 * encoding (see `NoteVerdict`) plus a worst-measures focus strip.
 *
 * Every expected note (correct/timing/missed) draws at its EXPECTED score
 * position; extra (unscored) played notes draw as ghosts at their own
 * actual time/pitch. Positions are aligned to whatever bpm `scorePerformance`
 * actually scored `result` at (`result.details.scoredAtBpm`) automatically —
 * pass `options.scoreBpm` only to deliberately OVERRIDE that pairing (e.g.
 * previewing at a different tempo); it is not required for correctness.
 *
 * If `result.details.noteVerdicts` is empty despite real expected notes
 * existing (`scorePerformance`'s INPUT_LIMIT guard — the take was too large
 * to score note-by-note), this renders a degraded fallback instead: the
 * plain, not-verdict-colored notes (same as `renderPianoRoll`'s own note
 * rendering) plus an explicit notice, rather than a silently empty grid.
 */
export function renderScoredPianoRoll(
  song: SongEntry,
  result: PerformanceResult,
  options?: PianoRollOptions,
): string {
  // Resolve once, up front ("mispairing becomes impossible by default"):
  // an explicit options.scoreBpm always wins; otherwise fall back to
  // result.details.scoredAtBpm — the EXACT bpm scorePerformance() actually
  // used for this result — rather than independently re-deriving
  // song.tempo, which could silently disagree with whatever `bpm`
  // scorePerformance() was called with. song.tempo only matters as
  // resolveEffectiveBpm's own last-resort (e.g. a hand-built
  // PerformanceResult that left scoredAtBpm unset).
  const effectiveScoreBpm = resolveEffectiveBpm(song, options?.scoreBpm ?? result.details.scoredAtBpm);
  const measureStartTimes = computeMeasureStartTimes(song, effectiveScoreBpm);

  // Filter extras to the rendered measure window BEFORE they can widen the
  // pitch axis: an extra outside the window is already skipped when
  // actually drawing (renderVerdictNoteLines's own window check below) —
  // until this fix, its pitch still stretched minMidi/maxMidi regardless,
  // widening the grid for a note nobody can see on it. This duplicates
  // buildRollLayout's own start/end clamp (rather than changing its
  // signature) since extraPitches has to be ready BEFORE calling it — same
  // songMeasureNumberBounds fix as that clamp (not [1, song.measures.length],
  // which undershoots for a windowed sub-song).
  const resolvedForWindow = resolveOptions(song, options);
  const windowBounds = songMeasureNumberBounds(song);
  const windowStart = Math.max(windowBounds.min, resolvedForWindow.startMeasure);
  const windowEnd = Math.min(windowBounds.max, resolvedForWindow.endMeasure);
  const inWindowExtras = result.details.extras.filter((e) => {
    const { measure } = secondsToMeasureBeat(measureStartTimes, e.timeSeconds, effectiveScoreBpm);
    return measure >= windowStart && measure <= windowEnd;
  });

  const layoutResult = buildRollLayout(song, options, {
    extraPitches: inWindowExtras.map((e) => e.note),
    headerHeight: SCORED_HEADER_HEIGHT,
  });
  if (!layoutResult.ok) return layoutResult.svg;
  const layout = layoutResult.layout;
  const {
    opts, measures, start, end, allNotes, minMidi, maxMidi, ts, beatsPerMeasureTS,
    headerHeight, gridWidth, gridHeight, measureWidth, totalWidth, totalHeight,
    gridX, gridY, measureOpacity,
  } = layout;

  // Degraded fallback: scorePerformance()'s INPUT_LIMIT guard returns
  // noteVerdicts: [] even when real expected notes exist
  // (details.totalExpected > 0) — rendering the normal verdict pass in
  // that state would silently draw an empty grid, indistinguishable from
  // "nothing to see here." Detect it and fall back to the plain (not
  // verdict-colored) base notes + an explicit notice instead.
  const isDegraded = (result.details.noteVerdicts ?? []).length === 0 && result.details.totalExpected > 0;

  const lines: string[] = [];
  lines.push(...svgOpenLines(totalWidth, totalHeight, VERDICT_STYLE_LINES));
  lines.push(...renderHeaderLines(song, gridX, headerHeight, start, end, totalWidth));
  lines.push(...(isDegraded ? renderDegradedNoticeLines(result, gridX) : renderFocusStripLines(result, gridX, totalWidth)));
  lines.push(...renderMeasureShadingLines(measures, gridX, gridY, measureWidth, gridHeight));
  lines.push(...renderPitchGridBackgroundLines(minMidi, maxMidi, gridX, gridY, gridWidth, opts.pitchRowHeight));
  lines.push(...renderGridLineLines(minMidi, maxMidi, measures, ts, gridX, gridY, gridWidth, gridHeight, measureWidth, opts.pitchRowHeight));
  lines.push(...renderPitchLabelLines(minMidi, maxMidi, gridX, gridY, opts.pitchRowHeight));
  lines.push(...(isDegraded
    ? renderBaseNoteRectLines(allNotes, measures, measureOpacity, gridX, gridY, measureWidth, beatsPerMeasureTS, maxMidi, opts)
    : renderVerdictNoteLines(song, result, effectiveScoreBpm, measures, gridX, gridY, measureWidth, beatsPerMeasureTS, maxMidi, measureOpacity, opts)));
  lines.push(...renderMeasureFooterLines(measures, gridX, gridY, gridHeight, measureWidth, opts));
  lines.push(...(isDegraded
    ? renderBaseLegendLines(allNotes, gridX, gridY, gridHeight, gridWidth, opts)
    : renderScoredLegendLines(gridX, gridY, gridHeight, gridWidth, opts)));

  lines.push(`</svg>`);

  return lines.join("\n");
}
