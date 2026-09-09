import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { looksLikeSalamanderDir, resolvePianoSamplesDir, preferredPianoEngineId } from "./sample-paths.js";

describe("sample-paths", () => {
  const prev = process.env.AI_JAM_SAMPLES_DIR;
  afterEach(() => {
    if (prev === undefined) delete process.env.AI_JAM_SAMPLES_DIR;
    else process.env.AI_JAM_SAMPLES_DIR = prev;
  });

  it("looksLikeSalamanderDir is false for an empty folder", () => {
    const dir = join(tmpdir(), `ajs-salamander-empty-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    try {
      expect(looksLikeSalamanderDir(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolvePianoSamplesDir returns the env dir when the SFZ marker is present", () => {
    const dir = join(tmpdir(), `ajs-salamander-ok-${Date.now()}`);
    mkdirSync(join(dir, "sfz_minimum"), { recursive: true });
    writeFileSync(join(dir, "sfz_minimum", "Accurate-SalamanderGrandPiano_flat.Recommended.sfz"), "// marker\n");
    process.env.AI_JAM_SAMPLES_DIR = dir;
    try {
      expect(resolvePianoSamplesDir()).toBe(dir);
      expect(preferredPianoEngineId()).toBe("sample");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preferredPianoEngineId is piano when no pack is installed", () => {
    delete process.env.AI_JAM_SAMPLES_DIR;
    // This checkout does not ship AccurateSalamander.
    expect(preferredPianoEngineId()).toBe("piano");
  });
});
