---
title: Vocals — sing a song on the clock
description: The score-clock vocal route — a local score-conditioned singer, a timing gate, a pitch gate, and the levers to sing any library song with your own lyrics.
sidebar:
  order: 4
---

AI Jam Sessions can put a real sung line on top of any library song, on the
piano's clock, with every vowel within 40 ms of the score and every note
within 50 cents of its pitch — and it **proves it** with a receipt before you
hear a mix. This page is the route, the levers, and the reasons.

## The idea in one paragraph

A generator's timestamps are not a clock. Speech models (Seed Audio,
ElevenLabs) sing at their own rate and do not hold notes; song models
(ACE-Step, Suno, Lyria) will not take a melody. So the route separates the
three jobs: the **clock** says where every syllable and pitch must be
(derived from the song's MIDI and the player's own timeline); a **score-
conditioned singer** ([SoulX-Singer](https://github.com/Soul-AILab/SoulX-Singer),
Apache-2.0, local GPU) sings from that clock; and two **gates** measure the
result — the artifact, never the plan — and refuse anything that misses.
The research behind each choice is in
[`docs/vocal-singing-study-2026-09.md`](https://github.com/mcp-tool-shop-org/ai-jam-sessions/blob/main/docs/vocal-singing-study-2026-09.md).

## Setup (once)

```bash
# the singer: SoulX-Singer, Apache-2.0, ~2.8 GB weights, any 24 GB+ NVIDIA GPU
git clone https://github.com/Soul-AILab/SoulX-Singer E:/AI/SoulX-Singer
cd E:/AI/SoulX-Singer
uv venv .venv --python 3.10
uv pip install --python .venv/Scripts/python.exe torch torchaudio --index-url https://download.pytorch.org/whl/cu128
uv pip install --python .venv/Scripts/python.exe "numpy<2" soundfile omegaconf tqdm scipy accelerate "transformers==4.41.2" librosa einops g2p_en nltk huggingface_hub swift-f0
hf download Soul-AILab/SoulX-Singer --local-dir pretrained_models/SoulX-Singer
git apply E:/AI/ai-jam-sessions/scripts/patches/soulx-singer-load_wav-soundfile.patch   # Windows: no torchcodec
```

Set `SOULX_ROOT` if the checkout lives elsewhere. Python packages for the
gates (`soundfile`, `scipy`, `numpy`) are all the repo's own scripts need;
the pitch gate runs in the SoulX venv because it uses `librosa.pyin`.

## The route, step by step

| step | command | what it does |
|---|---|---|
| 1. clock | `pnpm exec tsx scripts/build-score-clock.mjs --song amazing-grace --track TUBULARBEL --measures 1-10 --lyrics "A-ma-zing grace how sweet the sound that saved a wretch like me"` | one JSON clock: every syllable's pitch, onset and duration on the player's timeline, sample-rounded at 48 kHz; `--list-tracks` shows the MIDI tracks so you can pick the tune; `--check` guards drift |
| 2. bed | `pnpm exec tsx scripts/render-piano-bed.mjs` | bounces the piano offline to exactly the clock's length (deterministic; live playback has timer jitter) |
| 3. target | `<venv> scripts/export_soulx_target.py --clock scores/<song>.score-clock.v1.json --out tmp/vocal-clock/soulx/target.json` | the clock as SoulX metadata: one segment, `note_type` 1/2/3, ARPAbet phonemes |
| 4. takes | `<venv> scripts/soulx_take.py --target … --prompt-wav … --prompt-meta … --out-dir tmp/vocal-clock/soulx/take-01` (repeat) | ~5 s of GPU per 35 s take; the voice is whatever the prompt clip sings |
| 5. measure | `python scripts/vocal_clock.py verify --clock … --vocal take-48k.wav --bed piano-bed.wav --receipt verify-energy.json` | dates every vowel onset in the take (400–3000 Hz band, −6 dB rise) |
| 6. pick words | `python scripts/vocal_clock.py repin --clock … --candidate take-01/take-48k.wav=take-01/verify-energy.json --candidate … --out plan.json` | per **word**, the take whose syllables are internally on the clock; cuts only between words |
| 7. place | `python scripts/vocal_clock.py place --local --plan plan.json --out-dir … --out-info placed.json --out-graph g.json` | sample-exact placement, 50 ms crossfades at word joins |
| 8. gate | `verify` again on the placed stem (add `--words` from `transcribe` for order and one-voice), then `<venv> scripts/vocal_clock.py pitch --clock … --vocal placed-local.wav --verify-receipt receipt.json` | **any FAIL and it is not a mix** |
| 9. mix | `python scripts/vocal_clock.py mix --local --bed piano-bed.wav --vocal placed-local.wav --plan plan.json --out-dir …` | gain-staged from a meter with a headroom rule |

`scripts/sing_clock.py` runs steps 3–9 in one go (see its `--help`); the
clock and bed are yours to build first, because they are the truth.

## The levers

- **Which notes are the tune** — `--track` on the clock builder. Library
  MIDI is often an accompaniment; `--list-tracks` prints every track with its
  range and first entry so you can pick the monophonic one.
- **Lyrics** — `--lyrics`: one token per melody note, syllables joined by
  `-` inside a word (`A-ma-zing`). A melisma is a word repeated on the next
  note in SoulX's convention; the exporter does that for you.
- **Range** — `--measures a-b`. The clock's `total_seconds` is the end of
  the last bar, so the bed and the vocal timeline are the same length.
- **The voice** — the prompt clip and its metadata (`--prompt-wav`,
  `--prompt-meta`). SoulX clones timbre zero-shot; the reference needs its own
  lyric-and-note metadata (SoulX's preprocess pipeline makes it, or the repo's
  `example/audio/en_prompt.*` works out of the box). `--pitch-shift` transposes
  the whole take; leave `--auto-shift` off or the pitch gate no longer measures
  the score.
- **How many takes** — the singer is expressive and stochastic (± ~150 ms
  per syllable between renders); more takes give the word picker more to
  choose from. Eight is a good start. A word that no take sings tightly is
  reported by name.
- **The gates** — timing 40 ms (a 64th at 75 BPM is 50 ms), pitch 50 cents
  fail / 25 warn, global offset 20 cents, all in `scripts/vocal_clock.py`
  constants with the citation next to each. Tighten them if you like; do not
  loosen them to make a run green.
- **Joins** — `XFADE_S` (50 ms) and `REPIN_LEAD_IN_S` (120 ms, the consonant
  kept before each word's first vowel).
- **Mix** — `--vocal-over-bed-db` (default +4) and `--bed-gain-db` (−9),
  capped by the headroom rule (bed peak + vocal peak ≤ 0.9).
- **Cloud instead of local** — every `place` / `mix` / `transcribe` step has a
  Comfy Cloud path built from fx-dub's graph builders; `transcribe` (ElevenLabs
  scribe) is what checks word order and that there is one voice.

## What the receipts say

Every run leaves `verify` and `pitch` receipts (JSON) with the per-syllable
table, the detector settings, and the sha256 of every artifact, so a claim
like "worst vowel 6.05 ms, global pitch −2.7 cents, no gap at any join" can
be re-checked from the files. The Amazing Grace runs are committed under
`scores/receipts/amazing-grace/` (`soulx-syllables/` is the one that
shipped to the Director's ears).

## Things that were measured so you do not have to

- The session's bars are 3.2–4.0 s, not the MIDI's 2.4 s — the clock follows the player, the piano you actually hear.
- Speech-to-text word starts are ±100–700 ms on sung audio: good for order, useless for timing.
- SwiftF0 reads a ±40 cent vibrato +20 cents sharp; pYIN reads it +3. pYIN is the pitch gate's tracker.
- A voiced consonant (the /m/ of "ma") is already at the next pitch 150 ms before its vowel; the pitch window stops there.
- A sung word is legato inside — "A"→"ma" glides Bb3→Eb4 over 180 ms — so cuts happen only between words.
- Feeding a take's timing errors back into the next target does not converge; the errors are stochastic, not a bias.
