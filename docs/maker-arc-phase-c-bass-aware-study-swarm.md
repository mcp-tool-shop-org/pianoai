# Maker Arc — Phase C: is the "fuller" bass-aware `inferChord` SAFE and ATTAINABLE? (study-swarm)

**Date:** 2026-07-22 · **Class:** research-grounded-advisor protocol ("study-swarm") — 5 parallel retrieval-bound research lanes → synthesis → family-different citation-verification gate → architectural connection · **Trigger:** director asked, at the scope-decision gate for the bass-aware `inferChord` change, to "do a study-swarm to see if the fuller option is safe and attainable" · **$0** (local Ollama + web retrieval; no pods, no publish)

## The decision this grounds

The bass-aware `inferChord` change unlocks the chords the ABC maker emits (`6/m6/9/maj9/m9/dim7`). There are two ways to implement it, and they differ by how much of the song library's `impliedChord` labels move:

- **CONTAINED (bass-exact):** `inferChord` takes the new bass-aware path ONLY when the note set spells *exactly one* chord rooted on the bass (all the deterministic voicer's output ever is). Everything inexact — dense polyphonic textures, partial voicings — falls to the legacy pitch-class best-effort, byte-identical. **Measured: 153 label shifts (1.18%), all bass-exact corrections; the frozen E-R eval baseline unchanged (0 shifts).**
- **FULLER:** always name a measure by the LONGEST chord template that fully matches the pooled pitch-class set, rooted on the bass, on ALL measures including dense ones. **Measured: 5,972 shifts (45.9%).**

The question: **is FULLER safe (does it produce better labels?) and attainable (is there a principled, established method to single-label a dense polyphonic measure that way)?**

## Verdict (grounded + externally verified): NO — fuller is neither safe nor attainable-as-an-improvement. Ship CONTAINED.

All five research lanes independently UNDERCUT the fuller approach, and the fuller move is, specifically, the intersection of three named failure modes in the Automatic Chord Estimation (ACE) literature — applied to exactly the measures where they bite hardest. The contained design is what the literature prescribes.

## Research grounding (the empirical floor)

Findings are retrieval-sourced by five parallel lanes; the load-bearing claims were then re-verified by a **family-different, reasoning-stripped** cross-family panel (see the verification receipt below). Each finding: **claim** — source — implication for the decision.

### Lane A — how ACE actually labels chords (the unit-of-analysis)
1. **State-of-the-art ACE labels sub-bar time segments (frames/beats), not a pooled per-measure bag; temporal smoothing supplies most of the accuracy.** Cho & Bello 2014 (IEEE/ACM TASLP 22:477, DOI:10.1109/TASLP.2013.2295926); Korzeniowski & Widmer 2016 (arXiv:1612.05082); Sheh & Ellis 2003 (ISMIR). → A single-label-per-measure scheme discards the context that carries ACE accuracy; a *pooled bag + template match* is the field's weak baseline, not its method.
2. **Pooled spectral/pitch content misleads templates on rich chords; suppressing non-chord energy is what fixes them (+~12pts on difficult chords).** Mauch & Dixon 2010 (ISMIR, NNLS-Chroma). → Trusting a dense pooled bag to name the richest template is the exact error transcription front-ends were built to prevent.

### Lane B — is the bass a reliable root? (the "root on the lowest note" move)
3. **The bass ≠ the root: field-standard harmony syntax stores root and bass as SEPARATE fields precisely because they differ under inversion.** Harte, Sandler, Abdallah & Gómez 2005 (ISMIR, `root:shorthand/bass`). → Rooting a chord on the measure's lowest note mislabels every inversion.
4. **Canonical computational root-finding infers the root from the pitch-class content, not the lowest note; passing/neighbor tones are flagged ornamental.** Temperley 1997 (Music Perception 15(1):31, DOI:10.2307/40285738); Parncutt 1988 (Music Perception 6(1):65, DOI:10.2307/40285416). → The correct root method is PC-pattern-matching (what the contained design's legacy tier already is); the bass is a weak prior, not a selector.
5. **Supporting inversions/bass measurably LOWERS chord-recall (~30% relative for some systems); the lowest note of a dense measure is frequently a passing/pedal non-chord tone.** Pauwels & Peeters 2013 (ICASSP, DOI:10.1109/ICASSP.2013.6637748); Deng & Kwok 2017 (arXiv:1709.07153). → Forcing the root onto a moving dense-measure bass is the documented accuracy cost, not a gain.

### Lane C — does preferring the RICHEST template help or hurt?
6. **Weighted chord-symbol recall DROPS monotonically as the vocabulary deepens: triads 0.721 → sevenths 0.645 → tetrads 0.588 (~13pts).** Humphrey & Bello 2015 (ISMIR, "Four Timely Insights on ACE," Zenodo:1417549). → "Prefer the longest matching template" optimizes for the lowest-accuracy label class.
7. **The best large-vocabulary model won by being MORE CONSERVATIVE — abstaining from a seventh when it looks unlikely rather than predicting the wrong one; extended chords are rare (6ths 1.5%, sus 2.5%).** McFee & Bello 2017 (ISMIR, Zenodo:1414880); Deng & Kwok 2017 (arXiv:1709.07153). → Aggression toward extensions lowers accuracy; reticence raises it. The fuller rule is aggression by construction.

### Lane D — is a whole measure even one chord? (non-chord tones + harmonic rhythm)
8. **A whole-bar label IS the formally-penalized "under-segmentation" error, and harmonic rhythm routinely beats the barline (Bach chorales ≈1.8 note-events per chord → 2–4 chords per 4-beat bar).** Harte 2010 (PhD thesis QMUL, §8.3.2, directional Hamming distance); Masada & Bunescu 2018 (arXiv:1810.10002). → Single-labeling a dense measure is a named error; making that label *richer* makes it more wrong.
9. **Non-chord tones can't be reliably separated from chord tones by pitch classes alone (F1 0.57, rising to 0.72 only with metric/temporal context), and a non-chord tone can out-salience a real chord tone and flip the template match.** Ju, Condit-Schultz, Arthur & Fujinaga 2017 (DLfM, DOI:10.1145/3144749.3144753); Lee 2006 (ICMC). → Pooled ornaments both fabricate spurious extensions AND land in the least-accurate class; the fuller rule maximizes exposure to both.

### Lane E — can we even VALIDATE "fuller is better"? (no ground truth)
10. **There is no single correct chord label; expert inter-annotator agreement is ~76% on root, ~73% on maj/min, and collapses to ~54% on complex/extended labels — the disagreement lives exactly where fuller operates.** Koops et al. 2019 (JNMR 48(3):232, DOI:10.1080/09298215.2019.1613436 — *retrieval-blocked by the publisher (HTTP 403); corroborated by Ni 2013 and Humphrey & Bello 2015 and the verification panel*); Ni, McVicar, Santos-Rodriguez & De Bie 2013 (IEEE TASLP 21(12):2607, DOI:10.1109/TASL.2013.2280218). → Fuller's changes are inherently unverifiable as "more correct."
11. **The only ground-truth-free safety tests are: does the change preserve root/maj-min agreement, stay key-consistent, and win a judge panel?** Raffel et al. 2014 (mir_eval, ISMIR); de Haas et al. 2008 (Tonal Pitch Step Distance, ISMIR). → This is the yardstick the local probe below applies.

## The local empirical probe (the finding on OUR corpus, $0)

Applied the fuller labeler, the contained labeler, and the legacy labeler to all 13,014 measures of the 120-song library and scored the ground-truth-free proxies from finding 11:

| signal | legacy | contained | fuller |
|---|---|---|---|
| labels diatonic to the song's declared key (key-consistency) | 44.1% | 44.1% | **44.1%** |
| on the 5,972 measures fuller shifts: label in-key | 34.2% (old) | — | **34.1% (fuller)** |

- **Fuller does not improve key-consistency** — 44.1% → 44.1% overall, 34.2% → 34.1% on the very measures it changes (a 5-measure difference). It fails the one available safety test: it is not measurably *better*, and it disturbs the reliable root/maj-min layer (e.g. `Bm7b5 → G9` changes the root) that finding 10 says to leave alone.
- **The measures fuller changes are the ill-posed ones.** Fuller-shifted measures have a **median of 7 distinct pitch classes (50% have >6)**; unshifted measures have a median of 3 (1% have >6). Fuller reclassifies exactly the dense, near-chromatic bars the ACE literature (findings 1, 8, 9) says have no single well-defined chord — and both variants sit at only ~34–44% in-key there, confirming the label is fuzzy regardless of engine.

## Connect to architecture (Step 5)

- **Reject the fuller rule.** "Prefer the longest template that fully fits the pooled bag" is the ACE over-labeling failure (findings 6, 7, 9) applied to the under-segmentation failure (finding 8) via the wrong-root-selector failure (findings 3–5) — on precisely the dense measures where all three bite (local probe: median 7 pcs). It is not safe, and the local probe shows it buys no measurable improvement (finding 11).
- **Keep the contained (bass-exact) design — it is what the literature prescribes.** Tier 2 (legacy) is PC-content pattern-matching, the *correct* root method (finding 4). Tier 1 uses the bass ONLY as the tiebreak in the unambiguous exact-chord/root-position case (finding 3's base rate: in root position the bass IS the root) — the "weak prior/tiebreak, never a forced selector" recommendation of Lane B. It never escalates to a rich label on a dense/ornamented set (the conservatism findings 7 endorse), so it can't over-label.
- **On "attainable":** a *principled* fuller labeler is possible, but it is a different, larger build than the option on the table — it would require sub-bar/beat segmentation, metric-weighted non-chord-tone filtering, and conservative escalation ("default to the simplest template consistent with the metrically-strong tones; escalate only on strong evidence" — the explicit recommendation of Lanes A/C/D). The fuller option AS SPECIFIED (bass + longest over the pooled per-measure bag) is not that, and even the principled version is capped by the no-ground-truth ceiling (finding 10). Not worth the blast radius (45.9% of labels) for an unverifiable, literature-contradicted change.

## Step-4 verification receipt (family-different, reasoning-stripped)

- **Groundedness — the 8 load-bearing claims, cross-family panel** (`ollama_verify_claims`, DeepSeek-v4-pro + GLM-5.2, reasoning-stripped by schema; a Claude-free, disjoint-family panel): **8 CONFIRMED / 0 REFUTED / 0 NEEDS_REVIEW, high confidence.** kimi-k2.7-code excluded (no valid verdicts) → 2/3 served, meeting the ≥2-disjoint-family ensemble requirement; `weak:false`. Run `run_2026-07-22T22-06-13_65da27`.
- **Existence — retrieval oracle** (WebFetch, not model memory): confirmed with correct title/authors/year — Humphrey & Bello 2015 (Zenodo:1417549), McFee & Bello 2017 (Zenodo:1414880), Deng & Kwok 2017 (arXiv:1709.07153), Masada & Bunescu 2018 (arXiv:1810.10002). Koops et al. 2019 retrieval-blocked (tandfonline HTTP 403 + a 404 on a guessed mirror) — surfaced here honestly; its finding is corroborated by two independently-retrieved sources and the panel, and is not the sole support for any architectural choice.
- **HALT conditions:** none triggered (0 fabricated, 0 refuted, ≥2 families served). The protocol's own external-verifier discipline (18/18 standards) was followed: no finding reaches the recommendation ungrounded.

## Bottom line

**The fuller option is not safe and not attainable-as-an-improvement.** It is the ACE over-labeling + under-segmentation + wrong-root failure pattern, applied to the exact measures where a single chord name is ill-defined, and it buys zero measurable improvement on the only ground-truth-free yardstick available — at 30× the blast radius of the contained design. **Ship the contained bass-exact `inferChord`** (153 shifts, all bass-exact corrections, E-R baseline untouched, Gate 1 round-trip green) — it is precisely the "PC-pattern-match root method + bass as a tiebreak only in the unambiguous case" the literature endorses.
