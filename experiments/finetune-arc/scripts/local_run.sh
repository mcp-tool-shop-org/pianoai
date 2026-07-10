#!/usr/bin/env bash
# Finetune Arc — local (5090) run of record after the pod termination
# (P0-LOCK.md amendment A4). Same pinned script, same recipe, same seeds,
# same data as the cloud attempt; the venv is backpropagate's proven
# Blackwell stack, versions captured per-run in run-config.json.
#
#   bash experiments/finetune-arc/scripts/local_run.sh
set -euo pipefail

cd "$(dirname "$0")/.."
PY=E:/AI/backpropagate/.venv/Scripts/python.exe
export HF_HOME=E:/AI-Models/hf-cache
SEEDS=(13 42 271)

echo "=== [local-stage1] P2 train: seeds ${SEEDS[*]} ==="
for SEED in "${SEEDS[@]}"; do
  echo "--- seed $SEED ---"
  "$PY" scripts/train_finetune_arc.py \
    --data data/sft-train.jsonl --tools data/tools.json \
    --out "runs-local/seed$SEED" --seed "$SEED" \
    --per-device-batch 1 --grad-accum 8
  cp "runs-local/seed$SEED/run-config.json" "artifacts/run-config-seed$SEED.json"
done

echo "=== [local-stage2] P3 checkpoint selection (inner split only) ==="
"$PY" scripts/p3_select.py \
  --data data/sft-inner-val.jsonl --tools data/tools.json \
  --runs-dir runs-local --out artifacts/selection-report.json

echo "=== LOCAL TRAIN+SELECT COMPLETE ==="
