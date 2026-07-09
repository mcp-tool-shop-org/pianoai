// ─── Cockpit Time / Tempo Model ─────────────────────────────────────────────
//
// Single conversion chokepoint between BEATS (how notes are stored — a
// tempo-independent musical position, same convention as SMF/MusicXML/every
// DAW piano roll) and SECONDS (what Web Audio's AudioContext.currentTime
// actually schedules against). Before this module existed, main.ts stored
// notes in absolute seconds and re-derived a bpm-dependent quantize grid
// (`60 / bpm / 4`) inline in half a dozen places — which is *why* changing
// BPM couldn't affect playback tempo (the notes' seconds were already
// baked in) and why the piano-roll grid had to be redrawn on every BPM
// change. Storing beats instead means the grid/note pixel positions never
// move when BPM changes — only this module's conversion functions do,
// which is exactly the seam a scheduler needs to pick up a live BPM change
// (see transport.ts's lookahead scheduler).
//
// Pure, DOM-free — safe to import from state.ts, persistence.ts,
// transport.ts, and any test file directly under Node/vitest (no
// window/document/AudioContext access anywhere in this file).
//
// Today there is exactly one global bpm (a plain number). Every caller goes
// through beatsToSeconds/secondsToBeats rather than inlining `60 / bpm`
// arithmetic, so a future tempo MAP (an array of {beat, bpm} breakpoints,
// replacing the scalar `bpm` parameter with a lookup) is a change to just
// these two functions' bodies, not a hunt through every file that does
// beat/second math.
// ─────────────────────────────────────────────────────────────────────────────

/** Clamp bounds for the bpm control (shared by the UI input, importScore,
 *  and the persisted-state sanitizer) — mirrors the pre-existing
 *  BPM_MIN/BPM_MAX constants that used to live in main.ts. */
export const BPM_MIN = 20;
export const BPM_MAX = 400;
export const DEFAULT_BPM = 120;

/** Piano-roll horizontal scale: pixels per BEAT (was PX_PER_SEC = 120
 *  pixels-per-second). Notes/grid lines are positioned as `beat *
 *  PX_PER_BEAT` — this never changes with bpm, which is the whole point of
 *  storing beats instead of seconds. */
export const PX_PER_BEAT = 60;

/** Fixed-width piano-roll canvas, in beats (was SCORE_SECS = 32 seconds).
 *  Chosen so the rendered canvas width matches the old default exactly:
 *  64 beats × 60px/beat = 3840px = 32s × 120px/s (the old default at
 *  120bpm, 4/4 — i.e. 2 beats/sec × 32s = 64 beats). Purely a canvas-size
 *  constant; has no effect on playback (score end is derived from the
 *  notes themselves, not this bound — see transport.ts's
 *  computeScoreEndBeat). */
export const SCORE_BEATS = 64;

/** Piano-roll quantize grid, in beats. Fixed at a quarter-beat (a
 *  sixteenth note in 4/4) regardless of bpm — this replaces the old
 *  `60 / bpm / 4` grid-in-seconds that had to be recomputed (and every
 *  consumer had to re-derive) on every bpm change. */
export const QUANTIZE_GRID_BEATS = 0.25;

/** Default duration for a newly-created note (click-to-add, keyboard
 *  insert-at-playhead), in beats. Was `60 / bpm` seconds (i.e. always
 *  "one beat" in seconds terms) — expressed directly in beats now, which
 *  is the same musical duration at every bpm instead of a seconds value
 *  that happened to equal one beat only at the bpm active when the note
 *  was created. */
export const DEFAULT_NOTE_DURATION_BEATS = 1;

/** A non-finite or non-positive bpm would turn `60 / bpm` into
 *  NaN/Infinity and corrupt every downstream beat<->second conversion
 *  (same failure class as the pre-existing F-A1-002 guards in main.ts's
 *  old quantize()/drawBeatLines()). Falls back to DEFAULT_BPM rather than
 *  propagating — callers that need a *stored/displayed* bpm value should
 *  use clampBpm() instead, which preserves the caller's last-known-good
 *  value rather than silently substituting the default. */
function safeBpm(bpm: number): number {
  return Number.isFinite(bpm) && bpm > 0 ? bpm : DEFAULT_BPM;
}

/** Clamp a candidate bpm into [BPM_MIN, BPM_MAX], falling back to
 *  `prev` (not DEFAULT_BPM) when the candidate is non-finite — mirrors
 *  main.ts's old safeNumber()-guarded bpm handler so an emptied/garbage
 *  bpm input never corrupts the stored value. */
export function clampBpm(bpm: number, prev: number = DEFAULT_BPM): number {
  if (!Number.isFinite(bpm)) return prev;
  return Math.max(BPM_MIN, Math.min(BPM_MAX, bpm));
}

/** Convert a beat position/duration to seconds at the given bpm. */
export function beatsToSeconds(beats: number, bpm: number): number {
  return (beats * 60) / safeBpm(bpm);
}

/** Convert a seconds position/duration to beats at the given bpm. Inverse
 *  of beatsToSeconds. */
export function secondsToBeats(seconds: number, bpm: number): number {
  return (seconds * safeBpm(bpm)) / 60;
}

/** Snap a beat position down/up to the nearest grid line. Structural guard
 *  independent of whatever validated `grid` should be: a non-positive/
 *  non-finite grid would make `Math.round(beats / grid)` NaN or Infinity
 *  and corrupt note placement (same class of bug as F-A1-002). */
export function quantizeBeats(beats: number, grid: number = QUANTIZE_GRID_BEATS): number {
  if (!Number.isFinite(grid) || grid <= 0) return Math.max(0, beats);
  return Math.max(0, Math.round(beats / grid) * grid);
}

// ─── Loop region (Wave C2a) ─────────────────────────────────────────────────

/** A loop region on the transport's timeline — always startBeat < endBeat
 *  (ruler.ts's normalizeRegion is the only place one of these should be
 *  constructed from raw drag input; it enforces that invariant). Defined
 *  here rather than owned by ruler.ts (which computes one) or transport.ts
 *  (which consumes one during loop-wrap) so neither module has to import
 *  the other — both already depend on this file for PX_PER_BEAT/
 *  quantizeBeats and beat<->second conversions respectively. UI-only
 *  state: never persisted (persistence.ts's schema has no field for it)
 *  and never pushed onto the undo stack (undo.ts) — it's transport state,
 *  not score state, same category as the `looping` boolean main.ts already
 *  keeps outside both of those systems. */
export interface LoopRegion {
  startBeat: number;
  endBeat: number;
}
