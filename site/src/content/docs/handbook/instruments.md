---
title: Instruments
description: Piano voices, guitar presets, vocal engines, and the layered combinator.
sidebar:
  order: 2
---

AI Jam Sessions ships six sound engines plus a layered combinator that runs any two simultaneously.

## Piano engines

### Oscillator Piano

Additive synthesis with multi-harmonic tone generation, hammer noise simulation, inharmonicity modeling, 48-voice polyphony, and stereo imaging. Zero external dependencies.

Six tunable keyboard voices, each adjustable per-parameter (brightness, decay, hammer hardness, detune, stereo width):

| Voice | Character |
|-------|-----------|
| Concert Grand | Rich, full, classical |
| Upright | Warm, intimate, folk |
| Electric Piano | Silky, jazzy, Fender Rhodes feel |
| Honky-Tonk | Detuned, ragtime, saloon |
| Music Box | Crystalline, ethereal |
| Bright Grand | Cutting, contemporary, pop |

### Sample Piano

Salamander Grand Piano with 480 samples, 16 velocity layers, and all 88 keys. Real recorded samples for the most authentic sound.

## Vocal engines

### Vocal (Sample)

Pitch-shifted sustained vowel tones with portamento and legato mode. Good for melodic lines where natural vocal timbre matters.

### Vocal Tract

Physical model based on the Pink Trombone architecture. Uses an LF glottal waveform through a 44-cell digital waveguide. Four presets: soprano, alto, tenor, and bass.

### Vocal Synth

Additive synthesis with 15 Kokoro voice presets: Aoede, Heart, Jessica, Sky, Eric, Fenrir, Liam, Onyx, Alice, Emma, Isabella, George, Lewis, plus choir and synth-vox sections. Features formant shaping, breathiness control, and vibrato. Deterministic output using seeded RNG.

## Guitar engine

Physically-modeled plucked string synthesis with 17 tunable parameters (brightness, body resonance, pluck position, string damping, and more).

### Guitar voice presets

| Voice | Character |
|-------|-----------|
| Steel Dreadnought | Bright, balanced, classic acoustic |
| Nylon Classical | Warm, soft, rounded |
| Jazz Archtop | Mellow, woody, clean |
| Twelve-String | Shimmering, doubled, chorus-like |

### Guitar tunings

Eight tuning systems available: standard, drop-D, open G, DADGAD, and more. Use `list_guitar_tunings` to see all options.

## Layered combinator

The layered engine wraps two engines and dispatches every MIDI event to both simultaneously. Useful combinations:

- `piano+synth` — acoustic piano with vocal synth harmony
- `guitar+synth` — plucked guitar with synthesized vocal layer

## Tuning tools

All instruments support per-parameter tuning that persists across sessions:

- `tune_keyboard` / `get_keyboard_config` / `reset_keyboard` — adjust and inspect piano voice parameters
- `tune_guitar` / `get_guitar_config` / `reset_guitar` — adjust and inspect guitar voice parameters
- `list_keyboards` / `list_guitar_voices` — see available voice presets
