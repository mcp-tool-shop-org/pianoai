# jam-actions-v0 — Erratum 002: Bach BWV 846 annotation prose describes music that is not there

**Status: APPLIED — tier AB, director-approved 2026-07-11.** All 16 Bach records in the working set plus the corpus builder's SONG_SPECS carry the corrected text; machine receipt with before/after sha256 per file: `datasets/jam-actions-v0/revisions/r002-bach-annotation-prose/receipt.json`. The sealed published package **v0.4.3 (Zenodo DOI 10.5281/zenodo.20279919) is unchanged** — its checksum assert ran before and after the apply. The correction ships with the next public package cut (v0.5.0 per erratum-001).

## The finding

Filed in [erratum-001](jam-actions-v0-erratum-001-bach-m061-064.md) §Known residuals (2026-07-11): the Bach records from m033 onward describe prelude material, but measures 36–62 of this MIDI are the **fugue**. The source MIDI (`songs/library/classical/bach-prelude-c-major-bwv846.mid`, piano-midi.de, Bernd Krüger) is "Praeludium und Fuge 1 in C-Dur BWV 846": **prelude mm. 1–35 + fugue mm. 36–62** concatenated. Track names confirm it — "Piano right"/"Piano left" sound in mm. 1–35 only; "Fuga 1"–"Fuga 4" (four real voices) sound from mm. 36/37/39/40 to m62.

The Slice-9b song spec was authored against an imagined ~64-measure prelude: "famous low G pedal point" at mm. 33–36, "dominant pedal continues" at 37–40, "tonic resolution" at 41–48, calm wind-down at 49–60, "final arpeggios settle onto the home key" at 61–62. None of that music exists at those measures.

This revision's ground-truth pass (per-measure derivation from the MIDI — see §Ground truth) additionally found that the **prelude-window prose (mm. 1–32) carries wrong chord letters and misplaced pedal structure** — e.g. the spec calls m2 "A minor" where the music is Dm7/C, places the dominant pedal at mm. 33–40 when it is mm. 24–31, and calls m32 "continued dominant preparation" when the bass lands on tonic C there. Hence the two-tier scope decision below.

What this erratum does NOT touch: tool calls, phrase windows, record ids, MIDI sidecars, REMI/ABC tokens, piano-roll SVGs, splits. All were verified by r001/G6a and none encode the false prose. This is a training-text content fix only.

## Ground truth (executed, 2026-07-11)

Derived mechanically from the source MIDI (sha pinned by every record's sidecar; 1,284 notes; ticksPerBeat 480; agrees with the machine-derived `musicalLanguage` in the song's library config on every overlapping figure). The revision script **re-derives and asserts every fact below at run time** and hard-fails on mismatch — the receipt embeds the derived values.

- **Prelude harmonic reality (one arpeggiated chord per bar, 16 onsets/bar):**
  m1 C · m2 Dm7/C · m3 G7/B · m4 C · m5 Am/C · m6 D7/C (first accidental, F#) · m7 G/B · m8 Cmaj7/B · m9 Am7 · m10 D7 · m11 G · m12 dim7/G · m13 Dm/F · m14 dim7/F · m15 C/E · m16 Fmaj7/E · m17 Dm7 · m18 G7 · m19 C · m20 C7 (Bb) · m21 Fmaj7 · m22 F#dim7 · m23 dim7/Ab · **m24–31 dominant pedal on G2** (C/G, G7sus, G7, dim7-over-G alternating) · **m32–35 tonic pedal on C2** (m32 C7 with Bb, m33 subdominant color, m34 G7-over-C, m35 the final held C-major chord — 5 onsets, one attack).
- **Fugue (mm. 36–62), four voices:** alto alone states the subject at m36 (C4, after an eighth rest: C–D–E–F stepwise + sixteenth turn); soprano answers on G4 mid-m37; tenor enters on G3 at m39; bass on C3 mid-m40. Onset density jumps 16/bar (prelude) → 28–40/bar.
- **17 interval-exact subject-head statements** across the four voices at mm. 36, 37, 39, 40, 42 (×2 — soprano+tenor ONE BEAT apart: stretto), 44, 45 (×2), 49 (×2, one beat apart), 50, 51 (×2, one beat apart), 55, 59 (×2). Five statements crowd into mm. 49–51 — the climactic pile-up.
- **Chromatic shading by window:** F# under the answers (mm. 37–40); C#+Bb at m43 (D-minor shade); G# mm. 46–48 (A minor); G#+Bb+F# mixed at m51; C# mm. 53–54; Bb mm. 59–60 (subdominant lean); B natural returns m61.
- **Density peaks:** m47 = 37 onsets; **m53 = 40 onsets — the busiest bar of the entire piece** (the old prose calls mm. 53–56 "harmonic motion slowing").
- **The ending:** m58 bass lands on G (the last dominant); **m59 bass strikes low C3 and holds it 16 beats — a tonic pedal through the final bar** — while the tenor states the last full subject entry rising out of the pedal (an exact octave-down mirror of the alto's m36 opening, same beats) and the alto answers on F; m61 turns Bb back to B natural; m62 closes with a soprano octave run (C5→C6) onto a wide-spaced C major chord (C3–C4–E5–G5–C6). No arpeggios; nothing "settles" — a four-voice fugue cadence.

Per-window claim vs. reality:

| Window | Spec/record claims | The MIDI contains |
|---|---|---|
| 33–36 | "famous low G pedal point begins", arpeggio texture unchanged | Prelude coda over a **C** pedal (mm. 33–34), the final chord (m35), then the **fugue subject alone** (m36) |
| 37–40 | "G bass persists", pedal tension maintained | Fugue **exposition**: soprano answer m37, tenor m39, bass m40; 1→4 voices; density ×2 |
| 41–44 | dominant pedal "resolves", tonic relief | First **strettos** (soprano+tenor one beat apart at m42), alto entry m44, D-minor shade m43 |
| 45–48 | "calm tonic cycling", "serenity restored" | Stretto chain: bass entry m45 echoed within a beat; A-minor color; m47 among the densest bars |
| 49–52 | "penultimate section", "goal-directed calm" | **Five subject statements in mm. 49–51** — the fugue's climactic pile-up, maximum chromatic mix |
| 53–56 | "harmonic motion slowing" toward cadence | **m53 is the busiest measure of the whole piece** (40 onsets); sequential drive, entry at m55 |
| 57–60 | "last dominant preparation", m60 "penultimate chord" | Dominant landed at m58; **m59 begins the held tonic pedal** with the final subject entries above it |
| 61–62 | "final arpeggios settle onto the home key", "prelude complete" | Coda **over the pedal**: B natural returns, soprano octave run, wide-spaced C-major close of the **fugue** |
| 1–32 (tier B) | e.g. m2 "A minor", m10 "G7", mm. 25–28 "no pedal yet", m32 "dominant preparation" | m2 Dm7/C, m10 D7, mm. 24–31 ARE the G pedal, m32 lands the tonic pedal |

## Scope decision (the director's call)

- **Tier A — the filed residual (8 records, mm. 33–62):** `m033-036` through `m061-062`. Fixes the prelude/fugue category error. This is the scope named in erratum-001.
- **Tier AB — all 16 Bach records (recommended):** tier A plus the 8 prelude-window records (mm. 1–32), whose chord letters and pedal placement contradict the MIDI. The dataset's own doctrine treats MIDI tick truth as canonical; shipping 8 corrected records beside 8 known-wrong ones leaves falsehoods in training text we have already measured. Same mechanics, same receipt, same session.

**Decision: the director approved tier AB (2026-07-11).**

All 16 records are train-split; no val/test contamination question arises. Every affected id stays identical.

## The correction (old → new, per window)

Applied by [scripts/revise-jam-actions-v0-r002-bach-annotation-prose.ts](../scripts/revise-jam-actions-v0-r002-bach-annotation-prose.ts). Per record it replaces exactly nine prose slots — `scope.musical_phrase_label`, the five `annotation_target` fields (structure, key_moments, teaching_goals, style_tips, teaching_notes), and the user/analysis/summary turns of `target_trace` — and asserts everything else byte-identical. The complete new text for every field is the script's `CORRECTIONS` table (single source of truth; the builder's SONG_SPECS must carry the same strings — mechanically asserted at apply time). The analysis turn is quoted in full below; the other fields change in the same direction.

### m033–036 — prompt (user turn also corrected)

> **OLD user:** "Show me measures 33–36 of the Bach Prelude — the famous dominant pedal begins here. Describe it."
>
> **OLD analysis:** "Measures 33–36 introduce the famous low G pedal point: a sustained G in the bass underpins shifting upper harmonies. The 16th-note arpeggio texture is unchanged but now a drone-like G bass creates immense tension. Let me loop mm. 33–36."
>
> **NEW user:** "Show me measures 33–36 of the Bach BWV 846 — the prelude ends here and the fugue begins. What happens at the seam?"
>
> **NEW analysis:** "Measures 33–36 are the seam between the two movements of BWV 846. The prelude closes over a low C octave pedal: m.33 lays subdominant color (F and A, joined by D) over it, m.34 answers with a G7 sweep over the same C bass, and m.35 lands the final held C major chord — the arpeggio pattern stops entirely. Then m.36 opens the four-voice fugue: the alto alone states the subject, a stepwise climb C-D-E-F capped by a turning sixteenth figure. Let me loop mm. 33–36."

### m037–040 — continuation

> **OLD:** "Measures 37–40 continue the dominant pedal with different upper voicings — the G bass persists while the arpeggios shift harmony above it. The tension of the pedal point is maintained. Let me loop mm. 37–40."
>
> **NEW:** "Measures 37–40 are the heart of the fugue's exposition. The soprano answers at the dominant in m.37 (the subject shape starting on G), the tenor enters on G an octave lower in m.39, and the bass completes the four-voice texture with the subject on C in m.40. Each entry adds a genuinely independent line — by m.40 the note density has nearly doubled, and F# inflections color the answer entries. Let me loop mm. 37–40."

### m041–044 — prompt

> **OLD:** "Measures 41–44 bring the resolution of the dominant pedal: the G bass gives way and tonic C harmony returns. The relief is palpable after the long pedal tension. Let me loop mm. 41–44."
>
> **NEW:** "With all four voices in, Bach immediately tightens the imitation. In m.42 the soprano and tenor state the subject one beat apart — a true stretto — and the alto follows with its own entry in m.44. Passing C# and Bb around m.43 briefly shade the music toward D minor, and the texture now runs about twice the note density of the prelude. Let me loop mm. 41–44."

### m045–048 — continuation

> **OLD:** "Measures 45–48 continue the tonic resolution area — the harmony cycles calmly back toward the home key after the dramatic pedal point. The arpeggios return to their opening serenity. Let me loop mm. 45–48."
>
> **NEW:** "The stretto chain keeps building: the bass states the subject in m.45, echoed a beat later by the alto starting on D, and G# inflections through mm. 46–48 pull the music toward A minor. Measure 47 is one of the busiest bars in the entire piece — nothing here is settling; the fugue is accumulating energy. Let me loop mm. 45–48."

### m049–052 — prompt

> **OLD:** "Measures 49–52 continue the penultimate section: the arpeggios move through the final chord cycles before the piece's conclusive cadence. The texture remains even; the harmony is calm and goal-directed. Let me loop mm. 49–52."
>
> **NEW:** "This is the fugue's tightest imitation. Five subject statements crowd into mm. 49–51: alto and tenor a beat apart in m.49, the bass at the top of m.50, then soprano and alto overlapping in m.51 — while G#, Bb, and F# mix into the lines. This pile-up is the climax the fugue has been building toward. Let me loop mm. 49–52."

### m053–056 — continuation

> **OLD:** "Measures 53–56 complete the penultimate phrase and move toward the final cadential gesture. The piece is winding down — the harmonic motion slows toward the cadence. Let me loop mm. 53–56."
>
> **NEW:** "Measure 53 is the single busiest bar of the entire piece — forty note onsets — and mm. 53–56 keep that energy moving through sequential figures colored by C# (a D minor shade), with one more soprano entry arriving late in m.55. Nothing slows down yet; the music is still driving toward the close. Let me loop mm. 53–56."

### m057–060 — prompt

> **OLD:** "Measures 57–60 are the final approach: the arpeggio texture moves through the last dominant preparation before the piece's closing tonic statement. The emotional arc is completing. Let me loop mm. 57–60."
>
> **NEW:** "Measures 57–58 make the last cadential push — the bass winds stepwise down and lands on G, the dominant, at the end of m.58. Then m.59 begins the real ending: the bass drops to a low C and holds it as a tonic pedal all the way to the final bar. Above it the tenor states the fugue's last full subject entry — mirroring the alto's opening statement an octave below — answered by the alto starting on F, while Bb color tilts the harmony toward the subdominant. Let me loop mm. 57–60."

### m061–062 — continuation (r001's record; window/tool calls stay exactly as r001 fixed them)

> **OLD:** "Measures 61–62 complete the prelude with the final tonic C arrival — the last arpeggios settle onto the home key. The entire harmonic journey resolves peacefully. Let me loop mm. 61–62."
>
> **NEW:** "Measures 61–62 close the fugue over the low C that has been sounding since m.59. During m.61 the Bb color gives way to B naturals and the harmony turns for home; in m.62 the soprano sweeps up an octave run to the top of the final sonority — a wide-spaced C major chord with the tenor and bass anchored on C. The four-voice journey that began with a single line at m.36 ends in one ringing chord. Let me loop mm. 61–62."

### Tier B — m001–004 / m005–008 (chord letters)

> **OLD (m001–004):** "…m.1 C major (C-E-G-C-E), m.2 A minor (C-E-A), m.3 D minor7 (D-F-A-C), m.4 G major with a leading seventh (B-D-G)…" — **NEW:** "…m.1 C major (C-E-G), m.2 D minor seventh over the same C bass (C-D-F-A), m.3 G7 over B (B-D-F-G), m.4 C major again. Tonic, gentle dissonance, dominant, home…"
>
> **OLD (m005–008):** "…m.5 C major again (tonic return), m.6 C7 (dominant-function color), m.7 F major (subdominant arrival), m.8 F diminished…" — **NEW:** "…m.5 A minor over the C bass, m.6 D7 over C — the piece's first accidental (F#) — m.7 G major over B, m.8 C major seventh over B…" (the old m6 note claimed "C7 adds Bb — the first flat pitch in the piece"; the first accidental is m6's F#, and Bb first arrives at m20.)

### Tier B — m009–012 / m013–016

> **OLD (9–12):** "m.9 C major (tonic), m.10 G7 (dominant seventh), m.11 C major, m.12 G7 again… The dominant seventh appears for the first time here" — **NEW:** "m.9 A minor seventh, m.10 D7, m.11 G major — a ii–V–I in G — and m.12 shades the new G bass with a tense diminished seventh."
>
> **OLD (13–16):** "m.13 Am (relative minor), m.14 D7 (secondary dominant), m.15 G (dominant), m.16 G7. The pair shape is ii7–V–V7" — **NEW:** "m.13 D minor over F, m.14 a diminished seventh over the same F bass, m.15 C major over E, m.16 F major seventh over E. The bass walks down by step while every chord is softened by inversion."

### Tier B — m017–020 / m021–024

> **OLD (17–20):** "m.17 C major returns (tonic), m.18 Am7, m.19 D minor, m.20 B diminished" — **NEW:** "m.17 D minor seventh, m.18 G7, m.19 C major — a full ii–V–I home — then m.20 turns the tonic into C7, whose Bb points the music toward F."
>
> **OLD (21–24):** "m.21 G7, m.22 Cmaj7, m.23 Fmaj7, m.24 F/D diminished" — **NEW:** "F major seventh at m.21, then the bass climbs — F# diminished seventh at m.22, a diminished seventh over Ab at m.23 — and lands on G at m.24, where the long dominant pedal begins."

### Tier B — m025–028 / m029–032 (the pedal put back where it is)

> **OLD (25–28):** "chords move through diminished and augmented areas, creating the most chromatic tension in the piece" (no pedal mentioned — the spec placed it at m33) — **NEW:** "Measures 25–28 all ride the dominant pedal that began at m.24: the bass holds G while the harmonies above alternate — C major over G at m.25, a suspended G7 at m.26, G7 proper at m.27, and at m.28 a diminished seventh stacked on the pedal."
>
> **OLD (29–32):** "the harmony moves back through G7 territory, building toward the long pedal point that concludes the piece" — **NEW:** "Measures 29–31 are the pedal's last stand — C major over G, a suspended seventh, then G7 — and at m.32 the bass finally drops to a low C. The new tonic pedal arrives colored as C7, its Bb hinting at F for the coda to come."

## What r002 changes / guarantees

- **Changes (per record, nine slots):** `scope.musical_phrase_label`; `annotation_target.{structure, key_moments, teaching_goals, style_tips, teaching_notes}`; `target_trace.session` turns 1 (user), 4 (analysis), 6 (summary).
- **Untouched and asserted byte-identical:** ids, windows, `observation` (sidecar/REMI/ABC/SVG), `provenance`, `eval_metadata`, `scope` minus the label, trace objective, tool calls and tool-result turns. `splits.json` and `pianoroll/` are not touched at all.
- **Gates in the script:** sealed-package sha before/after · executed MIDI ground-truth verifier (all §Ground-truth facts) · input records byte-pinned (sha256 per file; drift = hard stop) · strict record schema + trace validator · teaching-note anchors inside window (builder-guard parity) · dead-phrase sweep (every killed falsehood must be absent from the revised JSON) · builder↔records consistency (corrected strings must exist verbatim in SONG_SPECS at apply time) · `--tier` is mandatory (the scope decision is never defaulted) · idempotent re-run.
- **Receipt:** `datasets/jam-actions-v0/revisions/r002-bach-annotation-prose/receipt.json` with before/after sha256 per file, the derived ground-truth values, and the tier applied.
- **Compensator:** `git restore` of the touched record files (before-shas in the receipt identify the exact prior bytes); the builder edit reverts with the same commit. Owner: advisor session.

## Downstream impact (named, not part of r002 itself)

1. **finetune-arc-v1 P1 corpus is stale on two axes.** `experiments/finetune-arc-v1/data/sft-train-v1.jsonl` (494 examples) contains 174 Bach-derived paraphrase examples — 84 over the tier-A windows — and **10 examples still targeting the retired `…m061-064` id whose frozen `play_song(61,64)` the live server rejects** (the single G6a failure, disposition A1-v1; r001 fixed the record but the JSONL predates it). Recommendation: after r002 lands, regenerate the jam-paraphrase component from the corrected working set and re-run the P1v1 gate before any P2v1 pod is created, recording the data-regen as a P0-LOCK-v1 amendment. Synthesis + gate are local and free; the leakage rule is unaffected (annotation prose is not the MCQ generator's input — MCQs derive from `timed_events`).
2. **Sealed eval artifacts stay pinned.** The slice21 baseline and finetune-arc evals read `observation`/MCQs, not annotation prose; v0.4.3 receipts remain valid. No re-run required, none performed.
3. **Next public package cut** (v0.5.0 per erratum-001) inherits r001+r002 from the working set; RELEASE_NOTES must cite both errata. Operator-gated, unchanged.
4. **Residual, filed not fixed:** the library config's machine-derived `musicalLanguage.description` opens "This transcription of the Prelude …" and calls all 1,284 notes "continuously broken chords" — its numbers are honest (62 measures; the m35 near-silence and section boundaries at 24/32/45/56 corroborate this erratum) but the framing under-describes mm. 36–62; regenerating it is a library-pipeline task, not a dataset revision. The registry `composition_title` ("Prelude in C Major, BWV 846 (Well-Tempered Clavier)") is likewise kept — renaming would ripple through every record, ABC title, and server id for zero training-value gain; the corrected prose names the fugue explicitly instead.

## Verification (2026-07-11, this session)

Pre-approval:

| Check | Result |
|---|---|
| Ground-truth verifier vs source MIDI (spans, entries, 17 subject statements, pedals, densities, colors, final chord) | PASS — executed in every run |
| Red test: falsified expectation (m53 onsets 40→41) | PASS — exit 1 at the verifier, restored, green again |
| Red test: missing `--tier` | PASS — exit 1, refuses to choose scope |
| Dry-run `--tier=A` (8 records) and `--tier=AB` (16 records) | PASS — all records validate (strict schema + trace validator), dead phrases absent, untouched-section asserts hold, 0 writes |
| `pnpm typecheck:scripts` (includes the r002 script) | PASS |

Post-approval (tier AB applied):

| Check | Result |
|---|---|
| Apply run `--tier=AB` | 16/16 records rewritten; builder-consistency gate PASS; after-shas byte-identical to the dry-run predictions; receipt written |
| Sealed package sha `72ce6e69…` | asserted pre-flight and post-write — unchanged |
| Idempotent re-run | PASS — "Already applied — verified applied state for all 16 records", exit 0 |
| Whole-corpus validator (`scripts/validate-jam-actions-corpus.ts`) | PASS — 145 records, 72 pairs, 0 orphans, pair-lock PASS, E1 gold pass rate 1.0 |
| Corpus builder dry-run over the corrected SONG_SPECS | PASS — 145 records validate under the strict schema + trace validator + r001's window guard |
| Corpus-wide dead-phrase sweep over `records/` | CLEAN — no killed falsehood remains anywhere in the working set |
| Dataset test suites (`vitest run src/dataset`) | 21 files, 848 tests — all pass |
| `pnpm typecheck` (src + scripts, includes builder edits) | PASS |

## Standards compliance (this revision)

PIN_PER_STEP 3 (sealed tree + MIDI + all 16 inputs sha-pinned; receipt emits before/after) · ANDON_AUTHORITY 3 (executed ground-truth verifier + byte pins + validators + dead-phrase sweep, all exit-1; red-tested) · NAMED_COMPENSATORS 2 (no irreversible action; git restore per receipt shas, owner: advisor) · DECOMPOSE_BY_SECRETS 2 (dataset working set only; builder edit separate and gated) · UNCERTAINTY_GATED_HUMANS 3 (mandatory `--tier` director gate + dry-run review path; public cut stays operator-gated) · EXTERNAL_VERIFIER 2 (claims verified against the MIDI by deterministic derivation; repo validators, not this script's own logic).
