# Slice 9c Phase 1 Report — jam-actions-v0 Local LoRA Fine-Tune

**Date:** 2026-05-17
**Phase:** 1 of 2 (training data + scaffold — NOT training execution)
**Status:** Phase 1 complete. Awaiting user inspection of sample examples and Phase 2 authorization.

---

## Training Plan Summary

| Field | Value |
|---|---|
| Model | `Qwen/Qwen2.5-7B-Instruct` (HuggingFace) |
| Ollama tag | `qwen2.5:7b` |
| Technique | QLoRA — 4-bit base (nf4 BitsAndBytes), LoRA adapters on attention + MLP |
| LoRA rank | 16 (conservative; raise to 32 if loss plateaus) |
| Training stack | HuggingFace TRL `SFTTrainer` + peft + bitsandbytes |
| Training examples | 18 (pairs 0-17, all non-clair-de-lune train split records) |
| Validation examples | 2 (Schumann Traumerei mm.9-12, mm.17-20 — val loss monitoring only) |
| Test set | clair-de-lune (4 records, 2 pairs — NEVER loaded by training script) |
| Max epochs | 5 |
| Learning rate | 1e-4 (conservative for tiny dataset) |
| Effective batch size | 4 (per-device=1, grad_accum=4) |
| Target metric | E2 grooveOA ≥ 0.797 on 2/2 clair-de-lune pairs (majority-pass) |

**Stack choice rationale:** HuggingFace TRL `SFTTrainer` over LLaMA-Factory. The HF stack has explicit Python API control, is better tested on Windows with PowerShell paths, and does not add a YAML-config layer. Direct integration with the `train_lora.py` scaffold.

**Groove diversity:** The 20 training targets span a ~10x groove density range: Satie Gymnopedie (3 onset positions per bar, strict waltz) to Chopin Nocturne (25-35 onset positions per bar, dense syncopation). This is sufficient signal to train against FM-5 (groove mismatch). See `experiments/jam-actions-v0-lora/README.md` for the full per-composer groove assessment.

---

## Environment Readiness

Python environment probe run on the target machine (RTX 5080, Windows 11):

```
Python 3.13.13 (tags/v3.13.13:01104ce, Apr 7 2026, 19:25:48) [MSC v.1944 64 bit (AMD64)]
torch:          MISSING — No module named 'torch'
bitsandbytes:   MISSING — No module named 'bitsandbytes'
peft:           MISSING — No module named 'peft'
transformers:   MISSING — No module named 'transformers'
trl:            MISSING — No module named 'trl'
```

**All 5 dependencies are missing.** The ML stack is not installed.

**Phase 2 is BLOCKED until the following install runs:**

```bash
# Install PyTorch with CUDA 12.1 (adjust index URL for your CUDA version)
pip install torch>=2.3.0 --index-url https://download.pytorch.org/whl/cu121

# Install HuggingFace fine-tuning stack
pip install transformers>=4.45.0 peft>=0.12.0 trl>=0.9.0 bitsandbytes>=0.43.0
pip install accelerate>=0.31.0 datasets>=2.20.0
```

After install, verify environment with the dry-run before actual training:

```bash
python experiments/jam-actions-v0-lora/train_lora.py --dry-run
```

**RTX 5080 (16 GB VRAM) is sufficient** for QLoRA 4-bit on a 7B model. Estimated peak: 8-10 GB.
Estimated training time: 20-40 minutes for 5 epochs on 18 examples.

---

## Deliverables Status

| Deliverable | Status | Path |
|---|---|---|
| Training plan + README | DONE | `experiments/jam-actions-v0-lora/README.md` |
| train.jsonl (20 examples) | DONE | `experiments/jam-actions-v0-lora/train.jsonl` |
| JSONL generator with assertions | DONE | `experiments/jam-actions-v0-lora/generate_train_jsonl.py` |
| train_lora.py scaffold | DONE | `experiments/jam-actions-v0-lora/train_lora.py` |
| Phase 1 report (this file) | DONE | `docs/jam-actions-v0-slice9c-local-lora.md` |
| Environment probe | DONE | See "Environment Readiness" above |

Assertions run status: **ALL PASS**
- A1: No clair-de-lune records in prompt IDs
- A2: No clair-de-lune records in target IDs
- A3: Every prompt has a paired target
- A4: Every user message contains valid REMI tokens (Bar_ and Pitch_ present)
- A5: Every assistant message is valid JSON with `tokens_remi` (list) and `tokens_abc` (str)
- A6: Every assistant message has at least one `Pitch_*` token (FM-4 sanity)
- A7: Count is 20 (within 20-22 range)

---

## 8 Verbatim Training Examples

The following 8 examples are quoted verbatim from `train.jsonl`.
System prompt (byte-identical to `E2_SYSTEM_TEXT` in `src/dataset/eval/llm-runner.ts`)
is omitted here for brevity — it is present in every JSONL line.

---

### Example 0 — Bach Prelude C major (C major, 4/4, 74 BPM)

**prompt:** `bach-prelude-c-major-bwv846:m001-004` → **target:** `bach-prelude-c-major-bwv846:m005-008`
prompt REMI tokens: 260 | target REMI tokens: 260 | Pitch tokens in target: 64

**FM-5 relevance:** Bach uses a strict 16-position arpeggiated groove (positions 0,6,12,...,90 every bar). The continuation must replicate this mechanically regular pattern exactly. A model with FM-5 would diverge into a different groove density.

**USER message:**
```
Composer: bach-prelude-c-major-bwv846
Phrase window: measures 1-4
Key: C major
Time signature: 4/4
Tempo: 74 BPM
Instrument: piano

REMI tokens for this prompt phrase:
Bar_1 Position_0 Pitch_60 Velocity_60 Duration_8 Position_6 Pitch_64 Velocity_56 Duration_7 Position_12 Pitch_67 Velocity_56 Duration_1 Position_18 Pitch_72 Velocity_60 Duration_1 Position_24 Pitch_76 Velocity_60 Duration_1 Position_30 Pitch_67 Velocity_48 Duration_1 Position_36 Pitch_72 Velocity_44 Duration_1 Position_42 Pitch_76 Velocity_44 Duration_1 Position_48 Pitch_60 Velocity_60 Duration_8 Position_54 Pitch_64 Velocity_56 Duration_7 Position_60 Pitch_67 Velocity_56 Duration_1 Position_66 Pitch_72 Velocity_60 Duration_1 Position_72 Pitch_76 Velocity_60 Duration_1 Position_78 Pitch_67 Velocity_48 Duration_1 Position_84 Pitch_72 Velocity_48 Duration_1 Position_90 Pitch_76 Velocity_48 Duration_1 Bar_2 Position_0 Pitch_60 Velocity_64 Duration_8 [...260 tokens total...]

Predict the continuation phrase for the next 4 measures. Use predict_continuation to output the tokens.
```

**ASSISTANT message (first 20 tokens_remi shown; full JSON in train.jsonl):**
```json
{"tokens_remi": ["Bar_5", "Position_0", "Pitch_60", "Velocity_64", "Duration_8",
  "Position_6", "Pitch_64", "Velocity_60", "Duration_7",
  "Position_12", "Pitch_69", "Velocity_60", "Duration_1",
  "Position_18", "Pitch_76", "Velocity_64", "Duration_1",
  "Position_24", "Pitch_81", "Velocity_68", ...260 tokens total],
"tokens_abc": "X:1\nT:Prelude in C Major, BWV 846 (Well-Tempered Clavier) (mm. 5-8)\nM:4/4\nL:1/16\nQ:1/4=74\nK:C\n|C9E8AeaAeaC9E8AeaAea|..."}
```

---

### Example 5 — Chopin Prelude E minor (E minor, 4/4, 120 BPM)

**prompt:** `chopin-prelude-e-minor:m001-004` → **target:** `chopin-prelude-e-minor:m005-008`
prompt REMI tokens: 105 | target REMI tokens: 180 | Pitch tokens in target: 45

**FM-5 relevance:** Chopin Prelude uses irregular inner-voice counterpoint with 32 distinct onset positions per bar. Contrast with Bach's 16. The model must learn to extend sparse melodic RH lines over dense LH accompaniment.

**USER message:**
```
Composer: chopin-prelude-e-minor
Phrase window: measures 1-4
Key: E minor
Time signature: 4/4
Tempo: 120 BPM
Instrument: piano

REMI tokens for this prompt phrase:
Bar_2 Position_0 Pitch_59 Velocity_56 Duration_9 Position_59 Pitch_71 Velocity_64 Duration_2 Position_73 Pitch_71 Velocity_84 Duration_29 Position_74 Pitch_55 Velocity_24 Duration_2 Pitch_59 Velocity_36 Duration_3 Pitch_64 Velocity_44 Duration_3 Bar_3 Position_8 Pitch_59 Velocity_24 Duration_1 Position_9 Pitch_55 Velocity_20 Duration_1 [...105 tokens total...]

Predict the continuation phrase for the next 4 measures. Use predict_continuation to output the tokens.
```

**ASSISTANT message (first 20 tokens_remi shown):**
```json
{"tokens_remi": ["Bar_5", "Position_9", "Pitch_71", "Velocity_76", "Duration_29",
  "Position_10", "Pitch_54", "Velocity_32", "Duration_3",
  "Pitch_64", "Velocity_48", "Duration_3",
  "Position_11", "Pitch_57", "Velocity_24", "Duration_3",
  "Position_42", "Pitch_54", "Velocity_24", "Duration_2", ...180 tokens total],
"tokens_abc": "X:1\nT:Prelude in E Minor, Op. 28 No. 4 (mm. 5-8)\n..."}
```

---

### Example 9 — Fur Elise (A minor, 3/8, 69 BPM)

**prompt:** `fur-elise:m009-012` → **target:** `fur-elise:m013-016`
prompt REMI tokens: 105 | target REMI tokens: 109 | Pitch tokens in target: 27

**FM-5 relevance:** Fur Elise uses a 3/8 time signature with 6 positions per bar — the only 3/8 example in the training set. The model must learn to match the compact triplet groove, not default to 4/4 patterns.

**USER message:**
```
Composer: fur-elise
Phrase window: measures 9-12
Key: A minor
Time signature: 3/8
Tempo: 69 BPM
Instrument: piano

REMI tokens for this prompt phrase:
Bar_9 Position_0 Pitch_45 Velocity_36 Duration_1 Pitch_69 Velocity_40 Duration_2 Position_6 Pitch_52 Velocity_32 Duration_1 Position_12 Pitch_57 Velocity_32 Duration_1 Position_24 Pitch_76 Velocity_36 Duration_1 Position_30 Pitch_75 Velocity_32 Duration_1 [...105 tokens total...]

Predict the continuation phrase for the next 4 measures. Use predict_continuation to output the tokens.
```

**ASSISTANT message:**
```json
{"tokens_remi": ["Bar_13", "Position_0", "Pitch_45", "Velocity_36", "Duration_1",
  "Pitch_72", "Velocity_44", "Duration_2",
  "Position_6", "Pitch_52", "Velocity_32", "Duration_1",
  "Position_12", "Pitch_57", "Velocity_32", "Duration_1",
  "Position_18", "Pitch_64", "Velocity_32", "Duration_1",
  "Position_24", "Pitch_76", "Velocity_36", "Duration_1",
  "Position_30", "Pitch_75", "Velocity_32", "Duration_1",
  "Bar_14", "Position_0", "Pitch_76", "Velocity_40", "Duration_1", ...109 tokens total],
"tokens_abc": "X:1\nT:Fur Elise (Bagatelle No. 25 in A minor) (mm. 13-16)\nM:3/8\nL:1/16\nQ:1/4=69\nK:Amin\n|c2zEe^d|e^deBdc|A2zCEA|B2zEcB|\n"}
```

---

### Example 12 — Pathetique Mvt 2 (Ab major, 4/4, 120 BPM)

**prompt:** `pathetique-mvt2:m001-004` → **target:** `pathetique-mvt2:m005-008`
prompt REMI tokens: 76 | target REMI tokens: 123 | Pitch tokens in target: 30

**FM-5 relevance:** Pathetique uses a sparse but distinctive Adagio cantabile groove: long note values in RH melody with a steady LH oom-pah accompaniment. The model must maintain this "breathable" feel rather than filling in with constant motion.

**USER message:**
```
Composer: pathetique-mvt2
Phrase window: measures 1-4
Key: Ab major
Time signature: 4/4
Tempo: 120 BPM
Instrument: piano

REMI tokens for this prompt phrase:
Bar_1 Position_95 Pitch_60 Velocity_60 Duration_19 Bar_2 Position_0 Pitch_44 Velocity_24 Duration_18 Position_3 Pitch_56 Velocity_16 Duration_5 Position_31 Pitch_51 Velocity_20 Duration_4 [...76 tokens total...]

Predict the continuation phrase for the next 4 measures. Use predict_continuation to output the tokens.
```

**ASSISTANT message:**
```json
{"tokens_remi": ["Bar_5", "Position_0", "Pitch_43", "Velocity_32", "Duration_15",
  "Position_1", "Pitch_58", "Velocity_12", "Duration_4",
  "Position_23", "Pitch_51", "Velocity_24", "Duration_2",
  "Position_43", "Pitch_61", "Velocity_60", "Duration_9", ...123 tokens total],
"tokens_abc": "X:1\nT:Pathetique Sonata, 2nd Movement (Adagio cantabile) (mm. 5-8)\nM:4/4\nL:1/16\nQ:1/4=120\nK:Ab\n|z2_D2C2|_E_AC|_BD_E5|\n"}
```

---

### Example 14 — Satie Gymnopedie No.1 (D major, 3/4, 89 BPM)

**prompt:** `satie-gymnopedie-no1:m003-006` → **target:** `satie-gymnopedie-no1:m007-010`
prompt REMI tokens: 77 | target REMI tokens: 76 | Pitch tokens in target: 21

**FM-5 relevance:** Satie is the clearest FM-5 test case in the training set. The groove is exactly 3 onset positions per bar (0, 24, 48) — a strict waltz pattern. A model with FM-5 would add extra onsets or shift positions. The training signal is: "if the prompt shows only 3 positions per bar, the continuation must also show exactly 3 positions per bar."

**USER message:**
```
Composer: satie-gymnopedie-no1
Phrase window: measures 3-6
Key: D major
Time signature: 3/4
Tempo: 89 BPM
Instrument: piano

REMI tokens for this prompt phrase:
Bar_3 Position_0 Pitch_43 Velocity_60 Duration_12 Position_24 Pitch_59 Velocity_56 Duration_8 Pitch_62 Velocity_56 Duration_8 Pitch_66 Velocity_56 Duration_8 Bar_4 Position_0 Pitch_38 Velocity_60 Duration_12 Position_24 Pitch_57 Velocity_56 Duration_8 [...77 tokens total...]

Predict the continuation phrase for the next 4 measures. Use predict_continuation to output the tokens.
```

**ASSISTANT message:**
```json
{"tokens_remi": ["Bar_7", "Position_0", "Pitch_43", "Velocity_60", "Duration_12",
  "Pitch_71", "Velocity_76", "Duration_4",
  "Position_24", "Pitch_59", "Velocity_60", "Duration_8",
  "Pitch_62", "Velocity_60", "Duration_8",
  "Pitch_66", "Velocity_60", "Duration_8",
  "Pitch_73", "Velocity_72", "Duration_4",
  "Position_48", "Pitch_74", "Velocity_72", "Duration_4",
  "Bar_8", "Position_0", "Pitch_38", "Velocity_60", "Duration_12",
  "Pitch_69", "Velocity_68", "Duration_12",
  "Position_24", "Pitch_57", "Velocity_60", "Duration_8", ...76 tokens total],
"tokens_abc": "X:1\nT:Gymnopedie No. 1 (mm. 7-10)\nM:3/4\nL:1/16\nQ:1/4=89\nK:D\n|B^cd|A3^F2|^F12^F2|z^F2|\n"}
```

---

### Example 17 — Schumann Traumerei (F major, 4/4, 120 BPM)

**prompt:** `schumann-traumerei:m001-004` → **target:** `schumann-traumerei:m005-008`
prompt REMI tokens: 71 | target REMI tokens: 168 | Pitch tokens in target: 42

**FM-5 relevance:** Schumann Traumerei has one of the densest and most irregular grooves in the dataset (31 distinct onset positions per phrase). The opening phrase is deceptively sparse (71 tokens), but the continuation is rich (168 tokens, 42 Pitch tokens). The model must learn that Schumann's "sparse-looking" prompt expands into a full Romantic texture.

**USER message:**
```
Composer: schumann-traumerei
Phrase window: measures 1-4
Key: F major
Time signature: 4/4
Tempo: 120 BPM
Instrument: piano

REMI tokens for this prompt phrase:
Bar_1 Position_54 Pitch_60 Velocity_48 Duration_3 Bar_2 Position_0 Pitch_65 Velocity_56 Duration_15 Position_1 Pitch_41 Velocity_28 Duration_2 Position_47 Pitch_48 Velocity_28 Duration_14 [...71 tokens total...]

Predict the continuation phrase for the next 4 measures. Use predict_continuation to output the tokens.
```

**ASSISTANT message (first 20 tokens_remi shown):**
```json
{"tokens_remi": ["Bar_5", "Position_37", "Pitch_76", "Velocity_72", "Duration_4",
  "Position_38", "Pitch_60", "Velocity_44", "Duration_6",
  "Position_63", "Pitch_74", "Velocity_80", "Duration_2",
  "Position_64", "Pitch_58", "Velocity_40", "Duration_1",
  "Position_89", "Pitch_72", "Velocity_76", "Duration_4", ...168 tokens total],
"tokens_abc": "X:1\nT:Traumerei (Dreaming) from Kinderszenen (mm. 5-8)\nM:4/4\nL:1/16\nQ:1/4=120\nK:F\n|e6C10d3z5c7F8C8|..."}
```

---

### Example 18 — Schumann Traumerei (F major, 4/4, 120 BPM) — VALIDATION SET

**prompt:** `schumann-traumerei:m009-012` → **target:** `schumann-traumerei:m013-016`
prompt REMI tokens: 85 | target REMI tokens: 153 | Pitch tokens in target: 39

This is one of the 2 held-out validation examples (not in train). Used for val loss monitoring only.

**USER message:**
```
Composer: schumann-traumerei
Phrase window: measures 9-12
Key: F major
Time signature: 4/4
Tempo: 120 BPM
Instrument: piano

REMI tokens for this prompt phrase:
Bar_9 Position_13 Pitch_60 Velocity_64 Duration_6 Position_15 Pitch_43 Velocity_36 Duration_2 [...85 tokens total...]

Predict the continuation phrase for the next 4 measures. Use predict_continuation to output the tokens.
```

**ASSISTANT message (first 20 tokens_remi shown):**
```json
{"tokens_remi": ["Bar_13", "Position_1", "Pitch_77", "Velocity_80", "Duration_3",
  "Position_20", "Pitch_76", "Velocity_80", "Duration_3",
  "Position_41", "Pitch_50", "Velocity_32", "Duration_4",
  "Pitch_62", "Velocity_28", "Duration_5",
  "Pitch_69", "Velocity_36", "Duration_7",
  "Pitch_77", "Velocity_80", "Duration_4", ...153 tokens total],
"tokens_abc": "X:1\nT:Traumerei (Dreaming) from Kinderszenen (mm. 13-16)\n..."}
```

---

### Example 19 — Schumann Traumerei (F major, 4/4, 120 BPM) — VALIDATION SET

**prompt:** `schumann-traumerei:m017-020` → **target:** `schumann-traumerei:m021-024`
prompt REMI tokens: 109 | target REMI tokens: 155 | Pitch tokens in target: 40

Second validation example. Note the consistently high Pitch token count (39-42) across Schumann — this is the Romantic texture signal the model must learn.

**USER message:**
```
Composer: schumann-traumerei
Phrase window: measures 17-20
Key: F major
Time signature: 4/4
Tempo: 120 BPM
Instrument: piano

REMI tokens for this prompt phrase:
Bar_17 Position_19 Pitch_65 Velocity_56 Duration_5 [...109 tokens total...]

Predict the continuation phrase for the next 4 measures. Use predict_continuation to output the tokens.
```

**ASSISTANT message (first 20 tokens_remi):**
```json
{"tokens_remi": ["Bar_21", "Position_19", "Pitch_67", "Velocity_72", "Duration_3",
  "Position_19", "Pitch_58", "Velocity_36", "Duration_2",
  "Position_21", "Pitch_48", "Velocity_44", "Duration_10",
  "Pitch_60", "Velocity_36", "Duration_10",
  "Pitch_64", "Velocity_32", "Duration_11",
  "Position_38", "Pitch_69", "Velocity_80", "Duration_2", ...155 tokens total],
"tokens_abc": "X:1\nT:Traumerei (Dreaming) from Kinderszenen (mm. 21-24)\n..."}
```

---

## Estimated GPU Memory and Training Time

| Metric | Estimate | Notes |
|---|---|---|
| VRAM at QLoRA 4-bit | 8-10 GB | 7B × 4bit ≈ 3.5 GB weights; activations + optimizer add ~4-6 GB |
| VRAM available | 16 GB | RTX 5080 — comfortable headroom |
| Training time (5 epochs, 18 examples) | 20-40 min | ~30s per epoch at batch_size=1, grad_accum=4, seq_len ≈ 200 REMI tokens |
| Model download (first run) | 4-5 GB | From HuggingFace; cached after first download |

---

## Receipt Template

`training-receipt.json` will be written to `experiments/jam-actions-v0-lora/adapter-v1/` after training:

```json
{
  "schema": "training-receipt/1.0.0",
  "generated_at": "<ISO-8601 UTC>",
  "model": "Qwen/Qwen2.5-7B-Instruct",
  "technique": "QLoRA-4bit",
  "lora_config": {
    "r": 16,
    "lora_alpha": 32,
    "target_modules": ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    "lora_dropout": 0.05
  },
  "train_args": {
    "num_train_epochs": 5,
    "learning_rate": 1e-4,
    "per_device_train_batch_size": 1,
    "gradient_accumulation_steps": 4
  },
  "data": {
    "train_jsonl": "experiments/jam-actions-v0-lora/train.jsonl",
    "train_examples": 18,
    "val_examples": 2,
    "val_song": "schumann-traumerei",
    "test_set": "clair-de-lune (held out — never loaded by training script)"
  },
  "training": {
    "loss_curve": [ ... ],
    "wall_time_seconds": 0,
    "gpu_peak_memory_gb": null
  },
  "git_sha": "<repo HEAD at training time>",
  "adapter_path": "experiments/jam-actions-v0-lora/adapter-v1"
}
```

---

## FM-5 Signal Assessment

**Does the training data target FM-5?**

FM-5 is "groove mismatch on harder material." The training signal targets it directly:

1. **Diverse groove densities:** Satie (3 onset positions/bar) vs Chopin Nocturne (35 onset positions/bar) is a ~10x difference. The model sees examples where the correct continuation groove matches the prompt's sparse or dense pattern.

2. **Diverse time signatures:** 3/8 (Fur Elise), 3/4 (Satie), 4/4 (all others). The model sees that groove rules differ across time signatures.

3. **Asymmetric prompt→target density:** Schumann Traumerei prompt (71 tokens) → target (168 tokens, 42 Pitch) shows the model that a sparse prompt can require a dense continuation when the musical style demands it.

4. **Bach is an exception:** Both Bach pairs have identical arpeggiated patterns (as noted in Slice 6). The training signal from these pairs is "replicate the exact arpeggiated groove" — valid FM-5 signal for this specific style.

**Verdict: training data is sufficient to target FM-5.** No need for Slice 9b (corpus expansion) before attempting 9c. If fine-tuning fails to close FM-5, the corpus diversity question can be revisited.

---

## Open Questions for User Before Phase 2 Authorization

1. **Environment setup:** are you ready to run the pip install, or do you have an existing venv / conda env to activate? The install adds ~5 GB including PyTorch CUDA wheels.

2. **Model download:** `Qwen/Qwen2.5-7B-Instruct` will download ~4-5 GB from HuggingFace on first run. Accept? Or do you have it locally and want to set `HF_HUB_OFFLINE=1`?

3. **Epochs:** 5 epochs max. If val loss plateaus or diverges before epoch 5, stop early. Are you comfortable manually monitoring loss during training, or should the script add automatic early-stopping (easy to add to Phase 2 config)?

4. **Adapter → Ollama conversion:** after training, the LoRA adapter needs to be merged into the base model and converted to a Ollama Modelfile. This is Phase 2 post-training work. The current scaffold does NOT do this automatically. Confirm this 2-step process is acceptable.

5. **Eval scope:** after fine-tuning, Phase 2 runs E2 on the test set (clair-de-lune, 2 pairs) using the existing `run-llm-eval.ts` harness. E1 and E3 will be run as regression checks. Confirm the eval scope.

---

## Phase 2 Ready Statement

**Phase 2 is BLOCKED on environment setup.** ML stack not installed.

Once the user installs the required dependencies and authorizes Phase 2:
- Run `python experiments/jam-actions-v0-lora/train_lora.py --dry-run` to verify environment
- Run `python experiments/jam-actions-v0-lora/train_lora.py` to train
- Convert adapter to Ollama Modelfile
- Run `pnpm exec tsx scripts/run-llm-eval.ts --backend ollama --model <fine-tuned-model>`

**Training data:** ready. 20 examples, all assertions pass, no clair-de-lune, correct E2 prompt shape.
**Scaffold:** ready. Safety assertions, QLoRA config, val split, receipt writing, dry-run mode all implemented.
**Environment:** missing all 5 ML dependencies. Install command documented above.

---

## Phase 2 — STOPPED 2026-05-17

Phase 2 stopped before training artifact creation. Local 7B QLoRA on RTX 5080 Laptop / Windows / nightly CUDA stack caused unsafe system pressure. No adapter produced. Fine-tuning deferred until a safer compute substrate is available.

**What was attempted:**
- Python ML environment built in `experiments/jam-actions-v0-lora/.venv/` (Python 3.11.9, PyTorch 2.12.0.dev+cu128 with sm_120 Blackwell support, transformers 5.8.1, peft 0.19.1, trl 1.4.0, bitsandbytes 0.49.2, accelerate 1.13.0)
- Qwen2.5-7B-Instruct cached at `C:/vLLM/cache/hub/`
- `train_lora.py --dry-run` validates the stack: model handle loads, dataset maps, LoRA applies (40.4M trainable / 7.66B total = 0.53%)
- Four retry-patched API changes surfaced during actual training:
  - `evaluation_strategy` → `eval_strategy` (transformers 5.x rename)
  - `max_seq_length` → `max_length` (TRL 1.4.x rename)
  - `tokenizer=` → `processing_class=` (TRL 1.4.x rename)
  - `fp16=True` → `bf16=True` (Blackwell + 4-bit base compute_dtype interaction)
- After the four patches, training reached step 0/25 before causing system memory pressure that nearly crashed the host. User halted.

**Why this is not a product failure:**
- The dataset and eval spine are working as designed (Slice 8.5 / 9a / 9d produced clear product signal)
- The training failure is a compute-substrate constraint, not a dataset problem
- The LoRA export scaffold + training JSONL remain valid artifacts — useful when a safer substrate is available

**Mitigation path (future):**
- Desktop GPU (24+ GB VRAM) without paging pressure
- Cloud GPU (only if local-first rule is relaxed for a one-off experiment)
- Reduce footprint *radically*: rank=4, ctx=1024, batch=1, no gradient accumulation, swap `paged_adamw_32bit` → `adamw_torch` — and verify VRAM peak via `nvidia-smi` before launch

**Current train_lora.py state (post-revert):** original Phase 1 scaffold. The four API-rename patches were reverted because they only matter for actual training; dry-run still passes against the original.

**Pivot:** Slice 9b — corpus expansion. Pure TypeScript, no GPU. Extends dataset value via the infrastructure we understand.
