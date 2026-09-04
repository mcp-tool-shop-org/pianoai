/**
 * CAST a Kokoro af_heart take per Amazing Grace syllable (fx-dub: CAST once).
 * Writes 16-bit WAVs under tmp/kokoro-lock/. Not a product dependency.
 *
 *   node scripts/cast-kokoro-lock.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "tmp", "kokoro-lock");
mkdirSync(outDir, { recursive: true });

const SYLLABLES = [
  "Ah",
  "mah",
  "zing",
  "grace",
  "how",
  "sweet",
  "the",
  "sound",
  "that",
  "saved",
  "a",
  "wretch",
  "like",
  "me",
];

function floatToWav(pcm, sampleRate) {
  const data = Buffer.alloc(pcm.length * 2);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    data.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

async function loadKokoro() {
  const require = createRequire(join(root, "tmp", "kokoro-cast", "package.json"));
  let resolved;
  try {
    resolved = require.resolve("kokoro-js");
  } catch {
    throw new Error("Install CAST runtime: cd tmp/kokoro-cast && npm install kokoro-js");
  }
  const { KokoroTTS } = await import(pathToFileURL(resolved).href);
  console.log("Loading Kokoro-82M ONNX (af_heart)…");
  return KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
    dtype: "q8",
    device: "cpu",
  });
}

async function main() {
  const tts = await loadKokoro();
  const verse = [];
  for (let i = 0; i < SYLLABLES.length; i++) {
    const text = SYLLABLES[i];
    console.log(`CAST ${i + 1}/${SYLLABLES.length}: ${text}`);
    const audio = await tts.generate(text, { voice: "af_heart", speed: 0.85 });
    const pcm = audio.audio ?? audio.data ?? audio;
    const sr = audio.sampling_rate ?? audio.sampleRate ?? 24000;
    const samples = pcm instanceof Float32Array ? pcm : Float32Array.from(pcm);
    const wavPath = join(outDir, `${String(i).padStart(2, "0")}-${text.toLowerCase()}.wav`);
    writeFileSync(wavPath, floatToWav(samples, sr));
    verse.push({ path: wavPath, samples, sr });
  }
  const sr = verse[0].sr;
  const gap = Math.floor(sr * 0.08);
  let total = gap;
  for (const v of verse) total += v.samples.length + gap;
  const concat = new Float32Array(total);
  let o = gap;
  for (const v of verse) {
    concat.set(v.samples, o);
    o += v.samples.length + gap;
  }
  const lockPath = join(outDir, "lock.wav");
  writeFileSync(lockPath, floatToWav(concat, sr));
  writeFileSync(
    join(outDir, "manifest.json"),
    JSON.stringify({ voice: "af_heart", syllables: SYLLABLES, lock: lockPath, files: verse.map((v) => v.path) }, null, 2),
  );
  console.log(`LOCK ${lockPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
