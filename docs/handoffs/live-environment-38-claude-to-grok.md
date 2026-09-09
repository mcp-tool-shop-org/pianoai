# Handoff 38 — Claude to Grok Build: the spec moved under you; do the repair in 36

**Paste target:** the Grok Build session on the live-environment arc.
**Chunk 38.** Branch `main`. **Pull first** — the text of handoff 36 was rewritten at `a022f22`
after you had pulled `36f4f91`, so the public-set work you built was against the earlier text.
Read, in this order: `docs/findings/v1-provenance-audit.md`, then
`docs/handoffs/live-environment-36-claude-to-grok.md` as it now stands.

---

## 1. What happened to your chunk-36 work

The generator (`generate-public.ts`), its tests, `pack-adapters.mjs`, the workflow generalisation
and the `.gitattributes` pin are corpus-agnostic and are **committed**. The two generated
directories are **not**: they were built from the 27-song corpus, which the audit found
unpublishable (20 songs without a verified arrangement licence; two held-out songs are the wrong
file). Labelling that corpus `-public` in the tree would be the thing the audit exists to prevent,
so the directories are removed from the working tree and will be regenerated from the 15-song
corpus. Nothing was pushed anywhere.

## 2. This chunk is the repair as written in handoff 36

V1 the evidence-carrying allowlist of 15 songs; V2 provenance filled from it, `verifier` an
evidence URL or a person; V3 the file-is-the-song test on the MIDI text events; V4 rebuild
`datasets/jam-actions-v1/` and the probe on 15 songs, split by song, floors restated with numbers;
V5 tool-less per family on the new split. The tests and the do-nots are in 36 §3–4.

Then, in the same chunk, since the tooling already exists: **regenerate the two public directories
from the rebuilt corpus** with `generate-public.ts`, and re-run `pack-adapters.mjs` only after the
retrain that follows — the four adapters in the current archive were trained on the 27-song corpus
and are not the ones that ship.

One more thing the generator must do: the card it copies from `docs/hf-cards/` will be rewritten
by me against the 15-song corpus before the publish. Until then the source cards carry a
`<!-- DRAFT … -->` banner as their first body line; the generator should **refuse to build a public
set whose card still carries that banner**. That is the last guard between a draft and an upload.

Two more items from the J19 review of your generator:

- **`public.test.ts` is withheld, not committed.** It reads the committed package directories and
  throws when they are absent, which they now are; CI would go red on the commit that withholds
  them. Make the rebuild-equals-committed and README-byte-equal tests **skip with a stated reason**
  when the package directory does not exist, keep the card-halt and banner-refusal tests as throws,
  and it lands with the regenerated sets.
- **`LICENSE-DATASET.md` and the Zenodo `description` are coordinator prose.** The generator
  currently composes both in code (`licenseDoc()`, `zenodoMetadata()`). Source them the way the
  README is sourced: `docs/hf-cards/jam-actions-v1.LICENSE-DATASET.md` (and the probe's) copied
  verbatim, halting if absent; the Zenodo description taken from the card's `pretty_description`
  field, which is already mine. `CITATION.cff` and `VERSION` are data and may stay generated.

## 3. What to say back

`docs/handoffs/live-environment-39-grok-to-claude.md` — the four parts handoff 36 §5 asks for,
plus the regenerated public sets' file lists and checksum counts, and the banner refusal's test
name.

## 4. Junctures

| # | When | What runs | Status |
|---|---|---|---|
| J19 | chunk 36 (public-set tooling) | typecheck, public/registry/runpod tests, identity scan of tree, generated prose and archive listing | **DONE — code committed; generated sets withheld** |
| J20 | end of this chunk | full verify, V-gates, reproduce gates on both public sets, banner refusal, identity scan | mine |
| — | retrain 3B and 7B on the 15-song corpus, then publish | Director's word | — |
