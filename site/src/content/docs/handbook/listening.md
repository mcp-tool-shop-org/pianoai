---
title: Listening
description: Measuring recorded audio — onsets, pitch in cents, transcription, grading a performance by ear, and reading a spectrogram. What the tools measure, and what they will not tell you.
sidebar:
  order: 6
---

For most of this project's life the server could make sound but never examine it. The model played,
a human listened, and the model took their word for it. The listening tools close that gap.

They are built on the same principle as the MIDI inspector tools: a model cannot reliably eyeball a
picture, so give it deterministic queries instead. Every number here comes from signal processing.
None of it comes from a model looking at an image.

## Start here

You need an uncompressed WAV file. The server decodes PCM WAV only, which is what lets the whole
audio layer run with no external dependencies. If you have an MP3 or a FLAC, convert it first.

```
analyze_audio(path: "/abs/path/to/take.wav")
```

That gives you onsets, the pitch contour and the level. Pitch comes back as note names with cent
deviations, never as raw frequencies, because language models reason better from scientific pitch
notation than from a number in hertz.

## The four tools

### `analyze_audio`

The survey. Onset times in seconds, the pitch range and centre of the recording, peak and RMS
level, and a warning if the file is at or past full scale. Use it first on anything unfamiliar,
and use it when a grade comes back strange and you want to know what is actually in the file.

Takes an optional `start_sec` and `end_sec` if you only care about part of a take.

### `transcribe_audio`

The recording as notes: pitch, start time, duration, and how far each note sits from concert pitch
in cents. This is what you use to find out what was *played*, as distinct from what the score asked
for.

Notes the pitch tracker could not follow are left out rather than guessed. A note that is missing
from the transcription is a note the tool declined to invent.

### `score_audio_take`

The one that does the work. It transcribes the recording, matches it against a song in the library,
and reports which notes landed, which drifted and which were missed. Then `view_scored_piano_roll`
draws the result over the score, exactly as it does for a captured MIDI take.

```
score_audio_take(path: "/abs/path/take.wav", song_id: "fur-elise")
view_scored_piano_roll()
```

This is how you grade a real instrument, a sung take, or anything where there is no MIDI to
capture. It matches within 40 ms, which is stricter than the 50 ms convention published work
reports, and it says so in its own output.

### `view_spectrogram`

See the sound. A constant-Q spectrogram with a piano keyboard down the left edge, so pitch is
readable against note names rather than against a frequency axis.

It is **blind by default**: it renders the sound alone and asks you to say what you see before the
overlay is available. That is deliberate. Multimodal models follow their text input over the
acoustics, so a model shown its own intended notes will tend to confirm them rather than read the
picture. Look first, then compare.

```
view_spectrogram(path: "/abs/path/take.wav")                       # sound only
view_spectrogram(path: "...", song_id: "fur-elise", overlay: true) # then compare
```

## What these tools will not tell you

This section is as important as the one above it, and the tools repeat these caveats in their own
output rather than leaving them here.

**They follow one line at a time.** On a chord or a full mix, the transcriber will produce
something confident and wrong. Monophonic material only: a solo line, a sung melody, a single
rendered voice.

**The picture localises; it does not measure.** A spectrogram is for finding *where* something is
wrong. Every number belongs to the other tools. Vision models read spectrograms coarsely at best,
so no gate in this repo is ever decided by a model looking at an image.

**A missed note may be a note the transcriber could not hear.** Onset detection runs around F1 0.88
at the state of the art, so roughly one detected onset in eight is wrong before any timing
arithmetic happens. A grade is an estimate, and `score_audio_take` says so every time it returns.

**Passing the gates means "not obviously broken".** It does not mean "sounds good". The singing
literature is clear that objective metrics capture only part of what a listener hears, and the
best published per-clip quality predictor tracks human judgement at about 0.64 rank correlation.

## Under the hood

Everything is in this repo and has no dependencies: the FFT, the windows, the short-time Fourier
transform, the mel filterbank, decibel scaling, a constant-Q transform with sparse kernels,
SuperFlux onset detection, YIN pitch tracking, the transcriber, the WAV decoder and the PNG
encoder. The same code runs in Node and in the browser and produces identical numbers in both.

Two design choices are worth knowing because they explain the shape of everything else.

**The constant-Q transform carries pitch; mel carries legibility.** Mel is what audio models are
trained on and it reads well, but the mel scale is linear below 1 kHz at about 67 hertz per step,
while a 50-cent error at middle C is 7.7 hertz. Mel cannot show the pitch gate. Constant-Q at 60
bins per octave puts that same error across two and a half bins, where it is visible.

**Audio enters the existing scoring stack rather than sitting beside it.** Transcription produces
the same note-event array that MIDI capture produces, so the scorer and the scored piano roll work
over real sound with no changes to either.

The full reasoning, with citations, is in `docs/spectrogram-surface-study-2026-09.md`.
