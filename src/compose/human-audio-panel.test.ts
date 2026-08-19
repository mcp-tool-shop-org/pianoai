import { describe, it, expect } from "vitest";
import {
  buildTrialList,
  buildClipNotes,
  detectSystems,
  loudnessOffsetsFromRms,
  gainsMatchWithinTolerance,
  measureRms,
  pairBudgetLabel,
  rankingStatus,
  listenerCountLabel,
  screenListener,
  scoreHumanAudio,
  pairwiseVoteToBws,
  isFloorTrialPair,
  pairKey,
  probeLocalModel,
  serializePanelRuns,
  deserializePanelRuns,
  emptyRunRecord,
  ENGINE_UNAVAILABLE_MESSAGE,
  VOTE_BUDGET_PROVISIONAL,
  FLOOR_INJECT_MIN,
  FLOOR_INJECT_RATE,
  type HumanAudioSystemId,
  type PairwiseVoteInput,
} from "./human-audio-panel.js";
import { DEFAULT_PANEL_SONGS } from "./human-audio-catalog.js";
import { rootPositionRealization, nearestToneRealization } from "./realize.js";
import { refineRealization } from "./refine.js";

const K3: HumanAudioSystemId[] = ["floor", "nearest", "refined"];
const K4: HumanAudioSystemId[] = ["floor", "nearest", "refined", "engine"];
const SONGS = DEFAULT_PANEL_SONGS.map((s) => s.id);

describe("detectSystems", () => {
  it("always includes the three deterministic systems", () => {
    expect(detectSystems(false)).toEqual(K3);
  });
  it("adds engine only when the local model is reachable", () => {
    expect(detectSystems(true)).toEqual(K4);
  });
  it("unavailable copy is the honest sentence", () => {
    expect(ENGINE_UNAVAILABLE_MESSAGE).toBe("engine system unavailable — local model not reachable");
  });
});

describe("buildTrialList — coverage, floor injection, side blinding", () => {
  it("covers every song × system-pair", () => {
    const trials = buildTrialList({ songIds: SONGS, systems: K3, seed: 7 });
    const seen = new Set<string>();
    for (const t of trials) seen.add(`${t.songId}:${pairKey(t.sideA, t.sideB)}`);
    for (const song of SONGS) {
      expect(seen.has(`${song}:floor|nearest`)).toBe(true);
      expect(seen.has(`${song}:floor|refined`)).toBe(true);
      expect(seen.has(`${song}:nearest|refined`)).toBe(true);
    }
  });

  it("injects floor trials to ≥10% and at least 3", () => {
    const oneSong = buildTrialList({ songIds: ["satie-gymnopedie-no1"], systems: K3, seed: 1 });
    const floorN = oneSong.filter((t) => t.floorTrial).length;
    expect(floorN).toBeGreaterThanOrEqual(FLOOR_INJECT_MIN);
    expect(floorN / oneSong.length).toBeGreaterThanOrEqual(FLOOR_INJECT_RATE);
    expect(oneSong.every((t) => t.floorTrial === isFloorTrialPair(t.sideA, t.sideB))).toBe(true);
  });

  it("blinds A/B sides and is seed-stable", () => {
    const a = buildTrialList({ songIds: SONGS, systems: K3, seed: 42 });
    const b = buildTrialList({ songIds: SONGS, systems: K3, seed: 42 });
    expect(a).toEqual(b);
    const c = buildTrialList({ songIds: SONGS, systems: K3, seed: 43 });
    expect(c.map((t) => t.id + t.sideA + t.sideB).join()).not.toBe(a.map((t) => t.id + t.sideA + t.sideB).join());
    const flipped = a.some((t) => t.sideA !== "floor" && t.sideA !== "nearest" && t.sideA !== "refined" ? false : true);
    expect(flipped).toBe(true);
    // at least one trial has floor on B (side assignment is not identity)
    expect(a.some((t) => t.sideB === "floor")).toBe(true);
  });

  it("marks floor-vs-valid as floor trials and hides nothing in the data (UI must not flag them)", () => {
    const trials = buildTrialList({ songIds: ["imagine"], systems: K4, seed: 9 });
    const floor = trials.filter((t) => t.floorTrial);
    expect(floor.length).toBeGreaterThan(0);
    expect(floor.every((t) => isFloorTrialPair(t.sideA, t.sideB))).toBe(true);
    expect(trials.filter((t) => !t.floorTrial).every((t) => !isFloorTrialPair(t.sideA, t.sideB))).toBe(true);
  });
});

describe("seed replay — same seed + same votes → identical scoring", () => {
  function votesFor(seed: number): PairwiseVoteInput[] {
    const trials = buildTrialList({ songIds: SONGS, systems: K3, seed });
    return trials.map((t, i) => ({
      sideA: t.sideA,
      sideB: t.sideB,
      picked: (i % 2 === 0 ? "A" : "B") as "A" | "B",
      family: "listener-1",
    }));
  }

  it("replays byte-identically", () => {
    const seed = 1787;
    const votes = votesFor(seed);
    const floorTrials = votes.filter((v) => isFloorTrialPair(v.sideA, v.sideB));
    const mis = floorTrials.filter((v) => {
      const picked = v.picked === "A" ? v.sideA : v.sideB;
      return picked === "floor";
    }).length;
    const a = scoreHumanAudio({
      systems: K3,
      votes,
      seed,
      floorTrials: floorTrials.length,
      floorMisPicks: mis,
      remainingFloorWinsForValid: floorTrials.length - mis,
      remainingFloorTrials: floorTrials.length,
      listenerCount: 1,
      enginePresent: false,
    });
    const b = scoreHumanAudio({
      systems: K3,
      votes,
      seed,
      floorTrials: floorTrials.length,
      floorMisPicks: mis,
      remainingFloorWinsForValid: floorTrials.length - mis,
      remainingFloorTrials: floorTrials.length,
      listenerCount: 1,
      enginePresent: false,
    });
    expect(a.result.scores).toEqual(b.result.scores);
    expect(a.result.ranking).toEqual(b.result.ranking);
    expect(a.result.verdict).toBe(b.result.verdict);
    expect(a.pairLabels).toEqual(b.pairLabels);
    expect(a.rankingHeadline).toBe(b.rankingHeadline);
  });

  it("pairwise BWS is k=2 best/worst", () => {
    const rec = pairwiseVoteToBws({ sideA: "nearest", sideB: "floor", picked: "A", family: "you" });
    expect(rec.tuple).toEqual(["nearest", "floor"]);
    expect(rec.vote.best).toBe(0);
    expect(rec.vote.worst).toBe(1);
  });
});

describe("gain math from measured RMS pairs", () => {
  it("attenuates the louder clip to the quieter and matches within 0.5 dB", () => {
    const match = loudnessOffsetsFromRms(0.2, 0.1);
    expect(match.ok).toBe(true);
    if (!match.ok) return;
    expect(match.gainB).toBe(1);
    expect(match.gainA).toBeLessThan(1);
    expect(gainsMatchWithinTolerance(match.gainA, 0.2, match.gainB, 0.1)).toBe(true);
    expect(match.deltaDb).toBeGreaterThan(0.5);
  });

  it("halts when a clip has no energy", () => {
    const z = loudnessOffsetsFromRms(0, 0.1);
    expect(z.ok).toBe(false);
    if (z.ok) return;
    expect(z.reason).toMatch(/loudness-match-infeasible/);
  });

  it("measureRms is the quadratic mean", () => {
    expect(measureRms([0, 0, 0])).toBe(0);
    expect(measureRms([1, -1, 1, -1])).toBe(1);
  });
});

describe("budget / screen / gate labels", () => {
  it("pair below 15 shows collecting — N/15", () => {
    expect(pairBudgetLabel(0)).toBe("collecting — 0/15");
    expect(pairBudgetLabel(14)).toBe("collecting — 14/15");
    expect(pairBudgetLabel(15)).toBe("15 votes");
    expect(pairBudgetLabel(VOTE_BUDGET_PROVISIONAL)).toBe("15 votes");
  });

  it("ranking is PROVISIONAL until every pair has ≥15", () => {
    const early = rankingStatus({ "floor|nearest": 14, "floor|refined": 20, "nearest|refined": 20 });
    expect(early.provisional).toBe(true);
    expect(early.label).toMatch(/PROVISIONAL/);
    expect(early.label).toMatch(/66/);
    const ready = rankingStatus({ "floor|nearest": 15, "floor|refined": 15, "nearest|refined": 15 });
    expect(ready.provisional).toBe(false);
  });

  it("listener framing uses the required words", () => {
    expect(listenerCountLabel(1)).toBe("your blind preference");
    expect(listenerCountLabel(2)).toBe("your blind preference");
    expect(listenerCountLabel(3)).toBe("the robust claim");
  });

  it("screens a listener who mis-picks the floor on >15% of floor trials", () => {
    expect(screenListener(10, 1).screened).toBe(false);
    expect(screenListener(10, 2).screened).toBe(true);
  });

  it("UNINTERPRETABLE is first-class when a screened listener still cannot separate", () => {
    const votes: PairwiseVoteInput[] = [
      { sideA: "floor", sideB: "refined", picked: "A", family: "you" },
      { sideA: "floor", sideB: "nearest", picked: "A", family: "you" },
      { sideA: "nearest", sideB: "refined", picked: "A", family: "you" },
    ];
    const out = scoreHumanAudio({
      systems: K3,
      votes,
      seed: 3,
      floorTrials: 10,
      floorMisPicks: 4,
      remainingFloorWinsForValid: 0,
      remainingFloorTrials: 2,
      listenerCount: 1,
      enginePresent: false,
    });
    expect(out.uninterpretable).toBe(true);
    expect(out.rankingHeadline).toBe("UNINTERPRETABLE");
    expect(out.result.verdict).toMatch(/^UNINTERPRETABLE/);
    expect(out.listenerLabel).toBe("your blind preference");
  });
});

describe("human-audio verdicts belong to this mode (no LLM-panel language leaks)", () => {
  // interpretPanel's verdicts (bws.ts) are written for the LLM panel and talk
  // about smoke-screens, $0, and deferring to a human panel — none of that may
  // ever render inside the human-audio panel, which IS the human panel.
  const BANNED = /\$0|LLM|smoke.?screen|priced.?ask|proxy/i;

  function consistentVotes(perPair: number, floorLover = false): PairwiseVoteInput[] {
    const rank: Record<string, number> = { refined: 2, nearest: 1, floor: floorLover ? 3 : 0 };
    const pairs: Array<[HumanAudioSystemId, HumanAudioSystemId]> = [
      ["floor", "nearest"],
      ["floor", "refined"],
      ["nearest", "refined"],
    ];
    const votes: PairwiseVoteInput[] = [];
    for (const [a, b] of pairs) {
      for (let i = 0; i < perPair; i++) {
        votes.push({ sideA: a, sideB: b, picked: rank[a] > rank[b] ? "A" : "B", family: "you" });
      }
    }
    return votes;
  }

  function score(votes: PairwiseVoteInput[], floorMisPicks: number) {
    const floorTrials = votes.filter((v) => isFloorTrialPair(v.sideA, v.sideB)).length;
    return scoreHumanAudio({
      systems: K3,
      votes,
      seed: 11,
      floorTrials,
      floorMisPicks,
      remainingFloorWinsForValid: floorTrials - floorMisPicks,
      remainingFloorTrials: floorTrials,
      listenerCount: 1,
      enginePresent: false,
    });
  }

  it("a full-budget consistent run reads as a plain ranking in this mode's own words", () => {
    const out = score(consistentVotes(15), 0);
    expect(out.rankingHeadline).toBe("Ranking");
    expect(out.result.verdict).toMatch(/^refined leads this blind ranking/);
  });

  it("an under-budget run is PROVISIONAL with its own verdict", () => {
    const out = score(consistentVotes(2), 0);
    expect(out.rankingHeadline).toBe("PROVISIONAL");
    expect(out.result.verdict).toMatch(/Floor gate passed so far/);
  });

  it("a floor-loving listener gets UNINTERPRETABLE, not a ranking", () => {
    const votes = consistentVotes(4, true);
    const floorTrials = votes.filter((v) => isFloorTrialPair(v.sideA, v.sideB)).length;
    const out = score(votes, floorTrials);
    expect(out.uninterpretable).toBe(true);
    expect(out.rankingHeadline).toBe("UNINTERPRETABLE");
  });

  it("no outcome ever prints LLM-panel vocabulary", () => {
    const floorVotes = consistentVotes(4, true);
    const floorTrials = floorVotes.filter((v) => isFloorTrialPair(v.sideA, v.sideB)).length;
    const outcomes = [
      score(consistentVotes(15), 0),
      score(consistentVotes(2), 0),
      score(floorVotes, floorTrials),
    ];
    for (const out of outcomes) {
      const text = `${out.rankingHeadline} ${out.result.verdict} ${out.nextStep}`;
      expect(text).not.toMatch(BANNED);
    }
  });
});

describe("clip notes + realizers (shared primitive inputs)", () => {
  it("melody + voicing share one clip list", () => {
    const song = DEFAULT_PANEL_SONGS[0];
    const real = rootPositionRealization({ key: song.key, chords: song.chords }, 4);
    const notes = buildClipNotes({
      melody: song.melody,
      realization: real,
      beatsPerMeasure: song.beatsPerMeasure,
    });
    expect(notes.some((n) => n.role === "melody")).toBe(true);
    expect(notes.some((n) => n.role === "voicing")).toBe(true);
    expect(notes.filter((n) => n.role === "voicing").length).toBe(real.frames.reduce((s, f) => s + f.voices.length, 0));
  });

  it("the three deterministic systems produce realizations for every catalog song", () => {
    for (const song of DEFAULT_PANEL_SONGS) {
      const p = { key: song.key, chords: song.chords };
      const floor = rootPositionRealization(p, 4);
      const nearest = nearestToneRealization(p, 4);
      const refined = refineRealization(nearest, { voices: 4, style: "lead-sheet" }).realization;
      expect(floor.frames).toHaveLength(8);
      expect(nearest.frames).toHaveLength(8);
      expect(refined.frames).toHaveLength(8);
      expect(floor.frames.some((f) => f.voices.length > 0)).toBe(true);
    }
  });
});

describe("panel run persistence (beside, never inside, the score blob)", () => {
  it("round-trips a run record and ignores junk", () => {
    const trials = buildTrialList({ songIds: ["imagine"], systems: K3, seed: 2 });
    const rec = emptyRunRecord({
      seed: 2,
      createdAt: "2026-08-19T00:00:00.000Z",
      songIds: ["imagine"],
      systems: K3,
      engineTag: "unavailable",
      engineProbe: { reachable: false },
      trials,
    });
    const json = serializePanelRuns([rec]);
    expect(json).not.toMatch(/ai-jam-cockpit:state/);
    expect(deserializePanelRuns(json)).toEqual([rec]);
    expect(deserializePanelRuns("{nope}")).toEqual([]);
  });
});

describe("probeLocalModel", () => {
  it("reports reachable on HTTP 200", async () => {
    const probe = await probeLocalModel(async () => new Response("{}", { status: 200 }) as Response);
    expect(probe.reachable).toBe(true);
  });
  it("flags a network/CORS failure honestly", async () => {
    const probe = await probeLocalModel(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(probe.reachable).toBe(false);
    expect(probe.corsBlocked).toBe(true);
  });
});
