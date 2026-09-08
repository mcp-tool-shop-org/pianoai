import { scorePredictions, trivialBaselines } from "../../src/dataset/experiment/eval.js";
import { WHO_FIRST_VERDICTS, type WhoFirstVerdict } from "./task.js";
import type { WhoFirstRecord } from "./generate.js";

export function evaluateWhoFirst(records: WhoFirstRecord[], preds: Array<{ id: string; verdict: string }>) {
  const labels = records.map((r) => r.observation.gold.verdict);
  return {
    baselines: trivialBaselines(labels, WHO_FIRST_VERDICTS),
    ...scorePredictions(
      records.map((r) => ({
        id: r.id,
        gold: r.observation.gold.verdict as WhoFirstVerdict,
      })),
      preds,
      WHO_FIRST_VERDICTS,
    ),
  };
}
