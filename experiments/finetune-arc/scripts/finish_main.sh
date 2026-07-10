#!/usr/bin/env bash
# Finetune Arc — recovery: finish the main run's stage3 (P4 merge + GGUF for
# seeds 13/42/271) after the cmake/torch-clobber crash, then print the main
# completion marker that releases pod_run_extra.sh.
#
# Fixes applied here, in order:
#   1. restore CUDA torch (llama.cpp convert requirements installed 2.11.0+cpu)
#   2. apt cmake, build llama-quantize
#   3. stage3 exports using the existing selection-report.json
#   4. verify CUDA torch one final time BEFORE printing the marker (the extra
#      seeds train immediately after it)
set -euo pipefail

ARC=/workspace/arc
SCRIPTS=$ARC/scripts
RUNS=$ARC/runs
ART=$ARC/artifacts
SEEDS=(13 42 271)
export HF_HOME=/workspace/hf
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

echo "=== [recover1] restore CUDA torch ==="
python - <<'EOF' || NEED_TORCH=1
import torch, sys
sys.exit(0 if (torch.cuda.is_available() and "+cpu" not in torch.__version__) else 1)
EOF
if [ "${NEED_TORCH:-0}" = "1" ]; then
  pip install -q --no-deps --force-reinstall "torch==2.8.0" \
    --index-url https://download.pytorch.org/whl/cu128
fi
python - <<'EOF'
import torch
assert torch.cuda.is_available(), "CUDA torch restore FAILED"
x = (torch.ones(8, device="cuda") * 2).sum().item()
assert x == 16.0
import transformers, peft
print("torch", torch.__version__, "| cuda ok | transformers", transformers.__version__, "| peft", peft.__version__)
EOF

echo "=== [recover2] cmake + llama-quantize ==="
command -v cmake >/dev/null || (apt-get update -qq && apt-get install -y -qq cmake >/dev/null)
cd /workspace/llama.cpp
if [ ! -x build/bin/llama-quantize ]; then
  cmake -B build -DGGML_CUDA=OFF -DLLAMA_CURL=OFF >/dev/null
  cmake --build build --target llama-quantize -j"$(nproc)" >/dev/null
fi
python -c "import gguf; print('gguf module ok')"

echo "=== [recover3] stage3: P4 merge + GGUF Q4_K_M (seeds ${SEEDS[*]}) ==="
for SEED in "${SEEDS[@]}"; do
  SEL=$(python -c "import json;print(json.load(open('$ART/selection-report.json'))['results']['seed$SEED']['selected'])")
  echo "--- seed $SEED selected $SEL ---"
  python "$SCRIPTS/p4_merge.py" --adapter "$RUNS/seed$SEED/$SEL" --out "$ARC/merged/seed$SEED"
  python convert_hf_to_gguf.py "$ARC/merged/seed$SEED" \
    --outtype f16 --outfile "$ARC/merged/seed$SEED-f16.gguf"
  ./build/bin/llama-quantize "$ARC/merged/seed$SEED-f16.gguf" \
    "$ART/jam-ft-qwen25-seed$SEED-$SEL.q4_k_m.gguf" Q4_K_M
  rm -rf "$ARC/merged/seed$SEED-f16.gguf" "$ARC/merged/seed$SEED"
  tar -C "$RUNS/seed$SEED" -czf "$ART/adapters-seed$SEED.tar.gz" \
    $(cd "$RUNS/seed$SEED" && ls -d epoch*) run-config.json
done

cd "$ART" && sha256sum *.gguf *.json *.tar.gz > "$ART/artifacts.sha256"

echo "=== [recover4] final CUDA verify before releasing extra seeds ==="
python -c "import torch; assert torch.cuda.is_available(); print('cuda ready for extra seeds')"

echo "=== POD RUN COMPLETE ==="
