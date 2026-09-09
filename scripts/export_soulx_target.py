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


def compensate(clock: dict, receipt: dict, gain: float = 1.0, max_shift: float = 0.3) -> tuple[dict, list[dict]]:
    """Shift each note's onset by minus the vowel error a previous take showed
    (from a `vocal_clock.py verify` receipt), so the model's own placement
    lands on the clock and no re-pin cut is needed. Onsets stay monotonic with
    ≥ 0.1 s per note; the clock's `t_sec` is untouched (it is the truth the
    gate measures against) — only the note boundaries handed to the singer move."""
    err = {t["id"]: t.get("err_ms") for t in receipt["table"]}
    events = [dict(ev) for ev in clock["events"]]
    log = []
    prev = 0.0
    for k, ev in enumerate(events):
        e = err.get(ev["id"])
        shift = 0.0 if e is None else -gain * e / 1000.0
        shift = max(-max_shift, min(max_shift, shift))
        onset = max(prev + 0.1, float(ev["t_sec"]) + shift)
        ev["_onset"] = onset
        log.append({"id": ev["id"], "err_ms": e, "shift_ms": round((onset - float(ev["t_sec"])) * 1000, 1)})
        prev = onset
    total = float(clock["total_seconds"])
    for k, ev in enumerate(events):
        nxt = events[k + 1]["_onset"] if k + 1 < len(events) else min(total, ev["_onset"] + float(ev["dur_sec"]))
        ev["t_sec"] = ev["_onset"]
        ev["dur_sec"] = nxt - ev["_onset"]
        del ev["_onset"]
    out = dict(clock)
    out["events"] = events
    return out, log


def syllabify_arpabet(phones: list[str], n: int) -> list[list[str]]:
    """Split ARPAbet phones into n syllables by the maximal-onset rule: every
    vowel (phone ending in a stress digit) is a nucleus; consonants between two
    nuclei go to the following syllable; the final coda stays. If the word has
    a different vowel count than n, the caller falls back to whole-word."""
    vowels = [i for i, p in enumerate(phones) if p[-1].isdigit()]
    if len(vowels) != n:
        return []
    out = []
    start = 0
    for si, vi in enumerate(vowels):
        if si + 1 < len(vowels):
            between = vowels[si + 1] - vi - 1          # consonants between this nucleus and the next
            end = vi + 1 + (1 if between >= 2 else 0)  # one coda only when a cluster sits between; the rest is onset
        else:
            end = len(phones)
        out.append(phones[start:end])
        start = end
    return out


def build_target(clock: dict, g2p, language: str = "English", syllable_words: bool = False) -> list[dict]:
    """`syllable_words`: emit every syllable as its own word (note_type 2) with
    its own phonemes, so the singer re-articulates each one instead of gliding
    through the word — then a cut between syllables is a word boundary."""
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
        if syllable_words and ev["syllables"] > 1:
            parts = syllabify_arpabet(ph[3:].split("-"), ev["syllables"])
            if parts:
                word = ev["lyric"]
                ph = "en_" + "-".join(parts[ev["syllable"]])
                ntype = 2
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
    ap.add_argument("--compensate", help="verify receipt of a previous take: shift note onsets by minus its vowel errors")
    ap.add_argument("--gain", type=float, default=1.0, help="fraction of the measured error to feed back (default 1.0)")
    ap.add_argument("--syllable-words", action="store_true", help="every syllable is its own word with its own phonemes (re-articulated, cuttable between)")
    a = ap.parse_args()
    clock = json.load(open(a.clock, encoding="utf-8"))
    if clock.get("schema") != "ai-jam-sessions/score-clock/v1":
        raise SystemExit("not a score-clock v1")
    comp_log = None
    if a.compensate:
        clock, comp_log = compensate(clock, json.load(open(a.compensate, encoding="utf-8")), a.gain)
        for row in comp_log:
            print(f"  {row['id']} err {row['err_ms']} ms -> shift {row['shift_ms']:+.1f} ms")
    try:
        from g2p_en import G2p
    except ImportError:
        raise SystemExit("g2p_en is not installed in this interpreter; run inside the SoulX venv")
    g2p = G2p()
    target = build_target(clock, g2p, a.language, syllable_words=a.syllable_words)
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    if comp_log is not None:
        target[0]["_compensation"] = {"from": a.compensate.replace("\\", "/"), "gain": a.gain, "shifts": comp_log}
    target[0]["_syllable_words"] = bool(a.syllable_words)
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
