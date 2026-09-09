#!/usr/bin/env node
// Grade jam-actions-v1 held-out examples through Ollama /api/chat.
//
// Prompt construction is a faithful port of predict_v1.py:
//   to_template_messages from train_v1_sft.py
//   last assistant turn is gold; send everything before it
//   extract_answer: first non-empty line, label after the final colon
//
// HuggingFace apply_chat_template(..., tools=tools) is not available here.
// Ollama /api/chat applies the model's template; we pass the same OpenAI-style
// tool catalog (src/dataset/tool-schemas.json, --tools full by default) and
// map assistant tool_calls / tool turns onto Ollama's chat JSON. Mapping:
//   assistant.tool_calls[].function.{name, arguments} (arguments as object)
//   tool turn: { role: "tool", content, tool_name }
//
//   node ollama-grade.mjs data/sft-test.jsonl ai-jam-grader-7b --out preds.jsonl
//
// Writes {id, family, answer, raw} jsonl, scored by score_v1.mjs.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXP = resolve(HERE, "..");
const REPO = resolve(EXP, "..", "..");
const DEFAULT_TOOLS = join(REPO, "src", "dataset", "tool-schemas.json");

const LISTEN_TOOLS = new Set([
  "analyze_audio",
  "transcribe_audio",
  "score_audio_take",
  "view_spectrogram",
  "ensemble_now",
]);

function usage(msg) {
  if (msg) process.stderr.write(msg + "\n");
  process.stderr.write(
    "usage: node ollama-grade.mjs <sft-test.jsonl> <model> --out <preds.jsonl> [--host URL] [--tools full|listen] [--tools-file path] [--num-predict N]\n",
  );
  process.exit(1);
}

function parseArgs(argv) {
  const out = {
    data: null,
    model: null,
    out: null,
    host: process.env.OLLAMA_HOST || "http://127.0.0.1:11434",
    tools: "full",
    toolsFile: DEFAULT_TOOLS,
    numPredict: 128,
  };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") out.out = argv[++i];
    else if (a === "--host") out.host = argv[++i];
    else if (a === "--tools") out.tools = argv[++i];
    else if (a === "--tools-file") out.toolsFile = argv[++i];
    else if (a === "--num-predict") out.numPredict = Number(argv[++i]);
    else if (a.startsWith("-")) usage(`unknown flag ${a}`);
    else rest.push(a);
  }
  out.data = rest[0];
  out.model = rest[1];
  if (!out.data || !out.model || !out.out) usage();
  if (out.tools !== "full" && out.tools !== "listen") usage(`--tools must be full or listen`);
  if (!Number.isFinite(out.numPredict) || out.numPredict < 1) usage(`--num-predict must be a positive integer`);
  if (out.host.endsWith("/")) out.host = out.host.slice(0, -1);
  return out;
}

/** Port of train_v1_sft.py load_tools. */
function loadTools(toolsPath, subset) {
  const catalog = JSON.parse(readFileSync(toolsPath, "utf8"));
  let tools = catalog.tools;
  if (subset === "listen") {
    tools = tools.filter((t) => LISTEN_TOOLS.has(t.name));
    const missing = [...LISTEN_TOOLS].filter((n) => !tools.some((t) => t.name === n));
    if (missing.length) throw new Error(`listen subset is incomplete, missing ${missing.sort().join(",")}`);
  }
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description ?? "",
      parameters: t.inputSchema,
    },
  }));
}

/** Port of train_v1_sft.py to_template_messages. */
function toTemplateMessages(messages) {
  const out = [];
  for (const m of messages) {
    if (m.role === "assistant" && m.tool_calls) {
      out.push({
        role: "assistant",
        content: m.content ?? "",
        tool_calls: m.tool_calls.map((tc) => ({
          type: "function",
          function: { name: tc.name, arguments: tc.arguments },
        })),
      });
    } else if (m.role === "tool") {
      out.push({ role: "tool", name: m.name, content: m.content });
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

/** Map template messages onto Ollama /api/chat JSON. */
function toOllamaMessages(tmpl) {
  return tmpl.map((m) => {
    if (m.role === "assistant" && m.tool_calls) {
      return {
        role: "assistant",
        content: m.content ?? "",
        tool_calls: m.tool_calls.map((tc) => ({
          function: {
            name: tc.function.name,
            arguments: tc.function.arguments,
          },
        })),
      };
    }
    if (m.role === "tool") {
      return { role: "tool", content: m.content, tool_name: m.name };
    }
    return { role: m.role, content: m.content ?? "" };
  });
}

function firstLine(text) {
  for (const line of String(text ?? "").trim().split(/\n/)) {
    if (line.trim()) return line.trim();
  }
  return "";
}

/** Port of predict_v1.py extract_answer. */
function extractAnswer(text) {
  const line = firstLine(text);
  if (line.includes(":")) {
    const tail = line.split(":").pop().trim();
    if (tail) return tail;
  }
  return line;
}

async function chat(host, body) {
  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`POST ${host}/api/chat HTTP ${res.status}: ${raw.slice(0, 400)}`);
  }
  return JSON.parse(raw);
}

function nsToS(ns) {
  if (!ns) return 0;
  return ns / 1e9;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const tools = loadTools(args.toolsFile, args.tools);
  const lines = readFileSync(args.data, "utf8")
    .split(/\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

  process.stderr.write(
    `[ollama-grade] model=${args.model} n=${lines.length} tools=${args.tools} (${tools.length}) host=${args.host} num_predict=${args.numPredict}\n`,
  );

  mkdirSync(dirname(resolve(args.out)), { recursive: true });
  const outLines = [];
  let evalTokens = 0;
  let evalSeconds = 0;
  let promptTokens = 0;
  let promptSeconds = 0;
  const t0 = Date.now();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tmpl = toTemplateMessages(line.messages);
    let lastAssistant = -1;
    for (let idx = 0; idx < tmpl.length; idx++) {
      if (tmpl[idx].role === "assistant") lastAssistant = idx;
    }
    if (lastAssistant < 0) throw new Error(`${line.id}: no assistant turn`);
    const promptMsgs = toOllamaMessages(tmpl.slice(0, lastAssistant));
    const result = await chat(args.host, {
      model: args.model,
      messages: promptMsgs,
      tools,
      stream: false,
      options: { temperature: 0, num_predict: args.numPredict },
    });
    const content = result.message?.content ?? "";
    const rec = {
      id: line.id,
      family: line.kind,
      answer: extractAnswer(content),
      raw: String(content).trim().slice(0, 600),
    };
    outLines.push(JSON.stringify(rec));
    evalTokens += result.eval_count ?? 0;
    evalSeconds += nsToS(result.eval_duration);
    promptTokens += result.prompt_eval_count ?? 0;
    promptSeconds += nsToS(result.prompt_eval_duration);
    if ((i + 1) % 5 === 0 || i + 1 === lines.length) {
      const genTps = evalSeconds ? (evalTokens / evalSeconds).toFixed(1) : "?";
      process.stderr.write(`  ${i + 1}/${lines.length} gen ${genTps} tok/s last=${rec.id}\n`);
    }
  }

  writeFileSync(args.out, outLines.join("\n") + "\n", "utf8");
  const wall = ((Date.now() - t0) / 1000).toFixed(1);
  const genTps = evalSeconds ? (evalTokens / evalSeconds).toFixed(2) : "n/a";
  const promptTps = promptSeconds ? (promptTokens / promptSeconds).toFixed(2) : "n/a";
  process.stderr.write(
    `[ollama-grade] wrote ${args.out}  wall=${wall}s  gen=${evalTokens} tok / ${evalSeconds.toFixed(2)}s = ${genTps} tok/s  prompt=${promptTokens} tok / ${promptSeconds.toFixed(2)}s = ${promptTps} tok/s\n`,
  );
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exit(1);
});
