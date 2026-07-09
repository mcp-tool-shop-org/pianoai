#!/usr/bin/env npx tsx
// ─── Import Classical MIDI from piano-midi.de ────────────────────────────────
//
// Downloads MIDI files from piano-midi.de and converts them to SongEntry JSON
// using the midiToSongEntry pipeline. Each file gets CC BY-SA attribution.
//
// Usage:
//   npx tsx scripts/import-classical.ts           # download + import all
//   npx tsx scripts/import-classical.ts --cached   # import from cache only (skip download)
//
// Pre-requisite: Internet connection (or pre-downloaded files in scripts/midi-cache/)
// Output: JSON files in songs/builtin/
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { midiToSongEntry } from "../src/songs/midi/ingest.js";
import { validateSong } from "../src/songs/registry.js";
import type { SongConfig } from "../src/songs/config/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIDI_DIR = join(__dirname, "midi-cache");
const OUTPUT_DIR = join(__dirname, "..", "songs", "builtin");
const SOURCE = "Bernd Krueger, Source: piano-midi.de (CC BY-SA)";

// ─── Piece Configs ──────────────────────────────────────────────────────────

interface ClassicalImport {
  midiFile: string;
  downloadUrl: string;
  config: SongConfig;
}

const IMPORTS: ClassicalImport[] = [
  {
    midiFile: "fur-elise.mid",
    downloadUrl: "http://piano-midi.de/midis/beethoven/elise.mid",
    config: {
      id: "fur-elise",
      title: "Fur Elise (Bagatelle No. 25 in A minor)",
      genre: "classical",
      composer: "Ludwig van Beethoven",
      difficulty: "intermediate",
      key: "A minor",
      tags: ["beethoven", "bagatelle", "iconic", "romantic"],
      source: SOURCE,
      status: "raw",
      musicalLanguage: {
        description: "One of the most instantly recognizable piano pieces ever written. The gentle, lilting A theme with its signature E-D#-E motif contrasts with more turbulent middle sections.",
        structure: "Rondo: A-B-A-C-A",
        keyMoments: ["Opening A theme: the iconic E-D#-E-D#-E motif", "B section: shift to relative major with running passages", "C section: dramatic left-hand arpeggios in F major"],
        teachingGoals: ["Rondo form recognition", "Gentle touch and dynamics control", "Cross-hand coordination in middle sections"],
        styleTips: ["Light touch on the A theme", "Pedal sparingly in the opening", "Bring out the melody over accompaniment"],
      },
    },
  },
  {
    midiFile: "pathetique-mvt2.mid",
    downloadUrl: "http://piano-midi.de/midis/beethoven/pathet2.mid",
    config: {
      id: "pathetique-mvt2",
      title: "Pathetique Sonata, 2nd Movement (Adagio cantabile)",
      genre: "classical",
      composer: "Ludwig van Beethoven",
      difficulty: "intermediate",
      key: "Ab major",
      tags: ["beethoven", "sonata", "adagio", "lyrical", "romantic"],
      source: SOURCE,
      status: "raw",
      musicalLanguage: {
        description: "One of the most beautiful slow movements in the piano repertoire. A serene, singing melody over a gently rocking accompaniment, with a more dramatic middle episode.",
        structure: "Rondo: A-B-A-C-A",
        keyMoments: ["Opening melody: one of music's great singing themes", "B section: modulation to darker territory", "Return of A theme with ornamental variations"],
        teachingGoals: ["Cantabile (singing) touch", "Voicing melody over accompaniment", "Sustain pedal technique for legato"],
        styleTips: ["Let the melody sing above everything", "Gentle, even accompaniment in the left hand", "Use rubato at phrase endings"],
      },
    },
  },
  {
    midiFile: "chopin-nocturne-op9-no2.mid",
    downloadUrl: "http://piano-midi.de/midis/chopin/chopin_noc_op9_num2.mid",
    config: {
      id: "chopin-nocturne-op9-no2",
      title: "Nocturne in Eb Major, Op. 9 No. 2",
      genre: "classical",
      composer: "Frederic Chopin",
      difficulty: "intermediate",
      key: "Eb major",
      tags: ["chopin", "nocturne", "romantic", "lyrical", "ornamental"],
      source: SOURCE,
      status: "raw",
      musicalLanguage: {
        description: "Perhaps the most famous nocturne ever written. A dreamy, ornamental melody floats over a gentle left-hand waltz pattern. Each return of the theme adds more elaborate decorations.",
        structure: "A-A'-A''-Coda with progressive ornamentation",
        keyMoments: ["Opening theme: simple, singing melody", "Second statement: added grace notes and turns", "Third statement: virtuosic ornamentation", "Coda: dramatic cadenza-like flourishes"],
        teachingGoals: ["Bel canto singing style on piano", "Left-hand waltz accompaniment pattern", "Ornamental playing (turns, trills, grace notes)"],
        styleTips: ["Rubato is essential — push and pull the tempo", "Left hand must be absolutely steady", "Melody should float above the accompaniment"],
      },
    },
  },
  {
    midiFile: "chopin-prelude-e-minor.mid",
    downloadUrl: "http://piano-midi.de/midis/chopin/prelude28-4.mid",
    config: {
      id: "chopin-prelude-e-minor",
      title: "Prelude in E Minor, Op. 28 No. 4",
      genre: "classical",
      composer: "Frederic Chopin",
      difficulty: "beginner",
      key: "E minor",
      tags: ["chopin", "prelude", "minimalist", "melancholic", "funeral"],
      source: SOURCE,
      status: "raw",
      musicalLanguage: {
        description: "A masterpiece of economy — a simple, descending melody over slowly shifting chords creates profound sadness. Reportedly played at Chopin's own funeral.",
        structure: "Through-composed: continuous descending motion with final cadence",
        keyMoments: ["Opening: the melody barely moves while harmony shifts beneath", "Chromatic descent in the accompaniment creates deepening sadness", "Final measures: cadence resolves the tension at last"],
        teachingGoals: ["Expressive playing with minimal notes", "Chromatic voice leading awareness", "Dynamic shaping over a long phrase"],
        styleTips: ["Extremely slow, with deep feeling", "Let the harmonies breathe — no rushing", "The melody is almost whispered"],
      },
    },
  },
  {
    midiFile: "chopin-raindrop.mid",
    downloadUrl: "http://piano-midi.de/midis/chopin/prelude28-15.mid",
    config: {
      id: "chopin-raindrop-prelude",
      title: "Raindrop Prelude, Op. 28 No. 15",
      genre: "classical",
      composer: "Frederic Chopin",
      difficulty: "advanced",
      key: "Db major",
      tags: ["chopin", "prelude", "raindrop", "dramatic", "programmatic"],
      source: SOURCE,
      status: "raw",
      musicalLanguage: {
        description: "Named for the persistent repeated note that evokes raindrops throughout. Gentle outer sections frame a dramatic, stormy middle section in C# minor.",
        structure: "ABA: lyrical outer sections, dramatic middle",
        keyMoments: ["Opening: gentle melody with the persistent Ab 'raindrop'", "Middle section: storm erupts in C# minor with thundering bass", "Return: peace restored, raindrop fades away"],
        teachingGoals: ["Repeated-note control (the 'raindrop' must stay even)", "Dramatic contrast between sections", "Pedal technique for sustaining the repeated note"],
        styleTips: ["The repeated note should never dominate — it's background rain", "Middle section needs full dramatic commitment", "Return to A should feel like relief after a storm"],
      },
    },
  },
  {
    midiFile: "clair-de-lune.mid",
    downloadUrl: "http://piano-midi.de/midis/debussy/DEB_CLAI.mid",
    config: {
      id: "clair-de-lune",
      title: "Clair de Lune (Suite bergamasque, III)",
      genre: "classical",
      composer: "Claude Debussy",
      difficulty: "advanced",
      key: "Db major",
      tags: ["debussy", "impressionist", "moonlight", "atmospheric", "iconic"],
      source: SOURCE,
      status: "raw",
      musicalLanguage: {
        description: "Debussy's most beloved work — a shimmering, impressionistic evocation of moonlight. Rich arpeggiated textures and floating harmonies create an otherworldly atmosphere.",
        structure: "A-B-A': contemplative opening, flowing middle, ethereal return",
        keyMoments: ["Opening: gentle chords establish the moonlit mood", "Middle section: flowing arpeggios cascade across the keyboard", "Climax: the fullest, richest harmonies", "Return: the moonlight fades to silence"],
        teachingGoals: ["Impressionistic pedaling (blending harmonies)", "Arpeggiated voicing across wide ranges", "Dynamic control in layered textures"],
        styleTips: ["Generous pedal, but change with harmonies", "Let notes ring and blend — this is not about clarity", "Think of painting with sound, not playing notes"],
      },
    },
  },
  {
    midiFile: "mozart-k545-mvt1.mid",
    downloadUrl: "http://piano-midi.de/midis/mozart/moz_545_1.mid",
    config: {
      id: "mozart-k545-mvt1",
      title: "Piano Sonata No. 16 in C Major, K. 545, I. Allegro",
      genre: "classical",
      composer: "Wolfgang Amadeus Mozart",
      difficulty: "intermediate",
      key: "C major",
      tags: ["mozart", "sonata", "classical-era", "sonata-form", "pedagogical"],
      source: SOURCE,
      status: "raw",
      musicalLanguage: {
        description: "Mozart labeled this 'a little keyboard sonata for beginners,' but its simplicity is deceptive. Crystal-clear melodies and Alberti bass patterns make it a cornerstone of the Classical repertoire.",
        structure: "Sonata form: Exposition-Development-Recapitulation",
        keyMoments: ["Opening theme: iconic ascending scale passage", "Second theme: lyrical melody in G major", "Development: exploration of earlier material", "Recapitulation: themes return in C major"],
        teachingGoals: ["Sonata form understanding", "Alberti bass pattern (left hand)", "Classical-era touch and articulation"],
        styleTips: ["Clean, even articulation — no pedal abuse", "Alberti bass should be light and even", "Phrasing should be elegant and vocal"],
      },
    },
  },
  {
    midiFile: "schubert-impromptu-op90-no4.mid",
    downloadUrl: "http://piano-midi.de/midis/schubert/SchubD899-4.mid",
    config: {
      id: "schubert-impromptu-op90-no4",
      title: "Impromptu in Ab Major, Op. 90 No. 4",
      genre: "classical",
      composer: "Franz Schubert",
      difficulty: "advanced",
      key: "Ab major",
      tags: ["schubert", "impromptu", "cascading", "virtuosic", "romantic"],
      source: SOURCE,
      status: "raw",
      musicalLanguage: {
        description: "Cascading arpeggiated figures flow like a waterfall, with a singing melody woven into the right-hand patterns. One of the most pianistically gratifying pieces in the Romantic repertoire.",
        structure: "ABA: flowing outer sections, lyrical middle",
        keyMoments: ["Opening: cascading arpeggio figures establish the flow", "Middle section: shift to minor with singing melody", "Return: the cascades resume with renewed energy"],
        teachingGoals: ["Rapid arpeggiated passages with even touch", "Finding and voicing the melody within figuration", "Wrist rotation technique for arpeggios"],
        styleTips: ["The arpeggios must flow like water — never mechanical", "Hidden melody notes need slight emphasis", "Pedal changes must be clean despite the speed"],
      },
    },
  },
  {
    midiFile: "schumann-traumerei.mid",
    downloadUrl: "http://piano-midi.de/midis/schumann/ScnKinderszenen7.mid",
    config: {
      id: "schumann-traumerei",
      title: "Traumerei (Dreaming) from Kinderszenen, Op. 15",
      genre: "classical",
      composer: "Robert Schumann",
      difficulty: "intermediate",
      key: "F major",
      tags: ["schumann", "kinderszenen", "dreaming", "romantic", "lyrical"],
      source: SOURCE,
      status: "raw",
      musicalLanguage: {
        description: "A tender, nostalgic reverie — perhaps the most famous character piece of the Romantic era. The melody rises and falls like gentle breathing, supported by warm inner voices.",
        structure: "ABA': two statements of the theme with a contrasting middle",
        keyMoments: ["Opening: the rising melody reaches upward like a sigh", "Peak: the melody reaches its highest point with gentle intensity", "Return: the dream resumes, fading to a peaceful close"],
        teachingGoals: ["Voicing a melody within chordal texture", "Inner voice awareness", "Rubato and phrase shaping"],
        styleTips: ["The melody must float above the inner voices", "Imagine a child daydreaming — unhurried, gentle", "Subtle rubato at phrase peaks and endings"],
      },
    },
  },
  {
    midiFile: "liszt-liebestraum-no3.mid",
    downloadUrl: "http://piano-midi.de/midis/liszt/lie_trm3.mid",
    config: {
      id: "liszt-liebestraum-no3",
      title: "Liebestraum No. 3 in Ab Major (Dreams of Love)",
      genre: "classical",
      composer: "Franz Liszt",
      difficulty: "advanced",
      key: "Ab major",
      tags: ["liszt", "liebestraum", "love", "virtuosic", "romantic"],
      source: SOURCE,
      status: "raw",
      musicalLanguage: {
        description: "The most famous of Liszt's three Dreams of Love — a passionate, sweeping melody that builds to ecstatic climaxes. Originally a song, transcribed for solo piano with Liszt's characteristic brilliance.",
        structure: "A-B-A': lyrical theme, passionate development, tranquil return",
        keyMoments: ["Opening: gentle arpeggiated accompaniment with singing melody", "Middle: passion builds with wider leaps and fuller texture", "Cadenza section: virtuosic display before the tranquil coda"],
        teachingGoals: ["Wide-stretch arpeggios and hand distribution", "Building intensity over long phrases", "Cadenza technique and dramatic timing"],
        styleTips: ["Melody always sings above the arpeggios", "Build gradually — don't peak too early", "The cadenza should feel spontaneous, not calculated"],
      },
    },
  },
  {
    midiFile: "rachmaninoff-prelude-csharp-minor.mid",
    downloadUrl: "http://piano-midi.de/midis/rachmaninow/rach_pre_op3_no2.mid",
    config: {
      id: "rachmaninoff-prelude-csharp-minor",
      title: "Prelude in C# Minor, Op. 3 No. 2",
      genre: "classical",
      composer: "Sergei Rachmaninoff",
      difficulty: "advanced",
      key: "C# minor",
      tags: ["rachmaninoff", "prelude", "dramatic", "powerful", "bells"],
      source: SOURCE,
      status: "raw",
      musicalLanguage: {
        description: "Three thunderous opening chords announce one of the most dramatic piano pieces ever written. The bell-like opening gives way to an agitated middle section before returning with full force.",
        structure: "ABA: chordal opening, agitated middle, triumphant return",
        keyMoments: ["Opening: the three famous tolling chords", "Middle section: agitated, rising chromatic figures", "Climax: the return of the opening theme at full power", "Coda: the bells fade into the distance"],
        teachingGoals: ["Producing a full, resonant fortissimo", "Large-hand chord voicing", "Dramatic pacing and timing"],
        styleTips: ["The opening chords should ring like cathedral bells", "Middle section needs forward momentum", "The return must be even more powerful than the opening"],
      },
    },
  },
  {
    midiFile: "bach-prelude-c-major-bwv846.mid",
    downloadUrl: "http://piano-midi.de/midis/bach/bach_846.mid",
    config: {
      id: "bach-prelude-c-major-bwv846",
      title: "Prelude in C Major, BWV 846 (Well-Tempered Clavier, Book I)",
      genre: "classical",
      composer: "Johann Sebastian Bach",
      difficulty: "beginner",
      key: "C major",
      tags: ["bach", "prelude", "baroque", "arpeggiated", "wtc", "pedagogical"],
      source: SOURCE,
      status: "raw",
      musicalLanguage: {
        description: "The piece that opens Bach's monumental Well-Tempered Clavier — a flowing sequence of arpeggiated chords that journey through a rich harmonic landscape. Deceptively simple, profoundly beautiful.",
        structure: "Through-composed: continuous arpeggiated progression",
        keyMoments: ["Opening: the iconic C major arpeggio pattern", "Harmonic journey through related keys", "Dominant pedal: tension builds over sustained bass", "Final cadence: resolution back to C major"],
        teachingGoals: ["Even finger technique across arpeggios", "Harmonic awareness within patterns", "Pedal technique for connecting arpeggios"],
        styleTips: ["Perfectly even rhythm — each note equal weight", "Let the harmonic changes speak for themselves", "Minimal rubato — the flow is the beauty"],
      },
    },
  },
  {
    midiFile: "bach-invention-no1.mid",
    downloadUrl: "http://piano-midi.de/midis/bach/bach_inventio1.mid",
    config: {
      id: "bach-invention-no1",
      title: "Invention No. 1 in C Major, BWV 772",
      genre: "classical",
      composer: "Johann Sebastian Bach",
      difficulty: "beginner",
      key: "C major",
      tags: ["bach", "invention", "baroque", "counterpoint", "pedagogical"],
      source: SOURCE,
      status: "raw",
      musicalLanguage: {
        description: "Bach's two-part inventions were designed to teach independent hand coordination. This first invention introduces a simple motif that passes between hands in elegant counterpoint.",
        structure: "Binary: A (tonic) - B (dominant/tonic) with invertible counterpoint",
        keyMoments: ["Opening: right hand introduces the motif", "Answer: left hand enters with the same motif", "Development: hands exchange and overlap the theme", "Conclusion: both hands unite for the final cadence"],
        teachingGoals: ["Two-part counterpoint (independent hand movement)", "Following a musical subject through imitation", "Even articulation without pedal"],
        styleTips: ["No sustain pedal — clarity is everything", "Each hand must be equally clear and present", "Slight detachment between notes (non-legato touch)"],
      },
    },
  },
  {
    midiFile: "brahms-intermezzo-op118-no2.mid",
    downloadUrl: "http://piano-midi.de/midis/brahms/bra_inter118-2.mid",
    config: {
      id: "brahms-intermezzo-op118-no2",
      title: "Intermezzo in A Major, Op. 118 No. 2",
      genre: "classical",
      composer: "Johannes Brahms",
      difficulty: "advanced",
      key: "A major",
      tags: ["brahms", "intermezzo", "late-romantic", "lyrical", "intimate"],
      source: SOURCE,
      status: "raw",
      musicalLanguage: {
        description: "One of Brahms's most intimate late works — a tender, autumnal meditation. Rich inner voices and gentle cross-rhythms create warmth beneath a singing melody.",
        structure: "ABA': lyrical outer sections, more intense middle in F# minor",
        keyMoments: ["Opening: tender melody with rich inner harmonies", "Middle section: intensity grows with fuller texture", "Return: the melody comes back even more tenderly", "Coda: fades to a whispered close"],
        teachingGoals: ["Inner voice control in thick textures", "Cross-rhythm awareness (3 against 2)", "Late Romantic phrasing and rubato"],
        styleTips: ["Think of this as a private conversation, not a performance", "Inner voices must sing, not just fill space", "Warmth of tone is more important than volume"],
      },
    },
  },
  {
    midiFile: "beethoven-waldstein-opening.mid",
    downloadUrl: "http://piano-midi.de/midis/beethoven/waldstein1.mid",
    config: {
      id: "beethoven-waldstein-mvt1",
      title: "Waldstein Sonata, Op. 53, I. Allegro con brio",
      genre: "classical",
      composer: "Ludwig van Beethoven",
      difficulty: "advanced",
      key: "C major",
      tags: ["beethoven", "sonata", "heroic", "virtuosic", "dramatic"],
      source: SOURCE,
      status: "raw",
      musicalLanguage: {
        description: "A blazing, heroic sonata that opens with propulsive repeated chords driving relentlessly forward. One of Beethoven's most technically demanding and emotionally exhilarating works.",
        structure: "Sonata form: dramatic exposition, intense development, triumphant recapitulation",
        keyMoments: ["Opening: driving repeated chords create unstoppable momentum", "Second theme: lyrical contrast in E major", "Development: fierce modulations and dramatic tension", "Coda: virtuosic passages bring the movement to a blazing conclusion"],
        teachingGoals: ["Repeated chord technique (wrist rotation)", "Sustained energy over long passages", "Sonata form at its most dramatic"],
        styleTips: ["The opening chords must drive forward like a locomotive", "Contrast between driving and lyrical sections is crucial", "Maintain energy without tension in the body"],
      },
    },
  },
  {
    midiFile: "chopin-revolutionary-etude.mid",
    downloadUrl: "http://piano-midi.de/midis/chopin/etudeop10no12.mid",
    config: {
      id: "chopin-revolutionary-etude",
      title: "Revolutionary Etude, Op. 10 No. 12",
      genre: "classical",
      composer: "Frederic Chopin",
      difficulty: "advanced",
      key: "C minor",
      tags: ["chopin", "etude", "revolutionary", "virtuosic", "passionate"],
      source: SOURCE,
      status: "raw",
      musicalLanguage: {
        description: "Written in anguish over the fall of Warsaw, this etude channels political fury into a torrent of left-hand sixteenth notes beneath a declamatory right-hand melody. One of the most technically demanding and emotionally powerful etudes.",
        structure: "Through-composed with dramatic arc: fury → climax → despair → defiance",
        keyMoments: ["Opening: cascading left hand descends like an avalanche", "Melody enters: a cry of defiance in the right hand", "Climax: full-force passion in both hands", "Final measures: the storm subsides but resolve remains"],
        teachingGoals: ["Left-hand endurance and evenness at speed", "Maintaining melody clarity over turbulent accompaniment", "Emotional commitment in virtuosic playing"],
        styleTips: ["The left hand is a storm — relentless but never sloppy", "Right-hand melody must cut through clearly", "This is anger and grief — play it with everything you have"],
      },
    },
  },
  {
    midiFile: "debussy-arabesque-no1.mid",
    downloadUrl: "http://piano-midi.de/midis/debussy/DEB_ARAB.mid",
    config: {
      id: "debussy-arabesque-no1",
      title: "Arabesque No. 1 in E Major",
      genre: "classical",
      composer: "Claude Debussy",
      difficulty: "intermediate",
      key: "E major",
      tags: ["debussy", "arabesque", "impressionist", "flowing", "ornamental"],
      source: SOURCE,
      status: "raw",
      musicalLanguage: {
        description: "An early Debussy masterwork that bridges Romanticism and Impressionism. Flowing triplet arpeggios and a graceful melody create a sense of arabesque ornamentation — musical filigree.",
        structure: "ABA: flowing outer sections, contrasting lyrical middle",
        keyMoments: ["Opening: triplet arpeggios establish the flowing texture", "Main melody: graceful, almost dance-like", "Middle section: more sustained, singing quality", "Return: the arpeggios resume with renewed sparkle"],
        teachingGoals: ["Triplet flow and evenness", "Balancing melody against arpeggiated texture", "Introduction to impressionistic style"],
        styleTips: ["The triplets should shimmer, not pound", "Melody floats on top of the arpeggiated texture", "Pedal generously but change with the harmony"],
      },
    },
  },
  {
    midiFile: "satie-gymnopedie-no1.mid",
    downloadUrl: "http://piano-midi.de/midis/satie/gymnopedie_1.mid",
    config: {
      id: "satie-gymnopedie-no1",
      title: "Gymnopedie No. 1",
      genre: "classical",
      composer: "Erik Satie",
      difficulty: "beginner",
      key: "D major",
      tags: ["satie", "gymnopedie", "minimalist", "ambient", "meditative"],
      source: SOURCE,
      status: "raw",
      musicalLanguage: {
        description: "A strikingly modern piece from 1888 — spare, floating, and meditative. The simple waltz-like accompaniment and wandering melody anticipated ambient music by nearly a century.",
        structure: "A-A'-B: two statements of the theme with a contrasting section",
        keyMoments: ["Opening: the iconic 7th chords set the dreamy mood", "Melody enters: floating, unresolved, unhurried", "B section: subtle shift in harmony deepens the mood", "Close: the music simply fades, unresolved"],
        teachingGoals: ["Expressive simplicity — making few notes count", "Waltz bass pattern (bass note + chord)", "Sustain pedal for blending"],
        styleTips: ["Extremely slow and unhurried — this is meditation music", "The 7th chords should be soft and blended", "Never accent anything — let gravity do the work"],
      },
    },
  },
];

// ─── Download Helper ────────────────────────────────────────────────────────

/** Matches src/midi/parser.ts's own 10MB oversized-file guard. */
const MAX_MIDI_BYTES = 10 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;

async function downloadMidi(url: string, dest: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Referer": "http://piano-midi.de/",
      },
      // Previously no timeout and no size/content check at all before
      // writeFileSync — a slow host could hang indefinitely, and any
      // non-MIDI response (e.g. an HTML error page) would be cached as if
      // it were a valid .mid file (F-a4886014).
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`  HTTP ${response.status} for ${url}`);
      return false;
    }
    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_MIDI_BYTES) {
      console.error(`  Too large (Content-Length ${contentLength} bytes, max ${MAX_MIDI_BYTES}) — skipping`);
      return false;
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_MIDI_BYTES) {
      console.error(`  Too large (${buffer.byteLength} bytes, max ${MAX_MIDI_BYTES}) — skipping`);
      return false;
    }
    if (buffer.byteLength < 100) {
      console.error(`  Too small (${buffer.byteLength} bytes) — likely not a MIDI file`);
      return false;
    }
    const header = new Uint8Array(buffer, 0, 4);
    const magic = String.fromCharCode(...header);
    if (magic !== "MThd") {
      console.error(`  Not a MIDI file (expected "MThd" header, got "${magic}") — skipping`);
      return false;
    }
    writeFileSync(dest, Buffer.from(buffer));
    return true;
  } catch (err) {
    console.error(`  Download error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const cachedOnly = process.argv.includes("--cached");

  // Ensure directories exist
  if (!existsSync(MIDI_DIR)) mkdirSync(MIDI_DIR, { recursive: true });
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const imp of IMPORTS) {
    const midiPath = join(MIDI_DIR, imp.midiFile);
    const outputPath = join(OUTPUT_DIR, `${imp.config.id}.json`);

    // Skip if output already exists
    if (existsSync(outputPath)) {
      console.log(`SKIP ${imp.config.id}: already exists`);
      skipped++;
      continue;
    }

    // Download if not cached
    if (!existsSync(midiPath)) {
      if (cachedOnly) {
        console.error(`SKIP ${imp.config.id}: MIDI not cached (use without --cached to download)`);
        skipped++;
        continue;
      }
      console.log(`Downloading ${imp.config.id}...`);
      await delay(1000); // Rate limit courtesy
      const ok = await downloadMidi(imp.downloadUrl, midiPath);
      if (!ok) {
        console.error(`FAIL ${imp.config.id}: download failed`);
        failed++;
        continue;
      }
    }

    // Import
    try {
      const midiBuffer = new Uint8Array(readFileSync(midiPath));
      const song = midiToSongEntry(midiBuffer, imp.config);
      const errors = validateSong(song);
      if (errors.length > 0) {
        console.error(`FAIL ${imp.config.id}: validation errors:`);
        for (const e of errors) console.error(`  - ${e}`);
        failed++;
        continue;
      }

      writeFileSync(outputPath, JSON.stringify(song, null, 2) + "\n");
      console.log(`OK   ${imp.config.id} (${song.measures.length} measures, ${song.durationSeconds}s)`);
      success++;
    } catch (err) {
      console.error(`FAIL ${imp.config.id}: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\n─── Import Summary ───`);
  console.log(`Success: ${success}`);
  console.log(`Failed:  ${failed}`);
  console.log(`Skipped: ${skipped}`);

  if (failed > 0) process.exit(1);
}

main();
