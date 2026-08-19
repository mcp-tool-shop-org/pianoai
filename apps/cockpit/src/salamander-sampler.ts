// ─── Cockpit Salamander sampler ─────────────────────────────────────────────
//
// Fetches the pruned pack from /samples/salamander/, decodes lazily after
// the first user gesture, and plays through the synth's compressor/gain
// chain. Oscillators stay the audible path until ready.

import {
  fileFor, nearestRoot, playbackRateFor, velocityLayer,
  type SalamanderManifest,
} from "./salamander-logic.js";

export const SAMPLES_BASE = `${import.meta.env.BASE_URL}samples/salamander/`;
export const SAMPLES_LOADING_MESSAGE = "Loading Concert Grand samples…";
export const SAMPLES_UNAVAILABLE_MESSAGE =
  "Sampled piano unavailable — using the built-in synth";

export type SamplerState = "idle" | "loading" | "ready" | "unavailable";

interface SampleVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  midi: number;
}

export interface SalamanderSampler {
  state(): SamplerState;
  isReady(): boolean;
  load(ctx: AudioContext, output: AudioNode): Promise<SamplerState>;
  noteOn(midi: number, velocity: number, time?: number): boolean;
  noteOff(midi: number, time?: number): void;
  allNotesOff(): void;
}

export function createSalamanderSampler(): SalamanderSampler {
  let state: SamplerState = "idle";
  let ctx: AudioContext | null = null;
  let output: AudioNode | null = null;
  let manifest: SalamanderManifest | null = null;
  const buffers = new Map<string, AudioBuffer>();
  const voices = new Map<number, SampleVoice>();

  async function decodeAll(base: string): Promise<void> {
    if (!ctx || !manifest) return;
    const unique = [...new Set(manifest.files.map((f) => f.file))];
    await Promise.all(unique.map(async (name) => {
      const res = await fetch(base + name);
      if (!res.ok) throw new Error(`fetch ${name} → ${res.status}`);
      const raw = await res.arrayBuffer();
      const buf = await ctx!.decodeAudioData(raw.slice(0));
      buffers.set(name, buf);
    }));
  }

  return {
    state: () => state,
    isReady: () => state === "ready" && !!manifest && buffers.size > 0,

    async load(audioCtx, dest) {
      if (state === "ready") return state;
      if (state === "loading") return state;
      state = "loading";
      ctx = audioCtx;
      output = dest;
      try {
        const res = await fetch(SAMPLES_BASE + "manifest.json");
        if (!res.ok) throw new Error(`manifest ${res.status}`);
        manifest = await res.json() as SalamanderManifest;
        if (!manifest.roots?.length || !manifest.files?.length) {
          throw new Error("manifest missing roots/files");
        }
        await decodeAll(SAMPLES_BASE);
        state = "ready";
      } catch {
        state = "unavailable";
        manifest = null;
        buffers.clear();
      }
      return state;
    },

    noteOn(midi, velocity, time) {
      if (state !== "ready" || !ctx || !output || !manifest) return false;
      const root = nearestRoot(midi, manifest.roots);
      const layer = velocityLayer(velocity, manifest.layers);
      const ref = fileFor(root, layer, manifest.files);
      if (!ref) return false;
      const buf = buffers.get(ref.file);
      if (!buf) return false;

      const now = time ?? ctx.currentTime;
      const existing = voices.get(midi);
      if (existing) {
        try { existing.source.stop(now); } catch { /* already stopped */ }
        voices.delete(midi);
      }

      const source = ctx.createBufferSource();
      source.buffer = buf;
      source.playbackRate.value = playbackRateFor(midi, root);
      const gain = ctx.createGain();
      const vel01 = Math.max(0.05, Math.min(1, velocity / 127));
      gain.gain.setValueAtTime(vel01 * 0.9, now);
      source.connect(gain);
      gain.connect(output);
      source.start(now);
      source.onended = () => {
        if (voices.get(midi)?.source === source) voices.delete(midi);
      };
      voices.set(midi, { source, gain, midi });
      return true;
    },

    noteOff(midi, time) {
      const v = voices.get(midi);
      if (!v || !ctx) return;
      const now = time ?? ctx.currentTime;
      try {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(v.gain.gain.value, now);
        v.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        v.source.stop(now + 0.2);
      } catch { /* already stopped */ }
    },

    allNotesOff() {
      const now = ctx?.currentTime ?? 0;
      for (const v of voices.values()) {
        try {
          v.gain.gain.cancelScheduledValues(now);
          v.gain.gain.setValueAtTime(0.0001, now);
          v.source.stop(now);
        } catch { /* ok */ }
      }
      voices.clear();
    },
  };
}
