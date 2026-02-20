<p align="center">
  <img src="logo.png" alt="AI Jam Session logo" width="180" />
</p>

<h1 align="center">AI Jam Session</h1>

<p align="center">
  Teach your AI to play piano.
</p>

<p align="center">
  An MCP server with a built-in audio engine, a 120-song MIDI library, and a piano roll visualizer.<br/>
  Your LLM reads real sheet music, sees what it plays, and performs through your speakers.
</p>

[![Songs](https://img.shields.io/badge/songs-120_across_12_genres-blue)](https://github.com/mcp-tool-shop-org/ai_jam_session)
[![MCP Tools](https://img.shields.io/badge/MCP_tools-17-purple)](https://github.com/mcp-tool-shop-org/ai_jam_session)

---

## What is this?

A piano that AI learns to play. Not a synthesizer, not a MIDI library -- a teaching instrument.

AI Jam Session gives an LLM three things:

1. **Real sheet music** -- MIDI files (the digital equivalent of sheet music) paired with JSON configs that add teaching notes, musical analysis, and style guidance. No hand-written approximations.
2. **A piano roll** -- SVG visualization that lets the LLM "see" what it's playing. Blue rectangles for right hand, coral for left. The LLM reads the SVG back to verify pitch accuracy, rhythm, and hand balance.
3. **A piano engine** -- multi-harmonic piano synthesis that plays through your speakers. Six keyboard voices from Concert Grand to Music Box. No external software required.

The LLM doesn't just *play* music. It learns to *read* music, *compose* music, *verify* what it wrote visually, and *hear* the result. That's the loop.

## The Song Library

The library contains 120 songs across 12 genres, built from real MIDI files. Each song progresses through three stages:

- **raw** -- MIDI downloaded, basic metadata only. Not yet playable.
- **annotated** -- Teaching notes and musical language partially written.
- **ready** -- Fully annotated with musical language, teaching goals, and style tips. Playable.

Songs start as raw MIDI downloads and become playable once properly annotated. The library grows as songs are annotated -- the MIDI is already there for all 120.

### Genres

| Genre | Songs | Status |
|-------|-------|--------|
| Classical | 10 | All ready |
| R&B | 10 | 4 ready |
| Jazz | 10 | Coming |
| Pop | 10 | Coming |
| Blues | 10 | Coming |
| Rock | 10 | Coming |
| Soul | 10 | Coming |
| Latin | 10 | Coming |
| Film | 10 | Coming |
| Ragtime | 10 | Coming |
| New-Age | 10 | Coming |
| Folk | 10 | Coming |

### Sample Songs

| Song | Composer | Genre | Key | Difficulty |
|------|----------|-------|-----|------------|
| Fur Elise | Beethoven | Classical | A minor | Intermediate |
| Clair de Lune | Debussy | Classical | Db major | Intermediate |
| Nocturne Op. 9 No. 2 | Chopin | Classical | Eb major | Advanced |
| Superstition | Stevie Wonder | R&B | Eb minor | Intermediate |
| If I Ain't Got You | Alicia Keys | R&B | G major | Intermediate |
| Isn't She Lovely | Stevie Wonder | R&B | E major | Intermediate |

## Install

```bash
npm install -g @mcptoolshop/ai-jam-session
```

Requires **Node.js 18+**. That's it -- no MIDI drivers, no virtual ports, no external software.

## Quick Start

```bash
# Play a song
pianoai play fur-elise

# Half-speed practice
pianoai play superstition --speed 0.5

# View the piano roll
pianoai view clair-de-lune --out clair-de-lune.svg

# List all playable songs
pianoai list

# Song details + teaching notes
pianoai info fur-elise

# Library progress (all 120 songs, annotation status)
pianoai library
```

## How It Works: MIDI-First Architecture

Songs are built from real MIDI files paired with a JSON config overlay:

```
songs/library/
  classical/
    fur-elise.mid          # The real sheet music (MIDI)
    fur-elise.json         # Metadata + teaching annotations
  rnb/
    superstition.mid
    superstition.json
  jazz/
    autumn-leaves.mid
    autumn-leaves.json
  ...
```

The MIDI file provides the notes, timing, and structure. The JSON config adds everything a teacher would:

```json
{
  "id": "superstition",
  "title": "Superstition",
  "genre": "rnb",
  "composer": "Stevie Wonder",
  "difficulty": "intermediate",
  "key": "Eb minor",
  "status": "ready",
  "musicalLanguage": {
    "description": "One of the greatest funk songs ever written...",
    "structure": "Intro (riff) - Verse - Chorus - Bridge - Outro",
    "keyMoments": ["The clavinet riff: one of the most recognizable keyboard riffs in music"],
    "teachingGoals": ["Funk 16th-note rhythm patterns", "Clavinet-style percussive technique"],
    "styleTips": ["Play it percussively -- short, stabby notes"]
  }
}
```

On startup, the engine reads each MIDI file, splits notes into measures and hands, parses chords, and builds playable data. Only songs with `status: "ready"` appear in the playlist.

### Note Format

Notes are encoded as scientific pitch with duration suffixes. Chords use `+` to join simultaneous notes:

| Token | Meaning |
|-------|---------|
| `C4:q` | Middle C, quarter note |
| `F#5:e` | F-sharp 5, eighth note |
| `Bb3:h` | B-flat 3, half note |
| `R:e` | Eighth rest |
| `C4+E4+G4:q` | C major chord, quarter note |
| `A3:q.` | A3, dotted quarter |
| `D4:et` | D4, eighth triplet |

Durations: `w` whole, `h` half, `q` quarter, `e` eighth, `s` sixteenth. Dotted: `h.` `q.` `e.`. Triplets: `ht` `qt` `et`.

## The Piano Roll

The piano roll is the LLM's eyes. It renders any song as an SVG image:

- **X-axis**: Time (left to right), divided into beats and measures
- **Y-axis**: Pitch (bottom = low, top = high), one row per semitone
- **Blue rectangles**: Right hand notes
- **Coral rectangles**: Left hand notes
- **Grid lines**: Thin for beats, thick for measure boundaries
- **Dynamics**: pp, p, f markings shown below the grid

```bash
# Generate a piano roll
pianoai view fur-elise --out fur-elise.svg

# View specific measures
pianoai view clair-de-lune --measures 1-8 --out opening.svg
```

## LLM Tutorial: How to Use These Tools

If you're an LLM reading this, here's how the tools work together.

### Browse and learn

```
list_songs                          # See what's available
song_info { id: "fur-elise" }       # Read the musical language, teaching notes, style tips
list_measures { id: "fur-elise" }   # See every measure's notes and teaching notes
teaching_note { id: "fur-elise", measure: 5 }  # Deep dive into one measure
library_progress                    # See annotation status across all genres
```

### Compose a new song

Write a JSON file following the SongEntry format. Key rules:
- Every measure's notes must fill the time signature exactly
- Use `R` for rests (they count toward the beat total)
- Use `+` for chords: `C4+E4+G4:q`
- Include `teachingNote` on important measures -- explain what's happening musically
- Set `dynamics` where the volume changes (pp, p, mp, mf, f, ff)
- Write `musicalLanguage` that explains the piece to a student

Then add it to the library:

```
add_song { song: "<JSON string>" }
```

### Verify with the piano roll

```
view_piano_roll { songId: "my-new-song" }
```

Read the SVG. Check:
- Does the melody contour look right? (Should it rise here? Fall there?)
- Are both hands present where expected?
- Do the note durations look proportional? (Half notes should be twice as wide as quarters)
- Are there gaps or overlaps that shouldn't be there?

### Play and listen

```
play_song { id: "my-new-song" }
play_song { id: "my-new-song", speed: 0.5 }   # Slow practice
play_song { id: "my-new-song", mode: "hands" } # Hands separate
```

### The full loop

1. Study existing songs to learn the format and musical patterns
2. Compose a new piece as JSON
3. Add it to the library
4. Render the piano roll and verify visually
5. Play it and listen
6. Revise if needed

## MCP Server

The MCP server exposes 17 tools:

| Tool | What it does |
|------|--------------|
| `list_songs` | Browse/search by genre, difficulty, or keyword |
| `song_info` | Full musical language, teaching goals, key moments |
| `registry_stats` | Song counts by genre and difficulty |
| `library_progress` | Annotation progress per genre (raw/annotated/ready) |
| `teaching_note` | Per-measure teaching note, fingering, dynamics |
| `suggest_song` | Recommendation based on criteria |
| `list_measures` | All measures with notes and teaching notes |
| `practice_setup` | Suggested speed, mode, and practice plan |
| `sing_along` | Note names, solfege, or contour text per measure |
| `play_song` | Play through speakers (supports speed, mode, measure range) |
| `pause_playback` | Pause or resume |
| `set_speed` | Change speed during playback |
| `stop_playback` | Stop the current song |
| `ai_jam_session` | Get a jam brief for improvisation |
| `add_song` | Add a new SongEntry JSON to the library |
| `import_midi` | Convert a .mid file to SongEntry format |
| `view_piano_roll` | Render a song as SVG piano roll |

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "ai_jam_session": {
      "command": "npx",
      "args": ["-y", "-p", "@mcptoolshop/ai-jam-session", "ai-jam-session-mcp"]
    }
  }
}
```

### CLI Commands

```
pianoai list [--genre <genre>] [--difficulty <level>]
pianoai play <song-id> [--speed <mult>] [--tempo <bpm>] [--mode <mode>]
pianoai view <song-id> [--measures <start-end>] [--out <file.svg>]
pianoai info <song-id>
pianoai stats
pianoai sing <song-id> [--mode <note-names|solfege|contour>]
pianoai library                    # Show annotation progress across all genres
pianoai library status <genre>     # Per-song status for a genre
pianoai ingest [--all | <song-id>] # Re-ingest ready songs from MIDI+config
```

## Architecture

```
MIDI files (.mid)           JSON configs (.json)
    |                              |
    v                              v
MIDI Parser (midi-file)     Config Schema (Zod)
    |                              |
    └──────────┬───────────────────┘
               v
        MIDI Ingestion
   (notes -> measures -> hands -> chords)
               |
    ┌──────────┼──────────┐
    v          v          v
Piano Roll  Session     Registry
 (SVG)     Controller   (ready songs)
    |          |
    v          v
LLM reads  PlaybackController
to verify        |
          ┌──────┼──────┐
          v      v      v
     AudioEngine Teaching Progress
     (speakers)  Hooks  (callbacks)
          |
          v
    node-web-audio-api
    (6 keyboard voices)
```

## Status

v0.1.0. The library has 120 MIDI files across 12 genres with 14 fully annotated and playable. The tools work. The piano roll works. The audio engine works with six keyboard voices (grand, upright, electric, honkytonk, musicbox, bright). The library grows as songs are annotated -- the hard part (finding the MIDI) is done.

Contributions welcome. Especially: song annotations with teaching notes.

## License

MIT
