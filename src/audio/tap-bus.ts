// ─── ai-jam-sessions: Dedicated tap bus ──────────────────────────────────────
//
// Fan-out from an engine's own master (or the node that plays that role)
// onto a dedicated GainNode. Observers connect here. The existing
// master → destination edge is not touched, so a tap cannot silence the
// instrument.
//
// This is the one helper createTapOutput() on every engine calls. It is
// extracted so the "destination is unaltered" property can be tested
// against a mock graph, without injecting a context into engines that
// have no injection seam and without creating an AudioContext.
// ─────────────────────────────────────────────────────────────────────────────

export interface TapBusGain {
  gain: { value: number };
  connect(destination: unknown): unknown;
}

export interface TapBusContext {
  createGain(): TapBusGain;
}

export interface TapBusSource {
  connect(destination: unknown): unknown;
}

/**
 * Lazily-created observer bus. Does not sit between `master` and
 * destination; callers must not disconnect `master` to insert it.
 */
export function createTapBus(ctx: TapBusContext, master: TapBusSource): TapBusGain {
  const tapBus = ctx.createGain();
  tapBus.gain.value = 1;
  master.connect(tapBus);
  return tapBus;
}
