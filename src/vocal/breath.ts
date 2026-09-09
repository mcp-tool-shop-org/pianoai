/**
 * Breath as singing *context*: a tank that must refill in a pause and
 * empties over a professional phrase.
 *
 * Numbers are in the trained-singer ballpark (Sundberg airflow ~100–200 ml/s
 * over ~2–3 L usable volume → ~12–18 s of mezzo phonation; catch-breaths
 * 0.2–0.5 s). A rest shorter than CATCH_PAUSE_SEC is legato, not an inhale.
 */

export const BREATH = {
  /** Seconds of mezzo phonation a full tank supports. */
  PHONATION_SEC: 14,
  /** Rest must last this long before refill starts. */
  CATCH_PAUSE_SEC: 0.12,
  /** Empty → full during a catch-breath. */
  FILL_SEC: 0.45,
  /** Below this, tone is mostly air (still voiced — we don't drop the line). */
  FLOOR: 0.08,
  /** Start of a piece: almost empty, so the opening rest *is* the inhale. */
  START: 0.12,
} as const;

export interface BreathStep {
  level: number;
  inhaling: boolean;
  /** 0–1 envelope for an inhale noise burst. */
  inhaleGain: number;
}

export class BreathContext {
  level: number;
  private restSec = 0;

  constructor(level = BREATH.START) {
    this.level = clamp01(level);
  }

  step(dt: number, voicing: boolean, intensity = 0.7): BreathStep {
    if (voicing) {
      this.restSec = 0;
      const rate = (intensity <= 0 ? 0.5 : intensity) / BREATH.PHONATION_SEC;
      this.level = Math.max(BREATH.FLOOR, this.level - rate * dt);
      return { level: this.level, inhaling: false, inhaleGain: 0 };
    }

    this.restSec += dt;
    if (this.restSec < BREATH.CATCH_PAUSE_SEC) {
      return { level: this.level, inhaling: false, inhaleGain: 0 };
    }

    const room = 1 - this.level;
    if (room < 0.02) {
      return { level: this.level, inhaling: false, inhaleGain: 0 };
    }

    this.level = Math.min(1, this.level + dt / BREATH.FILL_SEC);
    // Loudest at the start of the catch, fades as the tank fills.
    const inhaleGain = Math.min(1, room * 1.4) * 0.85;
    return { level: this.level, inhaling: true, inhaleGain };
  }
}

/** Klatt: low air → more aspiration, less glottal tenseness. */
export function tensenessFromBreath(base: number, level: number): number {
  return base * (0.42 + 0.58 * level);
}

/** Prame: vibrato rate rises toward the end of the air. */
export function vibratoFromBreath(level: number): { rateHz: number; amount: number } {
  const spent = 1 - level;
  return {
    rateHz: 5.5 + 0.9 * spent,
    amount: 0.0035 + 0.0025 * spent,
  };
}

/** Phrase intensity follows remaining air (never fully gates the note). */
export function gainFromBreath(level: number): number {
  return 0.5 + 0.5 * level;
}

/**
 * Residual cents around the score pitch (XiaoiceSing-style), not a new melody.
 * Depth grows a little as air runs out.
 */
export function residualCents(tSec: number, level: number): number {
  const spent = 1 - level;
  return Math.sin(tSec * 2.3) * 6 + Math.sin(tSec * 41.7) * (1.5 + 3 * spent);
}

export function applyCents(hz: number, cents: number): number {
  return hz * 2 ** (cents / 1200);
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
