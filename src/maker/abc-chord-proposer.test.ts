// ─── Tests: the ABC-format chord proposer + parser ───────────────────────────
//
// parseAbcChords pins the narrow "extract quoted chord annotations, map to
// measures by position" contract; AbcChordProposer is exercised through an
// injected backend (no live model) for seed-threading and the fail-soft path.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  ABC_REHARM_SYSTEM,
  buildAbcReharmUser,
  parseAbcChords,
  AbcChordProposer,
  type AbcProposerBackend,
} from "./abc-chord-proposer.js";
import type { ERItem } from "./er-gate.js";

function mkItem(n: number): ERItem {
  return {
    itemId: "t:m1", songId: "t", genre: "jazz", title: "t", key: "A minor", timeSignature: "4/4",
    measureRange: [1, n],
    melody: Array.from({ length: n }, (_, i) => ({ number: i + 1, rightHand: "A4:q C5:q E5:q" })),
    sourceChords: Array.from({ length: n }, (_, i) => ({ measure: i + 1, impliedChord: "Am" })),
  };
}

/** A backend stub: records its seed + whether it was probed, returns canned ABC. */
class StubAbcBackend implements AbcProposerBackend {
  probed = false;
  constructor(
    readonly seed: number,
    private readonly text: string | null,
    private readonly throwOnCall = false,
  ) {}
  async generateText(): Promise<string> {
    if (this.throwOnCall) throw new Error("ollama down");
    return this.text ?? "";
  }
  lastRawText(): string | null {
    return this.text;
  }
  async probe(): Promise<void> {
    this.probed = true;
  }
}

describe("parseAbcChords", () => {
  it("extracts one chord per bar from an ABC lead sheet", () => {
    const abc = [
      "X:1", "T:Reharm", "M:4/4", "L:1/4", "K:Amin",
      '"Fmaj7"A2 c2 | "Dm7"d2 f2 | "E7"e2 ^g2 | "Am7"a4 |',
    ].join("\n");
    expect(parseAbcChords(abc, [1, 2, 3, 4])).toEqual([
      { measure: 1, intendedChord: "Fmaj7" },
      { measure: 2, intendedChord: "Dm7" },
      { measure: 3, intendedChord: "E7" },
      { measure: 4, intendedChord: "Am7" },
    ]);
  });

  it("recovers from an ```abc fence wrapped in prose", () => {
    const abc = 'Here is the tune:\n```abc\nK:C\n"C"C2 | "G7"G2 |\n```\nEnjoy!';
    expect(parseAbcChords(abc, [1, 2])).toEqual([
      { measure: 1, intendedChord: "C" },
      { measure: 2, intendedChord: "G7" },
    ]);
  });

  it("skips ABC text annotations (^_<>@) but keeps chord annotations", () => {
    const abc = 'K:C\n"^intro""C"C2 | "Am"A2 |';
    expect(parseAbcChords(abc, [1, 2])).toEqual([
      { measure: 1, intendedChord: "C" },
      { measure: 2, intendedChord: "Am" },
    ]);
  });

  it("maps chords to the given measure numbers and truncates to their count", () => {
    const abc = 'K:C\n"C" | "F" | "G" |';
    expect(parseAbcChords(abc, [5, 6])).toEqual([
      { measure: 5, intendedChord: "C" },
      { measure: 6, intendedChord: "F" },
    ]);
  });

  it("returns [] for empty or chordless input", () => {
    expect(parseAbcChords("", [1])).toEqual([]);
    expect(parseAbcChords("K:C\nC2 D2 | E2 F2 |", [1, 2])).toEqual([]); // no chord annotations
    expect(parseAbcChords("just prose, no abc here", [1])).toEqual([]);
  });
});

describe("buildAbcReharmUser + ABC_REHARM_SYSTEM", () => {
  it("keeps the melody table but asks for an ABC lead sheet (not JSON)", () => {
    const user = buildAbcReharmUser(mkItem(3));
    expect(user).toContain("| Measure | Melody (right hand) | Original chord |");
    expect(user).toContain("ABC lead sheet");
    expect(user).not.toContain("JSON array");
  });
  it("names the chords-in-quotes contract and the supported qualities", () => {
    expect(ABC_REHARM_SYSTEM).toContain("ABC notation");
    expect(ABC_REHARM_SYSTEM).toContain("in quotes");
    expect(ABC_REHARM_SYSTEM).toContain("add9");
  });
});

describe("AbcChordProposer", () => {
  const item = mkItem(3);

  it("threads baseSeed + sampleIndex into each sample's backend seed", async () => {
    const seeds: number[] = [];
    const p = new AbcChordProposer("qwen2.5:7b", {
      baseSeed: 42,
      backendFactory: (seed) => {
        seeds.push(seed);
        return new StubAbcBackend(seed, 'K:C\n"C"C2 |');
      },
    });
    await p.proposeChords(item, 0);
    await p.proposeChords(item, 3);
    expect(seeds).toEqual([42, 45]);
  });

  it("parses generated ABC into ChordChoice[] mapped to the item's measures", async () => {
    const p = new AbcChordProposer("m", {
      backendFactory: (s) => new StubAbcBackend(s, 'K:Amin\n"Fmaj7"A2 | "Dm7"d2 | "E7"e2 |'),
    });
    expect(await p.proposeChords(item, 0)).toEqual([
      { measure: 1, intendedChord: "Fmaj7" },
      { measure: 2, intendedChord: "Dm7" },
      { measure: 3, intendedChord: "E7" },
    ]);
  });

  it("returns [] when generateText throws with no recoverable text (fail-soft)", async () => {
    const p = new AbcChordProposer("m", { backendFactory: (s) => new StubAbcBackend(s, null, true) });
    expect(await p.proposeChords(item, 0)).toEqual([]);
  });

  it("recovers from lastRawText when generateText throws after setting it", async () => {
    const p = new AbcChordProposer("m", { backendFactory: (s) => new StubAbcBackend(s, 'K:C\n"C"C2 |', true) });
    expect(await p.proposeChords(item, 0)).toEqual([{ measure: 1, intendedChord: "C" }]);
  });

  it("probe() delegates to a backend built at the base seed", async () => {
    const built: StubAbcBackend[] = [];
    const p = new AbcChordProposer("m", {
      baseSeed: 9,
      backendFactory: (s) => {
        const b = new StubAbcBackend(s, null);
        built.push(b);
        return b;
      },
    });
    await p.probe();
    expect(built[0].seed).toBe(9);
    expect(built[0].probed).toBe(true);
  });
});
