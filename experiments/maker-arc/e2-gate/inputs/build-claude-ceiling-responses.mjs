// Serialize Claude's 22 authored continuations into the gate's responses format.
// The MUSIC here was composed by Claude (Fable 5) in-session from the
// prompt-only briefs (e2-briefs.json) — texture profiles + knowledge of the
// pieces. The gold continuation records were never opened. This script only
// formats [bar, beat, midi] note lists as REMI token JSON.
//
// Beat → Position: P = round(beat * 96 / beatsPerBar)  (the gate decodes at a
// fixed 96-position bar; beat units are the meter's numerator beats).
import { writeFileSync } from "node:fs";

const V = 60; // uniform velocity (not scored)

// ── helpers ──────────────────────────────────────────────────────────────────
function toRemi(notes, beatsPerBar, durationUnits = 2) {
  // notes: [[bar(1..4), beat, midi], ...]
  const byBar = new Map();
  for (const [bar, beat, midi] of notes) {
    if (!byBar.has(bar)) byBar.set(bar, []);
    byBar.get(bar).push([beat, midi]);
  }
  const tokens = [];
  for (const bar of [...byBar.keys()].sort((a, b) => a - b)) {
    tokens.push(`Bar_${bar}`, `Velocity_${V}`, `Duration_${durationUnits}`);
    const events = byBar.get(bar).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let lastP = null;
    for (const [beat, midi] of events) {
      const P = Math.round((beat * 96) / beatsPerBar);
      if (P !== lastP) {
        tokens.push(`Position_${P}`);
        lastP = P;
      }
      tokens.push(`Pitch_${midi}`);
    }
  }
  return tokens;
}

function chord(bar, beat, midis) {
  return midis.map((m) => [bar, beat, m]);
}

// Bach texture: 16 sixteenths/bar — an 8-note low→high arpeggio played twice.
function bachBar(bar, arp8) {
  const notes = [];
  for (let half = 0; half < 2; half++) {
    for (let i = 0; i < 8; i++) notes.push([bar, half * 2 + i * 0.25, arp8[i]]);
  }
  return notes;
}

// ── the 22 compositions ──────────────────────────────────────────────────────
const compositions = [];

// 1) bach m1-4 → m5-8. Continue the uniform sixteenth figuration.
//    m5 Am/C · m6 D7/C · m7 G/B · m8 Cmaj7/B (the vi–V/V–V6–I6 drift).
compositions.push({
  promptId: "bach-prelude-c-major-bwv846:m001-004:piano:mcp-session:v1",
  beatsPerBar: 4,
  durationUnits: 1,
  notes: [
    ...bachBar(1, [48, 52, 57, 60, 64, 57, 60, 64]), // C3 E3 A3 C4 E4 A3 C4 E4
    ...bachBar(2, [48, 50, 54, 57, 62, 54, 57, 62]), // C3 D3 F#3 A3 D4 …
    ...bachBar(3, [47, 50, 55, 59, 62, 55, 59, 62]), // B2 D3 G3 B3 D4 …
    ...bachBar(4, [47, 48, 52, 55, 60, 52, 55, 60]), // B2 C3 E3 G3 C4 …
  ],
});

// 2) bach m9-12 → m13-16. Same figuration; C/G → G7 → Am/G → D7/F# drift.
compositions.push({
  promptId: "bach-prelude-c-major-bwv846:m009-012:piano:mcp-session:v1",
  beatsPerBar: 4,
  durationUnits: 1,
  notes: [
    ...bachBar(1, [43, 48, 52, 55, 60, 52, 55, 60]), // G2 C3 E3 G3 C4 …
    ...bachBar(2, [43, 47, 50, 53, 59, 50, 53, 59]), // G2 B2 D3 F3 B3 …
    ...bachBar(3, [43, 48, 52, 57, 60, 52, 57, 60]), // G2 C3 E3 A3 C4 …
    ...bachBar(4, [42, 48, 50, 54, 60, 50, 54, 60]), // F#2 C3 D3 F#3 C4 …
  ],
});

// 3) chopin-nocturne m1-4 → m5-8 (Eb). Answering phrase: turn on G5, reach to
//    C6, settle. LH bass + spread chords on beats 1/2.5.
compositions.push({
  promptId: "chopin-nocturne-op9-no2:m001-004:piano:mcp-session:v1",
  beatsPerBar: 4,
  notes: [
    // m5: melody G5 with upper turn; LH Eb2 + Eb triad shells
    [1, 0, 39], [1, 0, 79], ...chord(1, 1, [58, 63, 67]), [1, 1.5, 80], [1, 2, 79],
    ...chord(1, 2.5, [58, 63, 67]), [1, 3, 77],
    // m6: F5→Eb5 over Bb7
    [2, 0, 34], [2, 0.5, 77], ...chord(2, 1, [56, 60, 65]), [2, 2, 75],
    ...chord(2, 2.5, [56, 60, 65]), [2, 3.5, 74],
    // m7: the reach: Eb5→C6→Bb5 over Eb
    [3, 0, 39], [3, 0.5, 75], ...chord(3, 1, [58, 63, 67]), [3, 2, 84],
    ...chord(3, 2.5, [58, 63, 67]), [3, 3, 82],
    // m8: G5 F5 D5 Eb5 cadence over Bb7→Eb
    [4, 0, 46], [4, 0.5, 79], ...chord(4, 1, [56, 60, 65]), [4, 1.5, 77],
    [4, 2, 74], ...chord(4, 2.5, [56, 60, 65]), [4, 3, 75],
  ],
});

// 4) chopin-nocturne m9-12 → m13-16. Ornamented return, same rubato texture.
compositions.push({
  promptId: "chopin-nocturne-op9-no2:m009-012:piano:mcp-session:v1",
  beatsPerBar: 4,
  notes: [
    [1, 0, 46], [1, 0.5, 70], ...chord(1, 1, [58, 62, 65]), [1, 2, 72],
    ...chord(1, 2.5, [58, 62, 65]), [1, 3.25, 74], [1, 3.5, 75],
    [2, 0, 39], [2, 0.5, 75], ...chord(2, 1, [58, 63, 67]), [2, 1.5, 74],
    [2, 2, 72], ...chord(2, 2.5, [58, 63, 67]), [2, 3.5, 70],
    [3, 0, 44], [3, 0.5, 68], ...chord(3, 1, [56, 60, 63]), [3, 2, 67],
    [3, 2.4, 68], [3, 2.5, 70], ...chord(3, 3, [56, 60, 63]), [3, 3.5, 72],
    [4, 0, 46], [4, 0.5, 74], ...chord(4, 1, [56, 60, 65]), [4, 2, 75],
    ...chord(4, 2.5, [56, 60, 65]), [4, 3, 79],
  ],
});

// 5) chopin-nocturne m17-20 → m21-24. Dense ornamental reprise (~13/bar).
compositions.push({
  promptId: "chopin-nocturne-op9-no2:m017-020:piano:mcp-session:v1",
  beatsPerBar: 4,
  notes: [
    [1, 0, 39], [1, 0, 79], [1, 0.25, 80], [1, 0.5, 79], ...chord(1, 1, [58, 63, 67]),
    [1, 1.5, 77], [1, 2, 75], ...chord(1, 2.5, [58, 63, 67]), [1, 3, 74],
    [1, 3.25, 75], [1, 3.5, 77],
    [2, 0, 34], [2, 0.5, 77], ...chord(2, 1, [56, 60, 65]), [2, 1.25, 75],
    [2, 1.5, 74], [2, 2, 72], ...chord(2, 2.5, [56, 60, 65]), [2, 2.75, 74],
    [2, 3, 75], [2, 3.5, 77],
    [3, 0, 39], [3, 0.25, 82], [3, 0.5, 84], ...chord(3, 1, [58, 63, 67]),
    [3, 1.5, 82], [3, 2, 80], [3, 2.25, 79], ...chord(3, 2.5, [58, 63, 67]),
    [3, 3, 77], [3, 3.5, 75],
    [4, 0, 46], [4, 0.5, 74], ...chord(4, 1, [56, 60, 65]), [4, 1.25, 75],
    [4, 2, 79], ...chord(4, 2.5, [56, 60, 65]), [4, 3, 75],
  ],
});

// 6) chopin-prelude-e-minor m1-4 → m5-8. Pulsing LH chords (4 hits/bar),
//    melody hangs B4→C5→B4. Chromatic inner-voice descent.
compositions.push({
  promptId: "chopin-prelude-e-minor:m001-004:piano:mcp-session:v1",
  beatsPerBar: 4,
  notes: [
    [1, 0, 71], ...chord(1, 0.75, [54, 57, 62]), ...chord(1, 1.75, [54, 57, 62]),
    ...chord(1, 2.75, [54, 57, 62]), ...chord(1, 3.5, [54, 57, 62]),
    [2, 0, 72], ...chord(2, 0.75, [54, 57, 60]), ...chord(2, 1.75, [54, 57, 60]),
    ...chord(2, 2.75, [53, 57, 60]), ...chord(2, 3.5, [53, 57, 60]),
    [3, 0, 71], ...chord(3, 0.75, [52, 57, 60]), ...chord(3, 1.75, [52, 57, 60]),
    ...chord(3, 2.75, [52, 55, 60]), ...chord(3, 3.5, [52, 55, 60]),
    [4, 0, 71], ...chord(4, 0.75, [52, 55, 59]), ...chord(4, 1.75, [52, 55, 59]),
    ...chord(4, 2.75, [51, 55, 59]), ...chord(4, 3.5, [51, 55, 59]),
  ],
});

// 7) chopin-prelude m9-12 → m13-16. Same pulse, melody sequence rising then
//    falling (the B4–C5–D5 lament contour).
compositions.push({
  promptId: "chopin-prelude-e-minor:m009-012:piano:mcp-session:v1",
  beatsPerBar: 4,
  notes: [
    [1, 0, 69], ...chord(1, 0.75, [52, 57, 60]), ...chord(1, 1.75, [52, 57, 60]),
    ...chord(1, 2.75, [52, 57, 60]), [1, 3.5, 71],
    [2, 0, 72], ...chord(2, 0.75, [52, 56, 62]), ...chord(2, 1.75, [52, 56, 62]),
    ...chord(2, 2.75, [52, 56, 62]), [2, 3.5, 71],
    [3, 0, 69], ...chord(3, 0.75, [50, 56, 59]), ...chord(3, 1.75, [50, 56, 59]),
    ...chord(3, 2.75, [50, 55, 59]), [3, 3.5, 67],
    [4, 0, 66], ...chord(4, 0.75, [47, 54, 59]), ...chord(4, 1.75, [47, 54, 59]),
    ...chord(4, 2.75, [47, 54, 57]), [4, 3.5, 64],
  ],
});

// 8) clair-de-lune m1-4 → m5-8 (9/8). The descending-third dyads continue and
//    settle; eighth-beats 0/1/2/3 with occasional 4.5.
compositions.push({
  promptId: "clair-de-lune:m001-004:piano:mcp-session:v1",
  beatsPerBar: 9,
  notes: [
    ...chord(1, 0, [61, 65]), ...chord(1, 1, [60, 63]), ...chord(1, 2, [58, 61]),
    ...chord(1, 3, [60, 63]),
    ...chord(2, 0, [61, 65]), ...chord(2, 1, [63, 66]), ...chord(2, 2, [65, 68]),
    ...chord(2, 3, [63, 66]), ...chord(2, 4.5, [61, 65]),
    ...chord(3, 0, [60, 63]), ...chord(3, 1, [61, 65]), ...chord(3, 2, [63, 66]),
    ...chord(3, 3, [65, 68]), ...chord(3, 6, [66, 70]),
    ...chord(4, 0, [65, 68]), ...chord(4, 1, [63, 66]), ...chord(4, 2, [61, 65]),
    ...chord(4, 3, [60, 63]),
  ],
});

// 9) clair-de-lune m15-18 → m19-22 (9/8). The big rolled-arpeggio texture:
//    six-note spreads at ~1.5-eighth intervals over moving Db-region harmony.
function spread(bar, beat, low) {
  // a 6-note rising spread: root, 5th, octave, 10th, 12th, 15th
  return [
    [bar, beat, low], [bar, beat, low + 7], [bar, beat, low + 12],
    [bar, beat, low + 16], [bar, beat, low + 19], [bar, beat, low + 24],
  ];
}
compositions.push({
  promptId: "clair-de-lune:m015-018:piano:mcp-session:v1",
  beatsPerBar: 9,
  notes: [
    ...spread(1, 0, 30), ...spread(1, 1.5, 32), ...spread(1, 4, 34),
    ...spread(1, 5, 37), ...spread(1, 6, 39), ...spread(1, 7, 41), ...spread(1, 8, 42),
    ...spread(2, 0, 42), ...spread(2, 1, 39), ...spread(2, 2, 37),
    ...spread(2, 3, 35), ...spread(2, 4.5, 34), ...spread(2, 6, 32),
    ...spread(3, 0, 30), ...spread(3, 1.5, 32), ...spread(3, 4, 35),
    ...spread(3, 5, 37), ...spread(3, 6, 39), ...spread(3, 7, 42), ...spread(3, 8, 44),
    ...spread(4, 0, 46), ...spread(4, 1, 44), ...spread(4, 2, 42),
    ...spread(4, 3, 39), ...spread(4, 4.5, 37), ...spread(4, 6, 34),
  ],
});

// 10) debussy-arabesque m1-4 → m5-8. The unbroken triplet-eighth carpet
//     (12/bar at thirds-of-a-beat) in the E-major arpeggio region.
function tripletBar(bar, cycle) {
  const notes = [];
  for (let i = 0; i < 12; i++) notes.push([bar, i / 3, cycle[i % cycle.length]]);
  return notes;
}
compositions.push({
  promptId: "debussy-arabesque-no1:m001-004:piano:mcp-session:v1",
  beatsPerBar: 4,
  notes: [
    ...tripletBar(1, [52, 56, 59, 64, 68, 71, 68, 64, 59, 56, 52, 56]),
    ...tripletBar(2, [49, 54, 58, 61, 66, 69, 66, 61, 58, 54, 49, 54]),
    ...tripletBar(3, [47, 52, 56, 59, 64, 68, 64, 59, 56, 52, 47, 52]),
    ...tripletBar(4, [48, 52, 57, 61, 64, 69, 64, 61, 57, 52, 48, 52]),
  ],
});

// 11) debussy-arabesque m9-12 → m13-16. Bass octaves + eighth arps + melody.
compositions.push({
  promptId: "debussy-arabesque-no1:m009-012:piano:mcp-session:v1",
  beatsPerBar: 4,
  notes: [
    ...chord(1, 0, [40, 52]), [1, 0.33, 56], [1, 0.5, 59], [1, 0.67, 64],
    ...chord(1, 1, [56, 68]), [1, 1.5, 64], [1, 2, 59], [1, 2.5, 64],
    ...chord(1, 3, [56, 68]), [1, 3.5, 64],
    ...chord(2, 0, [45, 57]), [2, 0.33, 61], [2, 0.5, 64], [2, 0.67, 69],
    ...chord(2, 1, [61, 73]), [2, 1.5, 69], [2, 2, 64], [2, 2.5, 69],
    ...chord(2, 3, [61, 73]), [2, 3.5, 69],
    ...chord(3, 0, [47, 59]), [3, 0.5, 63], [3, 1, 66], [3, 1.5, 71],
    [3, 2, 66], [3, 2.5, 63], ...chord(3, 3, [59, 71]), [3, 3.5, 66],
    ...chord(4, 0, [40, 52]), [4, 0.33, 56], [4, 0.5, 59], [4, 0.67, 64],
    ...chord(4, 1, [56, 68]), [4, 1.5, 64], [4, 2, 59], [4, 2.5, 64],
    ...chord(4, 3, [56, 68]), [4, 3.5, 64],
  ],
});

// 12) fur-elise m9-12 → m13-16 (3/8). Back into the theme loop: answer bar,
//     trill bar, A-arpeggio bar, E-arpeggio bar. Sixteenth grid (beat 0.5).
compositions.push({
  promptId: "fur-elise:m009-012:piano:mcp-session:v1",
  beatsPerBar: 3,
  notes: [
    [1, 0, 45], [1, 0, 72], [1, 0.5, 64], [1, 1, 76], [1, 1.5, 75], [1, 2, 76], [1, 2.5, 75],
    [2, 0, 76], [2, 0.5, 71], [2, 1, 74], [2, 1.5, 72], [2, 2, 69], [2, 2.5, 60],
    [3, 0, 33], [3, 0, 64], [3, 0.5, 69], [3, 1, 71], [3, 1.5, 64], [3, 2, 68], [3, 2.5, 71],
    [4, 0, 40], [4, 0, 72], [4, 0.5, 71], [4, 1, 69], [4, 1.5, 64], [4, 2, 69], [4, 2.5, 71],
  ],
});

// 13) mozart-k545 m1-4 → m5-8. The sixteenth scale runs over sparse LH beats.
function scaleRun(bar, pitches16, lh) {
  const notes = pitches16.map((p, i) => [bar, i * 0.25, p]);
  for (const [beat, midi] of lh) notes.push([bar, beat, midi]);
  return notes;
}
compositions.push({
  promptId: "mozart-k545-mvt1:m001-004:piano:mcp-session:v1",
  beatsPerBar: 4,
  notes: [
    ...scaleRun(1, [72, 74, 76, 77, 79, 81, 83, 84, 83, 81, 79, 77, 76, 74, 72, 71],
      [[0, 55], [2, 55]]),
    ...scaleRun(2, [74, 76, 77, 79, 81, 83, 84, 86, 84, 83, 81, 79, 77, 76, 74, 72],
      [[0, 55], [2, 55]]),
    ...scaleRun(3, [76, 77, 79, 81, 83, 84, 86, 88, 86, 84, 83, 81, 79, 77, 76, 74],
      [[0, 52], [2, 52]]),
    // m8: cadential figure — trill on D5 then G-chord close
    [4, 0, 74], [4, 0.25, 76], [4, 0.5, 74], [4, 0.75, 76], [4, 1, 74],
    [4, 1.5, 72], [4, 2, 71], ...chord(4, 2.5, [55, 62]), [4, 3, 72], [4, 3.5, 74],
  ],
});

// 14) mozart-k545 m9-12 → m13-16. G-major second theme: Alberti LH eighths +
//     singing melody.
function alberti(bar, low, fifth, third) {
  return [
    [bar, 0, low], [bar, 0.5, third], [bar, 1, fifth], [bar, 1.5, third],
    [bar, 2, low], [bar, 2.5, third], [bar, 3, fifth], [bar, 3.5, third],
  ];
}
compositions.push({
  promptId: "mozart-k545-mvt1:m009-012:piano:mcp-session:v1",
  beatsPerBar: 4,
  notes: [
    ...alberti(1, 55, 62, 59), [1, 0, 74], [1, 1, 79], [1, 2, 78], [1, 3, 79],
    ...alberti(2, 55, 62, 59), [2, 0, 81], [2, 1, 79], [2, 2, 78], [2, 2.5, 76], [2, 3, 74],
    ...alberti(3, 54, 60, 57), [3, 0, 76], [3, 1, 74], [3, 2, 72], [3, 2.5, 71], [3, 3, 69],
    ...alberti(4, 55, 62, 59), [4, 0, 71], [4, 1, 74], [4, 2, 67], [4, 3, 62],
  ],
});

// 15) pathetique-mvt2 m1-4 → m5-8. The cantabile's second limb: melody on the
//     beats, bass + inner voice, one offbeat sigh per bar.
compositions.push({
  promptId: "pathetique-mvt2:m001-004:piano:mcp-session:v1",
  beatsPerBar: 4,
  notes: [
    [1, 0, 44], [1, 0, 60], [1, 1, 61], [1, 1.1, 56], [1, 2, 63], [1, 3, 60],
    [2, 0, 49], [2, 0, 61], [2, 1, 60], [2, 2, 58], [2, 2.5, 56], [2, 3, 56],
    [3, 0, 51], [3, 0, 63], [3, 0.1, 55], [3, 1, 65], [3, 2, 63], [3, 3, 61],
    [4, 0, 44], [4, 0, 60], [4, 1, 58], [4, 2, 56], [4, 2.7, 51], [4, 3, 56],
  ],
});

// 16) pathetique-mvt2 m9-12 → m13-16. Theme return, same fabric.
compositions.push({
  promptId: "pathetique-mvt2:m009-012:piano:mcp-session:v1",
  beatsPerBar: 4,
  notes: [
    [1, 0, 44], [1, 0.8, 56], [1, 1, 60], [1, 1.7, 61], [1, 2.6, 63], [1, 3.6, 60],
    [2, 0.6, 49], [2, 1.5, 61], [2, 2.6, 60], [2, 2.75, 58], [2, 3, 56], [2, 3.7, 58],
    [3, 0.8, 51], [3, 1.7, 63], [3, 2.2, 65], [3, 2.9, 63], [3, 3, 61], [3, 3.8, 60],
    [4, 0.7, 44], [4, 1.7, 56], [4, 2.7, 60], [4, 2.75, 51], [4, 3.7, 56],
  ],
});

// 17) satie m3-6 → m7-10. Bass on 1, chord on 2, melody at beats 1-2.
compositions.push({
  promptId: "satie-gymnopedie-no1:m003-006:piano:mcp-session:v1",
  beatsPerBar: 3,
  notes: [
    [1, 0, 38], ...chord(1, 1, [57, 62, 66]), [1, 1, 73], [1, 2, 71],
    [2, 0, 43], ...chord(2, 1, [59, 62, 66]), [2, 1, 73], [2, 2, 74],
    [3, 0, 38], ...chord(3, 1, [57, 62, 66]), [3, 1, 69],
    [4, 0, 43], ...chord(4, 1, [59, 62, 66]), [4, 1, 66],
  ],
});

// 18) satie m11-14 → m15-18. The phrase's second ending: melody settles home.
compositions.push({
  promptId: "satie-gymnopedie-no1:m011-014:piano:mcp-session:v1",
  beatsPerBar: 3,
  notes: [
    [1, 0, 38], ...chord(1, 1, [57, 62, 66]), [1, 1, 73], [1, 2, 71],
    [2, 0, 43], ...chord(2, 1, [59, 62, 66]), [2, 1, 73], [2, 2, 74],
    [3, 0, 40], ...chord(3, 1, [59, 64, 67]), [3, 1, 71],
    [4, 0, 45], ...chord(4, 1, [57, 61, 64]), [4, 1, 66],
  ],
});

// 19) satie m19-22 → m23-26. Coda drift: bass+chord, melody line descending.
compositions.push({
  promptId: "satie-gymnopedie-no1:m019-022:piano:mcp-session:v1",
  beatsPerBar: 3,
  notes: [
    [1, 0, 38], ...chord(1, 1, [57, 62, 66]), [1, 1, 66],
    [2, 0, 43], ...chord(2, 1, [59, 62, 66]), [2, 1, 64],
    [3, 0, 40], ...chord(3, 1, [59, 64, 67]), [3, 1, 62],
    [4, 0, 33], ...chord(4, 0, [45]), ...chord(4, 1, [57, 61, 64]), [4, 1, 61], [4, 2, 62],
  ],
});

// 20) schumann-traumerei m1-4 → m5-8. The answer phrase falling from the F5
//     peak; sparse rubato clusters, chord anchors, pickup at the end.
compositions.push({
  promptId: "schumann-traumerei:m001-004:piano:mcp-session:v1",
  beatsPerBar: 4,
  notes: [
    ...chord(1, 0, [46, 58, 62]), [1, 1, 74], [1, 2.2, 72], [1, 3, 70],
    ...chord(2, 0, [48, 57, 64]), [2, 1, 69], [2, 2, 67], [2, 3.1, 65],
    ...chord(3, 0, [41, 57, 60]), [3, 0.7, 65], [3, 1.1, 67], [3, 2.1, 69], [3, 2.15, 53],
    ...chord(4, 0, [41, 53, 60, 65]), [4, 3.1, 60],
  ],
});

// 21) schumann m9-12 → m13-16. The A' return through the pickup G5.
compositions.push({
  promptId: "schumann-traumerei:m009-012:piano:mcp-session:v1",
  beatsPerBar: 4,
  notes: [
    ...chord(1, 0, [41, 53, 57]), [1, 0.05, 65], [1, 2, 69], [1, 2.05, 60], [1, 3, 72],
    [2, 1, 74], [2, 2.2, 72], [2, 3.1, 70], [2, 3.9, 65],
    ...chord(3, 0, [46, 58, 62]), [3, 0.75, 70], [3, 1.5, 74], [3, 2.3, 77], [3, 3.8, 75],
    ...chord(4, 0, [48, 60, 64]), [4, 1, 72], [4, 2.1, 69], [4, 3.1, 67],
  ],
});

// 22) schumann m17-20 → m21-24. Final phrase: descent and the long F-major
//     close, thinning to the held chord.
compositions.push({
  promptId: "schumann-traumerei:m017-020:piano:mcp-session:v1",
  beatsPerBar: 4,
  notes: [
    ...chord(1, 0, [46, 58, 62]), [1, 0.8, 70], [1, 1.9, 74], [1, 2.4, 72], [1, 2.45, 58],
    ...chord(2, 0, [44, 56, 63]), [2, 1, 68], [2, 1.9, 67], [2, 2.7, 65], [2, 3.4, 63],
    ...chord(3, 0, [41, 53, 60]), [3, 0.2, 65], [3, 1.6, 64], [3, 1.7, 57], [3, 2.9, 62],
    ...chord(4, 0, [34, 46]), ...chord(4, 0.85, [53, 60, 65]), [4, 1.9, 69], [4, 3, 65],
  ],
});

// ── serialize ────────────────────────────────────────────────────────────────
const responses = compositions.map((c) => {
  const tokens = toRemi(c.notes, c.beatsPerBar, c.durationUnits ?? 2);
  const raw = JSON.stringify({
    tokens_remi: tokens,
    tokens_abc: "X:1\nT:continuation\nM:4/4\nL:1/8\nK:C\n|composed inline|",
  });
  return { promptId: c.promptId, raw };
});

if (responses.length !== 22) throw new Error(`expected 22 responses, built ${responses.length}`);
const out = process.argv[2];
writeFileSync(out, JSON.stringify({ label: "claude-fable-5", responses }, null, 2) + "\n");
console.log(`${responses.length} authored continuations → ${out}`);
for (const c of compositions) {
  console.log(`  ${c.promptId}: ${c.notes.length} notes`);
}
