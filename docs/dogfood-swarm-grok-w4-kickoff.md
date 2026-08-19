# Dogfood Swarm — Wave 4 Executor Kickoff (Grok Build): Stage-B Amend, Humanization Bar

> **PASTE TARGET: the Grok Build executor session.** Authored 2026-08-19 by the Advisor after
> the Wave-3 close-out: collect 7/7 · advisor re-read 10/14 findings at source, 10/10 accurate,
> zero severity inflation (three waves running) · jury adjudication recorded on the wave ·
> all 14 findings approved — 11 are yours, 3 docs findings are advisor-executed on the same
> branch. Run `swarm-1787126957-4c3c`.
>
> **Standards compliance (0–3):** PIN_PER_STEP **2** (contract pinned per control-plane id;
> wave-4 snapshot frozen at dispatch — `scripts/**` now belongs to ci-tooling) ·
> ANDON_AUTHORITY **2** (stop-and-flag; collect gate) · NAMED_COMPENSATORS **2** (branch
> `swarm/w4-health-amend-b`; `git revert` per commit / close PR / delete branch; no publishes) ·
> DECOMPOSE_BY_SECRETS **2** (fixes filed by frozen glob-owner — the mapping is explicit
> below, ending the Wave-2 refiling artifact) · UNCERTAINTY_GATED_HUMANS **3** (every
> user-facing string gets the Advisor's personal review pass; URL retargeting is
> Director-word-fenced; merge is the Director's disposition at PR time) · EXTERNAL_VERIFIER
> **3** (xAI amends → Claude advisor reviews the diff → non-Claude jury → `pnpm verify` is law).

*Everything below the line is the paste block.*

---

# Wave 4: fix the 11 approved Stage-B findings. This is the humanization wave — the fixes are mostly *telling the user what happened*. Branch + PR.

## Who you are

**Grok Build, the Executor** — same seat, same contract shape as Wave 2. Branch
**`swarm/w4-health-amend-b`** from current `main`, commit per finding/cluster with the
control-plane id, PR to `main`, `pnpm verify` green before it opens. The Advisor reviews the
diff, adds the three docs commits to the same branch (public surfaces are lead-authored),
and runs the jury; the Director disposes the merge.

**The quality bar this wave (Stage-C humanization, per the play):** every new user-facing
string must say *what happened* and *what to do about it*, in plain words — "Could not save
this session — browser storage is full or blocked" beats "save failed". No raw error
objects, no jargon, no silent stderr where a tool result or status line exists. **The
Advisor personally reviews and may rewrite every user-facing string in the diff before
merge — write them well, and expect edits.**

## Filing rule (learned in Wave 2 — follow it exactly)

File each fix in the domain whose **frozen globs own the file**, regardless of which domain
audited it: `src/**` (including `src/**/*.test.ts` and `src/dataset/**`) → **backend** ·
`apps/**` → **frontend** · `scripts/**`, `.github/**` → **ci-tooling**. So: backend.json,
frontend.json, ci-tooling.json — three outputs, to
`E:\AI\testing-os\swarms\swarm-1787126957-4c3c\wave-4\<domain>.json`, amend envelope
(`domain`, `summary`, `fixes[{finding_id, file, description}]`, `files_changed[]`,
`skipped[]`). Use the control-plane ids below.

## The 11 fixes

### backend.json (files under src/**)

1. **F-aff2d3b7** `src/piano-voices.ts:508` — corrupt-tuning fallback becomes visible:
   surface a structured warning in the results of `get_keyboard_config`, `get_guitar_config`,
   and the `tune_*` tools when the user file was discarded ("Saved tuning for <id> could not
   be read — showing factory defaults. Re-save to repair."). Keep the factory fallback and
   the stderr line. **Family:** `src/guitar-voices.ts` has the same catch-and-empty pattern —
   same treatment. Test: corrupt file → tool result carries the warning; clean file → no
   warning.
2. **F-cb7b28af** `src/playback/controls.test.ts:474,485` — replace both
   `setTimeout(r, 10)` wall-clock waits with the fake-timer / injectable-clock pattern
   `engine.test.ts` already uses for pause/stop. No behavioral assertion changes.
3. **F-07e76dcd** `src/dataset/provenance-url-verifier.ts:88` — **comment-only fix**: head
   `COMPOSER_PAGES` with a block stating it is jam-actions-v0 Slice-2.5 verification
   HISTORY for the frozen dataset records, not live teaching-library provenance (the library's
   truth is each song JSON's `source` field), and that the two re-sourced ids intentionally
   still point at piano-midi.de here. **Do not retarget any URL. Do not touch
   EXCLUDED_SONG_IDS.**

### frontend.json (files under apps/**)

4. **F-4ac54ea0** `apps/cockpit/src/main.ts:361` (`safeSaveRaw`) — on save failure set the
   existing `#score-status` surface to an error state and keep the in-memory score; never
   throw. String bar applies. Extract the decision/reporting branch so it is unit-testable
   (pairs with fix 8).
5. **F-9c275158** `apps/cockpit/src/main.ts:679` (`ensureAudioUnlocked`) — after `resume()`
   fulfills, re-check `ctx.state`; if not `running`, surface it ("Audio is blocked by the
   browser — allow sound for this site, then press Play"), via `reportAudioError` or
   `ctx.onstatechange`. **Family (named in the finding):** the transport `resumeContexts`
   (~531) and the `play()` belt-and-suspenders block (~2992) share the catch-only pattern.
   No browser harness in CI: unit-test the seams you can reach and record the manual
   dev-server check (Chrome minimum) in the fix note.
6. **F-f61250eb** `apps/cockpit/src/main.ts:2902` (`bindMidi`) — one non-blocking status
   line when the API is missing or the permission is denied ("Web MIDI is not available or
   was blocked — the on-screen and QWERTY keyboards still work."). MIDI stays optional.
7. **F-4a4fb612** `apps/cockpit/src/velocity-visual.ts` — give the focused note a non-visual
   velocity channel: `aria-valuenow`/`aria-valuetext` on the note box or speak it through
   the existing live region. Do not rebuild the roll; the inspector stays the editing surface.
8. **F-a623a05e** `apps/cockpit/src/pure-logic.test.ts:35` — the missing pin for fix 4: a
   fake storage whose `setItem` throws `QuotaExceededError`, asserting the status string is
   set and nothing throws out of `saveStateNow`. (Do this against fix 4's extracted branch.)

### ci-tooling.json (files under scripts/** and .github/**)

9. **F-31c617e4** `scripts/download-library.ts:623` — the provenance-regression guard:
   **stop overwriting an existing library JSON** — mirror the MIDI skip (if `configDest`
   exists, skip the config write and log SKIP). Add the header sentence: this is a
   **bootstrap** tool for an empty library, not a refresher of receipted entries. Prefer
   extracting the skip decision into a small exported helper with a unit test (no network,
   no writes in the test). **Do not retarget the piano-midi.de URLs or edit the in-script
   Satie/Debussy configs — Director-word-fenced.**
10. **F-19d64b12** `scripts/import-classical.ts` — header comment: legacy importer, writes
    `songs/builtin/` (not the live library), URLs are historical; do not run against
    `songs/library`. No retargeting, no deletion.
11. **F-2983136c** `.github/workflows/ci.yml` — `timeout-minutes: 20` on `jobs.ci`, and
    matching sane values on the sibling jobs in the same file (`pnpm10-install`, `dep-audit`,
    `plugin-validate`, `cockpit`) — none should inherit the 360-minute default.

## Advisor-owned on this branch (not yours — listed so nothing looks dropped)

**F-e9a84a72** (handbook troubleshooting page) · **F-447fe24c** (SECURITY.md 2.x + honest
network posture) · **F-a9b143ef** (cockpit autosave caveat). The Advisor commits these after
your push, then closes the wave.

## Fences (hard)

Frozen musical baselines untouched (`src/songs/jam.ts`, `src/songs/implied-chord-snapshot.ts`,
`src/maker/er-gate.ts`). The Mutopia entries and their receipts untouched. No README*/
translations/CHANGELOG/docs/site/ROADMAP edits. No URL retargeting anywhere. No publish,
no version bump, no tags, no pushes to `main`.

## Verification & andon

Confirm the 2930/1 baseline before editing; stop and flag on any platform fact this brief
doesn't cover; test-first per code fix with the test id in your `fixes[]` description;
`pnpm verify` green end to end before the PR. Close with the usual summary: fixes landed,
tests before → after, what surprised you, the PR link.
