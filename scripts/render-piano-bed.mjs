/**
 * Bounce the piano bed for a score clock — deterministically, offline.
 *
 *   pnpm exec tsx scripts/render-piano-bed.mjs \
 *       [--clock scores/amazing-grace.score-clock.v1.json] \
 *       [--out tmp/vocal-clock/piano-bed.wav]
 *
 * The session's live path (`Session.play` → `playNote` → setTimeout) is a
 * real-time sleep chain: every beat inherits timer jitter, so a recording of
 * it is not on the clock. This renders the SAME session-nominal schedule
 * (src/vocal/score-clock.ts `sessionSchedule`) into an OfflineAudioContext
 * whose length IS `clock.total_samples`, scheduling every note-on/off with
 * `OfflineAudioContext.suspend(t)` (quantised to the 128-sample render
 * quantum: ≤ 2.7 ms, always late, measured 1.35 ms on this rig).
 *
 * Engine: the sampled Concert Grand when a Salamander pack is installed
 * (`AI_JAM_SAMPLES_DIR` / samples/AccurateSalamander), else the tuned
 * oscillator "grand" voice — the same choice `play-comfy-over-piano.mjs`
 * makes, so the bed is the piano the Director hears from this repo.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { OfflineAudioContext } from "node-web-audio-api";
import { initializeFromLibrary, getSong } from "../src/songs/index.ts";
import { createSampleEngine } from "../src/sample-engine.ts";
import { createAudioEngine } from "../src/audio-engine.ts";
import { preferredPianoEngineId, resolvePianoSamplesDir } from "../src/sample-paths.ts";
import { sessionSchedule } from "../src/vocal/score-clock.ts";

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const clockPath = opt("clock", join("scores", "amazing-grace.score-clock.v1.json"));
const outPath = opt("out", join("tmp", "vocal-clock", "piano-bed.wav"));

const clock = JSON.parse(readFileSync(clockPath, "utf8"));
if (clock.schema !== "ai-jam-sessions/score-clock/v1") throw new Error(`unexpected clock schema ${clock.schema}`);
const sr = clock.sample_rate;
const totalSamples = clock.total_samples;
const [startMeasure, endMeasure] = clock.clock.bed_measures;

initializeFromLibrary(
  join(process.cwd(), "songs", "library"),
  join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".ai-jam-sessions", "songs"),
);
const song = getSong(clock.song_id);
if (!song) throw new Error(`song ${clock.song_id} not in library`);

const schedule = sessionSchedule(song, startMeasure, endMeasure, clock.bpm);
if (Math.round(schedule.endSec * sr) !== totalSamples) {
  throw new Error(`schedule length ${schedule.endSec}s does not match clock total ${clock.total_seconds}s`);
}

const ctx = new OfflineAudioContext(2, totalSamples, sr);
const samplesDir = resolvePianoSamplesDir();
const engineId = samplesDir && preferredPianoEngineId() === "sample" ? "sample" : "oscillator-grand";
const piano = engineId === "sample"
  ? createSampleEngine({ samplesDir, audioContext: ctx })
  : createAudioEngine("grand", { audioContext: ctx });
await piano.connect();

// Group note-on/off by render quantum; suspend() wants unique, increasing times.
const QUANTUM = 128;
const groups = new Map();
const add = (t, fn) => {
  const q = Math.floor(Math.round(t * sr) / QUANTUM);
  if (q * QUANTUM >= totalSamples) return; // beyond the bounce
  if (!groups.has(q)) groups.set(q, []);
  groups.get(q).push(fn);
};
for (const n of schedule.notes) {
  add(n.t, () => piano.noteOn(n.midi, n.velocity, 0));
  add(n.t + n.dur, () => piano.noteOff(n.midi, 0));
}
const quanta = [...groups.keys()].sort((a, b) => a - b);
// Receipt of when the engine was actually told to start each note: the
// nominal clock time vs the context time the callback ran at (quantised).
const scheduled = [];
const noteOnsAt = new Map();
for (const n of schedule.notes) {
  const q = Math.floor(Math.round(n.t * sr) / QUANTUM);
  if (!noteOnsAt.has(q)) noteOnsAt.set(q, []);
  noteOnsAt.get(q).push(n);
}
const record = (q, actual) => {
  for (const n of noteOnsAt.get(q) ?? []) {
    scheduled.push({ measure: n.measure, hand: n.hand, midi: n.midi, t_nominal: +n.t.toFixed(6), t_actual: +actual.toFixed(6), late_ms: +((actual - n.t) * 1000).toFixed(3) });
  }
};
for (const q of quanta) {
  const fns = groups.get(q);
  if (q === 0) {
    record(0, ctx.currentTime);
    for (const fn of fns) fn();
    continue;
  }
  const t = (q * QUANTUM) / sr;
  ctx.suspend(t).then(() => {
    record(q, ctx.currentTime);
    for (const fn of fns) fn();
    ctx.resume();
  });
}

const buffer = await ctx.startRendering();
if (buffer.length !== totalSamples) throw new Error(`rendered ${buffer.length} samples, expected ${totalSamples}`);

// 16-bit PCM stereo WAV
const ch0 = buffer.getChannelData(0);
const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
let peak = 0;
let sumSq = 0;
for (let i = 0; i < totalSamples; i++) {
  peak = Math.max(peak, Math.abs(ch0[i]), Math.abs(ch1[i]));
  sumSq += (ch0[i] * ch0[i] + ch1[i] * ch1[i]) / 2;
}
const rmsDb = 10 * Math.log10(sumSq / totalSamples + 1e-20);
if (peak > 0.999) console.error(`WARNING: bed peaks at ${peak.toFixed(3)} — clipping in the bounce`);
const data = Buffer.alloc(totalSamples * 4);
for (let i = 0; i < totalSamples; i++) {
  data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(ch0[i] * 32767))), i * 4);
  data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(ch1[i] * 32767))), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write("RIFF", 0); header.writeUInt32LE(36 + data.length, 4); header.write("WAVE", 8);
header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
header.writeUInt32LE(sr, 24); header.writeUInt32LE(sr * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
header.write("data", 36); header.writeUInt32LE(data.length, 40);
const wav = Buffer.concat([header, data]);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, wav);

let firstNonZero = -1;
for (let i = 0; i < totalSamples; i++) if (Math.abs(ch0[i]) > 1e-4 || Math.abs(ch1[i]) > 1e-4) { firstNonZero = i; break; }
const receipt = {
  clock: clockPath.replace(/\\/g, "/"),
  bed: outPath.replace(/\\/g, "/"),
  engine: engineId,
  samples_dir: samplesDir,
  sample_rate: sr,
  channels: 2,
  bit_depth: 16,
  total_samples: totalSamples,
  total_seconds: totalSamples / sr,
  notes_scheduled: schedule.notes.length,
  suspend_points: quanta.length,
  quantum_samples: QUANTUM,
  max_schedule_late_ms: +((QUANTUM / sr) * 1000).toFixed(3),
  first_nonzero_sample: firstNonZero,
  peak,
  rms_db: +rmsDb.toFixed(2),
  sha256: createHash("sha256").update(wav).digest("hex"),
  max_late_ms: Math.max(...scheduled.map((s) => s.late_ms)),
  scheduled,
};
writeFileSync(outPath.replace(/\.wav$/, ".receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
console.error(`bed: ${outPath} ${engineId} ${totalSamples} samples (${(totalSamples / sr).toFixed(3)}s) peak ${peak.toFixed(3)} rms ${rmsDb.toFixed(1)} dB, ${schedule.notes.length} notes, first sound @ sample ${firstNonZero}`);
try { await piano.disconnect(); } catch { /* offline context has no close */ }
process.exit(0);
