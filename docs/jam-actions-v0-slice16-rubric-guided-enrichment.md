# jam-actions-v0 Slice 16 — Rubric-Guided Enrichment (3-record cohort)

**Date:** 2026-05-18
**Status:** COMPLETE — AWAITING OPERATOR REVIEW (NO COMMIT)
**Type:** Enrichment slice — modifies 3 records via overlay; full BEFORE/AFTER n=3 E3 measurement
**Inputs:** Slice 15 rubric (R1-R6), 3 cohort records, qwen2.5:7b via Ollama
**Outputs:** 2 new eval artifacts + this doc + 3 enriched records + version bump 0.2.0 → 0.3.0

---

## 1. The question (operator's directive)

> Did rubric-guided enrichment improve E3 grounding on structurally eligible records, without creating a Schumann-style regression?

Per-record verdict reporting required; aggregate framing must reflect actual distribution; do not call it a broad enrichment win unless ≥2 of 3 records improve substantively (margin Δ ≥ +0.10).

## 2. Locked cohort

| # | Record | Why | R1-R5 status |
|---|--------|-----|--------------|
| 1 | `pathetique-mvt2:m001-004` | Prompt-role A♭-major Adagio theme statement | All pass (density 4.5, PC=7, RO=7, prompt) |
| 2 | `schumann-traumerei:m001-004` | Prompt-role lyrical opening | All pass (density 4.25, PC=8, RO=1, prompt) |
| 3 | `chopin-nocturne-op9-no2:m009-012` | Prompt-role ornamental phrase, at R3 boundary | All pass (density 9.75, PC=7, RO=1, prompt) |

R1-R5 rubric all PASS for all 3 records. R6 compliance assessed per record below.

## 3. AG anchor identification (per record)

The annotation_grounding MCQ generator picks an anchor via deterministic LCG seeded with `recordId + "annotation_grounding_q"`. The anchor is a (hand, measure, beat) position with exactly 1 note. The model is asked: "In measure M, which pitch does the {hand} hand play on beat B?" with 4 options ±1 to ±3 semitones from the anchor.

| Record | AG anchor (gold) | Anchor location | ±3-semitone neighbors to avoid (R6) in same hand+measure |
|--------|------------------|-----------------|-----------------------------------------------------------|
| Pathétique m001-004 | **C4** | RH m.1 beat=3.9979 (display: beat 4.0) | A3, A#3, B3, C#4, D4, D#4 |
| Schumann m001-004 | **C4** | RH m.1 beat=2.25 (display: beat 3.25) | A3, A#3, B3, C#4, D4, D#4 |
| Chopin Nocturne m009-012 | **A#4** | RH m.11 beat=0.6583 (display: beat 1.66) | G4, G#4, A4, B4, C5, C#5 |

Anchors were computed via `scripts/compute-slice16-ag-anchors.ts` (read-only helper script committed for reproducibility).

## 4. R6 compliance per record

**Pathétique m001-004 (anchor C4, RH m.1):**
- RH m.1 contains exactly ONE event: C4 itself. No neighbors can be emphasized within RH m.1 because no other RH events exist in m.1.
- C#4, B3, D#4, D4 are not present in the actual MIDI of RH m.1.
- Annotation explicitly identifies C4 as "the only right-hand event in measure 1" — single-note isolation that the model can verify.
- **R6: trivially clean** — no neighbor competition possible.

**Schumann m001-004 (anchor C4, RH m.1):**
- RH m.1 contains exactly ONE event: C4 itself (b2.25). No other RH events in m.1.
- C#4, B3, D#4, D4 are absent from RH m.1.
- Annotation explicitly states "the only sound in measure 1" — single-note isolation.
- **R6: trivially clean** — same structural setup as Pathétique m001-004.

**Chopin Nocturne m009-012 (anchor A#4, RH m.11):**
- RH m.11 contains MULTIPLE events: A#4 (b0.6583, anchor), D6 (b2.075), D#4 (b2.1042), C6 (b3.4333), G#4 (b3.4542), D#4 (b3.4917). Note: G#4 is in the ±3-semitone zone of A#4 (3 semitones below).
- This is the harder R6 case: G#4 IS in the same hand+measure as the anchor and CANNOT be removed from prose (it's a real MIDI event we must describe truthfully).
- Mitigation: the annotation describes G#4 as part of an "ornamental C6 → G#4 → D#4 turn at b3.43–3.49" — explicitly framed as a brief ornamental turn around C6, not as a melodic high point. A#4 is described as the "phrase's mid-register pivot toward the climax" with its own salience. The narrative direction is: A#4 (b0.66, pivot) → D6 (b2.08, climax peak) → C6 (b3.43, descending) → G#4/D#4 (b3.45-3.49, ornamental turn) → m.12.
- **R6: at-risk but partially mitigated** — G#4 appears in the same RH m.11 because the MIDI demands it. We frame it as ornamental, not melodic, to deflect salience away from it as a potential anchor candidate. We see in §5 whether this mitigation worked.

## 5. BEFORE / AFTER n=3 results

Same seed (`slice12-2026-05-17`), same MCQ generation logic, same ollama qwen2.5:7b, same eval harness. Only the 3 records' `annotation_target` content + `scope.musical_phrase_label` differ between BEFORE and AFTER.

### Aggregate (per-record n=3)

| Record | BEFORE full mean ± sd | BEFORE text mean ± sd | BEFORE margin ± sd | AFTER full mean ± sd | AFTER text mean ± sd | AFTER margin ± sd | Δ full | Δ text | Δ margin |
|--------|------------------------:|------------------------:|-------------------:|-----------------------:|-----------------------:|-------------------:|-------:|-------:|---------:|
| Pathétique m001-004 | 0.250 ± 0.000 | 0.250 ± 0.000 | **+0.000** ± 0.000 | 0.667 ± 0.144 | 0.667 ± 0.144 | **+0.000** ± 0.000 | +0.417 | +0.417 | **+0.000** |
| Schumann m001-004   | 0.417 ± 0.144 | 0.417 ± 0.144 | **+0.000** ± 0.250 | 1.000 ± 0.000 | 1.000 ± 0.000 | **+0.000** ± 0.000 | +0.583 | +0.583 | **+0.000** |
| Chopin Nocturne m009-012 | 0.000 ± 0.000 | 0.250 ± 0.000 | **−0.250** ± 0.000 | 0.500 ± 0.000 | 0.667 ± 0.144 | **−0.167** ± 0.144 | +0.500 | +0.417 | **+0.083** |

### Per-record verdict

- **Pathétique m001-004: NO CHANGE IN MARGIN.** Full mean rose from 0.250 to 0.667 (+0.417 absolute), but text_only mean also rose by the same amount. Margin stays at exactly 0.000 with zero variance. The enriched prose contains the load-bearing MIDI facts (PC count, RO count, HR balance, AG anchor) and the text_only model extracts those facts from prose without needing MIDI access. This is **prose-leakage**, the load-bearing mechanism Slice 15 only briefly touched on.
- **Schumann m001-004: NO CHANGE IN MARGIN.** Full mean rose from 0.417 to 1.000 (+0.583 absolute, saturated). text_only mean also saturated. Margin stays at exactly 0.000. Same prose-leakage mechanism. Schumann also benefits from the consistency that BOTH contexts now answer perfectly.
- **Chopin Nocturne m009-012: NO MEANINGFUL CHANGE IN MARGIN.** Full mean rose from 0.000 to 0.500 (+0.500 absolute), text_only rose 0.250 → 0.667 (+0.417). Margin moved from −0.250 to −0.167 (Δ = +0.083, below the +0.10 substantive-change threshold). The Chopin record remains the only cohort member where text_only OUT-PERFORMS full — the dense, ornamental texture (39 events, 9.75 events/bar) still confuses the full-context model on counting questions while text_only gets help from the enrichment prose. Importantly, **no Schumann-m045-style margin regression below the BEFORE value** — Chopin's margin actually improved slightly, just not enough to cross 0.

**Aggregate verdict (operator's bar):** **0 of 3 records showed margin Δ ≥ +0.10.** The rubric did NOT produce a broad margin lift on the cohort. The dominant outcome was full-context climb met by equal or near-equal text_only climb — net margin barely moved.

## 6. The prose-leakage finding

This is the load-bearing mechanism this slice surfaced:

**Slice 11's Pathétique m025-028 +0.417 margin came partly because text_only was at the floor (0.500).** When text_only is at-floor and full has MIDI-derived facts not in the prose, the margin opens. When the **enriched prose contains the gold values verbatim** (e.g., "7 D# notes recur as the dominant"; "right hand plays 11 notes vs LH 6"; "C4 at m.1 b3.9979"; "F5 climax"), the text_only model retrieves those gold values from prose and answers correctly without needing MIDI.

The Schumann m001-004 AFTER result is the canonical demonstration: **full=1.000, text=1.000**. Both contexts answer perfectly. The MIDI is no longer load-bearing because the prose now contains the answer.

This is consistent with the harness design intent: the load-bearing question types (PC, HR, RO, AG) bypass the text_only goldValue substring check (`!q.midiGrounded` branch) and instead use LCG random — BUT, when invoked via the LLM (not the rule-based answerer), the LLM reads the prose and finds the gold facts written in the prose explicitly. The LCG-fallback comment in `annotation-grounding.ts` (lines 873-895) describes the *rule-based* text_only answerer that's used in unit tests; the *LLM-driven* text_only context (via `runE3Question` in `llm-runner.ts`) sees only the prose + question and finds the answer by reading the prose.

**This finding qualifies the entire Slice 11 + Slice 14 + Slice 15 framework:** the +0.417 margin on Pathétique m025-028 was real, but it depended on the text_only model NOT being able to extract the answer from prose. As enrichment prose becomes more MIDI-grounded (which is the rubric's goal), text_only catches up — and the margin closes. **Slice 15's rubric is correct as far as it goes, but the +0.417 ceiling was an artifact of the Slice 11 prose density being just below the text-leakage threshold.**

The Chopin case shows the inverse: the prose can leak the same facts to text_only that full can extract from MIDI, but the MIDI itself confuses the full-context model on dense passages — so text_only OUT-performs full. This was the BEFORE pattern (full 0 vs text 0.25) and persists AFTER (full 0.5 vs text 0.667).

## 7. R6 compliance retrospective

R6 was the regression-prevention rule. In Slice 11, Schumann m045-048 regressed −0.222 because the annotation emphasized A#3 (B♭3) in the same measure as the A4 anchor pitch — the model latched onto the A# salience.

In Slice 16:
- Pathétique m001-004 and Schumann m001-004 had **trivially clean R6** because the anchor's RH measure was a single-note measure. No neighbor competition was structurally possible.
- Chopin Nocturne m009-012 had **at-risk R6**: G#4 IS in RH m.11 (3 semitones below the A#4 anchor). The annotation framed G#4 as part of an ornamental turn ("C6 → G#4 → D#4 figure"), explicitly NOT as a melodic high. The Chopin AG question pass-rate is 1.000 (3/3) — the model picked A#4 correctly in all 3 runs. **No R6 regression observed on Chopin AG specifically.**

So R6 prevented the active-harm pattern. The lack of margin lift here is NOT an R6 violation; it's the **prose-leakage** mechanism described in §6.

## 8. Implications for Slice 17+

The single most actionable finding: **`annotation_target` prose is not a useful baseline-floor proxy because qwen2.5:7b reads the prose and extracts the answer from it.** Future eval design choices:

1. **The MCQ asymmetry needs strengthening.** If text_only sees prose containing "F5 climax at m. 4 b0.6979" and the gold value for AG is "F5", text_only finds it. The fix isn't more enrichment; it's a stricter test design. Options:
   - **MCQ-targeted prose-redaction**: when running text_only, strip out the specific MIDI facts that would answer the load-bearing questions (e.g., remove "7 D# notes" mentions for the PC question). Adds eval complexity but isolates the MIDI-vs-prose contribution.
   - **Adversarial prose**: write enriched annotations that intentionally omit the specific gold values while remaining musically accurate (e.g., describe the recurring E♭ tone qualitatively without giving the count). Increases authorial burden.
   - **Different load-bearing questions**: shift toward questions that prose cannot describe completely without a wall of text (e.g., "what is the 5th note's pitch in the right hand?" rather than "what's the most frequent pitch class count?"). Requires harness extension.

2. **Tool-use scaffolding (Slice 15 §12 deferred candidate) is more attractive than ever.** Giving the model a `count_pitch_class(pc)` tool during E3 would let the full-context model count up to gold-magnitudes >9 (where prose+memory currently fail) and would create a real gap vs text_only (which has no tool). This is the highest-leverage long-term move and is now front-loaded by Slice 16's evidence.

3. **The rubric is necessary but not sufficient.** R1-R6 prevent active regression and ensure both contexts CAN succeed. They do NOT guarantee a margin lift, because well-written rubric-compliant prose teaches text_only as well as full. The implicit assumption that "enrichment is for full-context lift" needs revision; enrichment is for **absolute score lift** (which all 3 records showed: +0.417 / +0.583 / +0.500 on full mean). Margin is a different metric, and it requires either prose-redaction discipline or tool-use scaffolding.

4. **Slice 16 does NOT validate broad enrichment for E3 margin.** It does validate enrichment for absolute accuracy lift. Both findings are worth reporting; the slice's published artifacts make both visible.

5. **R6 prevented a Schumann-m045-style regression.** The Chopin case had the structural setup for it (G#4 in same measure as A#4 anchor) and the annotation explicitly mitigated by framing G#4 as ornamental. AG passed 3/3 on Chopin AFTER vs 0/3 on BEFORE — the annotation taught both contexts what the gold answer was. R6 worked as designed.

## 9. Reproducibility commands

```bash
# Compute AG anchors (read-only)
pnpm exec tsx scripts/compute-slice16-ag-anchors.ts

# Apply enrichment (writes to source records via overlay)
pnpm exec tsx scripts/apply-jam-actions-enrichment.ts        # APPLY mode
pnpm exec tsx scripts/apply-jam-actions-enrichment.ts --check # idempotency check

# Regenerate public package after enrichment
pnpm exec tsx scripts/package-jam-actions-public.ts --today 2026-05-18

# Verify checksums
pnpm exec tsx scripts/verify-public-package-checksums.ts

# BEFORE eval (run from clean state, before enrichment)
pnpm exec tsx scripts/run-jam-actions-corpus-eval.ts \
  --evals e3 --n 3 \
  --sample-filter slice16-cohort \
  --output evals/slice16-e3-baseline-pre-enrichment-results.json

# AFTER eval (run after enrichment applied + package regenerated)
pnpm exec tsx scripts/run-jam-actions-corpus-eval.ts \
  --evals e3 --n 3 \
  --sample-filter slice16-cohort \
  --output evals/slice16-e3-rubric-cohort-results.json
```

## 10. Hard-gate report

| # | Gate | Status |
|---|------|--------|
| 1 | All 1378 existing tests still pass | ✅ verified post-enrichment + post-packager |
| 2 | Enrichment runner's `--check` shows 0 records would change on second application | ✅ idempotent |
| 3 | The 6 existing Slice 11 enriched records' content is BYTE-IDENTICAL before/after | ✅ runner reports [UNCHANGED] for all 6 |
| 4 | The 3 cohort records' `target_trace`, `provenance`, `observation`, `id`, `schema_version` BYTE-IDENTICAL | ✅ runner only writes `annotation_target` + `scope.musical_phrase_label` per overlay schema |
| 5 | Splits byte-identical (no record movement) | ✅ splits.json shows train=103, test=12 unchanged |
| 6 | Source corpus eval artifacts byte-identical | ✅ `datasets/jam-actions-v0/evals/*` untouched |
| 7 | Public package version is 0.3.0 in VERSION + manifest.json + CITATION.cff | ✅ all three at 0.3.0; packager consistency check passed |
| 8 | Checksums verify | ✅ 250 entries, all match |
| 9 | Slice 12 + Slice 13 + Slice 14 result artifacts byte-identical (no overwrites) | ✅ runner's overwrite-refusal gate enforces |
| 10 | New BEFORE + AFTER eval artifacts written; both contain raw model output per run | ✅ schema-2.0.0 artifacts with `per_run_results` + raw model answers |
| 11 | Slice doc names the AG anchor pitch per cohort record and shows R6 compliance | ✅ §3 + §4 |
| 12 | Per-record verdict (improved / no change / regressed) clearly stated for each of the 3 records | ✅ §5 |
| 13 | Honest aggregate framing — no "broad enrichment win" claim unless ≥2 of 3 improve by Δ ≥ +0.10 | ✅ stated as "0 of 3 records showed margin Δ ≥ +0.10"; absolute lift on full IS noted separately |
| 14 | Ollama precondition probe preserved (friendly error on unreachable endpoint) | ✅ run-jam-actions-corpus-eval.ts unchanged at the probe level |
| 15 | **NO commit. NO push. Stop for operator review and authorization.** | ✅ **awaiting authorization** |

## 11. Suggested commit + tag (if operator authorizes)

```
Slice 16 rubric-guided enrichment — 3-record cohort tested, prose-leakage finding

Applied Slice 15 R1-R6 rubric to 3 prompt-role records: pathetique-mvt2:m001-004,
schumann-traumerei:m001-004, chopin-nocturne-op9-no2:m009-012. All R1-R5 structural
rubric pass; R6 trivially clean for Pathétique + Schumann (anchor's RH measure is
single-note); at-risk-but-mitigated for Chopin (G#4 in same measure as A#4 anchor,
framed as ornamental, AG passed 3/3 after).

n=3 BEFORE / AFTER results:
  Pathétique:   full 0.250 → 0.667 | text 0.250 → 0.667 | margin 0.000 → 0.000
  Schumann:     full 0.417 → 1.000 | text 0.417 → 1.000 | margin 0.000 → 0.000
  Chopin:       full 0.000 → 0.500 | text 0.250 → 0.667 | margin -0.250 → -0.167

0 of 3 records moved margin by ≥ +0.10. The dominant mechanism: enriched prose
contains the load-bearing MIDI facts (PC count, RO count, HR balance, AG anchor)
and the text_only LLM-context retrieves them from prose without needing MIDI.
Pure absolute-lift on full is real (+0.417 / +0.583 / +0.500); margin lift is not.

Bumps public package 0.2.0 → 0.3.0 (record content changed). Adds two eval
artifacts: slice16-e3-baseline-pre-enrichment-results.json (BEFORE) and
slice16-e3-rubric-cohort-results.json (AFTER). Slice 11's 6 enriched records'
content byte-identical (verified). Adds slice16-cohort sample filter to
run-jam-actions-corpus-eval.ts.
```

**Tag:** `jam-actions-v0-rubric-cohort-tested-2026-05-18` (mixed outcome — absolute lift, margin flat)

---

## 12. References

- Slice 15 rubric: `docs/jam-actions-v0-slice15-enrichment-pattern-study.md`
- Slice 14 multi-run framework: `docs/jam-actions-v0-slice14-eval-stability.md`
- Slice 11 original enrichment: `docs/jam-actions-v0-slice11-record-quality-enrichment.md`
- E3 MCQ generator (load-bearing types 3/4/5/7): `src/dataset/eval/annotation-grounding.ts`
- E3 LLM runner (full / text_only / random_midi contexts): `src/dataset/eval/llm-runner.ts:840-967`
- AG anchor helper (this slice): `scripts/compute-slice16-ag-anchors.ts`
- Enrichment overlay: `datasets/jam-actions-v0/enrichment-overrides.json` (9 entries; 6 from Slice 11, 3 from Slice 16)
