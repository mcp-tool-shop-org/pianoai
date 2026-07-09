// ─── ai-jam-sessions: Performance Scorer ──────────────────────────────────────
//
// Compares a recorded MIDI performance against a song's score to produce
// a structured assessment. The AI uses this to evaluate how well it played
// and identify areas for improvement.
//
// Matching algorithm:
//   1. Flatten song measures into expected note events with absolute timing
//   2. For each expected note, find the closest played note (by pitch + time)
//   3. Score timing accuracy, pitch accuracy, and completeness
//   4. Track missed notes (expected but not played) and extra notes (played but not expected)
// ─────────────────────────────────────────────────────────────────────────────

import type { SongEntry, Measure } from "./songs/types.js";
import type { MidiNoteEvent } from "./midi/types.js";
import { parseNoteToMidi, parseDuration, durationToMs } from "./note-parser.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ExpectedNote {
  /** MIDI note number */
  note: number;
  /** Absolute start time in seconds */
  time: number;
  /** Duration in seconds */
  duration: number;
  /** Which hand */
  hand: "right" | "left";
  /** Measure number (1-based) */
  measure: number;
  /** Original notation (e.g. "C4:q") */
  notation: string;
}

export interface NoteMatch {
  expected: ExpectedNote;
  played: MidiNoteEvent;
  timingErrorMs: number;
  pitchCorrect: boolean;
}

export interface PerformanceResult {
  songId: string;
  songTitle: string;

  metrics: {
    overallScore: number;         // 0–100
    pitchAccuracy: number;        // 0–100 (% of matched notes with correct pitch)
    timingAccuracyMs: number;     // avg absolute timing error in ms
    completeness: number;         // 0–100 (% of expected notes that were played)
    extraNoteCount: number;       // notes played that weren't in the score
  };

  details: {
    totalExpected: number;
    totalPlayed: number;
    matched: number;
    missed: MissedNote[];
    extras: ExtraNote[];
    timingIssues: TimingIssue[];
    /**
     * One verdict per expected note (additive — absent only on the
     * INPUT_LIMIT-guard early return, where it's `[]`). Read-only view on
     * top of `matched`/`missed`/`extras`/`metrics`; never changes their
     * shape or values. See `NoteVerdict` for status derivation.
     */
    noteVerdicts?: NoteVerdict[];
    /**
     * The effective bpm this performance was actually scored at —
     * `resolveEffectiveBpm(song, options.bpm)`, the SAME value
     * `flattenSongToExpected` used to compute every `ExpectedNote.time`
     * (and, transitively, `NoteVerdict.startSec`) in this result. Additive
     * — always populated by `scorePerformance` (including the
     * INPUT_LIMIT-guard branch) — but optional here so a hand-built
     * `PerformanceResult` (e.g. a test fixture) isn't forced to supply it.
     * Consumers that render/re-derive positions from this result (see
     * `renderScoredPianoRoll`) should prefer this over independently
     * re-resolving `song.tempo`, which could silently disagree with
     * whatever `bpm` this result was actually scored with.
     */
    scoredAtBpm?: number;
  };

  feedback: string;
}

export interface MissedNote {
  measure: number;
  hand: string;
  notation: string;
  timeSeconds: number;
}

export interface ExtraNote {
  note: number;
  timeSeconds: number;
  velocity: number;
}

export interface TimingIssue {
  measure: number;
  notation: string;
  expectedMs: number;
  actualMs: number;
  errorMs: number;
}

/**
 * A per-expected-note verdict for the scored piano-roll overlay (Wave S2).
 * Exactly one verdict is produced per expected note (see `flattenSongToExpected`),
 * regardless of whether it was matched.
 *
 * Status derivation (see `computeVerdictWindows`):
 *   - "correct": matched, correct pitch, |offsetMs| <= greenMs
 *   - "timing":  matched, correct pitch, |offsetMs| >  greenMs (still "timing"
 *                even past orangeMs — matched is matched, it never demotes to "missed")
 *   - "missed":  unmatched, OR matched to the wrong pitch (finding 33:
 *                "red = miss/wrong pitch" — a wrong-pitch near-match still counts
 *                as `matched` for the existing `matches`/`pitchAccuracy`/`completeness`
 *                bookkeeping above, unchanged; this field just never reports it as
 *                "correct" or "timing" since the right note didn't sound)
 */
export interface NoteVerdict {
  measure: number;
  notation: string;
  midi: number;
  startSec: number;
  status: "correct" | "timing" | "missed";
  /** Signed timing error in ms (played − expected); omitted for "missed". */
  offsetMs?: number;
}

// ─── Flatten song to expected notes ─────────────────────────────────────────

function parseHandTokens(
  handStr: string,
  hand: "right" | "left",
  startTimeSec: number,
  bpm: number,
  measureNum: number,
): ExpectedNote[] {
  if (!handStr || handStr.trim() === "") return [];

  const tokens = handStr.trim().split(/\s+/);
  const notes: ExpectedNote[] = [];
  let currentTime = startTimeSec;

  for (const token of tokens) {
    // Handle chords (C4+E4+G4:q)
    const chordParts = token.includes("+") ? token.split("+") : [token];

    // Find duration from the last part that has a ":"
    let durationSuffix = "q";
    for (const part of chordParts) {
      if (part.includes(":")) {
        durationSuffix = part.split(":")[1];
      }
    }

    const durationMs = durationToMs(parseDuration(durationSuffix), bpm);
    const durationSec = durationMs / 1000;

    for (const part of chordParts) {
      const noteStr = part.includes(":") ? part.split(":")[0] : part;
      try {
        const midi = parseNoteToMidi(noteStr);
        if (midi === -1) continue; // skip rests

        notes.push({
          note: midi,
          time: currentTime,
          duration: durationSec,
          hand,
          measure: measureNum,
          notation: token,
        });
      } catch {
        // Skip unparseable tokens
      }
    }

    currentTime += durationSec;
  }

  return notes;
}

/** Fallback tempo used when both the bpm override and song.tempo are invalid (<=0 or non-finite). */
const DEFAULT_FALLBACK_BPM = 120;

/**
 * Resolve the effective BPM used for all timing math in this module:
 * an explicit override, else the song's own tempo, falling back to
 * DEFAULT_FALLBACK_BPM when neither is a finite positive number.
 *
 * Guards bpm<=0 the same way durationToMs already does elsewhere in this
 * file — an effectiveBpm of 0 or negative would make measure durations
 * Infinity/negative, poisoning every ExpectedNote.time with Infinity/NaN
 * and silently producing a 0%-match score instead of a clear validation
 * error (F-eaa28d23). Falls back to a sane default tempo rather than
 * throwing, matching this module's role as a best-effort scorer rather
 * than a strict validator.
 *
 * Exported so callers outside this module (the scored piano-roll renderer)
 * can resolve the *same* effective bpm a given `scorePerformance`/
 * `flattenSongToExpected` call used, to keep verdict/extra timing aligned
 * with the grid.
 */
export function resolveEffectiveBpm(song: SongEntry, bpm?: number): number {
  const rawBpm = bpm ?? song.tempo;
  return Number.isFinite(rawBpm) && rawBpm > 0 ? rawBpm : DEFAULT_FALLBACK_BPM;
}

/** Measure duration in seconds for a "N/D" time signature string at `effectiveBpm`. */
function measureDurationSeconds(timeSignature: string, effectiveBpm: number): number {
  const [beatsNum, beatsDen] = timeSignature.split("/").map(Number);
  const beatsPerMeasure = beatsNum || 4;
  const beatUnit = beatsDen || 4;
  return (beatsPerMeasure * (4 / beatUnit) * 60) / effectiveBpm;
}

export function flattenSongToExpected(song: SongEntry, bpm?: number): ExpectedNote[] {
  const effectiveBpm = resolveEffectiveBpm(song, bpm);
  const notes: ExpectedNote[] = [];
  let measureStartTime = 0;
  const measureDurationSec = measureDurationSeconds(song.timeSignature, effectiveBpm);

  for (const measure of song.measures) {
    const rh = parseHandTokens(
      measure.rightHand, "right", measureStartTime, effectiveBpm, measure.number,
    );
    const lh = parseHandTokens(
      measure.leftHand, "left", measureStartTime, effectiveBpm, measure.number,
    );
    notes.push(...rh, ...lh);
    measureStartTime += measureDurationSec;
  }

  // Sort by time
  notes.sort((a, b) => a.time - b.time || a.note - b.note);
  return notes;
}

/**
 * Each measure's absolute start time in seconds, keyed by 1-based measure
 * number, using the same tempo/time-signature math as `flattenSongToExpected`
 * — so times returned here always agree with `ExpectedNote.time` /
 * `NoteVerdict.startSec` for the same song + bpm. Iteration order matches
 * `song.measures` array order (chronological), which `secondsToMeasureBeat`
 * relies on.
 */
export function computeMeasureStartTimes(song: SongEntry, bpm?: number): Map<number, number> {
  const effectiveBpm = resolveEffectiveBpm(song, bpm);
  const measureDurationSec = measureDurationSeconds(song.timeSignature, effectiveBpm);

  const starts = new Map<number, number>();
  let t = 0;
  for (const measure of song.measures) {
    starts.set(measure.number, t);
    t += measureDurationSec;
  }
  return starts;
}

/**
 * Convert an absolute time in seconds to a (measure number, beat-offset
 * within that measure) pair, given a start-time map from
 * `computeMeasureStartTimes` and the same tempo used to build it.
 * `beatOffset` is in quarter-note-beat units (matches piano-roll.ts's
 * `PlottedNote.startBeat`). Times before the first measure clamp to the
 * first measure (negative beatOffset); times after the last measure clamp
 * to the last measure (beatOffset may exceed that measure's beat count) —
 * both are deliberate soft-clamp behaviors for played notes that fall
 * outside the song's own timeline (e.g. an early/late extra note), not
 * hard errors.
 */
export function secondsToMeasureBeat(
  measureStartTimes: Map<number, number>,
  timeSeconds: number,
  tempoBpm: number,
): { measure: number; beatOffset: number } {
  let chosenMeasure: number | undefined;
  let chosenStart = 0;

  for (const [measureNum, start] of measureStartTimes) {
    if (start > timeSeconds) break; // Map iterates in insertion (chronological) order
    chosenMeasure = measureNum;
    chosenStart = start;
  }

  if (chosenMeasure === undefined) {
    const first = measureStartTimes.entries().next();
    if (first.done) return { measure: 1, beatOffset: 0 };
    [chosenMeasure, chosenStart] = first.value;
  }

  const beatOffset = (timeSeconds - chosenStart) * (tempoBpm / 60);
  return { measure: chosenMeasure, beatOffset };
}

/**
 * Verdict timing windows, scaled as percent-of-beat with floors/caps
 * (findings 32, 33 — Friberg & Sundberg timing JND ≈2.5% of IOI for
 * 240-1000ms IOIs; MIR onset-correctness standard ~50ms):
 *
 *   greenMs  = max(50, 0.025 * beatDurationMs)  — "correct" window
 *   orangeMs = min(150, toleranceMs)            — informational upper band
 *
 * `orangeMs` does not gate `NoteVerdict.status` on its own — any matched,
 * correct-pitch note past `greenMs` is "timing" whether or not it's within
 * `orangeMs` (matched is matched; see `NoteVerdict`). It's exposed for
 * callers/tests that want the MIR-standard band explicitly.
 */
export function computeVerdictWindows(
  bpm: number,
  toleranceMs: number,
): { greenMs: number; orangeMs: number } {
  const beatDurationMs = durationToMs(1, bpm);
  const greenMs = Math.max(50, 0.025 * beatDurationMs);
  const orangeMs = Math.min(150, toleranceMs);
  return { greenMs, orangeMs };
}

// ─── Match played notes to expected notes ───────────────────────────────────

export function scorePerformance(
  song: SongEntry,
  playedEvents: MidiNoteEvent[],
  options: { toleranceMs?: number; bpm?: number } = {},
): PerformanceResult {
  const INPUT_LIMIT = 10_000;

  const expected = flattenSongToExpected(song, options.bpm);
  // Single source of truth for "what bpm was this take scored at" — the
  // same value flattenSongToExpected(song, options.bpm) resolved
  // internally for every ExpectedNote.time. Stashed on `details` on EVERY
  // return path below (including the INPUT_LIMIT guard) so a caller/
  // renderer never has to separately guess/re-derive it — mispairing
  // becomes impossible by default (see renderScoredPianoRoll).
  const scoredAtBpm = resolveEffectiveBpm(song, options.bpm);

  // Guard against excessively large inputs that would cause O(N*M) stall
  if (expected.length > INPUT_LIMIT || playedEvents.length > INPUT_LIMIT) {
    return {
      songId: song.id,
      songTitle: song.title,
      metrics: { overallScore: 0, pitchAccuracy: 0, timingAccuracyMs: 0, completeness: 0, extraNoteCount: 0 },
      details: { totalExpected: expected.length, totalPlayed: playedEvents.length, matched: 0, missed: [], extras: [], timingIssues: [], noteVerdicts: [], scoredAtBpm },
      feedback: `Input too large for scoring: expected ${expected.length} notes, played ${playedEvents.length} notes. Maximum is ${INPUT_LIMIT} per array.`,
    };
  }

  const toleranceMs = options.toleranceMs ?? 150;
  const toleranceSec = toleranceMs / 1000;
  const played = [...playedEvents]
    .filter(e => e.velocity > 0)
    .sort((a, b) => a.time - b.time);

  const matches: NoteMatch[] = [];
  const usedPlayed = new Set<number>();
  const matchedExpected = new Set<number>();
  // Tracks which NoteMatch (if any) each expected-note index resolved to,
  // purely additive bookkeeping for `noteVerdicts` below — read-only, does
  // not influence `matches`/`missed`/`extras`/`metrics` in any way.
  const matchByExpectedIndex = new Map<number, NoteMatch>();

  // For each expected note, find best matching played note
  for (let ei = 0; ei < expected.length; ei++) {
    const exp = expected[ei];
    let bestIdx = -1;
    let bestError = Infinity;

    for (let pi = 0; pi < played.length; pi++) {
      if (usedPlayed.has(pi)) continue;

      const p = played[pi];
      const timeDiff = Math.abs(p.time - exp.time);

      if (timeDiff > toleranceSec) continue;

      // Prefer exact pitch match, then closest timing
      const pitchMatch = p.note === exp.note;
      const error = pitchMatch ? timeDiff : timeDiff + 1000; // heavily penalize wrong pitch

      if (error < bestError) {
        bestError = error;
        bestIdx = pi;
      }
    }

    if (bestIdx >= 0) {
      const p = played[bestIdx];
      usedPlayed.add(bestIdx);
      matchedExpected.add(ei);
      const match: NoteMatch = {
        expected: exp,
        played: p,
        timingErrorMs: (p.time - exp.time) * 1000,
        pitchCorrect: p.note === exp.note,
      };
      matches.push(match);
      matchByExpectedIndex.set(ei, match);
    }
  }

  // Collect missed and extra notes
  const missed: MissedNote[] = [];
  for (let ei = 0; ei < expected.length; ei++) {
    if (!matchedExpected.has(ei)) {
      const exp = expected[ei];
      missed.push({
        measure: exp.measure,
        hand: exp.hand,
        notation: exp.notation,
        timeSeconds: exp.time,
      });
    }
  }

  const extras: ExtraNote[] = [];
  for (let pi = 0; pi < played.length; pi++) {
    if (!usedPlayed.has(pi)) {
      const p = played[pi];
      extras.push({
        note: p.note,
        timeSeconds: p.time,
        velocity: p.velocity,
      });
    }
  }

  // Timing issues (matched notes with significant error)
  const timingIssues: TimingIssue[] = matches
    .filter(m => Math.abs(m.timingErrorMs) > 50) // >50ms is noticeable
    .map(m => ({
      measure: m.expected.measure,
      notation: m.expected.notation,
      expectedMs: m.expected.time * 1000,
      actualMs: m.played.time * 1000,
      errorMs: m.timingErrorMs,
    }))
    .sort((a, b) => Math.abs(b.errorMs) - Math.abs(a.errorMs))
    .slice(0, 20); // top 20 worst

  // Calculate metrics
  const pitchCorrectCount = matches.filter(m => m.pitchCorrect).length;
  const pitchAccuracy = matches.length > 0
    ? (pitchCorrectCount / matches.length) * 100
    : 0;

  const avgTimingError = matches.length > 0
    ? matches.reduce((sum, m) => sum + Math.abs(m.timingErrorMs), 0) / matches.length
    : 0;

  const completeness = expected.length > 0
    ? (matches.length / expected.length) * 100
    : 100;

  // Overall score: weighted combination
  const overallScore = Math.round(
    pitchAccuracy * 0.4 +
    completeness * 0.4 +
    Math.max(0, 100 - avgTimingError) * 0.2
  );

  // Generate feedback
  const feedback = generateFeedback(
    overallScore, pitchAccuracy, avgTimingError, completeness,
    missed, extras, timingIssues, song,
  );

  // Per-note verdicts (additive — see NoteVerdict doc comment). Reuses
  // `scoredAtBpm` (resolved once, above) so greenMs scales off the
  // identical tempo the expected notes' times were computed from.
  const { greenMs } = computeVerdictWindows(scoredAtBpm, toleranceMs);
  const noteVerdicts: NoteVerdict[] = expected.map((exp, ei) => {
    const match = matchByExpectedIndex.get(ei);
    if (!match || !match.pitchCorrect) {
      // Unmatched, or matched at the wrong pitch — both read as "missed"
      // from the performer's perspective (finding 33), even though a
      // wrong-pitch near-match is still `matched` for pitchAccuracy/
      // completeness above (unchanged, preserved current scorer behavior).
      return {
        measure: exp.measure,
        notation: exp.notation,
        midi: exp.note,
        startSec: exp.time,
        status: "missed",
      };
    }
    const offsetMs = match.timingErrorMs;
    const status: NoteVerdict["status"] = Math.abs(offsetMs) <= greenMs ? "correct" : "timing";
    return {
      measure: exp.measure,
      notation: exp.notation,
      midi: exp.note,
      startSec: exp.time,
      status,
      offsetMs,
    };
  });

  return {
    songId: song.id,
    songTitle: song.title,
    metrics: {
      overallScore,
      pitchAccuracy: Math.round(pitchAccuracy),
      timingAccuracyMs: Math.round(avgTimingError),
      completeness: Math.round(completeness),
      extraNoteCount: extras.length,
    },
    details: {
      totalExpected: expected.length,
      totalPlayed: played.length,
      matched: matches.length,
      missed: missed.slice(0, 30), // limit output size
      extras: extras.slice(0, 20),
      timingIssues,
      noteVerdicts,
      scoredAtBpm,
    },
    feedback,
  };
}

// ─── Feedback generator ─────────────────────────────────────────────────────

function generateFeedback(
  overall: number,
  pitchAcc: number,
  timingMs: number,
  completeness: number,
  missed: MissedNote[],
  extras: ExtraNote[],
  timingIssues: TimingIssue[],
  song: SongEntry,
): string {
  const lines: string[] = [];

  // Grade
  const grade = overall >= 90 ? "A" : overall >= 80 ? "B" : overall >= 70 ? "C"
    : overall >= 60 ? "D" : "F";
  lines.push(`## Performance: ${grade} (${overall}/100)`);
  lines.push("");

  // Summary
  lines.push(`**Pitch accuracy:** ${Math.round(pitchAcc)}%`);
  lines.push(`**Timing accuracy:** ±${Math.round(timingMs)}ms average`);
  lines.push(`**Completeness:** ${Math.round(completeness)}%`);
  if (extras.length > 0) {
    lines.push(`**Extra notes:** ${extras.length} (not in score)`);
  }
  lines.push("");

  // Missed notes by measure
  if (missed.length > 0) {
    const byMeasure = new Map<number, MissedNote[]>();
    for (const m of missed) {
      const arr = byMeasure.get(m.measure) ?? [];
      arr.push(m);
      byMeasure.set(m.measure, arr);
    }
    lines.push("### Missed Notes");
    for (const [measure, notes] of [...byMeasure.entries()].slice(0, 10)) {
      const noteList = notes.map(n => `${n.notation} (${n.hand})`).join(", ");
      lines.push(`- Measure ${measure}: ${noteList}`);
    }
    if (byMeasure.size > 10) {
      lines.push(`- ...and ${byMeasure.size - 10} more measures with missed notes`);
    }
    lines.push("");
  }

  // Timing issues
  if (timingIssues.length > 0) {
    lines.push("### Timing Issues (worst offenders)");
    for (const issue of timingIssues.slice(0, 5)) {
      const direction = issue.errorMs > 0 ? "late" : "early";
      lines.push(`- Measure ${issue.measure}: ${issue.notation} was ${Math.abs(Math.round(issue.errorMs))}ms ${direction}`);
    }
    lines.push("");
  }

  // Suggestions
  lines.push("### Practice Suggestions");
  if (completeness < 80) {
    lines.push("- Focus on note accuracy — many notes were missed. Try at a slower tempo.");
  }
  if (timingMs > 100) {
    lines.push("- Work on timing with a metronome. Practice at 50% speed first.");
  }
  if (missed.length > 0) {
    const worstMeasures = [...new Set(missed.map(m => m.measure))].slice(0, 3);
    lines.push(`- Drill measures ${worstMeasures.join(", ")} — these had the most missed notes.`);
  }
  if (overall >= 90) {
    lines.push("- Excellent work! Try increasing the tempo or tackling a harder piece.");
  }

  return lines.join("\n");
}
