# Executor Kickoff (Grok Build): Stage D — the visual audit of the cockpit

> **PASTE TARGET: the Grok Build executor session.** Authored 2026-08-20 by the Advisor.
> The health pass's fourth lens. Stages A/B (bugs + proactive) closed at 45 fixed / 2
> deferred; Stage C's humanization bar ran through wave 4 and every merge since. The
> feature pass just completed the Composition Panel (PRs #30–#33 all merged; main at
> `cbddbef`). Stage D audits the product's VISUAL surface — the cockpit as a thing a
> musician looks at for an hour — before Phase 9/10 take it to ship.
>
> **This wave is AUDIT-ONLY.** Findings first, on the W1/W3 pattern: you file a findings
> report, the Advisor verifies at source and in the rendered app, severities get
> calibrated, the Director rules on anything deferred, and the amend wave gets its own
> kickoff. No branch, no PR, no code changes in this wave.
>
> **Division of labor (you audit code, the Advisor audits pixels):** you read CSS/DOM/
> TypeScript and file what the code proves — token bypasses, missing focus styles,
> unreachable states, fixed dimensions that cannot flex, contrast pairs computable from
> hex values. Anything that needs a rendered screen to confirm (overlap at a given
> width, focus ring actually obscured, chart legibility) you still FILE, marked
> `"needs_live_confirmation": true` — the Advisor runs the live browser pass and
> confirms or refutes each one during review. Do not guess at pixels; file the code
> evidence and the question.
>
> **Severity calibration (the W3 rule held at ZERO HIGH — keep it):** MED is the
> default. HIGH only when the code proves a real user is blocked or misled — an
> interactive control with no visible focus, a WCAG 2.2 hard-fail on a primary control,
> text the token math makes unreadable. Cosmetic drift is LOW. Do not inflate.
>
> **Parallel lane, not yours:** the Comfy-Agent VISUAL brief (landing/handbook art for
> Phase 10) fires on the Advisor's side. Your audit may NOTE where art would land
> (empty states, the landing hero), but asset generation is out of your scope.
>
> **Standards compliance (0–3):** PIN_PER_STEP **2** (findings carry file:line + the
> exact hex/selector; the report is replayable evidence) · ANDON_AUTHORITY **2**
> (audit-only wave cannot break anything; the brief-gap halt stands) ·
> NAMED_COMPENSATORS **3** (nothing irreversible exists in an audit; the amend wave
> inherits branch+revert) · DECOMPOSE_BY_SECRETS **2** (findings grouped by the four
> lenses below) · UNCERTAINTY_GATED_HUMANS **3** (needs_live_confirmation routes
> pixel-truth to the Advisor's eyes; severity rulings and any taste calls go to the
> Director) · EXTERNAL_VERIFIER **3** (advisor source+live verification of every
> finding; non-Claude jury on the wave; the deterministic floor is law).

*Everything below the line is the paste block.*

---

# Stage D: audit the cockpit's visual surface — file what the code proves, flag what needs eyes.

## Who you are

**Grok Build, the Executor** — audit seat, same contract as waves 1 and 3: read
everything, change nothing, return a findings report as JSON. Work from `main` at
`cbddbef` or later.

## What you are auditing

`apps/cockpit/` — `index.html` (all styles live here as one `<style>` block) and
`src/*.ts` where it renders DOM (`main.ts`, `panel.ts`, `velocity-visual.ts`,
`ruler.ts`, `preview.ts`, the keyboard/roll builders). The cockpit is a dark-themed
music workstation: header mode bar, piano roll + ruler, floating transport, on-screen
keyboard, tuning audit strip, vocal mode, and the new Panel mode (By ear / Local
models, ranking chart, History, Compare).

## The four lenses (group your findings by these)

1. **Token discipline.** The app has a real token system (`--bg`, `--surface*`,
   `--border`, `--text*`, `--accent*`, `--danger*`, `--note-*`, `--key-*`, `--font`,
   `--mono`). Roughly two dozen hardcoded hex literals bypass it — several arrived
   with the Panel (`#4a9eff*`, `#ffa657*`) and duplicate what `--accent`/amber
   semantics should own. File each bypass with its selector and the token it should
   use; file missing tokens (an "amber/warn" role clearly wants one) as their own
   finding. A hex that IS the token's definition is not a finding.
2. **Keyboard-visible state (WCAG 2.2 lens).** Every interactive control needs a
   visible focus indicator that the sticky transport/header cannot fully obscure
   (SC 2.4.11), and hit targets ≥ 24×24 px (SC 2.5.8) — measure from the CSS
   (padding + font-size + min-height math), flag computed sizes under the bar.
   Panel sub-tabs, vote buttons, drill-down buttons, History rows, seed controls,
   chart region, roll notes, keyboard keys, transport icons — all of them.
3. **State legibility.** Loading/empty/failed states across the app: do they LOOK
   distinct (not just different sentences in the same grey), does the Panel's verdict
   tone system (ok/amber/danger) match the semantics everywhere it renders, is
   velocity conveyed by anything besides color (C7 — non-visual equivalent), does the
   ranking chart stay legible when scores collapse to near-zero widths, do long song
   titles / model names truncate or overflow the rail. File overflow risks from the
   CSS (fixed widths, missing min-width:0 in grids, missing text-overflow).
4. **Layout coherence.** The Panel was built fast beside an older roll UI: audit
   spacing/typography consistency between them (heading scales, paddings, border
   radii, button heights), the 280px rail at narrow windows, `#app` grid behavior
   when panel-mode hides the roll, and any dead CSS left from the mock or earlier
   waves.

## Fences (audit-wave law)

Read anything; change NOTHING — no commits, no branch, no PR. Do not run
formatters. Findings about README/docs/site/handbook visuals go in a separate
`advisor_surface` list (those files are the Advisor's; your findings there are
leads, not work items). Frozen musical baselines are irrelevant to this wave but
remain frozen.

## Output

`E:\AI\testing-os\swarms\swarm-1787126957-4c3c\stage-d\report.json`:

```json
{
  "domain": "frontend",
  "summary": "...",
  "findings": [
    {
      "id": "VIS-001",
      "severity": "HIGH|MED|LOW",
      "lens": "tokens|keyboard|state|layout",
      "file": "apps/cockpit/index.html",
      "line": 0,
      "evidence": "the selector / hex / computed size that proves it",
      "description": "what a user experiences",
      "fix_direction": "one sentence, no code",
      "needs_live_confirmation": false
    }
  ],
  "advisor_surface": [ { "file": "...", "note": "..." } ],
  "skipped": [ "what you did not audit and why" ]
}
```

Honest `skipped[]` beats padded findings. Family-of-call-sites rule from wave 1
applies: one finding per CLASS with every occurrence listed in evidence, not one
finding per hex literal. Close with what surprised you. Andon: any lens this brief
doesn't cover that you think matters → flag it as a question, don't self-extend the
scope.
