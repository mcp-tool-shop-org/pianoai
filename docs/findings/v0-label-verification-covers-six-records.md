# jam-actions-acoustic-v0: rule 2 is verified on 6 records, not 108

**Found 2026-09-08, after the first training run. The corpus is published.**

## The claim

The experiment contract's rule 2 says labels are verified against what the tools actually measure,
not only against themselves, and `measured.test.ts` is named as the pattern that does it. The
dataset card says the same: "every label is checked against the instrument rather than only against
itself."

## What is actually checked

`src/dataset/acoustic/measured.test.ts` calls `buildRecord(fixturePhrase(), …)` **six times** — one
record per perturbation kind, one fixture phrase, one seed. The corpus is **108 records** across
three phrases and four seeds.

So the verification covers **5.6% of the corpus**, and every covered record comes from the same
phrase.

## What the uncovered records do

Running the test's own code path — the same `targetWindow`, the same `trackPitch`, the same
`scorePitchWindow` — across all 108:

| measurement | result |
|---|---|
| pitch-relevant records | 36 |
| tracker locks | 23 |
| **tracker returns `untrackable`** | **13** |
| error when it locks | max **0.191 cents** |
| error when it does not | up to **3,121 cents** |

All four Bach `sharp_30` records are among the failures. On one, +28.0 cents was applied and the
tracker reports **−3,080 cents**, status `untrackable`.

Their gold verdict is `pitch_warn`, derived from the applied perturbation. It is constructible and
almost certainly correct. But the tools cannot confirm it, which is precisely the property rule 2
exists to guarantee. **For those records the label agrees only with itself.**

## The clearance question this started from

The prompt for this investigation was whether `sharp_30`'s narrow gate clearance survives the
tracker's error. It does, comfortably — 3.0 cents of clearance against a locked error of at most
0.191 cents, a factor of fifteen.

**The clearance was never the problem.** When the tracker locks it is excellent. The problem is that
on 13 of 36 records it does not lock, and nothing in the corpus ever checked.

## Why it was missed, and it is the same defect as before

This arc already earned the lesson, in handoff 07, after a false chord disagreement shipped:

> A unit test built from a convenient fixture can validate the opposite of the real case.

That was written about a single sine wave standing in for a chord. This is the same shape: one
fixture phrase standing in for three, and a verification that reports "labels are checked against
the instrument" while checking one record per class.

## Not fixed here

v0 is published with checksums on Hugging Face and its bytes must not move. This is recorded rather
than repaired. The repair belongs in v1:

- verification runs over **every** record, not a fixture;
- a record whose measurement is `untrackable` is a **build failure**, not a silent pass — either the
  case is rebuilt so the tools can measure it, or it does not go in the corpus.

Until then the honest statement about v0 is: *the labels are constructible and the six checked ones
agree with the instrument; the other 102 are unverified, and 13 of the 36 pitch cases cannot be
verified by the tracker as it stands.*
