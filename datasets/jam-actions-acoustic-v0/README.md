---
license: cc-by-sa-3.0
language:
  - en
language_creators:
  - expert-generated
  - machine-generated
annotations_creators:
  - machine-generated
multilinguality:
  - monolingual
source_datasets:
  - original
pretty_name: "AI Jam Sessions — Acoustic Tool-Use Traces v0"
pretty_description: "108 constructible-gold records of grounded MCP tool use over monophonic AUDIO analysis — the counterpart to jam-actions-v0's symbolic traces. Each record pairs a deliberately perturbed synthetic rendering of a public-domain phrase with the verdict the analysis tools actually return, so every label is checked against the instrument rather than only against itself. Held out by phrase. Released under CC-BY-SA-3.0-DE."
size_categories:
  - n<1K
task_categories:
  - text-generation
  - audio-classification
  - other
tags:
  - music
  - audio
  - audio-analysis
  - mcp
  - tool-use
  - pitch-detection
  - onset-detection
  - piano
  - classical
configs:
  - config_name: default
    data_files:
      - split: train
        path: records.jsonl
---
# Dataset Card for jam-actions-acoustic-v0

**Version:** 1.0.2
Published at [mcp-tool-shop/jam-actions-acoustic-v0](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-acoustic-v0). No DOI.

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
- `VERSION`
- `CITATION.cff`
- `LICENSE-DATASET.md`
- `checksums.sha256` — every other file, sorted breadth-first by path
- This card

Every one of those is generated from the source repository, so the whole tree rebuilds from code.

## Re-rendering the audio

No WAV files ship. Each take re-renders deterministically from `observation.render.recipe`, and `wav_sha256` is the hash of the waveform it produces.

**That hash is engine-dependent, and you should know before you check it.** The renderer calls `Math.pow` and `Math.sin` once per sample, and ECMA-262 does not require either to be correctly rounded. V8's results changed between Node 22 and Node 24: of the 27,869 distinct `Math.pow(2, x)` arguments this corpus evaluates, 253 (0.91%) return a different double. Nearly all of that disappears under 16-bit quantisation, but **2 of the 108 records do not survive it** — both the `extra` perturbation of Für Elise, whose motif sits on MIDI 63, the one pitch where the semitone ratio itself differs by a unit in the last place.

So:

- **Every other field of every record reproduces on any engine.** Verify the download against `checksums.sha256` and it matches everywhere.
- **`wav_sha256` matches on Node 22**, the engine this corpus was generated on. On Node 24 expect those two records to differ. That is this, not a corrupt download.

Making the waveform bit-portable means replacing the transcendentals, which changes every hash and therefore every record. It would need a new `schema_version`, so it has not been done.

## License

Traces and synthetic audio: CC-BY-SA-3.0-DE. Underlying compositions: public domain. See `LICENSE-DATASET.md` for the three layers and what each obliges.
