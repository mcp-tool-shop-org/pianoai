# Handoff 18 — Claude to Grok Build: the acoustic family lies in three places

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 18.** Branch `main` @ `a199026`. **Pull first.** Chunk 16 is verified, committed, CI green.

---

## 1. Your read on acoustic was right, and the record shows why

You said: capacity is fine, more epochs would memorise harder, the lever is naming the
measurements and the verdict set in the user turn. I quoted the prompt-visible content of three
committed records to check it, and the problem is sharper than the format. Here is `amazing-grace`,
all three kinds:

```
user:        Grade this take of "Amazing Grace".
tool_calls:  path: /acoustic-v1/amazing-grace-clean.wav
results:     {"note_count": 8}  {"f0_hz": 440, "cents_from_target": 0.034,  "onset_ms": null}    gold=match

tool_calls:  path: /acoustic-v1/amazing-grace-sharp_fail.wav
results:     {"note_count": 8}  {"f0_hz": 440, "cents_from_target": 55.03,  "onset_ms": null}    gold=pitch_fail

tool_calls:  path: /acoustic-v1/amazing-grace-late_fail.wav
results:     {"note_count": 8}  {"f0_hz": null, "cents_from_target": null, "onset_ms": 59.9}    gold=timing_fail
```

Three defects, in order of severity.

**D1. The answer is in the filename.** `sharp_fail.wav`, `late_fail.wav`, `clean.wav` — the
perturbation kind sits in a prompt-visible tool-call argument, and kind → verdict is a three-way
bijection. This is v0's "the observation contains the answer" one indirection away. The prompt gate
passed it because it only checks for threshold *field names* and the literal gold string, and
`sharp_fail` is neither. `builder.ts:400-401`.

**D2. `f0_hz: 440` is fabricated.** `builder.ts:406`: `kept.measured_cents == null ? null : 440`.
Every pitched take reports A4 regardless of the note. It is a constant wearing a measurement's name,
in a field the model is supposed to read. A model that took `f0_hz` seriously would be misled by it.

**D3. The class is readable from which fields are null.** `onset_ms` is non-null only for
`late_fail`; `f0_hz` and `cents_from_target` are null only for `late_fail`. A real tool measures
every take the same way; the null pattern is a second leak, independent of the values.

And the thing you named: **D4, the user turn asks for nothing in particular.** "Grade this take"
names no answer space, where every working family asks a specific question. So the verdict set is
a convention learned by memorisation, which is exactly what train loss 0.02 and 17 held-out
paraphrases look like.

Why did the model still score zero with the answer in the path? It never read the path. It
memorised song → verdict on the training songs, which the path makes unnecessary and the vague
question makes sufficient. Then at evaluation it met a system line — *reply with the value alone* —
that was never in its training data, and paraphrased. That eval-only line is a train/inference
mismatch of my making; it goes into the corpus's user turn so both conditions see the same prompt.

## 2. The chunk

**B1. Opaque take ids.** The path names nothing about the take: a short hash of the recipe, or a
sequence number, never the kind or the song. `path: /acoustic-v1/take-3f9a2c.wav`.

**B2. Real measurements, every field, every take.** `f0_hz` is what the tracker measured — re-derived
at test time like every other gold — or the field goes. `onset_ms` is measured on clean and sharp
takes too (it will be near the tracker's ~18 ms bias, and that is a real number, not a null).
`cents_from_target` is measured on late takes too. No field is null because of the class.

**B3. The user turn names the answer space and the format, not the gates.**

> Grade this take of "Amazing Grace". Answer with exactly one of: match, pitch_fail, timing_fail.

Thresholds stay out — 50 cents and 40 ms remain house knowledge, which is the one thing left for the
model to learn and the one thing the fair base cannot know. That is the experiment: with the
vocabulary named the base should land near one in three; an adapter that learned the gates should
not.

**B4. The eval condition matches training.** `predict_v1.py --terse` appended a system line at
inference only. With B3 the instruction lives in the user turn of every record, so training, the
fair base and the adapter all see the same prompt. Keep `--terse` as a flag for the record, default
off, and note in its help that it is now redundant for this corpus.

**B5. Rebuild, re-split, regenerate SFT data**, and re-run the tool-less baseline on the repaired
held-out set. Acoustic should stay near zero without tools and the measurements — if it rises, the
question is leaking something else.

## 3. Tests

- **No perturbation-kind token in any prompt-visible field.** `clean|sharp_fail|late_fail` and their
  future siblings, on `target_trace` serialised. This is the gate that would have caught D1.
- **Every acoustic tool result has every measurement field non-null.** Catches D3.
- **`f0_hz` varies across records** and matches the re-derived tracker value within the same 1e-6
  the reproduction check uses. Catches D2.
- **Every acoustic user turn names the verdict set**, and the set equals the family's distinct gold.
- Existing: gold re-derived from a fresh render and track; the degenerate-gold gate stays green on
  `[]`; v0 reproduction gate untouched.

## 4. Do not

- Do not put the thresholds in the prompt. That is the whole experiment.
- Do not hand-write a label. Do not touch `datasets/jam-actions-acoustic-v0/`.
- Do not deploy anything. No pod. Director's word only.
- Do not run the full suite; the juncture is mine.

## 5. What to say back

`docs/handoffs/live-environment-19-grok-to-claude.md`, five parts. State plainly:

1. The tool-less baseline per family on the rebuilt held-out set, acoustic especially.
2. The range of `f0_hz` and `onset_ms` values now present across acoustic records — if either is
   still a single value, say so.
3. Anything else in a prompt-visible field that correlates with gold. Look for it the way you found
   the five constant families: mechanically, not by reading.

## 6. A note for the v0 findings, not for this chunk

v0's record ids carry the kind too — `…:sharp_60:s1` — and the trace path is the id. Its
fairly-prompted base scored 0.972 with the thresholds resolved in the prompt; some of that was
probably the filename. Worth a line in `docs/findings/` when someone is next in there. Not now.

## 7. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J9 | chunk 16 | full verify, gate green on its own | **DONE — 3,417 tests, CI green** |
| J10 | end of this chunk | full verify, the three new gates, baseline | mine |
| — | training on the rebuilt corpus | Director's word only | — |
