// ─── analysis-chords.test.ts ──────────────────────────────────────────────────
//
// Tests for scripts/analysis-chords.ts: the shared onset-parsing primitives
// (parseHandEvents, measureBeatsFromTimeSignature, pitchClassProfile), key
// detection (detectKey/buildSongPitchClassProfile [50]), the key-bias
// mechanism (buildKeyBias/matchTemplates), the texture classifier, the
// nested-template margin exclusion + rootless-shell reinterpretation [51],
// and the whole-song analyzeChords pipeline (template matching, half-measure
// segmentation, confidence gating, progression summary, coverage caveat).
//
// Threshold values asserted below (HIGH_CONFIDENCE_CUT=0.5,
// NORMAL_CONFIDENCE_FLOOR=0.15, UNHEARD_TONE_PENALTY=0.4) were calibrated
// empirically against this exact scoring formula before this file was
// written — see analysis-chords.ts's own comments on matchTemplates and
// HIGH_CONFIDENCE_CUT for the derivation. Confidence numbers asserted here
// (e.g. 0.792) are the module's actual, reproducible output for these
// fixtures, not hand-guessed round numbers. A Lens-H adversarial pass (Wave
// W-H harness fixes) later corrected the margin computation to exclude
// nested (subset/superset) templates from the confidence comparison — the
// pre-fix numbers this suite used to assert (e.g. 0.626) were themselves an
// artifact of the bug (comparing a winner against its own nested seventh/
// triad sibling); see the finding-3 tests below for the fixture that
// exposed it (a complete, unambiguous G7 block chord that used to be
// silently dropped, never emitted at all).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import type { Measure } from "../src/songs/types.js";
import {
  analyzeChords,
  parseHandEvents,
  measureBeatsFromTimeSignature,
  pitchClassProfile,
  classifyTexture,
  detectKey,
  buildSongPitchClassProfile,
  buildKeyBias,
  matchTemplates,
  round3,
  DURATION_CODE_BEATS,
  PITCH_CLASS_NAMES,
} from "./analysis-chords.js";

function m(number: number, rightHand: string, leftHand: string): Measure {
  return { number, rightHand, leftHand };
}

// ─── parseHandEvents ────────────────────────────────────────────────────────

describe("parseHandEvents", () => {
  it("returns no onsets for a whole-measure rest", () => {
    expect(parseHandEvents("R:w")).toEqual([]);
    expect(parseHandEvents("")).toEqual([]);
  });

  it("parses a single note with its duration and start beat", () => {
    expect(parseHandEvents("C4:q")).toEqual([{ pitches: [60], startBeat: 0, durationBeats: 1 }]);
  });

  it("expands a chord token, sorted ascending", () => {
    const [onset] = parseHandEvents("G4+C4+E4:h");
    expect(onset.pitches).toEqual([60, 64, 67]); // C4=60, E4=64, G4=67
    expect(onset.durationBeats).toBe(2);
  });

  it("advances the beat cursor sequentially across tokens", () => {
    const events = parseHandEvents("C4:q D4:q E4:h");
    expect(events.map((e) => e.startBeat)).toEqual([0, 1, 2]);
    expect(events.map((e) => e.durationBeats)).toEqual([1, 1, 2]);
  });

  it("advances the cursor for a bare rest token amid other tokens without producing an onset", () => {
    const events = parseHandEvents("C4:q R:q E4:q");
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ pitches: [60], startBeat: 0 });
    expect(events[1]).toMatchObject({ pitches: [64], startBeat: 2 }); // skipped the rest's beat
  });

  it("defaults to a quarter-note (1 beat) when no duration suffix is present", () => {
    expect(parseHandEvents("C4")).toEqual([{ pitches: [60], startBeat: 0, durationBeats: 1 }]);
  });

  it("covers every duration code ticksToDuration can emit", () => {
    const codes = Object.keys(DURATION_CODE_BEATS);
    expect(codes.sort()).toEqual(["e", "e.", "et", "h", "h.", "ht", "q", "q.", "qt", "s", "w"].sort());
    for (const code of codes) {
      expect(() => parseHandEvents(`C4:${code}`)).not.toThrow();
    }
  });

  it("throws a structured error for an unrecognized duration code", () => {
    expect(() => parseHandEvents("C4:zz")).toThrow(/Unrecognized duration code/);
  });

  it("throws a structured error for an unrecognized note token", () => {
    expect(() => parseHandEvents("H4:q")).toThrow(/Unrecognized note token/);
  });
});

// ─── measureBeatsFromTimeSignature ─────────────────────────────────────────

describe("measureBeatsFromTimeSignature", () => {
  it("computes beats for common time signatures", () => {
    expect(measureBeatsFromTimeSignature("4/4")).toBe(4);
    expect(measureBeatsFromTimeSignature("3/4")).toBe(3);
    expect(measureBeatsFromTimeSignature("6/8")).toBe(3);
    expect(measureBeatsFromTimeSignature("2/2")).toBe(4);
  });

  it("falls back to 4/4 for a garbage time signature", () => {
    expect(measureBeatsFromTimeSignature("not-a-time-sig")).toBe(4);
  });
});

// ─── pitchClassProfile ──────────────────────────────────────────────────────

describe("pitchClassProfile", () => {
  it("clips an onset's duration to the requested beat window (overlap, not full duration)", () => {
    // A whole-measure C4 (4 beats) queried only over beats [0,2) should contribute 2 beats of mass, not 4.
    const rh = parseHandEvents("C4:w");
    const profile = pitchClassProfile(rh, [], 0, 2);
    expect(profile[0]).toBe(2);
    expect(profile.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("combines both hands into one profile", () => {
    const rh = parseHandEvents("C4:q");
    const lh = parseHandEvents("G3:q");
    const profile = pitchClassProfile(rh, lh, 0, 1);
    expect(profile[0]).toBe(1); // C
    expect(profile[7]).toBe(1); // G
  });

  it("excludes onsets entirely outside the window", () => {
    const rh = parseHandEvents("C4:q D4:q");
    const profile = pitchClassProfile(rh, [], 0, 1); // only the C4 (beat 0-1) is in range
    expect(profile[0]).toBe(1);
    expect(profile[2]).toBe(0); // D
  });
});

// ─── classifyTexture ────────────────────────────────────────────────────────

describe("classifyTexture", () => {
  it("classifies simultaneous 3-note onsets as block", () => {
    const onsets = parseHandEvents("C4+E4+G4:w");
    expect(classifyTexture(onsets)).toBe("block");
  });

  it("classifies single-note-per-onset sequences as arpeggiated", () => {
    const onsets = parseHandEvents("C4:q E4:q G4:q C5:q");
    expect(classifyTexture(onsets)).toBe("arpeggiated");
  });

  it("uses the mean pitches-per-onset threshold, not a per-onset rule (a mix can still tip either way)", () => {
    // Two 2-note onsets: mean = 2.0, exactly at the block threshold.
    const onsets = parseHandEvents("C4+E4:h G4+B4:h");
    expect(classifyTexture(onsets)).toBe("block");
  });
});

// ─── detectKey / buildSongPitchClassProfile [50] ───────────────────────────

/** Build a 12-length pitch-class-mass array from a sparse {pc: mass} map — lets key-detection fixtures state "how much weight sits on which scale degree" directly, without fighting note-string durations for a relationship (Pearson correlation) that only cares about relative proportions. */
function pcMass(masses: Record<number, number>): number[] {
  const profile = new Array(12).fill(0);
  for (const [pc, mass] of Object.entries(masses)) profile[Number(pc)] = mass;
  return profile;
}

describe("detectKey", () => {
  it("returns null for an all-silent profile", () => {
    expect(detectKey(new Array(12).fill(0))).toBeNull();
  });

  it("detects C major from a pure, equally-weighted C-major diatonic scale", () => {
    // The major-scale pitch-class SET alone (no extra chord-tone emphasis)
    // already correlates best with its own tonic's major profile — the
    // profile's own per-degree weighting (not just "which 7 notes appear")
    // is what breaks the tie against other candidates, including the
    // relative minor (see the next test for why that pair specifically
    // needs emphasis, not just scale content, to disambiguate).
    const measures = [m(1, "C4:e D4:e E4:e F4:e G4:e A4:e B4:e C5:e", "R:w")];
    const profile = buildSongPitchClassProfile(measures, 4);
    const result = detectKey(profile)!;
    expect(result).toMatchObject({ tonicPc: 0, mode: "major" });
    expect(result.margin).toBeGreaterThan(0.1); // decisively above KEY_DETECTION_CONFIDENCE_FLOOR (0.05), not a borderline call
  });

  it("disambiguates C major vs. its relative A minor via chord-tone weighting, not scale content", () => {
    // Both keys share the exact same 7 diatonic pitch classes — the ONLY
    // thing that can tell them apart is which tones get emphasized. Tonic
    // triad tones weighted up (tonic doubled), the other 4 scale tones
    // weighted down, flips the detected key between the two fixtures even
    // though both use pitch classes drawn from the identical 7-note set.
    const cMajorEmphasis = pcMass({ 0: 6, 4: 3, 7: 3, 2: 0.25, 5: 0.25, 9: 0.25, 11: 0.25 });
    const aMinorEmphasis = pcMass({ 9: 6, 0: 3, 4: 3, 2: 0.25, 5: 0.25, 7: 0.25, 11: 0.25 });

    expect(detectKey(cMajorEmphasis)).toMatchObject({ tonicPc: 0, mode: "major" });
    expect(detectKey(aMinorEmphasis)).toMatchObject({ tonicPc: 9, mode: "minor" });
  });
});

describe("buildSongPitchClassProfile", () => {
  it("sums duration-weighted mass across every measure of the whole song", () => {
    const measures = [m(1, "C4:q", "R:w"), m(2, "C4:h", "R:w"), m(3, "R:w", "R:w")];
    const profile = buildSongPitchClassProfile(measures, 4);
    expect(profile[0]).toBe(3); // 1 beat (measure 1) + 2 beats (measure 2)
    expect(profile.reduce((a, b) => a + b, 0)).toBe(3);
  });
});

// ─── buildKeyBias ───────────────────────────────────────────────────────────

describe("buildKeyBias", () => {
  it("returns null for an unparseable key string", () => {
    expect(buildKeyBias("not a key")).toBeNull();
    expect(buildKeyBias("")).toBeNull();
  });

  it("builds the diatonic set for a major key (I ii iii IV V vi vii)", () => {
    const bias = buildKeyBias("C major")!;
    expect(bias.diatonic.has("0:maj")).toBe(true); // I
    expect(bias.diatonic.has("2:min")).toBe(true); // ii
    expect(bias.diatonic.has("7:maj")).toBe(true); // V
    expect(bias.diatonic.has("7:dom7")).toBe(true); // V7
    expect(bias.diatonic.has("11:dim")).toBe(true); // vii°
    expect(bias.diatonic.has("1:maj")).toBe(false); // not diatonic to C major
  });

  it("builds the diatonic set for a minor key including the harmonic-minor V and vii°", () => {
    const bias = buildKeyBias("A minor")!;
    expect(bias.diatonic.has("9:min")).toBe(true); // i (natural minor)
    expect(bias.diatonic.has("4:min")).toBe(true); // v (natural minor)
    expect(bias.diatonic.has("4:maj")).toBe(true); // V (harmonic minor — the finding-51-motivated extra)
    expect(bias.diatonic.has("4:dom7")).toBe(true); // V7 (harmonic minor)
    expect(bias.diatonic.has("8:dim")).toBe(true); // vii° (harmonic minor, raised leading tone G# in A minor)
  });

  it("handles a sharp/flat tonic", () => {
    const bias = buildKeyBias("F# minor")!;
    expect(bias.diatonic.has("6:min")).toBe(true); // i, F#=6
    const flatBias = buildKeyBias("Bb major")!;
    expect(flatBias.diatonic.has("10:maj")).toBe(true); // I, Bb=10
  });
});

// ─── matchTemplates: key-bias tiebreak ─────────────────────────────────────

describe("matchTemplates key-bias tiebreak", () => {
  it("boosts a diatonic candidate above an equally-scoring non-diatonic one", () => {
    // Two UNRELATED major triads sharing no pitch classes: C major {0,4,7}
    // and F# major {6,10,1}. Equal mass at all 6 -> both triads' own tones
    // are fully present (0 unheard tones each) -> raw cosine scores tie
    // exactly. Only C major is diatonic to the C-major key.
    const profile = new Array(12).fill(0);
    for (const pc of [0, 4, 7, 6, 10, 1]) profile[pc] = 1;

    const noBias = matchTemplates(profile, null);
    const withBias = matchTemplates(profile, buildKeyBias("C major"));
    const find = (arr: typeof noBias, root: number, quality: string) => arr.find((cand) => cand.root === root && cand.quality === quality)!.score;

    expect(find(noBias, 0, "maj")).toBeCloseTo(find(noBias, 6, "maj"), 10); // tied without bias
    expect(find(withBias, 0, "maj")).toBeGreaterThan(find(withBias, 6, "maj")); // C major pulls ahead
    expect(find(withBias, 6, "maj")).toBeCloseTo(find(noBias, 6, "maj"), 10); // the non-diatonic candidate is untouched
    expect(find(withBias, 0, "maj")).toBeCloseTo(find(noBias, 0, "maj") * 1.08, 10); // exactly the documented 8% nudge
  });

  it("applies no bias at all when keyBias is null", () => {
    const profile = new Array(12).fill(0);
    profile[0] = profile[4] = profile[7] = 1;
    const withNull = matchTemplates(profile, null);
    const cMaj = withNull.find((c) => c.root === 0 && c.quality === "maj")!;
    expect(cMaj.score).toBeCloseTo(1, 10); // perfect raw match, no boost applied/needed
  });

  it("returns an empty array for an all-silent profile", () => {
    expect(matchTemplates(new Array(12).fill(0), null)).toEqual([]);
  });
});

// ─── analyzeChords: whole-song pipeline ────────────────────────────────────

describe("analyzeChords", () => {
  it("labels a clean C major block chord (both hands) with high confidence, no half segmentation", () => {
    const measures = [m(1, "C4+E4+G4:w", "C3+E3+G3:w")];
    const result = analyzeChords(measures, "C major", "pop", "4/4");

    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]).toMatchObject({ measure: 1, label: "C", root: "C", quality: "maj" });
    expect(result.windows[0].half).toBeUndefined();
    expect(result.windows[0].implied).toBeUndefined();
    // 0.792, not the pre-margin-fix 0.626: the nested Cmaj7 sibling (a
    // one-unheard-tone superset of this exact triad) used to be the margin
    // comparison's runner-up, artificially shrinking the gap; excluding
    // nested templates from the margin (finding 3) widens it to the true
    // gap against the best genuinely different candidate.
    expect(result.windows[0].confidence).toBeCloseTo(0.792, 3);
  });

  it("marks the same clean chord implied:true when the genre is hard-gated (jazz)", () => {
    const measures = [m(1, "C4+E4+G4:w", "C3+E3+G3:w")];
    const result = analyzeChords(measures, "C major", "jazz", "4/4");

    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]).toMatchObject({ label: "C", implied: true });
    expect(result.windows[0].confidence).toBeGreaterThanOrEqual(0.5); // cleared the HIGH_CONFIDENCE_CUT
  });

  it("emits a complete arpeggiated Cmaj7 outright — the 7th tone is real evidence, not noise [finding 3]", () => {
    // All 4 chord tones sounded with equal weight: the seventh's raw score
    // architecturally beats its own subset triad's whenever the 7th tone
    // carries meaningful duration weight (matchTemplates' own scoring, no
    // special-casing needed) — this used to be suppressed by the same
    // margin-against-a-nested-sibling bug finding 3 fixes for block chords.
    const measures = [m(1, "C4:q E4:q G4:q B4:q", "R:w")];
    const result = analyzeChords(measures, "C major", "pop", "4/4");
    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]).toMatchObject({ label: "Cmaj7", root: "C", quality: "maj7", implied: true });
  });

  it("suppresses a genuinely ambiguous arpeggiated window — a real tie between two UNRELATED, non-nested triads", () => {
    // C major {0,4,7} and F# major {6,10,1} share no pitch classes and tie
    // exactly on raw score (see the matchTemplates key-bias tiebreak tests)
    // — nesting-exclusion can't rescue this one, because neither is a
    // subset/superset of the other; it's a genuine, unresolvable tie.
    const measures = [m(1, "C4:e E4:e G4:e F#4:e A#4:e C#5:e", "R:w")];
    const result = analyzeChords(measures, "C major", "pop", "4/4");
    expect(result.windows).toHaveLength(0);
  });

  it("labels a clean arpeggiated plain triad implied:true (no competing 7th-chord ambiguity)", () => {
    const measures = [m(1, "C4:q E4:q G4:q C5:q", "R:w")];
    const result = analyzeChords(measures, "C major", "pop", "4/4");
    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]).toMatchObject({ label: "C", implied: true });
  });

  it("suppresses a rootless jazz shell voicing (3rd+7th only, no root) at low confidence", () => {
    // A rootless G7 shell (3rd=B, b7=F) — the root-pitch-class G is never sounded at all.
    const measures = [m(1, "B4+F5:h R:h", "R:w")];
    const result = analyzeChords(measures, "C major", "jazz", "4/4");
    // "suppressed/implied at low confidence": either nothing is emitted, or
    // if something clears the gate anyway it must be honestly hedged.
    for (const w of result.windows) expect(w.implied).toBe(true);
    expect(result.windows.length === 0 || result.windows.every((w) => w.confidence < 0.4)).toBe(true);
  });

  it("picks the half-measure segmentation when it scores better than the whole measure (two distinct chords)", () => {
    const measures = [m(1, "R:w", "C3+E3+G3:h G3+B3+D4:h")];
    const result = analyzeChords(measures, "C major", "pop", "4/4");

    expect(result.windows).toHaveLength(2);
    expect(result.windows[0]).toMatchObject({ measure: 1, half: 1, label: "C" });
    expect(result.windows[1]).toMatchObject({ measure: 1, half: 2, label: "G" });
  });

  it("skips a full-measure rest entirely (no window, not even a suppressed placeholder)", () => {
    const measures = [m(1, "R:w", "R:w")];
    const result = analyzeChords(measures, "C major", "pop", "4/4");
    expect(result.windows).toEqual([]);
    expect(result.summary).toMatch(/No chord windows detected/);
  });

  it("builds a progression summary ranked by coverage, descending, with a matching summary line", () => {
    const measures = [m(1, "C4+E4+G4:w", "C3+E3+G3:w"), m(2, "C4+E4+G4:w", "C3+E3+G3:w"), m(3, "F4+A4+C5:w", "F3+A3+C4:w")];
    const result = analyzeChords(measures, "C major", "pop", "4/4");

    expect(result.progression[0]).toMatchObject({ label: "C", windows: 2, coverage: round3(2 / 3) });
    expect(result.progression[1]).toMatchObject({ label: "F", windows: 1, coverage: round3(1 / 3) });
    expect(result.summary).toBe(`Main progression candidates by coverage: C (67%), F (33%).`);
  });

  it("picks the half-measure segmentation for a mixed chord within one measure (the HOTRS shape: Am then E) [finding 4]", () => {
    // House of the Rising Sun's opening move — Am giving way to E within a
    // single measure — is the exact "mixed-chord measure" shape finding 4
    // named: verify the half-vs-whole pick logic actually fires for it
    // (not just for the pre-existing C/G fixture above) and both halves
    // get their own distinct, correct label.
    const measures = [m(1, "A4+C5+E5:h E4+G#4+B4:h", "R:w")];
    const result = analyzeChords(measures, "A minor", "folk", "4/4");

    expect(result.windows).toHaveLength(2);
    expect(result.windows[0]).toMatchObject({ measure: 1, half: 1, label: "Am", root: "A", quality: "min" });
    expect(result.windows[1]).toMatchObject({ measure: 1, half: 2, label: "E", root: "E", quality: "maj" });
  });

  it("coverage denominator counts ALL windows considered (not just emitted), and the summary caveats under 80% [finding 4]", () => {
    // Measure 1: a clean, easily-emitted C major block chord. Measure 2: a
    // genuinely ambiguous tie (see the finding-3 suppression test above) —
    // considered, but never emitted. Old behavior: coverage denominator was
    // emitted-windows-only, so the progression breakdown would have shown
    // "C (100%)" — literally true of the labeled subset, but a false
    // impression of the SONG (half of it has no label at all).
    const measures = [m(1, "C4+E4+G4:w", "C3+E3+G3:w"), m(2, "C4:e E4:e G4:e F#4:e A#4:e C#5:e", "R:w")];
    const result = analyzeChords(measures, "C major", "pop", "4/4");

    expect(result.windows).toHaveLength(1); // only measure 1 cleared the gate
    expect(result.progression[0]).toMatchObject({ label: "C", windows: 1, coverage: 0.5 }); // NOT 1 — denominator is both considered windows
    expect(result.summary).toContain("Main progression candidates by coverage: C (50%).");
    expect(result.summary).toMatch(/Labels cover 50% of measures/);
  });

  it("is deterministic across repeated calls on the same input", () => {
    const measures = [m(1, "C4+E4+G4:w", "C3+E3+G3:w"), m(2, "D4:q F#4:q A4:q D5:q", "R:w"), m(3, "R:w", "R:w")];
    const first = analyzeChords(measures, "D major", "jazz", "4/4");
    const second = analyzeChords(measures, "D major", "jazz", "4/4");
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

// ─── analyzeChords: key detection integration [50] (finding 1) ────────────

describe("analyzeChords — key detection integration", () => {
  it("surfaces detectedKey/detectedKeyConfidence/statedKeyFit on every result, even a silent song", () => {
    const measures = [m(1, "R:w", "R:w")];
    const result = analyzeChords(measures, "C major", "pop", "4/4");
    expect(result.detectedKey).toBe("C major"); // falls back to the (reformatted) stated key — nothing to detect from
    expect(result.detectedKeyConfidence).toBe(0);
    expect(result.statedKeyFit).toBe(0);
    expect(result.keyMismatch).toBeUndefined();
  });

  it("flags a keyMismatch when content decisively contradicts the stated key (the hoochie case shape)", () => {
    // Shape of the pilot-corpus mismatch class finding 1 exists to catch:
    // config says a major key, but the actual notes lean hard on that
    // tonic's RELATIVE MINOR triad (A-C-E, not the A major triad A-C#-E) —
    // exactly the kind of self-reported-key error the dispatch's pilot
    // report found in roughly half the corpus.
    const measures = [
      m(1, "A4:h C5:h", "A3:h E4:h"),
      m(2, "E4:q D4:e G4:e B4:s F5:s", "A3:h A3:h"),
    ];
    const result = analyzeChords(measures, "A major", "blues", "4/4");

    expect(result.detectedKey).toBe("A minor");
    expect(result.keyMismatch).toBe(true);
    expect(result.summary).toMatch(/^Stated key A major, content indicates A minor .* — harmony claims must follow content\./);
  });

  it("does NOT flag a mismatch when detection is too ambiguous to trust, even if it differs from stated", () => {
    // A single clean C-major triad "disagrees" with a D-major stated key
    // only in the sense that C major is a better raw correlate — but nudge
    // it further: use a profile whose key-detection margin sits below
    // KEY_DETECTION_CONFIDENCE_FLOOR so detection isn't even used for bias.
    // The tied C-major/F#-major arpeggio (used elsewhere in this file for
    // the margin-tie test) is also key-detection-ambiguous: neither
    // candidate decisively wins at the KEY level either.
    const measures = [m(1, "C4:e E4:e G4:e F#4:e A#4:e C#5:e", "R:w")];
    const result = analyzeChords(measures, "Eb major", "pop", "4/4");
    expect(result.detectedKeyConfidence).toBeLessThan(0.05);
    expect(result.keyMismatch).toBeUndefined();
  });
});

// ─── Rootless-shell reinterpretation [51] (finding 2) ──────────────────────

describe("analyzeChords — rootless-shell reinterpretation", () => {
  it("relabels a rootless dominant-7th shell to the dom7 when its root is diatonically plausible (G7, not Bdim@high-confidence)", () => {
    // The classic "3-5-7" rootless jazz shell (Levine's Jazz Piano Book,
    // finding 63): only the 3rd, 5th and b7th of G7 sound — B, D, F — which
    // is tone-for-tone a B diminished triad. In a C-major context, G7 is
    // the diatonic V7 (and Bdim is ALSO diatonic as vii°, so this isn't a
    // diatonic-implausibility escape hatch — the reinterpretation has to
    // actually be doing the rootless-shell reasoning).
    const measures = [m(1, "B4+D5+F5:w", "R:w")];
    const result = analyzeChords(measures, "C major", "jazz", "4/4");

    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]).toMatchObject({ label: "G7", root: "G", quality: "dom7", implied: true });
    expect(result.windows[0].confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("keeps the dim label, hedged, when the shell's dom7 reinterpretation isn't diatonically plausible", () => {
    // Same exact B-D-F shell, but in a G-major context: neither Bdim
    // (would need to be vii°, which is F#dim in G major) nor the
    // reinterpreted G7 (would need to be the diatonic V7, which is D7 in G
    // major) is diatonic here. The shell shape is still structurally
    // clean, but there's no plausible dominant function to relabel it as —
    // keep the dim reading, but hedge (implied:true, capped confidence).
    const measures = [m(1, "B4+D5+F5:w", "R:w")];
    const result = analyzeChords(measures, "G major", "jazz", "4/4");

    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]).toMatchObject({ label: "Bdim", root: "B", quality: "dim", implied: true });
    expect(result.windows[0].confidence).toBeLessThanOrEqual(0.6); // AMBIGUOUS_SHELL_CONFIDENCE_CAP
  });

  it("does NOT reinterpret a genuine 4-tone diminished-seventh chord as a rootless shell", () => {
    // All four Bdim7 tones (B, D, F, G#) actually sound, with G# carrying
    // real, comparable duration weight — not a passing/grace touch. The
    // window's mass is NOT (almost) entirely explained by just the B-D-F
    // shell subset, so the clean-shell check correctly declines to
    // reinterpret: this stays a diminished-triad reading of the strongest-
    // supported root, exactly as an ordinary (non-shell) window would.
    const measures = [m(1, "B4+D5+F5:h G#5:q", "R:w")];
    const result = analyzeChords(measures, "C major", "pop", "4/4");

    expect(result.windows).toHaveLength(1);
    expect(result.windows[0]).toMatchObject({ label: "Bdim", root: "B", quality: "dim" });
  });
});

// ─── Complete sevenths + key-bias saturation [50, 51] (finding 3) ──────────

describe("analyzeChords — complete sevenths are emittable", () => {
  it("emits a balanced G-B-D-F block chord as G7 (never silence, never plain G) in both ungated and hard-gated genres", () => {
    // All four dom7 tones sound together, block texture, equal weight — an
    // unambiguous G7. Before the margin fix, this was silently DROPPED in
    // every genre: the confidence margin was computed against G7's own
    // nested subset (the plain G triad), capping it at ~0.13 — below even
    // NORMAL_CONFIDENCE_FLOOR (0.15), so nothing was ever emitted for it.
    const measures = [m(1, "G4+B4+D5+F5:w", "R:w")];

    const pop = analyzeChords(measures, "C major", "pop", "4/4");
    expect(pop.windows).toHaveLength(1);
    expect(pop.windows[0]).toMatchObject({ label: "G7", root: "G", quality: "dom7" });
    expect(pop.windows[0].implied).toBeUndefined();

    const jazz = analyzeChords(measures, "C major", "jazz", "4/4");
    expect(jazz.windows).toHaveLength(1);
    expect(jazz.windows[0]).toMatchObject({ label: "G7", root: "G", quality: "dom7", implied: true });
    expect(jazz.windows[0].confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("still drops a genuinely ambiguous window even after excluding nested templates from the margin", () => {
    // The margin fix widens margins for winners with a nested sibling — it
    // does not manufacture confidence out of nothing. Two UNRELATED,
    // non-nested triads (C major and F# major) tied exactly on raw score
    // stay tied; nesting-exclusion has nothing to exclude here.
    const measures = [m(1, "C4:e E4:e G4:e F#4:e A#4:e C#5:e", "R:w")];
    const result = analyzeChords(measures, "Eb major", "pop", "4/4");
    expect(result.windows).toEqual([]);
  });

  it("key bias cannot invert winner/runner-up ordering via saturation (raw scores are compared unclamped)", () => {
    // Regression guard for the Math.min(1, ...) saturation bug: a diatonic
    // near-ceiling winner used to have its bias "wasted" by the clamp while
    // a diatonic nested runner-up kept its full 8% boost, artificially
    // shrinking the margin. Confirmed indirectly by the now-correct 0.792
    // (not the old, saturation-shrunk 0.626) on the plain clean-triad case
    // above; this test locks the unclamped-score contract in directly.
    const profile = new Array(12).fill(0);
    profile[0] = profile[4] = profile[7] = 1; // clean C major triad, 0 unheard tones -> raw score exactly 1.0
    const biased = matchTemplates(profile, buildKeyBias("C major"));
    const cMaj = biased.find((c) => c.root === 0 && c.quality === "maj")!;
    expect(cMaj.score).toBeCloseTo(1.08, 10); // NOT clamped to 1
  });
});

// ─── PITCH_CLASS_NAMES ──────────────────────────────────────────────────────

describe("PITCH_CLASS_NAMES", () => {
  it("is sharps-only, matching the rest of the brief's note-naming convention", () => {
    expect(PITCH_CLASS_NAMES).toEqual(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]);
  });
});
