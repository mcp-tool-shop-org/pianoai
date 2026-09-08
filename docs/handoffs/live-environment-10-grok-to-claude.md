# Handoff 10 — Grok Build to Claude: the experiment contract as scaffolding

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Arc:** live multi-environment. **Chunk 10.** Branch `feat/live-environment` @ `5e45897`.
Work uncommitted. I did **not** run the suite (J5 is yours). I ran the byte-identical test
and the new files in this chunk so I could answer the load-bearing question.

---

## 1. What I built

`src/dataset/experiment/` — the contract as code:

- `ExperimentTask<TCase>` — `cases(): TCase[]` (no seed; determinism is the contract)
- `defineTask` / published-schema registry keyed on **task id + version**
- generic `toSftLine` / `formatRecords`
- generic `trivialBaselines` / `scorePredictions` over the **declared** class set
- `assertNoStraddle` on `splitKey`

Acoustic experiment refactored onto it: `src/dataset/acoustic/task.ts` owns the 3×9×4 grid;
`buildAllRecords` materialises those cases. `experiments/acoustic-sft/{format-sft,eval}.ts`
are thin wrappers. `evaluateAcousticSplit` still reports `per_kind` by perturbation kind.
`clair-de-lune` and held-out-phrase guards stay in the acoustic wrapper.

`experiments/_template/` — worked example, no README (yours).

---

## 2. Byte-identical: **PASSES**

Regenerated through the scaffolding. Hashed in-memory `records.jsonl` **and** all 108
`records/*.json` against `datasets/jam-actions-acoustic-v0/checksums.sha256`.

**Every hash matched.** The published tree was not written. Checksums were not regenerated.

---

## 3. Baselines, template, collision

**majority_class.** Generic baselines use `GOLD_VERDICTS`. Uniform still 1/9, majority still
4/36. `majority_class` is now `"match"` (a label a model can emit), not `"clean"`. Asserted:
overall and per-kind numbers unchanged; `majority_class` is in `GOLD_VERDICTS` and not in
`PERTURBATION_KINDS`.

**Template.** Took the amendment: stop **both**, ask **which stopped first**. At view time both
`sounding` arrays are empty and both appear in `recentlyReleased`; gold is `argmin(startedSec +
heldSec)` across instruments — a comparison, not a field lookup. Exact by construction (we chose
the times), then verified against that measurement. No graph, no `AudioContext`, no
`createTapOutput` on the record. `release_lookback_sec` is in `thresholds`. Split by chord so a
chord cannot straddle. Schema `jam-actions-ensemble-who-first-v0/1.0.0`. I did not find a
cleaner leak-free framing than the one you named.

**Collision.** Owner `acoustic-sft` may declare `jam-actions-acoustic-v0/1.0.0`. A different
task claiming that version throws.

---

## 4. Tests written

- `src/dataset/acoustic/reproduce.test.ts` — jsonl + 108 per-record files vs checksums
- `src/dataset/experiment/{eval,split,registry}.test.ts` — declared class with n=0; straddle
  throws; published version + other task rejected
- `experiments/_template/task.test.ts` — gold from recentlyReleased; no tap in JSON
- `experiments/acoustic-sft/eval.test.ts` — overall/per-kind numbers + majority_class vocabulary

I ran those files. I did not run the rest of the suite.

**Did not:** install, MCP, `src/audio/` behaviour, edits under `datasets/jam-actions-acoustic-v0/`,
template README, commits.

---

## 5. Working tree, and what you pick up

```
 M experiments/acoustic-sft/eval.test.ts
 M experiments/acoustic-sft/eval.ts
 M experiments/acoustic-sft/format-sft.ts
 M src/dataset/acoustic/generate-corpus.ts
 M src/dataset/acoustic/index.ts
?? src/dataset/experiment/
?? src/dataset/acoustic/task.ts
?? src/dataset/acoustic/reproduce.test.ts
?? experiments/_template/
?? docs/handoffs/live-environment-10-grok-to-claude.md
```

**Yours, in the order you named:** contract README, repo README and handbook page for the live
environment, then merge / release / HuggingFace card. Docs before publish. J5 after the template
is wired into whatever you want people to copy.
