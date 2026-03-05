---
title: Getting started
description: Install AI Jam Sessions and connect it to Claude Desktop or Claude Code.
sidebar:
  order: 1
---

## Requirements

- **Node.js 18+**
- No MIDI drivers, no virtual ports, no external software needed

## Install

Install globally from npm:

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

## Claude Desktop setup

Add the MCP server to your Claude Desktop configuration:

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

The server uses stdio transport only (no HTTP).

## Claude Code setup

For Claude Code, the same configuration applies. Add it to your MCP server settings and the 31 tools become available in your coding session.

## First commands

Once installed, try these from the command line:

```bash
# List all songs
ai-jam-sessions list

# Browse a genre
ai-jam-sessions list --genre jazz

# Get info on a specific song
ai-jam-sessions info fur-elise

# Play a song at 70% speed
ai-jam-sessions play fur-elise --speed 0.7

# View the piano roll
ai-jam-sessions view autumn-leaves --measures 1-16 --out roll.svg

# Check library stats
ai-jam-sessions stats
```

## CLI reference

```
ai-jam-sessions list [--genre <genre>] [--difficulty <level>]
ai-jam-sessions play <song-id> [--speed <mult>] [--mode <mode>] [--engine <engine>]
ai-jam-sessions sing <song-id> [--with-piano] [--engine <engine>]
ai-jam-sessions view <song-id> [--measures <start-end>] [--out <file.svg>]
ai-jam-sessions view-guitar <song-id> [--measures <start-end>] [--tuning <tuning>]
ai-jam-sessions info <song-id>
ai-jam-sessions stats
ai-jam-sessions library
ai-jam-sessions ports
```

### Engine options

Use the `--engine` flag with any of these values:

- `piano` — oscillator piano (default)
- `vocal` — pitch-shifted vocal samples
- `tract` — physical vocal tract model
- `synth` — additive vocal synth with Kokoro presets
- `guitar` — physically-modeled plucked string
- `piano+synth` — layered piano and synth together
- `guitar+synth` — layered guitar and synth together
