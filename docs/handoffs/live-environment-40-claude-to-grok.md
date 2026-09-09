# Handoff 40 — Claude to Grok Build: eleven songs, and the allowlist reads the evidence

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 40.** Branch `main` @ `40e4c01`. **Your chunk 38 is in the tree, uncommitted, and stays
that way; it is superseded by this.** So is a second session's work you will find beside yours —
read `docs/findings/library-provenance-audit.md` first, then this file.

---

## 1. What the library audit found

A separate session audited all 120 library files from their download URLs, the sites' terms, and
the MIDI text/copyright events, and wrote an evidence-backed `provenance` block into every song's
JSON. It corrected my audit of 2026-09-09: four of the seven songs I called Krueger are not —
`chopin-nocturne-op9-no2`, `pathetique-mvt2` and `schumann-traumerei` came from midiworld.com and
`chopin-prelude-e-minor` from bitmidi, and none carries a Krueger copyright event. The bootstrap
had stamped "Bernd Krueger, Source: piano-midi.de" into every classical config's `source` field,
and my audit read that field for six of the seven instead of the file. I read the file for one.

Twelve library files were the wrong song, not two; they are quarantined under `songs/quarantine/`
and skipped by the bootstrap. Across the 120: 5 CC-BY-SA-3.0-DE, 10 Public Domain, 3
no-redistribution, 11 reserved, 91 unknown.

The publishable set for this arc is therefore **11 songs**:

| licence | songs |
|---|---|
| CC-BY-SA-3.0-DE (Krueger, copyright event in the file) | bach-prelude-c-major-bwv846, fur-elise, mozart-k545-mvt1 |
| Public Domain (Mutopia, piece page) | the-entertainer, maple-leaf-rag, the-easy-winners, elite-syncopations, solace, pineapple-rag, peacherine-rag, bethena |

## 2. This chunk

**A1. The allowlist is derived, not typed.** Replace the hand-written table in `allowlist.ts` with
a filter over the library's `provenance` blocks: a song is publishable iff
`provenance.arrangement_license` ∈ {`CC-BY-SA-3.0-DE`, `Public-Domain`} and
`provenance.title_verdict` is not a contradiction, and it is not in `FORBIDDEN_IDS`. The
`provenance` fields on each record are copied from that block (creator, licence, source URL, terms
URL, verifier, verified date) — the same fields your chunk 38 filled, now from the evidence the
other session wrote instead of a table you typed. A test asserts the derived set is exactly the 11
above, by id, so a future library change that adds or removes a song is a visible diff, not a
silent one.

**A2. Rebuild on 11.** `datasets/jam-actions-v1/` and the probe, split by song, same targets, same
gates. State the held-out song count and every floor you restate, with the number; do not loosen a
gate to keep a family. If compare is train-only again, say so.

**A3. Tool-less per family** on the new split.

**A4. Regenerate the public sets** with `generate-public.ts` once the corpus is rebuilt; the
banner guard will halt, which is correct — report that it did.

**A5. Nothing else moves.** The other session's files (`songs/**`, `src/songs/**`,
`scripts/provenance-audit.ts`, `scripts/download-library.ts`, `src/songs/config/schema.ts`,
`docs/findings/library-provenance-audit.md`) are theirs; do not edit them. If A1 needs a field
they did not write, say which and stop.

## 3. Tests

- The derived allowlist equals the 11 ids; every allowlisted song's block has a licence in the
  closed set and a non-contradicting title verdict.
- V3 from chunk 38 stays and runs on the 11 files.
- Rebuild-equals-committed for the corpus, the probe, and — once the banner lifts — both public sets.
- Everything from chunks 24–34.

## 4. Do not

- Do not write card, README or release prose. Do not push anywhere. No pod. Director's word only.
- Do not run the full suite; the juncture is mine, on the combined tree.

## 5. What to say back

`docs/handoffs/live-environment-41-grok-to-claude.md`: the derived allowlist by id with each
song's licence and verifier; the corpus counts per family and split, with restated floors; tool-less
per family; the V3 output on the 11 files; the banner guard's halt line.

## 6. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J20 | chunk 38 | typecheck; library-audit tests; provenance tally | **DONE — chunk 38 superseded before commit; nothing pushed** |
| J21 | end of this chunk | full verify on the combined tree, identity scan, then two commits: the library audit, then the dataset | mine |
| — | retrain 3B and 7B on the 11-song corpus, then publish | Director's word | — |
