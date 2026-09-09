// The npm tarball may carry a song's MIDI only where its provenance block records a
// redistributable licence. songs/library/.npmignore is generated from those blocks
// (scripts/npm-ship-list.ts); this test fails when the file is stale, when a withheld
// entry has a redistributable licence, or when a shipped .mid has none.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { shipRows, renderNpmignore, REDISTRIBUTABLE, LIBRARY_DIR, NPMIGNORE } from "../../scripts/npm-ship-list.js";

describe("npm ship list", () => {
  const rows = shipRows();

  it("songs/library/.npmignore is exactly what the provenance blocks generate", () => {
    expect(existsSync(NPMIGNORE)).toBe(true);
    expect(readFileSync(NPMIGNORE, "utf8")).toBe(renderNpmignore(rows));
  });

  it("every shipped .mid has a redistributable licence; every withheld one does not", () => {
    for (const r of rows) {
      const mid = join(LIBRARY_DIR, r.genre, `${r.id}.mid`);
      if (r.ships) {
        expect(REDISTRIBUTABLE.has(r.licence), `${r.id} ships with ${r.licence}`).toBe(true);
        expect(existsSync(mid), `${r.id} ships but has no .mid in the tree`).toBe(true);
      } else {
        expect(REDISTRIBUTABLE.has(r.licence), `${r.id} withheld with ${r.licence}`).toBe(false);
      }
    }
  });

  it("withholds the majority of the library and ships at least the verified fourteen", () => {
    const shipped = rows.filter((r) => r.ships).length;
    expect(shipped).toBeGreaterThanOrEqual(14);
    expect(rows.length - shipped).toBeGreaterThan(shipped);
  });

  it("no provenance block is missing", () => {
    expect(rows.filter((r) => r.licence === "MISSING").map((r) => r.id)).toEqual([]);
  });
});
