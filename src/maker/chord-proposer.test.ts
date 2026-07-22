// ─── Tests: the chords-only decompose prompt + the Ollama chord proposer ──────
//
// The prompt/parse are the SINGLE SOURCE shared by scripts/er-experiments.ts and
// the product path, so they are pinned here. OllamaChordProposer is exercised
// through an injected backend (no live model): the seed-threading that makes
// best-of-n explore, the parse integration, and the tolerant fail-soft contract
// the MCP tool depends on.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  CHORDS_ONLY_SYSTEM,
  buildChordsOnlyUser,
  parseChordsOnly,
  OllamaChordProposer,
  type ChordProposerBackend,
} from "./chord-proposer.js";
import type { ERItem } from "./er-gate.js";

function mkItem(source: string[]): ERItem {
  return {
    itemId: "t:m1-3", songId: "t", genre: "jazz", title: "t", key: "A minor", timeSignature: "4/4",
    measureRange: [1, source.length],
    melody: source.map((_, i) => ({ number: i + 1, rightHand: "A4:q C5:q E5:q" })),
    sourceChords: source.map((c, i) => ({ measure: i + 1, impliedChord: c })),
  };
}

/** A backend stub: records its seed + whether it was probed, returns canned text. */
class StubBackend implements ChordProposerBackend {
  probed = false;
  constructor(
    readonly seed: number,
    private readonly rawText: string | null,
    private readonly throwOnCall = false,
  ) {}
  async callStructured(): Promise<unknown> {
    if (this.throwOnCall) throw new Error("model returned invalid JSON");
    return {};
  }
  lastRawText(): string | null {
    return this.rawText;
  }
  async probe(): Promise<void> {
    this.probed = true;
  }
}

describe("parseChordsOnly", () => {
  it("parses a raw JSON array with `chord`", () => {
    expect(parseChordsOnly('[{"measure":1,"chord":"Am7"},{"measure":2,"chord":"Fmaj7"}]')).toEqual([
      { measure: 1, intendedChord: "Am7" },
      { measure: 2, intendedChord: "Fmaj7" },
    ]);
  });

  it("accepts field-name variants (intendedChord/intended, m/bar)", () => {
    expect(parseChordsOnly('[{"m":1,"intendedChord":"C"},{"bar":2,"intended":"G7"}]')).toEqual([
      { measure: 1, intendedChord: "C" },
      { measure: 2, intendedChord: "G7" },
    ]);
  });

  it("unwraps an object that wraps the array", () => {
    expect(parseChordsOnly('{"reharmonization":[{"measure":1,"chord":"Am"}]}')).toEqual([
      { measure: 1, intendedChord: "Am" },
    ]);
  });

  it("recovers an array from a ```json fence", () => {
    expect(parseChordsOnly('Sure!\n```json\n[{"measure":1,"chord":"Dm7"}]\n```')).toEqual([
      { measure: 1, intendedChord: "Dm7" },
    ]);
  });

  it("recovers an array embedded in prose", () => {
    expect(parseChordsOnly('Here you go: [{"measure":1,"chord":"E7"}] enjoy')).toEqual([
      { measure: 1, intendedChord: "E7" },
    ]);
  });

  it("drops entries missing a measure or a chord", () => {
    expect(parseChordsOnly('[{"measure":1,"chord":"Am"},{"chord":"G"},{"measure":3}]')).toEqual([
      { measure: 1, intendedChord: "Am" },
    ]);
  });

  it("returns [] for empty / unrecoverable input", () => {
    expect(parseChordsOnly("")).toEqual([]);
    expect(parseChordsOnly("   ")).toEqual([]);
    expect(parseChordsOnly("no json here")).toEqual([]);
    expect(parseChordsOnly("{}")).toEqual([]);
  });
});

describe("buildChordsOnlyUser", () => {
  const item = mkItem(["Am", "Fmaj7", "E7"]);

  it("includes the melody table and the source chords", () => {
    const user = buildChordsOnlyUser(item);
    expect(user).toContain("| Measure | Melody (right hand) | Original chord |");
    expect(user).toContain("Am");
  });

  it("asks for a chord-per-measure JSON array (drops the voicing instruction)", () => {
    const user = buildChordsOnlyUser(item);
    expect(user).toContain("chord-per-measure reharmonization as a JSON array");
    expect(user).not.toContain("Propose your reharmonization");
  });
});

describe("CHORDS_ONLY_SYSTEM", () => {
  it("names the chords-only contract and the supported qualities", () => {
    expect(CHORDS_ONLY_SYSTEM).toContain("chord SYMBOLS");
    expect(CHORDS_ONLY_SYSTEM).toContain("do NOT write voicings");
    expect(CHORDS_ONLY_SYSTEM).toContain("maj7");
    expect(CHORDS_ONLY_SYSTEM).toContain("m7b5");
    expect(CHORDS_ONLY_SYSTEM).toContain('"chord"');
  });
});

describe("OllamaChordProposer", () => {
  const item = mkItem(["Am", "Am", "Am"]);

  it("defaults model, baseSeed, and maxTokens", () => {
    const p = new OllamaChordProposer();
    expect(p.model).toBe("qwen2.5:7b");
    expect(p.baseSeed).toBe(42);
    expect(p.maxTokens).toBe(1024);
  });

  it("threads baseSeed + sampleIndex into each sample's backend seed", async () => {
    const seeds: number[] = [];
    const proposer = new OllamaChordProposer("qwen2.5:7b", {
      baseSeed: 42,
      backendFactory: (seed) => {
        seeds.push(seed);
        return new StubBackend(seed, '[{"measure":1,"chord":"Am7"}]');
      },
    });
    await proposer.proposeChords(item, 0);
    await proposer.proposeChords(item, 5);
    expect(seeds).toEqual([42, 47]); // best-of-n explores via distinct seeds
  });

  it("parses the backend output into ChordChoice[]", async () => {
    const proposer = new OllamaChordProposer("m", {
      backendFactory: (seed) => new StubBackend(seed, '[{"measure":1,"chord":"Fmaj7"},{"measure":2,"chord":"Dm7"}]'),
    });
    expect(await proposer.proposeChords(item, 0)).toEqual([
      { measure: 1, intendedChord: "Fmaj7" },
      { measure: 2, intendedChord: "Dm7" },
    ]);
  });

  it("returns [] when the backend throws with no recoverable text (fail-soft)", async () => {
    const proposer = new OllamaChordProposer("m", {
      backendFactory: (seed) => new StubBackend(seed, null, /* throwOnCall */ true),
    });
    expect(await proposer.proposeChords(item, 0)).toEqual([]);
  });

  it("recovers chords when callStructured throws but rawText is populated", async () => {
    // Mirrors OllamaBackend: _lastRawText is set before the JSON.parse that throws.
    const proposer = new OllamaChordProposer("m", {
      backendFactory: (seed) => new StubBackend(seed, '```json\n[{"measure":1,"chord":"Am"}]\n```', /* throwOnCall */ true),
    });
    expect(await proposer.proposeChords(item, 0)).toEqual([{ measure: 1, intendedChord: "Am" }]);
  });

  it("probe() delegates to a backend built at the base seed", async () => {
    const built: StubBackend[] = [];
    const proposer = new OllamaChordProposer("m", {
      baseSeed: 7,
      backendFactory: (seed) => {
        const b = new StubBackend(seed, null);
        built.push(b);
        return b;
      },
    });
    await proposer.probe();
    expect(built).toHaveLength(1);
    expect(built[0].seed).toBe(7);
    expect(built[0].probed).toBe(true);
  });
});
