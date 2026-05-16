// ─── jam-actions-v0 Provenance Rule Engine Tests ──────────────────────────────
//
// Tests each verdict path + edge cases.
// Includes the Für Elise regression: running the engine against the real
// Für Elise source string MUST produce `public_candidate` (same verdict as
// Slice 1's hardcoded value). If this test fails, fix the rule engine — not
// the record.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  parseSourceString,
  calcPdStatus,
  normalizeLicense,
  isRedistributionCompatible,
  classifyProvenance,
  type CompositionFacts,
  type ProvenanceInput,
} from "./provenance.js";

// ─── parseSourceString ────────────────────────────────────────────────────────

describe("parseSourceString", () => {
  it("parses the known piano-midi.de pattern (Slice 1 fixture)", () => {
    const { extracted, openQuestions } = parseSourceString(
      "Bernd Krueger, Source: piano-midi.de (CC BY-SA)",
    );
    expect(extracted.arrangement_creator).toBe("Bernd Krueger");
    expect(extracted.arrangement_license).toBe("CC-BY-SA");
    expect(extracted.arrangement_evidence_url).toBe("https://piano-midi.de/");
    expect(extracted.source_pattern_recognized).toBe(true);
    expect(openQuestions).toHaveLength(0);
  });

  it("parses piano-midi.de pattern case-insensitively", () => {
    const { extracted } = parseSourceString(
      "Some Creator, Source: PIANO-MIDI.DE (CC BY)",
    );
    expect(extracted.arrangement_creator).toBe("Some Creator");
    expect(extracted.arrangement_license).toBe("CC-BY");
    expect(extracted.arrangement_evidence_url).toBe("https://piano-midi.de/");
    expect(extracted.source_pattern_recognized).toBe(true);
  });

  it("returns nulls + open question for empty source", () => {
    const { extracted, openQuestions } = parseSourceString("");
    expect(extracted.arrangement_creator).toBeNull();
    expect(extracted.arrangement_license).toBeNull();
    expect(extracted.arrangement_evidence_url).toBeNull();
    expect(extracted.source_pattern_recognized).toBe(false);
    expect(openQuestions.length).toBeGreaterThan(0);
  });

  it("returns nulls + open question for null source", () => {
    const { extracted, openQuestions } = parseSourceString(null);
    expect(extracted.arrangement_creator).toBeNull();
    expect(extracted.source_pattern_recognized).toBe(false);
    expect(openQuestions.length).toBeGreaterThan(0);
  });

  it("returns nulls + open question for undefined source", () => {
    const { extracted, openQuestions } = parseSourceString(undefined);
    expect(extracted.arrangement_creator).toBeNull();
    expect(extracted.source_pattern_recognized).toBe(false);
    expect(openQuestions.length).toBeGreaterThan(0);
  });

  it("recognizes bare URL as unrecognized pattern with url preserved", () => {
    const { extracted, openQuestions } = parseSourceString(
      "https://example.com/midi/song.mid",
    );
    expect(extracted.arrangement_creator).toBeNull();
    expect(extracted.arrangement_license).toBeNull();
    expect(extracted.arrangement_evidence_url).toBe("https://example.com/midi/song.mid");
    expect(extracted.source_pattern_recognized).toBe(false);
    expect(openQuestions.length).toBeGreaterThan(0);
  });

  it("returns unrecognized for malformed source string", () => {
    const { extracted, openQuestions } = parseSourceString("Some random text without pattern");
    expect(extracted.arrangement_creator).toBeNull();
    expect(extracted.source_pattern_recognized).toBe(false);
    expect(openQuestions.length).toBeGreaterThan(0);
    // Raw string preserved for audit
    expect(extracted.source_string_raw).toBe("Some random text without pattern");
  });

  it("adds open question when license in source string is unrecognized", () => {
    const { extracted, openQuestions } = parseSourceString(
      "Some Author, Source: piano-midi.de (PROPRIETARY-LICENSE)",
    );
    // Pattern recognized (it's piano-midi.de format) but license unknown
    expect(extracted.source_pattern_recognized).toBe(true);
    expect(extracted.arrangement_creator).toBe("Some Author");
    // License stored as raw since not in known list
    expect(extracted.arrangement_license).toBe("PROPRIETARY-LICENSE");
    // Open question raised about unrecognized license
    expect(openQuestions.some((q) => q.includes("PROPRIETARY-LICENSE"))).toBe(true);
  });
});

// ─── calcPdStatus ─────────────────────────────────────────────────────────────

describe("calcPdStatus", () => {
  it("returns public_domain US for pre-1929 work", () => {
    const { us } = calcPdStatus({ compositionYear: 1810, composerDeathYear: 1827 });
    expect(us).toBe("public_domain");
  });

  it("returns public_domain EU for work where death+71 <= 2026", () => {
    // Beethoven d. 1827: PD EU since 1898
    const { eu } = calcPdStatus({ compositionYear: 1810, composerDeathYear: 1827 });
    expect(eu).toBe("public_domain");
  });

  it("returns copyrighted US for work published 1929 or later", () => {
    const { us } = calcPdStatus({ compositionYear: 1945, composerDeathYear: 1969 });
    expect(us).toBe("copyrighted");
  });

  it("returns copyrighted EU for living composer (deathYear=null)", () => {
    const { eu } = calcPdStatus({ compositionYear: 2001, composerDeathYear: null });
    expect(eu).toBe("copyrighted");
  });

  it("returns unknown EU when composerDeathYear is undefined", () => {
    const { eu, openQuestions } = calcPdStatus({
      compositionYear: 1850,
      // composerDeathYear not provided
    });
    expect(eu).toBe("unknown");
    expect(openQuestions.length).toBeGreaterThan(0);
  });

  it("returns unknown US when compositionYear is missing", () => {
    const { us, openQuestions } = calcPdStatus({ composerDeathYear: 1900 });
    expect(us).toBe("unknown");
    expect(openQuestions.length).toBeGreaterThan(0);
  });

  it("handles Traditional composer via publication year for EU (PD)", () => {
    // Greensleeves: Traditional, first referenced 1580
    const { us, eu } = calcPdStatus({
      composer: "Traditional",
      compositionYear: 1580,
    });
    expect(us).toBe("public_domain"); // pre-1929
    expect(eu).toBe("public_domain"); // 1580 + 70 = 1650 < 2026
  });

  it("respects override for US PD status", () => {
    const { us } = calcPdStatus({
      compositionYear: 1945,
      composerDeathYear: 1969,
      pdStatusUsOverride: "public_domain",
    });
    expect(us).toBe("public_domain");
  });

  it("respects override for EU PD status", () => {
    const { eu } = calcPdStatus({
      compositionYear: 1945,
      composerDeathYear: null,
      pdStatusEuOverride: "public_domain",
    });
    expect(eu).toBe("public_domain");
  });
});

// ─── normalizeLicense ─────────────────────────────────────────────────────────

describe("normalizeLicense", () => {
  it('normalizes "CC BY-SA" to "CC-BY-SA"', () => {
    expect(normalizeLicense("CC BY-SA")).toBe("CC-BY-SA");
  });

  it('normalizes "cc by-sa" (lowercase) to "CC-BY-SA"', () => {
    expect(normalizeLicense("cc by-sa")).toBe("CC-BY-SA");
  });

  it('normalizes "CC BY" to "CC-BY"', () => {
    expect(normalizeLicense("CC BY")).toBe("CC-BY");
  });

  it('normalizes "CC0" to "CC0"', () => {
    expect(normalizeLicense("CC0")).toBe("CC0");
  });

  it('normalizes "public domain" to "CC0"', () => {
    expect(normalizeLicense("public domain")).toBe("CC0");
  });

  it('normalizes "CC-BY-SA-4.0" to "CC-BY-SA-4.0"', () => {
    expect(normalizeLicense("CC-BY-SA-4.0")).toBe("CC-BY-SA-4.0");
  });

  it("returns null for unrecognized license", () => {
    expect(normalizeLicense("PROPRIETARY")).toBeNull();
    expect(normalizeLicense("All Rights Reserved")).toBeNull();
  });
});

// ─── isRedistributionCompatible ───────────────────────────────────────────────

describe("isRedistributionCompatible", () => {
  it("returns true for CC-BY-SA", () => {
    expect(isRedistributionCompatible("CC-BY-SA")).toBe(true);
  });

  it("returns true for CC-BY", () => {
    expect(isRedistributionCompatible("CC-BY")).toBe(true);
  });

  it("returns true for CC0", () => {
    expect(isRedistributionCompatible("CC0")).toBe(true);
  });

  it("returns false for null", () => {
    expect(isRedistributionCompatible(null)).toBe(false);
  });

  it("returns false for non-redistribution license strings", () => {
    // These are in the NON_REDISTRIBUTION list
    expect(isRedistributionCompatible("cc by-nc")).toBe(false);
    expect(isRedistributionCompatible("cc by-nd")).toBe(false);
  });
});

// ─── classifyProvenance — verdict paths ──────────────────────────────────────

describe("classifyProvenance", () => {
  // ── public_candidate ────────────────────────────────────────────────────────

  describe("public_candidate path", () => {
    it("returns public_candidate for a fully-qualifying input", () => {
      const input: ProvenanceInput = {
        source: "Bernd Krueger, Source: piano-midi.de (CC BY-SA)",
        composition: {
          title: "Test Piece",
          composer: "Old Composer",
          compositionYear: 1800,
          composerDeathYear: 1850,
        },
      };
      const result = classifyProvenance(input);
      expect(result.verdict).toBe("public_candidate");
      expect(result.composition_pd_status_us).toBe("public_domain");
      expect(result.composition_pd_status_eu).toBe("public_domain");
      expect(result.extracted.arrangement_creator).toBe("Bernd Krueger");
      expect(result.extracted.arrangement_license).toBe("CC-BY-SA");
      expect(result.extracted.arrangement_evidence_url).toBe("https://piano-midi.de/");
    });

    // ── REGRESSION: Für Elise must produce public_candidate ────────────────────
    it("[REGRESSION] Für Elise real source string → public_candidate (matches Slice 1 hardcoded verdict)", () => {
      // Source string is read verbatim from songs/library/classical/fur-elise.json
      const FUR_ELISE_SOURCE = "Bernd Krueger, Source: piano-midi.de (CC BY-SA)";

      const input: ProvenanceInput = {
        source: FUR_ELISE_SOURCE,
        composition: {
          title: "Bagatelle No. 25 in A minor (Für Elise)",
          composer: "Ludwig van Beethoven",
          compositionYear: 1810,
          composerDeathYear: 1827,
        },
      };
      const result = classifyProvenance(input);

      // Must match Slice 1 hardcoded verdict exactly
      expect(result.verdict).toBe("public_candidate");
      expect(result.composition_pd_status_us).toBe("public_domain");
      expect(result.composition_pd_status_eu).toBe("public_domain");
      expect(result.extracted.arrangement_creator).toBe("Bernd Krueger");
      expect(result.extracted.arrangement_license).toBe("CC-BY-SA");
      expect(result.extracted.arrangement_evidence_url).toBe("https://piano-midi.de/");
      // No open questions on a clean classification
      expect(result.open_questions).toHaveLength(0);
    });
  });

  // ── excluded path ────────────────────────────────────────────────────────────

  describe("excluded path", () => {
    it("returns excluded for copyrighted composition (both US and EU) with no license", () => {
      const input: ProvenanceInput = {
        source: undefined,
        composition: {
          title: "Imagine",
          composer: "John Lennon",
          compositionYear: 1971,
          composerDeathYear: 1980,
        },
      };
      const result = classifyProvenance(input);
      expect(result.verdict).toBe("excluded");
      expect(result.composition_pd_status_us).toBe("copyrighted");
      expect(result.composition_pd_status_eu).toBe("copyrighted");
    });

    it("returns excluded for a recent contemporary composition (still copyrighted)", () => {
      const input: ProvenanceInput = {
        source: "Some random source",
        composition: {
          title: "River Flows in You",
          composer: "Yiruma",
          compositionYear: 2001,
          composerDeathYear: null, // living composer
        },
      };
      const result = classifyProvenance(input);
      expect(result.verdict).toBe("excluded");
      expect(result.composition_pd_status_us).toBe("copyrighted");
      expect(result.composition_pd_status_eu).toBe("copyrighted");
    });

    it("returns excluded for known copyrighted blues composition", () => {
      const input: ProvenanceInput = {
        source: undefined,
        composition: {
          title: "The Thrill Is Gone",
          composer: "Roy Hawkins",
          compositionYear: 1951,
          composerDeathYear: 1973,
          // 1951 >= 1929 → US copyrighted; 1973+70+1=2044 > 2026 → EU copyrighted
        },
      };
      const result = classifyProvenance(input);
      expect(result.verdict).toBe("excluded");
    });
  });

  // ── internal path ─────────────────────────────────────────────────────────────

  describe("internal path", () => {
    it("returns internal when source string is missing (arrangement creator unknown)", () => {
      // PD composition but no source info
      const input: ProvenanceInput = {
        source: undefined,
        composition: {
          title: "Greensleeves",
          composer: "Traditional",
          compositionYear: 1580,
        },
      };
      const result = classifyProvenance(input);
      expect(result.verdict).toBe("internal");
      expect(result.composition_pd_status_us).toBe("public_domain");
      expect(result.composition_pd_status_eu).toBe("public_domain");
      // arrangement creator is null
      expect(result.extracted.arrangement_creator).toBeNull();
    });

    it("returns internal when EU PD status is unknown (composer death year not supplied)", () => {
      const input: ProvenanceInput = {
        source: "Bernd Krueger, Source: piano-midi.de (CC BY-SA)",
        composition: {
          title: "Mystery Piece",
          composer: "Unknown Composer",
          compositionYear: 1820,
          // composerDeathYear NOT supplied → EU unknown
        },
      };
      const result = classifyProvenance(input);
      expect(result.verdict).toBe("internal");
      expect(result.composition_pd_status_eu).toBe("unknown");
    });

    it("returns internal for scraped-source-only (bare URL, no creator or license)", () => {
      const input: ProvenanceInput = {
        source: "https://some-random-midi-archive.com/beethoven.mid",
        composition: {
          title: "Für Elise",
          composer: "Ludwig van Beethoven",
          compositionYear: 1810,
          composerDeathYear: 1827,
        },
      };
      const result = classifyProvenance(input);
      // Composition is PD, but source is bare URL → no creator, no license → internal
      expect(result.verdict).toBe("internal");
      expect(result.open_questions.length).toBeGreaterThan(0);
    });

    it("returns internal when arrangement_evidence_url is missing (arrangement creator but no URL)", () => {
      // Construct an input where creator is present but URL would be null.
      // We simulate this by using an unrecognized pattern that leaves url=null.
      const input: ProvenanceInput = {
        source: "Some random text without pattern",
        composition: {
          title: "Bach Prelude",
          composer: "Johann Sebastian Bach",
          compositionYear: 1722,
          composerDeathYear: 1750,
        },
      };
      const result = classifyProvenance(input);
      expect(result.verdict).toBe("internal");
    });

    it("returns internal when US PD status is unknown (no composition year)", () => {
      const input: ProvenanceInput = {
        source: "Bernd Krueger, Source: piano-midi.de (CC BY-SA)",
        composition: {
          title: "Undated Piece",
          composer: "Old Composer",
          composerDeathYear: 1800,
          // compositionYear not supplied
        },
      };
      const result = classifyProvenance(input);
      // US unknown → cannot confirm PD → internal
      expect(result.verdict).toBe("internal");
      expect(result.composition_pd_status_us).toBe("unknown");
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("routes to internal (not excluded) when one jurisdiction is unknown and other is copyrighted", () => {
      // EU unknown, US copyrighted → cannot confirm both copyrighted → internal (not excluded)
      const input: ProvenanceInput = {
        source: undefined,
        composition: {
          title: "Edge Case Piece",
          composer: "Some Composer",
          compositionYear: 1945,
          // composerDeathYear undefined → EU unknown
        },
      };
      const result = classifyProvenance(input);
      // US=copyrighted (1945>=1929), EU=unknown → not definitely copyrighted in both
      // → internal, not excluded (defensive: we can't confirm both copyrighted)
      expect(result.verdict).toBe("internal");
    });

    it("routes to excluded when both jurisdictions are definitively copyrighted (Stevie Wonder)", () => {
      const input: ProvenanceInput = {
        source: undefined,
        composition: {
          title: "Superstition",
          composer: "Stevie Wonder",
          compositionYear: 1972,
          composerDeathYear: null, // living
        },
      };
      const result = classifyProvenance(input);
      expect(result.verdict).toBe("excluded");
    });

    it("verdict_reason includes composition title and composer", () => {
      const input: ProvenanceInput = {
        source: "Bernd Krueger, Source: piano-midi.de (CC BY-SA)",
        composition: {
          title: "My Test Piece",
          composer: "Test Composer",
          compositionYear: 1800,
          composerDeathYear: 1850,
        },
      };
      const result = classifyProvenance(input);
      expect(result.verdict_reason).toContain("My Test Piece");
      expect(result.verdict_reason).toContain("Test Composer");
    });

    it("open_questions is an empty array (not undefined) for clean classifications", () => {
      const input: ProvenanceInput = {
        source: "Bernd Krueger, Source: piano-midi.de (CC BY-SA)",
        composition: {
          title: "Clean Piece",
          composer: "Old Composer",
          compositionYear: 1800,
          composerDeathYear: 1850,
        },
      };
      const result = classifyProvenance(input);
      expect(Array.isArray(result.open_questions)).toBe(true);
      expect(result.open_questions).toHaveLength(0);
    });

    it("always produces open_questions as array for excluded verdict", () => {
      const input: ProvenanceInput = {
        source: undefined,
        composition: {
          title: "Copyrighted Piece",
          composer: "Modern Composer",
          compositionYear: 2000,
          composerDeathYear: null,
        },
      };
      const result = classifyProvenance(input);
      expect(Array.isArray(result.open_questions)).toBe(true);
    });
  });

  // ── piano-midi.de batch (Bernd Krueger songs) ────────────────────────────────
  describe("piano-midi.de batch — all should produce public_candidate when composition is PD", () => {
    const pianoMidiSource = "Bernd Krueger, Source: piano-midi.de (CC BY-SA)";

    const pdCompositions: Array<{ id: string; title: string; composer: string; year: number; deathYear: number }> = [
      { id: "bach-prelude-c-major-bwv846", title: "Prelude in C Major BWV846", composer: "Johann Sebastian Bach", year: 1722, deathYear: 1750 },
      { id: "mozart-k545-mvt1", title: "Piano Sonata K545", composer: "Wolfgang Amadeus Mozart", year: 1788, deathYear: 1791 },
      { id: "pathetique-mvt2", title: "Sonata Pathétique Mvt.2", composer: "Ludwig van Beethoven", year: 1799, deathYear: 1827 },
      { id: "schumann-traumerei", title: "Träumerei", composer: "Robert Schumann", year: 1838, deathYear: 1856 },
      { id: "satie-gymnopedie-no1", title: "Gymnopédie No.1", composer: "Erik Satie", year: 1888, deathYear: 1925 },
    ];

    for (const c of pdCompositions) {
      it(`${c.id} → public_candidate`, () => {
        const input: ProvenanceInput = {
          source: pianoMidiSource,
          composition: {
            title: c.title,
            composer: c.composer,
            compositionYear: c.year,
            composerDeathYear: c.deathYear,
          },
        };
        const result = classifyProvenance(input);
        expect(result.verdict).toBe("public_candidate");
      });
    }
  });
});
