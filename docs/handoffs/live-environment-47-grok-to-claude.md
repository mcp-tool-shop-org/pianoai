# Handoff 47 — Grok Build to Claude: `none` is a fresh Zenodo deposit

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 46.** Branch `live-environment-46-zenodo-none` @ `9ed1caf` (`main` is still
`ef1edcc`). Workflow-only. I did **not** run the suite. Did not touch `datasets/**`,
`docs/hf-cards/**`, `docs/zenodo/**`, or `songs/**`. **No DOI. No HF push. No
`ZEN_TOKEN` step ran.**

---

## Diff summary

Same file: `.github/workflows/publish-jam-actions-v0.yml`. No new workflow.
`actionlint` clean. Default `zenodo_newversion_of` is still `20279919` (digits →
new version of that record). v0 default dispatch is the same path.

**Z5.** Literal `none` is a fresh deposit: the create-deposit step `POST`s
`/api/deposit/depositions` with `{}`. Any other value must be all digits; the
input gate exits 1 with the value in the message. Empty is not treated as fresh
(it is not reachable from a dispatch).

**Z6.** Header Inputs table and the `zenodo_newversion_of` description both say:
digits = new version of that published record; `none` = fresh deposit with its
own concept DOI; default `20279919`; an empty dispatch value is not reachable
(GitHub substitutes the default).

**Z7.** The first step prints `Zenodo path: fresh deposit` or `Zenodo path: new
version of <id>` before checkout. The final receipt repeats it. A failed gate
prints `(invalid: <value>)` on the receipt (`if: always()`), not "new version of".

---

## Two dispatches

### `none` + probe, draft-only — success

https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/runs/34372600703

Inputs: `mode=draft-only`, `dataset_dir=datasets/jam-actions-v1-probe-public`,
`zenodo_newversion_of=none`, `confirm_irreversible=no`.

Printed at the gate:

```
Zenodo path: fresh deposit
```

Receipt:

```
  Zenodo path:         fresh deposit
  Zenodo:              skipped (draft-only, no Zenodo call)
```

Create deposit / bucket upload / set metadata / publish / HF: **skipped**. No
`zenodo.org` call.

### `abc` — failed at the input gate

https://github.com/mcp-tool-shop-org/ai-jam-sessions/actions/runs/34372793378

Inputs: `mode=draft-only`, `zenodo_newversion_of=abc`, `confirm_irreversible=no`.

Printed at the gate:

```
ERROR: zenodo_newversion_of must be all digits (a published record id) or "none" (fresh deposit); got: abc
```

Receipt (`if: always()`):

```
  Zenodo path:         (invalid: abc)
```

Checkout and every later step skipped except the receipt. No `ZEN_TOKEN` step ran.

---

Default path unchanged: `20279919` is still digits, still a new version of that
record, still the default. I did not dispatch v0.

**Yours:** J25 workflow validation and the two runs reviewed. Merge is yours.
