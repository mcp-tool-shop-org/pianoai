# Handoff 08 — Grok Build to Claude: the acoustic tool-use dataset

**Paste target:** a fresh Claude session with `E:/AI/ai-jam-sessions` open.
**Arc:** the audio inspector surface.
**This is chunk 8 of that arc.** Chunks 1–7 sit at `4d64b49`. This chunk adds the acoustic corpus builder. Work is in the working tree, uncommitted. Tests are written and unrun.

---

## The arrangement (unchanged)

Tests ship with the code; they run at junctures. Chunk 8 is not a juncture. I did not run `pnpm test`, `pnpm verify`, or `pnpm typecheck`. No installs. No commits. No Zenodo, no Hugging Face. J4 is yours, before LoRA training.

---

## 1. What I built

Started from `feat/audio-inspector` @ `4d64b49`.

### Schema — `src/dataset/acoustic/schema.ts`

`schema_version` is **`jam-actions-acoustic-v0/1.0.0`**. A test rejects `jam-actions-v0/1.0.0`. That string is the DOI corpus; enrichment.ts would treat an impersonator as the published set.

Envelope kept honest:

| field | from jam-actions-v0? |
|---|---|
| `id`, `provenance`, `scope`, `target_trace`, `eval_metadata`, `annotation_target` | yes, same Zod types |
| `observation.midi_sidecar` | yes — the **unperturbed phrase** (the score) |
| `observation.tokens_remi / tokens_abc / piano_roll_svg_*` | **no.** Required on v0; `{todo}` fails strict validation. Not faked. |
| `schema_version` | new id |

Provenance split as ruled:

- `source_type` = score (`transcribed-by-author` for library MIDI / the fixture).
- `observation.render` = audio: `{ engine: "fixtures-sine-v1", seed, recipe, wav_sha256, sample_rate }`.

Thresholds on every record: `timing_ms: 40`, `pitch_fail_cents: 50`, `pitch_warn_cents: 25`, `onset_delta: 0.15`, `min_duration_sec: 0.05`.

### Builder — `src/dataset/acoustic/builder.ts`

`buildRecord(phrase, { seed, kind })` → `AcousticRecord`. `buildKindSet(phrase, seed)` → all nine.

Gold is a function of kind, not a handwritten string:

| kind | gold verdict |
|---|---|
| `clean` | `match` |
| `sharp_60` | `pitch_fail` |
| `sharp_30` | `pitch_warn` |
| `late_80` | `timing_fail` |
| `late_25` | `timing_pass` |
| `dropped` | `missed` |
| `extra` | `extra` |
| `vibrato` | `in_tune` |
| `silence` | `nothing_to_grade` |

Take audio is a monophonic sine/vibrato line plus clicks at onsets, via existing fixtures. WAV is not inlined: recipe + `wav_sha256`. `renderTake(recipe)` must match the hash. Seed picks `target_index`.

Gold traces call catalog tools with required args (`path`, and `song_id` for `score_audio_take`). Silence calls `analyze_audio` and stops; it does **not** call `score_audio_take`. `buildRecord` runs `validateTrace` and throws if the catalog rejects the trace.

No files written under `datasets/`. The builder is the corpus; dumping JSON/WAV is a publish step and is operator-gated.

### Adapter — `src/dataset/acoustic/release-adapter.ts`

Does not rewrite `evaluateReleaseGate`. `toReleaseGateInput` requires `declare_no_enrichment_split: true`, sets `reports_enriched_vs_non_enriched: true`, `enriched.n_records = 0`, whole corpus as `non_enriched`. `random_audio_mean` is what callers measure; the gate field remains `random_midi_mean` on per-record rows (caller fills it). Skipping the declaration throws at the adapter; omitting it on a raw `ReleaseGateInput` fails axis 7, which a test shows.

`NO_ENRICHMENT_SPLIT_DECLARATION` is the sentence the artifact must carry.

### Count

**9 records per (phrase, seed)** via `buildKindSet`. Tests use `fixturePhrase()` (four-note C major line, `record_verdict: internal`, not a library song). I did not pad toward 115. I did not measure a full library-phrase render; N songs stays a later choice of a handful of public-domain works. A small set of constructible golds including vibrato and silence is the product.

### Tests written, unrun

| file | pins |
|---|---|
| `schema.test.ts` | acoustic schema id; rejects jam-actions-v0 impersonation; thresholds |
| `builder.test.ts` | nine golds; vibrato/silence; sha256 round-trip; seed stability; `validateTrace` on every gold trace |
| `release-adapter.test.ts` | refuse skip; axis 7 passes by declaration while blocking axes fail; raw gate fails axis 7 when omitted |

I wanted to run the catalog-validator loop and the hash round-trip. I did not.

---

## 2. What I researched

Opened, to confirm traces will pass J4's catalog check:

- `src/dataset/trace-validator.ts` — validates tool **names and arguments**, not tool result bodies. Unknown tools fail. `analyze_audio` requires `path`; `score_audio_take` requires `path` + `song_id`; `transcribe_audio` requires `path`.
- `src/dataset/tool-schemas.json` — those four audio tools are in the catalog.
- `src/dataset/enrichment.ts` — `schema_version` regex `/^jam-actions-v0\/\d+\.\d+\.\d+$/`.
- `src/dataset/schema.ts` — observation requires REMI/ABC/SVG; `SOURCE_TYPES` has no synthetic-render.
- `release-gate.ts` composition: axes 1–6 blocking; axis 7 fails only if the declaration is omitted.

---

## 3. Schema disagreements (corpus won)

1. **schema_version** must be a new id. Using `jam-actions-v0/…` would impersonate the DOI set.
2. **observation** cannot include REMI/ABC/SVG without faking, and fakes fail strict validation.
3. **source_type** describes the score, not the render. Render lives on `acoustic.render`.
4. **window_role** is `standalone`. Phrase-continuation eligibility is false, with a reason.
5. **annotation_target** keeps the object shape and is filled from the gold (grading question), not fake pedagogy.

---

## 4. Release-gate axes

| axis | transfers? |
|---|---|
| 1 absolute floor | yes |
| 2 tool−text margin | yes; foil is `random_audio`, mapped onto the gate's `random_midi` field |
| 3 tool-call rate | yes |
| 4 correct-after-tool | yes |
| 5 misinterp rate | yes |
| 6 stratum floor | yes; strata = perturbation kind |
| 7 enriched vs not | **does not transfer.** Adapter **declares** that. Enriched n=0. Skipping the axis fails it. |

No LLM assessment exists yet. The adapter is ready for one; the stub test only proves axis 7's declaration path.

---

## 5. Anything wrong in chunks 1–7 / what chunk 9 (you) should do

Nothing new in the analysis layer. One alignment debt, not a defect in this builder: **gold is by construction from the perturbation, not from running `scorePerformance`.** `score_audio_take` against a real library `SongEntry` will need the monophonic reduction's times to match `flattenSongToExpected`. The fixture phrase is not in the song registry. Wiring a public-domain `songId` into `PhraseSpec` (RH top-voice reduction of a short window) is the next build step if you want J4 to grade live WAV against the library rather than against the record's own gold.

### Build (yours)

1. Optionally emit `datasets/jam-actions-acoustic-v0/` from `buildKindSet` for a handful of PD songs. Do not publish.
2. Run an eval that produces `AcousticAssessment` (tool_inspected / text_only / random_audio). Feed `evaluateAcousticReleaseGate`.
3. **J4.** Release gate plus dataset validation. Re-render every recipe and check `wav_sha256`. Run `validateTrace` on every `target_trace`. Do not train a LoRA against an unvalidated corpus.

### Do not

- Do not stamp `jam-actions-v0` onto these records.
- Do not modify `datasets/jam-actions-v0/`.
- Do not publish, tag, or touch Zenodo / Hugging Face.
- Do not render full-texture piano into this corpus until RMVPE exists.
- Do not commit this chunk unless the operator says so.

---

## Working tree

Uncommitted on `feat/audio-inspector` (HEAD `4d64b49`):

```
?? src/dataset/acoustic/schema.ts
?? src/dataset/acoustic/schema.test.ts
?? src/dataset/acoustic/builder.ts
?? src/dataset/acoustic/builder.test.ts
?? src/dataset/acoustic/release-adapter.ts
?? src/dataset/acoustic/release-adapter.test.ts
?? src/dataset/acoustic/index.ts
?? docs/handoffs/audio-inspector-08-grok-to-claude.md
```
