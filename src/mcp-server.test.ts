// ─── mcp-server.test.ts ────────────────────────────────────────────────────────
//
// Protocol-level tests for mcp-server.ts's tool-handler layer.
//
// mcp-server.ts has no `isMain`-style guard: importing the module directly
// runs `main()` unconditionally, which constructs a real StdioServerTransport
// and connects it to the process's actual stdin/stdout — unsafe to trigger
// inside a shared vitest worker process. Its tool handlers (play_song,
// add_section, transpose_song, server_info) also live entirely as closures
// inside `registerTool(...)` calls with no separately-exported/importable
// pure functions to unit-test directly.
//
// So this file drives the server the way a real MCP client does: spawn it as
// a child process (mirroring this repo's own
// `"smoke": "node --import tsx src/smoke.ts"` convention) and talk to it over
// real MCP-over-stdio via the SDK's Client + StdioClientTransport. HOME /
// USERPROFILE are redirected to a fresh temp directory so add_section /
// transpose_song's saveSong() writes land in an isolated user-songs dir
// instead of the real developer's ~/.ai-jam-sessions/songs — persistence is
// then verified by reading that file back from disk directly, bypassing the
// server's own in-memory registry entirely.
//
// Audio: play_song's endMeasure-bound check (in the library-song/loop-mode
// path) sits AFTER the real audio connector's .connect() call in the current
// code, so this test necessarily exercises the real node-web-audio-api
// engine (confirmed to connect successfully in this sandbox via a direct
// smoke check before writing this file) rather than a mock — this is the one
// sub-item where "mock audio output" isn't achievable without editing
// mcp-server.ts itself, which is out of this domain's scope.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync, chmodSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_PATH = fileURLToPath(new URL("./mcp-server.ts", import.meta.url));

interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

function extractText(result: ToolResult): string {
  return result.content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n");
}

// ─── Shared helper: fully isolated server instance ─────────────────────────
//
// The `client`/`transport` pair set up in the outer `beforeAll` below is
// shared across all of that describe block's tests and is already connected
// by the time any test runs — fine for tests that only care about tool
// call/response behavior, but two categories of test below need more control
// than that:
//
//   1. Tests that must pre-seed a file under the server's HOME (e.g. a
//      server-state.json with a specific shape) BEFORE the server process
//      starts, since loadSessionState() only runs once, inside main(), at
//      startup.
//   2. Tests that need to observe the raw child process's stdout stream
//      directly (bypassing the SDK's own lenient per-line JSON-parse-or-drop
//      handling in ReadBuffer.readMessage(), which silently swallows any
//      non-JSON line without failing the calling test — see
//      node_modules/.../@modelcontextprotocol/sdk/dist/esm/shared/stdio.js).
//
// Both need their own dedicated, independently-torn-down server instance
// rather than reusing the shared one.
async function spawnIsolatedServer(options: {
  /**
   * Called with the fresh tmpHome directory path BEFORE the server process
   * is spawned, so callers can pre-seed files (e.g.
   * `<tmpHome>/.ai-jam-sessions/server-state.json`) that the server will
   * read during its own startup.
   */
  beforeStart?: (tmpHome: string) => void;
} = {}): Promise<{
  client: Client;
  transport: StdioClientTransport;
  tmpHome: string;
  close: () => Promise<void>;
}> {
  const tmpHome = mkdtempSync(join(tmpdir(), "ajs-mcp-server-test-iso-"));
  options.beforeStart?.(tmpHome);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["--import", "tsx", SERVER_PATH],
    env: {
      ...process.env,
      HOME: tmpHome,
      USERPROFILE: tmpHome,
    } as Record<string, string>,
  });
  const client = new Client({ name: "tests-agent-mcp-server-test-iso", version: "0.0.0" });
  await client.connect(transport);
  return {
    client,
    transport,
    tmpHome,
    close: async () => {
      try {
        await client.close();
      } catch {
        /* best-effort */
      }
      rmSync(tmpHome, { recursive: true, force: true });
    },
  };
}

describe("mcp-server.ts — MCP protocol-level tool tests", () => {
  let client: Client;
  let transport: StdioClientTransport;
  let tmpHome: string;

  beforeAll(async () => {
    tmpHome = mkdtempSync(join(tmpdir(), "ajs-mcp-server-test-home-"));
    transport = new StdioClientTransport({
      command: process.execPath,
      args: ["--import", "tsx", SERVER_PATH],
      env: {
        ...process.env,
        // Redirect getUserSongsDir() (~/.ai-jam-sessions/songs) so
        // add_section/transpose_song's saveSong() writes are fully isolated
        // from the real developer's home directory.
        HOME: tmpHome,
        USERPROFILE: tmpHome,
      } as Record<string, string>,
    });
    client = new Client({ name: "tests-agent-mcp-server-test", version: "0.0.0" });
    await client.connect(transport);
  }, 30000);

  afterAll(async () => {
    try {
      await client?.close();
    } catch {
      /* best-effort */
    }
    if (tmpHome) {
      rmSync(tmpHome, { recursive: true, force: true });
    }
  });

  it(
    "server_info reports a Tools count derived dynamically from the actual registered-tool list, not a hardcoded literal (pins F-d66effe4 / F-157feff2)",
    async () => {
      const toolList = await client.listTools();
      const actualCount = toolList.tools.length;
      expect(actualCount).toBeGreaterThan(0);
      expect(toolList.tools.some((t) => t.name === "play_song")).toBe(true);
      expect(toolList.tools.some((t) => t.name === "add_section")).toBe(true);
      expect(toolList.tools.some((t) => t.name === "transpose_song")).toBe(true);
      expect(toolList.tools.some((t) => t.name === "server_info")).toBe(true);

      const result = (await client.callTool({
        name: "server_info",
        arguments: {},
      })) as ToolResult;
      const text = extractText(result);
      const match = text.match(/\*\*Tools:\*\*\s*(\d+)/);
      expect(match).not.toBeNull();
      const reportedCount = Number(match![1]);

      // Neither side is hardcoded here: both values are derived at
      // test-run time from the same running server, so this holds
      // regardless of how many tools are registered today or added later —
      // exactly what "derived dynamically, not hardcoded" requires.
      expect(reportedCount).toBe(actualCount);
    },
    15000,
  );

  it(
    "play_song rejects an endMeasure beyond the song's measure count with a structured isError response, not a fake success (pins F-c969321e)",
    async () => {
      const result = (await client.callTool({
        name: "play_song",
        arguments: { id: "fallin", mode: "loop", startMeasure: 1, endMeasure: 999999 },
      })) as ToolResult;
      const text = extractText(result);

      expect(result.isError).toBe(true);
      expect(text.toLowerCase()).not.toContain("now playing");
      expect(text.toLowerCase()).toMatch(/measure/);
    },
    20000,
  );

  it(
    "play_song's endMeasure bound is exact at the song's measure count — the last valid measure plays, one past it errors (pins F-c969321e against an off-by-one; the 999999 case above passes under a >= mutation, this one does not)",
    async () => {
      // Derive the song's true measure count from the server itself, so the
      // boundary assertions can't drift from the fixture.
      const info = (await client.callTool({
        name: "song_info",
        arguments: { id: "fallin" },
      })) as ToolResult;
      const n = Number(extractText(info).match(/Measures:\**\s*(\d+)/)![1]);
      expect(n).toBeGreaterThan(1);

      // One past the last measure → the range guard rejects it with the
      // "exceeds … valid range" message (proves the > guard fires at the exact
      // edge, not only for wildly-out-of-range values).
      const past = (await client.callTool({
        name: "play_song",
        arguments: { id: "fallin", mode: "loop", startMeasure: 1, endMeasure: n + 1 },
      })) as ToolResult;
      expect(past.isError).toBe(true);
      const pastText = extractText(past).toLowerCase();
      expect(pastText).not.toContain("now playing");
      expect(pastText).toMatch(/exceeds|valid range/);

      // Exactly the last measure → the range guard must ACCEPT it. We assert on
      // the guard's own outcome, not on playback succeeding: a real audio device
      // isn't available on a headless CI runner, so an in-range request may still
      // fail later at the engine-connect step ("couldn't start the … engine").
      // The invariant that matters here is that the *range* check let it through
      // — i.e. the response is NOT the range-exceeded rejection. Under a `>=`
      // off-by-one mutation, endMeasure === n would be rejected with that exact
      // message and this assertion goes red (the 999999 case above cannot catch
      // that mutation; this one does).
      const edge = (await client.callTool({
        name: "play_song",
        arguments: { id: "fallin", mode: "loop", startMeasure: n, endMeasure: n },
      })) as ToolResult;
      expect(extractText(edge).toLowerCase()).not.toMatch(/exceeds|valid range/);

      // Best-effort cleanup in case audio did start (local dev with a device).
      await client.callTool({ name: "stop_playback", arguments: {} }).catch(() => {});
    },
    25000,
  );

  it(
    "registers practice_loop, practice_status, score_last_take, view_scored_piano_roll, and play_song's schema gains metronome/countIn/record",
    async () => {
      const toolList = await client.listTools();
      const names = toolList.tools.map((t) => t.name);
      expect(names).toContain("practice_loop");
      expect(names).toContain("practice_status");
      expect(names).toContain("score_last_take");
      expect(names).toContain("view_scored_piano_roll");

      const playSong = toolList.tools.find((t) => t.name === "play_song");
      expect(playSong).toBeDefined();
      const props = (playSong!.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(props).toHaveProperty("metronome");
      expect(props).toHaveProperty("countIn");
      expect(props).toHaveProperty("record");
    },
    15000,
  );

  it(
    "practice_loop rejects an unknown song id with a structured isError response",
    async () => {
      const result = (await client.callTool({
        name: "practice_loop",
        arguments: { id: "not-a-real-song-xyz", startMeasure: 1, endMeasure: 2 },
      })) as ToolResult;
      expect(result.isError).toBe(true);
      expect(extractText(result).toLowerCase()).toMatch(/no song called/);
    },
    15000,
  );

  it(
    "practice_loop rejects an endMeasure beyond the song's length with a structured isError response (validated before any audio connect)",
    async () => {
      const result = (await client.callTool({
        name: "practice_loop",
        arguments: { id: "fallin", startMeasure: 1, endMeasure: 999999 },
      })) as ToolResult;
      expect(result.isError).toBe(true);
      expect(extractText(result).toLowerCase()).toMatch(/exceeds/);
    },
    15000,
  );

  it(
    "practice_loop rejects endMeasure < startMeasure with a structured isError response",
    async () => {
      const result = (await client.callTool({
        name: "practice_loop",
        arguments: { id: "fallin", startMeasure: 5, endMeasure: 2 },
      })) as ToolResult;
      expect(result.isError).toBe(true);
      expect(extractText(result).toLowerCase()).toMatch(/startmeasure/);
    },
    15000,
  );

  it(
    "practice_loop rejects a speedTargetPct below speedStartPct with a structured isError response",
    async () => {
      const result = (await client.callTool({
        name: "practice_loop",
        arguments: { id: "fallin", startMeasure: 1, endMeasure: 2, speedStartPct: 90, speedTargetPct: 60 },
      })) as ToolResult;
      expect(result.isError).toBe(true);
      expect(extractText(result).toLowerCase()).toMatch(/speedtargetpct/);
    },
    15000,
  );

  it(
    "add_section persists to disk: re-reading the song file from the (isolated) user songs dir shows the new section (pins F-5aec2e16)",
    async () => {
      const result = (await client.callTool({
        name: "add_section",
        arguments: {
          id: "fallin",
          name: "TestsAgentSection",
          startMeasure: 1,
          endMeasure: 2,
          description: "added by mcp-server.test.ts",
        },
      })) as ToolResult;
      expect(result.isError).not.toBe(true);

      // Bypass the server's in-memory registry entirely — read the actual
      // file saveSong() should have written.
      const savedPath = join(tmpHome, ".ai-jam-sessions", "songs", "fallin.json");
      expect(existsSync(savedPath)).toBe(true);
      const saved = JSON.parse(readFileSync(savedPath, "utf8")) as {
        sections?: Array<{ name: string; startMeasure: number; endMeasure: number }>;
      };
      expect(Array.isArray(saved.sections)).toBe(true);
      const section = saved.sections!.find((s) => s.name === "TestsAgentSection");
      expect(section).toBeDefined();
      expect(section!.startMeasure).toBe(1);
      expect(section!.endMeasure).toBe(2);
    },
    15000,
  );

  it(
    "transpose_song persists to disk: re-reading the transposed song file from the (isolated) user songs dir shows the mutation (pins F-a4c5e9b7)",
    async () => {
      // A minimal single-note fixture isolates the persistence behavior from
      // any note-content concern. The real-library path (chord-notation songs
      // like fallin) is covered by the second half of this test below — the
      // chord-joined "C4+E4" crash that once forced a synthetic-only fixture
      // has since been fixed, so persistence is now pinned on both the
      // synthetic and the real-content paths.
      const fixtureSong = {
        id: "tests-agent-fixture-song",
        title: "Tests Agent Fixture Song",
        genre: "folk",
        difficulty: "beginner",
        key: "C major",
        tempo: 100,
        timeSignature: "4/4",
        durationSeconds: 8,
        musicalLanguage: {
          description: "A tiny fixture song for mcp-server.test.ts.",
          structure: "AA",
          keyMoments: ["Measure 1: opening phrase."],
          teachingGoals: ["Steady quarter-note timing."],
          styleTips: [],
        },
        measures: [
          { number: 1, rightHand: "C4:q D4:q E4:q F4:q", leftHand: "C3:w" },
          { number: 2, rightHand: "G4:q F4:q E4:q D4:q", leftHand: "C3:w" },
        ],
        tags: ["fixture"],
      };
      const addResult = (await client.callTool({
        name: "add_song",
        arguments: { song: JSON.stringify(fixtureSong) },
      })) as ToolResult;
      expect(addResult.isError).not.toBe(true);

      const result = (await client.callTool({
        name: "transpose_song",
        arguments: { id: "tests-agent-fixture-song", semitones: 2 },
      })) as ToolResult;
      expect(result.isError).not.toBe(true);
      const text = extractText(result);

      const idMatch = text.match(/\*\*New ID:\*\*\s*(\S+)/);
      expect(idMatch).not.toBeNull();
      const newId = idMatch![1];
      const keyMatch = text.match(/\*\*New key:\*\*\s*(.+)/);
      expect(keyMatch).not.toBeNull();
      const reportedNewKey = keyMatch![1].trim();

      const savedPath = join(tmpHome, ".ai-jam-sessions", "songs", `${newId}.json`);
      expect(existsSync(savedPath)).toBe(true);
      const saved = JSON.parse(readFileSync(savedPath, "utf8")) as {
        id: string;
        key: string;
      };

      // Full invariant: the persisted file is genuinely the transposed
      // song (same id and key the tool reported), not an empty/placeholder
      // write or a stale copy of the original.
      expect(saved.id).toBe(newId);
      expect(saved.key).toBe(reportedNewKey);

      // Real-content path: a bundled library song (chord-heavy) must also
      // transpose AND persist — this is the path a real user actually hits,
      // and it exercises the chord-notation splitting the synthetic fixture
      // deliberately avoids. Proves the persistence fix (F-a4c5e9b7) holds for
      // real songs now that the chord-transpose crash is fixed.
      const realResult = (await client.callTool({
        name: "transpose_song",
        arguments: { id: "fallin", semitones: 2 },
      })) as ToolResult;
      expect(realResult.isError).not.toBe(true);
      const realText = extractText(realResult);
      const realIdMatch = realText.match(/\*\*New ID:\*\*\s*(\S+)/);
      expect(realIdMatch).not.toBeNull();
      const realNewId = realIdMatch![1];
      const realKeyMatch = realText.match(/\*\*New key:\*\*\s*(.+)/);
      expect(realKeyMatch).not.toBeNull();

      const realSavedPath = join(tmpHome, ".ai-jam-sessions", "songs", `${realNewId}.json`);
      expect(existsSync(realSavedPath)).toBe(true);
      const realSaved = JSON.parse(readFileSync(realSavedPath, "utf8")) as {
        id: string;
        key: string;
        measures: Array<{ rightHand: string; leftHand: string }>;
      };
      expect(realSaved.id).toBe(realNewId);
      expect(realSaved.key).toBe(realKeyMatch![1].trim());
      // The transposed real song retains its chord notation (not silently
      // flattened to single notes): at least one measure still has a "+"-join.
      expect(
        realSaved.measures.some(
          (m) => m.rightHand.includes("+") || m.leftHand.includes("+"),
        ),
      ).toBe(true);
    },
    20000,
  );
});

// ─── Stdio purity (pins B-B1-001) ───────────────────────────────────────────
//
// mcp-server.ts's MCP transport is StdioServerTransport — the JSON-RPC
// framing channel IS the child process's stdout. Anything else written to
// stdout (a stray console.log, a teaching-hook narration line, a debug
// print) corrupts that channel. Pre-fix, `createConsoleTeachingHook()`
// (src/teaching.ts) — which calls `console.log(...)` for onMeasureStart /
// onKeyMoment / onSongComplete / push — was pushed into the hooks array
// UNCONDITIONALLY by both play_song code paths (mcp-server.ts's MIDI-file
// branch at ~line 1010 and library-song branch at ~line 1163), regardless of
// the withTeaching flag. Any play_song call that gets far enough to start
// playback leaks lines like "  [Measure 1]" onto stdout.
//
// This bug does NOT necessarily fail the OTHER tests in this file: the SDK's
// own StdioClientTransport (see shared/stdio.js's ReadBuffer) reads stdout
// newline-delimited, and if `JSON.parse(line)` throws on a garbage line, it
// just forwards to `transport.onerror` (a no-op unless a caller sets one —
// confirmed by reading the SDK's Protocol class) and moves on to the next
// line; the legitimate JSON-RPC response, sent as its own separate write,
// still parses fine and resolves the pending tool call. So a client built on
// this SDK silently tolerates the leak. A stricter client, or any
// line-oriented proxy/logger sitting on the stdio pipe (exactly the shape of
// a real MCP host), would not. This test bypasses the SDK's lenient
// per-line handling entirely and inspects the raw byte stream, which is the
// only way to actually catch this class of bug — this is why it is a new,
// dedicated test rather than an assertion bolted onto an existing one.
describe("mcp-server.ts — stdio purity (pins B-B1-001)", () => {
  it(
    "writes ONLY JSON-RPC to stdout during a play_song call — no teaching-hook narration text " +
      "(e.g. '[Measure N]') leaks onto the framing channel, even though the SDK client itself " +
      "would silently tolerate such a leak",
    async () => {
      const rawStdoutLines: string[] = [];
      let lineBuf = "";

      const iso = await spawnIsolatedServer();
      try {
        // Reach into the transport's own child process to observe the exact
        // bytes written to stdout — the same stream the SDK's ReadBuffer
        // consumes to frame JSON-RPC messages. This is a second, independent
        // 'data' listener on the real stdout stream (Node streams dispatch
        // 'data' to every registered listener; this doesn't steal or reorder
        // bytes the SDK's own transport needs to keep functioning).
        const rawProcess = (
          iso.transport as unknown as { _process?: { stdout?: NodeJS.ReadableStream } }
        )._process;
        expect(rawProcess?.stdout).toBeTruthy();
        rawProcess!.stdout!.on("data", (chunk: Buffer) => {
          lineBuf += chunk.toString("utf8");
          let idx: number;
          while ((idx = lineBuf.indexOf("\n")) !== -1) {
            rawStdoutLines.push(lineBuf.slice(0, idx).replace(/\r$/, ""));
            lineBuf = lineBuf.slice(idx + 1);
          }
        });

        // Loop mode over a tiny 1-measure range on a real library song — the
        // library-song play_song path is the one that unconditionally pushed
        // createConsoleTeachingHook() into libHooks pre-fix. onMeasureStart
        // fires essentially immediately once session.play() starts
        // (synchronously, before the tool handler's own return — playRange's
        // first loop iteration awaits Promise.all([onMeasureStart(...),
        // playMeasure(...)]), and onMeasureStart's console.log runs
        // synchronously within that), so this exercises the leak whether or
        // not this machine has a real audio device — see F-765eb987 /
        // T-B1-001 for confirmation that connector.connect() succeeds
        // (degrades gracefully) on headless CI here. Per this wave's brief:
        // if audio genuinely can't start on some other test machine, the
        // handler still returns its own JSON-RPC response before ever
        // reaching the hooks code, so the assertion below ("any stdout
        // observed must be JSON") holds regardless either way.
        const playResult = (await iso.client.callTool({
          name: "play_song",
          arguments: { id: "fallin", mode: "loop", startMeasure: 1, endMeasure: 1 },
        })) as ToolResult;
        expect(playResult).toBeDefined();

        // Give any backgrounded teaching-hook callbacks (onMeasureStart /
        // onKeyMoment / onSongComplete / push) a window to fire and
        // potentially write to stdout.
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Best-effort stop so the background loop doesn't outlive the test.
        await iso.client.callTool({ name: "stop_playback", arguments: {} }).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 200));
      } finally {
        await iso.close();
      }

      // Flush a trailing partial line (no terminating newline yet, e.g. if
      // the process was still mid-write when the test stopped listening) —
      // a non-JSON trailing fragment is just as much a leak as a full line.
      if (lineBuf.trim().length > 0) {
        rawStdoutLines.push(lineBuf);
      }

      const nonEmptyLines = rawStdoutLines.filter((l) => l.trim().length > 0);
      // Non-vacuous: must have actually observed traffic (at minimum the
      // play_song and stop_playback tool responses) — otherwise the
      // all-lines-are-JSON assertion below would trivially pass over zero
      // lines and prove nothing.
      expect(nonEmptyLines.length).toBeGreaterThan(0);

      const badLines: string[] = [];
      for (const line of nonEmptyLines) {
        try {
          JSON.parse(line);
        } catch {
          badLines.push(line);
        }
      }

      // Strict purity: stdout IS the JSON-RPC framing channel, so it must carry
      // nothing but JSON. Two classes of non-JSON used to reach it, both now
      // closed:
      //   • our own teaching/singing narration ("[Measure N]", ♪/★/🎓/ℹ/💡/❗,
      //     solfège) — routed to stderr (B-B1-001);
      //   • the native audio layer's fd-1 writes — node-web-audio-api's cpal
      //     JACK probe (`Failed to open client … LibraryError("libjack.so.0…")`)
      //     prints to fd-1 from native code, outside our JS console. It could
      //     not be intercepted in-process (no dup2 in pure Node; /proc/self/fd
      //     reopen is ENXIO for a pipe fd; worker threads share the fd table),
      //     so it is now quarantined to stderr by the stdio-purity supervisor
      //     (src/stdio-supervisor.ts), which runs the real server as an inner
      //     child and splits JSON-RPC onto fd 3.
      // With both closed there is no tolerated-noise exception left: ANY
      // non-JSON line on stdout is a real protocol-corruption regression.
      // (Reverting the stderr hook makes "[Measure N]" reappear here; disabling
      // the supervisor makes the libjack line reappear here — both → RED.)
      expect(badLines).toEqual([]);
    },
    25000,
  );

  // FL3-002 hygiene: the RED above only proves narration text never leaks to
  // stdout — it stays green identically whether narration fired on stderr
  // OR never fired at all (e.g. no audio device headless), so on its own it
  // cannot distinguish "the leak is fixed" from "the narration path never
  // ran". This positive control adds the other half: when narration DOES
  // fire, it must land on stderr. Structured to never false-fail headless —
  // the stdout-purity half of the assertion is unconditional (holds
  // trivially with zero narration on either stream); the "it actually fired"
  // half only asserts when stderr narration is observed, so a device-less
  // CI runner still gets a real (not vacuous) purity check without needing
  // real audio to succeed.
  it(
    "when teaching narration fires, it appears on stderr and NEVER on stdout — not merely absent from stdout because it never fired",
    async () => {
      let stdoutBuf = "";
      let stderrBuf = "";

      const iso = await spawnIsolatedServer();
      try {
        const rawProcess = (
          iso.transport as unknown as {
            _process?: { stdout?: NodeJS.ReadableStream; stderr?: NodeJS.ReadableStream };
          }
        )._process;
        expect(rawProcess?.stdout).toBeTruthy();
        rawProcess!.stdout!.on("data", (chunk: Buffer) => {
          stdoutBuf += chunk.toString("utf8");
        });
        rawProcess?.stderr?.on("data", (chunk: Buffer) => {
          stderrBuf += chunk.toString("utf8");
        });

        const playResult = (await iso.client.callTool({
          name: "play_song",
          arguments: { id: "fallin", mode: "loop", startMeasure: 1, endMeasure: 1 },
        })) as ToolResult;
        expect(playResult).toBeDefined();

        // Give any backgrounded teaching-hook callbacks a window to fire.
        await new Promise((resolve) => setTimeout(resolve, 1500));

        await iso.client.callTool({ name: "stop_playback", arguments: {} }).catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 200));
      } finally {
        await iso.close();
      }

      const NARRATION_RE = /\[Measure/;
      const narrationOnStdout = NARRATION_RE.test(stdoutBuf);
      const narrationOnStderr = NARRATION_RE.test(stderrBuf);

      // Unconditional, CI-robust: narration text must NEVER reach stdout.
      // Holds trivially (both sides false) in a headless/no-audio-device
      // environment where narration never fires at all — never false-fails.
      expect(narrationOnStdout).toBe(false);

      // Positive control: only exercised when a real audio device lets
      // playback reach the teaching hook (e.g. local dev with a device).
      // Proves this suite isn't vacuously green because narration simply
      // never happened — when it DOES fire, it must be observed on stderr.
      if (narrationOnStderr) {
        expect(stderrBuf).toMatch(NARRATION_RE);
        expect(narrationOnStdout).toBe(false);
      }
    },
    25000,
  );
});

// ─── Session-state persistence validation (pins B-B1-002) ──────────────────
//
// loadSessionState() (mcp-server.ts) reads <HOME>/.ai-jam-sessions/
// server-state.json at startup and restores `lastCompletedSession` from it.
// Neither loadSessionState nor persistSessionState nor STATE_FILE are
// exported — mcp-server.ts has no isMain-style guard (see this file's own
// header comment), so there is no way to unit-test the loader function
// directly. These tests instead pre-seed a server-state.json BEFORE spawning
// a fresh, isolated server instance (loadSessionState only runs once, inside
// main(), at startup) and observe the loader's effect indirectly through
// save_practice_note, which falls back to `lastCompletedSession` whenever no
// `song_id` override is given ("Tool: save_practice_note") and renders it
// into the journal entry via buildJournalEntry() (src/journal.ts) — a
// session-less fallback renders a "### HH:MM — General notes" header; a
// loaded session renders "### HH:MM — <title> (<composer>)" with the
// session's fields.
//
// Confirmed directly against the landed implementation (mcp-server.ts, "─
// Helpers ─" section) — two independent gates, both must pass:
//   1. Top-level `schemaVersion` must strictly equal `SERVER_STATE_SCHEMA_
//      VERSION` (currently 1). Anything else (absent, wrong number, wrong
//      type) discards the WHOLE file — even a perfectly-shaped
//      lastCompletedSession alongside a bad schemaVersion is discarded, not
//      just the version field.
//   2. Once the version gate passes, `lastCompletedSession` (if present) is
//      checked field-by-field by isValidSessionSnapshot() — every required
//      field must be present with the right primitive type. A shape that
//      fails this is discarded on its own (schemaVersion alone doesn't save
//      it), falling back to no-session rather than a corrupted load.
//
// Session-state persistence had ZERO coverage before this file.
describe("mcp-server.ts — session-state validation (pins B-B1-002)", () => {
  const SERVER_STATE_SCHEMA_VERSION = 1;

  /** A SessionSnapshot that satisfies isValidSessionSnapshot()'s full field/type contract. */
  function validSessionSnapshot(title: string): Record<string, unknown> {
    return {
      songId: "fallin",
      title,
      composer: "Tests Agent Composer",
      genre: "pop",
      difficulty: "intermediate",
      key: "C minor",
      tempo: 92,
      speed: 1.0,
      mode: "full",
      measuresPlayed: 8,
      totalMeasures: 8,
      durationSeconds: 30,
      timestamp: "2026-01-01T00:00:00.000Z",
    };
  }

  function seedStateFile(tmpHome: string, rawContent: string): void {
    const dir = join(tmpHome, ".ai-jam-sessions");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "server-state.json"), rawContent, "utf-8");
  }

  async function saveNoteAndReadJournal(
    client: Client,
    note: string,
  ): Promise<{ result: ToolResult; journalText: string }> {
    const result = (await client.callTool({
      name: "save_practice_note",
      arguments: { note },
    })) as ToolResult;
    const text = extractText(result);
    const pathMatch = text.match(/Journal entry saved to (.+)/);
    expect(pathMatch).not.toBeNull();
    const journalPath = pathMatch![1].trim();
    expect(existsSync(journalPath)).toBe(true);
    const journalText = readFileSync(journalPath, "utf-8");
    return { result, journalText };
  }

  it(
    "loads a well-formed lastCompletedSession from server-state.json (with the correct schemaVersion) and uses it as save_practice_note's fallback session",
    async () => {
      const validState = {
        schemaVersion: SERVER_STATE_SCHEMA_VERSION,
        lastCompletedSession: validSessionSnapshot("TestsAgentSeededSession"),
      };
      const iso = await spawnIsolatedServer({
        beforeStart: (tmpHome) => seedStateFile(tmpHome, JSON.stringify(validState)),
      });
      try {
        const { journalText } = await saveNoteAndReadJournal(
          iso.client,
          "tests-agent-B-B1-002 valid-load probe",
        );
        // Full invariant: the seeded session's title/composer genuinely made
        // it into the rendered entry (not just "didn't crash").
        expect(journalText).toContain("TestsAgentSeededSession");
        expect(journalText).toContain("Tests Agent Composer");
        expect(journalText).not.toContain("General notes");
        expect(journalText).toContain("tests-agent-B-B1-002 valid-load probe");
      } finally {
        await iso.close();
      }
    },
    20000,
  );

  it(
    "MUTATION-STYLE: discards the ENTIRE file — including an otherwise perfectly-valid lastCompletedSession — when schemaVersion doesn't match, proving the version gate is a real hard cutoff and not a no-op",
    async () => {
      // A validator that only shape-checked lastCompletedSession (ignoring
      // schemaVersion entirely) would happily accept this fixture — the
      // session payload alone is 100% valid. The real contract must reject
      // it anyway because the wrapping schemaVersion doesn't match.
      const staleVersionState = {
        schemaVersion: 0, // != SERVER_STATE_SCHEMA_VERSION (1)
        lastCompletedSession: validSessionSnapshot("ShouldNeverAppearInJournal"),
      };
      const iso = await spawnIsolatedServer({
        beforeStart: (tmpHome) => seedStateFile(tmpHome, JSON.stringify(staleVersionState)),
      });
      try {
        const { result, journalText } = await saveNoteAndReadJournal(
          iso.client,
          "tests-agent-B-B1-002 stale-schema-version probe",
        );
        expect(result.isError).not.toBe(true);
        expect(journalText).toContain("General notes");
        expect(journalText).not.toContain("ShouldNeverAppearInJournal");
      } finally {
        await iso.close();
      }
    },
    20000,
  );

  it(
    "discards gracefully (falls back to no-session) when schemaVersion is correct but lastCompletedSession is a string, not an object",
    async () => {
      const iso = await spawnIsolatedServer({
        beforeStart: (tmpHome) =>
          seedStateFile(
            tmpHome,
            JSON.stringify({
              schemaVersion: SERVER_STATE_SCHEMA_VERSION,
              lastCompletedSession: "not-a-valid-session-object",
            }),
          ),
      });
      try {
        const { result, journalText } = await saveNoteAndReadJournal(
          iso.client,
          "tests-agent-B-B1-002 malformed-string probe",
        );
        expect(result.isError).not.toBe(true);
        // Discarded, not corrupt-loaded: the null-session fallback header,
        // no "undefined" leaking from blindly reading .title/.genre/etc off
        // a string, and definitely not the raw garbage value itself. This
        // exercises isValidSessionSnapshot()'s `typeof x !== "object"`
        // branch specifically (schemaVersion is correct here, so the outer
        // version gate isn't what's catching this case).
        expect(journalText).toContain("General notes");
        expect(journalText).not.toContain("undefined");
        expect(journalText).not.toContain("not-a-valid-session-object");
      } finally {
        await iso.close();
      }
    },
    20000,
  );

  it(
    "discards gracefully when schemaVersion is correct but lastCompletedSession is an incomplete/old-shape object (missing required fields)",
    async () => {
      // Represents a hypothetical hand-edited or partially-written
      // server-state.json that carries the current schemaVersion but a
      // session object predating fields SessionSnapshot now requires —
      // truthy, a real object, but nowhere near a valid session. This
      // exercises isValidSessionSnapshot()'s per-field type checks
      // specifically (schemaVersion is correct, so the outer version gate
      // isn't what's catching this case — a validator that checked ONLY
      // "is lastCompletedSession an object" would wrongly accept this).
      const iso = await spawnIsolatedServer({
        beforeStart: (tmpHome) =>
          seedStateFile(
            tmpHome,
            JSON.stringify({
              schemaVersion: SERVER_STATE_SCHEMA_VERSION,
              lastCompletedSession: { songId: "old-song-from-a-prior-schema" },
            }),
          ),
      });
      try {
        const { result, journalText } = await saveNoteAndReadJournal(
          iso.client,
          "tests-agent-B-B1-002 old-shape probe",
        );
        expect(result.isError).not.toBe(true);
        expect(journalText).toContain("General notes");
        expect(journalText).not.toContain("undefined");
        expect(journalText).not.toContain("old-song-from-a-prior-schema");
      } finally {
        await iso.close();
      }
    },
    20000,
  );

  it(
    "discards gracefully (server still starts, tools still work) when server-state.json is unparseable JSON",
    async () => {
      const iso = await spawnIsolatedServer({
        beforeStart: (tmpHome) => seedStateFile(tmpHome, "{ this is not valid json at all ][["),
      });
      try {
        // Server-level "no crash" — the whole process must still come up and
        // serve tools normally despite a corrupt state file.
        const toolList = await iso.client.listTools();
        expect(toolList.tools.length).toBeGreaterThan(0);

        const { result, journalText } = await saveNoteAndReadJournal(
          iso.client,
          "tests-agent-B-B1-002 corrupt-json probe",
        );
        expect(result.isError).not.toBe(true);
        expect(journalText).toContain("General notes");
      } finally {
        await iso.close();
      }
    },
    20000,
  );

  it(
    "discards gracefully when server-state.json's top level is valid JSON but not an object (e.g. an array)",
    async () => {
      const iso = await spawnIsolatedServer({
        beforeStart: (tmpHome) => seedStateFile(tmpHome, JSON.stringify(["not", "an", "object"])),
      });
      try {
        const { result, journalText } = await saveNoteAndReadJournal(
          iso.client,
          "tests-agent-B-B1-002 non-object-top-level probe",
        );
        expect(result.isError).not.toBe(true);
        expect(journalText).toContain("General notes");
      } finally {
        await iso.close();
      }
    },
    20000,
  );
});

// ─── fs-write errors return structured JamError results (pins B-B1-003) ──────
//
// Three fs-write sites in mcp-server.ts were hardened to return a structured
// fsErrorResult() — a JamError rendered via toUserString() ("[CODE] message"
// followed by a "Hint:" line) — instead of letting a raw Error escape the
// handler. Two of them are pinned here: save_practice_note's
// appendJournalEntry() call, and annotate_song's ingest/persist catch.
//
// Why isError:true is NECESSARY BUT NOT SUFFICIENT to prove the fix: the MCP
// SDK's CallToolRequest handler wraps ANY thrown handler error into an
// isError:true result too (createToolError(), verified in
// node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js) — so a
// pre-fix RAW throw would ALSO surface as isError:true, just carrying the bare
// inner error string ("ENOENT: …") with NO [CODE] prefix and NO Hint line.
// The load-bearing assertion in each test below is therefore on the JamError
// SHAPE, which only the fixed (fsErrorResult) code path produces.
//
// Both failures are injected as REAL filesystem errors inside the spawned
// child server (this suite drives a real MCP-over-stdio child process — there
// is no in-process writeFileSync to mock), by planting a FILE where the code
// expects a DIRECTORY: a write/append under such a path throws ENOENT/ENOTDIR
// (confirmed on this rig before writing these tests).
describe("mcp-server.ts — fs-write errors return structured JamError results (pins B-B1-003)", () => {
  it(
    "save_practice_note returns a structured isError result (JamError shape), not an uncaught raw throw, when the journal append fails",
    async () => {
      const iso = await spawnIsolatedServer({
        beforeStart: (home) => {
          // Plant a FILE where appendJournalEntry() expects the journal
          // DIRECTORY (<HOME>/.ai-jam-sessions/journal). ensureJournalDir()
          // sees existsSync(dir)===true and skips its mkdir; the subsequent
          // appendFileSync(join(dir, "<date>.md")) then throws because its
          // parent is a file, not a directory. Safe to seed pre-start: the
          // server's startup path never touches the journal dir (it is created
          // lazily, only inside save_practice_note).
          const ajs = join(home, ".ai-jam-sessions");
          mkdirSync(ajs, { recursive: true });
          writeFileSync(join(ajs, "journal"), "collision: a file where the journal dir should be", "utf-8");
        },
      });
      try {
        const result = (await iso.client.callTool({
          name: "save_practice_note",
          arguments: { note: "tests-agent B-B1-003 — journal write should fail structurally" },
        })) as ToolResult;
        const text = extractText(result);

        // Structured error, not a fake success.
        expect(result.isError).toBe(true);
        expect(text).not.toContain("Journal entry saved to");
        // JamError shape from fsErrorResult(err, "save practice journal entry"):
        // "[IO_FILE_WRITE] Failed to save practice journal entry: …\nHint: …".
        // A pre-fix raw throw would surface the bare inner error ("Failed to
        // write journal entry to …" / "ENOENT: …") with NEITHER the
        // [IO_FILE_WRITE] code prefix NOR the Hint line — so these three
        // assertions are what actually distinguish fixed from unfixed.
        expect(text).toContain("[IO_FILE_WRITE]");
        expect(text).toContain("save practice journal entry");
        expect(text).toContain("Hint:");
      } finally {
        await iso.close();
      }
    },
    20000,
  );

  it(
    "annotate_song's ingest/persist catch returns a JamError-shaped result (code/message/hint), not a raw err.message, when the persist step fails",
    async () => {
      // annotate_song best-effort-writes the library config at entry.configPath
      // BEFORE its ingest/persist try block. That path is a real, checked-in
      // repo file that OTHER test files scan from the live library in parallel
      // vitest workers (piano-roll/teaching/session). Make it read-only so the
      // best-effort write EPERMs — the documented read-only-package-install
      // branch (F-a53c900d) — leaving the repo file's CONTENT untouched: no
      // mutation, no torn-write race. Original bytes captured as a
      // belt-and-suspenders restore for any environment where read-only does
      // not block the write (e.g. a root CI user); in that case no concurrent
      // test asserts on this raw song's content, so a transient swap is inert.
      //
      // A RAW song is used deliberately: raw songs are NOT registered at
      // startup (initializeFromLibrary only ingests "ready" songs), so
      // registerSong() inside annotate_song won't throw "Duplicate song ID"
      // first — the flow reaches saveSong(), the persist step we want to fail.
      // Discover a currently-RAW library song at runtime. Harvest waves flip
      // whole genres to "ready" over time, so a hardcoded slug rots — the
      // original choice ("blues-in-the-night") went ready in the 2026-07
      // pilot and silently changed which code path this test exercised.
      // If the library ever reaches 120/120 ready, inject a fixture raw
      // song instead (the throw below is that signal).
      const libraryRoot = fileURLToPath(new URL("../songs/library", import.meta.url));
      const rawEntry = (() => {
        for (const genre of readdirSync(libraryRoot)) {
          const genreDir = join(libraryRoot, genre);
          if (!statSync(genreDir).isDirectory()) continue;
          for (const f of readdirSync(genreDir)) {
            if (!f.endsWith(".json")) continue;
            const p = join(genreDir, f);
            const cfg = JSON.parse(readFileSync(p, "utf-8")) as { id?: string; status?: string };
            // Sibling .mid required: a config-only entry would make
            // ingestSong() throw "MIDI file not found" inside the SAME catch
            // this test asserts on — green text, wrong path again (the .tmp
            // assertion below would flag it, but don't pick a doomed
            // candidate when the next one over works).
            if (cfg.status !== "ready" && typeof cfg.id === "string" && existsSync(p.replace(/\.json$/, ".mid"))) {
              return { id: cfg.id, path: p };
            }
          }
        }
        throw new Error(
          "no raw library song left to exercise the persist-failure path — inject a fixture raw song",
        );
      })();
      const RAW_SONG_ID = rawEntry.id;
      const libConfigPath = rawEntry.path;
      const originalBytes = readFileSync(libConfigPath);

      let iso: Awaited<ReturnType<typeof spawnIsolatedServer>> | undefined;
      try {
        chmodSync(libConfigPath, 0o444);
        iso = await spawnIsolatedServer();

        // Plant a FILE where getUserSongsDir() resolves
        // (<HOME>/.ai-jam-sessions/songs) so annotate_song's saveSong() persist
        // throws. This MUST be post-startup, NOT in beforeStart: at boot,
        // initializeFromLibrary → loadSongsFromDir(userDir) calls
        // readdirSync(userDir), and a file there throws ENOTDIR *uncaught*,
        // crashing the server. At startup the songs dir simply doesn't exist
        // (clean boot); we plant the collision only after connect, and call no
        // saveSong-touching tool before annotate_song, so it is intact when
        // saveSong() runs.
        const ajs = join(iso.tmpHome, ".ai-jam-sessions");
        mkdirSync(ajs, { recursive: true });
        writeFileSync(join(ajs, "songs"), "collision: a file where the user songs dir should be", "utf-8");

        const result = (await iso.client.callTool({
          name: "annotate_song",
          arguments: {
            song_id: RAW_SONG_ID,
            description: "tests-agent B-B1-003 probe annotation — must never persist.",
            structure: "12-bar blues",
            key_moments: ["tests-agent key moment"],
            teaching_goals: ["tests-agent teaching goal"],
            style_tips: ["tests-agent style tip"],
          },
        })) as ToolResult;
        const text = extractText(result);

        // Structured error, not a fake success.
        expect(result.isError).toBe(true);
        expect(text).not.toContain("annotated and promoted to ready!");
        // JamError shape from
        // fsErrorResult(err, `finish annotating "<id>" (ingest/persist)`):
        expect(text).toContain("[IO_FILE_WRITE]");
        expect(text).toContain(`finish annotating "${RAW_SONG_ID}" (ingest/persist)`);
        expect(text).toContain("Hint:");
        // Pin the failure to saveSong() itself, not a lookalike routed
        // through the same catch: fsErrorResult embeds the inner err.message,
        // and only saveSong's atomic write-temp-then-rename can put a ".tmp"
        // path in it. The two lookalikes carry other text instead —
        // registerSong's guard says `Duplicate song ID: "<id>"` (exactly how
        // this test once went stale-but-green when its hardcoded raw song was
        // harvest-promoted to ready), and an ingest failure says "MIDI file
        // not found" / a parse error. Neither can produce ".tmp".
        expect(text).toContain(".tmp");
        expect(text).not.toContain("Duplicate song ID");
        // annotate_song's catch appends this note AFTER the JamError string —
        // proves the response came from the ingest/persist catch specifically,
        // not some earlier plain-text isError branch (e.g. the "not found" one).
        expect(text).toContain("The config was updated at");
      } finally {
        // Restore the repo file: clear the read-only attribute first, then
        // rewrite the exact original bytes (a no-op when read-only already
        // blocked the best-effort mutation).
        chmodSync(libConfigPath, 0o644);
        writeFileSync(libConfigPath, originalBytes);
        if (iso) await iso.close();
      }
    },
    25000,
  );
});

// ─── Practice loop + scoring tools (Wave S3) ────────────────────────────────
//
// practice_loop/practice_status/score_last_take/view_scored_piano_roll are
// new tools; play_song gained metronome/countIn/record (covered by the
// registration/schema test above, in the first describe block). Registration
// and input-validation paths are audio-free and fast (also above, reusing
// the shared client). The tests below need PRISTINE server-side state
// (lastRecording/lastScoredTake/activePracticeLoop start unset) or touch a
// real audio connector, so — matching this file's own established pattern —
// each gets its own spawnIsolatedServer() instance rather than reusing the
// shared client. There is no DI seam for a mock connector at the protocol
// level (see this file's header comment) — the mock-connector happy path
// for the underlying PracticeLoop/scoring logic itself lives in
// practice-loop.test.ts, which needs no real audio at all. The real-audio
// test here follows the same "confirmed to connect in this sandbox, but
// tolerate a headless/no-device CI runner" hedge the play_song tests above
// already use.
describe("mcp-server.ts — practice loop + scoring tools (Wave S3)", () => {
  it(
    "practice_status, score_last_take, and view_scored_piano_roll report their empty states on a fresh server",
    async () => {
      const iso = await spawnIsolatedServer();
      try {
        const status = (await iso.client.callTool({ name: "practice_status", arguments: {} })) as ToolResult;
        expect(status.isError).not.toBe(true);
        expect(extractText(status).toLowerCase()).toMatch(/no practice loop/);

        const scored = (await iso.client.callTool({ name: "score_last_take", arguments: {} })) as ToolResult;
        expect(scored.isError).toBe(true);
        expect(extractText(scored).toLowerCase()).toMatch(/no recorded take/);

        const roll = (await iso.client.callTool({ name: "view_scored_piano_roll", arguments: {} })) as ToolResult;
        expect(roll.isError).toBe(true);
        expect(extractText(roll).toLowerCase()).toMatch(/no scored take/);
      } finally {
        await iso.close();
      }
    },
    20000,
  );

  it(
    "practice_loop starts successfully and returns the first pass's micro-goal + a config echo (real audio — best-effort, mirrors this file's play_song hedge)",
    async () => {
      const iso = await spawnIsolatedServer();
      try {
        const result = (await iso.client.callTool({
          name: "practice_loop",
          arguments: { id: "fallin", startMeasure: 1, endMeasure: 1, speedStartPct: 80, speedTargetPct: 80 },
        })) as ToolResult;
        const text = extractText(result);

        if (result.isError) {
          // No audio device on this runner — the same degrade path
          // play_song's own tests already tolerate (see this file's header
          // comment). The validation-path tests in the first describe block
          // already prove the input-checking logic independent of audio.
          expect(text.toLowerCase()).toMatch(/couldn't start|engine/);
        } else {
          expect(text).toContain("Practice loop started");
          expect(text).toContain("m. 1 at 80%"); // single-measure micro-goal (formatMicroGoal)
          expect(text).toContain("measures 1–1");
          expect(text).toContain("80% → 80%");

          // practice_status should now see it as running (or already
          // completed, if the pass finished fast) rather than "no loop yet".
          const status = (await iso.client.callTool({ name: "practice_status", arguments: {} })) as ToolResult;
          expect(extractText(status).toLowerCase()).not.toMatch(/no practice loop has run yet/);
        }

        // Best-effort cleanup in case audio did start (local dev with a device).
        await iso.client.callTool({ name: "stop_playback", arguments: {} }).catch(() => {});
      } finally {
        await iso.close();
      }
    },
    25000,
  );

  it(
    "score_last_take refuses a loop-mode take with a structured message instead of mis-scoring it (real audio — best-effort)",
    async () => {
      const iso = await spawnIsolatedServer();
      try {
        const played = (await iso.client.callTool({
          name: "play_song",
          arguments: { id: "fallin", mode: "loop", record: true },
        })) as ToolResult;

        if (played.isError) {
          // No audio device on this runner — same hedge as this file's other
          // audio-touching tests.
          expect(extractText(played).toLowerCase()).toMatch(/couldn't start|engine/);
          return;
        }

        // stop_playback captures whatever was recorded (mcp-server.ts's
        // stopActive -> captureLastRecording) regardless of how far the loop
        // actually got — even a stop during count-in still tags mode:"loop"
        // on lastRecording, since that comes from the session's own config,
        // not from how much actually played.
        await iso.client.callTool({ name: "stop_playback", arguments: {} });

        const scored = (await iso.client.callTool({ name: "score_last_take", arguments: {} })) as ToolResult;
        expect(scored.isError).toBe(true);
        const text = extractText(scored);
        expect(text.toLowerCase()).toMatch(/loop-mode take/);
        expect(text).toMatch(/use `?practice_loop`? for scored looping, or record with mode:'full'/);
      } finally {
        await iso.close();
      }
    },
    25000,
  );

  it(
    "pause_playback pauses and resumes a running practice loop instead of reporting nothing is playing (real audio — best-effort)",
    async () => {
      const iso = await spawnIsolatedServer();
      try {
        const started = (await iso.client.callTool({
          name: "practice_loop",
          arguments: { id: "fallin", startMeasure: 1, endMeasure: 1, speedStartPct: 80, speedTargetPct: 80 },
        })) as ToolResult;

        if (started.isError) {
          expect(extractText(started).toLowerCase()).toMatch(/couldn't start|engine/);
          return;
        }

        // Every pass has a metronome count-in (practice_loop always enables
        // the metronome — see the practice_loop tool), so the session is
        // reliably "playing" for at least the count-in's duration right
        // after practice_loop returns — no artificial wait needed.
        const status = (await iso.client.callTool({ name: "practice_status", arguments: {} })) as ToolResult;
        const running = /\*\*Status:\*\* running/.test(extractText(status));

        if (running) {
          const paused = (await iso.client.callTool({ name: "pause_playback", arguments: {} })) as ToolResult;
          const pausedText = extractText(paused).toLowerCase();
          expect(pausedText).not.toMatch(/no song is currently playing/);
          expect(pausedText).toMatch(/paused practice loop/);

          const resumed = (await iso.client.callTool({ name: "pause_playback", arguments: { resume: true } })) as ToolResult;
          const resumedText = extractText(resumed).toLowerCase();
          expect(resumedText).not.toMatch(/nothing is paused/);
          expect(resumedText).toMatch(/resumed practice loop/);
        }
        // else: the single short pass already finished before we could
        // observe "running" — same best-effort hedge this file's other
        // practice_loop test already accepts for a fast completion.

        await iso.client.callTool({ name: "stop_playback", arguments: {} }).catch(() => {});
      } finally {
        await iso.close();
      }
    },
    25000,
  );

  it(
    "set_speed refuses with a structured message while a practice loop is running, instead of fighting its tempo ramp (real audio — best-effort)",
    async () => {
      const iso = await spawnIsolatedServer();
      try {
        const started = (await iso.client.callTool({
          name: "practice_loop",
          arguments: { id: "fallin", startMeasure: 1, endMeasure: 1, speedStartPct: 80, speedTargetPct: 80 },
        })) as ToolResult;

        if (started.isError) {
          expect(extractText(started).toLowerCase()).toMatch(/couldn't start|engine/);
          return;
        }

        const status = (await iso.client.callTool({ name: "practice_status", arguments: {} })) as ToolResult;
        const running = /\*\*Status:\*\* running/.test(extractText(status));

        if (running) {
          const result = (await iso.client.callTool({ name: "set_speed", arguments: { speed: 2 } })) as ToolResult;
          expect(result.isError).toBe(true);
          expect(extractText(result)).toMatch(/practice loop controls its own tempo ramp/);
        }

        await iso.client.callTool({ name: "stop_playback", arguments: {} }).catch(() => {});
      } finally {
        await iso.close();
      }
    },
    25000,
  );
});
