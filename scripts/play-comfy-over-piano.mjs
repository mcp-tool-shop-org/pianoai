/**
 * Play the Comfy Seed vocal over the Amazing Grace piano (measures 1–10).
 * Same shared AudioContext — two contexts would mute one of them.
 *
 * Both start at t=0, so the vocal must ALREADY be on the score clock
 * (scores/amazing-grace.score-clock.v1.json): a raw generator take is not —
 * run scripts/vocal_clock.py (plan → place → verify) first and pass the
 * placed stem. Live playback here sleeps beat by beat (timer jitter); the
 * gated artifact is the offline mix from `vocal_clock.py mix`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { initializeFromLibrary, getSong } from "../src/songs/index.ts";
import { createSession } from "../src/session.ts";
import { createSampleEngine } from "../src/sample-engine.ts";
import { preferredPianoEngineId, resolvePianoSamplesDir } from "../src/sample-paths.ts";
import { getSharedAudioContext } from "../src/audio-shared.ts";
import { createAudioEngine } from "../src/audio-engine.ts";

function readWav(path) {
  const buf = readFileSync(path);
  const sr = buf.readUInt32LE(24);
  const ch = buf.readUInt16LE(22);
  const bps = buf.readUInt16LE(34);
  if (bps !== 16) throw new Error(`need 16-bit wav, got ${bps}`);
  const frames = Math.floor((buf.length - 44) / 2 / ch);
  const channels = [];
  for (let c = 0; c < ch; c++) channels.push(new Float32Array(frames));
  let o = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      channels[c][i] = buf.readInt16LE(o) / 32768;
      o += 2;
    }
  }
  return { sr, ch, frames, channels };
}

async function main() {
  const wavPath = process.argv[2] ?? join("tmp", "vocal-clock", "amazing-grace-vocal-placed.wav");
  const vocal = readWav(wavPath);
  initializeFromLibrary(join(process.cwd(), "songs", "library"), join(process.env.USERPROFILE ?? "", ".ai-jam-sessions", "songs"));
  const song = getSong("amazing-grace");
  const samplesDir = resolvePianoSamplesDir();
  const piano = samplesDir && preferredPianoEngineId() === "sample"
    ? createSampleEngine({ samplesDir })
    : createAudioEngine({ instrument: "piano" });

  await piano.connect();
  const ctx = getSharedAudioContext();
  if (!ctx) throw new Error("piano did not publish a shared AudioContext");

  const nCh = Math.min(vocal.ch, 2);
  const buffer = ctx.createBuffer(nCh, vocal.frames, ctx.sampleRate || vocal.sr);
  for (let c = 0; c < nCh; c++) {
    const ch = buffer.getChannelData(c);
    const src = vocal.channels[Math.min(c, vocal.channels.length - 1)];
    ch.set(src.subarray(0, ch.length));
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = 0.85;
  src.connect(gain);
  gain.connect(ctx.destination);

  const session = createSession(song, piano, {
    mode: "loop",
    loopRange: [1, 10],
    loopOnce: true,
  });

  console.log("Playing Amazing Grace mm.1–10 — Comfy Seed vocal over piano");
  src.start(0);
  await session.play();
  try { src.stop(); } catch { /* ended */ }
  await piano.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
