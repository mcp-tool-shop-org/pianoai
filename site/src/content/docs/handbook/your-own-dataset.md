---
title: Build your own dataset
description: The experiment scaffolding in this repo — how to declare a task, what the seven rules cost to learn, and why ground truth is constructed rather than written down.
sidebar:
  order: 8
---

This repository ships two datasets and the machinery that built them. That machinery is available
for your own experiments, so you can construct a corpus, train an adapter on it, and score the
result against the same discipline the shipped ones were held to.

Start from [`experiments/_template/`](https://github.com/mcp-tool-shop-org/ai-jam-sessions/tree/main/experiments/_template).
It is a working example, not a stub.

## Declare a task

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

That is the whole surface. `cases()` is your corpus, `splitKey` is the unit you hold out by, and
the scaffolding supplies formatting, scoring, baselines, and a check that no holdout unit ends up
on both sides of the split.

Note what `cases()` does **not** take: a seed. Determinism is the contract; how you achieve it is
your business. The acoustic corpus is a fixed grid of three phrases by nine perturbations by four
target notes, and pretending one integer produced it would have been a lie about its provenance.

## The rules, and what each one cost

**Ground truth is constructible.** You build a known thing, perturb it, and the perturbation you
chose *is* the answer. Nothing is hand-labelled, because at any real scale you cannot find the
errors in hand-labelling.

**Labels are checked against what the tools measure**, not only against each other. A corpus whose
labels agree only among themselves passes a weaker test than it looks like it does, and it teaches
a model to be confidently wrong. The template asserts the measured answer equals the constructed
one and throws when they differ.

**Split by the unit that leaks.** The acoustic corpus splits by phrase, not by record, because the
same phrase perturbed at a different note is very nearly the same example. A per-record split would
have scattered near-duplicates across both sides and reported a score that meant nothing.

**Report the baselines and the base model, not just the result.** A number without the trivial
baselines cannot be distinguished from a model that learned the class prior, and a number without
the base model on the same split is unfalsifiable. Baselines here compute over your **declared**
verdict set, so a class that never appeared still exists and the majority-class label is always
something a model could actually emit.

That last clause is not theoretical. The acoustic evaluation counted one vocabulary and graded
against another, and reported a majority class no model could ever produce. The numbers were right
and the label was wrong, which is the kind of defect that survives review for a long time.

**Every threshold the answer depends on goes in the record.** Both acoustic thresholds moved once
during the build. A record that omits them cannot be re-scored later.

**Guard bands clear a gate by more than the estimator's own error.** If the tolerance is 40 ms and
your detector is good to 10, a case built at 45 ms is not a clean pass.

**A new corpus gets a new schema version.** The registry knows every version published under
`datasets/` and rejects a different task claiming one.

## The example task

The template asks **which of two instruments stopped sounding first**. Two instruments hold the
same chord, both are stopped at different times, and the earlier release is the answer.

It reads the [live ensemble](/ai-jam-sessions/handbook/live-ensemble/)'s intent channel, so it
builds no audio graph and runs headless. That matters: a corpus builder that opens an audio device
cannot run in continuous integration or on someone else's machine.

Notice what the question avoids. "Which instrument stopped sounding" would be answerable by reading
one field, since a stopped instrument has an empty list of sounding notes. Asking which stopped
*first* forces a comparison. A corpus where the label is a field lookup teaches nothing, and it is
an easy shape to build without noticing.

The task is deliberately easy: two classes, four cases, a 50% majority baseline. It demonstrates
the pipeline rather than posing a challenge, so a high score on it is not a result. For a real one,
read the [training dataset](/ai-jam-sessions/handbook/training-dataset/) page.

## Reproducibility is the finish line

The acoustic corpus regenerates from source to all 115 published files with a byte-identical
checksum manifest, and a test asserts it without touching the published tree. If your corpus goes
anywhere public, hold it to the same bar. A dataset nobody can rebuild is a dataset nobody can
check.

Hold it honestly, too. That corpus stores a hash of the audio each record's recipe produces, and
the renderer calls `Math.pow` and `Math.sin` per sample. Neither is required to be correctly
rounded, and V8 changed between Node 22 and Node 24: 253 of the 27,869 distinct `Math.pow(2, x)`
arguments return a different double, which is enough to move 2 of 108 waveform hashes. So the
repository makes two claims instead of one — every other field reproduces on any engine, and the
full byte match holds on the engine the corpus was built with. If a value in your records comes
from floating-point audio rather than from integers and strings, expect the same and say so.
