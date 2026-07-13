---
title: "Fine-tuning jam-actions: an honest negative, an underpowered positive, and a powered win"
thumbnail: https://huggingface.co/spaces/mcp-tool-shop/README/resolve/main/banner.jpg
authors:
- user: mikeyfrilot
---

<!-- PUBLISHED 2026-07-12 as an HF community Article: https://huggingface.co/blog/mikeyfrilot/jam-actions-three-arcs
     (org namespace mcp-tool-shop was 403-gated for the free org; published under the personal account per director call).
     HF's /new-blog editor strips this frontmatter and uses the H1 below as the title. -->

# Fine-tuning jam-actions: an honest negative, an underpowered positive, and a powered win

**jam-actions** is a small dataset with an unusual sales pitch: it ships its own *sealed-baseline* evaluation, so you can check whether fine-tuning on it actually helps instead of taking our word for it. Over three preregistered arcs we tested that claim on ourselves. This is the whole story — numbers and all, including the parts that didn't work.

The task: can a 7B model learn to answer questions about a piano phrase by **inspecting the notes with tools** — calling a MIDI inspector to count pitch classes, find the highest note, check which hand plays the downbeat — rather than by pattern-matching prose? Every arc scored the same primary condition (`tool_inspected`) against a **sealed baseline**: a prompted `qwen2.5:7b`, frozen and hashed *before any fine-tune existed*. The victory bar was a paired-win count written into a JSON file **before any model was called**. Five seeds, always; the reported number is the **all-seeds mean**, never best-of-seeds.

## Arc 1 — v0: an honest negative

The first corpus was 78 traces of one task family (analyze-a-phrase-then-play-it). It trained that family *perfectly* — schema-valid tool calls, correct argument names, from epoch 2 — and it made the model **worse** at the thing the sealed eval measures. `tool_inspected` went **0.661 → 0.601** (Δ −0.061), **0 of 5 seeds above baseline**, 4/16 paired wins against a ≥13/16 bar. The clearest tell was the `text_only` control — no MIDI, no tools — which dropped −0.119: the classic catastrophic-forgetting signature. 105 narrow traces taught one family and taxed its neighbors. **No claim shipped. The publish gate did not fire.**

One wrinkle we reported without pooling it into anything: the single *unseen* song in the cohort — clair-de-lune — was the one record that improved (+0.100, n=1). One record proves nothing. Hold that thought.

## Arc 2 — v1: an underpowered positive

The v0 report named its own fix: don't paraphrase more of the same trace — add **grounding-shaped examples** (inspector-tool QA of the kind the eval actually exercises), execution-verified, with the human records kept in the mix. The corpus grew 78 → 494 examples along that axis.

It worked — almost provably. `tool_inspected` rose **0.661 → 0.863** (Δ **+0.202**, p ≈ 0.004), **every one of the five seeds above baseline**, and clair-de-lune went 0.500 → 0.933. But paired wins came in at **12/16 — one short of the 13/16 bar frozen before training**, and the song-cluster confidence interval grazed zero at five clusters.

That bar exists precisely so a near-miss isn't relitigated after seeing the data. So: directionally better, underpowered. **No victory claim. No adapter published.** Two arcs, two non-firings of the same gate — the discipline the dataset sells, demonstrated on ourselves, twice.

That left one honest question: was 12/16 a real ceiling, or just too few records to resolve a real effect?

## Arc 3 — B-1: the powered confirmation

We answered it the only fair way: **freeze everything and widen the test.** The five v1 fine-tunes were pinned by SHA-256 *before the new cohort existed* — no retraining, no reselection, no best-of-anything. A fresh sealed baseline. A **preregistered 36-record cohort** dominated by held-out material, the win bar again written as a number table before the first model call.

The frozen artifacts moved the primary condition **0.678 → 0.890** (Δ **+0.212**; record-CI95 [0.148, 0.275]; **song-cluster CI95 [0.128, 0.305] — excludes zero**, the interval that grazed it at n=16). Paired wins **29/36 (2 ties → n_eff 34) against the ex-ante bar of 24/34**, sign test p = 0.000039.

The headline stratum is the honest one. Twelve **clair-de-lune** records — a piece in **no training corpus of any arc, in any form**, eleven of which had never been scored by anything — came in **0.729 → 0.906, 10/12 wins, p = 0.039 on their own**. v1's single-record wrinkle was not a fluke; the skill transfers to genuinely unseen music. The question the arc existed to answer — power artifact or ceiling? — resolved to **power artifact**. Same frozen artifacts, wider cohort, the effect holds at proper power.

**The publish gate fired.** All five seed adapters are now on the Hub, the claim tied to the all-seeds mean, every per-seed number disclosed.

## What we did *not* earn

Report the losses at equal weight. On every prose-only surface the fine-tunes stay **below** baseline: `full` −0.083, `text_only` −0.074, `random_midi` −0.093. The model answers better by *inspecting* and worse by *recalling prose* — its competence is concentrated where its tools are. The claim stops exactly there, at the tool-grounded surface, and does not extend an inch past it. A future prose-surface retrain is what would target that; nothing here changes that finding.

So the sentence the dataset may now make, with receipts:

> **jam-actions traces, augmented with execution-verified grounding-shaped examples, train a model that beats the prompted baseline at tool-grounded musical QA — +0.21 mean, 29/36 paired wins against a preregistered 24/34 bar, p < 0.0001, strongest on never-trained music — while remaining below baseline when answering from prose alone.**

## See it, hear it, run it

- **⚡ [Live demo](https://huggingface.co/spaces/mikeyfrilot/jam-actions-live)** — pick a phrase (hear it, watch it scroll on a piano roll), then run the prompted baseline and the fine-tune side by side on the same MIDI-inspector task. A **"Surprise me"** button finds a question where the two diverged in the eval — mostly fine-tune rescues, but it will also hand you a case where both models still miss, because that's honest.
- **🧭 [Explorer](https://huggingface.co/spaces/mcp-tool-shop/jam-actions-explorer)** — play every phrase, read the tool-use trace the model is trained to produce, browse the eval interactively. Runs entirely in your browser, no inference cost.
- **📄 [Eval write-up](https://huggingface.co/spaces/mcp-tool-shop/jam-actions-eval)** — the full B-1 report, fixed figures, every receipt.
- **🤖 [Model](https://huggingface.co/mcp-tool-shop/jam-ft-v1-qwen25)** · **💾 [Dataset](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0)** (DOI [10.5281/zenodo.21313954](https://doi.org/10.5281/zenodo.21313954)) · **📚 [Collection](https://huggingface.co/collections/mcp-tool-shop/ai-jam-sessions)**

Every number here is replayable: seeded RNG, 10k bootstrap, 10k permutations, per-record tables, sealed-artifact hashes; preregistrations frozen at named commits before any model call. That's the point — not the win, the fact that you can check it.

*— mcp-tool-shop · [mcptoolshop.com](https://mcptoolshop.com)*
