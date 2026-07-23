// ─── Tests: the Ollama voicing-SPEC proposer (stub backend, no live model) ────
//
// Verifies the proposer's contract without a running Ollama: per-sample seed
// threading, fail-soft, tolerant spec parsing, and — the point of B1a — that a
// rendered response spells its chord even when the stub emits nonsense degrees.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  OllamaSpecRealizer,
  parseSpecResponse,
  buildSpecUser,
  specSystem,
} from "./ollama-spec-realizer.js";
import { parseChordSymbol } from "../maker/verify-harmony.js";
import type { ChordProposerBackend } from "../maker/chord-proposer.js";
import type { ChordProgression } from "./realize.js";

const PROG: ChordProgression = {
  key: "C major",
  chords: [
    { measure: 1, chordSymbol: "C" },
    { measure: 2, chordSymbol: "G7" },
  ],
};

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

const isChordTones = (chordSymbol: string, voices: number[]): boolean => {
  const pcs = new Set(parseChordSymbol(chordSymbol)!.pcs);
  return voices.every((v) => pcs.has(v % 12));
};

describe("OllamaSpecRealizer — seed threading + fail-soft", () => {
  it("threads seed = baseSeed + sampleIndex to a fresh backend per sample", async () => {
    const seeds: number[] = [];
    const realizer = new OllamaSpecRealizer("m", {
      baseSeed: 100,
      backendFactory: (seed) => {
        seeds.push(seed);
        return new StubBackend('[{"measure": 1, "degrees": [0,1,2,0]}]');
      },
    });
    await realizer.proposeRealization(PROG, 0);
    await realizer.proposeRealization(PROG, 3);
    expect(seeds).toEqual([100, 103]);
  });

  it("renders a spec response into a membership-correct realization", async () => {
    const realizer = new OllamaSpecRealizer("m", {
      backendFactory: () =>
        new StubBackend('[{"measure": 1, "degrees": [0,1,2,0], "bassOctave": 3}, {"measure": 2, "degrees": [0,1,2,3]}]'),
    });
    const real = await realizer.proposeRealization(PROG, 0);
    expect(real).not.toBeNull();
    expect(real!.frames[0].voices).toEqual([48, 52, 55, 60]); // C3 E3 G3 C4
    for (const f of real!.frames) expect(isChordTones(f.chordSymbol, f.voices)).toBe(true);
  });

  it("renders CHORD TONES even when the model emits garbage degrees (the B1a guarantee)", async () => {
    const realizer = new OllamaSpecRealizer("m", {
      backendFactory: () =>
        new StubBackend('[{"measure": 1, "degrees": [42,-9,3.3,100]}, {"measure": 2, "degrees": [7,7,7,7]}]'),
    });
    const real = await realizer.proposeRealization(PROG, 0);
    for (const f of real!.frames) {
      expect(f.voices).toHaveLength(4);
      expect(isChordTones(f.chordSymbol, f.voices)).toBe(true);
    }
  });

  it("returns null when the backend yields no text (unreachable/empty)", async () => {
    const realizer = new OllamaSpecRealizer("m", { backendFactory: () => new StubBackend(null, true) });
    expect(await realizer.proposeRealization(PROG, 0)).toBeNull();
  });

  it("recovers a fenced array even when callStructured throws", async () => {
    const realizer = new OllamaSpecRealizer("m", {
      backendFactory: () => new StubBackend('```json\n[{"measure": 1, "degrees": [0,1,2,0]}]\n```', true),
    });
    const real = await realizer.proposeRealization(PROG, 0);
    expect(real!.frames[0].voices).toEqual([48, 52, 55, 60]);
  });
});

describe("parseSpecResponse — tolerant", () => {
  it("parses a raw array of specs", () => {
    const specs = parseSpecResponse('[{"measure": 1, "degrees": [0,1,2,0], "bassOctave": 4}]');
    expect(specs).toEqual([{ measure: 1, degrees: [0, 1, 2, 0], bassOctave: 4 }]);
  });

  it("unwraps an object that wraps the array + accepts field variants", () => {
    const specs = parseSpecResponse('{"voicing": [{"m": 2, "tones": [1,2,0]}]}');
    expect(specs).toEqual([{ measure: 2, degrees: [1, 2, 0] }]);
  });

  it("drops entries with no usable degrees, keeps the rest", () => {
    const specs = parseSpecResponse('[{"measure": 1, "degrees": []}, {"measure": 2, "degrees": [0,1,2,3]}]');
    expect(specs).toEqual([{ measure: 2, degrees: [0, 1, 2, 3] }]);
  });

  it("returns [] on unrecoverable garbage", () => {
    expect(parseSpecResponse("not json at all")).toEqual([]);
  });
});

describe("spec brief builders", () => {
  it("injects the voice count and explains chord-note numbering", () => {
    const sys = specSystem(4);
    expect(sys).toContain("exactly 4 voices");
    expect(sys).toContain("0 = the root");
    const user = buildSpecUser(PROG, 4);
    expect(user).toContain("C major");
    expect(user).toContain("| 1 | C |");
    expect(user).toContain("| 2 | G7 |");
  });
});
