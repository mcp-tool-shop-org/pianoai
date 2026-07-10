// ─── Cockpit Transport ───────────────────────────────────────────────────────
//
// Playback scheduling — a lookahead scheduler in the classic "A Tale of Two
// Clocks" shape (Wilson, 2013: https://web.dev/articles/audio-scheduling):
// a ~25ms setInterval "JS clock" wakes up regularly and schedules any note
// whose start falls within the next ~100ms onto the sample-accurate
// AudioContext "audio clock", rather than the old design's one-shot
// schedule-the-whole-score-immediately approach.
//
// This is what makes a *live* bpm change actually change tempo: only notes
// that haven't been scheduled onto the audio clock yet are affected by a
// bpm change (already-scheduled notes keep whatever timing they were given
// — Web Audio has no way to rewrite AudioParam automation that's already
// been committed). Because this scheduler only commits ~100ms at a time,
// "not yet scheduled" covers almost the whole score almost all the time, so
// a bpm change takes effect within one lookahead window (≤~125ms) instead
// of never.
//
// It also replaces the old per-note wall-clock `setTimeout` used to switch
// the vocal engine's vowel/breathiness just before each note — that timer
// was scheduled once, up front, for the *whole score*, at play()-call time,
// which doesn't actually work: vowel/breathiness are plain JS closure state
// baked into the formant filter bank at the moment `noteOn()` is called
// (not an AudioParam automation), and the old play() called every note's
// `noteOn()` synchronously in the same loop, so by the time any of those
// setTimeout callbacks fired, every note in that play() call had already
// captured whatever vowel was active *before* any of them ran. Here, each
// note's vowel/breathiness is set synchronously immediately before that
// SAME note's own noteOn() call, inside the scheduler tick that decides
// it's time to schedule that note — no setTimeout involved, and it can
// never end up stale relative to the note it's meant for.
// ─────────────────────────────────────────────────────────────────────────────

import type { Note } from "./state.js";
import type { VowelId } from "./vocal-synth.js";
import { beatsToSeconds, secondsToBeats, clampBpm, SCORE_BEATS, type LoopRegion } from "./time.js";

// ─── Scheduler tuning ────────────────────────────────────────────────────────

/** JS-clock tick interval (ms). */
export const LOOKAHEAD_MS = 25;
/** How far ahead of `ctx.currentTime` to commit notes onto the audio clock
 *  (seconds). */
export const SCHEDULE_AHEAD_SEC = 0.1;

// ─── Pure scheduling math (unit-testable without a real AudioContext) ───────

/** A tempo anchor: "at `audioTime` (AudioContext.currentTime), playback
 *  position was `beat` beats, and `bpm` was in effect." Everything about
 *  where playback is *right now*, and where any future beat lands on the
 *  audio clock, is derived from this one triple — recomputing it (rebasing)
 *  is the entire mechanism for handling a live bpm change or a loop restart
 *  without needing to touch anything already scheduled. */
export interface TransportAnchor {
  audioTime: number;
  beat: number;
  bpm: number;
}

/** Current playback position (in beats) at audio time `audioNow`, given an
 *  anchor established at some point at-or-before `audioNow` and unchanged
 *  bpm since. */
export function currentBeat(anchor: TransportAnchor, audioNow: number): number {
  return anchor.beat + secondsToBeats(audioNow - anchor.audioTime, anchor.bpm);
}

/** Re-anchor playback at `audioNow` with a new bpm, preserving the current
 *  beat position computed from the OLD anchor/bpm. Called whenever the
 *  live bpm differs from `anchor.bpm` at the top of a scheduler tick, and
 *  on loop restart (rebasing to beat 0). Every future currentBeat()/
 *  beatToAudioTime() call uses the new anchor, so a bpm change is "seen" by
 *  the very next tick's scheduling decisions with no separate propagation
 *  step. */
export function rebaseAnchor(anchor: TransportAnchor, audioNow: number, newBpm: number): TransportAnchor {
  return { audioTime: audioNow, beat: currentBeat(anchor, audioNow), bpm: newBpm };
}

/** Where a given beat position lands on the audio clock, under the given
 *  anchor. Exported (Wave C0 fix) so tick()'s loop-wrap rebase can use the
 *  exact musical wrap instant (`beatToAudioTime(anchor, endBeat)`) rather
 *  than whatever `now` a late JS-clock tick happened to observe — see the
 *  loop-wrap comment inside tick() below — and so that exact-instant
 *  property has a direct pure-math test (transport.test.ts) independent of
 *  the stateful scheduler. */
export function beatToAudioTime(anchor: TransportAnchor, beat: number): number {
  return anchor.audioTime + beatsToSeconds(beat - anchor.beat, anchor.bpm);
}

/** One scheduled event: a note plus the two audio-clock instants
 *  (`onAudioTime`/`offAudioTime`) its noteOn/noteOff should be scheduled
 *  at. */
export interface ScheduleItem {
  note: Note;
  onAudioTime: number;
  offAudioTime: number;
}

/**
 * Decide which not-yet-scheduled notes should be committed to the audio
 * clock this tick, and at what times.
 *
 * A note is scheduled when it has any audible portion left at-or-after
 * `windowStart` (`offAudioTime > windowStart` — already-finished notes are
 * dropped) AND its start falls before the lookahead horizon
 * (`onAudioTime < windowEnd`). The scheduled on-time is clamped up to
 * `windowStart` (`Math.max(onAudioTime, windowStart)`) — this is what makes
 * resuming mid-score (playPosition/anchor.beat > a note's startBeat, but
 * before it ends) replay that note immediately from its start rather than
 * skipping it or waiting for a start time that's already in the past. Both
 * behaviors match the pre-lookahead play()'s
 * `Math.max(0, note.startSec - offset)` clamp and
 * `note.startSec + note.durationSec <= offset` skip, just generalized to a
 * rolling window instead of a single whole-score pass.
 *
 * `boundaryBeat` (Wave C2b findings 1/2), when given, is a loop-region or
 * score-end boundary that this window must never schedule sound past:
 *   - A note that doesn't START until at-or-past the boundary is skipped
 *     entirely — it belongs to the NEXT lap under a rebased anchor, and
 *     scheduling it now (against the OLD anchor, just because it happened
 *     to fall inside this tick's lookahead) would sound it at the wrong
 *     audio time (finding 2).
 *   - A note that starts before the boundary but naturally ends after it
 *     has its `offAudioTime` clamped to the boundary's own audio-time
 *     instant (`Math.min(naturalOff, boundaryAudioTime)`) — done HERE, at
 *     schedule time, because both synth engines drop a voice from their
 *     active-voice map the instant `noteOff()` is CALLED, not when its
 *     scheduled audio time is reached; a separate "force it off now" call
 *     made later (at the wrap instant) finds nothing left to silence once
 *     this note's own noteOff has already been called with the unclamped
 *     time. Clamping the time passed to that one call is what actually
 *     works (finding 1). Omitted (`undefined`), a note schedules with its
 *     full natural extent — the pre-Wave-C2b behavior.
 *
 * `alreadyScheduled` must be updated by the caller (add each returned
 * item's `note.id`) — this function is pure and doesn't mutate it, so it
 * can be called speculatively/repeatedly in tests without side effects.
 */
export function computeScheduleWindow(
  notes: readonly Note[],
  alreadyScheduled: ReadonlySet<string>,
  anchor: TransportAnchor,
  windowStart: number,
  windowEnd: number,
  boundaryBeat?: number,
): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  for (const note of notes) {
    if (alreadyScheduled.has(note.id)) continue;
    if (boundaryBeat !== undefined && note.startBeat >= boundaryBeat) continue;
    const onAudioTime = beatToAudioTime(anchor, note.startBeat);
    const naturalOffAudioTime = beatToAudioTime(anchor, note.startBeat + note.durationBeats);
    const offAudioTime = boundaryBeat !== undefined
      ? Math.min(naturalOffAudioTime, beatToAudioTime(anchor, boundaryBeat))
      : naturalOffAudioTime;
    if (offAudioTime <= windowStart) continue; // fully in the past — skip
    if (onAudioTime >= windowEnd) continue;    // not yet within the lookahead horizon
    items.push({ note, onAudioTime: Math.max(onAudioTime, windowStart), offAudioTime });
  }
  items.sort((a, b) => a.onAudioTime - b.onAudioTime);
  return items;
}

/** The beat position where the score "ends" — the EXACT beat at which the
 *  last note to finish ends (`max(startBeat + durationBeats)` across all
 *  notes), not one beat past it: no padding is added. (This doc previously
 *  claimed "one beat past the last note to finish," which never matched
 *  the implementation below — e.g. a single note at startBeat=5,
 *  durationBeats=1 has always made this return 6, not 7; see
 *  transport.test.ts's "returns the beat where the LAST note to finish
 *  ends" case.) 0 for an empty score. Used to detect end-of-playback
 *  (advance to loop-restart or stop). */
export function computeScoreEndBeat(notes: readonly Note[]): number {
  let end = 0;
  for (const n of notes) end = Math.max(end, n.startBeat + n.durationBeats);
  return end;
}

// ─── Stateful transport ──────────────────────────────────────────────────────

export interface TransportCallbacks {
  /** AudioContext of the currently-active engine (instrument or vocal,
   *  whichever `isVocalMode()` selects) — used for `ctx.currentTime` and
   *  as the scheduler's "is audio even available" gate. */
  getContext(): AudioContext | null;
  /** Resume both engines' AudioContexts if suspended — called once at the
   *  top of play(), mirroring the old play()'s belt-and-suspenders resume
   *  (the global first-gesture unlock should already have done this; this
   *  is a second chance in case that hasn't fired yet). */
  resumeContexts(): void;
  /** Routed noteOn/noteOff — the caller (main.ts) already knows how to
   *  dispatch to the instrument vs. vocal engine based on mode, same as
   *  the old activeNoteOn/activeNoteOff helpers; the transport doesn't
   *  need to know there are two engines. */
  noteOn(midi: number, velocity: number, time: number): void;
  noteOff(midi: number, time: number): void;
  /** Silence both engines immediately — used by pause()/stop(). */
  allNotesOff(): void;
  isVocalMode(): boolean;
  setVowel(vowel: VowelId): void;
  setBreathiness(value: number): void;
  getScore(): readonly Note[];
  getBpm(): number;
  isLooping(): boolean;
  /** Current loop region (Wave C2a), or null when none is set — ruler
   *  drag-to-define UI state (see ruler.ts/main.ts), never persisted or
   *  undoable. Only consulted while isLooping() is true AND a region
   *  exists; any other combination (not looping, or looping with no
   *  region) plays exactly as before this wave — whole-score end/wrap via
   *  computeScoreEndBeat, wrapping to beat 0 ("Loop toggle now uses the
   *  region when one exists, else whole score"). Optional so a caller
   *  that doesn't support regions (e.g. this file's own pre-C2a test
   *  fakes) needs no stub. */
  getLoopRegion?(): LoopRegion | null;
  /** Fired on every tick while playing, and once more from pause()/stop()
   *  with the final position — main.ts uses this to move the playhead and
   *  update the mm:ss.s readout. */
  onTick?(positionBeats: number): void;
  /** Fired whenever play/pause/stop changes the playing flag — main.ts
   *  uses this to swap the play/pause button icon. */
  onPlayStateChange?(isPlaying: boolean): void;
  /** Fired exactly once per loop wrap (region OR whole-score), AFTER
   *  onTick has already reported the new lap's start position — Wave C3
   *  (record-arm capture): a cycle boundary is a distinct EVENT a capture
   *  engine needs to react to (finalize the pass that just ended, start
   *  the next one), which onTick's plain position stream can't
   *  distinguish from an ordinary seek landing on the same beat. Passes
   *  the just-STARTED lap's own `[cycleStartBeat, cycleEndBeat)` bounds
   *  (== the just-ENDED lap's bounds too, for a steady loop region) so a
   *  listener never has to re-derive them from `getLoopRegion()` at a
   *  slightly different instant. Never fired for a plain (non-looping)
   *  playthrough or a seek. */
  onLoopWrap?(cycleStartBeat: number, cycleEndBeat: number): void;
  /** True while record-capture is actively running (Wave C3) — changes two
   *  things, both in service of "the transport must keep rolling while the
   *  performer records":
   *    - play() no longer refuses an EMPTY score (recording INTO an empty
   *      score is the primary capture use case; the empty-score bail
   *      remains for ordinary playback, where playing nothing is
   *      meaningless).
   *    - Without a loop region, the end-of-playback boundary extends from
   *      the last note's end to the full canvas (SCORE_BEATS) — otherwise
   *      a linear take would auto-stop the instant the playhead passed the
   *      existing material (or instantly, on an empty score) instead of
   *      letting the performer keep playing. A loop REGION is unaffected:
   *      its cycle length must stay stable for pass-per-cycle capture, and
   *      the region already defines exactly where the cycle wraps
   *      (finding 77 — the loop region IS the punch region).
   *  Optional so existing callers/test fakes need no stub. */
  isCapturing?(): boolean;
}

export interface Transport {
  play(): void;
  pause(): void;
  stop(): void;
  /** Space / play-button handler: pause() if currently playing, else
   *  play() (resumes from the current position — 0 after stop(), wherever
   *  it was after pause()). */
  togglePlayPause(): void;
  /** Jump playback to `beat` (Wave C2a — ruler click-to-seek), without
   *  stopping the transport. See createTransport()'s seekTo for the full
   *  playing-vs-paused behavior. */
  seekTo(beat: number): void;
  isPlaying(): boolean;
  getPositionBeats(): number;
  /** Resolve the beat position that corresponds to a given (past-or-
   *  present) AudioContext `audioTime`, under whatever anchor is
   *  CURRENTLY live (Wave C3 — the record-capture seam). A captured
   *  note's `event.timeStamp` maps to an audio-clock instant that's
   *  typically a few ms older than "now" by the time its handler runs;
   *  resolving it against the live anchor — rather than
   *  getPositionBeats()'s last-tick-cached value — is what keeps a
   *  captured note's beat position accurate to the ORIGINAL event
   *  instant instead of rounding down to the last ~25ms scheduler tick.
   *  Falls back to getPositionBeats() when nothing is currently playing
   *  (no live anchor) — capture only ever runs while playing, so this is
   *  a defensive default, not a real code path. */
  beatAtAudioTime(audioTime: number): number;
}

export function createTransport(cb: TransportCallbacks): Transport {
  let playing = false;
  let positionBeats = 0;
  let anchor: TransportAnchor | null = null;
  let scheduledIds = new Set<string>();
  let timer: ReturnType<typeof setInterval> | undefined;

  function stopClockAndSound(): void {
    if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
    cb.allNotesOff();
    anchor = null;
    scheduledIds = new Set();
  }

  /** Commit any not-yet-scheduled note in `notes` whose event window
   *  intersects [windowStart, windowEnd) under `anchorNow` onto the audio
   *  clock — the shared body behind tick()'s normal per-tick scheduling
   *  pass AND its loop-wrap rebase pass (Wave C0 fix: previously only the
   *  former existed, so a wrap had to `return` and wait for the NEXT tick
   *  to schedule anything, see tick()'s loop-wrap comment below). Reads/
   *  writes the enclosing `scheduledIds` closure var, same as inline code
   *  used to. */
  function scheduleNotes(notes: readonly Note[], anchorNow: TransportAnchor, windowStart: number, windowEnd: number, boundaryBeat: number): void {
    const items = computeScheduleWindow(notes, scheduledIds, anchorNow, windowStart, windowEnd, boundaryBeat);
    for (const item of items) {
      scheduledIds.add(item.note.id);
      if (cb.isVocalMode() && item.note.vowel) {
        cb.setVowel(item.note.vowel);
        if (item.note.breathiness !== undefined) cb.setBreathiness(item.note.breathiness);
      }
      cb.noteOn(item.note.midi, item.note.velocity, item.onAudioTime);
      cb.noteOff(item.note.midi, item.offAudioTime);
    }
  }

  /** Loop-region support (Wave C2a): a region only changes anything while
   *  `looping` AND a region is actually set ("Loop toggle now uses the
   *  region when one exists, else whole score" — design note). Any other
   *  combination (not looping, or looping with no region) is byte-for-byte
   *  the pre-C2a whole-score behavior (wholeEndBeat===endBeat, wrapStart=0)
   *  — region stays null so `endBeat`/`wrapStart` resolve to exactly what
   *  they always did. Centralized so tick() and seekTo() can't drift on
   *  what "looping with a region" means. */
  function loopBounds(notes: readonly Note[], looping: boolean) {
    const region = looping ? cb.getLoopRegion?.() ?? null : null;
    const wholeEndBeat = computeScoreEndBeat(notes);
    let endBeat = region ? region.endBeat : wholeEndBeat;
    // Wave C3 — while capturing without a region, run to the full canvas
    // instead of stopping at the last existing note (see isCapturing's doc
    // comment above). Math.max (not plain SCORE_BEATS) so a score that
    // somehow extends past the canvas still plays out in full, same as it
    // would un-captured. Deliberately NOT keyed on wholeEndBeat alone: a
    // whole-score LOOP while capturing also uses the canvas as its cycle
    // (otherwise the cycle length would CHANGE mid-recording as committed
    // passes grow wholeEndBeat — a moving loop boundary mid-take).
    if (cb.isCapturing?.() && !region) endBeat = Math.max(endBeat, SCORE_BEATS);
    return { region, wholeEndBeat, endBeat, wrapStart: region ? region.startBeat : 0 };
  }

  /** The boundary beat notes scheduled from position `atBeat` should have
   *  their noteOff clamped to / be excluded past (Wave C2b findings 1/2) —
   *  the region's own end while `atBeat` is still inside it, else the true
   *  score end. Shared by tick() (called with the PREVIOUS tick's position)
   *  and seekTo() (called with the just-sought position) so "inside vs.
   *  escaped the region" can never diverge between the two call sites —
   *  see the finding-5 comment in tick() for why "escaped" matters. */
  function scheduleBoundaryAt(region: LoopRegion | null, endBeat: number, wholeEndBeat: number, atBeat: number): number {
    return region !== null && atBeat < endBeat ? endBeat : wholeEndBeat;
  }

  function tick(): void {
    if (!playing || !anchor) return;
    const ctx = cb.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Live bpm pickup: if the bpm control has changed since the anchor was
    // established, rebase onto the new bpm right now. Only notes not yet
    // committed to the audio clock are affected — see computeScheduleWindow's
    // doc comment.
    const liveBpm = clampBpm(cb.getBpm(), anchor.bpm);
    if (liveBpm !== anchor.bpm) anchor = rebaseAnchor(anchor, now, liveBpm);

    const notes = cb.getScore();
    const looping = cb.isLooping();
    const { region, wholeEndBeat, endBeat, wrapStart } = loopBounds(notes, looping);

    // Position as of the end of the PREVIOUS tick (or the last seek) — read
    // before this tick's own recompute below. Wave C2b finding 5: the
    // region wrap below only fires on an actual CROSSING of endBeat during
    // forward playback (prev < endBeat <= now), not merely "position
    // happens to read >= endBeat" — the latter used to instant-wrap a seek
    // that had deliberately landed past the region back into it.
    const prevPositionBeats = positionBeats;
    scheduleNotes(notes, anchor, now, now + SCHEDULE_AHEAD_SEC, scheduleBoundaryAt(region, endBeat, wholeEndBeat, prevPositionBeats));

    positionBeats = currentBeat(anchor, now);

    // Loop wrap (Wave C0 fix — was up to ~50ms of hiccup per lap; shared by
    // both the region-crossing and whole-score-loop branches below).
    const wrap = () => {
      // Rebase to the EXACT audio-clock instant the loop should have ended
      // — beatToAudioTime(anchor, endBeat), computed from the OLD anchor
      // (still in scope) — not `now`. `now` is whenever this JS-clock tick
      // happened to fire, which is up to LOOKAHEAD_MS (~25ms) after the
      // true wrap instant purely from polling granularity (inherent to the
      // lookahead design, and NOT what this fix removes). Anchoring the
      // new lap to `now` instead of the true instant silently baked that
      // lateness in as a permanent phase offset for every beat<->audio-time
      // conversion for the rest of the lap — compounding lap over lap if
      // the lateness varies.
      const wrapAudioTime = beatToAudioTime(anchor!, endBeat);
      anchor = { audioTime: wrapAudioTime, beat: wrapStart, bpm: liveBpm };
      scheduledIds = new Set();
      positionBeats = wrapStart;
      // Schedule the new lap's post-wrap notes in THIS SAME tick against
      // the freshly rebased anchor, instead of `return`ing immediately and
      // waiting for the next tick (~25ms away, itself with its own polling
      // jitter) to do it. Previously, a note right at the wrap point
      // scheduled only on that later tick would additionally get its
      // onAudioTime clamped up to THAT tick's (later still) `now` — the two
      // effects compounding into the up-to-~50ms hiccup this fix resolves
      // down to the ~25ms that's inherent to LOOKAHEAD_MS. The new lap's
      // own notes schedule against the SAME endBeat boundary (a no-op for
      // a whole-score wrap, per computeScoreEndBeat's invariant — see
      // scheduleBoundaryAt).
      scheduleNotes(notes, anchor, now, now + SCHEDULE_AHEAD_SEC, endBeat);
      cb.onTick?.(wrapStart);
      // Wave C3 — fired AFTER onTick (position already reflects the new
      // lap) so a listener that reads getPositionBeats() from inside its
      // own onLoopWrap handler sees the post-wrap value, not a stale one.
      cb.onLoopWrap?.(wrapStart, endBeat);
    };

    if (region) {
      const crossed = prevPositionBeats < endBeat && positionBeats >= endBeat;
      if (crossed) { wrap(); return; }
      // positionBeats >= endBeat WITHOUT a crossing just now means a seek
      // landed past the region (not live playback reaching it) — DAW
      // convention: play straight through toward the true score end
      // instead of wrapping (finding 5). Gated on positionBeats itself
      // (not just "no crossing this tick"), so a region that legitimately
      // extends past the last note's own end (wholeEndBeat < endBeat is
      // valid — see ruler.ts's normalizeRegion, clamped to the canvas
      // width, not the note content) keeps looping normally instead of
      // stopping early the moment note content runs out mid-region.
      // Seeking back INSIDE the region resumes normal looping
      // automatically, since `crossed` becomes reachable again.
      if (positionBeats >= endBeat) {
        if (positionBeats >= wholeEndBeat) { stop(); return; }
        cb.onTick?.(positionBeats);
        return;
      }
      cb.onTick?.(positionBeats);
      return;
    }

    if (positionBeats >= endBeat) {
      if (looping && endBeat > wrapStart) { wrap(); return; }
      stop();
      return;
    }
    cb.onTick?.(positionBeats);
  }

  function play(): void {
    if (playing) return;
    const notes = cb.getScore();
    // An empty score refuses to play for ordinary playback (nothing to
    // hear), but MUST play while capturing (Wave C3 — recording into an
    // empty score is the primary record-arm use case; see isCapturing's
    // doc comment on TransportCallbacks).
    if (notes.length === 0 && !cb.isCapturing?.()) return;
    cb.resumeContexts();
    const ctx = cb.getContext();
    if (!ctx) return;

    const bpm = clampBpm(cb.getBpm());
    anchor = { audioTime: ctx.currentTime, beat: positionBeats, bpm };
    scheduledIds = new Set();
    playing = true;
    cb.onPlayStateChange?.(true);
    timer = setInterval(tick, LOOKAHEAD_MS);
    tick(); // run the first window immediately instead of waiting a full LOOKAHEAD_MS
  }

  function pause(): void {
    if (!playing) return;
    const ctx = cb.getContext();
    if (ctx && anchor) positionBeats = currentBeat(anchor, ctx.currentTime);
    stopClockAndSound();
    playing = false;
    cb.onPlayStateChange?.(false);
    cb.onTick?.(positionBeats);
  }

  function stop(): void {
    stopClockAndSound();
    playing = false;
    positionBeats = 0;
    cb.onPlayStateChange?.(false);
    cb.onTick?.(positionBeats);
  }

  function togglePlayPause(): void {
    if (playing) pause();
    else play();
  }

  /** Jump playback to `targetBeat` without stopping the transport
   *  (Wave C2a — ruler click-to-seek). Floored at 0 (mirrors state.ts's
   *  own `Math.max(0, ...)` floor on note startBeat) — no upper bound is
   *  imposed here; this file schedules, it doesn't know how wide the
   *  piano roll is rendered, so callers (ruler.ts's clamp helpers via
   *  main.ts) are responsible for keeping the target within whatever
   *  range the UI actually offers.
   *
   *  Paused/stopped: just moves `positionBeats` and re-fires onTick so the
   *  playhead updates immediately — there's no anchor to rebase (play()
   *  establishes a fresh one from this new position, exactly as it always
   *  has).
   *
   *  Playing: a live re-anchor, not a stop/restart. Silences whatever's
   *  currently sounding via cb.allNotesOff() — the same call pause()/
   *  stop() already use, which (see synth.ts's allNotesOff/killVoice)
   *  also cancels anything scheduled-but-not-yet-audible within the
   *  current SCHEDULE_AHEAD_SEC lookahead window, so nothing from the old
   *  position can bleed past the seek. Resets scheduledIds so nothing is
   *  considered "already scheduled" under the new anchor — exactly what
   *  pause()->play() and the loop-wrap rebase already do — then
   *  re-anchors at `ctx.currentTime` with beat=targetBeat and immediately
   *  schedules the new position's lookahead window in this SAME call
   *  rather than waiting for the next tick (same "don't leave a gap"
   *  reasoning as play()'s trailing tick() call and the loop-wrap
   *  rebase's immediate scheduleNotes() inside tick()). */
  function seekTo(targetBeat: number): void {
    const beat = Math.max(0, targetBeat);
    if (!playing || !anchor) {
      positionBeats = beat;
      cb.onTick?.(positionBeats);
      return;
    }
    const ctx = cb.getContext();
    if (!ctx) {
      positionBeats = beat;
      cb.onTick?.(positionBeats);
      return;
    }
    cb.allNotesOff();
    const now = ctx.currentTime;
    const liveBpm = clampBpm(cb.getBpm(), anchor.bpm);
    anchor = { audioTime: now, beat, bpm: liveBpm };
    scheduledIds = new Set();
    positionBeats = beat;
    // Wave C2b findings 1/5: schedule against the region boundary only when
    // the SOUGHT position is still inside it ("seeking inside the region
    // resumes normal looping") — a seek that lands at/past the region's end
    // schedules against score end instead, matching tick()'s "escaped the
    // region plays linearly" behavior on the very next tick's crossing
    // check (prevPositionBeats there will read this sought position).
    const notes = cb.getScore();
    const { region, wholeEndBeat, endBeat } = loopBounds(notes, cb.isLooping());
    scheduleNotes(notes, anchor, now, now + SCHEDULE_AHEAD_SEC, scheduleBoundaryAt(region, endBeat, wholeEndBeat, beat));
    cb.onTick?.(positionBeats);
  }

  return {
    play,
    pause,
    stop,
    togglePlayPause,
    seekTo,
    isPlaying: () => playing,
    getPositionBeats: () => positionBeats,
    beatAtAudioTime: (audioTime) => (anchor ? currentBeat(anchor, audioTime) : positionBeats),
  };
}
