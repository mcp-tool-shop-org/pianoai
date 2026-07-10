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
// there for private-mode/quota-exceeded safety. The only imports this module
// has — time.ts's secondsToBeats/clampBpm/DEFAULT_BPM — are equally
// pure/Node-safe (no window/document either), so they don't compromise that
// property.
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

// Schema v2 added `customCents` (F-A1-004: custom-tuning not persisted) —
// present only when tuning === "custom". v1 blobs (no customCents) load via
// the migration funnel below same as before.
//
// Schema v3 (cockpit beat-based time model) changes note shape from
// SECONDS (`startSec`/`durationSec`) to BEATS (`startBeat`/`durationBeats`)
// — see time.ts's file header for why the app stores beats now. v1 and v2
// blobs are BOTH seconds-shaped (v2 only added customCents; it never
// touched note shape), so they funnel through the exact same
// seconds->beats conversion on the way in: `startBeat =
// secondsToBeats(startSec, savedBpm)` using the bpm value SAVED IN THE SAME
// BLOB (the tempo that was actually in effect when those seconds were
// recorded), not whatever bpm happens to be live in the UI right now. This
// conversion only ever runs on the legacy (v1/v2/undefined) path — a v3
// blob's notes are read as beats directly, so re-serializing and
// re-deserializing an already-migrated state can never re-apply the
// conversion (idempotent by construction, not by a version check).
//
// bpm sanitizing (Wave C0 fix): the persisted `bpm` field is clamped to
// [BPM_MIN, BPM_MAX] via time.ts's clampBpm ONCE, right here, and that same
// clamped value is used both for the seconds->beats conversion below AND as
// the `bpm` field on the returned state. Previously this only finite-checked
// bpm (falling back to 120 for non-numbers) and left it otherwise
// unclamped — the conversion below went through secondsToBeats, whose
// internal safeBpm() substitutes DEFAULT_BPM for a non-finite/<=0 bpm but
// otherwise passes the raw value through untouched, while the RETURNED
// state kept that same raw (unclamped) bpm. main.ts's restoreFromStorage
// then fed that raw bpm through importScore's OWN clampBpm call, so a blob
// with bpm:0 had its notes converted to beats at 120bpm (safeBpm's
// substitution) but the restored session then played back at bpm:20
// (clampBpm's floor) — a 6x tempo mismatch between how the notes were laid
// out and how they play. Clamping once here means every downstream
// consumer (this conversion, the returned bpm field, and main.ts's later
// re-clamp, now a no-op) agrees on the same value. time.ts is confirmed
// DOM-free (see its own file header), so importing clampBpm alongside the
// pre-existing secondsToBeats import doesn't compromise this module's
// Node-safety.
import { secondsToBeats, clampBpm, DEFAULT_BPM } from "./time.js";

export const CURRENT_SCHEMA_VERSION = 3;

/** localStorage key for the persisted blob — centralised here so the schema
 *  and its storage key travel together. */
export const STORAGE_KEY = "ai-jam-cockpit:state";

export type PersistedMode = "instrument" | "vocal";
export type PersistedVowelId = "a" | "e" | "i" | "o" | "u";

/** Current (v3, beat-based) persisted note shape. */
export interface PersistedNote {
  midi: number;
  startBeat: number;
  durationBeats: number;
  velocity: number;
  vowel?: PersistedVowelId;
  breathiness?: number;
  lyric?: string;
  /** Live-capture raw (unquantized) timing (Wave C3 — see state.ts's
   *  Note.rawStartBeat/rawDurationBeats and capture.ts's file header) —
   *  present only on notes recorded via the record-arm path. Optional
   *  fields ADDED to the existing v3 shape, deliberately WITHOUT a schema
   *  version bump: a v3 blob with these fields loads fine in a pre-C3
   *  reader (its sanitizer simply drops unknown fields — the note itself,
   *  with its quantized startBeat/durationBeats view, restores intact,
   *  which is the "old readers unaffected" compensator policy), and a
   *  pre-C3 v3 blob loads fine here (both fields absent). Bumping to v4
   *  would have REJECTED the blob outright in old readers for zero
   *  data-shape need. */
  rawStartBeat?: number;
  rawDurationBeats?: number;
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
  /** Custom cent offsets per pitch class (12 entries, index 0 = C, forced
   *  to 0), present only when tuning === "custom" — lets a restored session
   *  reproduce the exact custom tuning instead of relabeling itself
   *  "Custom" while silently playing 12-TET (F-A1-004). */
  customCents?: number[];
}

/** Input to serializeCockpitState — same shape minus `v`, which is always
 *  stamped as CURRENT_SCHEMA_VERSION so callers can never drift it. Callers
 *  always pass v3 (beat-based) notes — persistence.ts only ever WRITES the
 *  current schema; the v1/v2 seconds shape is exclusively a read-path
 *  concern (deserializeCockpitState's migration below). */
export type CockpitStateInput = Omit<CockpitPersistedState, "v">;

export function serializeCockpitState(state: CockpitStateInput): string {
  const payload: CockpitPersistedState = { v: CURRENT_SCHEMA_VERSION, ...state };
  return JSON.stringify(payload);
}

const VOWELS = new Set<string>(["a", "e", "i", "o", "u"]);

function sanitizeVowel(raw: unknown): PersistedVowelId | undefined {
  return typeof raw === "string" && VOWELS.has(raw) ? (raw as PersistedVowelId) : undefined;
}

function sanitizeBreathiness(raw: unknown): number | undefined {
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : undefined;
}

/** A legacy (v1/v2) seconds-shaped note, validated but not yet converted to
 *  beats. */
interface LegacySecondsNote {
  midi: number;
  startSec: number;
  durationSec: number;
  velocity: number;
  vowel?: PersistedVowelId;
  breathiness?: number;
  lyric?: string;
}

function sanitizeNoteSeconds(raw: unknown): LegacySecondsNote | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const midi = r.midi, velocity = r.velocity, startSec = r.startSec, durationSec = r.durationSec;
  if (typeof midi !== "number" || !Number.isFinite(midi) || midi < 0 || midi > 127) return null;
  if (typeof velocity !== "number" || !Number.isFinite(velocity) || velocity < 0 || velocity > 127) return null;
  if (typeof startSec !== "number" || !Number.isFinite(startSec) || startSec < 0) return null;
  if (typeof durationSec !== "number" || !Number.isFinite(durationSec) || durationSec < 0) return null;

  const note: LegacySecondsNote = { midi, velocity, startSec, durationSec };
  const vowel = sanitizeVowel(r.vowel);
  if (vowel) note.vowel = vowel;
  const breathiness = sanitizeBreathiness(r.breathiness);
  if (breathiness !== undefined) note.breathiness = breathiness;
  if (typeof r.lyric === "string") note.lyric = r.lyric;
  return note;
}

/** Current (v3) beats-shaped note validator — mirrors sanitizeNoteSeconds
 *  field-for-field except startBeat/durationBeats replace startSec/
 *  durationSec (beats can't be negative but, unlike seconds, there's no
 *  meaningful upper "duration of a second" bound to check either — same
 *  finite/non-negative guard as before). */
function sanitizeNoteBeats(raw: unknown): PersistedNote | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const midi = r.midi, velocity = r.velocity, startBeat = r.startBeat, durationBeats = r.durationBeats;
  if (typeof midi !== "number" || !Number.isFinite(midi) || midi < 0 || midi > 127) return null;
  if (typeof velocity !== "number" || !Number.isFinite(velocity) || velocity < 0 || velocity > 127) return null;
  if (typeof startBeat !== "number" || !Number.isFinite(startBeat) || startBeat < 0) return null;
  if (typeof durationBeats !== "number" || !Number.isFinite(durationBeats) || durationBeats < 0) return null;

  const note: PersistedNote = { midi, velocity, startBeat, durationBeats };
  const vowel = sanitizeVowel(r.vowel);
  if (vowel) note.vowel = vowel;
  const breathiness = sanitizeBreathiness(r.breathiness);
  if (breathiness !== undefined) note.breathiness = breathiness;
  if (typeof r.lyric === "string") note.lyric = r.lyric;
  // Wave C3 — raw capture timing rides along when BOTH fields are present
  // and valid (same finite/non-negative guard as the view fields above; a
  // half-present or corrupt pair is dropped as a PAIR — a rawStartBeat
  // without a rawDurationBeats can't reconstruct anything, and keeping one
  // stray field would make deriveQuantizeView read undefined). The note
  // itself is NEVER rejected over bad raw* fields: the quantized view is
  // self-sufficient, losing recallable raw timing beats losing the note.
  const rawStartBeat = r.rawStartBeat, rawDurationBeats = r.rawDurationBeats;
  if (
    typeof rawStartBeat === "number" && Number.isFinite(rawStartBeat) && rawStartBeat >= 0 &&
    typeof rawDurationBeats === "number" && Number.isFinite(rawDurationBeats) && rawDurationBeats >= 0
  ) {
    note.rawStartBeat = rawStartBeat;
    note.rawDurationBeats = rawDurationBeats;
  }
  return note;
}

/** Convert a validated legacy seconds-note to the current beats shape,
 *  using `bpm` (the SAVED, already-clamped bpm from the same blob — see the
 *  schema-v3 comment above for why not the live UI bpm, and the clampBpm
 *  import comment above for why "already-clamped" matters). Pure
 *  arithmetic — delegates to time.ts's secondsToBeats rather than
 *  re-deriving `sec * bpm / 60` here, so this stays the one conversion
 *  chokepoint the rest of the app also uses.
 *
 *  Returns null (dropping the note, same failure class as an
 *  individually-malformed note elsewhere in this file) when the conversion
 *  itself produces a non-finite startBeat/durationBeats. bpm is clamped to
 *  [BPM_MIN, BPM_MAX] by the caller before this runs, so overflow can no
 *  longer come from a runaway bpm — but sanitizeNoteSeconds only bounds
 *  startSec/durationSec below (>= 0), not above, so a corrupt blob can still
 *  carry an astronomically large seconds value that overflows to Infinity
 *  once multiplied by even a small bpm. An Infinity/NaN beat position would
 *  otherwise reach transport.ts's scheduler (beatToAudioTime etc.) and
 *  corrupt playback for the whole score, not just this one note. */
function secondsNoteToBeats(n: LegacySecondsNote, bpm: number): PersistedNote | null {
  const startBeat = secondsToBeats(n.startSec, bpm);
  const durationBeats = secondsToBeats(n.durationSec, bpm);
  if (!Number.isFinite(startBeat) || !Number.isFinite(durationBeats)) return null;

  const note: PersistedNote = { midi: n.midi, velocity: n.velocity, startBeat, durationBeats };
  if (n.vowel) note.vowel = n.vowel;
  if (n.breathiness !== undefined) note.breathiness = n.breathiness;
  if (n.lyric !== undefined) note.lyric = n.lyric;
  return note;
}

/** Validate a persisted custom-tuning cents array: exactly 12 finite
 *  numbers, one per pitch class. Anything else (wrong length, non-numbers,
 *  NaN/Infinity) is dropped rather than restored, so a corrupt/foreign
 *  value can't feed non-finite cents into Web Audio detune math on restore —
 *  same failure class as sanitizeNote above (F-A1-004). */
function sanitizeCustomCents(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw) || raw.length !== 12) return undefined;
  const cents: number[] = [];
  for (const v of raw) {
    if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
    cents.push(v);
  }
  return cents;
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
 *
 * Reads v1, v2, AND v3 forever (v1/v2 funnel through the same seconds->beats
 * conversion — see the schema-v3 comment above); only ever WRITES v3
 * (serializeCockpitState always stamps CURRENT_SCHEMA_VERSION, so v2 is
 * never written again after this migration ships).
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

  // Schema migration funnel: v1 (seconds, no customCents), v2 (seconds,
  // adds customCents, F-A1-004), and v3 (beats — CURRENT_SCHEMA_VERSION)
  // are all accepted; anything else (a not-yet-existing future version, or
  // a garbage/negative version) is rejected outright. Missing `v` is
  // treated as v1, same leniency the pre-v2 reader already had.
  if (r.v !== undefined && r.v !== 1 && r.v !== 2 && r.v !== CURRENT_SCHEMA_VERSION) return null;
  if (!Array.isArray(r.score)) return null;

  // Clamp ONCE here (see the clampBpm import comment above) — the raw value
  // is only type-checked (falls back to DEFAULT_BPM for a non-number field;
  // clampBpm itself falls back to its `prev` arg — DEFAULT_BPM here too —
  // for a non-finite NUMBER like NaN), then clamped into [BPM_MIN, BPM_MAX].
  // This one `bpm` is what both secondsNoteToBeats below AND the returned
  // state's `bpm` field use, so they can never disagree.
  const rawBpm = typeof r.bpm === "number" ? r.bpm : DEFAULT_BPM;
  const bpm = clampBpm(rawBpm, DEFAULT_BPM);
  const refPitch = typeof r.refPitch === "number" && Number.isFinite(r.refPitch) ? r.refPitch : 440;
  const engine = typeof r.engine === "string" ? r.engine : "grand";
  const voice = typeof r.voice === "string" ? r.voice : "kokoro-af-heart";
  const tuning = typeof r.tuning === "string" ? r.tuning : "equal";
  const mode: PersistedMode = r.mode === "vocal" ? "vocal" : "instrument";
  const customCents = sanitizeCustomCents(r.customCents);

  // v1/v2/undefined are both seconds-shaped and were never distinguished
  // by note shape (only by the presence of customCents, handled separately
  // above) — so both funnel through the identical seconds->beats path.
  const isLegacySeconds = r.v === undefined || r.v === 1 || r.v === 2;

  const score: PersistedNote[] = [];
  for (const rawNote of r.score) {
    if (isLegacySeconds) {
      const legacy = sanitizeNoteSeconds(rawNote);
      if (legacy) {
        // secondsNoteToBeats returns null (and the note is dropped, same
        // failure class as any other malformed note in this file) when the
        // conversion overflows to a non-finite startBeat/durationBeats —
        // see its doc comment for why that's still reachable even with bpm
        // now clamped (an unbounded startSec/durationSec can still overflow).
        const converted = secondsNoteToBeats(legacy, bpm);
        if (converted) score.push(converted);
      }
    } else {
      const note = sanitizeNoteBeats(rawNote);
      if (note) score.push(note);
    }
  }

  return {
    v: CURRENT_SCHEMA_VERSION, score, bpm, engine, voice, tuning, refPitch, mode,
    ...(customCents ? { customCents } : {}),
  };
}
