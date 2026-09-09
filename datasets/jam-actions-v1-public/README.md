---
license: cc-by-sa-3.0
language:
  - en
language_creators:
  - machine-generated
  - expert-generated
annotations_creators:
  - machine-generated
  - expert-generated
multilinguality:
  - monolingual
source_datasets:
  - original
pretty_name: "AI Jam Sessions — Tool-Use Traces v1 (shown-work targets)"
pretty_description: "146 multi-turn MCP tool-use traces over 11 public-domain piano pieces whose arrangements carry a verified licence, nine task families, split by song. Every assistant turn shows the comparison that decides its answer. Built under a seven-rule experiment contract; rebuilt nine times as each training run — and finally a provenance audit — exposed what the previous version let through. CC-BY-SA-3.0-DE."
size_categories:
  - n<1K
task_categories:
  - text-generation
  - other
tags:
  - music
  - midi
  - audio
  - mcp
  - tool-use
  - symbolic-music
  - piano
  - chain-of-thought
  - fine-tuning
configs:
  - config_name: default
    data_files:
      - split: train
        path: records.jsonl
---

# jam-actions-v1

**Schema:** `jam-actions-v1/1.0.0` · **Records:** 146 (106 train / 40 test, split by song) ·
**Songs:** 11 · **Families:** 9 · **Licence:** CC-BY-SA-3.0-DE ·
**Source repo:** [mcp-tool-shop-org/ai-jam-sessions](https://github.com/mcp-tool-shop-org/ai-jam-sessions)

The successor to [jam-actions-v0](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0).
Where v0 asked whether a model could *use* the tools, v1 asks whether a small model can *reason from
what the tools return* — and it exists in its current shape because, seven training runs in a row,
the answer depended on what the assistant turn was asked to write.

## What a record is

A multi-turn trace: a user question about a piece, the assistant's tool calls against the AI Jam
Sessions MCP server (54 tools in the catalogue, 10 exercised here), the tool results, and a final
assistant turn. Nine families:

| family | n | the question | the final turn |
|---|---|---|---|
| acoustic | 65 | grade a recorded take: `match`, `pitch_fail`, `timing_fail` | `cents 66.9: \|66.9\| − 50 = 16.9, against the gate; onset −9.8: \|9.8\| − 40 = −30.2, inside: pitch_fail` |
| harmony | 19 | does a proposed reharmonisation clear the verifier | `intended Bsus2, detected Csus2: different; chromatic 0/17 = 0.000 − 0.2 = −0.200, inside: rejected` |
| measures | 11 | how many measures | the number |
| transpose | 11 | the key after transposing by an interval | the key |
| teaching_goals | 11 | the song's teaching goals | the list |
| chord | 10 | what chord is the left hand playing in measure N | the symbol |
| key_moments | 8 | the first key moment's measures | the range |
| ensemble | 7 | who entered first / which tone is wrong in a mixed take | the label |
| compare | 4 | do two pieces share a key (train only — the three held-out songs have three keys) | `Eb major, F major: different: different_key` |

The acoustic, harmony and compare turns **show their work**: the measured quantity, the gate it is
held against, the subtraction, the word the subtraction implies, then the label. The label is never
produced by the arithmetic in the record; it is produced by the engine's predicate on the measured
value, and the arithmetic is rendered beside it. A test asserts, for every record, that the printed
numbers equal the tool result, the subtraction is exact, each word equals its predicate, and the
label equals gold.

Nothing prompt-visible carries a threshold, a comparison word, or a class word. The gates (50 cents,
40 ms, a chromatic ratio of 0.2) appear only in assistant turns. The acoustic take paths are opaque
hashes; the tool results are measurements at instrument resolution (0.1 cent, 0.1 ms).

## The experiment contract this corpus was built under

1. Gold is constructible: every label is derived from a render or a computation the repo can redo.
2. Labels are verified against the engine that will grade them, not hand-written.
3. Split by the unit that leaks — the song — never by record.
4. Trivial baselines and the base model are reported on the same split as any adapter.
5. Thresholds live in the record, not in a grader's head.
6. Guard bands exceed estimator error (the acoustic tracker's onset p95 and pitch p95 are measured
   and recorded in `tracker-error.ts`).
7. A new corpus gets a new `schema_version`.

Plus three rules this arc added: gold must vary within every family, in train and in test; no answer
in any prompt-visible field; and a **tool-less baseline** — a local 24B model given the user turn
alone — must sit at the floor before any GPU is spent. It does: 10/40 held out, acoustic 5/17, at
the three-way floor.

And one rule the arc earned last, at some cost: **a song is in the corpus only if its arrangement's
licence is verified from evidence** — the download URL, the source's terms, and the MIDI file's own
copyright and title events — recorded in the song's provenance block. The set is derived from those
blocks by a filter, not typed by hand, and a test locks it at these eleven.

## How it got this shape

Nine rebuilds, each a repair the previous run exposed. The numbers are held-out acoustic takes
(the family where a small model had to compare a measurement to a gate); the base is
Qwen2.5-3B-Instruct with a fair prompt, the adapter a rank-16 LoRA at the same recipe every time.
Rows above the line were measured on a 27-song working corpus that a later provenance audit found
unpublishable; the results were real measurements on real arrangements, and they are the reason the
target looks the way it does, but that corpus is not this dataset.

| corpus | what the target said | base | adapter | what the run showed |
|---|---|---|---|---|
| 268, first build | bare label | — | — | five families with constant gold; withdrawn before training |
| 268, repaired | bare label | 27/69 | 33/69 | p = 0.07; the acoustic prompt still named the class in the path |
| 268, prompt de-leaked | bare label | 9/27 | 10/27 | the floor; the adapter never said `match` |
| 268, comparison in words | `cents 56.4 against a 50-cent gate …` | 10/27 | 20/27 | above the floor — and every miss was a sharp take: it read the minus sign |
| 349, onsets vary, both signs | comparison in words | 20/54 | 47/54 | flat 9/9, sharp 2/9: the sign was the whole gain |
| 349, sign uninformative | comparison in words | 20/54 | 38/54 | pitch 2/18; a near-gate probe then showed the onset word followed the sign of the onset, never its size |
| 349 | **digits of the subtraction** | 20/54 | **54/54** | probe 70/72 (seed 13), 72/72 (seed 42); 7B 54/54 and 72/72 |
| 371, harmony/compare show theirs | digits | 23/54 | **54/54** | 116/117 overall; probe 72/72; the base alone got harmony 13/14 and compare 6/6 once the tool returned the deciding quantities |
| **146, eleven verified songs — this release** | digits | 3B 5/17 · 7B 7/17 | **3B 14/17, 12/17 (two seeds) · 7B 16/17** | 24-take probe: 3B 11/24 and 13/24 — at ~45 training takes the 3B no longer locks the arithmetic or the vocabulary; **7B 24/24**, every band 6/6, arithmetic exact on 22 of 24 |

On the released corpus the size of the training set is the limit for the smaller model: the 3B learns the format and copies the numbers but does not lock the comparison, at either seed; the 7B does, near the gate, on songs it never saw. Three targets, one recipe, identical loss curves: a bare label trained a class prior, a worded
comparison trained sign-reading, and the digits trained the comparison. The corpus never changed
what the model was shown. It changed what the model was asked to write.

Full results, receipts and raw completions for every run are in the source repo under
`experiments/coverage-v1-sft/` (`RESULTS*.md`).

## Files

| file | what |
|---|---|
| `records.jsonl` | the 146 records, one per line |
| `records/` | the same records, one file each |
| `splits.json` | train/test ids; split by song (held out: solace, the-easy-winners, the-entertainer) |
| `manifest.json`, `coverage.json` | counts, tools, songs, shapes, floors — build artefacts, not claims |
| `checksums.sha256` | 156 entries, breadth-first, LF-pinned; verify with `sha256sum -c` |
| `PROVENANCE-NOTE.md` | which songs are excluded and why |
| `LICENSE-DATASET.md`, `CITATION.cff` | licence chain and citation |

The acoustic takes are not shipped as audio. Each acoustic record's `observation.acoustic` block
carries the phrase, the applied cents shift and delay, and the render's `wav_sha256`; the source
repo re-renders every take from that block and re-derives every label from the render as part of
its test suite (rebuild-equals-committed, numeric tolerance 1e-6). One caveat, measured: V8's
transcendental functions are not correctly rounded across Node majors, so `wav_sha256` can differ
between Node 22 and 24 by last-place noise; the labels do not.

## Evaluation companion

[jam-actions-v1-probe](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v1-probe) — 24
acoustic takes on the three held-out songs measured within 10 ms or 5 cents of a gate, both signs,
never trained on. It is the test that told a sign-reader from a comparator when the main split
could not.

## Source data and licence

Eleven public-domain compositions — Bach's Prelude in C (BWV 846), Beethoven's Für Elise, Mozart's
Sonata K. 545 (first movement), and eight Scott Joplin rags — in arrangements from two sources:
Bernd Krueger's piano-midi.de MIDI (three songs, CC-BY-SA-3.0-DE, the file's own copyright event
naming him) and the Mutopia Project's LilyPond typesettings (eight songs, Public Domain, each
piece's Mutopia page). Every record's `provenance` block carries the source URL, the terms it was
read under, the licence, the arranger as the file names them, and the file's SHA-256.

The source library holds 108 songs; 97 are not here because their MIDI came from sites whose terms
do not permit redistribution or whose licence could not be established. Three further songs are
excluded by rule: `clair-de-lune` (the v0 fine-tune holdout), and Satie's Gymnopédie No. 1 and
Debussy's Arabesque No. 1 (provenance unverified in the v0 audit). The exclusions are enforced by
tests, and the audit that produced them is `docs/findings/library-provenance-audit.md` in the
source repo.

The records, traces and annotations are released under **CC-BY-SA-3.0-DE**, the same licence as
jam-actions-v0, so the two sets combine without a licence boundary; `LICENSE-DATASET.md` states the
three layers. Code in the source repo is MIT.

## Citation

See `CITATION.cff`. Cite the concept DOI `10.5281/zenodo.20279918`, which resolves to the latest
version of the jam-actions line, and name the version you used.
