// ─── ai-jam-sessions: Smoke Test ─────────────────────────────────────────────
//
// Quick integration smoke test — no MIDI hardware needed.
// Verifies: ai-music-sheets loads, note parser works, sessions run with mock,
// teaching hooks fire, key moments detected, voice/aside hooks produce output,
// speed control works, progress fires, safe parsing collects warnings,
// sing-along converts notes and produces blocking directives,
// MIDI parsing, position tracking, PlaybackController, sing-on-MIDI,
// voice filters, and live MIDI feedback.
//
// Usage: pnpm smoke (or: node --import tsx src/smoke.ts)
// ─────────────────────────────────────────────────────────────────────────────

import {
  getAllSongs,
  getSong,
  getStats,
  searchSongs,
  initializeFromLibrary,
} from "./songs/index.js";
import { createSession } from "./session.js";
import { createMockVmpkConnector } from "./vmpk.js";
import { parseNoteToMidi, midiToNoteName, safeParseNoteToken } from "./note-parser.js";
import {
  createRecordingTeachingHook,
  createVoiceTeachingHook,
  createAsideTeachingHook,
  createSingAlongHook,
  createLiveFeedbackHook,
  composeTeachingHooks,
  detectKeyMoments,
} from "./teaching.js";
import { noteToSingable, measureToSingableText } from "./note-parser.js";
import { parseMidiBuffer } from "./midi/parser.js";
import { PositionTracker } from "./playback/position.js";
import { PlaybackController } from "./playback/controls.js";
import { createSingOnMidiHook, midiNoteToSingable, filterClusterForVoice } from "./teaching/sing-on-midi.js";
import { createLiveMidiFeedbackHook } from "./teaching/live-midi-feedback.js";
import { listVocalSynthPresets } from "./vocal-synth-adapter.js";
import { createLayeredEngine } from "./layered-engine.js";
import { writeMidi } from "midi-file";
import type { VoiceDirective, AsideDirective, PlaybackProgress, ParseWarning, MidiStatus, MidiNote, VmpkConnector } from "./types.js";
import type { MidiNoteEvent } from "./midi/types.js";

let passed = 0;
let failed = 0;
const pending: Promise<void>[] = [];

function test(name: string, fn: () => void | Promise<void>): void {
  try {
    const result = fn();
    if (result instanceof Promise) {
      pending.push(
        result
          .then(() => {
            passed++;
            console.log(`  ✓ ${name}`);
          })
          .catch((err) => {
            failed++;
            console.log(`  ✗ ${name}: ${err}`);
          })
      );
    } else {
      passed++;
      console.log(`  ✓ ${name}`);
    }
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}: ${err}`);
  }
}

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

console.log("\n ai-jam-sessions smoke test\n");

// ─── Initialize song registry from builtin JSON files ───────────────────────
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const libraryDir = join(__dirname, "..", "songs", "library");
initializeFromLibrary(libraryDir);

// ─── Test 1: song library loads ─────────────────────────────────────────────
console.log("song library integration:");
test("registry loads 24 songs", () => {
  assert(getAllSongs().length === 24, `expected 24 songs, got ${getAllSongs().length}`);
});

test("all 12 genres covered", () => {
  const stats = getStats();
  const covered = Object.values(stats.byGenre).filter((n) => n > 0).length;
  assert(covered === 12, `expected 12 genres, got ${covered}`);
});

test("getSong finds gymnopedie", () => {
  const song = getSong("satie-gymnopedie-no1");
  assert(song !== undefined, "song not found");
  assert(song!.genre === "classical", "wrong genre");
});

test("searchSongs by genre works", () => {
  const results = searchSongs({ genre: "jazz" });
  assert(results.length >= 1, `expected 1+ jazz songs, got ${results.length}`);
  assert(results.some(s => s.id === "autumn-leaves"), "autumn-leaves should be in jazz results");
});

// ─── Test 2: Note parser ────────────────────────────────────────────────────
console.log("\nNote parser:");
test("C4 = MIDI 60", () => {
  assert(parseNoteToMidi("C4") === 60, "C4 should be 60");
});

test("A4 = MIDI 69", () => {
  assert(parseNoteToMidi("A4") === 69, "A4 should be 69");
});

test("MIDI 60 = C4", () => {
  assert(midiToNoteName(60) === "C4", "60 should be C4");
});

test("round-trip: C#4 -> 61 -> C#4", () => {
  const midi = parseNoteToMidi("C#4");
  assert(midi === 61, "C#4 should be 61");
  assert(midiToNoteName(midi) === "C#4", "61 should be C#4");
});

test("safe parse returns null + warning for bad token", () => {
  const warnings: ParseWarning[] = [];
  const result = safeParseNoteToken("GARBAGE:q", 120, "test", warnings);
  assert(result === null, "should return null for bad token");
  assert(warnings.length === 1, "should collect 1 warning");
});

// ─── Test 3: Session engine ─────────────────────────────────────────────────
console.log("\nSession engine:");
test("creates session in loaded state", () => {
  const mock = createMockVmpkConnector();
  const sc = createSession(getSong("imagine")!, mock);
  assert(sc.state === "loaded", "should be loaded");
});

test("plays full song through mock", async () => {
  const mock = createMockVmpkConnector();
  const song = getSong("fallin")!;
  const sc = createSession(song, mock);
  await mock.connect();
  await sc.play();
  assert(sc.state === "finished", `expected finished, got ${sc.state}`);
  assert(sc.session.measuresPlayed === 25, "25 measures");
});

test("measure mode plays one and pauses", async () => {
  const mock = createMockVmpkConnector();
  const song = getSong("autumn-leaves")!;
  const sc = createSession(song, mock, { mode: "measure" });
  await mock.connect();
  await sc.play();
  assert(sc.state === "paused", `expected paused, got ${sc.state}`);
  assert(sc.session.measuresPlayed === 1, "1 measure");
});

// ─── Test 4: Speed + progress ───────────────────────────────────────────────
console.log("\nSpeed + progress:");
test("speed multiplier affects effective tempo", () => {
  const mock = createMockVmpkConnector();
  const song = getSong("fallin")!;
  const sc = createSession(song, mock, { speed: 0.5 });
  assert(sc.effectiveTempo() === song.tempo * 0.5, "should be half tempo");
});

test("progress fires during playback", async () => {
  const mock = createMockVmpkConnector();
  const song = getSong("fallin")!;
  const events: PlaybackProgress[] = [];
  const sc = createSession(song, mock, {
    onProgress: (p) => events.push({ ...p }),
    progressInterval: 0,
  });
  await mock.connect();
  await sc.play();
  assert(events.length === 25, `expected 25 progress events, got ${events.length}`);
  assert(events[24].percent === "100%", "last event should be 100%");
});

// ─── Test 5: Teaching hooks ─────────────────────────────────────────────────
console.log("\nTeaching hooks:");
test("detectKeyMoments finds bar 1 in moonlight", () => {
  const song = getSong("satie-gymnopedie-no1")!;
  const moments = detectKeyMoments(song, 1);
  assert(moments.length > 0, "should find key moment at bar 1");
});

test("recording hook captures events during playback", async () => {
  const mock = createMockVmpkConnector();
  const hook = createRecordingTeachingHook();
  const song = getSong("imagine")!;
  const sc = createSession(song, mock, { teachingHook: hook });
  await mock.connect();
  await sc.play();
  const starts = hook.events.filter((e) => e.type === "measure-start");
  assert(starts.length === 57, `expected 57 measure-start events, got ${starts.length}`);
});

test("song-complete fires after full playback", async () => {
  const mock = createMockVmpkConnector();
  const hook = createRecordingTeachingHook();
  const song = getSong("fallin")!;
  const sc = createSession(song, mock, { teachingHook: hook });
  await mock.connect();
  await sc.play();
  const complete = hook.events.filter((e) => e.type === "song-complete");
  assert(complete.length === 1, "should fire song-complete once");
});

// ─── Test 6: Voice + aside hooks ────────────────────────────────────────────
console.log("\nVoice + aside hooks:");
test("voice hook produces directives during playback", async () => {
  const mock = createMockVmpkConnector();
  const directives: VoiceDirective[] = [];
  const voiceHook = createVoiceTeachingHook(async (d) => { directives.push(d); });
  const song = getSong("satie-gymnopedie-no1")!;
  const sc = createSession(song, mock, { teachingHook: voiceHook });
  await mock.connect();
  await sc.play();
  assert(directives.length > 0, "should produce voice directives");
  const completion = directives.find((d) => d.text.includes("Great work"));
  assert(completion !== undefined, "should have completion directive");
});

test("aside hook produces directives during playback", async () => {
  const mock = createMockVmpkConnector();
  const directives: AsideDirective[] = [];
  const asideHook = createAsideTeachingHook(async (d) => { directives.push(d); });
  const song = getSong("satie-gymnopedie-no1")!;
  const sc = createSession(song, mock, { teachingHook: asideHook });
  await mock.connect();
  await sc.play();
  assert(directives.length > 0, "should produce aside directives");
  assert(directives[0].tags!.includes("piano-teacher"), "should have piano-teacher tag");
});

test("composed hooks dispatch to both voice and aside", async () => {
  const mock = createMockVmpkConnector();
  const voiceD: VoiceDirective[] = [];
  const asideD: AsideDirective[] = [];
  const composed = composeTeachingHooks(
    createVoiceTeachingHook(async (d) => { voiceD.push(d); }),
    createAsideTeachingHook(async (d) => { asideD.push(d); })
  );
  const song = getSong("imagine")!;
  const sc = createSession(song, mock, { teachingHook: composed });
  await mock.connect();
  await sc.play();
  assert(voiceD.length > 0, "voice should receive events");
  assert(asideD.length > 0, "aside should receive events");
});

// ─── Test 7: Sing-along ─────────────────────────────────────────────────────
console.log("\nSing-along:");
test("noteToSingable converts C4 to note name", () => {
  assert(noteToSingable("C4", "note-names") === "C", "C4 → C");
});

test("noteToSingable converts C4 to solfege", () => {
  assert(noteToSingable("C4", "solfege") === "Do", "C4 → Do");
});

test("measureToSingableText produces singable output", () => {
  const result = measureToSingableText(
    { rightHand: "C4:q E4:q G4:q", leftHand: "C3:h" },
    { mode: "note-names", hand: "right" }
  );
  assert(result === "C... E... G", `expected "C... E... G", got "${result}"`);
});

test("sing-along hook produces blocking directives", async () => {
  const directives: VoiceDirective[] = [];
  const song = getSong("imagine")!;
  const hook = createSingAlongHook(async (d) => { directives.push(d); }, song);
  const mock = createMockVmpkConnector();
  const sc = createSession(song, mock, { teachingHook: hook });
  await mock.connect();
  await sc.play();
  assert(directives.length > 0, "should produce directives");
  assert(directives[0].blocking === true, "first directive should be blocking");
});

test("composed sing-along + voice hooks both fire", async () => {
  const singD: VoiceDirective[] = [];
  const voiceD: VoiceDirective[] = [];
  const song = getSong("imagine")!;
  const composed = composeTeachingHooks(
    createSingAlongHook(async (d) => { singD.push(d); }, song),
    createVoiceTeachingHook(async (d) => { voiceD.push(d); })
  );
  const mock = createMockVmpkConnector();
  const sc = createSession(song, mock, { teachingHook: composed });
  await mock.connect();
  await sc.play();
  assert(singD.length > 0, "sing-along should receive events");
  assert(voiceD.length > 0, "voice should receive events");
});

// ─── Test 8: SyncMode ────────────────────────────────────────────────────────
console.log("\nSyncMode:");
test("concurrent sync completes without error", async () => {
  const mock = createMockVmpkConnector();
  const song = getSong("imagine")!;
  const hook = createRecordingTeachingHook();
  const sc = createSession(song, mock, { syncMode: "concurrent", teachingHook: hook });
  await mock.connect();
  await sc.play();
  assert(sc.session.measuresPlayed === 57, "should play 57 measures");
  assert(hook.events.filter(e => e.type === "measure-start").length === 57, "57 measure-start events");
});

test("before sync completes without error", async () => {
  const mock = createMockVmpkConnector();
  const song = getSong("imagine")!;
  const hook = createRecordingTeachingHook();
  const sc = createSession(song, mock, { syncMode: "before", teachingHook: hook });
  await mock.connect();
  await sc.play();
  assert(sc.session.measuresPlayed === 57, "should play 57 measures");
});

// ─── Test 9: Live Feedback Hook ──────────────────────────────────────────────
console.log("\nLive feedback:");
test("live feedback hook fires during full playback", async () => {
  const song = getSong("satie-gymnopedie-no1")!;
  const voiceD: VoiceDirective[] = [];
  const asideD: AsideDirective[] = [];
  const hook = createLiveFeedbackHook(
    async (d) => { voiceD.push(d); },
    async (d) => { asideD.push(d); },
    song,
    { voiceInterval: 4 }
  );
  const mock = createMockVmpkConnector();
  const sc = createSession(song, mock, { teachingHook: hook });
  await mock.connect();
  await sc.play();
  assert(voiceD.length > 0, "should produce voice directives");
  assert(asideD.length > 0, "should produce aside directives");
});

test("composed sing-along + live feedback fires", async () => {
  const song = getSong("imagine")!;
  const singD: VoiceDirective[] = [];
  const feedbackVoiceD: VoiceDirective[] = [];
  const feedbackAsideD: AsideDirective[] = [];
  const composed = composeTeachingHooks(
    createSingAlongHook(async (d) => { singD.push(d); }, song),
    createLiveFeedbackHook(
      async (d) => { feedbackVoiceD.push(d); },
      async (d) => { feedbackAsideD.push(d); },
      song,
      { voiceInterval: 4 }
    )
  );
  const mock = createMockVmpkConnector();
  const sc = createSession(song, mock, { teachingHook: composed, syncMode: "concurrent" });
  await mock.connect();
  await sc.play();
  assert(singD.length > 0, "sing-along should fire");
  assert(feedbackVoiceD.length > 0 || feedbackAsideD.length > 0, "feedback should fire");
});

// ─── MIDI Helpers ──────────────────────────────────────────────────────────

function buildSmokeMidi(notes: Array<{
  note: number; velocity: number; startTick: number; endTick: number;
}>, bpm = 120, ticksPerBeat = 480): Uint8Array {
  const usPerBeat = Math.round(60_000_000 / bpm);
  type MidiEvent = { deltaTime: number; type: string; [key: string]: any };
  const events: MidiEvent[] = [];
  events.push({ deltaTime: 0, type: "setTempo", meta: true, microsecondsPerBeat: usPerBeat });
  const raw: Array<{ tick: number; event: MidiEvent }> = [];
  for (const n of notes) {
    raw.push({ tick: n.startTick, event: { deltaTime: 0, type: "noteOn", channel: 0, noteNumber: n.note, velocity: n.velocity } });
    raw.push({ tick: n.endTick, event: { deltaTime: 0, type: "noteOff", channel: 0, noteNumber: n.note, velocity: 0 } });
  }
  raw.sort((a, b) => a.tick - b.tick);
  let prevTick = 0;
  for (const r of raw) {
    r.event.deltaTime = r.tick - prevTick;
    prevTick = r.tick;
    events.push(r.event);
  }
  events.push({ deltaTime: 0, type: "endOfTrack", meta: true });
  return new Uint8Array(writeMidi({
    header: { format: 0 as const, numTracks: 1, ticksPerBeat },
    tracks: [events],
  } as any));
}

function createSmokeMockConnector(): VmpkConnector {
  return {
    async connect() {},
    async disconnect() {},
    status(): MidiStatus { return "connected"; },
    listPorts() { return ["Mock"]; },
    noteOn(_n: number, _v: number, _c?: number) {},
    noteOff(_n: number, _c?: number) {},
    allNotesOff(_c?: number) {},
    async playNote(_m: MidiNote) {},
  };
}

// ─── Test 10: MIDI file parsing ────────────────────────────────────────────
console.log("\nMIDI file parsing:");
test("parseMidiBuffer extracts note events", () => {
  const buf = buildSmokeMidi([
    { note: 60, velocity: 100, startTick: 0, endTick: 480 },
    { note: 64, velocity: 90, startTick: 480, endTick: 960 },
  ]);
  const parsed = parseMidiBuffer(buf);
  assert(parsed.events.length === 2, `expected 2 events, got ${parsed.events.length}`);
  assert(parsed.events[0].note === 60, "first note should be 60");
  assert(parsed.events[1].note === 64, "second note should be 64");
  assert(parsed.bpm === 120, `expected 120 BPM, got ${parsed.bpm}`);
});

test("parseMidiBuffer computes duration", () => {
  const buf = buildSmokeMidi([
    { note: 60, velocity: 80, startTick: 0, endTick: 1920 },
  ], 120, 480);
  const parsed = parseMidiBuffer(buf);
  // 1920 ticks at 480 ticks/beat at 120 BPM = 4 beats = 2 seconds
  assert(parsed.durationSeconds > 1.5 && parsed.durationSeconds < 2.5,
    `expected ~2s duration, got ${parsed.durationSeconds}`);
});

// ─── Test 11: Position Tracker ─────────────────────────────────────────────
console.log("\nPosition tracker:");
test("PositionTracker computes measures from beats", () => {
  const notes = [];
  for (let i = 0; i < 8; i++) {
    notes.push({ note: 60 + i, velocity: 80, startTick: i * 480, endTick: (i + 1) * 480 });
  }
  const buf = buildSmokeMidi(notes, 120, 480);
  const parsed = parseMidiBuffer(buf);
  const tracker = new PositionTracker(parsed);
  assert(tracker.totalMeasures >= 2, `expected >= 2 measures, got ${tracker.totalMeasures}`);
});

test("snapshotAt returns measure 1 at time 0", () => {
  const buf = buildSmokeMidi([{ note: 60, velocity: 80, startTick: 0, endTick: 480 }], 120, 480);
  const parsed = parseMidiBuffer(buf);
  const tracker = new PositionTracker(parsed);
  const snap = tracker.snapshotAt(0);
  assert(snap.measure === 1, `expected measure 1, got ${snap.measure}`);
  assert(snap.bpm === 120, `expected 120 BPM, got ${snap.bpm}`);
});

test("timeForMeasure returns seek target", () => {
  const buf = buildSmokeMidi([{ note: 60, velocity: 80, startTick: 0, endTick: 480 }], 120, 480);
  const parsed = parseMidiBuffer(buf);
  const tracker = new PositionTracker(parsed);
  const t1 = tracker.timeForMeasure(1);
  const t2 = tracker.timeForMeasure(2);
  assert(Math.abs(t1) < 0.01, `measure 1 should start at ~0, got ${t1}`);
  assert(Math.abs(t2 - 2.0) < 0.1, `measure 2 should start at ~2s, got ${t2}`);
});

test("eventsInMeasure partitions notes correctly", () => {
  const notes = [];
  for (let i = 0; i < 8; i++) {
    notes.push({ note: 60 + i, velocity: 80, startTick: i * 480, endTick: (i + 1) * 480 });
  }
  const buf = buildSmokeMidi(notes, 120, 480);
  const parsed = parseMidiBuffer(buf);
  const tracker = new PositionTracker(parsed);
  const m1 = tracker.eventsInMeasure(1);
  assert(m1.length === 4, `expected 4 events in measure 1, got ${m1.length}`);
});

// ─── Test 12: PlaybackController ───────────────────────────────────────────
console.log("\nPlaybackController:");
test("PlaybackController emits noteOn events", async () => {
  const buf = buildSmokeMidi([
    { note: 60, velocity: 100, startTick: 0, endTick: 480 },
    { note: 64, velocity: 90, startTick: 480, endTick: 960 },
  ]);
  const parsed = parseMidiBuffer(buf);
  const connector = createSmokeMockConnector();
  const controller = new PlaybackController(connector, parsed);
  const noteOns: number[] = [];
  controller.on("noteOn", (e) => { if (e.type === "noteOn") noteOns.push(e.note); });
  await controller.play({ speed: 100 });
  assert(noteOns.length === 2, `expected 2 noteOn events, got ${noteOns.length}`);
  assert(controller.state === "finished", `expected finished, got ${controller.state}`);
});

test("PlaybackController invokes teaching hook", async () => {
  const buf = buildSmokeMidi([
    { note: 60, velocity: 100, startTick: 0, endTick: 480 },
  ]);
  const parsed = parseMidiBuffer(buf);
  const connector = createSmokeMockConnector();
  const controller = new PlaybackController(connector, parsed);
  const hook = createRecordingTeachingHook();
  await controller.play({ speed: 100, teachingHook: hook });
  const starts = hook.events.filter((e) => e.type === "measure-start");
  assert(starts.length >= 1, `expected >= 1 measure-start, got ${starts.length}`);
  const completions = hook.events.filter((e) => e.type === "song-complete");
  assert(completions.length === 1, "should fire song-complete once");
});

// ─── Test 13: Sing-on-MIDI ─────────────────────────────────────────────────
console.log("\nSing-on-MIDI:");
test("midiNoteToSingable converts note-names", () => {
  assert(midiNoteToSingable(60, "note-names") === "C4", "60 → C4");
  assert(midiNoteToSingable(69, "note-names") === "A4", "69 → A4");
});

test("midiNoteToSingable converts solfege", () => {
  assert(midiNoteToSingable(60, "solfege") === "Do", "60 → Do");
  assert(midiNoteToSingable(64, "solfege") === "Mi", "64 → Mi");
});

test("createSingOnMidiHook produces directives", async () => {
  const buf = buildSmokeMidi([
    { note: 60, velocity: 100, startTick: 0, endTick: 480 },
    { note: 64, velocity: 90, startTick: 480, endTick: 960 },
  ]);
  const parsed = parseMidiBuffer(buf);
  const directives: VoiceDirective[] = [];
  const hook = createSingOnMidiHook(async (d) => { directives.push(d); }, parsed, { mode: "note-names" });
  await hook.onMeasureStart(1, undefined, undefined);
  await hook.onMeasureStart(2, undefined, undefined);
  assert(hook.directives.length === 2, `expected 2 directives, got ${hook.directives.length}`);
  assert(hook.directives[0].text.includes("C4"), `first should contain C4, got ${hook.directives[0].text}`);
});

// ─── Test 14: Voice Filters ───────────────────────────────────────────────
console.log("\nVoice filters:");
test("melody-only picks highest note", () => {
  const chord: MidiNoteEvent[] = [
    { note: 48, velocity: 80, time: 0, duration: 0.5, channel: 0 },
    { note: 60, velocity: 80, time: 0, duration: 0.5, channel: 0 },
    { note: 72, velocity: 80, time: 0, duration: 0.5, channel: 0 },
  ];
  const filtered = filterClusterForVoice(chord, "melody-only");
  assert(filtered.length === 1, `expected 1, got ${filtered.length}`);
  assert(filtered[0].note === 72, `expected 72, got ${filtered[0].note}`);
});

test("harmony picks lowest note", () => {
  const chord: MidiNoteEvent[] = [
    { note: 48, velocity: 80, time: 0, duration: 0.5, channel: 0 },
    { note: 72, velocity: 80, time: 0, duration: 0.5, channel: 0 },
  ];
  const filtered = filterClusterForVoice(chord, "harmony");
  assert(filtered.length === 1, `expected 1, got ${filtered.length}`);
  assert(filtered[0].note === 48, `expected 48, got ${filtered[0].note}`);
});

// ─── Test 15: Live MIDI Feedback ──────────────────────────────────────────
console.log("\nLive MIDI feedback:");
test("createLiveMidiFeedbackHook provides tracker", () => {
  const buf = buildSmokeMidi([{ note: 60, velocity: 80, startTick: 0, endTick: 480 }], 120, 480);
  const parsed = parseMidiBuffer(buf);
  const hook = createLiveMidiFeedbackHook(async () => {}, async () => {}, parsed);
  assert(hook.tracker instanceof PositionTracker, "should expose PositionTracker");
  assert(hook.tracker.totalMeasures >= 1, "should have measures");
});

test("live feedback emits completion", async () => {
  const buf = buildSmokeMidi([{ note: 60, velocity: 80, startTick: 0, endTick: 480 }], 120, 480);
  const parsed = parseMidiBuffer(buf);
  const voiceD: VoiceDirective[] = [];
  const asideD: AsideDirective[] = [];
  const hook = createLiveMidiFeedbackHook(async (d) => { voiceD.push(d); }, async (d) => { asideD.push(d); }, parsed);
  await hook.onSongComplete(10, "Smoke Song");
  assert(voiceD.some(d => d.text.includes("Smoke Song")), "should mention song name");
  assert(asideD.some(d => d.reason === "session-complete"), "should emit session-complete");
});

test("composed sing + live feedback on PlaybackController", async () => {
  const buf = buildSmokeMidi([
    { note: 60, velocity: 40, startTick: 0, endTick: 480 },
    { note: 64, velocity: 110, startTick: 480, endTick: 960 },
  ]);
  const parsed = parseMidiBuffer(buf);
  const connector = createSmokeMockConnector();
  const controller = new PlaybackController(connector, parsed);
  const singD: VoiceDirective[] = [];
  const feedbackA: AsideDirective[] = [];
  const singHook = createSingOnMidiHook(async (d) => { singD.push(d); }, parsed, { mode: "solfege" });
  const fbHook = createLiveMidiFeedbackHook(async () => {}, async (d) => { feedbackA.push(d); }, parsed, { voiceInterval: 100 });
  const composed = composeTeachingHooks(singHook, fbHook);
  await controller.play({ speed: 100, teachingHook: composed });
  assert(singD.length > 0, "sing hook should produce directives");
});

// ─── Test 16: Vocal Synth Engine (additive synthesis presets) ────────────────
console.log("\nVocal synth engine:");
test("listVocalSynthPresets discovers bundled presets", () => {
  const presets = listVocalSynthPresets();
  assert(presets.length >= 2, `expected 2+ presets, got ${presets.length}`);
  assert(presets.includes("default-voice"), "should include default-voice");
});

// ─── Test 17: Layered Engine (fan-out connector) ────────────────────────────
console.log("\nLayered engine:");
test("createLayeredEngine fans out to multiple connectors", async () => {
  const log1: string[] = [];
  const log2: string[] = [];
  const mock1: VmpkConnector = {
    async connect() { log1.push("connect"); },
    async disconnect() { log1.push("disconnect"); },
    status(): MidiStatus { return "connected"; },
    listPorts() { return ["Piano"]; },
    noteOn(n: number, v: number) { log1.push(`on:${n}:${v}`); },
    noteOff(n: number) { log1.push(`off:${n}`); },
    allNotesOff() { log1.push("panic"); },
    async playNote(note: MidiNote) { log1.push(`play:${note.note}`); },
  };
  const mock2: VmpkConnector = {
    async connect() { log2.push("connect"); },
    async disconnect() { log2.push("disconnect"); },
    status(): MidiStatus { return "connected"; },
    listPorts() { return ["Synth"]; },
    noteOn(n: number, v: number) { log2.push(`on:${n}:${v}`); },
    noteOff(n: number) { log2.push(`off:${n}`); },
    allNotesOff() { log2.push("panic"); },
    async playNote(note: MidiNote) { log2.push(`play:${note.note}`); },
  };

  const layered = createLayeredEngine([mock1, mock2]);
  await layered.connect();
  assert(log1[0] === "connect" && log2[0] === "connect", "both should connect");

  layered.noteOn(60, 100);
  assert(log1.includes("on:60:100"), "mock1 should receive noteOn");
  assert(log2.includes("on:60:100"), "mock2 should receive noteOn");

  layered.noteOff(60);
  assert(log1.includes("off:60"), "mock1 should receive noteOff");
  assert(log2.includes("off:60"), "mock2 should receive noteOff");

  layered.allNotesOff();
  assert(log1.includes("panic"), "mock1 should receive allNotesOff");
  assert(log2.includes("panic"), "mock2 should receive allNotesOff");

  await layered.playNote({ note: 64, velocity: 80, durationMs: 10, channel: 0 });
  assert(log1.includes("play:64"), "mock1 should receive playNote");
  assert(log2.includes("play:64"), "mock2 should receive playNote");

  const ports = layered.listPorts();
  assert(ports.length === 2, `expected 2 ports, got ${ports.length}`);
  assert(ports[0] === "Layered:Piano", `expected Layered:Piano, got ${ports[0]}`);
  assert(ports[1] === "Layered:Synth", `expected Layered:Synth, got ${ports[1]}`);

  assert(layered.status() === "connected", "all connected → connected");

  await layered.disconnect();
  assert(log1.includes("disconnect") && log2.includes("disconnect"), "both should disconnect");
});

test("layered engine status reports worst status", () => {
  const makeStub = (s: MidiStatus): VmpkConnector => ({
    async connect() {},
    async disconnect() {},
    status() { return s; },
    listPorts() { return []; },
    noteOn() {},
    noteOff() {},
    allNotesOff() {},
    async playNote() {},
  });

  const l1 = createLayeredEngine([makeStub("connected"), makeStub("disconnected")]);
  assert(l1.status() === "disconnected", "should report disconnected");

  const l2 = createLayeredEngine([makeStub("connected"), makeStub("error")]);
  assert(l2.status() === "error", "should report error");

  const l3 = createLayeredEngine([makeStub("connected"), makeStub("connecting")]);
  assert(l3.status() === "connecting", "should report connecting");
});

// ─── Summary ────────────────────────────────────────────────────────────────

Promise.all(pending).then(() => {
  console.log(`\n${"─".repeat(40)}`);
  console.log(`Smoke: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log("All smoke tests passed\n");
});
