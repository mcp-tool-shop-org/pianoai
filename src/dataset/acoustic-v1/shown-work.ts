// ─── Shown-work assistant turns for harmony and compare (chunk 34) ───────────
//
// Same contract as the acoustic arithmetic line: the tool carries the measured
// quantities; the assistant copies them, shows the comparison, then the label.
// The predicates decide the label. The arithmetic is shown, not trusted.

import {
  chordSymbolsEquivalent,
  DEFAULT_MAX_CHROMATIC_RATIO,
} from "../../maker/verify-harmony.js";

const MINUS = "\u2212";

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function fmt3(n: number): string {
  return n.toFixed(3);
}

function fmtSigned3(n: number): string {
  const body = Math.abs(n).toFixed(3);
  return n < 0 ? `${MINUS}${body}` : body;
}

function parseNum(s: string): number {
  return Number(s.replace(/\u2212/g, "-"));
}

/** Chromatic ratio from printed counts. 0 when nothing was scored. */
export function chromaticRatioOf(chromatic: number, scored: number): number {
  return scored > 0 ? chromatic / scored : 0;
}

export function fidelitySame(intended: string, detected: string): boolean {
  return chordSymbolsEquivalent(intended, detected);
}

export function consonanceInside(chromatic: number, scored: number): boolean {
  return chromaticRatioOf(chromatic, scored) <= DEFAULT_MAX_CHROMATIC_RATIO;
}

export function harmonyGoldFromPrinted(
  intended: string,
  detected: string,
  chromatic: number,
  scored: number,
): "verified" | "rejected" {
  return fidelitySame(intended, detected) && consonanceInside(chromatic, scored)
    ? "verified"
    : "rejected";
}

export function compareGoldFromPrinted(keyA: string, keyB: string): "same_key" | "different_key" {
  return keyA === keyB ? "same_key" : "different_key";
}

export function harmonyAssistantLine(
  intended: string,
  detected: string,
  chromatic: number,
  scored: number,
  gold: string,
): string {
  const ratio = round3(chromaticRatioOf(chromatic, scored));
  const delta = round3(ratio - DEFAULT_MAX_CHROMATIC_RATIO);
  const fidWord = fidelitySame(intended, detected) ? "same" : "different";
  const consWord = consonanceInside(chromatic, scored) ? "inside" : "against";
  return `intended ${intended}, detected ${detected}: ${fidWord}; chromatic ${chromatic}/${scored} = ${fmt3(ratio)} ${MINUS} 0.2 = ${fmtSigned3(delta)}, ${consWord}: ${gold}`;
}

export function compareAssistantLine(keyA: string, keyB: string, gold: string): string {
  const word = keyA === keyB ? "same" : "different";
  return `${keyA}, ${keyB}: ${word}: ${gold}`;
}

export function harmonyAssistantContent(
  intended: string,
  detected: string,
  chromatic: number,
  scored: number,
  gold: string,
  bare = false,
): string {
  if (bare) return gold;
  return harmonyAssistantLine(intended, detected, chromatic, scored, gold);
}

export function compareAssistantContent(keyA: string, keyB: string, gold: string, bare = false): string {
  if (bare) return gold;
  return compareAssistantLine(keyA, keyB, gold);
}

export function parseHarmonyAssistant(line: string): {
  intended: string;
  detected: string;
  fidWord: string;
  chromatic: number;
  scored: number;
  ratio: number;
  delta: number;
  consWord: string;
  label: string;
} | null {
  const m = line.match(
    /^intended (.+), detected (.+): (same|different); chromatic (\d+)\/(\d+) = (\d+\.\d{3}) [-\u2212] 0\.2 = ([\u2212-]?\d+\.\d{3}), (inside|against): (verified|rejected)$/,
  );
  if (!m) return null;
  return {
    intended: m[1]!,
    detected: m[2]!,
    fidWord: m[3]!,
    chromatic: Number(m[4]),
    scored: Number(m[5]),
    ratio: parseNum(m[6]!),
    delta: parseNum(m[7]!),
    consWord: m[8]!,
    label: m[9]!,
  };
}

export function parseCompareAssistant(line: string): {
  keyA: string;
  keyB: string;
  word: string;
  label: string;
} | null {
  const m = line.match(/^(.+?), (.+): (same|different): (same_key|different_key)$/);
  if (!m) return null;
  return { keyA: m[1]!, keyB: m[2]!, word: m[3]!, label: m[4]! };
}
