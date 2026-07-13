#!/usr/bin/env tsx
// ─── gen-rehearsal-b2.ts — Finetune Arc B-2, component 5 (matched rehearsal) ──
//
// P0-LOCK.md (B-2) §4-C5: REPLACES v1's generic self-rehearsal. The prompt bank
// mirrors the eval-time question SHAPE — music-analysis prose Q&A about
// structure / key / meter / harmony / phrasing — completed by the BASE model
// itself (local ollama qwen2.5:7b, digest pinned, temperature 0, seed 20260714,
// one attempt, no retries). This is distribution-MATCHED rehearsal (SelfAug
// arXiv:2509.03934; SSR arXiv:2403.01244; Scialom arXiv:2205.12393): it
// rehearses the EXACT prose competence the v1 run eroded, not a generic slice.
//
// Leakage-clean by construction: prompts are GENERIC music theory (no cohort
// song, no MIDI facts, no annotation prose, no MCQ text, no "clair") — the
// P1-b2 gate G5 re-scans every completion anyway (ANDON on any hit).
//
// Output: experiments/finetune-arc-b2/data/rehearsal-b2-raw.jsonl
//   {idx, prompt, response, model, digest, options, system}
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "data");
const MODEL = "qwen2.5:7b";
const EXPECTED_DIGEST_PREFIX = "845dbda0ea48"; // same base as v1 §2 pin
const SYSTEM_TEXT = "You are operating AI Jam Sessions, a music education platform.";
const OLLAMA = process.env.OLLAMA_HOST?.startsWith("http")
  ? process.env.OLLAMA_HOST
  : `http://${process.env.OLLAMA_HOST ?? "localhost:11434"}`;

/** Pinned prompt bank — 60 music-analysis prose prompts (P0-LOCK §4-C5).
 *  Mirrors the eval's prose-answerable SHAPE (structure/key/meter/harmony),
 *  generic and cohort-free. */
export const REHEARSAL_PROMPTS_B2: string[] = [
  // — key & meter (12) —
  "Explain how a performer can identify the key of a passage from its key signature and opening harmony.",
  "What does a 4/4 time signature tell a player about how beats are grouped in a measure?",
  "Explain the difference between 3/4 and 6/8 time and how each feels to play.",
  "How do the sharps or flats in a key signature relate to the major key they indicate?",
  "Explain what it means for a passage to be in a minor key versus its relative major.",
  "What is a time signature's lower number, and what does it represent?",
  "Describe how to tell whether a phrase is in a duple or triple meter.",
  "Explain what 'the tonic' means and why it gives a passage its sense of home.",
  "How can a modulation to the dominant key change the character of a phrase?",
  "Explain the role of accidentals when a passage briefly leaves its home key.",
  "What is the difference between a major and a minor triad in terms of sound?",
  "Explain how the meter of a piece shapes where a performer places emphasis.",
  // — harmony & progression (12) —
  "Describe what a ii–V–I progression is and why it creates a strong sense of resolution.",
  "Explain what a cadence is and name two common types.",
  "What is a dominant seventh chord and why does it want to resolve?",
  "Explain the idea of tension and release in a chord progression.",
  "Describe what a suspension is and how it resolves.",
  "Explain the difference between a perfect and an imperfect cadence.",
  "What does it mean for a passage to 'tonicize' a new chord?",
  "Explain how a diminished seventh chord can add color or lead somewhere unexpected.",
  "Describe the function of a subdominant chord in a phrase.",
  "Explain what a pedal point is and the effect it has on the harmony above it.",
  "What is a deceptive cadence and why is it called deceptive?",
  "Explain how inversions change the bass line without changing the chord.",
  // — form & structure (12) —
  "Explain the difference between a musical phrase and a period.",
  "What is an antecedent-consequent phrase structure?",
  "Describe what binary form (AB) is in a short piece.",
  "Explain what a motif is and how it can be developed across a passage.",
  "What does it mean to say a passage is a 'sequence'?",
  "Explain the role of repetition and variation in giving a piece shape.",
  "Describe what a coda is and where it appears.",
  "Explain how a bridge or transition connects two sections of a piece.",
  "What is the difference between a theme and its variation?",
  "Explain how a composer might use a fragment of a melody to build tension.",
  "Describe what ternary form (ABA) is and give its basic shape.",
  "Explain what it means for a phrase to reach a climax and then relax.",
  // — texture, voicing, hands (8) —
  "Explain the difference between melody and accompaniment in a piano texture.",
  "What does it mean to 'voice' a chord so the melody sings above it?",
  "Explain how the two hands typically divide labor in a piano passage.",
  "Describe what a countermelody is and how it interacts with the main tune.",
  "Explain the difference between homophonic and polyphonic texture.",
  "What is an arpeggiated accompaniment and what effect does it create?",
  "Explain how balance between the hands affects the clarity of a melody.",
  "Describe what it means for an inner voice to move independently.",
  // — rhythm & phrasing (8) —
  "Explain what legato and staccato mean and how they change a line.",
  "Describe how phrasing shapes the direction of a musical line.",
  "Explain what syncopation is and why it creates rhythmic interest.",
  "What does a crescendo do to a phrase, and where might it lead?",
  "Explain the difference between a downbeat and an upbeat.",
  "Describe what rubato is and how it affects the sense of pulse.",
  "Explain how rests contribute to the shape and breath of a phrase.",
  "What does it mean to bring out the peak, or high point, of a phrase?",
  // — teaching / practice framing (8), mirrors the annotation 'teaching note' shape —
  "Give a short teaching note on how to practice a passage with an uneven melody line.",
  "Explain to a student how to keep a steady pulse while shaping a phrase.",
  "Offer a brief practice tip for balancing a singing melody over a soft accompaniment.",
  "Explain to a beginner how to approach a passage that changes key partway through.",
  "Give a short teaching note on voicing so the top line stands out.",
  "Explain how a student can use the harmony to guide their phrasing choices.",
  "Offer a brief tip for practicing a passage with a gentle crescendo into the cadence.",
  "Explain to a student what to listen for when the two hands trade the melody.",
];

interface OllamaChatResponse {
  message: { content: string };
  done: boolean;
}

async function main(): Promise<void> {
  if (REHEARSAL_PROMPTS_B2.length !== 60) {
    throw new Error(`prompt bank must be exactly 60, got ${REHEARSAL_PROMPTS_B2.length}`);
  }

  const tagsResp = await fetch(`${OLLAMA}/api/tags`);
  if (!tagsResp.ok) throw new Error(`ollama unreachable: HTTP ${tagsResp.status}`);
  const tags = (await tagsResp.json()) as { models: Array<{ name: string; digest: string }> };
  const entry = tags.models.find((m) => m.name === MODEL || m.name === `${MODEL}:latest`);
  if (!entry) throw new Error(`${MODEL} not present in local ollama`);
  if (!entry.digest.startsWith(EXPECTED_DIGEST_PREFIX)) {
    throw new Error(
      `digest drift: ${MODEL} is ${entry.digest.slice(0, 12)}, lock pins ${EXPECTED_DIGEST_PREFIX} — halt (ANDON)`,
    );
  }

  const options = { temperature: 0, seed: 20260714 };
  const lines: string[] = [];
  for (let i = 0; i < REHEARSAL_PROMPTS_B2.length; i++) {
    const prompt = REHEARSAL_PROMPTS_B2[i];
    const resp = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_TEXT },
          { role: "user", content: prompt },
        ],
        options,
        stream: false,
      }),
    });
    if (!resp.ok) throw new Error(`prompt ${i}: ollama HTTP ${resp.status} — no retries per lock; halt`);
    const data = (await resp.json()) as OllamaChatResponse;
    const content = data.message.content.trim();
    if (!content) throw new Error(`prompt ${i}: empty completion — halt`);
    lines.push(
      JSON.stringify({
        idx: i,
        prompt,
        response: content,
        model: MODEL,
        digest: entry.digest,
        options,
        system: SYSTEM_TEXT,
      }),
    );
    process.stdout.write(`\r[gen-rehearsal-b2] ${i + 1}/60`);
  }
  process.stdout.write("\n");

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "rehearsal-b2-raw.jsonl"), lines.join("\n") + "\n", "utf8");
  console.log(`[gen-rehearsal-b2] wrote ${lines.length} completions -> data/rehearsal-b2-raw.jsonl`);
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
