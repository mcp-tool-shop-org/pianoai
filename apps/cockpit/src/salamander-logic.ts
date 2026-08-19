// Pure sampler math — nearest root, playbackRate, velocity layer.
// Keep in lockstep with scripts/salamander-prune-plan.ts (same formulas).

export interface SampleLayer {
  id: number;
  velLo: number;
  velHi: number;
}

export interface SampleFileRef {
  midi: number;
  layer: number;
  file: string;
  rootMidi: number;
}

export interface SalamanderManifest {
  schemaVersion: number;
  instrument: string;
  license: string;
  roots: number[];
  layers: SampleLayer[];
  files: SampleFileRef[];
}

export function nearestRoot(midi: number, roots: readonly number[]): number {
  if (roots.length === 0) throw new Error("nearestRoot: empty roots");
  let best = roots[0];
  let bestDist = Math.abs(midi - best);
  for (const r of roots) {
    const d = Math.abs(midi - r);
    if (d < bestDist || (d === bestDist && r < best)) {
      best = r;
      bestDist = d;
    }
  }
  return best;
}

export function playbackRateFor(midi: number, rootMidi: number): number {
  return Math.pow(2, (midi - rootMidi) / 12);
}

export function velocityLayer(velocity: number, layers: readonly SampleLayer[]): number {
  const v = Math.max(1, Math.min(127, Math.round(velocity)));
  for (const layer of layers) {
    if (v >= layer.velLo && v <= layer.velHi) return layer.id;
  }
  return layers[layers.length - 1]?.id ?? 0;
}

export function fileFor(midi: number, layer: number, files: readonly SampleFileRef[]): SampleFileRef | null {
  return files.find((f) => f.midi === midi && f.layer === layer) ?? null;
}

/** Every MIDI in 21–108 is within 1.5 semitones of a listed root. */
export function rootsCoverPiano(roots: readonly number[], lo = 21, hi = 108): boolean {
  if (roots.length === 0) return false;
  for (let m = lo; m <= hi; m++) {
    if (Math.abs(m - nearestRoot(m, roots)) > 1.5) return false;
  }
  return true;
}

export function layersOrdered(layers: readonly SampleLayer[]): boolean {
  if (layers.length === 0) return false;
  for (let i = 1; i < layers.length; i++) {
    if (layers[i].velLo !== layers[i - 1].velHi + 1) return false;
    if (layers[i].id <= layers[i - 1].id) return false;
  }
  return layers[0].velLo === 1 && layers[layers.length - 1].velHi === 127;
}
