// ─── Maker-loop demo: generate → VERIFY (with the repo's real tools) → render ──
//
// Proves the "analyst → maker" loop end to end on one phrase:
//   1. GENERATE: a model (here, Claude) reharmonizes the Fur Elise opening into a
//      jazz voicing (bVI substitution — Am becomes Fmaj7 under the melody).
//   2. VERIFY: the repo's OWN inferChord() (src/songs/jam.ts) checks every voicing;
//      a deterministic consonance/voice-leading/key pass checks the rest. If the
//      generated harmony were wrong, the repo's verifier would catch it.
//   3. RENDER: a piano-roll SVG (right hand blue, left hand coral) you can see.
//
// Run:  pnpm exec tsx scripts/maker-loop-demo.ts
// ─────────────────────────────────────────────────────────────────────────────
import { inferChord, getStyleGuidance } from "../src/songs/jam.js";
import { writeFileSync } from "node:fs";

// ─── The source melody: Fur Elise, m1-8 right hand (from the library note list) ──
const PC = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
type Note = { midi: number; hand: "R" | "L"; measure: number; slot: number };

const melodyByMeasure: number[][] = [
  [76, 75],                       // m1: E5 D#5
  [76, 75, 76, 71, 74, 72],       // m2: E5 D#5 E5 B4 D5 C5
  [69, 60, 64, 69],               // m3: A4 C4 E4 A4
  [71, 64, 68, 71],               // m4: B4 E4 G#4 B4
  [72, 64, 76, 75],               // m5: C5 E4 E5 D#5
  [76, 75, 76, 71, 74, 72],       // m6
  [69, 60, 64, 69],               // m7
  [71, 64, 72, 71],               // m8: B4 E4 C5 B4
];

// ─── The GENERATED reharmonization: one jazz chord per measure ──────────────────
// The creative move: substitute Am -> Fmaj7 (the bVI) under the A/C/E melody notes,
// keep E7 as the dominant. A classic, tasteful jazz reharm of a classical theme.
const reharm: { measure: number; intended: string; voicing: string }[] = [
  { measure: 1, intended: "Am7",   voicing: "A2 C3 E3 G3" },
  { measure: 2, intended: "Am7",   voicing: "A2 C3 E3 G3" },
  { measure: 3, intended: "Fmaj7", voicing: "F2 A2 C3 E3" },
  { measure: 4, intended: "E7",    voicing: "E2 G#2 B2 D3" },
  { measure: 5, intended: "Am7",   voicing: "A2 C3 E3 G3" },
  { measure: 6, intended: "Am7",   voicing: "A2 C3 E3 G3" },
  { measure: 7, intended: "Fmaj7", voicing: "F2 A2 C3 E3" },
  { measure: 8, intended: "E7",    voicing: "E2 G#2 B2 D3" },
];

const CHORD_TONES: Record<string, number[]> = {
  Am7:   [9, 0, 4, 7],   // A C E G
  Fmaj7: [5, 9, 0, 4],   // F A C E
  E7:    [4, 8, 11, 2],  // E G# B D
};
// Standard tensions (in semitones from root) that are "good" over these chords.
const TENSION_NAME: Record<number, string> = { 2: "9th", 5: "11th", 9: "13th", 1: "b9", 3: "#9", 6: "#11", 8: "b13" };
const A_HARM_MINOR = new Set([9, 11, 0, 2, 4, 5, 8]); // A B C D E F G#

console.log("═══ MAKER LOOP: reharmonize Für Elise (m1-8) → jazz, then let the repo verify ═══\n");

// ── style guidance the maker used (from the repo's jam engine) ──
console.log("Jazz style guidance the generator drew on (jam.ts getStyleGuidance):");
for (const h of getStyleGuidance("jazz")) console.log("  • " + h);
console.log();

// ─── VERIFY 1: chord fidelity — does the repo's inferChord agree with intent? ───
console.log("VERIFY ① chord fidelity — repo inferChord() vs the maker's intent:");
let chordPass = 0;
for (const r of reharm) {
  const detected = inferChord(r.voicing);
  const ok = detected === r.intended;
  if (ok) chordPass++;
  console.log(`  m${r.measure}: intended ${r.intended.padEnd(6)} voicing [${r.voicing.padEnd(12)}] → detected ${detected.padEnd(6)} ${ok ? "✓" : "✗ MISMATCH"}`);
}
console.log(`  → ${chordPass}/${reharm.length} voicings verified by the repo's own chord engine\n`);

// ─── VERIFY 2: melody–harmony consonance (chord tone / labeled tension / clash) ──
console.log("VERIFY ② melody sits on the new harmony (chord tone / tension / clash):");
let clashes = 0, chordTones = 0, tensions = 0;
for (const r of reharm) {
  const tones = CHORD_TONES[r.intended];
  const root = tones[0];
  const labels = melodyByMeasure[r.measure - 1].map((midi) => {
    const pc = midi % 12;
    if (tones.includes(pc)) { chordTones++; return `${PC[pc]}=tone`; }
    const iv = (pc - root + 12) % 12;
    if (TENSION_NAME[iv]) { tensions++; return `${PC[pc]}=${TENSION_NAME[iv]}`; }
    clashes++; return `${PC[pc]}=chromatic`;
  });
  console.log(`  m${r.measure} over ${r.intended.padEnd(6)}: ${labels.join(", ")}`);
}
console.log(`  → ${chordTones} chord tones, ${tensions} colour tensions, ${clashes} chromatic passing notes (honestly flagged)\n`);

// ─── VERIFY 3: voice leading (bass motion) ──────────────────────────────────────
console.log("VERIFY ③ bass voice-leading:");
const bassPcs = reharm.map((r) => tokenPc(r.voicing.split(" ")[0]));
const moves = bassPcs.slice(1).map((pc, i) => {
  const prev = bassPcs[i];
  const up = (pc - prev + 12) % 12, down = (prev - pc + 12) % 12;
  const semis = Math.min(up, down);
  return `${PC[prev]}→${PC[pc]} (${semis}st)`;
});
console.log("  " + moves.join("  ·  ") + "\n");

// ─── VERIFY 4: key membership ───────────────────────────────────────────────────
const allPcs = new Set<number>();
for (const r of reharm) for (const t of r.voicing.split(" ")) allPcs.add(tokenPc(t));
const outOfKey = [...allPcs].filter((pc) => !A_HARM_MINOR.has(pc)).map((pc) => PC[pc]);
console.log(`VERIFY ④ key: harmony pitch-classes vs A harmonic minor → ${outOfKey.length ? "borrowed: " + outOfKey.join(",") : "all diatonic"}\n`);

// ─── VERDICT ────────────────────────────────────────────────────────────────────
const verified = chordPass === reharm.length && clashes <= 4; // chromatic passing notes are allowed
console.log(`VERDICT: ${verified ? "✅ VERIFIED — the generated reharmonization is harmonically sound by the repo's own tools" : "❌ the verifier rejected the generation"}\n`);

// ─── RENDER: piano-roll SVG (see the reharmonization) ───────────────────────────
const notes: Note[] = [];
melodyByMeasure.forEach((m, mi) => m.forEach((midi, s) => notes.push({ midi, hand: "R", measure: mi + 1, slot: s })));
reharm.forEach((r) => r.voicing.split(" ").forEach((t) => notes.push({ midi: tokenMidi(t), hand: "L", measure: r.measure, slot: 0 })));
writeFileSync("scripts/.maker-demo.svg", renderPianoRoll(notes));
console.log("piano roll → scripts/.maker-demo.svg (right hand blue, left hand coral)");

// ─── helpers ────────────────────────────────────────────────────────────────────
function tokenMidi(tok: string): number {
  const m = tok.match(/^([A-G])(#|b)?(\d)$/)!;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let v = (parseInt(m[3]) + 1) * 12 + base[m[1]];
  if (m[2] === "#") v++; if (m[2] === "b") v--;
  return v;
}
function tokenPc(tok: string): number { return tokenMidi(tok) % 12; }

function renderPianoRoll(ns: Note[]): string {
  const W = 900, H = 320, pad = 28;
  const measures = 8, colW = (W - 2 * pad) / measures;
  const midis = ns.map((n) => n.midi), lo = Math.min(...midis) - 1, hi = Math.max(...midis) + 1;
  const y = (m: number) => pad + (hi - m) * ((H - 2 * pad) / (hi - lo));
  const rects = ns.map((n) => {
    const maxSlot = Math.max(...melodyByMeasure[n.measure - 1].map((_, i) => i), 1);
    const x = n.hand === "R"
      ? pad + (n.measure - 1) * colW + (n.slot / (maxSlot + 1)) * colW
      : pad + (n.measure - 1) * colW;
    const w = n.hand === "R" ? colW / (maxSlot + 1) - 2 : colW - 3;
    const fill = n.hand === "R" ? "#4f7cff" : "#ff7a6b";
    return `<rect x="${x.toFixed(1)}" y="${(y(n.midi) - 4).toFixed(1)}" width="${w.toFixed(1)}" height="8" rx="2" fill="${fill}" opacity="${n.hand === "L" ? 0.55 : 0.95}"/>`;
  });
  const bars = Array.from({ length: measures + 1 }, (_, i) => `<line x1="${pad + i * colW}" y1="${pad}" x2="${pad + i * colW}" y2="${H - pad}" stroke="#33384a" stroke-width="1"/>`);
  const labels = reharm.map((r) => `<text x="${pad + (r.measure - 1) * colW + 4}" y="${H - pad + 16}" fill="#8b93a7" font-size="12" font-family="monospace">${r.intended}</text>`);
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#0e1017"/><text x="${pad}" y="18" fill="#cdd3e0" font-size="13" font-family="monospace">Für Elise m1-8 — AI jazz reharmonization (RH blue · LH coral)</text>${bars.join("")}${rects.join("")}${labels.join("")}</svg>`;
}
