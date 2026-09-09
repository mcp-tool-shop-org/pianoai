// ─── Human-audio panel song catalog (browser-safe, library-derived) ───────────
//
// Slice A cannot import src/songs/library.ts (node:fs). This module bakes the
// four-song default set: melody notes come from the library MIDI right-hand
// (roll-range, one voice per onset). Chord symbols are the standard lead-sheet
// changes for the excerpt so the shipped realizers have a valid progression to
// voice — the MIDI-file inferChord/analyzeHarmony labels for these arrangements
// are too sparse/noisy for a listening test (N/C, Faug). The frozen library
// files themselves are not edited.
// ─────────────────────────────────────────────────────────────────────────────

export interface CatalogMelodyNote {
  midi: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
}

export interface CatalogChord {
  measure: number;
  chordSymbol: string;
}

export interface HumanAudioSong {
  id: string;
  title: string;
  composer: string;
  genre: string;
  key: string;
  bpm: number;
  timeSignature: string;
  beatsPerMeasure: number;
  measures: number;
  chords: CatalogChord[];
  melody: CatalogMelodyNote[];
}

const n = (
  midi: number,
  startBeat: number,
  durationBeats: number,
  velocity = 96,
): CatalogMelodyNote => ({ midi, startBeat, durationBeats, velocity });

const SATIE: HumanAudioSong = {
  id: "satie-gymnopedie-no1",
  title: "Gymnopedie No. 1",
  composer: "Erik Satie",
  genre: "classical",
  key: "D major",
  bpm: 60,
  timeSignature: "3/4",
  beatsPerMeasure: 3,
  measures: 8,
  chords: [
    { measure: 1, chordSymbol: "Gmaj7" },
    { measure: 2, chordSymbol: "Dmaj7" },
    { measure: 3, chordSymbol: "Gmaj7" },
    { measure: 4, chordSymbol: "Dmaj7" },
    { measure: 5, chordSymbol: "Gmaj7" },
    { measure: 6, chordSymbol: "Dmaj7" },
    { measure: 7, chordSymbol: "Gmaj7" },
    { measure: 8, chordSymbol: "Dmaj7" },
  ],
  melody: [
    n(66, 0, 2), n(66, 3, 2), n(66, 6, 2), n(66, 9, 2),
    n(78, 12, 2), n(81, 14, 1), n(79, 15, 1), n(78, 16, 2),
    n(73, 18, 1), n(73, 19, 2), n(74, 21, 1), n(66, 24, 2),
  ],
};

const AUTUMN: HumanAudioSong = {
  id: "autumn-leaves",
  title: "Autumn Leaves",
  composer: "Joseph Kosma",
  genre: "jazz",
  key: "G minor",
  bpm: 100,
  timeSignature: "4/4",
  beatsPerMeasure: 4,
  measures: 8,
  chords: [
    { measure: 1, chordSymbol: "Cm7" },
    { measure: 2, chordSymbol: "F7" },
    { measure: 3, chordSymbol: "Bbmaj7" },
    { measure: 4, chordSymbol: "Ebmaj7" },
    { measure: 5, chordSymbol: "Am7b5" },
    { measure: 6, chordSymbol: "D7" },
    { measure: 7, chordSymbol: "Gm" },
    { measure: 8, chordSymbol: "Gm" },
  ],
  // Library RH (roll-range, one voice per onset), first 8 bars.
  melody: [
    n(67, 4, 3), n(62, 8, 4), n(66, 12, 1), n(69, 13, 3),
    n(62, 16, 2), n(72, 24, 4), n(72, 28, 4),
  ],
};

const IMAGINE: HumanAudioSong = {
  id: "imagine",
  title: "Imagine",
  composer: "John Lennon",
  genre: "pop",
  key: "C major",
  bpm: 76,
  timeSignature: "4/4",
  beatsPerMeasure: 4,
  measures: 8,
  chords: [
    { measure: 1, chordSymbol: "C" },
    { measure: 2, chordSymbol: "Cmaj7" },
    { measure: 3, chordSymbol: "F" },
    { measure: 4, chordSymbol: "F" },
    { measure: 5, chordSymbol: "C" },
    { measure: 6, chordSymbol: "Cmaj7" },
    { measure: 7, chordSymbol: "F" },
    { measure: 8, chordSymbol: "F" },
  ],
  melody: [
    n(60, 8, 0.5), n(60, 8.5, 0.5), n(60, 9, 0.5), n(60, 9.5, 0.5),
    n(60, 10, 0.5), n(60, 10.5, 0.5), n(62, 12, 0.5), n(62, 12.5, 0.5),
    n(60, 16, 0.5), n(60, 16.5, 0.5), n(60, 17, 0.5), n(60, 17.5, 0.5),
    n(60, 18, 0.5), n(60, 18.5, 0.5), n(62, 20, 0.5), n(67, 20.5, 0.25),
    n(67, 20.75, 0.25), n(67, 21, 0.5), n(67, 21.5, 1), n(71, 22.5, 0.5),
    n(71, 23, 0.25), n(69, 23.25, 2), n(60, 24, 0.5), n(60, 24.5, 0.5),
    n(60, 25, 0.5), n(62, 28, 0.5), n(67, 28.5, 0.25), n(67, 28.75, 1),
    n(67, 29.75, 1), n(71, 30.75, 1), n(71, 31.75, 0.25), n(69, 32, 2),
  ],
};

const FALLIN: HumanAudioSong = {
  id: "fallin",
  title: "Fallin'",
  composer: "Alicia Keys",
  genre: "rnb",
  key: "E minor",
  bpm: 96,
  timeSignature: "6/8",
  beatsPerMeasure: 3,
  measures: 8,
  chords: [
    { measure: 1, chordSymbol: "Em" },
    { measure: 2, chordSymbol: "D" },
    { measure: 3, chordSymbol: "C" },
    { measure: 4, chordSymbol: "B7" },
    { measure: 5, chordSymbol: "Em" },
    { measure: 6, chordSymbol: "D" },
    { measure: 7, chordSymbol: "C" },
    { measure: 8, chordSymbol: "B7" },
  ],
  melody: [
    n(63, 6, 4), n(81, 9, 1), n(79, 10, 1), n(83, 11, 3),
    n(81, 12, 1), n(71, 14, 4), n(79, 15, 1), n(76, 16, 0.5),
    n(81, 16.5, 1), n(79, 17.5, 1), n(71, 18, 2), n(81, 18.5, 0.5),
    n(79, 19, 1), n(74, 19.5, 1), n(79, 20.5, 0.5), n(76, 21, 1), n(74, 22, 1),
  ],
};

/** Genre-diverse default set for a human-audio run. */
export const DEFAULT_PANEL_SONGS: HumanAudioSong[] = [SATIE, AUTUMN, IMAGINE, FALLIN];

export function getPanelSong(id: string): HumanAudioSong | undefined {
  return DEFAULT_PANEL_SONGS.find((s) => s.id === id);
}

export function listPanelSongs(): Array<{ id: string; title: string; genre: string; key: string }> {
  return DEFAULT_PANEL_SONGS.map(({ id, title, genre, key }) => ({ id, title, genre, key }));
}
