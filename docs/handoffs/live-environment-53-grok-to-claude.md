# Handoff 53 — Grok Build to Claude: Docker volume + measured Ollama adapters

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 52.** Branch `main` @ `e56795e` (this reply's follow-up commit is the
handoff + the docker-job minute comment). I did **not** run the full suite
locally. Did not touch `docs/hf-cards/**`, `datasets/**`, `songs/**`,
`docs/zenodo/**`. **No publish. No ghcr push.** J28 is yours.

Code commit: **`e56795e85e9ad996b52b6d58baa77e5aa97eafc2`**
(`feat: AI_JAM_HOME state volume, compose, CI docker proof, Ollama grade path`).

---

## K1 — `stateHome()`

`src/state-home.ts`. `AI_JAM_HOME` if set must be absolute; it **is** the state
dir (not a parent of `.ai-jam-sessions`). Created on first use. Default
unchanged: `~/.ai-jam-sessions`. Helpers: `journalDir`, `userSongsDir`,
`serverStatePath`, `guitarVoicesDir`, `pianoVoicesDir`, `fetchedLibraryDir`.

Wired: `src/journal.ts` `getJournalDir()`, `src/mcp-server.ts`
`getUserSongsDir` / `getServerStateFile` (no module-load `STATE_FILE`),
`persistSessionState` mkdirs `stateHome()`, `src/cli.ts` user songs,
`src/guitar-voices.ts`, `src/piano-voices.ts`.

Tests (`pnpm exec vitest run src/state-home.test.ts src/journal.test.ts
src/guitar-voices.test.ts src/piano-voices.test.ts` plus the K2 files):

| test | result |
|---|---|
| defaults to `~/.ai-jam-sessions` when `AI_JAM_HOME` is unset | pass |
| rejects a relative `AI_JAM_HOME` | pass |
| puts journal, server state and user songs under `AI_JAM_HOME` | pass (writes a journal file, `server-state.json`, and `saveSong` into the temp volume) |
| guitar / piano voice tests (HOME isolation, no `AI_JAM_HOME`) | pass (15 + 15) |

`journal.test.ts` `appendJournalEntry` mocks now treat `stateHome()`'s extra
`existsSync` on the home dir; `skips header for existing file` is
`mockReturnValue(true)` rather than two `once`s. Named-file total after that:
**90/90**.

---

## K2 — fetch fallback + loader

`src/songs/fetch.ts`: `packageLibraryWritable` is `accessSync(W_OK)`.
`resolveFetchMidiPath` writes `${stateHome()}/songs/library/<genre>/<id>.mid`
when the package genre dir is not writable, and says so **once** on stderr:
`package library is not writable; fetching MIDI into …`. `fetchOne` mkdirs the
dest and writes there.

`src/songs/library.ts` `resolveLibraryMidiPath`: package `.mid` beside JSON if
it is a file, else the state-home path, else the package path (absent).

Tests:

| test | result |
|---|---|
| writes into stateHome/songs/library when the package library is not writable | pass; stderr printed the fallback line. win32: `chmod 0o555` often leaves the dir writable; the test then points `midiPath` at a missing package dir so `W_OK` fails the same way a read-only image library does |
| loads a ready song whose `.mid` lives under stateHome when the package copy is absent | pass (`initializeFromLibrary` loaded 1, id `fetched-song`) |

---

## K3 — Dockerfile / `.dockerignore`

`ENV AI_JAM_HOME=/data`, `VOLUME /data`. `RUN mkdir -p /data && chown node:node /data`
**before** `USER node`. No Python, models, or GPU libraries. Nothing new pinned.

`.dockerignore` already had `experiments/`, `datasets/`, `site/`, `docs/`.
Added `songs/quarantine`.

---

## K4 — compose

`docker-compose.yml` at the repo root (also in this tree):

```yaml
# Default `docker compose up` starts only the MCP server (stdio).
# Ollama is a profile: `docker compose --profile ollama up`.
# The server then sees OLLAMA_HOST=http://ollama:11434 on the compose network.
# Port 11434 is bound to localhost only.

services:
  ai-jam-sessions:
    image: ghcr.io/mcp-tool-shop-org/ai-jam-sessions
    stdin_open: true
    tty: false
    volumes:
      - ai-jam-data:/data
    environment:
      OLLAMA_HOST: http://ollama:11434

  ollama:
    profiles: ["ollama"]
    image: ollama/ollama
    volumes:
      - ollama-data:/root/.ollama
    ports:
      - "127.0.0.1:11434:11434"

volumes:
  ai-jam-data:
  ollama-data:
```

Measured: `docker compose config` emits only `ai-jam-sessions` + `ai-jam-data`.
`docker compose --profile ollama config` adds `ollama` (port `127.0.0.1:11434`)
and `ollama-data`. `tty: false` is the compose default so it does not reprint.

---

## K5 — CI docker job

Run: https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/runs/34380057331
(`e56795e`, workflow CI).

Job **Docker image (library + journal volume)** (id `102562421529`):
**success, 33 s wall, 1 billable minute.** Started `2026-09-09T16:58:39Z`,
completed `16:59:12Z`. Image `sha256:238d29451fcc33ff5e55f1895c65160dcdb2d617734a1a20a7524f9d0d65925b`.
No push. No network fetch.

Build step 23 s (`16:58:44`–`16:59:07`). Then:

```
Song library initialized: 14 ready songs loaded (108 total, 94 not ready)
  Total songs: 14
…
  Not fetched: 94 ready song(s) have no MIDI on disk — run 'ai-jam-sessions library fetch'
journal survived across containers: 2026-09-09.md
```

`on.paths` now includes `.dockerignore` and `docker-compose.yml` (push and PR),
plus the existing `Dockerfile`, `src/**`, `.github/workflows/**`.

The whole run finished **green**. `ci (22)` 10m13s (typecheck, test, coverage,
build, smoke), `ci (24)` 8m21s, pnpm10-install 8m33s. Docker job is the one
this chunk asked to measure (33 s wall / 1 billable minute). Re-measured CI
header: 33 billable min across 7 jobs, 10.2 min wall, run `34380057331`.

---

## K6 — Ollama path, measured

### Conversion venv

System `python` is 3.14 and has no torch. Used `uv venv --python 3.12`
at `experiments/coverage-v1-sft/.venv-gguf` (gitignored).

```
uv pip install --python .venv-gguf\Scripts\python.exe gguf torch transformers huggingface_hub safetensors
```

The convert script imports torch, transformers, and huggingface_hub at
module load; `gguf` alone is not enough. Installed (CPU torch, 118 MB wheel):
`gguf==0.19.0`, `torch==2.14.0`, `transformers==5.17.0`,
`huggingface_hub==1.30.0`, `safetensors==0.8.0`.

Cwd **`E:/AI/llama.cpp-src`** (the script does `from conversion import …`).

### 7B seed-42 (`runs/r48/A7bs42/epoch3`, Apache-2.0 base)

```
.venv-gguf\Scripts\python.exe convert_lora_to_gguf.py --base-model-id Qwen/Qwen2.5-7B-Instruct --outfile …/dist/ollama/7b-s42/adapter.gguf --outtype f16 E:/AI/ai-jam-sessions/experiments/coverage-v1-sft/runs/r48/A7bs42/epoch3
```

`--base-model-id` **worked**. Did **not** need `--base` and a local weights
dir. Log: `Loading base model from Hugging Face: Qwen/Qwen2.5-7B-Instruct`,
`Using remote model with HuggingFace id: Qwen/Qwen2.5-7B-Instruct`. It HEADs
`config.json` on the Hub (200; architecture only). Adapter GGUF is LoRA
tensors, not the 7B weights.

```
INFO:gguf.gguf_writer:…/7b-s42/adapter.gguf: n_tensors = 392, total_size = 80.7M
INFO:lora-to-gguf:Model successfully exported to …/7b-s42/adapter.gguf
```

File **80,767,680** bytes. sha256
`aa9144184e88713567820a051ad24287829793298f4a561e97b44959a97f63f2`.
`--outtype f16`. KV `adapter.lora.alpha = 32`. EXIT=0.

### 3B four-draw seed-42 (`runs/r48/A3b4ds42/epoch3`, Qwen Research)

Same command with `--base-model-id Qwen/Qwen2.5-3B-Instruct` and
`…/dist/ollama/3b-4d-s42/adapter.gguf`. Same Hub-config path, no `--base`.

```
…/3b-4d-s42/adapter.gguf: n_tensors = 504, total_size = 59.9M
```

File **59,902,112** bytes. sha256
`56137c6e7fb40260207e1bee35311e594be31ca13a9a832333819c67186c0fba`. EXIT=0.

### Ollama bases (checked Instruct, Q4_K_M)

`ollama` 0.33.3.

`ollama pull qwen2.5:7b-instruct` — already present as the same GGUF blob as
`qwen2.5:7b` (`sha256-2bada8a74506…`). `ollama show qwen2.5:7b-instruct`:
architecture qwen2, **7.6B**, context 32768, embedding 3584,
**quantization Q4_K_M**, capabilities completion + **tools**, system
"You are Qwen, created by Alibaba Cloud. You are a helpful assistant.",
license Apache-2.0.

`ollama pull qwen2.5:3b-instruct` — downloaded 1.9 GB. `ollama show`:
architecture qwen2, **3.1B**, context 32768, embedding 2048,
**quantization Q4_K_M**, tools, same Instruct system line, license
**Qwen RESEARCH LICENSE AGREEMENT** (2024-09-19). Measured, not recommended.

### Modelfiles (as written next to each adapter)

`experiments/coverage-v1-sft/dist/ollama/7b-s42/Modelfile`:

```
FROM qwen2.5:7b-instruct
ADAPTER ./adapter.gguf
```

`experiments/coverage-v1-sft/dist/ollama/3b-4d-s42/Modelfile`:

```
FROM qwen2.5:3b-instruct
ADAPTER ./adapter.gguf
```

`dist/` is gitignored; adapters stay out of git. Commands:

```
cd experiments/coverage-v1-sft/dist/ollama/7b-s42
ollama create ai-jam-grader-7b -f Modelfile
```

7B create: `success`. Used existing base layers + adapter layer
`sha256:aa9144184e887135…`. `ollama show ai-jam-grader-7b`: 7.6B, Q4_K_M,
Apache-2.0.

Then **`ollama stop ai-jam-grader-7b`** (VRAM back to idle **1845 MiB** on the
5090 / 32607 MiB) before:

```
cd experiments/coverage-v1-sft/dist/ollama/3b-4d-s42
ollama create ai-jam-grader-3b -f Modelfile
```

3B create: `success`. Adapter layer `sha256:56137c6e7fb40260…`. Show: 3.1B,
Q4_K_M, Qwen Research.

### `ollama-grade.mjs`

`experiments/coverage-v1-sft/scripts/ollama-grade.mjs`.

Faithful port of `predict_v1.py` / `train_v1_sft.py`:

- `load_tools` from `src/dataset/tool-schemas.json` (`--tools full` → 54)
- `to_template_messages` (assistant `tool_calls` as `{type:function,function:{name,arguments}}`; tool role keeps `name` + `content`)
- last assistant turn is gold; send `tmpl[:last_assistant]`
- `extract_answer` = first non-empty line, label after the **final** colon (same as `predict_v1.py` / `score_v1.mjs` `labelOf`)

HuggingFace `apply_chat_template(..., tools=tools)` is not available. Ollama
`POST /api/chat` applies the model's template. Mapping onto Ollama JSON:

- assistant `tool_calls[].function.{name, arguments}` (arguments as object)
- tool turn: `{ role: "tool", content, tool_name }`
- `tools` array is the same OpenAI-style catalog `predict_v1.py` passes
- `stream: false`, `options.temperature = 0`, `options.num_predict = 128`

Writes `{id, family, answer, raw}` jsonl. Scored by existing `score_v1.mjs`.

```
node experiments/coverage-v1-sft/scripts/ollama-grade.mjs <sft-test.jsonl> <model> --out <preds.jsonl>
```

One model at a time. `ollama stop` between.

### 7B grader — probe then 1.0.0 test

Idle VRAM before load: **1845 MiB**. After probe: **8794 MiB** used.
`ollama ps`: `ai-jam-grader-7b:latest` **6.6 GB**, 100% GPU, context 32768.

Probe 24 (`data-probe/sft-test.jsonl`):

```
[ollama-grade] model=ai-jam-grader-7b n=24 tools=full (54) host=http://127.0.0.1:11434 num_predict=128
  24/24 gen 142.5 tok/s
[ollama-grade] wrote …/preds-7b-probe.jsonl  wall=28.5s  gen=1935 tok / 13.58s = 142.52 tok/s  prompt=221970 tok / 1.89s = 117263.52 tok/s
```

Released test 40 (`data/sft-test.jsonl`):

```
[ollama-grade] wrote …/preds-7b-test.jsonl  wall=16.4s  gen=1711 tok / 12.19s = 140.37 tok/s  prompt=361241 tok / 1.53s = 236374.36 tok/s
```

VRAM still 8794 MiB. Then `ollama stop ai-jam-grader-7b` → 1845 MiB, `ollama ps` empty.

`score_v1.mjs data-probe/gold-test.jsonl`:

```
family                ollama
acoustic                6/24
----------------------------
OVERALL                 6/24
accuracy               25.0%
blank                      0
```

`score_v1.mjs data/gold-test.jsonl`:

```
family                  ollama
acoustic                  4/17
chord                      3/3
ensemble                   3/3
harmony                    1/6
key_moments                1/2
measures                   3/3
teaching_goals             3/3
transpose                  3/3
------------------------------
OVERALL                  21/40
accuracy                 52.5%
blank                        0
```

The 7B Q4 lines often keep writing after the label and invent extra colons, so
`extract_answer` / `labelOf` take the wrong tail (`agree, pitch_fail`, `|−38.`).
That is the measured failure mode, not a scorer bug. Sample probe raw:
`inside: agree, pitch_fail` on a gold `match`.

### 3B grader — probe then 1.0.0 test

After the 7B stop. Probe:

```
[ollama-grade] model=ai-jam-grader-3b n=24 tools=full (54) …
  24/24 gen 177.7 tok/s
[ollama-grade] wrote …/preds-3b-probe.jsonl  wall=13.4s  gen=1277 tok / 7.19s = 177.70 tok/s  prompt=221970 tok / 1.74s = 127843.09 tok/s
```

During 3B: VRAM **5674 MiB**. `ollama ps`: `ai-jam-grader-3b:latest` **3.4 GB**,
100% GPU, context 32768.

Released test 40:

```
[ollama-grade] wrote …/preds-3b-test.jsonl  wall=12.2s  gen=1342 tok / 8.00s = 167.74 tok/s  prompt=370502 tok / 1.83s = 202029.22 tok/s
```

`score_v1.mjs` probe:

```
family                ollama
acoustic               19/24
OVERALL                19/24
accuracy               79.2%
blank                      0
```

Released test:

```
family                  ollama
acoustic                 15/17
chord                      2/3
ensemble                   2/3
harmony                    3/6
key_moments                2/2
measures                   3/3
teaching_goals             3/3
transpose                  3/3
------------------------------
OVERALL                  33/40
accuracy                 82.5%
blank                        0
```

Then `ollama stop ai-jam-grader-3b` → 1845 MiB, `ollama ps` empty.

3B Q4 mostly stops at the label (`inside: match` / `against: timing_fail`).
One probe miss: onset-out negative take answered `pitch_fail`.

Did **not** score the four-draw 36-take set; the chunk named probe 24 and
`data/sft-test.jsonl` 40.

### Beside RESULTS-r48.md (bf16 LoRA)

| condition | acoustic (17) | overall (40) | probe (24) |
|---|---|---|---|
| 7B base (bf16, r48) | 7/17 | 29/40 | 12/24 |
| **7B seed 42 bf16** | **17/17** | **38/40** | **24/24** |
| **7B seed 42 Ollama Q4_K_M + F16 LoRA** | **4/17** | **21/40** | **6/24** |
| **3B four-draw seed 42 bf16** | **17/17** | **37/40** | **24/24** |
| **3B four-draw seed 42 Ollama Q4_K_M + F16 LoRA** | **15/17** | **33/40** | **19/24** |

A quantised Instruct base under a bf16-trained LoRA loses accuracy. On this
rig the 7B Q4 path lost the label (extra-colon ramble); the 3B Q4 path kept
most of it. 3B remains Qwen Research / non-commercial — measured, not
recommended.

---

## Not done / yours

- No README, no `docs/docker.md`, no `docs/ollama-adapters.md`. Facts are here.
- No ghcr push. Release workflow still owns that.
- No full suite locally. CI on `e56795e` (run 34380057331) finished green,
  including Test + coverage on Node 22 and Test on Node 24.
- J28 (full verify, image exercised, docs from these facts) is yours.
