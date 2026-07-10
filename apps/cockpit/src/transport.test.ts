// ─── transport.test.ts ───────────────────────────────────────────────────────
//
// Pure, DOM-free coverage for transport.ts's scheduler math — the exported
// pure functions (currentBeat, rebaseAnchor, computeScheduleWindow,
// computeScoreEndBeat, beatToAudioTime) that createTransport()'s stateful
// setInterval-driven scheduler is built on. These take plain numbers/objects
// and a fake AudioContext "clock" (just numbers standing in for
// ctx.currentTime) — no real AudioContext, no fake timers, no DOM — so
// they're testable directly under Node/vitest the same way pure-logic.
// test.ts covers synth.ts.
//
// Wave C0 fix — createTransport() itself (the stateful setInterval/
// AudioContext-driven wrapper) WAS deliberately unexercised here, on the
// premise that it "needs a real (or heavily mocked) AudioContext to do
// anything, which is out of scope for a pure/Node test file." That premise
// undersold what's actually needed: every one of createTransport()'s
// dependencies is injected via its `TransportCallbacks` parameter —
// including getContext(), which only ever needs to return something with a
// numeric `.currentTime` — so a plain object standing in for AudioContext
// (mirroring the established `createFakeAudioContext()` pattern in
// src/playback/metronome.test.ts, a sibling lookahead-style scheduler in
// this same repo) plus vitest's `vi.useFakeTimers()` for the
// setInterval-driven tick cadence is enough to drive it deterministically,
// with NO real AudioContext, NO DOM, and NO browser. See
// `createFakeTransportEnv` below and the "createTransport — loop-wrap
// rebase" / "createTransport — pause()" describe blocks it feeds, which
// specifically pin two Wave C0 findings that a pure-function-only test file
// structurally cannot reach: the loop-wrap anchor rebase (needs a live
// setInterval-driven tick sequence, not just one-shot pure-function calls)
// and the pause-path (needs `playing`/`anchor`/`scheduledIds` — internal
// closure state createTransport() never exposes as pure functions).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  currentBeat, rebaseAnchor, computeScheduleWindow, computeScoreEndBeat,
  beatToAudioTime, createTransport, LOOKAHEAD_MS,
  type TransportAnchor, type TransportCallbacks,
} from "./transport.js";
import type { Note } from "./state.js";
import { SCORE_BEATS, type LoopRegion } from "./time.js";

/** Build a minimal fake Note for scheduler tests — id + the fields
 *  computeScheduleWindow/computeScoreEndBeat actually read. */
function note(id: string, startBeat: number, durationBeats: number, extra: Partial<Note> = {}): Note {
  return { id, midi: 60, startBeat, durationBeats, velocity: 100, ...extra };
}

// ─── Fake createTransport() environment (Wave C0) ───────────────────────────
//
// A synchronous fake "AudioContext" (just a mutable `.currentTime`, cast to
// the real AudioContext type since tick()/play()/pause() only ever read
// that one property) plus a fully-recorded TransportCallbacks, so
// createTransport()'s STATEFUL behavior is drivable and assertable without
// any real Web Audio object — mirrors metronome.test.ts's
// createFakeAudioContext() pattern. `setTime` moves the fake AudioContext's
// clock independently of vitest's fake JS-timer clock (advanced separately
// via vi.advanceTimersByTime) — deliberately decoupled, since the whole
// point of the loop-wrap tests below is to construct a scenario where the
// two clocks disagree (a late-firing JS tick observing an audio-clock
// instant already past the exact musical wrap point).
interface RecordedNoteOn { midi: number; velocity: number; time: number }
interface RecordedNoteOff { midi: number; time: number }

function createFakeTransportEnv(opts: {
  score: Note[]; bpm?: number; looping?: boolean; vocalMode?: boolean;
  region?: LoopRegion | null; capturing?: boolean;
}) {
  const state = { currentTime: 0 };
  const ctx = state as unknown as AudioContext;

  const noteOns: RecordedNoteOn[] = [];
  const noteOffs: RecordedNoteOff[] = [];
  const onTicks: number[] = [];
  const playStateChanges: boolean[] = [];
  const loopWraps: { cycleStartBeat: number; cycleEndBeat: number }[] = [];
  let allNotesOffCalls = 0;
  let resumeContextsCalls = 0;
  let score = opts.score;
  let bpm = opts.bpm ?? 120;
  let looping = opts.looping ?? false;
  let region: LoopRegion | null = opts.region ?? null;
  let capturing = opts.capturing ?? false;

  const cb: TransportCallbacks = {
    getContext: () => ctx,
    resumeContexts: () => { resumeContextsCalls++; },
    noteOn: (midi, velocity, time) => { noteOns.push({ midi, velocity, time }); },
    noteOff: (midi, time) => { noteOffs.push({ midi, time }); },
    allNotesOff: () => { allNotesOffCalls++; },
    isVocalMode: () => opts.vocalMode ?? false,
    // Neither vowel/breathiness plumbing is exercised by the wrap/pause
    // tests these fakes serve — a zero-arg stub is assignable wherever the
    // interface's (vowel: VowelId)/(value: number) signatures are expected
    // (TS function-type variance: safe to ignore args you don't need).
    setVowel: () => {},
    setBreathiness: () => {},
    getScore: () => score,
    getBpm: () => bpm,
    isLooping: () => looping,
    getLoopRegion: () => region,
    onTick: (p) => onTicks.push(p),
    onPlayStateChange: (p) => playStateChanges.push(p),
    onLoopWrap: (cycleStartBeat, cycleEndBeat) => { loopWraps.push({ cycleStartBeat, cycleEndBeat }); },
    isCapturing: () => capturing,
  };

  return {
    cb, noteOns, noteOffs, onTicks, playStateChanges, loopWraps,
    get allNotesOffCalls() { return allNotesOffCalls; },
    get resumeContextsCalls() { return resumeContextsCalls; },
    setTime: (sec: number) => { state.currentTime = sec; },
    advanceTime: (sec: number) => { state.currentTime += sec; },
    setBpm: (v: number) => { bpm = v; },
    setLooping: (v: boolean) => { looping = v; },
    setScore: (s: Note[]) => { score = s; },
    setLoopRegion: (r: LoopRegion | null) => { region = r; },
    setCapturing: (v: boolean) => { capturing = v; },
  };
}

describe("currentBeat", () => {
  it("returns the anchor's own beat when audioNow equals the anchor's audioTime", () => {
    const anchor: TransportAnchor = { audioTime: 10, beat: 4, bpm: 120 };
    expect(currentBeat(anchor, 10)).toBe(4);
  });

  it("advances by the correct number of beats as audio time passes, at the anchor's bpm", () => {
    // 120bpm = 2 beats/sec.
    const anchor: TransportAnchor = { audioTime: 10, beat: 0, bpm: 120 };
    expect(currentBeat(anchor, 11)).toBe(2); // 1 sec elapsed = 2 beats
    expect(currentBeat(anchor, 10.5)).toBe(1); // 0.5 sec elapsed = 1 beat
  });

  it("uses the anchor's bpm, not any global/default bpm", () => {
    const anchor: TransportAnchor = { audioTime: 0, beat: 0, bpm: 60 }; // 1 beat/sec
    expect(currentBeat(anchor, 3)).toBe(3);
  });
});

describe("rebaseAnchor", () => {
  it("preserves the current beat position computed from the OLD anchor/bpm", () => {
    const anchor: TransportAnchor = { audioTime: 0, beat: 0, bpm: 120 }; // 2 beats/sec
    const rebased = rebaseAnchor(anchor, 1, 60); // 1 sec elapsed at 120bpm = 2 beats
    expect(rebased.beat).toBe(2);
    expect(rebased.audioTime).toBe(1);
    expect(rebased.bpm).toBe(60);
  });

  it("after rebasing, currentBeat continues smoothly from the preserved position at the NEW bpm", () => {
    const original: TransportAnchor = { audioTime: 0, beat: 0, bpm: 120 };
    const rebased = rebaseAnchor(original, 1, 60); // beat=2 at audioTime=1, now 60bpm (1 beat/sec)
    // 1 more second at 60bpm = 1 more beat.
    expect(currentBeat(rebased, 2)).toBe(3);
  });

  it("a live bpm change only affects beats computed AFTER the rebase point — this is what makes a bpm change 'take effect' without touching anything already scheduled", () => {
    const anchor: TransportAnchor = { audioTime: 0, beat: 0, bpm: 120 };
    // Position at the moment of the bpm change (audioNow=2, still old bpm):
    const posAtChange = currentBeat(anchor, 2); // 2 sec * 2 beats/sec = 4 beats
    expect(posAtChange).toBe(4);
    const rebased = rebaseAnchor(anchor, 2, 240); // bpm doubles to 240 (4 beats/sec)
    // 1 more second, now at the NEW bpm:
    expect(currentBeat(rebased, 3)).toBe(4 + 4); // 4 more beats in 1 sec at 240bpm
  });
});

describe("computeScoreEndBeat", () => {
  it("returns 0 for an empty score", () => {
    expect(computeScoreEndBeat([])).toBe(0);
  });

  it("returns the beat where the LAST note to finish ends", () => {
    const notes = [note("a", 0, 2), note("b", 5, 1), note("c", 1, 1)];
    // a ends at 2, b ends at 6, c ends at 2 — max is 6.
    expect(computeScoreEndBeat(notes)).toBe(6);
  });

  it("is not confused by note start order — a later-starting note can still end earlier", () => {
    const notes = [note("a", 10, 0.5), note("b", 0, 20)];
    expect(computeScoreEndBeat(notes)).toBe(20);
  });
});

describe("computeScheduleWindow", () => {
  const anchor: TransportAnchor = { audioTime: 100, beat: 0, bpm: 120 }; // 2 beats/sec

  it("schedules a note whose start falls within the lookahead window", () => {
    // beat 1 -> audioTime 100 + 0.5 = 100.5, which is inside [100, 100.1) at... let's use a wider window.
    const notes = [note("a", 1, 1)]; // onAudioTime = 100.5
    const items = computeScheduleWindow(notes, new Set(), anchor, 100, 100.6);
    expect(items).toHaveLength(1);
    expect(items[0].note.id).toBe("a");
    expect(items[0].onAudioTime).toBeCloseTo(100.5, 10);
    expect(items[0].offAudioTime).toBeCloseTo(101, 10); // beat 2 -> +1s
  });

  it("does NOT schedule a note whose start is beyond the lookahead horizon", () => {
    const notes = [note("a", 10, 1)]; // onAudioTime = 105, way past a 100ms window
    const items = computeScheduleWindow(notes, new Set(), anchor, 100, 100.1);
    expect(items).toHaveLength(0);
  });

  it("skips a note already in `alreadyScheduled`", () => {
    const notes = [note("a", 0, 1)];
    const items = computeScheduleWindow(notes, new Set(["a"]), anchor, 100, 100.1);
    expect(items).toHaveLength(0);
  });

  it("drops a note that has already fully finished before the window starts", () => {
    // Note starts at beat -4 (audioTime 98) and lasts 1 beat (0.5s), ending at
    // audioTime 98.5 — well before windowStart=100.
    const notes = [note("a", -4, 1)];
    const items = computeScheduleWindow(notes, new Set(), anchor, 100, 100.1);
    expect(items).toHaveLength(0);
  });

  it("clamps a note that started before windowStart but hasn't ended yet to fire immediately (resume-mid-note behavior)", () => {
    // Note starts at beat -2 (audioTime 99) and lasts 4 beats (2s), ending at
    // audioTime 101 — still sounding at windowStart=100 (resume point).
    const notes = [note("a", -2, 4)];
    const items = computeScheduleWindow(notes, new Set(), anchor, 100, 100.1);
    expect(items).toHaveLength(1);
    expect(items[0].onAudioTime).toBe(100); // clamped up to windowStart, not the (past) real start
    expect(items[0].offAudioTime).toBeCloseTo(101, 10); // unclamped — still the real end time
  });

  it("returns items sorted by onAudioTime", () => {
    const notes = [note("late", 3, 1), note("early", 0, 1), note("mid", 1, 1)];
    const items = computeScheduleWindow(notes, new Set(), anchor, 100, 102);
    expect(items.map((i) => i.note.id)).toEqual(["early", "mid", "late"]);
  });

  it("schedules multiple notes in the same window independently", () => {
    const notes = [note("a", 0, 1), note("b", 0.5, 1)];
    const items = computeScheduleWindow(notes, new Set(), anchor, 100, 100.5);
    expect(items).toHaveLength(2);
  });

  it("does not mutate `alreadyScheduled` — the caller owns updating it", () => {
    const scheduled = new Set<string>();
    const notes = [note("a", 0, 1)];
    computeScheduleWindow(notes, scheduled, anchor, 100, 100.1);
    expect(scheduled.size).toBe(0);
  });
});

describe("computeScheduleWindow — boundaryBeat clamp/exclusion (Wave C2b findings 1/2)", () => {
  const anchor: TransportAnchor = { audioTime: 100, beat: 0, bpm: 120 }; // 2 beats/sec

  it("clamps a straddling note's offAudioTime to the boundary's own audio-time instant, not its natural end", () => {
    // Note spans beats [2, 10] (onAudioTime 101, natural off 105); boundary
    // at beat 6 -> boundary audio time 103.
    const notes = [note("a", 2, 8)];
    const items = computeScheduleWindow(notes, new Set(), anchor, 100, 102, 6);
    expect(items).toHaveLength(1);
    expect(items[0].onAudioTime).toBeCloseTo(101, 10);
    expect(items[0].offAudioTime).toBeCloseTo(103, 10); // clamped, not the natural 105
  });

  it("leaves a non-straddling note's offAudioTime at its natural end", () => {
    // Note spans beats [2, 4] (off@102), well inside a boundary at beat 6 (@103).
    const notes = [note("a", 2, 2)];
    const items = computeScheduleWindow(notes, new Set(), anchor, 100, 102, 6);
    expect(items[0].offAudioTime).toBeCloseTo(102, 10);
  });

  it("excludes a note whose start is exactly AT the boundary — it belongs to the next lap", () => {
    const notes = [note("a", 6, 1)];
    const items = computeScheduleWindow(notes, new Set(), anchor, 100, 110, 6);
    expect(items).toHaveLength(0);
  });

  it("excludes a note whose start is PAST the boundary", () => {
    const notes = [note("a", 6.5, 1)];
    const items = computeScheduleWindow(notes, new Set(), anchor, 100, 110, 6);
    expect(items).toHaveLength(0);
  });

  it("still schedules a note starting just BEFORE the boundary, clamped", () => {
    const notes = [note("a", 5.9, 2)]; // would naturally run to beat 7.9, past the boundary
    const items = computeScheduleWindow(notes, new Set(), anchor, 100, 110, 6);
    expect(items).toHaveLength(1);
    expect(items[0].offAudioTime).toBeCloseTo(103, 10); // clamped to boundary (beat 6 -> audioTime 103)
  });

  it("with no boundaryBeat given, behaves exactly as before — full natural extent, no exclusion", () => {
    const notes = [note("a", 6, 8)]; // would be excluded/clamped if a boundary of 6 were passed
    const items = computeScheduleWindow(notes, new Set(), anchor, 100, 110);
    expect(items).toHaveLength(1);
    expect(items[0].offAudioTime).toBeCloseTo(107, 10); // unclamped natural end
  });

  it("score-end clamping is a no-op by construction — computeScoreEndBeat IS the last note's own natural end", () => {
    const notes = [note("a", 0, 4), note("b", 2, 6)]; // scoreEnd = max(4, 8) = 8
    const scoreEnd = computeScoreEndBeat(notes);
    const items = computeScheduleWindow(notes, new Set(), anchor, 100, 110, scoreEnd);
    const b = items.find((i) => i.note.id === "b")!;
    expect(b.offAudioTime).toBeCloseTo(beatToAudioTime(anchor, 8), 10); // unclamped — IS the boundary
  });
});

describe("computeScheduleWindow — bpm change mid-playback", () => {
  it("a note's audio time reflects whatever bpm the CURRENT anchor carries, not the bpm the score was authored at", () => {
    const notes = [note("a", 4, 1)]; // 4 beats in
    const slowAnchor: TransportAnchor = { audioTime: 0, beat: 0, bpm: 60 }; // 1 beat/sec -> beat 4 at t=4
    const fastAnchor: TransportAnchor = { audioTime: 0, beat: 0, bpm: 120 }; // 2 beats/sec -> beat 4 at t=2

    const slowItems = computeScheduleWindow(notes, new Set(), slowAnchor, 0, 10);
    const fastItems = computeScheduleWindow(notes, new Set(), fastAnchor, 0, 10);

    expect(slowItems[0].onAudioTime).toBeCloseTo(4, 10);
    expect(fastItems[0].onAudioTime).toBeCloseTo(2, 10);
  });

  it("a rebase mid-playback changes the scheduled time of a not-yet-scheduled note, simulating a live bpm change", () => {
    // Playback starts at 120bpm; at audio time 1 (beat 2), bpm changes to 60.
    const original: TransportAnchor = { audioTime: 0, beat: 0, bpm: 120 };
    const rebased = rebaseAnchor(original, 1, 60); // beat=2 preserved, now 60bpm (1 beat/sec)

    // A note at beat 4 (2 beats after the rebase point):
    const notes = [note("a", 4, 1)];

    // Under the OLD anchor (no bpm change), beat 4 would have landed at
    // audioTime 2 (2 beats/sec from t=0).
    const underOldAnchor = computeScheduleWindow(notes, new Set(), original, 0, 10);
    expect(underOldAnchor[0].onAudioTime).toBeCloseTo(2, 10);

    // Under the REBASED anchor (bpm dropped to 60 at t=1, beat=2), beat 4 is
    // 2 more beats at 1 beat/sec = 2 more seconds after t=1 -> audioTime 3.
    const underRebasedAnchor = computeScheduleWindow(notes, new Set(), rebased, 0, 10);
    expect(underRebasedAnchor[0].onAudioTime).toBeCloseTo(3, 10);
    // The bpm change pushed this not-yet-scheduled note LATER — proving a
    // live tempo change actually changes playback timing for anything not
    // yet committed to the audio clock.
    expect(underRebasedAnchor[0].onAudioTime).toBeGreaterThan(underOldAnchor[0].onAudioTime);
  });
});

describe("beatToAudioTime (pins the loop-wrap exact-instant fix)", () => {
  it("computes the exact audio-clock instant a beat position lands at, given an anchor", () => {
    const anchor: TransportAnchor = { audioTime: 10, beat: 0, bpm: 120 }; // 2 beats/sec
    expect(beatToAudioTime(anchor, 8)).toBeCloseTo(14, 10); // 8 beats / 2 beats-per-sec = 4s after audioTime
  });

  it("accounts for the anchor's own beat offset, not just its audioTime", () => {
    const anchor: TransportAnchor = { audioTime: 5, beat: 2, bpm: 60 }; // 1 beat/sec
    // beat 6 is 4 beats past the anchor's beat 2 -> 4s past audioTime 5.
    expect(beatToAudioTime(anchor, 6)).toBeCloseTo(9, 10);
  });

  it("is purely a function of the anchor and the target beat — independent of any 'now'/wall-clock value", () => {
    const anchor: TransportAnchor = { audioTime: 0, beat: 0, bpm: 120 };
    // The exact instant beat 2 (one full loop of a 2-beat score) lands, at
    // 120bpm from an anchor set at audioTime 0, is exactly 1.0s — this is
    // what tick()'s loop-wrap rebase now anchors the new lap to
    // (beatToAudioTime(anchor, endBeat)), instead of whatever `now` a late
    // JS-clock tick happened to observe.
    expect(beatToAudioTime(anchor, 2)).toBe(1.0);
  });
});

describe("createTransport — loop-wrap rebase (pins the up-to-~50ms wrap hiccup fix)", () => {
  // Unconditionally restore real timers after every test in this describe
  // block, mirroring the established pattern in metronome.test.ts /
  // engine.test.ts — a thrown assertion mid-test must never leak fake
  // timers into a later test.
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rebases the loop anchor to the EXACT end-of-loop audio time (not the late tick's `now`) and schedules the next lap's notes in the SAME tick", () => {
    vi.useFakeTimers();

    // 120bpm = 2 beats/sec -> 1 beat = 0.5s. A 2-beat score therefore loops
    // every 1.0s exactly (the true wrap instant, "E" in the comments
    // below). Note "b" sits just after the loop start (beat 0.1 = 0.05s
    // in) so its scheduled onAudioTime directly reveals which audioTime
    // the WRAPPED anchor actually used: exactly 1.0 (fixed) -> onAudioTime
    // ~1.05; 1.015 (the buggy old `now`) -> onAudioTime ~1.065. A beat-0
    // note like "a" alone can't distinguish the two (both get clamped up
    // to `now` once detection is late), which is why "b" is the
    // load-bearing assertion here.
    const notes = [note("a", 0, 2, { midi: 60 }), note("b", 0.1, 0.1, { midi: 61 })];
    const env = createFakeTransportEnv({ score: notes, bpm: 120, looping: true });
    const transport = createTransport(env.cb);

    transport.play(); // lap 1 — synchronous first tick at audio time 0

    const bLap1 = env.noteOns.filter((c) => c.midi === 61);
    expect(bLap1).toHaveLength(1);
    expect(bLap1[0].time).toBeCloseTo(0.05, 10);

    // Simulate the wrap being detected 15ms late: the (fake) audio clock
    // reads 1.015s when the next tick fires, 15ms past the exact 1.0s loop
    // end — well inside the documented "up to LOOKAHEAD_MS (~25ms) late"
    // detection window. Only the fake AudioContext's clock is moved here —
    // the fake JS-timer clock is advanced separately below — deliberately
    // decoupling them to construct this exact "two clocks disagree"
    // scenario (real audio hardware keeps running at its own rate
    // regardless of when a throttled/backgrounded JS timer next fires).
    env.setTime(1.015);
    vi.advanceTimersByTime(LOOKAHEAD_MS); // fires the next setInterval tick

    const aLap2 = env.noteOns.filter((c) => c.midi === 60);
    const bLap2 = env.noteOns.filter((c) => c.midi === 61);

    // Both notes got a SECOND occurrence (lap 2) scheduled in THIS SAME
    // tick — not deferred to a third tick the way the old code (which
    // `return`ed immediately after rebasing, without scheduling anything)
    // would have required.
    expect(aLap2).toHaveLength(2);
    expect(bLap2).toHaveLength(2);

    // "a" (beat 0): the exact wrap instant (1.0) is already in the past
    // relative to `now` (1.015) by the time it was noticed, so it's
    // legitimately clamped up to `now` either way — this alone doesn't
    // distinguish the fix from the bug, but does confirm a beat-0 note was
    // scheduled in the wrap tick at all (the literal finding text).
    expect(aLap2[1].time).toBeCloseTo(1.015, 10);

    // "b" (beat 0.1): NOT clamped (its instant, 1.05, is still ahead of
    // `now`=1.015) — so this value is a direct, unclamped readout of the
    // wrapped anchor's audioTime. 1.05 can only arise from anchor.audioTime
    // === 1.0 (the exact wrap instant, per beatToAudioTime above); the
    // pre-fix `now`-anchored version would have produced 1.015 + 0.05 =
    // 1.065 instead — a ~15ms error that would have compounded lap over
    // lap if the detection lateness varied.
    expect(bLap2[1].time).toBeCloseTo(1.05, 10);
    expect(bLap2[1].time).not.toBeCloseTo(1.065, 5);

    expect(transport.getPositionBeats()).toBe(0); // wrapped back to the top

    transport.stop();
  });
});

describe("createTransport — pause() (Wave C0 stateful coverage: pause mid-window silences held notes, resume doesn't double-schedule)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("pause() mid-note silences via allNotesOff and fully stops the scheduler — no further noteOn/noteOff while paused", () => {
    vi.useFakeTimers();
    // 120bpm = 2 beats/sec. A 4-beat (2s) note spans the pause point.
    const notes = [note("long", 0, 4, { midi: 60 })];
    const env = createFakeTransportEnv({ score: notes, bpm: 120, looping: false });
    const transport = createTransport(env.cb);

    transport.play(); // schedules "long": on@0, off@2
    expect(env.noteOns).toHaveLength(1);
    expect(env.noteOffs).toHaveLength(1);

    // Advance to mid-note (1 beat in = 0.5s) via a normal tick.
    env.setTime(0.5);
    vi.advanceTimersByTime(LOOKAHEAD_MS);
    expect(env.noteOns).toHaveLength(1); // "long" was already scheduled — no re-schedule
    expect(env.playStateChanges).toEqual([true]);

    transport.pause();

    expect(env.allNotesOffCalls).toBe(1); // held/sounding notes silenced
    expect(transport.isPlaying()).toBe(false);
    expect(transport.getPositionBeats()).toBeCloseTo(1, 10); // 0.5s * 2 beats/sec = 1 beat, preserved
    expect(env.playStateChanges).toEqual([true, false]);

    // The scheduler must be genuinely stopped, not just silenced once —
    // advancing well past where more ticks WOULD have fired must produce no
    // further activity (this is the property panic() was missing before
    // its own Wave C0 fix: pause()/stop() already got this right).
    env.advanceTime(5);
    vi.advanceTimersByTime(5000);
    expect(env.noteOns).toHaveLength(1);
    expect(env.noteOffs).toHaveLength(1);
    expect(env.allNotesOffCalls).toBe(1); // not called again just from time passing
  });

  it("resuming after a mid-window pause schedules the interrupted note EXACTLY ONCE more — no double-schedule, no drop", () => {
    vi.useFakeTimers();
    const notes = [note("long", 0, 4, { midi: 60 })];
    const env = createFakeTransportEnv({ score: notes, bpm: 120, looping: false });
    const transport = createTransport(env.cb);

    transport.play();
    env.setTime(0.5);
    vi.advanceTimersByTime(LOOKAHEAD_MS);
    transport.pause(); // position preserved at beat 1

    // Web Audio's own clock isn't pausable by this app (pause() never calls
    // ctx.suspend() — see transport.ts) — it keeps advancing in real time
    // regardless of app-level pause state. Simulate 2s of real time passing
    // while paused.
    env.setTime(2.5);
    transport.play(); // resume

    // Exactly one NEW noteOn: not zero (the note must still sound after
    // resuming mid-flight) and not two (resetting `scheduledIds` on both
    // pause() and play() must not cause the same note to be committed
    // twice in a single resume tick).
    expect(env.noteOns).toHaveLength(2);
    expect(env.noteOns[1]).toEqual({ midi: 60, velocity: 100, time: 2.5 }); // clamped to the resume instant
    expect(env.noteOffs).toHaveLength(2);
    // Unclamped — the note's real end: resumed at beat 1 (t=2.5), 3 beats
    // remain at 2 beats/sec = 1.5s more -> audioTime 4.0.
    expect(env.noteOffs[1].time).toBeCloseTo(4.0, 10);

    transport.stop();
  });

  it("is a safe no-op when nothing is playing", () => {
    const notes = [note("a", 0, 1)];
    const env = createFakeTransportEnv({ score: notes });
    const transport = createTransport(env.cb);

    expect(() => transport.pause()).not.toThrow();
    expect(transport.isPlaying()).toBe(false);
    expect(env.allNotesOffCalls).toBe(0); // stopClockAndSound is only reached via the playing guard
    expect(env.playStateChanges).toEqual([]); // no spurious onPlayStateChange(false)
  });
});

describe("createTransport — seekTo (Wave C2a)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("when stopped, just moves the position and fires onTick — no audio calls", () => {
    const env = createFakeTransportEnv({ score: [note("a", 0, 4)] });
    const transport = createTransport(env.cb);

    transport.seekTo(2.5);

    expect(transport.getPositionBeats()).toBe(2.5);
    expect(env.onTicks).toEqual([2.5]);
    expect(env.allNotesOffCalls).toBe(0);
    expect(env.noteOns).toHaveLength(0);
  });

  it("floors a negative target at 0", () => {
    const env = createFakeTransportEnv({ score: [note("a", 0, 4)] });
    const transport = createTransport(env.cb);
    transport.seekTo(-10);
    expect(transport.getPositionBeats()).toBe(0);
  });

  it("when paused mid-score, seeking updates the position a later play() resumes from", () => {
    vi.useFakeTimers();
    const notes = [note("a", 0, 20)];
    const env = createFakeTransportEnv({ score: notes, bpm: 120 });
    const transport = createTransport(env.cb);

    transport.play();
    env.setTime(1); // 2 beats in
    vi.advanceTimersByTime(LOOKAHEAD_MS);
    transport.pause();
    expect(transport.getPositionBeats()).toBeCloseTo(2, 10);

    transport.seekTo(10);
    expect(transport.getPositionBeats()).toBe(10);

    env.setTime(5);
    transport.play(); // must resume from the SOUGHT position (10), not the pre-seek one (2)
    const onsAfterResume = env.noteOns.filter((c) => c.time === 5);
    expect(onsAfterResume).toHaveLength(1); // "a" (spans beat 0-20) is still sounding at beat 10

    transport.stop();
  });

  it("while playing, re-anchors at the new position: silences current sound and schedules exactly once at the target — no double-schedule", () => {
    vi.useFakeTimers();
    // "early" only sounds before beat 2; "late" only sounds at/after beat 5.
    const notes = [note("early", 0, 2, { midi: 60 }), note("late", 5, 2, { midi: 61 })];
    const env = createFakeTransportEnv({ score: notes, bpm: 120 }); // 2 beats/sec
    const transport = createTransport(env.cb);

    transport.play(); // schedules "early" immediately (on@0)
    expect(env.noteOns.map((c) => c.midi)).toEqual([60]);

    env.setTime(2); // 4 beats in — between the two notes, nothing new due yet
    vi.advanceTimersByTime(LOOKAHEAD_MS);

    transport.seekTo(5); // jump straight to "late"'s start

    expect(env.allNotesOffCalls).toBe(1); // silenced whatever was (or wasn't) sounding
    expect(transport.getPositionBeats()).toBe(5);
    const lateOns = env.noteOns.filter((c) => c.midi === 61);
    expect(lateOns).toHaveLength(1);
    expect(lateOns[0].time).toBeCloseTo(2, 10); // scheduled at the CURRENT audio time (the seek instant)

    // Advancing further must not re-schedule "late" a second time.
    env.setTime(2.05);
    vi.advanceTimersByTime(LOOKAHEAD_MS);
    expect(env.noteOns.filter((c) => c.midi === 61)).toHaveLength(1);

    transport.stop();
  });

  it("seeking past the end of the score while playing lets the very next tick stop playback", () => {
    vi.useFakeTimers();
    const notes = [note("a", 0, 2)];
    const env = createFakeTransportEnv({ score: notes, bpm: 120, looping: false });
    const transport = createTransport(env.cb);

    transport.play();
    transport.seekTo(100); // past computeScoreEndBeat (2)

    env.setTime(0.001);
    vi.advanceTimersByTime(LOOKAHEAD_MS);

    expect(transport.isPlaying()).toBe(false); // tick() noticed positionBeats >= endBeat and stopped
    expect(transport.getPositionBeats()).toBe(0); // stop() always resets to 0
  });
});

describe("createTransport — loop region (Wave C2a)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("wraps region-end -> region-start (not beat 0) when a region is set and looping is on", () => {
    vi.useFakeTimers();
    const region = { startBeat: 4, endBeat: 8 };
    // 120bpm = 2 beats/sec -> 1 beat = 0.5s. The region is 4 beats = 2s long,
    // so it wraps every 2s exactly. "b" sits just after the region start
    // (beat 4.1) so its scheduled onAudioTime directly reveals which
    // audioTime the WRAPPED anchor actually used — same technique the
    // whole-score wrap test above uses.
    const notes = [note("a", 4, 0.2, { midi: 60 }), note("b", 4.1, 0.1, { midi: 61 })];
    const env = createFakeTransportEnv({ score: notes, bpm: 120, looping: true, region });
    const transport = createTransport(env.cb);

    transport.seekTo(region.startBeat); // start already inside the region
    transport.play(); // lap 1 — synchronous first tick at audio time 0

    const bLap1 = env.noteOns.filter((c) => c.midi === 61);
    expect(bLap1).toHaveLength(1);
    expect(bLap1[0].time).toBeCloseTo(0.05, 10);

    env.setTime(2.0); // exactly the region's own 2s length has elapsed
    vi.advanceTimersByTime(LOOKAHEAD_MS);

    const aLap2 = env.noteOns.filter((c) => c.midi === 60);
    const bLap2 = env.noteOns.filter((c) => c.midi === 61);
    expect(aLap2).toHaveLength(2);
    expect(bLap2).toHaveLength(2);
    expect(bLap2[1].time).toBeCloseTo(2.05, 10); // wrapped anchor + 0.05s into lap 2

    expect(transport.getPositionBeats()).toBe(region.startBeat); // wrapped to region START, not 0

    transport.stop();
  });

  it("clamps a straddling note's noteOff to the region boundary AT SCHEDULE TIME — no stuck notes, no separate forced-off needed (Wave C2b finding 1)", () => {
    vi.useFakeTimers();
    const region = { startBeat: 4, endBeat: 8 };
    // "long" starts inside the region (beat 6) but its natural duration
    // carries it to beat 12 — past the region's end (8). Both synth engines
    // drop a voice from their active-voice map the instant noteOff() is
    // CALLED (not when its scheduled audio time arrives) — so the ONLY
    // noteOff call this note ever gets must already carry the clamped
    // (boundary) time, not the natural one, or a later "force it off"
    // call would find nothing left to silence (this is exactly what a
    // forced-noteOff-at-wrap approach gets wrong against a real engine).
    const notes = [note("long", 6, 6, { midi: 62 })];
    const env = createFakeTransportEnv({ score: notes, bpm: 120, looping: true, region });
    const transport = createTransport(env.cb);

    transport.seekTo(region.startBeat);
    transport.play(); // lap 1 — "long" is 1s away, outside the 100ms lookahead yet

    env.setTime(1.0); // now within the lookahead of "long"'s beat-6 onset
    vi.advanceTimersByTime(LOOKAHEAD_MS);
    expect(env.noteOns.filter((c) => c.midi === 62)).toHaveLength(1);
    // The SCHEDULED noteOff time already equals the region boundary's own
    // audio-time instant (beat 8 -> audioTime 2, at 120bpm from this
    // anchor) — clamped at the moment of scheduling, not the natural
    // beat-12 end (audioTime 4).
    expect(env.noteOffs.filter((c) => c.midi === 62)).toEqual([{ midi: 62, time: 2 }]);

    env.setTime(2.0); // the region's own 2s length has elapsed -> wrap
    vi.advanceTimersByTime(LOOKAHEAD_MS);

    // Still exactly the one (already-clamped) noteOff call — nothing new
    // fires at the wrap instant, because there was never anything left to
    // force off.
    expect(env.noteOffs.filter((c) => c.midi === 62)).toEqual([{ midi: 62, time: 2 }]);
    // Not re-triggered again within the same tick — its new-lap occurrence
    // (beat 6 relative to the new anchor) is still outside the 100ms lookahead.
    expect(env.noteOns.filter((c) => c.midi === 62)).toHaveLength(1);

    transport.stop();
  });

  it("a non-straddling note inside a region keeps its natural noteOff, unclamped (Wave C2b finding 1)", () => {
    vi.useFakeTimers();
    const region = { startBeat: 4, endBeat: 8 };
    const notes = [note("short", 4, 1, { midi: 62 })]; // spans [4, 5] — well inside the region
    const env = createFakeTransportEnv({ score: notes, bpm: 120, looping: true, region });
    const transport = createTransport(env.cb);

    transport.seekTo(region.startBeat);
    transport.play();

    // Region start (beat 4) -> audioTime 0; note ends at beat 5 -> audioTime 0.5.
    expect(env.noteOffs.filter((c) => c.midi === 62)).toEqual([{ midi: 62, time: 0.5 }]);

    transport.stop();
  });

  it("does not schedule a note starting at/past the region's end boundary — no phantom trigger at the wrap seam, lap after lap (Wave C2b finding 2)", () => {
    vi.useFakeTimers();
    const region = { startBeat: 4, endBeat: 8 };
    // Both notes sit AT/PAST the region's own end (outside [start, end)) —
    // a correctly-looping region must never sound them while active. The
    // pre-wrap lookahead window reaches right up to (and slightly past)
    // the wrap instant every lap — exactly what used to leak these through
    // (scheduled against the OLD, pre-wrap anchor, transport.ts:283 was
    // unclamped).
    const notes = [
      note("atEnd", 8, 1, { midi: 62 }),
      note("justAfter", 8.05, 1, { midi: 63 }),
    ];
    const env = createFakeTransportEnv({ score: notes, bpm: 120, looping: true, region });
    const transport = createTransport(env.cb);

    transport.seekTo(region.startBeat);
    transport.play();

    // Run several laps (region is 2s long at 120bpm) — each iteration
    // closes in on, then crosses, the wrap boundary.
    for (let lap = 0; lap < 3; lap++) {
      env.advanceTime(1.0);
      vi.advanceTimersByTime(LOOKAHEAD_MS);
      env.advanceTime(1.0);
      vi.advanceTimersByTime(LOOKAHEAD_MS);
    }

    expect(env.noteOns.filter((c) => c.midi === 62)).toHaveLength(0);
    expect(env.noteOns.filter((c) => c.midi === 63)).toHaveLength(0);

    transport.stop();
  });

  it("a region has no effect when looping is off — plays past the region's bounds, ignoring it", () => {
    vi.useFakeTimers();
    const region = { startBeat: 1, endBeat: 2 }; // deliberately tiny/early
    const notes = [note("a", 0, 4)]; // whole-score end is beat 4
    const env = createFakeTransportEnv({ score: notes, bpm: 120, looping: false, region });
    const transport = createTransport(env.cb);

    transport.play();
    env.setTime(1.0); // 2 beats in — already past the region's endBeat(2), but NOT looping
    vi.advanceTimersByTime(LOOKAHEAD_MS);

    expect(transport.isPlaying()).toBe(true); // did NOT stop/wrap at the region's bounds
    expect(transport.getPositionBeats()).toBeCloseTo(2, 10);

    transport.stop();
  });

  it("a seek that lands past the region's end plays straight through to score end — no instant-wrap back into the region (Wave C2b finding 5)", () => {
    vi.useFakeTimers();
    const region = { startBeat: 4, endBeat: 8 };
    const notes = [
      note("inRegion", 5, 1, { midi: 60 }),
      note("afterRegion", 10, 2, { midi: 61 }), // outside the region, near score end (12)
    ];
    const env = createFakeTransportEnv({ score: notes, bpm: 120, looping: true, region });
    const transport = createTransport(env.cb);

    transport.seekTo(9); // deliberately past region.endBeat(8), before score end(12)
    transport.play();

    // Immediately after landing past the region, playback must NOT have
    // instant-wrapped back to region.startBeat — the old
    // (positionBeats >= endBeat) check fired on ANY position read, seek
    // included, not just a live crossing.
    expect(transport.getPositionBeats()).toBeCloseTo(9, 10);

    env.setTime(0.5); // beat 10 -- "afterRegion" begins
    vi.advanceTimersByTime(LOOKAHEAD_MS);
    expect(env.noteOns.filter((c) => c.midi === 61)).toHaveLength(1); // plays normally, past the region

    env.setTime(1.5); // beat 12 -- the TRUE score end
    vi.advanceTimersByTime(LOOKAHEAD_MS);
    expect(transport.isPlaying()).toBe(false); // stopped at score end
    expect(transport.getPositionBeats()).toBe(0); // stop()'s own reset — never wrapped to region.startBeat(4)

    transport.stop();
  });

  it("crossing the region's end from inside wraps exactly once — position never observably sits at/past the boundary", () => {
    vi.useFakeTimers();
    const region = { startBeat: 4, endBeat: 8 };
    const notes = [note("a", 4, 1, { midi: 60 })];
    const env = createFakeTransportEnv({ score: notes, bpm: 120, looping: true, region });
    const transport = createTransport(env.cb);

    transport.seekTo(region.startBeat);
    transport.play();

    env.setTime(2.0); // exactly the region's own 2s length -> crosses endBeat
    vi.advanceTimersByTime(LOOKAHEAD_MS);

    // The crossing rebases positionBeats back to wrapStart within the SAME
    // tick it's detected — no external observer (onTick) ever sees a
    // position at/past endBeat while a region is active.
    expect(env.onTicks.every((p) => p < region.endBeat)).toBe(true);
    expect(transport.getPositionBeats()).toBe(region.startBeat);

    // Advancing further within the new lap must not wrap again — exactly
    // one wrap per crossing, not a runaway repeat.
    env.setTime(2.05);
    vi.advanceTimersByTime(LOOKAHEAD_MS);
    expect(transport.getPositionBeats()).toBeCloseTo(region.startBeat + 0.1, 5);

    transport.stop();
  });
});

// ─── Wave C3: record-capture transport seams ────────────────────────────────

describe("beatAtAudioTime (Wave C3)", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("falls back to the current position when nothing is playing", () => {
    const env = createFakeTransportEnv({ score: [note("a", 0, 1)] });
    const transport = createTransport(env.cb);
    transport.seekTo(3);
    expect(transport.beatAtAudioTime(123.45)).toBe(3);
  });

  it("maps an audio-clock instant through the LIVE anchor while playing", () => {
    vi.useFakeTimers();
    const env = createFakeTransportEnv({ score: [note("a", 0, 8)], bpm: 120 }); // 2 beats/sec
    const transport = createTransport(env.cb);
    transport.play(); // anchor: audioTime 0, beat 0
    expect(transport.beatAtAudioTime(0.5)).toBeCloseTo(1, 10);
    expect(transport.beatAtAudioTime(1.25)).toBeCloseTo(2.5, 10);
    transport.stop();
  });

  it("resolves an instant EARLIER than 'now' correctly (the capture case — event.timeStamp predates handler run)", () => {
    vi.useFakeTimers();
    const env = createFakeTransportEnv({ score: [note("a", 0, 8)], bpm: 120 });
    const transport = createTransport(env.cb);
    transport.play();
    env.setTime(1.0); // "now" = beat 2
    vi.advanceTimersByTime(LOOKAHEAD_MS);
    expect(transport.getPositionBeats()).toBeCloseTo(2, 10);
    // A 100ms-old input event's audio instant resolves to where playback
    // WAS, not the current tick-cached position.
    expect(transport.beatAtAudioTime(0.9)).toBeCloseTo(1.8, 10);
    transport.stop();
  });

  it("tracks a live bpm rebase — instants after the rebase resolve at the new bpm", () => {
    vi.useFakeTimers();
    const env = createFakeTransportEnv({ score: [note("a", 0, 32)], bpm: 120 });
    const transport = createTransport(env.cb);
    transport.play();
    env.setTime(1.0); // beat 2 under 120bpm
    env.setBpm(60);   // next tick rebases to {audioTime: 1, beat: 2, bpm: 60}
    vi.advanceTimersByTime(LOOKAHEAD_MS);
    expect(transport.beatAtAudioTime(2.0)).toBeCloseTo(3, 5); // +1s at 60bpm = +1 beat
    transport.stop();
  });
});

describe("onLoopWrap (Wave C3)", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("fires exactly once per region wrap, with the region's own bounds", () => {
    vi.useFakeTimers();
    const region = { startBeat: 4, endBeat: 8 };
    const env = createFakeTransportEnv({ score: [note("a", 4, 1)], looping: true, region });
    const transport = createTransport(env.cb);
    transport.seekTo(4);
    transport.play();
    env.setTime(2.0); // 4 beats at 120bpm — crosses endBeat 8
    vi.advanceTimersByTime(LOOKAHEAD_MS);
    expect(env.loopWraps).toEqual([{ cycleStartBeat: 4, cycleEndBeat: 8 }]);
    transport.stop();
  });

  it("fires AFTER onTick has already reported the new lap's start position", () => {
    vi.useFakeTimers();
    const region = { startBeat: 4, endBeat: 8 };
    const env = createFakeTransportEnv({ score: [note("a", 4, 1)], looping: true, region });
    const transport = createTransport(env.cb);
    transport.seekTo(4);
    transport.play();
    env.setTime(2.0);
    vi.advanceTimersByTime(LOOKAHEAD_MS);
    expect(env.loopWraps).toHaveLength(1);
    // By the time onLoopWrap fired, the position stream had already been
    // told about the wrapped-to start (wrap() calls onTick first).
    expect(env.onTicks[env.onTicks.length - 1]).toBe(4);
    expect(transport.getPositionBeats()).toBe(4);
    transport.stop();
  });

  it("does not fire on a seek, nor on a linear playthrough reaching the end", () => {
    vi.useFakeTimers();
    const env = createFakeTransportEnv({ score: [note("a", 0, 1)] });
    const transport = createTransport(env.cb);
    transport.play();
    transport.seekTo(0.5);
    env.setTime(2); // way past score end (beat 1) — auto-stops
    vi.advanceTimersByTime(LOOKAHEAD_MS);
    expect(transport.isPlaying()).toBe(false);
    expect(env.loopWraps).toHaveLength(0);
  });

  it("whole-score loop (no region) also reports its bounds", () => {
    vi.useFakeTimers();
    const env = createFakeTransportEnv({ score: [note("a", 0, 2)], looping: true });
    const transport = createTransport(env.cb);
    transport.play();
    env.setTime(1.0); // beat 2 = score end -> wrap
    vi.advanceTimersByTime(LOOKAHEAD_MS);
    expect(env.loopWraps).toEqual([{ cycleStartBeat: 0, cycleEndBeat: 2 }]);
    transport.stop();
  });
});

describe("isCapturing (Wave C3 — record-capture transport behavior)", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("play() starts on an EMPTY score while capturing", () => {
    vi.useFakeTimers();
    const env = createFakeTransportEnv({ score: [], capturing: true });
    const transport = createTransport(env.cb);
    transport.play();
    expect(transport.isPlaying()).toBe(true);
    transport.stop();
  });

  it("play() still refuses an empty score when NOT capturing (pre-C3 behavior preserved)", () => {
    const env = createFakeTransportEnv({ score: [] });
    const transport = createTransport(env.cb);
    transport.play();
    expect(transport.isPlaying()).toBe(false);
  });

  it("a linear capture keeps rolling past the last note's end instead of auto-stopping", () => {
    vi.useFakeTimers();
    const env = createFakeTransportEnv({ score: [note("a", 0, 1)], capturing: true });
    const transport = createTransport(env.cb);
    transport.play();
    env.setTime(1.0); // beat 2 — past wholeEndBeat (1)
    vi.advanceTimersByTime(LOOKAHEAD_MS);
    expect(transport.isPlaying()).toBe(true);
    transport.stop();
  });

  it("a linear capture auto-stops at the canvas end (SCORE_BEATS)", () => {
    vi.useFakeTimers();
    const env = createFakeTransportEnv({ score: [], capturing: true });
    const transport = createTransport(env.cb);
    transport.play();
    env.setTime(SCORE_BEATS / 2 + 0.1); // just past 64 beats at 120bpm (32s)
    vi.advanceTimersByTime(LOOKAHEAD_MS);
    expect(transport.isPlaying()).toBe(false);
  });

  it("a loop REGION's cycle length is unaffected by capturing (stable pass-per-cycle boundary)", () => {
    vi.useFakeTimers();
    const region = { startBeat: 0, endBeat: 4 };
    const env = createFakeTransportEnv({ score: [], capturing: true, looping: true, region });
    const transport = createTransport(env.cb);
    transport.play();
    env.setTime(2.0); // 4 beats — crosses the region end
    vi.advanceTimersByTime(LOOKAHEAD_MS);
    expect(env.loopWraps).toEqual([{ cycleStartBeat: 0, cycleEndBeat: 4 }]);
    expect(transport.isPlaying()).toBe(true);
    transport.stop();
  });

  it("whole-score loop while capturing cycles over the full canvas — the cycle length can't drift as passes commit", () => {
    vi.useFakeTimers();
    const env = createFakeTransportEnv({ score: [], capturing: true, looping: true });
    const transport = createTransport(env.cb);
    transport.play();
    env.setTime(SCORE_BEATS / 2 + 0.05);
    vi.advanceTimersByTime(LOOKAHEAD_MS);
    expect(env.loopWraps).toEqual([{ cycleStartBeat: 0, cycleEndBeat: SCORE_BEATS }]);
    expect(transport.isPlaying()).toBe(true);
    transport.stop();
  });
});
