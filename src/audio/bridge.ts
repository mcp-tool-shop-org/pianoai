// ─── ai-jam-sessions: Intent bridge ──────────────────────────────────────────
//
// Subscribe an Ensemble to a PlaybackController. The controller already
// emits noteOn/noteOff; we do not infer what is sounding — we sent it.
//
// CLOCK. Ensemble has none, on purpose. The acoustic tap is timestamped
// on the AUDIO clock (samples through ScriptProcessor). So atSec must
// come from AudioContext.currentTime when the shared context exists.
//
// Fallback: event.positionSeconds (score time at speed 1). COST: pause,
// seek, and speed make intent and acoustics LOOK like they disagree when
// nothing is wrong. A fake disagreement is worse than no disagreement
// check, because it trains the reader to ignore the real ones. Tests
// inject a clock so they need no live context.
//
// Stop / finished / paused → allNotesOff. Stuck notes are the classic
// failure of every note-tracking system.
// ─────────────────────────────────────────────────────────────────────────────

import { getSharedAudioContext } from "../audio-shared.js";
import type { Ensemble } from "./ensemble.js";
import type {
  AnyPlaybackEvent,
  PlaybackController,
  PlaybackListener,
} from "../playback/controls.js";

export interface BridgeOptions {
  instrumentId: string;
  /** Injected in tests. Production uses the audio clock, then score time. */
  clock?: (event: AnyPlaybackEvent) => number;
}

export function audioClockSeconds(event: AnyPlaybackEvent): number {
  const ctx = getSharedAudioContext();
  if (ctx && typeof ctx.currentTime === "number") return ctx.currentTime;
  return event.positionSeconds;
}

const CLEAR_STATES = new Set(["stopped", "finished", "paused"]);

/**
 * Wire controller events into the ensemble. Returns unsubscribe.
 */
export function subscribeEnsemble(
  ensemble: Ensemble,
  controller: Pick<PlaybackController, "on">,
  options: BridgeOptions,
): () => void {
  const { instrumentId } = options;
  const clock = options.clock ?? audioClockSeconds;

  const onNoteOn: PlaybackListener = (event) => {
    if (event.type !== "noteOn") return;
    ensemble.noteOn(instrumentId, {
      note: event.note,
      velocity: event.velocity,
      channel: event.channel,
      atSec: clock(event),
    });
  };
  const onNoteOff: PlaybackListener = (event) => {
    if (event.type !== "noteOff") return;
    ensemble.noteOff(instrumentId, event.note, clock(event));
  };
  const onState: PlaybackListener = (event) => {
    if (event.type !== "stateChange") return;
    if (CLEAR_STATES.has(event.state)) {
      ensemble.allNotesOff(instrumentId, clock(event));
    }
  };

  const offOn = controller.on("noteOn", onNoteOn);
  const offOff = controller.on("noteOff", onNoteOff);
  const offState = controller.on("stateChange", onState);
  return () => {
    offOn();
    offOff();
    offState();
  };
}
