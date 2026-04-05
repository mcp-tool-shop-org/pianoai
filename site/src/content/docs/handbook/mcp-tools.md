---
title: MCP tools reference
description: All 34 MCP tools organized by category — Learn, Play, Sing, Guitar, Build, and Score.
sidebar:
  order: 4
---

AI Jam Sessions exposes 34 tools through the Model Context Protocol, organized into six categories.

## Learn (9 tools)

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

## Play (6 tools)

Tools for audio playback and visualization.

| Tool | Description |
|------|-------------|
| `play_song` | Play through speakers — library songs or raw .mid files. Any engine, speed, mode, measure range |
| `stop_playback` | Stop playback |
| `pause_playback` | Pause or resume |
| `set_speed` | Change speed mid-playback (0.1x to 4.0x) |
| `playback_status` | Real-time snapshot: current measure, tempo, speed, keyboard voice, state |
| `view_piano_roll` | Render as SVG — hand color mode (blue/coral) or pitch-class chromatic rainbow |

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

## Build (9 tools)

Tools for adding songs, writing annotations, journaling, and keyboard tuning.

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

## Score (2 tools)

Tools for evaluating performances and annotation quality.

| Tool | Description |
|------|-------------|
| `score_performance` | Score a MIDI play-along against a library song — pitch accuracy, timing, completeness, with graded feedback and practice suggestions |
| `score_annotation` | Score annotation quality across 5 dimensions — completeness, depth, specificity, teaching value, and musical vocabulary |
