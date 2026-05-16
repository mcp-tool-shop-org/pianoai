# jam-actions-v0 Provenance Scan Report

**Scan date:** 2026-05-16
**Scope:** All ready songs in the song library
**Rule engine version:** Slice 2 (initial classification; no URL verification)

## Summary

| Verdict | Count |
|---|---|
| `public_candidate` | 10 |
| `internal` | 2 |
| `excluded` | 12 |
| **Total** | **24** |

> **Note:** `public_candidate` songs are treated as `internal` for distribution purposes until
> Slice 2.5 verification (URL resolves, license text preserved, version confirmed). No song
> reaches `public` verdict in this slice.

---

## Recommended Pilot Candidates

These are the strongest `public_candidate` songs for the internal pilot (Slice 3+),
pending Slice 2.5 source-evidence verification.

### Fur Elise (Bagatelle No. 25 in A minor) (`fur-elise`)

- **Genre:** classical
- **Composer:** Ludwig van Beethoven
- **Arrangement:** Bernd Krueger — CC-BY-SA
- **Evidence URL:** https://piano-midi.de/
- **Pilot rationale:** Slice 1 reference record — same source/license as the existing fur-elise-m001-008.json. Regression test confirms public_candidate verdict. Highest confidence for pilot continuity.

### Prelude in C Major, BWV 846 (Well-Tempered Clavier) (`bach-prelude-c-major-bwv846`)

- **Genre:** classical
- **Composer:** Johann Sebastian Bach
- **Arrangement:** Bernd Krueger — CC-BY-SA
- **Evidence URL:** https://piano-midi.de/
- **Pilot rationale:** J.S. Bach (d. 1750): deepest EU PD in the set. Pedagogically essential arpeggiated texture. Same verified source (Bernd Krueger / piano-midi.de / CC BY-SA).

### Piano Sonata No. 16 in C Major, K. 545, I. Allegro (`mozart-k545-mvt1`)

- **Genre:** classical
- **Composer:** Wolfgang Amadeus Mozart
- **Arrangement:** Bernd Krueger — CC-BY-SA
- **Evidence URL:** https://piano-midi.de/
- **Pilot rationale:** Mozart K545 (d. 1791): early Classical, extremely well-known, pedagogical gold standard. Same verified source. Strong genre diversity from Für Elise.

### Traumerei (Dreaming) from Kinderszenen (`schumann-traumerei`)

- **Genre:** classical
- **Composer:** Robert Schumann
- **Arrangement:** Bernd Krueger — CC-BY-SA
- **Evidence URL:** https://piano-midi.de/
- **Pilot rationale:** Schumann (d. 1856): Romantic-era representative. Lyrical, expressive texture contrasts with Bach's baroque counterpoint. Same verified source.

### Nocturne in Eb Major, Op. 9 No. 2 (`chopin-nocturne-op9-no2`)

- **Genre:** classical
- **Composer:** Frederic Chopin
- **Arrangement:** Bernd Krueger — CC-BY-SA
- **Evidence URL:** https://piano-midi.de/
- **Pilot rationale:** Additional public_candidate — meets initial rules. Source and license as recorded; verify via Slice 2.5.

---

## Full Scan Results

### public_candidate (10)

These songs meet all initial provenance rules and are candidates for public release
pending Slice 2.5 verification.

| Song ID | Title | Genre | Composer | Arrangement By | License | Evidence URL |
|---|---|---|---|---|---|---|
| `bach-prelude-c-major-bwv846` | Prelude in C Major, BWV 846 (Well-Tempered Clavier) | classical | Johann Sebastian Bach | Bernd Krueger | CC-BY-SA | https://piano-midi.de/ |
| `chopin-nocturne-op9-no2` | Nocturne in Eb Major, Op. 9 No. 2 | classical | Frederic Chopin | Bernd Krueger | CC-BY-SA | https://piano-midi.de/ |
| `chopin-prelude-e-minor` | Prelude in E Minor, Op. 28 No. 4 | classical | Frederic Chopin | Bernd Krueger | CC-BY-SA | https://piano-midi.de/ |
| `clair-de-lune` | Clair de Lune (Suite bergamasque, III) | classical | Claude Debussy | Bernd Krueger | CC-BY-SA | https://piano-midi.de/ |
| `debussy-arabesque-no1` | Arabesque No. 1 in E Major | classical | Claude Debussy | Bernd Krueger | CC-BY-SA | https://piano-midi.de/ |
| `fur-elise` | Fur Elise (Bagatelle No. 25 in A minor) | classical | Ludwig van Beethoven | Bernd Krueger | CC-BY-SA | https://piano-midi.de/ |
| `mozart-k545-mvt1` | Piano Sonata No. 16 in C Major, K. 545, I. Allegro | classical | Wolfgang Amadeus Mozart | Bernd Krueger | CC-BY-SA | https://piano-midi.de/ |
| `pathetique-mvt2` | Pathetique Sonata, 2nd Movement (Adagio cantabile) | classical | Ludwig van Beethoven | Bernd Krueger | CC-BY-SA | https://piano-midi.de/ |
| `satie-gymnopedie-no1` | Gymnopedie No. 1 | classical | Erik Satie | Bernd Krueger | CC-BY-SA | https://piano-midi.de/ |
| `schumann-traumerei` | Traumerei (Dreaming) from Kinderszenen | classical | Robert Schumann | Bernd Krueger | CC-BY-SA | https://piano-midi.de/ |

### internal (2)

These songs are legally usable for internal dogfood/research but do not meet the
`public_candidate` bar. Most have no arrangement source metadata; some have
copyrighted compositions in one jurisdiction only.

| Song ID | Title | Genre | Composer | US PD | EU PD | Reason |
|---|---|---|---|---|---|---|
| `the-entertainer` | The Entertainer | ragtime | Scott Joplin | public_domain | public_domain | The Entertainer (1902) by Scott Joplin. Composition: US=public_domain, EU=public_domain. |
| `greensleeves` | Greensleeves | folk | Traditional | public_domain | public_domain | Greensleeves (1580) by Traditional. Composition: US=public_domain, EU=public_domain. |

### excluded (12)

These songs are known-copyrighted without a redistribution license and must NOT
be included in either the internal or public pilot.

| Song ID | Title | Genre | Composer | US PD | EU PD |
|---|---|---|---|---|---|
| `autumn-leaves` | Autumn Leaves | jazz | Joseph Kosma | copyrighted | copyrighted |
| `imagine` | Imagine | pop | John Lennon | copyrighted | copyrighted |
| `the-thrill-is-gone` | The Thrill Is Gone | blues | Roy Hawkins | copyrighted | copyrighted |
| `your-song` | Your Song | rock | Elton John | copyrighted | copyrighted |
| `fallin` | Fallin' | rnb | Alicia Keys | copyrighted | copyrighted |
| `if-i-aint-got-you` | If I Ain't Got You | rnb | Alicia Keys | copyrighted | copyrighted |
| `isnt-she-lovely` | Isn't She Lovely | rnb | Stevie Wonder | copyrighted | copyrighted |
| `superstition` | Superstition | rnb | Stevie Wonder | copyrighted | copyrighted |
| `lean-on-me` | Lean on Me | soul | Bill Withers | copyrighted | copyrighted |
| `girl-from-ipanema` | The Girl from Ipanema | latin | Antonio Carlos Jobim | copyrighted | copyrighted |
| `comptine-dun-autre-ete` | Comptine d'un autre ete (Amelie) | film | Yann Tiersen | copyrighted | copyrighted |
| `river-flows-in-you` | River Flows in You | new-age | Yiruma | copyrighted | copyrighted |

---

## Verdict Reasons (Full)

### `bach-prelude-c-major-bwv846` — `public_candidate`

Prelude in C Major, BWV 846 (Well-Tempered Clavier) (1722) by Johann Sebastian Bach. Composition: US=public_domain, EU=public_domain. Arrangement by Bernd Krueger. License: CC-BY-SA. Evidence: https://piano-midi.de/. All initial public_candidate rules met. Awaiting Slice 2.5 verification: source URL resolves, license text preserved at source, license version confirmed. Until verified, treat as internal for distribution.

### `chopin-nocturne-op9-no2` — `public_candidate`

Nocturne in E-flat major, Op. 9 No. 2 (1832) by Frederic Chopin. Composition: US=public_domain, EU=public_domain. Arrangement by Bernd Krueger. License: CC-BY-SA. Evidence: https://piano-midi.de/. All initial public_candidate rules met. Awaiting Slice 2.5 verification: source URL resolves, license text preserved at source, license version confirmed. Until verified, treat as internal for distribution.

### `chopin-prelude-e-minor` — `public_candidate`

Prelude in E minor, Op. 28 No. 4 (1839) by Frederic Chopin. Composition: US=public_domain, EU=public_domain. Arrangement by Bernd Krueger. License: CC-BY-SA. Evidence: https://piano-midi.de/. All initial public_candidate rules met. Awaiting Slice 2.5 verification: source URL resolves, license text preserved at source, license version confirmed. Until verified, treat as internal for distribution.

### `clair-de-lune` — `public_candidate`

Clair de Lune (Suite Bergamasque, L. 75) (1905) by Claude Debussy. Composition: US=public_domain, EU=public_domain. Arrangement by Bernd Krueger. License: CC-BY-SA. Evidence: https://piano-midi.de/. All initial public_candidate rules met. Awaiting Slice 2.5 verification: source URL resolves, license text preserved at source, license version confirmed. Until verified, treat as internal for distribution.

### `debussy-arabesque-no1` — `public_candidate`

Arabesque No. 1 in E major, L. 66 (1891) by Claude Debussy. Composition: US=public_domain, EU=public_domain. Arrangement by Bernd Krueger. License: CC-BY-SA. Evidence: https://piano-midi.de/. All initial public_candidate rules met. Awaiting Slice 2.5 verification: source URL resolves, license text preserved at source, license version confirmed. Until verified, treat as internal for distribution.

### `fur-elise` — `public_candidate`

Bagatelle No. 25 in A minor (Für Elise) (1810) by Ludwig van Beethoven. Composition: US=public_domain, EU=public_domain. Arrangement by Bernd Krueger. License: CC-BY-SA. Evidence: https://piano-midi.de/. All initial public_candidate rules met. Awaiting Slice 2.5 verification: source URL resolves, license text preserved at source, license version confirmed. Until verified, treat as internal for distribution.

### `mozart-k545-mvt1` — `public_candidate`

Piano Sonata in C major, K. 545 (Mvt. 1) (1788) by Wolfgang Amadeus Mozart. Composition: US=public_domain, EU=public_domain. Arrangement by Bernd Krueger. License: CC-BY-SA. Evidence: https://piano-midi.de/. All initial public_candidate rules met. Awaiting Slice 2.5 verification: source URL resolves, license text preserved at source, license version confirmed. Until verified, treat as internal for distribution.

### `pathetique-mvt2` — `public_candidate`

Piano Sonata No. 8 'Pathétique', Op. 13 (Mvt. 2) (1799) by Ludwig van Beethoven. Composition: US=public_domain, EU=public_domain. Arrangement by Bernd Krueger. License: CC-BY-SA. Evidence: https://piano-midi.de/. All initial public_candidate rules met. Awaiting Slice 2.5 verification: source URL resolves, license text preserved at source, license version confirmed. Until verified, treat as internal for distribution.

### `satie-gymnopedie-no1` — `public_candidate`

Gymnopédie No. 1 (1888) by Erik Satie. Composition: US=public_domain, EU=public_domain. Arrangement by Bernd Krueger. License: CC-BY-SA. Evidence: https://piano-midi.de/. All initial public_candidate rules met. Awaiting Slice 2.5 verification: source URL resolves, license text preserved at source, license version confirmed. Until verified, treat as internal for distribution.

### `schumann-traumerei` — `public_candidate`

Träumerei, Op. 15 No. 7 (from Kinderszenen) (1838) by Robert Schumann. Composition: US=public_domain, EU=public_domain. Arrangement by Bernd Krueger. License: CC-BY-SA. Evidence: https://piano-midi.de/. All initial public_candidate rules met. Awaiting Slice 2.5 verification: source URL resolves, license text preserved at source, license version confirmed. Until verified, treat as internal for distribution.

### `autumn-leaves` — `excluded`

Autumn Leaves (Les Feuilles mortes) (1945) by Joseph Kosma. Composition: US=copyrighted, EU=copyrighted. Composition is copyrighted in both US and EU. Cannot assign public_candidate without explicit redistribution + training license from rights holder.

### `imagine` — `excluded`

Imagine (1971) by John Lennon. Composition: US=copyrighted, EU=copyrighted. Composition is copyrighted in both US and EU. Cannot assign public_candidate without explicit redistribution + training license from rights holder.

### `the-thrill-is-gone` — `excluded`

The Thrill Is Gone (1951) by Roy Hawkins. Composition: US=copyrighted, EU=copyrighted. Composition is copyrighted in both US and EU. Cannot assign public_candidate without explicit redistribution + training license from rights holder.

### `your-song` — `excluded`

Your Song (1970) by Elton John. Composition: US=copyrighted, EU=copyrighted. Composition is copyrighted in both US and EU. Cannot assign public_candidate without explicit redistribution + training license from rights holder.

### `fallin` — `excluded`

Fallin' (2001) by Alicia Keys. Composition: US=copyrighted, EU=copyrighted. Composition is copyrighted in both US and EU. Cannot assign public_candidate without explicit redistribution + training license from rights holder.

### `if-i-aint-got-you` — `excluded`

If I Ain't Got You (2003) by Alicia Keys. Composition: US=copyrighted, EU=copyrighted. Composition is copyrighted in both US and EU. Cannot assign public_candidate without explicit redistribution + training license from rights holder.

### `isnt-she-lovely` — `excluded`

Isn't She Lovely (1976) by Stevie Wonder. Composition: US=copyrighted, EU=copyrighted. Composition is copyrighted in both US and EU. Cannot assign public_candidate without explicit redistribution + training license from rights holder.

### `superstition` — `excluded`

Superstition (1972) by Stevie Wonder. Composition: US=copyrighted, EU=copyrighted. Composition is copyrighted in both US and EU. Cannot assign public_candidate without explicit redistribution + training license from rights holder.

### `lean-on-me` — `excluded`

Lean on Me (1972) by Bill Withers. Composition: US=copyrighted, EU=copyrighted. Composition is copyrighted in both US and EU. Cannot assign public_candidate without explicit redistribution + training license from rights holder.

### `girl-from-ipanema` — `excluded`

Garota de Ipanema (The Girl from Ipanema) (1962) by Antonio Carlos Jobim. Composition: US=copyrighted, EU=copyrighted. Composition is copyrighted in both US and EU. Cannot assign public_candidate without explicit redistribution + training license from rights holder.

### `comptine-dun-autre-ete` — `excluded`

Comptine d'un autre été: L'après-midi (2001) by Yann Tiersen. Composition: US=copyrighted, EU=copyrighted. Composition is copyrighted in both US and EU. Cannot assign public_candidate without explicit redistribution + training license from rights holder.

### `the-entertainer` — `internal`

The Entertainer (1902) by Scott Joplin. Composition: US=public_domain, EU=public_domain. Arrangement creator not identified from source metadata. Cannot assign public_candidate without named creator.

### `river-flows-in-you` — `excluded`

River Flows in You (2001) by Yiruma. Composition: US=copyrighted, EU=copyrighted. Composition is copyrighted in both US and EU. Cannot assign public_candidate without explicit redistribution + training license from rights holder.

### `greensleeves` — `internal`

Greensleeves (1580) by Traditional. Composition: US=public_domain, EU=public_domain. Arrangement creator not identified from source metadata. Cannot assign public_candidate without named creator.

---

## Open Questions (Human Review Required)

The following items could not be classified with confidence by the rule engine.
These require human review before any promotion beyond the current verdict.

- **`autumn-leaves`:** Source field is empty or missing. Provenance unknown.
- **`imagine`:** Source field is empty or missing. Provenance unknown.
- **`the-thrill-is-gone`:** Source field is empty or missing. Provenance unknown.
- **`your-song`:** Source field is empty or missing. Provenance unknown.
- **`fallin`:** Source field is empty or missing. Provenance unknown.
- **`if-i-aint-got-you`:** Source field is empty or missing. Provenance unknown.
- **`isnt-she-lovely`:** Source field is empty or missing. Provenance unknown.
- **`superstition`:** Source field is empty or missing. Provenance unknown.
- **`lean-on-me`:** Source field is empty or missing. Provenance unknown.
- **`girl-from-ipanema`:** Source field is empty or missing. Provenance unknown.
- **`comptine-dun-autre-ete`:** Source field is empty or missing. Provenance unknown.
- **`the-entertainer`:** Source field is empty or missing. Provenance unknown.
- **`river-flows-in-you`:** Source field is empty or missing. Provenance unknown.
- **`greensleeves`:** Source field is empty or missing. Provenance unknown.

---

## Rule Engine

**Source:** `src/dataset/provenance.ts`

**Verdict rules (synthesis Section 5):**

`public_candidate` requires ALL of:
1. Composition PD in US AND EU (or licensed for redistribution+training)
2. Arrangement under redistribution-compatible license (CC-BY, CC-BY-SA, CC0, or equivalent) per metadata
3. `arrangement_creator` named (not null)
4. `arrangement_evidence_url` populated

`excluded`: composition copyrighted in BOTH US and EU without redistribution license.

`internal`: anything that doesn't reach `public_candidate` and isn't `excluded`.

`public` is NOT assignable in Slice 2 — that's Slice 2.5 (URL verification).

**US PD cutoff (2026):** works published before 1 Jan 1929 are public domain.
**EU PD rule:** life + 70 years (EU Dir. 2006/116/EC). For anonymous/traditional works: publication + 70 years.

**Defensive-parsing principle:** ambiguous source string → lower-tier verdict (`internal`).
Better to under-classify than over-classify.

---

*Generated by `scripts/scan-dataset-provenance.ts` — Slice 2 of the jam-actions-v0 dataset.*
