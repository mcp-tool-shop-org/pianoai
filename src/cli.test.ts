// ─── cli.test.ts ────────────────────────────────────────────────────────────
//
// cli.ts had zero test coverage before this file (Tier-1 gap). Two layers:
//
//   1. Pure parser unit tests — parsePlaySessionFlags/parsePracticeArgs are
//      exported, no-I/O functions (see cli.ts's own doc comments on them),
//      so they're imported and tested directly here. This only works
//      because cli.ts now guards its main()-invoking bottom line behind an
//      isMainModule check (see cli.ts's "Entry guard" section) — without
//      that guard, importing this module for its parser exports would ALSO
//      run main() against whatever argv the test runner itself was started
//      with (the same hazard mcp-server.test.ts's header comment documents
//      for mcp-server.ts, which has no such guard).
//
//   2. A few lightweight dispatch smoke tests — spawn the real CLI as a
//      child process (mirroring mcp-server.test.ts's own spawn pattern) and
//      check exit codes/stderr, to prove `practice` and `play`'s new flags
//      are ACTUALLY wired into main()'s switch, not just parseable in
//      isolation. Kept to pre-flight-validation-failure cases (bad args,
//      unknown song) specifically because those exit BEFORE cmdPlay/
//      cmdPractice ever touch the audio engine — fast and deterministic,
//      no real audio device needed.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, existsSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { parsePlaySessionFlags, parsePracticeArgs } from "./cli.js";

const CLI_PATH = fileURLToPath(new URL("./cli.ts", import.meta.url));
const REPO_ROOT = dirname(dirname(CLI_PATH)); // .../src/cli.ts -> .../src -> repo root

function runCli(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI_PATH, ...args], {
    encoding: "utf8",
    timeout: 20000,
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

// ─── parsePlaySessionFlags ──────────────────────────────────────────────────

describe("parsePlaySessionFlags", () => {
  it("defaults to metronome/record off and countIn undefined when no flags are given", () => {
    expect(parsePlaySessionFlags([])).toEqual({ metronome: false, countIn: undefined, record: false });
  });

  it("recognizes --metronome as a boolean flag", () => {
    expect(parsePlaySessionFlags(["--metronome"]).metronome).toBe(true);
  });

  it("recognizes --record as a boolean flag", () => {
    expect(parsePlaySessionFlags(["--record"]).record).toBe(true);
  });

  it("parses --count-in <bars> as an integer", () => {
    expect(parsePlaySessionFlags(["--count-in", "2"]).countIn).toBe(2);
  });

  it("accepts --count-in 0 (0 = no count-in, still a valid non-negative integer)", () => {
    expect(parsePlaySessionFlags(["--count-in", "0"]).countIn).toBe(0);
  });

  it("combines all three flags independently", () => {
    expect(parsePlaySessionFlags(["--metronome", "--count-in", "4", "--record"])).toEqual({
      metronome: true,
      countIn: 4,
      record: true,
    });
  });

  it("throws a descriptive Error for a negative --count-in", () => {
    expect(() => parsePlaySessionFlags(["--count-in", "-1"])).toThrow(/count-in/i);
  });

  it("throws a descriptive Error for a non-numeric --count-in", () => {
    expect(() => parsePlaySessionFlags(["--count-in", "abc"])).toThrow(/count-in/i);
  });

  it("ignores unrelated flags", () => {
    expect(parsePlaySessionFlags(["--speed", "0.5", "--mode", "loop"])).toEqual({
      metronome: false,
      countIn: undefined,
      record: false,
    });
  });
});

// ─── parsePracticeArgs ──────────────────────────────────────────────────────

describe("parsePracticeArgs", () => {
  it("throws a usage Error when no song id is given", () => {
    expect(() => parsePracticeArgs([])).toThrow(/usage/i);
  });

  it("throws when --measures is missing", () => {
    expect(() => parsePracticeArgs(["fur-elise"])).toThrow(/--measures/);
  });

  it("parses a start-end measure range", () => {
    const parsed = parsePracticeArgs(["fur-elise", "--measures", "5-8"]);
    expect(parsed.songId).toBe("fur-elise");
    expect(parsed.startMeasure).toBe(5);
    expect(parsed.endMeasure).toBe(8);
  });

  it("a single measure number (no dash) sets start === end", () => {
    const parsed = parsePracticeArgs(["fur-elise", "--measures", "5"]);
    expect(parsed.startMeasure).toBe(5);
    expect(parsed.endMeasure).toBe(5);
  });

  it("throws on a non-numeric --measures range", () => {
    expect(() => parsePracticeArgs(["fur-elise", "--measures", "a-b"])).toThrow(/--measures/);
  });

  it("leaves optional speed/step/maxPasses undefined when omitted", () => {
    const parsed = parsePracticeArgs(["fur-elise", "--measures", "1-2"]);
    expect(parsed.speedStartPct).toBeUndefined();
    expect(parsed.speedTargetPct).toBeUndefined();
    expect(parsed.rampStepPct).toBeUndefined();
    expect(parsed.maxPasses).toBeUndefined();
  });

  it("parses --start-speed, --target, --step, and --max-passes", () => {
    const parsed = parsePracticeArgs([
      "fur-elise",
      "--measures",
      "1-2",
      "--start-speed",
      "60",
      "--target",
      "90",
      "--step",
      "10",
      "--max-passes",
      "5",
    ]);
    expect(parsed.speedStartPct).toBe(60);
    expect(parsed.speedTargetPct).toBe(90);
    expect(parsed.rampStepPct).toBe(10);
    expect(parsed.maxPasses).toBe(5);
  });

  it("throws a descriptive Error on a non-numeric --start-speed", () => {
    expect(() => parsePracticeArgs(["fur-elise", "--measures", "1-2", "--start-speed", "fast"])).toThrow(
      /--start-speed/
    );
  });

  it("throws a descriptive Error on a non-numeric --max-passes", () => {
    expect(() => parsePracticeArgs(["fur-elise", "--measures", "1-2", "--max-passes", "many"])).toThrow(
      /--max-passes/
    );
  });
});

// ─── Dispatch smoke tests (spawned subprocess — proves main()'s wiring) ────

describe("cli.ts — dispatch (spawned subprocess)", () => {
  it(
    "`practice` with no song id prints usage to stderr and exits 1",
    () => {
      const { status, stderr } = runCli(["practice"]);
      expect(status).toBe(1);
      expect(stderr).toMatch(/usage/i);
    },
    20000,
  );

  it(
    "`practice <unknown-song> --measures 1-2` exits 1 with a 'not found' message (proves dispatch reaches song lookup)",
    () => {
      const { status, stderr } = runCli(["practice", "not-a-real-song-xyz", "--measures", "1-2"]);
      expect(status).toBe(1);
      expect(stderr).toMatch(/not found/i);
    },
    20000,
  );

  it(
    "`practice fallin --measures 1-999999` exits 1 with an 'exceeds' message (proves dispatch reaches resolvePracticeLoopConfig, before any audio connect)",
    () => {
      const { status, stderr } = runCli(["practice", "fallin", "--measures", "1-999999"]);
      expect(status).toBe(1);
      expect(stderr).toMatch(/exceeds/i);
    },
    20000,
  );

  it(
    "`play <song> --count-in -1` exits 1 with an 'Invalid --count-in' message (proves the new flags are parsed before any audio connect)",
    () => {
      const { status, stderr } = runCli(["play", "fallin", "--count-in", "-1"]);
      expect(status).toBe(1);
      expect(stderr).toMatch(/count-in/i);
    },
    20000,
  );

  it(
    "`help` mentions the new `practice` command",
    () => {
      const { status, stdout } = runCli(["help"]);
      expect(status).toBe(0);
      expect(stdout).toMatch(/practice/);
    },
    20000,
  );
});

// ─── Entry guard — symlinked / built-artifact execution ────────────────────
//
// cli.ts's isMainModule check (see its "Entry guard" section) compares
// import.meta.url against pathToFileURL(process.argv[1]).href. Node
// realpath-resolves import.meta.url for the entry module, but does NOT
// realpath-resolve process.argv[1] — so invoking cli.ts through a symlink
// (exactly what an npm/pnpm global/local bin install produces on Unix:
// node_modules/.bin/ai-jam-sessions -> ../ai-jam-sessions/dist/cli.js) made
// the two strings never match: main() silently never ran, and the installed
// CLI printed nothing and exited 0. The fix realpath-resolves argv[1] before
// comparing (see cli.ts's resolveArgvMainPath).
describe("cli.ts — entry guard (symlinked / built-artifact execution)", () => {
  it.skipIf(process.platform === "win32")(
    "runs main() when invoked through a symlink to the tsx-runnable source, not just the real file path",
    () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "ajs-cli-symlink-test-"));
      const linkPath = join(tmpDir, "cli-link.ts");
      try {
        symlinkSync(CLI_PATH, linkPath);
        const result = spawnSync(process.execPath, ["--import", "tsx", linkPath, "--version"], {
          encoding: "utf8",
          timeout: 20000,
        });
        // Before the fix: isMainModule was false through this symlink, main()
        // never ran, nothing printed, exit 0 (indistinguishable from success
        // at a glance — the real symptom is silence, not an error).
        expect(result.status).toBe(0);
        expect(result.stdout ?? "").toMatch(/ai-jam-sessions v/);
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    },
    20000,
  );

  it(
    "`node dist/cli.js --version` prints a version after a real build (proves the entry guard on the BUILT artifact, not just tsx-run source; skipped if dist isn't built)",
    () => {
      const distCliPath = join(REPO_ROOT, "dist", "cli.js");
      if (!existsSync(distCliPath)) {
        // Not built in this environment (e.g. before `pnpm build` has ever
        // run) — the tsx-run smokes above already exercise the entry
        // guard's logic against the source directly.
        return;
      }
      const result = spawnSync(process.execPath, [distCliPath, "--version"], {
        encoding: "utf8",
        timeout: 20000,
      });
      expect(result.status).toBe(0);
      expect(result.stdout ?? "").toMatch(/ai-jam-sessions v/);
    },
    20000,
  );
});
