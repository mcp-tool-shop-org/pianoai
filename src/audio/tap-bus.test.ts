// ─── Tap-bus helper tests ────────────────────────────────────────────────────
//
// Mock graph, no AudioContext. Load-bearing: the original master →
// destination edge survives; a second edge appears to the bus.

import { describe, it, expect } from "vitest";
import { createTapBus } from "./tap-bus.js";

class MockNode {
  readonly edges: unknown[] = [];
  gain = { value: 1 };
  connect(destination: unknown): unknown {
    this.edges.push(destination);
    return destination;
  }
}

describe("createTapBus", () => {
  it("fans master into a new gain without dropping the destination edge", () => {
    const destination = new MockNode();
    const master = new MockNode();
    master.connect(destination);
    const ctx = {
      createGain: () => new MockNode(),
    };

    const bus = createTapBus(ctx, master);

    expect(bus).not.toBe(master);
    expect(bus).not.toBe(destination);
    expect(bus.gain.value).toBe(1);
    expect(master.edges).toEqual([destination, bus]);
  });
});
