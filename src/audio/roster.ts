// ─── ai-jam-sessions: Ensemble roster ────────────────────────────────────────
//
// Given a connector, the instrument list the ensemble should hold.
//
// A plain engine is one instrument. A layered engine is N instruments —
// one per child — even though layering fans the same notes to every
// child. That identical intent is correct (it is what a duet is). They
// are still N rows because the acoustic channel will differ per child,
// and that difference is the reason to look. Collapsing them into one
// instrument with N voices would hide which child went silent.
//
// VmpkConnector has no id. The caller supplies the solo identity. The
// bug this closes is the caller inventing "piano" instead of passing
// what was actually playing.
// ─────────────────────────────────────────────────────────────────────────────

import type { VmpkConnector } from "../types.js";
import { ENGINE_LABELS, type EngineId } from "../types.js";
import type { InstrumentSpec } from "./ensemble.js";

export interface SoloIdentity {
  id: string;
  label: string;
}

/** The label the ensemble should use for a solo `engine:` id. */
export function soloInstrument(engineId: EngineId): SoloIdentity {
  return { id: engineId, label: ENGINE_LABELS[engineId] };
}

function withTap(
  spec: InstrumentSpec,
  source: { createTapOutput?: () => unknown },
): InstrumentSpec {
  if (typeof source.createTapOutput === "function") {
    spec.createTapOutput = source.createTapOutput;
  }
  return spec;
}

/**
 * Roster for this connector. Layered → one entry per child.
 * Plain → the supplied solo identity, exactly one.
 * Each entry carries that source's tap factory when it has one.
 */
export function rosterFor(
  connector: VmpkConnector,
  solo: SoloIdentity,
): InstrumentSpec[] {
  const kids = connector.children?.();
  if (kids && kids.length > 0) {
    return kids.map((c) => withTap({ id: c.id, label: c.label }, c));
  }
  return [withTap({ id: solo.id, label: solo.label }, connector)];
}
