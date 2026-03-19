// ─── ai-jam-sessions: Annotation Quality Scorer ──────────────────────────────
//
// Evaluates the quality of AI-written song annotations against exemplar
// standards. The 24 exemplar songs set the bar — this tool tells the AI
// how its annotation compares and what to improve.
//
// Quality dimensions:
//   1. Completeness — are all required fields present and non-trivial?
//   2. Depth — do descriptions go beyond surface-level observations?
//   3. Specificity — do annotations reference specific bars, chords, motifs?
//   4. Teaching value — do goals and tips teach something actionable?
//   5. Musical vocabulary — does the writing use proper musical terms?
// ─────────────────────────────────────────────────────────────────────────────

import type { MusicalLanguage } from "./songs/types.js";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AnnotationScore {
  overall: number;          // 0–100
  completeness: number;     // 0–100
  depth: number;            // 0–100
  specificity: number;      // 0–100
  teachingValue: number;    // 0–100
  musicalVocabulary: number; // 0–100

  issues: AnnotationIssue[];
  suggestions: string[];
  grade: string;            // A/B/C/D/F
}

export interface AnnotationIssue {
  field: string;
  severity: "error" | "warning" | "info";
  message: string;
}

// ─── Musical vocabulary patterns ────────────────────────────────────────────

const MUSICAL_TERMS = [
  // Harmony
  "chord", "key", "major", "minor", "diminished", "augmented", "dominant",
  "tonic", "subdominant", "cadence", "modulation", "progression", "ii-V-I",
  "tritone", "resolution", "voice.?leading", "root.?position", "inversion",
  "seventh", "ninth", "suspended", "half.?diminished", "chromatic",
  // Form
  "form", "AABA", "ABA", "rondo", "sonata", "binary", "ternary",
  "verse", "chorus", "bridge", "coda", "intro", "outro", "refrain",
  "section", "bar", "measure", "phrase",
  // Rhythm
  "tempo", "BPM", "swing", "straight", "syncopat", "rubato", "ritardando",
  "accelerando", "fermata", "triplet", "dotted", "tied",
  "time.?signature", "downbeat", "upbeat", "anacrusis",
  // Dynamics & Expression
  "pianissimo", "piano", "forte", "fortissimo", "crescendo", "decrescendo",
  "diminuendo", "sforzando", "legato", "staccato", "marcato",
  "cantabile", "espressivo", "dolce",
  // Texture & Technique
  "melody", "harmony", "counterpoint", "contrapuntal", "homophonic",
  "polyphonic", "ostinato", "arpeggio", "scale", "interval",
  "octave", "unison", "tremolo", "trill", "glissando", "pedal",
  // Pitch
  "semitone", "whole.?tone", "step", "leap", "conjunct", "disjunct",
  "ascending", "descending", "range", "register", "tessitura",
];

const BAR_REFERENCE_PATTERN = /\b(?:bars?|measures?|m)\s*\.?\s*\d+/i;
const CHORD_SYMBOL_PATTERN = /\b[A-G][#b]?(?:m(?:aj|in)?|dim|aug|sus|add|7|9|11|13|b5|#5|b9|#9)\b|\b[A-G][#b]?\s+(?:major|minor)\b/;
const NOTE_NAME_PATTERN = /\b[A-G][#b]?\d\b|\b[A-G][#b](?=[- ])/;

// ─── Scoring functions ──────────────────────────────────────────────────────

function scoreCompleteness(ml: MusicalLanguage): { score: number; issues: AnnotationIssue[] } {
  const issues: AnnotationIssue[] = [];
  let points = 0;
  const maxPoints = 10;

  // Description
  if (!ml.description || ml.description.length < 20) {
    issues.push({ field: "description", severity: "error", message: "Description is missing or too short (need 50+ words)" });
  } else if (ml.description.length < 100) {
    issues.push({ field: "description", severity: "warning", message: "Description is thin — exemplars average 100+ words" });
    points += 1;
  } else {
    points += 2;
  }

  // Structure
  if (!ml.structure || ml.structure.length < 20) {
    issues.push({ field: "structure", severity: "error", message: "Structure description is missing or too short" });
  } else if (ml.structure.length < 80) {
    issues.push({ field: "structure", severity: "warning", message: "Structure could be more detailed — describe each section" });
    points += 1;
  } else {
    points += 2;
  }

  // Key moments
  if (!ml.keyMoments || ml.keyMoments.length === 0) {
    issues.push({ field: "keyMoments", severity: "error", message: "No key moments listed" });
  } else if (ml.keyMoments.length < 3) {
    issues.push({ field: "keyMoments", severity: "warning", message: `Only ${ml.keyMoments.length} key moment(s) — exemplars have 3-5` });
    points += 1;
  } else {
    points += 2;
  }

  // Teaching goals
  if (!ml.teachingGoals || ml.teachingGoals.length === 0) {
    issues.push({ field: "teachingGoals", severity: "error", message: "No teaching goals listed" });
  } else if (ml.teachingGoals.length < 3) {
    issues.push({ field: "teachingGoals", severity: "warning", message: `Only ${ml.teachingGoals.length} teaching goal(s) — exemplars have 3-5` });
    points += 1;
  } else {
    points += 2;
  }

  // Style tips
  if (!ml.styleTips || ml.styleTips.length === 0) {
    issues.push({ field: "styleTips", severity: "error", message: "No style tips listed" });
  } else if (ml.styleTips.length < 3) {
    issues.push({ field: "styleTips", severity: "warning", message: `Only ${ml.styleTips.length} style tip(s) — exemplars have 3-5` });
    points += 1;
  } else {
    points += 2;
  }

  return { score: (points / maxPoints) * 100, issues };
}

function scoreDepth(ml: MusicalLanguage): { score: number; issues: AnnotationIssue[] } {
  const issues: AnnotationIssue[] = [];
  let points = 0;
  const maxPoints = 6;

  // Description depth: word count as proxy
  const descWords = (ml.description ?? "").split(/\s+/).length;
  if (descWords >= 80) {
    points += 2;
  } else if (descWords >= 40) {
    points += 1;
    issues.push({ field: "description", severity: "info", message: `Description is ${descWords} words — exemplars average 80-120 words with historical context` });
  } else {
    issues.push({ field: "description", severity: "warning", message: "Description lacks depth — add historical context, compositional significance, or performance tradition" });
  }

  // Key moments depth: each should explain WHY it matters, not just WHAT happens
  const moments = ml.keyMoments ?? [];
  const deepMoments = moments.filter(m => m.length > 80); // substantial explanation
  if (deepMoments.length >= 3) {
    points += 2;
  } else if (deepMoments.length >= 1) {
    points += 1;
    issues.push({ field: "keyMoments", severity: "info", message: "Key moments should explain why each moment matters pedagogically, not just describe it" });
  } else if (moments.length > 0) {
    issues.push({ field: "keyMoments", severity: "warning", message: "Key moments are too brief — each should be 1-2 sentences explaining its teaching significance" });
  }

  // Teaching goals depth
  const goals = ml.teachingGoals ?? [];
  const deepGoals = goals.filter(g => g.length > 60);
  if (deepGoals.length >= 3) {
    points += 2;
  } else if (deepGoals.length >= 1) {
    points += 1;
    issues.push({ field: "teachingGoals", severity: "info", message: "Teaching goals should explain both what to learn and why it matters" });
  } else if (goals.length > 0) {
    issues.push({ field: "teachingGoals", severity: "warning", message: "Teaching goals are too surface-level — explain the musical concept and its significance" });
  }

  return { score: (points / maxPoints) * 100, issues };
}

function scoreSpecificity(ml: MusicalLanguage): { score: number; issues: AnnotationIssue[] } {
  const issues: AnnotationIssue[] = [];
  let points = 0;
  const maxPoints = 6;

  const allText = [
    ml.description ?? "",
    ml.structure ?? "",
    ...(ml.keyMoments ?? []),
    ...(ml.teachingGoals ?? []),
    ...(ml.styleTips ?? []),
  ].join(" ");

  // Bar/measure references
  const barRefs = (allText.match(new RegExp(BAR_REFERENCE_PATTERN.source, "gi")) ?? []).length;
  if (barRefs >= 5) {
    points += 2;
  } else if (barRefs >= 2) {
    points += 1;
    issues.push({ field: "general", severity: "info", message: `Only ${barRefs} bar references — exemplars reference specific bars throughout` });
  } else {
    issues.push({ field: "general", severity: "warning", message: "No specific bar/measure references — annotations should point to exact locations in the score" });
  }

  // Chord symbol references
  const chordRefs = (allText.match(new RegExp(CHORD_SYMBOL_PATTERN.source, "g")) ?? []).length;
  if (chordRefs >= 4) {
    points += 2;
  } else if (chordRefs >= 1) {
    points += 1;
    issues.push({ field: "general", severity: "info", message: "Include more chord symbols — reference actual harmonic progressions" });
  } else {
    issues.push({ field: "general", severity: "warning", message: "No chord symbols found — annotations should reference specific harmonies" });
  }

  // Note name references
  const noteRefs = (allText.match(new RegExp(NOTE_NAME_PATTERN.source, "g")) ?? []).length;
  if (noteRefs >= 3) {
    points += 2;
  } else if (noteRefs >= 1) {
    points += 1;
  } else {
    issues.push({ field: "general", severity: "info", message: "Consider referencing specific pitches (e.g. 'the melody begins on E5')" });
  }

  return { score: (points / maxPoints) * 100, issues };
}

function scoreTeachingValue(ml: MusicalLanguage): { score: number; issues: AnnotationIssue[] } {
  const issues: AnnotationIssue[] = [];
  let points = 0;
  const maxPoints = 6;

  // Teaching goals should be actionable
  const goals = ml.teachingGoals ?? [];
  const actionableGoals = goals.filter(g =>
    /\b(learn|practice|develop|understand|recognize|hear|play|listen|identify|master|build)\b/i.test(g)
  );
  if (actionableGoals.length >= 3) {
    points += 2;
  } else if (actionableGoals.length >= 1) {
    points += 1;
    issues.push({ field: "teachingGoals", severity: "info", message: "Goals should use action verbs — what should the learner DO?" });
  } else if (goals.length > 0) {
    issues.push({ field: "teachingGoals", severity: "warning", message: "Teaching goals lack actionable verbs — they should guide practice" });
  }

  // Style tips should be practical
  const tips = ml.styleTips ?? [];
  const practicalTips = tips.filter(t =>
    /\b(play|touch|finger|hand|pedal|breath|sing|listen|feel|think|imagine|use|try|avoid|don't)\b/i.test(t)
  );
  if (practicalTips.length >= 3) {
    points += 2;
  } else if (practicalTips.length >= 1) {
    points += 1;
    issues.push({ field: "styleTips", severity: "info", message: "Style tips should be practical — HOW to play it, not just WHAT it sounds like" });
  } else if (tips.length > 0) {
    issues.push({ field: "styleTips", severity: "warning", message: "Style tips are too abstract — they should guide physical technique and interpretation" });
  }

  // Key moments should connect to learning
  const moments = ml.keyMoments ?? [];
  const teachingMoments = moments.filter(m =>
    /\b(teach|learn|show|demonstrate|illustrat|reveal|model|example|skill|technique)\b/i.test(m)
  );
  if (teachingMoments.length >= 2) {
    points += 2;
  } else if (teachingMoments.length >= 1) {
    points += 1;
  } else if (moments.length > 0) {
    issues.push({ field: "keyMoments", severity: "info", message: "Key moments should explain what they teach — why is this moment pedagogically important?" });
  }

  return { score: (points / maxPoints) * 100, issues };
}

function scoreMusicalVocabulary(ml: MusicalLanguage): { score: number; issues: AnnotationIssue[] } {
  const issues: AnnotationIssue[] = [];

  const allText = [
    ml.description ?? "",
    ml.structure ?? "",
    ...(ml.keyMoments ?? []),
    ...(ml.teachingGoals ?? []),
    ...(ml.styleTips ?? []),
  ].join(" ").toLowerCase();

  // Count unique musical terms used
  let termsFound = 0;
  for (const term of MUSICAL_TERMS) {
    if (new RegExp(term, "i").test(allText)) {
      termsFound++;
    }
  }

  // Scoring: exemplars use 15-25 unique terms
  let score: number;
  if (termsFound >= 20) {
    score = 100;
  } else if (termsFound >= 15) {
    score = 85;
  } else if (termsFound >= 10) {
    score = 70;
    issues.push({ field: "general", severity: "info", message: `Used ${termsFound} musical terms — exemplars average 15-25. Try to include more specific terminology.` });
  } else if (termsFound >= 5) {
    score = 50;
    issues.push({ field: "general", severity: "warning", message: `Only ${termsFound} musical terms found. Use proper terminology: dynamics, articulation, form, harmony concepts.` });
  } else {
    score = 25;
    issues.push({ field: "general", severity: "error", message: `Very few musical terms (${termsFound}). Annotations need proper musical vocabulary to be useful.` });
  }

  return { score, issues };
}

// ─── Main scorer ────────────────────────────────────────────────────────────

export function scoreAnnotation(ml: MusicalLanguage): AnnotationScore {
  const completeness = scoreCompleteness(ml);
  const depth = scoreDepth(ml);
  const specificity = scoreSpecificity(ml);
  const teachingValue = scoreTeachingValue(ml);
  const vocabulary = scoreMusicalVocabulary(ml);

  const allIssues = [
    ...completeness.issues,
    ...depth.issues,
    ...specificity.issues,
    ...teachingValue.issues,
    ...vocabulary.issues,
  ];

  // Weighted overall
  const overall = Math.round(
    completeness.score * 0.25 +
    depth.score * 0.20 +
    specificity.score * 0.20 +
    teachingValue.score * 0.20 +
    vocabulary.score * 0.15
  );

  const grade = overall >= 90 ? "A" : overall >= 80 ? "B" : overall >= 70 ? "C"
    : overall >= 60 ? "D" : "F";

  // Generate suggestions based on lowest scores
  const suggestions: string[] = [];
  const scores = [
    { name: "completeness", score: completeness.score },
    { name: "depth", score: depth.score },
    { name: "specificity", score: specificity.score },
    { name: "teaching value", score: teachingValue.score },
    { name: "musical vocabulary", score: vocabulary.score },
  ].sort((a, b) => a.score - b.score);

  for (const s of scores.slice(0, 2)) {
    if (s.score < 70) {
      switch (s.name) {
        case "completeness":
          suggestions.push("Fill out all five sections (description, structure, key moments, teaching goals, style tips) with 3-5 items each.");
          break;
        case "depth":
          suggestions.push("Go deeper — explain WHY things matter, not just WHAT they are. Add historical context and compositional significance.");
          break;
        case "specificity":
          suggestions.push("Reference specific bars, chord symbols, and note names. Point to exact locations in the score.");
          break;
        case "teaching value":
          suggestions.push("Make annotations actionable — use verbs like 'learn', 'practice', 'listen for'. Guide the learner's attention.");
          break;
        case "musical vocabulary":
          suggestions.push("Use more musical terminology — dynamics, articulations, form terms, harmonic concepts.");
          break;
      }
    }
  }

  if (overall >= 85) {
    suggestions.push("Strong annotation. Consider adding cross-references to similar pieces in the library.");
  }

  return {
    overall,
    completeness: Math.round(completeness.score),
    depth: Math.round(depth.score),
    specificity: Math.round(specificity.score),
    teachingValue: Math.round(teachingValue.score),
    musicalVocabulary: Math.round(vocabulary.score),
    issues: allIssues,
    suggestions,
    grade,
  };
}

// ─── Formatter ──────────────────────────────────────────────────────────────

export function formatAnnotationScore(score: AnnotationScore, songTitle: string): string {
  const lines: string[] = [];

  lines.push(`# Annotation Quality: ${songTitle}`);
  lines.push("");
  lines.push(`**Grade: ${score.grade} (${score.overall}/100)**`);
  lines.push("");
  lines.push("| Dimension | Score |");
  lines.push("|-----------|-------|");
  lines.push(`| Completeness | ${score.completeness}% |`);
  lines.push(`| Depth | ${score.depth}% |`);
  lines.push(`| Specificity | ${score.specificity}% |`);
  lines.push(`| Teaching Value | ${score.teachingValue}% |`);
  lines.push(`| Musical Vocabulary | ${score.musicalVocabulary}% |`);
  lines.push("");

  // Issues by severity
  const errors = score.issues.filter(i => i.severity === "error");
  const warnings = score.issues.filter(i => i.severity === "warning");
  const infos = score.issues.filter(i => i.severity === "info");

  if (errors.length > 0) {
    lines.push("### Errors (must fix)");
    for (const issue of errors) {
      lines.push(`- **${issue.field}**: ${issue.message}`);
    }
    lines.push("");
  }

  if (warnings.length > 0) {
    lines.push("### Warnings (should fix)");
    for (const issue of warnings) {
      lines.push(`- **${issue.field}**: ${issue.message}`);
    }
    lines.push("");
  }

  if (infos.length > 0) {
    lines.push("### Suggestions");
    for (const issue of infos) {
      lines.push(`- ${issue.message}`);
    }
    lines.push("");
  }

  if (score.suggestions.length > 0) {
    lines.push("### Next Steps");
    for (const s of score.suggestions) {
      lines.push(`- ${s}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
