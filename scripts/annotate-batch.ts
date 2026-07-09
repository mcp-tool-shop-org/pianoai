#!/usr/bin/env tsx
// ─── annotate-batch.ts — Annotation Harvest Harness ──────────────────────────
//
// Wave D1 (iteration 3): harness for the staged annotation harvest. Three
// modes, each independently useful:
//
//   --analyze <genre> [--out <dir>]
//     Deterministic, LLM-free analysis of every song in a genre: measure
//     count, tempo, time signature, key, note count, per-hand pitch range,
//     a per-measure density profile, the busiest/sparsest measures, the
//     longest per-hand rest gaps, and repeated-section hints. This is pure
//     ground truth pulled from the .mid file via the SAME canonical pipeline
//     initializeFromLibrary/ingestSong use (src/songs/midi/ingest.js's
//     midiToSongEntry) — not a second, divergent MIDI reader. An LLM (or a
//     human) reads the brief and writes the musicalLanguage block; nothing
//     in this mode calls out to an LLM itself.
//
//   --apply <genre> --annotations <file.json> [--min-score <n>]
//     Takes a JSON array of {slug, musicalLanguage} candidates, validates
//     each against MusicalLanguageSchema, scores it with scoreAnnotation,
//     and writes ONLY the candidates scoring >= --min-score (default 80 —
//     see DEFAULT_MIN_SCORE below for the citation). Writing means: load the
//     song's existing config JSON, set status:"ready" and musicalLanguage,
//     and write it back preserving every other field and the original key
//     order. Below-threshold and schema-invalid candidates are reported and
//     never written.
//
//   --report <genre>
//     A slug | status | score table — the QA receipt for a genre.
//
// Usage:
//   tsx scripts/annotate-batch.ts --analyze blues
//   tsx scripts/annotate-batch.ts --analyze blues --out /tmp/blues-briefs
//   tsx scripts/annotate-batch.ts --apply blues --annotations candidates.json
//   tsx scripts/annotate-batch.ts --apply blues --annotations candidates.json --min-score 75
//   tsx scripts/annotate-batch.ts --report blues
//
// Exit codes: 0 on success (including "some candidates were below threshold"
// — that's a normal QA outcome, not a CLI failure); 1 on bad input (CliArgsError
// or JamError with an INPUT_/CONFIG_ code); 2 on unexpected runtime errors.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GENRES,
  type Genre,
  type SongConfig,
  type SongEntry,
  type Measure,
  type MusicalLanguage,
  SongConfigSchema,
  MusicalLanguageSchema,
  midiToSongEntry,
  midiNoteToScientific,
  listConfigIds,
} from "../src/songs/index.js";
import { SONG_ID_REGEX } from "../src/songs/config/schema.js";
import { scoreAnnotation, type AnnotationScore } from "../src/annotation-scorer.js";
import { JamError, handleError, EXIT_OK, EXIT_USER } from "../src/errors.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const LIBRARY_DIR = join(REPO_ROOT, "songs", "library");

// ─── Tunables ─────────────────────────────────────────────────────────────────

/**
 * Default --min-score for --apply. The rubric (src/annotation-scorer.ts) has
 * no single named "good" constant, so the defensible cut is the one place
 * the repo's OWN test suite defines what "exemplar-quality" scores:
 * src/annotation-scorer.test.ts's "gives high score to exemplar-quality
 * annotation" test asserts `overall >= 80` (grade B or A) for a
 * fur-elise-modeled annotation. 80 is that line, made the default floor.
 */
export const DEFAULT_MIN_SCORE = 80;

/** How many busiest/sparsest measures to surface per song. */
export const DEFAULT_TOP_N = 5;

// ─── Analysis brief types ──────────────────────────────────────────────────────

export interface MeasureDensity {
  measure: number;
  rightHandOnsets: number;
  leftHandOnsets: number;
  totalOnsets: number;
}

export interface RestGap {
  hand: "rightHand" | "leftHand";
  startMeasure: number;
  endMeasure: number;
  lengthMeasures: number;
}

export interface PitchExtreme {
  midi: number;
  name: string;
  measure: number;
}

export interface HandRange {
  lowest: PitchExtreme | null;
  highest: PitchExtreme | null;
}

export interface RepeatGroup {
  /** "identical" = byte-identical rightHand+leftHand strings. "near-identical" = same pitch-class multiset (octave-invariant), different voicing/rhythm. */
  kind: "identical" | "near-identical";
  fingerprint: string;
  measures: number[];
}

export interface AnalysisBrief {
  slug: string;
  title: string;
  genre: Genre;
  key: string;
  tempo: number;
  timeSignature: string;
  measureCount: number;
  /** Total individual pitches sounded across both hands (chords expanded). */
  noteCount: number;
  pitchRange: {
    rightHand: HandRange;
    leftHand: HandRange;
  };
  densityProfile: MeasureDensity[];
  busiestMeasures: MeasureDensity[];
  sparsestMeasures: MeasureDensity[];
  longestRestGaps: RestGap[];
  repeatedSections: RepeatGroup[];
}

// ─── Note-string parsing (inverse of hands.ts's formatHand) ────────────────────
//
// entry.measures[].rightHand/leftHand are strings like "C4:q D4+F#4:e R:w"
// (see songs/types.ts's Measure JSDoc). This is the ONE place that format is
// decoded for analysis purposes — everything else in this file works off the
// parsed { onsetCount, pitches } shape.

interface ParsedHand {
  onsetCount: number;
  pitches: number[]; // MIDI note numbers, chords expanded
}

const NOTE_TOKEN_RE = /^([A-G]#?)(-?\d+)$/;
const PITCH_CLASS: Record<string, number> = {
  C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
};

/** Inverse of midiNoteToScientific (hands.ts). Only handles the sharp-only, no-flat format the ingest pipeline itself emits. */
function noteNameToMidi(name: string): number {
  const m = NOTE_TOKEN_RE.exec(name);
  if (!m) {
    throw new JamError({
      code: "INPUT_PARSE_ERROR",
      message: `Unrecognized note token "${name}" while analyzing measures`,
      hint: "Expected scientific pitch notation like \"C4\" or \"F#5\" (the ingest pipeline's own output format).",
    });
  }
  const [, letter, octaveStr] = m;
  const pitchClass = PITCH_CLASS[letter];
  const octave = parseInt(octaveStr, 10);
  return pitchClass + (octave + 1) * 12;
}

function parseHandString(hand: string): ParsedHand {
  if (!hand || hand === "R:w") return { onsetCount: 0, pitches: [] };
  const tokens = hand.trim().split(/\s+/);
  let onsetCount = 0;
  const pitches: number[] = [];
  for (const tok of tokens) {
    const pitchPart = tok.split(":")[0];
    if (pitchPart === "R") continue; // defensive: a bare rest token amid others
    onsetCount++;
    for (const n of pitchPart.split("+")) pitches.push(noteNameToMidi(n));
  }
  return { onsetCount, pitches };
}

// ─── Per-measure analysis (single pass, shared by every derived metric) ───────

interface MeasureAnalysis {
  number: number;
  rightHandRaw: string;
  leftHandRaw: string;
  rightHand: ParsedHand;
  leftHand: ParsedHand;
}

function analyzeMeasures(measures: Measure[]): MeasureAnalysis[] {
  return measures.map((m) => ({
    number: m.number,
    rightHandRaw: m.rightHand,
    leftHandRaw: m.leftHand,
    rightHand: parseHandString(m.rightHand),
    leftHand: parseHandString(m.leftHand),
  }));
}

function handRange(perMeasure: MeasureAnalysis[], hand: "rightHand" | "leftHand"): HandRange {
  let lowest: PitchExtreme | null = null;
  let highest: PitchExtreme | null = null;
  for (const m of perMeasure) {
    for (const midi of m[hand].pitches) {
      if (!lowest || midi < lowest.midi) lowest = { midi, name: midiNoteToScientific(midi), measure: m.number };
      if (!highest || midi > highest.midi) highest = { midi, name: midiNoteToScientific(midi), measure: m.number };
    }
  }
  return { lowest, highest };
}

function longestRestGap(perMeasure: MeasureAnalysis[], hand: "rightHand" | "leftHand"): RestGap | null {
  const rawKey: "rightHandRaw" | "leftHandRaw" = hand === "rightHand" ? "rightHandRaw" : "leftHandRaw";
  let best: RestGap | null = null;
  let runStart: number | null = null;
  for (const m of perMeasure) {
    const isRest = m[rawKey] === "R:w";
    if (isRest) {
      if (runStart === null) runStart = m.number;
    } else if (runStart !== null) {
      const len = m.number - runStart;
      if (!best || len > best.lengthMeasures) {
        best = { hand, startMeasure: runStart, endMeasure: m.number - 1, lengthMeasures: len };
      }
      runStart = null;
    }
  }
  if (runStart !== null && perMeasure.length > 0) {
    const lastNumber = perMeasure[perMeasure.length - 1].number;
    const len = lastNumber - runStart + 1;
    if (!best || len > best.lengthMeasures) {
      best = { hand, startMeasure: runStart, endMeasure: lastNumber, lengthMeasures: len };
    }
  }
  return best;
}

function sameMeasureSet(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

/**
 * Repeated-section hints. Two groupings, both deterministic:
 *   - "identical": measures whose rightHand+leftHand strings are byte-equal
 *     (same pitches, same rhythm, same octave).
 *   - "near-identical": measures that share the same pitch-CLASS multiset
 *     (octave-folded, mod 12) across both hands combined, but are not
 *     byte-identical — same harmonic content, different voicing or rhythm.
 * Rest-only measures (both hands "R:w") are excluded from both — silence
 * repeating is not a musically interesting hint.
 */
function findRepeatedSections(perMeasure: MeasureAnalysis[]): RepeatGroup[] {
  const identicalGroups = new Map<string, number[]>();
  const pcGroups = new Map<string, number[]>();

  for (const m of perMeasure) {
    const isRestOnly = m.rightHandRaw === "R:w" && m.leftHandRaw === "R:w";
    if (isRestOnly) continue;

    const identicalKey = `${m.rightHandRaw}|${m.leftHandRaw}`;
    if (!identicalGroups.has(identicalKey)) identicalGroups.set(identicalKey, []);
    identicalGroups.get(identicalKey)!.push(m.number);

    const pcKey = [...m.rightHand.pitches, ...m.leftHand.pitches]
      .map((p) => ((p % 12) + 12) % 12)
      .sort((a, b) => a - b)
      .join(",");
    if (pcKey === "") continue;
    if (!pcGroups.has(pcKey)) pcGroups.set(pcKey, []);
    pcGroups.get(pcKey)!.push(m.number);
  }

  const results: RepeatGroup[] = [];

  for (const [key, ms] of identicalGroups) {
    if (ms.length >= 2) results.push({ kind: "identical", fingerprint: key, measures: ms });
  }

  for (const [key, ms] of pcGroups) {
    if (ms.length < 2) continue;
    const alreadyIdentical = results.some((r) => r.kind === "identical" && sameMeasureSet(r.measures, ms));
    if (alreadyIdentical) continue;
    results.push({ kind: "near-identical", fingerprint: `pc:${key}`, measures: ms });
  }

  results.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "identical" ? -1 : 1;
    return a.measures[0] - b.measures[0];
  });

  return results;
}

function buildAnalysisBrief(config: SongConfig, entry: SongEntry, topN: number): AnalysisBrief {
  const perMeasure = analyzeMeasures(entry.measures);

  const densityProfile: MeasureDensity[] = perMeasure.map((m) => ({
    measure: m.number,
    rightHandOnsets: m.rightHand.onsetCount,
    leftHandOnsets: m.leftHand.onsetCount,
    totalOnsets: m.rightHand.onsetCount + m.leftHand.onsetCount,
  }));

  const noteCount = perMeasure.reduce((sum, m) => sum + m.rightHand.pitches.length + m.leftHand.pitches.length, 0);

  const n = Math.min(topN, densityProfile.length);
  const busiestMeasures = [...densityProfile].sort((a, b) => b.totalOnsets - a.totalOnsets || a.measure - b.measure).slice(0, n);
  const sparsestMeasures = [...densityProfile].sort((a, b) => a.totalOnsets - b.totalOnsets || a.measure - b.measure).slice(0, n);

  const longestRestGaps = [longestRestGap(perMeasure, "rightHand"), longestRestGap(perMeasure, "leftHand")].filter(
    (g): g is RestGap => g !== null,
  );

  return {
    slug: config.id,
    title: config.title,
    genre: config.genre,
    key: config.key,
    tempo: entry.tempo,
    timeSignature: entry.timeSignature,
    measureCount: entry.measures.length,
    noteCount,
    pitchRange: {
      rightHand: handRange(perMeasure, "rightHand"),
      leftHand: handRange(perMeasure, "leftHand"),
    },
    densityProfile,
    busiestMeasures,
    sparsestMeasures,
    longestRestGaps,
    repeatedSections: findRepeatedSections(perMeasure),
  };
}

// ─── Config I/O (secret: exact key-order + field preservation) ────────────────
//
// Zod's .parse() rebuilds the output object by iterating the SCHEMA's own
// key order, not the input's (verified empirically against the installed
// zod: parsing {c,a} against schema {a,b?,c} yields {a,c} — schema order).
// Writing that object back out would silently reorder every field in every
// config we touch. So: JSON.parse gives the raw object (JS/JSON preserves
// key insertion order), which we validate via SongConfigSchema for
// confidence but never use as the mutation target — only `raw` gets mutated
// and written back. This is the ONLY function that touches disk for writes.

interface LoadedConfig {
  raw: Record<string, unknown>;
  parsed: SongConfig;
  path: string;
}

function loadRawConfig(configPath: string): LoadedConfig {
  let text: string;
  try {
    text = readFileSync(configPath, "utf8");
  } catch (err) {
    throw new JamError({
      code: "IO_FILE_READ",
      message: `Could not read config: ${configPath}`,
      cause: err instanceof Error ? err : undefined,
    });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new JamError({
      code: "INPUT_PARSE_ERROR",
      message: `Config is not valid JSON: ${configPath}`,
      cause: err instanceof Error ? err : undefined,
    });
  }
  const result = SongConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ");
    throw new JamError({
      code: "CONFIG_INVALID",
      message: `Config failed schema validation: ${configPath}\n  ${issues}`,
    });
  }
  return { raw: raw as Record<string, unknown>, parsed: result.data, path: configPath };
}

function genreDirOf(libraryDir: string, genre: string): string {
  const dir = join(libraryDir, genre);
  if (!existsSync(dir)) {
    throw new JamError({
      code: "INPUT_INVALID_ARGS",
      message: `No such genre directory: ${dir}`,
      hint: `Valid genres: ${GENRES.join(", ")}`,
    });
  }
  return dir;
}

/** Silence the ingest pipeline's own "no musicalLanguage, substituting placeholder" warning — expected and uninteresting for raw songs during --analyze. Mirrors src/songs/midi/ingest.test.ts's own suppression pattern. */
function ingestForAnalysis(buf: Uint8Array, config: SongConfig): SongEntry {
  const orig = console.error;
  console.error = () => {};
  try {
    return midiToSongEntry(buf, config);
  } finally {
    console.error = orig;
  }
}

// ─── --analyze ──────────────────────────────────────────────────────────────

export function analyzeGenre(genre: Genre, libraryDir: string, topN: number = DEFAULT_TOP_N): AnalysisBrief[] {
  const genreDir = genreDirOf(libraryDir, genre);
  const ids = listConfigIds(genreDir).sort(); // deterministic order
  const briefs: AnalysisBrief[] = [];

  for (const id of ids) {
    const configPath = join(genreDir, `${id}.json`);
    const midiPath = join(genreDir, `${id}.mid`);
    const { parsed: config } = loadRawConfig(configPath);

    if (!existsSync(midiPath)) {
      throw new JamError({
        code: "INPUT_MISSING_FILE",
        message: `MIDI file not found for "${id}": ${midiPath}`,
      });
    }

    const midiBuffer = new Uint8Array(readFileSync(midiPath));
    const entry = ingestForAnalysis(midiBuffer, config);
    briefs.push(buildAnalysisBrief(config, entry, topN));
  }

  return briefs;
}

// ─── --apply ────────────────────────────────────────────────────────────────

export interface AnnotationCandidate {
  slug: string;
  musicalLanguage: unknown;
}

export interface AppliedEntry {
  slug: string;
  score: AnnotationScore;
  configPath: string;
}

export interface RejectedEntry {
  slug: string;
  score: AnnotationScore;
  reason: string;
}

export interface SchemaErrorEntry {
  slug: string;
  issues: string[];
}

export interface ApplyResult {
  genre: Genre;
  minScore: number;
  applied: AppliedEntry[];
  belowThreshold: RejectedEntry[];
  schemaErrors: SchemaErrorEntry[];
  unknownSlugs: string[];
}

export function applyAnnotations(
  genre: Genre,
  libraryDir: string,
  candidates: AnnotationCandidate[],
  minScore: number = DEFAULT_MIN_SCORE,
): ApplyResult {
  const genreDir = genreDirOf(libraryDir, genre);

  const result: ApplyResult = {
    genre,
    minScore,
    applied: [],
    belowThreshold: [],
    schemaErrors: [],
    unknownSlugs: [],
  };

  for (const candidate of candidates) {
    const configPath = join(genreDir, `${candidate.slug}.json`);
    if (!SONG_ID_REGEX.test(candidate.slug) || !existsSync(configPath)) {
      result.unknownSlugs.push(candidate.slug);
      continue;
    }

    const mlResult = MusicalLanguageSchema.safeParse(candidate.musicalLanguage);
    if (!mlResult.success) {
      result.schemaErrors.push({
        slug: candidate.slug,
        issues: mlResult.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`),
      });
      continue;
    }

    const ml: MusicalLanguage = mlResult.data;
    const score = scoreAnnotation(ml);

    if (score.overall >= minScore) {
      const { raw } = loadRawConfig(configPath);
      raw.status = "ready";
      raw.musicalLanguage = ml;
      try {
        writeFileSync(configPath, JSON.stringify(raw, null, 2) + "\n", "utf8");
      } catch (err) {
        throw new JamError({
          code: "IO_FILE_WRITE",
          message: `Could not write config: ${configPath}`,
          cause: err instanceof Error ? err : undefined,
        });
      }
      result.applied.push({ slug: candidate.slug, score, configPath });
    } else {
      result.belowThreshold.push({
        slug: candidate.slug,
        score,
        reason: `overall score ${score.overall} < min-score ${minScore}`,
      });
    }
  }

  return result;
}

// ─── --report ───────────────────────────────────────────────────────────────

export interface ReportRow {
  slug: string;
  status: SongConfig["status"];
  score: number | null;
  grade: string | null;
}

export function reportGenre(genre: Genre, libraryDir: string): ReportRow[] {
  const genreDir = genreDirOf(libraryDir, genre);
  const ids = listConfigIds(genreDir).sort();

  return ids.map((id) => {
    const { parsed: config } = loadRawConfig(join(genreDir, `${id}.json`));
    if (config.status === "ready" && config.musicalLanguage) {
      const score = scoreAnnotation(config.musicalLanguage);
      return { slug: id, status: config.status, score: score.overall, grade: score.grade };
    }
    return { slug: id, status: config.status, score: null, grade: null };
  });
}

// ─── CLI parsing ────────────────────────────────────────────────────────────

export class CliArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliArgsError";
  }
}

export type CliArgs =
  | { mode: "analyze"; genre: Genre; out: string | null; topN: number }
  | { mode: "apply"; genre: Genre; annotations: string; minScore: number }
  | { mode: "report"; genre: Genre }
  | { mode: "help" };

function isGenre(s: string): s is Genre {
  return (GENRES as readonly string[]).includes(s);
}

export function parseArgs(argv: string[]): CliArgs {
  let mode: "analyze" | "apply" | "report" | null = null;
  let genreArg: string | null = null;
  let out: string | null = null;
  let annotations: string | null = null;
  let minScore = DEFAULT_MIN_SCORE;
  let topN = DEFAULT_TOP_N;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }

    if (arg === "--analyze" || arg === "--apply" || arg === "--report") {
      if (mode !== null) throw new CliArgsError(`cannot combine ${arg} with --${mode}`);
      if (next === undefined || next.startsWith("--")) throw new CliArgsError(`${arg} requires a genre argument`);
      mode = arg.slice(2) as "analyze" | "apply" | "report";
      genreArg = next;
      i++;
      continue;
    }

    if (arg === "--out") {
      if (next === undefined) throw new CliArgsError("--out requires a directory path");
      out = next;
      i++;
      continue;
    }

    if (arg === "--annotations") {
      if (next === undefined) throw new CliArgsError("--annotations requires a file path");
      annotations = next;
      i++;
      continue;
    }

    if (arg === "--min-score") {
      if (next === undefined) throw new CliArgsError("--min-score requires a number");
      const n = Number(next);
      if (!Number.isFinite(n) || n < 0 || n > 100) throw new CliArgsError(`--min-score must be a number 0-100, got "${next}"`);
      minScore = n;
      i++;
      continue;
    }

    if (arg === "--top-n") {
      if (next === undefined) throw new CliArgsError("--top-n requires a number");
      const n = Number(next);
      if (!Number.isInteger(n) || n < 1) throw new CliArgsError(`--top-n must be a positive integer, got "${next}"`);
      topN = n;
      i++;
      continue;
    }

    throw new CliArgsError(`unknown flag: ${arg}`);
  }

  if (help) return { mode: "help" };
  if (mode === null) throw new CliArgsError("must specify one of --analyze, --apply, --report (or --help)");
  if (genreArg === null || !isGenre(genreArg)) {
    throw new CliArgsError(`invalid or missing genre for --${mode}: "${genreArg}" (valid: ${GENRES.join(", ")})`);
  }
  const genre = genreArg;

  if (mode === "analyze") return { mode, genre, out, topN };
  if (mode === "report") return { mode, genre };

  if (!annotations) throw new CliArgsError("--apply requires --annotations <file.json>");
  return { mode, genre, annotations, minScore };
}

function printHelp(): void {
  process.stdout.write(
    [
      "Usage: annotate-batch.ts --analyze <genre> [--out <dir>] [--top-n <n>]",
      "       annotate-batch.ts --apply <genre> --annotations <file.json> [--min-score <n>]",
      "       annotate-batch.ts --report <genre>",
      "",
      "Modes:",
      "  --analyze <genre>   Deterministic per-song analysis brief (no LLM calls).",
      "                      Prints a JSON array to stdout, or one file per song",
      "                      under --out <dir> if given.",
      "  --apply <genre>     Validate + score musicalLanguage candidates from",
      "                      --annotations, write only those scoring >= --min-score.",
      "  --report <genre>    slug | status | score table for the genre.",
      "",
      "Options:",
      `  --min-score <n>     Apply threshold, 0-100 (default ${DEFAULT_MIN_SCORE}).`,
      `  --top-n <n>         Busiest/sparsest measures to report (default ${DEFAULT_TOP_N}).`,
      "  --out <dir>         --analyze: write one <slug>.analysis.json per song.",
      "",
      `Genres: ${GENRES.join(", ")}`,
      "",
      "Exit codes: 0 success (below-threshold candidates are a normal outcome,",
      "not a failure); 1 bad input; 2 unexpected runtime error.",
      "",
    ].join("\n"),
  );
}

// ─── Rendering ──────────────────────────────────────────────────────────────

function renderReportTable(genre: Genre, rows: ReportRow[]): string {
  const lines: string[] = [`=== ${genre} annotation report ===`, "", "slug | status | score", "-----|--------|------"];
  for (const r of rows) {
    lines.push(`${r.slug} | ${r.status} | ${r.score !== null ? `${r.score} (${r.grade})` : "-"}`);
  }
  const readyCount = rows.filter((r) => r.status === "ready").length;
  lines.push("", `${readyCount}/${rows.length} ready`);
  return lines.join("\n") + "\n";
}

function renderApplyReport(result: ApplyResult): string {
  const lines: string[] = [`=== ${result.genre} apply (min-score ${result.minScore}) ===`, ""];

  if (result.applied.length > 0) {
    lines.push(`Applied (${result.applied.length}):`);
    for (const a of result.applied) lines.push(`  OK   ${a.slug}  score=${a.score.overall} (${a.score.grade})`);
    lines.push("");
  }

  if (result.belowThreshold.length > 0) {
    lines.push(`Below threshold — NOT written (${result.belowThreshold.length}):`);
    for (const r of result.belowThreshold) lines.push(`  SKIP ${r.slug}  score=${r.score.overall} (${r.score.grade}) — ${r.reason}`);
    lines.push("");
  }

  if (result.schemaErrors.length > 0) {
    lines.push(`Schema errors (${result.schemaErrors.length}):`);
    for (const e of result.schemaErrors) {
      lines.push(`  FAIL ${e.slug}`);
      for (const issue of e.issues) lines.push(`       - ${issue}`);
    }
    lines.push("");
  }

  if (result.unknownSlugs.length > 0) {
    lines.push(`Unknown song slugs (${result.unknownSlugs.length}): ${result.unknownSlugs.join(", ")}`, "");
  }

  return lines.join("\n") + "\n";
}

// ─── main ───────────────────────────────────────────────────────────────────

function main(): void {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof CliArgsError) {
      process.stderr.write(`${err.message}\nrun with --help for usage.\n`);
      process.exit(EXIT_USER);
    }
    throw err;
  }

  if (args.mode === "help") {
    printHelp();
    process.exit(EXIT_OK);
  }

  try {
    if (args.mode === "analyze") {
      const briefs = analyzeGenre(args.genre, LIBRARY_DIR, args.topN);
      if (args.out) {
        mkdirSync(args.out, { recursive: true });
        for (const b of briefs) {
          writeFileSync(join(args.out, `${b.slug}.analysis.json`), JSON.stringify(b, null, 2) + "\n", "utf8");
        }
        process.stdout.write(`Wrote ${briefs.length} analysis briefs to ${args.out}\n`);
      } else {
        process.stdout.write(JSON.stringify(briefs, null, 2) + "\n");
      }
      process.exit(EXIT_OK);
    }

    if (args.mode === "report") {
      const rows = reportGenre(args.genre, LIBRARY_DIR);
      process.stdout.write(renderReportTable(args.genre, rows));
      process.exit(EXIT_OK);
    }

    // --apply
    if (!existsSync(args.annotations)) {
      throw new JamError({ code: "INPUT_MISSING_FILE", message: `Annotations file not found: ${args.annotations}` });
    }
    let candidates: unknown;
    try {
      candidates = JSON.parse(readFileSync(args.annotations, "utf8"));
    } catch (err) {
      throw new JamError({
        code: "INPUT_PARSE_ERROR",
        message: `--annotations file is not valid JSON: ${args.annotations}`,
        cause: err instanceof Error ? err : undefined,
      });
    }
    if (!Array.isArray(candidates)) {
      throw new JamError({
        code: "INPUT_PARSE_ERROR",
        message: `--annotations file must contain a JSON array of {slug, musicalLanguage}`,
      });
    }

    const result = applyAnnotations(args.genre, LIBRARY_DIR, candidates as AnnotationCandidate[], args.minScore);
    process.stdout.write(renderApplyReport(result));
    const hasErrors = result.schemaErrors.length > 0 || result.unknownSlugs.length > 0;
    process.exit(hasErrors ? EXIT_USER : EXIT_OK);
  } catch (err) {
    process.exit(handleError(err, process.env.DEBUG === "1"));
  }
}

// Only run main() when invoked as a script, not when imported by tests
// (mirrors scripts/check-release-gate.ts's isMain gate).
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main();
}
