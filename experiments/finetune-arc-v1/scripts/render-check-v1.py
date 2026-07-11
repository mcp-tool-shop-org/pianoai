#!/usr/bin/env python3
"""Finetune Arc v1 — G7 render fail-fast (local half; P0-LOCK §6).

Renders EVERY example in the v1 train + val files through the pinned model's
chat template with its own per-line catalog and asserts token length <=
MAX_SEQ_LEN. Tokenizer only — no torch, no GPU. The same assertion re-runs
on-pod inside train_finetune_arc_v1.py before any gradient step (v0 A1
pattern); this local half runs BEFORE the priced ask so a render surprise
can never cost pod time.

    python render-check-v1.py --data-dir experiments/finetune-arc-v1/data
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from transformers import AutoTokenizer

MAX_SEQ_LEN = 12288
MODEL = "Qwen/Qwen2.5-7B-Instruct"


def load_tools(tools_path: Path) -> list[dict]:
    catalog = json.loads(tools_path.read_text(encoding="utf-8"))
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t["inputSchema"],
            },
        }
        for t in catalog["tools"]
    ]


def to_template_messages(messages: list[dict]) -> list[dict]:
    out = []
    for m in messages:
        if m["role"] == "assistant" and m.get("tool_calls"):
            out.append(
                {
                    "role": "assistant",
                    "content": m.get("content", ""),
                    "tool_calls": [
                        {
                            "type": "function",
                            "function": {"name": tc["name"], "arguments": tc["arguments"]},
                        }
                        for tc in m["tool_calls"]
                    ],
                }
            )
        elif m["role"] == "tool":
            out.append({"role": "tool", "name": m.get("name"), "content": m["content"]})
        else:
            out.append({"role": m["role"], "content": m["content"]})
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    args = ap.parse_args()
    data_dir = Path(args.data_dir)

    tokenizer = AutoTokenizer.from_pretrained(MODEL)
    tools_by_key = {
        "mcp41": load_tools(data_dir / "tools-mcp41.json"),
        "inspector9": load_tools(data_dir / "tools-inspector9.json"),
        "none": None,
    }

    files = ["sft-train-v1.jsonl", "sft-val-jam.jsonl", "sft-val-grounding.jsonl"]
    grand_max = 0
    grand_max_id = ""
    per_component: dict[str, dict[str, int]] = {}
    for fname in files:
        lines = [
            json.loads(l)
            for l in (data_dir / fname).read_text(encoding="utf-8").splitlines()
            if l
        ]
        fmax = 0
        for line in lines:
            key = line.get("tools_key")
            tools = tools_by_key[key]
            kwargs = {"tools": tools} if tools is not None else {}
            text = tokenizer.apply_chat_template(
                to_template_messages(line["messages"]), tokenize=False, **kwargs
            )
            n = len(tokenizer(text, add_special_tokens=False)["input_ids"])
            comp = line.get("component", "?")
            stats = per_component.setdefault(comp, {"max": 0, "sum": 0, "n": 0})
            stats["max"] = max(stats["max"], n)
            stats["sum"] += n
            stats["n"] += 1
            if n > fmax:
                fmax = n
            if n > grand_max:
                grand_max, grand_max_id = n, line["id"]
            assert n <= MAX_SEQ_LEN, f"G7 FAIL: {line['id']} renders to {n} > {MAX_SEQ_LEN}"
        print(f"[g7] {fname}: {len(lines)} lines, max {fmax} tokens")

    print(f"[g7] PASS — grand max {grand_max} tokens ({grand_max_id}) <= {MAX_SEQ_LEN}")
    for comp, s in sorted(per_component.items()):
        print(f"[g7]   {comp}: n={s['n']} max={s['max']} mean={s['sum'] // s['n']}")
    total_tokens = sum(s["sum"] for s in per_component.values())
    print(f"[g7] total corpus tokens (train+val): {total_tokens}")


if __name__ == "__main__":
    main()
