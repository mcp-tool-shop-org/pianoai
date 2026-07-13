# Deploy: jam-actions-live (ZeroGPU Gradio Space)

**Status:** ✅ **DEPLOYED + working (2026-07-12)** at
https://huggingface.co/spaces/mikeyfrilot/jam-actions-live (free ZeroGPU).

**Part-3 enrichment (2026-07-12):** added a client-side **piano-roll + Web Audio** player (see/hear
the queried phrase; timing recovered from the MIDI sidecar into `demo_data.json` `events[].{t,d,v}`)
and a **"Surprise me" divergence picker** (`divergence.json`, honest cycle seeded from the B-1
per-question scores — mostly fine-tune rescues but keeps a split + a both-miss). **`@spaces.GPU`
`duration` is `60`, NOT 120** — ZeroGPU reserves `duration+60` against the per-user daily quota, so
120 reserved 180s and failed at low remaining quota; 60 (~120s reservation) is the proven value.
Space `tags` added for search. Companion spotlight article:
https://huggingface.co/blog/mikeyfrilot/jam-actions-three-arcs
Requires **PRO** (personal) to host a Gradio/ZeroGPU Space, or Team/Enterprise for an org
— Mike enabled PRO on `mikeyfrilot` to ship this. See the "ZeroGPU deploy learnings" in
`memory/ai-jam-sessions-hf-org-presence.md` for the redeploy gotchas (peft cuda pin,
`duration=60`, sse_v3 queue-protocol testing, `?logs=container` for tracebacks).

The MIDI-inspector tool port is verified byte-faithful against the eval's ground truth
(`test_tools_local.py` — pitch-class counts match `correctOptionIndex` for all 8 phrases).

## Files (this dir)
- `app.py` — Gradio app: agentic `tool_inspected` loop, baseline vs jam-ft-v1 side by side.
- `demo_data.json` — 8 real B-1 cohort phrases + exact MCQ questions + note events.
- `requirements.txt` — spaces, transformers, peft, accelerate (torch from the ZeroGPU image).
- `README.md` — Space card (sdk: gradio, honest framing).
- `test_tools_local.py` — offline validation of the tool port (no GPU).
- `extract-demo-data.mjs` — regenerates `demo_data.json` from the repo.

## Deploy once a plan is active
1. Subscribe PRO (personal) **or** upgrade the org to Team+.
2. Create the Space: `POST /api/repos/create {type:space, name:jam-actions-live, sdk:gradio}`
   (under the PRO account, or the upgraded org).
3. Set hardware: `POST /api/spaces/<ns>/jam-actions-live/hardware {"flavor":"zero-a10g"}`.
4. Commit `app.py`, `requirements.txt`, `README.md`, `demo_data.json` (one NDJSON commit,
   or `git push` / web upload).
5. First build downloads `Qwen/Qwen2.5-7B-Instruct` (~15 GB) — allow a few minutes.
6. Cross-link from the eval page, explorer, org card, and the collection.

Everything can be driven from the logged-in browser session (cookie auth) — see
`memory/ai-jam-sessions-hf-org-presence.md` for the commit-API recipe.
