// ─── Compose: the BWS + Bradley-Terry panel core (the quality SMOKE-SCREEN) ───
//
// Phase 2, Session 2 follow-up. The blind human BWS quality panel is a director
// priced-ask (findings 18–20). This is the $0 SMOKE-SCREEN that precedes it: a
// cross-family LOCAL-LLM best-worst-scaling panel over the composition systems.
// It is NOT the quality claim — it judges SYMBOLIC voicings (note-names), not
// audio, with 7–30B judges whose music theory is shaky — it is a directional
// filter: does the engine's output rank above the baselines, or not? Either
// answer is $0 information.
//
// It is built HONEST by construction, from the studio's earned LLM-judge lessons
// (prism-verify family-AB, [[prism-family-ab-measurement-limits]]):
//   • DISCRIMINATION-FLOOR GATE — if the panel cannot rank a theory-VALID system
//     above the theory-INVALID root-position floor, the judges are below the
//     floor and the result is UNINTERPRETABLE (a judge problem, not an engine
//     finding). prism's v1.5.0 ceiling-effect null taught this.
//   • CROSS-FAMILY, REASONING-HIDDEN — ≥3 disjoint judge families over anonymized,
//     shuffled options; no judge grades its own generator (EXTERNAL_VERIFIER).
//   • INCONCLUSIVE IS A REAL OUTCOME — a wide bootstrap CI or low inter-family
//     agreement is reported as inconclusive, never rounded up to a quality claim.
//
// This module is the PURE core (rendering, BWS counting, Bradley-Terry MM, a
// seeded bootstrap CI, the discrimination-floor verdict). The LLM judge lives in
// ollama-bws-judge.ts (DECOMPOSE_BY_SECRETS). No LLM, no HTTP here.
// ─────────────────────────────────────────────────────────────────────────────

import type { Realization } from "./types.js";

const PC_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/** A named realization system under test (e.g. "floor", "engine"). */
export interface PanelSystem {
  /** Stable id used in reports + the discrimination-floor anchors. */
  id: string;
  /** One-line description (not shown to the judge). */
  note: string;
}

/** One judge's verdict on a 4-tuple: the option indices it deemed best + worst. */
export interface BwsVote {
  /** The tuple's option order (indices into the systems array, post-shuffle). */
  options: number[];
  best: number | null; // index into `options`, or null (unparseable → dropped)
  worst: number | null;
  /** The judge family that cast it (for inter-family agreement). */
  family: string;
}

// ─── Symbolic stimulus rendering (what the judge reads) ───────────────────────

/**
 * Render a realization as a per-measure note-name table — the SYMBOLIC stimulus a
 * text LLM judge reads (it cannot hear audio; this is the honest limit of the
 * smoke-screen). Voices low→high, sharps as the deterministic spelling.
 */
export function renderVoicingText(real: Realization): string {
  const lines: string[] = [];
  for (const f of real.frames) {
    if (f.voices.length === 0) {
      lines.push(`m${f.measure} ${f.chordSymbol}: (rest)`);
      continue;
    }
    const notes = [...f.voices]
      .sort((a, b) => a - b)
      .map((v) => `${PC_NAMES[((v % 12) + 12) % 12]}${Math.floor(v / 12) - 1}`);
    lines.push(`m${f.measure} ${f.chordSymbol}: ${notes.join(" ")}`);
  }
  return lines.join("\n");
}

// ─── A tiny seeded PRNG (reproducible tuples + bootstrap) ──────────────────────

/** mulberry32 — a small deterministic PRNG so the panel is byte-reproducible. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Fisher-Yates shuffle of [0..n) using the given rng. */
export function shuffledOrder(n: number, rng: () => number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

// ─── BWS aggregation: counting scores + Bradley-Terry ─────────────────────────

export interface PanelScore {
  id: string;
  /** Kiritchenko-Mohammad BWS score = (#best − #worst)/#appearances ∈ [−1, 1]. */
  bwsScore: number;
  /** Bradley-Terry latent strength (normalized, higher = stronger). */
  btStrength: number;
  best: number;
  worst: number;
  appearances: number;
  /** 95% bootstrap CI on the BWS score (seeded). */
  ci: [number, number];
}

/** Accumulate the implied pairwise wins from a best-worst vote over `k` options.
 *  best beats all others; all others beat worst; the middle pair is left unknown. */
function tupleWins(systemsInTuple: string[], best: number | null, worst: number | null): Array<[string, string]> {
  const wins: Array<[string, string]> = [];
  const k = systemsInTuple.length;
  for (let i = 0; i < k; i++) {
    if (best != null && i !== best) wins.push([systemsInTuple[best], systemsInTuple[i]]);
    if (worst != null && i !== worst && i !== best) wins.push([systemsInTuple[i], systemsInTuple[worst]]);
  }
  return wins;
}

/** Bradley-Terry strengths via the Hunter (2004) MM algorithm from a win matrix. */
function bradleyTerry(ids: string[], wins: Array<[string, string]>, iters = 200): Map<string, number> {
  const idx = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const W = Array.from({ length: n }, () => new Array(n).fill(0));
  for (const [a, b] of wins) {
    const ai = idx.get(a);
    const bi = idx.get(b);
    if (ai == null || bi == null) continue;
    W[ai][bi] += 1;
  }
  const wins_i = W.map((row) => row.reduce((s, x) => s + x, 0));
  let p = new Array(n).fill(1);
  for (let it = 0; it < iters; it++) {
    const np = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let denom = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const nij = W[i][j] + W[j][i];
        if (nij > 0) denom += nij / (p[i] + p[j]);
      }
      np[i] = denom > 0 ? wins_i[i] / denom : p[i];
    }
    // normalize to geometric mean 1 (scale-free)
    const logmean = np.reduce((s, x) => s + Math.log(x > 0 ? x : 1e-12), 0) / n;
    const scale = Math.exp(logmean);
    p = np.map((x) => (scale > 0 ? x / scale : x));
  }
  return new Map(ids.map((id, i) => [id, p[i]]));
}

export interface PanelResult {
  scores: PanelScore[];
  /** Systems ranked best→worst by BWS score. */
  ranking: string[];
  /** Fraction of families whose top pick matches the overall top (inter-family agreement). */
  familyAgreement: number;
  /** The discrimination-floor verdict (see interpretPanel). */
  interpretable: boolean;
  verdict: string;
}

/**
 * Aggregate a set of BWS votes into per-system scores + a Bradley-Terry ranking +
 * a seeded bootstrap CI + inter-family agreement. `tupleSystems[t]` maps vote `t`
 * (aligned to `votes`) to the system ids in that tuple's option order.
 */
export function aggregatePanel(
  systems: PanelSystem[],
  votes: BwsVote[],
  tupleSystems: string[][],
  opts: { bootstrap?: number; seed?: number } = {},
): Omit<PanelResult, "interpretable" | "verdict"> {
  const ids = systems.map((s) => s.id);
  const best = new Map(ids.map((id) => [id, 0]));
  const worst = new Map(ids.map((id) => [id, 0]));
  const appear = new Map(ids.map((id) => [id, 0]));
  const allWins: Array<[string, string]> = [];

  votes.forEach((v, t) => {
    const inTuple = tupleSystems[t];
    for (const id of inTuple) appear.set(id, (appear.get(id) ?? 0) + 1);
    if (v.best != null) best.set(inTuple[v.best], (best.get(inTuple[v.best]) ?? 0) + 1);
    if (v.worst != null) worst.set(inTuple[v.worst], (worst.get(inTuple[v.worst]) ?? 0) + 1);
    allWins.push(...tupleWins(inTuple, v.best, v.worst));
  });

  const bt = bradleyTerry(ids, allWins);
  const score = (id: string): number => {
    const a = appear.get(id) ?? 0;
    return a > 0 ? ((best.get(id) ?? 0) - (worst.get(id) ?? 0)) / a : 0;
  };

  // seeded bootstrap CI over votes
  const B = opts.bootstrap ?? 500;
  const rng = makeRng(opts.seed ?? 12345);
  const ciById = new Map<string, [number, number]>();
  const boot: Record<string, number[]> = Object.fromEntries(ids.map((id) => [id, []]));
  for (let b = 0; b < B; b++) {
    const bBest = new Map(ids.map((id) => [id, 0]));
    const bWorst = new Map(ids.map((id) => [id, 0]));
    const bAppear = new Map(ids.map((id) => [id, 0]));
    for (let k = 0; k < votes.length; k++) {
      const t = Math.floor(rng() * votes.length);
      const v = votes[t];
      const inTuple = tupleSystems[t];
      for (const id of inTuple) bAppear.set(id, (bAppear.get(id) ?? 0) + 1);
      if (v.best != null) bBest.set(inTuple[v.best], (bBest.get(inTuple[v.best]) ?? 0) + 1);
      if (v.worst != null) bWorst.set(inTuple[v.worst], (bWorst.get(inTuple[v.worst]) ?? 0) + 1);
    }
    for (const id of ids) {
      const a = bAppear.get(id) ?? 0;
      boot[id].push(a > 0 ? ((bBest.get(id) ?? 0) - (bWorst.get(id) ?? 0)) / a : 0);
    }
  }
  for (const id of ids) {
    const sorted = boot[id].sort((a, b) => a - b);
    const lo = sorted[Math.floor(0.025 * (sorted.length - 1))] ?? 0;
    const hi = sorted[Math.floor(0.975 * (sorted.length - 1))] ?? 0;
    ciById.set(id, [lo, hi]);
  }

  const scores: PanelScore[] = ids.map((id) => ({
    id,
    bwsScore: score(id),
    btStrength: bt.get(id) ?? 0,
    best: best.get(id) ?? 0,
    worst: worst.get(id) ?? 0,
    appearances: appear.get(id) ?? 0,
    ci: ciById.get(id) ?? [0, 0],
  }));
  scores.sort((a, b) => b.bwsScore - a.bwsScore);

  // inter-family agreement: does each family's top-by-bwsScore match the overall top?
  const overallTop = scores[0]?.id;
  const families = [...new Set(votes.map((v) => v.family))];
  let agree = 0;
  for (const fam of families) {
    const famScore = new Map(ids.map((id) => [id, 0]));
    const famAppear = new Map(ids.map((id) => [id, 0]));
    votes.forEach((v, t) => {
      if (v.family !== fam) return;
      const inTuple = tupleSystems[t];
      for (const id of inTuple) famAppear.set(id, (famAppear.get(id) ?? 0) + 1);
      if (v.best != null) famScore.set(inTuple[v.best], (famScore.get(inTuple[v.best]) ?? 0) + 1);
      if (v.worst != null) famScore.set(inTuple[v.worst], (famScore.get(inTuple[v.worst]) ?? 0) - 1);
    });
    const famTop = [...ids].sort(
      (a, b) => (famScore.get(b)! / (famAppear.get(b) || 1)) - (famScore.get(a)! / (famAppear.get(a) || 1)),
    )[0];
    if (famTop === overallTop) agree++;
  }

  return { scores, ranking: scores.map((s) => s.id), familyAgreement: families.length ? agree / families.length : 0 };
}

/**
 * The discrimination-floor verdict ([[prism-family-ab-measurement-limits]]): a
 * panel is INTERPRETABLE only if it ranks the theory-VALID anchor clearly above
 * the theory-INVALID floor anchor. Otherwise the judges are below the floor and
 * the result says nothing about the engine. Given interpretability, classify the
 * engine's standing directionally (never as a quality claim).
 */
export function interpretPanel(
  agg: Omit<PanelResult, "interpretable" | "verdict">,
  anchors: { floor: string; valid: string; engine: string },
  opts: { floorMargin?: number } = {},
): PanelResult {
  const by = new Map(agg.scores.map((s) => [s.id, s]));
  const floor = by.get(anchors.floor);
  const valid = by.get(anchors.valid);
  const engine = by.get(anchors.engine);
  const margin = opts.floorMargin ?? 0.15;

  if (!floor || !valid || !engine) {
    return { ...agg, interpretable: false, verdict: "UNINTERPRETABLE — missing an anchor system" };
  }
  const separates = valid.bwsScore - floor.bwsScore >= margin;
  if (!separates) {
    return {
      ...agg,
      interpretable: false,
      verdict:
        `UNINTERPRETABLE — the judges are below the discrimination floor: the theory-VALID "${anchors.valid}" ` +
        `(${valid.bwsScore.toFixed(2)}) does not clearly beat the theory-INVALID "${anchors.floor}" ` +
        `(${floor.bwsScore.toFixed(2)}). A judge problem, not an engine finding.`,
    };
  }

  const engineRank = agg.ranking.indexOf(anchors.engine) + 1;
  const engineTop = agg.ranking[0] === anchors.engine;
  const ciClearsFloor = engine.ci[0] > floor.ci[1];
  let verdict: string;
  if (engineTop && ciClearsFloor && agg.familyAgreement >= 0.5) {
    verdict =
      `DIRECTIONAL POSITIVE — the panel ranks the engine top (rank ${engineRank}/${agg.ranking.length}, ` +
      `family agreement ${(agg.familyAgreement * 100).toFixed(0)}%). NOT a quality claim: symbolic LLM ` +
      `smoke-screen; the human-audio BWS panel is deferred (a director priced-ask).`;
  } else {
    verdict =
      `INCONCLUSIVE — judges discriminate (floor gate passed) but the engine's standing is not clean ` +
      `(rank ${engineRank}/${agg.ranking.length}, family agreement ${(agg.familyAgreement * 100).toFixed(0)}%, ` +
      `engine CI [${engine.ci[0].toFixed(2)}, ${engine.ci[1].toFixed(2)}]). $0 information, honestly null.`;
  }
  return { ...agg, interpretable: true, verdict };
}
