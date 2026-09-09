// ─── Generic eval ────────────────────────────────────────────────────────────
//
// Per-class accuracy, trivial baselines, and a hole for the base model.
// Baselines compute over the DECLARED class set, not over whatever labels
// happened to appear — a class with count 0 still exists, and majority_class
// is a label a model can actually emit.

export interface PredLine {
  id: string;
  verdict: string;
}

export interface ClassScore {
  kind: string;
  n: number;
  correct: number;
  accuracy: number;
}

export interface Baselines {
  uniform: number;
  majority: number;
  majority_class: string;
}

export interface ScoreReport {
  overall: number;
  per_class: ClassScore[];
}

/**
 * `labels` are the gold verdicts (what a model emits). `declared` is the
 * closed set. Uniform is 1/|declared| even when some classes are absent.
 * Ties on majority go to the first declared class that hits the max count.
 */
export function trivialBaselines(
  labels: readonly string[],
  declared: readonly string[],
): Baselines {
  if (declared.length === 0) {
    throw new Error("declared class set is empty; an open vocabulary has no baseline");
  }
  const allowed = new Set(declared);
  const counts = new Map<string, number>();
  for (const c of declared) counts.set(c, 0);
  for (const label of labels) {
    if (!allowed.has(label)) {
      throw new Error(`gold label "${label}" is not in the declared class set`);
    }
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  let majority_class = declared[0]!;
  let majorityN = counts.get(majority_class) ?? 0;
  for (const c of declared) {
    const n = counts.get(c) ?? 0;
    if (n > majorityN) {
      majority_class = c;
      majorityN = n;
    }
  }
  const n = labels.length;
  return {
    uniform: 1 / declared.length,
    majority: n === 0 ? 0 : majorityN / n,
    majority_class,
  };
}

export function scorePredictions(
  rows: ReadonlyArray<{ id: string; gold: string; group?: string }>,
  preds: PredLine[],
  declared: readonly string[],
): ScoreReport {
  const byId = new Map(preds.map((p) => [p.id, p.verdict]));
  const hits = new Map<string, { n: number; correct: number }>();
  for (const c of declared) hits.set(c, { n: 0, correct: 0 });
  let correct = 0;
  for (const row of rows) {
    const key = row.group ?? row.gold;
    const slot = hits.get(key) ?? { n: 0, correct: 0 };
    slot.n++;
    const hit = byId.get(row.id) === row.gold;
    if (hit) {
      correct++;
      slot.correct++;
    }
    hits.set(key, slot);
  }
  const per_class: ClassScore[] = declared.map((kind) => {
    const slot = hits.get(kind) ?? { n: 0, correct: 0 };
    return {
      kind,
      n: slot.n,
      correct: slot.correct,
      accuracy: slot.n === 0 ? 0 : slot.correct / slot.n,
    };
  });
  return {
    overall: rows.length === 0 ? 0 : correct / rows.length,
    per_class,
  };
}
