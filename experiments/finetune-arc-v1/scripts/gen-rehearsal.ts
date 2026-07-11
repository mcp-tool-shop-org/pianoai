#!/usr/bin/env tsx
// ─── gen-rehearsal.ts — Finetune Arc v1, component 3 (self-rehearsal) ────────
//
// P0-LOCK.md §3-C3: 60 generic-instruction examples completed by the BASE
// model itself (local ollama qwen2.5:7b, digest pinned, temperature 0, seed
// 20260711, one attempt, no retries) under the training system prompt — the
// base model's own distribution per findings 42 (SelfAug) / 46 (Ding & Wang).
//
// The prompt bank is pinned HERE (committed before generation). Music-free,
// jam-free, tool-free by construction. ~40% of prompts carry an explicit
// format constraint (IFEval-shaped: exact counts, single word, one sentence)
// because format-compliance is precisely the surface v0 eroded (finding 42).
//
// Output: experiments/finetune-arc-v1/data/rehearsal-raw.jsonl
//   {idx, prompt, response, model, digest, options}
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "data");
const MODEL = "qwen2.5:7b";
const EXPECTED_DIGEST_PREFIX = "845dbda0ea48"; // P0-LOCK §2 pin (ollama list, 2026-07-11)
const SYSTEM_TEXT = "You are operating AI Jam Sessions, a music education platform.";
const OLLAMA = process.env.OLLAMA_HOST?.startsWith("http")
  ? process.env.OLLAMA_HOST
  : `http://${process.env.OLLAMA_HOST ?? "localhost:11434"}`;

/** Pinned prompt bank — 60 prompts (P0-LOCK §3-C3). */
export const REHEARSAL_PROMPTS: string[] = [
  // — explain (15) —
  "Explain in a short paragraph why the sky appears blue during the day.",
  "Explain the difference between HTTP and HTTPS to a non-technical reader.",
  "Explain what compound interest is and why it matters for long-term savings.",
  "Explain how a refrigerator keeps food cold, in plain language.",
  "Explain the difference between weather and climate in a few sentences.",
  "Explain what a placebo effect is and give one everyday example.",
  "Explain why ice floats on water instead of sinking.",
  "Explain the difference between a virus and a bacterium in simple terms.",
  "Explain what supply and demand means using a farmers-market example.",
  "Explain how GPS determines your position, at a high level.",
  "Explain the difference between RAM and storage on a computer.",
  "Explain what photosynthesis produces and why animals depend on it.",
  "Explain why time zones exist and how they relate to longitude.",
  "Explain the difference between a recession and a depression in economics.",
  "Explain what herd immunity means in public health.",
  // — list / bullets with count constraints (10) —
  "List exactly 5 practical tips for improving sleep quality. Use a numbered list.",
  "List exactly 3 questions someone should ask before adopting a dog. Use bullet points.",
  "List exactly 4 common mistakes people make when writing a resume.",
  "List exactly 5 items that belong in a basic home emergency kit.",
  "List exactly 3 advantages and exactly 3 disadvantages of remote work.",
  "List exactly 4 ways to reduce food waste at home. Keep each item to one line.",
  "List exactly 5 beginner-friendly houseplants and one care tip for each.",
  "List exactly 3 factors to compare when choosing a laptop for schoolwork.",
  "List exactly 4 habits that help with learning a new language.",
  "List exactly 5 safety checks to do before a long road trip.",
  // — rewrite / tone (10) —
  "Rewrite this sentence to be more formal: \"Hey, we can't make the meeting, gotta push it to next week.\"",
  "Rewrite this sentence to be friendlier: \"Your request is denied due to policy.\"",
  "Rewrite this sentence in the active voice: \"The report was completed by the team ahead of schedule.\"",
  "Rewrite this sentence more concisely: \"Due to the fact that it was raining, we made the decision to cancel the event that we had planned.\"",
  "Rewrite this sentence for a 10-year-old reader: \"Hydration is essential for optimal cognitive performance.\"",
  "Rewrite this sentence to remove jargon: \"We need to leverage synergies to maximize stakeholder alignment.\"",
  "Rewrite this sentence as a polite request: \"Send me the file now.\"",
  "Rewrite this sentence to sound more confident: \"I guess I could maybe try to lead the project if nobody else wants to.\"",
  "Rewrite this sentence without the double negative: \"It's not uncommon for beginners to not finish their first project.\"",
  "Rewrite this sentence as two shorter sentences: \"The museum, which opened in 1911 and houses over forty thousand artifacts, is free on Sundays and closed on Mondays.\"",
  // — compare (8) —
  "Compare renting versus buying a home in a few sentences, covering one advantage of each.",
  "Compare tea and coffee as sources of caffeine in a short paragraph.",
  "Compare e-books and printed books: give two advantages of each.",
  "Compare cycling and running as forms of exercise in a few sentences.",
  "Compare saving money in a bank account versus investing in index funds, briefly.",
  "Compare cats and dogs as pets for apartment living, in one short paragraph.",
  "Compare taking notes by hand versus typing them, citing one benefit of each.",
  "Compare public transit and driving for a daily commute, in a few sentences.",
  // — short-answer factual (7) —
  "What causes a rainbow to appear after rain?",
  "Why do leaves change color in autumn?",
  "What is the main purpose of a computer's operating system?",
  "Why does bread rise when it bakes?",
  "What does a country's inflation rate measure?",
  "Why do we see phases of the moon?",
  "What is the difference between latitude and longitude?",
  // — plan / steps (5) —
  "Outline a simple 4-step plan for decluttering a small apartment in one weekend.",
  "Outline the steps to prepare for a job interview, from research to follow-up.",
  "Outline a beginner's first month of learning to cook, week by week.",
  "Outline a basic monthly budget process for someone new to budgeting.",
  "Outline the steps to plan a small surprise birthday dinner for six people.",
  // — strict-format compliance (5) —
  "Answer with a single word: what is the largest planet in our solar system?",
  "Answer with only \"yes\" or \"no\": is the Pacific Ocean larger than the Atlantic Ocean?",
  "Reply with exactly one sentence describing what a thermostat does.",
  "Give exactly two synonyms for the word \"happy\", separated by a comma, and nothing else.",
  "Answer with a single number: how many days are in a leap year?",
];

interface OllamaChatResponse {
  message: { content: string };
  done: boolean;
}

async function main(): Promise<void> {
  if (REHEARSAL_PROMPTS.length !== 60) {
    throw new Error(`prompt bank must be exactly 60, got ${REHEARSAL_PROMPTS.length}`);
  }

  // Digest pin check (P0-LOCK §2).
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

  const options = { temperature: 0, seed: 20260711 };
  const lines: string[] = [];
  for (let i = 0; i < REHEARSAL_PROMPTS.length; i++) {
    const prompt = REHEARSAL_PROMPTS[i];
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
    process.stdout.write(`\r[gen-rehearsal] ${i + 1}/60`);
  }
  process.stdout.write("\n");

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "rehearsal-raw.jsonl"), lines.join("\n") + "\n", "utf8");
  console.log(`[gen-rehearsal] wrote ${lines.length} completions -> data/rehearsal-raw.jsonl`);
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
