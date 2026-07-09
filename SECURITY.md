# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0.0 | No        |

## Reporting a Vulnerability

Email: **64996768+mcp-tool-shop@users.noreply.github.com**

Include:
- Description of the vulnerability
- Steps to reproduce
- Version affected
- Potential impact

### Response timeline

| Action | Target |
|--------|--------|
| Acknowledge report | 48 hours |
| Assess severity | 7 days |
| Release fix | 30 days |

## Scope

This is an audio synthesis MCP server and CLI tool that runs locally. The npm package also ships **opt-in dataset/eval tooling** (used to build and evaluate the jam-actions-v0 dataset) whose network posture differs from the default paths — both are scoped explicitly below.

### Default paths (MCP server, CLI)

- **Data touched:** song library files (JSON + MIDI), user song directory (`~/.ai-jam-sessions/songs/`), guitar tuning configs, practice journal entries (JSON), audio output device
- **Data NOT touched:** no cloud APIs, no user credentials, no browsing data, no system files outside the user song directory
- **Network:** MCP server uses stdio transport only (no HTTP listener). The CLI makes no network calls. MIDI output is local device only.
- **File writes:** user songs, guitar tunings, and practice journal entries — all to `~/.ai-jam-sessions/`
- **No telemetry** is collected or sent
- **No secrets handling** — the server and CLI do not read, store, or transmit credentials

### Opt-in dataset/eval tooling (never runs unless you invoke it)

- `scripts/run-llm-eval.ts` (and the eval backends under `src/dataset/eval/llm-backends/`, compiled into `dist/`) can call LLM APIs when you explicitly run an eval: the Anthropic backend reads `ANTHROPIC_API_KEY` from your environment (never logged, never written to disk); the Ollama backends make HTTP calls to your configured Ollama host.
- `src/dataset/provenance-url-verifier.ts` fetches a fixed allowlist of piano-midi.de URLs when you run a provenance audit.
- None of this executes as part of the MCP server, the CLI, install, or tests.
