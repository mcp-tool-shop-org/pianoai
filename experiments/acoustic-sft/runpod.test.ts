import { describe, it, expect } from "vitest";
import {
  resolveDownTarget,
  foreignPods,
  podSessionName,
  receipt,
  terminateOne,
} from "./runpod.mjs";

describe("resolveDownTarget", () => {
  it("refuses when there is no state file and no explicit id", () => {
    expect(() => resolveDownTarget(undefined, null)).toThrow(/refuses to guess/);
  });

  it("defaults to the id in the state file", () => {
    expect(resolveDownTarget(undefined, { id: "bgwkbd40id2aqc" })).toBe("bgwkbd40id2aqc");
  });

  it("accepts an explicit id", () => {
    expect(resolveDownTarget("explicit-id", { id: "other" })).toBe("explicit-id");
  });

  it("--all is not a recognised argument", () => {
    expect(() => resolveDownTarget("--all", { id: "bgwkbd40id2aqc" })).toThrow(
      /not a recognised argument/,
    );
  });
});

describe("terminateOne against a two-pod listing", () => {
  it("DELETEs exactly the state-file id and no other", async () => {
    const deleted: string[] = [];
    const writes: string[] = [];
    const logs: string[] = [];
    const api = async (path: string, opts?: { method?: string }) => {
      if (opts?.method === "DELETE") deleted.push(path);
      if (path === "/pods") return [{ id: "ours" }, { id: "theirs" }];
      return {};
    };
    const rec = await terminateOne("ours", api, {
      log: (s: string) => logs.push(s),
      now: () => new Date("2026-09-08T12:55:00.000Z"),
      statePath: "/tmp/fake-state.json",
      existsSync: () => true,
      readFileSync: () => JSON.stringify({ id: "ours" }),
      writeFileSync: (_p: string, body: string) => { writes.push(body); },
    });
    expect(deleted).toEqual(["/pods/ours"]);
    expect(logs).toContain("terminated ours");
    expect(rec.terminated_id).toBe("ours");
    expect(rec.terminated_at).toBe("2026-09-08T12:55:00.000Z");
    expect(writes[0]).toMatch(/terminated_at/);
    expect(writes[0]).toMatch(/"terminated_id": "ours"/);
  });
});

describe("podSessionName", () => {
  it("is experiment-YYYYMMDD-HHMM", () => {
    const n = podSessionName(new Date("2026-09-08T12:55:00"), "acoustic-sft");
    expect(n).toBe("acoustic-sft-20260908-1255");
  });
});

describe("foreignPods", () => {
  it("treats the state-file id and session-named pods as ours", () => {
    const pods = [
      { id: "ours", name: "acoustic-sft-20260908-1255" },
      { id: "old", name: "acoustic-sft" },
      { id: "schumann", name: "schumann-resonance" },
    ];
    const foreign = foreignPods(pods, { experiment: "acoustic-sft", oursId: "ours" });
    expect(foreign.map((p) => p.id).sort()).toEqual(["old", "schumann"]);
  });
});
