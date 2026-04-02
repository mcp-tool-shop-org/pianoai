// ─── Error Shape Tests ──────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import {
  JamError,
  handleError,
  EXIT_OK,
  EXIT_USER,
  EXIT_RUNTIME,
} from "./errors.js";

describe("JamError", () => {
  it("constructs with required fields", () => {
    const err = new JamError({
      code: "INPUT_INVALID_SONG",
      message: "Song data is invalid",
    });
    expect(err.code).toBe("INPUT_INVALID_SONG");
    expect(err.message).toBe("Song data is invalid");
    expect(err.name).toBe("JamError");
    expect(err.retryable).toBe(false);
    expect(err.hint).toBeUndefined();
    expect(err.cause).toBeUndefined();
  });

  it("constructs with all optional fields", () => {
    const cause = new Error("root cause");
    const err = new JamError({
      code: "IO_FILE_READ",
      message: "Cannot read file",
      hint: "Check file permissions",
      cause,
      retryable: true,
    });
    expect(err.hint).toBe("Check file permissions");
    expect(err.cause).toBe(cause);
    expect(err.retryable).toBe(true);
  });

  it("is an instance of Error", () => {
    const err = new JamError({ code: "RUNTIME_ENGINE", message: "boom" });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(JamError);
  });

  describe("toUserString", () => {
    it("formats without hint", () => {
      const err = new JamError({ code: "CONFIG_MISSING", message: "No config found" });
      expect(err.toUserString()).toBe("[CONFIG_MISSING] No config found");
    });

    it("formats with hint", () => {
      const err = new JamError({
        code: "IO_MIDI_PORT",
        message: "Port not found",
        hint: "Connect your MIDI device",
      });
      const str = err.toUserString();
      expect(str).toContain("[IO_MIDI_PORT] Port not found");
      expect(str).toContain("Hint: Connect your MIDI device");
    });
  });

  describe("toMcpResult", () => {
    it("returns structured object without hint", () => {
      const err = new JamError({ code: "RUNTIME_UNEXPECTED", message: "oops" });
      const result = err.toMcpResult();
      expect(result).toEqual({
        code: "RUNTIME_UNEXPECTED",
        message: "oops",
        retryable: false,
      });
      expect(result).not.toHaveProperty("hint");
    });

    it("returns structured object with hint", () => {
      const err = new JamError({
        code: "INPUT_PARSE_ERROR",
        message: "Bad JSON",
        hint: "Check syntax",
        retryable: true,
      });
      const result = err.toMcpResult();
      expect(result).toEqual({
        code: "INPUT_PARSE_ERROR",
        message: "Bad JSON",
        hint: "Check syntax",
        retryable: true,
      });
    });
  });
});

describe("handleError", () => {
  it("returns EXIT_USER for INPUT_ errors", () => {
    const err = new JamError({ code: "INPUT_INVALID_ARGS", message: "bad args" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitCode = handleError(err, false);
    expect(exitCode).toBe(EXIT_USER);
    spy.mockRestore();
  });

  it("returns EXIT_USER for CONFIG_ errors", () => {
    const err = new JamError({ code: "CONFIG_INVALID", message: "bad config" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitCode = handleError(err, false);
    expect(exitCode).toBe(EXIT_USER);
    spy.mockRestore();
  });

  it("returns EXIT_RUNTIME for RUNTIME_ errors", () => {
    const err = new JamError({ code: "RUNTIME_AUDIO", message: "audio fail" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitCode = handleError(err, false);
    expect(exitCode).toBe(EXIT_RUNTIME);
    spy.mockRestore();
  });

  it("returns EXIT_RUNTIME for IO_ errors", () => {
    const err = new JamError({ code: "IO_FILE_WRITE", message: "write fail" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitCode = handleError(err, false);
    expect(exitCode).toBe(EXIT_RUNTIME);
    spy.mockRestore();
  });

  it("prints hint when present", () => {
    const err = new JamError({
      code: "INPUT_MISSING_FILE",
      message: "not found",
      hint: "Check the path",
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    handleError(err, false);
    const output = spy.mock.calls.map(c => c[0]).join("\n");
    expect(output).toContain("Hint: Check the path");
    spy.mockRestore();
  });

  it("prints cause in debug mode", () => {
    const cause = new Error("root cause");
    const err = new JamError({
      code: "RUNTIME_TRANSPORT",
      message: "transport error",
      cause,
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    handleError(err, true);
    expect(spy.mock.calls.some(c => c[0] === cause)).toBe(true);
    spy.mockRestore();
  });

  it("does not print cause when debug is false", () => {
    const cause = new Error("root cause");
    const err = new JamError({
      code: "RUNTIME_TRANSPORT",
      message: "transport error",
      cause,
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    handleError(err, false);
    expect(spy.mock.calls.some(c => c[0] === cause)).toBe(false);
    spy.mockRestore();
  });

  it("handles plain Error instances", () => {
    const err = new Error("something went wrong");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitCode = handleError(err, false);
    expect(exitCode).toBe(EXIT_RUNTIME);
    expect(spy.mock.calls[0][0]).toContain("something went wrong");
    spy.mockRestore();
  });

  it("handles non-Error values", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitCode = handleError("string error", false);
    expect(exitCode).toBe(EXIT_RUNTIME);
    expect(spy.mock.calls[0][0]).toContain("string error");
    spy.mockRestore();
  });
});

describe("exit code constants", () => {
  it("EXIT_OK is 0", () => expect(EXIT_OK).toBe(0));
  it("EXIT_USER is 1", () => expect(EXIT_USER).toBe(1));
  it("EXIT_RUNTIME is 2", () => expect(EXIT_RUNTIME).toBe(2));
});
