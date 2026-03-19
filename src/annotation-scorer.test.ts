import { describe, it, expect } from "vitest";
import { scoreAnnotation } from "./annotation-scorer.js";
import type { MusicalLanguage } from "./songs/types.js";

// Exemplar-quality annotation (modeled on fur-elise)
const exemplarAnnotation: MusicalLanguage = {
  description: "Composed around 1810 but not published until 1867, this piece is one of the most recognized piano works in history. The identity of 'Elise' remains debated — possibly Therese Malfatti. Structurally it is a Bagatelle, yet it contains extraordinary contrasts: the gossamer A theme in A minor gives way to a lyrical F major episode, then erupts into a stormy C section with rapid arpeggios.",
  structure: "Rondo form A-B-A-C-A. A section (bars 1–22): the iconic theme in A minor, piano dynamic, built on the E-D#-E semitone oscillation resolving to Am. B section (bars 23–38): contrasting lyrical episode in C major then F major. A return (bars 39–60). C section (bars 61–82): the dramatic heart with rapid arpeggios.",
  keyMoments: [
    "Bars 1–8, the A theme entrance: the E-D#-E-D#-E neighbor-note motif is one of music's most recognizable gestures — it teaches how two alternating notes can create unbearable tension",
    "Bars 23–30, the B section in C/F major: the shift from minor to major changes the entire emotional color — teaches key-relationship awareness",
    "Bars 61–68, the C section storm: the left-hand thirty-second-note arpeggios demand a completely different technique — teaches dramatic pacing",
    "The final A return after the C section storm: hearing the gentle theme after the turbulence teaches how context transforms meaning",
    "The D#/E oscillation throughout: recognizing a motif's transformation across a piece is a core analytical skill",
  ],
  teachingGoals: [
    "Rondo form (A-B-A-C-A): understanding how a recurring theme provides structural unity while contrasting episodes provide variety",
    "Touch differentiation: learn the A theme's legato cantabile touch, the B section's flowing evenness, the C section's weighted forte",
    "Dynamics as architecture: practice how dynamic changes delineate form — pp to ff and back",
    "Left-hand independence: develop even control of rapid arpeggios while the right hand plays different rhythm above",
    "Pedaling discipline: learn when NOT to pedal — keep semitone oscillation clean in A theme",
  ],
  styleTips: [
    "Play the A theme as if singing very quietly to yourself — imagine breathing between phrases. Touch is light, fingers close to keys.",
    "Do not rush the E-D#-E motif. Many players speed through it — but the tension IS the tune. Let each oscillation register.",
    "In the B section, bring out the top note of each sixteenth-note group as a hidden soprano melody.",
    "The C section is the only place to use arm weight and play from the shoulder. Everywhere else, play from fingers and wrist.",
    "Think of the piece as a miniature opera: A theme is the aria, B is a lyrical interlude, C is the dramatic confrontation.",
  ],
};

// Minimal/poor annotation
const poorAnnotation: MusicalLanguage = {
  description: "A nice song.",
  structure: "Simple.",
  keyMoments: ["It starts"],
  teachingGoals: ["Play it"],
  styleTips: ["Play nicely"],
};

// Medium annotation
const mediumAnnotation: MusicalLanguage = {
  description: "A jazz standard in G minor featuring the classic ii-V-I progression. The melody descends through the circle of fourths creating a satisfying harmonic journey.",
  structure: "AABA 32-bar form with the A sections presenting the main melody over Cm7-F7-BbMaj7 changes.",
  keyMoments: [
    "The descending circle-of-fourths sequence in bars 1-4 demonstrates jazz harmony",
    "The bridge provides rhythmic contrast with longer note values",
  ],
  teachingGoals: [
    "Learn ii-V-I progressions in major and minor keys",
    "Practice swing eighth-note feel",
  ],
  styleTips: [
    "Swing the eighth notes with approximately 2:1 ratio",
    "Leave space in comping — don't play on every beat",
  ],
};

describe("scoreAnnotation", () => {
  it("gives high score to exemplar-quality annotation", () => {
    const result = scoreAnnotation(exemplarAnnotation);
    expect(result.overall).toBeGreaterThanOrEqual(80);
    expect(result.grade).toMatch(/^[AB]$/);
    expect(result.completeness).toBeGreaterThanOrEqual(80);
  });

  it("gives low score to poor annotation", () => {
    const result = scoreAnnotation(poorAnnotation);
    expect(result.overall).toBeLessThan(40);
    expect(result.grade).toMatch(/^[DF]$/);
    expect(result.issues.filter(i => i.severity === "error").length).toBeGreaterThan(0);
  });

  it("gives medium score to decent annotation", () => {
    const result = scoreAnnotation(mediumAnnotation);
    expect(result.overall).toBeGreaterThanOrEqual(40);
    expect(result.overall).toBeLessThanOrEqual(85);
  });

  it("detects missing fields", () => {
    const empty: MusicalLanguage = {
      description: "",
      structure: "",
      keyMoments: [],
      teachingGoals: [],
      styleTips: [],
    };
    const result = scoreAnnotation(empty);
    expect(result.completeness).toBe(0);
    const errors = result.issues.filter(i => i.severity === "error");
    expect(errors.length).toBeGreaterThanOrEqual(5);
  });

  it("rewards musical vocabulary usage", () => {
    const result = scoreAnnotation(exemplarAnnotation);
    expect(result.musicalVocabulary).toBeGreaterThanOrEqual(70);

    const poorResult = scoreAnnotation(poorAnnotation);
    expect(poorResult.musicalVocabulary).toBeLessThan(50);
  });

  it("rewards specificity with bar references", () => {
    const result = scoreAnnotation(exemplarAnnotation);
    expect(result.specificity).toBeGreaterThanOrEqual(50);
  });

  it("generates actionable suggestions", () => {
    const result = scoreAnnotation(poorAnnotation);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("rewards teaching value with actionable verbs", () => {
    const result = scoreAnnotation(exemplarAnnotation);
    expect(result.teachingValue).toBeGreaterThanOrEqual(50);
  });
});
