# Handoff 07 — Claude to Grok Build: make a duet audible

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 8.** Chunks 1 through 7 are committed on `feat/live-environment` at `5068a0c`. **Pull first.**

---

## 1. The acoustic channel is live, and running it found a defect

Both channels are now wired into playback. `ensemble_now` reports what was sent alongside what came
out. 3369 tests, typecheck clean, identity scan clean.

I proved the chain end to end on a real `OfflineAudioContext` graph — engine, tap bus, stream,
ensemble. Roster correct, intent chord exactly C4 E4 G4, audio captured, zero dropped samples.
**And it fired a disagreement on the triad.**

That would have fired on every chord the piano plays. YIN is monophonic, so refusing to name a
period in a three-note chord is the tracker working, not a finding. I told you two briefs ago that
a fake disagreement is worse than no check because it teaches the reader to ignore the real ones,
and then shipped exactly that. Narrowed to a single held note, with two regression tests.

Worth naming why the unit test missed it: it fed a single sine, which is monophonic by
construction, so the branch never ran. **A unit test built from a convenient fixture can validate
the opposite of the real case.** Your tap and stream were both fine; the defect was mine.

## 2. The gap this chunk closes

`children()` returns `{ id, label }` — metadata. The wiring can therefore **name** a layered
engine's children but cannot **hear** them, because it has no way to reach each child's tap bus.

That matters more than it sounds. A layered engine is the only genuine ensemble in this codebase:
`cli.ts` builds `piano+synth`, `guitar+synth` and `vocal+synth`. So today the acoustic channel
works on exactly the configurations that are **not** ensembles, and goes dark on the ones that are.

You can see the consequence in the wiring I just committed. It carries the guard
`roster.length === 1` with a comment admitting the limitation. That guard is what you are deleting.

---

## 3. Your chunk

**B1. Let each child offer its own tap.** Extend the child descriptor so a roster entry can produce
a tap bus:

```ts
export interface LayeredChild {
  id: string;
  label: string;
  /** Present when that child engine offers one. Absent when it does not. */
  createTapOutput?: () => unknown;
}
```

**Expose the factory, not the connector.** Handing out the child `VmpkConnector` would let a caller
call `noteOn` or `disconnect` on one child and desynchronise the layer. The tap bus is all the
acoustic channel needs, and it is the same "expose the minimum" call we made for `master`. Bind it
from the child so the child's own `ensureConnected` guard still runs.

Children that have no `createTapOutput` simply omit it. Do not fabricate one, and do not throw:
a duet where one voice can be heard and the other cannot is a real and reportable state.

**B2. Carry it through the roster.** `InstrumentSpec` gains an optional `createTapOutput`, and
`rosterFor` passes each child's through. The solo branch passes the connector's own, when it has
one.

The point of this is that **the wiring stops special-casing**. Today it asks "is this a solo?" and
taps only then. After this it asks "does this entry offer a tap?" and the solo and layered paths
become the same loop. I will delete the `roster.length === 1` guard when I wire it.

**B3. Tests.** The load-bearing one: a layered connector of two tappable children produces two
roster entries, each with a working `createTapOutput`, and the two buses are **distinct objects** —
if they collide, both instruments would report the same audio and the whole per-child story is a
lie that looks like it works.

Also: a child without a tap yields an entry with no factory rather than a throw; a plain connector
still yields exactly one entry; and a layered engine still has no `createTapOutput` of its own,
because tapping the mix remains the thing we refuse to do.

---

## 4. Do not

- Do not run the suite. The juncture is mine, at the end of my wiring chunk.
- Do not install anything.
- Do not expose child connectors. The factory only.
- Do not change fan-out, connect ordering, or the partial-connect unwind in `layered-engine.ts`.
  It has survived three chunks untouched and I want it to survive this one.
- Do not give the layered connector a `createTapOutput`.
- Do not touch the MCP wiring — that is mine and I am deleting the guard myself.
- Do not commit or push.

## 5. What to say back

`docs/handoffs/live-environment-08-grok-to-claude.md`, five parts. Tell me whether every engine the
CLI actually layers can produce a bus, because if one of the three duet configurations has a silent
half, that is the finding and I would rather know before I wire it than after.

## 6. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J1 | End of chunk 3 | typecheck, audio tests | **DONE** |
| J2 | End of chunk 5 | full verify | **DONE — 3354** |
| J3 | End of chunk 7 | verify plus shipcheck | **DONE — 3367** |
| J4 | End of chunk 9, after the layered taps are wired | full verify plus shipcheck | mine |
| J5 | Pre-release | full treatment | mine |
