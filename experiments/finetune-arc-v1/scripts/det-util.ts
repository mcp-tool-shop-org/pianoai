// ─── det-util.ts — Finetune Arc v1, deterministic randomness ─────────────────
//
// Same LCG + string-hash algorithms (identical constants) as the repo's
// annotation-grounding.ts, re-implemented here so the SYNTHESIS scripts never
// import the MCQ-generator module — P0-LOCK.md §2 pins annotation-grounding.ts
// as a contamination source imported by the GATE only. Byte-identical outputs
// for identical seeds; the double-build gate asserts corpus determinism.
// ─────────────────────────────────────────────────────────────────────────────

/** Deterministic LCG. Same (a, c, m) as annotation-grounding.makeLcg. */
export function makeLcg(seed: number): () => number {
  const a = 1664525;
  const c = 1013904223;
  const m = 2 ** 32;
  let s = Math.abs(Math.floor(seed)) % m;
  return () => {
    s = (a * s + c) % m;
    return s / m;
  };
}

export function lcgInt(lcg: () => number, max: number): number {
  return Math.floor(lcg() * max);
}

export function lcgShuffle<T>(arr: T[], lcg: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = lcgInt(lcg, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** djb2-xor string hash, unsigned 32-bit — same as annotation-grounding.hashString. */
export function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0;
  }
  return h;
}

/**
 * Gold-value containment matcher — the SINGLE spec shared by gate G6b and
 * P3-v1 scoring (P0-LOCK §6/§8; the Python port in p3_select_v1.py mirrors
 * these rules exactly):
 *   numeric  — the exact value appears as a standalone token (word-boundary,
 *              not part of a longer number),
 *   note     — the exact note name appears (e.g. "E5"; '#' matched literally),
 *   hand     — the correct hand word appears; for yes/no items polarity is
 *              checked by the caller instead,
 *   yesno    — the answer's leading polarity token matches ("yes"/"no",
 *              "actually, no" counts as no).
 */
export function answerContains(
  answerText: string,
  gold: { kind: "number"; value: number } | { kind: "note"; value: string } | { kind: "hand"; value: "right" | "left" } | { kind: "yesno"; value: boolean },
): boolean {
  const text = answerText.toLowerCase();
  switch (gold.kind) {
    case "number": {
      // Standalone numeric token: not inside a longer number ("15" ≠ "5") and
      // not a decimal prefix ("5.3" ≠ "5") — but a sentence-ending "5." or a
      // "5," list separator IS a match (the dot only disqualifies when a
      // digit follows it).
      const re = new RegExp(`(?<![\\d.])${String(gold.value).replace(".", "\\.")}(?!\\.?\\d)`);
      return re.test(answerText);
    }
    case "note": {
      const esc = gold.value.replace(/[#]/g, "\\#");
      return new RegExp(`\\b${esc}(?![0-9#])`, "i").test(answerText);
    }
    case "hand":
      return text.includes(gold.value === "right" ? "right" : "left");
    case "yesno": {
      const m = /\b(yes|no|actually,?\s*no)\b/.exec(text);
      if (!m) return false;
      const saidNo = m[1].includes("no");
      return gold.value ? !saidNo : saidNo;
    }
  }
}
