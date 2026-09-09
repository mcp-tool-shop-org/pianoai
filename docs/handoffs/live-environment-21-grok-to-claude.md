# Handoff 21 — Grok Build to Claude: the gate is the only rule that generalises

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 20.** Branch `main` @ `04f40a6`. Work uncommitted. I did **not** run the suite.
I regenerated `datasets/jam-actions-v1/` and the v1 SFT files, ran v1 tests, the v0
reproduction gate, and `toolless-baseline.mjs` (mistral-small:24b, 90 held-out). **No pod.**

Draws are SHA-256 ranks of `(song id, kind, axis)` — never `Math.random`. The
reproduction gate rebuilds the corpus.

---

## 1. Per class: drawn range, measured range, clearance, drops

Clearance is unchanged from `tracker-error.ts`: **5 ¢ = 27.9×** locked YIN p95
(0.179 ¢); **38 ms = 1.36×** onset abs p95 (28.0 ms). Attempted 81. **Dropped
untrackable 0, clearance 0, short phrase 0.** Did not narrow 90 ¢.

| class | axis | drawn | measured | multiple | drops |
|---|---|---|---|---|---|
| sharp_fail | cents | **55 … 90** | **55.013 … 90.066** | 27.9× | 0 |
| sharp_fail | onset (inside) | 1 … 2 ms | **−9.751 ms** (one SuperFlux bin) | — | 0 |
| late_fail | onset | **78 … 400 ms** | **59.909 … 384.989 ms** | 1.36× | 0 |
| late_fail | cents (inside) | 1.79 … 45 | 1.937 … 45.512 | — | 0 |
| match | cents | **1.79 … 45** | **2.135 … 45.028** | 27.9× inside | 0 |
| match | onset | 1 … 2 ms | **−9.751 ms** (same bin as sharp) | — | 0 |

**Why 400 ms, not ~150.** A 78–150 ms draw is 72 ms of applied span. 10× onset
p95 is **280 ms**. SuperFlux hop is ≈11.6 ms, so 72 ms is ~6 frames — the
two-value bug in miniature. I raised `NOTE_GAP` from 0.6 s to **1.2 s** so a
400 ms first-note delay plus 0.45 s of tone stays inside the next onset, and
drew late takes **78–400 ms**. Measured late spread **325 ms > 280 ms**. The
phrase clock is now 1.2 s; 400 ms is inside it.

90 ¢ produced **zero** octave-jump drops on this construction. Left it.

---

## 2. Distinct-value counts across the 81

| field | distinct | n/2 = 41 |
|---|---|---|
| `cents_from_target` | **81** | yes |
| `onset_ms` | **28** | no — and cannot be, see below |

`cents_from_target` is one unique value per take. `onset_ms` is 27 unique late
frames plus **one** inside-gate bin (−9.751 ms on every match and every sharp
take). SuperFlux reports frame centres. Inside-gate delays of 1–2 ms (gate 40
ms minus clearance 38 ms) occupy a single hop. 27 late takes occupy at most 27
more. Half of 81 is more bins than that geometry has.

The test that would have caught two-value onset is therefore: distinct onset
**≥ the late-take count** (28 ≥ 27), not ≥ 41. Cents still ≥ n/2. Two-value
onset would fail both.

A model that memorises `−9.751 → not timing_fail` still has to put a *threshold*
on the late range 60–385 ms, and a *threshold* on cents 2–45 vs 55–90. Those
thresholds are the gates. That was the experiment.

---

## 3. Tool-less acoustic on the rebuilt held-out 27

Same script, user turn only, mistral-small:24b:

**acoustic 9/27 = 33.3%.** The three-way floor. Unchanged from chunk 18. The
varied magnitudes are not leaking the class by shape.

The rest of the table is unchanged too (chord 2/7, everything else 0). Total
11/90 = 12.2%.

---

## 4. Both axes, every take

Match takes carry small non-zero cents (2–45 ¢) and a 1–2 ms applied delay.
Sharp takes carry 55–90 ¢ and the same small delay. Late takes carry 1.79–45 ¢
(inside the pitch gate) and 78–400 ms. The model has to read two numbers
against two gates it cannot see.

---

## 5. Tests / did not / working tree

v1 tests **28/28** including: distinct cents ≥ n/2; distinct onset ≥ late-take
count; every take's applied magnitude in its class range and measured value on
the correct side of the gate, other axis inside; within-class spread > 10× p95
on the defining axis (sharp cents 35 ¢, late onset 325 ms, match cents 43 ¢);
no kind token; f0_hz matches a fresh track within 1e-6; degenerate-gold `[]`.
v0 reproduce **4/4**, untouched.

**Did not:** train, full suite, install, v0 edits, thresholds in the prompt,
boundary cases in the clearance band, commits, any pod.

```
 M src/dataset/acoustic-v1/f5-acoustic.ts
 M src/dataset/acoustic-v1/builder.ts
 M src/dataset/acoustic-v1/v1.test.ts
 M datasets/jam-actions-v1/          (acoustic records + checksums)
 M experiments/coverage-v1-sft/data/
?? docs/handoffs/live-environment-21-grok-to-claude.md
```

**Yours:** J11 full verify. The Director has not said pod.
