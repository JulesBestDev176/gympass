# syntax=docker/dockerfile:1.7

FROM node:20-bookworm-slim AS base

WORKDIR /app

RUN --mount=type=cache,id=gympass-apt-lists,target=/var/lib/apt/lists,sharing=locked \
    --mount=type=cache,id=gympass-apt-cache,target=/var/cache/apt,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl openssl \
    && rm -rf /var/lib/apt/lists/*

ENV npm_config_audit=false \
    npm_config_fund=false \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000

FROM base AS deps

COPY package*.json ./
COPY prisma ./prisma/
# Force NODE_ENV=development so devDependencies (nestjs/cli, typescript) are installed
RUN NODE_ENV=development npm ci --prefer-offline --no-audit --no-fund --max-sockets=1

FROM deps AS builder

COPY . .

RUN npx prisma generate
# Force development mode for nest build
RUN NODE_ENV=development npm run build

FROM deps AS production-deps

RUN NODE_ENV=production npm prune --omit=dev

FROM base AS runtime

ENV NODE_ENV=production \
    NODE_OPTIONS=--max-old-space-size=512 \
    PORT=3000

COPY package*.json ./
COPY prisma ./prisma/
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=deps /app/node_modules/prisma ./node_modules/prisma
COPY --from=deps /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --from=deps /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client

RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
    && chmod +x /usr/local/bin/docker-entrypoint.sh \
    && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT:-3000}/api/v1/health" >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/main"]
