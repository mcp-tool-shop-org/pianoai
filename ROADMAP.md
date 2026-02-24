# AI Jam Sessions — Roadmap

What's next to make this feel less like a developer utility and more like a music companion.

## Done ✓

- [x] **Fix name mismatch** — `pianoai` → `ai-jam-sessions` everywhere (155 references, 27 files)
- [x] **Auto-open visuals** — Piano roll SVG and guitar tab HTML open in system browser automatically
- [x] **SIGINT handler** — Ctrl+C gracefully stops playback instead of killing the process
- [x] **`--difficulty` filter** — `ai-jam-sessions list --difficulty beginner` works in CLI
- [x] **Duration estimate** — Shows `~2m 15s` before library song playback starts
- [x] **Auto-save journal** — Every CLI play session writes to `~/.ai-jam-sessions/journal/`
- [x] **Fix ports command** — Actually lists available MIDI ports (was a stub)
- [x] **Guitar tab MCP parity** — `view_guitar_tab` returns tab overview text so LLM can see the arrangement
- [x] **README tool count** — Updated 24 → 31, added guitar engine/tab references

---

## Tier 2 — Warmth & Delight

### Now Playing Display
Live note/chord names scrolling during playback, not just a percentage bar.
- Show current chord detection inline (chord-detect.ts already exists)
- Display note names as they play: `C4 E4 G4 → Cmaj`
- Use ANSI colors matching the piano roll palette
- **Effort:** Medium — hook into teaching system's `onMeasureStart`, add chord-detect output to progress line

### Suggested Next Song
After playback ends, suggest what to practice next based on genre, difficulty, and play history.
- "You just played a jazz ballad at 70% speed. Try 'misty' next — same genre, one step harder."
- Factor in journal data (don't suggest songs already mastered)
- **Effort:** Medium — query registry by genre/difficulty, read journal stats, rank candidates

### Tempo Ramping in Loop Mode
Auto-increase speed each loop iteration — the way real practice works.
- Start at user-specified speed, bump 5% each pass until target (default: 1.0)
- `--ramp` flag on CLI, `ramp` option on MCP `play_song`
- Visual indicator: `Loop 3/∞ @ 0.85x → 0.90x`
- **Effort:** Medium — modify session loop logic, add ramp state tracking

### Metronome Count-In
1 bar of clicks before playback starts.
- Synthesize click using existing AudioContext (short sine burst at beat frequency)
- `--count-in` flag (default on for loop mode)
- Visual: `🎵 1 — 2 — 3 — 4 —` then playback begins
- **Effort:** Low-Medium — create count-in function in audio-engine, call before session.play()

### Interactive Playback Controls
Transform passive listening into active practice.
- Space = pause/resume
- Left/Right arrow = skip measure backward/forward
- Up/Down = speed ±0.05
- `q` = quit cleanly
- Requires raw terminal mode (`process.stdin.setRawMode(true)`)
- **Effort:** Medium — stdin keypress listener, wire to session.pause/skip/setSpeed

### Default Preferences File
`~/.ai-jam-sessions/config.json` — stop typing `--keyboard upright` every time.
- Default engine, keyboard voice, guitar voice per genre
- Default speed, mode, count-in preference
- `ai-jam-sessions config set engine guitar` / `config show` / `config reset`
- **Effort:** Medium — JSON read/write, merge into CLI/MCP option resolution

### Play History & Stats
Track what you've practiced and how you've improved.
- Read journal entries, aggregate: songs played, total time, speed progression per song
- `ai-jam-sessions history` — show last 10 sessions
- `ai-jam-sessions progress <song-id>` — speed over time graph (ASCII sparkline)
- "You've played Autumn Leaves 7 times this week, averaging 80% speed (up from 60%)"
- **Effort:** Medium — journal parsing + aggregation, new CLI commands

---

## Tier 3 — Deeper Musical Experience

### Transposition (`--key`)
Play everything in a different key — essential for singers and horn players.
- `ai-jam-sessions play autumn-leaves --key Bb` transposes all notes
- Apply semitone offset at note-parser level (before MIDI number conversion)
- Update piano roll and guitar tab to reflect transposed pitches
- MCP tool: add `key` parameter to `play_song`
- **Effort:** Medium — semitone math is simple, but touches note-parser, piano-roll, guitar-tab, session

### A/B Comparison
Play a phrase slow, then at tempo — hear the difference side by side.
- `ai-jam-sessions compare <song-id> --measures 5-8 --speeds 0.5,1.0`
- Plays the passage at each speed sequentially, with a brief pause between
- MCP tool: `compare_passage` with songId, measures, speeds array
- **Effort:** Medium — orchestrate multiple session.play() calls

### Spoken Teaching (TTS)
The voice/aside hooks already produce structured directives — pipe them to TTS.
- Integrate with system TTS (`say` on macOS, `espeak` on Linux, SAPI on Windows)
- Or use a lightweight JS TTS library (e.g., `say.js`)
- Queue directives during playback, speak between phrases
- **Effort:** Medium-High — TTS integration, audio mixing/timing, platform detection

### Learning Path Engine
Curated progressions: "Jazz Beginner → 8 songs in order."
- Define learning paths in JSON: ordered song lists with mastery criteria
- Track mastery per song: speed milestones (70% → 85% → 100%), repetition count
- `ai-jam-sessions path jazz-beginner` — show current position, next song, progress %
- MCP tool: `learning_path` — returns current path status, next recommended song
- Auto-advance when journal shows consistent plays at target speed
- **Effort:** High — new data model, path definitions, mastery tracking, persistence

---

## Priority Order

If picking the next 5 to build:

1. **Metronome count-in** — every musician expects it, low effort
2. **Interactive playback controls** — transforms passive → active practice
3. **Suggested next song** — creates progression feeling
4. **Now Playing display** — makes playback visually rich
5. **Tempo ramping** — the most natural practice pattern

The Tier 3 items (transposition, TTS, learning paths) are individually larger and benefit from the Tier 2 infrastructure being in place first.
