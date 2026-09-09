# Executor Kickoff (Grok Build): Stage-D Amend — make the look systematic without changing it

> **PASTE TARGET: the Grok Build executor session.** Authored 2026-08-20 by the Advisor.
> The Stage-D visual audit returned 18 findings, 0 HIGH; the Advisor verified every
> evidence claim at source, ran the pixel pass on the nine flagged items, and calibrated
> the ledger: **17 approved (9 MED / 8 LOW), 1 closed** (VIS-015 — vowel-glyph contrast
> measured 5.28–5.88:1, passing; and VIS-004's contrast half also measured passing at
> 4.60/5.07, so that finding is LOW, tokenization only). Jury on the audit wave:
> see the adjudications ledger. This wave EXECUTES the 17.
>
> **The overriding principle: LOOK-PRESERVING BY DEFAULT.** The Director's taste owns
> this product's look. Two classes of change, never blurred:
> 1. **Tokenize-in-place — zero visual delta.** New tokens are DEFINED as today's exact
>    hex; bypassing rules then point at them. The Advisor will diff computed styles
>    before/after on sampled selectors — any drift in class 1 is a defect.
> 2. **Enumerated visible changes** — each named below, each with its own acceptance.
>    Nothing else about the app's appearance moves.
>
> **Director decisions pre-flagged:** (1) VIS-012 makes "ok" mean ONE color — the
> verdict card's ok moves from accent-blue to the new --good green so it matches the
> floor-gate pill; his eye can veto at the live gate. (2) VIS-018 aligns the Panel kit
> to the ROLL's values (radius 4px, .ctrl-btn padding/heading scale) — the established
> look is canon, the newcomer conforms. (3) VIS-017's attribution placement inside the
> visible chrome is the executor's proposal, Advisor-reviewed, and must be readable on
> a desktop-height window without scrolling.
>
> **Live-measured annotations you build against (Advisor, 2026-08-20):** the CC-BY
> footer's top edge sits at 1734px in a 998px unscrollable viewport (VIS-017); the
> transport overlaps the roll by 37 vertical px at 1100×620 and by zero at 998px tall
> (VIS-008 is height-dependent); the Panel grid stays `280px 1fr` at every width
> (VIS-016); key-label contrast PASSES AA (4.60/5.07) so VIS-004 changes no colors.
>
> **Standards compliance (0–3):** PIN_PER_STEP **2** (fixes keyed by VIS-id; token
> values pinned equal to legacy hex; before/after computed-style samples in the
> receipts) · ANDON_AUTHORITY **2** (any fix that cannot be done look-preserving in
> class 1 → stop and flag, don't improvise a restyle) · NAMED_COMPENSATORS **2**
> (branch `swarm/stage-d-visual-amend`; merge-commit revert-per-finding; nothing
> irreversible) · DECOMPOSE_BY_SECRETS **2** (commits grouped by lens: tokens /
> keyboard / state / layout) · UNCERTAINTY_GATED_HUMANS **3** (two taste calls
> pre-flagged to the Director; the final gate is his eyes on the cockpit) ·
> EXTERNAL_VERIFIER **3** (advisor computed-style diff + geometry re-measure + jury;
> `pnpm verify` is law).

*Everything below the line is the paste block.*

---

# Stage-D amend: execute the 17-finding visual ledger — tokenize in place, fix the confirmed usability items, change nothing else about the look.

## Who you are

**Grok Build, the Executor** — branch **`swarm/stage-d-visual-amend`** from `main` at
`3c16f8a` or later, commit per lens, PR, `pnpm verify` green. Fix ids from
`stage-d/report.json`; the Advisor's calibration above overrides where they differ.

## Class 1 — tokenize in place (ZERO visual change; commit "tokens")

- **VIS-001**: add `--warn` / `--good` (+ `-dim`/`-border` variants) to `:root`,
  DEFINED as today's exact values (#ffa657 family, #7ee787 family). Point
  `.panel-verdict.amber`, `.panel-pill.amber/.ok`, `.ir-impure/.ir-pure`,
  `.score-status.ok` at them.
- **VIS-002**: delete `body.panel-mode`'s `--accent*` re-bake; `:root` flows through.
- **VIS-003**: `.tt-cents-pos/.tt-cents-neg/.ir-wolf` point at the note tokens they
  duplicate (or dedicated aliases equal to them).
- **VIS-004 (LOW, tokenization only)**: key borders/labels (#aaa/#000/#666/#4d4d4d)
  become tokens with today's values; main.ts stops setting #8c8c8c inline (a token
  does it). Contrast measured PASSING — change NO color values.
- **VIS-005**: PC_COLORS/VOWEL_COLORS drive the roll via CSS variables (12 pitch-class
  + 5 vowel tokens, values identical); the JS reads or injects the vars — mechanism
  yours, values pinned.
- **VIS-006**: tooltip/overlay chrome onto surface/text tokens at today's rendered
  values; box-shadows may stay rgba.

## Class 2 — enumerated visible changes (one commit per lens)

- **VIS-007 (keyboard)**: `min-height: 24px` (and min-width where the control is
  near-square) on the small-control class — `.ctrl-btn`, `.mode-btn`, vowel chips,
  `.insp-vowel-btn`, `.tt-ref-btn`, `.root-btn`, header selects/inputs,
  `#panel-seed-value`, `#insp-del` — the same bar record/select/multi-delete already
  carry. Type sizes unchanged.
- **VIS-008 (keyboard)**: keep the roll's inset focus ring visible at short heights —
  a clearance band (e.g. roll-container bottom padding ≥ the transport's occupied
  height when overlapping) so the ring is never covered. Do not restyle the transport.
- **VIS-009 (keyboard)**: mirror `[data-tip]` on `:focus-visible`, or drop the tip
  where an aria-label already says the same thing — per control, your call, listed in
  the report.
- **VIS-010 (keyboard, close-as-designed)**: painted keys stay pointer-only (QWERTY is
  the named keyboard path) — record the decision as a code comment + report note; no
  code change required.
- **VIS-011 (state)**: Panel loading / empty / failed states get visually distinct
  chrome using the SAME ok/amber/danger roles the verdicts use — a musician can tell
  them apart without reading. New strings meet the humanization bar (the Advisor
  reviews every one).
- **VIS-012 (state)**: `.panel-verdict.ok` moves to `--good` so "ok" is one color with
  the floor-gate pill (pre-flagged to the Director).
- **VIS-013 (state)**: `rankingChartModel` gets a readable minimum bar width in
  pixels (px, not %) with the numeric/CI text kept as the non-visual channel — update
  its unit tests with the new floor.
- **VIS-014 (state)**: truncation rules — `min-width: 0` on the grid children plus
  `overflow: hidden; text-overflow: ellipsis` (or deliberate wrap) on `.panel-chip`,
  History rows, `.panel-song`, and the chart name column. `title` attributes keep the
  full string reachable.
- **VIS-016 (layout)**: a Panel breakpoint (~720px): the rail stacks above the
  audition column and panel-mode allows page scroll. The roll UI's existing 1000px
  behavior is untouched.
- **VIS-017 (layout, first in the amend order)**: the CC-BY Salamander credit becomes
  readable on a desktop-height window without scrolling — a compact line inside
  `#app`'s always-visible chrome (your placement proposal; the full footer may stay
  too). Acceptance is measured: credit visible at 998px AND 620px heights.
- **VIS-018 (layout)**: Panel chrome adopts the roll kit's tokens — radius 4px,
  `.ctrl-btn` padding scale, heading sizes — so the app reads as one kit.

## Fences (hard)

Frozen musical baselines untouched. No behavior changes outside these findings — the
audio path, panel logic, scoring, and persistence are not in scope (VIS-013's constant
is the one code-value change). No README*/CHANGELOG/docs/site/ROADMAP edits. No npm
`files`/version change, no publish, no tags, no pushes to `main`, no new workflows. No
new colors anywhere — class 1 defines tokens AS today's hex; class 2's only new color
role is `--good`/`--warn` from VIS-001. Node-dependent tests live in `src/` (the
tsconfig trap). Every new user-facing string answers what-happened + what-to-do.

## Acceptance (in order)

1. `pnpm verify` green (chart-floor tests updated); PR checks green.
2. Advisor live pass, measured: computed-style equality on sampled class-1 selectors;
   credit visible at 998px and 620px heights; zero transport/ring overlap at 620px;
   the Panel stacked below the breakpoint; ≥24px computed on the small-control class;
   a long model name truncating with its full text reachable; the three Panel states
   distinguishable at a glance.
3. **The Director looks at the cockpit.** Same app, tidier — his eye rules on the two
   pre-flagged taste calls.

## Output

`E:\AI\testing-os\swarms\swarm-1787126957-4c3c\stage-d-amend\report.json` —
`{domain, summary, fixes:[{finding_id:"VIS-###", file, description}], files_changed, skipped}`
— skipped[] carries VIS-010's close-as-designed reasoning and anything you had to
andon. Receipts: the token map (name → hex, asserted equal to legacy), before/after
computed-style samples, the new chart floor, your attribution placement. Close with
what surprised you and the PR link. Andon: any fix that cannot be look-preserving in
class 1, or any layout fix that would move something this brief didn't name → stop
and flag.
