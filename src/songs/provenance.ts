// ─── Provenance Evidence ─────────────────────────────────────────────────────
//
// The mechanical half of the library provenance audit: what a MIDI file says
// about itself, reduced to a deterministic snapshot that a JSON `provenance`
// block records and src/songs/provenance.test.ts re-derives. The judgment
// half (title_verdict, credited parties, licence) lives in the block itself,
// written by scripts/provenance-audit.ts; the snapshot binds that judgment to
// the bytes it was made about, so a swapped .mid fails the test.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { readMidiTextMeta, type MidiMetaSummary, type MidiTextMeta } from "./midi/meta.js";

/**
 * A credit-class event names who made the arrangement (or claims rights in
 * it). FF 02 copyright notices always qualify; text/track-name events qualify
 * when they carry one of these phrases. Rights statements without a party
 * ("All rights reserved") are deliberately not here — the party is named in
 * the copyright event that accompanies them.
 */
export const CREDIT_PATTERN =
  /©|\(c\)|copyright|sequenced\b|sequence by|sequence per|arranged by|arrangement by|typeset|creator:|karaoked by|kar by|transcribed|edited by|\bseq\.\s|\bby:\s|by registered user/i;

/** Karaoke syllables ("\\What", "/with") and one- or two-character fragments carry no identity. */
const NOISE_PATTERN = /^[\\/]|^.{0,2}$/;

/** How many neighbouring events on each side a credit event may name its party in. */
export const CREDIT_WINDOW = 3;

export const TITLE_EVENT_CAP = 40;
export const LYRIC_HEAD_CHARS = 160;

export interface ProvenanceEvidence {
  sha256: string;
  /** Deduplicated non-credit text events, file order, capped at TITLE_EVENT_CAP. */
  titleEvents: string[];
  /** Deduplicated credit-class events, file order. */
  creditEvents: string[];
  /** Each credit event with its ±CREDIT_WINDOW neighbours joined — where the party must appear. */
  creditWindows: string[];
  /** All non-lyric text joined, for "does this party appear in the file" checks. */
  allText: string;
  /** First LYRIC_HEAD_CHARS of the lyric track, or undefined when there is none. */
  lyricHead?: string;
}

export function isCreditEvent(ev: MidiTextMeta): boolean {
  return ev.type === "copyrightNotice" || CREDIT_PATTERN.test(ev.text);
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}

export function evidenceFromSummary(summary: MidiMetaSummary, sha256: string): ProvenanceEvidence {
  const events = summary.events;
  const creditIdx = events.map((e, i) => (isCreditEvent(e) ? i : -1)).filter((i) => i >= 0);
  const creditWindows = creditIdx.map((i) =>
    events
      .slice(Math.max(0, i - CREDIT_WINDOW), i + CREDIT_WINDOW + 1)
      .map((e) => e.text)
      .join(" | "),
  );
  const titleEvents = dedupe(
    events.filter((e) => !isCreditEvent(e) && !NOISE_PATTERN.test(e.text)).map((e) => e.text),
  ).slice(0, TITLE_EVENT_CAP);
  return {
    sha256,
    titleEvents,
    creditEvents: dedupe(creditIdx.map((i) => events[i].text)),
    creditWindows,
    allText: events.map((e) => e.text).join(" | "),
    lyricHead: summary.lyricHead ? summary.lyricHead.slice(0, LYRIC_HEAD_CHARS) : undefined,
  };
}

/** Read a MIDI file's bytes into the evidence snapshot the provenance block records. */
export function readProvenanceEvidence(bytes: Uint8Array): ProvenanceEvidence {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return evidenceFromSummary(readMidiTextMeta(bytes), sha256);
}

// ─── Title overlap ───────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "the", "and", "for", "you", "from", "with", "major", "minor", "piano", "theme", "song",
  "suite", "movement", "traditional", "classic", "standard", "vocal", "ballad", "film",
  "rock", "pop", "jazz", "blues", "soul", "rnb", "latin", "folk", "ragtime", "new", "age",
  "track", "midi", "demo", "untitled", "tempo", "control", "staff", "words",
]);

/** Strip combining diacritics after NFD normalisation (U+0300–U+036F). */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Lowercase, strip diacritics, split on non-alphanumerics, drop short/stop tokens, singularise. */
export function significantTokens(text: string): string[] {
  return fold(text)
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter((t) => !STOP_WORDS.has(t))
    .map((t) => (t.length > 4 && t.endsWith("s") ? t.slice(0, -1) : t))
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function tokensAgree(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 5 && longer.startsWith(shorter);
}

/**
 * True when any of the file's title-class events (or its lyric head) shares a
 * significant token with the song's own title or an audit-supplied alias.
 * Composer and tags are deliberately not consulted: a file that says only
 * "Beethoven" identifies the composer, not the piece, and "string-arrangement"
 * would match a STRINGS track name.
 * This is the positive check a `matches` verdict must pass; it cannot decide
 * `contradicts` — that is the audit's judgment, bound to the bytes by sha256.
 */
export function titleOverlaps(
  song: { title: string; aliases?: string[] },
  evidence: { titleEvents: string[]; lyricHead?: string },
): boolean {
  const mine = significantTokens(
    [song.title, ...(song.aliases ?? [])].join(" "),
  );
  const theirs = significantTokens([...evidence.titleEvents, evidence.lyricHead ?? ""].join(" "));
  return theirs.some((t) => mine.some((m) => tokensAgree(t, m)));
}

/** Case- and diacritic-insensitive "does this name appear in this text". */
export function textNames(text: string, name: string): boolean {
  return fold(text).replace(/\s+/g, " ").includes(fold(name).replace(/\s+/g, " "));
}
