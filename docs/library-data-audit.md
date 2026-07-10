# Song Library Data Audit — fragment MIDI sources

**Date:** 2026-07-09
**Trigger:** the Wave D2-A data-quality flag in `docs/harvest-pilot-report.md` ("viva-la-vida's `.mid` is 552 bytes / 4 measures / 38 notes against 12-64KB for every other pop song — flagging here for a future data-audit pass in case siblings elsewhere in the library have the same problem"). This is that pass.

## Method

Every `.mid` in `songs/library/` (120 files, 12 genres) was run through the canonical ingest pipeline (`src/songs/midi/ingest.ts`'s `midiToSongEntry` — the same reader `--analyze` and the registry use), producing bytes / measures / notes per file. Verdicts compare content volume against the known length of each source song, not byte size alone — several small files turned out to be complete transcriptions of genuinely short pieces.

## Finding 1 — viva-la-vida: fragment at source, now FIXED

**Provenance:** `songs/library/pop/viva-la-vida.mid` was downloaded from `https://bitmidi.com/uploads/24946.mid` (see the pop table in `scripts/download-library.ts`). The file was already 552 bytes at the original library commit (`4950b56`, 2026-02-20) — nothing was truncated locally; **bitmidi's upload is itself a 4-measure fragment**, and it is bitmidi's *only* Viva la Vida upload. The download guard (reject < 100 bytes, require `MThd` magic) admits it by design: it is a small but structurally valid MIDI file.

**Fix applied (this audit):**

- Replaced with freemidi.org's full-length transcription (song page `download3-11651-viva-la-vida-coldplay`): **56,559 bytes, 140 measures, 4/4 at 140 BPM, 6,218 notes**, SHA256 `767cbbd38d1081606aec5a1971d647aa05f60e20f42160a4efc0af9dc3255310`. 140 measures at 140 BPM ≈ 4:00 — matching the real song's 4:01 runtime, and in family with pop siblings (someone-like-you: 168 measures; nuvole-bianche: 149).
- freemidi's getter URL needs a browser session (a bare fetch returns HTTP 500), so `download-library.ts`'s entry now records the freemidi URL with a comment: an unattended re-download fails **loudly** instead of silently re-fetching the bitmidi fragment; the library `.mid` is canonical. The config's new `source` field records the same provenance.
- Re-ran `--analyze pop` and wrote a fresh annotation from the real multi-section brief (per the Wave D2-A conventions: detected-key grounding, scorer-safe chord spellings, interval-count → note-count). Key detection on the new file confirms the stated Ab major (statedKeyFit 0.861; detected G# major = the identical pitch center in sharps). Applied via `--apply pop`: **score 100 (A)**, replacing the old honest-but-thin excerpt annotation (89). Pop report: 10/10 ready.
- Full test suite green after the swap (2,481 passed / 1 skipped) and `pnpm typecheck` clean.

## Finding 2 — five more fragment sources (and one borderline)

Same shape, smaller blast radius. Verdicts are content-vs-song-length judgments, measured with the same pipeline:

| File | Bytes | Measures | Notes | Status | Verdict |
|------|-------|----------|-------|--------|---------|
| `new-age/river-flows-in-you.mid` | 617 | 19 | 90 | ready | **Fragment.** The Yiruma piece is ~80+ measures of continuous 16th-note arpeggios; 90 notes over 19 measures is a thin excerpt of the intro. |
| `blues/hoochie-coochie-man.mid` | 783 | 9 | 52 | ready | **Fragment.** 9 measures ≈ the stop-time riff plus one phrase of a ~3-minute song. |
| `film/hedwigs-theme.mid` | 870 | 13 | 82 | ready | **Fragment.** 13 measures ≈ the opening celesta phrase; even the concert piece's A section runs ~24 measures. |
| `latin/agua-de-beber.mid` | 1,855 | 8 | 126 | raw | **Fragment.** An 8-measure loop of a ~2.5-minute song. |
| `soul/whats-going-on.mid` | 1,879 | 8 | 104 | raw | **Fragment.** An 8-measure loop of a ~4-minute song. |
| `latin/mas-que-nada.mid` | 1,905 | 21 | 258 | raw | **Borderline.** 21 dense measures could be the full main-theme statement; still short against the full song. |

**Cleared** (small but complete — no action): `folk/scarborough-fair` (23 measures — a full verse of the trad melody), `folk/greensleeves` (384 notes across many repeats), `folk/simple-gifts` (34 measures), `classical/satie-gymnopedie-no1` (79 measures — the real piece is 78 measures; the file is essentially exact), `rnb/fallin` (25 measures of a 2-chord vamp song), `film/forrest-gump` (43 measures), `folk/sakura-sakura` (38 measures), and everything larger. One odd-shaped non-fragment worth a line: `greensleeves.mid` ingests as 192 measures × 2 notes/measure — likely a time-signature/tempo quirk of the source arrangement, but the melodic content is complete; no action.

## Recommendations

1. **Raw fragments first, before their waves** (`agua-de-beber`, `whats-going-on`, and optionally `mas-que-nada`): replacing a raw file costs one download + validation; replacing a ready file costs a re-annotation too. Latin and soul are pending sub-waves — swap these sources *before* those waves run so the annotations are written once, against real full-length briefs.
2. **Ready fragments as capacity allows** (`river-flows-in-you`, `hoochie-coochie-man`, `hedwigs-theme`): each needs the viva-la-vida treatment — replace, `--analyze`, re-annotate, `--apply`. Not urgent: all three current annotations honestly describe excerpt scope (the Wave D1/D2 harnesses were candid about thin sources), so nothing published is wrong — it is just thinner than the songs deserve. Note the film, jazz, and new-age configs carry uncommitted Wave D2 sub-wave annotation work in the tree as of this audit (this audit touched none of those files); coordinate any swap with that wave's session.
3. **Optional guard upgrade** in `scripts/download-library.ts`: the current guard admits any valid-MIDI file ≥ 100 bytes. A `WARN` (not reject — some short pieces are legitimate) below ~2 KB would surface future fragments at download time. Left unimplemented here: it is a function change, which carries a tests-ship-with-code obligation, and this audit deliberately stayed data-only.

## Follow-up (2026-07-09 session 2) — all five fragments FIXED

All five Finding 2 fragments (and the borderline) were replaced in a follow-up session, raw-first per Recommendation 1. **A finding the size audit could not see:** looking up the original bitmidi upload IDs by name revealed that three of the "fragments" were not short versions of the right song at all — they were loops of *unrelated songs*: `agua-de-beber`'s uploads/4374 is named "Ahmed Romel - Only For You (Arctic Moon Remix)" (trance), `whats-going-on`'s uploads/72668 is "Mat ft Jay P - Take Me High", and `mas-que-nada`'s uploads/72364 is "mario2.mid". This resolves Finding 2's "borderline" verdict on mas-que-nada: its 21 dense measures were never the main-theme statement. Replacement candidates were therefore identity-verified (embedded MIDI trackName/lyric/copyright meta events + instrumentation + runtime vs. the recording), not just size-checked, before swapping.

| File | New source | New stats | SHA256 (prefix) | Annotation |
|------|-----------|-----------|-----------------|------------|
| `latin/agua-de-beber.mid` | midisfree.com (Jobim, bossa guitar+flute) | 10,147 B / 86 measures / 1,129 notes / 3:25 | `9cee7d14` | raw — latin wave pending |
| `soul/whats-going-on.mid` | freemidi.org getter-5012 (Marvin Gaye) | 63,189 B / 50 measures / 9,893 notes / 3:52 (record: 3:53) | `3a230387` | raw — soul wave pending |
| `latin/mas-que-nada.mid` | freemidi.org getter-8898 (Mendes feat. Black Eyed Peas 2006 arrangement of the Jorge Ben Jor song — the only full-length transcription on the sanctioned sources) | 121,103 B / 111 measures / 14,306 notes / 4:22 | `4459fb37` | raw — latin wave pending |
| `blues/hoochie-coochie-man.mid` | bitmidi uploads/58185 (band transcription, meta names "Hoochie Coochie Man" / "Muddy Waters"; directly re-fetchable) | 20,267 B / 51 measures (12/8) / 3,183 notes / 3:04 | `8fda33e3` | re-annotated, **score 100 (A)** (was 98 vs. fragment) |
| `new-age/river-flows-in-you.mid` | freemidi.org getter-15836 (solo piano) | 7,654 B / 47 measures / 814 notes / 2:45 | `7b1097a6` | re-annotated, **score 100 (A)**; new file confirms stated A major (statedKeyFit 0.856) |
| `film/hedwigs-theme.mid` | freemidi.org getter-22658 (full concert-length) | 132,372 B / 409 measures (3/8) / 12,849 notes / 5:01 | `7b5392f0` | re-annotated, **score 98 (A)**; E minor fit 0.652, detected C major = relative-major blur |

Each `scripts/download-library.ts` entry carries the updated URL + a provenance comment; each config gained a `source` field. freemidi getters and the midisfree WPDM link still fail loudly on a bare unattended fetch (no session cookie), so the library `.mid` files remain canonical — same posture as the viva-la-vida fix. (Operational note: freemidi's getter DOES work scripted with a two-step cookie-jar fetch — visit `download3-<id>-<slug>` with `-c`, then `getter-<id>` with `-b` + Referer — it is only the cookie-less single fetch that 500s.) All three re-annotations were pre-scored through `scoreAnnotation` before `--apply` (first-pass 100/91/94, polished to 100/100/98 — the two 83-specificity scores were each one note-name reference short, and river hit the pilot's known base-form-verb regex quirk: "teaches"/"shows" don't match `\bteach\b`/`\bshow\b`). Full suite 2,481 passed / 1 skipped; `pnpm typecheck` clean; blues, new-age, and film reports all 10/10 ready; latin and soul untouched at raw for their pending waves.

One observation left for a future pass: `hoochie-coochie-man`'s config still says `difficulty: "beginner"` — defensible for the old 9-measure riff excerpt, questionable for a full 51-measure 12/8 band transcription. Difficulty fields were out of this session's ownership (the `--apply` harness writes only `status` + `musicalLanguage`).

## What this audit is NOT

- Not a licensing/provenance-rules pass — that is `scripts/scan-dataset-provenance.ts`'s job, and none of the touched files are in the jam-actions-v0 dataset records (verified: no dataset record references viva-la-vida).
- Not a musical-accuracy review of the six sources' *content* (wrong-note-level fidelity vs. the recordings was out of scope; only content volume was judged).
- ~~Not a fix for the five remaining fragments — those are enumerated, sized, and prioritized above, but deliberately left for coordinated swaps.~~ *(Superseded: the follow-up section above records the completed swaps.)*
