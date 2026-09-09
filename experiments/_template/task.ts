// ─── Template experiment: which instrument stopped first? ────────────────────
//
// Constructible gold over the live ensemble, no audio graph.
// Stop BOTH children at different times and ask who stopped FIRST.
// At view time both have sounding: [] and both appear in recentlyReleased,
// so the answer is a comparison of release times, not a field lookup.
// createTapOutput is a live function and does not appear on these records.

import { Ensemble, RELEASE_LOOKBACK_SEC } from "../../src/audio/ensemble.js";
import { defineTask } from "../../src/dataset/experiment/index.js";

export const WHO_FIRST_VERDICTS = ["piano", "synth"] as const;
export type WhoFirstVerdict = (typeof WHO_FIRST_VERDICTS)[number];

export const WHO_FIRST_THRESHOLDS = {
  release_lookback_sec: RELEASE_LOOKBACK_SEC,
} as const;

export interface WhoFirstCase {
  chord: number[];
  firstId: WhoFirstVerdict;
  firstStopSec: number;
  secondStopSec: number;
  viewSec: number;
}

export interface SlimInstrument {
  id: string;
  sounding: Array<{ note: number; startedSec: number; heldSec: number }>;
  recentlyReleased: Array<{ note: number; startedSec: number; heldSec: number }>;
}

export interface SlimView {
  atSec: number;
  instruments: SlimInstrument[];
}

const CHORDS: number[][] = [
  [60, 64, 67],
  [67, 71, 74],
];

/** Hold out the G triad. Same chord never straddles the split. */
export const TEST_CHORD_KEY = "67-71-74";

export function chordKey(chord: number[]): string {
  return chord.join("-");
}

export function runCase(c: WhoFirstCase): SlimView {
  const ens = new Ensemble();
  ens.addInstrument({ id: "piano", label: "piano" });
  ens.addInstrument({ id: "synth", label: "synth" });
  const second: WhoFirstVerdict = c.firstId === "piano" ? "synth" : "piano";
  for (const n of c.chord) {
    ens.noteOn("piano", { note: n, velocity: 90, atSec: 0 });
    ens.noteOn("synth", { note: n, velocity: 90, atSec: 0 });
  }
  ens.allNotesOff(c.firstId, c.firstStopSec);
  ens.allNotesOff(second, c.secondStopSec);
  const view = ens.view(c.viewSec);
  return {
    atSec: view.atSec,
    instruments: view.instruments.map((i) => ({
      id: i.id,
      sounding: i.sounding.map((n) => ({
        note: n.note,
        startedSec: n.startedSec,
        heldSec: n.heldSec,
      })),
      recentlyReleased: i.recentlyReleased.map((n) => ({
        note: n.note,
        startedSec: n.startedSec,
        heldSec: n.heldSec,
      })),
    })),
  };
}

/** The label the tools measure: earliest release time across recentlyReleased. */
export function firstStoppedId(view: SlimView): WhoFirstVerdict {
  let best: { id: string; t: number } | null = null;
  for (const inst of view.instruments) {
    for (const n of inst.recentlyReleased) {
      const t = n.startedSec + n.heldSec;
      if (!best || t < best.t) best = { id: inst.id, t };
    }
  }
  if (best?.id !== "piano" && best?.id !== "synth") {
    throw new Error("could not decide who stopped first from recentlyReleased");
  }
  return best.id;
}

export const whoFirstTask = defineTask<WhoFirstCase>({
  id: "ensemble-who-first",
  schemaVersion: "jam-actions-ensemble-who-first-v0/1.0.0",
  verdicts: WHO_FIRST_VERDICTS,
  thresholds: WHO_FIRST_THRESHOLDS,
  cases: () => {
    const cases: WhoFirstCase[] = [];
    for (const chord of CHORDS) {
      for (const firstId of WHO_FIRST_VERDICTS) {
        cases.push({
          chord,
          firstId,
          firstStopSec: 0.4,
          secondStopSec: 0.9,
          viewSec: 1.1,
        });
      }
    }
    return cases;
  },
  splitKey: (c) => chordKey(c.chord),
});
