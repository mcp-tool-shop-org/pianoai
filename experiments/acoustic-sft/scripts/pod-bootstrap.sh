#!/usr/bin/env bash
# Acoustic SFT — what runs ON THE POD, in order, once files are synced.
#
# The pod is billing from the moment it boots, so this script is ordered by how
# cheap each check is: GPU, then dependencies, then a data dry-run that needs no
# weights, and only then the download and the training. Every step that can fail
# fails here rather than twenty minutes into a run.
#
#   bash pod-bootstrap.sh dry     # deps + tokenize only. No weights. Minutes.
#   bash pod-bootstrap.sh smoke   # one optimiser step end to end.
#   bash pod-bootstrap.sh train   # the real run.
#
# It never tears the pod down. Teardown is the operator's, from the studio rig,
# because a script that can delete the thing it is running on has no way to
# report that it did.

set -euo pipefail

MODE="${1:-dry}"
WORK="${WORK:-/workspace/acoustic-sft}"
OUT="${OUT:-$WORK/runs/seed13}"

say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

say "GPU"
if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "FATAL: no nvidia-smi. This is not a GPU pod, or the driver is missing."
  exit 1
fi
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
python3 - <<'PY'
import torch, sys
if not torch.cuda.is_available():
    sys.exit("FATAL: torch cannot see the GPU. Wrong image for this card?")
cap = torch.cuda.get_device_capability(0)
print(f"torch {torch.__version__} | cuda {torch.version.cuda} | sm_{cap[0]}{cap[1]}")
if cap[0] >= 12 and int(torch.version.cuda.split('.')[0]) < 12:
    sys.exit("FATAL: Blackwell (sm_120) needs a CUDA 12.9+ build. Wrong image.")
PY

say "Dependencies"
# torch ships in the image. These do not. Pinned loosely on purpose: the image's
# torch is the constraint, and pinning transformers hard against an unknown
# future image is how you get an unsolvable resolve on a billing pod.
# --break-system-packages: the RunPod image ships a Debian-managed python3 that
# refuses system-wide installs under PEP 668. A venv is the usual answer, but
# torch lives in THAT interpreter and re-resolving a 16 GB CUDA build inside a
# venv on a billing host is the wrong trade. The pod is disposable; installing
# beside its torch is the point.
pip install --quiet --no-input --break-system-packages   "transformers>=4.44" "peft>=0.13" "accelerate>=0.34"
python3 - <<'PY'
import importlib.metadata as md
for p in ("torch", "transformers", "peft", "accelerate"):
    try:
        print(f"  {p}: {md.version(p)}")
    except md.PackageNotFoundError:
        raise SystemExit(f"FATAL: {p} did not install")
PY

say "Data present"
test -f "$WORK/data/sft-train.jsonl" || { echo "FATAL: no training data at $WORK/data/. Sync it first."; exit 1; }
test -f "$WORK/tool-schemas.json"    || { echo "FATAL: no tool catalog at $WORK/tool-schemas.json. Sync it first."; exit 1; }
test -f "$WORK/lora-config.json"     || { echo "FATAL: no lora-config.json. Sync it first."; exit 1; }
wc -l "$WORK/data/sft-train.jsonl"

# Everything above is free. Below this line the run can download weights.
COMMON=(--data "$WORK/data/sft-train.jsonl"
        --tools-file "$WORK/tool-schemas.json"
        --config "$WORK/lora-config.json")

case "$MODE" in
  dry)
    say "Dry run — render, tokenize, report. No weights, no gradient."
    # The tokenizer alone is a small download; the model is not touched.
    python3 "$WORK/scripts/train_acoustic_sft.py" "${COMMON[@]}" --dry-run --tools full
    echo
    echo "Read the token line above. If examples exceed max_seq_len, raise it in"
    echo "lora-config.json (or use --tools listen) BEFORE training. The trainer"
    echo "refuses to truncate."
    ;;
  smoke)
    say "Smoke — one optimiser step, then stop."
    python3 "$WORK/scripts/train_acoustic_sft.py" "${COMMON[@]}" --smoke --out "$OUT-smoke"
    ;;
  train)
    say "Training"
    python3 "$WORK/scripts/train_acoustic_sft.py" "${COMMON[@]}" --out "$OUT"
    say "Adapters"
    ls -la "$OUT"
    echo
    echo "Pull them to the studio rig, THEN tear the pod down:"
    echo "  scp -r -P <port> root@<ip>:$OUT ./runs/"
    echo "  node runpod.mjs down <podId>"
    ;;
  *)
    echo "usage: bash pod-bootstrap.sh [dry|smoke|train]"
    exit 2
    ;;
esac

say "Done — the pod is STILL BILLING"
echo "Tear it down from the studio rig: node runpod.mjs down <podId>"
