# Running the jam-actions-v1 adapters in Ollama

The adapters are LoRAs that teach a Qwen2.5 Instruct model to grade a recorded take the way the
server does: read the tool result, write the subtraction against the gate, then the label.

> `cents 66.9: |66.9| − 50 = 16.9, against the gate; onset −9.8: |9.8| − 40 = −30.2, inside: pitch_fail`

The server itself never calls them; its grading is deterministic. They exist for anyone who wants a
small model that reasons over the server's tool output, and for the record of how such a model was
found (`experiments/coverage-v1-sft/RESULTS-r48.md`). This page is the measured path to running
one locally in Ollama, with the numbers that path costs.

## Which adapter

| repo on Hugging Face | base | base licence | use |
|---|---|---|---|
| `mcp-tool-shop/jam-actions-v1-qwen25-7b` (`7b-s13/`, `7b-s42/`) | Qwen2.5-7B-Instruct | **Apache-2.0** | the publish-friendly path |
| `mcp-tool-shop/jam-actions-v1-qwen3-4b` (`qwen3-4b-s13/`, `qwen3-4b-s42/`) | Qwen3-4B-Instruct-2507 | **Apache-2.0** | the small path (same numbers as the 3B below) |
| `mcp-tool-shop/jam-actions-v1-qwen25-1.5b` (`qwen25-1.5b-s13/`, `qwen25-1.5b-s42/`) | Qwen2.5-1.5B-Instruct | **Apache-2.0** | the tiny option; acoustic comparison only |
| `mcp-tool-shop/jam-actions-v1-qwen25-3b` (`3b-4d-s13/`, `3b-4d-s42/`) | Qwen2.5-3B-Instruct | Qwen Research, **non-commercial** | the finding's record; measured, not recommended for anything you ship |

Every adapter is CC-BY-SA-3.0-DE, like the dataset. Use of a merged or adapted model is also
governed by the base's licence, and that is the column that decides what you may do with it. The Qwen3-4B and 1.5B rows
are the Apache-2.0 answer to the 3B's licence (`experiments/coverage-v1-sft/RESULTS-r52.md`); the
Ollama measurements below were made before they existed and cover the 7B and 3B only.

## Convert the adapter to GGUF

Ollama loads a LoRA from a GGUF file over a GGUF base. The conversion needs `llama.cpp`'s
`convert_lora_to_gguf.py` and a Python 3.12 environment with `gguf`, `torch`, `transformers`,
`huggingface_hub` and `safetensors` (the script imports all five at load; CPU torch is enough).
Measured 2026-09-09 with llama.cpp at the head of that week and `gguf` 0.19.0:

```bash
# from the llama.cpp checkout (the script imports its own conversion package)
python convert_lora_to_gguf.py \
  --base-model-id Qwen/Qwen2.5-7B-Instruct \
  --outtype f16 \
  --outfile ./7b-s42/adapter.gguf \
  /path/to/jam-actions-v1-qwen25-7b/7b-s42
```

`--base-model-id` is enough: the script reads the base's `config.json` from the Hub and does not
download weights. The 7B adapter converts to an 80.8 MB file with 392 tensors; the 3B to 59.9 MB
with 504.

## Create the model

Two lines in a `Modelfile` beside the adapter:

```
FROM qwen2.5:7b-instruct
ADAPTER ./adapter.gguf
```

```bash
ollama create ai-jam-grader-7b -f Modelfile
```

`qwen2.5:7b-instruct` in the Ollama library is the Instruct weights at **Q4_K_M**. Read the next
section before relying on that.

## What it measures, and the cost of Q4

`experiments/coverage-v1-sft/scripts/ollama-grade.mjs` sends each held-out example to Ollama's
chat API exactly as the training and prediction scripts render it (system, the tool catalogue, the
tool-result turns; temperature 0; 128 new tokens) and writes predictions that the repository's
scorer reads:

```bash
node experiments/coverage-v1-sft/scripts/ollama-grade.mjs experiments/coverage-v1-sft/data-probe/sft-test.jsonl ai-jam-grader-7b --out preds.jsonl
node experiments/coverage-v1-sft/scripts/score_v1.mjs experiments/coverage-v1-sft/data-probe/gold-test.jsonl ollama=preds.jsonl
```

Measured on an RTX 5090, one model loaded at a time, `ollama stop` between:

| condition | held-out acoustic (17) | overall (40) | near-gate probe (24) | VRAM | gen tok/s |
|---|---|---|---|---|---|
| 7B seed 42, bf16 (the published numbers) | 17/17 | 38/40 | 24/24 | — | — |
| 7B seed 42, Ollama Q4_K_M base + F16 LoRA | **4/17** | 21/40 | **6/24** | 8.8 GB | 142 |
| 7B seed 42, Ollama **q8_0** base + F16 LoRA | 12/17 | 34/40 | 21/24 | 11.8 GB | 112 |
| 7B seed 42, Ollama **fp16** base + F16 LoRA | 11/17 | 31/40 | 21/24 | 18.1 GB | 79 |
| 3B four-draw seed 42, bf16 | 17/17 | 37/40 | 24/24 | — | — |
| 3B four-draw seed 42, Ollama Q4_K_M base + F16 LoRA | 15/17 | 33/40 | 19/24 | 5.7 GB | 168–178 |

The reading is not subtle. A LoRA trained against bf16 weights and applied over a 4-bit base is a
different model, and for the 7B it is not the model that was published: it keeps writing after the
label, invents colons, and the scorer takes the wrong tail. The 3B over Q4 keeps most of its
behaviour. The families that need no arithmetic (measures, transpose, teaching goals) are unharmed
in both.

So, as of this measurement:

- Do not present the 7B over `qwen2.5:7b-instruct` (Q4_K_M) as the published adapter. It is not.
- Use `qwen2.5:7b-instruct-q8_0` if you run the 7B in Ollama: it recovers most of the collapse
  (21/24 near the gate) and beats fp16 at half the memory.
- The residual gap is not quantisation. fp16 is the precision the adapter was trained against and
  still misses 3 of 24 near the gate and 6 of 17 held out, with the label failing to follow the
  model's own digits on 3 of 23 parsed lines. What differs is the serving path: how Ollama's
  template renders the tool catalogue and tool-result turns against the Hugging Face chat template
  the adapter saw in training. That comparison is the next measurement; until it is made, the bf16
  numbers belong to the PEFT runtime only.
- The bf16 numbers are reproducible with the PEFT runtime the experiment used
  (`experiments/coverage-v1-sft/scripts/predict_v1.py`) on a GPU with room for the base in bf16.

## In compose

`docker compose --profile ollama up` starts an Ollama sidecar beside the server (see
[docker.md](docker.md)). Create the model inside it the same way, with the adapter directory
mounted or copied in; the server does not call it, so what you do with it from there is your own
client's business.
