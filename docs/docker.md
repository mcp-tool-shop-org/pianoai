# Running AI Jam Sessions in Docker

The release workflow publishes an image on every release:

```
ghcr.io/mcp-tool-shop-org/ai-jam-sessions:<version>   # also :latest
```

It is a slim Node 22 image that runs the MCP server on stdio as an unprivileged user. Nothing in it
needs a GPU, Python or a model download. Measured on 2026-09-09: the CI build takes about 25 s and
the container answers `stats` in under a second.

## The one thing to know: `/data` is the memory

Everything the server keeps is under one directory: the practice journal, the server state, user
songs, guitar and piano tunings, and any MIDI you fetch. In the image that directory is `/data`
(`AI_JAM_HOME=/data`, declared as a volume). Mount something there or the journal dies with the
container.

```bash
docker volume create ai-jam-data
docker run --rm -i -v ai-jam-data:/data ghcr.io/mcp-tool-shop-org/ai-jam-sessions
```

The same volume survives upgrades: pull the new tag, run with the same `-v`, and the journal is
where you left it. CI proves this on every push that touches the image — a journal entry written
by one container is read back by a second one on the same volume.

## As an MCP server

The entrypoint is the server on stdio, so the container is the command your client runs. For
Claude Desktop or any client that takes a command and arguments:

```json
{
  "mcpServers": {
    "ai-jam-sessions": {
      "command": "docker",
      "args": ["run", "--rm", "-i", "-v", "ai-jam-data:/data", "ghcr.io/mcp-tool-shop-org/ai-jam-sessions"]
    }
  }
}
```

`-i` keeps stdin open; without it the server sees EOF and exits. Do not add `-t`.

## The CLI inside the image

The entrypoint is hardcoded to the server, so CLI commands override it:

```bash
docker run --rm -v ai-jam-data:/data --entrypoint node ghcr.io/mcp-tool-shop-org/ai-jam-sessions dist/cli.js stats
```

A fresh container reports 14 songs loaded and 94 not fetched. Those 14 are the songs whose
arrangements carry a licence that permits redistribution; the other 94 ship as annotations only,
and their MIDI is fetched from the site that published each one, under that site's terms:

```bash
docker run --rm -v ai-jam-data:/data --entrypoint node ghcr.io/mcp-tool-shop-org/ai-jam-sessions dist/cli.js library fetch --accept-source-terms
```

Inside the image the package library is read-only, so the fetch writes into
`/data/songs/library/<genre>/` and says so once; the loader reads from there. Run it once per
volume, not once per container. Every fetched file is checked against the SHA-256 the annotations
were verified against and refused if it no longer matches.

Audio output from a container needs the host's sound device and only works on Linux:

```bash
docker run --rm --device /dev/snd -v ai-jam-data:/data --entrypoint node ghcr.io/mcp-tool-shop-org/ai-jam-sessions dist/cli.js play fur-elise
```

## Compose

`docker-compose.yml` at the repository root starts the server with a named volume:

```bash
docker compose up
```

It also carries an `ollama` profile, off by default, that adds an Ollama sidecar with its own
volume, bound to `127.0.0.1:11434`, and hands the server `OLLAMA_HOST=http://ollama:11434` on the
compose network:

```bash
docker compose --profile ollama up
```

The server does not need Ollama for anything it does today; grading is deterministic signal
processing. The sidecar is there for the compose panel's judge and for anyone running the
fine-tuned graders described in [ollama-adapters.md](ollama-adapters.md). Pull models into the
sidecar with `docker compose exec ollama ollama pull <name>`.

## Building it yourself

```bash
docker build -t ai-jam-sessions .
```

The build copies only what the server needs: the built `dist/`, the 14 redistributable MIDI files
with every song's annotations, the vocal samples, and the licence. Experiments, datasets, the site
and the quarantined files are excluded by `.dockerignore`.

## What is not in the image

- The 94 non-redistributable MIDI files (fetch them into the volume, see above).
- Any model, adapter, Python or GPU library. The LoRA adapters live on Hugging Face and run in
  Ollama or any PEFT runtime beside the container, not inside it.
- The browser cockpit's dev server; the image is the MCP server and CLI.
