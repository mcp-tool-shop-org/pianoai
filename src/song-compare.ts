// ─── ai-jam-sessions: Cross-Genre Song Comparison ─────────────────────────────
//
// Compares two songs to surface shared harmonic, structural, and rhythmic
// patterns. Helps the AI recognize that "Autumn Leaves" and "Fly Me to the
// Moon" share ii-V-I progressions, or that a ragtime piece and a pop song
// both use syncopation over a steady bass.
//
// Analysis dimensions:
//   1. Key & mode relationship
//   2. Tempo & rhythmic similarity
//   3. Pitch class distribution (what notes are used most)
//   4. Interval profile (stepwise vs leaps)
//   5. Structural form comparison
//   6. Shared tags/concepts
// ─────────────────────────────────────────────────────────────────────────────

import type { SongEntry, Measure } from "./songs/types.js";
import { parseNoteToMidi } from "./note-parser.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SongComparison {
  songA: { id: string; title: string; genre: string; key: string };
  songB: { id: string; title: string; genre: string; key: string };

  similarities: string[];
  differences: string[];
  sharedPatterns: string[];
  teachingConnections: string[];

  metrics: {
    pitchClassSimilarity: number;   // 0–1 cosine similarity
    intervalSimilarity: number;     // 0–1 cosine similarity
    tempoRatio: number;             // ratio of tempos
    sharedTags: string[];
    keyRelationship: string;
  };
}

// ─── Pitch class analysis ───────────────────────────────────────────────────

const PITCH_CLASS_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function extractPitchClasses(measures: Measure[]): number[] {
  const counts = new Array(12).fill(0);
  for (const m of measures) {
    for (const hand of [m.rightHand, m.leftHand]) {
      if (!hand) continue;
      const tokens = hand.trim().split(/\s+/);
      for (const token of tokens) {
        const parts = token.includes("+") ? token.split("+") : [token];
        for (const part of parts) {
          const noteStr = part.includes(":") ? part.split(":")[0] : part;
          try {
            const midi = parseNoteToMidi(noteStr);
            if (midi >= 0) counts[midi % 12]++;
          } catch { /* skip unparseable */ }
        }
      }
    }
  }
  return counts;
}

function extractIntervals(measures: Measure[]): number[] {
  // Count intervals between consecutive melodic notes (right hand)
  const intervalCounts = new Array(13).fill(0); // 0-12 semitones
  for (const m of measures) {
    if (!m.rightHand) continue;
    const tokens = m.rightHand.trim().split(/\s+/);
    let prevMidi = -1;
    for (const token of tokens) {
      const noteStr = token.includes(":") ? token.split(":")[0] : token;
      if (token.includes("+")) continue; // skip chords for interval analysis
      try {
        const midi = parseNoteToMidi(noteStr);
        if (midi >= 0 && prevMidi >= 0) {
          const interval = Math.min(Math.abs(midi - prevMidi), 12);
          intervalCounts[interval]++;
        }
        if (midi >= 0) prevMidi = midi;
      } catch { /* skip */ }
    }
  }
  return intervalCounts;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// ─── Key analysis ───────────────────────────────────────────────────────────

const KEY_TO_PITCH_CLASS: Record<string, number> = {
  "C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3,
  "E": 4, "F": 5, "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8,
  "A": 9, "A#": 10, "Bb": 10, "B": 11,
};

function parseKey(keyStr: string): { root: number; mode: string } | null {
  const match = keyStr.match(/^([A-G][#b]?)\s*(major|minor|dorian|mixolydian|lydian|phrygian)?/i);
  if (!match) return null;
  const root = KEY_TO_PITCH_CLASS[match[1]];
  if (root === undefined) return null;
  return { root, mode: (match[2] ?? "major").toLowerCase() };
}

/**
 * Describe the harmonic relationship between two keys.
 * Returns a human-readable label. If either key cannot be parsed,
 * returns "unknown" — callers must handle this as a valid result,
 * not as an error.
 */
function describeKeyRelationship(keyA: string, keyB: string): string {
  const a = parseKey(keyA);
  const b = parseKey(keyB);
  if (!a || !b) return "unknown";

  if (a.root === b.root && a.mode === b.mode) return "same key";
  if (a.root === b.root) return "parallel keys (same root, different mode)";

  // Relative major/minor
  if (a.mode === "minor" && b.mode === "major" && (a.root + 3) % 12 === b.root) return "relative keys";
  if (a.mode === "major" && b.mode === "minor" && (b.root + 3) % 12 === a.root) return "relative keys";

  const interval = (b.root - a.root + 12) % 12;
  if (interval === 7 || interval === 5) return "fifth apart (closely related)";
  if (interval === 2 || interval === 10) return "whole step apart";
  if (interval === 1 || interval === 11) return "half step apart (distant)";
  if (interval === 6) return "tritone apart (maximally distant)";

  return `${interval} semitones apart`;
}

// ─── Main comparison ────────────────────────────────────────────────────────

export function compareSongs(songA: SongEntry, songB: SongEntry): SongComparison {
  const similarities: string[] = [];
  const differences: string[] = [];
  const sharedPatterns: string[] = [];
  const teachingConnections: string[] = [];

  // Key relationship
  const keyRel = describeKeyRelationship(songA.key, songB.key);

  // Tempo comparison. Guard against a non-positive tempo (malformed song
  // data) the same way unparseable keys are already treated as "unknown"
  // elsewhere in this file — otherwise tempoRatio becomes Infinity and the
  // formatted text reads "ratio Infinityx" (F-4ed34654).
  const hasValidTempo = songA.tempo > 0 && songB.tempo > 0;
  const tempoRatio = hasValidTempo
    ? Math.max(songA.tempo, songB.tempo) / Math.min(songA.tempo, songB.tempo)
    : 1;

  if (!hasValidTempo) {
    // Skip — can't meaningfully compare a non-positive tempo.
  } else if (tempoRatio <= 1.15) {
    similarities.push(`Similar tempo (${songA.title}: ${songA.tempo} BPM, ${songB.title}: ${songB.tempo} BPM)`);
  } else {
    differences.push(`Different tempos (${songA.title}: ${songA.tempo} BPM, ${songB.title}: ${songB.tempo} BPM, ratio ${tempoRatio.toFixed(1)}x)`);
  }

  // Time signature
  if (songA.timeSignature === songB.timeSignature) {
    similarities.push(`Same time signature: ${songA.timeSignature}`);
  } else {
    differences.push(`Different time signatures: ${songA.title} is ${songA.timeSignature}, ${songB.title} is ${songB.timeSignature}`);
  }

  // Key
  if (keyRel === "same key") {
    similarities.push(`Same key: ${songA.key}`);
  } else if (keyRel === "relative keys" || keyRel.includes("closely related")) {
    similarities.push(`Keys are ${keyRel}: ${songA.key} ↔ ${songB.key}`);
    teachingConnections.push(`These songs are in ${keyRel} (${songA.key} and ${songB.key}) — practicing one helps with the other`);
  } else {
    differences.push(`Keys: ${songA.key} and ${songB.key} (${keyRel})`);
  }

  // Genre
  if (songA.genre === songB.genre) {
    similarities.push(`Same genre: ${songA.genre}`);
  } else {
    teachingConnections.push(`Cross-genre comparison: ${songA.genre} vs ${songB.genre} — look for patterns that transcend genre boundaries`);
  }

  // Difficulty
  if (songA.difficulty === songB.difficulty) {
    similarities.push(`Same difficulty: ${songA.difficulty}`);
  }

  // Shared tags
  const tagsA = new Set(songA.tags);
  const sharedTags = songB.tags.filter(t => tagsA.has(t));
  if (sharedTags.length > 0) {
    similarities.push(`Shared tags: ${sharedTags.join(", ")}`);
  }

  // Pitch class analysis
  const pcA = extractPitchClasses(songA.measures);
  const pcB = extractPitchClasses(songB.measures);
  const pcSim = cosineSimilarity(pcA, pcB);

  if (pcSim > 0.9) {
    sharedPatterns.push("Very similar pitch class distribution — these songs use the same notes in similar proportions");
  } else if (pcSim > 0.7) {
    sharedPatterns.push("Moderately similar pitch usage");
  }

  // Find dominant pitch classes for each
  const topPcA = getTopPitchClasses(pcA, 3);
  const topPcB = getTopPitchClasses(pcB, 3);
  const sharedTopPc = topPcA.filter(pc => topPcB.includes(pc));
  if (sharedTopPc.length >= 2) {
    sharedPatterns.push(`Both songs heavily use: ${sharedTopPc.map(pc => PITCH_CLASS_NAMES[pc]).join(", ")}`);
  }

  // Interval analysis
  const intA = extractIntervals(songA.measures);
  const intB = extractIntervals(songB.measures);
  const intSim = cosineSimilarity(intA, intB);

  if (intSim > 0.85) {
    sharedPatterns.push("Very similar melodic interval patterns — similar mix of steps and leaps");
  } else if (intSim > 0.65) {
    sharedPatterns.push("Moderately similar interval usage");
  }

  // Stepwise vs. leaping comparison
  const stepwiseA = (intA[1] + intA[2]) / Math.max(1, intA.reduce((s, v) => s + v, 0));
  const stepwiseB = (intB[1] + intB[2]) / Math.max(1, intB.reduce((s, v) => s + v, 0));

  if (stepwiseA > 0.5 && stepwiseB > 0.5) {
    sharedPatterns.push("Both melodies are predominantly stepwise (conjunct motion) — good for vocal/singing practice");
  } else if (stepwiseA < 0.3 && stepwiseB < 0.3) {
    sharedPatterns.push("Both melodies use frequent leaps (disjunct motion) — technically demanding");
  } else if (Math.abs(stepwiseA - stepwiseB) > 0.3) {
    differences.push(`Different melodic character: ${songA.title} is ${stepwiseA > 0.5 ? "stepwise" : "leaping"}, ${songB.title} is ${stepwiseB > 0.5 ? "stepwise" : "leaping"}`);
  }

  // Structure comparison via musicalLanguage
  if (songA.musicalLanguage?.structure && songB.musicalLanguage?.structure) {
    const structA = songA.musicalLanguage.structure.toLowerCase();
    const structB = songB.musicalLanguage.structure.toLowerCase();

    // Check for shared form types
    const forms = ["aaba", "aba", "rondo", "sonata", "binary", "ternary", "12-bar", "32-bar", "verse-chorus"];
    for (const form of forms) {
      if (structA.includes(form) && structB.includes(form)) {
        sharedPatterns.push(`Both use ${form.toUpperCase()} form`);
        teachingConnections.push(`These songs share ${form.toUpperCase()} form — compare how each composer uses the same structural template`);
      }
    }
  }

  // Teaching connections from shared teaching goals
  if (songA.musicalLanguage?.teachingGoals && songB.musicalLanguage?.teachingGoals) {
    const goalsA = songA.musicalLanguage.teachingGoals.join(" ").toLowerCase();
    const goalsB = songB.musicalLanguage.teachingGoals.join(" ").toLowerCase();

    const concepts = [
      { term: "voice.?leading", label: "voice leading" },
      { term: "pedal", label: "pedaling technique" },
      { term: "dynamics", label: "dynamic control" },
      { term: "syncopat", label: "syncopation" },
      { term: "arpeggio", label: "arpeggios" },
      { term: "left.?hand", label: "left-hand technique" },
      { term: "legato", label: "legato playing" },
      { term: "rhythm", label: "rhythmic skills" },
      { term: "ii-V-I|ii.V.I", label: "ii-V-I progressions" },
      { term: "touch", label: "touch/articulation" },
    ];

    for (const { term, label } of concepts) {
      if (new RegExp(term, "i").test(goalsA) && new RegExp(term, "i").test(goalsB)) {
        teachingConnections.push(`Both teach ${label} — practice them together to reinforce the skill`);
      }
    }
  }

  // Length comparison
  const lengthRatio = Math.max(songA.measures.length, songB.measures.length) /
    Math.max(1, Math.min(songA.measures.length, songB.measures.length));
  if (lengthRatio <= 1.3) {
    similarities.push(`Similar length (~${songA.measures.length} vs ~${songB.measures.length} measures)`);
  }

  return {
    songA: { id: songA.id, title: songA.title, genre: songA.genre, key: songA.key },
    songB: { id: songB.id, title: songB.title, genre: songB.genre, key: songB.key },
    similarities,
    differences,
    sharedPatterns,
    teachingConnections,
    metrics: {
      pitchClassSimilarity: Math.round(pcSim * 100) / 100,
      intervalSimilarity: Math.round(intSim * 100) / 100,
      tempoRatio: Math.round(tempoRatio * 100) / 100,
      sharedTags,
      keyRelationship: keyRel,
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getTopPitchClasses(counts: number[], n: number): number[] {
  return counts
    .map((count, idx) => ({ count, idx }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .filter(x => x.count > 0)
    .map(x => x.idx);
}

// ─── Formatter ──────────────────────────────────────────────────────────────

export function formatComparison(comp: SongComparison): string {
  const lines: string[] = [];

  lines.push(`# Song Comparison`);
  lines.push("");
  lines.push(`**${comp.songA.title}** (${comp.songA.genre}, ${comp.songA.key})`);
  lines.push(`vs.`);
  lines.push(`**${comp.songB.title}** (${comp.songB.genre}, ${comp.songB.key})`);
  lines.push("");

  // Metrics
  lines.push("## Metrics");
  lines.push(`- Key relationship: ${comp.metrics.keyRelationship}`);
  lines.push(`- Pitch similarity: ${Math.round(comp.metrics.pitchClassSimilarity * 100)}%`);
  lines.push(`- Interval similarity: ${Math.round(comp.metrics.intervalSimilarity * 100)}%`);
  lines.push(`- Tempo ratio: ${comp.metrics.tempoRatio}x`);
  if (comp.metrics.sharedTags.length > 0) {
    lines.push(`- Shared tags: ${comp.metrics.sharedTags.join(", ")}`);
  }
  lines.push("");

  if (comp.similarities.length > 0) {
    lines.push("## Similarities");
    for (const s of comp.similarities) lines.push(`- ${s}`);
    lines.push("");
  }

  if (comp.sharedPatterns.length > 0) {
    lines.push("## Shared Musical Patterns");
    for (const p of comp.sharedPatterns) lines.push(`- ${p}`);
    lines.push("");
  }

  if (comp.differences.length > 0) {
    lines.push("## Differences");
    for (const d of comp.differences) lines.push(`- ${d}`);
    lines.push("");
  }

  if (comp.teachingConnections.length > 0) {
    lines.push("## Teaching Connections");
    for (const t of comp.teachingConnections) lines.push(`- ${t}`);
    lines.push("");
  }

  return lines.join("\n");
}
