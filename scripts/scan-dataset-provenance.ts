#!/usr/bin/env tsx
// ─── jam-actions-v0 Provenance Scanner ───────────────────────────────────────
//
// Scans all 24 ready songs in the song library, runs the provenance rule
// engine on each, and writes two output files:
//
//   datasets/jam-actions-v0/provenance-scan.json  — machine output
//   docs/jam-actions-v0-provenance-scan.md        — human report
//
// Usage: tsx scripts/scan-dataset-provenance.ts
//
// Constraints (Slice 2 forbidden zones):
//   - NO URL fetching (no HTTP requests against arrangement_evidence_url)
//   - NO record building or modification
//   - NO dataset expansion
//   - NO publication
//
// Composition facts (composer death years, composition years) are hardcoded
// here as authoritative knowledge, not scraped. Sources:
//   - Grove Music Online / Wikipedia for death years
//   - Published standard music reference dates for composition years
//
// US PD rule: pre-1929 publications are PD (as of 2026).
// EU PD rule: life + 70 years (Art. 1 EU Dir 2006/116/EC).
// ─────────────────────────────────────────────────────────────────────────────

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { classifyProvenance, type ProvenanceInput, type VerdictResult } from "../src/dataset/provenance.js";
import { GENRES } from "../src/songs/types.js";

// ─── Setup ───────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const LIBRARY_DIR = join(REPO_ROOT, "songs/library");
const DATASET_ROOT = join(REPO_ROOT, "datasets/jam-actions-v0");
const SCAN_JSON_PATH = join(DATASET_ROOT, "provenance-scan.json");
const SCAN_REPORT_PATH = join(REPO_ROOT, "docs/jam-actions-v0-provenance-scan.md");

const SCAN_DATE = "2026-05-16";

// ─── Composition facts database ───────────────────────────────────────────────
//
// Hardcoded composition facts per ready song.
// composerDeathYear: number = known death year
//                   null    = living composer (EU copyrighted)
//                   omitted = not in the song config (treated as unknown by engine)
//
// Sources consulted: Grove Music, Wikipedia, Library of Congress Copyright Office
// records, ASCAP/BMI repertoire databases.
//
// US PD cutoff 2026: published before 1929 → PD.
// EU PD 2026: deathYear + 71 <= 2026 → PD.

interface CompositionFactsRecord {
  compositionYear?: number;
  composerDeathYear?: number | null;
  compositionTitle?: string; // canonical title for the report
}

const COMPOSITION_FACTS: Record<string, CompositionFactsRecord> = {
  // ── Classical (all Bernd Krueger / piano-midi.de) ──────────────────────────
  "bach-prelude-c-major-bwv846": {
    compositionTitle: "Prelude in C Major, BWV 846 (Well-Tempered Clavier)",
    compositionYear: 1722,  // WTC Book 1 composed c. 1722
    composerDeathYear: 1750, // J.S. Bach d. 1750 → EU PD since 1821
  },
  "chopin-nocturne-op9-no2": {
    compositionTitle: "Nocturne in E-flat major, Op. 9 No. 2",
    compositionYear: 1832,  // published 1832
    composerDeathYear: 1849, // Chopin d. 1849 → EU PD since 1920
  },
  "chopin-prelude-e-minor": {
    compositionTitle: "Prelude in E minor, Op. 28 No. 4",
    compositionYear: 1839,  // published 1839
    composerDeathYear: 1849, // Chopin d. 1849 → EU PD since 1920
  },
  "clair-de-lune": {
    compositionTitle: "Clair de Lune (Suite Bergamasque, L. 75)",
    compositionYear: 1905,  // published 1905 (composed c. 1890)
    composerDeathYear: 1918, // Debussy d. 1918 → EU PD since 1989
  },
  "debussy-arabesque-no1": {
    compositionTitle: "Arabesque No. 1 in E major, L. 66",
    compositionYear: 1891,  // published 1891
    composerDeathYear: 1918, // Debussy d. 1918 → EU PD since 1989
  },
  "fur-elise": {
    compositionTitle: "Bagatelle No. 25 in A minor (Für Elise)",
    compositionYear: 1810,  // composed c. 1810, published 1867
    composerDeathYear: 1827, // Beethoven d. 1827 → EU PD since 1898
  },
  "mozart-k545-mvt1": {
    compositionTitle: "Piano Sonata in C major, K. 545 (Mvt. 1)",
    compositionYear: 1788,  // composed 1788
    composerDeathYear: 1791, // Mozart d. 1791 → EU PD since 1862
  },
  "pathetique-mvt2": {
    compositionTitle: "Piano Sonata No. 8 'Pathétique', Op. 13 (Mvt. 2)",
    compositionYear: 1799,  // published 1799
    composerDeathYear: 1827, // Beethoven d. 1827 → EU PD since 1898
  },
  "satie-gymnopedie-no1": {
    compositionTitle: "Gymnopédie No. 1",
    compositionYear: 1888,  // published 1888
    composerDeathYear: 1925, // Satie d. 1925 → EU PD since 1996
  },
  "schumann-traumerei": {
    compositionTitle: "Träumerei, Op. 15 No. 7 (from Kinderszenen)",
    compositionYear: 1838,  // published 1838
    composerDeathYear: 1856, // Schumann d. 1856 → EU PD since 1927
  },

  // ── Jazz ───────────────────────────────────────────────────────────────────
  "autumn-leaves": {
    compositionTitle: "Autumn Leaves (Les Feuilles mortes)",
    compositionYear: 1945,  // orig. 1945 (French), English version 1947
    composerDeathYear: 1969, // Joseph Kosma d. 1969 → EU: 1969+71=2040 → copyrighted; US: 1945 >= 1929 → copyrighted
  },

  // ── Blues ──────────────────────────────────────────────────────────────────
  "the-thrill-is-gone": {
    compositionTitle: "The Thrill Is Gone",
    compositionYear: 1951,  // written 1951 by Roy Hawkins, recorded B.B. King 1969
    composerDeathYear: 1973, // Roy Hawkins d. 1973 → EU: 1973+71=2044 → copyrighted; US: 1951 >= 1929 → copyrighted
  },

  // ── Folk ───────────────────────────────────────────────────────────────────
  "greensleeves": {
    compositionTitle: "Greensleeves",
    compositionYear: 1580,  // first referenced 1580
    // Composer: Traditional / anonymous — EU rule: publication + 70 years
    // composerDeathYear: not applicable for anonymous works; engine uses compositionYear+70 for Traditional
  },

  // ── Pop ────────────────────────────────────────────────────────────────────
  "imagine": {
    compositionTitle: "Imagine",
    compositionYear: 1971,  // recorded/released 1971
    composerDeathYear: 1980, // John Lennon d. 1980 → EU: 1980+71=2051 → copyrighted; US: 1971 >= 1929 → copyrighted
  },

  // ── Film ───────────────────────────────────────────────────────────────────
  "comptine-dun-autre-ete": {
    compositionTitle: "Comptine d'un autre été: L'après-midi",
    compositionYear: 2001,  // from Amélie OST (2001)
    composerDeathYear: null, // Yann Tiersen b. 1970, living → EU copyrighted; US copyrighted
  },

  // ── New Age ────────────────────────────────────────────────────────────────
  "river-flows-in-you": {
    compositionTitle: "River Flows in You",
    compositionYear: 2001,  // from Yiruma "First Love" album (2001)
    composerDeathYear: null, // Yiruma b. 1978, living → copyrighted
  },

  // ── Ragtime ────────────────────────────────────────────────────────────────
  "the-entertainer": {
    compositionTitle: "The Entertainer",
    compositionYear: 1902,  // published 1902
    composerDeathYear: 1917, // Scott Joplin d. 1917 → EU PD since 1988; US: 1902 < 1929 → PD
  },

  // ── R&B ────────────────────────────────────────────────────────────────────
  "fallin": {
    compositionTitle: "Fallin'",
    compositionYear: 2001,  // released on Songs in A Minor (2001)
    composerDeathYear: null, // Alicia Keys b. 1981, living → copyrighted
  },
  "if-i-aint-got-you": {
    compositionTitle: "If I Ain't Got You",
    compositionYear: 2003,  // released on The Diary of Alicia Keys (2003)
    composerDeathYear: null, // Alicia Keys b. 1981, living → copyrighted
  },
  "isnt-she-lovely": {
    compositionTitle: "Isn't She Lovely",
    compositionYear: 1976,  // from Songs in the Key of Life (1976)
    composerDeathYear: null, // Stevie Wonder b. 1950, living → EU copyrighted; US: 1976 >= 1929 → copyrighted
  },
  "superstition": {
    compositionTitle: "Superstition",
    compositionYear: 1972,  // from Talking Book (1972)
    composerDeathYear: null, // Stevie Wonder b. 1950, living → copyrighted
  },

  // ── Rock ───────────────────────────────────────────────────────────────────
  "your-song": {
    compositionTitle: "Your Song",
    compositionYear: 1970,  // from Elton John (album, 1970)
    composerDeathYear: null, // Elton John b. 1947, Bernie Taupin b. 1950, both living → copyrighted
  },

  // ── Soul ───────────────────────────────────────────────────────────────────
  "lean-on-me": {
    compositionTitle: "Lean on Me",
    compositionYear: 1972,  // from Bill Withers' Still Bill album (1972)
    composerDeathYear: 2020, // Bill Withers d. 2020 → EU: 2020+71=2091 → copyrighted; US: 1972 >= 1929 → copyrighted
  },

  // ── Latin ──────────────────────────────────────────────────────────────────
  "girl-from-ipanema": {
    compositionTitle: "Garota de Ipanema (The Girl from Ipanema)",
    compositionYear: 1962,  // composed 1962 by Jobim and de Moraes
    composerDeathYear: 1994, // Tom Jobim d. 1994 → EU: 1994+71=2065 → copyrighted; US: 1962 >= 1929 → copyrighted
    // Co-composer Vinícius de Moraes d. 1980 → EU: 1980+71=2051 → still copyrighted
  },
};

// ─── Song scanner ─────────────────────────────────────────────────────────────

interface SongMeta {
  id: string;
  title: string;
  composer?: string;
  genre: string;
  source?: string;
  status: string;
}

interface ScanRecord {
  song_id: string;
  song_title: string;
  genre: string;
  composer: string | null;
  verdict: string;
  verdict_reason: string;
  composition_pd_status_us: string;
  composition_pd_status_eu: string;
  extracted_fields: {
    arrangement_creator: string | null;
    arrangement_license: string | null;
    arrangement_evidence_url: string | null;
  };
  open_questions: string[];
}

function loadReadySongs(): SongMeta[] {
  const songs: SongMeta[] = [];

  for (const genre of GENRES) {
    const genreDir = join(LIBRARY_DIR, genre);
    let files: string[];
    try {
      files = readdirSync(genreDir).filter((f) => f.endsWith(".json"));
    } catch {
      continue;
    }

    for (const file of files) {
      try {
        const raw = JSON.parse(readFileSync(join(genreDir, file), "utf8"));
        if (raw.status === "ready") {
          songs.push({
            id: raw.id,
            title: raw.title,
            composer: raw.composer,
            genre,
            source: raw.source,
            status: raw.status,
          });
        }
      } catch {
        // skip malformed
      }
    }
  }

  return songs;
}

function scanSong(song: SongMeta): { record: ScanRecord; result: VerdictResult } {
  const facts = COMPOSITION_FACTS[song.id] ?? {};

  const input: ProvenanceInput = {
    source: song.source,
    composition: {
      title: facts.compositionTitle ?? song.title,
      composer: song.composer,
      compositionYear: facts.compositionYear,
      composerDeathYear: facts.composerDeathYear,
    },
    scanDate: SCAN_DATE,
  };

  const result = classifyProvenance(input);

  const record: ScanRecord = {
    song_id: song.id,
    song_title: song.title,
    genre: song.genre,
    composer: song.composer ?? null,
    verdict: result.verdict,
    verdict_reason: result.verdict_reason,
    composition_pd_status_us: result.composition_pd_status_us,
    composition_pd_status_eu: result.composition_pd_status_eu,
    extracted_fields: {
      arrangement_creator: result.extracted.arrangement_creator,
      arrangement_license: result.extracted.arrangement_license,
      arrangement_evidence_url: result.extracted.arrangement_evidence_url,
    },
    open_questions: result.open_questions,
  };

  return { record, result };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  console.log("[1/4] Loading ready songs from library...");
  const songs = loadReadySongs();
  console.log(`      Found ${songs.length} ready songs`);

  console.log("[2/4] Running provenance rule engine...");
  const scanRecords: ScanRecord[] = [];
  const byVerdict: Record<string, number> = {
    public_candidate: 0,
    internal: 0,
    excluded: 0,
  };

  for (const song of songs) {
    const { record } = scanSong(song);
    scanRecords.push(record);
    byVerdict[record.verdict] = (byVerdict[record.verdict] ?? 0) + 1;
    console.log(`      [${record.verdict.padEnd(17)}] ${song.id}`);
  }

  console.log("[3/4] Writing provenance-scan.json...");
  const jsonOutput = {
    scan_date: SCAN_DATE,
    total_songs: songs.length,
    by_verdict: byVerdict,
    records: scanRecords,
  };
  mkdirSync(DATASET_ROOT, { recursive: true });
  writeFileSync(SCAN_JSON_PATH, JSON.stringify(jsonOutput, null, 2) + "\n", "utf8");
  console.log(`      wrote ${SCAN_JSON_PATH}`);

  console.log("[4/4] Writing provenance-scan.md...");
  const markdown = buildReport(scanRecords, byVerdict, songs.length);
  mkdirSync(dirname(SCAN_REPORT_PATH), { recursive: true });
  writeFileSync(SCAN_REPORT_PATH, markdown, "utf8");
  console.log(`      wrote ${SCAN_REPORT_PATH}`);

  // Summary
  console.log("\nSCAN COMPLETE");
  console.log(`  total songs  : ${songs.length}`);
  console.log(`  public_candidate : ${byVerdict.public_candidate}`);
  console.log(`  internal         : ${byVerdict.internal}`);
  console.log(`  excluded         : ${byVerdict.excluded}`);
}

// ─── Report builder ──────────────────────────────────────────────────────────

function buildReport(
  records: ScanRecord[],
  byVerdict: Record<string, number>,
  total: number,
): string {
  const now = SCAN_DATE;

  // Separate by verdict
  const candidates = records.filter((r) => r.verdict === "public_candidate");
  const internal = records.filter((r) => r.verdict === "internal");
  const excluded = records.filter((r) => r.verdict === "excluded");

  // Open questions list (all songs)
  const allOpenQuestions: Array<{ song: string; question: string }> = [];
  for (const r of records) {
    for (const q of r.open_questions) {
      allOpenQuestions.push({ song: r.song_id, question: q });
    }
  }

  // Recommended pilot candidates (best public_candidates)
  // Rank by: CC-BY-SA from piano-midi.de (known source, clear license), then others
  const pilotCandidates = rankPilotCandidates(candidates);

  let md = `# jam-actions-v0 Provenance Scan Report

**Scan date:** ${now}
**Scope:** All ready songs in the song library
**Rule engine version:** Slice 2 (initial classification; no URL verification)

## Summary

| Verdict | Count |
|---|---|
| \`public_candidate\` | ${byVerdict.public_candidate} |
| \`internal\` | ${byVerdict.internal} |
| \`excluded\` | ${byVerdict.excluded} |
| **Total** | **${total}** |

> **Note:** \`public_candidate\` songs are treated as \`internal\` for distribution purposes until
> Slice 2.5 verification (URL resolves, license text preserved, version confirmed). No song
> reaches \`public\` verdict in this slice.

---

## Recommended Pilot Candidates

These are the strongest \`public_candidate\` songs for the internal pilot (Slice 3+),
pending Slice 2.5 source-evidence verification.

`;

  for (const { record, rationale } of pilotCandidates) {
    md += `### ${record.song_title} (\`${record.song_id}\`)

- **Genre:** ${record.genre}
- **Composer:** ${record.composer ?? "Unknown"}
- **Arrangement:** ${record.extracted_fields.arrangement_creator ?? "Unknown"} — ${record.extracted_fields.arrangement_license ?? "Unknown"}
- **Evidence URL:** ${record.extracted_fields.arrangement_evidence_url ?? "None"}
- **Pilot rationale:** ${rationale}

`;
  }

  md += `---

## Full Scan Results

### public_candidate (${candidates.length})

These songs meet all initial provenance rules and are candidates for public release
pending Slice 2.5 verification.

| Song ID | Title | Genre | Composer | Arrangement By | License | Evidence URL |
|---|---|---|---|---|---|---|
`;

  for (const r of candidates) {
    md += `| \`${r.song_id}\` | ${r.song_title} | ${r.genre} | ${r.composer ?? "—"} | ${r.extracted_fields.arrangement_creator ?? "—"} | ${r.extracted_fields.arrangement_license ?? "—"} | ${r.extracted_fields.arrangement_evidence_url ?? "—"} |\n`;
  }

  md += `
### internal (${internal.length})

These songs are legally usable for internal dogfood/research but do not meet the
\`public_candidate\` bar. Most have no arrangement source metadata; some have
copyrighted compositions in one jurisdiction only.

| Song ID | Title | Genre | Composer | US PD | EU PD | Reason |
|---|---|---|---|---|---|---|
`;

  for (const r of internal) {
    const shortReason = r.verdict_reason.split(".").slice(0, 2).join(".").trim() + ".";
    md += `| \`${r.song_id}\` | ${r.song_title} | ${r.genre} | ${r.composer ?? "—"} | ${r.composition_pd_status_us} | ${r.composition_pd_status_eu} | ${shortReason} |\n`;
  }

  md += `
### excluded (${excluded.length})

These songs are known-copyrighted without a redistribution license and must NOT
be included in either the internal or public pilot.

| Song ID | Title | Genre | Composer | US PD | EU PD |
|---|---|---|---|---|---|
`;

  for (const r of excluded) {
    md += `| \`${r.song_id}\` | ${r.song_title} | ${r.genre} | ${r.composer ?? "—"} | ${r.composition_pd_status_us} | ${r.composition_pd_status_eu} |\n`;
  }

  md += `
---

## Verdict Reasons (Full)

`;

  for (const r of records) {
    md += `### \`${r.song_id}\` — \`${r.verdict}\`

${r.verdict_reason}

`;
  }

  if (allOpenQuestions.length > 0) {
    md += `---

## Open Questions (Human Review Required)

The following items could not be classified with confidence by the rule engine.
These require human review before any promotion beyond the current verdict.

`;
    for (const { song, question } of allOpenQuestions) {
      md += `- **\`${song}\`:** ${question}\n`;
    }
    md += "\n";
  } else {
    md += `---

## Open Questions

None. All songs were classified without ambiguity.

`;
  }

  md += `---

## Rule Engine

**Source:** \`src/dataset/provenance.ts\`

**Verdict rules (synthesis Section 5):**

\`public_candidate\` requires ALL of:
1. Composition PD in US AND EU (or licensed for redistribution+training)
2. Arrangement under redistribution-compatible license (CC-BY, CC-BY-SA, CC0, or equivalent) per metadata
3. \`arrangement_creator\` named (not null)
4. \`arrangement_evidence_url\` populated

\`excluded\`: composition copyrighted in BOTH US and EU without redistribution license.

\`internal\`: anything that doesn't reach \`public_candidate\` and isn't \`excluded\`.

\`public\` is NOT assignable in Slice 2 — that's Slice 2.5 (URL verification).

**US PD cutoff (2026):** works published before 1 Jan 1929 are public domain.
**EU PD rule:** life + 70 years (EU Dir. 2006/116/EC). For anonymous/traditional works: publication + 70 years.

**Defensive-parsing principle:** ambiguous source string → lower-tier verdict (\`internal\`).
Better to under-classify than over-classify.

---

*Generated by \`scripts/scan-dataset-provenance.ts\` — Slice 2 of the jam-actions-v0 dataset.*
`;

  return md;
}

// ─── Pilot candidate ranker ───────────────────────────────────────────────────

interface RankedCandidate {
  record: ScanRecord;
  rationale: string;
}

function rankPilotCandidates(candidates: ScanRecord[]): RankedCandidate[] {
  // Rank criteria:
  // 1. piano-midi.de / CC-BY-SA candidates (most verifiable, known source)
  // 2. Diversity: different genres, different composers
  // 3. Pedagogical value: well-known, commonly studied pieces
  //
  // Target: 3–5 strongest candidates per kickoff

  const ranked: RankedCandidate[] = [];

  // Known priority list — piano-midi.de sourced, PD compositions
  const priorityOrder = [
    // These are pedagogically canonical, extremely well-known, and all from
    // the same verified source (piano-midi.de / Bernd Krueger / CC BY-SA)
    {
      id: "fur-elise",
      rationale: "Slice 1 reference record — same source/license as the existing fur-elise-m001-008.json. Regression test confirms public_candidate verdict. Highest confidence for pilot continuity.",
    },
    {
      id: "bach-prelude-c-major-bwv846",
      rationale: "J.S. Bach (d. 1750): deepest EU PD in the set. Pedagogically essential arpeggiated texture. Same verified source (Bernd Krueger / piano-midi.de / CC BY-SA).",
    },
    {
      id: "mozart-k545-mvt1",
      rationale: "Mozart K545 (d. 1791): early Classical, extremely well-known, pedagogical gold standard. Same verified source. Strong genre diversity from Für Elise.",
    },
    {
      id: "the-entertainer",
      rationale: "Scott Joplin ragtime (1902, d. 1917): only PD non-classical candidate. Unique syncopated texture that tests the dataset's genre range. piano-midi.de source not present — see open question; would need source addition before Slice 2.5.",
    },
    {
      id: "schumann-traumerei",
      rationale: "Schumann (d. 1856): Romantic-era representative. Lyrical, expressive texture contrasts with Bach's baroque counterpoint. Same verified source.",
    },
  ];

  const candidateById = new Map(candidates.map((c) => [c.song_id, c]));

  for (const { id, rationale } of priorityOrder) {
    const record = candidateById.get(id);
    if (record) {
      ranked.push({ record, rationale });
    }
  }

  // Add any remaining candidates not in priority list (alphabetical)
  for (const c of candidates) {
    if (!ranked.some((r) => r.record.song_id === c.song_id)) {
      ranked.push({
        record: c,
        rationale: "Additional public_candidate — meets initial rules. Source and license as recorded; verify via Slice 2.5.",
      });
    }
  }

  // Return top 5 max for the report, rest are in the full table
  return ranked.slice(0, 5);
}

// ─── Run ─────────────────────────────────────────────────────────────────────

main();
