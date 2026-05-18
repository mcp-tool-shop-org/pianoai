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

The original §5 named `bach-prelude-c-major-bwv846:m045-048` as a representative late-Bach record. Slice 11 enriched the **two adjacent late-Bach records of the same coda-texture class** as well — `m049-052` and `m053-056` — because the same enrichment template applies and leaving them sparse would have produced a one-off enrichment surrounded by structurally identical thinner records. The decision is auditable: see `datasets/jam-actions-v0/enrichment-overrides.json` for the precise overlay content. The final two late-Bach records (`m057-060` and `m061-064`) remain at their existing annotation level — they describe the final-cadence and tonic-arrival sections, which already have more architectural framing than the coda-extension records did.

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

## 9. E2 and E3 baselines fail the locked thresholds

This is the headline honest disclosure and the most important caveat in this file.

| Eval | qwen2.5:7b on test set | Locked threshold | Status |
|---|---|---|---|
| E1 tool-use | 0.75 (3/4 records majority-pass) | ≥ 0.70 | **PASS** |
| E2 phrase continuation | 0/2 pairs majority-pass; pair 1 grooveOA 0.81 PASS, pair 2 grooveOA 0.98 mean on parseable runs but only 1/3 runs parseable so does not majority-pass | ≥ 0.797 + 2/2 pairs | **FAIL** |
| E3 annotation grounding | full 0.188 vs text-only 0.313 vs random-MIDI 0.250; margin vs text-only = **−0.125**; margin vs random-MIDI = **−0.0625** | margins ≥ +0.10 over both controls | **FAIL** |

**Read this carefully:** qwen2.5:7b is the **best** local 7-13B baseline. The E3 margin going negative does not mean the dataset is broken; it means that for a model at this capability level, the *text-only* signal in `annotation_target` prose carries more answer than the MIDI evidence does. The Slice 8 hardening already removed the structural / prior-leak vectors that inflated earlier scores. The remaining gap is a real **fine-tuning target**: a model that has learned to ground in MIDI should outperform a text-only baseline; a 7B that hasn't, doesn't.

E2's failure mode at this scale is not music-quality (parseable continuations on the easier pair hit grooveOA 1.0 on multiple runs). It's **structural consistency** — pair 2 (clair-de-lune mm. 15-18 → mm. 19-22) is harmonically denser, has syncopated inner voices, and the model parses correctly on only 1 of 3 runs. FM-5 (groove mismatch on harder material despite notes present) is the fine-tuning target this dataset surfaces.

**Doctrine:** "If local 8B fails thresholds, that is valid evidence — do not jump to paid APIs to rescue the eval." A negative result on the realistic capability target is the actionable evidence.

## 10. License jurisdiction: CC-BY-SA-3.0-**DE**, not 3.0 international

The arrangements (piano-midi.de) are licensed under the **German jurisdiction port** of CC-BY-SA-3.0, not the international 3.0 license. The substantive obligations (attribution, share-alike, indicate-changes) are equivalent, but the governing law for the upstream is German law. Downstream users in non-DE jurisdictions should:

- Declare CC-BY-SA-3.0-DE on derivatives (this is the safe path).
- Or apply the localization for their own jurisdiction if equivalent.
- Or fall back to the international 3.0 deed in cross-jurisdiction contexts.

HuggingFace's dataset-card YAML slug list does not carry `-de` jurisdictions. The README declares `license: cc-by-sa-3.0` to be compatible with HF's filter; the precise DE governing-law is documented in ATTRIBUTION.md, LICENSE-DATASET.md, and the README body. Both file groups are correct; the slug is the closest available label, the documentation is the precise statement.

## 11. The package is a *checkpoint*, not a release candidate

The tag `jam-actions-v0-public-2026-05-17` (and any successor tag attached to a hardened version of this package) is a **reproducible checkpoint**, not a Zenodo/HuggingFace release candidate. The operator's posture explicitly: "treat the package/tag as a checkpoint, not a release candidate."

Slice 13 (operator-driven publication) is where this package would actually be uploaded to Zenodo (primary, gets the DOI) and HuggingFace (mirror). That step is gated on:
- This hardening pass (Slice 10.5) — IN PROGRESS / shipping in this version.
- Operator decision to publish (no auto-publish).
- README cross-link to the Zenodo DOI once it exists (which requires uploading first — so this README will get one more iteration post-DOI).

Do not link to `huggingface.co/datasets/mcp-tool-shop-org/jam-actions-v0-public` or expect a Zenodo DOI from this checkpoint. Neither exists yet.

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
