# AI Jam Session — lightweight production image
# Runs the MCP server (stdio) or CLI with built-in audio engine
#
# ENTRYPOINT is hardcoded to the MCP server, so the CLI/Play modes below
# override it with `--entrypoint node` and invoke dist/cli.js directly —
# passing args after the image name without that override would just
# append them to the MCP server's argv instead of running the CLI.
#
# Build:  docker build -t ai-jam-sessions .
# MCP:    docker run --rm -i ai-jam-sessions
# CLI:    docker run --rm --entrypoint node ai-jam-sessions dist/cli.js list
# Play:   docker run --rm --device /dev/snd --entrypoint node ai-jam-sessions dist/cli.js play song.mid

FROM node:22-slim AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm i -g pnpm@9.15.9 && pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ src/

RUN pnpm build

# --- Production stage ---
FROM node:22-slim

# node-web-audio-api needs ALSA for audio output
RUN apt-get update && apt-get install -y --no-install-recommends \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

LABEL org.opencontainers.image.title="AI Jam Session"
LABEL org.opencontainers.image.description="AI piano player with built-in audio engine — MCP server + CLI"
LABEL org.opencontainers.image.source="https://github.com/mcp-tool-shop-org/ai-jam-sessions"
LABEL org.opencontainers.image.license="MIT"

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm i -g pnpm@9.15.9 && pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist/ dist/
COPY songs/library/ songs/library/
COPY samples/vocal/ samples/vocal/
COPY logo.png README.md LICENSE ./

USER node

# Default: run MCP server (stdio transport)
ENTRYPOINT ["node", "dist/mcp-server.js"]
