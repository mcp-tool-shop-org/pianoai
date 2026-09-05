# Vocal timing as a scientific instrument — the score clock

**Job (Director, 2026-09-04):** make the Comfy vocal *land on the piano*.
Voice quality is out of scope. Gate: every lyric's vowel onset within
**40 ms** of the clock, or the run fails. Executed 2026-09-05 (Fable).

**Result: PASS.** 14/14 events, worst error **5.6 ms** ("a"), the other
thirteen within **1.1 ms**. One speaker, words in clock order, vocal stem and
piano bed both exactly **1,680,000 samples** (35.000 s @ 48 kHz).
Receipt: [`scores/receipts/amazing-grace/vocal-clock.receipt.json`](../scores/receipts/amazing-grace/vocal-clock.receipt.json).

```
id   lyric    t_score  t_vowel   err_ms  stt_ms method  result
v00  A         2.1333   2.1333     -0.0     5.7 rise    PASS
v01  ma        3.2000   3.1999     -0.1       - rise    PASS
v02  zing      6.4000   6.4001      0.1       - rise    PASS
v03  grace     7.0000   7.0000     -0.0   -40.0 rise    PASS
v04  how       8.6000   8.6000     -0.0   -21.0 rise    PASS
v05  sweet    10.2000  10.2000     -0.0   -81.0 rise    PASS
v06  the      13.4000  13.4000     -0.0    39.0 rise    PASS
v07  sound    14.2000  14.2001      0.1  -261.0 rise    PASS
v08  that     17.4000  17.4000     -0.0    40.0 rise    PASS
v09  saved    18.2000  18.1999     -0.1    -1.0 rise    PASS
v10  a        19.8000  19.8056      5.6  -321.0 rise    PASS
v11  wretch   21.4000  21.4001      0.1   -41.0 rise    PASS
v12  like     23.0000  22.9989     -1.1    59.0 rise    PASS
v13  me       24.6000  24.6000      0.0  -701.0 rise    PASS
  onset_abs_ms    PASS  gate 40 ms, worst 5.57 ms
  order           PASS  one_voice PASS (speaker_0)  fits_timeline PASS
  length_match    PASS  vocal 1680000 = bed 1680000 = clock 1680000
```

## The three clocks (measured, not vibes)

The kickoff said two clocks were mixed as one. There were three.

| clock | bar length | source | what it is |
|---|---|---|---|
| **MIDI tick map** | 2.400 s, every bar | `songs/library/folk/amazing-grace.mid`: 384 ppq, 3/4, 75 BPM | the arrangement as written; melody on track `TUBULARBEL` (Bb3 pickup at tick 768) |
| **session-nominal** | 3.2 / 3.8 / 3.2 / 4.0 / 4.0 / 3.2 / 3.2 / 3.2 / 3.2 / 4.0 s | `Session.play`: both hands run per measure, next measure starts when the longer hand finishes | **the piano the Director hears from this repo** |
| hymn grid (`bar.dur/3`) | same bars as above, beats = bar/3 | `realizeVocalTune` | neither of the two |

`bar.dur/3` does **not** equal the MIDI tick map (the kickoff asked for that
proof before using it): the ingest turns 2.4 s bars into 3.2–4.0 s bars, and
hands disagree inside a measure (m2: right 3.8 s, left 3.2 s). That is a
real ingest defect — **out of scope here, reported, not fixed** — the clock
maps where the music *is*, which is the session's timeline.

The kickoff's piano table (3.2, 6.4, 7.0, 8.6, **9.4**, 12.6, 13.4, 16.6 …)
came from `extractMelodyNotes`, which walks right-hand beats only and never
re-aligns to the measure. From m4 on it runs 0.8 s early of what the
session plays (m4 chord at **10.2**, not 9.4). `sessionSchedule` in
`src/vocal/score-clock.ts` is the same arithmetic the player uses, and the
offline bed proves it: every event's piano note-on was issued at exactly its
clock time (0.000 ms late, all 13; render receipt).

## The instrument

```
scores/amazing-grace.score-clock.v1.json      the ONE clock (committed, drift-checked)
pnpm exec tsx scripts/build-score-clock.mjs   derive it (--check = CI drift guard)
pnpm exec tsx scripts/render-piano-bed.mjs    bounce the bed offline, exactly total_samples
python scripts/vocal_clock.py bed-check       piano note-ons vs clock (render receipt + acoustic latency)
python scripts/vocal_clock.py transcribe      fx-dub transcribe graph (ElevenLabs scribe_v2, diarized)
python scripts/vocal_clock.py plan            vowel onsets in the take → cut spans + leads (local, $0)
python scripts/vocal_clock.py place           one Comfy job: Trim + place_exact shape per syllable + AudioMix
python scripts/vocal_clock.py verify          gate the downloaded ARTIFACT → receipt (exit 1 on any FAIL)
python scripts/vocal_clock.py mix             upload bed, fx-dub mix_dialogue_anchored, headroom-staged
```

**Clock derivation.** Each syllable of the lyric is a note of the MIDI melody
track; its `t_sec` is the session-nominal onset of the *same pitch in the
same measure* (nearest position-within-measure; ambiguity fails closed).
Every non-pickup event therefore sits on a piano note-on (`anchor:
piano-onset:m5:left:beat1`). The m1 pickup is the one exception: the ingest
parks it at t = 0 in front of a 2.4 s hole, so the vocal takes it one hymn
beat before the m2 downbeat, inside the piano's rest (`t = 2.1333`, the
Director's placement). `total_seconds` = end of measure 10 = 35.000 s =
the bed = the vocal timeline; `me` holds to the next melody pickup (30.2 s).

**Vowel onset = sung tone start** (Sundberg 2007). Measured as the last
upward crossing of −6 dB below the syllable peak in a **400–3000 Hz band**
(F1–F2). Nasal murmur, stop closures and fricatives all sit 10–20 dB below
the vowel there, which is what makes "ma", "me", "the", "saved a" datable
when the wide-band envelope is flat through them. A legato fallback
(steepest ≥3 dB rise, `method: slope`) exists and was not needed on this
take. The per-event method is recorded in the plan and re-applied on the
artifact, with the measurement window opening 12 ms after the clip's own
cut so the cut edge is never what gets dated.

**Place like fx-dub, stricter.** Seed is a bag of takes. Each syllable is a
`TrimAudioDuration` span (fx-dub's splice primitive) followed node-for-node
by the `place_exact` shape (lead `EmptyAudio` → `AudioConcat` → tail
`EmptyAudio` → `AudioConcat`, so every track is *exactly* `total_seconds`),
summed by `AudioMix` at unity, one job. Nothing passes through a model.
Clips never overlap (10 ms air). `clip_seconds` is what the cloud trimmed,
and the gate measures the downloaded FLAC, not the plan.

## What the run taught (keep)

- **The transcriber is not a 40 ms instrument.** Scribe dated the Seed
  take's "a" 170 ms late, and on the sparse placed stem it put "sound",
  "a" and "me" 260–700 ms early (it lumps words across silence). The
  `stt_ms` column is a cross-check for *order* and *one voice*; the gate is
  energy. Widening the rise search back to the previous word's start is
  what made "a" datable.
- **The oscillator piano sounds 8.2 ms after note-on** (linear attack ramp
  from zero gain; measured at −40 dBFS on the from-silence onsets). The
  Salamander pack is not installed on this rig (`resolvePianoSamplesDir()`
  → null), so the bed is the tuned oscillator grand — the same engine
  `play-comfy-over-piano.mjs` falls back to here. Timing is engine-agnostic;
  the renderer picks the sampled grand automatically where a pack exists.
- **The mix bus sums.** The first mix boosted the vocal +15 dB to sit 4 dB
  over the bed and clipped at 1.0. `mix` now stages from a meter with a
  headroom rule (bed peak + vocal peak ≤ 0.9): bed −9 dB, vocal +5 dB,
  peak 0.61.
- **Live playback is not on the clock.** `Session.play` sleeps beat by beat
  (`setTimeout`), so a recording of it inherits timer jitter; the bed is an
  `OfflineAudioContext` bounce of the same schedule (`suspend(t)` per
  render quantum; every event time is a multiple of 128 samples, so 0.000
  ms late). Both engines accept an injected `audioContext` for this.
- **`tunes.ts` is wrong for this arrangement** (several pitches and
  beats differ from the MIDI melody) — irrelevant to timing, relevant to
  the day pitch is gated (optional P1: F0 cents at the vowel nucleus).

## Second run: held takes (bag of takes), 2026-09-05

The Director heard the first mix and said the voice keeps cutting out. It
does: Seed sang each syllable at speech length (0.2–2 s) into slots of
0.6–5.6 s. Two more Seed takes were generated from the same Kokoro lock at
`speech_rate −50` (0.5x) with a "hold every syllable as a long sustained
note" instruction (`vocal_clock.py seed-take`), each planned leniently (a
take may fail to date a syllable and simply not offer it), and merged per
event by longest clip (`vocal_clock.py merge`; cuts now carry their own
`source_key`, and the place graph loads one `LoadAudio` per take).
Receipts: [`scores/receipts/amazing-grace/held/`](../scores/receipts/amazing-grace/held/).
Gate: **PASS**, worst 4.8 ms; clips now fill 9 of 14 slots.

**Finding (Director, second listen): still breaking up, and the melody is
wrong.** Seed Audio 1.0 is a speech model: no melody input, no note
durations, will not hold a vowel for 3 s, and its pitches are speech
intonation. Prompt wording is not the lever. The clock pipeline places
what a take contains; it cannot put a tune into a take that has none.
Next route (Director-approved): a guide track on the clock from the
repo's score-locked singer, re-voiced by ElevenLabs Speech-to-Speech on
Comfy Cloud, with a pitch gate added — pending an Opus study-swarm on the
September-2026 state of singing models, since the June ruling ("only
DiffSinger honors MIDI") may be stale.

## Third run: SoulX-Singer, score-conditioned, local (2026-09-05) — BOTH GATES PASS

Director's go after the study-swarm ([research grounding](vocal-singing-study-2026-09.md)):
the singer is **SoulX-Singer** (Apache-2.0, MIDI score + lyrics, zero-shot
timbre), run locally on the 5090 (`E:/AI/SoulX-Singer`, uv venv Python 3.10,
torch 2.11 cu128; one local patch: `load_wav` falls back to soundfile because
torchaudio ≥ 2.9 needs torchcodec/FFmpeg on Windows — `scripts/patches/`).

```
pnpm exec tsx scripts/build-score-clock.mjs                      # the clock (unchanged)
<venv> scripts/export_soulx_target.py --clock … --out target.json  # 16 notes tiling 35.000 s
<venv> scripts/soulx_take.py --target … --prompt-wav … --out-dir … # 5.5 s of GPU for 35 s
python scripts/vocal_clock.py verify   (energy gate on the raw take)
python scripts/vocal_clock.py upload / transcribe / repin / place / transcribe / verify
<venv> scripts/vocal_clock.py pitch --verify-receipt … --cross-check
python scripts/vocal_clock.py mix
```

**Raw take** (prompt = the repo's English example voice): pitch gate PASS at
once (global −4.2 c, 14/14 within 50 c) — the tune is New Britain; timing
loose, 9/14 vowels off by up to 182 ms (an SVS sings rubato and puts
consonants where it likes). **Re-pinned** (`repin`: cut 120 ms before each
measured vowel, `place_exact` on `t_sec`): timing PASS worst 31.9 ms, order
PASS, one voice, lengths exact; pitch PASS 14/14 with no warnings, global
−3.7 c, scatter 8.9 c. Receipts: [`scores/receipts/amazing-grace/soulx-01/`](../scores/receipts/amazing-grace/soulx-01/).

Instrument lessons from this run (kept):
- **SwiftF0 is biased on vibrato** (+20.6 c mean on a ±40 c synthetic, clipped
  swing) — pYIN reads +2.8 c with the full swing, so pYIN is the primary
  tracker and SwiftF0 a cross-check column.
- **The next syllable's voiced consonant is already at the next pitch.** A
  nasal /m/ starts ~150 ms before its vowel; the nucleus window now stops
  150 ms before the next onset or "A" reads as an octave split.
- **Valley-based syllable cutting is for speech.** On a sung 1 s vowel it
  cut the wrong place; `repin` cuts a fixed lead-in before the measured
  vowel instead.
- Mix gain landed at vocal −9 dB (the SVS take is hot, peak 0.91); peak 0.36.

Open: timbre — this is the example prompt's voice, not a cast one. The
prompt needs SoulX metadata (lyrics + notes of the reference clip), so the
Kokoro lock or any female clip must go through SoulX's preprocess (its
weights are a separate download) or a hand-written prompt JSON.

### The Director listened, twice — and the joins became the work

"Very good, but the voice breaks a couple of times" → "still breaks at
about 3 seconds in." Measured: the first placement was butt-cut with 10 ms
of air; the second had 15 ms fades but the "A"→"ma" join still jumped,
because the take sings "A-ma" as a **portamento** (Bb3→Eb4 over 180 ms, no
dip) and re-pinning "ma" 152 ms early cut through it. Three things fixed it,
all in `scripts/vocal_clock.py` / `export_soulx_target.py`:

1. **Crossfade splices** (`place --local`, `XFADE_S` 50 ms): the earlier
   clip keeps running from its own source under the next one, never past
   the next syllable's lead-in; the measurement window opens after the
   overlap.
2. **Cut only where the singer articulates.** `export_soulx_target.py
   --syllable-words` writes every syllable as its own word with its own
   phonemes (maximal-onset split: `A | M-EY1 | Z-IH0-NG`), so the model
   re-articulates instead of gliding and a cut between syllables is a word
   boundary. (`repin --candidate` without it picks whole words — the right
   mode when legato inside a word is wanted and the take is tight enough.)
3. **Pick by clarity, then by least shift.** Every measured onset now
   carries `dip_db` (how far the envelope drops in the 100 ms before the
   rise); the picker prefers onsets with ≥ 12 dB of dip, then the take that
   needs the smallest move. Feeding measured errors back into the next
   target was tried and does **not** converge — the singer's placement is
   stochastic (± ~150 ms per syllable between renders), not biased.

**Syllable run (6 takes, `scores/receipts/amazing-grace/soulx-syllables/`):**
timing PASS worst **6.05 ms**, no gaps at any join, order PASS, one voice,
lengths exact; pitch PASS 14/14 (two WARNs at +28 c), global **−2.7 c**,
scatter 14 c. `scripts/sing_clock.py` runs the whole chain in one command.

## Standards compliance

| standard | score | evidence |
|---|---|---|
| PIN_PER_STEP | 2 | Graphs are pure dicts written next to their outputs (`placed-graph.json`); Seed `seed: 42`, scribe `seed: 1`, `temperature: 0`; every artifact carries a sha256 and its cloud key; the clock file is regenerable and drift-checked (`--check`). Model versions are pinned inside the fx-dub builders. |
| ANDON_AUTHORITY | 3 | `plan` refuses when words are out of order or a vowel has no onset; `place` refuses a clip that does not fit; `verify` exits 1 on any FAIL and prints the table; `mix` refuses mismatched lengths; `bed-check` refuses a receipt whose sha256 is not the bed's. Tests cover the refusals. |
| NAMED_COMPENSATORS | 2 | Irreversible calls are Comfy Cloud spends (transcribe ×2, place, mix ×2 this run). Undo = none for credits; the artifacts are content-addressed cloud keys and local files under `tmp/vocal-clock/` (delete to roll back locally; owner: the session that ran it). No publish, no push, no PR in this workflow. |
| DECOMPOSE_BY_SECRETS | 2 | Clock derivation (TS, tested) / bed render (TS) / measurement + gate (Python, tested) / cloud transport (`comfy_rest.py`) / graph shapes (fx-dub) each change for different reasons and live apart. |
| UNCERTAINTY_GATED_HUMANS | 2 | The Director's ear-gate is the only human checkpoint and it comes *after* the mechanical gate passes; the receipt frames what was chosen against the kickoff's table (contrastive: "you probably thought m4 was at 9.4; the player puts it at 10.2 because…"). |
| EXTERNAL_VERIFIER | 2 | The generator (Seed) never verifies itself: onsets are measured by a deterministic detector on the cloud artifact, and order / one-voice by a different model family (ElevenLabs scribe). The energy detector is the same code on take and artifact — an independent second onset method (F0 voicing onset) is the named remediation, owner: the P1 pitch-gate session. |

## Files

- Clock: `scores/amazing-grace.score-clock.v1.json` · derivation `src/vocal/score-clock.ts` (+ tests)
- Receipts: `scores/receipts/amazing-grace/` — verify receipt, bed check, render receipt, plan, placed/mix job records, both transcripts
- Artifacts (gitignored `tmp/vocal-clock/`): `piano-bed.wav`, placed stem `d456b44d…flac`, mix `6b8c08da…flac`, listening copies `amazing-grace-vocal-on-clock-mix.wav` / `amazing-grace-vocal-placed.wav`
- Source take: `tmp/kokoro-lock/amazing-grace-seed.flac` (cloud key `f5cdf630…flac`, 35.04 s)
