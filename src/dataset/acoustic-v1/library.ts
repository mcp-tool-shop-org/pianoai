// ─── Publishable shelf: derived from library provenance blocks ───────────────
//
// Genre is not a criterion. A song is in this corpus iff isPublishableConfig
// says so. See docs/findings/library-provenance-audit.md.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { midiToSongEntry } from "../../songs/midi/ingest.js";
import { scanLibrary } from "../../songs/library.js";
import type { SongEntry } from "../../songs/types.js";
import type { Genre } from "../../songs/types.js";
import {
  allowlistById,
  isPublishableConfig,
} from "./allowlist.js";

export {
  allowlistById,
  allowlistRows,
  EXPECTED_PUBLISHABLE_IDS,
  FORBIDDEN_IDS,
  evidenceGaps,
  isPublishableConfig,
} from "./allowlist.js";

const LIBRARY_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..", "..", "..",
  "songs", "library",
);

let cached: SongEntry[] | null = null;

export function loadPublishableSongs(): SongEntry[] {
  if (cached) return cached;
  const entries = scanLibrary(LIBRARY_DIR);
  const songs: SongEntry[] = [];
  for (const e of entries) {
    if (!isPublishableConfig(e.config)) continue;
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
  return loadPublishableSongs().filter((s) => s.genre === genre).length;
}

export function allowlistRow(id: string) {
  return allowlistById().get(id);
}
