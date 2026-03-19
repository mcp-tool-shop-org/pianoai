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

export function flattenSongToExpected(song: SongEntry, bpm?: number): ExpectedNote[] {
  const effectiveBpm = bpm ?? song.tempo;
  const notes: ExpectedNote[] = [];
  let measureStartTime = 0;

  // Parse time signature for measure duration
  const [beatsNum] = song.timeSignature.split("/").map(Number);
  const beatsPerMeasure = beatsNum || 4;
  const measureDurationSec = (beatsPerMeasure * 60) / effectiveBpm;

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

// ─── Match played notes to expected notes ───────────────────────────────────

export function scorePerformance(
  song: SongEntry,
  playedEvents: MidiNoteEvent[],
  options: { toleranceMs?: number; bpm?: number } = {},
): PerformanceResult {
  const toleranceMs = options.toleranceMs ?? 150;
  const toleranceSec = toleranceMs / 1000;

  const expected = flattenSongToExpected(song, options.bpm);
  const played = [...playedEvents]
    .filter(e => e.velocity > 0)
    .sort((a, b) => a.time - b.time);

  const matches: NoteMatch[] = [];
  const usedPlayed = new Set<number>();
  const matchedExpected = new Set<number>();

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
      matches.push({
        expected: exp,
        played: p,
        timingErrorMs: (p.time - exp.time) * 1000,
        pitchCorrect: p.note === exp.note,
      });
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
