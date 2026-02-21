// Quick diagnostic: does each tract length produce audio?
import { Synthesizer } from "../src/vendor/pink-trombone.js";

for (const tractLength of [44, 50, 56]) {
  const synth = new Synthesizer(48000, tractLength);
  synth.glottis.alwaysVoice = true;
  synth.glottis.isTouched = true;
  synth.glottis.targetFrequency = 165; // E3
  synth.glottis.targetTenseness = 0.4;

  // Warm up
  const warmup = new Float32Array(512);
  for (let i = 0; i < 40; i++) synth.synthesize(warmup);

  // Render 1 second
  const buf = new Float32Array(48000);
  synth.synthesize(buf);

  let max = 0, rms = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i]);
    if (v > max) max = v;
    rms += buf[i] * buf[i];
  }
  rms = Math.sqrt(rms / buf.length);

  const hasNaN = buf.some(v => isNaN(v));
  console.log(`tract=${tractLength}: max=${max.toFixed(6)}, rms=${rms.toFixed(6)}, NaN=${hasNaN}`);
}
