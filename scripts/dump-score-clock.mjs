/** Dump piano RH onsets vs New Britain grid (Fable timing instrument). */
import { initializeFromLibrary, getSong } from "../src/songs/index.ts";
import { extractMelodyNotes } from "../src/vocal/melody-notes.ts";
import { AMAZING_GRACE_TUNE, realizeVocalTune } from "../src/vocal/tunes.ts";
import { join } from "node:path";

function name(m) {
  const n = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return n[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

initializeFromLibrary(
  join(process.cwd(), "songs", "library"),
  join(process.env.USERPROFILE ?? "", ".ai-jam-sessions", "songs"),
);
const song = getSong("amazing-grace");
const piano = extractMelodyNotes(song, { startMeasure: 1, endMeasure: 10, fitVoiceRange: false });
const hymn = realizeVocalTune(song, AMAZING_GRACE_TUNE, { startMeasure: 1, endMeasure: 10 });
process.stdout.write(JSON.stringify({
  song_id: song.id,
  bpm: hymn.effectiveBpm,
  sample_rate: 48000,
  piano: piano.notes.map((n) => ({
    t_sec: +n.startSec.toFixed(4),
    dur_sec: +n.durationSec.toFixed(4),
    midi: n.midi,
    name: name(n.midi),
  })),
  hymn_grid: hymn.notes.map((n) => ({
    t_sec: +n.startSec.toFixed(4),
    dur_sec: +n.durationSec.toFixed(4),
    midi: n.midi,
    name: name(n.midi),
  })),
}, null, 2) + "\n");
