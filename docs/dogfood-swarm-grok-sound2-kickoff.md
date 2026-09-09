# Executor Kickoff (Grok Build): Sound Slice 2 — the real piano, in ears

> **PASTE TARGET: the Grok Build executor session.** Authored 2026-08-19 by the Advisor.
> Director-directed sound lane, slice 2 of the feature pass. Slice 1 (PR #30) tamed the
> oscillator fallback and made `sample` a first-class server engine behind an installed
> pack. This slice ships the pack the cockpit can actually play — until it lands, every
> browser ear still hears oscillators.
>
> **Director decisions pre-flagged:** (1) the npm tarball stays sample-free by default —
> the pruned pack ships with the COCKPIT (GitHub Pages) only; putting samples in the npm
> package is a Director call this kickoff does NOT make. (2) The Pages weight budget for the
> pack is ≤ 10 MB; if a 3-layer prune cannot sound right inside that, stop and flag with
> numbers rather than shipping a mushy pack.
>
> **Standards compliance (0–3):** PIN_PER_STEP **3** (the pack is REGENERABLE: a tracked
> pruner script with pinned parameters + a manifest carrying source version, license, and
> per-file provenance) · ANDON_AUTHORITY **2** (license-first halt; budget halt above) ·
> NAMED_COMPENSATORS **2** (branch `feat/sound-sampled-cockpit`; revert/close/delete;
> nothing irreversible) · DECOMPOSE_BY_SECRETS **2** (pruner script / manifest / loader /
> wiring are separate commits) · UNCERTAINTY_GATED_HUMANS **3** (the acceptance test is the
> Director's ear, explicitly; two decisions pre-flagged to him) · EXTERNAL_VERIFIER **3**
> (advisor cross-family review + live browser pass + non-Claude jury; `pnpm verify` is law).

*Everything below the line is the paste block.*

---

# Sound slice 2: prune the Salamander pack, ship it with the cockpit, and make the sampled Concert Grand the browser's default piano.

## Who you are

**Grok Build, the Executor** — same contract as PR #30: branch
**`feat/sound-sampled-cockpit`** from current `main` (after #30 merges), commit per slice,
PR, `pnpm verify` green. The Advisor reviews (including every user-facing string), runs a
live browser pass, and juries the wave; the Director's ear is the acceptance test.

## Source and license (license-first, receipts like the Mutopia slice)

- **SalamanderGrandPiano by Alexander Holm — CC-BY-3.0.** The repo already points at the
  freepats packaging: https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html (the
  "Accurate Salamander" SFZ flat pack `src/sample-paths.ts` expects). Verify the license
  line ON the page, quote it in the PR body, record the exact archive name + sha256 of what
  you downloaded. If the page or license mark differs from CC-BY-3.0, **stop and flag**.
- **CC-BY means attribution is mandatory product surface:** the manifest carries it, and the
  Advisor will add the visible credit lines (cockpit About/footer + docs) on the branch —
  flag where you put the manifest so those can point at it. Do not draft the public prose.

## The work (commit per slice)

1. **Pruner script** — `scripts/prune-salamander.ts` (ci-tooling owns `scripts/**`): from an
   installed full pack (input dir = the `sample-paths.ts` resolution), emit the cockpit pack:
   **3 velocity layers, minor-third pitch spacing (every 3 semitones, ~30 root notes across
   88 keys), OGG** (target the whole pack ≤ 10 MB; pick the quality setting that fits and
   record it). Neighbor notes repitch from the nearest root at play time — do not emit all
   88. Deterministic: pinned layer choice, pinned encoder settings, stable file names
   (`<midi>-v<layer>.ogg`). Requires `ffmpeg` on PATH — probe first, fail with an install
   hint, never half-emit. Output: `apps/cockpit/public/samples/salamander/` + a
   **`manifest.json`** (source pack name + version + sha256, license line quoted, encoder
   settings, per-note file map with root MIDI + velocity split points).
2. **Cockpit sampler** — a small loader/player in `apps/cockpit/src/` (own module, no
   rewrite of synth.ts): fetch manifest → decodeAudioData per file (lazy or on first
   interaction, NOT blocking boot), velocity-layer select, repitch neighbors via
   `playbackRate` from the nearest root, per-note gain envelope on release. Route through
   the SAME output chain (compressor/gain) the synth uses so levels match.
3. **Default wiring + graceful degradation (the W4 status seam):** sampled Concert Grand
   becomes the cockpit's default piano voice; oscillators play instantly until samples are
   decoded, then new notes switch to samples (no gap, no double-trigger). While loading:
   "Loading Concert Grand samples…" via the existing `#score-status`; on fetch/decode
   failure: "Sampled piano unavailable — using the built-in synth" and the session keeps
   playing oscillators. Strings meet the humanization bar; the Advisor reviews them.
4. **Run the pruner and COMMIT the pack** (the ~30×3 OGGs + manifest). This is the one
   slice where binaries belong in the repo — the cockpit deploys from it. Keep it inside
   the budget; the manifest is the provenance receipt.
5. **Tests:** manifest schema + integrity (every referenced file exists, roots cover
   21–108 within 1.5 semitones, layers ordered); pruner unit-testable pieces (layer pick,
   root spacing, name mapping) without ffmpeg; loader logic (nearest-root selection,
   playbackRate math, velocity-layer choice) as pure functions with pins. `pnpm verify`
   green — cockpit typecheck/build included.

## Acceptance (in order)

1. `pnpm verify` green; PR checks green.
2. Advisor live pass: cockpit boots, status line shows the load, keys/roll play SAMPLED
   notes after load (verifiable: the sampler path exposes a state the page can report),
   fetch-failure path shows the fallback string, level roughly matches the synth (no jump).
3. **The Director reloads the cockpit and plays. His ear is the gate.** If it still isn't a
   piano, the next lever is the prune spec (more layers/roots), not another synth tweak.

## Fences (hard)

Frozen musical baselines untouched. No README*/CHANGELOG/docs/site/ROADMAP edits (the
Advisor writes the attribution + handbook lines on the branch). No npm `files` change — the
tarball stays sample-free pending the Director's word. No new workflow files. No publish,
no version bump, no tags, no pushes to `main`. Salamander bytes enter ONLY via the pruner
from the receipted download — no re-hosted mirrors, no other piano packs.

## Output

`E:\AI\testing-os\swarms\swarm-1787126957-4c3c\sound2\report.json` —
`{domain, summary, fixes:[{finding_id:"SOUND-2", file, description}], files_changed, skipped}` —
plus the usual close: receipts (download sha256, license quote, encoder settings, final pack
size), what surprised you, the PR link. Andon: any platform/license/budget fact this brief
doesn't cover → stop and flag.
