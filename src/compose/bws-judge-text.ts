// ─── Blind BWS judge prompt + parse (Node-free) ──────────────────────────────
//
// Extracted from ollama-bws-judge.ts so the cockpit can reuse the same
// prompt/parser without pulling OllamaBackend (process.env). Scoring still
// lives only in bws.ts.

/** Build the blind best-worst prompt over k rendered (anonymized) options. */
export function buildJudgePrompt(key: string, options: string[]): { system: string; user: string } {
  const system = [
    `You are a music theory examiner judging keyboard part-writing. You will see several`,
    `voicings of the SAME chord progression, each labeled "Option N". Judge them ONLY on`,
    `voice-leading quality and musicality:`,
    `- every note should belong to its chord;`,
    `- prefer smooth motion (common tones, small steps) over leaps;`,
    `- avoid parallel perfect fifths and octaves;`,
    `- resolve tendency tones; keep sensible spacing and doublings.`,
    ``,
    `Pick the ONE best option and the ONE worst option. Reply with ONE JSON object, no prose:`,
    `{"best": <option number>, "worst": <option number>}`,
  ].join("\n");

  const blocks = options.map((o, i) => `Option ${i + 1}:\n${o}`).join("\n\n");
  const user = [
    `Progression key: ${key}. ${options.length} options follow — each is the same chords, voiced differently.`,
    ``,
    blocks,
    ``,
    `Return {"best": N, "worst": N} with 1-based option numbers (best ≠ worst).`,
  ].join("\n");
  return { system, user };
}

/** Parse a judge response into 0-based {best, worst} indices, or null. */
export function parseJudgeResponse(raw: string, k: number): { best: number; worst: number } | null {
  if (!raw?.trim()) return null;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const m = /\{[^}]*\}/.exec(raw);
    if (m) {
      try {
        parsed = JSON.parse(m[0]);
      } catch {
        /* unrecoverable */
      }
    }
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const nested = unwrapJudgeObject(o);
  const src = nested ?? o;
  const best = Number(src.best ?? src.Best ?? src.b);
  const worst = Number(src.worst ?? src.Worst ?? src.w);
  if (!Number.isFinite(best) || !Number.isFinite(worst)) return null;
  const bi = Math.round(best) - 1;
  const wi = Math.round(worst) - 1;
  if (bi < 0 || bi >= k || wi < 0 || wi >= k || bi === wi) return null;
  return { best: bi, worst: wi };
}

/** Ollama format:json may wrap {best,worst} under a single key. */
function unwrapJudgeObject(o: Record<string, unknown>): Record<string, unknown> | null {
  if ("best" in o || "Best" in o || "b" in o) return null;
  const values = Object.values(o);
  if (values.length === 1 && values[0] && typeof values[0] === "object" && !Array.isArray(values[0])) {
    return values[0] as Record<string, unknown>;
  }
  return null;
}
