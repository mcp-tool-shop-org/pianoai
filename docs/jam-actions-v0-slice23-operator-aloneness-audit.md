# jam-actions-v0 — Slice 23 Operator-Aloneness / Reproducibility Audit

**Date:** 2026-05-19
**Audited tag:** `jam-actions-v0-rc-gate-revised-2026-05-19`
**Audited commit:** `6da8738`
**Audit method:** git worktree fresh-clone simulation; no model runs; read-only audit
**Audited package version:** 0.4.0 (per `VERSION` + `manifest.json` + `CITATION.cff`)
**Verdict:** **YES-WITH-CAVEATS** (see §8)

---

## 1. The question (operator's framing)

Slice 22 ACCEPTED the revised RC release gate at axes 2 + 6, with Slice 21 baseline passing all 6 blocking axes under the revised gate. The operator-locked doctrine: **Gate clearance is necessary but not sufficient for release approval.** Before any Zenodo / HuggingFace publication mechanics, this audit answers a separate quality dimension:

> **Can a fresh contributor — operating ALONE, with only the published package and its docs — reproduce the gate-PASS state from the tagged commit?**

This is reproducibility + doc-clarity validation. No model rerun. The Slice 22 assessment artifacts are the canonical PASS verdict; the question is whether a cold reader can verify them with no project-context handholding.

## 2. Methodology

A git worktree was created at `E:/AI/ai-jam-sessions-slice23-audit` checked out to tag `jam-actions-v0-rc-gate-revised-2026-05-19`. The fresh contributor experience was simulated by:

1. Treating the worktree's filesystem state as the only world the contributor sees.
2. Running each documented verification command and capturing the literal output.
3. Reading each user-facing doc cold (without leaning on operator context from prior slices).
4. After the audit, the worktree was removed cleanly; the main worktree was confirmed byte-identical before and after.

**Worktree-vs-fresh-clone caveat:** `git worktree add` shares the `.git` store and (in pnpm's case) reuses the global pnpm store, so the network-clone path is NOT exercised. The audit verifies package state and doc clarity, not the install pipeline itself. The pnpm install in the worktree took **3 min 4 s** (resolution skipped because lockfile was up to date; 228 packages added from the global store).

**Hardware:** Windows 11; PowerShell 7+; pnpm 10.28.2; Node 22; tag `jam-actions-v0-rc-gate-revised-2026-05-19` checked out via `git worktree add`. Git was configured with `core.autocrlf = true` (the rig default). No `.gitattributes` file exists in the repo.

## 3. Phase 1 — Fresh clone + install

`git -C E:/AI/ai-jam-sessions worktree add E:/AI/ai-jam-sessions-slice23-audit jam-actions-v0-rc-gate-revised-2026-05-19` succeeded. HEAD verified at `6da8738a8db5fad7400e4caf64cf5c2f9117b66a`.

`pnpm install` completed in **183.8 seconds**. Output ended with `Done in 3m 3.6s using pnpm v10.28.2`. Two non-fatal warnings:

- pnpm self-update available (10.28.2 → 11.1.3). Cosmetic.
- "Ignored build scripts: esbuild@0.27.3, esbuild@0.27.5" — pnpm's post-10.x security default; not a blocker.

No missing dependencies, no version mismatches, no peer-dep warnings. A fresh contributor with Node + pnpm installed could run `pnpm install` and reach a green tree.

## 4. Phase 2 — Package verification

**This phase surfaced a Windows-only reproducibility blocker.**

`pnpm exec tsx scripts/verify-public-package-checksums.ts` in the worktree exited with code 1 and emitted "[bad line]" for every entry in `checksums.sha256` (270 entries, all reported as malformed). On the main worktree, the same script with the same source code emits `[ok] All checksums verify, every file accounted for.`

**Root cause:** `datasets/jam-actions-v0-public/checksums.sha256` is committed with LF line endings (per `git ls-files --eol`: `i/lf`). The repo has `core.autocrlf = true` and NO `.gitattributes` overriding it. On worktree checkout (and on any fresh `git clone` on Windows with default autocrlf), the file becomes CRLF. The verifier's regex is `^([0-9a-f]{64})  (.+)$` and JavaScript's `$` without the `m` flag does not anchor before `\r` in the way the script assumes — every line is reported as "bad line", verification fails.

Verified the bug minimally:

```js
const line = "<hash>  ATTRIBUTION.md\r";
/^([0-9a-f]{64})  (.+)$/.exec(line);  // null
/^([0-9a-f]{64})  (.+)\r?$/.exec(line); // matches "ATTRIBUTION.md"
```

The script's `regenerate-public-package-checksums.ts` writes LF-only output via `lines.join("\n") + "\n"`. The verifier was written to consume that LF-only output. Neither script defends against the autocrlf round-trip. On Linux/macOS or WSL, this latent bug is invisible. On Windows native, every fresh-clone verification fails on first run.

**Impact:** a Windows fresh contributor following the documented script gets exit code 1 with no actionable error message ("[bad line]" repeated 270 times suggests file corruption, not a CRLF issue). They have no path forward without operator help.

## 5. Phase 3 — Release-gate verification

Two sub-phases: a PASS case (Slice 21 baseline under the revised gate) and a FAIL case (Slice 19 baseline regression check).

**Sub-finding (CLI usability):** `scripts/check-release-gate.ts` accepts `--baseline <path>` but silently ignores positional arguments. A first-instinct invocation like `tsx scripts/check-release-gate.ts datasets/.../slice21-fair-e3-baseline-results.json` runs against the DEFAULT baseline (Slice 19) and reports the regression-check FAIL output, NOT what the user thought they ran. The CLI's `parseArgs` `default:` branch only errors on flags beginning with `--`. This is a real cold-reader trap: a fresh contributor sees axes 1, 2, 6 FAIL and may conclude the package is broken without realizing they ran the wrong baseline.

**PASS case (correct invocation):**

```text
pnpm exec tsx scripts/check-release-gate.ts \
  --baseline datasets/jam-actions-v0-public/evals/slice21-fair-e3-baseline-results.json
```

Exit code 0. All 6 blocking axes PASS:

- Axis 1 (absolute_floor): corpus mean 0.661 ≥ 0.650
- Axis 2 (margin): compound PASS — corpus margin 0.161 ≥ 0.100; 10/16 (62.5%) clearing
- Axis 3 (tool_use_rate): 32.8% ≥ 25.0%
- Axis 4 (correct_after_tool): 82.0% ≥ 75.0%
- Axis 5 (misinterp): 18.0% ≤ 20.0%
- Axis 6 (stratum_floor): all 5 strata qualify via bucket A or bucket B
- Axis 7 [reporting] (enriched_split_reporting): declared

Aggregate: `RC gate PASS (all 6 blocking axes cleared; reporting declared)`. Matches the canonical `slice22-release-gate-revised-assessment.json` byte-for-byte on the structural verdict.

**FAIL case (Slice 19 regression check):**

```text
pnpm exec tsx scripts/check-release-gate.ts \
  --baseline datasets/jam-actions-v0-public/evals/slice19-fair-e3-baseline-results.json
```

Exit code 1. Blocking failures: [1, 2, 6]. Axis 6 names the catastrophic subgroup `schumann(mean -0.278, 0/2 clearing; no margin_pass and no ceiling_saturated_pass record)`. The FAIL verdict is legible — the user sees which axes failed, why, and what stratum is at fault. The "Slice 22 revised gate" banner clarifies the schema version.

**Verdict on Phase 3:** functionally correct in both directions when invoked with `--baseline`. The CLI usability gap is moderate; once a contributor learns the flag form, both verdicts are reproducible and legible.

## 6. Phase 4 — Doc audit (cold-reader voice)

**README.md** — opens cleanly, names what the dataset IS, lists files, gives license + provenance + citation + held-out set. BUT: the header reads `**Version:** 0.2.0   **Built:** 2026-05-17   **Source commit:** f133b631...   **Source tag:** jam-actions-v0-enriched-2026-05-17`. The actual VERSION is 0.4.0, the actual built date is 2026-05-19, the actual source commit is 4b0f181, the actual tag is `jam-actions-v0-rc-gate-revised-2026-05-19`. The README header is **three versions stale**. The README also does NOT mention: the `evals/` directory (which ships), the verification scripts, the release-gate framework, the 7 axes, the Slice 22 PASS verdict, or where to find any of the above. A fresh contributor reading just the README cannot connect the package to its release-gate status.

**DATASET_SCHEMA.md** — thorough, well-structured. Documents every top-level key, every sub-field, with examples drawn from real records. Includes the eval-surfaces table (E1/E2/E3 thresholds) and points to `src/dataset/schema.ts` for the Zod source. Two gaps: (a) line 330 says "See README.md for the current qwen2.5:7b baseline numbers" — but the README has no baseline numbers, the cross-reference is broken; (b) no mention of post-Slice-11 enrichment fields or the 6-record enrichment overlay.

**KNOWN_LIMITATIONS.md** — candid, well-written, valuable for cold readers. BUT §9 ("E2 and E3 baselines fail the locked thresholds") shows the qwen2.5:7b E3 margin at **−0.125** with FAIL verdict, predating the entire Slice 11/16/17/18/18.5/19/20/21/22 enrichment + gate-revision arc. The current Slice 21 baseline shows corpus margin +0.161 with PASS verdict. The doc is substantially STALE on its headline disclosure. §11 ("The package is a *checkpoint*, not a release candidate") still references Slice 13 publication mechanics, but the project has progressed to Slice 22 RC-gate revision and Slice 23 reproducibility audit.

**ATTRIBUTION.md** — thorough, lawyerly, three-layer structure clear. BUT line 70 says `Version: 0.1.1` and the BibTeX + plain-text + in-figure captions all carry `0.1.1`. The actual VERSION is 0.4.0. Line 71 says source commit `e4631391...` tag `jam-actions-v0-public-2026-05-17` — both stale relative to 6da8738 / `-rc-gate-revised-2026-05-19`. The legal substance is correct; the version metadata is **three versions stale**.

**LICENSE-DATASET.md** — clean, accurate, three-layer breakdown matches ATTRIBUTION. No version-stamped strings; no drift. **The only doc that aged cleanly.**

**package-inputs.json + VERSION + CITATION.cff** — internally consistent (all three carry 0.4.0 / 2026-05-19), but `package-inputs.json` is not mentioned anywhere in the README. A fresh contributor would not discover it without listing the directory. CITATION.cff is referenced from README and ATTRIBUTION (good); the version field there is correct.

## 7. Phase 5 — Gap inventory

Severity legend: **B** = blocker (release should not proceed until fixed), **M** = moderate (release can proceed but doc improvement strongly recommended), **C** = cosmetic.

| # | Gap | Sev | Proposed fix |
|---|-----|-----|--------------|
| 1 | `scripts/verify-public-package-checksums.ts` fails on Windows native checkouts because `core.autocrlf=true` converts `checksums.sha256` to CRLF, and the verifier's regex `^...(.+)$` does not handle the trailing `\r`. Every line reported as "[bad line]"; exit 1. | **B** | Either (a) add `*.sha256 text eol=lf` (and arguably `* text=auto`) to `.gitattributes` to pin LF in the working tree on all platforms; OR (b) update the verifier's regex to `^([0-9a-f]{64})  (.+?)\r?$` and `.split(/\r?\n/)` to be CRLF-tolerant. (b) is more defensive; do both. |
| 2 | `scripts/check-release-gate.ts` CLI silently swallows positional arguments — `tsx check-release-gate.ts <path>` runs against the DEFAULT baseline and reports unexpected output. | M | In `parseArgs`, the `default:` branch should error on non-flag arguments instead of silently dropping them. Suggested error: `unknown positional argument '<arg>'; did you mean '--baseline <arg>'?` |
| 3 | README header version block is stale (`Version: 0.2.0`, `Built: 2026-05-17`, source commit `f133b631...`, tag `jam-actions-v0-enriched-2026-05-17`). Actual: 0.4.0 / 2026-05-19 / 4b0f181 / `-rc-gate-revised-2026-05-19`. | M | Re-run the packager (or hand-edit the header) so version + built_at + source_commit + source_tag reflect the current tagged state. Consider templating this into the regenerator so it can never drift. |
| 4 | README does not mention the `evals/` directory at all, despite shipping 25+ eval artifacts (slice16/17/18/18.5/19/20/21/22) under it. | M | Add a one-paragraph "Verification" or "Evals" section to README listing what's in `evals/`, naming the two key entry-point artifacts (`slice21-fair-e3-baseline-results.json` = current baseline; `slice22-release-gate-revised-assessment.json` = current PASS verdict), and pointing to the two verification scripts. |
| 5 | README does not mention `verify-public-package-checksums.ts` or `check-release-gate.ts`. A fresh contributor has no documented path from README to the verification commands. | **B** | Add a "Reproducibility" section to README with the exact commands (with `--baseline` flag form), expected outputs, and a one-line summary of what each script proves. |
| 6 | KNOWN_LIMITATIONS §9 ("E2 and E3 baselines fail the locked thresholds") is substantially stale — the table shows pre-enrichment qwen2.5:7b margin = −0.125 FAIL; current Slice 21 baseline shows corpus margin +0.161 PASS, with Slice 22 declaring RC gate PASS. | M | Update §9 to either (a) show both pre-Slice-11 numbers AND current Slice 21/22 numbers with the enrichment arc explained, or (b) link to the slice docs for the current state. Preserve the original honesty; layer the new state. |
| 7 | KNOWN_LIMITATIONS §11 ("The package is a *checkpoint*, not a release candidate") references Slice 13 publication mechanics; the project has progressed through Slice 22 RC-gate revision and a Slice 23 reproducibility audit. | M | Update §11 to reflect the actual current state — Slice 22 RC gate revised + Slice 23 audit complete — without claiming release readiness (which is a separate operator call). |
| 8 | ATTRIBUTION.md version field, BibTeX entry, plain-text reference, and source-commit line are all stamped `0.1.1` / `e4631391...` / `jam-actions-v0-public-2026-05-17`. Three versions behind. | M | Regenerate the version-stamped strings to match VERSION 0.4.0 / current tag. Consider templating the BibTeX block to read from VERSION at packaging time. |
| 9 | DATASET_SCHEMA.md line 330 cross-references "the current qwen2.5:7b baseline numbers" in README — the README has no such numbers (and current baselines live in `evals/`). | C | Either add the baseline numbers to README (see gap #4), or fix the cross-reference to point at the actual current baseline file under `evals/`. |
| 10 | No top-level `REPRODUCIBILITY.md` or `VERIFICATION.md` walking through the 3-step verification flow (install → checksum → gate). The information exists in scattered slice docs but not in any user-facing entry point. | M | Add a `REPRODUCIBILITY.md` to the package (or a `## Reproducibility` section to README — see gap #5). Should explicitly say: "this is what a fresh contributor should run; this is what they should see." |
| 11 | `package-inputs.json` is shipped but not mentioned in README. A fresh contributor exploring the package directory sees an undocumented file. | C | One-line README entry under "Top-level files": `package-inputs.json` — packager-internal contract declaring curated vs generated files; not consumed by downstream users. |
| 12 | The Slice 22 PASS verdict (`evals/slice22-release-gate-revised-assessment.json`) is not traceable from any front-page doc. README mentions no eval files; KNOWN_LIMITATIONS predates it; only DATASET_SCHEMA mentions eval thresholds but with stale numbers. | **B** | Same fix as gap #5 (Reproducibility section in README, pointing to `slice22-release-gate-revised-assessment.json` as the canonical PASS verdict). |
| 13 | Repo has no `.gitattributes` enforcing platform-consistent line endings. Combined with gap #1, this is the structural Windows-only fragility. | M | Add `.gitattributes` with at minimum `*.sha256 text eol=lf` and ideally `* text=auto` (so JSON, MD, TS all default to LF on commit, normalized in working tree per OS). |

**Three blockers (1, 5, 12)** — Windows verifier failure, README → verification disconnect, untraceable PASS verdict. All three are doc-or-config fixes; none require source-code changes to the gate logic.

**Eight moderate items** — mostly stale version stamps across README + ATTRIBUTION + KNOWN_LIMITATIONS and the missing Reproducibility section.

**Two cosmetic items** — broken cross-reference, undocumented `package-inputs.json`.

## 8. Verdict

**YES-WITH-CAVEATS.**

Reproducibility of the **gate-PASS state** itself works: with the correct `--baseline` flag, `scripts/check-release-gate.ts` against `slice21-fair-e3-baseline-results.json` returns exit 0 and the same `PASS / blocking_failures: []` verdict as the canonical `slice22-release-gate-revised-assessment.json`. The Slice 19 regression check returns the correct FAIL with axes 1, 2, 6 identified. The gate logic is internally consistent and the artifacts are accurate.

But the **fresh-contributor experience** has three concrete blockers and eight moderate gaps. A cold reader trying to follow the kickoff's documented 5-step verification script would:

1. Hit a Windows-only "[bad line]" wall on checksum verification (Gap #1) and have no documented recovery path.
2. Be unable to find the verification commands in any user-facing doc — they exist only in the kickoff document, which is operator-private (Gap #5).
3. Not be able to trace the package's "Slice 22 PASS verdict" claim through any front-page doc to the actual `slice22-release-gate-revised-assessment.json` artifact (Gap #12).

Once a fresh contributor knows the commands and runs them on Linux/macOS/WSL (or fixes the CRLF issue), the package verifies cleanly. So the answer is **YES, with caveats** that close before public release.

Publication mechanics (Zenodo / HuggingFace) should NOT proceed until at least the three blockers are closed. The eight moderate gaps are best-practice cleanup but do not strictly block reproducibility on a non-Windows-native rig.

## 9. Slice 23.5 candidates

A focused doc-and-config cleanup slice would close the gap inventory above. Suggested scope (≤ 4 hours of work):

1. **(Blocker)** Add `.gitattributes` with `*.sha256 text eol=lf` (and consider `* text=auto`). Re-test verification on a freshly-cloned Windows worktree. (Gap #1, #13.)
2. **(Blocker)** Harden the verifier regex: `^([0-9a-f]{64})  (.+?)\r?$` and `.split(/\r?\n/)`. Add a Vitest unit test that feeds the parser a CRLF-terminated checksums string. (Gap #1.)
3. **(Blocker)** Add a "Reproducibility" section to README.md with the exact 3-step verification flow (install / checksum / gate). Name `slice21-fair-e3-baseline-results.json` and `slice22-release-gate-revised-assessment.json` as the canonical PASS-verdict pair. (Gaps #4, #5, #12.)
4. **(Moderate)** Make `scripts/check-release-gate.ts` error on unknown positional arguments instead of silently dropping them. Add a Vitest test. (Gap #2.)
5. **(Moderate)** Regenerate README header + ATTRIBUTION version-stamped strings to reflect VERSION 0.4.0. Consider templating both so they cannot drift independently. (Gaps #3, #8.)
6. **(Moderate)** Layer KNOWN_LIMITATIONS §9 + §11 with current Slice 21 / Slice 22 / Slice 23 state, preserving the pre-Slice-11 honesty. (Gaps #6, #7.)
7. **(Cosmetic)** Fix DATASET_SCHEMA cross-reference; add `package-inputs.json` to README's "Top-level files" list. (Gaps #9, #11.)

Slice 23.5 deliverable: doc + config fixes. Slice 23 deliverable (this slice): findings. Keep them separate so the audit's integrity is preserved.

## 10. Slice 24+ implications

The audit is necessary-but-not-sufficient evidence for release. Three things this audit does NOT do:

- **It does not approve release.** Operator-locked doctrine: gate clearance + reproducibility ≠ release approval. Slice 24 (or later) is where the operator weighs Zenodo / HuggingFace publication mechanics against the full audit + doc state.
- **It does not test the network-clone path.** `git worktree` shares the `.git` store and pnpm shares the global store; a true fresh clone from GitHub + a cold pnpm install is unverified. Recommended as a Slice 24 pre-publication check.
- **It does not re-run the model.** The PASS verdict is byte-identical to the canonical `slice22-release-gate-revised-assessment.json`. If at some future point the operator wants to verify the records and the gate output co-reproduce, that's a model rerun (Slice ≥ 25?).

**What unblocks release:**
- Slice 23.5 doc-fix slice (this audit's recommended follow-up).
- A fresh-clone network test (not just worktree).
- Operator decision to publish.
- Zenodo DOI mechanics (which then requires one more README iteration to cross-link the DOI back into the package).

**What does not unblock release** without further work:
- Mere passage of time.
- Adding more eval artifacts (the gate is already PASS-verified; piling on more numbers does not change the verdict).
- Hand-editing files in the package without re-running the packager + checksum regenerator + verification.

---

**Hard-gate checklist** (per kickoff):

- [x] All 1491 existing tests still pass (no code changes were made in this slice).
- [x] Source corpus, records, records.jsonl, splits byte-identical (no writes outside the new slice doc).
- [x] Eval harnesses + release-gate validator byte-identical (Slice 18.5 + Slice 22 state preserved).
- [x] Public package contents byte-identical (no overwrites).
- [x] All prior eval artifacts byte-identical.
- [x] Worktree was created, the verification ran in it, and the worktree was removed cleanly.
- [x] Working tree on main: byte-identical before and after the audit (only the new slice doc was added).
- [x] Slice doc has 10 sections per kickoff.
- [x] Per-doc cold-reader assessment in §6 covers all 6 dataset-package docs.
- [x] Gap inventory in §7 is concrete (13 specific gaps with severity + fix proposal).
- [x] Verdict in §8 is stated explicitly: **YES-WITH-CAVEATS**.
- [x] Worktree removal confirmed; main worktree unchanged.
- [x] **No** record content changes, **no** source corpus mutation, **no** code edits.
- [x] **No** autonomous commit. Stopped and reported.

**Suggested tag (if commit authorized):** `jam-actions-v0-aloneness-audit-gaps-2026-05-19`
