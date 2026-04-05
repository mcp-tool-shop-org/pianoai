# Changelog

All notable changes to AI Jam Sessions will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-04-05

### Changed
- **Package renamed** from `@mcptoolshop/ai-jam-sessions` to `ai-jam-sessions` (unscoped on npm)

### Added
- 190 new tests (392 → 582): songs loader, jam brief, library, playback controls, registry filters, MIDI parser edge cases, vmpk mock, vocal carriers
- Measure range validation in `list_measures` and `sing_along` MCP tools (now returns error instead of empty results)
- Handbook updated with all 34 MCP tools including Score category (`score_performance`, `score_annotation`, `compare_songs`, `annotation_progress`)

### Fixed
- Handbook tool count (31 → 34) and missing v1.1.0/v1.2.0 tool documentation
- Landing page feature list updated to reflect 34 tools

## [1.2.0] - 2026-04-02

### Security
- Fix ineffective path traversal guard in MCP `play_song` and `import_midi` tools (directory containment check)
- Fix XSS vulnerability in guitar tab HTML output (`</script>` breakout)
- Fix command injection risk in CLI `openInBrowser` on Windows
- Fix prototype pollution via `JSON.parse` in `add_song` MCP tool
- Docker container now runs as non-root user

### Added
- Per-hand scoring breakdown (`breakdownByHand()`) — identifies weaker hand with actionable feedback
- Journal now captures performance scores (grade, pitch accuracy, timing, completeness)
- Composer filter on `list_songs` MCP tool
- Key signature and composer search filters on song registry
- `play_song` response now references `playback_status` for progress monitoring
- `version` CLI subcommand
- Consistent "song not found" errors across all CLI commands with `list` suggestion
- New test coverage: errors (19), chord-detect (24), journal (19), per-hand scoring (14), registry filters (13)
- Long-term roadmap Tier 1: metronome, recording pipeline, practice loops, scored piano roll overlay

### Fixed
- PlaybackController engine reuse on resume (was recreating engine every play)
- Untracked noteOff timeouts leaking after stop/pause
- Voice re-trigger leaking old voices in vocal-synth-adapter
- Time signature denominator ignored in performance scoring (6/8, 3/8 now correct)
- Journal entry counting (was undercounting due to delimiter mismatch)
- `stopActive()` race condition (now properly async with await)
- Vocal synth preset resolution from wrong working directory
- Math.max/min spread stack overflow on large MIDI files
- Duplicate npm publish workflow (removed publish.yml, release.yml handles both)
- Stale tool counts across 6 doc files (31/35 → 34)
- Docker image missing vocal carrier samples

### Changed
- Engine connection errors now use structured JamError with actionable hints
- Layered engine has fault isolation (one engine failure doesn't kill others)
- Teaching hook composition has error isolation (one hook failure doesn't skip others)
- PlaybackController listener errors are now logged (were silently swallowed)
- Dep audit in CI now fails on high/critical vulnerabilities (was no-op)

## [1.1.0] - 2026-03-19

### Added
- `score_performance` MCP tool — MIDI play-along assessment with pitch accuracy, timing, and completeness scoring
- `score_annotation` MCP tool — annotation quality scoring across 5 dimensions (completeness, depth, specificity, teaching value, musical vocabulary)
- `compare_songs` MCP tool — cross-genre pattern recognition via cosine similarity of pitch class distributions, interval profiles, key relationships, and structural forms
- `annotation_progress` MCP tool — track annotation quality and progress across the entire song library
- Vocal carrier WAV files (11 formant-synthesized tones, C2–C7) now ship with npm package
- Annotation persistence — `annotate_song` now saves to user directory (`~/.ai-jam-sessions/songs/`) so annotations survive package updates

### Fixed
- Vocal engine NOTE_OFFSETS bug — removed bogus `es: 3` and `bs: 11` duplicates that mapped to wrong MIDI pitches
- Vocal sample engine and vocal synth engine now load correctly at runtime
- Annotation scorer bar-reference pattern now matches plural forms ("Bars 1–8")
- Annotation scorer chord/note patterns now match prose references ("C major", "E-D#-E")

## [1.0.0] - 2026-02-27

### Added
- Structured error class (`JamError`) with code, message, hint, cause, retryable
- SECURITY.md with vulnerability reporting policy and data scope
- Threat model section in README (data touched, data NOT touched, permissions)
- `verify` script in package.json (typecheck + test + build + smoke)
- Coverage reporting with `@vitest/coverage-v8` and Codecov badge
- Dependency audit job in CI
- SHIP_GATE.md and SCORECARD.md for product standards tracking

### Changed
- Top-level CLI error handler now uses structured error output
- MCP server fatal error handler no longer exposes raw stack traces
- Promoted to v1.0.0 — all Shipcheck hard gates pass

## [0.3.1] - 2026-02-27

### Added
- Guitar engine, tab editor, physically-modeled guitar voice
- Practice journal and session persistence
- Browser cockpit improvements

## [0.2.1]

- Dark-themed landing page (static HTML, GitHub Pages)
- New logo banner across all READMEs
- Rewrite all 7 translated READMEs (ja/zh/es/fr/hi/it/pt-BR) for v0.2.0 feature parity
- Add .nojekyll for reliable Pages deployment

## 0.2.0

- Rewrite all 12 genre exemplar annotations with deep musicalLanguage — historical context, bar-by-bar structural analysis, 5 key moments, 5 teaching goals, 5 style tips (including vocal guidance) per song
- Browser cockpit: dual-mode piano roll (instrument/vocal), 20 voice presets (15 Kokoro + 4 tract + choir/synth-vox), 10 instrument voices, note inspector with per-note vowel/breathiness editing
- 7 tuning systems (equal, just major/minor, Pythagorean, meantone, Werckmeister III, custom) with adjustable A4 reference and interval tester
- LLM-facing score API (`window.__cockpit`) — exportScore, importScore, addNote, play, stop, panic, setMode, getScore
- Formant vocal synthesis engine with 20 browser-side presets and 5 vowel shapes per voice
- Score import/export panel for full JSON round-tripping
- Rewrite README and docs landing page to reflect all features
- 24 MCP tools (up from ~15), 5 sound engines, layered engine combinator

## 0.1.4

- Add vocal-synth-engine integration (additive synthesis with 15 Kokoro voice presets)
- New `createVocalSynthEngine()` — drop-in VmpkConnector alongside sample-based and Pink Trombone engines
- New `listVocalSynthPresets()` — discover available voice presets
- New `createLayeredEngine()` — fan-out connector that plays multiple engines simultaneously
- CLI: `--engine synth`, `--engine piano+synth`, `--engine vocal+synth` modes
- `cmdSing` now supports `--engine` flag (piano, synth, piano+synth)

## 0.1.3

- Bump to v0.1.3
- Add CI badge to README

## 0.1.2

- Harden CI, add docs landing page
- Replace song library with MIDI-first architecture (120 songs across 12 genres)
- Fix tests and smoke test for MIDI-ingested song library
