import { readFileSync } from "node:fs";
import type { SongEntry } from "../songs/types.js";
import { loadEngineG2P } from "./g2p.js";
import { buildScoreLockedVocals, type BuiltVocalScore } from "./score-locked.js";
import { createScoreSinger, type ScoreSinger } from "./score-singer.js";
import { getVocalTune } from "./tunes.js";

export interface LyricsRequest {
  lyrics?: string;
  lyricsFile?: string;
  startMeasure?: number;
  endMeasure?: number;
  tempo?: number;
  speed?: number;
  preset?: string;
}

export function resolveLyricsText(req: LyricsRequest, songId?: string): string | null {
  if (req.lyricsFile) {
    return readFileSync(req.lyricsFile, "utf8");
  }
  if (req.lyrics && req.lyrics.trim().length > 0) return req.lyrics;
  if (songId) {
    const tune = getVocalTune(songId);
    if (tune?.lyrics) return tune.lyrics;
  }
  return null;
}

export async function prepareScoreLocked(
  song: SongEntry,
  req: LyricsRequest,
): Promise<{ score: BuiltVocalScore; singer: ScoreSinger } | null> {
  const text = resolveLyricsText(req, song.id);
  if (!text) return null;
  const g2p = await loadEngineG2P();
  const score = buildScoreLockedVocals(song, {
    lyrics: text,
    startMeasure: req.startMeasure,
    endMeasure: req.endMeasure,
    tempo: req.tempo,
    speed: req.speed,
    g2p,
  });
  const singer = createScoreSinger(score, { preset: req.preset });
  return { score, singer };
}

/** Engines that would otherwise sing aahs — with --lyrics the lead is the score singer. */
export function accompanimentEngineForLyrics(engine: string): string {
  if (engine === "synth" || engine === "vocal" || engine === "tract" || engine === "vocal+synth") {
    return "piano";
  }
  if (engine === "piano+synth") return "piano";
  if (engine === "guitar+synth") return "guitar";
  return engine;
}
