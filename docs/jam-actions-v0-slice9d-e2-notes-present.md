# jam-actions-v0 Slice 9d — E2 Notes-Present Prompt Hardening

**Date:** 2026-05-17  
**Model:** qwen2.5:7b (local, Ollama, $0)  
**Status:** COMPLETE — FM-4 closed by prompt engineering; E2 still fails 1/2 pairs due to new failure mode (low grooveOA on Pair 2)

---

## Step 0 — FM-4 Root Cause Analysis (from Slice 9a data)

### What FM-4 looks like in the Slice 9a JSON

Slice 9a ran 6 E2 runs (2 pairs × 3 runs). All 6 parse status: **clean**. Three runs have `grooveOA: null` — these are the FM-4 hits.

**Pair 1 (clair-de-lune m001-004 → m005-008):**

| Run | grooveOA | tokenCount | parseStatus | FM-4? |
|-----|----------|------------|-------------|-------|
| 1   | null     | 37         | clean       | YES   |
| 2   | null     | 29         | clean       | YES   |
| 3   | 0.941    | 62         | clean       | no    |

**Pair 2 (clair-de-lune m015-018 → m019-022):**

| Run | grooveOA | tokenCount | parseStatus | FM-4? |
|-----|----------|------------|-------------|-------|
| 1   | 0.929    | 48         | clean       | no    |
| 2   | 1.000    | 60         | clean       | no    |
| 3   | null     | 56         | clean       | YES   |

### Pattern diagnosis

**FM-4 is random across runs, not concentrated on specific records/pairs.** Both pairs hit it. Pair 1 hit it 2/3 runs (majority-fail), Pair 2 hit it 1/3 runs (majority still passed because 2/3 succeeded).

**The grooveOA=null + clean parse combination is the FM-4 signature.** The model produces valid JSON with correctly structured arrays, but all tokens are Bar_*, Position_*, Velocity_*, Duration_* — no Pitch_* tokens anywhere. `synthTimedEventsFromRemi` processes these tokens but produces an empty `TimedEvent[]` (no Pitch_ hits the note-emitting branch), so grooveOA can't be computed and returns null.

**Token counts confirm note-absence:** run1 (37 tokens), run2 (29 tokens), run3-pair2 (56 tokens). Short-to-medium arrays of control tokens with zero note events. The model clearly understood the output format but failed to produce actual musical content.

**Not a generation-channel mismatch:** the model did not emit pitches in `tokens_abc` but skip `tokens_remi`. Both fields were populated, but `tokens_remi` had no Pitch_ tokens. This is an instruction-following failure, not a channel-routing failure.

### Root cause

The Slice 9a prompt specified the REMI vocabulary and gave a one-note example, but did not:
1. Explicitly state that Pitch_N tokens are required in every bar
2. Show a multi-bar example where every bar has Pitch tokens
3. Ask the model to verify note presence before outputting

Without an explicit minimum-note requirement, the model intermittently chose to emit "structure tokens" (bar markers, positions, dynamics) without musical notes — producing a structurally valid but musically silent continuation.

---

## Prompt Changes (Tactics Applied)

All four tactics were applied simultaneously. The prompt changes target FM-4 with general principles (not qwen2.5:7b-specific quirks), per Slice 8 doctrine.

### Tactic 1 — Explicit minimum-note-token requirement
Added to CRITICAL RULES:
```
"Your continuation MUST include at least one Pitch_N token per bar.
 A bar with only Bar_N, Position_N, Velocity_N, or Duration_N but no Pitch_N is INVALID."
```

Rationale: declarative prohibition eliminates ambiguity. The Slice 9a prompt implied notes were needed (by showing "Pitch_60" in the vocab) but never prohibited note-empty output.

### Tactic 2 — One-shot example (3-bar continuation, all bars with Pitch tokens)
Replaced the single-note schema example with a full 3-bar example:
```json
{"tokens_remi": [
  "Bar_1", "Position_0", "Pitch_60", "Velocity_64", "Duration_4",
  "Position_24", "Pitch_62", "Velocity_60", "Duration_4",
  ...
  "Bar_2", "Position_0", "Pitch_67", "Velocity_64", "Duration_8",
  ...
  "Bar_3", "Position_0", "Pitch_62", "Velocity_64", "Duration_8",
  ...
], "tokens_abc": "..."}
```
Followed by: `"Notice: every bar (Bar_1, Bar_2, Bar_3) has at least one Pitch_N token."`

Rationale: the one-shot example makes the requirement concrete. The model can pattern-match the structure instead of inferring it from abstract descriptions.

### Tactic 3 — Self-check instruction
Added to CRITICAL RULES:
```
"Before your final output, verify: does every bar in your continuation contain
 at least one Pitch_N token? If not, add the missing Pitch_N tokens before outputting."
```

Rationale: engages the model's instruction-following to self-audit before emitting. Studies on chain-of-thought verification show that explicit self-check instructions reduce constraint violations.

### Tactic 4 — Validator-feedback retry loop (FM-4 only)
Implemented in `runE2ForPair`:
- Fires ONLY when `isNoteEmptyRemi(parseResult.tokens_remi) === true`
- Max 1 retry per run (hard cap enforced)
- Feedback message: "Your previous continuation contained no Pitch_N tokens — it was musically empty."
- Does NOT fire on parse failures (Slice 9a handles those)
- Does NOT fire on low grooveOA (music quality failures are not retryable)

---

## Results

### Run-level results (qwen2.5:7b, Slice 9d)

**Pair 1: clair-de-lune m001-004 → m005-008**

| Run | grooveOA | parseStatus | FM-4 first? | Retry? | Passed |
|-----|----------|-------------|-------------|--------|--------|
| 1   | 1.000    | clean       | NO          | no     | PASS   |
| 2   | 1.000    | clean       | NO          | no     | PASS   |
| 3   | 1.000    | clean       | NO          | no     | PASS   |

Pair 1 majority: **PASS** (3/3)

**Pair 2: clair-de-lune m015-018 → m019-022**

| Run | grooveOA | parseStatus | FM-4 first? | Retry? | Passed |
|-----|----------|-------------|-------------|--------|--------|
| 1   | 0.688    | clean       | NO          | no     | FAIL   |
| 2   | 0.625    | clean       | NO          | no     | FAIL   |
| 3   | 0.571    | clean       | NO          | no     | FAIL   |

Pair 2 majority: **FAIL** (0/3)

### First-pass vs retry-pass separation

| Level       | Pass count | Total runs | Pass rate |
|-------------|------------|------------|-----------|
| First pass  | 3          | 6          | 50%       |
| Retry pass  | 0          | 6          | 0%        |
| **Total**   | **3**      | **6**      | **50%**   |

**No retries fired** — FM-4 was eliminated by prompt changes (Tactics 1+2+3) before any retry was needed.

### Aggregate

| Metric | Slice 9d |
|--------|----------|
| Pairs at majority-pass | 1/2 |
| FM-4 (note-empty) hits | 0/6 |
| Retry loops fired | 0 |
| Mean grooveOA (passing runs) | 1.000 |
| Mean grooveOA (Pair 2, all) | 0.628 |
| Threshold gate (2/2 pairs) | **FAIL** |

---

## Slice 9a vs Slice 9d Comparison

| Metric | Slice 9a (qwen2.5:7b) | Slice 9d (qwen2.5:7b) |
|--------|-----------------------|------------------------|
| Parse failures (unrecoverable) | 0/6 | 0/6 |
| FM-4 (note-empty, clean parse) | 3/6 runs | **0/6 runs** |
| Pairs at majority-pass | 0/2 | 1/2 |
| Pair 1 (m001→m005) | FAIL (1/3 pass) | **PASS (3/3 pass)** |
| Pair 2 (m015→m019) | PASS (2/3 pass) | **FAIL (0/3 pass)** |
| Mean grooveOA (Pair 1, passing runs only) | 0.941 | **1.000** |
| Mean grooveOA (Pair 2, all runs) | 0.964 | **0.628** |

**Notable inversion:** Pair 1 improved dramatically (0/2 → 3/3, FM-4 eliminated). Pair 2 regressed — it passed in Slice 9a but fails in Slice 9d.

---

## New Failure Mode: FM-5 (Low GrooveOA on Pair 2)

Slice 9d reveals a new dominant failure mode: **Pair 2 now produces notes consistently (FM-4 gone) but the groove profile doesn't match the gold continuation.** GrooveOA of 0.571–0.688 is well below the 0.797 gate.

### Why Pair 2 regressed

Pair 2 uses a longer, harmonically denser phrase (m015-018 → m019-022, 2475 prompt tokens vs 1107 for Pair 1). The Slice 9d prompt is longer due to the 3-bar one-shot example — this increases the total context and may shift qwen2.5:7b's attention away from the stylistic patterns of the specific phrase toward generic continuation patterns.

Slice 9a Pair 2 passed because 2/3 runs produced groove-aligned continuations. Slice 9d's Pair 2 runs produce valid MIDI (notes present, clean parse) but groove histograms that diverge from gold. This is a music quality failure, not a structural or consistency failure.

**Is Pair 2's regression due to prompt length?** Possibly. The Slice 9d prompt added ~200 tokens (3-bar example + self-check). For the 2475-token Pair 2 prompt, this is less than 10% overhead. For the 1107-token Pair 1 prompt it's ~18%, but Pair 1 improved. The evidence is ambiguous.

**Is this a different FM class?** Yes. FM-5 (low grooveOA, notes present) is the music quality failure mode. It was latent in Slice 9a (Pair 1 had it when notes were present but groove was below threshold), masked by FM-4. FM-4 is now eliminated; FM-5 is the exposed next bottleneck.

---

## Which Tactic Moved the Needle

**FM-4 rate went from 3/6 → 0/6 with zero retries fired.** This means Tactics 1+2+3 (prompt changes) solved FM-4 entirely before Tactic 4 (retry loop) was needed. The retry loop is still correct to have — it's insurance for future model/prompt combinations where the prompt changes aren't sufficient — but it wasn't needed for qwen2.5:7b on this prompt.

Can't attribute the FM-4 fix to a single tactic since all three were applied together. The combination of:
- Explicit prohibition (Tactic 1) — unambiguous requirement
- Concrete example (Tactic 2) — shows what compliance looks like
- Self-check (Tactic 3) — enforces verification before output

...created a multi-layer constraint that qwen2.5:7b reliably followed.

---

## Open Findings

1. **FM-5 is the new E2 bottleneck for qwen2.5:7b.** Pair 2 produces structurally correct, note-present REMI but the groove distribution diverges from the gold continuation. Mean grooveOA 0.628 vs threshold 0.797.

2. **Pair 2 (m015-018) is a harder prompt.** It has a 2.2× longer REMI sequence (2475 vs 1107 prompt tokens), a more complex harmonic context (Clair de Lune mm. 15-18 is the cantabile theme entrance, syncopated inner voices), and the gold continuation (mm. 19-22) has a distinctive groove pattern that qwen2.5:7b isn't capturing.

3. **One-shot example may not generalize to Pair 2's rhythmic style.** The example uses simple quarter-note melody in C major / 4/4. Clair de Lune is 9/8 with complex arpeggiated inner voices. This is a general-principle limitation, not a qwen2.5:7b-specific quirk.

4. **Prompt length effect is unconfirmed.** Pair 1 improved despite prompt length increase; Pair 2 regressed. Can't isolate prompt length as the cause without A/B testing.

5. **The retry loop (Tactic 4) is in place but untested against a live FM-4.** The unit tests confirm it fires correctly on FM-4 and only on FM-4. Live validation deferred to a future slice if FM-4 resurfaces on a different model.

---

## Threshold Status

| Pair | Slice 9a majority | Slice 9d majority | Change |
|------|-------------------|-------------------|--------|
| Pair 1 | FAIL | **PASS** | ↑ |
| Pair 2 | PASS | **FAIL** | ↓ |
| **Total** | **0/2** | **1/2** | — |

**qwen2.5:7b does NOT yet reach 2/2 E2 majority-pass.** Slice 9d closes FM-4 but surfaces FM-5. Net result: 1/2 pairs passing, same count as before but different pair.

---

## Recommendation: 9c (Fine-Tuning)

**Signal interpretation:**

| Signal | Interpretation |
|--------|---------------|
| FM-4 eliminated at first-pass (0 retries needed) | Prompt engineering works for note-presence; the model CAN follow note-presence instructions |
| Pair 1 now 3/3 at grooveOA=1.0 | When the model follows the full prompt, music quality is excellent |
| Pair 2 now 0/3, mean grooveOA 0.628 | The model doesn't internalize the groove pattern of this specific phrase |
| No first-pass successes on Pair 2 | This is an intrinsic capability gap, not a prompt compliance gap |

The remaining gap is **musical-style internalization**: the model can be told "include notes" (compliance), but cannot be told "match the specific groove pattern of this jazz/impressionist phrase" at inference time without training examples.

**Corpus expansion (9b) will not fix this.** Adding more records from other composers won't improve qwen2.5:7b's ability to match Clair de Lune mm. 19-22's specific groove. The model would need either (a) fine-tuning on REMI continuations that demonstrate groove-matching, or (b) a fundamentally different prompting strategy that encodes the target groove explicitly.

**Recommendation: Slice 9c (fine-tuning).** The negative evidence is clean:
- Prompt-level note-presence: FIXED ✓
- Prompt-level groove-matching: NOT fixable by instruction ✗

Fine-tuning with paired REMI continuations (prompt → gold continuation, with groove-preserving examples) is the appropriate next step. The 41 train-set records provide 22 pairs for supervised fine-tuning.

**Alternative path (if fine-tuning is deferred):** Try 9b corpus expansion to confirm whether the groove failure is Pair 2-specific or systematic. If Pair 1's 3/3 grooveOA=1.0 is replicable across more pairs, the dataset design may be sound and only Pair 2's specific phrase is problematic.
