import { describe, it, expect } from "vitest";
import { VERSION, NAME } from "./version.js";

describe("version", () => {
  it("should export a semver-shaped version string", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("should be at least 1.0.0", () => {
    const [major] = VERSION.split(".").map(Number);
    expect(major).toBeGreaterThanOrEqual(1);
  });

  it("should export package name", () => {
    expect(NAME).toBe("ai-jam-sessions");
  });
});
