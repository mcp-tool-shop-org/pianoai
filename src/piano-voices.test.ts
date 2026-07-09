// ─── piano-voices.test.ts ──────────────────────────────────────────────────
//
// Tests for user-tuning persistence in piano-voices.ts (B-B1-005). Before
// this file, loadUserTuning/saveUserTuning/resetUserTuning had ZERO
// coverage — this is why the ESM-import bug that shipped in this same
// persistence-adjacent area (F-43b426ba, mcp-server.ts's session-state
// persist path) went undetected for as long as it did.
//
// Two contracts pinned here:
//   1. loadUserTuning on a corrupt/unparseable tuning file falls back to
//      factory defaults (empty overrides) — verified through the FULL
//      invariant (loadUserTuning() returns {} AND getMergedVoice() equals
//      the untouched base config), not just the loader's return value in
//      isolation.
//   2. saveUserTuning's write path is atomic: an interrupted write must
//      never leave the live tuning file in a partially-written/corrupted
//      state. Simulated via a `vi.mock("node:fs", ...)` passthrough wrapper
//      that, for exactly one call, performs a real but TRUNCATED write to
//      whatever path the implementation targets and then throws — a
//      faithful simulation of a process crash mid-write. A non-atomic
//      "writeFileSync straight to the final path" implementation leaves the
//      truncated bytes on the LIVE file; an atomic (write-temp, then
//      rename) implementation leaves them on a temp path that never
//      replaces the live file.
//
// HOME/USERPROFILE redirect: piano-voices.ts resolves its tuning directory
// via node:os's homedir(), which reads process.env.USERPROFILE (win32) /
// process.env.HOME (POSIX) at CALL TIME — confirmed empirically on this rig
// (Node v22, win32) before relying on it here. Every test redirects both
// env vars to a fresh mkdtempSync() directory and restores the originals
// afterward, so nothing here ever touches the real developer home dir.
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
// vi.spyOn(fs, "writeFileSync") does NOT work in this repo's vitest/ESM
// setup — verified directly: it throws "Cannot spy on export
// 'writeFileSync'. Module namespace is not configurable in ESM." vi.mock's
// factory-replacement approach is the supported alternative for Node
// built-ins and DOES correctly intercept calls made via a named import in
// another module (piano-voices.ts's `import { writeFileSync } from
// "node:fs"`) — also verified directly in a standalone probe before writing
// this file. Every other fs function passes through to the real
// implementation unchanged, so this mock is inert for every test that never
// sets `mockState.interceptOnce`.
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
import { loadUserTuning, saveUserTuning, resetUserTuning, getMergedVoice, getVoice } from "./piano-voices.js";

describe("piano-voices.ts — user tuning persistence (B-B1-005)", () => {
  let tmpHome: string;
  const ORIGINAL_HOME = process.env.HOME;
  const ORIGINAL_USERPROFILE = process.env.USERPROFILE;

  beforeEach(() => {
    tmpHome = mkdtempSync(join(tmpdir(), "ajs-piano-voices-test-home-"));
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
    return join(tmpHome, ".ai-jam-sessions", "voices");
  }

  function tuningFilePath(voiceId: string): string {
    return join(tuningDirPath(), `${voiceId}.json`);
  }

  describe("loadUserTuning — corrupt file falls back to factory", () => {
    it("returns {} when no tuning file exists on disk", () => {
      expect(loadUserTuning("grand")).toEqual({});
    });

    it("returns {} (and getMergedVoice equals the untouched base config) when the file is unparseable JSON", () => {
      mkdirSync(tuningDirPath(), { recursive: true });
      writeFileSync(tuningFilePath("grand"), "{ this is not valid json !!! ][", "utf-8");

      // Loader-level invariant.
      expect(loadUserTuning("grand")).toEqual({});

      // Full invariant: the downstream merged config a corrupt file would
      // otherwise poison is byte-for-byte the untouched factory default —
      // not just "the loader returns {} in isolation."
      const base = getVoice("grand");
      expect(base).toBeDefined();
      expect(getMergedVoice("grand")).toEqual(base);
    });

    it("returns {} when the tuning file is truncated mid-object (a realistic interrupted-write artifact)", () => {
      mkdirSync(tuningDirPath(), { recursive: true });
      // Simulates exactly the kind of partial file a non-atomic writeFileSync
      // could leave behind pre-fix.
      writeFileSync(tuningFilePath("grand"), '{"brightness": 0.2, "decay"', "utf-8");

      expect(loadUserTuning("grand")).toEqual({});
      expect(getMergedVoice("grand")).toEqual(getVoice("grand"));
    });

    it("returns {} when the tuning file is empty (zero bytes)", () => {
      mkdirSync(tuningDirPath(), { recursive: true });
      writeFileSync(tuningFilePath("grand"), "", "utf-8");

      expect(loadUserTuning("grand")).toEqual({});
      expect(getMergedVoice("grand")).toEqual(getVoice("grand"));
    });
  });

  describe("saveUserTuning / loadUserTuning — round-trip", () => {
    it("round-trips a saved override through loadUserTuning", () => {
      saveUserTuning("grand", { brightness: 0.22 });
      expect(loadUserTuning("grand")).toEqual({ brightness: 0.22 });
    });

    it("merges with existing overrides rather than clobbering them", () => {
      saveUserTuning("grand", { brightness: 0.22 });
      saveUserTuning("grand", { decay: 5 });
      expect(loadUserTuning("grand")).toEqual({ brightness: 0.22, decay: 5 });
    });

    it("a later save of the same key overrides the earlier value", () => {
      saveUserTuning("grand", { brightness: 0.22 });
      saveUserTuning("grand", { brightness: 0.4 });
      expect(loadUserTuning("grand")).toEqual({ brightness: 0.4 });
    });

    it("applies the saved override through getMergedVoice (clamped into TUNING_PARAMS range, base config untouched)", () => {
      const base = getVoice("grand")!;
      saveUserTuning("grand", { brightness: 0.22 });
      const merged = getMergedVoice("grand")!;
      expect(merged.brightnessBase).toBe(0.22);
      // structuredClone contract (F-9611954f, already-fixed pin): the base
      // preset object itself must never be mutated by applying a tuning.
      expect(getVoice("grand")!.brightnessBase).toBe(base.brightnessBase);
    });
  });

  describe("saveUserTuning — atomic write (D-B1-005 write-temp-rename contract)", () => {
    it("leaves no stray temp/partial files in the tuning directory after a successful save", () => {
      saveUserTuning("grand", { brightness: 0.22 });
      const entries = readdirSync(tuningDirPath());
      expect(entries).toEqual(["grand.json"]);
    });

    // Split into two tests deliberately (rather than one test asserting
    // both things) so a failure is immediately diagnosable: the core
    // atomicity guarantee (live file never corrupted) vs. temp-file cleanup
    // on the failure path (hygiene — a leftover .tmp doesn't corrupt any
    // future load, since loadUserTuning only ever reads <voiceId>.json, but
    // unbounded .tmp accumulation across repeated crashes is still a real
    // gap a correct write-temp-rename helper should close with a
    // try/catch-unlink around the write+rename sequence).
    it(
      "CORE: an interrupted write does not corrupt the previously-saved live file — a mid-write crash " +
        "lands its partial bytes on a path other than tuningPath(voiceId)",
      () => {
        // Seed a known-good, already-saved file via a REAL (non-intercepted)
        // save.
        saveUserTuning("grand", { brightness: 0.11 });
        const finalPath = tuningFilePath("grand");
        const before = readFileSync(finalPath, "utf-8");
        expect(JSON.parse(before)).toEqual({ brightness: 0.11 });

        // Arm the mock: the NEXT writeFileSync call performs a real but
        // truncated write, then throws — simulating a process crash
        // partway through the next save attempt.
        mockState.interceptOnce = true;
        expect(() => saveUserTuning("grand", { brightness: 0.99 })).toThrow("simulated crash mid-write");
        expect(mockState.interceptOnce).toBe(false); // the mock consumed its one-shot

        // The live file must be EXACTLY what it was before the crashed save
        // — not the truncated garbage, not a half-written object. A
        // non-atomic "writeFileSync straight to tuningPath(voiceId)"
        // implementation fails this: the truncated bytes land directly on
        // finalPath.
        const after = readFileSync(finalPath, "utf-8");
        expect(after).toBe(before);
        expect(JSON.parse(after)).toEqual({ brightness: 0.11 });
      },
    );

    it("HYGIENE: an interrupted write does not leave a stray temp file behind in the tuning directory", () => {
      saveUserTuning("grand", { brightness: 0.11 });
      mockState.interceptOnce = true;
      expect(() => saveUserTuning("grand", { brightness: 0.99 })).toThrow("simulated crash mid-write");

      const entries = readdirSync(tuningDirPath());
      expect(entries).toEqual(["grand.json"]);
    });

    it("a subsequent (non-interrupted) save after a simulated crash succeeds normally", () => {
      saveUserTuning("grand", { brightness: 0.11 });
      mockState.interceptOnce = true;
      expect(() => saveUserTuning("grand", { brightness: 0.99 })).toThrow();

      // The mock only intercepts ONE call — this save should go through
      // cleanly.
      saveUserTuning("grand", { brightness: 0.33 });
      expect(loadUserTuning("grand")).toEqual({ brightness: 0.33 });
    });
  });

  describe("resetUserTuning", () => {
    it("removes the tuning file so a subsequent load falls back to factory", () => {
      saveUserTuning("grand", { brightness: 0.22 });
      expect(existsSync(tuningFilePath("grand"))).toBe(true);

      resetUserTuning("grand");

      expect(existsSync(tuningFilePath("grand"))).toBe(false);
      expect(loadUserTuning("grand")).toEqual({});
      expect(getMergedVoice("grand")).toEqual(getVoice("grand"));
    });

    it("is a safe no-op when no tuning file exists", () => {
      expect(() => resetUserTuning("grand")).not.toThrow();
    });
  });
});
