import { describe, it, expect } from "vitest";
import { getSong, initializeFromLibrary } from "./songs/index.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
initializeFromLibrary(join(__dirname, "..", "songs", "library"));
import {
  createConsoleTeachingHook,
  createSilentTeachingHook,
  createRecordingTeachingHook,
  createCallbackTeachingHook,
  createVoiceTeachingHook,
  createAsideTeachingHook,
  createSingAlongHook,
  createLiveFeedbackHook,
  composeTeachingHooks,
  detectKeyMoments,
} from "./teaching.js";
import { createSession } from "./session.js";
import { createMockVmpkConnector } from "./vmpk.js";
import type { VoiceDirective, AsideDirective } from "./types.js";

describe("detectKeyMoments", () => {
  const gymnopedie = getSong("satie-gymnopedie-no1")!;

  it("detects key moment at bar 1", () => {
    const moments = detectKeyMoments(gymnopedie, 1);
    expect(moments.length).toBeGreaterThan(0);
    expect(moments[0]).toContain("Bar 1");
  });

  it("detects key moment at bar 5", () => {
    const moments = detectKeyMoments(gymnopedie, 5);
    expect(moments.length).toBeGreaterThan(0);
    expect(moments[0]).toContain("Bar 5");
  });

  it("detects range key moment (7-8)", () => {
    const moments = detectKeyMoments(gymnopedie, 7);
    expect(moments.length).toBeGreaterThan(0);
    expect(moments[0]).toContain("7-8");
  });

  it("also matches bar 8 in the 7-8 range", () => {
    const moments = detectKeyMoments(gymnopedie, 8);
    expect(moments.length).toBeGreaterThan(0);
  });

  it("returns empty for non-key-moment bar", () => {
    const moments = detectKeyMoments(gymnopedie, 4);
    expect(moments.length).toBe(0);
  });

  it("works with fallin (different genre)", () => {
    const fallin = getSong("fallin")!;
    const bar1 = detectKeyMoments(fallin, 1);
    expect(bar1.length).toBeGreaterThan(0);
  });
});

describe("RecordingTeachingHook", () => {
  it("records measure-start events", async () => {
    const hook = createRecordingTeachingHook();
    await hook.onMeasureStart(1, "test note", "mf");
    expect(hook.events).toEqual([
      { type: "measure-start", measureNumber: 1, teachingNote: "test note", dynamics: "mf" },
    ]);
  });

  it("records key-moment events", async () => {
    const hook = createRecordingTeachingHook();
    await hook.onKeyMoment("Bar 1: something important");
    expect(hook.events[0].type).toBe("key-moment");
    expect(hook.events[0].moment).toContain("Bar 1");
  });

  it("records song-complete events", async () => {
    const hook = createRecordingTeachingHook();
    await hook.onSongComplete(8, "Test Song");
    expect(hook.events[0]).toEqual({
      type: "song-complete",
      measuresPlayed: 8,
      songTitle: "Test Song",
    });
  });

  it("records push events", async () => {
    const hook = createRecordingTeachingHook();
    await hook.push({ text: "Great job!", priority: "low", reason: "encouragement" });
    expect(hook.events[0].type).toBe("push");
    expect(hook.events[0].interjection?.text).toBe("Great job!");
  });
});

describe("CallbackTeachingHook", () => {
  it("routes to custom callbacks", async () => {
    const calls: string[] = [];
    const hook = createCallbackTeachingHook({
      onMeasureStart: async (n) => { calls.push(`measure-${n}`); },
      onKeyMoment: async (m) => { calls.push(`key-${m}`); },
    });

    await hook.onMeasureStart(3, undefined, undefined);
    await hook.onKeyMoment("test moment");

    expect(calls).toEqual(["measure-3", "key-test moment"]);
  });

  it("handles missing callbacks gracefully", async () => {
    const hook = createCallbackTeachingHook({});
    // These should not throw
    await hook.onMeasureStart(1, undefined, undefined);
    await hook.onKeyMoment("test");
    await hook.onSongComplete(4, "test");
    await hook.push({ text: "test", priority: "low", reason: "custom" });
  });
});

describe("SilentTeachingHook", () => {
  it("does nothing (no errors)", async () => {
    const hook = createSilentTeachingHook();
    await hook.onMeasureStart(1, "note", "ff");
    await hook.onKeyMoment("moment");
    await hook.onSongComplete(8, "song");
    await hook.push({ text: "text", priority: "high", reason: "custom" });
    // If we get here, it worked
  });
});

describe("Session + Teaching Hook integration", () => {
  it("fires teaching hooks during full playback", async () => {
    const mock = createMockVmpkConnector();
    const hook = createRecordingTeachingHook();
    const song = getSong("satie-gymnopedie-no1")!;
    const sc = createSession(song, mock, { teachingHook: hook });

    await mock.connect();
    await sc.play();

    // Should have measure-start events for all 79 measures
    const measureStarts = hook.events.filter((e) => e.type === "measure-start");
    expect(measureStarts.length).toBe(79);
    expect(measureStarts[0].measureNumber).toBe(1);
    expect(measureStarts[78].measureNumber).toBe(79);

    // Should have key-moment events (gymnopedie has moments at bars 1, 5, 7-8)
    const keyMoments = hook.events.filter((e) => e.type === "key-moment");
    expect(keyMoments.length).toBeGreaterThan(0);

    // Should have song-complete event
    const complete = hook.events.filter((e) => e.type === "song-complete");
    expect(complete.length).toBe(1);
    expect(complete[0].songTitle).toContain("Gymnopedie");
  });

  it("fires teaching hooks in measure mode", async () => {
    const mock = createMockVmpkConnector();
    const hook = createRecordingTeachingHook();
    const song = getSong("imagine")!;
    const sc = createSession(song, mock, { mode: "measure", teachingHook: hook });

    await mock.connect();
    await sc.play(); // plays one measure

    const measureStarts = hook.events.filter((e) => e.type === "measure-start");
    expect(measureStarts.length).toBe(1);
    expect(measureStarts[0].measureNumber).toBe(1);
    // No song-complete because we're paused
    expect(hook.events.filter((e) => e.type === "song-complete").length).toBe(0);
  });

  it("fires teaching hooks for each measure", async () => {
    const mock = createMockVmpkConnector();
    const hook = createRecordingTeachingHook();
    const song = getSong("satie-gymnopedie-no1")!;
    const sc = createSession(song, mock, { mode: "measure", teachingHook: hook });

    await mock.connect();
    await sc.play();

    // MIDI-ingested songs may not have teaching notes, but measure-start should fire
    const first = hook.events.find((e) => e.type === "measure-start");
    expect(first).toBeDefined();
    expect(first?.measureNumber).toBe(1);
  });
});

describe("VoiceTeachingHook", () => {
  it("produces voice directives from teaching notes", async () => {
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createVoiceTeachingHook(sink);

    await hook.onMeasureStart(1, "Watch your finger posture", "mf");
    expect(directives.length).toBe(1);
    expect(directives[0].text).toContain("Measure 1");
    expect(directives[0].text).toContain("Watch your finger posture");
    expect(directives[0].text).toContain("mf");
    expect(directives[0].blocking).toBe(false);
  });

  it("skips measure-start when no teaching note", async () => {
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createVoiceTeachingHook(sink);

    await hook.onMeasureStart(3, undefined, "pp");
    expect(directives.length).toBe(0);
  });

  it("speaks key moments with blocking", async () => {
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createVoiceTeachingHook(sink);

    await hook.onKeyMoment("Bar 1: the iconic 7th chords set the dreamy mood");
    expect(directives.length).toBe(1);
    expect(directives[0].blocking).toBe(true);
    expect(directives[0].text).toContain("7th chords");
  });

  it("speaks completion message", async () => {
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createVoiceTeachingHook(sink);

    await hook.onSongComplete(79, "Gymnopedie No. 1");
    expect(directives.length).toBe(1);
    expect(directives[0].text).toContain("Gymnopedie No. 1");
    expect(directives[0].text).toContain("79 measures");
  });

  it("respects speakTeachingNotes=false", async () => {
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createVoiceTeachingHook(sink, { speakTeachingNotes: false });

    await hook.onMeasureStart(1, "test note", "ff");
    expect(directives.length).toBe(0);
  });

  it("uses custom voice and speed", async () => {
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createVoiceTeachingHook(sink, { voice: "narrator", speechSpeed: 0.8 });

    await hook.onMeasureStart(1, "test note", undefined);
    expect(directives[0].voice).toBe("narrator");
    expect(directives[0].speed).toBe(0.8);
  });

  it("records directives on the hook object", async () => {
    const sink = async () => {};
    const hook = createVoiceTeachingHook(sink);

    await hook.onMeasureStart(1, "note", "mp");
    await hook.onKeyMoment("key moment");
    expect(hook.directives.length).toBe(2);
  });
});

describe("AsideTeachingHook", () => {
  it("produces aside directives from teaching notes", async () => {
    const directives: AsideDirective[] = [];
    const sink = async (d: AsideDirective) => { directives.push(d); };
    const hook = createAsideTeachingHook(sink);

    await hook.onMeasureStart(3, "Keep wrists relaxed", "mp");
    expect(directives.length).toBe(1);
    expect(directives[0].text).toContain("Measure 3");
    expect(directives[0].text).toContain("Keep wrists relaxed");
    expect(directives[0].priority).toBe("low");
    expect(directives[0].reason).toBe("measure-start");
    expect(directives[0].tags).toContain("piano-teacher");
    expect(directives[0].tags).toContain("teaching-note");
  });

  it("skips measure-start when no teaching note", async () => {
    const directives: AsideDirective[] = [];
    const sink = async (d: AsideDirective) => { directives.push(d); };
    const hook = createAsideTeachingHook(sink);

    await hook.onMeasureStart(2, undefined, "ff");
    expect(directives.length).toBe(0);
  });

  it("pushes key moments with med priority", async () => {
    const directives: AsideDirective[] = [];
    const sink = async (d: AsideDirective) => { directives.push(d); };
    const hook = createAsideTeachingHook(sink);

    await hook.onKeyMoment("Bar 5: dynamic shift");
    expect(directives[0].priority).toBe("med");
    expect(directives[0].tags).toContain("key-moment");
  });

  it("pushes song-complete", async () => {
    const directives: AsideDirective[] = [];
    const sink = async (d: AsideDirective) => { directives.push(d); };
    const hook = createAsideTeachingHook(sink);

    await hook.onSongComplete(12, "Blues");
    expect(directives[0].text).toContain("Blues");
    expect(directives[0].tags).toContain("completion");
  });

  it("respects pushTeachingNotes=false", async () => {
    const directives: AsideDirective[] = [];
    const sink = async (d: AsideDirective) => { directives.push(d); };
    const hook = createAsideTeachingHook(sink, { pushTeachingNotes: false });

    await hook.onMeasureStart(1, "note", "ff");
    expect(directives.length).toBe(0);
  });

  it("records directives on the hook object", async () => {
    const sink = async () => {};
    const hook = createAsideTeachingHook(sink);

    await hook.onMeasureStart(1, "note", "mp");
    await hook.onKeyMoment("key moment");
    expect(hook.directives.length).toBe(2);
  });
});

describe("composeTeachingHooks", () => {
  it("dispatches to all hooks in order", async () => {
    const calls: string[] = [];
    const hookA = createCallbackTeachingHook({
      onMeasureStart: async (n) => { calls.push(`A-measure-${n}`); },
    });
    const hookB = createCallbackTeachingHook({
      onMeasureStart: async (n) => { calls.push(`B-measure-${n}`); },
    });

    const composed = composeTeachingHooks(hookA, hookB);
    await composed.onMeasureStart(5, "test", "ff");

    expect(calls).toEqual(["A-measure-5", "B-measure-5"]);
  });

  it("dispatches key moments to all hooks", async () => {
    const recorder = createRecordingTeachingHook();
    const voiceDirectives: VoiceDirective[] = [];
    const voiceHook = createVoiceTeachingHook(async (d) => { voiceDirectives.push(d); });

    const composed = composeTeachingHooks(recorder, voiceHook);
    await composed.onKeyMoment("Bar 1: important moment");

    expect(recorder.events.length).toBe(1);
    expect(voiceDirectives.length).toBe(1);
  });

  it("dispatches song-complete to all hooks", async () => {
    const recorder = createRecordingTeachingHook();
    const asideDirectives: AsideDirective[] = [];
    const asideHook = createAsideTeachingHook(async (d) => { asideDirectives.push(d); });

    const composed = composeTeachingHooks(recorder, asideHook);
    await composed.onSongComplete(8, "Test Song");

    expect(recorder.events.length).toBe(1);
    expect(asideDirectives.length).toBe(1);
  });
});

describe("Voice + Session integration", () => {
  it("voice hook fires during full playback", async () => {
    const mock = createMockVmpkConnector();
    const voiceDirectives: VoiceDirective[] = [];
    const voiceHook = createVoiceTeachingHook(async (d) => { voiceDirectives.push(d); });
    const song = getSong("satie-gymnopedie-no1")!;
    const sc = createSession(song, mock, { teachingHook: voiceHook });

    await mock.connect();
    await sc.play();

    // Should have spoken key moments + completion
    expect(voiceDirectives.length).toBeGreaterThan(0);
    const completionMsg = voiceDirectives.find((d) => d.text.includes("Great work"));
    expect(completionMsg).toBeDefined();
  });

  it("composed voice + aside fires during playback", async () => {
    const mock = createMockVmpkConnector();
    const voiceDirectives: VoiceDirective[] = [];
    const asideDirectives: AsideDirective[] = [];
    const voiceHook = createVoiceTeachingHook(async (d) => { voiceDirectives.push(d); });
    const asideHook = createAsideTeachingHook(async (d) => { asideDirectives.push(d); });
    const composed = composeTeachingHooks(voiceHook, asideHook);

    const song = getSong("satie-gymnopedie-no1")!;
    const sc = createSession(song, mock, { teachingHook: composed });

    await mock.connect();
    await sc.play();

    // Both hooks should have received events
    expect(voiceDirectives.length).toBeGreaterThan(0);
    expect(asideDirectives.length).toBeGreaterThan(0);
  });
});

// ─── Sing-Along Hook ────────────────────────────────────────────────────────

describe("SingAlongHook", () => {
  it("produces note-name directives from measure data", async () => {
    const song = getSong("imagine")!;
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createSingAlongHook(sink, song, { mode: "note-names" });

    await hook.onMeasureStart(1, undefined, undefined);
    expect(directives.length).toBe(1);
    expect(directives[0].blocking).toBe(true);
    expect(directives[0].text).toContain("Measure 1:");
  });

  it("produces solfege directives", async () => {
    const song = getSong("imagine")!;
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createSingAlongHook(sink, song, { mode: "solfege" });

    await hook.onMeasureStart(1, undefined, undefined);
    expect(directives.length).toBe(1);
    // Should contain solfege syllables
    expect(directives[0].text).toMatch(/Do|Re|Mi|Fa|Sol|La|Ti/);
  });

  it("produces contour directives", async () => {
    const song = getSong("imagine")!;
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createSingAlongHook(sink, song, { mode: "contour" });

    await hook.onMeasureStart(1, undefined, undefined);
    expect(directives.length).toBe(1);
    expect(directives[0].text).toMatch(/up|down|same|hold/);
  });

  it("respects hand='left'", async () => {
    const song = getSong("imagine")!;
    const rhDirectives: VoiceDirective[] = [];
    const lhDirectives: VoiceDirective[] = [];

    const rhHook = createSingAlongHook(async (d) => { rhDirectives.push(d); }, song, { hand: "right" });
    const lhHook = createSingAlongHook(async (d) => { lhDirectives.push(d); }, song, { hand: "left" });

    await rhHook.onMeasureStart(1, undefined, undefined);
    await lhHook.onMeasureStart(1, undefined, undefined);

    expect(rhDirectives.length).toBe(1);
    expect(lhDirectives.length).toBe(1);
    // Different hands produce different text
    expect(rhDirectives[0].text).not.toBe(lhDirectives[0].text);
  });

  it("respects hand='both'", async () => {
    const song = getSong("imagine")!;
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createSingAlongHook(sink, song, { hand: "both" });

    await hook.onMeasureStart(1, undefined, undefined);
    expect(directives.length).toBe(1);
    expect(directives[0].text).toContain("Left hand:");
  });

  it("skips key moments and push", async () => {
    const song = getSong("imagine")!;
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createSingAlongHook(sink, song);

    await hook.onKeyMoment("test moment");
    await hook.push({ text: "test", priority: "low", reason: "custom" });
    expect(directives.length).toBe(0);
  });

  it("speaks completion when speakCompletion=true", async () => {
    const song = getSong("imagine")!;
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createSingAlongHook(sink, song);

    await hook.onSongComplete(57, "Imagine");
    expect(directives.length).toBe(1);
    expect(directives[0].text).toContain("Imagine");
    expect(directives[0].blocking).toBe(false);
  });

  it("skips completion when speakCompletion=false", async () => {
    const song = getSong("imagine")!;
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createSingAlongHook(sink, song, { speakCompletion: false });

    await hook.onSongComplete(57, "Imagine");
    expect(directives.length).toBe(0);
  });

  it("uses custom voice and speed", async () => {
    const song = getSong("imagine")!;
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createSingAlongHook(sink, song, { voice: "af_aoede", speechSpeed: 0.8 });

    await hook.onMeasureStart(1, undefined, undefined);
    expect(directives[0].voice).toBe("af_aoede");
    expect(directives[0].speed).toBe(0.8);
  });

  it("records directives on the hook object", async () => {
    const song = getSong("imagine")!;
    const sink = async () => {};
    const hook = createSingAlongHook(sink, song);

    await hook.onMeasureStart(1, undefined, undefined);
    await hook.onMeasureStart(2, undefined, undefined);
    expect(hook.directives.length).toBe(2);
  });

  it("suppresses measure number when announceMeasureNumber=false", async () => {
    const song = getSong("imagine")!;
    const directives: VoiceDirective[] = [];
    const sink = async (d: VoiceDirective) => { directives.push(d); };
    const hook = createSingAlongHook(sink, song, { announceMeasureNumber: false });

    await hook.onMeasureStart(1, undefined, undefined);
    expect(directives[0].text).not.toContain("Measure 1:");
  });

  it("composes with voice hook via composeTeachingHooks", async () => {
    const song = getSong("satie-gymnopedie-no1")!;
    const singDirectives: VoiceDirective[] = [];
    const voiceDirectives: VoiceDirective[] = [];
    const singHook = createSingAlongHook(async (d) => { singDirectives.push(d); }, song);
    const voiceHook = createVoiceTeachingHook(async (d) => { voiceDirectives.push(d); });
    const composed = composeTeachingHooks(singHook, voiceHook);

    await composed.onMeasureStart(1, "test teaching note", "mf");
    expect(singDirectives.length).toBe(1); // sing-along spoke
    expect(voiceDirectives.length).toBe(1); // voice hook spoke
  });
});

describe("Sing-Along + Session integration", () => {
  it("sing-along hook fires during full playback", async () => {
    const mock = createMockVmpkConnector();
    const song = getSong("fallin")!;
    const directives: VoiceDirective[] = [];
    const hook = createSingAlongHook(async (d) => { directives.push(d); }, song);
    const sc = createSession(song, mock, { teachingHook: hook });

    await mock.connect();
    await sc.play();

    // Should have one directive per measure + completion
    const measureCount = song.measures.length;
    expect(directives.length).toBe(measureCount + 1);
    expect(directives[0].blocking).toBe(true);
    expect(directives[directives.length - 1].blocking).toBe(false); // completion
  });
});

// ─── Live Feedback Hook ──────────────────────────────────────────────────────

describe("LiveFeedbackHook", () => {
  const gymnopedie = getSong("satie-gymnopedie-no1")!;

  it("emits voice directives at interval", async () => {
    const voiceD: VoiceDirective[] = [];
    const asideD: AsideDirective[] = [];
    const hook = createLiveFeedbackHook(
      async (d) => { voiceD.push(d); },
      async (d) => { asideD.push(d); },
      gymnopedie,
      { voiceInterval: 2 }
    );

    // Fire 4 measure starts
    await hook.onMeasureStart(1, undefined, undefined);
    await hook.onMeasureStart(2, undefined, undefined);
    await hook.onMeasureStart(3, undefined, undefined);
    await hook.onMeasureStart(4, undefined, undefined);

    // Should emit voice every 2 measures → measures 2 and 4
    const encouragements = voiceD.filter((d) => !d.text.startsWith("Watch"));
    expect(encouragements.length).toBe(2);
  });

  it("emits aside on dynamics change", async () => {
    const voiceD: VoiceDirective[] = [];
    const asideD: AsideDirective[] = [];
    const hook = createLiveFeedbackHook(
      async (d) => { voiceD.push(d); },
      async (d) => { asideD.push(d); },
      gymnopedie,
    );

    await hook.onMeasureStart(1, undefined, "pp");
    const dynamicsAsides = asideD.filter((d) => d.reason === "dynamics-change");
    expect(dynamicsAsides.length).toBe(1);
    expect(dynamicsAsides[0].text).toContain("Pianissimo");
  });

  it("does not emit aside when dynamics unchanged", async () => {
    const voiceD: VoiceDirective[] = [];
    const asideD: AsideDirective[] = [];
    const hook = createLiveFeedbackHook(
      async (d) => { voiceD.push(d); },
      async (d) => { asideD.push(d); },
      gymnopedie,
    );

    await hook.onMeasureStart(1, undefined, "mf");
    await hook.onMeasureStart(2, undefined, "mf"); // same dynamics
    const dynamicsAsides = asideD.filter((d) => d.reason === "dynamics-change");
    expect(dynamicsAsides.length).toBe(1); // only the first
  });

  it("emits aside on difficult passage warning", async () => {
    const voiceD: VoiceDirective[] = [];
    const asideD: AsideDirective[] = [];
    const hook = createLiveFeedbackHook(
      async (d) => { voiceD.push(d); },
      async (d) => { asideD.push(d); },
      gymnopedie,
    );

    await hook.onMeasureStart(5, "Watch your finger crossing here", undefined);
    const warnings = asideD.filter((d) => d.reason === "difficulty-warning");
    expect(warnings.length).toBe(1);
    expect(warnings[0].text).toContain("finger crossing");
  });

  it("fires voice on key moments", async () => {
    const voiceD: VoiceDirective[] = [];
    const asideD: AsideDirective[] = [];
    const hook = createLiveFeedbackHook(
      async (d) => { voiceD.push(d); },
      async (d) => { asideD.push(d); },
      gymnopedie,
    );

    await hook.onKeyMoment("Bar 1: gentle opening melody with 7th chords");
    expect(voiceD.length).toBe(1);
    expect(voiceD[0].text).toContain("Watch for this");
    expect(voiceD[0].blocking).toBe(false);
  });

  it("fires completion on song end with both voice and aside", async () => {
    const voiceD: VoiceDirective[] = [];
    const asideD: AsideDirective[] = [];
    const hook = createLiveFeedbackHook(
      async (d) => { voiceD.push(d); },
      async (d) => { asideD.push(d); },
      gymnopedie,
    );

    await hook.onSongComplete(79, "Gymnopedie No. 1");
    expect(voiceD.length).toBe(1);
    expect(voiceD[0].text).toContain("Fantastic");
    expect(asideD.length).toBe(1);
    expect(asideD[0].reason).toBe("session-complete");
  });

  it("respects encourageOnDynamics=false", async () => {
    const asideD: AsideDirective[] = [];
    const hook = createLiveFeedbackHook(
      async () => {},
      async (d) => { asideD.push(d); },
      gymnopedie,
      { encourageOnDynamics: false }
    );

    await hook.onMeasureStart(1, undefined, "ff");
    const dynamicsAsides = asideD.filter((d) => d.reason === "dynamics-change");
    expect(dynamicsAsides.length).toBe(0);
  });

  it("respects warnOnDifficult=false", async () => {
    const asideD: AsideDirective[] = [];
    const hook = createLiveFeedbackHook(
      async () => {},
      async (d) => { asideD.push(d); },
      gymnopedie,
      { warnOnDifficult: false }
    );

    await hook.onMeasureStart(1, "Watch your fingers here", undefined);
    const warnings = asideD.filter((d) => d.reason === "difficulty-warning");
    expect(warnings.length).toBe(0);
  });

  it("uses custom voice and speed", async () => {
    const voiceD: VoiceDirective[] = [];
    const hook = createLiveFeedbackHook(
      async (d) => { voiceD.push(d); },
      async () => {},
      gymnopedie,
      { voice: "narrator", speechSpeed: 0.9, voiceInterval: 1 }
    );

    await hook.onMeasureStart(1, undefined, undefined);
    expect(voiceD[0].voice).toBe("narrator");
    expect(voiceD[0].speed).toBe(0.9);
  });

  it("records directives on the hook object", async () => {
    const hook = createLiveFeedbackHook(
      async () => {},
      async () => {},
      gymnopedie,
      { voiceInterval: 1 }
    );

    await hook.onMeasureStart(1, undefined, "mf");
    await hook.onKeyMoment("test moment");
    expect(hook.voiceDirectives.length).toBeGreaterThan(0);
    expect(hook.asideDirectives.length).toBeGreaterThan(0);
  });

  it("composes with sing-along hook", async () => {
    const song = getSong("imagine")!;
    const singD: VoiceDirective[] = [];
    const feedbackVoiceD: VoiceDirective[] = [];
    const feedbackAsideD: AsideDirective[] = [];

    const singHook = createSingAlongHook(async (d) => { singD.push(d); }, song);
    const feedbackHook = createLiveFeedbackHook(
      async (d) => { feedbackVoiceD.push(d); },
      async (d) => { feedbackAsideD.push(d); },
      song,
      { voiceInterval: 2 }
    );
    const composed = composeTeachingHooks(singHook, feedbackHook);

    await composed.onMeasureStart(1, "Keep wrists relaxed", "mp");
    await composed.onMeasureStart(2, undefined, "mf");
    expect(singD.length).toBe(2);
    expect(feedbackVoiceD.length).toBe(1); // encouragement at measure 2
    expect(feedbackAsideD.length).toBeGreaterThan(0); // dynamics + possibly warning
  });
});

describe("LiveFeedback + Session integration", () => {
  it("live feedback hook fires during full playback", async () => {
    const mock = createMockVmpkConnector();
    const song = getSong("satie-gymnopedie-no1")!;
    const voiceD: VoiceDirective[] = [];
    const asideD: AsideDirective[] = [];
    const hook = createLiveFeedbackHook(
      async (d) => { voiceD.push(d); },
      async (d) => { asideD.push(d); },
      song,
      { voiceInterval: 4 }
    );
    const sc = createSession(song, mock, { teachingHook: hook });

    await mock.connect();
    await sc.play();

    // Should have periodic encouragements + key moment reactions + completion
    expect(voiceD.length).toBeGreaterThan(0);
    // Should have dynamics tips + completion aside
    expect(asideD.length).toBeGreaterThan(0);
    // Completion message should be present
    const completion = voiceD.find((d) => d.text.includes("Fantastic"));
    expect(completion).toBeDefined();
  });
});
