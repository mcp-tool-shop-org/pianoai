---
title: For Beginners
description: New to AI Jam Sessions? Start here for a gentle introduction.
sidebar:
  order: 99
---

## What is this tool?

AI Jam Sessions is an MCP server that teaches AI to play piano and guitar — and sing. It gives a language model the ability to read sheet music (MIDI), play it through real sound engines on your speakers, see what it played as a visual piano roll, and write reflections in a practice journal that persists between sessions.

It is not a synthesizer or a MIDI library. It is a teaching instrument — the AI learns music the same way a human student would: study, play, listen, reflect, repeat.

## Who is this for?

- **AI enthusiasts** who want to explore what happens when you give an LLM musical senses
- **Music educators** interested in AI-assisted music learning
- **Developers** building MCP-based tools who want a rich, creative reference implementation
- **Anyone** who wants to hear their AI assistant play piano, guitar, or sing

No music theory knowledge is required — the tool includes deeply annotated exemplars that explain everything.

## Prerequisites

- **Node.js 18+** — check with `node --version`
- **npm** — included with Node.js
- **An MCP client** — Claude Desktop, Claude Code, Cursor, or VS Code with MCP support
- **Speakers or headphones** — the AI plays music out loud

No MIDI hardware, virtual ports, or external audio software is needed.

## Your First 5 Minutes

### 1. Install

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

### 2. Configure your MCP client

Add this to your Claude Desktop config (`claude_desktop_config.json`):

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

### 3. Ask Claude to play something

In Claude Desktop, try:

> "Play Fur Elise for me"

Claude will use the `play_song` tool to play Beethoven's Fur Elise through your speakers using the oscillator piano engine.

### 4. Explore the library

> "What songs do you know? Show me jazz songs."

Claude will use `list_songs` to browse the 120-song library. Try asking about a specific song for its full musical analysis.

### 5. Try the CLI directly

```bash
# List all songs
ai-jam-sessions list

# Play a song at half speed
ai-jam-sessions play fur-elise --speed 0.5

# View a piano roll
ai-jam-sessions view fur-elise --measures 1-8

# Check library stats
ai-jam-sessions stats
```

## Common Mistakes

1. **No sound output** — The audio plays through your system's default audio device. Make sure your speakers/headphones are connected and volume is up. The MCP server uses stdio transport (no HTTP), so audio comes from the server process, not the browser.

2. **Confusing the six engines** — The default is the oscillator piano. If you want realistic piano, ask for the "sample piano" engine. For singing, specify "vocal synth" or "vocal tract." Each engine sounds very different.

3. **Expecting the AI to "know" music already** — The AI reads MIDI data and annotations, it doesn't have musical intuition. The learning loop (study exemplar, play, view piano roll, journal) is how it builds understanding. Start with annotated exemplars, not raw MIDI.

4. **Skipping the practice journal** — The journal is what makes learning persistent. Without it, every session starts from zero. Ask the AI to save practice notes after each session.

5. **Wrong MCP config** — The server binary is `ai-jam-sessions-mcp`, not `ai-jam-sessions`. The latter is the CLI. Make sure your MCP config uses the correct binary name.

## Next Steps

- **[Getting Started](../getting-started/)** — Full installation and CLI reference
- **[Instruments](../instruments/)** — All six sound engines, piano voices, and guitar presets
- **[Songs and Genres](../songs-and-genres/)** — The 120-song library and annotation workflow
- **[MCP Tools](../mcp-tools/)** — Complete tool reference
- **[Browser Cockpit](../browser-cockpit/)** — The visual keyboard, tuning lab, and practice journal

## Glossary

| Term | Definition |
|------|-----------|
| **MCP** | Model Context Protocol — lets AI assistants call tools like this music server |
| **MIDI** | Musical Instrument Digital Interface — a format for representing musical notes digitally |
| **Exemplar** | A deeply annotated reference song for each genre, with historical context and teaching goals |
| **Piano roll** | A visual representation of music as colored blocks on a time/pitch grid |
| **Engine** | A sound synthesis method (oscillator piano, sample piano, vocal, guitar, etc.) |
| **Voice** | A preset configuration for an engine (e.g., Concert Grand, Honky-Tonk, Nylon Classical) |
| **Tablature** | Guitar notation showing finger positions on strings instead of standard musical notation |
| **Practice journal** | Daily markdown files storing what the AI played and its reflections |
| **Annotation** | Musical language added to raw MIDI — structure, key moments, teaching notes |
| **Layered** | A combinator engine that plays two engines simultaneously (e.g., piano + vocal synth) |
