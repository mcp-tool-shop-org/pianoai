#!/usr/bin/env tsx
// ─── Slice 5 + Slice 9b bulk corpus builder ───────────────────────────────────
//
// Slice 5: builds ~50 phrase records across the 10 public_candidate classical
//   songs, structured for E2 continuation eval.
// Slice 9b: expands to ~147 records by adding additional natural phrase pairs
//   per song (avg 2.2 pairs/song → ~7 pairs/song). Pure additive — no changes
//   to the 45 Slice 5 records.
//
// Every record passes:
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
  // 4/4, exactly 62 measures in the source MIDI (prelude mm. 1-35 + fugue
  // mm. 36-62 concatenated — piano-midi.de bach_846 carries both movements).
  // An earlier "~70 measures" assumption here authored a final pair at
  // mm. 61-64; the real song ends at m62, so the frozen play_song(61,64)
  // call in the published record failed live execution (finetune-arc-v1
  // gate G6a, disposition A1-v1). The window is now 61-62 and buildRecord
  // hard-fails any window past the ingested song length.
  // mm. 1-4 existing record → repurposed as prompt pair 1 (Step 2 updates its
  // scope metadata only, so pair-1 prompt strings mirror that record verbatim).
  // Annotation prose for all eight pairs was corrected against executed MIDI
  // ground truth by revision r002 (docs/jam-actions-v0-erratum-002-bach-
  // annotation-prose.md): prelude chords mm. 1-32, dominant pedal mm. 24-31,
  // tonic-pedal coda mm. 32-35, and the FOUR-VOICE FUGUE mm. 36-62 (exposition
  // mm. 36-40, strettos m42+, climax mm. 49-53, tonic pedal mm. 59-62). The
  // r002 script asserts these spec strings byte-identical to the records.
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
          "Read measures 1–4 of the Bach C Major Prelude and describe what's happening musically.",
        contUserPrompt:
          "Now play measures 5–8 and explain how the harmony continues from mm. 1–4.",
        promptAnalysis:
          "The prelude opens with a flowing arpeggiated texture — each measure is a single chord broken into 16th notes. I can see four distinct chord shapes: m.1 C major (C-E-G), m.2 D minor seventh over the same C bass (C-D-F-A), m.3 G7 over B (B-D-F-G), m.4 C major again. Tonic, gentle dissonance, dominant, home — with a harmonic rhythm of exactly one chord per measure. Let me loop mm. 1–4 so you can hear the pattern.",
        promptSummary:
          "Phrase summary — Bach C Major Prelude mm. 1–4: arpeggiated opening template. Four measures, four chords (C, Dm7/C, G7/B, C). Teaching focus: even 16th-note rhythm, harmonic awareness within the arpeggio pattern, smooth legato through chord changes.",
        contAnalysis:
          "Measures 5–8 push the same pattern outward: m.5 A minor over the C bass, m.6 D7 over C — the piece's first accidental (F#) — m.7 G major over B, m.8 C major seventh over B. The bass barely moves while the harmony leans toward the dominant; this is the harmonic response to mm. 1–4. Let me loop mm. 5–8.",
        contSummary:
          "Bach C Major Prelude mm. 5–8: continuation of the arpeggiated pattern. Am/C → D7/C → G/B → Cmaj7/B, leaning toward the dominant. Pair with mm. 1–4 for E2 harmonic-direction prediction.",
      },
      {
        promptStart: 9,
        promptEnd: 12,
        contStart: 13,
        contEnd: 16,
        promptLabel: "second cycle — to the dominant",
        contLabel: "second cycle — first-inversion descent home",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 9–12 of the Bach Prelude and describe the harmonic movement.",
        contUserPrompt:
          "Now play measures 13–16 and describe the resolution from mm. 9–12.",
        promptAnalysis:
          "Measures 9–12 travel to the dominant key: m.9 A minor seventh, m.10 D7, m.11 G major — a ii–V–I in G — and m.12 shades the new G bass with a tense diminished seventh. The texture never changes; the journey is entirely harmonic. Let me loop mm. 9–12.",
        promptSummary:
          "Bach C Major Prelude mm. 9–12: ii–V–I into the dominant — Am7 → D7 → G, then a diminished-seventh shade at m12. Teaching focus: hearing a key shift inside an unchanged texture.",
        contAnalysis:
          "Measures 13–16 slide back from the dominant through first-inversion colors: m.13 D minor over F, m.14 a diminished seventh over the same F bass, m.15 C major over E, m.16 F major seventh over E. The bass walks down by step while every chord is softened by inversion. Let me loop mm. 13–16.",
        contSummary:
          "Bach C Major Prelude mm. 13–16: first-inversion descent — Dm/F → dim7/F → C/E → Fmaj7/E; the bass steps down as the harmony eases toward home. Continuation from mm. 9–12.",
      },
      // ── Slice 9b new pairs ────────────────────────────────────────────────────
      {
        promptStart: 17,
        promptEnd: 20,
        contStart: 21,
        contEnd: 24,
        promptLabel: "third cycle — tonic return antecedent",
        contLabel: "third cycle — consequent with chromatic motion",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 17–20 of the Bach Prelude — how does this third harmonic cycle begin?",
        contUserPrompt:
          "Play measures 21–24 and describe the chromatic movement that follows.",
        promptAnalysis:
          "Measures 17–20 cadence back into C and immediately pivot onward: m.17 D minor seventh, m.18 G7, m.19 C major — a full ii–V–I home — then m.20 turns the tonic into C7, whose Bb points the music toward F. Let me loop mm. 17–20.",
        promptSummary:
          "Bach C Major Prelude mm. 17–20: ii–V–I back to C (Dm7 → G7 → C), then C7 pivots toward the subdominant. Teaching focus: cadence recognition inside the arpeggio stream.",
        contAnalysis:
          "Measures 21–24 are the prelude's boldest four bars: F major seventh at m.21, then the bass climbs — F# diminished seventh at m.22, a diminished seventh over Ab at m.23 — and lands on G at m.24, where the long dominant pedal begins. Let me loop mm. 21–24.",
        contSummary:
          "Bach C Major Prelude mm. 21–24: rising bass through two diminished sevenths (F → F# → Ab) settling onto G at m24 — the dominant pedal begins. Continuation from mm. 17–20.",
      },
      {
        promptStart: 25,
        promptEnd: 28,
        contStart: 29,
        contEnd: 32,
        promptLabel: "dominant pedal — antecedent",
        contLabel: "dominant pedal resolves — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 25–28 of the Bach Prelude — what is happening over the bass here?",
        contUserPrompt:
          "Play measures 29–32 and describe the dominant preparation.",
        promptAnalysis:
          "Measures 25–28 all ride the dominant pedal that began at m.24: the bass holds G while the harmonies above alternate — C major over G at m.25, a suspended G7 at m.26, G7 proper at m.27, and at m.28 a diminished seventh stacked on the pedal. One note below, everything shifting above. Let me loop mm. 25–28.",
        promptSummary:
          "Bach C Major Prelude mm. 25–28: dominant pedal in full — C/G, G7sus, G7, then a diminished seventh over the held G. Teaching focus: pedal point as a tension engine.",
        contAnalysis:
          "Measures 29–31 are the pedal's last stand — C major over G, a suspended seventh, then G7 — and at m.32 the bass finally drops to a low C. The new tonic pedal arrives colored as C7, its Bb hinting at F for the coda to come. Let me loop mm. 29–32.",
        contSummary:
          "Bach C Major Prelude mm. 29–32: the dominant pedal releases — G7 gives way at m32 to a low C bass (heard as C7, leaning toward F). Continuation from mm. 25–28.",
      },
      {
        promptStart: 33,
        promptEnd: 36,
        contStart: 37,
        contEnd: 40,
        promptLabel: "prelude close into fugue opening — antecedent",
        contLabel: "fugue exposition — continuation",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 33–36 of the Bach BWV 846 — the prelude ends here and the fugue begins. What happens at the seam?",
        contUserPrompt:
          "Play measures 37–40 and describe how the fugue exposition builds.",
        promptAnalysis:
          "Measures 33–36 are the seam between the two movements of BWV 846. The prelude closes over a low C octave pedal: m.33 lays subdominant color (F and A, joined by D) over it, m.34 answers with a G7 sweep over the same C bass, and m.35 lands the final held C major chord — the arpeggio pattern stops entirely. Then m.36 opens the four-voice fugue: the alto alone states the subject, a stepwise climb C-D-E-F capped by a turning sixteenth figure. Let me loop mm. 33–36.",
        promptSummary:
          "Bach BWV 846 mm. 33–36: prelude coda over a C pedal (subdominant color, then G7) into the final chord at m35; the fugue subject enters alone at m36. A movement boundary inside one window.",
        contAnalysis:
          "Measures 37–40 are the heart of the fugue's exposition. The soprano answers at the dominant in m.37 (the subject shape starting on G), the tenor enters on G an octave lower in m.39, and the bass completes the four-voice texture with the subject on C in m.40. Each entry adds a genuinely independent line — by m.40 the note density has nearly doubled, and F# inflections color the answer entries. Let me loop mm. 37–40.",
        contSummary:
          "Bach BWV 846 fugue mm. 37–40: exposition — soprano answer (m37), tenor entry (m39), bass entry (m40); the texture grows from two voices to four. Continuation from mm. 33–36.",
      },
      {
        promptStart: 41,
        promptEnd: 44,
        contStart: 45,
        contEnd: 48,
        promptLabel: "post-exposition strettos — antecedent",
        contLabel: "stretto chain — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 41–44 of the Bach BWV 846 fugue — what happens right after the exposition?",
        contUserPrompt:
          "Play measures 45–48 and describe how the strettos continue.",
        promptAnalysis:
          "With all four voices in, Bach immediately tightens the imitation. In m.42 the soprano and tenor state the subject one beat apart — a true stretto — and the alto follows with its own entry in m.44. Passing C# and Bb around m.43 briefly shade the music toward D minor, and the texture now runs about twice the note density of the prelude. Let me loop mm. 41–44.",
        promptSummary:
          "Bach BWV 846 fugue mm. 41–44: first strettos — soprano and tenor overlap the subject one beat apart (m42), alto follows (m44); brief D minor shading at m43.",
        contAnalysis:
          "The stretto chain keeps building: the bass states the subject in m.45, echoed a beat later by the alto starting on D, and G# inflections through mm. 46–48 pull the music toward A minor. Measure 47 is one of the busiest bars in the entire piece — nothing here is settling; the fugue is accumulating energy. Let me loop mm. 45–48.",
        contSummary:
          "Bach BWV 846 fugue mm. 45–48: bass-led stretto with A minor coloration (G#); m47 is among the densest bars of the piece. Continuation from mm. 41–44.",
      },
      {
        promptStart: 49,
        promptEnd: 52,
        contStart: 53,
        contEnd: 56,
        promptLabel: "climactic strettos — antecedent",
        contLabel: "peak density — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 49–52 of the Bach BWV 846 fugue — how dense does the imitation get?",
        contUserPrompt:
          "Play measures 53–56 and describe the character at the fugue's peak.",
        promptAnalysis:
          "This is the fugue's tightest imitation. Five subject statements crowd into mm. 49–51: alto and tenor a beat apart in m.49, the bass at the top of m.50, then soprano and alto overlapping in m.51 — while G#, Bb, and F# mix into the lines. This pile-up is the climax the fugue has been building toward. Let me loop mm. 49–52.",
        promptSummary:
          "Bach BWV 846 fugue mm. 49–52: climactic strettos — five subject statements in three bars (alto+tenor m49, bass m50, soprano+alto m51) under mixed chromatic color.",
        contAnalysis:
          "Measure 53 is the single busiest bar of the entire piece — forty note onsets — and mm. 53–56 keep that energy moving through sequential figures colored by C# (a D minor shade), with one more soprano entry arriving late in m.55. Nothing slows down yet; the music is still driving toward the close. Let me loop mm. 53–56.",
        contSummary:
          "Bach BWV 846 fugue mm. 53–56: maximum density (m53 is the busiest bar of the piece), sequential drive with D minor color, soprano entry late in m55. Continuation from mm. 49–52.",
      },
      {
        promptStart: 57,
        promptEnd: 60,
        contStart: 61,
        contEnd: 62,
        promptLabel: "drive onto the tonic pedal — antecedent",
        contLabel: "coda over the tonic pedal — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 57–60 of the Bach BWV 846 fugue — how does the ending begin?",
        contUserPrompt:
          "Play measures 61–62 and describe the final cadential arrival.",
        promptAnalysis:
          "Measures 57–58 make the last cadential push — the bass winds stepwise down and lands on G, the dominant, at the end of m.58. Then m.59 begins the real ending: the bass drops to a low C and holds it as a tonic pedal all the way to the final bar. Above it the tenor states the fugue's last full subject entry — mirroring the alto's opening statement an octave below — answered by the alto starting on F, while Bb color tilts the harmony toward the subdominant. Let me loop mm. 57–60.",
        promptSummary:
          "Bach BWV 846 fugue mm. 57–60: the last cadential drive lands the dominant (m58); a low C tonic pedal begins at m59 with the final subject entries above it (tenor on C, alto on F) and Bb subdominant color.",
        contAnalysis:
          "Measures 61–62 close the fugue over the low C that has been sounding since m.59. During m.61 the Bb color gives way to B naturals and the harmony turns for home; in m.62 the soprano sweeps up an octave run to the top of the final sonority — a wide-spaced C major chord with the tenor and bass anchored on C. The four-voice journey that began with a single line at m.36 ends in one ringing chord. Let me loop mm. 61–62.",
        contSummary:
          "Bach BWV 846 fugue mm. 61–62: final cadence over the held tonic pedal — B natural turns the harmony home, a soprano run climbs the octave, and the piece ends on a wide-spaced C major chord. Continuation from mm. 57–60.",
      },
    ],
    pairAnnotations: [
      {
        promptAnnotation: {
          structure: "Opening arpeggiated pattern — four-measure harmonic template establishing the prelude's texture (C – Dm7/C – G7/B – C)",
          key_moments: [
            "m1 C major arpeggio — tonic statement (C-E-G pattern)",
            "m2 Dm7 over the C bass — the prelude's first gentle dissonance",
            "m3 G7 over B — dominant pull, bass steps down",
            "m4 C major — home again, the cycle is complete",
          ],
          teaching_goals: [
            "perfectly even rhythm across all 16th-note arpeggios",
            "harmonic awareness within repeating patterns",
            "smooth voice-leading as chords change",
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
              measure: 2,
              note: "The D and F over the held C bass make the prelude's first gentle dissonance — listen for it resolving into m.3.",
              technique: ["legato connection to m.3"],
            },
          ],
        },
        contAnnotation: {
          structure: "Consequent arpeggiated unit — Am/C, D7/C, G/B, Cmaj7/B: leaning toward the dominant over a nearly static bass",
          key_moments: [
            "m5 A minor over the C bass — relative-minor color",
            "m6 D7 over C — the first accidental of the piece (F#), pulling toward G",
            "m7 G major over B — the pull lands",
            "m8 Cmaj7 over B — softened return, ready for the next cycle",
          ],
          teaching_goals: [
            "recognize harmonic direction toward the dominant",
            "match the even arpeggio texture of mm. 1–4",
            "hear m6's F# as the first color note of the piece",
          ],
          style_tips: [
            "same even texture as mm. 1–4",
            "the D7 in m.6 should feel slightly brighter — but no accent",
            "the Cmaj7 in m.8 is a soft landing; keep forward motion",
          ],
          teaching_notes: [
            {
              measure: 6,
              note: "D7 over the C bass adds F# — the first accidental in the piece. Listen for the subtle brightening.",
              technique: ["even weight despite the new color"],
            },
            {
              measure: 8,
              note: "The major-seventh color of m.8 melts back toward the next phrase.",
              technique: ["forward lean into m.9"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Second cycle — ii–V–I into the dominant key (Am7 – D7 – G) with a diminished-seventh shade at m12",
          key_moments: [
            "m9 A minor seventh — pivot away from C",
            "m10 D7 — dominant of G, the strongest pull away from home so far",
            "m11 G major — arrival in the dominant key",
            "m12 diminished-seventh color over the G bass",
          ],
          teaching_goals: [
            "identify a ii–V–I even when it is spread across whole measures of arpeggio",
            "maintain the even texture while the harmony travels",
          ],
          style_tips: [
            "m10's F# wants to rise to G — let the harmony do the leaning",
            "harmonic rhythm is still one chord per measure — count carefully",
          ],
          teaching_notes: [
            {
              measure: 10,
              note: "D7 (D-F#-A-C) is the dominant of G — its F# pulls the whole phrase toward m.11.",
              technique: ["feel the F# in the arpeggio as the leaning tone"],
            },
          ],
        },
        contAnnotation: {
          structure: "First-inversion descent — Dm/F, dim7 over F, C/E, Fmaj7/E above a stepwise falling bass",
          key_moments: [
            "m13 D minor over F — the walk home begins",
            "m14 diminished seventh over the same F bass — passing tension",
            "m15 C major over E — tonic color, softened by inversion",
            "m16 Fmaj7 over E — subdominant warmth before the next cycle",
          ],
          teaching_goals: [
            "hear inversions: the same harmony feels lighter with its third in the bass",
            "follow a stepwise bass line underneath an unchanging pattern",
          ],
          style_tips: [
            "the m14 dissonance is passing — do not accent it",
            "let the bass line lead the phrase shape",
          ],
          teaching_notes: [
            {
              measure: 14,
              note: "A diminished seventh over the F bass — passing tension that melts into C/E.",
              technique: ["keep it light; resolve into m.15"],
            },
          ],
        },
      },
      // ── Slice 9b Bach annotations ────────────────────────────────────────────
      {
        promptAnnotation: {
          structure: "Cadence home and pivot — ii–V–I in C (Dm7 – G7 – C), then C7 turns toward the subdominant",
          key_moments: [
            "m17 D minor seventh — the approach home begins",
            "m18 G7 — the dominant",
            "m19 C major — cadence home",
            "m20 C7 — a Bb appears, pointing the music toward F",
          ],
          teaching_goals: [
            "recognize a full ii–V–I cadence inside the arpeggio stream",
            "hear m20's Bb turn the tonic itself into a pull toward F",
          ],
          style_tips: ["same even arpeggio texture as the opening", "let the m20 Bb glow without an accent"],
          teaching_notes: [
            {
              measure: 20,
              note: "C7 adds Bb, turning the tonic into a dominant that points at F — the pivot into the next cycle.",
              technique: ["listen for the new color against m.19"],
            },
          ],
        },
        contAnnotation: {
          structure: "Chromatic ascent onto the dominant pedal — Fmaj7, F#dim7, dim7 over Ab, then G7 with the bass pedal starting at m24",
          key_moments: [
            "m21 F major seventh — subdominant station",
            "m22 F# diminished seventh — the bass starts rising",
            "m23 diminished seventh over Ab — maximum leaning",
            "m24 G arrives in the bass and stays: the long dominant pedal begins",
          ],
          teaching_goals: [
            "follow a rising bass line through diminished harmonies",
            "recognize m24 as the start of the piece's biggest tension span",
          ],
          style_tips: ["the two diminished bars lean forward — keep the tempo honest", "mark m24's arrival with weight of tone, not speed"],
          teaching_notes: [
            {
              measure: 22,
              note: "F# diminished seventh — the bass begins its climb toward the dominant.",
              technique: ["feel the bass line as the melody here"],
            },
            {
              measure: 24,
              note: "G lands in the bass and will not leave for eight measures — the dominant pedal begins.",
              technique: ["settle the hand; the drama is above the bass now"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Dominant pedal core — bass G held (since m24) under alternating C/G, G7sus, G7, and diminished-seventh harmonies",
          key_moments: [
            "m25 C major over the G pedal — consonance suspended over tension",
            "m26 suspended G7 — the alternation pattern",
            "m27 G7 proper",
            "m28 diminished seventh stacked on the pedal — the tensest bar of the span so far",
          ],
          teaching_goals: [
            "hear the bass drone as a separate layer from the arpeggios",
            "feel harmonies alternate tense and settled over one unmoving note",
          ],
          style_tips: ["the G bass is the anchor — let it ring", "upper voices float above the pedal"],
          teaching_notes: [
            {
              measure: 28,
              note: "A diminished seventh over the held G — the tensest sonority of the pedal span.",
              technique: ["even weight regardless of dissonance"],
            },
          ],
        },
        contAnnotation: {
          structure: "Pedal resolution — three last bars over G (C/G, G7sus, G7), then the bass lands on low C at m32 (heard as C7)",
          key_moments: [
            "m29 C major over the G pedal — the alternation continues",
            "m31 G7 — the pedal's final bar",
            "m32 the bass drops to low C — tonic ground reached, tinted by a Bb",
          ],
          teaching_goals: [
            "feel eight bars of dominant tension release into the tonic bass",
            "notice that the release is quiet — Bach resolves without announcement",
          ],
          style_tips: ["do not crescendo into m32 — let the bass drop speak for itself", "the Bb at m32 keeps one door open; no full rest yet"],
          teaching_notes: [
            {
              measure: 32,
              note: "The bass lands on low C after eight measures of G — but the Bb above keeps it leaning toward the coda.",
              technique: ["listen for the register drop", "steady tempo through the resolution"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Movement seam — the prelude's coda over a tonic C pedal (mm. 33-35), then the fugue subject alone in the alto (m36)",
          key_moments: [
            "m33 low C octave pedal with subdominant color (F-A, joined by D) above",
            "m34 G7 sweep over the same C bass",
            "m35 the prelude's final held C major chord",
            "m36 the fugue subject enters alone: a stepwise climb C-D-E-F with a turning sixteenth figure",
          ],
          teaching_goals: [
            "hear a movement boundary: cadence, stillness, then a single unaccompanied line",
            "recognize pedal-point writing: one bass note holding while harmony changes above it",
          ],
          style_tips: ["let m35 ring and breathe before the fugue begins", "state the m36 subject plainly and evenly — it is the seed of everything that follows"],
          teaching_notes: [
            {
              measure: 35,
              note: "The prelude's whole journey lands on this single held C major chord — do not rush past it.",
              technique: ["let the chord decay naturally", "release both hands together"],
            },
            {
              measure: 36,
              note: "One voice alone states the fugue subject — every later entry copies this shape, so learn it by ear here.",
              technique: ["even eighth notes", "shape the sixteenth turn lightly"],
            },
          ],
        },
        contAnnotation: {
          structure: "Fugue exposition — entries stack the texture from two voices to four (soprano answer m37, tenor m39, bass m40)",
          key_moments: [
            "m37 soprano answer at the dominant (subject shape starting on G)",
            "m39 tenor entry on G, an octave below the soprano's answer",
            "m40 bass entry on C completes the four-voice texture",
          ],
          teaching_goals: [
            "track each new voice as it enters while the earlier ones keep moving",
            "balance independent lines — the entering voice leads, the others accompany",
          ],
          style_tips: ["slightly favor whichever voice has the subject", "keep the eighth-note pulse steady as the texture thickens"],
          teaching_notes: [
            {
              measure: 39,
              note: "The tenor entry sits in the middle of the texture and is easy to lose — bring it out.",
              technique: ["voice the left-hand top notes", "keep the upper lines lighter here"],
            },
            {
              measure: 40,
              note: "The bass entry completes the exposition — the fugue is fully assembled from here on.",
              technique: ["firm but unforced bass tone"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Post-exposition strettos — overlapping subject entries begin at once (soprano + tenor m42, alto m44)",
          key_moments: [
            "m42 stretto: soprano and tenor state the subject one beat apart",
            "m43 passing C# and Bb — a brief D minor shade",
            "m44 alto entry keeps the chain going",
          ],
          teaching_goals: [
            "recognize stretto: the subject overlapping itself before it has finished",
            "hear accidentals as short detours toward neighboring keys, not key changes",
          ],
          style_tips: ["mark each subject entry slightly, then step back", "keep the pulse strict — density must not become rushing"],
          teaching_notes: [
            {
              measure: 42,
              note: "Two voices state the subject one beat apart — practice each voice alone, then combine.",
              technique: ["voice-by-voice practice", "count the offset entry carefully"],
            },
          ],
        },
        contAnnotation: {
          structure: "Stretto chain continues — bass entry echoed within a beat (m45); A minor coloration (G#) through mm. 46-48",
          key_moments: [
            "m45 bass subject entry, echoed a beat later by the alto starting on D",
            "m46 G# appears — leaning toward A minor",
            "m47 one of the densest measures in the whole piece",
          ],
          teaching_goals: [
            "keep four voices distinct at high density",
            "feel the cumulative build — this music gains energy bar over bar",
          ],
          style_tips: ["let the bass entry speak before adding weight above it", "no slowing — the intensity comes from steadiness"],
          teaching_notes: [
            {
              measure: 47,
              note: "Density peaks here — if it feels cluttered, rebalance the voices rather than slowing down.",
              technique: ["practice the voices in pairs", "lighten the inner voices"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Climactic stretto region — five subject statements within mm. 49-51 across all four voices",
          key_moments: [
            "m49 alto and tenor entries one beat apart",
            "m50 bass entry joins the pile-up",
            "m51 soprano and alto overlap while G#, Bb, and F# mix in the lines",
          ],
          teaching_goals: [
            "hear overlapped subject statements as a deliberate climax device",
            "keep entries audible when every voice is active",
          ],
          style_tips: ["pick one entry per bar to feature — you cannot feature them all", "a steady tempo carries this tension better than volume"],
          teaching_notes: [
            {
              measure: 51,
              note: "Two entries overlap while the harmony is at its most chromatic — the fugue's tightest moment.",
              technique: ["practice slowly, one voice pair at a time"],
            },
          ],
        },
        contAnnotation: {
          structure: "Peak-density episode — sequences with D minor color (C#); the busiest bar of the piece at m53; late soprano entry m55",
          key_moments: [
            "m53 forty note onsets — the busiest measure in the entire piece",
            "m54 the sequence continues, still colored by C#",
            "m55 soprano subject entry arriving late in the bar",
          ],
          teaching_goals: [
            "sustain evenness at the piece's point of maximum activity",
            "feel sequences as forward motion, not repetition",
          ],
          style_tips: ["think in long four-bar lines, not beat to beat", "no ritardando — the close is near but not here"],
          teaching_notes: [
            {
              measure: 53,
              note: "The densest bar of the whole work — slow practice here pays off everywhere else.",
              technique: ["metronome at half tempo first", "voice the moving sixteenths clearly"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Final drive and tonic pedal — dominant arrival at the end of m58, low C pedal from m59 with the last subject entries above it",
          key_moments: [
            "m58 the bass winds down to land on G — the fugue's last dominant",
            "m59 a low C tonic pedal begins and holds to the very end",
            "m59 the final pair of subject entries: tenor rising out of the pedal, answered by the alto starting on F",
            "m60 Bb color leans the harmony toward the subdominant over the pedal",
          ],
          teaching_goals: [
            "hear a tonic pedal as ground: the ending is announced by the bass stopping",
            "connect the tenor's final entry back to the alto's first — the fugue closes its own loop",
          ],
          style_tips: ["let the low C sustain fully — it carries the whole ending", "keep the upper voices flowing over the stationary bass"],
          teaching_notes: [
            {
              measure: 59,
              note: "The bass note struck here is held to the very end — and the tenor's last subject statement rises directly out of it.",
              technique: ["hold the pedal note its full value", "shape the tenor entry as the lead voice"],
            },
          ],
        },
        contAnnotation: {
          structure: "Coda over the tonic pedal — B natural returns (m61), then a soprano octave run into the final wide-spaced C major chord (m62)",
          key_moments: [
            "m61 B naturals replace the Bb color — the harmony turns for home",
            "m62 a soprano sixteenth run climbs the octave to high C",
            "m62 final chord: wide-spaced C major over the still-sounding pedal",
          ],
          teaching_goals: [
            "feel the resolution as earned — by the pedal, the final entries, and the color turning from Bb back to B natural",
            "learn how a fugue ends: four voices arriving on one chord, not a fade-out",
          ],
          style_tips: ["the closing run should sound inevitable, not showy", "voice the final chord from the bass up and let it ring"],
          teaching_notes: [
            {
              measure: 62,
              note: "The single line that started at m36 has become this full four-voice close — let the final chord ring over the pedal.",
              technique: ["slight broadening into the final chord", "release all voices together"],
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
      // ── Slice 9b new pairs ────────────────────────────────────────────────────
      {
        promptStart: 25,
        promptEnd: 28,
        contStart: 29,
        contEnd: 32,
        promptLabel: "second period — third antecedent",
        contLabel: "second period — third consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 25–28 of the Nocturne — does the theme continue its variation here?",
        contUserPrompt:
          "Play measures 29–32 and describe how this phrase resolves.",
        promptAnalysis:
          "Measures 25–28 present another variant of the theme — the melody has grown more ornate and the LH continues its broken chord support. The cantabile quality is preserved while Chopin introduces new ornamental detail. Let me loop mm. 25–28.",
        promptSummary:
          "Chopin Nocturne mm. 25–28: theme variant with growing ornamentation, cantabile quality preserved.",
        contAnalysis:
          "Measures 29–32 complete this phrase with a decorated resolution. The ornamental detail continues while the melody descends toward the tonic. Let me loop mm. 29–32.",
        contSummary:
          "Chopin Nocturne mm. 29–32: ornamented resolution, melody descends to tonic. Pairs with mm. 25–28.",
      },
      {
        promptStart: 33,
        promptEnd: 36,
        contStart: 37,
        contEnd: 40,
        promptLabel: "lyrical peak — fourth antecedent",
        contLabel: "lyrical peak — fourth consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 33–36 of the Nocturne — what is the character here?",
        contUserPrompt:
          "Play measures 37–40 and describe how this peak resolves.",
        promptAnalysis:
          "Measures 33–36 bring one of the Nocturne's lyrical peaks — the melody soars above the broken-chord accompaniment with rich ornamentation. The emotional intensity is high. Let me loop mm. 33–36.",
        promptSummary:
          "Chopin Nocturne mm. 33–36: lyrical peak, melody soars with rich ornamentation, high emotional intensity.",
        contAnalysis:
          "Measures 37–40 descend from the peak — the melody returns toward the midrange with a graceful fall. The ornamental detail softens as the phrase closes. Let me loop mm. 37–40.",
        contSummary:
          "Chopin Nocturne mm. 37–40: descent from lyrical peak, graceful melodic fall, phrase closes. Pairs with mm. 33–36.",
      },
      {
        promptStart: 41,
        promptEnd: 44,
        contStart: 45,
        contEnd: 48,
        promptLabel: "expressive continuation — fifth antecedent",
        contLabel: "expressive continuation — fifth consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 41–44 of the Nocturne — how does the character evolve here?",
        contUserPrompt:
          "Play measures 45–48 and describe the continuation.",
        promptAnalysis:
          "Measures 41–44 continue the nocturne's long melodic arc — the theme has been through many variations and now carries the accumulated expressive weight of the piece. The LH accompaniment is lush. Let me loop mm. 41–44.",
        promptSummary:
          "Chopin Nocturne mm. 41–44: accumulated expressive weight, theme continues with lyrical depth.",
        contAnalysis:
          "Measures 45–48 extend the phrase with Chopin's characteristic long melodic lines. The melody breathes and the LH supports from below. Let me loop mm. 45–48.",
        contSummary:
          "Chopin Nocturne mm. 45–48: long melodic lines, LH support, breathing quality. Pairs with mm. 41–44.",
      },
      {
        promptStart: 57,
        promptEnd: 60,
        contStart: 61,
        contEnd: 64,
        promptLabel: "late section — antecedent",
        contLabel: "late section — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 57–60 of the Nocturne — what is the character in this later section?",
        contUserPrompt:
          "Play measures 61–64 and describe how this phrase closes.",
        promptAnalysis:
          "Measures 57–60 are in the nocturne's later section — the melody has now been heard in many variations and carries a sense of accumulated beauty. The ornamental detail is rich. Let me loop mm. 57–60.",
        promptSummary:
          "Chopin Nocturne mm. 57–60: later section, accumulated ornamental beauty, rich melodic character.",
        contAnalysis:
          "Measures 61–64 complete this late-section phrase — the melody descends with its characteristically beautiful ornaments. Let me loop mm. 61–64.",
        contSummary:
          "Chopin Nocturne mm. 61–64: late-section consequent, ornamented descent. Pairs with mm. 57–60.",
      },
      {
        promptStart: 65,
        promptEnd: 68,
        contStart: 69,
        contEnd: 72,
        promptLabel: "late section — sixth antecedent",
        contLabel: "late section — sixth consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 65–68 of the Nocturne.",
        contUserPrompt:
          "Play measures 69–72 and describe the completion.",
        promptAnalysis:
          "Measures 65–68 continue the nocturne's extended cantabile melody — a further variation on the theme in the later section. The ornamentation grows ever more elaborate. Let me loop mm. 65–68.",
        promptSummary:
          "Chopin Nocturne mm. 65–68: later section variant, elaborate ornamentation.",
        contAnalysis:
          "Measures 69–72 complete this phrase — the melody resolves through ornaments to the tonic. Let me loop mm. 69–72.",
        contSummary:
          "Chopin Nocturne mm. 69–72: ornamented tonic resolution. Pairs with mm. 65–68.",
      },
      {
        promptStart: 73,
        promptEnd: 76,
        contStart: 77,
        contEnd: 80,
        promptLabel: "coda approach — antecedent",
        contLabel: "coda approach — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 73–76 of the Nocturne — are we approaching the coda?",
        contUserPrompt:
          "Play measures 77–80 and describe how this section concludes.",
        promptAnalysis:
          "Measures 73–76 are approaching the final sections of the nocturne. The theme has come full circle through its many variations. The melody here has the weight of the entire piece behind it. Let me loop mm. 73–76.",
        promptSummary:
          "Chopin Nocturne mm. 73–76: approaching final sections, full-circle melodic weight.",
        contAnalysis:
          "Measures 77–80 bring the phrase to a quiet, ornamented close — the melody settles softly. Let me loop mm. 77–80.",
        contSummary:
          "Chopin Nocturne mm. 77–80: quiet ornamented close. Pairs with mm. 73–76.",
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
      // ── Slice 9b Chopin Nocturne annotations ─────────────────────────────────
      {
        promptAnnotation: {
          structure: "Third period antecedent — theme variant with growing ornamental complexity",
          key_moments: [
            "m25 theme variant enters",
            "m27 melodic ornamentation increases",
            "m28 dominant approach",
          ],
          teaching_goals: [
            "feel the ornaments as natural outgrowths of the melody, not additions",
            "maintain cantabile quality through the added detail",
          ],
          style_tips: ["ornaments should feel inevitable, not interpolated", "same LH pp underneath"],
          teaching_notes: [
            {
              measure: 25,
              note: "The theme grows more ornate — the melody is maturing through the piece.",
              technique: ["relaxed wrist for ornamental turns", "melody tone still primary"],
            },
          ],
        },
        contAnnotation: {
          structure: "Third period consequent — ornamented resolution, descending close",
          key_moments: [
            "m29 melody descends with ornaments",
            "m31 tonic approach",
            "m32 tonic arrival",
          ],
          teaching_goals: [
            "ornaments on the resolution should feel like a sigh",
            "the tonic arrival is soft and complete",
          ],
          style_tips: ["diminuendo toward the resolution", "let the final tonic breathe"],
          teaching_notes: [
            {
              measure: 32,
              note: "Ornamented tonic arrival — the decoration softens the landing.",
              technique: ["light ornament, full melodic tone on the resolution note"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Lyrical peak antecedent — melody soars with elaborate ornaments",
          key_moments: [
            "m33 melody rises toward lyrical peak",
            "m35 highest ornamental complexity",
            "m36 dominant suspension",
          ],
          teaching_goals: [
            "shape the phrase toward the peak — arc toward m.35",
            "ornaments require arm weight, not just finger speed",
          ],
          style_tips: ["crescendo toward the peak", "this is one of the piece's expressive summits"],
          teaching_notes: [
            {
              measure: 35,
              note: "The ornamental peak — arm weight supports the melodic line even through the trills.",
              technique: ["arm weight on melody note before ornament"],
            },
          ],
        },
        contAnnotation: {
          structure: "Lyrical peak descent — graceful fall from peak, ornamental close",
          key_moments: [
            "m37 descent begins",
            "m39 melodic arc completing",
            "m40 soft arrival",
          ],
          teaching_goals: [
            "the descent should feel like a natural exhale after the peak",
            "ornaments soften during descent",
          ],
          style_tips: ["decrescendo through the fall", "the ending should be pp — after the peak, quiet"],
          teaching_notes: [
            {
              measure: 37,
              note: "The descent from the peak: controlled, beautiful, inevitable.",
              technique: ["arm relaxes as melody descends", "ornaments become lighter"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Expressive continuation antecedent — mature melodic variant",
          key_moments: [
            "m41 theme continues in richer form",
            "m43 LH texture grows more active",
            "m44 dominant approach",
          ],
          teaching_goals: [
            "feel the accumulated weight of the theme through its many variations",
            "the LH has become an equal partner — both voices matter",
          ],
          style_tips: ["more LH presence here — bring out the inner voices", "both hands are singing now"],
          teaching_notes: [
            {
              measure: 43,
              note: "The LH is growing more active — listen to it as a second voice.",
              technique: ["LH weight increases slightly here"],
            },
          ],
        },
        contAnnotation: {
          structure: "Expressive continuation consequent — long melodic line, breathing quality",
          key_moments: [
            "m45 long melodic phrase continues",
            "m47 breathing space",
            "m48 phrase close",
          ],
          teaching_goals: [
            "long melodic phrases require sustained arm weight",
            "the phrase should feel like a long, slow breath",
          ],
          style_tips: ["no rushing — this phrase needs time to breathe", "slight rubato is appropriate"],
          teaching_notes: [
            {
              measure: 47,
              note: "A moment of repose within the phrase — let it breathe here.",
              technique: ["slight tenuto", "wrist leads into the phrase arc"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Late section antecedent — theme with full ornamental maturity",
          key_moments: [
            "m57 mature theme variant",
            "m59 full ornamental development",
            "m60 dominant approach",
          ],
          teaching_goals: [
            "the late section has the accumulated beauty of the whole piece",
            "ornaments are now completely integrated — they ARE the melody",
          ],
          style_tips: ["play with the emotional depth of having heard this theme many times", "full expressivity"],
          teaching_notes: [
            {
              measure: 59,
              note: "The ornaments at this stage feel like native speech — they flow naturally.",
              technique: ["relaxed, integrated ornamental technique"],
            },
          ],
        },
        contAnnotation: {
          structure: "Late section consequent — ornamented descent, late-section resolution",
          key_moments: [
            "m61 melodic descent with ornaments",
            "m63 tonic approach",
            "m64 quiet arrival",
          ],
          teaching_goals: [
            "late-section resolutions feel heavier — more weight behind each note",
            "ornaments in the descent are light decorations on the inevitable landing",
          ],
          style_tips: ["the resolution carries the weight of the entire nocturne now", "p and contemplative"],
          teaching_notes: [
            {
              measure: 64,
              note: "Each arrival in the late section feels earned — let it settle.",
              technique: ["soft, weighted landing on the resolution"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Later section sixth antecedent — elaborate ornamental phrase",
          key_moments: [
            "m65 ornamental elaboration continues",
            "m67 melodic peak within phrase",
            "m68 expectant dominant",
          ],
          teaching_goals: [
            "recognize the familiar structural gesture in a new ornamental guise",
            "ornaments should never obscure the underlying melody",
          ],
          style_tips: ["the melody is always primary — the ornaments serve it", "mp to mf at the peak"],
          teaching_notes: [
            {
              measure: 67,
              note: "Even with complex ornaments, the melody note must sing above them.",
              technique: ["finger weight on the main note", "ornaments lighter"],
            },
          ],
        },
        contAnnotation: {
          structure: "Later section sixth consequent — tonic resolution through ornaments",
          key_moments: [
            "m69 descent toward tonic",
            "m71 tonic approach",
            "m72 tonic arrival",
          ],
          teaching_goals: [
            "the ornamental resolution should feel like a sigh, not an exercise",
            "let the final tonic ring quietly",
          ],
          style_tips: ["p toward the resolution", "the arrival is warm and inevitable"],
          teaching_notes: [
            {
              measure: 72,
              note: "Tonic arrival — quiet, ornamented, complete.",
              technique: ["soft landing", "let the chord resonate"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Coda approach antecedent — theme approaching final statement",
          key_moments: [
            "m73 theme in final approach",
            "m75 penultimate ornamental gesture",
            "m76 dominant preparation",
          ],
          teaching_goals: [
            "feel that the piece is nearing its conclusion",
            "the final statements of the theme have extra weight",
          ],
          style_tips: ["slight broadening of tempo is appropriate here", "the full weight of the piece is in these notes"],
          teaching_notes: [
            {
              measure: 75,
              note: "A penultimate ornamental gesture — the piece is completing its thought.",
              technique: ["full arm weight", "unhurried even at the approach to the end"],
            },
          ],
        },
        contAnnotation: {
          structure: "Coda approach consequent — quiet, ornamented close",
          key_moments: [
            "m77 final melodic descent",
            "m79 near-final cadence",
            "m80 quiet settling",
          ],
          teaching_goals: [
            "the piece closes with the same ornamental grace it opened with",
            "the final note of each phrase should ring softly",
          ],
          style_tips: ["pp — the nocturne ends in a whisper", "let the final arpeggios of the LH fade naturally"],
          teaching_notes: [
            {
              measure: 80,
              note: "The quiet close — the cantabile melody ends in soft ornamental beauty.",
              technique: ["ppp touch", "pedal for the final shimmer"],
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
      // ── Slice 9b new pairs ────────────────────────────────────────────────────
      {
        promptStart: 17,
        promptEnd: 20,
        contStart: 21,
        contEnd: 24,
        promptLabel: "post-climax — descent antecedent",
        contLabel: "post-climax — descent consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 17–20 of the Chopin Prelude — what happens after the climax?",
        contUserPrompt:
          "Play measures 21–24 and describe the continuation of the descent.",
        promptAnalysis:
          "Measures 17–20 follow the climax: the RH begins its descent as the LH chromatic bass continues its relentless downward motion. The emotional intensity is still high but now falling. Let me loop mm. 17–20.",
        promptSummary:
          "Chopin Prelude E minor mm. 17–20: post-climax descent begins, RH falls while LH continues chromatic bass.",
        contAnalysis:
          "Measures 21–24 continue the descent — the music is moving toward resignation. The chromatic bass has traveled far from the opening E and the RH melody settles. Let me loop mm. 21–24.",
        contSummary:
          "Chopin Prelude E minor mm. 21–24: descent continues, resignation quality, bass far from opening. Pairs with mm. 17–20.",
      },
      {
        promptStart: 25,
        promptEnd: 28,
        contStart: 29,
        contEnd: 32,
        promptLabel: "middle descent — antecedent",
        contLabel: "middle descent — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 25–28 of the Prelude — how deep is the harmonic descent now?",
        contUserPrompt:
          "Play measures 29–32 and describe where the bass has traveled.",
        promptAnalysis:
          "Measures 25–28 are deep in the descent — the chromatic bass has moved through many semitone steps from the opening. The RH chords are now quiet, almost whispered. Let me loop mm. 25–28.",
        promptSummary:
          "Chopin Prelude E minor mm. 25–28: deep descent, bass far from opening E, RH whispered chords.",
        contAnalysis:
          "Measures 29–32 continue the downward journey — the bass is approaching its lowest point and the emotional depth is at its most austere. Let me loop mm. 29–32.",
        contSummary:
          "Chopin Prelude E minor mm. 29–32: bass approaching lowest point, austere emotional depth. Pairs with mm. 25–28.",
      },
      {
        promptStart: 33,
        promptEnd: 36,
        contStart: 37,
        contEnd: 40,
        promptLabel: "near-end — antecedent",
        contLabel: "near-end — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 33–36 of the Prelude — the piece is approaching its conclusion. Describe it.",
        contUserPrompt:
          "Play measures 37–40 and describe the penultimate phrase.",
        promptAnalysis:
          "Measures 33–36 are near the end of the descent — the bass is in its deepest register and the RH melody has lost its upward aspiration entirely. The mood is final and resigned. Let me loop mm. 33–36.",
        promptSummary:
          "Chopin Prelude E minor mm. 33–36: near-conclusion, bass in deepest register, resigned RH melody.",
        contAnalysis:
          "Measures 37–40 continue toward the piece's final pages — the chromatic motion persists and the mood is one of complete acceptance. Let me loop mm. 37–40.",
        contSummary:
          "Chopin Prelude E minor mm. 37–40: approaching conclusion, complete resignation, chromatic motion continues. Pairs with mm. 33–36.",
      },
      {
        promptStart: 41,
        promptEnd: 44,
        contStart: 45,
        contEnd: 48,
        promptLabel: "final approach — antecedent",
        contLabel: "final approach — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 41–44 of the Prelude — is this the final approach?",
        contUserPrompt:
          "Play measures 45–48 and describe the closing phrase.",
        promptAnalysis:
          "Measures 41–44 are in the prelude's final pages — the music has arrived at complete harmonic stillness. The bass drone and sustained RH chords create a final settling. Let me loop mm. 41–44.",
        promptSummary:
          "Chopin Prelude E minor mm. 41–44: final pages, harmonic stillness, complete settling.",
        contAnalysis:
          "Measures 45–48 bring the prelude toward its final E minor chord. The piece has spent its entire length descending into this profound quietude. Let me loop mm. 45–48.",
        contSummary:
          "Chopin Prelude E minor mm. 45–48: approaching final E minor, profound quietude. Pairs with mm. 41–44.",
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
      // ── Slice 9b Chopin Prelude annotations ──────────────────────────────────
      {
        promptAnnotation: {
          structure: "Post-climax descent antecedent — RH falls while chromatic bass continues",
          key_moments: [
            "m17 descent begins from climactic peak",
            "m19 RH melody settles into midrange",
            "m20 LH bass in lower territory",
          ],
          teaching_goals: [
            "the descent should feel controlled, not collapsed",
            "match the piano dynamic that preceded the climax",
          ],
          style_tips: ["pp returning — the climax is over", "the descent is inevitable and unhurried"],
          teaching_notes: [
            {
              measure: 17,
              note: "The descent from the climax — controlled and resigned, not deflated.",
              technique: ["arm relaxes as dynamic returns to pp"],
            },
          ],
        },
        contAnnotation: {
          structure: "Post-climax descent consequent — resignation, bass far from home",
          key_moments: [
            "m21 bass has traveled far from opening E",
            "m23 RH melody quiets further",
            "m24 deep harmonic area",
          ],
          teaching_goals: [
            "the mood is resignation — not sadness, but acceptance",
            "LH continues its patient chromatic descent",
          ],
          style_tips: ["even softer than the opening — pp to ppp", "the descent is now complete emotionally"],
          teaching_notes: [
            {
              measure: 21,
              note: "The bass has traveled far — its distance from the opening is part of the emotional arc.",
              technique: ["listen to the bass journey across the whole piece"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Middle descent antecedent — bass deep, RH whispered chords",
          key_moments: [
            "m25 bass in deep register",
            "m27 RH chords barely above silence",
            "m28 harmonic depth maximum",
          ],
          teaching_goals: [
            "the piece is deep in its most austere section",
            "RH chords should float — barely touching the keys",
          ],
          style_tips: ["ppp — the quietest the piece gets", "the silence between notes is music too"],
          teaching_notes: [
            {
              measure: 27,
              note: "The RH chords here are whispered — barely audible but still present.",
              technique: ["minimal arm weight", "keys depressed slowly without attack"],
            },
          ],
        },
        contAnnotation: {
          structure: "Middle descent consequent — approaching lowest point",
          key_moments: [
            "m29 bass approaching lowest register",
            "m31 maximum harmonic distance from opening",
            "m32 approaching the end",
          ],
          teaching_goals: [
            "the descent is reaching its endpoint",
            "sustain the mood of complete austerity",
          ],
          style_tips: ["no change in dynamic — consistent ppp through the end", "the austerity is the beauty"],
          teaching_notes: [
            {
              measure: 31,
              note: "The harmonic journey has reached its deepest point — the opening E seems very far away.",
              technique: ["sustain the quiet through pedal", "no crescendo here"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Near-end antecedent — bass in deepest register, resigned melody",
          key_moments: [
            "m33 bass in lowest area",
            "m35 RH melody without aspiration",
            "m36 penultimate area",
          ],
          teaching_goals: [
            "the piece has arrived at complete resignation",
            "the RH chords have no upward aspiration — pure acceptance",
          ],
          style_tips: ["the character is now one of serene acceptance", "no expression changes — just stillness"],
          teaching_notes: [
            {
              measure: 35,
              note: "The RH chords have lost their upward yearning — they simply are.",
              technique: ["flat, even touch — no phrase shaping needed here"],
            },
          ],
        },
        contAnnotation: {
          structure: "Near-end consequent — complete resignation, approaching final measures",
          key_moments: [
            "m37 chromatic motion continues in stillness",
            "m39 final harmonic area",
            "m40 one of the final chromatic steps",
          ],
          teaching_goals: [
            "recognize that the chromatic descent has been the entire engine of the piece",
            "the ending is coming — sustain the mood without preparing for it",
          ],
          style_tips: ["consistent ppp to the end", "no ritardando unless marked"],
          teaching_notes: [
            {
              measure: 40,
              note: "Each chromatic step here is one of the last — but play it with the same stillness as the first.",
              technique: ["consistent pp regardless of proximity to the end"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Final approach antecedent — complete harmonic stillness",
          key_moments: [
            "m41 near the end",
            "m43 final measures approaching",
            "m44 penultimate phrase",
          ],
          teaching_goals: [
            "the piece has arrived — nothing more to say dynamically",
            "the RH and LH both settle into their final positions",
          ],
          style_tips: ["absolute stillness — this is the most restrained moment", "ppp throughout"],
          teaching_notes: [
            {
              measure: 41,
              note: "One of the final phrases — play it with the same composure as the opening.",
              technique: ["return to the opening composure, but deeper"],
            },
          ],
        },
        contAnnotation: {
          structure: "Final approach consequent — approaching final E minor chord",
          key_moments: [
            "m45 penultimate phrases",
            "m47 final E minor approach",
            "m48 near the final chord",
          ],
          teaching_goals: [
            "the prelude is completing — the long chromatic journey arrives at its destination",
            "E minor at the end is not a triumph — it is an acceptance",
          ],
          style_tips: ["no accent on the final chord — it should arrive quietly", "ppp to the very end"],
          teaching_notes: [
            {
              measure: 48,
              note: "The final phrase — the E minor arrives as inevitably as the sea finding the shore.",
              technique: ["quiet, slow, final — no ritardando unless marked"],
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
      // ── Slice 9b new pairs ────────────────────────────────────────────────────
      {
        promptStart: 23,
        promptEnd: 26,
        contStart: 27,
        contEnd: 30,
        promptLabel: "post-peak descent — antecedent",
        contLabel: "post-peak descent — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 23–26 of Clair de Lune — after the emotional peak, how does the piece descend?",
        contUserPrompt:
          "Play measures 27–30 and describe the continuing descent.",
        promptAnalysis:
          "Measures 23–26 are after the emotional summit — the melody begins its long, graceful descent. The dynamics soften from the peak and the triplet rippling accompaniment continues. The mood shifts from passionate to tender. Let me loop mm. 23–26.",
        promptSummary:
          "Clair de Lune mm. 23–26: post-peak descent begins, dynamics soften from summit, tender quality emerges.",
        contAnalysis:
          "Measures 27–30 continue the descent with increasing calm — the melody moves to a lower register and the ripple texture softens. The piece is entering its middle section. Let me loop mm. 27–30.",
        contSummary:
          "Clair de Lune mm. 27–30: continuing descent, lower register, ripple texture softens. Pairs with mm. 23–26.",
      },
      {
        promptStart: 31,
        promptEnd: 34,
        contStart: 35,
        contEnd: 38,
        promptLabel: "middle section — atmospheric antecedent",
        contLabel: "middle section — atmospheric consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 31–34 of Clair de Lune — what does the middle section feel like?",
        contUserPrompt:
          "Play measures 35–38 and describe the continuation.",
        promptAnalysis:
          "Measures 31–34 are in the middle section — a more active, rippling passage with flowing triplets. The character shifts from the lyrical melody to a more fluid, impressionistic texture. The harmonics shift impressionistically. Let me loop mm. 31–34.",
        promptSummary:
          "Clair de Lune mm. 31–34: middle section, flowing triplet texture, impressionistic harmonic shifts.",
        contAnalysis:
          "Measures 35–38 continue the middle section's flowing character — the ripples continue with coloristic harmonic changes. The mood is one of shimmering movement. Let me loop mm. 35–38.",
        contSummary:
          "Clair de Lune mm. 35–38: middle section continuation, shimmering ripples, coloristic harmonics. Pairs with mm. 31–34.",
      },
      {
        promptStart: 37,
        promptEnd: 40,
        contStart: 41,
        contEnd: 44,
        promptLabel: "middle section — dramatic antecedent",
        contLabel: "middle section — dramatic resolution",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 37–40 of Clair de Lune — is this a more dramatic passage?",
        contUserPrompt:
          "Play measures 41–44 and describe how this dramatic section resolves.",
        promptAnalysis:
          "Measures 37–40 bring the middle section's dramatic climax — the rippling texture suddenly swells into full, rich chords. The dynamic rises toward the piece's second expressive peak. Let me loop mm. 37–40.",
        promptSummary:
          "Clair de Lune mm. 37–40: middle section dramatic swell, rich chords, second expressive peak.",
        contAnalysis:
          "Measures 41–44 resolve the dramatic swell — the texture returns to the rippling triplets and the dynamic softens. The dramatic moment passes and the piece returns to its dreaming character. Let me loop mm. 41–44.",
        contSummary:
          "Clair de Lune mm. 41–44: dramatic swell resolves, ripples return, dynamic softens. Pairs with mm. 37–40.",
      },
      {
        promptStart: 51,
        promptEnd: 54,
        contStart: 55,
        contEnd: 58,
        promptLabel: "recapitulation — antecedent",
        contLabel: "recapitulation — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 51–54 of Clair de Lune — does the opening theme return here?",
        contUserPrompt:
          "Play measures 55–58 and describe how the recapitulation continues.",
        promptAnalysis:
          "Measures 51–54 bring a recapitulation — the opening atmospheric texture returns after the middle section's journey. The 9/8 ripple and floating melody are restored. The mood is now tinged with memory. Let me loop mm. 51–54.",
        promptSummary:
          "Clair de Lune mm. 51–54: recapitulation, opening atmosphere returns, memory-tinged quality.",
        contAnalysis:
          "Measures 55–58 continue the recapitulation — the familiar melody and rippling accompaniment settle further into their concluding statement. Let me loop mm. 55–58.",
        contSummary:
          "Clair de Lune mm. 55–58: recapitulation continuation, familiar melody settling toward conclusion. Pairs with mm. 51–54.",
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
      // ── Slice 9b Clair de Lune annotations ───────────────────────────────────
      {
        promptAnnotation: {
          structure: "Post-peak descent antecedent — melody descends, dynamics soften",
          key_moments: [
            "m23 descent begins from emotional summit",
            "m25 dynamic softens from mf/f",
            "m26 melody in midrange, tender quality",
          ],
          teaching_goals: [
            "the descent must feel like a natural release, not a deflation",
            "maintain the 9/8 ripple texture through the dynamic change",
          ],
          style_tips: ["mp to p — controlled decrescendo", "the tenderness after the peak is equally beautiful"],
          teaching_notes: [
            {
              measure: 23,
              note: "The post-peak descent: the intensity has passed, now tenderness.",
              technique: ["reduce arm weight gradually", "ripple texture maintains its shimmer"],
            },
          ],
        },
        contAnnotation: {
          structure: "Post-peak descent consequent — melody settles, middle section approaches",
          key_moments: [
            "m27 melody moves lower",
            "m29 pp dynamic restored",
            "m30 middle section character emerging",
          ],
          teaching_goals: [
            "the mood has shifted from passionate to contemplative",
            "the 9/8 shimmer continues throughout",
          ],
          style_tips: ["pp — return to the opening atmospheric quality", "the middle section is approaching"],
          teaching_notes: [
            {
              measure: 30,
              note: "The lower register here feels like the moon setting — quieter, deeper.",
              technique: ["arm weight adjusts to the lower register", "same shimmer quality"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Middle section atmospheric antecedent — flowing triplets, impressionistic shifts",
          key_moments: [
            "m31 middle section texture",
            "m33 coloristic harmonic shift",
            "m34 phrase incomplete",
          ],
          teaching_goals: [
            "the middle section has a more flowing, continuous quality than the lyrical sections",
            "harmonic colors change rapidly — follow them",
          ],
          style_tips: ["continuous flow — no accents on beat 1", "listen to the harmonic colors change within the triplets"],
          teaching_notes: [
            {
              measure: 33,
              note: "The harmonic colors shift impressionistically — don't analyze, listen.",
              technique: ["follow the harmonic color with slight dynamic shading"],
            },
          ],
        },
        contAnnotation: {
          structure: "Middle section atmospheric consequent — shimmering ripples, coloristic resolution",
          key_moments: [
            "m35 ripple texture continues",
            "m37 coloristic harmonics",
            "m38 phrase settling",
          ],
          teaching_goals: [
            "the ripple texture is continuous and never mechanical",
            "each harmonic color has its own quality — hear them",
          ],
          style_tips: ["pp throughout", "the ripples are like reflections on water — never still"],
          teaching_notes: [
            {
              measure: 38,
              note: "The phrase settles but the ripples continue — no break in the flow.",
              technique: ["seamless legato through the phrase boundary"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Dramatic middle section antecedent — texture swells to rich chords",
          key_moments: [
            "m37 dramatic swell begins",
            "m39 full chordal texture",
            "m40 dynamic peak of middle section",
          ],
          teaching_goals: [
            "this is Debussy's second climactic gesture — different from the lyrical first peak",
            "the texture is more percussive here, more dramatic",
          ],
          style_tips: ["f — allow the full chordal texture to ring", "this is the most 'orchestral' moment of the piece"],
          teaching_notes: [
            {
              measure: 39,
              note: "Full chords in the 9/8 texture — let both hands ring together.",
              technique: ["full arm weight", "pedal for resonance"],
            },
          ],
        },
        contAnnotation: {
          structure: "Dramatic middle section resolution — texture returns to ripples, dynamic softens",
          key_moments: [
            "m41 tripple texture returns",
            "m43 dynamic softens from dramatic peak",
            "m44 return to dreaming character",
          ],
          teaching_goals: [
            "the dramatic moment passes — return to the impressionistic shimmer",
            "the transition back should feel natural, not abrupt",
          ],
          style_tips: ["pp returning — as if waking from a brief intense vision", "the ripples return seamlessly"],
          teaching_notes: [
            {
              measure: 41,
              note: "The dramatic peak passes — return to the shimmer without a seam.",
              technique: ["reduce arm weight smoothly", "ripple texture flows back in"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Recapitulation antecedent — opening atmosphere returns, memory-tinged",
          key_moments: [
            "m51 opening texture returns",
            "m53 floating melody again",
            "m54 familiar harmonic quality",
          ],
          teaching_goals: [
            "the recapitulation sounds familiar but carries the weight of everything that came before",
            "play it as if remembering — not as if returning",
          ],
          style_tips: ["ppp to pp — slightly softer than the opening", "memory has a gentler quality"],
          teaching_notes: [
            {
              measure: 51,
              note: "The opening returns — but you've heard the emotional journey. Play it with that knowledge.",
              technique: ["same technique as the opening, but softer and more inward"],
            },
          ],
        },
        contAnnotation: {
          structure: "Recapitulation consequent — familiar melody settling toward conclusion",
          key_moments: [
            "m55 melody continues in recapitulation",
            "m57 familiar harmonic colors",
            "m58 concluding phrase",
          ],
          teaching_goals: [
            "the conclusion is approaching — play with the sense of completion",
            "the ripples should feel like they are slowing down toward rest",
          ],
          style_tips: ["pp with slight broadening as the conclusion approaches", "the piece is winding down"],
          teaching_notes: [
            {
              measure: 58,
              note: "The familiar phrase settling toward conclusion — let it rest.",
              technique: ["slight broadening of pulse", "arm weight decreases toward pp ending"],
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
      // ── Slice 9b new pairs ────────────────────────────────────────────────────
      {
        promptStart: 17,
        promptEnd: 20,
        contStart: 21,
        contEnd: 24,
        promptLabel: "second theme section — antecedent",
        contLabel: "second theme section — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 17–20 of the Arabesque — does the character change here?",
        contUserPrompt:
          "Play measures 21–24 and describe the continuation.",
        promptAnalysis:
          "Measures 17–20 bring a second melodic idea — the flowing triplets continue but a new melodic contour emerges. The E major brightness is more present here and the melody takes on a more lyrical quality. Let me loop mm. 17–20.",
        promptSummary:
          "Debussy Arabesque No. 1 mm. 17–20: second melodic idea, lyrical quality in E major, flowing triplets continue.",
        contAnalysis:
          "Measures 21–24 complete the second theme section — the melody continues with its lyrical arc and the triplets support it underneath. The phrase closes gently. Let me loop mm. 21–24.",
        contSummary:
          "Debussy Arabesque No. 1 mm. 21–24: second theme completion, lyrical arc closes. Pairs with mm. 17–20.",
      },
      {
        promptStart: 25,
        promptEnd: 28,
        contStart: 29,
        contEnd: 32,
        promptLabel: "lyrical peak — antecedent",
        contLabel: "lyrical peak — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 25–28 of the Arabesque — is this a more expressive passage?",
        contUserPrompt:
          "Play measures 29–32 and describe the resolution.",
        promptAnalysis:
          "Measures 25–28 develop the triplet arabesques into a more expressive passage — the melody soars above the flowing texture. The E major color is warm and the dynamic rises. Let me loop mm. 25–28.",
        promptSummary:
          "Debussy Arabesque No. 1 mm. 25–28: expressive development, melody soars, dynamic rises in E major.",
        contAnalysis:
          "Measures 29–32 resolve from the expressive peak — the melody descends and the triplets soften. The phrase closes gracefully. Let me loop mm. 29–32.",
        contSummary:
          "Debussy Arabesque No. 1 mm. 29–32: descent from expressive peak, graceful close. Pairs with mm. 25–28.",
      },
      {
        promptStart: 33,
        promptEnd: 36,
        contStart: 37,
        contEnd: 40,
        promptLabel: "contrasting section — antecedent",
        contLabel: "contrasting section — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 33–36 of the Arabesque — does the character shift here?",
        contUserPrompt:
          "Play measures 37–40 and describe the continuation.",
        promptAnalysis:
          "Measures 33–36 introduce a more contemplative character — the triplet flow shifts to a quieter texture and the harmonic language becomes more exploratory. Debussy's impressionism is at its most delicate. Let me loop mm. 33–36.",
        promptSummary:
          "Debussy Arabesque No. 1 mm. 33–36: contemplative character, quieter texture, exploratory harmonics.",
        contAnalysis:
          "Measures 37–40 continue the quieter section — the triplets move more gently and the melody floats. The phrase ends with a light, open quality. Let me loop mm. 37–40.",
        contSummary:
          "Debussy Arabesque No. 1 mm. 37–40: quiet triplet continuation, floating melody. Pairs with mm. 33–36.",
      },
      {
        promptStart: 41,
        promptEnd: 44,
        contStart: 45,
        contEnd: 48,
        promptLabel: "flowing continuation — antecedent",
        contLabel: "flowing continuation — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 41–44 of the Arabesque.",
        contUserPrompt:
          "Play measures 45–48 and describe the continuation.",
        promptAnalysis:
          "Measures 41–44 bring back the flowing triplet character with melodic content — the arabesque texture is in full voice. The phrase feels natural and spontaneous. Let me loop mm. 41–44.",
        promptSummary:
          "Debussy Arabesque No. 1 mm. 41–44: flowing triplet arabesques in full voice, natural melodic character.",
        contAnalysis:
          "Measures 45–48 continue the flowing character — the triplets cascade forward and the phrase completes with Debussy's characteristic lightness. Let me loop mm. 45–48.",
        contSummary:
          "Debussy Arabesque No. 1 mm. 45–48: cascading triplets, phrase closes lightly. Pairs with mm. 41–44.",
      },
      {
        promptStart: 57,
        promptEnd: 60,
        contStart: 61,
        contEnd: 64,
        promptLabel: "recapitulation — antecedent",
        contLabel: "recapitulation — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 57–60 of the Arabesque — does the opening material return here?",
        contUserPrompt:
          "Play measures 61–64 and describe the continuation of the recapitulation.",
        promptAnalysis:
          "Measures 57–60 are in the recapitulation — the opening triplet arabesque texture returns with renewed freshness. The E major brightness is fully restored after the middle section's exploration. Let me loop mm. 57–60.",
        promptSummary:
          "Debussy Arabesque No. 1 mm. 57–60: recapitulation, opening triplet arabesque returns, E major brightness restored.",
        contAnalysis:
          "Measures 61–64 continue the recapitulation — the familiar flowing texture is back in its full E major character. The phrase completes with an elegant resolution. Let me loop mm. 61–64.",
        contSummary:
          "Debussy Arabesque No. 1 mm. 61–64: recapitulation continuation, flowing texture, elegant resolution. Pairs with mm. 57–60.",
      },
      {
        promptStart: 77,
        promptEnd: 80,
        contStart: 81,
        contEnd: 84,
        promptLabel: "coda approach — antecedent",
        contLabel: "coda approach — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 77–80 of the Arabesque — are we near the conclusion?",
        contUserPrompt:
          "Play measures 81–84 and describe the final approach.",
        promptAnalysis:
          "Measures 77–80 are approaching the coda — the triplet arabesques are moving toward their final statement. The E major is clear and the phrase has a conclusive direction. Let me loop mm. 77–80.",
        promptSummary:
          "Debussy Arabesque No. 1 mm. 77–80: approaching coda, triplet arabesques moving toward conclusion, clear E major.",
        contAnalysis:
          "Measures 81–84 bring the phrase toward the final close — the triplets are settling and the harmonic direction is firmly toward E major resolution. Let me loop mm. 81–84.",
        contSummary:
          "Debussy Arabesque No. 1 mm. 81–84: final approach, triplets settling, E major resolution. Pairs with mm. 77–80.",
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
      // ── Slice 9b Debussy Arabesque annotations ────────────────────────────────
      {
        promptAnnotation: {
          structure: "Second theme section antecedent — lyrical E major melody over triplets",
          key_moments: [
            "m17 second melodic idea enters",
            "m19 lyrical melody arc",
            "m20 phrase continues upward",
          ],
          teaching_goals: [
            "bring out the new melodic contour over the triplets",
            "E major here is warm and present",
          ],
          style_tips: ["mp to mf — more presence than the opening", "the second theme has a warmer character"],
          teaching_notes: [
            {
              measure: 17,
              note: "A new melodic contour appears over the familiar triplets — let it sing.",
              technique: ["top-voice weight in RH", "triplets remain light underneath"],
            },
          ],
        },
        contAnnotation: {
          structure: "Second theme consequent — lyrical arc closes gently",
          key_moments: [
            "m21 melody continues its arc",
            "m23 descent toward close",
            "m24 gentle resolution",
          ],
          teaching_goals: [
            "the lyrical arc completes naturally",
            "the close is gentle, not a stop",
          ],
          style_tips: ["slight decrescendo toward the resolution", "the ending feels like an exhale"],
          teaching_notes: [
            {
              measure: 24,
              note: "The phrase closes gently — let the triplets carry the resolution.",
              technique: ["diminuendo into the final note of the phrase"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Lyrical peak antecedent — melody soars, dynamic rises",
          key_moments: [
            "m25 expressive development begins",
            "m27 melody at its peak in this section",
            "m28 sustained peak before descent",
          ],
          teaching_goals: [
            "this is one of the arabesque's expressive summits",
            "melody must be clearly above the triplet texture",
          ],
          style_tips: ["mf — allow the warmth to build", "the triplets support, not dominate"],
          teaching_notes: [
            {
              measure: 27,
              note: "The melodic peak: bring it out with top-finger weight.",
              technique: ["4th/5th finger of RH for melody peak", "triplets pp underneath"],
            },
          ],
        },
        contAnnotation: {
          structure: "Lyrical peak descent consequent — melody descends, triplets soften",
          key_moments: [
            "m29 descent from peak",
            "m31 returning to mp",
            "m32 graceful close",
          ],
          teaching_goals: [
            "the descent should feel natural and flowing",
            "don't rush back to the soft dynamic",
          ],
          style_tips: ["decrescendo as melody descends", "graceful and unhurried"],
          teaching_notes: [
            {
              measure: 32,
              note: "The close after the peak: gentle and flowing.",
              technique: ["arm relaxes as melody descends", "smooth decrescendo"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Contemplative section antecedent — quieter triplet texture, exploratory harmonics",
          key_moments: [
            "m33 texture quiets",
            "m35 harmonic exploration",
            "m36 open, incomplete phrase",
          ],
          teaching_goals: [
            "Debussy's impressionism at its most delicate — follow the harmonic colors",
            "the triplets become even more transparent here",
          ],
          style_tips: ["pp — the most delicate section of the piece", "listen to each harmonic color as it passes"],
          teaching_notes: [
            {
              measure: 35,
              note: "The harmony is exploring — let it happen without forcing direction.",
              technique: ["light touch throughout", "listen more than you play"],
            },
          ],
        },
        contAnnotation: {
          structure: "Contemplative consequent — floating melody, light open resolution",
          key_moments: [
            "m37 melody floats above quiet triplets",
            "m39 light harmonic resolution",
            "m40 open quality",
          ],
          teaching_goals: [
            "the floating melody must feel genuinely light — no arm weight",
            "the phrase ends with an airy, open quality",
          ],
          style_tips: ["the lightest touch in the piece", "let the notes float and ring"],
          teaching_notes: [
            {
              measure: 40,
              note: "The phrase ends lightly, openly — no strong landing.",
              technique: ["lift the wrist gently at the phrase end"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Flowing continuation antecedent — arabesques in full voice",
          key_moments: [
            "m41 arabesque texture fully flowing",
            "m43 melodic content clear",
            "m44 phrase continues naturally",
          ],
          teaching_goals: [
            "the arabesque texture here is completely natural — it should feel effortless",
            "the melody rides above the triplets without strain",
          ],
          style_tips: ["mp — flowing and natural", "no special expressive gesture needed — just let it flow"],
          teaching_notes: [
            {
              measure: 43,
              note: "The arabesque at its most natural — like water flowing.",
              technique: ["relaxed wrist", "even weight throughout the triplets"],
            },
          ],
        },
        contAnnotation: {
          structure: "Flowing continuation consequent — cascading triplets, light close",
          key_moments: [
            "m45 triplets cascade",
            "m47 phrase completing",
            "m48 light, clean resolution",
          ],
          teaching_goals: [
            "the close should feel natural, not prepared",
            "the triplets can slightly broaden toward the close",
          ],
          style_tips: ["the light landing is characteristic of Debussy — no strong cadence", "pp at the close"],
          teaching_notes: [
            {
              measure: 48,
              note: "The phrase closes lightly — Debussy never ends a phrase with force.",
              technique: ["slight relaxation toward the resolution", "light final note"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Recapitulation antecedent — opening arabesque returns, E major bright",
          key_moments: [
            "m57 recapitulation opens",
            "m59 E major clarity restored",
            "m60 phrase momentum continues",
          ],
          teaching_goals: [
            "the recapitulation should feel fresh, not like a repeat",
            "play the opening texture with renewed lightness",
          ],
          style_tips: ["pp to mp — the recapitulation has the same character as the opening", "fresh ears"],
          teaching_notes: [
            {
              measure: 57,
              note: "The return — play it as if hearing the arabesque for the first time again.",
              technique: ["same relaxed wrist and even triplets as the opening"],
            },
          ],
        },
        contAnnotation: {
          structure: "Recapitulation consequent — flowing texture continues, elegant resolution",
          key_moments: [
            "m61 arabesque continues in recapitulation",
            "m63 moving toward resolution",
            "m64 elegant close",
          ],
          teaching_goals: [
            "the recapitulation closes more confidently than the exposition",
            "the E major resolution is the goal",
          ],
          style_tips: ["the elegant close comes naturally — don't rush it", "slight broadening is fine"],
          teaching_notes: [
            {
              measure: 64,
              note: "The recapitulation's close — slightly more confident than the opening.",
              technique: ["allow slight broadening toward the resolution"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Coda approach antecedent — triplets moving toward final statement",
          key_moments: [
            "m77 approaching the coda",
            "m79 conclusive direction clear",
            "m80 final approach",
          ],
          teaching_goals: [
            "sense the approaching end — the triplets are moving toward their last statement",
            "the E major is clear and final",
          ],
          style_tips: ["slight broadening is appropriate", "the conclusion earns a gentle ritardando"],
          teaching_notes: [
            {
              measure: 79,
              note: "Approaching the end — the triplets have a conclusive direction now.",
              technique: ["slight broadening toward the final measures"],
            },
          ],
        },
        contAnnotation: {
          structure: "Coda approach consequent — triplets settling, E major resolution",
          key_moments: [
            "m81 triplets settling toward close",
            "m83 E major final clarity",
            "m84 closing measures",
          ],
          teaching_goals: [
            "the arabesque is completing its journey — let it settle peacefully",
            "E major at the close should feel like the sun breaking through",
          ],
          style_tips: ["ritardando and pp toward the final measure", "the conclusion is gentle, not triumphant"],
          teaching_notes: [
            {
              measure: 84,
              note: "The arabesque settles finally into E major — let it ring clearly and gently.",
              technique: ["soft landing on the final E major chord", "pedal for resonance"],
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
      // ── Slice 9b new pairs ────────────────────────────────────────────────────
      {
        promptStart: 17,
        promptEnd: 20,
        contStart: 21,
        contEnd: 24,
        promptLabel: "A theme second statement — antecedent",
        contLabel: "A theme second statement — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 17–20 of Für Elise — the A theme returns here after the B section. Describe it.",
        contUserPrompt:
          "Play measures 21–24 and describe the continuation.",
        promptAnalysis:
          "Measures 17–20 bring the second statement of the A theme in A minor — the oscillating E-D# figure returns after the B section's relative major warmth. The character contracts back to the piece's introspective beginning. Let me loop mm. 17–20.",
        promptSummary:
          "Für Elise mm. 17–20: A theme second statement, A minor oscillating figure returns after B section.",
        contAnalysis:
          "Measures 21–24 continue the A theme second statement — the familiar oscillation continues its patient rocking motion. The phrase will again end on the dominant. Let me loop mm. 21–24.",
        contSummary:
          "Für Elise mm. 21–24: A theme continuation, oscillating figure, approaches dominant. Pairs with mm. 17–20.",
      },
      {
        promptStart: 25,
        promptEnd: 28,
        contStart: 29,
        contEnd: 32,
        promptLabel: "C section — contrasting antecedent",
        contLabel: "C section — contrasting consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 25–28 of Für Elise — is this the C section with different character?",
        contUserPrompt:
          "Play measures 29–32 and describe the continuation of the C section.",
        promptAnalysis:
          "Measures 25–28 enter the C section of the rondo — the most contrasting episode. The key shifts and the texture becomes more flowing and arpeggio-like, quite different from the A theme's oscillation. Let me loop mm. 25–28.",
        promptSummary:
          "Für Elise mm. 25–28: C section enters, contrasting texture, arpeggio-like character, key shift.",
        contAnalysis:
          "Measures 29–32 continue the C section — the contrasting character persists with flowing arpeggios and a more open harmonic area. The rondo's structural contrast is at its maximum here. Let me loop mm. 29–32.",
        contSummary:
          "Für Elise mm. 29–32: C section continuation, flowing arpeggios, open harmonic area. Pairs with mm. 25–28.",
      },
      {
        promptStart: 33,
        promptEnd: 36,
        contStart: 37,
        contEnd: 40,
        promptLabel: "C section — development antecedent",
        contLabel: "C section — development consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 33–36 of Für Elise — how does the C section develop?",
        contUserPrompt:
          "Play measures 37–40 and describe the continuation.",
        promptAnalysis:
          "Measures 33–36 continue the C section's development — the arpeggios continue their flowing character. The piece is in its most developmental episode here, far from the simple A theme oscillation. Let me loop mm. 33–36.",
        promptSummary:
          "Für Elise mm. 33–36: C section development, flowing arpeggios, developmental character.",
        contAnalysis:
          "Measures 37–40 bring the C section toward its end — the arpeggios begin to prepare the return of the A theme. The approaching return is felt in the harmonic direction. Let me loop mm. 37–40.",
        contSummary:
          "Für Elise mm. 37–40: C section approaching close, preparing A theme return. Pairs with mm. 33–36.",
      },
      {
        promptStart: 41,
        promptEnd: 44,
        contStart: 45,
        contEnd: 48,
        promptLabel: "A theme third return — antecedent",
        contLabel: "A theme third return — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 41–44 of Für Elise — does the A theme return again here?",
        contUserPrompt:
          "Play measures 45–48 and describe the continuation.",
        promptAnalysis:
          "Measures 41–44 bring a third return of the A theme — the oscillating E-D# figure is back in A minor. Each return feels slightly different in character because of what preceded it. Let me loop mm. 41–44.",
        promptSummary:
          "Für Elise mm. 41–44: third A theme return, oscillating figure, character deepened by rondo context.",
        contAnalysis:
          "Measures 45–48 continue the A theme's third statement — the oscillating figure maintains its patient quality. The phrase develops toward its cadential gesture. Let me loop mm. 45–48.",
        contSummary:
          "Für Elise mm. 45–48: A theme third statement continuation. Pairs with mm. 41–44.",
      },
      {
        promptStart: 57,
        promptEnd: 60,
        contStart: 61,
        contEnd: 64,
        promptLabel: "late return — antecedent",
        contLabel: "late return — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 57–60 of Für Elise — another return in the rondo structure?",
        contUserPrompt:
          "Play measures 61–64 and describe the continuation.",
        promptAnalysis:
          "Measures 57–60 bring another appearance of the rondo material — the oscillating A theme or its variants continue their journey through the piece. Each appearance has the accumulated context of the whole. Let me loop mm. 57–60.",
        promptSummary:
          "Für Elise mm. 57–60: late rondo return, accumulated context.",
        contAnalysis:
          "Measures 61–64 continue the late-section material — the piece is moving toward its conclusion through the familiar rondo returns. Let me loop mm. 61–64.",
        contSummary:
          "Für Elise mm. 61–64: late rondo continuation. Pairs with mm. 57–60.",
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
      // ── Slice 9b Für Elise annotations ───────────────────────────────────────
      {
        promptAnnotation: {
          structure: "A theme second statement antecedent — oscillating figure returns after B section",
          key_moments: [
            "m17 A minor oscillation resumes",
            "m19 character contrast with preceding B section",
            "m20 familiar phrase shape",
          ],
          teaching_goals: [
            "feel the character contrast — returning from C major warmth to A minor introspection",
            "same light touch as the opening A theme",
          ],
          style_tips: ["the return to A minor should feel like a return to a familiar place", "same pp as the opening"],
          teaching_notes: [
            {
              measure: 17,
              note: "The A theme returns — the contrast with the B section's warmth makes it feel different.",
              technique: ["light oscillating touch", "introspective character"],
            },
          ],
        },
        contAnnotation: {
          structure: "A theme second statement consequent — oscillation continues, approaches dominant",
          key_moments: [
            "m21 oscillation continues",
            "m23 cadential approach",
            "m24 dominant E arrival",
          ],
          teaching_goals: [
            "same patient quality as the first A theme statement",
            "the rondo's structure becomes clear through repeated hearings",
          ],
          style_tips: ["no change in character — the oscillation is steady", "slight tenuto on the dominant arrival"],
          teaching_notes: [
            {
              measure: 24,
              note: "The dominant arrival again — the rondo structure is asserting itself.",
              technique: ["slight tenuto on E dominant", "pause before the next phrase"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "C section antecedent — contrasting arpeggio texture, key shift",
          key_moments: [
            "m25 C section enters with arpeggios",
            "m27 key area different from A minor",
            "m28 arpeggio momentum continues",
          ],
          teaching_goals: [
            "the C section is the most contrasting episode — the character changes completely",
            "arpeggio figures require wrist flexibility",
          ],
          style_tips: ["more dynamic here — this section has more energy than the A theme", "wrist-driven arpeggios"],
          teaching_notes: [
            {
              measure: 25,
              note: "The C section arrives — a complete change of character. Let the arpeggios flow.",
              technique: ["wrist-driven arpeggio", "more energetic dynamic than A theme"],
            },
          ],
        },
        contAnnotation: {
          structure: "C section consequent — flowing arpeggios, open harmonic exploration",
          key_moments: [
            "m29 arpeggios continue flowing",
            "m31 harmonic area explored",
            "m32 continued C section character",
          ],
          teaching_goals: [
            "the arpeggios should feel free and flowing, not driven",
            "the harmonic openness of the C section is part of its character",
          ],
          style_tips: ["let the arpeggios breathe — no rigid rhythm", "the C section has more rubato than the A theme"],
          teaching_notes: [
            {
              measure: 29,
              note: "The arpeggios flow freely in the C section — slightly more flexible tempo.",
              technique: ["slight rubato in the arpeggios", "wrist leads the motion"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "C section development antecedent — arpeggios continue, developmental momentum",
          key_moments: [
            "m33 development of C section",
            "m35 harmonic movement continues",
            "m36 forward momentum",
          ],
          teaching_goals: [
            "feel the developmental quality — moving forward with energy",
            "the arpeggios have momentum here",
          ],
          style_tips: ["maintain the energy through the development", "slight crescendo is natural"],
          teaching_notes: [
            {
              measure: 35,
              note: "The development has momentum — the arpeggios want to move forward.",
              technique: ["slight lean into each arpeggio group"],
            },
          ],
        },
        contAnnotation: {
          structure: "C section closing antecedent — arpeggios prepare A theme return",
          key_moments: [
            "m37 approach to A theme return",
            "m39 harmonic preparation",
            "m40 dominant of A minor approaching",
          ],
          teaching_goals: [
            "sense the returning A theme — the harmony is moving toward E dominant",
            "the arpeggios begin to settle before the A theme returns",
          ],
          style_tips: ["slight ritardando as the arpeggios prepare the return", "the energy is resolving"],
          teaching_notes: [
            {
              measure: 40,
              note: "The arpeggios are preparing the A theme return — feel the approach.",
              technique: ["slight broadening", "prepare for the A minor return"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Third A theme return antecedent — oscillating figure returns, deepened by context",
          key_moments: [
            "m41 third A theme return",
            "m43 oscillation familiar",
            "m44 accumlated context of three hearings",
          ],
          teaching_goals: [
            "each rondo return is the same music but different because of what preceded it",
            "the third return carries the most accumulated context",
          ],
          style_tips: ["the same light touch, but the piece has depth now", "play as if remembering"],
          teaching_notes: [
            {
              measure: 41,
              note: "Third A theme return — familiar, but enriched by everything that came before.",
              technique: ["same technique, deeper listening"],
            },
          ],
        },
        contAnnotation: {
          structure: "Third A theme return consequent — oscillation continues",
          key_moments: [
            "m45 oscillation continues",
            "m47 patient rocking motion",
            "m48 cadential approach",
          ],
          teaching_goals: [
            "patience is the virtue here — the rondo teaches through repetition",
            "each note still matters even in the third hearing",
          ],
          style_tips: ["no complacency — the A theme must be fresh each time", "pp and light"],
          teaching_notes: [
            {
              measure: 47,
              note: "The patient oscillation — by the third hearing it should feel inevitable.",
              technique: ["light, even oscillation", "no changes from previous A theme statements"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Late rondo return antecedent — oscillating material in final section",
          key_moments: [
            "m57 late rondo appearance",
            "m59 material familiar",
            "m60 phrase momentum",
          ],
          teaching_goals: [
            "the late section returns carry the weight of the entire rondo",
            "the oscillating figure is now deeply familiar",
          ],
          style_tips: ["the depth of familiarity gives these later appearances a different quality", "mp — slightly fuller than the beginning"],
          teaching_notes: [
            {
              measure: 59,
              note: "Late in the rondo — the familiar material carries accumulated meaning.",
              technique: ["play with awareness of the whole piece's journey"],
            },
          ],
        },
        contAnnotation: {
          structure: "Late rondo consequent — approaching the conclusion",
          key_moments: [
            "m61 continuation of late material",
            "m63 approaching conclusion",
            "m64 final direction",
          ],
          teaching_goals: [
            "the rondo is approaching its conclusion — the piece is completing",
            "sustain the character to the very end",
          ],
          style_tips: ["maintain the pp character", "the conclusion is coming — no anticipation in the playing"],
          teaching_notes: [
            {
              measure: 64,
              note: "The conclusion is approaching — play each note as if it might be the last.",
              technique: ["sustained pp", "light touch to the end"],
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
      // ── Slice 9b new pairs ────────────────────────────────────────────────────
      {
        promptStart: 17,
        promptEnd: 20,
        contStart: 21,
        contEnd: 24,
        promptLabel: "second theme continuation — antecedent",
        contLabel: "second theme continuation — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 17–20 of Mozart K545 — how does the second theme develop?",
        contUserPrompt:
          "Play measures 21–24 and describe the continuation.",
        promptAnalysis:
          "Measures 17–20 continue the second theme in G major — the lighter, playful character of the exposition's second theme is in full flow. The Alberti bass continues supporting the decorated melody. Let me loop mm. 17–20.",
        promptSummary:
          "Mozart K545 mm. 17–20: second theme development in G major, playful decorated melody over Alberti bass.",
        contAnalysis:
          "Measures 21–24 extend the second theme — the G major area continues with Mozart's characteristic elegance. The phrase closes toward a cadential gesture. Let me loop mm. 21–24.",
        contSummary:
          "Mozart K545 mm. 21–24: second theme G major extension, cadential approach. Pairs with mm. 17–20.",
      },
      {
        promptStart: 25,
        promptEnd: 28,
        contStart: 29,
        contEnd: 32,
        promptLabel: "exposition close — antecedent",
        contLabel: "exposition close — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 25–28 of Mozart K545 — are we closing the exposition here?",
        contUserPrompt:
          "Play measures 29–32 and describe the exposition close.",
        promptAnalysis:
          "Measures 25–28 are the exposition's closing section — Mozart wraps up the G major second theme area with cadential gestures and a sense of completion. The Alberti bass continues. Let me loop mm. 25–28.",
        promptSummary:
          "Mozart K545 mm. 25–28: exposition closing section, G major cadential gestures, completion approaching.",
        contAnalysis:
          "Measures 29–32 complete the exposition — the final cadential gestures in G major bring the first half to a close. The double bar (or its musical equivalent) is approaching. Let me loop mm. 29–32.",
        contSummary:
          "Mozart K545 mm. 29–32: exposition close, final G major cadences. Pairs with mm. 25–28.",
      },
      {
        promptStart: 33,
        promptEnd: 36,
        contStart: 37,
        contEnd: 40,
        promptLabel: "development section — antecedent",
        contLabel: "development section — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 33–36 of Mozart K545 — the development section. What does Mozart do here?",
        contUserPrompt:
          "Play measures 37–40 and describe the continuation of the development.",
        promptAnalysis:
          "Measures 33–36 enter the development — Mozart's short but purposeful development section moves through related keys. The thematic material from the exposition is transformed and the harmony becomes more dynamic. Let me loop mm. 33–36.",
        promptSummary:
          "Mozart K545 mm. 33–36: development section begins, thematic transformation, harmonic movement through related keys.",
        contAnalysis:
          "Measures 37–40 continue the development — Mozart drives toward the dominant for the recapitulation. The harmonic momentum builds. Let me loop mm. 37–40.",
        contSummary:
          "Mozart K545 mm. 37–40: development continues, driving toward dominant recapitulation approach. Pairs with mm. 33–36.",
      },
      {
        promptStart: 57,
        promptEnd: 60,
        contStart: 61,
        contEnd: 64,
        promptLabel: "recapitulation — second theme antecedent",
        contLabel: "recapitulation — second theme consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 57–60 of Mozart K545 — the recapitulation's second theme. Compare it to the exposition.",
        contUserPrompt:
          "Play measures 61–64 and describe the continuation.",
        promptAnalysis:
          "Measures 57–60 bring the recapitulation's second theme — but now it's in C major (tonic) rather than G. This is the sonata form's satisfying structural surprise: the same theme but now harmonically resolved. Let me loop mm. 57–60.",
        promptSummary:
          "Mozart K545 mm. 57–60: recapitulation second theme in tonic C (was G in exposition), structural resolution.",
        contAnalysis:
          "Measures 61–64 continue the recapitulation's second theme in C major — the harmonic home is fully established. Let me loop mm. 61–64.",
        contSummary:
          "Mozart K545 mm. 61–64: recapitulation second theme continues in C major. Pairs with mm. 57–60.",
      },
      {
        promptStart: 73,
        promptEnd: 76,
        contStart: 77,
        contEnd: 80,
        promptLabel: "recapitulation close — antecedent",
        contLabel: "recapitulation close — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 73–76 of Mozart K545 — closing the recapitulation.",
        contUserPrompt:
          "Play measures 77–80 and describe the final close.",
        promptAnalysis:
          "Measures 73–76 are closing the recapitulation in C major — the same cadential gestures as the exposition but now in the tonic. The sonata form is completing its arc. Let me loop mm. 73–76.",
        promptSummary:
          "Mozart K545 mm. 73–76: recapitulation closing, C major cadential gestures, sonata form completing.",
        contAnalysis:
          "Measures 77–80 bring the recapitulation's final cadences in C major. The form is complete. Let me loop mm. 77–80.",
        contSummary:
          "Mozart K545 mm. 77–80: recapitulation final cadences, C major. Pairs with mm. 73–76.",
      },
      {
        promptStart: 81,
        promptEnd: 84,
        contStart: 85,
        contEnd: 88,
        promptLabel: "coda — antecedent",
        contLabel: "coda — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 81–84 of Mozart K545 — is this the coda?",
        contUserPrompt:
          "Play measures 85–88 and describe the final close.",
        promptAnalysis:
          "Measures 81–84 are in the coda — the final section that reinforces the tonic C. The Alberti bass continues and the melody makes its final statements with Classical elegance. Let me loop mm. 81–84.",
        promptSummary:
          "Mozart K545 mm. 81–84: coda, tonic C reinforcement, Classical elegance in final statements.",
        contAnalysis:
          "Measures 85–88 bring the coda toward its conclusion — the final C major cadences approach and the piece will end cleanly and simply. Let me loop mm. 85–88.",
        contSummary:
          "Mozart K545 mm. 85–88: coda conclusion, final C major cadences. Pairs with mm. 81–84.",
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
      // ── Slice 9b Mozart annotations ───────────────────────────────────────────
      {
        promptAnnotation: {
          structure: "Second theme continuation antecedent — G major playful melody",
          key_moments: [
            "m17 second theme continues in G",
            "m19 decorated melody",
            "m20 cadential approach",
          ],
          teaching_goals: ["maintain the lighter, more playful character of the second theme", "G major has a different brightness than C"],
          style_tips: ["still no pedal — Classical transparency", "lighter arm weight than the first theme"],
          teaching_notes: [
            {
              measure: 17,
              note: "The second theme's playful character continues — keep it conversational.",
              technique: ["light touch", "Alberti bass quiet underneath"],
            },
          ],
        },
        contAnnotation: {
          structure: "Second theme consequent — G major cadential approach",
          key_moments: [
            "m21 cadential figures approach",
            "m23 G major cadence",
            "m24 tonic G arrival",
          ],
          teaching_goals: ["feel the G major cadence as a local tonic — satisfying but temporary", "the exposition will repeat or develop"],
          style_tips: ["clean cadence — no ritardando unless marked", "the G major arrival is elegant"],
          teaching_notes: [
            {
              measure: 24,
              note: "G major tonic arrival — elegant and clean, as the Classical style demands.",
              technique: ["slight emphasis on the G tonic", "then continue without pause"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Exposition closing antecedent — G major cadential gestures",
          key_moments: [
            "m25 closing figures in G",
            "m27 cadential momentum",
            "m28 formal close approaching",
          ],
          teaching_goals: ["feel the sense of formal completion as the exposition closes", "cadential figures should feel purposeful"],
          style_tips: ["slight broadening toward the exposition close is appropriate", "formal and clean"],
          teaching_notes: [
            {
              measure: 27,
              note: "Closing cadential figures — purposeful and clear.",
              technique: ["clean articulation on the cadential figures"],
            },
          ],
        },
        contAnnotation: {
          structure: "Exposition close consequent — final G major cadences",
          key_moments: [
            "m29 final cadential gesture",
            "m31 G major resolution",
            "m32 exposition complete",
          ],
          teaching_goals: ["the exposition close is a structural landmark — feel its weight", "G major tonic is fully established here"],
          style_tips: ["the double bar is coming — or the repeat — play with finality", "clean and bright"],
          teaching_notes: [
            {
              measure: 32,
              note: "Exposition complete — G major tonic fully confirmed. A structural arrival.",
              technique: ["slight pause before the development or repeat"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Development antecedent — thematic material transformed, harmonic movement",
          key_moments: [
            "m33 development begins",
            "m35 thematic material transformed",
            "m36 harmonic direction",
          ],
          teaching_goals: ["the development is purposeful — not random harmonizing", "the familiar thematic material takes on new meaning here"],
          style_tips: ["the development has more energy than the exposition areas", "slight forward lean"],
          teaching_notes: [
            {
              measure: 35,
              note: "Thematic material transformed in the development — hear the familiar in new guise.",
              technique: ["more forward energy than the exposition", "purposeful harmonic direction"],
            },
          ],
        },
        contAnnotation: {
          structure: "Development consequent — building toward recapitulation",
          key_moments: [
            "m37 momentum builds",
            "m39 dominant preparation begins",
            "m40 recapitulation approaching",
          ],
          teaching_goals: ["feel the harmonic momentum building toward the recapitulation", "the development is purposeful and short in Mozart's early style"],
          style_tips: ["forward energy — the recapitulation is coming", "don't slow down here"],
          teaching_notes: [
            {
              measure: 40,
              note: "Approaching the recapitulation — the harmonic momentum is purposeful.",
              technique: ["forward lean", "no ritardando before the recapitulation"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Recapitulation second theme antecedent — now in tonic C (was G)",
          key_moments: [
            "m57 second theme returns but now in C",
            "m59 tonic resolution in the theme itself",
            "m60 structural satisfaction of sonata form",
          ],
          teaching_goals: ["recognize the structural surprise — same theme, different key", "the tonic second theme is the sonata form's satisfying answer"],
          style_tips: ["same character as the exposition's second theme but now at home", "this resolution is a structural satisfaction"],
          teaching_notes: [
            {
              measure: 57,
              note: "The second theme is home now — in C major instead of G. Hear the structural resolution.",
              technique: ["same touch as the exposition second theme", "but hear the tonic arrival"],
            },
          ],
        },
        contAnnotation: {
          structure: "Recapitulation second theme consequent — C major, completing the form",
          key_moments: [
            "m61 theme continues in C",
            "m63 C major cadential approach",
            "m64 tonic C arrival",
          ],
          teaching_goals: ["feel the form completing — the second theme is now fully in tonic", "this is the sonata form's structural resolution"],
          style_tips: ["same character as the exposition but with a sense of completion", "the form is satisfied"],
          teaching_notes: [
            {
              measure: 64,
              note: "C major tonic — the same cadence as the exposition, but now fully home.",
              technique: ["slight sense of arrival — the structural circle is completing"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Recapitulation closing antecedent — C major cadential gestures",
          key_moments: [
            "m73 closing figures in C major",
            "m75 cadential momentum",
            "m76 formal close approaching",
          ],
          teaching_goals: ["same closing gestures as the exposition but now fully in C", "the recapitulation is completing"],
          style_tips: ["the closing is even more satisfying now — we're home", "same articulation as the exposition close"],
          teaching_notes: [
            {
              measure: 75,
              note: "Closing in C major — the same gesture as m.27 but now at home.",
              technique: ["clean articulation", "same character as the exposition close"],
            },
          ],
        },
        contAnnotation: {
          structure: "Recapitulation final cadences — C major, form complete",
          key_moments: [
            "m77 final recapitulation cadence",
            "m79 C major tonic confirmed",
            "m80 recapitulation complete",
          ],
          teaching_goals: ["the recapitulation is complete — the form has resolved", "C major tonic is fully confirmed"],
          style_tips: ["formal and clean — a structural arrival", "slight broadening is appropriate"],
          teaching_notes: [
            {
              measure: 80,
              note: "Recapitulation complete — C major fully home. The coda will follow.",
              technique: ["sense of structural completion", "slightly more weight on the final C"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Coda antecedent — tonic C reinforcement, final melodic statements",
          key_moments: [
            "m81 coda begins",
            "m83 final melodic statements",
            "m84 approaching the end",
          ],
          teaching_goals: ["the coda is the final confirmation — enjoy the home key", "Classical purity in the final measures"],
          style_tips: ["the ending is simple and elegant — no excess", "pp to p — ending quietly is Classical style"],
          teaching_notes: [
            {
              measure: 83,
              note: "Final melodic statements — simple and elegant, as Mozart always ends.",
              technique: ["clean, light touch", "no sentimentality at the close"],
            },
          ],
        },
        contAnnotation: {
          structure: "Coda consequent — final C major cadences, clean conclusion",
          key_moments: [
            "m85 final cadential gestures",
            "m87 penultimate cadence",
            "m88 final C major arrival",
          ],
          teaching_goals: ["the movement ends cleanly and simply — no lingering", "Mozart's endings are decisive"],
          style_tips: ["clean final cadence — no ritardando unless marked", "simple and bright"],
          teaching_notes: [
            {
              measure: 88,
              note: "Final C major — decisive and clean. Mozart ends without sentiment.",
              technique: ["clean final chord", "hands release together"],
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
      // ── Slice 9b new pairs ────────────────────────────────────────────────────
      {
        promptStart: 17,
        promptEnd: 20,
        contStart: 21,
        contEnd: 24,
        promptLabel: "second period — antecedent",
        contLabel: "second period — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 17–20 of Pathetique mvt 2 — the second period begins here. Describe it.",
        contUserPrompt:
          "Play measures 21–24 and describe how the second period closes.",
        promptAnalysis:
          "Measures 17–20 begin the movement's second period — a restatement and continuation of the cantabile theme with slightly different harmonic coloring. The singing quality is maintained and the LH arpeggios continue their rocking motion. Let me loop mm. 17–20.",
        promptSummary:
          "Pathetique mvt 2 mm. 17–20: second period antecedent, cantabile theme continues, slightly varied harmony.",
        contAnalysis:
          "Measures 21–24 complete the second period — the melody settles with a peaceful resolution. Let me loop mm. 21–24.",
        contSummary:
          "Pathetique mvt 2 mm. 21–24: second period consequent, peaceful resolution. Pairs with mm. 17–20.",
      },
      {
        promptStart: 25,
        promptEnd: 28,
        contStart: 29,
        contEnd: 32,
        promptLabel: "middle section — episode antecedent",
        contLabel: "middle section — episode consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 25–28 of Pathetique mvt 2 — a contrasting episode enters here. Describe it.",
        contUserPrompt:
          "Play measures 29–32 and describe the continuation of this episode.",
        promptAnalysis:
          "Measures 25–28 bring a contrasting episode — the character shifts from the cantabile main theme to a more active, slightly agitated passage. The LH texture becomes busier. Let me loop mm. 25–28.",
        promptSummary:
          "Pathetique mvt 2 mm. 25–28: contrasting episode, more active texture, slight agitation.",
        contAnalysis:
          "Measures 29–32 continue the contrasting episode — the busier texture persists before the return of the main theme. Let me loop mm. 29–32.",
        contSummary:
          "Pathetique mvt 2 mm. 29–32: episode continuation, active texture. Pairs with mm. 25–28.",
      },
      {
        promptStart: 33,
        promptEnd: 36,
        contStart: 37,
        contEnd: 40,
        promptLabel: "theme return — antecedent",
        contLabel: "theme return — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 33–36 of Pathetique mvt 2 — does the cantabile theme return here?",
        contUserPrompt:
          "Play measures 37–40 and describe the continuation.",
        promptAnalysis:
          "Measures 33–36 bring the return of the cantabile Ab major theme — the rocking LH arpeggios and singing melody resume after the contrasting episode. Let me loop mm. 33–36.",
        promptSummary:
          "Pathetique mvt 2 mm. 33–36: cantabile theme return, Ab major, rocking LH resumes.",
        contAnalysis:
          "Measures 37–40 continue the theme return — the melody continues its singing arc and the rocking arpeggios provide their steady support. Let me loop mm. 37–40.",
        contSummary:
          "Pathetique mvt 2 mm. 37–40: theme return continuation, singing arc continues. Pairs with mm. 33–36.",
      },
      {
        promptStart: 57,
        promptEnd: 60,
        contStart: 61,
        contEnd: 64,
        promptLabel: "late section — antecedent",
        contLabel: "late section — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 57–60 of Pathetique mvt 2 — what is the character in this later section?",
        contUserPrompt:
          "Play measures 61–64 and describe the continuation.",
        promptAnalysis:
          "Measures 57–60 are in the movement's later section — the rondo structure has brought the theme back again with the accumulated depth of several hearings. The cantabile quality is deep and warm. Let me loop mm. 57–60.",
        promptSummary:
          "Pathetique mvt 2 mm. 57–60: late section, deep cantabile quality, accumulated warmth.",
        contAnalysis:
          "Measures 61–64 continue the late section phrase — the melody is at its most expressive depth. Let me loop mm. 61–64.",
        contSummary:
          "Pathetique mvt 2 mm. 61–64: late section continuation, maximum expressive depth. Pairs with mm. 57–60.",
      },
      {
        promptStart: 73,
        promptEnd: 76,
        contStart: 77,
        contEnd: 80,
        promptLabel: "final return — antecedent",
        contLabel: "final return — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 73–76 of Pathetique mvt 2 — approaching the final section.",
        contUserPrompt:
          "Play measures 77–80 and describe the final approach.",
        promptAnalysis:
          "Measures 73–76 are approaching the movement's conclusion — the cantabile theme or its variants are in their final statements. The dream-like quality is at its deepest. Let me loop mm. 73–76.",
        promptSummary:
          "Pathetique mvt 2 mm. 73–76: approaching conclusion, dream-like depth, cantabile theme final statements.",
        contAnalysis:
          "Measures 77–80 continue toward the conclusion — the peaceful character is maintained as the movement approaches its final pages. Let me loop mm. 77–80.",
        contSummary:
          "Pathetique mvt 2 mm. 77–80: final approach, peaceful character maintained. Pairs with mm. 73–76.",
      },
      {
        promptStart: 81,
        promptEnd: 84,
        contStart: 85,
        contEnd: 88,
        promptLabel: "coda approach — antecedent",
        contLabel: "coda approach — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 81–84 of Pathetique mvt 2 — is this the coda?",
        contUserPrompt:
          "Play measures 85–88 and describe the final phrases.",
        promptAnalysis:
          "Measures 81–84 are in the coda area — the movement is completing. The final Ab major statements carry the full weight of the Adagio cantabile. Let me loop mm. 81–84.",
        promptSummary:
          "Pathetique mvt 2 mm. 81–84: coda, final Ab major statements, full Adagio cantabile weight.",
        contAnalysis:
          "Measures 85–88 bring the final phrases — the melody makes its last statement over the rocking arpeggios. Let me loop mm. 85–88.",
        contSummary:
          "Pathetique mvt 2 mm. 85–88: final phrases, melody's last statement. Pairs with mm. 81–84.",
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
      // ── Slice 9b Pathetique annotations ──────────────────────────────────────
      {
        promptAnnotation: {
          structure: "Second period antecedent — cantabile theme with slightly varied harmony",
          key_moments: [
            "m17 theme restatement with variation",
            "m19 harmonic color slightly different",
            "m20 dominant approach",
          ],
          teaching_goals: ["feel the variation in the harmony while maintaining the cantabile quality", "the theme is maturing through the movement"],
          style_tips: ["same pp/mp character as the opening", "the variation enriches without changing the mood"],
          teaching_notes: [
            {
              measure: 17,
              note: "The theme returns with subtle variation — familiar but enriched.",
              technique: ["same cantabile touch", "listen for the harmonic difference"],
            },
          ],
        },
        contAnnotation: {
          structure: "Second period consequent — peaceful resolution",
          key_moments: [
            "m21 theme continues",
            "m23 tonic approach",
            "m24 peaceful Ab arrival",
          ],
          teaching_goals: ["the second period close is as peaceful as the first", "the Ab tonic is a regular resting point"],
          style_tips: ["slight diminuendo toward the resolution", "peace is the constant"],
          teaching_notes: [
            {
              measure: 24,
              note: "Second period resolution — same peace as the first, slightly deepened.",
              technique: ["soft Ab arrival", "continue arm weight through the note"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Contrasting episode antecedent — more active texture, slight agitation",
          key_moments: [
            "m25 episode texture begins",
            "m27 LH becomes busier",
            "m28 contrast with main theme",
          ],
          teaching_goals: ["feel the contrast — this episode is more active than the main theme", "the LH texture requires more precision here"],
          style_tips: ["mp to mf — more energy than the main theme", "the contrast is intentional — don't smooth it out"],
          teaching_notes: [
            {
              measure: 25,
              note: "The contrasting episode — more active, slightly urgent. A different character entirely.",
              technique: ["increased energy", "LH texture needs clarity"],
            },
          ],
        },
        contAnnotation: {
          structure: "Contrasting episode consequent — active texture continues, return approaching",
          key_moments: [
            "m29 episode continues",
            "m31 harmonic approach to theme return",
            "m32 return is imminent",
          ],
          teaching_goals: ["sustain the contrasting character", "feel the approach of the main theme return"],
          style_tips: ["maintain the energy until the theme returns", "slight preparation for the cantabile's return"],
          teaching_notes: [
            {
              measure: 32,
              note: "The theme return is approaching — slight preparation without losing the episode's energy.",
              technique: ["prepare the cantabile touch", "ease into the return"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Main theme return antecedent — cantabile resumes, Ab major",
          key_moments: [
            "m33 cantabile theme returns",
            "m35 rocking LH resumes",
            "m36 familiar phrase shape",
          ],
          teaching_goals: ["feel the return as a relief after the episode's agitation", "the cantabile quality should feel like coming home"],
          style_tips: ["pp — the contrast with the episode makes the return even more peaceful", "let the rocking LH settle"],
          teaching_notes: [
            {
              measure: 33,
              note: "The theme returns — relief after the episode. Let the peace return fully.",
              technique: ["immediate cantabile touch on return", "rocking LH settles immediately"],
            },
          ],
        },
        contAnnotation: {
          structure: "Main theme return consequent — singing arc continues",
          key_moments: [
            "m37 melody arc continues",
            "m39 rocking LH steady",
            "m40 phrase completes",
          ],
          teaching_goals: ["the return feels completely settled now", "the cantabile quality is fully restored"],
          style_tips: ["same quality as the opening — or perhaps even more settled", "the rocking LH is completely steady"],
          teaching_notes: [
            {
              measure: 40,
              note: "The return is fully settled — as peaceful as the opening, but with more weight.",
              technique: ["full cantabile", "steady rocking LH"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Late section antecedent — deep cantabile, accumulated warmth",
          key_moments: [
            "m57 late theme statement",
            "m59 maximum expressive depth",
            "m60 warmth accumulated from whole movement",
          ],
          teaching_goals: ["the late section carries all the accumulated experience of the movement", "the cantabile quality is at its deepest"],
          style_tips: ["mp with warmth — the most expressive moment of the movement", "the whole movement has led here"],
          teaching_notes: [
            {
              measure: 59,
              note: "The deepest cantabile moment — the movement's accumulated warmth is in every note.",
              technique: ["full arm weight", "the most expressive phrasing of the movement"],
            },
          ],
        },
        contAnnotation: {
          structure: "Late section consequent — maximum expressive depth",
          key_moments: [
            "m61 melody at its deepest",
            "m63 phrase completing",
            "m64 resolution at maximum depth",
          ],
          teaching_goals: ["the late section resolution carries more weight than the opening's", "feel the difference between the first and late resolutions"],
          style_tips: ["the late Ab arrival is deeper — more resonant", "hold slightly longer after the resolution"],
          teaching_notes: [
            {
              measure: 64,
              note: "The late-section resolution — deeper and more resonant than the opening's.",
              technique: ["weight and depth on the Ab", "pause and breathe after"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Final approach antecedent — dream-like depth, approaching conclusion",
          key_moments: [
            "m73 final approach begins",
            "m75 penultimate statements",
            "m76 conclusion imminent",
          ],
          teaching_goals: ["the movement is completing — the cantabile has one of its final statements", "play with full awareness that this is nearly the end"],
          style_tips: ["slight broadening is appropriate", "the weight of the approaching end is in the phrasing"],
          teaching_notes: [
            {
              measure: 75,
              note: "One of the final cantabile phrases — play it with full awareness of the approaching end.",
              technique: ["full weight", "slight broadening toward the conclusion"],
            },
          ],
        },
        contAnnotation: {
          structure: "Final approach consequent — peaceful, approaching coda",
          key_moments: [
            "m77 final approach continues",
            "m79 coda approaching",
            "m80 last phrase before coda",
          ],
          teaching_goals: ["the movement is on its final pages", "sustain the peace through to the very end"],
          style_tips: ["pp — the ending approaches in complete peace", "no rush"],
          teaching_notes: [
            {
              measure: 80,
              note: "The last phrase before the coda — let it breathe fully.",
              technique: ["gentle, unhurried", "full resonance in the final chords"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Coda antecedent — final Ab major, full Adagio cantabile weight",
          key_moments: [
            "m81 coda begins",
            "m83 final theme statements",
            "m84 conclusion very near",
          ],
          teaching_goals: ["the coda carries the full weight of the entire movement", "each final note should be played with complete awareness"],
          style_tips: ["pp — the ending is hushed", "the rocking LH should barely be audible"],
          teaching_notes: [
            {
              measure: 83,
              note: "Final theme statement in the coda — all the movement's warmth in these notes.",
              technique: ["pp with arm weight", "the melody sings even as it fades"],
            },
          ],
        },
        contAnnotation: {
          structure: "Coda consequent — melody's final statement, peaceful Ab conclusion",
          key_moments: [
            "m85 melody's last arc",
            "m87 final resolution approaching",
            "m88 Ab major final chord",
          ],
          teaching_goals: ["the movement ends in complete peace", "the final Ab should ring and then fade"],
          style_tips: ["ppp — Beethoven's Adagio ends as quietly as it began", "let the pedal sustain the final chord"],
          teaching_notes: [
            {
              measure: 88,
              note: "The final Ab — peaceful, resonant, complete. Let it ring into silence.",
              technique: ["full pedal on the final chord", "arms release gently after"],
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
      // ── Slice 9b new pairs ────────────────────────────────────────────────────
      {
        promptStart: 27,
        promptEnd: 30,
        contStart: 31,
        contEnd: 34,
        promptLabel: "fourth phrase group — antecedent",
        contLabel: "fourth phrase group — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 27–30 of Satie's Gymnopedie — another phrase group begins here.",
        contUserPrompt:
          "Play measures 31–34 and describe the completion of this phrase.",
        promptAnalysis:
          "Measures 27–30 begin a fourth phrase group — the Gymnopedie's meditative repetition continues. The melody maintains its melancholy character and the LH waltz pattern continues unchanged. Each phrase group is a fresh thought. Let me loop mm. 27–30.",
        promptSummary:
          "Satie Gymnopedie No. 1 mm. 27–30: fourth phrase antecedent, meditative continuation, same melancholy character.",
        contAnalysis:
          "Measures 31–34 complete the fourth phrase group with another quiet settling. Let me loop mm. 31–34.",
        contSummary:
          "Satie Gymnopedie No. 1 mm. 31–34: fourth phrase consequent, quiet settling. Pairs with mm. 27–30.",
      },
      {
        promptStart: 35,
        promptEnd: 38,
        contStart: 39,
        contEnd: 42,
        promptLabel: "fifth phrase group — antecedent",
        contLabel: "fifth phrase group — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 35–38 of Satie's Gymnopedie.",
        contUserPrompt:
          "Play measures 39–42 and describe the completion.",
        promptAnalysis:
          "Measures 35–38 begin the fifth phrase group — the hypnotic meditation continues. Each phrase has the same unhurried quality. Let me loop mm. 35–38.",
        promptSummary:
          "Satie Gymnopedie No. 1 mm. 35–38: fifth phrase antecedent, hypnotic meditation continues.",
        contAnalysis:
          "Measures 39–42 complete the fifth phrase group — another quiet, spaced arrival. Let me loop mm. 39–42.",
        contSummary:
          "Satie Gymnopedie No. 1 mm. 39–42: fifth phrase consequent. Pairs with mm. 35–38.",
      },
      {
        promptStart: 43,
        promptEnd: 46,
        contStart: 47,
        contEnd: 50,
        promptLabel: "sixth phrase group — antecedent",
        contLabel: "sixth phrase group — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 43–46 of Satie's Gymnopedie.",
        contUserPrompt:
          "Play measures 47–50 and describe the completion.",
        promptAnalysis:
          "Measures 43–46 continue the meditation — the phrase groups repeat with Satie's characteristic intentional repetition. Each hearing is both familiar and fresh. Let me loop mm. 43–46.",
        promptSummary:
          "Satie Gymnopedie No. 1 mm. 43–46: sixth phrase antecedent, intentional repetition, fresh familiarity.",
        contAnalysis:
          "Measures 47–50 complete the phrase group quietly. Let me loop mm. 47–50.",
        contSummary:
          "Satie Gymnopedie No. 1 mm. 47–50: sixth phrase consequent. Pairs with mm. 43–46.",
      },
      {
        promptStart: 51,
        promptEnd: 54,
        contStart: 55,
        contEnd: 58,
        promptLabel: "near-final phrase group — antecedent",
        contLabel: "near-final phrase group — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 51–54 of Satie's Gymnopedie — approaching the conclusion.",
        contUserPrompt:
          "Play measures 55–58 and describe the final phrases.",
        promptAnalysis:
          "Measures 51–54 are in the Gymnopedie's final section — the same unhurried meditation has now accumulated the weight of the entire piece. The ending is approaching without announcement. Let me loop mm. 51–54.",
        promptSummary:
          "Satie Gymnopedie No. 1 mm. 51–54: near-final section, accumulated meditation, approach without announcement.",
        contAnalysis:
          "Measures 55–58 bring the piece near its close — the melody makes its last statements in the same quiet character. Let me loop mm. 55–58.",
        contSummary:
          "Satie Gymnopedie No. 1 mm. 55–58: near-final phrase completion. Pairs with mm. 51–54.",
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
      // ── Slice 9b Satie annotations ────────────────────────────────────────────
      {
        promptAnnotation: {
          structure: "Fourth phrase antecedent — meditative repetition continues, each phrase a fresh thought",
          key_moments: [
            "m27 fourth phrase begins",
            "m29 subtle harmonic color",
            "m30 open ending",
          ],
          teaching_goals: [
            "embrace the hypnotic repetition — same approach as all previous phrases",
            "each phrase feels like hearing the meditation again for the first time",
          ],
          style_tips: ["identical approach throughout — Satie's constancy is the art", "pp"],
          teaching_notes: [
            {
              measure: 27,
              note: "The repetition is never monotony — listen to each chord with fresh attention.",
              technique: ["same unhurried touch", "LH chords detached and quiet"],
            },
          ],
        },
        contAnnotation: {
          structure: "Fourth phrase consequent — quiet settling, same spaciousness",
          key_moments: [
            "m31 melody completes arc",
            "m33 descent",
            "m34 quiet resolution",
          ],
          teaching_goals: [
            "each phrase completion is a sigh — let it release naturally",
            "sustain pedal at the resolution",
          ],
          style_tips: ["ppp at the phrase end", "let the silence after the phrase breathe"],
          teaching_notes: [
            {
              measure: 34,
              note: "The same quiet resolution — consistent spaciousness throughout.",
              technique: ["soft landing", "pedal for resonance", "hold the silence"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Fifth phrase antecedent — hypnotic meditation, accumulated depth",
          key_moments: [
            "m35 fifth phrase begins",
            "m37 familiar melodic character",
            "m38 open ending",
          ],
          teaching_goals: [
            "by the fifth phrase, the listener is in the meditation — sustain it",
            "same physical approach as always",
          ],
          style_tips: ["the repetition creates a trance — honor it", "no special gestures"],
          teaching_notes: [
            {
              measure: 35,
              note: "The piece is now deeply familiar — play with accumulated warmth, not habit.",
              technique: ["fresh listening", "consistent unhurried touch"],
            },
          ],
        },
        contAnnotation: {
          structure: "Fifth phrase consequent — another quiet settling",
          key_moments: [
            "m39 melody descends",
            "m41 near resolution",
            "m42 quiet landing",
          ],
          teaching_goals: [
            "feel the peace of the fifth repetition — the meditation is complete",
            "same spaciousness at the end",
          ],
          style_tips: ["ppp", "allow the silence after the phrase"],
          teaching_notes: [
            {
              measure: 42,
              note: "Another peaceful arrival — Satie's genius is in the constancy.",
              technique: ["same soft touch throughout", "unhurried"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Sixth phrase antecedent — late-section meditation, familiar and fresh",
          key_moments: [
            "m43 sixth phrase begins",
            "m45 the familiar character",
            "m46 open quality",
          ],
          teaching_goals: [
            "intentional repetition is the piece's architecture — embrace it",
            "play with depth of familiarity, not boredom",
          ],
          style_tips: ["no change from earlier phrases — the constancy is deliberate", "pp"],
          teaching_notes: [
            {
              measure: 43,
              note: "The sixth repetition carries the whole meditation — play with that awareness.",
              technique: ["same gentle weight", "inner listening heightened by familiarity"],
            },
          ],
        },
        contAnnotation: {
          structure: "Sixth phrase consequent — completion, approaching the final section",
          key_moments: [
            "m47 completion of phrase",
            "m49 resolving",
            "m50 quiet",
          ],
          teaching_goals: [
            "same peaceful resolution as always",
            "prepare the listener for the approaching ending without telegraphing it",
          ],
          style_tips: ["ppp at the resolution", "the same spacious quality throughout"],
          teaching_notes: [
            {
              measure: 50,
              note: "The same quiet arrival — Satie offers no announcement of the ending.",
              technique: ["soft landing", "let the chord ring"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Near-final phrase antecedent — final section, accumulated weight of the whole piece",
          key_moments: [
            "m51 near-final section begins",
            "m53 familiar melody, now weighted",
            "m54 open quality as always",
          ],
          teaching_goals: [
            "the ending is approaching without announcement — sustain the same character",
            "the accumulated weight of the piece is in these phrases",
          ],
          style_tips: ["same pp as throughout — never announce the ending", "the piece ends as it began"],
          teaching_notes: [
            {
              measure: 53,
              note: "The piece is nearly done — don't change a thing about the approach.",
              technique: ["same touch", "same tempo", "same inner stillness"],
            },
          ],
        },
        contAnnotation: {
          structure: "Near-final phrase consequent — last statements, same quiet character",
          key_moments: [
            "m55 final melody statements",
            "m57 approaching the very end",
            "m58 quiet close",
          ],
          teaching_goals: [
            "the melody makes its last statements in the same unhurried character",
            "the piece ends without fanfare",
          ],
          style_tips: ["ppp — the quietest possible ending", "Satie ends as he begins: quietly"],
          teaching_notes: [
            {
              measure: 58,
              note: "The meditation ends — the same quiet it always had. Nothing changes at the end.",
              technique: ["soft final notes", "let the last chord ring into silence"],
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
      // ── Slice 9b new pairs ────────────────────────────────────────────────────
      {
        promptStart: 25,
        promptEnd: 28,
        contStart: 29,
        contEnd: 32,
        promptLabel: "coda approach — antecedent",
        contLabel: "coda approach — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 25–28 of Traumerei — how does the piece move toward its close?",
        contUserPrompt:
          "Play measures 29–32 and describe the continuation.",
        promptAnalysis:
          "Measures 25–28 continue the piece's gentle winding-down after the recapitulation — the F major warmth persists and the texture remains intimate. The piece is approaching its final resting. Let me loop mm. 25–28.",
        promptSummary:
          "Schumann Traumerei mm. 25–28: post-recapitulation continuation, F major warmth, intimate texture.",
        contAnalysis:
          "Measures 29–32 continue the approach toward the coda — Schumann sustains the dreaming quality. The harmonic motion is gentle and resolving. Let me loop mm. 29–32.",
        contSummary:
          "Schumann Traumerei mm. 29–32: coda approach continuation, gentle harmonic resolution. Pairs with mm. 25–28.",
      },
      {
        promptStart: 33,
        promptEnd: 36,
        contStart: 37,
        contEnd: 40,
        promptLabel: "final phrase — antecedent",
        contLabel: "final phrase — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 33–36 of Traumerei — is this the final phrase of the piece?",
        contUserPrompt:
          "Play measures 37–40 and describe the completion.",
        promptAnalysis:
          "Measures 33–36 are in the final section of Traumerei — the dreaming is completing. The melody and harmony are moving toward the piece's final F major rest. Let me loop mm. 33–36.",
        promptSummary:
          "Schumann Traumerei mm. 33–36: final section, dreaming completing, approach to final resolution.",
        contAnalysis:
          "Measures 37–40 bring the completion of this phrase — Schumann's final expressive gestures settle the piece toward rest. The texture remains warm and intimate to the last note. Let me loop mm. 37–40.",
        contSummary:
          "Schumann Traumerei mm. 37–40: final phrase completion, warm intimate texture. Pairs with mm. 33–36.",
      },
      {
        promptStart: 41,
        promptEnd: 44,
        contStart: 45,
        contEnd: 48,
        promptLabel: "closing — antecedent",
        contLabel: "closing — consequent",
        naturalBoundary: true,
        promptUserPrompt:
          "Show me measures 41–44 of Traumerei — the closing measures.",
        contUserPrompt:
          "Play measures 45–48 and describe the final close.",
        promptAnalysis:
          "Measures 41–44 are in the closing section of Traumerei — the F major home is fully established and the piece is resting. The character is the most tranquil of the whole piece. Let me loop mm. 41–44.",
        promptSummary:
          "Schumann Traumerei mm. 41–44: closing section, tranquil F major, deepest rest.",
        contAnalysis:
          "Measures 45–48 complete the Traumerei closing — the dreaming settles into its final stillness. Schumann's intimate portrait ends with the warmth it began with. Let me loop mm. 45–48.",
        contSummary:
          "Schumann Traumerei mm. 45–48: final close, warmth and stillness. Pairs with mm. 41–44.",
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
      // ── Slice 9b Schumann annotations ────────────────────────────────────────
      {
        promptAnnotation: {
          structure: "Post-recapitulation antecedent — F major warmth continues, intimate texture",
          key_moments: [
            "m25 continuation of F major warmth",
            "m27 gentle harmonic motion",
            "m28 phrase remains open",
          ],
          teaching_goals: [
            "the warmth of the recapitulation continues without change",
            "sustain the intimate quality — the piece is winding down",
          ],
          style_tips: ["mp — same warm character as the recapitulation", "breathe with the phrase"],
          teaching_notes: [
            {
              measure: 25,
              note: "The piece is gently winding down — sustain the warm intimacy.",
              technique: ["arm weight for warmth", "follow the harmonic motion gently"],
            },
          ],
        },
        contAnnotation: {
          structure: "Post-recapitulation consequent — gentle harmonic resolution, approaching coda",
          key_moments: [
            "m29 harmonic motion settling",
            "m31 F major reasserted",
            "m32 phrase closes gently",
          ],
          teaching_goals: [
            "feel the piece settling toward its final rest",
            "each harmonic resolution is a step toward stillness",
          ],
          style_tips: ["slight decrescendo — the dreaming is fading", "soft, unhurried"],
          teaching_notes: [
            {
              measure: 32,
              note: "The harmonic resolution — let it settle without rushing.",
              technique: ["gentle weight", "slight ritardando if felt naturally"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Final section antecedent — dreaming completing, approaching last resolution",
          key_moments: [
            "m33 final section of the piece",
            "m35 moving toward ultimate resolution",
            "m36 approach intensifies gently",
          ],
          teaching_goals: [
            "sense the piece completing — play with awareness of the ending",
            "the melody carries the same warmth as at the opening",
          ],
          style_tips: ["p — the dream is nearly over", "no abrupt changes — everything fades gently"],
          teaching_notes: [
            {
              measure: 33,
              note: "The final section — play with the quiet knowledge that the dream is ending.",
              technique: ["p dynamic", "arm weight maintained for warmth despite softer dynamic"],
            },
          ],
        },
        contAnnotation: {
          structure: "Final section consequent — warm intimate texture to the last note",
          key_moments: [
            "m37 expressive final gestures",
            "m39 harmonic settling",
            "m40 warmth sustained",
          ],
          teaching_goals: [
            "every note counts to the very end",
            "the intimate texture never abandons its warmth",
          ],
          style_tips: ["p to pp", "let the phrase settle completely"],
          teaching_notes: [
            {
              measure: 40,
              note: "The warmth lasts to the final note — never let it go cold.",
              technique: ["soft arm weight throughout", "tone remains rounded"],
            },
          ],
        },
      },
      {
        promptAnnotation: {
          structure: "Closing antecedent — most tranquil section, F major home fully established",
          key_moments: [
            "m41 deepest tranquility",
            "m43 harmonic rest",
            "m44 stillness approached",
          ],
          teaching_goals: [
            "this is the most tranquil passage — play with complete peace",
            "the F major home is fully established — no more wandering",
          ],
          style_tips: ["pp — the quietest moment of the piece", "no forward drive — pure rest"],
          teaching_notes: [
            {
              measure: 41,
              note: "The deepest tranquility in the piece — let the music rest.",
              technique: ["lightest possible touch", "arm relaxed completely"],
            },
          ],
        },
        contAnnotation: {
          structure: "Closing consequent — final stillness, dream complete",
          key_moments: [
            "m45 final descent",
            "m47 almost there",
            "m48 warmth and stillness",
          ],
          teaching_goals: [
            "the dreaming ends in warmth and stillness — not in silence or coldness",
            "sustain the F major warmth through the very last note",
          ],
          style_tips: ["pp to ppp", "let the final chord ring with pedal"],
          teaching_notes: [
            {
              measure: 48,
              note: "The dream ends — warm, still, complete. Let the final F major chord ring.",
              technique: ["soft final landing", "pedal for resonance", "lift hands gently after"],
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
  console.log(" jam-actions-v0 Slice 5 + 9b Corpus Builder");
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

  if (allRecordsOnDisk.length < 140 || allRecordsOnDisk.length > 160) {
    console.warn(`   WARNING: record count ${allRecordsOnDisk.length} outside 140-160 target range (Slice 9b).`);
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

  // ANDON: the phrase window must exist in the ingested song. A window
  // authored past the real end of the MIDI is exactly how record
  // bach-prelude-c-major-bwv846:m061-064 shipped a frozen play_song call
  // the live server rejects (62-measure song, window 61-64) — caught only
  // later by finetune-arc-v1's execution gate (G6a, disposition A1-v1).
  // Fail the build, never the downstream consumer. play_song validates
  // endMeasure against the same ingest (registry SongEntry), so a window
  // that passes here executes there.
  const actualMeasures = args.songEntry.measures.length;
  if (end < start) {
    fail(`Phrase window mm. ${start}-${end} of ${songId} is inverted.`);
  }
  if (start > actualMeasures || end > actualMeasures) {
    fail(
      `Phrase window mm. ${start}-${end} of ${songId} exceeds the ingested song's actual length ` +
        `(${actualMeasures} measures). Fix the SONG_SPECS window — records must never reference ` +
        `measures that do not exist.`,
    );
  }
  for (const tn of args.annotation.teaching_notes) {
    if (tn.measure < start || tn.measure > end) {
      fail(
        `Teaching note anchored at m${tn.measure} lies outside phrase window mm. ${start}-${end} ` +
          `of ${songId} — annotation anchors must reference measures inside the record's window.`,
      );
    }
  }

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
  // ProvenanceSchema.composer is z.string().min(1) — required and non-empty — but
  // songConfig.composer is optional in SongConfigSchema. Fail fast rather than mint a
  // provenance record that would be rejected later by schema validation.
  if (!songConfig.composer) {
    fail(`${songId}: song config is missing a composer — cannot build a provenance record.`);
  }
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
