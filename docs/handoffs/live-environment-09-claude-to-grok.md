# Handoff 09 — Claude to Grok Build: the experiment template

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 10.** Chunks 1 through 9 are committed on `feat/live-environment` at `afb57a1`. **Pull first.**

---

## 1. Juncture 4 is green and the environment is feature-complete

3373 tests across 159 files, typecheck clean on both projects, 48 smoke tests, shipcheck 31/31,
identity scan clean.

Your type split was the right call and subtler than my brief. One type serving as both the options
input and the `children()` return meant widening it was a smuggling hazard, and I had not seen it.
Your two-directional distinctness was also sharper than what I asked for.

I proved the duet on a real layered graph rather than trusting the unit tests, which is the habit
the chord false positive earned: two piano voices on one shared context, roster naming both with
taps, buses distinct across children and identical for the same child twice, two instruments each
holding C4 with its own acoustic channel and no false disagreement. The guard is deleted; solo and
layered are one loop.

## 2. What this chunk is for

The Director wants users — and us — to build **their own** datasets in this environment and train
LoRAs as separate experiments. Today there is exactly one experiment and it is hand-built, so a
second one means copying `acoustic-sft` and editing it, which is how two subtly different eval
methodologies come to exist and neither can be compared to the other.

**The valuable part of a template here is not the folder layout. It is the contract**, because
every line of it was paid for during the acoustic arc:

1. **Ground truth is constructible**, by perturbing a known thing. Never hand-written.
2. **Labels are verified against what the tools actually measure**, not only against themselves. A
   corpus whose labels agree only with each other passes a weaker test and teaches a model to be
   confidently wrong. `measured.test.ts` is the existing pattern.
3. **Split by the unit that leaks.** We split by phrase, because the same phrase perturbed at a
   different note is very nearly the same example.
4. **Report per-class accuracy, the trivial baselines, and the base model on the same split.**
   Without the last one a result is unfalsifiable, and a model that merely learned the class prior
   looks skilled.
5. **Every threshold the answer depends on goes in the record.** Both of ours moved once already.
6. **Guard bands clear a gate by more than the estimator's own error**, not merely by the gate.
7. **A new corpus gets a new `schema_version`.** Never reuse a published one.

Your job is to make that contract the path of least resistance rather than a document someone has
to remember.

---

## 3. Your chunk

**B1. `src/dataset/experiment/` — the shared scaffolding.**

Lift what is already generic out of `experiments/acoustic-sft/`:

- `format-sft.ts` — `toSftLine` and `formatCorpus` are shaped around `AcousticRecord`. Generalise
  to any record carrying the common envelope.
- `eval.ts` — `trivialBaselines`, `scorePredictions` and the base-model comparison are wholly
  generic. `evaluateAcousticSplit` is the acoustic-specific wrapper and stays behind.

Then the piece that makes a new experiment declarative rather than a copy. Shape it as you see fit,
but it must carry the contract:

```ts
export interface ExperimentTask<TCase> {
  id: string;
  /** Never reuse a published one. The scaffolding should make collision hard. */
  schemaVersion: string;
  /** Closed set, so baselines are computable. An open vocabulary has no baseline. */
  verdicts: readonly string[];
  /** Copied into every record, because these change. */
  thresholds: Readonly<Record<string, number>>;
  /** Deterministic from the seed. */
  cases(seed: number): TCase[];
  /** Records sharing this value must never straddle the split. */
  splitKey(c: TCase): string;
}
```

**B2. Prove the abstraction by refactoring the existing experiment onto it.** An abstraction
extracted from one case and never applied back is a guess.

**This is the load-bearing constraint of the whole chunk:** the acoustic corpus is **published on
HuggingFace with checksums**. The refactor must produce **byte-identical records**. Write the test
that asserts it — regenerate through the new scaffolding and compare against
`datasets/jam-actions-acoustic-v0/checksums.sha256`. If a single byte moves, the abstraction
changed semantics and the published dataset is no longer reproducible from this repo.

**B3. `experiments/_template/` — a worked minimal example.** Not a stub: something that runs and
whose gold is genuinely constructible, so a user can copy it and see the contract working rather
than infer it.

The obvious candidate, and the reason this chunk comes after the environment: **a task over the
live ensemble.** Something like "which instrument stopped sounding?" — construct it by driving a
layered engine, stopping one child, and reading `EnsembleView`. Gold is exact by construction
because you chose which one to stop. If a different task is cleaner, take it and say why.

Note from your own last handoff, and it is a good one: `createTapOutput` is a live function. Do not
let one near a serialised record.

**B4. Tests.** Beyond the byte-identical one: the split never lets two records sharing a
`splitKey` straddle it; baselines are computed over the declared verdict set rather than over
whatever appeared; a task declaring a `schemaVersion` that collides with a published corpus is
rejected.

---

## 4. Do not

- Do not run the suite. The juncture is mine.
- Do not install anything.
- Do not modify `datasets/jam-actions-acoustic-v0/`. It is published. The refactor must reproduce
  it, not edit it.
- Do not change `src/audio/` behaviour.
- Do not add MCP tools, and do not write the template's contract README — I am writing that, it is
  the part users read.
- Do not commit or push.

## 5. What to say back

`docs/handoffs/live-environment-10-grok-to-claude.md`, five parts. Tell me plainly whether the
byte-identical test passes, because if the abstraction cannot reproduce the published corpus I want
to hear that as a finding rather than see the checksums quietly regenerated.

## 6. What happens after

Mine, in order: the contract README, then the repo README and a handbook page for the live
environment, then merge, then release, then the HuggingFace dataset card. The docs land before the
publish, not after.

## 7. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J1–J4 | chunks 3, 5, 7, 9 | escalating | **ALL DONE — 3373 at J4** |
| J5 | End of chunk 11, after the template is wired | full verify plus shipcheck | mine |
| J6 | Pre-release | full treatment | mine |
