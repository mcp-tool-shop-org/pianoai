#!/usr/bin/env python3
"""Finetune Arc v1 P2 trainer — pinned recipe from experiments/finetune-arc-v1/P0-LOCK.md §7.

v0's train_finetune_arc.py (never modified) plus exactly the two locked deltas:
  * epochs 32 -> 8, checkpoints {2, 4, 8} (P0-LOCK delta 1)
  * per-line tool catalogs via line["tools_key"] in {mcp41, inspector9, none}
    (P0-LOCK delta 2) — each example renders with its own catalog.

Everything else (LoRA config, LR, batch shape, prompt-loss weighting, CE
chunking, receipt schema fields) is byte-inherited from v0.

    python train_finetune_arc_v1.py --seed 13 --data sft-train-v1.jsonl \
        --tools-mcp41 tools-mcp41.json --tools-inspector9 tools-inspector9.json \
        --out runs/seed13
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from pathlib import Path

import torch
from torch.nn import CrossEntropyLoss
from torch.utils.data import Dataset

from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    Trainer,
    TrainerCallback,
    TrainingArguments,
    set_seed,
)
from peft import LoraConfig, get_peft_model

CHECKPOINT_EPOCHS = {2, 4, 8}  # P0-LOCK v1 delta 1 (v0 evidence: {2,4,4,4,4} selected)
MAX_SEQ_LEN = 12288
PROMPT_LOSS_WEIGHT = 0.1
VALID_TOOLS_KEYS = {"mcp41", "inspector9", "none"}


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


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


def render_with_spans(tokenizer, messages: list[dict], tools) -> tuple[str, list[tuple[int, int]]]:
    """Render + assistant char spans; asserts the template prefix property (v0)."""
    tmpl = to_template_messages(messages)
    kwargs = {"tools": tools} if tools is not None else {}
    full = tokenizer.apply_chat_template(tmpl, tokenize=False, **kwargs)
    spans: list[tuple[int, int]] = []
    for i, m in enumerate(tmpl):
        if m["role"] != "assistant":
            continue
        before = tokenizer.apply_chat_template(
            tmpl[:i], tokenize=False, add_generation_prompt=True, **kwargs
        )
        after = tokenizer.apply_chat_template(tmpl[: i + 1], tokenize=False, **kwargs)
        if not after.startswith(before):
            raise AssertionError(f"template prefix property violated at turn {i}")
        if not full.startswith(after):
            raise AssertionError(f"template full-render property violated at turn {i}")
        spans.append((len(before), len(after)))
    return full, spans


class SftDataset(Dataset):
    def __init__(self, lines: list[dict], tokenizer, tools_by_key: dict[str, list[dict] | None]):
        self.examples = []
        total_tokens = 0
        assistant_tokens = 0
        component_counts: dict[str, int] = {}
        for line in lines:
            key = line.get("tools_key")
            if key not in VALID_TOOLS_KEYS:
                raise AssertionError(f"{line['id']}: invalid tools_key {key!r}")
            tools = tools_by_key[key]
            text, spans = render_with_spans(tokenizer, line["messages"], tools)
            enc = tokenizer(text, return_offsets_mapping=True, add_special_tokens=False)
            ids = enc["input_ids"]
            if len(ids) > MAX_SEQ_LEN:
                raise AssertionError(f"{line['id']} renders to {len(ids)} tokens > {MAX_SEQ_LEN}")
            weights = []
            for (start, end) in enc["offset_mapping"]:
                in_assistant = any(s < end and start < e for s, e in spans)
                weights.append(1.0 if in_assistant else PROMPT_LOSS_WEIGHT)
            n_assist = sum(1 for w in weights if w == 1.0)
            if n_assist == 0:
                raise AssertionError(f"{line['id']} produced no assistant tokens")
            total_tokens += len(ids)
            assistant_tokens += n_assist
            component_counts[line.get("component", "?")] = (
                component_counts.get(line.get("component", "?"), 0) + 1
            )
            self.examples.append(
                {"input_ids": ids, "labels": list(ids), "loss_weights": weights}
            )
        self.total_tokens = total_tokens
        self.assistant_tokens = assistant_tokens
        self.component_counts = component_counts

    def __len__(self):
        return len(self.examples)

    def __getitem__(self, idx):
        return self.examples[idx]


class PadCollator:
    def __init__(self, pad_token_id: int):
        self.pad_token_id = pad_token_id

    def __call__(self, batch):
        max_len = max(len(b["input_ids"]) for b in batch)
        input_ids, attention_mask, labels, weights = [], [], [], []
        for b in batch:
            n = len(b["input_ids"])
            pad = max_len - n
            input_ids.append(b["input_ids"] + [self.pad_token_id] * pad)
            attention_mask.append([1] * n + [0] * pad)
            labels.append(b["labels"] + [-100] * pad)
            weights.append(b["loss_weights"] + [0.0] * pad)
        return {
            "input_ids": torch.tensor(input_ids, dtype=torch.long),
            "attention_mask": torch.tensor(attention_mask, dtype=torch.long),
            "labels": torch.tensor(labels, dtype=torch.long),
            "loss_weights": torch.tensor(weights, dtype=torch.float),
        }


class WeightedTrainer(Trainer):
    CE_CHUNK = 1024  # v0: bounds the fp32 CE workspace at 12k ctx / 152k vocab

    def compute_loss(self, model, inputs, return_outputs=False, **kwargs):
        weights = inputs.pop("loss_weights")
        labels = inputs.pop("labels")
        outputs = model(**inputs)
        logits = outputs.logits
        shift_labels = labels[..., 1:]
        shift_weights = weights[..., 1:]
        seq = logits.size(1) - 1
        vocab = logits.size(-1)
        loss_fct = CrossEntropyLoss(reduction="none", ignore_index=-100)
        total = torch.zeros((), dtype=torch.float32, device=logits.device)
        wsum = torch.zeros((), dtype=torch.float32, device=logits.device)
        for s in range(0, seq, self.CE_CHUNK):
            e = min(s + self.CE_CHUNK, seq)
            lg = logits[:, s:e, :].float()
            lb = shift_labels[:, s:e]
            wt = shift_weights[:, s:e]
            per_token = loss_fct(lg.reshape(-1, vocab), lb.reshape(-1)).reshape(lb.size())
            w = wt * (lb != -100).float()
            total = total + (per_token * w).sum()
            wsum = wsum + w.sum()
        loss = total / wsum.clamp(min=1.0)
        return (loss, outputs) if return_outputs else loss


class EpochCheckpointCallback(TrainerCallback):
    def __init__(self, out_dir: Path, tokenizer):
        self.out_dir = out_dir
        self.tokenizer = tokenizer
        self.saved: list[int] = []

    def on_epoch_end(self, args, state, control, model=None, **kwargs):
        epoch = int(round(state.epoch or 0))
        if epoch in CHECKPOINT_EPOCHS and epoch not in self.saved:
            path = self.out_dir / f"epoch{epoch}"
            model.save_pretrained(str(path))
            self.tokenizer.save_pretrained(str(path))
            self.saved.append(epoch)
            print(f"[checkpoint] saved adapter at epoch {epoch} -> {path}")


def package_versions() -> dict:
    import importlib.metadata as md

    out = {"torch": torch.__version__}
    for pkg in ("transformers", "peft", "accelerate", "tokenizers", "jsonschema"):
        try:
            out[pkg] = md.version(pkg)
        except md.PackageNotFoundError:
            out[pkg] = "absent"
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="Qwen/Qwen2.5-7B-Instruct")
    ap.add_argument("--data", required=True)
    ap.add_argument("--tools-mcp41", required=True)
    ap.add_argument("--tools-inspector9", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, required=True)
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--lr", type=float, default=1.5e-4)
    ap.add_argument("--per-device-batch", type=int, default=1)
    ap.add_argument("--grad-accum", type=int, default=8)
    ap.add_argument("--smoke", action="store_true", help="render+1 step only")
    args = ap.parse_args()

    data_path = Path(args.data)
    tools41_path, tools9_path = Path(args.tools_mcp41), Path(args.tools_inspector9)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    set_seed(args.seed)

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tools_by_key: dict[str, list[dict] | None] = {
        "mcp41": load_tools(tools41_path),
        "inspector9": load_tools(tools9_path),
        "none": None,
    }
    lines = [json.loads(l) for l in data_path.read_text(encoding="utf-8").splitlines() if l]
    assert all(line["song_id"] != "clair-de-lune" for line in lines), "test-song leak"
    assert all("clair" not in line["id"].lower() for line in lines), "test-song leak (id)"

    t0 = time.time()
    dataset = SftDataset(lines, tokenizer, tools_by_key)
    print(
        f"[data] {len(dataset)} examples | {dataset.total_tokens} tokens "
        f"({dataset.assistant_tokens} assistant) | components {dataset.component_counts} | render+span ok"
    )

    if args.smoke:
        print("[smoke] render/span assertions passed for all examples")

    try:
        model = AutoModelForCausalLM.from_pretrained(
            args.model, dtype=torch.bfloat16, device_map="cuda"
        )
    except TypeError:
        model = AutoModelForCausalLM.from_pretrained(
            args.model, torch_dtype=torch.bfloat16, device_map="cuda"
        )
    model.config.use_cache = False
    lora = LoraConfig(
        r=16,
        lora_alpha=32,
        lora_dropout=0.1,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ],
    )
    model = get_peft_model(model, lora)
    model.enable_input_require_grads()
    model.print_trainable_parameters()

    steps_per_epoch = math.ceil(len(dataset) / (args.per_device_batch * args.grad_accum))
    train_args = TrainingArguments(
        output_dir=str(out_dir / "hf-out"),
        num_train_epochs=1 if args.smoke else args.epochs,
        max_steps=1 if args.smoke else -1,
        per_device_train_batch_size=args.per_device_batch,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        lr_scheduler_type="cosine",
        warmup_steps=10,
        weight_decay=0.0,
        max_grad_norm=1.0,
        bf16=True,
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        logging_steps=1,
        save_strategy="no",
        report_to=[],
        seed=args.seed,
        data_seed=args.seed,
        remove_unused_columns=False,
    )
    trainer = WeightedTrainer(
        model=model,
        args=train_args,
        train_dataset=dataset,
        data_collator=PadCollator(tokenizer.pad_token_id),
        callbacks=[EpochCheckpointCallback(out_dir, tokenizer)],
    )
    result = trainer.train()

    log_history = trainer.state.log_history
    epoch_losses = [
        {"epoch": h.get("epoch"), "loss": h.get("loss"), "lr": h.get("learning_rate")}
        for h in log_history
        if "loss" in h
    ]
    receipt = {
        "schema": "finetune-arc-v1-run-config/1.0.0",
        "phase": "P2-v1",
        "seed": args.seed,
        "model": args.model,
        "smoke": args.smoke,
        "hyperparameters": {
            "method": "bf16 LoRA",
            "lora_r": 16,
            "lora_alpha": 32,
            "lora_dropout": 0.1,
            "target_modules": lora.target_modules if isinstance(lora.target_modules, list) else sorted(lora.target_modules),
            "learning_rate": args.lr,
            "lr_scheduler": "cosine",
            "warmup_steps": 10,
            "weight_decay": 0.0,
            "max_grad_norm": 1.0,
            "per_device_batch": args.per_device_batch,
            "grad_accum": args.grad_accum,
            "effective_batch": args.per_device_batch * args.grad_accum,
            "epochs": args.epochs,
            "checkpoint_epochs": sorted(CHECKPOINT_EPOCHS),
            "prompt_loss_weight": PROMPT_LOSS_WEIGHT,
            "max_seq_len": MAX_SEQ_LEN,
        },
        "inputs": {
            "data": str(data_path),
            "data_sha256": sha256_file(data_path),
            "tools_mcp41_sha256": sha256_file(tools41_path),
            "tools_inspector9_sha256": sha256_file(tools9_path),
            "examples": len(dataset),
            "component_counts": dataset.component_counts,
            "total_tokens": dataset.total_tokens,
            "assistant_tokens": dataset.assistant_tokens,
        },
        "saturation_log": {
            "steps_per_epoch": steps_per_epoch,
            "tokens_per_epoch": dataset.total_tokens,
            "cumulative_tokens_by_checkpoint": {
                str(e): dataset.total_tokens * e for e in sorted(CHECKPOINT_EPOCHS)
            },
            "loss_curve": epoch_losses,
        },
        "environment": {
            "packages": package_versions(),
            "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "none",
            "cuda": torch.version.cuda,
        },
        "training_summary": {
            "train_runtime_s": result.metrics.get("train_runtime"),
            "final_loss": result.metrics.get("train_loss"),
            "wall_time_s": round(time.time() - t0, 1),
        },
    }
    (out_dir / "run-config.json").write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    print(f"[receipt] {out_dir / 'run-config.json'}")


if __name__ == "__main__":
    main()
