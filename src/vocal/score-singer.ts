// Score-locked singer: StreamingVocalSynthEngine pumped into Web Audio
// (live) or rendered offline to PCM. Independent of the MIDI VmpkConnector
// path — start it alongside a piano session so the vowel beat matches the
// accompaniment clock.

import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import type { BuiltVocalScore } from "./score-locked.js";
import { scoreDurationSec } from "./score-locked.js";
import { getSharedAudioContext, setSharedAudioContext } from "../audio-shared.js";
import { renderTractScore } from "./tract-render.js";

export interface ScoreSingerOptions {
  preset?: string;
  sampleRate?: number;
  blockSize?: number;
  seed?: number;
  masterGain?: number;
  /** `tract` = Pink Trombone (default). `additive` = Kokoro tables (not a voice). */
  backend?: "tract" | "additive";
}

function findPresetsDir(): string {
  const candidates = [
    join(__dirname, "..", "..", "node_modules", "vocal-synth-engine", "presets"),
    resolve("node_modules", "vocal-synth-engine", "presets"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  throw new Error(
    "vocal-synth-engine presets not found. Install: npm install github:mcp-tool-shop-org/vocal-synth-engine",
  );
}

const __dirname = (() => {
  try {
    return new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
  } catch {
    return ".";
  }
})();

export function listScoreSingerPresets(): string[] {
  const dir = findPresetsDir();
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "voicepreset.json")))
    .map((d) => d.name)
    .sort();
}

export interface ScoreSinger {
  connect(): Promise<void>;
  start(): void;
  stop(): Promise<void>;
  readonly durationSec: number;
  readonly warnings: string[];
}

/**
 * Render the score offline to mono PCM (tests / --out wav). Deterministic.
 */
export async function renderScoreLockedPcm(
  score: BuiltVocalScore,
  options: ScoreSingerOptions = {},
): Promise<{ pcm: Float32Array; sampleRate: number }> {
  const sampleRate = options.sampleRate ?? 48000;
  const blockSize = options.blockSize ?? 1024;
  const presetId = options.preset ?? "kokoro-af-heart";
  const { StreamingVocalSynthEngine } = await import(
    "vocal-synth-engine/src/engine/StreamingVocalSynthEngine.js"
  );
  const { loadVoicePreset } = await import("vocal-synth-engine/src/preset/loader.js");

  const presetsDir = findPresetsDir();
  const manifestPath = join(presetsDir, presetId, "voicepreset.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Vocal synth preset '${presetId}' not found`);
  }
  const preset = await loadVoicePreset(manifestPath);
  const timbreNames = Object.keys(preset.timbres);
  const engine = new StreamingVocalSynthEngine(
    {
      sampleRateHz: sampleRate,
      blockSize,
      presetPath: manifestPath,
      deterministic: "exact",
      rngSeed: options.seed ?? 42,
      defaultTimbre: timbreNames[0],
      maxPolyphony: 8,
    },
    preset,
    {
      bpm: score.bpm,
      notes: score.notes,
      lyrics: score.lyrics,
      phonemes: score.phonemes,
    },
  );

  const duration = scoreDurationSec(score) + 0.15;
  const total = Math.ceil(duration * sampleRate);
  const pcm = new Float32Array(total);
  let offset = 0;
  while (offset < total) {
    const n = Math.min(blockSize, total - offset);
    const block = engine.render(n);
    pcm.set(block.subarray(0, n), offset);
    offset += n;
  }
  return { pcm, sampleRate };
}

/** Peak-normalize so the lead is audible under a sampled piano. */
export function peakNormalize(pcm: Float32Array, target = 0.55): Float32Array {
  let peak = 0;
  for (let i = 0; i < pcm.length; i++) {
    const a = Math.abs(pcm[i]);
    if (a > peak) peak = a;
  }
  if (peak < 1e-6) return pcm;
  const g = target / peak;
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] * g;
  return out;
}

/**
 * Live singer. Renders the score to PCM, then plays it as a BufferSource
 * on the shared AudioContext (the piano's graph). A second AudioContext
 * is silent on this host — that was "no vocals at all."
 */
export function createScoreSinger(
  score: BuiltVocalScore,
  options: ScoreSingerOptions = {},
): ScoreSinger {
  const durationSec = scoreDurationSec(score) + 0.15;
  let pcm: Float32Array | null = null;
  let pcmRate = 48000;
  let source: any = null;
  let gainNode: any = null;
  let ownedCtx: any = null;
  let AudioContextCtor: (new (o: object) => any) | null = null;

  return {
    durationSec,
    warnings: score.warnings,

    async connect(): Promise<void> {
      const backend = options.backend ?? "tract";
      const rendered = backend === "additive"
        ? await renderScoreLockedPcm(score, options)
        : renderTractScore(score, { sampleRate: options.sampleRate });
      pcm = peakNormalize(rendered.pcm, backend === "additive" ? 0.35 : 0.4);
      pcmRate = rendered.sampleRate;
      const mod = await import("node-web-audio-api");
      AudioContextCtor = mod.AudioContext as new (o: object) => any;
    },

    start(): void {
      if (!pcm) return;
      let ctx = getSharedAudioContext();
      if (!ctx) {
        if (!AudioContextCtor) return;
        ownedCtx = new AudioContextCtor({ sampleRate: pcmRate, latencyHint: "playback" });
        setSharedAudioContext(ownedCtx);
        ctx = ownedCtx;
      }
      const rate = Number(ctx.sampleRate) || pcmRate;
      const buffer = ctx.createBuffer(1, pcm.length, rate);
      const ch = buffer.getChannelData(0);
      ch.set(pcm.subarray(0, ch.length));
      source = ctx.createBufferSource();
      source.buffer = buffer;
      gainNode = ctx.createGain();
      gainNode.gain.value = options.masterGain ?? 1;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      source.start(0);
    },

    async stop(): Promise<void> {
      if (source) {
        try { source.stop(); } catch { /* already ended */ }
        try { source.disconnect(); } catch { /* ok */ }
        source = null;
      }
      if (gainNode) {
        try { gainNode.disconnect(); } catch { /* ok */ }
        gainNode = null;
      }
      if (ownedCtx) {
        if (getSharedAudioContext() === ownedCtx) setSharedAudioContext(null);
        try { await ownedCtx.close(); } catch { /* ok */ }
        ownedCtx = null;
      }
      pcm = null;
    },
  };
}
