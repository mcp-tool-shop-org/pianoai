# Finetune Arc v2 — P0 Preregistration Lock (B-1: the free confirmatory arc)

**Frozen:** 2026-07-11, before any model call. **Mandate:** director-directed 2026-07-11 ("Let's start with B-1") per the v0.5.0 kickoff's Track B; this arc is **evaluation-only** — no training, no checkpoint selection, no pod, no spend. **Process shape inherited from** [experiments/finetune-arc-v1/P0-LOCK.md](../finetune-arc-v1/P0-LOCK.md) (which inherited v0's); everything below that is not a stated delta follows those locks' rules verbatim — in particular: pre-run deviations are recorded as amendments (A1-v2…) in this file; post-run deviations are reported in the B-1 report, never silently patched; no best-of-seeds anywhere; all five seeds report.

**The question this arc answers:** the v1 verdict was *"directionally better, underpowered"* — Δ +0.202 on the primary, p = 0.0043, 5/5 seeds above baseline, but 12/16 paired wins (1 tie) against a frozen ≥13/16 bar that a 16-record cohort could barely resolve. The binding constraint on the claim is **POWER, not effect size**. B-1 widens the sealed cohort to 36 records — dominated at the margin by never-trained material — mints a fresh sealed baseline on the v0.5.0 records, and re-scores the **frozen** v1 artifacts. Nothing else moves.

## Standards compliance (six standards, 0–3)

| Standard | Score | Evidence |
|---|---|---|
| PIN_PER_STEP | 3 | This lock pins the cohort receipt, harness, eval-logic files, frozen-model artifacts, dataset tag, and RNG seeds by sha/value (§2, §3); the cohort derivation is seeded + byte-replayable (`derive-b1-cohort.ts`); the runner records per-run receipts and the pre-run gate emits its own receipt. |
| ANDON_AUTHORITY | 3 | Pre-run gate hard-fails on: missing/mismatched frozen artifacts, package checksum failure, harness-vs-derivation cohort drift (`--verify`). The runner aborts the arc on any nonzero eval exit. The victory bar is frozen ex-ante as a number table — no post-hoc threshold arithmetic. |
| NAMED_COMPENSATORS | 2 | §8 table. No irreversible action exists in this arc (local evals, read-only frozen artifacts, git commits). The only P7-class irreversible action (adapter publish) is OUTSIDE this arc behind a director gate. No skip. |
| DECOMPOSE_BY_SECRETS | 3 | All v2 outputs live under `experiments/finetune-arc-v2/`; the v1 artifacts, the v0.5.0 package, and the harness eval logic are read-only inputs (shas pinned); the only repo-surface change is the additive `b1-confirm-cohort` sampler filter (§3, diff-scoped). |
| UNCERTAINTY_GATED_HUMANS | 3 | Director gates: the arc itself was director-directed; a PASS outcome fires a **P7-class director gate** before any adapter publish or claim-upgrade ships (§6); a MISS ships as-is with the frozen wording. The Track-A publish gate is independent and untouched by this arc. |
| EXTERNAL_VERIFIER | 2 | The eval harness + MCQ generators are deterministic TS, never the models under test; the cohort verification gate checks the harness const against an independent derivation; stats are deterministic and seeded. (No cross-family citation gate — no new research claims are introduced; the stats design is settled ground per the kickoff.) |

## 1. Design summary (what runs, what never runs)

- **Runs:** exactly **6 sealed evaluations**, one per model — the prompted baseline `qwen2.5:7b` and the five frozen v1 fine-tunes `jam-ft-v1-qwen25:seed{13,42,271,512,1024}` — each over the 36-record confirmatory cohort, 4 conditions, n=3.
- **Never runs:** training of any kind; checkpoint (re)selection; any modification to the v1 artifacts; any second eval of any model ("one eval per model" — crash-resume via the harness's own checkpoint file within a single run is permitted and declared; a completed results file is never regenerated).
- **Spend:** $0 beyond local electricity. No pod exists; none may be created under this lock.

## 2. Pinned inputs (sha256, recorded at freeze time)

| Artifact | Pin |
|---|---|
| Dataset: `datasets/jam-actions-v0-public/` at tag `jam-actions-v0-0.5.0-cut-2026-07-11` (v0.5.0, r001+r002 inherited) | package `checksums.sha256` 274/274 verified at freeze; re-verified by the pre-run gate |
| Cohort receipt `experiments/finetune-arc-v2/data/b1-cohort.json` | `7ea74fc936ddcc7f479c66708ac21f3cd17d31c43ff4a85153392a7dfa0775a4` |
| Harness `scripts/run-jam-actions-corpus-eval.ts` (with the additive `b1-confirm-cohort` filter — the ONLY change vs the v1-sealed harness; see §3) | `8bef493d4c574bd3ceaef50e7ecacc34808a14b66a10f9d5998a962af76f43fb` |
| `src/dataset/eval/annotation-grounding.ts` (MCQ generator) | `00f8357dc3aba7a0ae82a899be761023a49d6472fc7daa95a89d67317a22cf12` — **byte-identical to the v0/v1 lock pin** |
| `src/dataset/eval/annotation-grounding-tool.ts` (E3-tool harness) | `34aaabba31f6e476eedfb4e1737615fbd284411c5fb83a0767a73899c6ed86f1` — **byte-identical to the v0/v1 lock pin** |
| `src/dataset/eval/midi-inspector.ts` (inspector tool surface) | `1037b937422bdaf35f74c234f851b9fc5c6a9dbb67c842302ca91135f6baeff2` |
| Frozen v1 artifacts: `experiments/finetune-arc-v1/artifacts/p4-receipt.json` | `82585916084495481a757638d06c6a2992f62cdf4c06d047f92bef8e19160807` — the five GGUF sha256s inside are the artifact pins; the pre-run gate asserts each on-disk GGUF matches and each ollama tag exists, and records `ollama show --modelfile` evidence per tag |
| Baseline model | local `qwen2.5:7b` — digest recorded by the pre-run gate receipt at run time (same tag the v0/v1 arcs used) |
| Stats RNG | mulberry32, seed **20260713** (v2's own seed; v1 used 20260711), 10k bootstrap, 10k permutations |
| Cohort sampler RNG | mulberry32, seed **20260712** (inside `derive-b1-cohort.ts`) |

## 3. The confirmatory cohort (frozen; receipt is the authority)

36 records, derived mechanically by [`scripts/derive-b1-cohort.ts`](scripts/derive-b1-cohort.ts) from the v0.5.0 package and mirrored as the harness's `--sample-filter b1-confirm-cohort` iteration list (the derive script's `--verify` mode asserts const↔derivation equality; it is part of the pre-run gate):

- **Stratum CL (12): every clair-de-lune test-split record.** clair-de-lune has NEVER appeared in any training corpus, any split's gradient set, any paraphrase, any grounding session — gate-asserted by v1's G5 (`clair` substring blacklist) and structurally by the dataset's held-out rule. 11 of these 12 records have never been evaluated by anything; 1 (m031-034) was the single unseen record of the v1 cohort. This stratum is the clean confirmatory core.
- **Stratum LG (15): the train-song records of the sealed slice19-cohort** (v0/v1's 16-record cohort minus its one clair record, which lives in CL). Continuity with the sealed history — v1's 12/16 result came from these 15 + CL's m031-034.
- **Stratum NW (9): a seeded, blind sample of the remaining 88 train records** — candidates sorted, Fisher-Yates with mulberry32(20260712), first 9. Drawn 2026-07-11 before any B-1 model output existed. (The draw happens to include the r001-corrected `bach m061-062` record — noted for transparency; the seed was fixed before the draw.)

**Harness change scope (the only eval-surface diff vs v1's sealed runs):** the additive filter — a type-union member, a 36-id const, an iteration-list branch (E1/E2 empty, e3 + e3-tool = the 36), a log label. The MCQ generator, the E3/E3-tool prompt construction, scoring, and serialization are byte-identical to the v1 regime (§2 pins). Because every run in this arc (baseline AND fine-tunes) uses the same harness sha, the comparison is internally consistent by construction.

## 4. The new sealed baseline (why it exists, what it is)

The slice21 baseline was measured on **v0.4.3 records**; erratum-002 corrected all 16 Bach records' annotation prose, which the E3 conditions embed in prompts. A baseline for v0.5.0-record evals must be measured on v0.5.0 records — this is why Track A (the cut) preceded this arc. Note the fairness symmetry: the frozen v1 seeds were **trained** on the r001+r002-corrected working set (v1 lock amendment A2-v1), and in this arc both arms are **evaluated** on the same corrected records with identical prompts.

- **One run**, before the fine-tune evals, byte-pinned flags (§5). Its artifact `evals/b1-baseline-results.json` becomes the sealed baseline of this arc the moment it completes. No rerun under any outcome (crash-resume within the run via the harness checkpoint is the only continuation path).
- The prior sealed baseline artifact remains what it always was — the v0.4.3-measured receipt (v0.4.3 deposit + git history) — and is not an input to this arc's statistics.

## 5. Execution spec (byte-pinned flags; the v1 P5 regime with the new filter)

Runner: [`scripts/run-b1-evals.mjs`](scripts/run-b1-evals.mjs) — sequential, one model at a time, baseline first, then seeds ascending {13, 42, 271, 512, 1024}; abort-on-first-failure; per-run wall-clock logged to `evals/b1-run.log`.

**Pre-run gate (hard, receipt `evals/b1-prerun-gate.json`):** (i) `verify-public-package-checksums.ts` exit 0; (ii) `derive-b1-cohort.ts --verify` exit 0; (iii) all five `p4-receipt.json` GGUFs found on disk with matching sha256; (iv) all six ollama tags resolvable, `ollama show --modelfile` captured per tag; (v) this lock file committed (git log contains it) before any model call.

Each model then runs exactly:

```
pnpm exec tsx scripts/run-jam-actions-corpus-eval.ts \
  --model <tag> --backend ollama \
  --evals e3,e3-tool --sample-filter b1-confirm-cohort --n 3 \
  --output <abs>/experiments/finetune-arc-v2/evals/b1-<label>-results.json \
  --sample-output <abs>/experiments/finetune-arc-v2/evals/b1-<label>-sample.json
```

with `<tag>/<label>` ∈ {`qwen2.5:7b`/`baseline`, `jam-ft-v1-qwen25:seed13`/`seed13`, …seed42, …seed271, …seed512, …seed1024}. Default sampler seed (`slice12-2026-05-17`) — the sealed regime v0/v1 used, unchanged.

## 6. Statistics + the frozen victory bar (p6-stats-v2)

[`scripts/p6-stats-v2.ts`](scripts/p6-stats-v2.ts) (v1 machinery, arms re-pointed; RNG seed 20260713):

- **Primary (carries the claim):** v1-FT all-seeds mean vs the NEW sealed baseline, paired by recordId, on `tool_inspected`, over all 36 records. Secondary: `full`. Controls: `text_only`, `random_midi`. Mean Δ, record-level bootstrap CI95, song-cluster bootstrap CI95 (8 song clusters), sign-flip permutation p, exact sign test.
- **The victory bar, frozen ex-ante as numbers** (from the cohort receipt's table; exact two-sided sign test, α = 0.05): victory requires **wins ≥ k\*(n_eff)** on the primary, where n_eff = 36 − ties and k\*(n) = min{k : 2·P(Bin(n,½) ≥ k) ≤ 0.05}. At n_eff = 36 the bar is **25/36** (exact p at bar = 0.0288); the full table for n_eff = 24…36 is in `data/b1-cohort.json` §victory_bar and governs verbatim. Reference (not binding): at a true per-record win rate of 0.75, power ≈ 0.80 at n_eff = 36.
- **Strata reported unpooled alongside the pooled primary:** CL (12), LG (15), NW (9) — each with its own mean Δ and win count. The CL stratum is the confirmatory headline of the report regardless of outcome. No stratum result substitutes for the pooled bar.
- **Diagnostic (no claim attached):** LG-15 win pattern vs v1's observed 11/15 (1t) on the same records under the old baseline — continuity check, reported descriptively only.

**Claim classes, frozen verbatim (the only permitted wordings):**

1. **PASS** (wins ≥ k\*(n_eff) AND mean Δ > 0): *"powered win — the jam-actions v1 recipe trains a model that beats the prompted baseline at tool-grounded musical QA on a preregistered 36-record cohort dominated by held-out material."* Consequence: a **P7-class DIRECTOR gate** opens (adapter publish + docs/handbook results section — the gate that never fired in v1). Nothing publishes without the director's explicit yes; this lock only authorizes the wording.
2. **MISS, positive direction** (bar not met, mean Δ > 0): *"directionally better, underpowered — twice, honestly."* Reported as-is; no relitigation; no third eval of these artifacts on this cohort.
3. **NOT BETTER** (mean Δ ≤ 0): *"not better than the prompted baseline on the primary condition at n=36."*

**Explicitly not imported:** v1's paraphrase-robustness clause. It was never operationally defined in any lock and was never invoked (reserved for a victory candidate that never materialized); importing an undefined check into a preregistration would create a post-hoc-interpretable clause. The kickoff's B-1 claim classes (above) supersede it; the P7-class director gate remains free to demand any additional evidence before a publish.

## 7. Outcome-dependence disclosure (stated because it must be)

**This arc exists because v1 missed its bar by one win.** A confirmatory re-test designed after seeing a near-miss carries selection risk; the mitigations, all mechanical:

1. The artifacts under test were **frozen 2026-07-11 before this cohort existed** (p4-receipt sha above; no retraining, no reselection — selection at P3-v1 used only inner-val records and never saw ANY cohort record).
2. The added material is **dominated by never-trained records**: all 12 CL records were structurally excluded from every training corpus; the 9 NW records were drawn blind by a fixed seed.
3. The bar is **frozen ex-ante as an exact-number table** at α = 0.05 two-sided — the same significance convention v1's 13/16 bar encoded, recomputed for the new n, not loosened.
4. One eval per model, no reruns, all five seeds report, no best-of-seeds.
5. Both possible outcomes have pre-committed wordings and consequences (§6); a miss is a publishable result, not a retry trigger.

## 8. Compensators (no irreversible action exists in this arc; table per the standing rule, no skip)

| Action | Irreversible? | Compensator | Owner |
|---|---|---|---|
| Local eval runs (GPU time) | No (time only, $0) | None needed; abort = ctrl-c / kill the runner; harness checkpoint resumes | advisor |
| Git commits (lock, scripts, receipts, results) | No | `git revert` | advisor |
| Harness filter addition | No (additive; pinned) | `git revert` restores the pre-B1 harness byte-exactly | advisor |
| Frozen v1 artifacts / ollama tags / v0.5.0 package | Not touched | Read-only by construction; pre-run gate is the tripwire | — |
| P7-class adapter publish (only on PASS) | Public artifact | OUTSIDE this lock — fires only via the director gate with its own compensator table (inherits v1 §12's HF row) | director + advisor |

## 9. Execution phases + gates

| Phase | What | Gate |
|---|---|---|
| P0-v2 | This lock + cohort receipt + harness filter + runner, committed | Lock committed before any model call (pre-run gate asserts) |
| P1-v2 | Pre-run gate | Exit 1 on any §5 assertion failure |
| P2-v2 | 6 sealed runs (baseline first, seeds ascending) | Abort-on-first-failure; one eval per model; wall-clock logged |
| P3-v2 | p6-stats-v2 + receipted report | Victory-bar table governs verbatim; wording classes bind |
| P4-v2 | IF PASS: P7-class director gate (adapter publish + docs) | Explicit director yes; never fired ≠ failure |

## Amendments (pre-run only; the inherited pattern)

*(none at freeze)*
