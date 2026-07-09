// ─── guitar-voices.test.ts ─────────────────────────────────────────────────
//
// Tests for user-tuning persistence in guitar-voices.ts (B-B1-005). Mirrors
// src/piano-voices.test.ts — see that file's header comment for the full
// rationale (loadGuitarUserTuning/saveGuitarUserTuning/resetGuitarUserTuning
// had ZERO coverage before this file; the write path used a plain
// `writeFileSync` straight to the live tuning file with no atomicity
// guarantee).
//
// HOME/USERPROFILE redirect: guitar-voices.ts resolves its tuning directory
// via node:os's homedir(), which reads process.env.USERPROFILE (win32) /
// process.env.HOME (POSIX) at CALL TIME — confirmed empirically on this rig
// (Node v22, win32). Every test redirects both env vars to a fresh
// mkdtempSync() directory and restores the originals afterward.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ─── node:fs mock (write-interception scaffold for the atomicity test) ─────
//
// See src/piano-voices.test.ts's header comment for why vi.mock (rather
// than vi.spyOn, which fails with "Cannot spy on export 'writeFileSync'.
// Module namespace is not configurable in ESM" in this repo's vitest/ESM
// setup) is used here, and why it's safe to leave mocked for the whole
// file: every fs function except writeFileSync passes through to the real
// implementation unchanged, and writeFileSync itself only diverges from a
// normal passthrough when a test explicitly arms `mockState.interceptOnce`.
const mockState = { interceptOnce: false };

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    writeFileSync: (...args: Parameters<typeof actual.writeFileSync>) => {
      if (mockState.interceptOnce) {
        mockState.interceptOnce = false;
        const [path, data, options] = args as [string, string, unknown];
        // Perform a REAL but truncated write — simulates a process crash
        // partway through writing, not just a call that never touched disk.
        const truncated = String(data).slice(0, 8);
        actual.writeFileSync(path, truncated, options as Parameters<typeof actual.writeFileSync>[2]);
        throw new Error("simulated crash mid-write");
      }
      return actual.writeFileSync(...args);
    },
  };
});

// Imported after vi.mock (vi.mock calls are hoisted by vitest regardless of
// import order — written this way for readability).
import {
  loadGuitarUserTuning,
  saveGuitarUserTuning,
  resetGuitarUserTuning,
  getMergedGuitarVoice,
  getGuitarVoice,
} from "./guitar-voices.js";

describe("guitar-voices.ts — user tuning persistence (B-B1-005)", () => {
  let tmpHome: string;
  const ORIGINAL_HOME = process.env.HOME;
  const ORIGINAL_USERPROFILE = process.env.USERPROFILE;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "ajs-guitar-voices-test-home-"));
    process.env.HOME = tmpHome;
    process.env.USERPROFILE = tmpHome;
  });

  afterEach(() => {
    mockState.interceptOnce = false;
    if (ORIGINAL_HOME === undefined) delete process.env.HOME;
    else process.env.HOME = ORIGINAL_HOME;
    if (ORIGINAL_USERPROFILE === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = ORIGINAL_USERPROFILE;
    rmSync(tmpHome, { recursive: true, force: true });
  });

  function tuningDirPath(): string {
    return join(tmpHome, ".ai-jam-sessions", "guitars");
  }

  function tuningFilePath(voiceId: string): string {
    return join(tuningDirPath(), `${voiceId}.json`);
  }

  describe("loadGuitarUserTuning — corrupt file falls back to factory", () => {
    it("returns {} when no tuning file exists on disk", () => {
      expect(loadGuitarUserTuning("steel-dreadnought")).toEqual({});
    });

    it("returns {} (and getMergedGuitarVoice equals the untouched base config) when the file is unparseable JSON", () => {
      mkdirSync(tuningDirPath(), { recursive: true });
      writeFileSync(tuningFilePath("steel-dreadnought"), "{ this is not valid json !!! ][", "utf-8");

      expect(loadGuitarUserTuning("steel-dreadnought")).toEqual({});

      const base = getGuitarVoice("steel-dreadnought");
      expect(base).toBeDefined();
      expect(getMergedGuitarVoice("steel-dreadnought")).toEqual(base);
    });

    it("returns {} when the tuning file is truncated mid-object (a realistic interrupted-write artifact)", () => {
      mkdirSync(tuningDirPath(), { recursive: true });
      writeFileSync(tuningFilePath("steel-dreadnought"), '{"brightness": 0.2, "decay"', "utf-8");

      expect(loadGuitarUserTuning("steel-dreadnought")).toEqual({});
      expect(getMergedGuitarVoice("steel-dreadnought")).toEqual(getGuitarVoice("steel-dreadnought"));
    });

    it("returns {} when the tuning file is empty (zero bytes)", () => {
      mkdirSync(tuningDirPath(), { recursive: true });
      writeFileSync(tuningFilePath("steel-dreadnought"), "", "utf-8");

      expect(loadGuitarUserTuning("steel-dreadnought")).toEqual({});
      expect(getMergedGuitarVoice("steel-dreadnought")).toEqual(getGuitarVoice("steel-dreadnought"));
    });
  });

  describe("saveGuitarUserTuning / loadGuitarUserTuning — round-trip", () => {
    it("round-trips a saved override through loadGuitarUserTuning", () => {
      saveGuitarUserTuning("steel-dreadnought", { brightness: 0.22 });
      expect(loadGuitarUserTuning("steel-dreadnought")).toEqual({ brightness: 0.22 });
    });

    it("merges with existing overrides rather than clobbering them", () => {
      saveGuitarUserTuning("steel-dreadnought", { brightness: 0.22 });
      saveGuitarUserTuning("steel-dreadnought", { decay: 3 });
      expect(loadGuitarUserTuning("steel-dreadnought")).toEqual({ brightness: 0.22, decay: 3 });
    });

    it("a later save of the same key overrides the earlier value", () => {
      saveGuitarUserTuning("steel-dreadnought", { brightness: 0.22 });
      saveGuitarUserTuning("steel-dreadnought", { brightness: 0.4 });
      expect(loadGuitarUserTuning("steel-dreadnought")).toEqual({ brightness: 0.4 });
    });

    it("applies the saved override through getMergedGuitarVoice (clamped into range, base config untouched)", () => {
      const base = getGuitarVoice("steel-dreadnought")!;
      saveGuitarUserTuning("steel-dreadnought", { brightness: 0.22 });
      const merged = getMergedGuitarVoice("steel-dreadnought")!;
      expect(merged.brightnessBase).toBe(0.22);
      expect(getGuitarVoice("steel-dreadnought")!.brightnessBase).toBe(base.brightnessBase);
    });
  });

  describe("saveGuitarUserTuning — atomic write (D-B1-005 write-temp-rename contract)", () => {
    it("leaves no stray temp/partial files in the tuning directory after a successful save", () => {
      saveGuitarUserTuning("steel-dreadnought", { brightness: 0.22 });
      const entries = readdirSync(tuningDirPath());
      expect(entries).toEqual(["steel-dreadnought.json"]);
    });

    // Split into two tests deliberately (rather than one test asserting
    // both things) so a failure is immediately diagnosable — see
    // src/piano-voices.test.ts's identical split for the full rationale.
    it(
      "CORE: an interrupted write does not corrupt the previously-saved live file — a mid-write crash " +
        "lands its partial bytes on a path other than the live tuning file",
      () => {
        saveGuitarUserTuning("steel-dreadnought", { brightness: 0.11 });
        const finalPath = tuningFilePath("steel-dreadnought");
        const before = readFileSync(finalPath, "utf-8");
        expect(JSON.parse(before)).toEqual({ brightness: 0.11 });

        mockState.interceptOnce = true;
        expect(() => saveGuitarUserTuning("steel-dreadnought", { brightness: 0.99 })).toThrow(
          "simulated crash mid-write",
        );
        expect(mockState.interceptOnce).toBe(false);

        const after = readFileSync(finalPath, "utf-8");
        expect(after).toBe(before);
        expect(JSON.parse(after)).toEqual({ brightness: 0.11 });
      },
    );

    it("HYGIENE: an interrupted write does not leave a stray temp file behind in the tuning directory", () => {
      saveGuitarUserTuning("steel-dreadnought", { brightness: 0.11 });
      mockState.interceptOnce = true;
      expect(() => saveGuitarUserTuning("steel-dreadnought", { brightness: 0.99 })).toThrow(
        "simulated crash mid-write",
      );

      const entries = readdirSync(tuningDirPath());
      expect(entries).toEqual(["steel-dreadnought.json"]);
    });

    it("a subsequent (non-interrupted) save after a simulated crash succeeds normally", () => {
      saveGuitarUserTuning("steel-dreadnought", { brightness: 0.11 });
      mockState.interceptOnce = true;
      expect(() => saveGuitarUserTuning("steel-dreadnought", { brightness: 0.99 })).toThrow();

      saveGuitarUserTuning("steel-dreadnought", { brightness: 0.33 });
      expect(loadGuitarUserTuning("steel-dreadnought")).toEqual({ brightness: 0.33 });
    });
  });

  describe("resetGuitarUserTuning", () => {
    it("removes the tuning file so a subsequent load falls back to factory", () => {
      saveGuitarUserTuning("steel-dreadnought", { brightness: 0.22 });
      expect(existsSync(tuningFilePath("steel-dreadnought"))).toBe(true);

      resetGuitarUserTuning("steel-dreadnought");

      expect(existsSync(tuningFilePath("steel-dreadnought"))).toBe(false);
      expect(loadGuitarUserTuning("steel-dreadnought")).toEqual({});
      expect(getMergedGuitarVoice("steel-dreadnought")).toEqual(getGuitarVoice("steel-dreadnought"));
    });

    it("is a safe no-op when no tuning file exists", () => {
      expect(() => resetGuitarUserTuning("steel-dreadnought")).not.toThrow();
    });
  });
});
