# Acoustic SFT (setup only — no run)

Corpus: `datasets/jam-actions-acoustic-v0/` (108 records, phrase-held-out Für Elise).

## Command that would start training

```
pnpm exec tsx experiments/acoustic-sft/train.ts
```

Today that command **refuses to download** and **does not take a gradient step**. It sets `HF_HOME` to `E:/AI-Models/hf-cache` (studio convention), turns on hub offline flags, and exits if the cache directory is missing.

After the operator has placed `Qwen/Qwen2.5-3B-Instruct` in that cache and installed the stack below, the same entry is where the Trainer loop belongs.

Format data:

```
pnpm exec tsx experiments/acoustic-sft/format-sft.ts
```

Eval (trivial baselines always; model scores only with prediction files):

```
pnpm exec tsx experiments/acoustic-sft/eval.ts
pnpm exec tsx experiments/acoustic-sft/eval.ts --predictions lora.jsonl --base-predictions base.jsonl
```

## Dependencies (not installed)

| package | licence | why |
|---|---|---|
| `torch` | BSD-style | tensors / CUDA |
| `transformers` | Apache-2.0 | Qwen2.5 load + tokenizer |
| `peft` | Apache-2.0 | LoRA |
| `trl` | Apache-2.0 | SFTTrainer |
| `accelerate` | Apache-2.0 | device placement |

Installing them is an operator decision. This chunk does not run `pip` or `pnpm add`.
