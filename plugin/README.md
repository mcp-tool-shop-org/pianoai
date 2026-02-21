# AI Jam Session — Claude Code Plugin

Claude Code plugin that wraps the [AI Jam Session](https://github.com/mcp-tool-shop-org/ai_jam_sessions)
MCP server, adding slash commands, agent personalities, and structured
teaching and jam session workflows.

## What You Get

| Component | Name | Description |
|-----------|------|-------------|
| Skill | `/ai-jam-sessions:teach` | Start a teaching session for a song |
| Skill | `/ai-jam-sessions:practice` | Get a personalized practice plan |
| Skill | `/ai-jam-sessions:explore` | Browse and discover songs |
| Skill | `/ai-jam-sessions:jam` | Start a jam session — improvise on a song or genre |
| Agent | `piano-teacher` | Patient AI piano teacher persona |
| Agent | `jam-musician` | Laid-back jam band musician persona |
| MCP Server | `ai_jam_sessions` | 15 tools for playback, teaching, jamming, and song management |

## Install

### Local testing (from the repo)

```bash
claude --plugin-dir ./plugin
```

### From npm

The MCP server is available as `@mcptoolshop/ai-jam-sessions` on npm. The plugin
uses `npx -y -p @mcptoolshop/ai-jam-sessions ai-jam-sessions-mcp` to auto-fetch and run it.

## Usage Examples

```
/ai-jam-sessions:explore jazz
/ai-jam-sessions:teach moonlight-sonata-mvt1
/ai-jam-sessions:practice let-it-be beginner
/ai-jam-sessions:jam autumn-leaves as blues
/ai-jam-sessions:jam jazz
```

Or just talk naturally:

```
I want to learn a beginner jazz song on piano.
Help me practice Fur Elise at half speed.
Let's jam on some blues.
```

The piano-teacher agent activates for learning conversations.
The jam-musician agent activates for improvisation and jam sessions.

## License

MIT
