# Handoff 35 — Grok Build to Claude: harmony and compare show their work

**Paste target:** a Claude session with `E:/AI/ai-jam-sessions` open.
**Chunk 34.** Branch `main` @ `3783bd3`. Work uncommitted. I did **not** run the suite.
Regenerated `datasets/jam-actions-v1/` (371; compare 14 → 36) and the v1 SFT files;
v1 tests, probe tests, v0 reproduce. Probe corpus not rewritten. **No pod.** v0 untouched.

`--bare-label` now bares acoustic, harmony, and compare. `--plain-comparison` is
still acoustic-only. Predicates decide the label; the arithmetic is shown, not
trusted.

---

## 1. One harmony and one compare, before and after

User turns did not move.

### Harmony — `harmony:amazing-grace:m40:pass` (gold `verified`)

**Before** (bare label; tool echoed the proposal):

```
tool verify_harmony: { "reharmonization": "[{\"measure\":40,\"intendedChord\":\"Bsus2\",\"voicing\":\"…\"}]" }
assistant: verified
```

**After** (tool carries the check; assistant copies and compares):

```
tool verify_harmony: { "intended": "Bsus2", "detected": "Bsus2", "chromatic": 0, "scored": 17 }
assistant: intended Bsus2, detected Bsus2: same; chromatic 0/17 = 0.000 − 0.2 = −0.200, inside: verified
```

The matching fail (`m40:fail`) is the same shape with the deciding mismatch in
the open: `intended Bsus2, detected Csus2: different; chromatic 0/17 = 0.000 − 0.2 = −0.200, inside: rejected`.
Consonance stays inside; fidelity is the gate that flips the class, which is
what the builder actually computes (melody is the original chord tones, so
chromatic is 0 on both tags).

### Compare — `compare:amazing-grace|auld-lang-syne` (gold `different_key`)

**Before** (bare label; no keys in any tool result):

```
tool song_info: { "id": "amazing-grace", "title": "Amazing Grace" }
tool song_info: { "id": "auld-lang-syne", "title": "Auld Lang Syne" }
tool compare_songs: { "song_a": "amazing-grace", "song_b": "auld-lang-syne" }
assistant: different_key
```

**After**:

```
tool song_info: { "id": "amazing-grace", "title": "Amazing Grace", "key": "Eb major" }
tool song_info: { "id": "auld-lang-syne", "title": "Auld Lang Syne", "key": "F major" }
tool compare_songs: { "key_a": "Eb major", "key_b": "F major" }
assistant: Eb major, F major: different: different_key
```

---

## 2. Tool-less baseline

Unchanged by construction. Harmony and compare user turns did not move; the 22
new compare pairs are train-only. Same script, user turn only, mistral-small:24b,
117 held-out:

| family | tool-less |
|---|---|
| acoustic | **18/54 = 33.3%** |
| chord | 1/7 |
| compare | 1/6 |
| ensemble | 0/3 |
| harmony | 9/14 |
| key_moments | 1/6 |
| measures | 0/9 |
| teaching_goals | 1/9 |
| transpose | 0/9 |
| **total** | **31/117 = 26.5%** |

Probe, user turn only: **acoustic 18/72**.

---

## 3. Prompt-visible gaps

**Harmony.** The verdict is `fidelityPass && consonancePass`. Fidelity is
`inferChord(voicing)` vs the intended symbol; consonance is chromatic/scored
against 0.2. The old tool result echoed the proposal and carried neither
measurement. That is the gap. I put `intended`, `detected`, `chromatic`, and
`scored` in the tool result so the model copies them. I did **not** put
`verified` / `rejected`, `same` / `different`, or `0.2` in the tool — those
stay in the assistant turn. The product `verify_harmony` text report includes
the verdict; the dataset does not copy that, same as acoustic vs a grader.

The second hard gate (consonance) never fails in this builder: the melody is
the original chord tones an octave up, so chromatic is 0 on pass and fail.
I still show the subtraction. Papering it over would have been dropping a
gate the engine actually runs.

**Compare.** Gold is `a.key === b.key`. Neither `song_info` nor `compare_songs`
returned a key; the keys lived only in the library. That is the gap. I put
`key` on each `song_info` (compare family only; transpose's stub is unchanged)
and `key_a` / `key_b` on `compare_songs`. I did **not** put `same_key` /
`different_key` or a boolean in any tool result.

**Held-out thickness.** The 9 test songs have only **3** same-key pairs. That
is the cap without a new song or a straddle. I took every same-key pair the
split allows and matched it with an equal number of different-key pairs:
train **15+15**, test **3+3**. I did not pad test with extra different_key
pairs — that would re-majority the family. Compare 14 → 36. Coverage floors
were not raised (songs/tools/shapes unchanged; majority shape 43.7%).

`--bare-label` leaf diffs: **241** (162 acoustic + 43 harmony + 36 compare),
all last-assistant `.content`. `--plain-comparison`: **162** acoustic only.

---

## 4. Tests and the tree

v1 **45/45**, probe **7/7**, v0 reproduce **4/4**. Rebuild-equals-committed.
Every harmony and compare turn parses; printed quantities equal the tool;
label equals gold and the predicate on those quantities. Acoustic arithmetic
gates unchanged. Both cents signs; two draws; two-sided margin; no kind token;
no prompt-visible threshold; degenerate-gold on `[]`.

SFT: `sft-train 254  sft-test 117  gold-test 117`. Test n stayed 117.

```
 M src/dataset/acoustic-v1/{builder,shown-work,v1.test,probe.test}.ts
 M datasets/jam-actions-v1/          (harmony+compare traces; +22 compare records)
 M experiments/coverage-v1-sft/data/{sft-train,sft-test}.jsonl
?? src/dataset/acoustic-v1/shown-work.ts
?? docs/handoffs/live-environment-35-grok-to-claude.md
```

**Yours:** J18 full verify, the H1/C1 gates, identity scan, baseline.
The Director has not said pod.
