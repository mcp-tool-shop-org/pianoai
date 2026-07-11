<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="logo-banner.png" alt="AI Jam Sessions" width="520" />
</p>

<p align="center">
  <em>Machine Learning the Old Fashioned Way</em>
</p>

<p align="center">
  An MCP server that teaches AI to play piano and guitar — and sing.<br/>
  120 songs across 12 genres. Six sound engines. Interactive guitar tablature.<br/>
  A browser cockpit with vocal synthesizer. A practice journal that remembers everything.
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/@mcptoolshop/ai-jam-sessions"><img src="https://img.shields.io/npm/v/@mcptoolshop/ai-jam-sessions" alt="npm"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/songs-120_across_12_genres-blue" alt="Songs"></a>
  <a href="https://github.com/mcp-tool-shop-org/ai-jam-sessions"><img src="https://img.shields.io/badge/annotated-120%2F120-green" alt="Ready"></a>
  <a href="datasets/jam-actions-v0-public/README.md"><img src="https://img.shields.io/badge/dataset-jam--actions--v0%20(115_records)-8b5cf6" alt="Training dataset"></a>
  <a href="https://doi.org/10.5281/zenodo.20279918"><img src="https://zenodo.org/badge/DOI/10.5281/zenodo.20279918.svg" alt="DOI"></a>
</p>

---

## What is this?

A piano and guitar that AI learns to play. Not a synthesizer, not a MIDI library — a teaching instrument.

An LLM can read and write text, but it can't experience music the way we do. No ears, no fingers, no muscle memory. AI Jam Sessions closes that gap by giving the model senses it can actually use:

- **Reading** — real MIDI sheet music with deep musical annotations. Not hand-written approximations — parsed, analyzed, and explained.
- **Hearing** — six audio engines (oscillator piano, sample piano, vocal samples, physical vocal tract, additive vocal synth, physically-modeled guitar) that play through your speakers, so the humans in the room become the AI's ears.
- **Seeing** — a piano roll that renders what was played as SVG the model can read back and verify. An interactive guitar tablature editor. A browser cockpit with a visual keyboard, dual-mode note editor, and tuning lab.
- **Remembering** — a practice journal that persists across sessions, so learning compounds over time.
- **Singing** — vocal tract synthesis with 20 voice presets, from operatic soprano to electronic choir. Sing-along mode with solfege, contour, and syllable narration.

Every one of the 120 songs is now fully annotated — historical context, bar-by-bar structural analysis, key moments, teaching goals, and performance tips, in all 12 genres. An earlier version of this README said the raw songs were "waiting for the AI to absorb the patterns, play the music, and write its own annotations." That is exactly what happened: the annotations were written by AI against a deterministic per-song analysis (chords, repetition structure, section boundaries, content-verified keys), gated by a quality rubric, and adversarially fact-checked claim by claim — measure numbers, chord windows, and structural counts all verified against the actual MIDI before anything shipped.

Out of this same work, we also publish **[jam-actions-v0](#training-dataset)** — a public dataset of 115 multi-turn MCP tool-use traces over real classical piano. It teaches LLMs to do *grounded tool-use over symbolic music*, not just text generation, and ships with a 7-axis release gate that distinguishes "passing on evidence" from "passing because the task is trivial." See [Training Dataset](#training-dataset) below for the full story.

## The Piano Roll

The piano roll is how the AI sees music. It renders any song as SVG — blue for right hand, coral for left, with beat grids, dynamics, and measure boundaries:

<p align="center">
  <img src="docs/fur-elise-m1-8.svg" alt="Piano roll of Fur Elise measures 1-8, showing right hand (blue) and left hand (coral) notes" width="100%" />
</p>

<p align="center"><em>Für Elise, measures 1–8 — the E5-D#5 trill in blue, bass accompaniment in coral</em></p>

Two color modes: **hand** (blue/coral) or **pitch-class** (chromatic rainbow — every C is red, every F# is cyan). The SVG format means the model can both see the image and read the markup to verify pitch, rhythm, and hand independence.

## The Cockpit

A browser-based composition studio that lives in this repo at [`apps/cockpit`](apps/cockpit) — and runs live at **[mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/)**. No plugins, no DAW, no install; everything stays in your browser (your work autosaves locally). Prefer to hack on it?

```bash
cd apps/cockpit && npm install && npm run dev   # Vite dev server, opens in your browser
```

- **Beat-accurate transport** — notes live in musical time, so the BPM control actually retimes playback; a click-to-seek time-ruler with drag-to-set **loop regions**; auto-scroll that follows the playhead
- **Record-arm capture** — play the QWERTY keys, on-screen keyboard, or a Web MIDI device and it lands in the score: 1-bar count-in, looper-style overdub across loop cycles (or replace mode), raw performance timing preserved under a quantized view, each pass one undoable unit
- **Full undo/redo** — every edit including Clear and Import is reversible (Ctrl+Z), with drag gestures coalescing the way real editors do
- **Multi-select + clipboard** — marquee selection under a Select/Draw tool toggle, platform-standard modifier clicks, copy/cut/paste-at-playhead, Duplicate
- **Touch + accessibility** — pointer events with capture on every surface, tap-to-relocate as a non-drag alternative, keyboard note editing, colorblind-safe scored overlays
- **Dual-mode piano roll** — switch between Instrument mode (chromatic pitch-class colors) and Vocal mode (notes colored by vowel shape: /a/ /e/ /i/ /o/ /u/)
- **Visual keyboard** — two octaves from C4, mapped to your QWERTY keyboard. Click or type.
- **20 voice presets** — 15 Kokoro-mapped voices (Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, plus choir and synth-vox), 4 tract-mapped voices, and a synthetic choir section
- **10 instrument presets** — the 6 server-side piano voices plus synth-pad, organ, bell, and strings
- **Note inspector** — click any note to edit velocity, vowel, and breathiness
- **7 tuning systems** — Equal temperament, just intonation (major/minor), Pythagorean, quarter-comma meantone, Werckmeister III, or custom cent offsets. Adjustable A4 reference (392–494 Hz).
- **Tuning audit** — frequency table, interval tester with beat-frequency analysis, and tuning export/import
- **Score import/export** — serialize the entire score as JSON and load it back
- **LLM-facing API** — `window.__cockpit` exposes `exportScore()`, `importScore()`, `addNote()`, `play()`, `stop()`, `panic()`, `setMode()`, and `getScore()` so an LLM can compose, arrange, and play back programmatically

## The Learning Loop

<p align="center">
  <img src="docs/learning-loop.svg" alt="The learning loop: Read (MIDI + annotations) → Play (six sound engines) → See (piano roll · guitar tab) → Reflect (practice journal), with the journal persisting so the next session picks up where the last left off" width="100%" />
</p>

## The Song Library

120 songs across 12 genres, built from real MIDI files. Each genre has one deeply annotated exemplar — with historical context, bar-by-bar harmonic analysis, key moments, teaching goals, and performance tips (including vocal guidance). These exemplars serve as templates: the AI studies one, then annotates the rest.

| Genre | Exemplar | Key | What it teaches |
|-------|----------|-----|-----------------|
| Blues | The Thrill Is Gone (B.B. King) | B minor | Minor blues form, call-and-response, playing behind the beat |
| Classical | Für Elise (Beethoven) | A minor | Rondo form, touch differentiation, pedaling discipline |
| Film | Comptine d'un autre été (Tiersen) | E minor | Arpeggiated textures, dynamic architecture without harmonic change |
| Folk | Greensleeves | E minor | 3/4 waltz feel, modal mixture, Renaissance vocal style |
| Jazz | Autumn Leaves (Kosma) | G minor | ii-V-I progressions, guide tones, swing eighths, rootless voicings |
| Latin | The Girl from Ipanema (Jobim) | F major | Bossa nova rhythm, chromatic modulation, vocal restraint |
| New-Age | River Flows in You (Yiruma) | A major | I-V-vi-IV recognition, flowing arpeggios, rubato |
| Pop | Imagine (Lennon) | C major | Arpeggiated accompaniment, restraint, vocal sincerity |
| Ragtime | The Entertainer (Joplin) | C major | Oom-pah bass, syncopation, multi-strain form, tempo discipline |
| R&B | Superstition (Stevie Wonder) | Eb minor | 16th-note funk, percussive keyboard, ghost notes |
| Rock | Your Song (Elton John) | Eb major | Piano ballad voice-leading, inversions, conversational singing |
| Soul | Lean on Me (Bill Withers) | C major | Diatonic melody, gospel accompaniment, call-and-response |

Songs progress from **raw** (MIDI only) → **annotated** → **ready** (fully playable with musical language). The AI promotes songs by studying them and writing annotations with `annotate_song`.

## Sound Engines

Six engines, plus a layered combinator that runs any two simultaneously:

| Engine | Type | What it sounds like |
|--------|------|---------------------|
| **Oscillator Piano** | Additive synthesis | Multi-harmonic piano with hammer noise, inharmonicity, 48-voice polyphony, stereo imaging. Zero dependencies. |
| **Sample Piano** | WAV playback | Salamander Grand Piano — 480 samples, 16 velocity layers, 88 keys. The real thing. *Programmatic API only: samples are not shipped (you supply the [Salamander](https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html) download); not yet wired into the CLI/MCP engine lists.* |
| **Vocal (Sample)** | Pitch-shifted samples | Sustained vowel tones with portamento and legato mode. |
| **Vocal Tract** | Physical model | Pink Trombone — LF glottal waveform through a 44-cell digital waveguide. Four presets: soprano, alto, tenor, bass. |
| **Vocal Synth** | Additive synthesis | 15 Kokoro voice presets with formant shaping, breathiness, vibrato. Deterministic (seeded RNG). |
| **Guitar** | Additive synthesis | Physically-modeled plucked string — 4 presets (steel dreadnought, nylon classical, jazz archtop, twelve-string), 8 tunings, 17 tunable parameters. |
| **Layered** | Combinator | Wraps two engines and dispatches every MIDI event to both — piano+synth, vocal+synth, etc. |

### Keyboard Voices

Six tunable piano voices, each adjustable per-parameter (brightness, decay, hammer hardness, detune, stereo width, and more):

| Voice | Character |
|-------|-----------|
| Concert Grand | Rich, full, classical |
| Upright | Warm, intimate, folk |
| Electric Piano | Silky, jazzy, Fender Rhodes feel |
| Honky-Tonk | Detuned, ragtime, saloon |
| Music Box | Crystalline, ethereal |
| Bright Grand | Cutting, contemporary, pop |

### Guitar Voices

Four guitar voice presets with physically-modeled string synthesis, each with 17 tunable parameters (brightness, body resonance, pluck position, string damping, and more):

| Voice | Character |
|-------|-----------|
| Steel Dreadnought | Bright, balanced, classic acoustic |
| Nylon Classical | Warm, soft, rounded |
| Jazz Archtop | Mellow, woody, clean |
| Twelve-String | Shimmering, doubled, chorus-like |

## The Practice Journal

After every session, the server captures what happened — which song, what speed, how many measures, how long. The AI adds its own reflections: what it noticed, what patterns it recognized, what to try next.

```markdown
---
### 14:32 — Autumn Leaves
**jazz** | intermediate | G minor | 69 BPM × 0.7 | 32/32 measures | 45s

The ii-V-I in bars 5-8 (Cm7-F7-BbMaj7) is the same gravity as the V-i
in The Thrill Is Gone, just in major. Blues and jazz share more than the
genre labels suggest.

Next: try at full speed. Compare the Ipanema bridge modulation with this.
---
```

One markdown file per day, stored in `~/.ai-jam-sessions/journal/`. Human-readable, append-only. Next session, the AI reads its journal and picks up where it left off.

## Training Dataset

**jam-actions-v0** — a public dataset of multi-turn MCP tool-use traces grounded in real classical-piano MIDI. Built from the same library this server teaches with, the dataset teaches LLMs to do **grounded tool-use over symbolic music** — not just text generation.

Each record pairs a 4-measure phrase window with an annotated teaching target and a *target trace* — a turn-by-turn session in which an assistant uses the MCP tools above (`get_events_in_measure`, `get_events_in_hand`, `count_distinct_pitch_classes`, and the rest of the 9-tool MIDI inspector surface) to read, analyze, and discuss the phrase.

| | |
|---|---|
| **DOI** | [**`10.5281/zenodo.20279918`**](https://doi.org/10.5281/zenodo.20279918) — concept DOI, resolves to the latest published version (v0.5.0: [`10.5281/zenodo.21313954`](https://doi.org/10.5281/zenodo.21313954), published 2026-07-11) |
| Records | 115 (public subset) |
| Canonical baseline | 16-record post-repair E3 |
| Compositions | 8 classical piano works across 6 composers (Bach, Beethoven, Chopin, Debussy, Mozart, Schumann) |
| Source MIDI | piano-midi.de — Bernd Krueger arrangements |
| License | CC-BY-SA-3.0-DE (arrangements) over public-domain compositions |
| Version | 0.5.0 (2026-07-11) — Bach BWV 846 correction release, errata 001 + 002 |
| Schema | `release-gate-assessment/2.0.0` |

**Quality story — the 7-axis release gate.** The dataset ships with a release gate that distinguishes evidence-grounded passing from ceiling-saturated passing. Axes 1–6 are blocking (absolute floor, margin compound, tool-use rate, correct-after-tool, misinterpretation count, stratum floor); axis 7 is enriched-vs-non reporting. Axes 2 and 6 admit a `ceiling_saturated_pass` bucket so records that score 1.000 across text-only / tool-inspected / random-MIDI conditions don't dilute the harder strata. The Slice 22 baseline **PASSES** the revised gate. The Slice 19 baseline still **FAILS** it — kept as a regression diagnostic so the gate has teeth.

**Reproducibility.** A fresh contributor on any platform (Windows native, macOS, Linux, WSL) can verify the package and reproduce the canonical PASS verdict in under a minute:

```bash
git clone https://github.com/mcp-tool-shop-org/ai-jam-sessions.git
cd ai-jam-sessions && pnpm install
pnpm exec tsx scripts/verify-public-package-checksums.ts        # 274 entries, ~2s
pnpm build && pnpm exec tsx scripts/verify-public-package-execution.ts
# → "VERDICT: PASS" — every frozen tool call replays live (needs an audio device)
git show jam-actions-v0-feature-marketed-2026-05-19:datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json > /tmp/b.json
pnpm exec tsx scripts/check-release-gate.ts /tmp/b.json
# → "Aggregate: PASS" (exit 0) — the sealed baseline ships in the v0.4.3 deposit; v0.5.0 restores it from git history
```

`.gitattributes` pins LF line endings for `*.sha256` and the public-dataset tree so the checksum verifier works on every platform. The release-gate CLI is strict-positional (rejects unknown / multiple positional args) so cold-start contributors can't silently mis-invoke it.

**Where to find it.** The Zenodo record lives under concept DOI [`10.5281/zenodo.20279918`](https://doi.org/10.5281/zenodo.20279918) (always the latest version; v0.5.0 published 2026-07-11 at https://zenodo.org/records/21313954), and the dataset is mirrored on Hugging Face at [`mcp-tool-shop/jam-actions-v0`](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0) for `load_dataset()` consumers. The full dataset card is at [`datasets/jam-actions-v0-public/README.md`](datasets/jam-actions-v0-public/README.md). Zenodo deposition metadata is at [`zenodo-metadata.json`](datasets/jam-actions-v0-public/zenodo-metadata.json), citation metadata at [`CITATION.cff`](datasets/jam-actions-v0-public/CITATION.cff), the publication receipt at [`publication-receipt.json`](datasets/jam-actions-v0-public/publication-receipt.json), and release notes at [`RELEASE_NOTES.md`](datasets/jam-actions-v0-public/RELEASE_NOTES.md). The 25-slice build arc — from initial corpus draft through the off-by-one repair, the Schumann remediation, the RC-gate revision, the operator-aloneness audit, and the publication execution — lives in [`docs/`](docs/).

**Cite it.** `mcp-tool-shop-org & Krueger, B. (2026). AI Jam Sessions — Tool-Use Traces v0 (Public Subset). Zenodo. https://doi.org/10.5281/zenodo.20279918`

**Does it actually train anything? — the fine-tuning receipts.** The dataset's claims are tested the hard way: preregistered fine-tunes scored against its own sealed baseline, with the honesty rules frozen before any training. **v0** (the 78 jam traces alone) returned an *honest negative* — tool-grounded QA dropped 0.661 → 0.601 ([report](docs/finetune-arc-eval-report.md)). **v1** (a 494-example data pass adding execution-verified, grounding-shaped traces) moved the same metric 0.661 → **0.863** (+0.202, permutation p = 0.0043, all five seeds above baseline, the one unseen song +0.433) — and still ships as *"directionally better, underpowered"* because 12/16 paired wins missed the preregistered ≥13/16 victory bar by one ([report](docs/finetune-arc-v1-eval-report.md)). No adapter is published from a near-miss. Both arcs, locks, amendments, and per-seed receipts live in [`experiments/`](experiments/) — the discipline is the point.

> The MIDI arrangements are by Bernd Krueger (piano-midi.de), licensed CC-BY-SA-3.0-DE. The annotations, traces, and eval artifacts are by the AI Jam Sessions team, released under the same license so the share-alike chain is preserved end-to-end. **License boundary:** the repository's MIT license covers the code; everything under `datasets/` is CC-BY-SA-3.0-DE. The working corpus at `datasets/jam-actions-v0/` additionally contains two works (Satie Gymnopédie No. 1, Debussy Arabesque No. 1) that are *excluded* from the published subset because their arrangement provenance could not be verified — see [`datasets/jam-actions-v0/PROVENANCE-NOTE.md`](datasets/jam-actions-v0/PROVENANCE-NOTE.md).

## Install

```bash
npm install -g @mcptoolshop/ai-jam-sessions
```

Requires **Node.js 22+** (v2.0.0 raised the floor with `node-web-audio-api` 2.0). No MIDI drivers, no virtual ports, no external software.

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

## MCP Tools

46 tools and 3 prompt templates across seven categories:

### Learn

| Tool | What it does |
|------|--------------|
| `list_songs` | Browse by genre, difficulty, or keyword |
| `song_info` | Full musical analysis — structure, key moments, teaching goals, style tips |
| `registry_stats` | Library-wide stats: total songs, genres, difficulties |
| `list_measures` | Every measure's notes, dynamics, and teaching notes |
| `teaching_note` | Deep dive into a single measure — fingering, dynamics, context |
| `suggest_song` | Recommendation based on genre, difficulty, and what you've played |
| `practice_setup` | Recommended speed, mode, voice settings, and CLI command for a song |
| `compare_songs` | Cross-genre pattern recognition — key relationships, pitch/interval similarity, shared forms, teaching connections |
| `annotation_progress` | Track annotation quality across the library — scores, grades, and improvement suggestions |
| `server_info` | Server version, library stats, engine list, active session |

### Play

| Tool | What it does |
|------|--------------|
| `play_song` | Play through speakers — library songs or raw .mid files. Four engines (piano, vocal, tract, guitar), any speed, mode, measure range — plus a metronome with count-in and a `record` flag that captures the session for scoring. The synth and layered engines are CLI-only. |
| `stop_playback` | Stop |
| `pause_playback` | Pause or resume |
| `set_speed` | Change speed mid-playback (0.1×–4.0×) |
| `playback_status` | Real-time snapshot: current measure, tempo, speed, keyboard voice, state |
| `view_piano_roll` | Render as SVG (hand color or pitch-class chromatic rainbow) |
| `score_performance` | Score a MIDI play-along — pitch accuracy, timing, completeness, with graded feedback |
| `mute_hand` | Mute or unmute left/right hand during practice — isolate one hand at a time |
| `detect_chord` | Name the chord from a set of currently-sounding MIDI notes (e.g. `[60,64,67]` → C) |
| `preview_teaching_cues` | See all teaching notes and key moments before playing |

### Practice

| Tool | What it does |
|------|--------------|
| `practice_loop` | The drill a real teacher assigns: loop measures 5–8 slower, and the tempo ramps up (+5%) only after a *clean* pass — each pass recorded, scored, and summarized |
| `practice_status` | Where the drill stands: current pass, speed, and a per-measure diagnostic of the last take |
| `score_last_take` | Score the most recent recorded take — pitch accuracy, timing, completeness, per-note verdicts |
| `view_scored_piano_roll` | The marked-up score every teacher uses: the piano roll overlaid with per-note verdicts in a colorblind-safe palette (solid = correct, dashed = timing, ✕ = missed) |

### Sing

| Tool | What it does |
|------|--------------|
| `sing_along` | Singable text — note-names, solfege, contour, or syllables. With or without piano accompaniment. |
| `ai_jam_sessions` | Generate a jam brief — chord progression, melody outline, and style hints for reinterpretation |

### Guitar

| Tool | What it does |
|------|--------------|
| `view_guitar_tab` | Render interactive guitar tablature as HTML — click-to-edit, playback cursor, keyboard shortcuts |
| `list_guitar_voices` | Available guitar voice presets |
| `list_guitar_tunings` | Available guitar tuning systems (standard, drop-D, open G, DADGAD, etc.) |
| `tune_guitar` | Adjust any parameter of any guitar voice. Persists across sessions. |
| `get_guitar_config` | Current guitar voice config vs factory defaults |
| `reset_guitar` | Factory reset a guitar voice |

### Build

| Tool | What it does |
|------|--------------|
| `add_song` | Add a new song as JSON |
| `import_midi` | Import a .mid file with metadata |
| `annotate_song` | Write musical language for a raw song and promote it to ready |
| `save_practice_note` | Journal entry with auto-captured session data |
| `read_practice_journal` | Load recent entries for context |
| `list_keyboards` | Available keyboard voices |
| `tune_keyboard` | Adjust any parameter of any keyboard voice. Persists across sessions. |
| `get_keyboard_config` | Current config vs factory defaults |
| `reset_keyboard` | Factory reset a keyboard voice |
| `score_annotation` | Score annotation quality across 5 dimensions — completeness, depth, specificity, teaching value, vocabulary |
| `validate_song_entry` | Validate a song JSON against the schema before adding |
| `transpose_song` | Transpose a song up or down by semitones — new key, new notes |
| `list_sections` | View structural sections of a song (Intro, Verse, Chorus, etc.) |
| `add_section` | Add a section marker to a song for structural navigation |

### MCP Prompts

Three prompt templates for structured teaching workflows:

| Prompt | What it does |
|--------|--------------|
| `annotate_song` | Guided annotation workflow — study an exemplar, write musical language for a raw song |
| `practice_plan` | Build a structured practice plan based on genre, difficulty, and goals |
| `performance_review` | Review a completed session — what went well, what to focus on next |

## CLI

```
ai-jam-sessions list [--genre <genre>] [--difficulty <level>]
ai-jam-sessions play <song-id> [--speed <mult>] [--mode <mode>] [--engine <piano|vocal|tract|synth|guitar|piano+synth|guitar+synth>] [--metronome] [--count-in <bars>] [--record]
ai-jam-sessions practice <song-id> --measures <start-end> [--start-speed <pct>] [--target <pct>] [--step <pct>]
ai-jam-sessions sing <song-id> [--with-piano] [--engine <engine>]
ai-jam-sessions view <song-id> [--measures <start-end>] [--out <file.svg>]
ai-jam-sessions view-guitar <song-id> [--measures <start-end>] [--tuning <tuning>]
ai-jam-sessions info <song-id>
ai-jam-sessions tune <keyboard-id> [--param value ...] [--reset] [--show]
ai-jam-sessions tune-guitar <voice-id> [--param value ...] [--reset] [--show]
ai-jam-sessions keyboards
ai-jam-sessions guitars
ai-jam-sessions stats
ai-jam-sessions library
ai-jam-sessions ports
ai-jam-sessions help
ai-jam-sessions --version
```

## Status

v2.0.0 — the release where the dataset proved its discipline (see [CHANGELOG](CHANGELOG.md)). **Breaking: the Node.js floor is now 22** (`node-web-audio-api` 2.0); the tool surface itself is unchanged — six sound engines, 46 MCP tools, 3 prompt templates, and a **fully annotated library: 120/120 songs across 12 genres** (12 key fields corrected to content-detected keys this release). The teaching loop is closed end-to-end: metronome with count-in → live recording → per-note scoring → the marked-up scored piano roll → practice loops that ramp tempo only after clean passes. The browser cockpit is a real composition tool — beat-accurate transport with loop regions, record-arm capture, full undo/redo, multi-select and clipboard, touch support — [live on the web](https://mcp-tool-shop-org.github.io/ai-jam-sessions/cockpit/).

Also publishes **[jam-actions-v0](#training-dataset)** — a 115-record training dataset of multi-turn MCP tool-use traces over classical piano, with a 7-axis release gate, cold-start reproducibility, and full Zenodo + CITATION.cff metadata (CC-BY-SA-3.0-DE) — mirrored on [Hugging Face](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0), and now carrying **receipted fine-tuning results both ways**: an honest negative (v0) and a preregistration-disciplined positive that stopped one paired win short of its own victory bar (v1) — see the [fine-tuning receipts](#training-dataset). This release also fixes the Bach records at the source (working-set revisions r001/r002 with errata) after the v1 pipeline's execution gate caught the published window overshooting BWV 846's actual 62 measures. 2506 tests passing across the MCP server + cockpit + dataset packagers + eval harnesses + release-gate validator. The MIDI is all there, every song can teach, and the corpus of that learning ships with it.

## Security & Privacy

**Data touched:** song library (JSON + MIDI), user songs directory (`~/.ai-jam-sessions/songs/`), guitar tuning configs, practice journal entries, local audio output device.

**Data NOT touched (default paths):** the MCP server and CLI make no network calls, read no credentials, and touch no system files outside the user song directory. No telemetry is collected or sent. The **opt-in dataset/eval tooling** shipped in the same package (`scripts/run-llm-eval.ts`, provenance verifier) is the one exception: when you explicitly invoke it, it can call LLM APIs (reads `ANTHROPIC_API_KEY` from your environment, never stores it) and fetch provenance URLs. It never runs as part of the server, CLI, or install.

**Permissions:** MCP server uses stdio transport only (no HTTP). CLI accesses local filesystem and audio devices. See [SECURITY.md](SECURITY.md) for the full policy.

## License

MIT
