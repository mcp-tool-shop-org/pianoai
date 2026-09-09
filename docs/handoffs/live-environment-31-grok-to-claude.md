# Handoff 31 — Grok Build to Claude: near-gate probe; 500-then-present never left

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 30.** Branch `main` @ `acb9fe7`. Work uncommitted. I did **not** run the suite.
Built `datasets/jam-actions-v1-probe/` (72 records), formatted
`experiments/coverage-v1-sft/data-probe/`, ran probe tests, v0 reproduce was not
needed, RunPod unit tests, `toolless-baseline.mjs` on the probe. **No pod.**
`datasets/jam-actions-v1/` was not written.

---

## 1. Probe count and measured values per band

**72 records.** Nine held-out songs × four bands × both signs. Schema
`jam-actions-v1-probe/1.0.0`. All `split: test`. Tolerance: onset **±8 ms**,
cents **±3**. Gold from `goldFromPredicates` (`|onset| > 40` then `|cents| ≥ 50`).

| band | n | gold | measured onset | measured cents | applied delay | applied cents |
|---|---|---|---|---|---|---|
| onset_in | 18 | match | **−33.0 … 25.1** | 20.0 … 20.1 | −21 … 37 ms | 20 |
| onset_out | 18 | timing_fail | **−56.2 … 48.3** | 20.0 … 20.1 | −45 … 59 ms | 20 |
| cents_in | 18 | match | 1.9 | **−48.0 … 42.1** | 20 ms | −48 … 42 |
| cents_out | 18 | pitch_fail | 1.9 | **−58.0 … 52.2** | 20 ms | −58 … 52 |

Bias ≈ −21 ms plus SuperFlux hop 11.6 ms: applied delay for |onset|≈30 is
**37 ms** (+, measured 25.1) and **−21 ms** (−, measured −33.0); for |onset|≈50,
**59 ms** (48.3) and **−45 ms** (−56.2). Cents bands keep delay at **20 ms**
(measured onset 1.9) and search applied cents in 0.5 ¢ steps around ±45 / ±55.

Formatted with `V1_RECORDS=…/jam-actions-v1-probe/records.jsonl`
`V1_OUT=experiments/coverage-v1-sft/data-probe`: **sft-test 72, gold-test 72,
sft-train 0**.

---

## 2. Tool-less on the probe

Same script, user turn only, mistral-small:24b, `V1_RECORDS` pointing at the
probe:

**acoustic 18/72 = 25.0%.** Below the three-way floor (24/72) and the majority
class (match 36/72). The probe still needs the tools.

---

## 3. Clearance constants

**None changed.** The main corpus still uses `F5_LATE_MS_MIN = 78` and
`F5_INSIDE_ONSET_MARGIN_MS = 12`. The probe does not call `perturbationFor`; it
searches explicit applied delay/cents and labels with the predicates. Landing
measured onsets at ~50 ms is the point of the probe and would be forbidden as
training clearance. Safe because these records are never merged into
`jam-actions-v1/` and never trained on.

---

## 4. P4 — 500-then-present

Tests in `experiments/acoustic-sft/runpod.test.ts` (9/9 including these two):

| test | what it does |
|---|---|
| `adopts a session-named pod into the state file and does not DELETE` | create throws 500; list returns `acoustic-sft-YYYYMMDD-HHMM`; `adopt: true` writes `{ id, adopted: true }` and returns the pod; no DELETE |
| `tears down a session-named pod by id and never leaves it` | same 500 then list; `adopt: false` DELETEs `/pods/ghost` and returns null |

`up` after a throwing create always lists. If a pod carries this experiment's
session name it is adopted when `RUNPOD_ADOPT_ORPHAN=1` (continue polling),
otherwise torn down by id and reported. Default is teardown. A 500 with no
matching name still exits; nothing is left untracked.

---

v1 probe tests **5/5**. RunPod tests **9/9**. v1 corpus tests not re-run (tree
untouched). v0 untouched.

```
 M src/dataset/acoustic-v1/builder.ts
 M src/dataset/acoustic-v1/f5-acoustic.ts
 M src/dataset/acoustic-v1/toolless-baseline.mjs
 M experiments/acoustic-sft/runpod.mjs
 M experiments/acoustic-sft/runpod.test.ts
?? src/dataset/acoustic-v1/generate-probe.ts
?? src/dataset/acoustic-v1/probe.test.ts
?? datasets/jam-actions-v1-probe/
?? experiments/coverage-v1-sft/data-probe/
?? docs/handoffs/live-environment-31-grok-to-claude.md
```

**Yours:** J16 full verify + local prediction with the r26 and r28 adapters. The
Director has not said pod.
