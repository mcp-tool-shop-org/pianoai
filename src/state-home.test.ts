import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  stateHome,
  journalDir,
  userSongsDir,
  serverStatePath,
  guitarVoicesDir,
  fetchedLibraryDir,
} from "./state-home.js";
import { appendJournalEntry, getJournalDir } from "./journal.js";
import { saveSong } from "./songs/loader.js";
import type { SongEntry } from "./songs/types.js";

describe("stateHome", () => {
  const ORIGINAL_HOME = process.env.HOME;
  const ORIGINAL_USERPROFILE = process.env.USERPROFILE;
  const ORIGINAL_AI_JAM_HOME = process.env.AI_JAM_HOME;
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "ajs-state-home-"));
    delete process.env.AI_JAM_HOME;
  });

  afterEach(() => {
    if (ORIGINAL_HOME === undefined) delete process.env.HOME;
    else process.env.HOME = ORIGINAL_HOME;
    if (ORIGINAL_USERPROFILE === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = ORIGINAL_USERPROFILE;
    if (ORIGINAL_AI_JAM_HOME === undefined) delete process.env.AI_JAM_HOME;
    else process.env.AI_JAM_HOME = ORIGINAL_AI_JAM_HOME;
    rmSync(tmp, { recursive: true, force: true });
  });

  it("defaults to ~/.ai-jam-sessions when AI_JAM_HOME is unset", () => {
    process.env.HOME = tmp;
    process.env.USERPROFILE = tmp;
    expect(stateHome()).toBe(join(tmp, ".ai-jam-sessions"));
    expect(getJournalDir()).toBe(join(tmp, ".ai-jam-sessions", "journal"));
  });

  it("rejects a relative AI_JAM_HOME", () => {
    process.env.AI_JAM_HOME = "not-absolute";
    expect(() => stateHome()).toThrow(/absolute path/);
  });

  it("puts journal, server state and user songs under AI_JAM_HOME", () => {
    const home = join(tmp, "volume");
    process.env.AI_JAM_HOME = home;

    expect(stateHome()).toBe(home);
    expect(journalDir()).toBe(join(home, "journal"));
    expect(userSongsDir()).toBe(join(home, "songs"));
    expect(serverStatePath()).toBe(join(home, "server-state.json"));
    expect(guitarVoicesDir()).toBe(join(home, "guitars"));
    expect(fetchedLibraryDir()).toBe(join(home, "songs", "library"));

    const written = appendJournalEntry("state-home journal proof\n");
    expect(written.startsWith(join(home, "journal"))).toBe(true);
    expect(readFileSync(written, "utf8")).toContain("state-home journal proof");

    mkdirSync(join(home), { recursive: true });
    writeFileSync(serverStatePath(), JSON.stringify({ schemaVersion: 1 }), "utf8");
    expect(existsSync(join(home, "server-state.json"))).toBe(true);

    const song: SongEntry = {
      id: "state-home-song",
      title: "State Home Song",
      genre: "classical",
      difficulty: "beginner",
      key: "C major",
      tempo: 120,
      timeSignature: "4/4",
      durationSeconds: 1,
      musicalLanguage: {
        description: "A fixture.",
        structure: "A",
        keyMoments: ["Start"],
        teachingGoals: ["Paths"],
        styleTips: ["None"],
      },
      measures: [{ number: 1, rightHand: "C4:w", leftHand: "C3:w" }],
      tags: ["test"],
    };
    const saved = saveSong(song, userSongsDir());
    expect(saved).toBe(join(home, "songs", "state-home-song.json"));
    expect(existsSync(saved)).toBe(true);
  });
});
