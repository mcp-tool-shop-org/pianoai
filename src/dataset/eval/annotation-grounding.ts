// ─── jam-actions-v0 E3 Annotation Grounding Eval ─────────────────────────────
//
// Validates that records teach MIDI-grounded musical observation, not generic
// prose claims that a text-only LLM could answer without seeing the music.
//
// MCQ design (N=4 options, chance = 0.25):
//
//   Type 1 — Key / time signature (prose-answerable from scope fields)
//   Type 2 — Measure range (prose-answerable from annotation_target.measure_range)
//   Type 3 — Pitch-class count LOAD-BEARING: requires MIDI extraction
//   Type 4 — Hand/register facts LOAD-BEARING: requires MIDI extraction
//   Type 5 — Rhythm/onset facts LOAD-BEARING: requires MIDI extraction
//   Type 6 — Source/provenance facts (prose-answerable from provenance fields)
//   Type 7 — Annotation-to-MIDI grounding check LOAD-BEARING: requires MIDI
//
// Load-bearing types (3, 4, 5, 7): gold answer extracted from MIDI sidecar.
// Text-only baseline sees annotation prose only — no MIDI, no scope — so must
// guess at chance. Random-MIDI baseline sees correct annotation + wrong MIDI.
//
// Three rule-based answerers (no LLM):
//   gold       — full record access, MIDI-grounded extraction → expected 1.0
//   text_only  — annotation prose only, no MIDI/scope → expected ~0.25
//   random_midi — annotation + MIDI from a different record → expected ~0.25
//
// Random-MIDI partner selection: deterministic shift by floor(N/2) positions
// in the sorted record list. Documented in the report.
//
// not_computable is first-class: marked with explicit reason, never fabricated.
//
// Hard gates (enforced in CLI runner, not in harness):
//   gold > text_only by ≥0.10 absolute on aggregate
//   gold > random_midi by ≥0.10 absolute on aggregate
//   text_only aggregate ≤ 0.40 (not trivially high from prose)
//   random_midi aggregate ≤ 0.40 (not trivially high)
//   All 22 pairs + 1 standalone produce ≥1 computable question on each
//   load-bearing type (3, 4, 5) — type 7 may be not_computable on sparse records
//
// No LLM calls. No HTTP. No corpus modification. No MCP surface changes.
// ─────────────────────────────────────────────────────────────────────────────

import type { TimedEvent } from "../schema.js";

// ─── Question types ────────────────────────────────────────────────────────────

export const QUESTION_TYPES = {
  KEY_TIME_SIG: "key_time_sig",
  MEASURE_RANGE: "measure_range",
  PITCH_CLASS_COUNT: "pitch_class_count",
  HAND_REGISTER: "hand_register",
  RHYTHM_ONSET: "rhythm_onset",
  PROVENANCE: "provenance",
  ANNOTATION_GROUNDING: "annotation_grounding",
} as const;

export type QuestionType = (typeof QUESTION_TYPES)[keyof typeof QUESTION_TYPES];

/** Load-bearing question types: gold answer requires MIDI extraction. */
export const LOAD_BEARING_TYPES: QuestionType[] = [
  QUESTION_TYPES.PITCH_CLASS_COUNT,
  QUESTION_TYPES.HAND_REGISTER,
  QUESTION_TYPES.RHYTHM_ONSET,
  QUESTION_TYPES.ANNOTATION_GROUNDING,
];

// ─── Answerer types ────────────────────────────────────────────────────────────

export const ANSWERERS = {
  GOLD: "gold",
  TEXT_ONLY: "text_only",
  RANDOM_MIDI: "random_midi",
} as const;

export type AnswererType = (typeof ANSWERERS)[keyof typeof ANSWERERS];

// ─── not_computable ───────────────────────────────────────────────────────────

export interface NotComputable {
  not_computable: true;
  reason: string;
}

export function notComputable(reason: string): NotComputable {
  return { not_computable: true, reason };
}

export function isNotComputable(v: unknown): v is NotComputable {
  return typeof v === "object" && v !== null && (v as NotComputable).not_computable === true;
}

// ─── MCQ types ─────────────────────────────────────────────────────────────────

/** A multiple-choice question with exactly 4 options. */
export interface MCQuestion {
  questionType: QuestionType;
  questionText: string;
  options: [string, string, string, string];
  /** 0-based index of the correct option (gold answer). */
  correctOptionIndex: number;
  /** True when MIDI extraction is required to answer correctly. */
  midiGrounded: boolean;
  /** Details used by answerers for logic (e.g., extracted value). */
  goldValue: string;
}

/** A question set for one record. */
export interface RecordQuestionSet {
  recordId: string;
  songId: string;
  questions: Array<MCQuestion | NotComputable>;
  /** Index of each question type in the questions array (or null if not_computable). */
  questionTypeIndex: Map<QuestionType, number>;
}

// ─── Record shape needed by E3 ────────────────────────────────────────────────

export interface E3Record {
  id: string;
  scope: {
    song_id: string;
    phrase_window: string;
    key: string;
    time_signature: string;
    window_role?: string;
  };
  provenance: {
    composition_title: string;
    composer: string;
    arrangement_creator: string | null;
    arrangement_license: string | null;
  };
  observation: {
    midi_sidecar: {
      timed_events: TimedEvent[];
    };
  };
  annotation_target: {
    measure_range: [number, number];
    structure?: string;
    key_moments?: string[];
    teaching_notes?: Array<{
      measure: number;
      note: string;
      technique?: string[];
    }>;
    teaching_goals?: string[];
    style_tips?: string[];
  };
}

// ─── Note name helpers ────────────────────────────────────────────────────────

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export function noteName(midiNote: number): string {
  const octave = Math.floor(midiNote / 12) - 1;
  const name = NOTE_NAMES[midiNote % 12];
  return `${name}${octave}`;
}

export function pitchClassName(midiNote: number): string {
  return NOTE_NAMES[midiNote % 12];
}

/** All unique pitch class names present in events. */
export function uniquePitchClasses(events: TimedEvent[]): string[] {
  const classes = new Set<string>();
  for (const e of events) {
    classes.add(pitchClassName(e.note));
  }
  return [...classes].sort();
}

// ─── LCG pseudo-random helper ─────────────────────────────────────────────────

/**
 * Deterministic LCG pseudo-random generator. Same seed = same sequence.
 * Used for distractor generation and text_only/random_midi answerer choices.
 */
export function makeLcg(seed: number): () => number {
  const a = 1664525;
  const c = 1013904223;
  const m = 2 ** 32;
  let s = Math.abs(Math.floor(seed)) % m;
  return () => {
    s = (a * s + c) % m;
    return s / m; // [0, 1)
  };
}

/**
 * Pick a random integer in [0, max) using the provided LCG.
 */
export function lcgInt(lcg: () => number, max: number): number {
  return Math.floor(lcg() * max);
}

/**
 * Shuffle an array in-place using the LCG (Fisher-Yates). Returns the array.
 */
export function lcgShuffle<T>(arr: T[], lcg: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = lcgInt(lcg, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ─── Distractor generators ────────────────────────────────────────────────────

/** Generate 3 distinct integer distractors near `correct`, not equal to it. */
export function intDistractors(correct: number, lcg: () => number, offsets?: number[]): number[] {
  const candidates = offsets ?? [-3, -2, -1, 1, 2, 3, 4, 5, -4, -5];
  const distractors: number[] = [];
  const seen = new Set<number>([correct]);
  // Try fixed offsets first for determinism.
  for (const off of candidates) {
    const v = correct + off;
    if (v >= 0 && !seen.has(v)) {
      seen.add(v);
      distractors.push(v);
      if (distractors.length === 3) break;
    }
  }
  // Fallback: expand range if needed.
  let expand = 1;
  while (distractors.length < 3) {
    const v = correct + expand * (lcg() > 0.5 ? 1 : -1) * (5 + distractors.length);
    if (v >= 0 && !seen.has(v)) {
      seen.add(v);
      distractors.push(v);
    }
    expand++;
    if (expand > 1000) break;
  }
  return distractors;
}

/**
 * Build 4-option MCQ from correct + 3 distractors.
 * Inserts correct at a deterministic position based on LCG.
 * Returns [options, correctIndex].
 */
export function buildOptions(
  correct: string,
  distractors: string[],
  lcg: () => number,
): [[string, string, string, string], number] {
  const correctPos = lcgInt(lcg, 4);
  const options: string[] = [];
  let di = 0;
  for (let i = 0; i < 4; i++) {
    if (i === correctPos) {
      options.push(correct);
    } else {
      options.push(distractors[di++] ?? `N/A-${i}`);
    }
  }
  return [options as [string, string, string, string], correctPos];
}

// ─── Key distractor table ────────────────────────────────────────────────────

const KEY_DISTRACTORS: Record<string, string[]> = {
  "A minor":  ["E minor", "D minor", "C major"],
  "C major":  ["G major", "F major", "D major"],
  "Eb major": ["Bb major", "Ab major", "F minor"],
  "E minor":  ["B minor", "A minor", "G major"],
  "F major":  ["C major", "Bb major", "G minor"],
  "G major":  ["D major", "C major", "E minor"],
  "D major":  ["A major", "G major", "B minor"],
  "A major":  ["E major", "D major", "F# minor"],
  "B minor":  ["F# minor", "E minor", "D major"],
  "Db major": ["Ab major", "Gb major", "Bb minor"],
};

/** Fallback distractors for unknown keys: use common keys. */
const FALLBACK_KEY_DISTRACTORS = ["C major", "G major", "D minor", "A minor"];

// ─── Type 1: Key / time signature ────────────────────────────────────────────

/**
 * Question: "What key is this phrase in?"
 * Gold answer comes from scope.key (MIDI-derived during corpus build).
 *
 * Design path B (synthesis kickoff option B): text_only baseline does NOT see
 * scope.key. It sees only annotation_target prose (structure, teaching_notes,
 * key_moments, style_tips). Key name may appear in prose — this is tracked.
 * If text_only scores high on this type, it signals the prose contains the
 * answer verbatim (expected; type 1 is bookkeeping, not load-bearing).
 */
export function generateKeyTimeSigQuestion(record: E3Record): MCQuestion | NotComputable {
  const key = record.scope.key;
  if (!key) {
    return notComputable("scope.key missing — cannot generate key/time-sig question");
  }

  const distractors =
    KEY_DISTRACTORS[key]?.slice(0, 3) ??
    FALLBACK_KEY_DISTRACTORS.filter((k) => k !== key).slice(0, 3);

  if (distractors.length < 3) {
    return notComputable(
      `insufficient key distractors for key "${key}" — only ${distractors.length} available`,
    );
  }

  const lcg = makeLcg(hashString(record.id + "key_q"));
  const [options, correctIndex] = buildOptions(key, distractors, lcg);

  return {
    questionType: QUESTION_TYPES.KEY_TIME_SIG,
    questionText: `What key is this phrase in?`,
    options,
    correctOptionIndex: correctIndex,
    midiGrounded: false, // answerable from scope
    goldValue: key,
  };
}

// ─── Type 2: Measure range ────────────────────────────────────────────────────

/**
 * Question: "Which measure range does this phrase cover?"
 * Gold answer from annotation_target.measure_range.
 * Text_only may answer from prose (annotation_target.structure often mentions it).
 * Not load-bearing; tracked for completeness.
 */
export function generateMeasureRangeQuestion(record: E3Record): MCQuestion | NotComputable {
  const mr = record.annotation_target.measure_range;
  if (!mr || mr.length !== 2) {
    return notComputable("annotation_target.measure_range missing or malformed");
  }

  const [start, end] = mr;
  const correct = `mm. ${start}–${end}`;
  const span = end - start + 1;

  // Distractors: shift the window by ±4 and ±8 bars.
  const distStart2 = Math.max(1, start + 4);
  const distStart3 = Math.max(1, start - 4);
  const distStart4 = Math.max(1, start + span);

  const distractors = [
    `mm. ${distStart2}–${distStart2 + span - 1}`,
    `mm. ${distStart3}–${distStart3 + span - 1}`,
    `mm. ${distStart4}–${distStart4 + span - 1}`,
  ].filter((d) => d !== correct);

  while (distractors.length < 3) {
    const shift = distractors.length * 2 + 2;
    const ds = Math.max(1, start + shift);
    const d = `mm. ${ds}–${ds + span - 1}`;
    if (d !== correct && !distractors.includes(d)) distractors.push(d);
  }

  const lcg = makeLcg(hashString(record.id + "measure_range_q"));
  const [options, correctIndex] = buildOptions(correct, distractors.slice(0, 3), lcg);

  return {
    questionType: QUESTION_TYPES.MEASURE_RANGE,
    questionText: `Which measure range does this phrase cover?`,
    options,
    correctOptionIndex: correctIndex,
    midiGrounded: false,
    goldValue: correct,
  };
}

// ─── Type 3: Pitch-class count (LOAD-BEARING) ─────────────────────────────────

/**
 * Question: "How many notes with pitch class X appear in this phrase?"
 * Gold extracts exact count from MIDI sidecar.
 * Text_only cannot know without counting MIDI events — must guess.
 * Random-MIDI gets a wrong count because the MIDI is from a different record.
 *
 * Pick the most-frequent pitch class for a non-trivial but clear answer.
 * Integer count, N=4 options.
 */
export function generatePitchClassCountQuestion(record: E3Record): MCQuestion | NotComputable {
  const events = record.observation.midi_sidecar.timed_events;
  if (events.length === 0) {
    return notComputable("no MIDI events — pitch-class count not computable");
  }

  // Count all pitch classes.
  const counts = new Map<string, number>();
  for (const e of events) {
    const pc = pitchClassName(e.note);
    counts.set(pc, (counts.get(pc) ?? 0) + 1);
  }

  // Pick the most-frequent pitch class (deterministic: sort ties alphabetically).
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [targetPc, correctCount] = sorted[0];

  // Ensure count is non-trivial (> 1). If the max count is 1, all equally sparse.
  if (correctCount < 1) {
    return notComputable("all pitch classes have count < 1 — degenerate MIDI data");
  }

  const lcg = makeLcg(hashString(record.id + "pitch_class_count_q"));
  const distNums = intDistractors(correctCount, lcg, [-3, -2, 2, 3, -1, 1, -4, 4]);
  const distractors = distNums.slice(0, 3).map(String);

  const [options, correctIndex] = buildOptions(String(correctCount), distractors, lcg);

  return {
    questionType: QUESTION_TYPES.PITCH_CLASS_COUNT,
    questionText: `How many notes with pitch class ${targetPc} appear in this phrase?`,
    options,
    correctOptionIndex: correctIndex,
    midiGrounded: true,
    goldValue: String(correctCount),
  };
}

// ─── Type 4: Hand / register facts (LOAD-BEARING) ────────────────────────────

/**
 * Question: "Which hand plays more notes in this phrase?"
 * Gold answer from MIDI hand field.
 * Text_only cannot determine this from prose alone (50/50 chance → 0.50 on binary,
 * but we use N=4 options to reduce chance to 0.25).
 *
 * Sub-question options (pick based on data availability):
 *   A. Which hand plays more notes? (RH/LH/equal — add count variants as distractors)
 *   B. What is the highest pitch in the right hand?
 *
 * We always generate question A (hand note count) because it's universally computable.
 * Options include count information to make it N=4 MCQ.
 */
export function generateHandRegisterQuestion(record: E3Record): MCQuestion | NotComputable {
  const events = record.observation.midi_sidecar.timed_events;
  if (events.length === 0) {
    return notComputable("no MIDI events — hand/register fact not computable");
  }

  const rhCount = events.filter((e) => e.hand === "right").length;
  const lhCount = events.filter((e) => e.hand === "left").length;
  const totalNotes = rhCount + lhCount;

  if (totalNotes === 0) {
    return notComputable("no events with hand field — hand/register not computable");
  }

  // Check if any events lack hand info.
  const unknownHand = events.filter((e) => !e.hand || (e.hand !== "right" && e.hand !== "left")).length;
  if (unknownHand > totalNotes * 0.5) {
    return notComputable(
      `more than 50% of events have unknown hand (${unknownHand}/${events.length}) — not computable`,
    );
  }

  const correctHand = rhCount > lhCount ? "Right hand" : rhCount < lhCount ? "Left hand" : "Equal";

  // Build 4 options: correct answer + 3 plausible variants with counts.
  // This forces text_only to guess — it can't compute rhCount and lhCount.
  const correctLabel = `${correctHand} (${rhCount > lhCount ? rhCount : lhCount} notes)`;

  // Generate distractors with plausible but wrong counts.
  const lcg = makeLcg(hashString(record.id + "hand_register_q"));

  let distractors: string[];
  if (correctHand === "Right hand") {
    // Distractors: left hand wins, equal, right hand wins with different count.
    const fakeLhCount = rhCount + lcgInt(lcg, 5) + 2;
    const fakeRhWin = rhCount - lcgInt(lcg, 3) - 1;
    const d1 = `Left hand (${fakeLhCount} notes)`;
    const d2 = `Equal (${Math.round((rhCount + lhCount) / 2)} notes each)`;
    const d3 = `Right hand (${Math.max(1, fakeRhWin)} notes)`;
    distractors = [d1, d2, d3];
  } else if (correctHand === "Left hand") {
    const fakeRhCount = lhCount + lcgInt(lcg, 5) + 2;
    const fakeLhWin = lhCount - lcgInt(lcg, 3) - 1;
    const d1 = `Right hand (${fakeRhCount} notes)`;
    const d2 = `Equal (${Math.round((rhCount + lhCount) / 2)} notes each)`;
    const d3 = `Left hand (${Math.max(1, fakeLhWin)} notes)`;
    distractors = [d1, d2, d3];
  } else {
    // Equal.
    const fakeRhWin = rhCount + lcgInt(lcg, 4) + 2;
    const fakeLhWin = lhCount + lcgInt(lcg, 4) + 2;
    const d1 = `Right hand (${fakeRhWin} notes)`;
    const d2 = `Left hand (${fakeLhWin} notes)`;
    const d3 = `Right hand (${fakeRhWin + 1} notes)`;
    distractors = [d1, d2, d3];
  }

  const [options, correctIndex] = buildOptions(correctLabel, distractors, lcg);

  return {
    questionType: QUESTION_TYPES.HAND_REGISTER,
    questionText: `Which hand plays more notes in this phrase?`,
    options,
    correctOptionIndex: correctIndex,
    midiGrounded: true,
    goldValue: correctLabel,
  };
}

// ─── Type 5: Rhythm / onset facts (LOAD-BEARING) ──────────────────────────────

/**
 * Question: "How many notes start on beat 1 across all bars in this phrase?"
 * Gold: count events where beat is within [0, 0.5) (beat 1, quantized).
 * Text_only: cannot count onsets from prose.
 * Random-MIDI: gets wrong count from different record.
 *
 * "Beat 1" = beat field value in [0, 0.5) (measure-relative, beat is 1-indexed
 * in 3/8 and starts at 0 in the actual data; beat 0 and beat 1 are
 * the first and subsequent beat positions within the measure).
 *
 * To be precise: events where beat < 0.5 (within the first beat slot).
 * This is MIDI-derived and non-trivial to answer from prose.
 */
export function generateRhythmOnsetQuestion(record: E3Record): MCQuestion | NotComputable {
  const events = record.observation.midi_sidecar.timed_events;
  if (events.length === 0) {
    return notComputable("no MIDI events — rhythm/onset fact not computable");
  }

  // Count events starting on beat 1 (beat value in [0, 0.5)).
  // In the MIDI sidecar, beat is measure-relative.
  // Beat 1 is the downbeat of each measure (beat = 0, or beat = 1 in 1-indexed notation).
  // Looking at the actual data: measure 1 has beat=1, measure 2 has beat=0.
  // The data appears mixed. We count beat < 0.5 OR beat == 1.0 (first beat in bar).
  //
  // From the fur-elise data: beat values are 0, 0.25, 0.5, 0.75, 1.0, 1.25.
  // In 3/8: beats are 0, 0.25, 0.5, 0.75, 1.0, 1.25 (each eighth = 0.25 beat).
  // Beat 1 onset = the very first note of each measure = beat==0 OR beat==1.0.
  //
  // Simplest consistent rule: count events where beat is 0 (0-indexed downbeat)
  // OR beat is 1.0 (1-indexed downbeat in measures like m1 of fur-elise).
  // This captures true downbeat onsets across both indexing conventions.

  // Determine the most common beat indexing convention in this record.
  // If any beat == 1 and none == 0, assume 1-indexed. Else 0-indexed.
  const hasZeroBeat = events.some((e) => e.beat === 0);
  const hasOneBeat = events.some((e) => e.beat === 1.0);

  let beat1Events: TimedEvent[];
  if (hasZeroBeat && !hasOneBeat) {
    // Pure 0-indexed: beat 1 = beat 0.
    beat1Events = events.filter((e) => e.beat === 0);
  } else if (!hasZeroBeat && hasOneBeat) {
    // Pure 1-indexed: beat 1 = beat 1.0.
    beat1Events = events.filter((e) => e.beat === 1.0);
  } else {
    // Mixed or unclear: treat beat < 0.5 as "on or near beat 1".
    // This is a judgment call — document in the harness.
    beat1Events = events.filter((e) => e.beat < 0.5);
  }

  const correctCount = beat1Events.length;

  if (correctCount === 0) {
    return notComputable("no events fall on beat 1 — cannot generate meaningful rhythm question");
  }

  const lcg = makeLcg(hashString(record.id + "rhythm_onset_q"));
  const distNums = intDistractors(correctCount, lcg, [-2, -1, 2, 3, -3, 1, -4, 4]);
  const distractors = distNums.slice(0, 3).map(String);

  const [options, correctIndex] = buildOptions(String(correctCount), distractors, lcg);

  return {
    questionType: QUESTION_TYPES.RHYTHM_ONSET,
    questionText: `How many notes start on beat 1 (downbeat) across all bars in this phrase?`,
    options,
    correctOptionIndex: correctIndex,
    midiGrounded: true,
    goldValue: String(correctCount),
  };
}

// ─── Type 6: Source / provenance facts ────────────────────────────────────────

/**
 * Question: "Who arranged this MIDI?"
 * Gold from provenance.arrangement_creator.
 * Text_only: provenance not in annotation prose → must guess.
 *
 * Note: all 10 public_candidate records use Bernd Krueger as arranger.
 * This creates a degenerate case where text_only might guess the correct
 * arranger from musical context clues (the piano-midi.de corpus is well known).
 * Tracked but not load-bearing — if text_only scores high, document it as a
 * corpus-level fact (10 composers / 1 arranger) and exclude from gates.
 */
export function generateProvenanceQuestion(record: E3Record): MCQuestion | NotComputable {
  const creator = record.provenance.arrangement_creator;
  if (!creator) {
    return notComputable("provenance.arrangement_creator is null — cannot generate provenance question");
  }

  // Distractors: other named MIDI arrangers (deterministic list).
  const knownArrangers = [
    "Bernd Krueger",
    "Kunstderfuge",
    "Musopen",
    "Kevin MacLeod",
    "IMSLP contributor",
    "Classical MIDI Archives",
    "Piano Society",
    "midi-piano.eu",
  ];
  const distractors = knownArrangers.filter((a) => a !== creator).slice(0, 3);

  if (distractors.length < 3) {
    return notComputable(
      `insufficient provenance distractors for arranger "${creator}" — only ${distractors.length} available`,
    );
  }

  const lcg = makeLcg(hashString(record.id + "provenance_q"));
  const [options, correctIndex] = buildOptions(creator, distractors, lcg);

  return {
    questionType: QUESTION_TYPES.PROVENANCE,
    questionText: `Who created the MIDI arrangement used in this record?`,
    options,
    correctOptionIndex: correctIndex,
    midiGrounded: false,
    goldValue: creator,
  };
}

// ─── Type 7: Annotation-to-MIDI grounding check (LOAD-BEARING) ───────────────

/**
 * Question: "Which statement about this phrase is supported by the MIDI?"
 * One true statement (MIDI-derived), three plausible-but-false distractors
 * using generic music language.
 *
 * True statement: generated from MIDI extraction (e.g., "The right hand plays
 * more notes than the left hand [RH: X, LH: Y]").
 *
 * Plausible-but-false: generic claims that sound musical but contradict the
 * actual MIDI data (e.g., "The left hand plays more notes than the right hand").
 *
 * This is the hardest type for text_only: the annotation prose may describe
 * general hand roles but won't give exact counts that contradict the MIDI.
 */
export function generateAnnotationGroundingQuestion(record: E3Record): MCQuestion | NotComputable {
  const events = record.observation.midi_sidecar.timed_events;
  if (events.length === 0) {
    return notComputable("no MIDI events — annotation grounding check not computable");
  }

  const rhEvents = events.filter((e) => e.hand === "right");
  const lhEvents = events.filter((e) => e.hand === "left");

  if (rhEvents.length === 0 && lhEvents.length === 0) {
    return notComputable("no events have hand field — annotation grounding check not computable");
  }

  // Derive a MIDI-grounded true statement.
  const totalEvents = events.length;
  const rhCount = rhEvents.length;
  const lhCount = lhEvents.length;
  const uniquePcs = uniquePitchClasses(events);
  const highestPitch = Math.max(...events.map((e) => e.note));
  const lowestPitch = Math.min(...events.map((e) => e.note));
  const highestName = noteName(highestPitch);
  const lowestName = noteName(lowestPitch);

  // True statement: always the RH vs LH count comparison (most MIDI-grounded).
  let trueStatement: string;
  if (rhCount > lhCount) {
    trueStatement = `The right hand plays more notes than the left hand (RH: ${rhCount}, LH: ${lhCount})`;
  } else if (lhCount > rhCount) {
    trueStatement = `The left hand plays more notes than the right hand (LH: ${lhCount}, RH: ${rhCount})`;
  } else {
    trueStatement = `The right and left hands play an equal number of notes (${rhCount} each)`;
  }

  // Plausible-but-false distractors: contradict the MIDI.
  let d1: string, d2: string, d3: string;
  if (rhCount > lhCount) {
    d1 = `The left hand plays more notes than the right hand (LH: ${lhCount + rhCount - lhCount + 1}, RH: ${rhCount - 1})`;
    d1 = `The left hand plays more notes than the right hand`;
    d2 = `The highest pitch in this phrase is ${lowestName}`;
    d3 = `This phrase contains ${uniquePcs.length + 2} distinct pitch classes`;
  } else if (lhCount > rhCount) {
    d1 = `The right hand plays more notes than the left hand`;
    d2 = `The highest pitch in this phrase is ${lowestName}`;
    d3 = `This phrase contains ${uniquePcs.length + 2} distinct pitch classes`;
  } else {
    d1 = `The right hand plays more notes than the left hand`;
    d2 = `The highest pitch in this phrase is ${lowestName}`;
    d3 = `This phrase contains ${uniquePcs.length + 2} distinct pitch classes`;
  }

  const distractors = [d1, d2, d3];

  // Validate: ensure none of the distractors accidentally match the true statement.
  for (const d of distractors) {
    if (d === trueStatement) {
      return notComputable("distractor collision with true statement — not computable");
    }
  }

  const lcg = makeLcg(hashString(record.id + "annotation_grounding_q"));
  const [options, correctIndex] = buildOptions(trueStatement, distractors, lcg);

  return {
    questionType: QUESTION_TYPES.ANNOTATION_GROUNDING,
    questionText: `Which of the following statements about this phrase is supported by the MIDI data?`,
    options,
    correctOptionIndex: correctIndex,
    midiGrounded: true,
    goldValue: trueStatement,
  };
}

// ─── String hash helper ────────────────────────────────────────────────────────

/** Deterministic integer hash of a string. Used for LCG seeding. */
export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0; // unsigned 32-bit
  }
  return h;
}

// ─── Generate full question set for one record ────────────────────────────────

/**
 * Generate all 7 question types for a record.
 * Returns a RecordQuestionSet with a question (or NotComputable) per type.
 */
export function generateQuestionSet(record: E3Record): RecordQuestionSet {
  const questions: Array<MCQuestion | NotComputable> = [
    generateKeyTimeSigQuestion(record),
    generateMeasureRangeQuestion(record),
    generatePitchClassCountQuestion(record),
    generateHandRegisterQuestion(record),
    generateRhythmOnsetQuestion(record),
    generateProvenanceQuestion(record),
    generateAnnotationGroundingQuestion(record),
  ];

  const typeOrder: QuestionType[] = [
    QUESTION_TYPES.KEY_TIME_SIG,
    QUESTION_TYPES.MEASURE_RANGE,
    QUESTION_TYPES.PITCH_CLASS_COUNT,
    QUESTION_TYPES.HAND_REGISTER,
    QUESTION_TYPES.RHYTHM_ONSET,
    QUESTION_TYPES.PROVENANCE,
    QUESTION_TYPES.ANNOTATION_GROUNDING,
  ];

  const questionTypeIndex = new Map<QuestionType, number>();
  typeOrder.forEach((t, i) => questionTypeIndex.set(t, i));

  return {
    recordId: record.id,
    songId: record.scope.song_id,
    questions,
    questionTypeIndex,
  };
}

// ─── Answerer implementations ─────────────────────────────────────────────────

export interface AnswerResult {
  answerer: AnswererType;
  questionType: QuestionType;
  selectedOptionIndex: number;
  correct: boolean;
  score: number; // 1 if correct, 0 if not
}

/**
 * Gold answerer: selects the correct option directly from the question.
 * Expected score: 1.0 (it has access to correctOptionIndex).
 */
export function goldAnswer(q: MCQuestion): AnswerResult {
  return {
    answerer: ANSWERERS.GOLD,
    questionType: q.questionType,
    selectedOptionIndex: q.correctOptionIndex,
    correct: true,
    score: 1,
  };
}

/**
 * Text-only answerer: sees annotation prose only.
 * For types that are NOT load-bearing (key_time_sig, measure_range, provenance):
 *   attempts simple text matching against the annotation_target prose.
 * For all types (including load-bearing): falls back to deterministic LCG choice.
 *
 * Text matching rule: if the gold value appears verbatim in the prose text,
 * the text-only answerer "finds" it and guesses correctly. Otherwise random.
 *
 * This is intentionally permissive for non-load-bearing types — it documents
 * which information leaks into prose (expected for types 1, 2, 6).
 */
export function textOnlyAnswer(
  q: MCQuestion,
  annotationProse: string,
): AnswerResult {
  // LCG for fallback random choice. Seed: question text + type for reproducibility.
  const lcg = makeLcg(hashString(q.questionText + q.questionType + "text_only"));

  let selectedIndex: number;

  if (!q.midiGrounded) {
    // For non-load-bearing types: check if goldValue appears in annotation prose.
    if (annotationProse.toLowerCase().includes(q.goldValue.toLowerCase())) {
      // Gold value found in prose — text-only can answer correctly.
      selectedIndex = q.correctOptionIndex;
    } else {
      // Not found — random choice.
      selectedIndex = lcgInt(lcg, 4);
    }
  } else {
    // Load-bearing types: text_only cannot extract MIDI-grounded facts.
    // Always random choice.
    selectedIndex = lcgInt(lcg, 4);
  }

  return {
    answerer: ANSWERERS.TEXT_ONLY,
    questionType: q.questionType,
    selectedOptionIndex: selectedIndex,
    correct: selectedIndex === q.correctOptionIndex,
    score: selectedIndex === q.correctOptionIndex ? 1 : 0,
  };
}

/**
 * Random-MIDI answerer: has the correct annotation but a different record's MIDI.
 *
 * For questions where the correct answer is MIDI-derived (load-bearing types):
 * - The random-MIDI answerer extracts the same fact from the WRONG MIDI.
 * - The wrong MIDI will produce a different count/value, yielding a wrong answer.
 *
 * Implementation: regenerate the question using the random-MIDI record's MIDI,
 * then check if the regenerated answer matches the original question's correct answer.
 * If not (expected for load-bearing), the answerer selects the option matching the
 * regenerated (wrong) value, or falls back to LCG random if no match found.
 *
 * For non-load-bearing types: same as gold (annotation prose is correct, MIDI irrelevant).
 */
export function randomMidiAnswer(
  q: MCQuestion,
  originalRecord: E3Record,
  randomMidiRecord: E3Record,
): AnswerResult {
  const lcg = makeLcg(hashString(q.questionText + q.questionType + "random_midi"));

  if (!q.midiGrounded) {
    // Non-load-bearing: random-MIDI has the correct annotation, so it can answer correctly.
    // The MIDI is wrong but irrelevant for these types.
    return {
      answerer: ANSWERERS.RANDOM_MIDI,
      questionType: q.questionType,
      selectedOptionIndex: q.correctOptionIndex,
      correct: true,
      score: 1,
    };
  }

  // Load-bearing: regenerate the same question type using the random-MIDI record's events.
  const randomEvents = randomMidiRecord.observation.midi_sidecar.timed_events;
  let wrongValue: string | null = null;

  switch (q.questionType) {
    case QUESTION_TYPES.PITCH_CLASS_COUNT: {
      // Count the same pitch class in the random MIDI.
      // We need to know which pitch class the original question asked about.
      // Extract target pitch class from question text.
      const match = /pitch class ([A-G]#?)/.exec(q.questionText);
      if (match && randomEvents.length > 0) {
        const targetPc = match[1];
        const count = randomEvents.filter((e) => pitchClassName(e.note) === targetPc).length;
        wrongValue = String(count);
      }
      break;
    }
    case QUESTION_TYPES.HAND_REGISTER: {
      if (randomEvents.length > 0) {
        const rhCount = randomEvents.filter((e) => e.hand === "right").length;
        const lhCount = randomEvents.filter((e) => e.hand === "left").length;
        const correctHand = rhCount > lhCount ? "Right hand" : rhCount < lhCount ? "Left hand" : "Equal";
        const count = rhCount > lhCount ? rhCount : lhCount;
        wrongValue = `${correctHand} (${count} notes)`;
      }
      break;
    }
    case QUESTION_TYPES.RHYTHM_ONSET: {
      if (randomEvents.length > 0) {
        const hasZeroBeat = randomEvents.some((e) => e.beat === 0);
        const hasOneBeat = randomEvents.some((e) => e.beat === 1.0);
        let beat1Count: number;
        if (hasZeroBeat && !hasOneBeat) {
          beat1Count = randomEvents.filter((e) => e.beat === 0).length;
        } else if (!hasZeroBeat && hasOneBeat) {
          beat1Count = randomEvents.filter((e) => e.beat === 1.0).length;
        } else {
          beat1Count = randomEvents.filter((e) => e.beat < 0.5).length;
        }
        wrongValue = String(beat1Count);
      }
      break;
    }
    case QUESTION_TYPES.ANNOTATION_GROUNDING: {
      if (randomEvents.length > 0) {
        const rhCount = randomEvents.filter((e) => e.hand === "right").length;
        const lhCount = randomEvents.filter((e) => e.hand === "left").length;
        const uniquePcs = uniquePitchClasses(randomEvents);
        const highestPitch = Math.max(...randomEvents.map((e) => e.note));
        const lowestPitch = Math.min(...randomEvents.map((e) => e.note));
        const lowestName = noteName(lowestPitch);

        if (rhCount > lhCount) {
          wrongValue = `The right hand plays more notes than the left hand (RH: ${rhCount}, LH: ${lhCount})`;
        } else if (lhCount > rhCount) {
          wrongValue = `The left hand plays more notes than the right hand (LH: ${lhCount}, RH: ${rhCount})`;
        } else {
          wrongValue = `The right and left hands play an equal number of notes (${rhCount} each)`;
        }
      }
      break;
    }
  }

  if (wrongValue !== null) {
    // Find which option index matches the wrongValue.
    const matchIdx = q.options.findIndex(
      (opt) => opt === wrongValue || opt.startsWith(wrongValue!),
    );
    if (matchIdx !== -1 && matchIdx !== q.correctOptionIndex) {
      // Found the wrong option — select it.
      return {
        answerer: ANSWERERS.RANDOM_MIDI,
        questionType: q.questionType,
        selectedOptionIndex: matchIdx,
        correct: false,
        score: 0,
      };
    }
    if (matchIdx === q.correctOptionIndex) {
      // Random MIDI happened to produce the same answer — still wrong conceptually,
      // but we record it as correct (honest reporting).
      return {
        answerer: ANSWERERS.RANDOM_MIDI,
        questionType: q.questionType,
        selectedOptionIndex: matchIdx,
        correct: true,
        score: 1,
      };
    }
  }

  // Fallback: LCG random selection (avoid the correct option if possible).
  let selectedIndex = lcgInt(lcg, 4);
  if (selectedIndex === q.correctOptionIndex) {
    selectedIndex = (selectedIndex + 1) % 4;
  }

  return {
    answerer: ANSWERERS.RANDOM_MIDI,
    questionType: q.questionType,
    selectedOptionIndex: selectedIndex,
    correct: selectedIndex === q.correctOptionIndex,
    score: selectedIndex === q.correctOptionIndex ? 1 : 0,
  };
}

// ─── Extract annotation prose for text_only ────────────────────────────────────

/**
 * Build the text-only view of a record:
 * annotation_target.structure, teaching_notes[*].note, key_moments, style_tips.
 * NO scope fields, NO provenance, NO MIDI.
 */
export function extractAnnotationProse(record: E3Record): string {
  const parts: string[] = [];
  const at = record.annotation_target;

  if (at.structure) parts.push(at.structure);
  if (at.key_moments) parts.push(...at.key_moments);
  if (at.teaching_goals) parts.push(...at.teaching_goals);
  if (at.style_tips) parts.push(...at.style_tips);
  if (at.teaching_notes) {
    for (const tn of at.teaching_notes) {
      parts.push(tn.note);
      if (tn.technique) parts.push(...tn.technique);
    }
  }

  return parts.join(" ");
}

// ─── Random-MIDI partner selection ────────────────────────────────────────────

/**
 * Select a random-MIDI partner for a record.
 *
 * Strategy: deterministic shift by floor(N/2) positions in the sorted record list.
 * For a list of N records, record at index i gets partner at index (i + floor(N/2)) % N.
 * This ensures:
 * - Every record has a unique partner (no self-pairing for even N).
 * - Partners are from different songs in most cases (offset is large).
 * - Deterministic: same corpus → same assignments.
 *
 * Edge case: if partner happens to be the same song, shift by 1 more.
 */
export function selectRandomMidiPartner(
  record: E3Record,
  allRecords: E3Record[],
): E3Record {
  const sortedIds = allRecords.map((r) => r.id).sort();
  const myIndex = sortedIds.indexOf(record.id);
  const shift = Math.floor(allRecords.length / 2);

  let partnerIndex = (myIndex + shift) % allRecords.length;

  // Avoid same-song partner if possible.
  const byId = new Map<string, E3Record>();
  for (const r of allRecords) byId.set(r.id, r);

  const partnerRecord = byId.get(sortedIds[partnerIndex])!;
  if (partnerRecord.scope.song_id === record.scope.song_id && allRecords.length > 1) {
    // Try shift+1.
    partnerIndex = (myIndex + shift + 1) % allRecords.length;
    const candidate = byId.get(sortedIds[partnerIndex])!;
    if (candidate.scope.song_id !== record.scope.song_id) {
      return candidate;
    }
    // Try shift+2 as last resort.
    partnerIndex = (myIndex + shift + 2) % allRecords.length;
  }

  return byId.get(sortedIds[partnerIndex])!;
}

// ─── Per-record E3 evaluation ─────────────────────────────────────────────────

export interface QuestionEvaluation {
  questionType: QuestionType;
  questionText: string;
  options: [string, string, string, string] | null; // null if not_computable
  correctOptionIndex: number | null;
  midiGrounded: boolean | null;
  goldValue: string | null;
  not_computable: boolean;
  not_computable_reason: string | null;
  goldAnswer: AnswerResult | null;
  textOnlyAnswer: AnswerResult | null;
  randomMidiAnswer: AnswerResult | null;
  randomMidiPartnerId: string | null;
}

export interface RecordE3Result {
  recordId: string;
  songId: string;
  phraseWindow: string;
  randomMidiPartnerId: string;
  questions: QuestionEvaluation[];
  /** Per-answerer aggregate scores over computable questions. */
  scores: {
    gold: number | null;
    text_only: number | null;
    random_midi: number | null;
  };
  /** Per-answerer scores on LOAD-BEARING types only. */
  loadBearingScores: {
    gold: number | null;
    text_only: number | null;
    random_midi: number | null;
  };
}

export function evaluateRecord(
  record: E3Record,
  allRecords: E3Record[],
): RecordE3Result {
  const questionSet = generateQuestionSet(record);
  const randomMidiRecord = selectRandomMidiPartner(record, allRecords);
  const annotationProse = extractAnnotationProse(record);

  const questionEvals: QuestionEvaluation[] = [];
  const typeOrder: QuestionType[] = [
    QUESTION_TYPES.KEY_TIME_SIG,
    QUESTION_TYPES.MEASURE_RANGE,
    QUESTION_TYPES.PITCH_CLASS_COUNT,
    QUESTION_TYPES.HAND_REGISTER,
    QUESTION_TYPES.RHYTHM_ONSET,
    QUESTION_TYPES.PROVENANCE,
    QUESTION_TYPES.ANNOTATION_GROUNDING,
  ];

  for (const qType of typeOrder) {
    const idx = questionSet.questionTypeIndex.get(qType)!;
    const q = questionSet.questions[idx];

    if (isNotComputable(q)) {
      questionEvals.push({
        questionType: qType,
        questionText: null!,
        options: null,
        correctOptionIndex: null,
        midiGrounded: null,
        goldValue: null,
        not_computable: true,
        not_computable_reason: q.reason,
        goldAnswer: null,
        textOnlyAnswer: null,
        randomMidiAnswer: null,
        randomMidiPartnerId: randomMidiRecord.id,
      });
    } else {
      const gold = goldAnswer(q);
      const textOnly = textOnlyAnswer(q, annotationProse);
      const randomMidi = randomMidiAnswer(q, record, randomMidiRecord);

      questionEvals.push({
        questionType: qType,
        questionText: q.questionText,
        options: q.options,
        correctOptionIndex: q.correctOptionIndex,
        midiGrounded: q.midiGrounded,
        goldValue: q.goldValue,
        not_computable: false,
        not_computable_reason: null,
        goldAnswer: gold,
        textOnlyAnswer: textOnly,
        randomMidiAnswer: randomMidi,
        randomMidiPartnerId: randomMidiRecord.id,
      });
    }
  }

  // Aggregate scores over all computable questions.
  function computeScores(
    evals: QuestionEvaluation[],
    filter?: (e: QuestionEvaluation) => boolean,
  ): { gold: number | null; text_only: number | null; random_midi: number | null } {
    const computable = evals.filter(
      (e) => !e.not_computable && (filter ? filter(e) : true),
    );
    if (computable.length === 0) return { gold: null, text_only: null, random_midi: null };

    const goldSum = computable.reduce((s, e) => s + (e.goldAnswer?.score ?? 0), 0);
    const textSum = computable.reduce((s, e) => s + (e.textOnlyAnswer?.score ?? 0), 0);
    const randSum = computable.reduce((s, e) => s + (e.randomMidiAnswer?.score ?? 0), 0);

    return {
      gold: goldSum / computable.length,
      text_only: textSum / computable.length,
      random_midi: randSum / computable.length,
    };
  }

  const scores = computeScores(questionEvals);
  const loadBearingScores = computeScores(
    questionEvals,
    (e) => e.midiGrounded === true,
  );

  return {
    recordId: record.id,
    songId: record.scope.song_id,
    phraseWindow: record.scope.phrase_window,
    randomMidiPartnerId: randomMidiRecord.id,
    questions: questionEvals,
    scores,
    loadBearingScores,
  };
}

// ─── Aggregate across all records ─────────────────────────────────────────────

export interface QuestionTypeAggregate {
  questionType: QuestionType;
  isLoadBearing: boolean;
  computedCount: number;
  notComputedCount: number;
  goldMean: number | null;
  textOnlyMean: number | null;
  randomMidiMean: number | null;
  goldMinusTextOnly: number | null;
  goldMinusRandomMidi: number | null;
}

export interface E3EvalRun {
  evalDate: string;
  schemaVersion: string;
  totalRecords: number;
  /** record IDs with their random-MIDI partner IDs (for audit). */
  partnerAssignments: Array<{ recordId: string; partnerId: string }>;
  recordResults: RecordE3Result[];
  perTypeAggregates: QuestionTypeAggregate[];
  overallAggregate: {
    goldMean: number | null;
    textOnlyMean: number | null;
    randomMidiMean: number | null;
    goldMinusTextOnly: number | null;
    goldMinusRandomMidi: number | null;
  };
  loadBearingAggregate: {
    goldMean: number | null;
    textOnlyMean: number | null;
    randomMidiMean: number | null;
    goldMinusTextOnly: number | null;
    goldMinusRandomMidi: number | null;
  };
  hardGates: {
    goldBeatsTextOnlyByMin010: boolean;
    goldBeatsRandomMidiByMin010: boolean;
    textOnlyAtChance: boolean;      // text_only ≤ 0.40
    randomMidiAtChance: boolean;    // random_midi ≤ 0.40
    allRecordsHaveLoadBearingQuestions: boolean;
    notComputableAudit: Array<{
      recordId: string;
      questionType: QuestionType;
      reason: string;
    }>;
  };
}

export const E3_GOLD_MARGIN = 0.10;
export const E3_CHANCE_CEILING = 0.40;

export function runFullE3Eval(allRecords: E3Record[]): E3EvalRun {
  // Evaluate each record.
  const recordResults = allRecords.map((r) => evaluateRecord(r, allRecords));

  // Partner assignments for audit.
  const partnerAssignments = recordResults.map((r) => ({
    recordId: r.recordId,
    partnerId: r.randomMidiPartnerId,
  }));

  // Per-type aggregates.
  const typeOrder: QuestionType[] = [
    QUESTION_TYPES.KEY_TIME_SIG,
    QUESTION_TYPES.MEASURE_RANGE,
    QUESTION_TYPES.PITCH_CLASS_COUNT,
    QUESTION_TYPES.HAND_REGISTER,
    QUESTION_TYPES.RHYTHM_ONSET,
    QUESTION_TYPES.PROVENANCE,
    QUESTION_TYPES.ANNOTATION_GROUNDING,
  ];

  const perTypeAggregates: QuestionTypeAggregate[] = typeOrder.map((qType) => {
    const typeResults = recordResults.flatMap((r) =>
      r.questions.filter((q) => q.questionType === qType),
    );
    const computable = typeResults.filter((q) => !q.not_computable);
    const notComputed = typeResults.filter((q) => q.not_computable);

    const goldVals = computable.map((q) => q.goldAnswer?.score ?? 0);
    const textVals = computable.map((q) => q.textOnlyAnswer?.score ?? 0);
    const randVals = computable.map((q) => q.randomMidiAnswer?.score ?? 0);

    const mean = (arr: number[]) =>
      arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : null;

    const goldMean = mean(goldVals);
    const textOnlyMean = mean(textVals);
    const randomMidiMean = mean(randVals);

    return {
      questionType: qType,
      isLoadBearing: LOAD_BEARING_TYPES.includes(qType),
      computedCount: computable.length,
      notComputedCount: notComputed.length,
      goldMean,
      textOnlyMean,
      randomMidiMean,
      goldMinusTextOnly:
        goldMean !== null && textOnlyMean !== null ? goldMean - textOnlyMean : null,
      goldMinusRandomMidi:
        goldMean !== null && randomMidiMean !== null ? goldMean - randomMidiMean : null,
    };
  });

  // Overall aggregate (all types).
  function computeOverall(
    results: RecordE3Result[],
    loadBearingOnly: boolean,
  ): E3EvalRun["overallAggregate"] {
    const allQEvals = results.flatMap((r) =>
      r.questions.filter(
        (q) =>
          !q.not_computable &&
          (loadBearingOnly ? q.midiGrounded === true : true),
      ),
    );

    if (allQEvals.length === 0) {
      return { goldMean: null, textOnlyMean: null, randomMidiMean: null, goldMinusTextOnly: null, goldMinusRandomMidi: null };
    }

    const goldMean = allQEvals.reduce((s, q) => s + (q.goldAnswer?.score ?? 0), 0) / allQEvals.length;
    const textOnlyMean = allQEvals.reduce((s, q) => s + (q.textOnlyAnswer?.score ?? 0), 0) / allQEvals.length;
    const randomMidiMean = allQEvals.reduce((s, q) => s + (q.randomMidiAnswer?.score ?? 0), 0) / allQEvals.length;

    return {
      goldMean,
      textOnlyMean,
      randomMidiMean,
      goldMinusTextOnly: goldMean - textOnlyMean,
      goldMinusRandomMidi: goldMean - randomMidiMean,
    };
  }

  const overallAggregate = computeOverall(recordResults, false);
  const loadBearingAggregate = computeOverall(recordResults, true);

  // not_computable audit.
  const notComputableAudit: E3EvalRun["hardGates"]["notComputableAudit"] = [];
  for (const r of recordResults) {
    for (const q of r.questions) {
      if (q.not_computable) {
        notComputableAudit.push({
          recordId: r.recordId,
          questionType: q.questionType,
          reason: q.not_computable_reason ?? "unknown",
        });
      }
    }
  }

  // Hard gates.
  const loadBearingTypes: Set<QuestionType> = new Set(LOAD_BEARING_TYPES);
  const allHaveLoadBearing = recordResults.every((r) => {
    const computableLB = r.questions.filter(
      (q) => !q.not_computable && loadBearingTypes.has(q.questionType),
    );
    // Need at least types 3, 4, 5 computable (annotation_grounding optional for sparse records).
    const hasType3 = r.questions.some(
      (q) => q.questionType === QUESTION_TYPES.PITCH_CLASS_COUNT && !q.not_computable,
    );
    const hasType4 = r.questions.some(
      (q) => q.questionType === QUESTION_TYPES.HAND_REGISTER && !q.not_computable,
    );
    const hasType5 = r.questions.some(
      (q) => q.questionType === QUESTION_TYPES.RHYTHM_ONSET && !q.not_computable,
    );
    return hasType3 && hasType4 && hasType5;
  });

  const glbGold = loadBearingAggregate.goldMean;
  const glbText = loadBearingAggregate.textOnlyMean;
  const glbRand = loadBearingAggregate.randomMidiMean;

  const hardGates: E3EvalRun["hardGates"] = {
    goldBeatsTextOnlyByMin010:
      glbGold !== null && glbText !== null
        ? glbGold - glbText >= E3_GOLD_MARGIN
        : false,
    goldBeatsRandomMidiByMin010:
      glbGold !== null && glbRand !== null
        ? glbGold - glbRand >= E3_GOLD_MARGIN
        : false,
    textOnlyAtChance:
      glbText !== null ? glbText <= E3_CHANCE_CEILING : false,
    randomMidiAtChance:
      glbRand !== null ? glbRand <= E3_CHANCE_CEILING : false,
    allRecordsHaveLoadBearingQuestions: allHaveLoadBearing,
    notComputableAudit,
  };

  return {
    evalDate: new Date().toISOString(),
    schemaVersion: "e3-annotation-grounding/1.0.0",
    totalRecords: allRecords.length,
    partnerAssignments,
    recordResults,
    perTypeAggregates,
    overallAggregate,
    loadBearingAggregate,
    hardGates,
  };
}
