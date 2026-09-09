# Handoff — the vocal route's opening still breaks (2026-09-05)

**Paste target:** a fresh session in `E:\AI\ai-jam-sessions`, branch `feat/vocal-breath-context`
(last vocal-route commit on this branch; nothing pushed). Director: Mike. His live word overrides
this file. Read `docs/vocal-clock.md` (the run log) and `docs/vocal-singing-study-2026-09.md`
(the research grounding) first; the handbook page `site/src/content/docs/handbook/vocals.md` is
the user-facing route. Do not merge PR 38, do not publish, do not touch the landing page's honest
section except to replace the audio when the fix is real.

## State (verified from receipts, 2026-09-05)

The vocal route is **solidified** (Director: "Local is better. You have my go." → "That's
beautiful!"): score clock → SoulX-Singer (local, Apache-2.0, score-conditioned) → bag of takes
→ per-syllable pick → crossfaded local placement → timing gate → pitch gate → local mix.
Shipped run `scores/receipts/amazing-grace/soulx-syllables/`: timing PASS worst **6.05 ms**,
order PASS, one voice, lengths exact (1,680,000 samples), pitch PASS 14/14, global **−2.7 c**.
It is on the landing page as "Vocals, as they stand today" with the defect named.

**The defect (Director, three listens):** *"still breaking in the beginning."* Timing and pitch
gates cannot see it — it is a **splice artifact** at the opening, most likely the "A" → "ma"
join (~2.0–3.3 s), where in the syllable run "A" comes from `syl-12` and "ma" from `syl-16`
(different takes: different breath, different timbre micro-state, a 50 ms crossfade between
two unrelated waveforms at different pitches Bb3 → Eb4).

## What was measured, so it is not re-derived

- A sung word is legato inside: on a whole-word take, "A"→"ma" is a **portamento** (Bb3→Eb4
  over 180 ms, no amplitude dip). Re-pinning "ma" 152 ms early cut through it → the first break.
- Fades alone (15 ms) did not fix it; 50 ms crossfades with the earlier clip running under the
  next removed clicks and gaps but the opening still reads as a break.
- `--syllable-words` (every syllable its own re-articulated word) makes cuts legitimate but
  gives the picker syllables from **different takes**; the join is then between two singers'
  micro-states. `dip_db` (onset clarity) and least-shift are the picker's criteria; take identity
  is not.
- Feeding measured timing errors back into the next target does **not** converge: the
  singer's placement is stochastic (± ~150 ms per syllable), not biased (9 takes measured).
- Whole-word picking over 9 takes never got "Amazing" internally within 35 ms (best 50 ms).

## Hypotheses, in the order to test them (each is one cheap experiment; renders cost ~5 s)

1. **Same-take continuity for the opening phrase.** Make the picker prefer, for adjacent
   syllables, the *same take* when its internal error is within the gate (a "run" bonus:
   score = (internal, −clarity, take-change penalty, shift)). Or pick "A ma zing" as one
   whole-word group from the whole-word takes while the rest stays syllable-level (mixed
   candidate pools: `repin` needs a per-group candidate list). Cheapest first: render 12 more
   whole-word takes (`target.json`, ~1 min) and see whether any passes "Amazing" at ≤ 35 ms
   internal; if so, use it for the first word only.
2. **Objective join receipt.** Add a `joins` check to `verify`: at each placed join, spectral
   flux / RMS step / F0 step across the crossfade vs the same measures inside the clips;
   flag joins whose discontinuity exceeds the take's own natural note-to-note transitions.
   The Director's ear is the ground truth today; the instrument should catch the next one.
   (Look first at the artifact 1.9–3.4 s: envelope, pyin F0, and a spectrogram.)
3. **Pitch-synchronous crossfade.** Align the crossfade to a common glottal period (find the
   period from pyin, offset the incoming clip up to one period so the waveforms are in phase)
   before summing. Standard TD-PSOLA-style join; 20–40 lines in `place_local`.
4. **Cast the voice.** The prompt is SoulX's English example; a cast reference (a chosen female
   clip through SoulX's `preprocess` — its models are a separate `Soul-AILab/SoulX-Singer-Preprocess`
   download — or a hand-written prompt JSON) changes timbre and may change how the pickup
   is sung. Not the fix for the splice; do it after 1–3.
5. **The pickup itself.** "A" as its own word (`en_AH0`, 1.07 s on Bb3) is unnatural for a
   singer; the model may under-sing it. Try the pickup as `<SP>` + shorter "A" (0.53 s) with a
   rest before, or as a slurred first note of "Amazing" (whole-word) while the rest of the
   line stays syllable-level (hypothesis 1's mixed pool).

## Levers and commands (all exist)

```
pnpm exec tsx scripts/build-score-clock.mjs --list-tracks            # pick the tune track
pnpm exec tsx scripts/build-score-clock.mjs --lyrics "A-ma-zing grace how sweet the sound that saved a wretch like me"
pnpm exec tsx scripts/render-piano-bed.mjs
<venv> scripts/export_soulx_target.py --clock … --out target.json [--syllable-words] [--compensate receipt --gain g]
<venv> scripts/soulx_take.py --target … --prompt-wav … --prompt-meta … --out-dir …   # ~5 s GPU
python scripts/vocal_clock.py verify | repin --candidate take=receipt … [--split-words] | place --local | pitch | mix --local
<venv> scripts/sing_clock.py --clock … --bed … --prompt-wav … --prompt-meta … --takes 8 --out-dir …   # the whole chain
```
`<venv>` = `E:/AI/SoulX-Singer/.venv/Scripts/python`. Tests: `python -m pytest scripts/test_vocal_clock.py`
(12 in the venv, 10 + 2 skipped in system Python), `pnpm exec vitest run src/vocal/score-clock.test.ts`.

## Done when

The Director listens to the opening and does not hear a break; timing and pitch gates still PASS;
the join receipt (hypothesis 2) exists and passes; the landing page audio is replaced with the
new mix and the "what is still wrong" sentence is rewritten to whatever is then true.
Translations of the README happen at the next release, before the tag (standing rule).

## Standards compliance (this handoff)

| standard | score | evidence |
|---|---|---|
| PIN_PER_STEP | 2 | every step is a script with a receipt (sha256, args, model sha); takes are non-deterministic by the model's nature — pin by keeping the take files, not by seed |
| ANDON_AUTHORITY | 3 | the gates halt the chain (`sing_clock.py` exits at the first FAIL and names it) |
| NAMED_COMPENSATORS | 2 | no irreversible calls in this workflow (local renders, cloud transcribe only); rollback = delete `tmp/vocal-clock/**`; owner: the session |
| DECOMPOSE_BY_SECRETS | 3 | clock / bed / singer / measurement / placement / mix are separate scripts |
| UNCERTAINTY_GATED_HUMANS | 2 | the Director's ear gates what the instrument cannot yet measure (the join); hypothesis 2 moves that into the instrument |
| EXTERNAL_VERIFIER | 2 | gates are deterministic and independent of the singer; order/one-voice by a different model family (ElevenLabs scribe) |
