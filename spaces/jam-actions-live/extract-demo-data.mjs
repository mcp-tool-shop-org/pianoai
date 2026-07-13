// Build demo_data.json for the ZeroGPU live-inference Space.
// Pulls real B-1 cohort phrases: exact MCQ questions (from the eval results) +
// full note events (for the ported tools) + annotation prose.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const REPO = 'E:/AI/ai-jam-sessions';

const results = JSON.parse(readFileSync(`${REPO}/experiments/finetune-arc-v2/evals/b1-baseline-results.json`, 'utf8'));
const recs = readFileSync(`${REPO}/datasets/jam-actions-v0-public/records.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const byId = new Map(recs.map((r) => [r.id, r]));

// questions per cohort record (deterministic; taken from run 0 of the baseline eval)
const qByRecord = new Map();
for (const rec of results.results['e3-tool'].records) {
  const qs = rec.per_run_results[0].questions.map((q) => ({
    type: q.questionType,
    text: q.questionText,
    options: q.options,
    correct: q.correctOptionIndex,
  }));
  qByRecord.set(rec.recordId, qs);
}

// group cohort records by song, pick earliest phrase per song
const cohortIds = [...qByRecord.keys()];
const bySong = {};
for (const id of cohortIds) {
  const r = byId.get(id);
  if (!r) continue;
  const s = r.scope.song_id;
  (bySong[s] ||= []).push(r);
}
const pickEarliest = (list) => list.slice().sort((a, b) => (a.annotation_target.measure_range?.[0] ?? 999) - (b.annotation_target.measure_range?.[0] ?? 999) || a.id.localeCompare(b.id))[0];

// curation order (clair-de-lune first — held-out test headline)
const ORDER = ['clair-de-lune', 'fur-elise', 'bach-prelude-c-major-bwv846', 'mozart-k545-mvt1', 'chopin-nocturne-op9-no2', 'pathetique-mvt2', 'schumann-traumerei', 'chopin-prelude-e-minor'];
const songs = ORDER.filter((s) => bySong[s]);

const round = (x, p = 3) => Number(x.toFixed(p));

const phrases = songs.map((s) => {
  const r = pickEarliest(bySong[s]);
  const ev = r.observation.midi_sidecar.timed_events;
  const tempo = r.scope.tempo_bpm;
  // Phrase time-origin = downbeat of the window's first measure, recovered from any
  // event as (t_seconds - beat*60/tempo). Min over events pins the measure-1 downbeat
  // even when no note sits exactly on it (e.g. clair-de-lune's beat-0.5 opening). This
  // reproduces the explorer's phrase-relative timing exactly (clair-de-lune note0.t=0.3).
  const spb = 60 / tempo;
  const originT = Math.min(...ev.map((e) => e.t_seconds - e.beat * spb));
  return {
    id: r.id,
    song_id: r.scope.song_id,
    title: r.provenance.composition_title.replace(/\s*\(.*$/, '').trim(),
    composer: r.provenance.composer,
    year: r.provenance.composition_year,
    key: r.scope.key,
    time_signature: r.scope.time_signature,
    tempo_bpm: tempo,
    phrase_window: r.scope.phrase_window,
    split: r.split,
    annotation: {
      structure: r.annotation_target.structure,
      key_moments: r.annotation_target.key_moments || [],
      teaching_goals: r.annotation_target.teaching_goals || [],
      style_tips: r.annotation_target.style_tips || [],
      teaching_notes: (r.annotation_target.teaching_notes || []).map((t) => ({ measure: t.measure, note: t.note, technique: t.technique || [] })),
    },
    // events: the fields the MIDI-inspector tools use + t/d/v for the piano-roll.
    // t = phrase-relative onset seconds, d = duration seconds, v = MIDI velocity (0-127).
    events: ev.map((e) => ({
      hand: e.hand, measure: e.measure, beat: e.beat, note: e.note, name: e.name,
      t: round(e.t_seconds - originT), d: round(e.dur_seconds), v: e.velocity,
    })),
    questions: qByRecord.get(r.id),
  };
});

mkdirSync(__dir, { recursive: true });
const out = { note: 'Real B-1 cohort phrases + exact MCQ questions + note events for the MIDI-inspector tools.', phrases };
writeFileSync(join(__dir, 'demo_data.json'), JSON.stringify(out));
console.log(`wrote demo_data.json — ${phrases.length} phrases, ${(Buffer.byteLength(JSON.stringify(out)) / 1024).toFixed(1)} KB`);
for (const p of phrases) console.log(`  ${p.split === 'test' ? '[TEST]' : '      '} ${p.song_id.padEnd(30)} ${p.events.length} notes, ${p.questions.length} Q — ${p.questions.map((q) => q.type).join(',')}`);
