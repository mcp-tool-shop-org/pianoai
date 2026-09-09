import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { layersOrdered, rootsCoverPiano, type SalamanderManifest } from "../apps/cockpit/src/salamander-logic.js";

const PACK = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "cockpit", "public", "samples", "salamander");
const BUDGET = 10 * 1024 * 1024;

describe("salamander cockpit pack integrity", () => {
  it("manifest exists and every referenced file is on disk", () => {
    const manPath = join(PACK, "manifest.json");
    expect(existsSync(manPath), "run prune-salamander.ts first").toBe(true);
    const man = JSON.parse(readFileSync(manPath, "utf8")) as SalamanderManifest & { packBytes?: number; license?: string };
    expect(man.schemaVersion).toBe(1);
    expect(man.license).toMatch(/Creative Commons Attribution 3\.0/);
    expect(man.roots.length).toBe(30);
    expect(rootsCoverPiano(man.roots)).toBe(true);
    expect(layersOrdered(man.layers)).toBe(true);
    expect(man.files.length).toBe(man.roots.length * man.layers.length);
    let bytes = 0;
    for (const f of man.files) {
      const p = join(PACK, f.file);
      expect(existsSync(p), f.file).toBe(true);
      bytes += statSync(p).size;
    }
    expect(bytes).toBeLessThanOrEqual(BUDGET);
    if (typeof man.packBytes === "number") expect(man.packBytes).toBe(bytes);
  });
});
