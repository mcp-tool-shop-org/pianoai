// ─── pianoai: Vocal Synth Adapter ─────────────────────────────────────────────
//
// Wraps vocal-synth-engine's LiveSynthEngine as a VmpkConnector.
// Additive synthesis with 15 Kokoro voice presets — drop-in replacement for
// createVocalEngine() (sample-based) or createTractEngine() (Pink Trombone).
//
// Audio path:
//   LiveSynthEngine.render() → ScriptProcessorNode → master gain → speakers
//
// The engine runs in the audio thread callback: each block, we call render()
// and copy PCM samples into the Web Audio output buffer. Deterministic and
// reproducible (seeded RNG, no timing variance).
//
// Usage:
//   const synth = createVocalSynthEngine({ preset: "kokoro-af-heart" });
//   await synth.connect();
//   synth.noteOn(60, 100);   // middle C — sung vocal
//   synth.noteOff(60);       // smooth release
//   await synth.disconnect();
// ─────────────────────────────────────────────────────────────────────────────

import type { VmpkConnector, MidiStatus, MidiNote } from "./types.js";
import { resolve, join } from "node:path";
import { readdirSync, existsSync } from "node:fs";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VocalSynthOptions {
  /** Preset ID (directory name under presets/). Default: "default-voice". */
  preset?: string;
  /** Maximum simultaneous voices. Default: 8. */
  maxPolyphony?: number;
  /** Sample rate in Hz. Default: 48000. */
  sampleRate?: number;
  /** Block size for rendering. Default: 256. */
  blockSize?: number;
  /** RNG seed for deterministic output. Default: 42. */
  seed?: number;
  /** Default timbre within the preset. Uses first available if omitted. */
  defaultTimbre?: string;
  /** Global breathiness override (0–1). Default: preset default. */
  breathiness?: number;
  /** Master gain (0–1). Default: 0.7. */
  masterGain?: number;
  /** If true, log note events. Default: false. */
  debug?: boolean;
}

export interface VocalSynthTelemetry {
  voicesActive: number;
  voicesMax: number;
  peakDbfs: number;
  rtf: number;
}

// ─── Preset discovery ───────────────────────────────────────────────────────

/**
 * Resolve the presets directory — looks for vocal-synth-engine's bundled presets
 * in node_modules, or a local presets/ dir if present.
 */
function findPresetsDir(): string {
  // Check for local presets/ first (development)
  const local = resolve("presets");
  if (existsSync(local)) return local;

  // Look in node_modules
  const nmPath = resolve("node_modules", "vocal-synth-engine", "presets");
  if (existsSync(nmPath)) return nmPath;

  // Fallback: resolve relative to this file's location
  const pkgPath = join(__dirname, "..", "node_modules", "vocal-synth-engine", "presets");
  if (existsSync(pkgPath)) return pkgPath;

  throw new Error(
    "vocal-synth-engine presets not found. Install: npm install github:mcp-tool-shop-org/vocal-synth-engine"
  );
}

// Workaround: __dirname not available in ESM, compute from import.meta.url
const __dirname = (() => {
  try {
    return new URL(".", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
  } catch {
    return ".";
  }
})();

/** List available preset IDs. */
export function listVocalSynthPresets(): string[] {
  const dir = findPresetsDir();
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(join(dir, d.name, "voicepreset.json")))
    .map(d => d.name)
    .sort();
}

// ─── Lazy imports ───────────────────────────────────────────────────────────

let _AudioContext: any = null;

async function loadAudioContext(): Promise<any> {
  if (!_AudioContext) {
    const mod = await import("node-web-audio-api");
    _AudioContext = mod.AudioContext;
  }
  return _AudioContext;
}

type LiveSynthEngineType = import("vocal-synth-engine/src/engine/LiveSynthEngine.js").LiveSynthEngine;
type LiveEngineConfigType = import("vocal-synth-engine/src/engine/LiveSynthEngine.js").LiveEngineConfig;

async function loadSynthEngine() {
  const { LiveSynthEngine } = await import("vocal-synth-engine/src/engine/LiveSynthEngine.js");
  const { loadVoicePreset } = await import("vocal-synth-engine/src/preset/loader.js");
  return { LiveSynthEngine, loadVoicePreset };
}

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * Create a vocal synth engine connector.
 *
 * Uses additive synthesis with Kokoro voice presets from vocal-synth-engine.
 * Implements VmpkConnector — drop-in replacement for createVocalEngine()
 * or createTractEngine().
 */
export function createVocalSynthEngine(options?: VocalSynthOptions): VmpkConnector & {
  debugLog: Array<{ type: string; t: number; midi?: number; velocity?: number }>;
  getTelemetry(): VocalSynthTelemetry | null;
  setTimbreWeights(weights: Record<string, number> | null): void;
} {
  const {
    preset: presetId = "default-voice",
    maxPolyphony = 8,
    sampleRate = 48000,
    blockSize = 256,
    seed = 42,
    defaultTimbre,
    breathiness,
    masterGain = 0.7,
    debug = false,
  } = options ?? {};

  let engine: LiveSynthEngineType | null = null;
  let ctx: any = null;
  let scriptNode: any = null;
  let gainNode: any = null;
  let currentStatus: MidiStatus = "disconnected";
  let connectTime = 0;
  let noteCounter = 0;

  // Map MIDI note number → engine noteId for noteOff lookup
  const activeNoteIds = new Map<number, string>();

  const debugLog: Array<{ type: string; t: number; midi?: number; velocity?: number }> = [];

  function now(): number {
    return ctx ? ctx.currentTime - connectTime : 0;
  }

  return {
    debugLog,

    async connect(): Promise<void> {
      if (currentStatus === "connected") return;

      // Load synth modules
      const { LiveSynthEngine, loadVoicePreset } = await loadSynthEngine();

      // Load preset
      const presetsDir = findPresetsDir();
      const manifestPath = join(presetsDir, presetId, "voicepreset.json");
      if (!existsSync(manifestPath)) {
        const available = listVocalSynthPresets();
        throw new Error(
          `Vocal synth preset '${presetId}' not found. Available: [${available.join(", ")}]`
        );
      }
      const preset = await loadVoicePreset(manifestPath);

      // Resolve default timbre
      const timbreNames = Object.keys(preset.timbres);
      const resolvedTimbre = defaultTimbre && timbreNames.includes(defaultTimbre)
        ? defaultTimbre
        : timbreNames[0];

      // Create engine
      const config: LiveEngineConfigType = {
        sampleRateHz: sampleRate,
        blockSize,
        maxPolyphony,
        defaultTimbre: resolvedTimbre,
        rngSeed: seed,
      };
      engine = new LiveSynthEngine(config, preset);
      engine.play();

      // Create audio context and connect
      const AudioContext = await loadAudioContext();
      ctx = new AudioContext({ sampleRate });

      // Master gain
      gainNode = ctx.createGain();
      gainNode.gain.value = masterGain;
      gainNode.connect(ctx.destination);

      // Script processor: pump engine blocks into Web Audio
      // 0 input channels, 1 output channel
      scriptNode = ctx.createScriptProcessor(blockSize, 0, 1);
      scriptNode.onaudioprocess = (event: any) => {
        if (!engine) return;
        const output = event.outputBuffer.getChannelData(0);
        const rendered = engine.render();
        // Copy rendered PCM into output (lengths should match)
        const len = Math.min(output.length, rendered.length);
        for (let i = 0; i < len; i++) {
          output[i] = rendered[i];
        }
      };
      scriptNode.connect(gainNode);

      connectTime = ctx.currentTime;
      currentStatus = "connected";

      if (debug) {
        debugLog.push({ type: "connect", t: 0 });
      }
    },

    async disconnect(): Promise<void> {
      if (engine) {
        engine.stop();
        engine = null;
      }
      if (scriptNode) {
        try { scriptNode.disconnect(); } catch { /* ok */ }
        scriptNode = null;
      }
      if (gainNode) {
        try { gainNode.disconnect(); } catch { /* ok */ }
        gainNode = null;
      }
      if (ctx) {
        try { await ctx.close(); } catch { /* ok */ }
        ctx = null;
      }
      activeNoteIds.clear();
      currentStatus = "disconnected";

      if (debug) {
        debugLog.push({ type: "disconnect", t: now() });
      }
    },

    status(): MidiStatus {
      return currentStatus;
    },

    listPorts(): string[] {
      return [`VocalSynth:${presetId}`];
    },

    noteOn(note: number, velocity: number, _channel?: number): void {
      if (!engine || currentStatus !== "connected") return;

      const noteId = `n${noteCounter++}`;
      activeNoteIds.set(note, noteId);

      engine.noteOn({
        noteId,
        midi: note,
        velocity: velocity / 127,
        breathiness: breathiness,
      });

      if (debug) {
        debugLog.push({ type: "on", t: now(), midi: note, velocity });
      }
    },

    noteOff(note: number, _channel?: number): void {
      if (!engine || currentStatus !== "connected") return;

      const noteId = activeNoteIds.get(note);
      if (noteId) {
        engine.noteOff(noteId);
        activeNoteIds.delete(note);
      }

      if (debug) {
        debugLog.push({ type: "off", t: now(), midi: note });
      }
    },

    allNotesOff(_channel?: number): void {
      if (!engine) return;
      engine.panic();
      activeNoteIds.clear();
    },

    async playNote(midiNote: MidiNote): Promise<void> {
      if (!engine || currentStatus !== "connected") return;

      const durationMs = typeof midiNote.durationMs === "number"
        ? midiNote.durationMs
        : parseInt(midiNote.durationMs, 10) || 500;

      this.noteOn(midiNote.note, midiNote.velocity ?? 80);
      await new Promise(resolve => setTimeout(resolve, durationMs));
      this.noteOff(midiNote.note);
    },

    // ── Extended API ──

    getTelemetry(): VocalSynthTelemetry | null {
      if (!engine) return null;
      const t = engine.getTelemetryAndReset();
      return {
        voicesActive: t.voicesActive,
        voicesMax: t.voicesMax,
        peakDbfs: t.peakDbfs,
        rtf: t.rtf,
      };
    },

    setTimbreWeights(weights: Record<string, number> | null): void {
      if (engine) engine.setTimbreWeights(weights);
    },
  };
}
