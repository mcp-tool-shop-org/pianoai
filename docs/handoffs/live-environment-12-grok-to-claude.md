# Handoff 12 — Grok Build to Claude: coverage corpus (F2 + F3)

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 12.** Branch `main` @ `6e47327`. Work uncommitted. I did **not** run the suite.
I ran v1's new tests and the v0 reproduction gate so the numbers below are counted.

---

## 1. Coverage report (counted, not intended)

`datasets/jam-actions-v1/coverage.json` — the corpus builds this for itself.

| | |
|---|---|
| n | **187** |
| tools | **11** — `annotation_progress`, `compare_songs`, `detect_chord`, `list_measures`, `list_sections`, `list_songs`, `preview_teaching_cues`, `server_info`, `song_info`, `teaching_note`, `transpose_song` |
| songs | **29** (classical + ragtime + folk; clair-de-lune excluded) |
| genres | **3** — classical, ragtime, folk (licence ceiling, not a design choice) |
| keys | **11** |
| conversation shapes | **9** |
| majority shape | `song_info>list_measures` at **15.5%** (not a majority) |

Floors (`tools > 10`, `songs > 20`, `shapes > 3`, no majority) all met. A build that regresses toward a template fails `assertCoverageFloors`.

Gold is re-derived from the engine on **every** record at test time. Five songs have no F2 chord row: `inferChord` and `detect_chord` disagreed on every measure, so those cases were **omitted**, not labelled from the recipe.

---

## 2. Families dropped, and why

This chunk is the spine plus **F2 and F3**, as scoped.

| family | this chunk | why |
|---|---|---|
| **F2 Chord ID** | built | `inferChord` ∩ `detectChord` on real library LH. 24 songs. |
| **F3 Structure** | built | measure count, sections, transpose (+2 → new key), teaching notes/cues, compare keys. |
| **F1 Harmony verification** | dropped | `verify_harmony` is the right engine; not this slice. |
| **F4 Teaching selection** | dropped | Gold would be taste. Scorer-flagged errors could make it honest later; I will not hand-label. |
| **F5 Acoustic across the shelf** | dropped | Next. Tracker-error numbers are the guard-band **input** (`tracker-error.ts`: locked YIN p95 **0.179 c**, onset abs p95 **28 ms**). v0's 13 untrackable pitch records stay a published finding, not a quiet fix. |
| **F6 Live ensemble** | dropped | Next. `_template/who-first` is the trivial version. |

`suggest_song` was a candidate 11th music tool and is **not** in the corpus: it `Math.random()`s, so gold is not constructible.

---

## 3. Spine

Prompt-visible = `target_trace` only. Record-only = `observation.gold` and `observation.thresholds`. Tested: gate field names do not appear in the trace; user turns do not contain the gold string (when the string is long enough to be identifying).

Schema `jam-actions-v1/1.0.0`, owner `coverage-v1`. Reusing `jam-actions-acoustic-v0/1.0.0` still throws.

Split by `song_id` (catalog/server records have their own keys). No straddle.

v0 reproduction gate: **still passes**. That tree was not touched.

---

## 4. Tests written / what I ran

`src/dataset/acoustic-v1/v1.test.ts` — schema, floors, prompt gates, gold re-derive on every record, split. Plus existing registry collision.

Ran those and `src/dataset/acoustic/reproduce.test.ts`. Did not run the rest of the suite.

**Did not:** train, install, MCP/tool text, v0 edits, public README framing, commits.

---

## 5. Working tree

```
 M src/dataset/experiment/registry.ts
?? src/dataset/acoustic-v1/{schema,library,builder,coverage,task,generate-corpus,v1.test}.ts
?? datasets/jam-actions-v1/
?? docs/handoffs/live-environment-12-grok-to-claude.md
```

`tracker-error.ts` is already on main from the accidental add; left as the F5 guard-band input.

**Yours:** contract/public README, fair-prompt baseline on v1 **before** any fine-tune (J7), then J6 verify+shipcheck+v0 gate.
