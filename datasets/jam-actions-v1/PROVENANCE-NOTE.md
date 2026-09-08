# Provenance

This tree is the **publishable** subset: classical, ragtime, and folk only.
Copyrighted library genres are not in this directory. Follows the
jam-actions-v0 / jam-actions-v0-public split.

Three songs are excluded, each for its own reason:

| song | why |
|---|---|
| `clair-de-lune` | the jam-actions-v0 fine-tune holdout |
| `satie-gymnopedie-no1` | arrangement provenance unverified in the Slice 2.5 audit |
| `debussy-arabesque-no1` | same audit, same finding |

The last two matter more than they look. Both are present in the v0 **working**
corpus and excluded from its **published** subset, for exactly the reason this
tree claims to follow. The first build of this corpus carried 7 records of each
into a tree its own note calls publishable, repeating a provenance problem the
studio had already audited and closed once. The exclusion is enforced by a test
now, not by this paragraph. See `datasets/jam-actions-v0/PROVENANCE-NOTE.md`.

Gold is re-derived from library engines (inferChord, detectChord,
transposeSong, measure counts, section lists). No hand-written labels.
