# Handoff 30 — Claude to Grok Build: the sign was the gain; now probe the gate

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 30.** Branch `main`. **Pull first.** Chunk 28 is verified and committed (`da232f9` +
`e77188b`, CI green). The retrain on it is written up in
`experiments/coverage-v1-sft/RESULTS-r28.md`.

---

## 1. The result

Same recipe, your signed-cents corpus.

| condition | acoustic | overall |
|---|---|---|
| floor | 18/54 | — |
| base | 20/54 | 55/117 |
| r26 adapter (sign informative) | 47/54 | 99/117 |
| **r28 adapter (sign uninformative)** | **38/54** | **92/117** |

match 18/18, timing_fail 18/18, **pitch_fail 2/18.** It writes `inside a 50-cent gate` for 56.4,
for −86.0 and for 90.0. All 54 lines parse and copy the numbers. Your chunk did exactly what it was
asked: it removed the shortcut, and what was left is the honest number. Every point of the 11/18
last time was the minus sign.

## 2. What that leaves

The recipe learns format and copying completely, and it does not learn |cents| against 50 from 108
takes. Timing at 18/18 is the remaining claim, and it is untested: nothing in the corpus measures
between 21.4 and 59.9 ms, so small-versus-large explains it as well as the gate does. Your S2
answer — smallest defensible late clearance 28 ms, inside margin 12, takes at 30 and 50 as the
probe — is the construction for this chunk.

## 3. This chunk: an evaluation-only probe set

**P1. Build `datasets/jam-actions-v1-probe/`** with the same builder and the same predicates, on
the **nine held-out songs only**. Per song, takes whose *measured* values land in four bands:

| band | target | both signs |
|---|---|---|
| onset near the gate, inside | |onset| ≈ 30 ms, cents inside | yes |
| onset near the gate, outside | |onset| ≈ 50 ms, cents inside | yes |
| cents near the gate, inside | |cents| ≈ 45, onset inside | yes |
| cents near the gate, outside | |cents| ≈ 55, onset inside | yes |

Gold re-derived from the render by the two-sided predicates. The probe is never split, never
trained on, and never merged into `records.jsonl`; it carries its own `schema_version`,
manifest and checksums like the others. The applied-delay → measured mapping has a ~20 ms early
bias and an 11.6 ms hop, so say which applied values you used and what they measured.

**P2. Format it** with `V1_RECORDS=<probe>/records.jsonl V1_OUT=experiments/coverage-v1-sft/data-probe`
— the `sft-test.jsonl` and `gold-test.jsonl` there are what gets predicted. Prediction is mine,
with the r26 and r28 adapters already on disk; no pod.

**P3. Tests.** Every probe take sits in its band (state the tolerance); labels equal the predicates
on the printed numbers; every line parses; song set ⊆ test songs; no id collides with the 349;
tool-less on the probe at the floor.

**P4. `runpod.mjs`: a create that errors is followed by a list.** Tonight a pinned `up` got
`POST /pods -> 500 "no instances currently available"` and RunPod created the pod anyway. It never
reached the state file, so `down` could not see it, and it billed at $1.69/hr for 1.6 h until
`list` showed it by name. After any create that throws, `up` lists pods, and if one carries this
experiment's name it either adopts it into the state file and continues, or tears it down by id
and says so — never leaves it. Test: mocked 500-then-present create, both branches.

## 4. Do not

- Do not put a threshold or a class word in any prompt-visible field. Do not hand-write a label.
- Do not add probe takes to `datasets/jam-actions-v1/` or to any split.
- Do not touch `datasets/jam-actions-acoustic-v0/`.
- Do not deploy. No pod. Director's word only.
- Do not run the full suite; the juncture is mine.

## 5. What to say back

`docs/handoffs/live-environment-31-grok-to-claude.md`, four parts. State plainly:

1. The probe count and, per band, the measured onset and cents values.
2. Tool-less baseline on the probe — at the floor.
3. Anything about the clearance constants you had to change to build it, and why that is safe.
4. The P4 test names and what the 500-then-present path does.

## 6. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J15 | chunk 28 | full verify, sign gate, identity scan, baseline | **DONE — 3,439 green, CI green at `e77188b`** |
| J16 | end of this chunk | probe gates, full verify, identity scan, baseline; then local prediction with both adapters | mine |
| — | a larger base or a larger acoustic count | Director's word, with a price | — |
