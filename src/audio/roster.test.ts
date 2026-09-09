// ─── Roster tests ────────────────────────────────────────────────────────────
//
// The label defect shipped because nothing asserted it. Every engine id
// keeps its own name. A layered connector is N instruments, not one.

import { describe, it, expect } from "vitest";
import { createLayeredEngine } from "../layered-engine.js";
import {
  ENGINE_IDS,
  ENGINE_LABELS,
  type MidiNote,
  type MidiStatus,
  type VmpkConnector,
} from "../types.js";
import { rosterFor, soloInstrument } from "./roster.js";

function mockConnector(ports: string[] = ["Port"]): VmpkConnector {
  return {
    async connect() {},
    async disconnect() {},
    status(): MidiStatus {
      return "disconnected";
    },
    listPorts() {
      return ports;
    },
    noteOn() {},
    noteOff() {},
    allNotesOff() {},
    async playNote(_note: MidiNote) {},
  };
}

/** Lazy singleton, like a real engine's tapBus. */
function mockTappable(ports: string[], bus: object): VmpkConnector {
  return {
    ...mockConnector(ports),
    createTapOutput() {
      return bus;
    },
  };
}

describe("soloInstrument — the name of what is actually playing", () => {
  it("keeps every engine id's own label, and none is silently piano except piano", () => {
    for (const id of ENGINE_IDS) {
      const spec = soloInstrument(id);
      expect(spec.id).toBe(id);
      expect(spec.label).toBe(ENGINE_LABELS[id]);
    }
    expect(ENGINE_LABELS.guitar).not.toBe(ENGINE_LABELS.piano);
    expect(ENGINE_LABELS.vocal).not.toBe(ENGINE_LABELS.piano);
    expect(ENGINE_LABELS.tract).not.toBe(ENGINE_LABELS.piano);
    expect(ENGINE_LABELS.sample).not.toBe(ENGINE_LABELS.piano);
  });
});

describe("rosterFor", () => {
  it("yields exactly one entry for a plain connector, named by the caller", () => {
    for (const id of ENGINE_IDS) {
      const roster = rosterFor(mockConnector(), soloInstrument(id));
      expect(roster).toHaveLength(1);
      expect(roster[0]).toEqual({ id, label: ENGINE_LABELS[id] });
    }
  });

  it("yields one entry per child of a layered connector", () => {
    const layered = createLayeredEngine(
      [mockConnector(["Piano"]), mockConnector(["Synth"])],
      {
        children: [
          { id: "piano", label: "piano" },
          { id: "synth", label: "vocal-synth" },
        ],
      },
    );
    const roster = rosterFor(layered, { id: "ignored", label: "ignored" });
    expect(roster).toEqual([
      { id: "piano", label: "piano" },
      { id: "synth", label: "vocal-synth" },
    ]);
  });

  it("falls back to listPorts labels when children metadata is omitted", () => {
    const layered = createLayeredEngine([
      mockConnector(["Built-in Piano (Concert Grand)"]),
      mockConnector(["VocalSynth:default-voice"]),
    ]);
    const roster = rosterFor(layered, { id: "ignored", label: "ignored" });
    expect(roster).toEqual([
      { id: "child-0", label: "Built-in Piano (Concert Grand)" },
      { id: "child-1", label: "VocalSynth:default-voice" },
    ]);
  });

  it("refuses children metadata that does not match engine count", () => {
    expect(() =>
      createLayeredEngine([mockConnector()], {
        children: [
          { id: "piano", label: "piano" },
          { id: "synth", label: "vocal-synth" },
        ],
      }),
    ).toThrow(/must match engines/);
  });
});

describe("layered engine — tap the children, never the mix", () => {
  it("exposes children() and has no createTapOutput", () => {
    const layered = createLayeredEngine([
      mockConnector(["Piano"]),
      mockConnector(["Synth"]),
    ]);
    expect(layered.children?.()).toEqual([
      { id: "child-0", label: "Piano" },
      { id: "child-1", label: "Synth" },
    ]);
    expect(layered.createTapOutput).toBeUndefined();
  });
});

describe("rosterFor — per-child tap factories", () => {
  it("gives each tappable child its own bus, distinct across children, same bus twice", () => {
    const busA = { name: "piano" };
    const busB = { name: "synth" };
    const layered = createLayeredEngine([
      mockTappable(["Piano"], busA),
      mockTappable(["Synth"], busB),
    ]);
    const roster = rosterFor(layered, { id: "ignored", label: "ignored" });

    expect(roster).toHaveLength(2);
    expect(roster[0]!.createTapOutput).toEqual(expect.any(Function));
    expect(roster[1]!.createTapOutput).toEqual(expect.any(Function));

    const first = roster[0]!.createTapOutput!();
    const firstAgain = roster[0]!.createTapOutput!();
    const second = roster[1]!.createTapOutput!();
    expect(first).toBe(busA);
    expect(firstAgain).toBe(busA);
    expect(first).toBe(firstAgain);
    expect(second).toBe(busB);
    expect(first).not.toBe(second);
  });

  it("omits the factory on a child that has no tap, and does not throw", () => {
    const bus = { name: "heard" };
    const layered = createLayeredEngine([
      mockConnector(["Silent"]),
      mockTappable(["Heard"], bus),
    ]);
    const roster = rosterFor(layered, { id: "ignored", label: "ignored" });
    expect(roster).toHaveLength(2);
    expect(roster[0]!.createTapOutput).toBeUndefined();
    expect(roster[1]!.createTapOutput!()).toBe(bus);
  });

  it("passes a plain connector's own factory through, still exactly one entry", () => {
    const bus = { name: "solo" };
    const roster = rosterFor(mockTappable(["Piano"], bus), soloInstrument("piano"));
    expect(roster).toHaveLength(1);
    expect(roster[0]!.id).toBe("piano");
    expect(roster[0]!.createTapOutput!()).toBe(bus);
    expect(roster[0]!.createTapOutput!()).toBe(roster[0]!.createTapOutput!());
  });

  it("does not honour a factory smuggled through options.children", () => {
    const childBus = { name: "child" };
    const smuggled = { name: "smuggled" };
    const layered = createLayeredEngine([mockTappable(["Piano"], childBus)], {
      children: [
        {
          id: "piano",
          label: "piano",
          createTapOutput: () => smuggled,
        } as { id: string; label: string },
      ],
    });
    const roster = rosterFor(layered, { id: "ignored", label: "ignored" });
    expect(roster[0]!.createTapOutput!()).toBe(childBus);
    expect(roster[0]!.createTapOutput!()).not.toBe(smuggled);
  });
});
