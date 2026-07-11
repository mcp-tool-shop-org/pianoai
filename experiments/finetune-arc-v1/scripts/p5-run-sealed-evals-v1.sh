#!/usr/bin/env bash
# Finetune Arc v1 P5 — sealed eval, once per seed (P0-LOCK-v1 §10).
# Re-confirms the release gate on the sealed baseline immediately before any
# model call (ANDON: FAIL halts everything), then runs the harness
# byte-identically per seed: same 16-record cohort, e3 + e3-tool, n=3,
# ollama backend, outputs OUTSIDE the published dataset tree. One eval per
# seed, no reruns, no cherry-picks.
#
#   bash experiments/finetune-arc-v1/scripts/p5-run-sealed-evals-v1.sh 512 1024
set -euo pipefail

REPO=E:/AI/ai-jam-sessions
EVALS=$REPO/experiments/finetune-arc-v1/evals
SEEDS=("$@")
[ ${#SEEDS[@]} -gt 0 ] || { echo "usage: p5-run-sealed-evals-v1.sh <seed> [seed…]"; exit 1; }
mkdir -p "$EVALS"
cd "$REPO"

echo "=== [p5v1-gate] check-release-gate on the sealed slice21 baseline (ANDON) ==="
pnpm exec tsx scripts/check-release-gate.ts \
  datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json \
  | tail -3
# set -e: a FAIL exit halts here before any model call.

for SEED in "${SEEDS[@]}"; do
  if [ -f "$EVALS/ft-v1-seed$SEED-results.json" ]; then
    echo "=== [p5v1] seed $SEED already evaluated — SKIPPING (no reruns)"
    continue
  fi
  echo "=== [p5v1] sealed eval: jam-ft-v1-qwen25:seed$SEED ==="
  pnpm exec tsx scripts/run-jam-actions-corpus-eval.ts \
    --model "jam-ft-v1-qwen25:seed$SEED" --backend ollama \
    --evals e3,e3-tool --sample-filter slice19-cohort --n 3 \
    --output "$EVALS/ft-v1-seed$SEED-results.json" \
    --sample-output "$EVALS/ft-v1-seed$SEED-sample.json"
  echo "=== [p5v1] seed $SEED eval COMPLETE -> ft-v1-seed$SEED-results.json ==="
done
echo "=== [p5v1] all requested seeds complete ==="
