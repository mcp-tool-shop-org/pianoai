# Dataset Card for jam-actions-acoustic-v0

**Version:** 1.0.0
**Not published.** This tree is a local, operator-gated corpus. It has no DOI.

## Summary

108 constructible gold records of grounded MCP tool use over **monophonic audio analysis**. Each record pairs a 4-note right-hand reduction of a public-domain library phrase with a seeded synthetic take and a gold verdict (match, pitch fail/warn, timing fail/pass, missed, extra, in-tune vibrato, or nothing-to-grade silence).

This is **not** a musical edition of the source pieces. A Bach measure contains far more than four notes. Reducing to four sequential right-hand onsets keeps the count honest: 9 perturbation kinds × 4 target notes = 36 records per phrase × 3 phrases = 108.

## Source phrases

| song_id | split | 4-note RH reduction |
|---|---|---|
| bach-prelude-c-major-bwv846 | train | first 4 RH onsets of mm.1–4 |
| schumann-traumerei | train | first 4 RH onsets of mm.1–4 |
| fur-elise | **test** | first 4 RH onsets of mm.1–8 |

**clair-de-lune is not in this corpus.** It is the held-out test split of the published jam-actions-v0 fine-tune arc.

Compositions are public domain. Arrangement metadata is copied read-only from jam-actions-v0 (CC-BY-SA-3.0-DE, Bernd Krueger / piano-midi.de). Audio is original synthetic (`fixtures-sine-v1`), not those MIDI performances.

## Split

Held out **by phrase**, not by record. Random record holdout would leak: the same phrase and kind at a different target note is nearly the same example.

- Train: 72 records (Bach + Schumann)
- Test: 36 records (Für Elise)

**Leaks:** the nine-kind taxonomy, the tool sequence, and the gate numbers (they sit on every record).
**Does not leak:** the held-out melody, its times, or which index was perturbed on that phrase.

## Files

- `records.jsonl` — one record per line, with `split`
- `records/` — the same records as individual JSON files
- `splits.json` — phrase-locked split
- `manifest.json`
- `checksums.sha256`
- This card

No WAV files. Takes re-render from `observation.render.recipe` and must match `wav_sha256`.

## License

Traces and synthetic audio: CC-BY-SA-3.0-DE. Underlying compositions: public domain.
