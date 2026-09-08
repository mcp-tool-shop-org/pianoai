# F5's untrackable gate is real, and spacing is what fixed v0

Chunk 14 reported **81 F5 cases attempted, 0 dropped as untrackable**, against v0's 13 of 36 pitch
records the tracker could not measure. A zero is exactly the shape of a check that never fires, so
it was worth proving rather than accepting.

## The gate fires

`tryBuildF5` refuses a take whose pitch window comes back `untrackable`. Sweeping the note spacing
and rebuilding all 81:

| `NOTE_GAP` | dropped untrackable | dropped for clearance |
|---|---|---|
| **0.6 s** (shipped) | **0** | 0 |
| 0.15 s | 42 | 7 |
| 0.05 s | 41 | 37 |

So the zero is a property of the construction, not a dead branch. It also confirms the causal claim
in the handoff: v0's untrackable records were a dense 4-note construction, and 8 notes at 0.6 s
spacing is what makes YIN able to measure them.

## The onset guard band is sound for a different reason than stated

`V1_ONSET_CLEARANCE_MS = 38` was justified as **1.36x** the 28 ms abs-p95 onset error measured on
v0. At 1.36x, a p95 is thin.

Measured on the takes this construction keeps, the error is not spread out at all. All 27
`late_fail` records measure **59.9 ms** — min, median, p95 and max identical. The detector is
systematically about 18 ms early and nothing else.

So the real margin is 59.9 ms against a 40 ms gate: **19.9 ms clear of a constant, known bias**,
rather than 1.36 standard deviations of noise. Safer than claimed, but the justification borrowed a
distribution from a different construction. The governing number is now recorded beside the constant
as `MEASURED_F5_LATE_ONSET_MS`.

The pitch band needs no such note: 5 c against a locked YIN p95 of 0.179 c is **27.9x**.
