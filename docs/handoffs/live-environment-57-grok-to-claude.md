# Handoff 57 — Grok Build to Claude: TEMPLATE closes the control-flow gap, not the JSON bytes

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 56.** Branch `main`. I did **not** run the full suite. Did not touch
`docs/hf-cards/**`, `datasets/**`, `songs/**`, or `docs/ollama-adapters.md`.
**No publish. No workflow dispatch.** J30 is yours.

---

## T1 — TEMPLATE

Committed: `experiments/coverage-v1-sft/ollama/Modelfile.qwen25-grader`
Also copied beside the adapter at
`experiments/coverage-v1-sft/dist/ollama/7b-s42-q8/Modelfile` (gitignored).
`ollama create ai-jam-grader-7b-q8 -f Modelfile` from that directory: success
(new template layer). No `SYSTEM` line.

`{{ json . }}` on each tool (the whole tool, matching HF `tool | tojson`) is
Go `encoding/json.Marshal`: compact, no spaces after `:` / `,`, map keys
sorted. `{{ json .Function }}` would drop the wrapping `"type":"function"`
object and is worse. Neither matches HF jinja `tojson` (Python `json.dumps`:
`": "`, `", "`, insertion-order keys). That cannot be closed in Ollama's
template language.

```
TEMPLATE """{{- if .Messages }}
{{- if .Tools }}<|im_start|>system
{{ .System }}

# Tools

You may call one or more functions to assist with the user query.

You are provided with function signatures within <tools></tools> XML tags:
<tools>{{- range .Tools }}
{{ json . }}{{- end }}
</tools>

For each function call, return a json object with function name and arguments within <tool_call></tool_call> XML tags:
<tool_call>
{"name": <function-name>, "arguments": <args-json-object>}
</tool_call><|im_end|>
{{ else if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}{{- $prevRole := "" }}{{- range $i, $m := .Messages }}{{- if eq $m.Role "system" }}{{- else if or (eq $m.Role "user") (and (eq $m.Role "assistant") (not (gt (len $m.ToolCalls) 0))) }}<|im_start|>{{ $m.Role }}
{{ $m.Content }}<|im_end|>
{{ else if eq $m.Role "assistant" }}<|im_start|>assistant{{ if $m.Content }}
{{ $m.Content }}{{ end }}{{ range $m.ToolCalls }}
<tool_call>
{"name": "{{ .Function.Name }}", "arguments": {{ json .Function.Arguments }}}
</tool_call>{{ end }}<|im_end|>
{{ else if eq $m.Role "tool" }}{{- if ne $prevRole "tool" }}<|im_start|>user{{ end }}
<tool_response>
{{ $m.Content }}
</tool_response>{{- $rest := slice $.Messages $i }}{{- $nextTool := false }}{{- if gt (len $rest) 1 }}{{- $nxt := index $rest 1 }}{{- if eq $nxt.Role "tool" }}{{- $nextTool = true }}{{- end }}{{- end }}{{- if not $nextTool }}<|im_end|>
{{ end }}{{- end }}{{- $prevRole = $m.Role }}{{- end }}{{- $lastRole := "" }}{{- range $m := .Messages }}{{- $lastRole = $m.Role }}{{- end }}{{- if ne $lastRole "assistant" }}<|im_start|>assistant
{{ end }}{{- else }}{{- if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}{{- if .Prompt }}<|im_start|>user
{{ .Prompt }}<|im_end|>
{{ end }}<|im_start|>assistant
{{ end }}"""
```

---

## T2 — bytes

Capture: `dump_ollama_slots.mjs` on `ai-jam-grader-7b-q8` vs `render_hf_prompt.py`,
same three solace `p` bands as chunk 54. `LLAMA_SERVER_SLOTS_DEBUG=1`.

| id | HF chars / tok | Ollama chars / tok | first diff |
|---|---|---|---|
| onset_in:p | 48087 / 13120 | 41230 / 9421 | **offset 333** |
| onset_out:p | 48087 / 13120 | 41230 / 9421 | 333 |
| cents_out:p | 48086 / 13119 | 41229 / 9420 | 333 |

**Closed (the control-flow bugs from chunk 54):** assistant `tool_calls`
emitted beside content (`<tool_call>` count 4=4, `transcribe_audio` present);
consecutive tool results grouped into one user turn (2 user turns, tool-user
block **byte-identical** including both `<tool_response>`s); 54 tools as JSON
objects with `name` / `description` / `parameters`.

**First remaining difference at byte 333** — JSON spacing:

```
HF: {"type": "function", "function": {"name": "add_section", ...
OL: {"type":"function","function":{"name":"add_section",...
```

After stripping `": "` / `", "` the next miss is **offset 578** (compact):
HF `parameters` key order is `type, properties, required, $schema`; Ollama
`type, required, properties` (struct field order; **`$schema` dropped**).
Property keys: HF file order `id, name, startMeasure, endMeasure, description`;
Ollama sorted `description, endMeasure, id, name, startMeasure`. Property
objects lose `minLength` / `maxLength` / `minimum` / `maximum` — Ollama's tool
converter never hands those to the template.

None of those JSON-shape gaps can be closed in the template language:
`json` is `encoding/json.Marshal`, and the extra schema fields never arrive
as template data.

T4 applies: **keep `--raw` as the documented path.** Do not treat `/api/chat`
as equal.

---

## T3 — `/api/chat` greedy pins, q8_0, new TEMPLATE

```
node experiments/coverage-v1-sft/scripts/ollama-grade.mjs \
  <sft-test.jsonl> ai-jam-grader-7b-q8 --out preds.jsonl \
  --options repeat_penalty=1.0 --options top_k=0 --options top_p=1.0 --options num_ctx=16384
```

No `--raw`. Probe then 1.0.0 test. One model. `ollama stop` after.

| condition | acoustic 17 | overall 40 | probe 24 | VRAM | gen tok/s |
|---|---|---|---|---|---|
| q8_0, HF raw, greedy (chunk 54) | 17/17 | 38/40 | 24/24 | 10.3 GB | 107–108 |
| q8_0, **new TEMPLATE, /api/chat**, greedy | **16/17** | **37/40** | **22/24** | 10334–11260 MiB (8.8 GB, ctx 16384) | 110 |
| q8_0, stock TEMPLATE, /api/chat (chunk 52/54 doc) | 12/17 | 34/40 | 21/24 | 11.8 GB | 112 |

The claim "/api/chat with the TEMPLATE equals the raw path (17/17, 38/40, 24/24)"
is **false**. Chat recovered most of the old gap (tool_calls + grouping) but
not the last 1 acoustic / 2 probe, which sit in the JSON that `json` cannot
match. Raw path stays the one that reproduces the published numbers.

Probe 22/24, test families: acoustic 16/17, chord 3/3, ensemble 3/3,
harmony 5/6, key_moments 1/2, measures 3/3, teaching_goals 3/3, transpose 3/3.

---

## Commit

The commit that lands this handoff + `Modelfile.qwen25-grader`. Adapter GGUF
stays out of git.
