#!/usr/bin/env node
// Capture the prompt Ollama actually fed llama-server (/slots.prompt)
// for the same /api/chat body ollama-grade.mjs sends. Requires
// LLAMA_SERVER_SLOTS_DEBUG=1 on the ollama serve process (inherited by
// llama-server). 0.33.3 ignores debug_render_only and does not log the body.

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadTools, toTemplateMessages, toOllamaMessages } from "./ollama-grade.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..", "..", "..");
const host = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

function llamaPort() {
  const out = execSync(
    "powershell -NoProfile -Command \"(Get-NetTCPConnection -OwningProcess (Get-Process llama-server).Id -State Listen | Select-Object -First 1 -ExpandProperty LocalPort)\"",
    { encoding: "utf8" },
  ).trim();
  if (!/^\d+$/.test(out)) throw new Error(`llama-server port not found: ${out}`);
  return out;
}

async function main() {
  const data = process.argv[2];
  const model = process.argv[3];
  const outdir = process.argv[4];
  const ids = process.argv.slice(5);
  if (!data || !model || !outdir || !ids.length) {
    process.stderr.write("usage: node dump_ollama_slots.mjs <sft-test.jsonl> <model> <outdir> <id>...\n");
    process.exit(1);
  }
  const tools = loadTools(join(REPO, "src", "dataset", "tool-schemas.json"), "full");
  const byId = new Map(
    readFileSync(data, "utf8").trim().split("\n").map((l) => {
      const o = JSON.parse(l);
      return [o.id, o];
    }),
  );
  mkdirSync(outdir, { recursive: true });
  const summary = [];
  for (const id of ids) {
    const line = byId.get(id);
    if (!line) throw new Error(`missing ${id}`);
    const tmpl = toTemplateMessages(line.messages);
    let last = -1;
    for (let i = 0; i < tmpl.length; i++) if (tmpl[i].role === "assistant") last = i;
    const msgs = toOllamaMessages(tmpl.slice(0, last));
    const res = await fetch(`${host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: msgs,
        tools,
        stream: false,
        options: { temperature: 0, num_predict: 1 },
      }),
    });
    const chat = await res.json();
    const port = llamaPort();
    const slots = await (await fetch(`http://127.0.0.1:${port}/slots`)).json();
    const prompt = slots[0]?.prompt ?? "";
    const safe = id.replace(/:/g, "_");
    writeFileSync(join(outdir, `${safe}.ollama.txt`), prompt, "utf8");
    const rec = {
      id,
      chars: prompt.length,
      prompt_eval_count: chat.prompt_eval_count,
      n_prompt_tokens_slots: slots[0]?.n_prompt_tokens,
    };
    summary.push(rec);
    process.stderr.write(JSON.stringify(rec) + "\n");
  }
  writeFileSync(join(outdir, "ollama-summary.json"), JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exit(1);
});
