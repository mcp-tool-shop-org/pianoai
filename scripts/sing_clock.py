#!/usr/bin/env python3
"""Sing a song on the clock — the whole vocal route in one command.

    E:/AI/SoulX-Singer/.venv/Scripts/python scripts/sing_clock.py \
        --clock scores/amazing-grace.score-clock.v1.json \
        --bed tmp/vocal-clock/piano-bed.wav \
        --prompt-wav E:/AI/SoulX-Singer/example/audio/en_prompt.mp3 \
        --prompt-meta E:/AI/SoulX-Singer/example/audio/en_prompt.json \
        --takes 8 --out-dir tmp/vocal-clock/sing

Build the clock (scripts/build-score-clock.mjs) and the bed
(scripts/render-piano-bed.mjs) first — they are the truth this measures
against. Then this runs: target export → N SoulX takes → verify each →
word-level pick → local placement (crossfaded joins) → verify → pitch →
mix. Every step leaves its receipt in --out-dir; the run stops at the first
FAIL and says which gate. Optional --transcribe uploads the placed stem to
Comfy Cloud for the order / one-voice checks (needs COMFY_CLOUD_API_KEY).

Run it with the SoulX venv's python: the exporter needs g2p_en and the pitch
gate needs librosa; the timing gate and placement need only numpy/scipy.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    print("+", " ".join(cmd), flush=True)
    return subprocess.run(cmd, **kw)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--clock", required=True)
    ap.add_argument("--bed", required=True)
    ap.add_argument("--prompt-wav", required=True)
    ap.add_argument("--prompt-meta", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--takes", type=int, default=8)
    ap.add_argument("--whole-words", action="store_true", help="sing multi-syllable words as one legato word (default: every syllable re-articulated so joins can fall between syllables)")
    ap.add_argument("--pitch-shift", type=int, default=0)
    ap.add_argument("--transcribe", action="store_true", help="also upload + transcribe the placed stem on Comfy Cloud (order / one-voice gates)")
    ap.add_argument("--vocal-over-bed-db", type=float, default=4.0)
    ap.add_argument("--bed-gain-db", type=float, default=-9.0)
    a = ap.parse_args()

    out = os.path.abspath(a.out_dir)
    os.makedirs(out, exist_ok=True)
    vc = os.path.join(HERE, "vocal_clock.py")
    clock = os.path.abspath(a.clock)
    bed = os.path.abspath(a.bed)

    target = os.path.join(out, "target.json")
    cmd = [PY, os.path.join(HERE, "export_soulx_target.py"), "--clock", clock, "--out", target]
    if not a.whole_words:
        cmd.append("--syllable-words")
    if run(cmd).returncode:
        return 2

    candidates = []
    for i in range(1, a.takes + 1):
        tdir = os.path.join(out, f"take-{i:02d}")
        take = os.path.join(tdir, "take-48k.wav")
        receipt = os.path.join(tdir, "verify-energy.json")
        if not os.path.exists(take):
            if run([PY, os.path.join(HERE, "soulx_take.py"), "--target", target, "--prompt-wav", a.prompt_wav, "--prompt-meta", a.prompt_meta,
                    "--out-dir", tdir, "--pitch-shift", str(a.pitch_shift)]).returncode:
                return 2
        if not os.path.exists(receipt):
            run([PY, vc, "verify", "--clock", clock, "--vocal", take, "--bed", bed, "--receipt", receipt], stdout=subprocess.DEVNULL)
        candidates.append(f"{take}={receipt}")

    plan = os.path.join(out, "plan.json")
    cmd = [PY, vc, "repin", "--clock", clock, "--out", plan]
    if not a.whole_words:
        cmd.append("--split-words")
    for c in candidates:
        cmd += ["--candidate", c]
    if run(cmd).returncode:
        print("PICK FAILED: no take sings every word tightly enough; add takes (--takes) or try --whole-words / default")
        return 1

    placed_info = os.path.join(out, "placed.json")
    if run([PY, vc, "place", "--local", "--plan", plan, "--out-dir", out, "--out-info", placed_info, "--out-graph", os.path.join(out, "graph.json")]).returncode:
        return 1
    placed = json.load(open(placed_info, encoding="utf-8"))["path"]

    words = None
    if a.transcribe:
        up = subprocess.run([PY, vc, "upload", "--path", placed], capture_output=True, text=True)
        key = next((ln.split()[1] for ln in up.stdout.splitlines() if ln.startswith("KEY ")), None)
        if key:
            words = os.path.join(out, "placed-words.json")
            run([PY, vc, "transcribe", "--key", key, "--out", words, "--prefix", "jam/vocal-clock/sing-words"])

    receipt = os.path.join(out, "receipt.json")
    cmd = [PY, vc, "verify", "--clock", clock, "--vocal", placed, "--bed", bed, "--plan", plan, "--receipt", receipt]
    if words:
        cmd += ["--words", words]
    timing = run(cmd).returncode
    pitch = run([PY, vc, "pitch", "--clock", clock, "--vocal", placed, "--verify-receipt", receipt, "--receipt", os.path.join(out, "pitch.json")]).returncode
    if timing or pitch:
        print(f"NOT A MIX: timing {'PASS' if not timing else 'FAIL'}, pitch {'PASS' if not pitch else 'FAIL'}" + ("" if words else " (order/one-voice not checked: run with --transcribe)"))
        return 1
    if run([PY, vc, "mix", "--local", "--bed", bed, "--vocal", placed, "--plan", plan, "--out-dir", out, "--out-info", os.path.join(out, "mix.json"),
            "--vocal-over-bed-db", str(a.vocal_over_bed_db), "--bed-gain-db", str(a.bed_gain_db)]).returncode:
        return 1
    print(f"MIX {os.path.join(out, 'mix-local.wav')}  vocal {placed}  receipts in {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
