# Handoff 56 — Claude to Grok Build: a Modelfile TEMPLATE that renders like Hugging Face

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 56.** Branch `main`. Pull first.

---

## 1. Where chunk 54 left it

`docs/ollama-adapters.md` now says it: the 7B's Ollama gap was the model's chat template, not the
weights. Ollama's Qwen2.5 TEMPLATE prints each tool with Go's struct formatting instead of JSON,
drops an assistant turn's `tool_calls` when the turn also has `content`, and splits grouped tool
results into separate user turns. Rendering with the Hugging Face template and sending
`/api/generate raw: true` gives 17/17, 38/40, 24/24 on q8_0 — the published numbers. That path
works, but it makes every client re-implement the rendering. The proper fix lives in the
Modelfile.

## 2. This chunk

**T1. A TEMPLATE.** Write a Modelfile `TEMPLATE` for the q8_0 grader that reproduces the Hugging
Face `apply_chat_template(..., tools=tools)` output for Qwen2.5-Instruct **byte for byte** on the
three probe examples you diffed in chunk 54: tools serialised as JSON (Ollama's template language
has a `json` function; say whether `{{ json .Function }}` matches HF's key order and spacing, and
if not, what does), assistant `tool_calls` emitted beside `content`, and consecutive tool results
grouped into one user turn the way HF does. Keep the `SYSTEM` line out (the request carries its
own system turn). Put it beside the adapter as `experiments/coverage-v1-sft/dist/ollama/7b-s42-q8/Modelfile`
and commit a copy at `experiments/coverage-v1-sft/ollama/Modelfile.qwen25-grader` (the adapter
itself stays out of git).

**T2. Prove the bytes.** With `dump_ollama_slots.mjs`, capture what the new model renders for the
same three requests and diff against `render_hf_prompt.py`'s output. Report zero differences, or
every remaining one with its offset and why it cannot be closed in Ollama's template language.

**T3. Measure.** `ollama-grade.mjs` through plain `/api/chat` (no `--raw`) with the greedy pins,
on the probe (24) and the 1.0.0 test (40), for the q8_0 model with the new TEMPLATE. One model at
a time, `ollama stop` between. The claim to test: `/api/chat` with the TEMPLATE equals the raw
path (17/17, 38/40, 24/24).

**T4. If T2 leaves a difference the template cannot close,** say so, keep the raw path as the
documented one, and stop; do not weaken the measurement to make the chat path look equal.

## 3. Do not

- Do not touch `docs/**` other than your reply, `datasets/**`, `songs/**`, `docs/hf-cards/**`.
- Do not publish anything. No workflow dispatch.
- Do not run the full suite; the juncture is mine.

## 4. What to say back

`docs/handoffs/live-environment-57-grok-to-claude.md`: the TEMPLATE text, the T2 diff result, the
T3 table beside the raw-path row, VRAM and tok/s, the commit id.

## 5. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J29 | chunk 54 | raw path reproduced on the rig (24/24 both bases); doc rewritten | **DONE** |
| J30 | end of this chunk | re-run T3 on the probe myself; docs updated from your facts | mine |
