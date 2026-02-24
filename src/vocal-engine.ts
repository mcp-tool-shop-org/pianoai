// ─── ai-jam-sessions: Vocal Engine ──────────────────────────────────────────
//
// Plays MIDI notes as sustained vocal tones ("aah" vowel).
// Uses pre-rendered carrier samples, pitch-shifted via playbackRate.
//
// Same VmpkConnector interface as the piano engines — drop-in replacement.
// Plug it into MidiPlaybackEngine, PlaybackController, CLI, or MCP server.
//
// Audio model:
//   - Pre-rendered carriers at reference pitches every 8 semitones (C2–G#6)
//   - On noteOn: pick nearest carrier, compute playbackRate, loop the buffer
//   - High-pass filter (100 Hz) removes breath rumble from looped speech
//   - Velocity → gain envelope (15ms attack + sustain + 150ms release)
//   - Optional chorus (disabled by default): ±5 cents detune, 10ms offset
//   - Looping sustain while note is held, smooth release on noteOff
//
// Usage:
//   const voice = createVocalEngine();
//   await voice.connect();
//   voice.noteOn(60, 100);     // middle C, forte — sustained "aah"
//   voice.noteOff(60);         // smooth release
//   await voice.disconnect();
// ─────────────────────────────────────────────────────────────────────────────

import type { VmpkConnector, MidiStatus, MidiNote } from "./types.js";
import { loadCarrierBank, pickCarrier, defaultCarrierDir, type CarrierBank } from "./vocal-carriers.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface VocalNoteEvent {
  type: "on" | "off";
  t: number;           // seconds since connect
  midiTarget: number;
  carrierMidi?: number;
  semis?: number;
  rate?: number;
  file?: string;
  gain?: number;
}

export interface VocalEngineOptions {
  /** Path to directory containing carrier WAV files. Default: bundled samples/vocal/. */
  carrierDir?: string;
  /** Maximum simultaneous voices. Default: 16. */
  maxPolyphony?: number;
  /** Enable per-note chorus (two detuned voices). Default: false.
   *  Only enable once carriers produce clean, stationary sustain. */
  chorus?: boolean;
  /** Monophonic legato mode. Default: true.
   *
   *  When true: one continuous source per phrase, pitch changes by ramping
   *  playbackRate (portamento/glide). No per-note retrigger. This is how
   *  a real singer works — one sound source that slides between pitches.
   *
   *  When false: polyphonic sampler mode (one source per note, independent). */
  legato?: boolean;
  /** Pitch glide time in seconds for legato transitions. Default: 0.06 (60ms). */
  glideTime?: number;
  /** If true, log note events to debugLog array. Default: false. */
  debug?: boolean;
}

interface Voice {
  note: number;
  source: any;            // AudioBufferSourceNode (primary)
  chorusSource: any | null; // AudioBufferSourceNode (chorus — null when chorus disabled)
  gain: any;              // GainNode (primary)
  chorusGain: any | null; // GainNode (chorus — null when chorus disabled)
  hpf: any;              // BiquadFilterNode (high-pass, 100Hz)
  lpf: any;              // BiquadFilterNode (low-pass, 7kHz — kills speech cues)
  panner: any;           // StereoPannerNode
  released: boolean;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Stereo pan: low notes left, high notes right. Narrower than piano. */
function noteToPan(note: number): number {
  return Math.max(-0.5, Math.min(0.5, ((note - 36) / 60) * 1.0 - 0.5));
}

/** Convert cents offset to playbackRate multiplier. */
function centsToRateMultiplier(cents: number): number {
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
 * Create a vocal engine that plays MIDI notes as sustained vowel tones.
 *
 * Implements VmpkConnector — same interface as createAudioEngine() and
 * createSampleEngine(), so it drops into any existing playback pipeline.
 */
export function createVocalEngine(options?: VocalEngineOptions): VmpkConnector & { debugLog: VocalNoteEvent[] } {
  const {
    carrierDir = defaultCarrierDir(),
    maxPolyphony = 16,
    chorus = false,   // OFF by default — only enable once carriers are stationary
    debug = false,
  } = options ?? {};

  let ctx: any = null;
  let currentStatus: MidiStatus = "disconnected";
  let compressor: any = null;
  let master: any = null;
  let bank: CarrierBank | null = null;
  let connectTime = 0;

  // Debug log (accessible from outside)
  const debugLog: VocalNoteEvent[] = [];

  // Voice management
  const activeVoices = new Map<number, Voice>();
  const voiceOrder: number[] = [];

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
    if (voice.chorusSource) {
      try { voice.chorusSource.stop(); } catch { /* already stopped */ }
      try { voice.chorusSource.disconnect(); } catch { /* ok */ }
    }
    try { voice.gain.disconnect(); } catch { /* ok */ }
    if (voice.chorusGain) {
      try { voice.chorusGain.disconnect(); } catch { /* ok */ }
    }
    try { voice.hpf.disconnect(); } catch { /* ok */ }
    try { voice.lpf.disconnect(); } catch { /* ok */ }
    try { voice.panner.disconnect(); } catch { /* ok */ }
  }

  function releaseVoice(voice: Voice): void {
    if (voice.released) return;
    voice.released = true;

    const now = ctx.currentTime;
    const releaseTime = 0.15; // 150ms release — clean, not ghosty

    // Fade primary voice
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
    voice.gain.gain.exponentialRampToValueAtTime(0.001, now + releaseTime);

    // Fade chorus voice (if enabled)
    if (voice.chorusGain) {
      voice.chorusGain.gain.cancelScheduledValues(now);
      voice.chorusGain.gain.setValueAtTime(voice.chorusGain.gain.value, now);
      voice.chorusGain.gain.exponentialRampToValueAtTime(0.001, now + releaseTime);
    }

    voice.cleanupTimer = setTimeout(() => killVoice(voice), (releaseTime + 0.1) * 1000);
  }

  // ── VmpkConnector Implementation ──

  return {
    async connect(): Promise<void> {
      if (currentStatus === "connected") return;
      currentStatus = "connecting";

      try {
        // 1. Create audio context at 48kHz (matches piano engines)
        const AC = await loadAudioContext();
        ctx = new AC({ sampleRate: 48000, latencyHint: "playback" });

        // 2. Master chain: compressor → gain → speakers
        // Gentler compression than piano — vocals benefit from more dynamics
        compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 15;
        compressor.ratio.value = 3;
        compressor.attack.value = 0.01;
        compressor.release.value = 0.3;

        master = ctx.createGain();
        master.gain.value = 0.8;

        compressor.connect(master);
        master.connect(ctx.destination);

        // 3. Load carrier samples
        bank = loadCarrierBank(ctx, carrierDir);

        connectTime = ctx.currentTime;
        currentStatus = "connected";
        console.error(`Vocal engine connected (${bank.carriers.length} carriers, chorus=${chorus})`);
      } catch (err) {
        currentStatus = "error";
        throw new Error(
          `Failed to start vocal engine: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },

    async disconnect(): Promise<void> {
      for (const [, voice] of activeVoices) {
        try { killVoice(voice); } catch { /* ok */ }
      }
      activeVoices.clear();
      voiceOrder.length = 0;
      bank = null;

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
      return ["Vocal Engine (aah)"];
    },

    noteOn(note: number, velocity: number, _channel?: number): void {
      if (!ctx || currentStatus !== "connected" || !bank) return;

      // Clamp to reasonable vocal range (C2–C7)
      velocity = Math.max(1, Math.min(127, velocity));
      note = Math.max(36, Math.min(96, note));

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

      // Find nearest carrier and compute pitch shift
      const pick = pickCarrier(bank, note);
      if (!pick) return;

      const now = ctx.currentTime;

      // ── Primary source: looping buffer ──
      const source = ctx.createBufferSource();
      source.buffer = pick.carrier.buffer;
      source.loop = true;
      source.playbackRate.value = pick.rate;

      // ── Velocity → gain ──
      const velocity01 = velocity / 127;
      const targetGain = velocity01 * 0.6; // headroom factor

      // Primary gain envelope: fast deterministic attack
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(
        Math.max(targetGain, 0.001),
        now + 0.020, // 20ms attack — crisp, not ghosty
      );

      // ── Bandpass filtering: remove breath rumble + speech cues ──
      // HPF 100Hz: speech carriers have low-freq breath/chest noise
      // LPF 7kHz:  cuts higher formants/fricatives that make it "talk"
      //            turns "murmur" into "ooh" — more instrumental
      const hpf = ctx.createBiquadFilter();
      hpf.type = "highpass";
      hpf.frequency.value = 100;
      hpf.Q.value = 0.7;

      const lpf = ctx.createBiquadFilter();
      lpf.type = "lowpass";
      lpf.frequency.value = 10000;  // gentle rolloff — synth carriers are already bandlimited
      lpf.Q.value = 0.7;

      // ── Stereo position ──
      const panner = ctx.createStereoPanner();
      panner.pan.value = noteToPan(note);

      // ── Optional chorus voice ──
      let chorusSource: any | null = null;
      let chorusGain: any | null = null;

      if (chorus) {
        // Fixed detune: deterministic, not random (avoid horror mode)
        const CHORUS_CENTS = 5;
        const CHORUS_DELAY_SEC = 0.010; // 10ms

        chorusSource = ctx.createBufferSource();
        chorusSource.buffer = pick.carrier.buffer;
        chorusSource.loop = true;
        chorusSource.playbackRate.value = pick.rate * centsToRateMultiplier(CHORUS_CENTS);

        // Nudge primary slightly flat to keep center pitch balanced
        source.playbackRate.value = pick.rate * centsToRateMultiplier(-CHORUS_CENTS * 0.5);
        chorusSource.playbackRate.value = pick.rate * centsToRateMultiplier(CHORUS_CENTS * 0.5);

        const chorusTargetGain = targetGain * 0.25; // chorus at 25% of primary
        chorusGain = ctx.createGain();
        chorusGain.gain.setValueAtTime(0.001, now + CHORUS_DELAY_SEC);
        chorusGain.gain.exponentialRampToValueAtTime(
          Math.max(chorusTargetGain, 0.001),
          now + CHORUS_DELAY_SEC + 0.025, // 25ms chorus attack
        );

        // Chain: chorusSource → chorusGain → hpf (shared filter chain)
        chorusSource.connect(chorusGain);
        chorusGain.connect(hpf); // flows through hpf → lpf → panner
        chorusSource.start(now + CHORUS_DELAY_SEC);
      }

      // ── Audio graph ──
      // source → gain ──┐
      //                  ├─→ hpf → lpf → panner → compressor → master → speakers
      // chorusSource → chorusGain ──┘  (only if chorus enabled)
      source.connect(gain);
      gain.connect(hpf);
      hpf.connect(lpf);
      lpf.connect(panner);
      panner.connect(compressor);

      source.start(now);

      // Debug logging
      if (debug) {
        const semis = note - pick.carrier.referenceMidi;
        debugLog.push({
          type: "on",
          t: +(now - connectTime).toFixed(4),
          midiTarget: note,
          carrierMidi: pick.carrier.referenceMidi,
          semis,
          rate: +pick.rate.toFixed(6),
          file: pick.carrier.filename,
          gain: +targetGain.toFixed(3),
        });
      }

      const voice: Voice = {
        note,
        source,
        chorusSource,
        gain,
        chorusGain,
        hpf,
        lpf,
        panner,
        released: false,
        cleanupTimer: null,
      };

      activeVoices.set(note, voice);
      voiceOrder.push(note);
    },

    noteOff(note: number, _channel?: number): void {
      if (!ctx || currentStatus !== "connected") return;

      const voice = activeVoices.get(note);
      if (voice) {
        if (debug) {
          const now = ctx.currentTime;
          debugLog.push({
            type: "off",
            t: +(now - connectTime).toFixed(4),
            midiTarget: note,
          });
        }
        releaseVoice(voice);
        activeVoices.delete(note);
        removeFromOrder(note);
      }
    },

    allNotesOff(_channel?: number): void {
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

    debugLog,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
