// Build constructible records from whoFirstTask. No graph. No Date().

import type { Turn } from "../../src/dataset/schema.js";
import {
  firstStoppedId,
  runCase,
  TEST_CHORD_KEY,
  whoFirstTask,
  type SlimView,
  type WhoFirstCase,
  type WhoFirstVerdict,
} from "./task.js";

export interface WhoFirstRecord {
  schema_version: string;
  id: string;
  split: "train" | "test";
  thresholds: Readonly<Record<string, number>>;
  observation: {
    view: SlimView;
    gold: { verdict: WhoFirstVerdict };
  };
  target_trace: { session: Turn[] };
}

export function splitOf(c: WhoFirstCase): "train" | "test" {
  return whoFirstTask.splitKey(c) === TEST_CHORD_KEY ? "test" : "train";
}

export function buildRecord(c: WhoFirstCase): WhoFirstRecord {
  const view = runCase(c);
  const verdict = firstStoppedId(view);
  if (verdict !== c.firstId) {
    throw new Error(`measured first-stopped ${verdict} !== constructed ${c.firstId}`);
  }
  const id = `who-first_${whoFirstTask.splitKey(c)}_${c.firstId}`;
  const session: Turn[] = [
    {
      turn: 1,
      role: "user",
      content: "Which instrument stopped first?",
    },
    {
      turn: 2,
      role: "assistant",
      content: verdict,
    },
  ];
  return {
    schema_version: whoFirstTask.schemaVersion,
    id,
    split: splitOf(c),
    thresholds: { ...whoFirstTask.thresholds },
    observation: { view, gold: { verdict } },
    target_trace: { session },
  };
}

export function buildAllRecords(): WhoFirstRecord[] {
  return whoFirstTask.cases().map(buildRecord);
}
