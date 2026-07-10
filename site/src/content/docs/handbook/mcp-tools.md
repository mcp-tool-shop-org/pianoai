---
title: MCP tools reference
description: All 46 MCP tools and 3 prompt templates organized by category — Learn, Play, Practice, Sing, Guitar, Build, and Score.
sidebar:
  order: 4
---

AI Jam Sessions exposes 46 tools and 3 prompt templates through the Model Context Protocol, organized into seven categories.

## Learn (10 tools)

Tools for exploring the song library and understanding music.

| Tool | Description |
|------|-------------|
| `list_songs` | Browse by genre, difficulty, or keyword |
| `song_info` | Full musical analysis — structure, key moments, teaching goals, style tips |
| `registry_stats` | Library-wide stats: total songs, genres, difficulties |
| `annotation_progress` | Annotation status across all genres — scores, grades, and improvement suggestions |
| `list_measures` | Every measure's notes, dynamics, and teaching notes |
| `teaching_note` | Deep dive into a single measure — fingering, dynamics, context |
| `suggest_song` | Recommendation based on genre, difficulty, and what you've played |
| `practice_setup` | Recommended speed, mode, voice settings, and CLI command for a song |
| `compare_songs` | Cross-genre pattern recognition — key relationships, pitch/interval similarity, shared forms, teaching connections |
| `server_info` | Server version, library stats, engine list, active session info |

## Play (9 tools)

Tools for audio playback and visualization.

| Tool | Description |
|------|-------------|
| `play_song` | Play through speakers — library songs or raw .mid files. Four engines (piano, vocal, tract, guitar), speed, mode, measure range, metronome with count-in, and a `record` flag that captures the session for scoring |
| `stop_playback` | Stop playback |
| `pause_playback` | Pause or resume |
| `set_speed` | Change speed mid-playback (0.1x to 4.0x) |
| `playback_status` | Real-time snapshot: current measure, tempo, speed, keyboard voice, state |
| `view_piano_roll` | Render as SVG — hand color mode (blue/coral) or pitch-class chromatic rainbow |
| `mute_hand` | Mute or unmute left/right hand during practice — isolate one hand at a time |
| `preview_teaching_cues` | See all teaching notes and key moments before playing |
| `detect_chord` | Name the chord from a set of currently-sounding MIDI notes (e.g. `[60, 64, 67]` → C) |

## Practice (4 tools)

The teaching loop: record a take, score it note by note, see the marked-up score, and drill the weak measures the way a real teacher assigns them.

| Tool | Description |
|------|-------------|
| `practice_loop` | Loop a measure range slower; every pass is recorded and scored, and the tempo ramps up (+5%) only after a clean pass |
| `practice_status` | Current pass, speed, and a per-measure diagnostic of the last take |
| `score_last_take` | Score the most recent recorded take — pitch accuracy, timing, completeness, per-note verdicts |
| `view_scored_piano_roll` | The piano roll overlaid with per-note verdicts in a colorblind-safe palette — solid for correct, dashed for timing, ✕ for missed |

## Sing (2 tools)

Tools for vocal performance and jam sessions.

| Tool | Description |
|------|-------------|
| `sing_along` | Singable text — note-names, solfege, contour, or syllables. With or without piano accompaniment |
| `ai_jam_sessions` | Generate a jam brief — chord progression, melody outline, and style hints for reinterpretation |

## Guitar (6 tools)

Tools for guitar tablature, voices, and tuning.

| Tool | Description |
|------|-------------|
| `view_guitar_tab` | Render interactive guitar tablature as HTML — click-to-edit, playback cursor, keyboard shortcuts |
| `list_guitar_voices` | Available guitar voice presets |
| `list_guitar_tunings` | Available guitar tuning systems (standard, drop-D, open G, DADGAD, etc.) |
| `tune_guitar` | Adjust any parameter of any guitar voice. Persists across sessions |
| `get_guitar_config` | Current guitar voice config vs factory defaults |
| `reset_guitar` | Factory reset a guitar voice |

## Build (13 tools)

Tools for adding songs, writing annotations, transposing, managing sections, journaling, and keyboard tuning.

| Tool | Description |
|------|-------------|
| `add_song` | Add a new song as JSON |
| `import_midi` | Import a .mid file with metadata |
| `annotate_song` | Write musical language for a raw song and promote it to ready |
| `save_practice_note` | Journal entry with auto-captured session data |
| `read_practice_journal` | Load recent entries for context |
| `list_keyboards` | Available keyboard voices |
| `tune_keyboard` | Adjust any parameter of any keyboard voice. Persists across sessions |
| `get_keyboard_config` | Current config vs factory defaults |
| `reset_keyboard` | Factory reset a keyboard voice |
| `validate_song_entry` | Validate a song JSON against the schema before adding |
| `transpose_song` | Transpose a song up or down by semitones — new key, new notes |
| `list_sections` | View structural sections of a song (Intro, Verse, Chorus, Bridge) |
| `add_section` | Add a section marker to a song for structural navigation |

## Score (2 tools)

Tools for evaluating performances and annotation quality.

| Tool | Description |
|------|-------------|
| `score_performance` | Score a MIDI play-along against a library song — pitch accuracy, timing, completeness, with graded feedback and practice suggestions |
| `score_annotation` | Score annotation quality across 5 dimensions — completeness, depth, specificity, teaching value, and musical vocabulary |

## MCP Prompts (3 templates)

Prompt templates for structured teaching workflows. These appear as available prompts in MCP clients.

| Prompt | Description |
|--------|-------------|
| `annotate_song` | Guided annotation workflow — study an exemplar, then write musical language for a raw song |
| `practice_plan` | Build a structured practice plan based on genre, difficulty, and learning goals |
| `performance_review` | Review a completed session — what went well, areas to focus on, suggested next steps |
