// ─── Cockpit Persistence ─────────────────────────────────────────────────────
//
// Pure, DOM-free serialize / deserialize / migrate functions for autosaving
// cockpit state to localStorage (F-B1-001). Deliberately has ZERO imports
// from main.ts and never touches window/document/localStorage itself —
// mirrors how synth.ts is import-safe, so this module can be unit-tested
// directly from a plain Node/vitest environment the same way
// pure-logic.test.ts already covers synth.ts. main.ts (which calls boot()
// unconditionally at module top level and touches the DOM on import) is the
// only place actual localStorage reads/writes happen, wrapped in try/catch
// there for private-mode/quota-exceeded safety.
//
// Schema v1: {v, score, bpm, engine, voice, tuning, refPitch, mode}.
//   - score:  notes with id omitted — ids are regenerated on restore (same
//             convention main.ts's ScoreSnapshot.notes already uses), so a
//             hand-edited or stale blob can never resurrect a colliding id.
//   - engine: the selected INSTRUMENT-engine voice id (sel-voice / VoiceId).
//   - voice:  the selected VOCAL-engine voice id (sel-vocal-voice /
//             VocalVoiceId). Kept as separate fields (rather than one
//             mode-dependent field) so switching modes never loses the
//             other engine's last pick — deliberately more complete than
//             main.ts's own ScoreSnapshot export, which only round-trips
//             whichever engine matches the active mode.
// ─────────────────────────────────────────────────────────────────────────────

export const CURRENT_SCHEMA_VERSION = 1;

/** localStorage key for the persisted blob — centralised here so the schema
 *  and its storage key travel together. */
export const STORAGE_KEY = "ai-jam-cockpit:state";

export type PersistedMode = "instrument" | "vocal";
export type PersistedVowelId = "a" | "e" | "i" | "o" | "u";

export interface PersistedNote {
  midi: number;
  startSec: number;
  durationSec: number;
  velocity: number;
  vowel?: PersistedVowelId;
  breathiness?: number;
  lyric?: string;
}

export interface CockpitPersistedState {
  v: number;
  score: PersistedNote[];
  bpm: number;
  engine: string;
  voice: string;
  tuning: string;
  refPitch: number;
  mode: PersistedMode;
}

/** Input to serializeCockpitState — same shape minus `v`, which is always
 *  stamped as CURRENT_SCHEMA_VERSION so callers can never drift it. */
export type CockpitStateInput = Omit<CockpitPersistedState, "v">;

export function serializeCockpitState(state: CockpitStateInput): string {
  const payload: CockpitPersistedState = { v: CURRENT_SCHEMA_VERSION, ...state };
  return JSON.stringify(payload);
}

const VOWELS = new Set<string>(["a", "e", "i", "o", "u"]);

function sanitizeNote(raw: unknown): PersistedNote | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const midi = r.midi, velocity = r.velocity, startSec = r.startSec, durationSec = r.durationSec;
  if (typeof midi !== "number" || !Number.isFinite(midi) || midi < 0 || midi > 127) return null;
  if (typeof velocity !== "number" || !Number.isFinite(velocity) || velocity < 0 || velocity > 127) return null;
  if (typeof startSec !== "number" || !Number.isFinite(startSec) || startSec < 0) return null;
  if (typeof durationSec !== "number" || !Number.isFinite(durationSec) || durationSec < 0) return null;

  const note: PersistedNote = { midi, velocity, startSec, durationSec };
  if (typeof r.vowel === "string" && VOWELS.has(r.vowel)) note.vowel = r.vowel as PersistedVowelId;
  if (typeof r.breathiness === "number" && Number.isFinite(r.breathiness) && r.breathiness >= 0 && r.breathiness <= 1) {
    note.breathiness = r.breathiness;
  }
  if (typeof r.lyric === "string") note.lyric = r.lyric;
  return note;
}

/**
 * Parse + validate a persisted-state JSON string, migrating older schema
 * versions forward. Never throws — corrupt JSON, foreign data, wrong types,
 * or an unrecognised version all just return null so callers fall back to a
 * fresh session instead of booting into a half-restored, possibly
 * NaN-poisoned state (same failure class as F-A1-002/005/006 elsewhere in
 * this app). Invalid individual notes are dropped rather than failing the
 * whole restore, since a partially-corrupt autosave blob is more likely
 * than a malicious one and losing one bad note beats losing the whole score.
 */
export function deserializeCockpitState(raw: string): CockpitPersistedState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const r = parsed as Record<string, unknown>;

  // Schema migration funnel: only v1 exists today. A future v2 would branch
  // here (e.g. `if (r.v === 1) r = migrateV1toV2(r);`) before falling
  // through to the same validation below, so restore never has two
  // divergent code paths to keep in sync.
  if (r.v !== undefined && r.v !== CURRENT_SCHEMA_VERSION) return null;
  if (!Array.isArray(r.score)) return null;

  const score: PersistedNote[] = [];
  for (const rawNote of r.score) {
    const note = sanitizeNote(rawNote);
    if (note) score.push(note);
  }

  const bpm = typeof r.bpm === "number" && Number.isFinite(r.bpm) ? r.bpm : 120;
  const refPitch = typeof r.refPitch === "number" && Number.isFinite(r.refPitch) ? r.refPitch : 440;
  const engine = typeof r.engine === "string" ? r.engine : "grand";
  const voice = typeof r.voice === "string" ? r.voice : "kokoro-af-heart";
  const tuning = typeof r.tuning === "string" ? r.tuning : "equal";
  const mode: PersistedMode = r.mode === "vocal" ? "vocal" : "instrument";

  return { v: CURRENT_SCHEMA_VERSION, score, bpm, engine, voice, tuning, refPitch, mode };
}
