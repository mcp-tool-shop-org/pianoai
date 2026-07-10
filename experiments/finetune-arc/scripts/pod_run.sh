#!/usr/bin/env bash
# Finetune Arc — RunPod orchestration (P2 train -> P3 select -> P4 merge+GGUF).
# Expects /workspace/arc/{data,scripts} uploaded from the repo. Run inside tmux:
#   bash /workspace/arc/scripts/pod_run.sh 2>&1 | tee /workspace/arc/pod_run.log
set -euo pipefail

ARC=/workspace/arc
DATA=$ARC/data
SCRIPTS=$ARC/scripts
RUNS=$ARC/runs
ART=$ARC/artifacts
SEEDS=(13 42 271)
export HF_HOME=/workspace/hf

mkdir -p "$RUNS" "$ART"
echo "=== [stage0] environment ==="
nvidia-smi --query-gpu=name,memory.total --format=csv
python -V

# Pinned install; if the exact pins are unresolvable on this image, fall back
# to latest and let the run receipts carry the true pin (pin-by-receipt).
pip install -q "transformers==4.57.1" "peft==0.17.0" "accelerate==1.10.1" \
    jsonschema sentencepiece protobuf 2>/dev/null \
  || pip install -q transformers peft accelerate jsonschema sentencepiece protobuf
pip list --format=freeze | grep -Ei "^(torch|transformers|peft|accelerate|tokenizers|jsonschema)" \
  | tee "$ART/pip-pins.txt"

echo "=== [stage1] P2 train: seeds ${SEEDS[*]} ==="
for SEED in "${SEEDS[@]}"; do
  echo "--- seed $SEED ---"
  python "$SCRIPTS/train_finetune_arc.py" \
    --data "$DATA/sft-train.jsonl" --tools "$DATA/tools.json" \
    --out "$RUNS/seed$SEED" --seed "$SEED"
  cp "$RUNS/seed$SEED/run-config.json" "$ART/run-config-seed$SEED.json"
done

echo "=== [stage2] P3 checkpoint selection (inner split only) ==="
python "$SCRIPTS/p3_select.py" \
  --data "$DATA/sft-inner-val.jsonl" --tools "$DATA/tools.json" \
  --runs-dir "$RUNS" --out "$ART/selection-report.json"

echo "=== [stage3] P4 merge + GGUF Q4_K_M ==="
if [ ! -d /workspace/llama.cpp ]; then
  git clone --depth 1 https://github.com/ggml-org/llama.cpp /workspace/llama.cpp
fi
cd /workspace/llama.cpp
git rev-parse HEAD | tee "$ART/llamacpp-commit.txt"
pip install -q -r requirements/requirements-convert_hf_to_gguf.txt
if [ ! -x build/bin/llama-quantize ]; then
  cmake -B build -DGGML_CUDA=OFF -DLLAMA_CURL=OFF >/dev/null
  cmake --build build --target llama-quantize -j"$(nproc)" >/dev/null
fi

for SEED in "${SEEDS[@]}"; do
  SEL=$(python -c "import json;print(json.load(open('$ART/selection-report.json'))['results']['seed$SEED']['selected'])")
  echo "--- seed $SEED selected $SEL ---"
  python "$SCRIPTS/p4_merge.py" --adapter "$RUNS/seed$SEED/$SEL" --out "$ARC/merged/seed$SEED"
  python convert_hf_to_gguf.py "$ARC/merged/seed$SEED" \
    --outtype f16 --outfile "$ARC/merged/seed$SEED-f16.gguf"
  ./build/bin/llama-quantize "$ARC/merged/seed$SEED-f16.gguf" \
    "$ART/jam-ft-qwen25-seed$SEED-$SEL.q4_k_m.gguf" Q4_K_M
  rm -f "$ARC/merged/seed$SEED-f16.gguf"
  tar -C "$RUNS/seed$SEED" -czf "$ART/adapters-seed$SEED.tar.gz" \
    $(cd "$RUNS/seed$SEED" && ls -d epoch*) run-config.json
done

cd "$ART" && sha256sum *.gguf *.json *.tar.gz | tee "$ART/artifacts.sha256"
echo "=== POD RUN COMPLETE ==="
