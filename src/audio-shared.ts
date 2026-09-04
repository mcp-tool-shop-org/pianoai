// One AudioContext per process. node-web-audio-api / WASAPI will not mix
// two contexts to the same device — a second context is silent. Piano and
// the sung lead must share this graph.

let shared: { ctx: any } | null = null;

export function setSharedAudioContext(ctx: any | null): void {
  shared = ctx ? { ctx } : null;
}

export function getSharedAudioContext(): any | null {
  return shared?.ctx ?? null;
}
