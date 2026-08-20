// ─── MCP Zod helpers (P9-001) ────────────────────────────────────────────────
//
// Invalid MCP params stay JSON-RPC -32602 (the SDK is correct). These helpers
// put field names, expected shapes, and one example in the Zod issue message
// so that -32602 is readable. They do not loosen types.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";
import { DIFFICULTIES, GENRES } from "./songs/types.js";

export function zSongId(description = "a library song id — try list_songs, e.g. 'fur-elise'") {
  return z
    .string({
      error: "must be a library song id (try list_songs, e.g. 'fur-elise')",
    })
    .describe(description);
}

export function zGenre(description = "Filter by genre") {
  return z
    .enum(GENRES as unknown as [string, ...string[]], {
      error: `must be one of: ${GENRES.join(", ")}`,
    })
    .describe(description);
}

export function zDifficulty(description = "Filter by difficulty") {
  return z
    .enum(DIFFICULTIES as unknown as [string, ...string[]], {
      error: `must be one of: ${DIFFICULTIES.join(", ")}`,
    })
    .describe(description);
}

export function zMidiNotes() {
  return z
    .array(
      z.number({ error: "each note must be a MIDI integer 0–127" }).int().min(0).max(127),
      { error: "notes must be an array of MIDI numbers, e.g. [60, 64, 67] for a C major triad" },
    )
    .min(1)
    .max(64)
    .describe("MIDI note numbers currently sounding, e.g. [60, 64, 67] for a C major triad");
}

export function zMeasure(description = "Measure number (1-based)") {
  return z
    .number({ error: "must be a 1-based measure number, e.g. 1" })
    .int()
    .min(1)
    .describe(description);
}
