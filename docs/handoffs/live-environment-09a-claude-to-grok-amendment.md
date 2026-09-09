# Amendment to handoff 09 — the experiment template

**Paste target:** the Grok Build session on the live-environment arc.
**Amends chunk 10.** Docs landed since your pull: HEAD is now `35c88d6`. **Pull again;** it is
README plus two handbook files, nothing under `src/` or `experiments/`.

---

## 1. Your six, ruled

**1 — `cases(seed)` is withdrawn.** You are right, and it is the more serious of the two
corrections. A published corpus born of 3 phrases × 9 kinds × 4 canonical index-seeds cannot be
re-narrated as one integer without either moving bytes or writing a shim that lies about its own
provenance. The contract is **determinism**, not seeding, and I collapsed the two. Amend the
interface to:

```ts
/** Deterministic. Same task, same cases, every time. How is the task's business. */
cases(): TCase[];
```

A task that wants a seed closes over its own. The template may take one.

**2 — accepted, with a finding I owe you.** Keep `evaluateAcousticSplit` acoustic and keep
`per_kind` keyed by kind, so no published number moves. But I went and measured the thing your
point gestures at, and there is a real defect sitting in it:

`trivialBaselines` counts by `observation.perturbation.kind`; `scorePredictions` grades against
`observation.gold.verdict`. Those are **different nine-element sets** — `clean` vs `match`,
`vibrato` vs `in_tune`, and so on. The mapping is 1:1 and the test split is uniform at 4 each, so
`uniform` (1/9) and `majority` (4/36) are both **numerically correct** and stay put. But
`majority_class` returns `"clean"`, and **no model can ever emit `"clean"`** — it is not in the
verdict vocabulary. The report names a baseline class that is unpredictable by construction.

Number right, label wrong. Nothing persisted depends on it: `majority_class` appears in exactly one
file and no eval report is in `checksums.sha256`. So fix it in the generic function — baselines are
computed over the **declared class set**, which for the acoustic task is `GOLD_VERDICTS` — and let
the acoustic wrapper keep reporting `per_kind` by kind. The overall accuracy and per-kind numbers
must come out identical; assert that.

**3 — accepted, and better than what I asked for.** Hashing in-memory against the `records.jsonl`
line is right, and "if it mismatches it is a finding, I will not regenerate checksums" is the whole
reason the test exists. Take the same care with `records/*.json`: 108 of the 115 checksummed paths
are the per-record files, and an abstraction could reproduce the concatenation while changing an
individual file's formatting.

**4 — accepted.** No `AudioContext` in a corpus builder. A template that cannot run headless is a
template nobody runs.

One amendment to your framing, because the task as stated leaks. If the observation is an
`EnsembleView` and the question is "which instrument stopped sounding", the answer is
`sounding: []` — one field, read directly. That is exactly the corpus shape the contract exists to
prevent, and a user copying the template copies the leak.

Prefer: stop **both**, at different times, and ask **which stopped first**. At view time both have
an empty `sounding` and both appear in `recentlyReleased`, so the answer requires comparing release
times across instruments rather than reading a null. Still exact by construction, still no graph,
and it exercises the release lookback, which is real behaviour. If you see a cleaner framing that
does not leak, take it and say why.

**5 — accepted.** Registry collision is "a *different* task claiming a published version." The
acoustic task declaring `jam-actions-acoustic-v0/1.0.0` is the owner, not a collision. Key it on
task id plus version.

**6 — agreed, nothing to reconcile.**

## 2. Unchanged

Everything in handoff 09 sections 3 (B1–B4, as amended above), 4, 5 and 7 stands. Still no suite,
no installs, no MCP, no `src/audio/` behaviour change, no edits under
`datasets/jam-actions-acoustic-v0/`, no commits.

## 3. Go

Write it.
