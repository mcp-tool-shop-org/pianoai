# AI Jam Sessions

*Machine Learning the Old Fashioned Way*

An MCP server that teaches AI to play piano — and sing. 120 songs across 12 genres, five sound engines, a browser cockpit with 20 vocal presets, and a practice journal that remembers everything.

---

## The idea

You don't learn music from a textbook. You learn it by sitting at a piano, playing something badly, listening to what went wrong, and trying again. AI Jam Sessions gives an LLM the same experience — not simulated, not abstracted, but real audio through real speakers with real feedback.

The model reads annotated sheet music. It plays through one of five sound engines. It sees what it played rendered as a piano roll. It writes down what it learned. Next session, it picks up where it left off.

Every genre has one deeply annotated exemplar — a reference piece with historical context, bar-by-bar harmonic analysis, key moments, teaching goals, and performance tips. The AI studies the exemplar, then annotates the remaining songs on its own. The library grows as the model learns.

## What's inside

### Five sound engines

| Engine | How it works |
|--------|--------------|
| **Oscillator Piano** | Additive synthesis — multi-harmonic piano with hammer noise, inharmonicity stretching, 48-voice polyphony. No samples, no dependencies. |
| **Sample Piano** | Salamander Grand — 480 WAV samples, 16 velocity layers, 88 keys. As real as it gets without a Steinway. |
| **Vocal (Sample)** | Sustained vowel tones pitch-shifted via playback rate. Monophonic legato with portamento. |
| **Vocal Tract** | Pink Trombone — physical model with LF glottal waveform and 44-cell digital waveguide. Four presets: soprano, alto, tenor, bass. |
| **Vocal Synth** | Additive synthesis with 15 Kokoro voice presets. Formant shaping, breathiness, vibrato. Deterministic output. |

The **Layered Engine** wraps any two and dispatches every MIDI event to both — piano+synth, vocal+synth, whatever combination you want.

Six tunable keyboard voices (grand, upright, electric, honky-tonk, music box, bright), each adjustable per-parameter: brightness, decay, hammer hardness, detune, stereo width, volume, release, rolloff, attack.

### 120 songs, 12 genres

Blues, classical, film, folk, jazz, Latin, new-age, pop, ragtime, R&B, rock, soul. Ten songs per genre, all from real MIDI files. Each genre's exemplar has been annotated with:

- Historical and compositional context
- Bar-by-bar structural analysis with chord progressions
- Five specific key moments with pedagogical explanations
- Five teaching goals covering theory, technique, and form
- Five performance tips including vocal guidance

These annotations aren't summaries — they're lessons. The blues exemplar explains why minor blues sounds different from major, what the turnaround feels like, and how to sing behind the beat. The jazz exemplar walks through ii-V-I voice leading, guide tones, rootless voicings, and why Billie Holiday sounds better than Barbra Streisand on a jazz standard. Every genre gets this treatment.

### The browser cockpit

A full instrument studio that runs in your browser alongside the MCP server:

- **Dual-mode piano roll** — Instrument mode (chromatic pitch-class colors) or Vocal mode (notes colored by vowel: /a/ /e/ /i/ /o/ /u/)
- **Visual keyboard** — QWERTY-mapped, two octaves from C4
- **20 voice presets** — 15 Kokoro-mapped (American/British, male/female, from bright soprano to deep bass), 4 physical tract voices, plus choir and synth-vox
- **10 instrument presets** — 6 piano voices plus synth-pad, organ, bell, and strings
- **Note inspector** — click any note to edit velocity, vowel shape, and breathiness
- **7 tuning systems** — equal temperament, just intonation (major/minor), Pythagorean, quarter-comma meantone, Werckmeister III, custom cent offsets. Adjustable A4 reference pitch.
- **Tuning audit** — frequency table, interval tester with beat-frequency analysis
- **Score import/export** — full JSON serialization, bidirectional
- **LLM API** — `window.__cockpit` exposes `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()`, `getScore()` for programmatic composition

### 24 MCP tools

**Learn:** `list_songs`, `song_info`, `registry_stats`, `library_progress`, `list_measures`, `teaching_note`, `suggest_song`, `practice_setup`

**Play:** `play_song`, `stop_playback`, `pause_playback`, `set_speed`, `playback_status`, `view_piano_roll`

**Sing:** `sing_along` (note-names, solfege, contour, syllables — with or without piano), `ai_jam_sessions` (jam briefs)

**Build:** `add_song`, `import_midi`, `annotate_song`, `save_practice_note`, `read_practice_journal`, `list_keyboards`, `tune_keyboard`, `get_keyboard_config`, `reset_keyboard`

### The practice journal

One markdown file per day in `~/.ai-jam-sessions/journal/`. After every session, the server logs what happened (song, speed, measures, duration). The AI writes its own reflections — what patterns it noticed, what to try next. Next session, it reads the journal and picks up where it left off. Learning compounds.

### Piano roll visualization

SVG renderer with two color modes: **hand** (blue right hand, coral left hand) or **pitch-class** (chromatic rainbow). Beat grids, measure boundaries, dynamics markings, octave labels. The model can see it as an image and read the SVG markup to verify accuracy.

---

## Quick start

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

Node.js 18+. No MIDI drivers, no virtual ports, no extra software.

### Claude Desktop / Claude Code

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

### CLI

```
ai-jam-sessions list [--genre jazz] [--difficulty beginner]
ai-jam-sessions play autumn-leaves --speed 0.7 --engine piano
ai-jam-sessions sing autumn-leaves --with-piano
ai-jam-sessions view fur-elise --measures 1-8 --out roll.svg
ai-jam-sessions info imagine
ai-jam-sessions stats
ai-jam-sessions library
```

---

## Links

- [GitHub](https://github.com/mcp-tool-shop-org/ai-jam-sessions)
- [npm](https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions)
- [MCP Tool Shop](https://github.com/mcp-tool-shop-org)

## License

MIT
