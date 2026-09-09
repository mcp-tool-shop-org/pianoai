// ─── Library provenance gate ─────────────────────────────────────────────────
//
// Every song in songs/library/ and songs/quarantine/ carries a `provenance`
// block written by scripts/provenance-audit.ts. This test re-derives the
// mechanical half of that block from the .mid bytes beside it and fails when:
//
//   - the bytes changed (sha256) or say something different (title/credit
//     event snapshot) since the audit — a swapped file needs a new audit;
//   - the block says the file names the song (`matches`) but no title-class
//     event or lyric shares a token with the JSON title — the case folk hit:
//     scarborough-fair.mid was Greensleeves;
//   - a credit-class event (FF 02 copyright, "sequenced by", …) names a party
//     the block's credited_parties does not, or the block credits a party the
//     file never mentions;
//   - a song whose file contradicts its JSON is still in the library, or a
//     song is parked in quarantine without a contradiction on record;
//   - the bootstrap script could re-download a quarantined song.
//
// docs/findings/library-provenance-audit.md is the human-readable audit.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeMidi } from "midi-file";
import { SongConfigSchema, type Provenance, type SongConfig } from "./config/schema.js";
import {
  readProvenanceEvidence,
  significantTokens,
  textNames,
  titleOverlaps,
  type ProvenanceEvidence,
} from "./provenance.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");
const LIBRARY_DIR = join(ROOT, "songs", "library");
const QUARANTINE_DIR = join(ROOT, "songs", "quarantine");
const DOWNLOAD_SCRIPT = join(ROOT, "scripts", "download-library.ts");

/** The library had 120 songs when the audit ran; a song may move to quarantine, never vanish. */
const AUDITED_SONG_COUNT = 120;

interface Song {
  key: string;
  config: SongConfig;
  provenance: Provenance;
  midiPresent: boolean;
  evidence: ProvenanceEvidence | null;
}

function loadSongs(root: string): Song[] {
  if (!existsSync(root)) return [];
  const out: Song[] = [];
  // Only genre directories: songs/library/.npmignore (generated) also lives at this level.
  for (const genre of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    for (const file of readdirSync(join(root, genre)).sort()) {
      if (!file.endsWith(".json")) continue;
      const id = file.slice(0, -5);
      const key = `${genre}/${id}`;
      const config = SongConfigSchema.parse(JSON.parse(readFileSync(join(root, genre, file), "utf8")));
      if (!config.provenance) throw new Error(`${key}: no provenance block — run scripts/provenance-audit.ts`);
      const midiPath = join(root, genre, `${id}.mid`);
      const midiPresent = existsSync(midiPath);
      out.push({
        key,
        config,
        provenance: config.provenance,
        midiPresent,
        evidence: midiPresent ? readProvenanceEvidence(readFileSync(midiPath)) : null,
      });
    }
  }
  return out;
}

const library = loadSongs(LIBRARY_DIR);
const quarantine = loadSongs(QUARANTINE_DIR);
const all = [...library, ...quarantine];
const present = all.filter((s) => s.midiPresent);
const absent = all.filter((s) => !s.midiPresent);
const byKey = new Map(all.map((s) => [s.key, s]));
const SHA256_HEX = /^[0-9a-f]{64}$/;

function midiParties(p: Provenance): string[] {
  return p.credited_parties.filter((c) => c.evidence === "midi-meta").map((c) => c.name);
}

describe("library provenance: every song carries evidence-backed provenance", () => {
  it("no song has been lost: library + quarantine is the audited count", () => {
    expect(library.length + quarantine.length).toBe(AUDITED_SONG_COUNT);
    expect(quarantine.length).toBeGreaterThan(0);
  });

  it("skips the byte comparison for songs whose .mid is not on disk, and says so", () => {
    console.info(
      `provenance byte comparison skipped for ${absent.length} songs: .mid not present on disk`,
    );
    for (const song of absent) {
      expect(song.provenance.midi_sha256, `${song.key} midi_sha256`).toMatch(SHA256_HEX);
    }
  });

  it.each(absent.map((s) => [s.key, s] as const))(
    "%s: midi_sha256 is recorded (byte comparison skipped: .mid not present on disk)",
    (_key, song) => {
      expect(song.provenance.midi_sha256).toMatch(SHA256_HEX);
      expect(song.evidence).toBeNull();
    },
  );

  it.each(present.map((s) => [s.key, s] as const))("%s: the block describes the bytes beside it", (_key, song) => {
    const { provenance: p, evidence: e } = song;
    expect(e, "MIDI present but evidence was not derived").not.toBeNull();
    expect(p.midi_sha256, "sha256 changed since the audit — re-run scripts/provenance-audit.ts").toBe(e!.sha256);
    expect(p.midi_title_events, "title-class events differ from the file").toEqual(e!.titleEvents);
    expect(p.midi_credit_events, "credit-class events differ from the file").toEqual(e!.creditEvents);
    expect(p.midi_lyric_head).toEqual(e!.lyricHead);
  });

  it.each(all.map((s) => [s.key, s] as const))("%s: the verifier is evidence, not a stamp", (_key, song) => {
    const p = song.provenance;
    expect(p.verifier).toMatch(/https?:\/\//);
    expect(p.verifier).not.toMatch(/builder|v1-builder|claude|grok|author/i);
    expect(p.terms_url).toMatch(/^https?:\/\//);
    expect(p.source_url).toMatch(/^https?:\/\//);
    expect(new URL(p.source_url).host).toBe(p.source_site);
    expect(p.terms_quote.length).toBeGreaterThan(20);
  });

  it.each(present.map((s) => [s.key, s] as const))("%s: the title verdict agrees with the file's own words", (_key, song) => {
    const { config, provenance: p, evidence: e } = song;
    const overlaps = titleOverlaps({ title: config.title, aliases: p.title_aliases }, e!);
    switch (p.title_verdict) {
      case "matches":
        expect(overlaps, `verdict 'matches' but nothing in the file names "${config.title}"`).toBe(true);
        break;
      case "no-title-in-file":
        expect(overlaps, "the file does name the song; the verdict should be 'matches'").toBe(false);
        break;
      case "contradicts":
        expect(p.quarantine, "a contradiction must say what the file actually is").toBeDefined();
        expect(p.quarantine?.actual_piece.length).toBeGreaterThan(10);
        break;
    }
  });

  it.each(present.map((s) => [s.key, s] as const))("%s: every credit event names a credited party, and every credited party is in the file", (_key, song) => {
    const { provenance: p, evidence: e } = song;
    const parties = midiParties(p);
    for (const name of parties) {
      expect(textNames(e!.allText, name), `credited party "${name}" does not appear in the file`).toBe(true);
    }
    for (const window of e!.creditWindows) {
      expect(
        parties.some((name) => textNames(window, name)),
        `credit event names a party the provenance block does not: ${window}`,
      ).toBe(true);
    }
  });

  it.each(present.filter((s) => s.provenance.duplicate_of).map((s) => [s.key, s] as const))(
    "%s: duplicate_of points at a byte-identical song",
    (_key, song) => {
      const other = byKey.get(song.provenance.duplicate_of!);
      expect(other, `duplicate_of ${song.provenance.duplicate_of} is not in the library`).toBeDefined();
      if (!other!.midiPresent || !song.midiPresent) {
        expect(other!.provenance.midi_sha256).toBe(song.provenance.midi_sha256);
        return;
      }
      expect(other!.evidence!.sha256).toBe(song.evidence!.sha256);
    },
  );
});

describe("library provenance: contradicting files are out of the library", () => {
  it("no library song's file contradicts its JSON", () => {
    const wrong = library.filter((s) => s.provenance.title_verdict === "contradicts").map((s) => s.key);
    expect(wrong).toEqual([]);
  });

  it("every quarantined song has a contradiction on record", () => {
    const unexplained = quarantine.filter((s) => s.provenance.title_verdict !== "contradicts" || !s.provenance.quarantine);
    expect(unexplained.map((s) => s.key)).toEqual([]);
  });

  it("the bootstrap script cannot re-download a quarantined song", () => {
    const script = readFileSync(DOWNLOAD_SCRIPT, "utf8");
    const block = script.match(/QUARANTINED_IDS = new Set<string>\(\[([\s\S]*?)\]\)/);
    expect(block, "download-library.ts has no QUARANTINED_IDS set").not.toBeNull();
    const listed = new Set([...block![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
    const quarantinedIds = quarantine.map((s) => s.config.id).sort();
    expect([...listed].sort()).toEqual(quarantinedIds);
  });
});

// ─── The rule itself, on synthetic files ────────────────────────────────────

function midiWithMeta(events: Array<{ type: string; text: string }>): Uint8Array {
  const track = [
    ...events.map((e) => ({ deltaTime: 0, meta: true as const, type: e.type, text: e.text })),
    { deltaTime: 0, noteOn: true, channel: 0, noteNumber: 60, velocity: 80, type: "noteOn" as const },
    { deltaTime: 480, channel: 0, noteNumber: 60, velocity: 0, type: "noteOff" as const },
    { deltaTime: 0, meta: true as const, type: "endOfTrack" as const },
  ];
  // midi-file's writer accepts the same event shapes its parser produces.
  return Uint8Array.from(writeMidi({ header: { format: 0, numTracks: 1, ticksPerBeat: 480 }, tracks: [track as never] }));
}

describe("provenance rule on synthetic files", () => {
  it("fails a 'matches' claim when the file's title names another piece (the scarborough-fair case)", () => {
    const e = readProvenanceEvidence(
      midiWithMeta([
        { type: "trackName", text: "Greensleeves" },
        { type: "text", text: "Traditional" },
        { type: "copyrightNotice", text: "Jim Paterson" },
      ]),
    );
    expect(titleOverlaps({ title: "Scarborough Fair" }, e)).toBe(false);
    expect(titleOverlaps({ title: "Greensleeves" }, e)).toBe(true);
  });

  it("flags a copyright event whose party the block does not credit", () => {
    const e = readProvenanceEvidence(
      midiWithMeta([
        { type: "trackName", text: "Für Elise" },
        { type: "copyrightNotice", text: "Copyright © 2004 by Bernd Krueger" },
      ]),
    );
    expect(e.creditEvents).toEqual(["Copyright © 2004 by Bernd Krueger"]);
    expect(e.creditWindows.some((w) => textNames(w, "Bernd Krueger"))).toBe(true);
    expect(e.creditWindows.some((w) => textNames(w, "Robert Finley"))).toBe(false);
  });

  it("finds a party named in a neighbouring event ('Sequenced by' / 'Rick Ho')", () => {
    const e = readProvenanceEvidence(
      midiWithMeta([
        { type: "trackName", text: "Harp" },
        { type: "trackName", text: "Sequenced by" },
        { type: "trackName", text: "Rick Ho" },
      ]),
    );
    expect(e.creditEvents).toEqual(["Sequenced by"]);
    expect(e.creditWindows[0]).toContain("Rick Ho");
    expect(e.titleEvents).toEqual(["Harp", "Rick Ho"]);
  });

  it("identifies a song by its lyric head when it has no title event", () => {
    const e = readProvenanceEvidence(
      midiWithMeta([
        { type: "trackName", text: "A.PIANO 1" },
        { type: "lyrics", text: "They call it stormy Monday, " },
        { type: "lyrics", text: "but Tuesday's just as bad" },
      ]),
    );
    expect(e.lyricHead).toBe("They call it stormy Monday, but Tuesday's just as bad");
    expect(titleOverlaps({ title: "Stormy Monday" }, e)).toBe(true);
    expect(titleOverlaps({ title: "Misty" }, e)).toBe(false);
  });

  it("tokenises diacritics, digit codes and plurals the way the audit relies on", () => {
    expect(significantTokens("Für Elise")).toEqual(["fur", "elise"]);
    expect(significantTokens("7861DOCK")).toEqual(["7861", "dock"]);
    expect(significantTokens("Crossroads Blues")).toEqual(["crossroad"]);
    expect(titleOverlaps({ title: "Superstition" }, { titleEvents: ["SUPERSTI"] })).toBe(true);
    // The composer alone never identifies the piece; the audit records the file's own spelling as an alias instead.
    expect(titleOverlaps({ title: "Traumerei (Dreaming)" }, { titleEvents: ["Traumeri", "Schumann"] })).toBe(false);
    expect(titleOverlaps({ title: "Traumerei (Dreaming)", aliases: ["Traumeri"] }, { titleEvents: ["Traumeri", "Schumann"] })).toBe(true);
    expect(titleOverlaps({ title: "Moonlight Sonata" }, { titleEvents: ["Für Elise", "Ludwig van Beethoven", "Beethoven Für Elise"] })).toBe(false);
    expect(titleOverlaps({ title: "The Thrill Is Gone" }, { titleEvents: ["STRINGS", "MELODY"] })).toBe(false);
  });
});
