# Handoff 11 — Claude to Grok Build: a dataset that covers the product

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 12.** Branch `main`. **Pull first.**

**This replaces the version of this file pushed an hour ago.** That one asked you to make the
acoustic corpus *harder* — boundary cases, more conversation shapes. It was the wrong brief. It
took the existing corpus's frame as given and asked for a tougher version of something that covers
2% of the product. The Director called that out and was right. What follows is the brief I should
have written.

---

## 1. What we have, measured

The acoustic LoRA trained fine and returned a null result: a fairly-prompted base model scores
0.972 on the held-out phrase, the fine-tune 1.000. One record of gain out of 36. Details in
`experiments/acoustic-sft/RESULTS.md`.

I then went looking for why, and found something bigger than difficulty.

| dimension | the product has | the acoustic corpus uses |
|---|---|---|
| MCP tools | **54** | **3** — `transcribe_audio`, `score_audio_take`, `analyze_audio` |
| songs | **120**, each with MIDI on disk (122 `.mid` files) | **3** |
| genres | **12** — blues, classical, film, folk, jazz, latin, new-age, pop, ragtime, rnb, rock, soul | **1** |
| distinct keys | **20** | a handful |
| per-song teaching content | **120 hand-written** `musicalLanguage` blocks: `description`, `structure`, `keyMoments`, `teachingGoals`, `styleTips` | **none** |
| conversation shapes | — | **2** |
| notes per example | whole pieces | **4** |

The published symbolic corpus, `jam-actions-v0`, is better but not by much: 8 songs, all classical
piano, and its records mention 2 tools.

So between both published datasets we cover roughly **9% of the tool surface, one genre of twelve,
and none of the musical language that is the actual product.** Harmony, chords, voice leading,
sections, transposition, guitar, tunings, vocals, practice loops, the piano roll, the spectrogram
and the live ensemble this arc just built are all at zero.

The corpus is not weak because the perturbations are too easy. It is weak because it grades a
four-note fragment with three tools and calls that a dataset about a music platform.

## 2. The one real constraint, stated honestly so nobody hides behind it

**Licence, not capability.** The library spans twelve genres, but most of it is in copyright:
Arlen, Kern, Morricone, Jobim, Einaudi, Perri, Keys, The Who, Cooke. A *published* corpus cannot
redistribute those or anything derived from them.

What is publishable is the public-domain shelf — **classical, ragtime (Joplin, d. 1917) and folk
(traditional)**, roughly thirty songs across three genres, each with verified arrangement
provenance the way `jam-actions-v0` already did it.

Thirty songs and three genres is **ten times the songs and three times the genres** of what we have
now. And this repo already has the pattern for the rest: `datasets/jam-actions-v0/` is a working
corpus, `datasets/jam-actions-v0-public/` is the published subset, with a provenance note
explaining the difference. Use it.

**Licence explains the genre ceiling. It explains nothing about using 3 tools of 54, ignoring 120
hand-written teaching annotations, or four-note examples.** Do not let it.

## 2b. A defect in the published corpus, found while writing this brief

Rule 2 says labels are verified against what the tools measure. `measured.test.ts` is named as the
thing that does it. It checks **six records** — one per perturbation kind, one fixture phrase, one
seed. The corpus is **108**.

Running that test's own code path across all 108:

| | |
|---|---|
| pitch-relevant records | 36 |
| tracker locks | 23 |
| **returns `untrackable`** | **13** |
| error when locked | max **0.191 cents** |
| error when not | up to **3,121 cents** |

All four Bach `sharp_30` records are among the failures — +28.0 cents applied, **−3,080 cents**
reported. Their gold is constructible and almost certainly right, but the tools cannot confirm it,
so for those records the label agrees only with itself.

Note what this kills: the clearance worry from my first brief was wrong. 3.0 cents of clearance
against 0.191 cents of locked error is a factor of fifteen. **Clearance was never the problem.** The
problem is that on 13 of 36 the tracker does not lock, and nothing ever checked.

Same defect shape as the chord false positive in handoff 07 — *a unit test built from a convenient
fixture can validate the opposite of the real case* — this time with one phrase standing in for
three.

Written up in `docs/findings/v0-label-verification-covers-six-records.md`, with the probe beside it.
**Not fixed in v0**, which is published and must not move. It is a requirement on v1:

- verification runs over **every** record, never a fixture;
- an `untrackable` measurement is a **build failure**. Either the case is rebuilt so the tools can
  measure it, or it does not go in the corpus.

## 3. The design principle, and it is one sentence

**The model must have to call a tool to know the answer.**

That is what both existing corpora violate. They hand over the resolved measurement and then ask
for a verdict, which is reading comprehension. If an example can be answered from the prompt alone,
it teaches nothing and measures nothing, and a base model will match you.

The repo makes this easy in a way we have not used: it is **full of deterministic music engines**,
and every one of them generates constructible gold for a question that cannot be answered without
it. `inferChord` decides chords. `verify_harmony` gates voicings by construction. `list_sections`,
`list_measures` and `transpose_song` are exact. The scorers are deterministic given the thresholds.
The ensemble's intent channel is exact by definition.

Gold by construction, from an engine, on a question the prompt does not answer. That is the shape.

## 4. Task families

Build **families**, not one template with substituted numbers. Each needs constructible gold, a
declared closed verdict set, and the property above. These are candidates — take them, improve
them, drop any that cannot get honest gold, and say which and why.

**F1 — Harmony verification.** Propose a reharmonization; `verify_harmony` gates it. Gold is the
gate's verdict, deterministic. Generate both valid and deliberately invalid voicings so the classes
are balanced by construction rather than by luck. The model cannot know the answer without running
the gate.

**F2 — Chord identification.** Name the chord sounding at a given measure, over real library MIDI.
Gold from `inferChord`. Spans keys and genres for free, and a 4-note reduction cannot fake it.

**F3 — Structural navigation.** Sections, measure ranges, transposition. `list_sections`,
`list_measures`, `transpose_song`. Gold exact. Cheap to build, and it exercises tools no corpus has
ever touched.

**F4 — Teaching selection.** Given a song's `musicalLanguage` and a described student error, choose
the practice setup. This is the one where gold is hardest — be careful, and if you cannot construct
it honestly, say so rather than hand-labelling. **Hand-written labels are forbidden by rule 1 of the
contract.** A defensible version: derive gold from what the deterministic scorer would flag, not
from taste.

**F5 — Acoustic, but across the shelf.** The existing task, on thirty public-domain songs instead of
three, over whole phrases instead of four notes, with the resolved measurements out of the prompt.

**F6 — The live ensemble.** Which instrument stopped, drifted, or is playing the wrong chord tone.
Cross-source comparison, exact by construction, and it uses what this arc built. The template's
`who-first` task is the trivial version; this is the real one.

## 5. Scope for THIS chunk

Do not build all six. Build the **spine plus two families**, so the shape is proven before it is
mass-produced:

- **B1.** The v1 task/schema: prompt-visible versus record-only fields as an explicit, tested
  distinction. Thresholds stay in the record for re-scoring and leave the prompt.
- **B2.** **F2 and F3** — chord identification and structural navigation. Chosen because their gold
  is unarguable, they span the whole library, and between them they touch tools no corpus has used.
- **B3.** A coverage report the corpus builds for itself: tools touched, songs, genres, keys,
  distinct conversation shapes. Committed as an artifact, so "what does this cover" is a number
  rather than an argument. This is the thing whose absence let a 3-tool corpus look finished.
- **B4.** Tests, below.

New `schemaVersion`, new directory. **`jam-actions-acoustic-v0` is published and must not move** —
its reproduction gate has to keep passing untouched.

## 6. Tests

- v0 still reproduces byte-identical; existing gate passes unchanged.
- v1's `schemaVersion` is new and the registry rejects a task reusing v0's.
- **No gate value appears in any prompt-visible field.** The point of B1, and it regresses silently
  without a test.
- **Coverage floors, asserted:** more than 10 distinct tools, more than 20 songs, more than 3
  distinct conversation shapes, and no single shape covering a majority. Fail the build if the
  corpus regresses toward a template.
- Gold agrees with the engine that produced it, re-derived at test time for **every record**,
  never a fixture — see 2b for what the fixture version missed. An `untrackable` or otherwise
  unconfirmable measurement fails the build.
- No `splitKey` straddles the split.

## 7. Do not

- Do not modify `datasets/jam-actions-acoustic-v0/` or its schema version. Published.
- Do not hand-write a single label.
- Do not include copyrighted works in anything destined for publication. Working corpus only, with
  a provenance note, following the `jam-actions-v0` precedent.
- Do not train. Do not run the full suite. Do not install. Do not commit or push.
- Do not write the corpus README's public framing — mine.

## 8. What to say back

`docs/handoffs/live-environment-12-grok-to-claude.md`, five parts. State plainly:

1. **The coverage report's actual numbers** — tools, songs, genres, shapes. Counted, not intended.
2. **Which families you dropped and why.** If F4's gold cannot be constructed honestly, I would
   rather have that as a finding than a corpus with taste baked into it.

## 9. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J1–J5 | chunks 3–11 | escalating | **DONE — 3390 tests** |
| J6 | End of this chunk | full verify, shipcheck, and the v0 reproduction gate | mine |
| J7 | **Before any v1 training** | the fair-prompt baseline on v1, with no fine-tune in existence | mine |

J7 is the lesson of this week and it is not optional. Run the prompted baseline **first**. Had we
done that on v0 we would have known the corpus could not discriminate without renting a GPU to find
out.
