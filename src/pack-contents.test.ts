// P9-003: the published tarball must not ship dogfood-swarm paper trail.
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

interface PackFile {
  path?: string;
  filename?: string;
}

function packedPaths(stdout: string): string[] {
  const parsed = JSON.parse(stdout) as unknown;
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const files = (entries[0] as { files?: PackFile[] } | undefined)?.files ?? [];
  return files.map((f) => String(f.path ?? f.filename ?? "")).filter(Boolean);
}

describe("npm pack contents (P9-003)", () => {
  it(
    "does not ship dogfood-swarm kickoffs, dispatch notes, or docs/assets Pages art",
    () => {
      const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
        cwd: REPO_ROOT,
        encoding: "utf8",
        timeout: 120000,
        shell: true,
      });
      expect(result.status, result.stderr || result.stdout).toBe(0);
      const paths = packedPaths(result.stdout);
      expect(paths.length).toBeGreaterThan(10);
      const swarm = paths.filter((p) => /dogfood-swarm/i.test(p) || /-kickoff\.md$/i.test(p) || /dispatch/i.test(p));
      expect(swarm).toEqual([]);
      expect(paths.some((p) => p.replace(/\\/g, "/").startsWith("docs/assets/"))).toBe(false);
      expect(paths.some((p) => p.replace(/\\/g, "/").endsWith("docs/.nojekyll"))).toBe(false);
      expect(paths.some((p) => p.replace(/\\/g, "/").includes("compose-panel-app-design-prompt"))).toBe(false);
    },
    120000,
  );
});
