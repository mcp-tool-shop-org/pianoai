// ─── Cockpit Selection Geometry + Clipboard ─────────────────────────────────
//
// Wave C4 — multi-select + clipboard. Pure, DOM-free math only, same split
// as gesture.ts/ruler.ts/capture.ts (see their file headers): main.ts owns
// all pointer/keyboard wiring and the actual undo.ts command construction;
// this file only computes numbers/decisions, so it's unit-testable directly
// under Node/vitest with no window/document access anywhere.
//
// Three concerns live here:
//   - Marquee rect -> note intersection (findings 79/80): SELECT-mode
//     empty-space drag selects intersecting notes on release, live-
//     highlighted during the drag.
//   - Shift+click / Ctrl+Shift+Arrow range resolution (finding 81): "range =
//     every note whose startBeat lies between the two clicked notes'
//     startBeats" — the exact, deliberately-simple semantics this wave
//     documents rather than inventing a two-hand-span/pitch-aware range.
//   - Internal clipboard (module state, not the system clipboard — finding
//     82/83): copy captures relative offsets from the earliest copied note;
//     paste re-lands those offsets at a target beat; duplicate is
//     copy+paste-immediately-after-the-selection composed from the CURRENT
//     selection directly, without touching (or being affected by) whatever
//     the user last Ctrl+C'd — see duplicateNotes's doc comment.
// ─────────────────────────────────────────────────────────────────────────────

import type { Note, NoteInit } from "./state.js";
import { clampMidi } from "./state.js";
import type { VowelId } from "./vocal-synth.js";
import { SCORE_BEATS } from "./time.js";
import type { NoteHitCandidate } from "./gesture.js";

// ─── Marquee rect -> note intersection (findings 79/80) ─────────────────────

/** A marquee's two drag corners in (beat, midi) space — deliberately NOT
 *  pixel space, so this stays independent of PX_PER_BEAT/ROW_H (main.ts
 *  converts the pointer's pixel positions to beat/midi via the exact same
 *  math buildPianoRoll's click-to-add handler already uses) and matches how
 *  every other pure-geometry helper in this app (gesture.ts's
 *  moveModeTarget, ruler.ts's normalizeRegion) already represents a
 *  position. Unordered/unnormalized — a drag is just as valid
 *  bottom-right-to-top-left as the reverse; notesInMarquee below normalizes
 *  internally. */
export interface MarqueeRect {
  beatA: number;
  midiA: number;
  beatB: number;
  midiB: number;
}

/**
 * Every note (by id) that intersects `rect` — the SELECT-mode empty-space
 * drag's release action [79, 80]. A note intersects when its pitch row
 * falls within the rect's midi span (inclusive both ends — a note's pitch
 * is a single discrete row, not a range, so "inside the rect" just means
 * "this row is between the two dragged rows") AND its [startBeat,
 * startBeat+durationBeats) time span overlaps the rect's beat span (the
 * same half-open interval-overlap test main.ts's removeNotesInSpan and
 * transport.ts's computeScheduleWindow already use elsewhere in this app —
 * a note touching the rect's edge with zero actual overlap doesn't count).
 * Pure geometry — never mutates selection itself; main.ts calls this on
 * every drag tick (live highlight) and once more on release (the actual
 * select), reusing gesture.ts's NoteHitCandidate shape since it's the exact
 * same {id, midi, startBeat, durationBeats} main.ts already has on hand
 * from state.getScore().
 */
export function notesInMarquee(notes: readonly NoteHitCandidate[], rect: MarqueeRect): string[] {
  const beatLo = Math.min(rect.beatA, rect.beatB);
  const beatHi = Math.max(rect.beatA, rect.beatB);
  const midiLo = Math.min(rect.midiA, rect.midiB);
  const midiHi = Math.max(rect.midiA, rect.midiB);
  const out: string[] = [];
  for (const n of notes) {
    if (n.midi < midiLo || n.midi > midiHi) continue;
    if (n.startBeat + n.durationBeats <= beatLo || n.startBeat >= beatHi) continue;
    out.push(n.id);
  }
  return out;
}

// ─── Shift+click / range selection (finding 81) ──────────────────────────────

/** Minimal shape range resolution needs — just startBeat (plus id, to
 *  return which ones matched); a separate, narrower type from
 *  NoteHitCandidate rather than reusing it, since range selection has
 *  nothing to do with pitch or duration. */
export interface RangeCandidate {
  id: string;
  startBeat: number;
}

/**
 * Resolve a Shift+click's actual range: every note whose startBeat falls
 * between the anchor's and the target's startBeats, INCLUSIVE of both ends
 * — this app's documented, deliberately-simple range semantics (finding 81
 * says "Shift+click extends a contiguous range from the anchor" but leaves
 * "range" itself to the app; a hand-span/pitch-aware interpretation was
 * considered and rejected as unnecessary complexity for a v1 piano-roll
 * multi-select — see the Wave C4 spec's own "keep simple: range = all notes
 * whose startBeat lies between the two clicked notes' startBeats"). Works
 * regardless of click direction (target before OR after the anchor in
 * time) — same min/max-then-filter shape as notesInMarquee above. Returns
 * ids so callers pass the resolved set straight to state.ts's addRange()
 * (which takes Note objects — main.ts resolves ids back to notes via
 * getNoteById, same pattern every other id-keyed command factory in this
 * app already uses).
 */
export function notesInTimeRange(notes: readonly RangeCandidate[], anchorStartBeat: number, targetStartBeat: number): string[] {
  const lo = Math.min(anchorStartBeat, targetStartBeat);
  const hi = Math.max(anchorStartBeat, targetStartBeat);
  return notes.filter((n) => n.startBeat >= lo && n.startBeat <= hi).map((n) => n.id);
}

// ─── Clipboard (findings 82/83) ──────────────────────────────────────────────

/** One note's shape inside the clipboard — relative to the copied group's
 *  EARLIEST startBeat (`offsetBeat`, always >= 0; the earliest note itself
 *  has offsetBeat 0), so pasteAtBeat below can re-land the whole group
 *  anywhere by adding a single target beat to every offset. Deliberately
 *  excludes rawStartBeat/rawDurationBeats (Note's live-capture raw-timing
 *  fields, state.ts): a paste is a fresh placement of a NEW note, not a
 *  continuation of a captured performance, same rationale as moveNote's own
 *  raw* clear in state.ts (a manual placement supersedes any prior
 *  performance timing) — pasteAtBeat's output never carries raw* at all,
 *  rather than carrying stale ones forward. */
export interface ClipboardNote {
  midi: number;
  offsetBeat: number;
  durationBeats: number;
  velocity: number;
  vowel?: VowelId;
  breathiness?: number;
  lyric?: string;
}

export interface Clipboard {
  notes: readonly ClipboardNote[];
  /** Total time span of the copied group — latest note-end minus earliest
   *  note-start. Duplicate (Ctrl+D, finding 82) shifts forward by exactly
   *  this — see duplicateNotes below. */
  spanBeats: number;
}

/** Build a Clipboard snapshot from a set of notes (typically
 *  state.getSelection()'s current result) — the shared body behind both
 *  Ctrl+C (persisted into the module clipboard store, see
 *  createClipboardStore below) and Ctrl+D (used immediately, never
 *  persisted — see duplicateNotes). Returns null for an empty input (Copy/
 *  Duplicate with nothing selected is a no-op main.ts should skip before
 *  ever reaching here — mirrors the rest of this app's "guard the no-op at
 *  the call site" convention, e.g. nudgeSelectedNote's null-target skip in
 *  main.ts). Every field copied defensively (a fresh object per note), so
 *  mutating the SOURCE notes after copying can't retroactively change what
 *  a later paste produces — same defensive-copy contract undo.ts's command
 *  factories already give every snapshot they capture. */
export function snapshotNotes(notes: readonly Note[]): Clipboard | null {
  if (notes.length === 0) return null;
  const earliest = Math.min(...notes.map((n) => n.startBeat));
  const latestEnd = Math.max(...notes.map((n) => n.startBeat + n.durationBeats));
  const clipNotes: ClipboardNote[] = notes.map((n) => ({
    midi: n.midi,
    offsetBeat: n.startBeat - earliest,
    durationBeats: n.durationBeats,
    velocity: n.velocity,
    ...(n.vowel !== undefined ? { vowel: n.vowel } : {}),
    ...(n.breathiness !== undefined ? { breathiness: n.breathiness } : {}),
    ...(n.lyric !== undefined ? { lyric: n.lyric } : {}),
  }));
  return { notes: clipNotes, spanBeats: Math.max(0, latestEnd - earliest) };
}

/**
 * Paste-at-beat (Ctrl+V, finding 83: "default paste-at-playhead"): re-land
 * every clipboard note at `targetBeat + offsetBeat`, pitches unchanged.
 * `targetBeat` is floored at 0 (mirrors state.ts's own moveNote floor) and
 * the RESULT is additionally clamped to `maxBeat` (default SCORE_BEATS —
 * the piano roll's fixed canvas width) so an out-of-range paste target
 * clamps instead of placing notes off the visible/scorable canvas ("Out-of-
 * range pastes clamp per existing add rules" — the Wave C4 spec's own
 * phrasing; mirrors validateImportedNote's `Math.min(startBeat,
 * SCORE_BEATS)` import clamp in main.ts). Pitch is defensively re-clamped
 * via state.ts's clampMidi even though a copied note's midi is always
 * already valid (it came from a real score note) — cheap, and keeps this
 * function correct even if a future caller ever hands it a hand-built
 * Clipboard value. Returns plain NoteInit[] — main.ts is responsible for
 * turning that into ONE undo command (a group-add, batching every pasted
 * note into a single execute()/commit() the same way captureCommand batches
 * a whole recorded pass — see undo.ts's pasteCommand).
 */
export function pasteAtBeat(clipboard: Clipboard, targetBeat: number, maxBeat: number = SCORE_BEATS): NoteInit[] {
  const base = Math.max(0, targetBeat);
  return clipboard.notes.map((n) => ({
    midi: clampMidi(n.midi),
    startBeat: Math.min(Math.max(0, base + n.offsetBeat), maxBeat),
    durationBeats: n.durationBeats,
    velocity: n.velocity,
    ...(n.vowel !== undefined ? { vowel: n.vowel } : {}),
    ...(n.breathiness !== undefined ? { breathiness: n.breathiness } : {}),
    ...(n.lyric !== undefined ? { lyric: n.lyric } : {}),
  }));
}

/**
 * Ctrl+D duplicate (finding 82: "Ctrl+D duplicates forward by selection
 * length") — paste a copy of `notes` immediately after the SAME notes' own
 * span, i.e. at `earliestStart + spanBeats`. Deliberately independent of
 * the persisted Ctrl+C clipboard (createClipboardStore below): Duplicate
 * builds its own throwaway Clipboard snapshot from whatever's CURRENTLY
 * selected and pastes it immediately, exactly like Ableton's own Ctrl+D —
 * so duplicating a selection never clobbers (or is affected by) whatever
 * the user separately copied earlier with Ctrl+C. Returns null (nothing to
 * duplicate) for an empty `notes`, same as snapshotNotes.
 */
export function duplicateNotes(notes: readonly Note[], maxBeat: number = SCORE_BEATS): NoteInit[] | null {
  const clip = snapshotNotes(notes);
  if (!clip) return null;
  const earliest = Math.min(...notes.map((n) => n.startBeat));
  return pasteAtBeat(clip, earliest + clip.spanBeats, maxBeat);
}

/** Internal clipboard store (findings 82/83 — "internal clipboard (module
 *  state, not system clipboard)"). Factory-returned, same DI-for-testability
 *  shape as capture.ts's createCaptureEngine: a bare module-level `let`
 *  would leak across tests with no reset hook, exactly the problem
 *  capture.ts's own file header calls out for its engine. main.ts creates
 *  ONE instance at init() time (mirroring captureEngine's construction) and
 *  Ctrl+C/Ctrl+X/Ctrl+V all go through that one instance. */
export interface ClipboardStore {
  copy(notes: readonly Note[]): boolean;
  get(): Clipboard | null;
  hasContent(): boolean;
}

export function createClipboardStore(): ClipboardStore {
  let clipboard: Clipboard | null = null;
  return {
    copy(notes) {
      const snap = snapshotNotes(notes);
      if (!snap) return false;
      clipboard = snap;
      return true;
    },
    get() { return clipboard; },
    hasContent() { return clipboard !== null; },
  };
}
