// ─── ai-jam-sessions: Stdio Purity Supervisor ────────────────────────────────
//
// PROBLEM. This MCP server speaks JSON-RPC over stdio: the framing channel IS
// the process's stdout (fd 1). Anything else written to fd 1 corrupts the
// protocol. Our own logging is already routed to stderr, but a *native*
// dependency writes to fd 1 out of our reach: node-web-audio-api's cpal layer
// prints a JACK backend-probe failure —
//   Failed to open client because of error: LibraryError("libjack.so.0: …")
// — with a Rust `println!` (stdout) whenever JACK init fails. That happens on
// any Linux host without a running JACK server / libjack.so.0, which includes
// headless CI AND ordinary desktops that merely lack libjack (JACK is not
// installed by default on most modern distros). See the KNOWN-LIMITATION note
// this file replaces at the audio `connect()` site in mcp-server.ts, and the
// stdio-purity test in mcp-server.test.ts.
//
// WHY NOT redirect fd 1 → fd 2 in-process. A native write to fd 1 can only be
// intercepted by reassigning fd 1 at the OS level (dup2 semantics). Node does
// not expose dup2, and every native-free substitute was empirically ruled out
// on Linux (node:22) against a *pipe* fd 1 — exactly how an MCP host and the
// test harness spawn us:
//   • reopening /proc/self/fd/1 (or /dev/stdout) throws ENXIO for a pipe fd,
//     on every open flag — the kernel won't reopen an anonymous pipe by path;
//   • fs.dup / fs.dup2 do not exist; process.binding('fs') exposes only
//     open/close/openFileHandle;
//   • process.stdout writes to fd *number* 1, so it can't be preserved across
//     an fd-1 reassignment;
//   • worker threads share the process fd table, so a worker's raw write(1)
//     still lands on the parent's stdout;
//   • a native dup2 dependency (e.g. `posix`) would force node-gyp at install
//     of a globally-installed CLI — an unacceptable regression — and is
//     unmaintained.
// Because native-noise and JSON-RPC share fd 1, they cannot be separated
// in-process without dup2. Separation therefore requires one thin external
// process.
//
// THE FIX (proven on Linux). On POSIX the published entrypoint re-execs itself
// as a supervisor and runs the real server as an inner child wired so that the
// two streams are split at the OS level, no content parsing:
//
//   child stdio [0, 2, 2, 1]:
//     fd 0  ← supervisor stdin   (host's JSON-RPC requests reach the server)
//     fd 1  → supervisor stderr  (native audio noise is quarantined here)
//     fd 2  → supervisor stderr  (our own diagnostics, unchanged)
//     fd 3  → supervisor stdout  (the inner server writes JSON-RPC here)
//
// The inner server points its StdioServerTransport output at fd 3 (see
// openRpcOutputStream). Result: the host's stdout carries pure JSON-RPC and
// can never be corrupted by the native audio layer, regardless of JACK state.
//
// Windows uses cpal's WASAPI backend, which does not perform the JACK probe,
// so there is no leak to quarantine there; on win32 we skip the supervisor and
// run a single process with JSON-RPC on stdout as before.
// ─────────────────────────────────────────────────────────────────────────────

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import type { Writable } from "node:stream";

/** Env marker set by the supervisor on the re-exec'd inner server process. */
const INNER_ENV_FLAG = "AJS_MCP_INNER";

/** True when we are the inner server the supervisor re-exec'd. */
export function isInnerStdioProcess(): boolean {
  return process.env[INNER_ENV_FLAG] === "1";
}

/**
 * True when this process should act as the stdio-purity supervisor: POSIX
 * hosts (where the native JACK probe can leak to stdout) and not already the
 * inner child. On win32 there is no leak to quarantine, so we run directly.
 */
export function shouldSuperviseStdio(): boolean {
  return process.platform !== "win32" && !isInnerStdioProcess();
}

/**
 * Resolve the Writable the MCP transport should send JSON-RPC to.
 *
 *  - Inner server under the supervisor: fd 3, which the supervisor wired to
 *    the host's stdout. This keeps fd 1 free for the native audio layer's
 *    stray prints (which the supervisor routes to stderr).
 *  - Otherwise (win32, or a direct run with no supervisor): stdout, unchanged.
 */
export function openRpcOutputStream(): Writable {
  if (!isInnerStdioProcess()) {
    return process.stdout;
  }
  try {
    // path is ignored when `fd` is given; autoClose:false so we never yank
    // fd 3 out from under an in-flight write (the OS closes it on exit).
    return createWriteStream(null as unknown as string, { fd: 3, autoClose: false });
  } catch (err) {
    // Defensive: if fd 3 is somehow unavailable, degrade to stdout rather than
    // crash. This reintroduces the (narrow) native-leak risk but keeps the
    // server functional; it should never happen under our own supervisor.
    process.stderr.write(
      `ai-jam-sessions: fd 3 unavailable, JSON-RPC falling back to stdout ` +
        `(${err instanceof Error ? err.message : String(err)})\n`,
    );
    return process.stdout;
  }
}

/**
 * Re-exec this process as the inner MCP server and supervise it, splitting the
 * inner's stdout (native noise) from its JSON-RPC (fd 3) at the OS level. Never
 * returns to normal server startup; keeps the process alive until the inner
 * exits, then mirrors its exit status. Call only when shouldSuperviseStdio().
 */
export function runStdioSupervisor(): void {
  // Preserve node flags (e.g. `--import tsx` in dev) but drop inspector flags
  // so the child doesn't fight the parent for the same debug port.
  const execArgv = process.execArgv.filter((a) => !a.startsWith("--inspect"));
  const scriptAndArgs = process.argv.slice(1); // [entry script, ...user args]

  const child = spawn(process.execPath, [...execArgv, ...scriptAndArgs], {
    env: { ...process.env, [INNER_ENV_FLAG]: "1" },
    // [stdin, inner-stdout→our stderr, inner-stderr→our stderr, inner fd3→our stdout]
    stdio: [0, 2, 2, 1],
  });

  let settled = false;

  const forward = (sig: NodeJS.Signals): void => {
    try {
      child.kill(sig);
    } catch {
      /* child already gone */
    }
  };
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as NodeJS.Signals[]) {
    process.on(sig, () => forward(sig));
  }

  child.on("error", (err) => {
    if (settled) return;
    settled = true;
    process.stderr.write(
      `ai-jam-sessions: failed to launch MCP server process: ` +
        `${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (settled) return;
    settled = true;
    if (signal) {
      // Re-raise so our termination status mirrors the inner's.
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}
