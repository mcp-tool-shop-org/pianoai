# Handoff 55 — Grok Build to Claude: the 7B gap is rendering, not decoding

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 54.** Branch `main`. I did **not** run the full suite. Did not touch
`docs/hf-cards/**`, `datasets/**`, `songs/**`, or `docs/ollama-adapters.md`.
**No publish. No workflow dispatch.** J29 is yours.

Code commit is the one this file lands in (id below after `git log -1`).

---

## O1 — byte-diff, three probe bands

Bands (solace, polarity `p`): `onset_in`, `onset_out`, `cents_out`.
Ids: `acoustic-probe:solace:onset_in:p`, `…:onset_out:p`, `…:cents_out:p`.

**HF path.** `.venv-gguf` Python 3.12, `Qwen/Qwen2.5-7B-Instruct` tokenizer,
same as `predict_v1.py`: `to_template_messages`, drop last assistant,
`apply_chat_template(..., tools=tools, tokenize=False, add_generation_prompt=True)`.
Script: `experiments/coverage-v1-sft/scripts/render_hf_prompt.py`.

**Ollama path.** 0.33.3 ignores `debug_render_only` on `/api/chat` (it generates).
`OLLAMA_DEBUG=1` does not log the rendered body. What worked: restart
`ollama serve` with `LLAMA_SERVER_SLOTS_DEBUG=1` (inherited by llama-server),
send the **same** `/api/chat` body `ollama-grade.mjs` sends (`num_predict: 1`),
then `GET http://127.0.0.1:<llama-server-port>/slots` and read `.prompt`.
Helper: `experiments/coverage-v1-sft/scripts/dump_ollama_slots.mjs`.
Captured on `qwen2.5:7b-instruct` (same Go TEMPLATE as the fp16/q8 graders).

| id | HF chars / HF tok | Ollama chars / prompt_eval_count |
|---|---|---|
| onset_in:p | 48087 / 13120 | 38136 / **9248** |
| onset_out:p | 48087 / 13120 | 38136 / **9248** |
| cents_out:p | 48086 / 13119 | 38135 / **9247** |

Shared prefix is identical through the tools header. **First difference at
byte offset 359** on all three:

HF:

```
{"type": "function", "function": {"name": "add_section", "description": "Add a structural section marker…
```

Ollama (`{{ .Function }}` is Go's default struct print, not `json.Marshal`):

```
{"type": "function", "function": {add_section Add a structural section marker to a song. … {object <nil> <nil> [id name startMeasure endMeasure] {"description":{…},…}}}
```

### Classes of difference

1. **Tool catalogue JSON vs Go-fmt dump.** HF emits JSON objects (`"name"`,
   `"description"`, `"parameters"`). Ollama's TEMPLATE does
   `{"type": "function", "function": {{ .Function }}}` and `.Function` has no
   `String()`/`json`, so 54 tools print as `{name desc {type <nil> <nil> [required] map}}`.
2. **Assistant `tool_calls` dropped when `content` is set.** TEMPLATE:
   `{{ if .Content }}{{ .Content }}{{- else if .ToolCalls }}`. The gold-stripped
   assistant turn is `Transcribing, then scoring…` **plus** two tool_calls.
   HF keeps both `<tool_call>` blocks. Ollama prints only the sentence.
3. **Tool results split.** HF: one `<|im_start|>user` with two `<tool_response>`
   blocks. Ollama: two separate user turns, one `<tool_response>` each.
4. **Token cost.** ~3870 tokens (13120 vs 9248) — catalogue JSON + the two
   missing tool_call blocks.

Role tags, jam system text, and the `# Tools` / `<tools>` wrapper **match**
through offset 359. Modelfile `SYSTEM You are Qwen…` is **not** prepended when
the request already has a system turn.

---

## O2 — decoding parity (`--options`)

`ollama-grade.mjs` takes repeatable `--options k=v` (comma-separated also).
Pinned: `repeat_penalty=1.0`, `top_k=0`, `top_p=1.0`, `num_ctx=16384`.
Longest HF prompt on the 1.0.0 test is `chord:the-entertainer:m11` at **13287**
tokens; 16384 covers that plus 128.

```
node experiments/coverage-v1-sft/scripts/ollama-grade.mjs \
  experiments/coverage-v1-sft/data-probe/sft-test.jsonl ai-jam-grader-7b-fp16 \
  --out …/preds-fp16-greedy-probe.jsonl \
  --options repeat_penalty=1.0 --options top_k=0 --options top_p=1.0 --options num_ctx=16384
```

Same for `data/sft-test.jsonl`. Model `ai-jam-grader-7b-fp16`. `ollama stop`
of the Q4 instruct tag first.

| | acoustic 17 | overall 40 | probe 24 | VRAM | gen tok/s |
|---|---|---|---|---|---|
| fp16, Ollama render, **greedy pins** | 11/17 | 31/40 | **21/24** | 16830 MiB (15 GB, ctx 16384) | 63 then 78 |

Identical to the published fp16 row (default decode). **Decoding is not the
residual gap.** Probe still 21/24; held-out acoustic still 11/17.

---

## O3 — `--raw` HF template through `/api/generate`

O1 found a rendering difference, so `--raw` is in `ollama-grade.mjs`. It
spawns `render_hf_prompt.py` once per file (venv tokenizer), then
`POST /api/generate` with `raw: true` and the same pinned options.

```
node …/ollama-grade.mjs <sft-test.jsonl> <model> --out preds.jsonl --raw \
  --options repeat_penalty=1.0 --options top_k=0 --options top_p=1.0 --options num_ctx=16384
```

One model at a time. fp16 first (still loaded after O2), then
`ollama stop ai-jam-grader-7b-fp16`, then `ai-jam-grader-7b-q8`.

| | acoustic 17 | overall 40 | probe 24 | VRAM | gen tok/s |
|---|---|---|---|---|---|
| fp16, **HF raw**, greedy | **17/17** | **39/40** | **24/24** | 16763 MiB | 76 |
| q8_0, **HF raw**, greedy | **17/17** | **38/40** | **24/24** | 10285 MiB (8.8 GB) | 107–108 |

fp16 raw families on the 40: acoustic 17/17, chord 3/3, ensemble 3/3,
harmony **6/6**, key_moments 1/2, measures 3/3, teaching_goals 3/3,
transpose 3/3. q8_0 raw: same except harmony **5/6** (the bf16 miss).

---

## O4 — four cells beside bf16

Rendering × decoding, 7B seed-42. Default-decode fp16 numbers are the
measured row from `docs/ollama-adapters.md` (this chunk's O2 reproduced them).

| condition | acoustic (17) | overall (40) | probe (24) |
|---|---|---|---|
| bf16, PEFT (`predict_v1.py`) | 17/17 | 38/40 | 24/24 |
| Ollama template, default decode, fp16 | 11/17 | 31/40 | 21/24 |
| Ollama template, greedy pins, fp16 (O2) | 11/17 | 31/40 | 21/24 |
| **HF template, greedy pins, fp16 (O3)** | **17/17** | **39/40** | **24/24** |
| HF template, greedy pins, q8_0 (O3) | 17/17 | 38/40 | 24/24 |

**Claim.** With the same rendering (HF `apply_chat_template`) and greedy
decoding, fp16 in Ollama **equals** bf16 in PEFT on the probe (24/24) and
on held-out acoustic (17/17). Overall 39/40 vs 38/40 (harmony 6/6 vs 5/6;
the remaining miss is `key_moments` 1/2, as at bf16). q8_0 under HF+greedy
is byte-for-byte the bf16 family table (38/40). The three fp16 probe misses
were the serving path, not the weights.

---

## Scripts / commit

- `experiments/coverage-v1-sft/scripts/ollama-grade.mjs` — `--options`, `--raw`,
  `--python`, `--hf-model`
- `experiments/coverage-v1-sft/scripts/render_hf_prompt.py` — HF renderer used by `--raw`
- `experiments/coverage-v1-sft/scripts/dump_ollama_slots.mjs` — O1 capture

Preds under `experiments/coverage-v1-sft/dist/ollama/` (gitignored). Did not
commit leftover `runs/`.
