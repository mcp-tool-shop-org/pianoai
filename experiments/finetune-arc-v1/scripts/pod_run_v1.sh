#!/usr/bin/env bash
# Finetune Arc v1 — pod run (P0-LOCK §12: the v2 anti-loss pattern VERBATIM,
# v1 filenames/tags swapped; every design element maps to a v0 failure):
#   * stage0 retires ALL environment risk before any training
#   * llama.cpp convert deps --no-deps (v1 lesson: requirements file clobbers CUDA torch)
#   * per-seed DONE markers + artifact tars: the local fetcher streams each
#     seed off the pod the minute it finishes — termination at ANY point
#     forfeits at most the in-flight seed
#   * no queued waiters, no self-matching pkill patterns, one linear script
#   * progress lines are printf-delimited (the stall detector requires it;
#     tqdm's unterminated \r otherwise glues onto delimiters)
#
# Pod A: default SEEDS. Pod B: launch with SEEDS_OVERRIDE="512 1024".
set -euo pipefail

ARC=/workspace/arc
DATA=$ARC/data
SCRIPTS=$ARC/scripts
RUNS=$ARC/runs
ART=$ARC/artifacts
SEEDS=(${SEEDS_OVERRIDE:-13 42 271})
export HF_HOME=/workspace/hf
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

mkdir -p "$RUNS" "$ART" "$ARC/merged"

echo "=== [v1-stage0] environment (fail fast, before any training) ==="
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

echo "=== [v1-stage0b] G7 render fail-fast on-pod (before any gradient step) ==="
python "$SCRIPTS/render-check-v1.py" --data-dir "$DATA"
touch "$ART/STAGE0.DONE"

echo "=== [v1-stage1] P2 train: seeds ${SEEDS[*]} (per-seed streaming) ==="
for SEED in "${SEEDS[@]}"; do
  echo "--- seed $SEED ---"
  python "$SCRIPTS/train_finetune_arc_v1.py" \
    --data "$DATA/sft-train-v1.jsonl" \
    --tools-mcp41 "$DATA/tools-mcp41.json" \
    --tools-inspector9 "$DATA/tools-inspector9.json" \
    --out "$RUNS/seed$SEED" --seed "$SEED" \
    --per-device-batch 1 --grad-accum 8
  cp "$RUNS/seed$SEED/run-config.json" "$ART/run-config-seed$SEED.json"
  tar -C "$RUNS/seed$SEED" -czf "$ART/adapters-seed$SEED.tar.gz" \
    $(cd "$RUNS/seed$SEED" && ls -d epoch*) run-config.json
  sha256sum "$ART/adapters-seed$SEED.tar.gz" "$ART/run-config-seed$SEED.json" >> "$ART/streaming.sha256"
  touch "$ART/SEED_$SEED.DONE"
  echo "[stream] seed $SEED artifacts staged for fetch"
done

echo "=== [v1-stage2] P3-v1 composite selection (inner splits only) ==="
python "$SCRIPTS/p3_select_v1.py" \
  --jam-data "$DATA/sft-val-jam.jsonl" \
  --grounding-data "$DATA/sft-val-grounding.jsonl" \
  --tools-mcp41 "$DATA/tools-mcp41.json" \
  --tools-inspector9 "$DATA/tools-inspector9.json" \
  --runs-dir "$RUNS" --out "$ART/selection-report.json"
sha256sum "$ART/selection-report.json" >> "$ART/streaming.sha256"
touch "$ART/P3.DONE"

echo "=== [v1-stage3] P4 merge + GGUF Q4_K_M ==="
cd /workspace/llama.cpp
for SEED in "${SEEDS[@]}"; do
  SEL=$(python -c "import json;print(json.load(open('$ART/selection-report.json'))['results']['seed$SEED']['selected'])")
  echo "--- seed $SEED selected $SEL ---"
  python "$SCRIPTS/p4_merge.py" --adapter "$RUNS/seed$SEED/$SEL" --out "$ARC/merged/seed$SEED"
  python convert_hf_to_gguf.py "$ARC/merged/seed$SEED" \
    --outtype f16 --outfile "$ARC/merged/seed$SEED-f16.gguf"
  ./build/bin/llama-quantize "$ARC/merged/seed$SEED-f16.gguf" \
    "$ART/jam-ft-v1-qwen25-seed$SEED-$SEL.q4_k_m.gguf" Q4_K_M
  rm -rf "$ARC/merged/seed$SEED-f16.gguf" "$ARC/merged/seed$SEED"
  sha256sum "$ART/jam-ft-v1-qwen25-seed$SEED-$SEL.q4_k_m.gguf" >> "$ART/streaming.sha256"
  touch "$ART/GGUF_$SEED.DONE"
  echo "[stream] seed $SEED gguf staged for fetch"
done

cd "$ART" && sha256sum *.gguf *.json *.tar.gz *.txt > "$ART/artifacts.sha256"
touch "$ART/ALL.DONE"
echo "=== POD RUN V1 COMPLETE ==="
