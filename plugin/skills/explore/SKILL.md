---
description: Browse and discover piano songs in the library. Use when the user wants to find songs by genre, difficulty, or description, or wants to see what is available.
argument-hint: "[genre, difficulty, or search query]"
---

# Song Explorer

Help the student discover songs in the AI Jam Session library.

## Steps

1. **Interpret the request.** Parse "$ARGUMENTS" to determine if the student is
   looking for a specific genre, difficulty level, or general search.

2. **Search the library.** Call `list_songs` with the appropriate filters:
   - Genre filter if they mentioned a genre (jazz, classical, rock, blues, etc.)
   - Difficulty filter if they mentioned a level (beginner, intermediate, advanced)
   - Query string for free-text search (matches title, composer, tags, description)
   - No filters to show everything

3. **Show the results.** Present songs in a clear format: title, composer, genre,
   difficulty, and number of measures. Group by genre or difficulty if showing
   many songs.

4. **Get registry stats.** Call `registry_stats` to show the overall library:
   how many songs total, songs per genre, songs per difficulty.

5. **Make a recommendation.** If the student seems undecided, call `suggest_song`
   with their stated preferences to give a specific recommendation with
   teaching goals.

6. **Offer next steps.** Once they pick a song, suggest:
   - `/ai-jam-sessions:teach <song-id>` for a full teaching session
   - `/ai-jam-sessions:practice <song-id>` for a practice plan
   - The `song_info` tool for detailed musical analysis

## Tone

Be enthusiastic about the music. Share interesting facts about composers or
genres when relevant. Help the student find something they will enjoy playing.
