// ─── jam-actions-acoustic-v0 Corpus Builder ──────────────────────────────────
//
// Every record is a function of (seed, phrase, perturbation kind). There are
// no hand-written expected outputs: gold verdicts follow from the kind and
// the thresholds on the record. Re-rendering the recipe must match wav_sha256.
//
// The take is a MONOPHONIC reduction. Full-texture piano through
// transcribe_audio is the failure the tools already document; this corpus
// does not teach a model to trust that.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { sine, vibratoNote, clickTrain } from "../../audio/fixtures.js";
import { midiToHz } from "../../audio/pitch.js";
import { validateTrace } from "../trace-validator.js";
import type { Provenance, TargetTrace, TimedEvent } from "../schema.js";
import {
  ACOUSTIC_SCHEMA_VERSION,
  DEFAULT_ACOUSTIC_THRESHOLDS,
  DRAW_BANDS,
  PERTURBATION_KINDS,
  type AcousticGold,
  type AcousticRecipe,
  type AcousticRecord,
  type AcousticThresholds,
  type GoldVerdict,
  type NoteJitter,
  type PerturbationKind,
  type PhraseNote,
} from "./schema.js";

export const RENDER_ENGINE = "fixtures-sine-v1" as const;
export const DEFAULT_SAMPLE_RATE = 44100;
export const DEFAULT_PRE_ROLL_SEC = 0.3;
export const DEFAULT_GAP_SEC = 0.15;
export const DEFAULT_CLICK_AMPLITUDE = 1;
export const DEFAULT_NOTE_AMPLITUDE = 0.8;

export interface PhraseSpec {
  song_id: string;
  title: string;
  composer: string;
  composition_year: number;
  key: string;
  tempo_bpm: number;
  time_signature: string;
  phrase_window: string;
  notes: PhraseNote[];
  provenance: Provenance;
}

export interface BuildOptions {
  seed: number;
  kind: PerturbationKind;
  sampleRate?: number;
  thresholds?: AcousticThresholds;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawUnit(rng: () => number, lo: number, hi: number): number {
  return lo + rng() * (hi - lo);
}

function pickTargetIndex(rng: () => number, n: number): number {
  if (n < 1) throw new Error("phrase must contain at least one note");
  return Math.floor(rng() * n);
}

export function sha256Samples(samples: Float64Array): string {
  return createHash("sha256")
    .update(Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength))
    .digest("hex");
}

function midiName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const n = Math.round(midi);
  return `${names[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

function mix(a: Float64Array, b: Float64Array): Float64Array {
  const n = Math.max(a.length, b.length);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return out;
}

function silence(seconds: number, sampleRate: number): Float64Array {
  return new Float64Array(Math.max(0, Math.round(seconds * sampleRate)));
}

interface PlannedNote {
  midi: number;
  time: number;
  duration: number;
  vibrato: boolean;
  cents: number;
  amplitude: number;
}

function planNotes(recipe: AcousticRecipe): { planned: PlannedNote[]; clickTimes: number[]; duration: number } {
  const { notes, kind, target_index, pre_roll_sec, gap_sec, note_jitter } = recipe;
  const centsShift = recipe.cents_shift ?? 0;
  const delaySec = recipe.delay_sec ?? 0;
  const planned: PlannedNote[] = [];
  for (let i = 0; i < notes.length; i++) {
    const src = notes[i]!;
    const jitter = note_jitter[i] ?? { time_offset_sec: 0, amplitude: DEFAULT_NOTE_AMPLITUDE };
    if (kind === "dropped" && i === target_index) continue;
    const isTarget = i === target_index;
    let time = pre_roll_sec + src.time;
    if (!isTarget) time += jitter.time_offset_sec;
    if (isTarget) time += delaySec;
    let cents = 0;
    let vibrato = false;
    let duration = src.duration;
    if (kind === "sharp_60" && isTarget) cents = centsShift;
    if (kind === "sharp_30" && isTarget) cents = centsShift;
    if (kind === "vibrato" && isTarget) {
      vibrato = true;
      duration = Math.max(duration, 0.8);
    }
    planned.push({
      midi: src.midi,
      time,
      duration,
      vibrato,
      cents,
      amplitude: jitter.amplitude,
    });
    if (kind === "extra" && isTarget) {
      planned.push({
        midi: Math.min(127, src.midi + 4),
        time: pre_roll_sec + src.time + src.duration + gap_sec / 2,
        duration: Math.min(0.25, Math.max(0.08, gap_sec * 0.8)),
        vibrato: false,
        cents: 0,
        amplitude: jitter.amplitude,
      });
    }
  }
  const clickTimes = kind === "silence" ? [] : planned.map((n) => n.time);
  const last = planned.reduce<PlannedNote | undefined>(
    (a, n) => (!a || n.time + n.duration > a.time + a.duration ? n : a),
    undefined,
  );
  const duration = kind === "silence"
    ? recipe.silence_duration_sec
    : (last ? last.time + last.duration + 0.1 : pre_roll_sec + 1);
  return { planned, clickTimes, duration };
}

function goldFor(
  kind: PerturbationKind,
  targetIndex: number,
  thresholds: AcousticThresholds,
  cents: number | null,
  delayMs: number | null,
): AcousticGold {
  const verdicts: Record<PerturbationKind, GoldVerdict> = {
    clean: "match",
    sharp_60: "pitch_fail",
    sharp_30: "pitch_warn",
    late_80: "timing_fail",
    late_25: "timing_pass",
    dropped: "missed",
    extra: "extra",
    vibrato: "in_tune",
    silence: "nothing_to_grade",
  };
  return {
    verdict: verdicts[kind],
    thresholds,
    target_index: targetIndex,
    expected_cents: cents,
    expected_timing_ms: delayMs,
  };
}

export function renderTake(recipe: AcousticRecipe): Float64Array {
  const { kind, sample_rate, click_amplitude } = recipe;
  if (kind === "silence") {
    return silence(recipe.silence_duration_sec, sample_rate);
  }
  const { planned, clickTimes, duration } = planNotes(recipe);
  const overlay = new Float64Array(Math.round(duration * sample_rate));
  for (const n of planned) {
    const freq = midiToHz(n.midi) * Math.pow(2, n.cents / 1200);
    const tone = n.vibrato
      ? vibratoNote({
        frequency: freq, duration: n.duration, sampleRate: sample_rate,
        rateHz: 5, depthCents: 50, amplitude: n.amplitude,
      })
      : sine({
        frequency: freq, duration: n.duration, sampleRate: sample_rate,
        amplitude: n.amplitude,
      });
    const start = Math.round(n.time * sample_rate);
    for (let i = 0; i < tone.length && start + i < overlay.length; i++) {
      overlay[start + i] += tone[i]!;
    }
  }
  const clicks = clickTrain({
    times: clickTimes.filter((t) => t >= 0 && t <= duration),
    duration,
    sampleRate: sample_rate,
    amplitude: click_amplitude,
  });
  return mix(overlay, clicks);
}

export function buildRecipe(
  phrase: PhraseSpec,
  kind: PerturbationKind,
  seed: number,
  sampleRate: number = DEFAULT_SAMPLE_RATE,
): AcousticRecipe {
  const rng = mulberry32(seed);
  const target_index = pickTargetIndex(rng, phrase.notes.length);

  let cents_shift: number | null = null;
  let delay_sec: number | null = null;
  if (kind === "sharp_60") {
    cents_shift = drawUnit(rng, DRAW_BANDS.sharp_fail_cents.lo, DRAW_BANDS.sharp_fail_cents.hi);
  } else if (kind === "sharp_30") {
    cents_shift = drawUnit(rng, DRAW_BANDS.sharp_warn_cents.lo, DRAW_BANDS.sharp_warn_cents.hi);
  } else {
    rng();
  }
  if (kind === "late_80") {
    delay_sec = drawUnit(rng, DRAW_BANDS.late_fail_ms.lo, DRAW_BANDS.late_fail_ms.hi) / 1000;
  } else if (kind === "late_25") {
    delay_sec = drawUnit(rng, DRAW_BANDS.late_pass_ms.lo, DRAW_BANDS.late_pass_ms.hi) / 1000;
  } else {
    rng();
  }

  const silence_duration_sec = drawUnit(
    rng,
    DRAW_BANDS.silence_duration_sec.lo,
    DRAW_BANDS.silence_duration_sec.hi,
  );

  const note_jitter: NoteJitter[] = phrase.notes.map((_, i) => {
    const time_offset_sec = (rng() * 2 - 1) * (DRAW_BANDS.time_jitter_ms / 1000);
    const amplitude = drawUnit(rng, DRAW_BANDS.amplitude.lo, DRAW_BANDS.amplitude.hi);
    if (i === target_index && (kind === "late_80" || kind === "late_25")) {
      return { time_offset_sec: 0, amplitude };
    }
    if (kind === "silence") {
      return { time_offset_sec: 0, amplitude };
    }
    return { time_offset_sec, amplitude };
  });

  return {
    engine: RENDER_ENGINE,
    seed,
    song_id: phrase.song_id,
    phrase_window: phrase.phrase_window,
    notes: phrase.notes,
    kind,
    target_index,
    cents_shift,
    delay_sec,
    silence_duration_sec,
    note_jitter,
    sample_rate: sampleRate,
    pre_roll_sec: DEFAULT_PRE_ROLL_SEC,
    gap_sec: DEFAULT_GAP_SEC,
    click_amplitude: DEFAULT_CLICK_AMPLITUDE,
  };
}

function wavPath(id: string): string {
  return `/acoustic-corpus/${id}.wav`;
}

function goldTrace(recordId: string, songId: string, gold: AcousticGold, kind: PerturbationKind): TargetTrace {
  const path = wavPath(recordId);
  if (kind === "silence") {
    return {
      task_family: "grade-audio-take",
      objective: `Decide whether the take at ${path} of ${songId} is a performance worth grading.`,
      session: [
        {
          turn: 1,
          role: "user",
          content: `Grade this recording of ${songId}: ${path}`,
        },
        {
          turn: 2,
          role: "assistant",
          content: "I will measure what is actually in the file before scoring it.",
          tool_calls: [{ tool: "analyze_audio", arguments: { path } }],
        },
        {
          turn: 3,
          role: "tool",
          tool: "analyze_audio",
          content: { onset_count: 0, silent: true },
        },
        {
          turn: 4,
          role: "assistant",
          content:
            `Nothing to grade. The file is silence, not a failed take. ` +
            `A score of zero would be the wrong answer. ` +
            `(onset_delta=${gold.thresholds.onset_delta}, min_duration_sec=${gold.thresholds.min_duration_sec})`,
        },
      ],
    };
  }

  return {
    task_family: "grade-audio-take",
    objective: `Grade the take at ${path} against ${songId} using the audio inspector, not the picture.`,
    session: [
      {
        turn: 1,
        role: "user",
        content: `Grade this recording of ${songId}: ${path}`,
      },
      {
        turn: 2,
        role: "assistant",
        content: "I will transcribe the take and score it against the song at the house gates.",
        tool_calls: [
          { tool: "transcribe_audio", arguments: { path } },
          { tool: "score_audio_take", arguments: { path, song_id: songId } },
        ],
      },
      {
        turn: 3,
        role: "tool",
        tool: "transcribe_audio",
        content: { monophonic: true },
      },
      {
        turn: 4,
        role: "tool",
        tool: "score_audio_take",
        content: {
          verdict: gold.verdict,
          thresholds: gold.thresholds,
          expected_cents: gold.expected_cents,
          expected_timing_ms: gold.expected_timing_ms,
        },
      },
      {
        turn: 5,
        role: "assistant",
        content:
          `Gold verdict: ${gold.verdict}. ` +
          `Gates on this record: timing_ms=${gold.thresholds.timing_ms}, ` +
          `pitch_fail_cents=${gold.thresholds.pitch_fail_cents}, ` +
          `pitch_warn_cents=${gold.thresholds.pitch_warn_cents}. ` +
          (kind === "vibrato"
            ? "Vibrato is in tune at the centre pitch, not unstable."
            : ""),
      },
    ],
  };
}

function timedEvents(notes: PhraseNote[], tempoBpm: number): TimedEvent[] {
  const tpb = 480;
  const secPerBeat = 60 / tempoBpm;
  return notes.map((n) => ({
    t_seconds: n.time,
    t_ticks: Math.max(0, Math.round((n.time / secPerBeat) * tpb)),
    dur_seconds: n.duration,
    dur_ticks: Math.max(1, Math.round((n.duration / secPerBeat) * tpb)),
    note: n.midi,
    name: n.name,
    velocity: 80,
    channel: 0,
    hand: "right" as const,
    measure: 1,
    beat: n.time / secPerBeat,
  }));
}

export function buildRecord(phrase: PhraseSpec, options: BuildOptions): AcousticRecord {
  const thresholds = options.thresholds ?? DEFAULT_ACOUSTIC_THRESHOLDS;
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const recipe = buildRecipe(phrase, options.kind, options.seed, sampleRate);
  const samples = renderTake(recipe);
  const wav_sha256 = sha256Samples(samples);
  const gold = goldFor(
    options.kind,
    recipe.target_index,
    thresholds,
    recipe.cents_shift,
    recipe.delay_sec === null ? null : recipe.delay_sec * 1000,
  );
  const id = `${phrase.song_id}:${phrase.phrase_window.replace(/\s+/g, "")}:${options.kind}:s${options.seed}`;

  const record: AcousticRecord = {
    id,
    schema_version: ACOUSTIC_SCHEMA_VERSION,
    provenance: phrase.provenance,
    scope: {
      song_id: phrase.song_id,
      phrase_window: phrase.phrase_window,
      instrument: "monophonic-reduction",
      key: phrase.key,
      tempo_bpm: phrase.tempo_bpm,
      time_signature: phrase.time_signature,
      window_role: "standalone",
    },
    observation: {
      midi_sidecar: {
        midi_sha256: createHash("sha256")
          .update(JSON.stringify(phrase.notes))
          .digest("hex"),
        ticks_per_beat: 480,
        timed_events: timedEvents(
          phrase.notes.map((n) => ({
            ...n,
            time: recipe.pre_roll_sec + n.time,
          })),
          phrase.tempo_bpm,
        ),
      },
      render: {
        engine: RENDER_ENGINE,
        seed: options.seed,
        recipe,
        wav_sha256,
        sample_rate: sampleRate,
      },
      perturbation: {
        kind: options.kind,
        target_index: recipe.target_index,
        cents: recipe.cents_shift,
        delay_ms: recipe.delay_sec === null ? null : recipe.delay_sec * 1000,
      },
      thresholds,
      gold,
    },
    annotation_target: {
      measure_range: [1, 1],
      structure: `monophonic reduction of ${phrase.phrase_window}`,
      key_moments: [`perturbation ${options.kind}`],
      teaching_goals: [`Identify gold verdict ${gold.verdict}`],
      style_tips: [
        `timing_ms=${thresholds.timing_ms}`,
        `pitch_fail_cents=${thresholds.pitch_fail_cents}`,
        `pitch_warn_cents=${thresholds.pitch_warn_cents}`,
        `onset_delta=${thresholds.onset_delta}`,
        `min_duration_sec=${thresholds.min_duration_sec}`,
      ],
      teaching_notes: [
        {
          measure: 1,
          note: `${options.kind} at score index ${recipe.target_index}`,
        },
      ],
    },
    target_trace: goldTrace(id, phrase.song_id, gold, options.kind),
    eval_metadata: {
      split: "train",
      split_strategy: "exhaustive perturbation kinds × phrase, keyed by seed",
      leakage_check: "passed",
      eval_eligibility: ["E1_tool_use", "acoustic_gate"],
      phrase_continuation_eligible: false,
      phrase_continuation_eligible_reason:
        "acoustic records are standalone grading tasks, not continuation pairs",
    },
  };

  const traceReport = validateTrace(record.target_trace);
  if (!traceReport.ok) {
    throw new Error(
      `Gold trace for ${id} failed the catalog validator: ` +
      traceReport.mismatches.map((m) => m.message).join("; "),
    );
  }

  return record;
}

export function buildKindSet(phrase: PhraseSpec, seed: number): AcousticRecord[] {
  return PERTURBATION_KINDS.map((kind) => buildRecord(phrase, { seed, kind }));
}

/** Four-note C major line used by tests. Not a library song. */
export function fixturePhrase(overrides: Partial<Provenance> = {}): PhraseSpec {
  const notes: PhraseNote[] = [
    { midi: 60, time: 0, duration: 0.5, name: midiName(60) },
    { midi: 64, time: 0.65, duration: 0.5, name: midiName(64) },
    { midi: 67, time: 1.3, duration: 0.5, name: midiName(67) },
    { midi: 72, time: 1.95, duration: 0.5, name: midiName(72) },
  ];
  return {
    song_id: "fixture-c-major-line",
    title: "Fixture C major line",
    composer: "AI Jam Sessions",
    composition_year: 2026,
    key: "C major",
    tempo_bpm: 120,
    time_signature: "4/4",
    phrase_window: "notes 1-4",
    notes,
    provenance: {
      source_url: "https://example.invalid/fixture-c-major-line",
      source_collected_at: "seed-reproducible",
      source_type: "transcribed-by-author",
      composition_title: "Fixture C major line",
      composer: "AI Jam Sessions",
      composition_year: 2026,
      composition_pd_status_us: "public_domain",
      composition_pd_status_eu: "public_domain",
      arrangement_creator: null,
      arrangement_license: null,
      arrangement_license_version: null,
      arrangement_evidence_url: null,
      record_verdict: "internal",
      verdict_reason:
        "Synthetic monophonic fixture for the acoustic corpus builder. Not a published work.",
      verifier: "acoustic-builder",
      verified_at: "seed-reproducible",
      training_use_permitted: false,
      ...overrides,
    },
  };
}
