// ─── Acoustic tap tests ──────────────────────────────────────────────────────
//
// Mock graph, no live AudioContext. Load-bearing: the original source →
// destination edge survives attach and detach. Dropped samples are visible.

import { describe, it, expect } from "vitest";
import { AudioStream } from "./stream.js";
import {
  attachTap,
  TAP_BUFFER_SIZE,
  type AudioNodeLike,
  type GainLike,
  type ScriptProcessorEvent,
  type ScriptProcessorLike,
  type TapContextLike,
} from "./tap.js";

const SR = 48000;

class MockNode implements AudioNodeLike {
  readonly edges: unknown[] = [];
  connect(destination: unknown): unknown {
    this.edges.push(destination);
    return destination;
  }
  disconnect(destination?: unknown): void {
    if (destination === undefined) {
      this.edges.length = 0;
      return;
    }
    const i = this.edges.indexOf(destination);
    if (i >= 0) this.edges.splice(i, 1);
  }
}

class MockGain extends MockNode implements GainLike {
  gain = { value: 1 };
}

class MockProcessor extends MockNode implements ScriptProcessorLike {
  onaudioprocess: ((event: ScriptProcessorEvent) => void) | null = null;
}

class MockContext implements TapContextLike {
  sampleRate = SR;
  currentTime = 0;
  destination = new MockNode();
  processors: MockProcessor[] = [];
  gains: MockGain[] = [];
  createScriptProcessor(
    _bufferSize: number,
    _numberOfInputChannels: number,
    _numberOfOutputChannels: number,
  ): ScriptProcessorLike {
    const p = new MockProcessor();
    this.processors.push(p);
    return p;
  }
  createGain(): GainLike {
    const g = new MockGain();
    this.gains.push(g);
    return g;
  }
}

function fire(
  processor: ScriptProcessorLike,
  opts: { t: number; samples: Float32Array; sr?: number },
): Float32Array {
  const output = new Float32Array(opts.samples.length);
  output.fill(1); // callback must overwrite with silence
  processor.onaudioprocess?.({
    inputBuffer: {
      getChannelData: () => opts.samples,
      length: opts.samples.length,
      sampleRate: opts.sr ?? SR,
    },
    outputBuffer: {
      getChannelData: () => output,
      length: output.length,
    },
    playbackTime: opts.t,
  });
  return output;
}

describe("attachTap — fan-out, not insert", () => {
  it("leaves the original source → destination edge in place", () => {
    const ctx = new MockContext();
    const source = new MockNode();
    const speakers = ctx.destination;
    source.connect(speakers);

    const stream = new AudioStream({ sampleRate: SR, windowSec: 2 });
    const handle = attachTap({ source, stream, context: ctx });

    expect(source.edges).toContain(speakers);
    expect(source.edges).toContain(ctx.processors[0]);
    expect(ctx.gains[0]!.gain.value).toBe(0);
    expect(ctx.processors[0]!.edges).toContain(ctx.gains[0]);
    expect(ctx.gains[0]!.edges).toContain(speakers);

    handle.detach();
    expect(source.edges).toEqual([speakers]);
    expect(ctx.processors[0]!.edges).toEqual([]);
    expect(ctx.gains[0]!.edges).toEqual([]);
  });

  it("defaults to the vocal-tract block size", () => {
    const ctx = new MockContext();
    const handle = attachTap({
      source: new MockNode(),
      stream: new AudioStream({ sampleRate: SR, windowSec: 2 }),
      context: ctx,
    });
    expect(handle.bufferSize).toBe(TAP_BUFFER_SIZE);
    expect(TAP_BUFFER_SIZE).toBe(2048);
    handle.detach();
  });

  it("rejects a buffer size ScriptProcessor will not accept", () => {
    const ctx = new MockContext();
    expect(() =>
      attachTap({
        source: new MockNode(),
        stream: new AudioStream({ sampleRate: SR, windowSec: 2 }),
        context: ctx,
        bufferSize: 1000,
      }),
    ).toThrow(/bufferSize/);
  });
});

describe("attachTap — capture", () => {
  it("pushes the input block and writes silence to the output", () => {
    const ctx = new MockContext();
    const stream = new AudioStream({ sampleRate: SR, windowSec: 2 });
    const handle = attachTap({ source: new MockNode(), stream, context: ctx });
    const samples = new Float32Array(TAP_BUFFER_SIZE);
    samples[0] = 0.5;
    const output = fire(ctx.processors[0]!, { t: 0, samples });
    expect(stream.snapshot().tEndSec).toBeCloseTo(TAP_BUFFER_SIZE / SR, 10);
    expect(output.every((x) => x === 0)).toBe(true);
    handle.detach();
  });

  it("exposes dropped samples from a gap in playbackTime, and 0 when contiguous", () => {
    const ctx = new MockContext();
    const stream = new AudioStream({ sampleRate: SR, windowSec: 2 });
    const handle = attachTap({ source: new MockNode(), stream, context: ctx });
    const block = new Float32Array(TAP_BUFFER_SIZE);
    const proc = ctx.processors[0]!;
    const dt = TAP_BUFFER_SIZE / SR;

    fire(proc, { t: 0, samples: block });
    fire(proc, { t: dt, samples: block });
    expect(handle.droppedSampleCount).toBe(0);

    fire(proc, { t: 2 * dt + 100 / SR, samples: block });
    expect(handle.droppedSampleCount).toBe(100);
    handle.detach();
  });

  it("stops capturing after detach, and a second detach is a no-op", () => {
    const ctx = new MockContext();
    const stream = new AudioStream({ sampleRate: SR, windowSec: 2 });
    const handle = attachTap({ source: new MockNode(), stream, context: ctx });
    const proc = ctx.processors[0]!;
    const block = new Float32Array(TAP_BUFFER_SIZE);
    fire(proc, { t: 0, samples: block });
    handle.detach();
    handle.detach();
    fire(proc, { t: TAP_BUFFER_SIZE / SR, samples: block });
    expect(stream.snapshot().tEndSec).toBeCloseTo(TAP_BUFFER_SIZE / SR, 10);
    expect(proc.onaudioprocess).toBeNull();
  });
});
