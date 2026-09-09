// ─── v1 records: F2 chord ID + F3 structural navigation ──────────────────────
//
// Gold is re-derived from the engine at test time. An unconfirmable
// measurement is a build failure: that case is omitted, not labelled
// from the recipe.

import { parseNoteToMidi, midiToNoteName } from "../../note-parser.js";
import { inferChord } from "../../songs/jam.js";
import { detectChord } from "../../chord-detect.js";
import { transposeSong } from "../../songs/transpose.js";
import { verifyHarmony, DEFAULT_MAX_CHROMATIC_RATIO, type ReharmonizedMeasure } from "../../maker/verify-harmony.js";
import {
  compareAssistantContent,
  harmonyAssistantContent,
} from "./shown-work.js";
import { Ensemble } from "../../audio/ensemble.js";
import { validateTrace } from "../trace-validator.js";
import {
  F5_KINDS,
  resolveF5Draws,
  F5_THRESHOLDS,
  resetF5DropStats,
  tryBuildF5,
  rederiveF5Gold,
  opaqueTakePath,
  f5DropStats,
  round1,
  acousticAssistantContent,
  type F5Kept,
} from "./f5-acoustic.js";
import type { SongEntry } from "../../songs/types.js";
import type { Provenance, Turn } from "../schema.js";
import type { V1Family, V1Record } from "./schema.js";
import { V1_SCHEMA_VERSION } from "./schema.js";
import { loadPublishableSongs, allowlistRow } from "./library.js";

export { f5DropStats, acousticAssistantContent, acousticComparisonLine, parseAcousticAssistant, round1 } from "./f5-acoustic.js";
export {
  compareAssistantContent,
  compareAssistantLine,
  harmonyAssistantContent,
  harmonyAssistantLine,
  parseCompareAssistant,
  parseHarmonyAssistant,
  chromaticRatioOf,
  compareGoldFromPrinted,
  consonanceInside,
  fidelitySame,
  harmonyGoldFromPrinted,
} from "./shown-work.js";

export const USER_TURN_FORMAT: Record<V1Family, { instruction: string; pattern: RegExp }> = {
  chord: { instruction: "Answer with the chord symbol alone.", pattern: /Answer with the chord symbol alone\./ },
  measures: { instruction: "Answer with a single integer.", pattern: /Answer with a single integer\./ },
  teaching_goals: { instruction: "Answer with a single integer.", pattern: /Answer with a single integer\./ },
  key_moments: { instruction: "Answer with a measure number or range.", pattern: /Answer with a measure number or range\./ },
  transpose: { instruction: "Answer with the resulting key name alone.", pattern: /Answer with the resulting key name alone\./ },
  compare: { instruction: "Answer with exactly one of: same_key, different_key.", pattern: /Answer with exactly one of: same_key, different_key\./ },
  harmony: { instruction: "Answer with exactly one of: verified, rejected.", pattern: /Answer with exactly one of: verified, rejected\./ },
  acoustic: { instruction: "Answer with exactly one of: match, pitch_fail, timing_fail.", pattern: /Answer with exactly one of: match, pitch_fail, timing_fail\./ },
  ensemble: { instruction: "Answer with the instrument id alone.", pattern: /Answer with the instrument id alone\./ },
};

const CLOSED_SET_FAMILIES = new Set<V1Family>(["acoustic", "compare", "harmony", "ensemble"]);
export function userTurnNamesClosedSet(family: string): boolean {
  return CLOSED_SET_FAMILIES.has(family as V1Family);
}

function ask(family: V1Family, question: string): string {
  return `${question} ${USER_TURN_FORMAT[family].instruction}`;
}

function roundToolNumbers(x: unknown): unknown {
  if (typeof x === "number" && !Number.isInteger(x)) return round1(x);
  if (Array.isArray(x)) return x.map(roundToolNumbers);
  if (x && typeof x === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x as Record<string, unknown>)) o[k] = roundToolNumbers(v);
    return o;
  }
  return x;
}

export interface V1BuildOpts {
  /** Bare last-assistant label for acoustic, harmony, and compare. */
  acousticBareLabel?: boolean;
  /** Plain comparison line (chunk 22). Default is the arithmetic target (chunk 32). */
  acousticPlainComparison?: boolean;
}

export function acousticTargetOf(opts: V1BuildOpts = {}): "bare" | "comparison" | "arithmetic" {
  if (opts.acousticBareLabel) return "bare";
  if (opts.acousticPlainComparison) return "comparison";
  return "arithmetic";
}

export function leftHandToMidi(leftHand: string): number[] {
  const out: number[] = [];
  for (const tok of leftHand.split(/[\s+]+/).filter(Boolean)) {
    const note = tok.split(":")[0]!;
    if (note === "R" || note === "r") continue;
    try {
      const midi = parseNoteToMidi(note);
      if (midi >= 0) out.push(midi);
    } catch {
      /* unparseable token */
    }
  }
  return out;
}

/** First measure where inferChord and detectChord agree. */
export function agreeingChordMeasure(song: SongEntry): { measure: number; chord: string; midi: number[] } | null {
  for (const m of song.measures) {
    const midi = leftHandToMidi(m.leftHand);
    if (midi.length < 2) continue;
    const inferred = inferChord(m.leftHand);
    const detected = detectChord(midi);
    if (detected && detected === inferred) {
      return { measure: m.number, chord: inferred, midi };
    }
  }
  return null;
}

function provenanceFor(song: SongEntry): Provenance {
  const row = allowlistRow(song.id);
  if (!row) throw new Error(`provenance: ${song.id} is not on the publishable allowlist`);
  return {
    source_url: row.downloadUrl,
    source_collected_at: row.auditDate,
    source_type: "downloaded-arrangement",
    composition_title: song.title,
    composer: song.composer ?? "Traditional",
    composition_year: 1,
    composition_pd_status_us: "public_domain",
    composition_pd_status_eu: "public_domain",
    arrangement_creator: row.arranger,
    arrangement_license: row.licence,
    arrangement_license_version: row.licence === "CC-BY-SA-3.0-DE" ? "3.0-DE" : null,
    arrangement_evidence_url: row.termsUrl,
    record_verdict: "public",
    verdict_reason: `Allowlisted ${row.auditDate}; ${row.licence}`,
    verifier: row.verifier,
    verified_at: row.auditDate,
    training_use_permitted: true,
  };
}

function annotation(song: SongEntry) {
  const ml = song.musicalLanguage;
  return {
    measure_range: [1, Math.max(1, song.measures.length)] as [number, number],
    structure: ml.structure || "unknown",
    key_moments: ml.keyMoments.length ? ml.keyMoments : ["none recorded"],
    teaching_goals: ml.teachingGoals.length ? ml.teachingGoals : ["none recorded"],
    style_tips: ml.styleTips.length ? ml.styleTips : ["none recorded"],
    teaching_notes: [{ measure: 1, note: song.measures[0]?.teachingNote ?? "none" }],
  };
}

function baseRecord(
  song: SongEntry,
  family: V1Family,
  id: string,
  split: "train" | "test",
  gold: V1Record["observation"]["gold"],
  session: Turn[],
  extra?: { thresholds?: Record<string, number>; observation?: Record<string, unknown>; phrase_window?: string; schema_version?: string },
): V1Record {
  const rec: V1Record = {
    id,
    schema_version: (extra?.schema_version ?? V1_SCHEMA_VERSION) as typeof V1_SCHEMA_VERSION,
    family,
    provenance: provenanceFor(song),
    scope: {
      song_id: song.id,
      phrase_window: extra?.phrase_window ?? `full:${song.measures.length}`,
      instrument: "piano",
      key: song.key,
      tempo_bpm: song.tempo,
      time_signature: song.timeSignature.includes("/") ? song.timeSignature : "4/4",
      window_role: "standalone",
    },
    observation: {
      thresholds: extra?.thresholds ?? { min_pitch_classes: 2 },
      gold,
      ...extra?.observation,
    },
    annotation_target: annotation(song),
    target_trace: {
      task_family: family,
      objective: `Answer using tools. Do not guess from the question text.`,
      session,
    },
    eval_metadata: {
      split,
      split_strategy: "hold out by song_id",
      leakage_check: "passed",
      eval_eligibility: ["tool_use", family],
      phrase_continuation_eligible: false,
      phrase_continuation_eligible_reason: "standalone tool-use items",
    },
    split,
  };
  const report = validateTrace(rec.target_trace);
  if (!report.ok) {
    throw new Error(`${id}: ${report.mismatches.map((m) => m.message).join("; ")}`);
  }
  return rec;
}

function catalogSong(): SongEntry {
  const songs = loadPublishableSongs();
  const s = songs[0];
  if (!s) throw new Error("no publishable songs");
  return s;
}

export function buildChordRecord(song: SongEntry, split: "train" | "test"): V1Record | null {
  const hit = agreeingChordMeasure(song);
  if (!hit) return null;
  const session: Turn[] = [
    { turn: 1, role: "user", content: ask("chord", `What chord is the left hand playing in measure ${hit.measure} of "${song.title}"?`) },
    {
      turn: 2, role: "assistant",
      content: "I need the notes, then the chord engine.",
      tool_calls: [
        { tool: "list_songs", arguments: { query: song.title } },
        { tool: "song_info", arguments: { id: song.id } },
        { tool: "list_measures", arguments: { id: song.id, startMeasure: hit.measure, endMeasure: hit.measure } },
      ],
    },
    { turn: 3, role: "tool", tool: "list_songs", content: { ids: [song.id] } },
    { turn: 4, role: "tool", tool: "song_info", content: { id: song.id, title: song.title, genre: song.genre } },
    { turn: 5, role: "tool", tool: "list_measures", content: { measure: hit.measure, leftHand: song.measures[hit.measure - 1]!.leftHand } },
    {
      turn: 6, role: "assistant",
      content: "Naming the chord from the sounding MIDI notes.",
      tool_calls: [{ tool: "detect_chord", arguments: { notes: hit.midi } }],
    },
    { turn: 7, role: "tool", tool: "detect_chord", content: { notes: hit.midi, chord: hit.chord } },
    { turn: 8, role: "assistant", content: hit.chord },
  ];
  return baseRecord(song, "chord", `chord:${song.id}:m${hit.measure}`, split, {
    family: "chord", answer: hit.chord, engine: "inferChord+detectChord",
  }, session);
}

/** First measure or range named in a keyMoment. Exact, not prose. */
export function firstMeasureSpan(text: string): string | null {
  const range = text.match(/(?:bars?|measures?)\s+(\d+)\s*[-–—]\s*(\d+)/i);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    return `${Math.min(a, b)}-${Math.max(a, b)}`;
  }
  const andRange = text.match(/(?:bars?|measures?)\s+(\d+)\s+and\s+(\d+)\b/i);
  if (andRange) {
    const a = Number(andRange[1]);
    const b = Number(andRange[2]);
    return `${Math.min(a, b)}-${Math.max(a, b)}`;
  }
  const single = text.match(/(?:bars?|measures?)\s+(\d+)/i);
  return single ? single[1]! : null;
}

export function buildTeachingGoalsRecord(song: SongEntry, split: "train" | "test"): V1Record {
  const n = song.musicalLanguage.teachingGoals.length;
  const session: Turn[] = [
    { turn: 1, role: "user", content: ask("teaching_goals", `How many teaching goals does "${song.title}" declare?`) },
    {
      turn: 2, role: "assistant",
      content: "Reading the song's musicalLanguage.",
      tool_calls: [{ tool: "song_info", arguments: { id: song.id } }],
    },
    { turn: 3, role: "tool", tool: "song_info", content: { id: song.id, teachingGoals_count: n } },
    { turn: 4, role: "assistant", content: String(n) },
  ];
  return baseRecord(song, "teaching_goals", `teaching_goals:${song.id}`, split, {
    family: "teaching_goals", answer: String(n), engine: "musicalLanguage.teachingGoals.length",
  }, session);
}

export function buildKeyMomentsRecord(song: SongEntry, split: "train" | "test"): V1Record | null {
  const first = song.musicalLanguage.keyMoments[0];
  if (!first) return null;
  const span = firstMeasureSpan(first);
  if (!span) return null;
  const session: Turn[] = [
    { turn: 1, role: "user", content: ask("key_moments", `Which measure range does the first key moment of "${song.title}" name?`) },
    {
      turn: 2, role: "assistant",
      content: "Reading keyMoments from song_info.",
      tool_calls: [{ tool: "song_info", arguments: { id: song.id } }],
    },
    { turn: 3, role: "tool", tool: "song_info", content: { id: song.id, first_keyMoment: first } },
    { turn: 4, role: "assistant", content: span },
  ];
  return baseRecord(song, "key_moments", `key_moments:${song.id}`, split, {
    family: "key_moments", answer: span, engine: "musicalLanguage.keyMoments[0] span",
  }, session);
}

export function buildMeasuresRecord(song: SongEntry, split: "train" | "test"): V1Record {
  const n = song.measures.length;
  const session: Turn[] = [
    { turn: 1, role: "user", content: ask("measures", `How many measures are in "${song.title}"?`) },
    {
      turn: 2, role: "assistant",
      content: "Counting from the library entry.",
      tool_calls: [
        { tool: "song_info", arguments: { id: song.id } },
        { tool: "list_measures", arguments: { id: song.id } },
      ],
    },
    { turn: 3, role: "tool", tool: "song_info", content: { id: song.id, title: song.title } },
    { turn: 4, role: "tool", tool: "list_measures", content: { measure_count: n } },
    { turn: 5, role: "assistant", content: String(n) },
  ];
  return baseRecord(song, "measures", `measures:${song.id}`, split, {
    family: "measures", answer: String(n), engine: "song.measures.length",
  }, session);
}

export function buildTransposeRecord(song: SongEntry, split: "train" | "test"): V1Record {
  const semitones = 2;
  const next = transposeSong(song, semitones);
  const session: Turn[] = [
    { turn: 1, role: "user", content: ask("transpose", `Transpose "${song.title}" up a whole step. What key is the result in?`) },
    {
      turn: 2, role: "assistant",
      content: "Looking up the song, then transposing.",
      tool_calls: [
        { tool: "song_info", arguments: { id: song.id } },
        { tool: "transpose_song", arguments: { id: song.id, semitones } },
      ],
    },
    { turn: 3, role: "tool", tool: "song_info", content: { id: song.id, title: song.title } },
    { turn: 4, role: "tool", tool: "transpose_song", content: { id: next.id, key: next.key, semitones } },
    { turn: 5, role: "assistant", content: next.key },
  ];
  return baseRecord(song, "transpose", `transpose:${song.id}:+${semitones}`, split, {
    family: "transpose", answer: next.key, engine: "transposeSong",
  }, session);
}

export function sameKeyPairCount(songs: SongEntry[]): number {
  const byKey = new Map<string, number>();
  for (const s of songs) byKey.set(s.key, (byKey.get(s.key) ?? 0) + 1);
  let n = 0;
  for (const c of byKey.values()) n += (c * (c - 1)) / 2;
  return n;
}

function pairsInGroup(
  group: SongEntry[],
  split: "train" | "test",
  nSame: number,
  nDiff: number,
): Array<{ a: SongEntry; b: SongEntry; split: "train" | "test" }> {
  const byKey = new Map<string, SongEntry[]>();
  for (const s of group) {
    const list = byKey.get(s.key) ?? [];
    list.push(s);
    byKey.set(s.key, list);
  }
  const same: Array<[SongEntry, SongEntry]> = [];
  for (const ids of byKey.values()) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) same.push([ids[i]!, ids[j]!]);
    }
  }
  const diff: Array<[SongEntry, SongEntry]> = [];
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      if (group[i]!.key !== group[j]!.key) diff.push([group[i]!, group[j]!]);
    }
  }
  return [
    ...same.slice(0, nSame).map(([a, b]) => ({ a, b, split })),
    ...diff.slice(0, nDiff).map(([a, b]) => ({ a, b, split })),
  ];
}

export function pickComparePairs(songs: SongEntry[], testIds: Set<string>) {
  const train = songs.filter((s) => !testIds.has(s.id));
  const test = songs.filter((s) => testIds.has(s.id));
  const nTrain = sameKeyPairCount(train);
  const nTest = sameKeyPairCount(test);
  return [
    ...pairsInGroup(train, "train", nTrain, nTrain),
    ...pairsInGroup(test, "test", nTest, nTest),
  ];
}

export function buildCompareRecord(
  a: SongEntry,
  b: SongEntry,
  split: "train" | "test",
  opts: V1BuildOpts = {},
): V1Record {
  const answer = a.key === b.key ? "same_key" : "different_key";
  const bare = Boolean(opts.acousticBareLabel);
  const session: Turn[] = [
    { turn: 1, role: "user", content: ask("compare", `Do "${a.title}" and "${b.title}" share a key signature?`) },
    {
      turn: 2, role: "assistant",
      content: "Comparing the two library entries.",
      tool_calls: [
        { tool: "song_info", arguments: { id: a.id } },
        { tool: "song_info", arguments: { id: b.id } },
        { tool: "compare_songs", arguments: { song_a: a.id, song_b: b.id } },
      ],
    },
    { turn: 3, role: "tool", tool: "song_info", content: { id: a.id, title: a.title, key: a.key } },
    { turn: 4, role: "tool", tool: "song_info", content: { id: b.id, title: b.title, key: b.key } },
    { turn: 5, role: "tool", tool: "compare_songs", content: { key_a: a.key, key_b: b.key } },
    { turn: 6, role: "assistant", content: compareAssistantContent(a.key, b.key, answer, bare) },
  ];
  const rec = baseRecord(a, "compare", `compare:${[a.id, b.id].sort().join("|")}`, split, {
    family: "compare", answer, engine: "song.key",
  }, session);
  rec.scope.song_id = [a.id, b.id].sort().join("|");
  return rec;
}

export function buildHarmonyRecords(
  song: SongEntry,
  split: "train" | "test",
  opts: V1BuildOpts = {},
): V1Record[] {
  const hit = agreeingChordMeasure(song);
  if (!hit) return [];
  const measure = hit.measure;
  const intended = hit.chord;
  const validVoicing = hit.midi.map((m) => midiToNoteName(m)).join(" ");
  const invalidVoicing = hit.midi.map((m) => midiToNoteName(m + 1)).join(" ");
  const melody = [{ number: measure, rightHand: hit.midi.map((m) => `${midiToNoteName(m + 12)}:q`).join(" ") }];
  const out: V1Record[] = [];
  const bare = Boolean(opts.acousticBareLabel);
  for (const [tag, voicing] of [["pass", validVoicing], ["fail", invalidVoicing]] as const) {
    const reharmonization: ReharmonizedMeasure[] = [
      { measure, intendedChord: intended, voicing },
    ];
    const verdict = verifyHarmony(melody, reharmonization, { key: song.key });
    const answer = verdict.verified ? "verified" : "rejected";
    if (tag === "pass" && answer !== "verified") continue;
    if (tag === "fail" && answer !== "rejected") continue;
    const fid = verdict.chordFidelity.perMeasure[0]!;
    const chromatic = verdict.consonance.chromatic;
    const scored = verdict.consonance.chordTones + verdict.consonance.tensions + verdict.consonance.chromatic;
    const payload = JSON.stringify(reharmonization);
    const session: Turn[] = [
      { turn: 1, role: "user", content: ask("harmony", `Proposed reharmonization of measure ${measure} of "${song.title}": ${payload}\nDoes it clear the harmony verifier?`) },
      {
        turn: 2, role: "assistant",
        content: "Running the deterministic harmony verifier.",
        tool_calls: [{
          tool: "verify_harmony",
          arguments: { songId: song.id, measures: `${measure}-${measure}`, reharmonization: payload, key: song.key },
        }],
      },
      { turn: 3, role: "tool", tool: "verify_harmony", content: {
        intended: fid.intended,
        detected: fid.detected,
        chromatic,
        scored,
      } },
      { turn: 4, role: "assistant", content: harmonyAssistantContent(fid.intended, fid.detected, chromatic, scored, answer, bare) },
    ];
    out.push(baseRecord(song, "harmony", `harmony:${song.id}:m${measure}:${tag}`, split, {
      family: "harmony", answer, engine: "verifyHarmony",
    }, session, {
      thresholds: { max_chromatic_ratio: DEFAULT_MAX_CHROMATIC_RATIO },
      observation: { harmony: { melody, reharmonization, key: song.key } },
    }));
  }
  return out;
}

export function buildAcousticTake(
  song: SongEntry,
  kept: F5Kept,
  id: string,
  split: "train" | "test",
  opts: V1BuildOpts & { schema_version?: string; band?: string; draw?: number } = {},
): V1Record {
  const path = opaqueTakePath(song.id, kept);
  const session: Turn[] = [
    {
      turn: 1, role: "user",
      content: ask("acoustic", `Grade this take of "${song.title}".`),
    },
    {
      turn: 2, role: "assistant",
      content: "Transcribing, then scoring with raw measurements.",
      tool_calls: [
        { tool: "transcribe_audio", arguments: { path } },
        { tool: "score_audio_take", arguments: { path, song_id: song.id } },
      ],
    },
    { turn: 3, role: "tool", tool: "transcribe_audio", content: { note_count: kept.notes.length } },
    { turn: 4, role: "tool", tool: "score_audio_take", content: {
      f0_hz: round1(kept.measured_f0_hz),
      cents_from_target: round1(kept.measured_cents),
      onset_ms: round1(kept.measured_onset_ms),
    } },
    { turn: 5, role: "assistant", content: acousticAssistantContent(kept.measured_cents, kept.measured_onset_ms, kept.gold, acousticTargetOf(opts)) },
  ];
  return baseRecord(song, "acoustic", id, split, {
    family: "acoustic", answer: kept.gold, engine: "YIN+SuperFlux",
  }, session, {
    schema_version: opts.schema_version,
    thresholds: F5_THRESHOLDS,
    observation: {
      acoustic: {
        kind: kept.kind,
        notes: kept.notes,
        cents_shift: kept.cents_shift,
        delay_sec: kept.delay_sec,
        target_index: kept.target_index,
        measured_f0_hz: kept.measured_f0_hz,
        measured_cents: kept.measured_cents,
        measured_onset_ms: kept.measured_onset_ms,
        // Only the keys a corpus actually carries: the main corpus has `draw`,
        // the probe has `band`. An undefined key still changes the rebuilt
        // record's shape and fails rebuild-equals-committed.
        ...(opts.draw !== undefined ? { draw: opts.draw } : {}),
        ...(opts.band !== undefined ? { band: opts.band } : {}),
      },
    },
  });
}

export function buildAcousticRecord(
  song: SongEntry,
  split: "train" | "test",
  opts: V1BuildOpts = {},
): V1Record[] {
  const out: V1Record[] = [];
  const usedPaths = new Set<string>();
  for (const kind of F5_KINDS) {
    for (let draw = 0; draw < resolveF5Draws(); draw++) {
      const kept = tryBuildF5(song, kind, draw);
      if (!kept) continue;
      const rec = buildAcousticTake(song, kept, `acoustic:${song.id}:${kind}:${draw}`, split, { ...opts, draw });
      const path = rec.target_trace.session
        .flatMap((t) => (t.role === "assistant" && t.tool_calls ? t.tool_calls : []))
        .map((tc) => tc.arguments.path)
        .find((p) => typeof p === "string") as string | undefined;
      if (path) {
        if (usedPaths.has(path)) throw new Error(`opaque take path collision ${path}`);
        usedPaths.add(path);
      }
      out.push(rec);
    }
  }
  return out;
}

export function buildEnsembleRecords(): V1Record[] {
  const song = catalogSong();
  const cases: Array<{
    id: string;
    kind: "who_first" | "wrong_tone" | "drifted";
    chord: number[];
    firstId: string;
    secondId: string;
    firstStop: number;
    secondStop: number;
    pianoNotes: number[];
    otherId: string;
    otherNotes: number[];
    gold: string;
    splitKey: string;
  }> = [];

  for (const [name, chord] of [["C", [60, 64, 67]], ["G", [67, 71, 74]]] as const) {
    for (const first of ["piano", "synth"] as const) {
      const second = first === "piano" ? "synth" : "piano";
      cases.push({
        id: `ensemble:who_first:${name}:${first}`,
        kind: "who_first",
        chord: [...chord],
        firstId: first,
        secondId: second,
        firstStop: 0.4,
        secondStop: 0.9,
        pianoNotes: [...chord],
        otherId: "synth",
        otherNotes: [...chord],
        gold: first,
        splitKey: name,
      });
    }
    const wrong = name === "C" ? [60, 64, 68] : [67, 71, 75];
    cases.push({
      id: `ensemble:wrong_tone:${name}`,
      kind: "wrong_tone",
      chord: [...chord],
      firstId: "piano",
      secondId: "guitar",
      firstStop: 1.2,
      secondStop: 1.2,
      pianoNotes: [...chord],
      otherId: "guitar",
      otherNotes: wrong,
      gold: "guitar",
      splitKey: name,
    });
  }
  cases.push({
    id: "ensemble:drifted:C",
    kind: "drifted",
    chord: [60],
    firstId: "piano",
    secondId: "voice",
    firstStop: 1.2,
    secondStop: 1.2,
    pianoNotes: [60],
    otherId: "voice",
    otherNotes: [61],
    gold: "voice",
    splitKey: "C",
  });

  return cases.map((c) => {
    const ens = new Ensemble();
    ens.addInstrument({ id: "piano", label: "piano" });
    ens.addInstrument({ id: c.otherId, label: c.otherId });
    for (const n of c.pianoNotes) ens.noteOn("piano", { note: n, velocity: 90, atSec: 0 });
    for (const n of c.otherNotes) ens.noteOn(c.otherId, { note: n, velocity: 90, atSec: 0 });
    if (c.kind === "who_first") {
      ens.allNotesOff(c.firstId, c.firstStop);
      ens.allNotesOff(c.secondId, c.secondStop);
    }
    const view = ens.view(1.3);
    const slim = {
      atSec: view.atSec,
      instruments: view.instruments.map((i) => ({
        id: i.id,
        sounding: i.sounding.map((n) => ({ note: n.note, startedSec: n.startedSec, heldSec: n.heldSec })),
        recentlyReleased: i.recentlyReleased.map((n) => ({
          note: n.note, startedSec: n.startedSec, heldSec: n.heldSec,
        })),
      })),
    };
    const user =
      c.kind === "who_first"
        ? "Two instruments just finished a chord. Who stopped first?"
        : c.kind === "wrong_tone"
          ? "Two instruments are holding a triad. Which one is playing the wrong chord tone?"
          : "Two instruments should be in unison. Which one drifted?";
    const session: Turn[] = [
      { turn: 1, role: "user", content: ask("ensemble", user) },
      {
        turn: 2, role: "assistant",
        content: "Reading the live ensemble.",
        tool_calls: [{ tool: "ensemble_now", arguments: {} }],
      },
      { turn: 3, role: "tool", tool: "ensemble_now", content: roundToolNumbers(slim) },
      { turn: 4, role: "assistant", content: c.gold },
    ];
    const rec = baseRecord(song, "ensemble", c.id, c.splitKey === "G" ? "test" : "train", {
      family: "ensemble", answer: c.gold, engine: "Ensemble.view",
    }, session, {
      phrase_window: c.splitKey,
      observation: {
        ensemble: {
          kind: c.kind,
          pianoNotes: c.pianoNotes,
          otherId: c.otherId,
          otherNotes: c.otherNotes,
          firstId: c.firstId,
          secondId: c.secondId,
          firstStop: c.firstStop,
          secondStop: c.secondStop,
        },
      },
    });
    return rec;
  });
}

export function assignSplit(songId: string, testIds: Set<string>): "train" | "test" {
  return testIds.has(songId) ? "test" : "train";
}

export function testSongIds(songs: SongEntry[]): Set<string> {
  const ids = songs.map((s) => s.id);
  const nTest = Math.max(1, Math.floor(ids.length / 3));
  return new Set(ids.slice(-nTest));
}

export function buildAllRecords(opts: V1BuildOpts = {}): V1Record[] {
  resetF5DropStats();
  const songs = loadPublishableSongs();
  if (songs.length < 11) {
    throw new Error(`publishable shelf has ${songs.length} songs, need >= 11`);
  }
  const testIds = testSongIds(songs);
  const records: V1Record[] = [];
  for (const song of songs) {
    const split = assignSplit(song.id, testIds);
    const chord = buildChordRecord(song, split);
    if (chord) records.push(chord);
    records.push(buildMeasuresRecord(song, split));
    records.push(buildTransposeRecord(song, split));
    records.push(buildTeachingGoalsRecord(song, split));
    const km = buildKeyMomentsRecord(song, split);
    if (km) records.push(km);
    records.push(...buildHarmonyRecords(song, split, opts));
    records.push(...buildAcousticRecord(song, split, opts));
  }
  records.push(...buildEnsembleRecords());
  for (const p of pickComparePairs(songs, testIds)) {
    records.push(buildCompareRecord(p.a, p.b, p.split, opts));
  }
  const takePaths = new Set<string>();
  for (const r of records) {
    if (r.family !== "acoustic") continue;
    const paths = new Set<string>();
    for (const turn of r.target_trace.session) {
      if (turn.role !== "assistant" || !turn.tool_calls) continue;
      for (const tc of turn.tool_calls) {
        const p = tc.arguments.path;
        if (typeof p === "string") paths.add(p);
      }
    }
    if (paths.size !== 1) throw new Error(`${r.id}: expected one opaque take path, got ${[...paths].join(",")}`);
    const path = [...paths][0]!;
    if (takePaths.has(path)) throw new Error(`opaque take path collision ${path} on ${r.id}`);
    takePaths.add(path);
  }
  records.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return records;
}

export function toolSequenceOf(rec: V1Record): string {
  const tools: string[] = [];
  for (const turn of rec.target_trace.session) {
    if (turn.role === "assistant" && turn.tool_calls) {
      for (const tc of turn.tool_calls) tools.push(tc.tool);
    }
  }
  return tools.join(">");
}

export function rederiveGold(rec: V1Record): string {
  const songs = loadPublishableSongs();
  const family = rec.observation.gold.family;
  if (family === "compare") {
    const [a, b] = rec.scope.song_id.split("|") as [string, string];
    const sa = songs.find((s) => s.id === a);
    const sb = songs.find((s) => s.id === b);
    if (!sa || !sb) throw new Error(`missing compare pair ${rec.scope.song_id}`);
    return sa.key === sb.key ? "same_key" : "different_key";
  }
  const song = songs.find((s) => s.id === rec.scope.song_id);
  if (!song) throw new Error(`missing song ${rec.scope.song_id}`);
  if (family === "chord") {
    const hit = agreeingChordMeasure(song);
    if (!hit) throw new Error(`chord unconfirmable for ${song.id}`);
    return hit.chord;
  }
  if (family === "measures") return String(song.measures.length);
  if (family === "transpose") return transposeSong(song, 2).key;
  if (family === "teaching_goals") return String(song.musicalLanguage.teachingGoals.length);
  if (family === "key_moments") {
    const span = firstMeasureSpan(song.musicalLanguage.keyMoments[0] ?? "");
    if (!span) throw new Error(`no keyMoment span for ${song.id}`);
    return span;
  }
  if (family === "harmony") {
    const h = rec.observation.harmony as { melody: { number: number; rightHand: string }[]; reharmonization: ReharmonizedMeasure[]; key: string };
    return verifyHarmony(h.melody, h.reharmonization, { key: h.key }).verified ? "verified" : "rejected";
  }
  if (family === "acoustic") {
    const a = rec.observation.acoustic as {
      kind: "clean" | "sharp_fail" | "late_fail";
      notes: { midi: number; name: string; time: number; duration: number }[];
      cents_shift: number;
      delay_sec: number;
    };
    const gold = rederiveF5Gold(a.kind, a.notes, a.cents_shift, a.delay_sec);
    if (gold == null) throw new Error(`F5 untrackable on rederive ${rec.id}`);
    return gold;
  }
  if (family === "ensemble") {
    const e = rec.observation.ensemble as {
      kind: string;
      pianoNotes: number[];
      otherId: string;
      otherNotes: number[];
      firstId: string;
      secondId: string;
      firstStop: number;
      secondStop: number;
    };
    const ens = new Ensemble();
    ens.addInstrument({ id: "piano" });
    ens.addInstrument({ id: e.otherId });
    for (const n of e.pianoNotes) ens.noteOn("piano", { note: n, velocity: 90, atSec: 0 });
    for (const n of e.otherNotes) ens.noteOn(e.otherId, { note: n, velocity: 90, atSec: 0 });
    if (e.kind === "who_first") {
      ens.allNotesOff(e.firstId, e.firstStop);
      ens.allNotesOff(e.secondId, e.secondStop);
    }
    const view = ens.view(1.3);
    if (e.kind === "who_first") {
      let best: { id: string; t: number } | null = null;
      for (const inst of view.instruments) {
        for (const n of inst.recentlyReleased) {
          const t = n.startedSec + n.heldSec;
          if (!best || t < best.t) best = { id: inst.id, t };
        }
      }
      return best?.id ?? "";
    }
    if (e.kind === "wrong_tone") {
      const piano = new Set(e.pianoNotes);
      const other = e.otherNotes.filter((n) => !piano.has(n));
      return other.length ? e.otherId : "piano";
    }
    return e.otherNotes[0] !== e.pianoNotes[0] ? e.otherId : "piano";
  }
  throw new Error(`unknown family ${family}`);
}
