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
import { beatsToSeconds, secondsToBeats, clampBpm } from "./time.js";

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
): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  for (const note of notes) {
    if (alreadyScheduled.has(note.id)) continue;
    const onAudioTime = beatToAudioTime(anchor, note.startBeat);
    const offAudioTime = beatToAudioTime(anchor, note.startBeat + note.durationBeats);
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
  /** Fired on every tick while playing, and once more from pause()/stop()
   *  with the final position — main.ts uses this to move the playhead and
   *  update the mm:ss.s readout. */
  onTick?(positionBeats: number): void;
  /** Fired whenever play/pause/stop changes the playing flag — main.ts
   *  uses this to swap the play/pause button icon. */
  onPlayStateChange?(isPlaying: boolean): void;
}

export interface Transport {
  play(): void;
  pause(): void;
  stop(): void;
  /** Space / play-button handler: pause() if currently playing, else
   *  play() (resumes from the current position — 0 after stop(), wherever
   *  it was after pause()). */
  togglePlayPause(): void;
  isPlaying(): boolean;
  getPositionBeats(): number;
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
  function scheduleNotes(notes: readonly Note[], anchorNow: TransportAnchor, windowStart: number, windowEnd: number): void {
    const items = computeScheduleWindow(notes, scheduledIds, anchorNow, windowStart, windowEnd);
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
    scheduleNotes(notes, anchor, now, now + SCHEDULE_AHEAD_SEC);

    positionBeats = currentBeat(anchor, now);
    const endBeat = computeScoreEndBeat(notes);
    if (positionBeats >= endBeat) {
      if (cb.isLooping() && endBeat > 0) {
        // Loop wrap (Wave C0 fix — was up to ~50ms of hiccup per lap).
        //
        // Rebase to the EXACT audio-clock instant the loop should have
        // ended — beatToAudioTime(anchor, endBeat), computed from the OLD
        // anchor above BEFORE it's reassigned below — not `now`. `now` is
        // whenever this JS-clock tick happened to fire, which is up to
        // LOOKAHEAD_MS (~25ms) after the true wrap instant purely from
        // polling granularity (inherent to the lookahead design, and NOT
        // what this fix removes). Anchoring the new lap to `now` instead of
        // the true instant silently baked that lateness in as a permanent
        // phase offset for every beat<->audio-time conversion for the rest
        // of the lap — compounding lap over lap if the lateness varies.
        const wrapAudioTime = beatToAudioTime(anchor, endBeat);
        anchor = { audioTime: wrapAudioTime, beat: 0, bpm: liveBpm };
        scheduledIds = new Set();
        positionBeats = 0;
        // Schedule the new lap's beat-0-region notes in THIS SAME tick
        // against the freshly rebased anchor, instead of `return`ing
        // immediately and waiting for the next tick (~25ms away, itself
        // with its own polling jitter) to do it. Previously, a beat-0 note
        // scheduled only on that later tick would additionally get its
        // onAudioTime clamped up to THAT tick's (later still) `now` — the
        // two effects compounding into the up-to-~50ms hiccup this fix
        // resolves down to the ~25ms that's inherent to LOOKAHEAD_MS.
        scheduleNotes(notes, anchor, now, now + SCHEDULE_AHEAD_SEC);
        cb.onTick?.(0);
        return;
      }
      stop();
      return;
    }
    cb.onTick?.(positionBeats);
  }

  function play(): void {
    if (playing) return;
    const notes = cb.getScore();
    if (notes.length === 0) return;
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

  return {
    play,
    pause,
    stop,
    togglePlayPause,
    isPlaying: () => playing,
    getPositionBeats: () => positionBeats,
  };
}
