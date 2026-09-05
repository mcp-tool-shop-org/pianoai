#!/usr/bin/env python3
"""Render one SoulX-Singer take from a score-clock target, on the local GPU.

    E:/AI/SoulX-Singer/.venv/Scripts/python scripts/soulx_take.py \
        --target tmp/vocal-clock/soulx/target.json \
        --prompt-wav E:/AI/SoulX-Singer/example/audio/en_prompt.mp3 \
        --prompt-meta E:/AI/SoulX-Singer/example/audio/en_prompt.json \
        --out-dir tmp/vocal-clock/soulx/take-01

Runs `python -m cli.inference` from the SoulX-Singer checkout (SOULX_ROOT env
overrides E:/AI/SoulX-Singer) in score mode with NO auto_shift, so the
pitches are the score's, then resamples the 24 kHz output to the clock's
48 kHz (polyphase, 2:1, zero-phase) and writes a receipt. The 24 kHz original
is kept next to it. Timing of the result is judged by vocal_clock.py verify,
pitch by vocal_clock.py pitch — this script only renders.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import sys
import time

SOULX_ROOT = os.environ.get("SOULX_ROOT", "E:/AI/SoulX-Singer")


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--target", required=True)
    ap.add_argument("--prompt-wav", required=True)
    ap.add_argument("--prompt-meta", required=True)
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--model", default=os.path.join(SOULX_ROOT, "pretrained_models", "SoulX-Singer", "model.pt"))
    ap.add_argument("--config", default=os.path.join(SOULX_ROOT, "soulxsinger", "config", "soulxsinger.yaml"))
    ap.add_argument("--control", default="score", choices=["score", "melody"])
    ap.add_argument("--pitch-shift", type=int, default=0)
    ap.add_argument("--auto-shift", action="store_true", help="let the model transpose toward the prompt's range (breaks the pitch gate)")
    ap.add_argument("--no-fp16", action="store_true")
    ap.add_argument("--sample-rate", type=int, default=48000)
    a = ap.parse_args()

    out_dir = os.path.abspath(a.out_dir)
    os.makedirs(out_dir, exist_ok=True)
    cmd = [sys.executable, "-m", "cli.inference",
           "--device", "cuda", "--model_path", os.path.abspath(a.model), "--config", os.path.abspath(a.config),
           "--prompt_wav_path", os.path.abspath(a.prompt_wav), "--prompt_metadata_path", os.path.abspath(a.prompt_meta),
           "--target_metadata_path", os.path.abspath(a.target),
           "--phoneset_path", os.path.join(SOULX_ROOT, "soulxsinger", "utils", "phoneme", "phone_set.json"),
           "--save_dir", out_dir, "--pitch_shift", str(a.pitch_shift), "--control", a.control]
    if a.auto_shift:
        cmd.append("--auto_shift")
    if not a.no_fp16:
        cmd.append("--fp16")
    env = dict(os.environ, PYTHONPATH=SOULX_ROOT + os.pathsep + os.environ.get("PYTHONPATH", ""), PYTHONIOENCODING="utf-8")
    t0 = time.time()
    print("+", " ".join(cmd), flush=True)
    proc = subprocess.run(cmd, cwd=SOULX_ROOT, env=env)
    if proc.returncode != 0:
        raise SystemExit(f"cli.inference exited {proc.returncode}")
    elapsed = time.time() - t0
    src = os.path.join(out_dir, "generated.wav")
    if not os.path.isfile(src):
        raise SystemExit(f"no generated.wav in {out_dir}")

    import numpy as np
    import soundfile as sf
    from scipy.signal import resample_poly
    y, sr = sf.read(src, always_2d=True, dtype="float64")
    if sr != a.sample_rate:
        from math import gcd
        g = gcd(a.sample_rate, sr)
        y = resample_poly(y, a.sample_rate // g, sr // g, axis=0)
    stereo = np.repeat(y, 2, axis=1) if y.shape[1] == 1 else y
    out = os.path.join(out_dir, "take-48k.wav")
    sf.write(out, stereo, a.sample_rate, subtype="PCM_16")
    peak = float(np.abs(stereo).max())
    receipt = {"generated_24k": src.replace("\\", "/"), "generated_sha256": sha256(src), "generated_sr": sr, "generated_frames": int(y.shape[0]),
               "take": out.replace("\\", "/"), "take_sha256": sha256(out), "take_sr": a.sample_rate, "take_frames": int(stereo.shape[0]),
               "peak": peak, "seconds": stereo.shape[0] / a.sample_rate, "elapsed_s": round(elapsed, 1),
               "target": os.path.abspath(a.target).replace("\\", "/"), "target_sha256": sha256(a.target),
               "prompt_wav": os.path.abspath(a.prompt_wav).replace("\\", "/"), "prompt_meta": os.path.abspath(a.prompt_meta).replace("\\", "/"),
               "model": os.path.abspath(a.model).replace("\\", "/"), "model_sha256": sha256(a.model),
               "control": a.control, "pitch_shift": a.pitch_shift, "auto_shift": a.auto_shift, "fp16": not a.no_fp16, "cmd": cmd}
    json.dump(receipt, open(os.path.join(out_dir, "take.receipt.json"), "w", encoding="utf-8"), indent=2)
    print(f"take {out} {stereo.shape[0]} frames ({stereo.shape[0] / a.sample_rate:.3f}s) peak {peak:.3f} in {elapsed:.0f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
