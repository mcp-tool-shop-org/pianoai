"""
Slice 9c — jam-actions-v0 LoRA Fine-Tune Script (SCAFFOLD)
============================================================

Phase 1: Scaffold only. DO NOT RUN until Phase 2 is authorized by the user.

Target: qwen2.5:7b (Qwen/Qwen2.5-7B-Instruct from HuggingFace)
Technique: QLoRA — 4-bit base model, LoRA adapters on attention + MLP
Training data: experiments/jam-actions-v0-lora/train.jsonl (20 examples)
Eval: E2 phrase continuation on test set (clair-de-lune) using existing harness

Usage:
    # Dry run (loads everything, prints config, exits without training)
    python experiments/jam-actions-v0-lora/train_lora.py --dry-run

    # Full training
    python experiments/jam-actions-v0-lora/train_lora.py

    # Full training with custom output dir
    python experiments/jam-actions-v0-lora/train_lora.py --output-dir experiments/jam-actions-v0-lora/adapter-v1

Requirements (install BEFORE Phase 2):
    pip install torch>=2.3.0 --index-url https://download.pytorch.org/whl/cu121
    pip install transformers>=4.45.0 peft>=0.12.0 trl>=0.9.0 bitsandbytes>=0.43.0
    pip install accelerate>=0.31.0 datasets>=2.20.0

Notes:
    - Train set: examples 0-17 (18 pairs), train.jsonl lines 0-17
    - Validation set: examples 18-19 (2 pairs = Schumann Traumerei mm.9-12, mm.17-20)
    - Validation serves as loss-monitoring signal; NOT the locked E2 test set
    - The locked test set (clair-de-lune) is NEVER loaded by this script
    - Adapter is saved to output_dir; NOT converted to Ollama Modelfile here
    - Ollama Modelfile conversion is Phase 2 / Slice 9c post-training step
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths — relative to repo root
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).parent.parent.parent
TRAIN_JSONL = Path(__file__).parent / "train.jsonl"
DEFAULT_OUTPUT_DIR = Path(__file__).parent / "adapter-v1"
RECEIPT_FILENAME = "training-receipt.json"

# ---------------------------------------------------------------------------
# Clair-de-lune safety assertion — runs at startup, before any training
# ---------------------------------------------------------------------------
FORBIDDEN_RECORD_SUBSTRING = "clair-de-lune"

def assert_no_clair_de_lune_in_train() -> None:
    """Hard assertion: clair-de-lune must never appear in train.jsonl."""
    with open(TRAIN_JSONL, encoding="utf-8") as f:
        for i, line in enumerate(f):
            ex = json.loads(line)
            meta = ex.get("_meta", {})
            for field in ("prompt_id", "target_id", "song_id"):
                val = meta.get(field, "")
                if FORBIDDEN_RECORD_SUBSTRING in val:
                    raise RuntimeError(
                        f"SAFETY ASSERTION FAILED: clair-de-lune record found in "
                        f"train.jsonl at line {i}! Field '{field}' = '{val}'. "
                        "This script must not train on test-set records."
                    )
    print("[SAFETY] No clair-de-lune records in train.jsonl — assertion passed.")


# ---------------------------------------------------------------------------
# Model and training configuration
# ---------------------------------------------------------------------------

MODEL_ID = "Qwen/Qwen2.5-7B-Instruct"

# QLoRA config
QLORA_CONFIG = {
    "r": 16,                   # LoRA rank — start conservative; 32 if loss plateaus
    "lora_alpha": 32,          # alpha = 2 * r for balanced scaling
    "target_modules": [        # qwen2.5 attention + MLP modules
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
    "lora_dropout": 0.05,
    "bias": "none",
    "task_type": "CAUSAL_LM",
}

# Training hyperparameters — conservative for first attempt on small dataset
TRAIN_ARGS = {
    "output_dir": str(DEFAULT_OUTPUT_DIR),
    "num_train_epochs": 5,          # max 5; watch val loss for early stopping signal
    "per_device_train_batch_size": 1,
    "per_device_eval_batch_size": 1,
    "gradient_accumulation_steps": 4,
    "optim": "paged_adamw_32bit",
    "save_strategy": "epoch",
    "evaluation_strategy": "epoch",
    "logging_steps": 5,
    "learning_rate": 1e-4,          # conservative for LoRA
    "weight_decay": 0.001,
    "fp16": True,                   # RTX 5080 supports bf16 too; fp16 safer default
    "bf16": False,
    "max_grad_norm": 0.3,
    "warmup_ratio": 0.03,
    "lr_scheduler_type": "cosine",
    "load_best_model_at_end": True,
    "metric_for_best_model": "eval_loss",
    "greater_is_better": False,
    "report_to": "none",            # no wandb/tensorboard in Phase 1
    "seed": 42,
}

# Validation split: last 2 examples (Schumann Traumerei mm.9-12 + mm.17-20)
TRAIN_SLICE = slice(0, 18)   # examples 0-17
EVAL_SLICE  = slice(18, 20)  # examples 18-19

# Quantization config (4-bit BitsAndBytes QLoRA)
BNB_CONFIG_PARAMS = {
    "load_in_4bit": True,
    "bnb_4bit_quant_type": "nf4",
    "bnb_4bit_compute_dtype": "float16",
    "bnb_4bit_use_double_quant": True,
}


# ---------------------------------------------------------------------------
# Data loading helpers
# ---------------------------------------------------------------------------

def load_jsonl(path: Path) -> list[dict]:
    examples = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                examples.append(json.loads(line))
    return examples


def strip_meta(examples: list[dict]) -> list[dict]:
    """Remove _meta keys before feeding to HuggingFace datasets."""
    return [{"messages": ex["messages"]} for ex in examples]


# ---------------------------------------------------------------------------
# Receipt helpers
# ---------------------------------------------------------------------------

def write_receipt(
    output_dir: Path,
    config: dict,
    train_log: list[dict] | None,
    wall_time_s: float,
    gpu_peak_gb: float | None,
    git_sha: str,
) -> None:
    receipt = {
        "schema": "training-receipt/1.0.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": MODEL_ID,
        "technique": "QLoRA-4bit",
        "lora_config": QLORA_CONFIG,
        "train_args": config,
        "data": {
            "train_jsonl": str(TRAIN_JSONL),
            "train_examples": 18,
            "val_examples": 2,
            "val_song": "schumann-traumerei",
            "test_set": "clair-de-lune (held out — never loaded by this script)",
        },
        "training": {
            "loss_curve": train_log or [],
            "wall_time_seconds": round(wall_time_s, 1),
            "gpu_peak_memory_gb": gpu_peak_gb,
        },
        "git_sha": git_sha,
        "adapter_path": str(output_dir),
        "next_step": (
            "Convert adapter to Ollama Modelfile for inference — see Slice 9c Phase 2 docs."
        ),
    }
    receipt_path = output_dir / RECEIPT_FILENAME
    receipt_path.parent.mkdir(parents=True, exist_ok=True)
    with open(receipt_path, "w", encoding="utf-8") as f:
        json.dump(receipt, f, indent=2, ensure_ascii=False)
    print(f"[RECEIPT] Written to {receipt_path}")


def get_git_sha() -> str:
    import subprocess
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True, text=True, cwd=REPO_ROOT
        )
        return result.stdout.strip()
    except Exception:
        return "unknown"


# ---------------------------------------------------------------------------
# Main training function
# ---------------------------------------------------------------------------

def train(output_dir: Path, dry_run: bool) -> None:
    """
    Main entry point. Set dry_run=True to load everything, print config,
    and exit without training — useful for environment verification.
    """

    # --- Safety assertion first, before any imports ---
    print("[STARTUP] Running safety assertions...")
    assert_no_clair_de_lune_in_train()

    # --- Load training data ---
    print(f"[DATA] Loading training data from {TRAIN_JSONL}")
    all_examples = load_jsonl(TRAIN_JSONL)
    print(f"[DATA] Total examples: {len(all_examples)}")
    train_examples = strip_meta(all_examples[TRAIN_SLICE])
    val_examples   = strip_meta(all_examples[EVAL_SLICE])
    print(f"[DATA] Train: {len(train_examples)}, Val: {len(val_examples)}")
    for i, ex in enumerate(val_examples):
        src = all_examples[EVAL_SLICE][i]["_meta"]["song_id"]
        wnd = all_examples[EVAL_SLICE][i]["_meta"]["target_id"].split(":")[1]
        print(f"[DATA]   val[{i}]: {src} {wnd}")

    # --- Import heavy dependencies (deferred to avoid slow startup on --help) ---
    print("[DEPS] Importing PyTorch + HuggingFace stack...")
    try:
        import torch  # noqa: F401
        from transformers import (
            AutoTokenizer,
            AutoModelForCausalLM,
            BitsAndBytesConfig,
        )
        from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
        from trl import SFTTrainer, SFTConfig
        from datasets import Dataset
    except ImportError as e:
        print(f"[ERROR] Missing dependency: {e}")
        print()
        print("Install command:")
        print("  pip install torch>=2.3.0 --index-url https://download.pytorch.org/whl/cu121")
        print("  pip install transformers>=4.45.0 peft>=0.12.0 trl>=0.9.0 bitsandbytes>=0.43.0")
        print("  pip install accelerate>=0.31.0 datasets>=2.20.0")
        sys.exit(1)

    import torch

    # --- GPU check ---
    if not torch.cuda.is_available():
        print("[ERROR] No CUDA device found. QLoRA requires an NVIDIA GPU.")
        print("        Check that PyTorch was installed with CUDA support.")
        sys.exit(1)

    device_name = torch.cuda.get_device_name(0)
    vram_gb = torch.cuda.get_device_properties(0).total_memory / 1e9
    print(f"[GPU] Device: {device_name} ({vram_gb:.1f} GB VRAM)")

    if vram_gb < 8:
        print(f"[WARNING] Only {vram_gb:.1f} GB VRAM. Minimum 8 GB recommended for QLoRA on 7B model.")

    # --- Config summary ---
    print()
    print("=" * 60)
    print("TRAINING CONFIGURATION")
    print("=" * 60)
    print(f"  Model:          {MODEL_ID}")
    print(f"  Technique:      QLoRA (4-bit base, LoRA rank={QLORA_CONFIG['r']})")
    print(f"  Target modules: {', '.join(QLORA_CONFIG['target_modules'])}")
    print(f"  Train examples: {len(train_examples)}")
    print(f"  Val examples:   {len(val_examples)}")
    print(f"  Epochs (max):   {TRAIN_ARGS['num_train_epochs']}")
    print(f"  Learning rate:  {TRAIN_ARGS['learning_rate']}")
    print(f"  Batch size:     {TRAIN_ARGS['per_device_train_batch_size']} x {TRAIN_ARGS['gradient_accumulation_steps']} accum")
    print(f"  Output dir:     {output_dir}")
    print(f"  GPU:            {device_name}")
    print("=" * 60)
    print()

    if dry_run:
        print("[DRY RUN] Config loaded and validated. Exiting without training.")
        print("[DRY RUN] To train, run without --dry-run flag.")
        return

    # --- BitsAndBytes quantization config ---
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=BNB_CONFIG_PARAMS["load_in_4bit"],
        bnb_4bit_quant_type=BNB_CONFIG_PARAMS["bnb_4bit_quant_type"],
        bnb_4bit_compute_dtype=getattr(torch, BNB_CONFIG_PARAMS["bnb_4bit_compute_dtype"]),
        bnb_4bit_use_double_quant=BNB_CONFIG_PARAMS["bnb_4bit_use_double_quant"],
    )

    # --- Load tokenizer ---
    print(f"[MODEL] Loading tokenizer from {MODEL_ID}...")
    tokenizer = AutoTokenizer.from_pretrained(
        MODEL_ID,
        trust_remote_code=True,
        padding_side="right",
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # --- Load base model (4-bit quantized) ---
    print(f"[MODEL] Loading base model in 4-bit ({MODEL_ID})...")
    print("        This will download ~4-5 GB on first run.")
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )
    model.config.use_cache = False
    model.config.pretraining_tp = 1

    # --- Prepare for k-bit training ---
    model = prepare_model_for_kbit_training(model)

    # --- Apply LoRA ---
    lora_config = LoraConfig(
        r=QLORA_CONFIG["r"],
        lora_alpha=QLORA_CONFIG["lora_alpha"],
        target_modules=QLORA_CONFIG["target_modules"],
        lora_dropout=QLORA_CONFIG["lora_dropout"],
        bias=QLORA_CONFIG["bias"],
        task_type=QLORA_CONFIG["task_type"],
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # --- Build HuggingFace datasets ---
    def format_chat(example: dict) -> dict:
        """Apply chat template to messages list."""
        text = tokenizer.apply_chat_template(
            example["messages"],
            tokenize=False,
            add_generation_prompt=False,
        )
        return {"text": text}

    train_ds = Dataset.from_list(train_examples).map(format_chat)
    val_ds   = Dataset.from_list(val_examples).map(format_chat)

    # --- SFTConfig (TRL 0.9+) ---
    training_args = TRAIN_ARGS.copy()
    training_args["output_dir"] = str(output_dir)
    sft_config = SFTConfig(
        **training_args,
        dataset_text_field="text",
        max_seq_length=4096,
        packing=False,
    )

    # --- Trainer ---
    trainer = SFTTrainer(
        model=model,
        args=sft_config,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        tokenizer=tokenizer,
    )

    # --- Train ---
    print("[TRAIN] Starting training...")
    t0 = time.time()
    torch.cuda.reset_peak_memory_stats()

    train_result = trainer.train()
    wall_time = time.time() - t0

    # --- Save adapter ---
    output_dir.mkdir(parents=True, exist_ok=True)
    trainer.save_model(str(output_dir))
    tokenizer.save_pretrained(str(output_dir))
    print(f"[SAVE] Adapter saved to {output_dir}")

    # --- Peak GPU memory ---
    gpu_peak_gb = torch.cuda.max_memory_allocated() / 1e9

    # --- Write receipt ---
    log_history = getattr(trainer.state, "log_history", [])
    write_receipt(
        output_dir=output_dir,
        config=training_args,
        train_log=log_history,
        wall_time_s=wall_time,
        gpu_peak_gb=gpu_peak_gb,
        git_sha=get_git_sha(),
    )

    print()
    print("=" * 60)
    print("TRAINING COMPLETE")
    print("=" * 60)
    print(f"  Wall time:        {wall_time:.1f}s ({wall_time / 60:.1f} min)")
    print(f"  GPU peak memory:  {gpu_peak_gb:.2f} GB")
    print(f"  Adapter:          {output_dir}")
    print()
    print("Next step (Phase 2):")
    print("  Convert adapter to Ollama Modelfile for inference.")
    print("  Then run: pnpm exec tsx scripts/run-llm-eval.ts --backend ollama --model <finetuned-model>")
    print("=" * 60)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Slice 9c: QLoRA fine-tune qwen2.5:7b on jam-actions-v0 continuation pairs"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Load data + model config, print plan, exit without training",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Where to save the LoRA adapter (default: {DEFAULT_OUTPUT_DIR})",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    train(output_dir=args.output_dir, dry_run=args.dry_run)
