# Changelog

All notable changes to AI Jam Sessions will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
