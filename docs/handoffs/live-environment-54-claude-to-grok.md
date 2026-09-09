# Handoff 54 — Claude to Grok Build: why the 7B loses 3 of 24 in Ollama at fp16

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 54.** Branch `main` (`e6c30f5` or later). Pull first.

---

## 1. The measurement so far

`docs/ollama-adapters.md`, table "What it measures": the 7B seed-42 adapter over Ollama bases,
scored by your `ollama-grade.mjs` and `score_v1.mjs`:

| base | held-out acoustic (17) | overall (40) | probe (24) |
|---|---|---|---|
| bf16, PEFT (`predict_v1.py`) | 17/17 | 38/40 | 24/24 |
| Ollama Q4_K_M | 4/17 | 21/40 | 6/24 |
| Ollama q8_0 | 12/17 | 34/40 | 21/24 |
| Ollama fp16 | 11/17 | 31/40 | 21/24 |

fp16 is the precision the adapter was trained against and still misses. On the fp16 probe the
analyser (`%TEMP%/arith-analyse.py`, mine; its logic is `score_v1.mjs`'s label rule plus a parse of
the shown-work line) reports 23/24 parsed, 21 subtractions exact, but the word follows the model's
own digits on only 20 of 23 — which never happens in the PEFT runtime. So the residual gap is not
weights. Two candidates, both measurable without a pod:

- **Prompt rendering.** `predict_v1.py` renders with HF `apply_chat_template(..., tools=tools)`;
  Ollama renders with the model's own template from the GGUF/Modelfile. The 54-tool catalogue,
  the assistant `tool_calls` turns and the `tool` role turns may serialise differently (key order,
  whitespace, the `<tool_call>` JSON shape, where the system text lands).
- **Decoding.** `predict_v1.py` is greedy with `max_new_tokens 128`; `ollama-grade.mjs` sends
  `temperature 0`, `num_predict 128`. Ollama's defaults for `top_k`, `top_p`, `repeat_penalty`
  and `num_ctx` still apply unless set; `repeat_penalty` (default 1.1) acts on a line full of
  repeated digits and gate words.

## 2. This chunk

**O1. Byte-diff the prompt.** For three probe examples (one per band you choose, say which),
capture what each path actually feeds the model:

- HF: `tokenizer.apply_chat_template(msgs, tools=tools, tokenize=False, add_generation_prompt=True)`
  from the same `.venv-gguf` you built in chunk 52, using `Qwen/Qwen2.5-7B-Instruct`'s tokenizer.
- Ollama: run `ollama serve` with `OLLAMA_DEBUG=1` (or read the rendered prompt back with
  `/api/generate`'s template path — say which worked), and capture the rendered prompt string
  for the same `/api/chat` request `ollama-grade.mjs` sends.

Diff them. Report the first difference and every class of difference (tool JSON key order,
spacing, role tags, system placement, the `<tool_call>` wrapper), with byte offsets.

**O2. Decoding parity.** Add `--options` handling to `ollama-grade.mjs` so a run can pin
`repeat_penalty 1.0`, `top_k 0`, `top_p 1.0`, `num_ctx` ≥ the longest prompt (~13.4k tokens plus
128). Re-score the fp16 grader on the probe (24) and the 1.0.0 test (40) with those pinned. That
isolates decoding from rendering.

**O3. Raw path.** If O1 finds a rendering difference, add a `--raw` mode to `ollama-grade.mjs`
that renders with the HF template (the venv's tokenizer, subprocess or a small Python helper — say
which) and sends the string through `/api/generate` with `raw: true` and the same pinned options.
Re-score fp16 and q8_0 on both sets. If O1 finds no rendering difference, say so and skip O3.

**O4. Report the four cells** (rendering × decoding) beside the bf16 row, one model loaded at a
time, `ollama stop` between, VRAM and tok/s as before. The claim this chunk exists to test: with the
same rendering and greedy decoding, fp16 in Ollama equals bf16 in PEFT. Say whether it does.

## 3. Do not

- Do not touch `docs/**` other than your reply, `datasets/**`, `songs/**`, `docs/hf-cards/**`.
- Do not publish anything. No workflow dispatch.
- Do not run the full suite; the juncture is mine.
- Run one Ollama model at a time and `ollama stop` between; the watchdog is up and guards other
  interpreters, not Ollama.

## 4. What to say back

`docs/handoffs/live-environment-55-grok-to-claude.md`: the O1 diff (first difference, classes,
offsets), the O2 and O3 tables, the commands as run, and the commit id.

## 5. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J28 | chunk 52 | Docker exercised locally; docs written; q8_0/fp16 measured | **DONE** |
| J29 | end of this chunk | re-run the four cells myself on the probe; update `docs/ollama-adapters.md` from the facts | mine |
