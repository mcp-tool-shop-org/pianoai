#!/usr/bin/env python3
"""Render jam-actions-v1 prompts with the HF Qwen2.5-Instruct chat template.

Same construction as predict_v1.py: to_template_messages, drop the last
assistant turn (gold), apply_chat_template(..., tools=tools, tokenize=False,
add_generation_prompt=True).

    python render_hf_prompt.py --data data-probe/sft-test.jsonl --id acoustic-probe:solace:onset_in:p
    python render_hf_prompt.py --data data-probe/sft-test.jsonl --out prompts.jsonl
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
REPO = EXP.parent.parent

sys.path.insert(0, str(HERE))
import importlib.util

_spec = importlib.util.spec_from_file_location("trainer", HERE / "train_v1_sft.py")
_trainer = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_trainer)
load_tools = _trainer.load_tools
to_template_messages = _trainer.to_template_messages

DEFAULT_TOOLS = REPO / "src" / "dataset" / "tool-schemas.json"
DEFAULT_MODEL = "Qwen/Qwen2.5-7B-Instruct"


def render_one(tokenizer, tools, messages: list) -> str:
    tmpl = to_template_messages(messages)
    last_assistant = max(i for i, m in enumerate(tmpl) if m["role"] == "assistant")
    prompt_msgs = tmpl[:last_assistant]
    return tokenizer.apply_chat_template(
        prompt_msgs, tokenize=False, add_generation_prompt=True, tools=tools
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--id", action="append", dest="ids")
    ap.add_argument("--out", default=None, help="jsonl of {id, prompt, n_chars, n_tokens}")
    ap.add_argument("--tools-file", default=str(DEFAULT_TOOLS))
    ap.add_argument("--tools", choices=["full", "listen"], default="full")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    args = ap.parse_args()

    from transformers import AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    tools = load_tools(Path(args.tools_file), args.tools)
    lines = [
        json.loads(l)
        for l in Path(args.data).read_text(encoding="utf-8").splitlines()
        if l.strip()
    ]
    want = set(args.ids) if args.ids else None

    out_fh = None
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        out_fh = Path(args.out).open("w", encoding="utf-8", newline="\n")

    n = 0
    for line in lines:
        if want is not None and line["id"] not in want:
            continue
        text = render_one(tokenizer, tools, line["messages"])
        n_tok = len(tokenizer(text, add_special_tokens=False)["input_ids"])
        rec = {"id": line["id"], "prompt": text, "n_chars": len(text), "n_tokens": n_tok}
        if out_fh:
            out_fh.write(json.dumps(rec, ensure_ascii=False) + "\n")
        else:
            sys.stdout.write(text)
            if not text.endswith("\n"):
                sys.stdout.write("\n")
        n += 1
        sys.stderr.write(f"[render-hf] {line['id']} chars={len(text)} tokens={n_tok}\n")

    if out_fh:
        out_fh.close()
    if n == 0:
        sys.stderr.write("no matching ids\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
