---
title: Browser cockpit
description: The browser-based instrument cockpit, practice journal, and tuning lab.
sidebar:
  order: 5
---

## The cockpit

A browser-based instrument and vocal studio that lives in the repo at `apps/cockpit`. No plugins, no DAW — just a web page with a piano roll you can click into, play into, and edit like a real composition tool: beat-accurate transport with a time-ruler and loop regions, record-arm capture with count-in, full undo/redo, multi-select and clipboard, touch support.

**[▶ Launch the cockpit](/ai-jam-sessions/cockpit/)** — it runs entirely in your browser; nothing is installed and nothing leaves your machine. The default piano is the real thing: recorded [Salamander Grand Piano](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html) samples by Alexander Holm (CC-BY 3.0), with a synth fallback while they load. Your work autosaves locally (localStorage) between visits — but autosave needs persistent storage: in a private/incognito window, or when storage is full, the cockpit will tell you saving is blocked, and your work lasts only until the tab closes (use **Export JSON** to keep it).

Prefer to hack on it? Run it from a clone:

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions/apps/cockpit
npm install && npm run dev    # Vite dev server, opens in your browser
```

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

## The Composition Panel

The cockpit's third header mode (beside **Instr** and **Vocal**) is a listening room: it ranks the composition engine's accompaniments by ear, under real listening-test discipline, using your speakers as the measurement instrument.

### By ear — the blind A/B audition

Pick songs, press **Start run**, and the panel builds a seeded, shuffled trial list. Each trial gives you three buttons — **Reference** (the tune alone), **A**, and **B** — where A and B are the same melody over two different accompaniment voicings, blind. You vote for whichever backing fits the tune.

The honesty machinery under it:

- **Loudness-matched clips.** Every clip is rendered offline through the cockpit's real voice path (the sampled grand when loaded, the synth otherwise), and the louder side is attenuated so the pair matches within 0.5 dB — a merely-louder voicing can't win for the wrong reason. The measured offsets are stored in the run record.
- **Floor catch-trials.** Some trials blindly pit a valid voicing against a theory-invalid floor. Mis-pick the floor too often (more than 15%) and the run screens you; if even screened votes can't separate valid from floor, the run is **UNINTERPRETABLE** — a first-class outcome that says the votes can't rank the systems, not an error.
- **Honest rankings.** Votes aggregate into a Bradley-Terry ranking with bootstrap confidence intervals. The ranking stays **PROVISIONAL** until every pair reaches its vote budget (15 votes; ~66 per pair is the stable bar for four systems). One listener is labeled what it is — *your blind preference* — and three or more independent listeners is *the robust claim*.

Keyboard: **1**/**2** switch A↔B at the same playhead, **Space** play/pause, **Esc** stop, **R** reference, **Enter** votes the clip you're hearing.

### Local models — the directional panel

The second sub-mode runs the same ranking with locally installed LLM judges over Ollama — one seat per model family, never the composition engine's own lineage, never embedding models or cloud-routed tags. A judge that fails mid-run is marked unusable for the rest of that run; its cast votes stay, and nothing is ever substituted in its name. The result is directional only — local models judging note-names can't hear the music.

**History** lists both kinds of stored runs. **Compare** answers the panel's real question: pick one human run and one LLM run and it reports Kendall τ and whether the engine lands at the same rank — does the cheap proxy track the human truth? A provisional or uninterpretable human side is named for what it is.

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
| `setMode()` | Switch between instrument, vocal, and panel mode |
| `getScore()` | Get current score without serializing |
| `samplerState()` | The sampled Concert Grand's load state (`idle` / `loading` / `ready` / `failed`) |

## Practice journal

After every session, the server captures what happened — which song, what speed, how many measures, how long. The AI adds its own reflections: what it noticed, what patterns it recognized, what to try next.

Journal entries are stored as one markdown file per day in `~/.ai-jam-sessions/journal/`. They are human-readable and append-only.

### Journal tools

- `save_practice_note` — write a journal entry with auto-captured session data (song, speed, measures, duration)
- `read_practice_journal` — load recent entries so the AI can pick up where it left off

### How the AI uses the journal

At the start of each session, the AI reads its recent journal entries. This gives it context about what it has been practicing, what patterns it noticed, and what it planned to work on next. Learning compounds across sessions rather than starting from scratch each time.
