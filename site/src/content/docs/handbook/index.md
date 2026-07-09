---
title: Welcome
description: What AI Jam Sessions is and how it works.
sidebar:
  order: 0
---

AI Jam Sessions is an MCP server that teaches AI to play piano and guitar — and sing. It provides 120 songs across 12 genres, six sound engines, interactive guitar tablature, a browser cockpit with vocal synthesizer, and a practice journal that remembers everything.

It also ships **[jam-actions-v0](/ai-jam-sessions/handbook/training-dataset/)** — a public 115-record dataset of multi-turn MCP tool-use traces over classical piano, with a 7-axis release gate and full cold-start reproducibility. CC-BY-SA-3.0-DE.

## Why this exists

An LLM can read and write text, but it cannot experience music. No ears, no fingers, no muscle memory. AI Jam Sessions closes that gap by giving the model senses it can actually use:

- **Reading** — real MIDI sheet music with deep musical annotations, parsed, analyzed, and explained
- **Hearing** — six audio engines that play through your speakers, so the humans in the room become the AI's ears
- **Seeing** — piano rolls rendered as SVG that the model can read back and verify, plus interactive guitar tablature and a browser cockpit
- **Remembering** — a practice journal that persists across sessions, so learning compounds over time
- **Singing** — vocal tract synthesis with 20 voice presets, sing-along mode with solfege, contour, and syllable narration

## The learning loop

![The learning loop: Read → Play → See → Reflect, with the practice journal persisting so the next session picks up where the last left off](/ai-jam-sessions/learning-loop.svg)

The AI follows a structured cycle:

1. **Read** — study the exemplar analysis (historical context, harmonic structure, key moments, teaching goals)
2. **Play** — play the song at any speed through any engine
3. **See** — view the piano roll to verify what was played (pitch, rhythm, hand independence)
4. **Reflect** — write what it learned in the practice journal
5. **Continue** — next session picks up where this one left off

Each of the 12 genres has a richly annotated exemplar that serves as a reference piece. The other songs start as raw MIDI, and the AI promotes them by studying and writing its own annotations.

## What is in this handbook

- [Getting started](/ai-jam-sessions/handbook/getting-started/) — installation, Claude Desktop setup, first commands
- [Instruments](/ai-jam-sessions/handbook/instruments/) — piano voices, guitar presets, vocal engines, and the layered combinator
- [Songs and genres](/ai-jam-sessions/handbook/songs-and-genres/) — the 120-song library, 12 genre exemplars, and annotation workflow
- [MCP tools](/ai-jam-sessions/handbook/mcp-tools/) — all 42 tools and 3 prompt templates organized by category
- [Browser cockpit](/ai-jam-sessions/handbook/browser-cockpit/) — the cockpit UI, practice journal, and tuning lab
- [Training dataset](/ai-jam-sessions/handbook/training-dataset/) — jam-actions-v0, the 115-record MCP tool-use corpus, its 7-axis release gate, and how to reproduce the canonical PASS verdict
- [For beginners](/ai-jam-sessions/handbook/beginners/) — new to AI Jam Sessions? Start here
