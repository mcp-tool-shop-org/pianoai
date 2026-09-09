import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fetchCandidates, fetchOne, sha256Hex, termsNotice, resolveFetchMidiPath, packageLibraryWritable, type Fetcher } from "./fetch.js";

const MIDI = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 0x60, 0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 4, 0, 0xff, 0x2f, 0]);

function config(id: string, prov: Record<string, unknown> | undefined, status = "ready") {
  return {
    id,
    title: id,
    genre: "classical",
    composer: "Test",
    difficulty: "beginner",
    key: "C major",
    tempo: 120,
    timeSignature: "4/4",
    tags: ["test"],
    status,
    ...(prov ? { provenance: prov } : {}),
  };
}

describe("library fetch", () => {
  let lib: string;
  beforeEach(() => {
    lib = mkdtempSync(join(tmpdir(), "ajs-fetch-"));
    mkdirSync(join(lib, "classical"), { recursive: true });
  });
  afterEach(() => rmSync(lib, { recursive: true, force: true }));

  // A full block, as scripts/provenance-audit.ts writes it; the config schema rejects a partial one.
  const prov = (over: Record<string, unknown> = {}) => ({
    schema: 1,
    source_url: "https://example.test/a.mid",
    source_site: "example.test",
    arrangement_creator: "unknown",
    arrangement_license: "unknown",
    terms_url: "https://example.test/terms",
    terms_quote: "personal use only",
    verified_at: "2026-09-09",
    verifier: "https://example.test/terms",
    midi_sha256: sha256Hex(MIDI),
    midi_title_events: [],
    midi_credit_events: [],
    credited_parties: [],
    title_verdict: "no-title-in-file",
    ...over,
  });

  it("lists only songs whose MIDI is absent and whose provenance names a source", () => {
    writeFileSync(join(lib, "classical", "absent.json"), JSON.stringify(config("absent", prov())));
    writeFileSync(join(lib, "classical", "present.json"), JSON.stringify(config("present", prov())));
    writeFileSync(join(lib, "classical", "present.mid"), MIDI);
    writeFileSync(join(lib, "classical", "orphan.json"), JSON.stringify(config("orphan", undefined)));
    const { candidates, noSource } = fetchCandidates(lib);
    expect(candidates.map((c) => c.id)).toEqual(["absent"]);
    expect(noSource).toEqual(["orphan"]);
    expect(candidates[0]!.termsUrl).toBe("https://example.test/terms");
  });

  it("writes the file only when its sha256 equals the recorded one", async () => {
    writeFileSync(join(lib, "classical", "s.json"), JSON.stringify(config("s", prov())));
    const { candidates } = fetchCandidates(lib);
    const good: Fetcher = async () => ({ ok: true, status: 200, bytes: MIDI });
    const out = await fetchOne(candidates[0]!, good);
    expect(out.status).toBe("fetched");
    expect(readFileSync(candidates[0]!.midiPath)).toEqual(Buffer.from(MIDI));
  });

  it("refuses a file whose sha256 differs from the recorded one and writes nothing", async () => {
    writeFileSync(join(lib, "classical", "s.json"), JSON.stringify(config("s", prov())));
    const { candidates } = fetchCandidates(lib);
    const swapped: Fetcher = async () => ({ ok: true, status: 200, bytes: new Uint8Array([1, 2, 3]) });
    const out = await fetchOne(candidates[0]!, swapped);
    expect(out.status).toBe("sha-mismatch");
    expect(existsSync(candidates[0]!.midiPath)).toBe(false);
  });

  it("reports an HTTP failure without writing", async () => {
    writeFileSync(join(lib, "classical", "s.json"), JSON.stringify(config("s", prov())));
    const { candidates } = fetchCandidates(lib);
    const gone: Fetcher = async () => ({ ok: false, status: 404, bytes: new Uint8Array() });
    const out = await fetchOne(candidates[0]!, gone);
    expect(out.status).toBe("http-error");
    expect(out.detail).toContain("404");
    expect(existsSync(candidates[0]!.midiPath)).toBe(false);
  });

  it("filters by genre and id", () => {
    mkdirSync(join(lib, "jazz"), { recursive: true });
    writeFileSync(join(lib, "classical", "a.json"), JSON.stringify(config("a", prov())));
    writeFileSync(join(lib, "jazz", "b.json"), JSON.stringify({ ...config("b", prov()), genre: "jazz" }));
    expect(fetchCandidates(lib, { genre: "jazz" }).candidates.map((c) => c.id)).toEqual(["b"]);
    expect(fetchCandidates(lib, { id: "a" }).candidates.map((c) => c.id)).toEqual(["a"]);
  });

  it("prints one terms block per source site with the recorded quote", () => {
    writeFileSync(join(lib, "classical", "a.json"), JSON.stringify(config("a", prov())));
    writeFileSync(join(lib, "classical", "b.json"), JSON.stringify(config("b", prov({ source_url: "https://example.test/b.mid" }))));
    const { candidates } = fetchCandidates(lib);
    const notice = termsNotice(candidates);
    expect(notice).toContain("example.test — 2 files");
    expect(notice).toContain("personal use only");
    expect(notice.split("terms:").length).toBe(2);
  });

  it("writes into stateHome/songs/library when the package library is not writable", async () => {
    const home = mkdtempSync(join(tmpdir(), "ajs-fetch-home-"));
    const prev = process.env.AI_JAM_HOME;
    process.env.AI_JAM_HOME = home;
    try {
      writeFileSync(join(lib, "classical", "s.json"), JSON.stringify(config("s", prov())));
      chmodSync(join(lib, "classical"), 0o555);
      const { candidates } = fetchCandidates(lib);
      const good: Fetcher = async () => ({ ok: true, status: 200, bytes: MIDI });
      let c = candidates[0]!;
      if (packageLibraryWritable(dirname(c.midiPath))) {
        // win32: chmod 0o555 often leaves the directory writable. Point at a
        // missing package dir so accessSync(W_OK) fails the same way a
        // read-only image library does.
        c = { ...c, midiPath: join(lib, "ro-missing", "s.mid") };
      }
      const dest = resolveFetchMidiPath(c);
      expect(dest.startsWith(join(home, "songs", "library"))).toBe(true);
      const out = await fetchOne(c, good);
      expect(out.status).toBe("fetched");
      expect(existsSync(join(lib, "classical", "s.mid"))).toBe(false);
      expect(readFileSync(dest)).toEqual(Buffer.from(MIDI));
      expect(out.detail).toContain(dest);
    } finally {
      chmodSync(join(lib, "classical"), 0o755);
      if (prev === undefined) delete process.env.AI_JAM_HOME;
      else process.env.AI_JAM_HOME = prev;
      rmSync(home, { recursive: true, force: true });
    }
  });
});
