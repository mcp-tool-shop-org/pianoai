#!/usr/bin/env tsx
// ─── Public packages for jam-actions-v1 and the eval-only probe ──────────────
//
// Reads the committed working corpora. Does not rebuild records. Does not write
// README prose: the card is copied from docs/hf-cards/, and the generator
// halts if that file is absent.

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");

export const V1_PUBLIC_VERSION = "1.1.0";
/** Probe package version is independent; it does not use F5_DRAWS. */
const PROBE_PUBLIC_VERSION = "1.0.0";
export const ZENODO_CONCEPT_DOI = "10.5281/zenodo.20279918";

export type PublicKind = "v1" | "probe";

function packageVersion(kind: PublicKind): string {
  return kind === "probe" ? PROBE_PUBLIC_VERSION : V1_PUBLIC_VERSION;
}

export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export function checksumManifest(files: Map<string, string>): string {
  const depth = (rel: string): number => rel.split("/").length;
  return [...files.keys()]
    .sort((a, b) => depth(a) - depth(b) || (a < b ? -1 : a > b ? 1 : 0))
    .map((rel) => `${sha256(Buffer.from(files.get(rel)!, "utf8"))}  ${rel}`)
    .join("\n") + "\n";
}

export function readCardOrHalt(cardPath: string): string {
  if (!existsSync(cardPath)) {
    throw new Error(
      `halt: dataset card missing at ${cardPath}; generator does not write README prose`,
    );
  }
  return readFileSync(cardPath, "utf8");
}

export function assertNoDraftBanner(card: string, cardPath: string): void {
  if (/<!--\s*DRAFT/i.test(card)) {
    throw new Error(
      `halt: ${cardPath} still carries a DRAFT banner; generator refuses to build a public set from a draft card`,
    );
  }
}

export function prettyDescriptionFromCard(card: string, cardPath: string): string {
  const m = card.match(/^pretty_description:\s*"(.*)"\s*$/m);
  if (!m?.[1]) {
    throw new Error(`halt: ${cardPath} has no pretty_description field`);
  }
  return m[1];
}

export function readLicenseOrHalt(licensePath: string): string {
  if (!existsSync(licensePath)) {
    throw new Error(
      `halt: LICENSE missing at ${licensePath}; generator does not compose LICENSE-DATASET.md`,
    );
  }
  return readFileSync(licensePath, "utf8");
}

function copyTreeFiles(srcDir: string, skip: Set<string>): Map<string, string> {
  const files = new Map<string, string>();
  function walk(dir: string, prefix: string): void {
    for (const name of readdirSync(dir).sort()) {
      const rel = prefix ? `${prefix}/${name}` : name;
      if (skip.has(rel) || skip.has(name)) continue;
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, rel);
      else files.set(rel, readFileSync(full, "utf8"));
    }
  }
  walk(srcDir, "");
  return files;
}



function citationCff(kind: PublicKind): string {
  const probe = kind === "probe";
  const title = probe
    ? "jam-actions-v1-probe — evaluation-only near-gate acoustic takes"
    : "jam-actions-v1 — AI Jam Sessions tool-use traces (shown-work targets)";
  let abstract: string;
  if (probe) {
    abstract =
      "72 acoustic takes on jam-actions-v1's nine held-out songs, each measured within 10 ms or 5 cents of a grading gate, both signs of both quantities. Never split, never trained on. Schema jam-actions-v1-probe/1.0.0.";
  } else {
    const manifest = JSON.parse(
      readFileSync(join(spec(kind).workingDir, "manifest.json"), "utf8"),
    ) as { record_count: number; coverage: { songs: number } };
    abstract =
      `${manifest.record_count} multi-turn MCP tool-use traces over ${manifest.coverage.songs} public-domain piano pieces whose arrangements carry a verified licence, nine task families, split by song. Every assistant turn shows the comparison that decides its answer. Schema jam-actions-v1/1.0.0.`;
  }
  return `cff-version: 1.2.0
title: "${title}"
message: "If you use this dataset, please cite it as below."
type: dataset
authors:
  - name: "mcp-tool-shop-org"
version: "${packageVersion(kind)}"
date-released: "2026-09-09"
license: "CC-BY-SA-3.0-DE"
doi: "${ZENODO_CONCEPT_DOI}"
identifiers:
  - type: doi
    value: "${ZENODO_CONCEPT_DOI}"
    description: "Concept DOI — resolves to the latest published version on Zenodo"
url: "https://doi.org/${ZENODO_CONCEPT_DOI}"
repository-code: "https://github.com/mcp-tool-shop-org/ai-jam-sessions"
abstract: >-
  ${abstract}
keywords:
  - music
  - midi
  - mcp
  - tool-use
  - symbolic-music
  - piano
`;
}

function zenodoMetadata(kind: PublicKind, prettyDescription: string): Record<string, unknown> {
  const probe = kind === "probe";
  const title = probe
    ? "jam-actions-v1-probe — evaluation-only near-gate acoustic takes"
    : "jam-actions-v1 — AI Jam Sessions tool-use traces (shown-work targets)";
  const description = `<p>${prettyDescription}</p>`;
  return {
    $schema_note: `Zenodo deposition metadata payload for the jam-actions-v1${probe ? "-probe" : ""} ${packageVersion(kind)} new-version deposit under concept DOI ${ZENODO_CONCEPT_DOI}. Conforms to the Zenodo legacy REST API deposition schema at https://developers.zenodo.org/#representation. DOI is intentionally absent — Zenodo mints the new version DOI on publish. No auth tokens, no account IDs, no credentials.`,
    metadata: {
      title,
      upload_type: "dataset",
      description,
      creators: [
        {
          name: "mcp-tool-shop-org",
          affiliation: "mcp-tool-shop-org GitHub organization",
        },
      ],
      keywords: [
        "music",
        "midi",
        "dataset",
        "mcp",
        "model-context-protocol",
        "llm",
        "training-data",
        "tool-use",
        "piano",
        "symbolic-music",
        "annotation",
        "instruction-tuning",
      ],
      license: "CC-BY-SA-3.0",
      access_right: "open",
      language: "eng",
      version: packageVersion(kind),
      related_identifiers: [
        {
          identifier: "https://github.com/mcp-tool-shop-org/ai-jam-sessions",
          relation: "isSupplementTo",
          scheme: "url",
          resource_type: "software",
        },
        {
          identifier: `https://doi.org/${ZENODO_CONCEPT_DOI}`,
          relation: probe ? "isSupplementTo" : "isNewVersionOf",
          scheme: "doi",
          resource_type: "dataset",
        },
      ],
      subjects: [
        {
          term: "Symbolic music",
          identifier: "https://en.wikipedia.org/wiki/Music_information_retrieval",
          scheme: "url",
        },
        {
          term: "Model Context Protocol",
          identifier: "https://modelcontextprotocol.io/",
          scheme: "url",
        },
        {
          term: "Instruction tuning",
          identifier: "https://arxiv.org/abs/2109.01652",
          scheme: "url",
        },
      ],
      references: [
        "mcp-tool-shop-org (2026). jam-actions-v1. Source repository mcp-tool-shop-org/ai-jam-sessions.",
        "Model Context Protocol specification. modelcontextprotocol.io.",
      ],
      notes: probe
        ? "Evaluation-only. Never merge into a training set. Never split. Cite the concept DOI and name the version."
        : "New version under the concept DOI; prior jam-actions-v0 deposits are unchanged. Gate clearance is not release approval.",
    },
  };
}

export function spec(kind: PublicKind): {
  workingDir: string;
  publicDir: string;
  cardPath: string;
  licensePath: string;
  skipFromWorking: Set<string>;
} {
  if (kind === "probe") {
    return {
      workingDir: join(REPO, "datasets", "jam-actions-v1-probe"),
      publicDir: join(REPO, "datasets", "jam-actions-v1-probe-public"),
      cardPath: join(REPO, "docs", "hf-cards", "jam-actions-v1-probe.md"),
      licensePath: join(REPO, "docs", "hf-cards", "jam-actions-v1-probe.LICENSE-DATASET.md"),
      skipFromWorking: new Set(["README.md", "checksums.sha256"]),
    };
  }
  return {
    workingDir: join(REPO, "datasets", "jam-actions-v1"),
    publicDir: join(REPO, "datasets", "jam-actions-v1-public"),
    cardPath: join(REPO, "docs", "hf-cards", "jam-actions-v1.md"),
    licensePath: join(REPO, "docs", "hf-cards", "jam-actions-v1.LICENSE-DATASET.md"),
    skipFromWorking: new Set(["README.md", "checksums.sha256"]),
  };
}

/** Every file the public package contains except checksums.sha256. */
export function publicFiles(kind: PublicKind): Map<string, string> {
  const s = spec(kind);
  const card = readCardOrHalt(s.cardPath);
  assertNoDraftBanner(card, s.cardPath);
  const pretty = prettyDescriptionFromCard(card, s.cardPath);
  const files = copyTreeFiles(s.workingDir, s.skipFromWorking);
  files.set("README.md", card);
  files.set("VERSION", `${packageVersion(kind)}\n`);
  files.set("LICENSE-DATASET.md", readLicenseOrHalt(s.licensePath));
  files.set("CITATION.cff", citationCff(kind));
  files.set("zenodo-metadata.json", JSON.stringify(zenodoMetadata(kind, pretty), null, 2) + "\n");
  return files;
}

export function writePublicSet(kind: PublicKind, outDir?: string): { n: number; outDir: string; checksums: number } {
  const dest = outDir ?? spec(kind).publicDir;
  const files = publicFiles(kind);
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(join(dest, "records"), { recursive: true });
  for (const [rel, content] of files) {
    const full = join(dest, ...rel.split("/"));
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  const manifest = checksumManifest(files);
  writeFileSync(join(dest, "checksums.sha256"), manifest, "utf8");
  const n = [...files.keys()].filter((k) => k.startsWith("records/") && k.endsWith(".json")).length;
  return { n, outDir: dest, checksums: files.size };
}

const invoked = Boolean(
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url)),
);
if (invoked) {
  const probe = process.argv.includes("--probe");
  const r = writePublicSet(probe ? "probe" : "v1");
  process.stdout.write(`wrote ${r.n} records, ${r.checksums} checksummed files to ${r.outDir}\n`);
}
