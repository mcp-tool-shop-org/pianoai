#!/usr/bin/env python3
"""Acoustic SFT LoRA trainer — runs ON THE POD, not on the studio rig.

Inherited from experiments/finetune-arc-v1/scripts/train_finetune_arc_v1.py, the
recipe that produced the published jam-ft-v1 adapters. What is byte-inherited:
the span-verified chat rendering, the prompt-loss weighting, the chunked
cross-entropy, the pad collator, the per-epoch adapter checkpoints, and the
receipt shape. Those were paid for; they are not re-derived here.

What differs, and why:

  * ONE tool catalog, not per-line keys. Every acoustic record uses the same
    surface, so `tools_key` has nothing to select.
  * Hyperparameters come from lora-config.json rather than argparse defaults.
    The experiment contract says every threshold the answer depends on lives in
    the record; a trainer with its own copy of the numbers is how the record and
    the run drift apart.
  * The holdout is a PHRASE (Für Elise), not clair-de-lune. The leak guard
    asserts that.
  * `--dry-run` renders and tokenizes with no model load and no GPU. Run it
    first on a fresh pod: it is seconds of CPU and it answers the one question
    that cannot be answered from the studio rig, which is what these examples
    actually tokenize to.

ON max_seq_len. It was 4096 and had never been put in front of a tokenizer.
Measured 2026-09-08 against Qwen/Qwen2.5-3B-Instruct: with the full 54-tool
catalog every one of the 72 examples exceeds 4096, the largest at 13276 tokens;
with the 5-tool listen subset the largest is 1704. The config now says 16384.

The assistant token count is 11654 either way -- the catalog is pure prompt, so
the full surface costs 8x the compute for the same learning signal. Keep it
anyway: the realistic inference condition is the full surface.

--dry-run still reports the distribution rather than trusting that number,
because the pod's tokenizer is the one that counts. The trainer refuses to train
on an over-length example rather than truncating it.

    python train_acoustic_sft.py --dry-run --tools full
    python train_acoustic_sft.py --seed 13 --out runs/seed13
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
REPO = EXP.parent.parent

DEFAULT_DATA = EXP / "data" / "sft-train.jsonl"
DEFAULT_TOOLS = REPO / "src" / "dataset" / "tool-schemas.json"
DEFAULT_CONFIG = EXP / "lora-config.json"

# The phrase held out of the acoustic corpus. Nothing with this song_id may
# appear in the training split.
HELDOUT_SONG_ID = "fur-elise"

# The Listen surface, for --tools listen. The full catalog is the realistic
# inference condition; this subset exists to measure what the catalog costs.
LISTEN_TOOLS = {
    "analyze_audio",
    "transcribe_audio",
    "score_audio_take",
    "view_spectrogram",
    "ensemble_now",
}

PROMPT_LOSS_WEIGHT = 0.1


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_tools(tools_path: Path, subset: str) -> list[dict]:
    catalog = json.loads(tools_path.read_text(encoding="utf-8"))
    tools = catalog["tools"]
    if subset == "listen":
        tools = [t for t in tools if t["name"] in LISTEN_TOOLS]
        missing = LISTEN_TOOLS - {t["name"] for t in tools}
        if missing:
            raise AssertionError(f"listen subset is incomplete, missing {sorted(missing)}")
    elif subset != "full":
        raise AssertionError(f"unknown tool subset {subset!r}")
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t.get("description", ""),
                "parameters": t["inputSchema"],
            },
        }
        for t in tools
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
    """Render + assistant char spans; asserts the template prefix property."""
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


def build_examples(lines, tokenizer, tools, max_seq_len, enforce):
    """Render, tokenize, weight. Returns (examples, stats).

    `enforce=False` records over-length examples instead of raising, so
    --dry-run can report the distribution on a fresh pod before anything is
    decided. `enforce=True` raises, because a silently truncated example is a
    training-time lie.
    """
    examples, lengths, over = [], [], []
    total_tokens = assistant_tokens = 0
    kind_counts: dict[str, int] = {}
    for line in lines:
        text, spans = render_with_spans(tokenizer, line["messages"], tools)
        enc = tokenizer(text, return_offsets_mapping=True, add_special_tokens=False)
        ids = enc["input_ids"]
        lengths.append(len(ids))
        if len(ids) > max_seq_len:
            over.append({"id": line["id"], "tokens": len(ids)})
            if enforce:
                raise AssertionError(
                    f"{line['id']} renders to {len(ids)} tokens > max_seq_len {max_seq_len}. "
                    f"Raise max_seq_len in lora-config.json or use --tools listen; "
                    f"do not truncate."
                )
        weights = []
        for (start, end) in enc["offset_mapping"]:
            in_assistant = any(s < end and start < e for s, e in spans)
            weights.append(1.0 if in_assistant else PROMPT_LOSS_WEIGHT)
        n_assist = sum(1 for w in weights if w == 1.0)
        if n_assist == 0:
            raise AssertionError(f"{line['id']} produced no assistant tokens")
        total_tokens += len(ids)
        assistant_tokens += n_assist
        kind_counts[line.get("kind", "?")] = kind_counts.get(line.get("kind", "?"), 0) + 1
        examples.append({"input_ids": ids, "labels": list(ids), "loss_weights": weights})
    lengths.sort()
    stats = {
        "examples": len(examples),
        "total_tokens": total_tokens,
        "assistant_tokens": assistant_tokens,
        "kind_counts": kind_counts,
        "tokens_min": lengths[0] if lengths else 0,
        "tokens_median": lengths[len(lengths) // 2] if lengths else 0,
        "tokens_max": lengths[-1] if lengths else 0,
        "over_max_seq_len": over,
    }
    return examples, stats


def load_lines(data_path: Path) -> list[dict]:
    lines = [json.loads(l) for l in data_path.read_text(encoding="utf-8").splitlines() if l.strip()]
    leaked = [l["id"] for l in lines if l.get("song_id") == HELDOUT_SONG_ID]
    if leaked:
        raise AssertionError(f"held-out phrase leaked into training: {leaked[:3]}")
    leaked_id = [l["id"] for l in lines if HELDOUT_SONG_ID in l["id"].lower()]
    if leaked_id:
        raise AssertionError(f"held-out phrase leaked into training by id: {leaked_id[:3]}")
    return lines


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default=str(DEFAULT_CONFIG))
    ap.add_argument("--data", default=str(DEFAULT_DATA))
    ap.add_argument("--tools-file", default=str(DEFAULT_TOOLS))
    ap.add_argument("--tools", choices=["full", "listen"], default="full",
                    help="full = the 54-tool live surface (realistic); listen = the 5 audio tools")
    ap.add_argument("--model", default=None, help="overrides base_model in the config")
    ap.add_argument("--out", default=None)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--dry-run", action="store_true",
                    help="render + tokenize only. No model, no GPU, no weights downloaded.")
    ap.add_argument("--smoke", action="store_true", help="one optimiser step, then stop")
    args = ap.parse_args()

    cfg = json.loads(Path(args.config).read_text(encoding="utf-8"))
    model_name = args.model or cfg["base_model"]
    seed = args.seed if args.seed is not None else cfg["seed"]
    max_seq_len = cfg["max_seq_len"]
    data_path, tools_path = Path(args.data), Path(args.tools_file)

    from transformers import AutoTokenizer  # imported late so --help works bare

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    tools = load_tools(tools_path, args.tools)
    lines = load_lines(data_path)
    t0 = time.time()
    examples, stats = build_examples(lines, tokenizer, tools, max_seq_len, enforce=not args.dry_run)

    print(f"[data] {stats['examples']} examples | {len(tools)} tools ({args.tools})")
    print(f"[data] tokens  min {stats['tokens_min']}  median {stats['tokens_median']}  max {stats['tokens_max']}")
    print(f"[data] total {stats['total_tokens']} ({stats['assistant_tokens']} assistant) | kinds {stats['kind_counts']}")
    print(f"[data] render + span assertions passed for all {stats['examples']} examples")

    if args.dry_run:
        n_over = len(stats["over_max_seq_len"])
        print(f"[dry-run] max_seq_len in config is {max_seq_len}")
        if n_over:
            print(f"[dry-run] {n_over} of {stats['examples']} examples EXCEED it "
                  f"(largest {stats['tokens_max']}).")
            print(f"[dry-run] Set max_seq_len to at least {stats['tokens_max']} in lora-config.json, "
                  f"or run with --tools listen, before training.")
        else:
            print(f"[dry-run] every example fits. Headroom: {max_seq_len - stats['tokens_max']} tokens.")
        print("[dry-run] no model was loaded and nothing was downloaded.")
        return

    # -- Training. Everything below needs a GPU and downloads weights. --------
    if not args.out:
        raise SystemExit("--out is required for a training run (use --dry-run to inspect data)")

    import torch
    from torch.nn import CrossEntropyLoss
    from torch.utils.data import Dataset
    from transformers import (
        AutoModelForCausalLM,
        Trainer,
        TrainerCallback,
        TrainingArguments,
        set_seed,
    )
    from peft import LoraConfig, get_peft_model

    class ListDataset(Dataset):
        def __init__(self, items):
            self.items = items

        def __len__(self):
            return len(self.items)

        def __getitem__(self, i):
            return self.items[i]

    class PadCollator:
        def __init__(self, pad_token_id):
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
        # Bounds the fp32 cross-entropy workspace at long context and a 152k vocab.
        CE_CHUNK = 1024

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
        """Save an adapter every epoch.

        No selection heuristic lives here. The eval picks, on the held-out
        phrase, against the trivial baselines and the base model on the same
        split -- which is rule 4 of the experiment contract.
        """

        def __init__(self, out_dir, tok):
            self.out_dir = out_dir
            self.tok = tok
            self.saved = []

        def on_epoch_end(self, args_, state, control, model=None, **kw):
            epoch = int(round(state.epoch or 0))
            if epoch and epoch not in self.saved:
                path = self.out_dir / f"epoch{epoch}"
                model.save_pretrained(str(path))
                self.tok.save_pretrained(str(path))
                self.saved.append(epoch)
                print(f"[checkpoint] adapter at epoch {epoch} -> {path}")

    def package_versions() -> dict:
        import importlib.metadata as md

        out = {"torch": torch.__version__}
        for pkg in ("transformers", "peft", "accelerate", "tokenizers"):
            try:
                out[pkg] = md.version(pkg)
            except md.PackageNotFoundError:
                out[pkg] = "absent"
        return out

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    set_seed(seed)
    dataset = ListDataset(examples)

    try:
        model = AutoModelForCausalLM.from_pretrained(
            model_name, dtype=torch.bfloat16, device_map="cuda"
        )
    except TypeError:
        model = AutoModelForCausalLM.from_pretrained(
            model_name, torch_dtype=torch.bfloat16, device_map="cuda"
        )
    model.config.use_cache = False

    lc = cfg["lora"]
    lora = LoraConfig(
        r=lc["r"],
        lora_alpha=lc["alpha"],
        lora_dropout=lc["dropout"],
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=list(lc["target_modules"]),
    )
    model = get_peft_model(model, lora)
    model.enable_input_require_grads()
    model.print_trainable_parameters()

    per_device = cfg["per_device_train_batch_size"]
    grad_accum = cfg["gradient_accumulation_steps"]
    steps_per_epoch = math.ceil(len(dataset) / (per_device * grad_accum))

    train_args = TrainingArguments(
        output_dir=str(out_dir / "hf-out"),
        num_train_epochs=1 if args.smoke else cfg["epochs"],
        max_steps=1 if args.smoke else -1,
        per_device_train_batch_size=per_device,
        gradient_accumulation_steps=grad_accum,
        learning_rate=cfg["lr"],
        lr_scheduler_type=cfg["schedule"],
        warmup_steps=cfg["warmup_steps"],
        weight_decay=cfg["weight_decay"],
        max_grad_norm=cfg["max_grad_norm"],
        bf16=(cfg["precision"] == "bf16"),
        gradient_checkpointing=cfg["gradient_checkpointing"],
        gradient_checkpointing_kwargs={"use_reentrant": False},
        logging_steps=1,
        save_strategy="no",
        report_to=[],
        seed=seed,
        data_seed=seed,
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

    epoch_losses = [
        {"epoch": h.get("epoch"), "loss": h.get("loss"), "lr": h.get("learning_rate")}
        for h in trainer.state.log_history
        if "loss" in h
    ]

    hp = {
        k: cfg[k]
        for k in (
            "method",
            "precision",
            "lr",
            "schedule",
            "warmup_steps",
            "effective_batch",
            "per_device_train_batch_size",
            "gradient_accumulation_steps",
            "weight_decay",
            "max_grad_norm",
            "max_seq_len",
            "epochs",
            "packing",
            "gradient_checkpointing",
        )
    }
    hp["lora"] = cfg["lora"]
    hp["prompt_loss_weight"] = PROMPT_LOSS_WEIGHT

    run_inputs = {
        "data": str(data_path),
        "data_sha256": sha256_file(data_path),
        "held_out_song_id": HELDOUT_SONG_ID,
    }
    for k in (
        "examples",
        "total_tokens",
        "assistant_tokens",
        "kind_counts",
        "tokens_min",
        "tokens_median",
        "tokens_max",
    ):
        run_inputs[k] = stats[k]

    receipt = {
        "schema": "acoustic-sft-run-config/1.0.0",
        "seed": seed,
        "model": model_name,
        "smoke": args.smoke,
        "tool_catalog": {
            "subset": args.tools,
            "count": len(tools),
            "sha256": sha256_file(tools_path),
        },
        "hyperparameters": hp,
        "inputs": run_inputs,
        "saturation_log": {
            "steps_per_epoch": steps_per_epoch,
            "tokens_per_epoch": stats["total_tokens"],
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
