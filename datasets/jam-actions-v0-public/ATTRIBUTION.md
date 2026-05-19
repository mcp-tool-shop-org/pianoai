# Attribution — `jam-actions-v0` (public subset)

This dataset combines three legally distinct layers. To use it lawfully, downstream consumers must credit each layer at the appropriate granularity. This document gives the per-layer facts plus copy-pasteable attribution strings.

For the underlying license obligations (share-alike, derivative-works rules), see [`LICENSE-DATASET.md`](LICENSE-DATASET.md). For per-song verification evidence, see [`provenance-verification.json`](provenance-verification.json).

## Three layers, briefly

| Layer | What it is | Who owns it | Status |
|---|---|---|---|
| Compositions | The musical works themselves (notes, structure, ideas) | Long-dead composers | Public domain (US + EU) |
| Arrangements | The MIDI realizations of those compositions | Bernd Krueger | CC-BY-SA-3.0-DE |
| Derivative records | These dataset records (traces, annotations, tokenizations, splits, evals) | `mcp-tool-shop-org` | CC-BY-SA-3.0-DE (share-alike inherited) |

Each downstream use must satisfy the most restrictive applicable layer. In practice for this dataset, that means **CC-BY-SA-3.0-DE** governs redistribution of the records, MIDI sidecars, REMI/ABC tokenizations, and SVG piano rolls.

## Layer 1 — Compositions (public domain)

All 8 compositions in this public subset are in the public domain in both the United States (composed/published pre-1929) and the European Union (composer death + 70 years). No per-composition attribution is legally required, but it is good scholarly practice. The per-composer status table:

| Composer | Died | EU PD since | Compositions in this subset | First-published year |
|---|---|---|---|---|
| Johann Sebastian Bach | 1750 | 1820 | Prelude in C Major, BWV 846 (Well-Tempered Clavier) | 1722 |
| Wolfgang Amadeus Mozart | 1791 | 1861 | Piano Sonata No. 16 in C Major, K. 545, I. Allegro | 1788 (publ. 1805) |
| Ludwig van Beethoven | 1827 | 1897 | Bagatelle No. 25 in A minor ("Für Elise"); Sonata Op. 13 "Pathétique", II Adagio cantabile | 1799 / 1810 |
| Frédéric Chopin | 1849 | 1919 | Nocturne in E♭ Major, Op. 9 No. 2; Prelude in E Minor, Op. 28 No. 4 | 1832 / 1838-39 |
| Robert Schumann | 1856 | 1926 | "Träumerei" from Kinderszenen, Op. 15 No. 7 | 1838 |
| Claude Debussy | 1918 | 1988 | "Clair de Lune" from Suite bergamasque, III | 1905 |

Debussy is the latest-deceased composer represented; his works entered EU public domain on 1989-01-01.

## Layer 2 — Arrangements (CC-BY-SA-3.0-DE)

**The MIDI bytes are not public domain.** They are arrangements created by Bernd Krueger and published at piano-midi.de under the **CC-BY-SA-3.0-DE** license (Creative Commons Attribution-ShareAlike 3.0 Germany).

- **Arranger:** Bernd Krueger
- **Source site:** http://piano-midi.de/ (HTTP only; no HTTPS endpoint exists — see Slice 2.5 verification report)
- **License:** Creative Commons Attribution-ShareAlike 3.0 Germany
- **License URL (canonical):** https://creativecommons.org/licenses/by-sa/3.0/de/
- **License URL (deed, English):** https://creativecommons.org/licenses/by-sa/3.0/de/deed.en
- **Per-song evidence URLs** (from Slice 2.5 URL verification — these were resolved live and the CC marker confirmed at the page level):

  | Song | Evidence URL |
  |---|---|
  | bach-prelude-c-major-bwv846 | http://piano-midi.de/bach.htm |
  | chopin-nocturne-op9-no2 | http://piano-midi.de/chopin.htm |
  | chopin-prelude-e-minor | http://piano-midi.de/chopin.htm |
  | clair-de-lune | http://piano-midi.de/debuss.htm |
  | fur-elise | http://piano-midi.de/beeth.htm |
  | mozart-k545-mvt1 | http://piano-midi.de/mozart.htm |
  | pathetique-mvt2 | http://piano-midi.de/beeth.htm |
  | schumann-traumerei | http://piano-midi.de/schum.htm |

Each record's `provenance.arrangement_evidence_url` field carries the per-song evidence URL byte-for-byte. The `arrangement_license` (`"CC-BY-SA"`) and `arrangement_license_version` (`"3.0"`) fields are also present on every record.

### Note on jurisdiction (CC-BY-SA-3.0-DE vs CC-BY-SA-3.0 international)

The "DE" suffix refers to the German jurisdiction port of CC-BY-SA-3.0. The substantive obligations (attribution; share-alike; indicate changes; do not impose additional restrictions) are equivalent to the international 3.0 license. The governing law for the upstream arrangements is German law. Downstream users in non-DE jurisdictions should consult the CC localization that applies to them, or fall back to the international 3.0 deed, but the safe path is: declare CC-BY-SA-3.0-DE on your derivative and you have honored the upstream cleanly.

HuggingFace's dataset-card YAML enumerates `cc-by-sa-3.0` and does **not** include a `-de` jurisdiction slug. The README.md frontmatter therefore declares `license: cc-by-sa-3.0`; the precise DE jurisdiction is documented here, in the README body, and in `LICENSE-DATASET.md`. The obligations are identical; only the governing-law label differs.

## Layer 3 — Derivative records (CC-BY-SA-3.0-DE via share-alike)

Each record in this dataset is derived from a CC-BY-SA-3.0-DE arrangement. The share-alike clause is sticky: the dataset itself is licensed under CC-BY-SA-3.0-DE.

- **Maintainer:** mcp-tool-shop-org
- **Repository:** https://github.com/mcp-tool-shop-org/ai-jam-sessions
- **License:** CC-BY-SA-3.0-DE
- **Citation file:** [`CITATION.cff`](CITATION.cff)
- **Version:** 0.4.3
- **Source commit:** the records in this package were produced at source-corpus commit `4b0f181` (tag `jam-actions-v0-rc-gate-revised-2026-05-19` for the Slice 22 RC-gate revised state; Slice 23.5 reproducibility-cleanup tag carries the current operational hardening). The 6-record Slice 11 enrichment overlay is the most recent record-content change; Slice 21 added a 7th enrichment to the Schumann m045-048 record. Slices 22, 23 / 23.5, 24, and 24.5 modified no record content (release-gate revision + operator-aloneness audit + reproducibility cleanup + publication-dry-run + dataset-card polish respectively).

### Annotation provenance — who wrote what (human-in-the-loop)

The `annotation_target` and `target_trace` content on the 115 records was produced by a **human-in-the-loop** process. The HuggingFace dataset card declares `annotations_creators: [expert-generated, machine-generated]` and `language_creators: [expert-generated, machine-generated]` to capture both populations honestly; this section gives the detail behind those slugs.

- **Operator (mcp-tool-shop-org):** authored the schema, the enrichment rubric, the held-out-test discipline, the corpus selection, the per-record acceptance bar, the release-gate axes and thresholds, and the final review of every enrichment. Every annotation in the package was either operator-written or operator-reviewed before shipping.
- **AI agents (under operator direction, models qwen2.5:7b and Claude in the source repo):** drafted the bulk of annotation_target prose for the 6 records enriched in Slice 11 (Pathétique m025-028 / m029-032; Schumann m045-048; Bach m045-048 / m049-052 / m053-056) and the 1 record rewritten in Slice 21 (Schumann m045-048, R6-aware rewrite). Agent drafts were explicitly constrained to be MIDI-grounded (anchorable to events the inspector tools can verify) and were operator-reviewed before each enrichment was admitted to the durable overlay (`enrichment-overrides.json`).
- **Why both slugs apply:** the substantive content quality is the operator's responsibility (`expert-generated` is the closer fit by domain-expertise standard), and the agents performed substantial first-draft work under explicit human direction (`machine-generated` is honest about AI involvement). Picking only one slug would obscure either the human review (if `machine-generated` alone) or the AI involvement (if `expert-generated` alone). HF allows the list form; we use it.
- **What `task_ids` would NOT capture:** HF's `task_ids` enum is dominated by NLP-specific subtasks (extractive QA, abstractive summarization, etc.) that do not fit MCP tool-use traces over symbolic music. The field stays unpopulated; the Slice 24.5 dataset-card-polish doc explains the decision.

## Required redistribution attribution

If you redistribute records, traces, tokenizations, MIDI sidecars, or SVG piano rolls from this dataset (in whole or in part), you MUST do all of the following:

1. **Attribute the dataset.** Cite `mcp-tool-shop-org` and link the source repository.
2. **Attribute the upstream arrangements.** Cite Bernd Krueger and piano-midi.de, naming CC-BY-SA-3.0-DE.
3. **Release derivatives under a compatible share-alike license.** CC-BY-SA-3.0-DE, CC-BY-SA-3.0 (international), or CC-BY-SA-4.0 are all valid choices; the v4.0 compatibility is via the CC 4.0 → 3.0 one-way compatibility annex.
4. **Indicate any changes you made.** A diff log, a changelog entry, or a "Modifications: ..." line is sufficient.
5. **Do not imply endorsement.** Don't suggest `mcp-tool-shop-org`, Bernd Krueger, or piano-midi.de endorse your derivative.

No per-composition attribution is required, because the underlying compositions are public domain. But naming the composers is good practice for any musicological context.

## Copy-pasteable attribution strings

### BibTeX (dataset citation)

```bibtex
@dataset{jam_actions_v0_public_2026,
  author       = {mcp-tool-shop-org},
  title        = {jam-actions-v0 — AI Jam Sessions tool-use traces (public subset)},
  version      = {0.4.3},
  year         = {2026},
  license      = {CC-BY-SA-3.0-DE},
  url          = {https://github.com/mcp-tool-shop-org/ai-jam-sessions},
  note         = {MIDI arrangements by Bernd Krueger, piano-midi.de, CC-BY-SA-3.0-DE.}
}
```

### Plain-text reference (paper / report)

> jam-actions-v0 (public subset), version 0.4.3, mcp-tool-shop-org, 2026. Licensed under CC-BY-SA-3.0-DE. MIDI arrangements by Bernd Krueger, https://piano-midi.de/, CC-BY-SA-3.0-DE. https://github.com/mcp-tool-shop-org/ai-jam-sessions.

### In-figure caption (single line)

> Source: jam-actions-v0 (mcp-tool-shop-org, CC-BY-SA-3.0-DE); MIDI by Bernd Krueger / piano-midi.de, CC-BY-SA-3.0-DE.

### One-liner credit (slide footer, social card, README badge)

> jam-actions-v0 — mcp-tool-shop-org + Bernd Krueger / piano-midi.de, CC-BY-SA-3.0-DE.

## On the two demoted songs

Two `public_candidate` songs from the source corpus (Satie Gymnopédie No. 1; Debussy Arabesque No. 1) **could not be verified** against piano-midi.de during Slice 2.5 URL verification — Satie because piano-midi.de does not carry Satie at all (HTTP 418 on the candidate page, no Satie entry in the site's catalog metadata); Debussy Arabesque because the composer page is reachable and license-confirmed but does not list Arabesque (the site carries only Suite bergamasque and Children's Corner under Debussy).

Those records are **not** included in this public subset. They remain in the source repository at `record_verdict: "internal"` for internal use only. They carry **no claim** of CC-BY-SA-3.0-DE here. A future slice may re-attribute them to a verifiable upstream (Mutopia Project, IMSLP MIDI section, kunstderfuge.com mirrors); until then, treat any MIDI bytes attributed to those works in our corpus as unverified provenance.

## Verification evidence

All 8 songs in this subset were verified by live HTTP fetch during Slice 2.5 (2026-05-17). The full report is `provenance-verification.json` in this package. It includes, per song: pre-verdict, post-verdict, license detected, license version detected, arrangement_creator confirmed, song_title confirmed, evidence URL chosen, HTTP attempts, and HTTP status codes. The verifier ran politely (1 req/sec, 10s timeout, single retry on 5xx).

## Questions / corrections

Open an issue at https://github.com/mcp-tool-shop-org/ai-jam-sessions. License-corner-case questions (jurisdiction conflicts, share-alike compatibility for a downstream license you're considering) are welcome — the layered structure here is real and we'd rather discuss it than have it misapplied.
