// Route C — full-song generator side door.
//
// ACE-Step / DiffRhythm / YuE produce a mixed track from lyrics + a style
// caption. They do NOT take library MIDI as a hard pitch/timing constraint.
// This module must never be called from play_song / the live engine.

export type SongGenerator = "ace-step" | "diffrhythm" | "yue";

export interface GenerateSongRequest {
  lyrics: string;
  prompt?: string;
  generator?: SongGenerator;
  bpm?: number;
  durationSec?: number;
}

export interface GenerateSongRefusal {
  ok: false;
  generator: SongGenerator;
  reason: string;
  hint: string;
}

/**
 * Refuse unless ACE_STEP_CMD (or sibling) is explicitly configured.
 * Never silently fall back to the score-locked DSP singer — that would
 * hide the MIDI-lock distinction the study-swarm exists to protect.
 */
export function generateFullSong(req: GenerateSongRequest): GenerateSongRefusal {
  const generator = req.generator ?? "ace-step";
  const envKey = generator === "ace-step"
    ? "ACE_STEP_CMD"
    : generator === "diffrhythm"
      ? "DIFFRHYTHM_CMD"
      : "YUE_CMD";
  const cmd = process.env[envKey];
  if (!cmd) {
    return {
      ok: false,
      generator,
      reason: `${generator} is a mixed-song generator, not a singing instrument. It cannot honor a library MIDI line.`,
      hint: `To run it as a side door, set ${envKey} to a local CLI and call generate-song. Do not wire this into play. Catalog: model-knowledge/audio (ACE-Step 1.5 MIT, DiffRhythm 2 Apache, YuE Apache).`,
    };
  }
  return {
    ok: false,
    generator,
    reason: `${envKey} is set but jam-sessions does not spawn third-party song generators from play. Use the external CLI (${cmd}) with lyrics + a style prompt only.`,
    hint: "Keep this off the MIDI play path. Route A/B remain the singing instrument.",
  };
}
