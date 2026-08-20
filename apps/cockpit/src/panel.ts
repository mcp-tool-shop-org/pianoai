// ─── Composition Panel (slice A) — human-audio blind A/B ──────────────────────
//
// Third header mode. No LLM-judge UI. Every clip is pre-rendered through the
// roll's voice path (panel-clip.ts) and loudness-matched before a trial starts.

import {
  DEFAULT_PANEL_SONGS,
  getPanelSong,
} from "../../../src/compose/human-audio-catalog.js";
import {
  ENGINE_UNAVAILABLE_MESSAGE,
  PANEL_RUNS_STORAGE_KEY,
  buildTrialList,
  detectSystems,
  deserializePanelRuns,
  emptyRunRecord,
  isFloorTrialPair,
  listenerCountLabel,
  parseEngineSpecArray,
  probeLocalModel,
  scoreHumanAudio,
  serializePanelRuns,
  type EngineProbe,
  type HumanAudioRunRecord,
  type HumanAudioSystemId,
  type PairwiseVoteInput,
} from "../../../src/compose/human-audio-panel.js";
import { nearestToneRealization, rootPositionRealization, type ChordProgression } from "../../../src/compose/realize.js";
import { refineRealization } from "../../../src/compose/refine.js";
import { renderSpecRealization } from "../../../src/compose/voicing-spec.js";
import type { Realization } from "../../../src/compose/types.js";
import {
  clipLengthSec,
  clipNotesFor,
  createClipPlayer,
  matchPair,
  renderClipOffline,
  type ClipPlayer,
  type ClipRender,
} from "./panel-clip.js";
import { samplerHandlesVoice } from "./salamander-logic.js";
import type { SamplerPack } from "./salamander-sampler.js";
import type { Synth, VoiceId } from "./synth.js";

export type CockpitUiMode = "instrument" | "vocal" | "panel";

export interface PanelHost {
  getSynth(): Synth;
  getSamplerPack(): SamplerPack | null;
  samplerReady(): boolean;
  ensureAudio(): Promise<AudioContext>;
  voiceId(): VoiceId;
}

const $ = (id: string) => document.getElementById(id)!;

let host: PanelHost;
let run: HumanAudioRunRecord | null = null;
let trialIndex = 0;
let player: ClipPlayer | null = null;
let audition: "A" | "B" | "ref" | null = null;
let playhead = 0;
let pair: { a: ClipRender; b: ClipRender; ref: ClipRender; gainA: number; gainB: number } | null = null;
let realizations = new Map<string, Realization>();
let engineProbe: EngineProbe = { reachable: false, reason: "not probed" };
let lastScoreMode: "instrument" | "vocal" = "instrument";
let preparing = false;

const ENGINE_URL = "http://127.0.0.1:11434";

export function getLastScoreMode(): "instrument" | "vocal" {
  return lastScoreMode;
}

export function rememberScoreMode(m: "instrument" | "vocal"): void {
  lastScoreMode = m;
}

export function bindPanel(h: PanelHost): void {
  host = h;
  $("panel-start").addEventListener("click", () => { void startRun(); });
  $("panel-export").addEventListener("click", exportRun);
  $("panel-ref").addEventListener("click", () => { void playSide("ref"); });
  $("panel-a").addEventListener("click", () => { void playSide("A"); });
  $("panel-b").addEventListener("click", () => { void playSide("B"); });
  $("panel-play").addEventListener("click", () => { void togglePlay(); });
  $("panel-stop").addEventListener("click", stopPlayback);
  $("panel-restart").addEventListener("click", () => { void restartClip(); });
  $("panel-vote-a").addEventListener("click", () => vote("A"));
  $("panel-vote-b").addEventListener("click", () => vote("B"));
  $("panel-seed").addEventListener("click", rerollSeed);
  ($("panel-seed-value") as HTMLInputElement).value = String((Math.random() * 1e9) | 0);
  renderConfigRail();
}

export function enterPanelMode(): void {
  document.body.classList.add("panel-mode");
  document.body.classList.remove("vocal-mode");
  $("mode-panel").classList.add("active");
  $("mode-instrument").classList.remove("active");
  $("mode-vocal").classList.remove("active");
  $("mode-panel").setAttribute("aria-pressed", "true");
  $("mode-instrument").setAttribute("aria-pressed", "false");
  $("mode-vocal").setAttribute("aria-pressed", "false");
  renderConfigRail();
  renderTrial();
  renderOutcome();
}

export function leavePanelMode(): void {
  document.body.classList.remove("panel-mode");
  $("mode-panel").classList.remove("active");
  $("mode-panel").setAttribute("aria-pressed", "false");
  stopPlayback();
}

/** @returns true when the event was handled (caller should preventDefault). */
export function handlePanelKey(e: KeyboardEvent): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.code === "Digit1" || e.key === "1") { void playSide("A"); return true; }
  if (e.code === "Digit2" || e.key === "2") { void playSide("B"); return true; }
  if (e.code === "Space" || e.key === " ") { void togglePlay(); return true; }
  if (e.key === "Escape") { stopPlayback(); return true; }
  if (e.key === "Enter" && (audition === "A" || audition === "B")) { vote(audition); return true; }
  if (e.key.toLowerCase() === "r") { void playSide("ref"); return true; }
  return false;
}

export function loadStoredRuns(): HumanAudioRunRecord[] {
  try {
    const raw = localStorage.getItem(PANEL_RUNS_STORAGE_KEY);
    return raw ? deserializePanelRuns(raw) : [];
  } catch {
    return [];
  }
}

function saveCurrentRun(): void {
  if (!run) return;
  try {
    const prev = loadStoredRuns().filter((r) => r.createdAt !== run!.createdAt);
    localStorage.setItem(PANEL_RUNS_STORAGE_KEY, serializePanelRuns([run, ...prev].slice(0, 20)));
  } catch { /* private mode / quota */ }
}

function selectedSongIds(): string[] {
  const boxes = document.querySelectorAll<HTMLInputElement>("#panel-songs input[type=checkbox]");
  const ids = [...boxes].filter((b) => b.checked).map((b) => b.value);
  return ids.length > 0 ? ids : DEFAULT_PANEL_SONGS.map((s) => s.id);
}

function rerollSeed(): void {
  ($("panel-seed-value") as HTMLInputElement).value = String((Math.random() * 1e9) | 0);
}

function renderConfigRail(): void {
  const list = $("panel-songs");
  if (!list.dataset.ready) {
    list.innerHTML = DEFAULT_PANEL_SONGS.map((s) => (
      `<label class="panel-song"><input type="checkbox" value="${s.id}" checked> ` +
      `<span>${s.title}</span><em>${s.genre} · ${s.key}</em></label>`
    )).join("");
    list.dataset.ready = "1";
  }
  const systems = detectSystems(engineProbe.reachable);
  $("panel-systems").innerHTML = systems.map((id) => `<span class="panel-chip">${id}</span>`).join("")
    + (engineProbe.reachable ? "" : `<p class="panel-note">${ENGINE_UNAVAILABLE_MESSAGE}</p>`);
  if (engineProbe.corsBlocked) {
    $("panel-systems").innerHTML += `<p class="panel-note">Browser could not reach the local model (CORS or no server). Slice B owns the bridge.</p>`;
  }
  $("panel-n-label").textContent = listenerCountLabel(countIndependentListeners());
}

function countIndependentListeners(): number {
  // One browser profile is one seat. Run count is NOT listener count — three
  // runs by one person are still one listener. The ≥3-independent robust
  // claim only materializes when separately exported runs from different
  // listeners are aggregated outside this cockpit.
  return 1;
}

async function startRun(): Promise<void> {
  if (preparing) return;
  preparing = true;
  try {
    setStatus("Probing the local model and building trials…");
    engineProbe = await probeLocalModel(fetch);
    const systems = detectSystems(engineProbe.reachable);
    const seed = Number(($("panel-seed-value") as HTMLInputElement).value) >>> 0;
    const songIds = selectedSongIds();
    const trials = buildTrialList({ songIds, systems, seed });
    run = emptyRunRecord({
      seed,
      createdAt: new Date().toISOString(),
      songIds,
      systems,
      engineTag: engineProbe.reachable ? "reachable" : "unavailable",
      engineProbe,
      trials,
    });
    trialIndex = 0;
    realizations = new Map();
    renderConfigRail();
    await prepareCurrentTrial();
    saveCurrentRun();
  } finally {
    preparing = false;
  }
}

async function realize(songId: string, system: HumanAudioSystemId): Promise<Realization> {
  const key = `${songId}:${system}`;
  const hit = realizations.get(key);
  if (hit) return hit;
  const song = getPanelSong(songId);
  if (!song) throw new Error(`unknown song ${songId}`);
  const progression: ChordProgression = { key: song.key, chords: song.chords };
  let real: Realization;
  if (system === "floor") real = rootPositionRealization(progression, 4);
  else if (system === "nearest") real = nearestToneRealization(progression, 4);
  else if (system === "refined") {
    real = refineRealization(nearestToneRealization(progression, 4), { voices: 4, style: "lead-sheet" }).realization;
  } else {
    // Never silently substitute another system for the engine — a faked
    // engine clip would poison the ranking. Failing loudly is the honest path,
    // and marking the engine unusable makes the next run's k=3 detection true.
    const engine = await realizeEngine(progression);
    if (!engine) {
      engineProbe = { reachable: false, reason: "the local model answered but returned no usable voicing" };
      throw new Error(
        "the engine system did not return a usable voicing, so this trial cannot be presented honestly. Start a new run — it will continue without the engine system.",
      );
    }
    real = engine;
  }
  realizations.set(key, real);
  return real;
}

async function realizeEngine(progression: ChordProgression): Promise<Realization | null> {
  if (!engineProbe.reachable) return null;
  // Ollama's format:"json" forbids a bare array, so the contract is a single
  // wrapper object the model can actually emit. One bounded retry for a flaky
  // emission — a partial or unusable answer is null, never a substitute.
  const measures = progression.chords.map((c) => c.measure);
  const user = [
    `# Voice this progression in ${progression.key} — 4 voices per chord, bass to soprano.`,
    "",
    "| Measure | Chord |",
    "|---------|-------|",
    ...progression.chords.map((c) => `| ${c.measure} | ${c.chordSymbol} |`),
    "",
    `Return ONE JSON object: {"specs": [{"measure": <n>, "degrees": [four chord-note numbers, low to high]}, ...]}`,
    `with exactly one entry for every measure in the table (measures ${Math.min(...measures)}–${Math.max(...measures)}).`,
  ].join("\n");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${ENGINE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "qwen2.5:7b",
          stream: false,
          format: "json",
          messages: [
            { role: "system", content: 'You are a keyboard part-writer. Reply with ONE JSON object of the form {"specs": [{"measure": n, "degrees": [...]}, ...]} — one entry per measure, degrees are chord-tone indices low to high. No prose.' },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) continue;
      const data = await res.json() as { message?: { content?: string } };
      const specs = parseEngineSpecArray(data.message?.content ?? "");
      if (specs.length < progression.chords.length) continue;
      return renderSpecRealization(progression, specs, 4);
    } catch {
      // fall through to the retry, then to null
    }
  }
  return null;
}

async function prepareCurrentTrial(): Promise<void> {
  if (!run) return;
  const trial = run.trials[trialIndex];
  if (!trial) { renderTrial(); renderOutcome(); return; }
  setStatus("Rendering the reference, A, and B through the same piano the roll plays…");
  stopPlayback();
  pair = null;
  const ctx = await host.ensureAudio();
  if (!player) player = createClipPlayer(ctx, ctx.destination);
  const song = getPanelSong(trial.songId);
  if (!song) { setStatus("Missing catalog song."); return; }
  let realA: Realization;
  let realB: Realization;
  try {
    [realA, realB] = await Promise.all([realize(trial.songId, trial.sideA), realize(trial.songId, trial.sideB)]);
  } catch (err) {
    setStatus(`Audio halt: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  const notesA = clipNotesFor(song.melody, realA, song.beatsPerMeasure);
  const notesB = clipNotesFor(song.melody, realB, song.beatsPerMeasure);
  const notesR = clipNotesFor(song.melody, undefined, song.beatsPerMeasure);
  // Same door selection as the roll: the sampler only ever handles the sampled
  // voice — any other selected voice must sound synth here exactly as it does
  // when playing notes in the roll (parity is the acceptance test).
  const voiceId = host.voiceId();
  const pack = samplerHandlesVoice(voiceId) && host.samplerReady() ? host.getSamplerPack() : null;
  const dur = Math.max(
    clipLengthSec(notesA, song.beatsPerMeasure, song.measures, song.bpm),
    clipLengthSec(notesB, song.beatsPerMeasure, song.measures, song.bpm),
  );
  let a: ClipRender;
  let b: ClipRender;
  let ref: ClipRender;
  try {
    [a, b, ref] = await Promise.all([
      renderClipOffline({ notes: notesA, durationSec: dur, bpm: song.bpm, voiceId, pack }),
      renderClipOffline({ notes: notesB, durationSec: dur, bpm: song.bpm, voiceId, pack }),
      renderClipOffline({ notes: notesR, durationSec: dur, bpm: song.bpm, voiceId, pack }),
    ]);
  } catch (err) {
    setStatus(`Audio halt: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }
  const match = matchPair(a, b);
  if (!match.ok) {
    setStatus(`ANDON — ${match.reason}. Unmatched A/B will not be presented.`);
    return;
  }
  pair = { a, b, ref, gainA: match.gainA, gainB: match.gainB };
  run.loudness = run.loudness.filter((l) => l.trialId !== trial.id);
  run.loudness.push({
    trialId: trial.id,
    rmsA: a.rms,
    rmsB: b.rms,
    offsetDbA: match.offsetDbA,
    offsetDbB: match.offsetDbB,
    gainA: match.gainA,
    gainB: match.gainB,
    voicePath: a.voicePath,
  });
  playhead = 0;
  audition = null;
  setStatus(`Trial ${trialIndex + 1} / ${run.trials.length} — ${song.title}. Hear A and B, then pick which backing fits.`);
  renderTrial();
  renderOutcome();
}

async function playSide(side: "A" | "B" | "ref"): Promise<void> {
  if (!pair || !player) return;
  const ctx = await host.ensureAudio();
  if (ctx.state === "suspended") await ctx.resume();
  const keep = audition === side || audition === "A" || audition === "B" ? player.currentOffset() : 0;
  if (side === "ref") {
    playhead = 0;
    player.play(pair.ref.buffer, 1, 0);
  } else {
    playhead = keep;
    const buf = side === "A" ? pair.a.buffer : pair.b.buffer;
    const gain = side === "A" ? pair.gainA : pair.gainB;
    player.play(buf, gain, playhead);
  }
  audition = side;
  renderTrial();
}

async function togglePlay(): Promise<void> {
  if (!player || !pair) return;
  if (player.playing()) {
    playhead = player.pause();
    renderTrial();
    return;
  }
  await playSide(audition === "ref" ? "ref" : audition ?? "A");
}

async function restartClip(): Promise<void> {
  playhead = 0;
  if (player) player.stop();
  if (audition) await playSide(audition);
}

function stopPlayback(): void {
  playhead = 0;
  player?.stop();
  renderTrial();
}

function vote(picked: "A" | "B"): void {
  if (!run || preparing) return;
  const trial = run.trials[trialIndex];
  if (!trial || !pair) return;
  run.votes.push({
    trialId: trial.id,
    picked,
    sideA: trial.sideA,
    sideB: trial.sideB,
    at: new Date().toISOString(),
  });
  stopPlayback();
  pair = null;
  trialIndex += 1;
  saveCurrentRun();
  void prepareCurrentTrial();
}

function setStatus(msg: string): void {
  $("panel-status").textContent = msg;
}

function renderTrial(): void {
  if (!run) {
    $("panel-trial").hidden = true;
    return;
  }
  $("panel-trial").hidden = false;
  const trial = run.trials[trialIndex];
  $("panel-progress").textContent = trial
    ? `Trial ${trialIndex + 1} of ${run.trials.length}`
    : `Run complete — ${run.votes.length} votes`;
  $("panel-song-name").textContent = trial ? (getPanelSong(trial.songId)?.title ?? trial.songId) : "—";
  $("panel-a").classList.toggle("active", audition === "A");
  $("panel-b").classList.toggle("active", audition === "B");
  $("panel-ref").classList.toggle("active", audition === "ref");
  $("panel-play").textContent = player?.playing() ? "Pause" : "Play";
  const ready = !!pair && !!trial;
  ($("panel-a") as HTMLButtonElement).disabled = !ready;
  ($("panel-b") as HTMLButtonElement).disabled = !ready;
  ($("panel-ref") as HTMLButtonElement).disabled = !ready;
  ($("panel-vote-a") as HTMLButtonElement).disabled = !ready;
  ($("panel-vote-b") as HTMLButtonElement).disabled = !ready;
}

function floorStats(r: HumanAudioRunRecord): { floorTrials: number; mis: number; validWins: number } {
  let floorTrials = 0;
  let mis = 0;
  let validWins = 0;
  for (const v of r.votes) {
    const t = r.trials.find((x) => x.id === v.trialId);
    if (!t || !isFloorTrialPair(t.sideA, t.sideB)) continue;
    floorTrials++;
    const picked = v.picked === "A" ? t.sideA : t.sideB;
    if (picked === "floor") mis++;
    else validWins++;
  }
  return { floorTrials, mis, validWins };
}

function renderOutcome(): void {
  const box = $("panel-outcome");
  if (!run || run.votes.length === 0) {
    box.innerHTML = `<p class="panel-note">No votes yet. Start a run and pick which backing fits the tune.</p>`;
    return;
  }
  const { floorTrials, mis, validWins } = floorStats(run);
  const votes: PairwiseVoteInput[] = run.votes.map((v) => ({
    sideA: v.sideA, sideB: v.sideB, picked: v.picked, family: "cockpit-listener",
  }));
  const out = scoreHumanAudio({
    systems: run.systems,
    votes,
    seed: run.seed,
    floorTrials,
    floorMisPicks: mis,
    remainingFloorWinsForValid: validWins,
    remainingFloorTrials: floorTrials,
    listenerCount: countIndependentListeners(),
    enginePresent: run.engineTag === "reachable",
  });
  run.outcome = out;
  const tone = out.uninterpretable ? "danger" : out.provisional ? "amber" : "ok";
  const scores = out.result.scores.map((s) => (
    `<div class="panel-score">` +
    `<strong>${s.id}</strong>` +
    `<span class="mono">${s.bwsScore.toFixed(2)}  [${s.ci[0].toFixed(2)}, ${s.ci[1].toFixed(2)}]</span>` +
    `</div>`
  )).join("");
  const pairLines = Object.entries(out.pairLabels).map(([k, lab]) => `<li><span class="mono">${k}</span> — ${lab}</li>`).join("");
  const rankingLine = out.uninterpretable
    ? "Scores are shown for the record only — the floor gate failed, so this is not a system ranking."
    : `Ranking (best→worst): ${out.result.ranking.join(" > ") || "—"}`;
  box.innerHTML = `
    <div class="panel-verdict ${tone}">
      <h3>${out.rankingHeadline}</h3>
      <p>${out.result.verdict}</p>
    </div>
    <p class="panel-note">${out.nextStep}</p>
    <p class="panel-note">Listener framing: <strong>${out.listenerLabel}</strong>. ${
      out.screened ? "This listener is screened out — votes excluded from the published ranking." : ""
    }</p>
    <div class="panel-scores">${scores}</div>
    <p class="panel-note">${rankingLine}</p>
    <ul class="panel-pairs">${pairLines}</ul>
    <p class="panel-note">Scores carry bootstrap 95% confidence intervals — never a bare point estimate.</p>
  `;
}

function exportRun(): void {
  if (!run) {
    setStatus("No run to export yet.");
    return;
  }
  renderOutcome();
  const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `panel-run-${run.seed}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
