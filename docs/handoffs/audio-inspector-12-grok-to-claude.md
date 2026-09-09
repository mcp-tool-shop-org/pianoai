# Handoff 12 — Grok Build to Claude: corpus on disk, training setup, no run

**Paste target:** a fresh Claude session with `E:/AI/ai-jam-sessions` open.
**Arc:** the audio inspector surface.
**This is the last build chunk.** HEAD I started from: `f890c55`. Work is uncommitted. Tests written, unrun. I generated the corpus (authorized) and formatted SFT JSONL. I did **not** train, download weights, or install the Python stack.

---

## 1. What I built

### Phrase extraction — `src/dataset/acoustic/phrases.ts`

First four sequential **right-hand** onsets from jam-actions-v0 records (read-only):

| song_id | split | MIDI |
|---|---|---|
| bach-prelude-c-major-bwv846 | train | C4 E4 G4 C5 |
| schumann-traumerei | train | C4 F4 C4 E4 |
| fur-elise | **test** | E5 D#5 E5 D#5 |

Three distinct lines. **clair-de-lune is not present** (asserted in code). The card says this is a 4-note reduction, not a musical edition.

### Corpus — `datasets/jam-actions-acoustic-v0/`

108 records = 3 × 36. Seeds for target indexes 0–3: **7, 12, 1, 4**. Layout mirrors the public jam-actions package without calling `package-public.ts`:

- `records.jsonl` (with `split`)
- `records/*.json`
- `splits.json` (phrase-locked, Für Elise held out)
- `manifest.json` (`built_at: "reproducible"`)
- `checksums.sha256`
- `README.md` (dataset card)

No WAV files. No `Date()`, no `Math.random()`. No publish.

### SFT setup — `experiments/acoustic-sft/`

Formatter copies **shape** from `build-sft-data.ts` (system + session, `tool` → `name`). Does not edit that file.

- `format-sft.ts` → `data/sft-train.jsonl` (72), `data/sft-test.jsonl` (36). Throws if Für Elise is in train or if clair-de-lune appears.
- `lora-config.json` — `Qwen/Qwen2.5-3B-Instruct`, r=16/α=32, 5 epochs, **`hf_home`: `E:/AI-Models/hf-cache`**, `local_files_only` + `refuse_download`.
- `train.ts` — sets `HF_HOME`, `TRANSFORMERS_OFFLINE`, `HF_HUB_OFFLINE`. Exits if the cache dir is missing. **Takes no gradient step.**
- `eval.ts` — always prints per-kind n, **uniform 1/9**, **majority 1/9** (gold is balanced). LoRA/base overall only if `--predictions` / `--base-predictions` are passed. Warns if LoRA is scored without a base-model number.

### Tests written, unrun

Phrase distinctness, no clair-de-lune, 108/72/36 split, SFT holdout, eval unfalsifiable note, majority=uniform.

---

## 2. Command that would start training

```
pnpm exec tsx experiments/acoustic-sft/train.ts
```

Today: refuse-to-download gate, then a stub message. After the operator installs the stack **and** has `Qwen/Qwen2.5-3B-Instruct` already in `E:/AI-Models/hf-cache`, that same file is the place to attach the Trainer loop. It will not fetch weights.

Format + eval without a model:

```
pnpm exec tsx src/dataset/acoustic/generate-corpus.ts
pnpm exec tsx experiments/acoustic-sft/format-sft.ts
pnpm exec tsx experiments/acoustic-sft/eval.ts
```

---

## 3. Dependencies (not installed)

| package | licence | why |
|---|---|---|
| `torch` | BSD-style | CUDA tensors |
| `transformers` | Apache-2.0 | Qwen2.5 + tokenizer |
| `peft` | Apache-2.0 | LoRA |
| `trl` | Apache-2.0 | SFTTrainer |
| `accelerate` | Apache-2.0 | devices |

Installing them is yours. This chunk did not run `pip` or `pnpm add`.

---

## 4. Split: leaks vs not

**Leaks:** nine-kind taxonomy, tool sequence, gate numbers (on every record). Kinds appear in both splits — that is the intended kind-transfer.

**Does not leak:** Für Elise’s notes/times, or which index was perturbed on that melody. Random record holdout would have leaked `(phrase, kind, other index)`.

**clair-de-lune:** unused. Contaminating the published jam-actions-v0 holdout is a landmine; the generator throws if that id appears.

---

## 5. What eval can and cannot show at n=36

**Can:** per-kind accuracy on one held-out 4-note line; comparison to uniform/majority (both 11.1%); comparison to a **base-model** score on the same split if you supply `--base-predictions`.

**Cannot:** claim the LoRA did anything without that base-model number; genre transfer; real recordings; polyphony; colormap; a statistically significant margin. A model that recites the 9-kind prior scores ~11% overall and can look less bad than it is unless you read per-kind.

---

## 6. What chunk 13 / J5 (you) should do

Full treatment. Do not train unless the operator says so. If you train: run eval with **both** prediction files. Do not publish this corpus or stamp `jam-actions-v0` on it. Viridis stays default; colormap still not frozen.

---

## Working tree

Uncommitted on `feat/audio-inspector` (HEAD `f890c55`):

```
?? datasets/jam-actions-acoustic-v0/
?? src/dataset/acoustic/phrases.ts
?? src/dataset/acoustic/generate-corpus.ts
?? src/dataset/acoustic/corpus.test.ts
?? experiments/acoustic-sft/
?? docs/handoffs/audio-inspector-12-grok-to-claude.md
M  src/dataset/acoustic/builder.ts
M  src/dataset/acoustic/index.ts
```
