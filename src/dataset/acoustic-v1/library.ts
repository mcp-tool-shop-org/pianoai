// ─── Publishable shelf: classical, ragtime, folk ─────────────────────────────
//
// Licence, not capability, caps the published genres. Copyrighted library
// songs stay out of this tree. clair-de-lune is excluded: it is the
// jam-actions-v0 fine-tune holdout.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { midiToSongEntry } from "../../songs/midi/ingest.js";
import { scanLibrary } from "../../songs/library.js";
import type { SongEntry } from "../../songs/types.js";
import type { Genre } from "../../songs/types.js";

const LIBRARY_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..",
  "songs", "library",
);

export const PUBLISHABLE_GENRES: readonly Genre[] = ["classical", "ragtime", "folk"];
// Excluded from anything publishable, each for its own reason:
//
//   clair-de-lune            the jam-actions-v0 fine-tune holdout.
//   satie-gymnopedie-no1     arrangement provenance could not be verified in
//   debussy-arabesque-no1    the Slice 2.5 audit. Both are present in the v0
//                            WORKING corpus and excluded from the published
//                            subset -- see datasets/jam-actions-v0/PROVENANCE-NOTE.md.
//
// That last pair is the whole point of this list. This tree's own note calls it
// the publishable subset "following the jam-actions-v0 / jam-actions-v0-public
// split", and the first build of it did the opposite of what that split did for
// these two works: 7 records each, headed for publication, carrying provenance
// the studio has already audited and rejected once.
const FORBIDDEN_IDS = new Set([
  "clair-de-lune",
  "satie-gymnopedie-no1",
  "debussy-arabesque-no1",
]);

let cached: SongEntry[] | null = null;

export function loadPublishableSongs(): SongEntry[] {
  if (cached) return cached;
  const entries = scanLibrary(LIBRARY_DIR);
  const songs: SongEntry[] = [];
  for (const e of entries) {
    if (!PUBLISHABLE_GENRES.includes(e.genre)) continue;
    if (FORBIDDEN_IDS.has(e.config.id)) continue;
    if (e.config.status !== "ready") continue;
    if (!existsSync(e.midiPath)) continue;
    const buf = readFileSync(e.midiPath);
    songs.push(midiToSongEntry(new Uint8Array(buf), e.config));
  }
  songs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  cached = songs;
  return songs;
}

export function catalogReadyCount(genre: Genre): number {
  return scanLibrary(LIBRARY_DIR).filter(
    (e) => e.genre === genre && e.config.status === "ready" && !FORBIDDEN_IDS.has(e.config.id),
  ).length;
}
