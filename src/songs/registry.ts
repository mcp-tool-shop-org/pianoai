// ─── Song Registry ──────────────────────────────────────────────────────────
//
// Single source of truth for all songs loaded at runtime.
// Songs are loaded from JSON files (builtin + user directories).
// The registry provides validation, search, filtering, and stats.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  SongEntry,
  Genre,
  Difficulty,
  SearchOptions,
  RegistryStats,
} from "./types.js";
import { GENRES, DIFFICULTIES } from "./types.js";
import { MIN_TEMPO, MAX_TEMPO } from "./config/schema.js";

// ─── Internal state ─────────────────────────────────────────────────────────

const songs = new Map<string, SongEntry>();

// ─── Registration ───────────────────────────────────────────────────────────

/**
 * Register a song in the global registry.
 * Throws if the ID is already taken or validation fails.
 */
export function registerSong(song: SongEntry): void {
  const errors = validateSong(song);
  if (errors.length > 0) {
    throw new Error(
      `Invalid song "${song.id}":\n  - ${errors.join("\n  - ")}`
    );
  }
  if (songs.has(song.id)) {
    throw new Error(`Duplicate song ID: "${song.id}"`);
  }
  songs.set(song.id, song);
}

/**
 * Register multiple songs at once.
 */
export function registerSongs(entries: SongEntry[]): void {
  for (const song of entries) {
    registerSong(song);
  }
}

// ─── Validation ─────────────────────────────────────────────────────────────

/**
 * Validate a single song entry. Returns an array of error messages (empty = valid).
 */
export function validateSong(song: SongEntry): string[] {
  const errors: string[] = [];

  if (!song.id || typeof song.id !== "string") {
    errors.push("id is required and must be a non-empty string");
  } else if (!/^[a-z0-9-]+$/.test(song.id)) {
    errors.push("id must be kebab-case (lowercase alphanumeric + hyphens)");
  }

  if (!song.title || typeof song.title !== "string") {
    errors.push("title is required");
  }

  if (!GENRES.includes(song.genre as Genre)) {
    errors.push(`genre must be one of: ${GENRES.join(", ")}`);
  }

  if (!DIFFICULTIES.includes(song.difficulty as Difficulty)) {
    errors.push(`difficulty must be one of: ${DIFFICULTIES.join(", ")}`);
  }

  if (!song.key || typeof song.key !== "string") {
    errors.push("key signature is required");
  }

  if (typeof song.tempo !== "number" || song.tempo < MIN_TEMPO || song.tempo > MAX_TEMPO) {
    errors.push(`tempo must be a number between ${MIN_TEMPO} and ${MAX_TEMPO} BPM`);
  }

  if (!song.timeSignature || !/^\d+\/\d+$/.test(song.timeSignature)) {
    errors.push('timeSignature must be in "N/N" format');
  }

  if (
    typeof song.durationSeconds !== "number" ||
    song.durationSeconds <= 0
  ) {
    errors.push("durationSeconds must be a positive number");
  }

  // Musical language layer
  if (!song.musicalLanguage) {
    errors.push("musicalLanguage is required");
  } else {
    if (!song.musicalLanguage.description) {
      errors.push("musicalLanguage.description is required");
    }
    if (!song.musicalLanguage.structure) {
      errors.push("musicalLanguage.structure is required");
    }
    if (
      !Array.isArray(song.musicalLanguage.keyMoments) ||
      song.musicalLanguage.keyMoments.length === 0
    ) {
      errors.push("musicalLanguage.keyMoments must have at least one entry");
    }
    if (
      !Array.isArray(song.musicalLanguage.teachingGoals) ||
      song.musicalLanguage.teachingGoals.length === 0
    ) {
      errors.push("musicalLanguage.teachingGoals must have at least one entry");
    }
    if (!Array.isArray(song.musicalLanguage.styleTips)) {
      errors.push("musicalLanguage.styleTips must be an array");
    }
  }

  // Measures
  if (!Array.isArray(song.measures) || song.measures.length === 0) {
    errors.push("measures must be a non-empty array");
  } else if (song.measures.length > 2000) {
    errors.push(`measures array too large: ${song.measures.length} (max 2000)`);
  } else {
    for (let i = 0; i < song.measures.length; i++) {
      const m = song.measures[i];
      if (typeof m.number !== "number" || m.number !== i + 1) {
        errors.push(`measure[${i}].number should be ${i + 1}, got ${m.number}`);
      }
      if (!m.rightHand && !m.leftHand) {
        errors.push(`measure[${i}] must have at least rightHand or leftHand`);
      }
      // Bounds check on teaching note length
      if (m.teachingNote && m.teachingNote.length > 5000) {
        errors.push(`measure[${i}].teachingNote too long: ${m.teachingNote.length} chars (max 5000)`);
      }
    }
  }

  if (!Array.isArray(song.tags)) {
    errors.push("tags must be an array");
  }

  return errors;
}

/**
 * Validate the entire registry. Throws on first invalid song.
 */
export function validateRegistry(): void {
  const allSongs = getAllSongs();
  if (allSongs.length === 0) {
    throw new Error("Registry is empty — no songs registered");
  }
  console.error(`Registry valid: ${allSongs.length} songs across ${new Set(allSongs.map((s) => s.genre)).size} genres.`);
}

// ─── Lookup ─────────────────────────────────────────────────────────────────

/** Get a song by its unique ID. */
export function getSong(id: string): SongEntry | undefined {
  return songs.get(id);
}

/** Get all registered songs. */
export function getAllSongs(): SongEntry[] {
  return [...songs.values()];
}

/** Get all songs in a specific genre. */
export function getSongsByGenre(genre: Genre): SongEntry[] {
  return getAllSongs().filter((s) => s.genre === genre);
}

/** Get all songs at a specific difficulty level. */
export function getSongsByDifficulty(difficulty: Difficulty): SongEntry[] {
  return getAllSongs().filter((s) => s.difficulty === difficulty);
}

// ─── Search ─────────────────────────────────────────────────────────────────

/**
 * Search songs with flexible filtering.
 * The `query` field does a case-insensitive match against title, composer, tags,
 * and musicalLanguage.description.
 */
export function searchSongs(options: SearchOptions): SongEntry[] {
  let results = getAllSongs();

  if (options.genre) {
    results = results.filter((s) => s.genre === options.genre);
  }

  if (options.difficulty) {
    results = results.filter((s) => s.difficulty === options.difficulty);
  }

  if (options.tags && options.tags.length > 0) {
    const wanted = new Set(options.tags.map((t) => t.toLowerCase()));
    results = results.filter((s) =>
      s.tags.some((t) => wanted.has(t.toLowerCase()))
    );
  }

  if (options.maxDuration !== undefined) {
    results = results.filter((s) => s.durationSeconds <= options.maxDuration!);
  }

  if (options.minDuration !== undefined) {
    results = results.filter((s) => s.durationSeconds >= options.minDuration!);
  }

  if (options.key) {
    const k = options.key.toLowerCase();
    results = results.filter((s) => s.key.toLowerCase().includes(k));
  }

  if (options.composer) {
    const c = options.composer.toLowerCase();
    results = results.filter((s) => s.composer?.toLowerCase().includes(c) ?? false);
  }

  if (options.query) {
    const q = options.query.toLowerCase();
    results = results.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.composer?.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q)) ||
        s.musicalLanguage.description.toLowerCase().includes(q)
    );
  }

  return results;
}

// ─── Stats ──────────────────────────────────────────────────────────────────

/** Get summary statistics about the registry. */
export function getStats(): RegistryStats {
  const allSongs = getAllSongs();

  const byGenre = {} as Record<Genre, number>;
  for (const g of GENRES) byGenre[g] = 0;
  for (const s of allSongs) byGenre[s.genre]++;

  const byDifficulty = {} as Record<Difficulty, number>;
  for (const d of DIFFICULTIES) byDifficulty[d] = 0;
  for (const s of allSongs) byDifficulty[s.difficulty]++;

  const totalMeasures = allSongs.reduce(
    (sum, s) => sum + s.measures.length,
    0
  );

  return {
    totalSongs: allSongs.length,
    byGenre,
    byDifficulty,
    totalMeasures,
  };
}

// ─── Reset ──────────────────────────────────────────────────────────────────

/** Clear all registered songs. Used when reloading or in tests. */
export function clearRegistry(): void {
  songs.clear();
}
