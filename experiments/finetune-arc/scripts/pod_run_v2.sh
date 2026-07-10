#!/usr/bin/env bash
# Finetune Arc — pod run v2 (A5). Design changes vs v1, each mapped to a
# v1 failure:
#   * stage0 retires ALL environment risk before any training: cmake installed,
#     llama-quantize built, gguf importable, CUDA torch asserted — the v1 run
#     died AFTER training on exactly these.
#   * llama.cpp convert deps installed with --no-deps (v1's `pip install -r
#     requirements-convert...` silently replaced CUDA torch with a CPU build).
#   * per-seed DONE markers: adapters + receipt are tarred into artifacts/ the
#     minute each seed finishes, so the local fetcher streams them off the pod
#     immediately — pod termination at ANY point costs at most the in-flight
#     seed (v1 treated the pod as storage until the end and lost everything).
#   * no queued waiters, no self-matching pkill patterns, one linear script.
set -euo pipefail

ARC=/workspace/arc
DATA=$ARC/data
SCRIPTS=$ARC/scripts
RUNS=$ARC/runs
ART=$ARC/artifacts
SEEDS=(13 42 271)
export HF_HOME=/workspace/hf
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

mkdir -p "$RUNS" "$ART" "$ARC/merged"

echo "=== [v2-stage0] environment (fail fast, before any training) ==="
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
pip install -q "transformers==4.57.1" "peft==0.17.0" "accelerate==1.10.1" \
    jsonschema sentencepiece protobuf 2>/dev/null \
  || pip install -q transformers peft accelerate jsonschema sentencepiece protobuf
pip install -q --no-deps gguf
apt-get update -qq >/dev/null && apt-get install -y -qq cmake >/dev/null
if [ ! -d /workspace/llama.cpp ]; then
  git clone -q --depth 1 https://github.com/ggml-org/llama.cpp /workspace/llama.cpp
fi
cd /workspace/llama.cpp
git rev-parse HEAD > "$ART/llamacpp-commit.txt"
if [ ! -x build/bin/llama-quantize ]; then
  cmake -B build -DGGML_CUDA=OFF -DLLAMA_CURL=OFF >/dev/null
  cmake --build build --target llama-quantize -j"$(nproc)" >/dev/null
fi
python - <<'EOF'
import torch, gguf, transformers, peft, jsonschema
assert torch.cuda.is_available(), "no CUDA"
x = (torch.ones(4, device="cuda") * 2).sum().item(); assert x == 8.0
print("ENV-OK torch", torch.__version__, "| transformers", transformers.__version__,
      "| peft", peft.__version__, "| gguf importable | quantize built")
EOF
pip list --format=freeze | grep -Ei "^(torch|transformers|peft|accelerate|tokenizers|jsonschema|gguf)" > "$ART/pip-pins.txt"
touch "$ART/STAGE0.DONE"

echo "=== [v2-stage1] P2 train: seeds ${SEEDS[*]} (per-seed streaming) ==="
for SEED in "${SEEDS[@]}"; do
  echo "--- seed $SEED ---"
  python "$SCRIPTS/train_finetune_arc.py" \
    --data "$DATA/sft-train.jsonl" --tools "$DATA/tools.json" \
    --out "$RUNS/seed$SEED" --seed "$SEED" \
    --per-device-batch 1 --grad-accum 8
  cp "$RUNS/seed$SEED/run-config.json" "$ART/run-config-seed$SEED.json"
  tar -C "$RUNS/seed$SEED" -czf "$ART/adapters-seed$SEED.tar.gz" \
    $(cd "$RUNS/seed$SEED" && ls -d epoch*) run-config.json
  sha256sum "$ART/adapters-seed$SEED.tar.gz" "$ART/run-config-seed$SEED.json" >> "$ART/streaming.sha256"
  touch "$ART/SEED_$SEED.DONE"
  echo "[stream] seed $SEED artifacts staged for fetch"
done

echo "=== [v2-stage2] P3 checkpoint selection (inner split only) ==="
python "$SCRIPTS/p3_select.py" \
  --data "$DATA/sft-inner-val.jsonl" --tools "$DATA/tools.json" \
  --runs-dir "$RUNS" --out "$ART/selection-report.json"
sha256sum "$ART/selection-report.json" >> "$ART/streaming.sha256"
touch "$ART/P3.DONE"

echo "=== [v2-stage3] P4 merge + GGUF Q4_K_M ==="
cd /workspace/llama.cpp
for SEED in "${SEEDS[@]}"; do
  SEL=$(python -c "import json;print(json.load(open('$ART/selection-report.json'))['results']['seed$SEED']['selected'])")
  echo "--- seed $SEED selected $SEL ---"
  python "$SCRIPTS/p4_merge.py" --adapter "$RUNS/seed$SEED/$SEL" --out "$ARC/merged/seed$SEED"
  python convert_hf_to_gguf.py "$ARC/merged/seed$SEED" \
    --outtype f16 --outfile "$ARC/merged/seed$SEED-f16.gguf"
  ./build/bin/llama-quantize "$ARC/merged/seed$SEED-f16.gguf" \
    "$ART/jam-ft-qwen25-seed$SEED-$SEL.q4_k_m.gguf" Q4_K_M
  rm -rf "$ARC/merged/seed$SEED-f16.gguf" "$ARC/merged/seed$SEED"
  sha256sum "$ART/jam-ft-qwen25-seed$SEED-$SEL.q4_k_m.gguf" >> "$ART/streaming.sha256"
  touch "$ART/GGUF_$SEED.DONE"
  echo "[stream] seed $SEED gguf staged for fetch"
done

cd "$ART" && sha256sum *.gguf *.json *.tar.gz *.txt > "$ART/artifacts.sha256"
touch "$ART/ALL.DONE"
echo "=== POD RUN V2 COMPLETE ==="
