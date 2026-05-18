# jam-actions-v0 Slice 2.5 — URL Verification → `public` Promotion

**Date:** 2026-05-17
**Status:** COMPLETE

---

## Summary

Slice 2.5 externally verified the source/license claim for each of the 10 `public_candidate` songs in the `jam-actions-v0` corpus. Of those:

- **8 songs (115 records) promoted to `public`** — all under CC-BY-SA 3.0 (DE jurisdiction)
- **2 songs (30 records) demoted to `internal`** — provenance claim unsupported by the named source
- **0 stayed at `public_candidate`** — every candidate has a durable evidence-backed disposition
- **0 excluded**

This slice gates public release on Zenodo / HuggingFace. No release occurred.

---

## Per-Song Verdicts

| Song | Pre-Slice 2.5 | Post-Slice 2.5 | License | Version | Evidence URL | Records |
|------|---------------|----------------|---------|---------|--------------|---------|
| Bach Prelude C Major BWV 846 | public_candidate | **public** | CC-BY-SA | 3.0 | http://piano-midi.de/bach.htm | 16 |
| Chopin Nocturne Op. 9 No. 2 | public_candidate | **public** | CC-BY-SA | 3.0 | http://piano-midi.de/chopin.htm | 18 |
| Chopin Prelude E Minor (Op. 28 No. 4) | public_candidate | **public** | CC-BY-SA | 3.0 | http://piano-midi.de/chopin.htm | 12 |
| Clair-de-lune (TEST HOLDOUT) | public_candidate | **public** | CC-BY-SA | 3.0 | http://piano-midi.de/debuss.htm | 12 |
| Debussy Arabesque No. 1 | public_candidate | **internal** | CC-BY-SA | 3.0 | http://piano-midi.de/debuss.htm | 16 |
| Für Elise | public_candidate | **public** | CC-BY-SA | 3.0 | http://piano-midi.de/beeth.htm | 13 |
| Mozart K545 mvt 1 | public_candidate | **public** | CC-BY-SA | 3.0 | http://piano-midi.de/mozart.htm | 16 |
| Pathétique mvt 2 | public_candidate | **public** | CC-BY-SA | 3.0 | http://piano-midi.de/beeth.htm | 16 |
| Satie Gymnopédie No. 1 | public_candidate | **internal** | (none) | (none) | http://piano-midi.de/ | 14 |
| Schumann Träumerei | public_candidate | **public** | CC-BY-SA | 3.0 | http://piano-midi.de/schum.htm | 12 |

Aggregate at the record level: **115 records public** / **30 records internal** / **0 public_candidate** / **0 excluded** = **145 records**.

---

## Demoted Songs — Why

### Satie Gymnopédie No. 1 → `internal`

`http://piano-midi.de/satie.htm` returns **HTTP 418** with a 0-byte body. piano-midi.de does not carry Satie at all: the site's own keyword metadata explicitly enumerates the catalog as Albéniz, Bach, Balakirew, Beethoven, Borodin, Brahms, Burgmueller, Chopin, Clementi, Debussy, Granados, Grieg, Haydn, Liszt, Mendelssohn, Mozart, Mussorgsky, Rachmaninov, Ravel, Schubert, Schumann, Tchaikovsky — **Satie is absent**. The `/midi_files/satie.htm` redirect serves the generic MIDI-files index (same content as the homepage). The deep MIDI URL `/midis/satie/gymnopedie_1.mid` (recorded in `scripts/import-classical.ts`) also returns HTTP 418.

The Slice 2 provenance claim attributing this MIDI to piano-midi.de is unsupported. The MIDI exists in our corpus (3592 bytes, SHA256 `3d9f3a08…`, contains a Track 1 text event "Gymnopedie No.1 by Erik Satie") but its actual upstream is unknown.

**Future slice** can investigate alternate sources (Mutopia Project, IMSLP MIDI section, kunstderfuge.com mirrors) and re-attribute if found; otherwise keep at `internal`.

### Debussy Arabesque No. 1 → `internal`

`http://piano-midi.de/debuss.htm` returns 200 with `Bernd Krueger` + CC-BY-SA 3.0/DE marker (site-level posture confirmed), but the page's content lists only:

- **Suite bergamasque (1905):** Prélude, Menuet, Clair de Lune, Passepied
- **Children's Corner (1908):** six movements

**There is no Arabesque entry on the Debussy page.** Stripped page text is 1623 chars; the words "Arabesque" / "Arabesken" / "Arabesques" don't appear anywhere. The per-song attribution claim is unsupported, matching the locked rule "creator/license claim is unsupported → internal."

The verifier's new "per-song attribution unsupported" decision path fires for this case (page is up + creator + license confirmed, but title fragments are not matched).

Same future-slice investigation path applies as Satie.

---

## Verifier Findings — Real Problems, Not Bandaids

### Finding 1: piano-midi.de has no HTTPS endpoint

Slice 1/2 stamped every record with `arrangement_evidence_url: "https://piano-midi.de/"`. **That URL never worked.** Probing piano-midi.de:443 reveals the server returns plain HTTP bytes when a TLS ClientHello is sent:

```
$ echo "QUIT" | openssl s_client -connect piano-midi.de:443 -servername piano-midi.de
SSL handshake has read 5 bytes and written 1560 bytes
SSL routines:tls_get_more_records:packet length too long
```

Node's `fetch` returns `ERR_SSL_PACKET_LENGTH_TOO_LONG`; Windows Schannel returns `SEC_E_INVALID_TOKEN`. Confirming directly: `curl http://piano-midi.de:443/` returns the same HTML as port 80. The site is HTTP-only — port 443 is a misconfigured plaintext endpoint.

**Slice 2.5 fix:** correct `PIANO_MIDI_DE_URL` in `provenance.ts` from `https://` to `http://`. Update all 145 records' `source_url` and `arrangement_evidence_url` to the canonical HTTP scheme. The Slice 1/2 https:// assumption was a hardcoded error; this is the correction, not a fallback.

### Finding 2: License lives on per-composer pages, not the homepage

The verifier's initial design required the SITE ROOT (`http://piano-midi.de/`) to carry a CC license marker. It doesn't — the homepage has no CC link or "Creative Commons" text. The license marker (`<a rel="license" href="http://creativecommons.org/licenses/by-sa/3.0/de/deed.en">`) lives only on individual composer pages.

**Slice 2.5 fix:** the verifier's `decideVerdict` now treats the composer page as the authoritative per-song license signal; the site root is just a "domain reachable" check. The composer page MUST have a CC license marker for promotion; the site root need not.

### Finding 3: `htmlToText` strips the CC URL out of `<a rel="license" href="...">`

The license URL `creativecommons.org/licenses/by-sa/3.0/de/` encodes the version (`3.0`) unambiguously, but it lives in an `href` attribute. The verifier's `htmlToText` strips all attributes, so the URL is lost before the text-based version parser runs. Result: license version not detected on real piano-midi.de content.

**Slice 2.5 fix:** added `parseLicenseFromCcUrl(rawHtml)` that searches the unstripped HTML for `creativecommons.org/licenses/<slug>/<version>` patterns. URL-derived family + version override text-based detection when present.

### Finding 4: HTTP 418 for missing pages

piano-midi.de returns **HTTP 418** ("I'm a teapot") for URLs that don't exist on the site, instead of the conventional 404. The verifier's hard-failure check covered only 404/410/451 explicitly — 418 fell through to the "transient" path.

**Slice 2.5 fix:** broadened the hard-failure check to all 4xx EXCEPT 408 (request timeout) and 429 (rate-limited). 418 now correctly demotes Satie to `internal`.

### Finding 5: Composer-page titles use piano-midi.de's translation conventions

The verifier's initial `titleFragments` used the canonical / German titles. piano-midi.de uses different conventions:

- Schumann **Träumerei** is listed as **"Reverie"** (English translation), inside section **"Scenes from Childhood, Opus 15"** (not "Kinderszenen")
- Chopin **Prélude in E Minor** is under section **"Préludes, Opus 28"** (not "Op. 28")
- The Bach + Chopin pages use **"Opus 28"** / **"Opus 7"** etc. — not **"Op. 28"** / **"Op.28"**

**Slice 2.5 fix:** updated `titleFragments` for `chopin-prelude-e-minor` and `schumann-traumerei` to include both piano-midi.de's English/Latin variants and the original-language variants.

### Finding 6: Per-song attribution can fail even when site posture is OK

For Debussy Arabesque, the page resolves cleanly: 200, Krueger named, CC-BY-SA 3.0/DE license marker, full general provenance posture is confirmed. But the page text doesn't reference Arabesque anywhere — piano-midi.de simply doesn't carry that work.

**Slice 2.5 fix:** added a new decision branch — when (composer page 200) + (license + creator confirmed) + (title fragments NOT matched), the per-song attribution claim is unsupported and the verdict demotes to `internal`. This matches the locked rule "creator/license claim is unsupported" at per-song granularity, distinct from the page-gone 4xx case.

---

## Schema + Code Changes

### Widened verdict enum (Lock D)

- `src/dataset/provenance.ts` — `Verdict` type now includes `"public"`. The rule engine still cannot emit `"public"`; only the Slice 2.5 URL verifier can.
- `src/dataset/schema.ts` — `RECORD_VERDICTS` was already lenient (had `"public"` from prior schema work); no change needed.

### Verifier module (new)

- `src/dataset/provenance-url-verifier.ts` (~830 lines) — `verifyProvenanceUrl()` + `COMPOSER_PAGES` lookup + license/version parsers + decision logic + `POLITENESS_DEFAULTS`. Polite by construction: 1 req/sec, 10s timeout, 1 retry on 5xx/timeout, second transient failure stays `public_candidate`.
- `src/dataset/provenance-url-verifier.test.ts` — **26 unit tests** (mocked fetch — no real network in tests). Covers all 6+ scenarios from the kickoff plus the new per-song-attribution-unsupported demotion path.

### Runner CLI (new)

- `scripts/verify-dataset-provenance-urls.ts` (~450 lines) — reads `provenance-scan.json`, runs the verifier with live HTTP at polite cadence, writes the 145 record mutations + `provenance-verification.json` + manifest `verdict_summary` update. Built-in manifest guard: refuses to write if `instrument_surfaces.{ai_jam_sessions, vocal_synth_engine}` is missing. Supports `--dry-run` and `--today YYYY-MM-DD` for idempotent re-runs.

---

## Hard Gates — All Green

1. ✅ Pre-flight: working tree clean before Slice, `manifest.instrument_surfaces.{ai_jam_sessions, vocal_synth_engine}` both present
2. ✅ All 1199 pre-existing tests still pass
3. ✅ 26 new verifier unit tests pass (verifier code architectural sound)
4. ✅ Whole-corpus validator: 10 gates green (record_count=145 matches disk; pair-lock verified; train=133/test=12)
5. ✅ Manifest `instrument_surfaces.{ai_jam_sessions, vocal_synth_engine}` blocks present after Slice (diff shows ONLY `verdict_summary` changed)
6. ✅ `splits.json` byte-identical (clair-de-lune still 100% in test holdout — `git diff splits.json` returns 0 lines)
7. ✅ Every record's `record_verdict` is one of `public` / `public_candidate` / `internal` / `excluded`
8. ✅ `provenance-verification.json` schema validates: every candidate appears exactly once
9. ✅ Report summary counts match record-level counts (`8 song-level → 115 record-level public; 2 song-level → 30 record-level internal`)
10. ✅ Every promoted record has non-null `arrangement_license_version`, deeper-than-site-root `arrangement_evidence_url`, and `verifier: "auto-rule-engine+slice2.5-url-verifier"`
11. ✅ No E1/E2/E3 results modified (`evals/*.json` untouched)
12. ✅ Live HTTP runs were polite: verification report shows ≥1s gap between fetches; UA = locked value

Total tests after Slice 2.5: **1225 passing / 0 failing**.

---

## Doctrine Confirmations

- **clair-de-lune** is still the locked test holdout — verdict promoted to `public`, splits unchanged, all 12 records remain in test
- `instrument_surfaces.ai_jam_sessions` + `instrument_surfaces.vocal_synth_engine` blocks intact in manifest (doctrine ratchet #4)
- No corpus modification beyond the 145 surgical provenance-field updates Slice 2.5 explicitly authorized
- No eval results modified
- No new MCP tool / surface changes
- No commits made — pending user authorization

---

## Open Threads for Future Slices

### Re-attribution of Satie + Debussy Arabesque

Both records still exist in the corpus and are usable for training (`training_use_permitted: true`), but cannot be released as `public` until a real upstream source is identified and verified.

Suggested future investigation:
- **Mutopia Project** (mutopiaproject.org) — open MIDI repository, often Satie/Debussy presence
- **IMSLP MIDI section** — usually scores but some MIDI sidecars
- **kunstderfuge.com** — paid but documented
- Inspect the MIDI files for embedded copyright/source metadata events (Satie MIDI only contains a title Track event — no source info)

### License jurisdiction (CC-BY-SA-3.0 DE)

piano-midi.de uses the **German jurisdiction localization** of CC-BY-SA 3.0 (`creativecommons.org/licenses/by-sa/3.0/de/`). For Zenodo / HuggingFace publication, the released dataset's license card should specify CC-BY-SA-3.0-DE (the German port) to honor the original licensing precisely.

### Persistence after Slice 2.5

Slice 2.5 is **idempotent**: re-running the verifier CLI against the same upstream state produces byte-identical records (modulo `verified_at` controlled by `--today`). Any future re-verification (e.g., to detect upstream changes) can run safely without manual cleanup.

---

## Verdict

`jam-actions-v0` has 8 songs (115 records) cleared for public release on Zenodo / HuggingFace. The release blocker is no longer "verify URLs" — it is now "any other Zenodo/HF release-prep step we choose to do." Satie and Debussy Arabesque remain in the corpus as `internal` records, usable for training but not for public distribution until re-attributed.
