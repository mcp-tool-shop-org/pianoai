// ─── Chord-symbol + key parsing for measurement ───────────────────────────────
//
// Shared parsing for the measurement layer (mireval + proxies). Kept local to
// src/analysis (not imported from src/maker) so the analysis subsystem stays
// decoupled. Understands the canonical inferChord/verifyHarmony vocabulary plus
// the notation aliases the platform already accepts, so a reference label, an
// analyzer span, and a baseline inferChord label all parse the same way.
// ─────────────────────────────────────────────────────────────────────────────

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Notation aliases → canonical quality suffix (mirrors verifyHarmony). */
const SUFFIX_ALIAS: Record<string, string> = {
  "": "maj",
  maj: "maj",
  M: "maj",
  min: "m",
  "-": "m",
  M7: "maj7",
  "Δ": "maj7",
  "Δ7": "maj7",
  min7: "m7",
  "ø7": "m7b5",
  "ø": "m7b5",
  "+": "aug",
  "°": "dim",
  "°7": "dim7",
  "7sus4": "sus4",
};

/** Qualities carrying a minor third (for the MIREX maj/min mapping). */
const MINOR_THIRD = new Set(["m", "m7", "m7b5", "dim", "dim7", "m6", "m9", "madd9"]);
/** Qualities carrying a major third. */
const MAJOR_THIRD = new Set(["maj", "7", "maj7", "6", "9", "maj9", "add9", "aug"]);

export interface ParsedLabel {
  /** Root pitch class 0-11. */
  rootPc: number;
  /** Canonical quality suffix ("maj","m","7",…). */
  quality: string;
}

/**
 * Parse a chord label ("C", "Am7", "Ebmaj7", "F#m7b5", "G7/B", "N/C") into
 * { rootPc, quality }. Slash basses are dropped (an inversion the pitch-class
 * layer can't confirm). Returns null for no-chord / unparseable labels.
 */
export function parseChordLabel(symbol: string): ParsedLabel | null {
  const t = (symbol ?? "").trim();
  if (t === "" || t === "N/C" || t === "N/A") return null;
  const base = t.includes("/") ? t.slice(0, t.indexOf("/")).trim() : t;
  const m = /^([A-Ga-g])(#|b)?(.*)$/.exec(base);
  if (!m) return null;
  const [, letter, accidental, rawSuffix] = m;
  let rootPc = LETTER_PC[letter.toUpperCase()];
  if (rootPc === undefined) return null;
  if (accidental === "#") rootPc = (rootPc + 1) % 12;
  if (accidental === "b") rootPc = (rootPc + 11) % 12;
  const quality = SUFFIX_ALIAS[rawSuffix] ?? rawSuffix;
  return { rootPc, quality };
}

/** MIREX maj/min class of a quality — "other" for third-less (sus) chords. */
export function majMinClass(quality: string): "maj" | "min" | "other" {
  if (MINOR_THIRD.has(quality)) return "min";
  if (MAJOR_THIRD.has(quality)) return "maj";
  return "other";
}

/**
 * Diatonic root pitch classes of a key ("C major", "A minor"). Major → major
 * scale; minor → NATURAL minor scale (so a chord rooted on the raised 7th reads
 * as chromatic — the honest "how diatonic is this label" proxy). Returns null on
 * an unparseable key string.
 */
export function keyScalePcs(key: string): Set<number> | null {
  const m = /^([A-G])(#|b)?\s+(major|minor)$/i.exec((key ?? "").trim());
  if (!m) return null;
  const [, letter, accidental, mode] = m;
  let tonic = LETTER_PC[letter.toUpperCase()];
  if (accidental === "#") tonic = (tonic + 1) % 12;
  if (accidental === "b") tonic = (tonic + 11) % 12;
  const scale = mode.toLowerCase() === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  return new Set(scale.map((iv) => (tonic + iv) % 12));
}
