// ─── paraphrase-bank.ts — Finetune Arc v1, component 1 surface templates ─────
//
// P0-LOCK.md §3-C1: paraphrase = USER-TURN SUBSTITUTION ONLY. Assistant and
// tool turns are byte-frozen from the human record. Every variant must carry
// the record's literal measure numbers and a song anchor token (gate G6c).
//
// Finding 41 (arXiv:2508.11383): vary STRUCTURAL framing (clause order,
// syntax, register), not punctuation. 26 templates across six structural
// classes: imperative-first, goal-first, question-first, collaborative,
// student-register, terse.
//
// Deterministic: template choice is LCG-seeded per (recordId, variantIndex)
// by the builder; this module is pure.
// ─────────────────────────────────────────────────────────────────────────────

import { makeLcg, lcgInt, hashString } from "./det-util.js";

/** Per-song display names + the anchor token gate G6c asserts (P0-LOCK §3-C1). */
export const SONG_DISPLAY: Record<string, { display: string; anchor: string }> = {
  "bach-prelude-c-major-bwv846": { display: "the Bach C Major Prelude", anchor: "Bach" },
  "chopin-nocturne-op9-no2": { display: "the Chopin Nocturne Op. 9 No. 2", anchor: "Nocturne" },
  "mozart-k545-mvt1": { display: "Mozart K545", anchor: "K545" },
  "pathetique-mvt2": { display: "the Pathetique second movement", anchor: "Pathetique" },
  "schumann-traumerei": { display: "Schumann's Traumerei", anchor: "Traumerei" },
  // val songs — never paraphrased (gate-asserted); listed for grounding-gen reuse
  "chopin-prelude-e-minor": { display: "the Chopin Prelude in E minor", anchor: "Prelude in E minor" },
  "fur-elise": { display: "Für Elise", anchor: "Elise" },
};

export interface ParsedAsk {
  startMeasure: number;
  endMeasure: number;
  /** Song reference text from the original, or null when absent. */
  songRefOriginal: string | null;
  /** Focus tail carried VERBATIM from the human ask ('' when absent). */
  tail: string;
}

/**
 * Parse one of the 78 human asks. The corpus is formulaic (verified over all
 * 78 gradient records this session):
 *   [Verb] measures {A}–{B} [of {SongRef}] [— | and | .] [{tail}]
 * Throws when the shape does not match — the builder treats that as a gate
 * failure, never a silent skip.
 */
export function parseHumanAsk(text: string): ParsedAsk {
  const m = /^(.*?)\bmeasures\s+(\d+)\s*[–—-]\s*(\d+)\s*(.*)$/s.exec(text.trim());
  if (!m) throw new Error(`unparseable human ask: ${text}`);
  const startMeasure = Number(m[2]);
  const endMeasure = Number(m[3]);
  let rest = m[4].trim();

  let songRefOriginal: string | null = null;
  if (rest.startsWith("of ")) {
    const body = rest.slice(3);
    // Earliest delimiter wins: " — " (em-dash clause), " and " (imperative
    // continuation), or the terminal period.
    const candidates = [
      { idx: body.indexOf(" — "), skip: 3 },
      { idx: body.indexOf(" and "), skip: 5 },
      { idx: body.indexOf("."), skip: 1 },
    ].filter((c) => c.idx >= 0);
    if (candidates.length === 0) {
      songRefOriginal = body.trim();
      rest = "";
    } else {
      candidates.sort((a, b) => a.idx - b.idx);
      const cut = candidates[0];
      songRefOriginal = body.slice(0, cut.idx).trim();
      rest = body.slice(cut.idx + cut.skip).trim();
    }
  } else if (rest.startsWith("— ")) {
    rest = rest.slice(2).trim();
  } else if (rest.startsWith("and ")) {
    rest = rest.slice(4).trim();
  } else if (rest === "." || rest === "") {
    rest = "";
  }
  return { startMeasure, endMeasure, songRefOriginal, tail: rest };
}

function cap(s: string): string {
  return s.length > 0 && s[0] >= "a" && s[0] <= "z" ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Tail as a standalone sentence (capitalized, period-terminated), or ''. */
function tailSentence(tail: string): string {
  if (!tail) return "";
  const t = cap(tail);
  return /[.?!]$/.test(t) ? t : `${t}.`;
}

/** Tail after an em-dash, verbatim (original casing), or ''. */
function tailDash(tail: string): string {
  return tail ? ` — ${tail}` : "";
}

type Template = (mm: string, song: string, tail: string) => string;

/**
 * 26 structural templates. `mm` = "measures {A}–{B}" (literal digits),
 * `song` = SONG_DISPLAY display string, `tail` = verbatim human focus tail.
 * Every output contains `mm` and `song` (gate G6c anchors).
 */
export const PARAPHRASE_TEMPLATES: Template[] = [
  // — imperative-first —
  (mm, song, tail) => `Pull up ${mm} of ${song}${tailDash(tail)}`.trim() + (tail ? "" : "."),
  (mm, song, tail) => `Bring up ${mm} of ${song} and talk me through the passage. ${tailSentence(tail)}`.trim(),
  (mm, song, tail) => `Open ${mm} of ${song} for me${tailDash(tail)}`.trim() + (tail ? "" : "."),
  (mm, song, tail) => `Take a look at ${mm} of ${song} and tell me what you see. ${tailSentence(tail)}`.trim(),
  (mm, song, tail) => `Look closely at ${mm} of ${song}. ${tailSentence(tail) || "What stands out?"}`.trim(),
  // — goal-first (tail leads) —
  (mm, song, tail) =>
    tail
      ? `${tailSentence(tail)} Use ${mm} of ${song}.`
      : `Give me your read on ${mm} of ${song}.`,
  (mm, song, tail) =>
    tail
      ? `Here's what I want to understand: ${tail} Start from ${mm} of ${song}.`
      : `Here's what I want to understand: what's going on in ${mm} of ${song}?`,
  (mm, song, tail) =>
    tail
      ? `Before we play anything — ${tail} We're in ${mm} of ${song}.`
      : `Before we play anything, tell me what's happening in ${mm} of ${song}.`,
  // — question-first —
  (mm, song, tail) =>
    tail
      ? `What's going on musically in ${mm} of ${song}? Specifically: ${tail}`
      : `What's going on musically in ${mm} of ${song}?`,
  (mm, song, tail) =>
    tail
      ? `Can you analyze ${mm} of ${song} and then play it? ${tailSentence(tail)}`
      : `Can you analyze ${mm} of ${song} and then play it?`,
  (mm, song, tail) =>
    tail
      ? `Could we go over ${mm} of ${song}? ${tailSentence(tail)}`
      : `Could we go over ${mm} of ${song}?`,
  (mm, song, tail) =>
    tail
      ? `Mind walking me through ${mm} of ${song}? ${tailSentence(tail)}`
      : `Mind walking me through ${mm} of ${song}?`,
  // — collaborative —
  (mm, song, tail) => `Let's dig into ${mm} of ${song}. ${tailSentence(tail)}`.trim(),
  (mm, song, tail) => `Let's study ${mm} of ${song} before we play it. ${tailSentence(tail)}`.trim(),
  (mm, song, tail) => `Next up: ${mm} of ${song}. ${tailSentence(tail) || "Walk me through the passage, then play it."}`,
  (mm, song, tail) => `Let's move to ${mm} of ${song}${tailDash(tail)}`.trim() + (tail ? "" : "."),
  (mm, song, tail) => `Time for ${mm} of ${song}. ${tailSentence(tail) || "Set the scene for me, then let it play."}`,
  // — student register —
  (mm, song, tail) => `I'm working on ${mm} of ${song}. ${tailSentence(tail) || "What should I be hearing here?"}`,
  (mm, song, tail) => `I'm practicing ${mm} of ${song} this week. ${tailSentence(tail) || "Talk me through the passage."}`,
  (mm, song, tail) =>
    tail
      ? `I keep getting lost in ${mm} of ${song}. ${tailSentence(tail)}`
      : `I keep getting lost in ${mm} of ${song}. Can you break the passage down?`,
  (mm, song, tail) => `My teacher assigned ${mm} of ${song}. ${tailSentence(tail) || "What's the musical idea here?"}`,
  (mm, song, tail) =>
    tail
      ? `Help me hear ${mm} of ${song} properly. ${tailSentence(tail)}`
      : `Help me hear ${mm} of ${song} properly before I practice it.`,
  // — terse —
  (mm, song, tail) => `${cap(mm)} of ${song}${tailDash(tail)}`.trim() + (tail ? "" : " — walk me through the passage."),
  (mm, song, tail) => `${song}, ${mm}${tailDash(tail)}`.trim() + (tail ? "" : ". Describe, then play."),
  (mm, song, tail) => `${cap(mm)}, ${song}: ${tail || "your analysis, then playback."}`,
  (mm, song, tail) =>
    tail
      ? `${cap(mm)} of ${song}, please. ${tailSentence(tail)}`
      : `${cap(mm)} of ${song}, please — describe it, then play it.`,
];

/**
 * Deterministic paraphrase for (recordId, humanAsk, variantIndex k∈{1,2}).
 * Template indices for k=1 and k=2 are drawn without replacement so a
 * record's two variants never share a template.
 */
export function paraphraseAsk(
  recordId: string,
  songId: string,
  humanAsk: string,
  k: 1 | 2,
): string {
  const parsed = parseHumanAsk(humanAsk);
  const songMeta = SONG_DISPLAY[songId];
  if (!songMeta) throw new Error(`no SONG_DISPLAY entry for ${songId}`);
  const mm = `measures ${parsed.startMeasure}–${parsed.endMeasure}`;

  const lcg = makeLcg(hashString(`${recordId}:para`));
  const i1 = lcgInt(lcg, PARAPHRASE_TEMPLATES.length);
  let i2 = lcgInt(lcg, PARAPHRASE_TEMPLATES.length - 1);
  if (i2 >= i1) i2++;
  const idx = k === 1 ? i1 : i2;

  return PARAPHRASE_TEMPLATES[idx](mm, songMeta.display, parsed.tail)
    .replace(/\s+/g, " ")
    .trim();
}
