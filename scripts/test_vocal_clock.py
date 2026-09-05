"""Tests for the vocal placement instrument (pytest; no cloud, no audio files).

    python -m pytest scripts/test_vocal_clock.py -q
"""
from __future__ import annotations

import json
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(__file__))
import vocal_clock as vc  # noqa: E402

CLOCK = os.path.join(os.path.dirname(__file__), "..", "scores", "amazing-grace.score-clock.v1.json")


def synth_syllable(sr, onset, dur, f0=220.0, attack=0.02):
    """A vowel-like tone whose energy rises over `attack` seconds from `onset`."""
    n = int(dur * sr)
    t = np.arange(n) / sr
    env = np.clip(t / attack, 0, 1) * np.exp(-t / max(dur, 1e-3) * 1.5)
    tone = np.sin(2 * np.pi * f0 * t) + 0.5 * np.sin(2 * np.pi * 2 * f0 * t)
    return onset, env * tone * 0.3


def render(sr, seconds, syllables):
    x = np.zeros(int(seconds * sr))
    for onset, y in syllables:
        i = int(onset * sr)
        x[i:i + len(y)] += y[: len(x) - i]
    return x


def test_rise_onset_dates_the_vowel_not_the_peak():
    sr = 48000
    x = render(sr, 2.0, [synth_syllable(sr, 0.8, 0.5, attack=0.03)])
    times, env = vc.band_envelope(x, sr)
    r = vc.rise_onset(times, env, 0.6, 1.2)
    assert r["reason"] == "ok"
    # 50 % of the peak is reached ~half-way up a 30 ms linear attack
    assert abs(r["t"] - (0.8 + 0.015)) < 0.006
    assert r["t_peak"] > r["t"]


def test_rise_onset_ignores_previous_syllable_decay():
    sr = 48000
    x = render(sr, 3.0, [synth_syllable(sr, 0.5, 0.6), synth_syllable(sr, 1.2, 0.5)])
    times, env = vc.band_envelope(x, sr)
    r = vc.rise_onset(times, env, 1.0, 1.6)
    assert r["reason"] == "ok"
    assert abs(r["t"] - 1.21) < 0.006


def test_measure_events_gate_passes_when_vowels_sit_on_the_clock():
    clock = json.load(open(CLOCK))
    sr = clock["sample_rate"]
    seconds = clock["total_seconds"]
    syl = [synth_syllable(sr, ev["t_sec"] - 0.01, 0.4, attack=0.02) for ev in clock["events"]]
    x = render(sr, seconds, syl)
    rows = vc.measure_events(clock, x, sr)
    result = vc.gate(clock, rows, None, len(x), len(x), None)
    assert result["checks"]["onset_abs_ms"]["pass"]
    assert result["checks"]["onset_abs_ms"]["worst_ms"] < 5
    # no transcript, no bed -> those gates fail closed, and so does the verdict
    assert result["verdict"] == "FAIL"
    assert not result["checks"]["order"]["pass"]


def test_gate_fails_on_a_late_vowel():
    clock = json.load(open(CLOCK))
    sr = clock["sample_rate"]
    syl = []
    for k, ev in enumerate(clock["events"]):
        late = 0.06 if k == 5 else 0.0
        syl.append(synth_syllable(sr, ev["t_sec"] - 0.01 + late, 0.4, attack=0.02))
    x = render(sr, clock["total_seconds"], syl)
    rows = vc.measure_events(clock, x, sr)
    result = vc.gate(clock, rows, None, len(x), len(x), None)
    bad = [t for t in result["table"] if not t["pass"]]
    assert [t["id"] for t in bad] == ["v05"]
    assert bad[0]["err_ms"] > 40


def test_align_words_requires_order_and_presence():
    clock = json.load(open(CLOCK))
    groups = vc.clock_words(clock)
    assert [g["word"] for g in groups] == ["amazing", "grace", "how", "sweet", "the", "sound", "that", "saved", "a", "wretch", "like", "me"]
    assert len(groups[0]["events"]) == 3
    ok = [{"text": w, "start": i, "end": i + 0.5, "speaker": "s0"} for i, w in enumerate("amazing grace how sweet the sound that saved a wretch like me".split())]
    al = vc.align_words(groups, ok)
    assert al["in_order"] and not al["missing"] and not al["extra"]
    swapped = ok[:]
    swapped[1], swapped[2] = swapped[2], swapped[1]
    al = vc.align_words(groups, swapped)
    assert not al["in_order"]
    dropped = ok[:5] + ok[6:]
    al = vc.align_words(groups, dropped)
    assert al["missing"] == ["sound"] and not al["in_order"]
    extra = ok[:3] + [{"text": "oh", "start": 2.6, "end": 2.9, "speaker": "s0"}] + ok[3:]
    al = vc.align_words(groups, extra)
    assert al["in_order"] and al["extra"] == ["oh"]


def test_load_words_drops_spacing_and_normalises():
    raw = [{"text": "Amazing,", "type": "word", "start": 2.1, "end": 2.9, "speaker_id": "speaker_0"},
           {"text": " ", "type": "spacing", "start": 2.9, "end": 2.95, "speaker_id": "speaker_0"},
           {"text": "grace.", "type": "word", "start": 3.0, "end": 3.6, "speaker_id": "speaker_0"}]
    path = os.path.join(os.path.dirname(__file__), "..", "tmp", "_test_words.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    json.dump(raw, open(path, "w"))
    try:
        words = vc.load_words(path)
    finally:
        os.remove(path)
    assert [w["text"] for w in words] == ["amazing", "grace"]
    assert words[0]["speaker"] == "speaker_0"


def test_build_plan_cuts_each_syllable_and_lands_the_vowel_on_t_sec():
    clock = json.load(open(CLOCK))
    sr = clock["sample_rate"]
    # a take that sings the 14 syllables at ITS OWN rate: 0.45 s apart from 1.0 s
    src_onsets = [1.0 + 0.45 * k for k in range(14)]
    x = render(sr, 9.0, [synth_syllable(sr, o, 0.3, attack=0.02) for o in src_onsets])
    # transcript: "amazing" spans its three syllables, the rest are one each
    words = []
    groups = vc.clock_words(clock)
    k = 0
    for g in groups:
        n = len(g["events"])
        words.append({"text": g["word"], "raw": g["word"], "start": src_onsets[k] - 0.01, "end": src_onsets[k + n - 1] + 0.28, "speaker": "s0"})
        k += n
    plan = vc.build_plan(clock, words, x, sr)
    cuts = plan["cuts"]
    assert [c["lyric"] for c in cuts] == [e["lyric"] for e in clock["events"]]
    for c, ev, o in zip(cuts, clock["events"], src_onsets):
        assert c["cut_start"] <= c["src_vowel_onset"] < c["cut_end"]
        assert abs(c["src_vowel_onset"] - (o + 0.01)) < 0.008          # measured vowel ≈ synthetic half-attack
        assert abs((c["lead"] + (c["src_vowel_onset"] - c["cut_start"])) - ev["t_sec"]) < 1.5 / sr
        assert c["placed_end"] <= clock["total_seconds"]
        assert round(c["cut_start"] * sr) == pytest.approx(c["cut_start"] * sr)   # sample-snapped
    for a, b in zip(cuts, cuts[1:]):
        assert a["placed_end"] + vc.CLIP_GAP_S <= b["placed_start"] + 1e-9


def test_placed_vocal_graph_matches_fx_dub_place_exact_shape():
    vo = pytest.importorskip("vo_graphs") if vc.FXDUB_TOOLS in sys.path else None
    if vo is None:
        sys.path.insert(0, vc.FXDUB_TOOLS)
        vo = pytest.importorskip("vo_graphs")
    plan = {"total_seconds": 35.0, "cuts": [
        {"id": "v00", "cut_start": 2.5, "clip_seconds": 0.4, "lead": 2.1},
        {"id": "v01", "cut_start": 3.1, "clip_seconds": 0.6, "lead": 3.2},
    ]}
    g = vc.placed_vocal_graph("KEY.flac", plan, "jam/test")
    ref = vo.place_exact("KEY.flac", 2.1, 0.4, 35.0, "jam/test")
    # the per-event chain is node-for-node the fx-dub place_exact shape, with
    # the clip coming from TrimAudioDuration (fx-dub splice) instead of a key
    ref_shapes = [(n["class_type"], sorted(n["inputs"])) for k, n in ref.items() if n["class_type"] in ("EmptyAudio", "AudioConcat")]
    ours = [(g[str(i)]["class_type"], sorted(g[str(i)]["inputs"])) for i in (11, 12, 13, 14)]
    assert ours == ref_shapes
    assert g["10"]["class_type"] == "TrimAudioDuration" and g["10"]["inputs"]["start_index"] == 2.5
    assert g["11"]["inputs"]["duration"] == 2.1
    assert g["13"]["inputs"]["duration"] == pytest.approx(35.0 - 2.1 - 0.4)
    mixes = [n for n in g.values() if n["class_type"] == "AudioMix"]
    assert len(mixes) == 1
    saves = [n for n in g.values() if n["class_type"] == "SaveAudioAdvanced"]
    assert len(saves) == 1 and saves[0]["inputs"]["format"] == "flac"


def test_placed_vocal_graph_refuses_a_clip_past_the_timeline():
    plan = {"total_seconds": 10.0, "cuts": [{"id": "v00", "cut_start": 0.0, "clip_seconds": 2.0, "lead": 9.0}]}
    with pytest.raises(ValueError, match="does not fit"):
        vc.placed_vocal_graph("KEY.flac", plan, "jam/test")
