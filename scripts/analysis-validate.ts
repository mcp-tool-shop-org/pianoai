#!/usr/bin/env tsx
// ─── analysis-validate.ts — Phase 1 analyzer validation harness ───────────────
//
// Measures the src/analysis harmonic analyzer against the crude pooled-bag
// inferChord baseline, HONESTLY:
//
//   1. MIREX-style accuracy on the hand-annotated reference set
//      (experiments/analysis-arc/reference-changes.json): root / maj-min /
//      full-quality, duration-weighted, for four estimators —
//        • analyzer spans        (beat-resolution, the real progression)
//        • analyzer per-measure  (measure-resolution, the pooled-salience label)
//        • baseline left-hand    (EXACTLY today's jam-brief behavior)
//        • baseline pooled both  (salience control — same notes, equal weight)
//   2. Library-wide ground-truth-free proxies: key-consistency (analyzer vs
//      baseline), harmonic-rhythm rate, and the labeled-measure rate (where the
//      left-hand-only baseline goes blind — e.g. an empty left hand).
//
// Writes experiments/analysis-arc/validation-results.json and prints a summary.
// $0, deterministic, no network:  pnpm exec tsx scripts/analysis-validate.ts
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { initializeFromLibrary } from "../src/songs/library.js";
import { getAllSongs, getSong } from "../src/songs/registry.js";
import type { SongEntry } from "../src/songs/types.js";
import { parseMeter } from "../src/analysis/meter.js";
import { analyzeHarmony } from "../src/analysis/analyze.js";
import { baselineLeftHand, baselinePooledBothHands } from "../src/analysis/baseline.js";
import {
  keyConsistency,
  harmonicRhythm,
  spansToWeightedRoots,
  labelsToWeightedRoots,
} from "../src/analysis/proxies.js";
import { toLabelSpan, scoreTimeline, aggregateScores, type LabelSpan, type MirexScore } from "../src/analysis/mireval.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const LIBRARY_DIR = join(REPO_ROOT, "songs", "library");
const FIXTURE = join(REPO_ROOT, "experiments", "analysis-arc", "reference-changes.json");
const OUT = join(REPO_ROOT, "experiments", "analysis-arc", "validation-results.json");

interface RefChange {
  startBeat: number;
  endBeat: number;
  chord: string;
}
interface RefSection {
  songId: string;
  label: string;
  measureRange: [number, number];
  provenance: string;
  changes: RefChange[];
}
interface Fixture {
  schemaVersion: string;
  sections: RefSection[];
}

/** Section-relative beat where a given measure number starts. */
function sectionRelStart(song: SongEntry, firstMeasure: number, measureNumber: number, bpm: number): number {
  const firstIdx = song.measures.findIndex((m) => m.number === firstMeasure);
  const idx = song.measures.findIndex((m) => m.number === measureNumber);
  return (idx - firstIdx) * bpm;
}

interface EstScores {
  analyzerSpans: MirexScore;
  analyzerPerMeasure: MirexScore;
  baselineLeftHand: MirexScore;
  baselinePooled: MirexScore;
}

function scoreSection(section: RefSection): (EstScores & { label: string; songId: string }) | null {
  const song = getSong(section.songId);
  if (!song) {
    console.error(`  SKIP section ${section.songId}: not in the library`);
    return null;
  }
  const bpm = parseMeter(song.timeSignature).beatsPerMeasure;
  const [firstM, lastM] = section.measureRange;
  const firstIdx = song.measures.findIndex((m) => m.number === firstM);
  const sectionStartBeat = firstIdx * bpm;

  const ref: LabelSpan[] = section.changes.map((c) => toLabelSpan(c.startBeat, c.endBeat, c.chord));

  const analysis = analyzeHarmony(song, { measureRange: section.measureRange });
  const analyzerSpans: LabelSpan[] = analysis.spans.map((s) =>
    toLabelSpan(s.startBeat - sectionStartBeat, s.endBeat - sectionStartBeat, s.symbol),
  );
  const analyzerPerMeasure: LabelSpan[] = analysis.perMeasure.map((p) => {
    const rel = sectionRelStart(song, firstM, p.measure, bpm);
    return toLabelSpan(rel, rel + bpm, p.symbol);
  });

  const inRange = (measure: number): boolean => measure >= firstM && measure <= lastM;
  const baseLH: LabelSpan[] = baselineLeftHand(song)
    .filter((l) => inRange(l.measure))
    .map((l) => {
      const rel = sectionRelStart(song, firstM, l.measure, bpm);
      return toLabelSpan(rel, rel + bpm, l.symbol);
    });
  const basePooled: LabelSpan[] = baselinePooledBothHands(song)
    .filter((l) => inRange(l.measure))
    .map((l) => {
      const rel = sectionRelStart(song, firstM, l.measure, bpm);
      return toLabelSpan(rel, rel + bpm, l.symbol);
    });

  return {
    label: section.label,
    songId: section.songId,
    analyzerSpans: scoreTimeline(ref, analyzerSpans),
    analyzerPerMeasure: scoreTimeline(ref, analyzerPerMeasure),
    baselineLeftHand: scoreTimeline(ref, baseLH),
    baselinePooled: scoreTimeline(ref, basePooled),
  };
}

interface ProxyAcc {
  inKey: number;
  total: number;
  labeledMeasures: number;
  measures: number;
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function main(): void {
  initializeFromLibrary(LIBRARY_DIR);
  const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as Fixture;

  // ── 1. Reference-set MIREX scoring ──
  const perSection = fixture.sections.map(scoreSection).filter((r): r is NonNullable<typeof r> => r !== null);
  const agg: EstScores = {
    analyzerSpans: aggregateScores(perSection.map((s) => s.analyzerSpans)),
    analyzerPerMeasure: aggregateScores(perSection.map((s) => s.analyzerPerMeasure)),
    baselineLeftHand: aggregateScores(perSection.map((s) => s.baselineLeftHand)),
    baselinePooled: aggregateScores(perSection.map((s) => s.baselinePooled)),
  };

  // ── 2. Library-wide proxies ──
  const songs = getAllSongs();
  const analyzerProxy: ProxyAcc = { inKey: 0, total: 0, labeledMeasures: 0, measures: 0 };
  const baselineProxy: ProxyAcc = { inKey: 0, total: 0, labeledMeasures: 0, measures: 0 };
  let chordsPerMeasureSum = 0;
  let meanSpanBeatsSum = 0;
  let proxySongs = 0;

  for (const song of songs) {
    const bpm = parseMeter(song.timeSignature).beatsPerMeasure;
    if (song.measures.length === 0) continue;
    proxySongs++;

    const analysis = analyzeHarmony(song);
    const kcA = keyConsistency(spansToWeightedRoots(analysis.spans), song.key);
    analyzerProxy.inKey += kcA.inKey;
    analyzerProxy.total += kcA.total;
    analyzerProxy.measures += analysis.perMeasure.length;
    analyzerProxy.labeledMeasures += analysis.perMeasure.filter((p) => p.symbol !== "N/C").length;

    const hr = harmonicRhythm(analysis);
    chordsPerMeasureSum += hr.chordsPerMeasure;
    meanSpanBeatsSum += hr.meanSpanBeats;

    const base = baselineLeftHand(song);
    const kcB = keyConsistency(
      labelsToWeightedRoots(base.map((l) => ({ symbol: l.symbol, durBeats: bpm }))),
      song.key,
    );
    baselineProxy.inKey += kcB.inKey;
    baselineProxy.total += kcB.total;
    baselineProxy.measures += base.length;
    baselineProxy.labeledMeasures += base.filter((l) => l.symbol !== "N/A" && l.symbol !== "N/C").length;
  }

  const results = {
    generatedNote:
      "Deterministic output of scripts/analysis-validate.ts. Regenerate with `pnpm exec tsx scripts/analysis-validate.ts`. Accuracies are duration-weighted MIREX (root/maj-min/full-quality). See reference-changes.json for the no-ground-truth caveats — these are a relative A/B, not an absolute grade.",
    referenceSet: {
      sections: perSection.length,
      perSection: perSection.map((s) => ({
        songId: s.songId,
        label: s.label,
        refBeats: s.analyzerSpans.refBeats,
        analyzerSpans: s.analyzerSpans,
        analyzerPerMeasure: s.analyzerPerMeasure,
        baselineLeftHand: s.baselineLeftHand,
        baselinePooled: s.baselinePooled,
      })),
      aggregate: agg,
    },
    libraryProxies: {
      songs: proxySongs,
      analyzer: {
        keyConsistency: analyzerProxy.total > 0 ? analyzerProxy.inKey / analyzerProxy.total : 0,
        labeledMeasureRate: analyzerProxy.measures > 0 ? analyzerProxy.labeledMeasures / analyzerProxy.measures : 0,
        meanChordsPerMeasure: proxySongs > 0 ? chordsPerMeasureSum / proxySongs : 0,
        meanSpanBeats: proxySongs > 0 ? meanSpanBeatsSum / proxySongs : 0,
      },
      baselineLeftHand: {
        keyConsistency: baselineProxy.total > 0 ? baselineProxy.inKey / baselineProxy.total : 0,
        labeledMeasureRate: baselineProxy.measures > 0 ? baselineProxy.labeledMeasures / baselineProxy.measures : 0,
      },
    },
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(results, null, 2) + "\n");

  // ── Summary ──
  const row = (name: string, s: MirexScore): string =>
    `  ${name.padEnd(22)} root ${pct(s.rootAcc).padStart(6)}  maj/min ${pct(s.majMinAcc).padStart(6)}  full ${pct(s.fullAcc).padStart(6)}`;
  console.log(`\n=== Reference set (${perSection.length} sections, ${agg.analyzerSpans.refBeats} ref beats) — MIREX accuracy ===`);
  console.log(row("analyzer (spans)", agg.analyzerSpans));
  console.log(row("analyzer (per-measure)", agg.analyzerPerMeasure));
  console.log(row("baseline (left-hand)", agg.baselineLeftHand));
  console.log(row("baseline (pooled both)", agg.baselinePooled));
  console.log(`\n=== Library-wide proxies (${proxySongs} songs) ===`);
  console.log(
    `  analyzer:  key-consistency ${pct(results.libraryProxies.analyzer.keyConsistency)}  ` +
      `labeled-measure rate ${pct(results.libraryProxies.analyzer.labeledMeasureRate)}  ` +
      `chords/measure ${results.libraryProxies.analyzer.meanChordsPerMeasure.toFixed(2)}`,
  );
  console.log(
    `  baseline:  key-consistency ${pct(results.libraryProxies.baselineLeftHand.keyConsistency)}  ` +
      `labeled-measure rate ${pct(results.libraryProxies.baselineLeftHand.labeledMeasureRate)}`,
  );
  console.log(`\nwrote ${OUT}`);
}

main();
