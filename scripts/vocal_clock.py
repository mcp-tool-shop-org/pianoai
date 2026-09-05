#!/usr/bin/env python3
"""Vocal timing as a scientific instrument — place a sung take on the score clock.

One JSON clock (scores/<song>.score-clock.v1.json), one receipt, fail closed.

A generator's timestamps are not a clock: Seed Audio fills a window at its
own speech rate and does not pin a vowel to the G4 at 3.200 s. fx-dub paid
for this class of bug (`place_exact` docstring, session 5). So the take is
treated as a BAG OF TAKES: transcribe it, measure each lyric's vowel onset
from energy (Sundberg 2007: the sung tone starts at the vowel, not the
consonant), cut a span per lyric, and `place_exact` every span at the
clock's `t_sec` on a timeline of exactly `total_samples`. Then measure the
cloud ARTIFACT, never the plan, and gate:

  onset_abs_ms   any event |vowel onset - t_sec| > 40 ms      -> FAIL
  order          transcript word order != clock lyric order   -> FAIL
  one_voice      diarization finds > 1 speaker                -> FAIL
  fits_timeline  last speech beyond total_seconds             -> FAIL
  length_match   |vocal_len - bed_len| > 1 sample @ 48 kHz    -> FAIL

Subcommands (run in this order; each writes what the next reads):

  bed-check   measure the rendered bed's piano onsets against the clock
  transcribe  fx-dub `transcribe` graph on a cloud key -> word JSON
  plan        words + take -> per-event cut spans and leads (local, free)
  place       one Comfy job: TrimAudioDuration + place_exact shapes + AudioMix
  verify      gate the downloaded placed stem (energy + transcript + lengths)
  mix         upload the bed, fx-dub `mix_dialogue_anchored`, download

Graph builders come from E:/AI/fx-dub/tools/vo_graphs.py (FXDUB_TOOLS env
overrides). Cloud transport: scripts/comfy_rest.py.
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import sys
from dataclasses import dataclass, asdict

import numpy as np

SR = 48000
GATE_MS = 40.0
# The vowel band: F1–F2 energy. Nasal murmur (anti-formant zeros above
# ~400 Hz), stop closures and fricatives (energy above 3 kHz) all sit 10–20 dB
# below the vowel here, so a vowel onset is an energy RISE in this band even
# when the wide-band envelope is flat through "ma", "me", "saved a".
VOWEL_BAND_HZ = (400.0, 3000.0)
RISE_FRACTION = 0.5          # vowel onset = envelope crosses 50 % (-6 dB) of the syllable peak
ENV_WIN_S = 0.008
ENV_HOP_S = 0.0005
PEAK_BEFORE_S = 0.10         # the syllable peak is searched from this far before the STT word start
SEARCH_BEFORE_S = 0.30       # ...and the rise up to it from this far back (Scribe dated "a" 170 ms late)
SEARCH_AFTER_S = 0.35        # how far after the STT word start the peak may sit
SLOPE_MIN_DB = 3.0           # legato fallback: the steepest rise must climb at least this over ±15 ms
CUT_LEAD_IN_S = 0.04         # keep this much before the vowel (the consonant) so the artifact shows the rise
CUT_TAIL_S = 0.06
CLIP_GAP_S = 0.010           # placed clips never overlap; this much air between them
STT_WARN_MS = 60.0           # transcript word start vs clock: cross-check, not the gate
HEADROOM_PEAK = 0.9          # the mix bus sums; bed peak + vocal peak must fit under this (-0.9 dBFS)

FXDUB_TOOLS = os.environ.get("FXDUB_TOOLS", r"E:/AI/fx-dub/tools")


def _vo_graphs():
    if FXDUB_TOOLS not in sys.path:
        sys.path.insert(0, FXDUB_TOOLS)
    import vo_graphs  # noqa: E402
    return vo_graphs


# ─── audio ────────────────────────────────────────────────────────────────────

def read_audio(path: str) -> tuple[np.ndarray, int, int]:
    """(mono float64, sample_rate, frames). Stereo is averaged."""
    import soundfile as sf
    data, sr = sf.read(path, always_2d=True, dtype="float64")
    return data.mean(axis=1), int(sr), int(data.shape[0])


def band_envelope(mono: np.ndarray, sr: int, band=VOWEL_BAND_HZ, win_s=ENV_WIN_S, hop_s=ENV_HOP_S):
    """Zero-phase band-passed RMS envelope. Returns (times, env) with times at
    window centres, so a rise is dated where it happens, not half a window late."""
    from scipy.signal import butter, sosfiltfilt
    if band is not None:
        sos = butter(4, [band[0], band[1]], btype="bandpass", fs=sr, output="sos")
        x = sosfiltfilt(sos, mono)
    else:
        x = mono
    win = max(1, int(round(win_s * sr)))
    hop = max(1, int(round(hop_s * sr)))
    sq = np.concatenate([[0.0], np.cumsum(x * x)])
    starts = np.arange(0, max(1, len(x) - win + 1), hop)
    env = np.sqrt((sq[starts + win] - sq[starts]) / win)
    times = (starts + win / 2) / sr
    return times, env


def rise_onset(times: np.ndarray, env: np.ndarray, lo: float, hi: float, frac=RISE_FRACTION, search_lo: float | None = None) -> dict:
    """Vowel onset = the last upward crossing of frac*peak before the envelope
    peak in [lo, hi], searching back as far as `search_lo` (default lo). A
    previous syllable's decay must DROP below the threshold before a rise
    counts. Linear interpolation between hops.

    Legato fallback (`method: "slope"`): when nothing before the peak sits
    below the threshold (a 5 dB l→aɪ in "like"), the onset is the steepest
    rise of the dB envelope in the 150 ms before the peak, accepted only if
    the envelope climbs SLOPE_MIN_DB across ±15 ms of it. Otherwise `t` is
    None and the caller must say so."""
    if search_lo is None:
        search_lo = lo
    sel = np.where((times >= lo) & (times <= hi))[0]
    if len(sel) == 0:
        return {"t": None, "peak": 0.0, "reason": "empty-window", "method": None}
    seg = env[sel]
    ip = int(np.argmax(seg))
    peak = float(seg[ip])
    if peak <= 0:
        return {"t": None, "peak": 0.0, "reason": "silent", "method": None}
    t_peak = float(times[sel[ip]])
    thr = frac * peak
    back = np.where((times >= search_lo) & (times <= t_peak))[0]
    segb = env[back]
    below = np.where(segb[:-1] < thr)[0]
    if len(below) > 0:
        k = int(below[-1])
        t0, t1 = times[back[k]], times[back[k + 1]]
        e0, e1 = segb[k], segb[k + 1]
        t = t0 + (thr - e0) / (e1 - e0) * (t1 - t0) if e1 > e0 else t1
        return {"t": float(t), "peak": peak, "t_peak": t_peak, "reason": "ok", "method": "rise"}
    # slope fallback
    win = np.where((times >= max(search_lo, t_peak - 0.15)) & (times <= t_peak))[0]
    if len(win) < 3:
        return {"t": None, "peak": peak, "t_peak": t_peak, "reason": "no-rise-in-window", "method": None}
    db = 20 * np.log10(env + 1e-9)
    hop = float(times[1] - times[0]) if len(times) > 1 else ENV_HOP_S
    step = max(1, int(round(0.015 / hop)))
    best, best_i = -1e9, None
    for i in win:
        a, b = max(0, i - step), min(len(db) - 1, i + step)
        climb = db[b] - db[a]
        if climb > best:
            best, best_i = climb, i
    if best_i is None or best < SLOPE_MIN_DB:
        return {"t": None, "peak": peak, "t_peak": t_peak, "reason": "no-rise-in-window", "method": None}
    return {"t": float(times[best_i]), "peak": peak, "t_peak": t_peak, "reason": "ok", "method": "slope", "climb_db": round(float(best), 1)}


def syllable_nuclei(times, env, lo, hi, n, min_gap_s=0.06) -> list[float]:
    """The n most prominent envelope peaks in [lo, hi], in time order."""
    from scipy.signal import find_peaks
    sel = np.where((times >= lo) & (times <= hi))[0]
    if len(sel) == 0:
        return []
    seg = env[sel]
    hop = float(times[1] - times[0]) if len(times) > 1 else ENV_HOP_S
    peaks, props = find_peaks(seg, distance=max(1, int(min_gap_s / hop)), prominence=0.05 * float(seg.max() or 1))
    if len(peaks) < n:
        return [float(times[sel[p]]) for p in peaks]
    order = np.argsort(props["prominences"])[::-1][:n]
    return sorted(float(times[sel[peaks[i]]]) for i in order)


def valley_between(times, env, a, b) -> float:
    sel = np.where((times >= a) & (times <= b))[0]
    if len(sel) == 0:
        return (a + b) / 2
    return float(times[sel[int(np.argmin(env[sel]))]])


def rms_db(x: np.ndarray) -> float:
    return float(10 * np.log10(np.mean(x * x) + 1e-20))


# ─── transcript ───────────────────────────────────────────────────────────────

def norm_word(text: str) -> str:
    return re.sub(r"[^a-z']", "", text.lower())


def load_words(path: str) -> list[dict]:
    raw = json.load(open(path, encoding="utf-8"))
    if isinstance(raw, str):
        raw = json.loads(raw)
    words = raw if isinstance(raw, list) else raw.get("words", [])
    out = []
    for w in words:
        if not isinstance(w, dict) or w.get("type") not in (None, "word"):
            continue
        text = norm_word(str(w.get("text", "")))
        if not text:
            continue
        out.append({"text": text, "raw": w.get("text"), "start": float(w["start"]), "end": float(w["end"]),
                    "speaker": w.get("speaker_id") or w.get("speaker")})
    return out


def clock_words(clock: dict) -> list[dict]:
    """Distinct transcribable words of the clock, in order, with their events."""
    groups: list[dict] = []
    for ev in clock["events"]:
        if ev["syllable"] == 0:
            groups.append({"word": norm_word(ev["word"]), "events": [ev]})
        else:
            groups[-1]["events"].append(ev)
    return groups


def align_words(groups: list[dict], words: list[dict]) -> dict:
    """Order-preserving alignment of clock words onto transcript words.
    Every clock word must land on exactly one transcript word, in order."""
    a = [g["word"] for g in groups]
    b = [w["text"] for w in words]
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)
    mapping: dict[int, int] = {}
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                mapping[i1 + k] = j1 + k
    missing = [a[i] for i in range(len(a)) if i not in mapping]
    matched_b = set(mapping.values())
    extra = [b[j] for j in range(len(b)) if j not in matched_b]
    in_order = all(mapping[i] < mapping[i + 1] for i in range(len(a) - 1) if i in mapping and i + 1 in mapping)
    return {"map": mapping, "missing": missing, "extra": extra, "in_order": in_order and not missing}


# ─── plan ─────────────────────────────────────────────────────────────────────

@dataclass
class Cut:
    id: str
    lyric: str
    word: str
    t_sec: float
    src_word_start: float
    src_word_end: float
    src_vowel_onset: float
    method: str
    cut_start: float
    cut_end: float
    lead: float
    clip_seconds: float
    placed_start: float
    placed_end: float
    note: str


def snap(sec: float, sr: int = SR) -> float:
    return round(sec * sr) / sr


def detector_info() -> dict:
    return {"band_hz": list(VOWEL_BAND_HZ), "rise_fraction": RISE_FRACTION, "env_win_s": ENV_WIN_S, "env_hop_s": ENV_HOP_S,
            "slope_min_db": SLOPE_MIN_DB,
            "principle": "vowel onset = sung tone start (Sundberg 2007); the same detector and per-event method date the source take and the placed artifact"}


def build_plan(clock: dict, words: list[dict], mono: np.ndarray, sr: int) -> dict:
    """Per event: where its vowel is in the take, what to cut, where it lands.

    The transcript places the WORD (to ~100 ms; Scribe dated "a" 170 ms late
    on the Seed take); the vowel band envelope dates the ONSET. The peak of a
    word is looked for from PEAK_BEFORE_S before its transcript start; the
    rise up to that peak is searched back to the previous word's start, so a
    late transcript boundary cannot hide the true onset."""
    groups = clock_words(clock)
    al = align_words(groups, words)
    if not al["in_order"]:
        raise SystemExit(f"cannot plan: clock words not found in order. missing={al['missing']} extra={al['extra']}")
    times, env = band_envelope(mono, sr)
    take_end = len(mono) / sr
    total = float(clock["total_seconds"])
    cuts: list[Cut] = []
    for gi, g in enumerate(groups):
        wi = al["map"][gi]
        w = words[wi]
        prev_start = words[wi - 1]["start"] if wi > 0 else 0.0
        next_start = words[wi + 1]["start"] if wi + 1 < len(words) else take_end
        n = len(g["events"])
        peak_lo = max(0.0, w["start"] - PEAK_BEFORE_S, prev_start + 0.05)
        peak_hi = min(w["start"] + SEARCH_AFTER_S, w["end"] + 0.05, next_start - 0.005, take_end)
        search_lo = max(0.0, w["start"] - SEARCH_BEFORE_S, prev_start + 0.05)
        cut_hi = min(w["end"] + CUT_TAIL_S, next_start - 0.005, take_end)
        if n == 1:
            onset = rise_onset(times, env, peak_lo, peak_hi, search_lo=search_lo)
            if onset["t"] is None:
                raise SystemExit(f"no vowel onset for '{g['word']}' in [{peak_lo:.3f},{peak_hi:.3f}] ({onset['reason']})")
            starts = [max(0.0, min(w["start"] - 0.02, onset["t"] - CUT_LEAD_IN_S))]
            ends = [max(cut_hi, onset["t"] + 0.08)]
            onsets = [onset["t"]]
            methods = [onset["method"]]
            climb = f"; climb {onset['climb_db']} dB" if "climb_db" in onset else ""
            notes = [f"{onset['method']}; vowel {((onset['t'] - w['start']) * 1000):+.0f} ms vs STT start{climb}"]
        else:
            nuclei = syllable_nuclei(times, env, max(0.0, w["start"] - 0.05, prev_start + 0.05), min(w["end"] + 0.05, next_start - 0.005), n)
            if len(nuclei) != n:
                raise SystemExit(f"'{g['word']}' needs {n} syllable nuclei, found {len(nuclei)} at {nuclei}")
            bounds = [None]
            for i in range(1, n):
                bounds.append(valley_between(times, env, nuclei[i - 1], nuclei[i]))
            bounds.append(cut_hi)
            starts, ends, onsets, methods, notes = [], [], [], [], []
            for i in range(n):
                if i == 0:
                    onset = rise_onset(times, env, peak_lo, nuclei[0] + 0.001, search_lo=search_lo)
                else:
                    onset = rise_onset(times, env, bounds[i], nuclei[i] + 0.001, search_lo=bounds[i])
                if onset["t"] is None:
                    raise SystemExit(f"no vowel onset for syllable {i + 1} of '{g['word']}' ({onset['reason']})")
                if i == 0:
                    starts.append(max(0.0, min(w["start"] - 0.02, onset["t"] - CUT_LEAD_IN_S)))
                else:
                    starts.append(bounds[i])
                ends.append(bounds[i + 1])
                onsets.append(max(onset["t"], starts[-1]))
                methods.append(onset["method"])
                notes.append(f"syllable {i + 1}/{n} nucleus {nuclei[i]:.3f} {onset['method']}")
        for i, ev in enumerate(g["events"]):
            cuts.append(Cut(
                id=ev["id"], lyric=ev["lyric"], word=g["word"], t_sec=float(ev["t_sec"]),
                src_word_start=w["start"], src_word_end=w["end"], src_vowel_onset=onsets[i], method=methods[i],
                cut_start=starts[i], cut_end=ends[i], lead=0.0, clip_seconds=0.0,
                placed_start=0.0, placed_end=0.0, note=notes[i]))
    # place: vowel onset lands on t_sec; clips never overlap; sample-snapped
    for c in cuts:
        vowel_off = c.src_vowel_onset - c.cut_start
        if vowel_off < 0:
            raise SystemExit(f"{c.id}: vowel onset before cut start")
        c.lead = snap(c.t_sec - vowel_off)
        if c.lead < 0:
            c.cut_start = snap(c.cut_start - c.lead)  # trim the lead-in instead of going negative
            c.lead = 0.0
        c.cut_start = snap(c.cut_start)
        c.cut_end = snap(c.cut_end)
        c.placed_start = c.lead
    for k, c in enumerate(cuts):
        limit = cuts[k + 1].placed_start - CLIP_GAP_S if k + 1 < len(cuts) else total
        max_clip = snap(limit - c.lead)
        clip = snap(c.cut_end - c.cut_start)
        if clip > max_clip:
            clip = max_clip
            c.cut_end = snap(c.cut_start + clip)
            c.note += f"; capped to {clip:.3f}s by next event"
        if clip <= snap(c.src_vowel_onset - c.cut_start) + 0.03:
            raise SystemExit(f"{c.id} '{c.lyric}': clip {clip:.3f}s too short to carry its vowel")
        c.clip_seconds = clip
        c.placed_end = snap(c.lead + clip)
        if c.placed_end > total:
            raise SystemExit(f"{c.id}: placed clip ends at {c.placed_end} > total {total}")
    return {
        "clock": clock.get("_path"),
        "total_seconds": total,
        "total_samples": int(clock["total_samples"]),
        "sample_rate": int(clock["sample_rate"]),
        "alignment": {"missing": al["missing"], "extra": al["extra"]},
        "detector": detector_info(),
        "cuts": [asdict(c) for c in cuts],
    }


# ─── graphs (fx-dub shapes) ───────────────────────────────────────────────────

def placed_vocal_graph(source_key: str, plan: dict, prefix: str, sample_rate: int = SR, channels: int = 2) -> dict:
    """One job: for each cut, TrimAudioDuration (fx-dub `splice` primitive)
    then the exact `place_exact` shape (lead EmptyAudio + AudioConcat + tail
    EmptyAudio + AudioConcat, so every track is EXACTLY total_seconds long),
    then AudioMix them together at unity. Nothing passes through a model."""
    vo = _vo_graphs()
    total = float(plan["total_seconds"])
    graph = {}
    graph.update(vo.load_audio("1", source_key))
    placed = []
    nid = 10
    for c in plan["cuts"]:
        trim = str(nid)
        graph[trim] = {"class_type": "TrimAudioDuration",
                       "inputs": {"audio": ["1", 0], "start_index": float(c["cut_start"]), "duration": float(c["clip_seconds"])}}
        # place_exact shape, node-for-node (vo_graphs.place_exact)
        lead = float(c["lead"])
        tail = total - lead - float(c["clip_seconds"])
        if tail < 0:
            raise ValueError(f"{c['id']}: clip does not fit: {c['clip_seconds']}s at {lead}s exceeds {total}s")
        graph[str(nid + 1)] = {"class_type": "EmptyAudio", "inputs": {"duration": lead, "sample_rate": sample_rate, "channels": channels}}
        graph[str(nid + 2)] = {"class_type": "AudioConcat", "inputs": {"audio1": [str(nid + 1), 0], "audio2": [trim, 0], "direction": "after"}}
        graph[str(nid + 3)] = {"class_type": "EmptyAudio", "inputs": {"duration": round(tail, 6), "sample_rate": sample_rate, "channels": channels}}
        graph[str(nid + 4)] = {"class_type": "AudioConcat", "inputs": {"audio1": [str(nid + 2), 0], "audio2": [str(nid + 3), 0], "direction": "after"}}
        placed.append([str(nid + 4), 0])
        nid += 5
    acc = placed[0]
    for nxt in placed[1:]:
        graph[str(nid)] = {"class_type": "AudioMix", "inputs": {"audio_1": acc, "audio_2": nxt, "gain_1_db": 0.0, "gain_2_db": 0.0}}
        acc = [str(nid), 0]
        nid += 1
    graph.update(vo._save(str(nid), acc, prefix))
    return graph


# ─── measure the artifact ────────────────────────────────────────────────────

def measure_events(clock: dict, mono: np.ndarray, sr: int, plan: dict | None = None) -> list[dict]:
    """Date each event's vowel on the ARTIFACT with the method the plan chose
    for it (rise, or slope for legato syllables). The window opens 12 ms after
    the clip's own cut edge so the cut is never what gets dated."""
    times, env = band_envelope(mono, sr)
    cuts = {c["id"]: c for c in (plan or {}).get("cuts", [])}
    rows = []
    evs = clock["events"]
    for k, ev in enumerate(evs):
        t = float(ev["t_sec"])
        c = cuts.get(ev["id"])
        lo = max(0.0, t - PEAK_BEFORE_S)
        search_lo = max(0.0, t - SEARCH_BEFORE_S)
        if c is not None:
            lo = max(lo, c["placed_start"] + 0.012)
            search_lo = max(search_lo, c["placed_start"] + 0.012)
        hi = t + SEARCH_AFTER_S
        if k + 1 < len(evs):
            nxt = cuts.get(evs[k + 1]["id"])
            hi = min(hi, (nxt["placed_start"] if nxt else float(evs[k + 1]["t_sec"])) - CLIP_GAP_S)
        if c is not None:
            hi = min(hi, c["placed_end"])
        onset = rise_onset(times, env, lo, hi, search_lo=search_lo)
        want = c["method"] if c is not None else None
        if onset["t"] is not None and want is not None and onset["method"] != want:
            onset = dict(onset, reason=f"method-mismatch:{onset['method']}!={want}")
        rows.append({"id": ev["id"], "lyric": ev["lyric"], "t_score": t, "method": onset.get("method"),
                     "t_vowel": onset["t"], "peak": onset["peak"], "reason": onset["reason"]})
    return rows


def gate(clock: dict, rows: list[dict], words: list[dict] | None, vocal_frames: int, bed_frames: int | None, plan: dict | None) -> dict:
    checks = {}
    table = []
    worst = 0.0
    for r in rows:
        if r["t_vowel"] is None:
            err = None
            ok = False
        else:
            err = (r["t_vowel"] - r["t_score"]) * 1000.0
            ok = abs(err) <= GATE_MS and r["reason"] == "ok"
            worst = max(worst, abs(err))
        table.append({**r, "err_ms": None if err is None else round(err, 2), "pass": ok})
    checks["onset_abs_ms"] = {"pass": all(t["pass"] for t in table), "gate_ms": GATE_MS, "worst_ms": round(worst, 2)}
    total = float(clock["total_seconds"])
    if words is not None:
        al = align_words(clock_words(clock), words)
        speakers = sorted({w["speaker"] for w in words if w["speaker"] is not None})
        checks["order"] = {"pass": al["in_order"], "missing": al["missing"], "extra": al["extra"]}
        checks["one_voice"] = {"pass": len(speakers) <= 1, "speakers": speakers}
        last_speech = max((w["end"] for w in words), default=0.0)
        checks["fits_timeline"] = {"pass": last_speech <= total + 1e-6, "last_speech_end": last_speech, "total_seconds": total}
        # cross-check: transcript word starts vs the clock (word-initial events only)
        groups = clock_words(clock)
        stt = {}
        for gi, g in enumerate(groups):
            if gi in al["map"]:
                w = words[al["map"][gi]]
                ev = g["events"][0]
                stt[ev["id"]] = round((w["start"] - float(ev["t_sec"])) * 1000.0, 1)
        for t in table:
            t["stt_err_ms"] = stt.get(t["id"])
        checks["stt_cross_check"] = {"info": True, "warn_ms": STT_WARN_MS,
                                     "over": [i for i, e in stt.items() if abs(e) > STT_WARN_MS]}
    else:
        checks["order"] = {"pass": False, "reason": "no transcript of the placed stem"}
        checks["one_voice"] = {"pass": False, "reason": "no transcript of the placed stem"}
        checks["fits_timeline"] = {"pass": False, "reason": "no transcript of the placed stem"}
    if plan is not None:
        last_clip = max(c["placed_end"] for c in plan["cuts"])
        checks["fits_timeline"]["last_clip_end"] = last_clip
        checks["fits_timeline"]["pass"] = checks["fits_timeline"].get("pass", False) and last_clip <= total + 1e-6
    if bed_frames is None:
        checks["length_match"] = {"pass": False, "reason": "no bed to compare"}
    else:
        checks["length_match"] = {"pass": abs(vocal_frames - bed_frames) <= 1, "vocal_frames": vocal_frames,
                                  "bed_frames": bed_frames, "clock_frames": int(clock["total_samples"])}
        checks["length_match"]["pass"] = checks["length_match"]["pass"] and abs(vocal_frames - int(clock["total_samples"])) <= 1
    verdict = all(v.get("pass", True) for v in checks.values() if not v.get("info"))
    return {"verdict": "PASS" if verdict else "FAIL", "checks": checks, "table": table}


def print_table(result: dict) -> None:
    print(f"{'id':4} {'lyric':7} {'t_score':>8} {'t_vowel':>8} {'err_ms':>8} {'stt_ms':>7} {'method':6}  result")
    for t in result["table"]:
        tv = "       -" if t["t_vowel"] is None else f"{t['t_vowel']:8.4f}"
        em = "       -" if t["err_ms"] is None else f"{t['err_ms']:8.1f}"
        st = "      -" if t.get("stt_err_ms") is None else f"{t['stt_err_ms']:7.1f}"
        print(f"{t['id']:4} {t['lyric']:7} {t['t_score']:8.4f} {tv} {em} {st} {str(t.get('method') or '-'):6}  {'PASS' if t['pass'] else 'FAIL'} {'' if t['reason']=='ok' else t['reason']}")
    for name, c in result["checks"].items():
        if c.get("info"):
            print(f"  {name:15} info  {json.dumps({k: v for k, v in c.items() if k != 'info'})}")
        else:
            print(f"  {name:15} {'PASS' if c['pass'] else 'FAIL'}  {json.dumps({k: v for k, v in c.items() if k != 'pass'})}")
    print(f"VERDICT {result['verdict']}")


# ─── bed check ───────────────────────────────────────────────────────────────

SILENCE_DBFS = -40.0


def bed_onsets(clock: dict, mono: np.ndarray, sr: int, render_receipt: dict | None, tol_ms=3.0) -> dict:
    """Receipt on the render, not a musical gate.

    Timing: the renderer records the context time it told the engine to start
    each note (`scheduled` in the render receipt, quantised to the 128-sample
    render quantum). Each event's piano note must have been started within
    `tol_ms` of `t_sec`. Onsets struck over a still-ringing chord are not
    separable acoustically (same pitches, release overlapping attack), so the
    engine's own record is the measurement.

    Acoustic latency: where the 30 ms before an event is digital silence, the
    first sample above SILENCE_DBFS dates the sound itself; the engine's
    attack ramp starts at zero gain, so the sound is a few ms behind the
    note-on. Reported so the Director knows where the piano is heard.
    """
    sched = (render_receipt or {}).get("scheduled") or []
    thr = 10 ** (SILENCE_DBFS / 20)
    rows = []
    for ev in clock["events"]:
        t = float(ev["t_sec"])
        row = {"id": ev["id"], "t_score": t, "t_noteon": None, "late_ms": None, "acoustic_ms": None, "pass": True, "note": ev["anchor"]}
        if ev.get("engine_note"):
            hits = [s for s in sched if s["midi"] == ev["midi"] and abs(s["t_nominal"] - t) < 1e-4]
            if not hits:
                row.update({"pass": False, "note": row["note"] + " (no scheduled note-on in the render receipt)"})
            else:
                s = hits[0]
                row["t_noteon"] = s["t_actual"]
                row["late_ms"] = round((s["t_actual"] - t) * 1000.0, 3)
                row["pass"] = abs(row["late_ms"]) <= tol_ms
            i0 = int(round(t * sr))
            pre = np.abs(mono[max(0, i0 - int(0.03 * sr)):i0])
            if len(pre) and pre.max() < thr:
                seg = np.abs(mono[i0:i0 + int(0.05 * sr)])
                j = int(np.argmax(seg > thr)) if np.any(seg > thr) else None
                row["acoustic_ms"] = None if j is None else round(j / sr * 1000.0, 2)
        rows.append(row)
    acoustic = [r["acoustic_ms"] for r in rows if r["acoustic_ms"] is not None]
    return {"pass": all(r["pass"] for r in rows) and bool(sched), "tol_ms": tol_ms, "rows": rows,
            "acoustic_latency_ms": {"n": len(acoustic), "min": min(acoustic) if acoustic else None, "max": max(acoustic) if acoustic else None},
            "engine": (render_receipt or {}).get("engine")}


# ─── CLI ─────────────────────────────────────────────────────────────────────

def load_clock(path: str) -> dict:
    clock = json.load(open(path, encoding="utf-8"))
    if clock.get("schema") != "ai-jam-sessions/score-clock/v1":
        raise SystemExit(f"{path}: not a score-clock v1")
    clock["_path"] = path.replace("\\", "/")
    return clock


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def cmd_bed_check(a):
    clock = load_clock(a.clock)
    mono, sr, frames = read_audio(a.bed)
    receipt_path = a.render_receipt or re.sub(r"\.wav$", ".receipt.json", a.bed)
    render_receipt = json.load(open(receipt_path, encoding="utf-8")) if os.path.exists(receipt_path) else None
    if render_receipt and render_receipt.get("sha256") != sha256(a.bed):
        raise SystemExit(f"{receipt_path} is not the receipt of {a.bed} (sha256 differs)")
    res = bed_onsets(clock, mono, sr, render_receipt)
    res["bed"] = a.bed.replace("\\", "/")
    res["render_receipt"] = receipt_path.replace("\\", "/") if render_receipt else None
    res["bed_frames"] = frames
    res["length_pass"] = frames == int(clock["total_samples"])
    print(f"{'id':4} {'t_score':>8} {'t_noteon':>9} {'late_ms':>8} {'sound_ms':>8}  result")
    for r in res["rows"]:
        tn = "      -" if r["t_noteon"] is None else f"{r['t_noteon']:9.4f}"
        lm = "     -" if r["late_ms"] is None else f"{r['late_ms']:8.3f}"
        am = "     -" if r["acoustic_ms"] is None else f"{r['acoustic_ms']:8.2f}"
        print(f"{r['id']:4} {r['t_score']:8.4f} {tn} {lm} {am}  {'PASS' if r['pass'] else 'FAIL'}  {r['note']}")
    print(f"engine {res['engine']}; acoustic latency at from-silence onsets: {res['acoustic_latency_ms']}")
    print(f"bed frames {frames} clock frames {clock['total_samples']} {'PASS' if res['length_pass'] else 'FAIL'}")
    ok = res["pass"] and res["length_pass"]
    print(f"BED {'PASS' if ok else 'FAIL'}")
    if a.out:
        json.dump(res, open(a.out, "w", encoding="utf-8"), indent=2)
    return 0 if ok else 1


def cmd_transcribe(a):
    import comfy_rest
    vo = _vo_graphs()
    key = comfy_rest.api_key()
    graph = vo.transcribe(a.key, a.prefix)
    recs = comfy_rest.run_graph(graph, key, os.path.dirname(a.out) or ".", want_ext=(".json", ".txt"))
    raw = open(recs[0]["path"], "rb").read()
    text = raw.decode("utf-8")
    try:
        parsed = json.loads(text)
        if isinstance(parsed, str):
            parsed = json.loads(parsed)
    except json.JSONDecodeError:
        raise SystemExit(f"transcript is not JSON: {text[:300]!r}")
    json.dump(parsed, open(a.out, "w", encoding="utf-8"), indent=1)
    words = load_words(a.out)
    print(f"{len(words)} words, speakers {sorted({w['speaker'] for w in words})}: " + " ".join(f"{w['raw']}@{w['start']:.2f}" for w in words))
    return 0


def cmd_plan(a):
    clock = load_clock(a.clock)
    words = load_words(a.words)
    mono, sr, frames = read_audio(a.take)
    if sr != int(clock["sample_rate"]):
        raise SystemExit(f"take is {sr} Hz, clock is {clock['sample_rate']} Hz")
    plan = build_plan(clock, words, mono, sr)
    plan["take"] = {"path": a.take.replace("\\", "/"), "frames": frames, "seconds": frames / sr, "sha256": sha256(a.take)}
    plan["words"] = a.words.replace("\\", "/")
    json.dump(plan, open(a.out, "w", encoding="utf-8"), indent=2)
    print(f"{'id':4} {'lyric':7} {'t_sec':>8} {'vowel@src':>9} {'cut':>15} {'clip':>6} {'lead':>8}  note")
    for c in plan["cuts"]:
        print(f"{c['id']:4} {c['lyric']:7} {c['t_sec']:8.4f} {c['src_vowel_onset']:9.4f} [{c['cut_start']:6.3f},{c['cut_end']:6.3f}] {c['clip_seconds']:6.3f} {c['lead']:8.4f}  {c['note']}")
    print(f"wrote {a.out}")
    return 0


def cmd_place(a):
    import comfy_rest
    plan = json.load(open(a.plan, encoding="utf-8"))
    graph = placed_vocal_graph(a.key, plan, a.prefix)
    if a.dry_run:
        json.dump(graph, open(a.out_graph, "w", encoding="utf-8"), indent=1)
        print(f"graph: {len(graph)} nodes -> {a.out_graph} (dry run, nothing submitted)")
        return 0
    key = comfy_rest.api_key()
    json.dump(graph, open(a.out_graph, "w", encoding="utf-8"), indent=1)
    recs = comfy_rest.run_graph(graph, key, a.out_dir, want_ext=(".flac", ".wav"))
    rec = recs[0]
    mono, sr, frames = read_audio(rec["path"])
    info = {"job": rec["job"], "key": rec["filename"], "subfolder": rec["subfolder"], "path": rec["path"].replace("\\", "/"),
            "frames": frames, "sample_rate": sr, "seconds": frames / sr, "sha256": sha256(rec["path"]),
            "plan": a.plan.replace("\\", "/"), "graph_nodes": len(graph)}
    json.dump(info, open(a.out_info, "w", encoding="utf-8"), indent=2)
    print(f"placed stem key {rec['filename']} frames {frames} ({frames / sr:.4f}s) -> {a.out_info}")
    return 0


def cmd_verify(a):
    clock = load_clock(a.clock)
    mono, sr, frames = read_audio(a.vocal)
    if sr != int(clock["sample_rate"]):
        raise SystemExit(f"vocal is {sr} Hz, clock is {clock['sample_rate']} Hz")
    bed_frames = read_audio(a.bed)[2] if a.bed else None
    words = load_words(a.words) if a.words else None
    plan = json.load(open(a.plan, encoding="utf-8")) if a.plan else None
    rows = measure_events(clock, mono, sr, plan)
    result = gate(clock, rows, words, frames, bed_frames, plan)
    result["artifacts"] = {"clock": clock["_path"], "vocal": a.vocal.replace("\\", "/"), "vocal_sha256": sha256(a.vocal),
                           "bed": a.bed.replace("\\", "/") if a.bed else None, "bed_sha256": sha256(a.bed) if a.bed else None,
                           "words": a.words.replace("\\", "/") if a.words else None, "plan": a.plan.replace("\\", "/") if a.plan else None}
    result["detector"] = detector_info()
    print_table(result)
    if a.receipt:
        json.dump(result, open(a.receipt, "w", encoding="utf-8"), indent=2)
        print(f"receipt -> {a.receipt}")
    return 0 if result["verdict"] == "PASS" else 1


def cmd_mix(a):
    import comfy_rest
    vo = _vo_graphs()
    key = comfy_rest.api_key()
    bed_mono, sr, bed_frames = read_audio(a.bed)
    vo_mono, vsr, vo_frames = read_audio(a.vocal)
    if abs(bed_frames - vo_frames) > 1:
        raise SystemExit(f"refusing to mix: bed {bed_frames} frames, vocal {vo_frames} frames")
    plan = json.load(open(a.plan, encoding="utf-8"))
    # gain-stage from a meter: vocal measured over its placed clips, bed over its whole length
    idx = np.zeros(vo_frames, dtype=bool)
    for c in plan["cuts"]:
        idx[int(c["placed_start"] * vsr):int(c["placed_end"] * vsr)] = True
    vo_db = rms_db(vo_mono[idx])
    bed_db = rms_db(bed_mono)
    bed_lin = 10 ** (a.bed_gain_db / 20)
    want = bed_db + a.bed_gain_db + a.vocal_over_bed_db - vo_db
    # headroom: AudioMix sums, so the two peaks must fit under HEADROOM_PEAK
    # together (the first mix of this run clipped at +15 dB — measured, not vibes)
    bed_peak = float(np.abs(bed_mono).max()) * bed_lin
    vo_peak = float(np.abs(vo_mono).max())
    room = max(1e-6, HEADROOM_PEAK - bed_peak)
    cap = 20 * np.log10(room / max(vo_peak, 1e-6))
    vo_gain = int(np.floor(min(want, cap)))
    vo_gain = max(-24, min(24, vo_gain))
    print(f"bed {bed_db:.1f} dB RMS peak {bed_peak / bed_lin:.2f} (@{a.bed_gain_db:+.1f} dB -> {bed_peak:.2f}); "
          f"vocal (in clips) {vo_db:.1f} dB RMS peak {vo_peak:.2f}; wanted {want:+.1f} dB, headroom cap {cap:+.1f} dB "
          f"-> AudioAdjustVolume {vo_gain:+d} dB (vocal {vo_db + vo_gain - bed_db - a.bed_gain_db:+.1f} dB over bed)")
    bed_key = comfy_rest.upload_file(a.bed, key, "audio/wav")
    graph = vo.mix_dialogue_anchored(bed_key, a.vocal_key, a.prefix, vo_gain_db=vo_gain, bed_gain_db=a.bed_gain_db)
    recs = comfy_rest.run_graph(graph, key, a.out_dir, want_ext=(".flac", ".wav"))
    rec = recs[0]
    mono, msr, frames = read_audio(rec["path"])
    info = {"job": rec["job"], "key": rec["filename"], "path": rec["path"].replace("\\", "/"), "frames": frames, "sample_rate": msr,
            "bed_key": bed_key, "vocal_key": a.vocal_key, "vo_gain_db": vo_gain, "bed_gain_db": a.bed_gain_db,
            "bed_rms_db": round(bed_db, 2), "vocal_clip_rms_db": round(vo_db, 2), "sha256": sha256(rec["path"]),
            "mix_peak": float(np.abs(mono).max()), "mix_rms_db": round(rms_db(mono), 2),
            "length_match": abs(frames - bed_frames) <= 1}
    json.dump(info, open(a.out_info, "w", encoding="utf-8"), indent=2)
    print(f"mix {rec['filename']} frames {frames} ({frames / msr:.4f}s) length_match={info['length_match']} -> {a.out_info}")
    return 0 if info["length_match"] else 1


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("bed-check"); s.add_argument("--clock", required=True); s.add_argument("--bed", required=True); s.add_argument("--render-receipt"); s.add_argument("--out"); s.set_defaults(fn=cmd_bed_check)
    s = sub.add_parser("transcribe"); s.add_argument("--key", required=True); s.add_argument("--out", required=True); s.add_argument("--prefix", default="jam/vocal-clock/words"); s.set_defaults(fn=cmd_transcribe)
    s = sub.add_parser("plan"); s.add_argument("--clock", required=True); s.add_argument("--words", required=True); s.add_argument("--take", required=True); s.add_argument("--out", required=True); s.set_defaults(fn=cmd_plan)
    s = sub.add_parser("place"); s.add_argument("--plan", required=True); s.add_argument("--key", required=True); s.add_argument("--out-dir", required=True)
    s.add_argument("--out-info", required=True); s.add_argument("--out-graph", required=True); s.add_argument("--prefix", default="jam/vocal-clock/placed"); s.add_argument("--dry-run", action="store_true"); s.set_defaults(fn=cmd_place)
    s = sub.add_parser("verify"); s.add_argument("--clock", required=True); s.add_argument("--vocal", required=True); s.add_argument("--bed"); s.add_argument("--words"); s.add_argument("--plan"); s.add_argument("--receipt"); s.set_defaults(fn=cmd_verify)
    s = sub.add_parser("mix"); s.add_argument("--bed", required=True); s.add_argument("--vocal", required=True); s.add_argument("--vocal-key", required=True); s.add_argument("--plan", required=True)
    s.add_argument("--out-dir", required=True); s.add_argument("--out-info", required=True); s.add_argument("--prefix", default="jam/vocal-clock/mix")
    s.add_argument("--vocal-over-bed-db", type=float, default=4.0); s.add_argument("--bed-gain-db", type=float, default=-9.0); s.set_defaults(fn=cmd_mix)
    a = p.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
