# Dataset Schema — `jam-actions-v0` (public subset)

This document is per-field documentation for every record in this dataset. A reader who has never seen the corpus should be able to read this file plus two example records (in `examples/`, or any record under `records/`) and fully understand what a record means.

The canonical Zod schema lives at `src/dataset/schema.ts` in the source repo. This file is the human-readable explainer that mirrors it. If the two disagree, the Zod schema wins.

## Top-level record shape

Every record is a JSON object with exactly these top-level keys:

```
{
  "id":                <string>,
  "schema_version":    <string>,         // matches /^jam-actions-v0\/\d+\.\d+\.\d+$/
  "provenance":        <Provenance>,
  "scope":             <Scope>,
  "observation":       <Observation>,
  "annotation_target": <AnnotationTarget>,
  "target_trace":      <TargetTrace>,
  "eval_metadata":     <EvalMetadata>
}
```

In `records.jsonl`, each line is one record plus an additional top-level `split` field (`"train"` or `"test"`) — added by the packager so consumers can stream the JSONL without consulting `splits.json` separately.

The block-by-block explainer below names every sub-field, gives its type, says what it means, and shows an example value drawn from a real record in this subset.

---

## `id` (string, required)

Stable record identifier. Format: `<song_id>:<phrase-window>:<instrument>:<task-shape>:<version>`.

Example: `"fur-elise:m001-008:piano:mcp-session:v1"`

Used as: the primary key for splits, paired-record lookup, and eval result joins. Two records are guaranteed distinct if their `id`s differ. The `<phrase-window>` segment uses zero-padded measure ranges (`m001-008`, not `m1-8`).

## `schema_version` (string, required)

Matches `/^jam-actions-v0\/\d+\.\d+\.\d+$/`. All records in this public subset carry `"jam-actions-v0/1.0.0"`.

Used to: gate consumers against future schema-breaking versions. If a future v0/2.x exists, consumers can check this field and decide whether to handle the legacy shape.

---

## `provenance` (object, required)

Where the MIDI came from, what license attaches, and what verdict the gating process assigned.

| Field | Type | Meaning | Example |
|---|---|---|---|
| `source_url` | string | The site root URL the MIDI was collected from. | `"http://piano-midi.de/"` |
| `source_collected_at` | string (ISO date) | When the MIDI was retrieved from upstream. | `"2026-05-16"` |
| `source_type` | enum | One of `"user-recorded"`, `"transcribed-by-author"`, `"licensed"`, `"scraped"`. All records here are `"transcribed-by-author"`. | `"transcribed-by-author"` |
| `composition_title` | string | Human-readable title of the work. | `"Fur Elise (Bagatelle No. 25 in A minor)"` |
| `composer` | string | Composer's name. | `"Ludwig van Beethoven"` |
| `composition_year` | integer | Year of composition / first publication. | `1810` |
| `composition_pd_status_us` | enum | `"public_domain"`, `"copyrighted"`, or `"unknown"`. All records here: `"public_domain"`. | `"public_domain"` |
| `composition_pd_status_eu` | enum | Same enum as above, EU jurisdiction. | `"public_domain"` |
| `arrangement_creator` | string \| null | Who arranged the MIDI realization. | `"Bernd Krueger"` |
| `arrangement_license` | string \| null | SPDX-ish identifier for the arrangement. | `"CC-BY-SA"` |
| `arrangement_license_version` | string \| null | License version, e.g. `"3.0"` for CC-BY-SA-3.0. | `"3.0"` |
| `arrangement_evidence_url` | string \| null | Per-song URL on the upstream site that supports the license claim. | `"http://piano-midi.de/beeth.htm"` |
| `record_verdict` | enum | One of `"public"`, `"public_candidate"`, `"internal"`, `"excluded"`. All records in **this public subset** are `"public"`. | `"public"` |
| `verdict_reason` | string | Human-readable rationale for the verdict. | `"Slice 2.5 URL verification. License confirmed: CC-BY-SA-3.0..."` |
| `verifier` | string | Identifier of the process or person who set the verdict. | `"auto-rule-engine+slice2.5-url-verifier"` |
| `verified_at` | string (ISO date) | When the verdict was set/confirmed. | `"2026-05-17"` |
| `training_use_permitted` | boolean | Whether the record can lawfully be used for ML training. All records here: `true`. | `true` |

The `verifier` value `"auto-rule-engine+slice2.5-url-verifier"` means: an automated rule engine first assigned a `public_candidate` verdict from source-string parsing (Slice 2), then the URL verifier (Slice 2.5) performed a live HTTP fetch of the per-song evidence URL and promoted the verdict to `public` after confirming Krueger's name, the CC license marker, and the song title at the page level.

---

## `scope` (object, required)

What slice of what work, in what key/tempo/meter, with what role in the eval pairing.

| Field | Type | Meaning | Example |
|---|---|---|---|
| `song_id` | string | The song key (lowercase, hyphenated). | `"fur-elise"` |
| `phrase_window` | string | Human-readable measure range. | `"measures 1-4"` |
| `instrument` | string | The instrument the phrase is voiced on. All records here: `"piano"`. | `"piano"` |
| `key` | string | Tonal key, conventional spelling. | `"A minor"` |
| `tempo_bpm` | number | Tempo in beats per minute (rounded). | `69` |
| `time_signature` | string | Time signature, must match `/^\d+\/\d+$/`. | `"3/8"` |
| `window_role` | enum, optional | One of `"prompt"`, `"continuation_target"`, `"standalone"`. Used for E2 phrase-continuation pairing. | `"prompt"` |
| `continuation_target_window` | `[int, int]`, optional | When `window_role === "prompt"`, the measure range of the paired continuation. | `[5, 8]` |
| `musical_phrase_label` | string, optional | Human-readable label for the phrase. | `"opening four-chord cycle"` |
| `natural_phrase_boundary` | boolean, optional | Whether the window ends on a real musical phrase boundary. | `true` |
| `paired_prompt_record_id` | string, optional | When `window_role === "continuation_target"`, the `id` of the paired prompt record. | `"bach-prelude-c-major-bwv846:m001-004:piano:mcp-session:v1"` |

### `window_role` semantics

- **`"prompt"`** — the first half of an E2 phrase-continuation pair. The model is given this phrase + the objective and asked to generate the continuation. `continuation_target_window` MUST be present.
- **`"continuation_target"`** — the gold continuation for a `"prompt"` record. Used as ground truth for E2 grooveOA computation. `paired_prompt_record_id` MUST be present.
- **`"standalone"`** — not part of an E2 pair. Currently exactly one record in this subset has this role: `fur-elise:m001-008:...` (the legacy Slice 1 synthesis anchor, covering the full mm. 1-8 window).

The per-record schema enforces that prompts have a target window and continuations have a prompt id. The whole-corpus validator enforces that every continuation_target has a real, in-corpus prompt mate.

---

## `observation` (object, required)

What the model gets to look at, in three forms (MIDI truth, two tokenizations, one visual).

### `observation.midi_sidecar` (object, required) — the source of truth

The exact MIDI events for the phrase window. All other observation fields are derived from this; this is canonical.

| Field | Type | Meaning |
|---|---|---|
| `midi_sha256` | string (64-char lowercase hex) | SHA-256 of the full upstream MIDI file. Same value across all records derived from the same source MIDI. |
| `ticks_per_beat` | int > 0 | MIDI ticks-per-quarter resolution. All records here use `480`. |
| `timed_events` | `TimedEvent[]` (≥1) | Per-note events, in onset order. |

Each `TimedEvent`:

| Field | Type | Meaning |
|---|---|---|
| `t_seconds` | number ≥ 0 | Absolute onset time in seconds from the start of the MIDI file (not the phrase). |
| `t_ticks` | int ≥ 0 | Absolute onset time in MIDI ticks. |
| `dur_seconds` | number > 0 | Note duration in seconds. |
| `dur_ticks` | int > 0 | Note duration in MIDI ticks. |
| `note` | int 0-127 | MIDI note number. |
| `name` | string | Conventional pitch spelling (e.g. `"E5"`, `"D#5"`). |
| `velocity` | int 0-127 | MIDI velocity (0=silent, 127=loudest). |
| `channel` | int 0-15 | MIDI channel. |
| `hand` | enum | One of `"right"`, `"left"`. Inferred from channel + register. |
| `measure` | int ≥ 1 | Measure number (1-indexed). |
| `beat` | number ≥ 0 | Beat-within-the-measure (1-indexed beat, with fractional offset for off-beats). |

Notes on conventions:
- Times are absolute from the source MIDI file, not relative to the phrase window. To get within-phrase time, subtract the first event's `t_seconds`.
- `velocity` carries real expressive intent — Für Elise's opening RH oscillation lives at velocities 33-45 (a `pp`-range), not boilerplate `64`. This matters for evals that probe velocity awareness.
- `hand` is two-valued in the schema but is heuristic; the source-MIDI channel separates LH/RH cleanly for Krueger's arrangements.

### `observation.tokens_remi` (string[], required)

REMI tokens per Huang & Yang 2020 (arXiv:2002.00212). The opening cycle of Bach Prelude in C is encoded like:

```
[
  "Bar_None", "Position_0", "Pitch_60", "Velocity_60", "Duration_8",
  "Position_6", "Pitch_64", "Velocity_56", "Duration_7",
  ...
]
```

- `Bar_None` separates bars.
- `Position_<n>` gives sub-bar position (sixteenth-note resolution).
- `Pitch_<MIDI>`, `Velocity_<bin>` (32 bins of 4), `Duration_<n>` (sixteenth-note units).
- Simultaneous notes share `Position_<n>` and are sorted lowest-to-highest pitch.

REMI is the primary symbolic encoding consumed by tool-use traces in E2. Hand-rolled in pure TS (no Python MidiTok dep) — see `src/dataset/remi-adapter.ts`.

### `observation.tokens_abc` (string, required)

ABC notation for the phrase (Yuan et al. 2024 / Qu et al. 2024 lineage). Used as the LLM-readable text view. Example fragment from Für Elise:

```
X:1
T:Fur Elise (Bagatelle No. 25 in A minor) (mm. 1–8)
M:3/8
L:1/16
Q:1/4=69
K:Am
|...
```

ABC is generated from RH monophonic melody; full polyphony is not represented in this surface. Use the REMI / MIDI sidecar for full-fidelity inputs.

### `observation.piano_roll_svg_path` (string, required)

Relative path (forward-slash) to the SVG piano roll. Example: `"pianoroll/fur-elise-m001-008.svg"`. The path is dataset-root-relative (no leading `./`).

### `observation.piano_roll_svg_inline` (string, required)

Full inline SVG markup (`<svg ...>...</svg>`) for the piano roll. Convenient for record-self-contained consumers but duplicates the file under `pianoroll/`. Both forms are byte-identical for the same record.

---

## `annotation_target` (object, required)

The musical analysis the record teaches. This is the *target* — what an annotation-grounding eval (E3) asks the model to ground in the MIDI evidence.

| Field | Type | Meaning |
|---|---|---|
| `measure_range` | `[int, int]` | Inclusive measure range of the phrase. |
| `structure` | string | One-sentence structural label. |
| `key_moments` | string[] (≥1) | List of musically significant events with measure references. |
| `teaching_goals` | string[] (≥1) | What a student should learn from working with this phrase. |
| `style_tips` | string[] (≥1) | Performance-practice notes. |
| `teaching_notes` | `TeachingNote[]` (≥1) | Detailed per-measure notes. |

Each `TeachingNote`:

| Field | Type | Meaning |
|---|---|---|
| `measure` | int ≥ 1 | Measure number this note applies to. |
| `note` | string | The pedagogical observation. |
| `technique` | string[], optional | Hands-on technique notes. |

Example (`bach-prelude-c-major-bwv846:m001-004:...`):

```json
{
  "measure_range": [1, 4],
  "structure": "Opening arpeggiated pattern — four-measure harmonic template establishing the prelude's texture (C major – A minor – D7 – G major)",
  "key_moments": [
    "m1 C major arpeggio — tonic statement (C-E-G-C-E pattern)",
    "m2 A minor — relative minor color shift",
    "m3 D minor7 — subdominant approach",
    "m4 G major — dominant resolution sets up return"
  ],
  "teaching_goals": [
    "perfectly even rhythm across all 16th-note arpeggios",
    "harmonic awareness within repeating patterns",
    "smooth voice-leading as chord changes"
  ],
  "style_tips": [
    "equal weight on every note — no accent on beat 1",
    "let the harmonic changes do the phrasing",
    "minimal rubato — the flow is the beauty"
  ],
  "teaching_notes": [
    {
      "measure": 1,
      "note": "Each measure is one chord split into 16th notes — hear the harmony, not individual notes.",
      "technique": ["even finger pressure", "wrist relaxed"]
    }
  ]
}
```

**Annotation density varies across records.** Some annotations (Bach mm. 1-4, Mozart K545 mm. 1-4) are richly detailed; others (Pathétique mm. 29-32, Schumann Träumerei mm. 45-48) are sparser, with shorter `key_moments` and a single `teaching_note`. See `KNOWN_LIMITATIONS.md` for the candid disclosure and Slice 11 enrichment targets.

---

## `target_trace` (object, required)

The turn-by-turn MCP session the dataset trains the model to produce. This is the **labels** for the supervised fine-tuning target. Format: a sequence of `user` / `assistant` / `tool` turns.

| Field | Type | Meaning |
|---|---|---|
| `task_family` | string | Short label for the kind of session. All records here: `"analyze-and-play-phrase"`. |
| `objective` | string | What this session is supposed to accomplish. |
| `session` | `Turn[]` (≥1) | The turn sequence. |

Each turn has a discriminator on `role`:

### User turn

```json
{ "turn": 1, "role": "user", "content": "Read measures 1–8 of Für Elise..." }
```

### Assistant turn (may include tool calls)

```json
{
  "turn": 2,
  "role": "assistant",
  "content": "Let me view the piano roll for mm. 1–8.",
  "tool_calls": [
    { "tool": "view_piano_roll",
      "arguments": { "songId": "fur-elise", "startMeasure": 1, "endMeasure": 8 } }
  ]
}
```

### Tool turn (the result of a tool call)

```json
{
  "turn": 3,
  "role": "tool",
  "tool": "view_piano_roll",
  "content": { "svg_returned": true, "measures": 8, "rh_notes": 34, "lh_notes": 15 }
}
```

### Trace shape conventions

- Every `tool_calls[*].tool` name MUST validate against the real AI Jam Sessions MCP surface (extracted to `src/dataset/tool-schemas.json`). The Slice 1 "Option A" discipline: traces use real-surface argument names (e.g. `songId`/`startMeasure` not `song_id`/`measure_range`); unsupported arguments (`dynamic`, `articulation`, `hand: "both"`) do NOT appear in v0 traces.
- The session always opens with a user turn, ends on an assistant summary, and interleaves user/assistant/tool turns in chronological `turn` order.
- The first tool a session calls is typically `view_piano_roll` (the "observation" phase before action). Playback (`play_song` with `mode: "loop"`) is the second tool.
- `annotate_song` does NOT appear as a live tool call in v0 traces — it mutates state and operates whole-song, and reasoning about a phrase is not the same as writing whole-song annotation to disk. The per-phrase annotation lives in `annotation_target`, not as a tool call. A future MCP tool (`annotate_phrase` or similar) could close this gap.

---

## `eval_metadata` (object, required)

Per-record metadata for the eval harnesses (E1 tool-use, E2 phrase-continuation, E3 annotation-grounding).

| Field | Type | Meaning |
|---|---|---|
| `split` | enum | `"train"`, `"val"`, or `"test"`. In this subset, only `"train"` and `"test"` appear. |
| `split_strategy` | string | How the split was determined. All records here: `"stratified by (composer, composition_id) with MIDI byte-hash dedup"`. |
| `leakage_check` | enum | `"passed"`, `"failed"`, or `"pending"`. Most records carry `"pending"` — the leakage check is corpus-scope and lives in the corpus validator, not the per-record artifact. |
| `eval_eligibility` | string[] | Subset of `["E1_tool_use", "E2_phrase_continuation", "E3_annotation_grounding"]`. |
| `phrase_continuation_eligible` | boolean | Whether this record can participate in E2 evaluation. |
| `phrase_continuation_eligible_reason` | string, optional | Human-readable note. |

E2 eligibility key:

- `"prompt"` records: `phrase_continuation_eligible: true`, reason references the paired continuation_target id.
- `"continuation_target"` records: `phrase_continuation_eligible: true`, reason references the paired prompt id.
- `"standalone"` records: `phrase_continuation_eligible: false`, reason explains why (the only standalone in this subset is the legacy Für Elise mm. 1-8 single window).

---

## Splits

Two splits ship in this package: `"train"` (103 records) and `"test"` (12 records). The full list is in `splits.json`. The held-out test set is the **complete `clair-de-lune` song** (all 12 records). It is **never** used for training.

The held-out choice is stratified by composer + style era: Debussy's Impressionist (1905) writing is distinct from every training-set composer's idiom (Bach Baroque, Mozart Classical, Beethoven Classical/early Romantic, Chopin/Schumann Romantic), giving structurally low leakage from train to test.

Pair-lock discipline: every E2 prompt-continuation pair is in the same split. There are no orphans (every continuation_target has a real, in-corpus, same-split prompt mate). The pair lock means a future LoRA fine-tune cannot accidentally train on a continuation whose prompt is in test.

---

## Eval surfaces (what the records support)

| Eval | What it tests | Eligible records | Threshold |
|---|---|---|---|
| E1 — Tool-use correctness | Does the model emit valid MCP tool calls in the right order with right args? | All 115 records | Per-record gold pass rate ≥ 0.70 |
| E2 — Phrase continuation | Given a prompt phrase, does the model produce a continuation with matching groove? | 57 prompt-continuation pairs (114 records) | grooveOA ≥ 0.797 vs gold (locked ≥0.15 margin over shuffled baseline) |
| E3 — Annotation grounding | Does the model use MIDI evidence (not text priors) when answering MCQs about the phrase? | All 115 records | Margins ≥ +0.10 over text-only and random-MIDI controls |

See README.md for the current qwen2.5:7b baseline numbers. See KNOWN_LIMITATIONS.md for what the baselines mean.

---

## Pointer to the canonical schema

If you need machine-validatable schema definitions:

- Zod runtime + TypeScript types: `src/dataset/schema.ts` in the source repo
- MCP tool schemas (for `target_trace` validation): `src/dataset/tool-schemas.json` in the source repo (extracted from the live MCP surface — not hand-maintained)

Validating a record locally:

```ts
import { makeRecordSchema } from "@ai-jam-sessions/dataset/schema";

const schema = makeRecordSchema({ allow_placeholders: false });
const result = schema.safeParse(JSON.parse(recordJson));
if (!result.success) console.error(result.error);
```

`allow_placeholders` is a legacy Slice 1 affordance. All records in this public subset pass the strict (`false`) variant — no `{ todo: "..." }` placeholder tokens exist anywhere in this dataset.
