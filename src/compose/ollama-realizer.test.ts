// ─── Tests: the Ollama-backed realizer (stub backend, no live model) ─────────
//
// Verifies the proposer's contract without a running Ollama: per-sample seed
// threading (best-of-n explores), fail-soft on a dead/garbage backend, and
// tolerant parsing into a progression-aligned Realization.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  OllamaRealizer,
  parseRealizationResponse,
  buildRealizeUser,
  realizeSystem,
} from "./ollama-realizer.js";
import type { ChordProposerBackend } from "../maker/chord-proposer.js";
import type { ChordProgression } from "./realize.js";

const PROG: ChordProgression = {
  key: "C major",
  chords: [
    { measure: 1, chordSymbol: "C" },
    { measure: 2, chordSymbol: "G" },
  ],
};

/** A backend that returns fixed raw text (or null), and can throw from callStructured. */
class StubBackend implements ChordProposerBackend {
  constructor(
    private readonly raw: string | null,
    private readonly throwOnCall = false,
  ) {}
  async callStructured(): Promise<unknown> {
    if (this.throwOnCall) throw new Error("model returned invalid JSON");
    return {};
  }
  lastRawText(): string | null {
    return this.raw;
  }
  async probe(): Promise<void> {}
}

describe("OllamaRealizer — seed threading + fail-soft", () => {
  it("threads seed = baseSeed + sampleIndex to a fresh backend per sample", async () => {
    const seeds: number[] = [];
    const realizer = new OllamaRealizer("m", {
      baseSeed: 100,
      backendFactory: (seed) => {
        seeds.push(seed);
        return new StubBackend('[{"measure": 1, "voicing": "C3 E3 G3 C4"}]');
      },
    });
    await realizer.proposeRealization(PROG, 0);
    await realizer.proposeRealization(PROG, 3);
    expect(seeds).toEqual([100, 103]);
  });

  it("parses a valid response into a progression-aligned realization", async () => {
    const realizer = new OllamaRealizer("m", {
      backendFactory: () =>
        new StubBackend('[{"measure": 1, "voicing": "C3 E3 G3 C4"}, {"measure": 2, "voicing": "G2 D3 G3 B3"}]'),
    });
    const real = await realizer.proposeRealization(PROG, 0);
    expect(real).not.toBeNull();
    expect(real!.key).toBe("C major");
    expect(real!.frames.map((f) => f.voices)).toEqual([
      [48, 52, 55, 60],
      [43, 50, 55, 59],
    ]);
  });

  it("returns null when the backend yields no text (unreachable/empty)", async () => {
    const realizer = new OllamaRealizer("m", {
      backendFactory: () => new StubBackend(null, true),
    });
    expect(await realizer.proposeRealization(PROG, 0)).toBeNull();
  });

  it("recovers a fenced array even when callStructured throws", async () => {
    const realizer = new OllamaRealizer("m", {
      backendFactory: () => new StubBackend('```json\n[{"measure": 1, "voicing": "C3 E3 G3 C4"}]\n```', true),
    });
    const real = await realizer.proposeRealization(PROG, 0);
    expect(real!.frames[0].voices).toEqual([48, 52, 55, 60]);
  });
});

describe("parseRealizationResponse — tolerant + progression-aligned", () => {
  it("fills omitted measures with rest frames (fail the structure gate, get resampled)", () => {
    const real = parseRealizationResponse('[{"measure": 1, "voicing": "C3 E3 G3 C4"}]', PROG);
    expect(real.frames[0].voices).toHaveLength(4);
    expect(real.frames[1].voices).toHaveLength(0); // measure 2 omitted → rest
  });

  it("accepts a voices ARRAY of note tokens", () => {
    const real = parseRealizationResponse('[{"measure": 1, "voices": ["C3", "E3", "G3", "C4"]}]', PROG);
    expect(real.frames[0].voices).toEqual([48, 52, 55, 60]);
  });

  it("unwraps an object that wraps the array", () => {
    const real = parseRealizationResponse('{"realization": [{"measure": 1, "voicing": "C3 E3 G3 C4"}]}', PROG);
    expect(real.frames[0].voices).toEqual([48, 52, 55, 60]);
  });

  it("returns all-rest frames on unrecoverable garbage", () => {
    const real = parseRealizationResponse("not json at all", PROG);
    expect(real.frames.every((f) => f.voices.length === 0)).toBe(true);
  });
});

describe("brief builders", () => {
  it("injects the voice count and lists every measure", () => {
    expect(realizeSystem(4)).toContain("exactly 4 voices");
    const user = buildRealizeUser(PROG, 4);
    expect(user).toContain("C major");
    expect(user).toContain("| 1 | C |");
    expect(user).toContain("| 2 | G |");
  });
});
