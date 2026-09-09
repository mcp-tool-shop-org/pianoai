// Fetch withheld library MIDI from each song's recorded source.
//
// The npm tarball ships a song's .json (the studio's annotations and its provenance
// block) for every song, but the .mid only where the provenance block records a
// redistributable licence (scripts/npm-ship-list.ts). For the rest, the user fetches
// the file from the source the provenance names — under that source's own terms,
// which are printed first — and the download is checked against the SHA-256 the
// audit recorded, so what lands is the file the annotations were written against.

import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { scanLibrary, type LibraryEntry } from "./library.js";

export interface SourceProvenance {
  source_url?: string;
  source_site?: string;
  arrangement_license?: string;
  terms_url?: string;
  terms_quote?: string;
  midi_sha256?: string;
}

export interface FetchCandidate {
  id: string;
  genre: string;
  midiPath: string;
  sourceUrl: string;
  licence: string;
  termsUrl: string;
  termsQuote: string;
  expectedSha256?: string;
}

export interface FetchOutcome {
  id: string;
  status: "fetched" | "sha-mismatch" | "http-error" | "no-source";
  detail: string;
}

/** Songs whose MIDI is absent and whose provenance names a source to fetch from. */
export function fetchCandidates(
  libraryDir: string,
  filter: { genre?: string; id?: string } = {},
): { candidates: FetchCandidate[]; noSource: string[] } {
  const candidates: FetchCandidate[] = [];
  const noSource: string[] = [];
  for (const entry of scanLibrary(libraryDir) as Array<LibraryEntry & { config: { provenance?: SourceProvenance } }>) {
    if (existsSync(entry.midiPath)) continue;
    if (filter.genre && entry.genre !== filter.genre) continue;
    if (filter.id && entry.config.id !== filter.id) continue;
    const p = entry.config.provenance;
    if (!p?.source_url) {
      noSource.push(entry.config.id);
      continue;
    }
    candidates.push({
      id: entry.config.id,
      genre: entry.genre,
      midiPath: entry.midiPath,
      sourceUrl: p.source_url,
      licence: p.arrangement_license ?? "unknown",
      termsUrl: p.terms_url ?? "",
      termsQuote: p.terms_quote ?? "",
      expectedSha256: p.midi_sha256,
    });
  }
  return { candidates, noSource };
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; bytes: Uint8Array }>;

export const defaultFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { headers: { "User-Agent": "ai-jam-sessions library fetch" } });
  const buf = new Uint8Array(await res.arrayBuffer());
  return { ok: res.ok, status: res.status, bytes: buf };
};

/**
 * Download one candidate to its midiPath. The file is written only when its
 * SHA-256 equals the one the provenance audit recorded; a different file from
 * the same URL is refused, because the annotations were verified against the
 * recorded bytes and a silent swap is exactly what the audit exists to prevent.
 */
export async function fetchOne(c: FetchCandidate, fetcher: Fetcher = defaultFetcher): Promise<FetchOutcome> {
  let res: Awaited<ReturnType<Fetcher>>;
  try {
    res = await fetcher(c.sourceUrl);
  } catch (err) {
    return { id: c.id, status: "http-error", detail: err instanceof Error ? err.message : String(err) };
  }
  if (!res.ok) return { id: c.id, status: "http-error", detail: `HTTP ${res.status} from ${c.sourceUrl}` };
  const got = sha256Hex(res.bytes);
  if (c.expectedSha256 && got !== c.expectedSha256) {
    return {
      id: c.id,
      status: "sha-mismatch",
      detail: `expected ${c.expectedSha256.slice(0, 12)}…, got ${got.slice(0, 12)}… — the source serves a different file now; not written`,
    };
  }
  writeFileSync(c.midiPath, res.bytes);
  return { id: c.id, status: "fetched", detail: `${res.bytes.length} bytes → ${c.midiPath}` };
}

/** The terms notice printed before any download; one block per distinct source site. */
export function termsNotice(candidates: FetchCandidate[]): string {
  const bySite = new Map<string, FetchCandidate>();
  for (const c of candidates) {
    const site = safeHost(c.sourceUrl);
    if (!bySite.has(site)) bySite.set(site, c);
  }
  const lines: string[] = [];
  for (const [site, c] of bySite) {
    const n = candidates.filter((x) => safeHost(x.sourceUrl) === site).length;
    lines.push(`  ${site} — ${n} file${n === 1 ? "" : "s"}; licence recorded as "${c.licence}"`);
    if (c.termsUrl) lines.push(`    terms: ${c.termsUrl}`);
    if (c.termsQuote) lines.push(`    "${c.termsQuote}"`);
  }
  return lines.join("\n");
}

export function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
