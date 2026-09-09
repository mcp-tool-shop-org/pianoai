import { describe, it, expect } from "vitest";
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
} from "./f5-acoustic.js";
import { ONSET_TOL_MS, CENTS_TOL, PROBE_SCHEMA_VERSION } from "./generate-probe.js";

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
      const onsetWord = onsetFailsGate(parsed!.onset) ? "against a 40-ms gate" : "inside 40";
      const pitchWord = centsFailsGate(parsed!.cents) ? "against a 50-cent gate" : "inside a 50-cent gate";
      expect(lastAssistant(r), String(r.id)).toContain(onsetWord);
      expect(lastAssistant(r), String(r.id)).toContain(pitchWord);
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
