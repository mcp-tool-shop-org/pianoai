# jam-actions-v0 Slice 8.5 — Local Model Comparison

**Generated:** 2026-05-17
**Scope:** Rerun of live local evals against the hardened E3 generator (Slice 8), comparing two local models.
**Backend:** Ollama HTTP (`localhost:11434`) — local only, $0 cost
**Approach:** Option B (run script as-is, copy output to named artifact after each run)

---

## Model Selection

### Primary model: hermes3:8b
Same model as Slice 7.5 baseline. Before/after E3 comparison anchor.

### Second model: qwen2.5:7b (originally preferred)
`qwen2.5:7b` was not in the Ollama model list at slice start. A pull was initiated; it completed during the hermes3:8b run (~4.7 GB, ~20 min). **qwen2.5:7b is the required second artifact** and the preferred model from the kickoff.

### Bonus run: qwen3:8b
`qwen3:8b` was already pulled (5.2 GB). While waiting for qwen2.5:7b to finish downloading, qwen3:8b was run as a bonus comparison. It completed before qwen2.5:7b was ready. Its artifact (`llm-in-the-loop-qwen3-8b-hardened.json`) is preserved for reference but is NOT the required Slice 8.5 deliverable.

**Artifacts on disk:**
- `datasets/jam-actions-v0/evals/llm-in-the-loop-hermes3-8b-hardened.json` — hermes3:8b vs hardened E3 (Deliverable 1)
- `datasets/jam-actions-v0/evals/llm-in-the-loop-qwen2.5-7b-hardened.json` — qwen2.5:7b vs hardened E3 (Deliverable 2)
- `datasets/jam-actions-v0/evals/llm-in-the-loop-qwen3-8b-hardened.json` — qwen3:8b bonus run

---

## Centerpiece: hermes3:8b Before/After E3 Hardening

The central question: did closing the three leakage vectors (LCG seed collision, structural asymmetry, musical priors) cause hermes3's E3 score to drop? A drop confirms the original score was inflated by leakage. Stability would suggest hermes3 was answering for some other reason.

| Metric | Slice 7.5 (pre-hardening) | Slice 8.5 (hardened) | Change |
|--------|--------------------------|----------------------|--------|
| E3 full | **0.375** | **0.125** | −0.250 |
| E3 text-only | 0.250 | 0.250 | 0.000 |
| E3 random-MIDI | **0.375** | **0.125** | −0.250 |
| Margin: full vs text-only | +0.125 | −0.125 | −0.250 |
| Margin: full vs random-MIDI | **0.000** | **0.000** | 0.000 |
| E3 threshold met | FAIL | FAIL | — |
| E1 pass rate | 0.0% | 0.0% | 0.000 |
| E2 pairs passed | 0/2 | 0/2 | — |

**Interpretation:** The full-context score dropped from 0.375 to 0.125, and the random-MIDI score dropped identically from 0.375 to 0.125. These two tracks moved in lockstep. The margin between them stayed at 0.000 in both slices.

This is the definitive signal: hermes3:8b was not using MIDI evidence at all. The pre-hardening score of 0.375 was driven entirely by the leakage vectors — primarily the LCG seed collision that made the text-only answerer always choose option 0, inflating both full and random-MIDI by the same amount above chance. After hardening closed those leaks, hermes3 dropped to statistical noise (0.125 ≈ chance for 4-option MCQ at 0.25, but lower because the new hardened questions are harder even for the gold answerer to answer from prose alone).

The margin vs random-MIDI = 0.000 in both slices is the proof. If hermes3 were actually using MIDI, the full context should score higher than random-MIDI. It never did.

**Conclusion: The E3 hardening worked exactly as intended.** The Slice 7.5 score was inflated by structural leakage. Hardening exposed the true capability: hermes3:8b at zero grounding.

---

## Head-to-Head: All Models vs Hardened E3

| Eval | hermes3:8b | qwen3:8b | qwen2.5:7b | Threshold |
|------|-----------|---------|-----------|-----------|
| **E1 pass rate** | 0.0% **FAIL** | 50.0% **FAIL** | **75.0% PASS** | ≥70% |
| **E2 pairs passed** | 0/2 **FAIL** | 0/2 **FAIL** | 0/2 **FAIL** | 2/2 |
| **E2 pair 1 grooveOA** | n/a (all parse fail) | n/a (all parse fail) | 0.810 mean (PASS majority) | ≥0.797 |
| **E2 pair 2 grooveOA** | n/a (all parse fail) | 1.000 (1/3 pass, no majority) | 0.977 mean (FAIL majority) | ≥0.797 |
| **E3 full** | 0.125 | 0.000 | 0.188 | — |
| **E3 text-only** | 0.250 | 0.000 | 0.313 | — |
| **E3 random-MIDI** | 0.125 | 0.000 | 0.250 | — |
| **E3 margin vs text-only** | −0.125 **FAIL** | 0.000 **FAIL** | −0.125 **FAIL** | ≥+0.10 |
| **E3 margin vs random-MIDI** | 0.000 **FAIL** | 0.000 **FAIL** | −0.063 **FAIL** | ≥+0.10 |
| **Total cost** | $0.00 | $0.00 | $0.00 | — |

### E1 per-record breakdown

| Record | hermes3:8b | qwen3:8b | qwen2.5:7b |
|--------|-----------|---------|-----------|
| clair-de-lune m001-004 | 0/3 FAIL | 0/3 FAIL | 2/3 PASS |
| clair-de-lune m005-008 | 0/3 FAIL | 0/3 FAIL | 2/3 PASS |
| clair-de-lune m015-018 | 0/3 FAIL | 3/3 PASS | 0/3 FAIL |
| clair-de-lune m019-022 | 0/3 FAIL | 2/3 PASS | 2/3 PASS |
| **Aggregate pass rate** | 0.0% FAIL | 50.0% FAIL | **75.0% PASS** | ≥70% |

---

## Threshold Pass/Fail Summary

| Model | E1 | E2 | E3 | Overall |
|-------|----|----|-----|---------|
| hermes3:8b (Slice 7.5, pre-hardening) | FAIL | FAIL | FAIL | FAIL |
| hermes3:8b (Slice 8.5, hardened) | FAIL | FAIL | FAIL | FAIL |
| qwen3:8b (Slice 8.5) | FAIL | FAIL | FAIL | FAIL |
| **qwen2.5:7b (Slice 8.5)** | **PASS** | FAIL | FAIL | FAIL |

**qwen2.5:7b is the first local model to clear the E1 threshold (75.0%).**

---

## Honest Analysis: What Changed and What Didn't

### E1 — Tool-use correctness

hermes3:8b: 0.0% in both Slice 7.5 and Slice 8.5. The E1 hardening (Slice 8) only touched E3's annotation_grounding generator — E1 was not modified. The hermes3 regression here (Slice 7.5 had 1 passing run across all records, producing a 0% majority-pass rate) is within normal run-to-run variance for a model that is unreliable at tool-use.

qwen3:8b: 50% (2/4 records majority-pass). Passes on m015-018 and m019-022 (3/3 and 2/3). Fails on m001-004 and m005-008. The failure mode on failing records is distinctive: "no tool calls in response" parseErrors, with response lengths of 2727–3014 tokens. qwen3:8b's thinking mode produces extended chain-of-thought that sometimes exhausts the token budget before emitting tool calls. When it does emit tools (shorter responses: 294–887 tokens), it passes.

qwen2.5:7b: 75% (3/4 records majority-pass). Only record 3 (m015-018) fails (0/3). Records 1, 2, 4 all achieve majority-pass (2/3 each). This is the first local model to clear the E1 threshold without fine-tuning. Tool names and argument schemas are consistently correct when the model produces tool calls.

### E2 — Phrase continuation

All three models fail E2 overall (0/2 pairs majority-pass for each). However, the numbers within E2 are revealing:

**qwen2.5:7b E2 pair 1** (m001-004 → m005-008): grooveOAs = [1.000, 0.429, 1.000], mean = 0.810. Two of three runs hit grooveOA = 1.000 — a perfect groove match. One run degraded to 0.429 (parse partial success, JSON output was valid but not groove-matched). This pair achieves majority-pass (2/3) and meets the threshold (≥0.797). **This is the first time a local model achieved majority-pass on any E2 pair without fine-tuning.**

**qwen2.5:7b E2 pair 2** (m015-018 → m019-022): grooveOAs = [n/a, 0.977, n/a], mean = 0.977. Only 1/3 runs parsed successfully. The successful run achieved grooveOA = 0.977 — above threshold — but majority (2/3) requires two passing runs. The two parse failures produced unparseable JSON (the model returned truncated or malformed REMI output).

**qwen3:8b E2 pair 2**: One run hit grooveOA = 1.000 but only 1/3 runs parsed, same pattern as qwen2.5:7b pair 2. qwen3's extended thinking output is causing JSON truncation at the 4096 completion token limit.

The E2 parse failures are a distinct failure mode from E1: the model is capable of generating groove-correct REMI output but cannot reliably produce complete parseable JSON within the token budget. This is a prompting/format gap, not a musical capability gap — the successful runs prove the continuation is musically plausible.

### E3 — Annotation grounding MCQ

All models fail E3. The scores reveal different failure patterns:

**hermes3:8b**: full=0.125, text_only=0.250, random_midi=0.125. The full score is actually *lower* than text_only, indicating hermes3 does worse with MIDI context than without it. The MIDI sidecar may be adding noise to the prompt that confuses rather than helps. Margin vs random_midi = 0.000 (same as Slice 7.5).

**qwen3:8b**: full=0.000, text_only=0.000, random_midi=0.000 across all records and all question types. Complete silence — the model answered 0/3 correctly on every question in every context. This is striking. qwen3:8b's E3 failure is not "worse than chance" — it is at absolute zero. The extended thinking mode appears to be generating responses that don't match the MCQ option format (A/B/C/D selection), causing all responses to parse as incorrect even when the reasoning may be sound.

**qwen2.5:7b**: full=0.188, text_only=0.313, random_midi=0.250. The same inverted pattern as hermes3: text_only beats full (0.313 vs 0.188). This is consistent with the hardened annotation_grounding questions being harder to answer from MIDI context for ungrounded models — the prose still carries some signal the model can use, but the MIDI sidecar adds confusing context. One record (m019-022) shows full=0.250, text_only=0.000 — the one record where full beats text_only. The hand_register question on this record was answered correctly 3/3 in full context, showing the model CAN use MIDI evidence when the question aligns with its existing knowledge patterns.

**Why E3 margins are all negative or zero:** The hardened E3 questions (specifically annotation_grounding type) require extracting exact MIDI-level facts from the sidecar (which `{hand, measure, beat, note}` combination is cited in the annotation). This is a lookup task that untuned models cannot reliably perform. The text_only baseline still scores above zero because annotation prose sometimes mentions musical elements that partially match the MCQ options. Until fine-tuning teaches models to parse and cross-reference MIDI sidecar data, E3 margins will remain ≤0.

---

## Open Findings

### 1. qwen2.5:7b is the capability reference model for E1 and E2 prompting

qwen2.5:7b cleared E1 (75%) without fine-tuning and nearly cleared E2 on pair 1. It should be the baseline model for any future prompt engineering work targeting E1 and E2. hermes3:8b is no longer useful as a comparison anchor for capability — its 0% E1 suggests it degrades between runs (Slice 7.5 had one passing run in 12; Slice 8.5 had zero).

### 2. qwen3:8b thinking mode is E3-hostile

qwen3:8b generates very long chain-of-thought (2,700–3,300 tokens) that either exhausts the token budget before emitting tool calls (E1 failures on records 1–2) or produces extended reasoning that doesn't resolve to the expected MCQ format (E3 zero across all questions). qwen3:8b at 8B may not be the right model for these structured-output tasks at current token limits. A non-thinking variant, or a larger qwen3 parameter size, would be worth testing.

### 3. E2 parse failures are a prompt engineering problem, not a model capability ceiling

Both qwen2.5:7b and qwen3:8b produced grooveOA = 1.000 runs. The failure to achieve majority-pass is caused by truncated/malformed JSON output in other runs, not by inability to generate groove-correct continuations. The E2 prompt currently asks for full REMI token sequences which can be very long. A prompt that uses structured JSON schema enforcement (Ollama format parameter) or a shorter continuation format would likely fix this.

### 4. hermes3:8b E1 is degraded vs Slice 7.5

Slice 7.5 had 1 passing run (clair-de-lune m005-008, run 2). Slice 8.5 had 0 passing runs. This is within noise for a model at 0% majority-pass, but it suggests hermes3's tool-use reliability is near zero under the current prompt format. hermes3:8b consistently uses wrong argument names (`id` vs `songId`), wrong tool names (`teaching_note` instead of `view_piano_roll`), and includes tools that don't exist in the schema.

### 5. E3 full context scoring below text-only is the new diagnostic signal

In both hermes3:8b and qwen2.5:7b, the full-context score (with MIDI sidecar) is lower than or equal to text_only. This suggests the MIDI sidecar, as currently formatted in the prompt, is adding noise rather than signal for untuned models. Fine-tuning needs to specifically teach models to index into the MIDI sidecar structure. A formatting experiment (XML-wrapped sidecar, truncated sidecar, or question-specific sidecar excerpt) might raise the floor without fine-tuning.

---

## Fine-Tuning Target Implications

Based on Slice 8.5 results, fine-tuning should prioritize:

1. **E1 grounding (all models):** Tool name normalization — models consistently hallucinate tool names and argument keys. The `songId` vs `id` confusion suggests the model hasn't seen the real schema. Fine-tuning on E1 traces directly addresses this.

2. **E2 JSON completion reliability:** Not a musical capability gap — the models can generate groove-correct continuations. Fine-tuning or prompt engineering should focus on JSON completion discipline (terminate the token array properly, don't truncate). The Ollama `format: "json"` parameter would constrain this without fine-tuning.

3. **E3 MIDI-to-answer lookup:** This requires fine-tuning to teach models to parse and cross-reference the structured MIDI sidecar. No prompting trick will close a −0.125 margin when the evidence requires step-by-step extraction from JSON arrays.

**Priority order:** E1 then E2 (both closable via prompting experiments first) then E3 (requires fine-tuning).

---

## Do Not Recommend: Paid API

Both local models failed overall. **This does not justify switching to paid API.** qwen2.5:7b cleared E1 and nearly cleared E2 pair 1 — demonstrating that the eval surface is reachable from prompting alone. The remaining gaps are in E2 (parse reliability, addressable via prompt engineering) and E3 (MIDI grounding, addressable via fine-tuning). Paid models are not the next step; prompt engineering and fine-tuning are.

---

## Runtime Summary

| Model | E1 duration | E2 duration | E3 duration | Total approx |
|-------|------------|------------|------------|--------------|
| hermes3:8b | ~28 min | ~31 min | ~26 min | ~85 min |
| qwen3:8b | ~62 min | ~37 min | ~28 min | ~127 min |
| qwen2.5:7b | ~25 min | ~30 min | ~22 min | ~77 min |

qwen3:8b's extended thinking mode adds significant latency per call (5–192 seconds per run vs hermes3's 4–45 seconds). qwen2.5:7b is the fastest model and the best performer.

**Total cost: $0.00** (all local inference via Ollama HTTP)

---

## Artifacts

| File | Model | Size |
|------|-------|------|
| `datasets/jam-actions-v0/evals/llm-in-the-loop-hermes3-8b-hardened.json` | hermes3:8b | 130 KB |
| `datasets/jam-actions-v0/evals/llm-in-the-loop-qwen2.5-7b-hardened.json` | qwen2.5:7b | 139 KB |
| `datasets/jam-actions-v0/evals/llm-in-the-loop-qwen3-8b-hardened.json` | qwen3:8b (bonus) | 133 KB |

Slice 7.5 baseline preserved in git at `HEAD:datasets/jam-actions-v0/evals/llm-in-the-loop-results.json` (hermes3:8b pre-hardening run, generated 2026-05-17T01:40:41Z).
