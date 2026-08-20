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
  HUMAN_AUDIO_SYSTEMS,
  PANEL_RUNS_STORAGE_KEY,
  buildTrialList,
  detectSystems,
  emptyRunRecord,
  isFloorTrialPair,
  listenerCountLabel,
  parseEngineSpecArray,
  probeLocalModel,
  scoreHumanAudio,
  type EngineProbe,
  type HumanAudioRunRecord,
  type HumanAudioSystemId,
  type PairwiseVoteInput,
} from "../../../src/compose/human-audio-panel.js";
import {
  NO_ELIGIBLE_JUDGES_MESSAGE,
  comparePanelRankings,
  deserializeAllPanelRuns,
  eligibleJudges,
  emptyLlmRunRecord,
  isHumanAudioRun,
  isLlmRun,
  parseJudgeReply,
  parseOllamaTagNames,
  rankingChartModel,
  serializeAllPanelRuns,
  type JudgeSeat,
  type LlmPanelRunRecord,
  type PanelStoredRun,
} from "../../../src/compose/llm-panel.js";
import { aggregatePanel, interpretPanel, renderVoicingText, makeRng, shuffledOrder } from "../../../src/compose/bws.js";
import { buildJudgePrompt } from "../../../src/compose/bws-judge-text.js";
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
let subMode: "human" | "llm" = "human";
let llmRun: LlmPanelRunRecord | null = null;
let judgeSeats: JudgeSeat[] = [];

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
  $("panel-sub-human").addEventListener("click", () => setSubMode("human"));
  $("panel-sub-llm").addEventListener("click", () => setSubMode("llm"));
  $("panel-llm-start").addEventListener("click", () => { void startLlmRun(); });
  $("panel-llm-export").addEventListener("click", exportLlmRun);
  $("panel-cmp-go").addEventListener("click", renderCompare);
  $("panel-llm-view").addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-drill]");
    if (btn) void playDrillDown(btn.dataset.drillSong ?? "", btn.dataset.drillSys ?? "");
  });
  renderConfigRail();
  renderHistory();
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
  renderHistory();
  void refreshJudgeRoster();
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
  if (subMode === "llm") {
    if (e.key === "Escape") { stopPlayback(); return true; }
    return false;
  }
  if (e.code === "Digit1" || e.key === "1") { void playSide("A"); return true; }
  if (e.code === "Digit2" || e.key === "2") { void playSide("B"); return true; }
  if (e.code === "Space" || e.key === " ") { void togglePlay(); return true; }
  if (e.key === "Escape") { stopPlayback(); return true; }
  if (e.key === "Enter" && (audition === "A" || audition === "B")) { vote(audition); return true; }
  if (e.key.toLowerCase() === "r") { void playSide("ref"); return true; }
  return false;
}

function loadAllRuns(): PanelStoredRun[] {
  try {
    const raw = localStorage.getItem(PANEL_RUNS_STORAGE_KEY);
    return raw ? deserializeAllPanelRuns(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredRun(rec: PanelStoredRun): void {
  try {
    const prev = loadAllRuns().filter((r) => r.createdAt !== rec.createdAt);
    localStorage.setItem(PANEL_RUNS_STORAGE_KEY, serializeAllPanelRuns([rec, ...prev].slice(0, 20)));
    renderHistory();
  } catch { /* private mode / quota */ }
}

function saveCurrentRun(): void {
  if (run) saveStoredRun(run);
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
      `<label class="panel-song" title="${s.title}"><input type="checkbox" value="${s.id}" checked> ` +
      `<span>${s.title}</span><em>${s.genre} · ${s.key}</em></label>`
    )).join("");
    list.dataset.ready = "1";
  }
  const systems = detectSystems(engineProbe.reachable);
  $("panel-systems").innerHTML = systems.map((id) => `<span class="panel-chip" title="${id}">${id}</span>`).join("")
    + (engineProbe.reachable ? "" : `<p class="panel-banner failed">${ENGINE_UNAVAILABLE_MESSAGE}. Start Ollama locally and open Panel again.</p>`);
  if (engineProbe.corsBlocked) {
    $("panel-systems").innerHTML += `<p class="panel-banner failed">This origin cannot reach the local model (CORS). Start Ollama, or run the cockpit from a same-origin page.</p>`;
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
    setStatus("Probing the local model and building trials…", "loading");
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
      // The engine system is RefiningProposer(OllamaSpecRealizer): the model
      // proposes the voicing spec, then the part-at-a-time refiner repairs it
      // (the S2 finding — refine is what takes a raw proposal to valid).
      // Rendering the raw spec alone would be a weaker system than the one
      // the panel claims to rank.
      const proposed = renderSpecRealization(progression, specs, 4);
      return refineRealization(proposed, { voices: 4, style: "lead-sheet" }).realization;
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
  setStatus("Rendering the reference, A, and B through the same piano the roll plays…", "loading");
  stopPlayback();
  pair = null;
  const ctx = await host.ensureAudio();
  if (!player) player = createClipPlayer(ctx, ctx.destination);
  const song = getPanelSong(trial.songId);
  if (!song) { setStatus("This song is not in the catalog. Pick another song and start again.", "failed"); return; }
  let realA: Realization;
  let realB: Realization;
  try {
    [realA, realB] = await Promise.all([realize(trial.songId, trial.sideA), realize(trial.songId, trial.sideB)]);
  } catch (err) {
    setStatus(`Could not realize a voicing (${err instanceof Error ? err.message : String(err)}). Start a new run.`, "failed");
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
    setStatus(`Could not realize a voicing (${err instanceof Error ? err.message : String(err)}). Start a new run.`, "failed");
    return;
  }
  const match = matchPair(a, b);
  if (!match.ok) {
    setStatus(`ANDON — ${match.reason}. This trial will not play. Start a new run.`, "failed");
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

function setStatus(msg: string, kind: "info" | "loading" | "empty" | "failed" = "info"): void {
  const el = $("panel-status");
  el.textContent = msg;
  el.className = kind === "info" ? "" : `panel-banner ${kind}`;
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
    box.innerHTML = `<p class="panel-banner empty">No votes yet. Start a run, then pick which backing fits the tune.</p>`;
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
      ${floorGatePill(out.result.interpretable)}
      <p>${out.result.verdict}</p>
    </div>
    ${rankingChartHtml(out.result.scores)}
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
    setStatus("No run to export yet. Finish at least one trial, then export.", "empty");
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

function setSubMode(next: "human" | "llm"): void {
  subMode = next;
  stopPlayback();
  $("panel-sub-human").classList.toggle("active", next === "human");
  $("panel-sub-llm").classList.toggle("active", next === "llm");
  $("panel-sub-human").setAttribute("aria-selected", String(next === "human"));
  $("panel-sub-llm").setAttribute("aria-selected", String(next === "llm"));
  $("panel-human-config").hidden = next !== "human";
  $("panel-llm-config").hidden = next !== "llm";
  $("panel-trial").hidden = next !== "human" || !run;
  $("panel-outcome").hidden = next !== "human";
  $("panel-llm-view").hidden = next !== "llm";
  if (next === "llm") {
    void refreshJudgeRoster();
    renderLlmView();
  } else {
    renderTrial();
    renderOutcome();
  }
}

function floorGatePill(passed: boolean): string {
  return `<span class="panel-pill ${passed ? "ok" : "danger"}">Floor gate ${passed ? "PASSED" : "FAILED"}</span>`;
}

function rankingChartHtml(scores: { id: string; bwsScore: number; ci: [number, number]; btStrength: number; best: number; worst: number; appearances: number }[]): string {
  const bars = rankingChartModel(scores);
  const rows = bars.map((b) => (
    `<div class="panel-chart-row">` +
    `<span title="${b.id}">${b.id}</span>` +
    `<div class="panel-chart-track" aria-hidden="true">` +
    `<i class="panel-chart-zero" style="left:${b.zeroPct}%"></i>` +
    `<i class="panel-chart-bar ${b.negative ? "neg" : "pos"}" style="left:${b.leftPct}%;width:${b.widthPct}%"></i>` +
    `<i class="panel-chart-wh" style="left:${Math.min(b.whiskerLoPct, b.whiskerHiPct)}%;width:${Math.max(0.5, Math.abs(b.whiskerHiPct - b.whiskerLoPct))}%"></i>` +
    `</div>` +
    `<span class="mono">${b.score.toFixed(2)}</span>` +
    `</div>`
  )).join("");
  return `<div class="panel-chart" role="img" aria-label="Bradley-Terry BWS scores from −1 to 1 with 95% confidence whiskers">${rows}</div>`;
}

async function refreshJudgeRoster(): Promise<void> {
  const empty = $("panel-llm-empty");
  const start = $("panel-llm-start") as HTMLButtonElement;
  const box = $("panel-llm-judges");
  const probe = await probeLocalModel(fetch);
  engineProbe = probe;
  renderConfigRail();
  if (!probe.reachable) {
    judgeSeats = [];
    box.innerHTML = "";
    empty.hidden = false;
    empty.className = "panel-banner failed";
    empty.textContent = ENGINE_UNAVAILABLE_MESSAGE + " Start Ollama locally, then open this tab again.";
    start.disabled = true;
    return;
  }
  try {
    const res = await fetch(`${ENGINE_URL}/api/tags`);
    const names = parseOllamaTagNames(await res.json());
    judgeSeats = eligibleJudges(names);
  } catch {
    judgeSeats = [];
  }
  if (judgeSeats.length === 0) {
    box.innerHTML = "";
    empty.hidden = false;
    empty.className = "panel-banner failed";
    empty.textContent = NO_ELIGIBLE_JUDGES_MESSAGE;
    start.disabled = true;
    return;
  }
  empty.hidden = true;
  start.disabled = false;
  box.innerHTML = judgeSeats.map((s) => `<span class="panel-chip" title="${s.model} (${s.family})">${s.model} <em>(${s.family})</em></span>`).join("");
}

async function startLlmRun(): Promise<void> {
  if (preparing) return;
  preparing = true;
  ($("panel-llm-start") as HTMLButtonElement).disabled = true;
  try {
    await refreshJudgeRoster();
    if (judgeSeats.length === 0) {
      setStatus(NO_ELIGIBLE_JUDGES_MESSAGE, "failed");
      return;
    }
    const seed = Number(($("panel-seed-value") as HTMLInputElement).value) >>> 0;
    const songIds = selectedSongIds();
    const systems = detectSystems(engineProbe.reachable);
    llmRun = emptyLlmRunRecord({
      seed,
      createdAt: new Date().toISOString(),
      songIds,
      systems,
      engineTag: engineProbe.reachable ? "reachable" : "unavailable",
      engineProbe,
      judges: judgeSeats.map((s) => ({ ...s, status: "ok" })),
    });
    const failed = new Set<string>();
    let step = 0;
    const total = songIds.length * judgeSeats.length;
    llmRun.votesPossible = total;
    const reals: Record<string, Record<string, Awaited<ReturnType<typeof realize>>>> = {};
    for (const songId of songIds) {
      reals[songId] = {};
      for (const sys of systems) {
        setStatus(`Realizing ${songId} / ${sys}…`, "loading");
        reals[songId][sys] = await realize(songId, sys);
      }
    }
    for (let si = 0; si < songIds.length; si++) {
      const songId = songIds[si];
      const song = getPanelSong(songId);
      const progression = song ? { key: song.key, chords: song.chords } : { key: "C major", chords: [] };
      for (let fi = 0; fi < judgeSeats.length; fi++) {
        const seat = judgeSeats[fi];
        step++;
        setStatus(`Judging ${songId} with ${seat.model} (${step}/${total})…`, "loading");
        if (failed.has(seat.model)) {
          continue;
        }
        const order = shuffledOrder(systems.length, makeRng(1000 * (si + 1) + 31 * (fi + 1) + seed));
        const orderedIds = order.map((k) => systems[k]);
        const optionsText = orderedIds.map((id) => renderVoicingText(reals[songId][id]));
        const prompt = buildJudgePrompt(progression.key, optionsText);
        const vote = await askJudge(seat.model, prompt.system, prompt.user, seed + si * 10 + fi, systems.length);
        if (!vote) {
          failed.add(seat.model);
          const rec = llmRun.judges.find((j) => j.model === seat.model);
          if (rec) {
            rec.status = "failed";
            rec.failReason = "unusable reply or unreachable — not asked again this run";
          }
          continue;
        }
        llmRun.votes.push({
          songId,
          judgeModel: seat.model,
          family: seat.family,
          options: order,
          best: vote.best,
          worst: vote.worst,
          tuple: orderedIds,
        });
        llmRun.bwsVotes.push({ options: order, best: vote.best, worst: vote.worst, family: seat.family });
        llmRun.tupleSystems.push(orderedIds);
      }
    }
    llmRun.votesCollected = llmRun.bwsVotes.length;
    const bare = systems.map((id) => HUMAN_AUDIO_SYSTEMS[id]);
    const agg = aggregatePanel(bare, llmRun.bwsVotes, llmRun.tupleSystems, { bootstrap: 200, seed });
    const engineId = systems.includes("engine") ? "engine" : "refined";
    llmRun.result = interpretPanel(agg, { floor: "floor", valid: "refined", engine: engineId });
    saveStoredRun(llmRun);
    renderLlmView();
    renderHistory();
    setStatus(`Local-model run complete — ${llmRun.votesCollected}/${llmRun.votesPossible} votes. Directional only.`);
  } catch (err) {
    setStatus(`Local-model run halted: ${err instanceof Error ? err.message : String(err)}. Start a new run.`, "failed");
  } finally {
    preparing = false;
    ($("panel-llm-start") as HTMLButtonElement).disabled = judgeSeats.length === 0;
  }
}

async function askJudge(
  model: string,
  system: string,
  user: string,
  seed: number,
  k: number,
): Promise<{ best: number; worst: number } | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${ENGINE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          format: "json",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          options: { seed: seed + attempt },
        }),
      });
      if (!res.ok) continue;
      const data = await res.json() as { message?: { content?: string } };
      const parsed = parseJudgeReply(data.message?.content ?? "", k);
      if (parsed) return parsed;
    } catch {
      /* retry once */
    }
  }
  return null;
}

function renderLlmView(): void {
  const box = $("panel-llm-view");
  if (subMode !== "llm") {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  if (!llmRun || !llmRun.result) {
    box.innerHTML = `<p class="panel-banner empty">No local-model run yet. Choose songs, confirm judges on the rail, then start. Eligible judges are installed chat models outside the qwen2.5 generator family.</p>`;
    return;
  }
  const r = llmRun.result;
  const tone = r.interpretable ? (r.verdict.startsWith("INCONCLUSIVE") ? "amber" : "ok") : "danger";
  const tiles = r.scores.map((s) => (
    `<div class="panel-score"><strong>${s.id}</strong>` +
    `<span class="mono">${s.bwsScore.toFixed(2)}  [${s.ci[0].toFixed(2)}, ${s.ci[1].toFixed(2)}]</span></div>`
  )).join("");
  const failed = llmRun.judges.filter((j) => j.status === "failed");
  const failNote = failed.length
    ? `<p class="panel-banner failed">Judges marked unusable this run: ${failed.map((j) => `${j.model} (${j.failReason ?? "failed"})`).join("; ")}. Votes they already cast stay in the record. Start a new run to retry them.</p>`
    : "";
  const drills = llmRun.songIds.map((songId) => {
    const title = getPanelSong(songId)?.title ?? songId;
    const btns = llmRun!.systems.map((sys) =>
      `<button type="button" data-drill data-drill-song="${songId}" data-drill-sys="${sys}">${title} · ${sys}</button>`,
    ).join("");
    return `<div class="panel-drill">${btns}</div>`;
  }).join("");
  box.innerHTML = `
    <div class="panel-verdict ${tone}">
      <h3>${r.verdict.split(" — ")[0]}</h3>
      ${floorGatePill(r.interpretable)}
      <p>${r.verdict}</p>
    </div>
    ${rankingChartHtml(r.scores)}
    <div class="panel-scores">${tiles}</div>
    <p class="panel-note">Ranking (best→worst): ${r.ranking.join(" > ")}</p>
    <p class="panel-note">Votes ${llmRun.votesCollected}/${llmRun.votesPossible}. Seed ${llmRun.seed}. Directional only.</p>
    ${failNote}
    <h2>Hear a voicing</h2>
    <p class="panel-note">Plays through the same piano as the roll. Nothing starts until you press a button.</p>
    ${drills}
  `;
}

async function playDrillDown(songId: string, sys: string): Promise<void> {
  const song = getPanelSong(songId);
  if (!song || !host) return;
  setStatus(`Rendering ${song.title} / ${sys}…`, "loading");
  const real = await realize(songId, sys as HumanAudioSystemId);
  const notes = clipNotesFor(song.melody, real, song.beatsPerMeasure);
  const ctx = await host.ensureAudio();
  if (ctx.state === "suspended") await ctx.resume();
  if (!player) player = createClipPlayer(ctx, ctx.destination);
  const pack = samplerHandlesVoice(host.voiceId()) && host.samplerReady() ? host.getSamplerPack() : null;
  const dur = clipLengthSec(notes, song.beatsPerMeasure, song.measures, song.bpm);
  const clip = await renderClipOffline({
    notes, durationSec: dur, bpm: song.bpm, voiceId: host.voiceId(), pack,
  });
  player.play(clip.buffer, 1, 0);
  setStatus(`Playing ${song.title} · ${sys}. Esc stops.`);
}

function exportLlmRun(): void {
  if (!llmRun) {
    setStatus("No local-model run to export yet. Start a local-model run first.", "empty");
    return;
  }
  const blob = new Blob([JSON.stringify(llmRun, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `panel-llm-${llmRun.seed}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function renderHistory(): void {
  const box = $("panel-history");
  const humanSel = $("panel-cmp-human") as HTMLSelectElement;
  const llmSel = $("panel-cmp-llm") as HTMLSelectElement;
  const runs = loadAllRuns();
  if (runs.length === 0) {
    box.innerHTML = `<p class="panel-banner empty">No stored runs yet. Finish a by-ear or local-model run to see it here.</p>`;
    humanSel.innerHTML = "";
    llmSel.innerHTML = "";
    return;
  }
  box.innerHTML = runs.map((r) => {
    const kind = r.kind === "llm" ? "local-model" : "human-audio";
    const verdict = r.kind === "llm"
      ? (r.result?.verdict.split(" — ")[0] ?? "in progress")
      : (r.outcome?.rankingHeadline ?? "in progress");
    const label = `${kind} · ${r.songIds.join(", ")} · seed ${r.seed} · ${verdict}`;
    return `<button type="button" class="panel-history-item" data-hist="${r.createdAt}" title="${label}">` +
      `<span class="panel-kind">${kind}</span>${r.songIds.join(", ")} · seed ${r.seed} · ${verdict}</button>`;
  }).join("");
  box.querySelectorAll<HTMLButtonElement>("[data-hist]").forEach((btn) => {
    btn.addEventListener("click", () => openHistoryRun(btn.dataset.hist ?? ""));
  });
  const humans = runs.filter(isHumanAudioRun);
  const llms = runs.filter(isLlmRun);
  humanSel.innerHTML = humans.map((r) =>
    `<option value="${r.createdAt}">${r.createdAt.slice(0, 16)} · ${r.songIds.join(",")}</option>`,
  ).join("");
  llmSel.innerHTML = llms.map((r) =>
    `<option value="${r.createdAt}">${r.createdAt.slice(0, 16)} · ${r.songIds.join(",")}</option>`,
  ).join("");
}

function openHistoryRun(createdAt: string): void {
  const rec = loadAllRuns().find((r) => r.createdAt === createdAt);
  if (!rec) return;
  if (isHumanAudioRun(rec)) {
    run = rec;
    trialIndex = rec.votes.length;
    setSubMode("human");
    renderOutcome();
  } else {
    llmRun = rec;
    setSubMode("llm");
    renderLlmView();
  }
}

function renderCompare(): void {
  const out = $("panel-cmp-out");
  const humanId = ($("panel-cmp-human") as HTMLSelectElement).value;
  const llmId = ($("panel-cmp-llm") as HTMLSelectElement).value;
  const runs = loadAllRuns();
  const human = runs.find((r): r is HumanAudioRunRecord => isHumanAudioRun(r) && r.createdAt === humanId);
  const llm = runs.find((r): r is LlmPanelRunRecord => isLlmRun(r) && r.createdAt === llmId);
  if (!human || !llm) {
    out.innerHTML = `<p class="panel-banner empty">Need one stored human-audio run and one local-model run. Run both modes, then compare.</p>`;
    return;
  }
  const humanRanking = human.outcome?.result.ranking ?? [];
  const llmRanking = llm.result?.ranking ?? [];
  if (humanRanking.length === 0 || llmRanking.length === 0) {
    out.innerHTML = `<p class="panel-banner empty">Both runs need a ranking before they can be compared. Collect votes on the human side, or finish the local-model run.</p>`;
    return;
  }
  const cmp = comparePanelRankings({
    humanRanking,
    llmRanking,
    humanProvisional: !!human.outcome?.provisional,
    humanUninterpretable: !!human.outcome?.uninterpretable,
    humanListenerLabel: human.outcome?.listenerLabel ?? listenerCountLabel(1),
    llmVotesCollected: llm.votesCollected,
    llmVotesPossible: llm.votesPossible,
  });
  out.innerHTML = `<p class="panel-note"><strong>${cmp.headline}</strong></p><p class="panel-note">${cmp.detail}</p>`;
}
