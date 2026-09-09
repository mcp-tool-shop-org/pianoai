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
FROM qwen2.5:7b-instruct-q8_0
ADAPTER ./adapter.gguf
```

```bash
ollama create ai-jam-grader-7b-q8 -f Modelfile
```

`qwen2.5:7b-instruct` without a suffix is the Instruct weights at **Q4_K_M**; the measurements
below say why the q8_0 tag is the one to use, and why the model's own chat template is not.

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
| 7B seed 42, fp16, greedy pins, Ollama template | 11/17 | 31/40 | 21/24 | 16.8 GB | 78 |
| **7B seed 42, fp16, greedy, HF template (`--raw`)** | **17/17** | **39/40** | **24/24** | 16.8 GB | 76 |
| **7B seed 42, q8_0, greedy, HF template (`--raw`)** | **17/17** | **38/40** | **24/24** | 10.3 GB | 107 |
| 3B four-draw seed 42, bf16 | 17/17 | 37/40 | 24/24 | — | — |
| 3B four-draw seed 42, Ollama Q4_K_M base + F16 LoRA | 15/17 | 33/40 | 19/24 | 5.7 GB | 168–178 |

The reading is not subtle. A LoRA trained against bf16 weights and applied over a 4-bit base is a
different model, and for the 7B it is not the model that was published: it keeps writing after the
label, invents colons, and the scorer takes the wrong tail. The 3B over Q4 keeps most of its
behaviour. The families that need no arithmetic (measures, transpose, teaching goals) are unharmed
in both.

## The gap was the template, not the weights

A byte-diff of what each path feeds the model (chunk 54, `docs/handoffs/live-environment-55-grok-to-claude.md`)
found the first difference at byte 359 of a 48,000-character prompt, and three classes of it:

1. Ollama's Qwen2.5 template prints each tool with Go's default struct formatting instead of JSON,
   so the 54-tool catalogue the adapter was trained on arrives as `{add_section Add a structural … {object <nil> …}}`.
2. The template drops an assistant turn's `tool_calls` whenever that turn also has `content`; the
   grading trace's assistant turn has both, so the two `<tool_call>` blocks never reach the model.
3. Two tool results in one user turn become two user turns.

The prompt loses about 3,900 tokens of what the adapter learned to read. Pinning greedy decoding
(`repeat_penalty 1.0`, `top_k 0`, `top_p 1.0`, `num_ctx 16384`) changes nothing; rendering the
prompt with the Hugging Face chat template and sending it through `/api/generate` with `raw: true`
recovers everything. `ollama-grade.mjs --raw` does exactly that (it calls
`scripts/render_hf_prompt.py` with the base's tokenizer), and with it:

- **q8_0 under the HF template is the published adapter**: 17/17, 38/40, 24/24, the bf16 family
  table byte for byte, at 10 GB and 107 tokens a second.
- fp16 under the HF template is 17/17, 39/40, 24/24.
- Q4_K_M was never re-measured under the HF template; the base is still the cheaper of the two
  effects, and q8_0 costs 2 GB more than Q4 for the numbers above.

So, as of this measurement:

- Run the 7B over `qwen2.5:7b-instruct-q8_0`, and send it prompts rendered with the Hugging Face
  template (`ollama-grade.mjs --raw`, or your own client doing the same through `/api/generate`
  with `raw: true`). Plain `/api/chat` through the library template is not the published adapter.
- A Modelfile `TEMPLATE` was tried (`experiments/coverage-v1-sft/ollama/Modelfile.qwen25-grader`).
  It closes the control-flow defects: tools rendered through `json`, `tool_calls` kept beside
  content, grouped tool results byte-identical to the training render. It cannot close the
  catalogue's serialisation: Go's `json` is compact with sorted keys and Ollama's tool objects drop
  `$schema`, `minLength` and `maxLength`, while the training render is Python `json.dumps` with
  spaces and insertion order. The model notices: `/api/chat` with that template and greedy pins
  scores 22/24 near the gate and 16/17, 37/40 held out against the raw path's 24/24, 17/17, 38/40
  (measured twice, by two people). So the raw path stays the documented one, and the template is
  in the repo as the closest `/api/chat` gets on Ollama 0.33.
- The bf16 numbers are reproducible with the PEFT runtime the experiment used
  (`experiments/coverage-v1-sft/scripts/predict_v1.py`) on a GPU with room for the base in bf16.

## In compose

`docker compose --profile ollama up` starts an Ollama sidecar beside the server (see
[docker.md](docker.md)). Create the model inside it the same way, with the adapter directory
mounted or copied in; the server does not call it, so what you do with it from there is your own
client's business.
