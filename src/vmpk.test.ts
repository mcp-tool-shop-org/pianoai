import { describe, it, expect } from "vitest";
import { createMockVmpkConnector } from "./vmpk.js";

describe("createMockVmpkConnector", () => {
  // ── noteOn / noteOff record events correctly ──────────────────────────────

  it("noteOn records event with note, velocity, and channel", async () => {
    const mock = createMockVmpkConnector();
    await mock.connect();
    mock.noteOn(60, 100, 1);
    expect(mock.events).toContainEqual({
      type: "noteOn",
      note: 60,
      velocity: 100,
      channel: 1,
    });
  });

  it("noteOn defaults channel to 0", async () => {
    const mock = createMockVmpkConnector();
    await mock.connect();
    mock.noteOn(72, 80);
    expect(mock.events).toContainEqual({
      type: "noteOn",
      note: 72,
      velocity: 80,
      channel: 0,
    });
  });

  it("noteOff records event with note and channel", async () => {
    const mock = createMockVmpkConnector();
    await mock.connect();
    mock.noteOff(60, 3);
    expect(mock.events).toContainEqual({
      type: "noteOff",
      note: 60,
      channel: 3,
    });
  });

  it("noteOff defaults channel to 0", async () => {
    const mock = createMockVmpkConnector();
    await mock.connect();
    mock.noteOff(48);
    expect(mock.events).toContainEqual({
      type: "noteOff",
      note: 48,
      channel: 0,
    });
  });

  // ── allNotesOff ───────────────────────────────────────────────────────────

  it("allNotesOff records event", async () => {
    const mock = createMockVmpkConnector();
    await mock.connect();
    mock.allNotesOff(5);
    expect(mock.events).toContainEqual({ type: "allNotesOff", channel: 5 });
  });

  it("allNotesOff defaults channel to 0", async () => {
    const mock = createMockVmpkConnector();
    await mock.connect();
    mock.allNotesOff();
    expect(mock.events).toContainEqual({ type: "allNotesOff", channel: 0 });
  });

  // ── playNote ──────────────────────────────────────────────────────────────

  it("playNote with valid note records playNote event", async () => {
    const mock = createMockVmpkConnector();
    await mock.connect();
    await mock.playNote({ note: 64, velocity: 90, durationMs: 200, channel: 0 });
    expect(mock.events).toContainEqual({
      type: "playNote",
      note: 64,
      velocity: 90,
      channel: 0,
    });
  });

  it("playNote with rest (note = -1) records rest event", async () => {
    const mock = createMockVmpkConnector();
    await mock.connect();
    await mock.playNote({ note: -1, velocity: 0, durationMs: 500, channel: 0 });
    expect(mock.events).toContainEqual({ type: "rest", note: -1 });
  });

  it("playNote rest does not record a playNote event", async () => {
    const mock = createMockVmpkConnector();
    await mock.connect();
    await mock.playNote({ note: -1, velocity: 0, durationMs: 100, channel: 0 });
    const playNotes = mock.events.filter((e) => e.type === "playNote");
    expect(playNotes).toHaveLength(0);
  });

  // ── connect / disconnect state transitions ────────────────────────────────

  it("starts disconnected", () => {
    const mock = createMockVmpkConnector();
    expect(mock.status()).toBe("disconnected");
  });

  it("status is connected after connect()", async () => {
    const mock = createMockVmpkConnector();
    await mock.connect();
    expect(mock.status()).toBe("connected");
  });

  it("status is disconnected after disconnect()", async () => {
    const mock = createMockVmpkConnector();
    await mock.connect();
    await mock.disconnect();
    expect(mock.status()).toBe("disconnected");
  });

  it("connect and disconnect record events", async () => {
    const mock = createMockVmpkConnector();
    await mock.connect();
    await mock.disconnect();
    expect(mock.events[0]).toEqual({ type: "connect" });
    expect(mock.events[1]).toEqual({ type: "disconnect" });
  });

  // ── listPorts ─────────────────────────────────────────────────────────────

  it("listPorts returns mock port", () => {
    const mock = createMockVmpkConnector();
    expect(mock.listPorts()).toEqual(["Mock Port 1"]);
  });

  // ── Multiple events accumulate ────────────────────────────────────────────

  it("accumulates multiple events in order", async () => {
    const mock = createMockVmpkConnector();
    await mock.connect();
    mock.noteOn(60, 100, 0);
    mock.noteOff(60, 0);
    mock.allNotesOff(0);

    const types = mock.events.map((e) => e.type);
    expect(types).toEqual(["connect", "noteOn", "noteOff", "allNotesOff"]);
  });
});

// ── MIDI status byte calculations (pure math, no hardware) ────────────────

describe("MIDI status byte calculations", () => {
  it("note-on status byte is 0x90 + channel", () => {
    for (let ch = 0; ch < 16; ch++) {
      expect(0x90 + ch).toBe(144 + ch);
    }
  });

  it("note-off status byte is 0x80 + channel", () => {
    for (let ch = 0; ch < 16; ch++) {
      expect(0x80 + ch).toBe(128 + ch);
    }
  });

  it("channel 0 note-on is 0x90 (144)", () => {
    expect(0x90 + 0).toBe(144);
  });

  it("channel 15 note-on is 0x9F (159)", () => {
    expect(0x90 + 15).toBe(0x9f);
  });
});

// ── Velocity/note 7-bit masking ──────────────────────────────────────────

describe("7-bit MIDI masking (& 0x7F)", () => {
  it("values 0-127 pass through unchanged", () => {
    for (const v of [0, 1, 60, 100, 127]) {
      expect(v & 0x7f).toBe(v);
    }
  });

  it("128 wraps to 0", () => {
    expect(128 & 0x7f).toBe(0);
  });

  it("255 wraps to 127", () => {
    expect(255 & 0x7f).toBe(127);
  });

  it("200 masks to 72", () => {
    expect(200 & 0x7f).toBe(72);
  });
});
