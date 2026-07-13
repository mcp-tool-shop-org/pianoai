#!/usr/bin/env python3
"""Finetune Arc B-2 P3 — composite checkpoint selection on the inner splits ONLY.

P0-LOCK.md (B-2) §8. Extends v1's P3 with a PROSE-CALIBRATION term:

  composite = (jam_exact + grounding_score + prose_cal) / 3

where (all teacher-forced greedy on inner-val songs, clair-de-lune never loaded):
  jam_exact       — v1's per-call exact match on the 25 jam-val records (41-tool).
  grounding_score = (g_call + g_ans)/2 on the 50 grounding-val sessions (inspector).
  prose_cal       — the selective-accuracy PROXY on a NEW abstention-val slice:
                    answerable items must ANSWER (containment), unanswerable items
                    must DECLINE (a decline phrase, no smuggled value). This is the
                    calibration surface B-2 targets; it is inner-val only and never
                    touches the cohort or clair-de-lune.

Selection rule (preregistered): max composite; tie -> max jam_validity; tie ->
fewer epochs.

    python p3_select_b2.py --jam-data sft-val-jam.jsonl \
        --grounding-data sft-val-grounding.jsonl \
        --abstention-data sft-val-abstention.jsonl \
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

# Decline-phrase set — Python port of det-b2.ts DECLINE_PHRASES (kept in sync).
DECLINE_PHRASES = [
    "cannot be determined from", "can't be determined from",
    "isn't something the annotation can tell", "the annotation alone doesn't",
    "the annotation doesn't carry", "there's no way to know that from",
    "no way to answer that from", "not something this note list can answer",
    "the note list doesn't include", "this data doesn't include",
    "isn't in the data provided", "no such note appears", "no such event appears",
    "that note isn't in the passage", "the premise doesn't hold",
    "that isn't actually the case",
]
CONFAB_MARKERS = re.compile(r"\bthe answer is\b|\bexactly \d+\b", re.IGNORECASE)


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
    return {t["name"]: Draft7Validator(harden(copy.deepcopy(t["inputSchema"]))) for t in catalog["tools"]}


def load_tools_for_template(tools_path: Path) -> list[dict]:
    catalog = json.loads(tools_path.read_text(encoding="utf-8"))
    return [
        {"type": "function", "function": {"name": t["name"], "description": t.get("description", ""), "parameters": t["inputSchema"]}}
        for t in catalog["tools"]
    ]


def to_template_messages(messages: list[dict]) -> list[dict]:
    out = []
    for m in messages:
        if m["role"] == "assistant" and m.get("tool_calls"):
            out.append({"role": "assistant", "content": m.get("content", ""),
                        "tool_calls": [{"type": "function", "function": {"name": tc["name"], "arguments": tc["arguments"]}} for tc in m["tool_calls"]]})
        elif m["role"] == "tool":
            out.append({"role": "tool", "name": m.get("name"), "content": m["content"]})
        else:
            out.append({"role": m["role"], "content": m["content"]})
    return out


def parse_pred_calls(text: str) -> list[dict]:
    calls = []
    for m in TOOL_CALL_RE.finditer(text):
        try:
            calls.append(json.loads(m.group(1)))
        except json.JSONDecodeError:
            calls.append({"__unparseable__": m.group(1)[:200]})
    return calls


def deep_equal(a, b) -> bool:
    return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


# ─── Containment matcher — Python port of det-b2.ts answerContainsB2 ──────────

def answer_contains_b2(answer_text: str, gold: dict) -> bool:
    kind = gold["kind"]
    if kind in ("number", "note", "hand", "yesno"):
        value = gold["value"]
        text = answer_text.lower()
        if kind == "number":
            return re.search(rf"(?<![\d.]){re.escape(str(value))}(?!\.?\d)", answer_text) is not None
        if kind == "note":
            return re.search(rf"\b{re.escape(str(value))}(?![0-9#])", answer_text, re.IGNORECASE) is not None
        if kind == "hand":
            return ("right" if value == "right" else "left") in text
        if kind == "yesno":
            m = re.search(r"\b(yes|no|actually,?\s*no)\b", text)
            if not m:
                return False
            said_no = "no" in m.group(1)
            return (not said_no) if value else said_no
    if kind == "text":
        return gold["value"].lower() in answer_text.lower()
    if kind == "abstain":
        lower = answer_text.lower()
        if not any(p in lower for p in DECLINE_PHRASES):
            return False
        return CONFAB_MARKERS.search(answer_text) is None
    return False


# ─── Task builders ────────────────────────────────────────────────────────────

def build_jam_tasks(lines: list[dict]) -> list[dict]:
    tasks = []
    for line in lines:
        msgs = line["messages"]
        for i, m in enumerate(msgs):
            if m["role"] != "assistant":
                continue
            tasks.append({"record_id": line["id"], "turn_index": i, "context": msgs[:i],
                          "gold_calls": [{"name": tc["name"], "arguments": tc["arguments"]} for tc in m.get("tool_calls", [])]})
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
                call_tasks.append({"record_id": line["id"], "turn_index": i, "context": msgs[:i]})
            elif i in answer_indices:
                ans_tasks.append({"record_id": line["id"], "turn_index": i, "context": msgs[:i], "golds": answer_indices[i]["golds"]})
    return call_tasks, ans_tasks


def build_abstention_tasks(lines: list[dict]) -> list[dict]:
    """Each C4-val line is single-turn: [system, user, assistant]. The task is to
    generate the assistant answer from [system, user] and check the golds."""
    tasks = []
    for line in lines:
        msgs = line["messages"]
        v = line["verify"][0]
        idx = v["answerMsgIndex"]
        tasks.append({"record_id": line["id"], "context": msgs[:idx], "kind": v["kind"], "golds": v["golds"]})
    return tasks


# ─── Generation ───────────────────────────────────────────────────────────────

@torch.no_grad()
def generate_batch(model, tokenizer, prompts: list[str]) -> list[str]:
    enc = tokenizer(prompts, return_tensors="pt", padding=True, add_special_tokens=False)
    enc = {k: v.to(model.device) for k, v in enc.items()}
    out = model.generate(**enc, max_new_tokens=MAX_NEW_TOKENS, do_sample=False,
                         temperature=None, top_p=None, top_k=None,
                         pad_token_id=tokenizer.pad_token_id,
                         eos_token_id=tokenizer.convert_tokens_to_ids("<|im_end|>"))
    texts = []
    for i in range(len(prompts)):
        gen = out[i][enc["input_ids"].shape[1]:]
        texts.append(tokenizer.decode(gen, skip_special_tokens=False))
    return texts


def render_prompts(tokenizer, tasks, tools) -> list[str]:
    return [tokenizer.apply_chat_template(to_template_messages(t["context"]), tools=tools, tokenize=False, add_generation_prompt=True) for t in tasks]


def render_prompts_notools(tokenizer, tasks) -> list[str]:
    return [tokenizer.apply_chat_template(to_template_messages(t["context"]), tokenize=False, add_generation_prompt=True) for t in tasks]


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
            name, args = p.get("name"), p.get("arguments")
            if "__unparseable__" not in p and isinstance(name, str) and name in validators and isinstance(args, dict) and not list(validators[name].iter_errors(args)):
                valid_pred += 1
            if j < len(gold) and name == gold[j]["name"] and deep_equal(args, gold[j]["arguments"]):
                matched += 1
    exact = matched / max(gold_total, pred_total, 1)
    validity = (valid_pred / pred_total) if pred_total else 1.0
    return {"per_call_exact_match": round(exact, 6), "schema_validity": round(validity, 6),
            "gold_calls_total": gold_total, "pred_calls_total": pred_total, "matched": matched, "valid_pred_calls": valid_pred}


def score_grounding(model, tokenizer, call_tasks, ans_tasks, tools, validators) -> dict:
    call_gens = gen_all(model, tokenizer, render_prompts(tokenizer, call_tasks, tools))
    ans_gens = gen_all(model, tokenizer, render_prompts(tokenizer, ans_tasks, tools))
    call_pass = 0
    for task, gen in zip(call_tasks, call_gens):
        pred = parse_pred_calls(gen)
        if not pred:
            continue
        ok = all(("__unparseable__" not in p and isinstance(p.get("name"), str) and p.get("name") in validators
                  and isinstance(p.get("arguments"), dict) and not list(validators[p["name"]].iter_errors(p["arguments"]))) for p in pred)
        if ok:
            call_pass += 1
    ans_pass = 0
    for task, gen in zip(ans_tasks, ans_gens):
        visible = TOOL_CALL_RE.sub("", gen).replace("<|im_end|>", "").strip()
        if all(answer_contains_b2(visible, g) for g in task["golds"]):
            ans_pass += 1
    g_call = call_pass / len(call_tasks) if call_tasks else 1.0
    g_ans = ans_pass / len(ans_tasks) if ans_tasks else 1.0
    return {"g_call": round(g_call, 6), "g_ans": round(g_ans, 6), "grounding_score": round((g_call + g_ans) / 2, 6),
            "call_tasks": len(call_tasks), "call_pass": call_pass, "ans_tasks": len(ans_tasks), "ans_pass": ans_pass}


def score_abstention(model, tokenizer, tasks) -> dict:
    """prose_cal proxy: answerable items must answer (containment), unanswerable
    must decline. No tools — the C4-val lines are tools_key none."""
    gens = gen_all(model, tokenizer, render_prompts_notools(tokenizer, tasks))
    ans_ok = ans_total = unans_ok = unans_total = 0
    for task, gen in zip(tasks, gens):
        visible = gen.replace("<|im_end|>", "").strip()
        good = all(answer_contains_b2(visible, g) for g in task["golds"])
        if task["kind"] == "answerable":
            ans_total += 1
            ans_ok += 1 if good else 0
        else:
            unans_total += 1
            unans_ok += 1 if good else 0
    correct = ans_ok + unans_ok
    total = ans_total + unans_total
    return {"prose_cal": round(correct / total, 6) if total else 0.0,
            "answerable_correct": ans_ok, "answerable_total": ans_total,
            "unanswerable_abstained": unans_ok, "unanswerable_total": unans_total}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="Qwen/Qwen2.5-7B-Instruct")
    ap.add_argument("--jam-data", required=True)
    ap.add_argument("--grounding-data", required=True)
    ap.add_argument("--abstention-data", required=True)
    ap.add_argument("--tools-mcp41", required=True)
    ap.add_argument("--tools-inspector9", required=True)
    ap.add_argument("--runs-dir", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    jam_path, ground_path, abst_path = Path(args.jam_data), Path(args.grounding_data), Path(args.abstention_data)
    tools41_path, tools9_path = Path(args.tools_mcp41), Path(args.tools_inspector9)
    runs_dir, out_path = Path(args.runs_dir), Path(args.out)

    jam_lines = [json.loads(l) for l in jam_path.read_text(encoding="utf-8").splitlines() if l]
    ground_lines = [json.loads(l) for l in ground_path.read_text(encoding="utf-8").splitlines() if l]
    abst_lines = [json.loads(l) for l in abst_path.read_text(encoding="utf-8").splitlines() if l]
    for l in jam_lines + ground_lines + abst_lines:
        assert l["song_id"] != "clair-de-lune", "test-song leak"
    for pool, lines in (("jam", jam_lines), ("grounding", ground_lines), ("abstention", abst_lines)):
        songs = sorted({l["song_id"] for l in lines})
        assert songs == ["chopin-prelude-e-minor", "fur-elise"], f"unexpected {pool}-val songs {songs}"

    jam_tasks = build_jam_tasks(jam_lines)
    call_tasks, ans_tasks = build_grounding_tasks(ground_lines)
    abst_tasks = build_abstention_tasks(abst_lines)
    validators41, validators9 = load_validators(tools41_path), load_validators(tools9_path)
    tools41, tools9 = load_tools_for_template(tools41_path), load_tools_for_template(tools9_path)
    print(f"[p3b2] jam {len(jam_lines)}->{len(jam_tasks)} tasks | grounding {len(ground_lines)}->{len(call_tasks)}c+{len(ans_tasks)}a | abstention {len(abst_lines)} tasks")

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
            abst = score_abstention(model, tokenizer, abst_tasks)
            composite = (jam["per_call_exact_match"] + ground["grounding_score"] + abst["prose_cal"]) / 3
            score = {"jam": jam, "grounding": ground, "abstention": abst, "composite": round(composite, 6), "wall_time_s": round(time.time() - t0, 1)}
            model.unload()
            del model
            torch.cuda.empty_cache()
            results[seed_dir.name]["checkpoints"][ckpt.name] = score
            print(f"[p3b2] {seed_dir.name}/{ckpt.name}: composite={composite:.3f} (jam_exact={jam['per_call_exact_match']:.3f} ground={ground['grounding_score']:.3f} prose_cal={abst['prose_cal']:.3f} validity={jam['schema_validity']:.3f}) ({score['wall_time_s']}s)")

        def sel_key(item):
            name, s = item
            return (-s["composite"], -s["jam"]["schema_validity"], int(name.replace("epoch", "")))

        winner = sorted(results[seed_dir.name]["checkpoints"].items(), key=sel_key)[0]
        results[seed_dir.name]["selected"] = winner[0]
        print(f"[p3b2] {seed_dir.name} SELECTED {winner[0]}")

    report = {
        "schema": "finetune-arc-b2-p3-selection/1.0.0",
        "phase": "P3-b2",
        "selection_rule": "max (jam_exact + grounding_score + prose_cal)/3; tie -> max jam schema_validity; tie -> fewer epochs",
        "inner_val": {
            "jam_records": len(jam_lines), "jam_data_sha256": sha256_file(jam_path),
            "grounding_sessions": len(ground_lines), "grounding_data_sha256": sha256_file(ground_path),
            "abstention_items": len(abst_lines), "abstention_data_sha256": sha256_file(abst_path),
            "songs": ["chopin-prelude-e-minor", "fur-elise"],
        },
        "tools_mcp41_sha256": sha256_file(tools41_path),
        "tools_inspector9_sha256": sha256_file(tools9_path),
        "decoding": {"strategy": "greedy", "max_new_tokens": MAX_NEW_TOKENS},
        "clair_de_lune_touched": False,
        "results": results,
    }
    out_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"[p3b2] report -> {out_path}")


if __name__ == "__main__":
    main()
