// ─── Root-finding — Parncutt root-salience ────────────────────────────────────
//
// Infers the chord root from the salience-weighted pitch-class profile, NOT from
// the lowest note. This is the correct root method the ACE study-swarm cites
// (finding 4: Temperley 1997, Parncutt 1988 — canonical root-finding infers the
// root from pitch-class content; the bass is a weak prior, not a selector;
// finding 3: the bass ≠ the root under inversion).
//
// Parncutt's (1988, Music Perception 6(1):65, DOI:10.2307/40285416) root-support
// model: each pitch class lends weight to the roots it would support as a
// harmonic (unison, fifth, major third, minor seventh, major ninth), with
// diminishing weight. A candidate root's salience is the weighted sum of the
// profile at its supported intervals; the strongest candidate wins.
//
// The bass enters ONLY as a tiebreak between near-equal candidates (e.g. Am vs
// C6, which share four notes) — exactly the "weak prior/tiebreak, never a forced
// selector" the literature prescribes and the bass-aware inferChord already
// applies for the voicer's exact-root-position case.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parncutt root-support weights: [interval-from-root, weight]. A pitch class at
 * `interval` above a candidate root contributes `weight` to that root's salience.
 * The classic weighting — root ≫ fifth > major third > minor seventh > ninth.
 */
export const ROOT_SUPPORT: ReadonlyArray<readonly [number, number]> = [
  [0, 10], // the root itself (unison / octave)
  [7, 5], //  perfect fifth
  [4, 3], //  major third
  [10, 2], // minor seventh
  [2, 1], //  major ninth (second)
];

/** How close (as a fraction of the winner) a runner-up must be for the bass to break the tie. */
const BASS_TIEBREAK_MARGIN = 0.06;

/**
 * Profile-compression exponent for root candidacy — a TUNABLE LEVER, defaulted
 * OFF (α=1 = the raw salience-weighted sum). Root-finding raises the profile to
 * this power before computing salience: α<1 compresses toward chord-tone
 * PRESENCE (Temperley 1997 / Parncutt 1988 — the root is a function of which
 * pitch classes are present, not how loud one is), α=0 is pure presence.
 *
 * WHY IT DEFAULTS OFF (measured — the Session-2 sweep, docs/music-wing-phase1-
 * analysis-engine.md): compression is a Goodhart trap here. α=0 fixes the
 * pedal/ostinato cases (el-condor root 0%→88%) and RAISES the aggregate, but the
 * over-weighted tone IS a chord tone, so flattening it necessarily amplifies
 * passing-tone noise — which ROBS the studio's target block-chord texture
 * (let-it-be 88%→69%, simple-gifts 100%→75%). No single α is a strict
 * improvement. The real fix for pedal/inversion is context-aware NCT detection /
 * HCDF (a magnitude can't tell a pedal-bass chord tone from a root) — Session 2+.
 * The lever is kept, tested, and defaulted to the honest raw behavior.
 */
export const DEFAULT_ROOT_ALPHA = 1.0;

export interface RootResult {
  /** Winning root pitch class 0-11, or -1 when the profile is empty/silent. */
  root: number;
  /** Root clarity in [0,1): (winner − runner-up) / winner. 0 when ambiguous/silent. */
  margin: number;
  /** Per-candidate root salience (length 12). */
  salience: number[];
  /** True when the bass broke a near-tie (diagnostic). */
  bassDecided: boolean;
}

/**
 * Salience of every candidate root over the profile (length-12 vector). The
 * profile is compressed by `alpha` first (see DEFAULT_ROOT_ALPHA): each present
 * pitch class contributes `weight^alpha` of its salience, so one dominant tone
 * cannot swamp the root support. α=1 reproduces the raw weighted sum.
 */
export function rootSalience(profile: number[], alpha: number = DEFAULT_ROOT_ALPHA): number[] {
  const comp = profile.map((w) => (w > 0 ? Math.pow(w, alpha) : 0));
  const out = new Array<number>(12).fill(0);
  for (let root = 0; root < 12; root++) {
    let s = 0;
    for (const [interval, weight] of ROOT_SUPPORT) {
      s += weight * comp[(root + interval) % 12];
    }
    out[root] = s;
  }
  return out;
}

/**
 * Find the chord root of a salience-weighted profile. The bass pitch class is
 * used ONLY to break a near-tie (within BASS_TIEBREAK_MARGIN of the winner),
 * never to override a clear winner. `alpha` compresses the profile for root
 * candidacy (see DEFAULT_ROOT_ALPHA).
 */
export function findRoot(profile: number[], bassPc = -1, alpha: number = DEFAULT_ROOT_ALPHA): RootResult {
  const total = profile.reduce((a, b) => a + b, 0);
  if (total <= 0) return { root: -1, margin: 0, salience: new Array<number>(12).fill(0), bassDecided: false };

  const salience = rootSalience(profile, alpha);

  // Winner + runner-up.
  let best = 0;
  for (let r = 1; r < 12; r++) if (salience[r] > salience[best]) best = r;
  let second = -1;
  for (let r = 0; r < 12; r++) {
    if (r === best) continue;
    if (second === -1 || salience[r] > salience[second]) second = r;
  }
  const bestVal = salience[best];
  const secondVal = second >= 0 ? salience[second] : 0;
  const margin = bestVal > 0 ? (bestVal - secondVal) / bestVal : 0;

  // Bass tiebreak: if the runner-up is within BASS_TIEBREAK_MARGIN of the winner
  // AND the bass pitch class is one of those two near-tied candidates, prefer the
  // bass. This resolves the Am/C6-style four-note ambiguity toward the sounding
  // bass without ever overriding a decisive root.
  let root = best;
  let bassDecided = false;
  if (
    bassPc >= 0 &&
    bassPc !== best &&
    bassPc === second &&
    bestVal > 0 &&
    (bestVal - secondVal) / bestVal <= BASS_TIEBREAK_MARGIN
  ) {
    root = bassPc;
    bassDecided = true;
  }

  return { root, margin, salience, bassDecided };
}
