---
title: Songs and genres
description: The 120-song library, 12 genre exemplars, and how songs progress from raw to ready.
sidebar:
  order: 3
---

## The library

120 songs across 12 genres, built from real MIDI files. Songs progress through three states:

1. **Raw** — MIDI only, no annotations
2. **Annotated** — musical language has been written by the AI
3. **Ready** — fully playable with bar-by-bar analysis and teaching notes

## Genre exemplars

Each genre has one deeply annotated exemplar with historical context, bar-by-bar harmonic analysis, key moments, teaching goals, and performance tips (including vocal guidance). These serve as templates: the AI studies one, then annotates the rest.

| Genre | Exemplar | Key | What it teaches |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | B minor | Minor blues form, call-and-response, playing behind the beat |
| Classical | Fur Elise (Beethoven) | A minor | Rondo form, touch differentiation, pedaling discipline |
| Film | Comptine d'un autre ete (Tiersen) | E minor | Arpeggiated textures, dynamic architecture without harmonic change |
| Folk | Greensleeves | E minor | 3/4 waltz feel, modal mixture, Renaissance vocal style |
| Jazz | Autumn Leaves (Kosma) | G minor | ii-V-I progressions, guide tones, swing eighths, rootless voicings |
| Latin | The Girl from Ipanema (Jobim) | F major | Bossa nova rhythm, chromatic modulation, vocal restraint |
| New-Age | River Flows in You (Yiruma) | A major | I-V-vi-IV recognition, flowing arpeggios, rubato |
| Pop | Imagine (Lennon) | C major | Arpeggiated accompaniment, restraint, vocal sincerity |
| Ragtime | The Entertainer (Joplin) | C major | Oom-pah bass, syncopation, multi-strain form, tempo discipline |
| R&B | Superstition (Stevie Wonder) | Eb minor | 16th-note funk, percussive keyboard, ghost notes |
| Rock | Your Song (Elton John) | Eb major | Piano ballad voice-leading, inversions, conversational singing |
| Soul | Lean on Me (Bill Withers) | C major | Diatonic melody, gospel accompaniment, call-and-response |

## Browsing the library

Use the Learn tools to explore:

- `list_songs` — filter by genre, difficulty, or keyword
- `song_info` — full musical analysis for any song
- `registry_stats` — library-wide totals (songs, genres, difficulties)
- `library_progress` — annotation status across all genres
- `suggest_song` — recommendation based on genre, difficulty, and play history

## Annotation workflow

The AI promotes songs from raw to ready by studying them and writing annotations:

1. Use `song_info` or `list_measures` to examine the raw MIDI data
2. Study the genre exemplar for context and teaching patterns
3. Use `annotate_song` to write musical language — harmonic analysis, key moments, teaching goals
4. The song progresses from raw to annotated, then to ready once fully documented

## Measure-level inspection

- `list_measures` — every measure's notes, dynamics, and existing teaching notes
- `teaching_note` — deep dive into a single measure with fingering, dynamics, and musical context

## Practice setup

Before playing, use `practice_setup` to get recommended speed, mode, voice settings, and the exact CLI command for a song. This factors in the song's difficulty and the AI's current skill level.
