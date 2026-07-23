// ─── Compose: the panel orchestration (one source for script / tool / CLI) ────
//
// The reusable core behind the quality smoke-screen FEATURE (the director's ask:
// users — and we, over time — run cross-family LLM panels with different models
// and songs; ongoing; NO quality promises). It is SYSTEM- and JUDGE-injected so
// it is deterministic + unit-testable with stubs (no live Ollama), and so the
// script, the MCP tool, and the CLI all drive the identical logic and can never
// drift (like the maker's shared brief + loop).
//
// It stays honest by construction (bws.ts): the discrimination-floor gate can
// return UNINTERPRETABLE, and INCONCLUSIVE is a first-class outcome. This module
// only orchestrates + renders the shared text report; the judgment math lives in
// bws.ts, the LLM judge in ollama-bws-judge.ts. No LLM, no HTTP here.
// ─────────────────────────────────────────────────────────────────────────────

import {
  renderVoicingText,
  shuffledOrder,
  makeRng,
  aggregatePanel,
  interpretPanel,
  type PanelSystem,
  type BwsVote,
  type PanelResult,
} from "./bws.js";
import type { ChordProgression } from "./realize.js";
import type { Realization } from "./types.js";

/** A system under test + how to realize it (deterministic realizer or model proposer). */
export interface PanelSystemSpec extends PanelSystem {
  realize: (progression: ChordProgression) => Promise<Realization> | Realization;
}

/** A judge family (OllamaBwsJudge satisfies this; a stub does in tests). */
export interface PanelJudge {
  family: string;
  model?: string;
  judge(key: string, options: string[], tupleSeed: number): Promise<{ best: number; worst: number } | null>;
}

export interface PanelRunOptions {
  progressions: Array<{ id: string; progression: ChordProgression }>;
  systems: PanelSystemSpec[];
  judges: PanelJudge[];
  /** Which system ids are the discrimination anchors + the engine under test. */
  anchors: { floor: string; valid: string; engine: string };
  floorMargin?: number;
  bootstrap?: number;
  seed?: number;
  /** Progress callback (a dot per collected vote, an "x" per dropped) — optional. */
  onProgress?: (mark: string) => void;
}

export interface PanelReport {
  result: PanelResult;
  systems: PanelSystem[];
  judges: Array<{ family: string; model?: string }>;
  songIds: string[];
  votesCollected: number;
  votesPossible: number;
  text: string;
}

/**
 * Run a cross-family best-worst panel: realize each system per progression ONCE,
 * then have every judge best-worst an anonymized, shuffled view; aggregate +
 * interpret through the discrimination-floor gate. Returns the structured result
 * + a shared human-readable report. Deterministic given deterministic systems +
 * judges.
 */
export async function runVoiceLeadingPanel(opts: PanelRunOptions): Promise<PanelReport> {
  const { progressions, systems, judges, anchors } = opts;
  const votes: BwsVote[] = [];
  const tupleSystems: string[][] = [];

  for (let si = 0; si < progressions.length; si++) {
    const { progression } = progressions[si];
    const real: Record<string, Realization> = {};
    for (const s of systems) real[s.id] = await s.realize(progression);

    for (let fi = 0; fi < judges.length; fi++) {
      const judge = judges[fi];
      const order = shuffledOrder(systems.length, makeRng(1000 * (si + 1) + 31 * (fi + 1)));
      const orderedIds = order.map((k) => systems[k].id);
      const optionsText = orderedIds.map((id) => renderVoicingText(real[id]));
      const v = await judge.judge(progression.key, optionsText, si * 10 + fi);
      if (v) {
        votes.push({ options: order, best: v.best, worst: v.worst, family: judge.family });
        tupleSystems.push(orderedIds);
      }
      opts.onProgress?.(v ? "." : "x");
    }
  }

  const bareSystems: PanelSystem[] = systems.map(({ id, note }) => ({ id, note }));
  const agg = aggregatePanel(bareSystems, votes, tupleSystems, { bootstrap: opts.bootstrap ?? 500, seed: opts.seed ?? 42 });
  const result = interpretPanel(agg, anchors, { floorMargin: opts.floorMargin });

  const votesPossible = progressions.length * judges.length;
  const text = renderPanelReport({
    result,
    songIds: progressions.map((p) => p.id),
    judges: judges.map((j) => ({ family: j.family, model: j.model })),
    votesCollected: votes.length,
    votesPossible,
  });

  return {
    result,
    systems: bareSystems,
    judges: judges.map((j) => ({ family: j.family, model: j.model })),
    songIds: progressions.map((p) => p.id),
    votesCollected: votes.length,
    votesPossible,
    text,
  };
}

/** The shared human-readable report (script / tool / CLI all print this). */
export function renderPanelReport(r: {
  result: PanelResult;
  songIds: string[];
  judges: Array<{ family: string; model?: string }>;
  votesCollected: number;
  votesPossible: number;
}): string {
  const lines: string[] = [];
  lines.push(
    `Cross-family LLM voice-leading panel — ${r.songIds.length} songs, ` +
      `${r.judges.length} judge families (${r.judges.map((j) => j.family).join(", ")}).`,
  );
  lines.push(`Collected ${r.votesCollected}/${r.votesPossible} votes (x = a judge returned unparseable output, dropped).`);
  lines.push("");
  lines.push(`${"system".padEnd(10)} ${"BWS".padStart(7)} ${"95% CI".padStart(16)} ${"BT".padStart(7)} ${"best".padStart(6)} ${"worst".padStart(6)}`);
  lines.push("─".repeat(60));
  for (const s of r.result.scores) {
    lines.push(
      `${s.id.padEnd(10)} ${s.bwsScore.toFixed(2).padStart(7)} ` +
        `${`[${s.ci[0].toFixed(2)}, ${s.ci[1].toFixed(2)}]`.padStart(16)} ` +
        `${s.btStrength.toFixed(2).padStart(7)} ${String(s.best).padStart(6)} ${String(s.worst).padStart(6)}`,
    );
  }
  lines.push("");
  lines.push(`Ranking (best→worst): ${r.result.ranking.join(" > ")}`);
  lines.push(`Inter-family agreement on the top pick: ${(r.result.familyAgreement * 100).toFixed(0)}%`);
  lines.push(`Discrimination-floor gate: ${r.result.interpretable ? "PASSED" : "FAILED"}`);
  lines.push("");
  lines.push(`⇒ ${r.result.verdict}`);
  lines.push("");
  lines.push(
    "This is a DIRECTIONAL symbolic smoke-screen, NOT a quality measure. Local LLMs judging note-names " +
      "cannot make a quality claim (findings 18–20) — that is a blind human-AUDIO BWS panel. It only says " +
      "whether that (deferred, priced) human panel is worth scheduling.",
  );
  return lines.join("\n");
}
