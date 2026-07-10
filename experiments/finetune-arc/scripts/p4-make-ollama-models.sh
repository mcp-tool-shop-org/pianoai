#!/usr/bin/env bash
# Finetune Arc P4b (local) — register per-seed Q4_K_M GGUFs as ollama models
# with TEMPLATE + SYSTEM copied byte-identical from the baseline qwen2.5:7b tag
# (P0-LOCK.md §7). Run from experiments/finetune-arc/ after downloading
# artifacts/ from the pod.
#
#   bash scripts/p4-make-ollama-models.sh
set -euo pipefail

cd "$(dirname "$0")/.."
ART=artifacts
OUT=$ART/p4-receipt.json

command -v ollama >/dev/null || { echo "ollama not on PATH"; exit 1; }
ollama show qwen2.5:7b >/dev/null || { echo "baseline tag qwen2.5:7b missing — ollama pull qwen2.5:7b"; exit 1; }

TEMPLATE_FILE=$(mktemp)
SYSTEM_FILE=$(mktemp)
ollama show qwen2.5:7b --template > "$TEMPLATE_FILE"
ollama show qwen2.5:7b --system > "$SYSTEM_FILE" || true

BASELINE_QUANT=$(ollama show qwen2.5:7b | awk '/quantization/{print $2}')
echo "baseline quant: $BASELINE_QUANT (expect Q4_K_M)"
[ "$BASELINE_QUANT" = "Q4_K_M" ] || { echo "ANDON: baseline quant is $BASELINE_QUANT, not Q4_K_M — parity broken"; exit 1; }

RECEIPT='{"schema":"finetune-arc-p4-receipt/1.0.0","baseline_tag":"qwen2.5:7b","baseline_quant":"'$BASELINE_QUANT'","models":['
FIRST=1
for GGUF in "$ART"/jam-ft-qwen25-seed*.q4_k_m.gguf; do
  BASE=$(basename "$GGUF")
  SEED=$(echo "$BASE" | sed -E 's/jam-ft-qwen25-(seed[0-9]+)-.*/\1/')
  EPOCH=$(echo "$BASE" | sed -E 's/.*-(epoch[0-9]+)\.q4_k_m\.gguf/\1/')
  NAME="jam-ft-qwen25:$SEED"
  SHA=$(sha256sum "$GGUF" | awk '{print $1}')
  DIR=$(mktemp -d)
  cp "$GGUF" "$DIR/model.gguf"
  {
    echo "FROM ./model.gguf"
    printf 'TEMPLATE """%s"""\n' "$(cat "$TEMPLATE_FILE")"
    if [ -s "$SYSTEM_FILE" ]; then
      printf 'SYSTEM """%s"""\n' "$(cat "$SYSTEM_FILE")"
    fi
  } > "$DIR/Modelfile"
  echo "creating $NAME from $BASE ($EPOCH)"
  ollama create "$NAME" -f "$DIR/Modelfile"
  QUANT=$(ollama show "$NAME" | awk '/quantization/{print $2}')
  [ "$QUANT" = "$BASELINE_QUANT" ] || { echo "ANDON: $NAME quant $QUANT != baseline $BASELINE_QUANT"; exit 1; }
  [ $FIRST -eq 1 ] || RECEIPT+=','
  FIRST=0
  RECEIPT+='{"name":"'$NAME'","gguf":"'$BASE'","selected_epoch":"'$EPOCH'","gguf_sha256":"'$SHA'","quant":"'$QUANT'"}'
  rm -rf "$DIR"
done
RECEIPT+='],"template_source":"ollama show qwen2.5:7b --template (byte-identical copy)","parameters":"none (baseline tag sets none; harness sends none)"}'
echo "$RECEIPT" | node -e "process.stdout.write(JSON.stringify(JSON.parse(require('fs').readFileSync(0,'utf8')),null,2)+'\n')" > "$OUT"
rm -f "$TEMPLATE_FILE" "$SYSTEM_FILE"
echo "P4 receipt -> $OUT"
ollama list | grep jam-ft || true
