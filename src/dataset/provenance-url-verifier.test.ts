// ─── jam-actions-v0 Slice 2.5 — URL Verifier Tests ──────────────────────────
//
// Unit tests for `provenance-url-verifier.ts`. Uses a mock fetch — NEVER hits
// the live network from these tests (kickoff hard rule).
//
// Coverage (8+ scenarios listed in kickoff):
//   1. Verified CC-BY-SA + named creator + version detected → promotes to "public"
//   2. Verified CC-BY-SA but no version detected → stays "public_candidate"
//   3. Verified CC-BY page but recorded claim was CC-BY-SA → demoted to "internal"
//   4. Composer page returns 404 → demoted to "internal"
//   5. Composer page returns 503 twice → stays "public_candidate"
//   6. Page returns CC-BY-NC → demoted to "excluded"
//   7. Empty page / no attribution → demoted to "excluded" (scraped-only rule)
//   8. Composer page references title but not creator → stays "public_candidate"
//   9. Politeness: rate-limit between calls observable (counted-call sleep)
//  10. Bonus: license-family-detector regex sanity (unit-level)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  verifyProvenanceUrl,
  parseLicenseFamily,
  parseLicenseVersion,
  isPublicCompatibleFamily,
  htmlToText,
  POLITENESS_DEFAULTS,
  COMPOSER_PAGES,
  type VerifyInput,
  type VerificationResult,
} from "./provenance-url-verifier.js";

// ─── Mock fetch builders ──────────────────────────────────────────────────────

/** Build a mock fetch that returns canned responses per URL. */
function makeFetch(
  responses: Record<
    string,
    | { status: number; body: string }
    | Array<{ status: number; body: string } | "throw" | "abort">
  >,
): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);
    const cfg = responses[url];
    if (cfg == null) {
      throw new Error(`mock fetch: no response configured for ${url}`);
    }
    // Per-call sequence support for retry tests.
    let resolved: { status: number; body: string } | "throw" | "abort";
    if (Array.isArray(cfg)) {
      const idx = Math.min(
        calls.filter((c) => c === url).length - 1,
        cfg.length - 1,
      );
      resolved = cfg[idx];
    } else {
      resolved = cfg;
    }
    if (resolved === "throw") {
      throw new Error("mock fetch: network error");
    }
    if (resolved === "abort") {
      // Simulate timeout via aborted signal.
      const sig = init?.signal;
      if (sig instanceof AbortSignal) {
        // Throw an AbortError-shaped error.
        const err = new Error("mock fetch: aborted") as Error & { name?: string };
        err.name = "AbortError";
        throw err;
      }
      throw new Error("mock fetch: aborted (no signal)");
    }
    const { status, body } = resolved;
    return new Response(body, { status });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const SITE_ROOT = "http://piano-midi.de/";

// ─── Standard fixtures ───────────────────────────────────────────────────────

const SITE_HTML_CC_BY_SA_3 = `
<!doctype html>
<html><body>
<p>Welcome to piano-midi.de.</p>
<p>All files maintained by Bernd Krueger. The recordings on this page are licensed under
the Creative Commons Attribution-ShareAlike 3.0 license (CC BY-SA 3.0).</p>
</body></html>
`;

const SITE_HTML_CC_BY_SA_NO_VERSION = `
<!doctype html>
<html><body>
<p>Welcome to piano-midi.de.</p>
<p>All files maintained by Bernd Krueger. Available under Creative Commons Attribution-ShareAlike.</p>
</body></html>
`;

const BACH_HTML_OK = `
<!doctype html>
<html><body>
<h1>Johann Sebastian Bach</h1>
<table>
  <tr><td>BWV 846</td><td>Prelude in C-Major (Well-Tempered Clavier)</td><td>Bernd Krueger</td></tr>
</table>
<p>All transcriptions licensed CC BY-SA 3.0.</p>
</body></html>
`;

const BACH_HTML_NO_VERSION = `
<!doctype html>
<html><body>
<h1>Johann Sebastian Bach</h1>
<table>
  <tr><td>BWV 846</td><td>Prelude in C-Major</td><td>Bernd Krueger</td></tr>
</table>
<p>Licensed Creative Commons Attribution-ShareAlike.</p>
</body></html>
`;

const BACH_HTML_CC_BY_ONLY = `
<!doctype html>
<html><body>
<h1>Johann Sebastian Bach</h1>
<p>BWV 846 Prelude in C-Major. Bernd Krueger.</p>
<p>Licensed under Creative Commons Attribution 4.0 (CC BY 4.0).</p>
</body></html>
`;

const BACH_HTML_CC_BY_NC = `
<!doctype html>
<html><body>
<h1>Johann Sebastian Bach</h1>
<p>BWV 846. Bernd Krueger.</p>
<p>Licensed under CC BY-NC 4.0 (Attribution-NonCommercial).</p>
</body></html>
`;

const BACH_HTML_TITLE_NO_CREATOR = `
<!doctype html>
<html><body>
<h1>Johann Sebastian Bach</h1>
<p>BWV 846 Prelude in C-Major. Licensed CC BY-SA 3.0.</p>
</body></html>
`;

const EMPTY_HTML = `<!doctype html><html><body></body></html>`;

// Page resolves with full general provenance posture (creator + CC license + version)
// but no reference to BWV 846 specifically — simulates piano-midi.de's Debussy page
// which carries Bernd Krueger + CC-BY-SA 3.0/DE site-wide but doesn't host Arabesque.
const BACH_HTML_OTHER_WORK_ONLY = `
<!doctype html>
<html><body>
<h1>Johann Sebastian Bach</h1>
<table>
  <tr><td>BWV 988</td><td>Goldberg Variations</td><td>Bernd Krueger</td></tr>
</table>
<a rel="license" href="http://creativecommons.org/licenses/by-sa/3.0/de/deed.en">Creative Commons License</a>
</body></html>
`;

// ─── 1. Promotes to "public" — happy path ─────────────────────────────────────

describe("verifyProvenanceUrl", () => {
  const baseInput: VerifyInput = {
    song_id: "bach-prelude-c-major-bwv846",
    song_title: "Prelude in C Major, BWV 846 (Well-Tempered Clavier)",
    claimed_license: "CC-BY-SA",
    claimed_creator: "Bernd Krueger",
    today: "2026-05-17",
  };

  // F-24c7adee: the two retry-backoff tests below used to sleep for a real
  // RETRY_BACKOFF_MS (2 real seconds) each, adding ~4s of mandatory wall-clock
  // time to every `pnpm test` run. vi.useRealTimers() here guarantees fake
  // timers never leak into a later test if an assertion throws mid-test.
  afterEach(() => {
    vi.useRealTimers();
  });

  it("promotes to 'public' when CC-BY-SA + version + creator + title all confirmed", async () => {
    const { fetchImpl, calls } = makeFetch({
      [SITE_ROOT]: { status: 200, body: SITE_HTML_CC_BY_SA_3 },
      "http://piano-midi.de/bach.htm": { status: 200, body: BACH_HTML_OK },
    });
    const result = await verifyProvenanceUrl({ ...baseInput, fetchImpl });
    expect(result.post_verdict).toBe("public");
    expect(result.license_detected).toBe("CC-BY-SA");
    expect(result.license_version_detected).toBe("3.0");
    expect(result.arrangement_creator_confirmed).toBe(true);
    expect(result.song_title_confirmed).toBe(true);
    expect(result.evidence_url_chosen).toBe("http://piano-midi.de/bach.htm");
    expect(result.training_use_permitted).toBe(true);
    expect(result.failure_reasons).toEqual([]);
    expect(calls).toEqual([
      SITE_ROOT,
      "http://piano-midi.de/bach.htm",
    ]);
  });

  // ─── 2. No version detected → stays public_candidate ───────────────────────

  it("stays at 'public_candidate' when license family is found but version is not", async () => {
    const { fetchImpl } = makeFetch({
      [SITE_ROOT]: { status: 200, body: SITE_HTML_CC_BY_SA_NO_VERSION },
      "http://piano-midi.de/bach.htm": { status: 200, body: BACH_HTML_NO_VERSION },
    });
    const result = await verifyProvenanceUrl({ ...baseInput, fetchImpl });
    expect(result.post_verdict).toBe("public_candidate");
    expect(result.license_detected).toBe("CC-BY-SA");
    expect(result.license_version_detected).toBeNull();
    expect(result.failure_reasons.some((r) => r.includes("license version"))).toBe(
      true,
    );
    expect(result.training_use_permitted).toBe(true);
  });

  // ─── 3. License mismatch (CC-BY found, CC-BY-SA claimed) → internal ────────

  it("demotes to 'internal' when page license differs from recorded claim (compatible family)", async () => {
    const { fetchImpl } = makeFetch({
      [SITE_ROOT]: { status: 200, body: SITE_HTML_CC_BY_SA_3 },
      "http://piano-midi.de/bach.htm": { status: 200, body: BACH_HTML_CC_BY_ONLY },
    });
    const result = await verifyProvenanceUrl({ ...baseInput, fetchImpl });
    expect(result.post_verdict).toBe("internal");
    // Composer page wins for the report's detected license.
    expect(result.license_detected).toBe("CC-BY");
    expect(result.failure_reasons.some((r) => r.includes("license family mismatch"))).toBe(true);
    expect(result.training_use_permitted).toBe(true);
  });

  // ─── 4. 404 on composer page → internal ────────────────────────────────────

  it("demotes to 'internal' when composer page returns hard 404", async () => {
    const { fetchImpl } = makeFetch({
      [SITE_ROOT]: { status: 200, body: SITE_HTML_CC_BY_SA_3 },
      "http://piano-midi.de/bach.htm": { status: 404, body: "<h1>Not Found</h1>" },
    });
    const result = await verifyProvenanceUrl({ ...baseInput, fetchImpl });
    expect(result.post_verdict).toBe("internal");
    expect(result.failure_reasons.some((r) => r.includes("hard failure: HTTP 404"))).toBe(true);
    // training_use_permitted preserved (page gone is not license failure).
    expect(result.training_use_permitted).toBe(true);
  });

  // ─── 5. 503 twice → stays public_candidate (transient ≠ provenance failure)

  it("stays at 'public_candidate' on transient (5xx twice) failure for composer page", async () => {
    // F-24c7adee: this exercises the retry-once path (composer page 503s
    // twice), which sleeps RETRY_BACKOFF_MS between attempts. Fake timers
    // replace that real 2s wait with an instant, deterministic advance.
    vi.useFakeTimers();
    const { fetchImpl, calls } = makeFetch({
      [SITE_ROOT]: { status: 200, body: SITE_HTML_CC_BY_SA_3 },
      "http://piano-midi.de/bach.htm": [
        { status: 503, body: "" },
        { status: 503, body: "" },
      ],
    });
    const resultPromise = verifyProvenanceUrl({ ...baseInput, fetchImpl });
    await vi.advanceTimersByTimeAsync(POLITENESS_DEFAULTS.RETRY_BACKOFF_MS);
    const result = await resultPromise;
    expect(result.post_verdict).toBe("public_candidate");
    expect(
      result.failure_reasons.some((r) =>
        r.includes("composer page persistent server error"),
      ),
    ).toBe(true);
    // Two attempts to the composer page should have happened.
    const composerCalls = calls.filter(
      (c) => c === "http://piano-midi.de/bach.htm",
    );
    expect(composerCalls.length).toBe(2);
    expect(result.training_use_permitted).toBe(true);
  });

  // ─── 6. CC-BY-NC found → excluded ──────────────────────────────────────────

  it("demotes to 'excluded' when page declares a restrictive license (CC-BY-NC)", async () => {
    const { fetchImpl } = makeFetch({
      [SITE_ROOT]: { status: 200, body: SITE_HTML_CC_BY_SA_3 },
      "http://piano-midi.de/bach.htm": { status: 200, body: BACH_HTML_CC_BY_NC },
    });
    const result = await verifyProvenanceUrl({ ...baseInput, fetchImpl });
    expect(result.post_verdict).toBe("excluded");
    expect(result.training_use_permitted).toBe(false);
    expect(
      result.failure_reasons.some((r) => r.includes("restrictive license detected")),
    ).toBe(true);
  });

  // ─── 7. Empty page → excluded (scraped-only rule) ──────────────────────────

  it("demotes to 'excluded' on empty pages with no creator / license / title (scraped-only)", async () => {
    const { fetchImpl } = makeFetch({
      [SITE_ROOT]: { status: 200, body: EMPTY_HTML },
      "http://piano-midi.de/bach.htm": { status: 200, body: EMPTY_HTML },
    });
    const result = await verifyProvenanceUrl({ ...baseInput, fetchImpl });
    expect(result.post_verdict).toBe("excluded");
    expect(result.training_use_permitted).toBe(false);
    expect(result.failure_reasons.some((r) => r.includes("scraped-only"))).toBe(true);
  });

  // ─── 8. Title confirmed but no creator → stays public_candidate ────────────

  it("stays at 'public_candidate' when title is referenced but creator is not", async () => {
    const { fetchImpl } = makeFetch({
      [SITE_ROOT]: { status: 200, body: EMPTY_HTML }, // also no creator at site root
      "http://piano-midi.de/bach.htm": {
        status: 200,
        body: BACH_HTML_TITLE_NO_CREATOR,
      },
    });
    const result = await verifyProvenanceUrl({ ...baseInput, fetchImpl });
    expect(result.post_verdict).toBe("public_candidate");
    expect(result.song_title_confirmed).toBe(true);
    expect(result.arrangement_creator_confirmed).toBe(false);
    expect(
      result.failure_reasons.some((r) =>
        r.includes("did not reference claimed creator"),
      ),
    ).toBe(true);
  });

  // ─── 8.5 Per-song attribution unsupported (page OK, song absent) → internal ─

  it("demotes to 'internal' when composer page is up with creator + license but does NOT reference the work (per-song attribution unsupported)", async () => {
    const { fetchImpl } = makeFetch({
      [SITE_ROOT]: { status: 200, body: SITE_HTML_CC_BY_SA_3 },
      "http://piano-midi.de/bach.htm": {
        status: 200,
        body: BACH_HTML_OTHER_WORK_ONLY,
      },
    });
    const result = await verifyProvenanceUrl({ ...baseInput, fetchImpl });
    expect(result.post_verdict).toBe("internal");
    expect(result.arrangement_creator_confirmed).toBe(true);
    expect(result.license_detected).toBe("CC-BY-SA");
    expect(result.license_version_detected).toBe("3.0");
    expect(result.song_title_confirmed).toBe(false);
    expect(
      result.failure_reasons.some((r) =>
        r.includes("per-song attribution unsupported"),
      ),
    ).toBe(true);
  });

  // ─── 9. Politeness — site root retry waits at least RETRY_BACKOFF_MS ───────

  it("applies retry backoff (>= RETRY_BACKOFF_MS) on transient site failure", async () => {
    // Site returns 503 first, then 200 — retry happens inside fetchWithRetry,
    // which sleeps for RETRY_BACKOFF_MS. F-24c7adee: previously this measured
    // real Date.now() elapsed time around a real sleep (~2s per run). Fake
    // timers prove the same invariant deterministically: the call cannot
    // complete before the backoff window elapses (checked via `settled`
    // staying false just short of RETRY_BACKOFF_MS), and does complete once
    // the full window is advanced — without ever sleeping for real.
    vi.useFakeTimers();
    const { fetchImpl } = makeFetch({
      [SITE_ROOT]: [
        { status: 503, body: "" },
        { status: 200, body: SITE_HTML_CC_BY_SA_3 },
      ],
      "http://piano-midi.de/bach.htm": { status: 200, body: BACH_HTML_OK },
    });

    let settled = false;
    const resultPromise = verifyProvenanceUrl({ ...baseInput, fetchImpl }).then(
      (r) => {
        settled = true;
        return r;
      },
    );

    // Advance to just short of the backoff window — the retry must still be
    // asleep, proving a real (simulated) wait is in the call graph rather
    // than the retry firing immediately.
    await vi.advanceTimersByTimeAsync(POLITENESS_DEFAULTS.RETRY_BACKOFF_MS - 50);
    expect(settled).toBe(false);

    // Advance past the remainder of the backoff window — the retry can now
    // complete.
    await vi.advanceTimersByTimeAsync(50);

    const result = await resultPromise;
    expect(settled).toBe(true);
    expect(result.post_verdict).toBe("public");
    expect(result.verification_attempts[0].retried).toBe(true);
  });

  // ─── 10. COMPOSER_PAGES coverage matches the scan's 10 songs ───────────────

  it("has a composer-page lookup for each of the 10 public_candidate songs", () => {
    const expected = [
      "bach-prelude-c-major-bwv846",
      "chopin-nocturne-op9-no2",
      "chopin-prelude-e-minor",
      "clair-de-lune",
      "debussy-arabesque-no1",
      "fur-elise",
      "mozart-k545-mvt1",
      "pathetique-mvt2",
      "satie-gymnopedie-no1",
      "schumann-traumerei",
    ];
    for (const id of expected) {
      expect(COMPOSER_PAGES[id]).toBeDefined();
      expect(COMPOSER_PAGES[id].url).toMatch(/^http:\/\/piano-midi\.de\//);
      expect(COMPOSER_PAGES[id].titleFragments.length).toBeGreaterThan(0);
    }
  });
});

// ─── Pure parser tests ───────────────────────────────────────────────────────

describe("parseLicenseFamily", () => {
  it("detects CC-BY-SA from 'Creative Commons Attribution-ShareAlike'", () => {
    const { family } = parseLicenseFamily(
      "Licensed under Creative Commons Attribution-ShareAlike 3.0.",
    );
    expect(family).toBe("CC-BY-SA");
  });
  it("detects CC-BY from 'CC BY 4.0'", () => {
    const { family } = parseLicenseFamily("Licensed: CC BY 4.0.");
    expect(family).toBe("CC-BY");
  });
  it("detects CC-BY-NC and prefers restrictive over CC-BY", () => {
    const { family } = parseLicenseFamily(
      "Licensed under CC BY-NC (Attribution-NonCommercial).",
    );
    expect(family).toBe("CC-BY-NC");
  });
  it("returns null when no CC family is present", () => {
    const { family } = parseLicenseFamily("Public domain notice and copyright text.");
    expect(family).toBe(null);
  });
  it("captures an excerpt around the match", () => {
    const { excerpt } = parseLicenseFamily(
      "Some preamble before. Creative Commons Attribution-ShareAlike 4.0. Trailing text.",
    );
    expect(excerpt.length).toBeGreaterThan(0);
    expect(excerpt.toLowerCase()).toContain("attribution-sharealike");
  });
});

describe("parseLicenseVersion", () => {
  it("detects 3.0 next to CC-BY-SA", () => {
    expect(parseLicenseVersion("Licensed CC BY-SA 3.0.")).toBe("3.0");
  });
  it("detects 4.0 next to CC-BY", () => {
    expect(parseLicenseVersion("Licensed CC BY 4.0.")).toBe("4.0");
  });
  it("returns null when no version marker is adjacent", () => {
    expect(parseLicenseVersion("Licensed under Creative Commons.")).toBe(null);
  });
  it("does not match stray years like 2024", () => {
    expect(parseLicenseVersion("Site updated 2024. License: Creative Commons.")).toBe(
      null,
    );
  });
});

describe("isPublicCompatibleFamily", () => {
  it("accepts CC-BY / CC-BY-SA / CC0", () => {
    expect(isPublicCompatibleFamily("CC-BY")).toBe(true);
    expect(isPublicCompatibleFamily("CC-BY-SA")).toBe(true);
    expect(isPublicCompatibleFamily("CC0")).toBe(true);
  });
  it("rejects restrictive families", () => {
    expect(isPublicCompatibleFamily("CC-BY-NC")).toBe(false);
    expect(isPublicCompatibleFamily("CC-BY-ND")).toBe(false);
    expect(isPublicCompatibleFamily("CC-BY-NC-SA")).toBe(false);
    expect(isPublicCompatibleFamily("CC-BY-NC-ND")).toBe(false);
  });
  it("returns false on null", () => {
    expect(isPublicCompatibleFamily(null)).toBe(false);
  });
});

describe("htmlToText", () => {
  it("strips tags and decodes entities", () => {
    const text = htmlToText(
      "<p>Hello&nbsp;<b>World</b> &amp; everything</p>",
    );
    expect(text).toBe("Hello World & everything");
  });
  it("drops script / style content", () => {
    const text = htmlToText(
      "<style>.x{}</style><p>Visible</p><script>evil()</script>",
    );
    expect(text).toBe("Visible");
  });
});

describe("POLITENESS_DEFAULTS", () => {
  it("locks the kickoff E values verbatim", () => {
    expect(POLITENESS_DEFAULTS.RATE_LIMIT_MS).toBe(1000);
    expect(POLITENESS_DEFAULTS.USER_AGENT).toBe(
      "jam-actions-v0-provenance-verifier/0.1",
    );
    expect(POLITENESS_DEFAULTS.TIMEOUT_MS).toBe(10_000);
    expect(POLITENESS_DEFAULTS.RETRY_BACKOFF_MS).toBe(2_000);
    expect(POLITENESS_DEFAULTS.RETRIES).toBe(1);
  });
});
