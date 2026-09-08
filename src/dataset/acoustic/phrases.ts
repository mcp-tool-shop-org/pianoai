// ─── Four-note monophonic reductions of library phrases ──────────────────────
//
// The 36-count is 9 kinds × 4 target notes. A 4-measure Bach arpeggio has far
// more notes; reducing to the first four right-hand onsets keeps that count
// honest. This is a pedagogical slice, not a musical edition of the piece.
//
// Source events are READ from jam-actions-v0 records (the DOI corpus is not
// modified). clair-de-lune is forbidden: it is the held-out test split of the
// published fine-tune arc.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Provenance } from "../schema.js";
import type { PhraseNote } from "./schema.js";
import type { PhraseSpec } from "./builder.js";

const FORBIDDEN_SONG_IDS = new Set(["clair-de-lune"]);

const REPO_RECORDS = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..",
  "datasets", "jam-actions-v0", "records",
);

interface SidecarEvent {
  t_seconds: number;
  dur_seconds: number;
  note: number;
  name: string;
  hand: string;
}

interface SourceRecord {
  provenance: Provenance;
  scope: { song_id: string; phrase_window: string; key: string; tempo_bpm: number; time_signature: string };
  observation: { midi_sidecar: { timed_events: SidecarEvent[] } };
}

function loadSource(filename: string): SourceRecord {
  const raw = JSON.parse(readFileSync(join(REPO_RECORDS, filename), "utf8")) as SourceRecord;
  if (FORBIDDEN_SONG_IDS.has(raw.scope.song_id)) {
    throw new Error(`Refusing to load ${raw.scope.song_id}: it is the published fine-tune holdout.`);
  }
  return raw;
}

function firstFourRightHand(events: SidecarEvent[]): PhraseNote[] {
  const rh = events
    .filter((e) => e.hand === "right")
    .slice()
    .sort((a, b) => a.t_seconds - b.t_seconds);
  if (rh.length < 4) {
    throw new Error(`Need 4 right-hand onsets, got ${rh.length}`);
  }
  const four = rh.slice(0, 4);
  const t0 = four[0]!.t_seconds;
  return four.map((e) => ({
    midi: e.note,
    name: e.name,
    time: e.t_seconds - t0,
    duration: Math.min(0.5, e.dur_seconds),
  }));
}

function phraseFromRecord(
  filename: string,
  meta: { title: string; composer: string; composition_year: number; phrase_window: string },
): PhraseSpec {
  const src = loadSource(filename);
  const notes = firstFourRightHand(src.observation.midi_sidecar.timed_events);
  const provenance: Provenance = {
    ...src.provenance,
    verdict_reason:
      src.provenance.verdict_reason +
      " Acoustic take is a 4-note monophonic right-hand reduction rendered with fixtures-sine-v1, not the arrangement MIDI performance.",
  };
  return {
    song_id: src.scope.song_id,
    title: meta.title,
    composer: meta.composer,
    composition_year: meta.composition_year,
    key: src.scope.key,
    tempo_bpm: src.scope.tempo_bpm,
    time_signature: src.scope.time_signature,
    phrase_window: meta.phrase_window,
    notes,
    provenance,
  };
}

export const PHRASE_SPECS: readonly PhraseSpec[] = [
  phraseFromRecord("bach-prelude-c-major-bwv846-m001-004.json", {
    title: "Prelude in C Major, BWV 846",
    composer: "Johann Sebastian Bach",
    composition_year: 1722,
    phrase_window: "mm.1 RH 4-note reduction",
  }),
  phraseFromRecord("schumann-traumerei-m001-004.json", {
    title: "Träumerei from Kinderszenen",
    composer: "Robert Schumann",
    composition_year: 1838,
    phrase_window: "mm.1-4 RH 4-note reduction",
  }),
  phraseFromRecord("fur-elise-m001-008.json", {
    title: "Für Elise",
    composer: "Ludwig van Beethoven",
    composition_year: 1810,
    phrase_window: "mm.1-8 RH 4-note reduction",
  }),
];

export const TRAIN_SONG_IDS = ["bach-prelude-c-major-bwv846", "schumann-traumerei"] as const;
export const TEST_SONG_ID = "fur-elise" as const;

export function assertNoClairDeLune(songId: string): void {
  if (songId === "clair-de-lune" || FORBIDDEN_SONG_IDS.has(songId)) {
    throw new Error("clair-de-lune is forbidden in the acoustic corpus");
  }
}
