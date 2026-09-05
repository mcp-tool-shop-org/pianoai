/**
 * Canonical sung lines. Library MIDI is often an accompaniment, not the
 * tune — Amazing Grace's RH is chord stacks, so "highest note per beat"
 * does not hum New Britain. Events sit inside each arrangement measure
 * (3/4: beat 0–3) so they stay on the piano's clock.
 */

import { parseMeasure } from "../note-parser.js";
import type { SongEntry } from "../songs/types.js";
import type { ScoreNote } from "./types.js";

export interface TuneNote {
  measure: number;
  beat: number;
  durBeats: number;
  midi: number;
}

export interface VocalTune {
  id: string;
  lyrics: string;
  notes: TuneNote[];
}

/** New Britain in Eb: 5=Bb3, 1=Eb4, 3=G4, 6=C4, 4=Ab3. */
const EB = { 1: 63, 3: 67, 4: 56, 5: 58, 6: 60 } as const;

export const AMAZING_GRACE_TUNE: VocalTune = {
  id: "amazing-grace",
  lyrics: "A-ma-zing grace how sweet the sound that saved a wretch like me",
  notes: [
    { measure: 1, beat: 2, durBeats: 1, midi: EB[5] },
    { measure: 2, beat: 0, durBeats: 2, midi: EB[1] },
    { measure: 2, beat: 2, durBeats: 1, midi: EB[3] },
    { measure: 3, beat: 0, durBeats: 3, midi: EB[1] },
    { measure: 4, beat: 0, durBeats: 2, midi: EB[6] },
    { measure: 4, beat: 2, durBeats: 1, midi: EB[4] },
    { measure: 5, beat: 0, durBeats: 3, midi: EB[6] },
    { measure: 6, beat: 0, durBeats: 3, midi: EB[5] },
    { measure: 7, beat: 0, durBeats: 2, midi: EB[5] },
    { measure: 7, beat: 2, durBeats: 1, midi: EB[5] },
    { measure: 8, beat: 0, durBeats: 2, midi: EB[1] },
    { measure: 8, beat: 2, durBeats: 1, midi: EB[3] },
    { measure: 9, beat: 0, durBeats: 3, midi: EB[1] },
    { measure: 10, beat: 0, durBeats: 3, midi: EB[1] },
  ],
};

const TUNES: Record<string, VocalTune> = {
  [AMAZING_GRACE_TUNE.id]: AMAZING_GRACE_TUNE,
};

export function getVocalTune(songId: string): VocalTune | undefined {
  return TUNES[songId];
}

function measureDurationSec(song: SongEntry, measureNumber: number, bpm: number): number {
  const measure = song.measures.find((m) => m.number === measureNumber);
  if (!measure) return 0;
  const pm = parseMeasure(measure, bpm);
  const sum = (beats: typeof pm.rightBeats) =>
    beats.reduce((s, b) => s + (b.notes[0]?.durationMs ?? 0), 0);
  return Math.max(sum(pm.rightBeats), sum(pm.leftBeats), 0) / 1000;
}

export function measureStartsSec(
  song: SongEntry,
  bpm: number,
): Map<number, { start: number; dur: number }> {
  const out = new Map<number, { start: number; dur: number }>();
  let t = 0;
  for (const m of song.measures) {
    const dur = measureDurationSec(song, m.number, bpm);
    out.set(m.number, { start: t, dur });
    t += dur;
  }
  return out;
}

export function realizeVocalTune(
  song: SongEntry,
  tune: VocalTune,
  options: { startMeasure?: number; endMeasure?: number; tempo?: number; speed?: number } = {},
): { notes: ScoreNote[]; lyrics: string; warnings: string[]; effectiveBpm: number } {
  const bpm = (options.tempo ?? song.tempo) * (options.speed ?? 1);
  const start = options.startMeasure ?? 1;
  const end = options.endMeasure ?? song.measures.length;
  const timeline = measureStartsSec(song, bpm);
  const notes: ScoreNote[] = [];
  const warnings: string[] = [];

  for (let i = 0; i < tune.notes.length; i++) {
    const ev = tune.notes[i];
    if (ev.measure < start || ev.measure > end) continue;
    const bar = timeline.get(ev.measure);
    if (!bar || bar.dur <= 0) {
      warnings.push(`tune note ${i} measure ${ev.measure} missing from arrangement`);
      continue;
    }
    const beatSec = bar.dur / 3;
    notes.push({
      id: `tune-m${ev.measure}-${i}`,
      startSec: bar.start + ev.beat * beatSec,
      durationSec: Math.max(0.05, ev.durBeats * beatSec),
      midi: ev.midi,
      velocity: 0.78,
    });
  }

  if (notes.length === 0) {
    warnings.push(`vocal tune '${tune.id}' had no notes in measures ${start}-${end}`);
  }

  return { notes, lyrics: tune.lyrics, warnings, effectiveBpm: bpm };
}
