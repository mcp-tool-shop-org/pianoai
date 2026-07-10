#!/usr/bin/env python3
"""Finetune Arc P3 — checkpoint selection on the inner-validation split ONLY.

For every seed run and every epoch checkpoint, teacher-forced per-assistant-turn
greedy generation on the 25 inner-validation records; deterministic scoring:

  per-call exact-match rate = matched / max(gold_calls_total, pred_calls_total)
    (position-wise within each turn: name + deep-equal arguments)
  schema-validity rate      = valid predicted calls / predicted calls
    (AJV-hardened: additionalProperties=false on every object node,
     mirroring src/dataset/trace-validator.ts; 1.0 when nothing predicted)

Selection rule (P0-LOCK.md §6): highest exact-match; tie -> higher
schema-validity; tie -> fewer epochs. clair-de-lune is never loaded.

    python p3_select.py --data sft-inner-val.jsonl --tools tools.json \
        --runs-dir runs --out selection-report.json
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import time
from pathlib import Path

import torch
from jsonschema import Draft7Validator
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

MAX_NEW_TOKENS = 512
GEN_BATCH = 8

TOOL_CALL_RE = re.compile(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", re.DOTALL)


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def harden(schema):
    """additionalProperties:false on every object node (trace-validator parity)."""
    if isinstance(schema, list):
        return [harden(s) for s in schema]
    if not isinstance(schema, dict):
        return schema
    out = {k: harden(v) for k, v in schema.items()}
    if out.get("type") == "object" and "additionalProperties" not in out:
        out["additionalProperties"] = False
    return out


def load_validators(tools_path: Path) -> dict[str, Draft7Validator]:
    catalog = json.loads(tools_path.read_text(encoding="utf-8"))
    return {
        t["name"]: Draft7Validator(harden(copy.deepcopy(t["inputSchema"])))
        for t in catalog["tools"]
    }


def load_tools_for_template(tools_path: Path) -> list[dict]:
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


def parse_pred_calls(text: str) -> list[dict]:
    calls = []
    for m in TOOL_CALL_RE.finditer(text):
        try:
            obj = json.loads(m.group(1))
        except json.JSONDecodeError:
            calls.append({"__unparseable__": m.group(1)[:200]})
            continue
        calls.append(obj)
    return calls


def deep_equal(a, b) -> bool:
    return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


def build_turn_tasks(lines: list[dict]) -> list[dict]:
    """One task per assistant turn: context messages + gold calls."""
    tasks = []
    for line in lines:
        msgs = line["messages"]
        for i, m in enumerate(msgs):
            if m["role"] != "assistant":
                continue
            tasks.append(
                {
                    "record_id": line["id"],
                    "turn_index": i,
                    "context": msgs[:i],
                    "gold_calls": [
                        {"name": tc["name"], "arguments": tc["arguments"]}
                        for tc in m.get("tool_calls", [])
                    ],
                }
            )
    return tasks


@torch.no_grad()
def generate_batch(model, tokenizer, prompts: list[str]) -> list[str]:
    enc = tokenizer(prompts, return_tensors="pt", padding=True, add_special_tokens=False)
    enc = {k: v.to(model.device) for k, v in enc.items()}
    out = model.generate(
        **enc,
        max_new_tokens=MAX_NEW_TOKENS,
        do_sample=False,
        temperature=None,
        top_p=None,
        top_k=None,
        pad_token_id=tokenizer.pad_token_id,
        eos_token_id=tokenizer.convert_tokens_to_ids("<|im_end|>"),
    )
    texts = []
    for i in range(len(prompts)):
        gen = out[i][enc["input_ids"].shape[1]:]
        texts.append(tokenizer.decode(gen, skip_special_tokens=False))
    return texts


def score_checkpoint(model, tokenizer, tasks, tools, validators) -> dict:
    prompts = [
        tokenizer.apply_chat_template(
            to_template_messages(t["context"]),
            tools=tools,
            tokenize=False,
            add_generation_prompt=True,
        )
        for t in tasks
    ]
    gens: list[str] = []
    for i in range(0, len(prompts), GEN_BATCH):
        gens.extend(generate_batch(model, tokenizer, prompts[i : i + GEN_BATCH]))

    gold_total = pred_total = matched = valid_pred = 0
    per_turn = []
    for task, gen in zip(tasks, gens):
        pred = parse_pred_calls(gen)
        gold = task["gold_calls"]
        gold_total += len(gold)
        pred_total += len(pred)
        turn_matched = 0
        for j, p in enumerate(pred):
            name = p.get("name")
            args = p.get("arguments")
            if (
                "__unparseable__" not in p
                and isinstance(name, str)
                and name in validators
                and isinstance(args, dict)
                and not list(validators[name].iter_errors(args))
            ):
                valid_pred += 1
            if (
                j < len(gold)
                and name == gold[j]["name"]
                and deep_equal(args, gold[j]["arguments"])
            ):
                turn_matched += 1
        matched += turn_matched
        per_turn.append(
            {
                "record_id": task["record_id"],
                "turn_index": task["turn_index"],
                "gold_calls": len(gold),
                "pred_calls": len(pred),
                "matched": turn_matched,
                "generation_head": gen[:400],
            }
        )

    exact = matched / max(gold_total, pred_total, 1)
    validity = (valid_pred / pred_total) if pred_total else 1.0
    return {
        "per_call_exact_match": round(exact, 6),
        "schema_validity": round(validity, 6),
        "gold_calls_total": gold_total,
        "pred_calls_total": pred_total,
        "matched": matched,
        "valid_pred_calls": valid_pred,
        "per_turn": per_turn,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="Qwen/Qwen2.5-7B-Instruct")
    ap.add_argument("--data", required=True)
    ap.add_argument("--tools", required=True)
    ap.add_argument("--runs-dir", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    data_path, tools_path = Path(args.data), Path(args.tools)
    runs_dir, out_path = Path(args.runs_dir), Path(args.out)

    lines = [json.loads(l) for l in data_path.read_text(encoding="utf-8").splitlines() if l]
    assert all(l["song_id"] != "clair-de-lune" for l in lines), "test-song leak"
    songs = sorted({l["song_id"] for l in lines})
    assert songs == ["chopin-prelude-e-minor", "fur-elise"], f"unexpected inner-val songs {songs}"

    tasks = build_turn_tasks(lines)
    validators = load_validators(tools_path)
    tools = load_tools_for_template(tools_path)
    print(f"[p3] {len(lines)} records -> {len(tasks)} assistant-turn tasks")

    tokenizer = AutoTokenizer.from_pretrained(args.model, padding_side="left")
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    try:
        base = AutoModelForCausalLM.from_pretrained(
            args.model, dtype=torch.bfloat16, device_map="cuda"
        )
    except TypeError:
        base = AutoModelForCausalLM.from_pretrained(
            args.model, torch_dtype=torch.bfloat16, device_map="cuda"
        )
    base.eval()

    results: dict[str, dict] = {}
    for seed_dir in sorted(runs_dir.glob("seed*")):
        ckpts = sorted(
            seed_dir.glob("epoch*"), key=lambda p: int(p.name.replace("epoch", ""))
        )
        if not ckpts:
            continue
        results[seed_dir.name] = {"checkpoints": {}}
        for ckpt in ckpts:
            t0 = time.time()
            model = PeftModel.from_pretrained(base, str(ckpt))
            model.eval()
            score = score_checkpoint(model, tokenizer, tasks, tools, validators)
            base_back = model.unload()
            assert base_back is base or base_back is not None
            del model
            torch.cuda.empty_cache()
            score["wall_time_s"] = round(time.time() - t0, 1)
            results[seed_dir.name]["checkpoints"][ckpt.name] = score
            print(
                f"[p3] {seed_dir.name}/{ckpt.name}: exact={score['per_call_exact_match']:.3f} "
                f"validity={score['schema_validity']:.3f} ({score['wall_time_s']}s)"
            )
        # Selection rule: exact desc, validity desc, epochs asc.
        def sel_key(item):
            name, s = item
            return (
                -s["per_call_exact_match"],
                -s["schema_validity"],
                int(name.replace("epoch", "")),
            )
        winner = sorted(results[seed_dir.name]["checkpoints"].items(), key=sel_key)[0]
        results[seed_dir.name]["selected"] = winner[0]
        print(f"[p3] {seed_dir.name} SELECTED {winner[0]}")

    report = {
        "schema": "finetune-arc-p3-selection/1.0.0",
        "phase": "P3",
        "selection_rule": "max per_call_exact_match; tie -> max schema_validity; tie -> fewer epochs",
        "inner_val": {
            "data": str(data_path),
            "data_sha256": sha256_file(data_path),
            "records": len(lines),
            "songs": songs,
            "assistant_turn_tasks": len(tasks),
        },
        "tools_sha256": sha256_file(tools_path),
        "decoding": {"strategy": "greedy", "max_new_tokens": MAX_NEW_TOKENS},
        "clair_de_lune_touched": False,
        "results": results,
    }
    out_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"[p3] report -> {out_path}")


if __name__ == "__main__":
    main()
