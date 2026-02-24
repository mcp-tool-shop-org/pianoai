// ─── ai-jam-sessions: Sample-Based Piano Engine ─────────────────────────────
//
// Plays real piano samples from the Accurate-Salamander Grand Piano library.
// 480 WAV samples (48kHz/24-bit), 16 velocity layers, 88 keys.
//
// This replaces the oscillator-based engine with actual recorded sound.
//
// Usage:
//   const piano = createSampleEngine({ samplesDir: "samples/AccurateSalamander" });
//   await piano.connect();    // loads SFZ + WAV files (~1.6GB)
//   piano.noteOn(60, 100);    // middle C, forte — real piano sound
//   piano.noteOff(60);
//   await piano.disconnect();
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { VmpkConnector, MidiStatus, MidiNote } from "./types.js";
import { parseSfzFile, type SfzRegion, type SfzData } from "./sfz-parser.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SampleEngineOptions {
  /** Path to the AccurateSalamander directory (contains sfz_minimum/, 48khz24bit/). */
  samplesDir: string;
  /** SFZ profile to use. Default: "sfz_minimum". */
  sfzProfile?: "sfz_minimum" | "sfz_daw" | "sfz_live";
  /** Maximum simultaneous voices. Default: 48. */
  maxPolyphony?: number;
}

interface Voice {
  note: number;
  source: any; // AudioBufferSourceNode
  gain: any; // GainNode
  panner: any; // StereoPannerNode
  released: boolean;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

// ─── Region Lookup ──────────────────────────────────────────────────────────

/**
 * Build a fast lookup structure: regionMap[midiNote] = sorted array of
 * { lovel, hivel, region } for quick velocity matching.
 */
interface VelocitySlot {
  lovel: number;
  hivel: number;
  region: SfzRegion;
}

function buildRegionMap(regions: SfzRegion[]): Map<number, VelocitySlot[]> {
  const map = new Map<number, VelocitySlot[]>();
  for (const r of regions) {
    for (let key = r.lokey; key <= r.hikey; key++) {
      let slots = map.get(key);
      if (!slots) {
        slots = [];
        map.set(key, slots);
      }
      slots.push({ lovel: r.lovel, hivel: r.hivel, region: r });
    }
  }
  // Sort by lovel for binary search
  for (const [, slots] of map) {
    slots.sort((a, b) => a.lovel - b.lovel);
  }
  return map;
}

/** Find the matching region for a given MIDI note + velocity. */
function findRegion(
  regionMap: Map<number, VelocitySlot[]>,
  note: number,
  velocity: number,
): SfzRegion | null {
  const slots = regionMap.get(note);
  if (!slots || slots.length === 0) return null;
  for (const slot of slots) {
    if (velocity >= slot.lovel && velocity <= slot.hivel) return slot.region;
  }
  // Fallback: closest velocity
  return slots[slots.length - 1].region;
}

// ─── Audio Helpers ──────────────────────────────────────────────────────────

/** Stereo pan: bass left, treble right (player perspective). */
function noteToPan(note: number): number {
  return Math.max(-0.7, Math.min(0.7, ((note - 21) / 87) * 1.4 - 0.7));
}

/** Convert dB to linear gain. */
function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Compute playback rate for pitch shifting: cents from sample's pitch center. */
function centsToRate(cents: number): number {
  return Math.pow(2, cents / 1200);
}

// ─── Lazy Import ────────────────────────────────────────────────────────────

let _AudioContext: any = null;

async function loadAudioContext(): Promise<any> {
  if (!_AudioContext) {
    const mod = await import("node-web-audio-api");
    _AudioContext = mod.AudioContext;
  }
  return _AudioContext;
}

// ─── Engine ─────────────────────────────────────────────────────────────────

/**
 * Create a sample-based piano engine using Accurate-Salamander samples.
 *
 * Implements VmpkConnector so it's a drop-in replacement for the old
 * oscillator engine.
 */
export function createSampleEngine(options: SampleEngineOptions): VmpkConnector {
  const {
    samplesDir,
    sfzProfile = "sfz_minimum",
    maxPolyphony = 48,
  } = options;

  let ctx: any = null;
  let currentStatus: MidiStatus = "disconnected";
  let compressor: any = null;
  let master: any = null;

  // Sample data
  let sfzData: SfzData | null = null;
  let regionMap: Map<number, VelocitySlot[]> | null = null;
  const audioBuffers = new Map<string, any>(); // sample path → AudioBuffer

  // Voice management
  const activeVoices = new Map<number, Voice>();
  const voiceOrder: number[] = [];

  // ── WAV Parsing ──

  /**
   * Parse a WAV file into an AudioBuffer manually.
   * Handles 16-bit and 24-bit PCM (the Accurate-Salamander set is 24-bit/48kHz).
   * This avoids needing the async decodeAudioData call for 480+ files.
   */
  function parseWavToAudioBuffer(filePath: string): any {
    const fileData = readFileSync(filePath);
    const view = new DataView(fileData.buffer, fileData.byteOffset, fileData.byteLength);

    // ── Find 'fmt ' chunk ──
    let offset = 12; // skip RIFF header (4 RIFF + 4 size + 4 WAVE)
    let fmtOffset = -1;
    let dataOffset = -1;
    let dataSize = 0;

    while (offset < view.byteLength - 8) {
      const chunkId =
        String.fromCharCode(view.getUint8(offset)) +
        String.fromCharCode(view.getUint8(offset + 1)) +
        String.fromCharCode(view.getUint8(offset + 2)) +
        String.fromCharCode(view.getUint8(offset + 3));
      const chunkSize = view.getUint32(offset + 4, true);

      if (chunkId === "fmt ") {
        fmtOffset = offset + 8;
      } else if (chunkId === "data") {
        dataOffset = offset + 8;
        dataSize = chunkSize;
      }

      if (fmtOffset >= 0 && dataOffset >= 0) break;

      // Next chunk (aligned to 2 bytes)
      offset += 8 + chunkSize + (chunkSize % 2);
    }

    if (fmtOffset < 0) throw new Error(`No 'fmt ' chunk in ${filePath}`);
    if (dataOffset < 0) throw new Error(`No 'data' chunk in ${filePath}`);

    // ── Parse format ──
    let audioFormat = view.getUint16(fmtOffset, true);
    const numChannels = view.getUint16(fmtOffset + 2, true);
    const sampleRate = view.getUint32(fmtOffset + 4, true);
    let bitsPerSample = view.getUint16(fmtOffset + 14, true);

    // WAVE_FORMAT_EXTENSIBLE (0xFFFE / 65534): real format is in SubFormat GUID
    if (audioFormat === 0xFFFE) {
      // cbSize at offset 16 (should be 22), wValidBitsPerSample at offset 18
      const validBits = view.getUint16(fmtOffset + 18, true);
      if (validBits > 0) bitsPerSample = validBits;
      // SubFormat GUID starts at offset 24, first 2 bytes = actual format tag
      audioFormat = view.getUint16(fmtOffset + 24, true);
    }

    if (audioFormat !== 1 && audioFormat !== 3) {
      throw new Error(`Unsupported WAV format ${audioFormat} (need PCM=1 or IEEE_FLOAT=3) in ${filePath}`);
    }
    const isFloat = audioFormat === 3;

    const bytesPerSample = bitsPerSample / 8;
    const numFrames = Math.floor(dataSize / (numChannels * bytesPerSample));

    // ── Create AudioBuffer ──
    const audioBuffer = ctx.createBuffer(numChannels, numFrames, sampleRate);

    // ── Decode PCM data into Float32 channel arrays ──
    for (let ch = 0; ch < numChannels; ch++) {
      const channelData = new Float32Array(numFrames);

      for (let i = 0; i < numFrames; i++) {
        const sampleOffset = dataOffset + (i * numChannels + ch) * bytesPerSample;

        let sample: number;
        if (isFloat && bitsPerSample === 32) {
          // 32-bit IEEE float — already -1..1
          sample = view.getFloat32(sampleOffset, true);
        } else if (isFloat && bitsPerSample === 64) {
          // 64-bit IEEE float
          sample = view.getFloat64(sampleOffset, true);
        } else if (bitsPerSample === 24) {
          // 24-bit signed little-endian → float
          const b0 = view.getUint8(sampleOffset);
          const b1 = view.getUint8(sampleOffset + 1);
          const b2 = view.getUint8(sampleOffset + 2);
          const raw = b0 | (b1 << 8) | (b2 << 16);
          // Sign extend from 24-bit
          sample = (raw > 0x7FFFFF ? raw - 0x1000000 : raw) / 8388608; // 2^23
        } else if (bitsPerSample === 16) {
          // 16-bit signed little-endian → float
          sample = view.getInt16(sampleOffset, true) / 32768; // 2^15
        } else {
          throw new Error(`Unsupported bit depth ${bitsPerSample} in ${filePath}`);
        }

        channelData[i] = sample;
      }

      audioBuffer.copyToChannel(channelData, ch);
    }

    return audioBuffer;
  }

  // ── Sample Loading ──

  /** Load all unique sample files referenced by the SFZ regions. */
  function loadSamples(): void {
    if (!sfzData) return;

    const sfzDir = join(samplesDir, sfzProfile);
    const uniqueSamples = new Set<string>();
    for (const r of sfzData.regions) {
      uniqueSamples.add(r.sample);
    }

    console.error(`Loading ${uniqueSamples.size} piano samples...`);
    const startTime = Date.now();
    let loaded = 0;

    for (const samplePath of uniqueSamples) {
      // Resolve relative path from SFZ file location
      const fullPath = join(sfzDir, samplePath);
      try {
        const audioBuffer = parseWavToAudioBuffer(fullPath);
        audioBuffers.set(samplePath, audioBuffer);
        loaded++;
        if (loaded % 50 === 0) {
          console.error(`  ${loaded}/${uniqueSamples.size} samples loaded`);
        }
      } catch (err) {
        console.error(`  SKIP ${samplePath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`Loaded ${loaded}/${uniqueSamples.size} samples in ${elapsed}s`);
  }

  // ── Voice Management ──

  function stealOldest(): void {
    if (voiceOrder.length === 0) return;
    const oldestNote = voiceOrder.shift()!;
    const voice = activeVoices.get(oldestNote);
    if (voice) {
      killVoice(voice);
      activeVoices.delete(oldestNote);
    }
  }

  function removeFromOrder(note: number): void {
    const idx = voiceOrder.indexOf(note);
    if (idx >= 0) voiceOrder.splice(idx, 1);
  }

  function killVoice(voice: Voice): void {
    if (voice.cleanupTimer) {
      clearTimeout(voice.cleanupTimer);
      voice.cleanupTimer = null;
    }
    try { voice.source.stop(); } catch { /* already stopped */ }
    try { voice.source.disconnect(); } catch { /* ok */ }
    try { voice.gain.disconnect(); } catch { /* ok */ }
    try { voice.panner.disconnect(); } catch { /* ok */ }
  }

  function releaseVoice(voice: Voice): void {
    if (voice.released) return;
    voice.released = true;

    const now = ctx.currentTime;
    const releaseTime = sfzData?.ampegRelease ?? 1.0;

    // Fade out over release time
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + releaseTime);

    // Cleanup after release
    voice.cleanupTimer = setTimeout(() => killVoice(voice), (releaseTime + 0.1) * 1000);
  }

  // ── VmpkConnector Implementation ──

  return {
    async connect(): Promise<void> {
      if (currentStatus === "connected") return;
      currentStatus = "connecting";

      try {
        // 1. Create audio context
        const AC = await loadAudioContext();
        ctx = new AC({ sampleRate: 48000, latencyHint: "playback" });

        // 2. Master chain: compressor → gain → speakers
        compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -12;
        compressor.knee.value = 10;
        compressor.ratio.value = 4;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        master = ctx.createGain();
        master.gain.value = 0.85;

        compressor.connect(master);
        master.connect(ctx.destination);

        // 3. Parse SFZ
        const sfzFile = join(
          samplesDir,
          sfzProfile,
          sfzProfile === "sfz_minimum"
            ? "Accurate-SalamanderGrandPiano_flat.Recommended.sfz"
            : sfzProfile === "sfz_daw"
              ? "Accurate-SalamanderGrandPiano_flat.Recommended.sfz"
              : "Accurate-SalamanderGrandPiano_flat.Recommended.sfz",
        );
        sfzData = parseSfzFile(sfzFile);
        regionMap = buildRegionMap(sfzData.regions);

        // 4. Load all WAV samples
        loadSamples();

        currentStatus = "connected";
        console.error(`Piano engine connected (sample-based, ${audioBuffers.size} samples)`);
      } catch (err) {
        currentStatus = "error";
        throw new Error(
          `Failed to start sample engine: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },

    async disconnect(): Promise<void> {
      for (const [, voice] of activeVoices) {
        try { killVoice(voice); } catch { /* ok */ }
      }
      activeVoices.clear();
      voiceOrder.length = 0;
      audioBuffers.clear();
      sfzData = null;
      regionMap = null;

      if (ctx) {
        try { await ctx.close(); } catch { /* ok */ }
        ctx = null;
        compressor = null;
        master = null;
      }
      currentStatus = "disconnected";
    },

    status(): MidiStatus {
      return currentStatus;
    },

    listPorts(): string[] {
      return ["Accurate-Salamander Grand Piano"];
    },

    noteOn(note: number, velocity: number, channel?: number): void {
      if (!ctx || currentStatus !== "connected" || !regionMap) return;

      // Clamp
      velocity = Math.max(1, Math.min(127, velocity));
      note = Math.max(21, Math.min(108, note));

      // Kill existing voice on same note (retrigger)
      const existing = activeVoices.get(note);
      if (existing) {
        killVoice(existing);
        activeVoices.delete(note);
        removeFromOrder(note);
      }

      // Voice stealing
      while (activeVoices.size >= maxPolyphony) {
        stealOldest();
      }

      // Find the right sample
      const region = findRegion(regionMap, note, velocity);
      if (!region) return;

      const audioBuffer = audioBuffers.get(region.sample);
      if (!audioBuffer) return;

      const now = ctx.currentTime;

      // Create buffer source
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      // Pitch shift: difference between target note and sample's recorded pitch
      const semitoneDiff = note - region.pitchKeycenter;
      const tuneCents = region.tune; // additional fine tuning from SFZ
      const totalCents = semitoneDiff * 100 + tuneCents;
      source.playbackRate.value = centsToRate(totalCents);

      // Volume: SFZ volume offset + velocity scaling
      const velocity01 = velocity / 127;
      const velTrack = (sfzData?.ampVeltrack ?? 97) / 100;
      // SFZ velocity tracking: gain = (1 - velTrack) + velTrack * velocity01
      const velGain = (1 - velTrack) + velTrack * velocity01;
      const volumeGain = dbToGain(region.volume);

      const gain = ctx.createGain();
      gain.gain.value = velGain * volumeGain * 0.5; // 0.5 = headroom factor

      // Stereo position
      const panner = ctx.createStereoPanner();
      panner.pan.value = noteToPan(note);

      // Connect: source → gain → panner → compressor → master → speakers
      source.connect(gain);
      gain.connect(panner);
      panner.connect(compressor);

      source.start(now);

      const voice: Voice = {
        note,
        source,
        gain,
        panner,
        released: false,
        cleanupTimer: null,
      };

      activeVoices.set(note, voice);
      voiceOrder.push(note);
    },

    noteOff(note: number, channel?: number): void {
      if (!ctx || currentStatus !== "connected") return;

      const voice = activeVoices.get(note);
      if (voice) {
        releaseVoice(voice);
        activeVoices.delete(note);
        removeFromOrder(note);
      }
    },

    allNotesOff(channel?: number): void {
      if (!ctx) return;
      for (const [, voice] of activeVoices) {
        killVoice(voice);
      }
      activeVoices.clear();
      voiceOrder.length = 0;
    },

    async playNote(midiNote: MidiNote): Promise<void> {
      if (midiNote.note < 0) {
        await sleep(midiNote.durationMs);
        return;
      }
      this.noteOn(midiNote.note, midiNote.velocity, midiNote.channel);
      await sleep(midiNote.durationMs);
      this.noteOff(midiNote.note, midiNote.channel);
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
