// ─── Tests: E2v2 generative foil control ─────────────────────────────────────
//
// The control repair (design §6.2.2). What these lock:
//   - the Markov foil is built from the PROMPT (never gold), so it cannot
//     inherit gold's micro-timing — output pitches are a subset of the prompt's;
//   - it is fully deterministic per seed (replayable) and seed-sensitive;
//   - it lands inside the target window at prompt-matched density;
//   - thin / textureless prompts are not_computable, never a fabricated foil;
//   - copy-forward re-emits the prompt's last bars, end-aligned, tiling if short.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import type { TimedEvent } from "../schema.js";
import { isNotComputable } from "./phrase-continuation.js";
import { hashSeed, buildMarkovFoil, buildCopyForwardFoil } from "./markov-foil.js";

function mkEvent(measure: number, beat: number, note: number): TimedEvent {
  return {
    t_seconds: 0, t_ticks: 0, dur_seconds: 0.5, dur_ticks: 240,
    note, name: `MIDI${note}`, velocity: 64, channel: 0, hand: "right", measure, beat,
  };
}

/** An Alberti-ish 4-bar prompt with recurring (pitch, IOI) states → branching. */
function promptEvents(): TimedEvent[] {
  const bar = (m: number) => [mkEvent(m, 0, 60), mkEvent(m, 1, 64), mkEvent(m, 2, 67), mkEvent(m, 3, 64)];
  return [...bar(1), ...bar(2), ...bar(3), ...bar(4)];
}

// ─── hashSeed ────────────────────────────────────────────────────────────────

describe("hashSeed", () => {
  it("is deterministic and distinguishes pair ids", () => {
    expect(hashSeed("clair-de-lune:m005-008")).toBe(hashSeed("clair-de-lune:m005-008"));
    expect(hashSeed("a")).not.toBe(hashSeed("b"));
    expect(hashSeed("x") >>> 0).toBe(hashSeed("x")); // unsigned
  });
});

// ─── The Markov foil ─────────────────────────────────────────────────────────

describe("buildMarkovFoil", () => {
  const base = { targetStartMeasure: 5, numTargetBars: 4, timeSignature: "4/4" };

  it("is fully deterministic for a given seed (replayable)", () => {
    const a = buildMarkovFoil({ promptEvents: promptEvents(), ...base, seed: 42 });
    const b = buildMarkovFoil({ promptEvents: promptEvents(), ...base, seed: 42 });
    expect(isNotComputable(a)).toBe(false);
    expect(a).toEqual(b);
  });

  it("responds to the seed (different seeds → different foils)", () => {
    const a = buildMarkovFoil({ promptEvents: promptEvents(), ...base, seed: 1 }) as TimedEvent[];
    const b = buildMarkovFoil({ promptEvents: promptEvents(), ...base, seed: 999 }) as TimedEvent[];
    // Same texture + short window can coincide occasionally; assert not identical
    // across a few seeds rather than any single pair.
    const seeds = [1, 7, 13, 99, 999].map(
      (s) => JSON.stringify(buildMarkovFoil({ promptEvents: promptEvents(), ...base, seed: s })),
    );
    expect(new Set(seeds).size).toBeGreaterThan(1);
    void a; void b;
  });

  it("never inherits gold's surface — output pitches are a subset of the prompt's", () => {
    const foil = buildMarkovFoil({ promptEvents: promptEvents(), ...base, seed: 42 }) as TimedEvent[];
    const promptPitches = new Set(promptEvents().map((e) => e.note));
    expect(foil.every((e) => promptPitches.has(e.note))).toBe(true);
  });

  it("lands inside the target window at prompt-matched density", () => {
    const foil = buildMarkovFoil({ promptEvents: promptEvents(), ...base, seed: 42 }) as TimedEvent[];
    expect(foil.length).toBeGreaterThan(0);
    expect(foil.every((e) => e.measure >= 5 && e.measure <= 8)).toBe(true);
    // Density within the cap (≤ 4× prompt onsets) and non-trivial (≥ ¼×).
    const prompt = promptEvents().length; // 16
    expect(foil.length).toBeLessThanOrEqual(prompt * 4);
    expect(foil.length).toBeGreaterThanOrEqual(prompt / 4);
  });

  it("is not_computable for a prompt too thin to train a chain", () => {
    const r = buildMarkovFoil({ promptEvents: [mkEvent(1, 0, 60)], ...base, seed: 42 });
    expect(isNotComputable(r)).toBe(true);
  });

  it("is not_computable for a textureless prompt (all simultaneous, no IOI)", () => {
    const chord = [mkEvent(1, 0, 60), mkEvent(1, 0, 64), mkEvent(1, 0, 67)];
    const r = buildMarkovFoil({ promptEvents: chord, ...base, seed: 42 });
    expect(isNotComputable(r)).toBe(true);
  });

  it("handles meter it cannot parse without throwing", () => {
    const r = buildMarkovFoil({ promptEvents: promptEvents(), targetStartMeasure: 5, numTargetBars: 4, timeSignature: "bad", seed: 1 });
    expect(isNotComputable(r)).toBe(true);
  });
});

// ─── Copy-forward ────────────────────────────────────────────────────────────

describe("buildCopyForwardFoil", () => {
  it("re-emits the prompt's last bars end-aligned into the target window", () => {
    // Distinct pitch per bar so we can see the mapping.
    const prompt = [mkEvent(1, 0, 60), mkEvent(2, 0, 62), mkEvent(3, 0, 64), mkEvent(4, 0, 65)];
    const foil = buildCopyForwardFoil({ promptEvents: prompt, targetStartMeasure: 5, numTargetBars: 4, timeSignature: "4/4" }) as TimedEvent[];
    const byMeasure = new Map(foil.map((e) => [e.measure, e.note]));
    expect(byMeasure.get(5)).toBe(60); // m5 ← prompt m1
    expect(byMeasure.get(6)).toBe(62);
    expect(byMeasure.get(7)).toBe(64);
    expect(byMeasure.get(8)).toBe(65); // last target bar ← last prompt bar
  });

  it("tiles backwards when the prompt is shorter than the target, end-aligned", () => {
    const prompt = [mkEvent(1, 0, 60), mkEvent(2, 0, 62)];
    const foil = buildCopyForwardFoil({ promptEvents: prompt, targetStartMeasure: 5, numTargetBars: 4, timeSignature: "4/4" }) as TimedEvent[];
    const byMeasure = new Map(foil.map((e) => [e.measure, e.note]));
    // End-aligned: m8 ← prompt's last bar (m2), m7 ← m1, m6 ← m2, m5 ← m1.
    expect(byMeasure.get(8)).toBe(62);
    expect(byMeasure.get(7)).toBe(60);
    expect(byMeasure.get(6)).toBe(62);
    expect(byMeasure.get(5)).toBe(60);
  });

  it("preserves within-bar beats", () => {
    const prompt = [mkEvent(1, 0, 60), mkEvent(1, 2.5, 64)];
    const foil = buildCopyForwardFoil({ promptEvents: prompt, targetStartMeasure: 5, numTargetBars: 1, timeSignature: "4/4" }) as TimedEvent[];
    expect(foil.find((e) => e.note === 64)?.beat).toBe(2.5);
  });

  it("is not_computable on an empty prompt", () => {
    expect(isNotComputable(buildCopyForwardFoil({ promptEvents: [], targetStartMeasure: 5, numTargetBars: 4, timeSignature: "4/4" }))).toBe(true);
  });
});
