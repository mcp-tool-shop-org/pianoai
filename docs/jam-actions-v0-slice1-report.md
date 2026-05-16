# jam-actions-v0 — Slice 1 Report

**Date:** 2026-05-16
**Status:** **DONE.** Spine + validators + one real-surface record built and validated.
**Pipeline:** `npx tsx scripts/build-record-fur-elise-m001-008.ts`
**Record:** [`datasets/jam-actions-v0/records/fur-elise-m001-008.json`](../datasets/jam-actions-v0/records/fur-elise-m001-008.json)

This slice implements the corrected dataset spine and produces **one** `fur-elise:m001-008` record per the revised Section 7 prototype (synthesis amendments 2026-05-16, post-Slice 0).

---

## Changes from the Slice 0 prototype

See [`jam-actions-v0-schema-mismatch.md`](./jam-actions-v0-schema-mismatch.md) for the 14 enumerated Slice 0 mismatches. Slice 1 closes them via Option A (deflate to real surface) as the user picked:

| Area | Slice 0 prototype | Slice 1 record |
|---|---|---|
| `view_piano_roll` args | `{song_id, measure_range, hand}` | `{songId, startMeasure, endMeasure}` ✓ |
| `annotate_song` call | in trace turn 4 | **removed** — phrase annotation lives in `annotation_target` + assistant `content` |
| `play_song` args | `{song_id, measure_range, dynamic, articulation}` | `{id, startMeasure, endMeasure, mode: "loop"}` ✓ |
| Verdict for Für Elise | `internal` (synthesis prototype) | `public_candidate` — repo metadata names Bernd Krueger / piano-midi.de / CC BY-SA |
| Tempo / time signature | placeholders (120 BPM) | real MIDI values (69 BPM, 3/8) |
| Velocities in `timed_events` | invented (72) | real MIDI velocities (range 33–~50; the piece is `pp`) |

The trace surface now matches the real 41-tool MCP catalog **byte-for-byte** — `ajv` over `tool-schemas.json` reports zero mismatches across both tool calls and both tool turns.

---

## Schema-extraction sanity check (Step 0 re-run)

```
$ npx tsx scripts/extract-mcp-tool-schemas.ts
Song library initialized: 24 ready songs loaded (120 total, 96 not ready)
ai-jam-sessions MCP server running on stdio
Wrote 41 tool schemas to E:\AI\ai-jam-sessions\src\dataset\tool-schemas.json
```

Diff against the Slice 0 extraction: **only the `derived_at` timestamp changed.** All 41 tool schemas are byte-identical. The MCP surface has not drifted since Slice 0 ran.

```
< "derived_at": "2026-05-16T13:24:59.225Z"
> "derived_at": "2026-05-16T13:46:09.703Z"
```

`src/dataset/tool-schemas.json` remains the canonical authority. **Git status:** currently untracked — staged for the user to commit (the kickoff prohibits commits without explicit ask).

---

## Validators wired

Three validators, all run by the build script (`scripts/build-record-fur-elise-m001-008.ts`). Each is a separate concern, and each can independently fail the build:

### 1. `src/dataset/schema.ts` — record-shape validator (zod)

Field names are snake_case (wire format), not TypeScript convention. Exports both static types (`Record`, `Provenance`, `Scope`, `Observation`, `AnnotationTarget`, `TargetTrace`, `Turn`, `EvalMetadata`) and runtime `*Schema` validators backed by zod (already in deps). The verdict enum is `{public, public_candidate, internal, excluded}` per the synthesis Section 5 amendment.

`Turn` is a discriminated union on `role` — `user` / `assistant` (with optional `tool_calls`) / `tool` — so the validator catches malformed turn shapes structurally.

`tokens_remi` and `tokens_abc` accept either real values or an explicit `{todo: string}` placeholder. Slice 1 uses placeholders (see "Placeholders" below).

### 2. Inline provenance gate (Slice 1 only)

Inlined in `scripts/build-record-fur-elise-m001-008.ts` as `furElisePublicCandidateGate(provenance)`. Hardcoded for Für Elise with a `TODO[Slice 2]` marker. The Slice 2 work extracts this into `src/dataset/provenance-gate.ts` as a real rule engine driving both initial classification and `public_candidate → public` verification across all 24 ready songs.

The gate checks: PD-US + PD-EU, `arrangement_creator` not null, `arrangement_license` set, `arrangement_evidence_url` set, and `record_verdict === "public_candidate"`. Für Elise passes all five.

### 3. `src/dataset/trace-validator.ts` — tool-call validator (ajv)

Loads `src/dataset/tool-schemas.json` (canonical, derived) and compiles each tool's JSON Schema with `ajv` (8.18.0, added as a direct dep). For every `target_trace.session[*].tool_calls[*]`:

- Tool name must exist in the catalog → otherwise emits `unknown_tool` mismatch.
- Arguments must match the tool's `inputSchema` → otherwise emits `arguments_invalid` mismatch with raw ajv errors.
- **Strictness:** every tool's `inputSchema` is post-processed to set `additionalProperties: false` on every object node. This matches the MCP server's runtime Zod-strict behavior (which the published draft-07 schema does not preserve).

Every `tool` turn's `tool` field is also checked against the catalog (`tool_turn_unknown_tool`).

The validator collects **all** mismatches per record; it does not throw on first failure.

`smokeTestValidator()` validates the inlined synthesis Section 7 revised prototype trace. The build aborts before producing any record if the smoke test fails — that means either the validator drifted or the prototype drifted. **Slice 1 smoke test: PASS** (2 tool calls + 2 tool turns, 0 mismatches).

---

## Record excerpt

### Provenance block

```json
{
  "source_url": "https://piano-midi.de/",
  "source_collected_at": "2026-05-16",
  "source_type": "transcribed-by-author",
  "composition_title": "Bagatelle No. 25 in A minor (Für Elise)",
  "composer": "Ludwig van Beethoven",
  "composition_year": 1810,
  "composition_pd_status_us": "public_domain",
  "composition_pd_status_eu": "public_domain",
  "arrangement_creator": "Bernd Krueger",
  "arrangement_license": "CC-BY-SA",
  "arrangement_license_version": null,
  "arrangement_evidence_url": "https://piano-midi.de/",
  "record_verdict": "public_candidate",
  "verdict_reason": "Composition PD US+EU. Arrangement credited to Bernd Krueger via piano-midi.de under CC BY-SA per repo song metadata (songs/library/classical/fur-elise.json `source` field). Initial public_candidate rules met. Awaiting Slice 2 verification: source URL resolves at verification time, license text preserved at source, license version (3.0 vs 4.0) determined. Until verified, treat as internal for distribution.",
  "verifier": "auto-rule-engine[slice1-inline]",
  "verified_at": "2026-05-16",
  "training_use_permitted": true
}
```

### First 5 timed_events (mm. 1–2 of the famous E–D# oscillation)

Real MIDI parse of `songs/library/classical/fur-elise.mid` (sha256 `a1481bdafe94d33e0de8934c97aec45534c908bc797bae7293f626074aec2e07`, `ticksPerBeat=480`, MIDI tempo=69.18 BPM, time signature 3/8):

```json
[
  {"t_seconds": 0.867303, "t_ticks": 480, "dur_seconds": 0.216826, "dur_ticks": 120,
   "note": 76, "name": "E5",  "velocity": 36, "channel": 0, "hand": "right", "measure": 1, "beat": 1.0},
  {"t_seconds": 1.084128, "t_ticks": 600, "dur_seconds": 0.216826, "dur_ticks": 120,
   "note": 75, "name": "D#5", "velocity": 33, "channel": 0, "hand": "right", "measure": 1, "beat": 1.25},
  {"t_seconds": 1.300954, "t_ticks": 720, "dur_seconds": 0.216826, "dur_ticks": 120,
   "note": 76, "name": "E5",  "velocity": 39, "channel": 0, "hand": "right", "measure": 2, "beat": 0.0},
  {"t_seconds": 1.517780, "t_ticks": 840, "dur_seconds": 0.216826, "dur_ticks": 120,
   "note": 75, "name": "D#5", "velocity": 33, "channel": 0, "hand": "right", "measure": 2, "beat": 0.25},
  {"t_seconds": 1.734606, "t_ticks": 960, "dur_seconds": 0.216826, "dur_ticks": 120,
   "note": 76, "name": "E5",  "velocity": 39, "channel": 0, "hand": "right", "measure": 2, "beat": 0.5}
]
```

The famous opening E–D♯ neighbor figure is the first thing you see, with realistic `pp`-range velocities (33–39) — true to the piece's marking, not the synthesis prototype's invented `72`.

### First two trace turns (real-surface tool calls)

```json
{
  "turn": 2, "role": "assistant",
  "content": "Let me view the piano roll for mm. 1–8.",
  "tool_calls": [
    {"tool": "view_piano_roll",
     "arguments": {"songId": "fur-elise", "startMeasure": 1, "endMeasure": 8}}
  ]
},
{
  "turn": 4, "role": "assistant",
  "content": "I can see the opening oscillation: RH alternates E5 and D#5 over an A-minor bassline. […] Let me loop mm. 1–8 so you can hear the phrasing.",
  "tool_calls": [
    {"tool": "play_song",
     "arguments": {"id": "fur-elise", "startMeasure": 1, "endMeasure": 8, "mode": "loop"}}
  ]
}
```

Trace validator: **PASS** — 2 tool calls + 2 tool turns, 0 mismatches against the real 41-tool catalog.

---

## Placeholders (clearly marked, not fabricated)

Two fields ship as `{todo: "..."}` placeholders per the kickoff's "don't fabricate" rule:

- `observation.tokens_remi` → `{todo: "Install MidiTok (Python) or a JS REMI implementation. Out of Slice 1 scope per kickoff — wire in Slice 3."}`
- `observation.tokens_abc` → `{todo: "Wire a MIDI→ABC converter (e.g., abc-tools, midi2abc). Out of Slice 1 scope per kickoff — wire in Slice 3."}`

The zod schema for these fields is `union(real, {todo: string})` — placeholders are structurally valid but explicit. A future tokenizer-aware validator can grep for `.todo` to count un-wired records.

Real MIDI events, real velocities, real piano-roll SVG (18 809 bytes via the existing `renderPianoRoll`), real provenance from the repo's song JSON. Tokenization is the only deliberately deferred piece.

---

## Open questions for the user

1. **Commit `src/dataset/tool-schemas.json` and the Slice 0/1 docs?** The kickoff said to commit `tool-schemas.json` if not already tracked (it isn't), but also forbade commits without explicit ask. I left every Slice 1 file untracked. When you're ready: `git add src/dataset scripts/extract-mcp-tool-schemas.ts scripts/build-record-fur-elise-m001-008.ts docs/jam-actions-v0-*.md datasets/ package.json pnpm-lock.yaml`.

2. **Measure-tick alignment in piano-midi.de Für Elise.** The MIDI puts the first note at tick 480 (beat 1.0 of "measure 1" in quarter-note units, equivalent to the second eighth of a 3/8 measure — i.e., the anacrusis position rendered into measure 1 rather than as a separate pickup). The dataset honors the MIDI's tick-based measure numbering (which is also what `play_song mode=loop startMeasure=1` honors), so trace and timed events are internally consistent. But it's slightly off from how a human musician describes "Für Elise mm. 1–8." Worth deciding before Slice 3 whether records should normalize to musical-bar (with anacrusis as `measure: 0`) or stay tick-aligned.

3. **`ajv` added as a direct dep** (8.18.0, already present transitively via `@modelcontextprotocol/sdk`). I declared it explicitly in `package.json` so the validator doesn't depend on the SDK's transitive choice. Acceptable?

4. **SVG path convention.** The synthesis Section 7 prototype stored the path as `./pianoroll/fur-elise-m001-008.svg`. I shipped that literal string in `observation.piano_roll_svg_path`, with the actual file at `datasets/jam-actions-v0/pianoroll/fur-elise-m001-008.svg` — the `./` resolves relative to the **dataset root**, not the repo root. If you'd rather have repo-root-relative paths (`./datasets/jam-actions-v0/pianoroll/…`), Slice 3 can flip the convention.

5. **Per-phrase `teaching_notes` array** in `annotation_target` currently has one entry (m1). The synthesis prototype showed one too. Slice 3 should populate per-measure teaching notes from the existing `preview_teaching_cues` MCP tool output (the data is there in `fur-elise.json`).

6. **`scope.tempo_bpm` rounded to integer (69).** Real MIDI tempo is 69.18; `Math.round`-ed by the existing `midiToSongEntry` pipeline before reaching `scope`. The `timed_events` use the unrounded internal tempo for `t_seconds`. If finer tempo precision matters for downstream eval, Slice 3 can promote it to a float.

---

## What Slice 2 should pick up

Per the synthesis Build sequence:

1. **`src/dataset/provenance-gate.ts`** — extract the inline Für Elise gate into a real rule engine. Schema-drive verdict classification for all 24 ready songs from their `source` strings (most follow the "Krueger / piano-midi.de / CC BY-SA" pattern; a handful may differ).
2. **Provenance scan** — `scripts/scan-provenance.ts` runs the rule engine over `songs/library/**/*.json` and emits `docs/jam-actions-v0-provenance-scan.md` with initial verdicts per song.
3. **Source-evidence verification** — for each `public_candidate`: check URL resolves, license text preserved at source, version known. Promote `public_candidate → public` for those that pass. Report in `docs/jam-actions-v0-source-verification.md`.

After Slice 2, the pilot subset (8 songs, ~50 phrase records) can be picked from scan results rather than guessed.

---

## Files produced this slice

```
src/dataset/schema.ts                                       NEW   types + zod
src/dataset/trace-validator.ts                              NEW   ajv against tool-schemas.json
scripts/build-record-fur-elise-m001-008.ts                  NEW   one-off Slice 1 builder
datasets/jam-actions-v0/records/fur-elise-m001-008.json     NEW   the record
datasets/jam-actions-v0/pianoroll/fur-elise-m001-008.svg    NEW   18 809-byte piano roll
docs/jam-actions-v0-slice1-report.md                        NEW   this file
package.json                                                MOD   +ajv ^8.18.0
pnpm-lock.yaml                                              MOD   ajv resolved as direct dep
src/dataset/tool-schemas.json                               UNCHANGED (re-extracted, byte-identical except derived_at)
```

Existing artifacts unchanged: `scripts/extract-mcp-tool-schemas.ts`, the 24-song library, the 692-test suite (all still green after Slice 1: `pnpm test` → `24 passed (24)` / `692 passed (692)`).

`pnpm typecheck` → clean.
`pnpm test` → 692/692 PASS.
`npx tsx scripts/build-record-fur-elise-m001-008.ts` → BUILD OK, 3/3 validators PASS.

---

## What this slice did NOT do (per forbidden zones)

- No bulk build (one record).
- No provenance scan across the other 23 ready songs (Slice 2).
- No source-evidence verification of Für Elise (verdict stays `public_candidate`).
- No public release. No Zenodo, no HF, no GitHub release.
- No MCP surface changes. No new MCP tools.
- No `annotate_song` calls in the trace.
- No `provenance-gate.ts` module — the gate is inline in the build script with a `TODO[Slice 2]` marker.
- No tokenizer, phrase-slicer, or piano-roll-observation modules as separate files — the build script does what's needed for the one record.
- No translations.
- No model fine-tuning.
- No commits.
