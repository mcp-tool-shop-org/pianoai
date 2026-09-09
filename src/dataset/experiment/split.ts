// ─── Split by the unit that leaks ────────────────────────────────────────────
//
// Records sharing a splitKey must never straddle train/test. The assignment
// (which keys are holdout) is the task's business.

export function assertNoStraddle<T>(
  items: readonly T[],
  splitKey: (c: T) => string,
  splitOf: (c: T) => "train" | "test",
): void {
  const byKey = new Map<string, Set<"train" | "test">>();
  for (const c of items) {
    const key = splitKey(c);
    const side = splitOf(c);
    let set = byKey.get(key);
    if (!set) {
      set = new Set();
      byKey.set(key, set);
    }
    set.add(side);
    if (set.size > 1) {
      throw new Error(
        `splitKey "${key}" straddles train and test. Split by the unit that leaks.`,
      );
    }
  }
}
