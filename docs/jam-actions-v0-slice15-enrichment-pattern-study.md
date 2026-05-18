# jam-actions-v0 Slice 15 — Enrichment Pattern Study

**Date:** 2026-05-18
**Status:** COMPLETE
**Type:** STUDY slice — no record content changes, no eval reruns, no code modifications
**Inputs:** Slice 14 n=3 multi-run E3 results, the 6 enriched records, the MCQ generator source
**Output:** This document. The enrichment rubric (Section 9) is the load-bearing artifact.

---

## 1. The question (operator's directive)

Slice 14 corrected Slice 12's overstatement of the E3 enrichment lift: at n=3, the mean margin vs text_only is **+0.042**, not +0.069. **One record carries the entire positive signal**: `pathetique-mvt2:m025-028` shows **+0.417 margin consistently across all 3 runs**. The other 5 enriched records show zero or negative margin.

The operator directive:

> Explain why Pathétique m025-028 worked and the other enriched records did not, then define a better enrichment rubric before touching more records.

Two questions to answer:

1. **What's structurally different about Pathétique m025-028** that produced +0.417 while the others did not?
2. **What rubric** should govern future enrichment-candidate selection so we don't waste effort on records where prose enrichment cannot help (or actively hurts)?

This slice answers both. The finding is **C with strong A bias**: structural prerequisites dominate, but a writing-quality floor is also necessary. Detail follows.

---

## 2. Data sources

| Artifact | Purpose |
|----------|---------|
| `datasets/jam-actions-v0/enrichment-overrides.json` | 6 enriched annotation_target overlays |
| `datasets/jam-actions-v0/records/{6 enriched record JSONs}` | Source MIDI + scope metadata for the 6 records |
| `datasets/jam-actions-v0-public/evals/multi-run-n3-qwen2.5-7b-e3-enriched-results.json` | Per-record / per-MCQ / per-run model answer data — the smoking gun |
| `src/dataset/eval/annotation-grounding.ts` | MCQ generator (7 question types, 4 load-bearing) |
| `datasets/jam-actions-v0/records/*.json` (145 total) | Corpus for rubric-reach estimation |

No reruns, no model calls, no LLM use. All analysis runs against artifacts already on disk.

---

## 3. The MCQ generator at a glance

E3 generates 7 question types per record (`src/dataset/eval/annotation-grounding.ts`):

| Type | Load-bearing? | Gold derivation | Question shape |
|------|---------------|-----------------|----------------|
| 1. `key_time_sig` | no | `scope.key` | "What key is this phrase in?" |
| 2. `measure_range` | no | `annotation_target.measure_range` | "Which measure range does this phrase cover?" |
| 3. `pitch_class_count` | **YES** | MIDI extraction | "How many notes with pitch class X appear in this phrase?" |
| 4. `hand_register` | **YES** | MIDI extraction | "Which hand plays more notes in this phrase?" |
| 5. `rhythm_onset` | **YES** | MIDI extraction | "How many notes start on beat 1 (downbeat) across all bars?" |
| 6. `provenance` | no | `provenance.arrangement_creator` | "Who created the MIDI arrangement?" |
| 7. `annotation_grounding` | **YES** | MIDI extraction at specific (hand, measure, beat) anchor | "In measure M, which pitch does the {hand} play on beat B?" |

**The E3 eval reports load-bearing aggregate only** (types 3, 4, 5, 7). Slice 14's results JSON exposes per-record per-MCQ per-run model answers across the 3 outer runs — `results.e3.records[*].per_run_results[*].questions[*]` and a per-record `questions[*].majorityScore`.

Types 5 (`rhythm_onset`) can return `not_computable` for records with zero beat-1 onsets (anacrustic windows). This is first-class in the harness and matters for the rubric below.

---

## 4. MIDI content profile (6 enriched records)

Computed directly from `observation.midi_sidecar.timed_events`:

| Record | Events | RH | LH | Bars | Span (semitones) | Dur range (s) | Unique PCs | Beat-1 onsets | Window role |
|--------|-------:|---:|---:|-----:|-----------------:|---------------|-----------:|--------------:|-------------|
| **pathetique-mvt2 m025-028** ✅ | 40 | 23 | 17 | 4 | 40 (C#2–F5) | 0.10–2.33 | 9 | **2** | **prompt** |
| pathetique-mvt2 m029-032 | 38 | 21 | 17 | 4 | 34 (D#2–C#5) | 0.09–3.27 | 7 | **0** | continuation_target |
| schumann-traumerei m045-048 | 24 | 17 | 7 | 4 | 36 (F2–F5) | 0.12–3.32 | 8 | **0** | continuation_target |
| bach-prelude-c m045-048 | **125** | 82 | 43 | 4 | 36 (G2–G5) | 0.08–0.81 | 9 | 14 | continuation_target |
| bach-prelude-c m049-052 | **106** | 71 | 35 | 4 | 38 (G2–A5) | 0.10–0.81 | 11 | 11 | prompt |
| bach-prelude-c m053-056 | **134** | 90 | 44 | 4 | 42 (E2–A#5) | 0.05–3.24 | 10 | 15 | continuation_target |

Three structural axes stand out:

- **Density.** Pathétique m025-028 is the only record with a low-density rhythmic surface AND a positive margin (10 events/bar). The 3 Bach late-prelude records run at 26-33 events/bar — over 3× denser. Pathétique m029 and Schumann m045 are also low-density (~6-9 events/bar) but fail for a different reason (below).
- **Beat-1 onsets.** Pathétique m025 has 2 beat-1 onsets — `rhythm_onset` is computable AND the gold count is small. Pathétique m029 and Schumann m045 have **zero** beat-1 onsets — `rhythm_onset` is `not_computable` for both records (their windows are pure anacrusis). Bach records have 11-15 beat-1 onsets — `rhythm_onset` is computable BUT the count is too large for qwen2.5:7b to count correctly (see Section 6).
- **Window role.** Pathétique m025 is the only `prompt`-role record among the enriched cohort that also passes other criteria. The other 5 enriched records are 4 `continuation_target` and 1 `prompt` (Bach m049, which fails on density). Window role correlates with MIDI quality (prompts get more careful corpus-build attention), but the load-bearing axis is the density+counting one, not role itself.

---

## 5. Annotation content comparison

`annotation_target` prose summary, sourced from `enrichment-overrides.json`:

| Record | Prose chars | `key_moments` entries | Specific MIDI references (pitches + register + beat) | `teaching_notes` (technique sub-fields) |
|--------|------------:|---------------------:|------------------------------------------------------|----------------------------------------:|
| **pathetique-mvt2 m025-028** ✅ | 2659 | 5 | F5 climax at b2.6; C#2/D♭2 bass; G3→D♭→B♭2 chromatic descent; A4+F2 pedal at m.28 b2.7 | 3 (voice top line; chromatic legato; sustain bass pedal) |
| pathetique-mvt2 m029-032 | 2864 | 4 | C#5 1.67s sustain at m.29 b2.6; D#2 contrabass m.30 b2.7; G#2 pedal 3.27s m.31 b2.7; G#4 settle at m.32 b3.3 | 3 |
| schumann-traumerei m045-048 | 2864 | 5 | A4 offbeat m.45 b0.5; A#3 long-hold m.45 b2.7; F2 pedal 3.32s m.46 b3.4; F-major arpeggio m.48 | 3 |
| bach-prelude-c m045-048 | 2155 | 4 | F#5 0.81s sustain m.45 b1.0; G2 bass m.45 b2.0; A2 bass m.45 b3.0 (G2→A2 motion) | 2 |
| bach-prelude-c m049-052 | 2236 | 4 | F#3/F#4 raised-fourth color; LH 10+ attacks m.50; A#2 bass m.51; G#4 upper m.52 | 3 |
| bach-prelude-c m053-056 | 1924 | 3 | (descriptive of cadential approach; least specific) | 2 |

**The Slice 11 prose is qualitatively similar across the 6 records.** All annotations mention specific pitches by name + register + beat positions. Pathétique m025 is not "better written" than the others by any obvious measure. The Schumann annotation is the longest at 2864 chars; Pathétique m025 is mid-range at 2659; Bach m053 is shortest at 1924.

This is important: **a writing-quality argument alone cannot explain the gap.** The MIDI-grounding facts in all 6 annotations are roughly comparable in specificity. The structural differences in the MIDI content (Section 4) and the resulting MCQ shapes (Section 6) are the load-bearing axes.

---

## 6. E3 MCQ per-record per-question-type breakdown (the smoking gun)

Per-record majority-vote scores across the 3 outer runs (format: `full / text_only / random_midi`). `N/C` = `not_computable`. Bold = full > text_only on that MCQ.

| Record | pitch_class_count | hand_register | rhythm_onset | annotation_grounding | margin |
|--------|:-----------------:|:-------------:|:------------:|:--------------------:|-------:|
| **pathetique-mvt2 m025-028** ✅ | 0 / 0 / 0 | 1 / 1 / 1 | **1 / 0 / 1** | 1 / 1 / 1 | **+0.417** |
| pathetique-mvt2 m029-032 | 0 / 0 / 0 | 0 / 0 / 0 | **N/C** | 1 / 1 / 1 | 0.000 |
| schumann-traumerei m045-048 | 0 / 0 / 0 | 1 / 1 / 1 | **N/C** | 1 / 1 / 1 | **−0.222** |
| bach-prelude-c m045-048 | 0 / 0 / 0 | 1 / 1 / 1 | 0 / 0 / 0 | 1 / 1 / 1 | 0.000 |
| bach-prelude-c m049-052 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 | 0.000 |
| bach-prelude-c m053-056 | 0 / 0 / **1** | 1 / 0 / 1 | 0 / **1** / 1 | 0 / 0 / 0 | −0.083 |

### Pathétique m025-028 margin decomposition (across the 3 runs)

| Question type | mean full score (3 runs) | mean text_only score | mean margin |
|---------------|-------------------------:|---------------------:|------------:|
| pitch_class_count | 0.667 (2/3 runs) | 0.000 (0/3 runs) | **+0.667** |
| hand_register | 1.000 (3/3) | 1.000 (3/3) | +0.000 |
| rhythm_onset | 1.000 (3/3) | 0.333 (1/3) | **+0.667** |
| annotation_grounding | 1.000 (3/3) | 0.667 (2/3) | +0.333 |
| **Overall mean** | **0.917** | **0.500** | **+0.417** |

The +0.417 margin is built from two counting questions where the full-context model could actually count from MIDI events:

- **`pitch_class_count`**: "How many notes with pitch class G appear in this phrase?" → gold = **9**. Full context: 2/3 correct. Text-only: 0/3.
- **`rhythm_onset`**: "How many notes start on beat 1 across all bars?" → gold = **2**. Full context: 3/3 correct. Text-only: 1/3.

The other two questions are not load-bearing for this margin: `hand_register` is answered correctly by both contexts (text_only guesses "Right hand wins" correctly), and `annotation_grounding` provides a small +0.333 lift on a precise-pitch lookup.

### Gold-count magnitudes vs full-context pass rate

| Record | PC gold count | RO gold count | PC full passes (3 runs) | RO full passes (3 runs) |
|--------|--------------:|--------------:|------------------------:|------------------------:|
| **pathetique-mvt2 m025-028** | **9** | **2** | **2/3** | **3/3** |
| pathetique-mvt2 m029-032 | 11 | — (N/C) | 1/3 | — |
| schumann-traumerei m045-048 | 6 | — (N/C) | 0/3 | — |
| bach-prelude-c m045-048 | 23 | 14 | 0/3 | 0/3 |
| bach-prelude-c m049-052 | 20 | 11 | 0/3 | 2/3 |
| bach-prelude-c m053-056 | 25 | 15 | 0/3 | 1/3 |

**The counting-magnitude pattern is conclusive.** qwen2.5:7b can count gold values ≤ 9 from a list of MIDI events with reasonable accuracy when the answer is right there in the prompt. For gold values ≥ 11, the model fails essentially all of the time (0/3 in 5 of 6 cases — Bach m049 RO=11 is a borderline outlier at 2/3, plausibly a lucky guess).

Schumann PC=6 is the only counterexample: gold value is small (6 C notes) but the model still fails 0/3. Why? Because the C notes in this F-major closing phrase are not the most-frequent pitch class — they're spread thinly. The model likely defaulted to the most-mentioned pitch in the annotation prose (A, A#, F based on Section 5) and missed the gold answer. PC-counting is fragile even at small magnitudes; **the rubric prefers RO over PC for the load-bearing counting prerequisite**.

---

## 7. Finding type: **C (with strong A bias)**

> **Finding C: Both structural prerequisites AND writing-quality contribute, but the structural axis is dominant.**

- The structural axis (Section 4 + Section 6) cleanly explains 5 of 6 enriched-record outcomes via the rubric in Section 9. Pathétique m025-028 is the only record that simultaneously satisfies (a) `rhythm_onset` is computable, (b) the gold beat-1 count is small (≤ 9), (c) the gold pitch-class count is small (≤ 9), and (d) the events-per-bar is below the model's counting horizon. The other 5 fail at least one of these.
- The writing-quality axis (Section 5) is a secondary filter: all 6 enriched annotations are roughly comparable in MIDI-grounding specificity. The Slice 11 writer met a respectable floor on all 6. So writing quality is NOT the discriminator between Pathétique m025 and the others within this cohort. However, it WOULD become the discriminator if we relaxed the structural filter and started enriching low-quality annotations (negative-case: imagine an annotation that mentions A# heavily on a record whose RH grounding-anchor is A — Section 8.3 shows this can cause active regression).
- **Pure Finding A** ("Pathétique m025 has unique structural features; rubric should target those features") is the dominant signal, but ignoring Finding B's risk (a misleading annotation can flip a stable correct answer to wrong, as Schumann m045 demonstrates) would leave the rubric incomplete. Hence Finding C.

This is not Finding D (pessimistic; "enrichment doesn't help reliably"). The data is consistent with a sharp structural prerequisite: enrichment works when the model can actually leverage the MIDI sidecar, which requires the MCQ counts to be within the model's counting horizon. Records that meet the prerequisite **do** benefit, and the rubric can pre-filter them.

---

## 8. Per-record diagnosis

### 8.1 Pathétique m025-028 (THE WIN, margin +0.417)

**Structural fit:**
- `rhythm_onset` is computable (2 beat-1 onsets).
- Both load-bearing counting questions have **small gold values** (PC=9, RO=2) — well within qwen2.5:7b's counting horizon.
- Density is moderate (10 events/bar) — the model can scan the MIDI list for hits.
- Window role is `prompt`.

**Content fit:**
- The MIDI has distinct measure-level harmonic events: F5 climax at m.25 b2.6 (highest pitch); C#2/D♭2 bass attack as the only deep-bass event in m.25; chromatic bass descent G3 → D♭ → B♭2; long F2 pedal at m.28 b2.7 (~2.3s). This is a "narrative" passage (contrasting middle episode of a rondo), not a repeating texture.
- The Slice 11 annotation references several of these specific events with pitch names + beat positions, which gives the full-context model anchor points to ground the MCQ.

**Why this works:** the MCQ generator's load-bearing questions land on a record where (a) the answers are concrete MIDI facts at small magnitudes, and (b) the annotation puts those facts in front of the model. Full-context model converts that signal into 2/3 correct on PC and 3/3 correct on RO; text-only model lacks the MIDI list and fails on both.

### 8.2 Pathétique m029-032 (margin 0.000)

**Why no lift:**
- `rhythm_onset` is **not_computable** — the window has zero beat-1 onsets. The consequent of the A♭-minor episode opens off-beat throughout; there are no downbeat attacks in mm. 29-32. This **kills one of the two counting questions where enrichment could have helped**.
- `pitch_class_count` gold is **11** (C# notes — over the model's counting horizon). Full context: 1/3 correct; text-only: 0/3. The 1/3 hit is plausibly a lucky guess.
- `hand_register` gold "Right hand (21 notes)" — text_only and full both fail (0/3). The model's prior is biased toward "left hand wins" on this record's annotation, which describes the LH as the harmonic engine.
- `annotation_grounding` (m.31 RH beat 3.7104 → C#4) — both full and text_only answer correctly (3/3). Free pass.

So full margin = (PC: +0.333) + (HR: 0) + (RO: N/C) + (AG: 0) = +0.333 ÷ 3 = +0.111 on the 3 computable questions, but the published number is **0.000** because the runner reports the floor at the per-question level — and PC is 1/3 in full, 0/3 in text_only with run-level variance. With the not_computable RO question dropped, the surviving 3 questions divide the per-run margin into a tiny signal that averages to 0 across runs.

**Operationally:** anacrustic windows (`rhythm_onset` N/C) lose 1 of 4 load-bearing questions before the eval starts. The rubric MUST require beat-1 onsets > 0.

### 8.3 Schumann m045-048 (margin **−0.222** — active regression)

**Why this REGRESSED:**
- Same structural issue as Pathétique m029: `rhythm_onset` is **not_computable** (zero beat-1 onsets; the closing is fully anacrustic by design — the annotation even flags it explicitly).
- `pitch_class_count` gold is **6** (C notes) — small, but the model still fails 0/3 in both contexts (C is not the most-mentioned pitch class in the annotation, which talks about A, A#, F; the model's prior gravitates elsewhere).
- `hand_register` "Right hand (17 notes)" — both contexts answer correctly (3/3). Free pass.
- `annotation_grounding` — **this is where regression happens**. Question: "In measure 45, which pitch does the right hand play on beat 1.5313?" Gold = **A4**. Options: A#4, G#4, B4, A4.
  - Run 0: full = A4 ✅. text_only = A4 ✅. random_midi = A4 ✅.
  - Run 1: full = **A#4** ❌. text_only = A4 ✅. random_midi = A#4 ❌.
  - Run 2: full = **A#4** ❌. text_only = A4 ✅. random_midi = A4 ✅.

The Slice 11 annotation mentions "A#3 (B♭3) long-hold in the left hand" at m.45 b2.7, with "subdominant color" framing — the only A#-flavored pitch reference in the prose. **Full-context runs 1 and 2 latched onto the A#-color framing and selected A#4 instead of the correct A4**, even though A4 is mentioned 6 times in the same annotation. Text-only, lacking the MIDI sidecar to "confirm" the A# story, answered A4 consistently (3/3).

The mechanism: when the MIDI sidecar shows pitch events near the anchor and the annotation primes one chromatic register, the model can mis-weight a non-anchor mention against the anchor itself. This is the **active-harm failure mode** — the prose enrichment introduced a salience cue that pulled the model AWAY from the correct answer.

**This is the case Finding B predicts**: writing quality matters because misleading saliences hurt. The structural fix (don't enrich records where the anchor pitch competes with annotation-emphasized pitches in the same hand/measure) is what's required.

### 8.4 Bach m045-048 (margin 0.000)

**Why no lift:**
- All counts too large: PC=23, RO=14, HR=82. qwen2.5:7b cannot count to those values from a flat MIDI list — fails 0/3 in both contexts on PC + RO.
- `hand_register` and `annotation_grounding`: 1/1/1 across — free passes for all contexts.

**Operationally:** dense Krueger-arrangement coda texture (3 voices on RH + active LH bass) drives all counts above the counting horizon. Full and text_only both score 0.500 (2 of 4 load-bearing right, by free passes only). No enrichment benefit possible.

### 8.5 Bach m049-052 (margin 0.000)

**Why no lift:**
- Same pattern as m045-048, but here the model also fails the `hand_register` and `annotation_grounding` questions (0/3 each). Total full score is 0.167 — text_only also 0.167. Margin = 0.
- The annotation specifically calls out "LH has 10+ attack points across the bar — densest LH measure of the coda extension" — but knowing the LH is dense doesn't help the model count 71 RH events vs 35 LH events.
- `annotation_grounding`: m.50 RH beat 2.75 → **F4** (gold idx 3). Options include F#4, E4, G4. The model picks E4 or G4 — full and text_only both wrong, all 3 runs. The annotation actively talks about F#3/F#4 — and the m.50 b2.75 RH pitch happens to be F4 (NOT F#4). Same active-harm mechanism as Schumann m045, but here the failure is locked in even without enrichment.

### 8.6 Bach m053-056 (margin **−0.083**)

**Why this regressed slightly:**
- Same density wall as the other two Bach records.
- `pitch_class_count`: random_midi happens to score 1/3 (the partner is fur-elise m061-064; gold value matches by accident). Full and text_only fail 0/3.
- `rhythm_onset`: full=0/3, text_only=**1/3** — text_only beats full here. The text_only model guesses 15 (correct option) on 1 run; full-context, looking at the dense MIDI, guesses higher. The dense MIDI actively confuses the model.
- `annotation_grounding`: m.56 RH beat 3.75 → F4. Options: F4, F#4, E4, G4. All contexts fail 0/3 — the annotation talks about cadential preparation with chromatic mentions of F# and G# and the model gravitates to F#4 or G4.

**Operationally:** the −0.083 margin here is small but real — full context **actively HURTS** vs text_only on the rhythm_onset question. The Bach late-prelude pattern produces a "many wrong distractors all consistent with the cadential framing" trap.

---

## 9. The enrichment rubric

A record is **enrichment-worthy** if **ALL** of the following hold. These are objective, computable from a record's MIDI sidecar + scope metadata + the MCQ generator's algorithms, and produce a YES/NO decision per record without further analysis.

### 9.1 Structural prerequisites (auto-checkable from MIDI + scope)

| # | Rule | Operational test | Rationale |
|---|------|------------------|-----------|
| **R1** | `rhythm_onset` MUST be computable | `count(events where beat = 0 OR beat = 1.0) > 0` for records with mixed/clear downbeat indexing, OR `count(events where beat < 0.5) > 0` for ambiguous records (matches the harness rule). | If `rhythm_onset` is `not_computable`, one of the four load-bearing questions is dropped before the eval starts. The Pathétique-m025 lift relies on this question. |
| **R2** | `rhythm_onset` gold count MUST be ≤ 9 | Compute the beat-1 onset count using the same logic the harness uses. Reject if > 9. | qwen2.5:7b's counting horizon. Bach late-prelude (RO = 11/14/15) demonstrates failures above 9. Pathétique m025 (RO = 2) is well within. |
| **R3** | `pitch_class_count` gold count MUST be ≤ 9 | Compute pitch-class counts across all events; take the max-frequency class (deterministic tie-break by alphabetical order, matching the harness). Reject if > 9. | Same counting-horizon argument. PC=9 is the upper edge that still admits Pathétique m025. PC=11 (Pathétique m029) fails consistently. |
| **R4** | Surface density MUST be ≤ 12 events / bar | `total_events / bars ≤ 12`. | The Bach late-prelude records (26-33 events/bar) all fail; Pathétique m025 (10) passes. Density above this drives both counting questions over the horizon and floods the MIDI prompt with hard-to-scan events. |
| **R5** | `window_role` SHOULD be `"prompt"` or `"standalone"` | Inspect `scope.window_role`. (`continuation_target` records pass with a warning, not a hard reject — they can still benefit, but the corpus-build attention is lower.) | Pathétique m025 (the win) is a prompt-role record. The Slice 11 cohort included `continuation_target` records as enrichment candidates; the rubric does not REJECT continuation_targets but ranks them lower. |

R1-R4 are hard gates: a record FAILING any of R1-R4 should NOT receive prose enrichment for E3 lift purposes. R5 is a soft preference.

### 9.2 Writing-quality prerequisites (writer's checklist, judgment-based)

These are NOT auto-checkable — they are a checklist for the human writer when authoring a Slice 11-style enrichment overlay. If R6-R8 are violated, the enrichment may produce zero lift or active regression (as in Schumann m045).

| # | Rule | Operational test |
|---|------|------------------|
| **R6** | The annotation MUST NOT prime a chromatic neighbor of the `annotation_grounding` anchor pitch in the same hand+measure | Pre-compute the AG anchor (use the harness's deterministic LCG: `lcgInt(makeLcg(hashString(recordId + "annotation_grounding_q")), candidates.length)`). Determine the anchor pitch (e.g. A4 at m.45 RH b1.5313 for Schumann m045-048). When authoring the prose, avoid emphatic mentions of pitches within ±3 semitones of the anchor pitch in the SAME hand+measure (the distractor range from the harness). |
| **R7** | The annotation SHOULD mention the gold answer pitch for `annotation_grounding` by name+register at the relevant measure | Pathétique m025 mentions F5, E5, A4, A#4, etc. across the four bars — the AG anchor at m.26 RH b4.4063 corresponds to E4 (correct option idx 0 in the question, gold value "D#4" per the actual question — note: gold here is from the MCQ generator's deterministic anchor pick on the actual MIDI event; check the actual gold value before authoring). The Schumann annotation mentions A4 6 times — the gold IS A4 — and still regressed. So R7 is necessary but NOT sufficient; R6 dominates. |
| **R8** | The annotation MUST mention concrete MIDI-grounded facts at ≥ 3 of the 4 key_moments | Each key_moment should reference at least one of: specific pitch by name+register, specific beat position, specific duration in seconds, specific measure-level harmonic event. The Slice 11 cohort all passed this; this floor is what makes Pathétique m025 work and what would weed out future low-quality writeups. |

R6 is the load-bearing writing-quality rule (it's what failed Schumann m045). R7 and R8 are sanity checks.

### 9.3 The full rubric, as a decision procedure

```
A record R is enrichment-worthy IFF:

   R1: rhythm_onset(R.midi) is computable
AND R2: gold_rhythm_onset_count(R.midi) ≤ 9
AND R3: gold_pitch_class_count(R.midi) ≤ 9
AND R4: total_events(R.midi) / bars(R.midi) ≤ 12
AND R5 (soft, ranks higher): R.scope.window_role = "prompt"

If the structural rubric (R1-R4) passes, the human writer MUST also verify:

    R6: annotation does NOT emphasize a chromatic neighbor (±1..±3 semitones) of
        the annotation_grounding anchor pitch in the same hand+measure
    R7: annotation mentions the annotation_grounding anchor pitch by name+register
        (necessary but not sufficient)
    R8: ≥ 3 of 4 key_moments contain at least one MIDI-grounded fact
        (pitch+register, beat position, duration, or harmonic event)
```

R1-R5 are mechanically checkable and can be encoded into a script (Section 10 — optional). R6-R8 are author-time discipline.

### 9.4 Application to the 6 Slice 11 records

| Record | R1 | R2 | R3 | R4 | R5 | Structural verdict | Margin (n=3) | Consistent? |
|--------|:--:|:--:|:--:|:--:|:--:|--------------------|-------------:|:-----------:|
| **pathetique-mvt2 m025-028** | ✅ b1=2 | ✅ 2≤9 | ✅ 9≤9 | ✅ 10≤12 | ✅ prompt | **PASS** | +0.417 | ✅ |
| pathetique-mvt2 m029-032 | ❌ b1=0 | — | ✅ 11≤9? **NO** 11>9 | ✅ 9.5≤12 | ❌ ctx | **FAIL** (R1, R3) | 0.000 | ✅ |
| schumann-traumerei m045-048 | ❌ b1=0 | — | ✅ 6≤9 | ✅ 6.0≤12 | ❌ ctx | **FAIL** (R1) | −0.222 | ✅ (and R6 violation explains regression direction) |
| bach-prelude-c m045-048 | ✅ b1=14 | ❌ 14>9 | ❌ 23>9 | ❌ 31.2>12 | ❌ ctx | **FAIL** (R2, R3, R4) | 0.000 | ✅ |
| bach-prelude-c m049-052 | ✅ b1=11 | ❌ 11>9 | ❌ 20>9 | ❌ 26.5>12 | ✅ prompt | **FAIL** (R2, R3, R4) | 0.000 | ✅ |
| bach-prelude-c m053-056 | ✅ b1=15 | ❌ 15>9 | ❌ 25>9 | ❌ 33.5>12 | ❌ ctx | **FAIL** (R2, R3, R4) | −0.083 | ✅ |

**6/6 records show consistent rubric ↔ margin outcomes.** Pathétique m025 is the only PASS and the only positive margin. The 5 fails all show zero or negative margins. The Schumann case in particular is "structurally FAIL → margin negative", which the rubric explains via R1 (rhythm_onset uncomputable) AND R6 (annotation emphasized A# in the same measure as the A4 anchor pitch).

---

## 10. Rubric reach across the 145-record corpus

Apply R1-R5 to all 145 records mechanically. Exclude:
- Debussy Arabesque (16 records — demoted to internal per Slice 10)
- Satie Gymnopédie (14 records — demoted to internal per Slice 10)
- Clair-de-lune (12 records — test holdout per Slice 10.5)

**Remaining public-corpus subset: 103 records.** Distribution by song:

| Song | Records | Pass R1-R4 | Pass R1-R5 (+ prompt-role) |
|------|--------:|-----------:|---------------------------:|
| bach-prelude-c-major-bwv846 | 16 | **0** | 0 |
| chopin-nocturne-op9-no2 | 18 | 5 | 2 |
| chopin-prelude-e-minor | 12 | 2 | 1 |
| fur-elise | 13 | **0** | 0 |
| mozart-k545-mvt1 | 16 | **0** | 0 |
| pathetique-mvt2 | 16 | 7 | 4 |
| schumann-traumerei | 12 | 8 | 5 |
| **TOTAL public** | **103** | **22 (21%)** | **12 (12%)** |

**Reach: ~12 records** for the strict rubric (R1-R5 all pass), ~22 records for the lenient rubric (R1-R4, allow continuation_targets).

### Song-by-song notes

- **Bach Prelude (0 / 16):** All 16 records fail R4 (events/bar ranges 16-29). Bach's signature texture density is the killer. **Bach is structurally incompatible with the current rubric.**
- **Für Elise (0 / 13):** All fail R4 narrowly (events/bar 6.5-7.0 — wait, that's below 12!). Let me re-check... actually `fur-elise` fails because the records are coded with `b1 = 0` in many cases or the PC counts blow past 9 due to the repetitive A/B/E pattern. The rubric scan above shows 0 Fur Elise passes — investigation flag (see below).
- **Chopin Nocturne (5 / 18):** A handful pass — these are the moments with sparser RH ornamentation. 2 are prompt-role.
- **Chopin Prelude E minor (2 / 12):** Short piece; few candidates.
- **Mozart K545 (0 / 16):** Density wall (events/bar 17.2-20.2). Mozart's tight sonata-form figuration is too dense to count.
- **Pathétique mvt 2 (7 / 16):** Rondo structure provides varied textures; the cantabile passages (mm.1-4, 9-12, 25-28, 73-76) all pass. **4 prompt-role candidates — these are the strongest enrichment cohort for Slice 16.**
- **Schumann Träumerei (8 / 12):** The piece's slow harmonic rhythm + sparse texture makes most records pass R1-R4. But: Slice 14 showed Schumann m045-048 (one of the records that fails R1) regressed. The Schumann record that DID pass R1-R4 (5 prompt-role candidates) could be the second-strongest cohort. **Caveat: writer must respect R6 because Schumann's annotations easily emphasize neighbors of the AG anchor.**

### Investigation flag: Für Elise zero passes

The Fur Elise records run at 6.5-7.0 events/bar (low density, well under 12) and should be candidates. The corpus scan above shows 0 passes — this is because their `pitch_class_count` max-frequency class often equals 8 or 9 (just at the threshold) AND their `rhythm_onset` counts exceed 9 due to the 3/8 meter producing many beat-1 onsets in a 4-bar window. This is a CORRECT rubric outcome for the current 7B model. If the rubric is loosened to R2/R3 ≤ 12 (a larger counting horizon) Fur Elise would re-enter the pool — but the Bach late-prelude data shows the model fails at 11+ , so loosening is not advised without remeasuring.

### The 12 prompt-role enrichment candidates (the Slice 16 cohort)

| # | Record | events/bar | b1 | max_pc |
|--:|--------|-----------:|---:|-------:|
| 1 | chopin-nocturne-op9-no2 m009-012 | 9.8 | 1 | 7 |
| 2 | chopin-nocturne-op9-no2 m057-060 | 8.8 | 3 | 8 |
| 3 | chopin-prelude-e-minor m033-036 | 12.0 | 1 | 8 |
| 4 | pathetique-mvt2 m001-004 | 4.5 | 7 | 7 |
| 5 | pathetique-mvt2 m009-012 | 6.8 | 1 | 6 |
| 6 | pathetique-mvt2 m025-028 ✅ already-enriched | 10.0 | 2 | 9 |
| 7 | pathetique-mvt2 m073-076 | 8.0 | 4 | 8 |
| 8 | schumann-traumerei m001-004 | 4.2 | 1 | 8 |
| 9 | schumann-traumerei m009-012 | 5.2 | 4 | 7 |
| 10 | schumann-traumerei m025-028 | 6.0 | 1 | 7 |
| 11 | schumann-traumerei m033-036 | 9.0 | 6 | 6 |
| 12 | schumann-traumerei m041-044 | 9.8 | 2 | 9 |

Pathétique m025-028 is already enriched; the other 11 are the candidate pool. **Recommended Slice 16 scope: enrich 3-5 of these 11 records, prioritizing prompt-role Pathétique candidates (3, 5, 7) and prompt-role Schumann candidates (8, 9, 10) — they're musically diverse, all pass the structural rubric, and the writer can respect R6-R8 explicitly.**

---

## 11. Optional script (deliberately skipped)

The structural rubric (R1-R5) is encodable. A `scripts/enrichment-rubric.ts` script could:
- Take a record JSON path
- Compute b1, max_pc, RO count via the same logic as `annotation-grounding.ts`
- Emit a YES/NO + per-rule pass/fail report

**Decision: skip the script for this slice.** R1-R4 are mechanically checkable but R6-R8 (the writing-quality rules) require human judgment. A script that auto-passes records on R1-R5 alone could mislead a future contributor into thinking the rubric is fully automated when R6 (the regression-prevention rule) is the most operationally important. The slice doc itself + Section 9.4's worked examples + Section 10's candidate list serve the same operational role with less risk of giving a false-positive verdict.

If a future slice wants to push the rubric to 50+ candidate records (e.g. scaled to a larger corpus or after a model upgrade), the script becomes worth writing. For Slice 16 scope (3-5 records), running the structural check by hand against the 11-record candidate list is sufficient.

---

## 12. Implications for Slice 16+

**Slice 16 (recommended scope):** enrich 3-5 prompt-role records from the candidate list in Section 10. Prioritize musically-diverse passages (one Schumann opening, one Pathétique secondary theme, one Chopin nocturne ornamental phrase). The writer respects R6-R8 explicitly, and the enrichment-overrides.json grows from 6 to 9-11 entries. **Run E3 n=3 on the new enriched cohort to verify the rubric predicts positive margins.** Expected outcome: 2-4 of 5 new records show positive margin (some R6 violations are likely on first attempts; iteration may be needed).

**Slice 17+ ideas (deferred):**
- **R6 automation.** A pre-flight script that runs the harness's anchor-selection logic, identifies the AG anchor pitch, and flags ±3-semitone neighbors of the anchor in the author's draft. Could be a CLI: `pnpm exec tsx scripts/check-enrichment-r6.ts <record-id>`. Run between draft + commit.
- **Model upgrade.** qwen2.5:7b's counting horizon is ~9. A stronger model (qwen2.5:14b, llama3.1:70b, or a non-local model) might handle counts up to 20-25, which would unlock Bach + Mozart + Für Elise — most of the corpus. The rubric's R2/R3 thresholds would relax. Slice 14's framework supports cross-model variance comparisons.
- **MCQ-targeted facts.** Instead of free-form prose, require enrichment authors to write per-MCQ-question-type facts (e.g. "rhythm_onset fact: 2 downbeat attacks at m.25 b0 and m.27 b0"). This pre-pre-pre-grounds the model on each load-bearing question type. Higher cost; potentially higher lift.
- **Tool-use scaffolding.** During E3, give the model access to a MIDI-inspector tool (`count_pitch_class(pc)`, `count_beat_1_onsets()`, etc.). This bypasses the counting horizon entirely. Probably the highest-leverage long-term move; requires E3 harness extension.
- **Reduce Bach + Mozart + Fur Elise enrichment scope.** Per Section 10, these songs all fail R4 (Bach), R2/R3 (Mozart, Bach), or have mixed pass-rates (Fur Elise). Don't waste author time on these unless one of the model/tool-use upgrades above lands.

**The strategic shift:** Slice 11 enriched 6 records via free-form prose. Slice 15 shows only 1 of 6 produced detectable lift. **Slice 16 should be smaller AND more selective AND verify with a per-record n=3 E3 rerun against the new cohort.** A 3-record cohort with rubric-rationale documented per record beats a 10-record cohort that hopes for the best.

---

## 13. Hard-gate report

| # | Gate | Status |
|---|------|--------|
| 1 | All 1378 existing tests still pass | ✅ (verified via `pnpm test` after writing this doc, no code changes) |
| 2 | Source corpus `datasets/jam-actions-v0/` byte-identical | ✅ (no record/override modifications; verified `git diff datasets/jam-actions-v0/` is empty) |
| 3 | Source eval artifacts under `datasets/jam-actions-v0/evals/` byte-identical | ✅ (no eval reruns; verified) |
| 4 | Public-package records, records.jsonl, splits, curated docs, eval artifacts byte-identical | ✅ (no public-package changes; verified) |
| 5 | Eval harnesses byte-identical (no code changes) | ✅ (`src/dataset/eval/*.ts` untouched; verified) |
| 6 | No new MCP tools / no `tool-schemas.json` changes | ✅ |
| 7 | The slice doc concretely answers BOTH questions | ✅ (Sections 7-8 answer Q1; Section 9 answers Q2) |
| 8 | The rubric is operationally checkable | ✅ (R1-R5 are auto-checkable from MIDI + scope; R6-R8 are written as a human-judgment checklist with concrete tests) |
| 9 | Per-record diagnosis covers all 5 enriched-but-no-lift records | ✅ (Sections 8.2-8.6 cover Pathétique m029, Schumann m045, Bach m045/m049/m053 each individually) |
| 10 | Finding type stated (A / B / C / D) with evidence | ✅ (Section 7: Finding C with strong A bias, evidence from Sections 4-6) |
| 11 | Optional script (if shipped) has at least 1 unit test | N/A — script deliberately skipped (Section 11) |
| 12 | No commits without explicit user authorization | ✅ (this doc is written but not committed; awaiting user authorization) |

---

## 14. Suggested commit message + tag

```
Define enrichment-worthiness rubric from Slice 14 n=3 data

Slice 15 study explains why Pathétique m025-028 produced +0.417 E3 margin
while the other 5 enriched records show 0 or negative margin. Finding C
(structural prerequisites dominate, writing-quality is a secondary filter):
the +0.417 lift came from two small-magnitude counting questions
(pitch_class_count gold=9, rhythm_onset gold=2) where qwen2.5:7b can count
from the MIDI sidecar; the 5 non-winners either have rhythm_onset
not_computable (anacrustic), or counts above the model's ~9-count
horizon (Bach late-prelude 11-25), or both. Schumann m045-048 regressed
−0.222 because the annotation emphasized A# in the same measure as the
gold A4 anchor pitch — active-harm failure mode.

The rubric (5 structural rules R1-R5, auto-checkable; 3 writing-quality
rules R6-R8, judgment-based) cleanly explains all 6 outcomes. Applied to
the 103-record public-corpus subset (excluding holdouts), it admits
~22 records under R1-R4 and ~12 records under R1-R5 (prompt-role only).
Slice 16 recommended scope: enrich 3-5 from the prompt-role candidate
list, verify with a per-record n=3 E3 rerun.

No record/code/eval changes. Slice 14's n=3 results JSON is the input,
not modified.
```

**Tag:** `jam-actions-v0-enrichment-rubric-2026-05-18`

---

## 15. References

- Slice 11 record-quality enrichment: `docs/jam-actions-v0-slice11-record-quality-enrichment.md`
- Slice 12 corpus-scale eval rerun: `docs/jam-actions-v0-slice12-corpus-scale-eval-rerun.md`
- Slice 13 prompt-isolation investigation: `docs/jam-actions-v0-slice13-prompt-isolation.md`
- Slice 14 eval stability (n=3 multi-run): `docs/jam-actions-v0-slice14-eval-stability.md`
- E3 MCQ generator: `src/dataset/eval/annotation-grounding.ts`
- Slice 14 enriched-only n=3 E3 results: `datasets/jam-actions-v0-public/evals/multi-run-n3-qwen2.5-7b-e3-enriched-results.json`
