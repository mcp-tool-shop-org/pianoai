# Claude Design prompt — the Composition Panel interface

**Purpose.** A paste-ready prompt (+ spec) for [Claude Design](https://claude.ai/design) to build the user-facing app for the `compose_panel` feature: a UI where users run cross-family local-LLM "best-worst" panels over how the AI Jam Sessions composition engine voices songs, with *different models and songs*, *ongoing over time* — and **never a quality claim**. It can ship as a new **Panel** mode inside the existing `apps/cockpit/` app (recommended — reuse its shell + brand) or as a standalone page.

Everything below the line is the prompt. It carries the real data contract, the cockpit brand tokens, and the honesty guardrails, so the design binds to reality and cannot overclaim.

---

## ▶ Paste this into Claude Design

> Design a **Composition Panel** interface for a music tool called *AI Jam Sessions*. It lets a user run a **cross-family local-LLM "best-worst" panel** that ranks four ways of voicing a song's chords — and it must be scrupulously honest that this is a **directional smoke-screen, NOT a measure of musical quality**. Match the dark "cockpit" brand (tokens below). Build two connected screens — a **Run Config** panel and a **Results** view — plus a persistent honesty callout and a run **History**. Bind every element to the JSON data contract below; show uncertainty (confidence intervals) and the "uninterpretable" state prominently. Do not invent a single "quality score" number anywhere.

Use the sections below as the detailed spec.

---

## 1. What the app is (and is NOT) — the honesty frame

The composition engine voices a song's fixed chords as four voices. This app runs a **panel of local LLM judges** (different model families) that read several voicings *blind* and pick the best + worst by voice-leading. It aggregates them into a ranking.

**The UI must make these true at all times:**
- It is a **directional filter**, not a quality verdict. Local models judging note-names cannot make a quality claim — that requires a **blind human-audio panel** (not built here).
- There is a **discrimination-floor gate**: if the judges can't even rank the theory-*valid* voicing above the theory-*invalid* one, the whole result is **UNINTERPRETABLE** and must be shown as such — not as a ranking to trust.
- **INCONCLUSIVE** is a normal, first-class outcome. So is a result where the engine ranks *last* — the app shows it plainly, never hides it.
- **Never render a "quality: N/100" style number.** Show ranking, best-worst scores in [−1, 1], and confidence intervals — with the standing caveat.

A persistent, unmissable callout (footer or banner) states: *"Directional cross-family LLM smoke-screen — not a quality measure. The only quality claim is a blind human-audio panel, which this is not."*

## 2. Brand tokens (match the cockpit)

Dark, piano-roll identity — navy ground, right-hand blue accent, left-hand coral for danger/negatives:

```css
--bg: #1a1a2e;  --surface: #22223c;  --surface2: #2a2a48;  --border: #3d3d5e;
--text: #dcdce6;  --text-muted: #9c9cbe;
--accent: #4a9eff;      /* RH-blue — primary, positive, "directional" */
--amber: #ffa657;       /* inconclusive / caution */
--danger: #ff6b8a;      /* LH-coral — uninterpretable / negative scores */
--good: #7ee787;        /* floor-gate PASSED */
--font: 'Segoe UI', system-ui, sans-serif;
--mono: 'Cascadia Code', 'Fira Code', monospace;
```
Rounded 4–8px corners, 1px `--border` hairlines, mono for all numbers/scores, uppercase micro-labels in `--text-muted`. Telemetry "tiles" (small bordered stat cards) are an established motif — reuse them.

## 3. Screen A — Run Config

A compact form (a left rail or a modal) with:
- **Songs** — multi-select from the library (chips; a search box; a "genre-diverse default set of 10" quick-pick). *(Data: an array of `{id, title, genre}` — assume it's fetched.)*
- **Style** — segmented control: `common-practice` · `lead-sheet` (default) · `film-ambient`.
- **Measures** — a small range input, default `1-8`.
- **Engine budget (n)** — a slider 1–32, default 6 ("higher = more coverage, slower").
- **Generator model** — text/select, default `qwen2.5:7b`.
- **Judge families** — a list of `model:family` rows (default four: `mistral-small:24b` · `granite4.1:30b` · `gemma4:31b` · `aya-expanse:32b`), each with a reachable/unreachable status dot; a note: *"≥3 disjoint families required; none may be the generator family."*
- A prominent **Run panel** button with a time hint ("runs several minutes, all local, $0").

**States:** while running, show a progress meter driven by *votes collected / votes possible* (not a spinner) — panels are slow. Show an **Ollama-down** error card (structured: "the engine model isn't reachable — start Ollama") and a **too-few-judges** error ("only 2 of 4 families responded; need ≥3").

## 4. Screen B — Results

Top to bottom:
1. **Verdict banner** — the single most important element. Color + icon by verdict type, parsed from the `verdict` string prefix:
   - `UNINTERPRETABLE` → `--danger` background, a "gate failed" icon, headline *"Judges below the discrimination floor — this says nothing about the engine."*
   - `INCONCLUSIVE` → `--amber`, headline *"Judges discriminate, but the engine's standing isn't clean."*
   - `DIRECTIONAL POSITIVE` → `--accent`, headline *"Panel leans toward the engine (directional, not quality)."*
   Always show the full `verdict` sentence beneath the headline.
2. **Discrimination-floor gate** — a big PASSED (`--good`) / FAILED (`--danger`) pill, with the one-line reason (valid vs floor scores).
3. **System ranking** — a horizontal bar chart, one bar per system, sorted by `bwsScore` (domain −1…+1, zero-line marked). Bars for negative scores use `--danger`; positive use `--accent`. **Overlay each bar's 95% CI** as a whisker. Label bars with the friendly system names:
   - `floor` → "Root-position floor (invalid anchor)"
   - `nearest` → "Nearest-tone baseline"
   - `refined` → "Refined (valid anchor)"
   - `engine` → "**Composition engine**" (emphasized)
4. **Per-system tiles** — a card per system: BWS score, Bradley-Terry strength, best/worst vote counts, appearances, CI. Mono numbers.
5. **Panel meta row** — inter-family agreement % (a small gauge), votes collected / possible, the judge families used (chips), the style + songs.
6. **Per-song drill-down** (expandable) — for each song, show the four voicings **exactly as the judges saw them**: a per-measure note-name table (`m1 C: C3 E3 G3 C4`), anonymized order optional. This is the transparency that keeps the tool honest — the user can see *why* a weak judge might mis-rank.
7. **Export** — copy the raw JSON payload; a "share result card" (a compact PNG/summary) that *includes the honesty caveat* so a shared result can't be mistaken for a quality claim.

## 5. Screen C — History (the "ongoing" part)

A list of past runs (timestamp, style, songs, n, judges, verdict pill, engine's rank). The point: as local models improve over time, the user re-runs and watches whether the panel's discrimination (and the engine's standing) changes. Allow selecting two runs to **compare side by side** (same songs/style, different models or dates). Store locally (this app has a `window.__cockpit`-style local API and localStorage persistence already).

## 6. The data contract (bind to this exactly)

**Input** (what "Run panel" submits — mirrors the `compose_panel` MCP tool):
```json
{ "songs": "let-it-be,all-of-me", "measures": "1-8", "style": "lead-sheet",
  "n": 6, "judges": "mistral-small:24b:mistral,granite4.1:30b:granite,gemma4:31b:gemma",
  "genModel": "qwen2.5:7b" }
```

**Output payload** (what Results renders — the real `ComposePanelPayload`):
```json
{
  "style": "lead-sheet",
  "interpretable": false,
  "verdict": "UNINTERPRETABLE — the judges are below the discrimination floor: the theory-VALID \"refined\" (0.07) does not clearly beat the theory-INVALID \"floor\" (0.30). A judge problem, not an engine finding.",
  "ranking": ["floor", "nearest", "refined", "engine"],
  "familyAgreement": 0.67,
  "scores": [
    { "id": "floor",   "bwsScore": 0.30,  "btStrength": 1.83, "best": 12, "worst": 3,  "appearances": 30, "ci": [0.07, 0.53] },
    { "id": "nearest", "bwsScore": 0.27,  "btStrength": 1.82, "best": 10, "worst": 2,  "appearances": 30, "ci": [0.03, 0.47] },
    { "id": "refined", "bwsScore": 0.07,  "btStrength": 1.13, "best": 7,  "worst": 5,  "appearances": 30, "ci": [-0.17, 0.27] },
    { "id": "engine",  "bwsScore": -0.63, "btStrength": 0.27, "best": 1,  "worst": 20, "appearances": 30, "ci": [-0.83, -0.43] }
  ],
  "votesCollected": 30, "votesPossible": 40,
  "songs": ["let-it-be", "all-of-me"],
  "judges": [ { "family": "mistral", "model": "mistral-small:24b" }, { "family": "granite", "model": "granite4.1:30b" }, { "family": "gemma", "model": "gemma4:31b" } ]
}
```
*(This example is a real UNINTERPRETABLE run — the judges ranked the invalid floor top and the engine last, so the gate correctly voids the ranking. Use it as the primary mock so the design nails the most important state first.)* Also mock a `DIRECTIONAL POSITIVE` run (engine top, gate passed, `interpretable: true`) and an `INCONCLUSIVE` run.

## 7. Interaction + accessibility notes

- The verdict banner and floor-gate pill are the visual priorities — a user skimming must grasp "can I trust this ranking?" in one glance.
- Negative BWS scores must read as negative (coral, left of the zero-line) — never abs-valued.
- Respect `prefers-reduced-motion`; keyboard-navigable; WCAG-AA contrast (the cockpit tunes for this).
- Loading is *progress*, not indeterminate — panels take minutes.

---

## Cockpit-integration handoff (for Claude Code)

If shipping inside `apps/cockpit/`: add a third top-bar mode alongside **Instr / Vocal** → **Panel**, which swaps the piano-roll region for the Results view and the right sidebar for Run Config. The panel calls the `compose_panel` capability (via the MCP server or a thin local endpoint wrapping `runComposePanelTool`); reuse the existing telemetry-tile, toast, and persistence modules. Keep the honesty callout in the shared footer so it's present in every mode. The whole feature is local + $0; no network beyond the local Ollama endpoint.
