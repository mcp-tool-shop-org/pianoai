# AI Jam Session — lightweight production image
# Runs the MCP server (stdio) or CLI with built-in audio engine
#
# Build:  docker build -t ai-jam-sessions .
# MCP:    docker run --rm -i ai-jam-sessions
# CLI:    docker run --rm ai-jam-sessions ai-jam-sessions list
# Play:   docker run --rm --device /dev/snd ai-jam-sessions ai-jam-sessions play song.mid

FROM node:22-slim AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

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

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist/ dist/
COPY logo.svg README.md LICENSE ./

# Default: run MCP server (stdio transport)
ENTRYPOINT ["node", "dist/mcp-server.js"]
