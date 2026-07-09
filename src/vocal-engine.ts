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
import { JamError } from "./errors.js";

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

  // Voice management. FIFO queue per note (not a single Voice) so a
  // same-pitch noteOn/noteOff pair can overlap another same-pitch pair
  // (unison / fast retrigger) without a late noteOff wrongly cutting off a
  // newer, unrelated voice — see audio-engine.ts's identical pattern for
  // the full rationale (F-c1eab2d2).
  const MAX_VOICES_PER_NOTE = 2;
  const activeVoices = new Map<number, Voice[]>();
  const voiceOrder: Voice[] = []; // Global LRU across all voice instances, oldest first

  // ── Voice Management ──

  /** Remove a specific voice instance from its note's queue. */
  function removeFromNoteQueue(voice: Voice): void {
    const queue = activeVoices.get(voice.note);
    if (!queue) return;
    const idx = queue.indexOf(voice);
    if (idx >= 0) queue.splice(idx, 1);
    if (queue.length === 0) activeVoices.delete(voice.note);
  }

  /** Remove a specific voice instance from the global LRU order. */
  function removeFromOrder(voice: Voice): void {
    const idx = voiceOrder.indexOf(voice);
    if (idx >= 0) voiceOrder.splice(idx, 1);
  }

  /** Steal the oldest voice (across all notes) when at max polyphony. */
  function stealOldest(): void {
    const oldest = voiceOrder.shift();
    if (oldest) {
      fadeAndKillVoice(oldest);
      removeFromNoteQueue(oldest);
    }
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

  /**
   * Stop a voice for an involuntary reason (voice stealing at max
   * polyphony, or per-note overlap eviction) with a very short gain ramp
   * instead of killVoice's instant full-amplitude stop — avoids an
   * audible click/pop (F-637edb02).
   */
  function fadeAndKillVoice(voice: Voice, fadeSeconds = 0.008): void {
    if (voice.cleanupTimer) {
      clearTimeout(voice.cleanupTimer);
      voice.cleanupTimer = null;
    }
    try {
      const now = ctx.currentTime;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, now);
      voice.gain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
      if (voice.chorusGain) {
        voice.chorusGain.gain.cancelScheduledValues(now);
        voice.chorusGain.gain.setValueAtTime(voice.chorusGain.gain.value, now);
        voice.chorusGain.gain.linearRampToValueAtTime(0, now + fadeSeconds);
      }
      voice.cleanupTimer = setTimeout(() => killVoice(voice), (fadeSeconds + 0.02) * 1000);
    } catch {
      killVoice(voice);
    }
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
        const msg = err instanceof Error ? err.message : String(err);
        const cause = err instanceof Error ? err : undefined;
        if (msg.includes("ENOENT") && msg.includes("samples")) {
          throw new JamError({
            code: 'RUNTIME_ENGINE',
            message: `Vocal carrier samples not found at "${carrierDir}"`,
            hint: "Run 'pnpm setup' to generate carrier samples, or use --engine piano instead",
            cause,
          });
        }
        throw new JamError({
          code: 'RUNTIME_ENGINE',
          message: `Failed to start vocal engine: ${msg}`,
          hint: 'Check that node-web-audio-api is installed and your audio device is not in use by another application',
          cause,
        });
      }
    },

    async disconnect(): Promise<void> {
      for (const voice of voiceOrder) {
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

      // Reject non-finite input before clamping — Math.max/min alone does
      // NOT sanitize NaN (NaN in produces NaN out) (F-af5c8733).
      if (!Number.isFinite(note) || !Number.isFinite(velocity)) return;

      // Clamp to reasonable vocal range (C2–C7)
      velocity = Math.max(1, Math.min(127, velocity));
      note = Math.max(36, Math.min(96, note));

      // Bounded overlap instead of an unconditional kill — see
      // MAX_VOICES_PER_NOTE / F-c1eab2d2.
      let queue = activeVoices.get(note);
      if (queue && queue.length >= MAX_VOICES_PER_NOTE) {
        const oldest = queue.shift()!;
        fadeAndKillVoice(oldest);
        removeFromOrder(oldest);
        if (queue.length === 0) activeVoices.delete(note);
      }

      // Voice stealing
      while (voiceOrder.length >= maxPolyphony) {
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

      queue = activeVoices.get(note);
      if (!queue) {
        queue = [];
        activeVoices.set(note, queue);
      }
      queue.push(voice);
      voiceOrder.push(voice);
    },

    noteOff(note: number, _channel?: number): void {
      if (!ctx || currentStatus !== "connected") return;
      if (!Number.isFinite(note)) return;
      // Match noteOn's clamp to [36,96] exactly so an out-of-range or
      // fractional note resolves to the same map key noteOn stored it
      // under — otherwise the voice never receives its noteOff.
      note = Math.max(36, Math.min(96, note));

      // FIFO pairing — release the OLDEST still-active voice for this
      // pitch, not "whatever's in a single slot" (F-c1eab2d2).
      const queue = activeVoices.get(note);
      if (queue && queue.length > 0) {
        const voice = queue.shift()!;
        if (queue.length === 0) activeVoices.delete(note);
        if (debug) {
          const now = ctx.currentTime;
          debugLog.push({
            type: "off",
            t: +(now - connectTime).toFixed(4),
            midiTarget: note,
          });
        }
        releaseVoice(voice);
        removeFromOrder(voice);
      }
    },

    allNotesOff(_channel?: number): void {
      if (!ctx) return;
      for (const voice of voiceOrder) {
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
