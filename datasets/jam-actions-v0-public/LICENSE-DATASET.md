# Layered licensing for `jam-actions-v0` (public subset)

This dataset combines three distinct layers of intellectual property; the layered license below describes each.

## 1. Compositions

All 8 musical compositions in this dataset are in the **public domain** in both the United States and the European Union:

- US: each composition was first published before 1929 (the public-domain boundary as of 2024 in the US).
- EU: each composer died more than 70 years ago. The latest-deceased composer represented here is Claude Debussy (d. 1918, 70 years elapsed in 1988).

No copyright restrictions apply to the underlying compositions.

## 2. Arrangements (MIDI sequences)

The MIDI sequences used to derive these records were arranged by **Bernd Krueger** and published at **piano-midi.de**. These arrangements are licensed under:

**Creative Commons Attribution-ShareAlike 3.0 Germany** (CC-BY-SA-3.0-DE)

Canonical URL: https://creativecommons.org/licenses/by-sa/3.0/de/

The DE jurisdiction is the **legal** governing law for the arrangements; the substantive obligations (attribution + share-alike) are equivalent to the international CC-BY-SA-3.0.

## 3. Derivative records (this dataset)

Because each record incorporates and is derived from a CC-BY-SA-3.0-DE arrangement, the share-alike clause propagates: **this dataset is licensed under CC-BY-SA-3.0-DE**.

Downstream users redistributing this dataset, or derivatives of it, MUST:

1. Provide attribution to **Bernd Krueger / piano-midi.de** for the MIDI arrangements.
2. Provide attribution to **`mcp-tool-shop-org`** for the dataset (see `CITATION.cff`).
3. Release derivatives under a compatible share-alike license (CC-BY-SA-3.0, CC-BY-SA-4.0, or CC-BY-SA-3.0-DE).
4. Indicate any changes made to the dataset.

## Note on HuggingFace's license slug

HuggingFace's dataset-card YAML enumerates `cc-by-sa-3.0` but does **not** carry the `-de` jurisdiction suffix. The card therefore declares `license: cc-by-sa-3.0`; the DE jurisdiction is documented here and in the README body. There is no conflict — the obligations are identical, and the DE jurisdiction is the governing law for the upstream arrangements.

## On the demoted songs

Two songs (Satie Gymnopédie No. 1; Debussy Arabesque No. 1) from the source corpus could not be verified against piano-midi.de during Slice 2.5 URL verification. They are **not** in this public subset and carry no claim of CC-BY-SA-3.0-DE licensing here. They remain in the source repo with `record_verdict: "internal"`.
