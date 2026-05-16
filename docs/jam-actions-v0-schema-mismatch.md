# jam-actions-v0 — Step 0 Schema Mismatch Report

**Date:** 2026-05-16
**Status:** **STEP 0 FAILED LOUDLY — DO NOT PROCEED TO DATASET CODE**
**Trigger:** Synthesis prototype `target_trace.tool_calls[*]` do not match the real MCP surface exported by `dist/mcp-server.js`.

This report enumerates every mismatch between the synthesis prototype in
`C:/Users/mikey/.claude/projects/F--AI/memory/ai-jam-sessions-dataset-v0-synthesis.md`
(Section 7 "Prototype record") and the canonical MCP tool surface derived by
`scripts/extract-mcp-tool-schemas.ts` → `src/dataset/tool-schemas.json`.

The kickoff at
`C:/Users/mikey/.claude/projects/F--AI/memory/jam-actions-v0-sonnet-kickoff.md`
specifies: *"If ANY prototype tool call doesn't match the real surface, FAIL
LOUDLY. Write a report ... Do NOT proceed to dataset code."* That is what this
report does.

---

## How "real" was determined

- Source of truth: `dist/mcp-server.js`, freshly built (`dist` mtime newer than `src`).
- Method: `scripts/extract-mcp-tool-schemas.ts` spawns the server over stdio
  via `@modelcontextprotocol/sdk` `StdioClientTransport`, calls `tools/list`,
  writes `src/dataset/tool-schemas.json`.
- Result: **41 tools** in the canonical JSON (the header comment in
  `src/mcp-server.ts` says 34 — that header is stale).
- The synthesis prototype invokes only three of these:
  `view_piano_roll`, `annotate_song`, `play_song`. All three mismatch.

---

## Tool 1 — `view_piano_roll`

### Prototype call (synthesis Section 7, turn 2)

```json
{
  "tool": "view_piano_roll",
  "arguments": {
    "song_id": "fur-elise",
    "measure_range": [1, 8],
    "hand": "both"
  }
}
```

### Real schema (`tool-schemas.json`)

```jsonc
{
  "songId":       { "type": "string", "required": true },
  "startMeasure": { "type": "integer", "min": 1, "optional": true },
  "endMeasure":   { "type": "integer", "min": 1, "optional": true },
  "color_mode":   { "enum": ["hand", "pitch-class"], "optional": true }
}
```

### Mismatches

| # | Prototype field | Real field | Failure mode |
|---|---|---|---|
| M1 | `song_id` | `songId` | Naming convention: prototype uses snake_case, real uses camelCase. **Zod will reject the call.** |
| M2 | `measure_range: [number, number]` | `startMeasure` + `endMeasure` (separate integers) | Shape mismatch: prototype's tuple form does not exist in the real surface. |
| M3 | `hand: "both"` | *(no such argument)* | Extra unknown property: real `view_piano_roll` has no hand-filter argument. The closest concept is `color_mode: "hand"` which colors RH blue / LH coral but does not filter. **Zod strict-object will reject `hand`.** |

---

## Tool 2 — `annotate_song`

### Prototype call (synthesis Section 7, turn 4)

```json
{
  "tool": "annotate_song",
  "arguments": {
    "song_id": "fur-elise",
    "measure_range": [1, 8],
    "annotation": {
      "structure": "A-theme opening, oscillating E-D# neighbor motion resolving to A",
      "technique": ["light RH touch", "do not rush"]
    }
  }
}
```

### Real schema (`tool-schemas.json`)

```jsonc
{
  "song_id":        { "type": "string", "required": true },
  "description":    { "type": "string", "required": true },
  "structure":      { "type": "string", "required": true },
  "key_moments":    { "type": "array<string>", "min": 1, "max": 5, "required": true },
  "teaching_goals": { "type": "array<string>", "min": 1, "max": 5, "required": true },
  "style_tips":     { "type": "array<string>", "min": 1, "max": 5, "required": true }
}
```

### Mismatches

| # | Prototype field | Real field | Failure mode |
|---|---|---|---|
| M4 | `measure_range` | *(no such argument)* | Real `annotate_song` is **whole-song**, not phrase-scoped. It writes `config.musicalLanguage` for the entire song and promotes raw → ready. The prototype assumes a per-phrase annotation flow that does not exist. |
| M5 | `annotation: { structure, technique }` (nested object) | *(flat top-level fields)* | Real schema is flat: `description`, `structure`, `key_moments`, `teaching_goals`, `style_tips` at top level. The nested `annotation` envelope does not exist. |
| M6 | `technique: string[]` | *(no such field)* | "Technique" is not part of the real annotation vocabulary. The real surface has `style_tips` (rendered as `styleTips` in `musicalLanguage`) and `teaching_goals` (rendered as `teachingGoals`). |
| M7 | Missing: `description` | required | The real schema requires a 1-3 sentence musical `description`. Prototype omits it. |
| M8 | Missing: `key_moments` | required (1-5 items) | Prototype omits required field. |
| M9 | Missing: `teaching_goals` | required (1-5 items) | Prototype omits required field. |
| M10 | Missing: `style_tips` | required (1-5 items) | Prototype omits required field. |

**Note on data already in the repo:** the existing
`songs/library/classical/fur-elise.json` has a fully populated `musicalLanguage`
block (description, structure, keyMoments, teachingGoals, styleTips). So
`annotate_song` is the **write** tool for promoting raw → ready. It is **not the
right tool** for emitting per-phrase musical commentary inside an MCP session
trace. For per-phrase commentary the right surface is `teaching_note`
(measure-by-measure), `preview_teaching_cues` (per-measure read), or
`add_section` (structural markers) — none of which the prototype uses.

---

## Tool 3 — `play_song`

### Prototype call (synthesis Section 7, turn 6)

```json
{
  "tool": "play_song",
  "arguments": {
    "song_id": "fur-elise",
    "measure_range": [1, 8],
    "dynamic": "p",
    "articulation": "legato"
  }
}
```

### Real schema (`tool-schemas.json`)

```jsonc
{
  "id":            { "type": "string", "required": true },
  "speed":         { "type": "number",  "min": 0.1, "max": 4 },
  "tempo":         { "type": "integer", "min": 10,  "max": 400 },
  "mode":          { "enum": ["full", "measure", "hands", "loop"] },
  "startMeasure":  { "type": "integer", "min": 1 },   // loop mode only
  "endMeasure":    { "type": "integer", "min": 1 },   // loop mode only
  "withSinging":   "boolean",
  "withTeaching":  "boolean",
  "singMode":      { "enum": ["note-names","solfege","contour","syllables"] },
  "keyboard":      { "enum": ["grand","upright","electric","honkytonk","musicbox","bright"] },
  "engine":        { "enum": ["piano","vocal","tract","guitar"] },
  "tractVoice":    { "enum": ["soprano","alto","tenor","bass"] },
  "guitarVoice":   { "enum": ["classical-nylon","steel-dreadnought","electric-clean","electric-jazz"] },
  "syncMode":      { "enum": ["before","concurrent"] }
}
```

### Mismatches

| # | Prototype field | Real field | Failure mode |
|---|---|---|---|
| M11 | `song_id` | `id` | Naming mismatch. **Zod will reject** (real schema is strict on the key name). |
| M12 | `measure_range: [1, 8]` | `startMeasure` + `endMeasure` **and** `mode: "loop"` | Shape mismatch AND missing trigger: ranged playback requires `mode: "loop"` in addition to the start/end ints. Without `mode: "loop"` the args are ignored. |
| M13 | `dynamic: "p"` | *(no such argument)* | Extra unknown property. Real `play_song` has no dynamic control — note velocity comes from the MIDI file. **Zod strict-object will reject.** |
| M14 | `articulation: "legato"` | *(no such argument)* | Extra unknown property. Real `play_song` has no articulation control. **Zod strict-object will reject.** |

---

## Summary table

| Mismatch ID | Tool | Category | Severity |
|---|---|---|---|
| M1 | view_piano_roll | naming | breaks call |
| M2 | view_piano_roll | shape | breaks call |
| M3 | view_piano_roll | extra arg | breaks call |
| M4 | annotate_song | missing real concept (per-phrase) | breaks conceptual model |
| M5 | annotate_song | shape | breaks call |
| M6 | annotate_song | extra arg | breaks call |
| M7 | annotate_song | missing required `description` | breaks call |
| M8 | annotate_song | missing required `key_moments` | breaks call |
| M9 | annotate_song | missing required `teaching_goals` | breaks call |
| M10 | annotate_song | missing required `style_tips` | breaks call |
| M11 | play_song | naming | breaks call |
| M12 | play_song | shape + missing trigger | breaks call |
| M13 | play_song | extra arg | breaks call |
| M14 | play_song | extra arg | breaks call |

**Every tool call in the synthesis prototype would be rejected by the real MCP server.**

---

## Bonus mismatch (not a tool-call issue but worth flagging)

The synthesis prototype's `provenance` block claims:

```json
"arrangement_creator": null,
"arrangement_license": null,
"record_verdict": "internal",
"verdict_reason": "Composition is PD US+EU, but arrangement creator and license unknown; scraped source alone insufficient for public verdict per v0 rules."
```

The actual `songs/library/classical/fur-elise.json` says:

```json
"source": "Bernd Krueger, Source: piano-midi.de (CC BY-SA)"
```

So the arrangement creator is named ("Bernd Krueger"), the license is CC BY-SA
(which the synthesis Section 5 lists as redistributable), and the evidence URL
is piano-midi.de. If the verdict rule engine is honest, this file should
score **`public`**, not `internal`. The prototype's chosen verdict logic does
not match the data the repo already holds.

That's a separate problem from the tool-schema mismatch but it is a similar
class of error: the synthesis prototype was written somewhat speculatively and
should be cross-checked against repo reality before any dataset code generates
records.

---

## What the prototype was *trying* to express

Reading the prose around the prototype, the apparent intent is:

> "An MCP session where the assistant reads measures 1–8 of a song, looks at
> the piano roll, writes per-phrase annotation (structure + technique cues),
> and plays the phrase at quiet dynamic with legato articulation."

Of those, the **real MCP surface supports**:

- "Read measures 1–8 of a song" → can be done with `song_info` (whole-song
  metadata) + `list_measures` (per-measure overview) + `preview_teaching_cues`
  (per-measure cues + dynamics + fingering, already authored in
  `fur-elise.json`).
- "Look at the piano roll" → `view_piano_roll {songId, startMeasure:1, endMeasure:8}`.
  No `hand` filter; can pass `color_mode: "hand"` to color RH vs LH.
- "Play the phrase, looping mm. 1–8" → `play_song {id, mode:"loop", startMeasure:1, endMeasure:8, keyboard:"grand"}`.
  No dynamic / no articulation control.

And **the real MCP surface does NOT support**:

- Per-phrase annotation writes (annotate_song is whole-song).
- Phrase-scoped `view_piano_roll` returning only RH or only LH (only
  color-by-hand).
- Dynamic markings (p, mp, f, etc.) on `play_song`.
- Articulation markings (legato, staccato) on `play_song`.

---

## Recommendation — for the user to decide

The kickoff says: *"If the dataset reveals a needed tool change, write it up in
your report — don't ship it as part of this slice."* Following that, here are
three options the user can choose between. **This Sonnet session will not
proceed past Step 0 until you pick one.**

### Option A — Deflate the prototype to the current real surface

Rewrite the prototype's `target_trace.session` so it only uses the
three real tools with their real argument shapes, *and* swap in real adjacent
tools where appropriate:

- Turn 2 read step → `list_measures {song_id:"fur-elise", startMeasure:1, endMeasure:8}` and/or `preview_teaching_cues {song_id:"fur-elise", startMeasure:1, endMeasure:8}`
- Turn 2 view step → `view_piano_roll {songId:"fur-elise", startMeasure:1, endMeasure:8, color_mode:"hand"}`
- Turn 4 annotation step → there is **no live tool** that writes per-phrase
  commentary. The model's natural-language commentary in `content` is itself
  the annotation; no tool call is needed at this point. (If the user wants the
  trace to involve a tool here, the closest fits are `score_annotation`
  read-only or `save_practice_note` to journal it.)
- Turn 6 play step → `play_song {id:"fur-elise", mode:"loop", startMeasure:1, endMeasure:8, keyboard:"grand"}`

This is the fastest path and matches the kickoff scope: "No changes to the
existing AI Jam Sessions MCP tool surface to make the dataset fit."

### Option B — Mark the missing controls as `desired_future_capability`

Per the synthesis doc Step 0 wording: *"Mark unsupported desired controls as
`desired_future_capability`, NOT live target args."*

Concretely, every `target_trace` record would have:

```jsonc
{
  "tool_calls": [ /* only real-surface calls */ ],
  "desired_future_capability": [
    {"tool": "annotate_song", "missing_argument": "measure_range",
     "rationale": "phrase-scoped annotation is required for the dataset task family"},
    {"tool": "play_song", "missing_argument": "dynamic",
     "rationale": "...expressive performance control..."},
    /* etc. */
  ]
}
```

The dataset target_trace itself is then a clean, real-surface trace. The
"future capability" log feeds a separate decision about whether to extend the
MCP surface in a follow-up release of `ai-jam-sessions`.

### Option C — Raise the real MCP surface to match the prototype

Add `measure_range` to `annotate_song`, add `dynamic` and `articulation` to
`play_song`, add `hand` filter to `view_piano_roll`, etc. This is the largest
scope and contradicts the kickoff's forbidden zone: "No changes to the
existing AI Jam Sessions MCP tool surface to make the dataset fit."

**This Sonnet session does not recommend Option C — it is out-of-scope per
the kickoff. Option A is the cleanest path; Option B is a hybrid that keeps a
written record of the missing capability for a future surface decision.**

---

## What does not change either way

Regardless of which option you pick, the following dataset locks from the
synthesis are unaffected and remain in place:

- Consumer lock (hybrid reasoning LLM with interleaved MCP tool calls)
- Task family (multi-turn MCP chat traces)
- Tokenization (REMI + ABC + piano-roll SVG + raw MIDI sidecar truth)
- Eval suite (E1 / E2 / E3 with negative controls)
- Provenance gate fields
- Verdict rules (with the fur-elise data correction noted above)
- Distribution (Zenodo primary + HF mirror + GitHub release; npm builder-only)

The only thing this report blocks is the **target_trace shape** for the
prototype record. The rest of the spine is buildable once that shape is
locked.

---

## Artifacts produced by Step 0

- `scripts/extract-mcp-tool-schemas.ts` — extraction script (uses MCP SDK stdio client)
- `src/dataset/tool-schemas.json` — 41 canonical tool schemas, derived
- `docs/jam-actions-v0-schema-mismatch.md` — this report
- `docs/jam-actions-v0-first-slice-report.md` — first-slice status (blocked at Step 0)

No record was produced. No `src/dataset/schema.ts` or any other dataset code
was written. No git commits were made.
