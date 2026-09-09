// ─── Experiment task ─────────────────────────────────────────────────────────
//
// The contract this arc paid for, as a type rather than a document:
//   - ground truth is constructible (cases() is a function, not a file of labels)
//   - labels are a closed verdict set, so baselines exist
//   - every threshold the answer depends on is on the task (copied into records)
//   - splitKey is the unit that leaks; records sharing it must not straddle
//   - schemaVersion is new for a new corpus; collision with a published
//     version claimed by a *different* task is rejected
//
// Determinism is the contract. Seeding is a task's own business.
// ─────────────────────────────────────────────────────────────────────────────

export interface ExperimentTask<TCase> {
  id: string;
  /** Never reuse a published one owned by a different task. */
  schemaVersion: string;
  /** Closed set. An open vocabulary has no baseline. */
  verdicts: readonly string[];
  /** Copied into every record, because these change. */
  thresholds: Readonly<Record<string, number>>;
  /** Deterministic. Same task, same cases, every time. */
  cases(): TCase[];
  /** Records sharing this value must never straddle the split. */
  splitKey(c: TCase): string;
}
