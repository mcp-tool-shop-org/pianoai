// ─── Resolve the Accurate-Salamander directory ──────────────────────────────
//
// Samples are NOT shipped in the npm tarball. A local checkout (or
// AI_JAM_SAMPLES_DIR) can point at an installed pack. When present, play_song
// / CLI default to the sample engine; otherwise they keep the oscillator
// piano.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SFZ_REL = join("sfz_minimum", "Accurate-SalamanderGrandPiano_flat.Recommended.sfz");

export function looksLikeSalamanderDir(dir: string): boolean {
  return existsSync(join(dir, SFZ_REL));
}

export function resolvePianoSamplesDir(): string | null {
  const env = process.env.AI_JAM_SAMPLES_DIR;
  if (env && looksLikeSalamanderDir(env)) return env;
  const here = dirname(fileURLToPath(import.meta.url));
  const bundled = join(here, "..", "samples", "AccurateSalamander");
  if (looksLikeSalamanderDir(bundled)) return bundled;
  return null;
}

/** Engine id to use when the caller omitted `engine`. */
export function preferredPianoEngineId(): "sample" | "piano" {
  return resolvePianoSamplesDir() ? "sample" : "piano";
}
