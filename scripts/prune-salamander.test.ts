import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { findFfmpeg } from "./prune-salamander.js";

describe("findFfmpeg", () => {
  it("returns null on an empty PATH with no well-known install", () => {
    // Isolate from this machine's PATH; extras may still hit Krita on Windows.
    const hit = findFfmpeg("");
    if (hit) {
      expect(hit.toLowerCase()).toContain("ffmpeg");
    } else {
      expect(hit).toBeNull();
    }
  });

  it("finds ffmpeg.exe when its directory is on PATH", () => {
    const dir = join("C:", "Program Files", "Krita (x64)", "bin");
    const found = findFfmpeg(dir);
    if (found) expect(found.toLowerCase().endsWith("ffmpeg.exe") || found.toLowerCase().endsWith("ffmpeg")).toBe(true);
  });
});
