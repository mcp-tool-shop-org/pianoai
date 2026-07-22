// Author the Claude E-R ceiling: blind one-shot reharmonizations, auto-voiced
// (root-position voicings the chord engine confirms — what a careful prompted
// model produces). I choose one chord per measure fitting the melody + key;
// consonance + non-triviality are then the real (uncontrolled) tests.
import { readFileSync, writeFileSync } from "node:fs";

const items = JSON.parse(readFileSync("E:/AI/ai-jam-sessions/experiments/maker-arc/er-gate/items.json", "utf8")).items;

const PC = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const LETTER = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
const SUFFIX = { "":[0,4,7], m:[0,3,7], "7":[0,4,7,10], maj7:[0,4,7,11], m7:[0,3,7,10], dim:[0,3,6], m7b5:[0,3,6,10], aug:[0,4,8], sus4:[0,5,7], sus2:[0,2,7] };

// root-position voicing across octaves 2-3, guaranteed to spell the chord
function voice(chord) {
  const m = /^([A-G])(#|b)?(.*)$/.exec(chord);
  if (!m) throw new Error("bad chord " + chord);
  let root = LETTER[m[1]]; if (m[2] === "#") root = (root+1)%12; if (m[2] === "b") root = (root+11)%12;
  const iv = SUFFIX[m[3]]; if (!iv) throw new Error("bad suffix " + chord);
  let oct = 2, prev = -1;
  return iv.map(i => { const pc = (root+i)%12; if (pc <= prev) oct++; prev = pc; return PC[pc] + oct; }).join(" ");
}

// One chord per measure (m1..m8), authored blind from the melody + key.
const CHOICES = {
  "all-the-things-you-are:m1-8": ["Fm7","Fm7","Bbm7","Eb7","Abmaj7","Dbmaj7","Gm7","C7"],
  "autumn-leaves:m1-8":          ["Gm7","Gm7","Am7b5","D7","Gm7","Cm7","F7","Bbmaj7"],
  "a-thousand-years:m1-8":       ["C#m","B","A","Amaj7","C#m","B","A","Amaj7"],
  "all-of-me:m1-8":              ["Cm7","Fm7","Ebmaj7","Bb7","Cm7","Fm7","Fm7","Bb7"],
  "blues-in-the-night:m1-8":     ["C#m7","C#7","F#m7","B7","D#m7b5","G#7","Amaj7","E7"],
  "born-under-a-bad-sign:m1-8":  ["C#m","F#m7","Bsus2","F#m7","Gdim","Am7b5","Bsus2","Fm"],
  "baba-oriley:m1-8":            ["F","F","Fsus2","C","Fmaj7","Bb","F","C7"],
  "bennie-and-the-jets:m1-8":    ["G","G","Gmaj7","Em7","Am7","D7","Em7","G"],
  "fallin:m1-8":                 ["Em","F#m7b5","F#sus4","Am","Am7","G","Bm","D"],
  "halo:m1-8":                   ["Amaj7","F#m7","A","Bsus2","B7","F#m7b5","A","B"],
  "a-change-is-gonna-come:m1-8": ["Bbmaj7","Gm7","Esus4","Bm7b5","Dmaj7","Bm7","Dmaj7","Bm7"],
  "aint-no-sunshine:m1-8":       ["Am7","Cmaj7","F#m7b5","Dm7","F#m7b5","F#dim","Esus2","D7"],
  "agua-de-beber:m1-8":          ["Am7","Am7","Dm7","Dm7","Am7","Gm7b5","A7","Fmaj7"],
  "besame-mucho:m1-8":           ["Dm7","Bbmaj7","Gm7","A7","Dm7","Bbmaj7","Gm7","A7"],
  "cinema-paradiso:m1-8":        ["Bmaj7","Bmaj7","C#m7","F#7","Bmaj7","G#m7","C#m7","F#7"],
  "comptine-dun-autre-ete:m1-8": ["Em","Cmaj7","Bm7","Am7","Em","Cmaj7","G","D"],
  "bethena:m1-8":                ["Gm7","Gm7","Cm7","Cm7","Am7b5","Cmaj7","D7","G7"],
  "elite-syncopations:m1-8":     ["Dm7","F","Cmaj7","Am7","Dm7","G7","Dmaj7","Bbsus2"],
  "divenire:m1-8":               ["Am7","Cmaj7","Cm","Fmaj7","Cmaj7","Cmaj7","Cmaj7","Cmaj7"],
  "experience:m1-8":             ["Em7","Em7","Em","Dsus4","Em","Bmaj7","Em","Dsus4"],
  "amazing-grace:m1-8":          ["Ebmaj7","Cm7","Ab","Fm7","Ebmaj7","Cm7","Bb7","Ebmaj7"],
  "auld-lang-syne:m1-8":         ["Fmaj7","Am7","F7","Dm7","Gm7","Cm7","C7","Dm7"],
};

const responses = [];
for (const it of items) {
  const chords = CHOICES[it.itemId];
  if (!chords) { console.error("no choices for " + it.itemId); continue; }
  const measures = it.melody.map(m => m.number);
  const rows = measures.map((mn, i) => ({ measure: mn, intendedChord: chords[i % chords.length], voicing: voice(chords[i % chords.length]) }));
  responses.push({ itemId: it.itemId, raw: JSON.stringify(rows) });
}

const out = "C:/Users/mikey/AppData/Local/Temp/claude/E--AI-ai-jam-sessions/c2684146-d2d5-4189-8786-750d1b15e1d7/scratchpad/claude-er-responses.json";
writeFileSync(out, JSON.stringify({ label: "claude-fable-5", responses }, null, 2) + "\n");
console.log("wrote " + responses.length + " responses → " + out);
// sanity: print a couple voicings
console.log("sample:", voice("Am7"), "|", voice("Bbmaj7"), "|", voice("F#m7b5"), "|", voice("Eb7"));
