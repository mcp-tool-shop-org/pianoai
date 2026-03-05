---
title: Browser cockpit
description: The browser-based instrument cockpit, practice journal, and tuning lab.
sidebar:
  order: 5
---

## The cockpit

A browser-based instrument and vocal studio that opens alongside the MCP server. No plugins, no DAW — just a web page with a piano.

### Dual-mode piano roll

Switch between two visualization modes:

- **Instrument mode** — chromatic pitch-class colors (every C is red, every F-sharp is cyan)
- **Vocal mode** — notes colored by vowel shape (/a/ /e/ /i/ /o/ /u/)

### Visual keyboard

Two octaves from C4, mapped to your QWERTY keyboard. Click or type to play notes.

### Voice presets

**20 voice presets:**
- 15 Kokoro-mapped voices: Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, plus choir and synth-vox
- 4 tract-mapped voices (soprano, alto, tenor, bass)
- 1 synthetic choir section

**10 instrument presets:**
- 6 server-side piano voices (Concert Grand, Upright, Electric Piano, Honky-Tonk, Music Box, Bright Grand)
- Plus synth-pad, organ, bell, and strings

### Note inspector

Click any note in the piano roll to edit its velocity, vowel shape, and breathiness in real time.

### Score import/export

Serialize the entire score as JSON and load it back. Use this to save compositions, share them, or feed them to another tool.

## Tuning lab

### Seven tuning systems

| System | Description |
|--------|-------------|
| Equal temperament | Standard 12-tone equal temperament |
| Just intonation (major) | Pure intervals tuned to the overtone series, major mode |
| Just intonation (minor) | Pure intervals tuned to the overtone series, minor mode |
| Pythagorean | Tuning based on pure perfect fifths |
| Quarter-comma meantone | Historical temperament favoring pure major thirds |
| Werckmeister III | Well temperament allowing all keys with varying color |
| Custom | User-defined cent offsets for each pitch class |

The A4 reference pitch is adjustable from 392 Hz to 494 Hz.

### Tuning audit

- **Frequency table** — see the exact frequency of every note in the current tuning
- **Interval tester** — play two notes and see beat-frequency analysis
- **Export/import** — save and load tuning configurations as JSON

## LLM-facing API

The cockpit exposes `window.__cockpit` for programmatic control by an LLM:

| Method | Description |
|--------|-------------|
| `exportScore()` | Serialize current score as JSON |
| `importScore()` | Load a score from JSON |
| `addNote()` | Add a note to the score |
| `play()` | Start playback |
| `stop()` | Stop playback |
| `panic()` | All notes off (emergency stop) |
| `setMode()` | Switch between instrument and vocal mode |
| `getScore()` | Get current score without serializing |

## Practice journal

After every session, the server captures what happened — which song, what speed, how many measures, how long. The AI adds its own reflections: what it noticed, what patterns it recognized, what to try next.

Journal entries are stored as one markdown file per day in `~/.ai-jam-sessions/journal/`. They are human-readable and append-only.

### Journal tools

- `save_practice_note` — write a journal entry with auto-captured session data (song, speed, measures, duration)
- `read_practice_journal` — load recent entries so the AI can pick up where it left off

### How the AI uses the journal

At the start of each session, the AI reads its recent journal entries. This gives it context about what it has been practicing, what patterns it noticed, and what it planned to work on next. Learning compounds across sessions rather than starting from scratch each time.
