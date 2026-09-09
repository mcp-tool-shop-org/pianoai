// ─── Shared clip primitive — one voice path for reference / A / B ─────────────
//
// Every panel note goes through the same modules the roll uses: salamander
// sampler when ready, otherwise createSynth() + piano-timbre, both through the
// compressor→master chain. Offline render uses attachContext(OfflineAudioContext)
// so loudness measurement is the real graph, not a second synth.

import { createSynth, type VoiceId } from "./synth.js";
import { scheduleSalamanderNote, type SamplerPack } from "./salamander-sampler.js";
import { beatsToSeconds } from "./time.js";
import {
  buildClipNotes,
  clipDurationBeats,
  loudnessOffsetsFromRms,
  measureRms,
  type ClipNote,
  type LoudnessMatch,
} from "../../../src/compose/human-audio-panel.js";
import type { CatalogMelodyNote } from "../../../src/compose/human-audio-catalog.js";
import type { Realization } from "../../../src/compose/types.js";

export type VoicePath = "sampler" | "synth";

export interface ClipRender {
  buffer: AudioBuffer;
  rms: number;
  voicePath: VoicePath;
  durationSec: number;
}

export function clipNotesFor(
  melody: CatalogMelodyNote[],
  realization: Realization | undefined,
  beatsPerMeasure: number,
): ClipNote[] {
  return buildClipNotes({ melody, realization, beatsPerMeasure });
}

export function clipLengthSec(notes: ClipNote[], beatsPerMeasure: number, measures: number, bpm: number): number {
  return beatsToSeconds(clipDurationBeats(notes, beatsPerMeasure, measures), bpm) + 0.4;
}

export async function renderClipOffline(opts: {
  notes: ClipNote[];
  durationSec: number;
  bpm: number;
  voiceId: VoiceId;
  pack: SamplerPack | null;
  sampleRate?: number;
}): Promise<ClipRender> {
  const sampleRate = opts.sampleRate ?? 48000;
  const frames = Math.max(1, Math.ceil(opts.durationSec * sampleRate));
  const offline = new OfflineAudioContext(2, frames, sampleRate);
  const synth = createSynth({ voice: opts.voiceId });
  synth.attachContext(offline);
  const output = synth.getOutputNode();
  if (!output) throw new Error("offline synth produced no output node");

  const useSampler = !!opts.pack;
  for (const note of opts.notes) {
    const start = beatsToSeconds(note.startBeat, opts.bpm);
    const dur = Math.max(0.05, beatsToSeconds(note.durationBeats, opts.bpm));
    if (useSampler && opts.pack) {
      scheduleSalamanderNote({
        ctx: offline,
        output,
        pack: opts.pack,
        midi: note.midi,
        velocity: note.velocity,
        time: start,
        durationSec: dur,
      });
    } else {
      synth.noteOn(note.midi, note.velocity, start);
      synth.noteOff(note.midi, start + dur);
    }
  }

  const buffer = await offline.startRendering();
  return {
    buffer,
    rms: rmsOfBuffer(buffer),
    voicePath: useSampler ? "sampler" : "synth",
    durationSec: buffer.duration,
  };
}

export function rmsOfBuffer(buffer: AudioBuffer): number {
  let acc = 0;
  let n = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    acc += measureRms(data) ** 2 * data.length;
    n += data.length;
  }
  return n > 0 ? Math.sqrt(acc / n) : 0;
}

export function matchPair(a: ClipRender, b: ClipRender): LoudnessMatch {
  return loudnessOffsetsFromRms(a.rms, b.rms);
}

export interface ClipPlayer {
  play(buffer: AudioBuffer, gain: number, offsetSec: number): void;
  pause(): number;
  stop(): void;
  currentOffset(): number;
  playing(): boolean;
}

export function createClipPlayer(ctx: AudioContext, dest: AudioNode): ClipPlayer {
  let source: AudioBufferSourceNode | null = null;
  let gainNode: GainNode | null = null;
  let startedAt = 0;
  let offsetAtStart = 0;
  let live = false;
  let lastBuffer: AudioBuffer | null = null;

  function tearDown() {
    if (source) {
      try { source.stop(); } catch { /* already */ }
      try { source.disconnect(); } catch { /* ok */ }
    }
    if (gainNode) {
      try { gainNode.disconnect(); } catch { /* ok */ }
    }
    source = null;
    gainNode = null;
    live = false;
  }

  return {
    play(buffer, gain, offsetSec) {
      tearDown();
      lastBuffer = buffer;
      const g = ctx.createGain();
      g.gain.value = gain;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(g);
      g.connect(dest);
      const off = Math.max(0, Math.min(offsetSec, Math.max(0, buffer.duration - 0.01)));
      src.start(0, off);
      src.onended = () => {
        if (source === src) {
          live = false;
          offsetAtStart = buffer.duration;
        }
      };
      source = src;
      gainNode = g;
      startedAt = ctx.currentTime;
      offsetAtStart = off;
      live = true;
    },
    pause() {
      const off = this.currentOffset();
      tearDown();
      offsetAtStart = off;
      return off;
    },
    stop() {
      tearDown();
      offsetAtStart = 0;
      lastBuffer = null;
    },
    currentOffset() {
      if (!live || !lastBuffer) return offsetAtStart;
      return Math.min(lastBuffer.duration, offsetAtStart + (ctx.currentTime - startedAt));
    },
    playing() {
      return live;
    },
  };
}
