// ─── jam-actions-v0 Provenance Rule Engine ────────────────────────────────────
//
// Classifies a song's source metadata into a provenance verdict.
//
// Input:  a SongProvenance input bag (parsed source string + composition facts)
// Output: VerdictResult { verdict, verdict_reason, extracted }
//
// Verdict enum (per synthesis Section 5, amended Slice 1, widened Slice 2.5):
//   public_candidate — meets initial rules; awaits Slice 2.5 verification
//   internal         — legally usable but doesn't meet public_candidate bar
//   excluded         — known copyrighted without license, or rights-incompatible
//   public           — Slice 2.5 URL verification confirmed source URL resolves,
//                      license text preserved at source, license version confirmed,
//                      arrangement creator confirmed on per-song / composer page.
//                      This rule engine still CANNOT emit `"public"` — promotion
//                      to public is performed exclusively by the URL verifier in
//                      `provenance-url-verifier.ts` after external HTTP checks.
//
// Defensive-parsing principle: ambiguous source → lower-tier verdict.
// Better to under-classify (internal) than to over-classify (public_candidate).
//
// Public-domain cutoffs (as of 2026):
//   US:  works published before 1 Jan 1929 are PD (URAA + copyright extensions)
//   EU:  life + 70 years. For anonymous/traditional works, publication + 70 years.
//   When composer death year is unknown, flag as uncertain → downgrade to internal.
//
// Source-string format (known pattern from Slice 1 fixture):
//   "Bernd Krueger, Source: piano-midi.de (CC BY-SA)"
//   → creator: "Bernd Krueger", url: "https://piano-midi.de/", license: "CC-BY-SA"
//
// Redistribution-compatible licenses recognized:
//   CC-BY, CC-BY-SA, CC0, CC-BY-4.0, CC-BY-SA-4.0, CC-BY-3.0, CC-BY-SA-3.0,
//   CC0-1.0, public domain
// ─────────────────────────────────────────────────────────────────────────────

// ─── Public types ────────────────────────────────────────────────────────────

/**
 * The four valid record verdicts in the dataset.
 *
 * The rule engine in this module emits only the first three:
 *   - `public_candidate`, `internal`, `excluded`
 *
 * `public` is widened into the type as of Slice 2.5 so consumers (records,
 * schema, validator, verifier) can represent the promoted state, but it is
 * never produced by `classifyProvenance()`. Only the Slice 2.5 URL verifier
 * (`provenance-url-verifier.ts`) may assign `public` after a successful
 * external verification chain (site root → composer page → song confirmation
 * with creator + license + license version).
 */
export type Verdict = "public_candidate" | "internal" | "excluded" | "public";

/** Raw composition-level facts the caller supplies. */
export interface CompositionFacts {
  /** Displayed title (for the verdict_reason string). */
  title?: string;
  /** Displayed composer name (e.g. "Ludwig van Beethoven"). */
  composer?: string;
  /**
   * Best-known publication or composition year.
   * Use the EARLIER of composition vs first publication.
   */
  compositionYear?: number;
  /**
   * Composer death year. Required for EU life+70 calculation.
   * null = composer still living.
   * undefined = unknown (→ EU status cannot be determined → flag uncertain).
   */
  composerDeathYear?: number | null;
  /**
   * Override: if you already know the PD status from authoritative metadata,
   * pass it here to skip the heuristic. Values: "public_domain" | "copyrighted" | "unknown".
   */
  pdStatusUsOverride?: "public_domain" | "copyrighted" | "unknown";
  pdStatusEuOverride?: "public_domain" | "copyrighted" | "unknown";
}

/** Extracted provenance fields parsed from the source string. */
export interface ExtractedProvenance {
  arrangement_creator: string | null;
  arrangement_license: string | null;
  arrangement_evidence_url: string | null;
  /** Raw source string (for audit trail). */
  source_string_raw: string | null;
  /** Whether the source string was recognized as a known pattern. */
  source_pattern_recognized: boolean;
}

export interface VerdictResult {
  verdict: Verdict;
  verdict_reason: string;
  /** Composition-level PD status derived or overridden. */
  composition_pd_status_us: "public_domain" | "copyrighted" | "unknown";
  composition_pd_status_eu: "public_domain" | "copyrighted" | "unknown";
  extracted: ExtractedProvenance;
  /**
   * Open questions the rule engine couldn't resolve with confidence.
   * Human review required before promotion beyond current verdict.
   */
  open_questions: string[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * US public domain cutoff year (as of 2026).
 * Works published strictly BEFORE this year are PD in the US under copyright
 * extensions (URAA, CTEA). Works published 1928 or earlier are PD.
 * Works published 1929 or later require case-by-case analysis.
 */
const US_PD_PUBLICATION_CUTOFF_YEAR = 1929;

/**
 * EU life + 70 years rule.
 * A work enters PD on 1 Jan of the 71st year after the author's death.
 */
const EU_LIFE_PLUS_YEARS = 70;

/** Current year for cutoff calculations. */
const CURRENT_YEAR = 2026;

/**
 * Licenses recognized as redistribution-compatible (case-insensitive matching).
 * Maps normalized alias → canonical SPDX-ish identifier.
 *
 * Rule: if the source string says "CC BY-SA" without a version number, record
 * as "CC-BY-SA" (no version). Verdict can still be public_candidate; the version
 * (e.g. 3.0 vs 4.0) is resolved in Slice 2.5.
 */
const REDISTRIBUTION_COMPATIBLE_LICENSES: Record<string, string> = {
  // Version-less aliases
  "cc by": "CC-BY",
  "cc by-sa": "CC-BY-SA",
  "cc by-nd": "CC-BY-ND", // ND = no-derivatives; NOT redistribution-compatible for training
  "cc by-nc": "CC-BY-NC", // NC = non-commercial; NOT redistribution-compatible for training
  "cc0": "CC0",
  "public domain": "CC0",
  // SPDX versioned
  "cc-by-4.0": "CC-BY-4.0",
  "cc-by-sa-4.0": "CC-BY-SA-4.0",
  "cc-by-3.0": "CC-BY-3.0",
  "cc-by-sa-3.0": "CC-BY-SA-3.0",
  "cc0-1.0": "CC0-1.0",
  "cc by 4.0": "CC-BY-4.0",
  "cc by-sa 4.0": "CC-BY-SA-4.0",
  "cc by 3.0": "CC-BY-3.0",
  "cc by-sa 3.0": "CC-BY-SA-3.0",
};

/**
 * Licenses that are NOT redistribution-compatible for training use.
 * Matching any of these → arrangement is NOT usable for public_candidate.
 */
const NON_REDISTRIBUTION_LICENSES: string[] = [
  "cc by-nd",
  "cc-by-nd",
  "cc by-nc",
  "cc-by-nc",
  "cc by-nc-sa",
  "cc-by-nc-sa",
  "cc by-nc-nd",
  "cc-by-nc-nd",
  "all rights reserved",
  "© ",
  "copyright",
];

/**
 * piano-midi.de URL normalization.
 * The source string "Source: piano-midi.de" maps to this canonical URL.
 *
 * Slice 2.5 correction: piano-midi.de does NOT serve HTTPS — port 443 returns
 * plain HTTP bytes, not a TLS handshake. The site's only canonical scheme is
 * `http://`. Earlier slices incorrectly stamped records with `https://`; the
 * Slice 2.5 URL verifier corrects this on all promoted/verified records.
 */
const PIANO_MIDI_DE_URL = "http://piano-midi.de/";

// ─── Source-string parser ─────────────────────────────────────────────────────

/**
 * Parse the song's `source` field (a freeform string) into structured fields.
 *
 * Known pattern (Slice 1 fixture):
 *   "Bernd Krueger, Source: piano-midi.de (CC BY-SA)"
 *   → creator: "Bernd Krueger"
 *     url:     "https://piano-midi.de/"
 *     license: "CC-BY-SA"
 *
 * Defensive: if the string doesn't match a recognized pattern, returns nulls
 * and sets source_pattern_recognized = false. The verdict engine will then
 * route to `internal` and add an open question.
 */
export function parseSourceString(source: string | null | undefined): {
  extracted: ExtractedProvenance;
  openQuestions: string[];
} {
  const openQuestions: string[] = [];

  if (!source || source.trim() === "") {
    return {
      extracted: {
        arrangement_creator: null,
        arrangement_license: null,
        arrangement_evidence_url: null,
        source_string_raw: source ?? null,
        source_pattern_recognized: false,
      },
      openQuestions: ["Source field is empty or missing. Provenance unknown."],
    };
  }

  const raw = source.trim();

  // ── Pattern 1: "Creator, Source: domain (LICENSE)" ─────────────────────────
  // e.g. "Bernd Krueger, Source: piano-midi.de (CC BY-SA)"
  const pianoMidiDePattern =
    /^([^,]+),\s*Source:\s*(piano-midi\.de)\s*\(([^)]+)\)\s*$/i;
  const m1 = raw.match(pianoMidiDePattern);
  if (m1) {
    const creatorRaw = m1[1].trim();
    const licenseRaw = m1[3].trim();
    const normalizedLicense = normalizeLicense(licenseRaw);

    return {
      extracted: {
        arrangement_creator: creatorRaw,
        arrangement_license: normalizedLicense ?? licenseRaw, // preserve raw if not recognized
        arrangement_evidence_url: PIANO_MIDI_DE_URL,
        source_string_raw: raw,
        source_pattern_recognized: true,
      },
      openQuestions:
        normalizedLicense === null
          ? [
              `License "${licenseRaw}" in source string is not in the recognized redistribution-compatible list. Human review required.`,
            ]
          : [],
    };
  }

  // ── Pattern 2: bare URL ────────────────────────────────────────────────────
  // e.g. "https://example.com/midi/song.mid"
  const urlPattern = /^https?:\/\//i;
  if (urlPattern.test(raw)) {
    openQuestions.push(
      `Source is a bare URL with no creator or license. Cannot determine arrangement provenance from URL alone.`,
    );
    return {
      extracted: {
        arrangement_creator: null,
        arrangement_license: null,
        arrangement_evidence_url: raw,
        source_string_raw: raw,
        source_pattern_recognized: false,
      },
      openQuestions,
    };
  }

  // ── Unrecognized pattern ───────────────────────────────────────────────────
  openQuestions.push(
    `Source string "${raw}" does not match any recognized pattern. Manual provenance review required.`,
  );
  return {
    extracted: {
      arrangement_creator: null,
      arrangement_license: null,
      arrangement_evidence_url: null,
      source_string_raw: raw,
      source_pattern_recognized: false,
    },
    openQuestions,
  };
}

// ─── PD status calculator ────────────────────────────────────────────────────

export interface PdStatusResult {
  us: "public_domain" | "copyrighted" | "unknown";
  eu: "public_domain" | "copyrighted" | "unknown";
  openQuestions: string[];
}

/**
 * Determine composition PD status from composition facts.
 *
 * US rule: works published before 1 Jan 1929 are PD (as of 2026).
 *   - If compositionYear < 1929 → public_domain
 *   - If compositionYear >= 1929 → copyrighted (requires case-by-case for
 *     unpublished/renewal/registration, but we conservatively flag copyrighted)
 *   - If compositionYear unknown → unknown
 *
 * EU rule: life + 70 years. Work enters PD on 1 Jan of year (death + 71).
 *   - If composerDeathYear is known: PD if (deathYear + 71) <= CURRENT_YEAR
 *   - If composerDeathYear is null (living): copyrighted
 *   - If composerDeathYear is undefined (unknown): unknown → flag uncertain
 *   - For "Traditional" / anonymous works: use publication year + 70 for EU
 *     (EU Directive 2006/116/EC Art. 1(3): for anonymous works, 70 years from
 *     publication; if unpublished, 70 years from creation).
 *
 * NOTE: This heuristic covers the vast majority of public-domain classical
 * repertoire. Edge cases (works registered but not published, post-1976 US
 * works with renewal complications, co-authorships, etc.) are flagged as
 * uncertain for human review rather than auto-decided.
 */
export function calcPdStatus(facts: CompositionFacts): PdStatusResult {
  const openQuestions: string[] = [];

  // Apply overrides first
  let us: "public_domain" | "copyrighted" | "unknown";
  let eu: "public_domain" | "copyrighted" | "unknown";

  if (facts.pdStatusUsOverride) {
    us = facts.pdStatusUsOverride;
  } else if (facts.compositionYear === undefined || facts.compositionYear === null) {
    us = "unknown";
    openQuestions.push("Composition year unknown — cannot determine US PD status.");
  } else if (facts.compositionYear < US_PD_PUBLICATION_CUTOFF_YEAR) {
    us = "public_domain";
  } else {
    // 1929 or later — conservatively copyrighted; further analysis may be needed
    us = "copyrighted";
  }

  if (facts.pdStatusEuOverride) {
    eu = facts.pdStatusEuOverride;
  } else {
    const composer = facts.composer ?? "";
    const isTraditional =
      /^traditional$/i.test(composer.trim()) || /^anonymous$/i.test(composer.trim());

    if (isTraditional) {
      // Traditional / anonymous: EU life+70 based on publication year
      if (facts.compositionYear === undefined || facts.compositionYear === null) {
        eu = "unknown";
        openQuestions.push(
          "Traditional/anonymous work but composition year unknown — cannot determine EU PD status.",
        );
      } else if (facts.compositionYear + EU_LIFE_PLUS_YEARS < CURRENT_YEAR) {
        eu = "public_domain";
      } else {
        eu = "copyrighted";
      }
    } else if (facts.composerDeathYear === undefined) {
      // Death year not supplied — cannot determine EU status
      eu = "unknown";
      openQuestions.push(
        `Composer death year unknown for "${composer}" — cannot determine EU PD status (life+70 rule). Human verification required.`,
      );
    } else if (facts.composerDeathYear === null) {
      // Living composer
      eu = "copyrighted";
    } else {
      // Known death year
      const pdYearEu = facts.composerDeathYear + EU_LIFE_PLUS_YEARS + 1;
      eu = pdYearEu <= CURRENT_YEAR ? "public_domain" : "copyrighted";
    }
  }

  return { us, eu, openQuestions };
}

// ─── License normalizer ───────────────────────────────────────────────────────

/**
 * Normalize a license string to a canonical SPDX-ish identifier.
 * Returns null if the license is not recognized.
 */
export function normalizeLicense(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  return REDISTRIBUTION_COMPATIBLE_LICENSES[key] ?? null;
}

/**
 * Returns true if the normalized license is redistribution-compatible
 * (suitable for training data use).
 */
export function isRedistributionCompatible(normalized: string | null): boolean {
  if (!normalized) return false;
  const key = normalized.toLowerCase();
  // Check non-redistribution list first
  for (const bad of NON_REDISTRIBUTION_LICENSES) {
    if (key.includes(bad.toLowerCase())) return false;
  }
  // Must be in the recognized list (already normalized means it was found)
  return true;
}

// ─── Main rule engine ─────────────────────────────────────────────────────────

/**
 * Input bag for the rule engine. Combines source-string parsing input and
 * composition facts.
 */
export interface ProvenanceInput {
  /** The song's `source` field (freeform string from song JSON). */
  source?: string | null;
  /** Composition facts used for PD status calculation. */
  composition: CompositionFacts;
  /** ISO date string for the verifier timestamp (defaults to today). */
  scanDate?: string;
}

/**
 * Run the provenance rule engine on a single song's metadata.
 *
 * Returns a VerdictResult with:
 *   - verdict: "public_candidate" | "internal" | "excluded"
 *   - verdict_reason: human-readable explanation
 *   - composition_pd_status_us / eu
 *   - extracted: parsed source fields
 *   - open_questions: list of ambiguities requiring human review
 *
 * Verdict hierarchy (per synthesis Section 5):
 *   public_candidate requires ALL of:
 *     1. Composition PD in US AND EU, OR licensed for redistribution+training
 *     2. Arrangement under redistribution-compatible license per metadata
 *     3. arrangement_creator named (not null, not "unknown")
 *     4. arrangement_evidence_url populated
 *
 *   excluded: known-copyrighted composition without license
 *   internal: anything that doesn't reach public_candidate and isn't excluded
 *
 * NOTE: `public` is NOT assignable here. That's Slice 2.5 (HTTP verification).
 */
export function classifyProvenance(input: ProvenanceInput): VerdictResult {
  const openQuestions: string[] = [];

  // Step 1: Parse source string
  const { extracted, openQuestions: sourceOq } = parseSourceString(input.source);
  openQuestions.push(...sourceOq);

  // Step 2: Determine composition PD status
  const pd = calcPdStatus(input.composition);
  openQuestions.push(...pd.openQuestions);

  const compositionPdUs = pd.us;
  const compositionPdEu = pd.eu;

  // Step 3: Check if composition is clearly copyrighted (→ excluded)
  //
  // "excluded" means known-copyrighted composition without a license.
  // We apply this when BOTH US and EU are copyrighted AND the arrangement
  // has no explicit redistribution license override.
  //
  // Note: We only assign excluded when both jurisdictions are copyrighted,
  // because "unknown" means we can't confirm it's copyrighted. Unknown →
  // routes to internal (per defensive principle).
  const compositionCopyrighted =
    compositionPdUs === "copyrighted" && compositionPdEu === "copyrighted";

  if (compositionCopyrighted) {
    const reason = buildReason({
      verdict: "excluded",
      compositionPdUs,
      compositionPdEu,
      extracted,
      facts: input.composition,
      note: "Composition is copyrighted in both US and EU. Cannot assign public_candidate without explicit redistribution + training license from rights holder.",
    });
    return {
      verdict: "excluded",
      verdict_reason: reason,
      composition_pd_status_us: compositionPdUs,
      composition_pd_status_eu: compositionPdEu,
      extracted,
      open_questions: openQuestions,
    };
  }

  // Step 4: Check if composition PD status is uncertain
  const compositionPdUncertain =
    compositionPdUs === "unknown" || compositionPdEu === "unknown";

  if (compositionPdUncertain) {
    // Can't confirm PD → cannot reach public_candidate. Route to internal.
    const reason = buildReason({
      verdict: "internal",
      compositionPdUs,
      compositionPdEu,
      extracted,
      facts: input.composition,
      note: "Composition PD status uncertain in at least one jurisdiction. Cannot assign public_candidate without confirmed PD status or explicit license. Human review required.",
    });
    return {
      verdict: "internal",
      verdict_reason: reason,
      composition_pd_status_us: compositionPdUs,
      composition_pd_status_eu: compositionPdEu,
      extracted,
      open_questions: openQuestions,
    };
  }

  // At this point: composition is PD in both US and EU. Now check arrangement.

  // Step 5: Check arrangement fields

  // 5a: arrangement_creator must be named
  if (!extracted.arrangement_creator) {
    const reason = buildReason({
      verdict: "internal",
      compositionPdUs,
      compositionPdEu,
      extracted,
      facts: input.composition,
      note: "Arrangement creator not identified from source metadata. Cannot assign public_candidate without named creator.",
    });
    return {
      verdict: "internal",
      verdict_reason: reason,
      composition_pd_status_us: compositionPdUs,
      composition_pd_status_eu: compositionPdEu,
      extracted,
      open_questions: openQuestions,
    };
  }

  // 5b: arrangement_evidence_url must be populated
  if (!extracted.arrangement_evidence_url) {
    const reason = buildReason({
      verdict: "internal",
      compositionPdUs,
      compositionPdEu,
      extracted,
      facts: input.composition,
      note: "Arrangement evidence URL not found in source metadata. Cannot assign public_candidate without evidence URL.",
    });
    return {
      verdict: "internal",
      verdict_reason: reason,
      composition_pd_status_us: compositionPdUs,
      composition_pd_status_eu: compositionPdEu,
      extracted,
      open_questions: openQuestions,
    };
  }

  // 5c: arrangement must be under a redistribution-compatible license
  if (!extracted.arrangement_license) {
    const reason = buildReason({
      verdict: "internal",
      compositionPdUs,
      compositionPdEu,
      extracted,
      facts: input.composition,
      note: "No arrangement license identified. Cannot assign public_candidate without explicit redistribution-compatible license.",
    });
    return {
      verdict: "internal",
      verdict_reason: reason,
      composition_pd_status_us: compositionPdUs,
      composition_pd_status_eu: compositionPdEu,
      extracted,
      open_questions: openQuestions,
    };
  }

  if (!isRedistributionCompatible(extracted.arrangement_license)) {
    // The license was parsed but is NOT redistribution-compatible (e.g. CC BY-NC)
    openQuestions.push(
      `Arrangement license "${extracted.arrangement_license}" is not redistribution-compatible for training use.`,
    );
    const reason = buildReason({
      verdict: "internal",
      compositionPdUs,
      compositionPdEu,
      extracted,
      facts: input.composition,
      note: `Arrangement license "${extracted.arrangement_license}" does not permit redistribution for training. Route to internal.`,
    });
    return {
      verdict: "internal",
      verdict_reason: reason,
      composition_pd_status_us: compositionPdUs,
      composition_pd_status_eu: compositionPdEu,
      extracted,
      open_questions: openQuestions,
    };
  }

  // 5d: source pattern must have been recognized
  if (!extracted.source_pattern_recognized) {
    // We extracted some fields but the source string pattern wasn't clean.
    // Defensive: route to internal and flag for review.
    openQuestions.push(
      "Source string matched an unrecognized pattern. Although some fields were extracted, they may be unreliable. Human review required before promotion to public_candidate.",
    );
    const reason = buildReason({
      verdict: "internal",
      compositionPdUs,
      compositionPdEu,
      extracted,
      facts: input.composition,
      note: "Source string pattern unrecognized; extracted fields may be unreliable. Routing to internal per defensive-parsing principle.",
    });
    return {
      verdict: "internal",
      verdict_reason: reason,
      composition_pd_status_us: compositionPdUs,
      composition_pd_status_eu: compositionPdEu,
      extracted,
      open_questions: openQuestions,
    };
  }

  // Step 6: All public_candidate conditions met
  const reason = buildReason({
    verdict: "public_candidate",
    compositionPdUs,
    compositionPdEu,
    extracted,
    facts: input.composition,
    note: "All initial public_candidate rules met. Awaiting Slice 2.5 verification: source URL resolves, license text preserved at source, license version confirmed. Until verified, treat as internal for distribution.",
  });

  return {
    verdict: "public_candidate",
    verdict_reason: reason,
    composition_pd_status_us: compositionPdUs,
    composition_pd_status_eu: compositionPdEu,
    extracted,
    open_questions: openQuestions,
  };
}

// ─── Verdict reason builder ───────────────────────────────────────────────────

interface BuildReasonInput {
  verdict: Verdict;
  compositionPdUs: "public_domain" | "copyrighted" | "unknown";
  compositionPdEu: "public_domain" | "copyrighted" | "unknown";
  extracted: ExtractedProvenance;
  facts: CompositionFacts;
  note: string;
}

function buildReason(r: BuildReasonInput): string {
  const parts: string[] = [];

  const title = r.facts.title ?? "Unknown title";
  const composer = r.facts.composer ?? "Unknown composer";
  const year = r.facts.compositionYear != null ? `(${r.facts.compositionYear})` : "";

  parts.push(`${title} ${year} by ${composer}.`.replace(/\s+/g, " ").trim());
  parts.push(
    `Composition: US=${r.compositionPdUs}, EU=${r.compositionPdEu}.`,
  );

  if (r.extracted.arrangement_creator) {
    parts.push(`Arrangement by ${r.extracted.arrangement_creator}.`);
  }
  if (r.extracted.arrangement_license) {
    parts.push(`License: ${r.extracted.arrangement_license}.`);
  }
  if (r.extracted.arrangement_evidence_url) {
    parts.push(`Evidence: ${r.extracted.arrangement_evidence_url}.`);
  }

  parts.push(r.note);

  return parts.join(" ");
}
