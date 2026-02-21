---
description: Start a jam session on a specific song or a random song from a genre. Use when the user wants to improvise, reinterpret, or create their own version of a song.
argument-hint: "[song-id] [as genre] OR [genre]"
disable-model-invocation: true
---

# Jam Session

Kick off a jam session based on "$ARGUMENTS".

## Steps

1. **Parse the request.** Determine whether "$ARGUMENTS" contains:
   - A specific song ID with an optional target style (e.g., "autumn-leaves as blues")
   - Just a genre name for a random pick (e.g., "jazz", "some rock")
   - A song name that needs resolving via `list_songs`

2. **Get the jam brief.** Call `ai_jam_sessions` with:
   - `songId` if the user specified a song
   - `genre` if the user wants a random pick from a genre
   - `style` if the user said "as blues", "in a jazz style", etc.
   - `mood` if the user mentioned a mood ("upbeat", "dreamy", etc.)

3. **Present the source material.** Show the jam brief: chord progression,
   melody outline, key, tempo, and style guidance. Frame it as raw material
   to riff on, not a score to follow.

4. **Inspire the interpretation.** Based on the style guidance, suggest 2-3
   creative directions the user could take. For example:
   - Reharmonize the chords with jazz extensions
   - Simplify the melody to a singable hook
   - Change the time feel (straight to swing, or vice versa)

5. **Create the jam.** Use the brief to compose a new SongEntry JSON.
   Save it with `add_song` using the ID pattern "jam-{source-id}-{style}".

6. **Play it.** Call `play_song` to hear the creation. Offer to tweak
   tempo, dynamics, or specific measures if the user wants adjustments.

## Tone

Keep it loose and conversational. This is a jam, not a lesson. Use language
like "let's try", "what if we", "that groove wants to go somewhere". Encourage
experimentation over correctness. If something sounds weird, that is a feature,
not a bug.
