import { defineTask } from "../experiment/index.js";
import type { V1Record } from "./schema.js";
import { V1_SCHEMA_VERSION } from "./schema.js";
import { buildAllRecords } from "./builder.js";
import {
  MEASURED_YIN_LOCKED_P95_CENTS,
  V1_ONSET_CLEARANCE_MS,
  V1_PITCH_CLEARANCE_CENTS,
} from "./tracker-error.js";

let cached: V1Record[] | null = null;
export function v1Records(): V1Record[] {
  if (!cached) cached = buildAllRecords();
  return cached;
}

export const coverageV1Task = defineTask<V1Record>({
  id: "coverage-v1",
  schemaVersion: V1_SCHEMA_VERSION,
  verdicts: ["deferred-to-cases"],
  thresholds: {
    yin_locked_p95_cents: MEASURED_YIN_LOCKED_P95_CENTS,
    pitch_clearance_cents: V1_PITCH_CLEARANCE_CENTS,
    onset_clearance_ms: V1_ONSET_CLEARANCE_MS,
  },
  cases: () => v1Records(),
  splitKey: (c) => {
    if (c.family === "catalog") return "catalog";
    if (c.family === "server") return "server";
    if (c.family === "ensemble") return `ensemble:${c.scope.phrase_window}`;
    return c.scope.song_id;
  },
});
