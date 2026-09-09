# Layered licensing for `jam-actions-acoustic-v0`

This dataset combines three distinct layers, and they do not carry the same terms. Read all three
before redistributing.

## 1. Compositions — public domain

The three phrases are drawn from compositions in the public domain in both the United States and
the European Union: J. S. Bach's Prelude in C major BWV 846, Schumann's *Träumerei*, and
Beethoven's *Für Elise*. Every composer died more than seventy years ago. No copyright restriction
applies to the underlying music.

## 2. Arrangements (upstream MIDI) — CC-BY-SA-3.0-DE

The MIDI sequences those phrases were reduced from were arranged by **Bernd Krueger** and published
at **piano-midi.de**, under **Creative Commons Attribution-ShareAlike 3.0 Germany**
(CC-BY-SA-3.0-DE).

This is a **copyleft** licence. Attribution is an obligation, not a courtesy, and any redistributed
derivative must carry the same licence. Bernd Krueger and piano-midi.de must be credited in any
work that uses this dataset.

Full text: https://creativecommons.org/licenses/by-sa/3.0/de/deed.en

## 3. Records, traces and synthetic audio recipes — CC-BY-SA-3.0-DE

The tool-use traces, the perturbation recipes, the gold verdicts and the schema are original work
of mcp-tool-shop-org, released under the same **CC-BY-SA-3.0-DE** so that the whole package travels
under one consistent copyleft term rather than a mixture a redistributor has to untangle.

## A note on the audio

**No audio files are distributed.** Each record stores a deterministic recipe and the SHA-256 of
the waveform it produces. Re-rendering from that recipe reproduces the same bytes on the engine the
corpus was generated with; the hash is not portable across JavaScript engines, and the dataset card
says exactly where and why. The audio is
original synthetic tone generation, not a recording and not a rendering of Bernd Krueger's MIDI
performances. The upstream arrangements contributed the pitch and rhythm of the reduced phrases,
which is why layer 2 applies at all.

## Summary

| Layer | Terms | Obligation |
|---|---|---|
| Compositions | Public domain | None |
| Upstream MIDI arrangements | CC-BY-SA-3.0-DE | Attribute Bernd Krueger / piano-midi.de; share alike |
| Records, traces, recipes | CC-BY-SA-3.0-DE | Attribute mcp-tool-shop-org; share alike |
