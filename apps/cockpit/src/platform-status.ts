// ─── Platform-said-no status strings (Wave 4 humanization) ──────────────────
//
// DOM-free decision/reporting helpers so quota / blocked-audio / missing-MIDI
// can be unit-tested without importing main.ts (which boots on load).

/** F-4ac54ea0 — localStorage setItem threw (quota or private mode). */
export const SESSION_SAVE_BLOCKED_MESSAGE =
  "Could not save this session — browser storage is full or blocked. Your work stays until this tab closes; use Export JSON to keep it.";

/** F-9c275158 — AudioContext stayed suspended after resume(). */
export const AUDIO_BLOCKED_MESSAGE =
  "Audio is blocked by the browser — allow sound for this site, then press Play";

/** F-f61250eb — Web MIDI API missing or permission denied. */
export const MIDI_UNAVAILABLE_MESSAGE =
  "Web MIDI is not available or was blocked — the on-screen and QWERTY keyboards still work.";

export function writeStorageItem(
  setItem: (key: string, value: string) => void,
  key: string,
  json: string,
): boolean {
  try {
    setItem(key, json);
    return true;
  } catch {
    return false;
  }
}

/** null when the save succeeded; the status string when it did not. */
export function storageSaveFailureStatus(ok: boolean): string | null {
  return ok ? null : SESSION_SAVE_BLOCKED_MESSAGE;
}

/** True when a constructed context is not running (suspended/interrupted/closed). */
export function isAudioContextBlocked(state: string | undefined | null): boolean {
  return state != null && state !== "running";
}

export function midiUnavailableStatus(apiPresent: boolean): string | null {
  return apiPresent ? null : MIDI_UNAVAILABLE_MESSAGE;
}
