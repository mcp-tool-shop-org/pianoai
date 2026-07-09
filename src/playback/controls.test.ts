// ─── PlaybackController Unit Tests ──────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { writeMidi } from "midi-file";
import { parseMidiBuffer } from "../midi/parser.js";
import { PlaybackController, createPlaybackController } from "./controls.js";
import type { AnyPlaybackEvent, StateChangeEvent, SpeedChangeEvent } from "./controls.js";
import type { VmpkConnector, MidiStatus, MidiNote } from "../types.js";

// ─── Test Helpers ───────────────────────────────────────────────────────────

function buildMidi(notes: Array<{
  note: number;
  velocity: number;
  startTick: number;
  endTick: number;
}>, bpm = 120, ticksPerBeat = 480): Uint8Array {
  const usPerBeat = Math.round(60_000_000 / bpm);
  type MidiEvent = { deltaTime: number; type: string; [key: string]: any };
  const events: MidiEvent[] = [];

  events.push({ deltaTime: 0, type: "setTempo", meta: true, microsecondsPerBeat: usPerBeat });

  const raw: Array<{ tick: number; event: MidiEvent }> = [];
  for (const n of notes) {
    raw.push({ tick: n.startTick, event: { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: n.note, velocity: n.velocity } });
    raw.push({ tick: n.endTick, event: { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: n.note, velocity: 0 } });
  }
  raw.sort((a, b) => a.tick - b.tick);

  let prevTick = 0;
  for (const r of raw) {
    r.event.deltaTime = r.tick - prevTick;
    prevTick = r.tick;
    events.push(r.event);
  }
  events.push({ deltaTime: 0, type: "endOfTrack", meta: true });

  return new Uint8Array(writeMidi({
    header: { format: 0 as const, numTracks: 1, ticksPerBeat },
    tracks: [events],
  } as any));
}

function createMockConnector(): VmpkConnector & { calls: Array<{ method: string; args: any[] }> } {
  const calls: Array<{ method: string; args: any[] }> = [];
  return {
    calls,
    async connect() { calls.push({ method: "connect", args: [] }); },
    async disconnect() { calls.push({ method: "disconnect", args: [] }); },
    status(): MidiStatus { return "connected"; },
    listPorts() { return ["Mock"]; },
    noteOn(note: number, velocity: number, channel?: number) {
      calls.push({ method: "noteOn", args: [note, velocity, channel] });
    },
    noteOff(note: number, channel?: number) {
      calls.push({ method: "noteOff", args: [note, channel] });
    },
    allNotesOff(channel?: number) {
      calls.push({ method: "allNotesOff", args: [channel] });
    },
    async playNote(midiNote: MidiNote) {
      calls.push({ method: "playNote", args: [midiNote] });
    },
  };
}

function createTestController(noteCount = 3) {
  const notes = [];
  for (let i = 0; i < noteCount; i++) {
    notes.push({ note: 60 + i, velocity: 100, startTick: i * 480, endTick: (i + 1) * 480 });
  }
  const buf = buildMidi(notes);
  const parsed = parseMidiBuffer(buf);
  const connector = createMockConnector();
  const controller = new PlaybackController(connector, parsed);
  return { controller, connector, parsed };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("PlaybackController", () => {

  // ── Speed change bounds ─────────────────────────────────────────────────

  describe("setSpeed bounds", () => {
    it("accepts speed at lower bound (just above 0)", () => {
      const { controller } = createTestController();
      expect(() => controller.setSpeed(0.1)).not.toThrow();
    });

    it("accepts speed at upper bound (4.0)", () => {
      const { controller } = createTestController();
      expect(() => controller.setSpeed(4.0)).not.toThrow();
    });

    it("accepts speed of 1.0", () => {
      const { controller } = createTestController();
      expect(() => controller.setSpeed(1.0)).not.toThrow();
    });

    it("rejects speed of 0", () => {
      const { controller } = createTestController();
      expect(() => controller.setSpeed(0)).toThrow(/speed/i);
    });

    it("rejects negative speed", () => {
      const { controller } = createTestController();
      expect(() => controller.setSpeed(-1)).toThrow(/speed/i);
    });

    it("rejects speed above 4.0", () => {
      const { controller } = createTestController();
      expect(() => controller.setSpeed(4.1)).toThrow(/speed/i);
    });

    it("emits speedChange event with correct previous/new values", () => {
      const { controller } = createTestController();
      const events: SpeedChangeEvent[] = [];
      controller.on("speedChange", (e) => events.push(e as SpeedChangeEvent));

      controller.setSpeed(2.0);
      expect(events).toHaveLength(1);
      expect(events[0].previousSpeed).toBe(1.0);
      expect(events[0].newSpeed).toBe(2.0);

      controller.setSpeed(0.5);
      expect(events).toHaveLength(2);
      expect(events[1].previousSpeed).toBe(2.0);
      expect(events[1].newSpeed).toBe(0.5);
    });
  });

  // ── Pause / resume state transitions ──────────────────────────────────

  describe("pause/resume state transitions", () => {
    it("pause during playback emits a stateChange event", async () => {
      const { controller } = createTestController(20);
      const stateEvents: StateChangeEvent[] = [];
      controller.on("stateChange", (e) => stateEvents.push(e as StateChangeEvent));

      const playPromise = controller.play({ speed: 2.0 });
      await new Promise((r) => setTimeout(r, 20));
      controller.pause();
      await playPromise;

      // At least one stateChange should have fired
      expect(stateEvents.length).toBeGreaterThan(0);
    });

    it("pause calls engine.pause which silences active notes", async () => {
      const { controller, connector } = createTestController(20);

      const playPromise = controller.play({ speed: 2.0 });
      await new Promise((r) => setTimeout(r, 30));
      controller.pause();
      await playPromise;

      // allNotesOff should have been called for cleanup
      const panics = connector.calls.filter((c) => c.method === "allNotesOff");
      expect(panics.length).toBeGreaterThan(0);
    });

    it("pause when not playing is a safe no-op", () => {
      const { controller } = createTestController();
      // idle state — pause should not throw
      expect(() => controller.pause()).not.toThrow();
    });

    it("resume when not paused is a no-op", async () => {
      const { controller } = createTestController();
      // Controller is in idle state, resume should do nothing
      await controller.resume();
      expect(controller.state).toBe("idle");
    });

    it("resume when stopped is a no-op", async () => {
      const { controller } = createTestController(20);
      const playPromise = controller.play({ speed: 2.0 });
      await new Promise((r) => setTimeout(r, 20));
      controller.stop();
      await playPromise;

      expect(controller.state).toBe("stopped");
      await controller.resume();
      expect(controller.state).toBe("stopped");
    });

    it("multiple pauses do not throw", async () => {
      const { controller } = createTestController(20);
      const playPromise = controller.play({ speed: 2.0 });
      await new Promise((r) => setTimeout(r, 20));
      controller.pause();
      await playPromise;

      // Second pause should be safe
      expect(() => controller.pause()).not.toThrow();
    });
  });

  // ── Stop cleanup ──────────────────────────────────────────────────────

  describe("stop cleanup", () => {
    it("stop resets event index and calls allNotesOff", async () => {
      const { controller, connector } = createTestController(20);

      const playPromise = controller.play({ speed: 2.0 });
      await new Promise((r) => setTimeout(r, 30));
      controller.stop();
      await playPromise;

      expect(controller.state).toBe("stopped");
      // allNotesOff should have been called for cleanup
      const panics = connector.calls.filter((c) => c.method === "allNotesOff");
      expect(panics.length).toBeGreaterThan(0);
    });

    it("stop emits stateChange event", async () => {
      const { controller } = createTestController(20);
      const stateEvents: StateChangeEvent[] = [];
      controller.on("stateChange", (e) => stateEvents.push(e as StateChangeEvent));

      const playPromise = controller.play({ speed: 2.0 });
      await new Promise((r) => setTimeout(r, 20));
      controller.stop();
      await playPromise;

      const stopEvent = stateEvents.find((e) => e.state === "stopped");
      expect(stopEvent).toBeDefined();
    });

    it("stop when already stopped is safe (no throw)", () => {
      const { controller } = createTestController();
      controller.stop();
      expect(controller.state).toBe("stopped");
      // Second stop should not throw
      controller.stop();
      expect(controller.state).toBe("stopped");
    });

    it("stop when idle is safe", () => {
      const { controller } = createTestController();
      expect(controller.state).toBe("idle");
      controller.stop();
      expect(controller.state).toBe("stopped");
    });
  });

  // ── Event system ──────────────────────────────────────────────────────

  describe("event system", () => {
    it("on() returns an unsubscribe function", () => {
      const { controller } = createTestController();
      const events: AnyPlaybackEvent[] = [];
      const unsub = controller.on("speedChange", (e) => events.push(e));

      controller.setSpeed(2.0);
      expect(events).toHaveLength(1);

      unsub();
      controller.setSpeed(3.0);
      expect(events).toHaveLength(1); // no new event after unsub
    });

    it("off() removes a specific listener", () => {
      const { controller } = createTestController();
      const events: AnyPlaybackEvent[] = [];
      const listener = (e: AnyPlaybackEvent) => events.push(e);
      controller.on("speedChange", listener);

      controller.setSpeed(2.0);
      expect(events).toHaveLength(1);

      controller.off("speedChange", listener);
      controller.setSpeed(3.0);
      expect(events).toHaveLength(1);
    });

    it("removeAllListeners() clears everything", () => {
      const { controller } = createTestController();
      const events: AnyPlaybackEvent[] = [];
      controller.on("speedChange", (e) => events.push(e));
      controller.on("stateChange", (e) => events.push(e));

      controller.removeAllListeners();

      controller.setSpeed(2.0);
      controller.stop();
      expect(events).toHaveLength(0);
    });

    it("wildcard listener receives all event types", async () => {
      const { controller } = createTestController();
      const events: AnyPlaybackEvent[] = [];
      controller.on("*", (e) => events.push(e));

      controller.setSpeed(2.0);
      controller.stop();

      // Should have speedChange + stateChange
      const types = new Set(events.map((e) => e.type));
      expect(types.has("speedChange")).toBe(true);
      expect(types.has("stateChange")).toBe(true);
    });

    it("listener errors do not break emission", () => {
      const { controller } = createTestController();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const events: AnyPlaybackEvent[] = [];
      controller.on("speedChange", () => { throw new Error("boom"); });
      controller.on("speedChange", (e) => events.push(e));

      controller.setSpeed(2.0);

      // Second listener still fires despite first throwing
      expect(events).toHaveLength(1);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  // ── State accessors ───────────────────────────────────────────────────

  describe("state accessors", () => {
    it("initial state is idle", () => {
      const { controller } = createTestController();
      expect(controller.state).toBe("idle");
    });

    it("speed defaults to 1.0", () => {
      const { controller } = createTestController();
      expect(controller.speed).toBe(1.0);
    });

    it("totalEvents reflects parsed MIDI note count", () => {
      const { controller, parsed } = createTestController(5);
      expect(controller.totalEvents).toBe(parsed.events.length);
    });

    it("durationSeconds is accessible", () => {
      const { controller } = createTestController();
      expect(controller.durationSeconds).toBeGreaterThan(0);
    });
  });

  // ── createPlaybackController shorthand ────────────────────────────────

  describe("createPlaybackController", () => {
    it("returns a PlaybackController instance", () => {
      const connector = createMockConnector();
      const buf = buildMidi([{ note: 60, velocity: 100, startTick: 0, endTick: 480 }]);
      const parsed = parseMidiBuffer(buf);
      const ctrl = createPlaybackController(connector, parsed);
      expect(ctrl).toBeInstanceOf(PlaybackController);
    });
  });

  // ── Reset ─────────────────────────────────────────────────────────────

  describe("reset", () => {
    it("reset returns to idle state", async () => {
      const { controller } = createTestController();
      await controller.play({ speed: 4 });
      expect(controller.state).toBe("finished");

      controller.reset();
      expect(controller.state).toBe("idle");
    });

    it("reset emits stateChange event", () => {
      const { controller } = createTestController();
      const events: StateChangeEvent[] = [];
      controller.on("stateChange", (e) => events.push(e as StateChangeEvent));

      controller.reset();
      // idle -> idle does not emit (emitStateChange checks for actual change)
      expect(events).toHaveLength(0);

      // Stop first so state is different, then reset
      controller.stop();
      events.length = 0;
      controller.reset();
      const resetEvent = events.find((e) => e.state === "idle");
      expect(resetEvent).toBeDefined();
    });
  });
});
