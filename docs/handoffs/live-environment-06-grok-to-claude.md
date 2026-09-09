# Handoff 06 — Grok Build to Claude: true roster + six tap buses

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Arc:** live multi-instrument environment.
**Chunk 6.** Branch `feat/live-environment` @ `8fa0746`. Work uncommitted. Tests written, unrun. I did **not** run the suite.

---

## 1. What I built

**B1.** `children(): ReadonlyArray<{ id, label }>` on the layered connector. Optional on `VmpkConnector`, same shape as `createTapOutput`. `options.children` of matching length, or `{ id: "child-N", label: engines[N].listPorts()[0] }` so today's CLI calls still yield N entries. Fan-out, connect order, and the partial-connect unwind are byte-identical. The engines array is not restructured.

The layered connector has **no** `createTapOutput`. Tapping the mix would collapse N instruments into one signal and throw away the isolation this arc is built on. You tap children. That reason is in the `layered-engine.ts` header.

**B2.** `src/audio/roster.ts`:

```ts
soloInstrument(engineId: EngineId): { id, label }   // ENGINE_LABELS, never invented
rosterFor(connector, solo: { id, label }): InstrumentSpec[]
```

Layered → one entry per child. Plain → exactly `[solo]`. The caller still supplies the solo identity because `VmpkConnector` has no id — that is the correct fix for the hardcoded-piano defect, not a workaround.

**B3.** `createTapOutput()` on guitar, vocal, tract, sample, **and synth**. Shared helper `createTapBus(ctx, master)` — the piano inline is now that call. Synth fans from `gainNode` (the master in all but name). Null sites match each engine's existing master/gainNode nulls. I did not invent connect-fail nulling on engines that lack it.

**B4.** Tests below. No live `AudioContext`. No context injection added to guitar/vocal/tract.

Barrel exports from `src/audio/index.ts`. No MCP, no CLI, no tool text.

---

## 2. Routing decision

**N instruments, not one instrument with N voices.**

A layered engine sends every note to every child. On the intent channel those children hold identical notes. That is correct — it is what a duet is. They are still N rows because the acoustic channel will differ per child, and that difference is the reason to look. One instrument with N voices would report "the piano is silent" when it was the synth that went quiet. `Ensemble.view().chord` already dedupes pitches, so the combined chord does not double.

---

## 3. Six engines, six buses — and one finding I did not fix

Every named engine had a gain node that already hits destination. None required inventing a master.

| engine | fan from | null tapBus |
|---|---|---|
| piano (already) | `master` | connect-fail + disconnect |
| guitar | `master` (after body filters) | connect-fail + disconnect |
| vocal | `master` | disconnect only |
| tract | `master` | disconnect only |
| sample | `master` | disconnect only |
| synth | `gainNode` | disconnect only (`gainNode = null` at 272) |

**Finding, not a fix.** Vocal, tract, sample, and synth do not null their master on connect-fail (guitar and piano do). If `connect()` throws after allocating nodes, those nodes can leak until GC. It is pre-existing and harmless for the tap: `createTapOutput()` throws unless status is `connected`, so a stale node cannot be fanned into. I did not add connect-fail nulling in this chunk.

`ENGINE_IDS` still has no `synth`. Synth is not a `play_song` solo; it only appears as a layered child. `soloInstrument` cannot name it. `rosterFor` names it when the layered connector carries children metadata (`id: "synth"`). The CLI combos still use the listPorts fallback (`child-0` / `child-1`) until you pass metadata at the call sites — I did not touch `cli.ts`.

---

## 4. Tests written, unrun — and what I did not do

**`roster.test.ts`**
1. Every `ENGINE_IDS` entry keeps `ENGINE_LABELS[id]`; guitar/vocal/tract/sample are not piano.
2. Plain connector → exactly one entry, named by the caller, for every engine id.
3. Layered with metadata → piano + synth, and the solo argument is ignored.
4. Layered without metadata → `child-0` / `child-1` from `listPorts`.
5. Mismatched children metadata throws.
6. Layered exposes `children()` and has no `createTapOutput`.

**`tap-bus.test.ts`** — mock graph: `master → destination` survives; a second edge appears to the bus.

**`tap-output.test.ts`** — piano, guitar, vocal, tract, sample, synth: `createTapOutput()` throws `/not connected/` before `connect()`. No context created.

**Did not:** run the suite (J3 is yours). Install. Edit MCP or tool text. Change fan-out / connect order / unwind. Rewire any existing graph. Add context injection. Commit or push.

---

## 5. Working tree, and what you pick up

Uncommitted on `feat/live-environment` (HEAD `8fa0746`):

```
 M src/audio-engine.ts
 M src/audio/index.ts
 M src/audio/tap.ts
 M src/guitar-engine.ts
 M src/layered-engine.ts
 M src/sample-engine.ts
 M src/types.ts
 M src/vocal-engine.ts
 M src/vocal-synth-adapter.ts
 M src/vocal-tract-engine.ts
?? src/audio/roster.ts
?? src/audio/roster.test.ts
?? src/audio/tap-bus.ts
?? src/audio/tap-bus.test.ts
?? src/audio/tap-output.test.ts
?? docs/handoffs/live-environment-06-grok-to-claude.md
```

**Your chunk (wire the roster, J3):**

1. MCP `play_song` should call `rosterFor(connector, soloInstrument(engineId))` instead of `addInstrument({ id: engineId, ... })` once. Solos stay one row; a future layered MCP path becomes N rows without a second hardcoded name.
2. `subscribeEnsemble` still takes one `instrumentId`. For N children you will need N subscriptions (same events, different ids) — identical intent, separate acoustic. I did not change the bridge.
3. Hang `attachTap` on each child's `createTapOutput()`, snapshot off the audio thread, still.
4. If you grow `play_song` to accept the CLI combos, pass `options.children` at `createLayeredEngine` so ids are `piano`/`synth` rather than `child-0`/`child-1`.
5. J3: full verify plus shipcheck, after that wiring.
