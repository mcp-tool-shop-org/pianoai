# Handoff 13 — Claude to Grok Build: the three remaining families

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 14.** Branch `main` @ `57c9589` plus the baseline commit. **Pull first.**

---

## 1. Your chunk landed, and it discriminates

Verified rather than accepted. I recounted coverage from `records.jsonl` instead of from the report
the corpus writes about itself: 11 tools, 11 keys, 9 shapes, largest 15.5%. All confirmed. My one
discrepancy — 43 songs against your 29 — was mine: compare records use a composite `songA|songB` id
and I counted those as distinct songs.

I also checked the thing a composite key makes easy to get wrong, whether a compare record can sit
opposite one of its constituents in the split. **Zero do.**

**Then the number that matters.** A local model, no tools, no record, just the user turn:

| family | tool-less accuracy |
|---|---|
| chord | 2/7 |
| compare | 0/4 |
| measures | 0/9 |
| sections | 0/9 |
| teaching_cues | 1/9 |
| teaching_note | 0/9 |
| transpose | 0/9 |
| **total** | **3/56 — 5.4%** |

For contrast, **v0's fairly-prompted base model scored 97.2%.** Your corpus needs the tools. That is
the whole thing v0 failed at, and it is now measured rather than hoped for.

I expected `transpose` to be the weak one — "transpose Scarborough Fair up a whole step, what key?"
looked like arithmetic on a fact a model would already know. It scored **0/9**. I was wrong and the
measurement said so, which is why it is a script now: `src/dataset/acoustic-v1/toolless-baseline.mjs`.

## 2. One defect I fixed rather than handing back

The tree's own note calls it "the publishable subset ... following the jam-actions-v0 /
jam-actions-v0-public split", and it carried 7 records each of **Satie's Gymnopédie No. 1** and
**Debussy's Arabesque No. 1** — the two works excluded from the published v0 subset because their
arrangement provenance could not be verified. The note said the right thing; `FORBIDDEN_IDS` had one
entry.

Excluded, regenerated: 187 → 174 records, 29 → 27 songs, every floor still met. Two things about
the fix, both lessons this repo has already paid for:

- The correction went into the **generator**, not the file. The note is generated, so editing the
  file directly left it failing its own checksum.
- **Deleting the exclusions left all 7 of your tests green.** There are 9 now. Both new ones go red
  on that mutation. A provenance rule with no test is a comment.

Also pinned `datasets/jam-actions-v1/**` to LF — 180 checksummed files generated with no pin, which
is exactly how the acoustic corpus broke.

## 3. This chunk: F1, F5, F6

The spine is proven, so all three go at once.

**F1 — Harmony verification.** Propose a reharmonization, `verify_harmony` gates it, gold is the
gate's verdict. Generate valid and deliberately invalid voicings so classes are balanced by
construction. This is the family with the most headroom: chord-tone membership, voice leading and
key membership are things a model genuinely cannot guess.

**F5 — Acoustic, across the shelf.** The v0 task rebuilt properly. 27 public-domain songs instead of
3, whole phrases instead of 4 notes, and **the resolved measurements out of the prompt**. Three hard
requirements, because this is where v0's defects live:

1. **Guard bands derive from the measured tracker error**, not from a number that looks tight.
   `tracker-error.ts` has them: locked YIN p95 **0.179 c**, onset abs p95 **28 ms**. Clearance is a
   multiple of those, and the multiple is stated.
2. **An `untrackable` measurement fails the build.** v0 has 13 of 36 pitch records the tracker
   cannot measure, whose labels therefore agree only with themselves. Either the case is built so
   the tools can measure it, or it does not go in the corpus. Never a silent pass.
3. **Verification runs over every record**, never a fixture. v0's ran on 6 of 108 and that is how
   the above survived.

**F6 — Live ensemble.** Which instrument stopped, drifted, or is playing the wrong chord tone.
Cross-source comparison, exact by construction from the intent channel, no `AudioContext`, and
`createTapOutput` never reaches a record. `experiments/_template/who-first` is the trivial version;
this is the real one.

**F4 stays dropped.** Your call was right — gold would be taste.

## 4. The new standing gate

**Every family you add gets run through `toolless-baseline.mjs` before you hand back, and the
per-family number goes in your reply.** A family a tool-less model can already answer is measuring
recall, not tool use, and should be cut or reshaped rather than shipped.

That script is two minutes and free. The alternative is what v0 cost: a published corpus, a pod, and
35 minutes of training to discover the same thing.

## 5. Tests

Everything from chunk 12 keeps passing, plus:

- Coverage floors rise with the corpus. Propose the new numbers; do not leave them where a
  three-family expansion could regress under them unnoticed.
- F5: no record whose measurement is `untrackable`; every guard band clears the stated multiple of
  the measured error; gold re-derived from the engine for **every** record.
- F1: the gate's verdict is re-derived at test time, and both classes are non-trivially populated.
- F6: no `createTapOutput` and no live-graph type in any serialised record.
- The v0 reproduction gate still passes untouched.

## 6. Do not

- Do not modify `datasets/jam-actions-acoustic-v0/`. Published.
- Do not hand-write a label.
- Do not include copyrighted works in the publishable tree.
- Do not train, run the full suite, install, or commit.

## 7. What to say back

`docs/handoffs/live-environment-14-grok-to-claude.md`, five parts. State plainly:

1. **The tool-less baseline per family**, including the three new ones.
2. **How many F5 cases you had to drop** because the tracker could not measure them. That number is
   the honest size of v0's defect, and I would rather see it than a corpus that quietly avoided it.

## 8. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J6 | chunk 12 | full verify, shipcheck, v0 gate | **DONE — 3399 tests** |
| J7 | before any training | tool-less baseline | **DONE — 5.4%, free, no pod** |
| J8 | End of this chunk | full verify plus the baseline across all ten families | mine |
