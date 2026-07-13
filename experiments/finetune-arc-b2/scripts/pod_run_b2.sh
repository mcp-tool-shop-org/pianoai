#!/usr/bin/env bash
# Finetune Arc B-2 — pod run (P0-LOCK §13/§14: the v1/v2 anti-loss pattern
# VERBATIM, b2 filenames/tags swapped). Every design element maps to a prior
# failure:
#   * stage0 retires ALL environment risk before any training
#   * on-pod render fail-fast (render-check-b2.py) before any gradient step
#   * llama.cpp convert deps --no-deps (requirements file clobbers CUDA torch)
#   * per-seed DONE markers + artifact tars: the local fetcher streams each seed
#     off the pod the minute it finishes — termination forfeits at most the
#     in-flight seed
#   * printf-delimited progress (the stall detector requires it)
#
# Approved compute (B-2): ONE pod, ALL FIVE seeds sequentially — default SEEDS
# {13 42 271 512 1024}, no SEEDS_OVERRIDE needed. (SEEDS_OVERRIDE remains as an
# escape hatch for a manual split/resume.)
# Recipe: bf16 LoRA r=16, epochs 4 ckpts {1,2,4}, weight-decay 0.01 (P0-LOCK §7).
set -euo pipefail

ARC=/workspace/arc
DATA=$ARC/data
SCRIPTS=$ARC/scripts
RUNS=$ARC/runs
ART=$ARC/artifacts
SEEDS=(${SEEDS_OVERRIDE:-13 42 271 512 1024})
export HF_HOME=/workspace/hf
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True
# Ubuntu 24.04 base image marks its Python externally-managed (PEP 668); the pod
# is disposable so allow pip to install into the same dist-packages torch lives in.
export PIP_BREAK_SYSTEM_PACKAGES=1

mkdir -p "$RUNS" "$ART" "$ARC/merged"

echo "=== [b2-stage0] environment (fail fast, before any training) ==="
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

echo "=== [b2-stage0b] G7 render fail-fast on-pod (before any gradient step) ==="
python "$SCRIPTS/render-check-b2.py" --data-dir "$DATA"
touch "$ART/STAGE0.DONE"

echo "=== [b2-stage1] P2 train: seeds ${SEEDS[*]} (per-seed streaming) ==="
for SEED in "${SEEDS[@]}"; do
  echo "--- seed $SEED ---"
  python "$SCRIPTS/train_finetune_arc_b2.py" \
    --data "$DATA/sft-train-b2.jsonl" \
    --tools-mcp41 "$DATA/tools-mcp41.json" \
    --tools-inspector9 "$DATA/tools-inspector9.json" \
    --out "$RUNS/seed$SEED" --seed "$SEED" \
    --epochs 4 --weight-decay 0.01 --per-device-batch 1 --grad-accum 8
  cp "$RUNS/seed$SEED/run-config.json" "$ART/run-config-seed$SEED.json"
  tar -C "$RUNS/seed$SEED" -czf "$ART/adapters-seed$SEED.tar.gz" \
    $(cd "$RUNS/seed$SEED" && ls -d epoch*) run-config.json
  sha256sum "$ART/adapters-seed$SEED.tar.gz" "$ART/run-config-seed$SEED.json" >> "$ART/streaming.sha256"
  touch "$ART/SEED_$SEED.DONE"
  echo "[stream] seed $SEED artifacts staged for fetch"
done

echo "=== [b2-stage2] P3-b2 composite selection (inner splits only) ==="
python "$SCRIPTS/p3_select_b2.py" \
  --jam-data "$DATA/sft-val-jam.jsonl" \
  --grounding-data "$DATA/sft-val-grounding.jsonl" \
  --abstention-data "$DATA/sft-val-abstention.jsonl" \
  --tools-mcp41 "$DATA/tools-mcp41.json" \
  --tools-inspector9 "$DATA/tools-inspector9.json" \
  --runs-dir "$RUNS" --out "$ART/selection-report.json"
sha256sum "$ART/selection-report.json" >> "$ART/streaming.sha256"
touch "$ART/P3.DONE"

echo "=== [b2-stage3] P4 merge + GGUF Q4_K_M ==="
cd /workspace/llama.cpp
for SEED in "${SEEDS[@]}"; do
  SEL=$(python -c "import json;print(json.load(open('$ART/selection-report.json'))['results']['seed$SEED']['selected'])")
  echo "--- seed $SEED selected $SEL ---"
  python "$SCRIPTS/p4_merge.py" --adapter "$RUNS/seed$SEED/$SEL" --out "$ARC/merged/seed$SEED"
  python convert_hf_to_gguf.py "$ARC/merged/seed$SEED" \
    --outtype f16 --outfile "$ARC/merged/seed$SEED-f16.gguf"
  ./build/bin/llama-quantize "$ARC/merged/seed$SEED-f16.gguf" \
    "$ART/jam-ft-b2-qwen25-seed$SEED-$SEL.q4_k_m.gguf" Q4_K_M
  rm -rf "$ARC/merged/seed$SEED-f16.gguf" "$ARC/merged/seed$SEED"
  sha256sum "$ART/jam-ft-b2-qwen25-seed$SEED-$SEL.q4_k_m.gguf" >> "$ART/streaming.sha256"
  touch "$ART/GGUF_$SEED.DONE"
  echo "[stream] seed $SEED gguf staged for fetch"
done

cd "$ART" && sha256sum *.gguf *.json *.tar.gz *.txt > "$ART/artifacts.sha256"
touch "$ART/ALL.DONE"
echo "=== POD RUN B2 COMPLETE ==="
