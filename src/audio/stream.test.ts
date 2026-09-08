// ─── AudioStream tests ───────────────────────────────────────────────────────
//
// Load-bearing: chunks through the stream vs the offline path on the same
// samples, after the withhold edge policy. Fixture shorter than windowSec so
// the ring holds the whole signal. Comparing a tail to a whole file would be
// racy, not informative.

import { describe, it, expect } from "vitest";
import { AudioStream, DEFAULT_HOP_LENGTH, DEFAULT_POST_AVG_SEC, EDGE_POLICY_WITHHOLD } from "./stream.js";
import { detectOnsets } from "./onsets.js";
import { trackPitch } from "./pitch.js";
import { sine, clickTrain } from "./fixtures.js";

const SR = 44100;
const HOP = DEFAULT_HOP_LENGTH;

function pushInChunks(stream: AudioStream, samples: Float64Array, chunk: number): void {
  for (let i = 0; i < samples.length; i += chunk) {
    stream.push(samples.subarray(i, Math.min(i + chunk, samples.length)));
  }
}

function confirmedTimes(
  onsets: { time: number }[],
  tEndSec: number,
  onsetLatencySec: number,
): number[] {
  const cutoff = tEndSec - onsetLatencySec;
  return onsets.filter((o) => o.time <= cutoff).map((o) => o.time);
}

describe("AudioStream vs offline", () => {
  it("agrees on confirmed onsets and on the latest pitch", () => {
    const samples = clickTrain({
      times: [0.3, 0.8],
      duration: 1.2,
      sampleRate: SR,
    });
    const tone = sine({ frequency: 440, duration: 1.2, sampleRate: SR, amplitude: 0.4 });
    const mixed = new Float64Array(samples.length);
    for (let i = 0; i < mixed.length; i++) mixed[i] = samples[i]! + tone[i]!;

    const offlineOnsets = detectOnsets(mixed, { sampleRate: SR, hopLength: HOP });
    const offlinePitch = trackPitch(mixed, { sampleRate: SR, hopLength: HOP, frameLength: 2048 });

    const stream = new AudioStream({ sampleRate: SR, windowSec: 2, hopLength: HOP });
    pushInChunks(stream, mixed, 137);
    const snap = stream.snapshot();

    expect(snap.edgePolicy).toBe(EDGE_POLICY_WITHHOLD);
    expect(snap.onsetLatencySec).toBeGreaterThanOrEqual(DEFAULT_POST_AVG_SEC);
    expect(snap.onsetLatencySec).toBeGreaterThan(snap.pitchLatencySec);
    expect(snap.tEndSec).toBeCloseTo(mixed.length / SR, 10);

    const offlineConfirmed = confirmedTimes(
      offlineOnsets.onsets,
      snap.tEndSec,
      snap.onsetLatencySec,
    );
    const streamTimes = snap.latestOnsets.map((o) => o.time);
    expect(streamTimes).toHaveLength(offlineConfirmed.length);
    for (let i = 0; i < streamTimes.length; i++) {
      expect(streamTimes[i]).toBeCloseTo(offlineConfirmed[i]!, 8);
    }

    const lastOffline = offlinePitch.frames[offlinePitch.frames.length - 1]!;
    if (lastOffline.f0Hz === null) {
      expect(snap.latestPitch).toBeNull();
    } else {
      expect(snap.latestPitch).not.toBeNull();
      expect(snap.latestPitch!.f0Hz).toBeCloseTo(lastOffline.f0Hz, 4);
    }
  });
});

describe("irregular chunk sizes", () => {
  it("agree with hop-sized pushes", () => {
    const samples = sine({ frequency: 440, duration: 0.8, sampleRate: SR });
    const a = new AudioStream({ sampleRate: SR, windowSec: 2 });
    const b = new AudioStream({ sampleRate: SR, windowSec: 2 });
    pushInChunks(a, samples, HOP);
    pushInChunks(b, samples, 1);
    const sa = a.snapshot();
    const sb = b.snapshot();
    expect(sa.tEndSec).toBeCloseTo(sb.tEndSec, 12);
    expect(sa.latestOnsets.length).toBe(sb.latestOnsets.length);
    if (sa.latestPitch && sb.latestPitch && sa.latestPitch.f0Hz && sb.latestPitch.f0Hz) {
      expect(sa.latestPitch.f0Hz).toBeCloseTo(sb.latestPitch.f0Hz, 4);
    } else {
      expect(sa.latestPitch?.f0Hz ?? null).toBe(sb.latestPitch?.f0Hz ?? null);
    }
  });
});

describe("ring buffer", () => {
  it("holds memory flat over a long run", () => {
    const stream = new AudioStream({ sampleRate: SR, windowSec: 1 });
    const startBytes = stream.bufferBytes;
    const chunk = new Float64Array(2048);
    for (let i = 0; i < 400; i++) stream.push(chunk);
    expect(stream.bufferBytes).toBe(startBytes);
    expect(stream.capacity).toBe(Math.ceil(1 * SR));
  });
});

describe("silence and reset", () => {
  it("reports no pitch on trailing silence rather than a stale one", () => {
    const stream = new AudioStream({ sampleRate: SR, windowSec: 2 });
    const tone = sine({ frequency: 440, duration: 0.4, sampleRate: SR });
    stream.push(tone);
    const voiced = stream.snapshot().latestPitch;
    expect(voiced?.f0Hz).not.toBeNull();
    const quiet = new Float64Array(Math.round(0.6 * SR));
    stream.push(quiet);
    expect(stream.snapshot().latestPitch).toBeNull();
  });

  it("reset() clears ring, time, and prior onsets", () => {
    const stream = new AudioStream({ sampleRate: SR, windowSec: 2 });
    const clicks = clickTrain({ times: [0.3], duration: 0.8, sampleRate: SR });
    stream.push(clicks);
    expect(stream.snapshot().tEndSec).toBeGreaterThan(0);
    stream.reset();
    const empty = stream.snapshot();
    expect(empty.tEndSec).toBe(0);
    expect(empty.filledSec).toBe(0);
    expect(empty.latestOnsets).toEqual([]);
    expect(empty.latestPitch).toBeNull();
    const tone = sine({ frequency: 330, duration: 0.4, sampleRate: SR });
    stream.push(tone);
    const after = stream.snapshot();
    expect(after.tEndSec).toBeCloseTo(0.4, 5);
    expect(after.latestOnsets.every((o) => Math.abs(o.time - 0.3) > 0.05)).toBe(true);
  });
});
