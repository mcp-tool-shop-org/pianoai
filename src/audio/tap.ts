// ─── ai-jam-sessions: Acoustic tap ───────────────────────────────────────────
//
// Observe one engine's output without sitting in its signal path.
//
// Fan-out from a DEDICATED tap bus (createTapOutput on each engine),
// never from master. Disconnecting or mangling the tap cannot silence the
// instrument: master → destination is untouched.
//
// Capture route: ScriptProcessorNode. Already proven on this runtime on the
// live vocal path. AudioWorklet would need a processor module loaded by
// URL/path — the "tag that does not exist" trap once packaging moves the
// file. Worklet is a measured upgrade; say so before adding a build step.
//
// Buffer size 2048, matching the vocal path (~42 ms at 48 kHz). push() only
// in the callback; snapshot() stays off this thread (121 ms).
//
// Dropped samples are counted and exposed. A gap the consumer cannot see is
// worse than one it can.
// ─────────────────────────────────────────────────────────────────────────────

import type { AudioStream } from "./stream.js";

/** Vocal-path block size. ~42 ms at 48 kHz, ~46 ms at 44.1 kHz. */
export const TAP_BUFFER_SIZE = 2048;

export interface AudioNodeLike {
  connect(destination: unknown): unknown;
  disconnect(destination?: unknown): void;
}

export interface TapContextLike {
  sampleRate: number;
  currentTime: number;
  destination: AudioNodeLike;
  createScriptProcessor(
    bufferSize: number,
    numberOfInputChannels: number,
    numberOfOutputChannels: number,
  ): ScriptProcessorLike;
  createGain(): GainLike;
}

export interface GainLike extends AudioNodeLike {
  gain: { value: number };
}

export interface ScriptProcessorLike extends AudioNodeLike {
  onaudioprocess: ((event: ScriptProcessorEvent) => void) | null;
}

export interface ScriptProcessorEvent {
  inputBuffer: { getChannelData: (channel: number) => Float32Array; length: number; sampleRate: number };
  outputBuffer: { getChannelData: (channel: number) => Float32Array; length: number };
  playbackTime?: number;
}

export interface AttachTapOptions {
  /** Dedicated tap bus, not master. */
  source: AudioNodeLike;
  stream: AudioStream;
  /** Shared context. Never created here. */
  context: TapContextLike;
  bufferSize?: number;
}

export interface TapHandle {
  stream: AudioStream;
  bufferSize: number;
  droppedSampleCount: number;
  detach(): void;
}

/**
 * Fan-out from `source` into `stream`. Does not disconnect source from
 * destination. A muted sink keeps the ScriptProcessor in the graph so
 * callbacks fire; its gain is 0 so it adds silence, not signal.
 */
export function attachTap(options: AttachTapOptions): TapHandle {
  const { source, stream, context } = options;
  const bufferSize = options.bufferSize ?? TAP_BUFFER_SIZE;
  if (![256, 512, 1024, 2048, 4096, 8192, 16384].includes(bufferSize)) {
    throw new Error(`bufferSize must be a valid ScriptProcessor size, got ${bufferSize}`);
  }

  const processor = context.createScriptProcessor(bufferSize, 1, 1);
  const mute = context.createGain();
  mute.gain.value = 0;

  source.connect(processor);
  processor.connect(mute);
  mute.connect(context.destination);

  let droppedSampleCount = 0;
  let lastEndSample: number | null = null;
  let detached = false;

  processor.onaudioprocess = (event) => {
    if (detached) return;
    const input = event.inputBuffer.getChannelData(0);
    const n = input.length;
    const sr = event.inputBuffer.sampleRate || context.sampleRate;
    const t = event.playbackTime ?? context.currentTime;
    const startSample = Math.round(t * sr);
    if (lastEndSample !== null && startSample > lastEndSample) {
      droppedSampleCount += startSample - lastEndSample;
    }
    lastEndSample = startSample + n;

    stream.push(input);

    const output = event.outputBuffer.getChannelData(0);
    output.fill(0);
  };

  return {
    stream,
    bufferSize,
    get droppedSampleCount() {
      return droppedSampleCount;
    },
    detach() {
      if (detached) return;
      detached = true;
      processor.onaudioprocess = null;
      try { source.disconnect(processor); } catch { /* already gone */ }
      try { processor.disconnect(); } catch { /* ok */ }
      try { mute.disconnect(); } catch { /* ok */ }
    },
  };
}
