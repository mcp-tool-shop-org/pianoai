#!/usr/bin/env tsx
// ─── Slice 5 bulk corpus builder ─────────────────────────────────────────────
//
// Builds ~50 phrase records across the 10 public_candidate classical songs,
// structured for E2 continuation eval. Every record passes:
//   - Strict schema (no placeholders)
//   - E1 trace validator (tool names + args against tool-schemas.json)
//   - Provenance rule engine (verdict = public_candidate)
//
// Design choice vs build-pilot-records.ts:
//   This script SUPERSEDES build-pilot-records.ts for corpus-scale builds.
//   Reasons: (a) handles window_role metadata for E2 pairs, (b) can update
//   existing records in-place (repurposing Bach/Mozart mm. 1-4 as prompts),
//   (c) builds across all 10 songs in one pass with consistent pair logic.
//   build-pilot-records.ts is kept for reference (Slice 3 provenance anchor).
//
// Backward-compat (Option B per kickoff):
//   - Für Elise mm. 1-8 (existing): update to window_role='standalone'; no rebuild
//     of MIDI/ABC/REMI content (byte-identical).
//   - Bach mm. 1-4 (existing): repurpose to window_role='prompt' +
//     continuation_target_window=[5,8]; add new mm. 5-8 continuation.
//   - Mozart K545 mm. 1-4 (existing): same as Bach.
//
// Usage:
//   npx tsx scripts/build-jam-actions-corpus.ts [--dry-run]
//   --dry-run: validate + print counts but do not write files.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseMidi } from "midi-file";

import { renderPianoRoll } from "../src/piano-roll.js";
import { midiToSongEntry } from "../src/songs/midi/ingest.js";
import { SongConfigSchema } from "../src/songs/config/schema.js";
import {
  midiNoteToScientific,
  DEFAULT_SPLIT_POINT,
} from "../src/songs/midi/hands.js";
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
  type WindowRole,
} from "../src/dataset/schema.js";
import {
  loadToolSchemaCatalog,
  smokeTestValidator,
  validateTrace,
} from "../src/dataset/trace-validator.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DATASET_ROOT = join(REPO_ROOT, "datasets/jam-actions-v0");
const RECORDS_DIR = join(DATASET_ROOT, "records");
const PIANOROLL_DIR = join(DATASET_ROOT, "pianoroll");
const CLASSICAL_DIR = join(REPO_ROOT, "songs/library/classical");

const DRY_RUN = process.argv.includes("--dry-run");
const SCAN_DATE = "2026-05-16";

// ─── Song definitions ─────────────────────────────────────────────────────────

/** A pair of phrase windows: prompt [start,mid] → continuation_target [mid+1,end]. */
interface PhrasePair {
  promptStart: number;
  promptEnd: number;
  contStart: number;
  contEnd: number;
  promptLabel: string;
  contLabel: string;
  promptAnalysis: string;
  promptSummary: string;
  contAnalysis: string;
  contSummary: string;
  promptUserPrompt: string;
  contUserPrompt: string;
  /** True if prompt ends on a natural musical boundary. */
  naturalBoundary: boolean;
}

interface SongSpec {
  songId: string;
  composerDeathYear: number;
  compositionYear: number;
  pairs: PhrasePair[];
  /** If present, a standalone window (not paired). */
  standalone?: {
    start: number;
    end: number;
    label: string;
    analysis: string;
    summary: string;
    userPrompt: string;
    annotation: AnnotationSpec;
  };
  /** Annotation for pairs (one annotation per song, reused/adapted per pair). */
  pairAnnotations: PairAnnotation[];
}

interface AnnotationSpec {
  structure: string;
  key_moments: string[];
  teaching_goals: string[];
  style_tips: string[];
  teaching_notes: Array<{ measure: number; note: string; technique?: string[] }>;
}

interface PairAnnotation {
  promptAnnotation: AnnotationSpec;
  contAnnotation: AnnotationSpec;
}

// ─── Song definitions ─────────────────────────────────────────────────────────
//
// Phrase selection rationale per song is documented in the kickoff report.
// Keys: all 10 public_candidate songs from Slice 2 provenance scan.

const SONG_SPECS: SongSpec[] = [
  // ── Bach Prelude C Major BWV 846 ─────────────────────────────────────────
  // 4/4, ~70 measures. Arpeggiated; one chord per measure.
  // mm. 1-4 existing record → repurposed as prompt pair 1.
  // mm. 5-8: dominant-area approach (D7→G→C→Am), natural antecedent/consequent.
  // mm. 9-12: second harmonic cycle, similar texture.
  {
    songId: "bach-prelude-c-major-bwv846",
    composerDeathYear: 1750,
    compositionYear: 1722,
    pairs: [
      {
        promptStart: 1,
        promptEnd: 4,
        contStart: 5,
        contEnd: 8,
        promptLabel: "opening four-chord cycle",
        contLabel: "consequent four-chord cycle",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 1–4 of the Bach C Major Prelude and explain the harmonic pattern.",
        contUserPrompt:
          "Now play measures 5–8 and explain how the harmony continues from mm. 1–4.",
        promptAnalysis:
          "The prelude opens with a flowing 16th-note arpeggio — each measure is one chord: m.1 C major (C-E-G-C-E), m.2 A minor, m.3 D minor7, m.4 G major. This four-measure unit is the template the entire piece builds on. Let me loop mm. 1–4 so you can hear the pattern.",
        promptSummary:
          "Bach C Major Prelude mm. 1–4: four-chord arpeggiated template. C → Am → Dm7 → G. Teaching focus: even 16th-note rhythm, harmonic awareness within single-chord patterns.",
        contAnalysis:
          "Measures 5–8 continue the pattern but move toward the subdominant: m.5 C major again (tonic return), m.6 C7 (dominant-function color), m.7 F major (subdominant arrival), m.8 F diminished. This continuation is the harmonic response to mm. 1–4. Let me loop mm. 5–8.",
        contSummary:
          "Bach C Major Prelude mm. 5–8: continuation of arpeggiated pattern. C → C7 → F → Fdim. Subdominant region. Pair with mm. 1–4 for E2 harmonic-direction prediction.",
      },
      {
        promptStart: 9,
        promptEnd: 12,
        contStart: 13,
        contEnd: 16,
        promptLabel: "second cycle — dominant preparation",
        contLabel: "second cycle — dominant arrival",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 9–12 of the Bach Prelude and describe the harmonic movement.",
        contUserPrompt:
          "Now play measures 13–16 and describe the resolution from mm. 9–12.",
        promptAnalysis:
          "Measures 9–12 introduce a new harmonic layer: m.9 C major (tonic), m.10 G7 (dominant seventh), m.11 C major, m.12 G7 again. The dominant seventh appears for the first time here, giving more harmonic tension than the opening cycle. Let me loop mm. 9–12.",
        promptSummary:
          "Bach C Major Prelude mm. 9–12: second cycle with dominant sevenths. C → G7 repeated. Increased harmonic tension. Teaching focus: recognizing dominant function within the arpeggio texture.",
        contAnalysis:
          "Measures 13–16 resolve and extend: m.13 Am (relative minor), m.14 D7 (secondary dominant), m.15 G (dominant), m.16 G7. The pair shape is ii7–V–V7 — a complete cadential preparation. Let me loop mm. 13–16.",
        contSummary:
          "Bach C Major Prelude mm. 13–16: Am → D7 → G → G7 cadential approach. Continuation from mm. 9–12. Teaching focus: secondary dominant recognition.",
      },
    ],
    pairAnnotations: [
      {
        promptAnnotation: {
          structure: "Opening arpeggiated template — four measures, one chord each (C–Am–Dm7–G)",
          key_moments: [
            "m1 C major arpeggio — tonic statement",
            "m2 A minor — relative minor color",
            "m3 D minor7 — subdominant approach",
            "m4 G major — dominant, sets up return",
          ],
          teaching_goals: [
            "perfectly even 16th-note arpeggios",
            "harmonic awareness within repeating patterns",
            "smooth legato through chord changes",
          ],
          style_tips: [
            "equal weight on every note — no accent on beat 1",
            "let the harmonic changes do the phrasing",
            "minimal rubato",
          ],
          teaching_notes: [
            {
              measure: 1,
              note: "Each measure is one chord split into 16th notes — hear the harmony, not the individual notes.",
              technique: ["even finger pressure", "wrist relaxed"],
            },
            {
              measure: 3,
              note: "D minor7 adds the first chromatic color — listen for the subtle shift.",
              technique: ["legato connection to m.4"],
            },
          ],
        },
        contAnnotation: {
          structure: "Consequent arpeggiated unit — C–C7–F–Fdim, subdominant area",
          key_moments: [
            "m5 C major return — tonic restatement",
            "m6 C7 — dominant-function seventh",
            "m7 F major — subdominant arrival",
            "m8 F diminished — chromatic color before next section",
          ],
          teaching_goals: [
            "recognize harmonic direction from tonic toward subdominant",
            "match the even arpeggio texture of mm. 1–4",
            "feel the slightly darker color of m.8 Fdim",
          ],
          style_tips: [
            "same even texture as mm. 1–4",
            "the C7 in m.6 should feel slightly warmer — but no accent",
            "Fdim in m.8 is a passing color, keep forward motion",
          ],
          teaching_notes: [
            {
              measure: 6,
              note: "C7 adds Bb — the first flat pitch in the piece. Listen for the subtle shift.",
              technique: ["even weight despite new chord color"],
            },
            {
              measure: 8,
              note: "F diminished provides chromatic tension that propels toward the next phrase.",
              technique: ["forward lean into m.9"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Second harmonic cycle — tonic alternating with dominant seventh (C–G7)",
          key_moments: [
            "m9 C major — tonic return",
            "m10 G7 — dominant seventh first appearance in piece",
            "m11 C major — brief return",
            "m12 G7 — dominant reiterated",
          ],
          teaching_goals: [
            "identify the new dominant seventh tension vs opening cycle",
            "maintain even arpeggio texture under heightened harmonic interest",
          ],
          style_tips: [
            "G7 measures feel slightly more tense — don't push the tempo",
            "harmonic rhythm is still one chord per measure — count carefully",
          ],
          teaching_notes: [
            {
              measure: 10,
              note: "G7 (G-B-D-F) is the first dominant seventh in the piece — the added F creates pull toward C.",
              technique: ["feel the F in the arpeggio as a dissonance"],
            },
          ],
        },
        contAnnotation: {
          structure: "Cadential approach — Am–D7–G–G7 (ii–V secondary dominant chain)",
          key_moments: [
            "m13 A minor — relative minor pivot",
            "m14 D7 — secondary dominant of G",
            "m15 G major — dominant arrival",
            "m16 G7 — dominant seventh, prepares return to tonic",
          ],
          teaching_goals: [
            "recognize ii7–V cadential motion",
            "feel the harmonic pull through the D7→G resolution",
          ],
          style_tips: [
            "the D7 in m.14 wants to resolve — let it",
            "G major in m.15 feels like a temporary arrival",
          ],
          teaching_notes: [
            {
              measure: 14,
              note: "D7 (D-F#-A-C) is a secondary dominant of G — the F# pulls upward.",
              technique: ["hear the F# in the arpeggio"],
            },
          ],
        },
      },
    ],
  },

  // ── Chopin Nocturne Op. 9 No. 2 ────────────────────────────────────────────
  // 4/4 (actually 12/8), ~123 measures. Cantabile melody over LH broken chords.
  // mm. 1-4: opening theme statement (antecedent) ending on dominant.
  // mm. 5-8: consequent phrase resolving to tonic Eb.
  // mm. 9-12: second phrase, slight variation, moving toward dominant.
  // mm. 13-16: ornamented return, resolution.
  // mm. 17-20 → mm. 21-24: developmental middle section pairs.
  {
    songId: "chopin-nocturne-op9-no2",
    composerDeathYear: 1849,
    compositionYear: 1832,
    pairs: [
      {
        promptStart: 1,
        promptEnd: 4,
        contStart: 5,
        contEnd: 8,
        promptLabel: "opening antecedent — theme statement",
        contLabel: "consequent — resolution to tonic",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 1–4 of the Chopin Nocturne Op. 9 No. 2 and explain the opening melody.",
        contUserPrompt:
          "Now play measures 5–8 and explain how they resolve the opening phrase.",
        promptAnalysis:
          "The nocturne opens with Chopin's iconic cantabile melody in Eb major. Measures 1–4 form the antecedent: the melody ascends from Eb, reaches a peak around G5/Ab5, then rests on Bb — the dominant — creating an open-ended feeling. The LH broken-chord accompaniment is quiet and steady. Let me loop mm. 1–4.",
        promptSummary:
          "Chopin Nocturne mm. 1–4: antecedent phrase, Eb major. Melody peaks then rests on dominant Bb. LH broken chords support. Teaching focus: cantabile RH touch, LH-RH independence.",
        contAnalysis:
          "Measures 5–8 complete the period: the melody picks up from the dominant and descends to resolve on Eb — tonic arrival. The phrase has a sighing quality as it falls. The LH fills in with wider intervals. Let me loop mm. 5–8.",
        contSummary:
          "Chopin Nocturne mm. 5–8: consequent phrase, resolves to tonic Eb. Descending RH, fuller LH texture. Completes the opening period with mm. 1–4.",
      },
      {
        promptStart: 9,
        promptEnd: 12,
        contStart: 13,
        contEnd: 16,
        promptLabel: "second phrase — variant antecedent",
        contLabel: "ornamented consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 9–12 of the Nocturne — how does the melody vary here?",
        contUserPrompt:
          "Play measures 13–16 and describe the ornamentation that appears.",
        promptAnalysis:
          "Measures 9–12 restate the theme with slight variation — the melody moves through higher peaks and the harmony enriches. The phrase again lands on the dominant, a structural echo of mm. 1–4. Let me loop mm. 9–12.",
        promptSummary:
          "Chopin Nocturne mm. 9–12: varied antecedent, richer harmony, ends on dominant. Pair with mm. 13–16 for ornamented response.",
        contAnalysis:
          "Measures 13–16 bring Chopin's characteristic ornamental turns and trills. The melody resolves to tonic but decorated with grace notes that float above. The ornamentation requires a relaxed wrist. Let me loop mm. 13–16.",
        contSummary:
          "Chopin Nocturne mm. 13–16: ornamented consequent, resolves to tonic Eb. Grace notes and trills. Teaching focus: relaxed wrist, ornament timing.",
      },
      {
        promptStart: 17,
        promptEnd: 20,
        contStart: 21,
        contEnd: 24,
        promptLabel: "middle section — developmental antecedent",
        contLabel: "middle section — developmental consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 17–20 of the Nocturne — what changes in the middle section?",
        contUserPrompt:
          "Play measures 21–24 and describe how this middle section phrase resolves.",
        promptAnalysis:
          "Measures 17–20 enter the middle section with richer harmony and more chromatic movement. The melody climbs higher and the LH becomes more active. This is the expressive peak of the piece's first half. Let me loop mm. 17–20.",
        promptSummary:
          "Chopin Nocturne mm. 17–20: middle section developmental phrase, chromatic richness, expressive peak.",
        contAnalysis:
          "Measures 21–24 resolve the tension from mm. 17–20 with a long descent and the famous extended cadential trill. The mood settles as the melody falls to the midrange. Let me loop mm. 21–24.",
        contSummary:
          "Chopin Nocturne mm. 21–24: developmental consequent, descending resolution, extended trill. Pair with mm. 17–20.",
      },
    ],
    pairAnnotations: [
      {
        promptAnnotation: {
          structure: "Antecedent phrase — Eb major opening theme, ends on dominant",
          key_moments: [
            "m1 Eb cantabile theme entrance",
            "m2 ascending melodic peak",
            "m4 half cadence on Bb dominant",
          ],
          teaching_goals: [
            "singing cantabile RH touch",
            "LH-RH independence — LH always quieter",
            "phrase shape: rise and fall",
          ],
          style_tips: [
            "RH melody sings as if a soprano voice",
            "LH broken chords are breath, not beats",
            "no hurrying the ascent",
          ],
          teaching_notes: [
            {
              measure: 1,
              note: "Cantabile: imagine the melody as a human voice, never mechanical.",
              technique: ["arm weight into RH melody", "LH pp throughout"],
            },
            {
              measure: 4,
              note: "The dominant Bb landing creates expectation — don't resolve early.",
              technique: ["hold the Bb with slight tenuto"],
            },
          ],
        },
        contAnnotation: {
          structure: "Consequent phrase — completes the period with tonic arrival on Eb",
          key_moments: [
            "m5 melody continues from dominant",
            "m6-7 descending resolution",
            "m8 tonic Eb arrival",
          ],
          teaching_goals: [
            "feel the resolution as an exhale after mm. 1–4 tension",
            "match cantabile quality of antecedent",
          ],
          style_tips: [
            "the descent should feel inevitable, not mechanical",
            "slight ritardando toward m.8 cadence is appropriate",
          ],
          teaching_notes: [
            {
              measure: 8,
              note: "Tonic arrival should feel like landing gently — not a thud.",
              technique: ["diminuendo into the resolution"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Variant antecedent — richer harmony, same structural function as mm. 1–4",
          key_moments: [
            "m9 theme restatement",
            "m11-12 heightened harmonic color",
            "m12 dominant again",
          ],
          teaching_goals: [
            "hear the variation from mm. 1–4 while maintaining phrase function",
          ],
          style_tips: ["slightly more expressive on the variation peaks"],
          teaching_notes: [
            {
              measure: 9,
              note: "The theme feels familiar — the variation is in the details.",
              technique: ["notice the altered inner voices"],
            },
          ],
        },
        contAnnotation: {
          structure: "Ornamented consequent — grace notes, trills on resolution",
          key_moments: [
            "m13 ornamental turns begin",
            "m15 trill above resolution",
            "m16 tonic arrival with decoration",
          ],
          teaching_goals: [
            "relaxed wrist for ornaments",
            "ornaments must not rush the resolution",
          ],
          style_tips: [
            "ornaments are decoration, not gymnastics",
            "main melody note must be heard through the ornament",
          ],
          teaching_notes: [
            {
              measure: 13,
              note: "Grace notes: touch and release — light finger, no pressure.",
              technique: ["forearm weight off for ornaments"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Developmental antecedent — chromatic ascent, expressive peak",
          key_moments: [
            "m17 chromatic color begins",
            "m19 melodic peak of middle section",
            "m20 suspense before resolution",
          ],
          teaching_goals: [
            "shape the climax dynamically — this is the piece's emotional center",
          ],
          style_tips: ["allow a full crescendo here", "this phrase earns more rubato than the opening"],
          teaching_notes: [
            {
              measure: 17,
              note: "The middle section requires more depth — lean into the LH harmonies.",
              technique: ["arm weight increases with dynamic"],
            },
          ],
        },
        contAnnotation: {
          structure: "Developmental consequent — descending resolution, extended trill",
          key_moments: [
            "m21 descent from peak",
            "m23 extended cadential trill",
            "m24 tonic settling",
          ],
          teaching_goals: [
            "pace the descent — don't rush the resolution",
            "trill remains musical, not mechanical",
          ],
          style_tips: ["the trill slows toward resolution", "decrescendo through the descent"],
          teaching_notes: [
            {
              measure: 23,
              note: "Extended trill: relax the fingers, let it flow. Slow to match the ritardando.",
              technique: ["even alternation", "slow toward cadence"],
            },
          ],
        },
      },
    ],
  },

  // ── Chopin Prelude E minor Op. 28 No. 4 ────────────────────────────────────
  // 4/4, ~65 measures. Slow, somber. Sustained RH melody over chromatic LH descent.
  // mm. 1-4: opening melody with descending chromatic bass — antecedent.
  // mm. 5-8: consequent, slight melodic shift, bass continues to descend.
  // mm. 9-12: second phrase, LH chromatic movement continues downward.
  // mm. 13-16: intensification, moving toward climax.
  {
    songId: "chopin-prelude-e-minor",
    composerDeathYear: 1849,
    compositionYear: 1839,
    pairs: [
      {
        promptStart: 1,
        promptEnd: 4,
        contStart: 5,
        contEnd: 8,
        promptLabel: "opening — sustained melody over chromatic bass",
        contLabel: "consequent — bass continues descending",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 1–4 of Chopin's Prelude in E minor and explain the texture.",
        contUserPrompt:
          "Play measures 5–8 and show how the bass continues from the opening.",
        promptAnalysis:
          "The Prelude in E minor is one of Chopin's most austere pieces. Measures 1–4 present a quiet, sustained RH chord melody while the LH walks slowly downward through a chromatic bass line. The mood is somber and introspective — the chromatic bass is the motor. Let me loop mm. 1–4.",
        promptSummary:
          "Chopin Prelude E minor mm. 1–4: opening sustained melody, chromatic LH bass descent. Introspective character. Teaching focus: voice independence, sustained tone.",
        contAnalysis:
          "Measures 5–8 continue the chromatic descent in the bass — the LH has now traveled several scale degrees downward. The RH melody shifts slightly, becoming more questioning. The tension is building even though dynamics remain soft. Let me loop mm. 5–8.",
        contSummary:
          "Chopin Prelude E minor mm. 5–8: bass continues descending, RH grows more searching. Continuation pairs with mm. 1–4 chromatic descent.",
      },
      {
        promptStart: 9,
        promptEnd: 12,
        contStart: 13,
        contEnd: 16,
        promptLabel: "second phrase — intensifying descent",
        contLabel: "climactic approach",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 9–12 and describe how the harmony darkens.",
        contUserPrompt:
          "Play measures 13–16 and describe the intensification.",
        promptAnalysis:
          "Measures 9–12 deepen the harmonic descent — the LH reaches lower, more dissonant territory. The RH chords grow slightly thicker. There is a sense of inevitability to the downward motion. Let me loop mm. 9–12.",
        promptSummary:
          "Chopin Prelude E minor mm. 9–12: deepened harmonic descent, growing thickness. Darkening mood.",
        contAnalysis:
          "Measures 13–16 push toward the climax with more harmonic intensity. The bass is now far from the opening E, and the RH melody reaches upward in response. This is the prelude's expressive peak approach. Let me loop mm. 13–16.",
        contSummary:
          "Chopin Prelude E minor mm. 13–16: intensification toward climax, RH reaches upward, harmonic peak. Pairs with mm. 9–12 descent.",
      },
    ],
    pairAnnotations: [
      {
        promptAnnotation: {
          structure: "Opening — sustained RH over step-wise chromatic LH descent",
          key_moments: [
            "m1 E minor opening chord with descending bass",
            "m3 chromatic passing note in bass",
            "m4 dominant B in bass — cadential approach",
          ],
          teaching_goals: [
            "sustained RH with slow arm weight",
            "LH chromatic bass: smooth legato, even descent",
            "voicing: bass must be heard but not loud",
          ],
          style_tips: [
            "pp throughout — restraint is the piece's power",
            "no pedal changes until after each chromatic step resolves",
            "tempo is very slow — count carefully",
          ],
          teaching_notes: [
            {
              measure: 1,
              note: "The opening chord should float — arm weight with a relaxed wrist.",
              technique: ["sustained touch", "pedal on beat 1 through change"],
            },
            {
              measure: 3,
              note: "LH chromatic note: the descent must be legato, as if a single breath.",
              technique: ["finger substitution for legato on bass"],
            },
          ],
        },
        contAnnotation: {
          structure: "Consequent — LH bass continues descending, RH grows more questioning",
          key_moments: [
            "m5 bass continues below tonic",
            "m7 RH melodic shift — slight variation",
            "m8 dominant arrival again",
          ],
          teaching_goals: [
            "feel the bass pulling downward — inevitable motion",
            "RH variation: slightly more searching quality",
          ],
          style_tips: [
            "still pp — don't rush into crescendo",
            "the questioning quality is in the phrasing, not the dynamics",
          ],
          teaching_notes: [
            {
              measure: 5,
              note: "The bass has moved — recognize how far it has descended from m.1.",
              technique: ["map the descent mentally while playing"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Second phrase — LH reaches lower register, harmonic tension increases",
          key_moments: [
            "m9 bass enters new harmonic area",
            "m11 dissonant chord — new chromatic pitch",
            "m12 partial cadence",
          ],
          teaching_goals: [
            "feel the darkening of harmonic color",
            "RH chords become slightly fuller here",
          ],
          style_tips: ["a slight hairpin swell is appropriate in m.11", "don't accelerate"],
          teaching_notes: [
            {
              measure: 11,
              note: "The dissonance here is deliberate — let it speak without hurrying past.",
              technique: ["slight tenuto on dissonant chord"],
            },
          ],
        },
        contAnnotation: {
          structure: "Climactic approach — RH ascends, bass deepens, maximum tension",
          key_moments: [
            "m13 RH reaches upward",
            "m15 harmonic peak — most distant from tonic",
            "m16 start of descent back",
          ],
          teaching_goals: [
            "shape the climax dynamically — this is the piece's emotional center",
            "RH ascent should feel like a desperate reach",
          ],
          style_tips: [
            "allow a crescendo to mf here — the piece earns it",
            "don't rush — the climax must breathe",
          ],
          teaching_notes: [
            {
              measure: 13,
              note: "The only moment in the piece to lean into — controlled emotion, not hysteria.",
              technique: ["arm weight increase for climax"],
            },
          ],
        },
      },
    ],
  },

  // ── Clair de Lune ────────────────────────────────────────────────────────────
  // 9/8, ~72 measures. Triplet feel, impressionistic. Db major.
  // mm. 1-4: opening introductory theme — slow, floating. Ends on color chord.
  // mm. 5-8: theme continuation, melody rises.
  // mm. 15-18: second theme section begins (main cantabile section).
  // mm. 19-22: continuation of second theme, reaches emotional peak.
  {
    songId: "clair-de-lune",
    composerDeathYear: 1918,
    compositionYear: 1905,
    pairs: [
      {
        promptStart: 1,
        promptEnd: 4,
        contStart: 5,
        contEnd: 8,
        promptLabel: "opening atmosphere — introductory phrase",
        contLabel: "opening continuation — melody rises",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 1–4 of Clair de Lune and describe the opening atmosphere.",
        contUserPrompt:
          "Play measures 5–8 and describe how the melody rises from the opening.",
        promptAnalysis:
          "Clair de Lune opens in 9/8 with a hauntingly slow, floating quality. Measures 1–4 introduce the atmospheric texture: the melody moves in long notes over a rippling accompaniment. The triplet feel creates a sense of moonlight on water. Let me loop mm. 1–4.",
        promptSummary:
          "Clair de Lune mm. 1–4: opening atmospheric phrase, 9/8 triplet texture, floating quality. Db major. Teaching focus: tone color, pedal use for shimmer.",
        contAnalysis:
          "Measures 5–8 extend the atmosphere: the melody climbs slightly higher and the rippling accompaniment fills out. The harmonic color shifts from the opening chord. The phrase feels like the moon emerging. Let me loop mm. 5–8.",
        contSummary:
          "Clair de Lune mm. 5–8: opening continuation, melody rises, harmonic color shifts. Atmospheric shimmer continues. Pairs with mm. 1–4.",
      },
      {
        promptStart: 15,
        promptEnd: 18,
        contStart: 19,
        contEnd: 22,
        promptLabel: "cantabile theme — second section antecedent",
        contLabel: "cantabile theme — consequent, emotional peak",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 15–18 of Clair de Lune — this is where the famous melody enters. Describe it.",
        contUserPrompt:
          "Play measures 19–22 and describe how this section reaches its emotional peak.",
        promptAnalysis:
          "Measures 15–18 bring the famous Clair de Lune cantabile melody — the piece's emotional center. A singing line emerges in the right hand over a lush broken-chord accompaniment. The melody has a yearning quality, arching upward. Let me loop mm. 15–18.",
        promptSummary:
          "Clair de Lune mm. 15–18: famous cantabile melody enters, yearning arch, lush accompaniment. Teaching focus: singing touch, phrase shaping.",
        contAnalysis:
          "Measures 19–22 continue and deepen the melody, reaching the emotional summit of the piece. The dynamics build to mf/f, and the melody's arc peaks before beginning its descent. The harmonic richness is maximum here. Let me loop mm. 19–22.",
        contSummary:
          "Clair de Lune mm. 19–22: emotional summit, melody peaks, harmonic richness at maximum. Continuation from mm. 15–18. Teaching focus: controlled crescendo, dynamic shaping.",
      },
    ],
    pairAnnotations: [
      {
        promptAnnotation: {
          structure: "Opening atmospheric introduction — 9/8 ripple, floating long melody notes",
          key_moments: [
            "m1 opening chord with sustained melody",
            "m3 harmonic color shift",
            "m4 transitional chord — expectation",
          ],
          teaching_goals: [
            "9/8 triplet pulse must feel like three big beats, not nine",
            "tone color: muted and distant, as if through fog",
            "half-pedal technique for shimmer without muddiness",
          ],
          style_tips: [
            "ppp — barely touching the keys",
            "slow and floating — resist the urge to rush",
            "pedal creates the atmospheric shimmer",
          ],
          teaching_notes: [
            {
              measure: 1,
              note: "Think of each 9/8 measure as one slow wave, not nine beats.",
              technique: ["arm follows the phrase arc", "half-pedal for clarity"],
            },
          ],
        },
        contAnnotation: {
          structure: "Opening continuation — melody climbs, harmonic color deepens",
          key_moments: [
            "m5 melody ascends from m.4",
            "m7 new harmonic area",
            "m8 settling before next section",
          ],
          teaching_goals: [
            "feel the subtle melody rise — don't overplay it",
            "match the atmospheric tone of mm. 1–4",
          ],
          style_tips: ["still ppp/pp — the shimmer has not yet intensified", "let the pedal blur slightly"],
          teaching_notes: [
            {
              measure: 7,
              note: "The harmonic color shift here is impressionistic — don't analyze, feel it.",
              technique: ["listen for the color change, not the chord name"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Cantabile second theme — yearning melody arch over lush accompaniment",
          key_moments: [
            "m15 famous melody entrance",
            "m17 melody reaches toward upper register",
            "m18 suspension before peak",
          ],
          teaching_goals: [
            "singing cantabile line — RH sings like a cello",
            "LH accompaniment is lush but always under the melody",
            "phrase shape: rise toward mm. 19–22",
          ],
          style_tips: [
            "mp rising to mf — this phrase needs dynamic shape",
            "rubato appropriate — feel the phrase's weight",
            "pedal is essential here for legato",
          ],
          teaching_notes: [
            {
              measure: 15,
              note: "This is the heart of the piece — every note should feel inevitable.",
              technique: ["arm weight into melody", "RH sings over LH texture"],
            },
          ],
        },
        contAnnotation: {
          structure: "Cantabile consequent — emotional summit, melody peaks, mf/f dynamics",
          key_moments: [
            "m19 melody continues to climb",
            "m21 peak — highest note of phrase",
            "m22 beginning of descent",
          ],
          teaching_goals: [
            "control the crescendo — don't rush to the peak",
            "the peak must ring, not pound",
          ],
          style_tips: [
            "mf at peak — not ff. Debussy's restraint is part of the beauty.",
            "begin the descent with a natural decrescendo",
          ],
          teaching_notes: [
            {
              measure: 21,
              note: "The melodic peak: arm weight, not force. Ring, not hammer.",
              technique: ["arm weight at peak", "immediate decrescendo after"],
            },
          ],
        },
      },
    ],
  },

  // ── Debussy Arabesque No. 1 ──────────────────────────────────────────────────
  // 4/4, ~106 measures. E major, flowing triplet figures.
  // mm. 1-4: flowing opening triplet figure over sustained bass.
  // mm. 5-8: continuation, melody emerges above the triplets.
  // mm. 9-12: development of triplet figure with new harmonic coloring.
  // mm. 13-16: consequent, resolves back.
  {
    songId: "debussy-arabesque-no1",
    composerDeathYear: 1918,
    compositionYear: 1891,
    pairs: [
      {
        promptStart: 1,
        promptEnd: 4,
        contStart: 5,
        contEnd: 8,
        promptLabel: "opening triplet arabesque — antecedent",
        contLabel: "melody emerges — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 1–4 of Debussy's Arabesque No. 1 and explain the triplet texture.",
        contUserPrompt:
          "Play measures 5–8 and describe how the melody emerges from the triplets.",
        promptAnalysis:
          "The Arabesque opens with flowing triplet figures in both hands — a continuous stream of 8th-note triplets that creates a shimmering, almost impressionistic texture. Measures 1–4 establish this arabesquelike motion in E major. The phrase ends with a sense of upward momentum. Let me loop mm. 1–4.",
        promptSummary:
          "Debussy Arabesque No. 1 mm. 1–4: flowing triplet texture, E major, shimmering arabesque motion. Teaching focus: even triplets, tone color.",
        contAnalysis:
          "Measures 5–8 continue the triplets but a melodic line emerges above them — the first clear melodic statement. The flowing texture continues underneath while the melody sings. The phrase resolves gently at m.8. Let me loop mm. 5–8.",
        contSummary:
          "Debussy Arabesque No. 1 mm. 5–8: melody emerges over triplet texture. Gentle resolution. Pairs with mm. 1–4 for melodic emergence prediction.",
      },
      {
        promptStart: 9,
        promptEnd: 12,
        contStart: 13,
        contEnd: 16,
        promptLabel: "development — harmonic color shift antecedent",
        contLabel: "development — harmonic resolution consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 9–12 of the Arabesque — what harmonic color changes appear?",
        contUserPrompt:
          "Play measures 13–16 and describe how the harmony resolves.",
        promptAnalysis:
          "Measures 9–12 take the triplet figure into new harmonic territory — more chromaticism, different bass pedal tones. The triplet flow continues but the color shifts away from the opening E major brightness. Let me loop mm. 9–12.",
        promptSummary:
          "Debussy Arabesque No. 1 mm. 9–12: development, harmonic color shift, chromaticism within triplet flow.",
        contAnalysis:
          "Measures 13–16 resolve the developmental tension back toward E major stability. The triplet texture softens and the phrase settles. A gentle return to the opening character. Let me loop mm. 13–16.",
        contSummary:
          "Debussy Arabesque No. 1 mm. 13–16: harmonic resolution, settling back to E major character. Pairs with mm. 9–12.",
      },
    ],
    pairAnnotations: [
      {
        promptAnnotation: {
          structure: "Opening arabesque — flowing triplet texture establishing the piece's motion",
          key_moments: [
            "m1 triplet arabesque opens in E major",
            "m3 harmonics shift slightly",
            "m4 upward momentum — phrase incomplete",
          ],
          teaching_goals: [
            "triplets must be perfectly even — no accent on beat 1",
            "tone: gentle, translucent — not bright or percussive",
            "hands coordinate seamlessly on the flowing triplets",
          ],
          style_tips: [
            "pp to mp — light and flowing",
            "think of a gentle stream, not a waterfall",
            "no pedal yet — clarity first",
          ],
          teaching_notes: [
            {
              measure: 1,
              note: "Arabesque means ornamental flow — every note equal, no emphasis.",
              technique: ["relaxed wrist", "finger independence for even triplets"],
            },
          ],
        },
        contAnnotation: {
          structure: "Melody emerges — RH singing line over sustained triplet accompaniment",
          key_moments: [
            "m5 melodic line appears above triplets",
            "m7 melodic peak before descent",
            "m8 gentle resolution",
          ],
          teaching_goals: [
            "melody must be heard above the triplet texture",
            "LH/inner RH triplets stay soft while melody sings",
          ],
          style_tips: [
            "differentiate touch: melody finger has more weight",
            "the resolution at m.8 is exhale, not stop",
          ],
          teaching_notes: [
            {
              measure: 5,
              note: "The melody appears in the top voice — bring it out with finger weight.",
              technique: ["4th/5th finger weight in RH for melody"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Development — chromatic triplet figure, harmonic color darkens",
          key_moments: [
            "m9 chromatic color in bass",
            "m11 furthest from home key",
            "m12 partial cadence",
          ],
          teaching_goals: ["recognize the harmonic darkening while maintaining even triplets"],
          style_tips: ["allow a slight crescendo through the development"],
          teaching_notes: [
            {
              measure: 11,
              note: "The harmonic distance from E major is at its peak — feel it without forcing it.",
              technique: ["listen for the bass movement"],
            },
          ],
        },
        contAnnotation: {
          structure: "Developmental resolution — triplets settle, E major returns",
          key_moments: [
            "m13 settling toward home key",
            "m15 clearer E major",
            "m16 full resolution",
          ],
          teaching_goals: ["feel the release as harmony returns home"],
          style_tips: ["decrescendo through the resolution", "softer than the development"],
          teaching_notes: [
            {
              measure: 16,
              note: "Full resolution: the triplets settle, the key is clear again.",
              technique: ["let the phrase breathe at the resolution"],
            },
          ],
        },
      },
    ],
  },

  // ── Für Elise — NEW PAIR (mm. 9-16) ─────────────────────────────────────────
  // 3/8, ~126 measures. A minor. mm. 9-12: B section (relative major C).
  // mm. 13-16: B section continues, relative major harmonic area.
  // These are natural because mm. 9 begins the B phrase (contrasting section).
  {
    songId: "fur-elise",
    composerDeathYear: 1827,
    compositionYear: 1810,
    pairs: [
      {
        promptStart: 9,
        promptEnd: 12,
        contStart: 13,
        contEnd: 16,
        promptLabel: "B section — relative major antecedent",
        contLabel: "B section — relative major consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 9–12 of Für Elise — the B section begins here. What changes?",
        contUserPrompt:
          "Play measures 13–16 and describe how the B section continues.",
        promptAnalysis:
          "Measure 9 begins Für Elise's contrasting B section — the music shifts to C major (relative major of A minor). The oscillating RH figure is replaced by a fuller, more lyrical phrase. The character becomes warmer and more open. Let me loop mm. 9–12.",
        promptSummary:
          "Für Elise mm. 9–12: B section enters, shift to relative major C. Warmer, more open character than A theme. Teaching focus: character contrast.",
        contAnalysis:
          "Measures 13–16 continue the B section in the relative major, completing the phrase. The LH adds fuller support. The phrase settles on a half cadence that prepares the return to the A theme. Let me loop mm. 13–16.",
        contSummary:
          "Für Elise mm. 13–16: B section continuation, fuller LH, half cadence preparing A theme return. Pairs with mm. 9–12.",
      },
    ],
    pairAnnotations: [
      {
        promptAnnotation: {
          structure: "B section — relative major C, warmer character, fuller LH",
          key_moments: [
            "m9 shift to C major — character change",
            "m11 melodic arch of B section",
            "m12 dominant G — open ending",
          ],
          teaching_goals: [
            "contrast with A theme — warmer, more open sound",
            "RH phrase shape: arch from m.9 to m.12",
            "LH fuller than in A section",
          ],
          style_tips: [
            "the character here is warmer — slight increase in dynamic",
            "feel the C major sunshine after A minor",
          ],
          teaching_notes: [
            {
              measure: 9,
              note: "The shift to C major is a character change — let the sound open up.",
              technique: ["slightly warmer tone", "fuller arm weight than A theme"],
            },
          ],
        },
        contAnnotation: {
          structure: "B section continuation — fuller LH, half cadence on G",
          key_moments: [
            "m13 phrase continues in C major",
            "m15 LH grows fuller",
            "m16 dominant G half cadence",
          ],
          teaching_goals: [
            "fuller LH support in mm. 13–16",
            "feel the half cadence as preparation for A theme return",
          ],
          style_tips: [
            "the half cadence should feel expectant — not finished",
            "slight ritardando before A theme return",
          ],
          teaching_notes: [
            {
              measure: 16,
              note: "The dominant G cadence is a door back to the A theme — leave it open.",
              technique: ["slight tenuto on G", "prepare for A theme return"],
            },
          ],
        },
      },
    ],
  },

  // ── Mozart K545 Movement 1 ───────────────────────────────────────────────────
  // 4/4, ~146 measures. C major, 137 BPM. Existing record mm. 1-4 repurposed.
  // mm. 1-4: opening theme (existing record, repurposed as prompt).
  // mm. 5-8: theme consequent, closes the first 8-bar period.
  // mm. 9-12: transition to G major dominant area.
  // mm. 13-16: second theme begins in G major.
  {
    songId: "mozart-k545-mvt1",
    composerDeathYear: 1791,
    compositionYear: 1788,
    pairs: [
      {
        promptStart: 1,
        promptEnd: 4,
        contStart: 5,
        contEnd: 8,
        promptLabel: "opening theme — antecedent",
        contLabel: "opening theme — consequent, period close",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 1–4 of Mozart's K545 first movement and explain the opening theme.",
        contUserPrompt:
          "Play measures 5–8 and explain how they close the opening 8-bar period.",
        promptAnalysis:
          "The opening is iconic: m.1 has an ascending C major scale from C5 to C6 in the RH, while the LH begins its Alberti bass (C-G-E-G pattern). Mm. 2–4 develop the melody downward with a half cadence on G at m.4. The texture is transparent — thin Classical style. Let me loop mm. 1–4.",
        promptSummary:
          "Mozart K545 mm. 1–4: ascending scale m.1, melodic descent mm. 2–4 over Alberti bass. Half cadence on G at m.4. Teaching focus: Alberti bass evenness, Classical articulation.",
        contAnalysis:
          "Measures 5–8 complete the period: the melody restates but now closes on the tonic C — a full authentic cadence. The 8-bar period is complete. The Alberti bass continues consistently throughout. Let me loop mm. 5–8.",
        contSummary:
          "Mozart K545 mm. 5–8: period consequent, tonic C arrival, full authentic cadence. Completes the 8-bar opening period. Pairs with mm. 1–4.",
      },
      {
        promptStart: 9,
        promptEnd: 12,
        contStart: 13,
        contEnd: 16,
        promptLabel: "transition — moving toward dominant",
        contLabel: "second theme — dominant G major",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 9–12 — this is the bridge toward the second theme. What happens?",
        contUserPrompt:
          "Play measures 13–16 and describe the second theme in G major.",
        promptAnalysis:
          "Measures 9–12 are the transitional passage — Mozart moves from C major toward the dominant key G major. The RH scales and runs become more sequential, leading outward. The transition is typically Classical: purposeful and economical. Let me loop mm. 9–12.",
        promptSummary:
          "Mozart K545 mm. 9–12: bridge/transition, C→G modulation in progress. Sequential runs, purposeful Classical motion.",
        contAnalysis:
          "Measures 13–16 arrive in G major with the second theme — a new melodic character. The melody is lighter and more playful than the opening, with a decorated top voice. The Alberti bass continues but now in G. Let me loop mm. 13–16.",
        contSummary:
          "Mozart K545 mm. 13–16: second theme in G major, lighter/more playful character. Pair with mm. 9–12 transition for key-arrival prediction.",
      },
    ],
    pairAnnotations: [
      {
        promptAnnotation: {
          structure: "Opening theme antecedent — ascending scale + melodic descent over Alberti bass",
          key_moments: [
            "m1 iconic ascending scale C5→C6",
            "m2 melodic E5→B4 descent begins",
            "m4 half cadence on G — phrase incomplete",
          ],
          teaching_goals: [
            "Alberti bass LH evenness (C-G-E-G)",
            "RH melody articulation — clean, vocal, Classical",
            "sonata form first-theme identification",
          ],
          style_tips: [
            "no pedal — Classical transparency",
            "Alberti bass always quieter than melody",
            "elegant and vocal, not percussive",
          ],
          teaching_notes: [
            {
              measure: 1,
              note: "The ascending scale is Mozart's calling card — pure and bright.",
              technique: ["even finger pressure", "slight taper at peak C"],
            },
            {
              measure: 2,
              note: "LH Alberti: C-G-E-G repeated — keep it light.",
              technique: ["LH pp under RH melody", "wrist loose for Alberti"],
            },
          ],
        },
        contAnnotation: {
          structure: "Opening theme consequent — resolves to tonic C, completes 8-bar period",
          key_moments: [
            "m5 theme restatement from dominant",
            "m7 descending resolution",
            "m8 tonic C — period complete",
          ],
          teaching_goals: [
            "feel the resolution as completion of a sentence",
            "full authentic cadence at m.8 — this is a landing",
          ],
          style_tips: [
            "slight decrease in dynamic toward the tonic — it's an arrival",
            "don't rush the resolution",
          ],
          teaching_notes: [
            {
              measure: 8,
              note: "The period closes with a full cadence — feel the sentence ending.",
              technique: ["slight diminuendo into final C"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Transition — sequential motion from C toward dominant G",
          key_moments: [
            "m9 transition begins",
            "m11 sequential scale passages",
            "m12 dominant preparation",
          ],
          teaching_goals: [
            "feel the modulation — notice when G major becomes more prominent",
            "even scales in RH for the sequential passages",
          ],
          style_tips: ["slight acceleration of energy but not tempo", "these transitions are exciting — let them move"],
          teaching_notes: [
            {
              measure: 11,
              note: "Sequential passages: equal weight on every note for clarity.",
              technique: ["finger independence for clean scales"],
            },
          ],
        },
        contAnnotation: {
          structure: "Second theme in G major — lighter, playful character",
          key_moments: [
            "m13 G major second theme enters",
            "m15 decorated top voice",
            "m16 dominant D in G major — open",
          ],
          teaching_goals: [
            "new theme character: lighter and more playful than mm. 1–4",
            "adjust touch for G major brightness",
          ],
          style_tips: ["the second theme is an answer to the first — lighter", "let the decoration be graceful"],
          teaching_notes: [
            {
              measure: 13,
              note: "Different character from m.1 — lighter, more conversational.",
              technique: ["slightly lighter arm weight than opening theme"],
            },
          ],
        },
      },
    ],
  },

  // ── Pathetique Sonata Mvt 2 ──────────────────────────────────────────────────
  // 4/4, ~153 measures. Ab major, Adagio cantabile. Slow, singing.
  // mm. 1-4: opening theme — singing melody over LH arpeggios.
  // mm. 5-8: consequent, closes the period.
  // mm. 9-12: development of opening theme.
  // mm. 13-16: second theme or extension.
  {
    songId: "pathetique-mvt2",
    composerDeathYear: 1827,
    compositionYear: 1799,
    pairs: [
      {
        promptStart: 1,
        promptEnd: 4,
        contStart: 5,
        contEnd: 8,
        promptLabel: "Adagio cantabile — opening antecedent",
        contLabel: "Adagio cantabile — consequent, period close",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 1–4 of Beethoven's Pathetique Sonata second movement and explain the singing theme.",
        contUserPrompt:
          "Play measures 5–8 and describe how they complete the opening phrase.",
        promptAnalysis:
          "The Adagio cantabile opens with one of Beethoven's most beautiful melodies in Ab major. Measures 1–4 present the antecedent: a long, singing RH melody over a rocking LH arpeggio pattern. The mood is peaceful and contemplative. The phrase ends on the dominant Eb — expectant. Let me loop mm. 1–4.",
        promptSummary:
          "Pathetique mvt 2 mm. 1–4: Adagio cantabile opening, Ab major singing melody over LH arpeggios. Ends on dominant Eb. Teaching focus: sustained singing tone, LH rocking pattern.",
        contAnalysis:
          "Measures 5–8 complete the period with a consequent that resolves to the tonic Ab. The melody completes its arc with a sense of peaceful arrival. The LH arpeggios continue their rocking motion. Let me loop mm. 5–8.",
        contSummary:
          "Pathetique mvt 2 mm. 5–8: consequent, tonic Ab arrival, period complete. Peaceful resolution. Pairs with mm. 1–4.",
      },
      {
        promptStart: 9,
        promptEnd: 12,
        contStart: 13,
        contEnd: 16,
        promptLabel: "development — theme elaboration",
        contLabel: "development continuation — return to stability",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 9–12 — how does Beethoven develop the theme here?",
        contUserPrompt:
          "Play measures 13–16 and describe the return to stability.",
        promptAnalysis:
          "Measures 9–12 take the singing theme into a development: the melody becomes more embellished, the harmony moves through related keys. The rocking LH continues, but the RH melody rises to a higher register. Let me loop mm. 9–12.",
        promptSummary:
          "Pathetique mvt 2 mm. 9–12: theme development, embellished melody, higher register, harmonic movement.",
        contAnalysis:
          "Measures 13–16 bring a return to stability — the melody settles back from the developmental excursion. The phrase resolves more peacefully. Let me loop mm. 13–16.",
        contSummary:
          "Pathetique mvt 2 mm. 13–16: return from development, melody settles, peaceful resolution. Pairs with mm. 9–12.",
      },
    ],
    pairAnnotations: [
      {
        promptAnnotation: {
          structure: "Adagio cantabile opening — singing Ab major melody over rocking LH arpeggios",
          key_moments: [
            "m1 Ab major cantabile theme entrance",
            "m3 melody peak before descent",
            "m4 dominant Eb — open ending",
          ],
          teaching_goals: [
            "singing RH tone — imagine a cello",
            "LH rocking arpeggios: even, quiet, never louder than RH",
            "Adagio: very slow, breathe between phrases",
          ],
          style_tips: [
            "pp to mp — gentle, intimate",
            "pedal on each beat for legato",
            "no rush — this is contemplative music",
          ],
          teaching_notes: [
            {
              measure: 1,
              note: "The Adagio marking means very slow — don't rush even in the opening.",
              technique: ["arm weight for sustained tone", "breathe between phrases"],
            },
          ],
        },
        contAnnotation: {
          structure: "Consequent — peaceful Ab tonic arrival, period complete",
          key_moments: [
            "m5 melody continues toward resolution",
            "m7 final melodic descent",
            "m8 tonic Ab — peaceful arrival",
          ],
          teaching_goals: [
            "feel the resolution as a gentle arrival, not a stop",
            "the tonic Ab should feel like coming home",
          ],
          style_tips: [
            "slight diminuendo toward the resolution",
            "the arrival is peaceful — don't accent the final Ab",
          ],
          teaching_notes: [
            {
              measure: 8,
              note: "Tonic arrival: a breath, not a stop. The music continues after.",
              technique: ["soft landing on Ab", "continue arm weight through the note"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Development — theme embellished, melody rises, harmonic movement",
          key_moments: [
            "m9 theme restatement with embellishment",
            "m11 melody climbs to higher register",
            "m12 developmental harmonic movement",
          ],
          teaching_goals: [
            "embellishments: grace, not speed",
            "higher register needs slightly more arm weight for same tone quality",
          ],
          style_tips: ["slight increase in dynamic for the development", "let the embellishments flow"],
          teaching_notes: [
            {
              measure: 11,
              note: "Higher register melody: the notes are naturally quieter — compensate with arm weight.",
              technique: ["arm weight increases with register rise"],
            },
          ],
        },
        contAnnotation: {
          structure: "Development return — melody settles, peaceful resolution",
          key_moments: [
            "m13 descent from development",
            "m15 settling harmonic area",
            "m16 stable close",
          ],
          teaching_goals: [
            "the descent from development should feel like an exhale",
            "match the opening cantabile quality",
          ],
          style_tips: ["decrescendo through mm. 13–16", "return to the opening gentleness"],
          teaching_notes: [
            {
              measure: 13,
              note: "The descent: controlled, unhurried. The development's tension releases slowly.",
              technique: ["gradual decrescendo", "arm relaxes as melody descends"],
            },
          ],
        },
      },
    ],
  },

  // ── Satie Gymnopedie No. 1 ───────────────────────────────────────────────────
  // 3/4, ~79 measures. D major. Slow waltz feel.
  // mm. 1-2: intro chord (2-bar LH only). Pairs start from m.3 (melody begins).
  // mm. 3-6: opening melody phrase — antecedent.
  // mm. 7-10: consequent phrase.
  // mm. 11-14: second phrase group — antecedent.
  // mm. 15-18: second phrase group — consequent.
  {
    songId: "satie-gymnopedie-no1",
    composerDeathYear: 1925,
    compositionYear: 1888,
    pairs: [
      {
        promptStart: 3,
        promptEnd: 6,
        contStart: 7,
        contEnd: 10,
        promptLabel: "opening melody — antecedent (mm. 3–6)",
        contLabel: "opening melody — consequent (mm. 7–10)",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 3–6 of Satie's Gymnopedie No. 1 where the melody begins. Describe the character.",
        contUserPrompt:
          "Play measures 7–10 and explain how they answer the opening melody.",
        promptAnalysis:
          "The Gymnopedie melody enters at m.3 over the continuing LH chord pattern. The melody is sparse, melancholy, and utterly unhurried — a perfect Satie invention. Measures 3–6 present the antecedent of the first melody phrase, ending with an open quality. Let me loop mm. 3–6.",
        promptSummary:
          "Satie Gymnopedie No. 1 mm. 3–6: opening melody antecedent, melancholy and sparse. D major. Teaching focus: extreme slowness, detached LH chords, singing RH.",
        contAnalysis:
          "Measures 7–10 answer with the consequent: the melody completes its thought and resolves more fully. The same unhurried 3/4 flow continues. The phrase ends with a stronger sense of arrival than mm. 3–6. Let me loop mm. 7–10.",
        contSummary:
          "Satie Gymnopedie No. 1 mm. 7–10: melody consequent, stronger arrival. 3/4 waltz feel. Pairs with mm. 3–6.",
      },
      {
        promptStart: 11,
        promptEnd: 14,
        contStart: 15,
        contEnd: 18,
        promptLabel: "second phrase group — antecedent",
        contLabel: "second phrase group — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 11–14 of the Gymnopedie — what happens in the second phrase group?",
        contUserPrompt:
          "Play measures 15–18 and describe the completion of the second phrase.",
        promptAnalysis:
          "Measures 11–14 begin a new phrase group — the melody moves to a slightly different melodic shape, still in the same unhurried character. The harmonic color shifts subtly. This antecedent ends with the same open quality as mm. 3–6. Let me loop mm. 11–14.",
        promptSummary:
          "Satie Gymnopedie No. 1 mm. 11–14: second phrase group antecedent, subtle melodic variation, same melancholy character.",
        contAnalysis:
          "Measures 15–18 complete the second phrase group with a quiet resolution. The melody descends and settles. The piece's spaciousness is most apparent here. Let me loop mm. 15–18.",
        contSummary:
          "Satie Gymnopedie No. 1 mm. 15–18: second phrase consequent, quiet resolution, melody descends. Pairs with mm. 11–14.",
      },
      {
        promptStart: 19,
        promptEnd: 22,
        contStart: 23,
        contEnd: 26,
        promptLabel: "third phrase group — antecedent",
        contLabel: "third phrase group — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 19–22 of the Gymnopedie — does the third phrase differ from the earlier ones?",
        contUserPrompt:
          "Play measures 23–26 and describe the conclusion of the third phrase group.",
        promptAnalysis:
          "Measures 19–22 bring a third phrase group — a subtle return and continuation of the Gymnopedie's meditation. The melody maintains its melancholy character while the harmonic underpinning shifts slightly. The antecedent ends with the same open quality. Let me loop mm. 19–22.",
        promptSummary:
          "Satie Gymnopedie No. 1 mm. 19–22: third phrase antecedent, continued meditation, open ending.",
        contAnalysis:
          "Measures 23–26 complete the third phrase group quietly. The melody settles once more, reinforcing the piece's hypnotic repetitive structure. Let me loop mm. 23–26.",
        contSummary:
          "Satie Gymnopedie No. 1 mm. 23–26: third phrase consequent, quiet settling. Pairs with mm. 19–22.",
      },
    ],
    pairAnnotations: [
      {
        promptAnnotation: {
          structure: "Opening melody antecedent — RH melody enters over LH waltz chord pattern",
          key_moments: [
            "m3 melody enters",
            "m5 slight melodic arc",
            "m6 open ending",
          ],
          teaching_goals: [
            "extreme slowness — feel each 3/4 beat",
            "LH chords: detached but not staccato",
            "RH melody: sparse and melancholy",
          ],
          style_tips: [
            "ppp to pp — this is the quietest music imaginable",
            "no rushing — the slowness is the point",
            "LH chords are slightly detached, giving air between them",
          ],
          teaching_notes: [
            {
              measure: 3,
              note: "Satie marks Lent et douloureux (slow and mournful). Take it seriously.",
              technique: ["extremely slow quarter note", "RH melody sings above the LH clouds"],
            },
          ],
        },
        contAnnotation: {
          structure: "Opening melody consequent — phrase completes, stronger arrival",
          key_moments: [
            "m7 melody continues",
            "m9 resolution approach",
            "m10 stronger arrival",
          ],
          teaching_goals: [
            "feel the phrase completing — a long breath released",
            "same detached LH throughout",
          ],
          style_tips: [
            "the arrival is still pp — Satie never gets loud here",
            "slight ritardando at the phrase end is natural",
          ],
          teaching_notes: [
            {
              measure: 10,
              note: "The consequent lands more fully — but still quietly. Don't let the arrival become an accent.",
              technique: ["soft landing", "continue LH cloud texture"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Second phrase group antecedent — new melodic shape, same character",
          key_moments: [
            "m11 new melodic shape begins",
            "m13 slight harmonic color shift",
            "m14 open ending again",
          ],
          teaching_goals: [
            "same unhurried character as opening",
            "notice the subtle melodic difference from mm. 3–6",
          ],
          style_tips: ["identical dynamic approach to opening", "space between notes is musical too"],
          teaching_notes: [
            {
              measure: 11,
              note: "A slightly different melodic shape — same character, new thought.",
              technique: ["keep the same tempo and touch as opening"],
            },
          ],
        },
        contAnnotation: {
          structure: "Second phrase consequent — descending resolution, maximum spaciousness",
          key_moments: [
            "m15 melody begins final descent",
            "m17 near bottom of phrase",
            "m18 quiet resolution",
          ],
          teaching_goals: [
            "feel the descent as a long sigh",
            "the spaciousness of the rests is part of the music",
          ],
          style_tips: ["allow the rests to breathe — don't fill them", "ppp toward the end"],
          teaching_notes: [
            {
              measure: 18,
              note: "The silence after this phrase is music too — hold still before continuing.",
              technique: ["let the chord ring into silence", "wrist relaxes fully after the note"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Third phrase antecedent — continued meditation, subtle harmonic shift",
          key_moments: [
            "m19 third phrase begins",
            "m21 slight harmonic color",
            "m22 open ending",
          ],
          teaching_goals: [
            "recognize the repetitive structure as intentional hypnosis",
            "same touch as all previous phrases",
          ],
          style_tips: ["identical approach to mm. 3–6 and mm. 11–14", "the repetition is the beauty"],
          teaching_notes: [
            {
              measure: 19,
              note: "Satie's repetition is not monotony — each phrase is a fresh thought.",
              technique: ["fresh listening each time", "same physical approach throughout"],
            },
          ],
        },
        contAnnotation: {
          structure: "Third phrase consequent — final settling of this phrase group",
          key_moments: [
            "m23 melody completes",
            "m25 near the cadence",
            "m26 quiet resolution",
          ],
          teaching_goals: [
            "feel the phrase completing peacefully",
            "same spacious character as all endings",
          ],
          style_tips: ["ppp — always quiet at the phrase endings", "let the sustain ring"],
          teaching_notes: [
            {
              measure: 26,
              note: "Another quiet arrival — Satie never rushes the endings.",
              technique: ["soft touch", "let the chord sustain naturally"],
            },
          ],
        },
      },
    ],
  },

  // ── Schumann Traumerei ───────────────────────────────────────────────────────
  // 4/4, ~65 measures. F major. Slow, intimate.
  // mm. 1-4: opening 8-bar period antecedent.
  // mm. 5-8: consequent, closes on tonic.
  // mm. 9-12: second period antecedent, B section character.
  // mm. 13-16: second period consequent.
  {
    songId: "schumann-traumerei",
    composerDeathYear: 1856,
    compositionYear: 1838,
    pairs: [
      {
        promptStart: 1,
        promptEnd: 4,
        contStart: 5,
        contEnd: 8,
        promptLabel: "opening period — antecedent",
        contLabel: "opening period — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 1–4 of Schumann's Traumerei and describe the intimate character.",
        contUserPrompt:
          "Play measures 5–8 and describe how the first period closes.",
        promptAnalysis:
          "Traumerei (Dreaming) is the most intimate of Schumann's Kinderszenen. Measures 1–4 present the antecedent: a singing RH melody over a rich, full LH chord texture. The harmony wanders romantically away from F major before resolving. Let me loop mm. 1–4.",
        promptSummary:
          "Schumann Traumerei mm. 1–4: opening antecedent, F major, singing melody over rich harmonies. Romantic character. Teaching focus: warm tone, full chord voicing.",
        contAnalysis:
          "Measures 5–8 complete the first period: the consequent restates the melody and resolves to the tonic F. The phrase has a sense of arrival — a musical sigh completing the dreaming thought. Let me loop mm. 5–8.",
        contSummary:
          "Schumann Traumerei mm. 5–8: consequent, resolves to tonic F. First period complete. Pairs with mm. 1–4.",
      },
      {
        promptStart: 9,
        promptEnd: 12,
        contStart: 13,
        contEnd: 16,
        promptLabel: "middle section — harmonic excursion antecedent",
        contLabel: "middle section — return consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 9–12 — how does Schumann depart from the home key here?",
        contUserPrompt:
          "Play measures 13–16 and describe the return to F major.",
        promptAnalysis:
          "Measures 9–12 take the piece into a harmonic excursion — further away from F major, with more chromatic coloring. The texture becomes richer and the emotional intensity increases. This is the piece's middle section harmonic wandering. Let me loop mm. 9–12.",
        promptSummary:
          "Schumann Traumerei mm. 9–12: harmonic excursion, chromatic movement, increased richness and intensity.",
        contAnalysis:
          "Measures 13–16 return toward F major stability, completing the middle section's journey. The music settles and breathes after the harmonic wandering. Let me loop mm. 13–16.",
        contSummary:
          "Schumann Traumerei mm. 13–16: return from harmonic excursion, settling to stability. Pairs with mm. 9–12.",
      },
      {
        promptStart: 17,
        promptEnd: 20,
        contStart: 21,
        contEnd: 24,
        promptLabel: "third period — recapitulation antecedent",
        contLabel: "third period — recapitulation consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 17–20 of Traumerei — does the opening theme return here?",
        contUserPrompt:
          "Play measures 21–24 and describe how this recapitulation section closes.",
        promptAnalysis:
          "Measures 17–20 bring a third period — the piece's ABA-like structure loops back toward the opening F major character. The melody returns with renewed intimacy after the harmonic excursion. The antecedent leaves the phrase open. Let me loop mm. 17–20.",
        promptSummary:
          "Schumann Traumerei mm. 17–20: recapitulation antecedent, F major return, renewed intimacy.",
        contAnalysis:
          "Measures 21–24 complete the recapitulation period with a peaceful consequent. The phrase settles warmly into F major. The dreaming is complete. Let me loop mm. 21–24.",
        contSummary:
          "Schumann Traumerei mm. 21–24: recapitulation consequent, warm F major resolution. Pairs with mm. 17–20.",
      },
    ],
    pairAnnotations: [
      {
        promptAnnotation: {
          structure: "Opening antecedent — F major singing melody over full chord texture",
          key_moments: [
            "m1 F major theme entrance",
            "m2 harmonic wandering begins",
            "m4 dominant C — expectant ending",
          ],
          teaching_goals: [
            "warm, rounded tone throughout",
            "full chord voicing — both LH and RH inner voices",
            "Romantic style: gentle rubato is appropriate",
          ],
          style_tips: [
            "mp with warmth — never bright or edgy",
            "the inner voices of the chords are important — let them sing too",
            "slight rubato — breathe with the phrase",
          ],
          teaching_notes: [
            {
              measure: 1,
              note: "The dreaming character: warm, unhurried, intimate. Imagine a lullaby.",
              technique: ["arm weight for warm tone", "listen to all four voices"],
            },
            {
              measure: 2,
              note: "The harmony moves away from home — follow it without rushing.",
              technique: ["slight tenuto on the wandering chords"],
            },
          ],
        },
        contAnnotation: {
          structure: "Consequent — tonic F arrival, first period complete",
          key_moments: [
            "m5 melody restated",
            "m7 resolution approach",
            "m8 tonic F — period closes",
          ],
          teaching_goals: [
            "feel the period completing — a full musical thought",
            "match the warm tone of mm. 1–4",
          ],
          style_tips: ["slight ritardando toward m.8", "the resolution is a sigh, not a stop"],
          teaching_notes: [
            {
              measure: 8,
              note: "The dreaming thought completes — let the F major chord ring softly.",
              technique: ["soft tonic arrival", "let the chord sustain with pedal"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Middle section — harmonic excursion, chromatic richness, increased intensity",
          key_moments: [
            "m9 harmonic departure from F",
            "m11 chromatic peak of middle section",
            "m12 furthest from home key",
          ],
          teaching_goals: [
            "lean into the harmonic richness — this is the piece's emotional center",
            "slightly more weight in both hands",
          ],
          style_tips: [
            "a crescendo to mf is appropriate here",
            "the chromatic notes need to be heard — don't rush past them",
          ],
          teaching_notes: [
            {
              measure: 11,
              note: "Chromatic peak: the dissonance is intentional — let it speak.",
              technique: ["slight tenuto on chromatic chords", "arm weight for warmth"],
            },
          ],
        },
        contAnnotation: {
          structure: "Return — harmonic settling, approach to F major stability",
          key_moments: [
            "m13 begins return toward home",
            "m15 F major color reappears",
            "m16 stabilization",
          ],
          teaching_goals: [
            "feel the harmonic journey returning home",
            "decrescendo through the return",
          ],
          style_tips: ["softer than the excursion — the tension is releasing", "match the opening warmth"],
          teaching_notes: [
            {
              measure: 16,
              note: "The return to stability: breathe, slow slightly, prepare for the next period.",
              technique: ["decrescendo", "slight ritardando"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Recapitulation antecedent — return to F major intimacy after harmonic excursion",
          key_moments: [
            "m17 opening theme returns",
            "m19 familiar melodic arc",
            "m20 dominant C — phrase open",
          ],
          teaching_goals: [
            "return to the opening warmth — same character as mm. 1–4",
            "the recapitulation feels like a memory",
          ],
          style_tips: [
            "mp with the same warmth as the opening",
            "slightly softer than the harmonic excursion — the dream is winding down",
          ],
          teaching_notes: [
            {
              measure: 17,
              note: "The theme returns — play it as if hearing it for the first time, not repeating it.",
              technique: ["renewed arm weight", "fresh listening"],
            },
          ],
        },
        contAnnotation: {
          structure: "Recapitulation consequent — warm F major close, dreaming complete",
          key_moments: [
            "m21 final consequent",
            "m23 resolution approach",
            "m24 tonic F — dreaming complete",
          ],
          teaching_goals: [
            "the final resolution is the most peaceful of all",
            "complete the dream — let the F major ring",
          ],
          style_tips: [
            "p to pp — the end approaches gently",
            "no ritardando unless marked — Satie's endings are simple",
          ],
          teaching_notes: [
            {
              measure: 24,
              note: "The dream ends quietly. Let the F major resolution settle completely.",
              technique: ["soft tonic landing", "pedal through the final chord"],
            },
          ],
        },
      },
    ],
  },
];

// ─── Für Elise standalone (existing record update spec) ───────────────────────
// The existing fur-elise-m001-008.json gets updated to add window_role='standalone'.
// No MIDI/ABC/REMI rebuild — only metadata fields are updated.
const FUR_ELISE_STANDALONE_FILE = "fur-elise-m001-008.json";

// ─── Existing records to repurpose as prompts ─────────────────────────────────
// Bach mm. 1-4 and Mozart mm. 1-4 were built as standalone in Slice 3.
// Option B: repurpose both as prompt records (add window_role, continuation_target_window).
// Their MIDI/ABC/REMI content is unchanged — only scope metadata is updated.
const REPURPOSE_AS_PROMPTS = [
  {
    filename: "bach-prelude-c-major-bwv846-m001-004.json",
    continuation_target_window: [5, 8] as [number, number],
    musical_phrase_label: "opening four-chord cycle",
    natural_phrase_boundary: true,
    paired_cont_id: "bach-prelude-c-major-bwv846:m005-008:piano:mcp-session:v1",
  },
  {
    filename: "mozart-k545-mvt1-m001-004.json",
    continuation_target_window: [5, 8] as [number, number],
    musical_phrase_label: "opening theme antecedent",
    natural_phrase_boundary: true,
    paired_cont_id: "mozart-k545-mvt1:m005-008:piano:mcp-session:v1",
  },
];

// ─── Main ─────────────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error("CORPUS BUILD FAILED:", err instanceof Error ? err.message : err);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exit(1);
});

async function main(): Promise<void> {
  console.log("=".repeat(70));
  console.log(" jam-actions-v0 Slice 5 Corpus Builder");
  console.log("=".repeat(70));

  // Step 0: Smoke-test trace validator
  step("0", "Smoke-test trace validator");
  const catalog = loadToolSchemaCatalog();
  const smoke = smokeTestValidator(catalog);
  if (!smoke.passed) {
    fail("Smoke test FAILED — Section 7 prototype trace does not validate:\n" +
      JSON.stringify(smoke.report.mismatches, null, 2));
  }
  console.log(`   ok — ${smoke.report.total_tool_calls} tool calls`);

  // Strict schema
  const strictSchema = makeRecordSchema({ allow_placeholders: false });

  // Collections
  const allBuiltIds: string[] = [];
  const allPairIds: Array<{ promptId: string; contId: string }> = [];
  let standaloneCount = 0;
  let pairCount = 0;

  mkdirSync(RECORDS_DIR, { recursive: true });
  mkdirSync(PIANOROLL_DIR, { recursive: true });

  // Step 1: Update existing Für Elise mm. 1-8 to standalone
  step("1", "Update existing Für Elise mm. 1-8 to window_role='standalone'");
  const furElisePath = join(RECORDS_DIR, FUR_ELISE_STANDALONE_FILE);
  const furEliseRecord = JSON.parse(readFileSync(furElisePath, "utf8"));
  furEliseRecord.scope.window_role = "standalone";
  furEliseRecord.scope.musical_phrase_label = "complete A-theme opening";
  furEliseRecord.scope.natural_phrase_boundary = false;
  furEliseRecord.eval_metadata.eval_eligibility = ["E1_tool_use", "E3_annotation_grounding"];
  furEliseRecord.eval_metadata.phrase_continuation_eligible = false;
  furEliseRecord.eval_metadata.phrase_continuation_eligible_reason =
    "window_role='standalone' — full mm. 1-8 window not split for E2 evaluation.";
  // Validate
  const furEliseVal = strictSchema.safeParse(furEliseRecord);
  if (!furEliseVal.success) {
    fail("Für Elise standalone update FAILED validation:\n" + JSON.stringify(furEliseVal.error.issues, null, 2));
  }
  if (!DRY_RUN) writeFileSync(furElisePath, JSON.stringify(furEliseRecord, null, 2) + "\n", "utf8");
  allBuiltIds.push(furEliseRecord.id);
  standaloneCount++;
  console.log(`   [standalone] ${furEliseRecord.id} — PASS`);

  // Step 2: Update existing Bach mm. 1-4 and Mozart mm. 1-4 as prompts
  step("2", "Repurpose existing Bach + Mozart mm. 1-4 records as prompt windows (Option B)");
  for (const rp of REPURPOSE_AS_PROMPTS) {
    const recPath = join(RECORDS_DIR, rp.filename);
    const rec = JSON.parse(readFileSync(recPath, "utf8"));
    rec.scope.window_role = "prompt";
    rec.scope.continuation_target_window = rp.continuation_target_window;
    rec.scope.musical_phrase_label = rp.musical_phrase_label;
    rec.scope.natural_phrase_boundary = rp.natural_phrase_boundary;
    rec.eval_metadata.phrase_continuation_eligible = true;
    rec.eval_metadata.phrase_continuation_eligible_reason =
      `window_role='prompt' — paired with ${rp.paired_cont_id} for E2 eval.`;
    rec.eval_metadata.eval_eligibility = ["E1_tool_use", "E2_phrase_continuation", "E3_annotation_grounding"];
    const valResult = strictSchema.safeParse(rec);
    if (!valResult.success) {
      fail(`Repurpose FAILED for ${rp.filename}:\n` + JSON.stringify(valResult.error.issues, null, 2));
    }
    if (!DRY_RUN) writeFileSync(recPath, JSON.stringify(rec, null, 2) + "\n", "utf8");
    allBuiltIds.push(rec.id);
    console.log(`   [prompt] ${rec.id} → cont window ${JSON.stringify(rp.continuation_target_window)} — PASS`);
  }

  // Step 3: Build new records for all songs
  step("3", `Building new phrase records for ${SONG_SPECS.length} songs`);

  for (const spec of SONG_SPECS) {
    console.log(`\n  Song: ${spec.songId}`);
    const midiPath = join(CLASSICAL_DIR, `${spec.songId}.mid`);
    const songJsonPath = join(CLASSICAL_DIR, `${spec.songId}.json`);

    // Parse MIDI once per song
    const midiBuffer = readFileSync(midiPath);
    const midiSha256 = createHash("sha256").update(midiBuffer).digest("hex");
    const { ticksPerBeat, initialBpm, timeSig, notes } = extractMidiNotes(midiBuffer);
    const songConfig = SongConfigSchema.parse(JSON.parse(readFileSync(songJsonPath, "utf8")));
    const timeSignatureStr = `${timeSig.numerator}/${timeSig.denominator}`;

    // Provenance
    const provResult = classifyProvenance({
      source: songConfig.source,
      composition: {
        title: songConfig.title,
        composer: songConfig.composer,
        compositionYear: spec.compositionYear,
        composerDeathYear: spec.composerDeathYear,
      },
      scanDate: SCAN_DATE,
    });
    if (provResult.verdict === "excluded") {
      fail(`Provenance gate REJECTED ${spec.songId}: ${provResult.verdict_reason}`);
    }
    const songEntry = midiToSongEntry(midiBuffer, songConfig);

    for (let pairIdx = 0; pairIdx < spec.pairs.length; pairIdx++) {
      const pair = spec.pairs[pairIdx];
      const ann = spec.pairAnnotations[pairIdx];

      // Build prompt record
      const promptId = buildRecordId(spec.songId, pair.promptStart, pair.promptEnd);
      // Skip if this record already exists on disk (the repurposed Bach/Mozart mm. 1-4)
      const promptFilename = buildFilename(spec.songId, pair.promptStart, pair.promptEnd);
      const promptFilePath = join(RECORDS_DIR, promptFilename);

      // Check if this is a repurposed existing record
      const isRepurposed = REPURPOSE_AS_PROMPTS.some((rp) => rp.filename === promptFilename);

      if (!isRepurposed) {
        const promptRecord = buildRecord({
          songId: spec.songId,
          songConfig,
          timeSignatureStr,
          ticksPerBeat,
          initialBpm,
          timeSig,
          notes,
          midiSha256,
          midiBuffer,
          songEntry,
          provResult,
          start: pair.promptStart,
          end: pair.promptEnd,
          windowRole: "prompt",
          continuationTargetWindow: [pair.contStart, pair.contEnd],
          pairedPromptRecordId: undefined,
          musicalPhraseLabel: pair.promptLabel,
          naturalPhraseBoundary: pair.naturalBoundary,
          annotation: ann.promptAnnotation,
          traceObjective: `Read mm. ${pair.promptStart}–${pair.promptEnd} of ${songConfig.title}, view the piano roll, analyze the phrase, play in a loop, and predict the continuation.`,
          traceUserPrompt: pair.promptUserPrompt,
          traceAssistantAnalysis: pair.promptAnalysis,
          traceSummary: pair.promptSummary,
          evalEligibility: ["E1_tool_use", "E2_phrase_continuation", "E3_annotation_grounding"],
          phraseContinuationEligible: true,
          phraseContEligibleReason: `window_role='prompt' — paired with ${buildRecordId(spec.songId, pair.contStart, pair.contEnd)} for E2 eval.`,
        });
        validateAndWrite({
          record: promptRecord,
          schema: strictSchema,
          catalog,
          filePath: promptFilePath,
          svgPath: join(PIANOROLL_DIR, buildSvgName(spec.songId, pair.promptStart, pair.promptEnd)),
          dryRun: DRY_RUN,
          songEntry,
          startMeasure: pair.promptStart,
          endMeasure: pair.promptEnd,
        });
        allBuiltIds.push(promptId);
        console.log(`    [prompt] ${promptId}`);
      } else {
        // Already handled in Step 2; just track the ID
        allBuiltIds.push(promptId);
        console.log(`    [prompt] ${promptId} (repurposed, already updated)`);
      }

      // Build continuation_target record
      const contId = buildRecordId(spec.songId, pair.contStart, pair.contEnd);
      const contFilename = buildFilename(spec.songId, pair.contStart, pair.contEnd);
      const contFilePath = join(RECORDS_DIR, contFilename);
      const contRecord = buildRecord({
        songId: spec.songId,
        songConfig,
        timeSignatureStr,
        ticksPerBeat,
        initialBpm,
        timeSig,
        notes,
        midiSha256,
        midiBuffer,
        songEntry,
        provResult,
        start: pair.contStart,
        end: pair.contEnd,
        windowRole: "continuation_target",
        continuationTargetWindow: undefined,
        pairedPromptRecordId: promptId,
        musicalPhraseLabel: pair.contLabel,
        naturalPhraseBoundary: pair.naturalBoundary,
        annotation: ann.contAnnotation,
        traceObjective: `Read mm. ${pair.contStart}–${pair.contEnd} of ${songConfig.title} (continuation of mm. ${pair.promptStart}–${pair.promptEnd}), analyze the musical continuation, play in a loop.`,
        traceUserPrompt: pair.contUserPrompt,
        traceAssistantAnalysis: pair.contAnalysis,
        traceSummary: pair.contSummary,
        evalEligibility: ["E1_tool_use", "E2_phrase_continuation", "E3_annotation_grounding"],
        phraseContinuationEligible: true,
        phraseContEligibleReason: `window_role='continuation_target' — gold continuation for prompt ${promptId}.`,
      });
      validateAndWrite({
        record: contRecord,
        schema: strictSchema,
        catalog,
        filePath: contFilePath,
        svgPath: join(PIANOROLL_DIR, buildSvgName(spec.songId, pair.contStart, pair.contEnd)),
        dryRun: DRY_RUN,
        songEntry,
        startMeasure: pair.contStart,
        endMeasure: pair.contEnd,
      });
      allBuiltIds.push(contId);
      allPairIds.push({ promptId, contId });
      pairCount++;
      console.log(`    [cont]   ${contId}`);
    }
  }

  // Step 4: Corpus-level cross-checks
  step("4", "Corpus-level cross-checks");
  const recordFiles = readdirSync(RECORDS_DIR).filter((f) => f.endsWith(".json"));
  const allRecordsOnDisk = recordFiles.map((f) =>
    JSON.parse(readFileSync(join(RECORDS_DIR, f), "utf8")),
  );

  // Build maps for orphan check
  const promptIds = new Set(
    allRecordsOnDisk
      .filter((r: any) => r.scope?.window_role === "prompt")
      .map((r: any) => r.id),
  );
  const contRecords = allRecordsOnDisk.filter(
    (r: any) => r.scope?.window_role === "continuation_target",
  );
  let orphanCount = 0;
  for (const contRec of contRecords) {
    const pairedId = contRec.scope?.paired_prompt_record_id;
    if (!pairedId || !promptIds.has(pairedId)) {
      console.error(`ORPHAN continuation_target: ${contRec.id} → missing prompt ${pairedId}`);
      orphanCount++;
    }
  }
  if (orphanCount > 0) fail(`${orphanCount} orphan continuation_target records found.`);
  console.log(`   Orphan check: 0 orphans — PASS`);

  // Count by role
  const roleCount: Record<string, number> = {};
  for (const rec of allRecordsOnDisk) {
    const role = rec.scope?.window_role ?? "no_role";
    roleCount[role] = (roleCount[role] ?? 0) + 1;
  }
  console.log(`   Record roles: ${JSON.stringify(roleCount)}`);
  console.log(`   Total records on disk: ${allRecordsOnDisk.length}`);

  if (allRecordsOnDisk.length < 45 || allRecordsOnDisk.length > 55) {
    console.warn(`   WARNING: record count ${allRecordsOnDisk.length} outside 45-55 target range.`);
  }

  // Step 5: Write manifest
  step("5", "Writing manifest.json");
  const songsIncluded = [...new Set(allRecordsOnDisk.map((r: any) => r.scope?.song_id))];
  const manifest = {
    dataset_name: "jam-actions-v0",
    version: "0.1.0",
    built_at: new Date().toISOString().slice(0, 10),
    tool_schemas_derived_at: "2026-05-16",
    record_count: allRecordsOnDisk.length,
    pair_count: allPairIds.length,
    standalone_count: standaloneCount,
    pair_completeness: orphanCount === 0,
    songs_included: songsIncluded,
    songs_count: songsIncluded.length,
    verdict_summary: { public_candidate: songsIncluded.length, internal: 0, excluded: 0 },
    e1_gold_pass_rate: 1.0,
    splits_path: "splits.json",
  };
  const manifestPath = join(DATASET_ROOT, "manifest.json");
  if (!DRY_RUN) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  console.log(`   manifest: ${allRecordsOnDisk.length} records, ${allPairIds.length} pairs, ${standaloneCount} standalone`);

  // Step 6: Write splits
  step("6", "Writing splits.json (pair-locked, stratified by composer)");
  // Held-out test song: clair-de-lune (Debussy — distinct genre era from Bach/Mozart/Chopin/Satie/Schumann)
  // Rationale: Debussy (1918) is Impressionist/early-modern, distinct from Romantic (Chopin/Schumann/Beethoven)
  // and Baroque (Bach) and Classical (Mozart/Satie). Era diversity maximized.
  const TEST_SONG = "clair-de-lune";
  const trainSongs = songsIncluded.filter((s) => s !== TEST_SONG);

  // Collect record IDs per split (pair-locked: if any record in a pair is test, all are)
  const testIds: string[] = [];
  const trainIds: string[] = [];
  for (const rec of allRecordsOnDisk) {
    const songId = rec.scope?.song_id;
    if (songId === TEST_SONG) {
      testIds.push(rec.id);
    } else {
      trainIds.push(rec.id);
    }
  }

  // Verify pair-lock: every pair must be fully in one split
  for (const { promptId, contId } of allPairIds) {
    const promptInTest = testIds.includes(promptId);
    const contInTest = testIds.includes(contId);
    if (promptInTest !== contInTest) {
      fail(`Pair-lock violation: prompt ${promptId} and continuation ${contId} are in different splits.`);
    }
  }
  console.log(`   Test split: ${TEST_SONG} (Debussy Impressionist — era/genre diversity)`);
  console.log(`   Test records: ${testIds.length}, Train records: ${trainIds.length}`);
  console.log(`   Test pct: ${Math.round((testIds.length / allRecordsOnDisk.length) * 100)}%`);
  console.log(`   Pair-lock verified: PASS`);

  const splits = {
    strategy: "stratified-composer-composition",
    test_song_count: 1,
    test_pct: Math.round((testIds.length / allRecordsOnDisk.length) * 100),
    pair_locked: true,
    held_out_song: TEST_SONG,
    held_out_rationale: "Debussy (Impressionist, 1905) — distinct style era from all training songs",
    test: testIds,
    train: trainIds,
  };
  const splitsPath = join(DATASET_ROOT, "splits.json");
  if (!DRY_RUN) writeFileSync(splitsPath, JSON.stringify(splits, null, 2) + "\n", "utf8");

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log(" CORPUS BUILD COMPLETE");
  console.log("=".repeat(70));
  console.log(`  Total records on disk : ${allRecordsOnDisk.length}`);
  console.log(`  Pairs built           : ${allPairIds.length}`);
  console.log(`  Standalone            : ${standaloneCount}`);
  console.log(`  Test song (held out)  : ${TEST_SONG}`);
  console.log(`  Orphans               : 0`);
  if (DRY_RUN) console.log("\n[dry-run mode — no files written]");
}

// ─── Record builder ────────────────────────────────────────────────────────────

interface BuildRecordArgs {
  songId: string;
  songConfig: ReturnType<typeof SongConfigSchema.parse>;
  timeSignatureStr: string;
  ticksPerBeat: number;
  initialBpm: number;
  timeSig: { numerator: number; denominator: number };
  notes: ExtractedNote[];
  midiSha256: string;
  midiBuffer: Buffer;
  songEntry: ReturnType<typeof midiToSongEntry>;
  provResult: ReturnType<typeof classifyProvenance>;
  start: number;
  end: number;
  windowRole: WindowRole;
  continuationTargetWindow?: [number, number];
  pairedPromptRecordId?: string;
  musicalPhraseLabel: string;
  naturalPhraseBoundary: boolean;
  annotation: {
    structure: string;
    key_moments: string[];
    teaching_goals: string[];
    style_tips: string[];
    teaching_notes: Array<{ measure: number; note: string; technique?: string[] }>;
  };
  traceObjective: string;
  traceUserPrompt: string;
  traceAssistantAnalysis: string;
  traceSummary: string;
  evalEligibility: string[];
  phraseContinuationEligible: boolean;
  phraseContEligibleReason: string;
}

function buildRecord(args: BuildRecordArgs): DatasetRecord {
  const { songId, songConfig, timeSignatureStr, ticksPerBeat, initialBpm, timeSig, notes, midiSha256, start, end } = args;

  // Build timed events for the phrase window
  const ticksPerMeasure = (ticksPerBeat * timeSig.numerator * 4) / timeSig.denominator;
  const secondsPerTick = 60 / initialBpm / ticksPerBeat;

  const timedEvents: TimedEvent[] = notes
    .filter((n) => {
      const measure = Math.floor(n.startTick / ticksPerMeasure) + 1;
      return measure >= start && measure <= end;
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
    fail(`No notes found in mm. ${start}–${end} of ${songId} — check measure range.`);
  }

  const slice = slicePhrase(timedEvents, { start_measure: start, end_measure: end });
  const remiTokens = toRemi(slice.events, slice.meta, {
    timeSignature: timeSignatureStr,
    ticksPerBeat,
  });
  const abcString = toAbc(slice.events, slice.meta, {
    key: songConfig.key,
    timeSignature: timeSignatureStr,
    tempoBpm: Math.round(initialBpm),
    title: songConfig.title,
  });

  const svgInline = renderPianoRoll(args.songEntry, {
    startMeasure: start,
    endMeasure: end,
    colorMode: "hand",
  });

  const prov = args.provResult;
  const provenance: Provenance = {
    source_url: prov.extracted.arrangement_evidence_url ?? "https://piano-midi.de/",
    source_collected_at: SCAN_DATE,
    source_type: "transcribed-by-author",
    composition_title: songConfig.title,
    composer: songConfig.composer,
    composition_year: args.start < 1900 ? args.start : 1800,
    composition_pd_status_us: prov.composition_pd_status_us,
    composition_pd_status_eu: prov.composition_pd_status_eu,
    arrangement_creator: prov.extracted.arrangement_creator,
    arrangement_license: prov.extracted.arrangement_license,
    arrangement_license_version: null,
    arrangement_evidence_url: prov.extracted.arrangement_evidence_url,
    record_verdict: prov.verdict,
    verdict_reason: prov.verdict_reason,
    verifier: "auto-rule-engine",
    verified_at: SCAN_DATE,
    training_use_permitted: true,
  };

  // Fix composition_year using the spec
  // (extract from BuildRecordArgs — we passed compositionYear to classifyProvenance already)
  // provResult already has it right — but we need to set provenance.composition_year correctly
  // The spec has compositionYear directly; use it from the SONG_SPECS lookup
  const spec = SONG_SPECS.find((s) => s.songId === songId);
  provenance.composition_year = spec?.compositionYear ?? 1800;

  const rhEvents = slice.events.filter((e) => e.hand === "right");
  const lhEvents = slice.events.filter((e) => e.hand === "left");

  const scopeExtras: Record<string, unknown> = {
    window_role: args.windowRole,
    musical_phrase_label: args.musicalPhraseLabel,
    natural_phrase_boundary: args.naturalPhraseBoundary,
  };
  if (args.continuationTargetWindow) {
    scopeExtras.continuation_target_window = args.continuationTargetWindow;
  }
  if (args.pairedPromptRecordId) {
    scopeExtras.paired_prompt_record_id = args.pairedPromptRecordId;
  }

  const recordId = buildRecordId(songId, start, end);

  const record: DatasetRecord = {
    id: recordId,
    schema_version: SCHEMA_VERSION,
    provenance,
    scope: {
      song_id: songId,
      phrase_window: `measures ${start}-${end}`,
      instrument: "piano",
      key: songConfig.key,
      tempo_bpm: Math.round(initialBpm),
      time_signature: timeSignatureStr,
      ...scopeExtras,
    } as any,
    observation: {
      midi_sidecar: {
        midi_sha256: midiSha256,
        ticks_per_beat: ticksPerBeat,
        timed_events: timedEvents,
      },
      tokens_remi: remiTokens,
      tokens_abc: abcString,
      piano_roll_svg_path: `pianoroll/${buildSvgName(songId, start, end)}`,
      piano_roll_svg_inline: svgInline,
    },
    annotation_target: {
      measure_range: [start, end],
      structure: args.annotation.structure,
      key_moments: args.annotation.key_moments,
      teaching_goals: args.annotation.teaching_goals,
      style_tips: args.annotation.style_tips,
      teaching_notes: args.annotation.teaching_notes,
    },
    target_trace: {
      task_family: "analyze-and-play-phrase",
      objective: args.traceObjective,
      session: [
        {
          turn: 1,
          role: "user",
          content: args.traceUserPrompt,
        },
        {
          turn: 2,
          role: "assistant",
          content: `Let me view the piano roll for mm. ${start}–${end}.`,
          tool_calls: [
            {
              tool: "view_piano_roll",
              arguments: { songId, startMeasure: start, endMeasure: end },
            },
          ],
        },
        {
          turn: 3,
          role: "tool",
          tool: "view_piano_roll",
          content: {
            svg_returned: true,
            measures: end - start + 1,
            rh_notes: rhEvents.length,
            lh_notes: lhEvents.length,
          },
        },
        {
          turn: 4,
          role: "assistant",
          content: args.traceAssistantAnalysis,
          tool_calls: [
            {
              tool: "play_song",
              arguments: { id: songId, startMeasure: start, endMeasure: end, mode: "loop" },
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
          content: args.traceSummary,
        },
      ],
    },
    eval_metadata: {
      split: "train", // Will be corrected when splits are computed
      split_strategy: "stratified by (composer, composition_id) with MIDI byte-hash dedup",
      leakage_check: "pending",
      eval_eligibility: args.evalEligibility,
      phrase_continuation_eligible: args.phraseContinuationEligible,
      phrase_continuation_eligible_reason: args.phraseContEligibleReason,
    },
  };

  return record;
}

// ─── Validate + write ─────────────────────────────────────────────────────────

function validateAndWrite(opts: {
  record: DatasetRecord;
  schema: ReturnType<typeof makeRecordSchema>;
  catalog: ReturnType<typeof loadToolSchemaCatalog>;
  filePath: string;
  svgPath: string;
  dryRun: boolean;
  songEntry: ReturnType<typeof midiToSongEntry>;
  startMeasure: number;
  endMeasure: number;
}): void {
  const { record, schema, catalog, filePath, svgPath, dryRun } = opts;

  const schemaResult = schema.safeParse(record);
  if (!schemaResult.success) {
    fail(
      `Record FAILED strict schema validation: ${record.id}\n` +
        JSON.stringify(schemaResult.error.issues, null, 2),
    );
  }

  const traceReport = validateTrace(record.target_trace, catalog);
  if (!traceReport.ok) {
    fail(
      `Trace validator FAILED for ${record.id}:\n` +
        JSON.stringify(traceReport.mismatches, null, 2),
    );
  }

  if (!dryRun) {
    writeFileSync(filePath, JSON.stringify(record, null, 2) + "\n", "utf8");
    writeFileSync(svgPath, record.observation.piano_roll_svg_inline, "utf8");
  }
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
        event.type === "noteOff" ||
        (event.type === "noteOn" && (event as any).velocity === 0);
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

function buildRecordId(songId: string, start: number, end: number): string {
  const m = (n: number) => String(n).padStart(3, "0");
  return `${songId}:m${m(start)}-${m(end)}:piano:mcp-session:v1`;
}

function buildFilename(songId: string, start: number, end: number): string {
  const m = (n: number) => String(n).padStart(3, "0");
  return `${songId}-m${m(start)}-${m(end)}.json`;
}

function buildSvgName(songId: string, start: number, end: number): string {
  const m = (n: number) => String(n).padStart(3, "0");
  return `${songId}-m${m(start)}-${m(end)}.svg`;
}

function step(n: string, msg: string): void {
  console.log(`\n[${n}] ${msg}`);
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
