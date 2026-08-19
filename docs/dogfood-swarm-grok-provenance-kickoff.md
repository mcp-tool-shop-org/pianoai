# Executor Kickoff (Grok Build): Replace the Satie/Debussy bytes from a verifiable upstream

> **PASTE TARGET: the Grok Build executor session.** Authored 2026-08-19 by the Advisor after
> the Director's ruling on `F-acd97421` (Wave-1 deferred finding): **Option 1 — replace the
> bytes from a verifiable upstream.** Run `swarm-1787126957-4c3c`; this is a Director-ruled
> remediation errand, not a numbered health wave — same contract shape as Wave 2 (branch +
> PR, advisor diff review, jury, Director-delegated merge handling per his word at PR time).
>
> **Standards compliance (0–3):** PIN_PER_STEP **2** (sources pinned by URL + license mark +
> sha256 receipts; per-slice commits) · ANDON_AUTHORITY **3** (license-first halt rule: no
> byte enters the tree without its license receipt; missing/unclear license = STOP, named
> fallback list, never a silent substitute) · NAMED_COMPENSATORS **2** (branch
> `swarm/provenance-satie-debussy`; compensators: `git revert` per commit, close PR, delete
> branch; nothing irreversible delegated) · DECOMPOSE_BY_SECRETS **2** (bytes/receipts ·
> analysis/annotation · fixture-truth updates are separate commits) · UNCERTAINTY_GATED_HUMANS
> **3** (this whole errand exists BECAUSE a deferred finding got a Director ruling; ambiguous
> license or quality judgment goes back to him, not forward) · EXTERNAL_VERIFIER **3** (xAI
> executes → Claude advisor reviews diff cross-family → non-Claude jury → deterministic floor).

*Everything below the line is the paste block.*

---

# Replace two teaching-library songs' MIDI with verifiable-provenance bytes, regenerate their analysis + annotations, and update the fixture pins. Branch + PR.

## Why (the ruling)

`songs/library/classical/satie-gymnopedie-no1.{json,mid}` and
`debussy-arabesque-no1.{json,mid}` are `status: ready` on public main stamped
`"Bernd Krueger, Source: piano-midi.de (CC BY-SA)"`. The project's own receipted verification
(`datasets/jam-actions-v0-public/ATTRIBUTION.md` + `provenance-verification.json`, Slice 2.5)
found piano-midi.de carries no Satie at all and no Arabesque under Debussy — re-corroborated
by the Advisor 2026-08-19. The stamp is unverifiable-at-best. The Director ruled: replace the
bytes from a source whose license we can show, and make every claim in the two song entries
true of the new bytes. The compositions are public domain; it is the *arrangement* bytes and
the *attribution* that must become clean.

**Settled question (2026-08-19, so nobody re-opens it):** a Comfy-Cloud consult, independently
calibrated by the Advisor against the live catalog's type system, established the platform is
**waveform end-to-end — no MIDI in, no MIDI out, no score representation, and ACE-Step cannot
be score-driven**. There is no generative/transcription alternative to sourcing typeset
public-domain scores; the path below is the whole path, and all symbolic work stays in this
repo's own TypeScript pipeline.

## Sources (license-first — the decisive axis)

1. **Primary: the Mutopia Project** — typeset editions with an explicit per-piece license
   mark and downloadable MIDI + LilyPond source.
   - Gymnopédie No. 1: https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=37 —
     the Advisor confirmed the piece page exists and is marked **Public Domain**. Re-verify
     the license line on the page yourself before taking bytes.
   - Première Arabesque (Debussy): in Mutopia's catalog per the piece list
     (https://www.ibiblio.org/mutopia/piece-list.html) — find the piece page, **read its
     license mark**. Mutopia pieces are individually licensed (PD / CC); take it only if the
     mark is Public Domain or CC0. A CC-BY/CC-BY-SA mark is acceptable ONLY with the exact
     attribution line recorded in `source` — say which in your report.
2. **Fallbacks (only if a Mutopia piece is missing or its license unclear):** IMSLP's MIDI
   section, kunstderfuge — same rule: an explicit license/PD statement on the hosting page,
   captured verbatim in the receipt, or STOP and flag. **Never** a general MIDI aggregator
   with no license statement (8notes, classicalmidi, etc. are display sites, not licensors).
3. **Halt rule:** if neither work has a source with a showable license, stop — partial
   delivery (one song swapped, one flagged) is a good outcome.

## The receipt (per song, non-negotiable)

Record in the PR body AND in each song JSON's `source` field (one line, same shape the
library already uses): source project + piece URL + typesetter/arranger credit + the exact
license mark. Additionally list in the PR body: the downloaded file name(s), sha256 of the
`.mid` you ingested, and the license line quoted verbatim from the page. The Advisor
re-fetches the piece pages during review — the receipt must survive that.

## The work (commit per slice)

1. **Bytes + receipts.** Download the two MIDIs from the verified sources. If Mutopia offers
   multiple MIDI renderings (e.g., per-movement or performance variants), take the plain
   typeset rendering. Check track/hand structure: the library format needs right-hand /
   left-hand separation (look at how existing library songs' `.mid` map hands; Mutopia piano
   MIDIs are typically one track per staff). If hands are not cleanly separable, STOP and
   flag rather than guessing a split.
2. **Rebuild the two library entries** through the repo's own path: find and follow the
   existing library-build tooling (`scripts/` — the same route that produced the current
   entries; do not hand-write note JSON). Keep the SAME song ids and titles (`satie-gymnopedie-no1`,
   `debussy-arabesque-no1`) — journal entries, the E-R exclusion list (`er-gate.ts`
   `TRAINING_SONG_IDS` — frozen, do not touch, it excludes by id and keeps working), and the
   dataset deny-list all key on the id. New `source` line per the receipt rule. Genre stays
   `classical`; key/tempo/timeSignature/measure fields must be TRUE OF THE NEW BYTES (the
   deterministic analysis tells you).
3. **Regenerate analysis + annotations with the product's own pipeline** — this is the
   dogfood: deterministic per-song analysis first, then `annotate_song` (the shipped prompt
   workflow) for `musicalLanguage`, scored by `score_annotation` to at least the library's
   current grade bar, then the fact-check discipline the README describes: every measure
   number, chord window, and structural count your annotation claims must be verified against
   the new MIDI before `status: ready`. The old annotations describe the old bytes — nothing
   survives by copy.
4. **Fixture-truth updates.** These tests use the two songs as fixtures and pin facts of the
   OLD bytes: `src/smoke.ts` (5 Gymnopédie sites), `src/session.test.ts` (multiple),
   `src/teaching.test.ts`, and any others a repo-wide grep for the two ids surfaces. Update
   ONLY factual pins (measure counts, note counts, tempo, duration) to the new bytes'
   measured values — behavior assertions stay untouched. **In the PR body, list every changed
   assertion as `file:line — old fact → new fact`** so the Advisor can review them as fixture
   maintenance and not gate-weakening. If any test asserts something the new bytes make
   MEANINGLESS (not just different), flag it instead of rewriting the test's intent.
5. **Green gates.** `pnpm verify` end to end (typecheck, full suite, build, smoke — smoke
   plays the new Gymnopédie). Nothing may lower the passing count except assertions you
   documented in slice 4; new annotation content may raise it.

## Fences (hard)

- Do NOT touch: `datasets/**` (the internal records referencing the OLD bytes are frozen
  history; the deny-list stays), `src/maker/er-gate.ts`, `src/songs/jam.ts`,
  `src/songs/implied-chord-snapshot.ts`, any README/docs/site surface (the Advisor updates
  ATTRIBUTION/PROVENANCE-NOTE addenda and any public prose after merge).
- No publish, no version bump, no tags. Branch `swarm/provenance-satie-debussy`, PR to main.
- Named sources are not substitutable (the Wave-2 rule): a different source than the ones
  above needs a stop-and-flag, not a silent swap.

## Output contract

Alongside the PR: one JSON to
`E:\AI\testing-os\swarms\swarm-1787126957-4c3c\provenance\report.json` —
`{ "domain": "dataset", "summary", "fixes": [{ "finding_id": "F-acd97421", "file", "description" }], "files_changed": [], "skipped": [] }`
— plus your usual close: what you swapped, the receipts, what surprised you, the PR link.
Andon as always: any platform/license fact this brief doesn't cover → stop and flag; the
Advisor answers with a receipt.
