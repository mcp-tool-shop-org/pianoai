#!/usr/bin/env tsx
// Slice 1 one-off build: produces the single fur-elise:m001-008 record.
//
// Pipeline:
//   1. Smoke-test the trace validator against the Section 7 prototype.
//   2. Parse fur-elise.mid → notes with absolute ticks, tempo, time signature.
//   3. Compute timed_events for mm. 1–8 (with hand assignment by split point).
//   4. Render piano-roll SVG via existing renderer.
//   5. Build the Record object.
//   6. Validate: zod (RecordSchema) + inline provenance gate + trace validator.
//   7. Write record + SVG to datasets/jam-actions-v0/.
//
// Forbidden (Slice 1): bulk build, provenance scan, source verification,
// public release, MCP surface changes, annotate_song calls, separate
// provenance-gate / tokenizer / phrase-slicer modules. The Für Elise verdict
// is hardcoded inline with a TODO marker pointing to Slice 2.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseMidi } from "midi-file";

import { renderPianoRoll } from "../src/piano-roll.js";
import { midiToSongEntry } from "../src/songs/midi/ingest.js";
import { SongConfigSchema } from "../src/songs/config/schema.js";
import { midiNoteToScientific, DEFAULT_SPLIT_POINT } from "../src/songs/midi/hands.js";

import {
  RecordSchema,
  SCHEMA_VERSION,
  type Record as DatasetRecord,
  type TimedEvent,
  type Provenance,
} from "../src/dataset/schema.js";
import {
  loadToolSchemaCatalog,
  smokeTestValidator,
  validateTrace,
} from "../src/dataset/trace-validator.js";

// ─── Constants ───────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const SONG_ID = "fur-elise";
const START_MEASURE = 1;
const END_MEASURE = 8;
const RECORD_ID = `${SONG_ID}:m001-008:piano:mcp-session:v1`;
const SVG_RELATIVE_PATH = "pianoroll/fur-elise-m001-008.svg";

const SONG_JSON_PATH = join(REPO_ROOT, "songs/library/classical/fur-elise.json");
const MIDI_PATH = join(REPO_ROOT, "songs/library/classical/fur-elise.mid");
const DATASET_ROOT = join(REPO_ROOT, "datasets/jam-actions-v0");
const RECORD_OUT_PATH = join(DATASET_ROOT, "records/fur-elise-m001-008.json");
const SVG_OUT_PATH = join(DATASET_ROOT, SVG_RELATIVE_PATH);

// ─── Pipeline ────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("BUILD FAILED:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});

async function main(): Promise<void> {
  step("1/7", "Smoke-test trace validator against Section 7 prototype");
  const catalog = loadToolSchemaCatalog();
  const smoke = smokeTestValidator(catalog);
  if (!smoke.passed) {
    fail(
      "Smoke test FAILED — the synthesis Section 7 prototype trace does not validate against the real MCP surface. Either the validator has a bug or the prototype has drifted. Mismatches:\n" +
        JSON.stringify(smoke.report.mismatches, null, 2),
    );
  }
  console.log(
    `   ok — validated ${smoke.report.total_tool_calls} tool calls + ${smoke.report.total_tool_turns} tool turns against ${catalog.tool_count} tools`,
  );

  step("2/7", "Parse MIDI + extract notes with absolute ticks");
  const midiBuffer = readFileSync(MIDI_PATH);
  const midiSha256 = createHash("sha256").update(midiBuffer).digest("hex");
  const { ticksPerBeat, initialBpm, timeSig, notes } = extractMidiNotes(midiBuffer);
  console.log(
    `   ticksPerBeat=${ticksPerBeat}, tempo=${initialBpm} BPM, time_sig=${timeSig.numerator}/${timeSig.denominator}, notes=${notes.length}`,
  );

  step("3/7", `Filter notes to mm. ${START_MEASURE}–${END_MEASURE} and build timed_events`);
  const ticksPerMeasure = (ticksPerBeat * timeSig.numerator * 4) / timeSig.denominator;
  const phraseNotes = notes.filter((n) => {
    const measure = Math.floor(n.startTick / ticksPerMeasure) + 1;
    return measure >= START_MEASURE && measure <= END_MEASURE;
  });
  if (phraseNotes.length === 0) {
    fail(`No notes found in mm. ${START_MEASURE}–${END_MEASURE} — MIDI parse likely degenerate.`);
  }
  const timedEvents = phraseNotes.map((n): TimedEvent => {
    const measure = Math.floor(n.startTick / ticksPerMeasure) + 1;
    const tickInMeasure = n.startTick - (measure - 1) * ticksPerMeasure;
    const beat = tickInMeasure / ticksPerBeat;
    const secondsPerTick = 60 / initialBpm / ticksPerBeat;
    return {
      t_seconds: round6(n.startTick * secondsPerTick),
      t_ticks: n.startTick,
      dur_seconds: round6(n.durationTicks * secondsPerTick),
      dur_ticks: n.durationTicks,
      note: n.noteNumber,
      name: midiNoteToScientific(n.noteNumber),
      velocity: n.velocity,
      channel: n.channel,
      hand: n.noteNumber >= DEFAULT_SPLIT_POINT ? "right" : "left",
      measure,
      beat: round4(beat),
    };
  });
  console.log(`   ${timedEvents.length} timed_events built`);

  step("4/7", "Render piano-roll SVG via existing renderer");
  const songConfig = SongConfigSchema.parse(JSON.parse(readFileSync(SONG_JSON_PATH, "utf8")));
  const songEntry = midiToSongEntry(midiBuffer, songConfig);
  const svgInline = renderPianoRoll(songEntry, {
    startMeasure: START_MEASURE,
    endMeasure: END_MEASURE,
    colorMode: "hand",
  });
  mkdirSync(dirname(SVG_OUT_PATH), { recursive: true });
  writeFileSync(SVG_OUT_PATH, svgInline, "utf8");
  console.log(`   wrote ${SVG_OUT_PATH} (${svgInline.length} bytes)`);

  step("5/7", "Build full record");
  const provenance = furEliseProvenance();
  const record: DatasetRecord = {
    id: RECORD_ID,
    schema_version: SCHEMA_VERSION,
    provenance,
    scope: {
      song_id: SONG_ID,
      phrase_window: `measures ${START_MEASURE}-${END_MEASURE}`,
      instrument: "piano",
      key: songConfig.key,
      tempo_bpm: songEntry.tempo,
      time_signature: songEntry.timeSignature,
    },
    observation: {
      midi_sidecar: {
        midi_sha256: midiSha256,
        ticks_per_beat: ticksPerBeat,
        timed_events: timedEvents,
      },
      tokens_remi: {
        todo:
          "Install MidiTok (Python) or a JS REMI implementation. Out of Slice 1 scope per kickoff — wire in Slice 3.",
      },
      tokens_abc: {
        todo:
          "Wire a MIDI→ABC converter (e.g., abc-tools, midi2abc). Out of Slice 1 scope per kickoff — wire in Slice 3.",
      },
      piano_roll_svg_path: `./${SVG_RELATIVE_PATH}`,
      piano_roll_svg_inline: svgInline,
    },
    annotation_target: {
      measure_range: [START_MEASURE, END_MEASURE],
      structure: "A-theme opening, oscillating E-D# neighbor motion resolving to A",
      key_moments: [
        "m1 RH neighbor figure",
        "m4 cadence to E",
        "m5 restatement",
      ],
      teaching_goals: [
        "evenness of RH oscillation",
        "voice independence",
        "phrasing across cadence",
      ],
      style_tips: [
        "light cantabile touch",
        "do not rush the oscillation",
      ],
      teaching_notes: [
        {
          measure: 1,
          note: "The E–D# neighbor motion creates tension before resolving downward.",
          technique: ["light RH touch", "do not rush"],
        },
      ],
    },
    target_trace: {
      task_family: "analyze-and-play-phrase",
      objective:
        "Read mm. 1–8 of Für Elise, view the piano roll, analyze the opening figure, play the phrase in a loop, then produce a phrase annotation.",
      session: [
        {
          turn: 1,
          role: "user",
          content:
            "Read measures 1–8 of Für Elise and tell me what's happening musically before we play it.",
        },
        {
          turn: 2,
          role: "assistant",
          content: "Let me view the piano roll for mm. 1–8.",
          tool_calls: [
            {
              tool: "view_piano_roll",
              arguments: { songId: SONG_ID, startMeasure: START_MEASURE, endMeasure: END_MEASURE },
            },
          ],
        },
        {
          turn: 3,
          role: "tool",
          tool: "view_piano_roll",
          content: {
            svg_returned: true,
            measures: END_MEASURE - START_MEASURE + 1,
            rh_notes: timedEvents.filter((e) => e.hand === "right").length,
            lh_notes: timedEvents.filter((e) => e.hand === "left").length,
          },
        },
        {
          turn: 4,
          role: "assistant",
          content:
            "I can see the opening oscillation: RH alternates E5 and D#5 over an A-minor bassline. The motion is metric and quiet — it's the A-theme entrance. The phrase resolves at m. 4 with a half cadence to E, then restates from m. 5. Let me loop mm. 1–8 so you can hear the phrasing.",
          tool_calls: [
            {
              tool: "play_song",
              arguments: { id: SONG_ID, startMeasure: START_MEASURE, endMeasure: END_MEASURE, mode: "loop" },
            },
          ],
        },
        {
          turn: 5,
          role: "tool",
          tool: "play_song",
          content: { playback_started: true, mode: "loop" },
        },
        {
          turn: 6,
          role: "assistant",
          content:
            "Phrase summary — Für Elise mm. 1–8: A-theme opening. Oscillating E–D# neighbor motion in RH over A-minor bassline. Half cadence at m. 4, restated from m. 5. Teaching focus: evenness of RH oscillation, voice independence, light cantabile touch.",
        },
      ],
    },
    eval_metadata: {
      split: "train",
      split_strategy:
        "stratified by (composer, composition_id) with MIDI byte-hash dedup",
      leakage_check: "pending",
      eval_eligibility: ["E1_tool_use", "E3_annotation_grounding"],
      phrase_continuation_eligible: false,
      phrase_continuation_eligible_reason:
        "Record covers mm. 1–8 entirely; for E2 a separate record covering mm. 1–4 with mm. 5–8 held out is required.",
    },
  };

  step("6/7", "Validate record (schema + provenance gate + trace)");
  const schemaResult = RecordSchema.safeParse(record);
  if (!schemaResult.success) {
    fail(
      "Record FAILED RecordSchema (zod) validation:\n" +
        JSON.stringify(schemaResult.error.issues, null, 2),
    );
  }
  console.log("   schema:      PASS");

  const provenanceResult = furElisePublicCandidateGate(record.provenance);
  if (!provenanceResult.ok) {
    fail(`Provenance gate FAILED: ${provenanceResult.reason}`);
  }
  console.log(`   provenance:  PASS — verdict=${record.provenance.record_verdict}`);

  const traceReport = validateTrace(record.target_trace, catalog);
  if (!traceReport.ok) {
    fail(
      `Trace validator FAILED with ${traceReport.mismatches.length} mismatch(es):\n` +
        JSON.stringify(traceReport.mismatches, null, 2),
    );
  }
  console.log(
    `   trace:       PASS — ${traceReport.total_tool_calls} calls + ${traceReport.total_tool_turns} tool turns, 0 mismatches`,
  );

  step("7/7", "Write record JSON to disk");
  mkdirSync(dirname(RECORD_OUT_PATH), { recursive: true });
  writeFileSync(RECORD_OUT_PATH, JSON.stringify(record, null, 2) + "\n", "utf8");
  console.log(`   wrote ${RECORD_OUT_PATH}`);

  console.log("\nBUILD OK");
  console.log(`record_id           : ${record.id}`);
  console.log(`schema_version      : ${record.schema_version}`);
  console.log(`midi_sha256         : ${midiSha256}`);
  console.log(`record_verdict      : ${record.provenance.record_verdict}`);
  console.log(`tool_calls validated: ${traceReport.total_tool_calls}`);
  console.log(`tool turns          : ${traceReport.total_tool_turns}`);
  console.log(`timed_events        : ${timedEvents.length}`);
  console.log(`pianoroll svg       : ${SVG_OUT_PATH}`);
  console.log(`record path         : ${RECORD_OUT_PATH}`);
}

// ─── Inline provenance gate (Slice 1 — Für Elise hardcoded) ──────────────────
//
// TODO[Slice 2 — DONE]: The reusable rule engine now lives at
// src/dataset/provenance.ts (classifyProvenance). This inline gate is kept
// as-is per Slice 2 forbidden zones — rewiring the build script to use the
// rule engine is deferred to Slice 3 (real builder).
// See synthesis Section 5 verdict rules (tiered: public_candidate →
// public requires source-evidence verification).

function furElisePublicCandidateGate(p: Provenance): { ok: true } | { ok: false; reason: string } {
  if (p.composition_pd_status_us !== "public_domain") {
    return { ok: false, reason: "Composition must be PD in US (Für Elise: composed 1810, Beethoven d. 1827)" };
  }
  if (p.composition_pd_status_eu !== "public_domain") {
    return { ok: false, reason: "Composition must be PD in EU" };
  }
  if (!p.arrangement_creator) {
    return { ok: false, reason: "Arrangement creator must be named (not null) for public_candidate" };
  }
  if (!p.arrangement_license) {
    return { ok: false, reason: "Arrangement license must be set" };
  }
  if (!p.arrangement_evidence_url) {
    return { ok: false, reason: "Arrangement evidence URL must be set" };
  }
  if (p.record_verdict !== "public_candidate") {
    return {
      ok: false,
      reason: `Slice 1 expects record_verdict=public_candidate (verification deferred to Slice 2); got ${p.record_verdict}`,
    };
  }
  return { ok: true };
}

function furEliseProvenance(): Provenance {
  return {
    source_url: "https://piano-midi.de/",
    source_collected_at: "2026-05-16",
    source_type: "transcribed-by-author",
    composition_title: "Bagatelle No. 25 in A minor (Für Elise)",
    composer: "Ludwig van Beethoven",
    composition_year: 1810,
    composition_pd_status_us: "public_domain",
    composition_pd_status_eu: "public_domain",
    arrangement_creator: "Bernd Krueger",
    arrangement_license: "CC-BY-SA",
    arrangement_license_version: null,
    arrangement_evidence_url: "https://piano-midi.de/",
    record_verdict: "public_candidate",
    verdict_reason:
      "Composition PD US+EU. Arrangement credited to Bernd Krueger via piano-midi.de under CC BY-SA per repo song metadata (songs/library/classical/fur-elise.json `source` field). Initial public_candidate rules met. Awaiting Slice 2 verification: source URL resolves at verification time, license text preserved at source, license version (3.0 vs 4.0) determined. Until verified, treat as internal for distribution.",
    verifier: "auto-rule-engine[slice1-inline]",
    verified_at: "2026-05-16",
    training_use_permitted: true,
  };
}

// ─── MIDI extraction helpers ─────────────────────────────────────────────────

interface ExtractedNote {
  noteNumber: number;
  velocity: number;
  channel: number;
  startTick: number;
  durationTicks: number;
}

interface ExtractResult {
  ticksPerBeat: number;
  initialBpm: number;
  timeSig: { numerator: number; denominator: number };
  notes: ExtractedNote[];
}

function extractMidiNotes(buffer: Buffer): ExtractResult {
  const midi = parseMidi(buffer as any);
  const ticksPerBeat = midi.header.ticksPerBeat;
  if (!ticksPerBeat) {
    fail("MIDI uses SMPTE timing; ticksPerBeat required.");
  }

  let initialUspb = 500_000; // default 120 BPM
  let timeSig = { numerator: 4, denominator: 4 };
  let foundTempo = false;
  let foundTimeSig = false;

  for (const track of midi.tracks) {
    for (const event of track) {
      if (event.type === "setTempo" && !foundTempo) {
        initialUspb = (event as any).microsecondsPerBeat;
        foundTempo = true;
      }
      if (event.type === "timeSignature" && !foundTimeSig) {
        const e = event as any;
        timeSig = { numerator: e.numerator, denominator: e.denominator };
        foundTimeSig = true;
      }
    }
  }
  const initialBpm = Math.round((60_000_000 / initialUspb) * 100) / 100;

  const notes: ExtractedNote[] = [];
  for (const track of midi.tracks) {
    let tickCursor = 0;
    const pending = new Map<string, { startTick: number; velocity: number; channel: number }[]>();

    for (const event of track) {
      tickCursor += event.deltaTime;
      const isNoteOn = event.type === "noteOn" && (event as any).velocity > 0;
      const isNoteOff =
        event.type === "noteOff" || (event.type === "noteOn" && (event as any).velocity === 0);

      if (isNoteOn) {
        const e = event as any;
        const key = `${e.channel}-${e.noteNumber}`;
        if (!pending.has(key)) pending.set(key, []);
        pending.get(key)!.push({
          startTick: tickCursor,
          velocity: e.velocity,
          channel: e.channel,
        });
      } else if (isNoteOff) {
        const e = event as any;
        const key = `${e.channel}-${e.noteNumber}`;
        const stack = pending.get(key);
        if (stack && stack.length > 0) {
          const on = stack.shift()!;
          const durationTicks = Math.max(1, tickCursor - on.startTick);
          notes.push({
            noteNumber: e.noteNumber,
            velocity: on.velocity,
            channel: on.channel,
            startTick: on.startTick,
            durationTicks,
          });
        }
      }
    }
  }

  notes.sort((a, b) => a.startTick - b.startTick || a.noteNumber - b.noteNumber);

  return { ticksPerBeat, initialBpm, timeSig, notes };
}

// ─── Tiny helpers ────────────────────────────────────────────────────────────

function step(n: string, msg: string): void {
  console.log(`[${n}] ${msg}`);
}

function fail(msg: string): never {
  throw new Error(msg);
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}
