# deadman.ps1 - Finetune Arc v1 pod dead-man switch (P0-LOCK §12).
# Runs DETACHED (Start-Process) so it survives the advisor session. Sleeps in
# 60s ticks up to the absolute cap, then force-terminates the pod via the
# RunPod API - unless the cancel file appears first (the babysitter drops it
# after a checksum-verified fetch + clean auto-terminate).
#
#   powershell -File deadman.ps1 -PodId <id> -CapSeconds 32400 -Label podA
param(
  [Parameter(Mandatory = $true)][string]$PodId,
  [Parameter(Mandatory = $true)][int]$CapSeconds,
  [Parameter(Mandatory = $true)][string]$Label
)
$ErrorActionPreference = "Continue"
$artDir = "E:\AI\ai-jam-sessions\experiments\finetune-arc-v1\artifacts"
New-Item -ItemType Directory -Force -Path $artDir | Out-Null
$cancelFile = Join-Path $artDir "DEADMAN_CANCEL_$Label"
$logFile = Join-Path $artDir "deadman-$Label.log"

function Log($msg) { "$(Get-Date -Format o) $msg" | Add-Content -Path $logFile }

Log "armed: pod=$PodId cap=${CapSeconds}s"
$deadline = (Get-Date).AddSeconds($CapSeconds)
while ((Get-Date) -lt $deadline) {
  if (Test-Path $cancelFile) { Log "cancel file present - disarmed cleanly"; exit 0 }
  Start-Sleep -Seconds 60
}

Log "CAP REACHED - force-terminating pod $PodId"
$body = @{ query = "mutation { podTerminate(input: {podId: `"$PodId`"}) }" } | ConvertTo-Json
try {
  $r = Invoke-RestMethod -Uri "https://api.runpod.io/graphql" -Method Post -Headers @{ Authorization = "Bearer $env:RUNPOD_API_KEY"; "Content-Type" = "application/json" } -Body $body
  Log "terminate response: $($r | ConvertTo-Json -Compress -Depth 3)"
} catch {
  Log "terminate FAILED: $($_.Exception.Message) - retrying once in 120s"
  Start-Sleep -Seconds 120
  try {
    $r = Invoke-RestMethod -Uri "https://api.runpod.io/graphql" -Method Post -Headers @{ Authorization = "Bearer $env:RUNPOD_API_KEY"; "Content-Type" = "application/json" } -Body $body
    Log "terminate retry response: $($r | ConvertTo-Json -Compress -Depth 3)"
  } catch {
    Log "terminate retry FAILED: $($_.Exception.Message) - MANUAL ACTION REQUIRED"
  }
}
