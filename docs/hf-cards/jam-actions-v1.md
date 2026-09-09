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
pretty_description: "371 multi-turn MCP tool-use traces over 27 public-domain piano pieces, nine task families, split by song. Every assistant turn shows the comparison that decides its answer. Built under a seven-rule experiment contract; the corpus was rebuilt eight times as each training run exposed what the previous target let a small model read instead of compute. CC-BY-SA-3.0-DE."
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

**Schema:** `jam-actions-v1/1.0.0` · **Records:** 371 (254 train / 117 test, split by song) ·
**Songs:** 27 · **Families:** 9 · **Licence:** CC-BY-SA-3.0-DE ·
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
| acoustic | 162 | grade a recorded take: `match`, `pitch_fail`, `timing_fail` | `cents 66.9: \|66.9\| − 50 = 16.9, against the gate; onset −9.8: \|9.8\| − 40 = −30.2, inside: pitch_fail` |
| harmony | 43 | does a proposed reharmonisation clear the verifier | `intended Bsus2, detected Csus2: different; chromatic 0/17 = 0.000 − 0.2 = −0.200, inside: rejected` |
| compare | 36 | do two pieces share a key | `Eb major, F major: different: different_key` |
| chord | 22 | what chord is the left hand playing in measure N | the symbol |
| measures | 27 | how many measures | the number |
| transpose | 27 | the key after transposing by an interval | the key |
| teaching_goals | 27 | the song's teaching goals | the list |
| key_moments | 20 | the first key moment's measures | the range |
| ensemble | 7 | who entered first / which tone is wrong in a mixed take | the label |

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
alone — must sit at the floor before any GPU is spent. It does: 31/117 held out, at or below the
three-way floor in every family.

## How it got this shape

Eight rebuilds, each a repair the previous training run exposed. The numbers are held-out acoustic
takes (the family where a small model had to compare a measurement to a gate); the base is
Qwen2.5-3B-Instruct with a fair prompt, the adapter a rank-16 LoRA at the same recipe every time.

| corpus | what the target said | base | adapter | what the run showed |
|---|---|---|---|---|
| 268, first build | bare label | — | — | five families with constant gold; withdrawn before training |
| 268, repaired | bare label | 27/69 | 33/69 | p = 0.07; the acoustic prompt still named the class in the path |
| 268, prompt de-leaked | bare label | 9/27 | 10/27 | the floor; the adapter never said `match` |
| 268, comparison in words | `cents 56.4 against a 50-cent gate …` | 10/27 | 20/27 | above the floor — and every miss was a sharp take: it read the minus sign |
| 349, onsets vary, both signs | comparison in words | 20/54 | 47/54 | flat 9/9, sharp 2/9: the sign was the whole gain |
| 349, sign uninformative | comparison in words | 20/54 | 38/54 | pitch 2/18; a near-gate probe then showed the onset word followed the sign of the onset, never its size |
| 349 | **digits of the subtraction** | 20/54 | **54/54** | probe 70/72 (seed 13), 72/72 (seed 42); 7B 54/54 and 72/72 |
| **371, this release** | digits, and harmony/compare show theirs | 23/54 | **54/54** | **116/117 overall; probe 72/72** |

Three targets, one recipe, identical loss curves: a bare label trained a class prior, a worded
comparison trained sign-reading, and the digits trained the comparison. The corpus never changed
what the model was shown. It changed what the model was asked to write.

The last row also carries a finding from the other side. Before this release `verify_harmony` echoed
the proposal and no tool returned a key, so harmony sat at the majority class and compare at chance
for every adapter. Once the tool results carried the intended and detected chords and the two keys,
the **base model** scored harmony 13/14 and compare 6/6 with no adapter at all. A model can compare
two things it is shown; it cannot compare a thing it is not shown, and no adapter makes it.

Full results, receipts and raw completions for every run are in the source repo under
`experiments/coverage-v1-sft/` (`RESULTS*.md`).

## Files

| file | what |
|---|---|
| `records.jsonl` | the 371 records, one per line |
| `records/` | the same records, one file each |
| `splits.json` | train/test ids; split by song |
| `manifest.json`, `coverage.json` | counts, tools, songs, shapes, floors — build artefacts, not claims |
| `checksums.sha256` | 377 entries, breadth-first, LF-pinned; verify with `sha256sum -c` |
| `PROVENANCE-NOTE.md` | which songs are excluded and why |
| `LICENSE-DATASET.md`, `CITATION.cff` | licence chain and citation |

The acoustic takes are not shipped as audio. Each acoustic record's `observation.acoustic` block
carries the phrase, the applied cents shift and delay, and the render's `wav_sha256`; the source
repo re-renders every take from that block and re-derives every label from the render as part of
its test suite (rebuild-equals-committed, numeric tolerance 1e-6). One caveat, measured: V8's
transcendental functions are not correctly rounded across Node majors, so `wav_sha256` can differ
between Node 22 and 24 by last-place noise; the labels do not.

## Evaluation companion

[jam-actions-v1-probe](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v1-probe) — 72
acoustic takes on the nine held-out songs measured within 10 ms or 5 cents of a gate, both signs,
never trained on. It is the test that told a sign-reader from a comparator when the main split
could not.

## Source data and licence

The 27 pieces are public-domain compositions — Bach, Mozart, Beethoven, Chopin, Schumann, Joplin,
Brackett, and traditional English, Irish, Scottish, American and Japanese tunes — transcribed by the
AI Jam Sessions team (`source_type: transcribed-by-author` on every record). Three songs present in
the working library are excluded here: `clair-de-lune` (the v0 fine-tune holdout), and Satie's
Gymnopédie No. 1 and Debussy's Arabesque No. 1, whose arrangement provenance could not be verified
in the v0 audit. The exclusion is enforced by a test.

The records, traces and annotations are released under **CC-BY-SA-3.0-DE**, the same licence as
jam-actions-v0, so the two sets can be combined without a licence boundary between them. The
compositions themselves are public domain. Code in the source repo is MIT.

## Citation

See `CITATION.cff`. Cite the concept DOI `10.5281/zenodo.20279918`, which resolves to the latest
version of the jam-actions line, and name the version you used.
