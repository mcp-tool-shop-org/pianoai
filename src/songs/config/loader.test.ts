import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSongConfig } from "./loader.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "song-config-loader-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("loadSongConfig", () => {
  it("loads a valid config by id", () => {
    writeFileSync(join(tmp, "swing-study.json"), JSON.stringify({
      id: "swing-study",
      title: "Swing Study",
      genre: "jazz",
      difficulty: "beginner",
      key: "G minor",
      tags: ["swing", "ii-V-I"],
      source: "generated",
      musicalLanguage: {
        description: "A short jazz study.",
        structure: "AABA",
        keyMoments: ["Opening ii-V-I"],
        teachingGoals: ["Internalize swing feel"],
        styleTips: ["Lean into the backbeat"],
      },
    }), "utf8");

    const config = loadSongConfig("swing-study", tmp);
    expect(config.id).toBe("swing-study");
  });

  it("rejects traversal in config id", () => {
    expect(() => loadSongConfig("../secrets", tmp)).toThrow("Invalid config ID");
  });

  it("rejects slash-containing config ids", () => {
    expect(() => loadSongConfig("bad/name", tmp)).toThrow("Invalid config ID");
  });
});
