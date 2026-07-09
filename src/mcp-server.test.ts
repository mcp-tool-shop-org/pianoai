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
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
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

      // One past the last measure → structured error (proves the > guard fires
      // at the exact edge, not only for wildly-out-of-range values).
      const past = (await client.callTool({
        name: "play_song",
        arguments: { id: "fallin", mode: "loop", startMeasure: 1, endMeasure: n + 1 },
      })) as ToolResult;
      expect(past.isError).toBe(true);
      expect(extractText(past).toLowerCase()).not.toContain("now playing");

      // Exactly the last measure → must be accepted (a `>=` off-by-one mutation
      // would reject this and stay green against the 999999 case above). Loop
      // just the final measure to minimise real playback, then stop it.
      const edge = (await client.callTool({
        name: "play_song",
        arguments: { id: "fallin", mode: "loop", startMeasure: n, endMeasure: n },
      })) as ToolResult;
      expect(edge.isError).toBeFalsy();
      expect(extractText(edge).toLowerCase()).toContain("now playing");

      await client.callTool({ name: "stop_playback", arguments: {} });
    },
    25000,
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
