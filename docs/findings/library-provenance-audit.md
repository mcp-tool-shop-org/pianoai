# Song library provenance audit — 2026-09-09

**Verdict: 12 of the 120 library files are not the song their JSON names, and only 15 of the 120
carry a verified licence.** Every song now carries a `provenance` block in its JSON, written from
evidence and re-checked by a test; the 12 mislabelled files are in `songs/quarantine/` with a block
that says what each one actually is. The library ships 108 songs.

This extends `v1-provenance-audit.md` (the 27 songs of the jam-actions-v1 corpus) to the whole
library, and corrects it: **four of the seven songs that audit called Bernd Krueger / piano-midi.de
are not.** See "Correction to the v1 audit" below before reading anything else that depends on it.

## Method

Three sources of evidence per song, the same three the v1 audit used, now applied to all 120 and
written down where the dataset builders can read them instead of inferring:

1. **The download URL**, parsed from `scripts/download-library.ts` — the file that fetched the
   bytes on 2026-02-20 (commit `4950b56`) and, for six later replacements, the page the bytes were
   taken from. Nine hosts: bitmidi.com (93 songs), mutopiaproject.org (10, counting the two 2026-07
   replacements), piano-midi.de (5), freemidi.org (5), midiworld.com (4), ragtimemusic.com (2),
   mfiles.co.uk (1), mididb.com (1), midisfree.com (1).
2. **The site's terms**, fetched 2026-09-09 and quoted verbatim in the block with the URL they were
   read from (`terms_url`, `terms_quote`). piano-midi.de blocks non-browser clients on the `www.`
   host; the apex host serves the copyright page.
3. **The MIDI file's own text-class meta events** (FF 01 text, 02 copyright, 03 track name, 04
   instrument, 05 lyric, 06 marker, 07 cue), read by `src/songs/midi/meta.ts` on top of the
   `midi-file` parser the ingest pipeline already uses. The block snapshots them
   (`midi_title_events`, `midi_credit_events`, `midi_lyric_head`) and the file's SHA-256.

`scripts/provenance-audit.ts` derives every block from those three plus one table of judgment
(`SONG_FACTS`: who the evidence says made the arrangement, which licence applies, whether the
file is the song). Re-running it reproduces every block byte for byte. `verifier` is always the
evidence — a terms URL, a piece page, the file's own events — never a person or a program.

### What "title verdict" means

- **matches** — a title-class event, or the lyric track, shares a significant token with the JSON
  `title` (or an alias the audit records, e.g. the file's own spelling "Traumeri"). Composer and
  tags are deliberately not consulted: a file that says only "Beethoven" identifies the composer,
  not the piece. 45 songs.
- **no-title-in-file** — the file carries nothing that names a piece (General MIDI instrument
  names, "GS/RESET", track numbers, or no events at all). The song's identity rests on the source
  URL alone. 63 songs.
- **contradicts** — the file's own events name a different piece. 12 songs, all quarantined.

## The twelve mislabelled files

| song | the JSON says | the file says it is | evidence |
|---|---|---|---|
| folk/scarborough-fair | Scarborough Fair | **Greensleeves**, Jim Paterson's mfiles arrangement (a second, byte-different copy of folk/greensleeves) | track name "Greensleeves", text "Traditional", copyright "Jim Paterson" |
| folk/the-water-is-wide | The Water Is Wide | **The Glendy Burk** (Stephen Foster, 1860), sequenced by L. Roberts | instrument-name events "THE GLENDY BURK", "-1860", "Stephen Foster", "Seq. L. Roberts" |
| blues/blues-in-the-night | Blues in the Night (Arlen) | **Blowing Kisses in the Wind** (Paula Abdul) | track names "Blowing Kisses in", "The Wind", "As Performed by:", "Paula Abdul" |
| blues/born-under-a-bad-sign | Born Under a Bad Sign (Albert King) | **Bandido** (Miguel Bosé), a Spanish TUNE 1000 karaoke file, 1994 | "@TBANDIDO", "@TM.Bosé/E.Aldrighetti/O.Avosadro/S.Cossu", Spanish lyric syllables |
| blues/red-house | Red House (Hendrix) | **probably Jailhouse Rock** | the only title event is the track name "Jail Hous" |
| film/cinema-paradiso | Cinema Paradiso Theme (Morricone) | **Chopin, Étude Op. 10 No. 5** — Bernd Krueger's piano-midi.de sequence, re-uploaded to bitmidi | "Etüde Opus 10 No. 5", "Schwarze-Tasten-Etüde", "Copyright © 1999 von Bernd Krüger", "Chopin: Etude Op, 10, No. 5" |
| new-age/divenire | Divenire (Einaudi) | an unidentified piece titled **"Hades awaits even the bravest of mortals someday..."** scored for tambourine, sitar, timpani and "Lava bubble" | track names; contact "gregor_rozman@hotmail.com" |
| new-age/experience | Experience (Einaudi) | **"Capture Ovelia!" from Final Fantasy Tactics**, sequenced by Jeff Copperthite | "Final Fantasy Tactics", "Capture Ovelia!", "By: Jeff Copperthite", "FFT Battle Music Project" |
| new-age/kiss-the-rain | Kiss the Rain (Yiruma) | **Just Can't Get Enough** (Depeche Mode), Roland MT-32 sequence by Henry Choi and Mike Doyle | the title is stated twice in text events |
| new-age/opening-glassworks | Opening (Glassworks, Glass) | **Livre pra Viver** (Pedro Mariano) | marker "Livre pra Viver-Pedro Mariano", track names |
| pop/someone-you-loved | Someone You Loved (Capaldi, 2018) | **Living on My Own** (Freddie Mercury), MdB Software, 1994 | track name "Living on my own", copyright "(C)1994 by MdB Software" |
| rnb/ordinary-people | Ordinary People (John Legend, 2004) | **Johnny B. Goode** (Chuck Berry), Tran Tracks Inc., 1992 | marker "JOHNNY B. GOODE", copyright "(c) Copyright 1992 TRAN TRACKS INC." |

Ten of the twelve came from bitmidi, whose catalogue is a Reddit-posted zip with no curation;
the 2026-07-09 data audit had already found three bitmidi uploads that were loops of unrelated
songs. Each of these twelve had a full `musicalLanguage` annotation written against the wrong
piece and a "ready" status; the annotations travel with the file into quarantine.

**Quarantine, not replacement.** The files and their JSON moved to `songs/quarantine/<genre>/`
unchanged apart from the provenance block, so nothing is lost and nothing is silently swapped. A
replacement re-enters the library only with its own block (source URL, terms, meta events).
`scripts/download-library.ts` carries a `QUARANTINED_IDS` set and skips them, so a fresh bootstrap
cannot fetch the same wrong bytes again; the test checks that set against the quarantine directory.

## Correction to the v1 audit

`v1-provenance-audit.md` lists seven songs as "piano-midi.de / Krueger / CC-BY-SA-3.0-DE".
The download URLs and the files' own events say:

| song | download URL | what the file carries | Krueger? |
|---|---|---|---|
| bach-prelude-c-major-bwv846 | piano-midi.de | "Copyright © 1996 Bernd Krueger" | yes |
| fur-elise | piano-midi.de | "Copyright © 2004 by Bernd Krueger" | yes |
| mozart-k545-mvt1 | piano-midi.de | "Copyright © 2006 by Bernd Krueger" | yes |
| chopin-nocturne-op9-no2 | **midiworld.com**/midis/other/chopin/chno0902.mid | no meta events at all | **no** |
| pathetique-mvt2 | **midiworld.com**/midis/other/beethoven/pathet2.mid | marker "Movement 2 Sonata Pathetique - Beethoven", track "Piano" | **no** |
| schumann-traumerei | **midiworld.com**/midis/other/schumann/traumeri.mid | track names "Traumeri", "Schumann", "Robert Finley" | **no** |
| chopin-prelude-e-minor | **bitmidi.com**/uploads/86322.mid | "A.PIANO 1", "GS/RESET" — an anonymous GM file | **no** |

The four wrong rows trace to one line in the bootstrap: `SOURCE_PMD = "Bernd Krueger, Source:
piano-midi.de (CC BY-SA)"` was written into the `source` field of all ten classical configs
regardless of the URL each was fetched from. The v1 audit read that field. Those four `source`
strings are corrected in this pass (the block's `notes` records the old claim); clair-de-lune is
Krueger's, and satie-gymnopedie-no1 and debussy-arabesque-no1 were replaced from Mutopia in
2026-07 (`03a005a`), which the bootstrap's URL table still does not reflect — the block's
`source_url` is the Mutopia file and `notes` says so.

**What this does to the v1 allowlist:** the "15 publishable" set is **11** — bach, fur-elise,
mozart, and the eight Mutopia rags. chopin-nocturne, chopin-prelude, pathetique and traumerei
carry no licence and leave the set. (clair-de-lune, satie and debussy-arabesque are licence-clean
too, but were held out of v1 for other reasons.) The dataset arc reads the library through an
allowlist built in a separate chunk; that allowlist should be built from the blocks, not from the
v1 table.

## Licence summary

| licence | songs | how established |
|---|---|---|
| CC-BY-SA-3.0-DE | 5 | Krueger copyright event in the file + http://piano-midi.de/copy.htm (bach, clair-de-lune, fur-elise, mozart; and the quarantined cinema-paradiso, which is Krueger's Chopin étude) |
| Public-Domain | 10 | Mutopia piece page "Copyright: Public Domain" + legal page (8 rags, satie, debussy-arabesque) |
| no-redistribution | 3 | mfiles.co.uk/copyright.htm ("must never be redistributed without permission") — simple-gifts, and Jim Paterson's Greensleeves twice (greensleeves; quarantined scarborough-fair) |
| all-rights-reserved | 11 | an explicit copyright claim in the file or on the site: ragtimemusic.com (gladiolus-rag, weeping-willow), mididb/HitTrax (fallin), MdB Software (take-the-a-train; quarantined someone-you-loved), Music Sales Ltd (layla-unplugged), MidiComp (someone-like-you), Blue Max Distribution (fly-me-to-the-moon), "Registered User" (hedwigs-theme), TUNE 1000 (quarantined born-under-a-bad-sign), Tran Tracks (quarantined ordinary-people) |
| unknown | 91 | no licence chain: bitmidi (no terms page at all), midiworld ("All rights reserved" footer, no grant), freemidi, midisfree ("we just share what is available on the network") |

Two things follow that this pass does not decide:

- **The npm package redistributes the library.** `package.json` `files` includes `songs/library`,
  so every published version has shipped the 14 reserved / non-redistributable files and the 91
  unknown ones. That is a licensing question for the Director, not a data one; the blocks now make
  it answerable per file.
- **The README and package description say "120 songs".** The library has 108. Those strings (and
  seven translated READMEs) are not touched here.

Also recorded in the blocks: `new-age/nuvole-bianche-na` is byte-identical to
`film/nuvole-bianche` (same bitmidi upload 70390; `duplicate_of`), and
`new-age/metamorphosis-two` has no title event but its track names describe a brass-band
arrangement (BATERIA, BAJO, TROMPETA, TROMBON), which is hard to square with Glass's solo-piano
piece — identity unverified either way (`title_note`).

## The block

Per song, in `songs/library/<genre>/<id>.json` under `provenance` (schema in
`src/songs/config/schema.ts`, `ProvenanceSchema`):

`source_url`, `source_site`, `arrangement_creator`, `arrangement_license` (closed set above),
`terms_url`, `terms_quote`, `verified_at`, `verifier`, `midi_sha256`, `midi_title_events`,
`midi_credit_events`, `midi_lyric_head`, `credited_parties` (each with `evidence`: `midi-meta` or
a URL), `title_verdict`, and optionally `title_aliases`, `title_note`, `duplicate_of`,
`quarantine {at, actual_piece, reason}`, `notes`.

## The test

`src/songs/provenance.test.ts` (490 cases) re-derives the mechanical half from the bytes beside
each JSON, in the library and in quarantine, and fails when:

- the SHA-256 or the title/credit event snapshot differs from the file — a swapped `.mid` needs a
  new audit (proved red by swapping greensleeves.mid for the quarantined Greensleeves copy);
- a `matches` verdict has no title token in common with the file — the scarborough-fair case
  (proved red by retitling fur-elise "Moonlight Sonata", same composer, same bytes);
- a credit-class event (FF 02, "sequenced by", "arranged by", "typeset", …) names a party within
  three events that `credited_parties` does not, or a credited party never appears in the file
  (proved red by emptying mozart's parties);
- a `contradicts` song is in the library, a quarantined song has no contradiction on record, or
  the bootstrap's `QUARANTINED_IDS` disagrees with `songs/quarantine/`;
- `verifier` has no URL or names a builder;
- library + quarantine is not 120.

`src/songs/midi/meta.test.ts` covers the reader on synthetic files (all seven meta types, control
characters, lyric cap). `datasets/**` is untouched.

## Per song (all 120)

Source is the host the bytes came from; creator and licence are what the evidence supports;
verdict is the title check. Full detail, including the quoted terms and the file's own events, is
in each song's block.

| song | source | arrangement creator | licence | title verdict |
|---|---|---|---|---|
| blues/crossroad-blues | bitmidi.com | IFNI MIDI MUSIC (www.ifni.com) | unknown | matches |
| blues/everyday-i-have-the-blues | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| blues/hoochie-coochie-man | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | matches |
| blues/st-louis-blues | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | matches |
| blues/stormy-monday | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | matches |
| blues/sweet-home-chicago | bitmidi.com | Adamantine Luster (named in the file's marker, with a phone number and FidoNet address) | unknown | matches |
| blues/the-thrill-is-gone | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| classical/bach-prelude-c-major-bwv846 | piano-midi.de | Bernd Krueger (piano-midi.de, 1996, edition 2004-09-25) | CC-BY-SA-3.0-DE | matches |
| classical/chopin-nocturne-op9-no2 | www.midiworld.com | unknown — the file names no creator and midiworld attributes none | unknown | no-title-in-file |
| classical/chopin-prelude-e-minor | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| classical/clair-de-lune | piano-midi.de | Bernd Krueger (piano-midi.de, 1998, edition 2011-08-20) | CC-BY-SA-3.0-DE | matches |
| classical/debussy-arabesque-no1 | www.mutopiaproject.org | Keith OHara (Mutopia typesetter, LilyPond) | Public-Domain | no-title-in-file |
| classical/fur-elise | piano-midi.de | Bernd Krueger (piano-midi.de, 2004, edition 2012-08-30) | CC-BY-SA-3.0-DE | matches |
| classical/mozart-k545-mvt1 | piano-midi.de | Bernd Krueger (piano-midi.de, 2006, edition 2013-09-23) | CC-BY-SA-3.0-DE | matches |
| classical/pathetique-mvt2 | www.midiworld.com | unknown — the file names no creator and midiworld attributes none | unknown | matches |
| classical/satie-gymnopedie-no1 | www.mutopiaproject.org | Evin Robertson (Mutopia typesetter, LilyPond) | Public-Domain | no-title-in-file |
| classical/schumann-traumerei | www.midiworld.com | Robert Finley (named in the file; role not stated) | unknown | matches |
| film/comptine-dun-autre-ete | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| film/forrest-gump | bitmidi.com | Rick Ho (sequenced by, per the file) | unknown | no-title-in-file |
| film/hedwigs-theme | freemidi.org | 'Registered User' (NoteWorthy Composer, 2002; the file claims all rights reserved) | all-rights-reserved | matches |
| film/mia-and-sebastians-theme | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| film/moon-river | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| film/my-heart-will-go-on | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| film/nuvole-bianche | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| film/pink-panther | bitmidi.com | D.W.Barnes (sequence by, per the file) | unknown | no-title-in-file |
| film/schindlers-list-theme | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| folk/amazing-grace | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| folk/auld-lang-syne | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| folk/danny-boy | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| folk/greensleeves | bitmidi.com | Jim Paterson (mfiles.co.uk arrangement, re-uploaded to bitmidi) | no-redistribution | matches |
| folk/house-of-the-rising-sun | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| folk/sakura-sakura | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | matches |
| folk/shenandoah | bitmidi.com | Benjamin Robert Tubb (sequence, 2000, pdmusic.org) of Denes Agay's 1975 piano arrangement | unknown | matches |
| folk/simple-gifts | www.mfiles.co.uk | Music Files Ltd (mfiles.co.uk) — arranger not named in the file | no-redistribution | no-title-in-file |
| jazz/all-the-things-you-are | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| jazz/autumn-leaves | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| jazz/blue-bossa | bitmidi.com | Devian Zikri (arranged by, per the file) | unknown | matches |
| jazz/fly-me-to-the-moon | bitmidi.com | GaryW0001 (transcribed and sequenced for GM, per the file) after Sammy Nestico's arrangement; the file marks '©1995 Blue Max Distribution' | all-rights-reserved | matches |
| jazz/georgia-on-my-mind | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| jazz/misty | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| jazz/my-funny-valentine | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| jazz/round-midnight | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| jazz/summertime | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| jazz/take-the-a-train | bitmidi.com | MdB Software (copyright event, 1994) | all-rights-reserved | matches |
| latin/agua-de-beber | midisfree.com | unknown — the file names no creator and midisfree attributes none | unknown | no-title-in-file |
| latin/besame-mucho | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| latin/black-orpheus | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | matches |
| latin/corcovado | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| latin/desafinado | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| latin/el-condor-pasa | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| latin/girl-from-ipanema | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| latin/mas-que-nada | freemidi.org | unknown — the file names no creator and freemidi attributes none | unknown | matches |
| latin/perfidia | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | matches |
| latin/wave | bitmidi.com | Pedro A. Zaniolo (December 1996, per the file) | unknown | matches |
| new-age/may-be | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| new-age/metamorphosis-two | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| new-age/nuvole-bianche-na | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file — duplicate of film/nuvole-bianche |
| new-age/river-flows-in-you | freemidi.org | unknown — the file names no creator and freemidi attributes none | unknown | matches |
| new-age/una-mattina | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| new-age/watermark | bitmidi.com | unknown — the file's 'Sequenced by:' field says 'Enya', which is not credible as a sequencer credit | unknown | matches |
| pop/a-thousand-years | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| pop/all-of-me | bitmidi.com | Geoffrey Carter (karaoke file, 2014) | unknown | matches |
| pop/bohemian-rhapsody | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| pop/clocks | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | matches |
| pop/imagine | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| pop/let-it-be | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | matches |
| pop/piano-man | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| pop/someone-like-you | bitmidi.com | MidiComp (copyright event) | all-rights-reserved | matches |
| pop/viva-la-vida | freemidi.org | unnamed NoteWorthy Composer user (the copyright template was left unfilled: 'Copyright © <Year> by <Name>') | unknown | matches |
| ragtime/bethena | www.mutopiaproject.org | Magnus Lewis-Smith (Mutopia typesetter, LilyPond) | Public-Domain | no-title-in-file |
| ragtime/elite-syncopations | www.mutopiaproject.org | Benjamin Bloomfield (Mutopia typesetter, LilyPond) | Public-Domain | no-title-in-file |
| ragtime/gladiolus-rag | www.ragtimemusic.com | Colin D. MacDonald (sequence, 1994; performance copyright 1998), edited by Greenfield Bowie (1998) | all-rights-reserved | matches |
| ragtime/maple-leaf-rag | www.mutopiaproject.org | Chris Sawer (Mutopia typesetter, LilyPond) | Public-Domain | no-title-in-file |
| ragtime/peacherine-rag | www.mutopiaproject.org | Antonio Palamà (Mutopia typesetter, LilyPond) | Public-Domain | no-title-in-file |
| ragtime/pineapple-rag | www.mutopiaproject.org | Coyau (Mutopia typesetter, LilyPond) | Public-Domain | no-title-in-file |
| ragtime/solace | www.mutopiaproject.org | Magnus Lewis-Smith (Mutopia typesetter, LilyPond) | Public-Domain | no-title-in-file |
| ragtime/the-easy-winners | www.mutopiaproject.org | Tom Harke (Mutopia typesetter, LilyPond) | Public-Domain | no-title-in-file |
| ragtime/the-entertainer | www.mutopiaproject.org | Chris Sawer (Mutopia typesetter, LilyPond) | Public-Domain | matches |
| ragtime/weeping-willow | www.ragtimemusic.com | Colin D. MacDonald (sequence, 1998; performance copyright 1998) | all-rights-reserved | matches |
| rnb/fallin | www.mididb.com | MMP Sequencing / HitTrax MIDI Files (copyright events, 2008) — commercial demo | all-rights-reserved | no-title-in-file |
| rnb/halo | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | matches |
| rnb/i-will-always-love-you | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | matches |
| rnb/if-i-aint-got-you | bitmidi.com | Don Carroll (sequenced by, Houston, Texas) | unknown | no-title-in-file |
| rnb/isnt-she-lovely | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| rnb/killing-me-softly | bitmidi.com | David Liu (named in the file; converted with W2M) | unknown | matches |
| rnb/no-one | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | matches |
| rnb/ribbon-in-the-sky | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| rnb/superstition | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | matches |
| rock/baba-oriley | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | matches |
| rock/bennie-and-the-jets | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| rock/dont-stop-believin | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| rock/dream-on | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| rock/layla-unplugged | bitmidi.com | Music Sales Ltd (copyright event, 1993) | all-rights-reserved | matches |
| rock/november-rain | bitmidi.com | Anthony Peters (By:, per the file) | unknown | matches |
| rock/rocket-man | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| rock/stairway-to-heaven | bitmidi.com | Uwe Trempelmann (karaoked by, per the file) | unknown | matches |
| rock/tiny-dancer | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| rock/your-song | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| soul/a-change-is-gonna-come | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| soul/aint-no-sunshine | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| soul/dock-of-the-bay | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | matches |
| soul/i-got-you | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| soul/lean-on-me | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | matches |
| soul/lets-stay-together | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| soul/my-girl | www.midiworld.com | unknown — the file names no creator and midiworld attributes none | unknown | matches |
| soul/respect | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | no-title-in-file |
| soul/stand-by-me | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | matches |
| soul/whats-going-on | freemidi.org | unknown — the file names no creator and freemidi attributes none | unknown | no-title-in-file |
| blues/blues-in-the-night | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | contradicts — **quarantined**: Blowing Kisses in the Wind (Paula Abdul) — the file's track names are the song title and 'As Performed by: Paula Abdul' |
| blues/born-under-a-bad-sign | bitmidi.com | TUNE 1000 CORP. (karaoke file, 1994) | all-rights-reserved | contradicts — **quarantined**: Bandido (Miguel Bosé) — a Spanish-language TUNE 1000 karaoke file (@TBANDIDO, @TM.Bosé/E.Aldrighetti/O.Avosadro/S.Cossu) |
| blues/red-house | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | contradicts — **quarantined**: probably Jailhouse Rock — the file's only title-class event is the track name 'Jail Hous' |
| film/cinema-paradiso | bitmidi.com | Bernd Krueger (piano-midi.de, 1999) — a piano-midi.de file re-uploaded to bitmidi | CC-BY-SA-3.0-DE | contradicts — **quarantined**: Chopin, Étude Op. 10 No. 5 in G-flat major ('Black Keys') — Bernd Krueger's piano-midi.de sequence, per its title, copyright and edition events |
| folk/scarborough-fair | bitmidi.com | Jim Paterson (mfiles.co.uk arrangement, re-uploaded to bitmidi) | no-redistribution | contradicts — **quarantined**: Greensleeves (Traditional), Jim Paterson's mfiles arrangement — a second copy, byte-different from folk/greensleeves but with the same title, arranger and instrumentation events |
| folk/the-water-is-wide | bitmidi.com | L. Roberts (sequence, per the file) | unknown | contradicts — **quarantined**: The Glendy Burk (Stephen Foster, 1860), sequenced by L. Roberts |
| new-age/divenire | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | contradicts — **quarantined**: an unidentified piece whose title event reads 'Hades awaits even the bravest of mortals someday...' (gregor_rozman@hotmail.com), scored for tambourine, sitar, harp, timpani and 'Lava bubble' — not Einaudi's Divenire |
| new-age/experience | bitmidi.com | Jeff Copperthite (FFT Battle Music Project, per the file) | unknown | contradicts — **quarantined**: 'Capture Ovelia!' from Final Fantasy Tactics (Hitoshi Sakimoto), sequenced by Jeff Copperthite — the file's own title events |
| new-age/kiss-the-rain | bitmidi.com | Henry Choi and Mike Doyle (Roland MT-32 sequence, per the file) | unknown | contradicts — **quarantined**: Just Can't Get Enough (Depeche Mode) — the file's text events name it twice |
| new-age/opening-glassworks | bitmidi.com | unknown — the file names no creator and bitmidi attributes none | unknown | contradicts — **quarantined**: Livre pra Viver (Pedro Mariano) — the file's marker and track names |
| pop/someone-you-loved | bitmidi.com | MdB Software (copyright event, 1994) | all-rights-reserved | contradicts — **quarantined**: Living on My Own (Freddie Mercury, 1985) — the file's title event; a 1994 file cannot be Lewis Capaldi's 2018 song |
| rnb/ordinary-people | bitmidi.com | Tran Tracks Inc. (copyright event, 1992) | all-rights-reserved | contradicts — **quarantined**: Johnny B. Goode (Chuck Berry) — the file's marker and track name; a 1992 file cannot be John Legend's 2004 song |
