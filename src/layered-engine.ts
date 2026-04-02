// ─── ai-jam-sessions: Layered Engine ─────────────────────────────────────────
//
// A fan-out VmpkConnector that wraps multiple child engines and dispatches
// every MIDI event to all of them simultaneously.  This lets you layer
// piano + vocal-synth, or any combination of engines, through a single
// connector that the session / playback system treats as one voice.
//
// Usage:
//   const piano = createAudioEngine("grand");
//   const synth = createVocalSynthEngine({ preset: "kokoro-af-heart" });
//   const layered = createLayeredEngine([piano, synth]);
//   await layered.connect();       // connects all children
//   layered.noteOn(60, 100);       // both engines fire
//   await layered.disconnect();    // disconnects all children
// ─────────────────────────────────────────────────────────────────────────────

import type { VmpkConnector, MidiStatus, MidiNote } from "./types.js";

/** Options for the layered engine. */
export interface LayeredEngineOptions {
  /** Optional label shown in status / port listing. Default: "Layered". */
  label?: string;
}

/**
 * Create a fan-out VmpkConnector that dispatches every event to all
 * child connectors.  `connect()` and `disconnect()` are run in parallel
 * on all children.  `playNote()` awaits all children concurrently so
 * timing stays in sync.
 */
export function createLayeredEngine(
  engines: VmpkConnector[],
  options?: LayeredEngineOptions,
): VmpkConnector {
  if (engines.length === 0) {
    throw new Error("createLayeredEngine requires at least one engine");
  }

  const label = options?.label ?? "Layered";

  const connector: VmpkConnector = {
    async connect(): Promise<void> {
      const connected: VmpkConnector[] = [];
      for (const e of engines) {
        try {
          await e.connect();
          connected.push(e);
        } catch (err) {
          // Disconnect already-connected engines before re-throwing
          for (const c of connected) {
            try { await c.disconnect(); } catch { /* best-effort cleanup */ }
          }
          throw err;
        }
      }
    },

    async disconnect(): Promise<void> {
      await Promise.all(engines.map((e) => e.disconnect()));
    },

    status(): MidiStatus {
      const statuses = engines.map((e) => e.status());
      // Worst-status wins: error > connecting > disconnected > connected
      if (statuses.includes("error")) return "error";
      if (statuses.includes("connecting")) return "connecting";
      if (statuses.includes("disconnected")) return "disconnected";
      return "connected";
    },

    listPorts(): string[] {
      return engines.flatMap((e) => e.listPorts()).map((p) => `${label}:${p}`);
    },

    noteOn(note: number, velocity: number, channel?: number): void {
      for (const e of engines) {
        try { e.noteOn(note, velocity, channel); } catch (err) { console.error('Layered engine noteOn error:', err); }
      }
    },

    noteOff(note: number, channel?: number): void {
      for (const e of engines) {
        try { e.noteOff(note, channel); } catch (err) { console.error('Layered engine noteOff error:', err); }
      }
    },

    allNotesOff(channel?: number): void {
      for (const e of engines) {
        try { e.allNotesOff(channel); } catch (err) { console.error('Layered engine allNotesOff error:', err); }
      }
    },

    async playNote(note: MidiNote): Promise<void> {
      await Promise.all(engines.map((e) => e.playNote(note)));
    },
  };

  return connector;
}
