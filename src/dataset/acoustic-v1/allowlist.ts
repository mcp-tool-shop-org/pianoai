// ─── Publishable-song allowlist, derived from library provenance ─────────────
//
// Genre is not a criterion. A song is in the corpus iff its JSON provenance
// block says so: licence in the closed set, title_verdict not a contradiction,
// and the id is not a v1 holdout. The typed 15-row table is gone — the
// library audit wrote the evidence (docs/findings/library-provenance-audit.md).

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scanLibrary } from "../../songs/library.js";
import type { SongConfig } from "../../songs/config/schema.js";
import type { Provenance as LibraryProvenance } from "../../songs/config/schema.js";

export const PUBLISHABLE_LICENCES = ["CC-BY-SA-3.0-DE", "Public-Domain"] as const;
export type PublishableLicence = (typeof PUBLISHABLE_LICENCES)[number];

/** v1 holdouts that are licence-clean but must not enter this corpus. */
export const FORBIDDEN_IDS = new Set([
  "clair-de-lune",
  "satie-gymnopedie-no1",
  "debussy-arabesque-no1",
]);

/** Locked expected set — a library change that adds or drops a song is a visible diff. */
export const EXPECTED_PUBLISHABLE_IDS = [
  "bach-prelude-c-major-bwv846",
  "bethena",
  "elite-syncopations",
  "fur-elise",
  "maple-leaf-rag",
  "mozart-k545-mvt1",
  "peacherine-rag",
  "pineapple-rag",
  "solace",
  "the-easy-winners",
  "the-entertainer",
] as const;

export interface AllowlistRow {
  id: string;
  downloadUrl: string;
  termsQuote: string;
  termsUrl: string;
  licence: PublishableLicence;
  arranger: string;
  auditDate: string;
  verifier: string;
}

const LIBRARY_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..",
  "songs", "library",
);

export function isPublishableLicence(s: string): s is PublishableLicence {
  return (PUBLISHABLE_LICENCES as readonly string[]).includes(s);
}

/** A song is publishable iff the library block says so and it is not a v1 holdout. */
export function isPublishableConfig(config: SongConfig): boolean {
  const p = config.provenance;
  if (!p) return false;
  if (FORBIDDEN_IDS.has(config.id)) return false;
  if (p.title_verdict === "contradicts") return false;
  return isPublishableLicence(p.arrangement_license);
}

export function rowFromProvenance(id: string, p: LibraryProvenance): AllowlistRow {
  if (!isPublishableLicence(p.arrangement_license)) {
    throw new Error(`${id}: arrangement_license ${p.arrangement_license} is not publishable`);
  }
  return {
    id,
    downloadUrl: p.source_url,
    termsQuote: p.terms_quote,
    termsUrl: p.terms_url,
    licence: p.arrangement_license,
    arranger: p.arrangement_creator,
    auditDate: p.verified_at,
    verifier: p.verifier,
  };
}

function deriveRows(): AllowlistRow[] {
  if (!existsSync(LIBRARY_DIR)) return [];
  const rows: AllowlistRow[] = [];
  for (const e of scanLibrary(LIBRARY_DIR)) {
    if (!isPublishableConfig(e.config)) continue;
    const p = e.config.provenance;
    if (!p) continue;
    rows.push(rowFromProvenance(e.config.id, p));
  }
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return rows;
}

let cached: AllowlistRow[] | null = null;

export function allowlistRows(): AllowlistRow[] {
  if (!cached) cached = deriveRows();
  return cached;
}

export function allowlistById(): ReadonlyMap<string, AllowlistRow> {
  return new Map(allowlistRows().map((r) => [r.id, r]));
}

export const EVIDENCE_KEYS = [
  "downloadUrl",
  "termsQuote",
  "termsUrl",
  "licence",
  "arranger",
  "auditDate",
] as const;

export function evidenceGaps(row: AllowlistRow): string[] {
  const gaps: string[] = [];
  for (const k of EVIDENCE_KEYS) {
    if (!row[k] || String(row[k]).trim() === "") gaps.push(k);
  }
  if (!isPublishableLicence(row.licence)) gaps.push(`licence:${row.licence}`);
  return gaps;
}

/** Fold umlauts and punctuation so "Für Elise" meets "Fur Elise". */
export function normalizeTitle(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ue/g, "u")
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const TITLE_NOISE = new Set([
  "piano", "right", "left", "control", "track", "staff", "upper", "lower",
  "up", "down", "rh", "lh", "pedale", "pedal", "fuga", "spur", "edition",
  "copyright", "http", "www", "creator", "gnu", "lilypond", "reset", "gs",
  "midi", "de", "va", "the", "and", "from", "in", "of", "no", "op", "major",
  "minor", "dur", "moll", "am", "auf", "pans", "standard", "satz", "movement",
  "traditional", "english", "scottish", "irish", "american", "japanese",
  "poco", "moto", "adagio", "allegro", "andante", "cantabile",
]);

function tokens(s: string): string[] {
  return normalizeTitle(s).split(" ").filter((t) => t.length > 1 && !TITLE_NOISE.has(t));
}

function looksLikePieceTitle(text: string): boolean {
  const n = normalizeTitle(text);
  if (!n) return false;
  if (/^(piano|control track|rh|lh|up|down|upper|lower|a piano \d+|gs reset|spur \d+)$/.test(n)) {
    return false;
  }
  if (/copyright|bernd|krueger|kruger|lilypond|piano-midi|http/.test(n)) return false;
  if (/fertiggestellt|normierung|update|dauer|minuten|veroffentlicht|edition|standard am|\d+[.:]\d+/.test(n)) {
    return false;
  }
  if (/^[0-9a-f]{32}$/.test(n.replace(/\s/g, ""))) return false;
  const t = tokens(text);
  return t.length >= 1 && t.some((x) => x.length >= 4 || /^\d{3,}$/.test(x));
}

function tokenOverlap(jsonish: Set<string>, midiTokens: string[]): boolean {
  return midiTokens.some((t) => {
    if (jsonish.has(t)) return true;
    if (t.length < 4) return false;
    const tFold = t.replace(/e/g, "");
    for (const x of jsonish) {
      if (x.length >= 4 && (x.includes(t) || t.includes(x))) return true;
      if (t.length >= 6 && x.length >= 6 && tFold === x.replace(/e/g, "")) return true;
    }
    return false;
  });
}

export function titleNamesDifferentPiece(jsonTitle: string, midiText: string, composer = ""): boolean {
  if (!looksLikePieceTitle(midiText)) return false;
  const a = new Set([...tokens(jsonTitle), ...tokens(composer)]);
  const b = tokens(midiText);
  if (a.size === 0 || b.length === 0) return false;
  return !tokenOverlap(a, b);
}

export function copyrightNamesForeignParty(copyright: string, arranger: string): boolean {
  const c = normalizeTitle(copyright);
  if (!c) return false;
  const allowed = tokens(arranger);
  if (allowed.length === 0) return true;
  return !allowed.some((t) => c.includes(t));
}
