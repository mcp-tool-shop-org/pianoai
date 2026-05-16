# jam-actions-v0 — First Slice Report

**Date:** 2026-05-16
**Status:** **BLOCKED at Step 0. No record produced. No dataset code written.**
**Reason:** Synthesis prototype tool calls do not match the real MCP surface — see [`jam-actions-v0-schema-mismatch.md`](./jam-actions-v0-schema-mismatch.md) for 14 enumerated mismatches across the 3 prototype tools (`view_piano_roll`, `annotate_song`, `play_song`).

This is a hard contradiction between the locked synthesis and the repo, which
the kickoff explicitly tells Sonnet to **stop and report on, not redesign
around**.

---

## Which song would have been chosen, and why

I would have picked **`fur-elise`** for the first record. The reasoning, in
case the user wants to keep this choice after the schema decision:

- The synthesis prototype uses Für Elise as its illustrative record, so
  re-using it lets us validate the synthesis-vs-real delta on the same piece.
- `songs/library/classical/fur-elise.json` has `status: "ready"` (server log
  confirms it's in the 24-ready-songs set) and a fully populated
  `musicalLanguage` block (description, structure, keyMoments, teachingGoals,
  styleTips) — i.e., the source-of-truth annotation already exists, so the
  dataset record does not have to invent musical commentary.
- The composition is unambiguously PD: Beethoven died 1827, comp. 1810. US PD
  and EU PD both apply.
- The arrangement is attributed (`"source": "Bernd Krueger, Source: piano-midi.de (CC BY-SA)"`) so the redistributable-license requirement of the synthesis
  Section 5 verdict rules is satisfied. Verdict rule engine should score this
  `public`, **not** `internal` — see schema-mismatch report "Bonus mismatch"
  for why the synthesis prototype's `internal` reasoning is wrong against the
  actual repo data.
- The piece has clear measure-1-to-8 phrase boundary (A theme entrance with
  the E–D# oscillation) — clean phrase-slicer test case.
- A piano roll SVG for the exact m. 1–8 window already exists at
  `docs/fur-elise-m1-8.svg`, so the piano-roll observation step has a reference
  output to round-trip against.

If the user wants to use a different ready song for the first record, the
song library has 23 other ready entries (12 of 41 ready in the classical genre
based on the directory listing — sample includes `bach-prelude-c-major-bwv846`,
`chopin-nocturne-op9-no2`, `clair-de-lune`, `satie-gymnopedie-no1`,
`schumann-traumerei`, etc., all PD compositions).

---

## Which validators would have run, and what each checks

The first slice would have wired three validators in sequence. None of them
ran because Step 0 blocked. For reference:

1. **Schema validator** — Zod schema for the record JSON shape (matching the
   synthesis Section 7 prototype). Checks: required fields present, types
   correct, enum values valid, no extra unknown properties.
2. **Provenance gate** — rule engine implementing the synthesis Section 5
   verdict rules. Checks: PD status of composition, license of arrangement,
   evidence URL resolves, arrangement creator named (not "unknown"), verdict
   is `public` / `internal` / `excluded` per rules. Scraped-alone never
   reaches `public`.
3. **Tool-call schema validator** — for each entry in `target_trace.tool_calls`,
   look up the tool in `src/dataset/tool-schemas.json` and validate the
   `arguments` object against the tool's `inputSchema` (JSON Schema Draft-07).
   This is the validator that would have caught the 14 mismatches if a record
   had been built from the synthesis prototype verbatim.

---

## Record excerpt — what was *not* produced

No record was produced. If the user picks Option A from the schema-mismatch
report, the target_trace `session` for the chosen song would look approximately
like the following (this is a sketch, NOT a built record — the actual record
will only exist after the user resolves Step 0):

```jsonc
{
  "id": "fur-elise:m001-008:piano:mcp-session:v1",
  "schema_version": "jam-actions-v0/1.0.0",

  "provenance": {
    "source_url": "https://piano-midi.de/beeth.htm",  // canonical Krueger archive
    "source_collected_at": "2026-05-16",
    "source_type": "licensed",                        // CC BY-SA, not "scraped"
    "composition_title": "Bagatelle No. 25 in A minor (Für Elise)",
    "composer": "Ludwig van Beethoven",
    "composition_year": 1810,
    "composition_pd_status_us": "public_domain",
    "composition_pd_status_eu": "public_domain",
    "arrangement_creator": "Bernd Krueger",
    "arrangement_license": "CC-BY-SA-4.0",            // verify exact version
    "arrangement_evidence_url": "https://piano-midi.de/beeth.htm",
    "record_verdict": "public",                       // not "internal" per real metadata
    "verdict_reason": "Composition PD US+EU; arrangement under CC BY-SA with named creator and resolvable evidence URL.",
    "verifier": "auto-rule-engine",
    "verified_at": "2026-05-16",
    "training_use_permitted": true
  },

  "scope": { /* … song_id, phrase_window, instrument, key, tempo_bpm, time_signature … */ },
  "observation": { /* … midi_sidecar, tokens_remi, tokens_abc, piano_roll_svg_path … */ },
  "annotation": { /* … sourced from existing fur-elise.json musicalLanguage … */ },

  "target_trace": {
    "task_family": "annotate-and-perform-phrase",
    "objective": "Read mm. 1–8 of Für Elise, view the piano roll, comment on the opening figure, then loop the phrase quietly.",
    "session": [
      // turns 1–6: same shape as synthesis prototype but with REAL tool calls
      // (only view_piano_roll {songId, startMeasure, endMeasure, color_mode}
      // and play_song {id, mode:"loop", startMeasure, endMeasure, keyboard}
      // — no annotate_song write; per-phrase commentary lives in
      // role:"assistant" content fields, not in a tool call)
    ]
  },

  "eval_metadata": { /* … */ }
}
```

The two key shape changes from the synthesis prototype:

- All tool calls use the real argument names and shapes (`songId` not `song_id`
  on view_piano_roll, `id` not `song_id` on play_song, separate
  `startMeasure`/`endMeasure` not `measure_range`, no `hand` / `dynamic` /
  `articulation`).
- `annotate_song` is removed from the trace because it is a whole-song write
  tool, not a phrase-commentary tool. Per-phrase commentary is preserved as
  natural-language `content` in the assistant turns.

---

## Mismatches found

See [`jam-actions-v0-schema-mismatch.md`](./jam-actions-v0-schema-mismatch.md).
Summary: 14 mismatches across 3 tools; all 3 tool calls in the synthesis
prototype would be rejected by the real MCP server. Plus 1 bonus mismatch on
the provenance verdict reasoning for fur-elise (the file in the repo has named
arrangement creator + CC BY-SA license — so the synthesis prototype's
`internal` verdict is wrong against the real data).

---

## Open questions for the user

1. **Which target_trace shape do you want?** Option A (deflate to real
   surface), Option B (real-surface + `desired_future_capability` log), or
   Option C (extend the MCP surface)? Default recommendation per kickoff scope
   is **Option A**, with a separate doc capturing the "future capability"
   wishlist if you want to track it. Option C is out-of-scope per the
   kickoff's forbidden zones.

2. **Should `annotate_song` appear in any target_trace at all?** It is a
   real tool, but it is a **state-mutating write** that promotes raw → ready.
   Including it in a dataset trace teaches the model to mutate the song
   library, which may not be what you want for a fine-tuned reasoning
   consumer. Three sub-options:
     - (i) Exclude `annotate_song` from all dataset traces (treat it as
       out-of-band tooling, not in-session behavior).
     - (ii) Include it only in records explicitly tagged `task_family:
       "annotate-raw-song"`.
     - (iii) Include it freely in any trace.

3. **Is per-phrase annotation a real product need?** If yes, this should
   surface as either (a) Option C scope (extend `annotate_song` with
   `measure_range`), or (b) a new MCP tool like `add_measure_note`. If no, the
   model's natural-language commentary in `content` is the annotation, and no
   tool call is needed at that point in the trace. The kickoff puts this
   decision out-of-scope for this session; flagging it here so it doesn't get
   lost.

4. **fur-elise verdict — confirm `public` or override to `internal`?** The
   real metadata (Bernd Krueger / piano-midi.de / CC BY-SA) satisfies the
   synthesis Section 5 `public` rules. But the synthesis prototype hand-coded
   `internal` for fur-elise. The verdict rule engine should be the
   tiebreaker, not the prototype. Default: trust the rules → `public`.

5. **Are there other songs whose `source` strings encode a different license
   than CC BY-SA?** I noticed `source` is a free-text field in
   `fur-elise.json`. Parsing it into structured `arrangement_license` (SPDX
   identifier) plus `arrangement_evidence_url` is what the provenance gate
   needs. If most songs follow the "Krueger / piano-midi.de / CC BY-SA"
   pattern, the parser is trivial. If sources are heterogeneous, the
   provenance step needs more thought before any pilot subset is built.
   I did not audit the other 23 ready songs' `source` strings — happy to do
   that as a focused follow-up if you want.

6. **`scripts/extract-mcp-tool-schemas.ts` — is the script the right
   long-term shape?** It's small (~50 lines) and spawns the built MCP server
   over stdio to call `tools/list`. Pros: genuinely derived, stays in sync as
   tools change. Cons: requires `dist/` to be fresh, which means it needs to
   be wired into the build pipeline or a pre-extract `pnpm build` step. Easy
   to add if you want it as part of the dataset spine; flagging so you can
   decide.

---

## Artifacts produced

- `scripts/extract-mcp-tool-schemas.ts` — extraction script (uses MCP SDK stdio client). Re-runnable via `npx tsx scripts/extract-mcp-tool-schemas.ts`.
- `src/dataset/tool-schemas.json` — 41 canonical tool schemas, derived from `dist/mcp-server.js`.
- `docs/jam-actions-v0-schema-mismatch.md` — 14 mismatches, three remediation options.
- `docs/jam-actions-v0-first-slice-report.md` — this file.

No git commits. No record built. No dataset code beyond `tool-schemas.json` (which is the Step-0 artifact, not "dataset code"). No translations. No public release.

---

## What this Sonnet session will do next — nothing, until the user resolves Step 0

Per the kickoff: *"Do NOT proceed to dataset code."* Once you pick Option A /
B / C and answer the open questions, a fresh Sonnet session can resume from
the locked target_trace shape and produce the first record.
