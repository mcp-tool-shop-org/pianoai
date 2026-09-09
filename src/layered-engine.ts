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
//
// There is no createTapOutput on the layered connector. Tapping the mix
// would collapse N instruments into one signal and throw away the
// isolation this arc is built on. You tap children. The mix is the
// thing we are deliberately not analysing.
// ─────────────────────────────────────────────────────────────────────────────

import type { VmpkConnector, MidiStatus, MidiNote } from "./types.js";

/** Names only — what `options.children` accepts. Never a tap factory. */
export interface LayeredChildName {
  id: string;
  label: string;
}

/**
 * What `children()` returns. The factory is bound from the live child
 * engine, never copied from options, so that child's ensureConnected
 * still runs. Omit createTapOutput when the child has none — a duet
 * where one voice can be heard and the other cannot is a real state.
 */
export interface LayeredChild extends LayeredChildName {
  createTapOutput?: () => unknown;
}

/** Options for the layered engine. */
export interface LayeredEngineOptions {
  /** Optional label shown in status / port listing. Default: "Layered". */
  label?: string;
  /**
   * Names for `children()`. Must match `engines.length` when provided.
   * Omitted: `{ id: "child-N", label: engines[N].listPorts()[0] }`.
   * Factories are not accepted here — they are bound from each engine.
   */
  children?: ReadonlyArray<LayeredChildName>;
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
  if (options?.children && options.children.length !== engines.length) {
    throw new Error(
      `createLayeredEngine children metadata length (${options.children.length}) must match engines (${engines.length})`,
    );
  }

  const label = options?.label ?? "Layered";
  const childMeta = options?.children
    ? options.children.map((c) => ({ id: c.id, label: c.label }))
    : null;

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
      const results = await Promise.allSettled(engines.map((e) => e.playNote(note)));
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === "rejected") {
          const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
          console.error(`Layered engine child ${i} playNote error: ${msg}`);
        }
      }
    },

    children(): ReadonlyArray<LayeredChild> {
      return engines.map((e, i) => {
        const names = childMeta?.[i] ?? {
          id: `child-${i}`,
          label: e.listPorts()[0] ?? `child ${i}`,
        };
        const entry: LayeredChild = { id: names.id, label: names.label };
        if (typeof e.createTapOutput === "function") {
          entry.createTapOutput = () => e.createTapOutput!();
        }
        return entry;
      });
    },
  };

  return connector;
}
