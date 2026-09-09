#!/usr/bin/env python3
"""Build (do not submit) the Comfy Cloud graph: LoadAudio(Kokoro lock) → ElevenLabs STS.

Timing is NOT in this graph — jam-sessions emit-seed-timestamps.mjs owns the clock.
This graph is the timbre transform (study-swarm wave 2, findings 18 + 21).

Prints API-format JSON to stdout. Submit is the caller's decision (metered credits).
"""
from __future__ import annotations

import json
import sys


def sts_graph(storage_key: str, prefix: str = "jam/kokoro-sts") -> dict:
    # LoadAudio storage key after upload. Partner node keeps WORDS (not lyrics-to-song).
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": storage_key}},
        "2": {
            "class_type": "ElevenLabsSpeechToSpeech",
            "inputs": {
                "audio": ["1", 0],
                "voice": "Rachel",
                "model": "eleven_multilingual_sts_v2",
                "stability": 0.5,
                "speed": 1.0,
                "similarity_boost": 0.75,
            },
        },
        "3": {
            "class_type": "SaveAudioAdvanced",
            "inputs": {
                "audio": ["2", 0],
                "filename_prefix": prefix,
                "format": "flac",
            },
        },
    }


if __name__ == "__main__":
    key = sys.argv[1] if len(sys.argv) > 1 else "LOCK.wav"
    json.dump(sts_graph(key), sys.stdout, indent=2)
    sys.stdout.write("\n")
