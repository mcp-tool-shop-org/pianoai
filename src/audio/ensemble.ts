// ─── ai-jam-sessions: The Live Ensemble ──────────────────────────────────────
//
// What every instrument is doing RIGHT NOW, while it is being played.
//
// TWO CHANNELS, AND THE CHEAP ONE IS THE ACCURATE ONE. This is the correction
// that shapes the whole module, so it goes first.
//
//   INTENT — what each engine was TOLD to play. The playback controller already
//   emits noteOn and noteOff live, with pitch, name, velocity and channel. When
//   the model is the one playing, this is not an estimate: it is the ground
//   truth, it is free, and it is exact. A piano chord is not something to
//   transcribe, it is three note-ons we sent.
//
//   ACOUSTIC — what actually came OUT, from an AudioStream tapped off that
//   engine's own gain node. This is verification, not discovery. It is how you
//   learn the vocal drifted off the clock, the take clipped, or an engine failed
//   silently while still being sent notes.
//
// WHY THAT ORDER MATTERS. It would be easy to reach for polyphonic transcription
// to answer "what is the piano playing", and chunk 2's research priced that
// honestly: the published JS runner analyses in 2-second windows, which is not a
// real-time surface at all. But transcription is only needed for audio we did
// NOT generate — a human at an acoustic instrument, into a microphone. For every
// engine this repo drives, the answer is already in the event stream. Reaching
// for the model first would have been slower, less accurate, and 279 MB heavier.
//
// WHAT THIS MODULE IS NOT. It does not touch the audio graph, create a context,
// or know how samples arrive. It takes note events in and, optionally, an
// AudioStream per instrument. Wiring the taps is the layer above.
//
// Usage:
//   const ens = new Ensemble();
//   ens.addInstrument({ id: "piano", label: "Concert Grand" });
//   ens.noteOn("piano", { note: 60, velocity: 100, atSec: 12.5 });
//   ens.view();   // what is sounding, per instrument, right now
// ─────────────────────────────────────────────────────────────────────────────

import type { AudioStream, StreamSnapshot } from "./stream.js";
import { midiToNoteName } from "../note-parser.js";

/** A note currently held down on one instrument. */
export interface SoundingNote {
  note: number;
  /** Scientific pitch notation. Never a raw frequency: models read SPN better. */
  name: string;
  velocity: number;
  channel: number;
  /** Stream time the note-on arrived, seconds. */
  startedSec: number;
  /** How long it has been held at the moment of the view. */
  heldSec: number;
}

/** One instrument's registration. */
export interface InstrumentSpec {
  /** Stable key, e.g. "piano". Used on every call. */
  id: string;
  /** Human label for reports, e.g. "Concert Grand". */
  label?: string;
  /**
   * Optional acoustic tap. When present the view carries what actually came out
   * alongside what was asked for. Omit it and the instrument is intent-only,
   * which is still exact for anything this repo drives.
   */
  stream?: AudioStream;
}

/** A note-on as the ensemble receives it. */
export interface NoteOnInput {
  note: number;
  velocity: number;
  channel?: number;
  /** Stream time in seconds. Caller supplies the clock; this module has none. */
  atSec: number;
}

/** What one instrument is doing. */
export interface InstrumentView {
  id: string;
  label: string;
  /** Notes held right now, lowest first. */
  sounding: SoundingNote[];
  /** Notes released within the view's lookback, most recent first. */
  recentlyReleased: SoundingNote[];
  /** Total note-ons since the last reset. A silent instrument that should not be. */
  noteOnCount: number;
  /**
   * The acoustic channel, when a tap is attached. Null means intent-only, which
   * is NOT the same as silent — do not render it as "no sound".
   */
  acoustic: StreamSnapshot | null;
  /**
   * Set when intent and acoustics disagree in a way worth surfacing: notes are
   * held but the tap reports nothing pitched, or the tap is pitched while
   * nothing is held. Null when they agree or when there is no tap to compare.
   */
  disagreement: string | null;
}

/** The whole ensemble at one instant. */
export interface EnsembleView {
  atSec: number;
  instruments: InstrumentView[];
  /** Every note sounding anywhere, lowest first, deduplicated by pitch. */
  chord: number[];
  /** `chord` as note names, for the model to read back. */
  chordNames: string[];
  /** Present when any instrument has an acoustic tap. */
  caveat: string | null;
}

/** How far back `recentlyReleased` looks, in seconds. */
export const RELEASE_LOOKBACK_SEC = 2;

const ACOUSTIC_CAVEAT =
  "Sounding notes come from the note events sent to each engine, so for anything " +
  "this server plays they are exact rather than estimated. Any acoustic reading " +
  "beside them is a measurement of what came out, and it lags: see each " +
  "instrument's own latency fields. A disagreement is a fact about the render, " +
  "not a correction to the note list.";

export class Ensemble {
  private readonly instruments = new Map<string, InstrumentSpec>();
  private readonly held = new Map<string, Map<number, SoundingNote>>();
  private readonly released = new Map<string, SoundingNote[]>();
  private readonly counts = new Map<string, number>();

  addInstrument(spec: InstrumentSpec): void {
    if (!spec.id) throw new Error("an instrument needs a stable id");
    if (this.instruments.has(spec.id)) {
      throw new Error(
        `instrument "${spec.id}" is already registered. Ids must be unique, ` +
        `because every note is routed by one.`,
      );
    }
    this.instruments.set(spec.id, spec);
    this.held.set(spec.id, new Map());
    this.released.set(spec.id, []);
    this.counts.set(spec.id, 0);
  }

  removeInstrument(id: string): void {
    this.assertKnown(id);
    this.instruments.delete(id);
    this.held.delete(id);
    this.released.delete(id);
    this.counts.delete(id);
  }

  /** Registered instrument ids, in registration order. */
  get instrumentIds(): string[] {
    return [...this.instruments.keys()];
  }

  private assertKnown(id: string): void {
    if (!this.instruments.has(id)) {
      const known = this.instrumentIds.join(", ") || "none registered";
      throw new Error(`unknown instrument "${id}". Registered: ${known}.`);
    }
  }

  noteOn(id: string, input: NoteOnInput): void {
    this.assertKnown(id);
    const { note, velocity, channel = 0, atSec } = input;
    if (!Number.isInteger(note) || note < 0 || note > 127) {
      throw new Error(`note must be an integer 0-127, got ${note}`);
    }
    // A note-on for a pitch already held is a re-articulation, not a second
    // voice: the old one is replaced rather than stacked, which is what a piano
    // actually does and what stops the held map growing without bound.
    this.held.get(id)!.set(note, {
      note,
      name: midiToNoteName(note),
      velocity,
      channel,
      startedSec: atSec,
      heldSec: 0,
    });
    this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
  }

  noteOff(id: string, note: number, atSec: number): void {
    this.assertKnown(id);
    const heldMap = this.held.get(id)!;
    const held = heldMap.get(note);
    // A note-off for something not held is not an error. Engines legitimately
    // send an all-notes-off sweep, and throwing there would turn ordinary
    // cleanup into a crash.
    if (!held) return;
    heldMap.delete(note);
    const rel = this.released.get(id)!;
    rel.unshift({ ...held, heldSec: Math.max(0, atSec - held.startedSec) });
    // Bounded: this list is a lookback, not a history.
    if (rel.length > 64) rel.length = 64;
  }

  /** Release everything on one instrument, e.g. on stop. */
  allNotesOff(id: string, atSec: number): void {
    this.assertKnown(id);
    for (const note of [...this.held.get(id)!.keys()]) this.noteOff(id, note, atSec);
  }

  /** Clear all state on every instrument. Registrations survive. */
  reset(): void {
    for (const id of this.instruments.keys()) {
      this.held.set(id, new Map());
      this.released.set(id, []);
      this.counts.set(id, 0);
    }
  }

  /** What every instrument is doing at `atSec`. */
  view(atSec: number): EnsembleView {
    const instruments: InstrumentView[] = [];
    const chordSet = new Set<number>();
    let anyTap = false;

    for (const [id, spec] of this.instruments) {
      const sounding = [...this.held.get(id)!.values()]
        .map((n) => ({ ...n, heldSec: Math.max(0, atSec - n.startedSec) }))
        .sort((a, b) => a.note - b.note);
      for (const n of sounding) chordSet.add(n.note);

      const recentlyReleased = this.released.get(id)!
        .filter((n) => atSec - (n.startedSec + n.heldSec) <= RELEASE_LOOKBACK_SEC);

      let acoustic: StreamSnapshot | null = null;
      if (spec.stream) {
        anyTap = true;
        acoustic = spec.stream.snapshot();
      }

      instruments.push({
        id,
        label: spec.label ?? id,
        sounding,
        recentlyReleased,
        noteOnCount: this.counts.get(id) ?? 0,
        acoustic,
        disagreement: acoustic ? describeDisagreement(sounding, acoustic) : null,
      });
    }

    const chord = [...chordSet].sort((a, b) => a - b);
    return {
      atSec,
      instruments,
      chord,
      chordNames: chord.map((n) => midiToNoteName(n)),
      caveat: anyTap ? ACOUSTIC_CAVEAT : null,
    };
  }
}

/**
 * Compare intent against the acoustic tap, and say so only when they disagree
 * in a way a reader should act on.
 *
 * This deliberately does NOT try to match pitches note-for-note. The tap is
 * monophonic and the instrument may be playing a chord, so a mismatch there
 * would be the tracker's known limitation rather than a finding. What IS worth
 * surfacing is presence: sound expected and none measured, or sound measured
 * and none expected.
 */
function describeDisagreement(
  sounding: SoundingNote[],
  acoustic: StreamSnapshot,
): string | null {
  const pitched = acoustic.latestPitch?.f0Hz != null;

  if (sounding.length > 0 && !pitched) {
    // Only meaningful once the note has been held longer than the tap's own lag;
    // before that, silence in the measurement is expected rather than wrong.
    const oldest = Math.max(...sounding.map((n) => n.heldSec));
    if (oldest > acoustic.pitchLatencySec * 2) {
      return (
        `${sounding.length} note(s) held for ${oldest.toFixed(2)} s but the tap ` +
        `measures nothing pitched. The engine may be silent, muted, or failing.`
      );
    }
    return null;
  }

  if (sounding.length === 0 && pitched) {
    return (
      `The tap is pitched but no note is held. Expected briefly while a note ` +
      `rings out; sustained, it means something is sounding that was never sent.`
    );
  }

  return null;
}
