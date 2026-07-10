import { describe, it, expect } from "vitest";
import { shouldPreviewPitchChange, previewSuppressed, PITCH_PREVIEW_MS, type PreviewGate } from "./preview.js";

const idleGate: PreviewGate = { isPlaying: false, isRecording: false };

describe("previewSuppressed", () => {
  it("is false when idle (not playing, not recording)", () => {
    expect(previewSuppressed(idleGate)).toBe(false);
  });

  it("is true while playing", () => {
    expect(previewSuppressed({ isPlaying: true, isRecording: false })).toBe(true);
  });

  it("is true while recording", () => {
    expect(previewSuppressed({ isPlaying: false, isRecording: true })).toBe(true);
  });

  it("is true while both playing and recording", () => {
    expect(previewSuppressed({ isPlaying: true, isRecording: true })).toBe(true);
  });
});

describe("shouldPreviewPitchChange", () => {
  it("returns true when the pitch actually changed and nothing suppresses it", () => {
    expect(shouldPreviewPitchChange(60, 62, idleGate)).toBe(true);
  });

  it("returns false for a time-only move (pitch unchanged)", () => {
    expect(shouldPreviewPitchChange(60, 60, idleGate)).toBe(false);
  });

  it("returns false while playing, even if the pitch changed", () => {
    expect(shouldPreviewPitchChange(60, 62, { isPlaying: true, isRecording: false })).toBe(false);
  });

  it("returns false while recording, even if the pitch changed", () => {
    expect(shouldPreviewPitchChange(60, 62, { isPlaying: false, isRecording: true })).toBe(false);
  });

  it("throttles a lingering drag: re-evaluating the SAME row (caller passes its last-previewed midi as prevMidi) returns false", () => {
    // Simulates a caller's own throttle state: prevMidi is updated to
    // nextMidi only when a preview actually fires.
    let lastPreviewedMidi = 60;
    const tick1 = shouldPreviewPitchChange(lastPreviewedMidi, 60, idleGate); // no row crossing yet
    expect(tick1).toBe(false);

    const tick2 = shouldPreviewPitchChange(lastPreviewedMidi, 62, idleGate); // crossed a row
    expect(tick2).toBe(true);
    if (tick2) lastPreviewedMidi = 62;

    const tick3 = shouldPreviewPitchChange(lastPreviewedMidi, 62, idleGate); // pointer lingers on the new row
    expect(tick3).toBe(false);
  });

  it("fires again on a SECOND distinct row crossing", () => {
    let lastPreviewedMidi = 60;
    expect(shouldPreviewPitchChange(lastPreviewedMidi, 61, idleGate)).toBe(true);
    lastPreviewedMidi = 61;
    expect(shouldPreviewPitchChange(lastPreviewedMidi, 62, idleGate)).toBe(true);
  });
});

describe("PITCH_PREVIEW_MS", () => {
  it("is a short blip, not a held note", () => {
    expect(PITCH_PREVIEW_MS).toBe(120);
  });
});
