// ─── Cockpit Ruler ───────────────────────────────────────────────────────────
//
// Pure, DOM-free math for the time-ruler surface (Wave C2a): pixel<->beat
// conversion, bar/beat tick layout, loop-region drag normalization, and the
// auto-scroll-follow threshold decision. main.ts owns all DOM wiring
// (building tick elements, mousedown/mousemove listeners on #pr-ruler,
// rendering the region band, applying scrollTo) — this file only computes
// numbers, the same "pure math, DOM-free" split time.ts/state.ts/
// transport.ts already established (see their file headers), so this stays
// unit-testable directly under Node/vitest with no window/document access
// anywhere in the file.
//
// PX_PER_BEAT/SCORE_BEATS/quantizeBeats come from time.ts rather than being
// re-derived here — same single-conversion-chokepoint reasoning as every
// other module in this app that touches beat<->pixel/second math.
// ─────────────────────────────────────────────────────────────────────────────

import { PX_PER_BEAT, SCORE_BEATS, quantizeBeats, type LoopRegion } from "./time.js";

export type { LoopRegion };

/** Loop-region minimum length, in beats (design note: "min length 1
 *  beat") — also doubles as the whole-beat snap grid for region drags
 *  (normalizeRegion below), distinct from the piano roll's own
 *  QUANTIZE_GRID_BEATS (a quarter-beat) used for click-to-seek/note
 *  editing. */
export const MIN_REGION_BEATS = 1;

/** Ruler hit-target height, in px (finding 41 — touch target size).
 *  main.ts sets #pr-ruler's rendered height from this constant rather than
 *  a value hardcoded separately into index.html's CSS. */
export const RULER_HEIGHT_PX = 44;

// ─── px <-> beat ──────────────────────────────────────────────────────────

/** Convert a horizontal pixel offset — relative to the ruler/roll's own
 *  left edge, same convention the existing piano-roll click-to-add-note
 *  handler already uses (`e.clientX - rect.left`) — to a beat position.
 *  Not clamped or snapped; see quantizeBeats (time.ts) / snapToWholeBeat
 *  below for that. */
export function pxToBeat(px: number): number {
  return px / PX_PER_BEAT;
}

/** Convert a beat position to its horizontal pixel offset. Inverse of
 *  pxToBeat — both directions kept here (rather than only whichever main.ts
 *  happened to need first) since ruler rendering needs beat->px (tick
 *  layout) just as much as pointer handling needs px->beat. */
export function beatToPx(beat: number): number {
  return beat * PX_PER_BEAT;
}

/** Snap a beat position to the nearest WHOLE beat — the loop region's own
 *  snap granularity. Delegates to time.ts's quantizeBeats (grid=1) rather
 *  than re-deriving `Math.round` here, so it inherits the same >= 0 floor
 *  and non-finite/non-positive-grid guard. */
export function snapToWholeBeat(beat: number): number {
  return quantizeBeats(beat, 1);
}

// ─── Ruler tick layout ────────────────────────────────────────────────────

export interface RulerTick {
  beat: number;
  px: number;
  /** True on every bar line (every `beatsPerBar`-th tick, including beat 0). */
  isBar: boolean;
  /** 1-indexed bar number ("Bar 1", "Bar 2", ...); null on a plain beat tick. */
  barNumber: number | null;
}

/**
 * One tick per whole beat from 0 to `totalBeats` inclusive, flagging bar
 * lines ("Beat ticks + bar numbers derived from time.ts constants (4/4, bar
 * = 4 beats)"). Pure layout data — main.ts turns each entry into a DOM tick
 * element (plain vs. bar-styled + labeled) without needing to know 4/4
 * arithmetic itself. Defaults to the full score width (SCORE_BEATS) and
 * standard 4/4 (beatsPerBar=4); both are overridable for testing/future
 * meter changes. A non-finite/negative totalBeats produces an empty array,
 * and a non-finite/non-positive beatsPerBar falls back to 4, rather than
 * looping forever or producing NaN ticks (same defensive-guard class as
 * time.ts's own quantizeBeats).
 */
export function computeRulerTicks(
  totalBeats: number = SCORE_BEATS,
  beatsPerBar: number = 4,
): RulerTick[] {
  if (!Number.isFinite(totalBeats) || totalBeats < 0) return [];
  const perBar = Number.isFinite(beatsPerBar) && beatsPerBar > 0 ? beatsPerBar : 4;
  const ticks: RulerTick[] = [];
  const last = Math.floor(totalBeats);
  for (let b = 0; b <= last; b++) {
    const isBar = b % perBar === 0;
    ticks.push({ beat: b, px: beatToPx(b), isBar, barNumber: isBar ? b / perBar + 1 : null });
  }
  return ticks;
}

// ─── Loop-region drag normalization ──────────────────────────────────────

/**
 * Normalize a ruler drag's two raw (unordered, unsnapped) beat endpoints
 * into a valid LoopRegion: both ends snapped to whole beats, ordered
 * low->high regardless of drag direction (a right-to-left drag is just as
 * valid as left-to-right), at least `minBeats` long, and clamped within
 * [0, maxBeat] when `maxBeat` is finite.
 *
 * The end is clamped to `maxBeat` BEFORE the minimum-length floor is
 * enforced, and the floor prefers to extend the end forward — only
 * retreating `startBeat` when there isn't room left before `maxBeat` to do
 * that. This is what makes a drag that starts well inside the range but
 * overshoots past `maxBeat` clip cleanly at the edge (startBeat stays put)
 * instead of yanking startBeat backward too.
 *
 * A degenerate drag (a click with no movement, or a drag shorter than
 * `minBeats`) still produces a valid `minBeats`-long region anchored at the
 * snapped start rather than a zero/negative-length one — transport.ts's
 * tick() requires endBeat to be strictly greater than startBeat to ever
 * wrap, so a zero-length region would silently never loop.
 */
export function normalizeRegion(
  beatA: number,
  beatB: number,
  minBeats: number = MIN_REGION_BEATS,
  maxBeat: number = Infinity,
): LoopRegion {
  const a = snapToWholeBeat(beatA);
  const b = snapToWholeBeat(beatB);
  let startBeat = Math.min(a, b);
  let endBeat = Math.max(a, b);

  const hasMax = Number.isFinite(maxBeat);
  if (hasMax) endBeat = Math.min(endBeat, maxBeat);
  startBeat = Math.max(0, startBeat);
  if (hasMax) startBeat = Math.min(startBeat, maxBeat);

  if (endBeat - startBeat < minBeats) {
    endBeat = startBeat + minBeats;
    if (hasMax && endBeat > maxBeat) {
      endBeat = maxBeat;
      startBeat = Math.max(0, endBeat - minBeats);
    }
  }

  return { startBeat, endBeat };
}

// ─── Auto-scroll follow (finding 43) ─────────────────────────────────────

/**
 * Auto-scroll-follow decision: given the piano-roll container's current
 * horizontal scroll state and the playhead's pixel position, decide
 * whether the container should be scrolled to keep the playhead in view
 * and, if so, the target scrollLeft. Returns null when no scroll is
 * needed. Pure arithmetic — main.ts calls this on every transport onTick
 * while follow is enabled and applies the result via
 * container.scrollTo/scrollLeft (the reduced-motion behavior:"auto" vs.
 * "smooth" choice, and the "was this scroll mine or the user's" tracking,
 * are DOM/timing concerns handled there, out of scope for a pure module).
 *
 * Triggers once the playhead crosses `triggerFraction` (default 0.7 = 70%)
 * of the visible width measured from the CURRENT scrollLeft, i.e. once
 * `playheadPx > scrollLeft + clientWidth * triggerFraction`. The jump
 * target moves scrollLeft forward by `jumpFraction` (default 0.5 = half a
 * viewport) of clientWidth, clamped to [0, maxScrollLeft] so it can never
 * scroll past the real scrollable content — callers pass the DOM's actual
 * `scrollWidth - clientWidth` rather than this module deriving it from
 * SCORE_BEATS*PX_PER_BEAT independently, so this stays correct even if the
 * rendered roll width ever diverges from that constant for any reason.
 */
export function computeFollowScroll(
  playheadPx: number,
  scrollLeft: number,
  clientWidth: number,
  maxScrollLeft: number,
  triggerFraction: number = 0.7,
  jumpFraction: number = 0.5,
): number | null {
  if (clientWidth <= 0) return null;
  const triggerPx = scrollLeft + clientWidth * triggerFraction;
  if (playheadPx <= triggerPx) return null;
  const target = scrollLeft + clientWidth * jumpFraction;
  const clampedMax = Math.max(0, maxScrollLeft);
  return Math.max(0, Math.min(target, clampedMax));
}
