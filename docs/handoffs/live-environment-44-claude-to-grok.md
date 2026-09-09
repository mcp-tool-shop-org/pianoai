# Handoff 44 — Claude to Grok Build: the suite must survive the purge

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 44.** Branch `main`. **Pull first** — chunk 42 is merged at `5ce0767` and both Zenodo
depositions are minted with it: jam-actions-v1 1.0.0 `10.5281/zenodo.22675239` (new version
under the concept record) and jam-actions-v1-probe `10.5281/zenodo.22675251` (its own record).
The two datasets and the 7B adapter are on Hugging Face. v2.6.0 is on npm.

---

## 1. What is about to happen, and what it breaks

The Director has approved purging the 94 non-free MIDI files (and the 12 quarantined ones) from
the repository's history. After the rewrite the checkout holds MIDI for 14 songs only; CI runners
cannot fetch the rest. I measured the suite with those files moved aside: **42 tests in 8 files
fail**, because their fixtures are non-free songs:

| file | fixture songs that lose their MIDI |
|---|---|
| `src/session.test.ts` | fallin |
| `src/teaching.test.ts` | fallin, imagine |
| `src/mcp-server.test.ts` | fallin |
| `src/piano-roll.test.ts` | fallin |
| `src/cli.test.ts` | fallin |
| `src/vocal/score-clock.test.ts` | amazing-grace (and its `.mid` on disk) |
| `src/songs/provenance.test.ts` | reads the bytes beside every JSON; throws when absent |
| `src/songs/jam.regression.test.ts` | the 108-song inferChord snapshot |

The 14 that stay: bach-prelude-c-major-bwv846, fur-elise, mozart-k545-mvt1, clair-de-lune,
satie-gymnopedie-no1, debussy-arabesque-no1, and the eight Joplin rags (bethena,
elite-syncopations, maple-leaf-rag, peacherine-rag, pineapple-rag, solace, the-easy-winners,
the-entertainer).

## 2. This chunk

**T1. Retarget the fixtures.** Every test that loads the real library and then names a song uses
one of the 14. Where an assertion is tied to the old fixture's structure (a measure count, a key
moment, a chord at measure N, a syllable-to-onset alignment), re-derive the expected value from the
new song the same way the test derives it today and state in the reply what changed and why. Do
not weaken an assertion to make a new song fit; if a test genuinely needs a property only a
non-free song has, say so rather than skip it.

**T2. `provenance.test.ts`** re-derives the byte half only when the `.mid` is present; when absent
it asserts the block still records a 64-hex `midi_sha256` and skips the byte comparison **with a
stated reason**, and the count of skipped songs is printed once.

**T3. `jam.regression.test.ts`** compares the snapshot over the songs present on disk and asserts
at least the 14 are present and unchanged; the committed snapshot stays at 108 songs so a dev who
has fetched the library gets the full gate.

**T4. The proof.** Move the 106 non-free/quarantined `.mid` files aside (the list is at the bottom
of this file), run the full suite once, restore them. Report the counts for both states: with the
files, and without. Both must be green. That single run is the exception to "the juncture is mine",
because it is the acceptance test for this chunk.

**T5.** `README.md` says `library fetch` exists; a one-line note in the contributor section (or
CONTRIBUTING if there is one) that the full suite needs `ai-jam-sessions library fetch
--accept-source-terms` first. Nothing else in the README.

## 3. Do not

- Do not skip a suite wholesale; skip only where T2/T3 say so.
- Do not touch `songs/**`, `datasets/**`, `docs/hf-cards/**`.
- Do not rewrite history; the purge is mine, after this lands.

## 4. What to say back

`docs/handoffs/live-environment-45-grok-to-claude.md`: per file, the fixture change and any
re-derived expectation; the two suite counts from T4; anything you could not retarget and why.

## 5. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J23 | chunk 42 | draft-only run reviewed; merged; both DOIs minted | **DONE** |
| J24 | end of this chunk | full suite with the 106 files present and absent; then the purge, force-push, re-verify | mine |

## Appendix — the 106 paths to move aside for T4

Every `songs/library/<genre>/<id>.mid` whose JSON `provenance.arrangement_license` is not
`CC-BY-SA-3.0-DE` or `Public-Domain` (94 files), plus every `songs/quarantine/<genre>/<id>.mid`
(12 files). `scripts/npm-ship-list.ts`'s `shipRows()` returns the first set; the second is a glob.
