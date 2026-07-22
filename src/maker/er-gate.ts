// ─── Maker Arc — E-R (Reharmonization Gate) scoring library ───────────────────
//
// The PRIMARY maker-arc instrument (design §6.1): the task the platform can
// verify BY CONSTRUCTION. Given a library song section (melody kept), a
// generator proposes a per-measure { intendedChord, voicing } reharmonization —
// exactly the Phase-A maker loop — and the deterministic verifier grades it:
//
//   pass  ⇔  verifyHarmony(...).verified          (chord fidelity AND melody
//            AND                                    consonance hard gates, the
//            non-triviality guard passes            Yeh-class practice, F16)
//
// The non-triviality guard (design §6.1, Goodhart F9): the proposal must differ
// from the SOURCE harmony (inferChord of each measure's left hand) on ≥ a
// `[LOCK]` fraction of measures, so "copy the original chords" cannot game the
// gate. `[LOCK]` numbers here (ER_NON_TRIVIALITY_FRACTION, the item set) are
// PROPOSALS — Slice 3 pre-measures the base pass-rate and the director signs
// them ex ante (Fork 5) before any training run.
//
// The item set is disjoint from all training data BY CONSTRUCTION: the 10
// jam-actions-v0 source pieces are exactly the library's `classical` genre, so
// the E-R set is drawn from the 11 NON-classical genres (see TRAINING_SONG_IDS).
//
// This module is pure/deterministic (no LLM calls, no HTTP) so it is unit-
// testable; scripts/er-gate.ts is the thin runner that calls generators.
// ─────────────────────────────────────────────────────────────────────────────

import type { SongEntry, Genre } from "../songs/types.js";
import { GENRES } from "../songs/types.js";
import { inferChord } from "../songs/jam.js";
import {
  verifyHarmony,
  chordSymbolsEquivalent,
  type MelodyMeasureInput,
  type ReharmonizedMeasure,
  type HarmonyVerdict,
} from "./verify-harmony.js";

// ─── [LOCK] proposals ─────────────────────────────────────────────────────────

/**
 * Minimum fraction of measures whose proposed chord must DIFFER from the source
 * harmony for a reharmonization to count as non-trivial (blocks copy-the-
 * original gaming). `[LOCK]` proposal — Slice 3 confirms/replaces it.
 */
export const ER_NON_TRIVIALITY_FRACTION = 1 / 3;

/**
 * The jam-actions-v0 training source pieces. They ARE the library's `classical`
 * genre, so excluding these ids makes the E-R item set disjoint from all
 * training data (and drawn from the 11 non-classical genres).
 */
export const TRAINING_SONG_IDS: ReadonlySet<string> = new Set([
  "bach-prelude-c-major-bwv846",
  "chopin-nocturne-op9-no2",
  "chopin-prelude-e-minor",
  "clair-de-lune",
  "debussy-arabesque-no1",
  "fur-elise",
  "mozart-k545-mvt1",
  "pathetique-mvt2",
  "satie-gymnopedie-no1",
  "schumann-traumerei",
]);

// ─── Item selection (deterministic, frozen by id) ────────────────────────────

export interface ERItem {
  /** Frozen item id: `${songId}:m${start}-${end}`. */
  itemId: string;
  songId: string;
  genre: Genre;
  title: string;
  composer?: string;
  key: string;
  timeSignature: string;
  measureRange: [number, number];
  /** Melody the reharmonization must sit on (right hand per measure). */
  melody: MelodyMeasureInput[];
  /** Source harmony per measure (inferChord of the left hand) — the guard baseline. */
  sourceChords: Array<{ measure: number; impliedChord: string }>;
}

export interface SelectERItemsOptions {
  /** Sections to draw from each non-training genre. Default 2. */
  itemsPerGenre?: number;
  /** Measures per section. Default 8. */
  sectionBars?: number;
  /** 1-based first measure of each section. Default 1. */
  startMeasure?: number;
  /** Minimum measures a section must have to qualify. Default 4. */
  minMeasures?: number;
  /** Song ids to exclude (defaults to the training set). */
  excludeIds?: ReadonlySet<string>;
}

/**
 * Deterministically select E-R sections across the non-training genres. Songs
 * are sorted by id; the first `itemsPerGenre` qualifying songs of each genre
 * contribute one section each. Output order is genre order (types.ts) then id —
 * fully reproducible, so the frozen item list is stable.
 */
export function selectERItems(songs: SongEntry[], opts: SelectERItemsOptions = {}): ERItem[] {
  const itemsPerGenre = opts.itemsPerGenre ?? 2;
  const sectionBars = opts.sectionBars ?? 8;
  const startMeasure = opts.startMeasure ?? 1;
  const minMeasures = opts.minMeasures ?? 4;
  const excludeIds = opts.excludeIds ?? TRAINING_SONG_IDS;

  const byGenre = new Map<Genre, SongEntry[]>();
  for (const g of GENRES) byGenre.set(g, []);
  for (const s of songs) {
    if (excludeIds.has(s.id)) continue;
    byGenre.get(s.genre)?.push(s);
  }

  const items: ERItem[] = [];
  for (const genre of GENRES) {
    const genreSongs = (byGenre.get(genre) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
    let taken = 0;
    for (const song of genreSongs) {
      if (taken >= itemsPerGenre) break;
      const item = sectionToItem(song, startMeasure, sectionBars, minMeasures);
      if (item) {
        items.push(item);
        taken++;
      }
    }
  }
  return items;
}

function sectionToItem(
  song: SongEntry,
  startMeasure: number,
  sectionBars: number,
  minMeasures: number,
): ERItem | null {
  const endMeasure = startMeasure + sectionBars - 1;
  const section = song.measures.filter((m) => m.number >= startMeasure && m.number <= endMeasure);
  // Require enough measures that actually carry a melody (right hand).
  const withMelody = section.filter((m) => m.rightHand && m.rightHand.trim() && m.rightHand.trim() !== "R");
  if (withMelody.length < minMeasures) return null;

  const melody: MelodyMeasureInput[] = section.map((m) => ({ number: m.number, rightHand: m.rightHand }));
  const sourceChords = section.map((m) => ({ measure: m.number, impliedChord: inferChord(m.leftHand) }));
  const realEnd = section[section.length - 1].number;
  return {
    itemId: `${song.id}:m${startMeasure}-${realEnd}`,
    songId: song.id,
    genre: song.genre,
    title: song.title,
    composer: song.composer,
    key: song.key,
    timeSignature: song.timeSignature,
    measureRange: [startMeasure, realEnd],
    melody,
    sourceChords,
  };
}

// ─── The generator brief ──────────────────────────────────────────────────────

export const ER_SYSTEM_TEXT = [
  "You are a harmony arranger. Given a melody (per-measure right-hand notes) in a stated key,",
  "propose a REHARMONIZATION: for each measure, an intended chord symbol and a left-hand voicing",
  "that spells exactly that chord.",
  "",
  "Rules:",
  "- Every voicing must spell EXACTLY its intended chord. A deterministic chord engine will verify it.",
  "  Supported chord qualities: maj (write the root alone, e.g. \"C\"), m, 7, maj7, m7, dim, m7b5, aug, sus4, sus2.",
  "- The melody must sit consonantly on your harmony: chord tones and standard tensions (9,11,13,#11,…);",
  "  keep outright chromatic clashes rare (≤ 1 in 5 melody notes).",
  "- REHARMONIZE — do not just restate the original chords. Change the harmony on a meaningful share of",
  "  measures (tritone/bVI substitutions, secondary dominants, modal interchange, passing chords).",
  "- Voicings are space-separated scientific-pitch notes in octaves 2–4, e.g. \"A2 C3 E3 G3\" for Am7,",
  "  \"F2 A2 C3 E3\" for Fmaj7. Use 3–4 notes.",
  "",
  "Output ONLY a JSON array, one object per melody measure, no prose:",
  '[{"measure": 1, "intendedChord": "Am7", "voicing": "A2 C3 E3 G3"}, ...]',
].join("\n");

/** JSON-schema-ish descriptor forwarded to Ollama's format:"json" mode. */
export const ER_OUTPUT_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      measure: { type: "integer" },
      intendedChord: { type: "string" },
      voicing: { type: "string" },
    },
    required: ["measure", "intendedChord", "voicing"],
  },
} as const;

export interface ERBrief {
  itemId: string;
  system: string;
  user: string;
}

/** Build the generator brief for an item (deterministic; no answer withheld —
 *  the task is to reharmonize, and the verifier is the deterministic judge). */
export function buildERBrief(item: ERItem): ERBrief {
  const lines: string[] = [
    `# Reharmonize: ${item.title}${item.composer ? ` (${item.composer})` : ""} — ${item.genre}`,
    ``,
    `Key: ${item.key} | Time: ${item.timeSignature} | Measures: ${item.measureRange[0]}-${item.measureRange[1]}`,
    ``,
    `| Measure | Melody (right hand) | Original chord |`,
    `|---------|---------------------|----------------|`,
  ];
  const srcByMeasure = new Map(item.sourceChords.map((c) => [c.measure, c.impliedChord]));
  for (const m of item.melody) {
    lines.push(`| ${m.number} | ${m.rightHand || "(none)"} | ${srcByMeasure.get(m.number) ?? "?"} |`);
  }
  lines.push(
    ``,
    `Propose your reharmonization as a JSON array with one entry per measure above.`,
  );
  return { itemId: item.itemId, system: ER_SYSTEM_TEXT, user: lines.join("\n") };
}

// ─── Tolerant response parsing ────────────────────────────────────────────────

export interface ParsedReharmonization {
  measures: ReharmonizedMeasure[];
  status: "clean" | "recovered" | "unrecoverable";
  reason?: string;
}

/**
 * Parse a generator response into ReharmonizedMeasure[]. Tolerant: accepts a raw
 * JSON array, an object wrapping an array, or an array embedded in prose /
 * ```json fences. Coerces field-name variants and drops malformed entries.
 */
export function parseReharmonization(raw: string): ParsedReharmonization {
  if (!raw || !raw.trim()) return { measures: [], status: "unrecoverable", reason: "empty response" };

  let parsed: unknown = null;
  let status: ParsedReharmonization["status"] = "clean";
  try {
    parsed = JSON.parse(raw);
  } catch {
    // recover: first ```json fence, else first [...] balance
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
    const candidate = fence ? fence[1] : extractFirstArray(raw);
    if (candidate) {
      try {
        parsed = JSON.parse(candidate);
        status = "recovered";
      } catch {
        /* fall through */
      }
    }
  }
  if (parsed === null) {
    return { measures: [], status: "unrecoverable", reason: "no JSON array found" };
  }

  const arr = Array.isArray(parsed)
    ? parsed
    : findFirstArrayProp(parsed as Record<string, unknown>);
  if (!Array.isArray(arr)) {
    return { measures: [], status: "unrecoverable", reason: "parsed value is not an array" };
  }
  if (status === "clean" && !Array.isArray(parsed)) status = "recovered";

  const measures: ReharmonizedMeasure[] = [];
  for (const entry of arr) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const measure = Number(e.measure ?? e.m ?? e.bar);
    const intendedChord = String(e.intendedChord ?? e.chord ?? e.intended ?? "").trim();
    const voicing = String(e.voicing ?? e.leftHand ?? e.left_hand ?? e.notes ?? "").trim();
    if (!Number.isFinite(measure) || !intendedChord || !voicing) continue;
    measures.push({ measure, intendedChord, voicing });
  }
  if (measures.length === 0) {
    return { measures, status: "unrecoverable", reason: "no valid measure entries" };
  }
  return { measures, status };
}

function extractFirstArray(s: string): string | null {
  const start = s.indexOf("[");
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === "[") depth++;
    else if (s[i] === "]") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function findFirstArrayProp(obj: Record<string, unknown>): unknown {
  for (const v of Object.values(obj)) if (Array.isArray(v)) return v;
  return null;
}

// ─── Non-triviality guard ─────────────────────────────────────────────────────

export interface NonTrivialityResult {
  totalMeasures: number;
  changedMeasures: number;
  fraction: number;
  threshold: number;
  passes: boolean;
  perMeasure: Array<{ measure: number; source: string; proposed: string; changed: boolean }>;
}

/**
 * Score how much a proposal departs from the source harmony. A measure is
 * "changed" when the proposed chord is NOT canonically equivalent to the source
 * (so "D#7" vs "Eb7" is unchanged, "Am" vs "Fmaj7" is changed). Measures whose
 * source chord is unparseable (e.g. "N/A") count as changed when a real chord is
 * proposed. Only measures present in BOTH the proposal and the source count.
 */
export function computeNonTriviality(
  item: ERItem,
  proposal: ReharmonizedMeasure[],
  threshold = ER_NON_TRIVIALITY_FRACTION,
): NonTrivialityResult {
  const srcByMeasure = new Map(item.sourceChords.map((c) => [c.measure, c.impliedChord]));
  const perMeasure: NonTrivialityResult["perMeasure"] = [];
  let changed = 0;
  let total = 0;
  for (const p of proposal) {
    const source = srcByMeasure.get(p.measure);
    if (source === undefined) continue; // proposal for a measure not in the section
    total++;
    const isChanged = !chordSymbolsEquivalent(p.intendedChord, source);
    if (isChanged) changed++;
    perMeasure.push({ measure: p.measure, source, proposed: p.intendedChord, changed: isChanged });
  }
  const fraction = total > 0 ? changed / total : 0;
  return {
    totalMeasures: total,
    changedMeasures: changed,
    fraction,
    threshold,
    passes: total > 0 && fraction >= threshold - 1e-9,
    perMeasure,
  };
}

// ─── Per-item scoring ─────────────────────────────────────────────────────────

export interface ERScore {
  itemId: string;
  songId: string;
  genre: Genre;
  parseStatus: ParsedReharmonization["status"];
  proposalMeasures: number;
  /** verifyHarmony hard gates (chord fidelity AND consonance). */
  verified: boolean;
  chordFidelity: { matched: number; total: number; pass: boolean };
  consonance: { chromaticRatio: number; pass: boolean };
  nonTriviality: NonTrivialityResult;
  /** The gate: verified AND non-trivial. */
  passes: boolean;
  verdict: HarmonyVerdict;
}

export interface ERScoreOptions {
  nonTrivialityThreshold?: number;
  maxChromaticRatio?: number;
}

/** Score a parsed reharmonization against an item's melody + source harmony. */
export function scoreERProposal(
  item: ERItem,
  parsed: ParsedReharmonization,
  opts: ERScoreOptions = {},
): ERScore {
  const proposal = parsed.measures;
  const verdict = verifyHarmony(item.melody, proposal, {
    key: item.key,
    maxChromaticRatio: opts.maxChromaticRatio,
  });
  const nonTriviality = computeNonTriviality(item, proposal, opts.nonTrivialityThreshold);
  const passes = verdict.verified && nonTriviality.passes;
  return {
    itemId: item.itemId,
    songId: item.songId,
    genre: item.genre,
    parseStatus: parsed.status,
    proposalMeasures: proposal.length,
    verified: verdict.verified,
    chordFidelity: {
      matched: verdict.chordFidelity.matched,
      total: verdict.chordFidelity.total,
      pass: verdict.chordFidelity.pass,
    },
    consonance: { chromaticRatio: verdict.consonance.chromaticRatio, pass: verdict.consonance.pass },
    nonTriviality,
    passes,
    verdict,
  };
}

// ─── Aggregate ────────────────────────────────────────────────────────────────

export interface ERAggregate {
  modelLabel: string;
  itemCount: number;
  /** Items with a parseable proposal. */
  parseableCount: number;
  /** Items passing the full gate (verified AND non-trivial). */
  passCount: number;
  passRate: number;
  /** Items clearing verifyHarmony (ignoring non-triviality). */
  verifiedCount: number;
  verifiedRate: number;
  /** Items that verified but were trivial (copy-the-original). */
  trivialButVerifiedCount: number;
  parseFailures: number;
  meanChordFidelity: number | null;
  meanNonTrivialityFraction: number | null;
  byGenre: Array<{ genre: Genre; items: number; passes: number }>;
}

export function aggregateERScores(modelLabel: string, scores: ERScore[]): ERAggregate {
  const parseable = scores.filter((s) => s.parseStatus !== "unrecoverable" && s.proposalMeasures > 0);
  const passes = scores.filter((s) => s.passes);
  const verified = scores.filter((s) => s.verified);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  const genres = new Map<Genre, { items: number; passes: number }>();
  for (const s of scores) {
    const g = genres.get(s.genre) ?? { items: 0, passes: 0 };
    g.items++;
    if (s.passes) g.passes++;
    genres.set(s.genre, g);
  }

  return {
    modelLabel,
    itemCount: scores.length,
    parseableCount: parseable.length,
    passCount: passes.length,
    passRate: scores.length ? passes.length / scores.length : 0,
    verifiedCount: verified.length,
    verifiedRate: scores.length ? verified.length / scores.length : 0,
    trivialButVerifiedCount: scores.filter((s) => s.verified && !s.nonTriviality.passes).length,
    parseFailures: scores.filter((s) => s.parseStatus === "unrecoverable" || s.proposalMeasures === 0).length,
    meanChordFidelity: mean(
      parseable.map((s) => (s.chordFidelity.total > 0 ? s.chordFidelity.matched / s.chordFidelity.total : 0)),
    ),
    meanNonTrivialityFraction: mean(parseable.map((s) => s.nonTriviality.fraction)),
    byGenre: [...genres.entries()].map(([genre, v]) => ({ genre, items: v.items, passes: v.passes })),
  };
}
