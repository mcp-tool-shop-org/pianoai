// ─── MIDI Meta-Event Reader ──────────────────────────────────────────────────
//
// Reads the text-class meta events (FF 01–07) of a Standard MIDI File: text,
// copyright notice, track name, instrument name, lyrics, marker, cue point.
// These are the file's own account of what it is and who arranged it — the
// evidence the provenance audit reads (docs/findings/v1-provenance-audit.md).
//
// Lyric events are counted and their head kept (they identify a song when
// nothing else does); a lyric-per-syllable file carries thousands, so they are
// never returned one by one.
// ─────────────────────────────────────────────────────────────────────────────

import { parseMidi } from "midi-file";

export const MIDI_TEXT_META_TYPES = [
  "text",
  "copyrightNotice",
  "trackName",
  "instrumentName",
  "lyrics",
  "marker",
  "cuePoint",
] as const;

export type MidiTextMetaType = (typeof MIDI_TEXT_META_TYPES)[number];

/** Lyric text is kept only up to this many characters — identity, not the whole song. */
export const LYRIC_HEAD_CAP = 400;

export interface MidiTextMeta {
  /** Meta type name as midi-file reports it (FF 01 = text … FF 07 = cuePoint). */
  type: MidiTextMetaType;
  /** Zero-based track index the event was found in. */
  track: number;
  /** Decoded text, trimmed; control characters stripped. */
  text: string;
}

export interface MidiMetaSummary {
  /** Every non-lyric text event, in file order, blank ones dropped. */
  events: MidiTextMeta[];
  /** Number of lyric events seen (they are not returned individually). */
  lyricCount: number;
  /** The lyric events joined in file order, whitespace-normalised, capped — enough to identify a song. */
  lyricHead: string;
  /** FF 02 copyright notices, deduplicated. */
  copyrights: string[];
  /** FF 03 track names, deduplicated. */
  trackNames: string[];
  /** FF 01 free text, deduplicated. */
  texts: string[];
}

function clean(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}

/** Read the text-class meta events out of a MIDI file's bytes. */
export function readMidiTextMeta(bytes: Uint8Array): MidiMetaSummary {
  const midi = parseMidi(bytes);
  const events: MidiTextMeta[] = [];
  let lyricCount = 0;
  const lyricParts: string[] = [];
  let lyricChars = 0;
  midi.tracks.forEach((track, ti) => {
    for (const ev of track) {
      if (!("meta" in ev) || !ev.meta) continue;
      const type = ev.type as string;
      if (!(MIDI_TEXT_META_TYPES as readonly string[]).includes(type)) continue;
      if (type === "lyrics") {
        lyricCount++;
        if (lyricChars < LYRIC_HEAD_CAP) {
          const part = String((ev as { text?: string }).text ?? "");
          lyricParts.push(part);
          lyricChars += part.length;
        }
        continue;
      }
      const text = clean(String((ev as { text?: string }).text ?? ""));
      if (!text) continue;
      events.push({ type: type as MidiTextMetaType, track: ti, text });
    }
  });
  return {
    events,
    lyricCount,
    lyricHead: clean(lyricParts.join("")).slice(0, LYRIC_HEAD_CAP),
    copyrights: dedupe(events.filter((e) => e.type === "copyrightNotice").map((e) => e.text)),
    trackNames: dedupe(events.filter((e) => e.type === "trackName").map((e) => e.text)),
    texts: dedupe(events.filter((e) => e.type === "text").map((e) => e.text)),
  };
}
