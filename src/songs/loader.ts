// ─── Song Loader ────────────────────────────────────────────────────────────
//
// Loads SongEntry objects from JSON files at runtime.
// Two directories: builtin (ships with package) + user (~/.pianoai/songs/).
// No compilation needed to add songs — just drop a .json file.
// ─────────────────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import type { SongEntry } from "./types.js";
import { validateSong, registerSong, clearRegistry } from "./registry.js";

/** Validate that a song ID is safe for use in file paths. */
function sanitizeSongId(id: string): string {
  // Only allow kebab-case identifiers — no path separators, dots, or traversal
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(id) && !/^[a-z0-9]$/.test(id)) {
    throw new Error(`Invalid song ID: "${id}". Must be kebab-case (a-z, 0-9, hyphens).`);
  }
  if (id.includes("..") || id.includes("/") || id.includes("\\")) {
    throw new Error(`Invalid song ID: "${id}". Path separators not allowed.`);
  }
  return id;
}

/**
 * Load all .json song files from a directory.
 * Validates each file and returns valid SongEntry objects.
 * Skips (with warning) any files that fail validation.
 */
export function loadSongsFromDir(dir: string): SongEntry[] {
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter(f => f.endsWith(".json"));
  const songs: SongEntry[] = [];

  for (const file of files) {
    try {
      const song = loadSongFile(join(dir, file));
      songs.push(song);
    } catch (err) {
      console.error(`  SKIP ${file}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return songs;
}

/**
 * Load a single song from a JSON file.
 * Validates the parsed object and returns a typed SongEntry.
 */
export function loadSongFile(filePath: string): SongEntry {
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  const errors = validateSong(raw as SongEntry);
  if (errors.length > 0) {
    throw new Error(`Invalid song in ${basename(filePath)}:\n  - ${errors.join("\n  - ")}`);
  }
  return raw as SongEntry;
}

/**
 * Save a SongEntry as a JSON file in the given directory.
 * Creates the directory if it doesn't exist.
 * Returns the full path to the saved file.
 */
export function saveSong(song: SongEntry, dir: string): string {
  const safeId = sanitizeSongId(song.id);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const filePath = join(dir, `${safeId}.json`);
  // Verify the resolved path stays within the target directory
  const resolvedDir = resolve(dir);
  const resolvedFile = resolve(filePath);
  if (!resolvedFile.startsWith(resolvedDir)) {
    throw new Error(`Path traversal detected: song ID "${song.id}" resolves outside target directory.`);
  }
  writeFileSync(filePath, JSON.stringify(song, null, 2) + "\n", "utf8");
  return filePath;
}

/**
 * Initialize the song registry from builtin and optional user directories.
 * Clears any existing registry entries first.
 *
 * @param builtinDir - Path to the builtin songs directory (ships with package)
 * @param userDir - Optional path to user songs directory (default: ~/.pianoai/songs/)
 */
export function initializeRegistry(builtinDir: string, userDir?: string): void {
  clearRegistry();

  // Load builtin songs
  const builtinSongs = loadSongsFromDir(builtinDir);
  for (const song of builtinSongs) {
    try {
      registerSong(song);
    } catch (err) {
      console.error(`  SKIP builtin ${song.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Load user songs (if directory exists)
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

  const total = builtinSongs.length + (userDir ? loadSongsFromDir(userDir).length : 0);
  console.error(`Song registry initialized: ${builtinSongs.length} builtin songs loaded`);
}
