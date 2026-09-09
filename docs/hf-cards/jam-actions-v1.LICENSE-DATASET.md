# Layered licensing for `jam-actions-v1`

This dataset combines three layers of intellectual property, and they do not all carry the same
terms. Each record's `provenance` block names its own arrangement licence, so a downstream user can
take any subset by licence.

## 1. Compositions — public domain

Every composition in this dataset is in the public domain in both the United States and the
European Union: Bach (BWV 846), Beethoven (Für Elise), Mozart (K. 545), and eight Scott Joplin rags
(1899–1909). No copyright restriction applies to the underlying music.

## 2. Arrangements (MIDI sequences) — two sources, two licences

| songs | source | arrangement licence | evidence |
|---|---|---|---|
| bach-prelude-c-major-bwv846, fur-elise, mozart-k545-mvt1 | Bernd Krueger, piano-midi.de | **CC-BY-SA-3.0-DE** — https://creativecommons.org/licenses/by-sa/3.0/de/ | the file's own copyright event names Bernd Krueger; terms at http://www.piano-midi.de/copy.htm |
| the-entertainer, maple-leaf-rag, the-easy-winners, elite-syncopations, solace, pineapple-rag, peacherine-rag, bethena | the Mutopia Project (LilyPond typesettings) | **Public Domain** | each piece's Mutopia page states its licence; the file's creator event names LilyPond |

The DE jurisdiction is the governing law for the Krueger arrangements; the obligations — attribution
and share-alike — are those of CC-BY-SA-3.0 generally.

The MIDI bytes themselves are not distributed with this dataset. Each acoustic record carries the
phrase it was rendered from and the render parameters; the source repository re-renders every take
from that block and re-derives every label from the render as part of its tests.

## 3. Derivative records (this dataset) — CC-BY-SA-3.0-DE

Records derived from the three Krueger arrangements inherit the share-alike condition, and the set
is released as one collection under **CC-BY-SA-3.0-DE**, matching jam-actions-v0 so the two can be
combined without a licence boundary. Records derived from the Mutopia typesettings sit inside that
collection with `arrangement_license: Public-Domain` in their provenance; anyone who wants only that
half may take it under public-domain terms.

Downstream users redistributing this dataset, or derivatives of it, must:

1. Attribute **Bernd Krueger / piano-midi.de** for the three Krueger-derived songs.
2. Attribute **the Mutopia Project** and the named typesetters for the eight rags.
3. Attribute **mcp-tool-shop-org** for the dataset (see `CITATION.cff`).
4. Release derivatives under a compatible share-alike licence (CC-BY-SA-3.0, CC-BY-SA-4.0, or
   CC-BY-SA-3.0-DE) and indicate changes made.

## Note on the Hugging Face licence slug

The dataset-card YAML enumerates `cc-by-sa-3.0` and has no `-de` variant; the card therefore
declares `license: cc-by-sa-3.0`, and the jurisdiction is documented here.

## What is not in this dataset, and why

The source library holds 108 songs. Ninety-seven are not here: their MIDI was downloaded from sites
whose terms do not permit redistribution or whose licence could not be established, and the
studio's rule — earned on this dataset — is that nothing ships from unverified provenance. The
per-file audit is `docs/findings/library-provenance-audit.md` in the source repository.
