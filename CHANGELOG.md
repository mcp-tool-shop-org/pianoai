# Changelog

All notable changes to AI Jam Sessions will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.2] - 2026-05-19

**Publication event.** `jam-actions-v0` v0.4.3 is now publicly published on Zenodo with DOI [`10.5281/zenodo.20279919`](https://doi.org/10.5281/zenodo.20279919). This is the canonical citation handle going forward. The dataset content is unchanged from v1.4.1; this release captures the publication state.

### Added
- **Zenodo DOI minted** — `10.5281/zenodo.20279919`. Record at https://zenodo.org/records/20279919. Two archive files attached (`.tar.gz` + `.zip`, both with SHA-256 sums recorded in `publication-receipt.json`).
- **`.github/workflows/publish-jam-actions-v0.yml`** — operator-mediated publication workflow. Manual trigger only (`workflow_dispatch`). Three modes: `draft-only` (safe), `publish-zenodo-only`, `publish`. Irreversible actions gated by `confirm_irreversible=yes-mint-doi` input. Tokens (`ZEN_TOKEN`, `HF_TOKEN`) come from GitHub Secrets — never echoed, never written to files.
- **`.github/workflows/push-jam-actions-v0-hf.yml`** — HF-only recovery workflow for partial publish runs. Used when Zenodo half succeeded but HF push needs re-trying.
- **`datasets/jam-actions-v0-public/publication-receipt.json`** — machine-readable record of the publication state: Zenodo DOI, archive SHA-256s, HF status (deferred), provenance, doctrine compliance. NO tokens, NO secrets.
- **DOI added to `CITATION.cff`** with Bernd Krueger as second author (matching the share-alike chain). Also adds `identifiers` and `url` fields per CFF 1.2.0 spec.
- **DOI badge in main README hero** (Zenodo's standard SVG badge).
- **Citation line in main README's Training Dataset section** plus DOI row in the dataset stats table.
- **`RELEASE_NOTES.md` annotation** under v0.4.3 documenting the Slice 25 publication event.

### Deferred
- **HuggingFace push** to `mcp-tool-shop-org/jam-actions-v0` is deferred to a v1.4.x patch. The `HF_TOKEN` fine-grained token granted write access to the personal namespace only, not to the `mcp-tool-shop-org` org namespace on HuggingFace. Recovery is a 5-minute token re-scope + workflow re-trigger. See `publication-receipt.json` for the next-steps block.

### Doctrine compliance
- Publication was operator-mediated end-to-end. The Phase B 7-line gate format from the Slice 25 kickoff was presented before any irreversible action.
- No tokens entered Claude's context, no tokens appeared in any log, file, or chat message — tokens lived in GitHub Secrets only.
- Pre-flight verifiers (checksums + release-gate CLI) ran inside the workflow before any irreversible API call.

## [1.4.1] - 2026-05-19

This is a publication-readiness release — no new MCP server functionality. It integrates the **jam-actions-v0** training dataset (built across 24 named slices) into the repo's marketed surface, ahead of public Zenodo + HuggingFace publication.

### Added
- **`jam-actions-v0` dataset (public subset)** — 115 records across 8 classical piano works (Beethoven, Bach, Schubert, Schumann, Mozart, Mendelssohn, Tchaikovsky), pairing 4-measure phrase windows with annotated teaching targets and multi-turn MCP tool-use traces. CC-BY-SA-3.0-DE. Version `0.4.3`. Lives at `datasets/jam-actions-v0-public/`.
- **7-axis release gate** for the dataset (axes 1–6 blocking, axis 7 reporting). Axes 2 and 6 admit a `ceiling_saturated_pass` bucket so trivial-ceiling records do not dilute harder strata. Slice 22 baseline PASSES; Slice 19 baseline still FAILS (kept as a regression diagnostic).
- **9-tool MIDI inspector surface** for grounded tool-use over symbolic music: `get_events_in_measure`, `get_events_in_hand`, `count_distinct_pitch_classes`, `count_notes_with_pitch_class`, `count_beat_1_onsets`, `get_pitch_at`, `get_hand_balance`, `find_highest_pitch`, `find_lowest_pitch`.
- **Cold-start reproducibility** — `.gitattributes` pins LF for `*.sha256` and `datasets/jam-actions-v0-public/**` so Windows / macOS / Linux / WSL contributors get reproducible checksums. `parseChecksumsManifest` strips trailing `\r` as defense in depth. `scripts/check-release-gate.ts` rejects unknown / multiple positional args.
- **Publication metadata** — `zenodo-metadata.json` (13 fields, ISO 639-3 language code), `CITATION.cff`, `RELEASE_NOTES.md`, `ATTRIBUTION.md` with HITL annotation provenance, `hf-dataset-card-check.md` (post-polish: 0 unresolved WARN), polished HF dataset card YAML frontmatter (`license`, `language`, `task_categories`, `tags`, `configs`, `pretty_name`, `pretty_description`, `multilinguality`, `source_datasets`, `annotations_creators`, `language_creators`).
- **Archives** — `.tar.gz` and `.zip` publication archives (built by Slice 24).
- **README marketing surface** — new `## Training Dataset` section, hero badge, "What is this?" teaser, Status section update.
- **Landing-page integration** — new `training-dataset` features section + `dataset-quick-start` code-cards section on the public landing page; 7th feature card on the "What makes it tick" panel; meta-description and hero-description acknowledging the dataset.
- **Handbook page** — `site/src/content/docs/handbook/training-dataset.md` (sidebar order 6) covering the 24-slice build arc, 7-axis release gate, 9-tool inspector surface, provenance audit, and cold-start reproducibility.
- **GitHub topics** — `dataset`, `tool-use`, `huggingface-dataset`, `symbolic-music` (12 → 16 topics).
- 1513 vitest tests covering the MCP server + dataset packagers + eval harnesses + release-gate validator (all passing).

### Changed
- **Repo description** updated to surface the dataset alongside the MCP server.
- **`pretty_name`** in the HF dataset card now reads `"AI Jam Sessions — Tool-Use Traces v0 (Public Subset)"`.

### Provenance and exclusions
- Two compositions present in the full source corpus — Satie Gymnopédie No. 1 and Debussy Arabesque No. 1 — are NOT in the public subset because their piano-midi.de URL provenance could not be verified during Slice 2.5 audit. The honest call was to ship what could be defended.
- The MIDI arrangements are by Bernd Krueger (piano-midi.de), licensed CC-BY-SA-3.0-DE. The annotations, traces, and eval artifacts are by the AI Jam Sessions team, released under the same license to preserve the share-alike chain end-to-end.

## [1.4.0] - 2026-04-05

### Added
- **7 new MCP tools**: `server_info`, `validate_song_entry`, `transpose_song`, `list_sections`, `add_section`, `preview_teaching_cues`, `mute_hand` (34 → 41 tools)
- **3 MCP prompt templates**: `annotate_song`, `practice_plan`, `performance_review`
- Song transposition — shift any song up or down by semitones with key signature update
- Section markers — structural navigation (Intro, Verse, Chorus, Bridge) on songs
- Per-hand mute/solo — isolate left or right hand during practice sessions
- Teaching cue preview — see all teaching notes and key moments before playing
- Session state persistence — last completed session survives server restarts
- `import_midi` now documents output format in tool description
- `play_song` supports `syncMode` parameter (concurrent vs before) for voice timing
- `initializeFromLibrary` returns structured `InitReport` with error details
- 76 new MIDI ingest tests, 14 transposition tests, 3 mute tests, 5 library edge case tests

### Changed
- Humanized all MCP error messages — conversational tone replaces robotic responses
- Defensive coding improvements across all sound engines (graceful degradation, operator warnings)

## [1.3.1] - 2026-04-05

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
