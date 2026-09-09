# Handoff 10 — Grok Build to Claude: live seed, then an honest count

**Paste target:** a fresh Claude session with `E:/AI/ai-jam-sessions` open.
**Arc:** the audio inspector surface.
**This is chunk 10.** Chunks 1–9 plus the corrected handoff 09 sit at `a58c6e3`. Work is in the working tree, uncommitted. Tests are written and unrun.

---

## The arrangement (unchanged)

I did not run `pnpm test` / `verify` / `typecheck`. I did execute the builder in isolation once, to time a record and confirm hashes now differ across seeds — that is B2, not the suite. J5 (full treatment) is yours. No installs, no commits, no Zenodo, no edits to jam-actions-v0.

---

## 1. What I built

`pickTargetIndex` is untouched in spirit: it is still the first draw from mulberry32. I only folded it into a **shared RNG stream** so later draws (cents, delay, jitter, silence duration) consume the same seed instead of spawning a second generator that ignored everything after the index.

`buildRecipe` now bakes:

| field | what |
|---|---|
| `target_index` | first draw (as before) |
| `cents_shift` | `sharp_60` ∈ **[62, 90]**, `sharp_30` ∈ **[28, 42]**, else null |
| `delay_sec` | `late_80` ∈ **[60, 120] ms**, `late_25` ∈ **[8, 28] ms**, else null |
| `note_jitter[]` | unperturbed notes: time ±≤8 ms, amplitude ×[0.75, 0.95]; late-target time jitter forced to 0 so it cannot eat the delay |
| `silence_duration_sec` | **[1.0, 1.3] s** — the only honest seed bit on all-zero audio |

`renderTake` remains a pure function of the recipe. Realized cents/ms are on `recipe` and on `observation.perturbation`. `gold.verdict` is unchanged. `gold.expected_cents` / `expected_timing_ms` now store the **realized** draw (checkable), not the old constants 60 / 80.

Guard bands are the estimator-safe ones you named, not the tight sides of the gate.

### Tests written, unrun

- Same seed ⇒ same hash (existing).
- Seeds 1234 vs 9999 ⇒ **different** hashes for `clean` and for `sharp_60` (the comparison that used to collide).
- Silence hashes differ because duration differs.
- Every kind × 12 seeds: realized draw stays in its band and on the correct side of 25 / 50 c and 40 ms.
- **`measured.test.ts`**: rendered take through `trackPitch`/`scorePitchWindow`/`detectOnsets`/`transcribe`. `sharp_60` measures **fail**, `sharp_30` measures **warn**, `late_80` measures **> 40 ms**, `late_25` measures **< 40 ms**, vibrato measures **correct**, silence transcribes to **[]**. Checking only the intended draw cannot catch an estimator walking a label across the gate.

---

## 2. B2 — three numbers

Measured on this machine, builder only (not the suite), fixture 4-note phrase:

| | |
|---|---|
| **One record** | **48 ms** cold (includes `validateTrace` catalog compile); ~18 ms each in a 9-set (**164 ms** for `buildKindSet`) |
| **Distinct before they stop meaning anything** | **36 per phrase** = 9 kinds × 4 target notes. Further seeds add jitter twins (clean hashes now differ, but the pedagogy does not). |
| **Recommended fine-tune size** | **36 × a handful of public-domain phrases.** Three phrases is **108**. That is near 115 by arithmetic, not by padding: it is 3 × (9 × 4), each cell a different (kind, note). I would defend 36 on one phrase sooner than 200 jitter copies of the same four notes. I would not add a fourth phrase just to pass 115. |

Generation is cheap (~2 s for 108 records). The bound is distinctness, not wall clock.

---

## 3. What making the seed live surfaced

Nothing else was quietly constant except what we already named: magnitudes, clean/silence waveforms, and the dummy “always 60 / always 80.” `target_index` was already a live draw; your correction stands. Dummy RNG calls keep the stream aligned across kinds so the same seed still shares an index.

---

## 4. Anything wrong in 1–9

The stray `notes.map((n) => ({)` is fixed and behind us. No new analysis-layer defect. Schema id, render provenance, and axis-7 declaration are untouched.

---

## 5. What chunk 11 / J5 should do

1. Run the new measured tests. They are the first ones that can catch a poisoned label.
2. Optionally emit `datasets/jam-actions-acoustic-v0/` as **36 × N_pd_phrases**, N small, not padded.
3. Full treatment (J5). Do not train a LoRA against jitter twins of one fixture line.
4. A/B that freezes viridis is still yours and still does not block the corpus.

Do not publish. Do not stamp `jam-actions-v0` on these records.

---

## Working tree

Uncommitted on `feat/audio-inspector` (HEAD `a58c6e3`):

```
M  src/dataset/acoustic/schema.ts
M  src/dataset/acoustic/builder.ts
M  src/dataset/acoustic/builder.test.ts
M  src/dataset/acoustic/index.ts
?? src/dataset/acoustic/measured.test.ts
?? docs/handoffs/audio-inspector-10-grok-to-claude.md
```
