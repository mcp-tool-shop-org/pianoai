// ─── Tests: E-R (Reharmonization Gate) scoring library ───────────────────────
//
// Locks the PRIMARY maker-arc instrument's behavior (design §6.1):
//   - item selection is disjoint from training (excludes the classical genre =
//     the jam-actions source pieces), deterministic, and skips thin sections;
//   - response parsing is tolerant (fences, wrapper objects, field variants);
//   - the non-triviality guard counts canonical chord changes and BITES on a
//     copy-the-original proposal;
//   - the gate = verifyHarmony.verified AND non-trivial — a wrong voicing fails
//     fidelity, a verbatim copy fails the guard, a real reharmonization passes.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import type { SongEntry, Genre } from "../songs/types.js";
import {
  TRAINING_SONG_IDS,
  selectERItems,
  buildERItemFromSong,
  parseReharmonization,
  computeNonTriviality,
  scoreERProposal,
  aggregateERScores,
  buildERBrief,
  type ERItem,
} from "./er-gate.js";

function mkSong(id: string, genre: Genre, numMeasures: number): SongEntry {
  return {
    id, title: id, genre, difficulty: "intermediate", key: "A minor", tempo: 100,
    timeSignature: "4/4", durationSeconds: 30,
    musicalLanguage: { description: "d", structure: "ABA", keyMoments: ["k"], teachingGoals: ["t"], styleTips: ["s"] },
    measures: Array.from({ length: numMeasures }, (_, i) => ({
      number: i + 1, rightHand: "A4:q C5:q E5:q", leftHand: "A2 C3 E3",
    })),
    tags: [],
  };
}

// ─── buildERItemFromSong (the on-demand entry the auto_reharmonize tool uses) ──

describe("buildERItemFromSong", () => {
  it("builds an item from a song section (melody + source harmony + frozen range)", () => {
    const item = buildERItemFromSong(mkSong("jazz-x", "jazz", 8), 1, 4);
    expect(item).not.toBeNull();
    expect(item!.itemId).toBe("jazz-x:m1-4");
    expect(item!.measureRange).toEqual([1, 4]);
    expect(item!.melody).toHaveLength(4);
    expect(item!.sourceChords).toEqual([
      { measure: 1, impliedChord: "Am" },
      { measure: 2, impliedChord: "Am" },
      { measure: 3, impliedChord: "Am" },
      { measure: 4, impliedChord: "Am" },
    ]);
  });

  it("clamps the requested bars to the song and reports the real end measure", () => {
    const item = buildERItemFromSong(mkSong("jazz-y", "jazz", 6), 3, 8);
    expect(item).not.toBeNull();
    expect(item!.measureRange).toEqual([3, 6]); // 8 bars requested, only measures 3-6 exist
  });

  it("returns null when the section carries no melody", () => {
    const song = mkSong("jazz-z", "jazz", 4);
    for (const m of song.measures) m.rightHand = "R";
    expect(buildERItemFromSong(song, 1, 4)).toBeNull();
  });
});

// ─── Item selection ──────────────────────────────────────────────────────────

describe("selectERItems", () => {
  const songs = [
    mkSong("jazz-a", "jazz", 8),
    mkSong("jazz-b", "jazz", 8),
    mkSong("jazz-c", "jazz", 8),
    mkSong("jazz-short", "jazz", 2), // below minMeasures → skipped
    mkSong("pop-a", "pop", 8),
    mkSong("fur-elise", "classical", 8), // TRAINING → excluded
  ];

  it("excludes training songs (the classical genre)", () => {
    const items = selectERItems(songs);
    expect(items.every((i) => !TRAINING_SONG_IDS.has(i.songId))).toBe(true);
    expect(items.some((i) => i.genre === "classical")).toBe(false);
  });

  it("takes itemsPerGenre qualifying songs, skipping thin sections", () => {
    const items = selectERItems(songs, { itemsPerGenre: 2, minMeasures: 4 });
    const jazz = items.filter((i) => i.genre === "jazz").map((i) => i.songId);
    expect(jazz).toEqual(["jazz-a", "jazz-b"]); // jazz-short skipped, jazz-c not reached
    expect(items.filter((i) => i.genre === "pop").map((i) => i.songId)).toEqual(["pop-a"]);
  });

  it("is deterministic and freezes a stable itemId", () => {
    const a = selectERItems(songs);
    const b = selectERItems(songs);
    expect(a.map((i) => i.itemId)).toEqual(b.map((i) => i.itemId));
    expect(a[0].itemId).toMatch(/^jazz-a:m1-8$/);
  });

  it("carries the melody and source harmony for the section", () => {
    const item = selectERItems(songs)[0];
    expect(item.melody).toHaveLength(8);
    expect(item.sourceChords).toHaveLength(8);
    expect(item.key).toBe("A minor");
  });

  it("buildERBrief renders one row per measure with the original chord", () => {
    const item = selectERItems(songs)[0];
    const brief = buildERBrief(item);
    expect(brief.system).toMatch(/REHARMONIZE/);
    expect(brief.user).toMatch(/\| 1 \|/);
    expect(brief.user).toMatch(/Original chord/);
  });
});

// ─── Response parsing ────────────────────────────────────────────────────────

describe("parseReharmonization", () => {
  it("parses a clean JSON array", () => {
    const r = parseReharmonization('[{"measure":1,"intendedChord":"Am7","voicing":"A2 C3 E3 G3"}]');
    expect(r.status).toBe("clean");
    expect(r.measures).toEqual([{ measure: 1, intendedChord: "Am7", voicing: "A2 C3 E3 G3" }]);
  });

  it("recovers an array inside a ```json fence", () => {
    const raw = 'Here you go:\n```json\n[{"measure":1,"intendedChord":"C","voicing":"C2 E2 G2"}]\n```';
    const r = parseReharmonization(raw);
    expect(r.status).toBe("recovered");
    expect(r.measures[0].intendedChord).toBe("C");
  });

  it("recovers an array wrapped in an object", () => {
    const r = parseReharmonization('{"reharmonization":[{"measure":1,"chord":"Am","leftHand":"A2 C3 E3"}]}');
    expect(r.measures[0]).toEqual({ measure: 1, intendedChord: "Am", voicing: "A2 C3 E3" });
    expect(r.status).toBe("recovered");
  });

  it("is unrecoverable on prose with no JSON", () => {
    expect(parseReharmonization("I would use an Am7 chord here.").status).toBe("unrecoverable");
    expect(parseReharmonization("").status).toBe("unrecoverable");
  });
});

// ─── Non-triviality guard ────────────────────────────────────────────────────

function mkItem(sourceChords: string[]): ERItem {
  return {
    itemId: "t:m1-3", songId: "t", genre: "jazz", title: "t", key: "A minor", timeSignature: "4/4",
    measureRange: [1, sourceChords.length],
    melody: sourceChords.map((_, i) => ({ number: i + 1, rightHand: "A4:q C5:q E5:q" })),
    sourceChords: sourceChords.map((c, i) => ({ measure: i + 1, impliedChord: c })),
  };
}

describe("computeNonTriviality", () => {
  it("a verbatim copy of the source is trivial (fraction 0, fails)", () => {
    const item = mkItem(["Am", "Am", "Am"]);
    const r = computeNonTriviality(item, [
      { measure: 1, intendedChord: "Am", voicing: "A2 C3 E3" },
      { measure: 2, intendedChord: "Am", voicing: "A2 C3 E3" },
      { measure: 3, intendedChord: "Am", voicing: "A2 C3 E3" },
    ]);
    expect(r.changedMeasures).toBe(0);
    expect(r.fraction).toBe(0);
    expect(r.passes).toBe(false);
  });

  it("a full reharmonization is non-trivial (fraction 1, passes)", () => {
    const item = mkItem(["Am", "Am", "Am"]);
    const r = computeNonTriviality(item, [
      { measure: 1, intendedChord: "Fmaj7", voicing: "F2 A2 C3 E3" },
      { measure: 2, intendedChord: "Dm7", voicing: "D2 F2 A2 C3" },
      { measure: 3, intendedChord: "E7", voicing: "E2 G#2 B2 D3" },
    ]);
    expect(r.fraction).toBe(1);
    expect(r.passes).toBe(true);
  });

  it("treats enharmonic equivalents as unchanged (D#7 ≡ Eb7)", () => {
    const item = mkItem(["D#7"]);
    const r = computeNonTriviality(item, [{ measure: 1, intendedChord: "Eb7", voicing: "Eb2 G2 Bb2 Db3" }]);
    expect(r.changedMeasures).toBe(0);
  });

  it("meets the threshold exactly at 1/3", () => {
    const item = mkItem(["Am", "Am", "Am"]);
    const r = computeNonTriviality(item, [
      { measure: 1, intendedChord: "Fmaj7", voicing: "F2 A2 C3 E3" },
      { measure: 2, intendedChord: "Am", voicing: "A2 C3 E3" },
      { measure: 3, intendedChord: "Am", voicing: "A2 C3 E3" },
    ]);
    expect(r.fraction).toBeCloseTo(1 / 3, 10);
    expect(r.passes).toBe(true);
  });
});

// ─── The gate ────────────────────────────────────────────────────────────────

describe("scoreERProposal", () => {
  const item = mkItem(["Am", "Am", "Am"]);

  it("a real reharmonization passes (verified AND non-trivial)", () => {
    const parsed = parseReharmonization(
      JSON.stringify([
        { measure: 1, intendedChord: "Am7", voicing: "A2 C3 E3 G3" },
        { measure: 2, intendedChord: "Fmaj7", voicing: "F2 A2 C3 E3" },
        { measure: 3, intendedChord: "Fmaj7", voicing: "F2 A2 C3 E3" },
      ]),
    );
    const s = scoreERProposal(item, parsed);
    expect(s.verified).toBe(true);
    expect(s.nonTriviality.passes).toBe(true);
    expect(s.passes).toBe(true);
  });

  it("a verbatim copy verifies but FAILS the non-triviality guard", () => {
    const parsed = parseReharmonization(
      JSON.stringify([
        { measure: 1, intendedChord: "Am", voicing: "A2 C3 E3" },
        { measure: 2, intendedChord: "Am", voicing: "A2 C3 E3" },
        { measure: 3, intendedChord: "Am", voicing: "A2 C3 E3" },
      ]),
    );
    const s = scoreERProposal(item, parsed);
    expect(s.verified).toBe(true);
    expect(s.nonTriviality.passes).toBe(false);
    expect(s.passes).toBe(false); // the guard closes copy-the-original gaming
  });

  it("a voicing that does not spell the intended chord fails fidelity → cannot pass", () => {
    const parsed = parseReharmonization(
      JSON.stringify([{ measure: 1, intendedChord: "Am7", voicing: "C2 E2 G2" }]), // spells C, not Am7
    );
    const s = scoreERProposal(item, parsed);
    expect(s.chordFidelity.pass).toBe(false);
    expect(s.verified).toBe(false);
    expect(s.passes).toBe(false);
  });
});

// ─── Aggregate ───────────────────────────────────────────────────────────────

describe("aggregateERScores", () => {
  it("separates pass / verified / trivial-but-verified and rolls up by genre", () => {
    const item = mkItem(["Am", "Am", "Am"]);
    const good = scoreERProposal(item, parseReharmonization(JSON.stringify([
      { measure: 1, intendedChord: "Fmaj7", voicing: "F2 A2 C3 E3" },
      { measure: 2, intendedChord: "Dm7", voicing: "D2 F2 A2 C3" },
      { measure: 3, intendedChord: "E7", voicing: "E2 G#2 B2 D3" },
    ])));
    const copy = scoreERProposal(item, parseReharmonization(JSON.stringify([
      { measure: 1, intendedChord: "Am", voicing: "A2 C3 E3" },
      { measure: 2, intendedChord: "Am", voicing: "A2 C3 E3" },
      { measure: 3, intendedChord: "Am", voicing: "A2 C3 E3" },
    ])));
    const agg = aggregateERScores("m", [good, copy]);
    expect(agg.itemCount).toBe(2);
    expect(agg.passCount).toBe(1);
    expect(agg.verifiedCount).toBe(2);
    expect(agg.trivialButVerifiedCount).toBe(1);
    expect(agg.byGenre.find((g) => g.genre === "jazz")?.passes).toBe(1);
  });
});
