// One directory for everything the process writes: journal, server state,
// user songs, guitar/piano voice tunings, and fetched library MIDI.
//
// Default: ~/.ai-jam-sessions (same as before).
// Override: AI_JAM_HOME must be an absolute path; created on first use.

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

export function stateHome(): string {
  const env = process.env.AI_JAM_HOME;
  let dir: string;
  if (env !== undefined && env !== "") {
    if (!isAbsolute(env)) {
      throw new Error(`AI_JAM_HOME must be an absolute path (got ${JSON.stringify(env)})`);
    }
    dir = env;
  } else {
    const home = homedir() || process.env.HOME || process.env.USERPROFILE || ".";
    dir = join(home, ".ai-jam-sessions");
  }
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function journalDir(): string {
  return join(stateHome(), "journal");
}

export function userSongsDir(): string {
  return join(stateHome(), "songs");
}

export function serverStatePath(): string {
  return join(stateHome(), "server-state.json");
}

export function guitarVoicesDir(): string {
  return join(stateHome(), "guitars");
}

export function pianoVoicesDir(): string {
  return join(stateHome(), "voices");
}

export function fetchedLibraryDir(): string {
  return join(stateHome(), "songs", "library");
}
