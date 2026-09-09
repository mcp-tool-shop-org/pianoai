// ─── Public packages rebuild from the working corpora ────────────────────────
//
// The generator copies committed working records and overlays publication
// files. It does not re-render audio. README is the coordinator card, copied
// verbatim. Checksums are breadth-first and LF-pinned.
//
// wav_sha256 is stripped on the portable check the way acoustic v0 does, even
// though v1 records do not currently publish that field: a later generator
// that starts shipping it must not silently fail on Node 24 vs 22.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  assertNoDraftBanner,
  checksumManifest,
  publicFiles,
  readCardOrHalt,
  spec,
  type PublicKind,
} from "./generate-public.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const V0_ZENODO = join(REPO, "datasets", "jam-actions-v0-public", "zenodo-metadata.json");

const GENERATED_ON_NODE_MAJOR = 22;
const onGeneratingEngine =
  Number.parseInt(process.versions.node.split(".")[0]!, 10) === GENERATED_ON_NODE_MAJOR;

function sha256(content: string): string {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}

function walkFiles(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  function walk(cur: string, prefix: string): void {
    for (const name of readdirSync(cur).sort()) {
      if (name === "checksums.sha256") continue;
      const rel = prefix ? `${prefix}/${name}` : name;
      const full = join(cur, name);
      if (statSync(full).isDirectory()) walk(full, rel);
      else files.set(rel, readFileSync(full, "utf8"));
    }
  }
  walk(dir, "");
  return files;
}

function publishedChecksums(dir: string): Map<string, string> {
  const map = new Map<string, string>();
  const raw = readFileSync(join(dir, "checksums.sha256"), "utf8");
  for (const line of raw.trim().split("\n")) {
    map.set(line.slice(66).trim(), line.slice(0, 64));
  }
  return map;
}

function withoutWavHash(r: unknown): unknown {
  const clone = JSON.parse(JSON.stringify(r)) as Record<string, any>;
  if (clone.observation?.render) delete clone.observation.render.wav_sha256;
  if (clone.observation?.acoustic) delete clone.observation.acoustic.wav_sha256;
  return clone;
}

function recordsOf(files: Map<string, string>): unknown[] {
  return files.get("records.jsonl")!.trim().split("\n").map((l) => JSON.parse(l));
}

function assertPackage(kind: PublicKind): void {
  const s = spec(kind);
  expect(existsSync(s.publicDir), s.publicDir).toBe(true);
  const published = publishedChecksums(s.publicDir);
  const onDisk = walkFiles(s.publicDir);
  const built = publicFiles(kind);

  expect([...onDisk.keys()].sort()).toEqual([...published.keys()].sort());
  expect([...built.keys()].sort()).toEqual([...published.keys()].sort());

  for (const rel of published.keys()) {
    expect(existsSync(join(s.publicDir, ...rel.split("/"))), rel).toBe(true);
  }
  const extra = readdirSync(s.publicDir).filter((n) => n !== "checksums.sha256" && n !== "records");
  for (const name of extra) {
    expect(published.has(name), `unlisted root file ${name}`).toBe(true);
  }

  expect(onDisk.get("README.md")).toBe(readFileSync(s.cardPath, "utf8"));
  expect(built.get("README.md")).toBe(onDisk.get("README.md"));

  const portableBuilt = recordsOf(built).map(withoutWavHash);
  const portableDisk = recordsOf(onDisk).map(withoutWavHash);
  expect(portableBuilt).toEqual(portableDisk);

  if (onGeneratingEngine) {
    for (const [rel, content] of onDisk) {
      expect(sha256(content), rel).toBe(published.get(rel));
    }
    expect(checksumManifest(built)).toBe(readFileSync(join(s.publicDir, "checksums.sha256"), "utf8"));
    for (const [rel, content] of built) {
      expect(content, rel).toBe(onDisk.get(rel));
    }
  }
}

const v1PublicPresent = existsSync(spec("v1").publicDir);
const probePublicPresent = existsSync(spec("probe").publicDir);

it.skipIf(v1PublicPresent)(
  "rebuild-equals-committed skipped: jam-actions-v1-public is absent until the DRAFT card is rewritten",
  () => {
    expect(v1PublicPresent).toBe(false);
  },
);
it.skipIf(probePublicPresent)(
  "rebuild-equals-committed skipped: jam-actions-v1-probe-public is absent until the DRAFT card is rewritten",
  () => {
    expect(probePublicPresent).toBe(false);
  },
);

describe.skipIf(!v1PublicPresent)("jam-actions-v1-public", () => {
  it("rebuilds from the working corpus and equals the committed package", () => {
    assertPackage("v1");
  });

  it("README is byte-equal to docs/hf-cards/jam-actions-v1.md", () => {
    const s = spec("v1");
    expect(readFileSync(join(s.publicDir, "README.md"), "utf8")).toBe(readFileSync(s.cardPath, "utf8"));
  });

  it("checksums cover every file and no file outside the list", () => {
    const s = spec("v1");
    const published = publishedChecksums(s.publicDir);
    const onDisk = walkFiles(s.publicDir);
    expect(published.size).toBe(onDisk.size);
    expect(published.size).toBeGreaterThan(0);
  });
});

describe.skipIf(!probePublicPresent)("jam-actions-v1-probe-public", () => {
  it("rebuilds from the working probe and equals the committed package", () => {
    assertPackage("probe");
  });

  it("README is byte-equal to docs/hf-cards/jam-actions-v1-probe.md", () => {
    const s = spec("probe");
    expect(readFileSync(join(s.publicDir, "README.md"), "utf8")).toBe(readFileSync(s.cardPath, "utf8"));
  });
});

describe.skipIf(!v1PublicPresent || !probePublicPresent)("zenodo-metadata shape", () => {
  it("mirrors v0's keys with new version fields, both packages", () => {
    const v0 = JSON.parse(readFileSync(V0_ZENODO, "utf8")) as { metadata: Record<string, unknown> };
    for (const kind of ["v1", "probe"] as const) {
      const raw = publicFiles(kind).get("zenodo-metadata.json")!;
      const z = JSON.parse(raw) as { metadata: Record<string, unknown> };
      expect(Object.keys(z).sort(), kind).toEqual(Object.keys(v0).sort());
      expect(Object.keys(z.metadata).sort(), kind).toEqual(Object.keys(v0.metadata).sort());
      expect(z.metadata.upload_type).toBe("dataset");
      expect(z.metadata.version).not.toBe(v0.metadata.version);
      expect(z.metadata.license).toBe(v0.metadata.license);
      expect(z.metadata.language).toBe("eng");
      expect(z.metadata.access_right).toBe("open");
    }
  });
});

describe("card halt", () => {
  it("throws rather than inventing README prose when the card is absent", () => {
    expect(() => readCardOrHalt(join(HERE, "no-such-card.md"))).toThrow(/halt: dataset card missing/);
  });
});

describe("banner refusal", () => {
  it("refuses to build a public set whose card still carries a DRAFT banner", () => {
    const s = spec("v1");
    const real = readFileSync(s.cardPath, "utf8");
    // A draft card is a fixture, not the live card: the live card must NOT carry the banner
    // once the numbers are filled, or the sets could never be built.
    // CRLF-tolerant: a Windows checkout with autocrlf hands this test a CRLF card.
    const draft = real.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, (fm) => fm + "<!-- DRAFT until filled -->\n");
    expect(draft).not.toBe(real);
    expect(() => assertNoDraftBanner(draft, s.cardPath)).toThrow(/DRAFT banner/);
    expect(() => assertNoDraftBanner(real, s.cardPath)).not.toThrow();
  });
});

