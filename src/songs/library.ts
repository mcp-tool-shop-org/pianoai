// ─── Library Manager ──────────────────────────────────────────────────────────
//
// Orchestrates the MIDI-first song library: scans genre directories for
// config+MIDI pairs, tracks annotation status, and initializes the registry
// with only "ready" songs.
//
// Directory layout:
//   songs/library/<genre>/<id>.mid   — raw MIDI file (the sheet music)
//   songs/library/<genre>/<id>.json  — SongConfig with status field
// ─────────────────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { GENRES, type Genre, type SongEntry } from "./types.js";
import {
  SongConfigSchema,
  SONG_STATUSES,
  type SongConfig,
  type SongStatus,
} from "./config/schema.js";
import { midiToSongEntry } from "./midi/ingest.js";
import { registerSong, clearRegistry } from "./registry.js";
import { loadSongsFromDir } from "./loader.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LibraryEntry {
  config: SongConfig;
  genre: Genre;
  midiPath: string;
  configPath: string;
}

export interface GenreProgress {
  total: number;
  raw: number;
  annotated: number;
  ready: number;
  songs: Array<{ id: string; title: string; status: SongStatus }>;
}

export interface LibraryProgress {
  total: number;
  raw: number;
  annotated: number;
  ready: number;
  byGenre: Partial<Record<Genre, GenreProgress>>;
}

// ─── Scan ────────────────────────────────────────────────────────────────────

/**
 * Scan the library directory for all config files across all genres.
 * Returns entries with their associated MIDI path (which may not exist yet).
 */
export function scanLibrary(libraryDir: string): LibraryEntry[] {
  const entries: LibraryEntry[] = [];

  for (const genre of GENRES) {
    const genreDir = join(libraryDir, genre);
    if (!existsSync(genreDir)) continue;

    const files = readdirSync(genreDir).filter(f => f.endsWith(".json"));
    for (const file of files) {
      const configPath = join(genreDir, file);
      const id = basename(file, ".json");
      const midiPath = join(genreDir, `${id}.mid`);

      try {
        const raw = JSON.parse(readFileSync(configPath, "utf8"));
        const result = SongConfigSchema.safeParse(raw);
        if (result.success) {
          entries.push({
            config: result.data,
            genre: genre as Genre,
            midiPath,
            configPath,
          });
        } else {
          console.error(`  SKIP ${genre}/${file}: ${result.error.issues[0]?.message}`);
        }
      } catch (err) {
        console.error(`  SKIP ${genre}/${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return entries;
}

// ─── Progress ────────────────────────────────────────────────────────────────

/**
 * Get annotation progress for the entire library.
 */
export function getLibraryProgress(libraryDir: string): LibraryProgress {
  const entries = scanLibrary(libraryDir);

  const progress: LibraryProgress = {
    total: entries.length,
    raw: 0,
    annotated: 0,
    ready: 0,
    byGenre: {},
  };

  // Group by genre
  const byGenre = new Map<Genre, LibraryEntry[]>();
  for (const entry of entries) {
    const list = byGenre.get(entry.genre) ?? [];
    list.push(entry);
    byGenre.set(entry.genre, list);
  }

  for (const [genre, genreEntries] of byGenre) {
    const gp: GenreProgress = {
      total: genreEntries.length,
      raw: 0,
      annotated: 0,
      ready: 0,
      songs: [],
    };

    for (const entry of genreEntries) {
      const status = entry.config.status ?? "raw";
      gp[status]++;
      progress[status]++;
      gp.songs.push({
        id: entry.config.id,
        title: entry.config.title,
        status,
      });
    }

    // Sort songs by status (ready first, then annotated, then raw)
    const order: Record<SongStatus, number> = { ready: 0, annotated: 1, raw: 2 };
    gp.songs.sort((a, b) => order[a.status] - order[b.status]);

    progress.byGenre[genre] = gp;
  }

  return progress;
}

// ─── Ingest ──────────────────────────────────────────────────────────────────

/**
 * Ingest a single MIDI+config pair into a SongEntry.
 * The MIDI file must exist. Config must have status "ready".
 */
export function ingestSong(entry: LibraryEntry): SongEntry {
  if (entry.config.status !== "ready") {
    throw new Error(`Song "${entry.config.id}" is not ready (status: ${entry.config.status})`);
  }
  if (!existsSync(entry.midiPath)) {
    throw new Error(`MIDI file not found: ${entry.midiPath}`);
  }

  const midiBuffer = new Uint8Array(readFileSync(entry.midiPath));
  return midiToSongEntry(midiBuffer, entry.config);
}

// ─── Initialize ──────────────────────────────────────────────────────────────

/**
 * Initialize the song registry from the library directory.
 * Only "ready" songs with existing MIDI files are loaded.
 * User songs from ~/.ai-jam-sessions/songs/ are also loaded.
 */
export function initializeFromLibrary(libraryDir: string, userDir?: string): void {
  clearRegistry();

  if (existsSync(libraryDir)) {
    const entries = scanLibrary(libraryDir);
    const ready = entries.filter(e => e.config.status === "ready" && existsSync(e.midiPath));

    let loaded = 0;
    for (const entry of ready) {
      try {
        const song = ingestSong(entry);
        registerSong(song);
        loaded++;
      } catch (err) {
        console.error(`  SKIP ${entry.config.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    console.error(`Song library initialized: ${loaded} ready songs loaded (${entries.length} total in library)`);
  } else {
    console.error(`Song library not found at ${libraryDir}`);
  }

  // Also load user songs (plain SongEntry JSONs)
  if (userDir) {
    const userSongs = loadSongsFromDir(userDir);
    for (const song of userSongs) {
      try {
        registerSong(song);
      } catch (err) {
        console.error(`  SKIP user ${song.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}
