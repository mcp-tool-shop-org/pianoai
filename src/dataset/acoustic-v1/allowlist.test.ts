import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  loadPublishableSongs,
  allowlistRows,
  allowlistById,
  EXPECTED_PUBLISHABLE_IDS,
  FORBIDDEN_IDS,
  evidenceGaps,
} from "./library.js";
import {
  copyrightNamesForeignParty,
  titleNamesDifferentPiece,
} from "./allowlist.js";
import { readMidiTextMeta } from "../../songs/midi/meta.js";
import { scanLibrary } from "../../songs/library.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LIBRARY_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "songs", "library");

describe("derived publishable allowlist (A1)", () => {
  it("equals the eleven locked ids, each with a closed-set licence and non-contradicting title", () => {
    const rows = allowlistRows();
    expect(rows.map((r) => r.id)).toEqual([...EXPECTED_PUBLISHABLE_IDS]);
    expect(rows).toHaveLength(11);
    for (const row of rows) {
      expect(evidenceGaps(row), row.id).toEqual([]);
    }
    for (const id of FORBIDDEN_IDS) {
      expect(rows.some((r) => r.id === id), id).toBe(false);
    }
  });

  it("loadPublishableSongs returns exactly those eleven", () => {
    const songs = loadPublishableSongs();
    expect(songs.map((s) => s.id)).toEqual([...EXPECTED_PUBLISHABLE_IDS]);
  });
});

describe("file is the song it says it is (V3)", () => {
  it("every allowlisted MIDI's title events match the JSON title and copyright parties are allowlisted", () => {
    const songs = loadPublishableSongs();
    const byId = new Map(scanLibrary(LIBRARY_DIR).map((e) => [e.config.id, e]));
    const report: string[] = [];
    for (const song of songs) {
      const row = allowlistById().get(song.id)!;
      const entry = byId.get(song.id);
      expect(entry, song.id).toBeDefined();
      const meta = readMidiTextMeta(new Uint8Array(readFileSync(entry!.midiPath)));
      const titleEvents = [...meta.trackNames, ...meta.texts];
      for (const text of titleEvents) {
        const bad = titleNamesDifferentPiece(song.title, text, song.composer ?? "");
        expect(bad, `${song.id} title event ${JSON.stringify(text)}`).toBe(false);
      }
      for (const c of meta.copyrights) {
        const bad = copyrightNamesForeignParty(c, row.arranger);
        expect(bad, `${song.id} copyright ${JSON.stringify(c)}`).toBe(false);
      }
      report.push(
        `${song.id}: titles=${titleEvents.length} copyrights=${meta.copyrights.length} ok`,
      );
    }
    expect(report).toHaveLength(11);
  });

  it("would reject the two wrong-file cases the audit found", () => {
    expect(titleNamesDifferentPiece("Scarborough Fair", "Greensleeves / Traditional / Jim Paterson", "Traditional English")).toBe(true);
    expect(titleNamesDifferentPiece("The Water Is Wide", "THE GLENDY BURK / Stephen Foster", "Traditional Scottish")).toBe(true);
  });
});
