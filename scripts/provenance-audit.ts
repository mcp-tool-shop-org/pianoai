#!/usr/bin/env npx tsx
// ─── Library Provenance Audit ────────────────────────────────────────────────
//
// Writes a `provenance` block into every songs/library/<genre>/<id>.json (and
// every quarantined song) from three sources of evidence:
//
//   1. the download URL recorded per song in scripts/download-library.ts
//      (parsed from that file's text — one source of truth, not a copy);
//   2. the source site's terms, fetched 2026-09-09 and quoted verbatim in
//      HOST_TERMS below, with the URL they were read from;
//   3. the MIDI file's own text/copyright meta events (FF 01–07), read by
//      src/songs/midi/meta.ts and snapshotted by src/songs/provenance.ts.
//
// The judgment the evidence supports — who made the arrangement, which
// licence applies, whether the file is the song its JSON names — is the
// SONG_FACTS table. Everything else in the block is derived, so re-running
// this script reproduces every block byte for byte. `verifier` is always the
// evidence (a URL and/or the file's own events), never a person or a program.
//
// src/songs/provenance.test.ts re-derives the mechanical half from the bytes
// and fails when a block no longer describes the file beside it.
//
// Usage:
//   npx tsx scripts/provenance-audit.ts            # dry run: report, write nothing
//   npx tsx scripts/provenance-audit.ts --write    # write provenance blocks
//   npx tsx scripts/provenance-audit.ts --write --quarantine
//                                                  # ...and move `contradicts` songs
//                                                  # to songs/quarantine/<genre>/
//   npx tsx scripts/provenance-audit.ts --table    # print the markdown audit table
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readProvenanceEvidence, textNames, titleOverlaps } from "../src/songs/provenance.js";
import type { ArrangementLicense, CreditedParty, Provenance, TitleVerdict } from "../src/songs/config/schema.js";
import { ProvenanceSchema } from "../src/songs/config/schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const LIBRARY_DIR = join(ROOT, "songs", "library");
const QUARANTINE_DIR = join(ROOT, "songs", "quarantine");
const DOWNLOAD_SCRIPT = join(__dirname, "download-library.ts");

export const VERIFIED_AT = "2026-09-09";

// ─── 1. Download URLs, parsed from download-library.ts ──────────────────────

/** id → downloadUrl, read from the LibraryImport entries in download-library.ts. */
export function parseDownloadUrls(source: string): Map<string, string> {
  const out = new Map<string, string>();
  const re =
    /\{\s*midiFile:\s*"[^"]+",\s*downloadUrl:\s*"([^"]+)",\s*config:\s*(?:raw\("([^"]+)"|\{\s*id:\s*"([^"]+)")/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) out.set(m[2] ?? m[3], m[1]);
  return out;
}

// ─── 2. Site terms, fetched 2026-09-09 ──────────────────────────────────────

interface HostTerms {
  license: ArrangementLicense;
  terms_url: string;
  terms_quote: string;
  /** Used when the file names nobody. */
  default_creator: string;
}

const HOST_TERMS: Record<string, HostTerms> = {
  "piano-midi.de": {
    license: "CC-BY-SA-3.0-DE",
    terms_url: "http://piano-midi.de/copy.htm",
    terms_quote:
      "The MIDI, audio(MP3, OGG) and video files of Bernd Krueger are licensed under the cc-by-sa Germany License. [links http://creativecommons.org/licenses/by-sa/3.0/de/deed.en] This means, that you can use and adapt the files, as long as you attribute to the copyright holder Name: Bernd Krueger Source: http://www.piano-midi.de",
    default_creator: "Bernd Krueger",
  },
  "www.mutopiaproject.org": {
    license: "Public-Domain",
    terms_url: "https://www.mutopiaproject.org/legal.html",
    terms_quote:
      "Public Domain: The contributor of this music has dedicated their contribution into the public domain. You can do what you like with this music - print it out, sell it, change it, distribute it, record it, and perform it, etc.",
    default_creator: "Mutopia Project typesetter (LilyPond)",
  },
  "bitmidi.com": {
    license: "unknown",
    terms_url: "https://bitmidi.com/about",
    terms_quote:
      "Serving 113,229 MIDI files curated by volunteers around the world. [...] I searched and found a .zip file with 100K+ MIDI files that someone posted to Reddit. (No licence is stated anywhere on the site; the only other page is /privacy.)",
    default_creator: "unknown — the file names no creator and bitmidi attributes none",
  },
  "www.midiworld.com": {
    license: "unknown",
    terms_url: "https://www.midiworld.com/faq/",
    terms_quote:
      "Due to copyright issues we can not publish any pop/rock/game music or commercial MIDI / MP3 files. [footer: Copyright © 1995-2024 MIDIWORLD All rights reserved] (No licence is granted for the contributed files.)",
    default_creator: "unknown — the file names no creator and midiworld attributes none",
  },
  "www.mfiles.co.uk": {
    license: "no-redistribution",
    terms_url: "https://www.mfiles.co.uk/copyright.htm",
    terms_quote:
      "Music Files Ltd holds copyrights on most of the material within the mfiles site, specifically on musical arrangements (whether sheet music, midi or mp3 formats) [...] Our music and other material must never be redistributed without permission, either as is or adapted in any way.",
    default_creator: "Music Files Ltd (mfiles.co.uk) — arranger not named in the file",
  },
  "www.ragtimemusic.com": {
    license: "all-rights-reserved",
    terms_url: "https://www.ragtimemusic.com/",
    terms_quote:
      "Copyright 1994-2001 by Colin D. MacDonald All rights reserved. [in the file: All rights reserved. This file is for personal use only. Rights granted to disseminate in original unaltered form.]",
    default_creator: "Colin D. MacDonald",
  },
  "freemidi.org": {
    license: "unknown",
    terms_url: "https://freemidi.org/about",
    terms_quote:
      "free midi is about freedom and free midi songs. (User-uploaded; no licence is stated anywhere on the site.)",
    default_creator: "unknown — the file names no creator and freemidi attributes none",
  },
  "www.mididb.com": {
    license: "all-rights-reserved",
    terms_url: "https://www.mididb.com/",
    terms_quote:
      "Free MIDI Files on MIDIdb.com are demo's with all instruments included. [...] Get the full MIDI File - Professional MIDI File at Hit Trax MIDI Files. Permission granted by the copyright owners to download demo files on MIDIdb.com. [in the file's lyric track: All rights reserved. Not for broadcast or transmission of any kind. DO NOT DUPLICATE. NOT FOR RENTAL.]",
    default_creator: "HitTrax MIDI Files / MMP Sequencing (commercial demo)",
  },
  "midisfree.com": {
    license: "unknown",
    terms_url: "https://midisfree.com/terms-and-conditions/",
    terms_quote:
      "we just share what is available on the network. We track and republish what is already available for free on the net as can be found using google and other search engines. If any of your work has been published and you want to request a removal please enter the contact page.",
    default_creator: "unknown — the file names no creator and midisfree attributes none",
  },
};

const PIANO_MIDI = HOST_TERMS["piano-midi.de"];
const MFILES = HOST_TERMS["www.mfiles.co.uk"];

// Krueger's files spell his name both ways; each file's list is what that file says.
const KRUEGER_UE = { name: "Bernd Krueger", evidence: "midi-meta" } as const;
const KRUEGER_U = { name: "Bernd Krüger", evidence: "midi-meta" } as const;

function mutopia(id: number, typesetter: string, midUrl: string): Partial<SongFacts> {
  const page = `https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=${id}`;
  return {
    source_url: midUrl,
    creator: `${typesetter} (Mutopia typesetter, LilyPond)`,
    license: "Public-Domain",
    terms_url: page,
    terms_quote: "Copyright: Public Domain (piece page); " + HOST_TERMS["www.mutopiaproject.org"].terms_quote,
    parties: [
      { name: "GNU LilyPond", evidence: "midi-meta" },
      { name: typesetter, evidence: page },
    ],
  };
}

// ─── 3. The audit's judgment, per song ──────────────────────────────────────

interface SongFacts {
  /** Overrides the parsed download URL (e.g. the Mutopia replacements of 2026-07). */
  source_url?: string;
  creator?: string;
  license?: ArrangementLicense;
  terms_url?: string;
  terms_quote?: string;
  parties?: CreditedParty[];
  verdict?: TitleVerdict;
  aliases?: string[];
  title_note?: string;
  duplicate_of?: string;
  quarantine?: { actual_piece: string; reason: string };
  notes?: string;
  /** Replaces a false `source` string in the config with what the evidence says. */
  source_field?: string;
}

const meta = (name: string): CreditedParty => ({ name, evidence: "midi-meta" });

const MISLABELLED = "the file's own meta events name a different piece";

const SONG_FACTS: Record<string, SongFacts> = {
  // ── classical ──
  "fur-elise": { creator: "Bernd Krueger (piano-midi.de, 2004, edition 2012-08-30)", parties: [KRUEGER_UE, KRUEGER_U], verdict: "matches" },
  "clair-de-lune": { creator: "Bernd Krueger (piano-midi.de, 1998, edition 2011-08-20)", parties: [KRUEGER_U], verdict: "matches" },
  "bach-prelude-c-major-bwv846": { creator: "Bernd Krueger (piano-midi.de, 1996, edition 2004-09-25)", parties: [KRUEGER_UE, KRUEGER_U], verdict: "matches" },
  "mozart-k545-mvt1": { creator: "Bernd Krueger (piano-midi.de, 2006, edition 2013-09-23)", parties: [KRUEGER_UE], verdict: "matches" },
  "satie-gymnopedie-no1": {
    ...mutopia(37, "Evin Robertson", "https://www.mutopiaproject.org/ftp/SatieE/gymnopedie_1/gymnopedie_1.mid"),
    notes: "download-library.ts still lists the original piano-midi.de URL; the bytes were replaced from Mutopia in commit 03a005a (2026-07) because the piano-midi.de stamp could not be verified.",
  },
  "debussy-arabesque-no1": {
    ...mutopia(1777, "Keith OHara", "https://www.mutopiaproject.org/ftp/DebussyC/L66/debussy_Arabesque_1/debussy_Arabesque_1.mid"),
    notes: "download-library.ts still lists the original bitmidi URL; the bytes were replaced from Mutopia in commit 03a005a (2026-07).",
  },
  "pathetique-mvt2": {
    verdict: "matches",
    source_field: "midiworld.com (https://www.midiworld.com/midis/other/beethoven/pathet2.mid); arranger not named in the file; the site grants no licence — see provenance",
    notes: "The config's former `source` string credited Bernd Krueger / piano-midi.de; the file carries no Krueger copyright event and was downloaded from midiworld. Corrected 2026-09-09.",
  },
  "chopin-nocturne-op9-no2": {
    source_field: "midiworld.com (https://www.midiworld.com/midis/other/chopin/chno0902.mid); the file carries no meta events at all; the site grants no licence — see provenance",
    notes: "The config's former `source` string credited Bernd Krueger / piano-midi.de; the file has no text or copyright events and was downloaded from midiworld. Corrected 2026-09-09.",
  },
  "schumann-traumerei": {
    creator: "Robert Finley (named in the file; role not stated)",
    parties: [meta("Robert Finley")],
    verdict: "matches",
    aliases: ["Traumeri"],
    title_note: "the file spells the title 'Traumeri'",
    source_field: "midiworld.com (https://www.midiworld.com/midis/other/schumann/traumeri.mid); file names Robert Finley; the site grants no licence — see provenance",
    notes: "The config's former `source` string credited Bernd Krueger / piano-midi.de; the file names Robert Finley and was downloaded from midiworld. Corrected 2026-09-09.",
  },
  "chopin-prelude-e-minor": {
    source_field: "bitmidi.com (https://bitmidi.com/uploads/86322.mid); anonymous General MIDI file; no licence chain — see provenance",
    notes: "The config's former `source` string credited Bernd Krueger / piano-midi.de; the file is an anonymous GM sequence downloaded from bitmidi. Corrected 2026-09-09.",
  },
  // ── ragtime ──
  "the-entertainer": { ...mutopia(263, "Chris Sawer", "https://www.mutopiaproject.org/ftp/JoplinS/entertainer/entertainer.mid"), verdict: "matches" },
  "maple-leaf-rag": mutopia(23, "Chris Sawer", "https://www.mutopiaproject.org/ftp/JoplinS/maple/maple.mid"),
  "the-easy-winners": mutopia(352, "Tom Harke", "https://www.mutopiaproject.org/ftp/JoplinS/winners/winners.mid"),
  "elite-syncopations": mutopia(1540, "Benjamin Bloomfield", "https://www.mutopiaproject.org/ftp/JoplinS/EliteSyncopations/EliteSyncopations.mid"),
  "solace": mutopia(482, "Magnus Lewis-Smith", "https://www.mutopiaproject.org/ftp/JoplinS/solace/solace.mid"),
  "pineapple-rag": mutopia(1899, "Coyau", "https://www.mutopiaproject.org/ftp/JoplinS/PineappleRag/PineappleRag.mid"),
  "peacherine-rag": mutopia(335, "Antonio Palamà", "https://www.mutopiaproject.org/ftp/JoplinS/peacherine/peacherine.mid"),
  "bethena": mutopia(463, "Magnus Lewis-Smith", "https://www.mutopiaproject.org/ftp/JoplinS/bethena/bethena.mid"),
  "gladiolus-rag": {
    creator: "Colin D. MacDonald (sequence, 1994; performance copyright 1998), edited by Greenfield Bowie (1998)",
    parties: [meta("Colin D. MacDonald"), meta("Greenfield Bowie"), meta("Jos. W. Stern & Co.")],
    verdict: "matches",
    notes: "The 1907 'Jos. W. Stern & Co.' copyright event is the original publisher of Joplin's composition, which is public domain; the sequence itself is MacDonald's and reserved.",
  },
  "weeping-willow": {
    creator: "Colin D. MacDonald (sequence, 1998; performance copyright 1998)",
    parties: [meta("Colin D. MacDonald"), meta("Val. A. Reis Music Co")],
    verdict: "matches",
    notes: "The 1903 'Val. A. Reis Music Company' copyright event is the original publisher of Joplin's composition, which is public domain; the sequence itself is MacDonald's and reserved.",
  },
  // ── folk ──
  "greensleeves": {
    creator: "Jim Paterson (mfiles.co.uk arrangement, re-uploaded to bitmidi)",
    license: "no-redistribution",
    terms_url: MFILES.terms_url,
    terms_quote: MFILES.terms_quote,
    parties: [meta("Jim Paterson")],
    verdict: "matches",
  },
  "scarborough-fair": {
    creator: "Jim Paterson (mfiles.co.uk arrangement, re-uploaded to bitmidi)",
    license: "no-redistribution",
    terms_url: MFILES.terms_url,
    terms_quote: MFILES.terms_quote,
    parties: [meta("Jim Paterson")],
    verdict: "contradicts",
    quarantine: {
      actual_piece: "Greensleeves (Traditional), Jim Paterson's mfiles arrangement — a second copy, byte-different from folk/greensleeves but with the same title, arranger and instrumentation events",
      reason: MISLABELLED,
    },
  },
  "the-water-is-wide": {
    creator: "L. Roberts (sequence, per the file)",
    parties: [meta("L. Roberts")],
    verdict: "contradicts",
    quarantine: {
      actual_piece: "The Glendy Burk (Stephen Foster, 1860), sequenced by L. Roberts",
      reason: MISLABELLED,
    },
  },
  "shenandoah": {
    creator: "Benjamin Robert Tubb (sequence, 2000, pdmusic.org) of Denes Agay's 1975 piano arrangement",
    parties: [meta("Benjamin Robert Tubb"), meta("Denes Agay")],
    verdict: "matches",
    notes: "The file claims 'This Arrangement Copyright ©2000 by Benjamin Robert Tubb'; the terms of pdmusic.org were not verified, so the licence stays unknown.",
  },
  "sakura-sakura": { verdict: "matches" },
  "simple-gifts": { notes: "The file carries no meta events; mfiles' copyright page is the only evidence for the arranger and it names Music Files Ltd, not a person." },
  // ── blues ──
  "blues-in-the-night": {
    parties: [meta("Paula Abdul")],
    verdict: "contradicts",
    quarantine: {
      actual_piece: "Blowing Kisses in the Wind (Paula Abdul) — the file's track names are the song title and 'As Performed by: Paula Abdul'",
      reason: MISLABELLED,
    },
  },
  "born-under-a-bad-sign": {
    creator: "TUNE 1000 CORP. (karaoke file, 1994)",
    license: "all-rights-reserved",
    parties: [meta("TUNE 1000 CORP."), meta("[JJM]")],
    verdict: "contradicts",
    quarantine: {
      actual_piece: "Bandido (Miguel Bosé) — a Spanish-language TUNE 1000 karaoke file (@TBANDIDO, @TM.Bosé/E.Aldrighetti/O.Avosadro/S.Cossu)",
      reason: MISLABELLED,
    },
  },
  "red-house": {
    verdict: "contradicts",
    quarantine: {
      actual_piece: "probably Jailhouse Rock — the file's only title-class event is the track name 'Jail Hous'",
      reason: "the file's only title event names a different song; nothing in the file says Red House or Hendrix",
    },
  },
  "crossroad-blues": { creator: "IFNI MIDI MUSIC (www.ifni.com)", parties: [meta("IFNI MIDI MUSIC")], verdict: "matches" },
  "hoochie-coochie-man": { verdict: "matches", notes: "'Muddy Waters' in the file is a performer credit, not an arranger." },
  "stormy-monday": { verdict: "matches", title_note: "identified by its lyric track; the file has no title event" },
  "sweet-home-chicago": { creator: "Adamantine Luster (named in the file's marker, with a phone number and FidoNet address)", parties: [meta("Adamantine Luster")], verdict: "matches" },
  "st-louis-blues": { verdict: "matches", title_note: "the only text is the code '0586LOUI' — an eight-character title code, read as St. Louis" },
  // ── jazz ──
  "blue-bossa": { creator: "Devian Zikri (arranged by, per the file)", parties: [meta("Devian Zikri")], verdict: "matches" },
  "fly-me-to-the-moon": {
    creator: "GaryW0001 (transcribed and sequenced for GM, per the file) after Sammy Nestico's arrangement; the file marks '©1995 Blue Max Distribution'",
    license: "all-rights-reserved",
    parties: [meta("GaryW0001"), meta("Sammy Nestico"), meta("Blue Max Distribution")],
    verdict: "matches",
  },
  "take-the-a-train": { creator: "MdB Software (copyright event, 1994)", license: "all-rights-reserved", parties: [meta("MdB Software")], verdict: "matches" },
  // ── pop ──
  "all-of-me": { creator: "Geoffrey Carter (karaoke file, 2014)", parties: [meta("Geoffrey Carter")], verdict: "matches" },
  "someone-like-you": { creator: "MidiComp (copyright event)", license: "all-rights-reserved", parties: [meta("MidiComp")], verdict: "matches" },
  "someone-you-loved": {
    creator: "MdB Software (copyright event, 1994)",
    license: "all-rights-reserved",
    parties: [meta("MdB Software")],
    verdict: "contradicts",
    quarantine: {
      actual_piece: "Living on My Own (Freddie Mercury, 1985) — the file's title event; a 1994 file cannot be Lewis Capaldi's 2018 song",
      reason: MISLABELLED,
    },
  },
  "clocks": { verdict: "matches" },
  "let-it-be": { verdict: "matches" },
  "viva-la-vida": {
    creator: "unnamed NoteWorthy Composer user (the copyright template was left unfilled: 'Copyright © <Year> by <Name>')",
    parties: [meta("<Name>")],
    verdict: "matches",
  },
  // ── rock ──
  "baba-oriley": { verdict: "matches" },
  "layla-unplugged": { creator: "Music Sales Ltd (copyright event, 1993)", license: "all-rights-reserved", parties: [meta("Music Sales Ltd")], verdict: "matches" },
  "november-rain": { creator: "Anthony Peters (By:, per the file)", parties: [meta("Anthony Peters")], verdict: "matches" },
  "stairway-to-heaven": { creator: "Uwe Trempelmann (karaoked by, per the file)", parties: [meta("Uwe Trempelmann")], verdict: "matches" },
  // ── rnb ──
  "fallin": {
    creator: "MMP Sequencing / HitTrax MIDI Files (copyright events, 2008) — commercial demo",
    parties: [meta("HitTrax MIDI Files"), meta("MMP Sequencing")],
    title_note: "the lyric track is a rights notice, not lyrics; no title event",
  },
  "halo": { verdict: "matches" },
  "i-will-always-love-you": { verdict: "matches" },
  "if-i-aint-got-you": { creator: "Don Carroll (sequenced by, Houston, Texas)", parties: [meta("Don Carroll")] },
  "killing-me-softly": { creator: "David Liu (named in the file; converted with W2M)", parties: [meta("David Liu")], verdict: "matches" },
  "no-one": { verdict: "matches" },
  "ordinary-people": {
    creator: "Tran Tracks Inc. (copyright event, 1992)",
    license: "all-rights-reserved",
    parties: [meta("TRAN TRACKS INC.")],
    verdict: "contradicts",
    quarantine: {
      actual_piece: "Johnny B. Goode (Chuck Berry) — the file's marker and track name; a 1992 file cannot be John Legend's 2004 song",
      reason: MISLABELLED,
    },
  },
  "superstition": { verdict: "matches", title_note: "the track name 'SUPERSTI' is the title truncated to eight characters" },
  // ── soul ──
  "dock-of-the-bay": { verdict: "matches", title_note: "the only text is the code '7861DOCK'" },
  "lean-on-me": { verdict: "matches" },
  "my-girl": { verdict: "matches" },
  "stand-by-me": { verdict: "matches" },
  // ── latin ──
  "black-orpheus": { verdict: "matches", aliases: ["Carnival"], title_note: "the file's track name is 'Carnival'; the song is 'Manhã de Carnaval', the theme of the film Black Orpheus" },
  "mas-que-nada": { verdict: "matches" },
  "perfidia": { verdict: "matches" },
  "wave": { creator: "Pedro A. Zaniolo (December 1996, per the file)", parties: [meta("Pedro A. Zaniolo")], verdict: "matches" },
  // ── film ──
  "cinema-paradiso": {
    creator: "Bernd Krueger (piano-midi.de, 1999) — a piano-midi.de file re-uploaded to bitmidi",
    license: PIANO_MIDI.license,
    terms_url: PIANO_MIDI.terms_url,
    terms_quote: PIANO_MIDI.terms_quote,
    parties: [KRUEGER_U],
    verdict: "contradicts",
    quarantine: {
      actual_piece: "Chopin, Étude Op. 10 No. 5 in G-flat major ('Black Keys') — Bernd Krueger's piano-midi.de sequence, per its title, copyright and edition events",
      reason: MISLABELLED,
    },
  },
  "forrest-gump": { creator: "Rick Ho (sequenced by, per the file)", parties: [meta("Rick Ho")] },
  "hedwigs-theme": {
    creator: "'Registered User' (NoteWorthy Composer, 2002; the file claims all rights reserved)",
    license: "all-rights-reserved",
    parties: [meta("Registered User")],
    verdict: "matches",
    aliases: ["Harry Potter"],
  },
  "pink-panther": { creator: "D.W.Barnes (sequence by, per the file)", parties: [meta("D.W.Barnes")] },
  // ── new-age ──
  "divenire": {
    parties: [meta("gregor_rozman")],
    verdict: "contradicts",
    quarantine: {
      actual_piece: "an unidentified piece whose title event reads 'Hades awaits even the bravest of mortals someday...' (gregor_rozman@hotmail.com), scored for tambourine, sitar, harp, timpani and 'Lava bubble' — not Einaudi's Divenire",
      reason: MISLABELLED,
    },
  },
  "experience": {
    creator: "Jeff Copperthite (FFT Battle Music Project, per the file)",
    parties: [meta("Jeff Copperthite")],
    verdict: "contradicts",
    quarantine: {
      actual_piece: "'Capture Ovelia!' from Final Fantasy Tactics (Hitoshi Sakimoto), sequenced by Jeff Copperthite — the file's own title events",
      reason: MISLABELLED,
    },
  },
  "kiss-the-rain": {
    creator: "Henry Choi and Mike Doyle (Roland MT-32 sequence, per the file)",
    parties: [meta("Henry Choi"), meta("Mike Doyle")],
    verdict: "contradicts",
    quarantine: {
      actual_piece: "Just Can't Get Enough (Depeche Mode) — the file's text events name it twice",
      reason: MISLABELLED,
    },
  },
  "opening-glassworks": {
    verdict: "contradicts",
    quarantine: {
      actual_piece: "Livre pra Viver (Pedro Mariano) — the file's marker and track names",
      reason: MISLABELLED,
    },
  },
  "metamorphosis-two": {
    title_note: "no title event; the track names (BATERIA, BAJO, TROMPETA, TROMBON, BRASS, DX) describe a brass-band arrangement, which is hard to square with Glass's solo-piano piece — identity unverified either way",
  },
  "nuvole-bianche-na": { duplicate_of: "film/nuvole-bianche", notes: "Byte-identical to film/nuvole-bianche (same bitmidi upload 70390)." },
  "river-flows-in-you": { verdict: "matches" },
  "watermark": {
    creator: "unknown — the file's 'Sequenced by:' field says 'Enya', which is not credible as a sequencer credit",
    parties: [meta("Enya")],
    verdict: "matches",
  },
};

/** Songs whose JSON says one thing and whose bytes say another. Derived from SONG_FACTS; exported for download-library.ts's guard test. */
export const CONTRADICTING_IDS: readonly string[] = Object.entries(SONG_FACTS)
  .filter(([, f]) => f.verdict === "contradicts")
  .map(([id]) => id)
  .sort();

// ─── Build ───────────────────────────────────────────────────────────────────

interface SongOnDisk {
  genre: string;
  id: string;
  dir: string;
  config: Record<string, unknown>;
  bytes: Buffer;
}

function listSongs(root: string): SongOnDisk[] {
  if (!existsSync(root)) return [];
  const out: SongOnDisk[] = [];
  // Only genre directories: songs/library/.npmignore (generated) also lives at this level.
  for (const genre of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const dir = join(root, genre);
    for (const f of readdirSync(dir).sort()) {
      if (!f.endsWith(".json")) continue;
      const id = f.slice(0, -5);
      const midi = join(dir, `${id}.mid`);
      if (!existsSync(midi)) throw new Error(`${genre}/${id}: JSON without a .mid`);
      out.push({ genre, id, dir, config: JSON.parse(readFileSync(join(dir, f), "utf8")), bytes: readFileSync(midi) });
    }
  }
  return out;
}

export interface BuiltProvenance {
  block: Provenance;
  problems: string[];
}

export function buildProvenance(song: SongOnDisk, downloadUrl: string): BuiltProvenance {
  const facts = SONG_FACTS[song.id] ?? {};
  const sourceUrl = facts.source_url ?? downloadUrl;
  const host = new URL(sourceUrl).host;
  const terms = HOST_TERMS[host];
  if (!terms) throw new Error(`${song.id}: no terms recorded for host ${host}`);
  const evidence = readProvenanceEvidence(song.bytes);
  const parties = facts.parties ?? [];
  const verdict: TitleVerdict = facts.verdict ?? "no-title-in-file";
  const termsUrl = facts.terms_url ?? terms.terms_url;

  const verifierParts = [termsUrl];
  if (evidence.creditEvents.length) verifierParts.push(`midi meta events (sha256 ${evidence.sha256.slice(0, 12)}…)`);
  if (parties.some((p) => p.evidence !== "midi-meta")) verifierParts.push(...parties.filter((p) => p.evidence !== "midi-meta").map((p) => p.evidence));

  const block: Provenance = {
    schema: 1,
    source_url: sourceUrl,
    source_site: host,
    arrangement_creator: facts.creator ?? terms.default_creator,
    arrangement_license: facts.license ?? terms.license,
    terms_url: termsUrl,
    terms_quote: facts.terms_quote ?? terms.terms_quote,
    verified_at: VERIFIED_AT,
    verifier: [...new Set(verifierParts)].join("; "),
    midi_sha256: evidence.sha256,
    midi_title_events: evidence.titleEvents,
    midi_credit_events: evidence.creditEvents,
    ...(evidence.lyricHead ? { midi_lyric_head: evidence.lyricHead } : {}),
    credited_parties: parties,
    title_verdict: verdict,
    ...(facts.aliases ? { title_aliases: facts.aliases } : {}),
    ...(facts.title_note ? { title_note: facts.title_note } : {}),
    ...(facts.duplicate_of ? { duplicate_of: facts.duplicate_of } : {}),
    ...(facts.quarantine ? { quarantine: { at: VERIFIED_AT, ...facts.quarantine } } : {}),
    ...(facts.notes ? { notes: facts.notes } : {}),
  };

  // Self-check: the same rules src/songs/provenance.test.ts enforces.
  const problems: string[] = [];
  const parsed = ProvenanceSchema.safeParse(block);
  if (!parsed.success) problems.push(...parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`));
  const cfg = song.config as { title: string };
  const overlaps = titleOverlaps({ title: cfg.title, aliases: facts.aliases }, evidence);
  if (verdict === "matches" && !overlaps) problems.push("verdict 'matches' but no title-class event or lyric shares a token with the JSON title");
  if (verdict === "no-title-in-file" && overlaps) problems.push("verdict 'no-title-in-file' but the file does name the song — use 'matches'");
  if (verdict === "contradicts" && !facts.quarantine) problems.push("verdict 'contradicts' needs a quarantine entry");
  for (const p of parties.filter((p) => p.evidence === "midi-meta")) {
    if (!textNames(evidence.allText, p.name)) problems.push(`credited party '${p.name}' claims midi-meta evidence but does not appear in the file`);
  }
  for (const w of evidence.creditWindows) {
    if (!parties.some((p) => p.evidence === "midi-meta" && textNames(w, p.name))) problems.push(`credit event without a credited party: ${w}`);
  }
  return { block, problems };
}

function writeConfig(path: string, config: Record<string, unknown>, block: Provenance, sourceField?: string): void {
  const { provenance: _old, ...rest } = config;
  const next: Record<string, unknown> = { ...rest };
  if (sourceField) next.source = sourceField;
  next.provenance = block;
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n");
}

function main(): void {
  const write = process.argv.includes("--write");
  const quarantine = process.argv.includes("--quarantine");
  const table = process.argv.includes("--table");
  const urls = parseDownloadUrls(readFileSync(DOWNLOAD_SCRIPT, "utf8"));

  const songs = [...listSongs(LIBRARY_DIR), ...listSongs(QUARANTINE_DIR)];
  let failures = 0;
  const rows: string[] = [];
  for (const song of songs) {
    const url = urls.get(song.id);
    if (!url) throw new Error(`${song.id}: no downloadUrl in download-library.ts`);
    const { block, problems } = buildProvenance(song, url);
    const facts = SONG_FACTS[song.id] ?? {};
    if (problems.length) {
      failures++;
      console.error(`✗ ${song.genre}/${song.id}\n    ${problems.join("\n    ")}`);
    }
    rows.push(
      `| ${song.genre}/${song.id} | ${block.source_site} | ${block.arrangement_creator.replace(/\|/g, "/")} | ${block.arrangement_license} | ${block.title_verdict}${block.quarantine ? ` — **quarantined**: ${block.quarantine.actual_piece.replace(/\|/g, "/")}` : ""}${block.duplicate_of ? ` — duplicate of ${block.duplicate_of}` : ""} |`,
    );
    if (write && !problems.length) {
      const inLibrary = song.dir.startsWith(LIBRARY_DIR);
      let dir = song.dir;
      if (quarantine && block.quarantine && inLibrary) {
        dir = join(QUARANTINE_DIR, song.genre);
        mkdirSync(dir, { recursive: true });
        renameSync(join(song.dir, `${song.id}.mid`), join(dir, `${song.id}.mid`));
        renameSync(join(song.dir, `${song.id}.json`), join(dir, `${song.id}.json`));
        console.log(`  QUARANTINE ${song.genre}/${song.id} → songs/quarantine/${song.genre}/`);
      }
      writeConfig(join(dir, `${song.id}.json`), song.config, block, facts.source_field);
    }
  }

  if (table) {
    console.log("| song | source | arrangement creator | licence | title verdict |\n|---|---|---|---|---|");
    console.log(rows.join("\n"));
  }
  const counts = songs.reduce<Record<string, number>>((acc, s) => {
    const v = buildProvenance(s, urls.get(s.id)!).block;
    acc[v.arrangement_license] = (acc[v.arrangement_license] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`\n${songs.length} songs; licences: ${JSON.stringify(counts)}; contradicting: ${CONTRADICTING_IDS.length}; problems: ${failures}${write ? " (written)" : " (dry run)"}`);
  if (failures) process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
