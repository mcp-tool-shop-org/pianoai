/**
 * Build the canonical score clock for a song's vocal line and write it to
 * `scores/<song>.score-clock.v1.json` (committed — it is the clock the bed
 * renderer and the vocal placement instrument both read).
 *
 *   pnpm exec tsx scripts/build-score-clock.mjs [--song amazing-grace]
 *       [--track TUBULARBEL] [--measures 1-10] [--out scores/...json] [--check]
 *
 * `--check` re-derives and exits 1 if the committed file differs (CI-style
 * drift guard). See src/vocal/score-clock.ts for what the clock means.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { initializeFromLibrary, getSong } from "../src/songs/index.ts";
import { deriveScoreClock } from "../src/vocal/score-clock.ts";
import { getVocalTune } from "../src/vocal/tunes.ts";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const songId = opt("song", "amazing-grace");
const track = opt("track", "TUBULARBEL");
const [startMeasure, endMeasure] = opt("measures", "1-10").split("-").map(Number);
const out = opt("out", join("scores", `${songId}.score-clock.v1.json`));
const check = args.includes("--check");

initializeFromLibrary(
  join(process.cwd(), "songs", "library"),
  join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".ai-jam-sessions", "songs"),
);
const song = getSong(songId);
if (!song) {
  console.error(`song '${songId}' not in the library`);
  process.exit(2);
}
const tune = getVocalTune(songId);
if (!tune) {
  console.error(`no vocal tune (lyrics) registered for '${songId}'`);
  process.exit(2);
}
const midiFile = join("songs", "library", song.genre, `${songId}.mid`);
if (!existsSync(midiFile)) {
  console.error(`no MIDI source at ${midiFile}`);
  process.exit(2);
}

const clock = deriveScoreClock(song, {
  midiFile: midiFile.replace(/\\/g, "/"),
  midiBytes: readFileSync(midiFile),
  melodyTrack: track,
  lyrics: tune.lyrics,
  startMeasure,
  endMeasure,
});
const text = JSON.stringify(clock, null, 2) + "\n";

if (check) {
  const current = existsSync(out) ? readFileSync(out, "utf8") : "";
  if (current !== text) {
    console.error(`score clock drift: ${out} does not match the derivation`);
    process.exit(1);
  }
  console.error(`score clock ${out} is current (${clock.events.length} events, ${clock.total_seconds}s)`);
  process.exit(0);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, text);
console.error(`wrote ${out}: ${clock.events.length} events, total ${clock.total_seconds}s (${clock.total_samples} samples @ ${clock.sample_rate})`);
for (const e of clock.events) {
  console.error(`  ${e.id} ${e.lyric.padEnd(6)} t=${e.t_sec.toFixed(4)} dur=${e.dur_sec.toFixed(4)} midi=${e.midi} ${e.anchor}`);
}
