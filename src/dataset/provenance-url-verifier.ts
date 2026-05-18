// ─── jam-actions-v0 Slice 2.5 — URL Verification ─────────────────────────────
//
// The HTTP verifier that runs AFTER the rule engine in `provenance.ts`. Takes a
// candidate (a `public_candidate` song with a parsed source / license claim) and
// walks the site → composer → song chain to confirm or refute the claim against
// the live page. Promotes to `"public"` only when ALL site-level + per-song
// conditions hold, including license version. Stays at `"public_candidate"` on
// partial evidence or transient failure. Demotes to `"internal"` / `"excluded"`
// only on hard verification failure.
//
// Stack: native Node 18+ `fetch`, no new dependencies.
//
// Locked behaviors (Slice 2.5 kickoff):
//   - Rate limit: 1 req/sec between fetches inside a single song crawl AND
//     between songs. Caller responsibility — `verifyProvenanceUrl()` itself is
//     stateless; the runner script paces calls via `await sleep(1000)`. The
//     module exposes `POLITENESS_DEFAULTS` so callers and tests share the
//     numbers.
//   - User-Agent: `jam-actions-v0-provenance-verifier/0.1`
//   - Method: GET (need full HTML to find license text + creator references)
//   - Redirects: follow (default fetch behavior)
//   - Timeout: 10s per request, enforced via AbortController
//   - Retry: once on 5xx / timeout / network error, with 2s backoff
//   - Second transient failure → result stays `public_candidate`, NOT internal
//   - License version STRICT: "Creative Commons" / "CC BY-SA" with no version
//     → stays public_candidate (do NOT promote on vague claim)
//   - Scraped-only / no attribution found anywhere → demoted to `excluded`
//
// Composer-page lookup table is small + hand-rolled for the 10 songs in
// `provenance-scan.json`. We deliberately do NOT crawl arbitrary URLs; this
// verifier only knows the piano-midi.de site shape.
// ─────────────────────────────────────────────────────────────────────────────

import type { Verdict } from "./provenance.js";

// ─── Politeness defaults (LOCKED — kickoff E) ────────────────────────────────

export const POLITENESS_DEFAULTS = {
  /** Sleep between fetches inside a single song crawl and between songs. */
  RATE_LIMIT_MS: 1000,
  /** User-Agent string sent on every HTTP request. */
  USER_AGENT: "jam-actions-v0-provenance-verifier/0.1",
  /** Per-request timeout. */
  TIMEOUT_MS: 10_000,
  /** Retry backoff on first transient failure. */
  RETRY_BACKOFF_MS: 2_000,
  /** Total transient-retry budget per URL fetch (1 = retry once → 2 attempts). */
  RETRIES: 1,
} as const;

// ─── Composer-page lookup ────────────────────────────────────────────────────
//
// Hand-rolled mapping from the 10 song_ids in provenance-scan.json to their
// piano-midi.de composer page URL. If a new song is added to provenance-scan,
// add it here too; an unknown song_id returns null and the verifier records a
// failure_reason of "composer-page lookup missing".

export interface ComposerPage {
  url: string;
  /**
   * Substring fragments to match on the composer page to confirm the song.
   * Lenient — matched case-insensitively against the page's textContent. The
   * page just needs to contain ONE of these fragments.
   */
  titleFragments: string[];
}

export const COMPOSER_PAGES: Record<string, ComposerPage> = {
  "bach-prelude-c-major-bwv846": {
    url: "http://piano-midi.de/bach.htm",
    // The page lists "Prelude and Fugue C-Major" / "BWV 846" — match either fragment.
    titleFragments: ["BWV 846", "Prelude", "C-Major"],
  },
  "chopin-nocturne-op9-no2": {
    url: "http://piano-midi.de/chopin.htm",
    titleFragments: ["op. 9", "op.9", "Nocturne", "Op 9 No 2"],
  },
  "chopin-prelude-e-minor": {
    url: "http://piano-midi.de/chopin.htm",
    // Prelude Op. 28 No. 4 lives on the chopin page under
    // "Préludes, Opus 28 (1838)" with individual movements (No. 1 .. No. 24).
    titleFragments: ["Préludes, Opus 28", "Opus 28", "Préludes"],
  },
  "clair-de-lune": {
    url: "http://piano-midi.de/debuss.htm",
    titleFragments: ["Clair de Lune", "Suite bergamasque", "Suite bergamesque"],
  },
  "debussy-arabesque-no1": {
    url: "http://piano-midi.de/debuss.htm",
    titleFragments: ["Arabesque", "Arabesken"],
  },
  "fur-elise": {
    url: "http://piano-midi.de/beeth.htm",
    titleFragments: ["Für Elise", "Fur Elise", "Bagatelle", "WoO 59", "elise"],
  },
  "mozart-k545-mvt1": {
    url: "http://piano-midi.de/mozart.htm",
    titleFragments: ["KV 545", "K. 545", "K.545", "Sonata"],
  },
  "pathetique-mvt2": {
    url: "http://piano-midi.de/beeth.htm",
    titleFragments: ["pathetique", "pathétique", "op. 13", "op.13"],
  },
  "satie-gymnopedie-no1": {
    url: "http://piano-midi.de/satie.htm",
    titleFragments: ["Gymnopédie", "Gymnopedie"],
  },
  "schumann-traumerei": {
    url: "http://piano-midi.de/schum.htm",
    // piano-midi.de uses ENGLISH translations: "Scenes from Childhood" for
    // Kinderszenen, "Reverie" for Träumerei. Section header on the page is
    // "Scenes from Childhood, Opus 15 (1838)".
    titleFragments: [
      "Scenes from Childhood, Opus 15",
      "Scenes from Childhood",
      "Opus 15",
      "Reverie",
      "Träumerei",
      "Traumerei",
      "Kinderszenen",
    ],
  },
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface VerifyInput {
  song_id: string;
  song_title: string;
  /** The license claim recorded by Slice 2 (e.g. "CC-BY-SA"). */
  claimed_license: string;
  /** The arrangement creator claim (e.g. "Bernd Krueger"). */
  claimed_creator: string;
  /** Today's ISO date for the report. Injected for test determinism. */
  today?: string;
  /**
   * Override politeness defaults (used by tests).
   * Note: rate-limiting happens in the runner, NOT inside this function.
   */
  fetchImpl?: typeof fetch;
}

export interface VerificationAttempt {
  /** Site root / composer page / song-detail URL fetched. */
  url: string;
  /** HTTP status code if response received, or null on hard network error. */
  status: number | null;
  /** ISO timestamp of the fetch. */
  fetched_at: string;
  /** Response body byte count. */
  response_size_bytes: number;
  /** Short excerpt of license-relevant text (first 200 chars of matched region). */
  license_text_excerpt: string;
  /** True if response was reached after a retry. */
  retried: boolean;
  /** Error string when the fetch failed both attempts. */
  error?: string;
}

export interface VerificationResult {
  song_id: string;
  /** Always "public_candidate" pre-verification (input precondition). */
  pre_verdict: Verdict;
  /** New verdict per kickoff verdict-decision rules. */
  post_verdict: Verdict;
  /** Per-URL fetch attempts in crawl order. */
  verification_attempts: VerificationAttempt[];
  /** Detected license string (normalized, e.g. "CC-BY-SA"). null if not detected. */
  license_detected: string | null;
  /** Detected license version (e.g. "3.0", "4.0"). null if not confidently parsed. */
  license_version_detected: string | null;
  /** True if a page reference to the claimed creator was found. */
  arrangement_creator_confirmed: boolean;
  /** True if a page reference to the song title was found. */
  song_title_confirmed: boolean;
  /** Deepest verified URL (per-song > composer-page > site-root). */
  evidence_url_chosen: string;
  /** Empty if promoted; populated with kickoff-rule strings on partial / failed. */
  failure_reasons: string[];
  /** New training_use_permitted boolean per kickoff F. */
  training_use_permitted: boolean;
  /** ISO date this verification ran. */
  verified_at: string;
  /** Updated verdict_reason string for record JSONs. */
  verdict_reason: string;
}

// ─── License parser ──────────────────────────────────────────────────────────
//
// Two-step parse:
//   1. Detect the family (CC-BY, CC-BY-SA, CC0, CC-BY-NC, CC-BY-ND, etc.)
//   2. Detect the version (3.0, 4.0, etc.)
// If only the family is found, license_detected is non-null but
// license_version_detected stays null → song stays public_candidate (STRICT
// kickoff rule B).

const LICENSE_FAMILY_PATTERNS: { family: string; pattern: RegExp }[] = [
  // Order matters — most-restrictive first so CC-BY-NC-ND wins over CC-BY.
  { family: "CC-BY-NC-ND", pattern: /\b(cc[-\s]*by[-\s]*nc[-\s]*nd|attribution[-\s]*noncommercial[-\s]*noderivatives)\b/i },
  { family: "CC-BY-NC-SA", pattern: /\b(cc[-\s]*by[-\s]*nc[-\s]*sa|attribution[-\s]*noncommercial[-\s]*sharealike)\b/i },
  { family: "CC-BY-NC", pattern: /\b(cc[-\s]*by[-\s]*nc|attribution[-\s]*noncommercial)\b/i },
  { family: "CC-BY-ND", pattern: /\b(cc[-\s]*by[-\s]*nd|attribution[-\s]*noderivatives)\b/i },
  { family: "CC-BY-SA", pattern: /\b(cc[-\s]*by[-\s]*sa|attribution[-\s]*sharealike|attribution[-\s]*share[-\s]*alike)\b/i },
  { family: "CC-BY", pattern: /\b(cc[-\s]*by|creative commons attribution)\b/i },
  { family: "CC0", pattern: /\b(cc[-\s]*0|cc0|public domain dedication)\b/i },
];

const LICENSE_VERSION_PATTERN =
  /\b(?:cc[-\s]*by(?:[-\s]*(?:sa|nd|nc|nc[-\s]*sa|nc[-\s]*nd))?[-\s]*|version[\s:=]*|v\.?\s*)?([34])\.0\b/i;

/**
 * Parse the license family from a chunk of HTML / text.
 *
 * Returns:
 *   `{ family: "CC-BY-SA", excerpt: "...matched region..." }` when found,
 *   `{ family: null, excerpt: "" }` when no recognized family appears.
 *
 * The excerpt is a 200-char window centered on the first match — useful for
 * the audit trail in the verification report.
 */
export function parseLicenseFamily(text: string): { family: string | null; excerpt: string } {
  for (const { family, pattern } of LICENSE_FAMILY_PATTERNS) {
    const m = text.match(pattern);
    if (m && typeof m.index === "number") {
      const start = Math.max(0, m.index - 60);
      const end = Math.min(text.length, m.index + (m[0]?.length ?? 0) + 140);
      const excerpt = text
        .slice(start, end)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200);
      return { family, excerpt };
    }
  }
  return { family: null, excerpt: "" };
}

/**
 * Parse the license version (3.0 / 4.0) from a chunk of HTML / text.
 *
 * Returns:
 *   "3.0" / "4.0" when confidently parsed,
 *   null when not detected (kickoff STRICT rule B → stays public_candidate)
 *
 * Conservative: a bare year like "2024" won't match; the pattern requires the
 * version to be adjacent to a CC license token or a "Version"/"v" marker.
 */
export function parseLicenseVersion(text: string): string | null {
  const m = text.match(LICENSE_VERSION_PATTERN);
  if (!m) return null;
  return `${m[1]}.0`;
}

/**
 * Parse license family + version from a `creativecommons.org/licenses/...` URL
 * embedded in raw HTML.
 *
 * This catches the strongest evidence pattern: a `<a rel="license"
 * href="http://creativecommons.org/licenses/by-sa/3.0/de/deed.en">` link. The
 * URL path encodes both the family (`by-sa`) and the version (`3.0`) and is
 * the authoritative machine-readable signal CC publishes for its license
 * markers (see https://wiki.creativecommons.org/RDFa).
 *
 * Operates on RAW HTML (not text-stripped) because `htmlToText` drops `href`
 * attributes — without this parser we'd miss the version on every page whose
 * CC marker is a link.
 *
 * Returns `{ family: null, version: null }` when no recognized CC URL appears.
 */
export function parseLicenseFromCcUrl(rawHtml: string): {
  family: string | null;
  version: string | null;
} {
  // Match the CC licenses URL path. Handles http/https, optional trailing
  // jurisdiction segment (e.g. `/de/`), and optional trailing path bits.
  const m = rawHtml.match(
    /creativecommons\.org\/licenses\/(by-nc-nd|by-nc-sa|by-nc|by-nd|by-sa|by|zero|publicdomain)\/(\d)\.\d/i,
  );
  if (!m) return { family: null, version: null };
  const slug = m[1].toLowerCase();
  const major = m[2];
  let family: string | null = null;
  switch (slug) {
    case "by":
      family = "CC-BY";
      break;
    case "by-sa":
      family = "CC-BY-SA";
      break;
    case "by-nc":
      family = "CC-BY-NC";
      break;
    case "by-nd":
      family = "CC-BY-ND";
      break;
    case "by-nc-sa":
      family = "CC-BY-NC-SA";
      break;
    case "by-nc-nd":
      family = "CC-BY-NC-ND";
      break;
    case "zero":
    case "publicdomain":
      family = "CC0";
      break;
  }
  return { family, version: `${major}.0` };
}

/**
 * True when the family is one of CC-BY / CC-BY-SA / CC0 (redistribution-OK).
 * False for CC-BY-NC / CC-BY-ND / CC-BY-NC-SA / CC-BY-NC-ND (restrictive).
 */
export function isPublicCompatibleFamily(family: string | null): boolean {
  if (!family) return false;
  return family === "CC-BY" || family === "CC-BY-SA" || family === "CC0";
}

// ─── HTTP layer ──────────────────────────────────────────────────────────────

interface FetchResult {
  url: string;
  status: number | null;
  body: string;
  size_bytes: number;
  retried: boolean;
  error?: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch a URL with retry-once-on-transient-failure semantics.
 * Does NOT rate-limit — caller is responsible for 1-req/sec spacing.
 */
async function fetchOnce(
  url: string,
  fetchImpl: typeof fetch,
  opts: { timeoutMs: number; userAgent: string },
): Promise<{ status: number | null; body: string; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": opts.userAgent },
    });
    const body = await res.text();
    return { status: res.status, body };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: null, body: "", error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch with retry-once. Transient = network error OR 5xx response OR timeout.
 * On second transient failure, returns the failed result with `error` set.
 */
async function fetchWithRetry(
  url: string,
  fetchImpl: typeof fetch,
  opts: { timeoutMs: number; userAgent: string; retryBackoffMs: number },
): Promise<FetchResult> {
  const first = await fetchOnce(url, fetchImpl, opts);
  const firstTransient =
    first.status === null || (first.status >= 500 && first.status < 600);
  if (!firstTransient) {
    return {
      url,
      status: first.status,
      body: first.body,
      size_bytes: Buffer.byteLength(first.body, "utf8"),
      retried: false,
      error: first.error,
    };
  }
  // Transient failure — back off and retry once.
  await sleep(opts.retryBackoffMs);
  const second = await fetchOnce(url, fetchImpl, opts);
  return {
    url,
    status: second.status,
    body: second.body,
    size_bytes: Buffer.byteLength(second.body, "utf8"),
    retried: true,
    error: second.error,
  };
}

// ─── HTML text extraction ────────────────────────────────────────────────────
//
// We only need to find license + creator + title fragments — no full HTML
// parser required. Strip tags + decode the common entities and lower-case.

const HTML_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&nbsp;": " ",
  "&auml;": "ä",
  "&ouml;": "ö",
  "&uuml;": "ü",
  "&szlig;": "ß",
  "&eacute;": "é",
  "&egrave;": "è",
  "&Auml;": "Ä",
  "&Ouml;": "Ö",
  "&Uuml;": "Ü",
};

/**
 * Crude HTML → text for substring scanning. Drops `<script>` / `<style>`
 * blocks then strips remaining tags + decodes common HTML entities.
 */
export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  for (const [entity, char] of Object.entries(HTML_ENTITY_MAP)) {
    s = s.split(entity).join(char);
  }
  s = s.replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
  s = s.replace(/&#x([0-9a-f]+);/gi, (_m, n) =>
    String.fromCharCode(parseInt(n, 16)),
  );
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// ─── Verdict-decision helper ─────────────────────────────────────────────────

interface DecideArgs {
  song_id: string;
  song_title: string;
  claimed_license: string;
  claimed_creator: string;
  site_attempt: VerificationAttempt | null;
  composer_attempt: VerificationAttempt | null;
  site_license_family: string | null;
  composer_license_family: string | null;
  site_license_version: string | null;
  composer_license_version: string | null;
  creator_confirmed: boolean;
  title_confirmed: boolean;
  site_status: number | null;
  composer_status: number | null;
  composer_lookup_missing: boolean;
}

/**
 * Apply the kickoff's "Verdict decision rules" to the gathered evidence.
 * Returns the post_verdict, an array of failure_reasons, and the
 * training_use_permitted boolean.
 */
function decideVerdict(args: DecideArgs): {
  post_verdict: Verdict;
  failure_reasons: string[];
  training_use_permitted: boolean;
  license_detected: string | null;
  license_version_detected: string | null;
} {
  const failures: string[] = [];

  // Per-song / composer-page evidence wins when present, otherwise fall back
  // to site-level evidence. License version must come from either page.
  const license_detected =
    args.composer_license_family ?? args.site_license_family;
  const license_version_detected =
    args.composer_license_version ?? args.site_license_version;

  // ── HARD FAILURE 1: composer-page lookup missing → public_candidate ────────
  if (args.composer_lookup_missing) {
    failures.push("composer-page lookup missing for song_id (not in COMPOSER_PAGES)");
  }

  // ── HARD FAILURE 2: site root unreachable on both attempts ─────────────────
  if (args.site_attempt && args.site_attempt.status === null) {
    failures.push("site root unreachable (transient network/timeout, twice)");
  } else if (args.site_attempt && args.site_attempt.status !== 200) {
    // 4xx / 5xx on site root
    const s = args.site_attempt.status;
    if (s === 404 || s === 410 || s === 451) {
      failures.push(`site root hard failure: HTTP ${s}`);
    } else if (s != null && s >= 500) {
      failures.push(`site root persistent server error: HTTP ${s}`);
    } else if (s != null) {
      failures.push(`site root unexpected status: HTTP ${s}`);
    }
  }

  // ── Identify a redistribution-incompatible license → excluded ──────────────
  // (scoped to whichever page we did manage to read)
  const allFamilies = [args.site_license_family, args.composer_license_family];
  const hasRestrictiveLicense = allFamilies.some(
    (f) => f != null && !isPublicCompatibleFamily(f),
  );
  if (hasRestrictiveLicense) {
    const restrictive = allFamilies.find(
      (f) => f != null && !isPublicCompatibleFamily(f),
    );
    failures.push(
      `restrictive license detected on page: ${restrictive} (non-redistribution-compatible)`,
    );
    return {
      post_verdict: "excluded",
      failure_reasons: failures,
      training_use_permitted: false,
      license_detected,
      license_version_detected,
    };
  }

  // ── Composer / song page hard failure → internal (page gone, not transient)
  //
  // Any permanent 4xx is treated as "page is not what we expected" — the
  // upstream is definitively saying our URL is wrong. Exceptions: 408 (request
  // timeout, transient) and 429 (rate-limited, transient) — those fall through
  // to the transient path. piano-midi.de uses 418 for missing pages instead
  // of 404 — we treat it like any other permanent 4xx.
  if (
    !args.composer_lookup_missing &&
    args.composer_attempt &&
    args.composer_attempt.status !== null &&
    args.composer_attempt.status >= 400 &&
    args.composer_attempt.status < 500 &&
    args.composer_attempt.status !== 408 &&
    args.composer_attempt.status !== 429
  ) {
    failures.push(
      `composer page hard failure: HTTP ${args.composer_attempt.status} (page gone or upstream rejected our request)`,
    );
    return {
      post_verdict: "internal",
      failure_reasons: failures,
      training_use_permitted: true,
      license_detected,
      license_version_detected,
    };
  }

  // ── Composer page transient failure (twice) → public_candidate ─────────────
  if (
    args.composer_attempt &&
    args.composer_attempt.status === null
  ) {
    failures.push("composer page unreachable (transient network/timeout, twice)");
  } else if (
    args.composer_attempt &&
    args.composer_attempt.status !== null &&
    args.composer_attempt.status >= 500 &&
    args.composer_attempt.status < 600
  ) {
    failures.push(
      `composer page persistent server error: HTTP ${args.composer_attempt.status}`,
    );
  }

  // ── License-family mismatch with claim → internal ──────────────────────────
  // Discrepancy on family between page and the recorded Slice-2 claim,
  // where the discovered family is still redistribution-compatible.
  // (Restrictive licenses are handled above as `excluded`.)
  const normalizeClaim = (s: string) => s.replace(/[-\s]/g, "").toUpperCase();
  const claimNorm = normalizeClaim(args.claimed_license);
  const detected = license_detected;
  if (detected != null) {
    const detectedNorm = normalizeClaim(detected);
    if (detectedNorm !== claimNorm) {
      failures.push(
        `license family mismatch — claim=${args.claimed_license}, page=${detected}`,
      );
      return {
        post_verdict: "internal",
        failure_reasons: failures,
        training_use_permitted: true,
        license_detected,
        license_version_detected,
      };
    }
  }

  // ── Empty / no attribution found anywhere → excluded (scraped-only rule) ───
  const noAttributionAnywhere =
    !args.creator_confirmed &&
    !args.title_confirmed &&
    args.site_license_family === null &&
    args.composer_license_family === null &&
    // require we actually fetched at least one of site or composer page
    ((args.site_attempt && args.site_attempt.status === 200) ||
      (args.composer_attempt && args.composer_attempt.status === 200));

  if (noAttributionAnywhere) {
    failures.push(
      "scraped-only: no creator, no license, no title found anywhere — hard exclusion per locked Section 5 rule",
    );
    return {
      post_verdict: "excluded",
      failure_reasons: failures,
      training_use_permitted: false,
      license_detected,
      license_version_detected,
    };
  }

  // ── Site root + composer page must both have been fetched OK ───────────────
  const siteOk = args.site_attempt?.status === 200;
  const composerOk =
    args.composer_attempt?.status === 200 && !args.composer_lookup_missing;

  // ── License must be found on the composer page (the per-song authoritative
  //    source). piano-midi.de's homepage does NOT carry the CC license marker —
  //    it's published only on per-composer pages. Slice 2.5 treats the composer
  //    page as the authoritative license signal; the site root is only a
  //    "domain is reachable" check. If composer page lacks a CC license, we
  //    record a failure regardless of site-root content.
  if (composerOk && args.composer_license_family == null) {
    failures.push(
      "composer page resolved but no CC license marker (text or rel=license URL) found",
    );
  }

  // ── Creator + title confirmation on the composer page ──────────────────────
  if (composerOk && !args.creator_confirmed) {
    failures.push(
      `composer page resolved but did not reference claimed creator "${args.claimed_creator}"`,
    );
  }
  if (composerOk && !args.title_confirmed) {
    failures.push(
      `composer page resolved but did not reference song title fragments for "${args.song_title}"`,
    );
  }

  // ── License version must be confidently parsed (STRICT) ────────────────────
  if (license_version_detected == null) {
    failures.push(
      "license version not confidently parsed (kickoff rule B STRICT — stays public_candidate)",
    );
  }

  // ── Per-song claim unsupported → internal ─────────────────────────────────
  //
  // When the composer page resolves cleanly (200), the GENERAL provenance
  // posture is confirmed (creator named + license marker present), BUT the
  // page text does NOT reference the song's title fragments, the upstream
  // canonically does not carry this specific work. The per-song attribution
  // claim is unsupported — the page exists, but it doesn't host THIS MIDI.
  //
  // This is distinct from a 4xx hard failure (whole composer page is gone).
  // It maps to the locked rule "creator/license claim is unsupported → internal"
  // at the per-song granularity.
  //
  // Guard: only fires when license + creator are confirmed (otherwise the
  // title-not-found may be due to a broader page anomaly, not a per-song
  // attribution problem; stay defensive at public_candidate).
  if (
    composerOk &&
    args.composer_license_family != null &&
    args.creator_confirmed &&
    !args.title_confirmed
  ) {
    return {
      post_verdict: "internal",
      failure_reasons: failures.concat([
        "per-song attribution unsupported: composer page is up with the right creator + license, but its content does not reference this work — the upstream canonically does not carry this MIDI",
      ]),
      training_use_permitted: true,
      license_detected,
      license_version_detected,
    };
  }

  // ── Decision ───────────────────────────────────────────────────────────────
  if (failures.length === 0) {
    return {
      post_verdict: "public",
      failure_reasons: [],
      training_use_permitted: true,
      license_detected,
      license_version_detected,
    };
  }

  // Partial — stays public_candidate (defensive default).
  return {
    post_verdict: "public_candidate",
    failure_reasons: failures,
    training_use_permitted: true,
    license_detected,
    license_version_detected,
  };
}

// ─── Verdict reason builder ──────────────────────────────────────────────────

function buildVerifierReason(args: {
  song_title: string;
  post_verdict: Verdict;
  license_detected: string | null;
  license_version_detected: string | null;
  evidence_url_chosen: string;
  failure_reasons: string[];
}): string {
  const parts: string[] = [];
  parts.push(`${args.song_title}.`);
  parts.push(`Slice 2.5 URL verification.`);
  if (args.license_detected) {
    if (args.license_version_detected) {
      parts.push(
        `License confirmed: ${args.license_detected}-${args.license_version_detected}.`,
      );
    } else {
      parts.push(
        `License detected: ${args.license_detected} (version not confidently parsed).`,
      );
    }
  } else {
    parts.push(`License not detected on verified pages.`);
  }
  parts.push(`Evidence URL: ${args.evidence_url_chosen}.`);
  if (args.post_verdict === "public") {
    parts.push(
      "Verdict: public — all site-level + per-song verification conditions passed.",
    );
  } else if (args.post_verdict === "public_candidate") {
    parts.push(
      "Verdict: public_candidate — verification attempted; partial evidence prevents promotion to public.",
    );
  } else if (args.post_verdict === "internal") {
    parts.push(
      "Verdict: internal — verification revealed hard failure (page gone or claim mismatch).",
    );
  } else {
    parts.push(
      "Verdict: excluded — verification revealed a restrictive license or no attribution at all.",
    );
  }
  if (args.failure_reasons.length > 0) {
    parts.push(`Failure reasons: ${args.failure_reasons.join("; ")}.`);
  }
  return parts.join(" ");
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Verify a single song's provenance claim against the live piano-midi.de site.
 *
 * Crawl order:
 *   1. http://piano-midi.de/ (site root) — confirm CC license text + version.
 *      Note: piano-midi.de does NOT serve HTTPS (port 443 returns plain HTTP
 *      bytes, not a TLS handshake). The canonical scheme is `http://`. Slice 2.5
 *      corrects the URL scheme that Slice 1/2 had incorrectly assumed as https://.
 *   2. composer page (e.g. piano-midi.de/bach.htm) — confirm creator, title, license
 *
 * `fetchImpl` defaults to global `fetch`. Pass a mock for tests.
 *
 * NOTE: the function does NOT rate-limit. Wrap calls with `await sleep(1000)`
 * inside the runner. Inside a single call, we make at most 2 fetches (site +
 * composer) plus retries — keep callers polite via `sleep` between calls.
 */
export async function verifyProvenanceUrl(
  input: VerifyInput,
): Promise<VerificationResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const today =
    input.today ??
    new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const fetchOpts = {
    timeoutMs: POLITENESS_DEFAULTS.TIMEOUT_MS,
    userAgent: POLITENESS_DEFAULTS.USER_AGENT,
    retryBackoffMs: POLITENESS_DEFAULTS.RETRY_BACKOFF_MS,
  };

  const attempts: VerificationAttempt[] = [];

  // ── Step 1: fetch site root ───────────────────────────────────────────────
  // piano-midi.de canonical scheme is HTTP (no HTTPS endpoint; port 443 returns
  // plain HTTP bytes, not a TLS handshake). Slice 1/2 incorrectly assumed
  // https://; Slice 2.5 corrects the canonical URL across records + manifest.
  const SITE_ROOT_URL = "http://piano-midi.de/";
  const siteResult = await fetchWithRetry(SITE_ROOT_URL, fetchImpl, fetchOpts);
  const siteText = htmlToText(siteResult.body);
  // Try the strongest signal first — a `<a rel="license" href="creativecommons.org/...">`
  // URL encodes both family and version unambiguously. Fall back to text-based parsing
  // only when the URL form is absent.
  const siteCcUrl = parseLicenseFromCcUrl(siteResult.body);
  const siteLicenseText = parseLicenseFamily(siteText);
  const siteLicense = {
    family: siteCcUrl.family ?? siteLicenseText.family,
    excerpt: siteLicenseText.excerpt,
  };
  const siteVersion = siteCcUrl.version ?? parseLicenseVersion(siteText);
  const siteAttempt: VerificationAttempt = {
    url: siteResult.url,
    status: siteResult.status,
    fetched_at: new Date().toISOString(),
    response_size_bytes: siteResult.size_bytes,
    license_text_excerpt: siteLicense.excerpt,
    retried: siteResult.retried,
    ...(siteResult.error ? { error: siteResult.error } : {}),
  };
  attempts.push(siteAttempt);

  // ── Step 2: fetch composer page ───────────────────────────────────────────
  const composerPage = COMPOSER_PAGES[input.song_id];
  let composerAttempt: VerificationAttempt | null = null;
  let composerText = "";
  let composerLicenseFamily: string | null = null;
  let composerLicenseVersion: string | null = null;
  let titleConfirmed = false;
  let creatorConfirmed = false;
  const composerLookupMissing = composerPage == null;

  if (composerPage) {
    const composerResult = await fetchWithRetry(
      composerPage.url,
      fetchImpl,
      fetchOpts,
    );
    composerText = htmlToText(composerResult.body);
    // CC URL in raw HTML (e.g. <a rel="license" href="…by-sa/3.0/de/…">) wins
    // when present; fall back to text-stripped detection.
    const composerCcUrl = parseLicenseFromCcUrl(composerResult.body);
    const lic = parseLicenseFamily(composerText);
    composerLicenseFamily = composerCcUrl.family ?? lic.family;
    composerLicenseVersion = composerCcUrl.version ?? parseLicenseVersion(composerText);
    composerAttempt = {
      url: composerResult.url,
      status: composerResult.status,
      fetched_at: new Date().toISOString(),
      response_size_bytes: composerResult.size_bytes,
      license_text_excerpt: lic.excerpt,
      retried: composerResult.retried,
      ...(composerResult.error ? { error: composerResult.error } : {}),
    };
    attempts.push(composerAttempt);

    // Lenient title fragment matching (case-insensitive, accents preserved via
    // entity decode; we lowercase the text but not the fragments — fragments
    // already include lowercase variants).
    const lowerText = composerText.toLowerCase();
    titleConfirmed = composerPage.titleFragments.some((frag) =>
      lowerText.includes(frag.toLowerCase()),
    );
    // Creator must appear by name on the composer page (or anywhere we crawled).
    const claimedCreatorLower = input.claimed_creator.toLowerCase();
    creatorConfirmed =
      lowerText.includes(claimedCreatorLower) ||
      siteText.toLowerCase().includes(claimedCreatorLower);
  }

  // ── Step 3: decide verdict ────────────────────────────────────────────────
  const decision = decideVerdict({
    song_id: input.song_id,
    song_title: input.song_title,
    claimed_license: input.claimed_license,
    claimed_creator: input.claimed_creator,
    site_attempt: siteAttempt,
    composer_attempt: composerAttempt,
    site_license_family: siteLicense.family,
    composer_license_family: composerLicenseFamily,
    site_license_version: siteVersion,
    composer_license_version: composerLicenseVersion,
    creator_confirmed: creatorConfirmed,
    title_confirmed: titleConfirmed,
    site_status: siteAttempt.status,
    composer_status: composerAttempt?.status ?? null,
    composer_lookup_missing: composerLookupMissing,
  });

  // ── Step 4: choose deepest verified URL ───────────────────────────────────
  // Per kickoff: per-song > composer-page > site-root.
  // We never reached an actual per-song URL — the deepest available is the
  // composer page IF it resolved. Otherwise site root.
  const evidenceUrl =
    composerAttempt?.status === 200 ? composerPage!.url : SITE_ROOT_URL;

  const verdictReason = buildVerifierReason({
    song_title: input.song_title,
    post_verdict: decision.post_verdict,
    license_detected: decision.license_detected,
    license_version_detected: decision.license_version_detected,
    evidence_url_chosen: evidenceUrl,
    failure_reasons: decision.failure_reasons,
  });

  return {
    song_id: input.song_id,
    pre_verdict: "public_candidate",
    post_verdict: decision.post_verdict,
    verification_attempts: attempts,
    license_detected: decision.license_detected,
    license_version_detected: decision.license_version_detected,
    arrangement_creator_confirmed: creatorConfirmed,
    song_title_confirmed: titleConfirmed,
    evidence_url_chosen: evidenceUrl,
    failure_reasons: decision.failure_reasons,
    training_use_permitted: decision.training_use_permitted,
    verified_at: today,
    verdict_reason: verdictReason,
  };
}
