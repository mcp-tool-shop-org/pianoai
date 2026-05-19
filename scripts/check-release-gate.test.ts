// ─── check-release-gate.test.ts (Slice 23.5 — CLI strictness) ───────────────
//
// Tests for scripts/check-release-gate.ts argument parsing. Slice 23.5 (audit
// Gap #2): the pre-Slice-23.5 CLI silently dropped positional arguments and
// ran against DEFAULT_BASELINE, causing a fresh-contributor trap where they
// thought they were checking baseline X and got back the verdict for the
// hard-coded default. The fix:
//
//   - A single positional arg is treated as `--baseline <path>`.
//   - Two or more positionals raise CliArgsError.
//   - Mixing a positional with --baseline raises CliArgsError.
//   - Unknown flags continue to raise CliArgsError (pre-existing behavior).
//
// These tests exercise parseArgs in isolation; the file's main() is gated on
// `isMain` so importing the module does not run the CLI.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { CliArgsError, parseArgs } from "./check-release-gate.js";

describe("check-release-gate CLI parseArgs", () => {
  it("returns the default baseline when no args supplied", () => {
    const a = parseArgs([]);
    expect(a.baseline.replace(/\\/g, "/")).toMatch(
      /datasets\/jam-actions-v0-public\/evals\/slice19-fair-e3-baseline-results\.json$/,
    );
    expect(a.help).toBe(false);
    expect(a.quiet).toBe(false);
  });

  it("accepts --baseline <path>", () => {
    const a = parseArgs(["--baseline", "datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json"]);
    expect(a.baseline).toBe("datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json");
  });

  it("accepts a single positional argument as the baseline path (Slice 23.5)", () => {
    // The Slice 23 audit caught this: a fresh contributor running
    //   tsx check-release-gate.ts datasets/.../slice21-baseline.json
    // got back the DEFAULT_BASELINE verdict instead. The fix is to treat
    // the positional as the baseline.
    const a = parseArgs(["datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json"]);
    expect(a.baseline).toBe("datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json");
  });

  it("rejects two or more positional arguments", () => {
    expect(() => parseArgs(["foo.json", "bar.json"])).toThrow(CliArgsError);
    expect(() => parseArgs(["foo.json", "bar.json"])).toThrow(/expected at most one positional baseline path/);
  });

  it("rejects three positional arguments", () => {
    expect(() => parseArgs(["foo.json", "bar.json", "baz.json"])).toThrow(CliArgsError);
    expect(() => parseArgs(["foo.json", "bar.json", "baz.json"])).toThrow(/got 3/);
  });

  it("rejects mixing a positional path with --baseline", () => {
    expect(() => parseArgs(["--baseline", "from-flag.json", "from-positional.json"])).toThrow(CliArgsError);
    expect(() => parseArgs(["from-positional.json", "--baseline", "from-flag.json"])).toThrow(CliArgsError);
    expect(() => parseArgs(["--baseline", "from-flag.json", "from-positional.json"])).toThrow(/cannot mix positional/);
  });

  it("rejects unknown --flag (pre-existing behavior preserved)", () => {
    expect(() => parseArgs(["--no-such-flag"])).toThrow(CliArgsError);
    expect(() => parseArgs(["--no-such-flag"])).toThrow(/unknown flag/);
  });

  it("accepts --quiet flag", () => {
    const a = parseArgs(["--quiet"]);
    expect(a.quiet).toBe(true);
  });

  it("accepts --help flag", () => {
    const a = parseArgs(["--help"]);
    expect(a.help).toBe(true);
  });

  it("accepts -h alias for --help", () => {
    const a = parseArgs(["-h"]);
    expect(a.help).toBe(true);
  });

  it("accepts --no-reports-enriched-split", () => {
    const a = parseArgs(["--no-reports-enriched-split"]);
    expect(a.reportsEnrichedSplit).toBe(false);
  });

  it("accepts --out <path>", () => {
    const a = parseArgs(["--out", "outdir/result.json"]);
    expect(a.out).toBe("outdir/result.json");
  });

  it("accepts threshold-override flags", () => {
    const a = parseArgs([
      "--axis1-floor", "0.60",
      "--axis2-margin-floor", "0.05",
      "--axis2-clearing-fraction", "0.40",
      "--axis5-misinterp-ceiling", "0.30",
    ]);
    expect(a.thresholds.axis1_absolute_floor).toBe(0.60);
    expect(a.thresholds.axis2_corpus_margin_floor).toBe(0.05);
    expect(a.thresholds.axis2_records_clearing_fraction_floor).toBe(0.40);
    expect(a.thresholds.axis5_misinterp_ceiling).toBe(0.30);
  });

  it("combines a positional baseline with --quiet correctly", () => {
    const a = parseArgs(["--quiet", "datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json"]);
    expect(a.quiet).toBe(true);
    expect(a.baseline).toBe("datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json");
  });
});

describe("CliArgsError", () => {
  it("is an Error subclass with name 'CliArgsError'", () => {
    const e = new CliArgsError("test");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("CliArgsError");
    expect(e.message).toBe("test");
  });
});
