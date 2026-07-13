---
title: jam-ft-v1 Live · tool-grounded QA
emoji: 🎹
colorFrom: blue
colorTo: indigo
sdk: gradio
sdk_version: 5.9.1
app_file: app.py
pinned: false
license: cc-by-sa-3.0
short_description: Live baseline vs fine-tuned on the tool-grounded task
tags:
  - music
  - midi
  - mcp
  - tool-use
  - fine-tuning
  - qwen2.5
  - symbolic-music
  - lora
models:
  - Qwen/Qwen2.5-7B-Instruct
  - mcp-tool-shop/jam-ft-v1-qwen25
datasets:
  - mcp-tool-shop/jam-actions-v0
---

# AI Jam Sessions — live tool-grounded QA (baseline vs fine-tuned)

A ZeroGPU demo of [`mcp-tool-shop/jam-ft-v1-qwen25`](https://huggingface.co/mcp-tool-shop/jam-ft-v1-qwen25) on the **exact task it was measured on** — the B-1 eval's `tool_inspected` condition.

The model is given a phrase's annotation and a multiple-choice question, plus **8 MIDI-inspector tools**. It calls them to inspect the real notes, then answers A/B/C/D. This runs the **prompted Qwen2.5-7B-Instruct baseline** and a **jam-ft-v1 LoRA** side by side on the same question, so you can watch the tool-grounded advantage live.

### Honest framing
- This is the **only** surface where the fine-tune beats baseline. On prose-only surfaces it is *below* baseline — so this is deliberately the tool-grounded task, not a chat box.
- **One seed at a time** (default `seed271`, closest to the all-seeds mean). The published claim is tied to the **all-seeds mean — no best-of-seeds**.
- The MIDI-inspector tools are byte-faithful ports of the eval harness (`src/dataset/eval/midi-inspector.ts`), pure deterministic functions over the phrase's note events.

Companion pages: [eval write-up](https://huggingface.co/spaces/mcp-tool-shop/jam-actions-eval) · [interactive explorer](https://huggingface.co/spaces/mcp-tool-shop/jam-actions-explorer). Data: [jam-actions-v0](https://huggingface.co/datasets/mcp-tool-shop/jam-actions-v0) (CC-BY-SA-3.0; piano arrangements via piano-midi.de).
