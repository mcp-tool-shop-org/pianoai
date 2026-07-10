// ─── Cockpit Live Capture ────────────────────────────────────────────────────
//
// Wave C3 — record-arm capture. Pure timing/quantize math plus a small
// stateful CaptureEngine (noteOn/noteOff bookkeeping across a "pass" — one
// loop cycle, or one linear take), all DOM-free: main.ts owns the record-arm
// UI, the AudioContext-backed count-in click, and wiring this engine's
// noteOn/noteOff to the QWERTY/on-screen-keyboard/Web-MIDI event sources (see
// main.ts's midiKeyDown/midiKeyUp and bindMidi — "tap the midiKeyDown/
// activeNoteOn seam"). Everything here is importable directly under Node/
// vitest, same constraint as gesture.ts/ruler.ts/time.ts/transport.ts.
//
// ── The capture spine (Q3, findings 16–25) ──
//
// A captured note's timing comes from the ORIGINATING DOM event's own
// `timeStamp` (finding 18: normatively the performance.now()-timebase
// system-receipt time, NOT whenever the JS handler happens to run) mapped to
// the AudioContext audio clock via a `ClockOffset` sampled once when
// recording starts (`sampleClockOffset` + `mapTimeStampToAudioTime`), then
// resolved to a BEAT position against the transport's live scheduling anchor
// (transport.ts's `beatAtAudioTime`, a Wave C3 addition — see its own doc
// comment). Per-source calibration constants (`SourceCalibration`, findings
// 20/21: QWERTY keypress→USB latency is the worst of the three sources)
// shift a source's timestamps by a fixed offset before mapping. A rolling
// per-source coarse-timestamp detector (finding 19: Firefox's
// resistFingerprinting coarsens Event.timeStamp to 100ms buckets) flags a
// source DEGRADED once its stream shows the signature — a degraded source's
// notes are still captured (never dropped), but always fully quantized
// (strength forced to 1) rather than trusting jittery bucketed raw timing,
// which is the "degrade instead of writing garbage" finding 19 calls for.
//
// ── Raw + quantize-as-view (findings 22/23) ──
//
// Every captured note keeps its RAW (unquantized) beat position/duration
// forever; the committed note's `startBeat`/`durationBeats` (state.ts's
// fields) are a VIEW derived from that raw data by blending toward the grid
// at a strength 0–1 (`deriveQuantizeView`/`blendTowardGrid` — Logic/Ableton's
// non-destructive quantize convention, default strength 1 = fully snapped).
// Because the raw fields are never overwritten, re-deriving the view at a
// different strength later is a pure function of data already on the note —
// reversible by construction, not by a special "undo quantize" command.
//
// ── One command per pass (Q9, findings 71/72/78; Q3 finding 2's precedent) ──
//
// This module never touches undo.ts or state.ts — it hands main.ts a finished
// pass's captured notes (`CapturedPassResult`) via `endPass()`, and main.ts
// is responsible for turning that into ONE `undo.captureCommand(...)` call.
// That's what makes Ctrl+Z during an active multi-cycle recording peel
// exactly the last COMPLETED pass without stopping the transport (finding
// 78) — undo.ts's linear stack already does that for free once each pass is
// pushed as its own command; this module's only job is grouping the right
// notes into that one unit.
// ─────────────────────────────────────────────────────────────────────────────

import type { NoteInit } from "./state.js";
import { QUANTIZE_GRID_BEATS, quantizeBeats } from "./time.js";

// ─── Sources + calibration ───────────────────────────────────────────────────

export type CaptureSource = "qwerty" | "onscreen" | "midi";

export type RecordMode = "overdub" | "replace";

/** Per-source latency calibration, in milliseconds — SUBTRACTED from a raw
 *  event.timeStamp before it's mapped to the audio clock, i.e. a positive
 *  value means "this source's timestamp reports later than the sound the
 *  player intended; shift the captured onset earlier to compensate."
 *  Defaults to 0 for every source (settable, not auto-measured — finding
 *  20: QWERTY keypress→USB latency, ~15–60ms median ~30ms, is expected to
 *  need the largest correction of the three in practice, but this module
 *  doesn't guess a value; a future calibration-wizard UI would call
 *  setCalibration() with a measured number). */
export interface SourceCalibration {
  qwerty: number;
  onscreen: number;
  midi: number;
}

export const DEFAULT_CALIBRATION: Readonly<SourceCalibration> = { qwerty: 0, onscreen: 0, midi: 0 };

/** Shift `timeStampMs` earlier by `source`'s calibration offset. Pure. */
export function calibrateTimestamp(timeStampMs: number, source: CaptureSource, calibration: SourceCalibration): number {
  return timeStampMs - calibration[source];
}

// ─── performance.now() <-> AudioContext.currentTime mapping (finding 18) ────

/** A sampled correspondence between the two clocks, taken by reading BOTH
 *  back-to-back (negligible skew on a single-threaded JS main thread) when
 *  a recording session starts. Re-sampled at the start of every recording
 *  session (main.ts) rather than once per app lifetime — cheap, and avoids
 *  the two clocks' relative drift accumulating meaningfully across a long
 *  gap between recordings; NOT re-sampled per event (finding 16: a STABLE
 *  timestamp path matters more than shaving mean latency — resampling per
 *  event would reintroduce exactly the jitter this offset exists to
 *  avoid). */
export interface ClockOffset {
  /** performance.now() reading taken at sample time (ms). */
  perfNowMs: number;
  /** ctx.currentTime reading taken at the SAME instant (seconds). */
  audioTimeSec: number;
}

export function sampleClockOffset(perfNowMs: number, audioTimeSec: number): ClockOffset {
  return { perfNowMs, audioTimeSec };
}

/** Map a (calibrated) event.timeStamp (ms, performance.now()-timebase) to
 *  the AudioContext audio clock (seconds), via a sampled offset. */
export function mapTimeStampToAudioTime(timeStampMs: number, offset: ClockOffset): number {
  return offset.audioTimeSec + (timeStampMs - offset.perfNowMs) / 1000;
}

// ─── Key-repeat filter (finding 21) ──────────────────────────────────────────

/** True when a keydown-sourced event should be IGNORED for capture — native
 *  OS/browser key-repeat auto-fires many synthetic keydowns for one
 *  physical press-and-hold. main.ts's QWERTY keydown handler already
 *  de-dupes via its own `heldKeys` Set before a capture call is ever
 *  reachable (so `repeat` will normally already read false at that call
 *  site) — this is a second, independently-testable guard per finding 21,
 *  not a replacement for that one, and it's what protects any OTHER future
 *  caller that forgets the heldKeys pre-check. Pointer-sourced events
 *  (on-screen keyboard) and MIDI have no repeat concept; callers pass
 *  `false` (or omit the argument — see CaptureEngine.noteOn's default) for
 *  those. */
export function shouldIgnoreRepeat(repeat: boolean): boolean {
  return repeat === true;
}

// ─── Coarse-timestamp detection (finding 19) ─────────────────────────────────

/** Firefox's resistFingerprinting mode coarsens EVERY Event.timeStamp to
 *  the nearest 100ms, not just an occasional one. */
export const COARSE_BUCKET_MS = 100;

/** Rolling-window size for the detector — several consecutive exact
 *  multiples of COARSE_BUCKET_MS is the resistFingerprinting signature; one
 *  coincidental multiple from a normal high-resolution clock is
 *  unremarkable. */
export const COARSE_DETECT_WINDOW = 5;

export interface CoarseDetectorState {
  /** Most recent raw (uncalibrated) event.timeStamp values, oldest first,
   *  capped at COARSE_DETECT_WINDOW. */
  samples: readonly number[];
}

export function createCoarseDetector(): CoarseDetectorState {
  return { samples: [] };
}

/** Feed one more raw timeStamp into the rolling window — pure, returns a
 *  NEW state (same immutable-update shape as transport.ts's rebaseAnchor)
 *  rather than mutating `state`. */
export function recordTimestampSample(state: CoarseDetectorState, timeStampMs: number): CoarseDetectorState {
  return { samples: [...state.samples, timeStampMs].slice(-COARSE_DETECT_WINDOW) };
}

/** True once the rolling window is FULL and every sample in it lands
 *  exactly on a COARSE_BUCKET_MS boundary. Requiring the window to be full
 *  (not just "has any samples") is what keeps a source from being flagged
 *  off a single early coincidental multiple. */
export function isCoarseTimestampStream(state: CoarseDetectorState): boolean {
  if (state.samples.length < COARSE_DETECT_WINDOW) return false;
  return state.samples.every((t) => t % COARSE_BUCKET_MS === 0);
}

// ─── Quantize-as-view (findings 22/23) ───────────────────────────────────────

export const DEFAULT_QUANTIZE_STRENGTH = 1;

/** Blend `rawBeats` toward its snapped grid position by `strength` (0 = raw
 *  untouched, 1 = fully snapped). Reversible by construction: the caller's
 *  raw value is never overwritten, only ever re-read — see this file's
 *  header. */
export function blendTowardGrid(rawBeats: number, grid: number, strength: number): number {
  const snapped = quantizeBeats(rawBeats, grid);
  return rawBeats + (snapped - rawBeats) * strength;
}

export interface QuantizeView {
  startBeat: number;
  durationBeats: number;
}

/**
 * Derive the quantized VIEW fields for a captured note from its raw timing.
 * Start and the note's raw END (rawStartBeat + rawDurationBeats) are each
 * blended toward the grid independently, and duration is re-derived from
 * the gap between the two quantized endpoints (floored at one grid step,
 * same floor as state.ts's resizeNote — a zero/negative duration would
 * render an invisible/unplayable note). Quantizing both endpoints
 * independently — rather than quantizing duration as a free-floating
 * quantity — is what keeps a chord's member notes aligned at both edges
 * once strength=1, matching every DAW's onset+release quantize convention.
 */
export function deriveQuantizeView(
  rawStartBeat: number, rawDurationBeats: number, strength: number, grid: number = QUANTIZE_GRID_BEATS,
): QuantizeView {
  const clampedStrength = Math.max(0, Math.min(1, strength));
  const qStart = Math.max(0, blendTowardGrid(rawStartBeat, grid, clampedStrength));
  const qEnd = blendTowardGrid(rawStartBeat + rawDurationBeats, grid, clampedStrength);
  return { startBeat: qStart, durationBeats: Math.max(grid, qEnd - qStart) };
}

// ─── Count-in (findings 24/25) ───────────────────────────────────────────────

export interface CountInClick {
  /** Beat offset from the count-in's own start (0 = the very first click). */
  beat: number;
  /** True on beat 0 of every bar — the downbeat performers synchronize to
   *  (finding 25: "accented beat 1"). */
  accented: boolean;
}

/**
 * Compute the count-in's click schedule — one click per beat, `bars` bars
 * of `beatsPerBar` beats each (default 1 bar of 4/4 — finding 25's DAW
 * convention). Pure: main.ts turns each `{beat, accented}` into a real
 * AudioContext-scheduled click at `countInStartAudioTime +
 * beatsToSeconds(beat, bpm)`, and a note recorded via the SAME cockpit
 * synth engine already used for playback (see this file's header — the
 * click itself is main.ts's job, this is only its timing).
 *
 * Functional, not cosmetic (finding 24 — sensorimotor synchronization
 * needs prior reference intervals before a performer can lock to a tempo):
 * this is why capture is GATED behind the full count-in via canCapture()
 * below rather than starting to listen immediately and just playing clicks
 * on top.
 */
export function computeCountInClicks(bars: number = 1, beatsPerBar: number = 4): CountInClick[] {
  const perBar = Number.isFinite(beatsPerBar) && beatsPerBar > 0 ? Math.floor(beatsPerBar) : 4;
  const totalBars = Number.isFinite(bars) && bars > 0 ? Math.floor(bars) : 0;
  const clicks: CountInClick[] = [];
  for (let b = 0; b < totalBars * perBar; b++) clicks.push({ beat: b, accented: b % perBar === 0 });
  return clicks;
}

// ─── Record-phase gating (findings 24/25) ────────────────────────────────────

export type RecordPhase = "idle" | "counting-in" | "recording";

/** True when a live noteOn/noteOff should reach the capture engine at all.
 *  A note played DURING the count-in must never be captured as part of the
 *  take (findings 24/25: the count-in is a functional reference interval,
 *  not a cosmetic pre-roll) — main.ts is the only caller that tracks the
 *  actual RecordPhase (the count-in's own timing needs setTimeout/
 *  AudioContext scheduling, out of this DOM-free module's reach), but the
 *  GATING DECISION itself lives here so it's independently testable rather
 *  than an inline condition buried in main.ts's event handlers. */
export function canCapture(phase: RecordPhase): boolean {
  return phase === "recording";
}

/** True while a count-in is ticking toward its own beginRecording() call
 *  (Lens-I finding 3) — every main.ts call site that represents a HARD
 *  RESET of playback/score state (Clear, Reset, importScore, window.
 *  __cockpit.stop) must cancel a pending count-in before proceeding, or
 *  the count-in's wall-clock timer survives the reset and fires
 *  beginRecording() seconds later, into whatever fresh/cleared session
 *  followed it. transport.stop() alone can't do this: the transport isn't
 *  "playing" yet during a count-in (main.ts's startCountInThenRecord
 *  schedules the count-in clicks and a setTimeout, but doesn't call
 *  transport.play() until that timer fires), so transport.stop()'s own
 *  onPlayStateChange(false) callback — which DOES already end an ACTIVE
 *  recording — never fires for a pending count-in. The CANCELLATION
 *  itself (clearing the timer, silencing the scheduled clicks) is
 *  necessarily main.ts's job (setTimeout/AudioContext access, out of this
 *  DOM-free module's reach — see cancelCountIn()), but the GATING
 *  DECISION lives here, same rationale as canCapture() above. */
export function hasPendingCountIn(phase: RecordPhase): boolean {
  return phase === "counting-in";
}

/** True when Ctrl+Z (or any other undo trigger) must be REFUSED because a
 *  recording is actively in progress (Lens-I finding 1). REPLACE mode's
 *  live cycle-boundary sweep (main.ts's removeNotesInSpan, called from
 *  beginCapturePass at every new pass's start) deletes notes from the
 *  score DIRECTLY — outside any undo command — ahead of the command that
 *  will eventually own that removal: the pass currently in flight only
 *  commits its captureCommand once IT ends (see undo.ts's captureCommand
 *  doc comment). Undoing an OLDER, already-committed pass while a newer
 *  pass is still open can therefore try to resolve note ids the live
 *  sweep already touched, corrupting later undo/redo interleavings
 *  (orphaned notes no command can remove — see undo.test.ts's "mid-record
 *  undo refusal" suite for the exact reproduction). Ableton's own
 *  loop-record convention is "remove the LAST take" (Ableton Live 12
 *  Manual, "Recording New Clips" — finding 78), which is only a
 *  well-defined operation once a take actually STOPS; while it's still
 *  rolling, this refuses undo outright rather than trying to prove which
 *  particular older command would still be safe to pop — that provability
 *  question is exactly the "transactional complexity" the wave brief
 *  calls out as not worth taking on. Full undo depth returns the instant
 *  recordPhase leaves "recording" — nothing more than the existing linear
 *  stack is needed at that point, since the top of the stack is then
 *  simply whatever pass most recently committed. */
export function shouldRefuseUndoWhileRecording(phase: RecordPhase): boolean {
  return phase === "recording";
}

// ─── Held-pitch source tracking (Lens-I finding 2) ───────────────────────────
//
// main.ts's heldMidi needs to remember not just WHICH pitches are currently
// held, but which SOURCE opened each one: a single pitch can be triggered by
// more than one live input source without an intervening release (e.g. a
// QWERTY key held down while a MIDI controller also sends the same note),
// and the existing press-dedup ("a second source's press for an
// already-held pitch is ignored") must still let the ORIGINAL opener's
// release close it — regardless of which source's release event physically
// arrives first at main.ts's midiKeyUp. capture.ts's own open-note
// bookkeeping (see openKey below) is keyed "source:midi", not just "midi",
// so a noteOff routed under the WRONG source silently no-ops
// (CaptureEngine.noteOff's own contract: "no-op when there was no matching
// open note") and strands the note the actual opener still holds open
// forever — endPass() force-closes it at every pass boundary and reports it
// as `stillHeld`, so startPass()'s carryOver re-opens it EVERY subsequent
// cycle: a phantom full-cycle note that never stops.

/** Per-pitch "who opened this" tracker — the DOM-free replacement for a
 *  plain `Set<number>` main.ts's heldMidi used to be. `source` is optional
 *  on open() purely so a hypothetical future caller with no live event in
 *  hand (none exist today — see LiveEventInfo's doc comment in main.ts)
 *  can still participate in press/release dedup without knowing a
 *  CaptureSource. */
export interface HeldPitchTracker {
  has(midi: number): boolean;
  /** Register `midi` as opened by `source`. No-op if already held (by ANY
   *  source) — first opener wins, matching the existing retrigger dedup
   *  main.ts's midiKeyDown already performs via has() before calling
   *  this. */
  open(midi: number, source?: CaptureSource): void;
  /** Clear `midi` and return whichever source originally opened it (or
   *  undefined if it wasn't held at all). Callers route their noteOff
   *  call through THIS returned source — never the releasing event's own
   *  source — so a cross-source release always closes the note the
   *  ACTUAL opener holds open. */
  close(midi: number): CaptureSource | undefined;
  /** Drop every held pitch at once (main.ts's panic()). */
  clear(): void;
}

export function createHeldPitchTracker(): HeldPitchTracker {
  const openers = new Map<number, CaptureSource | undefined>();
  return {
    has(midi) { return openers.has(midi); },
    open(midi, source) { if (!openers.has(midi)) openers.set(midi, source); },
    close(midi) {
      const source = openers.get(midi);
      openers.delete(midi);
      return source;
    },
    clear() { openers.clear(); },
  };
}

// ─── Captured notes ───────────────────────────────────────────────────────────

export interface CapturedNote {
  midi: number;
  velocity: number;
  source: CaptureSource;
  /** Raw (unquantized) beat position/duration — see this file's header. */
  rawStartBeat: number;
  rawDurationBeats: number;
  /** True when this note's source was flagged coarse-timestamp-degraded at
   *  the moment it was captured (frozen at noteOn — see CaptureEngine.
   *  noteOn's doc comment) — capturedNoteToInit forces quantize strength to
   *  1 for these regardless of the configured strength (finding 19:
   *  "degrade... rather than write garbage"). */
  degraded: boolean;
}

/** Convert one finished CapturedNote into the NoteInit shape state.ts's
 *  mutation API expects — startBeat/durationBeats are the quantized view
 *  (degraded notes always fully snapped, per this file's header); raw*
 *  fields ride along unchanged so the note stays reversible after it's a
 *  real, committed score note (state.ts's Note.rawStartBeat/
 *  rawDurationBeats — Wave C3). */
export function capturedNoteToInit(
  note: CapturedNote, strength: number, grid: number = QUANTIZE_GRID_BEATS,
): NoteInit {
  const view = deriveQuantizeView(note.rawStartBeat, note.rawDurationBeats, note.degraded ? 1 : strength, grid);
  return {
    midi: note.midi,
    velocity: note.velocity,
    startBeat: view.startBeat,
    durationBeats: view.durationBeats,
    rawStartBeat: note.rawStartBeat,
    rawDurationBeats: note.rawDurationBeats,
  };
}

export interface CapturedPassResult {
  /** Every note finished during the pass (closed by a matching noteOff, or
   *  force-closed by endPass() at the pass boundary). */
  notes: CapturedNote[];
  /** Notes still physically held (no matching noteOff yet) at the moment
   *  the pass ended — see CaptureEngine.endPass's doc comment for why
   *  these are reported separately rather than silently dropped. */
  stillHeld: CarryOverNote[];
}

export interface CarryOverNote {
  source: CaptureSource;
  midi: number;
  velocity: number;
}

// ─── Ghost notes (live preview while capturing) ──────────────────────────────

export interface GhostNote {
  /** Stable across repeated getGhostNotes() calls for the SAME logical
   *  note (a sequence number frozen at close-time for finished notes;
   *  "source:midi" for a still-open one) — main.ts's renderGhostNotes
   *  diffs the DOM by this id rather than tearing down/rebuilding every
   *  tick. */
  ghostId: string;
  midi: number;
  velocity: number;
  startBeat: number;
  durationBeats: number;
  rawStartBeat: number;
  rawDurationBeats: number;
  /** True while still physically held (no matching noteOff yet). */
  open: boolean;
}

// ─── Capture engine ───────────────────────────────────────────────────────────

export interface CaptureNoteOnResult {
  /** False when the event was ignored entirely (key-repeat) — no note was
   *  opened. */
  captured: boolean;
  /** True exactly on the event that flips THIS source from clean to
   *  coarse-timestamp-degraded — callers use this to fire a one-time
   *  warning instead of one per subsequent event. */
  newlyDegraded: boolean;
}

export interface CaptureEngine {
  /** (Re)sample the performance.now()<->AudioContext.currentTime
   *  correspondence — call whenever a recording session (re)starts. */
  setClockOffset(offset: ClockOffset): void;
  setCalibration(calibration: Partial<SourceCalibration>): void;
  getCalibration(): SourceCalibration;
  setQuantizeStrength(strength: number): void;
  getQuantizeStrength(): number;
  /** True once `source`'s coarse-timestamp detector has tripped (finding
   *  19) — sticky for the lifetime of the engine (a source that degrades
   *  once is treated as degraded for the rest of the session; browser
   *  fingerprint-resistance settings don't flip back mid-session). */
  isDegraded(source: CaptureSource): boolean;

  /** Begin a new pass at `startBeat` (a loop region's start, or the
   *  playhead position for a linear take). `carryOver` (Wave C3 — a note
   *  still physically held when the PREVIOUS pass's endPass() force-closed
   *  it at the loop boundary) re-opens those as fresh open notes AT this
   *  pass's start, so sustaining a note across a loop point captures as
   *  one whole-cycle-length note per cycle instead of requiring an
   *  impossible release-and-repress exactly on the beat. */
  startPass(startBeat: number, carryOver?: readonly CarryOverNote[]): void;

  /** Record a noteOn from a live source. `repeat` (finding 21) — pass
   *  `event.repeat` for a QWERTY keydown; omit/false for on-screen
   *  (pointer) and MIDI, which have no repeat concept. A second noteOn for
   *  a (source, midi) pair still open (no matching noteOff yet — e.g. a
   *  hardware retrigger some MIDI controllers emit without an intervening
   *  note-off) closes the stale open note at the NEW event's time before
   *  opening the new one, rather than leaking a stuck note. */
  noteOn(source: CaptureSource, midi: number, velocity: number, timeStampMs: number, repeat?: boolean): CaptureNoteOnResult;

  /** Record a noteOff, closing the matching open note (if any) into a
   *  finished CapturedNote. Returns false (no-op) when there was no
   *  matching open note — e.g. a key that was already physically held
   *  before recording armed. */
  noteOff(source: CaptureSource, midi: number, timeStampMs: number): boolean;

  /** Live-preview notes for the CURRENT pass — every finished note plus
   *  every still-open one (rendered with a live-growing raw duration up to
   *  `nowBeat`), quantize view applied exactly as it will look once the
   *  pass commits. Pure read — does not mutate engine state. */
  getGhostNotes(nowBeat: number): GhostNote[];

  /** Finish the current pass: any still-open note is force-closed AT
   *  `endBeat` (mirrors transport.ts's own scheduling boundary clamp for
   *  playback — a note straddling a loop/score boundary has always had its
   *  audible extent clamped there; capture applies the identical policy).
   *  Returns every note finished during the pass (already-closed ones plus
   *  the just-force-closed ones) and which (source, midi) pairs were still
   *  held at the cutoff, for startPass()'s carryOver. Resets the pass —
   *  safe to call startPass() again immediately after. */
  endPass(endBeat: number): CapturedPassResult;

  /** True when the current pass has captured nothing at all (no finished
   *  notes, nothing still open). NOT actually called by main.ts today
   *  (Lens-I finding 6 — this doc comment used to claim otherwise): main.ts
   *  gets the same "skip pushing an empty undo command" effect for free by
   *  checking `added.length > 0 || removed.length > 0` on endPass()'s own
   *  return value instead, since `added.length === 0` is exactly this
   *  predicate's answer AFTER endPass() has already run (open notes get
   *  force-closed into `notes` by then, so isPassEmpty() itself can't be
   *  called post-endPass — it would always read true). That check also has
   *  to fold in `removed` — a REPLACE pass that captured nothing but DID
   *  clear the region at cycle start still needs its own command (see
   *  undo.ts's captureCommand doc comment) — which this predicate alone
   *  doesn't know about. Kept as a public, independently-testable method
   *  for any future caller that needs the answer BEFORE endPass() runs
   *  (e.g. to skip other cycle-boundary work) without reimplementing the
   *  finished/open check inline. */
  isPassEmpty(): boolean;
}

interface OpenNote {
  midi: number;
  velocity: number;
  source: CaptureSource;
  rawStartBeat: number;
  degraded: boolean;
}

interface FinishedNote extends CapturedNote {
  /** Frozen at close-time — see GhostNote.ghostId's doc comment. */
  seq: number;
}

function openKey(source: CaptureSource, midi: number): string {
  return source + ":" + midi;
}

/**
 * Create a capture engine. `beatAtAudioTime` is injected (matching this
 * app's established DI-for-testability shape — see transport.ts's
 * TransportCallbacks / synth.ts's Synth) rather than this module importing
 * a live Transport itself, which would drag an AudioContext dependency into
 * an otherwise DOM-free file; tests inject a plain function, main.ts injects
 * `transport.beatAtAudioTime`.
 */
export function createCaptureEngine(beatAtAudioTime: (audioTime: number) => number): CaptureEngine {
  let clockOffset: ClockOffset | null = null;
  let calibration: SourceCalibration = { ...DEFAULT_CALIBRATION };
  let strength = DEFAULT_QUANTIZE_STRENGTH;
  const coarseDetectors = new Map<CaptureSource, CoarseDetectorState>();
  const degradedSources = new Set<CaptureSource>();

  let passStartBeat = 0;
  let nextSeq = 0;
  let finished: FinishedNote[] = [];
  const open = new Map<string, OpenNote>();

  /** Map a raw event.timeStamp to a beat position, floored at the pass's
   *  own start (a stray/late event resolving to slightly before the pass
   *  began, from input lag, must never produce an out-of-range or
   *  negative-relative position — same defensive-floor philosophy as
   *  state.ts's own `Math.max(0, startBeat)`). Falls back to passStartBeat
   *  outright when no ClockOffset has been sampled yet — a missing offset
   *  is a wiring bug, not a real user-facing scenario, but silently
   *  producing NaN/garbage here is exactly what finding 19 warns against. */
  function mapToBeat(timeStampMs: number, source: CaptureSource): number {
    if (!clockOffset) return passStartBeat;
    const calibrated = calibrateTimestamp(timeStampMs, source, calibration);
    const audioTime = mapTimeStampToAudioTime(calibrated, clockOffset);
    return Math.max(passStartBeat, beatAtAudioTime(audioTime));
  }

  function finishOpenNote(note: OpenNote, rawDurationBeats: number): void {
    finished.push({
      seq: nextSeq++,
      midi: note.midi, velocity: note.velocity, source: note.source,
      rawStartBeat: note.rawStartBeat,
      rawDurationBeats: Math.max(0, rawDurationBeats),
      degraded: note.degraded,
    });
  }

  return {
    setClockOffset(offset) { clockOffset = offset; },
    setCalibration(partial) { calibration = { ...calibration, ...partial }; },
    getCalibration() { return { ...calibration }; },
    setQuantizeStrength(s) { strength = Math.max(0, Math.min(1, s)); },
    getQuantizeStrength() { return strength; },
    isDegraded(source) { return degradedSources.has(source); },

    startPass(startBeat, carryOver = []) {
      passStartBeat = startBeat;
      finished = [];
      nextSeq = 0;
      open.clear();
      for (const c of carryOver) {
        open.set(openKey(c.source, c.midi), {
          midi: c.midi, velocity: c.velocity, source: c.source,
          rawStartBeat: startBeat, degraded: degradedSources.has(c.source),
        });
      }
    },

    noteOn(source, midi, velocity, timeStampMs, repeat = false) {
      if (shouldIgnoreRepeat(repeat)) return { captured: false, newlyDegraded: false };

      const wasDegraded = degradedSources.has(source);
      const detector = recordTimestampSample(coarseDetectors.get(source) ?? createCoarseDetector(), timeStampMs);
      coarseDetectors.set(source, detector);
      if (isCoarseTimestampStream(detector)) degradedSources.add(source);
      const newlyDegraded = !wasDegraded && degradedSources.has(source);

      const rawStartBeat = mapToBeat(timeStampMs, source);
      const key = openKey(source, midi);
      const existing = open.get(key);
      if (existing) finishOpenNote(existing, Math.max(0, rawStartBeat - existing.rawStartBeat));
      open.set(key, { midi, velocity, source, rawStartBeat, degraded: degradedSources.has(source) });
      return { captured: true, newlyDegraded };
    },

    noteOff(source, midi, timeStampMs) {
      const key = openKey(source, midi);
      const note = open.get(key);
      if (!note) return false;
      open.delete(key);
      const rawEndBeat = Math.max(note.rawStartBeat, mapToBeat(timeStampMs, source));
      finishOpenNote(note, rawEndBeat - note.rawStartBeat);
      return true;
    },

    getGhostNotes(nowBeat) {
      const out: GhostNote[] = [];
      for (const n of finished) {
        const view = deriveQuantizeView(n.rawStartBeat, n.rawDurationBeats, n.degraded ? 1 : strength);
        out.push({
          ghostId: "gp:" + n.seq, midi: n.midi, velocity: n.velocity,
          startBeat: view.startBeat, durationBeats: view.durationBeats,
          rawStartBeat: n.rawStartBeat, rawDurationBeats: n.rawDurationBeats, open: false,
        });
      }
      for (const n of open.values()) {
        const rawDurationBeats = Math.max(0, nowBeat - n.rawStartBeat);
        const view = deriveQuantizeView(n.rawStartBeat, rawDurationBeats, n.degraded ? 1 : strength);
        out.push({
          ghostId: "go:" + n.source + ":" + n.midi, midi: n.midi, velocity: n.velocity,
          startBeat: view.startBeat, durationBeats: Math.max(view.durationBeats, QUANTIZE_GRID_BEATS / 4),
          rawStartBeat: n.rawStartBeat, rawDurationBeats, open: true,
        });
      }
      return out;
    },

    endPass(endBeat) {
      const stillHeld: CarryOverNote[] = [];
      for (const n of open.values()) {
        stillHeld.push({ source: n.source, midi: n.midi, velocity: n.velocity });
        finishOpenNote(n, endBeat - n.rawStartBeat);
      }
      open.clear();
      const notes: CapturedNote[] = finished.map(({ seq: _seq, ...rest }) => rest);
      finished = [];
      return { notes, stillHeld };
    },

    isPassEmpty() { return finished.length === 0 && open.size === 0; },
  };
}
