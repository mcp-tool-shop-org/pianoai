#!/usr/bin/env python3
"""Predictions on the jam-actions-v1 held-out split. Base model and adapter alike.

Runs ON THE POD. Writes `{"id", "family", "answer", "raw"}` per line.

Different from the acoustic-sft predictor in one way that matters: v1 answers
are not a nine-item closed vocabulary. They are a chord name, a measure count, a
key, `verified`/`rejected`, an instrument id, a teaching note. So there is no
vocabulary to match against and scoring is exact match on the gold string, after
a normalisation that is written down below and applied identically to every
condition.

The fair-prompt baseline is not optional and is not a flag here: `--adapter`
absent IS the base condition, run through the same prompt construction, the same
tool catalog and the same normaliser as the adapter. A base run built any other
way measures the prompt.

    python predict_v1.py --out preds-base.jsonl
    python predict_v1.py --adapter runs/seed13/epoch3 --out preds-lora.jsonl
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

# Imported from the trainer so rendering cannot drift between train and
# inference. If they differ, every number afterwards measures the difference.
import importlib.util

_spec = importlib.util.spec_from_file_location("trainer", HERE / "train_v1_sft.py")
_trainer = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_trainer)

load_tools = _trainer.load_tools
to_template_messages = _trainer.to_template_messages


def normalise(s: str) -> str:
    """The one normaliser, applied to gold and prediction alike.

    Deliberately shallow. Case, surrounding whitespace, wrapping quotes and a
    trailing full stop are formatting; anything else is a different answer.
    Loosening this further is how a scorer starts flattering the model.
    """
    s = s.strip().strip('"').strip("'").strip()
    s = re.sub(r"\s+", " ", s)
    return s.rstrip(".").casefold()


def first_line(text: str) -> str:
    """The answer is the model's first non-empty line.

    Both conditions are told to answer with the value alone. A model that then
    writes a paragraph has not followed the format, and taking its first line is
    the most generous reading that does not go hunting for the gold string
    inside prose -- which would score the grader's search, not the model.
    """
    for line in text.strip().splitlines():
        if line.strip():
            return line.strip()
    return ""


def extract_answer(text: str) -> str:
    """Label after the final colon, else the first line.

    Acoustic comparison lines are `cents …: pitch_fail`. Other families have
    no colon. Same extraction for base and adapter.
    """
    line = first_line(text)
    if ":" in line:
        tail = line.rsplit(":", 1)[-1].strip()
        if tail:
            return tail
    return line


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=str(EXP / "lora-config.json"))
    ap.add_argument("--data", default=str(EXP / "data" / "sft-test.jsonl"))
    ap.add_argument("--records", default=str(EXP / "records-test.jsonl"))
    ap.add_argument("--tools-file", default=str(EXP / "tool-schemas.json"))
    ap.add_argument("--tools", choices=["full", "listen"], default="full")
    ap.add_argument("--adapter", default=None, help="LoRA dir; omit for the base model")
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-new-tokens", type=int, default=48)
    args = ap.parse_args()

    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer

    cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))
    model_name = cfg["base_model"]

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tools = load_tools(Path(args.tools_file), args.tools)

    try:
        model = AutoModelForCausalLM.from_pretrained(
            model_name, dtype=torch.bfloat16, device_map="cuda"
        )
    except TypeError:
        model = AutoModelForCausalLM.from_pretrained(
            model_name, torch_dtype=torch.bfloat16, device_map="cuda"
        )

    which = "base"
    if args.adapter:
        from peft import PeftModel

        model = PeftModel.from_pretrained(model, args.adapter)
        which = args.adapter
    model.eval()

    lines = [
        json.loads(l)
        for l in Path(args.data).read_text(encoding="utf-8").splitlines()
        if l.strip()
    ]
    print(f"[predict] {which} | {len(lines)} held-out | {len(tools)} tools", flush=True)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8", newline="\n") as fh:
        for i, line in enumerate(lines, 1):
            tmpl = to_template_messages(line["messages"])
            last_assistant = max(
                idx for idx, m in enumerate(tmpl) if m["role"] == "assistant"
            )
            prompt_msgs = tmpl[:last_assistant]
            text = tokenizer.apply_chat_template(
                prompt_msgs, tokenize=False, add_generation_prompt=True, tools=tools
            )
            enc = tokenizer(text, return_tensors="pt", add_special_tokens=False).to(model.device)
            with torch.no_grad():
                gen = model.generate(
                    **enc,
                    max_new_tokens=args.max_new_tokens,
                    do_sample=False,
                    pad_token_id=tokenizer.pad_token_id,
                )
            completion = tokenizer.decode(
                gen[0][enc["input_ids"].shape[1]:], skip_special_tokens=True
            )
            fh.write(json.dumps({
                "id": line["id"],
                "family": line["kind"],
                "answer": extract_answer(completion),
                # The full completion, always. Without it there is no telling
                # "the model was wrong" from "the grader could not read it", and
                # those support opposite conclusions. That distinction inverted
                # a result once already on this arc.
                "raw": completion.strip()[:600],
            }) + "\n")
            if i % 20 == 0:
                print(f"  {i}/{len(lines)}", flush=True)

    print(f"[predict] wrote {out_path}", flush=True)


if __name__ == "__main__":
    main()
