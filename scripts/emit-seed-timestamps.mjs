/**
 * Music-as-code: emit ByteDance Seed Audio [start:end] stamps from the
 * jam-sessions New Britain grid (fx-dub absolute timeline).
 *
 *   pnpm exec tsx scripts/emit-seed-timestamps.mjs
 */
import { initializeFromLibrary, getSong } from "../src/songs/index.ts";
import { AMAZING_GRACE_TUNE, realizeVocalTune } from "../src/vocal/tunes.ts";
import { join } from "node:path";

const SYL = "A-ma-zing grace how sweet the sound that saved a wretch like me".split(
  /[-\s]+/,
);

initializeFromLibrary(
  join(process.cwd(), "songs", "library"),
  join(process.env.USERPROFILE ?? "", ".ai-jam-sessions", "songs"),
);
const song = getSong("amazing-grace");
const { notes } = realizeVocalTune(song, AMAZING_GRACE_TUNE, {
  startMeasure: 1,
  endMeasure: 10,
});

const lines = notes.map((n, i) => {
  const a = n.startSec.toFixed(2);
  const b = (n.startSec + n.durationSec).toFixed(2);
  const word = SYL[i] ?? "";
  return `[${a}s:${b}s] ${word}`;
});

const prompt = [
  "One female singer, warm, hymn, a cappella lead, same person the whole time.",
  "Do not add extra words. Fit each line into its timestamp window.",
  "",
  ...lines,
].join("\n");

process.stdout.write(prompt + "\n");
