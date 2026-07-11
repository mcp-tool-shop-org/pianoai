#!/usr/bin/env bash
# Finetune Arc P5 — sealed eval, once per seed (P0-LOCK.md §8).
# Re-confirms the release gate on the sealed baseline immediately before any
# model call (ANDON: FAIL halts everything), then runs the harness
# byte-identically per seed: same 16-record cohort, e3 + e3-tool, n=3,
# ollama backend, outputs OUTSIDE the published dataset tree.
#
#   bash experiments/finetune-arc/scripts/p5-run-sealed-evals.sh
set -euo pipefail

REPO=E:/AI/ai-jam-sessions
EVALS=$REPO/experiments/finetune-arc/evals
SEEDS=(13 42 271 512 1024)
cd "$REPO"

echo "=== [p5-gate] check-release-gate on the sealed slice21 baseline (ANDON) ==="
pnpm exec tsx scripts/check-release-gate.ts \
  datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json \
  | tail -5
# set -e: a FAIL exit halts here before any model call.

for SEED in "${SEEDS[@]}"; do
  echo "=== [p5] sealed eval: jam-ft-qwen25:seed$SEED ==="
  pnpm exec tsx scripts/run-jam-actions-corpus-eval.ts \
    --model "jam-ft-qwen25:seed$SEED" --backend ollama \
    --evals e3,e3-tool --sample-filter slice19-cohort --n 3 \
    --output "$EVALS/ft-seed$SEED-results.json" \
    --sample-output "$EVALS/ft-seed$SEED-sample.json"
  echo "=== [p5] seed $SEED eval COMPLETE -> ft-seed$SEED-results.json ==="
done

echo "=== P5 SEALED EVALS COMPLETE (5 seeds) ==="
