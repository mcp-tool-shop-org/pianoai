<p align="center">
  <strong>English</strong> | <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português</a>
</p>

<p align="center">
  <img src="logo.png" alt="AI Jam Sessions logo" width="180" />
</p>

<h1 align="center">AI Jam Sessions</h1>

<p align="center">
  <em>Machine Learning the Old Fashioned Way</em>
</p>

<p align="center">
  An MCP server that teaches AI to play piano — and sing.<br/>
  120 songs. 12 genres. Real MIDI. Piano + vocal tract synthesis. A practice journal that remembers everything.
</p>

[![CI](https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml/badge.svg)](https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml)
[![Songs](https://img.shields.io/badge/songs-120_across_12_genres-blue)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)
[![Ready](https://img.shields.io/badge/ready_to_play-24-green)](https://github.com/mcp-tool-shop-org/ai-jam-sessions)

---

## What is this?

A piano that AI learns to play. Not a synthesizer, not a MIDI library -- a teaching instrument.

An LLM can read text and write text. But it can't experience music the way we do -- no ears, no eyes, no muscle memory. AI Jam Sessions closes that gap by giving the model senses it can actually use:

- **Reading** -- real MIDI sheet music with teaching annotations, not hand-written approximations
- **Hearing** -- piano and vocal engines that play through your speakers, so the humans in the room become the AI's ears
- **Seeing** -- a piano roll that renders what was played as an SVG the model can read back and verify
- **Remembering** -- a practice journal that persists across sessions, so learning compounds over time

Every genre has one annotated exemplar -- a reference piece the AI studies before tackling the rest. The other 96 songs are raw MIDI, waiting for the AI to learn the patterns, play the music, and write its own annotations. Each session builds on the last.

## The Piano Roll

This is how the AI sees music. The piano roll renders any song as an SVG -- blue for right hand, coral for left, with beat grids, dynamics, and measure boundaries:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Fur Elise, measures 1-8 -- the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Most piano rolls are playback animations designed for human producers. This one is built for AI. The SVG format means the model can both *see* it as an image and *read* the source markup to verify pitch accuracy, hand independence, and rhythm. It's not a visualization -- it's a feedback loop.

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

120 songs across 12 genres, built from real MIDI files. Each genre has one fully annotated exemplar -- a reference piece the AI studies before tackling the rest.

| Genre | Songs | Exemplar |
|-------|-------|----------|
| Classical | 10 ready | Fur Elise, Clair de Lune, Moonlight Sonata... |
| R&B | 4 ready | Superstition (Stevie Wonder) |
| Jazz | 1 ready | Autumn Leaves |
| Blues | 1 ready | The Thrill Is Gone (B.B. King) |
| Pop | 1 ready | Imagine (John Lennon) |
| Rock | 1 ready | Your Song (Elton John) |
| Soul | 1 ready | Lean on Me (Bill Withers) |
| Latin | 1 ready | The Girl from Ipanema |
| Film | 1 ready | Comptine d'un autre ete (Yann Tiersen) |
| Ragtime | 1 ready | The Entertainer (Scott Joplin) |
| New-Age | 1 ready | River Flows in You (Yiruma) |
| Folk | 1 ready | Greensleeves |

Songs progress from **raw** (MIDI only) to **ready** (fully annotated and playable). The AI promotes songs by studying them and writing annotations with `annotate_song`.

## The Practice Journal

The journal is how the AI remembers. After playing a song, the server captures what happened -- which song, what speed, how many measures, how long. The AI adds its own reflections: what it noticed, what patterns it recognized, what to try next.

```markdown
---
### 14:32 — Autumn Leaves
**jazz** | intermediate | G minor | 69 BPM x 0.7x | 32/32 measures | 45s

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

### Learn

| Tool | What it does |
|------|--------------|
| `list_songs` | Browse by genre, difficulty, or keyword |
| `song_info` | Musical analysis, teaching goals, style tips |
| `library_progress` | Annotation status across all genres |
| `list_measures` | Every measure's notes and teaching notes |
| `teaching_note` | Deep dive into a single measure |

### Play

| Tool | What it does |
|------|--------------|
| `play_song` | Play through speakers (speed, mode, measure range, engine, voice) |
| `stop_playback` | Stop the current song |
| `pause_playback` | Pause or resume |
| `set_speed` | Change speed mid-playback |
| `view_piano_roll` | Render song as SVG piano roll |

### Remember

| Tool | What it does |
|------|--------------|
| `save_practice_note` | Write a journal entry (session data auto-captured) |
| `read_practice_journal` | Load recent entries for context |
| `annotate_song` | Promote a raw song to ready (the AI's homework) |

## Engines

Two playback engines, switchable per song:

| Engine | What it is |
|--------|------------|
| `piano` | Sample-based piano (6 keyboard voices: grand, upright, electric, honkytonk, musicbox, bright) |
| `tract` | Physical vocal tract model (Pink Trombone). Monophonic — sings the melody line. |

The tract engine has four voice presets:

| Voice | Tract | Transpose | Character |
|-------|-------|-----------|-----------|
| `soprano` | 36 cells (female) | +0 | Bright, clear head voice |
| `alto` | 38 cells (female) | +0 | Warm, relaxed |
| `tenor` | 44 cells (male) | -12 | Solid chest voice |
| `bass` | 44 cells (male) | -24 | Deep, resonant (Onyx-like) |

## CLI

```
pianoai list [--genre <genre>] [--difficulty <level>]
pianoai play <song-id> [--speed <mult>] [--mode <mode>] [--engine <piano|tract>] [--tract-voice <voice>]
pianoai view <song-id> [--measures <start-end>] [--out <file.svg>]
pianoai info <song-id>
pianoai library
```

## Status

v0.1.1. 120 MIDI files across 12 genres. 24 songs fully annotated and playable (one exemplar per genre + 10 classical + 4 R&B). Practice journal for persistent learning across sessions. Six keyboard voices + vocal tract synthesis (Pink Trombone) with four voice presets (soprano, alto, tenor, bass). The MIDI is all there -- the library grows as the AI learns.

## License

MIT
