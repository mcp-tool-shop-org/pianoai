# Handoff 08 — Grok Build to Claude: per-child tap factories

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Arc:** live multi-instrument environment.
**Chunk 8.** Branch `feat/live-environment` @ `f42c19b`. Work uncommitted. Tests written, unrun. I did **not** run the suite.

---

## 1. What I built

**B1.** `children()` now returns names plus, when that child offers one, a tap factory bound from `engines[i]`:

```ts
entry.createTapOutput = () => e.createTapOutput!();
```

The child's own `ensureConnected` still runs. A child with no factory omits the field — no fabricate, no throw.

Type split, as approved:

- `LayeredChildName` = `{ id, label }` — `options.children` only
- `LayeredChild` extends it with `createTapOutput?` — `children()` return only

A factory smuggled through options is stripped. The live child's factory wins.

The layered connector still has **no** `createTapOutput`. Fan-out, connect order, and the unwind are untouched.

**B2.** `InstrumentSpec.createTapOutput?`. `rosterFor` passes each child's factory through, and the solo branch passes the connector's own when it has one. After this the wiring asks "does this entry offer a tap?", not "is this a solo?".

**B3.** Tests in `roster.test.ts`. No `AudioContext`.

---

## 2. Distinctness, both directions

Load-bearing: two tappable mocks → two roster entries.

| | |
|---|---|
| different children | different bus objects |
| same child, twice | the **same** bus (lazy singleton) |

If they collided across children, both instruments would report the same audio and the per-child story would be a lie that looks like it works. If one child produced two objects, that would be the wrong contract — each engine has one bus.

Also: mixed tappable/untappable omits the factory on the silent child and does not throw. A plain tappable connector still yields exactly one entry, factory attached. Layered still has no mix tap.

A fourth test asserts the type split: a factory on `options.children` is ignored; the child's bus is what you get.

---

## 3. CLI duets — no silent half

The three configurations `cli.ts` actually layers:

| combo | child A | child B | both have `createTapOutput` |
|---|---|---|---|
| `piano+synth` | piano | synth | yes |
| `guitar+synth` | guitar | synth | yes |
| `vocal+synth` | vocal | synth | yes |

Tract and sample are not in any CLI layer. Every engine a duet can name can produce a bus. You can delete `roster.length === 1` without a silent half.

---

## 4. Tests written, unrun — and what I did not do

1. Two tappable children: distinct buses across, same bus twice on one child.
2. Untappable child omits the factory; the other still returns its bus.
3. Plain tappable connector: exactly one entry, factory is the connector's.
4. Smuggled options factory is ignored.
5. Existing: every `ENGINE_IDS` label, layered metadata, listPorts fallback, mismatch throw, layered has no `createTapOutput`.

**Did not:** run the suite (juncture is yours). Install. Touch MCP wiring. Expose child connectors. Give the layered connector a mix tap. Change fan-out / connect / unwind. Commit or push.

**Dataset / LoRA lift (heads-up, nothing to do now).** This chunk does not touch `experiments/acoustic-sft` or any corpus schema. `InstrumentSpec.createTapOutput` is a live function, not a record field — do not serialise roster entries into a dataset; the contract you listed (constructible ground truth, measured labels, leak-unit split, baselines + base model, thresholds in the record) lives on the corpus side. Nothing here makes that lift harder. The one thing not to do is treat the factory as provenance.

---

## 5. Working tree, and what you pick up

Uncommitted on `feat/live-environment` (HEAD `f42c19b`):

```
 M src/audio/ensemble.ts
 M src/audio/roster.ts
 M src/audio/roster.test.ts
 M src/layered-engine.ts
 M src/types.ts
?? docs/handoffs/live-environment-08-grok-to-claude.md
```

**Your chunk:** delete `roster.length === 1`. Loop the roster: if `entry.createTapOutput` exists, `attachTap` that bus. Solo and layered become the same loop. Snapshot off the audio thread, still. J4 after that wiring.
