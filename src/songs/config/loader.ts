// ─── Song Config Loader ──────────────────────────────────────────────────────
//
// Reads .json files from a config directory, validates each with Zod,
// and returns typed SongConfig objects.
// ─────────────────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename, resolve, relative, isAbsolute } from "node:path";
import { SongConfigSchema, SONG_ID_REGEX, type SongConfig } from "./schema.js";

function sanitizeConfigId(id: string): string {
  // Reuse the schema's own id regex (F-6acb6320) — the previous local
  // regex was looser (permitted consecutive hyphens like "a--b") than
  // SongConfigSchema.id's, so this could accept an id shape no valid
  // config could actually have. The path-traversal check below is kept
  // as independent defense-in-depth regardless of which regex is used.
  if (!SONG_ID_REGEX.test(id) || id.includes("..") || id.includes("/") || id.includes("\\") ) {
    throw new Error(`Invalid config ID: "${id}"`);
  }
  return id;
}

/**
 * Load and validate all song configs from a directory.
 */
export function loadSongConfigs(dir: string): SongConfig[] {
  if (!existsSync(dir)) {
    throw new Error(`Config directory not found: ${dir}`);
  }

  const files = readdirSync(dir).filter(f => f.endsWith(".json"));
  const configs: SongConfig[] = [];

  for (const file of files) {
    const filePath = join(dir, file);
    try {
      const raw = JSON.parse(readFileSync(filePath, "utf8"));
      const result = SongConfigSchema.safeParse(raw);

      if (!result.success) {
        const issues = result.error.issues
          .map(i => `  ${i.path.join(".")}: ${i.message}`)
          .join("\n");
        console.error(`  SKIP config ${file}:\n${issues}`);
        continue;
      }

      configs.push(result.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  SKIP config ${file}: ${msg}`);
    }
  }

  return configs;
}

/**
 * Load a single song config by ID from a directory.
 */
export function loadSongConfig(id: string, dir: string): SongConfig {
  const safeId = sanitizeConfigId(id);
  const resolvedDir = resolve(dir);
  const filePath = resolve(dir, `${safeId}.json`);
  const relativePath = relative(resolvedDir, filePath);

  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(`Config path escapes config directory: "${id}"`);
  }
  if (!existsSync(filePath)) {
    throw new Error(`Config not found: ${filePath}`);
  }

  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  return SongConfigSchema.parse(raw);
}

/**
 * List available config IDs (slugs) in a directory.
 */
export function listConfigIds(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => basename(f, ".json"));
}
