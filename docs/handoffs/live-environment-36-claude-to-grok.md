# Handoff 36 — Claude to Grok Build: provenance first; the public set waits

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 36 — a repair, replacing the earlier text of this file.** Branch `main`. **Pull first.**
Chunk 34 is verified and committed (`9669159`, CI green); the 371 retrain is in
`experiments/coverage-v1-sft/RESULTS-r34.md`. Read `docs/findings/v1-provenance-audit.md` before
this file.

---

## 1. The result, and then the audit

Your harmony and compare targets took the 3B to **116/117** overall on the 371 corpus and **72/72**
on the probe, and the base alone now scores harmony 13/14 and compare 6/6 — the deciding quantities
were the gap, not the model. That result stands.

What does not stand is the corpus's provenance. `songs/library/` was bulk-downloaded on 2026-02-20
from piano-midi.de, bitmidi.com, mutopiaproject.org, mfiles.co.uk and ragtimemusic.com
(`scripts/download-library.ts` has every URL). The v1 builder wrote `source_type:
transcribed-by-author, verifier: v1-builder` on all 27 songs; that was a stamp. The MIDI files' own
text events name the real arrangers, and the audit sorts the 27 into:

| verdict | songs | licence |
|---|---|---|
| **publishable** | 7 Krueger (piano-midi.de) | CC-BY-SA-3.0-DE |
| **publishable** | 8 Mutopia rags: the-entertainer, maple-leaf-rag, the-easy-winners, elite-syncopations, solace, pineapple-rag, peacherine-rag, bethena | Public Domain, verified per piece page |
| excluded | gladiolus-rag, weeping-willow (ragtimemusic.com, all rights reserved); simple-gifts (mfiles: no redistribution); all nine bitmidi folk tunes (no licence chain) | — |

And two of the nine held-out songs are the wrong file: `scarborough-fair.mid` is Jim Paterson's
Greensleeves; `the-water-is-wide.mid` is Stephen Foster's "The Glendy Burk". Their records are about
a piece that is not the one named.

## 2. This chunk

**V1. The publishable set is an allowlist with evidence.** In `library.ts` (or beside it), an
explicit table of the 15 songs, each carrying: the download URL from `download-library.ts`; the
source's terms as a short quoted string and the URL it was read from; the licence identifier
(`CC-BY-SA-3.0-DE` or `Public-Domain`); the arranger as the MIDI metadata names them (Krueger's
copyright event; Mutopia's LilyPond creator event); and the audit date. `loadPublishableSongs`
returns only allowlisted songs. Genre is no longer a criterion for anything.

**V2. Provenance on every record is the evidence, not a stamp.** `provenance.source_type` becomes
`downloaded-arrangement`; `arrangement_creator`, `arrangement_license`, `source_url`,
`arrangement_evidence_url` and `verifier` are filled from the allowlist row; `verifier` is the
evidence URL or a person, never a program. Keep `composition_pd_status_*` as they are — every
composition is public domain in the US and EU and that part was true.

**V3. A file must be the song it says it is.** A test parses each allowlisted MIDI's text/copyright
meta events and fails if a title event names a different piece than the JSON `title`, or if a
copyright event names a party the allowlist does not. (For the 15 this passes; it exists so the next
library change cannot re-introduce what folk did.)

**V4. Rebuild on 15 songs.** Same builder, same targets, same gates. The split stays by song — say
how many songs are held out and re-check the floors in `schema.ts`; the genre floor is the one that
moves (3 → 2). Two draws per class per song still gives 90 acoustic records; if a family's held-out
count drops below what its gates need, say so with the number rather than loosening the gate.
`datasets/jam-actions-v1/` is regenerated in place — it has never been published, so its schema
version stays `1.0.0`. The probe corpus is rebuilt on the new held-out songs.

**V5. Tool-less baseline** on the new held-out split, per family. It should stay at the floor.

The public-set generator, the Zenodo metadata, the workflow generalisation and the adapter archive
(the earlier text of this handoff) come **after** a retrain on this corpus, in chunk 38.

## 3. Tests

- Every song in the corpus is in the allowlist; every allowlist row has all six evidence fields
  non-empty and a licence in the closed set.
- V3 as above, run on the 15 files.
- Rebuild-equals-committed for the main corpus and the probe.
- Everything from chunks 24–34: arithmetic and shown-work gates, both signs, two draws, two-sided
  margin, no kind token, no prompt-visible threshold or class word, degenerate-gold on `[]`,
  registry owner for every schema, v0 untouched.

## 4. Do not

- Do not touch `songs/library/` itself — the wrong files and the 110 raw songs are a separate task,
  not this chunk. The dataset simply stops reading the unverified ones.
- Do not write card, README or release prose. The three drafts in `docs/hf-cards/` are against the
  27-song corpus and will be rewritten by the coordinator.
- Do not push to HF, Zenodo or a release. No pod. Director's word only.
- Do not run the full suite; the juncture is mine.

## 5. What to say back

`docs/handoffs/live-environment-37-grok-to-claude.md`, four parts. State plainly:

1. The allowlist as a table — song, URL, licence, arranger as the file names them.
2. The new corpus counts: records per family, train/test songs, and any gate that needed its
   floor restated, with the number.
3. Tool-less per family on the new split.
4. The V3 test's output on the 15 files.

## 6. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J18 | chunk 34 | full verify, H1/C1 gates, identity scan, baseline | **DONE — 3,458 green; CI green at `9669159`** |
| J19 | end of this chunk | full verify, the V-gates, the audit table re-checked against the MIDI files, identity scan, baseline | mine |
| — | retrain 3B (and 7B) on the 15-song corpus, then chunk 38: public sets, adapters, Zenodo, v2.6.0 | Director's word | — |
