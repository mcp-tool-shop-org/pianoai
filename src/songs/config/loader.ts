// ─── Song Config Loader ──────────────────────────────────────────────────────
//
// Reads .json files from a config directory, validates each with Zod,
// and returns typed SongConfig objects.
// ─────────────────────────────────────────────────────────────────────────────

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename, resolve, relative, isAbsolute } from "node:path";
import { SongConfigSchema, type SongConfig } from "./schema.js";

function sanitizeConfigId(id: string): string {
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(id) || id.includes("..") || id.includes("/") || id.includes("\\") ) {
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
    const raw = JSON.parse(readFileSync(filePath, "utf8"));
    const result = SongConfigSchema.safeParse(raw);

    if (!result.success) {
      const issues = result.error.issues
        .map(i => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`Invalid config ${file}:\n${issues}`);
    }

    configs.push(result.data);
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
