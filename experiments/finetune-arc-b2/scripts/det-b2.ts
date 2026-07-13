// ─── det-b2.ts — Finetune Arc B-2, deterministic helpers (extends v1) ────────
//
// P0-LOCK.md (B-2) §4/§5. Re-exports v1's LCG + string-hash + answerContains
// verbatim (the v1 det-util.ts is a pinned input, imported not forked), and
// adds the B-2 gold kinds the abstention corpus (C4) needs:
//
//   kind:"text"    — the answer must contain a prose-derivable fact substring
//                    (key/time-sig, measure range, composer/title) — the C4
//                    ANSWERABLE twins whose gold lives in the record fields.
//   kind:"abstain" — the answer must express a calibrated DECLINE (SQuAD-2.0
//                    style; the C4 unanswerable questions). Verified by a
//                    decline-phrase containment set; the generator authors the
//                    decline text, the gate confirms it actually declines and
//                    does NOT smuggle a guessed value.
//
// Byte-identical outputs for identical seeds; the double-build gate asserts
// corpus determinism over ALL components incl. C3/C4.
// ─────────────────────────────────────────────────────────────────────────────

import { answerContains as answerContainsV1 } from "../../finetune-arc-v1/scripts/det-util.js";

export { makeLcg, lcgInt, lcgShuffle, hashString } from "../../finetune-arc-v1/scripts/det-util.js";

/** B-2 gold spec — v1's four kinds plus text (substring) and abstain (decline). */
export type GoldSpecB2 =
  | { kind: "number"; value: number }
  | { kind: "note"; value: string }
  | { kind: "hand"; value: "right" | "left" }
  | { kind: "yesno"; value: boolean }
  | { kind: "text"; value: string }
  | { kind: "abstain" };

/**
 * Decline phrases the C4 abstention answers may use. The generator draws its
 * decline wording from this set so the gate's abstain matcher and the
 * generator share one vocabulary (no drift). Every phrase unambiguously
 * signals "the answer is not determinable from what's given" without naming a
 * specific pitch/hand/count value (a value would be a confabulation).
 */
export const DECLINE_PHRASES: readonly string[] = [
  "cannot be determined from",
  "can't be determined from",
  "isn't something the annotation can tell",
  "the annotation alone doesn't",
  "the annotation doesn't carry",
  "there's no way to know that from",
  "no way to answer that from",
  "not something this note list can answer",
  "the note list doesn't include",
  "this data doesn't include",
  "isn't in the data provided",
  "no such note appears",
  "no such event appears",
  "that note isn't in the passage",
  "the premise doesn't hold",
  "that isn't actually the case",
];

/**
 * Bare definitive-answer smuggles that must NOT appear inside a clean abstain
 * turn (a decline that also asserts "the answer is …" or "exactly N" is not a
 * clean abstention). Deliberately NARROW: a false-premise rejection legitimately
 * NAMES the absent note ("there's no F#5 here"), and a hand-missing decline
 * legitimately mentions "right hand or left hand" as the thing it CAN'T pick —
 * so note tokens and hand words are NOT flagged. The generator authors every
 * decline deterministically; this catches only a blatant answer-assertion slip.
 */
const CONFAB_MARKERS = /\bthe answer is\b|\bexactly \d+\b/i;

/**
 * Gold-value containment matcher for B-2 (superset of v1's answerContains).
 * numeric/note/hand/yesno delegate BYTE-IDENTICALLY to the pinned v1 matcher;
 * text is a case-insensitive substring; abstain requires a decline phrase and
 * forbids a blatant smuggled answer.
 */
export function answerContainsB2(answerText: string, gold: GoldSpecB2): boolean {
  switch (gold.kind) {
    case "number":
    case "note":
    case "hand":
    case "yesno":
      return answerContainsV1(answerText, gold);
    case "text":
      return answerText.toLowerCase().includes(gold.value.toLowerCase());
    case "abstain": {
      const lower = answerText.toLowerCase();
      const declines = DECLINE_PHRASES.some((p) => lower.includes(p));
      if (!declines) return false;
      // A clean abstention must not blatantly assert a definitive value.
      return !CONFAB_MARKERS.test(answerText);
    }
  }
}
