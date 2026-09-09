---
title: Songs and genres
description: The fully annotated 108-song library, what ships and what you fetch, 12 genre exemplars, and how the annotation loop works.
sidebar:
  order: 3
---

## The library

108 annotated songs across 12 genres, built from real MIDI files. Fourteen of the MIDI files ship in the package; the other 94 are fetched from their source sites with one command (see the end of this page). Songs progress through three states:

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
- `annotation_progress` — annotation status across all genres
- `suggest_song` — recommendation based on genre, difficulty, and play history

## Annotation workflow

All 108 songs are now fully annotated — written by AI through this exact loop, gated by a quality rubric, and fact-checked against the actual MIDI. The same workflow promotes any newly imported song from raw to ready:

1. Use `song_info` or `list_measures` to examine the raw MIDI data
2. Study the genre exemplar for context and teaching patterns
3. Use `annotate_song` to write musical language — harmonic analysis, key moments, teaching goals
4. Use `score_annotation` to grade it; the song progresses from raw to ready once it clears the quality bar

## Measure-level inspection

- `list_measures` — every measure's notes, dynamics, and existing teaching notes
- `teaching_note` — deep dive into a single measure with fingering, dynamics, and musical context

## Transposition

Transpose any song up or down by semitones using `transpose_song`. The tool shifts all notes and updates the key signature automatically. Useful for matching a singer's range or practicing in different keys.

## Section markers

Songs can have structural section markers (Intro, Verse, Chorus, Bridge, Coda) for navigation and teaching. Use `list_sections` to view them and `add_section` to annotate song structure.

## Practice setup

Before playing, use `practice_setup` to get recommended speed, mode, voice settings, and the exact CLI command for a song. This factors in the song's difficulty and the AI's current skill level.

Use `mute_hand` to isolate left or right hand practice. Use `preview_teaching_cues` to see all teaching notes and key moments before playing.

## What ships, and what you fetch

The annotations are ours and ship with every song. The MIDI files were downloaded from public MIDI sites when the library was built, and a per-file provenance audit found that only 14 of them carry a licence that permits redistribution: Bernd Krueger's piano-midi.de arrangements (CC-BY-SA-3.0-DE) and the Mutopia Project's public-domain typesettings. Those 14 are in the npm package and in the repository. The other 94 are not. Each of their `.json` files carries a `provenance` block naming the source site, its terms and the file's SHA-256, and

```bash
ai-jam-sessions library fetch --accept-source-terms
```

downloads each one from the site that published it, under that site's terms, refusing any file whose hash no longer matches what the annotations were verified against. Until you fetch, those songs are listed as `unfetched` and the server plays the 14. Twelve files that turned out to be a different piece than their name were quarantined, which is why the library is 108 songs and not the 120 earlier versions claimed. The full audit is in the repository at `docs/findings/library-provenance-audit.md`.
