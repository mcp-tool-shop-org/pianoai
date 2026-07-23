// ─── Jam Session ────────────────────────────────────────────────────────────
//
// Extracts a structured "jam brief" from a source song so an LLM can create
// its own interpretation. The brief includes chord analysis, melody outline,
// structure, and genre-specific style guidance.
//
// This is a read-only analysis tool — the LLM uses the brief as source
// material, then creates its own SongEntry via add_song and plays it.
// ─────────────────────────────────────────────────────────────────────────────

import type { SongEntry, Measure, Genre, Difficulty } from "./types.js";
import { splitChordToken } from "../note-parser.js";
import { analyzeHarmony } from "../analysis/index.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface JamBriefOptions {
  /** Target genre for reinterpretation. */
  style?: Genre;
  /** Target mood (e.g., "upbeat", "melancholic", "dreamy"). */
  mood?: string;
  /** Target difficulty level. */
  difficulty?: Difficulty;
  /** Measure range to focus on, e.g., "1-8". */
  measures?: string;
}

export interface ChordMeasure {
  measure: number;
  leftHand: string;
  impliedChord: string;
}

/**
 * The real harmonic analysis of the section (src/analysis) — richer, both-hands,
 * salience-weighted source analysis than the per-measure `impliedChord` above,
 * added to the brief so the maker reasons about the actual progression + harmonic
 * rhythm. ADDITIVE and decoupled: it does NOT change `impliedChord` (which stays
 * `inferChord(leftHand)`), so nothing that consumes `inferChord` directly — the
 * frozen E-R `sourceChords` baseline, the Gate-2 snapshot — is touched.
 */
export interface JamBriefHarmony {
  /** Per-measure dominant chord from the analyzer, with confidence in [0,1]. */
  perMeasure: Array<{ measure: number; chord: string; confidence: number }>;
  /** The progression as spans (harmonic rhythm): chord + where it starts. */
  progression: Array<{ chord: string; startMeasure: number; startBeatInMeasure: number; confidence: number }>;
}

export interface MelodyMeasure {
  measure: number;
  rightHand: string;
  contour: "ascending" | "descending" | "static" | "arc";
}

export interface JamBrief {
  source: {
    id: string;
    title: string;
    composer?: string;
    genre: Genre;
    key: string;
    tempo: number;
    timeSignature: string;
    structure: string;
  };
  chordProgression: ChordMeasure[];
  /** The real harmonic analysis of the section (additive; see JamBriefHarmony). */
  harmonicAnalysis: JamBriefHarmony;
  melodyOutline: MelodyMeasure[];
  styleGuidance: string[];
  instructions: string[];
}

// ─── Pitch Utilities ────────────────────────────────────────────────────────

const NOTE_NAMES: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/** Parse a note token (e.g., "C4:q", "F#5", "Bb3:h") into a MIDI number. Returns -1 for rests. */
function tokenToMidi(token: string): number {
  const clean = token.split(":")[0].trim();
  if (clean === "R" || clean === "r") return -1;
  const match = clean.match(/^([A-Ga-g])(#|b)?(\d)$/);
  if (!match) return -1;
  const [, letter, accidental, octStr] = match;
  let midi = (parseInt(octStr, 10) + 1) * 12 + NOTE_NAMES[letter.toUpperCase()];
  if (accidental === "#") midi += 1;
  if (accidental === "b") midi -= 1;
  return midi;
}

/** Top (highest) MIDI note of a token — a "+"-joined chord follows its top tone. Returns -1 for rests. */
function tokenToTopMidi(token: string): number {
  let top = -1;
  for (const { noteStr } of splitChordToken(token)) {
    const m = tokenToMidi(noteStr);
    if (m > top) top = m;
  }
  return top;
}

/** Extract just the note name (e.g., "C", "F#", "Bb") from a token. */
function tokenToNoteName(token: string): string | null {
  const clean = token.split(":")[0].trim();
  if (clean === "R" || clean === "r") return null;
  const match = clean.match(/^([A-Ga-g])(#|b)?(\d)$/);
  if (!match) return null;
  const [, letter, accidental] = match;
  return letter.toUpperCase() + (accidental ?? "");
}

/** Convert a note name to pitch class (0-11). */
function nameToPitchClass(name: string): number {
  const letter = name.charAt(0);
  let pc = NOTE_NAMES[letter] ?? 0;
  if (name.length > 1) {
    if (name.charAt(1) === "#") pc = (pc + 1) % 12;
    if (name.charAt(1) === "b") pc = (pc + 11) % 12;
  }
  return pc;
}

// ─── Chord Inference ────────────────────────────────────────────────────────

const PC_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

interface ChordTemplate {
  name: string;
  intervals: number[]; // intervals from root in semitones
}

// inferChord is a pitch-class engine, but it is now BASS-AWARE: it computes the
// lowest sounding note and, all else equal, names the chord by that bass root.
// That lifts the ambiguity that used to bound the vocabulary — a chord whose
// pitch-class set is a superset of another's is disambiguated by which root sits
// in the bass, so voiceChord (which always voices root-position, bass = root)
// round-trips the richer qualities below (proven in voicer.test.ts, whole vocab
// × 12 roots).
//
//   ADDED 2026-07-22 (vocab expansion): add9 / madd9 — an added 9th over a triad
//   (NO 7th). Their 4-note sets contain no other full chord at a different root.
//
//   ADDED 2026-07-22 (bass-aware): 6 / m6 / 9 / maj9 / m9 / dim7 — the qualities
//   the ABC maker emits that the old rootless engine had to DROP. Each collides
//   with another chord's pitch-class set (6 ≡ the relative m7: C6 = A-C-E-G =
//   Am7; m6 ≡ the relative m7b5; the 9-with-7th's rootless upper structure IS a
//   7th on the 3rd, G9 ⊃ Bm7b5; dim7 is rotationally symmetric), so a rootless
//   engine detected the WRONG one. The bass tie-break resolves the collision:
//   voiceChord puts the intended root in the bass, so inferChord confirms it.
//   The 9-with-7th chords also win by being STRICTLY LONGER than the 4-note
//   subset they contain, so length settles them even before the bass does.
//     • slash chords (C/E): still handled by parseChordSymbol dropping the bass
//       (an inversion), not by a template.
const CHORD_TEMPLATES: ChordTemplate[] = [
  { name: "maj", intervals: [0, 4, 7] },
  { name: "m", intervals: [0, 3, 7] },
  { name: "7", intervals: [0, 4, 7, 10] },
  { name: "maj7", intervals: [0, 4, 7, 11] },
  { name: "m7", intervals: [0, 3, 7, 10] },
  { name: "dim", intervals: [0, 3, 6] },
  { name: "m7b5", intervals: [0, 3, 6, 10] },
  { name: "aug", intervals: [0, 4, 8] },
  { name: "sus4", intervals: [0, 5, 7] },
  { name: "sus2", intervals: [0, 2, 7] },
  { name: "add9", intervals: [0, 4, 7, 2] },
  { name: "madd9", intervals: [0, 3, 7, 2] },
  { name: "6", intervals: [0, 4, 7, 9] },
  { name: "m6", intervals: [0, 3, 7, 9] },
  { name: "dim7", intervals: [0, 3, 6, 9] },
  { name: "9", intervals: [0, 4, 7, 10, 2] },
  { name: "maj9", intervals: [0, 4, 7, 11, 2] },
  { name: "m9", intervals: [0, 3, 7, 10, 2] },
];

/** The bass-aware additions (2026-07-22). They compete only in the EXACT-match
 *  tier below, never in the legacy best-effort fallback, so an inexact set (a
 *  texture, or a partial voicing) keeps the label the pre-bass-aware engine gave
 *  it. This bounds the library regression to measures that spell one exact chord. */
const EXTENDED_QUALITIES = new Set(["6", "m6", "dim7", "9", "maj9", "m9"]);

/**
 * Best-effort chord inference from a set of pitch classes, in two tiers:
 *
 *   1. BASS-EXACT — the lowest note is the ROOT of an exact chord: the whole set
 *      spells exactly one template rooted on the bass. This is all the maker's
 *      clean root-position voicer output ever is, and the only unambiguous case —
 *      the bass names the chord, so C6 vs Am7 (same four notes), the symmetric
 *      dim7, and G9 vs the Bm7b5 it contains all resolve to the intended spelling
 *      and round-trip. Includes every quality (the extended ones too).
 *   2. LEGACY best-effort — the bass does not spell an exact chord (a busy
 *      texture, an inversion, or a partial voicing). Falls back to the pre-bass-
 *      aware tie-break over the BASE vocabulary only, so these labels are byte-
 *      identical to before (Gate 2: the library snapshot shifts ONLY where the
 *      bass spells exactly one chord — never on a fuzzy texture, where a single
 *      chord name is arbitrary and best left as the engine already had it).
 */
function inferChordFromPitchClasses(pitchClasses: number[], bassPc = -1): string {
  if (pitchClasses.length === 0) return "N/A";
  if (pitchClasses.length === 1) return PC_NAMES[pitchClasses[0]];

  const unique = [...new Set(pitchClasses)];

  // ── Tier 1: the BASS spells an exact chord (set === one template from bassPc). ──
  if (bassPc >= 0) {
    const fromBass = new Set(unique.map(pc => (pc - bassPc + 12) % 12));
    for (const tmpl of CHORD_TEMPLATES) {
      // equal size + every template interval present ⇒ the set IS this template.
      if (tmpl.intervals.length === unique.length && tmpl.intervals.every(iv => fromBass.has(iv))) {
        return PC_NAMES[bassPc] + (tmpl.name === "maj" ? "" : tmpl.name);
      }
    }
  }

  // ── Tier 2: legacy best-effort over the BASE vocabulary (bass-agnostic). ──
  let bestMatch = "";
  let bestScore = 0;
  for (const root of unique) {
    const intervals = unique.map(pc => (pc - root + 12) % 12).sort((a, b) => a - b);
    for (const tmpl of CHORD_TEMPLATES) {
      if (EXTENDED_QUALITIES.has(tmpl.name)) continue; // extended qualities are exact-only
      const matched = tmpl.intervals.filter(iv => intervals.includes(iv)).length;
      const score = matched / tmpl.intervals.length;
      if (score > bestScore || (score === bestScore && tmpl.intervals.length > 3)) {
        bestScore = score;
        const suffix = tmpl.name === "maj" ? "" : tmpl.name;
        bestMatch = PC_NAMES[root] + suffix;
      }
    }
  }

  return bestScore >= 0.66 ? bestMatch : PC_NAMES[unique[0]]; // fallback to bass note
}

/**
 * Infer a chord symbol from a left-hand notation string. Simultaneous notes
 * may be "+"-joined ("C3+E3+G3:q", the chord notation MIDI ingest emits) or
 * space-separated — pitch inference treats both the same.
 */
export function inferChord(leftHand: string): string {
  const tokens = leftHand.split(/[\s+]+/).filter(Boolean);
  const pitchClasses: number[] = [];
  let bassMidi = Infinity;
  let bassPc = -1;

  for (const tok of tokens) {
    const name = tokenToNoteName(tok);
    if (name) pitchClasses.push(nameToPitchClass(name));
    // Track the lowest sounding note so the inference can name the chord by its
    // bass (root-position voicings round-trip; inversions read by their bass).
    const midi = tokenToMidi(tok);
    if (midi >= 0 && midi < bassMidi) {
      bassMidi = midi;
      bassPc = midi % 12;
    }
  }

  return inferChordFromPitchClasses(pitchClasses, bassPc);
}

// ─── Contour Analysis ───────────────────────────────────────────────────────

/**
 * Classify the melodic contour of a right-hand notation string. A "+"-joined
 * chord ("C4+E4+G4:q") contributes its top tone — the melody voice.
 */
export function computeContour(rightHand: string): "ascending" | "descending" | "static" | "arc" {
  const tokens = rightHand.split(/\s+/).filter(Boolean);
  const midis: number[] = [];

  for (const tok of tokens) {
    const m = tokenToTopMidi(tok);
    if (m >= 0) midis.push(m);
  }

  if (midis.length <= 1) return "static";

  const first = midis[0];
  const last = midis[midis.length - 1];
  const mid = midis[Math.floor(midis.length / 2)];
  const diff = last - first;

  // Check for arc: goes up then down, or down then up
  if (midis.length >= 3) {
    const goesUpThenDown = mid > first && mid > last;
    const goesDownThenUp = mid < first && mid < last;
    if (goesUpThenDown || goesDownThenUp) return "arc";
  }

  if (Math.abs(diff) <= 1) return "static";
  return diff > 0 ? "ascending" : "descending";
}

// ─── Style Guidance ─────────────────────────────────────────────────────────

const STYLE_HINTS: Record<Genre, string[]> = {
  classical: [
    "Maintain strict tempo and dynamic contrasts",
    "Use rubato sparingly at phrase endings",
    "Voice the melody above accompaniment figures",
    "Pedal changes on harmonic shifts",
    "Observe all articulation markings (legato, staccato)",
  ],
  jazz: [
    "Swing eighths: long-short feel, emphasis on beats 2 and 4",
    "Add 7th, 9th, and 13th extensions to chords",
    "Shell voicings in left hand (root + 7th or 3rd + 7th)",
    "Chromatic approach notes and passing tones in melody",
    "Walking bass line: stepwise motion connecting chord roots",
  ],
  pop: [
    "Steady eighth-note pulse in left hand (broken chords or arpeggios)",
    "Keep melody simple and singable",
    "Build intensity through verse → chorus dynamics",
    "Use sustain pedal freely for full sound",
    "Rhythmic consistency matters more than harmonic complexity",
  ],
  blues: [
    "Shuffle feel: dotted-eighth + sixteenth pattern",
    "Minor pentatonic scale for melody embellishment",
    "Call-and-response between hands",
    "12-bar blues form if restructuring",
    "Blue notes: b3, b5, b7 for authentic color",
  ],
  rock: [
    "Strong downbeats with octave bass",
    "Power chord voicings (root + fifth) in left hand",
    "Driving eighth-note rhythm, slight accent on backbeats",
    "Build tension with dynamics, release on chorus",
    "Keep it raw — precision matters less than energy",
  ],
  rnb: [
    "Smooth voice leading between chords",
    "Extended harmonies: 9ths, 11ths, 13ths",
    "Syncopated rhythm — anticipate the beat",
    "Gospel-influenced passing chords and suspensions",
    "Gentle touch, let notes breathe with pedal",
  ],
  soul: [
    "Gospel-rooted: steady left hand, right hand sings the melody",
    "Call-and-response phrasing between hands",
    "Strong downbeats with slight swing on eighth notes",
    "Simple chord voicings — power is in conviction, not complexity",
    "Build dynamics through repetition and emphasis, not speed",
  ],
  latin: [
    "Bossa nova: bass note on 1, chord on the 'and' of 2",
    "Anticipation: place chords just before the downbeat",
    "Clave rhythm awareness (3-2 or 2-3 pattern)",
    "Light touch, minimal sustain pedal",
    "Melody should float above a steady rhythmic foundation",
  ],
  film: [
    "Cinematic dynamics: start sparse, build to full texture",
    "Arpeggiated patterns create motion and atmosphere",
    "Wide voicings spanning 2+ octaves for orchestral feel",
    "Rubato and tempo flexibility for emotional expression",
    "Let silence and sustain do the storytelling",
  ],
  ragtime: [
    "Strict tempo — ragtime swings from rhythm, not rubato",
    "Left hand: oom-pah bass (low note on 1 & 3, chord on 2 & 4)",
    "Right hand: syncopated melody against steady left hand",
    "Crisp articulation, minimal pedal",
    "Accent the off-beat syncopations in the melody",
  ],
  "new-age": [
    "Gentle arpeggiated patterns, let notes ring with pedal",
    "Slow harmonic rhythm — let each chord breathe",
    "Use open voicings (root-fifth-octave) for spaciousness",
    "Dynamics should be subtle, mostly pp to mp",
    "Create a meditative, flowing atmosphere",
  ],
  folk: [
    "Simple, singable melody above basic chord accompaniment",
    "Pentatonic or modal scales — avoid chromatic passing tones",
    "Gentle waltz feel for 3/4 time, steady pulse for 4/4",
    "Sustain pedal on beat 1, lift before the next measure",
    "The melody tells the story — keep accompaniment sparse and supportive",
  ],
};

const MOOD_HINTS: Record<string, string[]> = {
  upbeat: ["Increase tempo 10-20%", "Accent rhythmic drive", "Use brighter register (higher octave)"],
  melancholic: ["Slow down 10-15%", "Minor key reharmonization", "Use lower register, softer dynamics"],
  dreamy: ["Generous pedal, let harmonies blend", "Rubato tempo", "Arpeggiate chords instead of blocking"],
  energetic: ["Strong accents on downbeats", "Full dynamic range", "Use octave doublings for power"],
  gentle: ["Soft dynamics (pp-mp)", "Legato touch throughout", "Sparse left hand, let melody lead"],
  playful: ["Staccato articulation", "Syncopated accents", "Contrast registers for surprise"],
};

/** Get style guidance strings for a target genre and optional mood. */
export function getStyleGuidance(genre?: Genre, mood?: string): string[] {
  const hints: string[] = [];
  // Guard the lookup the same way mood is guarded below — options.style is
  // untyped JSON at the MCP tool boundary, so an unrecognized genre string
  // (e.g. an LLM passing "synthwave") previously threw "undefined is not
  // iterable" from `hints.push(...undefined)` (F-daecb4be).
  if (genre && STYLE_HINTS[genre]) hints.push(...STYLE_HINTS[genre]);

  if (mood) {
    const key = mood.toLowerCase();
    if (MOOD_HINTS[key]) {
      hints.push(...MOOD_HINTS[key]);
    } else {
      hints.push(`Interpret with a "${mood}" feel — adjust dynamics, tempo, and articulation accordingly`);
    }
  }

  return hints;
}

// ─── Jam Brief Generation ───────────────────────────────────────────────────

/** Parse a measure range string like "1-8" into [start, end] (0-based indices). */
export function parseMeasureRange(rangeStr: string, total: number): [number, number] {
  const parts = rangeStr.split("-").map((s) => s.trim());
  if (parts.length === 0 || parts.length > 2 || parts.some((part) => part.length === 0)) {
    throw new Error(`Invalid measure range: "${rangeStr}". Use "N" or "start-end".`);
  }

  const startMeasure = Number.parseInt(parts[0], 10);
  const endMeasure = parts.length === 2 ? Number.parseInt(parts[1], 10) : startMeasure;

  if (Number.isNaN(startMeasure) || Number.isNaN(endMeasure)) {
    throw new Error(`Invalid measure range: "${rangeStr}". Measures must be numeric.`);
  }
  if (endMeasure < startMeasure) {
    throw new Error(`Invalid measure range: "${rangeStr}". End measure must be >= start measure.`);
  }

  const start = Math.max(0, startMeasure - 1);
  const end = Math.min(total - 1, endMeasure - 1);
  return [start, end];
}

/** Generate a jam brief from a source song. */
export function generateJamBrief(song: SongEntry, options: JamBriefOptions = {}): JamBrief {
  // Determine measure range
  let measures = song.measures;
  if (options.measures) {
    const [start, end] = parseMeasureRange(options.measures, song.measures.length);
    measures = song.measures.slice(start, end + 1);
  }

  // Analyze chords — the crude per-measure implied chord (kept for backward-
  // compatibility and consistency with anything that reads inferChord).
  const chordProgression: ChordMeasure[] = measures.map(m => ({
    measure: m.number,
    leftHand: m.leftHand,
    impliedChord: inferChord(m.leftHand),
  }));

  // The real harmonic analysis of the section (src/analysis) — richer source
  // material for the maker. Decoupled: reads the song, changes nothing frozen.
  const harmonicAnalysis = buildHarmonicAnalysis(song, measures);

  // Analyze melody
  const melodyOutline: MelodyMeasure[] = measures.map(m => ({
    measure: m.number,
    rightHand: m.rightHand,
    contour: computeContour(m.rightHand),
  }));

  // Style guidance
  const styleGuidance = getStyleGuidance(options.style ?? song.genre, options.mood);

  // Build instructions
  const targetStyle = options.style ?? song.genre;
  const targetMood = options.mood ? ` with a ${options.mood} feel` : "";
  const targetDiff = options.difficulty ? ` at ${options.difficulty} level` : "";

  const instructions = [
    `Create your own ${targetStyle} interpretation of "${song.title}"${targetMood}${targetDiff}.`,
    `Use the chord progression and melody outline as your starting point.`,
    `Reharmonize, embellish, or simplify as you see fit — this is YOUR version.`,
    `Gate your harmony with verify_harmony BEFORE saving: send your per-measure intended chords + voicings (with songId "${song.id}" or the melody inline) — the chord engine must confirm every voicing and the melody must sit on the new harmony.`,
    `Write a new SongEntry JSON with id "jam-${song.id}-${targetStyle}" and save with add_song.`,
    `Then play it with play_song to hear your creation, and see it with view_piano_roll.`,
  ];

  return {
    source: {
      id: song.id,
      title: song.title,
      composer: song.composer,
      genre: song.genre,
      key: song.key,
      tempo: song.tempo,
      timeSignature: song.timeSignature,
      structure: song.musicalLanguage.structure,
    },
    chordProgression,
    harmonicAnalysis,
    melodyOutline,
    styleGuidance,
    instructions,
  };
}

/**
 * Run the real analyzer over the section and pack it into the brief's
 * harmonic-analysis block. The analyzer takes a 1-based measure range; when the
 * brief is a slice, restrict to the sliced measures' numbers.
 */
function buildHarmonicAnalysis(song: SongEntry, measures: Measure[]): JamBriefHarmony {
  if (measures.length === 0) return { perMeasure: [], progression: [] };
  const range: [number, number] = [measures[0].number, measures[measures.length - 1].number];
  const analysis = analyzeHarmony(song, { measureRange: range });
  const bpm = analysis.beatsPerMeasure || 4;
  return {
    perMeasure: analysis.perMeasure.map((p) => ({
      measure: p.measure,
      chord: p.symbol,
      confidence: Math.round(p.confidence * 100) / 100,
    })),
    progression: analysis.spans.map((s) => ({
      chord: s.symbol,
      startMeasure: s.startMeasure,
      startBeatInMeasure: Math.round((s.startBeat - (s.startMeasure - 1) * bpm) * 100) / 100,
      confidence: Math.round(s.confidence * 100) / 100,
    })),
  };
}

// ─── Brief Formatting ───────────────────────────────────────────────────────

/** Format a JamBrief as readable markdown text for the LLM. */
export function formatJamBrief(brief: JamBrief, options: JamBriefOptions = {}): string {
  const s = brief.source;
  const targetStyle = options.style ?? s.genre;
  const moodLabel = options.mood ? `, ${options.mood}` : "";
  const rangeLabel = options.measures ? ` (measures ${options.measures})` : "";

  const lines: string[] = [
    `# Jam Brief: ${s.title} → ${targetStyle}${moodLabel}`,
    ``,
    `## Source Material`,
    `- **Original:** ${s.title}${s.composer ? ` by ${s.composer}` : ""}`,
    `- **Genre:** ${s.genre} → ${targetStyle}${s.genre === targetStyle ? " (same genre reinterpretation)" : ""}`,
    `- **Key:** ${s.key} | **Tempo:** ${s.tempo} BPM | **Time:** ${s.timeSignature}`,
    `- **Structure:** ${s.structure}`,
    ``,
    `## Chord Progression${rangeLabel}`,
    `| Measure | Left Hand | Implied Chord |`,
    `|---------|-----------|---------------|`,
  ];

  for (const cm of brief.chordProgression) {
    lines.push(`| ${cm.measure} | ${cm.leftHand} | ${cm.impliedChord} |`);
  }

  // Harmonic analysis (the real both-hands, salience-weighted analyzer) — richer
  // source material than the crude left-hand "implied chord" table above.
  const ha = brief.harmonicAnalysis;
  if (ha && ha.perMeasure.length > 0) {
    lines.push(
      ``,
      `## Harmonic Analysis${rangeLabel} (real analyzer — both hands, confidence 0–1)`,
      `Per measure:`,
      `| Measure | Chord | Confidence |`,
      `|---------|-------|------------|`,
    );
    for (const p of ha.perMeasure) {
      lines.push(`| ${p.measure} | ${p.chord} | ${p.confidence.toFixed(2)} |`);
    }
    // The progression as it actually moves (harmonic rhythm): a chord may change
    // mid-measure. Show only real chords, compactly.
    const chords = ha.progression.filter((p) => p.chord !== "N/C");
    if (chords.length > 0) {
      const seq = chords
        .map((p) => `${p.chord}@m${p.startMeasure}${p.startBeatInMeasure > 0 ? `.${p.startBeatInMeasure}` : ""}`)
        .join(" → ");
      lines.push(``, `Progression (harmonic rhythm): ${seq}`);
    }
  }

  lines.push(
    ``,
    `## Melody Outline${rangeLabel}`,
    `| Measure | Right Hand | Contour |`,
    `|---------|-----------|---------|`,
  );

  for (const mm of brief.melodyOutline) {
    lines.push(`| ${mm.measure} | ${mm.rightHand} | ${mm.contour} |`);
  }

  lines.push(
    ``,
    `## Style Guidance (target: ${targetStyle}${moodLabel})`,
  );

  for (const hint of brief.styleGuidance) {
    lines.push(`- ${hint}`);
  }

  lines.push(
    ``,
    `## Your Mission`,
  );

  for (let i = 0; i < brief.instructions.length; i++) {
    lines.push(`${i + 1}. ${brief.instructions[i]}`);
  }

  return lines.join("\n");
}
