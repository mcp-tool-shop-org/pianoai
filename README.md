<p align="center">
  <strong>English</strong> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo-banner.png" alt="AI Jam Sessions" width="520" />
</p>

<p align="center">
  <em>Machine Learning the Old Fashioned Way</em>
</p>

<p align="center">
  An MCP server that teaches AI to play piano — and sing.<br/>
  120 songs across 12 genres. Five sound engines. A browser cockpit with its own vocal synthesizer.<br/>
  A practice journal that remembers everything.
</p>

[![CI](https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@mcptoolshop/ai-jam-sessions)](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions)
[![Songs](https://img.shields.io/badge/songs-120_across_12_genres-blue)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)
[![Ready](https://img.shields.io/badge/annotated-24-green)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)

---

## What is this?

A piano that AI learns to play. Not a synthesizer, not a MIDI library — a teaching instrument.

An LLM can read and write text, but it can't experience music the way we do. No ears, no fingers, no muscle memory. AI Jam Sessions closes that gap by giving the model senses it can actually use:

- **Reading** — real MIDI sheet music with deep musical annotations. Not hand-written approximations — parsed, analyzed, and explained.
- **Hearing** — five audio engines (oscillator piano, sample piano, vocal samples, physical vocal tract, additive vocal synth) that play through your speakers, so the humans in the room become the AI's ears.
- **Seeing** — a piano roll that renders what was played as SVG the model can read back and verify. A browser cockpit with a visual keyboard, dual-mode note editor, and tuning lab.
- **Remembering** — a practice journal that persists across sessions, so learning compounds over time.
- **Singing** — vocal tract synthesis with 20 voice presets, from operatic soprano to electronic choir. Sing-along mode with solfege, contour, and syllable narration.

Each of the 12 genres has a richly annotated exemplar — a reference piece the AI studies first, with historical context, bar-by-bar structural analysis, key moments, teaching goals, and performance tips. The other 96 songs are raw MIDI, waiting for the AI to absorb the patterns, play the music, and write its own annotations.

## The Piano Roll

The piano roll is how the AI sees music. It renders any song as SVG — blue for right hand, coral for left, with beat grids, dynamics, and measure boundaries:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Two color modes: **hand** (blue/coral) or **pitch-class** (chromatic rainbow — every C is red, every F# is cyan). The SVG format means the model can both see the image and read the markup to verify pitch, rhythm, and hand independence.

## The Cockpit

A browser-based instrument and vocal studio that opens alongside the MCP server. No plugins, no DAW — just a web page with a piano.

- **Dual-mode piano roll** — switch between Instrument mode (chromatic pitch-class colors) and Vocal mode (notes colored by vowel shape: /a/ /e/ /i/ /o/ /u/)
- **Visual keyboard** — two octaves from C4, mapped to your QWERTY keyboard. Click or type.
- **20 voice presets** — 15 Kokoro-mapped voices (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, plus choir and synth-vox), 4 tract-mapped voices, and a synthetic choir section
- **10 instrument presets** — the 6 server-side piano voices plus synth-pad, organ, bell, and strings
- **Note inspector** — click any note to edit velocity, vowel, and breathiness
- **7 tuning systems** — Equal temperament, just intonation (major/minor), Pythagorean, quarter-comma meantone, Werckmeister III, or custom cent offsets. Adjustable A4 reference (392–494 Hz).
- **Tuning audit** — frequency table, interval tester with beat-frequency analysis, and tuning export/import
- **Score import/export** — serialize the entire score as JSON and load it back
- **LLM-facing API** — `window.__cockpit` exposes `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()`, and `getScore()` so an LLM can compose, arrange, and play back programmatically

## The Learning Loop

```
 Read                 Play                See                 Reflect
┌──────────┐     ┌───────────┐     ┌────────────┐     ┌──────────────┐
│ Study the │     │ Play the  │     │ View the   │     │ Write what   │
│ exemplar  │ ──▶ │ song at   │ ──▶ │ piano roll │ ──▶ │ you learned  │
│ analysis  │     │ any speed │     │ to verify  │     │ in journal   │
└──────────┘     └───────────┘     └────────────┘     └──────┬───────┘
                                                             │
                                                             ▼
                                                    ┌──────────────┐
                                                    │ Next session  │
                                                    │ picks up here │
                                                    └──────────────┘
```

## The Song Library

120 songs across 12 genres, built from real MIDI files. Each genre has one deeply annotated exemplar — with historical context, bar-by-bar harmonic analysis, key moments, teaching goals, and performance tips (including vocal guidance). These exemplars serve as templates: the AI studies one, then annotates the rest.

| Genre | Exemplar | Key | What it teaches |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | B minor | Minor blues form, call-and-response, playing behind the beat |
| Classical | Für Elise (Beethoven) | A minor | Rondo form, touch differentiation, pedaling discipline |
| Film | Comptine d'un autre été (Tiersen) | E minor | Arpeggiated textures, dynamic architecture without harmonic change |
| Folk | Greensleeves | E minor | 3/4 waltz feel, modal mixture, Renaissance vocal style |
| Jazz | Autumn Leaves (Kosma) | G minor | ii-V-I progressions, guide tones, swing eighths, rootless voicings |
| Latin | The Girl from Ipanema (Jobim) | F major | Bossa nova rhythm, chromatic modulation, vocal restraint |
| New-Age | River Flows in You (Yiruma) | A major | I-V-vi-IV recognition, flowing arpeggios, rubato |
| Pop | Imagine (Lennon) | C major | Arpeggiated accompaniment, restraint, vocal sincerity |
| Ragtime | The Entertainer (Joplin) | C major | Oom-pah bass, syncopation, multi-strain form, tempo discipline |
| R&B | Superstition (Stevie Wonder) | Eb minor | 16th-note funk, percussive keyboard, ghost notes |
| Rock | Your Song (Elton John) | Eb major | Piano ballad voice-leading, inversions, conversational singing |
| Soul | Lean on Me (Bill Withers) | C major | Diatonic melody, gospel accompaniment, call-and-response |

Songs progress from **raw** (MIDI only) → **annotated** → **ready** (fully playable with musical language). The AI promotes songs by studying them and writing annotations with `annotate_song`.

## Sound Engines

Five engines, plus a layered combinator that runs any two simultaneously:

| Engine | Type | What it sounds like |
|--------|------|---------------------|
| **Oscillator Piano** | Additive synthesis | Multi-harmonic piano with hammer noise, inharmonicity, 48-voice polyphony, stereo imaging. Zero dependencies. |
| **Sample Piano** | WAV playback | Salamander Grand Piano — 480 samples, 16 velocity layers, 88 keys. The real thing. |
| **Vocal (Sample)** | Pitch-shifted samples | Sustained vowel tones with portamento and legato mode. |
| **Vocal Tract** | Physical model | Pink Trombone — LF glottal waveform through a 44-cell digital waveguide. Four presets: soprano, alto, tenor, bass. |
| **Vocal Synth** | Additive synthesis | 15 Kokoro voice presets with formant shaping, breathiness, vibrato. Deterministic (seeded RNG). |
| **Layered** | Combinator | Wraps two engines and dispatches every MIDI event to both — piano+synth, vocal+synth, etc. |

### Keyboard Voices

Six tunable piano voices, each adjustable per-parameter (brightness, decay, hammer hardness, detune, stereo width, and more):

| Voice | Character |
|-------|-----------|
| Concert Grand | Rich, full, classical |
| Upright | Warm, intimate, folk |
| Electric Piano | Silky, jazzy, Fender Rhodes feel |
| Honky-Tonk | Detuned, ragtime, saloon |
| Music Box | Crystalline, ethereal |
| Bright Grand | Cutting, contemporary, pop |

## The Practice Journal

After every session, the server captures what happened — which song, what speed, how many measures, how long. The AI adds its own reflections: what it noticed, what patterns it recognized, what to try next.

```markdown
---
### 14:32 — Autumn Leaves
**jazz** | intermediate | G minor | 69 BPM × 0.7 | 32/32 measures | 45s

The ii-V-I in bars 5-8 (Cm7-F7-BbMaj7) is the same gravity as the V-i
in The Thrill Is Gone, just in major. Blues and jazz share more than the
genre labels suggest.

Next: try at full speed. Compare the Ipanema bridge modulation with this.
---
```

One markdown file per day, stored in `~/.pianoai/journal/`. Human-readable, append-only. Next session, the AI reads its journal and picks up where it left off.

## Install

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

Requires **Node.js 18+**. No MIDI drivers, no virtual ports, no external software.

### Claude Desktop / Claude Code

```json
{
  "mcpServers": {
    "ai_jam_sessions": {
      "command": "npx",
      "args": ["-y", "-p", "@mcptoolshop/ai-jam-sessions", "ai-jam-sessions-mcp"]
    }
  }
}
```

## MCP Tools

24 tools across four categories:

### Learn

| Tool | What it does |
|------|--------------|
| `list_songs` | Browse by genre, difficulty, or keyword |
| `song_info` | Full musical analysis — structure, key moments, teaching goals, style tips |
| `registry_stats` | Library-wide stats: total songs, genres, difficulties |
| `library_progress` | Annotation status across all genres |
| `list_measures` | Every measure's notes, dynamics, and teaching notes |
| `teaching_note` | Deep dive into a single measure — fingering, dynamics, context |
| `suggest_song` | Recommendation based on genre, difficulty, and what you've played |
| `practice_setup` | Recommended speed, mode, voice settings, and CLI command for a song |

### Play

| Tool | What it does |
|------|--------------|
| `play_song` | Play through speakers — library songs or raw .mid files. Any engine, speed, mode, measure range. |
| `stop_playback` | Stop |
| `pause_playback` | Pause or resume |
| `set_speed` | Change speed mid-playback (0.1×–4.0×) |
| `playback_status` | Real-time snapshot: current measure, tempo, speed, keyboard voice, state |
| `view_piano_roll` | Render as SVG (hand color or pitch-class chromatic rainbow) |

### Sing

| Tool | What it does |
|------|--------------|
| `sing_along` | Singable text — note-names, solfege, contour, or syllables. With or without piano accompaniment. |
| `ai_jam_sessions` | Generate a jam brief — chord progression, melody outline, and style hints for reinterpretation |

### Build

| Tool | What it does |
|------|--------------|
| `add_song` | Add a new song as JSON |
| `import_midi` | Import a .mid file with metadata |
| `annotate_song` | Write musical language for a raw song and promote it to ready |
| `save_practice_note` | Journal entry with auto-captured session data |
| `read_practice_journal` | Load recent entries for context |
| `list_keyboards` | Available keyboard voices |
| `tune_keyboard` | Adjust any parameter of any keyboard voice. Persists across sessions. |
| `get_keyboard_config` | Current config vs factory defaults |
| `reset_keyboard` | Factory reset a keyboard voice |

## CLI

```
pianoai list [--genre <genre>] [--difficulty <level>]
pianoai play <song-id> [--speed <mult>] [--mode <mode>] [--engine <piano|vocal|tract|synth|piano+synth>]
pianoai sing <song-id> [--with-piano] [--engine <engine>]
pianoai view <song-id> [--measures <start-end>] [--out <file.svg>]
pianoai info <song-id>
pianoai stats
pianoai library
pianoai ports
```

## Status

v0.2.0. Five sound engines, 24 MCP tools, 120 songs across 12 genres with deeply annotated exemplars. Browser cockpit with 20 vocal presets, 10 instrument voices, 7 tuning systems, and an LLM-facing score API. Piano roll visualization in two color modes. Practice journal for persistent learning. The MIDI is all there — the library grows as the AI learns.

## License

MIT
