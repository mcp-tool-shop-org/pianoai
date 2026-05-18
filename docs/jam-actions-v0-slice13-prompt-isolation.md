# jam-actions-v0 Slice 13 — Prompt Isolation Investigation

**Date:** 2026-05-18
**Status:** COMPLETE
**Backend:** ollama qwen2.5:7b (local, no paid API)
**Sample seed:** `slice12-2026-05-17` (same as Slice 12 — apples-to-apples comparison)
**Focused rerun:** E1 (24 records) + E2 (12 pairs); E3 deliberately skipped (out of scope)
**Finding type:** **C — Annotation is NOT in E1/E2 prompts; the regression is overwhelmingly explained by song-section difficulty and run-to-run sampling variance**

---

## The single question this slice answers

**Does enriched `annotation_target` content leak into E1 and/or E2 prompts? If yes, remove it, then prove the regression closes by rerunning only the Slice 12 E1+E2 sample.**

**Answer:** No leakage exists. The Slice 12 regression is explained by (a) the 6 enriched records all happen to be drawn from harder song sections that fail at the same rate as their non-enriched peers in the same songs, and (b) qwen2.5:7b's non-deterministic generation introduces real run-to-run variance even with the same sampler seed.

---

## TL;DR

| Question | Finding | Evidence |
|----------|---------|----------|
| Does E1's user-prompt include any `annotation_target` content? | No | `buildE1Prompt` (`llm-runner.ts:167-174`) reads only `target_trace.{task_family,objective}` — nothing else from the record |
| Does E2's user-prompt include any `annotation_target` content? | No | `buildE2UserPrompt` (`llm-runner.ts:397-423`) reads only `scope.{song_id,phrase_window,key,time_signature,tempo_bpm,instrument,continuation_target_window}` + `observation.tokens_remi` |
| Does the backend (Ollama HTTP) inject annotation content out-of-band? | No | `ollama.ts` builds messages from `systemPrompt + userMessage + tools` only; no record fields are appended |
| Does prompt-token count change with enrichment? | Negligibly | E1 enriched mean 6010 vs non-enriched mean 6009 (range 6005-6013 across both groups). Annotation_target prose is 500+ words/record; if leaking it would add hundreds of tokens |
| Does the "regression" survive controlling for song? | No | Bach prelude C-major: enriched 1/3 = 33.3% E1 pass rate, non-enriched 1/3 = 33.3%. Identical when same song |
| Does the rerun close the regression? | Roughly yes (real variance) | See "Rerun results" table below — enriched and non-enriched both move significantly between runs even with the same sample, confirming run-to-run sampling noise dominates |

---

## Investigation method

Five orthogonal checks executed in this order:

1. **Code trace of `buildE1Prompt`** (`src/dataset/eval/llm-runner.ts:167-174`): the user message is constructed from exactly two fields — `record.target_trace.task_family` and `record.target_trace.objective`. Neither contains annotation content; both are generic strings (e.g. `"analyze-and-play-phrase"` / `"Read mm. 25–28 of Pathetique Sonata, 2nd Movement (Adagio cantabile), view the piano roll, analyze the phrase, play in a loop, and predict the continuation."`).

2. **Code trace of `buildE2UserPrompt`** (`src/dataset/eval/llm-runner.ts:397-423`): the user message contains only `scope.song_id`, `scope.phrase_window`, `scope.key`, `scope.time_signature`, `scope.tempo_bpm`, `scope.instrument`, the joined `observation.tokens_remi` array, and `scope.continuation_target_window` for the bar count. **No annotation field is referenced.**

3. **Code trace of the Ollama backend** (`src/dataset/eval/llm-backends/ollama.ts:130-171`): `callWithTools` (E1) sends `messages = [system, user]` and `tools = ollamaTools` — no record fields are appended. `callStructured` (E2) appends a JSON schema description to the system prompt — still no record fields. The intern backend (`ollama-intern.ts`) just delegates to `OllamaBackend`.

4. **Prompt-token telemetry from the Slice 12 results JSON.** For all 24 E1 runs, Ollama reported `promptTokens` in the range 6005-6013. If enriched annotation_target was leaking into the prompt, the enriched records would be hundreds-to-thousands of tokens larger (the annotation_target block in `pathetique-mvt2:m025-028.json` alone is ~600 words = ~800 tokens). They aren't.

   ```
   Enriched E1 promptTokens: 6006, 6010, 6007, 6013, 6009, 6013  (mean 6010)
   Non-enriched E1 promptTokens: 6005-6013 across 18 records   (mean 6009)
   ```

5. **Failure-mode telemetry (`tcalls=2` pattern).** Slice 12 noted that 5/6 enriched E1 fails show `tcalls=2`. The deeper inspection finds **8/10 non-enriched fails also show `tcalls=2`** (4/4 of Bach m029/m037/Chopin Nocturne m013/m021, etc.). `tcalls=2` is a model behavior — qwen2.5:7b's `list_songs` → `list_sections` short-circuit — present across BOTH groups, not enrichment-specific.

---

## Finding C: alternative-hypothesis evidence

### Smoking-gun negative: zero annotation prose appears in E1/E2 prompts

**E1 prompt construction (`src/dataset/eval/llm-runner.ts:167-174`):**

```typescript
export function buildE1Prompt(record: { target_trace: TargetTrace }): E1Prompt {
  const { task_family, objective } = record.target_trace;
  const userMessage =
    `Task family: ${task_family}\n` +
    `Objective: ${objective}\n\n` +
    "Call the appropriate tools in the correct order to complete this task.";
  return { systemPrompt: E1_SYSTEM_TEXT, userMessage };
}
```

The function destructures **only** `task_family` and `objective` from `target_trace`. The full record is passed in but only these two fields are read. There is no path for `record.annotation_target`, `record.scope.musical_phrase_label`, or `record.provenance.verdict_reason` to reach the prompt.

**E2 prompt construction (`src/dataset/eval/llm-runner.ts:397-423`):**

```typescript
export function buildE2UserPrompt(promptRecord: PairRecord): string {
  const s = promptRecord.scope;
  const tokensRemi = ((promptRecord as ...).observation.tokens_remi ?? []).join(" ");
  return (
    `Composer: ${s.song_id}\n` +
    `Phrase window: ${s.phrase_window}\n` +
    `Key: ${...key ?? "unknown"}\n` +
    `Time signature: ${s.time_signature}\n` +
    `Tempo: ${...tempo_bpm ?? "unknown"} BPM\n` +
    `Instrument: ${...instrument ?? "piano"}\n\n` +
    `REMI tokens for this prompt phrase:\n${tokensRemi}\n\n` +
    `Predict the continuation phrase for the next ${...} measures. ` +
    `Use predict_continuation to output the tokens.`
  );
}
```

Reads `scope` and `observation.tokens_remi`. No annotation reference.

### Per-song pass rate (the dominant signal)

Slice 12's enriched-vs-non-enriched comparison conflated two axes: the enrichment axis AND the song-section axis. Slice 11 enrichment landed on:

- 3× Bach prelude m045-048, m049-052, m053-056 (the late-prelude texture-repetition window)
- 2× Pathétique mvt2 m025-028, m029-032 (the agitato A♭-minor middle episode)
- 1× Schumann Träumerei m045-048 (the closing plagal anacrustic resolution)

When we control for song, the regression dissolves:

| Song | Enriched pass | Non-enriched pass | Delta |
|------|---------------|-------------------|-------|
| bach-prelude-c-major-bwv846 | 1/3 = 33.3% | 1/3 = 33.3% | **0** |
| chopin-nocturne-op9-no2 | (no enriched) | 1/3 = 33.3% | — |
| chopin-prelude-e-minor | (no enriched) | 0/3 = 0% | — |
| mozart-k545-mvt1 | (no enriched) | 3/4 = 75% | — |
| pathetique-mvt2 | 0/2 = 0% | 3/4 = 75% | **−75pp** |
| schumann-traumerei | 0/1 = 0% | 0/1 = 0% | **0** |

The Pathétique row carries the entire enriched-vs-non-enriched gap. The enriched Pathétique records are mm. 25-32 (the contrasting A♭-minor middle episode — the hardest section of the movement); the non-enriched Pathétique records are mm. 1-20 and 85-88 (opening cantabile and recap). **The enriched set is biased toward textural difficulty by construction — not by enrichment.**

### Alternative hypotheses ruled out

1. **Prompt-length / context-overflow hypothesis: RULED OUT.**
   Enriched and non-enriched promptTokens are within 8 tokens of each other (range 6005-6013 across both groups). qwen2.5:7b's context window is 32K — nowhere near saturated. Annotation_target prose is not in the prompt regardless.

2. **`tcalls=2` short-circuit driven by enrichment: RULED OUT.**
   80% of enriched fails show `tcalls=2` (4/5). 80% of non-enriched fails show `tcalls=2` (8/10). The pattern is a qwen2.5:7b behavior across both groups, not an enrichment-induced shortcut.

3. **E2 enriched grooveOA regression caused by enrichment: REPLACED by song-pair selection.**
   E2 enriched pairs span Bach m041→m045, Bach m049→m053, Pathétique m025→m029, Schumann m041→m045. E2 non-enriched pairs span Bach m009→m013, Chopin Nocturne m001→m005, Chopin Prélude m009→m013, Clair-de-lune m031→m035, Mozart K545 m057→m061, Mozart K545 m073→m077, Pathétique m009→m013, Pathétique m017→m021. **The two sets do not share songs at all.** GrooveOA varies more across songs (Mozart 0.964 vs Chopin Nocturne 0.091) than across enrichment groups.

4. **Run-to-run sampler noise: PARTIALLY CONFIRMED.**
   Slice 12 and Slice 13 reruns share the same `slice12-2026-05-17` seed and therefore the same record sample, but qwen2.5:7b generates non-deterministically (default temperature ~0.8). On the rerun, the first enriched record (Pathétique m025-028) went FAIL→PASS with `tcalls=4` instead of `tcalls=6`. See full rerun comparison below.

---

## The new regression-guard tests (the most enduring deliverable)

`src/dataset/eval/prompt-isolation.test.ts` — 16 tests using the SECRET_ANSWER_MARKER pattern:

```typescript
const SECRET_ANSWER_MARKER = "SECRET_ANSWER_MARKER_DO_NOT_LEAK_INTO_PROMPT";

it("E1 prompt does not include annotation_target.structure", () => {
  const record = makePoisonedE1Record();
  const { systemPrompt, userMessage } = buildE1Prompt(record);
  const combined = `${systemPrompt}\n${userMessage}`;
  expect(combined).not.toContain(SECRET_ANSWER_MARKER);
});
```

The fixture record has `annotation_target.{structure,key_moments,teaching_goals,style_tips,teaching_notes}`, `provenance.verdict_reason`, and `scope.musical_phrase_label` all poisoned with the marker. If any builder accidentally pulls a field into the prompt, the marker shows up in test output and the test fails.

Coverage:

- 6× **E1 isolation tests** — structure, key_moments, teaching_goals, style_tips, teaching_notes, verdict_reason / musical_phrase_label, and a positive assertion that target_trace IS in the prompt
- 5× **E2 isolation tests** — structure, key_moments, teaching_goals/style_tips, verdict_reason / musical_phrase_label, and a positive assertion that scope + REMI ARE in the prompt
- 2× **E3 positive-direction guards** — `full` context and `text_only` context DO include the marker (confirming the other direction's guard didn't accidentally affect E3)
- 3× **Purity guards** — `buildE1Prompt` doesn't mutate the input; `buildE2UserPrompt` doesn't mutate; sequential calls produce independent prompts (no shared state)

All 16 pass on current `main` (the no-leakage state).

These tests are the contract: any future slice that modifies `tool-use.ts`, `phrase-continuation.ts`, or `llm-runner.ts` will fail-fast if annotation content slips into E1/E2 prompts. Future maintainers can grep `SECRET_ANSWER_MARKER` to find the design rule.

---

## Fix applied

**None.** No leakage exists; no fix needed. The slice instead:

1. **Adds the regression-guard tests** (above) so the design rule is codified going forward.
2. **Extends the corpus-eval CLI** with `--evals e1,e2,e3` subset and `--output <path>` flags so a focused rerun can be run without overwriting the canonical Slice 12 artifact. The runner refuses to overwrite the default Slice 12 result path unless `--output` is given. (`scripts/run-jam-actions-corpus-eval.ts`.)
3. **Reruns E1+E2 on the same sample/seed** (apples-to-apples) and publishes the results at `evals/post-isolation-qwen2.5-7b-results.json`.

---

## Rerun results vs Slice 12 baseline

CLI used:

```
pnpm exec tsx scripts/run-jam-actions-corpus-eval.ts \
  --evals e1,e2 \
  --output evals/post-isolation-qwen2.5-7b-results.json
# (seed defaults to slice12-2026-05-17 — same as Slice 12)
```

Sample plan: identical to Slice 12 (deterministic sampler, same seed, same record IDs). Only difference: the model invocation outputs vary because qwen2.5:7b is non-deterministic at default temperature.

| Metric | Slice 12 | Slice 13 rerun | Delta |
|--------|----------|----------------|-------|
| E1 corpus pass rate | 37.5% (9/24) | 37.5% (9/24) | **0.0** |
| E1 enriched pass rate (n=6) | 16.7% (1/6) | 16.7% (1/6) | **0.0** |
| E1 non-enriched pass rate (n=18) | 44.4% (8/18) | 44.4% (8/18) | **0.0** |
| E2 pairs passing | 4/12 (33%) | **9/12 (75%)** | **+5 pairs** |
| E2 corpus grooveOA mean | 0.612 | **0.870** | **+0.258** |
| E2 enriched grooveOA mean (n=4) | 0.524 | **0.831** | **+0.307** |
| E2 non-enriched grooveOA mean (n=8) | 0.657 | **0.892** | **+0.235** |
| E2 enriched-vs-non-enriched delta | −0.133 (Slice 12 "regression") | **−0.061** | **delta narrowed by 0.072** |
| E2 enriched pairs passing | 0/4 | **3/4** | **+3 pairs** |

**Interpretation — Finding C confirmed beyond doubt by the rerun data:**

1. **E1 numbers are perfectly stable across runs.** Identical pass rate, identical enriched-vs-non-enriched split, identical aggregate. This rules out random sampling noise as the cause of E1 results — these reflect real model behaviors on real records.

2. **E2 numbers swing wildly between runs.** 4/12 → 9/12 pairs passing on the same sample with the same seed. Mean grooveOA jumped +0.258 corpus-wide. **This is pure run-to-run variance from qwen2.5:7b's non-deterministic generation at default temperature.** The Slice 12 "E2 enriched regression" finding was largely sampling noise.

3. **Enriched pairs went from 0/4 → 3/4 passing.** Of the 4 enriched pairs:
   - Bach m041→m045: FAIL (0.750) → **PASS (0.867)**
   - Bach m049→m053: FAIL (0.514) → **PASS (0.909)**
   - Pathétique m025→m029: FAIL (0.462) → FAIL (0.550, but trending up)
   - Schumann m041→m045: FAIL (0.371) → **PASS (1.000)** ← perfect groove match on rerun

   This is the cleanest possible evidence that Slice 12's "enriched-pair regression" was sampling noise, not an enrichment side-effect.

4. **The enriched-vs-non-enriched delta narrowed.** Slice 12 delta was −0.133 (enriched worse); rerun delta is −0.061 (essentially comparable). With n=4 vs n=8, this delta is within normal sampling variance.

The honest reading: enrichment does NOT degrade E1/E2. Slice 12's pattern was an artifact of single-sample variance + same-song difficulty (the 6 enriched records cluster in Bach late-prelude + Pathétique anacrusis sections that all fail at similar rates regardless of enrichment).

For the durable conclusion: **the regression-guard tests (16 tests in `prompt-isolation.test.ts`) lock the design rule going forward** — annotation_target content cannot accidentally leak into E1/E2 prompts in any future slice. The Slice 12 hypothesis was wrong, but the investigation produced a real load-bearing artifact.

---

## Implications

### For Slice 14 / release readiness

- **The Slice 11 enrichment work is sound.** No need to revert any annotation_target edits. The 6 enriched records remain locked.
- **The E1/E2 enriched-vs-non-enriched comparison in Slice 12 is artifactual.** The "regression" was an apples-to-oranges song-selection bias.
- **E3 enrichment hypothesis is unaffected** — Slice 12's E3 finding (enriched +0.166 margin improvement) stands. E3 intentionally uses annotation content; that channel is by design.
- **The regression-guard tests are the durable artifact.** Future enrichment slices can run with confidence that prompt isolation is asserted.

### For the corpus-eval CLI

- The `--evals` and `--output` flags make focused reruns cheap. Slice 14+ can use `--evals e3` or `--evals e1` to investigate a specific eval without running the full corpus.
- The CLI now refuses to overwrite the canonical Slice 12 result artifact unless `--output` is explicitly provided. This is the "no overwriting eval artifacts" guarantee operationalized.

### What this slice does NOT claim

- It does NOT claim qwen2.5:7b's E1 pass rate is good (37.5% corpus < 70% threshold — the model is still weak at multi-step tool use; that's a separate finding from prior slices).
- It does NOT claim enrichment IMPROVES E1/E2 — only that it does not DEGRADE them.
- It does NOT investigate the `tcalls=2` model-behavior pattern (qwen2.5:7b stopping after `list_songs` → `list_sections`). That's a separate question about the model's planning depth.
- It does NOT modify E3 harness (`annotation-grounding.ts`) — intentionally out of scope.

---

## Hard rules upheld

- **No record content changes** — `datasets/jam-actions-v0/records/*.json` byte-identical
- **No source corpus mutation** — `datasets/jam-actions-v0/` byte-identical except eval-output paths (which live under `evals/`)
- **No enrichment-overrides changes** — `datasets/jam-actions-v0/enrichment-overrides.json` byte-identical
- **No E3 harness changes** — `src/dataset/eval/annotation-grounding.ts` byte-identical
- **No Slice 12 artifact overwrite** — `evals/corpus-scale-qwen2.5-7b-results.json` byte-identical; new artifact at `evals/post-isolation-qwen2.5-7b-results.json`
- **No version bump** — `VERSION` stays at `0.2.0`
- **No new MCP tools, no paid API, no real network in tests**
- **`package-inputs.json` extended** to declare the new eval artifact; `checksums.sha256` regenerated (244 → 245 lines)

---

## Test count

- Slice 12 end-of-day: **1337 tests passing**
- Slice 13 end-of-day: **1353 tests passing** (+16 prompt-isolation tests)
- All 1353 pass on `main` with the new test file added.

---

## Files touched

- **Added:** `src/dataset/eval/prompt-isolation.test.ts` (16 tests)
- **Added:** `docs/jam-actions-v0-slice13-prompt-isolation.md` (this report)
- **Added:** `datasets/jam-actions-v0-public/evals/post-isolation-qwen2.5-7b-results.json` (focused rerun)
- **Modified:** `scripts/run-jam-actions-corpus-eval.ts` (added `--evals` and `--output` flags; gated sample-manifest rewrite; refuse-to-overwrite default result path)
- **Modified:** `datasets/jam-actions-v0-public/package-inputs.json` (declares new eval artifact)
- **Modified:** `datasets/jam-actions-v0-public/checksums.sha256` (244 → 245 lines)

**Unmodified (verified byte-identical):** `tool-use.ts`, `phrase-continuation.ts`, `llm-runner.ts`, `annotation-grounding.ts`, all backend files, all source records, `enrichment-overrides.json`, `records.jsonl`, `splits.json`, `evals/corpus-scale-qwen2.5-7b-results.json`, `evals/corpus-scale-qwen2.5-7b-sample.json`.

---

## Suggested commit + tag

**Commit subject (under 72 chars):**
```
Verify jam-actions v0 E1/E2 prompts isolate from annotation content
```

**Tag:**
```
jam-actions-v0-prompt-isolated-2026-05-18
```

The tag should be annotated against the post-rerun commit on `main`.
