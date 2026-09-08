# Live Hugging Face cards, captured

## Why this directory exists

`push-jam-actions-v0-hf.yml` uploads a dataset package folder **verbatim**. It verifies
`checksums.sha256` before upload and changes nothing. So whatever is in
`datasets/<package>/README.md` is what lands on Hugging Face, and anything edited on Hugging Face
directly is overwritten the next time that workflow runs.

On 2026-09-08 the live card for `mcp-tool-shop/jam-actions-v0` was found to be a **69-line superset**
of the repository's copy — 69 lines added, none removed. Someone enriched it on Hugging Face and the
change never came back. It carries content that exists nowhere else:

- a Fine-tuning evaluation banner linking the `jam-actions-eval` and `jam-actions-explorer` Spaces;
- a "What's in a record" walkthrough with an annotated Clair de Lune record.

**The next dispatch of that workflow would have deleted both.** `jam-actions-v0-public.live-card.md`
is the live card as fetched, so the content survives whatever happens next.

## The second consequence: the card fails its own checksum

The package ships `checksums.sha256` covering every other file, and consumers are told to verify
with it. On the Hugging Face copy, `README.md` is the one entry that does not match, because the
card there is not the card the manifest was computed over. Measured the same day, against files
downloaded from Hugging Face:

| file | verifies on Hugging Face |
|---|---|
| `records.jsonl` | yes |
| `splits.json` | yes |
| `manifest.json` | yes |
| `VERSION` | yes |
| `CITATION.cff` | yes |
| `README.md` | **no** |

The data is intact. Only the card diverges. But a consumer following the package's own instructions
sees a checksum failure and has no way to tell that it is cosmetic.

## Not resolved here, and why

`jam-actions-v0-public` is at v0.5.0 with Zenodo DOI
[`10.5281/zenodo.21313954`](https://doi.org/10.5281/zenodo.21313954). That deposit is immutable and
carries the repository's card. Folding the enriched card into the package and regenerating checksums
would make the repository, Hugging Face and Zenodo disagree in a new way rather than fewer ways, and
it means a version bump on a DOI'd, release-gated dataset.

Three options, for whoever decides:

1. **Adopt the enriched card.** Bring it into `datasets/jam-actions-v0-public/README.md`, regenerate
   checksums, cut v0.5.1, and mint a new Zenodo version so all three agree again.
2. **Revert Hugging Face to the packaged card.** One dispatch of the existing workflow does it. The
   enriched content moves into the card's next authored revision instead of living out of band.
3. **Leave it and say so on the card**, naming `README.md` as the one file that will not verify.

The acoustic corpus (`jam-actions-acoustic-v0`) does not have this problem: its card is generated
from source, so the repository, the checksums and the Hugging Face copy cannot drift apart.
