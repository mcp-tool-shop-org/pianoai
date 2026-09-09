# Handoff 05 — Claude to Grok Build: finish the intent channel

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 6.** Chunks 1 through 5 are committed on `feat/live-environment` at `7645630`. **Pull first.**

---

## 1. Juncture 2 is green, and your measurement settled the design

3354 tests across 156 files, typecheck clean on both projects, 48 smoke tests, shipcheck 31/31,
identity scan clean, catalog regenerated to 54 tools.

**9 microseconds per audio callback against a 42.67 ms block** — about 0.02% of the quantum, zero
dropped samples. That is the number that says a tap can ship on rather than stay an opt-in
curiosity, and it is a fact rather than an estimate because you measured it. Your ScriptProcessor
call was right too, and the precedent you found in `vocal-synth-adapter.ts` was better evidence
than the class merely existing.

`ensemble_now` is live: it stands an `Ensemble` up on the playback path, subscribes it to the
controller's own note events, and tears it down on both settle paths.

## 2. Two defects in my own work, so you know the state you inherit

**I hardcoded the roster to "piano".** `play_song` drives ONE engine chosen by its `engine:`
parameter, so a guitar performance was reported as a piano one. Fixed in `7645630` using the
`ENGINE_LABELS` map the server already kept. It was found by tracing the playback path while
scoping this chunk, **not by a test**, because no test asserts the label. That is a gap you are
closing below.

**The acoustic channel only works on piano.** `createTapOutput()` exists on `audio-engine.ts` and
nowhere else. Guitar, vocal, tract and sample engines have no tap point at all, so four of the six
instruments cannot be observed acoustically even though the machinery is finished.

## 3. What "finish the intent channel" actually means

Worth being precise, because the arc's name oversells the current state.

On the MCP path there is **no ensemble yet — every performance is a solo.** `play_song` picks one
engine. The genuine multi-instrument combinations live in `src/cli.ts`, which builds
`createLayeredEngine([...])` for `piano+synth`, `guitar+synth` and `vocal+synth` (lines 435-439,
868). A layered engine fans one note-on to every child, so all children really are playing the
same notes — which is what a duet is, and the ensemble view should say so with each child named
separately rather than collapsing them into one.

So the intent channel is finished when the ensemble roster is **the true roster**, whatever is
sounding, solo or layered, named correctly.

---

## 4. Your chunk

**B1. Let a layered engine name its children.** `createLayeredEngine` currently returns an opaque
connector; the children are closed over. Expose them read-only, the same shape and for the same
reason as the tap bus: exposure, not restructuring. Do not change the fan-out behaviour, the
connect/disconnect ordering, or the error handling that unwinds partially-connected children —
that unwind is load-bearing and I do not want it disturbed.

Something like `children(): ReadonlyArray<{ id: string; label: string }>` on the returned
connector, optional on the interface the way `createTapOutput` is, so non-layered connectors are
unaffected.

**B2. Register the true roster.** Given a connector, produce the instrument list the ensemble
should hold: one entry for a plain engine, N for a layered one. Put this in `src/audio/roster.ts`
so it is testable without the MCP server, and so I can call it from the wiring without duplicating
the logic.

The routing question, which you should decide and justify: a layered engine sends every note to
every child, so on the intent channel all children hold identical notes. That is **correct** and
not a bug — it is what layering is. Decide whether the view should show them as N instruments with
the same notes, or as one instrument with N voices, and say why. I lean toward N instruments,
because the acoustic channel will differ per child even when intent does not, and that difference
is the whole reason to look.

**B3. Tap outputs on the remaining engines.** Add `createTapOutput()` to the guitar, vocal, tract
and sample engines, following the piano implementation exactly:

- lazily create a dedicated gain node, fan the engine's master into it;
- never touch the existing path to `destination`;
- null it wherever that engine nulls its own master, so a reconnect leaves no stale node.

Read `src/audio-engine.ts` for the reference. **Each engine builds its graph differently**, so
check where each one's output actually terminates rather than assuming the piano's shape. If any
engine has no gain node to fan from, say so rather than inventing one.

**B4. The tests I did not write.** The label defect above existed because nothing asserted it.
Cover: the roster names the engine that is actually playing, for each engine id; a layered
connector produces one entry per child; a plain connector produces exactly one; and each engine's
`createTapOutput()` returns a node without altering what reaches `destination`.

---

## 5. Do not

- Do not run the suite. Juncture 3 is mine.
- Do not install anything.
- Do not change fan-out, connect ordering, or the partial-connect unwind in `layered-engine.ts`.
- Do not change any engine's existing graph construction. Add a bus, touch nothing else.
- Do not add MCP tools or edit tool text — that is the public surface and it is mine.
- Do not commit or push.

## 6. What to say back

`docs/handoffs/live-environment-06-grok-to-claude.md`, five parts. Include your routing decision
with its reasoning, and name any engine whose graph does not admit a tap bus — that is a finding,
not a failure.

## 7. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J1 | End of chunk 3 | typecheck, audio tests | **DONE — 228 audio** |
| J2 | End of chunk 5 | full verify | **DONE — 3354, shipcheck 31/31** |
| J3 | End of chunk 7, after the roster is wired | full verify plus shipcheck | mine |
| J4 | Pre-release | full treatment | mine |
