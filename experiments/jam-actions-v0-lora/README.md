# jam-actions-v0 LoRA Fine-Tune Experiment (Slice 9c)

**Goal:** Close FM-5 (groove mismatch on harder material) in the E2 phrase-continuation eval
by LoRA fine-tuning `qwen2.5:7b` on the 20 paired REMI continuation examples in the train
split of `datasets/jam-actions-v0/`.

**Status: Phase 1 complete — awaiting Phase 2 authorization.**
Inspect `train.jsonl` samples in `docs/jam-actions-v0-slice9c-local-lora.md` before authorizing.

---

## Model

| Field | Value |
|---|---|
| HuggingFace ID | `Qwen/Qwen2.5-7B-Instruct` |
| Size | 7B parameters |
| Context window | 32 768 tokens |
| Ollama tag (pre-fine-tune) | `qwen2.5:7b` |
| Rationale | Only local model to clear E1 (75%) and near-clear E2 (pair 1 majority-pass at grooveOA=0.810) in Slice 8.5 eval |

---

## Technique: QLoRA

4-bit quantized base model (`nf4` BitsAndBytes) + LoRA adapters on attention and MLP
projection layers. No full fine-tune — the base model weights are frozen.

| Parameter | Value | Rationale |
|---|---|---|
| LoRA rank | 16 | Conservative for 20-example dataset; increase to 32 if training loss plateaus |
| LoRA alpha | 32 | 2x rank — standard balanced scaling |
| Target modules | q_proj, k_proj, v_proj, o_proj, gate_proj, up_proj, down_proj | Full qwen2.5 attention + MLP — needed for groove pattern learning |
| LoRA dropout | 0.05 | Small regularization for tiny dataset |
| Quantization | 4-bit nf4, double-quant, fp16 compute | Fits in 16 GB VRAM |

**Estimated VRAM:** ~8-10 GB at 4-bit quantization. RTX 5080 (16 GB) has comfortable headroom.

**Estimated training time:** ~20-40 minutes for 5 epochs on 18 examples (batch size 1,
gradient accum 4 = effective batch 4). Wall time estimate based on ~30s/epoch for a 7B
4-bit model on an RTX 5080 with short sequences (median ~200 REMI tokens).

---

## Training stack

**Choice: HuggingFace TRL `SFTTrainer` (raw HF stack)**

Rationale: LLaMA-Factory is a strong alternative but requires a separate install + YAML config
workflow and has less predictable behavior on Windows with PowerShell paths. The raw HF
stack (transformers + peft + trl + bitsandbytes) is battle-tested for QLoRA SFT, has explicit
Python API control, and integrates directly with the `train_lora.py` script without an
additional CLI layer.

| Library | Version floor |
|---|---|
| Python | 3.10+ (3.13 installed) |
| torch | 2.3.0 (CUDA 12.1 wheel) |
| transformers | 4.45.0 |
| peft | 0.12.0 |
| trl | 0.9.0 |
| bitsandbytes | 0.43.0 |
| accelerate | 0.31.0 |
| datasets | 2.20.0 |

---

## Data split

| Split | Examples | Records |
|---|---|---|
| Train | 18 | Pairs 0-17 (Bach, Chopin, Debussy, Fur Elise, Mozart, Pathetique, Satie, Schumann mm.1-4) |
| Validation | 2 | Pairs 18-19 (Schumann Traumerei mm.9-12, mm.17-20) |
| Test (held out) | N/A | clair-de-lune — NEVER loaded by this script |

**Validation rationale:** Schumann Traumerei pairs 2-3 are stylistically similar to pair 1 but
cover different phrase positions. They provide a clean val loss signal without splitting across
composers. Two examples is the minimum meaningful validation set for a 20-example corpus.

**Hard rule:** clair-de-lune records (`clair-de-lune:*`) are asserted absent from `train.jsonl`
at script startup. The assertion raises `RuntimeError` and aborts if violated.

---

## Training data shape

Each of the 20 lines in `train.jsonl` is:

```json
{"messages": [
  {"role": "system",    "content": "<E2 system prompt — exact Slice 9d hardened version>"},
  {"role": "user",      "content": "<Composer/key/tempo/time-sig metadata + prompt-half REMI tokens>"},
  {"role": "assistant", "content": "<JSON: {tokens_remi: [...], tokens_abc: '...'} for gold continuation>"}
], "_meta": {...}}
```

The `_meta` field is stripped before feeding to the HuggingFace dataset. It is for human
inspection only.

**Shape alignment:** the system prompt is byte-identical to `E2_SYSTEM_TEXT` in
`src/dataset/eval/llm-runner.ts`. The user message mirrors `buildE2UserPrompt()` exactly.
The assistant message matches the `E2_OUTPUT_SCHEMA` structure. This guarantees that
inference at eval time uses the same prompt structure as training.

---

## Hyperparameters

| Parameter | Value |
|---|---|
| Epochs (max) | 5 |
| Learning rate | 1e-4 |
| Batch size (effective) | 4 (per-device=1, grad_accum=4) |
| Optimizer | paged_adamw_32bit |
| LR scheduler | cosine |
| Warmup ratio | 0.03 |
| Max grad norm | 0.3 |
| fp16 | True |
| Max sequence length | 4096 |
| Packing | False |

**Why conservative hyperparameters:**
- 18 training examples is an extremely small dataset
- Overfitting risk is high: 5 epochs at lr=1e-4 is the safe starting point
- Validation loss on 2 Schumann pairs is an early-stopping signal — if val loss
  diverges before train epoch 5, stop early

---

## Commands

### Phase 1: Regenerate train.jsonl

```bash
python experiments/jam-actions-v0-lora/generate_train_jsonl.py
```

Assertions run automatically. All 20 examples include:
- No clair-de-lune records
- Valid REMI tokens (Bar_ + Pitch_ present)
- Valid JSON assistant response

### Phase 2 (after authorization): Install environment

```bash
# CUDA 12.1 build (adjust for your CUDA version)
pip install torch>=2.3.0 --index-url https://download.pytorch.org/whl/cu121
pip install transformers>=4.45.0 peft>=0.12.0 trl>=0.9.0 bitsandbytes>=0.43.0
pip install accelerate>=0.31.0 datasets>=2.20.0
```

### Phase 2: Verify environment (dry run)

```bash
python experiments/jam-actions-v0-lora/train_lora.py --dry-run
```

Loads data + model config, prints plan, exits without training or model download.

### Phase 2: Run training

```bash
python experiments/jam-actions-v0-lora/train_lora.py
```

Saves adapter to `experiments/jam-actions-v0-lora/adapter-v1/`.
Writes `training-receipt.json` with full hyperparams, loss curve, wall time, GPU peak.

### Phase 2: Eval on test set

After training + Ollama Modelfile conversion:

```bash
pnpm exec tsx scripts/run-llm-eval.ts --backend ollama --model qwen2.5-7b-jam-lora
```

---

## Groove diversity assessment

The 20 continuation targets span 9 composers / styles with measurably different groove patterns:

| Style | Time sig | Groove pattern |
|---|---|---|
| Bach (2 pairs) | 4/4 | Strict 16-position arpeggiated pattern (positions 0,6,12,...,90) |
| Chopin nocturne (3 pairs) | 4/4 | Dense syncopated (25-35 unique onset positions per phrase) |
| Chopin prelude (2 pairs) | 4/4 | Irregular inner-voice counterpoint (27-32 onset positions) |
| Debussy arabesque (2 pairs) | 4/4 | Sparse flowing (10-16 onset positions) |
| Fur Elise (1 pair) | 3/8 | Simple 6-position triplet pattern |
| Mozart (2 pairs) | 4/4 | Scale-driven 15-18 onset positions |
| Pathetique (2 pairs) | 4/4 | Dense LH with sparse RH melody (20-25 onset positions) |
| Satie (3 pairs) | 3/4 | Minimal waltz, exactly 3 onset positions (0, 24, 48) |
| Schumann (3 pairs) | 4/4 | Romantic dense counterpoint (26-32 onset positions) |

**FM-5 targeting verdict:** the dataset has substantial groove diversity. Satie (3 onset positions)
vs Chopin nocturne (35 onset positions) represents a ~10x density difference. The model
must learn to distinguish groove patterns, not just emit generic REMI structure. This is
sufficient signal to train against FM-5.

---

## Reproducibility receipt template

`training-receipt.json` is written by `train_lora.py` after training. It contains:

```json
{
  "schema": "training-receipt/1.0.0",
  "generated_at": "<ISO-8601 UTC>",
  "model": "Qwen/Qwen2.5-7B-Instruct",
  "technique": "QLoRA-4bit",
  "lora_config": { "r": 16, "lora_alpha": 32, ... },
  "train_args": { "num_train_epochs": 5, "learning_rate": 1e-4, ... },
  "data": {
    "train_jsonl": "experiments/jam-actions-v0-lora/train.jsonl",
    "train_examples": 18,
    "val_examples": 2,
    "val_song": "schumann-traumerei",
    "test_set": "clair-de-lune (held out - never loaded by this script)"
  },
  "training": {
    "loss_curve": [ ... ],
    "wall_time_seconds": 0,
    "gpu_peak_memory_gb": null
  },
  "git_sha": "<repo HEAD at training time>",
  "adapter_path": "experiments/jam-actions-v0-lora/adapter-v1"
}
```

---

## Test set discipline

- The locked test set (`clair-de-lune`, 4 records, 2 pairs) is NEVER loaded by `train_lora.py`
- E2 eval against the test set runs ONLY via the existing `scripts/run-llm-eval.ts` harness
- The fine-tuned model's E2 score is compared against the locked threshold: grooveOA >= 0.797
  on BOTH pairs (majority-pass), same as the pre-fine-tune eval
- No threshold relaxation is permitted

---

## Files in this directory

| File | Purpose |
|---|---|
| `README.md` | This file — training plan + reproducibility receipt template |
| `train.jsonl` | SFT-ready chat-format examples (20 lines, no clair-de-lune) |
| `generate_train_jsonl.py` | Script that builds train.jsonl from corpus records with assertions |
| `train_lora.py` | Training script scaffold (Phase 2 only — do not run in Phase 1) |
| `adapter-v1/` | Created by train_lora.py (Phase 2) — LoRA adapter weights + tokenizer |
| `training-receipt.json` | Created by train_lora.py (Phase 2) — hyperparams + loss curve |
