# Near-gate probe — what the adapters compare, and what they read instead

Evaluation only. 72 takes on the nine held-out songs, built by chunk 30 (`datasets/jam-actions-v1-probe/`,
schema `jam-actions-v1-probe/1.0.0`): four bands × both signs × nine songs, every take measured within
±8 ms or ±3 cents of its target. Never split, never trained on. Predicted 2026-09-09 (UTC) on the rig's
RTX 5090 with the base and the two adapters already on disk; no pod. Tool-less on the probe: 18/72,
below the three-way floor of 24/72.

| band | measured | gold |
|---|---|---|
| onset_in | \|onset\| 25.1–33.0 ms, cents ≈ 20 | match |
| onset_out | \|onset\| 48.3–56.2 ms, cents ≈ 20 | timing_fail |
| cents_in | \|cents\| 42.0–48.0, onset 1.9 ms | match |
| cents_out | \|cents\| 52.0–58.0, onset 1.9 ms | pitch_fail |

## Scores

| condition | onset_in | onset_out | cents_in | cents_out | total | lines parse | numbers copied |
|---|---|---|---|---|---|---|---|
| base | 6/18 | 1/18 | 8/18 | 5/18 | 20/72 | 0/72 | — |
| r26 adapter (trained where sign was informative) | 10/18 | 9/18 | 9/18 | 9/18 | 37/72 | 72/72 | 72/72 |
| r28 adapter (trained where sign was uninformative) | 11/18 | 9/18 | 18/18 | 0/18 | 38/72 | 72/72 | 72/72 |

Every score of 9/18 on a both-signs band is one sign right and the other wrong.

## What the words say

The comparison line makes the rule the model applied readable. On the onset bands, both adapters:

| measured onset | gold | word written (r26) | word written (r28) |
|---|---|---|---|
| −56.2 (×9) | against | inside ×9 | inside ×9 |
| −33.0 (×9) | inside | inside ×9 | inside ×9 |
| +25.1 (×9) | inside | against ×8, inside ×1 | against ×7, inside ×2 |
| +48.3 (×9) | against | against ×9 | against ×9 |

**Negative onset ⇒ `inside`, positive onset ⇒ `against`.** The magnitude plays no part: −56.2 is
"inside 40" and 25.1 is "against a 40-ms gate". In the training corpus every timing failure was late
and every early onset was inside the gate, so that rule scored 18/18 there and was never a comparison.

On the cents bands:

| adapter | flat, inside (−42…−48) | flat, outside (−52…−58) | sharp, inside | sharp, outside |
|---|---|---|---|---|
| r26 | against ×9 | against ×9 | inside ×9 | inside ×9 |
| r28 | inside ×9 | inside ×9 | inside ×9 | inside ×9 |

r26 reads the sign, exactly as `RESULTS-r26.md` diagnosed. r28, trained where the sign says nothing,
writes `inside` for every cents value from −58 to +58: with the shortcut removed it has no rule at all
on the pitch axis.

## The conclusion for the recipe

Across five training runs, the Qwen2.5-3B rank-16 LoRA on this corpus has learned, completely, the
output format and the copying of two numbers into it. It has learned no comparison against either
gate. Every point above the floor on the acoustic family — 20/27, 47/54, 38/54 — came from the format,
the class vocabulary, and single-token cues (a minus sign, a sign on the onset) that the corpus of the
moment happened to correlate with a class. The near-gate probe is the first test set where no such cue
exists, and there both adapters sit at 37–38/72 against a base of 20/72 and a floor of 24/72: above the
base on format, at chance on the rule.

This is not a corpus finding. The corpus is at the floor tool-less, gives the answer away nowhere, and
the visible rule in the target is what made every one of these readings possible. It is a finding about
what a 3B model with a rank-16 adapter and ~100 examples per axis will do when asked to emit a
threshold comparison: it will emit the shape and fill it by the cheapest cue available.

## Run facts

| | |
|---|---|
| hardware | RTX 5090, ComfyUI's embedded Python (torch 2.12 cu130, transformers 5.9, peft 0.20 side-loaded) |
| memory | math SDPA kernel disabled — it peaks at 30.6 GiB on a 13k-token prompt; flash/mem-efficient peaks at 8.3 GiB with the adapter |
| interference | the rig's VRAM watchdog kills this interpreter above 31,200 MiB; Ollama loading a 24B model beside it (22–25 GB) caused three kills before the runs were serialised — see `_watchdog_KILL.log` 22:50–22:56 local |
| files | `runs/probe/preds-{base,r26-epoch3,r28-epoch3}.jsonl`, raw completions included |

## Next

The recipe has been asked the same question five ways and has answered the same way. Two levers remain,
both the Director's call with a price:

1. **Arithmetic in the target.** The comparison line states the rule in words; a small model may do
   better producing digits: `|56.4| − 50 = +6.4 → against`. Constructible, re-derivable, one more 3B run
   at ≈ $1.20.
2. **A larger base.** Qwen2.5-7B-Instruct at the same recipe fits a 48 GB card at this sequence length;
   ≈ 2× the time, ≈ $2.50 on an Ada.

The probe stays as it is and is the test for either.
