# Known Limitations — `jam-actions-v0` (public subset)

This document is the candid honesty layer for the dataset. The README sells what the dataset is for; this file says where it falls short, what's deliberately deferred, and what callers should NOT claim about it.

If something feels surprising or marketing-y in the README, check here first.

## 1. Provenance is single-source

Every MIDI sequence in this subset comes from **one upstream**: Bernd Krueger's arrangements on piano-midi.de, licensed CC-BY-SA-3.0-DE. There is no cross-source diversity in v0. A model trained on this dataset will see one arranger's interpretive choices (tempo, ornamentation handling, voicing decisions) for every record. This concentrates an inductive bias on Krueger's style.

The original Slice 7 E3 finding flagged this directly: "all 45 records share the arranger. A model with prior knowledge of piano-midi.de could guess `provenance.arrangement_creator` above chance." That observation now applies at 115 records.

Future work to diversify: integrate Mutopia Project / IMSLP MIDI / kunstderfuge mirrors with verified provenance. See ATTRIBUTION.md for the two demoted songs that may seed a re-attribution slice.

## 2. Eight songs is small

The subset covers **8 compositions** across **6 composers** in a single genre (Western art / classical, late-Baroque through early-Impressionist). For comparison:

- MAESTRO ships ~1300 performances across 60+ composers.
- POP909 ships 909 popular songs.
- Lakh MIDI ships 100K+ files (though with messier provenance).

v0 is **proof-of-concept scale**: enough to prove the dataset/eval loop works, far from enough to be a competitive symbolic-music corpus. The 115 records form 57 prompt-continuation pairs + 1 standalone; the train split is 103 records. That is a small dataset by any modern measure.

The thesis is "show that MCP-tool-use traces on real symbolic music can be evaluated to fine-tunable signal," not "ship a comprehensive music corpus." Treat the size accordingly.

## 3. Genre and instrument are not diverse

- **Single genre:** Western classical only. No jazz, no pop, no folk, no world music, no contemporary. The Slice 2 scan deliberately excluded modern copyrighted material (jazz, blues, pop, film, new-age, R&B, rock, soul, latin); the public subset further excludes the two unverifiable classical entries (Satie, Debussy Arabesque).
- **Single era spread:** roughly 1722 (Bach) to 1905 (Debussy). 200 years of stylistic range, but all within the "common-practice" tradition.
- **Single instrument:** solo piano. No orchestral, no chamber, no string, no wind, no percussion, no vocal. The schema is instrument-agnostic (`instrument` is `z.string().min(1)`), but every record carries `"piano"`.

A model trained on v0 will not generalize to other genres or instruments without domain transfer.

## 4. No vocal records, despite a declared VSE dependency surface

The source repository declares `vocal_synth_engine` (VSE) as a `declared_dependency_surface` in `instrument_surfaces`. The thesis is that the "instrument-actions" framing extends to singing (VSE's `VocalScore` schema with phonemes, dynamics, timbre morph, etc.). **No vocal records ship in v0.**

The public-subset `manifest.json` deliberately lists **only** `ai_jam_sessions` under `instrument_surfaces`. The VSE entry is intentionally absent from this public package because no vocal records are included. The source manifest still carries VSE as a declared dependency for future v0.x record types (`vocal_phrase`, `sing_along_trace`, `phoneme_alignment`, `vocal_render_score`).

If you are looking for vocal MIDI traces, this dataset will disappoint you. Track the source repo for a future v0.x with vocal coverage.

## 5. Annotation depth varies across records

Some annotations are richly detailed; others are skeletal. Concrete examples:

**Rich annotations** (use as references for what dataset-grounded annotation should look like):

- `bach-prelude-c-major-bwv846:m001-004:...` — 4 key_moments naming specific harmonies, 3 teaching_goals, 3 style_tips, 2 teaching_notes with measure-specific technique.
- `mozart-k545-mvt1:m001-004:...` — names the ascending C-scale, Alberti bass pattern, half-cadence to G; teaching_goals call out the sonata-form first-theme identification.
- `chopin-nocturne-op9-no2:m001-004:...` — "cantabile RH touch", "LH-RH independence", "imagine the melody as a human voice".
- `fur-elise:m001-008:...` (standalone) — full E-D# neighbor motion analysis with cadence and restatement.

**Sparser annotations** (historical — addressed in Slice 11):

- `pathetique-mvt2:m029-032:...` — `key_moments` reduced to "episode continues", "return is imminent"; only 1 teaching_note. Recurring pattern: middle-of-piece records often had generic key_moments (episode/transition language) where opening / cadential records had specific harmonic language. **(Addressed in Slice 11; see enrichment-overrides.json. The Pathétique pair m. 25–28 + m. 29–32 was enriched together so the antecedent–consequent harmonic arc is named: A♭-minor middle episode with wandering bass G3→D♭→B♭2, climaxing on F5 at m. 25 b2.6, suspended over F2 pedal at m. 28, and resolving via the G#2/A♭2 dominant pedal at m. 31 into the cantabile theme's return at m. 33.)**
- `schumann-traumerei:m045-048:...` — 3 short key_moments, 2 style_tips ("pp to ppp", "let the final chord ring"); 1 teaching_note. The musical content is genuinely "fade-and-resolve" so sparseness is partly faithful, but it was still thinner than the opening records. **(Addressed in Slice 11; see enrichment-overrides.json. The closing is now named in terms of its actual MIDI events: A4 descending offbeat figures over chromatic LH motion in m. 45, F2 tonic pedal entering at m. 46 b3.4 and sustaining ≈3.32 s, and the closing F-major arpeggio F4→A4→C5→F5 rising offbeat across m. 48. Honest-absence note preserved: this record has no downbeat onsets — rhythm_onset stays not_computable.)**
- `bach-prelude-c-major-bwv846:m045-048:...` (and similar late-Bach records) — dropped to "play it with fresh ears, not like a routine"; 1 teaching_note. The prelude's identical-arpeggiation texture across measures is a real corpus property (it's what makes Bach E2 score 1.0 on rhythm/groove vs shuffled), but the annotation could still say more about the long-form architecture. **(Addressed in Slice 11; see enrichment-overrides.json. The late-Bach records m. 45–48 / m. 49–52 / m. 53–56 in the Krueger arrangement are NOT the opening texture — they are a coda extension with multi-voice writing over a structural lower-register bass (G2/A2 attacks, not the opening's single LH pedal), chromatic pitches outside C major (F#5 at m. 45 b1.0, A#2 in m. 51, G#4 in m. 52), and harmonic motion preparing the final cadence. The enrichment names this as cadential-preparation texture, not tonic-cycling.)**

### 5b. Scope expansion in Slice 11

The original §5 named `bach-prelude-c-major-bwv846:m045-048` as a representative late-Bach record. Slice 11 enriched the **two adjacent late-Bach records of the same coda-texture class** as well — `m049-052` and `m053-056` — because the same enrichment template applies and leaving them sparse would have produced a one-off enrichment surrounded by structurally identical thinner records. The decision is auditable: see `datasets/jam-actions-v0/enrichment-overrides.json` for the precise overlay content. The final two late-Bach records (`m057-060` and `m061-062`) remain at their existing annotation level — they describe the final-cadence and tonic-arrival sections, which already have more architectural framing than the coda-extension records did.

Slice 11 also enriched the **prompt half** of the Pathétique middle-section pair (`pathetique-mvt2:m025-028`) — not flagged in §5's original list, but enriching only the continuation would have produced an asymmetric pair where the consequent's harmonic-arc framing implied a prompt-side framing that didn't exist on disk. The pair is enriched as a unit.

Six records total were enriched in Slice 11:
- `pathetique-mvt2:m025-028` (prompt) + `pathetique-mvt2:m029-032` (continuation_target)
- `schumann-traumerei:m045-048` (continuation_target)
- `bach-prelude-c-major-bwv846:m045-048` (continuation_target) + `m049-052` (prompt) + `m053-056` (continuation_target)

All enrichment flows through the durable overlay file `datasets/jam-actions-v0/enrichment-overrides.json`; record JSONs are NEVER hand-edited as the source of truth. Re-running `scripts/apply-jam-actions-enrichment.ts` with the same overlay produces byte-identical output (idempotency confirmed; the runner ships a `--check` flag for CI gating).

Other records in the corpus retain their existing annotation depth. Future enrichment slices may address adjacent sparseness (e.g., middle-piece transitions in other songs); §5's "honest absence > fabricated metric" doctrine still applies — if a record's MIDI doesn't ground rich enrichment, it stays at its current depth.

## 6. Three records (in source, not in this public subset) marked `rhythm_onset: not_computable`

Three records in the **source corpus** have anacrusis or syncopated phrase entries with no downbeat onsets:
- `pathetique-mvt2:m029-032` (in this public subset)
- `pathetique-mvt2:m057-060` (in this public subset)
- `schumann-traumerei:m045-048` (in this public subset)

For these, the E3 `rhythm_onset` question generator correctly returns `not_computable` — there are no downbeat onsets to count. This is **honest absence**, not a defect. The other E3 load-bearing question types (`pitch_class_count`, `hand_register`, `annotation_grounding`) remain 100% computable on these records.

Doctrine: "honest absence > fabricated metric." The musical reason (anacrusis has no downbeats) is more important than 100% coverage. The aggregate E3 gates still pass with 142/145 records contributing rhythm_onset (in the source corpus; 112/115 in the public subset, applying the same heuristic).

A future eval-design slice may introduce a separate strong-beat metric that accommodates anacrusis without collapsing to `not_computable`.

## 7. Local-only eval baselines (no paid-API comparison)

All eval numbers shipped in this release were produced on local Ollama backends: `hermes3:8b`, `qwen3:8b`, `qwen2.5:7b`. No Anthropic / OpenAI / paid-API baselines are included. This is doctrine: the realistic capability target for a v0 fine-tune is a local 7-13B model, not Sonnet/GPT-4-class. Paid-API baselines would be nice-to-have comparison points but are not part of this release.

If you want a paid-API comparison, the source repo's eval CLI supports `--backend anthropic` (and `--model claude-...`). You will need an API key and you will spend money. The dataset does not assume you will.

## 8. No fine-tuned model ships

This is a **dataset + eval harness only** release. No fine-tuned LoRA, no adapter weights, no `.gguf`. The Slice 9c local LoRA experiment ran but was deferred — Phase 1 (training data export + scaffold) shipped, but Phase 2 (training execution) hit system memory pressure on the available 5080-laptop substrate and was aborted before any adapter was produced. The deferral is on **compute-substrate grounds**, not dataset / harness defect.

The 20-example SFT scaffold from Slice 9c Phase 1 is preserved in the source repo at `experiments/jam-actions-v0-lora/`. A future run on safer hardware (desktop GPU with 24+ GB VRAM, or radically reduced footprint) can pick it up.

Do not claim "ready to fine-tune" without disclaiming the substrate need. The dataset is *fine-tuneable* in the sense that it has paired records, clean tokenizations, and held-out test discipline; it is not *fine-tuned*.

## 9. E2 and E3 baselines — layered current state

This is the headline honest disclosure and the most important caveat in this file. The dataset's evolution is preserved here as a layered record. **Historical claims are kept as history (not deleted); the current state is named alongside with explicit slice references.**

### 9a. Slice 7 baseline (historical, single-run, pre-enrichment, pre-MCQ-repair)

The original v0 release showed:

| Eval | qwen2.5:7b on test set | Locked threshold | Status |
|---|---|---|---|
| E1 tool-use | 0.75 (3/4 records majority-pass) | ≥ 0.70 | **PASS** |
| E2 phrase continuation | 0/2 pairs majority-pass; pair 1 grooveOA 0.81 PASS, pair 2 grooveOA 0.98 mean on parseable runs but only 1/3 runs parseable so does not majority-pass | ≥ 0.797 + 2/2 pairs | **FAIL** |
| E3 annotation grounding | full 0.188 vs text-only 0.313 vs random-MIDI 0.250; margin vs text-only = **−0.125**; margin vs random-MIDI = **−0.0625** | margins ≥ +0.10 over both controls | **FAIL** |

This was n=1 sampling on a 4-record cohort, with two pre-Slice-11 caveats: no annotation enrichment, and the Slice 18.5 MCQ off-by-one bug in `annotation-grounding.ts` deflated `pathetique-mvt2:m017-020` answers. The negative margin was real for that snapshot; the dataset was honest about failing its own gate.

### 9b. Slice 11 enrichment + Slice 18.5 MCQ repair (the recovery arc)

Slice 11 enriched 6 records via the durable `enrichment-overrides.json` overlay (Pathétique m025-028 + m029-032 pair; Schumann m045-048; three late-Bach records). Slice 18.5 fixed the MCQ off-by-one bug in `annotation-grounding.ts` and added a `count_notes_with_pitch_class` inspector tool. Slice 19 ran a fair n=3 16-record E3 baseline against the post-repair harness:

- E3 enriched margin (Slice 18.5 baseline, 6-record enriched subset, n=3): **+0.069**
- E3 corpus margin (Slice 19 baseline, 16 records, n=3): **+0.127**; 9/16 records clear the +0.10 per-record margin

The headline metric had recovered, but Slice 21 surfaced a final stratum-floor issue: Schumann m045-048 was a catastrophic outlier (mean −0.278, 0/2 clearing).

### 9c. Slice 21 enrichment + Slice 22 revised RC gate (current state)

Slice 21 enriched the Schumann m045-048 annotation against the actual MIDI events (R6-aware rewrite naming the A4 descending offbeat figures, F2 tonic pedal, and closing F-major arpeggio). The post-repair 16-record E3 baseline (`slice21-fair-e3-baseline-results.json` — measured on v0.4.3 records; since v0.5.0 it ships in the v0.4.3 deposit and the source repo's git history rather than in this package, per RELEASE_NOTES) shows:

- Cohort margin (tool_inspected vs text_only): **+0.161**
- Records clearing +0.10 per-record margin: 10/16 (62.5%)
- All 5 strata clear the revised per-stratum gate (bach / pathetique / schumann / chopin / clair-de-lune)

Slice 22 then revised RC-gate axes 2 + 6 to distinguish *margin_pass* from *ceiling_saturated_pass* records (records that hit text_only=1.0 and tool_inspected=1.0 contribute to the gate without a margin penalty, since saturation is not informative about MIDI grounding). The revised gate emits assessments under `release-gate-assessment/2.0.0` schema. Slice 22 verdict against the Slice 21 baseline:

**RC gate PASS** (all 6 blocking axes cleared + axis 7 reporting declared). See `evals/slice22-release-gate-revised-assessment.json` for the canonical PASS artifact.

The regression check at `evals/slice22-release-gate-slice19-regression-check.json` shows the pre-Slice-21 Schumann state still FAIL under the revised gate (axes 1/2/6 blocking), confirming the gate's discrimination power.

### 9d. What this means going forward

The "E3 baselines fail the locked thresholds" headline from Slice 7 is no longer the current state. The current state (Slice 22 revised RC gate) is **PASS** for the dataset's release-readiness on this evaluation axis. **Future claims about E3 grounding must cite the Slice 22 assessment or a later one.** The historical record is preserved in this file for evolutionary honesty.

E2 (phrase continuation) was not revisited in Slices 11-22; the Slice 7 disclosure above is still the most recent state for that axis. A future eval slice may revisit E2 with the post-Slice-18.5 harness; until then, treat E2 as an honest legacy disclosure: pair 1 passes, pair 2 fails on parsing consistency at the local-8B capability target.

**Doctrine (preserved):** "If local 8B fails thresholds, that is valid evidence — do not jump to paid APIs to rescue the eval." The Slice 21 / Slice 22 recovery did not change the doctrine; it improved the dataset's annotation grounding through honest enrichment and surfaced the gate's blind spot through honest revision.

## 10. License jurisdiction: CC-BY-SA-3.0-**DE**, not 3.0 international

The arrangements (piano-midi.de) are licensed under the **German jurisdiction port** of CC-BY-SA-3.0, not the international 3.0 license. The substantive obligations (attribution, share-alike, indicate-changes) are equivalent, but the governing law for the upstream is German law. Downstream users in non-DE jurisdictions should:

- Declare CC-BY-SA-3.0-DE on derivatives (this is the safe path).
- Or apply the localization for their own jurisdiction if equivalent.
- Or fall back to the international 3.0 deed in cross-jurisdiction contexts.

HuggingFace's dataset-card YAML slug list does not carry `-de` jurisdictions. The README declares `license: cc-by-sa-3.0` to be compatible with HF's filter; the precise DE governing-law is documented in ATTRIBUTION.md, LICENSE-DATASET.md, and the README body. Both file groups are correct; the slug is the closest available label, the documentation is the precise statement.

## 11. The package is a *checkpoint*, not a release candidate — layered current state

### 11a. Slice 10.5 baseline (historical, original framing)

The tag `jam-actions-v0-public-2026-05-17` was framed as a **reproducible checkpoint**, not a Zenodo/HuggingFace release candidate. The operator's posture at that time: "treat the package/tag as a checkpoint, not a release candidate." Slice 13 was the originally-named publication slice; it was gated on (a) the Slice 10.5 hardening pass landing, (b) operator decision to publish, and (c) post-DOI README iteration.

### 11b. Current state (Slice 22 + Slice 23 + Slice 23.5)

The project progressed past the Slice 10.5 checkpoint framing into a multi-slice readiness arc:

- **Slice 11** (annotation enrichment, 6 records via overlay; v0.2.0).
- **Slice 18.5** (MCQ off-by-one repair; new `count_notes_with_pitch_class` inspector tool).
- **Slice 19** (fair n=3 16-record E3 baseline; v0.3.0).
- **Slice 20** (release-gate framework — 7 axes, pure validator; CLI at `scripts/check-release-gate.ts`).
- **Slice 21** (Schumann m045-048 enrichment + repackage; v0.4.0).
- **Slice 22** (RC-gate axes 2 + 6 revision; `release-gate-assessment/2.0.0` schema; PASS verdict canonical at `evals/slice22-release-gate-revised-assessment.json`).
- **Slice 23** (operator-aloneness / reproducibility audit; 13-gap inventory at `docs/jam-actions-v0-slice23-operator-aloneness-audit.md`; tag `jam-actions-v0-aloneness-audit-gaps-2026-05-19`).
- **Slice 23.5** (reproducibility cleanup; v0.4.1; `.gitattributes` LF pin for `*.sha256`; CRLF-tolerant verifier; CLI positional-arg strict mode; this layered-limitations refresh).

**The current state is "RC-gate PASS verified + reproducibility cleared."** The operator's locked doctrine remains: **gate clearance + reproducibility ≠ release approval**. The package is now ready for the operator to weigh against publication mechanics, but publication itself is a downstream slice (Slice 24+ candidate scope: Zenodo DOI mechanics + HuggingFace mirror).

### 11c. What you can / cannot claim about this checkpoint

You **can** cite:
- The Slice 22 RC-gate PASS verdict (`evals/slice22-release-gate-revised-assessment.json`).
- The Slice 23 operator-aloneness audit findings (3 blockers + 8 moderate gaps at the time of audit; resolved in Slice 23.5).
- The current Slice 23.5 reproducibility state (Windows-safe checksum verification; CLI strictness; layered limitations honesty).

You **cannot** cite:
- A Zenodo DOI for this version (none exists yet; future Slice 24+ work).
- A HuggingFace mirror URL at `huggingface.co/datasets/mcp-tool-shop-org/jam-actions-v0-public` (does not exist yet).
- "Release-approved" status. Gate clearance + reproducibility is necessary but not sufficient; operator decision is the final gate.

The Slice 13 publication plan from the Slice 10.5 era has been superseded by the Slice 22 + Slice 23 + Slice 23.5 arc above. The publication slice number is now Slice 24+; the README iteration to cross-link a Zenodo DOI still applies, but the DOI itself is a future deliverable.

## 12. The dataset card YAML lacks per-record splits configs

The README YAML declares one config with `path: records.jsonl` mapped to `split: train`. This is HF-loader-friendly but does not surface the actual train/test pair-locked discipline in the loader API. To use the held-out test set, consumers must consult `splits.json` directly. A future packaging slice may emit two-config HF metadata (one config per split) if HF tooling support justifies the complexity.

## 13. What this dataset is NOT

- **Not a music-generation dataset** (ChatMusician/MuPT lane). The traces train tool use over symbolic music, not free generation.
- **Not audio-conditioned.** No `.wav`, no spectrograms, no audio features. Symbolic only.
- **Not multi-instrument orchestration training.** Solo piano in v0.
- **Not a benchmark for music understanding.** E3 is an annotation-grounding eval; it tests whether the model uses MIDI evidence vs text priors. It is not a comprehensive MIR benchmark.
- **Not ready to fine-tune without compute consideration.** The 5080-laptop substrate hit memory pressure. The 20 SFT examples + scaffold are ready for a real GPU; the dataset itself does not solve the substrate question.
- **Not a release-candidate.** See section 11.
- **Not licensed for proprietary closed-source derivatives without share-alike.** CC-BY-SA-3.0-DE means derivatives must carry a compatible share-alike license. See LICENSE-DATASET.md for the obligations.

## What this dataset IS (negative-space-out-of-the-way)

Once the limitations above are clear, the value proposition is:

- **A working proof that MCP-tool-use traces grounded in real schemas can be packaged with held-out test discipline.**
- **A working proof that three falsifiable evals (E1 / E2 / E3) can be run end-to-end on a $0 local stack.**
- **A working proof that real-license real-attribution provenance can flow from a single upstream through to a shippable artifact.**

For any of those three claims to extend to "and the dataset is genre-diverse, large-scale, and fine-tune-ready," more slices are needed. This release is the proof of method.
