#!/usr/bin/env tsx
// ─── prune-salamander.ts ────────────────────────────────────────────────────
//
// Build the cockpit Concert Grand pack from an installed Holm Salamander
// Grand Piano V3 tree. Requires ffmpeg (libopus) on PATH.
//
//   pnpm exec tsx scripts/prune-salamander.ts --input <holm-wav-dir>
//   pnpm exec tsx scripts/prune-salamander.ts --input … --out apps/cockpit/public/samples/salamander
//
// Never half-emits: missing ffmpeg, missing sources, or encode failure
// exits before writing the destination directory.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePianoSamplesDir } from "../src/sample-paths.js";
import {
  ENCODER, PACK_BUDGET_BYTES, SOURCE_VELOCITY_LAYERS, VELOCITY_RANGES,
  cockpitFileName, holmSourceStem, pianoRoots,
} from "./salamander-prune-plan.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..");
const DEFAULT_OUT = join(REPO, "apps", "cockpit", "public", "samples", "salamander");

const LICENSE_LINE = "Creative Commons Attribution 3.0";
const LICENSE_URL = "http://creativecommons.org/licenses/by/3.0/";
const SOURCE_PAGE = "https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html";

export function findFfmpeg(envPath = process.env.PATH ?? ""): string | null {
  const exe = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  for (const dir of envPath.split(process.platform === "win32" ? ";" : ":")) {
    if (!dir) continue;
    const candidate = join(dir, exe);
    if (existsSync(candidate)) return candidate;
  }
  const extras = [
    join("C:", "Program Files", "Krita (x64)", "bin", exe),
    join("C:", "ffmpeg", "bin", exe),
  ];
  for (const p of extras) {
    if (existsSync(p)) return p;
  }
  return null;
}

function parseArgs(argv: string[]): { input: string | null; out: string; archiveSha: string; archiveName: string } {
  let input: string | null = null;
  let out = DEFAULT_OUT;
  let archiveSha = "";
  let archiveName = "";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") input = argv[++i] ?? null;
    else if (a === "--out") out = argv[++i] ?? out;
    else if (a === "--archive-sha256") archiveSha = argv[++i] ?? "";
    else if (a === "--archive-name") archiveName = argv[++i] ?? "";
    else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "Usage: prune-salamander.ts [--input <holm-wav-dir>] [--out <dir>]\n" +
        "       [--archive-name <file>] [--archive-sha256 <hex>]\n" +
        "Requires ffmpeg with libopus. Input defaults to AI_JAM_SAMPLES_DIR / samples/AccurateSalamander.\n",
      );
      process.exit(0);
    }
  }
  return { input, out: resolve(out), archiveSha, archiveName };
}

function resolveInput(explicit: string | null): string {
  if (explicit) {
    if (!existsSync(explicit)) {
      throw new Error(`Input directory not found: ${explicit}`);
    }
    return resolve(explicit);
  }
  const fromPaths = resolvePianoSamplesDir();
  if (fromPaths) return fromPaths;
  throw new Error(
    "No Salamander source directory. Pass --input <dir> (the folder that contains A0v1.wav / D#1v4.wav), " +
    "or set AI_JAM_SAMPLES_DIR / install samples/AccurateSalamander.",
  );
}

function findSourceFile(inputDir: string, stem: string): string | null {
  const want = [`${stem}.wav`, `${stem}.flac`];
  const queue = [inputDir];
  let depth = 0;
  while (queue.length && depth < 4) {
    const next: string[] = [];
    for (const dir of queue) {
      if (!existsSync(dir)) continue;
      for (const name of want) {
        const p = join(dir, name);
        if (existsSync(p)) return p;
      }
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        if (ent.isDirectory()) next.push(join(dir, ent.name));
      }
    }
    queue.length = 0;
    queue.push(...next);
    depth++;
  }
  return null;
}

function encodeOne(ffmpeg: string, src: string, dest: string): void {
  const fadeStart = Math.max(0, ENCODER.maxDurationSec - ENCODER.fadeOutSec);
  const args = [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", src,
    "-t", String(ENCODER.maxDurationSec),
    "-af", `afade=t=out:st=${fadeStart}:d=${ENCODER.fadeOutSec}`,
    "-c:a", ENCODER.codec,
    "-b:a", ENCODER.bitrate,
    "-ar", String(ENCODER.sampleRate),
    "-ac", String(ENCODER.channels),
    dest,
  ];
  const r = spawnSync(ffmpeg, args, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed for ${src}: ${r.stderr || r.stdout || `exit ${r.status}`}`);
  }
  if (!existsSync(dest) || statSync(dest).size < 100) {
    throw new Error(`ffmpeg produced no usable file: ${dest}`);
  }
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const ffmpeg = findFfmpeg();
  if (!ffmpeg) {
    console.error(
      "ffmpeg is not on PATH (need libopus for OGG). Install ffmpeg and re-run — " +
      "this script will not half-emit a pack. Windows: winget install Gyan.FFmpeg",
    );
    process.exit(1);
  }
  const probe = spawnSync(ffmpeg, ["-hide_banner", "-encoders"], { encoding: "utf8" });
  const encText = `${probe.stdout ?? ""}\n${probe.stderr ?? ""}`;
  if (!encText.includes(ENCODER.codec)) {
    console.error(`ffmpeg at ${ffmpeg} does not advertise encoder ${ENCODER.codec}. Install a build with libopus.`);
    process.exit(1);
  }

  const input = resolveInput(args.input);
  const roots = pianoRoots();
  const jobs: Array<{ midi: number; layer: number; src: string; destName: string }> = [];
  const missing: string[] = [];
  for (const midi of roots) {
    SOURCE_VELOCITY_LAYERS.forEach((srcVel, layer) => {
      const stem = holmSourceStem(midi, srcVel);
      const src = findSourceFile(input, stem);
      if (!src) missing.push(stem);
      else jobs.push({ midi, layer, src, destName: cockpitFileName(midi, layer) });
    });
  }
  if (missing.length) {
    console.error(`Missing ${missing.length} source sample(s) under ${input}:\n  ${missing.slice(0, 8).join("\n  ")}`);
    process.exit(1);
  }

  const staging = `${args.out}.staging-${process.pid}`;
  if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  try {
    for (const job of jobs) {
      process.stdout.write(`  encode ${job.destName}\n`);
      encodeOne(ffmpeg, job.src, join(staging, job.destName));
    }

    const files = jobs.map((j) => ({
      midi: j.midi,
      layer: j.layer,
      file: j.destName,
      rootMidi: j.midi,
      bytes: statSync(join(staging, j.destName)).size,
      sha256: sha256File(join(staging, j.destName)),
    }));
    const packBytes = files.reduce((n, f) => n + f.bytes, 0);
    if (packBytes > PACK_BUDGET_BYTES) {
      throw new Error(
        `Pack is ${(packBytes / 1024 / 1024).toFixed(2)} MB — over the 10 MB Pages budget. ` +
        `Encoder ${ENCODER.codec} ${ENCODER.bitrate} / ${ENCODER.maxDurationSec}s. Stop rather than ship a mushy pack.`,
      );
    }

    const manifest = {
      schemaVersion: 1,
      instrument: "Salamander Grand Piano",
      author: "Alexander Holm",
      license: LICENSE_LINE,
      licenseUrl: LICENSE_URL,
      sourcePage: SOURCE_PAGE,
      sourceArchive: args.archiveName || null,
      sourceSha256: args.archiveSha || null,
      sourceVersion: "V3+20161209",
      encoder: { ...ENCODER, ffmpeg },
      packBytes,
      roots,
      layers: SOURCE_VELOCITY_LAYERS.map((sourceVel, id) => ({
        id,
        sourceVel,
        velLo: VELOCITY_RANGES[id].lo,
        velHi: VELOCITY_RANGES[id].hi,
      })),
      files: files.map(({ midi, layer, file, rootMidi }) => ({ midi, layer, file, rootMidi })),
    };
    writeFileSync(join(staging, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

    if (existsSync(args.out)) rmSync(args.out, { recursive: true, force: true });
    mkdirSync(dirname(args.out), { recursive: true });
    renameSync(staging, args.out);
    process.stdout.write(
      `Wrote ${files.length} files, ${(packBytes / 1024 / 1024).toFixed(2)} MB → ${args.out}\n`,
    );
  } catch (err) {
    try { rmSync(staging, { recursive: true, force: true }); } catch { /* ok */ }
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

const invoked = (process.argv[1] ?? "").replace(/\\/g, "/").endsWith("prune-salamander.ts");
if (invoked) main();
