// ─── Tests: named style profiles (the thin control surface + the partition) ──
//
// The partition is load-bearing: the HARD FLOOR is style-INVARIANT (never
// relaxed by any preset) and the STYLE-GATED rules are exactly the relaxable set.
// A preset that relaxes a hard-floor rule is a construction error (the anti-
// Goodhart guarantee that a "style" can never wave through a malformed voicing).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import {
  resolveStyle,
  validateProfile,
  STYLE_PROFILES,
  HARD_FLOOR_RULES,
  STYLE_GATED_RULES,
  DEFAULT_STYLE,
  type StyleProfile,
} from "./style.js";
import type { VLRule } from "./voice-leading.js";

describe("style — the hard-floor / style-gated partition", () => {
  it("partitions the rule space with no overlap", () => {
    const floor = new Set<VLRule>(HARD_FLOOR_RULES);
    const gated = new Set<VLRule>(STYLE_GATED_RULES);
    for (const r of floor) expect(gated.has(r), `${r} is in BOTH sets`).toBe(false);
    for (const r of gated) expect(floor.has(r), `${r} is in BOTH sets`).toBe(false);
  });

  it("keeps the membership + smoothness floor style-invariant", () => {
    // The rules that make a voicing well-formed (not merely idiomatic) must be in
    // the floor — a non-chord tone / overlap / wild leap is wrong in EVERY style.
    for (const r of ["chordMembership", "overlap", "spacing", "leap"] as VLRule[]) {
      expect(HARD_FLOOR_RULES).toContain(r);
      expect(STYLE_GATED_RULES).not.toContain(r);
    }
  });

  it("puts exactly the common-practice-specific devices in the style-gated set", () => {
    expect([...STYLE_GATED_RULES].sort()).toEqual(
      ["hidden", "parallels", "tendencyLeadingTone", "tendencySeventh"].sort(),
    );
  });
});

describe("style — the built-in presets", () => {
  it("defaults to common-practice, which relaxes NOTHING (anti-Goodhart)", () => {
    expect(DEFAULT_STYLE).toBe("common-practice");
    expect(resolveStyle().relaxRules).toEqual([]);
    expect(resolveStyle("common-practice").relaxRules).toEqual([]);
  });

  it("lead-sheet relaxes exactly {parallels, tendencySeventh} — the Session-1 pair", () => {
    expect([...STYLE_PROFILES["lead-sheet"].relaxRules].sort()).toEqual(
      ["parallels", "tendencySeventh"].sort(),
    );
  });

  it("film-ambient relaxes the whole style-gated set (planing)", () => {
    expect([...STYLE_PROFILES["film-ambient"].relaxRules].sort()).toEqual(
      [...STYLE_GATED_RULES].sort(),
    );
  });

  it("every preset only relaxes style-gated rules (no preset touches the floor)", () => {
    for (const [name, profile] of Object.entries(STYLE_PROFILES)) {
      expect(() => validateProfile(profile), `${name} relaxes a hard-floor rule`).not.toThrow();
    }
  });
});

describe("style — resolveStyle", () => {
  it("resolves a known preset name to its profile", () => {
    expect(resolveStyle("lead-sheet").name).toBe("lead-sheet");
  });

  it("throws a helpful error on an unknown preset name", () => {
    expect(() => resolveStyle("bebop" as never)).toThrow(/unknown style "bebop"/);
  });

  it("accepts a custom StyleProfile object and validates it", () => {
    const custom: StyleProfile = { name: "my-jazz", note: "test", relaxRules: ["parallels"] };
    expect(resolveStyle(custom)).toBe(custom);
  });

  it("REJECTS a custom profile that tries to relax the hard floor", () => {
    const illegal: StyleProfile = {
      name: "cheater",
      note: "tries to wave through non-chord tones",
      relaxRules: ["chordMembership", "leap"],
    };
    expect(() => resolveStyle(illegal)).toThrow(/cannot relax hard-floor rule/);
    expect(() => validateProfile(illegal)).toThrow(/chordMembership, leap/);
  });
});
