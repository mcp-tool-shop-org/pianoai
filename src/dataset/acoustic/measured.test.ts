// ─── Measured gold: the estimator, not the intended draw ─────────────────────
//
// A draw that stays in its band can still be scored on the wrong side of the
// gate once YIN (~10 c) or one onset hop (11.6 ms) has had a look. These tests
// run the rendered take through the actual pitch tracker and onset detector
// and assert the MEASURED verdict matches the gold. Checking only the recipe
// cannot catch that class.

import { describe, it, expect } from "vitest";
import { trackPitch, scorePitchWindow } from "../../audio/pitch.js";
import { detectOnsets, HOUSE_TOLERANCE_MS } from "../../audio/onsets.js";
import { transcribe } from "../../audio/transcribe.js";
import { buildRecord, fixturePhrase, renderTake } from "./builder.js";
import type { AcousticRecord } from "./schema.js";

function samplesOf(rec: AcousticRecord): Float64Array {
  return renderTake(rec.observation.render.recipe);
}

function targetWindow(rec: AcousticRecord): { midi: number; start: number; end: number } {
  const recipe = rec.observation.render.recipe;
  const note = recipe.notes[recipe.target_index]!;
  const delay = recipe.delay_sec ?? 0;
  const start = recipe.pre_roll_sec + note.time + delay;
  return { midi: note.midi, start, end: start + note.duration };
}

describe("measured pitch verdict matches gold", () => {
  it("sharp_60 is a fail, not a warn", () => {
    const rec = buildRecord(fixturePhrase(), { seed: 12, kind: "sharp_60" });
    const { midi, start, end } = targetWindow(rec);
    const track = trackPitch(samplesOf(rec), {
      sampleRate: rec.observation.render.sample_rate,
    });
    const verdict = scorePitchWindow(track, midi, Math.max(0, start - 0.05), end + 0.05);
    expect(rec.observation.gold.verdict).toBe("pitch_fail");
    expect(verdict.status).toBe("fail");
    expect(Math.abs(verdict.centsMedian ?? 0)).toBeGreaterThan(50);
  });

  it("sharp_30 is a warn, not a fail", () => {
    const rec = buildRecord(fixturePhrase(), { seed: 12, kind: "sharp_30" });
    const { midi, start, end } = targetWindow(rec);
    const track = trackPitch(samplesOf(rec), {
      sampleRate: rec.observation.render.sample_rate,
    });
    const verdict = scorePitchWindow(track, midi, Math.max(0, start - 0.05), end + 0.05);
    expect(rec.observation.gold.verdict).toBe("pitch_warn");
    expect(verdict.status).toBe("warn");
    const mag = Math.abs(verdict.centsMedian ?? 0);
    expect(mag).toBeGreaterThan(25);
    expect(mag).toBeLessThanOrEqual(50);
  });

  it("vibrato measures in tune at the centre pitch", () => {
    const rec = buildRecord(fixturePhrase(), { seed: 12, kind: "vibrato" });
    const { midi, start, end } = targetWindow(rec);
    const track = trackPitch(samplesOf(rec), {
      sampleRate: rec.observation.render.sample_rate,
    });
    const verdict = scorePitchWindow(track, midi, Math.max(0, start - 0.05), end + 0.05);
    expect(rec.observation.gold.verdict).toBe("in_tune");
    expect(verdict.status).toBe("correct");
  });
});

describe("measured timing verdict matches gold", () => {
  function onsetErrorMs(rec: AcousticRecord): number {
    const recipe = rec.observation.render.recipe;
    const note = recipe.notes[recipe.target_index]!;
    const expected = recipe.pre_roll_sec + note.time;
    const sounded = expected + (recipe.delay_sec ?? 0);
    const result = detectOnsets(samplesOf(rec), { sampleRate: recipe.sample_rate });
    expect(result.onsets.length).toBeGreaterThan(0);
    let nearest = result.onsets[0]!;
    for (const o of result.onsets) {
      if (Math.abs(o.time - sounded) < Math.abs(nearest.time - sounded)) nearest = o;
    }
    return (nearest.time - expected) * 1000;
  }

  it("late_80 measures beyond the 40 ms gate", () => {
    const rec = buildRecord(fixturePhrase(), { seed: 12, kind: "late_80" });
    expect(rec.observation.gold.verdict).toBe("timing_fail");
    expect(onsetErrorMs(rec)).toBeGreaterThan(HOUSE_TOLERANCE_MS);
  });

  it("late_25 measures inside the 40 ms gate", () => {
    const rec = buildRecord(fixturePhrase(), { seed: 12, kind: "late_25" });
    expect(rec.observation.gold.verdict).toBe("timing_pass");
    expect(Math.abs(onsetErrorMs(rec))).toBeLessThan(HOUSE_TOLERANCE_MS);
  });
});

describe("measured silence is empty, not a zero", () => {
  it("transcribe returns no notes", () => {
    const rec = buildRecord(fixturePhrase(), { seed: 12, kind: "silence" });
    const result = transcribe(samplesOf(rec), {
      sampleRate: rec.observation.render.sample_rate,
    });
    expect(rec.observation.gold.verdict).toBe("nothing_to_grade");
    expect(result.notes).toEqual([]);
  });
});
