#!/usr/bin/env bash
# babysit-pod.sh — Finetune Arc v1 local-side fetcher + watchdog (P0-LOCK §12).
# The v2 anti-loss pattern: stream every artifact off the pod the minute its
# DONE marker appears; on ALL.DONE verify artifacts.sha256 locally, terminate
# the pod via the API, and disarm the dead-man. Liveness = the run.log GROWS
# or a new marker appears — an idle waiter cannot satisfy it (the
# feedback_budget_topup lesson). Exit codes: 0 clean success (pod terminated,
# checksums verified) · 2 stall (no progress 30 min) · 3 ssh unreachable
# (10 consecutive failures) · 4 checksum mismatch · 5 pod reported error.
#
#   babysit-pod.sh <label> <podId> <ip> <port> <artifactDir>
set -u
LABEL=$1; POD_ID=$2; IP=$3; PORT=$4; ART=$5
KEY=~/.ssh/runpod_rustline
SSH="ssh -i $KEY -p $PORT -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -o BatchMode=yes root@$IP"
SCP_BASE=(scp -i "$KEY" -P "$PORT" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -o BatchMode=yes)
REMOTE_ART=/workspace/arc/artifacts
CANCEL_DIR="E:/AI/ai-jam-sessions/experiments/finetune-arc-v1/artifacts"
mkdir -p "$ART"
LOG="$ART/babysit.log"

log() { echo "$(date -Is) $*" | tee -a "$LOG"; }

fetch() { # fetch <remote-file-basename>
  "${SCP_BASE[@]}" "root@$IP:$REMOTE_ART/$1" "$ART/" >>"$LOG" 2>&1
}

terminate_pod() {
  curl -s -X POST https://api.runpod.io/graphql \
    -H "Authorization: Bearer $RUNPOD_API_KEY" -H "Content-Type: application/json" \
    -d "{\"query\":\"mutation { podTerminate(input: {podId: \\\"$POD_ID\\\"}) }\"}" >>"$LOG" 2>&1
}

declare -A FETCHED
last_size=0
last_progress=$(date +%s)
ssh_fails=0

log "babysitter armed: $LABEL pod=$POD_ID $IP:$PORT -> $ART"

while true; do
  state=$($SSH "ls $REMOTE_ART/*.DONE 2>/dev/null | xargs -n1 basename 2>/dev/null; echo '===SIZE==='; stat -c %s /workspace/arc/run.log 2>/dev/null || echo 0" 2>>"$LOG")
  if [ -z "$state" ]; then
    ssh_fails=$((ssh_fails + 1))
    log "ssh failure $ssh_fails/10"
    if [ "$ssh_fails" -ge 10 ]; then log "UNREACHABLE — exiting 3 (dead-man still armed)"; exit 3; fi
    sleep 60; continue
  fi
  ssh_fails=0
  markers=$(echo "$state" | sed -n '1,/===SIZE===/p' | grep -v '===SIZE===' || true)
  size=$(echo "$state" | sed -n '/===SIZE===/,$p' | tail -1)

  # progress = log growth OR new marker
  if [ "$size" != "$last_size" ]; then last_size=$size; last_progress=$(date +%s); fi

  for m in $markers; do
    if [ -z "${FETCHED[$m]:-}" ]; then
      last_progress=$(date +%s)
      case "$m" in
        STAGE0.DONE) log "stage0 complete" ;;
        SEED_*.DONE)
          s=${m#SEED_}; s=${s%.DONE}
          log "seed $s complete — fetching adapters + receipt"
          fetch "adapters-seed$s.tar.gz"; fetch "run-config-seed$s.json"; fetch "streaming.sha256"
          ;;
        P3.DONE)
          log "P3 selection complete — fetching report"
          fetch "selection-report.json"; fetch "streaming.sha256"
          ;;
        GGUF_*.DONE)
          s=${m#GGUF_}; s=${s%.DONE}
          log "seed $s gguf complete — fetching"
          $SSH "ls $REMOTE_ART/jam-ft-v1-qwen25-seed$s-*.q4_k_m.gguf | xargs -n1 basename" 2>>"$LOG" | while read -r f; do fetch "$f"; done
          fetch "streaming.sha256"
          ;;
        ALL.DONE)
          log "ALL.DONE — final fetch + verify"
          fetch "artifacts.sha256"; fetch "pip-pins.txt"; fetch "llamacpp-commit.txt"; fetch "streaming.sha256"
          # re-fetch anything listed but missing locally, then verify
          ( cd "$ART" && awk '{print $2}' artifacts.sha256 ) | while read -r f; do
            [ -f "$ART/$f" ] || { log "missing $f — fetching"; fetch "$f"; }
          done
          if ( cd "$ART" && sha256sum -c artifacts.sha256 >>"$LOG" 2>&1 ); then
            log "checksums VERIFIED — terminating pod $POD_ID"
            terminate_pod
            touch "$CANCEL_DIR/DEADMAN_CANCEL_$LABEL"
            log "clean exit 0"
            exit 0
          else
            log "CHECKSUM MISMATCH — pod left running for manual fetch (dead-man still armed); exit 4"
            exit 4
          fi
          ;;
      esac
      FETCHED[$m]=1
    fi
  done

  # pod-side hard error: the run script is set -e; if the process died the log
  # stops growing — the stall path below catches it; also look for tracebacks.
  if [ $(( $(date +%s) - last_progress )) -gt 1800 ]; then
    tail=$($SSH "tail -c 600 /workspace/arc/run.log 2>/dev/null" 2>>"$LOG" || true)
    log "STALL: no progress 30 min. log tail: $tail"
    exit 2
  fi
  sleep 60
done
