#!/usr/bin/env bash
# Finetune Arc — amendment A2 extension: seeds 512 + 1024 (5-seed matrix per
# L8's stated preference). Waits for the main pod_run.sh to finish, then
# trains the two extra seeds, re-runs P3 selection over ALL runs/seed*
# (deterministic greedy — existing seeds re-select identically, producing one
# unified 5-seed report), exports the two new selected checkpoints, and
# regenerates artifacts.sha256. Appends to the same pod_run.log.
#
#   setsid nohup bash /workspace/arc/scripts/pod_run_extra.sh \
#     >> /workspace/arc/pod_run.log 2>&1 &
set -euo pipefail

ARC=/workspace/arc
DATA=$ARC/data
SCRIPTS=$ARC/scripts
RUNS=$ARC/runs
ART=$ARC/artifacts
EXTRA_SEEDS=(512 1024)
export HF_HOME=/workspace/hf
export PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True

echo "=== [extra] waiting for main run to complete ==="
until grep -q "POD RUN COMPLETE" "$ARC/pod_run.log" 2>/dev/null; do sleep 60; done
sleep 30

echo "=== [extra-stage1] P2 train: seeds ${EXTRA_SEEDS[*]} ==="
# main run's merged bf16 dirs are no longer needed once its GGUFs exist
rm -rf "$ARC"/merged/seed*
for SEED in "${EXTRA_SEEDS[@]}"; do
  echo "--- seed $SEED ---"
  python "$SCRIPTS/train_finetune_arc.py" \
    --data "$DATA/sft-train.jsonl" --tools "$DATA/tools.json" \
    --out "$RUNS/seed$SEED" --seed "$SEED" \
    --per-device-batch 1 --grad-accum 8
  cp "$RUNS/seed$SEED/run-config.json" "$ART/run-config-seed$SEED.json"
done

echo "=== [extra-stage2] P3 unified selection over all 5 seeds ==="
python "$SCRIPTS/p3_select.py" \
  --data "$DATA/sft-inner-val.jsonl" --tools "$DATA/tools.json" \
  --runs-dir "$RUNS" --out "$ART/selection-report.json"

echo "=== [extra-stage3] P4 merge + GGUF for extra seeds ==="
cd /workspace/llama.cpp
for SEED in "${EXTRA_SEEDS[@]}"; do
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

cd "$ART" && sha256sum *.gguf *.json *.tar.gz > "$ART/artifacts.sha256" && cat "$ART/artifacts.sha256"
echo "=== EXTRA SEEDS COMPLETE (5-seed matrix ready) ==="
