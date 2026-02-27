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

This is an audio synthesis MCP server and CLI tool that runs locally.

- **Data touched:** song library files (JSON + MIDI), user song directory (`~/.ai-jam-sessions/songs/`), guitar tuning configs, practice journal entries (JSON), audio output device
- **Data NOT touched:** no cloud APIs, no user credentials, no browsing data, no system files outside the user song directory
- **Network:** MCP server uses stdio transport only (no HTTP listener). CLI has no network access. MIDI output is local device only.
- **File writes:** user songs, guitar tunings, and practice journal entries — all to `~/.ai-jam-sessions/`
- **No telemetry** is collected or sent
- **No secrets handling** — does not read, store, or transmit credentials
