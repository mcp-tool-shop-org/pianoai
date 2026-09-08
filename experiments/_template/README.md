# Experiment template

Copy this directory to start a new dataset and LoRA experiment in this repo.

It exists because there used to be exactly one experiment, `acoustic-sft`, and it was hand-built.
Starting a second one meant copying it and editing, which is how two subtly different eval
methodologies come to exist and neither can be compared to the other. What follows is the contract
that arc paid for, expressed as a type you fill in rather than a document you have to remember.

## The task

```ts
export interface ExperimentTask<TCase> {
  id: string;
  schemaVersion: string;
  verdicts: readonly string[];
  thresholds: Readonly<Record<string, number>>;
  cases(): TCase[];
  splitKey(c: TCase): string;
}
```

Declare it with `defineTask`, which refuses a `schemaVersion` already published by a different
task. Then `cases()` is your corpus, `splitKey` is your holdout unit, and the scaffolding in
`src/dataset/experiment/` gives you SFT formatting, baselines, scoring and a straddle check.

## The seven rules, and what each one cost

**1. Ground truth is constructible.** `cases()` is a function, never a file of hand-written labels.
You build a known thing, perturb it, and the perturbation you chose is the answer. Hand-labelling
at this scale produces a corpus whose errors you cannot find.

**2. Labels are verified against what the tools actually measure**, not only against themselves. A
corpus whose labels agree only with each other passes a weaker test than it appears to and teaches
a model to be confidently wrong. Both experiments here build gold by construction and then assert
the measurement agrees. Look at `generate.ts` in this directory: it throws if the measured answer
and the constructed one differ.

**3. Split by the unit that leaks.** Not by record. The acoustic corpus splits by phrase, because
the same phrase perturbed at a different note is very nearly the same example, and a per-record
split would put near-duplicates on both sides. `assertNoStraddle` enforces whatever unit you pick.

**4. Report per-class accuracy, the trivial baselines, and the base model on the same split.**
Without the last one a result is unfalsifiable. Without the first two, a model that learned nothing
but the class prior looks skilled. `trivialBaselines` computes over your **declared** verdict set,
so a class that never appeared still exists and the majority-class label is always something a
model could actually emit.

That last clause is not hypothetical. The acoustic eval counted one vocabulary and graded against
another, and reported a majority class no model could ever produce. The numbers were right and the
label was wrong, which is the kind of defect that survives review.

**5. Every threshold the answer depends on goes in the record.** Both of the acoustic thresholds
moved once during the arc. A record that omits them cannot be re-scored later, and you will not
remember which run used which value.

**6. Guard bands clear a gate by more than the estimator's own error.** If your tolerance is 40 ms
and your onset detector is good to 10, a case built at 45 ms is not a clean pass.

**7. A new corpus gets a new `schemaVersion`.** Never reuse a published one. The registry knows
every version published under `datasets/` and rejects a different task claiming one.

## The worked example

`task.ts` here asks **which of two instruments stopped sounding first**. Two instruments hold the
same chord, both are stopped at different times, and gold is the earlier release.

It is built from the live ensemble's intent channel, so it constructs no audio graph and needs no
`AudioContext`. That is deliberate twice over: a corpus builder that opens an audio device cannot
run headless, and `createTapOutput` is a live function that must never reach a serialised record.

Note what the question is **not**. "Which instrument stopped sounding" would be answerable by
reading one field, since a stopped instrument has an empty `sounding` array. Asking which stopped
*first* forces a comparison across release times. A corpus where the answer is a field lookup
teaches nothing, and it is an easy shape to build by accident.

**This task is deliberately easy.** Two classes, four cases, a 50% majority baseline, and a rule a
few lines long. It is here to show the pipeline working end to end, not to be hard. Do not read a
high score on it as a result. For a real one, read `experiments/acoustic-sft/` and
`datasets/jam-actions-acoustic-v0/`: 108 records, nine classes, held out by phrase, with the
thresholds in every record.

## Starting your own

1. Copy this directory to `experiments/<your-experiment>/`.
2. In `task.ts`, pick a new `id` and a `schemaVersion` nobody has published, declare your closed
   verdict set and your thresholds, and write `cases()` and `splitKey`.
3. In `generate.ts`, build a record per case and **assert the measured answer equals the
   constructed one**. That assertion is rule 2 and it is the one worth keeping.
4. In `eval.ts`, pass your declared verdict set to `trivialBaselines` and `scorePredictions`.
5. Write the tests: gold is not a field lookup, no `splitKey` straddles the split, and your
   `schemaVersion` is not someone else's.

If you publish the corpus, register its `schemaVersion` in
`src/dataset/experiment/registry.ts`. A test derives the published set from `datasets/` and will
fail until you do.
