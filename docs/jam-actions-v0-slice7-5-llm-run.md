# jam-actions-v0 Slice 7.5 — LLM-in-the-Loop Results

**Generated:** 2026-05-17T01:40:41.110Z
**Backend:** ollama
**Model:** hermes3:8b
**Test set:** clair-de-lune:m001-004:piano:mcp-session:v1, clair-de-lune:m005-008:piano:mcp-session:v1, clair-de-lune:m015-018:piano:mcp-session:v1, clair-de-lune:m019-022:piano:mcp-session:v1
**n per task:** 3 (majority-pass = ≥2/3)
**Total cost:** $0.00 (local — free)

---

## Summary

| Eval | Result | Threshold |
|------|--------|-----------|
| E1 — Tool-use correctness | FAIL — 0.0% pass rate | ≥ 70.0% |
| E2 — Phrase continuation | FAIL — 0/2 pairs | groove OA ≥ 0.797 |
| E3 — Annotation grounding | FAIL — margins below | full > baselines by ≥ 0.1 |

---

## Backend Architecture

- **Primary local backend:** `ollama-intern` (wraps raw Ollama HTTP to localhost:11434)
- **Secondary local backend:** `ollama` (direct raw Ollama HTTP)
- **Optional paid backend:** `anthropic` (requires ANTHROPIC_API_KEY; gated behind --backend anthropic)

### ollama-intern finding

`ollama-intern-mcp` exposes `ollama_chat` (generic chat tool with messages[], system, model).
For eval purposes, the OllamaInternBackend calls Ollama HTTP directly (same endpoint the intern uses
internally) rather than adding MCP protocol overhead. This is the correct behavior for iterative eval
loops — the intern's value is in bulk analysis, corpus management, and memory, not raw inference.

### Model recommendations

For tool-use evals (E1), use a model with native function-calling support:
- `hermes3:8b` — best tool-use in 8B class
- `qwen2.5:7b` — solid alternative
- `llama3.1:8b` — Llama 3.1+ has native tool-use

Pull models before running: `ollama pull hermes3:8b`

---

## E1 — Tool-Use Correctness

Threshold: ≥ 70.0% of records pass (majority-pass per record).

**clair-de-lune:m001-004:piano:mcp-session:v1** — FAIL (0/3 runs passed)
- Run 1: FAIL | tokens: 4096/193 | cost: $0.00 (local — free) | 42148ms
- Run 2: FAIL | tokens: 4096/170 | cost: $0.00 (local — free) | 3854ms
- Run 3: FAIL | tokens: 4096/180 | cost: $0.00 (local — free) | 3960ms

**clair-de-lune:m005-008:piano:mcp-session:v1** — FAIL (1/3 runs passed)
- Run 1: FAIL | tokens: 4096/219 | cost: $0.00 (local — free) | 4520ms
- Run 2: PASS | tokens: 4096/283 | cost: $0.00 (local — free) | 5253ms
- Run 3: FAIL | tokens: 4096/144 | cost: $0.00 (local — free) | 3497ms | parseError: Error: Model hermes3:8b returned no tool calls. Ensure you are using a model with native tool-use support (hermes3:8b, qwen2.5:7b, llama3.1:8b+).

**clair-de-lune:m015-018:piano:mcp-session:v1** — FAIL (1/3 runs passed)
- Run 1: FAIL | tokens: 4096/158 | cost: $0.00 (local — free) | 3695ms
- Run 2: FAIL | tokens: 4096/215 | cost: $0.00 (local — free) | 4404ms
- Run 3: PASS | tokens: 4096/190 | cost: $0.00 (local — free) | 4090ms

**clair-de-lune:m019-022:piano:mcp-session:v1** — FAIL (0/3 runs passed)
- Run 1: FAIL | tokens: 4096/274 | cost: $0.00 (local — free) | 5161ms
- Run 2: FAIL | tokens: 4096/62 | cost: $0.00 (local — free) | 2515ms | parseError: Error: Model hermes3:8b returned no tool calls. Ensure you are using a model with native tool-use support (hermes3:8b, qwen2.5:7b, llama3.1:8b+).
- Run 3: FAIL | tokens: 4096/360 | cost: $0.00 (local — free) | 6413ms

**Aggregate:** 0.0% (0/4) → **FAIL**

---

## E2 — Phrase Continuation

Threshold: groove OA ≥ 0.797 for majority of runs per pair.

**clair-de-lune:m001-004:piano:mcp-session:v1 → clair-de-lune:m005-008:piano:mcp-session:v1** — FAIL (0/3)
Mean groove OA: n/a (threshold: 0.797)
- Run 1: FAIL | grooveOA: n/a | cost: $0.00 (local — free) | 13575ms
- Run 2: FAIL | grooveOA: n/a | cost: $0.00 (local — free) | 16440ms
- Run 3: FAIL | grooveOA: n/a | cost: $0.00 (local — free) | 6313ms

**clair-de-lune:m015-018:piano:mcp-session:v1 → clair-de-lune:m019-022:piano:mcp-session:v1** — FAIL (0/3)
Mean groove OA: n/a (threshold: 0.797)
- Run 1: FAIL | grooveOA: n/a | cost: $0.00 (local — free) | 18415ms
- Run 2: FAIL | grooveOA: n/a | cost: $0.00 (local — free) | 44693ms
- Run 3: FAIL | grooveOA: n/a | cost: $0.00 (local — free) | 28330ms

**Aggregate:** 0/2 pairs → **FAIL**

---

## E3 — Annotation Grounding MCQ

Question types: load-bearing only (pitch_class_count, hand_register, rhythm_onset, annotation_grounding).
Three contexts: full (MIDI+annotation), text-only (annotation prose only), random-MIDI (wrong MIDI).
Threshold: full > text-only by ≥ 0.1 AND full > random-MIDI by ≥ 0.1.

**clair-de-lune:m001-004:piano:mcp-session:v1**
Aggregate: full=0.500 | text_only=0.250 | random_midi=0.500
Margins: vs text_only PASS | vs random_midi FAIL
Cost: $0.00 (local — free)

  Q: pitch_class_count — "How many notes with pitch class C# appear in this phrase?..."
  Options: 6 | 3 | 4 | 8 (correct: A)
  full: PASS | text_only: FAIL | random_midi: PASS

  Q: hand_register — "Which hand plays more notes in this phrase?..."
  Options: Left hand (36 notes) | Equal (16 notes each) | Right hand (31 notes) | Right hand (32 notes) (correct: D)
  full: FAIL | text_only: FAIL | random_midi: FAIL

  Q: rhythm_onset — "How many notes start on beat 1 (downbeat) across all bars in this phra..."
  Options: 4 | 5 | 6 | 8 (correct: C)
  full: FAIL | text_only: FAIL | random_midi: FAIL

  Q: annotation_grounding — "Which of the following statements about this phrase is supported by th..."
  Options: The left hand plays more notes than the right hand | The right hand plays more notes than the left hand (RH: 32, LH: 0) | The highest pitch in this phrase is D#4 | This phrase contains 10 distinct pitch classes (correct: B)
  full: PASS | text_only: PASS | random_midi: PASS

---

**clair-de-lune:m005-008:piano:mcp-session:v1**
Aggregate: full=0.250 | text_only=0.000 | random_midi=0.250
Margins: vs text_only PASS | vs random_midi FAIL
Cost: $0.00 (local — free)

  Q: pitch_class_count — "How many notes with pitch class D# appear in this phrase?..."
  Options: 9 | 6 | 7 | 11 (correct: A)
  full: FAIL | text_only: FAIL | random_midi: FAIL

  Q: hand_register — "Which hand plays more notes in this phrase?..."
  Options: Left hand (41 notes) | Right hand (35 notes) | Equal (24 notes each) | Right hand (32 notes) (correct: B)
  full: FAIL | text_only: FAIL | random_midi: FAIL

  Q: rhythm_onset — "How many notes start on beat 1 (downbeat) across all bars in this phra..."
  Options: 12 | 10 | 11 | 14 (correct: A)
  full: FAIL | text_only: FAIL | random_midi: FAIL

  Q: annotation_grounding — "Which of the following statements about this phrase is supported by th..."
  Options: The right hand plays more notes than the left hand (RH: 35, LH: 12) | The left hand plays more notes than the right hand | The highest pitch in this phrase is G#2 | This phrase contains 10 distinct pitch classes (correct: A)
  full: PASS | text_only: FAIL | random_midi: PASS

---

**clair-de-lune:m015-018:piano:mcp-session:v1**
Aggregate: full=0.500 | text_only=0.500 | random_midi=0.500
Margins: vs text_only FAIL | vs random_midi FAIL
Cost: $0.00 (local — free)

  Q: pitch_class_count — "How many notes with pitch class A# appear in this phrase?..."
  Options: 48 | 49 | 51 | 53 (correct: C)
  full: FAIL | text_only: FAIL | random_midi: FAIL

  Q: hand_register — "Which hand plays more notes in this phrase?..."
  Options: Right hand (146 notes) | Left hand (149 notes) | Equal (77 notes each) | Right hand (144 notes) (correct: A)
  full: PASS | text_only: PASS | random_midi: PASS

  Q: rhythm_onset — "How many notes start on beat 1 (downbeat) across all bars in this phra..."
  Options: 15 | 16 | 19 | 17 (correct: D)
  full: FAIL | text_only: FAIL | random_midi: FAIL

  Q: annotation_grounding — "Which of the following statements about this phrase is supported by th..."
  Options: The right hand plays more notes than the left hand (RH: 146, LH: 7) | The left hand plays more notes than the right hand | The highest pitch in this phrase is D#1 | This phrase contains 8 distinct pitch classes (correct: A)
  full: PASS | text_only: PASS | random_midi: PASS

---

**clair-de-lune:m019-022:piano:mcp-session:v1**
Aggregate: full=0.250 | text_only=0.250 | random_midi=0.250
Margins: vs text_only FAIL | vs random_midi FAIL
Cost: $0.00 (local — free)

  Q: pitch_class_count — "How many notes with pitch class F# appear in this phrase?..."
  Options: 43 | 46 | 44 | 48 (correct: B)
  full: FAIL | text_only: FAIL | random_midi: FAIL

  Q: hand_register — "Which hand plays more notes in this phrase?..."
  Options: Left hand (104 notes) | Right hand (100 notes) | Equal (67 notes each) | Right hand (99 notes) (correct: B)
  full: FAIL | text_only: FAIL | random_midi: FAIL

  Q: rhythm_onset — "How many notes start on beat 1 (downbeat) across all bars in this phra..."
  Options: 6 | 8 | 7 | 10 (correct: B)
  full: FAIL | text_only: FAIL | random_midi: FAIL

  Q: annotation_grounding — "Which of the following statements about this phrase is supported by th..."
  Options: The left hand plays more notes than the right hand | The highest pitch in this phrase is G#1 | The right hand plays more notes than the left hand (RH: 100, LH: 34) | This phrase contains 10 distinct pitch classes (correct: C)
  full: PASS | text_only: PASS | random_midi: PASS

### Aggregate (4 records)

| Context | Score | vs Full |
|---------|-------|---------|
| Full | 0.375 | — |
| Text-only | 0.250 | 0.125 margin |
| Random-MIDI | 0.375 | 0.000 margin |

Threshold: vs text_only **PASS** | vs random_midi **FAIL**

---

## Run Commands

Local backend (no API key needed):
```
pnpm exec tsx scripts/run-llm-eval.ts --backend ollama-intern --model hermes3:8b
pnpm exec tsx scripts/run-llm-eval.ts --backend ollama --model qwen2.5:7b
```

Optional Anthropic comparison:
```
ANTHROPIC_API_KEY=sk-ant-... pnpm exec tsx scripts/run-llm-eval.ts --backend anthropic --model claude-sonnet-4-5
```

Dry-run to validate setup:
```
pnpm exec tsx scripts/run-llm-eval.ts --backend ollama --model hermes3:8b --dry-run
```
