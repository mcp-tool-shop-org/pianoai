import { defineConfig } from "vitest/config";

// ─── Coverage gate (C-B1-001, Stage C amend) ───────────────────────────────
//
// Before this file existed, `pnpm test:coverage` computed a report on every
// CI run (ci.yml, Node 22 leg) but nothing ever gated on it. The only
// consumer was the Codecov upload step, which has silently failed on every
// single run: Codecov's tokenless upload path doesn't work against a
// branch-protected default branch, and `fail_ci_if_error: false` swallows
// that failure so the job stays green regardless. This config adds a local,
// Codecov-independent floor so a real regression (coverage collection
// breaking, a large new module landing untested) fails the build on its own.
// The Codecov step in ci.yml is left in place and still non-blocking — fixing
// its token requires a `CODECOV_TOKEN` repo secret, which is an operator
// action outside this fix's scope, not something a config file can supply.
//
// `all: true` is v8's own default (confirmed against the installed
// @vitest/coverage-v8@3.2.4 types) and is set explicitly here anyway: it's
// what makes the gate meaningful. Without it, a file with zero tests simply
// wouldn't appear in the report instead of dragging the average down — which
// is exactly the "a large new module lands at 10% coverage and nobody
// notices" failure mode C-B1-001 called out.
//
// Threshold floor: 30% statements/lines/functions, 20% branches. This is a
// conservative *static estimate*, not a measured baseline — this fix was
// authored under a wave-level constraint that forbids running
// `pnpm test`/`pnpm test:coverage` (parallel wave, shared tree, coordinator
// runs the one real verify pass after collection). The estimate comes from
// bucketing the ~33k in-scope lines across 74 src/ files by whether/how
// well each has dedicated test coverage (1621 tests exist repo-wide as of
// this stage) and weighting by file size; that exercise landed a central
// estimate around ~45% with a wide uncertainty band, pulled down hard by
// several large, confirmed-thin-or-untested files: cli.ts (1381 lines, no
// test file at all), most of mcp-server.ts (2945 lines against a 309-line
// test focused on tool registration/protocol behavior, not handler bodies),
// and the whole audio engine layer (audio-engine.ts, guitar-engine.ts,
// sample-engine.ts, vocal-engine.ts, vocal-tract-engine.ts, piano-voices.ts,
// guitar-voices.ts — confirmed by Stage A/B audit findings to have no
// dedicated unit tests exercising them).
//
// The floor is set well below that central estimate on purpose: the goal is
// a number that (a) almost certainly passes the first real CI run, so
// coverage tracking goes from "never enforced" to "enforced" without
// breaking the build on the PR that adds it, and (b) still catches a real
// regression (collection silently breaking, a wholesale test deletion, or a
// large new module landing at ~0%). RAISE this floor in a follow-up PR once
// a real `pnpm test:coverage` run has printed the actual number — the
// coverage step's own console output ("text" reporter below) has it.
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      all: true,
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        // Vendored third-party code (a bundled Web Audio synthesis engine) —
        // not ours to hold to a coverage bar.
        "src/vendor/**",
        // Manual dev script: requires a physical audio device, has no
        // callers from cli.ts/mcp-server.ts (confirmed by Stage A/B audit),
        // is not part of the shipped surface (absent from package.json's
        // "files").
        "src/test-sound.ts",
        // The product's own smoke-test harness, invoked directly via
        // `pnpm smoke` (both locally and in ci.yml's "Smoke" step) rather
        // than through vitest. Including it here would report it as
        // permanently 0%-covered even though it IS exercised for real on
        // every CI run, just not by this tool.
        "src/smoke.ts",
      ],
      reportsDirectory: "./coverage",
      // Keep "json" — ci.yml's Codecov step reads ./coverage/coverage-final.json.
      reporter: ["text", "json", "json-summary", "html"],
      thresholds: {
        statements: 30,
        lines: 30,
        functions: 30,
        branches: 20,
      },
    },
  },
});
