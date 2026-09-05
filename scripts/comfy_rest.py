#!/usr/bin/env python3
"""Minimal Comfy Cloud REST client: upload, submit, poll, download.

Lifted from scripts/comfy-run-seed-hymn.py (proven on this rig 2026-09-04)
so the vocal placement instrument can submit fx-dub's graph builders without
retyping the transport. Auth: COMFY_CLOUD_API_KEY or COMFY_CLOUD_API_KEY_FILE.
The key is never printed. Partner nodes also need extra_data.api_key_comfy_org.

Nothing here builds graphs; building is free and testable, spending is the
caller's decision (fx-dub tools/vo_graphs.py docstring).
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = "https://cloud.comfy.org"


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


def req(method, path, key, *, headers=None, data=None, follow=True, timeout=120):
    url = path if path.startswith("http") else BASE + path
    h = {"X-API-Key": key}
    if headers:
        h.update(headers)
    r = urllib.request.Request(url, data=data, headers=h, method=method)
    opener = urllib.request.build_opener() if follow else urllib.request.build_opener(_NoRedirect)
    try:
        with opener.open(r, timeout=timeout) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def upload_file(path: str, key: str, content_type: str = "audio/wav") -> str:
    """Upload a local file as a cloud INPUT; returns the name LoadAudio accepts."""
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
                f"filename=\"{fname}\"\r\nContent-Type: {content_type}\r\n\r\n"
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
        timeout=600,
    )
    if status != 200:
        raise SystemExit(f"upload HTTP {status}: {raw[:400]!r}")
    name = json.loads(raw)["name"]
    print(f"uploaded {fname} ({len(blob)} bytes) as {name}", flush=True)
    return name


def submit(graph: dict, key: str) -> str:
    payload = json.dumps({"prompt": graph, "extra_data": {"api_key_comfy_org": key}}).encode()
    status, _, raw = req(
        "POST", "/api/prompt", key, headers={"Content-Type": "application/json"}, data=payload
    )
    try:
        out = json.loads(raw)
    except json.JSONDecodeError:
        raise SystemExit(f"submit HTTP {status}: {raw[:800]!r}")
    if status != 200:
        raise SystemExit(f"submit HTTP {status}: {raw[:1200]!r}")
    if out.get("node_errors"):
        raise SystemExit("node_errors:\n" + json.dumps(out["node_errors"], indent=2)[:3000])
    pid = out.get("prompt_id")
    if not pid:
        raise SystemExit(f"no prompt_id: {out}")
    print(f"job {pid}", flush=True)
    return pid


def poll(pid: str, key: str, timeout: float = 900) -> dict:
    t0 = time.time()
    last = None
    done = {"success", "completed"}
    fail = {"failed", "cancelled", "error", "timeout", "non_retryable_error", "lost"}
    while True:
        _, _, raw = req("GET", f"/api/job/{pid}/status", key)
        j = json.loads(raw)
        st = j.get("status")
        if st != last:
            print(f"  [{int(time.time() - t0)}s] {st}", flush=True)
            last = st
        if st in done:
            return j
        if st in fail or j.get("error_message"):
            _, _, detail = req("GET", f"/api/jobs/{pid}", key)
            raise SystemExit(f"job {st}: {j.get('error_message')!r}\n{detail[:2000]!r}")
        if time.time() - t0 > timeout:
            raise SystemExit(f"timeout last={st}")
        time.sleep(4)


def job_outputs(pid: str, key: str) -> list[dict]:
    """Every file the job produced: {node, bucket, filename, subfolder, type}."""
    _, _, raw = req("GET", f"/api/jobs/{pid}", key)
    job = json.loads(raw)
    outputs = job.get("outputs") or job.get("output") or {}
    if not outputs and isinstance(job.get("data"), dict):
        outputs = job["data"].get("outputs") or {}
    found = []
    for node_id, node_out in (outputs.items() if isinstance(outputs, dict) else []):
        if not isinstance(node_out, dict):
            continue
        for bucket, items in node_out.items():
            if not isinstance(items, list):
                continue
            for info in items:
                if isinstance(info, dict) and info.get("filename"):
                    found.append({
                        "node": node_id,
                        "bucket": bucket,
                        "filename": info["filename"],
                        "subfolder": info.get("subfolder") or "",
                        "type": info.get("type") or "output",
                    })
    if not found:
        raise SystemExit("job has no file outputs: " + json.dumps(job)[:1500])
    return found


def download(info: dict, key: str, dest_path: str) -> str:
    q = urllib.parse.urlencode(
        {"filename": info["filename"], "subfolder": info["subfolder"], "type": info["type"]}
    )
    st, hdrs, body = req("GET", f"/api/view?{q}", key, follow=False)
    if st in (301, 302, 303, 307, 308):
        loc = hdrs.get("Location") or hdrs.get("location")
        st2, _, body = req("GET", loc, key, timeout=600)
        if st2 != 200:
            raise SystemExit(f"download follow HTTP {st2} for {info['filename']}")
    elif st != 200:
        raise SystemExit(f"view HTTP {st} for {info['filename']}: {body[:300]!r}")
    os.makedirs(os.path.dirname(dest_path) or ".", exist_ok=True)
    with open(dest_path, "wb") as fh:
        fh.write(body)
    print(f"saved {dest_path} ({len(body)} bytes)", flush=True)
    return dest_path


def run_graph(graph: dict, key: str, dest_dir: str, want_ext: tuple[str, ...] = ()) -> list[dict]:
    """Submit, wait, download every output into dest_dir. Returns output records
    with a local ``path`` added. Storage key of an audio output = its filename."""
    pid = submit(graph, key)
    poll(pid, key)
    records = []
    for info in job_outputs(pid, key):
        if want_ext and not info["filename"].lower().endswith(want_ext):
            continue
        path = download(info, key, os.path.join(dest_dir, info["filename"]))
        records.append({**info, "path": path, "job": pid})
    if not records:
        raise SystemExit(f"job {pid} produced no {want_ext or 'file'} outputs")
    return records
