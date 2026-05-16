#!/usr/bin/env tsx
// ─── Slice 3 generalized pilot record builder ──────────────────────────────
//
// Builds all three Slice 3 pilot records using the real tokenizers:
//   1. fur-elise-m001-008     (replaces Slice 1 placeholder version)
//   2. bach-prelude-c-major-bwv846-m001-004  (new — mm. 1-4, arpeggiated opening)
//   3. mozart-k545-mvt1-m001-004             (new — mm. 1-4, iconic opening theme)
//
// Phrase selection rationale:
//   - Für Elise mm. 1–8: unchanged from Slice 1 (synthesis anchor record).
//   - Bach Prelude mm. 1–4: the four canonical opening measures establish the
//     complete arpeggiated pattern template that repeats throughout the piece.
//     Mm. 1–4 capture the full pattern cycle (C-Am-D7-G) — the minimal unit that
//     demonstrates the piece's pedagogical texture.
//   - Mozart K545 mm. 1–4: the first 4 measures contain the complete opening theme
//     statement (C-major scale ascent m.1 + melodic development mm. 2-4) before
//     the phrase closes. Standard pedagogical "first phrase" as defined by Schenkerian
//     analysis of the exposition.
//
// Pipeline per record:
//   1. Parse MIDI → notes.
//   2. slicePhrase → filtered TimedEvents + PhraseMeta.
//   3. toRemi → real REMI token strings.
//   4. toAbc → real ABC notation string.
//   5. Render SVG via existing renderPianoRoll.
//   6. Build Record object with real provenance (via provenance.ts rule engine).
//   7. Validate via makeRecordSchema({ allow_placeholders: false }) — hard proof.
//   8. Validate trace (trace-validator).
//   9. Write JSON + SVG.
//
// Usage:
//   npx tsx scripts/build-pilot-records.ts [--dry-run]
//   --dry-run: validate + print but do not write files.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseMidi } from "midi-file";

import { renderPianoRoll } from "../src/piano-roll.js";
import { midiToSongEntry } from "../src/songs/midi/ingest.js";
import { SongConfigSchema } from "../src/songs/config/schema.js";
import { midiNoteToScientific, DEFAULT_SPLIT_POINT } from "../src/songs/midi/hands.js";
import { classifyProvenance } from "../src/dataset/provenance.js";

import { slicePhrase } from "../src/dataset/phrase-slicer.js";
import { toRemi } from "../src/dataset/remi-adapter.js";
import { toAbc } from "../src/dataset/abc-adapter.js";

import {
  makeRecordSchema,
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
const DATASET_ROOT = join(REPO_ROOT, "datasets/jam-actions-v0");
const CLASSICAL_DIR = join(REPO_ROOT, "songs/library/classical");

const DRY_RUN = process.argv.includes("--dry-run");

// ─── Record definitions ───────────────────────────────────────────────────────

interface RecordSpec {
  songId: string;
  songJsonPath: string;
  midiPath: string;
  startMeasure: number;
  endMeasure: number;
  recordId: string;
  svgRelativePath: string;
  /** Used for provenance classification. */
  composerDeathYear: number;
  compositionYear: number;
  /** Human annotation target — static for each song. */
  annotation: {
    structure: string;
    key_moments: string[];
    teaching_goals: string[];
    style_tips: string[];
    teaching_notes: Array<{ measure: number; note: string; technique?: string[] }>;
  };
  /** Target trace session (static per song — same pedagogical template). */
  traceObjective: string;
  traceUserPrompt: string;
  traceAssistantAnalysis: string;
  traceSummary: string;
}

const RECORD_SPECS: RecordSpec[] = [
  {
    songId: "fur-elise",
    songJsonPath: join(CLASSICAL_DIR, "fur-elise.json"),
    midiPath: join(CLASSICAL_DIR, "fur-elise.mid"),
    startMeasure: 1,
    endMeasure: 8,
    recordId: "fur-elise:m001-008:piano:mcp-session:v1",
    svgRelativePath: "pianoroll/fur-elise-m001-008.svg",
    composerDeathYear: 1827, // Beethoven
    compositionYear: 1810,
    annotation: {
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
    traceObjective:
      "Read mm. 1–8 of Für Elise, view the piano roll, analyze the opening figure, play the phrase in a loop, then produce a phrase annotation.",
    traceUserPrompt:
      "Read measures 1–8 of Für Elise and tell me what's happening musically before we play it.",
    traceAssistantAnalysis:
      "I can see the opening oscillation: RH alternates E5 and D#5 over an A-minor bassline. The motion is metric and quiet — it's the A-theme entrance. The phrase resolves at m. 4 with a half cadence to E, then restates from m. 5. Let me loop mm. 1–8 so you can hear the phrasing.",
    traceSummary:
      "Phrase summary — Für Elise mm. 1–8: A-theme opening. Oscillating E–D# neighbor motion in RH over A-minor bassline. Half cadence at m. 4, restated from m. 5. Teaching focus: evenness of RH oscillation, voice independence, light cantabile touch.",
  },
  {
    songId: "bach-prelude-c-major-bwv846",
    songJsonPath: join(CLASSICAL_DIR, "bach-prelude-c-major-bwv846.json"),
    midiPath: join(CLASSICAL_DIR, "bach-prelude-c-major-bwv846.mid"),
    startMeasure: 1,
    endMeasure: 4,
    recordId: "bach-prelude-c-major-bwv846:m001-004:piano:mcp-session:v1",
    svgRelativePath: "pianoroll/bach-prelude-c-major-bwv846-m001-004.svg",
    composerDeathYear: 1750, // J.S. Bach
    compositionYear: 1722,
    annotation: {
      structure:
        "Opening arpeggiated pattern — four-measure harmonic template establishing the prelude's texture (C major – A minor – D7 – G major)",
      key_moments: [
        "m1 C major arpeggio — tonic statement (C-E-G-C-E pattern)",
        "m2 A minor — relative minor color shift",
        "m3 D minor7 — subdominant approach",
        "m4 G major — dominant resolution sets up return",
      ],
      teaching_goals: [
        "perfectly even rhythm across all 16th-note arpeggios",
        "harmonic awareness within repeating patterns",
        "smooth voice-leading as chord changes",
      ],
      style_tips: [
        "equal weight on every note — no accent on beat 1",
        "let the harmonic changes do the phrasing",
        "minimal rubato — the flow is the beauty",
      ],
      teaching_notes: [
        {
          measure: 1,
          note: "Each measure is one chord split into 16th notes — hear the harmony, not individual notes.",
          technique: ["even finger pressure", "wrist relaxed"],
        },
        {
          measure: 3,
          note: "The D minor7 chord adds the first chromatic color (F#→F natural); listen for the subtle shift.",
          technique: ["legato connection to m.4"],
        },
      ],
    },
    traceObjective:
      "Read mm. 1–4 of the Bach C Major Prelude, view the piano roll, analyze the arpeggiated harmonic pattern, play the phrase in a loop, then produce a phrase annotation.",
    traceUserPrompt:
      "Read measures 1–4 of the Bach C Major Prelude and describe what's happening musically.",
    traceAssistantAnalysis:
      "The prelude opens with a flowing arpeggiated texture — each measure is a single chord broken into 16th notes. I can see four distinct chord shapes: m.1 C major (C-E-G-C-E), m.2 A minor (C-E-A), m.3 D minor7 (D-F-A-C), m.4 G major with a leading seventh (B-D-G). The harmonic rhythm is exactly one chord per measure — very transparent. Let me loop mm. 1–4 so you can hear the pattern.",
    traceSummary:
      "Phrase summary — Bach C Major Prelude mm. 1–4: arpeggiated opening template. Four measures, four chords (C-Am-Dm7-G). Teaching focus: even 16th-note rhythm, harmonic awareness within the arpeggio pattern, smooth legato through chord changes.",
  },
  {
    songId: "mozart-k545-mvt1",
    songJsonPath: join(CLASSICAL_DIR, "mozart-k545-mvt1.json"),
    midiPath: join(CLASSICAL_DIR, "mozart-k545-mvt1.mid"),
    startMeasure: 1,
    endMeasure: 4,
    recordId: "mozart-k545-mvt1:m001-004:piano:mcp-session:v1",
    svgRelativePath: "pianoroll/mozart-k545-mvt1-m001-004.svg",
    composerDeathYear: 1791, // Mozart
    compositionYear: 1788,
    annotation: {
      structure:
        "Opening theme — ascending C major scale statement (m.1) followed by melodic response over Alberti bass (mm. 2–4)",
      key_moments: [
        "m1 iconic ascending scale C5→C6 — tonic statement",
        "m2 melodic E5→B4 descent over Alberti bass (G-C-E pattern)",
        "m3 D5 peak — subdominant coloring",
        "m4 half cadence on G — phrase closes on dominant, prepares repeat",
      ],
      teaching_goals: [
        "sonata form first-theme identification",
        "Alberti bass pattern evenness (LH C-G-E-G-C-G-E-G)",
        "Classical-era touch and articulation — clean, vocal phrasing",
      ],
      style_tips: [
        "clean even articulation — no pedal abuse",
        "Alberti bass light and even — never louder than melody",
        "phrasing should be elegant and vocal, not percussive",
      ],
      teaching_notes: [
        {
          measure: 1,
          note: "The ascending scale to high C is Mozart's calling card — pure and bright, no slur.",
          technique: ["even finger pressure", "slight taper at peak C"],
        },
        {
          measure: 2,
          note: "LH Alberti pattern: C-G-E-G repeated — keep it light so RH melody sings.",
          technique: ["LH pp under RH melody", "wrist loose for Alberti pattern"],
        },
      ],
    },
    traceObjective:
      "Read mm. 1–4 of Mozart K545 Movement 1, view the piano roll, analyze the opening theme, play the phrase in a loop, then produce a phrase annotation.",
    traceUserPrompt:
      "Read measures 1–4 of Mozart's K545 first movement and explain what's happening musically.",
    traceAssistantAnalysis:
      "The opening is immediately recognizable: m.1 has an ascending C major scale from C5 to C6 in the RH, while the LH begins its characteristic Alberti bass (alternating C-G-E-G pattern). Mm. 2–4 develop the melody downward with E5→D5→B4, closing on a half cadence at m.4 on the dominant G. The texture is completely transparent — thin Classical style, melody over harmonic support. Let me loop mm. 1–4 so you can hear the phrase shape.",
    traceSummary:
      "Phrase summary — Mozart K545 mm. 1–4: opening theme, C major. Ascending scale m.1 + melodic descent mm. 2–4 over Alberti bass. Half cadence at m.4. Teaching focus: Alberti bass evenness, Classical articulation, vocal phrasing.",
  },
];

// ─── Main ────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("BUILD FAILED:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});

async function main(): Promise<void> {
  step("0", "Smoke-test trace validator against Section 7 prototype");
  const catalog = loadToolSchemaCatalog();
  const smoke = smokeTestValidator(catalog);
  if (!smoke.passed) {
    fail(
      "Smoke test FAILED — Section 7 prototype trace does not validate against real MCP surface:\n" +
        JSON.stringify(smoke.report.mismatches, null, 2),
    );
  }
  console.log(`   ok — ${smoke.report.total_tool_calls} tool calls + ${smoke.report.total_tool_turns} tool turns`);

  for (const spec of RECORD_SPECS) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`Building: ${spec.recordId}`);
    console.log(`${"─".repeat(60)}`);
    await buildRecord(spec, catalog);
  }

  console.log("\nALL RECORDS BUILT OK");
}

// ─── Record builder ───────────────────────────────────────────────────────────

async function buildRecord(
  spec: RecordSpec,
  catalog: ReturnType<typeof loadToolSchemaCatalog>,
): Promise<void> {
  step("1", `Parse MIDI: ${spec.midiPath}`);
  const midiBuffer = readFileSync(spec.midiPath);
  const midiSha256 = createHash("sha256").update(midiBuffer).digest("hex");
  const { ticksPerBeat, initialBpm, timeSig, notes } = extractMidiNotes(midiBuffer);
  console.log(
    `   ticksPerBeat=${ticksPerBeat}, tempo≈${initialBpm} BPM, time_sig=${timeSig.numerator}/${timeSig.denominator}, total_notes=${notes.length}`,
  );

  step("2", `Build timed_events for all notes in mm. ${spec.startMeasure}–${spec.endMeasure}`);
  const ticksPerMeasure = (ticksPerBeat * timeSig.numerator * 4) / timeSig.denominator;
  const secondsPerTick = 60 / initialBpm / ticksPerBeat;

  const timedEvents: TimedEvent[] = notes
    .filter((n) => {
      const measure = Math.floor(n.startTick / ticksPerMeasure) + 1;
      return measure >= spec.startMeasure && measure <= spec.endMeasure;
    })
    .map((n): TimedEvent => {
      const measure = Math.floor(n.startTick / ticksPerMeasure) + 1;
      const tickInMeasure = n.startTick - (measure - 1) * ticksPerMeasure;
      const beat = tickInMeasure / ticksPerBeat;
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

  if (timedEvents.length === 0) {
    fail(`No notes found in mm. ${spec.startMeasure}–${spec.endMeasure} — MIDI parse likely degenerate.`);
  }
  console.log(`   ${timedEvents.length} timed_events`);

  step("3", "Slice phrase via phrase-slicer");
  const slice = slicePhrase(timedEvents, {
    start_measure: spec.startMeasure,
    end_measure: spec.endMeasure,
  });
  console.log(
    `   events=${slice.meta.event_count}, measures=${slice.meta.measure_count}, ticks ${slice.meta.start_tick}–${slice.meta.end_tick}`,
  );

  step("4", "Tokenize REMI via remi-adapter");
  const remiTokens = toRemi(slice.events, slice.meta, {
    timeSignature: `${timeSig.numerator}/${timeSig.denominator}`,
    ticksPerBeat,
  });
  console.log(`   ${remiTokens.length} REMI tokens`);
  console.log(`   first 12: ${remiTokens.slice(0, 12).join(" ")}`);

  step("5", "Generate ABC notation via abc-adapter");
  const songConfig = SongConfigSchema.parse(
    JSON.parse(readFileSync(spec.songJsonPath, "utf8")),
  );
  const timeSignatureStr = `${timeSig.numerator}/${timeSig.denominator}`;
  const abcString = toAbc(slice.events, slice.meta, {
    key: songConfig.key,
    timeSignature: timeSignatureStr,
    tempoBpm: Math.round(initialBpm),
    title: songConfig.title,
  });
  console.log(`   ABC string: ${abcString.length} chars`);
  console.log(`   first line: ${abcString.split("\n").find(l => l.startsWith("|"))?.slice(0, 80) ?? "(no bar)"}`);

  step("6", "Render SVG");
  const songEntry = midiToSongEntry(midiBuffer, songConfig);
  const svgInline = renderPianoRoll(songEntry, {
    startMeasure: spec.startMeasure,
    endMeasure: spec.endMeasure,
    colorMode: "hand",
  });
  console.log(`   SVG: ${svgInline.length} bytes`);

  step("7", "Run provenance rule engine");
  const provResult = classifyProvenance({
    source: songConfig.source,
    composition: {
      title: songConfig.title,
      composer: songConfig.composer,
      compositionYear: spec.compositionYear,
      composerDeathYear: spec.composerDeathYear,
    },
    scanDate: "2026-05-16",
  });
  console.log(
    `   verdict=${provResult.verdict}, us=${provResult.composition_pd_status_us}, eu=${provResult.composition_pd_status_eu}`,
  );

  if (provResult.verdict === "excluded") {
    fail(`Provenance rule engine rejected ${spec.songId}: ${provResult.verdict_reason}`);
  }

  const provenance: Provenance = {
    source_url: provResult.extracted.arrangement_evidence_url ?? "https://piano-midi.de/",
    source_collected_at: "2026-05-16",
    source_type: "transcribed-by-author",
    composition_title: songConfig.title,
    composer: songConfig.composer,
    composition_year: spec.compositionYear,
    composition_pd_status_us: provResult.composition_pd_status_us,
    composition_pd_status_eu: provResult.composition_pd_status_eu,
    arrangement_creator: provResult.extracted.arrangement_creator,
    arrangement_license: provResult.extracted.arrangement_license,
    arrangement_license_version: null,
    arrangement_evidence_url: provResult.extracted.arrangement_evidence_url,
    record_verdict: provResult.verdict,
    verdict_reason: provResult.verdict_reason,
    verifier: "auto-rule-engine",
    verified_at: "2026-05-16",
    training_use_permitted: true,
  };

  step("8", "Build record");
  const rhEvents = slice.events.filter((e) => e.hand === "right");
  const lhEvents = slice.events.filter((e) => e.hand === "left");

  const record: DatasetRecord = {
    id: spec.recordId,
    schema_version: SCHEMA_VERSION,
    provenance,
    scope: {
      song_id: spec.songId,
      phrase_window: `measures ${spec.startMeasure}-${spec.endMeasure}`,
      instrument: "piano",
      key: songConfig.key,
      tempo_bpm: Math.round(initialBpm),
      time_signature: timeSignatureStr,
    },
    observation: {
      midi_sidecar: {
        midi_sha256: midiSha256,
        ticks_per_beat: ticksPerBeat,
        timed_events: timedEvents,
      },
      tokens_remi: remiTokens,
      tokens_abc: abcString,
      piano_roll_svg_path: `pianoroll/${spec.svgRelativePath.split("/").pop()}`,
      piano_roll_svg_inline: svgInline,
    },
    annotation_target: {
      measure_range: [spec.startMeasure, spec.endMeasure],
      structure: spec.annotation.structure,
      key_moments: spec.annotation.key_moments,
      teaching_goals: spec.annotation.teaching_goals,
      style_tips: spec.annotation.style_tips,
      teaching_notes: spec.annotation.teaching_notes,
    },
    target_trace: {
      task_family: "analyze-and-play-phrase",
      objective: spec.traceObjective,
      session: [
        {
          turn: 1,
          role: "user",
          content: spec.traceUserPrompt,
        },
        {
          turn: 2,
          role: "assistant",
          content: `Let me view the piano roll for mm. ${spec.startMeasure}–${spec.endMeasure}.`,
          tool_calls: [
            {
              tool: "view_piano_roll",
              arguments: {
                songId: spec.songId,
                startMeasure: spec.startMeasure,
                endMeasure: spec.endMeasure,
              },
            },
          ],
        },
        {
          turn: 3,
          role: "tool",
          tool: "view_piano_roll",
          content: {
            svg_returned: true,
            measures: spec.endMeasure - spec.startMeasure + 1,
            rh_notes: rhEvents.length,
            lh_notes: lhEvents.length,
          },
        },
        {
          turn: 4,
          role: "assistant",
          content: spec.traceAssistantAnalysis,
          tool_calls: [
            {
              tool: "play_song",
              arguments: {
                id: spec.songId,
                startMeasure: spec.startMeasure,
                endMeasure: spec.endMeasure,
                mode: "loop",
              },
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
          content: spec.traceSummary,
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
      phrase_continuation_eligible_reason: `Record covers mm. ${spec.startMeasure}–${spec.endMeasure} entirely; for E2 a separate record with held-out measures is required.`,
    },
  };

  step("9", "Validate record — strict (no placeholders allowed)");
  const strictSchema = makeRecordSchema({ allow_placeholders: false });
  const schemaResult = strictSchema.safeParse(record);
  if (!schemaResult.success) {
    fail(
      "Record FAILED strict schema validation (no placeholders):\n" +
        JSON.stringify(schemaResult.error.issues, null, 2),
    );
  }
  console.log("   schema (strict): PASS");

  const traceReport = validateTrace(record.target_trace, catalog);
  if (!traceReport.ok) {
    fail(
      `Trace validator FAILED:\n` +
        JSON.stringify(traceReport.mismatches, null, 2),
    );
  }
  console.log(`   trace: PASS — ${traceReport.total_tool_calls} calls, 0 mismatches`);

  if (DRY_RUN) {
    console.log("   [dry-run] would write files but skipping.");
    return;
  }

  step("10", "Write files");
  mkdirSync(join(DATASET_ROOT, "records"), { recursive: true });
  mkdirSync(join(DATASET_ROOT, "pianoroll"), { recursive: true });

  const recordFileName = buildRecordFileName(spec);
  const recordPath = join(DATASET_ROOT, "records", recordFileName);
  const svgPath = join(DATASET_ROOT, spec.svgRelativePath);

  writeFileSync(recordPath, JSON.stringify(record, null, 2) + "\n", "utf8");
  writeFileSync(svgPath, svgInline, "utf8");

  console.log(`   record: ${recordPath}`);
  console.log(`   svg:    ${svgPath}`);
  console.log(`   remi:   ${remiTokens.length} tokens`);
  console.log(`   abc:    ${abcString.split("\n").length} lines`);
}

// ─── MIDI extraction ──────────────────────────────────────────────────────────

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
  if (!ticksPerBeat) fail("MIDI uses SMPTE timing; ticksPerBeat required.");

  let initialUspb = 500_000;
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
    const pending = new Map<string, Array<{ startTick: number; velocity: number; channel: number }>>();
    for (const event of track) {
      tickCursor += event.deltaTime;
      const isNoteOn = event.type === "noteOn" && (event as any).velocity > 0;
      const isNoteOff =
        event.type === "noteOff" || (event.type === "noteOn" && (event as any).velocity === 0);
      if (isNoteOn) {
        const e = event as any;
        const key = `${e.channel}-${e.noteNumber}`;
        if (!pending.has(key)) pending.set(key, []);
        pending.get(key)!.push({ startTick: tickCursor, velocity: e.velocity, channel: e.channel });
      } else if (isNoteOff) {
        const e = event as any;
        const key = `${e.channel}-${e.noteNumber}`;
        const stack = pending.get(key);
        if (stack && stack.length > 0) {
          const on = stack.shift()!;
          notes.push({
            noteNumber: e.noteNumber,
            velocity: on.velocity,
            channel: on.channel,
            startTick: on.startTick,
            durationTicks: Math.max(1, tickCursor - on.startTick),
          });
        }
      }
    }
  }
  notes.sort((a, b) => a.startTick - b.startTick || a.noteNumber - b.noteNumber);
  return { ticksPerBeat, initialBpm, timeSig, notes };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildRecordFileName(spec: RecordSpec): string {
  const m = (n: number) => String(n).padStart(3, "0");
  return `${spec.songId}-m${m(spec.startMeasure)}-${m(spec.endMeasure)}.json`;
}

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
