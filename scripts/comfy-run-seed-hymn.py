#!/usr/bin/env python3
"""Submit: Kokoro lock.wav → ByteDance Seed Audio with jam-sessions timestamps.

Auth: COMFY_CLOUD_API_KEY or COMFY_CLOUD_API_KEY_FILE. Never printed.
Partner nodes need extra_data.api_key_comfy_org (same key).
"""
from __future__ import annotations

import json
import os
import sys
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://cloud.comfy.org"
LOCK = os.path.join("tmp", "kokoro-lock", "lock.wav")
OUT_DIR = os.path.join("tmp", "kokoro-lock")

PROMPT = """One female singer, same person as @Audio1 the entire take. Warm hymn, a cappella, no choir, no extra words, no second speaker.
[2.13s:10.20s] Amazing grace
[10.20s:21.40s] how sweet the sound
[21.40s:35.00s] that saved a wretch like me
"""


def api_key() -> str:
    k = os.environ.get("COMFY_CLOUD_API_KEY", "").strip()
    if k:
        return k
    path = os.environ.get("COMFY_CLOUD_API_KEY_FILE", "").strip()
    if not path:
        sys.exit("Set COMFY_CLOUD_API_KEY or COMFY_CLOUD_API_KEY_FILE")
    with open(path, encoding="utf-8") as fh:
        k = fh.read().strip()
    if not k:
        sys.exit("API key file is empty")
    return k


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


def req(method, path, key, *, headers=None, data=None, follow=True):
    url = path if path.startswith("http") else BASE + path
    h = {"X-API-Key": key}
    if headers:
        h.update(headers)
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(r, timeout=120) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def upload_wav(path, key) -> str:
    with open(path, "rb") as fh:
        blob = fh.read()
    boundary = "----jam" + uuid.uuid4().hex
    fname = os.path.basename(path)

    def field(name, value):
        return (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n"
        ).encode()

    body = b"".join(
        [
            (
                f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; "
                f"filename=\"{fname}\"\r\nContent-Type: audio/wav\r\n\r\n"
            ).encode(),
            blob,
            b"\r\n",
            field("type", "input"),
            field("overwrite", "true"),
            f"--{boundary}--\r\n".encode(),
        ]
    )
    status, _, raw = req(
        "POST",
        "/api/upload/image",
        key,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        data=body,
    )
    if status != 200:
        raise SystemExit(f"upload HTTP {status}: {raw[:400]!r}")
    name = json.loads(raw)["name"]
    print(f"uploaded as {name}", flush=True)
    return name


def graph(storage_name: str) -> dict:
    return {
        "1": {"class_type": "LoadAudio", "inputs": {"audio": storage_name}},
        "2": {
            "class_type": "ByteDanceSeedAudio",
            "inputs": {
                "text_prompt": PROMPT.strip(),
                "reference_mode": "audio reference",
                "reference_mode.reference_audio_1": ["1", 0],
                "sample_rate": "48000",
                "speech_rate": 0,
                "loudness_rate": 0,
                "pitch_rate": 0,
                "seed": 42,
                "model": "seed-audio-1.0-multilingual",
            },
        },
        "3": {
            "class_type": "SaveAudioAdvanced",
            "inputs": {
                "audio": ["2", 0],
                "filename_prefix": "jam/amazing-grace-seed",
                "format": "flac",
            },
        },
    }


def submit(g, key) -> str:
    payload = json.dumps({"prompt": g, "extra_data": {"api_key_comfy_org": key}}).encode()
    status, _, raw = req(
        "POST", "/api/prompt", key, headers={"Content-Type": "application/json"}, data=payload
    )
    out = json.loads(raw)
    if status != 200:
        raise SystemExit(f"submit HTTP {status}: {raw[:800]!r}")
    if out.get("node_errors"):
        raise SystemExit("node_errors:\n" + json.dumps(out["node_errors"], indent=2)[:2000])
    pid = out.get("prompt_id")
    if not pid:
        raise SystemExit(f"no prompt_id: {out}")
    print(f"job {pid}", flush=True)
    return pid


def poll(pid, key, timeout=600):
    t0 = time.time()
    last = None
    done = {"success", "completed"}
    fail = {"failed", "cancelled", "error", "timeout", "non_retryable_error", "lost"}
    while True:
        _, _, raw = req("GET", f"/api/job/{pid}/status", key)
        j = json.loads(raw)
        st = j.get("status")
        if st != last:
            print(f"  [{int(time.time()-t0)}s] {st}", flush=True)
            last = st
        if st in done:
            return
        if st in fail or j.get("error_message"):
            _, _, detail = req("GET", f"/api/jobs/{pid}", key)
            raise SystemExit(f"job {st}: {j.get('error_message')!r}\n{detail[:1500]!r}")
        if time.time() - t0 > timeout:
            raise SystemExit(f"timeout last={st}")
        time.sleep(4)


def download(pid, key, dest_dir):
    _, _, raw = req("GET", f"/api/jobs/{pid}", key)
    job = json.loads(raw)
    outputs = job.get("outputs") or job.get("output") or {}
    # also look under execution
    if not outputs and isinstance(job.get("data"), dict):
        outputs = job["data"].get("outputs") or {}
    saved = []
    nodes = outputs if isinstance(outputs, dict) else {}
    for node_out in nodes.values():
        if not isinstance(node_out, dict):
            continue
        for bucket in ("audio", "images", "gifs"):
            for info in node_out.get(bucket) or []:
                fn = info.get("filename")
                if not fn:
                    continue
                q = urllib.parse.urlencode(
                    {
                        "filename": fn,
                        "subfolder": info.get("subfolder") or "",
                        "type": info.get("type") or "output",
                    }
                )
                st, hdrs, body = req("GET", f"/api/view?{q}", key, follow=False)
                if st in (301, 302, 303, 307, 308):
                    loc = hdrs.get("Location") or hdrs.get("location")
                    st2, _, body = req("GET", loc, key)
                    if st2 != 200:
                        print(f"download follow HTTP {st2}", flush=True)
                        continue
                elif st != 200:
                    print(f"view HTTP {st} {fn}", flush=True)
                    continue
                path = os.path.join(dest_dir, fn)
                with open(path, "wb") as fh:
                    fh.write(body)
                saved.append(path)
                print(f"saved {path} ({len(body)} bytes)", flush=True)
    if not saved:
        dump = os.path.join(dest_dir, "job.json")
        with open(dump, "w", encoding="utf-8") as fh:
            json.dump(job, fh, indent=2)
        raise SystemExit(f"no audio in job outputs; wrote {dump}")
    return saved


def main():
    os.chdir(os.path.join(os.path.dirname(__file__), ".."))
    key = api_key()
    if not os.path.isfile(LOCK):
        sys.exit(f"missing {LOCK}")
    name = upload_wav(LOCK, key)
    g = graph(name)
    pid = submit(g, key)
    poll(pid, key)
    files = download(pid, key, OUT_DIR)
    print("DONE " + " ".join(files), flush=True)


if __name__ == "__main__":
    main()
