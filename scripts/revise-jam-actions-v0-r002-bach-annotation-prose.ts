#!/usr/bin/env tsx
// ─── jam-actions-v0 revision r002 — Bach annotation prose correction ─────────
//
// WHAT: corrects the musical-analysis text (user prompt, analysis turn, summary
// turn, phrase label, and annotation_target block) of the Bach BWV 846 records
// in the working set. The source MIDI is "Praeludium und Fuge 1 in C-Dur
// BWV 846": prelude mm. 1-35 + fugue mm. 36-62 concatenated. The hand-authored
// Slice-9b song spec described ALL of mm. 33-62 as prelude material from an
// imagined 64-measure prelude ("famous low G pedal point" at 33-36, "tonic
// resolution" at 41-48, "final arpeggios" at 61-62). In the actual music the
// G pedal is mm. 24-31, the prelude's C-pedal coda is mm. 32-35, and from m36
// the four-voice FUGUE runs to the end. The prelude-window chord labels
// (mm. 1-32) were also wrong against the MIDI (e.g. m2 is Dm7/C, not A minor).
//
// TIERS (director-scoped):
//   --tier=A   the 8 records touching mm. 33-62 (the prelude/fugue category
//              error filed in erratum-001 "Known residuals")
//   --tier=AB  tier A plus the 8 prelude-window records mm. 1-32 (wrong chord
//              letters / pedal placement, discovered by this revision's
//              ground-truth pass)
//
// WHY: these strings are training text (target_trace turns + annotation
// targets). Tool-call validity is unaffected (windows, ids, sidecars, REMI,
// ABC, SVGs untouched). Finding filed in
// docs/jam-actions-v0-erratum-001-bach-m061-064.md "Known residuals";
// evidence + decision + full before/after in
// docs/jam-actions-v0-erratum-002-bach-annotation-prose.md.
//
// GROUND TRUTH IS EXECUTED, NOT ATTESTED: before touching any record this
// script re-derives the musical facts the new prose cites (track spans, fugue
// voice entries, subject-head statements, pedal spans, onset densities, final
// chord) from the source MIDI and hard-fails on any mismatch. The receipt
// embeds the derived values.
//
// SCOPE GUARANTEE: writes ONLY under datasets/jam-actions-v0/. The sealed
// published package datasets/jam-actions-v0-public/ (v0.4.3, Zenodo DOI
// 10.5281/zenodo.20279919) is never touched — asserted by sha256 before and
// after, exactly like r001.
//
// Standards compliance (six standards, 0-3):
//   PIN_PER_STEP        3 — sealed tree, source MIDI, and all 16 input records
//                           pinned by sha256 in this file; zero-LLM at run
//                           time; receipt emits before/after shas per file.
//   ANDON_AUTHORITY     3 — executed ground-truth verifier over the MIDI,
//                           byte-pinned inputs, strict schema + trace
//                           validation, dead-phrase sweep, untouched-section
//                           asserts; every check is a hard exit-1. Proven by
//                           an executed red test (see erratum §Verification).
//   NAMED_COMPENSATORS  2 — no irreversible action. Compensator: git restore
//                           of the touched record files (before-shas in the
//                           receipt identify exact prior bytes). Owner:
//                           advisor session.
//   DECOMPOSE_BY_SECRETS 2 — dataset working set only; builder consistency is
//                           gated but the builder edit itself is a separate,
//                           reviewable source change.
//   UNCERTAINTY_GATED_HUMANS 3 — the script refuses to run without an explicit
//                           --tier chosen by the director; --dry-run exists so
//                           the full diff is reviewable before any write; the
//                           next PUBLIC package cut remains operator-gated.
//   EXTERNAL_VERIFIER   2 — prose claims are verified against the MIDI by
//                           deterministic derivation (the verifier is the data,
//                           not the author); schema/trace validators are the
//                           repo's own.
//
// Usage:
//   pnpm exec tsx scripts/revise-jam-actions-v0-r002-bach-annotation-prose.ts --tier=A  --dry-run
//   pnpm exec tsx scripts/revise-jam-actions-v0-r002-bach-annotation-prose.ts --tier=AB --dry-run
//   pnpm exec tsx scripts/revise-jam-actions-v0-r002-bach-annotation-prose.ts --tier=AB
//
// Idempotent: re-running after success verifies the applied state and exits 0.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { makeRecordSchema } from "../src/dataset/schema.js";
import { loadToolSchemaCatalog, validateTrace } from "../src/dataset/trace-validator.js";

const require = createRequire(import.meta.url);
const { parseMidi } = require("midi-file");

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DATASET_ROOT = join(REPO_ROOT, "datasets/jam-actions-v0");
const RECORDS_DIR = join(DATASET_ROOT, "records");
const REVISION_DIR = join(DATASET_ROOT, "revisions/r002-bach-annotation-prose");
const PUBLIC_RECORDS_JSONL = join(REPO_ROOT, "datasets/jam-actions-v0-public/records.jsonl");
const BUILDER_PATH = join(REPO_ROOT, "scripts/build-jam-actions-corpus.ts");
const MIDI_PATH = join(REPO_ROOT, "songs/library/classical/bach-prelude-c-major-bwv846.mid");

const SONG_ID = "bach-prelude-c-major-bwv846";
const REVISION_DATE = "2026-07-11";

// The sealed published package this revision must NOT touch (v0.4.3 pin —
// same constant as r001).
const SEALED_PUBLIC_RECORDS_SHA =
  "72ce6e69d29e198dc94d66d5eeb55d5e0456b859282c872caf86b7b161c8120f";

// Source MIDI pin (from the records' own midi_sidecar.midi_sha256 — asserted
// again below against every record).
let MIDI_SHA_FROM_RECORDS: string | null = null;

// Input records pinned at authoring time (2026-07-11, post-r001 working set).
// If a file's sha differs AND its fields are not already the corrected values,
// the working set drifted since this revision was reviewed — hard stop.
const BEFORE_SHAS: Array<[string, string]> = [
  ["records/bach-prelude-c-major-bwv846-m001-004.json", "a2efa44300cfbf02dfcdfe6ef4c7fdea3178e1a4e3038aa3a4d228298bf3f16d"],
  ["records/bach-prelude-c-major-bwv846-m005-008.json", "ce2dc76441f4abe419d9067b99a0e67a796567a78cd09d6b8d536058e4f68aba"],
  ["records/bach-prelude-c-major-bwv846-m009-012.json", "8706ea0b6a92f35bb9f017dd870f6b253de50f16b34ac9d50423747dbb03e0cb"],
  ["records/bach-prelude-c-major-bwv846-m013-016.json", "702a9943c29ec70353d4628b3d7ac6a461abcdf27e87b5c22f1952eaeced7223"],
  ["records/bach-prelude-c-major-bwv846-m017-020.json", "6c299a2dacea0bce83c1f3693c4974521fbdd416ce197fb0e07b12e3e9e23d46"],
  ["records/bach-prelude-c-major-bwv846-m021-024.json", "7639cb68f3525bec4945e1cd40d423419fc2e37750534909c7ecc81c6249cc5c"],
  ["records/bach-prelude-c-major-bwv846-m025-028.json", "33526074353ecc55d9661f7e7c3530dc9ec35cb7c3f15d2474495fcc545bf637"],
  ["records/bach-prelude-c-major-bwv846-m029-032.json", "a2e7ca38eb09335091361c579bc45d30f3b973d578e472ad2dcb78209ffa6765"],
  ["records/bach-prelude-c-major-bwv846-m033-036.json", "66e79b50903be2f57ed46d152e3d5ec2416a00a5c87a4c3de79c3ac95e88ee32"],
  ["records/bach-prelude-c-major-bwv846-m037-040.json", "50c8e721328a7e9284caa8c5b4053b2788ff4a0248d75a7b01bfbc43570a0473"],
  ["records/bach-prelude-c-major-bwv846-m041-044.json", "500e9e378f368735bbc234863071a5d4c80f3b80d0c8451c4aac9e54b93edcf2"],
  ["records/bach-prelude-c-major-bwv846-m045-048.json", "3bdd94774dd5471df9d6220ea48900993431323f51914df76ebf7349cef0d0a6"],
  ["records/bach-prelude-c-major-bwv846-m049-052.json", "e1480d6ebab70048462c1558509d74351de9c118c98cef063fb2413f6021f06c"],
  ["records/bach-prelude-c-major-bwv846-m053-056.json", "3159896d70b17a5be60b8c7d2f29f6afa6ea355e0a590a3b9c987091b9d54497"],
  ["records/bach-prelude-c-major-bwv846-m057-060.json", "ae6aa991d4ef877d99adb03949ebc1edee4c5b04b6cf53d6db2444fa8eb75318"],
  ["records/bach-prelude-c-major-bwv846-m061-062.json", "2164542bbcc1c64315b891d4f6e7198539c04a709bff58bd234859c4a1d280d7"],
];

// ─── Corrections table ────────────────────────────────────────────────────────
//
// One entry per record. `fields` fully replaces the nine prose-bearing slots:
//   scope.musical_phrase_label
//   annotation_target.{structure,key_moments,teaching_goals,style_tips,teaching_notes}
//   target_trace.session[0].content (user), [3].content (analysis), [5].content (summary)
// Everything else in the record is untouched (asserted).
// `deadPhrases` are the killed falsehoods: the revised record's full JSON must
// not contain any of them.

interface TeachingNote {
  measure: number;
  note: string;
  technique?: string[];
}

interface NewFields {
  label: string;
  structure: string;
  key_moments: string[];
  teaching_goals: string[];
  style_tips: string[];
  teaching_notes: TeachingNote[];
  user: string;
  analysis: string;
  summary: string;
}

interface Correction {
  file: string;
  tier: "A" | "B";
  window: [number, number];
  fields: NewFields;
  deadPhrases: string[];
}

const CORRECTIONS: Correction[] = [
  // ════ TIER B — prelude windows (mm. 1-32): wrong chord letters / pedal placement ════
  {
    file: "bach-prelude-c-major-bwv846-m001-004.json",
    tier: "B",
    window: [1, 4],
    fields: {
      label: "opening four-chord cycle",
      structure:
        "Opening arpeggiated pattern — four-measure harmonic template establishing the prelude's texture (C – Dm7/C – G7/B – C)",
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
      user: "Read measures 1–4 of the Bach C Major Prelude and describe what's happening musically.",
      analysis:
        "The prelude opens with a flowing arpeggiated texture — each measure is a single chord broken into 16th notes. I can see four distinct chord shapes: m.1 C major (C-E-G), m.2 D minor seventh over the same C bass (C-D-F-A), m.3 G7 over B (B-D-F-G), m.4 C major again. Tonic, gentle dissonance, dominant, home — with a harmonic rhythm of exactly one chord per measure. Let me loop mm. 1–4 so you can hear the pattern.",
      summary:
        "Phrase summary — Bach C Major Prelude mm. 1–4: arpeggiated opening template. Four measures, four chords (C, Dm7/C, G7/B, C). Teaching focus: even 16th-note rhythm, harmonic awareness within the arpeggio pattern, smooth legato through chord changes.",
    },
    deadPhrases: ["m.2 A minor", "m2 A minor", "(C-Am-Dm7-G)", "C-Am-Dm7-G", "m.3 D minor7", "m4 G major — dominant resolution"],
  },
  {
    file: "bach-prelude-c-major-bwv846-m005-008.json",
    tier: "B",
    window: [5, 8],
    fields: {
      label: "consequent four-chord cycle",
      structure:
        "Consequent arpeggiated unit — Am/C, D7/C, G/B, Cmaj7/B: leaning toward the dominant over a nearly static bass",
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
      user: "Now play measures 5–8 and explain how the harmony continues from mm. 1–4.",
      analysis:
        "Measures 5–8 push the same pattern outward: m.5 A minor over the C bass, m.6 D7 over C — the piece's first accidental (F#) — m.7 G major over B, m.8 C major seventh over B. The bass barely moves while the harmony leans toward the dominant; this is the harmonic response to mm. 1–4. Let me loop mm. 5–8.",
      summary:
        "Bach C Major Prelude mm. 5–8: continuation of the arpeggiated pattern. Am/C → D7/C → G/B → Cmaj7/B, leaning toward the dominant. Pair with mm. 1–4 for E2 harmonic-direction prediction.",
    },
    deadPhrases: ["m.6 C7", "m6 C7", "F major (subdominant arrival)", "m.8 F diminished", "m8 F diminished", "first flat pitch", "subdominant region", "Subdominant region"],
  },
  {
    file: "bach-prelude-c-major-bwv846-m009-012.json",
    tier: "B",
    window: [9, 12],
    fields: {
      label: "second cycle — to the dominant",
      structure:
        "Second cycle — ii–V–I into the dominant key (Am7 – D7 – G) with a diminished-seventh shade at m12",
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
      user: "Show me measures 9–12 of the Bach Prelude and describe the harmonic movement.",
      analysis:
        "Measures 9–12 travel to the dominant key: m.9 A minor seventh, m.10 D7, m.11 G major — a ii–V–I in G — and m.12 shades the new G bass with a tense diminished seventh. The texture never changes; the journey is entirely harmonic. Let me loop mm. 9–12.",
      summary:
        "Bach C Major Prelude mm. 9–12: ii–V–I into the dominant — Am7 → D7 → G, then a diminished-seventh shade at m12. Teaching focus: hearing a key shift inside an unchanged texture.",
    },
    deadPhrases: ["m.10 G7", "m10 G7 (dominant seventh)", "C → G7", "m.12 G7", "first dominant seventh in the piece", "m11 C major"],
  },
  {
    file: "bach-prelude-c-major-bwv846-m013-016.json",
    tier: "B",
    window: [13, 16],
    fields: {
      label: "second cycle — first-inversion descent home",
      structure:
        "First-inversion descent — Dm/F, dim7 over F, C/E, Fmaj7/E above a stepwise falling bass",
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
      user: "Now play measures 13–16 and describe the resolution from mm. 9–12.",
      analysis:
        "Measures 13–16 slide back from the dominant through first-inversion colors: m.13 D minor over F, m.14 a diminished seventh over the same F bass, m.15 C major over E, m.16 F major seventh over E. The bass walks down by step while every chord is softened by inversion. Let me loop mm. 13–16.",
      summary:
        "Bach C Major Prelude mm. 13–16: first-inversion descent — Dm/F → dim7/F → C/E → Fmaj7/E; the bass steps down as the harmony eases toward home. Continuation from mm. 9–12.",
    },
    deadPhrases: ["m.13 Am", "m13 A minor", "m14 D7", "m.14 D7", "secondary dominant of G", "m15 G major", "m.15 G (dominant)", "ii7–V–V7", "m16 G7"],
  },
  {
    file: "bach-prelude-c-major-bwv846-m017-020.json",
    tier: "B",
    window: [17, 20],
    fields: {
      label: "third cycle — tonic return antecedent",
      structure:
        "Cadence home and pivot — ii–V–I in C (Dm7 – G7 – C), then C7 turns toward the subdominant",
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
      style_tips: [
        "same even arpeggio texture as the opening",
        "let the m20 Bb glow without an accent",
      ],
      teaching_notes: [
        {
          measure: 20,
          note: "C7 adds Bb, turning the tonic into a dominant that points at F — the pivot into the next cycle.",
          technique: ["listen for the new color against m.19"],
        },
      ],
      user: "Show me measures 17–20 of the Bach Prelude — how does this third harmonic cycle begin?",
      analysis:
        "Measures 17–20 cadence back into C and immediately pivot onward: m.17 D minor seventh, m.18 G7, m.19 C major — a full ii–V–I home — then m.20 turns the tonic into C7, whose Bb points the music toward F. Let me loop mm. 17–20.",
      summary:
        "Bach C Major Prelude mm. 17–20: ii–V–I back to C (Dm7 → G7 → C), then C7 pivots toward the subdominant. Teaching focus: cadence recognition inside the arpeggio stream.",
    },
    deadPhrases: ["m.18 Am7", "m18 A minor 7th", "m.19 D minor", "m.20 B diminished", "m20 B diminished", "Am7 vs simple Am", "C → Am7 → Dm → Bdim"],
  },
  {
    file: "bach-prelude-c-major-bwv846-m021-024.json",
    tier: "B",
    window: [21, 24],
    fields: {
      label: "third cycle — consequent with chromatic motion",
      structure:
        "Chromatic ascent onto the dominant pedal — Fmaj7, F#dim7, dim7 over Ab, then G7 with the bass pedal starting at m24",
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
      style_tips: [
        "the two diminished bars lean forward — keep the tempo honest",
        "mark m24's arrival with weight of tone, not speed",
      ],
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
      user: "Play measures 21–24 and describe the chromatic movement that follows.",
      analysis:
        "Measures 21–24 are the prelude's boldest four bars: F major seventh at m.21, then the bass climbs — F# diminished seventh at m.22, a diminished seventh over Ab at m.23 — and lands on G at m.24, where the long dominant pedal begins. Let me loop mm. 21–24.",
      summary:
        "Bach C Major Prelude mm. 21–24: rising bass through two diminished sevenths (F → F# → Ab) settling onto G at m24 — the dominant pedal begins. Continuation from mm. 17–20.",
    },
    deadPhrases: ["m21 G7", "m.21 G7", "m22 Cmaj7", "m.22 Cmaj7", "m23 Fmaj7", "m.23 Fmaj7", "m24 F diminished", "m.24 F/D diminished", "Cmaj7 contains B natural"],
  },
  {
    file: "bach-prelude-c-major-bwv846-m025-028.json",
    tier: "B",
    window: [25, 28],
    fields: {
      label: "dominant pedal — antecedent",
      structure:
        "Dominant pedal core — bass G held (since m24) under alternating C/G, G7sus, G7, and diminished-seventh harmonies",
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
      style_tips: [
        "the G bass is the anchor — let it ring",
        "upper voices float above the pedal",
      ],
      teaching_notes: [
        {
          measure: 28,
          note: "A diminished seventh over the held G — the tensest sonority of the pedal span.",
          technique: ["even weight regardless of dissonance"],
        },
      ],
      user: "Show me measures 25–28 of the Bach Prelude — what is happening over the bass here?",
      analysis:
        "Measures 25–28 all ride the dominant pedal that began at m.24: the bass holds G while the harmonies above alternate — C major over G at m.25, a suspended G7 at m.26, G7 proper at m.27, and at m.28 a diminished seventh stacked on the pedal. One note below, everything shifting above. Let me loop mm. 25–28.",
      summary:
        "Bach C Major Prelude mm. 25–28: dominant pedal in full — C/G, G7sus, G7, then a diminished seventh over the held G. Teaching focus: pedal point as a tension engine.",
    },
    deadPhrases: ["most distant chord from home key", "most harmonically distant", "partial cadential approach", "diminished and augmented areas", "most chromatic tension in the piece"],
  },
  {
    file: "bach-prelude-c-major-bwv846-m029-032.json",
    tier: "B",
    window: [29, 32],
    fields: {
      label: "dominant pedal resolves — consequent",
      structure:
        "Pedal resolution — three last bars over G (C/G, G7sus, G7), then the bass lands on low C at m32 (heard as C7)",
      key_moments: [
        "m29 C major over the G pedal — the alternation continues",
        "m31 G7 — the pedal's final bar",
        "m32 the bass drops to low C — tonic ground reached, tinted by a Bb",
      ],
      teaching_goals: [
        "feel eight bars of dominant tension release into the tonic bass",
        "notice that the release is quiet — Bach resolves without announcement",
      ],
      style_tips: [
        "do not crescendo into m32 — let the bass drop speak for itself",
        "the Bb at m32 keeps one door open; no full rest yet",
      ],
      teaching_notes: [
        {
          measure: 32,
          note: "The bass lands on low C after eight measures of G — but the Bb above keeps it leaning toward the coda.",
          technique: ["listen for the register drop", "steady tempo through the resolution"],
        },
      ],
      user: "Play measures 29–32 and describe the dominant preparation.",
      analysis:
        "Measures 29–31 are the pedal's last stand — C major over G, a suspended seventh, then G7 — and at m.32 the bass finally drops to a low C. The new tonic pedal arrives colored as C7, its Bb hinting at F for the coda to come. Let me loop mm. 29–32.",
      summary:
        "Bach C Major Prelude mm. 29–32: the dominant pedal releases — G7 gives way at m32 to a low C bass (heard as C7, leaning toward F). Continuation from mm. 25–28.",
    },
    deadPhrases: ["building toward the long pedal", "preparation for the final dominant pedal", "m32 continued dominant preparation", "moves back through G7 territory", "harmonic journey starts curving back", "listen for the G in the bass returning"],
  },

  // ════ TIER A — mm. 33-62: the prelude/fugue category error ════
  {
    file: "bach-prelude-c-major-bwv846-m033-036.json",
    tier: "A",
    window: [33, 36],
    fields: {
      label: "prelude close into fugue opening — antecedent",
      structure:
        "Movement seam — the prelude's coda over a tonic C pedal (mm. 33-35), then the fugue subject alone in the alto (m36)",
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
      style_tips: [
        "let m35 ring and breathe before the fugue begins",
        "state the m36 subject plainly and evenly — it is the seed of everything that follows",
      ],
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
      user: "Show me measures 33–36 of the Bach BWV 846 — the prelude ends here and the fugue begins. What happens at the seam?",
      analysis:
        "Measures 33–36 are the seam between the two movements of BWV 846. The prelude closes over a low C octave pedal: m.33 lays subdominant color (F and A, joined by D) over it, m.34 answers with a G7 sweep over the same C bass, and m.35 lands the final held C major chord — the arpeggio pattern stops entirely. Then m.36 opens the four-voice fugue: the alto alone states the subject, a stepwise climb C-D-E-F capped by a turning sixteenth figure. Let me loop mm. 33–36.",
      summary:
        "Bach BWV 846 mm. 33–36: prelude coda over a C pedal (subdominant color, then G7) into the final chord at m35; the fugue subject enters alone at m36. A movement boundary inside one window.",
    },
    deadPhrases: ["famous low G pedal point", "low G pedal", "dominant pedal", "sustained G", "drone-like G bass", "organ-point effect", "arpeggio texture is unchanged", "Maximum tension"],
  },
  {
    file: "bach-prelude-c-major-bwv846-m037-040.json",
    tier: "A",
    window: [37, 40],
    fields: {
      label: "fugue exposition — continuation",
      structure:
        "Fugue exposition — entries stack the texture from two voices to four (soprano answer m37, tenor m39, bass m40)",
      key_moments: [
        "m37 soprano answer at the dominant (subject shape starting on G)",
        "m39 tenor entry on G, an octave below the soprano's answer",
        "m40 bass entry on C completes the four-voice texture",
      ],
      teaching_goals: [
        "track each new voice as it enters while the earlier ones keep moving",
        "balance independent lines — the entering voice leads, the others accompany",
      ],
      style_tips: [
        "slightly favor whichever voice has the subject",
        "keep the eighth-note pulse steady as the texture thickens",
      ],
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
      user: "Play measures 37–40 and describe how the fugue exposition builds.",
      analysis:
        "Measures 37–40 are the heart of the fugue's exposition. The soprano answers at the dominant in m.37 (the subject shape starting on G), the tenor enters on G an octave lower in m.39, and the bass completes the four-voice texture with the subject on C in m.40. Each entry adds a genuinely independent line — by m.40 the note density has nearly doubled, and F# inflections color the answer entries. Let me loop mm. 37–40.",
      summary:
        "Bach BWV 846 fugue mm. 37–40: exposition — soprano answer (m37), tenor entry (m39), bass entry (m40); the texture grows from two voices to four. Continuation from mm. 33–36.",
    },
    deadPhrases: ["G bass persists", "dominant pedal", "pedal continues", "pedal point is maintained", "arpeggios shift", "upper voices at furthest harmonic point", "beginning of resolution approach", "long pedal is about to resolve"],
  },
  {
    file: "bach-prelude-c-major-bwv846-m041-044.json",
    tier: "A",
    window: [41, 44],
    fields: {
      label: "post-exposition strettos — antecedent",
      structure:
        "Post-exposition strettos — overlapping subject entries begin at once (soprano + tenor m42, alto m44)",
      key_moments: [
        "m42 stretto: soprano and tenor state the subject one beat apart",
        "m43 passing C# and Bb — a brief D minor shade",
        "m44 alto entry keeps the chain going",
      ],
      teaching_goals: [
        "recognize stretto: the subject overlapping itself before it has finished",
        "hear accidentals as short detours toward neighboring keys, not key changes",
      ],
      style_tips: [
        "mark each subject entry slightly, then step back",
        "keep the pulse strict — density must not become rushing",
      ],
      teaching_notes: [
        {
          measure: 42,
          note: "Two voices state the subject one beat apart — practice each voice alone, then combine.",
          technique: ["voice-by-voice practice", "count the offset entry carefully"],
        },
      ],
      user: "Show me measures 41–44 of the Bach BWV 846 fugue — what happens right after the exposition?",
      analysis:
        "With all four voices in, Bach immediately tightens the imitation. In m.42 the soprano and tenor state the subject one beat apart — a true stretto — and the alto follows with its own entry in m.44. Passing C# and Bb around m.43 briefly shade the music toward D minor, and the texture now runs about twice the note density of the prelude. Let me loop mm. 41–44.",
      summary:
        "Bach BWV 846 fugue mm. 41–44: first strettos — soprano and tenor overlap the subject one beat apart (m42), alto follows (m44); brief D minor shading at m43.",
    },
    deadPhrases: ["dominant pedal releases", "pedal resolves", "tonic C harmony returns", "relief is palpable", "tonic stability re-established", "It should feel like exhaling", "harmonic relief"],
  },
  {
    file: "bach-prelude-c-major-bwv846-m045-048.json",
    tier: "A",
    window: [45, 48],
    fields: {
      label: "stretto chain — consequent",
      structure:
        "Stretto chain continues — bass entry echoed within a beat (m45); A minor coloration (G#) through mm. 46-48",
      key_moments: [
        "m45 bass subject entry, echoed a beat later by the alto starting on D",
        "m46 G# appears — leaning toward A minor",
        "m47 one of the densest measures in the whole piece",
      ],
      teaching_goals: [
        "keep four voices distinct at high density",
        "feel the cumulative build — this music gains energy bar over bar",
      ],
      style_tips: [
        "let the bass entry speak before adding weight above it",
        "no slowing — the intensity comes from steadiness",
      ],
      teaching_notes: [
        {
          measure: 47,
          note: "Density peaks here — if it feels cluttered, rebalance the voices rather than slowing down.",
          technique: ["practice the voices in pairs", "lighten the inner voices"],
        },
      ],
      user: "Play measures 45–48 and describe how the strettos continue.",
      analysis:
        "The stretto chain keeps building: the bass states the subject in m.45, echoed a beat later by the alto starting on D, and G# inflections through mm. 46–48 pull the music toward A minor. Measure 47 is one of the busiest bars in the entire piece — nothing here is settling; the fugue is accumulating energy. Let me loop mm. 45–48.",
      summary:
        "Bach BWV 846 fugue mm. 45–48: bass-led stretto with A minor coloration (G#); m47 is among the densest bars of the piece. Continuation from mm. 41–44.",
    },
    deadPhrases: ["calm tonic cycling", "serenity is restored", "returned home after its adventure", "arpeggios return", "opening dynamic and character", "familiar harmonic cycle", "calm progression", "play it with fresh ears"],
  },
  {
    file: "bach-prelude-c-major-bwv846-m049-052.json",
    tier: "A",
    window: [49, 52],
    fields: {
      label: "climactic strettos — antecedent",
      structure:
        "Climactic stretto region — five subject statements within mm. 49-51 across all four voices",
      key_moments: [
        "m49 alto and tenor entries one beat apart",
        "m50 bass entry joins the pile-up",
        "m51 soprano and alto overlap while G#, Bb, and F# mix in the lines",
      ],
      teaching_goals: [
        "hear overlapped subject statements as a deliberate climax device",
        "keep entries audible when every voice is active",
      ],
      style_tips: [
        "pick one entry per bar to feature — you cannot feature them all",
        "a steady tempo carries this tension better than volume",
      ],
      teaching_notes: [
        {
          measure: 51,
          note: "Two entries overlap while the harmony is at its most chromatic — the fugue's tightest moment.",
          technique: ["practice slowly, one voice pair at a time"],
        },
      ],
      user: "Show me measures 49–52 of the Bach BWV 846 fugue — how dense does the imitation get?",
      analysis:
        "This is the fugue's tightest imitation. Five subject statements crowd into mm. 49–51: alto and tenor a beat apart in m.49, the bass at the top of m.50, then soprano and alto overlapping in m.51 — while G#, Bb, and F# mix into the lines. This pile-up is the climax the fugue has been building toward. Let me loop mm. 49–52.",
      summary:
        "Bach BWV 846 fugue mm. 49–52: climactic strettos — five subject statements in three bars (alto+tenor m49, bass m50, soprano+alto m51) under mixed chromatic color.",
    },
    deadPhrases: ["penultimate section", "final chord cycles", "goal-directed calm", "conclusive cadence", "harmonic trajectory is goal-directed", "Bach ends without announcement", "seamless arc"],
  },
  {
    file: "bach-prelude-c-major-bwv846-m053-056.json",
    tier: "A",
    window: [53, 56],
    fields: {
      label: "peak density — consequent",
      structure:
        "Peak-density episode — sequences with D minor color (C#); the busiest bar of the piece at m53; late soprano entry m55",
      key_moments: [
        "m53 forty note onsets — the busiest measure in the entire piece",
        "m54 the sequence continues, still colored by C#",
        "m55 soprano subject entry arriving late in the bar",
      ],
      teaching_goals: [
        "sustain evenness at the piece's point of maximum activity",
        "feel sequences as forward motion, not repetition",
      ],
      style_tips: [
        "think in long four-bar lines, not beat to beat",
        "no ritardando — the close is near but not here",
      ],
      teaching_notes: [
        {
          measure: 53,
          note: "The densest bar of the whole work — slow practice here pays off everywhere else.",
          technique: ["metronome at half tempo first", "voice the moving sixteenths clearly"],
        },
      ],
      user: "Play measures 53–56 and describe the character at the fugue's peak.",
      analysis:
        "Measure 53 is the single busiest bar of the entire piece — forty note onsets — and mm. 53–56 keep that energy moving through sequential figures colored by C# (a D minor shade), with one more soprano entry arriving late in m.55. Nothing slows down yet; the music is still driving toward the close. Let me loop mm. 53–56.",
      summary:
        "Bach BWV 846 fugue mm. 53–56: maximum density (m53 is the busiest bar of the piece), sequential drive with D minor color, soprano entry late in m55. Continuation from mm. 49–52.",
    },
    deadPhrases: ["harmonic motion slows", "winding down", "penultimate phrase", "final cadential gesture", "motion slowing", "approach to final cadence", "resolution to C major is now inevitable", "final dominant"],
  },
  {
    file: "bach-prelude-c-major-bwv846-m057-060.json",
    tier: "A",
    window: [57, 60],
    fields: {
      label: "drive onto the tonic pedal — antecedent",
      structure:
        "Final drive and tonic pedal — dominant arrival at the end of m58, low C pedal from m59 with the last subject entries above it",
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
      style_tips: [
        "let the low C sustain fully — it carries the whole ending",
        "keep the upper voices flowing over the stationary bass",
      ],
      teaching_notes: [
        {
          measure: 59,
          note: "The bass note struck here is held to the very end — and the tenor's last subject statement rises directly out of it.",
          technique: ["hold the pedal note its full value", "shape the tenor entry as the lead voice"],
        },
      ],
      user: "Show me measures 57–60 of the Bach BWV 846 fugue — how does the ending begin?",
      analysis:
        "Measures 57–58 make the last cadential push — the bass winds stepwise down and lands on G, the dominant, at the end of m.58. Then m.59 begins the real ending: the bass drops to a low C and holds it as a tonic pedal all the way to the final bar. Above it the tenor states the fugue's last full subject entry — mirroring the alto's opening statement an octave below — answered by the alto starting on F, while Bb color tilts the harmony toward the subdominant. Let me loop mm. 57–60.",
      summary:
        "Bach BWV 846 fugue mm. 57–60: the last cadential drive lands the dominant (m58); a low C tonic pedal begins at m59 with the final subject entries above it (tenor on C, alto on F) and Bb subdominant color.",
    },
    deadPhrases: ["last dominant preparation", "last dominant-area harmony", "penultimate chord", "final dominant preparation", "One of the last dominant harmonies", "emotional arc is completing", "arpeggio texture moves through"],
  },
  {
    file: "bach-prelude-c-major-bwv846-m061-062.json",
    tier: "A",
    window: [61, 62],
    fields: {
      label: "coda over the tonic pedal — consequent",
      structure:
        "Coda over the tonic pedal — B natural returns (m61), then a soprano octave run into the final wide-spaced C major chord (m62)",
      key_moments: [
        "m61 B naturals replace the Bb color — the harmony turns for home",
        "m62 a soprano sixteenth run climbs the octave to high C",
        "m62 final chord: wide-spaced C major over the still-sounding pedal",
      ],
      teaching_goals: [
        "feel the resolution as earned — by the pedal, the final entries, and the color turning from Bb back to B natural",
        "learn how a fugue ends: four voices arriving on one chord, not a fade-out",
      ],
      style_tips: [
        "the closing run should sound inevitable, not showy",
        "voice the final chord from the bass up and let it ring",
      ],
      teaching_notes: [
        {
          measure: 62,
          note: "The single line that started at m36 has become this full four-voice close — let the final chord ring over the pedal.",
          technique: ["slight broadening into the final chord", "release all voices together"],
        },
      ],
      user: "Play measures 61–62 and describe the final cadential arrival.",
      analysis:
        "Measures 61–62 close the fugue over the low C that has been sounding since m.59. During m.61 the Bb color gives way to B naturals and the harmony turns for home; in m.62 the soprano sweeps up an octave run to the top of the final sonority — a wide-spaced C major chord with the tenor and bass anchored on C. The four-voice journey that began with a single line at m.36 ends in one ringing chord. Let me loop mm. 61–62.",
      summary:
        "Bach BWV 846 fugue mm. 61–62: final cadence over the held tonic pedal — B natural turns the harmony home, a soprano run climbs the octave, and the piece ends on a wide-spaced C major chord. Continuation from mm. 57–60.",
    },
    deadPhrases: ["complete the prelude", "last arpeggios settle", "final arpeggios", "let the last arpeggio ring", "final tonic C arrival, conclusion of the harmonic journey", "m61 tonic C return", "chord cycles returns to C major"],
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function fail(msg: string): never {
  console.error(`\nREVISION r002 FAILED: ${msg}`);
  process.exit(1);
}

function assertSealedTreeUntouched(when: string): void {
  const actual = sha256(readFileSync(PUBLIC_RECORDS_JSONL));
  if (actual !== SEALED_PUBLIC_RECORDS_SHA) {
    fail(
      `${when}: sealed datasets/jam-actions-v0-public/records.jsonl sha256 is ${actual}, ` +
        `expected ${SEALED_PUBLIC_RECORDS_SHA}. The sealed package must never change.`,
    );
  }
}

// New strings must be embeddable verbatim in the builder's TS source
// (double-quoted literals) so the builder-consistency gate can be a plain
// substring check.
function assertEmbeddable(s: string, where: string): void {
  if (s.includes('"') || s.includes("\\")) {
    fail(`${where}: new string contains a double quote or backslash — not embeddable verbatim in the builder: ${s}`);
  }
}

// ─── Ground-truth verifier (executed, not attested) ──────────────────────────
//
// Re-derives from the source MIDI every musical fact the new prose cites.
// Any mismatch is a hard stop: either the MIDI changed or the prose is wrong.

interface GtNote {
  note: number;
  startTick: number;
  durTicks: number;
}

function verifyGroundTruth(): Record<string, unknown> {
  const midi = parseMidi(readFileSync(MIDI_PATH));
  const tpb: number = midi.header.ticksPerBeat;
  const TPM = tpb * 4;
  const M = (tick: number) => Math.floor(tick / TPM) + 1;
  const beatIn = (tick: number) => (tick - (M(tick) - 1) * TPM) / tpb;

  const tracks: Array<{ name: string; notes: GtNote[] }> = [];
  for (const t of midi.tracks) {
    let tick = 0;
    let name = "";
    const open = new Map<string, number>();
    const notes: GtNote[] = [];
    for (const ev of t) {
      tick += ev.deltaTime;
      if (ev.type === "trackName") name = ev.text;
      if (ev.type === "noteOn" && ev.velocity > 0) {
        open.set(`${ev.channel}:${ev.noteNumber}`, tick);
      } else if (ev.type === "noteOff" || (ev.type === "noteOn" && ev.velocity === 0)) {
        const k = `${ev.channel}:${ev.noteNumber}`;
        const start = open.get(k);
        if (start !== undefined) {
          notes.push({ note: ev.noteNumber, startTick: start, durTicks: tick - start });
          open.delete(k);
        }
      }
    }
    if (notes.length > 0) tracks.push({ name, notes });
  }

  const expectTrack = (name: string, firstM: number, lastM: number): GtNote[] => {
    const t = tracks.find((x) => x.name === name);
    if (!t) fail(`ground truth: MIDI track "${name}" not found`);
    const first = M(Math.min(...t.notes.map((n) => n.startTick)));
    // Last SOUNDING measure (note-off based): the fugue bass strikes its final
    // pedal note at m59 and holds it through m62.
    const last = M(Math.max(...t.notes.map((n) => n.startTick + n.durTicks)) - 1);
    if (first !== firstM || last !== lastM) {
      fail(`ground truth: track "${name}" spans mm. ${first}-${last}, expected ${firstM}-${lastM}`);
    }
    return t.notes;
  };

  // Movement layout: prelude tracks mm. 1-35, fugue voices mm. 36/37/39/40 → 62.
  expectTrack("Piano right", 1, 35);
  expectTrack("Piano left", 1, 35);
  const soprano = expectTrack("Fuga 1", 37, 62);
  const alto = expectTrack("Fuga 2", 36, 62);
  const tenor = expectTrack("Fuga 3", 39, 62);
  const bass = expectTrack("Fuga 4", 40, 62);

  const allNotes = tracks.flatMap((t) => t.notes);
  const total = allNotes.length;
  if (total !== 1284) fail(`ground truth: total notes ${total}, expected 1284`);
  const lastMeasure = Math.max(...allNotes.map((n) => M(n.startTick)));
  if (lastMeasure !== 62) fail(`ground truth: last measure ${lastMeasure}, expected 62`);

  // Voice first entries (measure, rounded beat, pitch).
  const firstOf = (notes: GtNote[]) => notes.reduce((a, b) => (b.startTick < a.startTick ? b : a));
  const entryChecks: Array<[string, GtNote[], number, number, number]> = [
    ["alto (Fuga 2)", alto, 36, 0.5, 60], // C4
    ["soprano (Fuga 1)", soprano, 37, 2.5, 67], // G4
    ["tenor (Fuga 3)", tenor, 39, 0.5, 55], // G3
    ["bass (Fuga 4)", bass, 40, 2.5, 48], // C3
  ];
  for (const [label, notes, m, b, pitch] of entryChecks) {
    const f = firstOf(notes);
    if (M(f.startTick) !== m || Math.abs(beatIn(f.startTick) - b) > 0.01 || f.note !== pitch) {
      fail(
        `ground truth: ${label} first entry is m${M(f.startTick)} beat ${beatIn(f.startTick)} pitch ${f.note}, ` +
          `expected m${m} beat ${b} pitch ${pitch}`,
      );
    }
  }

  // Subject-head statements: first 8 intervals of the alto's opening statement,
  // matched exactly across all four fugue voices.
  const altoSorted = [...alto].sort((a, b) => a.startTick - b.startTick);
  const head = altoSorted.slice(0, 9);
  const headIv = head.slice(1).map((n, i) => n.note - head[i].note);
  const expectedHeadIv = [2, 2, 1, 2, -2, -1, 5, -7];
  if (JSON.stringify(headIv) !== JSON.stringify(expectedHeadIv)) {
    fail(`ground truth: subject head intervals ${JSON.stringify(headIv)}, expected ${JSON.stringify(expectedHeadIv)}`);
  }
  const occurrences: Array<{ track: string; measure: number }> = [];
  for (const [trackName, notes] of [
    ["Fuga 1", soprano],
    ["Fuga 2", alto],
    ["Fuga 3", tenor],
    ["Fuga 4", bass],
  ] as const) {
    const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);
    for (let i = 0; i + 8 < sorted.length; i++) {
      let match = true;
      for (let k = 0; k < 8; k++) {
        if (sorted[i + k + 1].note - sorted[i + k].note !== expectedHeadIv[k]) {
          match = false;
          break;
        }
      }
      if (match) occurrences.push({ track: trackName, measure: M(sorted[i].startTick) });
    }
  }
  const expectedOccurrences: Array<[number, string]> = [
    [36, "Fuga 2"], [37, "Fuga 1"], [39, "Fuga 3"], [40, "Fuga 4"],
    [42, "Fuga 1"], [42, "Fuga 3"], [44, "Fuga 2"], [45, "Fuga 4"],
    [45, "Fuga 2"], [49, "Fuga 2"], [49, "Fuga 3"], [50, "Fuga 4"],
    [51, "Fuga 1"], [51, "Fuga 2"], [55, "Fuga 1"], [59, "Fuga 3"],
    [59, "Fuga 2"],
  ];
  const occKey = (o: { measure: number; track: string }) => `${o.measure}:${o.track}`;
  const gotOcc = occurrences.map(occKey).sort();
  const wantOcc = expectedOccurrences.map(([m, t]) => `${m}:${t}`).sort();
  if (JSON.stringify(gotOcc) !== JSON.stringify(wantOcc)) {
    fail(`ground truth: subject occurrences\n  got  ${gotOcc.join(", ")}\n  want ${wantOcc.join(", ")}`);
  }

  // Pedal spans. Lowest onset per measure must be G2 (43) for mm. 24-31 and
  // C2 (36) for mm. 32-35; m59 must strike C3 (48) held 16 beats (to the end).
  const lowestOnsetIn = (m: number): number | null => {
    const inM = allNotes.filter((n) => M(n.startTick) === m);
    return inM.length ? Math.min(...inM.map((n) => n.note)) : null;
  };
  for (let m = 24; m <= 31; m++) {
    if (lowestOnsetIn(m) !== 43) fail(`ground truth: m${m} lowest onset ${lowestOnsetIn(m)}, expected G2 (43) — dominant pedal`);
  }
  for (let m = 32; m <= 35; m++) {
    if (lowestOnsetIn(m) !== 36) fail(`ground truth: m${m} lowest onset ${lowestOnsetIn(m)}, expected C2 (36) — tonic pedal`);
  }
  const pedalNote = bass.find((n) => M(n.startTick) === 59 && n.note === 48 && beatIn(n.startTick) < 0.01);
  if (!pedalNote || pedalNote.durTicks !== 16 * tpb) {
    fail(`ground truth: m59 bass C3 pedal not found or not 16 beats (got ${pedalNote?.durTicks} ticks)`);
  }

  // Onset densities the prose cites.
  const onsetsIn = (m: number) => allNotes.filter((n) => M(n.startTick) === m).length;
  const densityChecks: Array<[number, number]> = [
    [35, 5],
    [36, 8],
    [47, 37],
    [53, 40],
  ];
  for (const [m, count] of densityChecks) {
    if (onsetsIn(m) !== count) fail(`ground truth: m${m} onsets ${onsetsIn(m)}, expected ${count}`);
  }
  let maxM = 1;
  for (let m = 1; m <= 62; m++) if (onsetsIn(m) > onsetsIn(maxM)) maxM = m;
  if (maxM !== 53) fail(`ground truth: busiest measure is m${maxM}, expected m53`);

  // m35 = single held C major chord (pitch classes {C,E,G}); m62 final sonority
  // contains C4, E5, G5, C6 over the held pedal.
  const pcsIn = (m: number) => new Set(allNotes.filter((n) => M(n.startTick) === m).map((n) => n.note % 12));
  const m35pcs = [...pcsIn(35)].sort((a, b) => a - b);
  if (JSON.stringify(m35pcs) !== JSON.stringify([0, 4, 7])) {
    fail(`ground truth: m35 pitch classes ${JSON.stringify(m35pcs)}, expected C major {0,4,7}`);
  }
  const m62notes = new Set(allNotes.filter((n) => M(n.startTick) === 62).map((n) => n.note));
  for (const p of [60, 76, 79, 84]) {
    if (!m62notes.has(p)) fail(`ground truth: m62 final sonority missing MIDI pitch ${p}`);
  }

  // Accidental colors cited by window (presence of pitch class in measure range).
  const pcInRange = (pc: number, lo: number, hi: number) =>
    allNotes.some((n) => n.note % 12 === pc && M(n.startTick) >= lo && M(n.startTick) <= hi);
  const colorChecks: Array<[string, number, number, number]> = [
    ["F# in mm. 37-40 (answer color)", 6, 37, 40],
    ["C# in m43 (D minor shade)", 1, 43, 43],
    ["Bb in m43 (D minor shade)", 10, 43, 43],
    ["G# in mm. 46-48 (A minor color)", 8, 46, 48],
    ["G# in m51", 8, 51, 51],
    ["Bb in m51", 10, 51, 51],
    ["F# in m51", 6, 51, 51],
    ["C# in mm. 53-54 (D minor color)", 1, 53, 54],
    ["Bb in mm. 59-60 (subdominant lean)", 10, 59, 60],
    ["B natural in m61 (turn home)", 11, 61, 61],
    ["F# first accidental at m6", 6, 6, 6],
    ["Bb at m20 (C7 pivot)", 10, 20, 20],
  ];
  for (const [label, pc, lo, hi] of colorChecks) {
    if (!pcInRange(pc, lo, hi)) fail(`ground truth: expected ${label} — not found`);
  }
  // "first accidental at m6" also requires mm. 1-5 all natural.
  for (let m = 1; m <= 5; m++) {
    const pcs = [...pcsIn(m)];
    if (pcs.some((p) => [1, 3, 6, 8, 10].includes(p))) fail(`ground truth: accidental found in m${m}; m6 F# is not first`);
  }

  return {
    total_notes: total,
    measures: lastMeasure,
    prelude_tracks: "Piano right/left mm. 1-35",
    fugue_entries: { alto: "m36 C4", soprano: "m37 G4", tenor: "m39 G3", bass: "m40 C3" },
    subject_head_intervals: expectedHeadIv,
    subject_statements_exact: expectedOccurrences.length,
    dominant_pedal: "G2 mm. 24-31",
    tonic_pedal_prelude: "C2 mm. 32-35",
    tonic_pedal_fugue: "C3 m59 held 16 beats to the end",
    onsets: { m35: 5, m36: 8, m47: 37, m53: 40, busiest: "m53" },
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const tierArg = args.find((a) => a.startsWith("--tier="))?.split("=")[1];
if (tierArg !== "A" && tierArg !== "AB") {
  fail(
    "pass --tier=A (fugue-window records mm. 33-62 only) or --tier=AB (all 16 Bach records). " +
      "The tier is the director's scope decision — this script will not choose.",
  );
}
const TIER: "A" | "AB" = tierArg;
const active = CORRECTIONS.filter((c) => (TIER === "AB" ? true : c.tier === "A"));

console.log(`jam-actions-v0 revision r002 — Bach annotation prose correction`);
console.log(`  tier=${TIER} (${active.length} records)${DRY_RUN ? "  [DRY RUN — no writes]" : ""}`);

assertSealedTreeUntouched("pre-flight");

console.log("  verifying ground truth against the source MIDI…");
const groundTruth = verifyGroundTruth();
console.log("  ground truth OK — every cited musical fact re-derived from MIDI");

// Meta-assert: all new strings embeddable in builder source.
for (const c of active) {
  const f = c.fields;
  const all: string[] = [
    f.label, f.structure, f.user, f.analysis, f.summary,
    ...f.key_moments, ...f.teaching_goals, ...f.style_tips,
    ...f.teaching_notes.flatMap((n) => [n.note, ...(n.technique ?? [])]),
  ];
  for (const s of all) assertEmbeddable(s, c.file);
}

// Builder-consistency gate (apply only): the corrected strings must already be
// in SONG_SPECS so a from-scratch rebuild reproduces the corrected records.
// The m001-004 record is repurposed (its prose is record-resident), but its
// strings are unified into spec pair 1 so the gate is uniform.
if (!DRY_RUN) {
  const builderSrc = readFileSync(BUILDER_PATH, "utf8");
  for (const c of active) {
    for (const s of [c.fields.user, c.fields.analysis, c.fields.summary, c.fields.label, c.fields.structure]) {
      if (!builderSrc.includes(s)) {
        fail(
          `builder consistency: scripts/build-jam-actions-corpus.ts does not contain the corrected string for ${c.file}:\n  "${s}"\n` +
            `Edit SONG_SPECS first (the builder and the records must never disagree).`,
        );
      }
    }
  }
  console.log("  builder consistency OK — corrected strings present in SONG_SPECS");
} else {
  console.log("  [dry-run] builder consistency gate SKIPPED (builder not yet edited is expected at review time)");
}

const strictSchema = makeRecordSchema({ allow_placeholders: false });
const catalog = loadToolSchemaCatalog();
const shaByFile = new Map(BEFORE_SHAS.map(([p, s]) => [p.replace("records/", ""), s]));

interface Change {
  file: string;
  before: string;
  after: string;
  changedFields: string[];
}
const changes: Change[] = [];
let alreadyApplied = 0;

for (const c of active) {
  const path = join(RECORDS_DIR, c.file);
  const raw = readFileSync(path, "utf8");
  const record = JSON.parse(raw);
  const original = JSON.parse(raw);

  if (record.scope?.song_id !== SONG_ID) fail(`${c.file}: song_id is ${record.scope?.song_id}`);
  const mr = record.annotation_target?.measure_range;
  if (!Array.isArray(mr) || mr[0] !== c.window[0] || mr[1] !== c.window[1]) {
    fail(`${c.file}: measure_range ${JSON.stringify(mr)} != expected ${JSON.stringify(c.window)}`);
  }
  if (record.observation?.midi_sidecar?.midi_sha256) {
    if (MIDI_SHA_FROM_RECORDS === null) {
      MIDI_SHA_FROM_RECORDS = record.observation.midi_sidecar.midi_sha256;
      const actualMidiSha = sha256(readFileSync(MIDI_PATH));
      if (actualMidiSha !== MIDI_SHA_FROM_RECORDS) {
        fail(`source MIDI sha ${actualMidiSha} != records' sidecar pin ${MIDI_SHA_FROM_RECORDS}`);
      }
    } else if (record.observation.midi_sidecar.midi_sha256 !== MIDI_SHA_FROM_RECORDS) {
      fail(`${c.file}: sidecar midi sha differs from sibling records`);
    }
  }

  const sess = record.target_trace?.session;
  if (!Array.isArray(sess) || sess.length !== 6) fail(`${c.file}: expected 6 session turns`);
  if (sess[0].role !== "user" || sess[3].role !== "assistant" || sess[5].role !== "assistant") {
    fail(`${c.file}: unexpected session roles`);
  }

  const f = c.fields;
  const current = {
    label: record.scope.musical_phrase_label,
    structure: record.annotation_target.structure,
    key_moments: record.annotation_target.key_moments,
    teaching_goals: record.annotation_target.teaching_goals,
    style_tips: record.annotation_target.style_tips,
    teaching_notes: record.annotation_target.teaching_notes,
    user: sess[0].content,
    analysis: sess[3].content,
    summary: sess[5].content,
  };
  const isApplied = JSON.stringify(current) === JSON.stringify({
    label: f.label, structure: f.structure, key_moments: f.key_moments,
    teaching_goals: f.teaching_goals, style_tips: f.style_tips, teaching_notes: f.teaching_notes,
    user: f.user, analysis: f.analysis, summary: f.summary,
  });
  if (isApplied) {
    alreadyApplied++;
    continue;
  }

  // Not yet applied → the input file must be byte-identical to the reviewed pin.
  const pin = shaByFile.get(c.file);
  if (!pin) fail(`${c.file}: no BEFORE sha pinned`);
  if (sha256(raw) !== pin) {
    fail(
      `${c.file}: sha256 ${sha256(raw)} != reviewed pin ${pin} and the corrected fields are not in place — ` +
        `the working set drifted since r002 was authored. Re-review before applying.`,
    );
  }

  // Apply the nine fields.
  record.scope.musical_phrase_label = f.label;
  record.annotation_target.structure = f.structure;
  record.annotation_target.key_moments = f.key_moments;
  record.annotation_target.teaching_goals = f.teaching_goals;
  record.annotation_target.style_tips = f.style_tips;
  record.annotation_target.teaching_notes = f.teaching_notes;
  sess[0].content = f.user;
  sess[3].content = f.analysis;
  sess[5].content = f.summary;

  // Anchor guard (builder parity): every teaching note inside the window.
  for (const tn of f.teaching_notes) {
    if (tn.measure < c.window[0] || tn.measure > c.window[1]) {
      fail(`${c.file}: teaching note anchored at m${tn.measure} outside window ${c.window[0]}-${c.window[1]}`);
    }
  }

  // Untouched-section asserts (belt and suspenders on top of by-construction).
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(record.observation, original.observation)) fail(`${c.file}: observation changed`);
  if (!same(record.provenance, original.provenance)) fail(`${c.file}: provenance changed`);
  if (!same(record.eval_metadata, original.eval_metadata)) fail(`${c.file}: eval_metadata changed`);
  const scopeA = { ...record.scope, musical_phrase_label: null };
  const scopeB = { ...original.scope, musical_phrase_label: null };
  if (!same(scopeA, scopeB)) fail(`${c.file}: scope changed beyond musical_phrase_label`);
  if (record.target_trace.objective !== original.target_trace.objective) fail(`${c.file}: objective changed`);
  for (const i of [1, 2, 4]) {
    if (!same(sess[i], original.target_trace.session[i])) fail(`${c.file}: session turn ${i} changed`);
  }
  for (const i of [1, 3]) {
    if (!same(sess[i].tool_calls, original.target_trace.session[i].tool_calls)) {
      fail(`${c.file}: tool_calls changed on turn ${i}`);
    }
  }

  // Validate exactly like the corpus builder.
  const parsed = strictSchema.safeParse(record);
  if (!parsed.success) {
    fail(`${c.file} FAILED strict schema validation:\n` + JSON.stringify(parsed.error.issues, null, 2));
  }
  const traceReport = validateTrace(record.target_trace, catalog);
  if (!traceReport.ok) {
    fail(`${c.file} FAILED trace validation:\n` + JSON.stringify(traceReport.mismatches, null, 2));
  }

  // Dead-phrase sweep over the full revised record.
  const revisedJson = JSON.stringify(record, null, 2) + "\n";
  for (const phrase of c.deadPhrases) {
    if (revisedJson.includes(phrase)) {
      fail(`${c.file}: revised record still contains dead phrase: "${phrase}"`);
    }
  }

  const changedFields = (Object.keys(f) as Array<keyof NewFields>).filter(
    (k) => !same(current[k as keyof typeof current], f[k]),
  );
  changes.push({ file: c.file, before: sha256(raw), after: sha256(revisedJson), changedFields: changedFields as string[] });

  if (!DRY_RUN) {
    writeFileSync(path, revisedJson, "utf8");
  }
}

// ─── Report / receipt ────────────────────────────────────────────────────────

if (changes.length === 0 && alreadyApplied === active.length) {
  assertSealedTreeUntouched("applied-state check");
  console.log(`Already applied (tier ${TIER}) — verified applied state for all ${active.length} records. Nothing to do.`);
  process.exit(0);
}

console.log(`\n  ${changes.length} record(s) ${DRY_RUN ? "would change" : "changed"}, ${alreadyApplied} already applied:`);
for (const ch of changes) {
  console.log(`    ${ch.file}`);
  console.log(`      fields: ${ch.changedFields.join(", ")}`);
  console.log(`      sha256: ${ch.before.slice(0, 12)}… → ${ch.after.slice(0, 12)}…`);
}

if (DRY_RUN) {
  console.log("\nDRY RUN complete — no files written. Review docs/jam-actions-v0-erratum-002-bach-annotation-prose.md for the full before/after text.");
  process.exit(0);
}

mkdirSync(REVISION_DIR, { recursive: true });
const receipt = {
  revision: "r002-bach-annotation-prose",
  tier: TIER,
  date: REVISION_DATE,
  script: "scripts/revise-jam-actions-v0-r002-bach-annotation-prose.ts",
  reason:
    "Bach BWV 846 annotation prose described mm. 33-62 as prelude material from an imagined " +
    "64-measure prelude; the source MIDI is prelude mm. 1-35 + fugue mm. 36-62. Prelude-window " +
    "chord labels (mm. 1-32) also disagreed with the MIDI. Prose corrected against executed " +
    "ground truth; tool calls, windows, sidecars, REMI, ABC, and SVGs untouched.",
  finding: "docs/jam-actions-v0-erratum-001-bach-m061-064.md §Known residuals (director-scoped follow-up)",
  erratum: "docs/jam-actions-v0-erratum-002-bach-annotation-prose.md",
  sealed_public_records_sha256: SEALED_PUBLIC_RECORDS_SHA,
  ground_truth_verified: groundTruth,
  invariants: {
    windows_ids_toolcalls_untouched: true,
    observation_provenance_eval_metadata_untouched: true,
    schema_and_trace_validated: true,
    dead_phrases_swept: true,
    builder_spec_consistency_asserted: true,
  },
  files: {
    modified: Object.fromEntries(changes.map((c) => [`records/${c.file}`, { before: c.before, after: c.after, fields: c.changedFields }])),
    already_applied: alreadyApplied,
  },
};
writeFileSync(join(REVISION_DIR, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n", "utf8");

assertSealedTreeUntouched("post-write");

console.log(`\n  receipt  datasets/jam-actions-v0/revisions/r002-bach-annotation-prose/receipt.json`);
console.log(`REVISION r002 (tier ${TIER}) APPLIED — sealed public package verified untouched.`);
