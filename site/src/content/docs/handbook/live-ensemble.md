---
title: The live ensemble
description: Watching every instrument while the music plays — the intent channel, the acoustic channel, what each one is good for, and the latencies and limits both carry.
sidebar:
  order: 7
---

[Listening](/ai-jam-sessions/handbook/listening/) grades a recording after it has finished. This
page is the other half: what every instrument is doing **right now**, while the performance is
still going.

```
ensemble_now()
```

You get each instrument's held notes, how long each has been held, and the combined chord across
the ensemble. In a duet the voices are reported separately, so the piano holding a triad and the
synth carrying a line above it are two entries, not one blur.

## Two channels

Almost everything on this page follows from one distinction, so it goes first.

### Intent — what was asked for

When this server performs, it knows exactly what it sent to each engine, because it sent it. The
playback controller emits every note-on and note-off with pitch, velocity and channel, and the
ensemble simply reads them.

So a chord is **not a transcription problem**. It is three note-ons. There is no model in this
path, no inference, no confidence score, and no latency worth naming. It is the accurate channel
and it is also the cheap one.

This is worth stating plainly because the obvious design would have been to point a polyphonic
transcriber at the audio and ask what it heard. That would have been slower, less accurate, and
several hundred megabytes heavier, to answer a question we already had the answer to. Transcription
is for audio we did **not** generate — a human at an acoustic instrument, into a microphone.

### Acoustic — what actually came out

Each engine can fan its output into a private analysis bus. Every instrument is therefore measured
**at the source**: no source separation, no unmixing, no ambiguity about which sound belongs to
which instrument.

This channel is **verification, not discovery**. You already know what was played. What you do not
know is whether it came out. This is how you find out that:

- a sung line drifted off the clock;
- a take clipped;
- an engine went silent while still being sent notes.

When the two channels disagree, that is a fact about the render. It is never a correction to the
note list.

## What it costs

Measured, not estimated: about **9 microseconds per audio callback** against a 42.67 ms block.
Roughly 0.02% of the audio budget, with zero dropped samples in the measurement. An instrument with
no observer attached costs nothing, because the analysis bus is created lazily on first use.

Observers also cannot break a performance. A tap fans **out** of the engine's output and never sits
between it and your speakers, so a failure in the observer takes the observer down and leaves the
music playing. If attaching one fails outright, the performance continues on the intent channel
alone, which was the exact one anyway.

## Latency, stated rather than implied

The acoustic channel describes the recent past and says by how much:

| reading | lag | why |
|---|---|---|
| pitch | ~23 ms | half a centred analysis window |
| confirmed onset | ~70 ms | an onset cannot be confirmed until the audio *after* it has arrived |

That second row is a real property of onset detection, not an implementation shortcut: the peak
picker compares a candidate against the frames that follow it. Onsets closer to the present than
that are **withheld** rather than reported and later retracted, because a confirmed event that
disappears is worse than one that arrives late.

The intent channel has no equivalent lag.

## Limits

**The acoustic tracker follows one line at a time.** It will not name the notes of a chord. It does
not pretend to, either: a chord it cannot resolve is its documented limitation rather than a
finding, so the ensemble stays quiet about it. An earlier version did not, and would have flagged a
disagreement on every chord the piano played — a check that cries wolf constantly is worse than no
check, because it teaches you to skip the real ones.

**A layered engine's children are tapped individually, never as a mix.** Tapping the combined
output would collapse the instruments back into one signal and throw away exactly the isolation
that makes per-instrument observation possible.

**An instrument with no tap is not a silent instrument.** A missing acoustic reading means nobody
is listening to that engine, not that it produced nothing. Its notes are still exact.

## When to use which tool

| you want to know | use |
|---|---|
| what is sounding right now | `ensemble_now` |
| what is in a finished recording | `analyze_audio` |
| what notes a recording contains | `transcribe_audio` |
| how a recording scored against the written music | `score_audio_take` |
| what the sound looks like | `view_spectrogram` |

The first is live. The rest are for audio that has already stopped.
