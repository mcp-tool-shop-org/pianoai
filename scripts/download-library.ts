#!/usr/bin/env npx tsx
// ─── Download Library ────────────────────────────────────────────────────────
//
// Downloads MIDI files for the entire song library and writes config JSONs.
// 10 songs × 12 genres = 120 songs. Classical configs are fully annotated
// (status: "ready"), other genres start as "raw" for future annotation.
//
// Usage:
//   npx tsx scripts/download-library.ts              # download all
//   npx tsx scripts/download-library.ts --genre jazz  # download one genre
//   npx tsx scripts/download-library.ts --cached      # skip downloads, use cache
//
// MIDI sources:
//   Classical: piano-midi.de (CC BY-SA)
//   Jazz: Doug McKenzie / midiworld / freemidi
//   Other: freemidi.org, midiworld.com, bitmidi.com
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { midiToSongEntry } from "../src/songs/midi/ingest.js";
import { validateSong } from "../src/songs/registry.js";
import type { SongConfig } from "../src/songs/config/schema.js";
import type { SongStatus } from "../src/songs/config/schema.js";
import type { Genre } from "../src/songs/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIDI_CACHE = join(__dirname, "midi-cache");
const LIBRARY_DIR = join(__dirname, "..", "songs", "library");

// ─── Types ───────────────────────────────────────────────────────────────────

interface LibraryImport {
  midiFile: string;
  downloadUrl: string;
  config: SongConfig;
}

// ─── Helper: Build a raw config (minimal metadata, no musicalLanguage) ──────

function raw(id: string, title: string, genre: Genre, opts: {
  composer?: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
  key?: string;
  tags?: string[];
}): SongConfig {
  return {
    id,
    title,
    genre,
    difficulty: opts.difficulty ?? "intermediate",
    key: opts.key ?? "C major",
    tags: opts.tags ?? [genre],
    composer: opts.composer,
    status: "raw",
  };
}

// ─── Classical (piano-midi.de, CC BY-SA) ────────────────────────────────────

const SOURCE_PMD = "Bernd Krueger, Source: piano-midi.de (CC BY-SA)";

const CLASSICAL: LibraryImport[] = [
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
      source: SOURCE_PMD,
      status: "ready",
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
      source: SOURCE_PMD,
      status: "ready",
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
      source: SOURCE_PMD,
      status: "ready",
      musicalLanguage: {
        description: "A strikingly modern piece from 1888 — spare, floating, and meditative. The simple waltz-like accompaniment and wandering melody anticipated ambient music by nearly a century.",
        structure: "A-A'-B: two statements of the theme with a contrasting section",
        keyMoments: ["Opening: the iconic 7th chords set the dreamy mood", "Melody enters: floating, unresolved, unhurried", "B section: subtle shift in harmony deepens the mood"],
        teachingGoals: ["Expressive simplicity — making few notes count", "Waltz bass pattern (bass note + chord)", "Sustain pedal for blending"],
        styleTips: ["Extremely slow and unhurried — this is meditation music", "The 7th chords should be soft and blended", "Never accent anything — let gravity do the work"],
      },
    },
  },
  {
    midiFile: "pathetique-mvt2.mid",
    downloadUrl: "https://www.midiworld.com/midis/other/beethoven/pathet2.mid",
    config: {
      id: "pathetique-mvt2",
      title: "Pathetique Sonata, 2nd Movement (Adagio cantabile)",
      genre: "classical",
      composer: "Ludwig van Beethoven",
      difficulty: "intermediate",
      key: "Ab major",
      tags: ["beethoven", "sonata", "adagio", "lyrical", "romantic"],
      source: SOURCE_PMD,
      status: "ready",
      musicalLanguage: {
        description: "One of the most beautiful slow movements in the piano repertoire. A serene, singing melody over a gently rocking accompaniment.",
        structure: "Rondo: A-B-A-C-A",
        keyMoments: ["Opening melody: one of music's great singing themes", "B section: modulation to darker territory", "Return of A theme with ornamental variations"],
        teachingGoals: ["Cantabile (singing) touch", "Voicing melody over accompaniment", "Sustain pedal technique for legato"],
        styleTips: ["Let the melody sing above everything", "Gentle, even accompaniment in the left hand", "Use rubato at phrase endings"],
      },
    },
  },
  {
    midiFile: "chopin-nocturne-op9-no2.mid",
    downloadUrl: "https://www.midiworld.com/midis/other/chopin/chno0902.mid",
    config: {
      id: "chopin-nocturne-op9-no2",
      title: "Nocturne in Eb Major, Op. 9 No. 2",
      genre: "classical",
      composer: "Frederic Chopin",
      difficulty: "intermediate",
      key: "Eb major",
      tags: ["chopin", "nocturne", "romantic", "lyrical", "ornamental"],
      source: SOURCE_PMD,
      status: "ready",
      musicalLanguage: {
        description: "Perhaps the most famous nocturne ever written. A dreamy, ornamental melody floats over a gentle left-hand waltz pattern.",
        structure: "A-A'-A''-Coda with progressive ornamentation",
        keyMoments: ["Opening theme: simple, singing melody", "Second statement: added grace notes and turns", "Third statement: virtuosic ornamentation"],
        teachingGoals: ["Bel canto singing style on piano", "Left-hand waltz accompaniment pattern", "Ornamental playing (turns, trills, grace notes)"],
        styleTips: ["Rubato is essential — push and pull the tempo", "Left hand must be absolutely steady", "Melody should float above the accompaniment"],
      },
    },
  },
  {
    midiFile: "bach-prelude-c-major-bwv846.mid",
    downloadUrl: "http://piano-midi.de/midis/bach/bach_846.mid",
    config: {
      id: "bach-prelude-c-major-bwv846",
      title: "Prelude in C Major, BWV 846 (Well-Tempered Clavier)",
      genre: "classical",
      composer: "Johann Sebastian Bach",
      difficulty: "beginner",
      key: "C major",
      tags: ["bach", "prelude", "baroque", "arpeggiated", "wtc"],
      source: SOURCE_PMD,
      status: "ready",
      musicalLanguage: {
        description: "The piece that opens Bach's monumental Well-Tempered Clavier — a flowing sequence of arpeggiated chords that journey through a rich harmonic landscape.",
        structure: "Through-composed: continuous arpeggiated progression",
        keyMoments: ["Opening: the iconic C major arpeggio pattern", "Harmonic journey through related keys", "Dominant pedal: tension builds", "Final cadence: resolution back to C major"],
        teachingGoals: ["Even finger technique across arpeggios", "Harmonic awareness within patterns", "Pedal technique for connecting arpeggios"],
        styleTips: ["Perfectly even rhythm — each note equal weight", "Let the harmonic changes speak for themselves", "Minimal rubato — the flow is the beauty"],
      },
    },
  },
  {
    midiFile: "schumann-traumerei.mid",
    downloadUrl: "https://www.midiworld.com/midis/other/schumann/traumeri.mid",
    config: {
      id: "schumann-traumerei",
      title: "Traumerei (Dreaming) from Kinderszenen",
      genre: "classical",
      composer: "Robert Schumann",
      difficulty: "intermediate",
      key: "F major",
      tags: ["schumann", "kinderszenen", "dreaming", "romantic", "lyrical"],
      source: SOURCE_PMD,
      status: "ready",
      musicalLanguage: {
        description: "A tender, nostalgic reverie — perhaps the most famous character piece of the Romantic era. The melody rises and falls like gentle breathing.",
        structure: "ABA': two statements of the theme with a contrasting middle",
        keyMoments: ["Opening: the rising melody reaches upward like a sigh", "Peak: the melody reaches its highest point", "Return: the dream resumes, fading to a peaceful close"],
        teachingGoals: ["Voicing a melody within chordal texture", "Inner voice awareness", "Rubato and phrase shaping"],
        styleTips: ["The melody must float above the inner voices", "Imagine a child daydreaming — unhurried, gentle", "Subtle rubato at phrase peaks and endings"],
      },
    },
  },
  {
    midiFile: "debussy-arabesque-no1.mid",
    downloadUrl: "https://bitmidi.com/uploads/32657.mid",
    config: {
      id: "debussy-arabesque-no1",
      title: "Arabesque No. 1 in E Major",
      genre: "classical",
      composer: "Claude Debussy",
      difficulty: "intermediate",
      key: "E major",
      tags: ["debussy", "arabesque", "impressionist", "flowing"],
      source: SOURCE_PMD,
      status: "ready",
      musicalLanguage: {
        description: "An early Debussy masterwork that bridges Romanticism and Impressionism. Flowing triplet arpeggios and a graceful melody create a sense of arabesque ornamentation.",
        structure: "ABA: flowing outer sections, contrasting lyrical middle",
        keyMoments: ["Opening: triplet arpeggios establish the flowing texture", "Main melody: graceful, almost dance-like", "Middle section: more sustained, singing quality"],
        teachingGoals: ["Triplet flow and evenness", "Balancing melody against arpeggiated texture", "Introduction to impressionistic style"],
        styleTips: ["The triplets should shimmer, not pound", "Melody floats on top of the arpeggiated texture", "Pedal generously but change with the harmony"],
      },
    },
  },
  {
    midiFile: "chopin-prelude-e-minor.mid",
    downloadUrl: "https://bitmidi.com/uploads/86322.mid",
    config: {
      id: "chopin-prelude-e-minor",
      title: "Prelude in E Minor, Op. 28 No. 4",
      genre: "classical",
      composer: "Frederic Chopin",
      difficulty: "beginner",
      key: "E minor",
      tags: ["chopin", "prelude", "minimalist", "melancholic"],
      source: SOURCE_PMD,
      status: "ready",
      musicalLanguage: {
        description: "A masterpiece of economy — a simple, descending melody over slowly shifting chords creates profound sadness. Reportedly played at Chopin's own funeral.",
        structure: "Through-composed: continuous descending motion with final cadence",
        keyMoments: ["Opening: the melody barely moves while harmony shifts beneath", "Chromatic descent creates deepening sadness", "Final measures: cadence resolves the tension"],
        teachingGoals: ["Expressive playing with minimal notes", "Chromatic voice leading awareness", "Dynamic shaping over a long phrase"],
        styleTips: ["Extremely slow, with deep feeling", "Let the harmonies breathe — no rushing", "The melody is almost whispered"],
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
      tags: ["mozart", "sonata", "classical-era", "pedagogical"],
      source: SOURCE_PMD,
      status: "ready",
      musicalLanguage: {
        description: "Mozart labeled this 'a little keyboard sonata for beginners,' but its simplicity is deceptive. Crystal-clear melodies and Alberti bass patterns make it a cornerstone of the Classical repertoire.",
        structure: "Sonata form: Exposition-Development-Recapitulation",
        keyMoments: ["Opening theme: iconic ascending scale passage", "Second theme: lyrical melody in G major", "Development: exploration of earlier material"],
        teachingGoals: ["Sonata form understanding", "Alberti bass pattern (left hand)", "Classical-era touch and articulation"],
        styleTips: ["Clean, even articulation — no pedal abuse", "Alberti bass should be light and even", "Phrasing should be elegant and vocal"],
      },
    },
  },
];

// ─── Jazz (bitmidi.com) ──────────────────────────────────────────────────────

const JAZZ: LibraryImport[] = [
  { midiFile: "autumn-leaves.mid", downloadUrl: "https://bitmidi.com/uploads/8402.mid", config: raw("autumn-leaves", "Autumn Leaves", "jazz", { composer: "Joseph Kosma", key: "G minor", tags: ["jazz", "standard", "autumn-leaves"] }) },
  { midiFile: "fly-me-to-the-moon.mid", downloadUrl: "https://bitmidi.com/uploads/58514.mid", config: raw("fly-me-to-the-moon", "Fly Me to the Moon", "jazz", { composer: "Bart Howard", key: "C major", tags: ["jazz", "standard", "sinatra"] }) },
  { midiFile: "take-the-a-train.mid", downloadUrl: "https://bitmidi.com/uploads/37148.mid", config: raw("take-the-a-train", "Take the A Train", "jazz", { composer: "Billy Strayhorn", key: "C major", tags: ["jazz", "swing", "ellington"] }) },
  { midiFile: "all-the-things-you-are.mid", downloadUrl: "https://bitmidi.com/uploads/5169.mid", config: raw("all-the-things-you-are", "All the Things You Are", "jazz", { composer: "Jerome Kern", key: "Ab major", tags: ["jazz", "standard"] }) },
  { midiFile: "blue-bossa.mid", downloadUrl: "https://bitmidi.com/uploads/41046.mid", config: raw("blue-bossa", "Blue Bossa", "jazz", { composer: "Kenny Dorham", key: "C minor", tags: ["jazz", "bossa", "latin-jazz"] }) },
  { midiFile: "misty.mid", downloadUrl: "https://bitmidi.com/uploads/74690.mid", config: raw("misty", "Misty", "jazz", { composer: "Erroll Garner", key: "Eb major", tags: ["jazz", "ballad", "standard"], difficulty: "beginner" }) },
  { midiFile: "round-midnight.mid", downloadUrl: "https://bitmidi.com/uploads/89916.mid", config: raw("round-midnight", "Round Midnight", "jazz", { composer: "Thelonious Monk", key: "Eb minor", tags: ["jazz", "bebop", "monk"], difficulty: "advanced" }) },
  { midiFile: "georgia-on-my-mind.mid", downloadUrl: "https://bitmidi.com/uploads/88032.mid", config: raw("georgia-on-my-mind", "Georgia on My Mind", "jazz", { composer: "Hoagy Carmichael", key: "F major", tags: ["jazz", "standard", "ray-charles"], difficulty: "beginner" }) },
  { midiFile: "my-funny-valentine.mid", downloadUrl: "https://bitmidi.com/uploads/76966.mid", config: raw("my-funny-valentine", "My Funny Valentine", "jazz", { composer: "Richard Rodgers", key: "C minor", tags: ["jazz", "ballad", "standard"] }) },
  { midiFile: "summertime.mid", downloadUrl: "https://bitmidi.com/uploads/97915.mid", config: raw("summertime", "Summertime", "jazz", { composer: "George Gershwin", key: "A minor", tags: ["jazz", "gershwin", "standard"], difficulty: "beginner" }) },
];

// ─── Pop ────────────────────────────────────────────────────────────────────

const POP: LibraryImport[] = [
  { midiFile: "let-it-be.mid", downloadUrl: "https://bitmidi.com/uploads/100821.mid", config: raw("let-it-be", "Let It Be", "pop", { composer: "Lennon/McCartney", key: "C major", tags: ["pop", "beatles", "piano"], difficulty: "beginner" }) },
  { midiFile: "imagine.mid", downloadUrl: "https://bitmidi.com/uploads/63264.mid", config: raw("imagine", "Imagine", "pop", { composer: "John Lennon", key: "C major", tags: ["pop", "lennon", "piano", "iconic"], difficulty: "beginner" }) },
  { midiFile: "bohemian-rhapsody.mid", downloadUrl: "https://bitmidi.com/uploads/87216.mid", config: raw("bohemian-rhapsody", "Bohemian Rhapsody", "pop", { composer: "Freddie Mercury", key: "Bb major", tags: ["pop", "queen", "epic"], difficulty: "advanced" }) },
  { midiFile: "someone-like-you.mid", downloadUrl: "https://bitmidi.com/uploads/3934.mid", config: raw("someone-like-you", "Someone Like You", "pop", { composer: "Adele Adkins", key: "A major", tags: ["pop", "adele", "ballad"] }) },
  { midiFile: "clocks.mid", downloadUrl: "https://bitmidi.com/uploads/24955.mid", config: raw("clocks", "Clocks", "pop", { composer: "Coldplay", key: "Eb major", tags: ["pop", "coldplay", "riff"] }) },
  { midiFile: "piano-man.mid", downloadUrl: "https://bitmidi.com/uploads/17583.mid", config: raw("piano-man", "Piano Man", "pop", { composer: "Billy Joel", key: "C major", tags: ["pop", "billy-joel", "classic"] }) },
  { midiFile: "a-thousand-years.mid", downloadUrl: "https://bitmidi.com/uploads/22452.mid", config: raw("a-thousand-years", "A Thousand Years", "pop", { composer: "Christina Perri", key: "Bb major", tags: ["pop", "film", "romantic"], difficulty: "beginner" }) },
  { midiFile: "all-of-me.mid", downloadUrl: "https://bitmidi.com/uploads/63296.mid", config: raw("all-of-me", "All of Me", "pop", { composer: "John Legend", key: "Ab major", tags: ["pop", "ballad", "wedding"] }) },
  { midiFile: "viva-la-vida.mid", downloadUrl: "https://bitmidi.com/uploads/24946.mid", config: raw("viva-la-vida", "Viva la Vida", "pop", { composer: "Coldplay", key: "Ab major", tags: ["pop", "coldplay", "orchestral"] }) },
  { midiFile: "someone-you-loved.mid", downloadUrl: "https://bitmidi.com/uploads/69257.mid", config: raw("someone-you-loved", "Someone You Loved", "pop", { composer: "Lewis Capaldi", key: "C major", tags: ["pop", "ballad", "piano"] }) },
];

// ─── Blues ───────────────────────────────────────────────────────────────────

const BLUES: LibraryImport[] = [
  { midiFile: "the-thrill-is-gone.mid", downloadUrl: "https://bitmidi.com/uploads/102720.mid", config: raw("the-thrill-is-gone", "The Thrill Is Gone", "blues", { composer: "Roy Hawkins", key: "B minor", tags: ["blues", "bb-king", "classic"] }) },
  { midiFile: "stormy-monday.mid", downloadUrl: "https://bitmidi.com/uploads/5364.mid", config: raw("stormy-monday", "Stormy Monday", "blues", { composer: "T-Bone Walker", key: "G major", tags: ["blues", "slow-blues"] }) },
  { midiFile: "sweet-home-chicago.mid", downloadUrl: "https://bitmidi.com/uploads/18585.mid", config: raw("sweet-home-chicago", "Sweet Home Chicago", "blues", { composer: "Robert Johnson", key: "E major", tags: ["blues", "chicago", "standard"], difficulty: "beginner" }) },
  { midiFile: "st-louis-blues.mid", downloadUrl: "https://bitmidi.com/uploads/96456.mid", config: raw("st-louis-blues", "St. Louis Blues", "blues", { composer: "W.C. Handy", key: "G major", tags: ["blues", "classic", "standard"] }) },
  { midiFile: "everyday-i-have-the-blues.mid", downloadUrl: "https://bitmidi.com/uploads/45218.mid", config: raw("everyday-i-have-the-blues", "Everyday I Have the Blues", "blues", { composer: "Memphis Slim", key: "Bb major", tags: ["blues", "standard"], difficulty: "beginner" }) },
  { midiFile: "red-house.mid", downloadUrl: "https://bitmidi.com/uploads/62099.mid", config: raw("red-house", "Red House", "blues", { composer: "Jimi Hendrix", key: "B major", tags: ["blues", "hendrix", "rock-blues"] }) },
  { midiFile: "born-under-a-bad-sign.mid", downloadUrl: "https://bitmidi.com/uploads/5810.mid", config: raw("born-under-a-bad-sign", "Born Under a Bad Sign", "blues", { composer: "Albert King", key: "C# minor", tags: ["blues", "albert-king"] }) },
  { midiFile: "blues-in-the-night.mid", downloadUrl: "https://bitmidi.com/uploads/18375.mid", config: raw("blues-in-the-night", "Blues in the Night", "blues", { composer: "Harold Arlen", key: "Bb major", tags: ["blues", "jazz-blues", "standard"] }) },
  { midiFile: "hoochie-coochie-man.mid", downloadUrl: "https://bitmidi.com/uploads/56938.mid", config: raw("hoochie-coochie-man", "Hoochie Coochie Man", "blues", { composer: "Willie Dixon", key: "A major", tags: ["blues", "muddy-waters", "chicago"], difficulty: "beginner" }) },
  { midiFile: "crossroad-blues.mid", downloadUrl: "https://bitmidi.com/uploads/87408.mid", config: raw("crossroad-blues", "Crossroad Blues", "blues", { composer: "Robert Johnson", key: "A major", tags: ["blues", "robert-johnson", "delta"] }) },
];

// ─── Rock ───────────────────────────────────────────────────────────────────

const ROCK: LibraryImport[] = [
  { midiFile: "your-song.mid", downloadUrl: "https://bitmidi.com/uploads/112548.mid", config: raw("your-song", "Your Song", "rock", { composer: "Elton John", key: "Eb major", tags: ["rock", "elton-john", "ballad", "piano"], difficulty: "beginner" }) },
  { midiFile: "tiny-dancer.mid", downloadUrl: "https://bitmidi.com/uploads/104274.mid", config: raw("tiny-dancer", "Tiny Dancer", "rock", { composer: "Elton John", key: "C major", tags: ["rock", "elton-john", "piano"] }) },
  { midiFile: "bennie-and-the-jets.mid", downloadUrl: "https://bitmidi.com/uploads/17080.mid", config: raw("bennie-and-the-jets", "Bennie and the Jets", "rock", { composer: "Elton John", key: "G major", tags: ["rock", "elton-john", "glam"] }) },
  { midiFile: "rocket-man.mid", downloadUrl: "https://bitmidi.com/uploads/89401.mid", config: raw("rocket-man", "Rocket Man", "rock", { composer: "Elton John", key: "Bb major", tags: ["rock", "elton-john", "space"] }) },
  { midiFile: "dont-stop-believin.mid", downloadUrl: "https://bitmidi.com/uploads/63595.mid", config: raw("dont-stop-believin", "Don't Stop Believin'", "rock", { composer: "Journey", key: "E major", tags: ["rock", "journey", "anthem"] }) },
  { midiFile: "november-rain.mid", downloadUrl: "https://bitmidi.com/uploads/51378.mid", config: raw("november-rain", "November Rain", "rock", { composer: "Guns N' Roses", key: "C major", tags: ["rock", "gnr", "ballad", "piano"] }) },
  { midiFile: "stairway-to-heaven.mid", downloadUrl: "https://bitmidi.com/uploads/68032.mid", config: raw("stairway-to-heaven", "Stairway to Heaven", "rock", { composer: "Led Zeppelin", key: "A minor", tags: ["rock", "led-zeppelin", "epic"], difficulty: "advanced" }) },
  { midiFile: "dream-on.mid", downloadUrl: "https://bitmidi.com/uploads/4090.mid", config: raw("dream-on", "Dream On", "rock", { composer: "Aerosmith", key: "F minor", tags: ["rock", "aerosmith", "piano"] }) },
  { midiFile: "baba-oriley.mid", downloadUrl: "https://bitmidi.com/uploads/101954.mid", config: raw("baba-oriley", "Baba O'Riley", "rock", { composer: "The Who", key: "F major", tags: ["rock", "the-who", "synth"] }) },
  { midiFile: "layla-unplugged.mid", downloadUrl: "https://bitmidi.com/uploads/44002.mid", config: raw("layla-unplugged", "Layla (Unplugged)", "rock", { composer: "Eric Clapton", key: "D minor", tags: ["rock", "clapton", "unplugged"] }) },
];

// ─── R&B ────────────────────────────────────────────────────────────────────

const RNB: LibraryImport[] = [
  { midiFile: "isnt-she-lovely.mid", downloadUrl: "https://bitmidi.com/uploads/97094.mid", config: raw("isnt-she-lovely", "Isn't She Lovely", "rnb", { composer: "Stevie Wonder", key: "E major", tags: ["rnb", "stevie-wonder", "groove"] }) },
  { midiFile: "superstition.mid", downloadUrl: "https://bitmidi.com/uploads/97097.mid", config: raw("superstition", "Superstition", "rnb", { composer: "Stevie Wonder", key: "Eb minor", tags: ["rnb", "stevie-wonder", "funk"] }) },
  { midiFile: "if-i-aint-got-you.mid", downloadUrl: "https://bitmidi.com/uploads/4993.mid", config: raw("if-i-aint-got-you", "If I Ain't Got You", "rnb", { composer: "Alicia Keys", key: "G major", tags: ["rnb", "alicia-keys", "piano", "ballad"] }) },
  { midiFile: "no-one.mid", downloadUrl: "https://bitmidi.com/uploads/4997.mid", config: raw("no-one", "No One", "rnb", { composer: "Alicia Keys", key: "E major", tags: ["rnb", "alicia-keys", "piano"] }) },
  { midiFile: "fallin.mid", downloadUrl: "https://bitmidi.com/uploads/4991.mid", config: raw("fallin", "Fallin'", "rnb", { composer: "Alicia Keys", key: "E minor", tags: ["rnb", "alicia-keys", "piano", "classic"] }) },
  { midiFile: "ordinary-people.mid", downloadUrl: "https://bitmidi.com/uploads/63432.mid", config: raw("ordinary-people", "Ordinary People", "rnb", { composer: "John Legend", key: "F major", tags: ["rnb", "john-legend", "piano"] }) },
  { midiFile: "ribbon-in-the-sky.mid", downloadUrl: "https://bitmidi.com/uploads/88756.mid", config: raw("ribbon-in-the-sky", "Ribbon in the Sky", "rnb", { composer: "Stevie Wonder", key: "Eb major", tags: ["rnb", "stevie-wonder", "romantic"] }) },
  { midiFile: "killing-me-softly.mid", downloadUrl: "https://bitmidi.com/uploads/89233.mid", config: raw("killing-me-softly", "Killing Me Softly", "rnb", { composer: "Charles Fox", key: "Eb major", tags: ["rnb", "roberta-flack", "ballad"], difficulty: "beginner" }) },
  { midiFile: "i-will-always-love-you.mid", downloadUrl: "https://bitmidi.com/uploads/58443.mid", config: raw("i-will-always-love-you", "I Will Always Love You", "rnb", { composer: "Dolly Parton", key: "A major", tags: ["rnb", "whitney-houston", "power-ballad"] }) },
  { midiFile: "halo.mid", downloadUrl: "https://bitmidi.com/uploads/17324.mid", config: raw("halo", "Halo", "rnb", { composer: "Beyonce", key: "A major", tags: ["rnb", "beyonce", "piano"] }) },
];

// ─── Soul ───────────────────────────────────────────────────────────────────

const SOUL: LibraryImport[] = [
  { midiFile: "lean-on-me.mid", downloadUrl: "https://bitmidi.com/uploads/14680.mid", config: raw("lean-on-me", "Lean on Me", "soul", { composer: "Bill Withers", key: "C major", tags: ["soul", "bill-withers", "piano", "gospel"], difficulty: "beginner" }) },
  { midiFile: "aint-no-sunshine.mid", downloadUrl: "https://bitmidi.com/uploads/4424.mid", config: raw("aint-no-sunshine", "Ain't No Sunshine", "soul", { composer: "Bill Withers", key: "A minor", tags: ["soul", "bill-withers", "minor"], difficulty: "beginner" }) },
  { midiFile: "a-change-is-gonna-come.mid", downloadUrl: "https://bitmidi.com/uploads/91653.mid", config: raw("a-change-is-gonna-come", "A Change Is Gonna Come", "soul", { composer: "Sam Cooke", key: "Bb major", tags: ["soul", "sam-cooke", "civil-rights"] }) },
  { midiFile: "whats-going-on.mid", downloadUrl: "https://bitmidi.com/uploads/72668.mid", config: raw("whats-going-on", "What's Going On", "soul", { composer: "Marvin Gaye", key: "E major", tags: ["soul", "marvin-gaye", "protest"] }) },
  { midiFile: "dock-of-the-bay.mid", downloadUrl: "https://bitmidi.com/uploads/83369.mid", config: raw("dock-of-the-bay", "Sitting on the Dock of the Bay", "soul", { composer: "Otis Redding", key: "G major", tags: ["soul", "otis-redding"], difficulty: "beginner" }) },
  { midiFile: "stand-by-me.mid", downloadUrl: "https://bitmidi.com/uploads/17038.mid", config: raw("stand-by-me", "Stand by Me", "soul", { composer: "Ben E. King", key: "A major", tags: ["soul", "ben-e-king", "classic"], difficulty: "beginner" }) },
  { midiFile: "respect.mid", downloadUrl: "https://bitmidi.com/uploads/7522.mid", config: raw("respect", "Respect", "soul", { composer: "Otis Redding", key: "C major", tags: ["soul", "aretha-franklin", "anthem"] }) },
  { midiFile: "my-girl.mid", downloadUrl: "https://www.midiworld.com/download/947", config: raw("my-girl", "My Girl", "soul", { composer: "Smokey Robinson", key: "C major", tags: ["soul", "temptations", "motown"], difficulty: "beginner" }) },
  { midiFile: "lets-stay-together.mid", downloadUrl: "https://bitmidi.com/uploads/68400.mid", config: raw("lets-stay-together", "Let's Stay Together", "soul", { composer: "Al Green", key: "Ab major", tags: ["soul", "al-green", "smooth"] }) },
  { midiFile: "i-got-you.mid", downloadUrl: "https://bitmidi.com/uploads/20170.mid", config: raw("i-got-you", "I Got You (I Feel Good)", "soul", { composer: "James Brown", key: "D major", tags: ["soul", "james-brown", "funk"] }) },
];

// ─── Latin ──────────────────────────────────────────────────────────────────

const LATIN: LibraryImport[] = [
  { midiFile: "besame-mucho.mid", downloadUrl: "https://bitmidi.com/uploads/17170.mid", config: raw("besame-mucho", "Besame Mucho", "latin", { composer: "Consuelo Velazquez", key: "D minor", tags: ["latin", "bolero", "mexican"] }) },
  { midiFile: "girl-from-ipanema.mid", downloadUrl: "https://bitmidi.com/uploads/102483.mid", config: raw("girl-from-ipanema", "The Girl from Ipanema", "latin", { composer: "Antonio Carlos Jobim", key: "F major", tags: ["latin", "bossa-nova", "jobim"] }) },
  { midiFile: "desafinado.mid", downloadUrl: "https://bitmidi.com/uploads/39006.mid", config: raw("desafinado", "Desafinado", "latin", { composer: "Antonio Carlos Jobim", key: "F major", tags: ["latin", "bossa-nova", "jobim"] }) },
  { midiFile: "corcovado.mid", downloadUrl: "https://bitmidi.com/uploads/25662.mid", config: raw("corcovado", "Corcovado (Quiet Nights)", "latin", { composer: "Antonio Carlos Jobim", key: "A minor", tags: ["latin", "bossa-nova", "jobim"], difficulty: "beginner" }) },
  { midiFile: "wave.mid", downloadUrl: "https://bitmidi.com/uploads/109131.mid", config: raw("wave", "Wave", "latin", { composer: "Antonio Carlos Jobim", key: "D major", tags: ["latin", "bossa-nova", "jobim"] }) },
  { midiFile: "black-orpheus.mid", downloadUrl: "https://bitmidi.com/uploads/71782.mid", config: raw("black-orpheus", "Black Orpheus (Manha de Carnaval)", "latin", { composer: "Luiz Bonfa", key: "A minor", tags: ["latin", "bossa-nova", "film"] }) },
  { midiFile: "mas-que-nada.mid", downloadUrl: "https://bitmidi.com/uploads/72364.mid", config: raw("mas-que-nada", "Mas Que Nada", "latin", { composer: "Jorge Ben Jor", key: "E minor", tags: ["latin", "samba", "brazilian"] }) },
  { midiFile: "agua-de-beber.mid", downloadUrl: "https://bitmidi.com/uploads/4374.mid", config: raw("agua-de-beber", "Agua de Beber", "latin", { composer: "Antonio Carlos Jobim", key: "D minor", tags: ["latin", "bossa-nova", "jobim"] }) },
  { midiFile: "perfidia.mid", downloadUrl: "https://bitmidi.com/uploads/52654.mid", config: raw("perfidia", "Perfidia", "latin", { composer: "Alberto Dominguez", key: "G minor", tags: ["latin", "bolero", "classic"] }) },
  { midiFile: "el-condor-pasa.mid", downloadUrl: "https://bitmidi.com/uploads/42920.mid", config: raw("el-condor-pasa", "El Condor Pasa", "latin", { composer: "Daniel Alomia Robles", key: "E minor", tags: ["latin", "andean", "folk"], difficulty: "beginner" }) },
];

// ─── Film ───────────────────────────────────────────────────────────────────

const FILM: LibraryImport[] = [
  { midiFile: "moon-river.mid", downloadUrl: "https://bitmidi.com/uploads/75294.mid", config: raw("moon-river", "Moon River", "film", { composer: "Henry Mancini", key: "C major", tags: ["film", "mancini", "classic"], difficulty: "beginner" }) },
  { midiFile: "schindlers-list-theme.mid", downloadUrl: "https://bitmidi.com/uploads/102996.mid", config: raw("schindlers-list-theme", "Schindler's List Theme", "film", { composer: "John Williams", key: "D minor", tags: ["film", "williams", "violin-piano"] }) },
  { midiFile: "cinema-paradiso.mid", downloadUrl: "https://bitmidi.com/uploads/23826.mid", config: raw("cinema-paradiso", "Cinema Paradiso Theme", "film", { composer: "Ennio Morricone", key: "F major", tags: ["film", "morricone", "nostalgic"] }) },
  { midiFile: "mia-and-sebastians-theme.mid", downloadUrl: "https://bitmidi.com/uploads/66253.mid", config: raw("mia-and-sebastians-theme", "Mia & Sebastian's Theme (La La Land)", "film", { composer: "Justin Hurwitz", key: "A minor", tags: ["film", "la-la-land", "jazz-piano"] }) },
  { midiFile: "hedwigs-theme.mid", downloadUrl: "https://bitmidi.com/uploads/55202.mid", config: raw("hedwigs-theme", "Hedwig's Theme (Harry Potter)", "film", { composer: "John Williams", key: "E minor", tags: ["film", "williams", "harry-potter"] }) },
  { midiFile: "pink-panther.mid", downloadUrl: "https://bitmidi.com/uploads/85208.mid", config: raw("pink-panther", "The Pink Panther Theme", "film", { composer: "Henry Mancini", key: "E minor", tags: ["film", "mancini", "spy"] }) },
  { midiFile: "forrest-gump.mid", downloadUrl: "https://bitmidi.com/uploads/29307.mid", config: raw("forrest-gump", "Forrest Gump Suite", "film", { composer: "Alan Silvestri", key: "C major", tags: ["film", "silvestri", "americana"], difficulty: "beginner" }) },
  { midiFile: "my-heart-will-go-on.mid", downloadUrl: "https://bitmidi.com/uploads/76975.mid", config: raw("my-heart-will-go-on", "My Heart Will Go On (Titanic)", "film", { composer: "James Horner", key: "C# minor", tags: ["film", "horner", "titanic"], difficulty: "beginner" }) },
  { midiFile: "comptine-dun-autre-ete.mid", downloadUrl: "https://bitmidi.com/uploads/111883.mid", config: raw("comptine-dun-autre-ete", "Comptine d'un autre ete (Amelie)", "film", { composer: "Yann Tiersen", key: "E minor", tags: ["film", "tiersen", "amelie", "french"] }) },
  { midiFile: "nuvole-bianche.mid", downloadUrl: "https://bitmidi.com/uploads/70390.mid", config: raw("nuvole-bianche", "Nuvole Bianche", "film", { composer: "Ludovico Einaudi", key: "E minor", tags: ["film", "einaudi", "minimalist"] }) },
];

// ─── Ragtime (all Joplin — public domain) ───────────────────────────────────

const RAGTIME: LibraryImport[] = [
  { midiFile: "the-entertainer.mid", downloadUrl: "https://www.mutopiaproject.org/ftp/JoplinS/entertainer/entertainer.mid", config: raw("the-entertainer", "The Entertainer", "ragtime", { composer: "Scott Joplin", key: "C major", tags: ["ragtime", "joplin", "classic"] }) },
  { midiFile: "maple-leaf-rag.mid", downloadUrl: "https://www.mutopiaproject.org/ftp/JoplinS/maple/maple.mid", config: raw("maple-leaf-rag", "Maple Leaf Rag", "ragtime", { composer: "Scott Joplin", key: "Ab major", tags: ["ragtime", "joplin"] }) },
  { midiFile: "the-easy-winners.mid", downloadUrl: "https://www.mutopiaproject.org/ftp/JoplinS/winners/winners.mid", config: raw("the-easy-winners", "The Easy Winners", "ragtime", { composer: "Scott Joplin", key: "Ab major", tags: ["ragtime", "joplin"] }) },
  { midiFile: "elite-syncopations.mid", downloadUrl: "https://www.mutopiaproject.org/ftp/JoplinS/EliteSyncopations/EliteSyncopations.mid", config: raw("elite-syncopations", "Elite Syncopations", "ragtime", { composer: "Scott Joplin", key: "Bb major", tags: ["ragtime", "joplin"], difficulty: "advanced" }) },
  { midiFile: "solace.mid", downloadUrl: "https://www.mutopiaproject.org/ftp/JoplinS/solace/solace.mid", config: raw("solace", "Solace", "ragtime", { composer: "Scott Joplin", key: "G major", tags: ["ragtime", "joplin", "slow"] }) },
  { midiFile: "gladiolus-rag.mid", downloadUrl: "https://www.ragtimemusic.com/midifile/gladiols.mid", config: raw("gladiolus-rag", "Gladiolus Rag", "ragtime", { composer: "Scott Joplin", key: "Bb major", tags: ["ragtime", "joplin"], difficulty: "advanced" }) },
  { midiFile: "pineapple-rag.mid", downloadUrl: "https://www.mutopiaproject.org/ftp/JoplinS/PineappleRag/PineappleRag.mid", config: raw("pineapple-rag", "Pineapple Rag", "ragtime", { composer: "Scott Joplin", key: "D major", tags: ["ragtime", "joplin"] }) },
  { midiFile: "peacherine-rag.mid", downloadUrl: "https://www.mutopiaproject.org/ftp/JoplinS/peacherine/peacherine.mid", config: raw("peacherine-rag", "Peacherine Rag", "ragtime", { composer: "Scott Joplin", key: "C major", tags: ["ragtime", "joplin"] }) },
  { midiFile: "weeping-willow.mid", downloadUrl: "https://www.ragtimemusic.com/midifile/weepingw.mid", config: raw("weeping-willow", "Weeping Willow", "ragtime", { composer: "Scott Joplin", key: "C major", tags: ["ragtime", "joplin", "slow"] }) },
  { midiFile: "bethena.mid", downloadUrl: "https://www.mutopiaproject.org/ftp/JoplinS/bethena/bethena.mid", config: raw("bethena", "Bethena", "ragtime", { composer: "Scott Joplin", key: "Bb major", tags: ["ragtime", "joplin", "waltz"], difficulty: "advanced" }) },
];

// ─── New-Age ────────────────────────────────────────────────────────────────

const NEW_AGE: LibraryImport[] = [
  { midiFile: "kiss-the-rain.mid", downloadUrl: "https://bitmidi.com/uploads/64090.mid", config: raw("kiss-the-rain", "Kiss the Rain", "new-age", { composer: "Yiruma", key: "Db major", tags: ["new-age", "yiruma", "peaceful"], difficulty: "beginner" }) },
  { midiFile: "river-flows-in-you.mid", downloadUrl: "https://bitmidi.com/uploads/62390.mid", config: raw("river-flows-in-you", "River Flows in You", "new-age", { composer: "Yiruma", key: "A major", tags: ["new-age", "yiruma", "arpeggiated"] }) },
  { midiFile: "may-be.mid", downloadUrl: "https://bitmidi.com/uploads/110784.mid", config: raw("may-be", "May Be", "new-age", { composer: "Yiruma", key: "A major", tags: ["new-age", "yiruma"], difficulty: "beginner" }) },
  { midiFile: "nuvole-bianche-na.mid", downloadUrl: "https://bitmidi.com/uploads/70390.mid", config: raw("nuvole-bianche-na", "Nuvole Bianche", "new-age", { composer: "Ludovico Einaudi", key: "E minor", tags: ["new-age", "einaudi", "minimalist"] }) },
  { midiFile: "una-mattina.mid", downloadUrl: "https://bitmidi.com/uploads/38413.mid", config: raw("una-mattina", "Una Mattina", "new-age", { composer: "Ludovico Einaudi", key: "C minor", tags: ["new-age", "einaudi", "film"] }) },
  { midiFile: "experience.mid", downloadUrl: "https://bitmidi.com/uploads/46174.mid", config: raw("experience", "Experience", "new-age", { composer: "Ludovico Einaudi", key: "D minor", tags: ["new-age", "einaudi", "climactic"], difficulty: "advanced" }) },
  { midiFile: "divenire.mid", downloadUrl: "https://bitmidi.com/uploads/39010.mid", config: raw("divenire", "Divenire", "new-age", { composer: "Ludovico Einaudi", key: "A minor", tags: ["new-age", "einaudi", "orchestral"], difficulty: "advanced" }) },
  { midiFile: "watermark.mid", downloadUrl: "https://bitmidi.com/uploads/43862.mid", config: raw("watermark", "Watermark", "new-age", { composer: "Enya", key: "Ab major", tags: ["new-age", "enya", "ambient"], difficulty: "beginner" }) },
  { midiFile: "metamorphosis-two.mid", downloadUrl: "https://bitmidi.com/uploads/84372.mid", config: raw("metamorphosis-two", "Metamorphosis Two", "new-age", { composer: "Philip Glass", key: "A minor", tags: ["new-age", "glass", "minimalist"] }) },
  { midiFile: "opening-glassworks.mid", downloadUrl: "https://bitmidi.com/uploads/84380.mid", config: raw("opening-glassworks", "Opening (from Glassworks)", "new-age", { composer: "Philip Glass", key: "A minor", tags: ["new-age", "glass", "minimalist"] }) },
];

// ─── Folk (traditional, public domain) ──────────────────────────────────────

const FOLK: LibraryImport[] = [
  { midiFile: "amazing-grace.mid", downloadUrl: "https://bitmidi.com/uploads/5856.mid", config: raw("amazing-grace", "Amazing Grace", "folk", { composer: "Traditional", key: "G major", tags: ["folk", "hymn", "traditional"], difficulty: "beginner" }) },
  { midiFile: "greensleeves.mid", downloadUrl: "https://bitmidi.com/uploads/35089.mid", config: raw("greensleeves", "Greensleeves", "folk", { composer: "Traditional", key: "E minor", tags: ["folk", "english", "renaissance"], difficulty: "beginner" }) },
  { midiFile: "danny-boy.mid", downloadUrl: "https://bitmidi.com/uploads/37684.mid", config: raw("danny-boy", "Danny Boy", "folk", { composer: "Traditional Irish", key: "Eb major", tags: ["folk", "irish", "ballad"], difficulty: "beginner" }) },
  { midiFile: "scarborough-fair.mid", downloadUrl: "https://bitmidi.com/uploads/35290.mid", config: raw("scarborough-fair", "Scarborough Fair", "folk", { composer: "Traditional English", key: "D minor", tags: ["folk", "english", "modal"], difficulty: "beginner" }) },
  { midiFile: "shenandoah.mid", downloadUrl: "https://bitmidi.com/uploads/11895.mid", config: raw("shenandoah", "Shenandoah", "folk", { composer: "Traditional American", key: "F major", tags: ["folk", "american", "river"], difficulty: "beginner" }) },
  { midiFile: "house-of-the-rising-sun.mid", downloadUrl: "https://bitmidi.com/uploads/102514.mid", config: raw("house-of-the-rising-sun", "House of the Rising Sun", "folk", { composer: "Traditional", key: "A minor", tags: ["folk", "american", "minor"] }) },
  { midiFile: "simple-gifts.mid", downloadUrl: "https://www.mfiles.co.uk/downloads/simple-gifts.mid", config: raw("simple-gifts", "Simple Gifts", "folk", { composer: "Joseph Brackett", key: "F major", tags: ["folk", "shaker", "american"], difficulty: "beginner" }) },
  { midiFile: "the-water-is-wide.mid", downloadUrl: "https://bitmidi.com/uploads/102887.mid", config: raw("the-water-is-wide", "The Water Is Wide", "folk", { composer: "Traditional Scottish", key: "C major", tags: ["folk", "scottish", "ballad"], difficulty: "beginner" }) },
  { midiFile: "sakura-sakura.mid", downloadUrl: "https://bitmidi.com/uploads/91113.mid", config: raw("sakura-sakura", "Sakura Sakura", "folk", { composer: "Traditional Japanese", key: "A minor", tags: ["folk", "japanese", "pentatonic"], difficulty: "beginner" }) },
  { midiFile: "auld-lang-syne.mid", downloadUrl: "https://bitmidi.com/uploads/8326.mid", config: raw("auld-lang-syne", "Auld Lang Syne", "folk", { composer: "Traditional Scottish", key: "F major", tags: ["folk", "scottish", "new-year"], difficulty: "beginner" }) },
];

// ─── All genres ─────────────────────────────────────────────────────────────

const ALL_GENRES: Record<string, LibraryImport[]> = {
  classical: CLASSICAL,
  jazz: JAZZ,
  pop: POP,
  blues: BLUES,
  rock: ROCK,
  rnb: RNB,
  soul: SOUL,
  latin: LATIN,
  film: FILM,
  ragtime: RAGTIME,
  "new-age": NEW_AGE,
  folk: FOLK,
};

// ─── Download Helper ────────────────────────────────────────────────────────

async function downloadMidi(url: string, dest: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "*/*",
      },
      redirect: "follow",
    });
    if (!response.ok) {
      console.error(`  HTTP ${response.status} for ${url}`);
      return false;
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 100) {
      console.error(`  Too small (${buffer.byteLength} bytes) — likely not a MIDI file`);
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
  const genreFilter = (() => {
    const idx = process.argv.indexOf("--genre");
    return idx !== -1 ? process.argv[idx + 1] : null;
  })();

  // Ensure cache exists
  if (!existsSync(MIDI_CACHE)) mkdirSync(MIDI_CACHE, { recursive: true });

  const genres = genreFilter ? { [genreFilter]: ALL_GENRES[genreFilter] } : ALL_GENRES;
  if (genreFilter && !ALL_GENRES[genreFilter]) {
    console.error(`Unknown genre: ${genreFilter}`);
    console.error(`Valid: ${Object.keys(ALL_GENRES).join(", ")}`);
    process.exit(1);
  }

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const [genre, imports] of Object.entries(genres)) {
    if (!imports) continue;
    const genreDir = join(LIBRARY_DIR, genre);
    if (!existsSync(genreDir)) mkdirSync(genreDir, { recursive: true });

    console.log(`\n─── ${genre.toUpperCase()} (${imports.length} songs) ───`);

    for (const imp of imports) {
      const cachePath = join(MIDI_CACHE, imp.midiFile);
      const midiDest = join(genreDir, `${imp.config.id}.mid`);
      const configDest = join(genreDir, `${imp.config.id}.json`);

      // Always write/update the config
      writeFileSync(configDest, JSON.stringify(imp.config, null, 2) + "\n");

      // Skip MIDI download if already in library
      if (existsSync(midiDest)) {
        console.log(`  SKIP ${imp.config.id}: MIDI already exists`);
        skipped++;
        continue;
      }

      // Check cache
      if (existsSync(cachePath)) {
        // Copy from cache to library
        writeFileSync(midiDest, readFileSync(cachePath));
        console.log(`  CACHE ${imp.config.id}: copied from cache`);
        success++;
        continue;
      }

      // Download
      if (cachedOnly) {
        console.log(`  SKIP ${imp.config.id}: not cached (run without --cached to download)`);
        skipped++;
        continue;
      }

      console.log(`  GET  ${imp.config.id}...`);
      await delay(1500); // Rate limit courtesy
      const ok = await downloadMidi(imp.downloadUrl, cachePath);
      if (ok) {
        writeFileSync(midiDest, readFileSync(cachePath));
        console.log(`  OK   ${imp.config.id}`);
        success++;
      } else {
        console.log(`  FAIL ${imp.config.id}: download failed (config written, MIDI missing)`);
        failed++;
      }
    }
  }

  console.log(`\n─── Download Summary ───`);
  console.log(`Success: ${success}`);
  console.log(`Failed:  ${failed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total configs written: ${success + failed + skipped}`);

  if (failed > 0) {
    console.log(`\nSome downloads failed. Re-run to retry, or find alternative MIDI sources.`);
  }
}

main();
