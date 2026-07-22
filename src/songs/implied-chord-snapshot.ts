// ─── Gate-2 helper: a deterministic library-wide inferChord snapshot ──────────
//
// `inferChord` is a library-wide engine (jam briefs, the E-R source-harmony
// baseline, the fidelity detector). Any change to its tie-break can shift
// EXISTING impliedChord labels — especially for inversions (bass ≠ root). This
// helper renders one stable, diffable line per measure of every song so a change
// can be snapshotted before/after and every shift adjudicated.
//
// Shared by scripts/implied-chord-snapshot.ts (writes the committed fixture) and
// src/songs/jam.regression.test.ts (asserts against it in CI) so the two can
// never drift on the line format.
// ─────────────────────────────────────────────────────────────────────────────

import type { SongEntry } from "./types.js";
import { inferChord } from "./jam.js";

/**
 * One line per measure, sorted by song id then measure number:
 *   `<songId>\tm<number>\t<leftHand>\t<impliedChord>`
 * Tabs separate the fields (a left-hand string may contain spaces but never a
 * tab), so a diff of the JSON shows exactly which measure's label changed.
 */
export function buildImpliedChordLines(songs: SongEntry[]): string[] {
  const lines: string[] = [];
  for (const song of [...songs].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const m of [...song.measures].sort((a, b) => a.number - b.number)) {
      const lh = (m.leftHand ?? "").trim();
      lines.push(`${song.id}\tm${m.number}\t${lh}\t${inferChord(lh)}`);
    }
  }
  return lines;
}
