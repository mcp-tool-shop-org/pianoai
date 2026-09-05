#!/usr/bin/env python3
"""Score clock -> SoulX-Singer target metadata (score-conditioned SVS).

    python scripts/export_soulx_target.py --clock scores/amazing-grace.score-clock.v1.json \
        --out tmp/vocal-clock/soulx/target.json

One segment spanning the whole clock (`time` = [0, total_ms]) so the model's
merged output lands on the clock natively: a leading <SP> up to the first
event, one note per syllable with the clock's `dur_sec` (legato: each note is
held to the next onset), a trailing <SP> to `total_seconds`.

SoulX-Singer conventions (soulxsinger/utils/data_processor.py, preprocess/tools/
midi_parser.py, example/audio/en_target.json):
  - note_type 1 = <SP>, 2 = a syllable/word starts on this note, 3 = the
    previous word continues (slur / melisma)
  - English phonemes: "en_" + ARPAbet-with-stress joined by "-", the WHOLE word
    on every note it spans (the example repeats "beautiful beautiful" 2 3)
  - durations in seconds, note_pitch = MIDI (0 for <SP>), no f0 in score mode
  - frames are 20 ms (hop 480 @ 24 kHz): onsets round to the frame

Runs inside the SoulX venv (needs g2p_en + nltk data). Pure derivation, no
GPU.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys


def arpabet(word: str, g2p) -> str:
    phones = [p for p in g2p(word) if p.strip() and p != " "]
    phones = [p for p in phones if re.match(r"^[A-Z]+[0-2]?$", p)]
    if not phones:
        raise SystemExit(f"g2p produced no phonemes for {word!r}")
    return "en_" + "-".join(phones)


def build_target(clock: dict, g2p, language: str = "English") -> list[dict]:
    events = clock["events"]
    total = float(clock["total_seconds"])
    notes: list[tuple[str, str, int, int, float]] = []  # text, phoneme, pitch, type, dur
    t0 = float(events[0]["t_sec"])
    if t0 > 0:
        notes.append(("<SP>", "<SP>", 0, 1, t0))
    cursor = t0
    for ev in events:
        if abs(float(ev["t_sec"]) - cursor) > 1e-6:
            gap = float(ev["t_sec"]) - cursor
            if gap < 0:
                raise SystemExit(f"{ev['id']}: onset before previous note end")
            notes.append(("<SP>", "<SP>", 0, 1, gap))
            cursor += gap
        word = ev["word"]
        ph = arpabet(word, g2p)
        ntype = 2 if ev["syllable"] == 0 else 3
        notes.append((word, ph, int(ev["midi"]), ntype, float(ev["dur_sec"])))
        cursor += float(ev["dur_sec"])
    if total - cursor > 1e-6:
        notes.append(("<SP>", "<SP>", 0, 1, total - cursor))
    seg = {
        "index": f"{clock['song_id']}_0_{int(round(total * 1000))}",
        "language": language,
        "time": [0, int(round(total * 1000))],
        "duration": " ".join(f"{d:.4f}" for _, _, _, _, d in notes),
        "text": " ".join(t for t, _, _, _, _ in notes),
        "phoneme": " ".join(p for _, p, _, _, _ in notes),
        "note_pitch": " ".join(str(m) for _, _, m, _, _ in notes),
        "note_type": " ".join(str(n) for _, _, _, n, _ in notes),
    }
    return [seg]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--clock", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--language", default="English")
    a = ap.parse_args()
    clock = json.load(open(a.clock, encoding="utf-8"))
    if clock.get("schema") != "ai-jam-sessions/score-clock/v1":
        raise SystemExit("not a score-clock v1")
    try:
        from g2p_en import G2p
    except ImportError:
        raise SystemExit("g2p_en is not installed in this interpreter; run inside the SoulX venv")
    g2p = G2p()
    target = build_target(clock, g2p, a.language)
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    json.dump(target, open(a.out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    seg = target[0]
    durs = [float(x) for x in seg["duration"].split()]
    print(f"{len(durs)} notes, {sum(durs):.4f}s, time {seg['time']}")
    for t, p, m, n, d in zip(seg["text"].split(), seg["phoneme"].split(), seg["note_pitch"].split(), seg["note_type"].split(), durs):
        print(f"  {t:8} {p:28} midi {m:>3} type {n} dur {d:.4f}")
    print(f"wrote {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
