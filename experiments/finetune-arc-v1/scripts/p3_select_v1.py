#!/usr/bin/env python3
"""Finetune Arc v1 P3 — composite checkpoint selection on the inner splits ONLY.

P0-LOCK.md §8. Two validation pools, both teacher-forced greedy:
  jam pool (25 records, byte-identical to v0's inner split, 41-tool catalog):
    jam_exact + jam_validity — v0's metrics, unchanged machinery.
  grounding pool (50 sessions from the SAME held-out songs, inspector catalog):
    g_call — call-turns: >=1 <tool_call> emitted AND all emitted calls
             schema-valid against the inspector catalog (name match to gold
             NOT required — score the answer, not the path; finding 38)
    g_ans  — answer-turns (context includes the gold tool result): the
             containment matcher (det-util.ts spec, ported verbatim below).

Selection rule (preregistered): max (jam_exact + (g_call+g_ans)/2) / 2;
tie -> max jam_validity; tie -> fewer epochs. clair-de-lune never loaded.

    python p3_select_v1.py --jam-data sft-val-jam.jsonl \
        --grounding-data sft-val-grounding.jsonl \
        --tools-mcp41 tools-mcp41.json --tools-inspector9 tools-inspector9.json \
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


# ─── Containment matcher — Python port of det-util.ts answerContains ─────────

def answer_contains(answer_text: str, gold: dict) -> bool:
    kind, value = gold["kind"], gold["value"]
    text = answer_text.lower()
    if kind == "number":
        pattern = rf"(?<![\d.]){re.escape(str(value))}(?!\.?\d)"
        return re.search(pattern, answer_text) is not None
    if kind == "note":
        esc = re.escape(str(value))
        return re.search(rf"\b{esc}(?![0-9#])", answer_text, re.IGNORECASE) is not None
    if kind == "hand":
        return ("right" if value == "right" else "left") in text
    if kind == "yesno":
        m = re.search(r"\b(yes|no|actually,?\s*no)\b", text)
        if not m:
            return False
        said_no = "no" in m.group(1)
        return (not said_no) if value else said_no
    return False


# ─── Task builders ────────────────────────────────────────────────────────────

def build_jam_tasks(lines: list[dict]) -> list[dict]:
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


def build_grounding_tasks(lines: list[dict]) -> tuple[list[dict], list[dict]]:
    call_tasks, ans_tasks = [], []
    for line in lines:
        msgs = line["messages"]
        answer_indices = {v["answerMsgIndex"]: v for v in line.get("verify", [])}
        for i, m in enumerate(msgs):
            if m["role"] != "assistant":
                continue
            if m.get("tool_calls"):
                call_tasks.append(
                    {"record_id": line["id"], "turn_index": i, "context": msgs[:i]}
                )
            elif i in answer_indices:
                ans_tasks.append(
                    {
                        "record_id": line["id"],
                        "turn_index": i,
                        "context": msgs[:i],
                        "golds": answer_indices[i]["golds"],
                    }
                )
    return call_tasks, ans_tasks


# ─── Generation ───────────────────────────────────────────────────────────────

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


def render_prompts(tokenizer, tasks, tools) -> list[str]:
    return [
        tokenizer.apply_chat_template(
            to_template_messages(t["context"]),
            tools=tools,
            tokenize=False,
            add_generation_prompt=True,
        )
        for t in tasks
    ]


def gen_all(model, tokenizer, prompts: list[str]) -> list[str]:
    gens: list[str] = []
    for i in range(0, len(prompts), GEN_BATCH):
        gens.extend(generate_batch(model, tokenizer, prompts[i : i + GEN_BATCH]))
    return gens


# ─── Scoring ──────────────────────────────────────────────────────────────────

def score_jam(model, tokenizer, tasks, tools, validators) -> dict:
    gens = gen_all(model, tokenizer, render_prompts(tokenizer, tasks, tools))
    gold_total = pred_total = matched = valid_pred = 0
    for task, gen in zip(tasks, gens):
        pred = parse_pred_calls(gen)
        gold = task["gold_calls"]
        gold_total += len(gold)
        pred_total += len(pred)
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
            if j < len(gold) and name == gold[j]["name"] and deep_equal(args, gold[j]["arguments"]):
                matched += 1
    exact = matched / max(gold_total, pred_total, 1)
    validity = (valid_pred / pred_total) if pred_total else 1.0
    return {
        "per_call_exact_match": round(exact, 6),
        "schema_validity": round(validity, 6),
        "gold_calls_total": gold_total,
        "pred_calls_total": pred_total,
        "matched": matched,
        "valid_pred_calls": valid_pred,
    }


def score_grounding(model, tokenizer, call_tasks, ans_tasks, tools, validators) -> dict:
    call_gens = gen_all(model, tokenizer, render_prompts(tokenizer, call_tasks, tools))
    ans_gens = gen_all(model, tokenizer, render_prompts(tokenizer, ans_tasks, tools))

    call_pass = 0
    for task, gen in zip(call_tasks, call_gens):
        pred = parse_pred_calls(gen)
        if not pred:
            continue
        ok = True
        for p in pred:
            name = p.get("name")
            args = p.get("arguments")
            if (
                "__unparseable__" in p
                or not isinstance(name, str)
                or name not in validators
                or not isinstance(args, dict)
                or list(validators[name].iter_errors(args))
            ):
                ok = False
                break
        if ok:
            call_pass += 1

    ans_pass = 0
    for task, gen in zip(ans_tasks, ans_gens):
        # Strip any tool-call blocks and template specials before matching.
        visible = TOOL_CALL_RE.sub("", gen).replace("<|im_end|>", "").strip()
        if all(answer_contains(visible, g) for g in task["golds"]):
            ans_pass += 1

    g_call = call_pass / len(call_tasks) if call_tasks else 1.0
    g_ans = ans_pass / len(ans_tasks) if ans_tasks else 1.0
    return {
        "g_call": round(g_call, 6),
        "g_ans": round(g_ans, 6),
        "grounding_score": round((g_call + g_ans) / 2, 6),
        "call_tasks": len(call_tasks),
        "call_pass": call_pass,
        "ans_tasks": len(ans_tasks),
        "ans_pass": ans_pass,
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="Qwen/Qwen2.5-7B-Instruct")
    ap.add_argument("--jam-data", required=True)
    ap.add_argument("--grounding-data", required=True)
    ap.add_argument("--tools-mcp41", required=True)
    ap.add_argument("--tools-inspector9", required=True)
    ap.add_argument("--runs-dir", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    jam_path, ground_path = Path(args.jam_data), Path(args.grounding_data)
    tools41_path, tools9_path = Path(args.tools_mcp41), Path(args.tools_inspector9)
    runs_dir, out_path = Path(args.runs_dir), Path(args.out)

    jam_lines = [json.loads(l) for l in jam_path.read_text(encoding="utf-8").splitlines() if l]
    ground_lines = [json.loads(l) for l in ground_path.read_text(encoding="utf-8").splitlines() if l]
    for l in jam_lines + ground_lines:
        assert l["song_id"] != "clair-de-lune", "test-song leak"
    jam_songs = sorted({l["song_id"] for l in jam_lines})
    assert jam_songs == ["chopin-prelude-e-minor", "fur-elise"], f"unexpected jam-val songs {jam_songs}"
    ground_songs = sorted({l["song_id"] for l in ground_lines})
    assert ground_songs == ["chopin-prelude-e-minor", "fur-elise"], f"unexpected grounding-val songs {ground_songs}"

    jam_tasks = build_jam_tasks(jam_lines)
    call_tasks, ans_tasks = build_grounding_tasks(ground_lines)
    validators41 = load_validators(tools41_path)
    validators9 = load_validators(tools9_path)
    tools41 = load_tools_for_template(tools41_path)
    tools9 = load_tools_for_template(tools9_path)
    print(
        f"[p3v1] jam {len(jam_lines)} records -> {len(jam_tasks)} turn tasks | "
        f"grounding {len(ground_lines)} sessions -> {len(call_tasks)} call + {len(ans_tasks)} answer tasks"
    )

    tokenizer = AutoTokenizer.from_pretrained(args.model, padding_side="left")
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    try:
        base = AutoModelForCausalLM.from_pretrained(args.model, dtype=torch.bfloat16, device_map="cuda")
    except TypeError:
        base = AutoModelForCausalLM.from_pretrained(args.model, torch_dtype=torch.bfloat16, device_map="cuda")
    base.eval()

    results: dict[str, dict] = {}
    for seed_dir in sorted(runs_dir.glob("seed*")):
        ckpts = sorted(seed_dir.glob("epoch*"), key=lambda p: int(p.name.replace("epoch", "")))
        if not ckpts:
            continue
        results[seed_dir.name] = {"checkpoints": {}}
        for ckpt in ckpts:
            t0 = time.time()
            model = PeftModel.from_pretrained(base, str(ckpt))
            model.eval()
            jam = score_jam(model, tokenizer, jam_tasks, tools41, validators41)
            ground = score_grounding(model, tokenizer, call_tasks, ans_tasks, tools9, validators9)
            composite = (jam["per_call_exact_match"] + ground["grounding_score"]) / 2
            score = {
                "jam": jam,
                "grounding": ground,
                "composite": round(composite, 6),
                "wall_time_s": round(time.time() - t0, 1),
            }
            base_back = model.unload()
            assert base_back is base or base_back is not None
            del model
            torch.cuda.empty_cache()
            results[seed_dir.name]["checkpoints"][ckpt.name] = score
            print(
                f"[p3v1] {seed_dir.name}/{ckpt.name}: composite={composite:.3f} "
                f"(jam_exact={jam['per_call_exact_match']:.3f} g_call={ground['g_call']:.3f} "
                f"g_ans={ground['g_ans']:.3f} validity={jam['schema_validity']:.3f}) "
                f"({score['wall_time_s']}s)"
            )

        def sel_key(item):
            name, s = item
            return (
                -s["composite"],
                -s["jam"]["schema_validity"],
                int(name.replace("epoch", "")),
            )

        winner = sorted(results[seed_dir.name]["checkpoints"].items(), key=sel_key)[0]
        results[seed_dir.name]["selected"] = winner[0]
        print(f"[p3v1] {seed_dir.name} SELECTED {winner[0]}")

    report = {
        "schema": "finetune-arc-v1-p3-selection/1.0.0",
        "phase": "P3-v1",
        "selection_rule": "max (jam_exact + (g_call+g_ans)/2)/2; tie -> max jam schema_validity; tie -> fewer epochs",
        "inner_val": {
            "jam_data": str(jam_path),
            "jam_data_sha256": sha256_file(jam_path),
            "jam_records": len(jam_lines),
            "grounding_data": str(ground_path),
            "grounding_data_sha256": sha256_file(ground_path),
            "grounding_sessions": len(ground_lines),
            "songs": jam_songs,
            "jam_turn_tasks": len(jam_tasks),
            "grounding_call_tasks": len(call_tasks),
            "grounding_answer_tasks": len(ans_tasks),
        },
        "tools_mcp41_sha256": sha256_file(tools41_path),
        "tools_inspector9_sha256": sha256_file(tools9_path),
        "decoding": {"strategy": "greedy", "max_new_tokens": MAX_NEW_TOKENS},
        "clair_de_lune_touched": False,
        "results": results,
    }
    out_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"[p3v1] report -> {out_path}")


if __name__ == "__main__":
    main()
