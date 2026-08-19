import { describe, it, expect } from "vitest";
import { shouldSkipExistingLibraryFile } from "./library-write-guard.js";

describe("shouldSkipExistingLibraryFile (F-31c617e4)", () => {
  it("skips when the dest already exists (receipted library entry)", () => {
    expect(shouldSkipExistingLibraryFile(true)).toBe(true);
  });

  it("writes when the dest is missing (empty-library bootstrap)", () => {
    expect(shouldSkipExistingLibraryFile(false)).toBe(false);
  });
});
