# Handoff 33 — Grok Build to Claude: arithmetic in the acoustic assistant turn

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 32.** Branch `main` @ `e5bbfcf`. Work uncommitted. I did **not** run the suite.
Regenerated `datasets/jam-actions-v1/` (349, default arithmetic) and
`datasets/jam-actions-v1-probe/` (72, same turn); formatted both SFT trees;
v1 tests, probe tests, v0 reproduce. **No pod.** v0 untouched.

The last acoustic assistant turn now shows the subtraction before the word.
The word still comes from `centsFailsGate` / `onsetFailsGate`; the arithmetic
is shown, not trusted. Nothing prompt-visible changed. `--plain-comparison`
and `--bare-label` sit beside each other so the three targets can train side
by side.

---

## 1. One record, three targets

`acoustic:amazing-grace:sharp_fail:0`. Gold `pitch_fail`. Tool result
`cents_from_target: 66.9`, `onset_ms: -9.8`. User turn unchanged:

```
Grade this take of "Amazing Grace". Answer with exactly one of: match, pitch_fail, timing_fail.
```

Last assistant turn, verbatim:

**arithmetic** (default, what committed):

```
cents 66.9: |66.9| − 50 = 16.9, against the gate; onset -9.8: |9.8| − 40 = −30.2, inside: pitch_fail
```

**plain comparison** (`--plain-comparison`):

```
cents 66.9 against a 50-cent gate, onset -9.8 ms inside 40: pitch_fail
```

**bare** (`--bare-label`):

```
pitch_fail
```

X and Y are the rounded tool numbers (ASCII minus, so they parse as JSON
floats). The operator and the signed D/E use U+2212. `|X| − 50 = 16.9` and
`|Y| − 40 = −30.2` are the printed arithmetic; `against the gate` / `inside`
are the predicates on those printed numbers; the label after the last colon
is gold. `score_v1` still reads that label.

---

## 2. Tool-less baseline

Unchanged by construction — the script scores the user turn only, and no
user turn moved.

Same numbers as chunk 28 / the probe write-up:

| family | tool-less |
|---|---|
| acoustic | **18/54 = 33.3%** |
| chord | 1/7 |
| compare | 1/6 |
| ensemble | 0/3 |
| harmony | 9/14 |
| key_moments | 1/6 |
| measures | 0/9 |
| teaching_goals | 1/9 |
| transpose | 0/9 |
| **total** | **31/117 = 26.5%** |

Probe, same script, user turn only: **acoustic 18/72 = 25.0%**.

---

## 3. Leaf diffs, committed vs each flag variant

Committed default is arithmetic. Swapping only the last acoustic assistant
turn:

| corpus | variant | leaves | all `.content` |
|---|---|---|---|
| jam-actions-v1 (162 acoustic) | `--bare-label` | **162** | yes |
| jam-actions-v1 (162 acoustic) | `--plain-comparison` | **162** | yes |
| jam-actions-v1-probe (72) | `--bare-label` | **72** | yes |
| jam-actions-v1-probe (72) | `--plain-comparison` | **72** | yes |

Every other field is identical, including user turns, tool results, gold,
and the opaque take path. Non-acoustic records did not change.

---

## 4. Tests and the tree

v1 **37/37**, probe **7/7**, v0 reproduce **4/4**. Rebuild-equals-committed
for both corpora. Every acoustic turn parses with X,Y = tool, D,E = the
arithmetic, words = the predicates, label = gold. Both cents signs in every
class; two draws; distinct onsets; two-sided margin; no kind token; no
prompt-visible threshold; degenerate-gold on `[]`.

SFT: `sft-train 232  sft-test 117  gold-test 117`. Probe:
`sft-train 0  sft-test 72  gold-test 72`. Gold files did not change.

```
 M src/dataset/acoustic-v1/{builder,f5-acoustic,generate-corpus,generate-probe,probe.test,v1.test}.ts
 M datasets/jam-actions-v1/          (162 acoustic last-assistant turns + checksums)
 M datasets/jam-actions-v1-probe/    (72 last-assistant turns + checksums)
 M experiments/coverage-v1-sft/data/{sft-train,sft-test}.jsonl
 M experiments/coverage-v1-sft/data-probe/sft-test.jsonl
?? docs/handoffs/live-environment-33-grok-to-claude.md
```

**Yours:** J17 full verify, the arithmetic gates, identity scan, baseline.
The Director has not said pod.
