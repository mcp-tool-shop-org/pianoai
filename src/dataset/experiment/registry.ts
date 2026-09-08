// ─── Published schema registry ───────────────────────────────────────────────
//
// Collision is a *different* task claiming a published schema_version.
// The owner declaring its own version is not a collision.

import type { ExperimentTask } from "./task.js";

/** schemaVersion → owning task id. */
const OWNERS = new Map<string, string>();

export function registerPublishedSchema(schemaVersion: string, ownerTaskId: string): void {
  const existing = OWNERS.get(schemaVersion);
  if (existing && existing !== ownerTaskId) {
    throw new Error(
      `schemaVersion "${schemaVersion}" is already published by task "${existing}"`,
    );
  }
  OWNERS.set(schemaVersion, ownerTaskId);
}

export function publishedOwner(schemaVersion: string): string | undefined {
  return OWNERS.get(schemaVersion);
}

/**
 * Reject a task whose schemaVersion is published by someone else.
 * The owner may declare its own version.
 */
export function assertSchemaOwner(task: Pick<ExperimentTask<unknown>, "id" | "schemaVersion">): void {
  const owner = OWNERS.get(task.schemaVersion);
  if (owner && owner !== task.id) {
    throw new Error(
      `schemaVersion "${task.schemaVersion}" is published by task "${owner}", not "${task.id}". ` +
        `A new corpus gets a new schema_version.`,
    );
  }
}

export function defineTask<TCase>(task: ExperimentTask<TCase>): ExperimentTask<TCase> {
  assertSchemaOwner(task);
  return task;
}

// ─── The published set ───────────────────────────────────────────────────────
//
// Every schema_version that appears anywhere under `datasets/`. Registering two
// of them and calling the registry a collision guard would be worse than no
// guard: it reports "checked" about eight versions it has never heard of.
// `published-set.test.ts` derives this list from disk and fails when the two
// drift, so publishing a new corpus without registering it is a red test rather
// than a silent hole.

// The corpora.
registerPublishedSchema("jam-actions-acoustic-v0/1.0.0", "acoustic-sft");
registerPublishedSchema("jam-actions-v0/1.0.0", "jam-actions-v0");

// Eval and release artefacts published inside those trees. They are not
// training corpora, but they are checksummed, distributed identifiers, and a
// new task reusing one produces exactly the ambiguity this registry exists to
// prevent.
registerPublishedSchema("corpus-eval-results/2.0.0", "jam-actions-v0");
registerPublishedSchema("corpus-scale-eval/1.0.0", "jam-actions-v0");
registerPublishedSchema("corpus-scale-sample/1.0.0", "jam-actions-v0");
registerPublishedSchema("e2-notes-present/1.0.0", "jam-actions-v0");
registerPublishedSchema("jam-actions-public-execution-verification/1.0.0", "jam-actions-v0");
registerPublishedSchema("llm-in-the-loop/1.0.0", "jam-actions-v0");
registerPublishedSchema("release-gate-assessment/1.0.0", "jam-actions-v0");
registerPublishedSchema("release-gate-assessment/2.0.0", "jam-actions-v0");
registerPublishedSchema("slice19-fair-e3-baseline/1.0.0", "jam-actions-v0");
registerPublishedSchema("slice19-fair-e3-baseline-sample/1.0.0", "jam-actions-v0");
