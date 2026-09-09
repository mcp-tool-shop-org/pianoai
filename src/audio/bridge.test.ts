// ─── Intent bridge tests ─────────────────────────────────────────────────────
//
// Fake controller, injected clock. No live AudioContext. Load-bearing: a
// chord is exact, unsubscribe stops updates, stop/pause/finish clear holds.

import { describe, it, expect, afterEach } from "vitest";
import { Ensemble } from "./ensemble.js";
import {
  audioClockSeconds,
  subscribeEnsemble,
} from "./bridge.js";
import { setSharedAudioContext } from "../audio-shared.js";
import type {
  AnyPlaybackEvent,
  NoteOffEvent,
  NoteOnEvent,
  PlaybackEventType,
  PlaybackListener,
  StateChangeEvent,
} from "../playback/controls.js";
import type { MidiPlaybackState } from "../playback/midi-engine.js";

afterEach(() => {
  setSharedAudioContext(null);
});

class FakeController {
  private listeners = new Map<PlaybackEventType | "*", Set<PlaybackListener>>();
  on(type: PlaybackEventType | "*", listener: PlaybackListener): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
    return () => this.listeners.get(type)!.delete(listener);
  }
  emit(event: AnyPlaybackEvent): void {
    for (const fn of this.listeners.get(event.type) ?? []) fn(event);
  }
}

function noteOn(note: number, positionSeconds = 1): NoteOnEvent {
  return {
    type: "noteOn",
    note,
    noteName: "x",
    velocity: 90,
    channel: 0,
    duration: 1,
    eventIndex: 0,
    totalEvents: 3,
    positionSeconds,
    state: "playing",
  };
}

function noteOff(note: number, positionSeconds = 2): NoteOffEvent {
  return {
    type: "noteOff",
    note,
    noteName: "x",
    channel: 0,
    positionSeconds,
    state: "playing",
  };
}

function stateChange(
  state: MidiPlaybackState,
  previousState: MidiPlaybackState = "playing",
  positionSeconds = 3,
): StateChangeEvent {
  return {
    type: "stateChange",
    state,
    previousState,
    positionSeconds,
  };
}

describe("subscribeEnsemble — the chord is what we sent", () => {
  it("puts a three-note chord in the ensemble view", () => {
    const ensemble = new Ensemble();
    ensemble.addInstrument({ id: "piano", label: "Concert Grand" });
    const controller = new FakeController();
    const clock = (event: AnyPlaybackEvent) => event.positionSeconds;
    const off = subscribeEnsemble(ensemble, controller, { instrumentId: "piano", clock });

    for (const n of [60, 64, 67]) controller.emit(noteOn(n, 1));

    const piano = ensemble.view(1.5).instruments[0]!;
    expect(piano.sounding.map((s) => s.note)).toEqual([60, 64, 67]);
    expect(piano.sounding.map((s) => s.name)).toEqual(["C4", "E4", "G4"]);
    expect(ensemble.view(1.5).chord).toEqual([60, 64, 67]);
    off();
  });

  it("releases on noteOff", () => {
    const ensemble = new Ensemble();
    ensemble.addInstrument({ id: "piano" });
    const controller = new FakeController();
    const clock = (event: AnyPlaybackEvent) => event.positionSeconds;
    subscribeEnsemble(ensemble, controller, { instrumentId: "piano", clock });

    controller.emit(noteOn(60, 1));
    controller.emit(noteOff(60, 1.5));
    expect(ensemble.view(1.6).instruments[0]!.sounding).toHaveLength(0);
  });

  it("uses the injected clock for atSec, not a live context", () => {
    const ensemble = new Ensemble();
    ensemble.addInstrument({ id: "piano" });
    const controller = new FakeController();
    subscribeEnsemble(ensemble, controller, {
      instrumentId: "piano",
      clock: () => 9.5,
    });
    controller.emit(noteOn(60, 1));
    expect(ensemble.view(10).instruments[0]!.sounding[0]!.startedSec).toBe(9.5);
  });
});

describe("subscribeEnsemble — unsubscribe and panic", () => {
  it("stops updating after unsubscribe", () => {
    const ensemble = new Ensemble();
    ensemble.addInstrument({ id: "piano" });
    const controller = new FakeController();
    const clock = (event: AnyPlaybackEvent) => event.positionSeconds;
    const off = subscribeEnsemble(ensemble, controller, { instrumentId: "piano", clock });
    controller.emit(noteOn(60, 1));
    off();
    controller.emit(noteOn(64, 1.2));
    expect(ensemble.view(2).instruments[0]!.sounding.map((s) => s.note)).toEqual([60]);
  });

  it("clears held notes on stopped, paused, and finished", () => {
    for (const state of ["stopped", "paused", "finished"] as const) {
      const ensemble = new Ensemble();
      ensemble.addInstrument({ id: "piano" });
      const controller = new FakeController();
      const clock = (event: AnyPlaybackEvent) => event.positionSeconds;
      subscribeEnsemble(ensemble, controller, { instrumentId: "piano", clock });
      for (const n of [60, 64, 67]) controller.emit(noteOn(n, 1));
      controller.emit(stateChange(state, "playing", 2));
      expect(ensemble.view(2).instruments[0]!.sounding).toHaveLength(0);
    }
  });

  it("does not clear on playing", () => {
    const ensemble = new Ensemble();
    ensemble.addInstrument({ id: "piano" });
    const controller = new FakeController();
    const clock = (event: AnyPlaybackEvent) => event.positionSeconds;
    subscribeEnsemble(ensemble, controller, { instrumentId: "piano", clock });
    controller.emit(noteOn(60, 1));
    controller.emit(stateChange("playing", "paused", 1.1));
    expect(ensemble.view(1.2).instruments[0]!.sounding).toHaveLength(1);
  });
});

describe("audioClockSeconds", () => {
  it("uses the shared context currentTime when it exists", () => {
    setSharedAudioContext({ currentTime: 12.5 });
    expect(audioClockSeconds(noteOn(60, 1))).toBe(12.5);
  });

  it("falls back to positionSeconds when there is no context", () => {
    setSharedAudioContext(null);
    expect(audioClockSeconds(noteOn(60, 3.25))).toBe(3.25);
  });
});
