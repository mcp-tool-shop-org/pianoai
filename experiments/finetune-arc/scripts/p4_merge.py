#!/usr/bin/env python3
"""Finetune Arc P4a — merge a selected LoRA adapter into bf16 full weights.

    python p4_merge.py --adapter runs/seed13/epoch8 --out merged/seed13
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="Qwen/Qwen2.5-7B-Instruct")
    ap.add_argument("--adapter", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    base = AutoModelForCausalLM.from_pretrained(args.model, torch_dtype=torch.bfloat16)
    model = PeftModel.from_pretrained(base, args.adapter)
    merged = model.merge_and_unload()
    merged.save_pretrained(str(out), safe_serialization=True)
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    tokenizer.save_pretrained(str(out))

    (out / "merge-receipt.json").write_text(
        json.dumps(
            {
                "schema": "finetune-arc-p4-merge/1.0.0",
                "base": args.model,
                "adapter": args.adapter,
                "dtype": "bfloat16",
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"[p4] merged -> {out}")


if __name__ == "__main__":
    main()
