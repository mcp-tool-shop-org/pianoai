# jam-actions-v1 provenance audit — 2026-09-09

**Verdict: the 371-record corpus is not publishable as it stands.** 20 of its 27 songs carry no
verified arrangement licence, and two of those are not the song their file says they are. The
builder had stamped all 27 `source_type: transcribed-by-author, verifier: v1-builder` — a label, not
evidence. Eight training runs and three draft cards were produced on that label before this audit.
Nothing has been published.

## Method

Three sources of evidence per song, all in the repo or one fetch away:

1. `scripts/download-library.ts` — the URL each `.mid` was fetched from (commit `4950b56`,
   2026-02-20: "real MIDI files downloaded from piano-midi.de, bitmidi.com, mutopiaproject.org, and
   midiworld.com").
2. The MIDI file's own text, copyright and track-name meta events (FF 01–07).
3. The source site's stated terms, fetched 2026-09-09.

## Per song

| song | source | file's own metadata | site terms | verdict |
|---|---|---|---|---|
| bach-prelude-c-major-bwv846 | piano-midi.de | "Copyright © 1996 Bernd Krueger" | CC-BY-SA-3.0-DE | **publishable** |
| chopin-nocturne-op9-no2 | piano-midi.de | Krueger | CC-BY-SA-3.0-DE | **publishable** |
| chopin-prelude-e-minor | piano-midi.de | Krueger | CC-BY-SA-3.0-DE | **publishable** |
| fur-elise | piano-midi.de | Krueger | CC-BY-SA-3.0-DE | **publishable** |
| mozart-k545-mvt1 | piano-midi.de | Krueger | CC-BY-SA-3.0-DE | **publishable** |
| pathetique-mvt2 | piano-midi.de | Krueger | CC-BY-SA-3.0-DE | **publishable** |
| schumann-traumerei | piano-midi.de | Krueger | CC-BY-SA-3.0-DE | **publishable** |
| the-entertainer | mutopiaproject.org/ftp/JoplinS/entertainer | "creator: GNU LilyPond" | Public Domain (piece page) | **publishable** |
| maple-leaf-rag | mutopia …/maple | LilyPond | Public Domain | **publishable** |
| the-easy-winners | mutopia …/winners | LilyPond | Public Domain | **publishable** |
| elite-syncopations | mutopia …/EliteSyncopations | LilyPond | Public Domain | **publishable** |
| solace | mutopia …/solace | LilyPond | Public Domain | **publishable** |
| pineapple-rag | mutopia …/PineappleRag | LilyPond | Public Domain | **publishable** |
| peacherine-rag | mutopia …/peacherine | LilyPond | Public Domain | **publishable** |
| bethena | mutopia …/bethena | LilyPond | Public Domain | **publishable** |
| gladiolus-rag | ragtimemusic.com/midifile/gladiols.mid | "Source Document: Scott Joplin Collected Piano Works" | site: "All rights reserved"; no MIDI licence stated | excluded |
| weeping-willow | ragtimemusic.com/midifile/weepingw.mid | same sequencer | same | excluded |
| simple-gifts | mfiles.co.uk | (none) | "must never be redistributed without permission, either as is or adapted" | excluded |
| amazing-grace | bitmidi.com/uploads/5856 | anonymous GM multitrack | no licence chain | excluded |
| auld-lang-syne | bitmidi …/8326 | anonymous GM | none | excluded |
| danny-boy | bitmidi …/37684 | "A.PIANO 1" | none | excluded |
| greensleeves | bitmidi …/35089 | "Greensleeves / Traditional / Jim Paterson / Piano" — an mfiles arrangement re-uploaded | Paterson: no redistribution | excluded |
| scarborough-fair | bitmidi …/35290 | **"Greensleeves / Traditional / Jim Paterson"** — the file is Greensleeves, not Scarborough Fair | as above | excluded; **wrong song** |
| shenandoah | bitmidi …/11895 | "This Arrangement Copyright ©2000 by Benjamin Robert Tubb" | not CC | excluded |
| house-of-the-rising-sun | bitmidi …/102514 | anonymous GM | none | excluded |
| the-water-is-wide | bitmidi …/102887 | **"THE GLENDY BURK / Stephen Foster / Seq. L. Roberts"** — the file is a different song | none | excluded; **wrong song** |
| sakura-sakura | bitmidi …/91113 | "Sakura (Cherry Blossoms) / Japanese" | none | excluded |

Already excluded before this audit, correctly: clair-de-lune (v0 holdout), satie-gymnopedie-no1
and debussy-arabesque-no1 (v0 Slice 2.5 finding).

## What this means

- **Training** on the 27-song corpus was not a licence violation: CC licences do not restrict
  training, the Mutopia files are public domain, and the rest were used privately. Creative Commons
  itself says share-alike's reach over trained weights is unsettled. But the studio's own standard is
  the v0 one — nothing published from unverified provenance — and by that standard the four adapters
  trained on the 27-song corpus are not publishable, and neither is the corpus.
- **The result stands as a result.** 54/54, 72/72, 116/117 were measured on held-out songs whose
  arrangements were real; their licence does not change what the model did. What changes is what can
  leave the machine.
- **Two of the nine held-out songs are mislabelled.** `scarborough-fair` and `the-water-is-wide` are
  in the test split; their titles are in the user turns; their tool results are measurements of a
  different piece. Every family's records for those two songs are records about a file that is not
  the song named.
- **Folk is gone.** Every folk file came from bitmidi or mfiles. The publishable corpus is 15 songs,
  classical and ragtime, and the genre count drops from 3 to 2.
- **Base-model licences.** Qwen2.5-7B-Instruct is Apache-2.0. Qwen2.5-3B-Instruct is under Alibaba's
  "qwen-research" licence, which restricts commercial use; a 3B adapter's merged model inherits that.
  The adapter card must say so, and the 7B is the one to lead with if commercial use matters.

## Licence for the published set

Records derived from the seven Krueger arrangements inherit CC-BY-SA-3.0-DE. Records derived from the
eight Mutopia rags derive from public-domain typesettings. The set as a whole is released under
**CC-BY-SA-3.0-DE**, as v0 was: a share-alike collection may contain public-domain-derived items, and
one licence for the set keeps it combinable with v0. Each record's `provenance` block names its own
arrangement licence so a downstream user who wants only the public-domain half can take it.

## Repair

`docs/handoffs/live-environment-36-claude-to-grok.md` (rewritten): the builder's publishable set
becomes an explicit allowlist carrying, per song, the download URL, the site's terms, the licence, and
the MIDI metadata that identifies the arranger; `verifier` names the evidence, never the builder; the
corpus is rebuilt on 15 songs; a test fails on any published song without evidence and on any file
whose own title contradicts its JSON. Then one retrain on the rebuilt corpus, and only then the
public sets. The three cards in `docs/hf-cards/` are drafts against the 27-song corpus and will be
rewritten against the 15-song one before any publish.

The library defect itself — two wrong files, and 110 "raw" songs across copyrighted genres fetched
from the same aggregators — is outside the dataset arc and is filed separately.
