import { describe, it, expect } from "vitest";
import { assertSchemaOwner, defineTask, publishedOwner } from "./registry.js";
import { acousticTask } from "../acoustic/task.js";

describe("schemaVersion collision", () => {
  it("allows the owner to declare its published version", () => {
    expect(publishedOwner("jam-actions-acoustic-v0/1.0.0")).toBe("acoustic-sft");
    expect(acousticTask.id).toBe("acoustic-sft");
    expect(acousticTask.schemaVersion).toBe("jam-actions-acoustic-v0/1.0.0");
    expect(() => assertSchemaOwner(acousticTask)).not.toThrow();
  });

  it("rejects a different task claiming a published version", () => {
    expect(() =>
      defineTask({
        id: "someone-else",
        schemaVersion: "jam-actions-acoustic-v0/1.0.0",
        verdicts: ["a"],
        thresholds: {},
        cases: () => [],
        splitKey: () => "x",
      }),
    ).toThrow(/published by task "acoustic-sft"/);
  });
});
