import { describe, it, expect, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadPublishableSongs } from "./library.js";
import { testSongIds } from "./builder.js";
import {
  parseAcousticAssistant,
  onsetFailsGate,
  centsFailsGate,
  goldFromPredicates,
  acousticAssistantContent,
  round1,
} from "./f5-acoustic.js";
import { ONSET_TOL_MS, CENTS_TOL, PROBE_SCHEMA_VERSION, buildProbeRecords } from "./generate-probe.js";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 300_000 });
const RUN_DSP = process.env.SKIP_DSP_VERIFICATION !== "1";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROBE = join(HERE, "..", "..", "..", "datasets", "jam-actions-v1-probe");
const MAIN = join(HERE, "..", "..", "..", "datasets", "jam-actions-v1", "records.jsonl");

function probeRecords(): Array<Record<string, unknown>> {
  const p = join(PROBE, "records.jsonl");
  if (!existsSync(p)) throw new Error("jam-actions-v1-probe/records.jsonl missing — generate-probe first");
  return readFileSync(p, "utf8").trim().split("\n").map((l) => JSON.parse(l));
}

function score(r: Record<string, unknown>): { f0_hz: number; cents_from_target: number; onset_ms: number } {
  const session = (r.target_trace as { session: Array<{ role: string; tool?: string; content?: unknown }> }).session;
  const t = session.find((x) => x.role === "tool" && x.tool === "score_audio_take");
  return t!.content as { f0_hz: number; cents_from_target: number; onset_ms: number };
}

function lastAssistant(r: Record<string, unknown>): string {
  const session = (r.target_trace as { session: Array<{ role: string; content?: string }> }).session;
  return [...session].reverse().find((t) => t.role === "assistant")!.content!;
}

function bandOf(r: Record<string, unknown>): string {
  return (r.observation as { acoustic: { band: string } }).acoustic.band;
}

function leafDiff(a: unknown, b: unknown, path: string, out: string[]): void {
  if (Object.is(a, b)) return;
  if (typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= 1e-6) return;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    out.push(path);
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      out.push(path);
      return;
    }
    a.forEach((x, i) => leafDiff(x, b[i], `${path}[${i}]`, out));
    return;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) leafDiff(ao[k], bo[k], path ? `${path}.${k}` : k, out);
}

describe("jam-actions-v1-probe", () => {
  it("has its own schema_version and does not collide with the 349", () => {
    const rows = probeRecords();
    const main = new Set(
      readFileSync(MAIN, "utf8").trim().split("\n").map((l) => JSON.parse(l).id as string),
    );
    expect(main.size).toBe(349);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.schema_version).toBe(PROBE_SCHEMA_VERSION);
      expect(main.has(r.id as string), String(r.id)).toBe(false);
    }
  });

  it("uses only held-out songs", () => {
    const testIds = testSongIds(loadPublishableSongs());
    for (const r of probeRecords()) {
      const sid = (r.scope as { song_id: string }).song_id;
      expect(testIds.has(sid), sid).toBe(true);
    }
  });

  it("puts every take in its band within the stated tolerance", () => {
    for (const r of probeRecords()) {
      const t = score(r);
      const band = bandOf(r);
      const aC = Math.abs(t.cents_from_target);
      const aO = Math.abs(t.onset_ms);
      if (band === "onset_in") {
        expect(Math.abs(aO - 30), String(r.id)).toBeLessThanOrEqual(ONSET_TOL_MS);
        expect(aC, String(r.id)).toBeLessThan(50);
      } else if (band === "onset_out") {
        expect(Math.abs(aO - 50), String(r.id)).toBeLessThanOrEqual(ONSET_TOL_MS);
        expect(aC, String(r.id)).toBeLessThan(50);
      } else if (band === "cents_in") {
        expect(Math.abs(aC - 45), String(r.id)).toBeLessThanOrEqual(CENTS_TOL);
        expect(aO, String(r.id)).toBeLessThan(40);
      } else if (band === "cents_out") {
        expect(Math.abs(aC - 55), String(r.id)).toBeLessThanOrEqual(CENTS_TOL);
        expect(aO, String(r.id)).toBeLessThan(40);
      } else {
        throw new Error(`unknown band ${band}`);
      }
    }
  });

  it("labels equal the predicates on the printed numbers; every line parses", () => {
    for (const r of probeRecords()) {
      const t = score(r);
      const parsed = parseAcousticAssistant(lastAssistant(r));
      expect(parsed, String(r.id)).not.toBeNull();
      expect(parsed!.cents, String(r.id)).toBe(t.cents_from_target);
      expect(parsed!.onset, String(r.id)).toBe(t.onset_ms);
      const gold = goldFromPredicates({
        f0_hz: t.f0_hz,
        cents_from_target: t.cents_from_target,
        onset_ms: t.onset_ms,
      });
      expect(parsed!.label, String(r.id)).toBe(gold);
      expect((r.observation as { gold: { answer: string } }).gold.answer, String(r.id)).toBe(gold);
      expect(parsed!.d, String(r.id)).toBe(round1(Math.abs(parsed!.cents) - 50));
      expect(parsed!.e, String(r.id)).toBe(round1(Math.abs(parsed!.onset) - 40));
      expect(parsed!.pitchWord, String(r.id)).toBe(centsFailsGate(parsed!.cents) ? "against the gate" : "inside");
      expect(parsed!.onsetWord, String(r.id)).toBe(onsetFailsGate(parsed!.onset) ? "against the gate" : "inside");
    }
  });

  it("bare and plain-comparison each differ in 72 acoustic assistant leaves", () => {
    const rows = probeRecords();
    expect(rows.length).toBe(72);
    for (const target of ["bare", "comparison"] as const) {
      const diffs: string[] = [];
      for (const r of rows) {
        const t = score(r);
        const gold = (r.observation as { gold: { answer: string } }).gold.answer;
        const next = acousticAssistantContent(t.cents_from_target, t.onset_ms, gold, target);
        const copy = structuredClone(r);
        const last = [...(copy.target_trace as { session: Array<{ role: string; content?: string }> }).session]
          .reverse()
          .find((x) => x.role === "assistant") as { content: string };
        last.content = next;
        leafDiff(r, copy, String(r.id), diffs);
      }
      expect(diffs.length, target).toBe(72);
      expect(diffs.every((d) => d.endsWith(".content")), target).toBe(true);
    }
  });

  it("carries both signs in every band", () => {
    const byBand = new Map<string, number[]>();
    for (const r of probeRecords()) {
      const band = bandOf(r);
      const t = score(r);
      const v = band.startsWith("onset") ? t.onset_ms : t.cents_from_target;
      if (!byBand.has(band)) byBand.set(band, []);
      byBand.get(band)!.push(v);
    }
    for (const [band, vs] of byBand) {
      expect(vs.some((x) => x > 0), `${band} +`).toBe(true);
      expect(vs.some((x) => x < 0), `${band} −`).toBe(true);
    }
  });
});

// The fresh search renders many candidate takes per band; 228-236 s on the GitHub
// runner against a 180 s default (0ff1281). Same allowance as the v1 engine block.
describe.skipIf(!RUN_DSP)("probe rebuild-equals-committed", { timeout: 600_000 }, () => {
  it("rebuilds every probe assistant turn from a fresh search", () => {
    const committed = probeRecords();
    const { records } = buildProbeRecords();
    expect(records.length).toBe(committed.length);
    const byId = new Map(committed.map((r) => [r.id as string, r]));
    for (const b of records) {
      const c = byId.get(b.id);
      expect(c, b.id).toBeDefined();
      expect(b.observation.gold.answer, b.id).toBe((c!.observation as { gold: { answer: string } }).gold.answer);
      const bLast = [...b.target_trace.session].reverse().find((t) => t.role === "assistant")!.content;
      expect(bLast, b.id).toBe(lastAssistant(c!));
    }
  });
});
