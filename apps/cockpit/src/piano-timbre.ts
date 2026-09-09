// Keep in sync with src/piano-timbre.ts — cockpit tsconfig cannot import src/.

export const PIANO_COMPRESSOR = {
  threshold: -24,
  knee: 18,
  ratio: 2.5,
  attack: 0.008,
  release: 0.28,
} as const;

export function velocityLowpassHz(midiNote: number, velocity01: number): number {
  const vel = Math.max(0, Math.min(1, velocity01));
  const velHz = 1800 + vel * vel * 4700;
  const register = midiNote > 72 ? 1.12 : midiNote < 48 ? 0.88 : 1;
  return Math.max(1400, Math.min(7200, velHz * register));
}
