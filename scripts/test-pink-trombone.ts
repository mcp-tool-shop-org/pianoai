// Quick sanity test: does pink-trombone-mod synthesize in Node.js?
import { Synthesizer } from "pink-trombone-mod/Synthesizer.js";

const synth = new Synthesizer(48000);
console.log("Created. Default freq:", synth.glottis.targetFrequency);

// Enable voicing
synth.glottis.isTouched = true;
synth.glottis.alwaysVoice = true;
synth.glottis.autoWobble = false;   // deterministic for testing
synth.glottis.vibratoAmount = 0;

// Set pitch to A3 (220 Hz)
synth.glottis.targetFrequency = 220;
synth.glottis.targetTenseness = 0.6;

// Ramp up intensity: synthesize a few warm-up blocks
// (intensity starts at 0 and ramps with adjustIntensity)
const warmup = new Float32Array(512);
for (let i = 0; i < 20; i++) {
  synth.synthesize(warmup);
}
console.log("After warmup, intensity should be near 1.0");

// Now synthesize the real test buffer
const buf = new Float32Array(4096);
synth.synthesize(buf);

let mx = 0;
let sum = 0;
for (let i = 0; i < buf.length; i++) {
  const a = Math.abs(buf[i]);
  if (a > mx) mx = a;
  sum += buf[i] * buf[i];
}
const rms = Math.sqrt(sum / buf.length);

console.log(`4096 samples: max=${mx.toFixed(6)}, rms=${rms.toFixed(6)}`);
console.log("First 8:", Array.from(buf.slice(0, 8)).map(v => v.toFixed(6)));
console.log("Pink Trombone works in Node.js!");
